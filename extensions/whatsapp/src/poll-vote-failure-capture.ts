// Keeps the raw form of a poll vote that could not be decrypted, in private files under the state dir.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getOptionalWhatsAppRuntime } from "./runtime.js";

export const WHATSAPP_POLL_VOTE_FAILURE_MAX_FILES = 20;

export type WhatsAppPollVoteCapturedBytes = {
  type: string;
  length: number;
  /** Base64 for byte arrays; the value as received for anything else. */
  value: unknown;
};

/** Never holds the poll secret or option names; the vote stays encrypted. */
export type WhatsAppPollVoteFailureCapture = {
  v: 1;
  capturedAt: number;
  accountId: string;
  pollMessageId: string;
  /** The vote message key as received, including addressingMode and the Alt JIDs. */
  key: unknown;
  /** The poll update without its vote: pollCreationMessageKey, metadata, senderTimestampMs. */
  update: unknown;
  encPayload: WhatsAppPollVoteCapturedBytes;
  encIv: WhatsAppPollVoteCapturedBytes;
  messageTimestamp: unknown;
  creatorJids: string[];
  voterJids: string[];
};

export function describeWhatsAppPollVoteBytes(value: unknown): WhatsAppPollVoteCapturedBytes {
  if (value instanceof Uint8Array) {
    return {
      type: Buffer.isBuffer(value) ? "Buffer" : "Uint8Array",
      length: value.length,
      value: Buffer.from(value).toString("base64"),
    };
  }
  if (typeof value === "string") {
    return { type: "string", length: value.length, value };
  }
  return { type: value === null ? "null" : typeof value, length: 0, value: value ?? null };
}

export function resolveWhatsAppPollVoteFailureDir(stateDir: string): string {
  return path.join(stateDir, "whatsapp", "poll-vote-failures");
}

async function removeOldestCaptures(dir: string): Promise<void> {
  const captures = (await fs.readdir(dir)).filter((name) => name.endsWith(".json")).toSorted();
  const excess = captures.slice(
    0,
    Math.max(0, captures.length - WHATSAPP_POLL_VOTE_FAILURE_MAX_FILES),
  );
  for (const name of excess) {
    await fs.rm(path.join(dir, name), { force: true });
  }
}

/** Returns the written file path, or undefined when no state dir is available. */
export async function saveWhatsAppPollVoteFailure(
  capture: WhatsAppPollVoteFailureCapture,
): Promise<string | undefined> {
  const stateDir = getOptionalWhatsAppRuntime()?.state?.resolveStateDir();
  if (!stateDir) {
    return undefined;
  }
  const dir = resolveWhatsAppPollVoteFailureDir(stateDir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const fileName = `${capture.capturedAt}-${capture.pollMessageId}-${randomUUID().slice(0, 8)}.json`;
  const filePath = path.join(dir, fileName);
  // A failed write (disk full) leaves no truncated capture: only a complete file gets its .json name.
  const tempPath = path.join(dir, `.${fileName}.tmp`);
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(capture, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
  // The file is saved either way; a prune that fails now is retried on the next capture.
  await removeOldestCaptures(dir).catch(() => undefined);
  return filePath;
}

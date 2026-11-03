import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPluginRuntimeMock } from "openclaw/plugin-sdk/channel-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeWhatsAppPollVoteBytes,
  resolveWhatsAppPollVoteFailureDir,
  saveWhatsAppPollVoteFailure,
  WHATSAPP_POLL_VOTE_FAILURE_MAX_FILES,
  type WhatsAppPollVoteFailureCapture,
} from "./poll-vote-failure-capture.js";
import { setWhatsAppRuntime } from "./runtime.js";

let stateDir: string;

function capture(capturedAt: number): WhatsAppPollVoteFailureCapture {
  return {
    v: 1,
    capturedAt,
    accountId: "default",
    pollMessageId: "POLL1",
    key: { id: "VOTE1", remoteJid: "11110000002@lid", fromMe: false },
    update: {
      pollCreationMessageKey: { id: "POLL1", remoteJid: "11110000002@lid" },
      senderTimestampMs: 1_760_000_000_000,
    },
    encPayload: describeWhatsAppPollVoteBytes(Buffer.from([1, 2, 3])),
    encIv: describeWhatsAppPollVoteBytes(Buffer.from([4, 5])),
    messageTimestamp: 1_760_000_000,
    creatorJids: ["15550000001@s.whatsapp.net"],
    voterJids: ["11110000002@lid"],
  };
}

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "whatsapp-poll-vote-failures-"));
  setWhatsAppRuntime(createPluginRuntimeMock({ state: { resolveStateDir: () => stateDir } }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("describeWhatsAppPollVoteBytes", () => {
  it("keeps the received type next to the value", () => {
    expect(describeWhatsAppPollVoteBytes(Buffer.from([1, 2, 3]))).toEqual({
      type: "Buffer",
      length: 3,
      value: "AQID",
    });
    expect(describeWhatsAppPollVoteBytes(new Uint8Array([1, 2, 3]))).toMatchObject({
      type: "Uint8Array",
      value: "AQID",
    });
    expect(describeWhatsAppPollVoteBytes("AQID")).toEqual({
      type: "string",
      length: 4,
      value: "AQID",
    });
    expect(describeWhatsAppPollVoteBytes({ type: "Buffer", data: [1] })).toEqual({
      type: "object",
      length: 0,
      value: { type: "Buffer", data: [1] },
    });
    expect(describeWhatsAppPollVoteBytes(undefined)).toEqual({
      type: "undefined",
      length: 0,
      value: null,
    });
  });
});

describe("saveWhatsAppPollVoteFailure", () => {
  it("writes one private JSON file per failure", async () => {
    const filePath = await saveWhatsAppPollVoteFailure(capture(1_760_000_000_000));
    expect(path.dirname(filePath ?? "")).toBe(resolveWhatsAppPollVoteFailureDir(stateDir));
    expect((await fs.stat(filePath ?? "")).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await fs.readFile(filePath ?? "", "utf8"))).toEqual(
      capture(1_760_000_000_000),
    );
  });

  it("keeps only the newest files", async () => {
    const total = WHATSAPP_POLL_VOTE_FAILURE_MAX_FILES + 3;
    for (let index = 0; index < total; index += 1) {
      await saveWhatsAppPollVoteFailure(capture(1_760_000_000_000 + index));
    }
    const files = (await fs.readdir(resolveWhatsAppPollVoteFailureDir(stateDir))).toSorted();
    expect(files).toHaveLength(WHATSAPP_POLL_VOTE_FAILURE_MAX_FILES);
    expect(files[0]?.startsWith("1760000000003-")).toBe(true);
  });

  it("returns the saved file when pruning old files fails", async () => {
    const readdir = vi
      .spyOn(fs, "readdir")
      .mockRejectedValueOnce(Object.assign(new Error("EIO"), { code: "EIO" }));
    const filePath = await saveWhatsAppPollVoteFailure(capture(1_760_000_000_000));
    expect(readdir).toHaveBeenCalledOnce();
    expect(JSON.parse(await fs.readFile(filePath ?? "", "utf8"))).toEqual(
      capture(1_760_000_000_000),
    );
  });

  it("leaves no partial file when the write fails", async () => {
    const writeFile = fs.writeFile.bind(fs);
    vi.spyOn(fs, "writeFile").mockImplementationOnce(async (file, data, options) => {
      await writeFile(file, String(data).slice(0, 10), options);
      throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" });
    });
    await expect(saveWhatsAppPollVoteFailure(capture(1_760_000_000_000))).rejects.toMatchObject({
      code: "ENOSPC",
    });
    expect(await fs.readdir(resolveWhatsAppPollVoteFailureDir(stateDir))).toEqual([]);
  });
});

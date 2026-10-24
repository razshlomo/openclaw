import fs from "node:fs";
import type { WAMessage } from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppSelfIdentity } from "../identity.js";
import {
  describeWhatsAppPollVoteBytes,
  type WhatsAppPollVoteCapturedBytes,
  type WhatsAppPollVoteFailureCapture,
} from "../poll-vote-failure-capture.js";
import {
  readWhatsAppPollRecord,
  recordWhatsAppPoll,
  type WhatsAppPollRecord,
} from "../poll-vote-store.js";
import { readWhatsAppPollTally } from "../poll-vote-tally-store.js";
import {
  encryptWhatsAppPollVoteForTest,
  installWhatsAppPollStateRuntimeForTest,
  type WhatsAppPollStateRuntimeForTest,
} from "../poll-vote.test-helper.js";
import { resolveWhatsAppPollVote } from "./poll-vote-inbound.js";

type RealPollVoteFixture = {
  name: string;
  self: WhatsAppSelfIdentity;
  record: WhatsAppPollRecord;
  capture: WhatsAppPollVoteFailureCapture;
  expectedSelected: string[];
};

const FIXTURE_DIR = new URL("../__fixtures__/poll-votes/", import.meta.url);

function buildSyntheticFixture(): RealPollVoteFixture {
  const self = { jid: "15550000001@s.whatsapp.net", lid: "77770000001@lid" };
  const voterLid = "88880002222@lid";
  const voterPn = "15550002222@s.whatsapp.net";
  const secret = Buffer.alloc(32, 7);
  const vote = encryptWhatsAppPollVoteForTest({
    secret,
    pollMsgId: "POLL1",
    pollCreatorJid: self.lid,
    voterJid: voterLid,
    selectedOptions: ["Sushi"],
  });
  return {
    name: "a synthetic LID vote (replay harness check)",
    self,
    record: {
      v: 2,
      owner: {},
      origin: "sent",
      chatJids: [voterLid, voterPn],
      creatorJids: [self.jid, self.lid],
      question: "Pizza or sushi?",
      secret: secret.toString("base64"),
      options: ["Pizza", "Sushi"],
      selectableCount: 1,
      recordedAt: 1,
    },
    capture: {
      v: 1,
      capturedAt: 1,
      accountId: "default",
      pollMessageId: "POLL1",
      key: { id: "VOTE1", remoteJid: voterLid, remoteJidAlt: voterPn, fromMe: false },
      pollCreationKey: { id: "POLL1", remoteJid: voterLid, fromMe: true },
      encPayload: describeWhatsAppPollVoteBytes(vote.encPayload),
      encIv: describeWhatsAppPollVoteBytes(vote.encIv),
      senderTimestampMs: 1_760_000_000_000,
      messageTimestamp: 1_760_000_000,
      creatorJids: [],
      voterJids: [],
    },
    expectedSelected: ["Sushi"],
  };
}

const fixtures: RealPollVoteFixture[] = [
  buildSyntheticFixture(),
  ...fs
    .readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .map((name) => JSON.parse(fs.readFileSync(new URL(name, FIXTURE_DIR), "utf8"))),
];

function restoreBytes(captured: WhatsAppPollVoteCapturedBytes): unknown {
  return captured.type === "Buffer" || captured.type === "Uint8Array"
    ? Buffer.from(captured.value as string, "base64")
    : captured.value;
}

function rebuildVoteMessage(capture: WhatsAppPollVoteFailureCapture): WAMessage {
  return {
    key: capture.key,
    message: {
      pollUpdateMessage: {
        pollCreationMessageKey: capture.pollCreationKey,
        vote: { encPayload: restoreBytes(capture.encPayload), encIv: restoreBytes(capture.encIv) },
        senderTimestampMs: capture.senderTimestampMs,
      },
    },
    messageTimestamp: capture.messageTimestamp,
  } as unknown as WAMessage;
}

let env: WhatsAppPollStateRuntimeForTest;

beforeEach(async () => {
  env = await installWhatsAppPollStateRuntimeForTest();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await env.cleanup();
});

describe("real WhatsApp poll votes", () => {
  it.each(fixtures)("decodes $name", async (fixture) => {
    const account = { accountId: fixture.capture.accountId, self: fixture.self };
    const pollMessageId = fixture.capture.pollMessageId;
    await recordWhatsAppPoll(
      {
        account,
        pollMessageId,
        origin: fixture.record.origin,
        chatJids: fixture.record.chatJids,
        creatorJids: fixture.record.creatorJids,
        question: fixture.record.question,
        secret: Buffer.from(fixture.record.secret, "base64"),
        options: fixture.record.options,
        selectableCount: fixture.record.selectableCount,
      },
      { mode: "overwrite" },
    );
    await resolveWhatsAppPollVote(rebuildVoteMessage(fixture.capture), account);
    expect(env.logger.warn).not.toHaveBeenCalled();
    const record = await readWhatsAppPollRecord(account, pollMessageId);
    expect(record).toBeDefined();
    const voters = await readWhatsAppPollTally({
      record: record as WhatsAppPollRecord,
      account,
      pollMessageId,
    });
    expect(voters?.map((voter) => voter.selected)).toEqual([fixture.expectedSelected]);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BotStore } from "../src/store.mjs";
import { assessReplyCandidate, runApprovedXReplyCycle } from "../src/x-replies.mjs";

const now = new Date("2026-10-04T12:00:00.000Z");
const base = {
  id: "100",
  text: "@STOPAICOIN What is your plan?",
  createdAt: "2026-10-04T11:00:00.000Z",
  author: { id: "20", username: "member", createdAt: "2025-01-01T00:00:00.000Z", metrics: { followers_count: 10 } },
  references: []
};
const options = { ownUserId: "10", ownUsername: "STOPAICOIN", now };

test("reply intake accepts direct mentions and replies to our posts", () => {
  assert.equal(assessReplyCandidate(base, options).eligible, true);
  assert.equal(assessReplyCandidate(base, options).autoEligible, true);
  assert.equal(assessReplyCandidate({ ...base, text: "@STOPAICOIN has a new post" }, options).autoEligible, false);
  const reply = { ...base, text: "What is your plan?", references: [{ type: "replied_to", id: "90" }] };
  assert.equal(assessReplyCandidate(reply, {
    ...options,
    parentPost: { id: "90", author: { id: "10" } }
  }).eligible, true);
  assert.equal(assessReplyCandidate(reply, {
    ...options,
    parentPost: { id: "90", author: { id: "10" } }
  }).autoEligible, true);
  assert.equal(assessReplyCandidate(reply, {
    ...options,
    parentPost: { id: "90", author: { id: "30" } }
  }).eligible, false);
  assert.equal(assessReplyCandidate({ ...base, text: "hello world" }, options).eligible, false);
});

test("reply intake filters spam, sensitive posts, stale posts, and opt-outs", () => {
  assert.equal(assessReplyCandidate({ ...base, text: "@STOPAICOIN STOP" }, options).optOut, true);
  assert.equal(assessReplyCandidate({ ...base, text: "@STOPAICOIN get an airdrop https://scam.test" }, options).reason, "spam_signals");
  assert.equal(assessReplyCandidate({ ...base, possiblySensitive: true }, options).eligible, false);
  assert.equal(assessReplyCandidate({ ...base, createdAt: "2026-09-25T11:00:00.000Z" }, options).reason, "stale_post");
  assert.equal(assessReplyCandidate({ ...base, author: { ...base.author, id: "10" } }, options).eligible, false);
  assert.equal(assessReplyCandidate({ ...base, text: "@STOPAICOIN @other hello" }, options).eligible, false);
  assert.equal(assessReplyCandidate({
    ...base,
    author: { ...base.author, createdAt: "2026-10-04T00:00:00.000Z", metrics: { followers_count: 0 } }
  }, options).reason, "new_low_reach_account");
});

test("approved AI cycle replies once, records opt-out, and flags spam for review", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-auto-replies-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new BotStore(path.join(directory, "bot.json"), { now: () => now });
  const posts = [
    base,
    { ...base, id: "102", text: "@STOPAICOIN STOP", author: { ...base.author, id: "22" } },
    { ...base, id: "103", text: "What about this?", author: { ...base.author, id: "30" }, references: [{ type: "replied_to", id: "90" }] }
  ];
  const sent = [];
  let reviews = 0;
  let mentionsRead = 0;
  const xClient = {
    connected: async () => true,
    mentions: async () => { mentionsRead += 1; return posts; },
    followerIds: async () => new Set(["20", "30"]),
    readPost: async (id) => id === "90"
      ? { id: "90", author: { id: "10" } }
      : posts.find((item) => item.id === id),
    reply: async (reply) => {
      sent.push(reply);
      return { id: "200", url: "https://x.com/STOPAICOIN/status/200" };
    }
  };
  const openRouter = {
    connected: async () => true,
    chat: async () => {
      reviews += 1;
      return { text: JSON.stringify(reviews === 1
        ? { decision: "reply", draft: "We want a slower AI race and clear public oversight." }
        : { decision: "report_spam", draft: "" }), costUsd: 0.001 };
    }
  };
  const config = {
    xMaxPostCharacters: 280,
    chatHourlyCap: 10,
    chatDailyCap: 30,
    chatUserHourlyCap: 10,
    chatUserDailyCap: 30
  };
  const input = { enabled: true, approvalReference: "X-written-123", xClient, store, openRouter,
    user: { id: "10", username: "STOPAICOIN" }, config, now };
  const result = await runApprovedXReplyCycle(input);
  assert.equal(result.sent, 1);
  assert.equal(result.flagged, 1);
  assert.equal(result.optedOut, 1);
  assert.equal(sent[0].replyToId, "100");
  assert.match(sent[0].text, /Reply STOP to opt out/);
  assert.equal(store.listXReplies().find((item) => item.id === "100").status, "sent");
  assert.equal(store.listXReplies().find((item) => item.id === "103").reviewDecision, "report_spam");
  assert.equal(store.xReplyOptedOut("22"), true);
  await runApprovedXReplyCycle(input);
  assert.equal(sent.length, 1);
  assert.equal(reviews, 2);
  const gated = await runApprovedXReplyCycle({ ...input, approvalReference: "" });
  assert.equal(gated.skipped, "written_approval_required");
  assert.equal((await runApprovedXReplyCycle({ ...input, enabled: false })).skipped,
    "written_approval_required");
  assert.equal(mentionsRead, 2);
});

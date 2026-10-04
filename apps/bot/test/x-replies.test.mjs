import assert from "node:assert/strict";
import test from "node:test";

import { assessReplyCandidate } from "../src/x-replies.mjs";

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
  const reply = { ...base, text: "What is your plan?", references: [{ type: "replied_to", id: "90" }] };
  assert.equal(assessReplyCandidate(reply, {
    ...options,
    parentPost: { id: "90", author: { id: "10" } }
  }).eligible, true);
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

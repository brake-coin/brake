import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BotStore } from "../src/store.mjs";

test("store applies global and per-user limits atomically", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-bot-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-08-22T10:00:00.000Z");
  const filePath = path.join(directory, "bot.json");
  const store = new BotStore(filePath, { now: () => now });
  const limits = { hourly: 2, daily: 4, userHourly: 1, userDaily: 2 };

  assert.equal((await store.claimUsage("image", "alice", limits)).allowed, true);
  assert.equal((await store.claimUsage("image", "alice", limits)).reason, "userHourly_cap");
  assert.equal((await store.claimUsage("image", "bob", limits)).allowed, true);
  assert.equal((await store.claimUsage("image", "carol", limits)).reason, "hourly_cap");

  now = new Date("2026-08-22T11:00:00.000Z");
  assert.equal((await store.claimUsage("image", "alice", limits)).allowed, true);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
});

test("store enforces global and per-user posting cooldowns", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-x-cooldown-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-08-22T10:00:00.000Z");
  const store = new BotStore(path.join(directory, "bot.json"), { now: () => now });
  const limits = { hourly: 10, daily: 20, userHourly: 5, userDaily: 10 };
  const cooldowns = { globalCooldownMs: 5 * 60_000, userCooldownMs: 15 * 60_000 };

  const first = await store.claimUsage("x_post", "alice", limits, cooldowns);
  assert.equal(first.allowed, true);
  assert.equal(await store.releaseUsage(first.eventId), true);
  assert.equal((await store.claimUsage("x_post", "alice", limits, cooldowns)).allowed, true);
  now = new Date("2026-08-22T10:04:00.000Z");
  assert.equal((await store.claimUsage("x_post", "bob", limits, cooldowns)).reason, "global_cooldown");
  now = new Date("2026-08-22T10:06:00.000Z");
  assert.equal((await store.claimUsage("x_post", "alice", limits, cooldowns)).reason, "user_cooldown");
  assert.equal((await store.claimUsage("x_post", "bob", limits, cooldowns)).allowed, true);
  now = new Date("2026-08-22T10:16:00.000Z");
  assert.equal((await store.claimUsage("x_post", "alice", limits, cooldowns)).allowed, true);
});

test("manual and autonomous X posts share the public-account cooldown", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-shared-x-cooldown-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-08-22T10:00:00.000Z");
  const store = new BotStore(path.join(directory, "bot.json"), { now: () => now });
  const limits = { hourly: 10, daily: 10, userHourly: 10, userDaily: 10 };
  assert.equal((await store.claimUsage("x_post", "alice", limits)).allowed, true);
  now = new Date("2026-08-22T10:10:00.000Z");
  const autonomous = await store.claimUsage("x_auto", "agent", limits, {
    globalCooldownMs: 4 * 60 * 60 * 1_000,
    globalCooldownTypes: ["x_post"]
  });
  assert.equal(autonomous.allowed, false);
  assert.equal(autonomous.reason, "global_cooldown");
  now = new Date("2026-08-22T14:01:00.000Z");
  assert.equal((await store.claimUsage("x_auto", "agent", limits, {
    globalCooldownMs: 4 * 60 * 60 * 1_000,
    globalCooldownTypes: ["x_post"]
  })).allowed, true);
});

test("store atomically prevents duplicate X source posts", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-source-claims-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new BotStore(path.join(directory, "bot.json"), {
    now: () => new Date("2026-08-22T10:00:00.000Z")
  });
  const source = {
    sourcePostId: "2091410624970711451",
    sourcePostUrl: "https://x.com/canadabirdie/status/2091410624970711451"
  };
  const [first, second] = await Promise.all([
    store.claimXSourcePost({ ...source, userId: "alice" }),
    store.claimXSourcePost({ ...source, userId: "bob" })
  ]);
  assert.equal([first, second].filter((claim) => claim.allowed).length, 1);
  assert.equal([first, second].find((claim) => !claim.allowed).reason, "source_post_in_progress");
  const winner = first.allowed ? first : second;
  await store.confirmXSourcePost(winner.claimId, {
    postedId: "300",
    postedUrl: "https://x.com/STOPAICOIN/status/300"
  });
  const duplicate = await store.claimXSourcePost(source);
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.reason, "source_already_posted");
  assert.equal(duplicate.record.postedUrl, "https://x.com/STOPAICOIN/status/300");
  assert.equal(store.agentStatus().quotedSourceCount, 1);
});

test("uncertain X source outcomes stay blocked but clean failures can retry", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-source-uncertain-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new BotStore(path.join(directory, "bot.json"));
  const first = await store.claimXSourcePost({ sourcePostId: "800" });
  await store.releaseXSourcePost(first.claimId);
  assert.equal((await store.claimXSourcePost({ sourcePostId: "800" })).allowed, true);

  const uncertain = await store.claimXSourcePost({ sourcePostId: "900" });
  await store.releaseXSourcePost(uncertain.claimId, {
    uncertainPostId: "901",
    uncertainPostUrl: "https://x.com/i/web/status/901"
  });
  const blocked = await store.claimXSourcePost({ sourcePostId: "900" });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "source_post_status_uncertain");
  assert.equal(store.agentStatus().uncertainSourceCount, 1);
});

test("store remembers Telegram media IDs without media bytes", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-bot-media-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new BotStore(path.join(directory, "bot.json"));
  await store.recordMedia({
    chatId: "42",
    userId: "7",
    type: "video",
    fileId: "telegram-file-id",
    caption: "BYOK clip"
  });
  assert.equal(store.latestMedia("42").fileId, "telegram-file-id");
  assert.equal(store.latestMedia("42").type, "video");
  assert.equal(store.findMediaByFileId("42", "telegram-file-id").caption, "BYOK clip");
  assert.equal(store.findMediaByFileId("99", "telegram-file-id"), null);
});

test("store manages chat-scoped galleries", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-bot-gallery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new BotStore(path.join(directory, "bot.json"));
  const first = await store.recordMedia({
    chatId: "42", userId: "7", type: "image", fileId: "image-1", caption: "timeout poster"
  });
  await store.recordMedia({
    chatId: "99", userId: "7", type: "video", fileId: "video-other", caption: "other chat"
  });
  assert.equal(store.listMedia("42").length, 1);
  assert.equal(store.findMedia("42", first.id.slice(0, 8)).fileId, "image-1");
  assert.equal(store.findMedia("42", "timeout").id, first.id);

  assert.equal((await store.removeMedia({ chatId: "42", mediaId: first.id })).id, first.id);
  assert.equal(store.listMedia("42").length, 0);
});

test("store persists campaign goals, memory, research use, and cycle history", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-agent-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "bot.json");
  const store = new BotStore(filePath, { now: () => new Date("2026-08-22T20:00:00.000Z") });
  await store.ensureAgentGoals([{ id: "educate", text: "Educate peacefully", priority: 5 }]);
  await store.rememberAgent({ kind: "lesson", text: "Use source links", topic: "trust" });
  await store.recordResearch([{
    key: "x:123",
    kind: "x",
    title: "A sourced post",
    url: "https://x.com/example/status/123",
    score: 7
  }]);
  await store.markResearchUsed("x:123", { postedUrl: "https://x.com/STOPAICOIN/status/456" });
  await store.recordAgentCycle({ ok: true, action: "post", sourceKey: "x:123", url: "https://x.com/STOPAICOIN/status/456" });
  await store.recordXReceipt({
    status: "confirmed",
    id: "456",
    url: "https://x.com/STOPAICOIN/status/456",
    source: "telegram",
    userId: "7",
    chatId: "42",
    text: "A verified post"
  });

  const reloaded = await new BotStore(filePath).load();
  const snapshot = reloaded.agentSnapshot();
  assert.equal(snapshot.goals[0].id, "educate");
  assert.equal(snapshot.memories[0].text, "Use source links");
  assert.equal(snapshot.research[0].usedAt, "2026-08-22T20:00:00.000Z");
  assert.equal(snapshot.cycles[0].action, "post");
  assert.equal(reloaded.recentXReceipts()[0].status, "confirmed");
  assert.equal(reloaded.recentXReceipts()[0].id, "456");
  assert.equal(reloaded.agentStatus().quotedSourceCount, 1);
  assert.equal((await reloaded.claimXSourcePost({ sourcePostId: "123" })).reason, "source_already_posted");
});

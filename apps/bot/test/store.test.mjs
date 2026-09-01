import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBotConfig } from "../src/config.mjs";
import { buildAgentResourceStatus } from "../src/resources.mjs";
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

test("store suppresses duplicate Telegram actions across concurrency and restarts", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-telegram-updates-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "bot.json");
  const store = new BotStore(filePath, { now: () => new Date("2026-08-23T20:00:00.000Z") });
  const claims = await Promise.all([
    store.claimTelegramUpdate(123456),
    store.claimTelegramUpdate(123456)
  ]);
  assert.equal(claims.filter((claim) => claim.allowed).length, 1);
  assert.equal(claims.find((claim) => !claim.allowed).reason, "duplicate_update");
  const reloaded = await new BotStore(filePath, {
    now: () => new Date("2026-08-23T20:01:00.000Z")
  }).load();
  assert.equal((await reloaded.claimTelegramUpdate(123456)).allowed, false);
  assert.equal(reloaded.agentStatus().recentTelegramUpdateCount, 1);
  assert.equal((await reloaded.claimTelegramUpdate(undefined)).reason, "untracked_update");
});

test("version 10 preserves production state and cleans leaked participant labels", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-v10-migration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "bot.json");
  await writeFile(filePath, JSON.stringify({
    version: 7,
    messages: {
      42: [{
        role: "assistant",
        content: "Current member asked another Current member question.",
        userId: "700000001",
        threadId: "main",
        at: "2026-08-23T19:57:00.000Z"
      }]
    },
    media: [],
    usage: [],
    telegramUpdates: {
      555: { updateId: "555", at: "2026-08-23T19:59:00.000Z" }
    },
    xReceipts: [{
      status: "confirmed",
      id: "123",
      url: "https://x.com/STOPAICOIN/status/123",
      source: "autonomous-agent",
      at: "2026-08-23T19:58:00.000Z"
    }],
    xSourcePosts: {},
    stickerPack: {
      name: "stopai_stickers_by_stopaitoken_bot",
      title: "STOPAI Stickers",
      ownerId: 12345,
      stickerCount: 2,
      createdAt: "2026-08-23T19:00:00.000Z"
    },
    agent: { goals: [], memories: [], research: [], cycles: [], cycleSequence: 0 }
  }));
  const store = await new BotStore(filePath, {
    now: () => new Date("2026-08-23T20:00:00.000Z")
  }).load();
  assert.equal(store.agentStatus().recentTelegramUpdateCount, 1);
  assert.equal(store.stickerPack().ownerId, 12345);
  assert.equal(
    store.recentMessages("42")[0].content,
    "the member in that turn asked another the member in that turn question."
  );
  assert.equal((await store.claimTelegramUpdate(555)).reason, "duplicate_update");
  await store.saveStickerPack({
    ...store.stickerPack(),
    stickerCount: 3
  });
  const saved = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(saved.version, 10);
  assert.equal(store.agentStatus().autonomousPostCount, 1);
  assert.equal(saved.telegramUpdates[555].updateId, "555");
  assert.equal(saved.stickerPack.stickerCount, 3);
});

test("chat history is user-attributed, thread-scoped, and expires", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-chat-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-08-01T10:00:00.000Z");
  const store = new BotStore(path.join(directory, "bot.json"), { now: () => now });
  await store.recordMessage({
    chatId: "42", threadId: "main", userId: "alice", role: "user", content: "main topic"
  });
  await store.recordMessage({
    chatId: "42", threadId: "77", userId: "bob", role: "user", content: "forum topic"
  });
  assert.deepEqual(store.recentMessages("42").map((item) => item.userId), ["alice"]);
  assert.deepEqual(store.recentMessages("42", { threadId: "77" }).map((item) => item.userId), ["bob"]);
  assert.deepEqual(
    store.recentMessagesAcrossThreads("42", { excludeThreadId: "77" })
      .map((item) => item.content),
    ["main topic"]
  );
  now = new Date("2026-09-01T10:00:01.000Z");
  await store.recordMessage({
    chatId: "42", threadId: "main", userId: "carol", role: "user", content: "fresh topic"
  });
  assert.deepEqual(store.recentMessages("42").map((item) => item.userId), ["carol"]);
  assert.deepEqual(store.recentMessages("42", { threadId: "77" }), []);
});

test("complete chat turns are saved atomically and the full 20-message window is returned", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-complete-turns-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new BotStore(path.join(directory, "bot.json"), {
    now: () => new Date("2026-08-22T10:00:00.000Z")
  });

  for (let turn = 1; turn <= 11; turn += 1) {
    await store.recordTurn({
      chatId: "42",
      threadId: "77",
      userId: "alice",
      userContent: `question ${turn}`,
      assistantContent: `answer ${turn}`
    });
  }

  const history = store.recentMessages("42", { threadId: "77" });
  assert.equal(history.length, 20);
  assert.deepEqual(history.slice(0, 2).map((item) => item.content), ["question 2", "answer 2"]);
  assert.deepEqual(history.slice(-2).map((item) => item.content), ["question 11", "answer 11"]);
  assert.deepEqual(history.map((item) => item.role), Array.from(
    { length: 20 },
    (_, index) => index % 2 === 0 ? "user" : "assistant"
  ));
});

test("the agent sees scarce shared capacity and whether the current user is new", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-agent-resources-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new BotStore(path.join(directory, "bot.json"), {
    now: () => new Date("2026-08-22T10:00:00.000Z")
  });
  const config = createBotConfig({
    IMAGE_HOURLY_CAP: "3",
    IMAGE_DAILY_CAP: "3",
    IMAGE_USER_HOURLY_CAP: "3",
    IMAGE_USER_DAILY_CAP: "3",
    X_POSTING_ENABLED: "true"
  });
  await store.claimUsage("image", "alice", {
    hourly: 3, daily: 3, userHourly: 3, userDaily: 3
  });
  await store.claimUsage("image", "bob", {
    hourly: 3, daily: 3, userHourly: 3, userDaily: 3
  });

  const repeatUser = buildAgentResourceStatus({ store, config, userId: "alice" });
  const newUser = buildAgentResourceStatus({ store, config, userId: "charlie" });
  assert.equal(repeatUser.image.global.dailyRemaining, 1);
  assert.equal(repeatUser.image.global.distinctUsersToday, 2);
  assert.equal(repeatUser.image.currentUser.isNewToday, false);
  assert.equal(repeatUser.image.scarce, true);
  assert.equal(repeatUser.xResearch.global.dailyRemaining, 1_000);
  assert.equal(newUser.image.currentUser.isNewToday, true);
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

test("store keeps the shared Telegram sticker pack owner across restarts", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-sticker-pack-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "bot.json");
  const store = new BotStore(filePath, { now: () => new Date("2026-08-23T20:00:00.000Z") });
  await store.saveStickerPack({
    name: "stopai_stickers_by_stopaitoken_bot",
    title: "STOPAI Stickers ✋🏻😡",
    ownerId: 12345,
    stickerCount: 2
  });
  await store.recordMedia({
    chatId: "42",
    userId: "7",
    type: "sticker",
    fileId: "sticker-file-id",
    caption: "angry brake hand",
    stickerEmoji: "😡",
    stickerSetName: "stopai_stickers_by_stopaitoken_bot"
  });

  const reloaded = await new BotStore(filePath).load();
  assert.equal(reloaded.stickerPack().ownerId, 12345);
  assert.equal(reloaded.stickerPack().stickerCount, 2);
  assert.equal(reloaded.latestMedia("42", "sticker").stickerEmoji, "😡");
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
  assert.equal(reloaded.agentStatus().autonomousPostCount, 1);
  assert.equal(reloaded.recentXReceipts()[0].status, "confirmed");
  assert.equal(reloaded.recentXReceipts()[0].id, "456");
  assert.equal(reloaded.agentStatus().quotedSourceCount, 1);
  assert.equal((await reloaded.claimXSourcePost({ sourcePostId: "123" })).reason, "source_already_posted");
});

test("default goals refresh stale reserved goals without deleting custom goals", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-agent-goals-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "bot.json");
  await writeFile(filePath, JSON.stringify({
    version: 6,
    agent: {
      goals: [{
        id: "amplify-with-credit",
        text: "Always amplify one named account",
        priority: 5,
        active: true
      }]
    }
  }));
  const loaded = await new BotStore(filePath, {
    now: () => new Date("2026-08-22T10:00:00.000Z")
  }).load();
  await loaded.upsertAgentGoal({ id: "operator-custom", text: "Keep this custom goal", priority: 2 });
  await loaded.ensureAgentGoals([{
    id: "amplify-with-credit",
    text: "Amplify useful public voices with clear attribution.",
    priority: 4
  }]);
  let goals = loaded.agentSnapshot().goals;
  assert.equal(goals.find((goal) => goal.id === "amplify-with-credit").text,
    "Amplify useful public voices with clear attribution.");
  assert.equal(goals.find((goal) => goal.id === "operator-custom").text, "Keep this custom goal");

  await loaded.upsertAgentGoal({
    id: "amplify-with-credit",
    text: "Operator deliberately changed this reserved goal",
    priority: 3
  });
  await loaded.ensureAgentGoals([{
    id: "amplify-with-credit",
    text: "Amplify useful public voices with clear attribution.",
    priority: 4
  }]);
  goals = loaded.agentSnapshot().goals;
  assert.equal(goals.find((goal) => goal.id === "amplify-with-credit").text,
    "Operator deliberately changed this reserved goal");
});

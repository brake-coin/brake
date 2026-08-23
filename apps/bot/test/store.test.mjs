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

test("store manages chat-scoped galleries and expiring confirmations", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-bot-gallery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date("2026-08-22T10:00:00.000Z");
  const store = new BotStore(path.join(directory, "bot.json"), { now: () => now });
  const first = await store.recordMedia({
    chatId: "42", userId: "7", type: "image", fileId: "image-1", caption: "timeout poster"
  });
  await store.recordMedia({
    chatId: "99", userId: "7", type: "video", fileId: "video-other", caption: "other chat"
  });
  assert.equal(store.listMedia("42").length, 1);
  assert.equal(store.findMedia("42", first.id.slice(0, 8)).fileId, "image-1");
  assert.equal(store.findMedia("42", "timeout").id, first.id);

  const action = await store.stagePendingAction({
    type: "x_post", chatId: "42", userId: "7", payload: { text: "STOPAI", mediaId: first.id }, expiresInMs: 1_000
  });
  assert.equal(store.pendingAction({ type: "x_post", chatId: "42", userId: "7" }).id, action.id);
  assert.equal((await store.takePendingAction({ type: "x_post", chatId: "42", userId: "7" })).id, action.id);
  assert.equal(await store.takePendingAction({ type: "x_post", chatId: "42", userId: "7" }), null);
  await store.stagePendingAction({
    type: "x_post", chatId: "42", userId: "7", payload: { text: "again" }, expiresInMs: 1_000
  });
  now = new Date("2026-08-22T10:00:02.000Z");
  assert.equal(store.pendingAction({ type: "x_post", chatId: "42", userId: "7" }), null);

  assert.equal((await store.removeMedia({ chatId: "42", mediaId: first.id })).id, first.id);
  assert.equal(store.listMedia("42").length, 0);
});

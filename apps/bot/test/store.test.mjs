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
});

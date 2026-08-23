import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AutonomousXService } from "../src/autonomous-x.mjs";
import { createBotConfig } from "../src/config.mjs";
import { BotStore } from "../src/store.mjs";

test("autonomous X service posts text, image, and video within its caps", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-x-auto-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = createBotConfig({
    X_AUTONOMOUS_POSTING_ENABLED: "true",
    X_AUTONOMOUS_HOURLY_CAP: "3",
    X_AUTONOMOUS_DAILY_CAP: "3"
  });
  const store = new BotStore(path.join(directory, "bot.json"));
  const posted = [];
  const openRouter = {
    connected: async () => true,
    chat: async () => ({ text: "**Live test** Put the brakes on the AI race. ✋🏻😡", costUsd: 0.01 }),
    generateImage: async () => ({ buffer: Buffer.from("image"), mimeType: "image/png", costUsd: 0.2 }),
    generateVideo: async () => ({ buffer: Buffer.from("video"), mimeType: "video/mp4", costUsd: 0.5 })
  };
  const xClient = {
    connected: async () => true,
    post: async (post) => {
      posted.push(post);
      return { url: `https://x.com/i/web/status/${posted.length}` };
    }
  };
  const service = new AutonomousXService({
    config,
    store,
    openRouter,
    xClient,
    canonicalReferenceDataUrl: "data:image/png;base64,AA=="
  });

  assert.equal((await service.runOnce({ type: "text", test: true })).ok, true);
  assert.equal((await service.runOnce({ type: "image", test: true })).ok, true);
  assert.equal((await service.runOnce({ type: "video", test: true })).ok, true);
  assert.equal(posted.length, 3);
  assert.equal(posted[0].media, null);
  assert.equal(posted[1].media.type, "image");
  assert.equal(posted[2].media.type, "video");
  assert.doesNotMatch(posted[0].text, /\*\*/);
  assert.equal((await service.runOnce({ type: "text", test: true })).reason, "hourly_cap");
});

test("autonomous X schedule waits after startup", async () => {
  let scheduledDelay = null;
  let cleared = false;
  const service = new AutonomousXService({
    config: createBotConfig({ X_AUTONOMOUS_POSTING_ENABLED: "true" }),
    store: {},
    openRouter: {},
    xClient: {},
    canonicalReferenceDataUrl: "data:image/png;base64,AA==",
    logger: { info() {}, error() {} },
    setTimeoutImpl: (_callback, delay) => {
      scheduledDelay = delay;
      return { unref() {} };
    },
    clearTimeoutImpl: () => { cleared = true; }
  });

  assert.equal(service.start(), true);
  assert.equal(scheduledDelay, 15 * 60_000);
  assert.equal(service.status().running, true);
  service.stop();
  assert.equal(cleared, true);
});

test("campaign agent researches, posts with attribution, and remembers the source", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-agent-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = createBotConfig({
    X_AUTONOMOUS_POSTING_ENABLED: "true",
    X_AUTONOMOUS_HOURLY_CAP: "3",
    X_AUTONOMOUS_DAILY_CAP: "3",
    X_AUTONOMOUS_TYPES: "text",
    AGENT_WATCH_ACCOUNTS: "canadabirdie",
    AGENT_X_QUERIES: "stop ai"
  });
  const store = new BotStore(path.join(directory, "bot.json"), {
    now: () => new Date("2026-08-22T21:00:00.000Z")
  });
  const source = {
    id: "2091410624970711451",
    text: "The AI race needs a human brake.",
    createdAt: "2026-08-22T20:00:00.000Z",
    url: "https://x.com/canadabirdie/status/2091410624970711451",
    author: { username: "canadabirdie" },
    metrics: { like_count: 20, retweet_count: 4 }
  };
  const posted = [];
  const service = new AutonomousXService({
    config,
    store,
    openRouter: {
      connected: async () => true,
      chat: async () => ({
        text: JSON.stringify({
          action: "post",
          reason: "Fresh and relevant",
          source_key: `x:${source.id}`,
          media_type: "text",
          post_text: "@canadabirdie The race has an accelerator. Humanity needs a brake. 🛑",
          media_prompt: "",
          topic: "AI race"
        }),
        costUsd: 0.01
      })
    },
    xClient: {
      connected: async () => true,
      userPosts: async () => ({ user: { username: "canadabirdie" }, posts: [source] }),
      searchRecent: async () => [],
      post: async (post) => {
        posted.push(post);
        return { url: "https://x.com/STOPAICOIN/status/300" };
      }
    },
    newsResearch: { feedUrls: [], latest: async () => [] },
    canonicalReferenceDataUrl: "data:image/png;base64,AA==",
    now: () => new Date("2026-08-22T21:00:00.000Z")
  });

  const result = await service.runOnce();
  assert.equal(result.ok, true);
  assert.equal(result.sourceKey, `x:${source.id}`);
  assert.match(posted[0].text, /Humanity needs a brake/);
  assert.doesNotMatch(posted[0].text, /@canadabirdie/);
  assert.match(posted[0].text, /https:\/\/x.com\/canadabirdie\/status/);
  assert.equal(store.agentStatus().memoryCount, 1);
  assert.equal(store.agentSnapshot().research[0].usedAt, "2026-08-22T21:00:00.000Z");

  const repeated = await service.runOnce();
  assert.equal(repeated.skipped, true);
  assert.match(repeated.reason, /No fresh/);
  assert.equal(posted.length, 1);
});

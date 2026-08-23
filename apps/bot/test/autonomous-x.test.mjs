import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { AutonomousXService } from "../src/autonomous-x.mjs";
import { createBotConfig } from "../src/config.mjs";
import { BotStore } from "../src/store.mjs";

test("autonomous X live tests post each media type and honor the public cooldown", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-x-auto-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = createBotConfig({
    X_AUTONOMOUS_POSTING_ENABLED: "true",
    X_AUTONOMOUS_HOURLY_CAP: "3",
    X_AUTONOMOUS_DAILY_CAP: "4",
    AGENT_MIN_POST_INTERVAL_MINUTES: "60"
  });
  let clock = new Date("2026-08-22T12:00:00.000Z");
  const store = new BotStore(path.join(directory, "bot.json"), { now: () => clock });
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
      return {
        id: String(posted.length),
        url: `https://x.com/STOPAICOIN/status/${posted.length}`,
        verified: true,
        verifiedAt: "2026-08-22T21:00:00.000Z"
      };
    }
  };
  const service = new AutonomousXService({
    config,
    store,
    openRouter,
    xClient,
    canonicalReferenceDataUrl: "data:image/png;base64,AA==",
    now: () => clock
  });

  assert.equal((await service.runOnce({ type: "text", test: true })).ok, true);
  clock = new Date("2026-08-22T13:01:00.000Z");
  assert.equal((await service.runOnce({ type: "image", test: true })).ok, true);
  clock = new Date("2026-08-22T14:02:00.000Z");
  assert.equal((await service.runOnce({ type: "video", test: true })).ok, true);
  assert.equal(posted.length, 3);
  assert.equal(posted[0].media, null);
  assert.equal(posted[1].media.type, "image");
  assert.match(posted[1].media.altText, /Live STOPAI systems test/);
  assert.equal(posted[2].media.type, "video");
  assert.match(posted[2].media.altText, /Live STOPAI systems test/);
  assert.doesNotMatch(posted[0].text, /\*\*/);
  assert.equal((await service.runOnce({ type: "text", test: true })).reason, "global_cooldown");
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
      readPost: async () => source,
      post: async (post) => {
        posted.push(post);
        return {
          id: "300",
          url: "https://x.com/STOPAICOIN/status/300",
          verified: true,
          verifiedAt: "2026-08-22T21:00:00.000Z"
        };
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
  assert.equal(store.agentStatus().quotedSourceCount, 1);
  assert.equal(store.agentSnapshot().research[0].usedAt, "2026-08-22T21:00:00.000Z");

  const repeated = await service.runOnce();
  assert.equal(repeated.skipped, true);
  assert.match(repeated.reason, /No fresh/);
  assert.equal(posted.length, 1);
});

test("campaign agent rejects reply, self, sensitive, and stale research sources", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-agent-guards-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = createBotConfig({
    X_AUTONOMOUS_POSTING_ENABLED: "true",
    X_AUTONOMOUS_TYPES: "text",
    AGENT_WATCH_ACCOUNTS: "STOPAICOIN",
    AGENT_X_QUERIES: "stop ai"
  });
  const reply = {
    id: "501",
    text: "A reply",
    url: "https://x.com/researcher/status/501",
    author: { username: "researcher" },
    isReply: true,
    references: [{ type: "replied_to", id: "500" }]
  };
  const selfPost = {
    id: "502",
    text: "Our own post",
    url: "https://x.com/STOPAICOIN/status/502",
    author: { username: "STOPAICOIN" }
  };
  const sensitive = {
    id: "503",
    text: "Sensitive source",
    createdAt: "2026-08-22T20:00:00.000Z",
    url: "https://x.com/researcher/status/503",
    author: { username: "researcher" },
    possiblySensitive: true
  };
  const stale = {
    id: "504",
    text: "Old source",
    createdAt: "2026-01-01T00:00:00.000Z",
    url: "https://x.com/researcher/status/504",
    author: { username: "researcher" }
  };
  let decisions = 0;
  const service = new AutonomousXService({
    config,
    store: new BotStore(path.join(directory, "bot.json")),
    openRouter: { connected: async () => true, chat: async () => { decisions += 1; } },
    xClient: {
      connected: async () => true,
      userPosts: async () => ({ user: { username: "STOPAICOIN" }, posts: [selfPost] }),
      searchRecent: async () => [reply, sensitive, stale]
    },
    newsResearch: { feedUrls: [], latest: async () => [] },
    canonicalReferenceDataUrl: "data:image/png;base64,AA==",
    now: () => new Date("2026-08-22T21:00:00.000Z")
  });

  const result = await service.runOnce();
  assert.equal(result.skipped, true);
  assert.match(result.reason, /No fresh/);
  assert.equal(decisions, 0);
});

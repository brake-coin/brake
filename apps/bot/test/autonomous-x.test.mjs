import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AutonomousXService,
  preferredAutonomousPostType
} from "../src/autonomous-x.mjs";
import { createBotConfig } from "../src/config.mjs";
import { BotStore } from "../src/store.mjs";

test("meme-first cadence uses three images followed by one text post", () => {
  const allowed = ["text", "image"];
  assert.equal(preferredAutonomousPostType(allowed, 0), "image");
  assert.equal(preferredAutonomousPostType(allowed, 1), "image");
  assert.equal(preferredAutonomousPostType(allowed, 2), "image");
  assert.equal(preferredAutonomousPostType(allowed, 3), "text");
  assert.equal(preferredAutonomousPostType(allowed, 4), "image");
  assert.equal(preferredAutonomousPostType(["text"], 0), "text");
  assert.equal(preferredAutonomousPostType(["image"], 3), "image");
  assert.equal(preferredAutonomousPostType([], 0), null);
});

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
  assert.equal(repeated.reason, "global_cooldown");
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

test("campaign agent forces the meme cadence and sees recent post performance", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-agent-meme-first-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = createBotConfig({
    X_AUTONOMOUS_POSTING_ENABLED: "true",
    X_AUTONOMOUS_TYPES: "text,image",
    AGENT_MIN_POST_INTERVAL_MINUTES: "60"
  });
  const store = new BotStore(path.join(directory, "bot.json"), {
    now: () => new Date("2026-08-23T21:00:00.000Z")
  });
  const source = {
    key: "news:fresh",
    kind: "news",
    title: "A fresh frontier AI report",
    url: "https://news.example/report",
    publisher: "Example News",
    publishedAt: "2026-08-23T20:00:00.000Z",
    summary: "A new AI system was announced.",
    score: 8
  };
  const posted = [];
  let decisionMessages = [];
  const service = new AutonomousXService({
    config,
    store,
    openRouter: {
      connected: async () => true,
      chat: async (messages) => {
        decisionMessages = messages;
        return {
          text: JSON.stringify({
            action: "post",
            reason: "Fresh and relevant",
            source_key: source.key,
            media_type: "text",
            post_text: "another accelerator shipped. the weird hand remains on brake duty. ✋🏻😡",
            media_prompt: "The weird hand pulling a brake beside an AI racetrack",
            topic: "frontier AI"
          }),
          costUsd: 0.01
        };
      },
      generateImage: async () => ({
        buffer: Buffer.from("image"),
        mimeType: "image/png",
        costUsd: 0.07
      })
    },
    xClient: {
      connected: async () => true,
      userPosts: async (username) => username.toLowerCase() === "stopaicoin"
        ? {
          user: { username: "STOPAICOIN" },
          posts: [{
            id: "700",
            text: "A previous meme",
            createdAt: "2026-08-23T18:00:00.000Z",
            url: "https://x.com/STOPAICOIN/status/700",
            author: { username: "STOPAICOIN" },
            media: [{ type: "photo" }],
            metrics: { like_count: 9, retweet_count: 2 }
          }]
        }
        : { user: { username }, posts: [] },
      searchRecent: async () => [],
      post: async (post) => {
        posted.push(post);
        return {
          id: "701",
          url: "https://x.com/STOPAICOIN/status/701",
          verified: true,
          verifiedAt: "2026-08-23T21:00:00.000Z"
        };
      }
    },
    newsResearch: { feedUrls: [], latest: async () => [source] },
    canonicalReferenceDataUrl: "data:image/png;base64,AA==",
    now: () => new Date("2026-08-23T21:00:00.000Z")
  });

  const result = await service.runOnce();
  assert.equal(result.ok, true);
  assert.equal(result.type, "image");
  assert.equal(posted[0].media.type, "image");
  const decisionContext = decisionMessages.at(-1).content;
  assert.match(decisionContext, /"preferredMediaType":"image"/);
  assert.match(decisionContext, /"like_count":9/);
  assert.equal(store.agentStatus().autonomousPostCount, 1);
});

test("campaign agent falls back to a sourced meme when the chat model is silent", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-agent-fallback-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = createBotConfig({
    X_AUTONOMOUS_POSTING_ENABLED: "true",
    X_AUTONOMOUS_TYPES: "text,image",
    AGENT_MIN_POST_INTERVAL_MINUTES: "60"
  });
  const store = new BotStore(path.join(directory, "bot.json"), {
    now: () => new Date("2026-08-23T21:00:00.000Z")
  });
  const source = {
    key: "news:fallback",
    kind: "news",
    title: "Another current AI race story",
    url: "https://news.example/fallback",
    publisher: "Example News",
    publishedAt: "2026-08-23T20:00:00.000Z",
    summary: "Current AI news.",
    score: 7
  };
  const posted = [];
  const service = new AutonomousXService({
    config,
    store,
    openRouter: {
      connected: async () => true,
      chat: async () => {
        throw new Error("The shared chat models returned no reply. Try again.");
      },
      generateImage: async () => ({
        buffer: Buffer.from("image"),
        mimeType: "image/png",
        costUsd: 0.07
      })
    },
    xClient: {
      connected: async () => true,
      userPosts: async (username) => ({ user: { username }, posts: [] }),
      searchRecent: async () => [],
      post: async (post) => {
        posted.push(post);
        return {
          id: "801",
          url: "https://x.com/STOPAICOIN/status/801",
          verified: true,
          verifiedAt: "2026-08-23T21:00:00.000Z"
        };
      }
    },
    newsResearch: { feedUrls: [], latest: async () => [source] },
    canonicalReferenceDataUrl: "data:image/png;base64,AA==",
    logger: { info() {}, warn() {}, error() {} },
    now: () => new Date("2026-08-23T21:00:00.000Z")
  });

  const result = await service.runOnce();
  assert.equal(result.ok, true);
  assert.equal(result.type, "image");
  assert.equal(posted[0].media.type, "image");
  assert.match(posted[0].text, /https:\/\/news\.example\/fallback/);
  assert.equal(store.agentStatus().autonomousPostCount, 1);
});

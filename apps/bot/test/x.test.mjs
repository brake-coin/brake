import assert from "node:assert/strict";
import test from "node:test";

import { resolveMediaMimeType, xPostReference, xWeightedLength, XClient } from "../src/x.mjs";

function config(overrides = {}) {
  return {
    xPostingEnabled: true,
    xTimeoutMs: 5_000,
    xMaxPostCharacters: 280,
    ...overrides
  };
}

test("X client creates an authorized text post with a user token", async () => {
  let request;
  const client = new XClient({
    config: config(),
    credentialProvider: async () => ({ accessToken: "private-user-token" }),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ data: { id: "123", text: "STOPAI" } }), { status: 201 });
    }
  });
  const result = await client.post({ text: "STOPAI" });
  assert.equal(request.url, "https://api.x.com/2/tweets");
  assert.equal(request.options.headers.Authorization, "Bearer private-user-token");
  assert.equal(JSON.parse(request.options.body).made_with_ai, true);
  assert.equal(result.url, "https://x.com/i/web/status/123");
});

test("X post references accept IDs and canonical post URLs only", () => {
  assert.deepEqual(xPostReference("2091410624970711451"), {
    id: "2091410624970711451",
    url: "https://x.com/i/web/status/2091410624970711451"
  });
  assert.deepEqual(xPostReference("https://x.com/canadabirdie/status/2091410624970711451?s=20"), {
    id: "2091410624970711451",
    url: "https://x.com/canadabirdie/status/2091410624970711451"
  });
  assert.deepEqual(xPostReference("https://x.com/i/web/status/2091410624970711451"), {
    id: "2091410624970711451",
    url: "https://x.com/i/web/status/2091410624970711451"
  });
  assert.equal(xPostReference("https://example.com/canadabirdie/status/2091410624970711451"), null);
});

test("X weighted length counts long links at the transformed URL length", () => {
  const longUrl = `https://news.google.com/rss/articles/${"x".repeat(400)}`;
  assert.equal(xWeightedLength(`Read this ${longUrl}`), 33);
});

test("X client reads and normalizes a public post", async () => {
  let requestUrl;
  const client = new XClient({
    config: config(),
    credentialProvider: async () => ({ accessToken: "private-user-token" }),
    fetchImpl: async (url) => {
      requestUrl = url;
      return new Response(JSON.stringify({
        data: {
          id: "2091410624970711451",
          text: "AI won’t stop itself.",
          author_id: "42",
          created_at: "2026-08-23T04:00:00.000Z"
        },
        includes: { users: [{ id: "42", username: "STOPAICOIN", name: "STOPAI" }] }
      }), { status: 200 });
    }
  });
  const post = await client.readPost("2091410624970711451");
  assert.match(requestUrl, /\/2\/tweets\/2091410624970711451\?/);
  assert.equal(post.author.username, "STOPAICOIN");
  assert.equal(post.url, "https://x.com/STOPAICOIN/status/2091410624970711451");
});

test("X client searches recent posts with public authors", async () => {
  let requestUrl;
  const client = new XClient({
    config: config(),
    credentialProvider: async () => ({ accessToken: "private-user-token" }),
    fetchImpl: async (url) => {
      requestUrl = url;
      return new Response(JSON.stringify({
        data: [{ id: "100", text: "Stop the AI race", author_id: "7" }],
        includes: { users: [{ id: "7", username: "researcher", name: "Researcher" }] }
      }), { status: 200 });
    }
  });
  const posts = await client.searchRecent('"stop ai" -is:retweet', 3);
  const parsed = new URL(requestUrl);
  assert.equal(parsed.pathname, "/2/tweets/search/recent");
  assert.equal(parsed.searchParams.get("query"), '"stop ai" -is:retweet');
  assert.equal(parsed.searchParams.get("max_results"), "10");
  assert.equal(posts[0].url, "https://x.com/researcher/status/100");
});

test("X client looks up a user and reads their original posts", async () => {
  const requests = [];
  const client = new XClient({
    config: config(),
    credentialProvider: async () => ({ accessToken: "private-user-token" }),
    fetchImpl: async (url) => {
      requests.push(url);
      if (url.includes("/by/username/")) {
        return new Response(JSON.stringify({
          data: { id: "77", username: "canadabirdie", name: "Canada Birdie" }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: [{ id: "101", text: "Pause the race", author_id: "77" }]
      }), { status: 200 });
    }
  });
  const result = await client.userPosts("@canadabirdie", 3);
  assert.match(requests[0], /\/2\/users\/by\/username\/canadabirdie\?/);
  assert.match(requests[1], /\/2\/users\/77\/tweets\?/);
  assert.equal(new URL(requests[1]).searchParams.get("exclude"), "retweets,replies");
  assert.equal(result.posts[0].url, "https://x.com/canadabirdie/status/101");
});

test("X client detects a Telegram image with a generic content type", async () => {
  const requests = [];
  const client = new XClient({
    config: config(),
    credentialProvider: async () => ({ accessToken: "private-user-token" }),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/2/media/upload")) {
        return new Response(JSON.stringify({ data: { id: "media-1" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { id: "post-1", text: "with image" } }), { status: 201 });
    }
  });
  await client.post({
    text: "with image",
    media: {
      type: "image",
      mimeType: "application/octet-stream",
      buffer: Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        Buffer.from("image")
      ])
    }
  });
  const upload = JSON.parse(requests[0].options.body);
  const post = JSON.parse(requests[1].options.body);
  assert.equal(upload.media_category, "tweet_image");
  assert.equal(upload.media_type, "image/png");
  assert.deepEqual(post.media.media_ids, ["media-1"]);
});

test("media detection falls back safely for Telegram image and video records", () => {
  assert.equal(resolveMediaMimeType({
    type: "image",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00])
  }), "image/jpeg");
  assert.equal(resolveMediaMimeType({
    type: "video",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("unknown")
  }), "video/mp4");
});

test("X client uses the chunked flow for video", async () => {
  const commands = [];
  let postedMediaIds;
  const client = new XClient({
    config: config(),
    credentialProvider: async () => ({ accessToken: "private-user-token" }),
    fetchImpl: async (url, options) => {
      if (url.endsWith("/2/tweets")) {
        postedMediaIds = JSON.parse(options.body).media.media_ids;
        return new Response(JSON.stringify({ data: { id: "post-video" } }), { status: 201 });
      }
      const command = options.body.get("command");
      commands.push(command);
      if (command === "INIT") {
        assert.equal(options.body.get("media_category"), "tweet_video");
        return new Response(JSON.stringify({ data: { id: "video-1" } }), { status: 200 });
      }
      if (command === "APPEND") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ data: { id: "video-1" } }), { status: 200 });
    }
  });
  await client.post({
    text: "with video",
    media: { type: "video", mimeType: "video/mp4", buffer: Buffer.from("video") }
  });
  assert.deepEqual(commands, ["INIT", "APPEND", "FINALIZE"]);
  assert.deepEqual(postedMediaIds, ["video-1"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { XClient } from "../src/x.mjs";

function config(overrides = {}) {
  return {
    xPostingEnabled: true,
    xTimeoutMs: 5_000,
    xMaxPostCharacters: 280,
    ...overrides
  };
}

test("X client creates a confirmed text post with a user token", async () => {
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
  assert.equal(result.url, "https://x.com/i/web/status/123");
});

test("X client uploads an image before creating the post", async () => {
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
    media: { type: "image", mimeType: "image/png", buffer: Buffer.from("image") }
  });
  const upload = JSON.parse(requests[0].options.body);
  const post = JSON.parse(requests[1].options.body);
  assert.equal(upload.media_category, "tweet_image");
  assert.deepEqual(post.media.media_ids, ["media-1"]);
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

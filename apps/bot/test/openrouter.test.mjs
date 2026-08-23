import assert from "node:assert/strict";
import test from "node:test";

import { OpenRouterClient } from "../src/openrouter.mjs";

function config(overrides = {}) {
  return {
    openRouterChatModel: "openrouter/auto",
    openRouterImageModel: "google/gemini-3.1-flash-image",
    openRouterVideoModel: "google/veo-3.1-lite",
    openRouterSiteUrl: "https://stopai.example",
    openRouterAppName: "STOPAI test",
    openRouterTimeoutMs: 5_000,
    videoDurationSeconds: 4,
    videoResolution: "720p",
    videoAspectRatio: "1:1",
    videoPollIntervalMs: 0,
    videoMaxWaitMs: 5_000,
    maxImageBytes: 1_000_000,
    maxVideoBytes: 1_000_000,
    ...overrides
  };
}

test("shared chat uses the private credential provider", async () => {
  let seen;
  const client = new OpenRouterClient({
    config: config(),
    credentialProvider: async () => ({ key: "sk-or-private-test" }),
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: "STOPAI reply" } }],
        usage: { cost: 0.01 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const result = await client.chat([{ role: "user", content: "hello" }]);
  assert.equal(result.text, "STOPAI reply");
  assert.equal(result.costUsd, 0.01);
  assert.equal(seen.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seen.options.headers.Authorization, "Bearer sk-or-private-test");
});

test("shared chat passes tools through and returns tool calls", async () => {
  let body;
  const client = new OpenRouterClient({
    config: config(),
    credentialProvider: async () => ({ key: "sk-or-private-test" }),
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{ message: {
          content: null,
          tool_calls: [{ id: "call-1", type: "function", function: { name: "gallery_list", arguments: "{}" } }]
        } }],
        usage: { cost: 0.02 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const tools = [{ type: "function", function: { name: "gallery_list", parameters: { type: "object" } } }];
  const result = await client.chatStep([{ role: "user", content: "show the gallery" }], tools);
  assert.deepEqual(body.tools, tools);
  assert.equal(body.tool_choice, "auto");
  assert.equal(body.max_completion_tokens, 800);
  assert.equal("max_tokens" in body, false);
  assert.deepEqual(body.reasoning, { effort: "minimal", exclude: true });
  assert.equal(result.message.tool_calls[0].function.name, "gallery_list");
  assert.equal(result.costUsd, 0.02);
});

test("shared chat retries one empty completion and counts both costs", async () => {
  let requests = 0;
  const client = new OpenRouterClient({
    config: config(),
    credentialProvider: async () => ({ key: "sk-or-private-test" }),
    fetchImpl: async () => {
      requests += 1;
      const payload = requests === 1
        ? {
            model: "empty-model",
            choices: [{ finish_reason: "length", message: { content: null } }],
            usage: { cost: 0.01 }
          }
        : {
            model: "reply-model",
            choices: [{ finish_reason: "stop", message: { content: "Recovered reply" } }],
            usage: { cost: 0.02 }
          };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const result = await client.chatStep([{ role: "user", content: "hello" }]);
  assert.equal(requests, 2);
  assert.equal(result.message.content, "Recovered reply");
  assert.ok(Math.abs(result.costUsd - 0.03) < 1e-9);
});

test("image generation sends canonical and user references", async () => {
  let body;
  const client = new OpenRouterClient({
    config: config(),
    credentialProvider: async () => ({ key: "sk-or-private-test" }),
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("image").toString("base64"), mime_type: "image/png" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const result = await client.generateImage({
    prompt: "STOPAI",
    referenceDataUrls: ["data:image/png;base64,AA==", "data:image/png;base64,AQ=="]
  });
  assert.equal(body.input_references.length, 2);
  assert.equal(result.buffer.toString(), "image");
});

test("video generation submits, polls, and downloads through OpenRouter", async () => {
  const requests = [];
  const client = new OpenRouterClient({
    config: config(),
    credentialProvider: async () => ({ key: "sk-or-private-test" }),
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method || "GET" });
      if (url.endsWith("/api/v1/videos") && options.method === "POST") {
        return new Response(JSON.stringify({ id: "job-1", status: "pending" }), { status: 202 });
      }
      if (url.endsWith("/api/v1/videos/job-1")) {
        return new Response(JSON.stringify({ id: "job-1", status: "completed", usage: { cost: 0.5 } }), { status: 200 });
      }
      return new Response(Buffer.from("video"), {
        status: 200,
        headers: { "Content-Type": "video/mp4" }
      });
    }
  });
  const result = await client.generateVideo({ prompt: "stop", referenceDataUrl: null });
  assert.equal(result.buffer.toString(), "video");
  assert.equal(result.costUsd, 0.5);
  assert.deepEqual(requests.map((item) => item.url), [
    "https://openrouter.ai/api/v1/videos",
    "https://openrouter.ai/api/v1/videos/job-1",
    "https://openrouter.ai/api/v1/videos/job-1/content?index=0"
  ]);
});

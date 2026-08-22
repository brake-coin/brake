import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMemePrompt,
  FixedWindowRateLimiter,
  generateMeme,
  UserInputError,
  validateMemeRequest
} from "../src/meme.mjs";

test("validates and normalizes a meme request", () => {
  assert.deepEqual(
    validateMemeRequest({ idea: "  pause   the race  ", style: "poster" }),
    { idea: "pause the race", style: "poster" }
  );
  assert.throws(() => validateMemeRequest({ idea: "no", style: "reaction" }), UserInputError);
  assert.throws(() => validateMemeRequest({ idea: "a fine idea", style: "oil" }), UserInputError);
});

test("prompt preserves the intentional hand and blocks invented promotion", () => {
  const prompt = buildMemePrompt({ idea: "labs racing downhill", style: "surreal" });
  assert.match(prompt, /weird small thumb\/finger shape/i);
  assert.match(prompt, /do not replace the hand/i);
  assert.match(prompt, /do not invent a token address, price, return, endorsement/i);
  assert.match(prompt, /\$STOPAI ✋🏻😡/u);
  assert.doesNotMatch(prompt, /\$BRAKE/);
  assert.match(prompt, /labs racing downhill/);
});

test("sends a multimodal image request to OpenRouter and returns the image", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "done", images: [{ image_url: { url: "data:image/png;base64,bWVtZQ==" } }] } }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await generateMeme({
    idea: "apply brakes",
    style: "reaction",
    referenceImage: "data:image/png;base64,aGFuZA==",
    apiKey: "test-key",
    fetchImpl
  });

  assert.equal(captured.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(captured.options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(captured.body.modalities, ["image", "text"]);
  assert.equal(captured.body.image_config.aspect_ratio, "1:1");
  assert.equal(captured.body.messages[0].content[1].image_url.url, "data:image/png;base64,aGFuZA==");
  assert.equal(result.image, "data:image/png;base64,bWVtZQ==");
});

test("rate limiter resets at the end of its window", () => {
  let time = 1_000;
  const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 100, now: () => time });
  assert.equal(limiter.take("visitor").allowed, true);
  assert.equal(limiter.take("visitor").allowed, true);
  assert.equal(limiter.take("visitor").allowed, false);
  time += 100;
  assert.equal(limiter.take("visitor").allowed, true);
});

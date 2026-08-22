import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildMemePrompt,
  buildOpenRouterAuthorizationUrl,
  createPkceTransaction,
  exchangeOpenRouterCode,
  generateMeme,
  keyLinks,
  validateMemeRequest
} from "../openrouter.js";

test("creates an S256 PKCE transaction and authorization URL", async () => {
  const transaction = await createPkceTransaction();
  assert.equal(
    transaction.challenge,
    createHash("sha256").update(transaction.verifier).digest("base64url")
  );
  assert.ok(transaction.state.length >= 32);

  const authorizationUrl = new URL(
    buildOpenRouterAuthorizationUrl({
      callbackUrl: "https://example.org/brake/?oauth=openrouter&state=test",
      challenge: transaction.challenge
    })
  );
  assert.equal(authorizationUrl.origin, "https://openrouter.ai");
  assert.equal(authorizationUrl.pathname, "/auth");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    authorizationUrl.searchParams.get("callback_url"),
    "https://example.org/brake/?oauth=openrouter&state=test"
  );
});

test("exchanges a code for a user-controlled key", async () => {
  let requestBody;
  const credential = await exchangeOpenRouterCode({
    code: "authorization-code",
    verifier: "pkce-verifier",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ key: "sk-or-v1-user-key", user_id: "user_visitor" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  });
  assert.deepEqual(requestBody, {
    code: "authorization-code",
    code_verifier: "pkce-verifier",
    code_challenge_method: "S256"
  });
  assert.equal(credential.key, "sk-or-v1-user-key");
  assert.equal(credential.userId, "user_visitor");
});

test("creates owner-only OpenRouter key links without exposing the key", async () => {
  const key = "sk-or-v1-user-key";
  const hash = createHash("sha256").update(key).digest("hex");
  const links = await keyLinks(key);
  assert.equal(links.activityUrl, `https://openrouter.ai/logs?api_key_hash=${hash}`);
  assert.equal(links.settingsUrl, `https://openrouter.ai/keys/${hash}`);
  assert.doesNotMatch(JSON.stringify(links), /sk-or-v1/);
});

test("validates ideas and keeps the STOPAI hand in the meme prompt", () => {
  assert.deepEqual(
    validateMemeRequest({ idea: "  pause   the race  ", style: "poster" }),
    { idea: "pause the race", style: "poster" }
  );
  assert.throws(() => validateMemeRequest({ idea: "no", style: "reaction" }));
  assert.throws(() => validateMemeRequest({ idea: "a fine idea", style: "oil" }));

  const prompt = buildMemePrompt({ idea: "labs racing downhill", style: "surreal" });
  assert.match(prompt, /weird small thumb\/finger shape/i);
  assert.match(prompt, /do not replace the hand/i);
  assert.match(prompt, /\$STOPAI ✋🏻😡/u);
  assert.match(prompt, /labs racing downhill/);
});

test("sends the visitor key directly to OpenRouter for image generation", async () => {
  let captured;
  const result = await generateMeme({
    idea: "apply brakes",
    style: "reaction",
    referenceImage: "data:image/png;base64,aGFuZA==",
    apiKey: "visitor-key",
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(
        JSON.stringify({
          choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,bWVtZQ==" } }] } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  });
  assert.equal(captured.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(captured.options.headers.Authorization, "Bearer visitor-key");
  assert.deepEqual(captured.body.modalities, ["image", "text"]);
  assert.equal(captured.body.messages[0].content[1].image_url.url, "data:image/png;base64,aGFuZA==");
  assert.equal(result.image, "data:image/png;base64,bWVtZQ==");
});

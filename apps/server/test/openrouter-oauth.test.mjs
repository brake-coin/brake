import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildOpenRouterAuthorizationUrl,
  createPkceTransaction,
  exchangeOpenRouterCode
} from "../src/openrouter-oauth.mjs";

test("OpenRouter OAuth uses S256 PKCE", async () => {
  const transaction = createPkceTransaction();
  assert.equal(transaction.challenge, createHash("sha256").update(transaction.verifier).digest("base64url"));
  const authorization = new URL(buildOpenRouterAuthorizationUrl({
    callbackUrl: "https://stopai.example/admin/openrouter/callback?state=one",
    challenge: transaction.challenge
  }));
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");

  const credential = await exchangeOpenRouterCode({
    code: "code",
    verifier: "verifier",
    fetchImpl: async () => new Response(JSON.stringify({
      key: "sk-or-v1-oauth-key-long-enough",
      user_id: "owner"
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  });
  assert.equal(credential.userId, "owner");
});

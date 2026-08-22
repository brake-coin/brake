import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildOpenRouterAuthorizationUrl,
  createPkceTransaction,
  exchangeOpenRouterCode
} from "../src/openrouter-oauth.mjs";

test("creates a valid S256 PKCE transaction and authorization URL", () => {
  const transaction = createPkceTransaction();
  assert.equal(
    transaction.challenge,
    createHash("sha256").update(transaction.verifier).digest("base64url")
  );
  assert.ok(transaction.state.length >= 32);

  const authorizationUrl = new URL(
    buildOpenRouterAuthorizationUrl({
      callbackUrl: "https://brake.example/admin/openrouter/callback?state=test",
      challenge: transaction.challenge
    })
  );
  assert.equal(authorizationUrl.origin, "https://openrouter.ai");
  assert.equal(authorizationUrl.pathname, "/auth");
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    authorizationUrl.searchParams.get("callback_url"),
    "https://brake.example/admin/openrouter/callback?state=test"
  );
});

test("exchanges an authorization code without exposing the key elsewhere", async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ key: "sk-or-v1-oauth-key-that-is-long-enough", user_id: "user_owner" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const credential = await exchangeOpenRouterCode({
    code: "authorization-code",
    verifier: "pkce-verifier",
    fetchImpl
  });
  assert.deepEqual(requestBody, {
    code: "authorization-code",
    code_verifier: "pkce-verifier",
    code_challenge_method: "S256"
  });
  assert.equal(credential.userId, "user_owner");
  assert.match(credential.key, /^sk-or-/);
});

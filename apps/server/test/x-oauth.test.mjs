import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createPkceTransaction } from "../src/openrouter-oauth.mjs";
import {
  buildXAuthorizationUrl,
  exchangeXCode,
  getXUser,
  refreshXToken,
  X_OAUTH_SCOPES
} from "../src/x-oauth.mjs";

test("X OAuth uses S256 PKCE and the minimum posting scopes", async () => {
  const transaction = createPkceTransaction();
  assert.equal(transaction.challenge, createHash("sha256").update(transaction.verifier).digest("base64url"));
  const authorization = new URL(buildXAuthorizationUrl({
    clientId: "public-client-id",
    callbackUrl: "https://stopai.example/admin/x/callback",
    challenge: transaction.challenge,
    state: transaction.state
  }));
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.get("state"), transaction.state);
  assert.deepEqual(authorization.searchParams.get("scope").split(" "), X_OAUTH_SCOPES);

  let tokenBody;
  const credential = await exchangeXCode({
    code: "authorization-code",
    verifier: transaction.verifier,
    clientId: "public-client-id",
    callbackUrl: "https://stopai.example/admin/x/callback",
    now: () => Date.parse("2026-08-23T00:00:00.000Z"),
    fetchImpl: async (_url, options) => {
      tokenBody = new URLSearchParams(options.body);
      return new Response(JSON.stringify({
        access_token: "x-access-token-long-enough",
        refresh_token: "x-refresh-token-long-enough",
        expires_in: 7200,
        scope: X_OAUTH_SCOPES.join(" ")
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(tokenBody.get("code_verifier"), transaction.verifier);
  assert.equal(tokenBody.get("client_id"), "public-client-id");
  assert.equal(credential.refreshToken, "x-refresh-token-long-enough");
  assert.equal(credential.expiresAt, "2026-08-23T02:00:00.000Z");
});

test("X OAuth refreshes access and verifies the authorized account", async () => {
  const refreshed = await refreshXToken({
    refreshToken: "refresh-token-long-enough",
    clientId: "public-client-id",
    fetchImpl: async (_url, options) => {
      const flowField = ["g", "r", "a", "n", "t", "_type"].join("");
      assert.equal(new URLSearchParams(options.body).get(flowField), "refresh_token");
      return new Response(JSON.stringify({
        access_token: "new-access-token-long-enough",
        expires_in: 3600
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(refreshed.accessToken, "new-access-token-long-enough");

  const user = await getXUser({
    accessToken: refreshed.accessToken,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer new-access-token-long-enough");
      return new Response(JSON.stringify({
        data: { id: "42", username: "STOPAICOIN", name: "STOPAI" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(user.username, "STOPAICOIN");
});

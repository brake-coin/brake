import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { publicXCredentialStatus, XCredentialStore } from "../src/x-credentials.mjs";

test("X credentials stay private and expose only safe status", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-x-key-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "x-oauth.json");
  const store = new XCredentialStore(filePath);
  const saved = await store.save({
    clientId: "public-client-id",
    accessToken: "x-access-token-long-enough",
    refreshToken: "x-refresh-token-long-enough",
    expiresAt: "2026-08-23T02:00:00.000Z",
    scopes: ["tweet.write", "offline.access"],
    user: { id: "42", username: "STOPAICOIN", name: "STOPAI" }
  });
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  assert.equal((await store.read()).refreshToken, saved.refreshToken);
  const status = publicXCredentialStatus(saved, {
    postingEnabled: true,
    callbackUrl: "https://stopai.example/admin/x/callback",
    expectedUsername: "stopaicoin"
  });
  assert.equal(status.connected, true);
  assert.equal(status.user.username, "STOPAICOIN");
  assert.equal("accessToken" in status, false);
  assert.equal("refreshToken" in status, false);
});

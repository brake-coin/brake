import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CredentialStore, publicCredentialStatus } from "../src/credentials.mjs";

test("credential store persists a private key file and exposes only safe status", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brake-credential-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "nested", "openrouter.json");
  const store = new CredentialStore(filePath);

  assert.equal(await store.read(), null);
  const saved = await store.save({
    key: "sk-or-v1-test-key-that-is-long-enough",
    userId: "user_brake"
  });
  const fileMode = (await stat(filePath)).mode & 0o777;
  assert.equal(fileMode, 0o600);
  assert.equal((await store.read()).key, saved.key);

  const status = publicCredentialStatus(saved);
  assert.equal(status.connected, true);
  assert.equal(status.userId, "user_brake");
  assert.equal("key" in status, false);
  assert.match(status.settingsUrl, /^https:\/\/openrouter\.ai\/keys\/[a-f0-9]{64}$/);

  assert.equal(await store.clear(), true);
  assert.equal(await store.read(), null);
});

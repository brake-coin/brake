import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CredentialStore, publicCredentialStatus } from "../src/credentials.mjs";

test("credential store exposes only a safe fingerprint", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-key-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "openrouter.json");
  const store = new CredentialStore(filePath);
  const saved = await store.save({ key: "sk-or-v1-key-long-enough-for-test", userId: "user" });
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  assert.equal((await store.read()).key, saved.key);
  const status = publicCredentialStatus(saved);
  assert.equal(status.connected, true);
  assert.equal("key" in status, false);
});

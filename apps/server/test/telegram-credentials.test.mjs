import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  publicTelegramCredentialStatus,
  TelegramCredentialStore,
  TelegramTokenError,
  validTelegramToken,
  verifyTelegramToken
} from "../src/telegram-credentials.mjs";

const validToken = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi";

test("Telegram tokens are checked with getMe without being returned", async () => {
  let requestedUrl;
  const bot = await verifyTelegramToken({
    token: validToken,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({
        ok: true,
        result: { id: 123456789, is_bot: true, first_name: "STOPAI", username: "stopai_test_bot" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  assert.equal(requestedUrl, `https://api.telegram.org/bot${validToken}/getMe`);
  assert.equal(bot.username, "stopai_test_bot");
  assert.equal(validTelegramToken("not-a-token"), false);
  await assert.rejects(
    () => verifyTelegramToken({ token: "not-a-token", fetchImpl: async () => assert.fail() }),
    TelegramTokenError
  );
});

test("Telegram credential store uses a private file and exposes safe status", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stopai-telegram-key-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "telegram.json");
  const store = new TelegramCredentialStore(filePath);
  const saved = await store.save({
    token: validToken,
    bot: { id: "123456789", username: "stopai_test_bot", firstName: "STOPAI" }
  });
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  assert.equal((await store.read()).token, validToken);
  const status = publicTelegramCredentialStatus(saved);
  assert.equal(status.source, "admin");
  assert.equal(status.username, "stopai_test_bot");
  assert.equal("token" in status, false);
  assert.equal(await store.clear(), true);
});

import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export class TelegramTokenError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "TelegramTokenError";
    this.status = status;
  }
}

export function validTelegramToken(token) {
  return typeof token === "string"
    && /^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token);
}

export async function verifyTelegramToken({ token, fetchImpl = fetch, signal }) {
  if (!validTelegramToken(token)) {
    throw new TelegramTokenError("That does not look like a Telegram bot token.");
  }
  let response;
  let payload;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, { signal });
    payload = await response.json();
  } catch {
    throw new TelegramTokenError("Telegram could not verify that token. Try again.", 502);
  }
  const bot = payload?.result;
  if (!response.ok || !payload?.ok || !bot?.is_bot || !bot?.id || !bot?.username) {
    throw new TelegramTokenError("Telegram rejected that bot token.", 401);
  }
  return {
    id: String(bot.id),
    username: bot.username,
    firstName: bot.first_name || null
  };
}

export class TelegramCredentialStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async read() {
    try {
      const credential = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!validTelegramToken(credential.token)) return null;
      return credential;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async save({ token, bot }) {
    if (!validTelegramToken(token) || !bot?.id || !bot?.username) {
      throw new TelegramTokenError("A verified Telegram bot token is required.");
    }
    const credential = {
      token,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      botId: String(bot.id),
      username: bot.username,
      firstName: bot.firstName || null,
      linkedAt: new Date().toISOString()
    };
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(credential)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    await chmod(this.filePath, 0o600);
    return credential;
  }

  async clear() {
    try {
      await unlink(this.filePath);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
}

export function publicTelegramCredentialStatus(credential, environmentConfigured = false) {
  if (!credential) {
    return { source: environmentConfigured ? "environment" : "none" };
  }
  return {
    source: "admin",
    linkedAt: credential.linkedAt,
    username: credential.username,
    botId: credential.botId,
    tokenFingerprint: credential.tokenHash.slice(0, 12)
  };
}

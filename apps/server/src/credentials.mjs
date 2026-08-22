import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export class CredentialStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async read() {
    try {
      const credential = JSON.parse(await readFile(this.filePath, "utf8"));
      if (typeof credential.key !== "string" || credential.key.length < 20) return null;
      return credential;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async save({ key, userId = null }) {
    if (typeof key !== "string" || key.length < 20) {
      throw new Error("OpenRouter returned an invalid API key.");
    }
    const credential = {
      key,
      keyHash: createHash("sha256").update(key).digest("hex"),
      userId: typeof userId === "string" ? userId : null,
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

export function publicCredentialStatus(credential) {
  if (!credential) return { connected: false };
  return {
    connected: true,
    linkedAt: credential.linkedAt,
    userId: credential.userId,
    keyFingerprint: credential.keyHash.slice(0, 12),
    settingsUrl: `https://openrouter.ai/keys/${credential.keyHash}`,
    activityUrl: `https://openrouter.ai/logs?api_key_hash=${credential.keyHash}`
  };
}

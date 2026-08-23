import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export class XCredentialStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async read() {
    try {
      const credential = JSON.parse(await readFile(this.filePath, "utf8"));
      if (typeof credential.accessToken !== "string" || credential.accessToken.length < 20) return null;
      if (typeof credential.clientId !== "string" || credential.clientId.length < 5) return null;
      return credential;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async save(value) {
    if (typeof value?.accessToken !== "string" || value.accessToken.length < 20) {
      throw new Error("X returned an invalid access token.");
    }
    if (typeof value?.clientId !== "string" || value.clientId.length < 5) {
      throw new Error("The X Client ID is invalid.");
    }
    const credential = {
      clientId: value.clientId,
      accessToken: value.accessToken,
      refreshToken: typeof value.refreshToken === "string" ? value.refreshToken : null,
      expiresAt: value.expiresAt || null,
      scopes: Array.isArray(value.scopes) ? value.scopes : [],
      user: value.user || null,
      linkedAt: value.linkedAt || new Date().toISOString(),
      refreshedAt: value.refreshedAt || null
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

export function publicXCredentialStatus(credential, {
  environmentToken = false,
  postingEnabled = false,
  callbackUrl,
  expectedUsername
} = {}) {
  if (!credential && !environmentToken) {
    return {
      connected: false,
      postingEnabled,
      source: "none",
      callbackUrl,
      expectedUsername
    };
  }
  return {
    connected: true,
    postingEnabled,
    source: credential ? "admin" : "environment",
    callbackUrl,
    expectedUsername,
    linkedAt: credential?.linkedAt || null,
    expiresAt: credential?.expiresAt || null,
    scopes: credential?.scopes || [],
    user: credential?.user || null
  };
}

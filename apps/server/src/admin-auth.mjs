import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "brake_admin";

function digest(value) {
  return createHash("sha256").update(value).digest();
}

export function passwordMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string" || !expected) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

export function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export class AdminSessionManager {
  #sessions = new Map();
  #oauthTransactions = new Map();

  constructor({ sessionTtlMs = 3_600_000, oauthTtlMs = 600_000, now = Date.now } = {}) {
    this.sessionTtlMs = sessionTtlMs;
    this.oauthTtlMs = oauthTtlMs;
    this.now = now;
  }

  createSession() {
    this.#sweep();
    const token = randomBytes(32).toString("base64url");
    this.#sessions.set(token, this.now() + this.sessionTtlMs);
    return token;
  }

  isAuthenticated(token) {
    this.#sweep();
    const expiresAt = token ? this.#sessions.get(token) : null;
    return Boolean(expiresAt && expiresAt > this.now());
  }

  destroySession(token) {
    if (token) this.#sessions.delete(token);
  }

  createOAuthTransaction({ sessionToken, verifier, state }) {
    if (!this.isAuthenticated(sessionToken)) throw new Error("Admin session expired.");
    this.#oauthTransactions.set(state, {
      sessionToken,
      verifier,
      expiresAt: this.now() + this.oauthTtlMs
    });
  }

  consumeOAuthTransaction({ state, sessionToken }) {
    this.#sweep();
    const transaction = state ? this.#oauthTransactions.get(state) : null;
    if (state) this.#oauthTransactions.delete(state);
    if (!transaction || transaction.sessionToken !== sessionToken) return null;
    return transaction;
  }

  #sweep() {
    const currentTime = this.now();
    for (const [token, expiresAt] of this.#sessions) {
      if (expiresAt <= currentTime) this.#sessions.delete(token);
    }
    for (const [state, transaction] of this.#oauthTransactions) {
      if (transaction.expiresAt <= currentTime) this.#oauthTransactions.delete(state);
    }
  }
}

export function adminCookie(token, { secure = true, maxAge = 3600 } = {}) {
  const attributes = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

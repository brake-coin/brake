import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_COOKIE,
  adminCookie,
  AdminSessionManager,
  passwordMatches,
  readCookie
} from "../src/admin-auth.mjs";

test("admin passwords use a timing-safe digest comparison", () => {
  assert.equal(passwordMatches("correct horse", "correct horse"), true);
  assert.equal(passwordMatches("wrong", "correct horse"), false);
  assert.equal(passwordMatches("anything", ""), false);
});

test("admin cookies are HTTP-only and readable by name", () => {
  const cookie = adminCookie("hello world", { secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(readCookie(`another=1; ${cookie}`, ADMIN_COOKIE), "hello world");
  assert.equal(readCookie(`${ADMIN_COOKIE}=%zz`, ADMIN_COOKIE), null);
});

test("OAuth transactions are one-time and bound to an active admin session", () => {
  let now = 1_000;
  const sessions = new AdminSessionManager({
    sessionTtlMs: 1_000,
    oauthTtlMs: 100,
    now: () => now
  });
  const sessionToken = sessions.createSession();
  sessions.createOAuthTransaction({ sessionToken, state: "state", verifier: "verifier" });

  assert.equal(
    sessions.consumeOAuthTransaction({ state: "state", sessionToken: "different" }),
    null
  );
  sessions.createOAuthTransaction({ sessionToken, state: "state-2", verifier: "verifier-2" });
  assert.equal(
    sessions.consumeOAuthTransaction({ state: "state-2", sessionToken }).verifier,
    "verifier-2"
  );
  assert.equal(sessions.consumeOAuthTransaction({ state: "state-2", sessionToken }), null);

  now += 1_001;
  assert.equal(sessions.isAuthenticated(sessionToken), false);
});

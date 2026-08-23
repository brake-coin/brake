import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_COOKIE,
  adminCookie,
  AdminSessionManager,
  passwordMatches,
  readCookie
} from "../src/admin-auth.mjs";

test("admin login uses safe comparison and OAuth-friendly cookies", () => {
  assert.equal(passwordMatches("correct", "correct"), true);
  assert.equal(passwordMatches("wrong", "correct"), false);
  const cookie = adminCookie("hello world", { secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(readCookie(`other=1; ${cookie}`, ADMIN_COOKIE), "hello world");
});

test("OAuth state is one-time and bound to the admin session", () => {
  const sessions = new AdminSessionManager();
  const sessionToken = sessions.createSession();
  sessions.createOAuthTransaction({ sessionToken, state: "state", verifier: "verifier" });
  assert.equal(sessions.consumeOAuthTransaction({ state: "state", sessionToken }).verifier, "verifier");
  assert.equal(sessions.consumeOAuthTransaction({ state: "state", sessionToken }), null);
});

test("OAuth state is also bound to its provider", () => {
  const sessions = new AdminSessionManager();
  const sessionToken = sessions.createSession();
  sessions.createOAuthTransaction({
    sessionToken,
    verifier: "verifier",
    state: "shared-state",
    provider: "x"
  });
  assert.equal(sessions.consumeOAuthTransaction({
    state: "shared-state",
    sessionToken,
    provider: "openrouter"
  }), null);
});

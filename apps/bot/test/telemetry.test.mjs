import assert from "node:assert/strict";
import test from "node:test";

import {
  logBotEvent,
  privateTelemetryId,
  safeTelemetryDetails
} from "../src/telemetry.mjs";

test("bot telemetry uses stable keyed IDs without exposing raw identifiers", () => {
  const first = privateTelemetryId("private-token", "user", "12345");
  const again = privateTelemetryId("private-token", "user", "12345");
  const other = privateTelemetryId("private-token", "chat", "12345");
  assert.equal(first, again);
  assert.notEqual(first, other);
  assert.equal(first.length, 16);
  assert.doesNotMatch(first, /12345/);
});

test("bot telemetry drops text, tokens, URLs, and unknown fields", () => {
  const details = safeTelemetryDetails({
    user: "hashed-user",
    tool: "x_search",
    ok: true,
    latencyMs: 12,
    prompt: "private message text",
    token: "secret",
    reason: "https://example.com/private"
  });
  assert.deepEqual(details, {
    user: "hashed-user",
    tool: "x_search",
    ok: true,
    latencyMs: 12
  });
  let line = "";
  const record = logBotEvent({ info: (value) => { line = value; } }, "tool complete", details);
  assert.equal(record.event, "tool_complete");
  assert.doesNotMatch(line, /private message|secret|example\.com/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { formatPercent, formatTokens, shortAddress } from "../token-monitor.js";

test("token monitor formats addresses and measured values for a small screen", () => {
  assert.equal(shortAddress("1234567890abcdefghij"), "12345…fghij");
  assert.equal(formatPercent(12.345678), "12.3457%");
  assert.equal(formatPercent(0.00001), "<0.0001%");
  assert.match(formatTokens("25000000"), /25.*M/i);
});

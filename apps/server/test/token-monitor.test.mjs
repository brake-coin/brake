import assert from "node:assert/strict";
import test from "node:test";

import {
  createTokenMonitor,
  extractTransferFlows,
  formatBaseUnits,
  percentOfSupply,
  summarizeDistribution
} from "../src/token-monitor.mjs";

const MINT = "2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS";

test("token math stays exact in base units", () => {
  assert.equal(formatBaseUnits("1000000000000000000", 9), "1000000000");
  assert.equal(formatBaseUnits("1234500000", 9), "1.2345");
  assert.equal(percentOfSupply("125000000000000000", "1000000000000000000"), 12.5);
});

test("distribution reports token accounts and their parsed owners without guessing labels", () => {
  const summary = summarizeDistribution({
    largestAccounts: [
      { address: "token-account-a", amount: "300000000" },
      { address: "token-account-b", amount: "200000000" }
    ],
    accountInfos: [
      { data: { parsed: { info: { owner: "owner-a" } } } },
      { data: { parsed: { info: { owner: "owner-b" } } } }
    ],
    supply: "1000000000",
    decimals: 2
  });

  assert.equal(summary.accountCount, 2);
  assert.equal(summary.mappedOwnerCount, 2);
  assert.equal(summary.concentration.largestAccountPercent, 30);
  assert.equal(summary.concentration.top10AccountsPercent, 50);
  assert.equal(summary.accounts[0].owner, "owner-a");
  assert.equal(summary.accounts[0].amountTokens, "3000000");
});

test("transaction token balance changes become owner-to-owner flows", () => {
  const transaction = {
    slot: 123,
    blockTime: 1_700_000_000,
    meta: {
      err: null,
      preTokenBalances: [
        { accountIndex: 0, mint: MINT, owner: "source-owner", uiTokenAmount: { amount: "900" } },
        { accountIndex: 1, mint: MINT, owner: "target-owner", uiTokenAmount: { amount: "100" } }
      ],
      postTokenBalances: [
        { accountIndex: 0, mint: MINT, owner: "source-owner", uiTokenAmount: { amount: "650" } },
        { accountIndex: 1, mint: MINT, owner: "target-owner", uiTokenAmount: { amount: "350" } }
      ]
    },
    transaction: { message: { accountKeys: ["token-a", "token-b"] } }
  };
  const flows = extractTransferFlows({
    transaction,
    signature: "signature-1",
    mint: MINT,
    supply: "1000",
    decimals: 1
  });

  assert.deepEqual(flows, [{
    signature: "signature-1",
    slot: 123,
    blockTime: 1_700_000_000,
    from: "source-owner",
    to: "target-owner",
    amountBaseUnits: "250",
    amountTokens: "25",
    percentSupply: 25
  }]);
});

test("monitor reads Solana RPC data once inside the cache window", async () => {
  const calls = [];
  const jsonResponse = (result) => ({ ok: true, json: async () => ({ result }) });
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request.method);
    if (request.method === "getTokenSupply") {
      return jsonResponse({ context: { slot: 100 }, value: { amount: "1000", decimals: 1 } });
    }
    if (request.method === "getTokenLargestAccounts") {
      return jsonResponse({
        context: { slot: 101 },
        value: [{ address: "token-a", amount: "600" }, { address: "token-b", amount: "400" }]
      });
    }
    if (request.method === "getMultipleAccounts") {
      return jsonResponse({ value: [
        { data: { parsed: { info: { owner: "owner-a" } } } },
        { data: { parsed: { info: { owner: "owner-b" } } } }
      ] });
    }
    if (request.method === "getSignaturesForAddress") {
      return jsonResponse(request.params[0] === "token-a"
        ? [{ signature: "signature-1", blockTime: 1_700_000_000, err: null }]
        : []);
    }
    if (request.method === "getTransaction") {
      return jsonResponse({
        slot: 102,
        blockTime: 1_700_000_000,
        meta: {
          err: null,
          preTokenBalances: [
            { accountIndex: 0, mint: MINT, owner: "owner-a", uiTokenAmount: { amount: "600" } },
            { accountIndex: 1, mint: MINT, owner: "owner-b", uiTokenAmount: { amount: "400" } }
          ],
          postTokenBalances: [
            { accountIndex: 0, mint: MINT, owner: "owner-a", uiTokenAmount: { amount: "500" } },
            { accountIndex: 1, mint: MINT, owner: "owner-b", uiTokenAmount: { amount: "500" } }
          ]
        },
        transaction: { message: { accountKeys: ["token-a", "token-b"] } }
      });
    }
    assert.fail(`Unexpected RPC method: ${request.method}`);
  };
  const monitor = createTokenMonitor({
    mint: MINT,
    fetchImpl,
    now: () => Date.parse("2026-08-23T12:00:00.000Z")
  });

  const first = await monitor.read();
  const callCount = calls.length;
  const second = await monitor.read();

  assert.equal(first.slot, 101);
  assert.equal(first.distribution.concentration.largestAccountPercent, 60);
  assert.equal(first.flows.items[0].amountTokens, "10");
  assert.equal(first.flows.items[0].from, "owner-a");
  assert.equal(second, first);
  assert.equal(calls.length, callCount);
});

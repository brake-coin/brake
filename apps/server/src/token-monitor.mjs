const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const FLOW_ACCOUNT_LIMIT = 5;
const FLOW_SIGNATURE_LIMIT = 2;
const FLOW_TRANSACTION_LIMIT = 8;

function rpcError(message, cause) {
  const error = new Error(message);
  error.cause = cause;
  return error;
}

function asRawAmount(value) {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
}

export function formatBaseUnits(value, decimals) {
  const raw = asRawAmount(value);
  if (!decimals) return raw.toString();
  const digits = raw.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function percentOfSupply(value, supply) {
  const raw = asRawAmount(value);
  const total = asRawAmount(supply);
  if (total <= 0n) return 0;
  return Number((raw * 100_000_000n) / total) / 1_000_000;
}

function accountKeyAt(accountKeys, index) {
  const key = accountKeys?.[index];
  return typeof key === "string" ? key : String(key?.pubkey || "unknown");
}

function tokenBalancesByAccount(transaction, mint) {
  const accountKeys = transaction?.transaction?.message?.accountKeys || [];
  const balances = new Map();

  for (const entry of transaction?.meta?.preTokenBalances || []) {
    if (entry.mint !== mint) continue;
    balances.set(entry.accountIndex, {
      owner: String(entry.owner || accountKeyAt(accountKeys, entry.accountIndex)),
      pre: asRawAmount(entry.uiTokenAmount?.amount),
      post: 0n
    });
  }
  for (const entry of transaction?.meta?.postTokenBalances || []) {
    if (entry.mint !== mint) continue;
    const current = balances.get(entry.accountIndex) || { pre: 0n, post: 0n };
    balances.set(entry.accountIndex, {
      ...current,
      owner: String(entry.owner || current.owner || accountKeyAt(accountKeys, entry.accountIndex)),
      post: asRawAmount(entry.uiTokenAmount?.amount)
    });
  }
  return balances;
}

export function extractTransferFlows({ transaction, signature, mint, supply, decimals }) {
  if (!transaction || transaction.meta?.err) return [];
  const changes = new Map();
  for (const balance of tokenBalancesByAccount(transaction, mint).values()) {
    const delta = balance.post - balance.pre;
    changes.set(balance.owner, (changes.get(balance.owner) || 0n) + delta);
  }

  const sources = [...changes]
    .filter(([, delta]) => delta < 0n)
    .map(([address, delta]) => ({ address, remaining: -delta }));
  const destinations = [...changes]
    .filter(([, delta]) => delta > 0n)
    .map(([address, delta]) => ({ address, remaining: delta }));
  const flows = [];
  let sourceIndex = 0;
  let destinationIndex = 0;

  while (sourceIndex < sources.length && destinationIndex < destinations.length) {
    const source = sources[sourceIndex];
    const destination = destinations[destinationIndex];
    const amount = source.remaining < destination.remaining
      ? source.remaining
      : destination.remaining;
    if (amount > 0n && source.address !== destination.address) {
      flows.push({
        signature,
        slot: transaction.slot || null,
        blockTime: transaction.blockTime || null,
        from: source.address,
        to: destination.address,
        amountBaseUnits: amount.toString(),
        amountTokens: formatBaseUnits(amount, decimals),
        percentSupply: percentOfSupply(amount, supply)
      });
    }
    source.remaining -= amount;
    destination.remaining -= amount;
    if (source.remaining === 0n) sourceIndex += 1;
    if (destination.remaining === 0n) destinationIndex += 1;
  }
  return flows;
}

export function summarizeDistribution({ largestAccounts, accountInfos, supply, decimals }) {
  const accounts = largestAccounts.map((account, index) => {
    const parsed = accountInfos[index]?.data?.parsed?.info;
    const amount = asRawAmount(account.amount);
    return {
      rank: index + 1,
      tokenAccount: String(account.address),
      owner: String(parsed?.owner || account.address),
      amountBaseUnits: amount.toString(),
      amountTokens: formatBaseUnits(amount, decimals),
      percentSupply: percentOfSupply(amount, supply)
    };
  });
  const total = (count) => accounts
    .slice(0, count)
    .reduce((sum, account) => sum + asRawAmount(account.amountBaseUnits), 0n);

  return {
    accountCount: accounts.length,
    mappedOwnerCount: new Set(accounts.map((account) => account.owner)).size,
    concentration: {
      largestAccountPercent: percentOfSupply(total(1), supply),
      top5AccountsPercent: percentOfSupply(total(5), supply),
      top10AccountsPercent: percentOfSupply(total(10), supply),
      top20AccountsPercent: percentOfSupply(total(20), supply)
    },
    accounts
  };
}

class SolanaRpc {
  constructor({ url, fetchImpl }) {
    this.url = url;
    this.fetchImpl = fetchImpl;
    this.id = 0;
  }

  async call(method, params) {
    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
        signal: AbortSignal.timeout(15_000)
      });
    } catch (error) {
      throw rpcError("The Solana RPC could not be reached.", error);
    }
    if (!response.ok) throw rpcError(`The Solana RPC returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload.error) {
      throw rpcError(`Solana RPC ${method} failed: ${payload.error.message || "unknown error"}`);
    }
    return payload.result;
  }
}

async function readFreshSnapshot({ rpc, mint, now }) {
  const [supplyResult, largestResult] = await Promise.all([
    rpc.call("getTokenSupply", [mint, { commitment: "confirmed" }]),
    rpc.call("getTokenLargestAccounts", [mint, { commitment: "confirmed" }])
  ]);
  const supply = String(supplyResult.value.amount);
  const decimals = Number(supplyResult.value.decimals);
  const largestAccounts = largestResult.value || [];
  const accountResult = await rpc.call("getMultipleAccounts", [
    largestAccounts.map((account) => account.address),
    { encoding: "jsonParsed", commitment: "confirmed" }
  ]);
  const distribution = summarizeDistribution({
    largestAccounts,
    accountInfos: accountResult.value || [],
    supply,
    decimals
  });

  const signatureLists = await Promise.all(distribution.accounts
    .slice(0, FLOW_ACCOUNT_LIMIT)
    .map((account) => rpc.call("getSignaturesForAddress", [
      account.tokenAccount,
      { limit: FLOW_SIGNATURE_LIMIT, commitment: "confirmed" }
    ]).catch(() => [])));
  const recentSignatures = [...new Map(signatureLists.flat()
    .filter((entry) => !entry.err)
    .sort((left, right) => (right.blockTime || 0) - (left.blockTime || 0))
    .map((entry) => [entry.signature, entry])).values()]
    .slice(0, FLOW_TRANSACTION_LIMIT);
  const transactions = await Promise.all(recentSignatures.map(async (entry) => ({
    signature: entry.signature,
    transaction: await rpc.call("getTransaction", [
      entry.signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }
    ]).catch(() => null)
  })));
  const flowItems = transactions.flatMap(({ transaction, signature }) => extractTransferFlows({
    transaction,
    signature,
    mint,
    supply,
    decimals
  })).sort((left, right) => (right.blockTime || 0) - (left.blockTime || 0));

  return {
    schemaVersion: 1,
    mint,
    generatedAt: new Date(now()).toISOString(),
    slot: Math.max(Number(supplyResult.context?.slot || 0), Number(largestResult.context?.slot || 0)),
    stale: false,
    supply: {
      amountBaseUnits: supply,
      amountTokens: formatBaseUnits(supply, decimals),
      decimals
    },
    distribution,
    flows: {
      accountsSampled: Math.min(distribution.accounts.length, FLOW_ACCOUNT_LIMIT),
      transactionsScanned: transactions.filter((item) => item.transaction).length,
      items: flowItems.slice(0, 12)
    },
    limits: [
      "Distribution covers the 20 largest token accounts returned by Solana RPC, not every holder.",
      "Recent flows sample transactions touching the five largest token accounts; this is not a complete transfer history.",
      "Flow routes pair net balance decreases with net increases; complex multi-party transactions can be ambiguous.",
      "Owner addresses can be wallets, programs, exchanges, or liquidity systems. Labels are not guessed."
    ]
  };
}

export function createTokenMonitor({
  mint,
  rpcUrl = DEFAULT_RPC_URL,
  fetchImpl = fetch,
  now = Date.now,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS
}) {
  const rpc = new SolanaRpc({ url: rpcUrl, fetchImpl });
  let cached = null;
  let inFlight = null;

  return {
    async read() {
      if (cached && now() - new Date(cached.generatedAt).getTime() < cacheTtlMs) return cached;
      if (!inFlight) {
        inFlight = readFreshSnapshot({ rpc, mint, now })
          .then((snapshot) => {
            cached = snapshot;
            return snapshot;
          })
          .catch((error) => {
            if (!cached) throw error;
            return {
              ...cached,
              stale: true,
              warning: "Live Solana data is temporarily unavailable. Showing the last good snapshot."
            };
          })
          .finally(() => {
            inFlight = null;
          });
      }
      return inFlight;
    }
  };
}

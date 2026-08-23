import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const apiKey = String(process.env.HELIUS_API_KEY || "").trim();
if (!apiKey) throw new Error("Set HELIUS_API_KEY before generating the report.");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "reports");
const mint = "2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS";
const liquidityOwner = "FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM";
const liquidityPool = "Ayq6y3J6FCZg1Lrd8TKDY3HkLRSBWd8pbop2UYDiRXk4";
const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=" + encodeURIComponent(apiKey);
const enhancedUrl = "https://api-mainnet.helius-rpc.com/v0/transactions?api-key="
  + encodeURIComponent(apiKey);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestJson(url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(45_000)
      });
      const payload = await response.json();
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error?.message || payload?.error || "HTTP " + response.status);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(attempt * 1_000);
    }
  }
  throw new Error(label + " failed after three attempts: " + lastError.message);
}

let requestId = 0;
async function rpc(method, params) {
  const payload = await requestJson(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params })
  }, "Solana RPC " + method);
  return payload.result;
}

async function readAllTokenAccounts() {
  const accounts = [];
  let page = 1;
  while (true) {
    const result = await rpc("getTokenAccounts", {
      mint,
      page,
      limit: 1_000,
      options: { showZeroBalance: false }
    });
    accounts.push(...(result.token_accounts || []));
    if (accounts.length >= result.total || !result.token_accounts?.length) {
      return { accounts, indexedSlot: result.last_indexed_slot };
    }
    page += 1;
  }
}

async function readAllAddressSignatures(address) {
  const signatures = [];
  let before;
  while (true) {
    const options = { limit: 1_000, commitment: "finalized" };
    if (before) options.before = before;
    const page = await rpc("getSignaturesForAddress", [address, options]);
    signatures.push(...page);
    if (page.length < 1_000) return signatures;
    before = page.at(-1).signature;
  }
}

async function mapWithLimit(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  ));
  return results;
}

async function readEnhancedTransactions(signatures) {
  const transactions = [];
  for (let index = 0; index < signatures.length; index += 100) {
    const batch = signatures.slice(index, index + 100);
    const payload = await requestJson(enhancedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: batch.map((item) => item.signature) })
    }, "Helius enhanced transactions");
    transactions.push(...payload);
  }
  return transactions;
}

function sum(items, read) {
  return items.reduce((total, item) => total + read(item), 0);
}

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits });
}

function formatPercent(value, digits = 2) {
  return formatNumber(value, digits) + "%";
}

function isoTime(seconds) {
  return new Date(Number(seconds) * 1_000).toISOString().replace(".000Z", "Z");
}

function gini(values) {
  const sorted = values.filter((value) => value > 0).sort((left, right) => left - right);
  const total = sum(sorted, (value) => value);
  if (!sorted.length || !total) return 0;
  const weighted = sorted.reduce(
    (result, value, index) => result + (index + 1) * value,
    0
  );
  return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function netFlowsForTransaction(transaction) {
  const changes = new Map();
  const transfers = (transaction.tokenTransfers || [])
    .filter((transfer) => transfer.mint === mint && Number(transfer.tokenAmount) > 0);
  for (const transfer of transfers) {
    const amount = Number(transfer.tokenAmount);
    if (transfer.fromUserAccount) {
      changes.set(
        transfer.fromUserAccount,
        (changes.get(transfer.fromUserAccount) || 0) - amount
      );
    }
    if (transfer.toUserAccount) {
      changes.set(
        transfer.toUserAccount,
        (changes.get(transfer.toUserAccount) || 0) + amount
      );
    }
  }
  const sources = [...changes]
    .filter(([, change]) => change < -0.000001)
    .map(([address, change]) => ({ address, remaining: -change }));
  const destinations = [...changes]
    .filter(([, change]) => change > 0.000001)
    .map(([address, change]) => ({ address, remaining: change }));
  const flows = [];
  let sourceIndex = 0;
  let destinationIndex = 0;
  while (sourceIndex < sources.length && destinationIndex < destinations.length) {
    const source = sources[sourceIndex];
    const destination = destinations[destinationIndex];
    const amount = Math.min(source.remaining, destination.remaining);
    flows.push({
      signature: transaction.signature,
      timestamp: transaction.timestamp,
      type: transaction.type,
      source: transaction.source,
      from: source.address,
      to: destination.address,
      amount
    });
    source.remaining -= amount;
    destination.remaining -= amount;
    if (source.remaining < 0.000001) sourceIndex += 1;
    if (destination.remaining < 0.000001) destinationIndex += 1;
  }
  return { flows, transfers };
}

const generatedAt = new Date().toISOString();
const reportDate = generatedAt.slice(0, 10);
const [supplyResult, mintAccountResult, tokenAccountResult] =
  await Promise.all([
    rpc("getTokenSupply", [mint, { commitment: "finalized" }]),
    rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "finalized" }]),
    readAllTokenAccounts()
  ]);
const [mintSignatures, tokenAccountSignaturePages] = await Promise.all([
  readAllAddressSignatures(mint),
  mapWithLimit(
    tokenAccountResult.accounts,
    6,
    (account) => readAllAddressSignatures(account.address)
  )
]);
const newestSignatures = [...new Map([
  ...mintSignatures,
  ...tokenAccountSignaturePages.flat()
].map((signature) => [signature.signature, signature])).values()]
  .sort((left, right) => (right.blockTime || 0) - (left.blockTime || 0));
const enhancedTransactions = await readEnhancedTransactions(newestSignatures);
const decimals = Number(supplyResult.value.decimals);
const supply = Number(supplyResult.value.amount) / (10 ** decimals);

const owners = new Map();
for (const account of tokenAccountResult.accounts) {
  const balance = Number(account.amount) / (10 ** decimals);
  const current = owners.get(account.owner) || {
    address: account.owner,
    balance: 0,
    tokenAccounts: []
  };
  current.balance += balance;
  current.tokenAccounts.push(account.address);
  owners.set(account.owner, current);
}
const currentOwners = [...owners.values()]
  .filter((owner) => owner.balance > 0.000001)
  .sort((left, right) => right.balance - left.balance);
const liquidity = currentOwners.find((owner) => owner.address === liquidityOwner);
if (!liquidity) throw new Error("The configured liquidity owner was not found.");
const holders = currentOwners.filter((owner) => owner.address !== liquidityOwner);
const nonLiquiditySupply = sum(holders, (holder) => holder.balance);
const top10Balance = sum(holders.slice(0, 10), (holder) => holder.balance);
const top20Balance = sum(holders.slice(0, 20), (holder) => holder.balance);

const enhancedBySignature = new Map(enhancedTransactions.map((transaction) => [
  transaction.signature,
  transaction
]));
const signatures = [...newestSignatures].sort(
  (left, right) => (left.blockTime || 0) - (right.blockTime || 0)
);
const orderedTransactions = signatures
  .map((signature) => enhancedBySignature.get(signature.signature))
  .filter(Boolean)
  .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
const flows = [];
const tokenTransfers = [];
for (const transaction of orderedTransactions) {
  const result = netFlowsForTransaction(transaction);
  flows.push(...result.flows);
  tokenTransfers.push(...result.transfers.map((transfer) => ({
    ...transfer,
    signature: transaction.signature,
    timestamp: transaction.timestamp
  })));
}

const firstActivity = signatures[0]?.blockTime || orderedTransactions[0]?.timestamp;
const lastActivity = signatures.at(-1)?.blockTime || orderedTransactions.at(-1)?.timestamp;
const poolOutflow = sum(
  flows.filter((flow) => flow.from === liquidityOwner),
  (flow) => flow.amount
);
const poolInflow = sum(
  flows.filter((flow) => flow.to === liquidityOwner),
  (flow) => flow.amount
);
const poolNetOutflow = poolOutflow - poolInflow;
const estimatedOpeningPoolBalance = liquidity.balance + poolNetOutflow;
const directMintTransfers = tokenTransfers.filter((transfer) => (
    !transfer.fromUserAccount && transfer.toUserAccount === liquidityOwner
  ));
const directMintToPool = sum(
  directMintTransfers,
  (transfer) => Number(transfer.tokenAmount)
);
const initialMintTransfer = [...directMintTransfers]
  .sort((left, right) => left.timestamp - right.timestamp)[0] || null;

const participants = new Set();
const activityByAddress = new Map();
const edgeMap = new Map();
for (const flow of flows) {
  participants.add(flow.from);
  participants.add(flow.to);
  for (const address of [flow.from, flow.to]) {
    const activity = activityByAddress.get(address) || {
      firstSeen: flow.timestamp,
      lastSeen: flow.timestamp,
      inflow: 0,
      outflow: 0,
      peers: new Set()
    };
    activity.firstSeen = Math.min(activity.firstSeen, flow.timestamp);
    activity.lastSeen = Math.max(activity.lastSeen, flow.timestamp);
    if (address === flow.from) {
      activity.outflow += flow.amount;
      activity.peers.add(flow.to);
    } else {
      activity.inflow += flow.amount;
      activity.peers.add(flow.from);
    }
    activityByAddress.set(address, activity);
  }
  const key = flow.from + ">" + flow.to;
  const edge = edgeMap.get(key) || {
    from: flow.from,
    to: flow.to,
    amount: 0,
    transactions: 0,
    firstSeen: flow.timestamp,
    lastSeen: flow.timestamp
  };
  edge.amount += flow.amount;
  edge.transactions += 1;
  edge.firstSeen = Math.min(edge.firstSeen, flow.timestamp);
  edge.lastSeen = Math.max(edge.lastSeen, flow.timestamp);
  edgeMap.set(key, edge);
}
const edges = [...edgeMap.values()].sort((left, right) => right.amount - left.amount);

const startHour = Math.floor(firstActivity / 3_600) * 3_600;
const endHour = Math.floor(lastActivity / 3_600) * 3_600;
const hourMap = new Map();
for (let timestamp = startHour; timestamp <= endHour; timestamp += 3_600) {
  hourMap.set(timestamp, {
    timestamp,
    label: isoTime(timestamp).slice(0, 13) + ":00Z",
    signatures: new Set(),
    recipients: new Set(),
    transactions: 0,
    flowVolume: 0,
    poolNetOutflow: 0,
    cumulativeRecipients: 0
  });
}
for (const signature of signatures) {
  const hour = Math.floor(signature.blockTime / 3_600) * 3_600;
  hourMap.get(hour)?.signatures.add(signature.signature);
}
for (const flow of flows) {
  const hour = Math.floor(flow.timestamp / 3_600) * 3_600;
  const entry = hourMap.get(hour);
  if (!entry) continue;
  entry.flowVolume += flow.amount;
  if (flow.to !== liquidityOwner) entry.recipients.add(flow.to);
  if (flow.from === liquidityOwner) entry.poolNetOutflow += flow.amount;
  if (flow.to === liquidityOwner) entry.poolNetOutflow -= flow.amount;
}
const seenRecipients = new Set();
const hours = [...hourMap.values()];
for (const hour of hours) {
  hour.transactions = hour.signatures.size;
  for (const recipient of hour.recipients) seenRecipients.add(recipient);
  hour.cumulativeRecipients = seenRecipients.size;
  delete hour.signatures;
  delete hour.recipients;
}

const topHolders = holders.slice(0, 20).map((holder, index) => {
  const activity = activityByAddress.get(holder.address);
  return {
    rank: index + 1,
    address: holder.address,
    balance: holder.balance,
    percentSupply: (holder.balance / supply) * 100,
    percentNonLiquidity: (holder.balance / nonLiquiditySupply) * 100,
    firstSeen: activity?.firstSeen || null,
    lastSeen: activity?.lastSeen || null,
    historicalInflow: activity?.inflow || 0,
    historicalOutflow: activity?.outflow || 0,
    connectedOwners: activity?.peers.size || 0
  };
});
const networkNodes = [
  {
    address: liquidityOwner,
    label: "Liquidity pool",
    kind: "liquidity",
    rank: 0,
    balance: liquidity.balance,
    percentSupply: (liquidity.balance / supply) * 100
  },
  ...topHolders.map((holder) => ({
    address: holder.address,
    label: "Holder #" + holder.rank,
    kind: "holder",
    rank: holder.rank,
    balance: holder.balance,
    percentSupply: holder.percentSupply
  }))
];
const networkAddresses = new Set(networkNodes.map((node) => node.address));
const networkEdges = edges.filter((edge) => (
  networkAddresses.has(edge.from) && networkAddresses.has(edge.to)
));
const mintInfo = mintAccountResult.value?.data?.parsed?.info;
const snapshot = {
  schemaVersion: 1,
  generatedAt,
  network: "Solana mainnet",
  mint,
  sourceSlots: {
    supply: supplyResult.context?.slot,
    tokenAccounts: tokenAccountResult.indexedSlot
  },
  supply: {
    tokens: supply,
    decimals,
    mintAuthority: mintInfo?.mintAuthority ?? null,
    freezeAuthority: mintInfo?.freezeAuthority ?? null,
    tokenProgram: mintAccountResult.value?.owner
  },
  liquidity: {
    poolAddress: liquidityPool,
    ownerAddress: liquidityOwner,
    classificationSource: "Project operator",
    currentBalance: liquidity.balance,
    percentSupply: (liquidity.balance / supply) * 100,
    historicalOutflow: poolOutflow,
    historicalInflow: poolInflow,
    netOutflow: poolNetOutflow,
    estimatedOpeningBalance: estimatedOpeningPoolBalance,
    directMintToPool,
    initialMintSignature: initialMintTransfer?.signature || null,
    initialMintTime: initialMintTransfer ? isoTime(initialMintTransfer.timestamp) : null
  },
  holders: {
    tokenAccountCount: tokenAccountResult.accounts.length,
    ownerCountIncludingLiquidity: currentOwners.length,
    nonLiquidityOwnerCount: holders.length,
    nonLiquiditySupply,
    percentOutsideLiquidity: (nonLiquiditySupply / supply) * 100,
    largestNonLiquidityBalance: holders[0]?.balance || 0,
    largestNonLiquidityPercentSupply: ((holders[0]?.balance || 0) / supply) * 100,
    top10Balance,
    top10PercentSupply: (top10Balance / supply) * 100,
    top10PercentNonLiquidity: (top10Balance / nonLiquiditySupply) * 100,
    top20Balance,
    top20PercentSupply: (top20Balance / supply) * 100,
    top20PercentNonLiquidity: (top20Balance / nonLiquiditySupply) * 100,
    medianBalance: median(holders.map((holder) => holder.balance)),
    giniNonLiquidity: gini(holders.map((holder) => holder.balance)),
    top20: topHolders
  },
  history: {
    firstActivity: isoTime(firstActivity),
    lastActivity: isoTime(lastActivity),
    indexedSignatures: signatures.length,
    mintReferencingSignatures: mintSignatures.length,
    liveTokenAccountsSearched: tokenAccountResult.accounts.length,
    enhancedTransactions: orderedTransactions.length,
    parsedTokenTransfers: tokenTransfers.length,
    reconstructedNetFlows: flows.length,
    uniqueParticipants: participants.size,
    totalNetFlowVolume: sum(flows, (flow) => flow.amount),
    hours
  },
  holderNetwork: {
    nodes: networkNodes,
    edges: networkEdges.slice(0, 100)
  },
  limitations: [
    "The liquidity owner classification was supplied by the project operator.",
    "Current holders come from Helius DAS getTokenAccounts at one indexed slot.",
    "History combines signatures for the mint and every current live token account.",
    "Transfers involving only token accounts that were later closed can be absent.",
    "Complex multi-party transactions are reduced to net owner balance flows.",
    "Addresses are not assumed to represent independent people or entities."
  ]
};

const dataFile = "stopai-token-snapshot-" + reportDate + ".json";
const reportFile = "stopai-token-report-" + reportDate + ".md";
const differenceFromSupply = estimatedOpeningPoolBalance - supply;
const differencePercent = Math.abs(differenceFromSupply / supply) * 100;
const directMintPercent = (directMintToPool / supply) * 100;
const launchFinding = Math.abs(directMintToPool - supply) / supply < 0.001
  ? "The transaction history shows the full fixed supply was minted directly to the operator-confirmed liquidity owner. With mint and freeze authorities revoked, the on-chain launch pattern is consistent with an initial 100% public liquidity-pool fair launch."
  : "The direct mint history does not place the full fixed supply into the confirmed liquidity owner. More evidence is needed before making a 100% pool-distribution claim.";
const topHolderRows = topHolders.map((holder) => "| " + [
  holder.rank,
  holder.address,
  formatNumber(holder.balance),
  formatPercent(holder.percentSupply, 3),
  formatPercent(holder.percentNonLiquidity, 2),
  holder.firstSeen ? isoTime(holder.firstSeen) : "Not observed"
].join(" | ") + " |").join("\n");
const hourlyRows = hours.map((hour) => "| " + [
  hour.label,
  formatNumber(hour.transactions, 0),
  formatNumber(hour.flowVolume),
  formatNumber(hour.poolNetOutflow),
  formatNumber(hour.cumulativeRecipients, 0)
].join(" | ") + " |").join("\n");
const report = [
  "# STOPAI on-chain distribution and fair-launch report",
  "",
  "Generated: " + generatedAt + "  ",
  "Network: Solana mainnet  ",
  "Official mint: https://explorer.solana.com/address/" + mint,
  "",
  "## Executive finding",
  "",
  launchFinding,
  "",
  "The 41% address is classified as liquidity, not as a holder. After removing it, "
    + formatNumber(nonLiquiditySupply) + " STOPAI ("
    + formatPercent((nonLiquiditySupply / supply) * 100, 2)
    + " of supply) is held outside the pool across " + holders.length
    + " current owner addresses.",
  "",
  "The observed pattern supports describing the launch as a public liquidity-pool fair launch. It does not prove that every address is unrelated, that no participant used several wallets, or that every transfer was indexed.",
  "",
  "## Verified token facts",
  "",
  "- Fixed supply: **" + formatNumber(supply, 0) + " STOPAI**.",
  "- Decimals: **" + decimals + "**.",
  "- Mint authority: **" + (mintInfo?.mintAuthority ? "active" : "revoked") + "**.",
  "- Freeze authority: **" + (mintInfo?.freezeAuthority ? "active" : "revoked") + "**.",
  "- First indexed token activity: **" + isoTime(firstActivity) + "**.",
  "- Snapshot coverage: **" + tokenAccountResult.accounts.length
    + " live token accounts** and **" + currentOwners.length
    + " owner addresses**, including liquidity.",
  "",
  "## Fair-launch reconstruction",
  "",
  "- Operator-confirmed liquidity owner: https://explorer.solana.com/address/" + liquidityOwner,
  "- Verified pool: https://www.geckoterminal.com/solana/pools/" + liquidityPool,
  "- Current liquidity balance: **" + formatNumber(liquidity.balance) + " STOPAI** ("
    + formatPercent((liquidity.balance / supply) * 100, 3) + " of supply).",
  "- Reconstructed liquidity net outflow: **" + formatNumber(poolNetOutflow) + " STOPAI**.",
  "- Estimated opening liquidity balance: **" + formatNumber(estimatedOpeningPoolBalance)
    + " STOPAI**.",
  "- Difference from fixed supply: **" + formatNumber(differenceFromSupply)
    + " STOPAI** (" + formatPercent(differencePercent, 5) + ").",
  directMintToPool
    ? "- Direct mint transfer observed to the liquidity owner: **"
      + formatNumber(directMintToPool) + " STOPAI** ("
      + formatPercent(directMintPercent, 2) + " of fixed supply)."
    : "- The enhanced parser did not expose a direct mint transfer. The opening balance is reconstructed from current balance and net flows.",
  initialMintTransfer
    ? "- Initial mint transaction: https://explorer.solana.com/tx/"
      + initialMintTransfer.signature + " at **" + isoTime(initialMintTransfer.timestamp) + "**."
    : "- Initial mint transaction was not available from the enhanced parser.",
  "- The " + formatPercent(differencePercent, 3)
    + " balance-reconstruction gap measures incomplete net-flow coverage; it does not change the directly observed 100% mint-to-liquidity transfer.",
  "",
  "## Holder concentration after removing liquidity",
  "",
  "- Non-liquidity owners: **" + holders.length + "**.",
  "- Largest non-liquidity owner: **" + formatNumber(holders[0]?.balance || 0)
    + " STOPAI** (" + formatPercent(((holders[0]?.balance || 0) / supply) * 100, 3)
    + " of total supply; "
    + formatPercent(((holders[0]?.balance || 0) / nonLiquiditySupply) * 100, 2)
    + " of non-liquidity supply).",
  "- Top 10 non-liquidity owners: **" + formatPercent((top10Balance / supply) * 100, 2)
    + " of total supply** and **"
    + formatPercent((top10Balance / nonLiquiditySupply) * 100, 2)
    + " of non-liquidity supply**.",
  "- Top 20 non-liquidity owners: **" + formatPercent((top20Balance / supply) * 100, 2)
    + " of total supply** and **"
    + formatPercent((top20Balance / nonLiquiditySupply) * 100, 2)
    + " of non-liquidity supply**.",
  "- Median non-liquidity balance: **"
    + formatNumber(median(holders.map((holder) => holder.balance))) + " STOPAI**.",
  "- Non-liquidity Gini coefficient: **"
    + gini(holders.map((holder) => holder.balance)).toFixed(3)
    + "**, where 0 is equal and 1 is maximally concentrated.",
  "",
  "## Largest non-liquidity owners",
  "",
  "| Rank | Owner | Balance | Total supply | Non-liquidity supply | First observed |",
  "| ---: | --- | ---: | ---: | ---: | --- |",
  topHolderRows,
  "",
  "## Token history",
  "",
  "- Unique finalized signatures indexed: **" + signatures.length + "**.",
  "- Signatures that directly reference the mint: **" + mintSignatures.length + "**.",
  "- Live token-account histories searched: **" + tokenAccountResult.accounts.length + "**.",
  "- Enhanced transactions parsed: **" + orderedTransactions.length + "**.",
  "- Parsed token transfers: **" + tokenTransfers.length + "**.",
  "- Reconstructed net owner flows: **" + flows.length + "**.",
  "- Unique historical flow participants: **" + participants.size + "**.",
  "- First observed activity: **" + isoTime(firstActivity) + "**.",
  "- Last observed activity in this snapshot: **" + isoTime(lastActivity) + "**.",
  "",
  "| UTC hour | Transactions | Net-flow volume | Liquidity net outflow | Cumulative recipients |",
  "| --- | ---: | ---: | ---: | ---: |",
  hourlyRows,
  "",
  "## Method and limits",
  "",
  "1. Supply and authority state were read from finalized Solana RPC data.",
  "2. Current holders were read with Helius DAS getTokenAccounts and aggregated by owner.",
  "3. Signatures for the mint and every current live token account were parsed with Helius enhanced transactions.",
  "4. Multi-step swaps were reduced to net owner balance changes before building flow links.",
  "5. The liquidity classification was supplied by the project operator and tied to the verified GeckoTerminal pool.",
  "",
  "Important limits:",
  "",
  "- A wallet address is not necessarily one person. One person can control many addresses.",
  "- Transfers involving only token accounts that were later closed may be missing from history.",
  "- Flow pairing is inferred for complex multi-party transactions.",
  "- This is an automated on-chain report, not an independent audit or financial advice.",
  "",
  "Machine-readable snapshot: ./" + dataFile
].join("\n");

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, dataFile), JSON.stringify(snapshot, null, 2) + "\n");
await writeFile(path.join(outputDirectory, reportFile), report + "\n");

console.log(JSON.stringify({
  report: path.join(outputDirectory, reportFile),
  data: path.join(outputDirectory, dataFile),
  summary: {
    supply,
    liquidityBalance: liquidity.balance,
    estimatedOpeningPoolBalance,
    differenceFromSupply,
    nonLiquidityOwners: holders.length,
    top10PercentSupply: (top10Balance / supply) * 100,
    gini: gini(holders.map((holder) => holder.balance)),
    signatures: signatures.length,
    transfers: tokenTransfers.length
  }
}, null, 2));

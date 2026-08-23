const OFFICIAL_API = "https://stopai-coin.fly.dev";

export function shortAddress(address) {
  const value = String(address || "");
  return value.length > 12 ? `${value.slice(0, 5)}…${value.slice(-5)}` : value;
}

export function formatPercent(value) {
  const percent = Number(value || 0);
  if (percent > 0 && percent < 0.0001) return "<0.0001%";
  return `${percent.toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
}

export function formatTokens(value) {
  return Number(value || 0).toLocaleString(undefined, {
    notation: Number(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Number(value) >= 1_000_000 ? 2 : 4
  });
}

function apiBase() {
  const location = globalThis.location;
  if (!location || location.hostname === "stopai-coin.fly.dev" || location.port === "8080") {
    return "";
  }
  return OFFICIAL_API;
}

function addressLink(address, label = shortAddress(address)) {
  const link = document.createElement("a");
  link.href = `https://explorer.solana.com/address/${encodeURIComponent(address)}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  link.title = address;
  return link;
}

function renderDistribution(snapshot) {
  const accounts = snapshot.distribution.accounts.slice(0, 10);
  const list = document.querySelector("#distribution-list");
  list.replaceChildren();
  for (const account of accounts) {
    const item = document.createElement("li");
    const heading = document.createElement("div");
    const rank = document.createElement("span");
    const amount = document.createElement("strong");
    const bar = document.createElement("span");
    const fill = document.createElement("span");

    rank.textContent = `#${account.rank} `;
    rank.append(addressLink(account.owner));
    amount.textContent = `${formatTokens(account.amountTokens)} · ${formatPercent(account.percentSupply)}`;
    heading.append(rank, amount);
    bar.className = "distribution-bar";
    fill.style.width = `${Math.max(0.4, Math.min(100, account.percentSupply))}%`;
    bar.append(fill);
    item.append(heading, bar);
    list.append(item);
  }
}

function renderFlows(snapshot) {
  const list = document.querySelector("#flow-map-list");
  list.replaceChildren();
  if (!snapshot.flows.items.length) {
    const item = document.createElement("li");
    item.className = "monitor-empty";
    item.textContent = "No clear owner-to-owner movement was found in this small recent sample.";
    list.append(item);
    return;
  }

  for (const flow of snapshot.flows.items) {
    const item = document.createElement("li");
    const route = document.createElement("div");
    const arrow = document.createElement("span");
    const detail = document.createElement("div");
    const amount = document.createElement("strong");
    const transaction = document.createElement("a");

    arrow.className = "flow-arrow";
    arrow.textContent = "→";
    route.append(addressLink(flow.from), arrow, addressLink(flow.to));
    amount.textContent = `${formatTokens(flow.amountTokens)} STOPAI`;
    transaction.href = `https://explorer.solana.com/tx/${encodeURIComponent(flow.signature)}`;
    transaction.target = "_blank";
    transaction.rel = "noreferrer";
    transaction.textContent = flow.blockTime
      ? `${new Date(flow.blockTime * 1_000).toLocaleString()} ↗`
      : "View transaction ↗";
    detail.append(amount, transaction);
    item.append(route, detail);
    list.append(item);
  }
}

export function renderTokenMonitor(snapshot) {
  document.querySelector("#monitor-supply").textContent =
    Number(snapshot.supply.amountTokens).toLocaleString();
  document.querySelector("#monitor-largest").textContent =
    formatPercent(snapshot.distribution.concentration.largestAccountPercent);
  document.querySelector("#monitor-top-ten").textContent =
    formatPercent(snapshot.distribution.concentration.top10AccountsPercent);
  document.querySelector("#monitor-checked").textContent =
    new Date(snapshot.generatedAt).toLocaleString();
  document.querySelector("#monitor-sample-note").textContent =
    `${snapshot.distribution.accountCount} large accounts mapped · ${snapshot.flows.transactionsScanned} recent transactions scanned`;
  const status = document.querySelector("#monitor-status");
  status.textContent = snapshot.stale
    ? snapshot.warning
    : `Confirmed Solana data at slot ${Number(snapshot.slot).toLocaleString()}.`;
  status.dataset.state = snapshot.stale ? "stale" : "live";
  renderDistribution(snapshot);
  renderFlows(snapshot);
}

export async function loadTokenMonitor(fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase()}/api/token-monitor`, {
    headers: { Accept: "application/json" }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The token monitor could not load.");
  return payload;
}

async function start() {
  const status = document.querySelector("#monitor-status");
  try {
    renderTokenMonitor(await loadTokenMonitor());
  } catch (error) {
    status.textContent = `${error.message} Use the Solana Explorer links for direct checks.`;
    status.dataset.state = "error";
  }
}

if (typeof document !== "undefined" && document.querySelector("#token-monitor")) start();

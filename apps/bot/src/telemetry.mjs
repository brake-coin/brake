import { createHmac } from "node:crypto";

const SAFE_FIELDS = new Set([
  "update",
  "chat",
  "user",
  "updateType",
  "chatType",
  "tool",
  "model",
  "ok",
  "reason",
  "latencyMs",
  "costUsd"
]);

export function privateTelemetryId(secret, namespace, value) {
  if (!secret || value === undefined || value === null || value === "") return null;
  return createHmac("sha256", String(secret))
    .update(`${String(namespace)}:${String(value)}`)
    .digest("hex")
    .slice(0, 16);
}

export function safeTelemetryDetails(details = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_FIELDS.has(key) || value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      safe[key] = value;
      continue;
    }
    if (["latencyMs", "costUsd"].includes(key)) {
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0) safe[key] = number;
      continue;
    }
    const text = String(value).slice(0, 80);
    if (/https?:\/\//i.test(text)) continue;
    safe[key] = text;
  }
  return safe;
}

export function logBotEvent(logger, event, details = {}) {
  const record = {
    event: String(event || "unknown").replace(/[^a-z0-9_-]/gi, "_").slice(0, 60),
    ...safeTelemetryDetails(details)
  };
  logger.info(`[bot-event] ${JSON.stringify(record)}`);
  return record;
}

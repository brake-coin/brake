import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_STATE = Object.freeze({
  version: 2,
  messages: {},
  media: [],
  usage: [],
  pendingActions: []
});

function hourKey(date) {
  return date.toISOString().slice(0, 13);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function cleanState(value) {
  return {
    version: 2,
    messages: value?.messages && typeof value.messages === "object" ? value.messages : {},
    media: Array.isArray(value?.media) ? value.media : [],
    usage: Array.isArray(value?.usage) ? value.usage : [],
    pendingActions: Array.isArray(value?.pendingActions) ? value.pendingActions : []
  };
}

export class BotStore {
  #state = cleanState(EMPTY_STATE);
  #loaded = false;
  #queue = Promise.resolve();

  constructor(filePath, { now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
  }

  async load() {
    if (this.#loaded) return this;
    try {
      this.#state = cleanState(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.#loaded = true;
    this.#prune();
    return this;
  }

  recentMessages(chatId, limit = 12) {
    return (this.#state.messages[String(chatId)] || []).slice(-limit);
  }

  latestMedia(chatId, type = null) {
    return this.#state.media.find((item) => (
      item.chatId === String(chatId) && (!type || item.type === type)
    )) || null;
  }

  listMedia(chatId, { type = null, limit = 8 } = {}) {
    return this.#state.media
      .filter((item) => item.chatId === String(chatId) && (!type || item.type === type))
      .slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
  }

  findMedia(chatId, query = "latest") {
    const items = this.#state.media.filter((item) => item.chatId === String(chatId));
    const needle = String(query || "latest").trim().toLowerCase();
    if (!needle || needle === "latest") return items[0] || null;
    return items.find((item) => item.id.toLowerCase() === needle)
      || items.find((item) => item.id.toLowerCase().startsWith(needle))
      || items.find((item) => String(item.caption || "").toLowerCase().includes(needle))
      || null;
  }

  usageStatus(type, userId, limits) {
    const now = this.now();
    const currentHour = hourKey(now);
    const currentDay = dayKey(now);
    const events = this.#state.usage.filter((item) => item.type === type);
    const user = String(userId || "unknown");
    const hourly = events.filter((item) => item.hour === currentHour).length;
    const daily = events.filter((item) => item.day === currentDay).length;
    const userHourly = events.filter((item) => item.hour === currentHour && item.userId === user).length;
    const userDaily = events.filter((item) => item.day === currentDay && item.userId === user).length;
    const spendToday = this.#state.usage
      .filter((item) => item.day === currentDay)
      .reduce((sum, item) => sum + (Number(item.costUsd) || 0), 0);
    return { hourly, daily, userHourly, userDaily, spendToday, limits };
  }

  async recordMessage({ chatId, role, content }) {
    return this.#mutate((state) => {
      const key = String(chatId);
      const messages = state.messages[key] || [];
      messages.push({ role, content: String(content).slice(0, 2_000), at: this.now().toISOString() });
      state.messages[key] = messages.slice(-20);
    });
  }

  async recordMedia({ chatId, userId, type, fileId, caption = "", source = "telegram" }) {
    const record = {
      id: randomUUID(),
      chatId: String(chatId),
      userId: String(userId || "unknown"),
      type,
      fileId,
      caption: String(caption).slice(0, 1_000),
      source,
      at: this.now().toISOString()
    };
    await this.#mutate((state) => {
      state.media.unshift(record);
      state.media = state.media.slice(0, 200);
    });
    return record;
  }

  async removeMedia({ chatId, mediaId }) {
    let removed = null;
    await this.#mutate((state) => {
      const index = state.media.findIndex((item) => (
        item.chatId === String(chatId) && item.id === String(mediaId)
      ));
      if (index >= 0) [removed] = state.media.splice(index, 1);
    });
    return removed;
  }

  async stagePendingAction({ type, chatId, userId, payload, expiresInMs = 10 * 60 * 1_000 }) {
    const action = {
      id: randomUUID(),
      type,
      chatId: String(chatId),
      userId: String(userId),
      payload,
      createdAt: this.now().toISOString(),
      expiresAt: new Date(this.now().getTime() + expiresInMs).toISOString()
    };
    await this.#mutate((state) => {
      state.pendingActions = state.pendingActions.filter((item) => !(
        item.type === action.type
        && item.chatId === action.chatId
        && item.userId === action.userId
      ));
      state.pendingActions.unshift(action);
    });
    return action;
  }

  pendingAction({ type, chatId, userId }) {
    this.#prune();
    return this.#state.pendingActions.find((item) => (
      item.type === type
      && item.chatId === String(chatId)
      && item.userId === String(userId)
    )) || null;
  }

  async takePendingAction({ type, chatId, userId }) {
    let action = null;
    await this.#mutate((state) => {
      this.#prune(state);
      const index = state.pendingActions.findIndex((item) => (
        item.type === type
        && item.chatId === String(chatId)
        && item.userId === String(userId)
      ));
      if (index >= 0) [action] = state.pendingActions.splice(index, 1);
    });
    return action;
  }

  async completePendingAction(actionId) {
    await this.#mutate((state) => {
      state.pendingActions = state.pendingActions.filter((item) => item.id !== actionId);
    });
  }

  async claimUsage(type, userId, limits, { spendCapUsd = 0 } = {}) {
    let result;
    await this.#mutate((state) => {
      this.#prune(state);
      const status = this.usageStatus(type, userId, limits);
      const capChecks = [
        ["hourly", limits.hourly],
        ["daily", limits.daily],
        ["userHourly", limits.userHourly],
        ["userDaily", limits.userDaily]
      ];
      const denied = capChecks.find(([name, cap]) => cap <= 0 || status[name] >= cap);
      if (denied) {
        result = { allowed: false, reason: `${denied[0]}_cap`, status };
        return;
      }
      if (["image", "video"].includes(type) && spendCapUsd > 0 && status.spendToday >= spendCapUsd) {
        result = { allowed: false, reason: "daily_spend_cap", status };
        return;
      }
      const now = this.now();
      const event = {
        id: randomUUID(),
        type,
        userId: String(userId || "unknown"),
        hour: hourKey(now),
        day: dayKey(now),
        at: now.toISOString(),
        costUsd: 0
      };
      state.usage.push(event);
      result = { allowed: true, eventId: event.id, status };
    });
    return result;
  }

  async recordCost(eventId, costUsd) {
    if (!Number.isFinite(Number(costUsd)) || Number(costUsd) < 0) return;
    await this.#mutate((state) => {
      const event = state.usage.find((item) => item.id === eventId);
      if (event) event.costUsd = Number(costUsd);
    });
  }

  async #mutate(change) {
    this.#queue = this.#queue.catch(() => {}).then(async () => {
      await this.load();
      change(this.#state);
      await this.#save();
    });
    return this.#queue;
  }

  #prune(state = this.#state) {
    const cutoff = this.now().getTime() - (8 * 24 * 60 * 60 * 1_000);
    state.usage = state.usage.filter((item) => new Date(item.at).getTime() >= cutoff);
    state.media = state.media.slice(0, 200);
    state.pendingActions = state.pendingActions
      .filter((item) => new Date(item.expiresAt).getTime() > this.now().getTime())
      .slice(0, 50);
    for (const chatId of Object.keys(state.messages)) {
      state.messages[chatId] = state.messages[chatId].slice(-20);
    }
  }

  async #save() {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(this.#state)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    await chmod(this.filePath, 0o600);
  }
}

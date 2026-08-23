import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_STATE = Object.freeze({
  version: 4,
  messages: {},
  media: [],
  usage: [],
  agent: {
    goals: [],
    memories: [],
    research: [],
    cycles: [],
    cycleSequence: 0
  }
});

function hourKey(date) {
  return date.toISOString().slice(0, 13);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function cleanState(value) {
  const agent = value?.agent && typeof value.agent === "object" ? value.agent : {};
  return {
    version: 4,
    messages: value?.messages && typeof value.messages === "object"
      ? Object.fromEntries(Object.entries(value.messages).map(([key, messages]) => (
        [key, Array.isArray(messages) ? messages.map((item) => ({ ...item })) : []]
      )))
      : {},
    media: Array.isArray(value?.media) ? value.media.map((item) => ({ ...item })) : [],
    usage: Array.isArray(value?.usage) ? value.usage.map((item) => ({ ...item })) : [],
    agent: {
      goals: Array.isArray(agent.goals) ? agent.goals.map((item) => ({ ...item })) : [],
      memories: Array.isArray(agent.memories) ? agent.memories.map((item) => ({ ...item })) : [],
      research: Array.isArray(agent.research) ? agent.research.map((item) => ({ ...item })) : [],
      cycles: Array.isArray(agent.cycles) ? agent.cycles.map((item) => ({ ...item })) : [],
      cycleSequence: Math.max(
        Number.isFinite(Number(agent.cycleSequence)) ? Number(agent.cycleSequence) : 0,
        Array.isArray(agent.cycles) ? agent.cycles.length : 0
      )
    }
  };
}

function cleanGoal(goal) {
  const id = String(goal?.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 60);
  const text = String(goal?.text || "").trim().slice(0, 500);
  if (!id || !text) return null;
  return {
    id,
    text,
    priority: Math.max(1, Math.min(5, Number(goal?.priority) || 3)),
    active: goal?.active !== false,
    updatedAt: goal?.updatedAt || null
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

  agentSnapshot({ memoryLimit = 12, researchLimit = 12, cycleLimit = 5 } = {}) {
    const agent = this.#state.agent;
    return {
      goals: agent.goals.filter((goal) => goal.active !== false),
      memories: agent.memories.slice(0, Math.max(1, Math.min(50, memoryLimit))),
      research: agent.research.slice(0, Math.max(1, Math.min(50, researchLimit))),
      cycles: agent.cycles.slice(0, Math.max(1, Math.min(20, cycleLimit)))
    };
  }

  agentStatus() {
    const agent = this.#state.agent;
    return {
      goalCount: agent.goals.filter((goal) => goal.active !== false).length,
      memoryCount: agent.memories.length,
      researchCount: agent.research.length,
      cycleCount: agent.cycleSequence,
      lastResearchAt: agent.research.reduce((latest, item) => (
        new Date(item.lastSeenAt || 0).getTime() > new Date(latest || 0).getTime()
          ? item.lastSeenAt
          : latest
      ), null),
      lastCycle: agent.cycles[0] || null
    };
  }

  async ensureAgentGoals(goals) {
    await this.#mutate((state) => {
      const existing = new Set(state.agent.goals.map((goal) => goal.id));
      for (const input of goals || []) {
        const goal = cleanGoal(input);
        if (!goal || existing.has(goal.id)) continue;
        state.agent.goals.push({ ...goal, updatedAt: this.now().toISOString() });
        existing.add(goal.id);
      }
    });
    return this.agentSnapshot().goals;
  }

  async upsertAgentGoal(goal) {
    const cleaned = cleanGoal(goal);
    if (!cleaned) throw new Error("A goal needs an ID and text.");
    let saved;
    await this.#mutate((state) => {
      const index = state.agent.goals.findIndex((item) => item.id === cleaned.id);
      saved = { ...cleaned, updatedAt: this.now().toISOString() };
      if (index >= 0) state.agent.goals[index] = saved;
      else state.agent.goals.push(saved);
      state.agent.goals = state.agent.goals.slice(0, 30);
    });
    return saved;
  }

  async rememberAgent({ kind = "note", text, topic = "", sourceKey = "", sourceUrl = "" }) {
    const cleanText = String(text || "").trim().slice(0, 1_000);
    if (!cleanText) throw new Error("A memory needs text.");
    const record = {
      id: randomUUID(),
      kind: String(kind || "note").slice(0, 40),
      text: cleanText,
      topic: String(topic || "").trim().slice(0, 120),
      sourceKey: String(sourceKey || "").trim().slice(0, 200),
      sourceUrl: /^https:\/\//i.test(String(sourceUrl || "")) ? String(sourceUrl).slice(0, 1_000) : "",
      at: this.now().toISOString()
    };
    await this.#mutate((state) => {
      const duplicate = state.agent.memories.find((item) => (
        item.kind === record.kind && item.text.toLowerCase() === record.text.toLowerCase()
      ));
      if (duplicate) {
        duplicate.at = record.at;
        duplicate.sourceKey = record.sourceKey || duplicate.sourceKey;
        duplicate.sourceUrl = record.sourceUrl || duplicate.sourceUrl;
        state.agent.memories = [
          duplicate,
          ...state.agent.memories.filter((item) => item.id !== duplicate.id)
        ];
      } else state.agent.memories.unshift(record);
      state.agent.memories = state.agent.memories.slice(0, 250);
    });
    return record;
  }

  async recordResearch(items) {
    const saved = [];
    await this.#mutate((state) => {
      const now = this.now().toISOString();
      for (const input of items || []) {
        const key = String(input?.key || "").trim().slice(0, 200);
        const title = String(input?.title || input?.text || "").trim().slice(0, 1_000);
        const url = String(input?.url || "").trim().slice(0, 1_000);
        if (!key || !title || !/^https:\/\//i.test(url)) continue;
        const existing = state.agent.research.find((item) => item.key === key);
        if (existing) {
          Object.assign(existing, {
            ...input,
            key,
            title,
            url,
            firstSeenAt: existing.firstSeenAt,
            lastSeenAt: now,
            seenCount: (Number(existing.seenCount) || 1) + 1,
            usedAt: existing.usedAt || null,
            postedUrl: existing.postedUrl || null
          });
          saved.push(existing);
        } else {
          const record = {
            ...input,
            key,
            title,
            url,
            firstSeenAt: now,
            lastSeenAt: now,
            seenCount: 1,
            usedAt: null,
            postedUrl: null
          };
          state.agent.research.unshift(record);
          saved.push(record);
        }
      }
      state.agent.research.sort((a, b) => (
        Number(Boolean(a.usedAt)) - Number(Boolean(b.usedAt))
        || (Number(b.score) || 0) - (Number(a.score) || 0)
        || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
      ));
      state.agent.research = state.agent.research.slice(0, 500);
    });
    return saved;
  }

  async markResearchUsed(key, { postedUrl = "", sourceUrl = "", title = "" } = {}) {
    let found = null;
    await this.#mutate((state) => {
      found = state.agent.research.find((item) => item.key === String(key)) || null;
      if (!found && /^https:\/\//i.test(String(sourceUrl || ""))) {
        found = {
          key: String(key).slice(0, 200),
          kind: String(key).startsWith("x:") ? "x" : "source",
          title: String(title || "Source used in a STOPAI post").slice(0, 1_000),
          url: String(sourceUrl).slice(0, 1_000),
          firstSeenAt: this.now().toISOString(),
          lastSeenAt: this.now().toISOString(),
          seenCount: 1,
          score: 0,
          usedAt: null,
          postedUrl: null
        };
        state.agent.research.unshift(found);
      }
      if (found) {
        found.usedAt = this.now().toISOString();
        found.postedUrl = String(postedUrl || "").slice(0, 1_000) || null;
      }
    });
    return found;
  }

  async recordAgentCycle(result) {
    const record = {
      id: randomUUID(),
      ok: Boolean(result?.ok),
      action: String(result?.action || (result?.skipped ? "skip" : "error")).slice(0, 30),
      reason: String(result?.reason || "").slice(0, 500),
      sourceKey: String(result?.sourceKey || "").slice(0, 200),
      type: result?.type ? String(result.type).slice(0, 20) : null,
      url: /^https:\/\//i.test(String(result?.url || "")) ? String(result.url).slice(0, 1_000) : null,
      at: this.now().toISOString()
    };
    await this.#mutate((state) => {
      state.agent.cycleSequence += 1;
      record.sequence = state.agent.cycleSequence;
      state.agent.cycles.unshift(record);
      state.agent.cycles = state.agent.cycles.slice(0, 100);
    });
    return record;
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

  findMediaByFileId(chatId, fileId) {
    return this.#state.media.find((item) => (
      item.chatId === String(chatId) && item.fileId === String(fileId)
    )) || null;
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

  async claimUsage(type, userId, limits, {
    spendCapUsd = 0,
    globalCooldownMs = 0,
    userCooldownMs = 0
  } = {}) {
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
      const now = this.now();
      const typeEvents = state.usage.filter((item) => item.type === type);
      const latestGlobal = typeEvents.reduce((latest, item) => (
        new Date(item.at).getTime() > new Date(latest?.at || 0).getTime() ? item : latest
      ), null);
      if (globalCooldownMs > 0 && latestGlobal
        && now.getTime() - new Date(latestGlobal.at).getTime() < globalCooldownMs) {
        result = { allowed: false, reason: "global_cooldown", status };
        return;
      }
      const latestUser = typeEvents
        .filter((item) => item.userId === String(userId || "unknown"))
        .reduce((latest, item) => (
          new Date(item.at).getTime() > new Date(latest?.at || 0).getTime() ? item : latest
        ), null);
      if (userCooldownMs > 0 && latestUser
        && now.getTime() - new Date(latestUser.at).getTime() < userCooldownMs) {
        result = { allowed: false, reason: "user_cooldown", status };
        return;
      }
      if (["image", "video"].includes(type) && spendCapUsd > 0 && status.spendToday >= spendCapUsd) {
        result = { allowed: false, reason: "daily_spend_cap", status };
        return;
      }
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

  async releaseUsage(eventId) {
    let removed = false;
    await this.#mutate((state) => {
      const before = state.usage.length;
      state.usage = state.usage.filter((item) => item.id !== String(eventId));
      removed = state.usage.length < before;
    });
    return removed;
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
    state.agent.memories = state.agent.memories.slice(0, 250);
    state.agent.research = state.agent.research.slice(0, 500);
    state.agent.cycles = state.agent.cycles.slice(0, 100);
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

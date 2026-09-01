import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const UPDATE_RETENTION_MS = 8 * 24 * 60 * 60 * 1_000;
const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_TELEGRAM_UPDATES = 2_000;
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES_PER_CONVERSATION = 20;
const MAX_X_SOURCE_POSTS = 50_000;

const EMPTY_STATE = Object.freeze({
  version: 10,
  messages: {},
  media: [],
  usage: [],
  telegramUpdates: {},
  xReceipts: [],
  xSourcePosts: {},
  stickerPack: null,
  agent: {
    goals: [],
    memories: [],
    research: [],
    cycles: [],
    cycleSequence: 0,
    autonomousPostSequence: 0
  }
});

function hourKey(date) {
  return date.toISOString().slice(0, 13);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function xPostIdsInText(value) {
  const ids = new Set();
  const pattern = /(?:https?:\/\/)?(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)\/(?:i\/web\/status\/|[A-Za-z0-9_]{1,15}\/status\/)(\d{1,19})(?=$|[/?#)\]}\s.,!?;:'"])/gi;
  for (const match of String(value || "").matchAll(pattern)) ids.add(match[1]);
  return ids;
}

function cleanXSourcePosts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([sourcePostId, record]) => /^\d{1,19}$/.test(sourcePostId) && record && typeof record === "object")
    .map(([sourcePostId, record]) => [sourcePostId, {
      sourcePostId,
      sourcePostUrl: /^https:\/\/x\.com\//i.test(String(record.sourcePostUrl || ""))
        ? String(record.sourcePostUrl).slice(0, 1_000)
        : `https://x.com/i/web/status/${sourcePostId}`,
      status: ["pending", "confirmed", "uncertain"].includes(record.status)
        ? record.status
        : "uncertain",
      claimId: String(record.claimId || "").slice(0, 80),
      userId: String(record.userId || "").slice(0, 80),
      chatId: String(record.chatId || "").slice(0, 80),
      postedId: /^\d{1,19}$/.test(String(record.postedId || "")) ? String(record.postedId) : null,
      postedUrl: /^https:\/\/x\.com\//i.test(String(record.postedUrl || ""))
        ? String(record.postedUrl).slice(0, 1_000)
        : null,
      at: record.at || null,
      resolvedAt: record.resolvedAt || null
    }]));
}

function cleanTelegramUpdates(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([updateId, record]) => /^\d{1,20}$/.test(updateId) && record && typeof record === "object")
    .map(([updateId, record]) => [updateId, {
      updateId,
      at: record.at || null
    }]));
}

function cleanLegacyAssistantContent(value) {
  return String(value || "")
    .replace(/^(?:STOPAI reply to )?Telegram user \d{1,20}:\s*/i, "")
    .replace(/^STOPAI response in (?:Current member|Other member(?: \d+)?)'s turn:\s*/i, "")
    .replace(/^(?:Current member|Other member(?: \d+)?):\s*/i, "")
    .replace(/\bCurrent member\b/gi, "the member in that turn")
    .replace(/\bOther member(?: \d+)?\b/gi, "another member")
    .trim();
}

function cleanMessage(value) {
  if (!value || typeof value !== "object") return null;
  const role = ["user", "assistant"].includes(value.role) ? value.role : null;
  const content = (role === "assistant"
    ? cleanLegacyAssistantContent(value.content)
    : String(value.content || "")).slice(0, 2_000);
  if (!role || !content) return null;
  return {
    role,
    content,
    userId: String(value.userId || "unknown").slice(0, 80),
    threadId: String(value.threadId || "main").slice(0, 80),
    at: value.at || null
  };
}

function conversationKey(chatId, threadId = "main") {
  const chat = String(chatId);
  const thread = String(threadId || "main");
  return !thread || thread === "0" || thread === "main"
    ? chat
    : `${chat}:thread:${thread}`;
}

function cleanStickerPack(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = String(value.name || "").trim().slice(0, 64);
  const title = String(value.title || "").trim().slice(0, 64);
  const ownerId = Number.parseInt(value.ownerId, 10);
  if (!name || !title || !Number.isSafeInteger(ownerId) || ownerId <= 0) return null;
  return {
    name,
    title,
    ownerId,
    stickerCount: Math.max(0, Number.parseInt(value.stickerCount, 10) || 0),
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null
  };
}

function cleanState(value) {
  const agent = value?.agent && typeof value.agent === "object" ? value.agent : {};
  const cleaned = {
    version: 10,
    messages: value?.messages && typeof value.messages === "object"
      ? Object.fromEntries(Object.entries(value.messages).map(([key, messages]) => (
        [key, Array.isArray(messages) ? messages.map(cleanMessage).filter(Boolean) : []]
      )))
      : {},
    media: Array.isArray(value?.media) ? value.media.map((item) => ({ ...item })) : [],
    usage: Array.isArray(value?.usage) ? value.usage.map((item) => ({ ...item })) : [],
    telegramUpdates: cleanTelegramUpdates(value?.telegramUpdates),
    xReceipts: Array.isArray(value?.xReceipts) ? value.xReceipts.map((item) => ({ ...item })) : [],
    xSourcePosts: cleanXSourcePosts(value?.xSourcePosts),
    stickerPack: cleanStickerPack(value?.stickerPack),
    agent: {
      goals: Array.isArray(agent.goals) ? agent.goals.map((item) => ({ ...item })) : [],
      memories: Array.isArray(agent.memories) ? agent.memories.map((item) => ({ ...item })) : [],
      research: Array.isArray(agent.research) ? agent.research.map((item) => ({ ...item })) : [],
      cycles: Array.isArray(agent.cycles) ? agent.cycles.map((item) => ({ ...item })) : [],
      cycleSequence: Math.max(
        Number.isFinite(Number(agent.cycleSequence)) ? Number(agent.cycleSequence) : 0,
        Array.isArray(agent.cycles) ? agent.cycles.length : 0
      ),
      autonomousPostSequence: Math.max(
        0,
        Number.isFinite(Number(agent.autonomousPostSequence))
          ? Number(agent.autonomousPostSequence)
          : 0
      )
    }
  };
  const historicalAutonomousPosts = Math.max(
    cleaned.agent.cycles.filter((item) => (
      item?.ok && item?.action === "post" && /^https:\/\//i.test(String(item?.url || ""))
    )).length,
    cleaned.xReceipts.filter((item) => (
      item?.status === "confirmed"
      && ["autonomous-agent", "admin-live-test"].includes(item?.source)
    )).length
  );
  cleaned.agent.autonomousPostSequence = Math.max(
    cleaned.agent.autonomousPostSequence,
    historicalAutonomousPosts
  );
  for (const item of cleaned.agent.research) {
    const match = /^x:(\d{1,19})$/.exec(String(item.key || ""));
    if (!match || !item.usedAt || cleaned.xSourcePosts[match[1]]) continue;
    cleaned.xSourcePosts[match[1]] = {
      sourcePostId: match[1],
      sourcePostUrl: /^https:\/\/x\.com\//i.test(String(item.url || ""))
        ? String(item.url).slice(0, 1_000)
        : `https://x.com/i/web/status/${match[1]}`,
      status: "confirmed",
      claimId: "historical-research",
      userId: "",
      chatId: "",
      postedId: null,
      postedUrl: /^https:\/\/x\.com\//i.test(String(item.postedUrl || ""))
        ? String(item.postedUrl).slice(0, 1_000)
        : null,
      at: item.usedAt,
      resolvedAt: item.usedAt
    };
  }
  for (const receipt of cleaned.xReceipts) {
    if (receipt.status !== "confirmed") continue;
    const ids = receipt.sourcePostId ? new Set([String(receipt.sourcePostId)]) : xPostIdsInText(receipt.text);
    for (const id of ids) {
      if (!/^\d{1,19}$/.test(id) || cleaned.xSourcePosts[id]) continue;
      cleaned.xSourcePosts[id] = {
        sourcePostId: id,
        sourcePostUrl: /^https:\/\/x\.com\//i.test(String(receipt.sourcePostUrl || ""))
          ? String(receipt.sourcePostUrl).slice(0, 1_000)
          : `https://x.com/i/web/status/${id}`,
        status: "confirmed",
        claimId: "historical-receipt",
        userId: String(receipt.userId || "").slice(0, 80),
        chatId: String(receipt.chatId || "").slice(0, 80),
        postedId: /^\d{1,19}$/.test(String(receipt.id || "")) ? String(receipt.id) : null,
        postedUrl: /^https:\/\/x\.com\//i.test(String(receipt.url || ""))
          ? String(receipt.url).slice(0, 1_000)
          : null,
        at: receipt.at || null,
        resolvedAt: receipt.at || null
      };
    }
  }
  return cleaned;
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

  recentMessages(chatId, { threadId = "main", limit = MAX_MESSAGES_PER_CONVERSATION } = {}) {
    return (this.#state.messages[conversationKey(chatId, threadId)] || [])
      .slice(-Math.max(1, Math.min(
        MAX_MESSAGES_PER_CONVERSATION,
        Number(limit) || MAX_MESSAGES_PER_CONVERSATION
      )));
  }

  recentMessagesAcrossThreads(chatId, {
    excludeThreadId = "main",
    limit = 4
  } = {}) {
    const chat = String(chatId);
    const excludedKey = conversationKey(chat, excludeThreadId);
    return Object.entries(this.#state.messages)
      .filter(([key]) => (
        key !== excludedKey
        && (key === chat || key.startsWith(`${chat}:thread:`))
      ))
      .flatMap(([, messages]) => messages)
      .sort((left, right) => (
        new Date(left.at || 0).getTime() - new Date(right.at || 0).getTime()
      ))
      .slice(-Math.max(1, Math.min(8, Number(limit) || 4)));
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
      autonomousPostCount: agent.autonomousPostSequence,
      recentTelegramUpdateCount: Object.keys(this.#state.telegramUpdates).length,
      quotedSourceCount: Object.values(this.#state.xSourcePosts)
        .filter((item) => item.status === "confirmed").length,
      uncertainSourceCount: Object.values(this.#state.xSourcePosts)
        .filter((item) => item.status === "uncertain").length,
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
      for (const input of goals || []) {
        const goal = cleanGoal(input);
        if (!goal) continue;
        const index = state.agent.goals.findIndex((item) => item.id === goal.id);
        if (index < 0) {
          state.agent.goals.push({
            ...goal,
            managedDefault: true,
            operatorOverride: false,
            updatedAt: this.now().toISOString()
          });
          continue;
        }
        const current = state.agent.goals[index];
        if (current.operatorOverride === true) continue;
        if (current.text === goal.text
          && current.priority === goal.priority
          && current.active === goal.active
          && current.managedDefault === true) continue;
        state.agent.goals[index] = {
          ...goal,
          managedDefault: true,
          operatorOverride: false,
          updatedAt: this.now().toISOString()
        };
      }
    });
    return this.agentSnapshot().goals;
  }

  async claimTelegramUpdate(updateId) {
    const id = String(updateId ?? "");
    if (!/^\d{1,20}$/.test(id)) {
      return { allowed: true, reason: "untracked_update", updateId: null };
    }
    let result;
    await this.#mutate((state) => {
      this.#prune(state);
      if (state.telegramUpdates[id]) {
        result = { allowed: false, reason: "duplicate_update", updateId: id };
        return;
      }
      state.telegramUpdates[id] = { updateId: id, at: this.now().toISOString() };
      result = { allowed: true, reason: null, updateId: id };
    });
    return result;
  }

  async upsertAgentGoal(goal) {
    const cleaned = cleanGoal(goal);
    if (!cleaned) throw new Error("A goal needs an ID and text.");
    let saved;
    await this.#mutate((state) => {
      const index = state.agent.goals.findIndex((item) => item.id === cleaned.id);
      saved = {
        ...cleaned,
        managedDefault: false,
        operatorOverride: true,
        updatedAt: this.now().toISOString()
      };
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
      if (record.ok && record.action === "post" && record.url) {
        state.agent.autonomousPostSequence += 1;
      }
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

  stickerPack() {
    return this.#state.stickerPack ? { ...this.#state.stickerPack } : null;
  }

  async saveStickerPack({ name, title, ownerId, stickerCount, createdAt = null }) {
    const record = cleanStickerPack({
      name,
      title,
      ownerId,
      stickerCount,
      createdAt: createdAt || this.#state.stickerPack?.createdAt || this.now().toISOString(),
      updatedAt: this.now().toISOString()
    });
    if (!record) throw new Error("Sticker pack details are invalid.");
    await this.#mutate((state) => {
      state.stickerPack = record;
    });
    return { ...record };
  }

  recentXReceipts(limit = 10) {
    return this.#state.xReceipts.slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
  }

  async recordXReceipt({
    status,
    id = "",
    url = "",
    source = "unknown",
    userId = "",
    chatId = "",
    text = "",
    sourcePostId = "",
    sourcePostUrl = "",
    telegramShareStatus = null,
    error = ""
  }) {
    const record = {
      receiptId: randomUUID(),
      status: status === "confirmed" ? "confirmed" : "failed",
      id: /^\d{1,19}$/.test(String(id || "")) ? String(id) : null,
      url: /^https:\/\/x\.com\//i.test(String(url || "")) ? String(url).slice(0, 1_000) : null,
      source: String(source || "unknown").slice(0, 60),
      userId: String(userId || "").slice(0, 80),
      chatId: String(chatId || "").slice(0, 80),
      text: String(text || "").slice(0, 500),
      sourcePostId: /^\d{1,19}$/.test(String(sourcePostId || "")) ? String(sourcePostId) : null,
      sourcePostUrl: /^https:\/\/x\.com\//i.test(String(sourcePostUrl || ""))
        ? String(sourcePostUrl).slice(0, 1_000)
        : null,
      telegramShareStatus: status === "confirmed" && telegramShareStatus === "pending"
        ? "pending"
        : null,
      telegramShareAttempts: 0,
      telegramSharedAt: null,
      telegramMessageId: null,
      telegramChatId: null,
      telegramShareError: "",
      error: String(error || "").slice(0, 500),
      at: this.now().toISOString()
    };
    await this.#mutate((state) => {
      state.xReceipts.unshift(record);
      state.xReceipts = state.xReceipts.slice(0, 200);
    });
    return record;
  }

  pendingTelegramXReceipts(limit = 5) {
    return this.#state.xReceipts
      .filter((item) => (
        item.status === "confirmed"
        && item.source === "autonomous-agent"
        && item.telegramShareStatus === "pending"
        && item.url
      ))
      .slice(0, Math.max(1, Math.min(20, Number(limit) || 5)))
      .map((item) => ({ ...item }));
  }

  async recordXTelegramShareAttempt(receiptId, {
    messageId = null,
    chatId = "",
    error = ""
  } = {}) {
    let updated = null;
    await this.#mutate((state) => {
      const receipt = state.xReceipts.find((item) => item.receiptId === String(receiptId));
      if (!receipt || receipt.telegramShareStatus !== "pending") return;
      receipt.telegramShareAttempts = Math.max(0, Number(receipt.telegramShareAttempts) || 0) + 1;
      receipt.telegramShareLastAttemptAt = this.now().toISOString();
      receipt.telegramShareError = String(error || "").slice(0, 500);
      if (messageId !== null && messageId !== undefined && String(messageId)) {
        receipt.telegramShareStatus = "confirmed";
        receipt.telegramSharedAt = this.now().toISOString();
        receipt.telegramMessageId = String(messageId).slice(0, 80);
        receipt.telegramChatId = String(chatId || "").slice(0, 80) || null;
        receipt.telegramShareError = "";
      }
      updated = { ...receipt };
    });
    return updated;
  }

  async claimXSourcePost({ sourcePostId, sourcePostUrl = "", userId = "", chatId = "" }) {
    const id = String(sourcePostId || "");
    if (!/^\d{1,19}$/.test(id)) throw new Error("A valid X source post ID is required.");
    let result;
    await this.#mutate((state) => {
      const existing = state.xSourcePosts[id];
      if (existing) {
        const reasons = {
          confirmed: "source_already_posted",
          pending: "source_post_in_progress",
          uncertain: "source_post_status_uncertain"
        };
        result = { allowed: false, reason: reasons[existing.status], record: { ...existing } };
        return;
      }
      const research = state.agent.research.find((item) => item.key === `x:${id}` && item.usedAt);
      const receipt = state.xReceipts.find((item) => (
        item.status === "confirmed"
        && (item.sourcePostId === id || xPostIdsInText(item.text).has(id))
      ));
      if (research || receipt) {
        const historical = {
          sourcePostId: id,
          sourcePostUrl: String(sourcePostUrl || research?.url || receipt?.sourcePostUrl || "").slice(0, 1_000),
          status: "confirmed",
          claimId: "historical",
          userId: String(receipt?.userId || "").slice(0, 80),
          chatId: String(receipt?.chatId || "").slice(0, 80),
          postedId: receipt?.id || null,
          postedUrl: research?.postedUrl || receipt?.url || null,
          at: research?.usedAt || receipt?.at || this.now().toISOString(),
          resolvedAt: research?.usedAt || receipt?.at || this.now().toISOString()
        };
        state.xSourcePosts[id] = historical;
        result = { allowed: false, reason: "source_already_posted", record: { ...historical } };
        return;
      }
      const claim = {
        sourcePostId: id,
        sourcePostUrl: /^https:\/\/x\.com\//i.test(String(sourcePostUrl || ""))
          ? String(sourcePostUrl).slice(0, 1_000)
          : `https://x.com/i/web/status/${id}`,
        status: "pending",
        claimId: randomUUID(),
        userId: String(userId || "").slice(0, 80),
        chatId: String(chatId || "").slice(0, 80),
        postedId: null,
        postedUrl: null,
        at: this.now().toISOString(),
        resolvedAt: null
      };
      state.xSourcePosts[id] = claim;
      result = { allowed: true, claimId: claim.claimId, record: { ...claim } };
    });
    return result;
  }

  async confirmXSourcePost(claimId, { postedId = "", postedUrl = "" } = {}) {
    let confirmed = null;
    await this.#mutate((state) => {
      const record = Object.values(state.xSourcePosts)
        .find((item) => item.claimId === String(claimId) && item.status === "pending");
      if (!record) return;
      record.status = "confirmed";
      record.postedId = /^\d{1,19}$/.test(String(postedId || "")) ? String(postedId) : null;
      record.postedUrl = /^https:\/\/x\.com\//i.test(String(postedUrl || ""))
        ? String(postedUrl).slice(0, 1_000)
        : null;
      record.resolvedAt = this.now().toISOString();
      confirmed = { ...record };
    });
    return confirmed;
  }

  async releaseXSourcePost(claimId, { uncertainPostId = "", uncertainPostUrl = "" } = {}) {
    let released = false;
    await this.#mutate((state) => {
      const entry = Object.entries(state.xSourcePosts)
        .find(([, item]) => item.claimId === String(claimId) && item.status === "pending");
      if (!entry) return;
      const [sourcePostId, record] = entry;
      if (uncertainPostId) {
        record.status = "uncertain";
        record.postedId = /^\d{1,19}$/.test(String(uncertainPostId)) ? String(uncertainPostId) : null;
        record.postedUrl = /^https:\/\/x\.com\//i.test(String(uncertainPostUrl || ""))
          ? String(uncertainPostUrl).slice(0, 1_000)
          : null;
        record.resolvedAt = this.now().toISOString();
      } else delete state.xSourcePosts[sourcePostId];
      released = true;
    });
    return released;
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

  usageStatus(type, userId, limits, { globalCooldownTypes = [] } = {}) {
    const now = this.now();
    const currentHour = hourKey(now);
    const currentDay = dayKey(now);
    const events = this.#state.usage.filter((item) => item.type === type);
    const globalTypes = new Set([type, ...globalCooldownTypes.map(String)]);
    const globalEvents = this.#state.usage.filter((item) => globalTypes.has(item.type));
    const user = String(userId || "unknown");
    const hourly = events.filter((item) => item.hour === currentHour).length;
    const daily = events.filter((item) => item.day === currentDay).length;
    const userHourly = events.filter((item) => item.hour === currentHour && item.userId === user).length;
    const userDaily = events.filter((item) => item.day === currentDay && item.userId === user).length;
    const latestGlobal = globalEvents.reduce((latest, item) => (
      new Date(item.at).getTime() > new Date(latest?.at || 0).getTime() ? item : latest
    ), null);
    const latestUser = events
      .filter((item) => item.userId === user)
      .reduce((latest, item) => (
        new Date(item.at).getTime() > new Date(latest?.at || 0).getTime() ? item : latest
      ), null);
    const spendToday = this.#state.usage
      .filter((item) => item.day === currentDay)
      .reduce((sum, item) => sum + (Number(item.costUsd) || 0), 0);
    const dailyUsers = new Set(events
      .filter((item) => item.day === currentDay)
      .map((item) => item.userId)).size;
    return {
      hourly,
      daily,
      userHourly,
      userDaily,
      dailyUsers,
      spendToday,
      latestGlobalAt: latestGlobal?.at || null,
      latestUserAt: latestUser?.at || null,
      now: now.toISOString(),
      limits
    };
  }

  usageAvailability(type, userId, limits, {
    spendCapUsd = 0,
    globalCooldownMs = 0,
    userCooldownMs = 0,
    globalCooldownTypes = []
  } = {}) {
    const status = this.usageStatus(type, userId, limits, { globalCooldownTypes });
    const capChecks = [
      ["hourly", limits.hourly],
      ["daily", limits.daily],
      ["userHourly", limits.userHourly],
      ["userDaily", limits.userDaily]
    ];
    const denied = capChecks.find(([name, cap]) => cap <= 0 || status[name] >= cap);
    if (denied) return { allowed: false, reason: `${denied[0]}_cap`, status };

    const nowMs = new Date(status.now).getTime();
    const globalElapsed = status.latestGlobalAt
      ? nowMs - new Date(status.latestGlobalAt).getTime()
      : Number.POSITIVE_INFINITY;
    const userElapsed = status.latestUserAt
      ? nowMs - new Date(status.latestUserAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (globalCooldownMs > 0 && globalElapsed < globalCooldownMs) {
      return {
        allowed: false,
        reason: "global_cooldown",
        cooldownRemainingMs: globalCooldownMs - globalElapsed,
        status
      };
    }
    if (userCooldownMs > 0 && userElapsed < userCooldownMs) {
      return {
        allowed: false,
        reason: "user_cooldown",
        cooldownRemainingMs: userCooldownMs - userElapsed,
        status
      };
    }
    if (["image", "video"].includes(type) && spendCapUsd > 0 && status.spendToday >= spendCapUsd) {
      return { allowed: false, reason: "daily_spend_cap", status };
    }
    return { allowed: true, reason: null, status };
  }

  async recordMessage({ chatId, threadId = "main", userId = "unknown", role, content }) {
    return this.#mutate((state) => {
      const key = conversationKey(chatId, threadId);
      const messages = state.messages[key] || [];
      messages.push({
        role,
        content: String(content).slice(0, 2_000),
        userId: String(userId || "unknown").slice(0, 80),
        threadId: String(threadId || "main").slice(0, 80),
        at: this.now().toISOString()
      });
      state.messages[key] = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    });
  }

  async recordTurn({
    chatId,
    threadId = "main",
    userId = "unknown",
    userContent,
    assistantContent
  }) {
    return this.#mutate((state) => {
      const key = conversationKey(chatId, threadId);
      const messages = state.messages[key] || [];
      const at = this.now().toISOString();
      const shared = {
        userId: String(userId || "unknown").slice(0, 80),
        threadId: String(threadId || "main").slice(0, 80),
        at
      };
      messages.push(
        {
          ...shared,
          role: "user",
          content: String(userContent || "").slice(0, 2_000)
        },
        {
          ...shared,
          role: "assistant",
          content: String(assistantContent || "").slice(0, 2_000)
        }
      );
      state.messages[key] = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
    });
  }

  async recordMedia({
    chatId,
    userId,
    type,
    fileId,
    caption = "",
    source = "telegram",
    stickerEmoji = null,
    stickerSetName = null
  }) {
    const record = {
      id: randomUUID(),
      chatId: String(chatId),
      userId: String(userId || "unknown"),
      type,
      fileId,
      caption: String(caption).slice(0, 1_000),
      source,
      ...(type === "sticker" ? {
        stickerEmoji: String(stickerEmoji || "✋🏻").slice(0, 20),
        stickerSetName: String(stickerSetName || "").slice(0, 64) || null
      } : {}),
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
    userCooldownMs = 0,
    globalCooldownTypes = []
  } = {}) {
    let result;
    await this.#mutate((state) => {
      this.#prune(state);
      const availability = this.usageAvailability(type, userId, limits, {
        spendCapUsd,
        globalCooldownMs,
        userCooldownMs,
        globalCooldownTypes
      });
      if (!availability.allowed) {
        result = availability;
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
      result = { ...availability, eventId: event.id };
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
      this.#prune(this.#state);
      await this.#save();
    });
    return this.#queue;
  }

  #prune(state = this.#state) {
    const now = this.now().getTime();
    const updateCutoff = now - UPDATE_RETENTION_MS;
    const messageCutoff = now - MESSAGE_RETENTION_MS;
    state.usage = state.usage.filter((item) => new Date(item.at).getTime() >= updateCutoff);
    state.telegramUpdates = Object.fromEntries(Object.entries(state.telegramUpdates)
      .filter(([, item]) => new Date(item.at || 0).getTime() >= updateCutoff)
      .sort(([, left], [, right]) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, MAX_TELEGRAM_UPDATES));
    state.media = state.media.slice(0, 200);
    state.xReceipts = state.xReceipts.slice(0, 200);
    state.xSourcePosts = Object.fromEntries(Object.entries(state.xSourcePosts)
      .sort(([, left], [, right]) => (
        new Date(right.resolvedAt || right.at || 0).getTime()
        - new Date(left.resolvedAt || left.at || 0).getTime()
      ))
      .slice(0, MAX_X_SOURCE_POSTS));
    state.agent.memories = state.agent.memories.slice(0, 250);
    state.agent.research = state.agent.research.slice(0, 500);
    state.agent.cycles = state.agent.cycles.slice(0, 100);
    state.messages = Object.fromEntries(Object.entries(state.messages)
      .map(([key, messages]) => [key, messages
        .filter((message) => new Date(message.at || 0).getTime() >= messageCutoff)
        .slice(-MAX_MESSAGES_PER_CONVERSATION)])
      .filter(([, messages]) => messages.length)
      .sort(([, left], [, right]) => (
        new Date(right.at(-1)?.at || 0).getTime()
        - new Date(left.at(-1)?.at || 0).getTime()
      ))
      .slice(0, MAX_CONVERSATIONS));
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

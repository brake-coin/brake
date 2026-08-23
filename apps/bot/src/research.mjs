import { createHash } from "node:crypto";

const DEFAULT_NEWS_QUERY = [
  '"AI race"',
  '"pause AI"',
  'PauseAI',
  'ControlAI',
  '"AI moratorium"',
  '"frontier AI" safety',
  'superintelligence risk'
].join(" OR ");

export const DEFAULT_NEWS_FEEDS = [
  `https://news.google.com/rss/search?q=${encodeURIComponent(`(${DEFAULT_NEWS_QUERY}) when:3d`)}&hl=en-US&gl=US&ceid=US:en`
];

function decodeXml(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
  return decodeXml(match?.[1] || "");
}

function linkFrom(block) {
  const rssLink = tag(block, "link");
  if (/^https:\/\//i.test(rssLink)) return rssLink;
  const atomLink = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(block)?.[1];
  return /^https:\/\//i.test(atomLink || "") ? decodeXml(atomLink) : "";
}

function sourceFrom(block, title) {
  const source = tag(block, "source");
  if (source) return source.slice(0, 120);
  const parts = String(title).split(" - ");
  return parts.length > 1 ? parts.at(-1).trim().slice(0, 120) : "News source";
}

function itemKey(url, title) {
  return `news:${createHash("sha256").update(url || title).digest("hex").slice(0, 24)}`;
}

function recencyScore(publishedAt, now) {
  const ageHours = Math.max(0, (now.getTime() - new Date(publishedAt || 0).getTime()) / 3_600_000);
  if (!Number.isFinite(ageHours)) return 0;
  return Math.max(0, 4 - (ageHours / 24));
}

export function parseNewsFeed(xml, { feedUrl = "", now = new Date() } = {}) {
  const blocks = [
    ...String(xml || "").matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...String(xml || "").matchAll(/<entry\b[\s\S]*?<\/entry>/gi)
  ].map((match) => match[0]);
  const items = [];
  for (const block of blocks) {
    const title = tag(block, "title").slice(0, 500);
    const url = linkFrom(block).slice(0, 1_000);
    if (!title || !url) continue;
    const publishedAt = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || null;
    const parsedTime = new Date(publishedAt || 0);
    items.push({
      key: itemKey(url, title),
      kind: "news",
      title,
      url,
      publisher: sourceFrom(block, title),
      publishedAt: Number.isNaN(parsedTime.getTime()) ? null : parsedTime.toISOString(),
      summary: (tag(block, "description") || tag(block, "summary")).slice(0, 700),
      feedUrl,
      score: Number((2 + recencyScore(publishedAt, now)).toFixed(3))
    });
  }
  return items;
}

function safeFeedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export class NewsResearchClient {
  constructor({
    feedUrls = DEFAULT_NEWS_FEEDS,
    fetchImpl = fetch,
    timeoutMs = 20_000,
    maxFeedBytes = 2_000_000,
    logger = console,
    now = () => new Date()
  } = {}) {
    this.feedUrls = feedUrls.map(safeFeedUrl).filter(Boolean).slice(0, 8);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxFeedBytes = maxFeedBytes;
    this.logger = logger;
    this.now = now;
  }

  async latest({ limit = 20 } = {}) {
    const settled = await Promise.allSettled(this.feedUrls.map((url) => this.#read(url)));
    const items = [];
    for (const result of settled) {
      if (result.status === "fulfilled") items.push(...result.value);
      else this.logger.warn("[agent] news feed failed", result.reason?.message || result.reason);
    }
    const unique = new Map();
    for (const item of items) if (!unique.has(item.key)) unique.set(item.key, item);
    return [...unique.values()]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)));
  }

  async #read(url) {
    const response = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "follow",
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }
    });
    if (!response.ok) throw new Error(`News feed returned HTTP ${response.status}.`);
    if (!String(response.url || url).startsWith("https://")) throw new Error("News feed redirected to an unsafe URL.");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > this.maxFeedBytes) throw new Error("News feed was too large.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > this.maxFeedBytes) throw new Error("News feed was too large.");
    return parseNewsFeed(bytes.toString("utf8"), { feedUrl: url, now: this.now() });
  }
}

function ageScore(createdAt, now) {
  const ageHours = Math.max(0, (now.getTime() - new Date(createdAt || 0).getTime()) / 3_600_000);
  if (!Number.isFinite(ageHours)) return 0;
  return Math.max(0, 4 - (ageHours / 24));
}

export function xPostResearchItem(post, { priority = 0, now = new Date() } = {}) {
  const metrics = post?.metrics || {};
  const engagement = (Number(metrics.like_count) || 0)
    + (2 * (Number(metrics.retweet_count) || 0))
    + (Number(metrics.reply_count) || 0)
    + (Number(metrics.quote_count) || 0);
  return {
    key: `x:${post.id}`,
    kind: "x",
    title: String(post.text || "").slice(0, 1_000),
    url: post.url,
    author: post.author?.username || null,
    publishedAt: post.createdAt || null,
    references: Array.isArray(post.references) ? post.references.slice(0, 8) : [],
    isReply: Boolean(post.isReply),
    isRepost: Boolean(post.isRepost),
    isQuote: Boolean(post.isQuote),
    possiblySensitive: Boolean(post.possiblySensitive),
    metrics,
    score: Number((3 + Math.log10(engagement + 1) + priority + ageScore(post.createdAt, now)).toFixed(3))
  };
}

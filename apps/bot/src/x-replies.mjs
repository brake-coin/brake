import { xMentionsInText } from "./x.mjs";

const MAX_REPLY_AGE_MS = 72 * 60 * 60 * 1_000;

export function assessReplyCandidate(post, {
  ownUserId,
  ownUsername,
  parentPost = null,
  now = new Date()
} = {}) {
  const authorId = String(post?.author?.id || "");
  const ownId = String(ownUserId || "");
  const ownHandle = String(ownUsername || "").replace(/^@/, "").toLowerCase();
  if (!post?.id || !authorId || !post?.author?.username || !ownId || !ownHandle) {
    return { eligible: false, reason: "missing_identity" };
  }
  if (authorId === ownId || post.author.username.toLowerCase() === ownHandle) {
    return { eligible: false, reason: "own_post" };
  }
  const text = String(post.text || "");
  const command = text.replace(new RegExp(`@${ownHandle}\\b`, "gi"), "").trim();
  if (/^stop[.! ]*$/i.test(command)
    || /\b(?:stop replying|do not reply|don't reply|leave me alone|opt out|unsubscribe)\b/i.test(text)) {
    return { eligible: false, reason: "opt_out", optOut: true };
  }
  const age = now.getTime() - Date.parse(post.createdAt || "");
  if (!Number.isFinite(age) || age < 0 || age > MAX_REPLY_AGE_MS) {
    return { eligible: false, reason: "stale_post" };
  }
  if (post.possiblySensitive || post.isRepost || post.isQuote) {
    return { eligible: false, reason: "sensitive_or_reshared" };
  }
  if (/\b(?:porn|casino|free tokens?|airdrop)\b|xxx/i.test(
    `${post.author.username} ${post.author.name || ""}`
  )) {
    return { eligible: false, reason: "spam_signals" };
  }
  const mentions = xMentionsInText(text).map((value) => value.toLowerCase());
  const directMention = mentions.includes(ownHandle) && mentions.every((value) => value === ownHandle);
  const parentId = post.references?.find((item) => item.type === "replied_to")?.id;
  const directReply = parentId && parentPost?.id === parentId
    && String(parentPost.author?.id || "") === ownId;
  if (!directMention && !directReply) {
    return { eligible: false, reason: "not_directed_to_account" };
  }
  const links = (text.match(/https?:\/\/|(?:^|\s)www\./gi) || []).length;
  const hashtags = (text.match(/(^|\s)#[A-Za-z0-9_]+/g) || []).length;
  const cashtags = (text.match(/(^|\s)\$[A-Za-z]{2,10}\b/g) || []).length;
  if (links || hashtags >= 3 || cashtags >= 2
    || /\b(?:airdrop|giveaway|free tokens|guaranteed returns|dm me|follow me|promo code)\b/i.test(text)) {
    return { eligible: false, reason: "spam_signals" };
  }
  const accountAge = now.getTime() - Date.parse(post.author.createdAt || "");
  if (Number.isFinite(accountAge) && accountAge >= 0 && accountAge < 7 * 24 * 60 * 60 * 1_000
    && Number(post.author.metrics?.followers_count) < 2) {
    return { eligible: false, reason: "new_low_reach_account" };
  }
  return { eligible: true, reason: null };
}

export const MAX_X_POST_LENGTH = 280;

export function makePinnedCampaignPost(project) {
  const message = [
    "if ur in ai crypto, pivot to stop ai crypto.",
    "not ur portfolio—ur thesis. AI coins brought an accelerator. $STOPAI brought the brake.",
    "independent Solana meme. no promises. could lose all value.",
    `CA: ${project.contractAddress}`,
    project.links.website
  ].join("\n\n");

  if (message.length > MAX_X_POST_LENGTH) {
    throw new Error(`Pinned post is ${message.length} characters; maximum is 280.`);
  }

  return message;
}

export function makeListingDescription(project) {
  return [
    project.description,
    "It includes a visitor-owned OpenRouter meme generator and an autonomous campaign bot.",
    "The official project accounts are @STOPAICOIN on X and @StopAiCoin on Telegram.",
    "STOPAI is not affiliated with @canadabirdie; that account is only the creator-fee recipient configured by Bags.",
    "STOPAI is speculative, could lose all value, and is not a charitable donation."
  ].join(" ");
}

export function makeListingCorrectionNote(project) {
  return [
    "This request corrects outdated third-party metadata.",
    "The official X account is @STOPAICOIN; STOPAI is not affiliated with @canadabirdie.",
    "That account is only the Bags creator-fee recipient, as disclosed on the official website.",
    `The exact mint, official links, authority status, and risk notice are public at ${project.links.website}.`
  ].join(" ");
}

export function makeLaunchPost(project) {
  const message = [
    `$${project.symbol} is live on Solana.`,
    `Official mint:\n${project.contractAddress}`,
    `Bags:\n${project.links.bags}`,
    project.tagline,
    "Independent speculative token. Not a donation. Could lose all value."
  ].join("\n\n");

  if (message.length > MAX_X_POST_LENGTH) {
    throw new Error(`Launch post is ${message.length} characters; maximum is 280.`);
  }

  return message;
}

export function makeTelegramLaunchPost(project) {
  return [
    `🛑 $${project.symbol}: OFFICIAL SOLANA MINT`,
    "",
    project.contractAddress,
    "",
    project.links.bags,
    "",
    project.independenceNotice,
    project.riskNotice
  ].join("\n");
}

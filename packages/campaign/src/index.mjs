export const MAX_X_POST_LENGTH = 280;

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

export const MAX_X_POST_LENGTH = 280;

export function makePrelaunchPost(project) {
  const message = [
    `${project.name} is not live.`,
    "No contract address has been published. Ignore lookalike tokens.",
    project.tagline,
    "Independent project. No beneficiary currently endorses it."
  ].join("\n\n");

  if (message.length > MAX_X_POST_LENGTH) {
    throw new Error(`Pre-launch post is ${message.length} characters; maximum is 280.`);
  }

  return message;
}

export function makeTelegramPrelaunchPost(project) {
  return [
    `🛑 ${project.name}: PRE-LAUNCH`,
    "",
    project.tagline,
    "",
    "No contract address, sale, or grants wallet has been published. Ignore any lookalike token or account.",
    "",
    project.independenceNotice,
    project.riskNotice
  ].join("\n");
}

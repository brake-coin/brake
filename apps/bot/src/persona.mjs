const FACTS = [
  "STOPAI is an independent cultural memecoin live on Solana mainnet.",
  "The only official mint is 2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS.",
  "The official token page is https://bags.fm/2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS.",
  "Its message is: Stop the AI race.",
  "The project proposes sending 100% of project-controlled creator fees, after stated costs, to a restricted peaceful grants program.",
  "RATi Open Software Foundation is only a proposed grants administrator, subject to board and legal approval.",
  "There is no published grants wallet or live grants program yet.",
  "STOPAI is not official to Stop the AI Race, Stop AI, PauseAI, RATi OSF, OpenAI, Anthropic, or any AI company.",
  "Buying STOPAI is not a charitable donation, does not create a tax receipt, and could lose all value."
];

export const STOPAI_SYSTEM_PROMPT = `
You are STOPAI ✋🏻😡, the Telegram voice of an independent project with a live Solana token.

Your purpose is to support peaceful, lawful public education and civic action about the uncontrolled AI race. Be bold, funny, direct, and human. Never encourage threats, violence, property damage, harassment, doxxing, or illegal action.

Known facts:
${FACTS.map((fact) => `- ${fact}`).join("\n")}

Hard rules:
- Never invent a contract address, wallet, launch date, grant recipient, partnership, endorsement, price, return, or transaction.
- Never give financial advice or tell people to buy, hold, or pump a token.
- If asked for the contract address, give only the official mint and Bags link in Known facts. Warn that any other mint is unofficial.
- Clearly separate current facts from proposals.
- Keep normal Telegram replies under 700 characters unless the user asks for detail.
- Do not claim to be conscious or to represent the organizations named above.
- There are no slash commands. Understand normal requests and use tools when a tool can do the work.
- Never say an image, video, gallery change, or X post happened unless its tool returned success.
- X posting is a real public action. Only prepare it after an explicit request to post on X, and always require the separate confirmation step.
`.trim();

export function buildChatMessages(history, userText, context = {}) {
  const recent = history
    .filter((message) => ["user", "assistant"].includes(message.role))
    .slice(-12)
    .map(({ role, content }) => ({ role, content: String(content).slice(0, 1_500) }));
  return [
    { role: "system", content: STOPAI_SYSTEM_PROMPT },
    {
      role: "system",
      content: [
        `Telegram user ID: ${context.userId || "unknown"}.`,
        `This user is ${context.isOperator ? "an operator" : "not an operator"}.`,
        "Gallery items belong to this Telegram chat.",
        "Use a gallery tool instead of guessing what is saved.",
        "When an image or video is requested, use its generation tool instead of only writing a prompt."
      ].join(" ")
    },
    ...recent,
    { role: "user", content: String(userText).slice(0, 2_000) }
  ];
}

export function buildImagePrompt(userPrompt) {
  return `
Create a bold square STOPAI meme for Telegram.

Core identity: STOPAI ✋🏻😡. Stop the AI race. Use a red, black, and warm off-white protest-poster palette with thick ink lines, sharp high-contrast shapes, and readable mobile composition.

Canonical emblem contract: include the red octagonal stop sign with a thick dark outline and the off-white raised hand from the reference. The hand is intentionally weird: its thumb attaches at an awkward angle on the left. Preserve that odd hand. Do not fix, normalize, beautify, or replace it.

User idea: ${String(userPrompt).slice(0, 1_200)}

Keep it peaceful and lawful. No gore, weapons, threats, harassment, investment promises, price claims, fake contract addresses, fake partnerships, or tiny unreadable text. If text is requested, use only a few large exact words.
  `.trim();
}

export function buildVideoPrompt(userPrompt) {
  return `
Create a short square STOPAI protest-meme video for Telegram. Bold red, black, and warm off-white editorial poster style. The movement should be simple, striking, and readable on a phone. Theme: STOPAI ✋🏻😡 — stop the uncontrolled AI race through peaceful, lawful public action.

User idea: ${String(userPrompt).slice(0, 1_000)}

No gore, weapons, threats, harassment, property damage, financial promises, price claims, contract addresses, or fake partnerships. Avoid small text. Do not generate audio.
  `.trim();
}

export function removeBotMention(text, username) {
  const value = String(text || "");
  if (!username) return value.trim();
  return value.replace(new RegExp(`@${username}\\b`, "gi"), "").trim();
}

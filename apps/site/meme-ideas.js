const STYLE_REELS = [
  { label: "bootleg action-movie poster", memeStyle: "poster" },
  { label: "deadpan corporate training slide", memeStyle: "news" },
  { label: "grainy public-access TV alert", memeStyle: "news" },
  { label: "overheated reaction image", memeStyle: "reaction" },
  { label: "cheap supermarket tabloid cover", memeStyle: "news" },
  { label: "screen-printed street poster", memeStyle: "poster" },
  { label: "surreal museum exhibit label", memeStyle: "surreal" },
  { label: "low-budget sci-fi warning card", memeStyle: "poster" },
  { label: "awkward family photo caption", memeStyle: "reaction" },
  { label: "serious wildlife documentary frame", memeStyle: "reaction" },
  { label: "chaotic corkboard conspiracy diagram", memeStyle: "surreal" },
  { label: "vintage workplace safety poster", memeStyle: "poster" },
  { label: "breaking-news lower-third disaster", memeStyle: "news" },
  { label: "medieval manuscript marginalia", memeStyle: "surreal" },
  { label: "luxury perfume ad for bad decisions", memeStyle: "surreal" },
  { label: "children’s book page for adults", memeStyle: "reaction" },
  { label: "blunt transit-system notice", memeStyle: "poster" },
  { label: "1980s computer magazine ad", memeStyle: "news" },
  { label: "sports replay freeze-frame", memeStyle: "reaction" },
  { label: "ominously calm weather forecast", memeStyle: "news" }
];

const THEME_REELS = [
  "an AI lab adds a rocket engine to a shopping cart while the STOPAI hand looks for the brake",
  "a giant red launch button has twelve approvals and the tiny pause button is still in draft",
  "the AI race follows a GPS route marked faster while the road signs all say think first",
  "executives celebrate a speedometer as the steering wheel quietly falls off",
  "the STOPAI hand tries to hold a safety meeting inside a room full of countdown clocks",
  "a robot confidently presents a five-step plan whose first five steps are accelerate",
  "the emergency brake has become a decorative office plant",
  "everyone brought benchmarks to the meeting and nobody brought judgment",
  "an AI lab uses a bigger model to explain why it cannot find the off switch",
  "the STOPAI hand stands between a hype train and a very ordinary stop sign",
  "a product roadmap ends at a cliff labeled next quarter",
  "a cheerful chatbot keeps clicking accept all on civilization’s terms and conditions",
  "the safety checklist is being used as confetti at launch day",
  "an AI agent schedules another AI agent to ask whether anyone is still in charge",
  "the accelerator has a software update but the brake requires a committee",
  "a lab races its own reflection and declares a historic victory",
  "the STOPAI hand interrupts an awards show for fastest unforced error",
  "a data center wears running shoes while a human carries the extension cord",
  "the future arrives early and waits awkwardly because nobody made a plan",
  "a giant model card has one tiny footnote saying maybe slow down",
  "the AI race installs a turbo button on a problem it has not defined",
  "the STOPAI hand is the only crossing guard at the singularity roundabout",
  "a boardroom mistakes motion blur for progress",
  "the launch checklist contains one item: do not look down",
  "a robot asks for human feedback after already pressing publish",
  "the AI lab’s smoke alarm has been renamed an innovation siren",
  "the STOPAI hand tries to return a box marked unintended consequences",
  "a risk dashboard is completely green because somebody unplugged it",
  "the race builds a smarter compass while refusing to choose a direction",
  "an autonomous meeting agrees to schedule a human later"
];

const MESSAGE_REELS = [
  "More speed is not more wisdom",
  "Capability is not consent",
  "Pause is a feature, not a failure",
  "A benchmark is not a steering wheel",
  "Think before scaling the problem",
  "The future can wait for a safety check",
  "Progress needs a direction",
  "Not every green light means go",
  "Slow down before the patch notes become history",
  "Humans should remain in the loop",
  "A race is a bad way to choose a future",
  "Bigger is not the same as better",
  "You can question the countdown",
  "Safety is not launch-day decoration",
  "Stop optimizing for the cliff",
  "There is no prize for the fastest regret",
  "Maybe should be enough to pause",
  "The brake belongs in the design",
  "Ask who benefits before pressing go",
  "A warning label is not a safety plan",
  "We can build carefully or apologize quickly",
  "Hype is not a risk assessment",
  "The off switch should not be conceptual",
  "Keep human judgment on the roadmap"
];

const MEME_STYLES = new Set(["reaction", "poster", "surreal", "news"]);

function cleanPart(value, maximum) {
  return String(value || "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .slice(0, maximum);
}

function composeIdea({ style, theme, message }) {
  return `${style}: ${theme}. Message: “${message}”`.slice(0, 280);
}

export function normalizeMemeIdea(input) {
  const style = cleanPart(input?.style, 80);
  const theme = cleanPart(input?.theme, 130);
  const message = cleanPart(input?.message, 80);
  const memeStyle = cleanPart(input?.memeStyle, 20).toLowerCase();
  if (!style || !theme || !message || !MEME_STYLES.has(memeStyle)) {
    throw new Error("The idea machine returned an incomplete roll.");
  }
  return {
    style,
    theme,
    message,
    memeStyle,
    idea: composeIdea({ style, theme, message })
  };
}

function randomItem(items, random) {
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  return items[index];
}

export function rollLocalMemeIdea(random = Math.random) {
  const style = randomItem(STYLE_REELS, random);
  return normalizeMemeIdea({
    style: style.label,
    memeStyle: style.memeStyle,
    theme: randomItem(THEME_REELS, random),
    message: randomItem(MESSAGE_REELS, random)
  });
}

export const LOCAL_IDEA_COMBINATIONS = (
  STYLE_REELS.length * THEME_REELS.length * MESSAGE_REELS.length
);

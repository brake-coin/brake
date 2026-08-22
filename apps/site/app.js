import {
  buildOpenRouterAuthorizationUrl,
  createPkceTransaction,
  DEFAULT_IMAGE_MODEL,
  exchangeOpenRouterCode,
  generateMeme,
  keyLinks
} from "./openrouter.js";

const PKCE_STORAGE_KEY = "stopai:openrouter-pkce";
const API_KEY_STORAGE_KEY = "stopai:openrouter-key";
const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

const statusLabel = document.querySelector("#project-status");
const contractNotice = document.querySelector("#contract-notice");
const riskNotice = document.querySelector("#risk-notice");
const independenceNotice = document.querySelector("#independence-notice");
const lastUpdated = document.querySelector("#last-updated");
const memeForm = document.querySelector("#meme-form");
const memeIdea = document.querySelector("#meme-idea");
const memeStyle = document.querySelector("#meme-style");
const generateButton = document.querySelector("#generate-button");
const readyLabel = generateButton.querySelector(".button-ready");
const workingLabel = generateButton.querySelector(".button-working");
const generatorStatus = document.querySelector("#generator-status");
const memeOutput = document.querySelector("#meme-output");
const generatedMeme = document.querySelector("#generated-meme");
const downloadButton = document.querySelector("#download-meme");
const shareButton = document.querySelector("#share-meme");
const remixButton = document.querySelector("#remix-meme");
const modelLabel = document.querySelector("#model-label");
const connectButton = document.querySelector("#connect-openrouter");
const disconnectButton = document.querySelector("#disconnect-openrouter");
const connectionState = document.querySelector("#openrouter-state");
const activityLink = document.querySelector("#openrouter-activity");
const settingsLink = document.querySelector("#openrouter-settings");

let openRouterKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
let imageModel = DEFAULT_IMAGE_MODEL;
let latestMeme = null;
let generating = false;
let referenceImagePromise;

function setGeneratorStatus(message, state = "") {
  generatorStatus.textContent = message;
  if (state) generatorStatus.dataset.state = state;
  else delete generatorStatus.dataset.state;
}

function setGenerating(nextGenerating) {
  generating = nextGenerating;
  generateButton.disabled = generating || !openRouterKey;
  readyLabel.hidden = generating;
  workingLabel.hidden = !generating;
  memeIdea.disabled = generating;
  memeStyle.disabled = generating;
  connectButton.disabled = generating;
  disconnectButton.disabled = generating;
}

async function renderConnection() {
  const connected = Boolean(openRouterKey);
  connectButton.hidden = connected;
  disconnectButton.hidden = !connected;
  connectionState.textContent = connected
    ? "Connected for this browser tab. Your OpenRouter key stays here."
    : "Connect your OpenRouter account. You pay OpenRouter directly for each image.";
  connectionState.dataset.connected = connected ? "true" : "false";
  activityLink.hidden = !connected;
  settingsLink.hidden = !connected;

  if (connected) {
    const links = await keyLinks(openRouterKey);
    activityLink.href = links.activityUrl;
    settingsLink.href = links.settingsUrl;
    setGeneratorStatus("Ready. Image costs go to your OpenRouter account.", "ready");
  } else {
    setGeneratorStatus("Connect OpenRouter to generate a meme.");
  }
  setGenerating(false);
}

function cleanOAuthParameters() {
  const url = new URL(window.location.href);
  for (const parameter of ["code", "state", "oauth", "error", "error_description"]) {
    url.searchParams.delete(parameter);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function finishOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const oauthError = params.get("error_description") || params.get("error");
  if (!code && !oauthError) return null;
  if (oauthError) {
    cleanOAuthParameters();
    return `OpenRouter connection failed: ${oauthError}`;
  }

  setGeneratorStatus("Finishing the secure OpenRouter connection…");
  const stored = sessionStorage.getItem(PKCE_STORAGE_KEY);
  sessionStorage.removeItem(PKCE_STORAGE_KEY);

  try {
    const transaction = stored ? JSON.parse(stored) : null;
    if (
      !transaction ||
      transaction.state !== params.get("state") ||
      Date.now() - transaction.createdAt > OAUTH_MAX_AGE_MS
    ) {
      throw new Error("This OpenRouter connection expired. Please connect again.");
    }
    const credential = await exchangeOpenRouterCode({
      code,
      verifier: transaction.verifier,
      signal: AbortSignal.timeout(30_000)
    });
    openRouterKey = credential.key;
    sessionStorage.setItem(API_KEY_STORAGE_KEY, openRouterKey);
    cleanOAuthParameters();
    return null;
  } catch (error) {
    cleanOAuthParameters();
    return error.message;
  }
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setGeneratorStatus("Opening OpenRouter…");
  try {
    const transaction = await createPkceTransaction();
    sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(transaction));
    const callbackUrl = new URL(window.location.href);
    callbackUrl.search = "";
    callbackUrl.hash = "";
    callbackUrl.searchParams.set("oauth", "openrouter");
    callbackUrl.searchParams.set("state", transaction.state);
    window.location.assign(
      buildOpenRouterAuthorizationUrl({
        callbackUrl: callbackUrl.toString(),
        challenge: transaction.challenge
      })
    );
  } catch (error) {
    setGeneratorStatus(error.message, "error");
    connectButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", () => {
  sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  openRouterKey = null;
  activityLink.removeAttribute("href");
  settingsLink.removeAttribute("href");
  renderConnection();
});

async function getReferenceImage() {
  if (!referenceImagePromise) {
    referenceImagePromise = fetch("./assets/brake-emblem-meme-reference.png")
      .then((response) => {
        if (!response.ok) throw new Error("The STOPAI reference image is unavailable.");
        return response.blob();
      })
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result), { once: true });
        reader.addEventListener("error", () => reject(reader.error), { once: true });
        reader.readAsDataURL(blob);
      }));
  }
  return referenceImagePromise;
}

async function dataUrlToFile(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], `stopai-meme-${Date.now()}.png`, { type: blob.type || "image/png" });
}

function downloadLatestMeme() {
  if (!latestMeme) return;
  const link = document.createElement("a");
  link.href = latestMeme;
  link.download = `stopai-meme-${Date.now()}.png`;
  link.click();
}

async function shareLatestMeme() {
  if (!latestMeme) return;
  try {
    const file = await dataUrlToFile(latestMeme);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "$STOPAI ✋🏻😡 meme",
        text: "$STOPAI ✋🏻😡 Stop the AI race. #STOPAI"
      });
    } else {
      downloadLatestMeme();
      setGeneratorStatus("Sharing is not supported here, so the meme was downloaded.", "ready");
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      setGeneratorStatus("Could not open sharing. Download works instead.", "error");
    }
  }
}

for (const starter of document.querySelectorAll("[data-prompt]")) {
  starter.addEventListener("click", () => {
    memeIdea.value = starter.dataset.prompt;
    memeIdea.focus();
  });
}

memeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!openRouterKey) {
    setGeneratorStatus("Connect OpenRouter first.", "error");
    return;
  }

  setGenerating(true);
  setGeneratorStatus("Warming up the weird hand. OpenRouter may take about a minute…");

  try {
    const result = await generateMeme({
      idea: memeIdea.value,
      style: memeStyle.value,
      referenceImage: await getReferenceImage(),
      apiKey: openRouterKey,
      model: imageModel,
      signal: AbortSignal.timeout(100_000)
    });
    latestMeme = result.image;
    generatedMeme.src = latestMeme;
    memeOutput.hidden = false;
    setGeneratorStatus("Meme acquired. Inspect it before setting it loose.", "ready");
    memeOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "The meme took too long. Try again with a simpler idea."
      : error.message;
    setGeneratorStatus(message, "error");
  } finally {
    setGenerating(false);
  }
});

downloadButton.addEventListener("click", downloadLatestMeme);
shareButton.addEventListener("click", shareLatestMeme);
remixButton.addEventListener("click", () => {
  memeIdea.focus();
  memeForm.scrollIntoView({ behavior: "smooth", block: "center" });
});

try {
  const response = await fetch("./config/project.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Project status request failed: ${response.status}`);
  const project = await response.json();
  statusLabel.textContent = project.status === "prelaunch"
    ? "Pre-launch"
    : project.status.replaceAll("-", " ");
  riskNotice.textContent = project.riskNotice;
  independenceNotice.textContent = project.independenceNotice;
  lastUpdated.textContent = `Status updated ${project.lastUpdated}`;
  contractNotice.textContent = project.contractAddress
    ? `Contract: ${project.contractAddress}`
    : "No token contract has been published. Ignore lookalikes.";
  imageModel = project.memeGenerator?.model || DEFAULT_IMAGE_MODEL;
  modelLabel.textContent = project.memeGenerator?.modelLabel || "OpenRouter";
} catch (error) {
  console.error(error);
  statusLabel.textContent = "Status unavailable";
}

const oauthError = await finishOAuthCallback();
await renderConnection();
if (oauthError) setGeneratorStatus(oauthError, "error");

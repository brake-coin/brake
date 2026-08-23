import {
  buildOpenRouterAuthorizationUrl,
  createPkceTransaction,
  DEFAULT_IDEA_MODEL,
  DEFAULT_IMAGE_MODEL,
  exchangeOpenRouterCode,
  generateMemeIdea,
  generateMeme,
  keyLinks
} from "./openrouter.js?v=20260823-2";
import { LOCAL_IDEA_COMBINATIONS, rollLocalMemeIdea } from "./meme-ideas.js?v=20260823-2";
import {
  clearGalleryMemes,
  deleteGalleryMeme,
  listGalleryMemes,
  saveGalleryMeme
} from "./gallery.js?v=20260823-2";

const PKCE_STORAGE_KEY = "stopai:openrouter-pkce";
const API_KEY_STORAGE_KEY = "stopai:openrouter-key";
const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;
const X_GALLERY_ENDPOINT = "https://stopai-coin.fly.dev/api/x/gallery";

const statusLabel = document.querySelector("#project-status");
const contractNotice = document.querySelector("#contract-notice");
const contractAddress = document.querySelector("#contract-address");
const contractActions = document.querySelector("#contract-actions");
const copyContractButton = document.querySelector("#copy-contract");
const bagsTokenLink = document.querySelector("#bags-token-link");
const explorerTokenLink = document.querySelector("#explorer-token-link");
const riskNotice = document.querySelector("#risk-notice");
const independenceNotice = document.querySelector("#independence-notice");
const lastUpdated = document.querySelector("#last-updated");
const memeForm = document.querySelector("#meme-form");
const memeIdea = document.querySelector("#meme-idea");
const memeStyle = document.querySelector("#meme-style");
const ideaRollButton = document.querySelector("#idea-roll-button");
const ideaRollReady = ideaRollButton.querySelector(".roll-ready");
const ideaRollWorking = ideaRollButton.querySelector(".roll-working");
const ideaRollStatus = document.querySelector("#idea-roll-status");
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
const galleryGrid = document.querySelector("#gallery-grid");
const galleryStatus = document.querySelector("#gallery-status");
const personalGalleryGrid = document.querySelector("#personal-gallery-grid");
const personalGalleryStatus = document.querySelector("#personal-gallery-status");
const clearPersonalGalleryButton = document.querySelector("#clear-personal-gallery");

let openRouterKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
let imageModel = DEFAULT_IMAGE_MODEL;
let ideaModel = DEFAULT_IDEA_MODEL;
let latestMeme = null;
let generating = false;
let rollingIdea = false;
let hasRolledIdea = false;
let referenceImagePromise;

function setGeneratorStatus(message, state = "") {
  generatorStatus.textContent = message;
  generatorStatus.hidden = !message;
  if (state) generatorStatus.dataset.state = state;
  else delete generatorStatus.dataset.state;
}

function setGenerating(nextGenerating) {
  generating = nextGenerating;
  renderControlStates();
}

function setIdeaRolling(nextRolling) {
  rollingIdea = nextRolling;
  renderControlStates();
}

function renderControlStates() {
  generateButton.disabled = generating || rollingIdea || !openRouterKey || !hasRolledIdea;
  readyLabel.hidden = generating;
  workingLabel.hidden = !generating;
  ideaRollButton.disabled = generating || rollingIdea;
  ideaRollReady.hidden = rollingIdea;
  ideaRollWorking.hidden = !rollingIdea;
  connectButton.disabled = generating || rollingIdea;
  disconnectButton.disabled = generating || rollingIdea;
}

async function renderConnection() {
  const connected = Boolean(openRouterKey);
  connectButton.hidden = connected;
  disconnectButton.hidden = !connected;
  connectionState.textContent = connected
    ? "Connected for this tab. Your OpenRouter key stays here."
    : "OpenRouter gives this tab a key. We never receive it or add it to our server.";
  connectionState.dataset.connected = connected ? "true" : "false";
  activityLink.hidden = !connected;
  settingsLink.hidden = !connected;

  if (connected) {
    const links = await keyLinks(openRouterKey);
    activityLink.href = links.activityUrl;
    settingsLink.href = links.settingsUrl;
    setGeneratorStatus("");
    ideaRollStatus.textContent = hasRolledIdea
      ? "Ready to generate this meme with AI. Roll again anytime."
      : "Roll a meme. Connected rolls use OpenRouter to invent a fresh idea.";
  } else {
    setGeneratorStatus("");
    ideaRollStatus.textContent = hasRolledIdea
      ? "Connect OpenRouter above to generate this meme with AI."
      : `Roll a meme offline from ${LOCAL_IDEA_COMBINATIONS.toLocaleString()} built-in combinations.`;
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
  setGeneratorStatus("Opening OpenRouter’s secure connection…");
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

function downloadMeme(image, id = Date.now()) {
  if (!image) return;
  const link = document.createElement("a");
  link.href = image;
  link.download = `stopai-meme-${id}.png`;
  link.click();
}

function downloadLatestMeme() {
  downloadMeme(latestMeme);
}

function openPersonalGalleryMeme(item) {
  latestMeme = item.image;
  generatedMeme.src = item.image;
  memeIdea.value = item.idea;
  resizeMemeResult();
  memeStyle.value = item.style || "reaction";
  hasRolledIdea = true;
  renderControlStates();
  memeOutput.hidden = false;
  setGeneratorStatus("Your saved meme is open. Remix it or share it.", "ready");
  memeOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function personalGalleryButton(label, task) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", task);
  return button;
}

function renderPersonalGallery(items) {
  personalGalleryGrid.replaceChildren();
  personalGalleryStatus.hidden = items.length > 0;
  personalGalleryStatus.textContent = "Your weird hand has not made anything yet.";
  clearPersonalGalleryButton.hidden = items.length === 0;
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "gallery-card";
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = item.idea || "Your generated STOPAI meme";
    image.loading = "lazy";
    const copy = document.createElement("div");
    copy.className = "gallery-card-copy";
    const caption = document.createElement("p");
    caption.textContent = item.idea || "Untitled STOPAI meme";
    const time = document.createElement("time");
    time.dateTime = item.createdAt;
    time.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
      .format(new Date(item.createdAt));
    const actions = document.createElement("div");
    actions.className = "gallery-card-actions";
    actions.append(
      personalGalleryButton("Open", () => openPersonalGalleryMeme(item)),
      personalGalleryButton("Download", () => downloadMeme(item.image, item.id)),
      personalGalleryButton("Delete", async () => {
        await deleteGalleryMeme(item.id);
        await loadPersonalGallery();
      })
    );
    copy.append(caption, time, actions);
    card.append(image, copy);
    personalGalleryGrid.append(card);
  }
}

async function loadPersonalGallery() {
  try {
    renderPersonalGallery(await listGalleryMemes());
  } catch (error) {
    console.warn("Personal meme gallery is unavailable", error);
    personalGalleryStatus.hidden = false;
    personalGalleryStatus.textContent = "This browser is not allowing private gallery storage.";
    clearPersonalGalleryButton.hidden = true;
  }
}

function renderXGallery(posts) {
  galleryGrid.replaceChildren();
  galleryStatus.hidden = posts.length > 0;
  if (!posts.length) {
    galleryStatus.textContent = "No media posts yet. Follow @STOPAICOIN to catch the next one.";
    return;
  }
  for (const post of posts) {
    const media = post.media[0];
    const card = document.createElement("article");
    card.className = "gallery-card";

    const mediaLink = document.createElement("a");
    mediaLink.className = "gallery-media";
    mediaLink.href = post.url;
    mediaLink.target = "_blank";
    mediaLink.rel = "noreferrer";
    const image = document.createElement("img");
    image.src = media.previewUrl;
    image.alt = media.altText || post.text || "STOPAI media posted on X";
    image.loading = "lazy";
    mediaLink.append(image);
    if (media.type === "video") {
      const badge = document.createElement("span");
      badge.className = "gallery-video-badge";
      badge.textContent = "▶ Video on X";
      mediaLink.append(badge);
    }

    const copy = document.createElement("div");
    copy.className = "gallery-card-copy";
    const caption = document.createElement("p");
    caption.textContent = post.text || "$STOPAI ✋🏻😡";
    const time = document.createElement("time");
    if (post.createdAt) {
      time.dateTime = post.createdAt;
      time.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
        .format(new Date(post.createdAt));
    }
    const actions = document.createElement("div");
    actions.className = "gallery-card-actions";
    const viewLink = document.createElement("a");
    viewLink.href = post.url;
    viewLink.target = "_blank";
    viewLink.rel = "noreferrer";
    viewLink.textContent = "View on X ↗";
    actions.append(viewLink);
    copy.append(caption, time, actions);
    card.append(mediaLink, copy);
    galleryGrid.append(card);
  }
}

async function loadXGallery() {
  try {
    const response = await fetch(X_GALLERY_ENDPOINT, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.posts)) {
      throw new Error(payload.error || "The X gallery is unavailable.");
    }
    renderXGallery(payload.posts);
  } catch (error) {
    console.warn("X meme gallery is unavailable", error);
    galleryStatus.hidden = false;
    galleryStatus.textContent = "The live gallery could not load. See the latest memes on @STOPAICOIN.";
  }
}

async function shareLatestMeme() {
  if (!latestMeme) return;
  try {
    const file = await dataUrlToFile(latestMeme);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "$STOPAI ✋🏻😡 meme",
        text: "AI won’t stop itself. So we built $STOPAI. ✋🏻😡 #STOPAI"
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

function showIdeaRoll(roll) {
  memeIdea.value = roll.idea;
  resizeMemeResult();
  memeStyle.value = roll.memeStyle;
  hasRolledIdea = true;
}

function resizeMemeResult() {
  memeIdea.style.height = "auto";
  memeIdea.style.height = `${Math.max(122, memeIdea.scrollHeight)}px`;
}

ideaRollButton.addEventListener("click", async () => {
  setIdeaRolling(true);
  const useLlm = Boolean(openRouterKey);
  ideaRollStatus.textContent = useLlm
    ? "OpenRouter is rolling a fresh meme…"
    : "Rolling a meme…";
  try {
    const roll = useLlm
      ? await generateMemeIdea({
        apiKey: openRouterKey,
        model: ideaModel,
        signal: AbortSignal.timeout(30_000)
      })
      : rollLocalMemeIdea();
    showIdeaRoll(roll);
    ideaRollStatus.textContent = useLlm
      ? "Fresh AI idea. Generate it below or roll again."
      : "Connect OpenRouter above to generate this meme with AI.";
  } catch {
    const roll = rollLocalMemeIdea();
    showIdeaRoll(roll);
    ideaRollStatus.textContent = "OpenRouter missed that roll, so this idea came from the offline collection. You can still generate it below.";
  } finally {
    setIdeaRolling(false);
  }
});

memeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!openRouterKey) {
    setGeneratorStatus("Connect OpenRouter before putting the hand to work.", "error");
    return;
  }

  setGenerating(true);
  setGeneratorStatus("Giving the weird hand a job. OpenRouter may take about a minute…");

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
    await saveGalleryMeme({
      image: latestMeme,
      idea: memeIdea.value,
      style: memeStyle.value
    }).then(loadPersonalGallery).catch((error) => {
      console.warn("Could not save the generated meme to the personal gallery", error);
    });
    setGeneratorStatus("Meme ready. Inspect the chaos before setting it loose.", "ready");
    memeOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "The hand took too long. Try again with a simpler idea."
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

clearPersonalGalleryButton.addEventListener("click", async () => {
  if (!window.confirm("Clear every meme saved by this browser?")) return;
  await clearGalleryMemes();
  await loadPersonalGallery();
});

copyContractButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(contractAddress.textContent.trim());
    copyContractButton.textContent = "CA copied";
    window.setTimeout(() => {
      copyContractButton.textContent = "Copy CA";
    }, 1_500);
  } catch {
    window.getSelection()?.selectAllChildren(contractAddress);
    copyContractButton.textContent = "Select and copy";
  }
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
  if (project.contractAddress) {
    contractAddress.textContent = project.contractAddress;
    contractActions.hidden = false;
    bagsTokenLink.href = project.links.bags;
    explorerTokenLink.href = project.links.solanaExplorer;
  } else {
    contractNotice.textContent = "No token contract has been published. Ignore lookalikes.";
  }
  imageModel = project.memeGenerator?.model || DEFAULT_IMAGE_MODEL;
  ideaModel = project.memeGenerator?.ideaModel || DEFAULT_IDEA_MODEL;
  modelLabel.textContent = project.memeGenerator?.modelLabel || "OpenRouter";
} catch (error) {
  console.error(error);
  statusLabel.textContent = "Status unavailable";
}

const oauthError = await finishOAuthCallback();
await Promise.all([renderConnection(), loadXGallery(), loadPersonalGallery()]);
if (oauthError) setGeneratorStatus(oauthError, "error");

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

let memeApiUrl = null;
let latestMeme = null;

function setGeneratorStatus(message, state = "") {
  generatorStatus.textContent = message;
  if (state) generatorStatus.dataset.state = state;
  else delete generatorStatus.dataset.state;
}

function setGenerating(generating) {
  generateButton.disabled = generating || !memeApiUrl;
  readyLabel.hidden = generating;
  workingLabel.hidden = !generating;
  memeIdea.disabled = generating;
  memeStyle.disabled = generating;
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
      setGeneratorStatus("Sharing files is not supported here, so the meme was downloaded.", "ready");
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
  if (!memeApiUrl) return;

  const idea = memeIdea.value.trim();
  if (idea.length < 3) {
    setGeneratorStatus("Give the meme a little more detail.", "error");
    memeIdea.focus();
    return;
  }

  setGenerating(true);
  setGeneratorStatus("Warming up the weird hand. This can take about a minute…");

  try {
    const response = await fetch(memeApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, style: memeStyle.value }),
      signal: AbortSignal.timeout(100_000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The meme machine did not respond.");
    if (!result.image?.startsWith("data:image/")) throw new Error("The model returned no image.");

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

  const generator = project.memeGenerator || {};
  memeApiUrl = generator.enabled && generator.apiUrl ? generator.apiUrl : null;
  modelLabel.textContent = generator.modelLabel || "OpenRouter";
  setGeneratorStatus(
    generator.statusMessage || "The image generator is not connected on this host yet.",
    memeApiUrl ? "ready" : ""
  );
  setGenerating(false);
} catch (error) {
  console.error(error);
  statusLabel.textContent = "Status unavailable";
  setGeneratorStatus("The meme machine status is unavailable. Try again later.", "error");
}

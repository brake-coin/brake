import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), "utf8"));

const project = await readJson("config/project.json");
const tokenPlan = await readJson("token/brake-token-plan.devnet.json");
const metadata = await readJson("token/brake-metadata.draft.json");
const mainnetToken = await readJson("token/stopai-mainnet.json");
const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");

const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(project.status === "live", "Public project status must be live.");
requireValue(project.cluster === "mainnet-beta", "Public configuration must use mainnet-beta.");
requireValue(project.contractAddress === mainnetToken.mint, "Published contract must match the verified mainnet mint.");
requireValue(project.livePostingEnabled === true, "Live X posting must remain enabled.");
requireValue(project.name === "STOPAI", "Public project name must remain STOPAI.");
requireValue(project.symbol === "STOPAI", "Public token symbol must remain STOPAI.");
requireValue(mainnetToken.cluster === "mainnet-beta", "Verified token manifest must use mainnet-beta.");
requireValue(mainnetToken.name === project.name, "Verified token name must match the project.");
requireValue(mainnetToken.symbol === project.symbol, "Verified token symbol must match the project.");
requireValue(mainnetToken.supplyTokens === "1000000000", "Verified token supply must remain fixed at one billion.");
requireValue(mainnetToken.decimals === 9, "Verified mainnet token must use 9 decimals.");
requireValue(mainnetToken.mintAuthority === null, "Mainnet mint authority must remain revoked.");
requireValue(mainnetToken.freezeAuthority === null, "Mainnet freeze authority must remain revoked.");
requireValue(project.token.supplyTokens === mainnetToken.supplyTokens, "Public supply must match the mainnet token.");
requireValue(project.token.decimals === mainnetToken.decimals, "Public decimals must match the mainnet token.");
requireValue(project.token.mintAuthorityRevoked === true, "Public mint-authority status must remain revoked.");
requireValue(project.token.freezeAuthorityRevoked === true, "Public freeze-authority status must remain revoked.");
requireValue(project.links.bags === mainnetToken.bagsUrl, "Public Bags link must match the mainnet token.");
requireValue(project.links.solanaExplorer === mainnetToken.solanaExplorerUrl, "Public explorer link must match the mainnet token.");
requireValue(project.links.x === "https://x.com/STOPAICOIN", "Official X account must remain @STOPAICOIN.");
requireValue(project.links.website === "https://stopai-coin.fly.dev", "Official website must remain the Fly deployment.");
requireValue(
  project.links.telegramStickerPack === "https://t.me/addstickers/stopai_stickers_by_stopaitoken_bot",
  "Official Telegram sticker pack link must remain correct."
);
requireValue(
  project.links.geckoTerminal.includes("Ayq6y3J6FCZg1Lrd8TKDY3HkLRSBWd8pbop2UYDiRXk4"),
  "GeckoTerminal link must remain pinned to the verified STOPAI pool."
);
requireValue(
  project.independenceNotice.includes("Not affiliated with @canadabirdie"),
  "Public configuration must distinguish the project from the creator-fee recipient."
);
requireValue(project.creatorFeeRecipient.venue === "Bags", "Creator-fee venue must remain Bags.");
requireValue(project.creatorFeeRecipient.platform === "X", "Creator-fee recipient platform must remain X.");
requireValue(project.creatorFeeRecipient.handle === "@canadabirdie", "Creator-fee recipient must remain @canadabirdie.");
requireValue(
  project.creatorFeeRecipient.profileUrl === "https://x.com/canadabirdie",
  "Creator-fee recipient profile must remain public."
);
requireValue(project.creatorFeeRecipient.status === "configured", "Creator-fee recipient status must remain configured.");
requireValue(
  project.creatorFeeRecipient.scope === "Bags creator-fee distribution",
  "Creator-fee scope must remain precise."
);
requireValue(project.creatorFeeRecipient.sharePercent === 100, "Bags creator-fee share must remain 100%.");
requireValue(
  project.creatorFeeRecipient.verificationUrl === project.links.bags,
  "Creator-fee verification must use the official Bags page."
);
requireValue(
  dockerfile.includes("COPY --from=build --chown=node:node /app/config ./config"),
  "The production image must include the project configuration."
);
requireValue(
  project.memeGenerator.enabled === true &&
    project.memeGenerator.mode === "openrouter-oauth-pkce-byok",
  "Meme generation must use visitor-owned OpenRouter OAuth PKCE."
);
requireValue(tokenPlan.cluster === "devnet", "Token plan must remain on devnet.");
requireValue(
  tokenPlan.liveDeploymentEnabled === false,
  "Historical devnet plan must remain non-deploying."
);
requireValue(tokenPlan.publicLaunchAllocationPercent === 100, "Public allocation must be 100%.");
requireValue(tokenPlan.insiderAllocationPercent === 0, "Insider allocation must be 0%.");
requireValue(tokenPlan.transferFeeBasisPoints === 0, "Transfer fee must be 0 basis points.");
requireValue(project.name === tokenPlan.name, "Project name must match the token plan.");
requireValue(project.symbol === tokenPlan.symbol, "Project symbol must match the token plan.");
requireValue(metadata.name === tokenPlan.name, "Metadata name must match the token plan.");
requireValue(metadata.symbol === tokenPlan.symbol, "Metadata symbol must match the token plan.");

for (const relativePath of [
  "README.md",
  "apps/site/index.html",
  "apps/site/mint.html",
  "apps/bot/src/persona.mjs",
  "docs/BRAKE_SIMPLE.md",
  "docs/TELEGRAM.md"
]) {
  const content = await readFile(path.join(root, relativePath), "utf8");
  requireValue(
    content.includes(mainnetToken.mint),
    `${relativePath} must publish the verified mainnet mint.`
  );
}

for (const relativePath of [
  "README.md",
  "apps/site/index.html",
  "apps/site/mint.html",
  "apps/bot/src/persona.mjs",
  "docs/BRAKE_SIMPLE.md",
  "docs/TELEGRAM.md"
]) {
  const content = await readFile(path.join(root, relativePath), "utf8");
  requireValue(
    content.includes("https://x.com/canadabirdie"),
    `${relativePath} must publish the configured creator-fee recipient.`
  );
}

await access(path.join(root, tokenPlan.canonicalImage));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Repository safety and consistency checks passed.");
}

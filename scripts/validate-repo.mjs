import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), "utf8"));

const project = await readJson("config/project.json");
const tokenPlan = await readJson("token/brake-token-plan.devnet.json");
const metadata = await readJson("token/brake-metadata.draft.json");

const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(project.status === "prelaunch", "Project status must remain prelaunch.");
requireValue(project.cluster === "devnet", "Public configuration must remain on devnet.");
requireValue(project.contractAddress === null, "Contract address must remain empty.");
requireValue(project.grantsWallet === null, "Grants wallet must remain empty.");
requireValue(project.livePostingEnabled === false, "Live posting must remain disabled.");
requireValue(project.name === "STOPAI", "Public project name must remain STOPAI.");
requireValue(project.symbol === "STOPAI", "Public token symbol must remain STOPAI.");
requireValue(
  project.memeGenerator.enabled === true &&
    project.memeGenerator.mode === "openrouter-oauth-pkce-byok",
  "Meme generation must use visitor-owned OpenRouter OAuth PKCE."
);
requireValue(
  project.feePolicy.projectControlledCreatorFeesToGrantsPercent === 100,
  "Creator-fee grant policy must remain 100%."
);
requireValue(tokenPlan.cluster === "devnet", "Token plan must remain on devnet.");
requireValue(
  tokenPlan.liveDeploymentEnabled === false,
  "Token plan must not enable live deployment."
);
requireValue(tokenPlan.publicLaunchAllocationPercent === 100, "Public allocation must be 100%.");
requireValue(tokenPlan.insiderAllocationPercent === 0, "Insider allocation must be 0%.");
requireValue(tokenPlan.transferFeeBasisPoints === 0, "Transfer fee must be 0 basis points.");
requireValue(project.name === tokenPlan.name, "Project name must match the token plan.");
requireValue(project.symbol === tokenPlan.symbol, "Project symbol must match the token plan.");
requireValue(metadata.name === tokenPlan.name, "Metadata name must match the token plan.");
requireValue(metadata.symbol === tokenPlan.symbol, "Metadata symbol must match the token plan.");

await access(path.join(root, tokenPlan.canonicalImage));

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Repository safety and consistency checks passed.");
}

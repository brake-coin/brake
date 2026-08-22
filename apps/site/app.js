const statusLabel = document.querySelector("#project-status");
const contractNotice = document.querySelector("#contract-notice");
const riskNotice = document.querySelector("#risk-notice");
const independenceNotice = document.querySelector("#independence-notice");
const lastUpdated = document.querySelector("#last-updated");

try {
  const response = await fetch("./config/project.json");
  if (!response.ok) throw new Error(`Project status request failed: ${response.status}`);

  const project = await response.json();
  statusLabel.textContent = project.status.replaceAll("-", " ");
  riskNotice.textContent = project.riskNotice;
  independenceNotice.textContent = project.independenceNotice;
  lastUpdated.textContent = `Status updated ${project.lastUpdated}`;

  contractNotice.textContent = project.contractAddress
    ? `Contract: ${project.contractAddress}`
    : "No token contract has been published. Ignore lookalikes.";
} catch (error) {
  console.error(error);
  statusLabel.textContent = "Status unavailable";
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public project configuration keeps live posting disabled", async () => {
  const projectUrl = new URL("../../../config/project.json", import.meta.url);
  const project = JSON.parse(await readFile(projectUrl, "utf8"));
  assert.equal(project.livePostingEnabled, false);
  assert.equal(project.status, "live");
  assert.equal(project.contractAddress, "2aTbo3yssANLrNoam4FFjNzkiuGQsCVqmHXrzYchBAGS");
  assert.equal(project.grantsWallet, null);
});

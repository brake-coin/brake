import assert from "node:assert/strict";
import test from "node:test";

import { telegramHtmlFromMarkdown } from "../src/telegram-format.mjs";

test("Telegram formatting renders common Markdown as safe HTML", () => {
  assert.equal(
    telegramHtmlFromMarkdown([
      "## STOPAI",
      "**Bold & safe** and ~~stale~~.",
      "[Official](https://example.com?a=1&b=2)",
      "`<tag>`"
    ].join("\n")),
    [
      "<b>STOPAI</b>",
      "<b>Bold &amp; safe</b> and <s>stale</s>.",
      "<a href=\"https://example.com?a=1&amp;b=2\">Official</a>",
      "<code>&lt;tag&gt;</code>"
    ].join("\n")
  );
});

test("Telegram formatting does not interpret Markdown inside code", () => {
  assert.equal(
    telegramHtmlFromMarkdown("```text\n**literal** <unsafe>\n```"),
    "<pre>**literal** &lt;unsafe&gt;\n</pre>"
  );
});


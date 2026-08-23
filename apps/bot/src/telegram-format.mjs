function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function telegramHtmlFromMarkdown(value) {
  const protectedParts = [];
  const protect = (html) => {
    const marker = `\uE000${protectedParts.length}\uE001`;
    protectedParts.push(html);
    return marker;
  };

  let html = escapeHtml(String(value || "").slice(0, 3_900));
  html = html.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_match, content) => (
    protect(`<pre>${content}</pre>`)
  ));
  html = html.replace(/`([^`\n]+)`/g, (_match, content) => (
    protect(`<code>${content}</code>`)
  ));
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) => (
    protect(`<a href="${url}">${label}</a>`)
  ));
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/__([^_\n]+)__/g, "<b>$1</b>");
  html = html.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  html = html.replace(/(^|\n)#{1,6}\s+([^\n]+)/g, "$1<b>$2</b>");

  return html.replace(/\uE000(\d+)\uE001/g, (_match, index) => protectedParts[Number(index)] || "");
}


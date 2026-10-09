export const FALLBACK_FONTS = [
  "Segoe UI",
  "Malgun Gothic",
  "Arial",
  "Calibri",
  "Consolas",
  "Courier New",
  "Georgia",
  "Tahoma",
  "Times New Roman",
  "Verdana",
];

export const FONT_STYLES = ["normal", "bold", "italic", "bolditalic"];

/** The four switches of the Font page. Each is on or off on its own. */
export const FONT_FLAGS = ["fontBold", "fontItalic", "fontUnderline", "fontStrike"];

/** The older single style choice, kept in step so files from 1.0 still read it. */
export function fontStyleOf(bold, italic) {
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

/**
 * The CSS for the quote text. `weight` and `style` go on the stock display as a
 * whole; `decoration` is drawn on each piece of text so a strike line runs through
 * the middle of a 44px price as well as a 12px exchange name.
 */
export function fontFace(settings = {}) {
  const lines = [];
  if (settings.fontUnderline) lines.push("underline");
  if (settings.fontStrike) lines.push("line-through");
  return {
    family: `"${String(settings.fontFamily || FALLBACK_FONTS[0])}", sans-serif`,
    size: `${Number(settings.fontSize) || 14}px`,
    bold: Boolean(settings.fontBold),
    italic: Boolean(settings.fontItalic),
    decoration: lines.length ? lines.join(" ") : "none",
  };
}

/** Put the face on one element that holds stock text. */
export function applyFontFace(node, settings) {
  if (!node) return;
  const face = fontFace(settings);
  node.dataset.fontScope = "stocks";
  node.dataset.fontBold = String(face.bold);
  node.dataset.fontItalic = String(face.italic);
  node.style.fontFamily = face.family;
  node.style.setProperty("--font-decoration", face.decoration);
}

export function parseWindowsFonts(stdout) {
  return uniqueLines(stdout);
}

export function parseFcList(stdout) {
  const names = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const parts = line.split(":");
    if (parts.length < 2) continue;
    const family = parts[1].split(",")[0].trim();
    if (family) names.add(family);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function parseMacFonts(stdout) {
  const names = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const match = line.match(/Full Name:\s+(.+)$/) || line.match(/Family:\s+(.+)$/);
    if (match) names.add(match[1].trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function resolveFontList(systemFonts) {
  const list = Array.isArray(systemFonts) ? systemFonts.map((name) => String(name).trim()).filter(Boolean) : [];
  if (list.length) return [...new Set(list)].sort((a, b) => a.localeCompare(b));
  return [...FALLBACK_FONTS];
}

function uniqueLines(stdout) {
  const names = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const name = line.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

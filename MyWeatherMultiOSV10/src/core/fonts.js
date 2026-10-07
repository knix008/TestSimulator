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

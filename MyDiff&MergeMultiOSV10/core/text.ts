/**
 * Text helpers with no file system behind them.
 *
 * Split out from `textFile.ts` so the browser bundle can use them: the renderer needs
 * `formatBytes` and the line-splitting rules, but importing anything that touches
 * `node:fs` would drag a stub of it into the bundle.
 */

/** Refuse to load anything larger than this as text; the hex view handles the rest. */
export const MAX_TEXT_BYTES = 64 * 1024 * 1024;

export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** Splits into lines and records whether the text ended with a break. */
export function splitBody(text: string): { lines: string[]; trailingNewline: boolean } {
  const lines = splitLines(text);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
    return { lines, trailingNewline: true };
  }
  return { lines, trailingNewline: text.length === 0 };
}

export function detectNewline(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Drops a UTF-8 byte order mark, which would otherwise become part of line 1. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unit]}`;
}

/**
 * The terminal panel's text rules, kept out of the component so they can be read — and
 * tested — on their own.
 */
import type { TerminalCr } from "../core/settings.js";

/**
 * Adds output to the text already shown, applying the carriage-return rule:
 *
 *   `overwrite` — the text after a lone CR replaces the current line, which is what a
 *                 terminal shows when a progress bar redraws itself;
 *   `newline`   — the CR breaks the line;
 *   `strip`     — it is dropped, so the pieces run together.
 *
 * A CR at the very end is kept until the next piece says whether an LF follows it.
 */
export function mergeOutput(previous: string, incoming: string, mode: TerminalCr): string {
  let out = previous;
  let text = incoming;
  if (out.endsWith("\r")) {
    out = out.slice(0, -1);
    text = `\r${text}`;
  }
  let i = 0;
  while (i < text.length) {
    const cr = text.indexOf("\r", i);
    if (cr < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, cr);
    if (cr === text.length - 1) {
      // Pending: whether this is a line break depends on the next chunk.
      out += "\r";
      break;
    }
    if (text[cr + 1] === "\n") {
      out += "\n";
      i = cr + 2;
      continue;
    }
    if (mode === "newline") out += "\n";
    else if (mode !== "strip") out = out.slice(0, out.lastIndexOf("\n") + 1);
    i = cr + 1;
  }
  return out;
}

/** Candidates listed the way a shell lists them: in columns as wide as the panel allows. */
export function columns(names: string[], width: number): string {
  if (names.length === 0) return "";
  const cell = Math.max(...names.map((name) => name.length)) + 2;
  const count = Math.max(1, Math.floor(width / cell));
  const rows: string[] = [];
  for (let i = 0; i < names.length; i += count) {
    rows.push(names
      .slice(i, i + count)
      .map((name, position) => (position === count - 1 ? name : name.padEnd(cell)))
      .join("")
      .trimEnd());
  }
  return rows.join("\n");
}

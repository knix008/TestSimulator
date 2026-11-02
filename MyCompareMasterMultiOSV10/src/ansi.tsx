/**
 * The terminal output, coloured.
 *
 * Two layers. The first is what the program itself said: ANSI SGR (`\x1b[…m`) runs —
 * 16 / 256 / 24-bit colours, bold, dim, italic, underline, inverse, strike — which the
 * backend leaves in the stream for exactly this. Every other escape sequence is already
 * gone by the time the text arrives here.
 *
 * The second layer is what the program did not say. Through a pipe most tools print no
 * colour at all, so a plain run is read for the things a terminal would have coloured:
 * a line that opens with `error` / `warning` / `ok`, a URL, a `file:line` reference, and
 * the listings of `ls -l`, `dir` and `Get-ChildItem`, where the entry's kind colours its
 * name and the columns before it are dimmed. A program's own colours always win, because
 * this only ever looks at the runs it left uncoloured.
 */
import React, { type CSSProperties } from "react";

const BASIC = ["#3b3b3b", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#d0d0d0"];
const BRIGHT = ["#7f848e", "#ff7b86", "#b5e890", "#ffd479", "#7cc4ff", "#dd8cf5", "#7fd7e2", "#ffffff"];

function color256(value: number): string {
  if (value < 8) return BASIC[value];
  if (value < 16) return BRIGHT[value - 8];
  if (value < 232) {
    const index = value - 16;
    const r = Math.floor(index / 36);
    const g = Math.floor((index % 36) / 6);
    const b = index % 6;
    const level = (x: number) => (x ? 55 + x * 40 : 0);
    return `rgb(${level(r)},${level(g)},${level(b)})`;
  }
  const grey = 8 + (value - 232) * 10;
  return `rgb(${grey},${grey},${grey})`;
}

type Style = {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  strike: boolean;
};

const RESET: Style = {
  fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, inverse: false, strike: false,
};

function apply(style: Style, params: number[]): Style {
  const next = { ...style };
  for (let i = 0; i < params.length; i++) {
    const code = params[i];
    if (code === 0) Object.assign(next, RESET);
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 9) next.strike = true;
    else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 27) next.inverse = false;
    else if (code === 29) next.strike = false;
    else if (code >= 30 && code <= 37) next.fg = BASIC[code - 30];
    else if (code === 39) next.fg = null;
    else if (code >= 40 && code <= 47) next.bg = BASIC[code - 40];
    else if (code === 49) next.bg = null;
    else if (code >= 90 && code <= 97) next.fg = BRIGHT[code - 90];
    else if (code >= 100 && code <= 107) next.bg = BRIGHT[code - 100];
    else if (code === 38 || code === 48) {
      const mode = params[i + 1];
      let color: string | null = null;
      if (mode === 5) {
        color = color256(params[i + 2] || 0);
        i += 2;
      } else if (mode === 2) {
        color = `rgb(${params[i + 2] || 0},${params[i + 3] || 0},${params[i + 4] || 0})`;
        i += 4;
      }
      if (code === 38) next.fg = color;
      else next.bg = color;
    }
  }
  return next;
}

// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[([0-9;]*)m/g;

export type AnsiRun = { text: string; style: Style | null };

export function parseAnsi(text: string): AnsiRun[] {
  const runs: AnsiRun[] = [];
  let style: Style = { ...RESET };
  let last = 0;
  let match: RegExpExecArray | null;
  SGR.lastIndex = 0;
  const plain = (value: Style) => !value.fg && !value.bg && !value.bold && !value.dim
    && !value.italic && !value.underline && !value.inverse && !value.strike;
  while ((match = SGR.exec(text))) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), style: plain(style) ? null : style });
    style = apply(style, (match[1] || "0").split(";").map((part) => Number(part) || 0));
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), style: plain(style) ? null : style });
  return runs;
}

export const hasAnsi = (text: string): boolean => text.includes("\x1b[");

export function stripAnsi(text: string): string {
  return text.replace(SGR, "");
}

function css(style: Style): CSSProperties {
  const out: CSSProperties = {};
  let fg = style.fg;
  let bg = style.bg;
  if (style.inverse) {
    const swap = fg;
    fg = bg || "var(--text)";
    bg = swap || "var(--bg)";
  }
  if (fg) out.color = fg;
  if (bg) out.background = bg;
  if (style.bold) out.fontWeight = 700;
  if (style.dim) out.opacity = 0.65;
  if (style.italic) out.fontStyle = "italic";
  if (style.underline || style.strike) {
    out.textDecoration = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].join(" ").trim();
  }
  return out;
}

const LINE_RE = /^(?:\s*)(?:(error|err!|fatal|failed|failure|exception|traceback|panic|✘|✗|×)|(warn|warning|deprecated|⚠)|(ok|success|succeeded|passed|done|completed|✔|✓)|(info|note|hint|debug))\b/i;
const WORD_RE = /(https?:\/\/[^\s"'<>)\]]+)|((?:[A-Za-z]:)?[\w./\\~-]+\.[A-Za-z0-9]{1,8}:\d+(?::\d+)?)|\b(error|errors|fatal|failed|failure|exception|panic)\b|\b(warning|warnings|deprecated)\b|\b(ok|success|succeeded|passed|done)\b/gi;

const LS_LONG = /^([-dlcbps][rwxsStT-]{9}[+@.]?)(\s+\d+\s+\S+\s+\S+\s+[\d,.]+[KMGT]?\s+\S+\s+\d+\s+[\d:]+\s)(.*)$/;
const DIR_CMD = /^(\d{4}[-./]\d{2}[-./]\d{2}\s+\S+(?:\s+\S+)?\s+)(<(?:DIR|JUNCTION|SYMLINKD?)>|[\d,.]+)(\s+)(.+)$/;
const DIR_PS = /^([d-][a-][r-][h-][s-][l-]{1,2}\s+\S+\s+\S+(?:\s+\S+)?\s+)(\d*)(\s+)(\S.*?)\s*$/;

const KIND_RE: Record<string, RegExp> = {
  exe: /\.(?:exe|com|bat|cmd|ps1|sh|bash|zsh|msi|app|run|bin)$/i,
  arch: /\.(?:zip|7z|rar|tar|gz|tgz|bz2|xz|zst|jar|war|deb|rpm|dmg|iso)$/i,
  img: /\.(?:png|jpe?g|gif|bmp|webp|svg|ico|tiff?|avif|heic|heif|dcm|dicom|mp4|mkv|mov|avi|webm|mp3|wav|flac|ogg)$/i,
  doc: /\.(?:md|txt|pdf|docx?|xlsx?|pptx?|rtf|odt|html?)$/i,
  code: /\.(?:[cm]?[jt]sx?|py|java|kt|go|rs|c|h|cpp|hpp|cs|rb|php|swift|lua|sql|json|ya?ml|toml|xml|css|scss|vue|svelte|dockerfile)$/i,
};

function nameKind(name: string, permissions?: string): string {
  if (permissions && /^d/.test(permissions)) return "t-dir";
  if (permissions && /^l/.test(permissions)) return "t-link";
  if (permissions && /^[-]\S*x/.test(permissions) && !/\.(?:txt|md|json|ya?ml|xml|html?|css)$/i.test(name)) return "t-exe";
  for (const kind of Object.keys(KIND_RE)) if (KIND_RE[kind].test(name)) return `t-${kind}`;
  return "";
}

function listingLine(line: string, key: string): React.ReactNode[] | null {
  let match = LS_LONG.exec(line);
  if (match) {
    const kind = nameKind(match[3].replace(/\s->\s.*$/, "").replace(/[*/@=|]$/, ""), match[1]);
    return [
      <span key={`${key}-p`} className={/^d/.test(match[1]) ? "t-dir" : "t-dim"}>{match[1]}</span>,
      <span key={`${key}-c`} className="t-dim">{match[2]}</span>,
      kind ? <span key={`${key}-n`} className={kind}>{match[3]}</span> : match[3],
    ];
  }
  match = DIR_CMD.exec(line);
  if (match) {
    // DIR, JUNCTION and SYMLINK(D) come in angle brackets; a size does not.
    const dir = match[2].startsWith("<");
    const kind = dir ? (match[2].slice(1, -1) === "DIR" ? "t-dir" : "t-link") : nameKind(match[4]);
    return [
      <span key={`${key}-d`} className="t-dim">{match[1]}</span>,
      <span key={`${key}-s`} className={dir ? kind : "t-dim"}>{match[2]}</span>,
      match[3],
      kind ? <span key={`${key}-n`} className={kind}>{match[4]}</span> : match[4],
    ];
  }
  match = DIR_PS.exec(line);
  if (match) {
    const kind = /^d/.test(match[1]) ? "t-dir" : /l/.test(match[1].slice(0, 7)) ? "t-link" : nameKind(match[4]);
    return [
      <span key={`${key}-m`} className={/^d/.test(match[1]) ? "t-dir" : "t-dim"}>{match[1]}</span>,
      <span key={`${key}-s`} className="t-dim">{match[2]}</span>,
      match[3],
      kind ? <span key={`${key}-n`} className={kind}>{match[4]}</span> : match[4],
    ];
  }
  return null;
}

function smartLine(line: string, key: string): React.ReactNode {
  const listing = listingLine(line, key);
  if (listing) return listing;
  const lead = LINE_RE.exec(line);
  const className = lead ? (lead[1] ? "t-err" : lead[2] ? "t-warn" : lead[3] ? "t-ok" : "t-info") : "";
  const parts: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  let word: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((word = WORD_RE.exec(line))) {
    if (word.index > last) parts.push(line.slice(last, word.index));
    const kind = word[1] ? "t-url" : word[2] ? "t-path" : word[3] ? "t-err" : word[4] ? "t-warn" : "t-ok";
    parts.push(<span key={`${key}-${n++}`} className={kind}>{word[0]}</span>);
    last = word.index + word[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return className ? <span key={key} className={className}>{parts}</span> : parts;
}

function smart(text: string, key: string | number): React.ReactNode {
  if (!/[A-Za-z✔✓✘✗×⚠<]/.test(text)) return text;
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <React.Fragment key={`${key}-${index}`}>
      {line ? smartLine(line, `${key}-${index}`) : null}
      {index < lines.length - 1 ? "\n" : null}
    </React.Fragment>
  ));
}

/** `color: false` drops every colour, the program's own included. */
export function AnsiText({ text, color = true }: { text: string; color?: boolean }): React.ReactNode {
  if (!color) return stripAnsi(text);
  if (!hasAnsi(text)) return smart(text, "p");
  return parseAnsi(text).map((run, index) => (run.style
    ? <span key={index} style={css(run.style)}>{run.text}</span>
    : <React.Fragment key={index}>{smart(run.text, index)}</React.Fragment>));
}

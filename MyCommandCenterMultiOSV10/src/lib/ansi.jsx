// ANSI SGR ("\x1b[…m") colours and attributes → styled runs, for the terminal
// tabs of the bottom dock: 16 / 256 / 24-bit colours, bold, dim, italic,
// underline, inverse, strike. Any other escape sequence is dropped by the
// backend already (core/terminal.js).
//
// On top of what a program colours itself, `smart` highlighting colours what
// it left plain: error / warning / success lines, URLs, file:line references
// and the columns of a `ls -l` / `dir` / Get-ChildItem listing — those print
// no colour through a pipe. Settings › terminal switches the whole lot off
// (`color=false`: plain text, the program's own colours dropped too).
import React from 'react';

const BASIC = ['#3b3b3b', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d0d0d0'];
const BRIGHT = ['#7f848e', '#ff7b86', '#b5e890', '#ffd479', '#7cc4ff', '#dd8cf5', '#7fd7e2', '#ffffff'];

function color256(n) {
  if (n < 8) return BASIC[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n < 232) { const i = n - 16; const r = Math.floor(i / 36), g = Math.floor((i % 36) / 6), b = i % 6; const v = (x) => (x ? 55 + x * 40 : 0); return `rgb(${v(r)},${v(g)},${v(b)})`; }
  const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`;
}

const RESET = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, inverse: false, strike: false };

function apply(style, params) {
  const s = { ...style };
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    if (p === 0) Object.assign(s, RESET);
    else if (p === 1) s.bold = true; else if (p === 2) s.dim = true; else if (p === 3) s.italic = true; else if (p === 4) s.underline = true;
    else if (p === 7) s.inverse = true; else if (p === 9) s.strike = true;
    else if (p === 22) { s.bold = false; s.dim = false; } else if (p === 23) s.italic = false; else if (p === 24) s.underline = false; else if (p === 27) s.inverse = false; else if (p === 29) s.strike = false;
    else if (p >= 30 && p <= 37) s.fg = BASIC[p - 30]; else if (p === 39) s.fg = null;
    else if (p >= 40 && p <= 47) s.bg = BASIC[p - 40]; else if (p === 49) s.bg = null;
    else if (p >= 90 && p <= 97) s.fg = BRIGHT[p - 90]; else if (p >= 100 && p <= 107) s.bg = BRIGHT[p - 100];
    else if (p === 38 || p === 48) {
      const mode = params[i + 1];
      let c = null;
      if (mode === 5) { c = color256(params[i + 2] || 0); i += 2; }
      else if (mode === 2) { c = `rgb(${params[i + 2] || 0},${params[i + 3] || 0},${params[i + 4] || 0})`; i += 4; }
      if (p === 38) s.fg = c; else s.bg = c;
    }
  }
  return s;
}

const SGR = /\x1b\[([0-9;]*)m/g;

// text → [{ text, style }] (style null for plain runs)
export function parseAnsi(text) {
  const runs = [];
  let style = { ...RESET };
  let last = 0;
  let m;
  SGR.lastIndex = 0;
  const plain = (st) => !st.fg && !st.bg && !st.bold && !st.dim && !st.italic && !st.underline && !st.inverse && !st.strike;
  while ((m = SGR.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), style: plain(style) ? null : style });
    style = apply(style, (m[1] || '0').split(';').map((x) => Number(x) || 0));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), style: plain(style) ? null : style });
  return runs;
}

export const hasAnsi = (text) => text.includes('\x1b[');

function css(st) {
  const o = {};
  let fg = st.fg, bg = st.bg;
  if (st.inverse) { const t = fg; fg = bg || 'var(--fg)'; bg = t || 'var(--bg)'; }
  if (fg) o.color = fg;
  if (bg) o.background = bg;
  if (st.bold) o.fontWeight = 700;
  if (st.dim) o.opacity = 0.65;
  if (st.italic) o.fontStyle = 'italic';
  if (st.underline || st.strike) o.textDecoration = [st.underline ? 'underline' : '', st.strike ? 'line-through' : ''].join(' ').trim();
  return o;
}

// Colour the output has no colour for: lines a tool marks as an error / warning / success (from their first
// word), and the words "error", "warning", "ok" … URLs and file:line references inside plain text. Applied to
// the runs a program left uncoloured, so its own colours always win.
const LINE_RE = /^(?:\s*)(?:(error|err!|fatal|failed|failure|exception|traceback|panic|✘|✗|×)|(warn|warning|deprecated|⚠)|(ok|success|succeeded|passed|done|completed|✔|✓)|(info|note|hint|debug))\b/i;
const WORD_RE = /(https?:\/\/[^\s"'<>)\]]+)|((?:[A-Za-z]:)?[\w./\\~-]+\.[A-Za-z0-9]{1,8}:\d+(?::\d+)?)|\b(error|errors|fatal|failed|failure|exception|panic)\b|\b(warning|warnings|deprecated)\b|\b(ok|success|succeeded|passed|done)\b/gi;
export function stripAnsi(text) { return text.replace(SGR, ''); }

// Directory listings — `ls -l` (posix), `dir` (cmd) and Get-ChildItem (PowerShell) print no colour through a
// pipe: the entry's kind colours its name (directory, link, executable, archive, image, document, code) and
// the columns before it are dimmed, as a terminal with LS_COLORS would show them.
const LS_LONG = /^([-dlcbps][rwxsStT-]{9}[+@.]?)(\s+\d+\s+\S+\s+\S+\s+[\d,.]+[KMGT]?\s+\S+\s+\d+\s+[\d:]+\s)(.*)$/;
const DIR_CMD = /^(\d{4}[-./]\d{2}[-./]\d{2}\s+\S+(?:\s+\S+)?\s+)(<(?:DIR|JUNCTION|SYMLINKD?)>|[\d,.]+)(\s+)(.+)$/;
const DIR_PS = /^([d-][a-][r-][h-][s-][l-]{1,2}\s+\S+\s+\S+(?:\s+\S+)?\s+)(\d*)(\s+)(\S.*?)\s*$/;
const KIND_RE = { exe: /\.(?:exe|com|bat|cmd|ps1|sh|bash|zsh|msi|app|run|bin)$/i, arch: /\.(?:zip|7z|rar|tar|gz|tgz|bz2|xz|zst|jar|war|deb|rpm|dmg|iso)$/i, img: /\.(?:png|jpe?g|gif|bmp|webp|svg|ico|tiff?|avif|mp4|mkv|mov|avi|webm|mp3|wav|flac|ogg)$/i, doc: /\.(?:md|txt|pdf|docx?|xlsx?|pptx?|rtf|odt|html?)$/i, code: /\.(?:[cm]?[jt]sx?|py|java|kt|go|rs|c|h|cpp|hpp|cs|rb|php|swift|lua|sql|json|ya?ml|toml|xml|css|scss|vue|svelte|dockerfile)$/i };
const nameKind = (name, perm) => {
  if (perm && /^d/.test(perm)) return 't-dir';
  if (perm && /^l/.test(perm)) return 't-link';
  if (perm && /^[-]\S*x/.test(perm) && !/\.(?:txt|md|json|ya?ml|xml|html?|css)$/i.test(name)) return 't-exe';
  for (const k of Object.keys(KIND_RE)) if (KIND_RE[k].test(name)) return `t-${k}`;
  return '';
};
function listingLine(line, key) {
  let m;
  if ((m = LS_LONG.exec(line))) {
    const kind = nameKind(m[3].replace(/\s->\s.*$/, '').replace(/[*/@=|]$/, ''), m[1]);
    return [<span key={`${key}-p`} className={/^d/.test(m[1]) ? 't-dir' : 't-dim'}>{m[1]}</span>, <span key={`${key}-c`} className="t-dim">{m[2]}</span>, kind ? <span key={`${key}-n`} className={kind}>{m[3]}</span> : m[3]];
  }
  if ((m = DIR_CMD.exec(line))) {
    const dir = m[2].startsWith('<');   // DIR, JUNCTION, SYMLINK(D) in angle brackets
    const kind = dir ? (m[2].slice(1, -1) === 'DIR' ? 't-dir' : 't-link') : nameKind(m[4]);
    return [<span key={`${key}-d`} className="t-dim">{m[1]}</span>, <span key={`${key}-s`} className={dir ? kind : 't-dim'}>{m[2]}</span>, m[3], kind ? <span key={`${key}-n`} className={kind}>{m[4]}</span> : m[4]];
  }
  if ((m = DIR_PS.exec(line))) {
    const kind = /^d/.test(m[1]) ? 't-dir' : /l/.test(m[1].slice(0, 7)) ? 't-link' : nameKind(m[4]);
    return [<span key={`${key}-m`} className={/^d/.test(m[1]) ? 't-dir' : 't-dim'}>{m[1]}</span>, <span key={`${key}-s`} className="t-dim">{m[2]}</span>, m[3], kind ? <span key={`${key}-n`} className={kind}>{m[4]}</span> : m[4]];
  }
  return null;
}
function smartLine(line, key) {
  const listing = listingLine(line, key);
  if (listing) return listing;
  const m = LINE_RE.exec(line);
  const cls = m ? (m[1] ? 't-err' : m[2] ? 't-warn' : m[3] ? 't-ok' : 't-info') : '';
  const parts = [];
  let last = 0, k = 0, w;
  WORD_RE.lastIndex = 0;
  while ((w = WORD_RE.exec(line))) {
    if (w.index > last) parts.push(line.slice(last, w.index));
    const c = w[1] ? 't-url' : w[2] ? 't-path' : w[3] ? 't-err' : w[4] ? 't-warn' : 't-ok';
    parts.push(<span key={`${key}-${k++}`} className={c}>{w[0]}</span>);
    last = w.index + w[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return cls ? <span key={key} className={cls}>{parts}</span> : parts;
}
function smart(text, key) {
  if (!/[A-Za-z✔✓✘✗×⚠<]/.test(text)) return text;
  const lines = text.split('\n');
  return lines.map((l, i) => <React.Fragment key={`${key}-${i}`}>{l ? smartLine(l, `${key}-${i}`) : null}{i < lines.length - 1 ? '\n' : null}</React.Fragment>);
}

// color: false → everything as plain text (the program's colours dropped too); smart → the highlighting above.
export function AnsiText({ text, color = true, smart: smartOn = true }) {
  if (!color) return stripAnsi(text);
  if (!hasAnsi(text)) return smartOn ? smart(text, 'p') : text;
  return parseAnsi(text).map((r, i) => (r.style ? <span key={i} style={css(r.style)}>{r.text}</span> : <React.Fragment key={i}>{smartOn ? smart(r.text, i) : r.text}</React.Fragment>));
}

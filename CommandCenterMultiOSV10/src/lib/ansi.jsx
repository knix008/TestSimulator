// ANSI SGR ("\x1b[…m") colours and attributes → styled runs, for the terminal
// panel: 16 / 256 / 24-bit colours, bold, dim, italic, underline, inverse,
// strike. Any other escape sequence is dropped by the backend already.
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

export function AnsiText({ text }) {
  if (!hasAnsi(text)) return text;
  return parseAnsi(text).map((r, i) => (r.style ? <span key={i} style={css(r.style)}>{r.text}</span> : <React.Fragment key={i}>{r.text}</React.Fragment>));
}

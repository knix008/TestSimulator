'use strict';

// PDF 1.7 writer for the export document model.
//
// Layout: A4 portrait, title block, headings (with bookmarks), wrapped
// paragraphs and lists, verdict badges, key/value tables and data tables
// with borders, a shaded header row repeated after every page break and
// rows split across pages when taller than a page, running header with
// the title and "Page N of M" footer.
//
// Fonts: a TrueType font is embedded as a Type0 / CIDFontType2 font
// (Identity-H, CIDToGIDMap /Identity, /W widths, ToUnicode CMap), subset to
// the glyphs used. Lookup: opts.fontPath -> Windows Malgun Gothic -> macOS
// Apple SD Gothic Neo (.ttc face 0) -> Linux Noto CJK / Nanum Gothic under
// /usr/share/fonts -> built-in Helvetica (Latin only, other characters
// become '?', with a warning). CFF-based .otf / .ttc (for example the usual
// Noto Sans CJK builds) cannot be embedded by this writer and are skipped
// with a warning. A bold face next to the regular one (malgunbd.ttf,
// *-Bold.ttf, NanumGothicBold.ttf) is used for bold text when present;
// otherwise bold is simulated with fill+stroke rendering.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { TrueTypeFont } = require('./ttf');
const M = require('./model');

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = { left: 42, right: 42, top: 58, bottom: 52 };
const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right;
const COLORS = { text: '#1c2530', muted: '#5b6876', line: '#b0bac6', rule: '#d3dae3', head: '#eef1f5', key: '#f4f6f9' };

const STR = {
  en: {
    page: 'Page {n} of {N}',
    fallback: 'No Korean-capable TrueType font was found; the PDF uses Helvetica (Latin only).',
    replaced: 'Characters Helvetica cannot show were replaced with "?".',
    cff: 'Font {f} uses CFF outlines, which this PDF writer cannot embed; it was skipped.',
    missing: 'Font file {f} was not found.',
    bad: 'Font file {f} could not be read: {e}',
    restricted: 'Font {f} does not allow embedding; it was skipped.',
  },
  ko: {
    page: '{N}\ucabd \uc911 {n}\ucabd',
    fallback: '\ud55c\uae00\uc744 \ud45c\uc2dc\ud560 TrueType \uae00\uaf34\uc744 \ucc3e\uc9c0 \ubabb\ud574 Helvetica(\ub77c\ud2f4 \ubb38\uc790\ub9cc)\ub85c PDF\ub97c \ub9cc\ub4e4\uc5c8\uc2b5\ub2c8\ub2e4.',
    replaced: 'Helvetica\ub85c \ud45c\uc2dc\ud560 \uc218 \uc5c6\ub294 \ubb38\uc790\ub97c "?"\ub85c \ubc14\uafb8\uc5c8\uc2b5\ub2c8\ub2e4.',
    cff: '{f} \uae00\uaf34\uc740 CFF \uc724\uacfd\uc120\uc744 \uc368\uc11c \ub0b4\uc7a5\ud560 \uc218 \uc5c6\uc5b4 \uac74\ub108\ub6f0\uc5c8\uc2b5\ub2c8\ub2e4.',
    missing: '\uae00\uaf34 \ud30c\uc77c {f}\uc744(\ub97c) \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.',
    bad: '\uae00\uaf34 \ud30c\uc77c {f}\uc744(\ub97c) \uc77d\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4: {e}',
    restricted: '{f} \uae00\uaf34\uc740 \ub0b4\uc7a5\uc744 \ud5c8\uc6a9\ud558\uc9c0 \uc54a\uc544 \uac74\ub108\ub6f0\uc5c8\uc2b5\ub2c8\ub2e4.',
  },
};

function fill(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (a, k) => (vars[k] == null ? a : String(vars[k]))); }
function warning(code, vars = {}) { return { code, message: { en: fill(STR.en[code], vars), ko: fill(STR.ko[code], vars) } }; }

// ---------------------------------------------------------------------------
// Font discovery

const fontCache = new Map();

function readFont(file, face = 0) {
  const st = fs.statSync(file);
  const key = `${path.resolve(file)}|${face}|${st.mtimeMs}|${st.size}`;
  if (!fontCache.has(key)) {
    if (fontCache.size > 8) fontCache.clear();
    fontCache.set(key, new TrueTypeFont(fs.readFileSync(file), face));
  }
  return fontCache.get(key);
}

function exists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

function walkFonts(dir, depth, out) {
  if (depth < 0) return;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of list) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walkFonts(p, depth - 1, out);
    else if (/\.(ttf|ttc|otf)$/i.test(d.name)) out.push(p);
  }
}

/** Bold sibling of a regular font file, if one is installed next to it. */
function boldSibling(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const tries = [];
  if (/^malgun\.ttf$/i.test(base)) tries.push('malgunbd.ttf');
  if (/^NanumGothic\.ttf$/i.test(base)) tries.push('NanumGothicBold.ttf');
  if (/-Regular\./i.test(base)) tries.push(base.replace(/-Regular\./i, '-Bold.'));
  if (/Regular/i.test(base)) tries.push(base.replace(/Regular/i, 'Bold'));
  tries.push(base.replace(/(\.[^.]+)$/, 'bd$1'), base.replace(/(\.[^.]+)$/, '-Bold$1'), base.replace(/(\.[^.]+)$/, 'Bold$1'));
  for (const t of tries) { const p = path.join(dir, t); if (t !== base && exists(p)) return p; }
  return null;
}

/** Candidate font files, in lookup order: [{file, face, bold?, explicit?}]. */
function fontCandidates(opts = {}) {
  const out = [];
  if (opts.fontPath) out.push({ file: String(opts.fontPath), face: opts.fontFace || 0, bold: opts.boldFontPath || null, explicit: true });
  if (opts.searchSystemFonts === false) return out;
  const win = process.env.WINDIR || process.env.SystemRoot || 'C:/Windows';
  for (const f of [...new Set([path.join(win, 'Fonts', 'malgun.ttf'), 'C:/Windows/Fonts/malgun.ttf'])]) out.push({ file: f, face: 0 });
  out.push({ file: '/System/Library/Fonts/AppleSDGothicNeo.ttc', face: 0, ttcBold: true });
  out.push({ file: '/System/Library/Fonts/Supplemental/AppleGothic.ttf', face: 0 });
  const home = process.env.HOME || '';
  for (const f of ['/Library/Fonts/NanumGothic.ttf', home && path.join(home, 'Library/Fonts/NanumGothic.ttf')].filter(Boolean)) out.push({ file: f, face: 0 });
  if (process.platform !== 'win32' || opts.searchLinuxFonts) {
    const found = [];
    for (const d of ['/usr/share/fonts', '/usr/local/share/fonts', home && path.join(home, '.fonts'), home && path.join(home, '.local/share/fonts')].filter(Boolean)) walkFonts(d, 6, found);
    const regular = (p) => !/bold|black|heavy|light|thin|medium|extra/i.test(path.basename(p));
    const noto = found.filter((p) => /Noto.*CJK/i.test(path.basename(p)) && regular(p)).sort();
    const nanum = found.filter((p) => /^NanumGothic.*\.ttf$/i.test(path.basename(p)) && regular(p)).sort();
    for (const f of [...noto, ...nanum]) out.push({ file: f, face: 0 });
  }
  return out;
}

/**
 * Find a usable TrueType font. Returns { regular, bold, file, warnings } where regular / bold are
 * TrueTypeFont objects (bold may be null) or regular = null for the Helvetica fallback.
 */
function resolveFonts(opts = {}) {
  const warnings = [];
  for (const c of fontCandidates(opts)) {
    if (!exists(c.file)) { if (c.explicit) warnings.push(warning('missing', { f: c.file })); continue; }
    let regular;
    try { regular = readFont(c.file, c.face); } catch (e) {
      warnings.push(e.code === 'CFF_UNSUPPORTED' ? warning('cff', { f: c.file }) : warning('bad', { f: c.file, e: e.message }));
      continue;
    }
    if (!regular.embeddable) { warnings.push(warning('restricted', { f: c.file })); continue; }
    if (!regular.glyphId(0xac00) && !c.explicit) continue; // not a Korean font
    let bold = null;
    const tryBold = (file, face = 0) => {
      try { const b = readFont(file, face); if (b.embeddable && b !== regular) bold = b; } catch { /* regular is enough */ }
    };
    if (c.bold && exists(c.bold)) tryBold(c.bold);
    else if (c.ttcBold && regular.faceCount > 1) {
      for (let i = 0; i < regular.faceCount && !bold; i++) {
        try { const f = readFont(c.file, i); if (/^bold$/i.test(f.subfamilyName)) tryBold(c.file, i); } catch { /* skip face */ }
      }
    } else { const sib = boldSibling(c.file); if (sib) tryBold(sib); }
    return { regular, bold, file: c.file, warnings };
  }
  warnings.push(warning('fallback'));
  return { regular: null, bold: null, file: null, warnings };
}

// ---------------------------------------------------------------------------
// Font objects used by the layout

const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELV_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// WinAnsiEncoding bytes 0x80-0x9F that are not Latin-1.
const WIN_ANSI = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
const WIN_W = { 0x80: 556, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000 };

class StdFont {
  constructor(base, widths, res) { this.base = base; this.widths = widths; this.res = res; this.replaced = 0; }
  code(cp) {
    if (cp >= 32 && cp <= 126) return cp;
    if (cp >= 0xa0 && cp <= 0xff) return cp;
    if (WIN_ANSI[cp]) return WIN_ANSI[cp];
    if (cp === 0x2212) return 45; // minus sign -> hyphen
    if (cp === 0x2264 || cp === 0x2265) return null;
    return null;
  }
  charWidth(cp) {
    const c = this.code(cp);
    if (c == null) return 556; // '?'
    if (c <= 126) return this.widths[c - 32];
    return WIN_W[c] || (c === 0xa0 ? 278 : c === 0xb7 ? 278 : 556);
  }
  width(str, size) { let w = 0; for (const ch of str) w += this.charWidth(ch.codePointAt(0)); return (w * size) / 1000; }
  encode(str) {
    let out = '(';
    for (const ch of str) {
      let c = this.code(ch.codePointAt(0));
      if (c == null) {
        // Readable stand-ins before giving up.
        const alt = { 0x2264: '<=', 0x2265: '>=', 0x2192: '->', 0x2190: '<-', 0x2713: 'v', 0x00d7: 'x' }[ch.codePointAt(0)];
        if (alt) { out += alt.replace(/[()\\]/g, (m) => `\\${m}`); continue; }
        this.replaced++; c = 63;
      }
      if (c === 40 || c === 41 || c === 92) out += `\\${String.fromCharCode(c)}`;
      else if (c < 32 || c > 126) out += `\\${c.toString(8).padStart(3, '0')}`;
      else out += String.fromCharCode(c);
    }
    return `${out})`;
  }
}

class CidFont {
  constructor(ttf, res) {
    this.ttf = ttf;
    this.res = res;
    this.scale = 1000 / ttf.unitsPerEm;
    this.order = [0]; // new gid -> old gid
    this.newId = new Map([[0, 0]]); // old gid -> new gid
    this.unicode = new Map(); // old gid -> code point
    this.space = ttf.glyphId(32);
  }
  gid(cp) {
    let g = this.ttf.glyphId(cp);
    if (!g && (cp === 0xa0 || cp === 0x3000 || cp === 9)) g = this.space;
    return g;
  }
  charWidth(cp) { return this.ttf.advance(this.gid(cp)) * this.scale; }
  width(str, size) { let w = 0; for (const ch of str) w += this.charWidth(ch.codePointAt(0)); return (w * size) / 1000; }
  encode(str) {
    let hex = '';
    for (const ch of str) {
      const cp = ch.codePointAt(0);
      const old = this.gid(cp);
      let id = this.newId.get(old);
      if (id == null) { id = this.order.length; this.order.push(old); this.newId.set(old, id); }
      if (old && !this.unicode.has(old)) this.unicode.set(old, cp);
      hex += id.toString(16).padStart(4, '0');
    }
    return `<${hex.toUpperCase()}>`;
  }
}

// ---------------------------------------------------------------------------
// Helpers

function num(v) {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

function rgb(color) {
  const c = M.normColor(color) || '#000000';
  return [1, 3, 5].map((i) => num(parseInt(c.slice(i, i + 2), 16) / 255)).join(' ');
}

function pdfTextString(s) {
  const str = String(s == null ? '' : s);
  const buf = Buffer.from(str, 'utf16le');
  for (let i = 0; i + 1 < buf.length; i += 2) { const t = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = t; }
  return `<FEFF${buf.toString('hex').toUpperCase()}>`;
}

function cleanText(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b\ufeff]/g, '');
}

function isBreakableWide(cp) {
  // CJK ideographs, kana and full-width forms break between any two characters;
  // Hangul follows word spacing like Latin text (and breaks inside a word only when it must).
  return (cp >= 0x2e80 && cp <= 0x303f) || (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xffef) || (cp >= 0x20000 && cp <= 0x3fffd);
}

/** Split a paragraph into unbreakable tokens: words, single spaces, single CJK ideographs. */
function tokenize(s) {
  const out = [];
  let cur = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === ' ') { if (cur) out.push(cur); cur = ''; out.push(' '); continue; }
    if (isBreakableWide(cp)) { if (cur) out.push(cur); cur = ''; out.push(ch); continue; }
    cur += ch;
    if (ch === '-' || ch === '/' || ch === '\\' || ch === '_' || ch === ',' || ch === ';' || ch === '.' && cur.length > 12) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

/** Wrap text into lines no wider than maxW (points). */
function wrap(text, font, size, maxW) {
  const lines = [];
  for (const para of cleanText(text).split('\n')) {
    let line = '';
    let lineW = 0;
    const push = () => { lines.push(line.replace(/ +$/, '')); line = ''; lineW = 0; };
    for (const tok of tokenize(para)) {
      const w = font.width(tok, size);
      if (lineW + w <= maxW + 0.01) { if (tok === ' ' && !line) continue; line += tok; lineW += w; continue; }
      if (tok === ' ') { push(); continue; }
      if (line) push();
      if (w <= maxW) { line = tok; lineW = w; continue; }
      // Token wider than the line: break it by characters.
      for (const ch of tok) {
        const cw = font.width(ch, size);
        if (lineW + cw > maxW + 0.01 && line) push();
        line += ch; lineW += cw;
      }
    }
    lines.push(line.replace(/ +$/, ''));
  }
  return lines.length ? lines : [''];
}

// ---------------------------------------------------------------------------
// Layout

class Layout {
  constructor(fonts, opts) {
    this.fonts = fonts; // { regular, bold, fakeBold }
    this.opts = opts;
    this.pages = [];
    this.outline = [];
    this.newPage();
  }

  get top() { return PAGE.h - MARGIN.top; }

  newPage() {
    this.page = { ops: [] };
    this.pages.push(this.page);
    this.y = this.top;
  }

  room() { return this.y - MARGIN.bottom; }

  ensure(h) { if (this.room() < h && this.y < this.top - 0.5) { this.newPage(); return true; } return false; }

  font(bold) { return bold ? this.fonts.bold : this.fonts.regular; }

  text(str, x, base, size, { bold = false, color = COLORS.text } = {}) {
    if (!str) return;
    const f = this.font(bold);
    const fake = bold && this.fonts.fakeBold;
    const c = rgb(color);
    this.page.ops.push(`BT ${c} rg${fake ? ` ${c} RG 2 Tr ${num(size * 0.035)} w` : ''} /${f.res} ${num(size)} Tf ${num(x)} ${num(base)} Td ${f.encode(str)} Tj ET`);
  }

  rect(x, y, w, h, { fill, stroke, lw = 0.5 } = {}) {
    if (fill) this.page.ops.push(`${rgb(fill)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
    if (stroke) this.page.ops.push(`${rgb(stroke)} RG ${num(lw)} w ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`);
  }

  line(x1, y1, x2, y2, color, lw = 0.5) { this.page.ops.push(`${rgb(color)} RG ${num(lw)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`); }

  /** Baseline of line i inside a box whose top is `top`. */
  static base(top, i, size, lh) { return top - i * lh - lh / 2 - size * 0.33; }

  lines(lines, x, width, size, lh, { bold, color, align = 'left' } = {}) {
    const f = this.font(bold);
    for (const ln of lines) {
      if (this.room() < lh) this.newPage();
      let dx = 0;
      if (align !== 'left') { const w = f.width(ln, size); dx = align === 'right' ? width - w : (width - w) / 2; }
      this.text(ln, x + dx, Layout.base(this.y, 0, size, lh), size, { bold, color });
      this.y -= lh;
    }
  }

  // --- blocks

  title(m) {
    if (m.title) {
      const size = 20;
      const ls = wrap(m.title, this.font(true), size, CONTENT_W);
      this.lines(ls, MARGIN.left, CONTENT_W, size, size * 1.3, { bold: true });
      this.outline.push({ title: m.title, page: this.pages.length - 1, y: this.top, level: 0 });
    }
    if (m.subtitle) { this.y -= 2; this.lines(wrap(m.subtitle, this.font(false), 12, CONTENT_W), MARGIN.left, CONTENT_W, 12, 16, { color: COLORS.muted }); }
    if (m.meta.length) {
      this.y -= 4;
      const text = m.meta.map(([k, v]) => (k ? `${k}: ${v}` : v)).join('   \u00b7   ');
      this.lines(wrap(text, this.font(false), 8.5, CONTENT_W), MARGIN.left, CONTENT_W, 8.5, 12, { color: COLORS.muted });
    }
    if (m.title || m.subtitle || m.meta.length) this.y -= 10;
  }

  heading(b) {
    const spec = { h1: { size: 16, before: 14, after: 6 }, h2: { size: 13, before: 14, after: 6 }, h3: { size: 11, before: 10, after: 4 } }[b.type];
    const lh = spec.size * 1.3;
    const ls = wrap(b.text, this.font(true), spec.size, CONTENT_W);
    const need = spec.before + ls.length * lh + spec.after + 40; // keep with the next ~3 lines
    if (!this.ensure(need) && this.y < this.top - 0.5) this.y -= spec.before;
    this.outline.push({ title: b.text, page: this.pages.length - 1, y: Math.min(this.top, this.y + 4), level: b.type === 'h3' ? 2 : b.type === 'h2' ? 1 : 0 });
    this.lines(ls, MARGIN.left, CONTENT_W, spec.size, lh, { bold: true });
    if (b.type === 'h2') { this.y -= 2; this.line(MARGIN.left, this.y, MARGIN.left + CONTENT_W, this.y, COLORS.rule, 1.5); }
    this.y -= spec.after;
  }

  paragraph(b) {
    const size = b.small ? 8 : 9.5;
    const lh = size * 1.45;
    this.lines(wrap(b.text, this.font(false), size, CONTENT_W), MARGIN.left, CONTENT_W, size, lh, { color: b.small ? COLORS.muted : COLORS.text });
    this.y -= 5;
  }

  list(b) {
    const size = 9.5;
    const lh = size * 1.45;
    const indent = 14;
    for (const it of b.items) {
      const ls = wrap(it, this.font(false), size, CONTENT_W - indent);
      if (this.room() < lh) this.newPage();
      this.text('\u2022', MARGIN.left + 3, Layout.base(this.y, 0, size, lh), size);
      this.lines(ls, MARGIN.left + indent, CONTENT_W - indent, size, lh);
      this.y -= 1.5;
    }
    this.y -= 4;
  }

  badge(b) {
    const size = 11;
    const padX = 9;
    const maxW = CONTENT_W - padX * 2;
    const ls = wrap(b.text, this.font(true), size, maxW);
    const lh = size * 1.35;
    const h = ls.length * lh + 10;
    const w = Math.min(CONTENT_W, Math.max(...ls.map((l) => this.font(true).width(l, size))) + padX * 2);
    this.ensure(h + 4);
    this.y -= 4;
    this.rect(MARGIN.left, this.y - h, w, h, { fill: b.color || '#546e7a' });
    ls.forEach((l, i) => this.text(l, MARGIN.left + padX, Layout.base(this.y - 5, i, size, lh), size, { bold: true, color: '#ffffff' }));
    this.y -= h + 8;
  }

  columnWidths(block, size, padX, n, bold) {
    if (Array.isArray(block.widths) && block.widths.length >= n && block.widths.slice(0, n).every((v) => Number(v) > 0)) {
      const tot = block.widths.slice(0, n).reduce((a, v) => a + Number(v), 0);
      return block.widths.slice(0, n).map((v) => (Number(v) / tot) * CONTENT_W);
    }
    const natural = new Array(n).fill(0);
    const minimum = new Array(n).fill(0);
    const cap = CONTENT_W * 0.6;
    const measure = (text, c, isBold) => {
      const f = this.font(isBold);
      for (const ln of cleanText(text).split('\n')) {
        natural[c] = Math.max(natural[c], Math.min(cap, f.width(ln, size)));
        for (const tok of tokenize(ln)) if (tok !== ' ') minimum[c] = Math.max(minimum[c], Math.min(CONTENT_W / n, f.width(tok, size)));
      }
    };
    (block.columns || []).forEach((h, c) => { if (c < n) measure(M.cellText(h), c, bold.header); });
    const rows = block.rows || [];
    const step = rows.length > 2000 ? Math.ceil(rows.length / 2000) : 1; // sample very large tables
    for (let r = 0; r < rows.length; r += step) for (let c = 0; c < n; c++) measure(M.cellText(rows[r][c]), c, bold.firstCol && c === 0);
    const nat = natural.map((v) => Math.max(v, size * 1.5) + padX * 2 + 0.5);
    const min = minimum.map((v, c) => Math.min(nat[c], Math.max(v, size * 1.5) + padX * 2 + 0.5));
    const sumN = nat.reduce((a, v) => a + v, 0);
    if (sumN <= CONTENT_W) return nat.map((v) => v + ((CONTENT_W - sumN) * v) / sumN);
    const sumM = min.reduce((a, v) => a + v, 0);
    if (sumM >= CONTENT_W) return min.map((v) => (v / sumM) * CONTENT_W);
    const flex = nat.map((v, c) => v - min[c]);
    const sumF = flex.reduce((a, v) => a + v, 0) || 1;
    return min.map((v, c) => v + ((CONTENT_W - sumM) * flex[c]) / sumF);
  }

  table(block, { kv = false } = {}) {
    const size = kv ? 9 : 8;
    const lh = size * 1.32;
    const padX = 4;
    const padY = 3;
    const n = kv ? 2 : M.tableWidth(block);
    const hasHead = !kv && (block.columns || []).some((c) => c !== '');
    const align = kv ? ['left', 'left'] : M.columnAlign(block);
    const widths = kv ? [CONTENT_W * 0.35, CONTENT_W * 0.65] : this.columnWidths(block, size, padX, n, { header: true });
    const wrapRow = (cells, isHead) => cells.map((v, c) => wrap(M.cellText(v), this.font(isHead || (kv && c === 0)), size, Math.max(4, widths[c] - padX * 2)));
    const head = hasHead ? wrapRow(Array.from({ length: n }, (_, c) => block.columns[c] || ''), true) : null;
    const headH = head ? Math.max(...head.map((l) => l.length)) * lh + padY * 2 : 0;
    let rows = (block.rows || []).map((r) => (kv ? [r[0], r[1]] : Array.from({ length: n }, (_, c) => (r[c] == null ? '' : r[c]))));
    if (!rows.length && hasHead) rows = [Array.from({ length: n }, (_, c) => (c ? '' : '\u2014'))];

    const drawRow = (cellLines, from, to, { header = false } = {}) => {
      const h = (to - from) * lh + padY * 2;
      let x = MARGIN.left;
      for (let c = 0; c < n; c++) {
        const w = widths[c];
        const shaded = header ? COLORS.head : kv && c === 0 ? COLORS.key : null;
        if (shaded) this.rect(x, this.y - h, w, h, { fill: shaded });
        const isBold = header || (kv && c === 0);
        const f = this.font(isBold);
        const ls = cellLines[c] || [];
        for (let i = from; i < Math.min(to, ls.length); i++) {
          const t = ls[i];
          let dx = padX;
          if (align[c] === 'right') dx = w - padX - f.width(t, size);
          else if (align[c] === 'center') dx = (w - f.width(t, size)) / 2;
          this.text(t, x + dx, Layout.base(this.y - padY, i - from, size, lh), size, { bold: isBold });
        }
        this.rect(x, this.y - h, w, h, { stroke: COLORS.line, lw: 0.5 });
        x += w;
      }
      this.y -= h;
    };
    const drawHead = () => { if (head) drawRow(head, 0, Math.max(...head.map((l) => l.length)), { header: true }); };

    const first = rows.length ? Math.max(...wrapRow(rows[0], false).map((l) => l.length)) : 0;
    this.ensure(headH + Math.min(first, 3) * lh + padY * 2 + 2);
    if (block.caption) {
      const ls = wrap(block.caption, this.font(true), 9, CONTENT_W);
      this.ensure(ls.length * 12 + headH + lh + padY * 2);
      this.lines(ls, MARGIN.left, CONTENT_W, 9, 12, { bold: true });
      this.y -= 2;
    }
    drawHead();
    const pageLines = Math.floor((this.top - MARGIN.bottom - headH - padY * 2) / lh);
    for (const r of rows) {
      const cells = wrapRow(r, false);
      const total = Math.max(1, ...cells.map((l) => l.length));
      let start = 0;
      for (let guard = 0; start < total && guard < 10000; guard++) {
        const fit = Math.floor((this.room() - padY * 2) / lh);
        const left = total - start;
        if (fit >= left) { drawRow(cells, start, total); start = total; break; }
        if (left <= pageLines || fit < 2) { this.newPage(); drawHead(); continue; }
        drawRow(cells, start, start + fit);
        start += fit;
        this.newPage();
        drawHead();
      }
    }
    this.y -= 10;
  }

  // A picture at 96 dpi (0.75 pt per pixel), shrunk to the text width.
  image(b) {
    const scale = Math.min(0.75, CONTENT_W / b.width);
    const w = b.width * scale;
    const h = b.height * scale;
    this.ensure(Math.min(h, this.top - MARGIN.bottom) + 8);
    if (!this.images) this.images = [];
    const index = this.images.push(b) - 1;
    this.page.images = [...(this.page.images || []), index];
    this.page.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(MARGIN.left)} ${num(this.y - h)} cm /Im${index} Do Q`);
    this.y -= h + 10;
  }

  block(b) {
    switch (b.type) {
      case 'h1': case 'h2': case 'h3': this.heading(b); break;
      case 'p': this.paragraph(b); break;
      case 'list': this.list(b); break;
      case 'badge': this.badge(b); break;
      case 'kv': if (b.rows.length) this.table(b, { kv: true }); break;
      case 'table': this.table(b); break;
      case 'pagebreak': if (this.y < this.top - 0.5) this.newPage(); break;
      case 'image': this.image(b); break;
      default: break;
    }
  }

  decorate(title, lang) {
    const N = this.pages.length;
    this.pages.forEach((p, i) => {
      this.page = p;
      if (i > 0 && title) {
        const size = 8;
        const f = this.font(false);
        let t = cleanText(title).replace(/\n/g, ' ');
        while (t.length > 1 && f.width(t, size) > CONTENT_W) t = t.slice(0, -2) + '\u2026';
        this.text(t, MARGIN.left, PAGE.h - 34, size, { color: COLORS.muted });
        this.line(MARGIN.left, PAGE.h - 40, MARGIN.left + CONTENT_W, PAGE.h - 40, COLORS.rule, 0.5);
      }
      const label = fill(STR[lang].page, { n: i + 1, N });
      const size = 8;
      const w = this.font(false).width(label, size);
      this.text(label, (PAGE.w - w) / 2, 28, size, { color: COLORS.muted });
    });
  }
}

// ---------------------------------------------------------------------------
// PDF objects

class Writer {
  constructor() { this.objs = [null]; }
  alloc() { this.objs.push(null); return this.objs.length - 1; }
  set(id, dict, stream) {
    if (stream == null) this.objs[id] = Buffer.from(`${id} 0 obj\n${dict}\nendobj\n`, 'latin1');
    else {
      const body = Buffer.isBuffer(stream) ? stream : Buffer.from(stream, 'latin1');
      this.objs[id] = Buffer.concat([Buffer.from(`${id} 0 obj\n<< ${dict} /Length ${body.length} >>\nstream\n`, 'latin1'), body, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    }
  }
  add(dict, stream) { const id = this.alloc(); this.set(id, dict, stream); return id; }
  toBuffer(root, info) {
    const head = Buffer.from('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n', 'latin1');
    const parts = [head];
    const offsets = [0];
    let pos = head.length;
    for (let i = 1; i < this.objs.length; i++) {
      if (!this.objs[i]) this.set(i, 'null');
      offsets.push(pos);
      parts.push(this.objs[i]);
      pos += this.objs[i].length;
    }
    const size = this.objs.length;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let i = 1; i < size; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    const hash = crypto.createHash('md5').update(Buffer.concat(parts)).digest('hex').toUpperCase();
    xref += `trailer\n<< /Size ${size} /Root ${root} 0 R /Info ${info} 0 R /ID [<${hash}> <${hash}>] >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(parts);
  }
}

// RGB pixels of an 8-bit RGB, non-interlaced PNG (what chart.js writes).
function pngPixels(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const parts = [];
  for (let p = 8; p < png.length;) {
    const len = png.readUInt32BE(p);
    const type = png.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') parts.push(png.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const out = Buffer.alloc(width * height * 3);
  const stride = width * 3;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? line[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      let add = 0;
      if (f === 1) add = a; else if (f === 2) add = b; else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c); add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = (line[i] + add) & 255;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return out;
}

function stream(content, compress) {
  const raw = Buffer.from(content, 'latin1');
  if (!compress) return { dict: '', data: raw };
  return { dict: '/Filter /FlateDecode', data: zlib.deflateSync(raw) };
}

function subsetTag(font) {
  const h = crypto.createHash('md5').update(font.order.join(',')).update(font.ttf.postscriptName).digest();
  let tag = '';
  for (let i = 0; i < 6; i++) tag += String.fromCharCode(65 + (h[i] % 26));
  return tag;
}

function toUnicodeCMap(font) {
  const entries = [];
  font.order.forEach((old, id) => {
    const cp = font.unicode.get(old);
    if (id === 0 || cp == null) return;
    const s = String.fromCodePoint(cp);
    let hex = '';
    for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
    entries.push(`<${id.toString(16).padStart(4, '0').toUpperCase()}> <${hex.toUpperCase()}>`);
  });
  let body = '';
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    body += `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar\n`;
  }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${body}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
}

function writeCidFont(w, font, compress) {
  const ttf = font.ttf;
  const sc = font.scale;
  // Code points per old gid, for the subset cmap.
  const program = ttf.subset(font.order, font.unicode); // may append composite components to font.order
  const tag = subsetTag(font);
  const name = `${tag}+${ttf.postscriptName}`;
  const fileStream = compress ? zlib.deflateSync(program) : program;
  const fileId = w.add(`${compress ? '/Filter /FlateDecode ' : ''}/Length1 ${program.length}`, fileStream);
  const flags = 4 | (ttf.isFixedPitch ? 1 : 0) | (ttf.italicAngle ? 64 : 0);
  const bbox = ttf.bbox.map((v) => Math.round(v * sc)).join(' ');
  const ascent = Math.round((ttf.typoAscender || ttf.ascender) * sc);
  const descent = Math.round((ttf.typoDescender || ttf.descender) * sc);
  const stemV = Math.round(50 + ((ttf.weight || 400) / 65) ** 2);
  const descId = w.add(`<< /Type /FontDescriptor /FontName /${name} /Flags ${flags} /FontBBox [${bbox}] /ItalicAngle ${num(ttf.italicAngle)} /Ascent ${ascent} /Descent ${descent} /CapHeight ${Math.round(ttf.capHeight * sc)} /StemV ${stemV} /FontFile2 ${fileId} 0 R >>`);
  // /W: runs of consecutive CIDs.
  const widths = font.order.map((old) => Math.round(ttf.advance(old) * sc));
  let W = '';
  for (let i = 0; i < widths.length;) {
    let j = i;
    const run = [];
    while (j < widths.length && run.length < 500) { run.push(widths[j]); j++; }
    W += `${i} [${run.join(' ')}] `;
    i = j;
  }
  const cidId = w.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /DW 1000 /W [${W.trim()}] /CIDToGIDMap /Identity >>`);
  const cm = stream(toUnicodeCMap(font), compress);
  const tuId = w.add(cm.dict, cm.data);
  return w.add(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${tuId} 0 R >>`);
}

/**
 * Render a document model to a PDF.
 * @param {object} model see model.js
 * @param {{lang?:'en'|'ko', fontPath?:string, boldFontPath?:string, fontFace?:number, searchSystemFonts?:boolean,
 *          compress?:boolean, creator?:string, date?:Date}} [opts]
 * @returns {{buffer:Buffer, warnings:{code:string, message:{en:string, ko:string}}[], font:string|null, pages:number}}
 */
function renderPdf(model, opts = {}) {
  const m = M.normalize(model);
  const lang = M.detectLang(m, opts);
  const compress = opts.compress !== false;
  const found = resolveFonts(opts);
  const warnings = found.warnings.slice();
  let fonts;
  if (found.regular) {
    const regular = new CidFont(found.regular, 'F1');
    const bold = found.bold ? new CidFont(found.bold, 'F2') : regular;
    fonts = { regular, bold, fakeBold: !found.bold, kind: 'cid' };
  } else {
    fonts = { regular: new StdFont('Helvetica', HELV, 'F1'), bold: new StdFont('Helvetica-Bold', HELV_B, 'F2'), fakeBold: false, kind: 'std' };
  }

  const L = new Layout(fonts, opts);
  L.title(m);
  for (const b of m.blocks) L.block(b);
  L.decorate(m.title, lang);

  const w = new Writer();
  const catalogId = w.alloc();
  const pagesId = w.alloc();
  const infoId = w.alloc();
  const used = fonts.regular === fonts.bold ? [fonts.regular] : [fonts.regular, fonts.bold];
  const fontRefs = used.map((f) => {
    if (f instanceof CidFont) return `/${f.res} ${writeCidFont(w, f, compress)} 0 R`;
    return `/${f.res} ${w.add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>`)} 0 R`;
  });
  if (fonts.kind === 'std' && (fonts.regular.replaced || fonts.bold.replaced)) warnings.push(warning('replaced'));
  // Pictures: raw RGB, deflated (the chart module keeps the pixels next to the PNG).
  const imageIds = (L.images || []).map((img) => {
    const rgb = img.rgb || pngPixels(img.png);
    return w.add(`/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, zlib.deflateSync(rgb));
  });
  const pageIds = [];
  for (const p of L.pages) {
    const s = stream(`${p.ops.join('\n')}\n`, compress);
    const contentId = w.add(s.dict, s.data);
    const xobj = (p.images || []).length ? ` /XObject << ${p.images.map((i) => `/Im${i} ${imageIds[i]} 0 R`).join(' ')} >>` : '';
    const pid = w.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(PAGE.w)} ${num(PAGE.h)}] /Resources << /Font << ${fontRefs.join(' ')} >>${xobj} /ProcSet [/PDF /Text${xobj ? ' /ImageC' : ''}] >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pid);
  }
  w.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

  // Bookmarks: h1 / h2 / h3 nested by level under the document title, all open.
  let outlinesRef = '';
  const items = L.outline.filter((o) => o.title);
  if (items.length) {
    const outlinesId = w.alloc();
    const nodes = items.map((o) => ({ ...o, id: w.alloc(), kids: [], parent: null }));
    const rootKids = [];
    const stack = [];
    for (const nd of nodes) {
      while (stack.length && stack[stack.length - 1].level >= nd.level) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) { nd.parent = parent; parent.kids.push(nd); } else rootKids.push(nd);
      stack.push(nd);
    }
    const count = (nd) => nd.kids.reduce((a, k) => a + 1 + count(k), 0);
    const emit = (list, parentId) => list.forEach((nd, i) => {
      const parts = [`/Title ${pdfTextString(nd.title)}`, `/Parent ${parentId} 0 R`, `/Dest [${pageIds[nd.page]} 0 R /XYZ 0 ${num(nd.y)} 0]`];
      if (i > 0) parts.push(`/Prev ${list[i - 1].id} 0 R`);
      if (i < list.length - 1) parts.push(`/Next ${list[i + 1].id} 0 R`);
      if (nd.kids.length) parts.push(`/First ${nd.kids[0].id} 0 R /Last ${nd.kids[nd.kids.length - 1].id} 0 R /Count ${count(nd)}`);
      w.set(nd.id, `<< ${parts.join(' ')} >>`);
      emit(nd.kids, nd.id);
    });
    emit(rootKids, outlinesId);
    w.set(outlinesId, `<< /Type /Outlines /First ${rootKids[0].id} 0 R /Last ${rootKids[rootKids.length - 1].id} 0 R /Count ${nodes.length} >>`);
    outlinesRef = ` /Outlines ${outlinesId} 0 R /PageMode /UseOutlines`;
  }
  w.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${outlinesRef} /Lang ${pdfTextString(lang === 'ko' ? 'ko-KR' : 'en-US')} /ViewerPreferences << /DisplayDocTitle true >> >>`);
  const d = opts.date instanceof Date && !Number.isNaN(opts.date.getTime()) ? opts.date : new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const stamp = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const creator = opts.creator || 'MyCodeChecker';
  w.set(infoId, `<< /Title ${pdfTextString(m.title)}${m.subtitle ? ` /Subject ${pdfTextString(m.subtitle)}` : ''} /Author ${pdfTextString(creator)} /Creator ${pdfTextString(creator)} /Producer ${pdfTextString('MyCodeChecker PDF writer')} /CreationDate (${stamp}) /ModDate (${stamp}) >>`);
  return { buffer: w.toBuffer(catalogId, infoId), warnings, font: found.file, pages: pageIds.length };
}

/** Render to a PDF Buffer (warnings are dropped; use renderPdf to see them). */
function toPdf(model, opts = {}) {
  const r = renderPdf(model, opts);
  if (typeof opts.onWarning === 'function') for (const wn of r.warnings) opts.onWarning(wn);
  return r.buffer;
}

module.exports = { toPdf, renderPdf, resolveFonts, fontCandidates, wrap, tokenize, MIME: 'application/pdf', PAGE };

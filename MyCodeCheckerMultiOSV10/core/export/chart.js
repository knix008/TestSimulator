'use strict';

// Report charts as PNG images, zero dependencies: an RGB canvas with
// anti-aliased rectangles and text (TrueType outlines from the system font
// that PDF export uses, so Korean labels render), bar charts and rating
// tiles, and a PNG encoder (zlib). Used by the Word, Excel, PDF, PowerPoint
// and Markdown writers, which embed the same pictures.
//
//   reportCharts(analysis, { lang })  -> [{ id, title, alt, width, height, png, rgb }]
//   barChart({ title, items: [{ label, value, color }] }, opts) -> { width, height, png, rgb }

const zlib = require('zlib');

// ---------------------------------------------------------------------------
// Canvas

class Canvas {
  constructor(width, height, bg = '#ffffff') {
    this.width = width;
    this.height = height;
    this.rgb = Buffer.alloc(width * height * 3);
    const [r, g, b] = parseColor(bg);
    for (let i = 0; i < width * height; i++) { this.rgb[i * 3] = r; this.rgb[i * 3 + 1] = g; this.rgb[i * 3 + 2] = b; }
  }

  blend(x, y, color, alpha) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const a = Math.min(1, alpha);
    const i = (y * this.width + x) * 3;
    this.rgb[i] = Math.round(this.rgb[i] + (color[0] - this.rgb[i]) * a);
    this.rgb[i + 1] = Math.round(this.rgb[i + 1] + (color[1] - this.rgb[i + 1]) * a);
    this.rgb[i + 2] = Math.round(this.rgb[i + 2] + (color[2] - this.rgb[i + 2]) * a);
  }

  fillRect(x, y, w, h, color) {
    const c = parseColor(color);
    const x0 = Math.max(0, Math.floor(x));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y0 = Math.max(0, Math.floor(y));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      const cy = Math.min(py + 1, y + h) - Math.max(py, y);
      for (let px = x0; px < x1; px++) {
        const cx = Math.min(px + 1, x + w) - Math.max(px, x);
        this.blend(px, py, c, cx * cy);
      }
    }
  }

  /** Fill closed polygons (arrays of [x, y]) with the nonzero rule, anti-aliased. */
  fillPaths(paths, color) {
    const c = parseColor(color);
    const edges = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pts of paths) {
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if (y0 === y1) continue;
        edges.push(y0 < y1 ? { x0, y0, x1, y1, dir: 1 } : { x0: x1, y0: y1, x1: x0, y1: y0, dir: -1 });
        minY = Math.min(minY, y0, y1);
        maxY = Math.max(maxY, y0, y1);
      }
    }
    if (!edges.length) return;
    const SUB = 4;
    const top = Math.max(0, Math.floor(minY));
    const bottom = Math.min(this.height, Math.ceil(maxY));
    const cover = new Float32Array(this.width);
    for (let py = top; py < bottom; py++) {
      cover.fill(0);
      let any = false;
      for (let s = 0; s < SUB; s++) {
        const sy = py + (s + 0.5) / SUB;
        const xs = [];
        for (const e of edges) {
          if (sy < e.y0 || sy >= e.y1) continue;
          xs.push({ x: e.x0 + ((sy - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), dir: e.dir });
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a.x - b.x);
        let wind = 0;
        for (let k = 0; k < xs.length - 1; k++) {
          wind += xs[k].dir;
          if (!wind) continue;
          const a = Math.max(0, xs[k].x);
          const b = Math.min(this.width, xs[k + 1].x);
          if (b <= a) continue;
          any = true;
          const ia = Math.floor(a);
          const ib = Math.floor(b);
          if (ia === ib) { cover[ia] += (b - a) / SUB; continue; }
          cover[ia] += (ia + 1 - a) / SUB;
          for (let px = ia + 1; px < ib && px < this.width; px++) cover[px] += 1 / SUB;
          if (ib < this.width) cover[ib] += (b - ib) / SUB;
        }
      }
      if (!any) continue;
      for (let px = 0; px < this.width; px++) if (cover[px] > 0) this.blend(px, py, c, cover[px]);
    }
  }

  png() { return encodePng(this.width, this.height, this.rgb); }
}

function parseColor(color) {
  if (Array.isArray(color)) return color;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color || '#000000'));
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// PNG

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 8-bit RGB pixels -> PNG file. */
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // 96 dpi, so documents place it at its natural size.
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(3780, 0);
  phys.writeUInt32BE(3780, 4);
  phys[8] = 1;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('pHYs', phys), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Text from TrueType outlines

let fontCache;
function chartFonts() {
  if (fontCache !== undefined) return fontCache;
  try {
    const { resolveFonts } = require('./pdf');
    const r = resolveFonts({});
    fontCache = r.regular ? { regular: r.regular, bold: r.bold || r.regular } : null;
  } catch {
    fontCache = null;
  }
  return fontCache;
}

/** Contours of a glyph in font units: [[{x, y, on}]] (composites resolved, translation only). */
function glyphContours(font, gid, depth = 0) {
  const [a, z] = font.glyphRange(gid);
  if (z - a < 10 || depth > 6) return [];
  const b = font.buf;
  const n = b.readInt16BE(a);
  if (n < 0) {
    const out = [];
    let p = a + 10;
    for (;;) {
      const flags = b.readUInt16BE(p);
      const child = b.readUInt16BE(p + 2);
      p += 4;
      let dx = 0;
      let dy = 0;
      if (flags & 1) { dx = b.readInt16BE(p); dy = b.readInt16BE(p + 2); p += 4; } else { dx = b.readInt8(p); dy = b.readInt8(p + 1); p += 2; }
      if (!(flags & 2)) { dx = 0; dy = 0; } // point-matched components: rare in CJK fonts
      if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
      for (const c of glyphContours(font, child, depth + 1)) out.push(c.map((pt) => ({ x: pt.x + dx, y: pt.y + dy, on: pt.on })));
      if (!(flags & 0x20)) break;
    }
    return out;
  }
  const ends = [];
  let p = a + 10;
  for (let i = 0; i < n; i++) { ends.push(b.readUInt16BE(p)); p += 2; }
  const count = n ? ends[n - 1] + 1 : 0;
  p += 2 + b.readUInt16BE(p);
  const flags = [];
  while (flags.length < count) {
    const f = b[p++];
    flags.push(f);
    if (f & 8) { let r = b[p++]; while (r-- > 0 && flags.length < count) flags.push(f); }
  }
  const xs = [];
  let v = 0;
  for (const f of flags) {
    if (f & 2) { const d = b[p++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += b.readInt16BE(p); p += 2; }
    xs.push(v);
  }
  const ys = [];
  v = 0;
  for (const f of flags) {
    if (f & 4) { const d = b[p++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += b.readInt16BE(p); p += 2; }
    ys.push(v);
  }
  const out = [];
  let start = 0;
  for (const end of ends) {
    const c = [];
    for (let i = start; i <= end; i++) c.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
    out.push(c);
    start = end + 1;
  }
  return out;
}

/** A contour with quadratic curves flattened to points, mapped by tf(x, y). */
function flatten(contour, tf) {
  const n = contour.length;
  if (n < 2) return [];
  // Start at an on-curve point (or the midpoint of two off-curve points).
  let first = contour.findIndex((p) => p.on);
  const pts = [];
  let startPt;
  if (first < 0) { startPt = { x: (contour[0].x + contour[1].x) / 2, y: (contour[0].y + contour[1].y) / 2, on: true }; first = 0; } else startPt = contour[first];
  pts.push(tf(startPt.x, startPt.y));
  let prev = startPt;
  let ctrl = null;
  for (let k = 1; k <= n; k++) {
    const p = contour[(first + k) % n];
    const target = k === n ? startPt : p;
    if (target.on || k === n) {
      if (ctrl) quad(prev, ctrl, target, tf, pts); else pts.push(tf(target.x, target.y));
      prev = target;
      ctrl = null;
      if (k === n) break;
    } else if (ctrl) {
      const mid = { x: (ctrl.x + p.x) / 2, y: (ctrl.y + p.y) / 2 };
      quad(prev, ctrl, mid, tf, pts);
      prev = mid;
      ctrl = p;
    } else ctrl = p;
  }
  return pts;
}

function quad(a, c, b, tf, pts) {
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push(tf(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y));
  }
}

function textWidth(text, size, bold) {
  const fonts = chartFonts();
  if (!fonts) return String(text).length * size * 0.55;
  const font = bold ? fonts.bold : fonts.regular;
  let w = 0;
  for (const ch of String(text)) w += font.advance(font.glyphId(ch.codePointAt(0)) || 0);
  return (w / font.unitsPerEm) * size;
}

/** Draw text with its baseline at y; align 'left' | 'right' | 'center'. Without a font, nothing is drawn. */
function drawText(cv, text, x, y, size, color, { bold = false, align = 'left' } = {}) {
  const fonts = chartFonts();
  if (!fonts || !text) return;
  const font = bold ? fonts.bold : fonts.regular;
  const scale = size / font.unitsPerEm;
  let pen = x - (align === 'right' ? textWidth(text, size, bold) : align === 'center' ? textWidth(text, size, bold) / 2 : 0);
  const paths = [];
  for (const ch of String(text)) {
    const gid = font.glyphId(ch.codePointAt(0)) || 0;
    const ox = pen;
    const tf = (gx, gy) => [ox + gx * scale, y - gy * scale];
    for (const c of glyphContours(font, gid)) {
      const pts = flatten(c, tf);
      if (pts.length > 2) paths.push(pts);
    }
    pen += font.advance(gid) * scale;
  }
  cv.fillPaths(paths, color);
}

/** Shorten text to a width with an ellipsis. */
function fit(text, size, maxW, bold) {
  let s = String(text);
  if (textWidth(s, size, bold) <= maxW) return s;
  while (s.length > 1 && textWidth(`${s}…`, size, bold) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

// ---------------------------------------------------------------------------
// Charts

const FG = '#1c2530';
const MUTED = '#5b6876';
const GRID = '#e3e8ee';

/** Horizontal bar chart: label | bar | value. */
function barChart({ title, items }, { width = 760, rowH = 30, labelW = 230 } = {}) {
  const list = (items || []).filter((it) => it && Number.isFinite(Number(it.value)));
  const head = title ? 44 : 12;
  const height = head + Math.max(1, list.length) * rowH + 14;
  const cv = new Canvas(width, height);
  if (title) drawText(cv, title, 16, 28, 17, FG, { bold: true });
  const max = Math.max(1, ...list.map((it) => Number(it.value)));
  const valueW = 90;
  const barX = 16 + labelW + 10;
  const barMax = width - barX - valueW - 10;
  list.forEach((it, i) => {
    const y = head + i * rowH;
    cv.fillRect(barX, y + rowH - 1, barMax, 1, GRID);
    drawText(cv, fit(it.label, 13, labelW), 16, y + rowH / 2 + 5, 13, FG);
    const w = Math.max(Number(it.value) > 0 ? 2 : 0, (Number(it.value) / max) * barMax);
    cv.fillRect(barX, y + 6, w, rowH - 12, it.color || '#3f7fd6');
    drawText(cv, Number(it.value).toLocaleString('en-US'), barX + w + 8, y + rowH / 2 + 5, 13, MUTED, { bold: true });
  });
  if (!list.length) drawText(cv, '—', barX, head + rowH / 2 + 5, 13, MUTED);
  return { width, height, rgb: cv.rgb, png: cv.png() };
}

const RATING_COLOR = { A: '#2e9d57', B: '#8bc34a', C: '#f2c12e', D: '#f08a24', E: '#d64545' };

/** A row of rating tiles: big letter and its name. */
function ratingTiles({ title, items }, { width = 760 } = {}) {
  const head = title ? 44 : 12;
  const tileH = 84;
  const gap = 12;
  const cols = Math.min(2, Math.max(1, items.length));
  const rows = Math.ceil(items.length / cols) || 1;
  const height = head + rows * tileH + (rows - 1) * gap + 16;
  const cv = new Canvas(width, height);
  if (title) drawText(cv, title, 16, 28, 17, FG, { bold: true });
  const tileW = (width - 32 - gap * (cols - 1)) / cols;
  items.forEach((it, i) => {
    const x = 16 + (i % cols) * (tileW + gap);
    const y = head + Math.floor(i / cols) * (tileH + gap);
    cv.fillRect(x, y, tileW, tileH, '#f4f6f9');
    cv.fillRect(x, y, 6, tileH, RATING_COLOR[it.letter] || MUTED);
    const box = 52;
    cv.fillRect(x + 18, y + (tileH - box) / 2, box, box, RATING_COLOR[it.letter] || MUTED);
    drawText(cv, it.letter || '—', x + 18 + box / 2, y + tileH / 2 + 12, 32, '#ffffff', { bold: true, align: 'center' });
    drawText(cv, fit(it.label, 15, tileW - box - 44, true), x + box + 32, y + tileH / 2 - 4, 15, FG, { bold: true });
    if (it.detail) drawText(cv, fit(it.detail, 13, tileW - box - 44), x + box + 32, y + tileH / 2 + 17, 13, MUTED);
  });
  return { width, height, rgb: cv.rgb, png: cv.png() };
}

const L = {
  ko: {
    types: '유형별 이슈', sev: '심각도별 이슈', rules: '많이 나온 규칙 (상위 10)', ratings: '등급',
    BUG: '버그', VULNERABILITY: '취약점', CODE_SMELL: '코드 스멜', SECURITY_HOTSPOT: '보안 핫스팟',
    BLOCKER: '차단', CRITICAL: '심각', MAJOR: '주요', MINOR: '경미', INFO: '정보',
    reliability: '신뢰성', security: '보안', maintainability: '유지보수성', review: '보안 검토',
    bugs: '버그 {n}개', vulns: '취약점 {n}개', debt: '부채 비율 {n}%', hotspots: '검토 {n}%',
  },
  en: {
    types: 'Issues by type', sev: 'Issues by severity', rules: 'Most frequent rules (top 10)', ratings: 'Ratings',
    BUG: 'Bugs', VULNERABILITY: 'Vulnerabilities', CODE_SMELL: 'Code smells', SECURITY_HOTSPOT: 'Security hotspots',
    BLOCKER: 'Blocker', CRITICAL: 'Critical', MAJOR: 'Major', MINOR: 'Minor', INFO: 'Info',
    reliability: 'Reliability', security: 'Security', maintainability: 'Maintainability', review: 'Security review',
    bugs: '{n} bugs', vulns: '{n} vulnerabilities', debt: 'Debt ratio {n}%', hotspots: '{n}% reviewed',
  },
};

const SEV_COLOR = { BLOCKER: '#8e1c1c', CRITICAL: '#d64545', MAJOR: '#f08a24', MINOR: '#f2c12e', INFO: '#7a8a99' };
const TYPE_COLOR = { BUG: '#d64545', VULNERABILITY: '#8e44ad', CODE_SMELL: '#3f7fd6', SECURITY_HOTSPOT: '#f08a24' };

function isOpen(i) {
  return i.type === 'SECURITY_HOTSPOT' ? i.status !== 'REVIEWED' && i.status !== 'SAFE' && i.status !== 'FIXED' : !(i.status === 'RESOLVED' || i.status === 'CLOSED' || i.resolution);
}

/** The charts a report shows: ratings, issues by type, by severity, top rules. */
function reportCharts(analysis, { lang = 'ko' } = {}) {
  const t = L[lang] || L.en;
  const fill = (s, n) => s.replace('{n}', Number(n || 0).toLocaleString('en-US'));
  const issues = ((analysis && analysis.issues) || []).filter(isOpen);
  const m = (analysis && analysis.measures) || {};
  const r = (analysis && analysis.ratings) || {};
  const count = (key, val) => issues.filter((i) => i[key] === val).length;
  const out = [];
  const add = (id, title, img) => out.push({ id, title, alt: title, ...img });
  add('ratings', t.ratings, ratingTiles({ title: t.ratings, items: [
    { letter: r.reliability, label: t.reliability, detail: fill(t.bugs, m.bugs) },
    { letter: r.security, label: t.security, detail: fill(t.vulns, m.vulnerabilities) },
    { letter: r.maintainability, label: t.maintainability, detail: fill(t.debt, m.sqale_debt_ratio) },
    { letter: r.securityReview, label: t.review, detail: fill(t.hotspots, m.security_hotspots_reviewed) },
  ] }));
  add('types', t.types, barChart({ title: t.types, items: ['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].map((k) => ({ label: t[k], value: count('type', k), color: TYPE_COLOR[k] })) }));
  add('severity', t.sev, barChart({ title: t.sev, items: ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'].map((k) => ({ label: t[k], value: count('severity', k), color: SEV_COLOR[k] })) }));
  const byRule = new Map();
  for (const i of issues) byRule.set(i.rule, (byRule.get(i.rule) || 0) + 1);
  const top = [...byRule].sort((a, b) => b[1] - a[1]).slice(0, 10);
  add('rules', t.rules, barChart({ title: t.rules, items: top.map(([rule, n]) => ({ label: rule, value: n, color: '#3f7fd6' })) }, { labelW: 300 }));
  return out;
}

module.exports = { Canvas, encodePng, barChart, ratingTiles, reportCharts, drawText, textWidth, crc32 };

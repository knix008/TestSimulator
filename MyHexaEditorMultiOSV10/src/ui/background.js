// Moving backgrounds for the start page: six scenes of bytes (a hex rain, a dump being edited, bit streams, nibble
// waves, an entropy graph, a memory map) and sixteen quiet scenes from the world of documents —
// a page being typed, files merging into one document, the structure tree being numbered, Markdown marks
// falling, pages stacking, heading numbers rising, a table of contents with dotted leaders, ink lines, a
// table filling in, a code block, picture frames, quotation marks, drifting letters, a book turning its
// pages, linked documents and an editor's caret (the list is ANIMATIONS in settings). Colours follow the
// theme. The animation pauses while the window is hidden; `frames` counts drawn frames (tests use it).
import { ANIMATIONS } from '../domain/settings.js';

export const ANIMATION_KINDS = ANIMATIONS;
/** The kind used when a saved one is unknown (an older version's background). */
export const DEFAULT_ANIMATION = ANIMATIONS[0];

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** A repeatable 0–1 number for a cell, a round, … */
const hash = (a, b = 0, c = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mod = (v, m) => ((v % m) + m) % m;
/** Where a repeating scene is: which round, and how far through it (0–1). */
const cycle = (time, period) => { const t = time / period; return { round: Math.floor(t), phase: t - Math.floor(t) }; };
/** Fades a repeating scene in at the start of its round and out at the end. */
const fadeInOut = (phase, out = 0.1, inn = 0.04) => Math.min(clamp01(phase / inn), clamp01((1 - phase) / out));

// Parsed once per colour: the animations ask for rgba() hundreds of times a frame.
const rgbCache = new Map();
function hexToRgb(hex) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    rgb = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
    rgbCache.set(hex, rgb);
  }
  return rgb;
}
/** The backgrounds drift slowly: 30 frames a second look the same as the screen's 60–144 and cost a fraction. */
const FRAME_MS = 1000 / 30;

/**
 * How strongly the current background is drawn: the start page shows it vividly (more opaque
 * colours, bigger dots — light themes need more than dark ones), the faint layer behind the
 * views as designed. Set for each frame by draw().
 */
let BOOST = 1;
let SIZE = 1;
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${Math.min(1, a * BOOST)})`; };

/** Strokes the first `share` (0–1) of a list of segments [x1, y1, x2, y2]; returns the pen's position. */
function drawPartial(c, segs, share) {
  let total = 0;
  for (const s of segs) total += Math.hypot(s[2] - s[0], s[3] - s[1]);
  let left = total * clamp01(share);
  let pen = null;
  c.beginPath();
  for (const [x1, y1, x2, y2] of segs) {
    if (left <= 0) break;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const f = len > left ? left / len : 1;
    pen = [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
    c.moveTo(x1, y1);
    c.lineTo(pen[0], pen[1]);
    left -= len;
  }
  c.stroke();
  return share < 1 ? pen : null;
}

/** All lines of a square grid as one path. */
function gridPath(c, w, h, step, offX, offY) {
  c.beginPath();
  for (let x = mod(offX, step); x <= w; x += step) { c.moveTo(x, 0); c.lineTo(x, h); }
  for (let y = mod(offY, step); y <= h; y += step) { c.moveTo(0, y); c.lineTo(w, y); }
  c.stroke();
}

function roundRectPath(c, x, y, w, h, r) {
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}


/** Ink colours for lines of "text" and marks (soft, readable in light and dark themes). */
const INKS = ['#3a86ff', '#8338ec', '#ff006e', '#fb5607', '#2ec4b6', '#8ac926', '#f2c94c', '#56ccf2'];
const ink = (i, colors) => (i % 4 === 0 ? colors.accent : INKS[i % INKS.length]);
const paperFill = (colors, a = 1) => rgba(colors.dark ? '#ffffff' : '#ffffff', (colors.dark ? 0.06 : 0.6) * a);
const font = (c, px, weight = 600, family = 'sans-serif') => { c.font = `${weight} ${Math.round(px)}px ${family}`; };

/** A sheet of paper with a folded corner. */
function sheet(c, x, y, w, h, colors, alpha = 1) {
  if (alpha <= 0.01) return;
  const fold = Math.min(w, h) * 0.12;
  c.fillStyle = paperFill(colors, alpha);
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + w - fold, y); c.lineTo(x + w, y + fold); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill();
  c.strokeStyle = rgba(colors.text, 0.1 * alpha);
  c.lineWidth = Math.max(1, w / 260) * SIZE;
  c.stroke();
  c.fillStyle = rgba(colors.text, 0.08 * alpha);
  c.beginPath(); c.moveTo(x + w - fold, y); c.lineTo(x + w - fold, y + fold); c.lineTo(x + w, y + fold); c.closePath(); c.fill();
}

/** Lines of "text" on a sheet: a heading bar then body lines; `share` (0–1) of them are written. */
function textLines(c, x, y, w, h, colors, seed, alpha = 1, share = 1) {
  const lh = Math.max(4, h / 14);
  const rows = Math.floor((h * 0.82) / lh);
  const shown = rows * clamp01(share);
  for (let r = 0; r < rows; r++) {
    if (r >= shown) break;
    const part = Math.min(1, shown - r);
    const heading = r === 0 || hash(seed, r) > 0.86;
    const len = heading ? 0.55 : 0.6 + hash(seed, r, 2) * 0.35;
    c.fillStyle = heading ? rgba(ink(seed + r, colors), 0.42 * alpha) : rgba(colors.text, 0.13 * alpha);
    c.fillRect(x + w * 0.1, y + h * 0.1 + r * lh, w * 0.8 * len * part, lh * (heading ? 0.5 : 0.34));
  }
}

const SCENES = {
  // ───────────────────────── the hex editor's own scenes

  /** Columns of hex digits falling, brighter at their heads (a byte rain). */
  hexRain(c, w, h, time, colors) {
    const size = Math.max(12, Math.min(20, w / 70));
    c.font = `600 ${size}px Consolas, "Cascadia Mono", monospace`;
    c.textAlign = 'center';
    const cols = Math.ceil(w / (size * 1.6));
    for (let i = 0; i < cols; i++) {
      const speed = 0.4 + hash(i) * 0.8;
      const len = 8 + Math.floor(hash(i, 2) * 14);
      const head = mod(time * speed * 3 + hash(i, 3) * 40, (h / size) + len);
      for (let k = 0; k < len; k++) {
        const row = Math.floor(head) - k;
        if (row < 0) continue;
        const v = Math.floor(hash(i, row, Math.floor(time * 2 + k)) * 256);
        c.fillStyle = rgba(k === 0 ? colors.accent : colors.text, (k === 0 ? 0.55 : 0.28) * (1 - k / len));
        c.fillText(v.toString(16).padStart(2, '0').toUpperCase(), i * size * 1.6 + size, row * size * 1.15);
      }
    }
  },

  /** A hex dump grid whose bytes light up as a caret walks along it and edits them. */
  byteGrid(c, w, h, time, colors) {
    const size = Math.max(12, Math.min(18, w / 90));
    c.font = `${size}px Consolas, "Cascadia Mono", monospace`;
    c.textAlign = 'left';
    const cw = size * 1.9;
    const rh = size * 1.6;
    const cols = 16;
    const rows = Math.ceil(h / rh) + 1;
    const x0 = (w - (cols * cw + size * 9)) / 2;
    const caret = Math.floor(time * 3) % (cols * rows);
    for (let r = 0; r < rows; r++) {
      c.fillStyle = rgba(colors.text, 0.14);
      c.fillText((r * 16).toString(16).padStart(8, '0').toUpperCase(), x0 - size * 6, r * rh + rh);
      for (let k = 0; k < cols; k++) {
        const n = r * cols + k;
        const edited = n < caret && hash(n, 5) > 0.82;
        const v = Math.floor(hash(n, edited ? 9 : 1) * 256);
        const lit = n === caret;
        if (lit) { c.fillStyle = rgba(colors.accent, 0.35); c.fillRect(x0 + k * cw - 2, r * rh + rh * 0.25, cw - 4, rh * 0.9); }
        c.fillStyle = edited ? rgba(colors.danger ?? '#e5484d', 0.5) : rgba(v === 0 ? colors.text : colors.text, v === 0 ? 0.1 : 0.22);
        c.fillText(v.toString(16).padStart(2, '0').toUpperCase(), x0 + k * cw, r * rh + rh);
      }
    }
  },

  /** Streams of bits flowing across the screen, turning into bytes where they meet. */
  bitStream(c, w, h, time, colors) {
    const size = Math.max(10, Math.min(16, w / 110));
    c.font = `${size}px Consolas, monospace`;
    const lanes = Math.ceil(h / (size * 2.2));
    for (let l = 0; l < lanes; l++) {
      const dir = l % 2 ? -1 : 1;
      const speed = (30 + hash(l) * 60) * dir;
      const y = l * size * 2.2 + size * 1.5;
      const count = Math.ceil(w / (size * 0.8)) + 2;
      const shift = mod(time * speed, size * 0.8);
      for (let k = -1; k < count; k++) {
        const x = k * size * 0.8 + shift;
        const bit = hash(l, k - Math.floor(time * speed / (size * 0.8))) > 0.5 ? '1' : '0';
        c.fillStyle = rgba(k % 8 === 0 ? colors.accent : colors.text, k % 8 === 0 ? 0.4 : 0.16 + hash(l, k) * 0.1);
        c.fillText(bit, x, y);
      }
    }
  },

  /** Nibbles riding sine waves, like a signal in a logic analyser. */
  nibbleWaves(c, w, h, time, colors) {
    for (let band = 0; band < 5; band++) {
      const y0 = h * (0.15 + band * 0.18);
      c.strokeStyle = rgba(band % 2 ? colors.accent : colors.text, 0.22);
      c.lineWidth = 2;
      c.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const bit = hash(band, Math.floor((x + time * 80) / 40)) > 0.5 ? 1 : 0;
        const y = y0 - bit * h * 0.06;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  },

  /** An entropy graph drawn from left to right, high blocks tinted (compressed or encrypted data). */
  entropyBars(c, w, h, time, colors) {
    const { round, phase } = cycle(time, 14);
    const n = 64;
    const bw = w / n;
    const shown = Math.floor(phase * 1.2 * n);
    for (let i = 0; i < Math.min(n, shown); i++) {
      const e = 0.2 + 0.8 * (hash(round, Math.floor(i / 6)) * 0.6 + hash(round, i) * 0.4);
      const hh = e * h * 0.6;
      c.fillStyle = rgba(e > 0.85 ? colors.accent : colors.text, e > 0.85 ? 0.35 : 0.13);
      c.fillRect(i * bw + 1, h * 0.85 - hh, bw - 2, hh);
    }
    c.fillStyle = rgba(colors.text, 0.18);
    c.fillRect(0, h * 0.85, w, 2);
  },

  /** A memory map: regions of a process being read, the unreadable ones in grey. */
  memoryMap(c, w, h, time, colors) {
    const cell = Math.max(10, Math.min(18, w / 80));
    const cols = Math.floor(w / cell);
    const rows = Math.floor(h / cell);
    const sweep = mod(time * 20, cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const n = r * cols + k;
        const region = Math.floor(hash(Math.floor(n / 37)) * 4);
        if (region === 0) continue;
        const read = n < sweep;
        c.fillStyle = rgba(region === 1 ? colors.text : region === 2 ? colors.accent : INKS[n % INKS.length], read ? 0.24 : 0.07);
        c.fillRect(k * cell + 1, r * cell + 1, cell - 2, cell - 2);
      }
    }
  },

  // ───────────────────────── the scenes (writing, merging, numbering, pages, Markdown marks)

  /** A page being typed line by line, a blinking caret at the end; a full page slides up and a new one starts. */
  typewriter(c, w, h, time, colors) {
    const pw = Math.min(w * 0.42, h * 0.62);
    const ph = pw * 1.3;
    const { round, phase } = cycle(time, 16);
    const x = (w - pw) / 2;
    const y = h * 0.5 - ph / 2 - (phase > 0.9 ? (phase - 0.9) * 10 * h : 0);
    sheet(c, x, y, pw, ph, colors, fadeInOut(phase, 0.1, 0.05));
    const lh = ph / 16;
    const rows = 12;
    const written = phase * 1.1 * rows;
    for (let r = 0; r < rows && r < written; r++) {
      const heading = r === 0 || r === 5;
      const len = heading ? 0.5 : 0.55 + hash(round, r) * 0.4;
      const part = Math.min(1, written - r);
      c.fillStyle = heading ? rgba(ink(round + r, colors), 0.5) : rgba(colors.text, 0.16);
      c.fillRect(x + pw * 0.1, y + ph * 0.1 + r * lh, pw * 0.8 * len * part, lh * (heading ? 0.5 : 0.32));
      if (part < 1 || r === Math.min(rows, Math.ceil(written)) - 1) {
        if (Math.sin(time * 6) > -0.2) { c.fillStyle = rgba(colors.accent, 0.8); c.fillRect(x + pw * 0.1 + pw * 0.8 * len * part + 3, y + ph * 0.1 + r * lh - lh * 0.1, 2 * SIZE, lh * 0.62); }
      }
    }
  },

  /** Small files on the left send their lines along curves into one big document on the right. */
  mergeStreams(c, w, h, time, colors) {
    const files = 4;
    const fw = w * 0.1; const fh = fw * 1.3;
    const big = { x: w * 0.62, y: h * 0.14, w: w * 0.26, h: h * 0.72 };
    sheet(c, big.x, big.y, big.w, big.h, colors);
    const { phase } = cycle(time, 18);
    textLines(c, big.x, big.y, big.w, big.h, colors, 3, 1, phase);
    c.lineWidth = Math.max(1, w / 900) * SIZE;
    for (let f = 0; f < files; f++) {
      const fx = w * 0.12; const fy = h * (0.12 + f * 0.2);
      sheet(c, fx, fy, fw, fh, colors);
      textLines(c, fx, fy, fw, fh, colors, f + 7, 0.9);
      const sx = fx + fw; const sy = fy + fh / 2; const ex = big.x; const ey = big.y + big.h * (0.15 + f * 0.2);
      c.strokeStyle = rgba(ink(f, colors), 0.12);
      c.beginPath(); c.moveTo(sx, sy); c.bezierCurveTo(sx + w * 0.15, sy, ex - w * 0.15, ey, ex, ey); c.stroke();
      for (let k = 0; k < 3; k++) {
        const p = mod(time * 0.22 + k / 3 + f * 0.17, 1);
        const q = 1 - p;
        const bx = q * q * q * sx + 3 * q * q * p * (sx + w * 0.15) + 3 * q * p * p * (ex - w * 0.15) + p * p * p * ex;
        const by = q * q * q * sy + 3 * q * q * p * sy + 3 * q * p * p * ey + p * p * p * ey;
        c.fillStyle = rgba(ink(f, colors), 0.5 * fadeInOut(p, 0.1, 0.1));
        c.beginPath(); roundRectPath(c, bx - 14 * SIZE, by - 3 * SIZE, 28 * SIZE, 6 * SIZE, 3); c.fill();
      }
    }
  },

  /** The document's structure tree grows node by node: 1, 1.1, 1.2, 2, 2.1 … */
  outlineTree(c, w, h, time, colors) {
    const nodes = [];
    const counters = [0, 0, 0];
    for (let i = 0; i < 16; i++) {
      const level = i === 0 ? 0 : Math.min(2, Math.floor(hash(i, 5) * 3));
      const lv = i === 0 ? 0 : (level > (nodes.at(-1)?.level ?? 0) + 1 ? (nodes.at(-1)?.level ?? 0) + 1 : level);
      counters[lv] += 1; for (let k = lv + 1; k < 3; k++) counters[k] = 0;
      nodes.push({ level: lv, label: counters.slice(0, lv + 1).join('.') });
    }
    const { phase } = cycle(time, 20);
    const shown = phase * 1.2 * nodes.length;
    const rowH = Math.min(h * 0.05, 34);
    const top = h * 0.5 - (nodes.length * rowH) / 2;
    const left = w * 0.3;
    const step = w * 0.06;
    c.lineWidth = Math.max(1, w / 1100) * SIZE;
    nodes.forEach((node, i) => {
      if (i >= shown) return;
      const a = clamp01(shown - i) * fadeInOut(phase, 0.08, 0.02);
      const x = left + node.level * step; const y = top + i * rowH;
      c.strokeStyle = rgba(colors.text, 0.18 * a);
      if (node.level) { c.beginPath(); c.moveTo(x - step * 0.6, y - rowH * 0.6); c.lineTo(x - step * 0.6, y); c.lineTo(x - 6, y); c.stroke(); }
      c.fillStyle = rgba(ink(node.level * 3 + 1, colors), 0.75 * a);
      c.beginPath(); c.arc(x, y, 5 * SIZE, 0, Math.PI * 2); c.fill();
      font(c, rowH * 0.5, 700);
      c.fillText(node.label, x + 12 * SIZE, y + rowH * 0.18);
      c.fillStyle = rgba(colors.text, 0.14 * a);
      c.fillRect(x + 12 * SIZE + rowH * 1.6, y - rowH * 0.1, w * (0.12 + hash(i, 9) * 0.14), rowH * 0.26);
    });
  },

  /** Markdown marks fall slowly like rain: # ## * - > ` [ ] 1. **. */
  markRain(c, w, h, time, colors) {
    const marks = ['#', '##', '*', '-', '>', '`', '[ ]', '1.', '**', '![]', '---', '|'];
    const cols = Math.max(8, Math.round(w / 90));
    for (let i = 0; i < cols * 3; i++) {
      const col = i % cols;
      const speed = 0.04 + hash(i, 1) * 0.06;
      const p = mod(time * speed + hash(i, 2), 1);
      const size = (14 + hash(i, 3) * 26) * SIZE;
      const x = (col + 0.5 + (hash(i, 4) - 0.5) * 0.6) * (w / cols);
      const y = -size + p * (h + size * 2);
      font(c, size, 800, 'ui-monospace, Consolas, monospace');
      c.fillStyle = rgba(ink(i, colors), (0.12 + hash(i, 5) * 0.25) * fadeInOut(p, 0.15, 0.1));
      c.fillText(marks[i % marks.length], x, y);
    }
  },

  /** Pages drop onto a pile one after another, each a little turned. */
  pageStack(c, w, h, time, colors) {
    const pw = Math.min(w * 0.2, h * 0.32); const ph = pw * 1.32;
    const n = 9;
    const { round, phase } = cycle(time, 14);
    const landed = phase * n * 1.15;
    for (let i = 0; i < n; i++) {
      if (i > landed) break;
      const f = clamp01(landed - i);
      const ease = 1 - (1 - f) * (1 - f);
      const angle = (hash(round, i) - 0.5) * 0.35;
      const cx = w * 0.5 + (hash(round, i, 2) - 0.5) * pw * 0.5;
      const cy = h * 0.55 - i * 3 * SIZE - (1 - ease) * h * 0.6;
      c.save(); c.translate(cx, cy); c.rotate(angle * ease);
      sheet(c, -pw / 2, -ph / 2, pw, ph, colors, fadeInOut(phase, 0.08, 0.02));
      textLines(c, -pw / 2, -ph / 2, pw, ph, colors, round * 7 + i, fadeInOut(phase, 0.08, 0.02));
      c.restore();
    }
  },

  /** Heading numbers float up and fade: 1., 1.2, 2.3.1 … */
  numbering(c, w, h, time, colors) {
    for (let i = 0; i < 34; i++) {
      const p = mod(time * (0.025 + hash(i, 1) * 0.03) + hash(i, 2), 1);
      const depth = 1 + Math.floor(hash(i, 3) * 3);
      const label = Array.from({ length: depth }, (_, k) => 1 + Math.floor(hash(i, k + 4) * 9)).join('.') + (depth === 1 ? '.' : '');
      const size = (16 + (3 - depth) * 12 + hash(i, 8) * 10) * SIZE;
      font(c, size, 800);
      c.fillStyle = rgba(ink(i, colors), (0.14 + hash(i, 9) * 0.22) * fadeInOut(p, 0.25, 0.2));
      c.fillText(label, hash(i, 10) * w, h + size - p * (h + size * 2));
    }
  },

  /** A table of contents: titles, dotted leaders and page numbers; a highlight walks down the entries. */
  tocLeaders(c, w, h, time, colors) {
    const pw = Math.min(w * 0.5, h * 0.75); const ph = pw * 1.25;
    const x = (w - pw) / 2; const y = (h - ph) / 2;
    sheet(c, x, y, pw, ph, colors);
    const rows = 13; const lh = (ph * 0.76) / rows;
    font(c, lh * 0.9, 800);
    c.fillStyle = rgba(colors.accent, 0.6);
    c.fillText('목차 · Contents', x + pw * 0.1, y + ph * 0.1);
    const hi = Math.floor(mod(time * 0.8, rows));
    for (let r = 0; r < rows; r++) {
      const ry = y + ph * 0.17 + r * lh;
      const sub = hash(r, 1) > 0.55 && r > 0;
      const tx = x + pw * (sub ? 0.16 : 0.1);
      const tw = pw * (0.2 + hash(r, 2) * 0.2);
      if (r === hi) { c.fillStyle = rgba(colors.accent, 0.16); c.fillRect(x + pw * 0.06, ry - lh * 0.55, pw * 0.88, lh * 0.8); }
      c.fillStyle = rgba(sub ? colors.text : ink(r, colors), sub ? 0.2 : 0.42);
      c.fillRect(tx, ry - lh * 0.3, tw, lh * 0.28);
      c.fillStyle = rgba(colors.text, 0.22);
      for (let d = tx + tw + 8; d < x + pw * 0.82; d += 7 * SIZE) c.fillRect(d, ry - lh * 0.08, 2 * SIZE, 2 * SIZE);
      font(c, lh * 0.5, 700);
      c.fillText(String(1 + r * 3 + Math.floor(hash(r, 3) * 3)), x + pw * 0.85, ry);
    }
  },

  /** Handwritten-looking ink lines are drawn across the window, row by row. */
  inkLines(c, w, h, time, colors) {
    const rows = 9;
    const { round, phase } = cycle(time, 15);
    c.lineCap = 'round';
    for (let r = 0; r < rows; r++) {
      const share = clamp01(phase * rows * 1.2 - r * 0.9);
      if (share <= 0) continue;
      const y = h * (0.12 + r * 0.09);
      const x0 = w * 0.08; const len = w * (0.55 + hash(round, r) * 0.35);
      c.strokeStyle = rgba(ink(r + round, colors), 0.38 * fadeInOut(phase, 0.08, 0.02));
      c.lineWidth = (2 + hash(r, 4) * 2) * SIZE;
      c.beginPath();
      const steps = Math.floor(80 * share);
      for (let k = 0; k <= steps; k++) {
        const t = k / 80;
        const px = x0 + t * len;
        const py = y + Math.sin(t * 38 + r) * h * 0.012 + Math.sin(t * 11 + round) * h * 0.006;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    }
  },

  /** A Markdown table: its cells fill in one after another, the header row first. */
  tableCells(c, w, h, time, colors) {
    const cols = 5; const rows = 8;
    const tw = Math.min(w * 0.7, h * 1.1); const cw = tw / cols; const ch = Math.min(h * 0.08, cw * 0.42);
    const x = (w - tw) / 2; const y = (h - ch * rows) / 2;
    const { phase } = cycle(time, 16);
    const filled = phase * 1.15 * cols * rows;
    c.lineWidth = Math.max(1, w / 1200) * SIZE;
    c.strokeStyle = rgba(colors.text, 0.16);
    for (let r = 0; r <= rows; r++) { c.beginPath(); c.moveTo(x, y + r * ch); c.lineTo(x + tw, y + r * ch); c.stroke(); }
    for (let k = 0; k <= cols; k++) { c.beginPath(); c.moveTo(x + k * cw, y); c.lineTo(x + k * cw, y + rows * ch); c.stroke(); }
    for (let i = 0; i < cols * rows; i++) {
      if (i >= filled) break;
      const r = Math.floor(i / cols); const k = i % cols;
      const a = clamp01(filled - i) * fadeInOut(phase, 0.08, 0.02);
      if (r === 0) { c.fillStyle = rgba(colors.accent, 0.14 * a); c.fillRect(x + k * cw + 1, y + 1, cw - 2, ch - 2); }
      c.fillStyle = r === 0 ? rgba(colors.accent, 0.6 * a) : rgba(ink(i, colors), 0.3 * a);
      c.fillRect(x + k * cw + cw * 0.14, y + r * ch + ch * 0.4, cw * (0.3 + hash(i, 2) * 0.5), ch * 0.22);
    }
  },

  /** A code block: lines with coloured words appear, indented like real code, inside ``` fences. */
  codeFence(c, w, h, time, colors) {
    const bw = Math.min(w * 0.6, h * 0.95); const bh = bw * 0.72;
    const x = (w - bw) / 2; const y = (h - bh) / 2;
    c.fillStyle = rgba(colors.text, colors.dark ? 0.05 : 0.06);
    c.beginPath(); roundRectPath(c, x, y, bw, bh, 14); c.fill();
    const lh = bh / 16;
    font(c, lh * 0.85, 800, 'ui-monospace, Consolas, monospace');
    c.fillStyle = rgba(colors.accent, 0.55);
    c.fillText('```js', x + bw * 0.05, y + lh * 1.2);
    const { round, phase } = cycle(time, 14);
    const shown = phase * 1.2 * 13;
    let indent = 0;
    for (let r = 0; r < 13 && r < shown; r++) {
      if (hash(round, r) > 0.7 && indent < 3) indent += 1; else if (hash(round, r, 1) > 0.75 && indent > 0) indent -= 1;
      let cx = x + bw * 0.08 + indent * bw * 0.05;
      const words = 1 + Math.floor(hash(round, r, 2) * 4);
      const part = clamp01(shown - r);
      for (let k = 0; k < words * part; k++) {
        const ww = bw * (0.05 + hash(r, k, 3) * 0.12);
        c.fillStyle = rgba(ink(r * 3 + k, colors), 0.45 * fadeInOut(phase, 0.08, 0.02));
        c.fillRect(cx, y + lh * (2.1 + r), ww, lh * 0.4);
        cx += ww + bw * 0.015;
      }
    }
    c.fillStyle = rgba(colors.accent, 0.55 * clamp01(shown - 12));
    c.fillText('```', x + bw * 0.05, y + bh - lh * 0.6);
  },

  /** Picture frames pop in across a grid, each with its caption bar ("Figure n"). */
  figureFrames(c, w, h, time, colors) {
    const cols = 4; const rows = 3;
    const fw = w / (cols + 1); const fh = fw * 0.62;
    for (let i = 0; i < cols * rows; i++) {
      const k = i % cols; const r = Math.floor(i / cols);
      const p = mod(time * 0.07 + hash(i, 1), 1);
      const pop = clamp01(p / 0.12);
      const a = fadeInOut(p, 0.12, 0.12);
      const s = 0.85 + 0.15 * (1 - (1 - pop) * (1 - pop));
      const cx = (k + 1) * (w / (cols + 1)); const cy = (r + 0.7) * (h / (rows + 0.4));
      c.save(); c.translate(cx, cy); c.scale(s, s);
      c.fillStyle = paperFill(colors, a);
      c.fillRect(-fw * 0.42, -fh * 0.5, fw * 0.84, fh);
      c.fillStyle = rgba(ink(i, colors), 0.28 * a);
      c.beginPath(); c.moveTo(-fw * 0.36, fh * 0.32); c.lineTo(-fw * 0.12, -fh * 0.1); c.lineTo(fw * 0.02, fh * 0.12); c.lineTo(fw * 0.16, -fh * 0.02); c.lineTo(fw * 0.36, fh * 0.32); c.closePath(); c.fill();
      c.beginPath(); c.arc(fw * 0.22, -fh * 0.26, fh * 0.08, 0, Math.PI * 2); c.fill();
      c.fillStyle = rgba(colors.text, 0.16 * a);
      c.fillRect(-fw * 0.2, fh * 0.58, fw * 0.4, fh * 0.07);
      c.restore();
    }
  },

  /** Big quotation marks drift by beside quote bars ( > blockquotes ). */
  quoteMarks(c, w, h, time, colors) {
    for (let i = 0; i < 12; i++) {
      const p = mod(time * (0.02 + hash(i, 1) * 0.02) + hash(i, 2), 1);
      const size = (60 + hash(i, 3) * 120) * SIZE;
      const x = -size + p * (w + size * 2);
      const y = h * (0.1 + hash(i, 4) * 0.8);
      const a = fadeInOut(p, 0.2, 0.2);
      font(c, size, 900, 'Georgia, serif');
      c.fillStyle = rgba(ink(i, colors), (0.1 + hash(i, 5) * 0.14) * a);
      c.fillText(i % 2 ? '”' : '“', x, y);
      c.fillRect(x + size * 0.8, y - size * 0.55, size * 0.05, size * 0.5);
      c.fillStyle = rgba(colors.text, 0.08 * a);
      c.fillRect(x + size * 0.95, y - size * 0.48, size * 0.9, size * 0.08);
      c.fillRect(x + size * 0.95, y - size * 0.3, size * 0.7, size * 0.08);
    }
  },

  /** Letters of both alphabets drift slowly in layers, the near ones larger and faster. */
  letterDrift(c, w, h, time, colors) {
    const letters = 'AaBbMmDdTtWw가나다라마바사아자한글';
    for (let i = 0; i < 46; i++) {
      const z = hash(i, 1);
      const size = (14 + z * 60) * SIZE;
      const x = mod(hash(i, 2) * w + time * (8 + z * 30) * SIZE, w + size) - size / 2;
      const y = h * hash(i, 3) + Math.sin(time * 0.4 + i) * 14;
      font(c, size, 700, 'Georgia, serif');
      c.fillStyle = rgba(ink(i, colors), 0.06 + z * 0.22);
      c.fillText(letters[i % letters.length], x, y);
    }
  },

  /** An open book; its pages turn one after another. */
  bookPages(c, w, h, time, colors) {
    const pw = Math.min(w * 0.3, h * 0.5); const ph = pw * 1.3;
    const cx = w / 2; const y = (h - ph) / 2;
    sheet(c, cx - pw, y, pw, ph, colors);
    sheet(c, cx, y, pw, ph, colors);
    const { round, phase } = cycle(time, 4.5);
    textLines(c, cx - pw, y, pw, ph, colors, round * 2);
    textLines(c, cx, y, pw, ph, colors, round * 2 + 1);
    const turn = clamp01((phase - 0.2) / 0.6);
    const ease = turn * turn * (3 - 2 * turn);
    const sx = Math.cos(ease * Math.PI);
    c.save(); c.translate(cx, y);
    c.fillStyle = paperFill(colors, 1.4);
    c.beginPath(); c.rect(0, 0, pw * sx, ph); c.fill();
    c.strokeStyle = rgba(colors.text, 0.15); c.lineWidth = SIZE; c.stroke();
    c.restore();
    c.fillStyle = rgba(colors.text, 0.12);
    c.fillRect(cx - 1.5 * SIZE, y, 3 * SIZE, ph);
  },

  /** Documents linked by references: lines between them, dots travel along the links. */
  linkGraph(c, w, h, time, colors) {
    const n = 9;
    const pts = Array.from({ length: n }, (_, i) => ({ x: w * (0.12 + hash(i, 1) * 0.76) + Math.sin(time * 0.3 + i) * 10, y: h * (0.15 + hash(i, 2) * 0.7) + Math.cos(time * 0.25 + i) * 10 }));
    c.lineWidth = Math.max(1, w / 1000) * SIZE;
    for (let i = 0; i < n; i++) {
      const j = (i * 3 + 2) % n; const k = (i + 4) % n;
      for (const t of [j, k]) {
        c.strokeStyle = rgba(colors.text, 0.14);
        c.setLineDash?.([6 * SIZE, 5 * SIZE]);
        c.beginPath(); c.moveTo(pts[i].x, pts[i].y); c.lineTo(pts[t].x, pts[t].y); c.stroke();
        c.setLineDash?.([]);
        const p = mod(time * 0.15 + hash(i, t), 1);
        c.fillStyle = rgba(ink(i, colors), 0.55);
        c.beginPath(); c.arc(pts[i].x + (pts[t].x - pts[i].x) * p, pts[i].y + (pts[t].y - pts[i].y) * p, 3.5 * SIZE, 0, Math.PI * 2); c.fill();
      }
    }
    const dw = Math.min(w, h) * 0.07;
    pts.forEach((pt, i) => { sheet(c, pt.x - dw / 2, pt.y - dw * 0.65, dw, dw * 1.3, colors); textLines(c, pt.x - dw / 2, pt.y - dw * 0.65, dw, dw * 1.3, colors, i); });
  },

  /** An editor: lines of text, the caret walking through them and a selection sweeping over a few lines. */
  cursorBlink(c, w, h, time, colors) {
    const x = w * 0.14; const tw = w * 0.72;
    const lh = Math.min(h / 18, 34);
    const rows = Math.floor((h * 0.8) / lh);
    const y = (h - rows * lh) / 2;
    c.fillStyle = rgba(colors.text, 0.04);
    c.fillRect(x - w * 0.04, y - lh, tw + w * 0.08, rows * lh + lh * 2);
    const caret = mod(time * 1.2, rows);
    const selStart = Math.floor(mod(time * 0.3, rows));
    for (let r = 0; r < rows; r++) {
      const len = hash(r, 1) * 0.7 + 0.2;
      const heading = hash(r, 2) > 0.82;
      if (r >= selStart && r < selStart + 3) { c.fillStyle = rgba(colors.accent, 0.13); c.fillRect(x, y + r * lh, tw * len, lh * 0.9); }
      font(c, lh * 0.48, 700, 'ui-monospace, Consolas, monospace');
      c.fillStyle = rgba(colors.text, 0.22);
      c.fillText(String(r + 1).padStart(2, ' '), x - w * 0.035, y + r * lh + lh * 0.62);
      c.fillStyle = heading ? rgba(ink(r, colors), 0.5) : rgba(colors.text, 0.16);
      if (heading) c.fillText('#', x, y + r * lh + lh * 0.62);
      c.fillRect(x + (heading ? lh * 0.6 : 0), y + r * lh + lh * 0.3, tw * len, lh * 0.32);
    }
    const cr = Math.floor(caret);
    if (Math.sin(time * 7) > -0.3) {
      c.fillStyle = rgba(colors.accent, 0.85);
      c.fillRect(x + tw * (hash(cr, 1) * 0.7 + 0.2) * (caret - cr), y + cr * lh + lh * 0.1, 2.5 * SIZE, lh * 0.75);
    }
  },
};

export class AnimatedBackground {
  constructor(canvas, { colors, speed = () => 1, kind = DEFAULT_ANIMATION, vivid = false } = {}) {
    this.vivid = vivid;
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true }));
    this.speed = speed;
    this.kind = ANIMATION_KINDS.includes(kind) ? kind : DEFAULT_ANIMATION;
    this.frames = 0;
    this.time = 0;
    this.running = false;
    this.last = 0;
    this.items = [];
    this.seed();
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.pause(); else if (this.wanted) this.start(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  setKind(kind) {
    if (!ANIMATION_KINDS.includes(kind) || kind === this.kind) return;
    this.kind = kind;
    this.seed();
  }

  /** A different animation, chosen at random. */
  shuffle(random = Math.random) {
    const others = ANIMATION_KINDS.filter((kind) => kind !== this.kind);
    const next = others[Math.floor(random() * others.length) % others.length];
    this.setKind(next);
    return next;
  }

  seed() {
    const r = rand(this.kind.length * 9973 + 7);
    const count = 0;
    this.items = Array.from({ length: count }, () => ({ x: r(), y: r(), z: r(), s: r(), v: r(), h: r() }));
  }

  resize() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      if (!this.running) this.draw();
    }
  }

  start() {
    this.wanted = true;
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  pause() {
    this.running = false;
  }

  stop() {
    this.wanted = false;
    this.running = false;
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver.disconnect();
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    // A little slack, so a 60 Hz screen draws every other frame instead of drifting between 1 and 3.
    if (now - this.last < FRAME_MS - 4) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt * this.speed();
    this.draw();
  }

  draw() {
    const { context: c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;
    const colors = this.colors();
    // Broad washes (light, glow, cloth) are strong already; thin lines and dots need the most help.
    const kindBoost = { letterDrift: 0.85, quoteMarks: 0.85, markRain: 0.9 }[this.kind] ?? 1;
    BOOST = this.vivid ? (colors.dark ? 2.3 : 2.9) * kindBoost : 1;
    SIZE = this.vivid ? 1.6 : 1;
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.setLineDash?.([]);
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    const fn = SCENES[this.kind];
    if (fn) fn.call(this, c, w, h, this.time, colors);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.setLineDash?.([]);
  }
}

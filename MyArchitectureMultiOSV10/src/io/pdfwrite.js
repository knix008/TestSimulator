// Vector PDF writer: SVG pages → one multi-page PDF, in plain JavaScript.
//
// The web build has no print-to-PDF of its own (the desktop build uses
// Chromium's), so the drawing sheets — SVG from the SvgContext — are
// translated here into PDF content streams: paths (lines, Béziers, arcs via
// svgimport's path parser), rects, circles, ellipses, lines, polylines and
// polygons; fills, strokes, widths, caps, joins, dash patterns, opacity
// (ExtGState), nested transforms, clip paths, texts with anchors and
// baselines, <use>, and JPEG / PNG <image>s.
//
// Fonts are not embedded. Latin text uses the standard Helvetica /
// Helvetica-Bold (WinAnsiEncoding), which every viewer has; anything else
// (Korean, CJK, symbols) goes to the Adobe-Korea1 CID font HYGoThic-Medium
// with the UniKS-UCS2-H CMap, the predefined non-embedded Korean font every
// PDF viewer substitutes with a system font (as ReportLab and many CAD
// programs do). Text stays text: selectable and searchable.
//
// Coordinates: the page CTM maps the SVG's viewBox (y down) onto the page
// in points (y up); texts get a flipped text matrix so glyphs stand upright.

import { parseXml, parsePathData, parseTransform, parseColor } from "./svgimport.js";
import { imageInfo, parseDataUri } from "./imageinfo.js";

export const PT_PER_MM = 72 / 25.4;
const K = 0.5522847498307936; // circle → cubic Bézier handle length
// Advance of a Korean / CJK glyph (1/1000 em). Viewers substitute a system
// font (Malgun Gothic, Apple SD Gothic Neo, Noto Sans CJK), whose Hangul is
// about 0.92 em wide — as in the on-screen sheet — rather than the 1 em of
// HYGoThic itself.
const CJK_WIDTH = 920;

// ---------------------------------------------------------------- numbers & strings
const num = (v) => {
  if (!Number.isFinite(v)) return "0";
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? "0" : String(r);
};
const nums = (...a) => a.map(num).join(" ");
const hex2 = (n) => n.toString(16).padStart(2, "0").toUpperCase();
const hex4 = (n) => n.toString(16).padStart(4, "0").toUpperCase();
const pdfName = (s) => String(s).replace(/[^A-Za-z0-9_.+-]/g, (c) => `#${hex2(c.charCodeAt(0))}`);
// Text string for the document information dictionary: UTF-16BE with BOM.
function textString(s) {
  let out = "<FEFF";
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) { const v = cp - 0x10000; out += hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff)); } else out += hex4(cp);
  }
  return `${out}>`;
}

// ---------------------------------------------------------------- fonts
// Helvetica / Helvetica-Bold advance widths (AFM, 1/1000 em) for 32…126.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// WinAnsiEncoding 128…159 (Unicode → code).
const WIN_HIGH = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
// Widths (regular, bold) of the WinAnsi characters above 126 that differ from their base letter.
const HIGH_W = { 0x80: [556, 556], 0x82: [222, 278], 0x83: [556, 556], 0x84: [333, 500], 0x85: [1000, 1000], 0x86: [556, 556], 0x87: [556, 556], 0x88: [333, 333], 0x89: [1000, 1000], 0x8b: [333, 333], 0x8c: [1000, 1000],
  0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500], 0x94: [333, 500], 0x95: [350, 350], 0x96: [556, 556], 0x97: [1000, 1000], 0x98: [333, 333], 0x99: [1000, 1000], 0x9b: [333, 333], 0x9c: [944, 944],
  0xa0: [278, 278], 0xa1: [333, 333], 0xa2: [556, 556], 0xa3: [556, 556], 0xa4: [556, 556], 0xa5: [556, 556], 0xa6: [260, 280], 0xa7: [556, 556], 0xa8: [333, 333], 0xa9: [737, 737], 0xaa: [370, 370], 0xab: [556, 556],
  0xac: [584, 584], 0xad: [333, 333], 0xae: [737, 737], 0xaf: [333, 333], 0xb0: [400, 400], 0xb1: [584, 584], 0xb2: [333, 333], 0xb3: [333, 333], 0xb4: [333, 333], 0xb5: [556, 611], 0xb6: [537, 556], 0xb7: [278, 278],
  0xb8: [333, 333], 0xb9: [333, 333], 0xba: [365, 365], 0xbb: [556, 556], 0xbc: [834, 834], 0xbd: [834, 834], 0xbe: [834, 834], 0xbf: [611, 611], 0xc6: [1000, 1000], 0xd0: [722, 722], 0xd7: [584, 584], 0xd8: [778, 778],
  0xde: [667, 667], 0xdf: [611, 611], 0xe6: [889, 889], 0xf0: [556, 611], 0xf7: [584, 584], 0xf8: [611, 611], 0xfe: [556, 611] };
// Characters neither font has, mapped to a close one.
const SUBST = { 0x2212: "-", 0x2010: "-", 0x2011: "-", 0x2300: "Ø", 0x2009: " ", 0x200a: " ", 0x202f: " ", 0x2007: " ", 0x00a0: " " };

// Unicode code point → WinAnsi byte, or -1.
function winAnsi(cp) {
  if (cp >= 32 && cp <= 126) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  return WIN_HIGH[cp] ?? -1;
}

function latinWidth(code, bold) {
  if (code <= 126) return (bold ? HELV_BOLD : HELV)[code - 32];
  const w = HIGH_W[code];
  if (w) return w[bold ? 1 : 0];
  const base = String.fromCharCode(code).normalize("NFD").charCodeAt(0);
  return base >= 32 && base <= 126 ? (bold ? HELV_BOLD : HELV)[base - 32] : 556;
}

// Text → runs [{font: "latin" | "cjk", codes: [...] , width (em)}].
export function textRuns(s, bold = false) {
  const runs = [];
  let cur = null;
  for (let ch of String(s)) {
    let cp = ch.codePointAt(0);
    if (cp < 32) continue;
    if (SUBST[cp] && winAnsi(cp) < 0) { ch = SUBST[cp]; cp = ch.codePointAt(0); }
    const w = winAnsi(cp);
    const font = w >= 0 ? "latin" : "cjk";
    if (font === "cjk" && cp > 0xffff) { cp = 0x25a1; } // outside UCS-2: a white square
    if (!cur || cur.font !== font) { cur = { font, codes: [], width: 0 }; runs.push(cur); }
    if (font === "latin") { cur.codes.push(w); cur.width += latinWidth(w, bold) / 1000; } else { cur.codes.push(cp); cur.width += CJK_WIDTH / 1000; }
  }
  return runs;
}

export function textWidth(s, size, bold = false) {
  return textRuns(s, bold).reduce((a, r) => a + r.width, 0) * size;
}

// ---------------------------------------------------------------- deflate
async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate");
    const out = new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(await out);
  } catch { return null; }
}
async function inflate(bytes) {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const ds = new DecompressionStream("deflate");
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  } catch { return null; }
}

// ---------------------------------------------------------------- matrices
const IDENTITY = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const isIdentity = (m) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

// ---------------------------------------------------------------- SVG styles
const INHERITED = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "fill-rule", "clip-rule",
  "fill-opacity", "stroke-opacity", "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline", "visibility", "color"];
const OWN = ["opacity", "display", "clip-path", "alignment-baseline", "dominant-baseline"];

function decls(s) {
  const out = {};
  for (const d of String(s || "").split(";")) {
    const k = d.indexOf(":");
    if (k > 0) out[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).replace(/!important/i, "").trim();
  }
  return out;
}
function styleOf(el, parent) {
  const st = { ...parent };
  delete st.opacity; delete st.display; delete st["clip-path"]; delete st["alignment-baseline"];
  const own = { ...el.attrs, ...decls(el.attrs.style) };
  for (const k of [...INHERITED, ...OWN]) if (own[k] !== undefined && own[k] !== "inherit") st[k] = String(own[k]).trim();
  return st;
}
const local = (name) => String(name).replace(/^svg:/, "");
const numbers = (s) => (String(s ?? "").match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
function len(v, ref = 0) {
  const s = String(v ?? "").trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  if (s.endsWith("%")) return (n * ref) / 100;
  if (s.endsWith("mm")) return (n * 96) / 25.4;
  if (s.endsWith("cm")) return (n * 96) / 2.54;
  if (s.endsWith("in")) return n * 96;
  if (s.endsWith("pt")) return (n * 4) / 3;
  if (s.endsWith("pc")) return n * 16;
  return n;
}

// ---------------------------------------------------------------- page painter
class Painter {
  constructor(doc, ids, vb) {
    this.doc = doc;
    this.ids = ids;
    this.vb = vb;
    this.ops = [];
    this.gs = { fill: null, stroke: null, lw: null, cap: null, join: null, ml: null, dash: null, alpha: null };
    this.stack = [];
    this.images = [];
  }
  op(s) { this.ops.push(s); }
  save() { this.op("q"); this.stack.push({ ...this.gs }); }
  restore() { this.op("Q"); this.gs = this.stack.pop() || this.gs; }
  setFill(c) { const k = c.join(","); if (this.gs.fill !== k) { this.op(`${nums(...c)} rg`); this.gs.fill = k; } }
  setStroke(c) { const k = c.join(","); if (this.gs.stroke !== k) { this.op(`${nums(...c)} RG`); this.gs.stroke = k; } }
  setAlpha(fa, sa) {
    const k = `${num(fa)}/${num(sa)}`;
    if (this.gs.alpha === k) return;
    if (this.gs.alpha === null && fa === 1 && sa === 1) { this.gs.alpha = k; return; }
    this.op(`/${this.doc.extGState(fa, sa)} gs`);
    this.gs.alpha = k;
  }
  set(key, value, text) { if (this.gs[key] !== value) { this.op(text); this.gs[key] = value; } }

  // Geometry of a shape element as PDF path operators (local coordinates,
  // mapped through m — identity unless building a clip path).
  shapePath(el, m = IDENTITY) {
    const name = local(el.name);
    const a = (k, ref = 0) => { const v = len(el.attrs[k], ref); return Number.isFinite(v) ? v : 0; };
    const out = [];
    const P = (x, y) => nums(...apply(m, x, y));
    const W = this.vb[2], H = this.vb[3];
    const ellipse = (cx, cy, rx, ry) => {
      if (!(rx > 0 && ry > 0)) return;
      const kx = rx * K, ky = ry * K;
      out.push(`${P(cx + rx, cy)} m`,
        `${P(cx + rx, cy + ky)} ${P(cx + kx, cy + ry)} ${P(cx, cy + ry)} c`,
        `${P(cx - kx, cy + ry)} ${P(cx - rx, cy + ky)} ${P(cx - rx, cy)} c`,
        `${P(cx - rx, cy - ky)} ${P(cx - kx, cy - ry)} ${P(cx, cy - ry)} c`,
        `${P(cx + kx, cy - ry)} ${P(cx + rx, cy - ky)} ${P(cx + rx, cy)} c`, "h");
    };
    switch (name) {
      case "path":
        for (const sp of parsePathData(el.attrs.d)) {
          out.push(`${P(...sp.start)} m`);
          for (const s of sp.segs) out.push(s.c1 ? `${P(...s.c1)} ${P(...s.c2)} ${P(...s.p)} c` : `${P(...s.p)} l`);
          if (sp.closed) out.push("h");
        }
        break;
      case "rect": {
        const x = a("x", W), y = a("y", H), w = a("width", W), h = a("height", H);
        if (!(w > 0 && h > 0)) break;
        let rx = len(el.attrs.rx, W), ry = len(el.attrs.ry, H);
        if (!Number.isFinite(rx)) rx = Number.isFinite(ry) ? ry : 0;
        if (!Number.isFinite(ry)) ry = rx;
        rx = Math.min(Math.max(0, rx), w / 2); ry = Math.min(Math.max(0, ry), h / 2);
        if (rx > 0 && ry > 0) {
          const kx = rx * K, ky = ry * K;
          out.push(`${P(x + rx, y)} m`, `${P(x + w - rx, y)} l`, `${P(x + w - rx + kx, y)} ${P(x + w, y + ry - ky)} ${P(x + w, y + ry)} c`,
            `${P(x + w, y + h - ry)} l`, `${P(x + w, y + h - ry + ky)} ${P(x + w - rx + kx, y + h)} ${P(x + w - rx, y + h)} c`,
            `${P(x + rx, y + h)} l`, `${P(x + rx - kx, y + h)} ${P(x, y + h - ry + ky)} ${P(x, y + h - ry)} c`,
            `${P(x, y + ry)} l`, `${P(x, y + ry - ky)} ${P(x + rx - kx, y)} ${P(x + rx, y)} c`, "h");
        } else if (isIdentity(m)) out.push(`${nums(x, y, w, h)} re`);
        else out.push(`${P(x, y)} m`, `${P(x + w, y)} l`, `${P(x + w, y + h)} l`, `${P(x, y + h)} l`, "h");
        break;
      }
      case "circle": ellipse(a("cx", W), a("cy", H), a("r", Math.hypot(W, H) / Math.SQRT2), a("r", Math.hypot(W, H) / Math.SQRT2)); break;
      case "ellipse": ellipse(a("cx", W), a("cy", H), a("rx", W), a("ry", H)); break;
      case "line": out.push(`${P(a("x1", W), a("y1", H))} m`, `${P(a("x2", W), a("y2", H))} l`); break;
      case "polyline": case "polygon": {
        const v = numbers(el.attrs.points);
        if (v.length < 4) break;
        out.push(`${P(v[0], v[1])} m`);
        for (let i = 2; i + 1 < v.length; i += 2) out.push(`${P(v[i], v[i + 1])} l`);
        if (name === "polygon") out.push("h");
        break;
      }
    }
    return out;
  }

  paint(el, st, alpha) {
    const path = this.shapePath(el);
    if (!path.length) return;
    const fill = parseColor(st.fill ?? "black", st.color);
    const stroke = parseColor(st.stroke ?? "none", st.color);
    const doFill = fill && local(el.name) !== "line";
    const sw = len(st["stroke-width"] ?? 1, Math.hypot(this.vb[2], this.vb[3]) / Math.SQRT2);
    const doStroke = stroke && sw > 0;
    if (!doFill && !doStroke) return;
    const fo = clamp01(parseFloat(st["fill-opacity"] ?? 1)) * alpha, so = clamp01(parseFloat(st["stroke-opacity"] ?? 1)) * alpha;
    this.setAlpha(doFill ? fo : 1, doStroke ? so : 1);
    if (doFill) this.setFill(rgb(fill));
    if (doStroke) {
      this.setStroke(rgb(stroke));
      this.set("lw", num(sw), `${num(sw)} w`);
      const cap = { butt: 0, round: 1, square: 2 }[st["stroke-linecap"]] ?? 0;
      const join = { miter: 0, round: 1, bevel: 2 }[st["stroke-linejoin"]] ?? 0;
      this.set("cap", cap, `${cap} J`);
      this.set("join", join, `${join} j`);
      const ml = parseFloat(st["stroke-miterlimit"] ?? 4);
      this.set("ml", ml, `${num(Math.max(1, ml || 4))} M`);
      let dash = String(st["stroke-dasharray"] ?? "none").trim() === "none" ? [] : numbers(st["stroke-dasharray"]).map((d) => Math.max(0, d));
      if (dash.length % 2) dash = [...dash, ...dash];
      if (dash.length && dash.every((d) => d === 0)) dash = [];
      const off = parseFloat(st["stroke-dashoffset"] ?? 0) || 0;
      const dk = `${dash.join(",")}@${off}`;
      this.set("dash", dk, `[${dash.map(num).join(" ")}] ${num(off)} d`);
    }
    for (const p of path) this.op(p);
    const eo = st["fill-rule"] === "evenodd";
    this.op(doFill && doStroke ? (eo ? "B*" : "B") : doFill ? (eo ? "f*" : "f") : "S");
  }

  // Clip to a <clipPath> (by "url(#id)"); returns false when it clips everything away.
  clip(ref, el) {
    const id = (/url\(\s*['"]?#([^'")\s]+)/.exec(ref) || [])[1];
    const cp = id && this.ids.get(id);
    if (!cp) return true;
    const base = cp.attrs.transform ? parseTransform(cp.attrs.transform) : IDENTITY;
    const ops = [];
    let evenodd = false;
    const add = (node, m) => {
      for (const c of node.children || []) {
        if (c.text !== undefined) continue;
        const nm = local(c.name);
        const cm = c.attrs.transform ? mul(m, parseTransform(c.attrs.transform)) : m;
        if (nm === "use") {
          const t = this.ids.get(String(c.attrs.href || c.attrs["xlink:href"] || "").replace(/^#/, ""));
          if (t) add({ children: [t] }, mul(cm, [1, 0, 0, 1, parseFloat(c.attrs.x) || 0, parseFloat(c.attrs.y) || 0]));
          continue;
        }
        if ((c.attrs["clip-rule"] || decls(c.attrs.style)["clip-rule"]) === "evenodd") evenodd = true;
        ops.push(...this.shapePath(c, cm));
      }
    };
    add(cp, base);
    if (!ops.length) return false;
    for (const o of ops) this.op(o);
    this.op(evenodd ? "W* n" : "W n");
    return true;
  }

  walk(el, st, alpha, depth = 0) {
    if (el.text !== undefined || depth > 64) return;
    const name = local(el.name);
    if (["defs", "clipPath", "mask", "pattern", "marker", "symbol", "style", "title", "desc", "metadata", "script", "linearGradient", "radialGradient", "filter", "foreignObject"].includes(name) || name.includes(":")) return;
    const s = styleOf(el, st);
    if (s.display === "none") return;
    const a = alpha * clamp01(parseFloat(s.opacity ?? 1));
    if (!(a > 0)) return;
    const tf = el.attrs.transform ? parseTransform(el.attrs.transform) : null;
    const clipRef = s["clip-path"] && s["clip-path"] !== "none" ? s["clip-path"] : null;
    let extra = null; // x/y of <use> and nested <svg>
    if (name === "use") extra = [1, 0, 0, 1, len(el.attrs.x) || 0, len(el.attrs.y) || 0];
    if (name === "svg") {
      extra = [1, 0, 0, 1, len(el.attrs.x) || 0, len(el.attrs.y) || 0];
      const vb = numbers(el.attrs.viewBox);
      const w = len(el.attrs.width), h = len(el.attrs.height);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0) extra = mul(extra, [w / vb[2], 0, 0, h / vb[3], -vb[0] * (w / vb[2]), -vb[1] * (h / vb[3])]);
    }
    const scoped = tf || clipRef || extra;
    if (scoped) {
      this.save();
      if (tf && !isIdentity(tf)) this.op(`${nums(...tf)} cm`);
      if (clipRef && !this.clip(clipRef, el)) { this.restore(); return; }
      if (extra && !isIdentity(extra)) this.op(`${nums(...extra)} cm`);
    }
    const hidden = s.visibility === "hidden" || s.visibility === "collapse";
    switch (name) {
      case "g": case "a": case "svg": case "switch":
        for (const c of el.children) this.walk(c, s, a, depth + 1);
        break;
      case "use": {
        const t = this.ids.get(String(el.attrs.href || el.attrs["xlink:href"] || "").replace(/^#/, ""));
        if (t) this.walk(local(t.name) === "symbol" ? { ...t, name: "g" } : t, s, a, depth + 1);
        break;
      }
      case "text": if (!hidden) this.text(el, s, a); break;
      case "image": if (!hidden) this.image(el, s, a); break;
      default: if (!hidden) this.paint(el, s, a);
    }
    if (scoped) this.restore();
  }

  text(el, st, alpha) {
    const first = (v) => { const n = numbers(v); return n.length ? n[0] : undefined; };
    const size = (s) => { const v = len(s["font-size"] ?? 16, 16); return v > 0 ? v : 16; };
    const bold = (s) => /bold|[6-9]00/.test(String(s["font-weight"] || ""));
    // Text nodes and <tspan> moves in document order.
    const items = [];
    const visit = (node, s) => {
      for (const c of node.children) {
        if (c.text !== undefined) { items.push({ s, text: c.text }); continue; }
        const nm = local(c.name);
        if (nm !== "tspan" && nm !== "a" && nm !== "textPath") continue;
        const cs = styleOf(c, s);
        if (cs.display === "none") continue;
        items.push({ move: { x: first(c.attrs.x), y: first(c.attrs.y), dx: first(c.attrs.dx), dy: first(c.attrs.dy) } });
        visit(c, cs);
      }
    };
    visit(el, st);
    // Runs laid out from the pen; an absolute x or y starts a new anchored group.
    const groups = [];
    let g = null;
    let px = (first(el.attrs.x) ?? 0) + (first(el.attrs.dx) ?? 0), py = (first(el.attrs.y) ?? 0) + (first(el.attrs.dy) ?? 0);
    for (const it of items) {
      if (it.move) {
        const m = it.move;
        if (m.x !== undefined) { px = m.x; g = null; }
        if (m.y !== undefined) { py = m.y; g = null; }
        px += m.dx ?? 0; py += m.dy ?? 0;
        continue;
      }
      const text = it.text.replace(/\s+/g, " ");
      if (!text) continue;
      if (!g) { g = { runs: [] }; groups.push(g); }
      g.runs.push({ s: it.s, text, x: px, y: py });
      px += textWidth(text, size(it.s), bold(it.s));
    }
    const baseShift = (s) => ({ central: 0.35, middle: 0.35, hanging: 0.78, "text-before-edge": 0.88, "before-edge": 0.88, "text-top": 0.88, mathematical: 0.35, "text-after-edge": -0.21, "after-edge": -0.21, "text-bottom": -0.21, ideographic: -0.12 }[String(s["dominant-baseline"] || s["alignment-baseline"] || "").trim()] || 0);
    let open = false;
    for (const grp of groups) {
      const runs = grp.runs;
      runs[0].text = runs[0].text.replace(/^ /, "");
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/ $/, "");
      // Re-lay the trimmed runs and anchor the group as a whole.
      let x = runs[0].x;
      for (const r of runs) { r.x = x; x += textWidth(r.text, size(r.s), bold(r.s)); }
      const width = x - runs[0].x;
      const anchor = String(st["text-anchor"] || runs[0].s["text-anchor"] || "start").trim();
      const shift = anchor === "middle" ? -width / 2 : anchor === "end" ? -width : 0;
      for (const r of runs) {
        if (!r.text) continue;
        const s = r.s, fs = size(s), b = bold(s);
        const fill = parseColor(s.fill ?? "black", s.color);
        if (!fill) continue;
        if (!open) { this.op("BT"); open = true; }
        this.setAlpha(clamp01(parseFloat(s["fill-opacity"] ?? 1)) * alpha, b ? alpha : 1);
        this.setFill(rgb(fill));
        this.op(`1 0 0 -1 ${nums(r.x + shift, r.y + baseShift(s) * fs)} Tm`);
        for (const run of textRuns(r.text, b)) {
          if (run.font === "latin") {
            const f = b ? "F2" : "F1";
            this.op(`/${f} ${num(fs)} Tf <${run.codes.map(hex2).join("")}> Tj`);
            this.doc.useFont(f);
          } else {
            // Korean / CJK: one CID font; bold is drawn with a thin outline.
            if (b) { this.setStroke(rgb(fill)); this.op(`2 Tr ${num(fs * 0.03)} w`); this.gs.lw = null; }
            this.op(`/F3 ${num(fs)} Tf <${run.codes.map(hex4).join("")}> Tj`);
            if (b) this.op("0 Tr");
            this.doc.useFont("F3");
          }
        }
      }
    }
    if (open) this.op("ET");
  }

  image(el, st, alpha) {
    const href = String(el.attrs.href || el.attrs["xlink:href"] || "");
    const d = /^data:/i.test(href) ? (() => { try { return parseDataUri(href); } catch { return null; } })() : null;
    const info = d && imageInfo(d.bytes);
    if (!info || !(info.width > 0 && info.height > 0)) { this.doc.warn("Images that are not embedded JPEG or PNG data are left out of the PDF"); return; }
    let x = len(el.attrs.x) || 0, y = len(el.attrs.y) || 0, w = len(el.attrs.width), h = len(el.attrs.height);
    if (!(w > 0) && !(h > 0)) { w = info.width; h = info.height; } else if (!(w > 0)) w = (h * info.width) / info.height;
    else if (!(h > 0)) h = (w * info.height) / info.width;
    const par = String(el.attrs.preserveAspectRatio || "xMidYMid meet").trim().split(/\s+/);
    if (par[0] !== "none") {
      const s = par[1] === "slice" ? Math.max(w / info.width, h / info.height) : Math.min(w / info.width, h / info.height);
      const iw = info.width * s, ih = info.height * s;
      x += (w - iw) * (/xMid/.test(par[0]) ? 0.5 : /xMax/.test(par[0]) ? 1 : 0);
      y += (h - ih) * (/YMid/.test(par[0]) ? 0.5 : /YMax/.test(par[0]) ? 1 : 0);
      w = iw; h = ih;
    }
    const name = this.doc.image(d.bytes, info);
    if (!name) { this.doc.warn("Images that are not embedded JPEG or PNG data are left out of the PDF"); return; }
    this.save();
    this.setAlpha(alpha, alpha);
    this.op(`${nums(w, 0, 0, -h, x, y + h)} cm`);
    this.op(`/${name} Do`);
    this.restore();
  }
}
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);

// ---------------------------------------------------------------- document
class PdfDoc {
  constructor() {
    this.objs = [null]; // 1-based; [i] = {dict, stream?} | string
    this.fonts = new Set();
    this.gstates = new Map();
    this.xobjects = new Map(); // name → {id, ...}
    this.pendingImages = [];
    this.warnings = new Set();
  }
  warn(s) { this.warnings.add(s); }
  alloc() { this.objs.push(null); return this.objs.length - 1; }
  set(id, v) { this.objs[id] = v; }
  useFont(f) { this.fonts.add(f); }
  extGState(fa, sa) {
    const k = `${num(fa)}/${num(sa)}`;
    if (!this.gstates.has(k)) this.gstates.set(k, { name: `GS${this.gstates.size + 1}`, fa, sa });
    return this.gstates.get(k).name;
  }
  // An image XObject from JPEG / PNG bytes → its resource name, or null.
  image(bytes, info) {
    const key = `${bytes.length}:${bytes[bytes.length >> 1]}:${bytes[bytes.length - 1]}:${info.width}x${info.height}`;
    for (const [n, x] of this.xobjects) if (x.key === key) return n;
    const name = `Im${this.xobjects.size + 1}`;
    if (info.mime === "image/jpeg") {
      const comps = info.components || 3;
      const cs = comps === 1 ? "/DeviceGray" : comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";
      const id = this.alloc();
      this.set(id, { dict: `/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${comps === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""}`, stream: bytes });
      this.xobjects.set(name, { id, key });
      return name;
    }
    if (info.mime === "image/png") {
      const id = this.alloc();
      this.xobjects.set(name, { id, key });
      this.pendingImages.push({ id, bytes, info });
      return name;
    }
    return null;
  }
  // PNG → image XObject (+ SMask for alpha), resolved asynchronously.
  async finishPng({ id, bytes }) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 8, w = 0, h = 0, depth = 8, type = 2, interlace = 0, plte = null, trns = null;
    const idat = [];
    while (i + 8 <= bytes.length) {
      const n = dv.getUint32(i), kind = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
      const data = bytes.subarray(i + 8, i + 8 + n);
      if (kind === "IHDR") { w = dv.getUint32(i + 8); h = dv.getUint32(i + 12); depth = bytes[i + 16]; type = bytes[i + 17]; interlace = bytes[i + 20]; } else if (kind === "PLTE") plte = data;
      else if (kind === "tRNS") trns = data;
      else if (kind === "IDAT") idat.push(data);
      else if (kind === "IEND") break;
      i += 12 + n;
    }
    const z = concat(idat);
    const colors = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
    const fallback = () => this.set(id, { dict: `/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8`, stream: Uint8Array.of(255) });
    if (!colors || interlace) { this.warn("Interlaced PNG images are left out of the PDF"); return fallback(); }
    const csFor = (c) => (c === 1 ? "/DeviceGray" : "/DeviceRGB");
    if (type === 0 || type === 2 || type === 3) {
      const cs = type === 3 && plte ? `[/Indexed /DeviceRGB ${plte.length / 3 - 1} <${[...plte].map(hex2).join("")}>]` : csFor(colors);
      this.set(id, { dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent ${depth} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent ${depth} /Columns ${w} >>`, stream: z });
      if (trns && type === 3) this.warn("PNG transparency is shown opaque in the PDF");
      return;
    }
    // Grey + alpha / RGB + alpha (8-bit): unfilter, split the alpha into an SMask.
    const raw = await inflate(z);
    if (!raw || depth !== 8) { this.warn("PNG images with transparency need a browser with DecompressionStream"); return fallback(); }
    const bpp = colors, stride = w * bpp;
    const pix = new Uint8Array(h * stride);
    let prev = new Uint8Array(stride), p = 0;
    for (let r = 0; r < h; r++) {
      const f = raw[p++];
      const line = pix.subarray(r * stride, (r + 1) * stride);
      for (let k = 0; k < stride; k++) {
        const x = raw[p++], A = k >= bpp ? line[k - bpp] : 0, B = prev[k], C = k >= bpp ? prev[k - bpp] : 0;
        let v = x;
        if (f === 1) v = x + A; else if (f === 2) v = x + B; else if (f === 3) v = x + ((A + B) >> 1);
        else if (f === 4) { const q = A + B - C, pa = Math.abs(q - A), pb = Math.abs(q - B), pc = Math.abs(q - C); v = x + (pa <= pb && pa <= pc ? A : pb <= pc ? B : C); }
        line[k] = v & 255;
      }
      prev = line;
    }
    const nc = colors - 1;
    const col = new Uint8Array(w * h * nc), alpha = new Uint8Array(w * h);
    for (let q = 0, o = 0; q < w * h; q++) { for (let c = 0; c < nc; c++) col[o++] = pix[q * bpp + c]; alpha[q] = pix[q * bpp + nc]; }
    const sm = this.alloc();
    this.set(sm, { dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8`, stream: alpha, compress: true });
    this.set(id, { dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${csFor(nc)} /BitsPerComponent 8 /SMask ${sm} 0 R`, stream: col, compress: true });
  }
}

function concat(list) {
  const n = list.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const b of list) { out.set(b, o); o += b.length; }
  return out;
}

/**
 * SVG pages → PDF bytes.
 * pages: [{svg: string, width: mm, height: mm}] — each SVG is fitted to its
 * page through its viewBox (preserveAspectRatio as written, default meet).
 * opts: {title, author, subject, creator, compress = true}
 * Returns {bytes: Uint8Array, warnings: string[], pages: n}.
 */
export async function svgToPdf(pages, { title = "", author = "", subject = "", creator = "MyArchitecture", compress = true, date = new Date() } = {}) {
  if (!pages || !pages.length) throw new Error("No pages to write");
  const doc = new PdfDoc();
  const catalog = doc.alloc(), pagesId = doc.alloc(), info = doc.alloc(), resources = doc.alloc();
  const kids = [];
  for (const pg of pages) {
    const tree = parseXml(String(pg.svg));
    const svg = findSvg(tree);
    if (!svg) throw new Error("Not an SVG page");
    const ids = new Map();
    collect(svg, (el) => { if (el.attrs.id) ids.set(el.attrs.id, el); });
    const Wpt = pg.width * PT_PER_MM, Hpt = pg.height * PT_PER_MM;
    let vb = numbers(svg.attrs.viewBox);
    if (!(vb.length === 4 && vb[2] > 0 && vb[3] > 0)) {
      const w = len(svg.attrs.width), h = len(svg.attrs.height);
      vb = [0, 0, w > 0 ? w : (pg.width * 96) / 25.4, h > 0 ? h : (pg.height * 96) / 25.4];
    }
    // viewBox → page (points, y up).
    const par = String(svg.attrs.preserveAspectRatio || "xMidYMid meet").trim().split(/\s+/);
    let sx = Wpt / vb[2], sy = Hpt / vb[3], tx = 0, ty = 0;
    if (par[0] !== "none") {
      const s = par[1] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
      tx = (Wpt - vb[2] * s) * (/xMid/.test(par[0]) ? 0.5 : /xMax/.test(par[0]) ? 1 : 0);
      ty = (Hpt - vb[3] * s) * (/YMid/.test(par[0]) ? 0.5 : /YMax/.test(par[0]) ? 1 : 0);
      sx = sy = s;
    }
    const painter = new Painter(doc, ids, vb);
    painter.op(`${nums(sx, 0, 0, -sy, tx - vb[0] * sx, Hpt - ty + vb[1] * sy)} cm`);
    if (par[1] !== "slice") { painter.op(`${nums(vb[0], vb[1], vb[2], vb[3])} re W n`); }
    const base = { fill: "black", stroke: "none", "font-size": "16", "text-anchor": "start" };
    const st = styleOf(svg, base);
    for (const c of svg.children) painter.walk(c, st, clamp01(parseFloat(st.opacity ?? 1)));
    const content = doc.alloc();
    doc.set(content, { dict: "", stream: new TextEncoder().encode(painter.ops.join("\n")), compress: true });
    const page = doc.alloc();
    doc.set(page, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(Wpt)} ${num(Hpt)}] /Resources ${resources} 0 R /Contents ${content} 0 R >>`);
    kids.push(page);
  }
  for (const im of doc.pendingImages) await doc.finishPng(im);

  // Fonts.
  const fontRefs = [];
  const helv = (base) => `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`;
  doc.fonts.add("F1");
  for (const f of ["F1", "F2", "F3"]) {
    if (!doc.fonts.has(f)) continue;
    const id = doc.alloc();
    if (f === "F1") doc.set(id, helv("Helvetica"));
    else if (f === "F2") doc.set(id, helv("Helvetica-Bold"));
    else {
      const cid = doc.alloc(), fd = doc.alloc();
      doc.set(fd, "<< /Type /FontDescriptor /FontName /HYGoThic-Medium /Flags 4 /FontBBox [-6 -145 1003 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 59 >>");
      doc.set(cid, `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 1 >> /FontDescriptor ${fd} 0 R /DW ${CJK_WIDTH} >>`);
      doc.set(id, `<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium /Encoding /UniKS-UCS2-H /DescendantFonts [${cid} 0 R] >>`);
    }
    fontRefs.push(`/${f} ${id} 0 R`);
  }
  const gs = [...doc.gstates.values()].map((g) => `/${g.name} << /Type /ExtGState /ca ${num(g.fa)} /CA ${num(g.sa)} >>`);
  const xo = [...doc.xobjects].map(([n, x]) => `/${n} ${x.id} 0 R`);
  doc.set(resources, `<< /ProcSet [/PDF /Text${xo.length ? " /ImageB /ImageC /ImageI" : ""}] /Font << ${fontRefs.join(" ")} >>${gs.length ? ` /ExtGState << ${gs.join(" ")} >>` : ""}${xo.length ? ` /XObject << ${xo.join(" ")} >>` : ""} >>`);
  doc.set(pagesId, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  doc.set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R /PageLayout /SinglePage${title ? " /ViewerPreferences << /DisplayDocTitle true >>" : ""} >>`);
  const pad = (n) => String(n).padStart(2, "0");
  const d = `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  doc.set(info, `<< /Producer ${textString("MyArchitecture PDF writer")} /Creator ${textString(creator)}${title ? ` /Title ${textString(title)}` : ""}${author ? ` /Author ${textString(author)}` : ""}${subject ? ` /Subject ${textString(subject)}` : ""} /CreationDate (${d}) /ModDate (${d}) >>`);

  // Serialise with a cross-reference table.
  const enc = new TextEncoder();
  const chunks = [];
  let size = 0;
  const push = (b) => { const u = typeof b === "string" ? latin1(b) : b; chunks.push(u); size += u.length; };
  push("%PDF-1.4\n");
  push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));
  const offsets = [0];
  for (let id = 1; id < doc.objs.length; id++) {
    const o = doc.objs[id];
    offsets[id] = size;
    if (typeof o === "string") { push(`${id} 0 obj\n${o}\nendobj\n`); continue; }
    if (!o) { push(`${id} 0 obj\nnull\nendobj\n`); continue; }
    let data = o.stream;
    let filter = "";
    if (o.compress && compress) { const z = await deflate(data); if (z && z.length < data.length) { data = z; filter = " /Filter /FlateDecode"; } }
    push(`${id} 0 obj\n<< ${o.dict}${filter} /Length ${data.length} >>\nstream\n`);
    push(data);
    push("\nendstream\nendobj\n");
  }
  const xref = size;
  let table = `xref\n0 ${doc.objs.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < doc.objs.length; id++) table += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  const idHex = [...enc.encode(`${title}|${d}|${size}`)].reduce((h, b, i) => { h[i % 16] = (h[i % 16] * 31 + b + i) & 255; return h; }, new Array(16).fill(7)).map(hex2).join("");
  push(table);
  push(`trailer\n<< /Size ${doc.objs.length} /Root ${catalog} 0 R /Info ${info} 0 R /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${xref}\n%%EOF\n`);
  return { bytes: concat(chunks), warnings: [...doc.warnings], pages: kids.length };
}

function latin1(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}

function findSvg(node) {
  for (const c of node.children || []) {
    if (c.text !== undefined) continue;
    if (local(c.name) === "svg") return c;
    const f = findSvg(c);
    if (f) return f;
  }
  return null;
}
function collect(node, fn) {
  for (const c of node.children || []) {
    if (c.text !== undefined) continue;
    fn(c);
    collect(c, fn);
  }
}

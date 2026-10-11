// DXF exchange: import of ASCII and binary DXF (R12 … R2018, binary via
// dxfbin.js) into CAD layer geometry and export of a level's plan as AutoCAD
// R12 (AC1009), which every CAD program reads, or as AutoCAD 2000 … 2018
// (dxfmodern.js).
//
// Import walks the model space with a 2D affine matrix [a, b, c, d, e, f]
// (x' = a·x + c·y + e, y' = b·x + d·y + f) that maps an entity's own frame
// to plan coordinates: block inserts, the object coordinate system of the
// extrusion direction and the y flip (DXF is y-up, the plan is y-down) are
// all folded into it. Circles and arcs stay circles and arcs while the matrix
// is a similarity; anything skewed or unevenly scaled becomes a polyline.
// Geometry is gathered in drawing units first and scaled to millimetres once
// the unit is known (it may have to be guessed from the extent).
//
// Arcs follow canvas semantics in plan coordinates: ctx.arc(cx, cy, r,
// a1°, a2°, ccw). A DXF ARC runs counter-clockwise (y-up) from s to e, which
// after the flip is a1 = −s, a2 = −e, ccw = true.

import { uid, rotPt, toWorld, fmtLen, fmtArea, polygonCentroid } from "../core/geom.js";
import { exportElementsDxf, ELEMENT_DXF_LAYERS } from "./dxf-elements.js";
import { isCurtainWall } from "../core/elements/geometry.js";
import { openingTags, wallTypeOf } from "../core/project.js";
import { wallOutlines, wallPieces, openingSpans, wallFrame, wallPoint, wallUV } from "../core/walls.js";
import { roofModel, roofBase } from "../core/roof.js";
import { roomArea, roomLabelPoint } from "../core/rooms.js";
import { furnitureParts } from "../lib/furniture.js";
import { stairGeometry, dimensionGeometry } from "../plan/render.js";
import { isBinaryDxf, readBinaryDxf } from "./dxfbin.js";
import { proxyRecords, dxfProxyBytes, styleTags, mleaderRecords, tableGridRecords, imageGeometry, mlineRecords, acisRecords, dxfSatText, dxfAcdsBlobs, clipItems, clipLine, graphicsOffset } from "./cadextra.js";
import { ModernDxfWriter, LAYER_LINEWEIGHTS } from "./dxfmodern.js";
export { DXF_VERSIONS } from "./dxfmodern.js";

// ================================================================ colours

// AutoCAD Colour Index → "#rrggbb". 1–9 are the named colours, 10–249 are
// 24 hues × 5 brightness levels × (full, pale) saturation, 250–255 greys.
export const ACI_COLORS = (() => {
  const t = ["000000", "ff0000", "ffff00", "00ff00", "00ffff", "0000ff", "ff00ff", "ffffff", "808080", "c0c0c0"].map((h) => `#${h}`);
  const hex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  const V = [255, 189, 129, 104, 79];
  for (let i = 10; i < 250; i++) {
    const h = Math.floor((i - 10) / 10) * 15;
    const k = (i - 10) % 10;
    const v = V[k >> 1];
    const s = k & 1 ? 1 / 3 : 1;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    t[i] = `#${hex(r + m)}${hex(g + m)}${hex(b + m)}`;
  }
  for (const h of ["333333", "505050", "696969", "828282", "bebebe", "ffffff"]) t.push(`#${h}`);
  return t;
})();

// ACI 7 is "foreground" (white on black, black on white). Imported as the
// app's neutral drawing colour so it stays visible on either plan theme.
const FOREGROUND = "#9aa4b5";

export function aciToHex(i) {
  const n = Math.abs(Math.round(i));
  if (n === 7) return FOREGROUND;
  return n >= 1 && n <= 255 ? ACI_COLORS[n] : FOREGROUND;
}

export function hexToAci(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return 7;
  const h = m[1].toLowerCase();
  if (h === FOREGROUND.slice(1) || h === "ffffff" || h === "000000") return 7;
  const n = parseInt(h, 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  let best = 7, bestD = Infinity;
  for (let i = 1; i < 256; i++) {
    const q = parseInt(ACI_COLORS[i].slice(1), 16);
    const d = (r - (q >> 16)) ** 2 + (g - ((q >> 8) & 255)) ** 2 + (b - (q & 255)) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ================================================================ units

const INSUNITS = { 1: "in", 2: "ft", 3: "mi", 4: "mm", 5: "cm", 6: "m", 7: "km", 8: "µin", 9: "mil", 10: "yd", 11: "Å", 12: "nm", 13: "µm", 14: "dm", 15: "dam", 16: "hm", 17: "Gm" };
const UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, mi: 1609344, km: 1e6, "µin": 25.4e-6, mil: 0.0254, yd: 914.4, "Å": 1e-7, nm: 1e-6, "µm": 1e-3, dm: 100, dam: 1e4, hm: 1e5, Gm: 1e12 };

// Unitless drawings: a building is a few to a few hundred metres, so the
// larger side of the extent tells the unit apart in most cases.
//   extent < 300 → metres, < 3000 → centimetres, otherwise millimetres.
export function guessUnits(extent) {
  if (!(extent > 0)) return "mm";
  if (extent < 300) return "m";
  if (extent < 3000) return "cm";
  return "mm";
}

// ================================================================ 2D matrices

const DEG = Math.PI / 180;
const norm360 = (a) => ((a % 360) + 360) % 360;
const clean = (v, q = 1e9) => Math.round(v * q) / q + 0;

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const applyVec = (m, x, y) => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
const det = (m) => m[0] * m[3] - m[1] * m[2];
const translation = (x, y) => [1, 0, 0, 1, x, y];
const scaling = (sx, sy) => [sx, 0, 0, sy, 0, 0];
function rotation(a) {
  const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
  return [c, s, -s, c, 0, 0];
}
function isSimilarity(m) {
  const a = Math.hypot(m[0], m[1]), b = Math.hypot(m[2], m[3]);
  if (!(a > 0 && b > 0)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(a, b) * 1e3 && Math.abs(m[0] * m[2] + m[1] * m[3]) <= 1e-6 * a * b;
}

// Object coordinate system of an extrusion direction (AutoCAD's arbitrary
// axis algorithm), projected onto the world XY plane. null = identity.
function ocsMatrix(nx, ny, nz, z = 0) {
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 0)) return null;
  nx /= len; ny /= len; nz /= len;
  if (Math.abs(nx) < 1e-12 && Math.abs(ny) < 1e-12 && nz > 0) return null;
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n = [nx, ny, nz];
  let ax = Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64 ? cross([0, 1, 0], n) : cross([0, 0, 1], n);
  const l = Math.hypot(...ax);
  ax = ax.map((v) => v / l);
  const ay = cross(n, ax);
  return [ax[0], ax[1], ay[0], ay[1], z * nx, z * ny];
}

// ================================================================ tokenizer

const DECODER_LABELS = { 874: "windows-874", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5", 1250: "windows-1250", 1251: "windows-1251", 1252: "windows-1252", 1253: "windows-1253", 1254: "windows-1254", 1255: "windows-1255", 1256: "windows-1256", 1257: "windows-1257", 1258: "windows-1258" };

// Bytes → text: DXF 2007+ is UTF-8; older files use $DWGCODEPAGE.
function decodeBytes(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    const probe = new TextDecoder("latin1").decode(bytes.subarray(0, 64 * 1024));
    const m = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d+)/i.exec(probe);
    // No code page and not UTF-8: Korean (CP949) like the rest of the app's text files.
    const label = (m && DECODER_LABELS[m[1]]) || "euc-kr";
    try { return new TextDecoder(label).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
  }
}

// Text → [[code, value]] pairs.
function tokenize(input) {
  let text = input;
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (bytes && isBinaryDxf(bytes)) {
    const pairs = readBinaryDxf(bytes);
    if (!pairs.some(([c, v]) => c === 0 && v === "SECTION")) throw new Error("Not a DXF file: no SECTION found");
    return pairs;
  }
  if (bytes) text = decodeBytes(bytes);
  text = String(text ?? "");
  // A binary DXF already decoded as text has lost its bytes.
  if (text.startsWith("AutoCAD Binary DXF")) throw new Error("Binary DXF must be read as bytes (pass the file's ArrayBuffer / Uint8Array)");
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i].trim();
    if (c === "" && i + 2 >= lines.length) break;
    const code = Number(c);
    if (!Number.isInteger(code)) throw new Error(`Not a DXF file: bad group code "${c.slice(0, 24)}" on line ${i + 1}`);
    pairs.push([code, lines[i + 1]]);
  }
  if (!pairs.some(([c, v]) => c === 0 && v.trim() === "SECTION")) throw new Error("Not a DXF file: no SECTION found");
  return pairs;
}

// Pairs → {HEADER: [...], TABLES: [...], ...} (each the pairs inside the section).
function splitSections(pairs) {
  const out = {};
  let cur = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, raw] = pairs[i];
    const v = raw.trim();
    if (c === 0 && v === "SECTION") {
      const name = pairs[i + 1] && pairs[i + 1][0] === 2 ? pairs[i + 1][1].trim().toUpperCase() : "";
      cur = out[name] = [];
      i++;
    } else if (c === 0 && v === "ENDSEC") cur = null;
    else if (c === 0 && v === "EOF") break;
    else if (cur) cur.push(pairs[i]);
  }
  return out;
}

// Section pairs → records {type, tags} split at group code 0.
function toRecords(pairs = []) {
  const recs = [];
  let cur = null;
  for (const [c, v] of pairs) {
    if (c === 0) { cur = { type: v.trim().toUpperCase(), tags: [] }; recs.push(cur); } else if (cur) cur.tags.push([c, v]);
  }
  return recs;
}

// Attach VERTEX records to their POLYLINE and ATTRIB records to their INSERT.
function nest(recs) {
  const out = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.type === "POLYLINE") {
      r.vertices = [];
      while (recs[i + 1] && recs[i + 1].type === "VERTEX") r.vertices.push(recs[++i]);
      if (recs[i + 1] && recs[i + 1].type === "SEQEND") i++;
    } else if (r.type === "INSERT") {
      r.attribs = [];
      while (recs[i + 1] && recs[i + 1].type === "ATTRIB") r.attribs.push(recs[++i]);
      if (recs[i + 1] && recs[i + 1].type === "SEQEND" && (r.attribs.length || intOf(r, 66) === 1)) i++;
    } else if (r.type === "SEQEND" || r.type === "VERTEX") continue;
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------- tag access
function raw(r, code) {
  for (const t of r.tags) if (t[0] === code) return t[1];
  return undefined;
}
function numOf(r, code, d = 0) {
  const v = raw(r, code);
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
}
function intOf(r, code, d = 0) {
  return Math.trunc(numOf(r, code, d));
}
function strOf(r, code, d = "") {
  const v = raw(r, code);
  return v === undefined ? d : v.trim();
}
// Repeated point pairs (codes xc / xc+10) in order.
function pointsOf(r, xc) {
  const pts = [];
  for (const [c, v] of r.tags) {
    if (c === xc) pts.push([parseFloat(v) || 0, 0]);
    else if (c === xc + 10 && pts.length) pts[pts.length - 1][1] = parseFloat(v) || 0;
  }
  return pts;
}

// ================================================================ text decoding

const SPECIAL = { c: "⌀", d: "°", p: "±", "%": "%", u: "", o: "", k: "" };
const MBCS = { 1: "shift_jis", 2: "big5", 3: "euc-kr", 4: "euc-kr", 5: "gbk" };

function decodeMbcs(n, hex) {
  try {
    const v = parseInt(hex, 16);
    return new TextDecoder(MBCS[n] || "utf-8").decode(new Uint8Array([v >> 8, v & 255]));
  } catch {
    return "?";
  }
}

// \U+XXXX, \M+nXXXX and %% control codes (TEXT, ATTRIB, MTEXT, layer names).
export function decodeDxfText(s) {
  return String(s)
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\M\+([1-5])([0-9a-fA-F]{4})/g, (_, n, h) => decodeMbcs(n, h))
    .replace(/%%(\d{3})/g, (_, d) => String.fromCharCode(+d))
    .replace(/%%([cdpuok%])/gi, (_, c) => SPECIAL[c.toLowerCase()]);
}

// MTEXT inline formatting → plain text with "\n" line breaks.
export function stripMtext(s) {
  let out = "";
  const src = String(s);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{" || ch === "}") continue;
    if (ch === "^" && i + 1 < src.length) {
      const n = src[i + 1];
      if (n === "I") { out += " "; i++; continue; }
      if (n === "J") { out += "\n"; i++; continue; }
      if (n === "M") { i++; continue; }
      if (n === " ") { out += "^"; i++; continue; }
    }
    if (ch !== "\\" || i + 1 >= src.length) { out += ch; continue; }
    const c = src[++i];
    const untilSemi = () => { const j = src.indexOf(";", i); const body = j < 0 ? src.slice(i + 1) : src.slice(i + 1, j); i = j < 0 ? src.length : j; return body; };
    switch (c) {
      case "P": case "N": out += "\n"; break;
      case "~": out += " "; break;
      case "\\": case "{": case "}": out += c; break;
      case "U":
        if (/^\+[0-9a-fA-F]{4}/.test(src.slice(i + 1, i + 6))) { out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 5; } else out += c;
        break;
      case "M":
        if (/^\+[1-5][0-9a-fA-F]{4}/.test(src.slice(i + 1, i + 7))) { out += decodeMbcs(src[i + 2], src.slice(i + 3, i + 7)); i += 6; } else out += c;
        break;
      case "S": out += untilSemi().replace(/[\^#]/g, "/").replace(/\/ /g, "/"); break;
      case "f": case "F": case "H": case "W": case "Q": case "T": case "A": case "C": case "c": case "p":
        untilSemi();
        break;
      case "L": case "l": case "O": case "o": case "K": case "k": case "X":
        break;
      default: out += c;
    }
  }
  return decodeDxfText(out);
}

// ================================================================ curves

// Points of a circular arc in its own frame: start angle a0, signed sweep (rad).
function arcPoints(cx, cy, r, a0, sweep, include0 = true) {
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (5 * DEG)));
  const pts = [];
  for (let i = include0 ? 0 : 1; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// Points of an elliptical arc: centre c, major axis vector maj, minor vector mi.
function ellipsePoints(c, maj, mi, t0, sweep) {
  const n = Math.max(8, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 96));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (sweep * i) / n;
    const ct = Math.cos(t), st = Math.sin(t);
    pts.push([c[0] + maj[0] * ct + mi[0] * st, c[1] + maj[1] * ct + mi[1] * st]);
  }
  return pts;
}

// Vertices [{x, y, b}] with bulges → points (arcs flattened). A bulge is
// tan(θ/4) of the included angle θ, positive counter-clockwise.
function bulgePath(verts, closed) {
  const n = verts.length;
  if (!n) return [];
  const out = [[verts[0].x, verts[0].y]];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    if (a.b && Math.abs(a.b) > 1e-9) {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.hypot(dx, dy) > 0) {
        const k = (1 - a.b * a.b) / (4 * a.b);
        const cx = (a.x + b.x) / 2 - dy * k, cy = (a.y + b.y) / 2 + dx * k;
        const r = Math.hypot(a.x - cx, a.y - cy);
        const sweep = 4 * Math.atan(a.b);
        const pts = arcPoints(cx, cy, r, Math.atan2(a.y - cy, a.x - cx), sweep, false);
        pts[pts.length - 1] = [b.x, b.y];
        out.push(...pts);
        continue;
      }
    }
    out.push([b.x, b.y]);
  }
  if (closed && out.length > 1) out.pop(); // the closing vertex repeats the first
  return out;
}

// Rational B-spline (de Boor) sampled over its whole knot domain.
function bspline(degree, ctrl, knots, weights) {
  const n = ctrl.length;
  const p = Math.max(1, Math.min(degree, n - 1));
  let t = knots;
  if (!t || t.length !== n + p + 1 || t.some((v, i) => i && v < t[i - 1])) {
    // Clamped uniform knot vector.
    t = [];
    for (let i = 0; i < n + p + 1; i++) t.push(i <= p ? 0 : i >= n ? n - p : i - p);
  }
  const w = weights && weights.length === n ? weights : null;
  const H = ctrl.map(([x, y], i) => { const wi = w ? w[i] || 1 : 1; return [x * wi, y * wi, wi]; });
  const point = (k, u) => {
    const d = [];
    for (let j = 0; j <= p; j++) d.push(H[j + k - p].slice());
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const den = t[j + 1 + k - r] - t[j + k - p];
        const al = den > 0 ? (u - t[j + k - p]) / den : 0;
        for (let q = 0; q < 3; q++) d[j][q] = (1 - al) * d[j - 1][q] + al * d[j][q];
      }
    }
    const [x, y, ww] = d[p];
    return [x / (ww || 1), y / (ww || 1)];
  };
  const per = p === 1 ? 1 : 24;
  const pts = [];
  for (let k = p; k < n; k++) {
    if (!(t[k + 1] > t[k])) continue;
    for (let i = pts.length ? 1 : 0; i <= per; i++) pts.push(point(k, t[k] + ((t[k + 1] - t[k]) * i) / per));
  }
  return pts;
}

// Catmull-Rom through fit points (splines that carry no control points).
function catmullRom(pts, closed) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out = [pts[0]];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 1; k <= 8; k++) {
      const s = k / 8, s2 = s * s, s3 = s2 * s;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (closed) out.pop();
  return out;
}

function dedupe(pts, eps = 1e-9) {
  const out = [];
  for (const q of pts) {
    const l = out[out.length - 1];
    if (!l || Math.abs(l[0] - q[0]) > eps || Math.abs(l[1] - q[1]) > eps) out.push(q);
  }
  return out;
}

// ================================================================ import

// Entities that carry their coordinates in the object coordinate system.
const OCS_TYPES = new Set(["CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "TEXT", "ATTRIB", "INSERT", "SOLID", "TRACE", "HATCH"]);
const SILENT = new Set(["POINT", "ATTDEF", "VIEWPORT", "SEQEND", "VERTEX", "ENDBLK", "BLOCK"]);
const MAX_DEPTH = 24;

class Importer {
  constructor(st) {
    Object.assign(this, st);
    this.drawings = [];
    this.texts = [];
    this.used = new Set();
    this.warnings = new Set();
    this.rays = [];
    this.images = [];
    this.layerInfo = new Map(); // layers not in the layer table (xrefs, layouts): name → table entry
    this.fromGraphics = new Map();
    this.acisMissing = new Map();
    this.acisChords = 0;
    this.missingXrefs = [];
    this.loadedXrefs = new Set();
    if (!this.objects) this.objects = new Map();
    if (!this.blockNames) this.blockNames = new Map();
  }

  warn(s) { this.warnings.add(s); }

  // Run fn with fresh output lists → {drawings, texts} it produced.
  capture(fn) {
    const d = this.drawings, t = this.texts, ni = this.noImages;
    this.drawings = []; this.texts = []; this.noImages = true;
    try { fn(); return { drawings: this.drawings, texts: this.texts }; } finally { this.drawings = d; this.texts = t; this.noImages = ni; }
  }

  // Layer and colour of an entity, honouring layer 0 and BYBLOCK in blocks.
  style(e, ctx) {
    let layer = decodeDxfText(strOf(e, 8, "0") || "0");
    const known = this.layerTable.get(layer.toUpperCase());
    if (known) layer = known.name;
    if (layer === "0" && ctx.layer) layer = ctx.layer;
    else if (this.prefix) {
      // An external reference's layers: "XREF|LAYER", as AutoCAD names them.
      layer = this.prefix + layer;
      if (!this.layerInfo.has(layer.toUpperCase())) this.layerInfo.set(layer.toUpperCase(), known || null);
    }
    let color;
    const tc = raw(e, 420);
    const aci = intOf(e, 62, 256);
    if (tc !== undefined && Number.isFinite(parseInt(tc, 10))) color = `#${(parseInt(tc, 10) & 0xffffff).toString(16).padStart(6, "0")}`;
    else if (aci === 0) color = ctx.color;
    else if (aci !== 256 && Math.abs(aci) <= 255) color = aciToHex(aci);
    return { layer, color };
  }

  // Effective colour of an INSERT for its BYBLOCK children.
  blockColor(e, ctx) {
    const s = this.style(e, ctx);
    if (s.color) return s;
    const l = this.layerTable.get(s.layer.toUpperCase()) || this.layerInfo.get(s.layer.toUpperCase());
    return { layer: s.layer, color: l ? l.color : undefined };
  }

  push(e, ctx, item) {
    const { layer, color } = this.style(e, ctx);
    if (ctx.skip && ctx.skip.has(layer.toUpperCase())) return; // frozen in this viewport
    this.used.add(layer);
    const d = { id: uid("g"), level: this.level, layer, ...item };
    if (color) d.color = color;
    this.drawings.push(d);
  }

  polyline(e, ctx, m, pts, closed) {
    let q = dedupe(pts.map(([x, y]) => apply(m, x, y)));
    if (closed && q.length > 2) {
      const a = q[0], b = q[q.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) q = q.slice(0, -1);
    }
    if (q.length < 2) return;
    this.push(e, ctx, { kind: "polyline", pts: q, closed: !!closed && q.length > 2 });
  }

  circle(e, ctx, m, cx, cy, r) {
    if (!(r > 0)) return;
    if (isSimilarity(m)) {
      const [x, y] = apply(m, cx, cy);
      this.push(e, ctx, { kind: "circle", cx: x, cy: y, r: r * Math.hypot(m[0], m[1]) });
    } else this.polyline(e, ctx, m, arcPoints(cx, cy, r, 0, 2 * Math.PI).slice(0, -1), true);
  }

  // Arc in the local frame, counter-clockwise from s to e (degrees).
  arc(e, ctx, m, cx, cy, r, s, en) {
    if (!(r > 0)) return;
    s = norm360(s);
    en = norm360(en);
    const sweep = norm360(en - s);
    if (sweep < 1e-9) return this.circle(e, ctx, m, cx, cy, r);
    if (isSimilarity(m)) {
      const [x, y] = apply(m, cx, cy);
      const phi = Math.atan2(m[1], m[0]) / DEG;
      const neg = det(m) < 0;
      this.push(e, ctx, {
        kind: "arc", cx: x, cy: y, r: r * Math.hypot(m[0], m[1]),
        a1: clean(neg ? phi - s : phi + s), a2: clean(neg ? phi - en : phi + en), ccw: neg,
      });
    } else this.polyline(e, ctx, m, arcPoints(cx, cy, r, s * DEG, sweep * DEG), false);
  }

  // A text whose top-left/centre/right (per align) sits at local (x, y);
  // `ang` is the local reading direction in degrees, h the local height.
  text(e, ctx, m, { x, y, h, ang, align, text }) {
    const str = String(text).replace(/\s+$/, "");
    if (!str || !(h > 0)) return;
    const [px, py] = apply(m, x, y);
    let rot;
    if (isSimilarity(m)) {
      const phi = Math.atan2(m[1], m[0]) / DEG;
      rot = det(m) < 0 ? phi - ang : phi + ang;
    } else {
      const [dx, dy] = applyVec(m, Math.cos(ang * DEG), Math.sin(ang * DEG));
      rot = Math.atan2(dy, dx) / DEG;
    }
    rot = clean(norm360(rot + 180) - 180, 1e9);
    if (rot <= -180) rot += 360;
    const up = applyVec(m, -Math.sin(ang * DEG), Math.cos(ang * DEG));
    const { layer, color } = this.style(e, ctx);
    if (ctx.skip && ctx.skip.has(layer.toUpperCase())) return;
    this.used.add(layer);
    const t = { id: uid("t"), level: this.level, x: px, y: py, text: str, size: h * Math.hypot(...up), rot, align, layer };
    if (color) t.color = color;
    this.texts.push(t);
  }

  // ---------------------------------------------------------------- entities
  entity(e, ctx) {
    if (intOf(e, 60) === 1) return; // invisible
    let m = ctx.m;
    if (OCS_TYPES.has(e.type)) {
      const nz = numOf(e, 230, 1), nx = numOf(e, 210, 0), ny = numOf(e, 220, 0);
      const o = ocsMatrix(nx, ny, nz, e.type === "LWPOLYLINE" ? numOf(e, 38) : numOf(e, 30));
      if (o) m = mul(m, o);
    }
    switch (e.type) {
      case "LINE":
        return this.polyline(e, ctx, m, [[numOf(e, 10), numOf(e, 20)], [numOf(e, 11), numOf(e, 21)]], false);
      case "LWPOLYLINE": return this.lwpolyline(e, ctx, m);
      case "POLYLINE": return this.oldPolyline(e, ctx, m);
      case "CIRCLE": return this.circle(e, ctx, m, numOf(e, 10), numOf(e, 20), numOf(e, 40));
      case "ARC": return this.arc(e, ctx, m, numOf(e, 10), numOf(e, 20), numOf(e, 40), numOf(e, 50), numOf(e, 51));
      case "ELLIPSE": return this.ellipse(e, ctx, m);
      case "SPLINE": return this.spline(e, ctx, m);
      case "TEXT": case "ATTRIB": return this.dxfText(e, ctx, m);
      case "MTEXT": return this.mtext(e, ctx, m);
      case "INSERT": return this.insert(e, ctx, m);
      case "DIMENSION": return this.dimension(e, ctx, m);
      case "HATCH": return this.hatch(e, ctx, m);
      case "SOLID": case "TRACE": {
        const q = [10, 11, 12, 13].map((c) => [numOf(e, c), numOf(e, c + 10)]);
        return this.polyline(e, ctx, m, dedupe([q[0], q[1], q[3], q[2]]), true);
      }
      case "3DFACE": {
        const q = [10, 11, 12, 13].map((c) => [numOf(e, c), numOf(e, c + 10)]);
        return this.polyline(e, ctx, m, dedupe(q), true);
      }
      case "LEADER":
        return this.polyline(e, ctx, m, pointsOf(e, 10), false);
      case "RAY": case "XLINE":
        // Unbounded: drawn once the extent of the drawing is known.
        this.rays.push({ e, ctx, m });
        return;
      case "IMAGE": case "WIPEOUT": return this.image(e, ctx);
      case "MULTILEADER": case "MLEADER": return this.mleader(e, ctx);
      case "ACAD_TABLE": return this.table(e, ctx, m);
      case "MLINE": return this.records(e, ctx, mlineRecords(e));
      case "HELIX": { // a spline, followed by the helix parameters (same codes)
        const k = e.tags.findIndex(([c, v]) => c === 100 && String(v).trim() === "AcDbHelix");
        return this.spline(k < 0 ? e : { ...e, tags: e.tags.slice(0, k) }, ctx, m);
      }
      case "ARC_DIMENSION": case "LARGE_RADIAL_DIMENSION": return this.dimension(e, ctx, m);
      case "REGION": case "3DSOLID": case "BODY": return this.acis(e, ctx);
      case "TOLERANCE": return this.tolerance(e, ctx, m);
      default: {
        if (SILENT.has(e.type)) return;
        // Anything else is drawn from its proxy graphics when it has them.
        const g = e.graphics || dxfProxyBytes(e);
        const recs = g ? proxyRecords(g, styleTags(e)) : [];
        if (recs.length) { this.records(e, ctx, recs); this.fromGraphics.set(e.type, (this.fromGraphics.get(e.type) || 0) + 1); return; }
        this.warn(`${e.type} entities are not supported and were skipped`);
      }
    }
  }

  // Generated records (world coordinates, cadextra.js) drawn in e's context.
  records(e, ctx, list) {
    for (const r of list || []) if (r) this.entity(r, ctx);
  }

  // Rays and construction lines, clipped to `box` (plan coordinates).
  flushRays(box) {
    const rays = this.rays;
    this.rays = [];
    if (!box) return;
    for (const { e, ctx, m } of rays) {
      const p = apply(m, numOf(e, 10), numOf(e, 20));
      const d = applyVec(m, numOf(e, 11, 1), numOf(e, 21));
      if (!(Math.hypot(d[0], d[1]) > 1e-12)) continue;
      const seg = clipLine(p, d, box, e.type === "RAY" ? [0, Infinity] : [-Infinity, Infinity]);
      if (seg) this.push(e, ctx, { kind: "polyline", pts: seg, closed: false });
    }
  }

  // Raster image or wipeout: the frame (or clip boundary) outline; an image
  // also notes its file so that the caller can lay it under the plan.
  image(e, ctx) {
    const g = imageGeometry(e);
    const pts = g.outline.map((q) => apply(ctx.m, q[0], q[1]));
    const n = this.drawings.length;
    this.polyline(e, ctx, ctx.m, g.outline.map((q) => [q[0], q[1]]), true);
    if (e.type !== "IMAGE" || this.drawings.length === n || this.noImages) return;
    let file = e.imageFile;
    if (file === undefined) {
      const def = this.objects.get(strOf(e, 340).toUpperCase());
      file = def ? decodeDxfText(strOf(def, 1)) : "";
    }
    // Picture corners in plan coordinates (top left, top right, bottom left).
    const P = (q) => apply(ctx.m, q[0], q[1]);
    const tl = P([g.corner[0] + g.V[0], g.corner[1] + g.V[1]]), tr = P([g.corner[0] + g.V[0] + g.U[0], g.corner[1] + g.V[1] + g.U[1]]), bl = P(g.corner);
    this.images.push({ file, drawing: this.drawings[n].id, tl, tr, bl, outline: pts, layer: this.drawings[n].layer });
  }

  mleader(e, ctx) {
    const recs = mleaderRecords(e, (h) => this.blockNames.get(String(h).toUpperCase()));
    if (recs && recs.length) return this.records(e, ctx, recs);
    const g = e.graphics || dxfProxyBytes(e);
    if (g) return this.records(e, ctx, proxyRecords(g, styleTags(e)));
    this.warn("MULTILEADER entities without data were skipped");
  }

  // A table shows its anonymous block (*T…), else its graphics, else a grid
  // built from its row heights and column widths.
  table(e, ctx, m) {
    const name = strOf(e, 2);
    const b = name && this.blocks.get(name.toUpperCase());
    const g = e.graphics || dxfProxyBytes(e);
    if (b && raw(e, 10) !== undefined) {
      const rot = raw(e, 50) !== undefined ? numOf(e, 50) : Math.atan2(numOf(e, 21), numOf(e, 11, 1)) / DEG;
      const tags = e.tags.filter(([c]) => [8, 62, 420, 2, 10, 20, 30, 41, 42, 43, 210, 220, 230].includes(c));
      return this.insert({ type: "INSERT", tags: [...tags, [50, rot]] }, ctx, m);
    }
    if (b && g && raw(e, 10) === undefined) {
      // R2010+ DWG: no insertion point; place the block where its graphics are.
      const off = graphicsOffset(proxyRecords(g, []), b.entities);
      if (off) return this.insert({ type: "INSERT", tags: [...styleTags(e), [2, b.name], [10, off[0]], [20, off[1]]] }, ctx, m);
    }
    if (g) { const recs = proxyRecords(g, styleTags(e)); if (recs.length) return this.records(e, ctx, recs); }
    this.records(e, ctx, tableGridRecords(e));
  }

  // REGION / 3DSOLID / BODY: the edges of the ACIS model.
  acis(e, ctx) {
    let data = e.acis;
    if (data === undefined) data = dxfSatText(e);
    if (!data && this.acds) data = this.acds.get(strOf(e, 5).toUpperCase());
    let recs = [];
    if (data) {
      try {
        const r = acisRecords(data, styleTags(e));
        recs = r.records;
        if (r.chords) this.acisChords += r.chords;
      } catch { recs = []; }
    }
    if (!recs.length) {
      const g = e.graphics || dxfProxyBytes(e);
      if (g) recs = proxyRecords(g, styleTags(e));
    }
    if (!recs.length) { this.acisMissing.set(e.type, (this.acisMissing.get(e.type) || 0) + 1); return; }
    this.records(e, ctx, recs);
  }

  // Feature control frame: its text (GD&T symbols as plain characters).
  tolerance(e, ctx, m) {
    const s = String(raw(e, 1) ?? "").replace(/%%v/gi, " | ").replace(/\^J/g, "\n");
    const ang = Math.atan2(numOf(e, 21), numOf(e, 11, 1)) / DEG;
    const h = this.dimText || 2.5;
    const text = stripMtext(s);
    text.split("\n").forEach((ln, i) => {
      const off = -i * h * 1.6;
      this.text(e, ctx, m, { x: numOf(e, 10) - Math.sin(ang * DEG) * off, y: numOf(e, 20) + Math.cos(ang * DEG) * off, h, ang, align: "left", text: ln });
    });
  }

  lwpolyline(e, ctx, m) {
    const verts = [];
    for (const [c, v] of e.tags) {
      if (c === 10) verts.push({ x: parseFloat(v) || 0, y: 0, b: 0 });
      else if (verts.length && c === 20) verts[verts.length - 1].y = parseFloat(v) || 0;
      else if (verts.length && c === 42) verts[verts.length - 1].b = parseFloat(v) || 0;
    }
    const closed = (intOf(e, 70) & 1) === 1;
    this.polyline(e, ctx, m, bulgePath(verts, closed), closed);
  }

  oldPolyline(e, ctx, m) {
    const flags = intOf(e, 70);
    const vs = (e.vertices || []).map((v) => ({ x: numOf(v, 10), y: numOf(v, 20), b: numOf(v, 42), f: intOf(v, 70), v }));
    if (flags & 64) {
      // Polyface mesh: position vertices (flags 64 + 128), then face records
      // (flag 128) holding 1-based vertex indices; WCS.
      const coords = vs.filter((v) => (v.f & 192) === 192);
      const faces = vs.filter((v) => (v.f & 128) && !(v.f & 64));
      for (const f of faces) {
        const idx = [71, 72, 73, 74].map((c) => Math.abs(intOf(f.v, c))).filter((i) => i > 0 && i <= coords.length);
        if (idx.length >= 2) this.polyline(e, ctx, ctx.m, idx.map((i) => [coords[i - 1].x, coords[i - 1].y]), idx.length > 2);
      }
      return;
    }
    if (flags & 16) {
      // Polygon mesh: M × N grid of vertices.
      const M = intOf(e, 71), N = intOf(e, 72);
      if (M * N > vs.length || !M || !N) return;
      const P = (i, j) => [vs[i * N + j].x, vs[i * N + j].y];
      for (let i = 0; i < M; i++) this.polyline(e, ctx, ctx.m, Array.from({ length: N }, (_, j) => P(i, j)), (flags & 32) !== 0);
      for (let j = 0; j < N; j++) this.polyline(e, ctx, ctx.m, Array.from({ length: M }, (_, i) => P(i, j)), (flags & 1) !== 0);
      return;
    }
    const closed = (flags & 1) === 1;
    // Spline-fit polylines: draw the fitted vertices, not the frame.
    const list = flags & 4 ? vs.filter((v) => !(v.f & 16)) : vs;
    if (flags & 8) return this.polyline(e, ctx, ctx.m, list.map((v) => [v.x, v.y]), closed); // 3D: WCS, flattened
    this.polyline(e, ctx, m, bulgePath(list, closed), closed);
  }

  ellipse(e, ctx, m) {
    const c = [numOf(e, 10), numOf(e, 20)];
    const maj3 = [numOf(e, 11), numOf(e, 21), numOf(e, 31)];
    const n = [numOf(e, 210, 0), numOf(e, 220, 0), numOf(e, 230, 1)];
    const ratio = numOf(e, 40, 1);
    // Minor axis = ratio · (normal × major).
    const mi = [ratio * (n[1] * maj3[2] - n[2] * maj3[1]), ratio * (n[2] * maj3[0] - n[0] * maj3[2])];
    const t0 = numOf(e, 41, 0);
    let t1 = numOf(e, 42, 2 * Math.PI);
    let sweep = t1 - t0;
    while (sweep <= 1e-9) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI + 1e-9) sweep -= 2 * Math.PI;
    const full = Math.abs(sweep - 2 * Math.PI) < 1e-6;
    const pts = ellipsePoints(c, [maj3[0], maj3[1]], mi, t0, sweep);
    if (full) pts.pop();
    this.polyline(e, ctx, m, pts, full);
  }

  spline(e, ctx, m) {
    const flags = intOf(e, 70);
    const closed = (flags & 1) === 1;
    const ctrl = pointsOf(e, 10);
    const fit = pointsOf(e, 11);
    const knots = e.tags.filter(([c]) => c === 40).map(([, v]) => parseFloat(v));
    const weights = e.tags.filter(([c]) => c === 41).map(([, v]) => parseFloat(v));
    let pts;
    if (ctrl.length >= 2) pts = bspline(intOf(e, 71, 3), ctrl, knots, weights);
    else if (fit.length >= 2) pts = catmullRom(fit, closed);
    else return;
    this.polyline(e, ctx, m, pts, closed);
  }

  dxfText(e, ctx, m) {
    if (e.type === "ATTRIB" && intOf(e, 70) & 1) return;
    if (e.type === "ATTRIB") {
      // R2018 multi-line attribute: an MTEXT embedded after "101 Embedded Object".
      const k = e.tags.findIndex(([c]) => c === 101);
      if (k >= 0 && e.tags.slice(k + 1).some(([c]) => c === 1)) return this.mtext({ type: "MTEXT", tags: [...styleTags(e), ...e.tags.slice(k + 1)] }, ctx, ctx.m);
    }
    const h = numOf(e, 40, 1);
    let ang = numOf(e, 50, 0);
    const hj = intOf(e, 72, 0);
    const vj = intOf(e, e.type === "ATTRIB" ? 74 : 73, 0);
    const p1 = [numOf(e, 10), numOf(e, 20)];
    const has2 = raw(e, 11) !== undefined;
    const p2 = has2 ? [numOf(e, 11), numOf(e, 21)] : p1;
    let anchor = p1, align = "left", k = 1;
    if ((hj === 3 || hj === 5) && has2) {
      // Aligned / fit: the text runs from the first to the second point.
      ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) / DEG;
    } else {
      if ((hj || vj) && has2) anchor = p2;
      align = hj === 1 || hj === 4 ? "center" : hj === 2 ? "right" : "left";
      k = hj === 4 || vj === 2 ? 0.5 : vj === 3 ? 0 : 1;
    }
    const up = [-Math.sin(ang * DEG), Math.cos(ang * DEG)];
    this.text(e, ctx, m, { x: anchor[0] + up[0] * h * k, y: anchor[1] + up[1] * h * k, h, ang, align, text: decodeDxfText(raw(e, 1) ?? "") });
  }

  mtext(e, ctx, m) {
    let s = "";
    for (const [c, v] of e.tags) if (c === 3) s += v;
    s += raw(e, 1) ?? "";
    const text = stripMtext(s);
    const h = numOf(e, 40, 1);
    const p = [numOf(e, 10), numOf(e, 20)];
    let ang;
    if (raw(e, 11) !== undefined && Math.hypot(numOf(e, 11), numOf(e, 21)) > 1e-12) ang = Math.atan2(numOf(e, 21), numOf(e, 11)) / DEG;
    else {
      ang = numOf(e, 50, 0);
      const o = ocsMatrix(numOf(e, 210, 0), numOf(e, 220, 0), numOf(e, 230, 1));
      if (o) { const [dx, dy] = applyVec(o, Math.cos(ang * DEG), Math.sin(ang * DEG)); ang = Math.atan2(dy, dx) / DEG; }
    }
    const att = Math.max(1, Math.min(9, intOf(e, 71, 1)));
    const row = Math.floor((att - 1) / 3), col = (att - 1) % 3;
    const lines = text.split("\n").length;
    const H = h * (1 + 1.25 * (lines - 1));
    const k = row === 0 ? 0 : row === 1 ? H / 2 : H;
    const up = [-Math.sin(ang * DEG), Math.cos(ang * DEG)];
    this.text(e, ctx, m, { x: p[0] + up[0] * k, y: p[1] + up[1] * k, h, ang, align: ["left", "center", "right"][col], text });
  }

  // Draw a block's entities through matrix bm (block frame → plan).
  block(name, e, ctx, bm) {
    const b = this.blocks.get(String(name).toUpperCase());
    if (!b) { this.warn(`Block "${name}" is missing`); return false; }
    if (ctx.stack.includes(b.key) || ctx.stack.length >= MAX_DEPTH) { this.warn(`Block "${b.name}" refers to itself or nests too deeply`); return true; }
    const { layer, color } = this.blockColor(e, ctx);
    const child = { m: bm, layer, color, stack: [...ctx.stack, b.key], skip: ctx.skip };
    if (b.xref) return this.xref(b, child);
    for (const it of b.entities) this.entity(it, child);
    return true;
  }

  // External reference: the model space of the referenced drawing (given
  // by the caller in `xrefs`, keyed by block name), on "XREF|layer" layers.
  xref(b, ctx) {
    const x = this.xrefs && (this.xrefs.get(b.key) || (b.path && this.xrefs.get(b.path.toUpperCase())));
    if (!x) {
      this.warn(`External reference "${b.name}"${b.path ? ` (${b.path})` : ""} was not loaded`);
      if (!this.missingXrefs.some((m) => m.name === b.name)) this.missingXrefs.push({ name: b.name, path: b.path || "" });
      return true;
    }
    if (!x.importer) {
      const sub = new Importer({ level: this.level, layerTable: readLayers(x.tables || []), blocks: readBlocks(x.blocks || []), dimText: this.dimText, objects: handleMap(x.objects), blockNames: blockRecordNames(x.tables), acds: x.acdsMap || dxfAcdsBlobs(x.acds), xrefs: x.xrefs || null });
      // Everything the external drawing draws lands in this import.
      for (const k of ["drawings", "texts", "used", "warnings", "layerInfo", "images", "fromGraphics", "acisMissing", "missingXrefs"]) sub[k] = this[k];
      sub.noImages = true;
      sub.prefix = `${b.name}|`;
      sub.entities = nest(x.entities || []).filter((it) => intOf(it, 67) !== 1);
      // Drawing units of the external file relative to this one.
      const u0 = INSUNITS[parseInt(this.vars.$INSUNITS ? this.vars.$INSUNITS[70] : 0, 10)], u1 = INSUNITS[parseInt(x.vars && x.vars.$INSUNITS ? x.vars.$INSUNITS[70] : 0, 10)];
      sub.unitScale = u0 && u1 ? UNIT_MM[u1] / UNIT_MM[u0] : 1;
      x.importer = sub;
      this.loadedXrefs.add(b.name);
    }
    const sub = x.importer;
    sub.drawings = this.drawings; sub.texts = this.texts; // (may be a viewport capture)
    const m = sub.unitScale !== 1 ? mul(ctx.m, scaling(sub.unitScale, sub.unitScale)) : ctx.m;
    const child = { ...ctx, m };
    for (const it of sub.entities) sub.entity(it, child);
    sub.rays = [];
    return true;
  }

  insert(e, ctx, m) {
    const name = strOf(e, 2);
    const b = this.blocks.get(name.toUpperCase());
    const base = b ? b.base : [0, 0];
    const sx = numOf(e, 41, 1) || 1, sy = numOf(e, 42, 1) || 1;
    const rot = numOf(e, 50, 0);
    const cols = Math.max(1, intOf(e, 70, 1)), rows = Math.max(1, intOf(e, 71, 1));
    const cs = numOf(e, 44, 0), rs = numOf(e, 45, 0);
    const local = mul(scaling(sx, sy), translation(-base[0], -base[1]));
    const placed = mul(m, mul(translation(numOf(e, 10), numOf(e, 20)), rotation(rot)));
    if (cols * rows > 10000) this.warn(`Array insert of "${name}" was limited to 10000 copies`);
    let count = 0;
    cells: for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (++count > 10000) break cells;
        if (!this.block(name, e, ctx, mul(placed, mul(translation(c * cs, r * rs), local)))) break cells;
      }
    }
    // Attributes are placed in world coordinates already (also for a missing block).
    for (const a of e.attribs || []) this.entity(a, ctx);
  }

  dimension(e, ctx, m) {
    const name = strOf(e, 2);
    if (name && this.blocks.has(name.toUpperCase())) {
      this.block(name, e, ctx, ctx.m);
      return;
    }
    // No rendered block: draw the measured points and the text.
    const a = [numOf(e, 13), numOf(e, 23)], b = [numOf(e, 14), numOf(e, 24)];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0) this.polyline(e, ctx, m, [a, b], false);
    const meas = numOf(e, 42, Math.hypot(b[0] - a[0], b[1] - a[1]));
    let label = strOf(e, 1);
    if (!label || label === "<>") label = String(Math.round(meas * 100) / 100);
    else label = stripMtext(label.replace("<>", String(Math.round(meas * 100) / 100)));
    const h = this.dimText || 2.5;
    const tp = [numOf(e, 11), numOf(e, 21)];
    this.text(e, ctx, m, { x: tp[0], y: tp[1] + h / 2, h, ang: numOf(e, 53, 0), align: "center", text: label });
  }

  hatch(e, ctx, m) {
    for (const loop of hatchLoops(e)) if (loop.length >= 2) this.polyline(e, ctx, m, loop, true);
  }
}

// Boundary paths of a HATCH, each a closed point list in OCS.
function hatchLoops(e) {
  const t = e.tags;
  let i = t.findIndex(([c]) => c === 91);
  if (i < 0) return [];
  const nPaths = parseInt(t[i][1], 10) || 0;
  i++;
  const peek = (c) => i < t.length && t[i][0] === c;
  const take = (c, d = 0) => (peek(c) ? parseFloat(t[i++][1]) || 0 : d);
  const loops = [];
  for (let k = 0; k < nPaths; k++) {
    while (i < t.length && t[i][0] !== 92) i++;
    if (i >= t.length) break;
    const flags = take(92);
    if (flags & 2) {
      const hasBulge = take(72);
      take(73);
      const n = take(93);
      const verts = [];
      for (let v = 0; v < n; v++) verts.push({ x: take(10), y: take(20), b: hasBulge ? take(42) : 0 });
      loops.push(bulgePath(verts, true));
    } else {
      const nEdges = take(93);
      const pts = [];
      const add = (list) => { for (const q of list) pts.push(q); };
      for (let j = 0; j < nEdges; j++) {
        const type = take(72);
        if (type === 1) {
          add([[take(10), take(20)], [take(11), take(21)]]);
        } else if (type === 2) {
          const cx = take(10), cy = take(20), r = take(40), s = take(50), en = take(51), ccw = take(73, 1);
          // Clockwise edges are stored with mirrored angles.
          const a0 = ccw ? s : -s;
          const sweep = norm360(en - s) || 360;
          add(arcPoints(cx, cy, r, a0 * DEG, (ccw ? sweep : -sweep) * DEG));
        } else if (type === 3) {
          const cx = take(10), cy = take(20), mx = take(11), my = take(21), ratio = take(40), s = take(50), en = take(51), ccw = take(73, 1);
          const a0 = ccw ? s : -s;
          const sweep = norm360(en - s) || 360;
          add(ellipsePoints([cx, cy], [mx, my], [-my * ratio, mx * ratio], a0 * DEG, (ccw ? sweep : -sweep) * DEG));
        } else if (type === 4) {
          const degree = take(94, 3);
          take(73); take(74);
          const nk = take(95);
          take(96); // control point count: the points are read tag by tag below
          const knots = [];
          for (let q = 0; q < nk; q++) knots.push(take(40));
          const ctrl = [], weights = [];
          while (peek(10) || peek(20) || peek(42)) {
            if (peek(10)) ctrl.push([take(10), 0]);
            else if (peek(20)) { const y = take(20); if (ctrl.length) ctrl[ctrl.length - 1][1] = y; } else weights.push(take(42));
          }
          const fit = [];
          if (peek(97) && t[i + 1] && t[i + 1][0] === 11) {
            take(97);
            while (peek(11)) fit.push([take(11), take(21)]);
          }
          while (peek(12) || peek(22) || peek(13) || peek(23)) i++;
          if (ctrl.length >= 2) add(bspline(degree, ctrl, knots, weights));
          else if (fit.length >= 2) add(catmullRom(fit, false));
        } else break;
      }
      loops.push(dedupe(pts));
    }
    if (peek(97)) {
      const ns = take(97);
      for (let q = 0; q < ns && peek(330); q++) i++;
    }
  }
  return loops.map((pts) => {
    const q = dedupe(pts);
    if (q.length > 2) { const a = q[0], b = q[q.length - 1]; if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) q.pop(); }
    return q;
  });
}

function headerVars(pairs = []) {
  const vars = {};
  let cur = null;
  for (const [c, v] of pairs) {
    if (c === 9) { cur = vars[v.trim().toUpperCase()] = {}; } else if (cur && !(c in cur)) cur[c] = v.trim();
  }
  return vars;
}

function readLayers(recs) {
  const map = new Map();
  for (const r of recs) {
    if (r.type !== "LAYER") continue;
    const name = decodeDxfText(strOf(r, 2));
    if (!name) continue;
    const aci = intOf(r, 62, 7);
    const flags = intOf(r, 70, 0);
    const tc = raw(r, 420);
    const color = tc !== undefined && Number.isFinite(parseInt(tc, 10)) ? `#${(parseInt(tc, 10) & 0xffffff).toString(16).padStart(6, "0")}` : aciToHex(aci || 7);
    // Layer names are case-insensitive; keyed by the decoded name.
    map.set(name.toUpperCase(), { name, color, visible: aci >= 0 && !(flags & 1) });
  }
  return map;
}

function readBlocks(recs) {
  const blocks = new Map();
  let cur = null;
  for (const r of recs) {
    if (r.type === "BLOCK") {
      const name = strOf(r, 2) || strOf(r, 3);
      cur = { name, key: name.toUpperCase(), base: [numOf(r, 10), numOf(r, 20)], xref: (intOf(r, 70) & 12) !== 0, path: (intOf(r, 70) & 12) !== 0 ? decodeDxfText(strOf(r, 1)) : "", recs: [] };
      blocks.set(cur.key, cur);
    } else if (r.type === "ENDBLK") cur = null;
    else if (cur) cur.recs.push(r);
  }
  for (const b of blocks.values()) { b.entities = nest(b.recs); delete b.recs; }
  return blocks;
}

// Points along a plan arc drawn with canvas semantics.
function canvasArcPoints(d) {
  const span = d.ccw ? d.a1 - d.a2 : d.a2 - d.a1;
  const sweep = span >= 360 ? 360 : norm360(span);
  return arcPoints(d.cx, d.cy, d.r, d.a1 * DEG, (d.ccw ? -sweep : sweep) * DEG);
}

function itemBounds(drawings, texts) {
  let b = null;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!b) b = { x1: x, y1: y, x2: x, y2: y };
    else { if (x < b.x1) b.x1 = x; if (y < b.y1) b.y1 = y; if (x > b.x2) b.x2 = x; if (y > b.y2) b.y2 = y; }
  };
  for (const d of drawings) {
    if (d.kind === "circle") { add(d.cx - d.r, d.cy - d.r); add(d.cx + d.r, d.cy + d.r); } else if (d.kind === "arc") for (const [x, y] of canvasArcPoints(d)) add(x, y);
    else for (const [x, y] of d.pts) add(x, y);
  }
  for (const t of texts) add(t.x, t.y);
  return b;
}

/**
 * Parse a DXF drawing into CAD layer geometry (plan millimetres).
 * `text` may also be an ArrayBuffer / Uint8Array: an ASCII file (decoded
 * per $DWGCODEPAGE) or a binary DXF (dxfbin.js).
 * Returns {drawings, texts, layers, units, scale, bounds, warnings, counts,
 * layouts, images, xrefs}; `opts` as for importCadRecords.
 */
export function importDxf(text, opts = {}) {
  return importCadRecords(dxfRecords(text), opts);
}

/**
 * A DXF file → the records importCadRecords takes: {vars, tables, blocks,
 * entities, objects, acds} (each a list of {type, tags}).
 */
export function dxfRecords(text) {
  const sections = splitSections(tokenize(text));
  return {
    vars: headerVars(sections.HEADER),
    tables: toRecords(sections.TABLES),
    blocks: toRecords(sections.BLOCKS),
    entities: sections.ENTITIES ? toRecords(sections.ENTITIES) : null,
    objects: toRecords(sections.OBJECTS),
    acds: toRecords(sections.ACDSDATA),
  };
}

// Objects by handle (group 5, upper-case hex).
function handleMap(objects) {
  const m = new Map();
  for (const o of objects || []) { const h = strOf(o, 5); if (h) m.set(h.toUpperCase(), o); }
  return m;
}
// Block record handle → block name (TABLES BLOCK_RECORD entries).
function blockRecordNames(tables) {
  const m = new Map();
  for (const t of tables || []) if (t.type === "BLOCK_RECORD") { const h = strOf(t, 5); if (h) m.set(h.toUpperCase(), strOf(t, 2)); }
  return m;
}

/**
 * Paper space layouts of a drawing (records from dxfRecords or
 * dwgRecords) in tab order: [{name, key}] — key is the upper-case name of
 * the layout's paper space block. Layouts with nothing on them are left out.
 */
export function cadLayouts(recs) {
  const objects = handleMap(recs.objects);
  const brNames = blockRecordNames(recs.tables);
  const layoutOf = new Map(); // block key → LAYOUT object
  for (const t of recs.tables || []) {
    if (t.type !== "BLOCK_RECORD") continue;
    const lo = objects.get(strOf(t, 340).toUpperCase());
    if (lo && lo.type === "LAYOUT") layoutOf.set(strOf(t, 2).toUpperCase(), lo);
  }
  for (const lo of recs.objects || []) {
    if (lo.type !== "LAYOUT") continue;
    for (const [c, v] of lo.tags) {
      if (c !== 330) continue;
      const n = brNames.get(String(v).trim().toUpperCase());
      if (n && !layoutOf.has(n.toUpperCase())) layoutOf.set(n.toUpperCase(), lo);
    }
  }
  // Content of every paper space block: entities, and viewports beyond the
  // layout's own (the first one).
  const content = new Map();
  const count = (key, e) => { const c = content.get(key) || { n: 0, vp: 0 }; if (e.type === "VIEWPORT") c.vp++; else if (e.type !== "SEQEND" && e.type !== "VERTEX" && e.type !== "ATTRIB") c.n++; content.set(key, c); };
  let cur = null;
  for (const r of recs.blocks || []) {
    if (r.type === "BLOCK") { cur = (strOf(r, 2) || strOf(r, 3)).toUpperCase(); if (!/^\*PAPER_SPACE/.test(cur)) cur = null; else if (!content.has(cur)) content.set(cur, { n: 0, vp: 0 }); } else if (r.type === "ENDBLK") cur = null;
    else if (cur) count(cur, r);
  }
  for (const e of recs.entities || []) if (intOf(e, 67) === 1) count("*PAPER_SPACE", e);
  const out = [];
  let i = 0;
  for (const [key, c] of content) {
    i++;
    if (!c.n && c.vp < 2) continue;
    const lo = layoutOf.get(key);
    const name = lo ? decodeDxfText(strOf(lo, 1)) || key : key === "*PAPER_SPACE" ? "Paper space" : key;
    out.push({ name, key, order: lo ? intOf(lo, 71, i) : 1000 + i });
  }
  out.sort((a, b) => a.order - b.order);
  const seen = new Set();
  for (const l of out) { let n = l.name, k = 2; while (seen.has(n.toUpperCase())) n = `${l.name} (${k++})`; l.name = n; seen.add(n.toUpperCase()); }
  return out.map(({ name, key }) => ({ name, key }));
}

/**
 * The DXF importer behind importDxf, fed with already parsed records
 * ({type, tags: [[code, value]]}, in DXF section order) — the DWG reader
 * (dwg.js) translates its objects into these. `vars` maps "$NAME" → {code:
 * value}; `entities` null means the file had no ENTITIES section.
 *
 * Options: `space` — "model" (default), "layout:<name>" (that paper space
 * layout: its own entities and, through its viewports, the model clipped
 * and scaled) or "all" (the model, then every layout to the right of it,
 * on "<layout>|<layer>" layers); `xrefs` — external drawings ({name or
 * path: records}, from dxfRecords / dwgRecords) for XREF blocks.
 */
export function importCadRecords(recs, { level = null, units = "auto", space = "model", xrefs = null } = {}) {
  const { vars = {}, tables = [], blocks: blockRecs = [], entities: entityRecs = null } = recs;
  const layerTable = readLayers(tables);
  const blocks = readBlocks(blockRecs);
  const entities = nest(entityRecs || []);
  const dimStyleText = vars.$DIMTXT ? parseFloat(vars.$DIMTXT[40]) : NaN;
  let xmap = null;
  if (xrefs) {
    xmap = new Map();
    for (const [k, v] of xrefs instanceof Map ? xrefs : Object.entries(xrefs)) if (v) xmap.set(String(k).toUpperCase(), v);
  }
  const imp = new Importer({
    level, layerTable, blocks, vars,
    dimText: Number.isFinite(dimStyleText) && dimStyleText > 0 ? dimStyleText : 2.5,
    objects: handleMap(recs.objects), blockNames: blockRecordNames(tables), acds: recs.acdsMap || dxfAcdsBlobs(recs.acds), xrefs: xmap,
  });
  const flip = [1, 0, 0, -1, 0, 0];
  const counts = {};
  const layouts = cadLayouts(recs);
  const layerByHandle = new Map();
  for (const t of tables) if (t.type === "LAYER") { const h = strOf(t, 5); if (h) layerByHandle.set(h.toUpperCase(), decodeDxfText(strOf(t, 2))); }
  const model = entities.filter((e) => e.type !== "ENDBLK" && e.type !== "BLOCK" && intOf(e, 67) !== 1);
  const paper = entities.filter((e) => intOf(e, 67) === 1).length;

  // Twice the extent of what was drawn since `from` (rays and xlines end there).
  const headerBox = () => {
    if (!vars.$EXTMIN || !vars.$EXTMAX) return null;
    const x1 = parseFloat(vars.$EXTMIN[10]), y1 = parseFloat(vars.$EXTMIN[20]), x2 = parseFloat(vars.$EXTMAX[10]), y2 = parseFloat(vars.$EXTMAX[20]);
    return [x1, y1, x2, y2].every(Number.isFinite) && x2 >= x1 && y2 >= y1 && x2 - x1 < 1e15 ? { x1, y1: -y2, x2, y2: -y1 } : null;
  };
  const rayBox = (from) => {
    let b = itemBounds(imp.drawings.slice(from.d), imp.texts.slice(from.t)) || headerBox();
    if (!b && imp.rays.length) { const r0 = imp.rays[0]; const [x, y] = apply(r0.m, numOf(r0.e, 10), numOf(r0.e, 20)); b = { x1: x - 500, y1: y - 500, x2: x + 500, y2: y + 500 }; }
    if (!b) return null;
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2, w = Math.max(b.x2 - b.x1, b.y2 - b.y1, 1e-6), h = Math.max(b.y2 - b.y1, 1e-6);
    return { x1: cx - w, x2: cx + w, y1: cy - Math.max(h, w * 0.5), y2: cy + Math.max(h, w * 0.5) };
  };

  const drawLayout = (L) => {
    const own = (blocks.get(L.key) || {}).entities || [];
    const ents = L.key === "*PAPER_SPACE" ? [...entities.filter((e) => intOf(e, 67) === 1), ...own] : own;
    const ctx = { m: flip, layer: null, color: undefined, stack: [] };
    const from = { d: imp.drawings.length, t: imp.texts.length };
    const vps = ents.filter((e) => e.type === "VIEWPORT");
    const main = vps.some((v) => raw(v, 69) !== undefined) ? vps.find((v) => intOf(v, 69) === 1) : vps[0];
    for (const e of ents) if (e.type !== "VIEWPORT") imp.entity(e, ctx);
    for (const vp of vps) {
      if (vp === main || intOf(vp, 60) === 1) continue;
      if ((raw(vp, 68) !== undefined && intOf(vp, 68) === 0) || intOf(vp, 90) & 0x20000) continue; // off
      const cx = numOf(vp, 10), cy = numOf(vp, 20), w = numOf(vp, 40), h = numOf(vp, 41), vh = numOf(vp, 45);
      if (!(w > 0 && h > 0)) continue;
      imp.polyline(vp, ctx, flip, [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], true);
      if (!(vh > 0)) continue;
      const dir = [numOf(vp, 16), numOf(vp, 26), numOf(vp, 36, 1)];
      if (Math.hypot(dir[0], dir[1]) > 1e-9 * Math.hypot(...dir)) imp.warn("A layout viewport shows a 3D view; its contents are drawn in plan");
      const s = h / vh;
      const A = mul(translation(cx, cy), mul(scaling(s, s), mul(translation(-numOf(vp, 12), -numOf(vp, 22)), mul(rotation(-numOf(vp, 51)), translation(-numOf(vp, 17), -numOf(vp, 27))))));
      const skip = new Set();
      for (const [c, v] of vp.tags) if (c === 341 || c === 331) { const n = layerByHandle.get(String(v).trim().toUpperCase()); if (n) skip.add(n.toUpperCase()); }
      for (const n of vp.frozenLayerNames || []) skip.add(String(n).toUpperCase());
      const rect = { x1: cx - w / 2, x2: cx + w / 2, y1: -(cy + h / 2), y2: -(cy - h / 2) };
      const pending = imp.rays;
      imp.rays = [];
      const got = imp.capture(() => {
        const vctx = { m: mul(flip, A), layer: null, color: undefined, stack: [], skip };
        for (const e of model) imp.entity(e, vctx);
        imp.flushRays(rect);
      });
      imp.rays = pending;
      const c = clipItems(got.drawings, got.texts, rect);
      for (const d of c.drawings) imp.drawings.push(d);
      for (const t of c.texts) imp.texts.push(t);
    }
    imp.flushRays(rayBox(from));
  };

  let wanted = [null];
  if (space === "all") wanted = [null, ...layouts];
  else if (space && space !== "model") {
    const name = String(space).replace(/^layout:/, "");
    const L = layouts.find((l) => l.name === name) || layouts.find((l) => l.name.toUpperCase() === name.toUpperCase());
    if (!L) imp.warn(`The layout "${name}" was not found; the model space was imported`);
    wanted = [L || null];
  }
  let right = null;
  for (const L of wanted) {
    const from = { d: imp.drawings.length, t: imp.texts.length, i: imp.images.length };
    if (!L) {
      const ctx = { m: flip, layer: null, color: undefined, stack: [] };
      for (const e of model) { counts[e.type] = (counts[e.type] || 0) + 1; imp.entity(e, ctx); }
      imp.flushRays(rayBox(from));
    } else drawLayout(L);
    if (space !== "all") continue;
    const ds = imp.drawings.slice(from.d), ts = imp.texts.slice(from.t);
    const b = itemBounds(ds, ts);
    if (!b) continue;
    let dx = 0;
    if (L) {
      // Side by side: each layout to the right of everything before it,
      // on its own "<layout>|<layer>" layers.
      dx = right === null ? 0 : right + 0.1 * Math.max(b.x2 - b.x1, 1) - b.x1;
      for (const d of ds) {
        if (d.pts) d.pts = d.pts.map(([x, y]) => [x + dx, y]);
        if (d.cx !== undefined) d.cx += dx;
      }
      for (const t of ts) t.x += dx;
      for (const it of [...ds, ...ts]) {
        const n = `${L.name}|${it.layer}`;
        if (!imp.layerInfo.has(n.toUpperCase())) imp.layerInfo.set(n.toUpperCase(), layerTable.get(it.layer.toUpperCase()) || imp.layerInfo.get(it.layer.toUpperCase()) || null);
        it.layer = n;
      }
      for (const im of imp.images.slice(from.i)) { for (const k of ["tl", "tr", "bl"]) im[k] = [im[k][0] + dx, im[k][1]]; im.layer = `${L.name}|${im.layer}`; }
    }
    right = Math.max(right ?? -Infinity, b.x2 + dx);
  }
  if (paper && wanted.every((L) => L === null)) imp.warn(`${paper} paper space entit${paper === 1 ? "y was" : "ies were"} skipped${layouts.length ? ` (import a layout to see ${paper === 1 ? "it" : "them"})` : ""}`);
  if (!entityRecs) imp.warn("The file has no ENTITIES section");
  for (const [type, n] of imp.fromGraphics) imp.warn(`${n} ${type} entit${n === 1 ? "y was" : "ies were"} drawn from ${n === 1 ? "its" : "their"} stored graphics`);
  for (const [type, n] of imp.acisMissing) imp.warn(`${n} ${type} entit${n === 1 ? "y has" : "ies have"} no ACIS edges that can be drawn (or no readable ACIS data) and ${n === 1 ? "was" : "were"} skipped`);
  if (imp.acisChords) imp.warn(`${imp.acisChords} curved edge${imp.acisChords === 1 ? "" : "s"} of solids or regions (splines) ${imp.acisChords === 1 ? "is" : "are"} drawn as straight lines`);

  // Units → millimetres.
  let unit;
  const ins = vars.$INSUNITS ? parseInt(vars.$INSUNITS[70], 10) : 0;
  if (units && units !== "auto") {
    if (!UNIT_MM[units]) throw new Error(`Unknown unit "${units}"`);
    unit = units;
  } else if (INSUNITS[ins]) unit = INSUNITS[ins];
  else {
    const b0 = itemBounds(imp.drawings, imp.texts);
    const extent = b0 ? Math.max(b0.x2 - b0.x1, b0.y2 - b0.y1) : 0;
    unit = guessUnits(extent);
    if (b0) imp.warn(`The drawing has no units; ${unit} assumed from its size (${Math.round(extent * 100) / 100} units)`);
  }
  const scale = UNIT_MM[unit];
  const toMm = (v) => Math.round(v * scale * 1e4) / 1e4 + 0; // 0.1 µm grid
  for (const d of imp.drawings) {
    if (d.pts) d.pts = d.pts.map(([x, y]) => [toMm(x), toMm(y)]);
    for (const k of ["cx", "cy", "r"]) if (k in d) d[k] = toMm(d[k]);
  }
  for (const t of imp.texts) { t.x = toMm(t.x); t.y = toMm(t.y); t.size = toMm(t.size); }

  // Raster images: where each picture lies in the plan, for an underlay.
  const ids = new Set(imp.drawings.map((d) => d.id));
  const images = imp.images.filter((im) => ids.has(im.drawing)).map((im) => {
    const tl = im.tl.map(toMm), tr = im.tr.map(toMm), bl = im.bl.map(toMm);
    return { file: im.file, drawing: im.drawing, layer: im.layer, x: tl[0], y: tl[1], w: Math.hypot(tr[0] - tl[0], tr[1] - tl[1]), h: Math.hypot(bl[0] - tl[0], bl[1] - tl[1]), rot: (Math.atan2(tr[1] - tl[1], tr[0] - tl[0]) * 180) / Math.PI };
  });

  const layers = [];
  const listed = new Set();
  for (const it of [...imp.drawings, ...imp.texts]) {
    const name = it.layer;
    if (listed.has(name)) continue;
    listed.add(name);
    const l = layerTable.get(name.toUpperCase()) || imp.layerInfo.get(name.toUpperCase());
    layers.push({ id: name, name, color: l ? l.color : FOREGROUND, visible: l ? l.visible : true });
  }
  return {
    drawings: imp.drawings,
    texts: imp.texts,
    layers,
    units: unit,
    scale,
    bounds: itemBounds(imp.drawings, imp.texts),
    warnings: [...imp.warnings],
    counts,
    layouts: layouts.map((l) => l.name),
    images,
    xrefs: { missing: imp.missingXrefs, loaded: [...imp.loadedXrefs] },
  };
}

// ================================================================ export

// Semantic layers of the exported plan (AIA/NCS names).
export const DXF_LAYERS = [
  { name: "A-WALL", color: 7, linetype: "CONTINUOUS", description: "Walls (cut outline of every solid piece)" },
  { name: "A-WALL-EXST", color: 8, linetype: "CONTINUOUS", description: "Existing walls (phase \"existing\")" },
  { name: "A-WALL-DEMO", color: 1, linetype: "DASHED", description: "Walls to be demolished (phase \"demolish\")" },
  { name: "A-WALL-PATT", color: 9, linetype: "CONTINUOUS", description: "Layer boundaries inside typed walls" },
  { name: "A-DOOR", color: 30, linetype: "CONTINUOUS", description: "Doors: leaves, swings, sliding and garage doors, tags" },
  { name: "A-DOOR-DEMO", color: 1, linetype: "DASHED", description: "Doors to be demolished" },
  { name: "A-GLAZ", color: 4, linetype: "CONTINUOUS", description: "Windows: frame and glass lines, tags" },
  { name: "A-GLAZ-DEMO", color: 1, linetype: "DASHED", description: "Windows to be demolished" },
  { name: "A-MASS", color: 140, linetype: "CONTINUOUS", description: "Mass model outlines and heights" },
  { name: "S-GRID", color: 2, linetype: "CENTER", description: "Structural grid lines" },
  { name: "S-GRID-IDEN", color: 2, linetype: "CONTINUOUS", description: "Structural grid bubbles and labels" },
  { name: "A-AREA", color: 8, linetype: "CONTINUOUS", description: "Room outlines" },
  { name: "A-AREA-IDEN", color: 7, linetype: "CONTINUOUS", description: "Room names and areas" },
  { name: "A-FURN", color: 9, linetype: "CONTINUOUS", description: "Furniture and fixtures (top view)" },
  { name: "A-FLOR-STRS", color: 6, linetype: "CONTINUOUS", description: "Stairs: outline, treads, walking line and arrow" },
  { name: "A-COLS", color: 7, linetype: "CONTINUOUS", description: "Columns" },
  { name: "A-ROOF", color: 32, linetype: "DASHED", description: "Roof outline, ridges and hips above" },
  { name: "A-ANNO-DIMS", color: 1, linetype: "CONTINUOUS", description: "Dimensions" },
  { name: "A-ANNO-TEXT", color: 7, linetype: "CONTINUOUS", description: "Notes and labels" },
];
DXF_LAYERS.push(...ELEMENT_DXF_LAYERS); // slabs, ceilings, beams, railings, ramps, shafts, curtain walls

const LINETYPES = [
  { name: "CONTINUOUS", desc: "Solid line", dashes: [] },
  { name: "DASHED", desc: "Dashed __ __ __ __", dashes: [12.7, -6.35] },
  { name: "HIDDEN", desc: "Hidden __ __ __ __", dashes: [6.35, -3.175] },
  { name: "CENTER", desc: "Center ____ _ ____ _ ____", dashes: [31.75, -6.35, 6.35, -6.35] },
];

const WALL_PHASE_LAYER = { existing: "A-WALL-EXST", demolish: "A-WALL-DEMO" };
const GRID_BUBBLE = 380; // radius, and how far the centre sits past the line end

const fmt = (v) => {
  const n = Math.round((+v || 0) * 1e6) / 1e6;
  return Object.is(n, -0) || Math.abs(n) < 1e-9 ? "0" : String(n);
};

// Text for a DXF string value: non-ASCII as \U+XXXX; a literal "%%" (which
// would start a control code) is written as two "%%%" escapes.
export function encodeDxfText(s) {
  let out = "";
  for (const ch of String(s).replace(/%%/g, "%%%%%%")) {
    for (let i = 0; i < ch.length; i++) {
      const c = ch.charCodeAt(i);
      if (c < 32) continue;
      out += c > 126 ? `\\U+${c.toString(16).toUpperCase().padStart(4, "0")}` : ch[i];
    }
  }
  return out;
}

function layerName(s) {
  const n = encodeDxfText(String(s ?? "").replace(/[<>/\\":;?*|=`,]/g, "_").trim());
  return n || "0";
}

class DxfWriter {
  constructor() {
    this.out = [];
    this.ext = null;
  }
  g(code, value) { this.out.push(String(code).padStart(3, " "), String(value)); }
  n(code, v) { this.g(code, fmt(v)); }
  // Grow the drawing extents by a plan point.
  track(x, y) {
    const X = x, Y = -y;
    if (!this.ext) this.ext = { x1: X, y1: Y, x2: X, y2: Y };
    else { this.ext.x1 = Math.min(this.ext.x1, X); this.ext.y1 = Math.min(this.ext.y1, Y); this.ext.x2 = Math.max(this.ext.x2, X); this.ext.y2 = Math.max(this.ext.y2, Y); }
  }
  // Plan point → DXF point (y flipped).
  p(code, x, y) {
    this.track(x, y);
    this.n(code, x);
    this.n(code + 10, -y);
    this.n(code + 20, 0);
  }
  head(type, layer, o = {}) {
    this.g(0, type);
    this.g(8, layer);
    if (o.linetype) this.g(6, o.linetype);
    if (o.color !== undefined && o.color !== null) this.g(62, o.color);
  }
  line(layer, a, b, o) {
    this.head("LINE", layer, o);
    this.p(10, a[0], a[1]);
    this.p(11, b[0], b[1]);
  }
  poly(layer, pts, closed = true, o) {
    if (pts.length < 2) return;
    this.head("POLYLINE", layer, o);
    this.g(66, 1);
    this.n(10, 0); this.n(20, 0); this.n(30, 0);
    this.g(70, closed ? 1 : 0);
    for (const [x, y] of pts) { this.g(0, "VERTEX"); this.g(8, layer); this.p(10, x, y); }
    this.g(0, "SEQEND");
    this.g(8, layer);
  }
  circle(layer, cx, cy, r, o) {
    this.head("CIRCLE", layer, o);
    this.p(10, cx, cy);
    this.n(40, r);
    this.track(cx - r, cy - r);
    this.track(cx + r, cy + r);
  }
  // Plan arc with canvas semantics (degrees).
  arc(layer, cx, cy, r, a1, a2, ccw, o) {
    if (Math.abs(a2 - a1) >= 360 - 1e-9) return this.circle(layer, cx, cy, r, o);
    // Canvas clockwise-in-plan (ccw = false) runs from a1 up to a2, i.e. DXF
    // counter-clockwise from −a2 to −a1; ccw = true runs from −a1 to −a2.
    const s = norm360(ccw ? -a1 : -a2), e = norm360(ccw ? -a2 : -a1);
    this.head("ARC", layer, o);
    this.p(10, cx, cy);
    this.n(40, r);
    this.n(50, s);
    this.n(51, e);
    for (const a of [s, e, ...[0, 90, 180, 270].filter((q) => norm360(q - s) <= norm360(e - s))]) this.track(cx + r * Math.cos(a * DEG), cy - r * Math.sin(a * DEG));
  }
  // Text anchored at plan (x, y): align left|center|right, valign top|middle|baseline.
  text(layer, str, x, y, size, { rot = 0, align = "left", valign = "top", ...o } = {}) {
    const s = encodeDxfText(str);
    if (!s.trim()) return;
    const hj = { left: 0, center: 1, right: 2 }[align] ?? 0;
    const vj = { baseline: 0, bottom: 1, middle: 2, top: 3 }[valign] ?? 0;
    this.head("TEXT", layer, o);
    this.p(10, x, y);
    this.n(40, size);
    this.g(1, s);
    if (rot) this.n(50, norm360(-rot));
    this.g(7, "STANDARD");
    if (hj) this.g(72, hj);
    if (hj || vj) this.p(11, x, y);
    if (vj) this.g(73, vj);
  }
}

// Plan symbol pieces of one opening, as in plan/render.js drawOpening().
// Demolished doors and windows go to their -DEMO layers; the dashed faces of
// a plain opening belong to the wall (`wallLayer`).
function exportOpening(W, w, s, tag, wallLayer = "A-WALL") {
  const op = s.o;
  const demo = op.phase === "demolish" ? "-DEMO" : "";
  const f = wallFrame(w);
  const t = w.thickness / 2;
  const P = (u, v) => wallPoint(w, u, v);
  if (op.kind === "window") {
    const L = `A-GLAZ${demo}`;
    W.line(L, P(s.u1, t), P(s.u2, t));
    W.line(L, P(s.u1, -t), P(s.u2, -t));
    const g = Math.min(30, t * 0.3);
    W.line(L, P(s.u1, g), P(s.u2, g));
    W.line(L, P(s.u1, -g), P(s.u2, -g));
    if (op.type === "sliding") W.line(L, P(s.u1, 0), P((s.u1 + s.u2) / 2 + 40, 0));
  } else if (op.kind === "opening") {
    W.line(wallLayer, P(s.u1, t), P(s.u2, t), { linetype: "HIDDEN" });
    W.line(wallLayer, P(s.u1, -t), P(s.u2, -t), { linetype: "HIDDEN" });
  } else {
    const L = `A-DOOR${demo}`;
    const side = op.side || 1;
    const face = side * t;
    const width = s.u2 - s.u1;
    const leaf = (hingeU, len, dir) => {
      const hinge = P(hingeU, face);
      const tip = [hinge[0] + f.n[0] * side * len, hinge[1] + f.n[1] * side * len];
      W.line(L, hinge, tip);
      const a0 = Math.atan2(tip[1] - hinge[1], tip[0] - hinge[0]);
      const closed = P(hingeU + dir * len, face);
      const a1 = Math.atan2(closed[1] - hinge[1], closed[0] - hinge[0]);
      let sweep = a1 - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      W.arc(L, hinge[0], hinge[1], len, a0 / DEG, (a0 + sweep) / DEG, sweep < 0);
    };
    if (op.type === "sliding") {
      const half = width / 2;
      W.line(L, P(s.u1, 25), P(s.u1 + half + 50, 25));
      W.line(L, P(s.u2 - half - 50, -25), P(s.u2, -25));
    } else if (op.type === "garage") {
      W.line(L, P(s.u1, face), P(s.u2, face), { linetype: "DASHED" });
      W.line(L, P(s.u1, face + side * 600), P(s.u2, face + side * 600), { linetype: "DASHED" });
    } else if (op.type === "double") {
      leaf(s.u1, width / 2, 1);
      leaf(s.u2, width / 2, -1);
    } else if (op.hinge === "end") leaf(s.u2, width, -1);
    else leaf(s.u1, width, 1);
  }
  if (tag) {
    const [x, y] = P((s.u1 + s.u2) / 2, -(op.side || 1) * (t + 220));
    W.text(`${op.kind === "window" ? "A-GLAZ" : "A-DOOR"}${demo}`, tag, x, y, 160, { align: "center", valign: "middle" });
  }
}

// Lines between the layers of a typed wall, clipped to one solid piece.
// Layers run from the left face (v = +t) to the right face (v = −t).
function exportWallLayers(W, w, wt, piece) {
  const uv = piece.map(([x, y]) => wallUV(w, x, y));
  let v = w.thickness / 2;
  for (const layer of wt.layers.slice(0, -1)) {
    v -= layer.thickness;
    // Where the line v = const crosses the piece outline, sorted along u.
    const us = [];
    for (let i = 0; i < uv.length; i++) {
      const a = uv[i], b = uv[(i + 1) % uv.length];
      if ((a.v - v) * (b.v - v) < 0 || (a.v === v && b.v !== v)) us.push(a.u + ((v - a.v) * (b.u - a.u)) / (b.v - a.v));
    }
    us.sort((x, y) => x - y);
    for (let i = 0; i + 1 < us.length; i += 2) {
      if (us[i + 1] - us[i] > 0.5) W.line("A-WALL-PATT", wallPoint(w, us[i], v), wallPoint(w, us[i + 1], v));
    }
  }
}

// A structural grid line with a numbered bubble past each end.
function exportGrid(W, g) {
  const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
  if (!(len > 0)) return;
  const d = [(g.x2 - g.x1) / len, (g.y2 - g.y1) / len];
  W.line("S-GRID", [g.x1, g.y1], [g.x2, g.y2]);
  for (const [x, y, k] of [[g.x1, g.y1, -1], [g.x2, g.y2, 1]]) {
    const c = [x + d[0] * GRID_BUBBLE * k, y + d[1] * GRID_BUBBLE * k];
    W.circle("S-GRID-IDEN", c[0], c[1], GRID_BUBBLE);
    if (g.label) W.text("S-GRID-IDEN", g.label, c[0], c[1], 300, { align: "center", valign: "middle" });
  }
}

function ellipsePoly(item, cx, cy, rx, ry, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push(toWorld(item, cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return pts;
}

// Furniture: a block per distinct piece (kind and size) and an INSERT for
// each placement where the writer has blocks (2000+), loose lines in R12.
function exportFurniture(W, f) {
  if (!W.defineBlock) return drawFurniture(W, f, "A-FURN");
  const local = { ...f, x: 0, y: 0, rot: 0 };
  const r = (v) => Math.round((+v || 0) * 100) / 100;
  const key = `${f.kind}|${r(f.w)}|${r(f.d)}|${r(f.h)}|${f.kind === "model" ? f.model || "" : ""}`;
  const name = W.defineBlock(key, layerName(`FURN_${String(f.kind || "item").toUpperCase()}_${Math.round(f.w)}x${Math.round(f.d)}`), (B) => drawFurniture(B, local, "0"));
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toWorld(f, (a * f.w) / 2, (b * f.d) / 2));
  W.insert("A-FURN", name, f.x, f.y, f.rot || 0, undefined, corners);
}

function drawFurniture(W, f, L) {
  const rect = (cx, cy, w, d) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toWorld(f, cx + (a * w) / 2, cy + (b * d) / 2));
  if (f.kind === "model") { W.poly(L, rect(0, 0, f.w, f.d)); return; }
  for (const p of furnitureParts(f)) {
    if (p.t === "box") W.poly(L, rect(p.x, p.y, p.w, p.d));
    else if (p.t === "cyl") {
      if (Math.abs(p.rx - p.ry) < 1e-6) { const [x, y] = toWorld(f, p.x, p.y); W.circle(L, x, y, Math.max(1, p.rx)); } else W.poly(L, ellipsePoly(f, p.x, p.y, Math.max(1, p.rx), Math.max(1, p.ry)));
    } else { const [x, y] = toWorld(f, p.x, p.y); W.circle(L, x, y, Math.max(1, p.r)); }
  }
}

function exportStair(W, s) {
  const L = "A-FLOR-STRS";
  const g = stairGeometry(s);
  W.poly(L, g.outline);
  for (let i = 1; i < s.steps; i++) {
    const u = -g.L / 2 + (g.L * i) / s.steps;
    W.line(L, g.P(u, -g.W / 2), g.P(u, g.W / 2));
  }
  W.line(L, g.P(-g.L / 2 + 150, 0), g.P(g.L / 2 - 80, 0));
  const a = 160;
  W.poly(L, [g.P(g.L / 2 - 80, 0), g.P(g.L / 2 - 80 - a, -a * 0.5), g.P(g.L / 2 - 80 - a, a * 0.5)]);
  const [cx, cy] = g.P(-g.L / 2 + 150, 0);
  W.circle(L, cx, cy, 45);
  const [tx, ty] = g.P(-g.L / 2 + 420, -g.W / 4);
  W.text(L, "UP", tx, ty, 170, { rot: s.rot || 0, align: "center", valign: "middle" });
}

function exportDimension(W, d) {
  const L = "A-ANNO-DIMS";
  const g = dimensionGeometry(d);
  const sg = Math.sign(d.offset || 1);
  const ext = sg * 120;
  W.line(L, [d.x1 + g.nx * sg * 60, d.y1 + g.ny * sg * 60], [g.a[0] + g.nx * ext, g.a[1] + g.ny * ext]);
  W.line(L, [d.x2 + g.nx * sg * 60, d.y2 + g.ny * sg * 60], [g.b[0] + g.nx * ext, g.b[1] + g.ny * ext]);
  W.line(L, [g.a[0] - g.ux * 120, g.a[1] - g.uy * 120], [g.b[0] + g.ux * 120, g.b[1] + g.uy * 120]);
  for (const q of [g.a, g.b]) {
    const k = 90;
    W.line(L, [q[0] - (g.ux + g.nx) * k, q[1] - (g.uy + g.ny) * k], [q[0] + (g.ux + g.nx) * k, q[1] + (g.uy + g.ny) * k]);
  }
  let ang = (Math.atan2(g.uy, g.ux) * 180) / Math.PI;
  if (ang > 90.5 || ang < -89.5) ang += 180;
  const mid = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
  const label = d.label || fmtLen(g.L, "mm").replace(" mm", "");
  const tz = 180;
  const k = tz * 0.75 * sg;
  W.text(L, label, mid[0] + g.nx * k, mid[1] + g.ny * k, tz, { rot: ang, align: "center", valign: "middle" });
}

/**
 * Export one level of a project as a DXF in millimetres: AutoCAD R12
 * (AC1009, the default, which every CAD program reads) or, with `version`
 * "2000" | "2004" | "2007" | "2010" | "2013" | "2018", the newer format
 * written by dxfmodern.js (handles, LWPOLYLINE, MTEXT, furniture blocks,
 * true colour, lineweights, layer descriptions).
 * Defaults to the level shown in the plan (project.view.level).
 */
export function exportDxf(project, { level, version = "R12" } = {}) {
  const p = project;
  const L = level ?? (p.view && p.view.level) ?? (p.levels[0] && p.levels[0].id);
  const on = (list) => (list || []).filter((it) => it.level === L);
  const modern = String(version).toUpperCase() !== "R12";
  const W = modern ? new ModernDxfWriter(version, { encodeText: encodeDxfText }) : new DxfWriter();

  // Walls: one closed polyline per solid piece.
  const walls = on(p.walls);
  const outlines = wallOutlines(walls, { draw: false });
  for (const w of walls) {
    const ol = outlines.get(w.id);
    if (!ol || isCurtainWall(p, w)) continue; // curtain walls: dxf-elements.js
    const wt = wallTypeOf(p, w);
    for (const pc of wallPieces(p, w, ol.poly)) {
      W.poly(WALL_PHASE_LAYER[w.phase] || "A-WALL", pc);
      if (wt && wt.layers.length > 1) exportWallLayers(W, w, wt, pc);
    }
  }
  const tags = openingTags(p);
  for (const w of walls) for (const s of openingSpans(p, w)) exportOpening(W, w, s, tags.get(s.o.id), WALL_PHASE_LAYER[w.phase] || "A-WALL");

  for (const r of on(p.rooms)) {
    W.poly("A-AREA", r.pts);
    const [x, y] = r.label ? r.label : roomLabelPoint(r);
    const nameSize = r.textSize || 250;
    const showArea = r.showArea !== false;
    if (r.name) W.text("A-AREA-IDEN", r.name, x, y - (showArea ? nameSize * 0.45 : 0), nameSize, { align: "center", valign: "middle" });
    if (showArea) W.text("A-AREA-IDEN", fmtArea(roomArea(r), "mm"), x, y + (r.name ? nameSize * 0.6 : 0), r.textSize ? nameSize * 0.72 : 180, { align: "center", valign: "middle" });
  }

  for (const f of on(p.furniture)) exportFurniture(W, f);
  for (const s of on(p.stairs).filter((x) => !x.shape)) exportStair(W, s); // L, U, spiral: dxf-elements.js

  for (const c of on(p.columns)) {
    if (c.shape === "round") {
      if (Math.abs(c.w - c.d) < 1e-6) W.circle("A-COLS", c.x, c.y, c.w / 2);
      else W.poly("A-COLS", ellipsePoly(c, 0, 0, c.w / 2, c.d / 2));
    } else W.poly("A-COLS", [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toWorld(c, (a * c.w) / 2, (b * c.d) / 2)));
  }

  for (const s of on(p.solids)) {
    W.poly("A-MASS", s.pts);
    const [cx, cy] = polygonCentroid(s.pts);
    W.text("A-MASS", `H=${Math.round(s.height)}`, cx, cy, 180, { align: "center", valign: "middle" });
  }

  // The structural grid is shared by every level.
  for (const g of p.grids || []) exportGrid(W, g);

  for (const r of on(p.roofs)) {
    const m = roofModel(r, roofBase(p, r));
    W.poly("A-ROOF", m.outline);
    for (const [x1, y1, x2, y2] of m.lines) W.line("A-ROOF", [x1, y1], [x2, y2]);
  }

  exportElementsDxf(W, p, L); // slabs, ceilings, beams, railings, ramps, shafts, curtain walls, stairs by type

  for (const d of on(p.dimensions)) exportDimension(W, d);

  for (const tx of on(p.texts)) {
    const size = tx.size || 300;
    const down = rotPt(0, size * 1.25, tx.rot || 0);
    const lines = String(tx.text ?? "").split("\n");
    if (W.mtextBlock && lines.length > 1) { W.mtextBlock("A-ANNO-TEXT", lines, tx.x, tx.y, size, { rot: tx.rot || 0, align: tx.align || "left" }); continue; }
    lines.forEach((ln, i) => {
      W.text("A-ANNO-TEXT", ln, tx.x + down[0] * i, tx.y + down[1] * i, size, { rot: tx.rot || 0, align: tx.align || "left", valign: "top" });
    });
  }

  // The project's own CAD layers.
  const layerById = new Map((p.layers || []).map((l) => [l.id, l]));
  const userLayers = new Map();
  const userLayer = (id) => {
    const l = layerById.get(id) || { id, name: id, color: FOREGROUND, visible: true };
    const name = layerName(l.name || l.id);
    if (!userLayers.has(name)) userLayers.set(name, { name, color: hexToAci(l.color), trueColor: l.color, visible: l.visible !== false });
    return name;
  };
  for (const d of on(p.drawings)) {
    const name = userLayer(d.layer || "0");
    const o = d.color ? { color: hexToAci(d.color), trueColor: d.color } : {};
    if (d.kind === "circle") W.circle(name, d.cx, d.cy, d.r, o);
    else if (d.kind === "arc") W.arc(name, d.cx, d.cy, d.r, d.a1, d.a2, !!d.ccw, o);
    else {
      const pts = d.pts || [];
      if (pts.length === 2 && !d.closed) W.line(name, pts[0], pts[1], o);
      else W.poly(name, pts, !!d.closed, o);
    }
  }

  // ---------------------------------------------------------------- assemble
  if (modern) {
    const layers = [{ name: "0", color: 7, linetype: "CONTINUOUS", visible: true }, ...DXF_LAYERS.map((l) => ({ ...l, visible: true, lineweight: LAYER_LINEWEIGHTS[l.name] }))];
    for (const l of userLayers.values()) {
      const i = layers.findIndex((a) => a.name.toUpperCase() === l.name.toUpperCase());
      if (i >= 0) layers[i] = { ...layers[i], color: l.color, trueColor: l.trueColor, visible: l.visible };
      else layers.push({ ...l, linetype: "CONTINUOUS" });
    }
    return W.document({ layers, linetypes: LINETYPES, ltscale: 20, title: (p.meta && p.meta.title) || "" });
  }
  const H = new DxfWriter();
  const ext = W.ext || { x1: 0, y1: 0, x2: 0, y2: 0 };
  H.g(0, "SECTION"); H.g(2, "HEADER");
  H.g(9, "$ACADVER"); H.g(1, "AC1009");
  H.g(9, "$DWGCODEPAGE"); H.g(3, "ANSI_1252");
  H.g(9, "$INSBASE"); H.n(10, 0); H.n(20, 0); H.n(30, 0);
  H.g(9, "$EXTMIN"); H.n(10, ext.x1); H.n(20, ext.y1); H.n(30, 0);
  H.g(9, "$EXTMAX"); H.n(10, ext.x2); H.n(20, ext.y2); H.n(30, 0);
  H.g(9, "$LTSCALE"); H.n(40, 20);
  H.g(9, "$INSUNITS"); H.g(70, 4);
  H.g(9, "$MEASUREMENT"); H.g(70, 1);
  H.g(0, "ENDSEC");

  H.g(0, "SECTION"); H.g(2, "TABLES");
  H.g(0, "TABLE"); H.g(2, "LTYPE"); H.g(70, LINETYPES.length);
  for (const lt of LINETYPES) {
    H.g(0, "LTYPE"); H.g(2, lt.name); H.g(70, 0); H.g(3, lt.desc); H.g(72, 65);
    H.g(73, lt.dashes.length); H.n(40, lt.dashes.reduce((s, v) => s + Math.abs(v), 0));
    for (const d of lt.dashes) H.n(49, d);
  }
  H.g(0, "ENDTAB");
  const allLayers = [{ name: "0", color: 7, linetype: "CONTINUOUS", visible: true }, ...DXF_LAYERS.map((l) => ({ ...l, visible: true }))];
  for (const l of userLayers.values()) {
    const i = allLayers.findIndex((a) => a.name.toUpperCase() === l.name.toUpperCase());
    if (i >= 0) allLayers[i] = { ...allLayers[i], color: l.color, visible: l.visible };
    else allLayers.push({ ...l, linetype: "CONTINUOUS" });
  }
  H.g(0, "TABLE"); H.g(2, "LAYER"); H.g(70, allLayers.length);
  for (const l of allLayers) {
    H.g(0, "LAYER"); H.g(2, l.name); H.g(70, 0); H.g(62, l.visible ? l.color : -l.color); H.g(6, l.linetype);
  }
  H.g(0, "ENDTAB");
  H.g(0, "TABLE"); H.g(2, "STYLE"); H.g(70, 1);
  H.g(0, "STYLE"); H.g(2, "STANDARD"); H.g(70, 0); H.n(40, 0); H.n(41, 1); H.n(50, 0); H.g(71, 0); H.n(42, 250); H.g(3, "txt"); H.g(4, "");
  H.g(0, "ENDTAB");
  H.g(0, "TABLE"); H.g(2, "APPID"); H.g(70, 1);
  H.g(0, "APPID"); H.g(2, "ACAD"); H.g(70, 0);
  H.g(0, "ENDTAB");
  H.g(0, "ENDSEC");

  H.g(0, "SECTION"); H.g(2, "BLOCKS"); H.g(0, "ENDSEC");
  H.g(0, "SECTION"); H.g(2, "ENTITIES");
  for (const line of W.out) H.out.push(line); // a spread overflows the call stack on big floors
  H.g(0, "ENDSEC");
  H.g(0, "EOF");
  return H.out.join("\n") + "\n";
}

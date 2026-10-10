// SVG import: turns the vector content of an SVG file into CAD layer geometry
// (plan millimetres) on a layer named "SVG". There is no DOM here, so the file
// is read with a small XML tokenizer and the drawing is walked by hand.
//
// Every element is mapped to millimetres through a 2D affine matrix
// [a, b, c, d, e, f] (the SVG matrix() convention): the root viewport
// (width/height/viewBox/preserveAspectRatio), then each group's and the
// element's own transform. SVG is y-down like the plan, so nothing is flipped.
// Curves are transformed as Bézier control points and flattened afterwards
// with adaptive subdivision, so the result is exact under any transform;
// circles stay circles only while the matrix is a similarity.

import { uid } from "../core/geom.js";

const PX = 25.4 / 96; // one CSS pixel (= one SVG user unit by default) in mm
const LAYER = { id: "SVG", name: "SVG", color: "#9aa4b5", visible: true };
const DEG = Math.PI / 180;

// ================================================================ matrices

const IDENTITY = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const scale = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
function rotate(a) {
  const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
  return [c, s, -s, c, 0, 0];
}
function isSimilarity(m) {
  const a = Math.hypot(m[0], m[1]), b = Math.hypot(m[2], m[3]);
  if (!(a > 0 && b > 0)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(a, b) && Math.abs(m[0] * m[2] + m[1] * m[3]) <= 1e-9 * a * b;
}

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const numbers = (s) => (String(s ?? "").match(NUM) || []).map(Number);

export function parseTransform(s) {
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(String(s || "")))) {
    const v = numbers(t[2]);
    let k = IDENTITY;
    switch (t[1]) {
      case "matrix": if (v.length >= 6) k = v.slice(0, 6); break;
      case "translate": k = translate(v[0] || 0, v[1] || 0); break;
      case "scale": k = scale(v[0] ?? 1, v[1] ?? v[0] ?? 1); break;
      case "rotate":
        k = v.length >= 3 ? mul(translate(v[1], v[2]), mul(rotate(v[0]), translate(-v[1], -v[2]))) : rotate(v[0] || 0);
        break;
      case "skewX": k = [1, 0, Math.tan((v[0] || 0) * DEG), 1, 0, 0]; break;
      case "skewY": k = [1, Math.tan((v[0] || 0) * DEG), 0, 1, 0, 0]; break;
    }
    m = mul(m, k);
  }
  return m;
}

// ================================================================ XML

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: "\"", apos: "'", nbsp: " " };
const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === "#") {
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : all;
  }
  return ENTITIES[e.toLowerCase()] ?? all;
});

// XML text → tree of {name, attrs, children}; text nodes are {text}.
export function parseXml(src) {
  const root = { name: "#document", attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const n = src.length;
  let i = 0;
  const addText = (s) => { if (s) top().children.push({ text: s }); };
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { addText(decodeEntities(src.slice(i))); break; }
    if (lt > i) addText(decodeEntities(src.slice(i, lt)));
    if (src.startsWith("<!--", lt)) { const e = src.indexOf("-->", lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt + 9);
      addText(src.slice(lt + 9, e < 0 ? n : e));
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith("<?", lt)) { const e = src.indexOf("?>", lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith("<!", lt)) {
      // DOCTYPE, possibly with an internal subset in [ ].
      let j = lt + 2, depth = 0;
      for (; j < n; j++) {
        const c = src[j];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    if (src[lt + 1] === "/") {
      const e = src.indexOf(">", lt);
      const name = src.slice(lt + 2, e < 0 ? n : e).trim();
      const k = stack.map((el) => el.name).lastIndexOf(name);
      if (k > 0) stack.length = k;
      i = e < 0 ? n : e + 1;
      continue;
    }
    // Start tag.
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const el = { name: src.slice(lt + 1, j), attrs: {}, children: [] };
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === ">") { j++; break; }
      if (src[j] === "/" && src[j + 1] === ">") { selfClose = true; j += 2; break; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(src[k])) k++;
      const name = src.slice(j, k);
      j = k;
      while (j < n && /\s/.test(src[j])) j++;
      let value = "";
      if (src[j] === "=") {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === "\"" || q === "'") {
          const e = src.indexOf(q, j + 1);
          value = src.slice(j + 1, e < 0 ? n : e);
          j = e < 0 ? n : e + 1;
        } else {
          let e = j;
          while (e < n && !/[\s>]/.test(src[e])) e++;
          value = src.slice(j, e);
          j = e;
        }
      }
      if (name) el.attrs[name] = decodeEntities(value);
      else j++;
    }
    top().children.push(el);
    if (!selfClose) stack.push(el);
    i = j;
  }
  return root;
}

const local = (name) => String(name).replace(/^svg:/, "");

// ================================================================ styles

const NAMED = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00",
  cyan: "#00ffff", aqua: "#00ffff", magenta: "#ff00ff", fuchsia: "#ff00ff", gray: "#808080", grey: "#808080", silver: "#c0c0c0",
  maroon: "#800000", olive: "#808000", navy: "#000080", purple: "#800080", teal: "#008080", orange: "#ffa500", brown: "#a52a2a",
  pink: "#ffc0cb", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", lightgray: "#d3d3d3", lightgrey: "#d3d3d3",
};

// CSS colour → "#rrggbb", null for none, undefined when not a plain colour.
export function parseColor(v, current) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (s === "none" || s === "transparent") return null;
  if (s === "currentcolor") return current === undefined ? undefined : parseColor(current);
  let m = /^#([0-9a-f]{3,4})$/.exec(s);
  if (m) return `#${[...m[1].slice(0, 3)].map((c) => c + c).join("")}`;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return `#${m[1]}`;
  m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    if (parts.length < 3) return undefined;
    const ch = parts.map((p) => {
      const n = parseFloat(p);
      const v8 = p.endsWith("%") ? (n * 255) / 100 : n;
      return Math.round(Math.max(0, Math.min(255, v8))).toString(16).padStart(2, "0");
    });
    return `#${ch.join("")}`;
  }
  return NAMED[s];
}

function parseDecls(s) {
  const out = {};
  for (const d of String(s || "").split(";")) {
    const k = d.indexOf(":");
    if (k > 0) out[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).replace(/!important/i, "").trim();
  }
  return out;
}

// Simple CSS from <style>: selectors "tag", ".cls", "#id", "tag.cls".
function parseCss(text) {
  const rules = [];
  const src = String(text).replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const decls = parseDecls(m[2]);
    for (const sel of m[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      const s = /^([a-zA-Z][\w-]*)?(?:([.#])([\w-]+))?$/.exec(sel);
      if (s && (s[1] || s[3])) rules.push({ tag: s[1] || null, kind: s[2] || null, name: s[3] || null, decls });
    }
  }
  return rules;
}

const INHERITED = ["stroke", "fill", "font-size", "text-anchor", "visibility", "color"];

function computeStyle(el, parent, rules) {
  const own = {};
  for (const k of [...INHERITED, "display"]) if (el.attrs[k] !== undefined) own[k] = el.attrs[k];
  const classes = String(el.attrs.class || "").split(/\s+/).filter(Boolean);
  for (const r of rules) {
    if (r.tag && r.tag !== local(el.name)) continue;
    if (r.kind === "." && !classes.includes(r.name)) continue;
    if (r.kind === "#" && el.attrs.id !== r.name) continue;
    Object.assign(own, r.decls);
  }
  Object.assign(own, parseDecls(el.attrs.style));
  const st = {};
  for (const k of INHERITED) st[k] = parent[k];
  for (const k of INHERITED) if (own[k] !== undefined && own[k] !== "inherit") st[k] = own[k];
  if (own["font-size"] !== undefined) st["font-size"] = fontSize(own["font-size"], parent["font-size"]);
  st.display = own.display;
  return st;
}

// Font size in user units (px).
function fontSize(v, parentSize = 16) {
  const s = String(v).trim().toLowerCase();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return parentSize;
  if (s.endsWith("em")) return n * parentSize;
  if (s.endsWith("%")) return (n * parentSize) / 100;
  if (s.endsWith("pt")) return (n * 4) / 3;
  if (s.endsWith("pc")) return n * 16;
  if (s.endsWith("mm")) return n / PX;
  if (s.endsWith("cm")) return (n * 10) / PX;
  if (s.endsWith("in")) return n * 96;
  return n;
}

// Absolute length → millimetres (unitless = px), or null for % and invalid.
function lengthMm(v) {
  const s = String(v ?? "").trim().toLowerCase();
  const n = parseFloat(s);
  if (!Number.isFinite(n) || s.endsWith("%")) return null;
  if (s.endsWith("mm")) return n;
  if (s.endsWith("cm")) return n * 10;
  if (s.endsWith("in")) return n * 25.4;
  if (s.endsWith("pt")) return (n * 25.4) / 72;
  if (s.endsWith("pc")) return (n * 25.4) / 6;
  if (s.endsWith("em")) return n * 16 * PX;
  return n * PX;
}

// ================================================================ paths

// Path data → subpaths [{start, segs: [{c1, c2, p}|{p}], closed}] in user units.
export function parsePathData(d) {
  const s = String(d || "");
  const n = s.length;
  let i = 0;
  const skip = () => { while (i < n && /[\s,]/.test(s[i])) i++; };
  const num = () => {
    skip();
    NUM.lastIndex = i;
    const m = NUM.exec(s);
    if (!m || m.index !== i) return NaN;
    i += m[0].length;
    return +m[0];
  };
  const flag = () => {
    skip();
    const c = s[i];
    if (c !== "0" && c !== "1") return NaN;
    i++;
    return +c;
  };
  const paths = [];
  let sub = null;
  let cur = [0, 0], start = [0, 0];
  let lastC = null, lastQ = null;
  let cmd = null;
  const begin = (p) => { sub = { start: p, segs: [], closed: false }; paths.push(sub); };
  const line = (p) => { if (!sub) begin(cur); sub.segs.push({ p }); cur = p; };
  const cubic = (c1, c2, p) => { if (!sub) begin(cur); sub.segs.push({ c1, c2, p }); cur = p; };
  for (;;) {
    skip();
    if (i >= n) break;
    if (/[a-zA-Z]/.test(s[i])) {
      cmd = s[i++];
      if (cmd === "Z" || cmd === "z") {
        if (sub) { sub.closed = true; sub = null; }
        cur = start;
        lastC = lastQ = null;
        continue;
      }
    } else if (!cmd || cmd === "Z" || cmd === "z") break;
    const rel = cmd === cmd.toLowerCase();
    const at = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    const C = cmd.toUpperCase();
    let ok = true;
    let nextC = null, nextQ = null;
    if (C === "M") {
      const x = num(), y = num();
      if (Number.isNaN(y)) break;
      const p = at(x, y);
      begin(p);
      cur = start = p;
      cmd = rel ? "l" : "L";
    } else if (C === "L") {
      const x = num(), y = num();
      if ((ok = !Number.isNaN(y))) line(at(x, y));
    } else if (C === "H") {
      const x = num();
      if ((ok = !Number.isNaN(x))) line([rel ? cur[0] + x : x, cur[1]]);
    } else if (C === "V") {
      const y = num();
      if ((ok = !Number.isNaN(y))) line([cur[0], rel ? cur[1] + y : y]);
    } else if (C === "C" || C === "S") {
      let c1;
      if (C === "C") { const x1 = num(), y1 = num(); c1 = at(x1, y1); } else c1 = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur;
      const x2 = num(), y2 = num(), x = num(), y = num();
      if ((ok = !Number.isNaN(y) && !Number.isNaN(c1[1]))) {
        const c2 = at(x2, y2), p = at(x, y);
        cubic(c1, c2, p);
        nextC = c2;
      }
    } else if (C === "Q" || C === "T") {
      let q;
      if (C === "Q") { const x1 = num(), y1 = num(); q = at(x1, y1); } else q = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
      const x = num(), y = num();
      if ((ok = !Number.isNaN(y) && !Number.isNaN(q[1]))) {
        const p0 = cur, p = at(x, y);
        cubic([p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])], [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p);
        nextQ = q;
      }
    } else if (C === "A") {
      const rx = num(), ry = num(), phi = num(), fa = flag(), fs = flag(), x = num(), y = num();
      if ((ok = !Number.isNaN(y) && !Number.isNaN(fs) && !Number.isNaN(fa))) {
        const p = at(x, y);
        const segs = arcToCubics(cur, rx, ry, phi, fa, fs, p);
        if (!segs) line(p);
        else for (const sg of segs) cubic(sg.c1, sg.c2, sg.p);
      }
    } else break;
    if (!ok) break;
    lastC = nextC;
    lastQ = nextQ;
  }
  return paths.filter((pth) => pth.segs.length);
}

// SVG elliptical arc (endpoint form) → cubic Béziers, or null for a line.
// The last end point is the exact target so joins stay exact.
export function arcToCubics(p0, rx, ry, phiDeg, fa, fs, p1) {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!(rx > 0 && ry > 0)) return null;
  const phi = phiDeg * DEG, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
  const cx = cp * cx1 - sp * cy1 + (p0[0] + p1[0]) / 2, cy = sp * cx1 + cp * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const nSeg = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const h = dt / nSeg;
  const k = (4 / 3) * Math.tan(h / 4);
  const E = (x, y) => [cx + rx * cp * x - ry * sp * y, cy + rx * sp * x + ry * cp * y];
  const out = [];
  for (let s = 0; s < nSeg; s++) {
    const a = t1 + s * h, b = a + h;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    out.push({ c1: E(ca - k * sa, sa + k * ca), c2: E(cb + k * sb, sb - k * cb), p: s === nSeg - 1 ? p1 : E(cb, sb) });
  }
  return out;
}

// Ellipse as four cubic quarter arcs (closed subpath).
function ellipsePath(cx, cy, rx, ry) {
  const k = 0.5522847498307936;
  const P = (x, y) => [cx + x * rx, cy + y * ry];
  return {
    start: P(1, 0), closed: true,
    segs: [
      { c1: P(1, k), c2: P(k, 1), p: P(0, 1) },
      { c1: P(-k, 1), c2: P(-1, k), p: P(-1, 0) },
      { c1: P(-1, -k), c2: P(-k, -1), p: P(0, -1) },
      { c1: P(k, -1), c2: P(1, -k), p: P(1, 0) },
    ],
  };
}

function lineDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
}

// Adaptive subdivision of a cubic (already in mm) into `out`.
function flattenCubic(p0, p1, p2, p3, tol, out, depth = 0) {
  if (depth >= 12 || Math.max(lineDist(p1, p0, p3), lineDist(p2, p0, p3)) <= tol) { out.push(p3); return; }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = mid(p0, p1), b = mid(p1, p2), c = mid(p2, p3);
  const d = mid(a, b), e = mid(b, c), f = mid(d, e);
  flattenCubic(p0, a, d, f, tol, out, depth + 1);
  flattenCubic(f, e, c, p3, tol, out, depth + 1);
}

// Subpath in user units → polyline points in mm.
function flattenSubpath(sp, m) {
  const pts = [apply(m, sp.start)];
  let cur = pts[0];
  for (const sg of sp.segs) {
    const p = apply(m, sg.p);
    if (sg.c1) {
      const c1 = apply(m, sg.c1), c2 = apply(m, sg.c2);
      const xs = [cur[0], c1[0], c2[0], p[0]], ys = [cur[1], c1[1], c2[1], p[1]];
      const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      flattenCubic(cur, c1, c2, p, Math.max(size * 1e-3, 1e-6), pts);
      pts[pts.length - 1] = p;
    } else pts.push(p);
    cur = p;
  }
  return pts;
}

// ================================================================ walk

const SKIP = new Set(["defs", "symbol", "clipPath", "mask", "pattern", "marker", "linearGradient", "radialGradient", "style", "title", "desc", "metadata", "script", "filter", "foreignObject", "font", "font-face"]);
const GROUPS = new Set(["g", "a", "switch"]);

class SvgImporter {
  constructor(level, rules, ids) {
    this.level = level;
    this.rules = rules;
    this.ids = ids;
    this.drawings = [];
    this.texts = [];
    this.warnings = new Set();
  }

  // Outline colour: the stroke, else the fill (SVG fills default to black);
  // texts are painted with their fill first.
  color(st, textLike = false) {
    const stroke = parseColor(st.stroke, st.color);
    const fill = parseColor(st.fill ?? "black", st.color);
    return (textLike ? fill || stroke : stroke || fill) || undefined;
  }

  push(item, st) {
    const d = { id: uid("g"), level: this.level, layer: LAYER.id, ...item };
    const c = this.color(st);
    if (c) d.color = c;
    this.drawings.push(d);
  }

  subpaths(list, m, st) {
    for (const sp of list) {
      let pts = flattenSubpath(sp, m).map(([x, y]) => [round(x), round(y)]);
      pts = pts.filter((q, i) => !i || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
      if (sp.closed && pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      if (pts.length >= 2) this.push({ kind: "polyline", pts, closed: !!sp.closed && pts.length > 2 }, st);
    }
  }

  ellipse(cx, cy, rx, ry, m, st) {
    if (!(rx > 0 && ry > 0)) return;
    if (Math.abs(rx - ry) < 1e-12 && isSimilarity(m)) {
      const [x, y] = apply(m, [cx, cy]);
      this.push({ kind: "circle", cx: round(x), cy: round(y), r: round(rx * Math.hypot(m[0], m[1])) }, st);
    } else this.subpaths([ellipsePath(cx, cy, rx, ry)], m, st);
  }

  walk(el, m, parentStyle, depth = 0) {
    if (el.text !== undefined) return;
    const name = local(el.name);
    if (name.includes(":") || SKIP.has(name)) return;
    const st = computeStyle(el, parentStyle, this.rules);
    if (st.display === "none") return;
    const own = el.attrs.transform ? mul(m, parseTransform(el.attrs.transform)) : m;
    const a = (k, d = 0) => { const v = parseFloat(el.attrs[k]); return Number.isFinite(v) ? v : d; };
    const hidden = st.visibility === "hidden" || st.visibility === "collapse";
    switch (name) {
      case "g": case "a": case "switch":
        for (const c of el.children) this.walk(c, own, st, depth);
        return;
      case "svg": {
        // Nested viewport: position and viewBox scaling.
        let k = mul(own, translate(a("x"), a("y")));
        const vb = numbers(el.attrs.viewBox);
        const w = a("width", NaN), h = a("height", NaN);
        if (vb.length === 4 && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0) k = mul(k, mul(scale(w / vb[2], h / vb[3]), translate(-vb[0], -vb[1])));
        for (const c of el.children) this.walk(c, k, st, depth);
        return;
      }
      case "use": {
        const ref = String(el.attrs.href || el.attrs["xlink:href"] || "").replace(/^#/, "");
        const target = this.ids.get(ref);
        if (!target || depth > 16) { this.warnings.add(`<use> of "#${ref}" could not be resolved`); return; }
        const k = mul(own, translate(a("x"), a("y")));
        const t = local(target.name) === "symbol" ? { ...target, name: "g" } : target;
        this.walk(t, k, st, depth + 1);
        return;
      }
      case "text":
        if (!hidden) this.text(el, own, st);
        return;
    }
    if (hidden) return;
    switch (name) {
      case "path": return this.subpaths(parsePathData(el.attrs.d), own, st);
      case "line": return this.subpaths([{ start: [a("x1"), a("y1")], segs: [{ p: [a("x2"), a("y2")] }], closed: false }], own, st);
      case "polyline": case "polygon": {
        const v = numbers(el.attrs.points);
        const pts = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
        if (pts.length < 2) return;
        return this.subpaths([{ start: pts[0], segs: pts.slice(1).map((p) => ({ p })), closed: name === "polygon" }], own, st);
      }
      case "rect": {
        const x = a("x"), y = a("y"), w = a("width"), h = a("height");
        if (!(w > 0 && h > 0)) return;
        return this.subpaths([{ start: [x, y], segs: [{ p: [x + w, y] }, { p: [x + w, y + h] }, { p: [x, y + h] }], closed: true }], own, st);
      }
      case "circle": return this.ellipse(a("cx"), a("cy"), a("r"), a("r"), own, st);
      case "ellipse": return this.ellipse(a("cx"), a("cy"), a("rx"), a("ry"), own, st);
      case "image": this.warnings.add("Embedded images are not imported"); return;
      default:
        if (!GROUPS.has(name)) this.warnings.add(`<${name}> elements are not supported and were skipped`);
    }
  }

  // <text> with <tspan> children: one text item per positioned run.
  text(el, m, st) {
    const runs = [];
    const first = (v) => { const n = numbers(v); return n.length ? n[0] : undefined; };
    let pos = [first(el.attrs.x) ?? 0, first(el.attrs.y) ?? 0];
    pos = [pos[0] + (first(el.attrs.dx) ?? 0), pos[1] + (first(el.attrs.dy) ?? 0)];
    let run = null;
    const startRun = (p, s) => { run = { x: p[0], y: p[1], text: "", st: s }; runs.push(run); };
    const visit = (node, s) => {
      for (const c of node.children) {
        if (c.text !== undefined) {
          if (!run) startRun(pos, s);
          run.text += c.text.replace(/\s+/g, " ");
          continue;
        }
        const nm = local(c.name);
        if (nm !== "tspan" && nm !== "a" && nm !== "textPath") continue;
        const cs = computeStyle(c, s, this.rules);
        if (cs.display === "none") continue;
        const x = first(c.attrs.x), y = first(c.attrs.y), dx = first(c.attrs.dx), dy = first(c.attrs.dy);
        if (x !== undefined || y !== undefined || dx !== undefined || dy !== undefined) {
          pos = [(x ?? (run ? run.x : pos[0])) + (dx ?? 0), (y ?? pos[1]) + (dy ?? 0)];
          startRun(pos, cs);
        } else if (!run || run.st["font-size"] !== cs["font-size"]) startRun(pos, cs);
        visit(c, cs);
      }
    };
    visit(el, st);
    const anchorAlign = { start: "left", middle: "center", end: "right" };
    for (const r of runs) {
      const text = r.text.trim();
      if (!text) continue;
      const fs = r.st["font-size"] || 16;
      // Baseline → top of the em box (the plan draws texts from the top).
      const [x, y] = apply(m, [r.x, r.y - fs * 0.8]);
      const ux = [m[0], m[1]], uy = [m[2], m[3]];
      const t = {
        id: uid("t"), level: this.level, x: round(x), y: round(y), text,
        size: round(fs * Math.hypot(...uy)), rot: round(Math.atan2(ux[1], ux[0]) / DEG) + 0,
        align: anchorAlign[String(r.st["text-anchor"] || "start").trim()] || "left", layer: LAYER.id,
      };
      const c = this.color(r.st, true);
      if (c) t.color = c;
      this.texts.push(t);
    }
  }
}

const round = (v) => Math.round(v * 1e6) / 1e6 + 0;

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

// Root viewport → millimetres.
function rootMatrix(svg, mmPerUnit) {
  const vb = numbers(svg.attrs.viewBox);
  const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  if (typeof mmPerUnit === "number" && mmPerUnit > 0) return scale(mmPerUnit);
  let W = lengthMm(svg.attrs.width), H = lengthMm(svg.attrs.height);
  if (!hasVb) return scale(PX);
  if (W === null && H === null) return mul(scale(PX), translate(-vb[0], -vb[1]));
  if (W === null) W = (H * vb[2]) / vb[3];
  if (H === null) H = (W * vb[3]) / vb[2];
  const sx = W / vb[2], sy = H / vb[3];
  const par = String(svg.attrs.preserveAspectRatio || "xMidYMid meet").trim().split(/\s+/);
  if (par[0] === "none") return mul(scale(sx, sy), translate(-vb[0], -vb[1]));
  const s = par[1] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
  const fx = /xMid/.test(par[0]) ? 0.5 : /xMax/.test(par[0]) ? 1 : 0;
  const fy = /YMid/.test(par[0]) ? 0.5 : /YMax/.test(par[0]) ? 1 : 0;
  return mul(translate((W - vb[2] * s) * fx, (H - vb[3] * s) * fy), mul(scale(s), translate(-vb[0], -vb[1])));
}

function itemBounds(drawings, texts) {
  let b = null;
  const add = (x, y) => {
    if (!b) b = { x1: x, y1: y, x2: x, y2: y };
    else { b.x1 = Math.min(b.x1, x); b.y1 = Math.min(b.y1, y); b.x2 = Math.max(b.x2, x); b.y2 = Math.max(b.y2, y); }
  };
  for (const d of drawings) {
    if (d.kind === "circle") { add(d.cx - d.r, d.cy - d.r); add(d.cx + d.r, d.cy + d.r); } else for (const [x, y] of d.pts) add(x, y);
  }
  for (const t of texts) add(t.x, t.y);
  return b;
}

/**
 * Parse an SVG document into CAD layer geometry in plan millimetres.
 * mmPerUnit: "auto" (from width/height/viewBox; plain px = 0.2646 mm) or a
 * number of millimetres per user unit.
 * Returns {drawings, texts, layers, bounds, warnings}.
 */
export function importSvg(text, { level = null, mmPerUnit = "auto" } = {}) {
  const doc = parseXml(String(text ?? ""));
  const svg = findSvg(doc);
  if (!svg) throw new Error("Not an SVG file: no <svg> element found");
  const rules = [];
  const ids = new Map();
  collect(svg, (el) => {
    if (el.attrs.id) ids.set(el.attrs.id, el);
    if (local(el.name) === "style") rules.push(...parseCss(el.children.map((c) => c.text || "").join("")));
  });
  const imp = new SvgImporter(level, rules, ids);
  const base = { stroke: undefined, fill: undefined, "font-size": 16, "text-anchor": "start", visibility: "visible", color: undefined };
  const st = computeStyle(svg, base, rules);
  const m = mul(rootMatrix(svg, mmPerUnit), svg.attrs.transform ? parseTransform(svg.attrs.transform) : IDENTITY);
  for (const c of svg.children) imp.walk(c, m, st);
  return {
    drawings: imp.drawings,
    texts: imp.texts,
    layers: [{ ...LAYER }],
    bounds: itemBounds(imp.drawings, imp.texts),
    warnings: [...imp.warnings],
  };
}

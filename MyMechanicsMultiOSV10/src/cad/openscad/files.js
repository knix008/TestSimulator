// Files that import() and surface() read: STL, OFF, AMF, OBJ, 3MF (meshes); DXF, SVG (2D outlines); DAT and
// PNG (height maps). SVG follows OpenSCAD's placement (units, dpi for unitless sizes, viewBox and
// preserveAspectRatio, y up from the bottom of the page); PNG height is 100/255 of the luminance as OpenSCAD.
import { parseStl } from '../stl.js';
import { readMeshFile } from '../mesh-formats.js';
import { readDxf } from '../dxf-read.js';
import { flattenDrawing, UNIT_MM } from '../cad2d-import.js';
import { unzlibSync } from 'three/examples/jsm/libs/fflate.module.js';

const dec = (d) => (typeof d === 'string' ? d : new TextDecoder().decode(d));
const bytesOf = (d) => (typeof d === 'string' ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
const extOf = (name) => String(name).toLowerCase().split('?')[0].split('.').pop();

/**
 * A file for import() / surface(): { mesh: { verts, polys } } | { shapes: [{ outlines, rule }] } |
 * { grid, lines, columns } (surface). Null (with a warning) when it cannot be read.
 */
export function readImportFile(name, data, opts = {}) {
  const ext = extOf(name);
  const warn = opts.warn ?? (() => {});
  try {
    if (opts.surface) {
      const b = bytesOf(data);
      if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return pngSurface(b, opts.invert);
      return datSurface(dec(data));
    }
    switch (ext) {
      case 'stl': { const { verts, tris } = parseStl(bytesOf(data)); return { mesh: { verts, polys: tris } }; }
      case 'off': return { mesh: readOff(dec(data)) };
      case 'amf': return { mesh: readAmf(dec(data)) };
      case 'obj': case '3mf': case 'ply': case 'gltf': case 'glb': case 'wrl': case 'vrml': {
        const verts = []; const polys = [];
        for (const o of readMeshFile(name, bytesOf(data))) { const base = verts.length; verts.push(...o.verts); for (const t of o.tris) polys.push(t.map((i) => i + base)); }
        return { mesh: { verts, polys } };
      }
      case 'dxf': return { shapes: [{ outlines: dxfOutlines(dec(data), opts), rule: 'EvenOdd' }] };
      case 'svg': return { shapes: readSvg(dec(data), opts) };
      default: warn(`Unsupported file format while trying to import file '${name}'`); return null;
    }
  } catch (error) {
    warn(`Can't read '${name}': ${error?.message ?? error}`);
    return null;
  }
}

// ───────────────────────── meshes

export function readOff(text) {
  // Line by line: a header (OFF, COFF, NOFF …), counts, vertices, then faces "n i1 … in [colour]".
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  let k = 0;
  let first = lines[k].split(/\s+/);
  if (/OFF$/i.test(first[0])) { first = first.slice(1); k++; if (!first.length) first = lines[k++].split(/\s+/); } else k++;
  const nv = Number(first[0]); const nf = Number(first[1]);
  const verts = [];
  for (let i = 0; i < nv; i++) { const v = lines[k++].split(/\s+/).map(Number); verts.push([v[0], v[1], v[2]]); }
  const polys = [];
  for (let i = 0; i < nf; i++) { const v = lines[k++].split(/\s+/).map(Number); const n = v[0]; polys.push(v.slice(1, 1 + n).reverse()); }
  return { verts, polys };
}

export function readAmf(text) {
  const verts = []; const polys = [];
  const objects = text.split(/<object\b/i).slice(1);
  for (const obj of objects) {
    const base = verts.length;
    for (const m of obj.matchAll(/<vertex>([\s\S]*?)<\/vertex>/gi)) {
      const get = (t) => Number((new RegExp(`<${t}>\\s*([^<]+)<\\/${t}>`, 'i').exec(m[1]) ?? [0, 0])[1]);
      verts.push([get('x'), get('y'), get('z')]);
    }
    for (const m of obj.matchAll(/<triangle>([\s\S]*?)<\/triangle>/gi)) {
      const get = (t) => Number((new RegExp(`<${t}>\\s*([^<]+)<\\/${t}>`, 'i').exec(m[1]) ?? [0, 0])[1]);
      polys.push([base + get('v1'), base + get('v2'), base + get('v3')]);
    }
  }
  return { verts, polys };
}

// ───────────────────────── DXF: closed loops of the model space

function dxfOutlines(text, { layer = null, fn = 0, fs = 2, fa = 12, origin = [0, 0], scale = 1 } = {}) {
  const model = readDxf(text);
  const { items } = flattenDrawing(model);
  const k = scale * (UNIT_MM[0] ?? 1);
  const frag = (r, span = 2 * Math.PI) => {
    const n = fn > 0 ? Math.max(3, Math.floor(fn)) : Math.ceil(Math.max(Math.min(360 / fa, (r * 2 * Math.PI) / fs), 5));
    return Math.max(1, Math.ceil((n * span) / (2 * Math.PI)));
  };
  const segs = [];
  const loops = [];
  const P = (p) => [(p[0] - origin[0]) * k, (p[1] - origin[1]) * k];
  for (const it of items) {
    if (layer && it.layer !== layer) continue;
    if (it.kind === 'line') segs.push([P(it.a), P(it.b)]);
    else if (it.kind === 'circle') { const n = frag(it.r); const pts = []; for (let i = 0; i < n; i++) { const t = (2 * Math.PI * i) / n; pts.push(P([it.c[0] + it.r * Math.cos(t), it.c[1] + it.r * Math.sin(t)])); } loops.push(pts); }
    else if (it.kind === 'arc3') {
      const [a, m, b] = it.pts; const c = circumcentre(a, m, b);
      if (!c) { segs.push([P(a), P(b)]); continue; }
      const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
      let t0 = Math.atan2(a[1] - c[1], a[0] - c[0]); let t1 = Math.atan2(b[1] - c[1], b[0] - c[0]); const tm = Math.atan2(m[1] - c[1], m[0] - c[0]);
      const ccw = ((m[0] - a[0]) * (b[1] - a[1]) - (m[1] - a[1]) * (b[0] - a[0])) < 0;
      let span = ccw ? t1 - t0 : t0 - t1; while (span <= 0) span += 2 * Math.PI;
      void tm;
      const n = frag(r, span); const pts = [];
      for (let i = 0; i <= n; i++) { const t = t0 + (ccw ? 1 : -1) * (span * i) / n; pts.push(P([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)])); }
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
    } else if (it.kind === 'ellipse') {
      const n = frag(Math.max(it.rx, it.ry)); const pts = [];
      for (let i = 0; i < n; i++) { const t = (2 * Math.PI * i) / n; const x = it.rx * Math.cos(t); const y = it.ry * Math.sin(t); pts.push(P([it.c[0] + x * Math.cos(it.rot) - y * Math.sin(it.rot), it.c[1] + x * Math.sin(it.rot) + y * Math.cos(it.rot)])); }
      loops.push(pts);
    } else if (it.kind === 'spline') {
      const pts = it.pts.map(P);
      if (it.closed) loops.push(pts); else for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
    }
  }
  // Segments joined end to end into closed loops (ends within a small tolerance).
  const eq = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
  const left = segs.slice();
  while (left.length) {
    const path = left.shift().slice();
    let grew = true;
    while (grew && !eq(path[0], path[path.length - 1])) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const [a, b] = left[i];
        if (eq(a, path[path.length - 1])) { path.push(b); left.splice(i, 1); grew = true; break; }
        if (eq(b, path[path.length - 1])) { path.push(a); left.splice(i, 1); grew = true; break; }
        if (eq(b, path[0])) { path.unshift(a); left.splice(i, 1); grew = true; break; }
        if (eq(a, path[0])) { path.unshift(b); left.splice(i, 1); grew = true; break; }
      }
    }
    if (path.length > 3 && eq(path[0], path[path.length - 1])) { path.pop(); loops.push(path); }
  }
  return loops;
}

function circumcentre(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-14) return null;
  const s = (p) => p[0] * p[0] + p[1] * p[1];
  return [(s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d, (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d];
}

// ───────────────────────── SVG

const INCH = 25.4;
function lengthMm(str, viewbox, dpi) {
  if (str == null || str === '') return viewbox != null ? (INCH * viewbox) / dpi : 0;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(str);
  if (!m) return 0;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case '': return (INCH * n) / dpi;
    case 'px': return (INCH * n) / 96;
    case 'pt': return (INCH * n) / 72;
    case 'pc': return (INCH * n) / 6;
    case 'in': return INCH * n;
    case 'cm': return 10 * n;
    case 'mm': return n;
    default: return viewbox ?? n;
  }
}

const IDENT2 = [1, 0, 0, 1, 0, 0]; // a b c d e f : x' = a x + c y + e, y' = b x + d y + f
const mul2 = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const app2 = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(s) {
  let m = IDENT2;
  if (!s) return m;
  for (const t of s.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let n = IDENT2;
    switch (t[1]) {
      case 'matrix': n = v.slice(0, 6); break;
      case 'translate': n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]; break;
      case 'scale': n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]; break;
      case 'rotate': { const a = ((v[0] ?? 0) * Math.PI) / 180; const c = Math.cos(a), s2 = Math.sin(a); const cx = v[1] ?? 0, cy = v[2] ?? 0; n = mul2(mul2([1, 0, 0, 1, cx, cy], [c, s2, -s2, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]); break; }
      case 'skewX': n = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': n = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
      default: break;
    }
    m = mul2(m, n);
  }
  return m;
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = m[3] ?? m[4];
  if (out.style) for (const kv of out.style.split(';')) { const [k, v] = kv.split(':').map((x) => x?.trim()); if (k && v) out[k] = v; }
  return out;
}

/** Path data → subpaths of points (curves flattened in `steps` pieces). */
export function pathPoints(d, steps = 20) {
  const toks = [...String(d).matchAll(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)].map((m) => m[0]);
  const out = []; let cur = null; let x = 0, y = 0, sx = 0, sy = 0; let cmd = null; let lastC = null; let lastQ = null;
  let i = 0;
  const num = () => Number(toks[i++]);
  const isNumTok = () => i < toks.length && !/^[A-Za-z]$/.test(toks[i]);
  const start = (px, py) => { if (cur && cur.pts.length) out.push(cur); cur = { pts: [[px, py]], closed: false }; };
  const line = (px, py) => { if (!cur) start(x, y); cur.pts.push([px, py]); };
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { if (cur) { cur.closed = true; out.push(cur); cur = null; } x = sx; y = sy; lastC = lastQ = null; continue; }
    if (!isNumTok()) continue;
    if (C === 'M') { let px = num(), py = num(); if (rel) { px += x; py += y; } start(px, py); x = sx = px; y = sy = py; cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
    if (C === 'L') { let px = num(), py = num(); if (rel) { px += x; py += y; } line(px, py); x = px; y = py; lastC = lastQ = null; continue; }
    if (C === 'H') { let px = num(); if (rel) px += x; line(px, y); x = px; lastC = lastQ = null; continue; }
    if (C === 'V') { let py = num(); if (rel) py += y; line(x, py); y = py; lastC = lastQ = null; continue; }
    if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = num(); y1 = num(); if (rel) { x1 += x; y1 += y; } } else { [x1, y1] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]; }
      let x2 = num(), y2 = num(), px = num(), py = num();
      if (rel) { x2 += x; y2 += y; px += x; py += y; }
      for (let k = 1; k <= steps; k++) { const t = k / steps, u = 1 - t; line(u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * px, u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * py); }
      lastC = [x2, y2]; lastQ = null; x = px; y = py; continue;
    }
    if (C === 'Q' || C === 'T') {
      let x1, y1;
      if (C === 'Q') { x1 = num(); y1 = num(); if (rel) { x1 += x; y1 += y; } } else { [x1, y1] = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]; }
      let px = num(), py = num(); if (rel) { px += x; py += y; }
      for (let k = 1; k <= steps; k++) { const t = k / steps, u = 1 - t; line(u * u * x + 2 * u * t * x1 + t * t * px, u * u * y + 2 * u * t * y1 + t * t * py); }
      lastQ = [x1, y1]; lastC = null; x = px; y = py; continue;
    }
    if (C === 'A') {
      const rx0 = Math.abs(num()), ry0 = Math.abs(num()), rot = num(), large = num(), sweep = num();
      let px = num(), py = num(); if (rel) { px += x; py += y; }
      for (const p of arcPoints(x, y, rx0, ry0, rot, large, sweep, px, py, steps)) line(p[0], p[1]);
      x = px; y = py; lastC = lastQ = null; continue;
    }
    i++;
  }
  if (cur && cur.pts.length) out.push(cur);
  return out;
}

function arcPoints(x1, y1, rx, ry, rotDeg, large, sweep, x2, y2, steps) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (rotDeg * Math.PI) / 180; const c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  if (large === sweep) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const out = [];
  for (let k = 1; k <= steps; k++) { const t = t1 + (dt * k) / steps; out.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
  return out;
}

/** Shapes of an SVG file in millimetres, placed as OpenSCAD places them: [{ outlines, rule: 'EvenOdd' }]. */
export function readSvg(text, { dpi = 72, center = false } = {}) {
  const svgTag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '<svg>';
  const sa = attrs(svgTag);
  const vb = sa.viewBox ? sa.viewBox.split(/[\s,]+/).map(Number) : null;
  const vbOk = vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  const widthMm = lengthMm(sa.width, vbOk ? vb[2] : null, dpi);
  const heightMm = lengthMm(sa.height, vbOk ? vb[3] : null, dpi);
  let scale = [1, 1]; let align = [0, 0]; const viewbox = vbOk ? vb : [0, 0, 0, 0];
  if (vbOk) {
    scale = [widthMm / vb[2], heightMm / vb[3]];
    const par = (sa.preserveAspectRatio ?? 'xMidYMid meet').trim().split(/\s+/);
    if (par[0] !== 'none') {
      const meet = (par[1] ?? 'meet') !== 'slice';
      const k = meet ? Math.min(scale[0], scale[1]) : Math.max(scale[0], scale[1]);
      scale = [k, k];
      const ax = /xMid/.test(par[0]) ? 'mid' : /xMax/.test(par[0]) ? 'max' : 'min';
      const ay = /YMid/.test(par[0]) ? 'mid' : /YMax/.test(par[0]) ? 'max' : 'min';
      const al = (a, page, s, v) => (a === 'mid' ? page / 2 - (s * v) / 2 : a === 'max' ? page - s * v : 0);
      align = [al(ax, widthMm, k, vb[2]), al(ay, heightMm, k, vb[3])];
    }
  } else {
    // Without a viewBox, user units are pixels at 96 dpi … unless the page is unitless (then dpi).
    const u = 25.4 / 96;
    scale = [u, u];
  }
  // Walk elements keeping a transform stack.
  const shapes = [];
  const stack = [IDENT2];
  const styleStack = [{ fill: 'black', stroke: 'none', strokeWidth: 1 }];
  const defsDepth = { n: 0 };
  for (const m of text.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const [, close, tagName, rest, self] = m; const tag = tagName.toLowerCase();
    if (close) { if (['g', 'svg', 'a', 'switch'].includes(tag)) { stack.pop(); styleStack.pop(); } if (tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'symbol' || tag === 'pattern') defsDepth.n--; continue; }
    const a = attrs(`<${tag}${rest}>`);
    const parentStyle = styleStack[styleStack.length - 1];
    const st = { fill: a.fill ?? parentStyle.fill, stroke: a.stroke ?? parentStyle.stroke, strokeWidth: a['stroke-width'] != null ? parseFloat(a['stroke-width']) : parentStyle.strokeWidth, display: a.display ?? parentStyle.display };
    const T = mul2(stack[stack.length - 1], parseTransform(a.transform));
    if (['defs', 'clippath', 'mask', 'symbol', 'pattern'].includes(tag) && !self) { defsDepth.n++; continue; }
    if (['g', 'svg', 'a', 'switch'].includes(tag)) { if (!self) { stack.push(tag === 'svg' ? stack[stack.length - 1] : T); styleStack.push(st); } continue; }
    if (defsDepth.n > 0 || st.display === 'none') continue;
    let subs = [];
    const n = (k, d = 0) => (a[k] != null ? parseFloat(a[k]) : d);
    switch (tag) {
      case 'path': subs = pathPoints(a.d ?? ''); break;
      case 'rect': {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height');
        let rx = a.rx != null ? n('rx') : a.ry != null ? n('ry') : 0; let ry = a.ry != null ? n('ry') : rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (rx > 0 && ry > 0) subs = pathPoints(`M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`);
        else subs = [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
        break;
      }
      case 'circle': case 'ellipse': {
        const cx = n('cx'), cy = n('cy'); const rx = tag === 'circle' ? n('r') : n('rx'); const ry = tag === 'circle' ? n('r') : n('ry');
        const pts = []; const k = 64; for (let i = 0; i < k; i++) { const t = (2 * Math.PI * i) / k; pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
        subs = [{ pts, closed: true }];
        break;
      }
      case 'line': subs = [{ pts: [[n('x1'), n('y1')], [n('x2'), n('y2')]], closed: false }]; break;
      case 'polyline': case 'polygon': { const v = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number); const pts = []; for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]); subs = [{ pts, closed: tag === 'polygon' }]; break; }
      default: continue;
    }
    if (!subs.length) continue;
    const place = (p) => { const [x, y] = app2(T, p); return [scale[0] * (-viewbox[0] + x), scale[1] * (-viewbox[1] - y)]; };
    const outlines = [];
    const filled = st.fill !== 'none';
    if (filled) for (const s of subs) if (s.pts.length >= 3) outlines.push(s.pts.map(place));
    if (st.stroke && st.stroke !== 'none' && st.strokeWidth > 0) {
      // A stroke as an outline: each segment a rectangle with round ends (unioned with the fill).
      const w = st.strokeWidth / 2;
      for (const s of subs) {
        const pts = s.closed ? [...s.pts, s.pts[0]] : s.pts;
        for (let i = 1; i < pts.length; i++) {
          const [x1, y1] = pts[i - 1], [x2, y2] = pts[i]; const l = Math.hypot(x2 - x1, y2 - y1); if (l < 1e-12) continue;
          const nx = (-(y2 - y1) / l) * w, ny = ((x2 - x1) / l) * w;
          shapes.push({ outlines: [[[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]].map(place)], rule: 'NonZero' });
          const ring = []; for (let k = 0; k < 16; k++) { const t = (2 * Math.PI * k) / 16; ring.push(place([x2 + w * Math.cos(t), y2 + w * Math.sin(t)])); }
          shapes.push({ outlines: [ring], rule: 'NonZero' });
        }
      }
    }
    if (outlines.length) shapes.push({ outlines, rule: (a['fill-rule'] ?? 'nonzero') === 'evenodd' ? 'EvenOdd' : 'NonZero' });
  }
  // Placement: OpenSCAD puts the bottom of the page at y = 0 (or centres the drawing).
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const s of shapes) for (const o of s.outlines) for (const [x, y] of o) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const cx = center ? (bx0 + bx1) / 2 : -align[0];
  const cy = center ? (by0 + by1) / 2 : -(heightMm - align[1]);
  for (const s of shapes) for (const o of s.outlines) for (const p of o) { p[0] -= cx; p[1] -= cy; }
  return shapes;
}

// ───────────────────────── height maps

function datSurface(text) {
  const grid = [];
  let columns = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const row = [];
    for (const tok of line.split(/[ \t]+/)) { const v = Number(tok); if (tok === '' || Number.isNaN(v)) break; row.push(v); }
    if (!row.length) continue;
    columns = Math.max(columns, row.length);
    grid.push(row);
  }
  return { grid, lines: grid.length, columns };
}

function pngSurface(bytes, invert) {
  const { width, height, rgba } = decodePng(bytes);
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const i = 4 * (y * width + x);
      const pixel = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      row.push((100 / 255) * (invert ? 1 - pixel : pixel));
    }
    grid[height - 1 - y] = row;
  }
  return { grid, lines: height, columns: width };
}

/** A PNG image as 8-bit RGBA (all colour types and bit depths, interlaced or not). */
export function decodePng(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8; let width = 0, height = 0, depth = 8, ctype = 0, interlace = 0; let palette = null; let trns = null;
  const idat = [];
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p); const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8)); const data = bytes.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = dv.getUint32(p + 8); height = dv.getUint32(p + 12); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const total = idat.reduce((s, d) => s + d.length, 0); const z = new Uint8Array(total); let o = 0; for (const d of idat) { z.set(d, o); o += d.length; }
  const raw = unzlibSync(z);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const rgba = new Uint8Array(width * height * 4);
  const sample = (row, x, c) => {
    if (depth === 8) return row[x * channels + c];
    if (depth === 16) return row[(x * channels + c) * 2];
    const bitPos = (x * channels + c) * depth; const byte = row[bitPos >> 3]; const shift = 8 - depth - (bitPos & 7);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const expand = (v) => (depth < 8 && ctype !== 3 ? Math.round((v * 255) / ((1 << depth) - 1)) : v);
  const put = (x, y, row, xi) => {
    const d = 4 * (y * width + x);
    if (ctype === 3) { const k = sample(row, xi, 0); rgba[d] = palette[3 * k]; rgba[d + 1] = palette[3 * k + 1]; rgba[d + 2] = palette[3 * k + 2]; rgba[d + 3] = trns && k < trns.length ? trns[k] : 255; return; }
    if (ctype === 0 || ctype === 4) { const g = expand(sample(row, xi, 0)); rgba[d] = rgba[d + 1] = rgba[d + 2] = g; rgba[d + 3] = ctype === 4 ? expand(sample(row, xi, 1)) : 255; return; }
    rgba[d] = expand(sample(row, xi, 0)); rgba[d + 1] = expand(sample(row, xi, 1)); rgba[d + 2] = expand(sample(row, xi, 2)); rgba[d + 3] = ctype === 6 ? expand(sample(row, xi, 3)) : 255;
  };
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  let at = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const w = Math.ceil((width - x0) / dx); const h = Math.ceil((height - y0) / dy);
    if (w <= 0 || h <= 0) continue;
    const stride = Math.ceil((w * channels * depth) / 8);
    let prev = new Uint8Array(stride);
    for (let r = 0; r < h; r++) {
      const filter = raw[at++]; const line = raw.slice(at, at + stride); at += stride;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
        let v = line[i];
        if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
        else if (filter === 4) { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        line[i] = v & 255;
      }
      for (let x = 0; x < w; x++) put(x0 + x * dx, y0 + r * dy, line, x);
      prev = line;
    }
  }
  return { width, height, rgba };
}

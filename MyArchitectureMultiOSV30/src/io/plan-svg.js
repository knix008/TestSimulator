// SVG floor plans (line drawings exported from CAD or drawing programs): lines,
// polylines, polygons, rectangles, paths (M L H V Z, A as arcs, curves as
// chords), circles and texts, with group / element transforms. A tiny tag
// reader instead of DOMParser keeps it pure (Node tests use it).
//
// readSvgPlan(text) → { lines, arcs, texts, units, metres, size } with coordinates in SVG user units
// svgToPlan(svg, metres) → metres, plan axes (SVG y runs down like plan z, so no flip)
import { guessUnits, UNIT_METRES } from './plan-dxf.js';

const LENGTH_MM = { mm: 1, cm: 10, m: 1000, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const IDENTITY = [1, 0, 0, 1, 0, 0];

function parseTransform(text = '') {
  let m = IDENTITY;
  for (const [, op, args] of String(text).matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let t = IDENTITY;
    if (op === 'matrix' && v.length === 6) t = v;
    else if (op === 'translate') t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (op === 'scale') t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (op === 'rotate') {
      const a = ((v[0] ?? 0) * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a);
      t = [c, s, -s, c, 0, 0];
      if (v.length >= 3) t = mul(mul([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]]);
    }
    m = mul(m, t);
  }
  return m;
}

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)].map((x) => [x[1], x[3] ?? x[4]]));
const numbers = (text) => (String(text ?? '').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
const entity = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** SVG text → primitives in user units (+ the size of a user unit when the file says it). */
export function readSvgPlan(text) {
  const src = String(text ?? '');
  if (!/<svg[\s>]/i.test(src)) throw Object.assign(new Error('Not an SVG file'), { code: 'svg-bad' });
  const out = { lines: [], arcs: [], texts: [] };
  const stack = [{ m: IDENTITY, layer: '' }];
  let unitMm = null;
  const line = (m, a, b, layer) => { const p = apply(m, a); const q = apply(m, b); if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9) out.lines.push({ a: p, b: q, layer }); };
  const re = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let pendingText = null;
  for (const m of src.matchAll(re)) {
    if (m[5] !== undefined) { if (pendingText) pendingText.text += m[5]; continue; }
    const [, closing, rawName, body, selfClose] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      if (name === 'g' || name === 'svg' || name === 'a') stack.pop();
      if (name === 'text' && pendingText) { const t = entity(pendingText.text).replace(/\s+/g, ' ').trim(); if (t) out.texts.push({ p: pendingText.p, text: t, height: pendingText.height, layer: pendingText.layer }); pendingText = null; }
      continue;
    }
    const a = attrs(body);
    const top = stack.at(-1);
    let mat = a.transform ? mul(top.m, parseTransform(a.transform)) : top.m;
    const layer = a.id ?? a['inkscape:label'] ?? top.layer;
    if (name === 'svg') {
      // The outer size in real units and the viewBox give the size of one user unit.
      const vb = numbers(a.viewBox);
      const w = /^\s*([\d.]+)\s*(mm|cm|m|in|pt|pc|px)?\s*$/i.exec(a.width ?? '');
      if (stack.length === 1 && vb.length === 4 && w && w[2] && LENGTH_MM[w[2].toLowerCase()] && w[2].toLowerCase() !== 'px') unitMm = (Number(w[1]) * LENGTH_MM[w[2].toLowerCase()]) / vb[2];
      if (vb.length === 4) mat = mul(mat, [1, 0, 0, 1, -vb[0], -vb[1]]);
      if (!selfClose) stack.push({ m: mat, layer });
      continue;
    }
    if (name === 'g' || name === 'a') { if (!selfClose) stack.push({ m: mat, layer }); continue; }
    if (/^(defs|symbol|clippath|mask|pattern|marker|style|title|desc|metadata)$/.test(name)) {
      // Skip their content: the parts inside are not drawn where they are defined.
      if (!selfClose) { const end = src.indexOf(`</${rawName}`, m.index); if (end > 0) re.lastIndex = end; }
      continue;
    }
    const n = (k, d = 0) => (a[k] === undefined ? d : Number.parseFloat(a[k]) || 0);
    switch (name) {
      case 'line': line(mat, [n('x1'), n('y1')], [n('x2'), n('y2')], layer); break;
      case 'rect': {
        const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
        const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
        for (let i = 0; i < 4; i++) line(mat, pts[i], pts[(i + 1) % 4], layer);
        break;
      }
      case 'polyline': case 'polygon': {
        const v = numbers(a.points); const pts = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
        for (let i = 0; i + 1 < pts.length; i++) line(mat, pts[i], pts[i + 1], layer);
        if (name === 'polygon' && pts.length > 2) line(mat, pts.at(-1), pts[0], layer);
        break;
      }
      case 'circle': case 'ellipse': {
        const [cx, cy] = [n('cx'), n('cy')]; const rx = n(name === 'circle' ? 'r' : 'rx'); const ry = name === 'circle' ? rx : n('ry');
        const N = 24; const pts = Array.from({ length: N + 1 }, (_, i) => [cx + rx * Math.cos((i / N) * Math.PI * 2), cy + ry * Math.sin((i / N) * Math.PI * 2)]);
        for (let i = 0; i < N; i++) line(mat, pts[i], pts[i + 1], layer);
        break;
      }
      case 'path': path(a.d ?? '', mat, layer, line, out); break;
      case 'text': pendingText = { p: apply(mat, [n('x'), n('y')]), text: '', height: Number.parseFloat(a['font-size'] ?? '') || 12, layer }; if (selfClose) pendingText = null; break;
      default: break;
    }
  }
  const pts = [...out.lines.flatMap((l) => [l.a, l.b]), ...out.arcs.flatMap((x) => [x.p0, x.p1])];
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const size = pts.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
  return { ...out, unitMm, size };
}

/** SVG path data → lines and arcs (curves become their chords). */
function path(d, m, layer, line, out) {
  const tokens = String(d).match(/[MmLlHhVvZzAaCcSsQqTt]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0; let cmd = ''; let cur = [0, 0]; let start = [0, 0];
  const next = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const pt = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === 'Z') { line(m, cur, start, layer); cur = start; if (!isNum()) continue; }
    if (!isNum()) { i++; continue; }
    if (C === 'M') { cur = pt(next(), next()); start = cur; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L' || C === 'T') { const p = pt(next(), next()); line(m, cur, p, layer); cur = p; }
    else if (C === 'H') { const p = [rel ? cur[0] + next() : next(), cur[1]]; line(m, cur, p, layer); cur = p; }
    else if (C === 'V') { const p = [cur[0], rel ? cur[1] + next() : next()]; line(m, cur, p, layer); cur = p; }
    else if (C === 'C') { next(); next(); next(); next(); const p = pt(next(), next()); line(m, cur, p, layer); cur = p; }
    else if (C === 'S' || C === 'Q') { next(); next(); const p = pt(next(), next()); line(m, cur, p, layer); cur = p; }
    else if (C === 'A') {
      const rx = Math.abs(next()); const ry = Math.abs(next()); next();
      const large = next(); const sweepFlag = next();
      const p = pt(next(), next());
      const arc = endpointArc(cur, p, rx, ry, large, sweepFlag);
      const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      if (arc && Math.abs(rx - ry) < 1e-6 * Math.max(rx, 1)) {
        // y runs down: sweep flag 1 turns towards growing angles; the plan's arcs run the other way from p0 to p1 (see recognizer).
        const det = m[0] * m[3] - m[1] * m[2];
        const forward = (sweepFlag === 1) !== (det < 0);
        const [s, e] = forward ? [p, cur] : [cur, p];
        out.arcs.push({ c: apply(m, arc.c), r: arc.r * k, p0: apply(m, s), p1: apply(m, e), sweep: Math.abs(arc.sweep), layer });
      } else line(m, cur, p, layer);
      cur = p;
    } else i++;
  }
}

/** SVG elliptical arc (endpoint form, circles only) → centre, radius and sweep (SVG spec F.6.5). */
function endpointArc(p0, p1, rx, ry, large, sweepFlag) {
  if (!(rx > 0) || !(ry > 0)) return null;
  const dx = (p0[0] - p1[0]) / 2; const dy = (p0[1] - p1[1]) / 2;
  let r = rx;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) r = Math.sqrt(d2);
  const f = Math.sqrt(Math.max(0, (r * r - d2) / d2)) * (large === sweepFlag ? -1 : 1);
  const c = [(p0[0] + p1[0]) / 2 + f * dy, (p0[1] + p1[1]) / 2 - f * dx];
  const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
  let sweep = Math.atan2(p1[1] - c[1], p1[0] - c[0]) - a0;
  if (sweepFlag && sweep < 0) sweep += Math.PI * 2;
  if (!sweepFlag && sweep > 0) sweep -= Math.PI * 2;
  return { c, r, sweep };
}

/** The size of a user unit: the file's own (width in mm with a viewBox), the chosen unit, or a guess from the extent. */
export function svgUnits(svg, override = 'auto') {
  if (override && override !== 'auto' && UNIT_METRES[override]) return { units: override, metres: UNIT_METRES[override], guessed: false };
  if (svg.unitMm) return { units: 'mm', metres: svg.unitMm / 1000, guessed: false };
  const units = guessUnits(svg.size);
  return { units, metres: UNIT_METRES[units], guessed: true };
}

/** User units → metres, plan axes (y down = z down). */
export function svgToPlan(svg, metres) {
  const p = ([x, y]) => [x * metres, y * metres];
  return {
    lines: svg.lines.map((l) => ({ ...l, a: p(l.a), b: p(l.b) })),
    arcs: svg.arcs.map((a) => ({ ...a, c: p(a.c), r: a.r * metres, p0: p(a.p0), p1: p(a.p1) })),
    texts: svg.texts.map((t) => ({ ...t, p: p(t.p), height: t.height * metres })),
  };
}

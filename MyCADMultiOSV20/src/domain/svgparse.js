// SVG reading, shared by SVG import (→ drawing entities) and PDF/EPS export
// (the printed page SVG → vector PDF). Shapes become paths of absolute
// segments ['M', x, y] · ['L', x, y] · ['C', x1, y1, x2, y2, x, y] · ['Z'] in
// page millimetres (y down, as in SVG), with the transforms applied; texts keep
// position, size, rotation and font. Styles inherit through groups.
import { parseXml, localName } from './xml.js';

const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

/** A length with a unit → mm (null when missing). */
export function lengthMm(value) {
  const m = /^\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(String(value ?? ''));
  return m ? Number(m[1]) * UNIT_MM[(m[2] ?? '').toLowerCase()] : null;
}

// ───────────────────────── affine 2D matrices [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const IDENTITY = [1, 0, 0, 1, 0, 0];

export function parseTransform(text) {
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(String(text ?? '')))) {
    const v = hit[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t = IDENTITY;
    switch (hit[1]) {
      case 'matrix': t = v.length === 6 ? v : IDENTITY; break;
      case 'translate': t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]; break;
      case 'scale': t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const a = ((v[0] ?? 0) * Math.PI) / 180;
        const r = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        t = v.length >= 3 ? multiply(multiply([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]]) : r;
        break;
      }
      case 'skewX': t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      default: t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, t);
  }
  return m;
}

// ───────────────────────── path data

/** Path data → absolute segments (M, L, C, Z; quadratics and arcs as cubics). */
export function parsePathData(d) {
  const tokens = String(d ?? '').match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [];
  const out = [];
  let i = 0;
  let cmd = '';
  let x = 0; let y = 0; let sx = 0; let sy = 0;
  let lastC = null; let lastQ = null;
  const num = () => Number(tokens[i++]);
  const flag = () => { const t = tokens[i]; if (t === '0' || t === '1') { i++; return Number(t); } if (/^[01]/.test(t)) { tokens[i] = t.slice(1); return Number(t[0]); } return num(); };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0; const oy = rel ? y : 0;
    if (C === 'Z') { out.push(['Z']); x = sx; y = sy; lastC = lastQ = null; cmd = ''; continue; }
    if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
    if (C === 'L') { x = ox + num(); y = oy + num(); out.push(['L', x, y]); lastC = lastQ = null; continue; }
    if (C === 'H') { x = ox + num(); out.push(['L', x, y]); lastC = lastQ = null; continue; }
    if (C === 'V') { y = oy + num(); out.push(['L', x, y]); lastC = lastQ = null; continue; }
    if (C === 'C' || C === 'S') {
      let x1; let y1;
      if (C === 'C') { x1 = ox + num(); y1 = oy + num(); } else { x1 = lastC ? 2 * x - lastC[0] : x; y1 = lastC ? 2 * y - lastC[1] : y; }
      const x2 = ox + num(); const y2 = oy + num(); const ex = ox + num(); const ey = oy + num();
      out.push(['C', x1, y1, x2, y2, ex, ey]);
      lastC = [x2, y2]; lastQ = null; x = ex; y = ey;
      continue;
    }
    if (C === 'Q' || C === 'T') {
      let qx; let qy;
      if (C === 'Q') { qx = ox + num(); qy = oy + num(); } else { qx = lastQ ? 2 * x - lastQ[0] : x; qy = lastQ ? 2 * y - lastQ[1] : y; }
      const ex = ox + num(); const ey = oy + num();
      out.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
      lastQ = [qx, qy]; lastC = null; x = ex; y = ey;
      continue;
    }
    if (C === 'A') {
      const rx = Math.abs(num()); const ry = Math.abs(num()); const rot = num(); const large = flag(); const sweep = flag();
      const ex = ox + num(); const ey = oy + num();
      out.push(...arcToCubics(x, y, rx, ry, rot, large, sweep, ex, ey));
      x = ex; y = ey; lastC = lastQ = null;
      continue;
    }
    i++;
  }
  return out;
}

/** An SVG elliptical arc as cubic Bézier segments (endpoint → centre parametrisation). */
export function arcToCubics(x1, y1, rx, ry, angleDeg, large, sweep, x2, y2) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [['L', x2, y2]];
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi); const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2; const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy; const yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const coef = sign * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (coef * rx * yp) / ry; const cyp = (-coef * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2; const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const out = [];
  const point = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  for (let p = 0; p < parts; p++) {
    const a = t1 + p * step; const b = a + step;
    const [ax, ay] = point(a); const [bx, by] = point(b);
    const [dax, day] = deriv(a); const [dbx, dby] = deriv(b);
    out.push(['C', ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  out[out.length - 1][5] = x2;
  out[out.length - 1][6] = y2;
  return out;
}

const transformSegments = (segments, m) => segments.map((s) => {
  if (s[0] === 'Z') return s;
  const out = [s[0]];
  for (let k = 1; k < s.length; k += 2) out.push(...apply(m, s[k], s[k + 1]));
  return out;
});

// Shapes → segments (in their own user units).
const ellipseSegments = (cx, cy, rx, ry) => {
  const k = 0.5522847498;
  return [['M', cx + rx, cy], ['C', cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry], ['C', cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy],
    ['C', cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry], ['C', cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy], ['Z']];
};
function rectSegments(x, y, w, h, rx, ry) {
  if (!rx && !ry) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
  const k = 0.5522847498;
  return [['M', x + rx, y], ['L', x + w - rx, y], ['C', x + w - rx + k * rx, y, x + w, y + ry - k * ry, x + w, y + ry], ['L', x + w, y + h - ry],
    ['C', x + w, y + h - ry + k * ry, x + w - rx + k * rx, y + h, x + w - rx, y + h], ['L', x + rx, y + h], ['C', x + rx - k * rx, y + h, x, y + h - ry + k * ry, x, y + h - ry],
    ['L', x, y + ry], ['C', x, y + ry - k * ry, x + rx - k * rx, y, x + rx, y], ['Z']];
}

const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'fill-rule', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'opacity', 'stroke-opacity', 'fill-opacity', 'visibility', 'display'];

function styleOf(node, parent) {
  const style = { ...parent };
  for (const key of INHERITED) if (node.attrs[key] !== undefined) style[key] = node.attrs[key];
  for (const part of String(node.attrs.style ?? '').split(';')) {
    const [k, v] = part.split(':').map((t) => t?.trim());
    if (k && v !== undefined && INHERITED.includes(k)) style[k] = v;
  }
  // A fill written in the document (here or on a parent), not the SVG default black.
  if (node.attrs.fill !== undefined || /(^|;)\s*fill\s*:/.test(String(node.attrs.style ?? ''))) style.fillSet = true;
  return style;
}

/**
 * Parses an SVG document. Returns { width, height (mm), items }, items:
 * { kind: 'path', segments, stroke, fill, strokeWidth, dash, fillRule, clip, id }
 * { kind: 'text', x, y, size, text, angle, anchor, fill, family, weight, italic, clip }
 * — all in mm, page coordinates (y down).
 */
export function parseSvg(source) {
  const root = parseXml(String(source));
  if (localName(root) !== 'svg') throw new Error('SVG: the document is not an <svg>');
  const vb = String(root.attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  const hasViewBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const width = lengthMm(root.attrs.width) ?? (hasViewBox ? vb[2] * UNIT_MM.px : 210);
  const height = lengthMm(root.attrs.height) ?? (hasViewBox ? vb[3] * UNIT_MM.px : 297);
  // User units → mm (viewBox maps onto width × height).
  const base = hasViewBox ? multiply([width / vb[2], 0, 0, height / vb[3], 0, 0], [1, 0, 0, 1, -vb[0], -vb[1]]) : [UNIT_MM.px, 0, 0, UNIT_MM.px, 0, 0];
  const ids = new Map();
  const index = (node) => { if (node.attrs.id) ids.set(node.attrs.id, node); node.children.forEach(index); };
  index(root);
  const items = [];
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const clipRect = (url, m) => {
    const id = /url\(#([^)]+)\)/.exec(url ?? '')?.[1];
    const clip = id && ids.get(id);
    const rect = clip?.children.find((c) => localName(c) === 'rect');
    if (!rect) return null;
    const [x0, y0] = apply(m, Number(rect.attrs.x ?? 0), Number(rect.attrs.y ?? 0));
    const [x1, y1] = apply(m, Number(rect.attrs.x ?? 0) + Number(rect.attrs.width ?? 0), Number(rect.attrs.y ?? 0) + Number(rect.attrs.height ?? 0));
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
  };
  const walk = (node, m, parentStyle, clip, depth) => {
    if (depth > 40) return;
    const name = localName(node);
    if (['defs', 'clipPath', 'mask', 'symbol', 'title', 'desc', 'metadata', 'style', 'pattern', 'linearGradient', 'radialGradient', 'marker'].includes(name)) return;
    const style = styleOf(node, parentStyle);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const matrix = node.attrs.transform ? multiply(m, parseTransform(node.attrs.transform)) : m;
    const ownClip = node.attrs['clip-path'] ? clipRect(node.attrs['clip-path'], matrix) ?? clip : clip;
    const N = (key, d = 0) => { const v = Number.parseFloat(node.attrs[key]); return Number.isFinite(v) ? v : d; };
    let segments = null;
    switch (name) {
      case 'svg': case 'g': case 'a': case 'switch':
        for (const child of node.children) walk(child, name === 'svg' && node !== root ? multiply(matrix, [1, 0, 0, 1, N('x'), N('y')]) : matrix, style, ownClip, depth + 1);
        return;
      case 'use': {
        const href = (node.attrs.href ?? node.attrs['xlink:href'] ?? '').replace(/^#/, '');
        const target = ids.get(href);
        if (target) {
          const placed = multiply(matrix, [1, 0, 0, 1, N('x'), N('y')]);
          if (localName(target) === 'symbol') for (const child of target.children) walk(child, placed, style, ownClip, depth + 1);
          else walk(target, placed, style, ownClip, depth + 1);
        }
        return;
      }
      case 'line': segments = [['M', N('x1'), N('y1')], ['L', N('x2'), N('y2')]]; break;
      case 'polyline': case 'polygon': {
        const v = String(node.attrs.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
        if (v.length < 4) return;
        segments = [['M', v[0], v[1]]];
        for (let k = 2; k + 1 < v.length; k += 2) segments.push(['L', v[k], v[k + 1]]);
        if (name === 'polygon') segments.push(['Z']);
        break;
      }
      case 'rect': segments = rectSegments(N('x'), N('y'), N('width'), N('height'), N('rx'), N('ry')); if (!N('width') || !N('height')) return; break;
      case 'circle': segments = ellipseSegments(N('cx'), N('cy'), N('r'), N('r')); if (!N('r')) return; break;
      case 'ellipse': segments = ellipseSegments(N('cx'), N('cy'), N('rx'), N('ry')); if (!N('rx') || !N('ry')) return; break;
      case 'path': segments = parsePathData(node.attrs.d); break;
      case 'text': {
        // Font size in user units ("12" or "12px" = 12; other units at 96 dpi).
        const fontSize = String(style['font-size'] ?? '16');
        const unitSize = /[a-z]/i.test(fontSize.replace(/px$/i, '')) ? (lengthMm(fontSize) ?? 4.23) / UNIT_MM.px : Number.parseFloat(fontSize) || 16;
        const runs = [];
        const collect = (n, x, y) => {
          if (localName(n) === 'tspan') {
            x = n.attrs.x !== undefined ? Number.parseFloat(n.attrs.x) : x;
            y = n.attrs.y !== undefined ? Number.parseFloat(n.attrs.y) : y;
            if (n.attrs.dy) y += Number.parseFloat(n.attrs.dy);
          }
          const own = n.text.replace(/\s+/g, ' ');
          if (own.trim()) runs.push({ x, y, text: own.trim() });
          for (const c of n.children) collect(c, x, y);
        };
        collect(node, N('x'), N('y'));
        for (const run of runs) {
          const [px, py] = apply(matrix, run.x, run.y);
          const [ax, ay] = apply(matrix, run.x + 1, run.y);
          const angle = (-Math.atan2(ay - py, ax - px) * 180) / Math.PI;
          items.push({
            kind: 'text', x: px, y: py, size: unitSize * scaleOf(matrix), text: run.text, angle,
            anchor: style['text-anchor'] ?? 'start', fill: style.fill ?? '#000000', family: (style['font-family'] ?? 'sans-serif').replace(/["']/g, ''),
            weight: style['font-weight'] ?? '400', italic: style['font-style'] === 'italic', clip: ownClip,
          });
        }
        return;
      }
      default:
        for (const child of node.children) walk(child, matrix, style, ownClip, depth + 1);
        return;
    }
    if (!segments?.length) return;
    const width = Number.parseFloat(style['stroke-width'] ?? '1');
    const stroke = style.stroke && style.stroke !== 'none' ? style.stroke : null;
    const fill = (style.fill ?? '#000000') === 'none' ? null : style.fill ?? '#000000';
    const dash = style['stroke-dasharray'] && style['stroke-dasharray'] !== 'none' ? style['stroke-dasharray'].split(/[\s,]+/).map(Number).filter(Number.isFinite).map((d) => d * scaleOf(matrix)) : [];
    items.push({
      kind: 'path', segments: transformSegments(segments, matrix), id: node.attrs.id ?? null,
      stroke,
      fill,
      // Filled on purpose: a fill given in the document, or a shape with no stroke (only its fill shows).
      fillExplicit: Boolean(fill) && (Boolean(style.fillSet) || !stroke),
      strokeWidth: (Number.isFinite(width) ? width : 1) * scaleOf(matrix), dash, fillRule: style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero', clip: ownClip,
      shape: name,
    });
  };
  walk(root, base, { fill: '#000000' }, null, 0);
  return { width, height, items };
}

/** Points along segments (curves flattened), one list per subpath: [{ points: [[x, y]], closed }]. */
export function flattenSegments(segments, tolerance = 0.05) {
  const out = [];
  let current = null;
  let last = [0, 0];
  for (const s of segments) {
    if (s[0] === 'M') { current = { points: [[s[1], s[2]]], closed: false }; out.push(current); last = [s[1], s[2]]; } else if (s[0] === 'L') {
      if (!current) { current = { points: [last], closed: false }; out.push(current); }
      current.points.push([s[1], s[2]]); last = [s[1], s[2]];
    } else if (s[0] === 'C') {
      if (!current) { current = { points: [last], closed: false }; out.push(current); }
      const [x0, y0] = last;
      const length = Math.hypot(s[1] - x0, s[2] - y0) + Math.hypot(s[3] - s[1], s[4] - s[2]) + Math.hypot(s[5] - s[3], s[6] - s[4]);
      const n = Math.max(2, Math.min(200, Math.ceil(Math.sqrt(length / tolerance))));
      for (let k = 1; k <= n; k++) {
        const t = k / n; const u = 1 - t;
        current.points.push([u * u * u * x0 + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5], u * u * u * y0 + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6]]);
      }
      last = [s[5], s[6]];
    } else if (s[0] === 'Z' && current) { current.closed = true; last = current.points[0]; current = null; }
  }
  return out.filter((sub) => sub.points.length >= 2);
}

/** A CSS colour → '#rrggbb' (named colours, #rgb, rgb()); null for none. */
export function cssColor(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return null;
  const named = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080', brown: '#a52a2a', lime: '#00ff00', navy: '#000080', teal: '#008080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000' };
  if (named[v]) return named[v];
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`;
  m = /^#([0-9a-f]{6})/.exec(v);
  if (m) return `#${m[1]}`;
  m = /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)/.exec(v);
  if (m) return `#${[m[1], m[2], m[3]].map((c) => Math.round(c.endsWith('%') ? (Number.parseFloat(c) * 2.55) : Number(c)).toString(16).padStart(2, '0')).join('')}`;
  return '#000000';
}

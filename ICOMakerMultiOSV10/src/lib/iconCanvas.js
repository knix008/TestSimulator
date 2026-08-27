// Icon design canvas model.
//
// Objects live in a logical 512x512 coordinate space. The same objects are
// rendered live (React SVG) and serialized to a standalone SVG string that we
// rasterize at each requested size to build a multi-resolution .ico.
import { encodeIco } from './ico.js';

export const CANVAS = 512;
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

export const SHAPE_TOOLS = ['select', 'rect', 'ellipse', 'line', 'pen', 'text'];
// Parametric flat shapes and pseudo-3D solids (all box-based like rect).
export const PARAM_SHAPES = [
  'triangle', 'rightTriangle', 'diamond', 'trapezoid', 'parallelogram',
  'pentagon', 'hexagon', 'octagon', 'star', 'plus', 'chevron',
  'arrow', 'heart', 'bolt', 'moon', 'cloud', 'ring', 'gear',
];
export const SOLID_SHAPES = ['cube', 'cylinder', 'sphere', 'cone', 'pyramid'];
export const SHAPE_NAMES = [...PARAM_SHAPES, ...SOLID_SHAPES];

let seq = 0;
export function uid() {
  seq += 1;
  return `o${seq}_${Math.floor(Math.random() * 1e6)}`;
}

const DEFAULT_FX = {
  shadow: false, shadowDx: 0, shadowDy: 8, shadowBlur: 8, shadowColor: '#000000', shadowOpacity: 0.45,
  blur: 0,
  threeD: false, depth: 6, lightX: 150, lightY: 110,
  gloss: false,
};

export function createObject(type, x, y) {
  const base = {
    id: uid(), type,
    fill: '#3b82f6', hasFill: true,
    stroke: '#1e3a8a', hasStroke: false, strokeWidth: 6,
    opacity: 1, rotate: 0,
    fx: { ...DEFAULT_FX },
  };
  if (SHAPE_NAMES.includes(type)) {
    return { ...base, type: 'shape', shape: type, x, y, w: 0, h: 0 };
  }
  switch (type) {
    case 'rect':
      return { ...base, x, y, w: 0, h: 0, rx: 24 };
    case 'ellipse':
      return { ...base, x, y, w: 0, h: 0 };
    case 'line':
      return { ...base, x1: x, y1: y, x2: x, y2: y, hasFill: false, hasStroke: true, stroke: '#1e3a8a', strokeWidth: 8 };
    case 'pen':
      return { ...base, points: [[x, y]], hasFill: false, hasStroke: true, stroke: '#1e3a8a', strokeWidth: 8 };
    case 'text':
      return { ...base, x, y, w: 260, h: 96, text: 'Text', fontSize: 96, fontWeight: 700, fill: '#111827' };
    case 'image':
      return { ...base, x, y, w: 0, h: 0, href: '', hasFill: false };
    default:
      return base;
  }
}

// Axis-aligned bounding box for selection UI.
export function bbox(o) {
  if (o.type === 'line') {
    const x = Math.min(o.x1, o.x2), y = Math.min(o.y1, o.y2);
    return { x, y, w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  }
  if (o.type === 'pen') {
    const xs = o.points.map((p) => p[0]), ys = o.points.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

// Normalize a possibly-negative-size box (after drag) to positive w/h.
export function normalizeBox(o) {
  if (!['rect', 'ellipse', 'image', 'text', 'shape'].includes(o.type)) return o;
  let { x, y, w, h } = o;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { ...o, x, y, w, h };
}

export function hasFx(o) {
  const f = o.fx || {};
  return !!(f.shadow || f.blur > 0 || f.threeD);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Build an SVG <filter> for an object's effects (blur, 3D bevel, drop shadow).
export function filterDef(o) {
  if (!hasFx(o)) return '';
  const f = o.fx;
  const parts = [];
  let src = 'SourceGraphic';

  if (f.blur > 0) {
    parts.push(`<feGaussianBlur in="${src}" stdDeviation="${f.blur}" result="fx_blur"/>`);
    src = 'fx_blur';
  }

  if (f.threeD) {
    const d = Math.max(1, f.depth);
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${d}" result="fx_bump"/>`,
      `<feSpecularLighting in="fx_bump" surfaceScale="${d}" specularConstant="0.9" specularExponent="18" lighting-color="#ffffff" result="fx_spec"><fePointLight x="${f.lightX}" y="${f.lightY}" z="260"/></feSpecularLighting>`,
      `<feComposite in="fx_spec" in2="SourceAlpha" operator="in" result="fx_specClip"/>`,
      `<feComposite in="${src}" in2="fx_specClip" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="fx_lit"/>`
    );
    src = 'fx_lit';
  }

  if (f.shadow) {
    parts.push(
      `<feDropShadow in="${src}" dx="${f.shadowDx}" dy="${f.shadowDy}" stdDeviation="${f.shadowBlur}" flood-color="${f.shadowColor}" flood-opacity="${f.shadowOpacity}"/>`
    );
  } else if (src !== 'SourceGraphic') {
    // Ensure the last-produced result is actually rendered.
    parts.push(`<feMerge><feMergeNode in="${src}"/></feMerge>`);
  }

  return `<filter id="f-${o.id}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">${parts.join('')}</filter>`;
}

// Attributes shared by shape elements.
function styleAttrs(o) {
  const fill = o.hasFill ? o.fill : 'none';
  const stroke = o.hasStroke ? `stroke="${o.stroke}" stroke-width="${o.strokeWidth}"` : 'stroke="none"';
  const filter = hasFx(o) ? ` filter="url(#f-${o.id})"` : '';
  return { fill, stroke, filter, opacity: o.opacity };
}

// Lighten (pct>0) or darken (pct<0) a hex color — used for pseudo-3D shading.
function shade(hex, pct) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
function regularPoly(cx, cy, rx, ry, n, rot = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}
function starPoints(cx, cy, rx, ry, spikes = 5) {
  const out = [];
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1 : 0.42;
    const a = -Math.PI / 2 + i * step;
    out.push([cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]);
  }
  return out;
}
function gearPoints(cx, cy, R, r, teeth = 9) {
  const out = [];
  const seg = teeth * 2;
  for (let i = 0; i < seg; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a0 = (i / seg) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 0.5) / seg) * 2 * Math.PI - Math.PI / 2;
    out.push([cx + rad * Math.cos(a0), cy + rad * Math.sin(a0)]);
    out.push([cx + rad * Math.cos(a1), cy + rad * Math.sin(a1)]);
  }
  return out;
}

function shapeToSvg(o) {
  const { filter } = styleAttrs(o);
  const x = o.x, y = o.y, w = o.w, h = o.h;
  const cx = x + w / 2, cy = y + h / 2;
  const fillA = o.hasFill ? o.fill : 'none';
  const strokeA = o.hasStroke ? `stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linejoin="round"` : 'stroke="none"';
  const flat = (points) => `<polygon points="${pts(points)}" fill="${fillA}" ${strokeA} opacity="${o.opacity}"${filter}/>`;

  const pathEl = (d, extra = '') => `<path d="${d}" ${extra} fill="${fillA}" ${strokeA} opacity="${o.opacity}"${filter}/>`;

  switch (o.shape) {
    case 'triangle': return flat([[cx, y], [x + w, y + h], [x, y + h]]);
    case 'rightTriangle': return flat([[x, y], [x, y + h], [x + w, y + h]]);
    case 'diamond': return flat([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]);
    case 'trapezoid': return flat([[x + w * 0.22, y], [x + w * 0.78, y], [x + w, y + h], [x, y + h]]);
    case 'parallelogram': return flat([[x + w * 0.25, y], [x + w, y], [x + w * 0.75, y + h], [x, y + h]]);
    case 'pentagon': return flat(regularPoly(cx, cy, w / 2, h / 2, 5));
    case 'hexagon': return flat(regularPoly(cx, cy, w / 2, h / 2, 6, 0));
    case 'octagon': return flat(regularPoly(cx, cy, w / 2, h / 2, 8, -Math.PI / 2 + Math.PI / 8));
    case 'star': return flat(starPoints(cx, cy, w / 2, h / 2, 5));
    case 'gear': return flat(gearPoints(cx, cy, Math.min(w, h) / 2, Math.min(w, h) / 2 * 0.72, 9));
    case 'plus': {
      const ax = x + w / 3, bx = x + 2 * w / 3, ay = y + h / 3, by = y + 2 * h / 3;
      return flat([[ax, y], [bx, y], [bx, ay], [x + w, ay], [x + w, by], [bx, by], [bx, y + h], [ax, y + h], [ax, by], [x, by], [x, ay], [ax, ay]]);
    }
    case 'chevron': return flat([[x, y], [x + w * 0.55, y], [x + w, cy], [x + w * 0.55, y + h], [x, y + h], [x + w * 0.45, cy]]);
    case 'arrow': {
      const bw = x + w * 0.62;
      return flat([[x, y + h * 0.3], [bw, y + h * 0.3], [bw, y], [x + w, cy], [bw, y + h], [bw, y + h * 0.7], [x, y + h * 0.7]]);
    }
    case 'bolt':
      return flat([[x + w * 0.55, y], [x + w * 0.18, y + h * 0.56], [x + w * 0.44, y + h * 0.56], [x + w * 0.33, y + h], [x + w * 0.82, y + h * 0.4], [x + w * 0.52, y + h * 0.4]]);
    case 'heart': {
      const d = `M ${cx} ${y + h} C ${x} ${y + h * 0.62}, ${x} ${y + h * 0.12}, ${cx} ${y + h * 0.36}`
        + ` C ${x + w} ${y + h * 0.12}, ${x + w} ${y + h * 0.62}, ${cx} ${y + h} Z`;
      return pathEl(d);
    }
    case 'moon': {
      const R = Math.min(w, h) / 2;
      return pathEl(`M ${cx} ${cy - R} A ${R} ${R} 0 1 0 ${cx} ${cy + R} A ${R * 0.78} ${R} 0 1 1 ${cx} ${cy - R} Z`);
    }
    case 'cloud': {
      const d = `M ${x + w * 0.02} ${y + h * 0.78} Q ${x} ${y + h * 0.52} ${x + w * 0.2} ${y + h * 0.5}`
        + ` Q ${x + w * 0.22} ${y + h * 0.24} ${x + w * 0.46} ${y + h * 0.32}`
        + ` Q ${x + w * 0.56} ${y + h * 0.1} ${x + w * 0.74} ${y + h * 0.3}`
        + ` Q ${x + w * 0.98} ${y + h * 0.3} ${x + w * 0.96} ${y + h * 0.56}`
        + ` Q ${x + w} ${y + h * 0.78} ${x + w * 0.78} ${y + h * 0.78} Z`;
      return pathEl(d);
    }
    case 'ring': {
      const R = Math.min(w, h) / 2, r = R * 0.55, ey = y + h / 2;
      const d = `M ${cx - R} ${ey} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z`
        + ` M ${cx - r} ${ey} a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0 Z`;
      return pathEl(d, 'fill-rule="evenodd"');
    }
    default: return solidToSvg(o, filter);
  }
}

function solidToSvg(o, filter) {
  const x = o.x, y = o.y, w = o.w, h = o.h;
  const cx = x + w / 2;
  const base = o.hasFill ? o.fill : '#94a3b8';
  const light = shade(base, 28), dark = shade(base, -20), darker = shade(base, -34);
  const st = o.hasStroke ? `stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linejoin="round"` : '';
  const P = (points, fill) => `<polygon points="${pts(points)}" fill="${fill}" ${st}/>`;
  let body = '';

  switch (o.shape) {
    case 'cube': {
      const d = Math.min(w, h) * 0.32;
      body =
        P([[x, y + d], [x + w - d, y + d], [x + w - d, y + h], [x, y + h]], base) +          // front
        P([[x, y + d], [x + d, y], [x + w, y], [x + w - d, y + d]], light) +                 // top
        P([[x + w - d, y + d], [x + w, y], [x + w, y + h - d], [x + w - d, y + h]], dark);   // right
      break;
    }
    case 'pyramid': {
      body =
        P([[cx, y], [x, y + h], [cx, y + h]], base) +
        P([[cx, y], [x + w, y + h], [cx, y + h]], dark);
      break;
    }
    case 'cone': {
      const eh = h * 0.16, by = y + h - eh;
      body =
        `<ellipse cx="${cx}" cy="${by}" rx="${w / 2}" ry="${eh}" fill="${darker}" ${st}/>` +
        P([[cx, y], [x, by], [cx, by]], base) +
        P([[cx, y], [x + w, by], [cx, by]], dark);
      break;
    }
    case 'cylinder': {
      const eh = h * 0.14;
      body =
        `<ellipse cx="${cx}" cy="${y + h - eh}" rx="${w / 2}" ry="${eh}" fill="${dark}" ${st}/>` +
        `<rect x="${x}" y="${y + eh}" width="${w}" height="${h - 2 * eh}" fill="${base}"/>` +
        `<line x1="${x}" y1="${y + eh}" x2="${x}" y2="${y + h - eh}" ${st ? st : `stroke="none"`}/>` +
        `<line x1="${x + w}" y1="${y + eh}" x2="${x + w}" y2="${y + h - eh}" ${st ? st : `stroke="none"`}/>` +
        `<ellipse cx="${cx}" cy="${y + eh}" rx="${w / 2}" ry="${eh}" fill="${light}" ${st}/>`;
      break;
    }
    case 'sphere': {
      const r = Math.min(w, h) / 2;
      body =
        `<defs><radialGradient id="g-${o.id}" cx="0.35" cy="0.32" r="0.75">`
        + `<stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${darker}"/>`
        + `</radialGradient></defs>`
        + `<circle cx="${cx}" cy="${y + h / 2}" r="${r}" fill="url(#g-${o.id})" ${st}/>`;
      break;
    }
    default:
      body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${base}" ${st}/>`;
  }
  return `<g opacity="${o.opacity}"${filter}>${body}</g>`;
}

export function objToSvg(o) {
  const inner = o.type === 'shape' ? shapeToSvg(o) : basicToSvg(o);
  if (!o.rotate) return inner;
  const b = bbox(o);
  return `<g transform="rotate(${o.rotate} ${b.x + b.w / 2} ${b.y + b.h / 2})">${inner}</g>`;
}

function basicToSvg(o) {
  const { fill, stroke, filter, opacity } = styleAttrs(o);
  const common = `${stroke} opacity="${opacity}"${filter}`;
  switch (o.type) {
    case 'rect':
      return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.rx || 0}" fill="${fill}" ${common}/>`;
    case 'ellipse':
      return `<ellipse cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${o.w / 2}" ry="${o.h / 2}" fill="${fill}" ${common}/>`;
    case 'line':
      return `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke-linecap="round" ${stroke} opacity="${opacity}"${filter}/>`;
    case 'pen': {
      const d = o.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
      return `<path d="${d}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${stroke} opacity="${opacity}"${filter}/>`;
    }
    case 'text':
      return `<text x="${o.x}" y="${o.y + (o.fontSize || 96) * 0.8}" font-size="${o.fontSize}" font-weight="${o.fontWeight || 700}" font-family="Segoe UI, Malgun Gothic, sans-serif" fill="${fill}" ${stroke} opacity="${opacity}"${filter}>${esc(o.text)}</text>`;
    case 'image':
      return o.href
        ? `<image x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" href="${o.href}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}"${filter}/>`
        : '';
    default:
      return '';
  }
}

// bgPad is the background margin as a percentage (0..45) of the canvas.
export function bgRect(background, bgPad = 0) {
  if (!background || background === 'transparent') return '';
  const pad = (Math.min(Math.max(bgPad, 0), 45) / 100) * CANVAS;
  const size = CANVAS - pad * 2;
  return `<rect x="${pad}" y="${pad}" width="${size}" height="${size}" fill="${background}"/>`;
}

export function serializeSvg(objects, size, background, opacity = 100, bgPad = 0) {
  const defs = objects.map(filterDef).filter(Boolean).join('');
  const body = objects.map(objToSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}">`
    + `<defs>${defs}</defs>${bgRect(background, bgPad)}<g opacity="${opacity / 100}">${body}</g></svg>`;
}

function loadSvgImage(svg) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve({ img, url }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to rasterize the canvas SVG.')); };
    img.src = url;
  });
}

export async function svgToPngBytes(svg, size) {
  const { img, url } = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  URL.revokeObjectURL(url);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('canvas.toBlob returned null');
  return new Uint8Array(await blob.arrayBuffer());
}

// Rasterize the design at each selected size and pack into a single .ico.
export async function buildIco(objects, { sizes, background, opacity, bgPad = 0 }) {
  const use = (sizes && sizes.length ? sizes : ICO_SIZES).filter((s) => s <= 256).sort((a, b) => a - b);
  if (!use.length) throw new Error('Select at least one icon size.');
  const entries = [];
  for (const size of use) {
    const svg = serializeSvg(objects, size, background, opacity, bgPad);
    entries.push({ size, png: await svgToPngBytes(svg, size) });
  }
  return encodeIco(entries);
}

// Build one single-size .ico file per selected size (for per-size export).
export async function buildIcoEach(objects, { sizes, background, opacity, bgPad = 0 }) {
  const use = (sizes && sizes.length ? sizes : ICO_SIZES).filter((s) => s <= 256).sort((a, b) => a - b);
  if (!use.length) throw new Error('Select at least one icon size.');
  const files = [];
  for (const size of use) {
    const png = await svgToPngBytes(serializeSvg(objects, size, background, opacity, bgPad), size);
    files.push({ name: `icon-${size}x${size}.ico`, bytes: encodeIco([{ size, png }]) });
  }
  return files;
}

// Preview PNG (single size) for the export panel / thumbnails.
export async function previewPng(objects, size, background, opacity) {
  return svgToPngBytes(serializeSvg(objects, size, background, opacity), size);
}

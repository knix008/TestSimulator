// The icon design model and its SVG form.
//
// Objects live in a 512 × 512 logical space. The same objects are drawn live on the canvas
// (as SVG) and serialized to a standalone SVG that is rasterized at every requested size to
// build .ico / .icns / PNG files. Everything here is pure (no DOM) except the rasterizers at
// the end, so the model is tested in Node.
import { encodeIco, encodeIcns } from './ico.js';
import { SHAPE_BY_ID, isSolid, scalePath } from './shapes.js';
import { EMOJI_ART } from './emoji.js';

export const CANVAS = 512;
export const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
export const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];
export const PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024];
export const DEFAULT_SIZES = [16, 24, 32, 48, 64, 128, 256];
export const FONTS = ['Segoe UI', 'Malgun Gothic', 'Arial', 'Georgia', 'Consolas', 'Impact', 'Comic Sans MS', 'Times New Roman', 'Verdana', 'Trebuchet MS'];

/** Box objects resize by their box; point objects by scaling their points. */
export const BOX_TYPES = ['rect', 'ellipse', 'image', 'text', 'shape', 'emoji'];
export const POINT_TYPES = ['pen', 'poly'];

let seq = 0;
export function uid() {
  seq += 1;
  return `o${Date.now().toString(36)}${seq}${Math.floor(Math.random() * 1e4)}`;
}

export const DEFAULT_FX = {
  shadow: false, shadowDx: 0, shadowDy: 10, shadowBlur: 10, shadowColor: '#000000', shadowOpacity: 0.45,
  blur: 0,
  threeD: false, depth: 6, lightX: 150, lightY: 110,
  gloss: false, glossOpacity: 0.55,
  glow: false, glowColor: '#ffe066', glowSize: 10,
};

export const DEFAULT_STYLE = { fill: '#3b82f6', fill2: '#1e40af', stroke: '#0f172a', strokeWidth: 8 };

/** A new object of a tool type at (x, y). `style` supplies the current colours. */
export function createObject(type, x, y, style = DEFAULT_STYLE) {
  const base = {
    id: uid(), type,
    fill: style.fill, fill2: style.fill2 ?? '#1e40af', fillType: 'solid', gradAngle: 90, hasFill: true,
    stroke: style.stroke, hasStroke: false, strokeWidth: style.strokeWidth ?? 8, dash: 'solid',
    opacity: 1, rotate: 0, flipX: false, flipY: false, locked: false, hidden: false,
    fx: { ...DEFAULT_FX },
  };
  if (SHAPE_BY_ID[type] || isSolid(type)) return { ...base, type: 'shape', shape: type, x, y, w: 0, h: 0 };
  switch (type) {
    case 'rect': return { ...base, x, y, w: 0, h: 0, rx: 0 };
    case 'roundRect': return { ...base, type: 'rect', x, y, w: 0, h: 0, rx: 64 };
    case 'ellipse': return { ...base, x, y, w: 0, h: 0 };
    case 'line': return { ...base, x1: x, y1: y, x2: x, y2: y, hasFill: false, hasStroke: true, arrowStart: false, arrowEnd: false };
    case 'arrowLine': return { ...base, type: 'line', x1: x, y1: y, x2: x, y2: y, hasFill: false, hasStroke: true, arrowStart: false, arrowEnd: true };
    case 'pen': return { ...base, points: [[x, y]], hasFill: false, hasStroke: true };
    case 'brush': return { ...base, type: 'pen', points: [[x, y]], hasFill: false, hasStroke: true, strokeWidth: Math.max(28, base.strokeWidth * 3), opacity: 0.55, stroke: style.fill };
    case 'poly': return { ...base, points: [[x, y]], closed: true, hasStroke: true };
    case 'text': return { ...base, x, y, w: 240, h: 116, text: 'Aa', fontSize: 96, fontWeight: 700, italic: false, fontFamily: 'Segoe UI' };
    case 'image': return { ...base, x, y, w: 0, h: 0, href: '', hasFill: false };
    case 'emoji': return { ...base, x, y, w: 0, h: 0, emoji: '1f600', hasFill: false };
    default: return base;
  }
}

/** Axis-aligned box of an object (before rotation). */
export function bbox(o) {
  if (o.type === 'line') {
    const x = Math.min(o.x1, o.x2);
    const y = Math.min(o.y1, o.y2);
    return { x, y, w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  }
  if (POINT_TYPES.includes(o.type)) {
    const xs = o.points.map((p) => p[0]);
    const ys = o.points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

/** A box drawn backwards (negative width or height) made positive. */
export function normalizeBox(o) {
  if (!BOX_TYPES.includes(o.type)) return o;
  let { x, y, w, h } = o;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { ...o, x, y, w, h };
}

/** The object moved by dx, dy. */
export function moveObject(o, dx, dy) {
  if (o.type === 'line') return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
  if (POINT_TYPES.includes(o.type)) return { ...o, points: o.points.map(([x, y]) => [x + dx, y + dy]) };
  return { ...o, x: o.x + dx, y: o.y + dy };
}

/** The object fitted into a new box (points and line ends scale with it). */
export function resizeObject(o, box) {
  const b = bbox(o);
  const w = Math.max(1, box.w);
  const h = Math.max(1, box.h);
  if (o.type === 'line') {
    const sx = b.w ? w / b.w : 1;
    const sy = b.h ? h / b.h : 1;
    return { ...o, x1: box.x + (o.x1 - b.x) * sx, y1: box.y + (o.y1 - b.y) * sy, x2: box.x + (o.x2 - b.x) * sx, y2: box.y + (o.y2 - b.y) * sy };
  }
  if (POINT_TYPES.includes(o.type)) {
    const sx = b.w ? w / b.w : 1;
    const sy = b.h ? h / b.h : 1;
    return { ...o, points: o.points.map(([x, y]) => [box.x + (x - b.x) * sx, box.y + (y - b.y) * sy]) };
  }
  const next = { ...o, x: box.x, y: box.y, w, h };
  // Text follows its box: the font grows with the height.
  if (o.type === 'text' && b.h > 0) next.fontSize = Math.max(6, Math.round((o.fontSize || 96) * (h / b.h)));
  return next;
}

/** Aligns the object inside the canvas (left, hcenter, right, top, vcenter, bottom). */
export function alignObject(o, how) {
  const b = bbox(o);
  const dx = { left: -b.x, hcenter: (CANVAS - b.w) / 2 - b.x, right: CANVAS - b.w - b.x }[how] ?? 0;
  const dy = { top: -b.y, vcenter: (CANVAS - b.h) / 2 - b.y, bottom: CANVAS - b.h - b.y }[how] ?? 0;
  return moveObject(o, dx, dy);
}

/** A deep copy with a new id, moved by `offset`. */
export function cloneObject(o, offset = 24) {
  const copy = moveObject(JSON.parse(JSON.stringify(o)), offset, offset);
  copy.id = uid();
  return copy;
}

/** Snaps a value to the grid (when the step is positive). */
export const snap = (value, step) => (step > 0 ? Math.round(value / step) * step : value);

export function hasFx(o) {
  const fx = o.fx || {};
  return !!(fx.shadow || fx.blur > 0 || fx.threeD || fx.glow);
}

export function escapeXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** The SVG filter of an object's effects: blur, glow, 3D bevel, drop shadow. */
export function filterDef(o) {
  if (!hasFx(o)) return '';
  const fx = { ...DEFAULT_FX, ...o.fx };
  const parts = [];
  let src = 'SourceGraphic';
  if (fx.blur > 0) {
    parts.push(`<feGaussianBlur in="${src}" stdDeviation="${fx.blur}" result="fxBlur"/>`);
    src = 'fxBlur';
  }
  if (fx.threeD) {
    const d = Math.max(1, fx.depth);
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${d}" result="fxBump"/>`,
      `<feSpecularLighting in="fxBump" surfaceScale="${d}" specularConstant="0.9" specularExponent="18" lighting-color="#ffffff" result="fxSpec"><fePointLight x="${fx.lightX}" y="${fx.lightY}" z="260"/></feSpecularLighting>`,
      `<feComposite in="fxSpec" in2="SourceAlpha" operator="in" result="fxSpecClip"/>`,
      `<feComposite in="${src}" in2="fxSpecClip" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="fxLit"/>`,
    );
    src = 'fxLit';
  }
  if (fx.glow) {
    parts.push(
      `<feMorphology in="SourceAlpha" operator="dilate" radius="${Math.max(1, fx.glowSize / 3)}" result="fxGrow"/>`,
      `<feGaussianBlur in="fxGrow" stdDeviation="${Math.max(1, fx.glowSize)}" result="fxGlowBlur"/>`,
      `<feFlood flood-color="${fx.glowColor}" result="fxGlowColor"/>`,
      `<feComposite in="fxGlowColor" in2="fxGlowBlur" operator="in" result="fxGlow"/>`,
      `<feMerge result="fxGlowed"><feMergeNode in="fxGlow"/><feMergeNode in="${src}"/></feMerge>`,
    );
    src = 'fxGlowed';
  }
  if (fx.shadow) {
    parts.push(`<feDropShadow in="${src}" dx="${fx.shadowDx}" dy="${fx.shadowDy}" stdDeviation="${fx.shadowBlur}" flood-color="${fx.shadowColor}" flood-opacity="${fx.shadowOpacity}"/>`);
  } else if (src !== 'SourceGraphic') {
    parts.push(`<feMerge><feMergeNode in="${src}"/></feMerge>`);
  }
  return `<filter id="f-${o.id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${parts.join('')}</filter>`;
}

/** The gradient of an object's fill, when it has one. */
export function gradientDef(o) {
  if (!o.hasFill || !o.fillType || o.fillType === 'solid') return '';
  if (o.fillType === 'radial') {
    return `<radialGradient id="g-${o.id}" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="${o.fill}"/><stop offset="1" stop-color="${o.fill2}"/></radialGradient>`;
  }
  const a = ((o.gradAngle ?? 90) * Math.PI) / 180;
  const dx = Math.cos(a) / 2;
  const dy = Math.sin(a) / 2;
  return `<linearGradient id="g-${o.id}" x1="${(0.5 - dx).toFixed(3)}" y1="${(0.5 - dy).toFixed(3)}" x2="${(0.5 + dx).toFixed(3)}" y2="${(0.5 + dy).toFixed(3)}"><stop offset="0" stop-color="${o.fill}"/><stop offset="1" stop-color="${o.fill2}"/></linearGradient>`;
}

const glossDef = (o) => (o.fx?.gloss ? `<linearGradient id="gl-${o.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="${o.fx.glossOpacity ?? 0.55}"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="0.52" stop-color="#ffffff" stop-opacity="0"/></linearGradient>` : '');

/** Every definition the object needs (filter, gradient, gloss). */
export const objectDefs = (o) => filterDef(o) + gradientDef(o) + glossDef(o);

const fillOf = (o) => (!o.hasFill ? 'none' : o.fillType && o.fillType !== 'solid' ? `url(#g-${o.id})` : o.fill);
const DASHES = { solid: '', dash: (w) => `${w * 3} ${w * 2}`, dot: (w) => `0 ${w * 2}` };
function strokeOf(o) {
  if (!o.hasStroke) return 'stroke="none"';
  const dash = DASHES[o.dash] ? DASHES[o.dash] : '';
  const dashAttr = typeof dash === 'function' ? ` stroke-dasharray="${dash(o.strokeWidth)}"` : '';
  return `stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${dashAttr}`;
}

/** Lightens (pct > 0) or darkens (pct < 0) a hex colour — the faces of the solids. */
export function shade(hex, pct) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) h = '94a3b8';
  const target = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  const ch = (i) => Math.round((target - parseInt(h.slice(i, i + 2), 16)) * p + parseInt(h.slice(i, i + 2), 16));
  return `#${[0, 2, 4].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`;
}

const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/** The geometry of an object as one path (for gloss); '' when it has none. */
function geometryPath(o) {
  if (o.type === 'shape' && SHAPE_BY_ID[o.shape]) return scalePath(SHAPE_BY_ID[o.shape].d, o.x, o.y, o.w, o.h);
  if (o.type === 'rect') {
    const r = Math.max(0, Math.min(o.rx || 0, o.w / 2, o.h / 2));
    if (!r) return `M${o.x} ${o.y} H${o.x + o.w} V${o.y + o.h} H${o.x} Z`;
    return `M${o.x + r} ${o.y} H${o.x + o.w - r} A${r} ${r} 0 0 1 ${o.x + o.w} ${o.y + r} V${o.y + o.h - r} A${r} ${r} 0 0 1 ${o.x + o.w - r} ${o.y + o.h} H${o.x + r} A${r} ${r} 0 0 1 ${o.x} ${o.y + o.h - r} V${o.y + r} A${r} ${r} 0 0 1 ${o.x + r} ${o.y} Z`;
  }
  if (o.type === 'ellipse' || o.type === 'emoji') {
    const cx = o.x + o.w / 2; const cy = o.y + o.h / 2; const rx = o.w / 2; const ry = o.h / 2;
    return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`;
  }
  if (o.type === 'poly' && o.closed && o.points.length > 2) return `M${o.points.map((p) => p.join(' ')).join(' L')} Z`;
  return '';
}

function glossOverlay(o) {
  if (!o.fx?.gloss) return '';
  const d = geometryPath(o);
  if (!d) return '';
  const rule = o.type === 'shape' ? SHAPE_BY_ID[o.shape]?.rule ?? 'nonzero' : 'nonzero';
  return `<path d="${d}" fill="url(#gl-${o.id})" fill-rule="${rule}" stroke="none" pointer-events="none"/>`;
}

function arrowHead(x1, y1, x2, y2, size, color) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const back = [x2 - size * Math.cos(a), y2 - size * Math.sin(a)];
  const left = [back[0] + (size / 2) * Math.cos(a + Math.PI / 2), back[1] + (size / 2) * Math.sin(a + Math.PI / 2)];
  const right = [back[0] + (size / 2) * Math.cos(a - Math.PI / 2), back[1] + (size / 2) * Math.sin(a - Math.PI / 2)];
  return `<polygon points="${pts([[x2, y2], left, right])}" fill="${color}"/>`;
}

function solidToSvg(o) {
  const { x, y, w, h } = o;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const base = o.hasFill ? o.fill : '#94a3b8';
  const light = shade(base, 30);
  const dark = shade(base, -22);
  const darker = shade(base, -38);
  const st = o.hasStroke ? `stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linejoin="round"` : 'stroke="none"';
  const P = (points, fill) => `<polygon points="${pts(points)}" fill="${fill}" ${st}/>`;
  const E = (ex, ey, rx, ry, fill) => `<ellipse cx="${ex}" cy="${ey}" rx="${Math.abs(rx)}" ry="${Math.abs(ry)}" fill="${fill}" ${st}/>`;
  const radial = (id, stops) => `<defs><radialGradient id="${id}" cx="0.35" cy="0.3" r="0.8">${stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join('')}</radialGradient></defs>`;
  switch (o.shape) {
    case 'cube': {
      const d = Math.min(w, h) * 0.32;
      return P([[x, y + d], [x + w - d, y + d], [x + w - d, y + h], [x, y + h]], base)
        + P([[x, y + d], [x + d, y], [x + w, y], [x + w - d, y + d]], light)
        + P([[x + w - d, y + d], [x + w, y], [x + w, y + h - d], [x + w - d, y + h]], dark);
    }
    case 'pyramid':
      return P([[cx, y], [x, y + h * 0.86], [cx - w * 0.08, y + h]], base) + P([[cx, y], [cx - w * 0.08, y + h], [x + w, y + h * 0.8]], dark);
    case 'prism': {
      const d = w * 0.3;
      return P([[x, y + h], [x + (w - d) / 2, y + d * 0.6], [x + w - d, y + h]], base)
        + P([[x + (w - d) / 2, y + d * 0.6], [x + (w - d) / 2 + d, y], [x + w, y + h - d * 0.6], [x + w - d, y + h]], dark);
    }
    case 'hexPrism': {
      const eh = h * 0.16;
      const top = [[x, y + eh], [x + w * 0.25, y], [x + w * 0.75, y], [x + w, y + eh], [x + w * 0.75, y + 2 * eh], [x + w * 0.25, y + 2 * eh]];
      return P([[x, y + eh], [x + w * 0.25, y + 2 * eh], [x + w * 0.25, y + h], [x, y + h - eh]], dark)
        + P([[x + w * 0.25, y + 2 * eh], [x + w * 0.75, y + 2 * eh], [x + w * 0.75, y + h], [x + w * 0.25, y + h]], base)
        + P([[x + w * 0.75, y + 2 * eh], [x + w, y + eh], [x + w, y + h - eh], [x + w * 0.75, y + h]], darker)
        + P(top, light);
    }
    case 'cone': {
      const eh = h * 0.16;
      const by = y + h - eh;
      return E(cx, by, w / 2, eh, darker) + P([[cx, y], [x, by], [cx, by + eh]], base) + P([[cx, y], [cx, by + eh], [x + w, by]], dark);
    }
    case 'cylinder': {
      const eh = h * 0.14;
      return `${E(cx, y + h - eh, w / 2, eh, dark)}<rect x="${x}" y="${y + eh}" width="${w}" height="${Math.max(0, h - 2 * eh)}" fill="${base}"/>`
        + (o.hasStroke ? `<line x1="${x}" y1="${y + eh}" x2="${x}" y2="${y + h - eh}" ${st}/><line x1="${x + w}" y1="${y + eh}" x2="${x + w}" y2="${y + h - eh}" ${st}/>` : '')
        + E(cx, y + eh, w / 2, eh, light);
    }
    case 'coin': {
      const t = h * 0.12;
      return E(cx, cy + t / 2, w / 2, h / 2 - t / 2, darker) + E(cx, cy - t / 2, w / 2, h / 2 - t / 2, base) + E(cx, cy - t / 2, w * 0.36, (h / 2 - t / 2) * 0.72, light);
    }
    case 'sphere':
      return radial(`s-${o.id}`, [[0, light], [0.55, base], [1, darker]]) + `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="url(#s-${o.id})" ${st}/>`;
    case 'hemisphere':
      return radial(`s-${o.id}`, [[0, light], [0.6, base], [1, darker]])
        + `<path d="M${x} ${y + h * 0.8} A${w / 2} ${h * 0.8} 0 0 1 ${x + w} ${y + h * 0.8} Z" fill="url(#s-${o.id})" ${st}/>`
        + E(cx, y + h * 0.8, w / 2, h * 0.2, dark);
    case 'torus': {
      const ring = `M${x} ${cy} A${w / 2} ${h / 2} 0 1 1 ${x + w} ${cy} A${w / 2} ${h / 2} 0 1 1 ${x} ${cy} Z M${cx - w * 0.2} ${cy} A${w * 0.2} ${h * 0.14} 0 1 0 ${cx + w * 0.2} ${cy} A${w * 0.2} ${h * 0.14} 0 1 0 ${cx - w * 0.2} ${cy} Z`;
      return radial(`s-${o.id}`, [[0, light], [0.5, base], [1, darker]]) + `<path d="${ring}" fill="url(#s-${o.id})" fill-rule="evenodd" ${st}/>`;
    }
    case 'octahedron':
      return P([[cx, y], [x, cy], [cx - w * 0.06, cy + h * 0.08]], light) + P([[cx, y], [cx - w * 0.06, cy + h * 0.08], [x + w, cy]], base)
        + P([[x, cy], [cx, y + h], [cx - w * 0.06, cy + h * 0.08]], dark) + P([[cx - w * 0.06, cy + h * 0.08], [cx, y + h], [x + w, cy]], darker);
    case 'capsule3d': {
      const r = Math.min(w, h) / 2;
      const id = `s-${o.id}`;
      return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="${base}"/><stop offset="1" stop-color="${darker}"/></linearGradient></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#${id})" ${st}/>`;
    }
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${base}" ${st}/>`;
  }
}

function bodyToSvg(o) {
  const fill = fillOf(o);
  const stroke = strokeOf(o);
  switch (o.type) {
    case 'shape': {
      if (isSolid(o.shape)) return solidToSvg(o);
      const shape = SHAPE_BY_ID[o.shape];
      if (!shape) return '';
      return `<path d="${scalePath(shape.d, o.x, o.y, o.w, o.h)}" fill-rule="${shape.rule}" fill="${fill}" ${stroke}/>`;
    }
    case 'rect':
      return `<rect x="${o.x}" y="${o.y}" width="${Math.max(0, o.w)}" height="${Math.max(0, o.h)}" rx="${o.rx || 0}" fill="${fill}" ${stroke}/>`;
    case 'ellipse':
      return `<ellipse cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${Math.abs(o.w / 2)}" ry="${Math.abs(o.h / 2)}" fill="${fill}" ${stroke}/>`;
    case 'line': {
      const size = Math.max(14, o.strokeWidth * 3);
      const color = o.hasStroke ? o.stroke : o.fill;
      return `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" ${stroke}/>`
        + (o.arrowEnd ? arrowHead(o.x1, o.y1, o.x2, o.y2, size, color) : '')
        + (o.arrowStart ? arrowHead(o.x2, o.y2, o.x1, o.y1, size, color) : '');
    }
    case 'pen': {
      if (!o.points.length) return '';
      const d = o.points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      return `<path d="${o.points.length === 1 ? `${d} l0.01 0` : d}" fill="none" ${stroke}/>`;
    }
    case 'poly': {
      if (!o.points.length) return '';
      return o.closed
        ? `<polygon points="${pts(o.points)}" fill="${fill}" ${stroke}/>`
        : `<polyline points="${pts(o.points)}" fill="none" ${stroke}/>`;
    }
    case 'text': {
      const size = o.fontSize || 96;
      return `<text x="${o.x}" y="${o.y + size * 0.86}" font-size="${size}" font-weight="${o.fontWeight || 700}" font-style="${o.italic ? 'italic' : 'normal'}" font-family="${escapeXml(o.fontFamily || 'Segoe UI')}, Malgun Gothic, sans-serif" fill="${fill}" ${stroke} paint-order="stroke">${escapeXml(o.text)}</text>`;
    }
    case 'emoji': {
      // The emoji's vector art (36 × 36) fitted into the box, so every size stays sharp.
      const art = EMOJI_ART[o.emoji];
      return art ? `<svg x="${o.x}" y="${o.y}" width="${Math.max(0, o.w)}" height="${Math.max(0, o.h)}" viewBox="0 0 36 36" preserveAspectRatio="xMidYMid meet" overflow="visible">${art}</svg>` : '';
    }
    case 'image':
      return o.href ? `<image x="${o.x}" y="${o.y}" width="${Math.max(0, o.w)}" height="${Math.max(0, o.h)}" href="${escapeXml(o.href)}" preserveAspectRatio="xMidYMid meet"/>` : '';
    default:
      return '';
  }
}

/** The transform of rotation and flips, around the centre of the object's box. */
export function transformOf(o) {
  if (!o.rotate && !o.flipX && !o.flipY) return '';
  const b = bbox(o);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return `translate(${cx} ${cy}) rotate(${o.rotate || 0}) scale(${o.flipX ? -1 : 1} ${o.flipY ? -1 : 1}) translate(${-cx} ${-cy})`;
}

/** One object as SVG (definitions not included; see objectDefs). Hidden objects draw nothing. */
export function objToSvg(o) {
  if (o.hidden) return '';
  const transform = transformOf(o);
  const filter = hasFx(o) ? ` filter="url(#f-${o.id})"` : '';
  const inner = `<g opacity="${o.opacity ?? 1}"${filter}>${bodyToSvg(o)}${glossOverlay(o)}</g>`;
  return transform ? `<g transform="${transform}">${inner}</g>` : inner;
}

/** The background: a colour, a gradient or nothing; bgPad is the margin in % of the canvas, bgRadius the corner in %. */
export function backgroundSvg(doc) {
  const bg = doc.background ?? 'transparent';
  if (!bg || bg === 'transparent') return '';
  const pad = (Math.min(Math.max(doc.bgPad ?? 0, 0), 45) / 100) * CANVAS;
  const size = CANVAS - pad * 2;
  const r = Math.round((Math.min(Math.max(doc.bgRadius ?? 0, 0), 50) / 100) * size * 100) / 100;
  const shape = doc.bgShape === 'circle'
    ? `<circle cx="${CANVAS / 2}" cy="${CANVAS / 2}" r="${size / 2}"`
    : `<rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="${r}"`;
  if (doc.bgGradient && doc.background2) {
    return `<defs><linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${doc.background2}"/></linearGradient></defs>${shape} fill="url(#bg-grad)"/>`;
  }
  return `${shape} fill="${bg}"/>`;
}

/** The whole design as a standalone SVG of `size` pixels. */
export function serializeSvg(doc, size = CANVAS) {
  const objects = doc.objects ?? [];
  const defs = objects.filter((o) => !o.hidden).map(objectDefs).join('');
  const body = objects.map(objToSvg).join('');
  const opacity = (doc.exportOpacity ?? 100) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}">`
    + `<defs>${defs}</defs>${backgroundSvg(doc)}<g opacity="${opacity}">${body}</g></svg>`;
}

/**
 * Some objects alone as a standalone SVG cropped to them (with room for rotation, shadows and
 * glows), for "My emoji": the part of a design the user wants to reuse.
 */
export function selectionSvg(objects) {
  const shown = (objects ?? []).filter((o) => !o.hidden);
  if (!shown.length) return '';
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const o of shown) {
    const b = bbox(o);
    const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
    const a = ((o.rotate || 0) * Math.PI) / 180;
    // The rotated box's extent; strokes and effects add a margin.
    const hw = (Math.abs(b.w * Math.cos(a)) + Math.abs(b.h * Math.sin(a))) / 2;
    const hh = (Math.abs(b.w * Math.sin(a)) + Math.abs(b.h * Math.cos(a))) / 2;
    const fx = o.fx ?? {};
    const pad = (o.hasStroke ? (o.strokeWidth || 0) / 2 : 0) + (o.type === 'line' ? Math.max(14, (o.strokeWidth || 0) * 3) : 0)
      + (fx.shadow ? Math.abs(fx.shadowDy || 0) + Math.abs(fx.shadowDx || 0) + (fx.shadowBlur || 0) * 2 : 0)
      + (fx.glow ? (fx.glowSize || 0) * 2 : 0) + (fx.blur || 0) * 2 + (fx.threeD ? fx.depth || 0 : 0);
    x0 = Math.min(x0, cx - hw - pad); y0 = Math.min(y0, cy - hh - pad);
    x1 = Math.max(x1, cx + hw + pad); y1 = Math.max(y1, cy + hh + pad);
  }
  const r = (v) => Math.round(v * 100) / 100;
  const w = Math.max(1, x1 - x0); const h = Math.max(1, y1 - y0);
  const defs = shown.map(objectDefs).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x0)} ${r(y0)} ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}"><defs>${defs}</defs>${shown.map(objToSvg).join('')}</svg>`;
}

/** Export sizes in order, limited to what the format allows. */
export function exportSizes(sizes, allowed) {
  const use = [...new Set((sizes ?? []).map(Number))].filter((s) => allowed.includes(s)).sort((a, b) => a - b);
  if (!use.length) throw new Error('NO_SIZES');
  return use;
}

// ── Rasterizing (browser only) ──────────────────────────────────────────────

function loadSvgImage(svg) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to rasterize the design.')); };
    img.src = url;
  });
}

export async function svgToPngBytes(svg, size) {
  const { img, url } = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  URL.revokeObjectURL(url);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('canvas.toBlob returned null');
  return new Uint8Array(await blob.arrayBuffer());
}

export async function pngDataUrl(doc, size) {
  const bytes = await svgToPngBytes(serializeSvg(doc, size), size);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

/** One multi-size .ico. */
export async function buildIco(doc, sizes) {
  const entries = [];
  for (const size of exportSizes(sizes, ICO_SIZES)) entries.push({ size, png: await svgToPngBytes(serializeSvg(doc, size), size) });
  return encodeIco(entries);
}

/** One .ico per size: [{ name, bytes }]. */
export async function buildIcoEach(doc, sizes, base = 'icon') {
  const files = [];
  for (const size of exportSizes(sizes, ICO_SIZES)) {
    files.push({ name: `${base}-${size}x${size}.ico`, bytes: encodeIco([{ size, png: await svgToPngBytes(serializeSvg(doc, size), size) }]) });
  }
  return files;
}

/** A PNG per size: [{ name, bytes }]. */
export async function buildPngs(doc, sizes, base = 'icon') {
  const files = [];
  for (const size of exportSizes(sizes, PNG_SIZES)) files.push({ name: `${base}-${size}x${size}.png`, bytes: await svgToPngBytes(serializeSvg(doc, size), size) });
  return files;
}

/** A macOS .icns with every size it accepts (16 … 1024). */
export async function buildIcns(doc) {
  const entries = [];
  for (const size of ICNS_SIZES) entries.push({ size, png: await svgToPngBytes(serializeSvg(doc, size), size) });
  return encodeIcns(entries);
}

// ── Grid and rulers ──────────────────────────────────────────────────────────

const MAJOR_STEPS = [5, 10, 25, 50, 100, 250, 500];
/**
 * The grid at a zoom: major lines at least ~48 screen pixels apart, each major cell divided 5 × 5.
 * As the zoom passes a threshold the grid is drawn again with the next step.
 */
export function gridSteps(zoom) {
  const major = MAJOR_STEPS.find((s) => s * zoom >= 48) ?? MAJOR_STEPS[MAJOR_STEPS.length - 1];
  return { major, minor: major / 5 };
}

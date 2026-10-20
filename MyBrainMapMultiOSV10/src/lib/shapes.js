// Topic shapes: one definition per shape, used by the renderer (the outline),
// the layout (how much bigger than its text the shape must be, and where the
// text sits inside it) and the Format pane (the same outline drawn small).
// Modelled on the basic and flowchart shapes of Lucidchart and SmartDraw.
//
//   path(w, h, role) → SVG path data of the outline in a w × h box (0,0 top-left)
//   grow(w, h)       → [w, h] of the box around a content box of w × h
//   text             → { dx, dy } (fractions of the box) to move the text off the centre
//   center           → the text is centred (round or pointed shapes)

const r = (v) => Math.round(v * 10) / 10;
const P = (pts) => `M${pts.map(([x, y]) => `${r(x)} ${r(y)}`).join(' L')} Z`;

function roundRect(w, h, rx) {
  const k = Math.max(0, Math.min(rx, w / 2, h / 2));
  if (!k) return P([[0, 0], [w, 0], [w, h], [0, h]]);
  return `M${r(k)} 0 H${r(w - k)} A${r(k)} ${r(k)} 0 0 1 ${r(w)} ${r(k)} V${r(h - k)} A${r(k)} ${r(k)} 0 0 1 ${r(w - k)} ${r(h)} H${r(k)} A${r(k)} ${r(k)} 0 0 1 0 ${r(h - k)} V${r(k)} A${r(k)} ${r(k)} 0 0 1 ${r(k)} 0 Z`;
}
const ellipse = (w, h) => `M0 ${r(h / 2)} A${r(w / 2)} ${r(h / 2)} 0 1 0 ${r(w)} ${r(h / 2)} A${r(w / 2)} ${r(h / 2)} 0 1 0 0 ${r(h / 2)} Z`;

export function cloudPath(x0, y0, x1, y1, bump = 18) {
  const seg = (ax, ay, bx, by) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / bump));
    const dx = (bx - ax) / n, dy = (by - ay) / n;
    const rr = Math.hypot(dx, dy) / 2 * 1.05;
    let s = '';
    for (let i = 0; i < n; i++) s += ` a${r(rr)} ${r(rr)} 0 0 1 ${r(dx)} ${r(dy)}`;
    return s;
  };
  return `M${r(x0)} ${r(y0)}${seg(x0, y0, x1, y0)}${seg(x1, y0, x1, y1)}${seg(x1, y1, x0, y1)}${seg(x0, y1, x0, y0)} Z`;
}

function star(w, h) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? 0.42 : 1;
    pts.push([w / 2 + Math.cos(a) * (w / 2) * k, h * 0.53 + Math.sin(a) * (h * 0.53) * k]);
  }
  return P(pts);
}

export const SHAPE_GROUPS = ['basic', 'flowchart', 'symbol'];

export const SHAPE_DEFS = {
  // ── basic ──
  rounded: { group: 'basic', path: (w, h, role) => roundRect(w, h, role === 'root' ? Math.min(h / 2, 12) : Math.min(h / 2, 7)) },
  rect: { group: 'basic', path: (w, h) => roundRect(w, h, 2) },
  capsule: { group: 'basic', path: (w, h) => roundRect(w, h, h / 2), grow: (w, h) => [w + h * 0.35, h] },
  ellipse: { group: 'basic', center: true, path: ellipse, grow: (w, h) => [w * 1.16 + 6, h * 1.3 + 4] },
  circle: { group: 'basic', center: true, path: ellipse, grow: (w, h) => { const d = Math.max(w * 1.12, h * 1.12); return [d, d]; } },
  diamond: { group: 'basic', center: true, path: (w, h) => P([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]), grow: (w, h) => [w * 1.5 + 8, h * 1.6 + 6] },
  hexagon: { group: 'basic', path: (w, h) => { const k = Math.min(w / 4, h * 0.3); return P([[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]]); }, grow: (w, h) => [w + h * 0.55, h] },
  octagon: { group: 'basic', center: true, path: (w, h) => { const k = Math.min(w, h) * 0.29; return P([[k, 0], [w - k, 0], [w, k], [w, h - k], [w - k, h], [k, h], [0, h - k], [0, k]]); }, grow: (w, h) => [w + h * 0.5, h * 1.15 + 4] },
  pentagon: { group: 'basic', center: true, path: (w, h) => P([[w / 2, 0], [w, h * 0.38], [w * 0.82, h], [w * 0.18, h], [0, h * 0.38]]), grow: (w, h) => [w * 1.35 + 8, h * 1.45 + 6], text: { dx: 0, dy: 0.06 } },
  triangle: { group: 'basic', center: true, path: (w, h) => P([[w / 2, 0], [w, h], [0, h]]), grow: (w, h) => [w * 2 + 12, h * 2.1 + 8], text: { dx: 0, dy: 0.2 } },
  parallelogram: { group: 'basic', path: (w, h) => { const k = Math.min(h * 0.4, w / 4); return P([[k, 0], [w, 0], [w - k, h], [0, h]]); }, grow: (w, h) => [w + h * 0.8, h] },
  trapezoid: { group: 'basic', path: (w, h) => { const k = Math.min(h * 0.4, w / 4); return P([[k, 0], [w - k, 0], [w, h], [0, h]]); }, grow: (w, h) => [w + h * 0.8, h] },
  star: { group: 'basic', center: true, path: star, grow: (w, h) => [w * 2.3 + 12, h * 2.3 + 12], text: { dx: 0, dy: 0.05 } },
  cloud: { group: 'basic', center: true, path: (w, h) => cloudPath(Math.min(9, w * 0.1), Math.min(9, h * 0.18), w - Math.min(9, w * 0.1), h - Math.min(9, h * 0.18), Math.max(10, Math.min(18, h * 0.45))), grow: (w, h) => [w * 1.2 + 24, h * 1.3 + 22] },
  cube: { group: 'basic', path: (w, h) => { const k = Math.min(12, h * 0.25, w * 0.15); return `M0 ${r(k)} H${r(w - k)} V${r(h)} H0 Z M0 ${r(k)} L${r(k)} 0 H${r(w)} L${r(w - k)} ${r(k)} M${r(w - k)} ${r(h)} L${r(w)} ${r(h - k)} V0`; }, grow: (w, h) => [w + Math.min(12, h * 0.3) + 4, h + Math.min(12, h * 0.3) + 4], text: { dx: -0.04, dy: 0.06 } },
  // ── flowchart ──
  document: { group: 'flowchart', path: (w, h) => { const a = h * 0.14; return `M0 0 H${r(w)} V${r(h - a)} C${r(w * 0.75)} ${r(h - a * 2.6)} ${r(w * 0.3)} ${r(h + a * 0.9)} 0 ${r(h - a * 0.6)} Z`; }, grow: (w, h) => [w, h * 1.25 + 4], text: { dx: 0, dy: -0.06 } },
  cylinder: { group: 'flowchart', path: (w, h) => { const ry = Math.min(h * 0.16, 10), rx = w / 2; return `M0 ${r(ry)} A${r(rx)} ${r(ry)} 0 0 1 ${r(w)} ${r(ry)} V${r(h - ry)} A${r(rx)} ${r(ry)} 0 0 1 0 ${r(h - ry)} Z M0 ${r(ry)} A${r(rx)} ${r(ry)} 0 0 0 ${r(w)} ${r(ry)}`; }, grow: (w, h) => [w + 6, h + Math.min(h * 0.32, 20) + 6], text: { dx: 0, dy: 0.05 } },
  predefined: { group: 'flowchart', path: (w, h) => { const k = Math.min(10, w * 0.08); return `M0 0 H${r(w)} V${r(h)} H0 Z M${r(k)} 0 V${r(h)} M${r(w - k)} 0 V${r(h)}`; }, grow: (w, h) => [w + 22, h] },
  delay: { group: 'flowchart', path: (w, h) => `M0 0 H${r(w - h / 2)} A${r(h / 2)} ${r(h / 2)} 0 0 1 ${r(w - h / 2)} ${r(h)} H0 Z`, grow: (w, h) => [w + h * 0.4, h], text: { dx: -0.04, dy: 0 } },
  manualInput: { group: 'flowchart', path: (w, h) => P([[0, h * 0.28], [w, 0], [w, h], [0, h]]), grow: (w, h) => [w + 6, h * 1.35 + 4], text: { dx: 0, dy: 0.08 } },
  arrow: { group: 'flowchart', path: (w, h) => { const k = Math.min(h * 0.55, w * 0.3); return P([[0, h * 0.2], [w - k, h * 0.2], [w - k, 0], [w, h / 2], [w - k, h], [w - k, h * 0.8], [0, h * 0.8]]); }, grow: (w, h) => [w + h * 0.75 + 6, h * 1.6 + 4], text: { dx: -0.07, dy: 0 } },
  chevron: { group: 'flowchart', path: (w, h) => { const k = Math.min(h * 0.4, w / 4); return P([[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h], [k, h / 2]]); }, grow: (w, h) => [w + h * 0.85, h] },
  // ── symbols and notes ──
  speech: { group: 'symbol', path: (w, h) => { const b = h * 0.8, k = Math.min(8, b / 2); return `M${r(k)} 0 H${r(w - k)} Q${r(w)} 0 ${r(w)} ${r(k)} V${r(b - k)} Q${r(w)} ${r(b)} ${r(w - k)} ${r(b)} H${r(w * 0.38)} L${r(w * 0.16)} ${r(h)} L${r(w * 0.22)} ${r(b)} H${r(k)} Q0 ${r(b)} 0 ${r(b - k)} V${r(k)} Q0 0 ${r(k)} 0 Z`; }, grow: (w, h) => [w, h / 0.8], text: { dx: 0, dy: -0.1 } },
  note: { group: 'symbol', path: (w, h) => { const k = Math.min(12, h * 0.35); return `M0 0 H${r(w - k)} L${r(w)} ${r(k)} V${r(h)} H0 Z M${r(w - k)} 0 V${r(k)} H${r(w)}`; }, grow: (w, h) => [w + 8, h] },
  snip: { group: 'symbol', path: (w, h) => { const k = Math.min(10, h * 0.3); return P([[0, 0], [w - k, 0], [w, k], [w, h], [k, h], [0, h - k]]); }, grow: (w, h) => [w + 8, h] },
  tag: { group: 'symbol', path: (w, h) => { const k = h * 0.4; return P([[k, 0], [w, 0], [w, h], [k, h], [0, h / 2]]); }, grow: (w, h) => [w + h * 0.45, h], text: { dx: 0.04, dy: 0 } },
  underline: { group: 'symbol', path: null },
  none: { group: 'symbol', path: null },
};

export const SHAPES = Object.keys(SHAPE_DEFS);
export const ROUND_SHAPES = new Set(SHAPES.filter((s) => SHAPE_DEFS[s].center));
export const shapeDef = (shape) => SHAPE_DEFS[shape] || SHAPE_DEFS.rounded;

/** The outline as SVG path data (null for underline / none). */
export function shapeOutline(shape, w, h, role) {
  const d = shapeDef(shape);
  return d.path ? d.path(w, h, role) : null;
}

/** The box a shape needs around content of w × h (already padded). */
export function shapeGrow(shape, w, h) {
  const d = SHAPE_DEFS[shape];
  return d && d.grow ? d.grow(w, h) : [w, h];
}

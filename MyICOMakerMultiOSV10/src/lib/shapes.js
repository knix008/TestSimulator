// The shape catalogue. Every flat shape is a path drawn in a 100 × 100 unit box and scaled to the
// object's box (scalePath), so the same geometry serves the canvas, the exported icons and the
// coloured buttons of the shape palette. Solids (pseudo-3D) are drawn by iconCanvas.js from
// several shaded faces.
//
// rule: 'evenodd' for shapes with holes made by overlapping sub-paths; otherwise 'nonzero', where
// holes are sub-paths drawn the other way round (arcs with sweep 0).

const f = (n) => (Math.round(n * 100) / 100).toString();

/** A closed polygon path from unit points. */
export const poly = (points) => `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;

/** A regular n-gon filling the box (rotation in radians, 0 = first corner at the top). */
export function regular(n, rotation = 0) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI / 2 + rotation + (i * 2 * Math.PI) / n;
    out.push([50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]);
  }
  return poly(out);
}

/** A star with `spikes` points; inner = inner radius / outer radius. */
export function star(spikes, inner) {
  const out = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / spikes;
    out.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
  }
  return poly(out);
}

/** A circle as a path (sweep 1 = clockwise, filled; sweep 0 = a hole in a nonzero path). */
export const circle = (cx, cy, r, sweep = 1) => `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 ${sweep} ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 ${sweep} ${f(cx - r)} ${f(cy)} Z`;

function gear(teeth, outer, inner, hole) {
  const out = [];
  const seg = teeth * 2;
  for (let i = 0; i < seg; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a0 = (i / seg) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 0.55) / seg) * 2 * Math.PI - Math.PI / 2;
    out.push([50 + r * Math.cos(a0), 50 + r * Math.sin(a0)], [50 + r * Math.cos(a1), 50 + r * Math.sin(a1)]);
  }
  return `${poly(out)} ${circle(50, 50, hole, 0)}`;
}

function sun() {
  let d = circle(50, 50, 26);
  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI) / 6 - Math.PI / 2;
    const tip = [50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)];
    const l = [50 + 33 * Math.cos(a - 0.17), 50 + 33 * Math.sin(a - 0.17)];
    const r = [50 + 33 * Math.cos(a + 0.17), 50 + 33 * Math.sin(a + 0.17)];
    d += ` ${poly([l, tip, r])}`;
  }
  return d;
}

function flower() {
  let d = '';
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    d += `${circle(50 + 28 * Math.cos(a), 50 + 28 * Math.sin(a), 22)} `;
  }
  return `${d}${circle(50, 50, 20)}`;
}

/** Points mirrored left↔right / swapped x↔y (to make the other arrow directions). */
const mirrorX = (points) => points.map(([x, y]) => [100 - x, y]).reverse();
const transpose = (points) => points.map(([x, y]) => [y, x]).reverse();

const ARROW = [[0, 30], [62, 30], [62, 0], [100, 50], [62, 100], [62, 70], [0, 70]];
const DOUBLE = [[0, 50], [28, 0], [28, 30], [72, 30], [72, 0], [100, 50], [72, 100], [72, 70], [28, 70], [28, 100]];

// id, category, path (100-unit box), rule
const DEFS = [
  // ── Basic
  ['triangle', 'basic', poly([[50, 0], [100, 100], [0, 100]])],
  ['rightTriangle', 'basic', poly([[0, 0], [0, 100], [100, 100]])],
  ['diamond', 'basic', poly([[50, 0], [100, 50], [50, 100], [0, 50]])],
  ['trapezoid', 'basic', poly([[22, 0], [78, 0], [100, 100], [0, 100]])],
  ['parallelogram', 'basic', poly([[25, 0], [100, 0], [75, 100], [0, 100]])],
  ['pentagon', 'basic', regular(5)],
  ['hexagon', 'basic', regular(6, Math.PI / 6)],
  ['heptagon', 'basic', regular(7)],
  ['octagon', 'basic', regular(8, Math.PI / 8)],
  ['decagon', 'basic', regular(10)],
  ['semicircle', 'basic', 'M0 100 A50 100 0 0 1 100 100 Z'],
  ['pie', 'basic', 'M50 50 L50 0 A50 50 0 1 0 100 50 Z'],
  ['quarter', 'basic', 'M0 100 L0 0 A100 100 0 0 1 100 100 Z'],
  ['ring', 'basic', `${circle(50, 50, 50)} ${circle(50, 50, 28, 0)}`],
  ['frame', 'basic', 'M0 0 H100 V100 H0 Z M18 18 V82 H82 V18 Z', 'evenodd'],
  ['plus', 'basic', poly([[33, 0], [67, 0], [67, 33], [100, 33], [100, 67], [67, 67], [67, 100], [33, 100], [33, 67], [0, 67], [0, 33], [33, 33]])],
  ['capsule', 'basic', 'M25 0 H75 A25 50 0 0 1 75 100 H25 A25 50 0 0 1 25 0 Z'],
  ['drop', 'basic', 'M50 0 C50 0 90 45 90 65 A40 35 0 0 1 10 65 C10 45 50 0 50 0 Z'],
  ['squircle', 'basic', 'M50 0 C90 0 100 10 100 50 C100 90 90 100 50 100 C10 100 0 90 0 50 C0 10 10 0 50 0 Z'],
  ['cross', 'basic', poly([[20, 0], [50, 30], [80, 0], [100, 20], [70, 50], [100, 80], [80, 100], [50, 70], [20, 100], [0, 80], [30, 50], [0, 20]])],

  // ── Stars and bursts
  ['star4', 'stars', star(4, 0.38)],
  ['star', 'stars', star(5, 0.42)],
  ['star6', 'stars', star(6, 0.55)],
  ['star8', 'stars', star(8, 0.6)],
  ['star12', 'stars', star(12, 0.72)],
  ['burst', 'stars', star(24, 0.82)],
  ['seal', 'stars', star(16, 0.88)],
  ['sun', 'stars', sun()],
  ['flower', 'stars', flower()],
  ['sparkle', 'stars', 'M50 0 Q56 44 100 50 Q56 56 50 100 Q44 56 0 50 Q44 44 50 0 Z'],

  // ── Arrows
  ['arrow', 'arrows', poly(ARROW)],
  ['arrowLeft', 'arrows', poly(mirrorX(ARROW))],
  ['arrowDown', 'arrows', poly(transpose(ARROW))],
  ['arrowUp', 'arrows', poly(transpose(mirrorX(ARROW)))],
  ['doubleArrow', 'arrows', poly(DOUBLE)],
  ['arrowUpDown', 'arrows', poly(transpose(DOUBLE))],
  ['chevron', 'arrows', poly([[0, 0], [55, 0], [100, 50], [55, 100], [0, 100], [45, 50]])],
  ['pentagonArrow', 'arrows', poly([[0, 0], [70, 0], [100, 50], [70, 100], [0, 100]])],
  ['play', 'arrows', poly([[0, 0], [100, 50], [0, 100]])],
  ['fastForward', 'arrows', `${poly([[0, 0], [50, 50], [0, 100]])} ${poly([[50, 0], [100, 50], [50, 100]])}`],
  ['uturn', 'arrows', 'M0 100 V40 A40 40 0 0 1 80 40 V60 H100 L70 100 L40 60 H60 V40 A20 20 0 0 0 20 40 V100 Z'],
  ['refresh', 'arrows', 'M50 13 A42 42 0 1 0 92 55 H74 A24 24 0 1 1 50 31 V44 L72 22 L50 0 Z'],

  // ── Symbols
  ['heart', 'symbols', 'M50 100 C18 76 0 56 0 32 C0 13 14 0 30 0 C40 0 47 6 50 14 C53 6 60 0 70 0 C86 0 100 13 100 32 C100 56 82 76 50 100 Z'],
  ['bolt', 'symbols', poly([[55, 0], [18, 56], [44, 56], [33, 100], [82, 40], [52, 40]])],
  ['moon', 'symbols', 'M62 0 A50 50 0 1 0 100 72 A40 40 0 0 1 62 0 Z'],
  ['cloud', 'symbols', 'M2 78 Q0 52 20 50 Q22 24 46 32 Q56 10 74 30 Q98 30 96 56 Q100 78 78 78 Z'],
  ['gear', 'symbols', gear(9, 50, 38, 16)],
  ['check', 'symbols', poly([[0, 55], [14, 40], [38, 62], [86, 10], [100, 24], [38, 90]])],
  ['flame', 'symbols', 'M50 0 C62 22 88 38 88 64 A38 36 0 0 1 12 64 C12 46 26 34 32 20 C38 34 44 38 50 40 C56 26 54 12 50 0 Z'],
  ['leaf', 'symbols', 'M10 90 C10 40 40 5 95 5 C95 60 60 90 10 90 Z M0 100 L12 86 L15 89 L3 100 Z'],
  ['shield', 'symbols', 'M50 0 L95 15 V45 C95 72 76 90 50 100 C24 90 5 72 5 45 V15 Z'],
  ['house', 'symbols', 'M50 0 L100 45 H86 V100 H60 V68 H40 V100 H14 V45 H0 Z'],
  ['lock', 'symbols', 'M15 45 H85 V100 H15 Z M28 45 V30 A22 22 0 0 1 72 30 V45 H60 V30 A10 10 0 0 0 40 30 V45 Z M41 66 A9 9 0 1 0 59 66 A9 9 0 1 0 41 66 Z M46 74 H54 V88 H46 Z', 'evenodd'],
  ['bell', 'symbols', 'M50 0 C54 0 56 4 56 8 C72 12 82 26 82 46 V66 L94 82 H6 L18 66 V46 C18 26 28 12 44 8 C44 4 46 0 50 0 Z M38 88 H62 A12 12 0 0 1 38 88 Z'],
  ['envelope', 'symbols', 'M0 15 H100 V85 H0 Z M6 21 L50 54 L94 21 L94 27 L50 60 L6 27 Z', 'evenodd'],
  ['folder', 'symbols', 'M0 12 H38 L48 24 H100 V92 H0 Z'],
  ['document', 'symbols', 'M10 0 H66 L90 24 V100 H10 Z M64 2 V26 H88 Z M22 44 H78 V50 H22 Z M22 58 H78 V64 H22 Z M22 72 H62 V78 H22 Z', 'evenodd'],
  ['pin', 'symbols', 'M50 100 C50 100 14 60 14 36 A36 36 0 0 1 86 36 C86 60 50 100 50 100 Z M36 36 A14 14 0 1 0 64 36 A14 14 0 1 0 36 36 Z', 'evenodd'],
  ['magnifier', 'symbols', `${circle(40, 40, 36)} ${circle(40, 40, 24, 0)} ${poly([[58, 66], [66, 58], [100, 92], [92, 100]])}`],
  ['musicNote', 'symbols', `${circle(26, 82, 18)} M38 12 H46 V82 H38 Z M46 10 C60 18 80 24 80 44 C74 34 62 30 46 30 Z`],
  ['camera', 'symbols', `M0 28 H28 L36 14 H64 L72 28 H100 V90 H0 Z ${circle(50, 58, 22, 0)} ${circle(50, 58, 13)}`],
  ['person', 'symbols', `${circle(50, 24, 22)} M10 100 C10 66 28 52 50 52 C72 52 90 66 90 100 Z`],
  ['lightbulb', 'symbols', 'M50 0 C76 0 92 20 92 42 C92 58 82 66 74 76 V82 H26 V76 C18 66 8 58 8 42 C8 20 24 0 50 0 Z M28 86 H72 V92 H28 Z M34 95 H66 V100 H34 Z'],
  ['clock', 'symbols', `${circle(50, 50, 50)} ${circle(50, 50, 40, 0)} M47 22 H53 V53 H47 Z M47 47 H74 V53 H47 Z`],
  ['battery', 'symbols', 'M0 22 H88 V78 H0 Z M8 30 V70 H80 V30 Z M14 36 H54 V64 H14 Z M88 38 H100 V62 H88 Z'],
  ['infinity', 'symbols', 'M50 38 C60 26 70 20 80 20 C92 20 100 34 100 50 C100 66 92 80 80 80 C70 80 60 74 50 62 C40 74 30 80 20 80 C8 80 0 66 0 50 C0 34 8 20 20 20 C30 20 40 26 50 38 Z M20 34 C12 34 12 66 20 66 C28 66 36 58 42 50 C36 42 28 34 20 34 Z M80 34 C72 34 64 42 58 50 C64 58 72 66 80 66 C88 66 88 34 80 34 Z', 'evenodd'],
  ['trophy', 'symbols', 'M20 0 H80 V30 C80 50 66 62 56 64 V78 H70 V90 H30 V78 H44 V64 C34 62 20 50 20 30 Z M24 92 H76 V100 H24 Z'],
  ['trash', 'symbols', 'M10 10 H90 V20 H10 Z M38 2 H62 V10 H38 Z M18 24 H82 L76 100 H24 Z M34 34 H40 V90 H34 Z M47 34 H53 V90 H47 Z M60 34 H66 V90 H60 Z', 'evenodd'],
  ['wifi', 'symbols', `M4.7 38.7 A64 64 0 0 1 95.3 38.7 L86.8 47.2 A52 52 0 0 0 13.2 47.2 Z M20.3 54.3 A42 42 0 0 1 79.7 54.3 L71.2 62.8 A30 30 0 0 0 28.8 62.8 Z ${circle(50, 84, 10)}`],
  ['calendar', 'symbols', 'M0 12 H100 V100 H0 Z M8 34 H92 V92 H8 Z M16 42 H32 V56 H16 Z M42 42 H58 V56 H42 Z M68 42 H84 V56 H68 Z M16 68 H32 V82 H16 Z M42 68 H58 V82 H42 Z M24 0 H32 V12 H24 Z M68 0 H76 V12 H68 Z', 'evenodd'],
  ['crown', 'symbols', 'M0 30 L25 55 L50 10 L75 55 L100 30 L90 85 H10 Z M10 90 H90 V100 H10 Z'],
  ['gem', 'symbols', poly([[20, 0], [80, 0], [100, 30], [50, 100], [0, 30]])],

  // ── Badges and callouts
  ['speech', 'callouts', 'M50 4 C78 4 100 20 100 42 C100 64 78 80 50 80 C44 80 38 79 33 78 L12 96 L18 72 C6 64 0 54 0 42 C0 20 22 4 50 4 Z'],
  ['speechRect', 'callouts', poly([[0, 0], [100, 0], [100, 72], [44, 72], [22, 96], [26, 72], [0, 72]])],
  ['thought', 'callouts', `${circle(52, 40, 46)} ${circle(24, 82, 9)} ${circle(10, 96, 4)}`],
  ['tag', 'callouts', `M0 50 L30 10 H100 V90 H30 Z ${circle(32, 50, 7, 0)}`],
  ['bookmark', 'callouts', poly([[15, 0], [85, 0], [85, 100], [50, 74], [15, 100]])],
  ['flag', 'callouts', 'M8 0 H16 V100 H8 Z M16 6 C34 0 52 14 72 8 C80 6 88 4 96 6 V58 C88 56 80 58 72 60 C52 66 34 52 16 58 Z'],
  ['banner', 'callouts', poly([[0, 20], [100, 20], [88, 50], [100, 80], [0, 80], [12, 50]])],
  ['ribbon', 'callouts', `${circle(50, 36, 36)} ${poly([[44, 70], [36, 100], [26, 92], [8, 100], [20, 60]])} ${poly([[80, 60], [92, 100], [74, 92], [64, 100], [56, 70]])}`],
  ['ticket', 'callouts', 'M0 20 H100 V40 A10 10 0 0 0 100 60 V80 H0 V60 A10 10 0 0 0 0 40 Z'],
];

export const SHAPES = DEFS.map(([id, cat, d, rule = 'nonzero']) => ({ id, cat, d, rule }));
export const SHAPE_BY_ID = Object.fromEntries(SHAPES.map((shape) => [shape.id, shape]));

/** Pseudo-3D solids, drawn with shaded faces (iconCanvas.js solidToSvg). */
export const SOLIDS = ['cube', 'cylinder', 'sphere', 'cone', 'pyramid', 'prism', 'hexPrism', 'hemisphere', 'torus', 'coin', 'octahedron', 'capsule3d'];

export const SHAPE_CATEGORIES = [
  { id: 'basic', icon: 'catBasic' },
  { id: 'stars', icon: 'catStars' },
  { id: 'arrows', icon: 'catArrows' },
  { id: 'symbols', icon: 'catSymbols' },
  { id: 'callouts', icon: 'catCallouts' },
  { id: 'solids', icon: 'catSolids' },
];

export const shapesIn = (cat) => (cat === 'solids' ? SOLIDS : SHAPES.filter((shape) => shape.cat === cat).map((shape) => shape.id));
export const ALL_SHAPE_IDS = [...SHAPES.map((shape) => shape.id), ...SOLIDS];
export const isSolid = (id) => SOLIDS.includes(id);

/**
 * Scales a unit path (absolute M L H V C S Q T A Z commands) into the box x, y, w, h.
 * Arcs keep rotation 0, so their radii scale with the axes.
 */
export function scalePath(d, x, y, w, h) {
  const sx = w / 100;
  const sy = h / 100;
  const tokens = d.match(/[MLHVCSQTAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out = [];
  let cmd = '';
  let i = 0;
  const num = () => Number(tokens[i++]);
  const X = (v) => f(x + v * sx);
  const Y = (v) => f(y + v * sy);
  while (i < tokens.length) {
    if (/^[A-Z]$/i.test(tokens[i])) {
      cmd = tokens[i++].toUpperCase();
      out.push(cmd);
      if (cmd === 'Z') continue;
    }
    switch (cmd) {
      case 'M': case 'L': case 'T': out.push(X(num()), Y(num())); break;
      case 'H': out.push(X(num())); break;
      case 'V': out.push(Y(num())); break;
      case 'C': out.push(X(num()), Y(num()), X(num()), Y(num()), X(num()), Y(num())); break;
      case 'S': case 'Q': out.push(X(num()), Y(num()), X(num()), Y(num())); break;
      case 'A': {
        const rx = num(); const ry = num(); const rot = num(); const large = num(); const sweep = num();
        // A mirrored box (negative width or height) reverses the direction of the arcs.
        const flip = (sx < 0) !== (sy < 0) ? 1 - sweep : sweep;
        out.push(f(Math.abs(rx * sx)), f(Math.abs(ry * sy)), f(rot), String(large), String(flip), X(num()), Y(num()));
        break;
      }
      default: i += 1; // a number without a command: skip it
    }
  }
  return out.join(' ');
}

/** The path of a flat shape in a box, or '' for an unknown id. */
export function shapePath(id, x, y, w, h) {
  const shape = SHAPE_BY_ID[id];
  return shape ? scalePath(shape.d, x, y, w, h) : '';
}

// SVG import, the way Blender's own importer (io_curve_svg) reads a file, so the same file gives the same curves:
//   elements   path (M L H V C S Q T A Z, relative too), rect (rounded), circle, ellipse, line, polyline, polygon, g, svg,
//              defs, symbol and use
//   transforms matrix, translate, scale, rotate (about a point), skewX, skewY, nested
//   units      px, in, mm, cm, pt, pc and % of the view; viewBox with its fitting; a document sized in mm, cm, in, pt or pc
//              keeps its real size
//   fill       a filled shape becomes a filled 2D curve with an "SVGMat" material of its colour (#rgb, #rrggbb, rgb(), the
//              CSS names), one material per colour; fill="none" leaves an outline
// Every element becomes a curve object of Bézier splines with Blender's handles, 1/90 inch to the pixel, Y up.
import { addObject, defaultMaterial, newId } from './doc.js';

// ─────────────── a small XML reader (elements, attributes, text skipped)

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m));

export function parseXML(text) {
  const root = { tag: '#document', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    if (text.startsWith('<!--', lt)) { i = text.indexOf('-->', lt + 4); i = i < 0 ? text.length : i + 3; continue; }
    if (text.startsWith('<![CDATA[', lt)) { i = text.indexOf(']]>', lt); i = i < 0 ? text.length : i + 3; continue; }
    if (text[lt + 1] === '?' || text[lt + 1] === '!') {
      // <?xml …?>, <!DOCTYPE … [ … ]>
      let depth = 0;
      let j = lt + 1;
      for (; j < text.length; j++) {
        if (text[j] === '[') depth++;
        else if (text[j] === ']') depth--;
        else if (text[j] === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    if (text[lt + 1] === '/') {
      const gt = text.indexOf('>', lt);
      const tag = text.slice(lt + 2, gt).trim();
      while (stack.length > 1) { const top = stack.pop(); if (top.tag === tag) break; }
      i = gt + 1;
      continue;
    }
    // An opening tag: attribute values may hold '>'.
    let j = lt + 1;
    let quote = null;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '>') break;
    }
    let body = text.slice(lt + 1, j);
    const selfClosing = body.endsWith('/');
    if (selfClosing) body = body.slice(0, -1);
    const tag = body.match(/^[^\s/>]+/)?.[0] ?? '';
    const attrs = {};
    for (const m of body.slice(tag.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[m[1]] = unescape(m[3] ?? m[4] ?? '');
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = j + 1;
  }
  return root;
}

// ─────────────── numbers, units, colours (svg_util.py, svg_colors.py)

export const SVG_UNITS = { '': 1, px: 1, in: 90, mm: 90 / 25.4, cm: 90 / 2.54, pt: 1.25, pc: 15, em: 1, ex: 1, INVALID: 1 };
const NUMBER = /(-?\d+(\.\d*)?([eE][-+]?\d+)?)|(-?\.\d+([eE][-+]?\d+)?)/y;

/** The number at `start` (after spaces and commas): [text, index after it]. */
function readFloat(text, start = 0) {
  let i = start;
  while (i < text.length && (/\s/.test(text[i]) || text[i] === ',')) i++;
  if (i === text.length) return ['0', i];
  NUMBER.lastIndex = i;
  const m = NUMBER.exec(text);
  if (!m) throw new Error(`Invalid float value near ${text.slice(i, i + 10)}`);
  return [m[0], i + m[0].length];
}

const parseFloats = (text) => [...String(text ?? '').matchAll(/(-?\d+(\.\d*)?([eE][-+]?\d+)?)|(-?\.\d+([eE][-+]?\d+)?)/g)].map((m) => Number(m[0]));

function parseCoord(coord, size) {
  const [token, end] = readFloat(String(coord));
  const value = Number(token);
  const unit = String(coord).slice(end).trim();
  if (unit === '%') return (Number(size) / 100) * value;
  return value * (SVG_UNITS[unit] ?? 1);
}

const COLOR_TABLE = 'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 grey 808080 green 008000 greenyellow adff2f honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32';
export const SVG_COLORS = Object.fromEntries(COLOR_TABLE.split(' ').reduce((list, word, i, all) => (i % 2 ? list : [...list, [word, [0, 2, 4].map((k) => parseInt(all[i + 1].slice(k, k + 2), 16))]]), []));
const srgbToLinear = (c) => (c < 0.04045 ? (c < 0 ? 0 : c / 12.92) : ((c + 0.055) / 1.055) ** 2.4);

/** A colour string as linear RGB in 0…1, or null when it is not one (gradients, currentColor…). */
export function svgColor(color) {
  let rgb = null;
  const rgbMatch = color.match(/^\s*rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,(\d+)\s*\)\s*$/);
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    rgb = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
    if (rgb.some(Number.isNaN)) return null;
  } else if (SVG_COLORS[color]) rgb = SVG_COLORS[color];
  else if (rgbMatch) rgb = rgbMatch.slice(1, 4).map(Number);
  else return null;
  return rgb.map((x) => srgbToLinear(x / 255));
}

// ─────────────── 2D affine matrices [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f

const IDENTITY = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const translate = (x, y) => [1, 0, 0, 1, x, y];
// mathutils builds a scale as 1 + (f - 1) in single precision, which moves Blender's 1/90 inch by 2e-4 of itself; kept, so a
// file lands exactly where Blender puts it.
const f32Scale = (f) => Math.fround(1 + Math.fround(Math.fround(f) - 1));
const scale = (sx, sy) => [f32Scale(sx), 0, 0, f32Scale(sy), 0, 0];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], 0];

const TRANSFORMS = {
  translate: (p) => translate(Number(p[0]), p.length > 1 ? Number(p[1]) : 0),
  matrix: (p) => p.slice(0, 6).map(Number),
  scale: (p) => scale(Number(p[0]), p.length > 1 ? Number(p[1]) : Number(p[0])),
  skewX: (p) => [1, 0, Math.tan((Number(p[0]) * Math.PI) / 180), 1, 0, 0],
  skewY: (p) => [1, Math.tan((Number(p[0]) * Math.PI) / 180), 0, 1, 0, 0],
  rotate: (p) => {
    const a = (Number(p[0]) * Math.PI) / 180;
    const [cx, cy] = p.length >= 3 ? [Number(p[1]), Number(p[2])] : [0, 0];
    return mul(mul(translate(cx, cy), [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), translate(-cx, -cy));
  },
};

export function parseTransform(text) {
  let m = IDENTITY;
  for (const match of String(text).matchAll(/\s*([A-z]+)\s*\((.*?)\)/g)) {
    const proc = TRANSFORMS[match[1]];
    if (!proc) throw new Error(`Unknown transform function: ${match[1]}`);
    m = mul(m, proc(match[2].replace(/,/g, ' ').split(/\s+/).filter(Boolean)));
  }
  return m;
}

// ─────────────── path data (SVGPathData, SVGPathParser)

function pathTokens(d) {
  const commands = new Set(['m', 'l', 'h', 'v', 'c', 's', 'q', 't', 'a', 'z']);
  const tokens = [];
  let current = '';
  let arg = 0;
  for (let i = 0; i < d.length; i++) {
    const c = d[i];
    if (c === ' ' || c === ',' || c === '\t') continue;
    if (commands.has(c.toLowerCase())) { tokens.push(c); current = c; arg = 1; continue; }
    if (c === '-' || c === '.' || /\d/.test(c)) {
      let token;
      let end;
      // The arc flags may run into the next number ("a1 1 0 01 1 1").
      if (current.toLowerCase() === 'a' && [4, 5].includes(arg % 7)) [token, end] = [c, i + 1];
      else [token, end] = readFloat(d, i);
      arg++;
      tokens.push(token);
      i = end - 1;
    }
  }
  return tokens;
}

const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const isCommand = (token) => token != null && /^[a-zA-Z]$/.test(token);

/** The splines of a path: [{ points: [{ x, y, hl, hlType, hr, hrType }], closed }]. */
export function parsePath(d, useFill) {
  const data = pathTokens(String(d ?? ''));
  let at = 0;
  const eof = () => at >= data.length;
  const cur = () => (eof() ? null : data[at]);
  const next = () => (eof() ? null : data[at++]);
  const coord = () => { const t = next(); return t == null ? null : Number(t); };
  let point = null;
  let handle = null;
  const splines = [];
  let spline = null;
  const pair = (relative, base) => { let [x, y] = [coord(), coord()]; if (relative && base) { x += base[0]; y += base[1]; } return [x, y]; };
  const append = (x, y, hl = null, hlType = 'VECTOR', hr = null, hrType = 'VECTOR') => {
    if (!spline) { spline = { points: [], closed: false }; splines.push(spline); }
    if (spline.points.length) {
      const first = spline.points[0];
      if (same([first.x, first.y], [x, y])) {
        if (hl != null) { first.hl = hl; first.hlType = 'FREE'; }
        if (hlType !== 'VECTOR') first.hlType = hlType;
        if (eof() || cur().toLowerCase() === 'm') spline.closed = true;
        return;
      }
      const last = spline.points[spline.points.length - 1];
      if (last.hrType === 'VECTOR' && hlType === 'FREE') { last.hr = [last.x, last.y]; last.hrType = 'FREE'; }
      if (last.hrType === 'FREE' && hlType === 'VECTOR') { hl = [x, y]; hlType = 'FREE'; }
    }
    spline.points.push({ x, y, hl, hlType, hr, hrType });
  };
  const updateHandle = (h, type) => { const p = spline.points[spline.points.length - 1]; if (type) p.hrType = type; if (h) p.hr = h; };
  const moveTo = (code) => {
    const relative = code === code.toLowerCase();
    let [x, y] = pair(relative, point);
    spline = null;
    point = [x, y];
    while (cur() != null && !isCommand(cur())) {
      [x, y] = pair(relative, point);
      if (!spline) append(point[0], point[1]);
      append(x, y);
      point = [x, y];
    }
    handle = null;
  };
  const lineTo = (code) => {
    const c = code.toLowerCase();
    while (cur() != null && !isCommand(cur())) {
      let x;
      let y;
      if (c === 'l') [x, y] = pair(code === 'l', point);
      else if (c === 'h') { x = coord(); y = point[1]; } else { x = point[0]; y = coord(); }
      if (code === 'h') x += point[0];
      else if (code === 'v') y += point[1];
      if (!spline) append(point[0], point[1]);
      append(x, y);
      point = [x, y];
    }
    handle = null;
  };
  const flip = (p, h) => [p[0] + (p[0] - h[0]), p[1] + (p[1] - h[1])];
  const cubic = (code) => {
    const c = code.toLowerCase();
    const rel = code === c;
    while (cur() != null && !isCommand(cur())) {
      let h1;
      if (c === 'c') h1 = pair(rel, point);
      else h1 = handle ? flip(point, handle) : [...point];
      const h2 = pair(rel, point);
      const [x, y] = pair(rel, point);
      if (!spline) append(point[0], point[1], [...point], 'FREE', h1, 'FREE');
      else updateHandle(h1, 'FREE');
      append(x, y, h2, 'FREE', [x, y], 'FREE');
      point = [x, y];
      handle = h2;
    }
  };
  const quadratic = (code) => {
    const c = code.toLowerCase();
    const rel = code === c;
    while (cur() != null && !isCommand(cur())) {
      const h1 = c === 'q' ? pair(rel, point) : handle ? flip(point, handle) : [...point];
      const [x, y] = pair(rel, point);
      if (!same([x, y], point)) {
        if (!spline) append(point[0], point[1], [...point], 'FREE', [...point], 'FREE');
        append(x, y, h1, 'FREE', [x, y], 'FREE');
      }
      point = [x, y];
      handle = h1;
    }
  };
  // Blender's arc, kept as it is (it reads the radius check from x alone).
  const arc = (rx, ry, ang, fa, fs, x, y) => {
    const [cpx, cpy] = point;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    let px = Math.abs((Math.cos(ang) * (cpx - x) + Math.sin(ang) * (cpy - y)) * 0.5) ** 2;
    const py = Math.abs((Math.cos(ang) * (cpy - y) - Math.sin(ang) * (cpx - x)) * 0.5) ** 2;
    const rpx = 0;
    let rpy = 0;
    if (Math.abs(rx) > 0) px /= rx ** 2;
    if (Math.abs(ry) > 0) rpy = py / ry ** 2;
    let pl = rpx + rpy;
    if (pl > 1) { pl **= 0.5; rx *= pl; ry *= pl; }
    let [carx, sarx, cary, sary] = [0, 0, 0, 0];
    if (Math.abs(rx) > 0) { carx = Math.cos(ang) / rx; sarx = Math.sin(ang) / rx; }
    if (Math.abs(ry) > 0) { cary = Math.cos(ang) / ry; sary = Math.sin(ang) / ry; }
    const x0 = carx * cpx + sarx * cpy;
    const y0 = -sary * cpx + cary * cpy;
    const x1 = carx * x + sarx * y;
    const y1 = -sary * x + cary * y;
    const d = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0);
    let sq = Math.abs(d) > 0 ? 1 / d - 0.25 : -0.25;
    if (sq < 0) sq = 0;
    let sf = sq ** 0.5;
    if (fs === fa) sf = -sf;
    const xc = 0.5 * (x0 + x1) - sf * (y1 - y0);
    const yc = 0.5 * (y0 + y1) + sf * (x1 - x0);
    const a0 = Math.atan2(y0 - yc, x0 - xc);
    const a1 = Math.atan2(y1 - yc, x1 - xc);
    let span = a1 - a0;
    if (span < 0 && fs === 1) span += 2 * Math.PI;
    else if (span > 0 && fs === 0) span -= 2 * Math.PI;
    const segs = Math.ceil(Math.abs((span * 2) / (Math.PI * 0.5 + 0.001)));
    if (!spline) append(cpx, cpy, [cpx, cpy], 'FREE', [cpx, cpy], 'FREE');
    const toPage = (u, v) => [Math.cos(ang) * rx * u + -Math.sin(ang) * ry * v, Math.sin(ang) * rx * u + Math.cos(ang) * ry * v];
    for (let i = 0; i < segs; i++) {
      const b0 = a0 + (i * span) / segs;
      const b1 = a0 + ((i + 1) * span) / segs;
      const demi = 0.25 * (b1 - b0);
      const t = (2.66666 * Math.sin(demi) * Math.sin(demi)) / Math.sin(demi * 2);
      const c1 = toPage(xc + Math.cos(b0) - t * Math.sin(b0), yc + Math.sin(b0) + t * Math.cos(b0));
      const [x2, y2] = [xc + Math.cos(b1), yc + Math.sin(b1)];
      const c2 = toPage(x2 + t * Math.sin(b1), y2 - t * Math.cos(b1));
      const c3 = toPage(x2, y2);
      updateHandle(c1, 'FREE');
      append(c3[0], c3[1], c2, 'FREE', c3, 'FREE');
    }
  };
  const arcTo = (code) => {
    while (cur() != null && !isCommand(cur())) {
      const rx = Number(next());
      const ry = Number(next());
      const ang = (Number(next()) / 180) * Math.PI;
      const fa = Number(next());
      const fs = Number(next());
      const [x, y] = pair(code === code.toLowerCase(), point);
      arc(rx, ry, ang, fa, fs, x, y);
      point = [x, y];
      handle = null;
    }
  };
  const close = () => { if (spline) { spline.closed = true; const first = spline.points[0]; point = [first.x, first.y]; } };
  const run = { m: moveTo, l: lineTo, h: lineTo, v: lineTo, c: cubic, s: cubic, q: quadratic, t: quadratic, a: arcTo, z: close };
  let closed = false;
  while (!eof()) {
    const code = next();
    const cmd = run[String(code).toLowerCase()];
    if (!cmd || !isCommand(code)) throw new Error(`Unknown path command: ${code}`);
    closed = code === 'z' || code === 'Z';
    if ((code === 'M' || code === 'm') && useFill && !closed && spline) spline.closed = true;
    cmd(code);
  }
  if (useFill && !closed && spline) spline.closed = true;
  return splines;
}

// ─────────────── the document (SVGGeometry and its kinds)

/**
 * Reads an SVG file into curve descriptions: [{ name, dimensions, fill, color (linear RGB or null), splines }], one per drawn element, in
 * document order. A spline is { kind: 'BEZIER', cyclic, points, handles: [[left, right]], handleTypes: [[left, right]] }, in
 * metres with Y up, as Blender's importer gives them.
 */
export function readSVG(text) {
  const doc = parseXML(text);
  const k = (1 / 90) * (0.3048 / 12);
  const ctx = { defines: new Map(), rects: [[0, 0]], matrix: scale(k, -k), matrixStack: [], styles: [null], curves: [] };
  const rect = () => ctx.rects[ctx.rects.length - 1];
  const style = () => ctx.styles[ctx.styles.length - 1];
  const pushMatrix = (m) => { ctx.matrixStack.push(ctx.matrix); ctx.matrix = mul(ctx.matrix, m); };
  const popMatrix = () => { ctx.matrix = ctx.matrixStack.pop(); };
  const at = (p) => apply(ctx.matrix, p);
  const attr = (node, name) => node.attrs[name] ?? '';
  const material = (value) => { const color = svgColor(value); return color ? { key: value.replace(/^#/, ''), color } : null; };
  const styles = (node) => {
    const out = { useFill: null, fill: null };
    const css = attr(node, 'style');
    if (css) {
      for (const item of css.split(';')) {
        const s = item.split(':');
        if (s.length !== 2) continue;
        if (s[0].trim().toLowerCase() !== 'fill') continue;
        const value = s[1].trim().toLowerCase();
        if (value === 'none') out.useFill = false;
        else { out.useFill = true; out.fill = material(value); }
      }
      if (out.useFill == null) { out.useFill = true; out.fill = material('#000'); }
      return out;
    }
    const fill = attr(node, 'fill').toLowerCase();
    if (fill) {
      if (fill === 'none') out.useFill = false;
      else { out.useFill = true; out.fill = material(fill); }
    }
    const inherited = out.useFill == null && style() ? { ...style() } : out;
    if (inherited.useFill == null) { inherited.useFill = true; inherited.fill = material('#000'); }
    return inherited;
  };
  const rectFrom = (node) => {
    let [w, h] = rect();
    if (attr(node, 'viewBox')) {
      const box = attr(node, 'viewBox').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      w = parseCoord(box[2], w);
      h = parseCoord(box[3], h);
    } else {
      if (attr(node, 'width')) w = parseCoord(attr(node, 'width'), w);
      if (attr(node, 'height')) h = parseCoord(attr(node, 'height'), h);
    }
    return [w, h];
  };
  const nodeMatrix = (node) => {
    if (!['svg', 'use', 'symbol'].includes(node.name)) return IDENTITY;
    const r = rect();
    const user = ctx.rects.length > 1;
    const x = parseCoord(attr(node, 'x') || '0', r[0]);
    const y = parseCoord(attr(node, 'y') || '0', r[1]);
    let w = parseCoord(attr(node, 'width') || String(r[0]), r[0]);
    let h = parseCoord(attr(node, 'height') || String(r[1]), r[1]);
    let m = translate(x, y);
    if (user && r[0] !== 0 && r[1] !== 0) m = mul(m, scale(w / r[0], h / r[1]));
    if (attr(node, 'viewBox')) {
      const box = attr(node, 'viewBox').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      const [vx, vy, vw, vh] = [parseCoord(box[0], w), parseCoord(box[1], h), parseCoord(box[2], w), parseCoord(box[3], h)];
      if (vw === 0 || vh === 0) return m;
      let s = 1;
      if (user || (w !== 0 && h !== 0)) s = Math.min(w / vw, h / vh);
      else { w = vw; h = vh; }
      m = mul(m, translate((w - vw * s) / 2, (h - vh * s) / 2));
      m = mul(m, translate(-vx, -vy));
      m = mul(m, scale(s, s));
    }
    return m;
  };
  // A curve made of point lists: [{ points: [{ x, y, hl, hlType, hr, hrType }], closed }].
  const emit = (node, list, look, filled, dimensions = filled ? '2D' : '3D') => {
    const splines = [];
    for (const s of list) {
      if (!s.points.length) continue;
      const points = [];
      const handles = [];
      const handleTypes = [];
      for (const p of s.points) {
        points.push(at([p.x, p.y]));
        handles.push([p.hl ? at(p.hl) : null, p.hr ? at(p.hr) : null]);
        handleTypes.push([p.hlType, p.hrType]);
      }
      splines.push(finishHandles({ kind: 'BEZIER', cyclic: s.closed, points, handles, handleTypes }));
    }
    ctx.curves.push({ name: attr(node, 'id') || 'Curve', dimensions, fill: Boolean(filled), color: filled ? look.fill?.color ?? null : null, colorKey: filled ? look.fill?.key ?? null : null, splines });
  };
  const kinds = {
    path(node) {
      const look = styles(node);
      const splines = parsePath(attr(node, 'd'), look.useFill);
      return () => {
        for (const s of splines) {
          if (!s.closed || s.points.length < 2) continue;
          const [first, last] = [s.points[0], s.points[s.points.length - 1]];
          if (first.hlType === 'FREE' && last.hrType === 'VECTOR') { last.hrType = 'FREE'; last.hr = [last.x, last.y]; }
          if (last.hrType === 'FREE' && first.hlType === 'VECTOR') { first.hlType = 'FREE'; first.hl = [first.x, first.y]; }
        }
        emit(node, splines, look, look.useFill);
      };
    },
    rect(node) {
      const look = styles(node);
      const raw = ['x', 'y', 'width', 'height'].map((a) => attr(node, a) || '0');
      const [rxRaw, ryRaw] = [attr(node, 'rx'), attr(node, 'ry')];
      return () => {
        const crect = rect();
        const [x, y, w, h] = raw.map((v, i) => parseCoord(v, crect[i % 2]));
        let [rx, ry] = [0, 0];
        if (rxRaw && ryRaw) { rx = Math.min(parseCoord(rxRaw, x), w / 2); ry = Math.min(parseCoord(ryRaw, y), h / 2); } else if (rxRaw) { rx = Math.min(parseCoord(rxRaw, x), w / 2); ry = Math.min(rx, h / 2); rx = ry = Math.min(rx, ry); } else if (ryRaw) { ry = Math.min(parseCoord(ryRaw, y), h / 2); rx = Math.min(ry, w / 2); rx = ry = Math.min(rx, ry); }
        const rounded = Boolean(rx || ry);
        const coords = rounded
          ? [[x + rx, y], [x + w - rx, y, [x + w, y]], [x + w, y + ry], [x + w, y + h - ry, [x + w, y + h]], [x + w - rx, y + h], [x + rx, y + h, [x, y + h]], [x, y + h - ry], [x, y + ry, [x, y]]]
          : [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
        const points = coords.map(([px, py, hand]) => {
          if (!rounded) return { x: px, y: py, hl: null, hlType: 'VECTOR', hr: null, hrType: 'VECTOR' };
          return hand ? { x: px, y: py, hl: null, hlType: 'VECTOR', hr: hand, hrType: 'FREE' } : { x: px, y: py, hl: [px, py], hlType: 'FREE', hr: null, hrType: 'VECTOR' };
        });
        emit(node, [{ points, closed: true }], look, look.useFill);
      };
    },
    ellipse(node, circle = false) {
      const look = styles(node);
      const raw = { cx: attr(node, 'cx') || '0', cy: attr(node, 'cy') || '0', rx: (circle ? attr(node, 'r') : attr(node, 'rx')) || '0', ry: (circle ? attr(node, 'r') : attr(node, 'ry')) || '0' };
      return () => {
        const crect = rect();
        const [cx, cy, rx, ry] = [parseCoord(raw.cx, crect[0]), parseCoord(raw.cy, crect[1]), parseCoord(raw.rx, crect[0]), parseCoord(raw.ry, crect[1])];
        if (!rx || !ry) return;
        const q = 0.552;
        const coords = [[[cx - rx, cy], [cx - rx, cy + ry * q], [cx - rx, cy - ry * q]], [[cx, cy - ry], [cx - rx * q, cy - ry], [cx + rx * q, cy - ry]], [[cx + rx, cy], [cx + rx, cy - ry * q], [cx + rx, cy + ry * q]], [[cx, cy + ry], [cx + rx * q, cy + ry], [cx - rx * q, cy + ry]]];
        emit(node, [{ closed: true, points: coords.map(([p, l, r]) => ({ x: p[0], y: p[1], hl: l, hlType: 'FREE', hr: r, hrType: 'FREE' })) }], look, look.useFill);
      };
    },
    circle(node) { return kinds.ellipse(node, true); },
    line(node) {
      const raw = ['x1', 'y1', 'x2', 'y2'].map((a) => attr(node, a) || '0');
      return () => {
        const crect = rect();
        const [x1, y1, x2, y2] = raw.map((v, i) => parseCoord(v, crect[i % 2]));
        emit(node, [{ closed: true, points: [[x1, y1], [x2, y2]].map(([x, y]) => ({ x, y, hl: null, hlType: 'VECTOR', hr: null, hrType: 'VECTOR' })) }], null, false, '2D');
      };
    },
    polyline(node, closed = false) {
      const look = styles(node);
      const values = parseFloats(attr(node, 'points'));
      const points = [];
      for (let i = 0; i + 1 < values.length; i += 2) points.push({ x: values[i], y: values[i + 1], hl: null, hlType: 'VECTOR', hr: null, hrType: 'VECTOR' });
      return () => emit(node, [{ points, closed }], look, closed && look.useFill);
    },
    polygon(node) { return kinds.polyline(node, true); },
  };
  // Containers (svg, g, defs, symbol) parse their children with their own style pushed, then draw them.
  const build = (node) => {
    const name = node.tag.toLowerCase().replace(/^svg:/, '');
    node.name = name;
    let item = null;
    if (['svg', 'g', 'defs', 'symbol', '#document'].includes(name)) {
      const look = name === '#document' ? { useFill: null, fill: null } : styles(node);
      ctx.styles.push(look);
      const children = [];
      const own = { node, children };
      if (node.attrs.id && !ctx.defines.has(`#${node.attrs.id}`)) ctx.defines.set(`#${node.attrs.id}`, own);
      for (const child of node.children) { const made = build(child); if (made) children.push(made); }
      ctx.styles.pop();
      own.draw = (instancing) => {
        if (name === 'defs') return;
        if (name === 'symbol' && !instancing) return;
        withTransform(node, () => {
          if (name === 'svg') {
            const r = rectFrom(node);
            let m = nodeMatrix(node);
            let unit = '';
            if (attr(node, 'height')) { const raw = attr(node, 'height'); unit = raw.slice(readFloat(raw)[1]).trim(); }
            const box = attr(node, 'viewBox') ? parseFloats(attr(node, 'viewBox')) : [];
            if (box.length === 4 && ['cm', 'mm', 'in', 'pt', 'pc'].includes(unit)) {
              const u = ((SVG_UNITS[unit] / 90) * 1000) / 39.3701;
              m = mul(m, scale(u, u));
            }
            if (attr(node, 'viewBox')) m = mul(m, translate(0, -box[1] - box[3]));
            pushMatrix(m);
            ctx.rects.push(r);
            for (const c of children) c.draw(false);
            ctx.rects.pop();
            popMatrix();
          } else if (name === 'symbol') {
            pushMatrix(nodeMatrix(node));
            for (const c of children) c.draw(false);
            popMatrix();
          } else for (const c of children) c.draw(instancing);
        }, own);
      };
      item = own;
    } else if (name === 'use') {
      item = { node };
      if (node.attrs.id && !ctx.defines.has(`#${node.attrs.id}`)) ctx.defines.set(`#${node.attrs.id}`, item);
      item.draw = () => withTransform(node, () => {
        const target = ctx.defines.get(attr(node, 'xlink:href') || attr(node, 'href'));
        if (!target) return;
        ctx.rects.push(rectFrom(node));
        pushMatrix(nodeMatrix(node));
        target.draw(true);
        popMatrix();
        ctx.rects.pop();
      }, item);
    } else if (kinds[name]) {
      item = { node };
      if (node.attrs.id && !ctx.defines.has(`#${node.attrs.id}`)) ctx.defines.set(`#${node.attrs.id}`, item);
      const draw = kinds[name](node);
      item.draw = () => withTransform(node, draw, item);
    }
    return item;
  };
  // The node's own transform around its drawing; a use that reaches itself again stops there.
  function withTransform(node, draw, item) {
    if (item.creating) return;
    item.creating = true;
    const t = attr(node, 'transform');
    if (t) pushMatrix(parseTransform(t));
    draw();
    if (t) popMatrix();
    item.creating = false;
  }
  build(doc).draw(false);
  return ctx.curves;
}

/** Vector handles point a third of the way to the neighbouring point, as Blender sets them; free ones stay. */
export function finishHandles(spline) {
  const { points, handles, handleTypes, cyclic } = spline;
  const n = points.length;
  const third = (p, q) => [p[0] + (q[0] - p[0]) / 3, p[1] + (q[1] - p[1]) / 3, p[2] + (q[2] - p[2]) / 3];
  const mirror = (p, q) => [2 * p[0] - q[0], 2 * p[1] - q[1], 2 * p[2] - q[2]];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = i > 0 ? points[i - 1] : cyclic ? points[n - 1] : null;
    const next = i < n - 1 ? points[i + 1] : cyclic ? points[0] : null;
    const before = prev ?? (next ? mirror(p, next) : p);
    const after = next ?? (prev ? mirror(p, prev) : p);
    if (handleTypes[i][0] === 'VECTOR' || !handles[i][0]) handles[i][0] = handleTypes[i][0] === 'VECTOR' ? third(p, before) : [...p];
    if (handleTypes[i][1] === 'VECTOR' || !handles[i][1]) handles[i][1] = handleTypes[i][1] === 'VECTOR' ? third(p, after) : [...p];
  }
  return spline;
}

/**
 * File › Import › SVG: every drawn element as a curve object in a new collection named after the file; filled shapes are
 * filled 2D curves with one "SVGMat" material per colour. Returns the new objects.
 */
export function importSVGScene(doc, text, { name = 'SVG' } = {}) {
  const curves = readSVG(text);
  const collection = { id: newId('col'), name, parent: 'col_root', hide: false, exclude: false };
  doc.collections.push(collection);
  const materials = new Map();
  const made = [];
  for (const c of curves) {
    let slots = [];
    if (c.fill && c.color) {
      if (!materials.has(c.colorKey)) {
        const m = { ...defaultMaterial('SVGMat'), baseColor: c.color };
        doc.materials.push(m);
        materials.set(c.colorKey, m.id);
      }
      slots = [materials.get(c.colorKey)];
    }
    made.push(addObject(doc, { type: 'CURVE', name: c.name, collection: collection.id, materials: slots, data: { splines: c.splines, bevelDepth: 0, resolution: 12, dimensions: c.dimensions, fill: c.fill } }));
  }
  return made;
}

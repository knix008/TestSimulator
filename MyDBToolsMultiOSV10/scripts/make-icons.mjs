// Generate assets/icon.ico, assets/icon.png, assets/file-icon.ico and the Linux
// icon set from a drawn-in-code source, so the repo needs no binary assets.
// Run with: npm run make:icons
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(here, '../assets');
const iconsDir = path.join(buildDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

// ── Tiny PNG writer (RGBA, no dependencies) ────────────────────────────────

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Tiny SDF rasteriser ────────────────────────────────────────────────────
// Every shape is a signed-distance function in a 256-unit design space. The
// renderer samples each layer once per pixel and turns the distance into
// anti-aliased coverage, so the same artwork stays crisp from 16 px to 512 px.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function sdRoundedBox(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// First-order distance to an ellipse: exact on the outline, which is all the
// anti-aliasing needs.
function sdEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  const k = Math.sqrt(dx * dx + dy * dy);
  if (k === 0) return -Math.min(rx, ry);
  const g = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) / k;
  return (k - 1) / g;
}

// One slice of a database cylinder: two elliptical faces joined by a band.
function sdDisc(x, y, cx, top, bottom, rx, ry) {
  return Math.min(
    sdEllipse(x, y, cx, top, rx, ry),
    sdEllipse(x, y, cx, bottom, rx, ry),
    sdRoundedBox(x, y, cx, (top + bottom) / 2, rx, (bottom - top) / 2, 0),
  );
}

// Rounded box with a different radius per corner: [top-left, top-right,
// bottom-right, bottom-left]. Radii must not exceed the half extents.
function sdBox4(x, y, cx, cy, hw, hh, [tl, tr, br, bl]) {
  const px = x - cx;
  const py = y - cy;
  const r = px < 0 ? (py < 0 ? tl : bl) : py < 0 ? tr : br;
  const qx = Math.abs(px) - hw + r;
  const qy = Math.abs(py) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// Bold geometric "D" and "B" built from boxes, so the icon needs no font.
// `x`, `y` are the top-left of the letter box, `h` its height, `t` the stroke.
function letterD(px, py, x, y, w, h, t) {
  const hw = w / 2;
  const hh = h / 2;
  const outer = sdBox4(px, py, x + hw, y + hh, hw, hh, [4, hw, hw, 4]);
  const iw = hw - t;
  const ih = hh - t;
  const inner = sdBox4(px, py, x + t + iw, y + t + ih, iw, ih, [1, iw, iw, 1]);
  return Math.max(outer, -inner);
}

function letterB(px, py, x, y, w, h, t) {
  const bowl = (bx, by, bw, bh) => {
    const hw = bw / 2;
    const hh = bh / 2;
    const outer = sdBox4(px, py, bx + hw, by + hh, hw, hh, [4, hh, hh, 4]);
    const iw = hw - t;
    const ih = hh - t;
    const inner = sdBox4(px, py, bx + t + iw, by + t + ih, iw, ih, [1, ih, ih, 1]);
    return { outer, inner };
  };
  const bh = (h + t) / 2; // the two bowls share the middle stroke
  const top = bowl(x, y, w - 4, bh);
  const bottom = bowl(x, y + h - bh, w, bh);
  return Math.max(Math.min(top.outer, bottom.outer), -top.inner, -bottom.inner);
}

/**
 * Rasterise `layers` (bottom first) into an RGBA buffer. Each layer has a
 * `shape(x, y, unit)` SDF, a `fill` colour or `fill(x, y)` function returning
 * [r, g, b, a], and optionally `soft` — a falloff width that turns the hard
 * edge into a blurred one (used for shadows).
 */
function render(size, layers) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = 256 / size; // design units per pixel
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * unit;
      const py = (y + 0.5) * unit;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const layer of layers) {
        const d = layer.shape(px, py, unit);
        const cov = layer.soft ? 1 - smooth(d / layer.soft + 0.5) : clamp01(0.5 - d / unit);
        if (cov <= 0) continue;
        const c = typeof layer.fill === 'function' ? layer.fill(px, py) : layer.fill;
        const sa = ((c[3] ?? 255) / 255) * cov;
        if (sa <= 0) continue;
        const oa = sa + a * (1 - sa);
        r = (c[0] * sa + r * a * (1 - sa)) / oa;
        g = (c[1] * sa + g * a * (1 - sa)) / oa;
        b = (c[2] * sa + b * a * (1 - sa)) / oa;
        a = oa;
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

// ── The artwork ────────────────────────────────────────────────────────────

const BRAND_A = [56, 128, 255]; // blue
const BRAND_B = [122, 62, 236]; // violet
const WHITE = [255, 255, 255, 255];

// The flat "database" glyph: one cylinder with curved grooves cut across it so
// it reads as a stack of slices. `body` fills the cylinder, `face` paints the
// top, `cut` paints the grooves (normally the colour behind the glyph) and
// `rim` is a light edge just under each groove that gives the lower slices a
// visible top without any gloss.
function databaseGlyph({ cx, top, rx, ry, thickness, gap, count, body, face, cut, rim }) {
  const bottom = top + thickness * count + gap * (count - 1);
  const silhouette = (x, y) => sdDisc(x, y, cx, top, bottom, rx, ry);
  // The lower half of the band between two ellipses `a` (upper) and `b` (lower).
  const arc = (x, y, a, b) =>
    Math.max(sdEllipse(x, y, cx, b, rx, ry), -sdEllipse(x, y, cx, a, rx, ry), a - y);
  const layers = [
    { shape: silhouette, fill: body },
    { shape: (x, y) => sdEllipse(x, y, cx, top, rx, ry), fill: face },
  ];
  for (let i = 1; i < count; i++) {
    const ys = top + thickness * i + gap * (i - 1);
    layers.push({ shape: (x, y) => arc(x, y, ys, ys + gap), fill: cut });
    layers.push({ shape: (x, y) => arc(x, y, ys + gap, ys + gap + 5), fill: rim });
  }
  return { silhouette, layers, bottom: bottom + ry };
}

// App icon: a glossy, three-dimensional database — three vivid discs (teal,
// amber, magenta) with cylindrical shading and a specular glint — standing on a
// deep multi-colour tile with a visible edge, plus a small ER table card linked
// to it. A transparent margin keeps macOS / Windows 11 spacing right.
const lerpN = (stops, t) => {
  const k = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return lerp(stops[i], stops[i + 1], k - i);
};
const mixTo = (c, target, t) => lerp(c, target, clamp01(t));

/**
 * One shaded disc of the 3D stack. The side is lit as a real cylinder: the
 * surface normal turns with the horizontal position, so the brightness (a soft
 * Lambert term from the upper left) and the specular highlight (a narrow, smooth
 * peak) both follow the curve instead of sitting on it as flat stickers.
 */
function shadedDisc({ cx, top, rx, ry, thickness, color }) {
  const bottom = top + thickness;
  const body = (x, y) => sdDisc(x, y, cx, top, bottom, rx, ry);
  const face = (x, y) => sdEllipse(x, y, cx, top, rx, ry);
  const LIGHT = -0.55; // light direction, as an angle round the cylinder (left of front)
  const bodyFill = (x) => {
    const u = Math.max(-1, Math.min(1, (x - cx) / rx));
    const angle = Math.asin(u);
    const lambert = Math.max(0, Math.cos(angle - LIGHT));
    const spec = Math.pow(Math.max(0, Math.cos(angle - LIGHT * 0.8)), 40);
    const shade = 0.42 + 0.58 * lambert; // ambient + diffuse
    let c = shade < 1 ? mixTo(color, [18, 14, 48], (1 - shade) * 0.85) : color;
    c = mixTo(c, [255, 255, 255], spec * 0.55 + lambert * 0.12);
    return [...c, 255];
  };
  const faceFill = (x, y) => {
    // The top is a flat lid facing up: evenly lit, a little brighter toward the light.
    const t = clamp01(0.5 - ((x - cx) / rx) * 0.35 - ((y - top) / ry) * 0.25);
    return [...mixTo(color, [255, 255, 255], 0.28 + t * 0.22), 255];
  };
  return [
    { shape: body, fill: bodyFill },
    { shape: face, fill: faceFill },
    // A fine bevel of light along the lid's front edge.
    {
      shape: (x, y, unit) => Math.max(Math.abs(face(x, y)) - Math.max(0.7 * unit, 1), top - y),
      fill: [255, 255, 255, 120],
    },
  ];
}

function appLayers() {
  const inset = 14;
  const half = 128 - inset;
  const tile = (x, y) => sdRoundedBox(x, y, 128, 124, half, half - 4, 50);
  const edge = (x, y) => sdRoundedBox(x, y, 128, 132, half, half - 4, 50);
  const tileFill = (x, y) => [...lerpN([[34, 211, 238], [59, 130, 246], [124, 58, 237], [219, 39, 119]], (x * 0.45 + y * 0.75) / 300), 255];
  const discs = [
    { color: [236, 72, 153], top: 150 }, // bottom: magenta
    { color: [245, 158, 11], top: 120 }, // middle: amber
    { color: [20, 184, 166], top: 90 }, // top: teal
  ];
  const cx = 112;
  const rx = 56;
  const ry = 18;
  const layers = [
    // Drop shadow under the tile, then the tile's darker edge for thickness.
    { shape: (x, y) => edge(x, y - 6), fill: [10, 10, 40, 110], soft: 22 },
    { shape: edge, fill: (x, y) => [...mixTo(tileFill(x, y).slice(0, 3), [15, 10, 50], 0.45), 255] },
    { shape: tile, fill: tileFill },
    // Soft light falling on the tile from the upper left; no hard edge anywhere.
    {
      shape: tile,
      fill: (x, y) => {
        const dx = (x - 60) / 190;
        const dy = (y - 30) / 150;
        const k = clamp01(1 - Math.sqrt(dx * dx + dy * dy));
        return [255, 255, 255, Math.round(90 * k * k)];
      },
    },
    // A faint inner highlight along the tile's top edge, like a bevelled rim.
    {
      shape: (x, y, unit) => Math.abs(tile(x, y) + 2) - Math.max(0.8 * unit, 1.2),
      // Strongest at the top, fading out down the sides.
      fill: (x, y) => [255, 255, 255, Math.round(110 * Math.pow(clamp01((120 - y) / 100), 1.5))],
    },
    // Contact shadow of the stack.
    { shape: (x, y) => sdEllipse(x, y, cx + 6, 190, rx + 6, ry + 4), fill: [15, 10, 60, 120], soft: 14 },
  ];
  for (const d of discs) layers.push(...shadedDisc({ cx, top: d.top, rx, ry, thickness: 26, color: d.color }));

  // An ER table card at the lower right, linked to the stack.
  const card = { x: 150, y: 132, w: 74, h: 70 };
  const cardBox = (x, y) => sdRoundedBox(x, y, card.x + card.w / 2, card.y + card.h / 2, card.w / 2, card.h / 2, 9);
  layers.push(
    { shape: (x, y) => cardBox(x - 3, y - 5), fill: [10, 10, 50, 120], soft: 10 },
    { shape: cardBox, fill: [255, 255, 255, 255] },
    {
      shape: (x, y) => Math.max(cardBox(x, y), y - (card.y + 20)),
      fill: (x) => [...lerp([99, 102, 241], [168, 85, 247], (x - card.x) / card.w), 255],
    },
  );
  for (let i = 0; i < 3; i++) {
    const ry0 = card.y + 32 + i * 12;
    layers.push(
      { shape: (x, y) => sdRoundedBox(x, y, card.x + 13, ry0, 4, 4, 2), fill: i === 0 ? [245, 158, 11, 255] : [56, 189, 248, 255] },
      { shape: (x, y) => sdRoundedBox(x, y, card.x + 42, ry0, i === 1 ? 20 : 25, 2.6, 2), fill: [148, 163, 184, 255] },
    );
  }
  return layers;
}

// Document icon for .mdprj: a page with a folded corner carrying the same
// database glyph in brand colours. Transparent background, subtle outline so it
// survives on white Explorer / Finder backgrounds.
function fileLayers() {
  const L = 52;
  const R = 204;
  const T = 20;
  const B = 236;
  const F = 46; // fold size
  const pageBox = (x, y) => sdRoundedBox(x, y, (L + R) / 2, (T + B) / 2, (R - L) / 2, (B - T) / 2, 14);
  // Cut the top-right corner off along the diagonal x - y = R - F - T.
  const cut = (x, y) => (R - F - T - (x - y)) / Math.SQRT2;
  const page = (x, y) => Math.max(pageBox(x, y), -cut(x, y));
  const flap = (x, y) =>
    Math.max(L + (R - L - F) - x, y - (T + F), (x - y - (R - F - T)) / Math.SQRT2, pageBox(x, y));
  const pageFill = (x, y) => [...lerp([255, 255, 255], [236, 240, 250], (y - T) / (B - T)), 255];
  const discs = [
    ...shadedDisc({ cx: 128, top: 168, rx: 46, ry: 15, thickness: 22, color: [236, 72, 153] }),
    ...shadedDisc({ cx: 128, top: 142, rx: 46, ry: 15, thickness: 22, color: [245, 158, 11] }),
    ...shadedDisc({ cx: 128, top: 116, rx: 46, ry: 15, thickness: 22, color: [20, 184, 166] }),
  ];
  return [
    { shape: (x, y) => page(x, y - 6), fill: [20, 30, 70, 80], soft: 18 },
    { shape: page, fill: pageFill },
    {
      shape: (x, y, unit) => Math.abs(page(x, y)) - Math.max(0.6 * unit, 1),
      fill: [186, 196, 214, 255],
    },
    { shape: flap, fill: [212, 220, 236, 255] },
    {
      shape: (x, y, unit) => Math.max(Math.abs(flap(x, y)) - Math.max(0.6 * unit, 1), -cut(x, y) - 2),
      fill: [186, 196, 214, 255],
    },
    { shape: (x, y) => sdEllipse(x, y, 132, 206, 50, 12), fill: [20, 20, 70, 90], soft: 10 },
    ...discs,
  ];
}

function drawIcon(size, variant) {
  return render(size, variant === 'file' ? fileLayers() : appLayers());
}

function png(size, variant) {
  return encodePng(size, size, drawIcon(size, variant));
}

// ── ICO container ──────────────────────────────────────────────────────────

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const bodies = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // palette
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32BE(0, 8);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    bodies.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

writeFileSync(
  path.join(buildDir, 'icon.ico'),
  encodeIco(ICO_SIZES.map((size) => ({ size, data: png(size, 'app') }))),
);
writeFileSync(
  path.join(buildDir, 'file-icon.ico'),
  encodeIco(ICO_SIZES.map((size) => ({ size, data: png(size, 'file') }))),
);
writeFileSync(path.join(buildDir, 'icon.png'), png(512, 'app'));
writeFileSync(path.join(buildDir, 'file-icon.png'), png(512, 'file'));

for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  writeFileSync(path.join(iconsDir, `${size}x${size}.png`), png(size, 'app'));
}

console.log('icons written to assets/ and assets/icons/');

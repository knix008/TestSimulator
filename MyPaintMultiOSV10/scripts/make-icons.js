const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.join(__dirname, "..", "assets");

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = paint(x, y, size);
      const at = row + 1 + x * 4;
      raw[at] = color[0];
      raw[at + 1] = color[1];
      raw[at + 2] = color[2];
      raw[at + 3] = color[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inRound(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const cx = Math.min(Math.max(x, left + radius), left + width - radius);
  const cy = Math.min(Math.max(y, top + radius), top + height - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function roundSdf(nx, ny, left, top, width, height, radius) {
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;
  const qx = Math.abs(nx - (left + width / 2)) - hx;
  const qy = Math.abs(ny - (top + height / 2)) - hy;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

function mix(from, to, t) {
  const amount = Math.min(1, Math.max(0, t));
  return from.map((value, index) => Math.round(value + (to[index] - value) * amount));
}

function edgeLight(nx, ny, left, top, width, height, radius, band) {
  const sdf = roundSdf(nx, ny, left, top, width, height, radius);
  if (sdf > 0 || sdf < -band) return 0;
  const cx = Math.min(Math.max(nx, left + radius), left + width - radius);
  const cy = Math.min(Math.max(ny, top + radius), top + height - radius);
  const len = Math.hypot(nx - cx, ny - cy) || 1;
  const ndotl = (-(nx - cx) - (ny - cy)) / (len * Math.SQRT2);
  return (1 + sdf / band) * ndotl;
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function segParam(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  return Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len));
}

function inEllipse(nx, ny, cx, cy, rx, ry) {
  const dx = (nx - cx) / rx;
  const dy = (ny - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

const PLATE_STOPS = [
  [0.00, [196, 181, 253, 255]],
  [0.35, [139, 92, 246, 255]],
  [0.60, [109, 40, 217, 255]],
  [1.00, [59, 20, 120, 255]],
];

const CARD_STOPS = [
  [0.00, [255, 255, 255, 255]],
  [0.45, [250, 249, 255, 255]],
  [0.80, [238, 234, 252, 255]],
  [1.00, [223, 216, 248, 255]],
];

const FOLD_FROM = [237, 233, 254, 255];
const FOLD_TO = [124, 58, 237, 255];

/* Paint on the palette is lit as a bead, from the same side as the wood and the brush. */
const LIGHT = (() => {
  const v = [-0.45, -0.55, 0.70];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

function litBead(color, surface, gloss) {
  const diffuse = Math.max(0, surface.dx * LIGHT[0] + surface.dy * LIGHT[1] + surface.nz * LIGHT[2]);
  const shade = 0.46 + 0.72 * diffuse;
  let out = color.map((value, index) => (index === 3 ? value : Math.round(Math.min(255, value * shade))));
  // the surface turns away fastest at the very rim
  const rim = Math.max(0, (surface.edge - 0.80) / 0.20);
  if (rim > 0) out = mix(out, [0, 0, 0, 255], rim * rim * 0.28);
  const spot = Math.exp(-(((surface.dx + 0.44) ** 2 + (surface.dy + 0.50) ** 2) / 0.085));
  if (spot > 0.004) out = mix(out, [255, 255, 255, 255], Math.min(1, spot * gloss));
  return out;
}

function ramp(stops, t) {
  const amount = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i += 1) {
    if (amount > stops[i][0] && i < stops.length - 1) continue;
    const from = stops[i - 1];
    const to = stops[i];
    const span = to[0] - from[0] || 1;
    return mix(from[1], to[1], (amount - from[0]) / span);
  }
  return stops[stops.length - 1][1];
}

/* Depth without gloss: a soft light anchored at the top-left corner, a lit bevel on that side
 * and a shaded one opposite, and a little extra shade in the far corner. */
function shadePlate(nx, ny, left, top, width, height, radius, stops) {
  const u = (nx - left) / width;
  const v = (ny - top) / height;
  let color = ramp(stops, (u + v) / 2);
  const inset = Math.min(1, Math.max(0, -roundSdf(nx, ny, left, top, width, height, radius) / 0.06));
  const glow = Math.max(0, 1 - Math.hypot((u - 0.10) / 0.90, (v - 0.08) / 0.90));
  color = mix(color, [255, 255, 255, 255], glow * glow * 0.45 * inset);
  const shade = Math.max(0, 1 - Math.hypot((u - 1.04) / 0.72, (v - 1.04) / 0.72));
  color = mix(color, [0, 0, 0, 255], shade * shade * 0.20 * inset);
  const bevel = edgeLight(nx, ny, left, top, width, height, radius, 0.030);
  if (bevel > 0) color = mix(color, [255, 255, 255, 255], bevel * 0.42);
  if (bevel < 0) color = mix(color, [0, 0, 0, 255], -bevel * 0.26);
  return color;
}

/* A painter's palette: an oval wooden board with a thumb hole, lit as a thick disc. */
const PALETTE = {
  cx: 0.42,
  cy: 0.52,
  rx: 0.30,
  ry: 0.22,
  hole: { x: 0.56, y: 0.54, r: 0.070 },
};

const DABS = [
  { x: 0.26, y: 0.42, r: 0.046, color: [56, 189, 248, 255] },
  { x: 0.36, y: 0.39, r: 0.042, color: [244, 114, 182, 255] },
  { x: 0.24, y: 0.54, r: 0.040, color: [250, 204, 21, 255] },
  { x: 0.34, y: 0.51, r: 0.038, color: [52, 211, 153, 255] },
  { x: 0.30, y: 0.62, r: 0.036, color: [248, 250, 252, 255] },
];

function ellipseOutward(nx, ny) {
  const ex = (nx - PALETTE.cx) / (PALETTE.rx * PALETTE.rx);
  const ey = (ny - PALETTE.cy) / (PALETTE.ry * PALETTE.ry);
  const len = Math.hypot(ex, ey) || 1;
  return [ex / len, ey / len];
}

function onPalette(nx, ny) {
  const dx = (nx - PALETTE.cx) / PALETTE.rx;
  const dy = (ny - PALETTE.cy) / PALETTE.ry;
  const edge = Math.hypot(dx, dy);
  if (edge > 1) return null;
  const hx = nx - PALETTE.hole.x;
  const hy = ny - PALETTE.hole.y;
  const hd = Math.hypot(hx, hy);
  if (hd <= PALETTE.hole.r) return null;
  return { edge: edge, hd: hd, hx: hx, hy: hy };
}

function paletteShadowAmount(nx, ny) {
  if (onPalette(nx, ny)) return 0;
  const dx = (nx - PALETTE.cx - 0.028) / (PALETTE.rx * 1.05);
  const dy = (ny - PALETTE.cy - 0.036) / (PALETTE.ry * 1.08);
  const edge = Math.hypot(dx, dy);
  if (edge >= 1) return 0;
  return Math.min(1, (1 - edge) / 0.32) * 0.55;
}

function paletteWood(nx, ny, hit) {
  const u = (nx - PALETTE.cx) / PALETTE.rx;
  const v = (ny - PALETTE.cy) / PALETTE.ry;
  let color = mix([226, 168, 102, 255], [132, 74, 36, 255], (v + 1) * 0.45);
  const grain = Math.sin((nx * 62 + ny * 7) * Math.PI * 2);
  color = mix(color, [108, 58, 26, 255], (grain * 0.5 + 0.5) * 0.08);

  const outward = ellipseOutward(nx, ny);
  const rim = Math.max(0, (hit.edge - 0.84) / 0.16);
  let nnx = outward[0] * rim;
  let nny = outward[1] * rim;
  let nnz = 1 - rim * 0.78;
  const holeGap = hit.hd - PALETTE.hole.r;
  const holeRim = Math.max(0, 1 - holeGap / 0.028);
  if (holeRim > 0) {
    const ix = -hit.hx / hit.hd;
    const iy = -hit.hy / hit.hd;
    nnx = nnx * (1 - holeRim) + ix * holeRim;
    nny = nny * (1 - holeRim) + iy * holeRim;
    nnz = nnz * (1 - holeRim) + 0.12 * holeRim;
  }
  const nlen = Math.hypot(nnx, nny, nnz) || 1;
  const diffuse = Math.max(0, (nnx / nlen) * LIGHT[0] + (nny / nlen) * LIGHT[1] + (nnz / nlen) * LIGHT[2]);
  const shade = 0.40 + 0.88 * diffuse;
  color = color.map((value, index) => (index === 3 ? value : Math.round(Math.min(255, value * shade))));
  const spec = Math.exp(-(((u + 0.38) ** 2 + (v + 0.48) ** 2) / 0.10));
  if (spec > 0.02) color = mix(color, [255, 236, 214, 255], spec * 0.42);
  if (rim > 0.72) color = mix(color, [36, 16, 8, 255], ((rim - 0.72) / 0.28) * 0.40);
  return color;
}

function dabAt(nx, ny) {
  if (!onPalette(nx, ny)) return null;
  for (let i = DABS.length - 1; i >= 0; i -= 1) {
    const dab = DABS[i];
    const dx = (nx - dab.x) / dab.r;
    const dy = (ny - dab.y) / dab.r;
    const edge = Math.hypot(dx, dy);
    if (edge > 1) continue;
    const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    return litBead(dab.color, { dx: dx, dy: dy, nz: nz, edge: edge }, 0.92);
  }
  return null;
}

/* A brush lying across the palette, lit from the same side as everything else: the bristles
 * fan at the tip, a metal ferrule binds them, and the wooden handle runs up to the right. */
const BRUSH = {
  tip: [0.62, 0.80],
  end: [0.90, 0.30],
  half: 0.030,
};
const BRUSH_PARTS = [
  { until: 0.18, color: [72, 52, 34, 255], bristle: true },
  { until: 0.32, color: [196, 204, 212, 255], bristle: false },
  { until: 1.00, color: [176, 104, 48, 255], bristle: false },
];

function brushAt(nx, ny) {
  const ax = BRUSH.tip[0];
  const ay = BRUSH.tip[1];
  const bx = BRUSH.end[0];
  const by = BRUSH.end[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = ((nx - ax) * dx + (ny - ay) * dy) / len2;
  if (t < 0 || t > 1) return null;
  const px = ax + dx * t;
  const py = ay + dy * t;
  const len = Math.sqrt(len2);
  const across = ((nx - px) * (-dy) + (ny - py) * dx) / len;
  let half = BRUSH.half;
  if (t < 0.18) half = BRUSH.half + (0.18 - t) / 0.18 * 0.042;
  const u = across / half;
  if (Math.abs(u) > 1) return null;

  let part = BRUSH_PARTS[BRUSH_PARTS.length - 1];
  for (let i = 0; i < BRUSH_PARTS.length; i += 1) {
    if (t <= BRUSH_PARTS[i].until) {
      part = BRUSH_PARTS[i];
      break;
    }
  }
  const round = Math.sqrt(Math.max(0, 1 - u * u));
  const lit = Math.max(0, (-u) * 0.62 + round * 0.78);
  const shade = 0.44 + 0.78 * lit;
  let color = part.color.map((value, index) => (index === 3 ? value : Math.round(Math.min(255, value * shade))));
  const spot = Math.exp(-(((u + 0.42) ** 2) / 0.055));
  if (spot > 0.004) color = mix(color, [255, 255, 255, 255], spot * 0.55);
  if (Math.abs(u) > 0.86) color = mix(color, [0, 0, 0, 255], (Math.abs(u) - 0.86) / 0.14 * 0.30);
  if (part.bristle && Math.sin(u * Math.PI * 7) > 0.15) color = mix(color, [28, 18, 12, 255], 0.42);
  if (t > 0.18 && t <= 0.32) {
    const ring = Math.abs(((t - 0.18) / 0.14) * 2 % 1 - 0.5);
    color = mix(color, [0, 0, 0, 255], (0.5 - ring) * 0.24);
  }
  return color;
}

function brushShadow(nx, ny) {
  return brushAt(nx - 0.028, ny - 0.034) ? 1 : 0;
}

const APP_PLATE = { left: 0.05, top: 0.05, width: 0.90, height: 0.90, radius: 0.255 };

function sampleApp(nx, ny) {
  if (nx < 0.05 || ny < 0.05 || nx > 0.95 || ny > 0.95) return [0, 0, 0, 0];
  const plate = APP_PLATE;
  if (!inRound(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius)) return [0, 0, 0, 0];
  let color = shadePlate(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius, PLATE_STOPS);
  const cast = paletteShadowAmount(nx, ny);
  if (cast > 0) color = mix(color, [20, 6, 50, 255], cast);
  const holeD = Math.hypot(nx - PALETTE.hole.x, ny - PALETTE.hole.y);
  if (holeD < PALETTE.hole.r) {
    const lip = Math.max(0, 1 - (PALETTE.hole.r - holeD) / 0.020);
    color = mix(color, [10, 4, 24, 255], lip * 0.62);
  }
  const board = onPalette(nx, ny);
  if (board) color = paletteWood(nx, ny, board);
  const dab = dabAt(nx, ny);
  if (dab) color = dab;
  if (brushShadow(nx, ny) && !brushAt(nx, ny)) return mix(color, [20, 6, 50, 255], 0.40);
  return brushAt(nx, ny) || color;
}

const DOC_CARD = { left: 0.125, top: 0.05, width: 0.75, height: 0.90, radius: 0.13 };
/* The same palette and brush as the application icon, fitted onto the page under the fold. */
const GLYPH_SRC = { left: 0.08, top: 0.22, width: 0.86, height: 0.66 };

function docGlyphPoint(nx, ny, size) {
  const small = size && size < 48;
  const dst = small
    ? { left: 0.16, top: 0.32, width: 0.68, height: 0.56 }
    : { left: 0.18, top: 0.34, width: 0.64, height: 0.52 };
  const u = (nx - dst.left) / dst.width;
  const v = (ny - dst.top) / dst.height;
  if (u < -0.02 || v < -0.02 || u > 1.02 || v > 1.02) return null;
  return [GLYPH_SRC.left + u * GLYPH_SRC.width, GLYPH_SRC.top + v * GLYPH_SRC.height];
}

function sampleDoc(nx, ny, size) {
  if (nx < 0.05 || ny < 0.05 || nx > 0.95 || ny > 0.95) return [0, 0, 0, 0];
  const card = DOC_CARD;
  if (!inRound(nx, ny, card.left, card.top, card.width, card.height, card.radius)) return [0, 0, 0, 0];
  let color = shadePlate(nx, ny, card.left, card.top, card.width, card.height, card.radius, CARD_STOPS);
  const fold = 0.26;
  const fx = card.left + card.width - fold;
  const u = (nx - fx) / fold;
  const v = (ny - card.top) / fold;
  const onFold = u >= 0 && v >= 0 && u <= 1 && v <= 1 && u + v <= 1;
  if (onFold) {
    color = mix(FOLD_FROM, FOLD_TO, Math.min(1, (u + v) * 1.1));
    const crease = Math.max(0, 1 - Math.abs(u + v - 1) / 0.22);
    color = mix(color, [255, 255, 255, 255], crease * 0.30);
    return color;
  }
  const mapped = docGlyphPoint(nx, ny, size);
  if (!mapped) return color;
  const gx = mapped[0];
  const gy = mapped[1];
  const cast = paletteShadowAmount(gx, gy);
  if (cast > 0) color = mix(color, [86, 70, 130, 255], cast * 0.85);
  const holeD = Math.hypot(gx - PALETTE.hole.x, gy - PALETTE.hole.y);
  if (holeD < PALETTE.hole.r) {
    const lip = Math.max(0, 1 - (PALETTE.hole.r - holeD) / 0.020);
    color = mix(color, [90, 70, 140, 255], lip * 0.45);
  }
  const board = onPalette(gx, gy);
  if (board) color = paletteWood(gx, gy, board);
  const dab = dabAt(gx, gy);
  if (dab) color = dab;
  if (brushShadow(gx, gy) && !brushAt(gx, gy)) color = mix(color, [70, 54, 110, 255], 0.35);
  return brushAt(gx, gy) || color;
}

function lum(color) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function assertIcon(sample, label) {
  const corner = sample(0.01, 0.02);
  const edge = sample(0.02, 0.5);
  if (corner[3] !== 0 || edge[3] !== 0) throw new Error(label + " border is not transparent");
  const top = sample(0.28, 0.22);
  const bottom = sample(0.7, 0.78);
  if (top[3] === 0 || lum(top) <= lum(bottom) + 8) {
    throw new Error(label + " top-left is not brighter (" + lum(top).toFixed(1) + " vs " + lum(bottom).toFixed(1) + ")");
  }
}

function paint(sample) {
  return function paintPixel(x, y, size) {
    const cells = 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    const count = cells * cells;
    for (let oy = 0; oy < cells; oy += 1) {
      for (let ox = 0; ox < cells; ox += 1) {
        const color = sample((x + (ox + 0.5) / cells) / size, (y + (oy + 0.5) / cells) / size, size);
        const cover = color[3] / 255;
        red += color[0] * cover;
        green += color[1] * cover;
        blue += color[2] * cover;
        alpha += cover;
      }
    }
    if (alpha === 0) return [0, 0, 0, 0];
    return [Math.round(red / alpha), Math.round(green / alpha), Math.round(blue / alpha), Math.round((alpha / count) * 255)];
  };
}

function ico(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + count * 16;
  const blobs = [];
  images.forEach((image) => {
    const entry = Buffer.alloc(16);
    entry[0] = image.size >= 256 ? 0 : image.size;
    entry[1] = image.size >= 256 ? 0 : image.size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(image.png);
    offset += image.png.length;
  });
  return Buffer.concat([header].concat(entries).concat(blobs));
}

function icns(images) {
  const types = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
  const chunks = images.map((image) => {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8 + image.png.length);
    return Buffer.concat([Buffer.from(types[image.size]), size, image.png]);
  });
  const body = Buffer.concat(chunks);
  const total = Buffer.alloc(4);
  total.writeUInt32BE(8 + body.length);
  return Buffer.concat([Buffer.from("icns"), total, body]);
}

assertIcon(sampleApp, "app");
assertIcon(sampleDoc, "document");
if (JSON.stringify(sampleApp(0.5, 0.5)) === JSON.stringify(sampleDoc(0.5, 0.5)) && JSON.stringify(sampleApp(0.16, 0.5)) === JSON.stringify(sampleDoc(0.16, 0.5))) {
  throw new Error("app and document icons look the same");
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
function build(sample) {
  return sizes.map((size) => ({ size: size, png: png(size, paint(sample)) }));
}

const appImages = build(sampleApp);
const docImages = build(sampleDoc);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, "icons"), { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.png"), appImages.find((image) => image.size === 256).png);
fs.writeFileSync(path.join(outDir, "icon.ico"), ico(appImages.filter((image) => image.size <= 256)));
fs.writeFileSync(path.join(outDir, "icon.icns"), icns(appImages.filter((image) => image.size !== 24 && image.size !== 48)));
fs.writeFileSync(path.join(outDir, "document.png"), docImages.find((image) => image.size === 256).png);
fs.writeFileSync(path.join(outDir, "document.ico"), ico(docImages.filter((image) => image.size <= 256)));
fs.writeFileSync(path.join(outDir, "document.icns"), icns(docImages.filter((image) => image.size !== 24 && image.size !== 48)));
appImages.forEach((image) => {
  fs.writeFileSync(path.join(outDir, "icons", image.size + "x" + image.size + ".png"), image.png);
});
const buildDir = path.join(__dirname, "..", "build");
fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(path.join(outDir, "icon.ico"), path.join(buildDir, "icon.ico"));
console.log("icons ready");

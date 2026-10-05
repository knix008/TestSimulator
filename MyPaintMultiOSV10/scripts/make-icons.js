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

/* The mark is three overlapping discs of paint. On the deep plate of the application icon
 * they are screened, so the overlaps glow; on the pale card of the document icon they are
 * multiplied, the way real ink mixes on paper. */
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

const MARKS = [
  { x: 0.385, y: 0.415, r: 0.175, glow: [56, 189, 248, 255], ink: [34, 211, 238, 255] },
  { x: 0.615, y: 0.415, r: 0.175, glow: [251, 113, 133, 255], ink: [244, 114, 182, 255] },
  { x: 0.500, y: 0.615, r: 0.175, glow: [250, 204, 21, 255], ink: [253, 224, 71, 255] },
];

const FOLD_FROM = [237, 233, 254, 255];
const FOLD_TO = [124, 58, 237, 255];

function screenBlend(base, over, amount) {
  const out = base.slice();
  for (let i = 0; i < 3; i += 1) {
    const value = 255 - ((255 - base[i]) * (255 - over[i])) / 255;
    out[i] = Math.round(base[i] + (value - base[i]) * amount);
  }
  return out;
}

function multiplyBlend(base, over, amount) {
  const out = base.slice();
  for (let i = 0; i < 3; i += 1) {
    const value = (base[i] * over[i]) / 255;
    out[i] = Math.round(base[i] + (value - base[i]) * amount);
  }
  return out;
}

/* The discs are lit as beads of paint: the union of the three is treated as one surface, the
 * normal comes from whichever disc the point sits nearest the middle of, and the plate catches
 * their shadow. That, plus the bevel on the plate itself, is what makes both read as solid. */
const LIGHT = (() => {
  const v = [-0.45, -0.55, 0.70];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

function marksAt(nx, ny, box) {
  const gx = (nx - box.left) / box.size;
  const gy = (ny - box.top) / box.size;
  if (gx < -0.3 || gy < -0.3 || gx > 1.3 || gy > 1.3) return null;
  let hit = null;
  for (let i = 0; i < MARKS.length; i += 1) {
    const mark = MARKS[i];
    if (Math.hypot(gx - mark.x, gy - mark.y) > mark.r) continue;
    if (!hit) hit = [];
    hit.push(mark);
  }
  return hit;
}

/* How far into the union of the discs a point lies, and the surface normal there. */
function beadSurface(nx, ny, box, hit) {
  const gx = (nx - box.left) / box.size;
  const gy = (ny - box.top) / box.size;
  let nearest = hit[0];
  let closest = 2;
  hit.forEach((mark) => {
    const t = Math.hypot(gx - mark.x, gy - mark.y) / mark.r;
    if (t < closest) {
      closest = t;
      nearest = mark;
    }
  });
  const dx = (gx - nearest.x) / nearest.r;
  const dy = (gy - nearest.y) / nearest.r;
  const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
  return { dx: dx, dy: dy, nz: nz, edge: closest };
}

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

/* A soft shadow on the plate: the union shifted down and to the right, minus the union. */
function beadShadow(nx, ny, box) {
  const gx = (nx - box.left) / box.size - 0.040;
  const gy = (ny - box.top) / box.size - 0.052;
  let closest = 9;
  MARKS.forEach((mark) => {
    closest = Math.min(closest, Math.hypot(gx - mark.x, gy - mark.y) / mark.r);
  });
  if (closest >= 1.10) return 0;
  return Math.min(1, (1.10 - closest) / 0.34);
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

/* A pencil resting across the paint, lit from the same side as everything else: the barrel is
 * shaded like a cylinder, the wood tapers into a graphite tip, and a ferrule holds the eraser. */
const PENCIL = {
  tip: [0.585, 0.790],
  end: [0.880, 0.335],
  half: 0.042,
};
const PENCIL_PARTS = [
  { until: 0.10, color: [55, 60, 72, 255], taper: true },
  { until: 0.27, color: [233, 196, 146, 255], taper: true },
  { until: 0.82, color: [245, 170, 36, 255], taper: false },
  { until: 0.90, color: [203, 208, 214, 255], taper: false },
  { until: 1.00, color: [244, 143, 158, 255], taper: false },
];

function pencilAt(nx, ny) {
  const ax = PENCIL.tip[0];
  const ay = PENCIL.tip[1];
  const bx = PENCIL.end[0];
  const by = PENCIL.end[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = ((nx - ax) * dx + (ny - ay) * dy) / len2;
  if (t < 0 || t > 1) return null;
  const px = ax + dx * t;
  const py = ay + dy * t;
  // which side of the axis, in units of the half width
  const len = Math.sqrt(len2);
  const across = ((nx - px) * (-dy) + (ny - py) * dx) / len;
  let half = PENCIL.half;
  if (t < 0.27) half *= 0.14 + 0.86 * Math.min(1, t / 0.27);
  const u = across / half;
  if (Math.abs(u) > 1) return null;

  let part = PENCIL_PARTS[PENCIL_PARTS.length - 1];
  for (let i = 0; i < PENCIL_PARTS.length; i += 1) {
    if (t <= PENCIL_PARTS[i].until) {
      part = PENCIL_PARTS[i];
      break;
    }
  }
  // a cylinder: the lit stripe sits toward the light, the far side falls into shade
  const round = Math.sqrt(Math.max(0, 1 - u * u));
  const lit = Math.max(0, (-u) * 0.62 + round * 0.78);
  const shade = 0.44 + 0.78 * lit;
  let color = part.color.map((value, index) => (index === 3 ? value : Math.round(Math.min(255, value * shade))));
  const spot = Math.exp(-(((u + 0.42) ** 2) / 0.055));
  if (spot > 0.004) color = mix(color, [255, 255, 255, 255], spot * 0.55);
  if (Math.abs(u) > 0.86) color = mix(color, [0, 0, 0, 255], (Math.abs(u) - 0.86) / 0.14 * 0.30);
  // the metal band gets two rings so it reads as a ferrule
  if (t > 0.82 && t <= 0.90) {
    const ring = Math.abs(((t - 0.82) / 0.08) * 3 % 1 - 0.5);
    color = mix(color, [0, 0, 0, 255], (0.5 - ring) * 0.26);
  }
  return color;
}

function pencilShadow(nx, ny) {
  return pencilAt(nx - 0.030, ny - 0.038) ? 1 : 0;
}

const APP_PLATE = { left: 0.05, top: 0.05, width: 0.90, height: 0.90, radius: 0.255 };
const APP_GLYPH = { left: 0.05, top: 0.05, size: 0.90 };

function sampleApp(nx, ny) {
  if (nx < 0.05 || ny < 0.05 || nx > 0.95 || ny > 0.95) return [0, 0, 0, 0];
  const plate = APP_PLATE;
  if (!inRound(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius)) return [0, 0, 0, 0];
  let color = shadePlate(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius, PLATE_STOPS);
  const hit = marksAt(nx, ny, APP_GLYPH);
  if (hit) {
    // the first disc lays down its own colour, the ones over it light the overlap up
    color = mix(color, hit[0].glow, 0.94);
    // a gentle screen keeps the overlap lighter without washing the colour out of it
    for (let i = 1; i < hit.length; i += 1) color = screenBlend(color, hit[i].glow, 0.55);
    color = litBead(color, beadSurface(nx, ny, APP_GLYPH, hit), 0.80);
  } else {
    const shadow = beadShadow(nx, ny, APP_GLYPH);
    if (shadow > 0) color = mix(color, [20, 6, 50, 255], shadow * 0.40);
  }
  // the pencil lies on top of the paint, with its own shadow under it
  if (pencilShadow(nx, ny) && !pencilAt(nx, ny)) return mix(color, [20, 6, 50, 255], 0.34);
  return pencilAt(nx, ny) || color;
}

const DOC_CARD = { left: 0.125, top: 0.05, width: 0.75, height: 0.90, radius: 0.13 };
const DOC_GLYPH = { left: 0.21, top: 0.235, size: 0.58 };

function sampleDoc(nx, ny, size) {
  if (nx < 0.05 || ny < 0.05 || nx > 0.95 || ny > 0.95) return [0, 0, 0, 0];
  const card = DOC_CARD;
  if (!inRound(nx, ny, card.left, card.top, card.width, card.height, card.radius)) return [0, 0, 0, 0];
  let color = shadePlate(nx, ny, card.left, card.top, card.width, card.height, card.radius, CARD_STOPS);
  const fold = 0.26;
  const fx = card.left + card.width - fold;
  const u = (nx - fx) / fold;
  const v = (ny - card.top) / fold;
  if (u >= 0 && v >= 0 && u <= 1 && v <= 1 && u + v <= 1) {
    color = mix(FOLD_FROM, FOLD_TO, Math.min(1, (u + v) * 1.1));
    // the fold lifts off the page along its diagonal
    const crease = Math.max(0, 1 - Math.abs(u + v - 1) / 0.22);
    color = mix(color, [255, 255, 255, 255], crease * 0.30);
  }
  const small = size && size < 48;
  const box = small ? { left: 0.165, top: 0.20, size: 0.67 } : DOC_GLYPH;
  const hit = marksAt(nx, ny, box);
  if (!hit) {
    const shadow = beadShadow(nx, ny, box);
    return shadow > 0 ? mix(color, [86, 70, 130, 255], shadow * 0.26) : color;
  }
  hit.forEach((mark) => { color = multiplyBlend(color, mark.ink, 0.92); });
  return litBead(color, beadSurface(nx, ny, box, hit), 0.55);
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

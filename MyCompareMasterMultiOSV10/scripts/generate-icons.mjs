// Draws the application icon and the document icon into assets/, the one folder that
// holds every icon the program uses:
//
//   assets/icon.png         the app icon (1024): window, menu bar, About, favicon
//   assets/icon.ico         Windows exe + installer + uninstaller
//   assets/icon.icns        macOS bundle
//   assets/icons/*.png      the sizes the Tauri bundle and Linux want
//   assets/document.png     the .dmrg session file icon (512)
//   assets/document.ico     the same, registered for .dmrg by the Windows installer
//
// src-tauri/tauri.conf.json and the UI (Vite imports) read them from there. Run
// `npm run icons` after changing a drawing; the results are committed.
//
// Everything here is plain Node: a small signed-distance rasteriser, a PNG encoder and
// an ICO writer. No native image library, so the icons rebuild identically on every
// platform and in CI.
//
// The look is fixed by the brief: it reads as 3D, the area outside the rounded square
// is fully transparent, and the top-left corner carries a specular highlight.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "assets");
const iconsDir = path.join(assetsDir, "icons");

/* ---------------- a tiny signed-distance rasteriser ---------------- */

/**
 * Straight-alpha RGBA canvas. Shapes are signed distance fields, so the antialiasing
 * falls out of the distance rather than out of supersampling, and the edge stays clean
 * at 16px where an icon usually falls apart.
 */
class Canvas {
  constructor(size) {
    this.size = size;
    this.data = new Float64Array(size * size * 4);
  }

  /** `shape(x, y)` returns the signed distance in pixels (negative = inside). */
  fill(shape, paint) {
    const { size, data } = this;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const coverage = clamp(0.5 - shape(px, py), 0, 1);
        if (coverage <= 0) continue;
        const [r, g, b, a] = paint(px, py);
        const alpha = a * coverage;
        if (alpha <= 0) continue;
        const i = (y * size + x) * 4;
        const inv = 1 - alpha;
        data[i] = r * alpha + data[i] * inv;
        data[i + 1] = g * alpha + data[i + 1] * inv;
        data[i + 2] = b * alpha + data[i + 2] * inv;
        data[i + 3] = alpha + data[i + 3] * inv;
      }
    }
  }

  /** Paints inside `shape` only — used for highlights that must not escape the body. */
  fillClipped(shape, clip, paint) {
    this.fill((x, y) => Math.max(shape(x, y), clip(x, y)), paint);
  }

  stroke(shape, width, paint) {
    this.fill((x, y) => Math.abs(shape(x, y)) - width / 2, paint);
  }

  bytes() {
    const { size, data } = this;
    const out = Buffer.alloc(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      // Un-premultiply: the canvas accumulates premultiplied colour.
      const scale = a > 0 ? 1 / a : 0;
      out[i] = round255(data[i] * scale);
      out[i + 1] = round255(data[i + 1] * scale);
      out[i + 2] = round255(data[i + 2] * scale);
      out[i + 3] = round255(a);
    }
    return out;
  }
}

function roundedRect(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  return (px, py) => {
    const dx = Math.abs(px - cx) - hx;
    const dy = Math.abs(py - cy) - hy;
    const ox = Math.max(dx, 0);
    const oy = Math.max(dy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
  };
}

/** Round-capped line, as a capsule distance field. */
function capsule(x1, y1, x2, y2, width) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lengthSquared = vx * vx + vy * vy || 1;
  return (px, py) => {
    const t = clamp(((px - x1) * vx + (py - y1) * vy) / lengthSquared, 0, 1);
    return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t)) - width / 2;
  };
}

/**
 * A filled triangle, as the intersection of three half-planes.
 *
 * The vertices must wind clockwise on screen (y grows downwards); the other winding
 * produces an empty shape rather than an error, which is an easy way to draw nothing
 * by accident.
 */
function triangle(ax, ay, bx, by, cx, cy) {
  const edge = (x1, y1, x2, y2) => {
    const ex = x2 - x1;
    const ey = y2 - y1;
    const length = Math.hypot(ex, ey) || 1;
    return (px, py) => ((px - x1) * ey - (py - y1) * ex) / length;
  };
  const e1 = edge(ax, ay, bx, by);
  const e2 = edge(bx, by, cx, cy);
  const e3 = edge(cx, cy, ax, ay);
  return (px, py) => Math.max(e1(px, py), e2(px, py), e3(px, py));
}

const solid = (color) => () => color;

/** `direction` is "diagonal" (top-left → bottom-right) or "vertical". */
function gradient(x, y, w, h, from, to, direction) {
  return (px, py) => {
    const t = direction === "vertical"
      ? clamp((py - y) / h, 0, 1)
      : clamp(((px - x) + (py - y)) / (w + h), 0, 1);
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
      from[3] + (to[3] - from[3]) * t,
    ];
  };
}

/**
 * The slab's own edge, shaded by which way it faces: what turns a flat sticker into
 * something with a thickness to it.
 *
 * A distance field knows more than where its edge is — the direction the distance
 * grows in *is* the outward normal of that edge, and it can be read straight off the
 * field by sampling either side of the point. So the lighting here is real shading
 * rather than a painted-on outline: the part of the rim that faces the lamp catches
 * it, the part facing away falls into shade, and the two sides of the slab in between
 * pass through untouched.
 *
 * That last part is the whole difference between depth and a border. A bevel of even
 * strength all the way round reads as a drawn line, so this one is signed: it only
 * ever lightens the edges that face the light and darkens the ones that face away.
 *
 * `width` is how far in from the edge the bevel reaches, in pixels.
 */
function bevel(shape, width, { lit = 0.5, shade = 0.42, light = [-0.7071, -0.7071] } = {}) {
  return (px, py) => {
    const depth = -shape(px, py);
    if (depth < 0 || depth > width) return [0, 0, 0, 0];

    // The outward normal, from the field itself. A half-pixel step is small enough
    // to stay on one edge at the corners and large enough not to be lost in rounding.
    const nx = shape(px + 0.5, py) - shape(px - 0.5, py);
    const ny = shape(px, py + 0.5) - shape(px, py - 0.5);
    const length = Math.hypot(nx, ny);
    if (length === 0) return [0, 0, 0, 0];

    const facing = ((nx / length) * light[0] + (ny / length) * light[1]);
    // Brightest right at the edge and gone by `width` in, so the slab's middle keeps
    // whatever colour it was given.
    const falloff = (1 - depth / width) ** 2.2;
    const strength = facing > 0 ? lit : shade;
    const alpha = strength * falloff * Math.abs(facing) ** 1.1;
    return facing > 0 ? [1, 1, 1, alpha] : [0, 0, 0, alpha];
  };
}

/** The specular highlight: brightest at (cx, cy), fading to nothing by `radius`. */
function glow(cx, cy, radius, color, strength) {
  return (px, py) => {
    const distance = Math.hypot(px - cx, py - cy) / radius;
    const falloff = Math.max(0, 1 - distance) ** 2.2;
    return [color[0], color[1], color[2], strength * falloff];
  };
}

const rgb = (r, g, b, a = 1) => [r / 255, g / 255, b / 255, a];
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const round255 = (value) => Math.round(clamp(value, 0, 1) * 255);

/* ---------------- shapes and paints for the glass look ---------------- */

/**
 * A superellipse ("squircle"): the continuous-curvature corner current app icons use
 * instead of a rounded rectangle, whose straight edge meets its arc with a visible kink.
 * The p-norm is close enough to a true distance for the edge antialiasing.
 */
function squircle(cx, cy, half, n = 5) {
  return (px, py) => {
    const x = Math.abs(px - cx) / half;
    const y = Math.abs(py - cy) / half;
    return ((x ** n + y ** n) ** (1 / n) - 1) * half;
  };
}

/** A linear gradient from (x1, y1) to (x2, y2) through `stops`: [[t, colour], ...]. */
function ramp(x1, y1, x2, y2, stops) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lengthSquared = vx * vx + vy * vy || 1;
  return (px, py) => {
    const t = clamp(((px - x1) * vx + (py - y1) * vy) / lengthSquared, 0, 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, from] = stops[i];
    const [t1, to] = stops[i + 1];
    const u = clamp((t - t0) / (t1 - t0 || 1), 0, 1);
    return from.map((value, channel) => value + (to[channel] - value) * u);
  };
}

/**
 * A soft shadow: the shape moved by (dx, dy) with its edge spread over `blur` pixels,
 * kept inside `clip` so the transparent surround of the icon stays transparent.
 */
function softShadow(canvas, shape, clip, dx, dy, blur, color) {
  canvas.fillClipped((x, y) => shape(x - dx, y - dy) / Math.max(blur, 1) * 1.5 - 0.5, clip, solid(color));
}

/* ---------------- the application icon ---------------- */

/**
 * Two pages of code side by side, merged into one page below them, on a vivid squircle.
 *
 * The depth comes from layers of light rather than from a heavy bevel: a violet to
 * teal body with soft colour blooms in two corners, translucent panes that let the
 * colour through and catch a bright rim along their lit edges, and soft shadows under
 * every layer. Each source page carries its own change (coral on the left, mint on the
 * right) and the result carries both, so the picture reads as two becoming one.
 *
 * `paintAppIcon` draws in a 256-unit design space mapped by `k` and an origin, so the
 * document icon can stamp the same emblem onto its page.
 */
function paintAppIcon(canvas, k, ox = 0, oy = 0) {
  const X = (u) => ox + u * k;
  const Y = (u) => oy + u * k;
  const s = (u) => u * k;
  const pixels = 256 * k; // the emblem's own size, which decides how much detail survives

  const body = squircle(X(128), Y(128), s(114));

  // 1. the body: violet into indigo into teal, lit from the top-left
  canvas.fill(body, ramp(X(24), Y(16), X(232), Y(240), [
    [0, rgb(168, 85, 247)],
    [0.5, rgb(79, 70, 229)],
    [1, rgb(6, 148, 162)],
  ]));
  // colour blooms, the way light pools in tinted glass
  canvas.fillClipped(body, body, glow(X(214), Y(42), s(130), rgb(244, 114, 182), 0.55));
  canvas.fillClipped(body, body, glow(X(40), Y(226), s(130), rgb(45, 212, 191), 0.4));
  canvas.fillClipped(body, body, glow(X(64), Y(48), s(150), rgb(255, 255, 255), 0.22));
  canvas.fillClipped(body, body, glow(X(220), Y(230), s(150), rgb(15, 10, 60), 0.28));
  // a narrow rolled edge with a crisp specular rim, not a wide bevel
  canvas.fill(body, bevel(body, Math.max(s(10), 1.2), { lit: 0.42, shade: 0.3 }));
  canvas.fill(body, bevel(body, Math.max(s(3), 1), { lit: 0.6, shade: 0.12 }));

  /* --- two pages of code above, merged into one below --- */

  const pane = (cx, cy, w, h) => roundedRect(cx - w / 2, cy - h / 2, w, h, s(16));
  const sources = [
    { cx: X(82), mark: rgb(251, 113, 133), tint: rgb(253, 164, 175) },
    { cx: X(174), mark: rgb(52, 211, 153), tint: rgb(110, 231, 183) },
  ];
  const sourceY = Y(70);
  const sourceW = s(76);
  const sourceH = s(80);
  const resultX = X(128);
  const resultY = Y(190);
  const resultW = s(116);
  const resultH = s(76);
  const result = pane(resultX, resultY, resultW, resultH);

  // A code line: indent and length in design units, relative to its page's centre.
  const codeLine = (cx, cy, row, paint) => canvas.fill(
    capsule(cx + s(row.from), cy + s(row.y), cx + s(row.to), cy + s(row.y), Math.max(s(7), 1)),
    paint,
  );

  for (const source of sources) softShadow(canvas, pane(source.cx, sourceY, sourceW, sourceH), body, s(2), s(7), s(12), rgb(30, 20, 90, 0.3));
  softShadow(canvas, result, body, 0, s(9), s(16), rgb(30, 20, 90, 0.4));

  // The source pages: frosted glass, tinted by the side they come from, each with
  // its own changed line.
  for (const source of sources) {
    const shape = pane(source.cx, sourceY, sourceW, sourceH);
    canvas.fill(shape, ramp(0, sourceY - sourceH / 2, 0, sourceY + sourceH / 2, [
      [0, rgb(255, 255, 255, 0.5)],
      [1, rgb(255, 255, 255, 0.22)],
    ]));
    canvas.fill(shape, solid([...source.tint.slice(0, 3), 0.18]));
    canvas.fillClipped(shape, shape, glow(source.cx - s(24), sourceY - s(28), s(64), rgb(255, 255, 255), 0.4));
    canvas.fill(shape, bevel(shape, Math.max(s(5), 1), { lit: 0.85, shade: 0.2 }));
    canvas.stroke(shape, Math.max(s(1.6), 0.8), solid(rgb(255, 255, 255, 0.55)));
    if (pixels >= 48) {
      const plain = solid(rgb(255, 255, 255, 0.9));
      codeLine(source.cx, sourceY, { y: -22, from: -24, to: 18 }, plain);
      codeLine(source.cx, sourceY, { y: -6, from: -16, to: 24 }, solid(source.mark));
      codeLine(source.cx, sourceY, { y: 10, from: -16, to: 12 }, plain);
      codeLine(source.cx, sourceY, { y: 26, from: -24, to: 8 }, plain);
    }
  }

  // The merge: an arm from each page, joining into one arrow that points into the
  // result. Thicker than the design space says at the small sizes, where a hairline
  // would vanish.
  const arm = Math.max(s(10), 1.8);
  const join = Y(134);
  const drawMerge = (dx, dy, paint) => {
    canvas.fill(capsule(sources[0].cx + dx, sourceY + sourceH / 2 + s(5) + dy, resultX + dx, join + dy, arm), paint);
    canvas.fill(capsule(sources[1].cx + dx, sourceY + sourceH / 2 + s(5) + dy, resultX + dx, join + dy, arm), paint);
    canvas.fill(triangle(
      resultX - s(15) + dx, join - s(2) + dy,
      resultX + s(15) + dx, join - s(2) + dy,
      resultX + dx, Y(149) + dy,
    ), paint);
  };
  drawMerge(0, Math.max(s(3), 0.6), solid(rgb(40, 15, 70, 0.3)));
  drawMerge(0, 0, ramp(0, sourceY + sourceH / 2, 0, Y(149), [
    [0, rgb(253, 224, 71)],
    [1, rgb(249, 115, 22)],
  ]));

  // The result: one brighter page carrying both changes, which is the whole story —
  // the two pages above have become this one.
  canvas.fill(result, ramp(0, resultY - resultH / 2, 0, resultY + resultH / 2, [
    [0, rgb(255, 255, 255, 0.92)],
    [1, rgb(236, 233, 255, 0.82)],
  ]));
  canvas.fillClipped(result, result, glow(resultX - s(36), resultY - s(26), s(80), rgb(255, 255, 255), 0.5));
  canvas.fill(result, bevel(result, Math.max(s(5), 1), { lit: 0.9, shade: 0.25 }));
  canvas.stroke(result, Math.max(s(1.6), 0.8), solid(rgb(255, 255, 255, 0.8)));
  if (pixels >= 48) {
    const plain = solid(rgb(79, 70, 229, 0.55));
    codeLine(resultX, resultY, { y: -21, from: -42, to: 22 }, plain);
    codeLine(resultX, resultY, { y: -7, from: -32, to: 34 }, solid(sources[0].mark));
    codeLine(resultX, resultY, { y: 7, from: -32, to: 26 }, solid(sources[1].mark));
    codeLine(resultX, resultY, { y: 21, from: -42, to: 6 }, plain);
  } else {
    // Too small for lines: two bars of the change colours keep the result readable.
    codeLine(resultX, resultY, { y: -8, from: -30, to: 30 }, solid(sources[0].mark));
    codeLine(resultX, resultY, { y: 10, from: -30, to: 30 }, solid(sources[1].mark));
  }
}

function drawAppIcon(size) {
  const canvas = new Canvas(size);
  paintAppIcon(canvas, size / 256);
  return canvas;
}

/* ---------------- the document icon ---------------- */

/**
 * A white page with a folded corner and the app's emblem on it: the same squircle,
 * panes and badge, so a .dmrg file is recognisably this program's.
 */
function drawDocumentIcon(size) {
  const canvas = new Canvas(size);
  const k = size / 256;
  const s = (value) => value * k;

  const page = { x: s(40), y: s(16), w: s(176), h: s(224), r: s(20) };
  const fold = s(54);
  const sheet = roundedRect(page.x, page.y, page.w, page.h, page.r);
  // The corner is cut away rather than painted over, so the icon's outline really is
  // a dog-eared page and the area outside it stays transparent.
  const corner = triangle(
    page.x + page.w - fold, page.y,
    page.x + page.w + s(10), page.y - s(10),
    page.x + page.w, page.y + fold,
  );
  const body = (x, y) => Math.max(sheet(x, y), -corner(x, y));

  canvas.fill(body, ramp(page.x, page.y, page.x + page.w, page.y + page.h, [
    [0, rgb(255, 255, 255)],
    [1, rgb(226, 232, 245)],
  ]));
  canvas.fillClipped(body, body, glow(page.x + page.w, page.y + page.h, s(160), rgb(168, 85, 247), 0.12));
  canvas.fill(body, bevel(body, Math.max(s(8), 1), { lit: 0.4, shade: 0.28 }));
  canvas.stroke(body, Math.max(s(1.6), 0.8), solid(rgb(148, 163, 196, 0.7)));

  // The flap: the folded-back corner, lit from the top-left like everything else.
  const flap = triangle(
    page.x + page.w - fold, page.y,
    page.x + page.w, page.y + fold,
    page.x + page.w - fold, page.y + fold,
  );
  softShadow(canvas, flap, body, -s(2), s(4), s(8), rgb(30, 20, 90, 0.18));
  canvas.fill(flap, ramp(page.x + page.w - fold, page.y + fold, page.x + page.w, page.y, [
    [0, rgb(214, 222, 240)],
    [1, rgb(246, 248, 253)],
  ]));
  canvas.stroke(flap, Math.max(s(1.4), 0.7), solid(rgb(148, 163, 196, 0.6)));

  if (size >= 48) {
    const line = solid(rgb(148, 163, 196, 0.8));
    canvas.fill(capsule(page.x + s(26), page.y + s(34), page.x + s(96), page.y + s(34), s(8)), line);
    canvas.fill(capsule(page.x + s(26), page.y + s(54), page.x + s(76), page.y + s(54), s(8)), line);
  }

  // The emblem: the app icon itself, scaled onto the lower part of the page.
  const scale = size >= 48 ? 0.58 : 0.66;
  const ek = k * scale;
  paintAppIcon(canvas, ek, s(128) - 128 * ek, s(size >= 48 ? 156 : 146) - 128 * ek);

  return canvas;
}

/* ---------------- PNG / ICO encoding ---------------- */

function png(canvas) {
  const { size } = canvas;
  const pixels = canvas.bytes();
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const tagged = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tagged), 0);
  return Buffer.concat([head, tagged, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG-compressed ICO: every size in one file, which is what Windows wants. */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach(({ size, data }, index) => {
    const at = index * 16;
    directory[at] = size >= 256 ? 0 : size;
    directory[at + 1] = size >= 256 ? 0 : size;
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

/* ---------------- output ---------------- */

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

fs.mkdirSync(iconsDir, { recursive: true });

const appCache = new Map();
const documentCache = new Map();
const renderApp = (size) => {
  if (!appCache.has(size)) appCache.set(size, png(drawAppIcon(size)));
  return appCache.get(size);
};
const renderDocument = (size) => {
  if (!documentCache.has(size)) documentCache.set(size, png(drawDocumentIcon(size)));
  return documentCache.get(size);
};

/** An .icns of PNG entries, which every macOS since 10.7 reads. */
function icns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

const write = (name, data) => fs.writeFileSync(path.join(assetsDir, name), data);

write("icon.png", renderApp(1024));
write("icon.ico", ico(ICO_SIZES.map((size) => ({ size, data: renderApp(size) }))));
write("icon.icns", icns([
  { type: "ic07", size: 128 },
  { type: "ic08", size: 256 },
  { type: "ic09", size: 512 },
  { type: "ic10", size: 1024 },
].map(({ type, size }) => ({ type, data: renderApp(size) }))));
for (const size of LINUX_SIZES) write(path.join("icons", `${size}x${size}.png`), renderApp(size));
write(path.join("icons", "128x128@2x.png"), renderApp(256));
write("document.png", renderDocument(512));
write("document.ico", ico(ICO_SIZES.map((size) => ({ size, data: renderDocument(size) }))));

console.log(
  `icons  assets/icon.png (1024)  assets/icon.ico (${ICO_SIZES.join(", ")})  assets/icon.icns  `
  + `assets/icons/ (${LINUX_SIZES.join(", ")})  assets/document.png  assets/document.ico`,
);

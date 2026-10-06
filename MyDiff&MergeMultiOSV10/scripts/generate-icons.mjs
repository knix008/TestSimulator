// Draws the application icon and the document icon, and writes every file the
// installers and the window need:
//
//   build/icon.ico        Windows app + installer + uninstaller
//   build/icon.png        macOS / Linux app (1024)
//   build/icons/*.png     Linux icon set
//   build/document.ico    the .dmrg file type, registered by the installer
//   public/icon.png       the web build's favicon
//   public/document.png   the document icon for the web build
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
const buildDir = path.join(root, "build");
const iconsDir = path.join(buildDir, "icons");
const publicDir = path.join(root, "public");

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

/* ---------------- the application icon ---------------- */

/**
 * Two document columns being merged into one, on a rounded slab.
 *
 * The 3D reading comes from light, not from an outline: a diagonal body gradient
 * that runs from lit to shaded, a soft specular glow sitting over the top-left
 * corner as though a lamp were up and to the left, and the slab's own edge shaded
 * by which way it faces, so the thing has a thickness instead of being a sticker.
 * There is deliberately no rim — an even bevel all the way round reads as a drawn
 * border, which is the one thing the icon must not have — so the edge lighting is
 * directional: lit along the top and left, shaded along the bottom and right, and
 * nothing at all on the two corners in between.
 */
function drawAppIcon(size) {
  const canvas = new Canvas(size);
  const k = size / 256;
  const s = (value) => value * k;

  const box = { x: s(16), y: s(16), w: s(224), h: s(224), r: s(52) };
  const body = roundedRect(box.x, box.y, box.w, box.h, box.r);

  // 1. the slab
  canvas.fill(body, gradient(box.x, box.y, box.w, box.h, rgb(63, 94, 162), rgb(20, 31, 56), "diagonal"));

  // 2. the light itself: a broad highlight over the top-left corner, and a second,
  // tighter one at its centre so the corner reads as catching the light rather than
  // as being painted a lighter colour. Both are clipped to the body, so nothing
  // spills past the slab's edge and no rim is drawn.
  canvas.fillClipped(body, body, glow(box.x + s(62), box.y + s(54), s(168), rgb(255, 255, 255), 0.4));
  canvas.fillClipped(body, body, glow(box.x + s(46), box.y + s(38), s(74), rgb(255, 255, 255), 0.3));

  // 3. and the far corner falling away, which is what makes the near one look lit
  canvas.fillClipped(body, body, glow(box.x + box.w - s(30), box.y + box.h - s(26), s(180), rgb(0, 0, 0), 0.26));

  // 4. the edge: the top and left catch the lamp, the bottom and right fall into
  // shade, and the slab stops being a flat shape with a gradient on it. Wide enough
  // to be a rounded-over edge rather than a hairline, and clipped to the body, so
  // the transparent surround is untouched.
  canvas.fill(body, bevel(body, Math.max(s(15), 1.5), { lit: 0.5, shade: 0.45 }));

  /* --- the mark: two columns merging into one --- */

  const columnWidth = s(40);
  const top = s(58);
  const bottom = s(150);
  const leftX = s(76);
  const rightX = s(180);

  const column = (cx, from, to) => {
    const shape = roundedRect(cx - columnWidth / 2, top, columnWidth, bottom - top, s(10));
    // Drop shadow first, so each column sits above the slab.
    canvas.fill(
      roundedRect(cx - columnWidth / 2 + s(3), top + s(4), columnWidth, bottom - top, s(10)),
      solid(rgb(0, 0, 0, 0.22)),
    );
    canvas.fill(shape, gradient(cx - columnWidth / 2, top, columnWidth, bottom - top, from, to, "vertical"));
    canvas.fillClipped(shape, shape, glow(cx - s(8), top + s(10), s(46), rgb(255, 255, 255), 0.4));
  };

  column(leftX, rgb(134, 239, 172), rgb(34, 150, 94));
  column(rightX, rgb(147, 197, 253), rgb(37, 99, 190));

  // Text lines on each column, skipped where they would only smear.
  if (size >= 48) {
    const line = solid(rgb(255, 255, 255, 0.55));
    const width = Math.max(s(4), 1);
    for (let y = top + s(16); y < bottom - s(12); y += s(20)) {
      canvas.fill(capsule(leftX - s(11), y, leftX + s(11), y, width), line);
      canvas.fill(capsule(rightX - s(11), y, rightX + s(11), y, width), line);
    }
  }

  /*
   * The comparison: a two-way arrow in the gap between the columns.
   *
   * The icon has two things to say and they happen in that order — the files are
   * compared against each other, and then they are merged into one — so the
   * sideways arrow sits between the columns and the merge arrow runs below them.
   * White rather than the merge's yellow: two marks of one colour would read as one
   * shape, and the gap is narrow enough that they nearly touch.
   *
   * Skipped below 48px for the same reason as the text lines: the gap between the
   * columns is eight pixels there, and an arrow drawn into it is a smudge that
   * costs the merge mark its clarity without reading as an arrow itself.
   */
  if (size >= 48) {
    const compareY = (top + bottom) / 2;
    const leftTip = leftX + s(26);
    const rightTip = rightX - s(26);
    const head = s(15);
    const halfHead = s(11);
    // Drawn twice: once offset into shadow, once in white, so it sits above the
    // slab the same way the columns do rather than being painted onto it.
    const drawCompare = (dx, dy, paint) => {
      canvas.fill(capsule(leftTip + head + dx, compareY + dy, rightTip - head + dx, compareY + dy, s(9)), paint);
      canvas.fill(
        triangle(
          leftTip + dx, compareY + dy,
          leftTip + head + dx, compareY - halfHead + dy,
          leftTip + head + dx, compareY + halfHead + dy,
        ),
        paint,
      );
      canvas.fill(
        triangle(
          rightTip + dx, compareY + dy,
          rightTip - head + dx, compareY + halfHead + dy,
          rightTip - head + dx, compareY - halfHead + dy,
        ),
        paint,
      );
    };

    drawCompare(s(3), s(4), solid(rgb(0, 0, 0, 0.22)));
    drawCompare(0, 0, solid(rgb(255, 255, 255, 0.95)));
  }

  // The merge: two arms joining and one arrow pointing down into the result.
  const armWidth = s(13);
  const joinY = s(176);
  const stemX = s(128);
  const arm = solid(rgb(250, 204, 21));
  canvas.fill(capsule(leftX, bottom - s(4), stemX, joinY, armWidth), arm);
  canvas.fill(capsule(rightX, bottom - s(4), stemX, joinY, armWidth), arm);
  canvas.fill(capsule(stemX, joinY, stemX, s(196), armWidth), arm);
  canvas.fill(triangle(stemX - s(26), s(188), stemX + s(26), s(188), stemX, s(222)), arm);
  canvas.fillClipped(
    capsule(stemX, joinY, stemX, s(196), armWidth),
    capsule(stemX, joinY, stemX, s(196), armWidth),
    glow(stemX - s(5), joinY, s(40), rgb(255, 255, 255), 0.45),
  );

  return canvas;
}

/* ---------------- the document icon ---------------- */

/** A page with a folded corner, carrying the same merge mark and the same lighting. */
function drawDocumentIcon(size) {
  const canvas = new Canvas(size);
  const k = size / 256;
  const s = (value) => value * k;

  const page = { x: s(44), y: s(20), w: s(168), h: s(216), r: s(16) };
  const fold = s(56);
  const sheet = roundedRect(page.x, page.y, page.w, page.h, page.r);
  // The corner is cut away rather than painted over, so the icon's outline really is
  // a dog-eared page and the area outside it stays transparent.
  const corner = triangle(
    page.x + page.w - fold, page.y,
    page.x + page.w + s(10), page.y - s(10),
    page.x + page.w, page.y + fold,
  );
  const body = (x, y) => Math.max(sheet(x, y), -corner(x, y));

  canvas.fill(body, gradient(page.x, page.y, page.w, page.h, rgb(252, 253, 255), rgb(203, 213, 233), "diagonal"));
  // The sheet's own edge, before the outline goes over it: a page this pale has
  // almost no room to be lightened, so most of the roundness here comes from the
  // bottom and right rolling into shade.
  canvas.fill(body, bevel(body, Math.max(s(14), 1.2), { lit: 0.5, shade: 0.45 }));
  canvas.stroke(body, Math.max(s(2.4), 1), solid(rgb(120, 136, 165, 0.75)));
  canvas.fillClipped(body, body, glow(page.x + s(40), page.y + s(36), s(120), rgb(255, 255, 255), 0.55));

  // The flap: the folded-back corner, lit from the top-left like everything else.
  const flap = triangle(
    page.x + page.w - fold, page.y,
    page.x + page.w, page.y + fold,
    page.x + page.w - fold, page.y + fold,
  );
  canvas.fill(flap, gradient(
    page.x + page.w - fold, page.y, fold, fold,
    rgb(232, 238, 250), rgb(166, 181, 208), "diagonal",
  ));
  canvas.fill(flap, bevel(flap, Math.max(s(9), 1.2), { lit: 0.55, shade: 0.34 }));
  canvas.stroke(flap, Math.max(s(2), 1), solid(rgb(120, 136, 165, 0.6)));

  const leftX = page.x + s(44);
  const rightX = page.x + s(124);
  const top = page.y + s(78);
  const bottom = page.y + s(136);
  const columnWidth = s(30);

  canvas.fill(
    roundedRect(leftX - columnWidth / 2, top, columnWidth, bottom - top, s(8)),
    gradient(leftX, top, columnWidth, bottom - top, rgb(134, 239, 172), rgb(34, 150, 94), "vertical"),
  );
  canvas.fill(
    roundedRect(rightX - columnWidth / 2, top, columnWidth, bottom - top, s(8)),
    gradient(rightX, top, columnWidth, bottom - top, rgb(147, 197, 253), rgb(37, 99, 190), "vertical"),
  );

  const stemX = (leftX + rightX) / 2;
  const armWidth = s(11);
  const arm = solid(rgb(234, 179, 8));
  canvas.fill(capsule(leftX, bottom, stemX, bottom + s(22), armWidth), arm);
  canvas.fill(capsule(rightX, bottom, stemX, bottom + s(22), armWidth), arm);
  canvas.fill(capsule(stemX, bottom + s(22), stemX, bottom + s(40), armWidth), arm);
  canvas.fill(triangle(stemX - s(21), bottom + s(34), stemX + s(21), bottom + s(34), stemX, bottom + s(62)), arm);

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
fs.mkdirSync(publicDir, { recursive: true });

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

fs.writeFileSync(path.join(buildDir, "icon.ico"), ico(ICO_SIZES.map((size) => ({ size, data: renderApp(size) }))));
fs.writeFileSync(path.join(buildDir, "icon.png"), renderApp(1024));
for (const size of LINUX_SIZES) {
  fs.writeFileSync(path.join(iconsDir, `${size}x${size}.png`), renderApp(size));
}
fs.writeFileSync(
  path.join(buildDir, "document.ico"),
  ico(ICO_SIZES.map((size) => ({ size, data: renderDocument(size) }))),
);
fs.writeFileSync(path.join(buildDir, "document.png"), renderDocument(512));
fs.writeFileSync(path.join(publicDir, "icon.png"), renderApp(256));
fs.writeFileSync(path.join(publicDir, "document.png"), renderDocument(256));

console.log(
  `icons  build/icon.ico (${ICO_SIZES.join(", ")})  build/icon.png (1024)  `
  + `build/icons/ (${LINUX_SIZES.join(", ")})  build/document.ico  public/icon.png`,
);

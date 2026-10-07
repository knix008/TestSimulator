// Draws the app icons into assets/ and regenerates the platform icon set from them.
//   assets/app.png        1024px program icon; source of the macOS/Linux bundle icons
//   public/favicon.png    128px copy for the title bar, About box and browser tab
//   assets/app.ico        program icon embedded in the exe; Windows shortcuts and the taskbar use it
//   assets/installer.ico  setup.exe icon (calendar with a download badge)
//   assets/installer.png  1024px preview of the installer icon
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets");

const hex = (value, alpha = 255) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
  alpha,
];
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp01(t));
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];

// Signed distance functions on the 1024 grid: negative inside, positive outside.
const roundRectSdf = (x, y, w, h, r) => (px, py) => {
  const qx = Math.abs(px - (x + w / 2)) - w / 2 + r;
  const qy = Math.abs(py - (y + h / 2)) - h / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const circleSdf = (cx, cy, r) => (px, py) => Math.hypot(px - cx, py - cy) - r;
const polygonSdf = (points) => {
  const area = points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0);
  const edges = points.map(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    const length = Math.hypot(nx - x, ny - y);
    const sign = area > 0 ? 1 : -1;
    return [x, y, (sign * (ny - y)) / length, (sign * -(nx - x)) / length];
  });
  return (px, py) => Math.max(...edges.map(([x, y, ox, oy]) => (px - x) * ox + (py - y) * oy));
};

// A layer is a shape, a paint function (x, y, distance) => rgba, and an optional blur for soft shadows.
const layer = (sdf, box, paint, blur = 0) => ({ sdf, box, paint: typeof paint === "function" ? paint : () => paint, blur });
const vertical = (top, bottom, y0, y1) => (_x, y) => mix(top, bottom, (y - y0) / (y1 - y0));
// Raised edge: the top rim catches light and the bottom rim falls into shade.
const bevel = (base, y0, y1, width, light = 0.45, dark = 0.35) => (x, y, d) => {
  const rim = clamp01(1 + d / width) ** 1.6;
  const t = clamp01((y - y0) / (y1 - y0));
  const color = base(x, y, d);
  return mix(mix(color, [...WHITE.slice(0, 3), color[3]], rim * light * (1 - t)), [...BLACK.slice(0, 3), color[3]], rim * dark * t);
};
const shadow = (sdf, box, alpha, blur) => layer(sdf, box, [8, 14, 28, alpha], blur);
const expand = ([x0, y0, x1, y1], by) => [x0 - by, y0 - by, x1 + by, y1 + by];

function roundedBlock(x, y, w, h, r, top, bottom, options = {}) {
  const sdf = roundRectSdf(x, y, w, h, r);
  const box = [x, y, x + w, y + h];
  const layers = [];
  if (options.shadow) {
    const { dy, blur, alpha } = options.shadow;
    layers.push(shadow(roundRectSdf(x, y + dy, w, h, r), expand([x, y + dy, x + w, y + h + dy], blur * 2), alpha, blur));
  }
  layers.push(layer(sdf, box, bevel(vertical(top, bottom, y, y + h), y, y + h, options.rim ?? Math.min(w, h) * 0.12)));
  return layers;
}

// Shapes on a 1024 grid. Small sizes get a fuller tile, a coarser grid and no fine shadows so they stay legible.
function calendarShapes(size) {
  const small = size <= 48;
  const tiny = size <= 24;
  const layers = [];

  // Tile: deep navy with a soft drop shadow, bevelled rim and a glossy top.
  const margin = small ? 28 : 84;
  const tileW = 1024 - margin * 2;
  const tileH = tileW - (small ? 0 : 24);
  const tileR = small ? 190 : 196;
  const tileSdf = roundRectSdf(margin, margin, tileW, tileH, tileR);
  if (!small) layers.push(shadow(roundRectSdf(margin + 8, margin + 30, tileW - 16, tileH, tileR), [0, 0, 1024, 1024], 150, 36));
  const tileBase = (x, y) => {
    const linear = mix(hex("#3a5f96"), hex("#0d1729"), (y - margin) / tileH);
    // Light falls from the top-left.
    const glow = clamp01(1 - Math.hypot(x - margin - tileW * 0.25, y - margin - tileH * 0.15) / (tileW * 0.9));
    return mix(linear, hex("#5d86c4"), glow * 0.35);
  };
  layers.push(layer(tileSdf, [margin, margin, margin + tileW, margin + tileH], bevel(tileBase, margin, margin + tileH, small ? 46 : 30, 0.5, 0.5)));
  const glossSdf = circleSdf(512, margin - tileH * 1.05, tileH * 1.45);
  layers.push(
    layer(
      (x, y) => Math.max(tileSdf(x, y) + (small ? 26 : 14), glossSdf(x, y)),
      [margin, margin, margin + tileW, margin + tileH * 0.5],
      (_x, y) => [255, 255, 255, 70 * (1 - clamp01((y - margin) / (tileH * 0.42)))],
    ),
  );

  // Calendar page lifted off the tile.
  const inset = small ? 104 : 178;
  const pageTop = small ? 206 : 246;
  const pageW = 1024 - inset * 2;
  const pageH = margin + tileH - (small ? 76 : 96) - pageTop;
  const pageR = small ? 92 : 70;
  layers.push(shadow(roundRectSdf(inset + 6, pageTop + (small ? 24 : 34), pageW - 12, pageH, pageR), expand([inset, pageTop, inset + pageW, pageTop + pageH + 40], 80), small ? 110 : 140, small ? 22 : 30));
  const pageSdf = roundRectSdf(inset, pageTop, pageW, pageH, pageR);
  layers.push(layer(pageSdf, [inset, pageTop, inset + pageW, pageTop + pageH], bevel(vertical(hex("#ffffff"), hex("#d9e1ec"), pageTop, pageTop + pageH), pageTop, pageTop + pageH, small ? 30 : 18, 0.2, 0.3)));

  // Blue header with a gloss line, clipped to the page's top corners.
  const headerH = small ? 236 : 196;
  const headerBottom = pageTop + headerH;
  const headerSdf = (x, y) => Math.max(pageSdf(x, y), y - headerBottom);
  layers.push(layer(headerSdf, [inset, pageTop, inset + pageW, headerBottom], bevel(vertical(hex("#6aa3ff"), hex("#2b5fdc"), pageTop, headerBottom), pageTop, headerBottom + 200, small ? 28 : 16, 0.5, 0.1)));
  if (!tiny) {
    // The header casts a shadow onto the page below it.
    layers.push(
      layer(
        (x, y) => Math.max(pageSdf(x, y), headerBottom - y, y - headerBottom - 40),
        [inset, headerBottom, inset + pageW, headerBottom + 40],
        (_x, y) => [20, 40, 80, 70 * (1 - clamp01((y - headerBottom) / 36)) ** 2],
      ),
    );
  }

  // Binder rings: dark holes in the header and metal loops coming out of them.
  if (!small) {
    for (const cx of [352, 672]) {
      layers.push(layer(roundRectSdf(cx - 32, pageTop + 18, 64, 36, 18), [cx - 32, pageTop + 18, cx + 32, pageTop + 54], vertical(hex("#0f2a66"), hex("#2350b8"), pageTop + 18, pageTop + 54)));
      layers.push(shadow(roundRectSdf(cx - 22, 168 + 10, 44, 116, 22), [cx - 60, 150, cx + 60, 330], 120, 10));
      const metal = (x, y, d) => {
        const across = (x - (cx - 22)) / 44;
        const base = mix(mix(hex("#f7f9fc"), hex("#9aa6b8"), across * 1.2), hex("#6f7c90"), clamp01((across - 0.75) * 4));
        return mix(base, WHITE, clamp01(1 - Math.abs(across - 0.3) * 6) * 0.6 * clamp01(1 + d / 6));
      };
      layers.push(layer(roundRectSdf(cx - 22, 168, 44, 116, 22), [cx - 22, 168, cx + 22, 284], metal));
    }
  }

  // Day cells raised slightly off the page.
  const [rows, columns] = tiny ? [2, 3] : small ? [3, 4] : [5, 7];
  const gridTop = headerBottom + (small ? 66 : 42);
  const gridBottom = pageTop + pageH - (small ? 70 : 44);
  const padX = small ? 92 : 50;
  const gap = small ? 58 : 26;
  const cellW = (pageW - padX * 2 - gap * (columns - 1)) / columns;
  const cellH = Math.min(cellW, (gridBottom - gridTop - gap * (rows - 1)) / rows);
  const rowStep = rows > 1 ? (gridBottom - gridTop - cellH) / (rows - 1) : 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const holiday = column === 0 && row === (rows >= 3 ? 1 : 0);
      const today = rows > 2 && row === Math.floor(rows / 2) && column === Math.floor(columns / 2);
      const [top, bottom] = today
        ? [hex("#78adff"), hex("#2457d6")]
        : holiday
          ? [hex("#ff9a9a"), hex("#e0434b")]
          : [hex("#eef3f9"), hex("#c3cfdf")];
      const x = inset + padX + column * (cellW + gap);
      const y = gridTop + row * rowStep;
      layers.push(
        ...roundedBlock(x, y, cellW, cellH, cellW * 0.26, top, bottom, {
          rim: cellW * (small ? 0.22 : 0.16),
          shadow: small ? undefined : { dy: today || holiday ? 9 : 6, blur: today || holiday ? 9 : 6, alpha: today || holiday ? 120 : 70 },
        }),
      );
    }
  }
  return layers;
}

function installerShapes(size) {
  const layers = calendarShapes(size);
  const small = size <= 48;
  const r = small ? 232 : 196;
  const c = 1024 - r - (small ? 12 : 46);
  if (!small) layers.push(shadow(circleSdf(c + 4, c + 22, r + 26), expand([c - r, c - r, c + r, c + r], 80), 150, 26));
  // White rim, then a green glossy ball with the light from the top-left.
  const rimSdf = circleSdf(c, c, r + (small ? 34 : 26));
  layers.push(layer(rimSdf, expand([c - r, c - r, c + r, c + r], 40), bevel(vertical(hex("#ffffff"), hex("#cfd8e4"), c - r, c + r), c - r, c + r, 14, 0.2, 0.3)));
  const ball = (x, y) => {
    const light = clamp01(Math.hypot(x - (c - r * 0.35), y - (c - r * 0.4)) / (r * 1.5));
    return mix(hex("#7fe0ae"), hex("#157046"), light);
  };
  layers.push(layer(circleSdf(c, c, r), [c - r, c - r, c + r, c + r], ball));
  layers.push(
    layer(
      (x, y) => Math.max(circleSdf(c, c, r - 14)(x, y), circleSdf(c, c - r * 0.95, r * 1.25)(x, y)),
      [c - r, c - r, c + r, c],
      (_x, y) => [255, 255, 255, 90 * (1 - clamp01((y - (c - r)) / (r * 0.9)))],
    ),
  );
  // Down arrow with a soft shadow beneath it.
  const stem = r * 0.3;
  const arrow = (dy) => {
    const stemSdf = roundRectSdf(c - stem / 2, c - r * 0.58 + dy, stem, r * 0.62, stem * 0.3);
    const headSdf = polygonSdf([[c - r * 0.52, c - r * 0.04 + dy], [c + r * 0.52, c - r * 0.04 + dy], [c, c + r * 0.56 + dy]]);
    return (x, y) => Math.min(stemSdf(x, y), headSdf(x, y));
  };
  const arrowBox = [c - r * 0.6, c - r * 0.6, c + r * 0.6, c + r * 0.7];
  if (!small) layers.push(layer(arrow(14), expand(arrowBox, 30), [6, 60, 30, 110], 10));
  layers.push(layer(arrow(0), arrowBox, vertical(hex("#ffffff"), hex("#dfe8ef"), c - r * 0.6, c + r * 0.6)));
  return layers;
}

// Each pixel takes the shape's coverage from its distance to the edge: one pixel wide for crisp shapes,
// the blur radius for shadows.
function render(size, layers) {
  const scale = 1024 / size;
  const pixels = new Float64Array(size * size * 4);
  for (const { sdf, box, paint, blur } of layers) {
    const [x0, y0, x1, y1] = expand(box, blur * 2 + scale).map((v) => v / scale);
    const soft = Math.max(blur, scale * 0.5);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(size, Math.ceil(y1)); y += 1) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(size, Math.ceil(x1)); x += 1) {
        const px = (x + 0.5) * scale;
        const py = (y + 0.5) * scale;
        const d = sdf(px, py);
        const coverage = blur ? 1 - smoothstep(-soft, soft, d) : clamp01(0.5 - d / (scale * 1.0));
        if (coverage <= 0) continue;
        const color = paint(px, py, Math.min(d, 0));
        const alpha = coverage * (color[3] / 255);
        const i = (y * size + x) * 4;
        for (let k = 0; k < 3; k += 1) pixels[i + k] = color[k] * alpha + pixels[i + k] * (1 - alpha);
        pixels[i + 3] = alpha + pixels[i + 3] * (1 - alpha);
      }
    }
  }
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const a = pixels[i * 4 + 3];
    for (let k = 0; k < 3; k += 1) out[i * 4 + k] = a > 0 ? Math.round(Math.min(255, pixels[i * 4 + k] / a)) : 0;
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// ICO with BMP entries below 256px (understood by every Windows tool, NSIS included) and a PNG 256px entry.
// The first entry becomes the default window and tray icon, so 32px leads, like `tauri icon` does.
function encodeIco(draw) {
  const sizes = [32, 16, 20, 24, 40, 48, 64, 128, 256];
  const images = sizes.map((size) => {
    const rgba = render(size, draw(size));
    if (size >= 256) return encodePng(size, rgba);
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(size, 4);
    header.writeInt32LE(size * 2, 8);
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const xor = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const from = (y * size + x) * 4;
        const to = ((size - 1 - y) * size + x) * 4;
        xor[to] = rgba[from + 2];
        xor[to + 1] = rgba[from + 1];
        xor[to + 2] = rgba[from];
        xor[to + 3] = rgba[from + 3];
      }
    }
    const and = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
    header.writeUInt32LE(xor.length + and.length, 20);
    return Buffer.concat([header, xor, and]);
  });
  const directory = Buffer.alloc(6 + 16 * sizes.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    directory[entry] = size >= 256 ? 0 : size;
    directory[entry + 1] = size >= 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(images[index].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  return Buffer.concat([directory, ...images]);
}

fs.mkdirSync(assets, { recursive: true });
const appPng = encodePng(1024, render(1024, calendarShapes(1024)));
fs.writeFileSync(path.join(assets, "app.png"), appPng);
fs.writeFileSync(path.join(assets, "app.ico"), encodeIco(calendarShapes));
fs.writeFileSync(path.join(assets, "installer.png"), encodePng(1024, render(1024, installerShapes(1024))));
fs.writeFileSync(path.join(assets, "installer.ico"), encodeIco(installerShapes));
fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(path.join(root, "public", "favicon.png"), encodePng(128, render(128, calendarShapes(128))));
console.log("wrote assets/app.png, app.ico, installer.png, installer.ico");

if (!process.argv.includes("--assets-only")) {
  // PNG sizes and icon.icns for macOS/Linux; the exe and installer icons come from assets/ directly.
  execSync("npx tauri icon assets/app.png -o src-tauri/icons", { cwd: root, stdio: "inherit", shell: true });
  for (const name of ["icon.ico", "source.png"]) fs.rmSync(path.join(root, "src-tauri", "icons", name), { force: true });
}

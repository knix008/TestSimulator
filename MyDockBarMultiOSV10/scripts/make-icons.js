'use strict';

/**
 * Builds the application artwork from a single generated SVG:
 *
 *   build/icon.png          1024x1024 master (electron-builder derives .icns)
 *   build/icon.ico          multi-size Windows icon
 *   build/icon.svg          the source, for reference
 *   build/tray.png          16/32px tray icon (+ @2x)
 *   build/trayTemplate.png  macOS menu-bar template (monochrome)
 *   build/installerIcon.ico, build/installerHeader.bmp, build/installerSidebar.bmp
 *
 * The artwork is drawn with gradients only — no SVG filters — so every
 * rasteriser produces the same result.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default; // the package is ESM-first
const menuGlyphs = require('./menu-glyphs');

const OUT = path.join(__dirname, '..', 'build');
const SIZE = 1024;

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

const pts = (list) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
const round = (n) => Math.round(n * 100) / 100;

/**
 * An isometric cube standing on the point (cx, cy).
 * `a` is the half-width, `b` the depth foreshortening, `h` the body height.
 */
function cube(cx, cy, a, b, h, id, colors) {
  const topBack = [cx, cy - h - b];
  const topRight = [cx + a, cy - h];
  const topFront = [cx, cy - h + b];
  const topLeft = [cx - a, cy - h];
  const botFront = [cx, cy + b];
  const botRight = [cx + a, cy];
  const botLeft = [cx - a, cy];

  return `
  <g>
    <polygon points="${pts([topBack, topRight, topFront, topLeft])}" fill="url(#${id}Top)"/>
    <polygon points="${pts([topLeft, topFront, botFront, botLeft])}" fill="url(#${id}Left)"/>
    <polygon points="${pts([topFront, topRight, botRight, botFront])}" fill="url(#${id}Right)"/>
    <!-- specular streak along the top-left edge -->
    <polygon points="${pts([topLeft, topBack, [cx, cy - h - b + b * 0.34], [cx - a * 0.66, cy - h + b * 0.2]])}"
             fill="#ffffff" fill-opacity=".34"/>
    <polygon points="${pts([topLeft, [cx - a, cy], [cx - a + a * 0.2, cy - h * 0.1], [cx - a + a * 0.2, cy - h + b * 0.16]])}"
             fill="#ffffff" fill-opacity=".14"/>
    <polygon points="${pts([topLeft, topFront, botFront, botLeft])}" fill="url(#faceShade)"/>
  </g>`;
}

function cubeGradients(id, top, left, right) {
  return `
  <linearGradient id="${id}Top" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${top[0]}"/><stop offset="1" stop-color="${top[1]}"/>
  </linearGradient>
  <linearGradient id="${id}Left" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${left[0]}"/><stop offset="1" stop-color="${left[1]}"/>
  </linearGradient>
  <linearGradient id="${id}Right" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${right[0]}"/><stop offset="1" stop-color="${right[1]}"/>
  </linearGradient>`;
}

/* ------------------------------------------------------------------ *
 * The icon
 * ------------------------------------------------------------------ */

/**
 * The wordmark, extruded by stacking offset copies behind the front face.
 * Drawn with a common bold font stack so it rasterises the same way wherever
 * the build runs.
 */
function wordmark(text, cx, baseline, size, depth) {
  const layers = [];
  for (let i = depth; i >= 1; i -= 1) {
    const shade = Math.round(60 - (i / depth) * 28);
    layers.push(`<text x="${cx + i * 1.7}" y="${baseline + i * 1.7}" `
      + `font-family="Arial Black, Arial Bold, Arial, Helvetica, sans-serif" font-weight="900" `
      + `font-size="${size}" letter-spacing="2" text-anchor="middle" `
      + `fill="hsl(218,42%,${shade}%)">${text}</text>`);
  }

  // Front face, then a clipped highlight across its upper half.
  layers.push(`<text x="${cx}" y="${baseline}" `
    + `font-family="Arial Black, Arial Bold, Arial, Helvetica, sans-serif" font-weight="900" `
    + `font-size="${size}" letter-spacing="2" text-anchor="middle" fill="url(#wordFace)"/>`
    .replace('/>', `>${text}</text>`));

  layers.push(`<text x="${cx}" y="${baseline}" `
    + `font-family="Arial Black, Arial Bold, Arial, Helvetica, sans-serif" font-weight="900" `
    + `font-size="${size}" letter-spacing="2" text-anchor="middle" `
    + `fill="none" stroke="url(#wordRim)" stroke-width="2.5">${text}</text>`);

  return layers.join('\n  ');
}

function buildSvg() {
  // A shallow 3D room: back wall, a floor receding to a vanishing point, and
  // two side walls catching light at different angles.
  const room = {
    horizon: 404,
    backLeft: 268,
    backRight: 756,
    floorFront: 838,
  };

  const floor = pts([
    [room.backLeft, room.horizon],
    [room.backRight, room.horizon],
    [952, room.floorFront],
    [72, room.floorFront],
  ]);
  const wallLeft = pts([
    [72, 72], [room.backLeft, room.horizon],
    [room.backLeft, 72],
  ]);
  const wallRight = pts([
    [952, 72], [room.backRight, 72],
    [room.backRight, room.horizon],
  ]);

  // Floor grid lines converging on the vanishing point.
  const vanishX = 512;
  const grid = [];
  for (let i = -4; i <= 4; i += 1) {
    const backX = vanishX + i * 61;
    const frontX = vanishX + i * 190;
    grid.push(`<line x1="${backX}" y1="${room.horizon}" x2="${frontX}" y2="${room.floorFront}"/>`);
  }
  for (let i = 1; i <= 4; i += 1) {
    const tRow = i / 5;
    const y = room.horizon + (room.floorFront - room.horizon) * tRow * tRow;
    const half = 244 + (880 / 2 - 244) * tRow * tRow;
    grid.push(`<line x1="${vanishX - half}" y1="${y}" x2="${vanishX + half}" y2="${y}"/>`);
  }

  // Glass shelf, centred in the room and drawn in perspective.
  const plate = { cx: 512, backY: 540, frontY: 644, backHalf: 300, frontHalf: 372 };
  const plateTop = pts([
    [plate.cx - plate.backHalf, plate.backY],
    [plate.cx + plate.backHalf, plate.backY],
    [plate.cx + plate.frontHalf, plate.frontY],
    [plate.cx - plate.frontHalf, plate.frontY],
  ]);
  const plateEdge = pts([
    [plate.cx - plate.frontHalf, plate.frontY],
    [plate.cx + plate.frontHalf, plate.frontY],
    [plate.cx + plate.frontHalf - 6, plate.frontY + 46],
    [plate.cx - plate.frontHalf + 6, plate.frontY + 46],
  ]);

  const cubes = [
    { id: 'cA', cx: 340, cy: 564, a: 100, b: 50, h: 138 },
    { id: 'cB', cx: 512, cy: 588, a: 116, b: 57, h: 196 },
    { id: 'cC', cx: 684, cy: 564, a: 100, b: 50, h: 138 },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="wallBack" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2b3d8f"/>
    <stop offset="1" stop-color="#101838"/>
  </linearGradient>
  <linearGradient id="wallL" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#101a44"/>
    <stop offset="1" stop-color="#25357e"/>
  </linearGradient>
  <linearGradient id="wallR" x1="1" y1="0" x2="0" y2="0">
    <stop offset="0" stop-color="#0c1332"/>
    <stop offset="1" stop-color="#1d2b69"/>
  </linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1b2a6e"/>
    <stop offset=".55" stop-color="#16204f"/>
    <stop offset="1" stop-color="#080c20"/>
  </linearGradient>

  <radialGradient id="roomGlow" cx=".5" cy=".42" r=".62">
    <stop offset="0" stop-color="#9fc4ff" stop-opacity=".45"/>
    <stop offset="1" stop-color="#9fc4ff" stop-opacity="0"/>
  </radialGradient>

  <linearGradient id="bgSheen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".30"/>
    <stop offset=".42" stop-color="#ffffff" stop-opacity=".04"/>
    <stop offset=".43" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>

  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".85"/>
    <stop offset=".5" stop-color="#ffffff" stop-opacity=".12"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity=".32"/>
  </linearGradient>

  <linearGradient id="plateTopG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cfe2ff" stop-opacity=".50"/>
    <stop offset=".55" stop-color="#8fb4f0" stop-opacity=".28"/>
    <stop offset="1" stop-color="#dcebff" stop-opacity=".44"/>
  </linearGradient>
  <linearGradient id="plateEdgeG" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".70"/>
    <stop offset=".35" stop-color="#7ea3e0" stop-opacity=".40"/>
    <stop offset="1" stop-color="#121a3c" stop-opacity=".66"/>
  </linearGradient>

  <radialGradient id="contact" cx=".5" cy=".5" r=".5">
    <stop offset="0" stop-color="#03060f" stop-opacity=".66"/>
    <stop offset="1" stop-color="#03060f" stop-opacity="0"/>
  </radialGradient>

  <linearGradient id="faceShade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000000" stop-opacity=".18"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0"/>
  </linearGradient>

  <linearGradient id="mirror" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".28"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>

  <linearGradient id="wordFace" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset=".46" stop-color="#dbe8ff"/>
    <stop offset=".54" stop-color="#9dbaf0"/>
    <stop offset="1" stop-color="#ffffff"/>
  </linearGradient>
  <linearGradient id="wordRim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".95"/>
    <stop offset="1" stop-color="#5f7fc4" stop-opacity=".55"/>
  </linearGradient>

  ${cubeGradients('cA', ['#ffd487', '#ffb13d'], ['#f08a12', '#c96a05'], ['#d97a08', '#a05403'])}
  ${cubeGradients('cB', ['#a8ecff', '#4fc9f2'], ['#1c9fd6', '#0d76a8'], ['#127fb4', '#0a5c85'])}
  ${cubeGradients('cC', ['#e3c9ff', '#b98cff'], ['#8a55e8', '#6335bf'], ['#7343cf', '#4d2699'])}

  <clipPath id="badge">
    <rect x="72" y="72" width="880" height="880" rx="210" ry="210"/>
  </clipPath>
</defs>

<ellipse cx="512" cy="948" rx="392" ry="52" fill="#000000" opacity=".28"/>

<g clip-path="url(#badge)">
  <!-- the room -->
  <rect x="72" y="72" width="880" height="880" fill="url(#wallBack)"/>
  <polygon points="${wallLeft}" fill="url(#wallL)"/>
  <polygon points="${wallRight}" fill="url(#wallR)"/>
  <polygon points="${floor}" fill="url(#floorG)"/>
  <g stroke="#7fa6ff" stroke-opacity=".20" stroke-width="2">
    ${grid.join('\n    ')}
  </g>
  <rect x="72" y="72" width="880" height="880" fill="url(#roomGlow)"/>

  <!-- contact shadows sit on the floor, under the cubes -->
  <ellipse cx="340" cy="574" rx="132" ry="37" fill="url(#contact)"/>
  <ellipse cx="684" cy="574" rx="132" ry="37" fill="url(#contact)"/>
  <ellipse cx="512" cy="600" rx="158" ry="45" fill="url(#contact)"/>

  ${cubes.map((c) => cube(c.cx, c.cy, c.a, c.b, c.h, c.id)).join('\n')}

  <!-- glass shelf in front of the cubes -->
  <polygon points="${plateTop}" fill="url(#plateTopG)"/>
  <polygon points="${plateTop}" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="3"/>
  <polygon points="${plateEdge}" fill="url(#plateEdgeG)"/>
  <polygon points="${plateEdge}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="2"/>

  <g opacity=".5">
    <polygon points="${pts([[340, 574], [424, 596], [340, 622], [256, 596]])}" fill="url(#mirror)"/>
    <polygon points="${pts([[512, 598], [610, 624], [512, 656], [414, 624]])}" fill="url(#mirror)"/>
    <polygon points="${pts([[684, 574], [768, 596], [684, 622], [600, 596]])}" fill="url(#mirror)"/>
  </g>

  <!-- wordmark -->
  <!-- The extrusion grows down-right, so the anchor shifts back by half of
       it to keep the finished word optically centred. -->
  ${wordmark('Dock', 512 - (9 * 1.7) / 2, 812, 152, 9)}

  <rect x="72" y="72" width="880" height="880" fill="url(#bgSheen)"/>
</g>

<rect x="72" y="72" width="880" height="880" rx="210" ry="210"
      fill="none" stroke="url(#rim)" stroke-width="7"/>
<rect x="82" y="82" width="860" height="860" rx="202" ry="202"
      fill="none" stroke="#ffffff" stroke-opacity=".10" stroke-width="3"/>
</svg>`;
}

/** Flat monochrome silhouette for the macOS menu bar. */
function buildTemplateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="#000000">
    <rect x="4" y="40" width="56" height="12" rx="6"/>
    <rect x="12" y="20" width="12" height="16" rx="3"/>
    <rect x="26" y="12" width="12" height="24" rx="3"/>
    <rect x="40" y="20" width="12" height="16" rx="3"/>
  </g>
</svg>`;
}

/* ------------------------------------------------------------------ *
 * Rasterising
 * ------------------------------------------------------------------ */

async function png(svg, size, target) {
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(target);
  return target;
}

/**
 * electron-builder's NSIS header/sidebar art must be 24-bit BMP, which sharp
 * cannot write, so the few bytes of BITMAPINFOHEADER are assembled here.
 */
function encodeBmp24(raw, width, height, channels) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowSize * height);
  const stride = width * channels;

  for (let y = 0; y < height; y += 1) {
    const src = y * stride;
    const dst = (height - 1 - y) * rowSize; // BMP rows run bottom-up
    for (let x = 0; x < width; x += 1) {
      const s = src + x * channels;
      pixels[dst + x * 3] = raw[s + 2];     // B
      pixels[dst + x * 3 + 1] = raw[s + 1]; // G
      pixels[dst + x * 3 + 2] = raw[s];     // R
    }
  }

  const header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);        // pixel data offset
  header.writeUInt32LE(40, 14);        // BITMAPINFOHEADER size
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);         // planes
  header.writeUInt16LE(24, 28);        // bits per pixel
  header.writeUInt32LE(pixels.length, 34);
  header.writeInt32LE(2835, 38);       // 72 dpi
  header.writeInt32LE(2835, 42);

  return Buffer.concat([header, pixels]);
}

/**
 * @param {object} layout
 * @param {string} [layout.backdrop] SVG painted behind the badge
 * @param {number} layout.badge      badge edge length in px
 * @param {number} layout.left       badge position
 * @param {number} layout.top
 */
async function bmp(svg, width, height, target, background, layout) {
  const badgeSize = layout.badge;
  const badge = await sharp(Buffer.from(svg))
    .resize(badgeSize, badgeSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const layers = [];
  if (layout.backdrop) {
    layers.push({ input: Buffer.from(layout.backdrop), left: 0, top: 0 });
  }
  layers.push({ input: badge, left: layout.left, top: layout.top });

  // Compositing an image that has alpha makes sharp emit RGBA even when the
  // canvas was created with 3 channels, so the alpha is flattened away here
  // rather than left for the encoder to mis-stride.
  const { data, info } = await sharp({ create: { width, height, channels: 3, background } })
    .composite(layers)
    .flatten({ background })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (data.length !== info.width * info.height * info.channels) {
    throw new Error(`unexpected raw buffer for ${target}: ${data.length} bytes for `
      + `${info.width}x${info.height}x${info.channels}`);
  }

  fs.writeFileSync(target, encodeBmp24(data, info.width, info.height, info.channels));
  return target;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const svg = buildSvg();
  fs.writeFileSync(path.join(OUT, 'icon.svg'), svg, 'utf8');

  await png(svg, 1024, path.join(OUT, 'icon.png'));

  // Windows .ico: the sizes Explorer actually asks for.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoParts = [];
  for (const size of icoSizes) {
    const file = path.join(OUT, `.ico-${size}.png`);
    await png(svg, size, file);
    icoParts.push(file);
  }
  fs.writeFileSync(path.join(OUT, 'icon.ico'), await pngToIco(icoParts));
  fs.copyFileSync(path.join(OUT, 'icon.ico'), path.join(OUT, 'installerIcon.ico'));
  fs.copyFileSync(path.join(OUT, 'icon.ico'), path.join(OUT, 'uninstallerIcon.ico'));
  for (const file of icoParts) fs.unlinkSync(file);

  // Linux needs a directory of sized PNGs for the .desktop icon theme.
  const iconsDir = path.join(OUT, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    await png(svg, size, path.join(iconsDir, `${size}x${size}.png`));
  }

  // Tray.
  await png(svg, 16, path.join(OUT, 'tray.png'));
  await png(svg, 32, path.join(OUT, 'tray@2x.png'));

  const templateSvg = buildTemplateSvg();
  await png(templateSvg, 16, path.join(OUT, 'trayTemplate.png'));
  await png(templateSvg, 32, path.join(OUT, 'trayTemplate@2x.png'));

  // Native menu icons: every menu item carries one. Electron picks up the
  // @2x variant automatically for HiDPI displays.
  const menuDir = path.join(OUT, 'menu');
  fs.mkdirSync(menuDir, { recursive: true });
  for (const name of menuGlyphs.NAMES) {
    const glyph = menuGlyphs.svg(name);
    await png(glyph, 16, path.join(menuDir, `${name}.png`));
    await png(glyph, 32, path.join(menuDir, `${name}@2x.png`));
  }
  console.log(`  ${menuGlyphs.NAMES.length} menu glyphs`);

  // NSIS installer artwork. The MUI header strip sits on a white page, so it
  // gets a white background with the badge tucked against the right edge; the
  // welcome/finish sidebar is a full-bleed panel and gets the dark gradient.
  await bmp(svg, 150, 57, path.join(OUT, 'installerHeader.bmp'),
    { r: 255, g: 255, b: 255 },
    { badge: 44, left: 150 - 44 - 7, top: Math.round((57 - 44) / 2) });

  const sidebarBackdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#3f5bd6"/>
        <stop offset=".45" stop-color="#222d6e"/>
        <stop offset="1" stop-color="#0d1129"/>
      </linearGradient>
      <radialGradient id="glow" cx=".5" cy=".3" r=".62">
        <stop offset="0" stop-color="#9fc4ff" stop-opacity=".32"/>
        <stop offset="1" stop-color="#9fc4ff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="164" height="314" fill="url(#g)"/>
    <rect width="164" height="314" fill="url(#glow)"/>
    <ellipse cx="82" cy="232" rx="62" ry="10" fill="#000000" opacity=".28"/>
  </svg>`;

  await bmp(svg, 164, 314, path.join(OUT, 'installerSidebar.bmp'),
    { r: 13, g: 17, b: 41 },
    { backdrop: sidebarBackdrop, badge: 124, left: 20, top: 96 });

  fs.copyFileSync(path.join(OUT, 'installerSidebar.bmp'), path.join(OUT, 'uninstallerSidebar.bmp'));

  console.log(`Icons written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

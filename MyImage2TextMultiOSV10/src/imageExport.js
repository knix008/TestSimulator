import { isBlankGlyph } from './plainText.js';
import { layoutAspect } from './render.js';

export const IMAGE_FORMATS = [
  { id: 'png', label: 'PNG', extension: 'png', mime: 'image/png', encoder: 'canvas', hint: 'fmtPng' },
  { id: 'jpeg', label: 'JPEG', extension: 'jpg', extensions: ['jpg', 'jpeg'], mime: 'image/jpeg', encoder: 'canvas', quality: 0.92, hint: 'fmtJpeg' },
  { id: 'webp', label: 'WebP', extension: 'webp', mime: 'image/webp', encoder: 'canvas', quality: 0.92, hint: 'fmtWebp' },
  { id: 'bmp', label: 'BMP', extension: 'bmp', mime: 'image/bmp', encoder: 'bmp', hint: 'fmtBmp' },
  { id: 'tiff', label: 'TIFF', extension: 'tif', extensions: ['tif', 'tiff'], mime: 'image/tiff', encoder: 'tiff', hint: 'fmtTiff' },
  { id: 'svg', label: 'SVG', extension: 'svg', mime: 'image/svg+xml', encoder: 'svg', hint: 'fmtSvg' },
];

export function imageFormat(id) {
  return IMAGE_FORMATS.find((format) => format.id === id) ?? null;
}

const DPI_72_PER_METER = 2835;

export function encodeBmp(rgba, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const bytes = new Uint8Array(54 + rowSize * height);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowSize * height, true);
  view.setInt32(38, DPI_72_PER_METER, true);
  view.setInt32(42, DPI_72_PER_METER, true);
  for (let y = 0; y < height; y += 1) {
    const row = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = row + x * 3;
      bytes[target] = rgba[source + 2];
      bytes[target + 1] = rgba[source + 1];
      bytes[target + 2] = rgba[source];
    }
  }
  return bytes;
}

export function encodeTiff(rgba, width, height) {
  const entries = 12;
  const ifd = 8;
  const bitsAt = ifd + 2 + entries * 12 + 4;
  const xResAt = bitsAt + 6;
  const yResAt = xResAt + 8;
  const dataAt = yResAt + 8;
  const dataSize = width * height * 3;
  const bytes = new Uint8Array(dataAt + dataSize);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0], 0);
  view.setUint32(4, ifd, true);
  view.setUint16(ifd, entries, true);

  const SHORT = 3;
  const LONG = 4;
  const RATIONAL = 5;
  let at = ifd + 2;
  const tag = (id, type, count, value) => {
    view.setUint16(at, id, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    if (type === SHORT && count === 1) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
    at += 12;
  };
  tag(256, LONG, 1, width);
  tag(257, LONG, 1, height);
  tag(258, SHORT, 3, bitsAt);
  tag(259, SHORT, 1, 1);
  tag(262, SHORT, 1, 2);
  tag(273, LONG, 1, dataAt);
  tag(277, SHORT, 1, 3);
  tag(278, LONG, 1, height);
  tag(279, LONG, 1, dataSize);
  tag(282, RATIONAL, 1, xResAt);
  tag(283, RATIONAL, 1, yResAt);
  tag(296, SHORT, 1, 2);
  view.setUint32(at, 0, true);

  for (let index = 0; index < 3; index += 1) view.setUint16(bitsAt + index * 2, 8, true);
  for (const offset of [xResAt, yResAt]) {
    view.setUint32(offset, 72, true);
    view.setUint32(offset + 4, 1, true);
  }
  for (let pixel = 0, target = dataAt; pixel < width * height; pixel += 1, target += 3) {
    bytes[target] = rgba[pixel * 4];
    bytes[target + 1] = rgba[pixel * 4 + 1];
    bytes[target + 2] = rgba[pixel * 4 + 2];
  }
  return bytes;
}

export function toSvg(result, { background = '#121418', ink = '#f3f1ea', cellWidth = 10 } = {}) {
  const lines = result.text.split('\n');
  const rows = result.edited ? Math.max(1, lines.length) : result.rows;
  const cols = result.edited ? Math.max(1, ...lines.map((line) => Array.from(line).length)) : result.cols;
  const width = cols * cellWidth;
  const height = round(width / layoutAspect(result));
  const cellHeight = height / rows;
  const useColor = Boolean(result.colors) && !result.edited;
  const fontSize = round(Math.min(cellHeight, cellWidth / 0.6));

  const body = [];
  for (let row = 0; row < rows; row += 1) {
    const glyphs = Array.from(lines[row] ?? '');
    const y = round(row * cellHeight + cellHeight * 0.8);
    const spans = [];
    for (let col = 0; col < glyphs.length && col < cols; col += 1) {
      const glyph = glyphs[col];
      if (isBlankGlyph(glyph)) continue;
      const x = round(col * cellWidth + cellWidth / 2);
      let fill = '';
      if (useColor) {
        const index = (row * result.cols + col) * 3;
        fill = ` fill="${hex(result.colors[index], result.colors[index + 1], result.colors[index + 2])}"`;
      }
      spans.push(`<tspan x="${x}"${fill}>${escapeXml(glyph)}</tspan>`);
    }
    if (spans.length) body.push(`<text y="${y}">${spans.join('')}</text>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="${background}"/>
<g font-family="${escapeXml(result.fontFamily)}" font-size="${fontSize}" text-anchor="middle" fill="${ink}" xml:space="preserve">
${body.join('\n')}
</g>
</svg>
`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function hex(red, green, blue) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

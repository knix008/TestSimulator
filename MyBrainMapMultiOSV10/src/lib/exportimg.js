// The map as a picture: the same layout and SVG the canvas draws, as a
// standalone SVG document, or rasterized on a canvas (PNG, JPEG — PDF pages
// and the Word export embed those).
import { layoutMap } from './layout.js';
import { resolveMapStyle } from './mapstyles.js';
import { renderMapSvg } from './render.js';
import { measureText, themeTokens } from './measure.js';
import { mapTitle } from './model.js';

export function mapPicture(map, { lang = 'ko', settings = {}, padding = 40, transparent = false, box = null } = {}) {
  const ms = resolveMapStyle(map, themeTokens());
  const L = layoutMap(map, { ms, measure: measureText, lang, baseSize: Number(settings.mapFontSize) || 14, mapFont: settings.mapFont || '', autoBalance: settings.autoBalance !== false });
  const pic = renderMapSvg(map, L, ms, { padding, transparent, measure: measureText, title: mapTitle(map), box });
  return { ...pic, ms, L };
}

// The smallest box (in pixels, inclusive) that holds every pixel something was drawn on
// (alpha > 0) of RGBA pixel data; null when nothing was drawn.
export function paintedBox(data, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    let first = -1, last = -1;
    for (let x = 0; x < width; x++) if (data[row + x * 4 + 3]) { first = x; break; }
    if (first < 0) continue;
    for (let x = width - 1; x >= first; x--) if (data[row + x * 4 + 3]) { last = x; break; }
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// The map picture framed to its shapes: every shape, line, label and shadow on it, with `margin`
// px of room all round (0: flush). The layout's bounds are only an estimate, so the map is drawn once
// with room to spare on a transparent canvas and the picture is framed to the drawn pixels.
export async function tightPicture(map, { lang = 'ko', settings = {}, margin = 20, transparent = false } = {}) {
  const probe = mapPicture(map, { lang, settings, padding: 60, transparent: true });
  let box = null;
  try {
    const canvas = await svgToCanvas(probe.svg, probe.width, probe.height, 1, null);
    const k = canvas.width / probe.width;
    const px = paintedBox(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    const vb = probe.viewBox;
    if (px) box = { x0: vb.x + px.x0 / k, y0: vb.y + px.y0 / k, x1: vb.x + (px.x1 + 1) / k, y1: vb.y + (px.y1 + 1) / k };
  } catch { /* no pixels to read: the layout's bounds */ }
  return mapPicture(map, { lang, settings, padding: margin, transparent, box });
}

// Whether this engine's canvas can write WebP (Chromium can; WebKit writes PNG instead).
let webp = null;
export function canWriteWebp() {
  if (webp === null) {
    try { const c = document.createElement('canvas'); c.width = c.height = 1; webp = c.toDataURL('image/webp').startsWith('data:image/webp'); } catch { webp = false; }
  }
  return webp;
}

const MAX_SIDE = 16000;
const MAX_AREA = 120e6;

// A scale that keeps the canvas inside what browsers can allocate.
export function safeScale(width, height, scale) {
  let s = Math.max(0.1, Number(scale) || 1);
  s = Math.min(s, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_AREA / (width * height)));
  return s;
}

export function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The map picture could not be drawn'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function svgToCanvas(svg, width, height, scale = 1, background = null) {
  const s = safeScale(width, height, scale);
  const img = await svgToImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * s));
  canvas.height = Math.max(1, Math.round(height * s));
  const g = canvas.getContext('2d');
  if (background) { g.fillStyle = background; g.fillRect(0, 0, canvas.width, canvas.height); }
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function canvasBytes(canvas, type = 'image/png', quality = 0.92) {
  const blob = await canvasBlob(canvas, type, quality);
  // an engine that cannot write the type quietly writes PNG instead: not under the wrong name
  if (!blob || (type && blob.type && blob.type !== type)) throw new Error(`This system cannot write ${type} pictures`);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function mapPngDataUrl(map, opts = {}) {
  const pic = await tightPicture(map, { ...opts, margin: opts.margin ?? opts.padding ?? 20 });
  const canvas = await svgToCanvas(pic.svg, pic.width, pic.height, opts.scale || 2, opts.transparent ? null : pic.ms.bg);
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, canvas };
}

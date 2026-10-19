// The map as a picture: the same layout and SVG the canvas draws, as a
// standalone SVG document, or rasterized on a canvas (PNG, JPEG — PDF pages
// and the Word export embed those).
import { layoutMap } from './layout.js';
import { resolveMapStyle } from './mapstyles.js';
import { renderMapSvg } from './render.js';
import { measureText, themeTokens } from './measure.js';
import { mapTitle } from './model.js';

export function mapPicture(map, { lang = 'ko', settings = {}, padding = 40, transparent = false } = {}) {
  const ms = resolveMapStyle(map, themeTokens());
  const L = layoutMap(map, { ms, measure: measureText, lang, baseSize: Number(settings.mapFontSize) || 14, mapFont: settings.mapFont || '', autoBalance: settings.autoBalance !== false });
  const pic = renderMapSvg(map, L, ms, { padding, transparent, measure: measureText, title: mapTitle(map) });
  return { ...pic, ms, L };
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
  return new Uint8Array(await blob.arrayBuffer());
}

export async function mapPngDataUrl(map, opts = {}) {
  const pic = mapPicture(map, opts);
  const canvas = await svgToCanvas(pic.svg, pic.width, pic.height, opts.scale || 2, opts.transparent ? null : pic.ms.bg);
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, canvas };
}

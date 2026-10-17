// A piece of the picture the user copies or cuts out of the editor.
// The shape is stored as fractions of the picture as it is shown (after crop
// and rotation). Copy keeps those pixels on the system clipboard as a PNG.
// Cut does the same and then clears them, so the hole is part of the edit.
import { selectionMask } from './background.js';

const BOX = new Set(['rect', 'ellipse', 'circle']);
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** One stored shape, or null when it does not cover the picture. */
export function normalizeSnip(selection) {
  if (!selection || typeof selection !== 'object') return null;
  if (BOX.has(selection.kind)) {
    const x = num(selection.x);
    const y = num(selection.y);
    const w = num(selection.w);
    const h = num(selection.h);
    if (!(w > 0.005) || !(h > 0.005)) return null;
    if (x >= 1 || y >= 1 || x + w <= 0 || y + h <= 0) return null;
    return { kind: selection.kind, x, y, w, h };
  }
  if (selection.kind === 'free' && Array.isArray(selection.points)) {
    const points = [];
    for (const point of selection.points) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const x = num(point[0]);
      const y = num(point[1]);
      if (x < -1 || x > 2 || y < -1 || y > 2) continue;
      points.push([x, y]);
    }
    if (points.length < 3) return null;
    return { kind: 'free', points };
  }
  return null;
}

/** Every cut that still covers the picture. */
export function normalizeSnips(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const snip = normalizeSnip(item);
    if (snip) out.push(snip);
  }
  return out;
}

function ellipseBox(selection, width, height) {
  let x = selection.x * width;
  let y = selection.y * height;
  let w = selection.w * width;
  let h = selection.h * height;
  // A circle stays round in pixels even when the stored box is not square.
  if (selection.kind === 'circle') {
    const side = Math.min(w, h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    x = cx - side / 2;
    y = cy - side / 2;
    w = side;
    h = side;
  }
  return { x, y, w, h };
}

function ellipseMask(width, height, selection) {
  const mask = new Uint8Array(width * height);
  const { x: x0, y: y0, w, h } = ellipseBox(selection, width, height);
  const rx = w / 2;
  const ry = h / 2;
  if (rx < 0.5 || ry < 0.5) return mask;
  const cx = x0 + rx;
  const cy = y0 + ry;
  const yStart = Math.max(0, Math.floor(y0));
  const yEnd = Math.min(height, Math.ceil(y0 + h));
  const xStart = Math.max(0, Math.floor(x0));
  const xEnd = Math.min(width, Math.ceil(x0 + w));
  for (let y = yStart; y < yEnd; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const dy2 = dy * dy;
    if (dy2 > 1) continue;
    for (let x = xStart; x < xEnd; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (dx * dx + dy2 <= 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/** 1 for every pixel inside the shape. */
export function snipMask(width, height, selection) {
  const snip = normalizeSnip(selection);
  if (!snip) return new Uint8Array(width * height);
  if (snip.kind === 'rect') {
    return selectionMask(width, height, { kind: 'rect', x: snip.x * width, y: snip.y * height, w: snip.w * width, h: snip.h * height });
  }
  if (snip.kind === 'free') {
    return selectionMask(width, height, { kind: 'free', points: snip.points.map(([x, y]) => [x * width, y * height]) });
  }
  return ellipseMask(width, height, snip);
}

/** The selected pixels, cropped to their box. Outside the shape is transparent. */
export function extractSnip(image, selection) {
  const mask = snipMask(image.width, image.height, selection);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % image.width;
    const y = (i - x) / image.width;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < minX) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const data = new Uint8ClampedArray(width * height * 4);
  const src = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x + minX;
      const sy = y + minY;
      if (!mask[sy * image.width + sx]) continue;
      const from = (sy * image.width + sx) * 4;
      const to = (y * width + x) * 4;
      data[to] = src[from];
      data[to + 1] = src[from + 1];
      data[to + 2] = src[from + 2];
      data[to + 3] = src[from + 3];
    }
  }
  return { width, height, data };
}

/** Clears the alpha of every pixel inside any of the cuts. */
export function applySnips(image, snips) {
  const list = normalizeSnips(snips);
  if (!list.length) return image;
  const data = new Uint8ClampedArray(image.data);
  for (const snip of list) {
    const mask = snipMask(image.width, image.height, snip);
    for (let i = 0; i < mask.length; i++) if (mask[i]) data[i * 4 + 3] = 0;
  }
  return { width: image.width, height: image.height, data };
}

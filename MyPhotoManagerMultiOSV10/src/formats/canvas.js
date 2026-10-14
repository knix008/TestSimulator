// Canvas helpers that work in the page and in workers (OffscreenCanvas).
import { drawOriented, swapsAxes } from './orientation.js';

export function makeCanvas(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export const context2d = (canvas, options) => canvas.getContext('2d', { willReadFrequently: false, ...options });

/** Canvas holding `source` turned upright for an EXIF orientation. */
export function orientedCanvas(source, width, height, orientation) {
  const swap = swapsAxes(orientation);
  const canvas = makeCanvas(swap ? height : width, swap ? width : height);
  drawOriented(context2d(canvas), source, width, height, orientation);
  return canvas;
}

/** Canvas of at most `max` pixels on the long side (never enlarged). */
export function scaledCanvas(source, width, height, max) {
  const k = Math.min(1, max / Math.max(width, height));
  const canvas = makeCanvas(width * k, height * k);
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // Large reductions in steps of 1/2 keep detail (one big step aliases).
  let current = source;
  let cw = width;
  let ch = height;
  while (width * k < cw / 2.5) {
    const step = makeCanvas(cw / 2, ch / 2);
    const stepContext = context2d(step);
    stepContext.imageSmoothingQuality = 'high';
    stepContext.drawImage(current, 0, 0, step.width, step.height);
    current = step;
    cw = step.width;
    ch = step.height;
  }
  context.drawImage(current, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasFromImageData({ width, height, data }) {
  const canvas = makeCanvas(width, height);
  const image = new ImageData(data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data.buffer ?? data), width, height);
  context2d(canvas).putImageData(image, 0, 0);
  return canvas;
}

/** Blob of a canvas in either kind of canvas. */
export function canvasToBlob(canvas, type = 'image/png', quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encoding failed'))), type, quality));
}

// Histogram drawing (R, G, B overlaid, luminance outline).
import { histogram } from '../edit/adjust.js';

export function drawHistogram(canvas, hist) {
  const context = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  context.clearRect(0, 0, w, h);
  if (!hist) return;
  const max = Math.max(1, ...[hist.r, hist.g, hist.b].map((channel) => {
    // Ignore the extreme bins so clipped blacks/whites do not flatten the rest.
    let m = 0;
    for (let i = 1; i < 255; i++) m = Math.max(m, channel[i]);
    return m;
  }));
  context.globalCompositeOperation = 'lighter';
  for (const [channel, color] of [[hist.r, 'rgba(230,60,60,0.75)'], [hist.g, 'rgba(60,200,80,0.75)'], [hist.b, 'rgba(70,110,240,0.75)']]) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, h);
    for (let i = 0; i < 256; i++) context.lineTo((i / 255) * w, h - Math.min(1, channel[i] / max) * (h - 2));
    context.lineTo(w, h);
    context.closePath();
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';
  context.strokeStyle = 'rgba(255,255,255,0.7)';
  context.lineWidth = 1;
  context.beginPath();
  for (let i = 0; i < 256; i++) {
    const y = h - Math.min(1, hist.l[i] / max) * (h - 2);
    if (i) context.lineTo((i / 255) * w, y); else context.moveTo(0, y);
  }
  context.stroke();
}

/** Histogram of an <img>/<canvas>/bitmap, measured on a small copy. */
export function histogramOf(source, size = 256) {
  const w = source.naturalWidth ?? source.width;
  const hgt = source.naturalHeight ?? source.height;
  if (!w || !hgt) return null;
  const k = Math.min(1, size / Math.max(w, hgt));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(hgt * k));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  try {
    return histogram(context.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    return null;
  }
}

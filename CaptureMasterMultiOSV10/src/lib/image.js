// Image helpers: decoding, encoding, cropping, byte/data-URL conversion.

const imageCache = new Map();   // dataUrl -> HTMLImageElement (decoded)
const CACHE_LIMIT = 24;

/** Decodes a data URL (or any URL) into an <img>, cached by URL. */
export function loadImage(src) {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (imageCache.size >= CACHE_LIMIT) imageCache.delete(imageCache.keys().next().value);
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('The image could not be decoded.'));
    img.src = src;
  });
}

export function cachedImage(src) { return imageCache.get(src) || null; }

export function bytesToDataUrl(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read image bytes.'));
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBytes(dataUrl) {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

export function mimeForExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    webm: 'video/webm', mp4: 'video/mp4', mkv: 'video/x-matroska', ogg: 'video/ogg',
  }[e] || 'application/octet-stream';
}

/** Any raster → PNG data URL with its size (the canonical form documents keep). */
export async function normalizeToPng(dataUrl) {
  const img = await loadImage(dataUrl);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return { dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height };
}

export async function cropImage(dataUrl, rect) {
  const img = await loadImage(dataUrl);
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const w = Math.max(1, Math.min(img.naturalWidth - x, Math.round(rect.w)));
  const h = Math.max(1, Math.min(img.naturalHeight - y, Math.round(rect.h)));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  return { dataUrl: c.toDataURL('image/png'), width: w, height: h };
}

/** Encodes a canvas as the given format. BMP is written by hand (browsers do not encode it). */
export function canvasToBlob(canvas, mime, quality) {
  if (mime === 'image/bmp') return Promise.resolve(encodeBmp(canvas));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed for ' + mime))), mime, quality);
  });
}

function encodeBmp(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, w, h);
  const rowBytes = w * 4;
  const size = 54 + rowBytes * h;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint8(0, 0x42); v.setUint8(1, 0x4d);
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, -h, true);            // top-down
  v.setUint16(26, 1, true);
  v.setUint16(28, 32, true);           // BGRA
  v.setUint32(34, rowBytes * h, true);
  const out = new Uint8Array(buf, 54);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = data[i * 4 + 2];
    out[i * 4 + 1] = data[i * 4 + 1];
    out[i * 4 + 2] = data[i * 4];
    out[i * 4 + 3] = data[i * 4 + 3];
  }
  return new Blob([buf], { type: 'image/bmp' });
}

/** Grabs one frame from a MediaStream video track at its native size. */
export function grabFrameFromStream(stream, { timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    let done = false;
    const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); video.pause(); video.srcObject = null; fn(); };
    const timer = setTimeout(() => finish(() => reject(new Error('Timed out waiting for the first video frame.'))), timeoutMs);
    const capture = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) { requestAnimationFrame(capture); return; }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(video, 0, 0, w, h);
      finish(() => resolve({ dataUrl: c.toDataURL('image/png'), width: w, height: h }));
    };
    video.onloadeddata = () => {
      // One more frame so the compositor has delivered real pixels.
      if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => capture());
      else setTimeout(capture, 120);
    };
    video.onerror = () => finish(() => reject(new Error('The capture stream could not be played.')));
    video.play().catch((err) => finish(() => reject(err)));
  });
}

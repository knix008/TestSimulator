/* Thumbnail worker: decode + downscale + JPEG-encode off the UI thread.
   In:  { id, bytes: ArrayBuffer, type, size }   (size = longest edge of the thumbnail)
   Out: { id, ok: true, w, h, tw, th, jpeg: ArrayBuffer } | { id, ok: false, error } */
'use strict';

self.onmessage = async (e) => {
  const { id, bytes, type, size } = e.data || {};
  try {
    // EXIF orientation is applied by createImageBitmap ("from-image" is the default)
    const bmp = await createImageBitmap(new Blob([bytes], { type: type || '' }));
    const w = bmp.width, h = bmp.height;
    if (!w || !h) throw new Error('empty image');
    const k = Math.min(1, size / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * k));
    const th = Math.max(1, Math.round(h * k));
    const canvas = new OffscreenCanvas(tw, th);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, tw, th);
    bmp.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
    const jpeg = await blob.arrayBuffer();
    self.postMessage({ id, ok: true, w, h, tw, th, jpeg }, [jpeg]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};

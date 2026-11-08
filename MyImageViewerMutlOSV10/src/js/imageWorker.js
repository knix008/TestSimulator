/* Viewer decode worker: the big work of opening a picture, off the UI thread.
   In:  { id, blob: Blob, pixels: boolean }
   Out: { id, ok: true, w, h, bitmap: ImageBitmap, data?: ArrayBuffer, copy?: ArrayBuffer }
        | { id, ok: false, error }
   The bitmap is what the viewer draws (decoded here, not on the first drawImage); `data` is
   its RGBA pixels (the editor's working copy) and `copy` a second one for the first undo
   step. All three are transferred, not copied. */
'use strict';

self.onmessage = async (e) => {
  const { id, blob, pixels } = e.data || {};
  try {
    // EXIF orientation applied, like an <img>; straight alpha so getImageData reads it back exactly
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
    const w = bitmap.width, h = bitmap.height;
    if (!w || !h) throw new Error('empty image');
    const out = { id, ok: true, w, h, bitmap };
    const transfer = [bitmap];
    if (pixels) {
      let canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      canvas.width = 1; canvas.height = 1; canvas = null;   // let go of the canvas memory now
      const copy = data.slice();
      out.data = data.buffer;
      out.copy = copy.buffer;
      transfer.push(data.buffer, copy.buffer);
    }
    self.postMessage(out, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};

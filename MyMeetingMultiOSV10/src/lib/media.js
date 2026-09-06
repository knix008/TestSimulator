// Media (image / video / audio) loading helpers shared by the editor.
//
// Files chosen via drag & drop, paste or the file dialog are read into base64
// `data:` URLs so they are EMBEDDED directly in the meeting Markdown. That keeps
// every export (md / html / pdf / word) self-contained — no external asset
// references — at the cost of a larger document. Large raster images are
// downscaled so the embedded payload (and localStorage autosave) stays sane;
// vector (SVG), animated (GIF) and audio/video data are kept verbatim.

export const MEDIA_ACCEPT = 'image/*,video/*,audio/*';

// Classify a File/Blob by its MIME type. Returns 'image' | 'video' | 'audio' | ''.
export function mediaKind(file) {
  const type = (file && file.type) || '';
  if (/^image\//.test(type)) return 'image';
  if (/^video\//.test(type)) return 'video';
  if (/^audio\//.test(type)) return 'audio';
  return '';
}

export function isMediaFile(file) {
  return !!mediaKind(file);
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error('Failed to read file'));
    fr.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

// Read a media file as an embeddable descriptor:
//   { kind, dataUrl, width }  — width is a sensible initial display width (px)
//   for images/video (so a huge photo doesn't dominate the page); it is the
//   value written to the element's `width` attribute and later adjusted by the
//   resize handle. Audio has no width.
export async function loadMedia(file, { maxDim = 1600, maxInsertWidth = 600, jpegQuality = 0.92 } = {}) {
  const kind = mediaKind(file);
  if (!kind) throw new Error('Unsupported media type');

  if (kind !== 'image') {
    // Video / audio are embedded verbatim (no re-encoding).
    const dataUrl = await readFileAsDataURL(file);
    return { kind, dataUrl, width: kind === 'video' ? maxInsertWidth : 0 };
  }

  const original = await readFileAsDataURL(file);
  // GIF (animation) and SVG (vector) must not be rasterized — keep as-is.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    const img = await loadImageElement(original).catch(() => null);
    const w = img ? img.naturalWidth : maxInsertWidth;
    return { kind, dataUrl: original, width: Math.min(w || maxInsertWidth, maxInsertWidth) };
  }

  const img = await loadImageElement(original);
  let { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) return { kind, dataUrl: original, width: maxInsertWidth };

  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    // Preserve transparency for PNGs; re-encode everything else as JPEG.
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const scaled = canvas.toDataURL(outType, jpegQuality);
    return { kind, dataUrl: scaled, width: Math.min(cw, maxInsertWidth) };
  }

  return { kind, dataUrl: original, width: Math.min(w, maxInsertWidth) };
}

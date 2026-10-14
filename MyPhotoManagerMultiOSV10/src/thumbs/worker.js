// Thumbnail worker: decodes a file, makes the thumbnail, reads its metadata
// summary and a similarity hash — away from the page so scrolling stays smooth.
import { dHash, grayGrid } from '../catalog/dupes.js';
import { canvasToBlob, context2d, makeCanvas } from '../formats/canvas.js';
import { decodeImage } from '../formats/decode.js';
import { readMetadata } from '../formats/exif.js';

export async function makeThumbnail(bytes, name, size, { meta = true } = {}) {
  const summary = meta ? (await readMetadata(bytes)).summary : null;
  const decoded = await decodeImage(bytes, name, { maxSize: size });
  const { source } = decoded;
  const canvas = typeof source.getContext === 'function' ? source : (() => {
    const c = makeCanvas(source.width, source.height);
    context2d(c).drawImage(source, 0, 0);
    return c;
  })();
  const blob = await canvasToBlob(canvas, 'image/webp', 0.82);
  // Similarity hash from a 9×8 reduction.
  const tiny = makeCanvas(9, 8);
  const tinyContext = context2d(tiny, { willReadFrequently: true });
  tinyContext.imageSmoothingQuality = 'high';
  tinyContext.drawImage(canvas, 0, 0, 9, 8);
  const hash = dHash(grayGrid(tinyContext.getImageData(0, 0, 9, 8).data, 9, 8));
  // Pixel size of the full picture: decoded size before scaling, or the EXIF size.
  const full = decoded.original
    ? ([5, 6, 7, 8].includes(decoded.orientation) ? { width: decoded.original.height, height: decoded.original.width } : decoded.original)
    : decoded.fullWidth ? { width: decoded.fullWidth, height: decoded.fullHeight } : null;
  return { blob, width: full?.width ?? summary?.exifWidth ?? null, height: full?.height ?? summary?.exifHeight ?? null, hash, meta: summary, preview: Boolean(decoded.preview) };
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = async ({ data }) => {
    const { id, bytes, name, size, meta } = data;
    try {
      const result = await makeThumbnail(new Uint8Array(bytes), name, size, { meta });
      globalThis.postMessage({ id, ok: true, ...result });
    } catch (error) {
      globalThis.postMessage({ id, ok: false, error: error?.message ?? String(error) });
    }
  };
}

// DICOM (medical images) through ImageViewer V20's decoder (dicomDecoder.js).
// The parser and codecs load on first use from public/vendor/ (copied by
// scripts/vendor-assets.mjs), in the page only.
import DicomDecoder from './dicomDecoder.js';

let ready = false;

/** The decoder, with its codecs' location set. */
export function dicomDecoder() {
  if (!ready && typeof document !== 'undefined') {
    DicomDecoder.setVendorBase(new URL('./vendor/', document.baseURI).href);
    ready = true;
  }
  return DicomDecoder;
}

/** Parsed DICOM image (see dicomDecoder.js for its API: render, frames, tags, windows …). */
export function loadDicom(bytes) {
  return dicomDecoder().load(bytes);
}

/** First (or `frame`) frame as a canvas with the file's own window: { source, pages, dicom }. */
export async function decodeDicom(bytes, frame = 0) {
  const image = await loadDicom(bytes);
  const { canvas } = await image.toCanvas({ frame: Math.min(Math.max(0, frame), (image.frames ?? 1) - 1) });
  return { source: canvas, pages: image.frames ?? 1, dicom: image };
}

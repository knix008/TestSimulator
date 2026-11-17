// Copy and "save as" for image files that are already saved (capture history,
// viewer). Rust reads JPG · PNG · GIF · TIFF · BMP · WEBP itself; AVIF has no
// decoder there, so the webview decodes it and sends the pixels along.
import { call, previewUrl } from './native.js';

/** Files the backend cannot open: decoded here instead. */
export const decodedInWebview = (path) => /\.avif$/i.test(String(path ?? ''));

/** RGBA pixels of a file, decoded by the webview (asset URL → canvas). */
async function webviewPixels(path) {
  const url = await previewUrl(path);
  if (!url) throw new Error('missing');
  const picture = new Image();
  // Without this the canvas is "tainted" and refuses to give its pixels back.
  picture.crossOrigin = 'anonymous';
  picture.src = url;
  await picture.decode();
  const canvas = document.createElement('canvas');
  canvas.width = picture.naturalWidth;
  canvas.height = picture.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(picture, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** `[u32 meta length][meta JSON][u32 width][u32 height][RGBA…]`, little endian (lib.rs frame_body). */
export function frameBody(meta, { width, height, data }) {
  const json = new TextEncoder().encode(JSON.stringify(meta ?? {}));
  const body = new Uint8Array(4 + json.length + 8 + data.length);
  const view = new DataView(body.buffer);
  view.setUint32(0, json.length, true);
  body.set(json, 4);
  view.setUint32(4 + json.length, width, true);
  view.setUint32(8 + json.length, height, true);
  body.set(data, 12 + json.length);
  return body;
}

/** Puts a saved image on the clipboard. */
export async function copyImageAt(path) {
  if (!decodedInWebview(path)) return call('copy_image_file', { path });
  return call('copy_frame', frameBody({}, await webviewPixels(path)));
}

/** Writes a saved image again in `format` at `output` ({ kind: 'exact', path } or a folder). */
export async function saveImageAs(path, output, format, jpegQuality) {
  if (!decodedInWebview(path)) return call('convert_image_file', { path, output, format, jpegQuality });
  return call('save_frame', frameBody({ output, format, jpegQuality }, await webviewPixels(path)));
}

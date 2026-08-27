// Universal image decoder.
//
// Chromium natively decodes PNG/JPG/GIF/ICO/BMP/WebP/AVIF/SVG. For formats it
// cannot handle (TIFF, HEIC/HEIF, DICOM) we decode them to RGBA in the renderer
// and return a PNG data URL. Heavy decoders are lazy-imported so they only load
// when such a file is actually opened.

export const NATIVE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'cur', 'svg', 'avif', 'apng'];
export const EXTRA_EXTS = ['tif', 'tiff', 'heic', 'heif', 'dcm'];
export const ALL_INPUT_EXTS = [...NATIVE_EXTS, ...EXTRA_EXTS];

function extOf(name) {
  const m = /\.([^.]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

async function toArrayBuffer({ file, dataUrl }) {
  if (file) return await file.arrayBuffer();
  const res = await fetch(dataUrl);
  return await res.arrayBuffer();
}

async function toBlob({ file, dataUrl }) {
  if (file) return file;
  return await (await fetch(dataUrl)).blob();
}

function rgbaToPngDataUrl(rgba, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(new Uint8ClampedArray(rgba.buffer || rgba), width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ── TIFF ─────────────────────────────────────────────────
async function decodeTiff(input) {
  const UTIF = (await import('utif')).default;
  const ab = await toArrayBuffer(input);
  const ifds = UTIF.decode(ab);
  if (!ifds.length) throw new Error('TIFF contains no images.');
  UTIF.decodeImage(ab, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  return rgbaToPngDataUrl(new Uint8ClampedArray(rgba), ifds[0].width, ifds[0].height);
}

// ── HEIC / HEIF ──────────────────────────────────────────
async function decodeHeic(input) {
  const heic2any = (await import('heic2any')).default;
  const blob = await toBlob(input);
  const out = await heic2any({ blob, toType: 'image/png' });
  const pngBlob = Array.isArray(out) ? out[0] : out;
  return URL.createObjectURL(pngBlob);
}

// ── DICOM (uncompressed 8/16-bit grayscale + RGB) ────────
const UNCOMPRESSED_TS = new Set([
  '1.2.840.10008.1.2',      // Implicit VR LE
  '1.2.840.10008.1.2.1',    // Explicit VR LE
  '1.2.840.10008.1.2.2',    // Explicit VR BE
]);

async function decodeDicom(input) {
  const dicomParser = (await import('dicom-parser')).default;
  const ab = await toArrayBuffer(input);
  const byteArray = new Uint8Array(ab);
  const ds = dicomParser.parseDicom(byteArray);

  const transferSyntax = (ds.string('x00020010') || '1.2.840.10008.1.2').trim();
  if (!UNCOMPRESSED_TS.has(transferSyntax)) {
    throw new Error(`This DICOM uses a compressed transfer syntax (${transferSyntax}) that is not supported. Please convert it to an uncompressed DICOM or another image format.`);
  }

  const rows = ds.uint16('x00280010');
  const cols = ds.uint16('x00280011');
  if (!rows || !cols) throw new Error('DICOM is missing image dimensions.');
  const samplesPerPixel = ds.uint16('x00280002') || 1;
  const photometric = (ds.string('x00280004') || 'MONOCHROME2').trim();
  const bitsAllocated = ds.uint16('x00280100') || 16;
  const pixelRepresentation = ds.uint16('x00280103') || 0; // 1 = signed
  const pd = ds.elements.x7fe00010;
  if (!pd) throw new Error('DICOM has no pixel data.');

  const slope = parseFloat(ds.string('x00281053')) || 1;
  const intercept = parseFloat(ds.string('x00281052')) || 0;
  let wc = parseFloat((ds.string('x00281050') || '').split('\\')[0]);
  let ww = parseFloat((ds.string('x00281051') || '').split('\\')[0]);

  const npx = rows * cols;
  const rgba = new Uint8ClampedArray(npx * 4);

  if (samplesPerPixel === 3) {
    // RGB (assume 8-bit, pixel interleaved)
    const px = new Uint8Array(ab, pd.dataOffset, pd.length);
    for (let i = 0; i < npx; i++) {
      rgba[i * 4] = px[i * 3];
      rgba[i * 4 + 1] = px[i * 3 + 1];
      rgba[i * 4 + 2] = px[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    return rgbaToPngDataUrl(rgba, cols, rows);
  }

  // Grayscale
  let pixels;
  if (bitsAllocated <= 8) {
    pixels = new Uint8Array(ab, pd.dataOffset, npx);
  } else if (pixelRepresentation === 1) {
    pixels = new Int16Array(ab, pd.dataOffset, npx);
  } else {
    pixels = new Uint16Array(ab, pd.dataOffset, npx);
  }

  // Apply modality rescale, then window/level. Fall back to min/max.
  let lo, hi;
  if (Number.isFinite(wc) && Number.isFinite(ww) && ww > 0) {
    lo = wc - ww / 2;
    hi = wc + ww / 2;
  } else {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < npx; i++) {
      const v = pixels[i] * slope + intercept;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    lo = mn; hi = mx;
  }
  const range = hi - lo || 1;
  const invert = photometric === 'MONOCHROME1';

  for (let i = 0; i < npx; i++) {
    const v = pixels[i] * slope + intercept;
    let g = Math.round(((v - lo) / range) * 255);
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    if (invert) g = 255 - g;
    rgba[i * 4] = g;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = g;
    rgba[i * 4 + 3] = 255;
  }
  return rgbaToPngDataUrl(rgba, cols, rows);
}

// Returns a browser-displayable data/object URL for any supported input.
// Accepts { name, dataUrl } (Electron) or { name, file } (web / drag-drop).
export async function toDisplayable({ name, dataUrl, file, ext }) {
  const e = (ext || extOf(name)).toLowerCase();
  if (NATIVE_EXTS.includes(e)) {
    if (dataUrl) return dataUrl;
    return URL.createObjectURL(file);
  }
  if (e === 'tif' || e === 'tiff') return await decodeTiff({ file, dataUrl });
  if (e === 'heic' || e === 'heif') return await decodeHeic({ file, dataUrl });
  if (e === 'dcm') return await decodeDicom({ file, dataUrl });
  // Unknown: let the browser try.
  if (dataUrl) return dataUrl;
  return URL.createObjectURL(file);
}

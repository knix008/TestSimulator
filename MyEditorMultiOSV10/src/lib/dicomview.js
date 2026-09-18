// Window / level and pixel readout for a DICOM frame in the renderer.
// The bytes come from file.preview (base64 of the stored pixel values).

export const WINDOW_PRESETS = [
  ['default', 'img_pv_wl_default', null],
  ['abdomen', 'img_pv_wl_abdomen', { ww: 400, wl: 40 }],
  ['bone', 'img_pv_wl_bone', { ww: 1800, wl: 400 }],
  ['brain', 'img_pv_wl_brain', { ww: 80, wl: 40 }],
  ['lung', 'img_pv_wl_lung', { ww: 1500, wl: -600 }],
  ['soft', 'img_pv_wl_soft', { ww: 350, wl: 50 }],
  ['liver', 'img_pv_wl_liver', { ww: 150, wl: 30 }],
];

export function pixelsFromB64(b64, type) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  if (type === 'i16') return new Int16Array(buf);
  if (type === 'u16') return new Uint16Array(buf);
  return new Uint8Array(buf);
}

export function applyWindow(pixels, { width, height, samples = 1, photometric = 'MONOCHROME2', slope = 1, intercept = 0, ww, wl, invert = false } = {}) {
  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  if (samples >= 3) {
    for (let i = 0; i < n; i++) {
      let r = pixels[i * samples], g = pixels[i * samples + 1], b = pixels[i * samples + 2];
      if (pixels instanceof Uint16Array || pixels instanceof Int16Array) { r >>= 8; g >>= 8; b >>= 8; }
      if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
      const o = i * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
    }
    return rgba;
  }
  const span = ww > 0 ? ww : 1;
  const lo = wl - span / 2;
  const mono1 = /MONOCHROME1/i.test(photometric);
  for (let i = 0; i < n; i++) {
    let g = Math.round(255 * ((pixels[i] * slope + intercept) - lo) / span);
    if (g < 0) g = 0; else if (g > 255) g = 255;
    if (mono1) g = 255 - g;
    if (invert) g = 255 - g;
    const o = i * 4;
    rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255;
  }
  return rgba;
}

export function valueAt(pixels, x, y, { width, samples = 1, slope = 1, intercept = 0 } = {}) {
  if (x < 0 || y < 0 || x >= width) return null;
  const i = (y * width + x) * samples;
  if (i < 0 || i >= pixels.length) return null;
  if (samples >= 3) return { stored: [pixels[i], pixels[i + 1], pixels[i + 2]], hu: null };
  const stored = pixels[i];
  return { stored, hu: stored * slope + intercept };
}

export function canvasToPng(canvas) {
  return canvas.toDataURL('image/png');
}

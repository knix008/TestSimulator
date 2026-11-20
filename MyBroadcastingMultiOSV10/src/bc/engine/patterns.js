// Pictures the shaders read: the luma wipe patterns (computed, not shipped as images) and
// 3D LUTs (.cube text or the 8×8 PNG layout) turned into a 2D atlas. Pure: RGBA byte arrays, tested in node.
import { LUMA_IMAGES } from '../catalog.js';

/** Luma value 0…1 of a wipe pattern at (u, v) in 0…1. */
export function lumaAt(kind, u, v) {
  const cx = u - 0.5; const cy = v - 0.5;
  switch (kind) {
    case 'linear-h': return u;
    case 'linear-v': return v;
    case 'linear-tl': return (u + v) / 2;
    case 'linear-tr': return (1 - u + v) / 2;
    case 'radial': return Math.min(1, Math.hypot(cx, cy) / Math.SQRT1_2);
    case 'clock': return (Math.atan2(cx, -cy) / (2 * Math.PI) + 1) % 1;
    case 'diamond': return Math.min(1, Math.abs(cx) + Math.abs(cy));
    case 'box': return Math.min(1, Math.max(Math.abs(cx), Math.abs(cy)) * 2);
    case 'barndoor-h': return Math.abs(cx) * 2;
    case 'barndoor-v': return Math.abs(cy) * 2;
    case 'blinds-h': return (v * 8) % 1;
    case 'blinds-v': return (u * 8) % 1;
    case 'checker': { const a = (Math.floor(u * 8) + Math.floor(v * 8)) % 2; return a * 0.5 + ((u * 8) % 1) * 0.5; }
    case 'spiral': { const r = Math.hypot(cx, cy) / Math.SQRT1_2; const a = (Math.atan2(cy, cx) / (2 * Math.PI) + 1) % 1; return (a + r * 2) % 1 * 0.999; }
    case 'circles': { const gx = (u * 6) % 1 - 0.5; const gy = (v * 6 * 9 / 16) % 1 - 0.5; return Math.min(1, Math.hypot(gx, gy) / Math.SQRT1_2); }
    case 'noise': { const x = Math.floor(u * 64); const y = Math.floor(v * 36); const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return h - Math.floor(h); }
    default: return u;
  }
}

/** The pattern as an RGBA picture (grey levels). */
export function lumaPixels(kind, w = 256, h = 144) {
  if (!LUMA_IMAGES.includes(kind)) kind = 'linear-h';
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = Math.round(Math.max(0, Math.min(1, lumaAt(kind, (x + 0.5) / w, (y + 0.5) / h))) * 255);
    const i = (y * w + x) * 4;
    out[i] = out[i + 1] = out[i + 2] = l; out[i + 3] = 255;
  }
  return out;
}

/** A .cube file → { size, data: Float32Array(size³·3) } (red fastest, as the format says). */
export function parseCube(text) {
  let size = 0;
  const values = [];
  let min = [0, 0, 0]; let max = [1, 1, 1];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'LUT_3D_SIZE') { size = Number(parts[1]); continue; }
    if (parts[0] === 'DOMAIN_MIN') { min = parts.slice(1, 4).map(Number); continue; }
    if (parts[0] === 'DOMAIN_MAX') { max = parts.slice(1, 4).map(Number); continue; }
    if (/^[A-Z_]/.test(parts[0])) continue;
    if (parts.length >= 3) values.push(...parts.slice(0, 3).map(Number));
  }
  if (!size || values.length < size * size * size * 3) throw new Error('bad .cube file');
  const data = new Float32Array(size * size * size * 3);
  for (let i = 0; i < data.length; i++) { const c = i % 3; data[i] = (values[i] - min[c]) / ((max[c] - min[c]) || 1); }
  return { size, data };
}

/** A LUT as the shader's 2D atlas: `cols` slices per row, each slice size×size (red → x, green → y). */
export function lutAtlas({ size, data }) {
  const cols = Math.ceil(Math.sqrt(size));
  const rows = Math.ceil(size / cols);
  const W = cols * size; const H = rows * size;
  const out = new Uint8Array(W * H * 4);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const src = ((b * size + g) * size + r) * 3;
    const x = (b % cols) * size + r; const y = Math.floor(b / cols) * size + g;
    const i = (y * W + x) * 4;
    out[i] = Math.round(Math.max(0, Math.min(1, data[src])) * 255);
    out[i + 1] = Math.round(Math.max(0, Math.min(1, data[src + 1])) * 255);
    out[i + 2] = Math.round(Math.max(0, Math.min(1, data[src + 2])) * 255);
    out[i + 3] = 255;
  }
  return { pixels: out, width: W, height: H, size, cols };
}

/** PNG LUTs: 512×512 = 64 slices of 64² laid 8 per row (also any n² square). */
export function pngLutToCube(pixels, width, height) {
  const size = Math.round(Math.cbrt(width * height));
  const cols = Math.round(width / size);
  const data = new Float32Array(size * size * size * 3);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const x = (b % cols) * size + r; const y = Math.floor(b / cols) * size + g;
    const i = (y * width + x) * 4; const o = ((b * size + g) * size + r) * 3;
    data[o] = pixels[i] / 255; data[o + 1] = pixels[i + 1] / 255; data[o + 2] = pixels[i + 2] / 255;
  }
  return { size, data };
}

/** An identity LUT (tests, defaults). */
export function identityCube(size = 17) {
  const data = new Float32Array(size * size * size * 3);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const o = ((b * size + g) * size + r) * 3; data[o] = r / (size - 1); data[o + 1] = g / (size - 1); data[o + 2] = b / (size - 1);
  }
  return { size, data };
}

/** Key colour of a chroma / colour key filter, as RGB 0…1. */
export function keyColor(s) {
  const preset = { green: '#00ff00', blue: '#0000ff', magenta: '#ff00ff', red: '#ff0000' }[s.key_color_type];
  return hexRgb(preset ?? s.key_color ?? '#00ff00');
}
export function hexRgb(hex) {
  const n = parseInt(String(hex || '#000000').replace('#', '').slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

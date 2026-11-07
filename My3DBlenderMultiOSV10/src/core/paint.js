// Painting on images: dabs in image space (the Image Editor) and on a mesh's surface through its UVs (Texture Paint).
// An image here is { width, height, rgba } with row 0 at the top, in sRGB bytes; `v` runs upward as in the UV editor.
import { triangulateFace, v3 } from './mesh.js';

export const PAINT_BLENDS = ['MIX', 'ADD', 'SUB', 'MUL', 'ERASE'];

export function createImageBuffer(width, height, color = [1, 1, 1, 1]) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const c = color.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3] ?? 255; }
  return { width, height, rgba };
}

/** One pixel of paint: `k` from 0 to 1. Colours are 0…1. */
function blendPixel(rgba, i, color, k, blend) {
  const c = [color[0] * 255, color[1] * 255, color[2] * 255];
  switch (blend) {
    case 'ADD': for (let a = 0; a < 3; a++) rgba[i + a] = rgba[i + a] + c[a] * k; break;
    case 'SUB': for (let a = 0; a < 3; a++) rgba[i + a] = rgba[i + a] - c[a] * k; break;
    case 'MUL': for (let a = 0; a < 3; a++) rgba[i + a] = rgba[i + a] * (1 - k) + (rgba[i + a] * c[a] * k) / 255; break;
    case 'ERASE': rgba[i + 3] = rgba[i + 3] * (1 - k); break;
    default:
      for (let a = 0; a < 3; a++) rgba[i + a] = rgba[i + a] * (1 - k) + c[a] * k;
      rgba[i + 3] = rgba[i + 3] + (255 - rgba[i + 3]) * k;
  }
}

const smooth = (t) => { const x = Math.max(0, Math.min(1, 1 - t)); return x * x * (3 - 2 * x); };

/** A round dab in image space at (u, v), `radius` in pixels. Returns the changed box, or null. */
export function paintDabImage(image, u, v, { radius = 16, strength = 1, color = [1, 0, 0], blend = 'MIX' } = {}) {
  const { width, height, rgba } = image;
  const [cx, cy] = [u * width, (1 - v) * height];
  const [x0, x1] = [Math.max(0, Math.floor(cx - radius)), Math.min(width - 1, Math.ceil(cx + radius))];
  const [y0, y1] = [Math.max(0, Math.floor(cy - radius)), Math.min(height - 1, Math.ceil(cy + radius))];
  if (x0 > x1 || y0 > y1) return null;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d >= radius) continue;
    blendPixel(rgba, (y * width + x) * 4, color, smooth(d / radius) * strength, blend);
  }
  return { x0, y0, x1, y1 };
}

/**
 * A dab on the surface: every texel whose 3D point lies inside the brush sphere is painted, through the mesh's UVs. So the
 * paint crosses seams and islands by itself, and its size on the model does not depend on the UV layout.
 * Returns the number of texels painted.
 */
export function texturePaintDab(mesh, image, center, { radius = 0.5, strength = 1, color = [1, 0, 0], blend = 'MIX', normal = null } = {}) {
  if (!mesh.uvs) return 0;
  const { width, height, rgba } = image;
  // A texel shared by two triangles along a UV edge is painted once in a dab.
  const seen = new Set();
  let painted = 0;
  mesh.faces.forEach((face, f) => {
    const uv = mesh.uvs[f];
    if (!uv) return;
    for (const t of triangulateFace(mesh, face)) {
      const [a, b, c] = t.map((k) => mesh.verts[face[k]]);
      // Skip triangles the brush cannot reach (by their bounding sphere), and the far side of a thin object.
      const mid = v3.mul(v3.add(v3.add(a, b), c), 1 / 3);
      const reach = Math.max(v3.dist(mid, a), v3.dist(mid, b), v3.dist(mid, c));
      if (v3.dist(mid, center) > radius + reach) continue;
      if (normal && v3.dot(v3.cross(v3.sub(b, a), v3.sub(c, a)), normal) < 0) continue;
      const [ua, ub, uc] = t.map((k) => [uv[k][0] * width, (1 - uv[k][1]) * height]);
      const det = (ub[1] - uc[1]) * (ua[0] - uc[0]) + (uc[0] - ub[0]) * (ua[1] - uc[1]);
      if (Math.abs(det) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ua[0], ub[0], uc[0])));
      const x1 = Math.min(width - 1, Math.ceil(Math.max(ua[0], ub[0], uc[0])));
      const y0 = Math.max(0, Math.floor(Math.min(ua[1], ub[1], uc[1])));
      const y1 = Math.min(height - 1, Math.ceil(Math.max(ua[1], ub[1], uc[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const [px, py] = [x + 0.5, y + 0.5];
        const l0 = ((ub[1] - uc[1]) * (px - uc[0]) + (uc[0] - ub[0]) * (py - uc[1])) / det;
        const l1 = ((uc[1] - ua[1]) * (px - uc[0]) + (ua[0] - uc[0]) * (py - uc[1])) / det;
        const l2 = 1 - l0 - l1;
        // A little outside the triangle: paint bleeds past UV borders so that filtering shows no gaps.
        if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue;
        const p = [a[0] * l0 + b[0] * l1 + c[0] * l2, a[1] * l0 + b[1] * l1 + c[1] * l2, a[2] * l0 + b[2] * l1 + c[2] * l2];
        const d = v3.dist(p, center);
        if (d >= radius) continue;
        const key = y * width + x;
        if (seen.has(key)) continue;
        seen.add(key);
        blendPixel(rgba, key * 4, color, smooth(d / radius) * strength, blend);
        painted++;
      }
    }
  });
  return painted;
}

/** Fills the image with a colour. */
export function fillImage(image, color = [0, 0, 0, 1]) {
  const c = color.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
  const { rgba } = image;
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3] ?? 255; }
  return image;
}

/** The colour under (u, v), 0…1 per channel. */
export function samplePixel(image, u, v) {
  const x = Math.max(0, Math.min(image.width - 1, Math.floor(u * image.width)));
  const y = Math.max(0, Math.min(image.height - 1, Math.floor((1 - v) * image.height)));
  const i = (y * image.width + x) * 4;
  return [image.rgba[i] / 255, image.rgba[i + 1] / 255, image.rgba[i + 2] / 255, image.rgba[i + 3] / 255];
}

// ─────────────── a plain PNG writer (for Node and for when no canvas is at hand)

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG bytes, uncompressed ("stored" deflate blocks): valid everywhere, just larger than a compressed one. */
export function encodePNG({ width, height, rgba }) {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  z[0] = 0x78; z[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    z[o++] = b === blocks - 1 ? 1 : 0;
    z[o++] = len & 255; z[o++] = len >> 8; z[o++] = ~len & 255; z[o++] = (~len >> 8) & 255;
    z.set(raw.subarray(start, start + len), o);
    o += len;
  }
  let s1 = 1;
  let s2 = 0;
  for (const x of raw) { s1 = (s1 + x) % 65521; s2 = (s2 + s1) % 65521; }
  z[o++] = s2 >> 8; z[o++] = s2 & 255; z[o++] = s1 >> 8; z[o++] = s1 & 255;
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}

export function encodePNGDataUrl(image) {
  const png = encodePNG(image);
  let text = '';
  for (let i = 0; i < png.length; i += 8192) text += String.fromCharCode(...png.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(text)}`;
}

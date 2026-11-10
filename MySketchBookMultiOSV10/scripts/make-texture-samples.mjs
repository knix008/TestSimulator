// Small sample pictures for File › Import… (textures and environments), drawn here — nothing is downloaded:
//   node scripts/make-texture-samples.mjs        → samples/textures/*, samples/environments/*
// Textures: a brick set (colour TGA + normal PNG + roughness TIFF: one material with three maps), DXT1 DDS
// tiles, KTX2 terrazzo, EXR marble, WebP oak. Environments: a Radiance .hdr sky with a sun, an OpenEXR
// overcast sky and an equirectangular JPEG panorama. Deterministic (same bytes on every run).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { EXRExporter } from 'three/examples/jsm/exporters/EXRExporter.js';
import { KTX2Exporter } from 'three/examples/jsm/exporters/KTX2Exporter.js';
import { encodeTga, encodeTiff } from '../src/io/imageformats.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const texDir = path.join(root, 'samples', 'textures');
const envDir = path.join(root, 'samples', 'environments');
mkdirSync(texDir, { recursive: true });
mkdirSync(envDir, { recursive: true });

// ───────── deterministic noise
const hash = (x, y, seed = 0) => { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const smooth = (t) => t * t * (3 - 2 * t);
function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x); const yi = Math.floor(y); const xf = smooth(x - xi); const yf = smooth(y - yi);
  const a = hash(xi, yi, seed); const b = hash(xi + 1, yi, seed); const c = hash(xi, yi + 1, seed); const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x, y, seed = 0, octaves = 4) => { let v = 0; let amp = 0.5; let f = 1; for (let i = 0; i < octaves; i++) { v += amp * valueNoise(x * f, y * f, seed + i); amp /= 2; f *= 2; } return v; };
/** Tileable fbm: noise sampled on a period so the texture repeats without seams. */
const tileFbm = (u, v, period, seed) => {
  const a = fbm(u * period, v * period, seed); const b = fbm((u - 1) * period, v * period, seed);
  const c = fbm(u * period, (v - 1) * period, seed); const d = fbm((u - 1) * period, (v - 1) * period, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
};
const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));
const write = (dir, name, bytes) => { writeFileSync(path.join(dir, name), bytes); console.log(`  ${path.relative(root, path.join(dir, name))} (${(bytes.length / 1024).toFixed(1)} KB)`); };
const png = (rgba, w, h) => sharp(Buffer.from(rgba), { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();

// ───────── brick set: 1 m × 0.5 m of running bond (colour TGA, normal PNG, roughness TIFF)
{
  const W = 512; const H = 256;
  const color = new Uint8Array(W * H * 4); const rough = new Uint8Array(W * H * 4); const height = new Float32Array(W * H);
  const rows = 4; const cols = 4; const mortar = 6;
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / (H / rows));
    const yIn = y % (H / rows);
    for (let x = 0; x < W; x++) {
      const shift = row % 2 ? W / cols / 2 : 0;
      const xs = (x + shift) % W;
      const col = Math.floor(xs / (W / cols));
      const xIn = xs % (W / cols);
      const isMortar = yIn < mortar || xIn < mortar;
      const n = tileFbm(x / W, y / H, 8, 3);
      const tone = hash(col, row, 7) * 0.35;
      const i = (y * W + x) * 4;
      if (isMortar) { const g = 170 + n * 40; color.set([g, g * 0.97, g * 0.92, 255], i); rough.set([245, 245, 245, 255], i); height[y * W + x] = 0; }
      else { color.set([clamp(150 + tone * 120 + n * 50), clamp(62 + tone * 40 + n * 30), clamp(44 + tone * 25 + n * 20), 255], i); const r = clamp(170 + n * 70); rough.set([r, r, r, 255], i); height[y * W + x] = 1 + n * 0.3; }
    }
  }
  // Normal map (OpenGL convention, +Y up) from the height field.
  const normal = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hx = height[y * W + ((x + 1) % W)] - height[y * W + ((x - 1 + W) % W)];
    const hy = height[((y + 1) % H) * W + x] - height[((y - 1 + H) % H) * W + x];
    const n = new THREE.Vector3(-hx * 2, hy * 2, 1).normalize();
    normal.set([Math.round((n.x * 0.5 + 0.5) * 255), Math.round((n.y * 0.5 + 0.5) * 255), Math.round((n.z * 0.5 + 0.5) * 255), 255], (y * W + x) * 4);
  }
  write(texDir, 'brick_diff.tga', encodeTga(color, W, H));
  write(texDir, 'brick_nor_gl.png', await png(normal, W, H));
  write(texDir, 'brick_rough.tif', encodeTiff(rough, W, H));
}

// ───────── tiles: DXT1 (BC1) DDS with mipmaps, 30 cm ceramic tiles
function bc1Block(rgba, w, h, bx, by) {
  const px = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = (Math.min(h - 1, by + y) * w + Math.min(w - 1, bx + x)) * 4; px.push([rgba[i], rgba[i + 1], rgba[i + 2]]); }
  const lum = (p) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11;
  let lo = px[0]; let hi = px[0];
  for (const p of px) { if (lum(p) < lum(lo)) lo = p; if (lum(p) > lum(hi)) hi = p; }
  const to565 = (p) => ((p[0] >> 3) << 11) | ((p[1] >> 2) << 5) | (p[2] >> 3);
  let c0 = to565(hi); let c1 = to565(lo);
  if (c0 < c1) [c0, c1] = [c1, c0];
  const from565 = (c) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
  const p0 = from565(c0); const p1 = from565(c1);
  const palette = c0 === c1 ? [p0, p0, p0, p0] : [p0, p1, p0.map((v, k) => (2 * v + p1[k]) / 3), p0.map((v, k) => (v + 2 * p1[k]) / 3)];
  let bits = 0;
  px.forEach((p, k) => { let best = 0; let bestD = Infinity; palette.forEach((q, j) => { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bestD) { bestD = d; best = j; } }); bits |= best << (2 * k); });
  return [c0 & 255, c0 >> 8, c1 & 255, c1 >> 8, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255];
}
function downsample(rgba, w, h) {
  const W = Math.max(1, w >> 1); const H = Math.max(1, h >> 1); const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) {
    let s = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += rgba[(Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx)) * 4 + c];
    out[(y * W + x) * 4 + c] = s / 4;
  }
  return { rgba: out, w: W, h: H };
}
{
  const S = 256;
  const rgba = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const grout = x % 128 < 4 || y % 128 < 4;
    const n = tileFbm(x / S, y / S, 6, 11);
    const tile = hash(Math.floor(x / 128), Math.floor(y / 128), 5);
    const v = grout ? 120 + n * 30 : 205 + tile * 30 + n * 20;
    rgba.set([clamp(v * 0.93), clamp(v * 0.96), clamp(v), 255], (y * S + x) * 4);
  }
  const levels = [];
  let level = { rgba, w: S, h: S };
  for (;;) {
    const blocks = [];
    for (let by = 0; by < Math.max(4, level.h); by += 4) for (let bx = 0; bx < Math.max(4, level.w); bx += 4) blocks.push(...bc1Block(level.rgba, level.w, level.h, bx, by));
    levels.push(Uint8Array.from(blocks));
    if (level.w === 1 && level.h === 1) break;
    level = downsample(level.rgba, level.w, level.h);
  }
  const header = new Uint32Array(32);
  header[0] = 0x20534444; // 'DDS '
  header[1] = 124; header[2] = 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000; header[3] = S; header[4] = S; header[5] = levels[0].length; header[7] = levels.length;
  header[19] = 32; header[20] = 0x4; header[21] = 0x31545844; // pixel format: FOURCC 'DXT1'
  header[27] = 0x1000 | 0x8 | 0x400000;
  const out = new Uint8Array(128 + levels.reduce((n, l) => n + l.length, 0));
  out.set(new Uint8Array(header.buffer), 0);
  let o = 128;
  for (const l of levels) { out.set(l, o); o += l.length; }
  write(texDir, 'tiles-30cm.dds', out);
}

// ───────── terrazzo: KTX2 (uncompressed RGBA8, sRGB)
{
  const S = 256;
  const rgba = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tileFbm(x / S, y / S, 5, 21);
    const chip = valueNoise(x / 6, y / 6, 33) > 0.82 ? hash(Math.floor(x / 6), Math.floor(y / 6), 9) : -1;
    const c = chip < 0 ? [222 + n * 20, 216 + n * 20, 206 + n * 20] : chip < 0.33 ? [140, 70, 60] : chip < 0.66 ? [70, 80, 90] : [190, 160, 110];
    rgba.set([clamp(c[0]), clamp(c[1]), clamp(c[2]), 255], (y * S + x) * 4);
  }
  const texture = new THREE.DataTexture(rgba, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  write(texDir, 'terrazzo.ktx2', await new KTX2Exporter().parse(texture));
}

// ───────── marble: OpenEXR (half float, linear)
{
  const S = 256;
  const data = new Uint16Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tileFbm(x / S, y / S, 4, 41);
    const vein = Math.abs(Math.sin((x / S + y / S + n * 1.6) * Math.PI * 4));
    const v = 0.55 + 0.3 * Math.pow(vein, 0.25) - 0.25 * (1 - Math.pow(vein, 0.08));
    const i = (y * S + x) * 4;
    data[i] = THREE.DataUtils.toHalfFloat(v * 0.98); data[i + 1] = THREE.DataUtils.toHalfFloat(v * 0.97); data[i + 2] = THREE.DataUtils.toHalfFloat(v * 0.95); data[i + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const texture = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.HalfFloatType);
  write(texDir, 'marble.exr', await new EXRExporter().parse(texture, { type: THREE.HalfFloatType }));
}

// ───────── oak planks: WebP
{
  const W = 512; const H = 256;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const plank = Math.floor(y / 64);
    const seam = y % 64 < 2 || (x + plank * 173) % W < 2;
    const grain = Math.sin((y / 3 + tileFbm(x / W, y / H, 6, 51 + plank) * 18)) * 0.5 + 0.5;
    const tone = hash(plank, 0, 77) * 30;
    const v = seam ? 0.45 : 0.8 + grain * 0.2;
    rgba.set([clamp((184 + tone) * v), clamp((138 + tone * 0.7) * v), clamp((90 + tone * 0.4) * v), 255], (y * W + x) * 4);
  }
  write(texDir, 'oak-planks.webp', await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 85 }).toBuffer());
}

// ───────── environments (equirectangular, 2:1)
/** Sky radiance (linear) for a direction: elevation (−π/2..π/2), azimuth; a sun at sunAlt/sunAz. */
function skyRadiance(elev, az, { sunAlt, sunAz, sun = 0, top, horizon, ground, cloud = 0 }) {
  if (elev < 0) { const k = Math.min(1, -elev * 6); return ground.map((g, i) => horizon[i] * 0.4 * (1 - k) + g * k); }
  const t = Math.pow(Math.min(1, elev / (Math.PI / 2)), 0.6);
  const c = top.map((v, i) => horizon[i] + (v - horizon[i]) * t);
  if (cloud) { const n = fbm(az * 3, elev * 8, 5); const k = Math.max(0, n - 0.45) * cloud; for (let i = 0; i < 3; i++) c[i] = c[i] * (1 - k) + 1.2 * k; }
  if (sun) {
    const d = Math.acos(Math.min(1, Math.sin(elev) * Math.sin(sunAlt) + Math.cos(elev) * Math.cos(sunAlt) * Math.cos(az - sunAz)));
    const glow = Math.exp(-d * 6) * 2 + (d < 0.03 ? sun : 0);
    c[0] += glow * 1.0; c[1] += glow * 0.85; c[2] += glow * 0.6;
  }
  return c;
}
function equirect(W, H, sky) {
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const elev = (0.5 - (y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x++) { const az = ((x + 0.5) / W) * Math.PI * 2; out.set(sky(elev, az), (y * W + x) * 3); }
  }
  return out;
}
/** Radiance RGBE (.hdr) with the usual per-channel run-length scanlines. */
function encodeHdr(rgb, W, H) {
  const head = new TextEncoder().encode(`#?RADIANCE\n# MySketchBook sample sky\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`);
  const bytes = [...head];
  const rgbe = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = rgb[i]; const g = rgb[i + 1]; const b = rgb[i + 2];
      const m = Math.max(r, g, b);
      if (m < 1e-32) rgbe.set([0, 0, 0, 0], x * 4);
      else { const e = Math.ceil(Math.log2(m) + 1e-9); const f = 256 / 2 ** e; rgbe.set([Math.min(255, Math.floor(r * f)), Math.min(255, Math.floor(g * f)), Math.min(255, Math.floor(b * f)), e + 128], x * 4); }
    }
    bytes.push(2, 2, W >> 8, W & 255);
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < W) {
        let run = 1;
        while (x + run < W && run < 127 && rgbe[(x + run) * 4 + c] === rgbe[x * 4 + c]) run++;
        if (run >= 3) { bytes.push(128 + run, rgbe[x * 4 + c]); x += run; continue; }
        let n = 0;
        while (x + n < W && n < 128) {
          if (x + n + 2 < W && rgbe[(x + n) * 4 + c] === rgbe[(x + n + 1) * 4 + c] && rgbe[(x + n) * 4 + c] === rgbe[(x + n + 2) * 4 + c]) break;
          n++;
        }
        bytes.push(n);
        for (let k = 0; k < n; k++) bytes.push(rgbe[(x + k) * 4 + c]);
        x += n;
      }
    }
  }
  return Uint8Array.from(bytes);
}
{
  const W = 1024; const H = 512;
  const rgb = equirect(W, H, (e, a) => skyRadiance(e, a, { sunAlt: 0.12, sunAz: 1.2, sun: 60, top: [0.35, 0.22, 0.32], horizon: [1.6, 0.75, 0.35], ground: [0.12, 0.09, 0.08], cloud: 0.6 }));
  write(envDir, 'sunset-sky.hdr', encodeHdr(rgb, W, H));
}
{
  const W = 512; const H = 256;
  const rgb = equirect(W, H, (e, a) => skyRadiance(e, a, { top: [0.9, 0.95, 1.05], horizon: [1.2, 1.2, 1.2], ground: [0.25, 0.24, 0.22], cloud: 1 }));
  const data = new Uint16Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { for (let c = 0; c < 3; c++) data[i * 4 + c] = THREE.DataUtils.toHalfFloat(rgb[i * 3 + c]); data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1); }
  // EXRExporter takes the data bottom row first (three's convention, like a render target): flip so up is up.
  const flipped = new Uint16Array(data.length);
  for (let y = 0; y < H; y++) flipped.set(data.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  const texture = new THREE.DataTexture(flipped, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  write(envDir, 'overcast-sky.exr', await new EXRExporter().parse(texture, { type: THREE.HalfFloatType }));
}
{
  const W = 2048; const H = 1024;
  const rgb = equirect(W, H, (e, a) => {
    const c = skyRadiance(e, a, { sunAlt: 0.7, sunAz: 2.4, sun: 0, top: [0.25, 0.45, 0.85], horizon: [0.75, 0.85, 0.95], ground: [0.2, 0.32, 0.12], cloud: 0.8 });
    // Low hills on the horizon so the panorama reads as a landscape.
    const hill = 0.05 + 0.04 * fbm(a * 2, 0, 61);
    if (e > 0 && e < hill) return [0.12, 0.22, 0.1];
    return c;
  });
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { for (let c = 0; c < 3; c++) { const v = rgb[i * 3 + c]; rgba[i * 4 + c] = clamp(Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055))); } rgba[i * 4 + 3] = 255; }
  write(envDir, 'meadow-panorama.jpg', await sharp(Buffer.from(rgba), { raw: { width: W, height: H, channels: 4 } }).removeAlpha().jpeg({ quality: 82 }).toBuffer());
}
console.log('done');

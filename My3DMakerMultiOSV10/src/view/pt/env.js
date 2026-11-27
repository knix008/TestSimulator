// Procedural HDR environments for the path tracer: an equirectangular float radiance map (Z up) made from an
// environment preset — a sky / horizon / ground dome and bright rectangular soft boxes — and the importance
// sampling tables of the map. The sun is not in the map: the path tracer treats it as a light with a finite
// angular size (soft shadows) and samples it directly. Also reads Radiance .hdr (RGBE) files.
import { envCdf, envIrradianceUp, equirectToDir, dirOf, normalize, dot, cross } from './sampling.js';

/** A '#rrggbb' sRGB colour as linear [r, g, b]. */
export function srgbToLinear(hex) {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
}

const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/**
 * The radiance map of a preset: { data (Float32Array RGBA), width, height }. Dome colours as in the raster
 * preview (zenith, horizon, ground), soft boxes as squares of p.size (half side ≈ atan(25·size / 80)) with
 * soft edges, radiance = colour × intensity.
 */
export function environmentMap(preset, { width = 512, height = 256 } = {}) {
  const data = new Float32Array(width * height * 4);
  const zen = srgbToLinear(preset.zenith); const hor = srgbToLinear(preset.horizon); const gnd = srgbToLinear(preset.ground);
  const panels = (preset.panels ?? []).map((p) => {
    const c = dirOf(p.az, p.el);
    let t = cross([0, 0, 1], c); if (Math.hypot(...t) < 1e-6) t = [1, 0, 0];
    t = normalize(t);
    const b = normalize(cross(c, t));
    return { c, t, b, half: (25 * p.size) / 80, radiance: srgbToLinear(p.color ?? '#ffffff').map((v) => v * p.intensity) };
  });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = equirectToDir((x + 0.5) / width, (y + 0.5) / height);
      const h = d[2];
      let col;
      if (h >= 0) { const k = Math.pow(Math.min(1, h), 0.6); col = [0, 1, 2].map((i) => hor[i] + (zen[i] - hor[i]) * k); }
      else { const k = Math.pow(Math.min(1, -h * 4), 0.5); col = [0, 1, 2].map((i) => hor[i] + (gnd[i] - hor[i]) * k); }
      for (const p of panels) {
        const cd = dot(d, p.c);
        if (cd <= 0) continue;
        const u = dot(d, p.t) / cd; const v = dot(d, p.b) / cd;
        const edge = p.half * 0.12;
        const w = smooth(p.half + edge, p.half - edge, Math.abs(u)) * smooth(p.half + edge, p.half - edge, Math.abs(v));
        if (w > 0) col = col.map((c0, i) => c0 * (1 - w) + p.radiance[i] * w);
      }
      const o = (y * width + x) * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 1;
    }
  }
  return { data, width, height };
}

/** The map with its sampling tables and the irradiance it gives an upward surface (the shadow catcher's reference). */
export function prepareEnvironment(map) {
  const cdf = envCdf(map.data, map.width, map.height);
  return { ...map, cdf, irradianceUp: envIrradianceUp(map.data, map.width, map.height) };
}

/**
 * The sun of a preset as a light: direction (toward the sun), irradiance (rgb, at normal incidence) and the cosine
 * of its angular radius. intensity × softness come from the render settings.
 */
export function sunLight(preset, { intensity = 1, softness = 1 } = {}) {
  const e = srgbToLinear(preset.sun.color).map((v) => v * preset.sun.intensity * intensity);
  const radius = Math.max(0.05, preset.sun.radius * softness);
  return { dir: dirOf(preset.sun.az, preset.sun.el), irradiance: e, cosMax: Math.cos((radius * Math.PI) / 180) };
}

/** Reads a Radiance .hdr (RGBE, run-length encoded or flat) into { data (RGBA float), width, height }. */
export function parseHdr(buffer) {
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  const line = () => { let s = ''; while (pos < bytes.length && bytes[pos] !== 10) s += String.fromCharCode(bytes[pos++]); pos += 1; return s; };
  const magic = line();
  if (!magic.startsWith('#?')) throw new Error('not a Radiance HDR file');
  let l;
  while ((l = line()) !== '') { if (pos >= bytes.length) throw new Error('bad HDR header'); }
  const res = line().match(/^-Y (\d+) \+X (\d+)$/);
  if (!res) throw new Error('unsupported HDR orientation');
  const height = Number(res[1]); const width = Number(res[2]);
  const data = new Float32Array(width * height * 4);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (width >= 8 && width < 32768 && bytes[pos] === 2 && bytes[pos + 1] === 2 && !(bytes[pos + 2] & 0x80)) {
      pos += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < width) {
          let n = bytes[pos++];
          if (n > 128) { n -= 128; const v = bytes[pos++]; while (n--) scan[(x++) * 4 + c] = v; }
          else { while (n--) scan[(x++) * 4 + c] = bytes[pos++]; }
        }
      }
    } else {
      for (let x = 0; x < width; x++) { for (let c = 0; c < 4; c++) scan[x * 4 + c] = bytes[pos++]; }
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3];
      const f = e ? 2 ** (e - 136) : 0;
      const o = (y * width + x) * 4;
      data[o] = scan[x * 4] * f; data[o + 1] = scan[x * 4 + 1] * f; data[o + 2] = scan[x * 4 + 2] * f; data[o + 3] = 1;
    }
  }
  // A latitude-longitude map has the zenith on its top row: the layout of this renderer's Z-up maps.
  return { data, width, height };
}

/** A Radiance .hdr of a map (run-length scanlines, no runs): the tests write one and read it back. */
export function writeHdr({ data, width, height }) {
  const head = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  const bytes = [];
  for (let i = 0; i < head.length; i++) bytes.push(head.charCodeAt(i));
  const rgbe = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const m = Math.max(data[o], data[o + 1], data[o + 2]);
      if (m < 1e-32) { rgbe.fill(0, x * 4, x * 4 + 4); continue; }
      const e = Math.ceil(Math.log2(m) + 1e-9);
      const f = 256 / 2 ** e;
      for (let c = 0; c < 3; c++) rgbe[x * 4 + c] = Math.min(255, Math.floor(data[o + c] * f));
      rgbe[x * 4 + 3] = e + 128;
    }
    bytes.push(2, 2, width >> 8, width & 255);
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < width; x += 128) {
        const n = Math.min(128, width - x);
        bytes.push(n);
        for (let k = 0; k < n; k++) bytes.push(rgbe[(x + k) * 4 + c]);
      }
    }
  }
  return new Uint8Array(bytes).buffer;
}

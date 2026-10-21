/* 3D volume rendering (VR / MIP / MinIP / average / isosurface) — WebGL2 ray marching.
 *
 * Pure parts (Node + browser):
 *   Volume3D.buildVolume({ slices, nx, ny, positions?, spacing?, orientation?, sliceSpacing?, format? })
 *       → { data, format, nx, ny, nz, sx, sy, sz, min, max, order, axes: { row, col, normal }, irregular }
 *   Volume3D.planTexture({ nx, ny, nz }, { maxSize, maxBytes, bytesPerVoxel }) → { fx, fy, fz, nx, ny, nz, bytes, downsampled }
 *   Volume3D.downsample(volume, plan) → volume (box-averaged)
 *   Volume3D.TRANSFER_PRESETS  { id: { label, space: 'value' | 'relative', points: [[pos, r, g, b, a], …] } }
 *   Volume3D.buildTransferLUT(preset, min, max, { size, shift, opacity }) → Uint8Array RGBA (size × 4)
 *   Volume3D.VIEWS  preset camera bases (anterior, posterior, left, right, superior, inferior)
 *
 * Browser only:
 *   Volume3D.createRenderer(canvas, volume, options) → renderer (see createRenderer below)
 *   Volume3D.dialog(box, payload, ctx)   the 'volume' dialog (payload { files?: [paths], multiframe?: path, name })
 *   Volume3D.SIZE   popup size hint
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Volume3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────────────────── vector helpers ───────────────────────── */
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const isVec3 = (p) => p != null && typeof p === 'object' && p.length === 3 && Array.from(p).every((x) => Number.isFinite(+x));
  // rotate v about unit axis k by angle a (Rodrigues)
  function rotateVec(v, k, a) {
    const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  }

  /* ───────────────────────── volume building ───────────────────────── */
  /**
   * slices: [Float32Array nx*ny] (rescaled values, NaN = padding)
   * positions: per slice [x, y, z] (Image Position Patient) or a number (slice location); optional
   * spacing: [row, col] mm (Pixel Spacing: row spacing = between rows = y, column spacing = between columns = x)
   * orientation: [rx, ry, rz, cx, cy, cz] (Image Orientation Patient)
   * sliceSpacing: fallback slice gap when the positions do not give one
   * format: 'float32' (default, real values) | 'uint16' (normalised 0..65535 over min..max)
   */
  function buildVolume(o) {
    const slices = o.slices || [];
    const nx = o.nx | 0, ny = o.ny | 0, nz = slices.length;
    if (!nz || nx <= 0 || ny <= 0) throw new Error('buildVolume: no slices');
    const n = nx * ny;
    for (const s of slices) if (!s || s.length < n) throw new Error('buildVolume: slice size mismatch');
    const ori = o.orientation && o.orientation.length >= 6 && o.orientation.slice(0, 6).every((v) => Number.isFinite(+v)) ? o.orientation.slice(0, 6).map(Number) : null;
    let row = [1, 0, 0], col = [0, 1, 0], normal = [0, 0, 1];
    if (ori) {
      row = norm(ori.slice(0, 3)); col = norm(ori.slice(3, 6));
      normal = norm(cross(row, col));
    }
    const pos = Array.isArray(o.positions) && o.positions.length === nz ? o.positions : null;
    let keys;
    if (pos && pos.every((p) => isVec3(p))) {
      const P = pos.map((p) => [+p[0], +p[1], +p[2]]);
      if (!ori && nz > 1) {
        // no orientation: sort along the direction the positions spread in
        let a = 0, b = 0, best = -1;
        for (let i = 0; i < nz; i++) { const d = len(sub(P[i], P[0])); if (d > best) { best = d; b = i; } }
        a = 0; for (let i = 0; i < nz; i++) { const d = len(sub(P[i], P[b])); if (d > best) { best = d; a = i; } }
        const d = sub(P[b], P[a]);
        if (len(d) > 1e-9) { let dir = norm(d); if (dot(dir, normal) < 0) dir = scale(dir, -1); normal = dir; }
      }
      keys = P.map((p) => dot(p, normal));
    } else if (pos && pos.every((p) => Number.isFinite(+p))) {
      keys = pos.map(Number);
    } else {
      keys = slices.map((_, i) => i);
    }
    const order = keys.map((_, i) => i).sort((a, b) => keys[a] - keys[b] || a - b);
    const sortedKeys = order.map((i) => keys[i]);
    // median of the non-zero gaps
    let sz = +o.sliceSpacing > 0 ? +o.sliceSpacing : 1;
    let irregular = false;
    if (nz > 1 && (pos)) {
      const gaps = [];
      for (let i = 1; i < nz; i++) { const g = Math.abs(sortedKeys[i] - sortedKeys[i - 1]); if (g > 1e-6) gaps.push(g); }
      if (gaps.length) {
        gaps.sort((a, b) => a - b);
        sz = gaps[gaps.length >> 1];
        irregular = gaps[gaps.length - 1] - gaps[0] > Math.max(0.01, sz * 0.05);
      }
    }
    const sp = Array.isArray(o.spacing) && o.spacing.length >= 2 && o.spacing[0] > 0 && o.spacing[1] > 0 ? o.spacing : [1, 1];
    // range (NaN ignored)
    let min = Infinity, max = -Infinity;
    for (let z = 0; z < nz; z++) { const s = slices[z]; for (let i = 0; i < n; i++) { const v = s[i]; if (v === v && v !== Infinity && v !== -Infinity) { if (v < min) min = v; if (v > max) max = v; } } }
    if (!Number.isFinite(min)) { min = 0; max = 0; }
    const format = o.format === 'uint16' ? 'uint16' : 'float32';
    let data;
    if (format === 'uint16') {
      data = new Uint16Array(n * nz);
      const k = max > min ? 65535 / (max - min) : 0;
      for (let z = 0; z < nz; z++) {
        const s = slices[order[z]], off = z * n;
        for (let i = 0; i < n; i++) { const v = s[i]; data[off + i] = v === v && v !== Infinity && v !== -Infinity ? Math.round((v - min) * k) : 0; }
      }
    } else {
      data = new Float32Array(n * nz);
      for (let z = 0; z < nz; z++) {
        const s = slices[order[z]], off = z * n;
        for (let i = 0; i < n; i++) { const v = s[i]; data[off + i] = v === v && v !== Infinity && v !== -Infinity ? v : min; }
      }
    }
    return { data, format, nx, ny, nz, sx: +sp[1], sy: +sp[0], sz, min, max, order, axes: { row, col, normal }, irregular, origin: pos && isVec3(pos[order[0]]) ? pos[order[0]].map(Number) : null };
  }

  /** Normalised (0..1) value of voxel i of a volume. */
  function normValue(vol, i) {
    if (vol.format === 'uint16') return vol.data[i] / 65535;
    const r = vol.max - vol.min;
    return r > 0 ? (vol.data[i] - vol.min) / r : 0;
  }

  /**
   * Texture size decision: integer down-sampling factors per axis so that each axis fits maxSize
   * (MAX_3D_TEXTURE_SIZE) and the texture fits maxBytes. The axis with the largest output size is reduced first.
   */
  function planTexture(dims, opts = {}) {
    const maxSize = Math.max(1, opts.maxSize || 2048);
    const maxBytes = opts.maxBytes || 512 * 1024 * 1024;
    const bpv = opts.bytesPerVoxel || 2;
    const N = [dims.nx, dims.ny, dims.nz];
    const f = N.map((v) => Math.max(1, Math.ceil(v / maxSize)));
    const out = () => N.map((v, i) => Math.ceil(v / f[i]));
    const bytes = () => { const o = out(); return o[0] * o[1] * o[2] * bpv; };
    let guard = 0;
    while (bytes() > maxBytes && guard++ < 10000) {
      const o = out();
      let a = 0; for (let i = 1; i < 3; i++) if (o[i] > o[a]) a = i;
      if (o[a] <= 1) break;
      f[a]++;
    }
    const o = out();
    return { fx: f[0], fy: f[1], fz: f[2], nx: o[0], ny: o[1], nz: o[2], bytes: o[0] * o[1] * o[2] * bpv, downsampled: f[0] > 1 || f[1] > 1 || f[2] > 1 };
  }

  /** Box-average down-sampling (the plan from planTexture). Keeps the format; spacing grows by the factors. */
  function downsample(vol, plan) {
    if (!plan || !plan.downsampled) return vol;
    const { fx, fy, fz } = plan, NX = plan.nx, NY = plan.ny, NZ = plan.nz;
    const src = vol.data, nx = vol.nx, ny = vol.ny, nz = vol.nz;
    const out = vol.format === 'uint16' ? new Uint16Array(NX * NY * NZ) : new Float32Array(NX * NY * NZ);
    const rowAcc = new Float64Array(NX), rowCnt = new Uint32Array(NX);
    for (let Z = 0; Z < NZ; Z++) {
      for (let Y = 0; Y < NY; Y++) {
        rowAcc.fill(0); rowCnt.fill(0);
        for (let z = Z * fz; z < Math.min(nz, Z * fz + fz); z++) {
          for (let y = Y * fy; y < Math.min(ny, Y * fy + fy); y++) {
            const base = (z * ny + y) * nx;
            for (let x = 0; x < nx; x++) { const X = (x / fx) | 0; rowAcc[X] += src[base + x]; rowCnt[X]++; }
          }
        }
        const ob = (Z * NY + Y) * NX;
        for (let X = 0; X < NX; X++) out[ob + X] = rowCnt[X] ? rowAcc[X] / rowCnt[X] : 0;
      }
    }
    return { ...vol, data: out, nx: NX, ny: NY, nz: NZ, sx: vol.sx * fx, sy: vol.sy * fy, sz: vol.sz * fz, downsampledFrom: [nx, ny, nz] };
  }

  /* ───────────────────────── transfer functions ───────────────────────── */
  // [position, r, g, b, opacity per voxel step]. space 'value': position in rescaled units (HU for CT);
  // 'relative': 0..1 over the volume's value range.
  const TRANSFER_PRESETS = {
    'ct-bone': { label: 'CT bone', space: 'value', points: [
      [-3024, 0, 0, 0, 0], [120, 0.55, 0.28, 0.18, 0], [200, 0.85, 0.6, 0.42, 0.18], [350, 0.95, 0.86, 0.72, 0.5], [800, 1, 0.97, 0.9, 0.8], [3071, 1, 1, 1, 0.9]] },
    'ct-soft': { label: 'CT soft tissue', space: 'value', points: [
      [-3024, 0, 0, 0, 0], [-700, 0.55, 0.3, 0.22, 0], [-450, 0.85, 0.6, 0.48, 0.04], [-200, 0.9, 0.68, 0.56, 0.06], [20, 0.78, 0.32, 0.26, 0.1],
      [120, 0.88, 0.55, 0.42, 0.22], [300, 0.98, 0.9, 0.78, 0.55], [3071, 1, 1, 1, 0.75]] },
    'ct-lung': { label: 'CT lung', space: 'value', points: [
      [-3024, 0, 0, 0, 0], [-980, 0.3, 0.2, 0.2, 0], [-880, 0.78, 0.48, 0.42, 0.05], [-650, 0.95, 0.72, 0.62, 0.14], [-450, 0.96, 0.85, 0.78, 0.03],
      [-300, 0.9, 0.8, 0.75, 0], [3071, 1, 1, 1, 0]] },
    'ct-angio': { label: 'CT angio', space: 'value', points: [
      [-3024, 0, 0, 0, 0], [110, 0.55, 0.08, 0.05, 0], [180, 0.82, 0.2, 0.12, 0.22], [300, 1, 0.55, 0.4, 0.5], [600, 1, 0.9, 0.78, 0.75], [3071, 1, 1, 1, 0.85]] },
    'mr-default': { label: 'MR', space: 'relative', points: [
      [0, 0, 0, 0, 0], [0.08, 0.3, 0.15, 0.1, 0], [0.25, 0.75, 0.48, 0.38, 0.06], [0.5, 0.95, 0.78, 0.66, 0.25], [1, 1, 1, 1, 0.6]] },
    'mip-gray': { label: 'Grey ramp', space: 'relative', points: [
      [0, 0, 0, 0, 0], [0.1, 0.1, 0.1, 0.1, 0], [1, 1, 1, 1, 0.5]] },
  };

  /** RGBA LUT (Uint8Array size × 4) spanning [min, max]. shift moves the curve along the value axis (units), opacity scales alpha. */
  function buildTransferLUT(preset, min, max, opts = {}) {
    const p = typeof preset === 'string' ? TRANSFER_PRESETS[preset] : preset;
    if (!p) throw new Error('unknown transfer preset');
    const size = opts.size || 1024;
    const shift = +opts.shift || 0, op = opts.opacity == null ? 1 : +opts.opacity;
    const pts = p.points;
    const out = new Uint8Array(size * 4);
    const range = max - min || 1;
    let k = 0;
    for (let i = 0; i < size; i++) {
      const value = min + (i / (size - 1)) * range - shift;
      const x = p.space === 'relative' ? (value - min) / range : value;
      while (k < pts.length - 2 && x > pts[k + 1][0]) k++;
      while (k > 0 && x < pts[k][0]) k--;
      let c;
      if (x <= pts[0][0]) c = pts[0];
      else if (x >= pts[pts.length - 1][0]) c = pts[pts.length - 1];
      else {
        const a = pts[k], b = pts[k + 1], t = b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 0;
        c = [x, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t];
      }
      out[i * 4] = Math.round(clamp(c[1], 0, 1) * 255);
      out[i * 4 + 1] = Math.round(clamp(c[2], 0, 1) * 255);
      out[i * 4 + 2] = Math.round(clamp(c[3], 0, 1) * 255);
      out[i * 4 + 3] = Math.round(clamp(c[4] * op, 0, 1) * 255);
    }
    return out;
  }

  /* ───────────────────────── camera presets (patient LPS: +x left, +y posterior, +z superior) ───────────────────────── */
  // r: screen right, u: screen up, b: toward the viewer (camera looks along -b)
  const VIEWS = {
    anterior: { r: [1, 0, 0], u: [0, 0, 1], b: [0, -1, 0] },
    posterior: { r: [-1, 0, 0], u: [0, 0, 1], b: [0, 1, 0] },
    left: { r: [0, 1, 0], u: [0, 0, 1], b: [1, 0, 0] },
    right: { r: [0, -1, 0], u: [0, 0, 1], b: [-1, 0, 0] },
    superior: { r: [-1, 0, 0], u: [0, -1, 0], b: [0, 0, 1] },
    inferior: { r: [1, 0, 0], u: [0, -1, 0], b: [0, 0, -1] },
  };
  const DIR_LETTERS = [['R', 'L'], ['A', 'P'], ['I', 'S']];   // negative / positive LPS axis
  /** Anatomical letters (one or two) of a direction in patient space. */
  function dirLabel(v) {
    const a = [0, 1, 2].map((i) => ({ i, m: Math.abs(v[i]) })).sort((p, q) => q.m - p.m);
    let s = DIR_LETTERS[a[0].i][v[a[0].i] > 0 ? 1 : 0];
    if (a[1].m > 0.38 * a[0].m && a[1].m > 0.25) s += DIR_LETTERS[a[1].i][v[a[1].i] > 0 ? 1 : 0];
    return s;
  }

  const QUALITY = { fast: 0.7, normal: 1.4, best: 2.5 };   // samples per voxel

  /* ───────────────────────── WebGL2 renderer ───────────────────────── */
  const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler3D;
uniform sampler3D uVol; uniform sampler2D uLut;
uniform vec3 uBoxH, uClipMin, uClipMax, uR, uU, uF, uCenter, uTexel, uIsoColor, uBg, uLight;
uniform vec2 uHalf;
uniform float uStep, uStepRatio, uWLo, uWHi, uIso, uLutN;
uniform int uMode, uShade, uMaxSteps;
in vec2 vUv; out vec4 o;

float vol(vec3 tc) { return textureLod(uVol, tc, 0.0).r; }   // textureLod: no implicit derivatives inside the dynamic loop (ANGLE / D3D11 miscompiles texture() there)
vec3 gradAt(vec3 tc) {
  vec3 g = vec3(vol(tc + vec3(uTexel.x, 0, 0)) - vol(tc - vec3(uTexel.x, 0, 0)),
                vol(tc + vec3(0, uTexel.y, 0)) - vol(tc - vec3(0, uTexel.y, 0)),
                vol(tc + vec3(0, 0, uTexel.z)) - vol(tc - vec3(0, 0, uTexel.z)));
  return g * 0.5;   // per voxel
}
vec3 shade(vec3 c, vec3 tc, float strength) {
  vec3 gv = gradAt(tc);
  float gm = length(gv);
  if (gm < 1e-4) return c * (0.35 + 0.65 * (1.0 - strength));
  // per-voxel gradient → box-space gradient (divide by voxel size along each axis)
  vec3 n = normalize(-gv / (uTexel * 2.0 * uBoxH));
  vec3 L = uLight;
  float d = abs(dot(n, L));
  vec3 H = normalize(L - uF);
  float s = pow(abs(dot(n, H)), 28.0);
  vec3 lit = c * (0.28 + 0.72 * d) + vec3(0.32 * s);
  return mix(c, lit, strength);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lutCoord(float v) { return (v * (uLutN - 1.0) + 0.5) / uLutN; }

void main() {
  vec3 ro = uCenter + vUv.x * uHalf.x * uR + vUv.y * uHalf.y * uU - uF * 4.0;
  vec3 rd = uF;
  vec3 bmin = -uBoxH + uClipMin * 2.0 * uBoxH, bmax = -uBoxH + uClipMax * 2.0 * uBoxH;
  vec3 inv = 1.0 / vec3(abs(rd.x) < 1e-8 ? 1e-8 : rd.x, abs(rd.y) < 1e-8 ? 1e-8 : rd.y, abs(rd.z) < 1e-8 ? 1e-8 : rd.z);
  vec3 t0s = (bmin - ro) * inv, t1s = (bmax - ro) * inv;
  vec3 tsm = min(t0s, t1s), tbg = max(t0s, t1s);
  float t0 = max(max(tsm.x, tsm.y), tsm.z), t1 = min(min(tbg.x, tbg.y), tbg.z);
  if (t1 <= t0 || any(greaterThanEqual(uClipMin, uClipMax))) { o = vec4(uBg, 1.0); return; }
  float t = t0 + uStep * hash(gl_FragCoord.xy);
  vec3 sc = 1.0 / (2.0 * uBoxH);
  vec4 acc = vec4(0.0);
  float m = uMode == 2 ? 1e9 : -1e9, sum = 0.0, cnt = 0.0;
  bool hit = false; vec3 hitTc = vec3(0.0);
  for (int i = 0; i < 16384; i++) {
    if (i >= uMaxSteps || t > t1) break;
    vec3 tc = (ro + rd * t) * sc + 0.5;
    float v = vol(tc);
    if (uMode == 0) {
      vec4 s = textureLod(uLut, vec2(lutCoord(v), 0.5), 0.0);
      if (s.a > 0.001) {
        float a = 1.0 - pow(1.0 - min(s.a, 0.999), uStepRatio);
        vec3 c = uShade == 1 ? shade(s.rgb, tc, 1.0) : s.rgb;
        acc.rgb += (1.0 - acc.a) * a * c;
        acc.a += (1.0 - acc.a) * a;
        if (acc.a > 0.985) break;
      }
    } else if (uMode == 1) { m = max(m, v); }
    else if (uMode == 2) { m = min(m, v); }
    else if (uMode == 3) { sum += v; cnt += 1.0; }
    else if (uMode == 4) {
      if (v >= uIso) {
        // refine the crossing between the previous and this sample
        float ta = max(t0, t - uStep), tb = t;
        for (int k = 0; k < 6; k++) {
          float tm = 0.5 * (ta + tb);
          if (vol((ro + rd * tm) * sc + 0.5) >= uIso) tb = tm; else ta = tm;
        }
        hitTc = (ro + rd * tb) * sc + 0.5; hit = true; break;
      }
    }
    t += uStep;
  }
  if (uMode == 0) { o = vec4(acc.rgb + (1.0 - acc.a) * uBg, 1.0); return; }
  if (uMode == 4) {
    if (!hit) { o = vec4(uBg, 1.0); return; }
    o = vec4(uShade == 1 ? shade(uIsoColor, hitTc, 1.0) : uIsoColor, 1.0); return;
  }
  float val = uMode == 3 ? (cnt > 0.0 ? sum / cnt : 0.0) : m;
  float g = clamp((val - uWLo) / max(1e-6, uWHi - uWLo), 0.0, 1.0);
  o = vec4(vec3(g), 1.0);
}`;

  const BLIT_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; in vec2 vUv; out vec4 o;
void main() { o = texture(uTex, vUv * 0.5 + 0.5); }`;

  /**
   * createRenderer(canvas, volume, options) — volume from buildVolume().
   * options (all optional, also accepted by setOptions):
   *   mode: 'vr' | 'mip' | 'minip' | 'avg' | 'iso'          (default 'vr')
   *   preset: key of TRANSFER_PRESETS or a preset object   (default 'ct-soft' when the range looks like HU, else 'mr-default')
   *   shift (value units), opacity (0..4 scale)            transfer function adjustments
   *   wc, ww                                               window for mip / minip / avg (value units)
   *   threshold                                            isosurface level (value units)
   *   isoColor: [r, g, b] 0..1, shading: bool, background: [r, g, b] 0..1
   *   quality: 'fast' | 'normal' | 'best'
   *   clip: { x0, x1, y0, y1, z0, z1 } 0..1 along the volume's column / row / slice axes
   *   view: 'anterior' | 'posterior' | 'left' | 'right' | 'superior' | 'inferior'
   *   zoom (1 = fit), pan [x, y] (box units)
   *   interactive: true (mouse rotate / pan / zoom), interactiveScale: 0.5 (resolution while dragging)
   *   maxBytes: texture budget (default 512 MB), precision: 'half' | 'float'
   *   onRender(info) callback after each frame
   * Methods: setOptions(patch), getOptions(), setView(name), resetView(), rotate(dx, dy) (radians),
   *   render() (sync, returns ms), snapshot(type) → Promise<Blob>, snapshotCanvas() → 2D canvas copy,
   *   orientationLabels() → { left, right, top, bottom }, info(), destroy()
   */
  function createRenderer(canvas, volume, options = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    const maxSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) || 256;
    const floatLinear = !!gl.getExtension('OES_texture_float_linear');
    gl.getExtension('EXT_color_buffer_float');

    const opts = {
      mode: 'vr', preset: null, shift: 0, opacity: 1, wc: null, ww: null, threshold: null,
      isoColor: [0.93, 0.86, 0.74], shading: true, background: [0, 0, 0], quality: 'normal',
      clip: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 }, zoom: 1, pan: [0, 0], interactive: true, interactiveScale: 0.5,
      maxBytes: 512 * 1024 * 1024, precision: 'half', onRender: null,
    };
    Object.assign(opts, options, { clip: { ...opts.clip, ...(options.clip || {}) } });
    const looksHU = volume.min <= -500 && volume.max >= 300;
    if (!opts.preset) opts.preset = looksHU ? 'ct-soft' : 'mr-default';
    if (!(opts.ww > 0)) { opts.ww = Math.max(1e-6, volume.max - volume.min); opts.wc = (volume.max + volume.min) / 2; }
    if (!Number.isFinite(opts.threshold)) opts.threshold = looksHU ? 250 : volume.min + (volume.max - volume.min) * 0.3;

    let dragging = false, destroyed = false, raf = 0, idleTimer = 0, lastMs = 0;

    // ── shaders ──
    function compile(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: ' + e); }
      return s;
    }
    function program(vs, fs) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    }
    const prog = program(VS, FS), blit = program(VS, BLIT_FS);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // ── volume texture ──
    let tex = null, texFormat = '', texVol = null;
    function uploadVolume() {
      const wantFloat = opts.precision === 'float' && floatLinear;
      const tryFormats = wantFloat ? ['r32f', 'r16f', 'r8'] : ['r16f', 'r8'];
      for (const f of tryFormats) {
        const bpv = f === 'r32f' ? 4 : f === 'r16f' ? 2 : 1;
        const plan = planTexture(volume, { maxSize, maxBytes: opts.maxBytes, bytesPerVoxel: bpv });
        const v = downsample(volume, plan);
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, t);
        while (gl.getError()) { /* clear */ }
        const ifmt = f === 'r32f' ? gl.R32F : f === 'r16f' ? gl.R16F : gl.R8;
        gl.texStorage3D(gl.TEXTURE_3D, 1, ifmt, v.nx, v.ny, v.nz);
        if (gl.getError()) { gl.deleteTexture(t); continue; }
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        const per = v.nx * v.ny, slab = Math.max(1, Math.floor((8 * 1024 * 1024) / per));
        const r = v.max - v.min, k = v.format === 'uint16' ? 1 / 65535 : r > 0 ? 1 / r : 0, off = v.format === 'uint16' ? 0 : v.min;
        for (let z = 0; z < v.nz; z += slab) {
          const d = Math.min(slab, v.nz - z), cnt = d * per, src = v.data, base = z * per;
          if (f === 'r8') {
            const buf = new Uint8Array(cnt);
            for (let i = 0; i < cnt; i++) buf[i] = Math.round(clamp((src[base + i] - off) * k, 0, 1) * 255);
            gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, v.nx, v.ny, d, gl.RED, gl.UNSIGNED_BYTE, buf);
          } else {
            const buf = new Float32Array(cnt);
            for (let i = 0; i < cnt; i++) buf[i] = (src[base + i] - off) * k;
            gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, z, v.nx, v.ny, d, gl.RED, gl.FLOAT, buf);
          }
        }
        if (gl.getError()) { gl.deleteTexture(t); continue; }
        const filt = f === 'r32f' && !floatLinear ? gl.NEAREST : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filt);
        for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
        tex = t; texFormat = f; texVol = { nx: v.nx, ny: v.ny, nz: v.nz, sx: v.sx, sy: v.sy, sz: v.sz, plan };
        return;
      }
      throw new Error('Could not allocate the 3D texture');
    }
    uploadVolume();

    // ── transfer LUT ──
    const LUT_N = 1024;
    const lut = gl.createTexture();
    function uploadLut() {
      const data = buildTransferLUT(opts.preset, volume.min, volume.max, { size: LUT_N, shift: opts.shift, opacity: opts.opacity });
      gl.bindTexture(gl.TEXTURE_2D, lut);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    uploadLut();

    // ── geometry: box in voxel-axis space, patient frame via the axes ──
    const ext = [volume.nx * volume.sx, volume.ny * volume.sy, volume.nz * volume.sz];
    const maxExt = Math.max(...ext) || 1;
    const boxH = ext.map((e) => e / maxExt / 2);
    const A = volume.axes || { row: [1, 0, 0], col: [0, 1, 0], normal: [0, 0, 1] };
    const toBox = (w) => [dot(w, A.row), dot(w, A.col), dot(w, A.normal)];   // patient → box (orthonormal M^T)

    let cam = null;
    function setView(name) {
      const v = VIEWS[name] || VIEWS.anterior;
      cam = { r: v.r.slice(), u: v.u.slice(), b: v.b.slice() };
      opts.view = name;
      schedule();
    }
    function resetView() { opts.zoom = 1; opts.pan = [0, 0]; setView('anterior'); }
    function orbit(ax, ay) {   // ax: about screen up (drag right → front moves right), ay: about screen right (drag down → front moves down)
      // object rotation Q ⇒ camera rotates by Q^-1
      const up = cam.u.slice();
      for (const k of ['r', 'u', 'b']) cam[k] = rotateVec(cam[k], up, -ax);
      const right = cam.r.slice();
      for (const k of ['r', 'u', 'b']) cam[k] = rotateVec(cam[k], right, -ay);
      // re-orthonormalise
      cam.b = norm(cam.b); cam.r = norm(cross(cam.u, cam.b)); cam.u = norm(cross(cam.b, cam.r));
      schedule();
    }
    setView(opts.view || 'anterior');

    // ── offscreen target for reduced-resolution interactive frames ──
    let fbo = null, fboTex = null, fboW = 0, fboH = 0;
    function ensureFbo(w, h) {
      if (fbo && fboW === w && fboH === h) return;
      if (!fbo) { fbo = gl.createFramebuffer(); fboTex = gl.createTexture(); }
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      fboW = w; fboH = h;
    }

    function fitCanvas() {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const cw = Math.max(1, Math.round((canvas.clientWidth || canvas.width) * dpr));
      const ch = Math.max(1, Math.round((canvas.clientHeight || canvas.height) * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    }

    function draw(lowRes) {
      fitCanvas();
      const W = canvas.width, H = canvas.height;
      const s = lowRes ? clamp(opts.interactiveScale || 0.5, 0.2, 1) : 1;
      const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
      const R = toBox(cam.r), U = toBox(cam.u), F = toBox(scale(cam.b, -1));
      const pan = opts.pan || [0, 0];
      const center = add(scale(R, -pan[0]), scale(U, -pan[1]));
      const halfH = 0.9 / Math.max(0.05, opts.zoom || 1), halfW = halfH * (W / H);
      // step: smallest voxel edge in box units / samples per voxel
      const vox = [2 * boxH[0] / texVol.nx, 2 * boxH[1] / texVol.ny, 2 * boxH[2] / texVol.nz];
      const spv = (QUALITY[opts.quality] || QUALITY.normal) * (lowRes ? 0.6 : 1);
      // the voxel size along the ray (anisotropic volumes: thick slices need fewer samples)
      const along = 1 / Math.hypot(F[0] / vox[0], F[1] / vox[1], F[2] / vox[2]);
      let step = along / spv;
      const diag = 2 * len(boxH);
      const maxSteps = 16000;
      if (diag / step > maxSteps) step = diag / maxSteps;
      const stepRatio = step / along;
      const range = volume.max - volume.min || 1;
      const nv = (x) => (x - volume.min) / range;
      const p = prog.p, u = prog.u;
      if (lowRes) { ensureFbo(w, h); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex); gl.uniform1i(u.uVol, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lut); gl.uniform1i(u.uLut, 1);
      gl.uniform3fv(u.uBoxH, boxH);
      const c = opts.clip;
      gl.uniform3f(u.uClipMin, clamp(+c.x0, 0, 1), clamp(+c.y0, 0, 1), clamp(+c.z0, 0, 1));
      gl.uniform3f(u.uClipMax, clamp(+c.x1, 0, 1), clamp(+c.y1, 0, 1), clamp(+c.z1, 0, 1));
      gl.uniform3fv(u.uR, R); gl.uniform3fv(u.uU, U); gl.uniform3fv(u.uF, F);
      gl.uniform3fv(u.uCenter, center);
      gl.uniform3f(u.uTexel, 1 / texVol.nx, 1 / texVol.ny, 1 / texVol.nz);
      gl.uniform3fv(u.uIsoColor, opts.isoColor);
      gl.uniform3fv(u.uBg, opts.background);
      // headlight, slightly from the upper left
      gl.uniform3fv(u.uLight, norm(add(add(scale(F, -1), scale(U, 0.35)), scale(R, -0.25))));
      gl.uniform2f(u.uHalf, halfW, halfH);
      gl.uniform1f(u.uStep, step);
      gl.uniform1f(u.uStepRatio, stepRatio);
      gl.uniform1f(u.uWLo, nv(opts.wc - opts.ww / 2));
      gl.uniform1f(u.uWHi, nv(opts.wc + opts.ww / 2));
      gl.uniform1f(u.uIso, nv(opts.threshold));
      gl.uniform1f(u.uLutN, LUT_N);
      gl.uniform1i(u.uMode, ({ vr: 0, mip: 1, minip: 2, avg: 3, iso: 4 })[opts.mode] || 0);
      gl.uniform1i(u.uShade, opts.shading ? 1 : 0);
      gl.uniform1i(u.uMaxSteps, maxSteps);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (lowRes) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.useProgram(blit.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTex); gl.uniform1i(blit.u.uTex, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    function render(lowRes) {
      if (destroyed) return 0;
      const t0 = performance.now();
      draw(!!lowRes);
      const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // wait for the GPU
      lastMs = performance.now() - t0;
      if (opts.onRender) try { opts.onRender({ ms: lastMs, lowRes: !!lowRes, width: canvas.width, height: canvas.height }); } catch (_) { /* ignore */ }
      return lastMs;
    }
    function schedule(lowRes) {
      if (destroyed || typeof requestAnimationFrame === 'undefined') return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!canvas.isConnected) return;
        const low = !!lowRes && opts.interactiveScale < 1;
        draw(low);
        if (opts.onRender) try { opts.onRender({ lowRes: low, width: canvas.width, height: canvas.height }); } catch (_) { /* ignore */ }
        if (low) { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!dragging) schedule(false); }, 160); }
      });
    }

    // ── mouse interaction ──
    const listeners = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };
    if (opts.interactive) {
      let last = null, btn = 0;
      on(canvas, 'contextmenu', (e) => e.preventDefault());
      on(canvas, 'pointerdown', (e) => {
        btn = e.button; last = [e.clientX, e.clientY]; dragging = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        e.preventDefault();
      });
      on(canvas, 'pointermove', (e) => {
        if (!dragging || !last) return;
        const dx = e.clientX - last[0], dy = e.clientY - last[1];
        last = [e.clientX, e.clientY];
        const h = canvas.clientHeight || 400;
        if (btn === 0 && !e.shiftKey) orbit(dx / h * Math.PI, dy / h * Math.PI);
        else {
          const halfH = 0.9 / (opts.zoom || 1);
          opts.pan = [opts.pan[0] + dx / h * 2 * halfH, opts.pan[1] - dy / h * 2 * halfH];
        }
        schedule(true);
      });
      const up = (e) => { if (!dragging) return; dragging = false; last = null; try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ } clearTimeout(idleTimer); idleTimer = setTimeout(() => schedule(false), 60); };
      on(canvas, 'pointerup', up); on(canvas, 'pointercancel', up);
      on(canvas, 'wheel', (e) => {
        e.preventDefault();
        opts.zoom = clamp((opts.zoom || 1) * Math.exp(-e.deltaY * 0.0015), 0.2, 20);
        schedule(true);
      }, { passive: false });
      on(canvas, 'dblclick', () => resetView());
    }
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => schedule(false)); ro.observe(canvas); }
    on(canvas, 'webglcontextlost', (e) => { e.preventDefault(); destroyed = true; });

    function setOptions(patch = {}) {
      const p = { ...patch };
      if (p.clip) p.clip = { ...opts.clip, ...p.clip };
      const lutDirty = 'preset' in p || 'shift' in p || 'opacity' in p;
      const precDirty = 'precision' in p && p.precision !== opts.precision || 'maxBytes' in p && p.maxBytes !== opts.maxBytes;
      Object.assign(opts, p);
      if (lutDirty) uploadLut();
      if (precDirty) { gl.deleteTexture(tex); uploadVolume(); }
      if (p.view) setView(p.view);
      schedule(false);
    }

    function snapshotCanvas() {
      render(false);
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      c.getContext('2d').drawImage(canvas, 0, 0);
      return c;
    }
    function snapshot(type = 'image/png', quality) {
      const c = snapshotCanvas();
      return new Promise((res) => c.toBlob(res, type, quality));
    }
    function orientationLabels() {
      return { left: dirLabel(scale(cam.r, -1)), right: dirLabel(cam.r), top: dirLabel(cam.u), bottom: dirLabel(scale(cam.u, -1)), front: dirLabel(cam.b) };
    }
    function destroy() {
      if (destroyed && !tex) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
      if (ro) ro.disconnect();
      try {
        gl.deleteTexture(tex); gl.deleteTexture(lut); if (fboTex) gl.deleteTexture(fboTex); if (fbo) gl.deleteFramebuffer(fbo);
        gl.deleteBuffer(vbo); gl.deleteVertexArray(vao); gl.deleteProgram(prog.p); gl.deleteProgram(blit.p);
        const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      } catch (_) { /* ignore */ }
      tex = null;
    }

    schedule(false);
    return {
      gl, setOptions, setView, resetView, render, snapshot, snapshotCanvas, orientationLabels, destroy,
      rotate: (ax, ay) => orbit(ax, ay),
      getOptions: () => ({ ...opts, clip: { ...opts.clip }, pan: opts.pan.slice() }),
      camera: () => ({ r: cam.r.slice(), u: cam.u.slice(), b: cam.b.slice() }),
      info: () => ({ format: texFormat, texture: texVol && { nx: texVol.nx, ny: texVol.ny, nz: texVol.nz }, downsampled: !!(texVol && texVol.plan.downsampled), maxTextureSize: maxSize, floatLinear, lastMs }),
    };
  }

  /* ───────────────────────── dialog ───────────────────────── */
  const EN = {
    'vr.title': '3D volume rendering', 'vr.mode': 'Mode', 'vr.modeVr': 'Volume rendering', 'vr.modeMip': 'MIP', 'vr.modeMinip': 'MinIP', 'vr.modeAvg': 'Average',
    'vr.modeIso': 'Isosurface', 'vr.preset': 'Preset', 'vr.presetCtBone': 'CT bone', 'vr.presetCtSoft': 'CT soft tissue', 'vr.presetCtLung': 'CT lung',
    'vr.presetCtAngio': 'CT angio', 'vr.presetMr': 'MR', 'vr.presetGray': 'Grey ramp', 'vr.shift': 'Shift', 'vr.opacity': 'Opacity', 'vr.shading': 'Shading',
    'vr.threshold': 'Threshold', 'vr.window': 'Window', 'vr.ww': 'W', 'vr.wc': 'L', 'vr.autoWindow': 'Auto', 'vr.quality': 'Quality', 'vr.qualityFast': 'Fast',
    'vr.qualityNormal': 'Normal', 'vr.qualityBest': 'Best', 'vr.clipping': 'Clipping', 'vr.clipX': 'Columns (X)', 'vr.clipY': 'Rows (Y)', 'vr.clipZ': 'Slices (Z)',
    'vr.clipReset': 'Reset clipping', 'vr.views': 'View', 'vr.viewAnterior': 'Anterior', 'vr.viewPosterior': 'Posterior', 'vr.viewLeft': 'Left',
    'vr.viewRight': 'Right', 'vr.viewSuperior': 'Superior', 'vr.viewInferior': 'Inferior', 'vr.reset': 'Reset view', 'vr.export': 'Export PNG',
    'vr.close': 'Close', 'vr.loading': 'Loading {done} / {total}…', 'vr.building': 'Building volume…', 'vr.uploading': 'Uploading to the GPU…',
    'vr.noSlices': 'No slices to build a volume from.', 'vr.notGray': 'Volume rendering needs greyscale images.', 'vr.sizeMismatch': 'The images of the series have different sizes.',
    'vr.needSlices': 'At least 2 slices are needed for 3D.', 'vr.noWebgl': 'WebGL2 is not available — 3D rendering cannot run here.',
    'vr.hint': 'Drag: rotate · Right / middle or Shift+drag: pan · Wheel: zoom · Double-click: reset', 'vr.downsampled': 'downsampled to {size} for the GPU',
    'vr.irregular': 'uneven slice spacing', 'vr.saved': 'Saved {name}', 'vr.renderMs': '{ms} ms',
  };
  const KO = {
    'vr.title': '3D 볼륨 렌더링', 'vr.mode': '모드', 'vr.modeVr': '볼륨 렌더링', 'vr.modeMip': 'MIP', 'vr.modeMinip': 'MinIP', 'vr.modeAvg': '평균',
    'vr.modeIso': '등위면', 'vr.preset': '프리셋', 'vr.presetCtBone': 'CT 뼈', 'vr.presetCtSoft': 'CT 연부 조직', 'vr.presetCtLung': 'CT 폐',
    'vr.presetCtAngio': 'CT 혈관 조영', 'vr.presetMr': 'MR', 'vr.presetGray': '회색 경사', 'vr.shift': '이동', 'vr.opacity': '불투명도', 'vr.shading': '음영',
    'vr.threshold': '임계값', 'vr.window': '창', 'vr.ww': 'W', 'vr.wc': 'L', 'vr.autoWindow': '자동', 'vr.quality': '품질', 'vr.qualityFast': '빠르게',
    'vr.qualityNormal': '보통', 'vr.qualityBest': '최고', 'vr.clipping': '자르기', 'vr.clipX': '열 (X)', 'vr.clipY': '행 (Y)', 'vr.clipZ': '슬라이스 (Z)',
    'vr.clipReset': '자르기 초기화', 'vr.views': '보기', 'vr.viewAnterior': '앞', 'vr.viewPosterior': '뒤', 'vr.viewLeft': '왼쪽',
    'vr.viewRight': '오른쪽', 'vr.viewSuperior': '위', 'vr.viewInferior': '아래', 'vr.reset': '보기 초기화', 'vr.export': 'PNG로 내보내기',
    'vr.close': '닫기', 'vr.loading': '불러오는 중 {done} / {total}…', 'vr.building': '볼륨을 만드는 중…', 'vr.uploading': 'GPU로 올리는 중…',
    'vr.noSlices': '볼륨을 만들 슬라이스가 없습니다.', 'vr.notGray': '볼륨 렌더링은 흑백 영상만 할 수 있습니다.', 'vr.sizeMismatch': '시리즈의 영상 크기가 서로 다릅니다.',
    'vr.needSlices': '3D에는 슬라이스가 2장 이상 필요합니다.', 'vr.noWebgl': 'WebGL2를 쓸 수 없어 3D 렌더링을 할 수 없습니다.',
    'vr.hint': '끌기: 회전 · 오른쪽/가운데 버튼 또는 Shift+끌기: 이동 · 휠: 확대/축소 · 두 번 클릭: 초기화', 'vr.downsampled': 'GPU용으로 {size}(으)로 줄임',
    'vr.irregular': '슬라이스 간격이 고르지 않음', 'vr.saved': '{name} 저장함', 'vr.renderMs': '{ms} ms',
  };
  const I18N = { en: EN, ko: KO };

  const STYLE = `
.vr3d { display: flex; flex-direction: column; gap: 10px; }
.vr3d h2 { margin: 0; }
.vr3d .vr-sub { font-weight: 400; color: var(--text-dim); font-size: 12px; margin-left: 8px; }
.vr3d .vr-body { display: flex; gap: 12px; min-height: 0; }
.vr3d .vr-stage { position: relative; flex: 1 1 auto; min-width: 0; height: 620px; background: #000; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.vr3d .vr-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
.vr3d .vr-stage canvas:active { cursor: grabbing; }
.vr3d .vr-orient { position: absolute; color: #fbbf24; font: 600 13px var(--font); text-shadow: 0 0 3px #000; pointer-events: none; }
.vr3d .vr-orient.l { left: 8px; top: 50%; transform: translateY(-50%); } .vr3d .vr-orient.r { right: 8px; top: 50%; transform: translateY(-50%); }
.vr3d .vr-orient.t { top: 6px; left: 50%; transform: translateX(-50%); } .vr3d .vr-orient.b { bottom: 6px; left: 50%; transform: translateX(-50%); }
.vr3d .vr-overlay { position: absolute; left: 8px; bottom: 6px; color: #cbd5e1; font-size: 11px; pointer-events: none; text-shadow: 0 0 3px #000; }
.vr3d .vr-progress { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--accent); font-size: 14px; text-align: center; padding: 20px; }
.vr3d .vr-panel { flex: 0 0 270px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--text-dim); max-height: 620px; overflow-y: auto; }
.vr3d fieldset { min-width: 0; border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px 8px; margin: 0; display: flex; flex-direction: column; gap: 5px; }
.vr3d legend { padding: 0 4px; color: var(--text); font-weight: 600; }
.vr3d .vr-row { display: flex; align-items: center; gap: 6px; }
.vr3d .vr-row > span:first-child { flex: 0 0 64px; }
.vr3d .vr-row input[type=range] { flex: 1; min-width: 0; accent-color: var(--accent); }
.vr3d .vr-row .val { flex: 0 0 34px; text-align: right; font-family: var(--mono); color: var(--text); }
.vr3d select, .vr3d input[type=number] { background: var(--panel-bg2); border: 1px solid var(--border); border-radius: 4px; padding: 3px 5px; color: var(--text); }
.vr3d select { flex: 1; min-width: 0; }
.vr3d input[type=number] { width: 70px; }
.vr3d .vr-views { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.vr3d .vr-views .btn, .vr3d .vr-panel .btn { padding: 4px 6px; font-size: 12px; }
.vr3d .vr-hint { color: var(--text-dim); font-size: 11px; }
.vr3d .vr-status { color: var(--accent); font-size: 12px; margin-right: auto; align-self: center; }
.vr3d [hidden] { display: none !important; }
`;

  function dialog(box, payload, ctx) {
    payload = payload || {};
    ctx = ctx || {};
    const t = (k, p) => {
      const I = typeof window !== 'undefined' && window.I18n;
      let s = I && I.t ? I.t(k, p) : k;
      if (s === k || s == null) {
        const lang = (I && I.lang) || 'en';
        s = ((I18N[lang] || EN)[k]) || EN[k] || k;
        if (p) for (const [a, b] of Object.entries(p)) s = s.replace(new RegExp(`\\{${a}\\}`, 'g'), String(b));
      }
      return s;
    };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (!document.getElementById('vr3d-style')) { const st = document.createElement('style'); st.id = 'vr3d-style'; st.textContent = STYLE; document.head.appendChild(st); }
    box.classList.add('vr3d');
    const presetKeys = { 'ct-bone': 'vr.presetCtBone', 'ct-soft': 'vr.presetCtSoft', 'ct-lung': 'vr.presetCtLung', 'ct-angio': 'vr.presetCtAngio', 'mr-default': 'vr.presetMr', 'mip-gray': 'vr.presetGray' };
    const range = (id, label, min, max, step, value) => `<div class="vr-row"><span>${esc(label)}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="val" id="${id}V"></span></div>`;
    box.innerHTML = `<h2>${esc(t('vr.title'))}<span class="vr-sub" id="vrSub">${esc(payload.name || '')}</span></h2>
      <div class="vr-body">
        <div class="vr-stage" id="vrStage"><canvas id="vrCanvas"></canvas>
          <span class="vr-orient l" id="vrOL"></span><span class="vr-orient r" id="vrOR"></span><span class="vr-orient t" id="vrOT"></span><span class="vr-orient b" id="vrOB"></span>
          <span class="vr-overlay" id="vrOverlay"></span><div class="vr-progress" id="vrProgress">${esc(t('vr.building'))}</div></div>
        <div class="vr-panel" id="vrPanel">
          <fieldset><legend>${esc(t('vr.mode'))}</legend>
            <div class="vr-row"><select id="vrMode">
              <option value="vr">${esc(t('vr.modeVr'))}</option><option value="mip">${esc(t('vr.modeMip'))}</option><option value="minip">${esc(t('vr.modeMinip'))}</option>
              <option value="avg">${esc(t('vr.modeAvg'))}</option><option value="iso">${esc(t('vr.modeIso'))}</option></select></div>
            <div class="vr-row" data-for="vr"><span>${esc(t('vr.preset'))}</span><select id="vrPreset">${Object.keys(TRANSFER_PRESETS).map((k) => `<option value="${k}">${esc(t(presetKeys[k]))}</option>`).join('')}</select></div>
            <div data-for="vr">${range('vrShift', t('vr.shift'), -1, 1, 0.005, 0)}${range('vrOpacity', t('vr.opacity'), 0.05, 4, 0.05, 1)}</div>
            <div data-for="iso">${range('vrThr', t('vr.threshold'), 0, 1, 0.001, 0.5)}</div>
            <div class="vr-row" data-for="vr iso"><label><input type="checkbox" id="vrShade" checked> ${esc(t('vr.shading'))}</label></div>
            <div class="vr-row" data-for="mip minip avg"><span>${esc(t('vr.window'))}</span>${esc(t('vr.ww'))} <input type="number" id="vrWW" step="1"> ${esc(t('vr.wc'))} <input type="number" id="vrWC" step="1"></div>
            <div class="vr-row" data-for="mip minip avg"><button class="btn" type="button" id="vrAutoWin">${esc(t('vr.autoWindow'))}</button></div>
            <div class="vr-row"><span>${esc(t('vr.quality'))}</span><select id="vrQuality"><option value="fast">${esc(t('vr.qualityFast'))}</option><option value="normal" selected>${esc(t('vr.qualityNormal'))}</option><option value="best">${esc(t('vr.qualityBest'))}</option></select></div>
          </fieldset>
          <fieldset><legend>${esc(t('vr.views'))}</legend>
            <div class="vr-views">${['anterior', 'posterior', 'left', 'right', 'superior', 'inferior'].map((v) => `<button class="btn" type="button" data-view="${v}">${esc(t('vr.view' + v[0].toUpperCase() + v.slice(1)))}</button>`).join('')}</div>
            <button class="btn" type="button" id="vrReset">${esc(t('vr.reset'))}</button>
          </fieldset>
          <fieldset><legend>${esc(t('vr.clipping'))}</legend>
            ${['x', 'y', 'z'].map((a) => `<div class="vr-hint">${esc(t('vr.clip' + a.toUpperCase()))}</div>${range('vrClip' + a + '0', '0', 0, 1, 0.005, 0)}${range('vrClip' + a + '1', '1', 0, 1, 0.005, 1)}`).join('')}
            <button class="btn" type="button" id="vrClipReset">${esc(t('vr.clipReset'))}</button>
          </fieldset>
          <div class="vr-hint">${esc(t('vr.hint'))}</div>
        </div>
      </div>`;
    // the clip rows: label '0' / '1' read as min / max
    box.querySelectorAll('[id^=vrClip]').forEach((inp) => { if (inp.type === 'range') inp.parentElement.firstElementChild.textContent = inp.id.endsWith('0') ? 'min' : 'max'; });
    const q = (id) => box.querySelector('#' + id);
    const status = document.createElement('span'); status.className = 'vr-status';
    const exportBtn = document.createElement('button'); exportBtn.type = 'button'; exportBtn.className = 'btn'; exportBtn.textContent = t('vr.export'); exportBtn.disabled = true;
    const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'btn primary'; closeBtn.textContent = t('vr.close');
    const acts = document.createElement('div'); acts.className = 'modal-actions'; acts.append(status, exportBtn, closeBtn); box.append(acts);

    let renderer = null, volume = null, alive = true;
    const cleanup = () => { alive = false; if (renderer) { renderer.destroy(); renderer = null; } clearInterval(watch); };
    const watch = setInterval(() => { if (!box.isConnected) cleanup(); }, 2000);
    closeBtn.addEventListener('click', () => { cleanup(); if (ctx.close) ctx.close(); });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', cleanup, { once: true });

    // The dialog may be closed (its box emptied or reused) while slices still load: stop quietly then.
    const stageCanvas = q('vrCanvas');
    const gone = () => !alive || !box.contains(stageCanvas);
    const progress = (s) => { if (gone()) throw new Error('closed'); const p = q('vrProgress'); p.hidden = !s; p.textContent = s || ''; };
    const fmt = (v, d) => (Number.isFinite(v) ? (+v.toFixed(d)).toString() : '');
    const st = { modality: '', wc: null, ww: null };

    function syncVisibility() {
      const mode = q('vrMode').value;
      box.querySelectorAll('[data-for]').forEach((e) => { e.hidden = !e.dataset.for.split(' ').includes(mode); });
    }
    function updateLabels() {
      if (!renderer || !volume) return;
      const o = renderer.getOptions(), r = volume.max - volume.min || 1;
      q('vrShiftV').textContent = fmt(o.shift, r > 50 ? 0 : 2);
      q('vrOpacityV').textContent = fmt(o.opacity, 2);
      q('vrThrV').textContent = fmt(o.threshold, r > 50 ? 0 : 2);
      for (const a of ['x', 'y', 'z']) for (const e of ['0', '1']) q('vrClip' + a + e + 'V').textContent = fmt(o.clip[a + e] * 100, 0) + '%';
      const L = renderer.orientationLabels();
      q('vrOL').textContent = L.left; q('vrOR').textContent = L.right; q('vrOT').textContent = L.top; q('vrOB').textContent = L.bottom;
    }

    async function build() {
      const D = window.DicomDecoder, Pl = window.Platform;
      const files = payload.files || [];
      const slices = [], positions = [];
      let nx = 0, ny = 0, spacing = null, orientation = null, sliceSpacing = 0, use3d = true, gap = 1;
      if (payload.multiframe) {
        const img = await D.load(new Uint8Array(await Pl.readFile(payload.multiframe)));
        if (!img.gray || img.palette) throw new Error(t('vr.notGray'));
        nx = img.width; ny = img.height; st.modality = img.modality || '';
        const fi0 = img.frameInfo(0);
        spacing = fi0.pixelSpacing; orientation = fi0.orientation || null;
        gap = fi0.spacingBetweenSlices || fi0.sliceThickness || 1;
        const dw = img.defaultWindow && img.defaultWindow(); if (dw) { st.wc = dw.wc; st.ww = dw.ww; }
        for (let f = 0; f < img.frames; f++) {
          if (!alive) return;
          progress(t('vr.loading', { done: f + 1, total: img.frames }));
          await new Promise((r) => setTimeout(r, 0));
          const v = await img.valuesOf(f); if (!v) throw new Error(t('vr.notGray'));
          slices.push(v);
          const info = img.frameInfo(f);
          if (Array.isArray(info.position) && info.position.length === 3) positions.push(info.position); else { use3d = false; positions.push(Number.isFinite(info.sliceLocation) && img.enhanced ? info.sliceLocation : f * gap); }
        }
        img.release();
      } else {
        for (let i = 0; i < files.length; i++) {
          if (!alive) return;
          progress(t('vr.loading', { done: i + 1, total: files.length }));
          await new Promise((r) => setTimeout(r, 0));
          const img = await D.load(new Uint8Array(await Pl.readFile(files[i])));
          if (!img.gray || img.palette) throw new Error(t('vr.notGray'));
          const fi = img.frameInfo(0);
          if (!nx) {
            nx = img.width; ny = img.height; spacing = fi.pixelSpacing; orientation = fi.orientation || null; st.modality = img.modality || '';
            gap = fi.spacingBetweenSlices || fi.sliceThickness || 1;
            const dw = img.defaultWindow && img.defaultWindow(); if (dw) { st.wc = dw.wc; st.ww = dw.ww; }
          }
          if (img.width !== nx || img.height !== ny) throw new Error(t('vr.sizeMismatch'));
          // every frame of each file (a series of multi-frame files stacks them all)
          for (let f = 0; f < img.frames; f++) {
            const v = await img.valuesOf(f); if (!v) throw new Error(t('vr.notGray'));
            slices.push(v);
            const info = img.frameInfo(f);
            if (Array.isArray(info.position) && info.position.length === 3) positions.push(info.position);
            else { use3d = false; positions.push(Number.isFinite(info.sliceLocation) ? info.sliceLocation : (slices.length - 1) * gap); }
          }
          img.release();
        }
      }
      if (!slices.length) throw new Error(t('vr.noSlices'));
      if (slices.length < 2) throw new Error(t('vr.needSlices'));
      if (!use3d) for (let i = 0; i < positions.length; i++) if (Array.isArray(positions[i])) positions[i] = dot(positions[i], orientation ? norm(cross(orientation.slice(0, 3), orientation.slice(3, 6))) : [0, 0, 1]);
      sliceSpacing = gap;
      progress(t('vr.building'));
      await new Promise((r) => setTimeout(r, 0));
      const big = slices.length * nx * ny > 48e6;
      volume = buildVolume({ slices, nx, ny, positions, spacing, orientation, sliceSpacing, format: big ? 'uint16' : 'float32' });
      slices.length = 0;
      return volume;
    }

    function wire() {
      const set = (patch) => { if (renderer) { renderer.setOptions(patch); updateLabels(); } };
      const r = volume.max - volume.min || 1;
      const shift = q('vrShift'); shift.min = -r; shift.max = r; shift.step = r / 400; shift.value = 0;
      const thr = q('vrThr'); thr.min = volume.min; thr.max = volume.max; thr.step = r / 1000; thr.value = renderer.getOptions().threshold;
      const o = renderer.getOptions();
      q('vrPreset').value = o.preset;
      q('vrWW').value = fmt(o.ww, r > 50 ? 0 : 3); q('vrWC').value = fmt(o.wc, r > 50 ? 0 : 3);
      q('vrMode').addEventListener('change', (e) => { syncVisibility(); set({ mode: e.target.value }); });
      q('vrPreset').addEventListener('change', (e) => { shift.value = 0; set({ preset: e.target.value, shift: 0 }); });
      shift.addEventListener('input', () => set({ shift: +shift.value }));
      q('vrOpacity').addEventListener('input', (e) => set({ opacity: +e.target.value }));
      thr.addEventListener('input', () => set({ threshold: +thr.value }));
      q('vrShade').addEventListener('change', (e) => set({ shading: e.target.checked }));
      q('vrQuality').addEventListener('change', (e) => set({ quality: e.target.value }));
      const wl = () => { const ww = +q('vrWW').value, wc = +q('vrWC').value; if (ww > 0 && Number.isFinite(wc)) set({ ww, wc }); };
      q('vrWW').addEventListener('change', wl); q('vrWC').addEventListener('change', wl);
      q('vrAutoWin').addEventListener('click', () => {
        const mode = q('vrMode').value;
        // MIP: emphasise the bright end; MinIP: the dark end; average: full range
        const lo = volume.min, hi = volume.max;
        const ww = mode === 'avg' ? r * 0.6 : r * 0.7, wc = mode === 'mip' ? hi - ww / 2 : mode === 'minip' ? lo + ww / 2 : (lo + hi) / 2;
        q('vrWW').value = fmt(ww, r > 50 ? 0 : 3); q('vrWC').value = fmt(wc, r > 50 ? 0 : 3); set({ ww, wc });
      });
      for (const a of ['x', 'y', 'z']) for (const e of ['0', '1']) {
        q('vrClip' + a + e).addEventListener('input', (ev) => set({ clip: { [a + e]: +ev.target.value } }));
      }
      q('vrClipReset').addEventListener('click', () => {
        for (const a of ['x', 'y', 'z']) { q('vrClip' + a + '0').value = 0; q('vrClip' + a + '1').value = 1; }
        set({ clip: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 } });
      });
      box.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { renderer.setView(b.dataset.view); updateLabels(); }));
      q('vrReset').addEventListener('click', () => { renderer.resetView(); updateLabels(); });
      exportBtn.disabled = false;
      exportBtn.addEventListener('click', async () => {
        if (!renderer) return;
        const blob = await renderer.snapshot('image/png');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const mode = renderer.getOptions().mode;
        const name = `${(payload.name || 'volume').replace(/[\\/:*?"<>|]+/g, '_')}_${mode}.png`;
        const saved = await window.Platform.saveFile({ name, bytes, mime: 'image/png', filters: [{ name: 'PNG', extensions: ['png'] }] });
        if (saved) status.textContent = t('vr.saved', { name: String(saved).split(/[\\/]/).pop() });
      });
    }

    (async () => {
      try {
        await build();
        if (gone() || !volume) return;
        progress(t('vr.uploading'));
        await new Promise((r) => setTimeout(r, 0));
        const isCT = /^CT$/i.test(st.modality) || (volume.min <= -500 && volume.max >= 300);
        const init = { mode: payload.mode || 'vr', preset: payload.preset || (isCT ? 'ct-soft' : 'mr-default') };
        if (st.ww > 0) { init.wc = st.wc; init.ww = st.ww; }
        try { renderer = createRenderer(q('vrCanvas'), volume, { ...init, onRender: () => updateLabels() }); }
        catch (err) { throw new Error(/WebGL2/.test(String(err && err.message)) ? t('vr.noWebgl') : String(err && err.message || err)); }
        q('vrMode').value = init.mode;
        syncVisibility();
        wire();
        progress('');
        const inf = renderer.info();
        const parts = [`${volume.nx} × ${volume.ny} × ${volume.nz}`, `${fmt(volume.sx, 3)} × ${fmt(volume.sy, 3)} × ${fmt(volume.sz, 3)} mm`];
        if (inf.downsampled) parts.push(t('vr.downsampled', { size: `${inf.texture.nx} × ${inf.texture.ny} × ${inf.texture.nz}` }));
        if (volume.irregular) parts.push(t('vr.irregular'));
        q('vrSub').textContent = `${payload.name ? payload.name + ' · ' : ''}${parts.join(' · ')}`;
        updateLabels();
        if (ctx.resize) ctx.resize();
        box.dispatchEvent(new CustomEvent('vr3d-ready', { bubbles: true, detail: { renderer, volume } }));
      } catch (err) {
        if (gone()) { cleanup(); return; }
        progress(String(err && err.message || err));
        box.dispatchEvent(new CustomEvent('vr3d-error', { bubbles: true, detail: { error: String(err && err.message || err) } }));
      }
    })();
    syncVisibility();
    // test / automation hook
    box._vr3d = { get renderer() { return renderer; }, get volume() { return volume; } };
  }

  return {
    buildVolume, planTexture, downsample, normValue, buildTransferLUT, TRANSFER_PRESETS, VIEWS, QUALITY, dirLabel,
    createRenderer, dialog, SIZE: { width: 1100 }, I18N,
  };
});

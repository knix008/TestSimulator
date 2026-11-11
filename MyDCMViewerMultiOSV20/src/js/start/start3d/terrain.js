// Ground shapes for the 3D start scenes. The same height function is written
// twice: in GLSL for the terrain mesh (and for trees that stand on it), and in
// JavaScript so a flying camera can keep above the hills. The hash avoids sin()
// so both give the same numbers.

export const TERRAIN = Object.freeze({
  hills: 0,    // rolling meadow
  dunes: 1,    // sand dunes with sharp crests
  ridges: 2,   // ridged mountains
  channel: 3,  // a flat ring road between ridges (the synthwave grid)
  basin: 4,    // a lake floor ringed by mountains
  flat: 5,     // level ground
  far: 6,      // level near the centre, mountains far out
  river: 7,    // a winding river valley that runs round a ring
});

/** Middle of the river valley at angle `a` round the ring: shape = [radius, floor width, wall width, bends]. */
export function riverMiddle(shape, a) {
  return shape[0] + Math.sin(a * shape[3]) * 25;
}

/** Value noise for every shader: hash12, vnoise, fbm4, ridge4. */
export const NOISE_GLSL = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.0 + vec2(17.0, 31.0);
    a *= 0.5;
  }
  return v;
}
float ridge4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    float r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    v += r * r * a;
    p = p * 2.0 + vec2(17.0, 31.0);
    a *= 0.5;
  }
  return v;
}
`;

/** The ground height; include NOISE_GLSL first. */
export const TERRAIN_GLSL = `
uniform float uMode;
uniform float uAmp;
uniform float uFreq;
uniform vec2 uSeed;
uniform vec4 uShape;
float terrainH(vec2 w) {
  vec2 p = w * uFreq + uSeed;
  if (uMode < 0.5) return (fbm4(p) - 0.45) * uAmp;
  if (uMode < 1.5) {
    float n = fbm4(p * 0.5);
    float s = sin(p.x * 2.6 + p.y * 0.9 + n * 5.0);
    float crest = 1.0 - abs(s);
    return (crest * crest * 0.6 + n * 0.7 - 0.3) * uAmp;
  }
  if (uMode < 2.5) return (ridge4(p) - 0.25) * uAmp;
  if (uMode < 3.5) {
    float off = abs(length(w) - uShape.x);
    return ridge4(p) * smoothstep(uShape.y, uShape.z, off) * uAmp;
  }
  if (uMode < 4.5) {
    float d = length(w - uShape.xy);
    float rim = smoothstep(uShape.z, uShape.w, d);
    return mix(-3.0 + fbm4(p * 3.0) * 1.5, (ridge4(p) * 0.8 + fbm4(p * 2.0) * 0.4) * uAmp, rim);
  }
  if (uMode < 5.5) return 0.0;
  if (uMode < 6.5) return ridge4(p) * smoothstep(uShape.x, uShape.y, length(w)) * uAmp - 4.0;
  float off = abs(length(w) - (uShape.x + sin(atan(w.y, w.x) * uShape.w) * 25.0));
  float floorH = -1.4 + off * 0.07 + fbm4(p * 3.0) * 0.8;
  return mix(floorH, (ridge4(p) * 0.9 + fbm4(p * 1.5) * 0.3) * uAmp, smoothstep(uShape.y, uShape.z, off));
}
`;

const fract = (x) => x - Math.floor(x);
const mixf = (a, b, k) => a + (b - a) * k;
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function hash12(x, y) {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}

export function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy);
  const b = hash12(ix + 1, iy);
  const c = hash12(ix, iy + 1);
  const d = hash12(ix + 1, iy + 1);
  return mixf(mixf(a, b, ux), mixf(c, d, ux), uy);
}

function fbm4(x, y) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * vnoise(x, y);
    x = x * 2 + 17;
    y = y * 2 + 31;
    a *= 0.5;
  }
  return v;
}

function ridge4(x, y) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    const r = 1 - Math.abs(vnoise(x, y) * 2 - 1);
    v += r * r * a;
    x = x * 2 + 17;
    y = y * 2 + 31;
    a *= 0.5;
  }
  return v;
}

/** Height of the ground at world (x, z) for a terrain description `t` (see uniforms above). */
export function terrainHeight(t, x, z) {
  const mode = t.mode ?? 0;
  const amp = t.amp ?? 1;
  const freq = t.freq ?? 0.03;
  const seed = t.seed ?? [0, 0];
  const shape = t.shape ?? [0, 0, 0, 0];
  const px = x * freq + seed[0];
  const py = z * freq + seed[1];
  if (mode < 0.5) return (fbm4(px, py) - 0.45) * amp;
  if (mode < 1.5) {
    const n = fbm4(px * 0.5, py * 0.5);
    const crest = 1 - Math.abs(Math.sin(px * 2.6 + py * 0.9 + n * 5));
    return (crest * crest * 0.6 + n * 0.7 - 0.3) * amp;
  }
  if (mode < 2.5) return (ridge4(px, py) - 0.25) * amp;
  if (mode < 3.5) {
    const off = Math.abs(Math.hypot(x, z) - shape[0]);
    return ridge4(px, py) * smoothstep(shape[1], shape[2], off) * amp;
  }
  if (mode < 4.5) {
    const d = Math.hypot(x - shape[0], z - shape[1]);
    const rim = smoothstep(shape[2], shape[3], d);
    return mixf(-3 + fbm4(px * 3, py * 3) * 1.5, (ridge4(px, py) * 0.8 + fbm4(px * 2, py * 2) * 0.4) * amp, rim);
  }
  if (mode < 5.5) return 0;
  if (mode < 6.5) return ridge4(px, py) * smoothstep(shape[0], shape[1], Math.hypot(x, z)) * amp - 4;
  const off = Math.abs(Math.hypot(x, z) - riverMiddle(shape, Math.atan2(z, x)));
  const floorH = -1.4 + off * 0.07 + fbm4(px * 3, py * 3) * 0.8;
  return mixf(floorH, (ridge4(px, py) * 0.9 + fbm4(px * 1.5, py * 1.5) * 0.3) * amp, smoothstep(shape[1], shape[2], off));
}

/** The highest ground within `radius` of (x, z): a camera above this clears the hills. */
export function groundUnder(t, x, z, radius = 0, rings = 2) {
  let top = terrainHeight(t, x, z);
  for (let r = 1; r <= rings; r++) {
    const d = (radius * r) / rings;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      top = Math.max(top, terrainHeight(t, x + Math.cos(a) * d, z + Math.sin(a) * d));
    }
  }
  return top;
}

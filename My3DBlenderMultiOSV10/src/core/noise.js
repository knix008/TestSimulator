// Repeatable gradient noise (shared by displacement, textures and geometry nodes).
const perm = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 12345;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p];
})();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y, z) => {
  const k = h & 15;
  const u = k < 8 ? x : y;
  const v = k < 4 ? y : k === 12 || k === 14 ? x : z;
  return ((k & 1) ? -u : u) + ((k & 2) ? -v : v);
};

/** Perlin noise in about −1…1. */
export function noise3(x, y, z) {
  const [X, Y, Z] = [Math.floor(x) & 255, Math.floor(y) & 255, Math.floor(z) & 255];
  const [fx, fy, fz] = [x - Math.floor(x), y - Math.floor(y), z - Math.floor(z)];
  const [u, v, w] = [fade(fx), fade(fy), fade(fz)];
  const [A, B] = [perm[X] + Y, perm[X + 1] + Y];
  const [AA, AB, BA, BB] = [perm[A] + Z, perm[A + 1] + Z, perm[B] + Z, perm[B + 1] + Z];
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(grad(perm[AA], fx, fy, fz), grad(perm[BA], fx - 1, fy, fz), u), lerp(grad(perm[AB], fx, fy - 1, fz), grad(perm[BB], fx - 1, fy - 1, fz), u), v),
    lerp(lerp(grad(perm[AA + 1], fx, fy, fz - 1), grad(perm[BA + 1], fx - 1, fy, fz - 1), u), lerp(grad(perm[AB + 1], fx, fy - 1, fz - 1), grad(perm[BB + 1], fx - 1, fy - 1, fz - 1), u), v),
    w,
  );
}

/** Fractal noise in 0…1. */
export function fbm(x, y, z, octaves = 4, roughness = 0.5) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * freq, y * freq, z * freq) * amp;
    total += amp;
    amp *= roughness;
    freq *= 2;
  }
  return Math.max(0, Math.min(1, (sum / total) * 0.75 + 0.5));
}

/** Distance to the nearest feature point of a jittered grid (Voronoi / cell noise). */
export function voronoi(x, y, z) {
  const hash = (a, b, c) => {
    let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const [cx, cy, cz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  let best = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const [gx, gy, gz] = [cx + i, cy + j, cz + k];
    const d = Math.hypot(gx + hash(gx, gy, gz) - x, gy + hash(gy, gz, gx) - y, gz + hash(gz, gx, gy) - z);
    if (d < best) best = d;
  }
  return Math.min(1, best);
}

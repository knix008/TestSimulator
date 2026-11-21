// Sampling and shading math of the path tracer, in plain JavaScript. The GLSL in shaders.js implements the
// same formulas; these copies exist so the tests can check them (normalisation, pdfs, Fresnel limits, the
// environment's importance sampling, the thin-lens camera) without a GPU.
//
// Conventions: vectors are [x, y, z] arrays, directions point away from the surface, the local shading frame
// has its normal on +Z. GGX uses α = roughness².

const PI = Math.PI;
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const reflect = (i, n) => sub(i, scale(n, 2 * dot(i, n)));

/** Orthonormal basis around a unit normal (Duff et al. 2017, branchless): [tangent, bitangent]. */
export function onb(n) {
  const s = n[2] >= 0 ? 1 : -1;
  const a = -1 / (s + n[2]);
  const b = n[0] * n[1] * a;
  return [[1 + s * n[0] * n[0] * a, s * b, -s * n[0]], [b, s + n[1] * n[1] * a, -n[1]]];
}
export const toWorld = (v, n) => { const [t, b] = onb(n); return add(add(scale(t, v[0]), scale(b, v[1])), scale(n, v[2])); };
export const toLocal = (v, n) => { const [t, b] = onb(n); return [dot(v, t), dot(v, b), dot(v, n)]; };

// ───────────────────────── random numbers

/** PCG hash (the shader's random number generator): a 32-bit integer to a 32-bit integer. */
export function pcg(v) {
  const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}
/** A seeded generator of numbers in [0, 1) built on pcg(). */
export function rng(seed = 1) { let s = seed >>> 0; return () => { s = pcg(s); return s / 4294967296; }; }

// ───────────────────────── hemisphere and disc

/** Cosine-weighted direction of the +Z hemisphere for (u1, u2) ∈ [0,1)². pdf = cos θ / π. */
export function cosineHemisphere(u1, u2) {
  const r = Math.sqrt(u1); const phi = 2 * PI * u2;
  return [r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u1))];
}
export const cosinePdf = (cosTheta) => Math.max(0, cosTheta) / PI;

/** Concentric map of the unit square to the unit disc (Shirley–Chiu): uniform over the area, low distortion. */
export function concentricDisk(u1, u2) {
  const a = 2 * u1 - 1; const b = 2 * u2 - 1;
  if (a === 0 && b === 0) return [0, 0];
  let r; let phi;
  if (Math.abs(a) > Math.abs(b)) { r = a; phi = (PI / 4) * (b / a); } else { r = b; phi = PI / 2 - (PI / 4) * (a / b); }
  return [r * Math.cos(phi), r * Math.sin(phi)];
}

/** Uniform direction inside a cone around +Z with cos θmax (soft sun, sphere lights). pdf = 1 / (2π(1 − cos θmax)). */
export function sampleCone(u1, u2, cosMax) {
  const c = 1 - u1 * (1 - cosMax); const s = Math.sqrt(Math.max(0, 1 - c * c)); const phi = 2 * PI * u2;
  return [s * Math.cos(phi), s * Math.sin(phi), c];
}
export const conePdf = (cosMax) => 1 / (2 * PI * (1 - cosMax));

// ───────────────────────── microfacets (GGX)

/** GGX normal distribution D(h) for cos θh and α. */
export function ggxD(nh, a) {
  if (nh <= 0) return 0;
  const a2 = a * a; const d = nh * nh * (a2 - 1) + 1;
  return a2 / (PI * d * d);
}
/** Smith Λ of GGX for cos θ. */
export function ggxLambda(nx, a) {
  const c2 = Math.max(1e-12, nx * nx);
  const t2 = (1 - c2) / c2;
  return (-1 + Math.sqrt(1 + a * a * t2)) / 2;
}
export const ggxG1 = (nx, a) => 1 / (1 + ggxLambda(nx, a));
/** Height-correlated masking-shadowing G2. */
export const ggxG2 = (nv, nl, a) => 1 / (1 + ggxLambda(nv, a) + ggxLambda(nl, a));

/**
 * A microfacet normal of the visible normals of GGX (Heitz 2018) for the local view direction v (z > 0),
 * isotropic α, (u1, u2). pdf of h: G1(v) · max(0, v·h) · D(h) / v.z.
 */
export function sampleVndf(v, a, u1, u2) {
  const vh = normalize([a * v[0], a * v[1], v[2]]);
  const lensq = vh[0] * vh[0] + vh[1] * vh[1];
  const t1 = lensq > 0 ? scale([-vh[1], vh[0], 0], 1 / Math.sqrt(lensq)) : [1, 0, 0];
  const t2 = cross(vh, t1);
  const r = Math.sqrt(u1); const phi = 2 * PI * u2;
  const p1 = r * Math.cos(phi); let p2 = r * Math.sin(phi);
  const s = 0.5 * (1 + vh[2]);
  p2 = (1 - s) * Math.sqrt(Math.max(0, 1 - p1 * p1)) + s * p2;
  const nh = add(add(scale(t1, p1), scale(t2, p2)), scale(vh, Math.sqrt(Math.max(0, 1 - p1 * p1 - p2 * p2))));
  return normalize([a * nh[0], a * nh[1], Math.max(0, nh[2])]);
}
export const vndfPdf = (v, h, a) => (ggxG1(v[2], a) * Math.max(0, dot(v, h)) * ggxD(h[2], a)) / Math.max(1e-12, v[2]);

// ───────────────────────── Fresnel

/** Schlick's approximation for reflectance f0 (number or rgb array) at cos θ. */
export function schlick(f0, cos) {
  const m = Math.pow(1 - Math.max(0, Math.min(1, cos)), 5);
  return Array.isArray(f0) ? f0.map((f) => f + (1 - f) * m) : f0 + (1 - f0) * m;
}
/** Exact unpolarised Fresnel reflectance of a dielectric interface; eta = n_incident / n_transmitted. 1 under total internal reflection. */
export function fresnelDielectric(cosI, eta) {
  const ci = Math.min(1, Math.abs(cosI));
  const sinT2 = eta * eta * (1 - ci * ci);
  if (sinT2 >= 1) return 1;
  const ct = Math.sqrt(1 - sinT2);
  const rs = (eta * ci - ct) / (eta * ci + ct);
  const rp = (ci - eta * ct) / (ci + eta * ct);
  return 0.5 * (rs * rs + rp * rp);
}
/** Refracted direction of incident i (pointing toward the surface) about n (facing i's side), eta = n_i / n_t; null under total internal reflection. */
export function refract(i, n, eta) {
  const c = -dot(n, i);
  const k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  return add(scale(i, eta), scale(n, eta * c - Math.sqrt(k)));
}
/** Reflectance at normal incidence between media of indices n1 and n2. */
export const f0FromIor = (ior, outside = 1) => ((ior - outside) / (ior + outside)) ** 2;

// ───────────────────────── the material model

/**
 * The GPU material model, evaluated for local directions (normal +Z): f(v, l) · |cos θl| and its pdf as the
 * shader would sample it (lobe choice × lobe pdf). Lobes: Lambert diffuse, GGX specular reflection, GGX
 * dielectric transmission (Walter et al. 2007) and a clear coat. m: { color [r,g,b], metalness, roughness,
 * transmission, ior, specular, clearcoat, clearcoatRoughness }; entering: v is outside the object.
 * Returns { value: [r,g,b], pdf } (only the non-delta lobes; very smooth lobes are delta in the shader).
 */
export function lobeProbabilities(m, nv, entering = true) {
  const eta = entering ? 1 / m.ior : m.ior;
  const fd = fresnelDielectric(nv, eta) * (m.transmission > 0 ? 1 : m.specular);
  const fm = schlick(Math.max(...m.color), nv);
  const spec = Math.min(1, Math.max(0.05, (1 - m.metalness) * fd + m.metalness * fm));
  const diff = (1 - m.metalness) * (1 - m.transmission) * (1 - fd);
  const trans = (1 - m.metalness) * m.transmission * (1 - fd);
  const coat = m.clearcoat * 0.25;
  const sum = spec + diff + trans + coat || 1;
  return { spec: spec / sum, diff: diff / sum, trans: trans / sum, coat: coat / sum };
}

export function evalMaterial(m, v, l, entering = true) {
  const a = Math.max(1e-3, m.roughness * m.roughness);
  const nv = v[2]; const nl = l[2];
  const p = lobeProbabilities(m, nv, entering);
  const value = [0, 0, 0]; let pdf = 0;
  if (nv <= 0) return { value, pdf };
  const n1 = entering ? 1 : m.ior; const n2 = entering ? m.ior : 1;
  const coatF = schlick(0.04, nv) * m.clearcoat;
  if (nl > 0) {
    const h = normalize(add(v, l));
    const vh = dot(v, h);
    const D = ggxD(h[2], a); const G = ggxG2(nv, nl, a);
    const fd = fresnelDielectric(vh, n1 / n2) * (m.transmission > 0 ? 1 : m.specular);
    const fm = schlick(m.color, vh);
    const F = [0, 1, 2].map((k) => (1 - m.metalness) * fd + m.metalness * fm[k]);
    const spec = (D * G) / (4 * nv * nl);
    const base = 1 - coatF;
    for (let k = 0; k < 3; k++) value[k] += base * (F[k] * spec * nl);
    const diff = (1 - m.metalness) * (1 - m.transmission) * (1 - fresnelDielectric(nv, n1 / n2) * m.specular);
    for (let k = 0; k < 3; k++) value[k] += base * diff * (m.color[k] / PI) * nl;
    if (m.clearcoat > 0) {
      const ac = Math.max(1e-3, m.clearcoatRoughness ** 2);
      const cs = (ggxD(h[2], ac) * ggxG2(nv, nl, ac) * schlick(0.04, vh) * m.clearcoat) / (4 * nv * nl);
      for (let k = 0; k < 3; k++) value[k] += cs * nl;
      pdf += p.coat * vndfPdf(v, h, ac) / (4 * vh);
    }
    pdf += p.spec * vndfPdf(v, h, a) / (4 * vh) + p.diff * cosinePdf(nl);
  } else if (nl < 0 && m.transmission > 0) {
    // Transmission: the half vector of refraction, on v's side.
    let h = normalize(add(scale(v, n1), scale(l, n2)));
    if (h[2] < 0) h = scale(h, -1);
    const vh = dot(v, h); const lh = dot(l, h);
    if (vh > 0 && lh < 0) {
      const F = fresnelDielectric(vh, n1 / n2);
      const denom = (n2 * lh + n1 * vh) ** 2;
      const D = ggxD(h[2], a); const G = ggxG2(nv, Math.abs(nl), a);
      const ft = ((Math.abs(vh * lh) * n1 * n1 * (1 - F) * D * G) / (nv * Math.abs(nl) * denom)) * (1 - m.metalness) * m.transmission * (1 - coatF);
      const tint = m.absorb > 0 ? [1, 1, 1] : m.color;
      for (let k = 0; k < 3; k++) value[k] += tint[k] * ft * Math.abs(nl);
      pdf += p.trans * vndfPdf(v, h, a) * (n2 * n2 * Math.abs(lh)) / denom;
    }
  }
  return { value, pdf };
}

/**
 * One sample of the material as the shader draws it (for rough lobes): a lobe chosen by lobeProbabilities, then
 * a cosine direction (diffuse) or a visible-normal microfacet (specular, coat, transmission). The returned pdf
 * is the mixture's (evalMaterial), so value / pdf is the path weight. null when the sample is lost (below the
 * surface, total internal reflection).
 */
export function sampleMaterial(m, v, random, entering = true) {
  const p = lobeProbabilities(m, v[2], entering);
  const a = Math.max(1e-3, m.roughness * m.roughness);
  const n1 = entering ? 1 : m.ior; const n2 = entering ? m.ior : 1;
  const u = random();
  let l;
  if (u < p.diff) l = cosineHemisphere(random(), random());
  else if (u < p.diff + p.spec) l = reflect(scale(v, -1), sampleVndf(v, a, random(), random()));
  else if (u < p.diff + p.spec + p.coat) l = reflect(scale(v, -1), sampleVndf(v, Math.max(1e-3, m.clearcoatRoughness ** 2), random(), random()));
  else { l = refract(scale(v, -1), sampleVndf(v, a, random(), random()), n1 / n2); if (!l || l[2] >= 0) return null; }
  if (!l || Math.abs(l[2]) < 1e-9) return null;
  if (u < p.diff + p.spec + p.coat && l[2] <= 0) return null;
  const { value, pdf } = evalMaterial(m, v, l, entering);
  return pdf > 0 ? { l, value, pdf } : null;
}

// ───────────────────────── multiple importance sampling

export const powerHeuristic = (a, b) => (a * a) / (a * a + b * b || 1);

// ───────────────────────── environment (equirectangular, Z up)

/** Equirect coordinates (u, v ∈ [0,1)) of a direction, Z up, u from +X toward +Y, v from the zenith. */
export function dirToEquirect(d, rotation = 0) {
  let u = (Math.atan2(d[1], d[0]) - rotation) / (2 * PI) + 0.5;
  u -= Math.floor(u);
  const v = Math.acos(Math.max(-1, Math.min(1, d[2]))) / PI;
  return [u, v];
}
export function equirectToDir(u, v, rotation = 0) {
  const phi = (u - 0.5) * 2 * PI + rotation; const theta = v * PI;
  const s = Math.sin(theta);
  return [s * Math.cos(phi), s * Math.sin(phi), Math.cos(theta)];
}
/** Unit vector of an azimuth / elevation (degrees) with Z up, azimuth from +X toward +Y. */
export function dirOf(az, el) {
  const a = (az * PI) / 180; const e = (el * PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
}
export const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Importance-sampling tables of an equirect radiance map (RGBA float, w × h): the marginal CDF over rows and
 * a conditional CDF per row, both of luminance × sin θ. { marginal (h+1), conditional (h × (w+1)), total, w, h }.
 */
export function envCdf(data, w, h) {
  const conditional = new Float32Array(h * (w + 1));
  const marginal = new Float32Array(h + 1);
  const rowSum = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    const s = Math.sin((PI * (y + 0.5)) / h);
    let acc = 0;
    conditional[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      acc += Math.max(1e-6, luminance(data[i], data[i + 1], data[i + 2])) * s;
      conditional[y * (w + 1) + x + 1] = acc;
    }
    rowSum[y] = acc;
    for (let x = 1; x <= w; x++) conditional[y * (w + 1) + x] /= acc;
  }
  let acc = 0;
  for (let y = 0; y < h; y++) { acc += rowSum[y]; marginal[y + 1] = acc; }
  for (let y = 1; y <= h; y++) marginal[y] /= acc;
  // total: Σ lum·sinθ over pixels; pdf(dir) = lum · w · h / (total · 2π²).
  return { marginal, conditional, total: acc, w, h };
}

/** Index i with cdf[i] ≤ u < cdf[i+1] (cdf of n+1 entries from 0 to 1). */
export function searchCdf(cdf, offset, n, u) {
  let lo = 0; let hi = n;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (cdf[offset + mid] <= u) lo = mid; else hi = mid; }
  return lo;
}

/** A direction of the environment, chosen in proportion to its luminance: { dir, pdf, x, y }. */
export function sampleEnv(t, data, u1, u2, rotation = 0) {
  const y = searchCdf(t.marginal, 0, t.h, u1);
  const x = searchCdf(t.conditional, y * (t.w + 1), t.w, u2);
  const fu = (x + 0.5) / t.w; const fv = (y + 0.5) / t.h;
  const dir = equirectToDir(fu, fv, rotation);
  return { dir, pdf: envPdf(t, data, dir, rotation), x, y };
}
/** Solid-angle pdf of sampleEnv() for a direction. */
export function envPdf(t, data, dir, rotation = 0) {
  const [u, v] = dirToEquirect(dir, rotation);
  const x = Math.min(t.w - 1, Math.floor(u * t.w)); const y = Math.min(t.h - 1, Math.floor(v * t.h));
  const i = (y * t.w + x) * 4;
  const s = Math.sin((PI * (y + 0.5)) / t.h);
  const lum = Math.max(1e-6, luminance(data[i], data[i + 1], data[i + 2]));
  return (lum * s * t.w * t.h) / (t.total * 2 * PI * PI * Math.max(1e-6, Math.sin(v * PI)));
}
/** Radiance of the map in a direction (nearest texel). */
export function envLookup(data, w, h, dir, rotation = 0) {
  const [u, v] = dirToEquirect(dir, rotation);
  const x = Math.min(w - 1, Math.floor(u * w)); const y = Math.min(h - 1, Math.floor(v * h));
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}
/** Irradiance on an upward (+Z) surface from the map (∫ L cos θ dω over the upper half). */
export function envIrradianceUp(data, w, h) {
  let e = [0, 0, 0];
  for (let y = 0; y < h / 2; y++) {
    const th = (PI * (y + 0.5)) / h;
    const dw = ((2 * PI) / w) * (PI / h) * Math.sin(th);
    const c = Math.cos(th);
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; e = [e[0] + data[i] * c * dw, e[1] + data[i + 1] * c * dw, e[2] + data[i + 2] * c * dw]; }
  }
  return e;
}

// ───────────────────────── camera

/**
 * A camera ray through a pixel position (ndc x, y ∈ [−1, 1]) with a thin lens. cam: { position, right, up,
 * forward (unit), ortho (bool), tanHalf (perspective: tan(fov/2)), halfHeight (orthographic), aspect,
 * lensRadius, focusDistance }; lens: a point of the unit disc. Every lens point's ray passes through the same
 * point of the focus plane, so the focus plane is sharp and everything else is blurred by the aperture.
 */
export function cameraRay(cam, x, y, lens = [0, 0]) {
  let origin; let dir;
  if (cam.ortho) {
    origin = add(cam.position, add(scale(cam.right, x * cam.halfHeight * cam.aspect), scale(cam.up, y * cam.halfHeight)));
    dir = cam.forward;
  } else {
    origin = cam.position;
    dir = normalize(add(cam.forward, add(scale(cam.right, x * cam.tanHalf * cam.aspect), scale(cam.up, y * cam.tanHalf))));
  }
  if (cam.lensRadius > 0) {
    const ft = cam.focusDistance / dot(dir, cam.forward);
    const focus = add(origin, scale(dir, ft));
    origin = add(origin, add(scale(cam.right, lens[0] * cam.lensRadius), scale(cam.up, lens[1] * cam.lensRadius)));
    dir = normalize(sub(focus, origin));
  }
  return { origin, dir };
}

/** The lens radius (scene units, mm) of a focal length (mm) at an f-number: the aperture diameter is f / N. */
export const lensRadius = (focalLength, fNumber) => (fNumber > 0 ? focalLength / fNumber / 2 : 0);
/** The focal length (mm, 36 × 24 mm film) that gives a vertical field of view (degrees). */
export const focalLengthOf = (fovDeg) => 12 / Math.tan((fovDeg * PI) / 360);

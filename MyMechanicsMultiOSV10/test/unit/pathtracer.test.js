// The path tracer's parts that need no GPU: the BVH (build and traversal against brute force), the sampling
// math the shader uses (hemispheres, discs, cones, GGX, visible normals, Fresnel, refraction), the material
// model (importance sampling agrees with plain integration, energy is conserved), the environment's importance
// sampling, Radiance .hdr reading, the thin-lens camera, the light list, appearances and their GPU packing,
// tiles and render regions, and the packing of the scene's triangles.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBVH, intersectBVH, intersectBrute, intersectTriangle, validateBVH } from '../../src/view/pt/bvh.js';
import * as S from '../../src/view/pt/sampling.js';
import { environmentMap, prepareEnvironment, sunLight, parseHdr, writeHdr, srgbToLinear } from '../../src/view/pt/env.js';
import { appearanceFor, normalizeAppearance, packMaterials, previewPbr, APPEARANCE_PRESETS, APPEARANCE_IDS, TEXTURES, MATERIAL_FLOATS } from '../../src/view/pt/appearance.js';
import { packScene, tracerCamera, tracerLights, makeTiles, regionPixels } from '../../src/view/pt/pathtracer.js';
import { ENV_PRESETS, ENV_IDS, normalizeRenderSettings, normalizeRegion, normalizeAreaLight } from '../../src/view/render.js';
import { MATERIALS } from '../../src/cad/materials.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b} (±${tol})`);
const randomDir = (r) => { const z = 1 - 2 * r(); const p = 2 * Math.PI * r(); const q = Math.sqrt(1 - z * z); return [q * Math.cos(p), q * Math.sin(p), z]; };

/** Random small triangles in a 100 mm cube. */
function soup(n, seed = 1) {
  const r = S.rng(seed); const P = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) { const c = [r() * 100, r() * 100, r() * 100]; for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) P[t * 9 + v * 3 + k] = c[k] + (r() - 0.5) * 6; }
  return P;
}

// ───────────────────────── BVH

test('BVH: structure is valid (every triangle in one leaf, children inside parents, bounded depth)', () => {
  for (const n of [1, 2, 7, 100, 5000]) {
    const P = soup(n, n);
    const b = buildBVH(P);
    const v = validateBVH(b, P);
    assert.ok(v.ok, `${n}: ${v.problems.join('; ')}`);
    assert.equal(b.triangles, n);
    assert.ok(b.depth <= 60 && v.depth <= 60);
    assert.ok(b.nodeCount <= 2 * n);
  }
});

test('BVH: closest hits equal brute force for 3000 random rays (triangle and distance)', () => {
  const P = soup(4000, 3);
  const b = buildBVH(P);
  const r = S.rng(9);
  let hits = 0; let steps = 0;
  for (let i = 0; i < 3000; i++) {
    const ro = [r() * 140 - 20, r() * 140 - 20, r() * 140 - 20];
    const rd = randomDir(r);
    const a = intersectBVH(b, P, ro, rd); const c = intersectBrute(P, ro, rd);
    assert.equal(a?.triangle ?? -1, c?.triangle ?? -1, `ray ${i}`);
    if (a) { near(a.t, c.t, 1e-9, `ray ${i}`); hits += 1; steps += a.steps; }
  }
  assert.ok(hits > 500, `${hits} hits`);
  // The hierarchy pays: far fewer nodes visited than triangles tested by brute force.
  assert.ok(steps / hits < 200, `${steps / hits} nodes a ray`);
});

test('BVH: limited rays (tMax), degenerate input and an empty scene', () => {
  const P = soup(500, 5);
  const b = buildBVH(P);
  const r = S.rng(2);
  for (let i = 0; i < 300; i++) {
    const ro = [r() * 100, r() * 100, -10]; const rd = S.normalize([r() - 0.5, r() - 0.5, 1]);
    const full = intersectBrute(P, ro, rd);
    const lim = full ? full.t * 0.5 : 50;
    assert.equal(intersectBVH(b, P, ro, rd, lim)?.triangle ?? -1, intersectBrute(P, ro, rd, lim)?.triangle ?? -1);
  }
  // 300 identical triangles: centroids at one point, leaves stay small, every one is found.
  const same = new Float32Array(300 * 9);
  for (let t = 0; t < 300; t++) same.set([0, 0, 0, 10, 0, 0, 0, 10, 0], t * 9);
  const bs = buildBVH(same);
  assert.ok(validateBVH(bs, same).ok);
  assert.ok(intersectBVH(bs, same, [2, 2, 5], [0, 0, -1]));
  const empty = buildBVH(new Float32Array(0));
  assert.equal(empty.triangles, 0);
  assert.equal(intersectBVH(empty, new Float32Array(0), [0, 0, 0], [0, 0, 1]), null);
});

test('triangle test: hits inside, misses outside, parallel and behind', () => {
  const P = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const out = {};
  near(intersectTriangle(P, 0, [0.2, 0.2, 5], [0, 0, -1], out), 5, 1e-12); near(out.u, 0.2, 1e-9); near(out.v, 0.2, 1e-9);
  assert.equal(intersectTriangle(P, 0, [0.8, 0.8, 5], [0, 0, -1]), Infinity);
  assert.equal(intersectTriangle(P, 0, [0.2, 0.2, 5], [1, 0, 0]), Infinity);
  assert.equal(intersectTriangle(P, 0, [0.2, 0.2, 5], [0, 0, 1]), Infinity);
});

test('scene packing: world transforms of positions and normals; a sphere is hit where it should be', () => {
  const g = new THREE.SphereGeometry(10, 32, 16);
  const m = new THREE.Matrix4().makeTranslation(100, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  const s = packScene([{ geometry: g, matrix: m }, { geometry: new THREE.BoxGeometry(2, 2, 2), matrix: new THREE.Matrix4() }]);
  assert.equal(s.count, g.index.count / 3 + 12);
  assert.equal(s.body[0], 0); assert.equal(s.body[s.count - 1], 1);
  for (let t = 0; t < g.index.count / 3; t++) for (let v = 0; v < 3; v++) {
    const o = t * 9 + v * 3;
    near(Math.hypot(s.positions[o] - 100, s.positions[o + 1], s.positions[o + 2]), 10, 1e-4);
    near(Math.hypot(s.normals[o], s.normals[o + 1], s.normals[o + 2]), 1, 1e-4);
  }
  const b = buildBVH(s.positions);
  const hit = intersectBVH(b, s.positions, [100, -50, 0], [0, 1, 0]);
  assert.ok(hit); near(hit.t, 40, 0.1); assert.equal(s.body[hit.triangle], 0);
  assert.equal(s.body[intersectBVH(b, s.positions, [0, 0, 20], [0, 0, -1]).triangle], 1);
});

// ───────────────────────── sampling math

test('random numbers: PCG generator is uniform and repeatable', () => {
  const a = S.rng(42); const b = S.rng(42);
  let sum = 0; const bins = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); sum += x; bins[Math.floor(x * 10)] += 1; }
  near(sum / 20000, 0.5, 0.01);
  for (const c of bins) near(c / 20000, 0.1, 0.01);
});

test('hemisphere, disc and cone sampling match their pdfs', () => {
  const r = S.rng(4);
  let cosMean = 0; let inner = 0; let coneOk = true;
  for (let i = 0; i < 40000; i++) {
    const d = S.cosineHemisphere(r(), r());
    near(S.length(d), 1, 1e-9); assert.ok(d[2] >= 0);
    cosMean += d[2];
    const [x, y] = S.concentricDisk(r(), r());
    assert.ok(Math.hypot(x, y) <= 1 + 1e-12);
    if (Math.hypot(x, y) < Math.SQRT1_2) inner += 1;
    const c = S.sampleCone(r(), r(), Math.cos(0.2));
    if (c[2] < Math.cos(0.2) - 1e-12) coneOk = false;
  }
  near(cosMean / 40000, 2 / 3, 0.01, 'E[cos] of cosine sampling');
  near(inner / 40000, 0.5, 0.01, 'disc area');
  assert.ok(coneOk);
  // ∫ pdf dω = 1 for the cosine and cone pdfs (uniform sphere estimate).
  let pc = 0; let pk = 0;
  const cosMax = Math.cos(0.5);
  for (let i = 0; i < 200000; i++) { const d = randomDir(r); pc += S.cosinePdf(d[2]); if (d[2] >= cosMax) pk += S.conePdf(cosMax); }
  near((pc / 200000) * 4 * Math.PI, 1, 0.02); near((pk / 200000) * 4 * Math.PI, 1, 0.03);
});

test('GGX: D is normalised (∫ D cos θh dω = 1), VNDF samples have the stated pdf', () => {
  const r = S.rng(11);
  for (const a of [0.08, 0.25, 0.6, 1]) {
    let sum = 0; const N = 300000;
    for (let i = 0; i < N; i++) { const d = randomDir(r); if (d[2] > 0) sum += S.ggxD(d[2], a) * d[2]; }
    near((sum / N) * 4 * Math.PI, 1, a < 0.1 ? 0.12 : 0.03, `α ${a}`);
    for (const th of [0, 40, 80]) {
      const v = [Math.sin((th * Math.PI) / 180), 0, Math.cos((th * Math.PI) / 180)];
      let p = 0; let est = 0;
      for (let i = 0; i < 60000; i++) {
        const d = randomDir(r); p += S.vndfPdf(v, d, a);
        const h = S.sampleVndf(v, a, r(), r());
        near(S.length(h), 1, 1e-9); assert.ok(h[2] >= 0);
        est += 1 / Math.max(1e-12, S.vndfPdf(v, h, a)) * (S.dot(v, h) > 0 ? 1 : 0);
      }
      if (a >= 0.25) near((p / 60000) * 4 * Math.PI, 1, 0.05, `vndf pdf α ${a} θ ${th}`);
      // E[1/pdf] over the samples = the measure of where the pdf is not zero: normals facing both +Z and v.
      if (a >= 0.25) near(est / 60000, 2 * Math.PI * (1 - th / 180), 0.6, `vndf support α ${a} θ ${th}`);
    }
  }
  near(S.ggxG1(1, 0.5), 1, 1e-9);
  assert.ok(S.ggxG2(0.5, 0.5, 0.5) < S.ggxG1(0.5, 0.5));
});

test('Fresnel and refraction: normal incidence, total internal reflection, Snell\'s law', () => {
  near(S.fresnelDielectric(1, 1 / 1.5), S.f0FromIor(1.5), 1e-9);
  near(S.f0FromIor(1.5), 0.04, 1e-9);
  near(S.fresnelDielectric(0, 1 / 1.5), 1, 1e-9);
  assert.equal(S.fresnelDielectric(0.3, 1.5), 1, 'inside glass beyond the critical angle');
  assert.ok(S.fresnelDielectric(0.9, 1.5) < 0.1);
  near(S.schlick(0.04, 1), 0.04, 1e-12); near(S.schlick(0.04, 0), 1, 1e-12);
  const i = S.normalize([Math.sin(0.6), 0, -Math.cos(0.6)]);
  const t = S.refract(i, [0, 0, 1], 1 / 1.5);
  near(Math.sin(0.6), 1.5 * Math.hypot(t[0], t[1]), 1e-9, 'Snell');
  near(S.length(t), 1, 1e-9);
  assert.equal(S.refract(S.normalize([Math.sin(1.2), 0, -Math.cos(1.2)]), [0, 0, 1], 1.5), null);
});

const MATS = {
  plastic: { color: [0.8, 0.6, 0.5], metalness: 0, roughness: 0.5, transmission: 0, ior: 1.5, specular: 1, clearcoat: 0, clearcoatRoughness: 0.1, absorb: 0 },
  metal: { color: [0.95, 0.9, 0.85], metalness: 1, roughness: 0.3, transmission: 0, ior: 1.5, specular: 1, clearcoat: 0, clearcoatRoughness: 0.1, absorb: 0 },
  roughGlass: { color: [1, 1, 1], metalness: 0, roughness: 0.35, transmission: 1, ior: 1.5, specular: 1, clearcoat: 0, clearcoatRoughness: 0.1, absorb: 0 },
  paint: { color: [0.6, 0.1, 0.1], metalness: 0.1, roughness: 0.4, transmission: 0, ior: 1.5, specular: 1, clearcoat: 1, clearcoatRoughness: 0.1, absorb: 0 },
  rubber: { color: [0.05, 0.05, 0.05], metalness: 0, roughness: 0.9, transmission: 0, ior: 1.5, specular: 0.35, clearcoat: 0, clearcoatRoughness: 0.1, absorb: 0 },
};

/** ∫ g(l) dω over the sphere by a midpoint rule in (cos θ, φ) — a reference without sampling noise. */
function quadrature(g, n = 500) {
  let sum = 0; const dw = (2 / n) * ((2 * Math.PI) / n);
  for (let i = 0; i < n; i++) {
    const z = -1 + (2 * (i + 0.5)) / n; const q = Math.sqrt(1 - z * z);
    for (let j = 0; j < n; j++) { const p = (2 * Math.PI * (j + 0.5)) / n; sum += g([q * Math.cos(p), q * Math.sin(p), z]) * dw; }
  }
  return sum;
}

test('material model: importance sampling agrees with quadrature (the pdf matches the samples)', () => {
  const r = S.rng(17);
  for (const [name, m] of Object.entries(MATS)) {
    for (const th of [15, 60]) {
      const t = (th * Math.PI) / 180; const v = [Math.sin(t), 0, Math.cos(t)];
      const N = 100000;
      let is = 0;
      for (let i = 0; i < N; i++) { const s = S.sampleMaterial(m, v, r); if (s) is += S.luminance(...s.value) / s.pdf; }
      const ref = quadrature((l) => S.luminance(...S.evalMaterial(m, v, l).value));
      near(is / N, ref, Math.max(0.01, ref * 0.03), `${name} θ ${th}`);
      // The pdf integrates to the share of samples that are kept.
      const kept = quadrature((l) => S.evalMaterial(m, v, l).pdf);
      assert.ok(kept <= 1.02 && kept > 0.85, `${name} θ ${th}: ∫pdf ${kept}`);
    }
  }
});

test('material model: energy is conserved (white furnace ≤ 1), glass transmits most light', () => {
  const r = S.rng(23);
  for (const [name, m] of Object.entries(MATS)) {
    for (const th of [0, 45, 80]) {
      const t = (th * Math.PI) / 180; const v = [Math.sin(t), 0, Math.cos(t)];
      let e = 0; const N = 60000;
      for (let i = 0; i < N; i++) { const s = S.sampleMaterial({ ...m, color: [1, 1, 1] }, v, r); if (s) e += S.luminance(...s.value) / s.pdf; }
      assert.ok(e / N <= 1.04, `${name} θ ${th}: albedo ${e / N}`);
    }
  }
  // Entering glass the radiance is compressed by (1/1.5)² (radiance transport); reflected ≈ 4 % at normal incidence.
  const v = [0, 0, 1]; let refl = 0; let trans = 0; const N = 80000;
  for (let i = 0; i < N; i++) { const s = S.sampleMaterial(MATS.roughGlass, v, r); if (!s) continue; if (s.l[2] > 0) refl += s.value[1] / s.pdf; else trans += s.value[1] / s.pdf; }
  near(trans / N, (1 - 0.04) / 2.25, 0.05, 'transmitted');
  near(refl / N, 0.04, 0.03, 'reflected');
});

// ───────────────────────── environment

test('environments: maps are bright where the soft boxes are, the CDF is a distribution, pdf integrates to 1', () => {
  const r = S.rng(31);
  for (const id of ENV_IDS) {
    const env = prepareEnvironment(environmentMap(ENV_PRESETS[id], { width: 128, height: 64 }));
    const { marginal, conditional, w, h } = env.cdf;
    near(marginal[h], 1, 1e-6); assert.equal(marginal[0], 0);
    for (let y = 0; y < h; y++) { near(conditional[y * (w + 1) + w], 1, 1e-5); for (let x = 0; x < w; x++) assert.ok(conditional[y * (w + 1) + x + 1] >= conditional[y * (w + 1) + x]); }
    let p = 0; const N = 60000;
    for (let i = 0; i < N; i++) p += S.envPdf(env.cdf, env.data, randomDir(r));
    near((p / N) * 4 * Math.PI, 1, 0.05, id);
    // The brightest soft box is sampled far more often than its share of the sphere.
    const panel = ENV_PRESETS[id].panels.reduce((a, b) => (b.intensity * b.size > a.intensity * a.size ? b : a));
    const c = S.dirOf(panel.az, panel.el);
    let inPanel = 0;
    for (let i = 0; i < 4000; i++) { const s = S.sampleEnv(env.cdf, env.data, r(), r()); if (S.dot(s.dir, c) > Math.cos(Math.atan((25 * panel.size) / 80) * 0.9)) inPanel += 1; }
    const area = 2 * Math.PI * (1 - Math.cos(Math.atan((25 * panel.size) / 80) * 0.9)) / (4 * Math.PI);
    assert.ok(inPanel / 4000 > area * 3, `${id}: ${inPanel / 4000} vs ${area}`);
  }
});

test('environment importance sampling is unbiased (luminance integral) and gives the ground irradiance', () => {
  const r = S.rng(37);
  const env = prepareEnvironment(environmentMap(ENV_PRESETS.studio, { width: 128, height: 64 }));
  let est = 0; let ref = 0; const N = 120000;
  for (let i = 0; i < N; i++) {
    const s = S.sampleEnv(env.cdf, env.data, r(), r());
    est += S.luminance(...S.envLookup(env.data, 128, 64, s.dir)) / s.pdf;
    ref += S.luminance(...S.envLookup(env.data, 128, 64, randomDir(r))) * 4 * Math.PI;
  }
  near(est / N, ref / N, (ref / N) * 0.03);
  // Irradiance on an upward surface: ∫ L cos θ over the upper half, by sampling the cosine.
  let e = 0;
  for (let i = 0; i < N; i++) e += S.luminance(...S.envLookup(env.data, 128, 64, S.cosineHemisphere(r(), r()))) * Math.PI;
  near(S.luminance(...env.irradianceUp), e / N, (e / N) * 0.03);
});

test('equirect mapping is Z up and turns with the rotation; the sun is a soft light above the horizon', () => {
  const r = S.rng(41);
  for (let i = 0; i < 200; i++) {
    const d = randomDir(r); const rot = r() * 6;
    const [u, v] = S.dirToEquirect(d, rot);
    const back = S.equirectToDir(u, v, rot);
    for (let k = 0; k < 3; k++) near(back[k], d[k], 1e-9);
  }
  near(S.dirToEquirect([0, 0, 1])[1], 0, 1e-12); near(S.dirToEquirect([0, 0, -1])[1], 1, 1e-12);
  for (const id of ENV_IDS) {
    const sun = sunLight(ENV_PRESETS[id], { intensity: 1, softness: 1 });
    assert.ok(sun.dir[2] > 0 && sun.cosMax < 1 && sun.cosMax > 0.9, id);
    assert.ok(sun.irradiance.every((v) => v > 0));
  }
  assert.ok(sunLight(ENV_PRESETS.studio, { softness: 3 }).cosMax < sunLight(ENV_PRESETS.studio, { softness: 1 }).cosMax, 'softer = larger sun');
  near(srgbToLinear('#ffffff')[0], 1, 1e-12); near(srgbToLinear('#808080')[0], 0.2158605, 1e-6);
});

test('Radiance .hdr: write and read back (RGBE precision), bad files are refused', () => {
  const w = 40; const h = 6; const data = new Float32Array(w * h * 4);
  const r = S.rng(5);
  for (let i = 0; i < w * h; i++) { data[i * 4] = r() * 50; data[i * 4 + 1] = r(); data[i * 4 + 2] = r() * 0.01; data[i * 4 + 3] = 1; }
  const back = parseHdr(writeHdr({ data, width: w, height: h }));
  assert.equal(back.width, w); assert.equal(back.height, h);
  for (let i = 0; i < w * h; i++) {
    const m = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    for (let k = 0; k < 3; k++) near(back.data[i * 4 + k], data[i * 4 + k], m / 100 + 1e-6, `pixel ${i}`);
  }
  assert.throws(() => parseHdr(new TextEncoder().encode('P6 nope').buffer), /Radiance/);
});

// ───────────────────────── camera and lights

test('thin lens: every lens point of a pixel meets at the focus plane; real lens sizes', () => {
  const cam = { position: [0, -500, 0], forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1], ortho: false, tanHalf: Math.tan((35 * Math.PI) / 360), aspect: 1.5, lensRadius: 8, focusDistance: 300 };
  const r = S.rng(3);
  for (const [x, y] of [[0, 0], [0.7, -0.4], [-1, 1]]) {
    const pin = S.cameraRay({ ...cam, lensRadius: 0 }, x, y);
    const fp = S.add(pin.origin, S.scale(pin.dir, 300 / S.dot(pin.dir, cam.forward)));
    for (let i = 0; i < 20; i++) {
      const ray = S.cameraRay(cam, x, y, S.concentricDisk(r(), r()));
      const t = (fp[1] - ray.origin[1]) / ray.dir[1];
      const p = S.add(ray.origin, S.scale(ray.dir, t));
      for (let k = 0; k < 3; k++) near(p[k], fp[k], 1e-6);
    }
  }
  // Orthographic: parallel rays, also focused.
  const o = S.cameraRay({ ...cam, ortho: true, halfHeight: 50 }, 0.5, 0.5, [0.3, -0.2]);
  near(S.length(o.dir), 1, 1e-12);
  near(S.lensRadius(50, 2), 12.5, 1e-12); assert.equal(S.lensRadius(50, 0), 0);
  near(S.focalLengthOf(2 * Math.atan(12 / 50) * (180 / Math.PI)), 50, 1e-9);
});

test('tracer camera: from the view (perspective and orthographic), perspective conversion keeps the framing', () => {
  const s = normalizeRenderSettings({});
  const p = new THREE.PerspectiveCamera(35, 1, 1, 1e5); p.up.set(0, 0, 1); p.position.set(0, -400, 0); p.lookAt(0, 0, 0); p.updateMatrixWorld();
  const c = tracerCamera(p, new THREE.Vector3(0, 0, 0), 1280, 720, s);
  assert.equal(c.ortho, false); near(c.aspect, 1280 / 720, 1e-12); near(c.forward[1], 1, 1e-9); near(c.up[2], 1, 1e-9);
  near(c.focusAuto, 400, 1e-6); assert.equal(c.lensRadius, 0);
  const d = tracerCamera(p, new THREE.Vector3(0, 0, 0), 1280, 720, normalizeRenderSettings({ dof: true, fStop: 2, focus: 250 }));
  near(d.focusDistance, 250, 1e-9); near(d.lensRadius, S.focalLengthOf(35) / 4, 1e-9);
  const o = new THREE.OrthographicCamera(-200, 200, 100, -100, -1e5, 1e5); o.up.set(0, 0, 1); o.position.set(0, -1000, 0); o.lookAt(0, 0, 0); o.updateMatrixWorld();
  const co = tracerCamera(o, new THREE.Vector3(0, 0, 0), 800, 400, s);
  assert.equal(co.ortho, true); near(co.halfHeight, 100, 1e-9);
  const cp = tracerCamera(o, new THREE.Vector3(0, 0, 0), 800, 400, normalizeRenderSettings({ projection: 'perspective', fov: 30 }));
  assert.equal(cp.ortho, false);
  // The same half height at the target's depth.
  near(cp.tanHalf * cp.focusAuto, 100, 1e-6);
});

test('lights: sun, document lights and area lights; the shadow catcher reference', () => {
  const preset = ENV_PRESETS.studio;
  const s = normalizeRenderSettings({ areaLights: [{ az: 90, el: 30, distance: 2, width: 0.5, height: 0.25, intensity: 5 }] });
  const sceneLights = { lights: [
    { kind: 'point', color: '#ffffff', intensity: 1, position: [0, 0, 100], on: true },
    { kind: 'spot', color: '#ffffff', intensity: 2, position: [0, 0, 100], target: [0, 0, 0], angle: 30, on: true },
    { kind: 'directional', color: '#ffffff', intensity: 1, position: [0, 0, 100], target: [0, 0, 0], on: true },
    { kind: 'point', color: '#ffffff', intensity: 1, position: [0, 0, 100], on: false },
  ] };
  const { lights, catcherU } = tracerLights({ preset, settings: s, sceneLights, centre: [0, 0, 0], size: 100, envIrradianceUp: [1, 1, 1] });
  assert.deepEqual(lights.map((l) => l.A[0]), [0, 1, 2, 0, 3], 'sun, point, spot, directional, area');
  near(lights[1].B[0], 4e4, 1e-6, 'point intensity');
  near(lights[2].C[2], -1, 1e-9, 'spot shines down'); near(lights[2].C[3], Math.cos(Math.PI / 6), 1e-9);
  const a = lights[4];
  const eu = a.C.slice(0, 3); const ev = a.D.slice(0, 3); const n = S.cross(eu, ev);
  near(S.length(eu), 50, 1e-9); near(S.length(ev), 25, 1e-9);
  const centre = S.add(a.A.slice(1), S.scale(S.add(eu, ev), 0.5));
  near(S.length(centre), 200, 1e-6, 'distance × size');
  assert.ok(S.dot(n, S.sub([0, 0, 0], centre)) > 0, 'faces the model');
  // Catcher: environment + sun · sin(elevation) + the directional light straight down.
  const sun = sunLight(preset, { intensity: 1, softness: 1 });
  near(catcherU[1], 1 + sun.irradiance[1] * sun.dir[2] + 1, 1e-9);
  // Off: no document lights, no sun.
  assert.equal(tracerLights({ preset, settings: normalizeRenderSettings({ sceneLights: false, sunIntensity: 0 }), sceneLights, centre: [0, 0, 0], size: 1 }).lights.length, 0);
});

test('render settings: area lights, regions and the new fields are normalised', () => {
  const a = normalizeAreaLight({ intensity: -1, el: 120, color: 'red' }, 2);
  assert.equal(a.id, 'area3'); assert.equal(a.intensity, 0); assert.equal(a.el, 89); assert.equal(a.color, '#ffffff');
  assert.deepEqual(normalizeRegion({ x0: 0.8, y0: 0.9, x1: 0.2, y1: 0.1 }), { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 });
  assert.equal(normalizeRegion({ x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.9 }), null);
  const s = normalizeRenderSettings({ caustics: 'x', tone: 'x', timeLimit: -4, denoise: false, areaLights: new Array(12).fill({}) });
  assert.equal(s.caustics, 'fast'); assert.equal(s.tone, 'aces'); assert.equal(s.timeLimit, 0); assert.equal(s.denoise, false); assert.equal(s.areaLights.length, 8);
});

// ───────────────────────── appearances

test('appearances: every material maps; glass, metal, rubber, wood look classes and textures', () => {
  for (const m of MATERIALS) {
    const a = appearanceFor(m.id);
    for (const k of ['metalness', 'roughness', 'transmission', 'clearcoat', 'specular']) assert.ok(a[k] >= 0 && a[k] <= 1, `${m.id}.${k}`);
    assert.ok(a.ior >= 1 && a.ior <= 3);
    assert.ok(TEXTURES.includes(a.texture));
    assert.match(a.color, /^#[0-9a-f]{6}$/i);
  }
  const glass = appearanceFor('glass');
  assert.equal(glass.transmission, 1); assert.ok(glass.absorb > 0, 'tint by absorption');
  assert.equal(appearanceFor('oak').texture, 'wood');
  assert.equal(appearanceFor('cast-iron').texture, 'cast');
  assert.equal(appearanceFor('steel-1020').metalness, 1);
  assert.ok(appearanceFor('rubber').roughness > 0.85);
  assert.equal(appearanceFor('abs', '#123456').color, '#123456', 'the part colour');
});

test('appearances: part and component overrides, presets and normalisation', () => {
  const part = { preset: 'chrome' };
  const comp = { color: '#ff0000', roughness: 0.5 };
  const a = appearanceFor('abs', '#00ff00', part, comp);
  assert.equal(a.metalness, 1); assert.equal(a.class, 'metal'); assert.equal(a.color, '#ff0000'); assert.equal(a.roughness, 0.5);
  assert.equal(appearanceFor('steel-1020', null, { preset: 'clearGlass' }).transmission, 1);
  assert.equal(appearanceFor('steel-1020', null, { preset: 'emissive' }).class, 'emissive');
  for (const id of APPEARANCE_IDS) assert.ok(APPEARANCE_PRESETS[id]);
  const n = normalizeAppearance({ roughness: 7, ior: 0.2, color: 'blue', texture: 'lava', preset: 'nope', image: 'http://x', emissive: '#FFEEDD', extra: 1 });
  assert.deepEqual(n, { roughness: 1, ior: 1, emissive: '#ffeedd' });
  assert.equal(normalizeAppearance({}), null);
  // An image texture without an image falls back to none.
  assert.equal(appearanceFor('abs', null, { texture: 'image' }).texture, 'none');
  const pv = previewPbr(appearanceFor('abs', null, { preset: 'emissive' }));
  assert.ok(pv.emissiveIntensity > 0);
});

test('appearances: GPU packing (5 texels each, linear colours, texture ids, shared image layers)', () => {
  const img = 'data:image/png;base64,AAAA';
  const list = [appearanceFor('abs', '#ffffff'), appearanceFor('steel-1020', null, { texture: 'image', image: img }), appearanceFor('abs', null, { texture: 'image', image: img }), appearanceFor('glass')];
  const { data, images } = packMaterials(list);
  assert.equal(MATERIAL_FLOATS, 20); assert.equal(data.length, 4 * 20);
  near(data[0], 1, 1e-9); // linear white
  assert.equal(data[20 + 3], 1, 'metalness of steel');
  assert.equal(data[20 + 12], TEXTURES.indexOf('image')); assert.equal(data[20 + 16], 0); assert.equal(data[40 + 16], 0, 'same image, same layer');
  assert.equal(images.length, 1);
  assert.equal(data[60 + 5], 1, 'glass transmits'); assert.ok(data[60 + 15] > 0, 'absorption distance');
  assert.equal(data[0 + 16], -1, 'no image');
});

// ───────────────────────── tiles and regions

test('tiles cover the picture (or the region) exactly once; regions flip to GL rows', () => {
  const cover = (w, h, region, size) => {
    const seen = new Uint8Array(w * h);
    for (const t of makeTiles(w, h, region, size)) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) seen[y * w + x] += 1;
    return seen;
  };
  const all = cover(300, 170, null, 64);
  assert.ok(all.every((v) => v === 1));
  const r = regionPixels({ x0: 0.25, y0: 0, x1: 0.5, y1: 0.5 }, 200, 100);
  assert.deepEqual(r, { x: 50, y: 50, w: 50, h: 50 }, 'the top half is GL rows 50…99');
  const part = cover(200, 100, r, 32);
  let inside = 0;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 200; x++) { const inR = x >= 50 && x < 100 && y >= 50 && y < 100; assert.equal(part[y * 200 + x], inR ? 1 : 0); if (inR) inside += 1; }
  assert.equal(inside, 2500);
  assert.equal(regionPixels(null, 10, 10), null);
});

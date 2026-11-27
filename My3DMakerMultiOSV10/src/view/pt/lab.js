// Small scenes for the path tracer's browser tests (test/e2e/render.steps.json): plain geometry, known cameras
// and appearances, rendered at a few dozen pixels so the checks run quickly even on a software GPU. Each check
// reads back the linear mean (not the tone-mapped picture) and compares regions of it.
import * as THREE from 'three';
import { PathTracer } from './pathtracer.js';
import { appearanceFor } from './appearance.js';
import { ENV_PRESETS, normalizeRenderSettings } from '../render.js';
import { environmentMap, writeHdr } from './env.js';
import { envLookup, luminance, normalize, dot, sub, scale, add } from './sampling.js';

let tracer = null;
/** The lab's own tracer (its own canvas; not the app's picture). */
export function labTracer() { tracer ??= new PathTracer(); return tracer; }

const at = (geometry, x, y, z) => { geometry.translate(x, y, z); return geometry; };
const look = (camera, from, to) => { camera.up.set(0, 0, 1); camera.position.set(...from); camera.lookAt(...to); camera.updateMatrixWorld(true); return camera; };

/**
 * The scenes: { bodies: [{ geometry, appearance }], camera, target, settings }.
 *   glass   a sphere in front of a checker wall; `ior` / `hidden` change the sphere
 *   metal   a mirror sphere; the environment shows in it
 *   shadow  a cube on a shadow catcher, seen from straight above (orthographic)
 *   noise   a diffuse cube and sphere under the studio sky (convergence)
 *   dof     three checker cards at 150, 300 and 600 mm
 *   vcolor  a box whose top half has red vertex colours (cables), the rest its appearance
 *   texlod  a long floor plate with a picture of 1-pixel checks seen at a grazing angle (texture filtering)
 *   lamp    a cube lit only by a point light of radius opt.radius over a floor (soft shadows), top view
 *   bleed   a red cube on a differential shadow catcher (bounced red light on the ground)
 */
export function labScene(name, opt = {}) {
  const w = opt.width ?? 64; const h = opt.height ?? 48;
  const base = { ground: 'none', background: 'env', env: 'studio', denoise: false, bounces: 6, sunIntensity: 1, sceneLights: false, resolution: 'hd' };
  const base0Settings = base;
  if (name === 'glass') {
    const wall = at(new THREE.BoxGeometry(240, 4, 160), 0, 60, 40);
    const sphere = at(new THREE.SphereGeometry(28, 64, 32), 0, 0, 40);
    const bodies = [{ geometry: wall, appearance: appearanceFor('abs', '#f2f2f2', { texture: 'checker', textureScale: 1.6, roughness: 0.6 }) }];
    if (!opt.hidden) bodies.push({ geometry: sphere, appearance: appearanceFor('glass', null, { preset: 'clearGlass', ior: opt.ior ?? 1.5, absorb: 0, color: '#ffffff' }) });
    return { bodies, camera: look(new THREE.PerspectiveCamera(30, w / h, 1, 1e5), [0, -220, 40], [0, 0, 40]), target: new THREE.Vector3(0, 0, 40), settings: { ...base, sunIntensity: 0.5 } };
  }
  if (name === 'metal') {
    const sphere = at(new THREE.SphereGeometry(30, 96, 48), 0, 0, 0);
    return { bodies: [{ geometry: sphere, appearance: appearanceFor('steel-1020', null, { preset: 'chrome', color: '#ffffff', roughness: 0 }) }], camera: look(new THREE.PerspectiveCamera(25, w / h, 1, 1e5), [0, -400, 0], [0, 0, 0]), target: new THREE.Vector3(0, 0, 0), settings: { ...base, env: opt.env ?? 'sunset', sunIntensity: 0 } };
  }
  if (name === 'shadow') {
    const cube = at(new THREE.BoxGeometry(40, 40, 40), 0, 0, 20);
    const cam = new THREE.OrthographicCamera(-80, 80, 80, -80, 1, 1e5);
    cam.up.set(0, 1, 0); cam.position.set(0, 0, 500); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    return { bodies: [{ geometry: cube, appearance: appearanceFor('abs', '#d0d0d0') }], camera: cam, target: new THREE.Vector3(0, 0, 0), settings: { ...base, ground: 'shadow', reflections: false, softness: 0.3 } };
  }
  if (name === 'dof') {
    const card = (x, y) => at(new THREE.BoxGeometry(60, 2, 60), x, y, 0);
    const ap = appearanceFor('abs', '#ffffff', { texture: 'checker', textureScale: 0.4, roughness: 0.7 });
    return { bodies: [{ geometry: card(-40, 150), appearance: ap }, { geometry: card(0, 300), appearance: ap }, { geometry: card(60, 600), appearance: ap }], camera: look(new THREE.PerspectiveCamera(40, w / h, 1, 1e5), [0, 0, 0], [0, 1, 0]), target: new THREE.Vector3(0, 300, 0), settings: { ...base, dof: true, fStop: opt.fStop ?? 1.4, focus: opt.focus ?? 150, sunIntensity: 0.5 } };
  }
  if (name === 'vcolor') {
    const g = at(new THREE.BoxGeometry(60, 60, 60, 1, 1, 4), 0, 0, 30).toNonIndexed();
    const pos = g.getAttribute('position'); const col = new Float32Array(pos.count * 3);
    const base = [0.5, 0.5, 0.5];
    for (let i = 0; i < pos.count; i++) { const top = pos.getZ(i) > 31; col.set(top ? [0.8, 0.02, 0.02] : base, i * 3); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return { bodies: [{ geometry: g, appearance: appearanceFor('abs', '#3366ff'), vertexColors: col, baseColor: base }], camera: look(new THREE.PerspectiveCamera(35, w / h, 1, 1e5), [0, -260, 30], [0, 0, 30]), target: new THREE.Vector3(0, 0, 30), settings: { ...base0Settings } };
  }
  if (name === 'texlod') {
    const plate = at(new THREE.BoxGeometry(200, 2000, 2), 0, 900, -1);
    return { bodies: [{ geometry: plate, appearance: appearanceFor('abs', '#ffffff', { texture: 'image', image: opt.image, textureScale: 0.02, mapping: 'triplanar', roughness: 0.9 }) }], camera: look(new THREE.PerspectiveCamera(30, w / h, 1, 1e5), [0, -100, 40], [0, 400, 0]), target: new THREE.Vector3(0, 400, 0), settings: { ...base0Settings, sunIntensity: 0, envIntensity: 1 } };
  }
  if (name === 'lamp') {
    const cube = at(new THREE.BoxGeometry(30, 30, 30), 0, 0, 15);
    const floor = at(new THREE.BoxGeometry(400, 400, 2), 0, 0, -1);
    const cam = new THREE.OrthographicCamera(-80, 80, 80, -80, 1, 1e5);
    cam.up.set(0, 1, 0); cam.position.set(0, 0, 500); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    return {
      bodies: [{ geometry: cube, appearance: appearanceFor('abs', '#d0d0d0') }, { geometry: floor, appearance: appearanceFor('abs', '#e0e0e0', { roughness: 1 }) }], camera: cam, target: new THREE.Vector3(0, 0, 0),
      settings: { ...base0Settings, sunIntensity: 0, envIntensity: 0, sceneLights: true, lightRadius: opt.radius ?? 0 },
      sceneLights: { lights: [{ kind: 'point', color: '#ffffff', intensity: 1, position: [60, 0, 60], on: true }] },
    };
  }
  if (name === 'bleed') {
    const cube = at(new THREE.BoxGeometry(50, 50, 50), 0, 0, 25);
    const cam = new THREE.OrthographicCamera(-90, 90, 90, -90, 1, 1e5);
    cam.up.set(0, 1, 0); cam.position.set(0, 0, 500); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    return { bodies: [{ geometry: cube, appearance: appearanceFor('abs', '#ff1010', { roughness: 1 }) }], camera: cam, target: new THREE.Vector3(0, 0, 0), settings: { ...base0Settings, env: 'overcast', ground: 'shadow', catcherMode: opt.mode ?? 'differential', reflections: false, sunIntensity: 0 } };
  }
  // noise
  const cube = at(new THREE.BoxGeometry(40, 40, 40), -25, 0, 20);
  const sphere = at(new THREE.SphereGeometry(20, 48, 24), 30, 0, 20);
  return {
    bodies: [{ geometry: cube, appearance: appearanceFor('abs', '#c8c8c8') }, { geometry: sphere, appearance: appearanceFor('abs', '#b04040') }],
    camera: look(new THREE.PerspectiveCamera(35, w / h, 1, 1e5), [60, -180, 110], [0, 0, 20]), target: new THREE.Vector3(0, 0, 20), settings: { ...base, ground: 'floor' },
  };
}

/** Renders a lab scene: { data (mean RGBA), normals (mean normal + depth), width, height, ms, tracer }. */
export async function labRender(name, { samples = 8, seed = 0, width = 64, height = 48, settings = {}, ...opt } = {}) {
  const pt = labTracer();
  const sc = labScene(name, { width, height, ...opt });
  const box = new THREE.Box3();
  for (const b of sc.bodies) { b.geometry.computeBoundingBox(); box.union(b.geometry.boundingBox); b.matrix = new THREE.Matrix4(); b.geometry.key = `${name}:${JSON.stringify(opt)}:${sc.bodies.indexOf(b)}`; }
  const s = normalizeRenderSettings({ ...sc.settings, ...settings, samples, seed });
  const t0 = performance.now();
  await pt.setup({ bodies: sc.bodies, camera: sc.camera, target: sc.target, box, sceneLights: sc.sceneLights ?? null, preset: ENV_PRESETS[s.env], settings: { ...s, size: { width, height } } });
  pt.renderNow(samples);
  const img = pt.meanImage();
  return { ...img, ms: performance.now() - t0, tracer: pt };
}

/** Standard deviation of the luminance in a region (rows from the top). */
export function regionStd(img, x0, y0, x1, y1) {
  const { data, width: w, height: h } = img;
  let s = 0; let s2 = 0; let n = 0;
  for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) {
    for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w); x++) {
      const o = ((h - 1 - y) * w + x) * 4; const l = luminance(data[o], data[o + 1], data[o + 2]);
      s += l; s2 += l * l; n += 1;
    }
  }
  s /= Math.max(1, n); s2 /= Math.max(1, n);
  return Math.sqrt(Math.max(0, s2 - s * s));
}

/** A picture of 1-pixel black and white checks (data URL, 64²): averages to mid grey when filtered. */
export function checkerImage(n = 64) {
  const c = document.createElement('canvas'); c.width = n; c.height = n;
  const g = c.getContext('2d'); const d = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = (x + y) % 2 ? 255 : 0; const o = (y * n + x) * 4; d.data[o] = d.data[o + 1] = d.data[o + 2] = v; d.data[o + 3] = 255; }
  g.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}

/** Mean [r, g, b, a] of a region (fractions from the top left) of a mean image. */
export function regionMean(img, x0, y0, x1, y1) {
  const { data, width: w, height: h } = img;
  const sum = [0, 0, 0, 0]; let n = 0;
  for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) {
    for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w); x++) {
      const o = ((h - 1 - y) * w + x) * 4; // GL rows go up
      for (let k = 0; k < 4; k++) sum[k] += data[o + k];
      n += 1;
    }
  }
  return sum.map((v) => v / Math.max(1, n));
}
export const regionLum = (img, ...r) => { const m = regionMean(img, ...r); return luminance(m[0], m[1], m[2]); };

/** Root mean square difference of two mean images (luminance), optionally in a region. */
export function rmse(a, b, region = [0, 0, 1, 1]) {
  const [x0, y0, x1, y1] = region; const w = a.width; const h = a.height;
  let s = 0; let n = 0;
  for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) {
    for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w); x++) {
      const o = (y * w + x) * 4;
      const d = luminance(a.data[o], a.data[o + 1], a.data[o + 2]) - luminance(b.data[o], b.data[o + 1], b.data[o + 2]);
      s += d * d; n += 1;
    }
  }
  return Math.sqrt(s / Math.max(1, n));
}

/** Mean absolute difference between horizontal neighbours (sharpness) in a region. */
export function sharpness(img, x0, y0, x1, y1) {
  const { data, width: w, height: h } = img;
  let s = 0; let n = 0;
  for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) {
    for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w) - 1; x++) {
      const o = ((h - 1 - y) * w + x) * 4;
      s += Math.abs(luminance(data[o], data[o + 1], data[o + 2]) - luminance(data[o + 4], data[o + 5], data[o + 6])); n += 1;
    }
  }
  return s / Math.max(1, n);
}

/**
 * What the mirror sphere of the 'metal' scene must show in a region (fractions from the top left): for every
 * pixel centre, the camera ray reflected off the analytic sphere (r = 30 at the origin, camera at −400 Y,
 * 25° field of view) looks the environment up. Pixels that miss the sphere are left out.
 */
export function mirrorExpected(env, [x0, y0, x1, y1], width = 64, height = 48) {
  const m = environmentMap(ENV_PRESETS[env]);
  const tanHalf = Math.tan((25 * Math.PI) / 360); const aspect = width / height;
  const sum = [0, 0, 0]; let n = 0;
  for (let py = Math.floor(y0 * height); py < Math.ceil(y1 * height); py++) {
    for (let px = Math.floor(x0 * width); px < Math.ceil(x1 * width); px++) {
      const x = ((px + 0.5) / width) * 2 - 1; const y = 1 - ((py + 0.5) / height) * 2;
      const d = normalize([x * tanHalf * aspect, 1, y * tanHalf]);
      const o = [0, -400, 0];
      const b = dot(o, d); const c = dot(o, o) - 900; const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      const p = add(o, scale(d, t)); const nrm = scale(p, 1 / 30);
      const r = sub(d, scale(nrm, 2 * dot(d, nrm)));
      const L = envLookup(m.data, m.width, m.height, r);
      for (let k = 0; k < 3; k++) sum[k] += L[k];
      n += 1;
    }
  }
  return sum.map((v) => v / Math.max(1, n));
}

/** A Radiance .hdr file (ArrayBuffer) of a preset's environment: tests load it as a custom environment. */
export const envHdr = (env = 'daylight') => writeHdr(environmentMap(ENV_PRESETS[env], { width: 256, height: 128 }));

/** The radiance of a preset's environment map in a direction (what a mirror shows there). */
export function envRadiance(env, dir) {
  const m = environmentMap(ENV_PRESETS[env]);
  return envLookup(m.data, m.width, m.height, dir);
}

/**
 * The same lab scene in the raster Preview renderer: { rgb(fx0, fy0, fx1, fy1) → mean sRGB of a region of the
 * shown picture }.
 */
export async function labPreview(name, { samples = 4, width = 64, height = 48, ...opt } = {}) {
  const { PhotoRenderer } = await import('../render.js');
  const { previewPbr } = await import('./appearance.js');
  const sc = labScene(name, { width, height, ...opt });
  const box = new THREE.Box3();
  for (const b of sc.bodies) { b.geometry.computeBoundingBox(); box.union(b.geometry.boundingBox); }
  const pr = new PhotoRenderer();
  const s = normalizeRenderSettings({ ...sc.settings, samples, resolution: 'view', mode: 'preview' });
  pr.setup({ bodies: sc.bodies.map((b) => ({ ...b, matrix: new THREE.Matrix4(), pbr: previewPbr(b.appearance) })), camera: sc.camera, target: sc.target, box, settings: { ...s, viewWidth: width, viewHeight: height } });
  pr.renderNow(samples);
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d'); g.drawImage(pr.canvas, 0, 0, width, height);
  const d = g.getImageData(0, 0, width, height).data;
  const rgb = (x0, y0, x1, y1) => {
    const sum = [0, 0, 0]; let n = 0;
    for (let y = Math.floor(y0 * height); y < Math.ceil(y1 * height); y++) for (let x = Math.floor(x0 * width); x < Math.ceil(x1 * width); x++) { const o = (y * width + x) * 4; sum[0] += d[o]; sum[1] += d[o + 1]; sum[2] += d[o + 2]; n += 1; }
    return sum.map((v) => v / Math.max(1, n));
  };
  pr.dispose();
  return { rgb };
}

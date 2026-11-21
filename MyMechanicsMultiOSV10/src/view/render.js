// Photo rendering of the current view, in two modes:
//   Final    a progressive GPU path tracer (pt/pathtracer.js): unbiased Monte Carlo light transport over a BVH of
//            the scene's triangles — indirect light, refraction through glass, glossy reflections, soft shadows
//            from the sun and area lights, a shadow-catcher or reflective ground, a thin-lens camera for depth of
//            field, a denoiser.
//   Preview  the fast raster picture (PhotoRenderer below): physically based materials under the same
//            procedural environment, many jittered frames accumulated in a float buffer — sub-pixel jitter for
//            anti-aliasing, a sun of finite size and a hemisphere "sky" light that moves every frame for soft
//            and contact shadows, an aperture for depth of field. The average is tone mapped (ACES).
//
// Z up: the ground is the XY plane under the model, the sky above +Z. Nothing is downloaded: the
// environments are gradient domes with soft-box panels (an environment map; PMREM for the preview, an
// equirect HDR with importance sampling for the path tracer).
//
// The pure parts (presets, material mapping, sample sequences, resolutions, settings) are exported for the
// tests; the renderers need WebGL.
import * as THREE from 'three';
import { materialOf } from '../cad/materials.js';

// ───────────────────────── presets and settings (pure)

/**
 * Environments: dome colours (zenith, horizon, ground), the sun (azimuth / elevation in degrees, colour,
 * intensity, angular radius = shadow softness), soft boxes (azimuth, elevation, size, intensity), the sky
 * light (hemisphere shadow light) and the exposure.
 */
export const ENV_PRESETS = {
  studio: { zenith: '#f4f6f8', horizon: '#d9dee5', ground: '#8f969f', sun: { az: 35, el: 55, color: '#ffffff', intensity: 2.2, radius: 6 }, panels: [{ az: 35, el: 50, size: 0.9, intensity: 7 }, { az: 215, el: 30, size: 1.2, intensity: 3 }, { az: 120, el: 75, size: 0.7, intensity: 4 }], sky: 0.9, exposure: 1.0, floor: '#d7dbe0' },
  sunset: { zenith: '#3c5a8c', horizon: '#ffb36b', ground: '#4b3a33', sun: { az: 250, el: 12, color: '#ffc07a', intensity: 3.2, radius: 3 }, panels: [{ az: 250, el: 10, size: 0.6, intensity: 12, color: '#ffbf70' }], sky: 0.6, exposure: 1.05, floor: '#6b5548' },
  overcast: { zenith: '#c9d1da', horizon: '#e6e9ed', ground: '#7d8288', sun: { az: 0, el: 70, color: '#ffffff', intensity: 0.7, radius: 20 }, panels: [{ az: 0, el: 89, size: 2.4, intensity: 2.2 }], sky: 1.4, exposure: 1.1, floor: '#c6cacf' },
  daylight: { zenith: '#5b8fd6', horizon: '#cfe3f5', ground: '#6f7d63', sun: { az: 140, el: 48, color: '#fff3dc', intensity: 3.0, radius: 2.5 }, panels: [{ az: 140, el: 48, size: 0.25, intensity: 30, color: '#fff3dc' }], sky: 0.8, exposure: 0.95, floor: '#b9c0b0' },
  night: { zenith: '#0b1020', horizon: '#26324a', ground: '#0d0f14', sun: { az: 300, el: 35, color: '#9fb8ff', intensity: 1.6, radius: 8 }, panels: [{ az: 300, el: 35, size: 0.8, intensity: 6, color: '#a8c0ff' }, { az: 120, el: 15, size: 1.0, intensity: 2.5, color: '#ff9a5c' }], sky: 0.3, exposure: 1.2, floor: '#1c212b' },
};
export const ENV_IDS = Object.keys(ENV_PRESETS);

/** Picture sizes: 'view' follows the graphics area. */
export const RESOLUTIONS = { view: null, small: [640, 360], hd: [1280, 720], fhd: [1920, 1080], qhd: [2560, 1440], uhd: [3840, 2160], square: [1024, 1024], portrait: [1080, 1350] };

/** An area light of the render (a soft box around the model): direction from the model's centre, distance and size in model sizes. */
export const DEFAULT_AREA_LIGHT = { on: true, color: '#ffffff', intensity: 8, az: 60, el: 45, distance: 1.2, width: 0.6, height: 0.6 };

export const DEFAULT_RENDER = {
  mode: 'final', env: 'studio', resolution: 'hd', samples: 256, timeLimit: 0, bounces: 8,
  ground: 'shadow', background: 'env', reflections: true, floorReflect: 0.06, floorRoughness: 0.25,
  projection: 'view', fov: 35, dof: false, fStop: 2.8, focus: 0,
  sunIntensity: 1, softness: 1, envIntensity: 1, envRotation: 0, exposure: 1, tone: 'aces', sceneLights: true, areaLights: [],
  denoise: true, denoiseStrength: 1, clamp: 0, caustics: 'fast', region: null, seed: 0,
};

const pick = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, d, lo, hi) => (v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);

/** An area light with every value in range. */
export function normalizeAreaLight(a = {}, i = 0) {
  const d = DEFAULT_AREA_LIGHT;
  return {
    id: typeof a.id === 'string' && a.id ? a.id : `area${i + 1}`, on: a.on !== false, color: /^#[0-9a-f]{6}$/i.test(a.color ?? '') ? a.color : d.color,
    intensity: num(a.intensity, d.intensity, 0, 1e5), az: num(a.az, d.az, -360, 360), el: num(a.el, d.el, -89, 89),
    distance: num(a.distance, d.distance, 0.05, 100), width: num(a.width, d.width, 0.01, 50), height: num(a.height, d.height, 0.01, 50),
  };
}

/** A render region (fractions of the picture from the top left) or null. */
export function normalizeRegion(r) {
  if (!r || typeof r !== 'object') return null;
  const c = (v) => num(v, 0, 0, 1);
  const x0 = Math.min(c(r.x0), c(r.x1)); const x1 = Math.max(c(r.x0), c(r.x1)); const y0 = Math.min(c(r.y0), c(r.y1)); const y1 = Math.max(c(r.y0), c(r.y1));
  return x1 - x0 > 0.002 && y1 - y0 > 0.002 ? { x0, y0, x1, y1 } : null;
}

/** Settings with every value in range. */
export function normalizeRenderSettings(s = {}) {
  const D = DEFAULT_RENDER;
  return {
    mode: pick(s.mode, ['final', 'preview'], D.mode),
    env: ENV_PRESETS[s.env] || s.env === 'custom' ? s.env : D.env,
    resolution: s.resolution in RESOLUTIONS ? s.resolution : D.resolution,
    samples: Math.round(num(s.samples, D.samples, 1, 65536)),
    timeLimit: num(s.timeLimit, D.timeLimit, 0, 86400),
    bounces: Math.round(num(s.bounces, D.bounces, 1, 32)),
    ground: pick(s.ground, ['shadow', 'floor', 'none'], D.ground),
    background: pick(s.background, ['env', 'white', 'transparent'], D.background),
    reflections: s.reflections !== undefined ? Boolean(s.reflections) : D.reflections,
    floorReflect: num(s.floorReflect, D.floorReflect, 0, 1),
    floorRoughness: num(s.floorRoughness, D.floorRoughness, 0, 1),
    projection: pick(s.projection, ['view', 'perspective', 'orthographic'], D.projection),
    fov: num(s.fov, D.fov, 5, 120),
    dof: Boolean(s.dof),
    fStop: num(s.fStop, D.fStop, 0.5, 64),
    focus: num(s.focus, 0, 0, 1e7),
    sunIntensity: num(s.sunIntensity, 1, 0, 10),
    softness: num(s.softness, 1, 0, 10),
    envIntensity: num(s.envIntensity, D.envIntensity, 0, 100),
    envRotation: num(s.envRotation, D.envRotation, -360, 360),
    exposure: num(s.exposure, D.exposure, 0.01, 100),
    tone: pick(s.tone, ['aces', 'linear'], D.tone),
    sceneLights: s.sceneLights !== undefined ? Boolean(s.sceneLights) : D.sceneLights,
    areaLights: (Array.isArray(s.areaLights) ? s.areaLights : []).slice(0, 8).map(normalizeAreaLight),
    denoise: s.denoise !== undefined ? Boolean(s.denoise) : D.denoise,
    denoiseStrength: num(s.denoiseStrength, D.denoiseStrength, 0.05, 10),
    clamp: num(s.clamp, D.clamp, 0, 1e6),
    caustics: pick(s.caustics, ['fast', 'physical'], D.caustics),
    region: normalizeRegion(s.region),
    seed: Math.round(num(s.seed, 0, 0, 1e9)),
  };
}

/** The picture's pixel size for a resolution key (and the graphics area's size for 'view'), capped by `max`. */
export function resolveResolution(key, viewW, viewH, max = 4096) {
  let [w, h] = RESOLUTIONS[key] ?? [Math.round(viewW) || 1280, Math.round(viewH) || 720];
  const k = Math.min(1, max / Math.max(w, h));
  w = Math.max(16, Math.round(w * k)); h = Math.max(16, Math.round(h * k));
  return { width: w, height: h };
}

/** The look class of an engineering material. */
export function materialClass(id) {
  const m = materialOf(id);
  if (m.id === 'glass') return 'glass';
  if (m.id === 'rubber') return 'rubber';
  if (m.id === 'oak') return 'wood';
  if (m.id === 'pc') return 'clearPlastic';
  if (m.group === 'plastic') return 'plastic';
  return 'metal';
}

/**
 * Physically based material parameters for a part: { class, color, metalness, roughness, clearcoat,
 * clearcoatRoughness, transmission, ior, thickness, sheen, specularIntensity }. `color` overrides the
 * material's colour (a part's own colour, a cable's colour).
 */
export function pbrFor(id, color = null) {
  const m = materialOf(id);
  const cls = materialClass(id);
  const base = { class: cls, color: color || m.color, metalness: 0, roughness: 0.5, clearcoat: 0, clearcoatRoughness: 0.1, transmission: 0, ior: 1.5, thickness: 0, sheen: 0, specularIntensity: 1 };
  switch (cls) {
    case 'metal': return { ...base, metalness: 1, roughness: Math.max(0.08, Math.min(0.6, (m.rough ?? 0.35) * 0.75)) };
    case 'plastic': return { ...base, roughness: Math.max(0.25, m.rough ?? 0.5), clearcoat: 0.25, clearcoatRoughness: 0.35, ior: 1.46 };
    case 'clearPlastic': return { ...base, roughness: 0.08, transmission: 0.85, ior: 1.58, thickness: 4, clearcoat: 0.6 };
    case 'glass': return { ...base, roughness: 0.02, transmission: 1, ior: 1.52, thickness: 6, specularIntensity: 1 };
    case 'rubber': return { ...base, roughness: 0.92, sheen: 0.4, specularIntensity: 0.35 };
    case 'wood': return { ...base, roughness: 0.72, clearcoat: 0.15, clearcoatRoughness: 0.5 };
    default: return base;
  }
}

/** The i-th number of the Halton sequence in `base` (0 … 1). */
export function halton(i, base) {
  let f = 1; let r = 0; let n = i + 1;
  while (n > 0) { f /= base; r += f * (n % base); n = Math.floor(n / base); }
  return r;
}

/** Sub-pixel offset of sample i (−0.5 … 0.5 in both directions); sample 0 is the pixel centre. */
export const pixelJitter = (i) => (i === 0 ? [0, 0] : [halton(i, 2) - 0.5, halton(i, 3) - 0.5]);

/** A point of the unit disc for sample i (concentric, low discrepancy): aperture and sun-disc samples. */
export function diskSample(i, b1 = 2, b2 = 3) {
  const r = Math.sqrt(halton(i, b1)); const a = 2 * Math.PI * halton(i, b2);
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** A direction of the upper (+Z) hemisphere, cosine weighted (the sky light's direction of sample i). */
export function hemisphereSample(i) {
  const [x, y] = diskSample(i, 5, 7);
  return [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))];
}

/** Unit vector of an azimuth / elevation (degrees) with Z up, azimuth from +X toward +Y. */
export function dirOf(az, el) {
  const a = (az * Math.PI) / 180; const e = (el * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
}

/** ACES filmic tone curve (Narkowicz fit), per channel. */
export const aces = (x) => Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));

/** The running mean after adding `sample` as the (n+1)-th value. */
export const accumulate = (mean, sample, n) => mean + (sample - mean) / (n + 1);

// ───────────────────────── the renderer (WebGL)

const QUAD_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const ACCUM_FRAG = `uniform sampler2D tPrev; uniform sampler2D tNew; uniform float weight; varying vec2 vUv;
void main() { vec4 a = texture2D(tPrev, vUv); vec4 b = texture2D(tNew, vUv); gl_FragColor = mix(a, b, weight); }`;
const SHOW_FRAG = `uniform sampler2D tAccum; uniform float exposure; uniform float opaque; varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() { vec4 c = texture2D(tAccum, vUv); gl_FragColor = vec4(toSrgb(aces(max(c.rgb, 0.0) * exposure)), opaque > 0.5 ? 1.0 : clamp(c.a, 0.0, 1.0)); }`;
const DOME_FRAG = `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
void main() { vec3 d = normalize(vDir); float h = d.z; vec3 sky = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6)); vec3 gnd = mix(horizon, ground, pow(clamp(-h * 4.0, 0.0, 1.0), 0.5)); gl_FragColor = vec4(h >= 0.0 ? sky : gnd, 1.0); }`;
const DOME_VERT = 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const linear = (hex) => new THREE.Color(hex);

/** The environment scene of a preset (a dome and its soft boxes), Z up. */
export function environmentScene(preset) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
    uniforms: { zenith: { value: linear(preset.zenith) }, horizon: { value: linear(preset.horizon) }, ground: { value: linear(preset.ground) } },
  }));
  scene.add(dome);
  for (const p of preset.panels ?? []) {
    const d = new THREE.Vector3(...dirOf(p.az, p.el));
    const size = 100 * p.size * 0.5;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color ?? '#ffffff').multiplyScalar(p.intensity), side: THREE.DoubleSide }));
    panel.position.copy(d.clone().multiplyScalar(80));
    panel.up.set(0, 0, 1);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }
  return scene;
}

/**
 * Renders a picture of meshes progressively.
 *   const r = new PhotoRenderer(); r.setup({ bodies, camera, box, settings }); r.start({ onProgress, onDone });
 * bodies: [{ geometry (THREE.BufferGeometry, shared — not disposed), matrix (THREE.Matrix4), pbr (pbrFor()) }]
 * camera: a THREE camera (copied) and its `target`; box: THREE.Box3 of the model.
 */
export class PhotoRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'render-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.accumMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: ACCUM_FRAG, uniforms: { tPrev: { value: null }, tNew: { value: null }, weight: { value: 1 } }, depthTest: false, depthWrite: false });
    this.showMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SHOW_FRAG, uniforms: { tAccum: { value: null }, exposure: { value: 1 }, opaque: { value: 1 } }, depthTest: false, depthWrite: false, transparent: false, toneMapped: false });
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(this.quadGeo, this.accumMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.count = 0;
    this.running = false;
    this.frame = 0;
    this.envCache = new Map();
    this.ownMaterials = [];
    this.ownGeometry = [];
  }

  /** The float format the GPU can render to (float, else half float). */
  bufferType() {
    const gl = this.renderer.getContext();
    return gl.getExtension('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
  }

  envTexture(id) {
    if (!this.envCache.has(id)) this.envCache.set(id, this.pmrem.fromScene(environmentScene(ENV_PRESETS[id]), 0.02).texture);
    return this.envCache.get(id);
  }

  /** Builds the scene for the settings; the picture starts over. */
  setup({ bodies, camera, target, box, settings }) {
    this.stop();
    this.disposeScene();
    const s = normalizeRenderSettings(settings);
    this.settings = s;
    const { width, height } = resolveResolution(s.resolution, settings.viewWidth ?? 1280, settings.viewHeight ?? 720, Math.min(4096, this.renderer.capabilities.maxTextureSize || 4096));
    this.width = width; this.height = height;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    const type = this.bufferType();
    const rt = () => new THREE.WebGLRenderTarget(width, height, { type, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.sampleRT = rt(); this.accum = [rt(), rt()];
    const preset = ENV_PRESETS[s.env];
    const scene = new THREE.Scene();
    scene.environment = this.envTexture(s.env);
    scene.environmentIntensity = 1;
    if (s.background === 'env') { scene.background = scene.environment; scene.backgroundBlurriness = 0.6; scene.backgroundIntensity = 1; }
    else if (s.background === 'white') scene.background = new THREE.Color('#ffffff');
    else scene.background = null;
    this.showMat.uniforms.opaque.value = s.background === 'transparent' ? 0 : 1;
    // The model.
    const group = new THREE.Group();
    for (const b of bodies) {
      const p = b.pbr;
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(p.color), metalness: p.metalness, roughness: p.roughness, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness,
        transmission: p.transmission, ior: p.ior, thickness: p.thickness, sheen: p.sheen, sheenRoughness: 0.8, specularIntensity: p.specularIntensity, side: THREE.DoubleSide,
        emissive: new THREE.Color(p.emissive ?? '#000000'), emissiveIntensity: p.emissiveIntensity ?? 0,
        vertexColors: Boolean(b.geometry.getAttribute('color') && b.useVertexColors),
      });
      this.ownMaterials.push(mat);
      const mesh = new THREE.Mesh(b.geometry, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(b.matrix ?? new THREE.Matrix4());
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    scene.add(group);
    group.updateMatrixWorld(true);
    const bb = box && !box.isEmpty() ? box.clone() : new THREE.Box3().setFromObject(group);
    if (bb.isEmpty()) bb.set(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50));
    const size = bb.getSize(new THREE.Vector3()).length() || 100;
    const centre = bb.getCenter(new THREE.Vector3());
    this.box = bb; this.size = size; this.centre = centre;
    // Ground: the XY plane just under the model.
    const gz = bb.min.z - size * 0.0005;
    if (s.ground !== 'none') {
      const gmat = s.ground === 'floor'
        ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(preset.floor), roughness: 0.55, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.4 })
        : new THREE.ShadowMaterial({ opacity: 0.55, color: new THREE.Color('#000000') });
      this.ownMaterials.push(gmat);
      const geo = new THREE.PlaneGeometry(size * 40, size * 40);
      this.ownGeometry.push(geo);
      const ground = new THREE.Mesh(geo, gmat);
      ground.position.set(centre.x, centre.y, gz);
      ground.receiveShadow = true;
      scene.add(ground);
    }
    // The sun and the sky light (both cast shadows; both move a little every sample).
    const mkLight = (intensity, color) => {
      const l = new THREE.DirectionalLight(color, intensity);
      l.castShadow = true;
      l.shadow.mapSize.set(2048, 2048);
      const half = size * 0.75;
      Object.assign(l.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.01, far: size * 6 });
      l.shadow.camera.updateProjectionMatrix();
      l.shadow.bias = -0.0002;
      l.shadow.normalBias = size * 0.0008;
      l.shadow.radius = 1.5;
      l.target.position.copy(centre);
      scene.add(l); scene.add(l.target);
      return l;
    };
    this.sun = mkLight(preset.sun.intensity * s.sunIntensity, new THREE.Color(preset.sun.color));
    this.sky = mkLight(preset.sky, new THREE.Color(preset.zenith).lerp(new THREE.Color('#ffffff'), 0.6));
    this.scene = scene;
    // The camera: the view's, with the picture's aspect.
    this.baseCamera = camera.clone();
    this.target = (target ?? centre).clone();
    const aspect = width / height;
    if (this.baseCamera.isPerspectiveCamera) { this.baseCamera.aspect = aspect; }
    else {
      const halfH = (this.baseCamera.top - this.baseCamera.bottom) / 2 / (this.baseCamera.zoom || 1);
      const cy = (this.baseCamera.top + this.baseCamera.bottom) / 2;
      Object.assign(this.baseCamera, { left: -halfH * aspect, right: halfH * aspect, top: cy + halfH, bottom: cy - halfH, zoom: 1 });
    }
    this.baseCamera.updateProjectionMatrix();
    this.camera = this.baseCamera.clone();
    this.focus = s.focus > 0 ? s.focus : this.baseCamera.position.distanceTo(this.target);
    this.exposure = preset.exposure;
    this.count = 0;
    return { width, height };
  }

  /** Places the lights and the camera for sample i. */
  prepareSample(i) {
    const s = this.settings; const preset = ENV_PRESETS[s.env];
    const dist = this.size * 2.5;
    // Sun: a point of its disc (angular radius × softness).
    const sd = new THREE.Vector3(...dirOf(preset.sun.az, preset.sun.el));
    const [dx, dy] = diskSample(i, 2, 5);
    const ang = ((preset.sun.radius * s.softness) * Math.PI) / 180;
    const u = new THREE.Vector3().crossVectors(sd, new THREE.Vector3(0, 0, 1)); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize();
    const v = new THREE.Vector3().crossVectors(u, sd).normalize();
    sd.addScaledVector(u, dx * Math.tan(ang)).addScaledVector(v, dy * Math.tan(ang)).normalize();
    this.sun.position.copy(this.centre).addScaledVector(sd, dist);
    // Sky: any direction of the upper hemisphere (contact shadows / ambient occlusion on average).
    const h = hemisphereSample(i);
    this.sky.position.copy(this.centre).add(new THREE.Vector3(h[0], h[1], Math.max(0.08, h[2])).normalize().multiplyScalar(dist));
    for (const l of [this.sun, this.sky]) l.target.updateMatrixWorld();
    // Camera: sub-pixel jitter and the aperture.
    const cam = this.camera;
    cam.copy(this.baseCamera);
    if (s.dof && s.fStop > 0) {
      const [ax, ay] = diskSample(i, 3, 7);
      const fov = cam.isPerspectiveCamera ? cam.fov : s.fov;
      const r = (12 / Math.tan((fov * Math.PI) / 360)) / s.fStop / 2;
      const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
      const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const focusPoint = cam.position.clone().addScaledVector(fwd, this.focus);
      cam.position.addScaledVector(right, ax * r).addScaledVector(up, ay * r);
      cam.lookAt(focusPoint);
    }
    const [jx, jy] = pixelJitter(i);
    cam.setViewOffset(this.width, this.height, jx, jy, this.width, this.height);
    cam.updateMatrixWorld();
  }

  /** Renders one more sample and folds it into the running mean. */
  addSample() {
    const r = this.renderer;
    this.prepareSample(this.count);
    r.setRenderTarget(this.sampleRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    const [prev, next] = this.accum;
    this.quad.material = this.accumMat;
    this.accumMat.uniforms.tPrev.value = prev.texture;
    this.accumMat.uniforms.tNew.value = this.sampleRT.texture;
    this.accumMat.uniforms.weight.value = 1 / (this.count + 1);
    r.setRenderTarget(next);
    r.render(this.quadScene, this.quadCam);
    this.accum = [next, prev];
    this.count += 1;
  }

  /** Draws the running mean (tone mapped) on the canvas. */
  show() {
    const r = this.renderer;
    this.quad.material = this.showMat;
    this.showMat.uniforms.tAccum.value = this.accum[0].texture;
    this.showMat.uniforms.exposure.value = this.exposure;
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.quadScene, this.quadCam);
  }

  /** Renders `settings.samples` samples, a few per animation frame (≈ budget ms), showing the picture as it gets better. */
  start({ onProgress = null, onDone = null, budget = 28 } = {}) {
    this.stop();
    this.running = true;
    this.startedAt = performance.now();
    const total = this.settings.samples;
    const step = () => {
      if (!this.running) return;
      const t0 = performance.now();
      do { this.addSample(); } while (this.count < total && performance.now() - t0 < budget);
      this.show();
      onProgress?.({ count: this.count, total, ms: performance.now() - this.startedAt });
      if (this.count >= total) { this.running = false; onDone?.({ count: this.count, ms: performance.now() - this.startedAt }); return; }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Renders n samples now (tests, small pictures). */
  renderNow(n = this.settings.samples) {
    this.stop();
    for (let i = 0; i < n; i++) this.addSample();
    this.show();
    return this.count;
  }

  stop() { this.running = false; cancelAnimationFrame(this.frame); this.frame = 0; }

  /** The picture as a PNG blob. */
  toBlob() { return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png')); }

  /** Average brightness and the spread of the picture (a check that something was drawn). */
  stats() {
    const c = document.createElement('canvas');
    const w = 64; const h = Math.max(1, Math.round((64 * this.height) / this.width));
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(this.canvas, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0; let sq = 0; const n = w * h;
    for (let i = 0; i < d.length; i += 4) { const y = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += y; sq += y * y; }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), width: this.width, height: this.height, samples: this.count };
  }

  disposeScene() {
    for (const m of this.ownMaterials) m.dispose();
    for (const g of this.ownGeometry) g.dispose();
    this.ownMaterials = []; this.ownGeometry = [];
    for (const l of [this.sun, this.sky]) l?.shadow?.map?.dispose();
    this.sampleRT?.dispose(); for (const a of this.accum ?? []) a.dispose();
    this.sampleRT = null; this.accum = null; this.scene = null;
  }

  dispose() {
    this.stop();
    this.disposeScene();
    for (const t of this.envCache.values()) t.dispose();
    this.envCache.clear();
    this.pmrem.dispose();
    this.accumMat.dispose(); this.showMat.dispose(); this.quadGeo.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.canvas.remove();
  }
}

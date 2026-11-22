// The progressive GPU path tracer (WebGL2 through three.js): the scene's triangles in world space with a BVH
// (bvh.js, built in a worker for large scenes), the materials (appearance.js), the procedural HDR environment
// with its importance-sampling tables (env.js), the analytic lights, and the camera of the view with a thin lens.
//
// Every pass adds one sample per pixel to float render targets (radiance + coverage, albedo + sample count,
// normal + depth, luminance moments). Passes are split into tiles drawn a few per animation frame, so the window
// stays responsive and the GPU never runs one long draw; a render region limits the tiles. The picture is the
// mean, optionally denoised (variance-guided à-trous with the albedo / normal / depth guides) and tone mapped.
//
// The tracing shader is specialised to the scene (shaders.js HAS_* switches: textures, pictures, UVs, vertex
// colours, glass, clear coat, lights, area / sphere lights, catcher, floor): each variant is compiled once, in
// the background (KHR_parallel_shader_compile), and kept — a smaller program compiles much faster on Direct3D.
//
//   const pt = new PathTracer();
//   await pt.setup({ bodies, camera, target, box, lights, settings });   // settings: normalizeRenderSettings()
//   pt.start({ onProgress, onDone });  …  pt.stop();  await pt.toBlob();
import * as THREE from 'three';
import { buildBVH, intersectBVH } from './bvh.js';
import { packMaterials, MATERIAL_FLOATS, floorAppearance } from './appearance.js';
import { environmentMap, prepareEnvironment, sunLight, srgbToLinear } from './env.js';
import { dirOf, normalize, cross, sub, scale, add, focalLengthOf, lensRadius } from './sampling.js';
import { QUAD_VERT, TRACE_FRAG, SHOW_FRAG, DENOISE_FRAG } from './shaders.js';

const MAX_LIGHTS = 16;
const IMAGE_SIZE = 512;

/** A linear colour as the shader's packed sRGB 8-bit number (r·65536 + g·256 + b). */
export function packColour(r, g, b) {
  const e = (v) => { const c = Math.max(0, Math.min(1, v)); return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)); };
  return e(r) * 65536 + e(g) * 256 + e(b);
}

/**
 * World-space triangles of the bodies: { positions, normals (9 floats a triangle), body (per triangle), count,
 * uvs (6 floats a triangle, mm), uvOk (per triangle), colours (3 a triangle: packed sRGB or −1), hasUv, hasColours }.
 * A body may carry uv ({ uv: 2 floats a vertex, ok }) from its B-rep faces and vertexColors (3 linear floats a
 * vertex, with baseColor: vertices of that colour are left to the appearance).
 */
export function packScene(bodies) {
  let total = 0;
  for (const b of bodies) { const g = b.geometry; total += (g.index ? g.index.count : g.getAttribute('position').count) / 3; }
  total = Math.floor(total);
  const positions = new Float32Array(total * 9); const normals = new Float32Array(total * 9); const body = new Uint32Array(total);
  const uvs = new Float32Array(total * 6); const uvOk = new Uint8Array(total); const colours = new Float32Array(total * 3).fill(-1);
  let hasUv = false; let hasColours = false;
  const v = new THREE.Vector3(); const nm = new THREE.Matrix3();
  let t = 0;
  bodies.forEach((b, bi) => {
    const g = b.geometry; const pos = g.getAttribute('position'); const nrm = g.getAttribute('normal'); const index = g.index;
    const m = b.matrix ?? new THREE.Matrix4();
    nm.getNormalMatrix(m);
    const count = Math.floor((index ? index.count : pos.count) / 3);
    for (let k = 0; k < count; k++, t++) {
      body[t] = bi;
      for (let c = 0; c < 3; c++) {
        const i = index ? index.getX(k * 3 + c) : k * 3 + c;
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        positions[t * 9 + c * 3] = v.x; positions[t * 9 + c * 3 + 1] = v.y; positions[t * 9 + c * 3 + 2] = v.z;
        if (nrm) { v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize(); } else v.set(0, 0, 0);
        normals[t * 9 + c * 3] = v.x; normals[t * 9 + c * 3 + 1] = v.y; normals[t * 9 + c * 3 + 2] = v.z;
        if (b.uv?.uv && b.uv.ok[i]) { uvs[t * 6 + c * 2] = b.uv.uv[i * 2]; uvs[t * 6 + c * 2 + 1] = b.uv.uv[i * 2 + 1]; }
        const vc = b.vertexColors;
        if (vc) {
          const r = vc[i * 3]; const gg = vc[i * 3 + 1]; const bb = vc[i * 3 + 2];
          const base = b.baseColor;
          if (!base || Math.abs(r - base[0]) + Math.abs(gg - base[1]) + Math.abs(bb - base[2]) > 2e-3) { colours[t * 3 + c] = packColour(r, gg, bb); }
        }
      }
      if (b.uv?.uv) {
        const i0 = index ? index.getX(k * 3) : k * 3; const i1 = index ? index.getX(k * 3 + 1) : k * 3 + 1; const i2 = index ? index.getX(k * 3 + 2) : k * 3 + 2;
        if (b.uv.ok[i0] && b.uv.ok[i1] && b.uv.ok[i2]) { uvOk[t] = 1; hasUv = true; }
      }
      // A triangle is coloured only when all three corners are (the shader interpolates them).
      if (colours[t * 3] >= 0 && colours[t * 3 + 1] >= 0 && colours[t * 3 + 2] >= 0) hasColours = true;
      else colours[t * 3] = colours[t * 3 + 1] = colours[t * 3 + 2] = -1;
    }
  });
  return { positions, normals, body, count: total, uvs, uvOk, colours, hasUv, hasColours };
}

/** The shader switches a scene needs (shaders.js HAS_*), from its appearances, scene data, lights and settings. */
export function shaderFeatures({ appearances = [], scene = {}, lights = [], settings: s }) {
  const f = new Set();
  const textured = appearances.filter((a) => a.texture && a.texture !== 'none');
  if (textured.length) f.add('HAS_TEX');
  if (textured.some((a) => a.texture === 'image' && a.image)) f.add('HAS_IMAGE');
  if (scene.hasUv && textured.some((a) => (a.mapping ?? 'uv') === 'uv')) f.add('HAS_UV');
  if (scene.hasColours) f.add('HAS_VCOLOR');
  if (appearances.some((a) => a.transmission > 0)) f.add('HAS_TRANS');
  if (appearances.some((a) => a.clearcoat > 0)) f.add('HAS_COAT');
  if (lights.length) f.add('HAS_LIGHTS');
  if (lights.some((l) => l.A[0] === 3 || ((l.A[0] === 1 || l.A[0] === 2) && l.B[3] > 0))) f.add('HAS_AREA');
  if (s.ground === 'shadow' && s.catcherMode !== 'differential') f.add('HAS_CATCHER');
  if (s.ground === 'floor' || (s.ground === 'shadow' && s.catcherMode === 'differential')) f.add('HAS_FLOOR');
  return [...f].sort();
}

/** The camera the tracer uses (plain numbers): from a three camera, the target, the picture size and the settings. */
export function tracerCamera(camera, target, width, height, s) {
  const cam = camera.clone();
  cam.updateMatrixWorld(true);
  const q = cam.quaternion;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
  const tgt = target ? target.clone() : cam.position.clone().addScaledVector(fwd, 100);
  let pos = cam.position.clone();
  const aspect = width / height;
  let ortho = Boolean(cam.isOrthographicCamera);
  let tanHalf = 0; let halfH = 0;
  // The vertical extent at the target stays what the view shows.
  const dist0 = Math.max(1e-6, tgt.clone().sub(pos).dot(fwd));
  if (ortho) {
    const zoom = cam.zoom || 1;
    halfH = (cam.top - cam.bottom) / 2 / zoom;
    const cx = (cam.left + cam.right) / 2 / zoom; const cy = (cam.top + cam.bottom) / 2 / zoom;
    pos.addScaledVector(right, cx).addScaledVector(up, cy);
  } else {
    tanHalf = Math.tan((cam.fov * Math.PI) / 360) / (cam.zoom || 1);
    halfH = tanHalf * dist0;
  }
  let fov = ortho ? s.fov : cam.fov;
  if (s.projection === 'perspective') {
    // Looking along the same line through the middle of the picture, from where the field of view frames the
    // target's depth as the view does.
    fov = s.fov;
    tanHalf = Math.tan((fov * Math.PI) / 360);
    const middle = pos.clone().addScaledVector(fwd, dist0);
    pos = middle.addScaledVector(fwd, -halfH / tanHalf);
    ortho = false;
  } else if (s.projection === 'orthographic' && !ortho) {
    ortho = true;
    pos.addScaledVector(fwd, -dist0 * 4);
  }
  const focusAuto = Math.max(1e-3, tgt.clone().sub(pos).dot(fwd));
  const focusDistance = s.focus > 0 ? s.focus : focusAuto;
  const focal = focalLengthOf(fov);
  return {
    position: pos.toArray(), forward: fwd.toArray(), up: up.toArray(), right: right.toArray(), ortho, tanHalf, halfHeight: halfH, aspect,
    fov, focalLength: focal, focusDistance, focusAuto, lensRadius: s.dof ? lensRadius(focal, s.fStop) : 0,
  };
}

/**
 * The light list of the uniforms: [{ A: [type, x, y, z], B: [r, g, b, w], C, D }] and the unoccluded irradiance
 * an upward ground point gets from the environment and the directional lights (the shadow catcher's reference).
 */
export function tracerLights({ preset, settings: s, sceneLights = null, centre, size, envIrradianceUp = [0, 0, 0] }) {
  const out = [];
  const up = envIrradianceUp.map((v) => v * s.envIntensity);
  const directional = (dir, e, cosMax) => { out.push({ A: [0, ...dir], B: [...e, cosMax], C: [0, 0, 0, 0], D: [0, 0, 0, 0] }); for (let k = 0; k < 3; k++) up[k] += e[k] * Math.max(0, dir[2]); };
  if (s.sunIntensity > 0) { const sun = sunLight(preset, { intensity: s.sunIntensity, softness: s.softness }); directional(sun.dir, sun.irradiance, sun.cosMax); }
  if (s.sceneLights && sceneLights) {
    for (const l of sceneLights.lights ?? []) {
      if (l.on === false || out.length >= MAX_LIGHTS) continue;
      const c = srgbToLinear(l.color ?? '#ffffff').map((v) => v * Number(l.intensity ?? 1));
      const pos = l.position ?? [0, 0, 0]; const tgt = l.target ?? [0, 0, 0];
      // Points and spots are spheres of a real size (soft shadows): the light's own radius or the render's.
      const radius = Math.max(0, Number(l.radius ?? s.lightRadius ?? 0)) || 0;
      if (l.kind === 'directional') directional(normalize(sub(pos, tgt)), c, Math.cos((0.53 * Math.PI) / 180));
      else if (l.kind === 'spot') {
        const angle = (Number(l.angle ?? 30) * Math.PI) / 180;
        out.push({ A: [2, ...pos], B: [...c.map((v) => v * 4e4), radius], C: [...normalize(sub(tgt, pos)), Math.cos(angle)], D: [Math.cos(angle * 0.65), 0, 0, 0] });
      } else out.push({ A: [1, ...pos], B: [...c.map((v) => v * 4e4), radius], C: [0, 0, 0, 0], D: [0, 0, 0, 0] });
    }
  }
  for (const a of s.areaLights ?? []) {
    if (a.on === false || out.length >= MAX_LIGHTS) continue;
    const d = dirOf(a.az, a.el);
    const c = add(centre, scale(d, a.distance * size));
    let eu = cross([0, 0, 1], d); if (Math.hypot(...eu) < 1e-6) eu = [1, 0, 0];
    eu = scale(normalize(eu), a.width * size);
    let ev = scale(normalize(cross(d, eu)), a.height * size);
    // cross(eu, ev) must face the scene (−d).
    if (cross(eu, ev).reduce((s0, v, i) => s0 + v * d[i], 0) > 0) ev = scale(ev, -1);
    const corner = sub(c, scale(add(eu, ev), 0.5));
    out.push({ A: [3, ...corner], B: [...srgbToLinear(a.color ?? '#ffffff').map((v) => v * a.intensity), 0], C: [...eu, 0], D: [...ev, 0] });
  }
  return { lights: out, catcherU: up };
}

/** 32³ random values (repeatable), trilinear and repeating: the procedural textures' value noise. */
function noiseTexture(n = 32) {
  const data = new Uint8Array(n * n * n);
  let s = 12345;
  for (let i = 0; i < data.length; i++) { s = (Math.imul(s, 747796405) + 2891336453) >>> 0; const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0; data[i] = ((w >>> 22) ^ w) & 255; }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

/** The environment as half floats with mipmaps: bilinear, level-of-detail lookups (equirect: wraps across u). */
function filteredEnvTexture(data, w, h) {
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(65000, data[i]));
  const t = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.flipY = false; t.needsUpdate = true;
  return t;
}

const dataTexture = (data, w, h, format = THREE.RGBAFormat) => {
  const t = new THREE.DataTexture(data, w, h, format, THREE.FloatType);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  return t;
};

export class PathTracer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'render-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance', premultipliedAlpha: true });
    if (!this.renderer.capabilities.isWebGL2) throw new Error('WebGL2 is needed for path tracing');
    const gl = this.renderer.getContext();
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('float render targets are not supported');
    this.floatBlend = Boolean(gl.getExtension('EXT_float_blend'));
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.texW = this.maxTexture >= 4096 ? 4096 : 2048;
    this.texShift = this.texW === 4096 ? 12 : 11;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    // A shader that does not compile on this GPU: kept, so the app can fall back to the preview.
    this.shaderError = null;
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      this.shaderError = (gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program) || 'shader error').trim().slice(0, 400);
      console.error('path tracer shader:', this.shaderError);
    };
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.running = false; this.frame = 0; this.count = 0; this.tileIndex = 0;
    this.envCache = new Map();
    this.sceneKey = ''; this.scene = null;
    this.tilesPerFrame = 4;
    this.textures = {};
    this.mode = this.floatBlend ? 'blend' : 'pingpong';
    const defines = { TEXW: this.texW, TEXSHIFT: this.texShift };
    if (!this.floatBlend) defines.PINGPONG = 1;
    this.defines = defines;
    // Shader variants by feature set; every one shares the same uniform objects.
    this.uniforms = this.traceUniforms();
    this.variants = new Map();
    this.traceMat = this.variant([]);
    this.showMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: SHOW_FRAG, defines, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: { tColor: { value: null }, tAlbedo: { value: null }, tDenoised: { value: null }, uUseDenoised: { value: 0 }, uExposure: { value: 1 }, uBackground: { value: 0 }, uTone: { value: 1 }, uRes: { value: new THREE.Vector2() } } });
    this.denoiseMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: DENOISE_FRAG, defines, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: { tIn: { value: null }, tVarIn: { value: null }, tAlbedo: { value: null }, tNormal: { value: null }, tColor: { value: null }, tMoments: { value: null }, uStep: { value: 1 }, uFirst: { value: 1 }, uLast: { value: 0 }, uMode: { value: 1 }, uSigmaC: { value: 1 }, uSigmaL: { value: 4 }, uSigmaN: { value: 64 }, uSigmaD: { value: 0.02 }, uRes: { value: new THREE.Vector2() } } });
    const empty = new THREE.DataArrayTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, 1);
    empty.needsUpdate = true;
    this.textures.images = empty;
    this.uniforms.uImages.value = empty;
    this.textures.noise = noiseTexture();
    this.uniforms.uNoise.value = this.textures.noise;
    const blank = (data, fmt = THREE.RGBAFormat) => dataTexture(data, 1, 1, fmt);
    this.textures.uv = blank(new Float32Array(4));
    this.uniforms.uUv.value = this.textures.uv;
  }

  /** The tracing material for a feature list (compiled on first use, then kept). */
  variant(features) {
    const key = features.join(',');
    if (!this.variants.has(key)) {
      const defines = { ...this.defines };
      for (const f of features) defines[f] = 1;
      const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: TRACE_FRAG, defines, uniforms: this.uniforms, depthTest: false, depthWrite: false });
      if (this.floatBlend) Object.assign(m, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
      else m.blending = THREE.NoBlending;
      m.userData.compiled = false;
      m.userData.features = features;
      this.variants.set(key, m);
    }
    return this.variants.get(key);
  }

  /** Compiles a variant in the background (parallel compile where the GPU has it); onPhase reports it. */
  async compileVariant(mat, onPhase) {
    if (mat.userData.compiled) return;
    const t0 = performance.now();
    onPhase?.({ phase: 'compile', features: mat.userData.features });
    this.quad.material = mat;
    try { await this.renderer.compileAsync(this.quadScene, this.quadCam); } catch { /* compiled on first draw */ }
    mat.userData.compiled = true;
    this.lastCompileMs = performance.now() - t0;
  }

  traceUniforms() {
    const v4 = () => Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
    const u = (value) => ({ value });
    return {
      uTri: u(null), uNrm: u(null), uUv: u(null), uNodes: u(null), uMats: u(null), uEnv: u(null), uEnvLin: u(null), uEnvMarg: u(null), uEnvCond: u(null), uImages: u(null), uNoise: u(null),
      uPrev0: u(null), uPrev1: u(null), uPrev2: u(null), uPrev3: u(null), uTile: u(new THREE.Vector4()),
      uEnvSize: u(new THREE.Vector2(1, 1)), uEnvTotal: u(1), uEnvIntensity: u(1), uEnvRot: u(0), uEnvMaxLod: u(0), uPixAngle: u(0), uPixWidth: u(0), uCatcherMode: u(0),
      uRes: u(new THREE.Vector2(1, 1)), uFrame: u(0), uSeed: u(0), uHasTris: u(0),
      uCamPos: u(new THREE.Vector3()), uCamRight: u(new THREE.Vector3()), uCamUp: u(new THREE.Vector3()), uCamFwd: u(new THREE.Vector3()),
      uOrtho: u(0), uTanHalf: u(0.3), uHalfH: u(1), uAspect: u(1), uLensR: u(0), uFocus: u(1),
      uBounces: u(8), uGround: u(1), uGroundZ: u(0), uFloorMat: u(0), uCatcherRefl: u(0), uCatcherRough: u(0.2), uCatcherU: u(new THREE.Vector3()),
      uBackground: u(0), uEps: u(1e-3), uClamp: u(0), uCaustics: u(0),
      uLightCount: u(0), uLA: u(v4()), uLB: u(v4()), uLC: u(v4()), uLD: u(v4()),
    };
  }

  /** The environment of a preset (or a loaded HDR map) with its sampling tables, cached. */
  environment(id, preset, custom = null) {
    const key = custom ? `custom:${custom.width}x${custom.height}:${custom.key ?? ''}` : id;
    if (!this.envCache.has(key)) {
      const env = prepareEnvironment(custom ?? environmentMap(preset));
      const w = env.width; const h = env.height;
      const marg = new Float32Array(h + 1); marg.set(env.cdf.marginal);
      const cond = new Float32Array((w + 1) * h); cond.set(env.cdf.conditional);
      env.textures = { map: dataTexture(env.data, w, h), lin: filteredEnvTexture(env.data, w, h), marg: dataTexture(marg, h + 1, 1, THREE.RedFormat), cond: dataTexture(cond, w + 1, h, THREE.RedFormat) };
      env.maxLod = Math.log2(Math.max(w, h));
      this.envCache.set(key, env);
    }
    return this.envCache.get(key);
  }

  /** Builds (or reuses) the triangle textures and the hierarchy. */
  async buildScene(bodies) {
    const key = bodies.map((b) => `${b.geometry.key ?? b.geometry.uuid}:${b.uv ? 'uv' : ''}:${b.vertexColors ? `c${b.vertexColors.length}:${b.baseColor ?? ''}` : ''}:${(b.matrix?.elements ?? []).map((x) => x.toFixed(5)).join(',')}`).join('|');
    if (key === this.sceneKey && this.scene) return this.scene;
    const packed = packScene(bodies);
    const bvh = packed.count > 30000 && typeof Worker !== 'undefined' ? await buildInWorker(packed.positions) : buildBVH(packed.positions);
    const W = this.texW;
    const texels = Math.max(1, packed.count * 3);
    const rows = Math.ceil(texels / W);
    if (rows > this.maxTexture) throw new Error('the scene has too many triangles for this GPU');
    const tri = new Float32Array(W * rows * 4); const nrm = new Float32Array(W * rows * 4);
    for (let i = 0; i < packed.count; i++) {
      const t = bvh.order[i];
      for (let c = 0; c < 3; c++) {
        const o = (i * 3 + c) * 4; const s = t * 9 + c * 3;
        tri[o] = packed.positions[s]; tri[o + 1] = packed.positions[s + 1]; tri[o + 2] = packed.positions[s + 2];
        tri[o + 3] = c === 0 ? packed.body[t] : 0;
        nrm[o] = packed.normals[s]; nrm[o + 1] = packed.normals[s + 1]; nrm[o + 2] = packed.normals[s + 2];
        nrm[o + 3] = packed.colours[t * 3 + c];
      }
    }
    // UVs: 2 texels a triangle.
    const uvRows = Math.max(1, Math.ceil(Math.max(1, packed.count * 2) / W));
    const uvt = new Float32Array(W * uvRows * 4);
    if (packed.hasUv) {
      for (let i = 0; i < packed.count; i++) {
        const t = bvh.order[i]; const o = i * 8; const q = t * 6;
        uvt[o] = packed.uvs[q]; uvt[o + 1] = packed.uvs[q + 1]; uvt[o + 2] = packed.uvs[q + 2]; uvt[o + 3] = packed.uvs[q + 3];
        uvt[o + 4] = packed.uvs[q + 4]; uvt[o + 5] = packed.uvs[q + 5]; uvt[o + 6] = packed.uvOk[t];
      }
    }
    const nodeTexels = bvh.nodeCount * 2;
    const nodeRows = Math.ceil(nodeTexels / W);
    const nodes = new Float32Array(W * nodeRows * 4); nodes.set(bvh.nodes);
    for (const k of ['tri', 'nrm', 'nodes', 'uv']) this.textures[k]?.dispose();
    this.textures.tri = dataTexture(tri, W, rows); this.textures.nrm = dataTexture(nrm, W, rows); this.textures.nodes = dataTexture(nodes, W, nodeRows);
    this.textures.uv = dataTexture(uvt, W, uvRows);
    this.scene = { ...packed, bvh };
    this.sceneKey = key;
    return this.scene;
  }

  /** Uploads the materials (and the images of picture textures); the floor's is the last one. */
  async uploadMaterials(appearances, floor) {
    const list = [...appearances, floor];
    const { data, images } = packMaterials(list);
    const W = this.texW;
    const texels = list.length * (MATERIAL_FLOATS / 4);
    const rows = Math.ceil(texels / W);
    const tex = new Float32Array(W * rows * 4); tex.set(data);
    this.textures.mats?.dispose();
    this.textures.mats = dataTexture(tex, W, rows);
    const imgKey = images.map((s) => `${s.length}:${s.slice(-32)}`).join('|');
    if (imgKey !== this.imageKey) {
      this.imageKey = imgKey;
      if (images.length) {
        const layers = new Uint8Array(IMAGE_SIZE * IMAGE_SIZE * 4 * images.length);
        for (let i = 0; i < images.length; i++) layers.set(await imagePixels(images[i]), i * IMAGE_SIZE * IMAGE_SIZE * 4);
        const t = new THREE.DataArrayTexture(layers, IMAGE_SIZE, IMAGE_SIZE, images.length);
        // Mipmapped: the shader picks the level from the ray cone's footprint.
        t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
        t.needsUpdate = true;
        if (this.textures.images?.image?.depth > 0 && this.textures.images !== t) this.textures.images.dispose();
        this.textures.images = t;
      }
    }
    return list.length;
  }

  /**
   * Prepares a picture: { bodies: [{ geometry, matrix, appearance }], camera, target, box, sceneLights, preset,
   * settings (normalised) , custom (a loaded HDR map) }. Returns { width, height } — the picture starts over
   * (only the region when one is set and the size is unchanged).
   */
  async setup({ bodies, camera, target, box, sceneLights = null, preset, settings, custom = null, keepOutside = false, onPhase = null }) {
    this.stop();
    const token = (this.token = (this.token ?? 0) + 1);
    const s = settings;
    this.settings = s;
    const { width, height } = s.size;
    const sizeChanged = width !== this.width || height !== this.height || !this.accum;
    this.width = width; this.height = height;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    if (sizeChanged) this.makeTargets(width, height);
    onPhase?.({ phase: 'scene' });
    const scene = await this.buildScene(bodies);
    if (token !== this.token) return null;
    const bb = box && !box.isEmpty() ? box.clone() : new THREE.Box3(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50));
    const size = bb.getSize(new THREE.Vector3()).length() || 100;
    const centre = bb.getCenter(new THREE.Vector3());
    this.box = bb; this.size = size; this.centre = centre;
    const floor = floorAppearance(preset.floor, s.floorRoughness);
    floor.ior = (1 + Math.sqrt(s.floorReflect)) / Math.max(1e-3, 1 - Math.sqrt(s.floorReflect));
    const matCount = await this.uploadMaterials(bodies.map((b) => b.appearance), floor);
    if (token !== this.token) return null;
    const env = this.environment(s.env, preset, custom);
    const cam = tracerCamera(camera, target, width, height, s);
    this.cam = cam;
    const { lights, catcherU } = tracerLights({ preset, settings: s, sceneLights, centre: centre.toArray(), size, envIrradianceUp: env.irradianceUp });
    // The shader variant this scene needs, compiled in the background the first time.
    this.features = shaderFeatures({ appearances: bodies.map((b) => b.appearance), scene, lights, settings: s });
    this.traceMat = this.variant(this.features);
    await this.compileVariant(this.traceMat, onPhase);
    if (this.shaderError) throw Object.assign(new Error(this.shaderError), { code: 'shader' });
    if (token !== this.token) return null;
    const u = this.uniforms;
    u.uUv.value = this.textures.uv; u.uEnvLin.value = env.textures.lin; u.uEnvMaxLod.value = env.maxLod;
    u.uPixAngle.value = cam.ortho ? 0 : (2 * cam.tanHalf) / height; u.uPixWidth.value = cam.ortho ? (2 * cam.halfHeight) / height : 0;
    u.uCatcherMode.value = s.catcherMode === 'differential' ? 1 : 0;
    u.uTri.value = this.textures.tri; u.uNrm.value = this.textures.nrm; u.uNodes.value = this.textures.nodes; u.uMats.value = this.textures.mats; u.uImages.value = this.textures.images;
    u.uEnv.value = env.textures.map; u.uEnvMarg.value = env.textures.marg; u.uEnvCond.value = env.textures.cond;
    u.uEnvSize.value.set(env.width, env.height); u.uEnvTotal.value = env.cdf.total; u.uEnvIntensity.value = s.envIntensity; u.uEnvRot.value = (s.envRotation * Math.PI) / 180;
    u.uRes.value.set(width, height); u.uHasTris.value = scene.count > 0 ? 1 : 0;
    u.uCamPos.value.fromArray(cam.position); u.uCamRight.value.fromArray(cam.right); u.uCamUp.value.fromArray(cam.up); u.uCamFwd.value.fromArray(cam.forward);
    u.uOrtho.value = cam.ortho ? 1 : 0; u.uTanHalf.value = cam.tanHalf; u.uHalfH.value = cam.halfHeight; u.uAspect.value = cam.aspect; u.uLensR.value = cam.lensRadius; u.uFocus.value = cam.focusDistance;
    u.uBounces.value = s.bounces;
    u.uGround.value = { none: 0, shadow: 1, floor: 2 }[s.ground];
    u.uGroundZ.value = bb.min.z - size * 0.0005;
    u.uFloorMat.value = matCount - 1;
    u.uCatcherRefl.value = s.ground === 'shadow' && s.reflections ? s.floorReflect : 0;
    u.uCatcherRough.value = s.floorRoughness;
    u.uCatcherU.value.set(...catcherU);
    u.uBackground.value = { env: 0, white: 1, transparent: 2 }[s.background];
    u.uEps.value = size * 2e-5;
    u.uClamp.value = s.clamp;
    u.uCaustics.value = s.caustics === 'physical' ? 1 : 0;
    u.uLightCount.value = lights.length;
    lights.forEach((l, i) => { u.uLA.value[i].fromArray(l.A); u.uLB.value[i].fromArray(l.B); u.uLC.value[i].fromArray(l.C); u.uLD.value[i].fromArray(l.D); });
    u.uSeed.value = s.seed ?? 0;
    this.lights = lights;
    this.exposure = preset.exposure * s.exposure;
    this.region = regionPixels(s.region, width, height);
    this.tiles = makeTiles(width, height, this.region, this.floatBlend ? 128 : 512);
    this.tileIndex = 0; this.count = 0; this.ms = 0; this.denoised = false; this.dnCount = -1;
    this.clear(keepOutside && !sizeChanged && this.region ? this.region : null);
    return { width, height };
  }

  makeTargets(w, h) {
    for (const t of this.accum ?? []) t.dispose();
    for (const t of this.dn ?? []) t.dispose();
    const opts = { count: 4, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false };
    this.accum = this.floatBlend ? [new THREE.WebGLRenderTarget(w, h, opts)] : [new THREE.WebGLRenderTarget(w, h, opts), new THREE.WebGLRenderTarget(w, h, opts)];
    const one = { count: 2, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false };
    this.dn = [new THREE.WebGLRenderTarget(w, h, one), new THREE.WebGLRenderTarget(w, h, one)];
  }

  /** Clears the sums (only inside `rect` — the region — when given: the rest of the last picture stays). */
  clear(rect = null) {
    const r = this.renderer;
    r.setClearColor(0x000000, 0);
    for (const t of this.accum) {
      if (rect) { t.scissor.set(rect.x, rect.y, rect.w, rect.h); t.scissorTest = true; } else t.scissorTest = false;
      r.setRenderTarget(t); r.clear(true, false, false);
      t.scissorTest = false;
    }
    r.setRenderTarget(null);
  }

  /** Draws one tile of the current pass. */
  drawTile() {
    const tile = this.tiles[this.tileIndex];
    const r = this.renderer; const u = this.uniforms;
    u.uFrame.value = this.count;
    this.quad.material = this.traceMat;
    if (this.floatBlend) {
      const t = this.accum[0];
      t.scissor.set(tile.x, tile.y, tile.w, tile.h); t.scissorTest = true;
      r.setRenderTarget(t); r.render(this.quadScene, this.quadCam);
      t.scissorTest = false;
    } else {
      const [prev, next] = this.accum;
      u.uPrev0.value = prev.textures[0]; u.uPrev1.value = prev.textures[1]; u.uPrev2.value = prev.textures[2]; u.uPrev3.value = prev.textures[3];
      u.uTile.value.set(tile.x, tile.y, tile.x + tile.w, tile.y + tile.h);
      r.setRenderTarget(next); r.render(this.quadScene, this.quadCam);
      this.accum = [next, prev];
    }
    r.setRenderTarget(null);
    this.tileIndex += 1;
    if (this.tileIndex >= this.tiles.length) { this.tileIndex = 0; this.count += 1; }
  }

  /** The current sums (the target holding the latest values). */
  get sums() { return this.accum[0]; }

  /**
   * Denoises the mean into dn[0] (à-trous, 5 levels): 'svgf' (default) stops at luminance edges scaled by the
   * estimated standard deviation and filters the variance along; 'atrous' uses a fixed relative edge stop.
   */
  denoise() {
    const r = this.renderer; const u = this.denoiseMat.uniforms; const s = this.settings;
    const src = this.sums;
    u.tAlbedo.value = src.textures[1]; u.tNormal.value = src.textures[2]; u.tColor.value = src.textures[0]; u.tMoments.value = src.textures[3];
    u.uRes.value.set(this.width, this.height);
    u.uMode.value = s.denoiser === 'atrous' ? 0 : 1;
    u.uSigmaL.value = 4 * s.denoiseStrength;
    u.uSigmaC.value = (s.denoiseStrength * 2.5) / Math.sqrt(Math.max(1, this.count));
    this.quad.material = this.denoiseMat;
    let a = 0;
    const levels = 5;
    for (let i = 0; i < levels; i++) {
      u.uStep.value = 1 << i; u.uFirst.value = i === 0 ? 1 : 0; u.uLast.value = i === levels - 1 ? 1 : 0;
      u.tIn.value = i === 0 ? src.textures[0] : this.dn[a].textures[0];
      u.tVarIn.value = i === 0 ? src.textures[3] : this.dn[a].textures[1];
      const out = i === 0 ? 0 : 1 - a;
      r.setRenderTarget(this.dn[out]); r.render(this.quadScene, this.quadCam);
      a = out;
    }
    if (a !== 0) { const tmp = this.dn[0]; this.dn[0] = this.dn[1]; this.dn[1] = tmp; }
    r.setRenderTarget(null);
    this.denoised = true;
  }

  /**
   * Shows the picture: the mean, denoised when that is on (the denoiser runs again every 8 passes while rendering,
   * and on the last pass: `fresh`).
   */
  show({ fresh = false } = {}) {
    const s = this.settings;
    const r = this.renderer;
    const useDn = s.denoise && this.count > 0;
    if (useDn && (fresh || !this.denoised || this.count - (this.dnCount ?? 0) >= 8 || this.count < 4) && this.dnCount !== this.count) { this.denoise(); this.dnCount = this.count; }
    const u = this.showMat.uniforms;
    u.tColor.value = this.sums.textures[0]; u.tAlbedo.value = this.sums.textures[1]; u.tDenoised.value = this.dn[0].textures[0];
    u.uUseDenoised.value = useDn ? 1 : 0; u.uExposure.value = this.exposure; u.uBackground.value = { env: 0, white: 1, transparent: 2 }[s.background];
    u.uTone.value = s.tone === 'linear' ? 0 : 1; u.uRes.value.set(this.width, this.height);
    this.quad.material = this.showMat;
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0); r.clear(true, false, false);
    r.render(this.quadScene, this.quadCam);
  }

  /**
   * Renders progressively: tiles each animation frame (more while frames stay quick, fewer when they get slow), the
   * picture shown after every frame. Stops at the sample count or the time limit.
   */
  start({ onProgress = null, onDone = null, onError = null } = {}) {
    this.stopLoop();
    this.running = true;
    const s = this.settings;
    const started = performance.now() - (this.ms ?? 0);
    let last = performance.now();
    const step = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = now - last; last = now;
      if (dt > 45) this.tilesPerFrame = Math.max(1, Math.floor(this.tilesPerFrame * 0.7));
      else if (dt < 24) this.tilesPerFrame = Math.min(this.tiles.length * 4, Math.ceil(this.tilesPerFrame * 1.25));
      for (let k = 0; k < this.tilesPerFrame && this.count < s.samples; k++) this.drawTile();
      if (this.shaderError) { this.running = false; onError?.(this.shaderError); return; }
      this.ms = performance.now() - started;
      const timeUp = s.timeLimit > 0 && this.ms >= s.timeLimit * 1000;
      const finished = this.count >= s.samples || timeUp;
      if (!finished) this.show();
      onProgress?.({ count: this.count, total: s.samples, ms: this.ms, fraction: (this.count + this.tileIndex / this.tiles.length) / s.samples });
      if (finished) { this.running = false; this.show({ fresh: true }); onDone?.({ count: this.count, ms: this.ms, timeUp }); return; }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Renders n whole passes now (tests, small pictures) and shows the result. */
  renderNow(n = this.settings.samples) {
    this.stopLoop();
    const target = this.count + n;
    while (this.count < target) this.drawTile();
    this.show({ fresh: true });
    return this.count;
  }

  stopLoop() { this.running = false; cancelAnimationFrame(this.frame); this.frame = 0; }
  stop() { this.stopLoop(); }

  /** The mean of the sums as RGBA floats (linear radiance, coverage) and the sample counts. */
  meanImage() {
    const w = this.width; const h = this.height;
    const c = new Float32Array(w * h * 4); const a = new Float32Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.sums, 0, 0, w, h, c, undefined, 0);
    this.renderer.readRenderTargetPixels(this.sums, 0, 0, w, h, a, undefined, 1);
    for (let i = 0; i < w * h; i++) { const n = Math.max(1, a[i * 4 + 3]); for (let k = 0; k < 4; k++) c[i * 4 + k] /= n; }
    return { data: c, width: w, height: h, counts: a };
  }

  /** The denoised mean (RGBA floats, rows from the bottom) — runs the denoiser on the current sums. */
  denoisedImage() {
    this.denoise(); this.dnCount = this.count;
    const w = this.width; const h = this.height;
    const d = new Float32Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.dn[0], 0, 0, w, h, d, undefined, 0);
    return { data: d, width: w, height: h };
  }

  /** The picture as a PNG blob. */
  toBlob() { return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png')); }

  /** Average brightness and spread of the shown picture. */
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

  /** The body and distance under a point of the picture (fractions 0…1 from the top left), from the CPU copy of the hierarchy. */
  pick(fx, fy) {
    if (!this.scene || !this.cam) return null;
    const c = this.cam;
    const x = fx * 2 - 1; const y = 1 - fy * 2;
    let origin; let dir;
    if (c.ortho) { origin = add(c.position, add(scale(c.right, x * c.halfHeight * c.aspect), scale(c.up, y * c.halfHeight))); dir = c.forward; }
    else { origin = c.position; dir = normalize(add(c.forward, add(scale(c.right, x * c.tanHalf * c.aspect), scale(c.up, y * c.tanHalf)))); }
    const hit = intersectBVH(this.scene.bvh, this.scene.positions, origin, dir);
    if (!hit) return null;
    const p = add(origin, scale(dir, hit.t));
    const depth = sub(p, c.position).reduce((s0, v, i) => s0 + v * c.forward[i], 0);
    return { body: this.scene.body[hit.triangle], distance: depth, point: p };
  }

  dispose() {
    this.stop();
    for (const t of Object.values(this.textures)) t?.dispose?.();
    for (const e of this.envCache.values()) for (const t of Object.values(e.textures)) t.dispose();
    this.envCache.clear();
    for (const t of [...(this.accum ?? []), ...(this.dn ?? [])]) t.dispose();
    for (const m of [...this.variants.values(), this.showMat, this.denoiseMat]) m.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.canvas.remove();
  }
}

/** The region in GL pixels (origin bottom left) from fractions of the picture (origin top left), or null. */
export function regionPixels(region, w, h) {
  if (!region) return null;
  const x0 = Math.max(0, Math.floor(Math.min(region.x0, region.x1) * w)); const x1 = Math.min(w, Math.ceil(Math.max(region.x0, region.x1) * w));
  const yTop = Math.max(0, Math.floor(Math.min(region.y0, region.y1) * h)); const yBot = Math.min(h, Math.ceil(Math.max(region.y0, region.y1) * h));
  if (x1 - x0 < 1 || yBot - yTop < 1) return null;
  return { x: x0, y: h - yBot, w: x1 - x0, h: yBot - yTop };
}

/** Tiles of a picture (GL pixels), only those inside the region, clipped to it. */
export function makeTiles(w, h, region = null, size = 128) {
  const r = region ?? { x: 0, y: 0, w, h };
  const out = [];
  for (let y = r.y; y < r.y + r.h; y += size) {
    for (let x = r.x; x < r.x + r.w; x += size) out.push({ x, y, w: Math.min(size, r.x + r.w - x), h: Math.min(size, r.y + r.h - y) });
  }
  return out;
}

let worker = null; let workerId = 0;
function buildInWorker(positions) {
  try {
    worker ??= new Worker(new URL('./bvh-worker.js', import.meta.url), { type: 'module' });
  } catch { return Promise.resolve(buildBVH(positions)); }
  const id = ++workerId;
  const copy = positions.slice();
  return new Promise((resolve) => {
    const onMessage = (e) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      if (e.data.error) resolve(buildBVH(positions)); else resolve(e.data);
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', () => resolve(buildBVH(positions)), { once: true });
    worker.postMessage({ id, positions: copy }, [copy.buffer]);
  });
}

/** The RGBA pixels (IMAGE_SIZE²) of an image data URL. */
async function imagePixels(url) {
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { return new Uint8Array(IMAGE_SIZE * IMAGE_SIZE * 4).fill(255); }
  const c = document.createElement('canvas');
  c.width = IMAGE_SIZE; c.height = IMAGE_SIZE;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  return new Uint8Array(g.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE).data.buffer);
}

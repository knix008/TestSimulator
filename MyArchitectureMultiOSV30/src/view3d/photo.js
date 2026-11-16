// Photo-real picture of the 3D view (ported from MySketchBook's engine/photo.js):
// unbiased path tracing (three-gpu-pathtracer, vendored with three-mesh-bvh)
// of the viewer's scene from its camera, in a WebGL context of its own at the
// chosen size. One sample per frame keeps the window responsive; progress and
// the time left are reported and the work can be cancelled (signal.cancelled).
// The interactive view is left as it was.

import * as THREE from "../vendor/three/three.module.js";

/** Photo quality presets: samples per pixel. */
export const PHOTO_QUALITY = { draft: 64, good: 256, best: 1024 };

/** An equirectangular sky (the light a sky dome gives): blue above, a bright horizon, dark ground; night is dark. */
export function skyTexture({ night = false } = {}) {
  const w = 256, h = 128;
  const top = new THREE.Color(night ? 0x070b16 : 0x8fb6dc), hor = new THREE.Color(night ? 0x1b2337 : 0xf2efe8), gnd = new THREE.Color(night ? 0x05070c : 0x6f6b60);
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const elev = 1 - (y / (h - 1)) * 2; // 1 = straight up
    const c = elev > 0 ? hor.clone().lerp(top, Math.pow(Math.min(1, elev * 1.6), 0.7)) : hor.clone().lerp(gnd, Math.min(1, -elev * 8));
    const k = elev > 0 ? 1.1 : 0.35;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = c.r * k; data[i + 1] = c.g * k; data[i + 2] = c.b * k; data[i + 3] = 1; }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Path-traces the viewer's scene. Resolves with a canvas (null when cancelled).
 * onProgress(done, total, secondsLeft). `transparent`: no sky behind the building (alpha 0 where rays escape).
 */
export async function renderPhoto(viewer, { width, height, samples = PHOTO_QUALITY.good, signal = {}, onProgress = () => {}, transparent = false, night = false } = {}) {
  const { WebGLPathTracer } = await import("../vendor/pathtracer/three-gpu-pathtracer.module.js");
  const { scene, camera: viewCamera, renderer: viewRenderer } = viewer.three;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance", alpha: transparent, premultipliedAlpha: false });
  if (transparent) renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = viewRenderer.toneMapping;
  renderer.toneMappingExposure = viewRenderer.toneMappingExposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const restore = viewer.photoPrep();
  const savedEnv = scene.environment, savedBg = scene.background, savedIntensity = scene.environmentIntensity;
  // The HDRI chosen in the Style panel lights the photo too (and is its sky); else the gradient sky.
  const hdri = viewer.environmentInfo ? viewer.environmentInfo().picture : null;
  const env = hdri || skyTexture({ night });
  scene.environment = env;
  scene.environmentIntensity = night ? 0.05 : 1;
  scene.background = transparent ? null : env;

  const camera = viewCamera.clone();
  if (camera.isPerspectiveCamera) camera.aspect = width / height;
  else { const halfH = (camera.top - camera.bottom) / 2; camera.left = (-halfH * width) / height; camera.right = (halfH * width) / height; }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const tracer = new WebGLPathTracer(renderer);
  tracer.renderScale = 1;
  tracer.tiles.set(Math.ceil(width / 960), Math.ceil(height / 960));
  tracer.bounces = 6;
  tracer.transmissiveBounces = 8;
  tracer.filterGlossyFactor = 0.5;
  tracer.minSamples = 1;
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.dynamicLowRes = false;
  try {
    // Building the BVH of the whole scene takes a moment: one frame first so the progress shows.
    onProgress(0, samples, NaN);
    await new Promise((r) => setTimeout(r, 50));
    tracer.setScene(scene, camera);
    // The first sample also compiles the shaders and uploads the scene: the time left is measured after it.
    let start = 0, first = 0;
    while (tracer.samples < samples) {
      if (signal.cancelled) return null;
      tracer.renderSample();
      const done = Math.floor(tracer.samples);
      if (!start) { start = performance.now(); first = done; }
      const elapsed = (performance.now() - start) / 1000;
      onProgress(done, samples, done > first ? (elapsed / (done - first)) * (samples - done) : NaN);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const out = document.createElement("canvas");
    out.width = width; out.height = height;
    out.getContext("2d").drawImage(canvas, 0, 0);
    return out;
  } finally {
    tracer.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (env !== hdri) env.dispose();
    scene.environment = savedEnv;
    scene.background = savedBg;
    scene.environmentIntensity = savedIntensity;
    restore();
  }
}

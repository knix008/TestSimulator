// Photo-real rendering: unbiased path tracing (three-gpu-pathtracer) of the
// current view in its own WebGL context at the chosen size. The work is split
// into samples, one per frame, so the window stays responsive; progress and
// the time left are reported, and the user can cancel (signal.cancelled).
// The interactive view keeps running untouched.
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

/** A small equirectangular sky (for the light that the HDRI would give) when no HDRI is chosen. */
function gradientEnvironment(viewport) {
  const u = viewport.sky.material.uniforms;
  const w = 256; const h = 128;
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1); // 1 = up
    const elev = v * 2 - 1;
    const c = elev > 0 ? u.horizon.value.clone().lerp(u.top.value, Math.pow(Math.min(1, elev * 1.6), 0.7)) : u.horizon.value.clone().lerp(u.ground.value, Math.min(1, -elev * 8));
    const k = elev > 0 ? 1.1 : 0.35;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = c.r * k; data[i + 1] = c.g * k; data[i + 2] = c.b * k; data[i + 3] = 1; }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Renders the viewport's scene from its camera. Resolves with a canvas (null when cancelled).
 * onProgress(done, total, secondsLeft).
 */
export async function renderPathTraced(viewport, { width, height, samples = 256, signal = {}, onProgress = () => {}, environment = null }) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = viewport.renderer.toneMapping;
  renderer.toneMappingExposure = viewport.renderer.toneMappingExposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = viewport.scene;
  // Helpers (grid, axes, ground shadow catcher, sky shader) are not part of the photo.
  const hidden = [];
  for (const o of [viewport.helpers]) if (o.visible) { hidden.push(o); o.visible = false; }
  const savedEnv = scene.environment;
  const savedBg = scene.background;
  const env = environment ?? viewport.photoEnvironment ?? gradientEnvironment(viewport);
  scene.environment = env;
  scene.background = savedBg && savedBg.isTexture && savedBg.mapping === THREE.EquirectangularReflectionMapping ? savedBg : env;

  const camera = viewport.camera.clone();
  if (camera.isPerspectiveCamera) camera.aspect = width / height;
  else { const halfH = (camera.top - camera.bottom) / 2; camera.left = -halfH * width / height; camera.right = halfH * width / height; }
  camera.updateProjectionMatrix();

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
    // Building the BVH of the whole scene takes a moment; one frame first so the progress window shows.
    onProgress(0, samples, NaN);
    await new Promise((resolve) => setTimeout(resolve, 50));
    tracer.setScene(scene, camera);
    const start = performance.now();
    while (tracer.samples < samples) {
      if (signal.cancelled) return null;
      tracer.renderSample();
      const done = Math.floor(tracer.samples);
      const elapsed = (performance.now() - start) / 1000;
      onProgress(done, samples, done ? (elapsed / done) * (samples - done) : NaN);
      // One sample per frame keeps the UI (and the progress popup) alive.
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    out.getContext('2d').drawImage(canvas, 0, 0);
    return out;
  } finally {
    tracer.dispose();
    renderer.dispose();
    scene.environment = savedEnv;
    scene.background = savedBg;
    for (const o of hidden) o.visible = true;
    if (!environment && !viewport.photoEnvironment) env.dispose();
    viewport.requestRender();
  }
}

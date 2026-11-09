// The 3D view: renderer, cameras, SketchUp-style navigation, picking and
// on-demand rendering.
//
// Performance rules (3D drawing speed is the top requirement):
// - Nothing is drawn unless something changed (requestRender); an idle model costs no GPU time.
// - While the camera moves, frames skip ambient occlusion and keep the shadow map; when the
//   camera stops, one full-quality frame (AO, fresh shadows if needed) follows.
// - Shadow maps update only when the scene or the sun changed (shadowMap.autoUpdate = false).
// - Picking uses BVH trees (three-mesh-bvh), so hovering a 1M-triangle model stays instant.
// - When frames get slow during interaction the resolution steps down, and back up when fast.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { sunDirection } from './sun.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

export const AXIS_COLORS = { x: '#d6303b', y: '#2e6fd6', z: '#2f9e44' };
export const STYLE_MODES = ['textured', 'shaded', 'white', 'xray', 'wireframe', 'hiddenline'];
export const VIEWS = ['iso', 'top', 'front', 'back', 'left', 'right', 'bottom'];

const QUALITY = {
  fast: { ao: false, shadowMap: 1024, samples: 0 },
  balanced: { ao: true, shadowMap: 2048, samples: 4 },
  high: { ao: true, shadowMap: 4096, samples: 8 },
};
const SHADOW_SIZE = { low: 1024, medium: 2048, high: 4096 };

export class Viewport {
  /**
   * @param {HTMLElement} host
   * @param {{ settings: () => object, onCamera?: Function, onStats?: Function, onNavigate?: Function }} options
   */
  constructor(host, options = {}) {
    this.host = host;
    this.options = options;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'viewport-canvas';
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    // Statistics cover the whole frame (composer passes + overlay), reset once per frame.
    renderer.info.autoReset = false;
    renderer.localClippingEnabled = true;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.content = new THREE.Group();
    this.content.name = 'content';
    this.helpers = new THREE.Group();
    this.helpers.name = 'helpers';
    this.scene.add(this.content, this.helpers);
    this.overlay = new THREE.Scene();
    this.overlay.name = 'overlay';

    this.perspective = new THREE.PerspectiveCamera(50, 1, 0.02, 2000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 3000);
    this.camera = this.perspective;
    this.target = new THREE.Vector3(0, 0.8, 0);
    this.perspective.position.set(8, 7, 9);
    this.perspective.lookAt(this.target);

    this.setupLights();
    this.setupHelpers();
    this.setupComposer();

    this.dirty = true;
    this.shadowsDirty = true;
    this.interacting = false;
    this.idleTimer = 0;
    this.finalPending = false;
    this.resolutionScale = 1;
    this.frameTimes = [];
    this.stats = { fps: 0, calls: 0, triangles: 0, ms: 0 };
    this.styleMode = 'textured';
    this.clipPlanes = [];
    this.planMode = false;
    this.selectionHelpers = new THREE.Group();
    this.overlay.add(this.selectionHelpers);
    this.animation = null;
    this.navTool = null;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.bindNavigation();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  settings() { return this.options.settings?.() ?? {}; }

  // ───────────────────────── scene setup

  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7c6a, 0.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.roomEnv = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.roomEnv;
    this.scene.environmentIntensity = 0.55;
  }

  setupHelpers() {
    // Sky/ground gradient behind everything (SketchUp's sky and ground), drawn first without depth.
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: { top: { value: new THREE.Color('#9fc4ea') }, horizon: { value: new THREE.Color('#e8eef3') }, ground: { value: new THREE.Color('#d9d4cb') } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir; void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.7)) : mix(horizon, ground, min(1.0, -h * 8.0)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -100;
    this.sky.name = 'sky';
    this.sky.onBeforeRender = (renderer, scene, camera) => { this.sky.position.copy(camera.position); this.sky.scale.setScalar(camera.isOrthographicCamera ? 2000 : camera.far * 0.9); this.sky.updateMatrixWorld(); };
    this.helpers.add(this.sky);

    // Ground that only shows shadows (objects outside rooms still cast them).
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.003;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.ground.userData.helper = true;
    this.helpers.add(this.ground);

    // Grid: one shader plane, lines every `size`, stronger every 5, fading with distance — a single draw call.
    const gridMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { size: { value: 0.5 }, color: { value: new THREE.Color('#5f6b7a') }, fade: { value: 60 }, opacity: { value: 0.35 } },
      vertexShader: 'varying vec3 vPos; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float size; uniform vec3 color; uniform float fade; uniform float opacity; varying vec3 vPos;
        float line(float s){ vec2 c = vPos.xz / s; vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){ float d = length(vPos.xz - cameraPosition.xz); float a = max(line(size) * 0.45, line(size * 5.0)) * opacity * (1.0 - smoothstep(fade * 0.3, fade, d)); if (a < 0.01) discard; gl_FragColor = vec4(color, a); }`,
      extensions: { derivatives: true },
    });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), gridMaterial);
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.position.y = -0.002;
    this.grid.renderOrder = -1;
    this.grid.name = 'grid';
    this.grid.userData.helper = true;
    this.helpers.add(this.grid);

    // Drawing axes: red = x, blue = up (y), green = −z (north) — solid on the positive side, dashed behind.
    this.axes = new THREE.Group();
    this.axes.name = 'axes';
    const axis = (dir, color) => {
      const solid = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(500)]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(-500)]), new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.12, transparent: true, opacity: 0.55 }));
      dashed.computeLineDistances();
      this.axes.add(solid, dashed);
    };
    axis(new THREE.Vector3(1, 0, 0), AXIS_COLORS.x);
    axis(new THREE.Vector3(0, 1, 0), AXIS_COLORS.y);
    axis(new THREE.Vector3(0, 0, -1), AXIS_COLORS.z);
    this.axes.traverse((o) => { o.userData.helper = true; o.renderOrder = 1; });
    this.helpers.add(this.axes);
  }

  setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.aoPass = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.aoPass.output = GTAOPass.OUTPUT.Default;
    this.aoPass.blendIntensity = 0.85;
    this.aoPass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12 });
    this.aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.composer.addPass(this.aoPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.smaaPass = new SMAAPass();
    this.smaaPass.enabled = false;
    this.composer.addPass(this.smaaPass);
  }

  // ───────────────────────── settings

  /** Applies quality settings (Settings › 3D view and the toolbar). */
  applySettings() {
    const s = this.settings();
    const q = QUALITY[s.renderQuality] ?? QUALITY.balanced;
    const shadowSize = SHADOW_SIZE[s.shadowQuality] ?? q.shadowMap;
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = s.shadows !== false;
    this.aoEnabled = s.ambientOcclusion !== false && q.ao;
    const samples = s.antialias === false ? 0 : q.samples;
    if (this.composer.renderTarget1.samples !== samples) {
      this.composer.renderTarget1.samples = samples;
      this.composer.renderTarget2.samples = samples;
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.grid.visible = s.showGrid !== false && !this.planModeHidesGrid;
    this.axes.visible = s.showAxes !== false;
    this.perspective.fov = s.fieldOfView || 50;
    this.perspective.updateProjectionMatrix();
    this.resize();
    this.invalidateShadows();
  }

  setSkyColors({ top, horizon, ground }) {
    const u = this.sky.material.uniforms;
    if (top) u.top.value.set(top);
    if (horizon) u.horizon.value.set(horizon);
    if (ground) u.ground.value.set(ground);
    this.requestRender();
  }

  /** Environment lighting: the built-in room or an HDRI texture (PMREM) from library/environments.js. */
  setEnvironment(texture, { background = null, intensity = 0.55 } = {}) {
    this.scene.environment = texture ?? this.roomEnv;
    this.scene.environmentIntensity = intensity;
    this.scene.background = background;
    this.sky.visible = !background;
    this.requestRender();
  }

  /** Sun from the project's date, time and place; below the horizon only the sky light remains. */
  setSun(sun, { enabled = true } = {}) {
    const d = sunDirection(sun);
    const up = Math.max(0, d.y);
    const strength = enabled ? Math.min(1, up * 4) : 0;
    this.sun.intensity = 2.6 * strength;
    this.sun.color.setHSL(0.09, 0.6, 0.6 + 0.35 * Math.min(1, up * 2));
    this.sunDir = new THREE.Vector3(d.x, Math.max(0.02, d.y), d.z).normalize();
    this.fitShadowCamera();
    this.hemi.intensity = 0.25 + 0.25 * strength;
    this.invalidateShadows();
  }

  /** Shadow camera around the content (tight bounds = sharp shadows). */
  fitShadowCamera() {
    const box = this.contentBox();
    // Rounded to 1 m: a small edit leaves the shadow camera (and every shadow texel) where it was.
    const raw = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const center = new THREE.Vector3(Math.round(raw.x), Math.round(raw.y), Math.round(raw.z));
    const radius = box.isEmpty() ? 10 : Math.ceil(Math.max(2, box.getSize(new THREE.Vector3()).length() / 2 + 0.5));
    const dir = this.sunDir ?? new THREE.Vector3(0.5, 0.8, 0.3).normalize();
    this.sun.position.copy(center).addScaledVector(dir, radius * 2.2);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.near = 0.1; cam.far = radius * 4.5;
    cam.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
  }

  contentBox() {
    const box = new THREE.Box3();
    this.content.traverseVisible((o) => {
      if ((o.isMesh || o.isInstancedMesh) && !o.userData.helper && !o.userData.noBounds) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
    });
    return box;
  }

  // ───────────────────────── rendering

  requestRender() { this.dirty = true; }
  invalidateShadows() { this.shadowsDirty = true; this.dirty = true; }
  /** The content changed: fresh shadows and bounds. */
  contentChanged() { this.fitShadowCamera(); this.invalidateShadows(); }
  /** Objects moved (dragging): fresh shadows, but the shadow camera stays put so shadows don't shimmer. */
  contentMoved() { this.invalidateShadows(); }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const s = this.settings();
    const dpr = (s.pixelRatio || Math.min(window.devicePixelRatio || 1, 2)) * this.resolutionScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.width = w;
    this.height = h;
    this.updateProjection();
    this.requestRender();
  }

  updateProjection() {
    const aspect = this.width / this.height;
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    const halfH = this.orthoHalfHeight ?? 5;
    this.ortho.left = -halfH * aspect;
    this.ortho.right = halfH * aspect;
    this.ortho.top = halfH;
    this.ortho.bottom = -halfH;
    this.ortho.updateProjectionMatrix();
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    if (this.animation) this.stepAnimation(now);
    if (this.walk?.active) this.stepWalk(now);
    if (!this.dirty) return;
    const s = this.settings();
    const minInterval = s.maxFps ? 1000 / s.maxFps : 0;
    if (minInterval && this.lastFrame && now - this.lastFrame < minInterval - 1) return;
    this.dirty = false;
    this.renderFrame(now);
  }

  renderFrame(now = performance.now()) {
    const t0 = performance.now();
    this.renderer.info.reset();
    const final = !this.interacting && !this.animation;
    this.renderPass.camera = this.camera;
    this.aoPass.camera = this.camera;
    // Ambient occlusion stays on while moving when the last full frame was cheap, so nothing pops on and off.
    this.aoPass.enabled = this.aoEnabled && this.styleMode !== 'wireframe' && (final || (this.lastFinalMs ?? 99) < 12);
    this.renderer.clippingPlanes = this.clipPlanes;
    if (this.shadowsDirty && this.sun.castShadow) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.updateGrid();
    this.options.beforeRender?.(this);
    this.composer.render();
    const sceneInfo = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
    // Overlay (tool previews, inference, selection boxes) on top, without the scene's depth.
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.clippingPlanes = [];
    this.renderer.render(this.overlay, this.camera);
    this.renderer.autoClear = true;
    const ms = performance.now() - t0;
    if (final) this.lastFinalMs = ms;
    const info = sceneInfo;
    this.stats.calls = info.calls;
    this.stats.triangles = info.triangles;
    this.stats.ms = ms;
    if (this.lastFrame) {
      this.frameTimes.push(now - this.lastFrame);
      if (this.frameTimes.length > 30) this.frameTimes.shift();
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.stats.fps = this.interacting || this.animation ? Math.round(1000 / Math.max(1, avg)) : this.stats.fps;
    }
    this.lastFrame = now;
    this.adaptResolution(ms);
    this.options.onStats?.(this.stats, final);
  }

  /** Slow interactive frames lower the resolution a step; fast ones restore it (hysteresis, not per frame). */
  adaptResolution(ms) {
    // Changing the canvas resolution mid-drag makes the picture jump: only when frames are really slow (> 45 ms).
    if (this.interacting && ms < 45) { this.slowFrames = 0; return; }
    if (!this.interacting) {
      if (this.resolutionScale !== 1 && !this.finalPending) { this.resolutionScale = 1; this.resize(); }
      return;
    }
    this.slowFrames = ms > 28 ? (this.slowFrames ?? 0) + 1 : 0;
    if (this.slowFrames > 6 && this.resolutionScale > 0.5) { this.resolutionScale = Math.max(0.5, this.resolutionScale - 0.25); this.slowFrames = 0; this.resize(); }
  }

  /** Marks the start/continuation of an interaction; a full-quality frame follows when it ends. */
  touchInteraction(holdMs = 180) {
    this.interacting = true;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { this.interacting = false; this.requestRender(); this.options.onCamera?.(this.cameraState()); }, holdMs);
    this.requestRender();
  }

  /** Grid step for the current zoom (also used by grid snapping). */
  updateGrid() {
    const perPx = this.pixelSizeAt(this.target);
    const steps = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    const minimum = this.settings().gridSize || 0;
    // The smallest round cell at least ~18 px wide (and never finer than the grid size set in Settings when it is coarser).
    const step = Math.max(minimum && minimum > 0.05 ? 0 : 0, steps.find((s) => s / perPx >= 18) ?? steps.at(-1));
    this.gridStep = step;
    const u = this.grid.material.uniforms;
    if (u.size.value !== step) u.size.value = step;
    const reach = this.isOrtho ? (this.ortho.top - this.ortho.bottom) * 3 : this.camera.position.distanceTo(this.target) * 6;
    u.fade.value = Math.max(20, reach);
    // The plane follows the camera so it never ends inside the view.
    this.grid.position.x = Math.round(this.camera.position.x / (step * 5)) * step * 5;
    this.grid.position.z = Math.round(this.camera.position.z / (step * 5)) * step * 5;
    const extent = Math.max(1000, reach * 4);
    if (this.grid.scale.x * 1000 < extent) this.grid.scale.setScalar(extent / 1000);
  }

  // ───────────────────────── cameras and views

  get isOrtho() { return this.camera === this.ortho; }

  cameraState() {
    return { position: this.camera.position.toArray(), target: this.target.toArray(), up: this.camera.up.toArray(), fov: this.perspective.fov, ortho: this.isOrtho, orthoHalfHeight: this.orthoHalfHeight ?? null };
  }

  setCameraState(state, { animate = false } = {}) {
    if (!state) return;
    const position = new THREE.Vector3().fromArray(state.position);
    const target = new THREE.Vector3().fromArray(state.target);
    if (state.orthoHalfHeight) this.orthoHalfHeight = state.orthoHalfHeight;
    this.setProjection(Boolean(state.ortho), { keepView: false });
    const up = Array.isArray(state.up) && state.up.length === 3 ? new THREE.Vector3().fromArray(state.up) : new THREE.Vector3(0, 1, 0);
    // Older states (and every 3D view) are upright; only a saved top view keeps its own up.
    if (!state.ortho || Math.abs(up.y) > 0.5) up.set(0, 1, 0);
    this.camera.up.copy(up);
    if (animate) this.animateTo(position, target, up);
    else { this.camera.position.copy(position); this.target.copy(target); this.syncCameras(); }
  }

  /** Perspective ↔ parallel projection keeping what is seen at the target the same size. */
  setProjection(ortho, { keepView = true } = {}) {
    if (ortho === this.isOrtho) return;
    const from = this.camera;
    const dist = from.position.distanceTo(this.target);
    if (ortho) {
      if (keepView) this.orthoHalfHeight = dist * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2));
      this.ortho.position.copy(from.position);
      this.ortho.up.copy(from.up);
      this.camera = this.ortho;
    } else {
      if (keepView && this.orthoHalfHeight) {
        const want = this.orthoHalfHeight / Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2));
        const dir = from.position.clone().sub(this.target).normalize();
        this.perspective.position.copy(this.target).addScaledVector(dir, want);
      } else this.perspective.position.copy(from.position);
      this.perspective.up.copy(from.up);
      this.camera = this.perspective;
    }
    this.updateProjection();
    this.syncCameras();
  }

  syncCameras() {
    const cam = this.camera;
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
    if (this.isOrtho) {
      // Keep the near plane behind everything in parallel views.
      cam.near = -1000; cam.far = 3000;
      cam.updateProjectionMatrix();
    } else {
      const d = cam.position.distanceTo(this.target);
      cam.near = Math.max(0.01, Math.min(0.1, d / 500));
      cam.far = Math.max(500, d * 50);
      cam.updateProjectionMatrix();
    }
    this.requestRender();
  }

  /** Standard views (SketchUp Camera › Standard Views): top, front, … and iso. */
  setView(name, { animate = true, box = null } = {}) {
    const b = box ?? this.contentBox();
    const center = b.isEmpty() ? new THREE.Vector3(0, 0, 0) : b.getCenter(new THREE.Vector3());
    const radius = b.isEmpty() ? 6 : Math.max(1.5, b.getSize(new THREE.Vector3()).length() / 2);
    const dirs = {
      iso: new THREE.Vector3(1, 0.85, 1.15), top: new THREE.Vector3(0, 1, 0.0001), bottom: new THREE.Vector3(0, -1, 0.0001),
      front: new THREE.Vector3(0, 0.0001, 1), back: new THREE.Vector3(0, 0.0001, -1), left: new THREE.Vector3(-1, 0.0001, 0), right: new THREE.Vector3(1, 0.0001, 0),
    };
    const dir = (dirs[name] ?? dirs.iso).clone().normalize();
    const fov = THREE.MathUtils.degToRad(this.perspective.fov);
    const dist = radius / Math.sin(fov / 2) * 1.05;
    const up = name === 'top' ? new THREE.Vector3(0, 0, -1) : name === 'bottom' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    if (this.isOrtho) this.orthoHalfHeight = radius * 1.1;
    this.camera.up.copy(up);
    const position = center.clone().addScaledVector(dir, dist);
    if (animate) this.animateTo(position, center, up); else { this.camera.position.copy(position); this.target.copy(center); this.syncCameras(); }
    this.updateProjection();
  }

  /** Zoom Extents: everything (or a box) fills the view, keeping the current direction. */
  zoomExtents(box = null) {
    const b = box ?? this.contentBox();
    if (b.isEmpty()) return this.setView('iso');
    const center = b.getCenter(new THREE.Vector3());
    const radius = Math.max(0.3, b.getSize(new THREE.Vector3()).length() / 2);
    const dir = this.camera.position.clone().sub(this.target).normalize();
    const fov = THREE.MathUtils.degToRad(this.perspective.fov);
    const dist = radius / Math.sin(Math.min(fov, fov * this.width / this.height) / 2) * 1.02;
    if (this.isOrtho) { this.orthoHalfHeight = radius * Math.max(1, this.height / this.width) * 1.05; this.updateProjection(); }
    this.animateTo(center.clone().addScaledVector(dir, dist), center);
    return undefined;
  }

  animateTo(position, target, up = null, duration = 320) {
    this.animation = {
      start: performance.now(), duration,
      fromPos: this.camera.position.clone(), toPos: position.clone(),
      fromTarget: this.target.clone(), toTarget: target.clone(),
      fromUp: this.camera.up.clone(), toUp: (up ?? this.camera.up).clone(),
    };
    this.requestRender();
  }

  stepAnimation(now) {
    const a = this.animation;
    const k = Math.min(1, (now - a.start) / a.duration);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    this.camera.position.lerpVectors(a.fromPos, a.toPos, e);
    this.target.lerpVectors(a.fromTarget, a.toTarget, e);
    this.camera.up.lerpVectors(a.fromUp, a.toUp, e).normalize();
    this.syncCameras();
    if (k >= 1) { this.animation = null; this.requestRender(); this.options.onCamera?.(this.cameraState()); }
  }

  // ───────────────────────── navigation (SketchUp style)
  //   middle drag: orbit · Shift+middle: pan · wheel: zoom at the cursor · double middle click: centre
  //   the Orbit / Pan / Zoom tools do the same with the left button.

  bindNavigation() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => { if (this.navDrag?.moved) e.preventDefault(); });
    // Pressing the wheel would start Chromium's auto-scroll (a round cursor) instead of orbiting.
    c.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    c.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    c.addEventListener('pointerdown', (e) => {
      const tool = this.navTool;
      const middle = e.button === 1;
      // Right-button drag orbits too (Shift: pans) — for mice and touchpads without a middle button.
      // A right click without moving still opens the context menu.
      const right = e.button === 2;
      const leftNav = e.button === 0 && (tool === 'orbit' || tool === 'pan' || tool === 'zoom');
      if (!middle && !right && !leftNav) return;
      if (!right) e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      let mode = middle || right ? (e.shiftKey ? 'pan' : 'orbit') : tool;
      if (this.planMode && mode === 'orbit') mode = 'pan';
      const pivot = this.pickPoint(e.clientX, e.clientY) ?? this.target.clone();
      this.navDrag = { mode, x: e.clientX, y: e.clientY, pivot, moved: false, id: e.pointerId };
      if (middle && e.detail === 2) { this.centerOn(pivot); this.navDrag = null; }
    });
    c.addEventListener('pointermove', (e) => {
      const d = this.navDrag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x; const dy = e.clientY - d.y;
      if (!dx && !dy) return;
      // The right button starts navigating only after a few pixels (a plain right click is the context menu).
      if (!d.moved && e.buttons === 2 && Math.hypot(dx, dy) < 4) return;
      d.x = e.clientX; d.y = e.clientY; d.moved = true;
      if (d.mode === 'orbit') this.orbit(dx, dy, d.pivot);
      else if (d.mode === 'pan') this.pan(dx, dy, d.pivot);
      else if (d.mode === 'zoom') this.dolly(Math.pow(1.01, dy), d.pivot);
      this.touchInteraction();
      this.options.onNavigate?.();
    });
    const end = (e) => { if (this.navDrag && this.navDrag.id === e.pointerId) { try { c.releasePointerCapture?.(e.pointerId); } catch { /* not captured */ } setTimeout(() => { this.navDrag = null; }, 0); } };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      if (e.ctrlKey && !this.isOrtho && Math.abs(e.deltaY) < 50 && e.deltaMode === 0 && !Number.isInteger(e.deltaY)) {
        // pinch-zoom on touchpads arrives as ctrl+wheel with fractional deltas
      }
      e.preventDefault();
      const s = this.settings();
      const speed = (s.zoomSpeed ?? 100) / 100;
      const delta = (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * (s.invertZoom ? -1 : 1);
      const factor = Math.pow(1.0015, delta * speed);
      const pivot = this.pickPoint(e.clientX, e.clientY, { groundFallback: true }) ?? this.target.clone();
      this.dolly(factor, pivot, e.clientX, e.clientY);
      this.touchInteraction(220);
      this.options.onNavigate?.();
    }, { passive: false });
  }

  orbit(dx, dy, pivot) {
    const speed = ((this.settings().orbitSpeed ?? 100) / 100) * 0.0055;
    const cam = this.camera;
    const yaw = -dx * speed;
    const pitch = -dy * speed;
    const offset = cam.position.clone().sub(pivot);
    const targetOffset = this.target.clone().sub(pivot);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    // Keep the camera from flipping over the pole.
    const forward = this.target.clone().sub(cam.position).normalize();
    const elevation = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
    const limited = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.02 + elevation, Math.PI / 2 - 0.02 + elevation);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, limited);
    const q = qYaw.multiply(qPitch);
    offset.applyQuaternion(q);
    targetOffset.applyQuaternion(q);
    cam.position.copy(pivot).add(offset);
    this.target.copy(pivot).add(targetOffset);
    cam.up.set(0, 1, 0);
    this.syncCameras();
  }

  pan(dx, dy, pivot) {
    const cam = this.camera;
    let perPixel;
    if (this.isOrtho) perPixel = (this.ortho.top - this.ortho.bottom) / this.height;
    else {
      const depth = pivot.clone().sub(cam.position).dot(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate());
      perPixel = (2 * Math.max(0.05, depth) * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2))) / this.height;
    }
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const move = right.multiplyScalar(-dx * perPixel).add(up.multiplyScalar(dy * perPixel));
    cam.position.add(move);
    this.target.add(move);
    this.syncCameras();
  }

  /** Zoom by `factor` (>1 = out) towards `pivot`. */
  dolly(factor, pivot, clientX = null, clientY = null) {
    const cam = this.camera;
    if (this.isOrtho) {
      const before = clientX != null ? this.screenToWorldOnPlane(clientX, clientY, pivot) : null;
      this.orthoHalfHeight = THREE.MathUtils.clamp((this.orthoHalfHeight ?? 5) * factor, 0.02, 2000);
      this.updateProjection();
      cam.updateMatrixWorld();
      if (before) {
        const after = this.screenToWorldOnPlane(clientX, clientY, pivot);
        const shift = before.sub(after);
        cam.position.add(shift);
        this.target.add(shift);
      }
      this.syncCameras();
      return;
    }
    const toCam = cam.position.clone().sub(pivot);
    const dist = toCam.length();
    const newDist = THREE.MathUtils.clamp(dist * factor, 0.05, 5000);
    cam.position.copy(pivot).addScaledVector(toCam.normalize(), newDist);
    const toTarget = this.target.clone().sub(pivot).multiplyScalar(newDist / Math.max(dist, 1e-6));
    this.target.copy(pivot).add(toTarget);
    // A target that ends up behind the camera after zooming in a lot: put it in front again.
    const forward = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate();
    if (this.target.clone().sub(cam.position).dot(forward) < 0.05) this.target.copy(cam.position).addScaledVector(forward, 1);
    this.syncCameras();
  }

  centerOn(point) {
    const shift = point.clone().sub(this.target);
    this.animateTo(this.camera.position.clone().add(shift), point);
  }

  // ───────────────────────── walk (first person: W A S D / arrows, mouse look with the left button)

  startWalk(eyeHeight = 1.6) {
    this.setProjection(false);
    const pos = this.camera.position.clone();
    pos.y = (this.walkFloor ?? 0) + eyeHeight;
    const dir = this.target.clone().sub(this.camera.position).setY(0).normalize();
    if (!dir.lengthSq()) dir.set(0, 0, -1);
    this.camera.position.copy(pos);
    this.target.copy(pos).addScaledVector(dir, 2);
    this.camera.up.set(0, 1, 0);
    this.syncCameras();
    this.walk = { active: true, keys: new Set(), last: performance.now(), eyeHeight };
  }

  stopWalk() { if (this.walk) this.walk.active = false; this.walk = null; }

  walkKey(key, down) {
    if (!this.walk) return false;
    const k = key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 'shift'].includes(k)) return false;
    if (down) this.walk.keys.add(k); else this.walk.keys.delete(k);
    this.requestRender();
    return true;
  }

  walkLook(dx, dy) {
    const speed = 0.004;
    const cam = this.camera;
    const dir = this.target.clone().sub(cam.position);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * speed);
    dir.applyQuaternion(q);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const pitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * speed);
    const tilted = dir.clone().applyQuaternion(pitch);
    if (Math.abs(tilted.clone().normalize().y) < 0.97) dir.copy(tilted);
    this.target.copy(cam.position).add(dir);
    this.syncCameras();
    this.touchInteraction();
  }

  stepWalk(now) {
    const w = this.walk;
    const dt = Math.min(0.1, (now - w.last) / 1000);
    w.last = now;
    if (!w.keys.size) return;
    const speed = (w.keys.has('shift') ? 3.2 : 1.4) * dt;
    const cam = this.camera;
    const fwd = this.target.clone().sub(cam.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    if (w.keys.has('w') || w.keys.has('arrowup')) move.add(fwd);
    if (w.keys.has('s') || w.keys.has('arrowdown')) move.sub(fwd);
    if (w.keys.has('d')) move.add(right);
    if (w.keys.has('a')) move.sub(right);
    if (w.keys.has('arrowleft')) { this.walkLook(-260 * dt, 0); }
    if (w.keys.has('arrowright')) { this.walkLook(260 * dt, 0); }
    if (w.keys.has('e')) move.y += 1;
    if (w.keys.has('q')) move.y -= 1;
    if (move.lengthSq()) {
      move.normalize().multiplyScalar(speed);
      // Collision: stop in front of walls and furniture (BVH ray along the move).
      const ray = new THREE.Raycaster(cam.position.clone(), move.clone().setY(0).normalize(), 0, 0.35 + speed);
      ray.firstHitOnly = true;
      const hits = move.x || move.z ? ray.intersectObjects(this.content.children, true).filter((h) => h.object.visible && !h.object.userData.helper) : [];
      if (!hits.length) { cam.position.add(move); this.target.add(move); }
      this.syncCameras();
    }
    this.touchInteraction();
  }

  // ───────────────────────── picking

  ray(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    raycaster.firstHitOnly = true;
    raycaster.params.Line.threshold = this.pixelSizeAt(this.target) * 4;
    return raycaster;
  }

  /** The first visible content surface under the cursor: { object, entity (userData.entityId walk-up), point, normal, faceIndex, distance }. */
  pick(clientX, clientY, { filter = null, includeLines = false } = {}) {
    const raycaster = this.ray(clientX, clientY);
    const hits = raycaster.intersectObjects(this.content.children, true);
    for (const hit of hits) {
      const o = hit.object;
      if (!o.visible || o.userData.helper || o.userData.noPick) continue;
      if (!includeLines && (o.isLine || o.isLineSegments || o.isPoints)) continue;
      if (!visibleUp(o)) continue;
      if (this.clipPlanes.length && this.clipPlanes.some((p) => p.distanceToPoint(hit.point) < -1e-4)) continue;
      const entity = entityOf(o);
      if (filter && !filter(entity, o, hit)) continue;
      const normal = hit.face ? hit.face.normal.clone().transformDirection(o.matrixWorld) : null;
      return { object: o, entity, point: hit.point.clone(), normal, faceIndex: hit.faceIndex, distance: hit.distance, instanceId: hit.instanceId };
    }
    return null;
  }

  /** A world point under the cursor: content, else the ground plane (y = level elevation). */
  pickPoint(clientX, clientY, { groundFallback = true } = {}) {
    const hit = this.pick(clientX, clientY);
    if (hit) return hit.point;
    if (!groundFallback) return null;
    return this.screenToWorldOnPlane(clientX, clientY, new THREE.Vector3(0, this.groundY ?? 0, 0), new THREE.Vector3(0, 1, 0));
  }

  /** The cursor projected onto a plane through `point` (default normal: facing the camera, or the ground). */
  screenToWorldOnPlane(clientX, clientY, point, normal = null) {
    const raycaster = this.ray(clientX, clientY);
    const n = normal ?? new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, point);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  worldToScreen(point) {
    const r = this.canvas.getBoundingClientRect();
    const v = point.clone().project(this.camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, behind: v.z > 1 };
  }

  /** World size of one screen pixel at `point` (for tolerances and handle sizes). */
  pixelSizeAt(point) {
    if (this.isOrtho) return (this.ortho.top - this.ortho.bottom) / Math.max(1, this.height);
    const forward = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2).negate();
    const depth = Math.max(0.01, point.clone().sub(this.camera.position).dot(forward));
    return (2 * depth * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2))) / Math.max(1, this.height);
  }

  // ───────────────────────── display style, clipping, selection boxes

  /** SketchUp face styles: textured, shaded (colours only), white, X-ray, wireframe, hidden line. */
  setStyle(mode, { edges = true } = {}) {
    this.styleMode = STYLE_MODES.includes(mode) ? mode : 'textured';
    this.showEdges = edges;
    this.applyStyle(this.content);
    this.requestRender();
  }

  /** Applies the style to a subtree (also called by the builder for newly built objects). */
  applyStyle(root) {
    const mode = this.styleMode;
    root.traverse((o) => {
      if (o.userData.helper) return;
      if (o.isMesh) {
        if (!o.userData.baseMaterial) o.userData.baseMaterial = o.material;
        o.material = styledMaterial(o.userData.baseMaterial, mode);
        o.visible = mode !== 'wireframe' || Boolean(o.userData.alwaysVisible);
      } else if (o.isLineSegments && o.userData.edges) {
        o.visible = (this.showEdges !== false || mode === 'wireframe' || mode === 'hiddenline') && !o.userData.hiddenEdge;
      }
    });
  }

  setClipPlanes(planes) { this.clipPlanes = planes; this.requestRender(); }

  /** Plan view: parallel top camera, everything above the cut height clipped (a floor plan). */
  setPlanMode(on, { elevation = 0, cutHeight = 1.2 } = {}) {
    this.planMode = on;
    if (on) {
      this.savedCamera = this.cameraState();
      this.setProjection(true);
      this.setView('top', { animate: false });
      this.planClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), elevation + cutHeight);
      this.setClipPlanes([this.planClip, ...(this.sectionPlanes ?? [])]);
    } else {
      this.planClip = null;
      this.setClipPlanes([...(this.sectionPlanes ?? [])]);
      if (this.savedCamera) this.setCameraState(this.savedCamera);
    }
    this.requestRender();
  }

  setSectionPlanes(planes) {
    this.sectionPlanes = planes;
    this.setClipPlanes([...(this.planClip ? [this.planClip] : []), ...planes]);
  }

  /** Blue boxes around selected objects (SketchUp's selection look); one LineSegments for all. */
  setSelectionBoxes(boxes, { color = '#1f6feb', hover = null } = {}) {
    for (const child of [...this.selectionHelpers.children]) { child.geometry.dispose(); this.selectionHelpers.remove(child); }
    const make = (list, c, opacity) => {
      if (!list.length) return;
      const pts = [];
      for (const b of list) {
        const corners = boxCorners(b);
        for (const [i, j] of BOX_EDGES) pts.push(corners[i], corners[j]);
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity, depthTest: false }));
      line.renderOrder = 10;
      this.selectionHelpers.add(line);
    };
    make(boxes, color, 0.95);
    if (hover) make([hover], '#f0a020', 0.8);
    this.requestRender();
  }

  // ───────────────────────── images

  /**
   * Renders the current view at width × height (independent of the window) at final quality and returns a canvas.
   * Large sizes are drawn in one pass; the caller shows progress for the encoding step.
   */
  capture(width, height, { transparent = false } = {}) {
    const savedW = this.width; const savedH = this.height;
    const savedRatio = this.renderer.getPixelRatio();
    const savedScale = this.resolutionScale;
    const helpersVisible = this.helpers.visible;
    this.resolutionScale = 1;
    this.selectionHelpers.visible = false;
    this.grid.visible = false;
    this.axes.visible = false;
    if (transparent) this.sky.visible = false;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
    this.width = width; this.height = height;
    this.updateProjection();
    this.interacting = false;
    this.shadowsDirty = true;
    this.renderFrame();
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    out.getContext('2d').drawImage(this.canvas, 0, 0, width, height);
    this.renderer.setPixelRatio(savedRatio);
    this.selectionHelpers.visible = true;
    this.helpers.visible = helpersVisible;
    this.sky.visible = true;
    this.resolutionScale = savedScale;
    this.width = savedW; this.height = savedH;
    this.applySettings();
    this.resize();
    return out;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.composer.dispose?.();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

// ───────────────────────── helpers

export function entityOf(object) {
  let o = object;
  while (o) {
    if (o.userData.entityId) return { id: o.userData.entityId, kind: o.userData.entityKind, object: o };
    o = o.parent;
  }
  return null;
}

function visibleUp(object) {
  let o = object;
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}

const BOX_EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function boxCorners(b) {
  if (b.corners) return b.corners; // oriented boxes: 8 points already in world space
  const { min, max } = b;
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z));
}

/** Per-material clones for the face styles, cached on the base material (created once per style). */
const WHITE = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.9 });
const HIDDEN = new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
function styledMaterial(base, mode) {
  if (mode === 'textured' || !base) return base;
  if (Array.isArray(base)) return base.map((m) => styledMaterial(m, mode));
  if (base.userData.keepStyle) return base;
  if (mode === 'white') return WHITE;
  if (mode === 'hiddenline' || mode === 'wireframe') return HIDDEN;
  base.userData.styled ??= {};
  if (base.userData.styled[mode]) return base.userData.styled[mode];
  const m = base.clone();
  if (mode === 'shaded') { m.map = null; m.normalMap = null; m.roughnessMap = null; m.aoMap = null; }
  if (mode === 'xray') { m.transparent = true; m.opacity = 0.45; m.depthWrite = false; m.transmission = 0; }
  base.userData.styled[mode] = m;
  return m;
}

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
//   "Slow" includes GPU time (timer query, GpuTimer below): on a GPU-bound laptop the CPU side of a frame
//   looks cheap. The same measure decides whether ambient occlusion stays on while moving; when it was left
//   out, it fades back in (AO_FADE_MS) instead of popping.
// - The fps cap keeps ~half a display frame of tolerance (75/90 Hz screens are not halved); glides are
//   scaled by the real frame step, so they feel the same at 60, 120 or 144 Hz.
// - Per-frame helpers (marker scaling, grid) use scratch vectors, no allocations.
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
/** Ambient occlusion strength, and how long it takes to fade in when it was left out while moving (ms). */
const AO_BLEND = 0.85;
const AO_FADE_MS = 160;
/** While furniture is dragged, its shadows follow at most this often (ms). */
const SHADOW_DRAG_MS = 90;

/**
 * Daylight balance. The sun is the key light (it makes the shadows, also inside rooms); the sky light
 * (hemisphere) and the environment's reflections only fill them. With a stronger fill the sun hardly
 * changed the picture (switching it off looked the same) and indoor shadows were washed out.
 */
const SUN_STRENGTH = 4.6;
const AMBIENT = 0.45;

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
    this.gpuTimer = GpuTimer.create(renderer.getContext(), (ms, tag) => this.gpuResult(ms, tag));

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
    // Lamp markers: a bulb per lamp, drawn on top (not clipped by the plan cut), picked before the scene.
    this.lampMarkers = new THREE.Group();
    this.lampMarkers.name = 'lampMarkers';
    this.overlay.add(this.lampMarkers);
    // The sun: a marker on a sphere around the model (drag it to move the light), with a line to the centre.
    this.sunMarker = new THREE.Group();
    this.sunMarker.name = 'sunMarker';
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(true), depthTest: false, depthWrite: false, transparent: true }));
    this.sunSprite.renderOrder = 21;
    this.sunSprite.userData = { sunMarker: true };
    this.sunLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineDashedMaterial({ color: '#f59f00', dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.7, depthTest: false }));
    this.sunLine.renderOrder = 20;
    this.sunMarker.add(this.sunLine, this.sunSprite);
    this.sunMarker.visible = false;
    this.overlay.add(this.sunMarker);
    // The orbit centre (SketchUp): shown while the view turns around the point that was pressed.
    this.pivotMarker = pivotCube();
    this.pivotMarker.visible = false;
    this.overlay.add(this.pivotMarker);
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
      // The 2D plan draws the negative half solid too (a plan's axes are plain lines through the origin).
      const back = new THREE.Line(dashed.geometry, solid.material);
      back.visible = false;
      dashed.userData.axisDashed = true;
      back.userData.axisPlanSolid = true;
      this.axes.add(solid, dashed, back);
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
    this.aoPass.blendIntensity = AO_BLEND;
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

  /** Fill light from lit lamps (their light bounced off the room), added to the sky light. */
  setLampFill(value) {
    this.lampFill = value;
    this.hemi.intensity = (this.hemiBase ?? this.hemi.intensity) + value;
    this.requestRender();
  }

  setGridColor(color) {
    this.grid.material.uniforms.color.value.set(color);
    this.requestRender();
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
    this.envBase = intensity;
    this.scene.environmentIntensity = intensity * AMBIENT * (this.dayFactor ?? 1);
    this.scene.background = background;
    this.sky.visible = !background;
    this.requestRender();
  }

  /** Sun from the project's date, time and place; below the horizon only the sky light remains. */
  setSun(sun, { enabled = true } = {}) {
    const d = sunDirection(sun);
    const up = Math.max(0, d.y);
    const on = enabled && sun.on !== false;
    const strength = on ? Math.min(1, Math.max(0, d.altitude / 2)) : 0;
    this.sun.intensity = SUN_STRENGTH * strength * (Number.isFinite(sun.intensity) ? sun.intensity : 1);
    if (sun.color) this.sun.color.set(sun.color);
    else this.sun.color.setHSL(0.09, 0.6, 0.6 + 0.35 * Math.min(1, up * 2));
    this.sunDir = new THREE.Vector3(d.x, Math.max(0.02, d.y), d.z).normalize();
    // Day ↔ night: below the horizon the sky light and reflections fade (twilight over about ±6°).
    this.night = d.altitude < 0;
    this.dayFactor = 0.12 + 0.88 * Math.min(1, Math.max(0, (d.altitude + 3) / 3));
    this.scene.environmentIntensity = (this.envBase ?? 0.55) * AMBIENT * this.dayFactor;
    this.sunState = { on, altitude: d.altitude, dir: new THREE.Vector3(d.x, d.y, d.z).normalize(), center: Array.isArray(sun.center) ? new THREE.Vector3().fromArray(sun.center) : null, distance: Number.isFinite(sun.distance) && sun.distance > 0 ? sun.distance : null };
    this.updateSunMarker();
    this.fitShadowCamera();
    this.hemiBase = (0.1 + 0.1 * strength) * this.dayFactor;
    this.hemi.intensity = this.hemiBase + (this.lampFill ?? 0);
    this.invalidateShadows();
  }

  /** Shadow camera around the content (tight bounds = sharp shadows). The box is cached: day/night and the sun
   *  marker only move the light, they do not walk every mesh again. */
  fitShadowCamera() {
    const box = this.contentBounds();
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

  contentBounds() {
    if (this._contentBox && !this.boundsStale) return this._contentBox;
    this._contentBox = this.contentBox();
    this.boundsStale = false;
    return this._contentBox;
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

  /** Anything that changes the picture (camera, content, clipping) asks for a frame; `stamp` also retires picking answers. */
  requestRender() { this.dirty = true; this.stamp = (this.stamp ?? 0) + 1; }
  invalidateShadows() { this.shadowsDirty = true; this.requestRender(); }
  /** The content changed: fresh shadows and bounds. */
  contentChanged() { this.glassStale = true; this.boundsStale = true; this.fitShadowCamera(); this.invalidateShadows(); this.updateSunMarker(); }

  /**
   * Objects moved (dragging): fresh shadows, but the shadow camera stays put so shadows don't shimmer. While the
   * button is held they are redrawn at most every SHADOW_DRAG_MS (sun and lamp maps are several extra passes).
   */
  contentMoved() { this.shadowsMoved = true; this.requestRender(); }

  resize() {
    this.rect = null;
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
    // The display's frame interval (the shortest recent rAF step; it creeps up slowly after a change of screen).
    const tick = this.lastTick ? now - this.lastTick : 0;
    this.lastTick = now;
    if (tick > 2 && tick < 100) this.vsync = this.vsync ? Math.min(tick, this.vsync + 0.05) : tick;
    this.tickScale = tick > 0 ? Math.min(4, tick / 16.667) : 1;
    this.rect = null;
    this.flushNavigation();
    if (this.animation) this.stepAnimation(now);
    if (this.walk?.active) this.stepWalk(now);
    if (this.tour && !this.animation) this.tour.step(now);
    this.stepGlide();
    if (!this.dirty) { this.renderedLastTick = false; return; }
    const s = this.settings();
    const minInterval = s.maxFps ? 1000 / s.maxFps : 0;
    // Frame cap with ~half a display frame of tolerance: 60 fps on 120 Hz, while 75 or 90 Hz screens are not cut to
    // every second frame (37/45 fps) — the old "interval − 1 ms" test did that whenever the rates did not divide.
    if (minInterval && this.lastFrame && now - this.lastFrame < minInterval - (this.vsync ?? 16.667) * 0.6) return;
    this.dirty = false;
    // Interval to the previous frame when this one followed it directly (a real measure of a slow GPU when no timer query exists).
    this.frameInterval = this.renderedLastTick && this.lastFrame ? now - this.lastFrame : 0;
    this.renderFrame(now);
    this.renderedLastTick = true;
  }

  renderFrame(now = performance.now()) {
    const t0 = performance.now();
    this.gpuTimer?.poll();
    this.renderer.info.reset();
    const final = !this.interacting && !this.animation;
    this.renderPass.camera = this.camera;
    this.aoPass.camera = this.camera;
    // Ambient occlusion stays on while moving when the last full frame was cheap (CPU and GPU time), so nothing
    // pops on and off; on a slow GPU it is left out while moving and fades back in when the view stops.
    const aoAllowed = this.aoEnabled && this.styleMode !== 'wireframe';
    const ao = aoAllowed && (final || this.finalCost() < 12);
    if (ao && !this.aoShown && final && this.lastFrame) this.aoFade = performance.now();
    if (!ao) this.aoFade = null;
    let fade = 1;
    if (this.aoFade != null) {
      const k = Math.min(1, (performance.now() - this.aoFade) / AO_FADE_MS);
      fade = k * k * (3 - 2 * k);
      if (k < 1) this.dirty = true; else this.aoFade = null;
    }
    // Glass with transmission makes three.js draw the scene a second time. Only the 2D plan uses the plain
    // stand-in (glass is edge-on from above). In 3D the real glass stays while the view turns or moves, so the
    // sky and the environment keep showing through the windows.
    this.setFastGlass(this.planMode);
    this.aoPass.enabled = ao;
    this.aoPass.blendIntensity = AO_BLEND * fade;
    this.aoShown = ao;
    this.gpuTimer?.begin({ final: final && fade === 1, ao });
    this.renderer.clippingPlanes = this.clipPlanes;
    // Shadow maps (sun and lamps) are redrawn only when something changed.
    if (this.shadowsMoved && (!this.pointerDown || t0 - (this.shadowsAt ?? 0) > SHADOW_DRAG_MS)) this.shadowsDirty = true;
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
      this.shadowsMoved = false;
      this.shadowsAt = t0;
    }
    this.updateGrid();
    this.options.beforeRender?.(this);
    this.composer.render();
    const sceneInfo = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
    // Overlay (tool previews, inference, selection boxes) on top, without the scene's depth.
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.clippingPlanes = [];
    this.updateLampMarkerScale();
    this.renderer.render(this.overlay, this.camera);
    this.renderer.autoClear = true;
    this.gpuTimer?.end();
    const ms = performance.now() - t0;
    if (final && fade === 1) this.lastFinalMs = ms;
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
    // CPU time alone says nothing on a GPU-bound machine (the GPU works after the call returns): the frame's
    // GPU time (timer query, a frame or two late) or, without one, the interval between back-to-back frames.
    const cost = Math.max(ms, this.interacting ? (this.gpuTimer ? this.gpuMoveMs ?? 0 : this.frameInterval ?? 0) : 0);
    this.adaptResolution(cost);
    this.options.onStats?.(this.stats, final);
  }

  /**
   * Turns the transmission of every glass material in the scene off (fast: alpha-blended glass, no transmission
   * pass) or back on. Switching only bumps the material version; three.js keeps both shader programs, so after the
   * first time it costs no compile. The list is collected again whenever the content changed.
   */
  setFastGlass(fast) {
    if (fast === Boolean(this.glassFast) && !(fast && this.glassStale)) return;
    if (fast) {
      this.glassSaved ??= [];
      this.scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m || !(m.transmission > 0) || m.userData.fastGlass) continue;
          m.userData.fastGlass = { transmission: m.transmission, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
          m.transmission = 0;
          m.transparent = true;
          m.opacity = Math.min(m.opacity, 0.3 + 0.6 * (1 - m.userData.fastGlass.transmission));
          m.depthWrite = false;
          m.needsUpdate = true;
          this.glassSaved.push(m);
        }
      });
    } else {
      for (const m of this.glassSaved ?? []) {
        const s = m.userData.fastGlass;
        if (!s) continue;
        Object.assign(m, s);
        delete m.userData.fastGlass;
        m.needsUpdate = true;
      }
      this.glassSaved = [];
    }
    this.glassFast = fast;
    this.glassStale = false;
  }

  /** What the last full-quality frame cost (the larger of CPU and GPU time, ms). */
  finalCost() {
    return Math.max(this.lastFinalMs ?? 99, this.gpuFinalMs ?? 0);
  }

  /** GPU time of finished frames (EXT_disjoint_timer_query_webgl2), split into full-quality and moving frames. */
  gpuResult(ms, tag) {
    if (tag?.final && tag.ao) this.gpuFinalMs = ms;
    else if (!tag?.final) this.gpuMoveMs = ms;
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
  /** The user is moving the view or dragging in it (background work such as thumbnails waits). */
  isBusy() { return Boolean(this.interacting || this.navDrag || this.animation || this.walk || this.tour || this.pointerDown || performance.now() - (this.lastInteraction ?? 0) < 500); }

  touchInteraction(holdMs = 180) {
    this.interacting = true;
    this.lastInteraction = performance.now();
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { this.interacting = false; this.requestRender(); this.options.onCamera?.(this.cameraState()); }, holdMs);
    this.requestRender();
  }

  /** Grid step for the current zoom (also used by grid snapping). */
  updateGrid() {
    const perPx = this.pixelSizeAt(this.target);
    const steps = GRID_STEPS;
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
  //   (the same as the other 3D apps): left drag rotates around the point pressed (the view centre over empty space),
  //   Ctrl/Alt + left drag and right drag move (pan), middle drag and the wheel zoom (at the cursor),
  //   Shift + right drag rotates, double middle click centres there. Rotating and moving glide to a
  //   stop after the button is released; a wheel notch is spread over a few frames.
  //   The Orbit / Pan / Zoom tools do the same with the left button.

  /** One navigation step (pixels); remembers the speed so the view can glide on after release. */
  navigate(mode, dx, dy, pivot) {
    this.glide = null;
    if (this.planMode && mode === 'orbit') mode = 'pan';
    if (mode === 'orbit') { const centre = pivot ?? this.target.clone(); this.showPivot(centre); this.orbit(dx, dy, centre); }
    else if (mode === 'pan') this.pan(dx, dy, pivot ?? this.target);
    else if (mode === 'zoom') this.dolly(Math.pow(1.01, dy), pivot ?? this.target);
    const now = performance.now();
    const v = this.navVelocity;
    // Speed in pixels per frame, smoothed over the last moves.
    const k = v && now - v.t < 80 ? 0.5 : 1;
    this.navVelocity = { mode, pivot, t: now, vx: (v && k < 1 ? v.vx * (1 - k) : 0) + dx * k, vy: (v && k < 1 ? v.vy * (1 - k) : 0) + dy * k };
    this.touchInteraction();
    this.options.onNavigate?.();
  }

  /** The pointer moves of a navigation drag gathered since the last frame, as one step. */
  flushNavigation() {
    const d = this.navDrag;
    if (!d || (!d.dx && !d.dy)) return;
    const dx = d.dx; const dy = d.dy;
    d.dx = 0; d.dy = 0;
    this.navigate(d.mode, dx, dy, d.pivot);
  }

  /** The drag ended: rotating and moving glide on and slow down (as OrbitControls' damping does). */
  endNavigation() {
    const v = this.navVelocity;
    this.navVelocity = null;
    if (!v || performance.now() - v.t > 70 || (v.mode !== 'orbit' && v.mode !== 'pan') || this.settings().navInertia === false) { if (v?.mode === 'orbit') this.settleTarget(v.pivot); this.showPivot(null); return; }
    if (Math.hypot(v.vx, v.vy) < 1.5) { if (v.mode === 'orbit') this.settleTarget(v.pivot); this.showPivot(null); return; }
    this.glide = { mode: v.mode, vx: v.vx, vy: v.vy, pivot: v.pivot };
    this.requestRender();
  }

  stopGlide() { this.glide = null; this.zoomGlide = null; this.showPivot(null); }

  /** After turning around `pivot`: the view centre moves along the view axis to the pivot's depth. */
  settleTarget(pivot) {
    if (!pivot || this.isOrtho) return;
    const cam = this.camera;
    const forward = this.target.clone().sub(cam.position).normalize();
    const depth = pivot.clone().sub(cam.position).dot(forward);
    if (depth > 0.2) this.target.copy(cam.position).addScaledVector(forward, depth);
  }

  /** Orbit centre for a press at (x, y): the model point under the cursor, else the view centre. */
  orbitPivotAt(clientX, clientY) {
    return this.pickPoint(clientX, clientY, { groundFallback: false }) ?? this.target.clone();
  }

  /** Shows the orbit centre marker at `point` (null hides it). */
  showPivot(point) {
    if (!this.pivotMarker) return;
    if (point) this.pivotMarker.position.copy(point);
    if (this.pivotMarker.visible !== Boolean(point)) { this.pivotMarker.visible = Boolean(point); this.requestRender(); }
  }

  stepGlide() {
    const g = this.glide;
    if (g) {
      // OrbitControls dampingFactor 0.08 (MyArchitecture) per 60 Hz frame; on faster screens each tick moves and
      // slows by its share of that frame, so the glide lasts as long and goes as far at 60, 120 or 144 Hz.
      const ts = this.tickScale ?? 1;
      const decay = Math.pow(0.92, ts);
      g.vx *= decay; g.vy *= decay;
      if (Math.hypot(g.vx, g.vy) < 0.2) { this.glide = null; if (g.mode === 'orbit') this.settleTarget(g.pivot); this.showPivot(null); }
      else {
        if (this.planMode && g.mode === 'orbit') g.mode = 'pan';
        if (g.mode === 'orbit') this.orbit(g.vx * ts, g.vy * ts, g.pivot ?? this.target.clone()); else this.pan(g.vx * ts, g.vy * ts, g.pivot ?? this.target);
        this.touchInteraction();
        this.options.onNavigate?.();
      }
    }
    const z = this.zoomGlide;
    if (z) {
      // A quarter per 60 Hz frame (MyArchitecture), the same speed in time on faster screens.
      const part = Math.abs(z.pending) < 2 ? z.pending : z.pending * (1 - Math.pow(0.75, this.tickScale ?? 1));
      z.pending -= part;
      this.dolly(Math.pow(1.0015, part * z.speed), z.pivot, z.x, z.y);
      this.touchInteraction(220);
      this.options.onNavigate?.();
      if (Math.abs(z.pending) < 0.5) this.zoomGlide = null;
    }
  }

  bindNavigation() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => { if (this.navDrag?.moved) e.preventDefault(); });
    // Pressing the wheel would start Chromium's auto-scroll (a round cursor) instead of zooming.
    c.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    c.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    // Any press in the view (tools, selection drags) counts as busy until it is released, and stops a glide.
    c.addEventListener('pointerdown', () => { this.pointerDown = true; if (this.glide) { if (this.glide.mode === 'orbit') this.settleTarget(this.glide.pivot); this.glide = null; this.showPivot(null); } }, { capture: true });
    // Released: shadows held back during a drag are drawn now.
    window.addEventListener('pointerup', () => { this.pointerDown = false; if (this.shadowsMoved) this.requestRender(); }, { capture: true });
    window.addEventListener('pointercancel', () => { this.pointerDown = false; if (this.shadowsMoved) this.requestRender(); }, { capture: true });
    c.addEventListener('pointerdown', (e) => {
      const tool = this.navTool;
      const middle = e.button === 1;
      // A right click without moving still opens the context menu.
      const right = e.button === 2;
      const leftNav = e.button === 0 && (tool === 'orbit' || tool === 'pan' || tool === 'zoom');
      if (!middle && !right && !leftNav) return;
      if (!right) e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      let mode;
      if (middle) mode = e.shiftKey ? 'pan' : 'zoom';
      else if (right) mode = e.shiftKey ? 'orbit' : 'pan';
      else mode = tool;
      if (this.planMode && mode === 'orbit') mode = 'pan';
      const pivot = mode === 'orbit' ? this.orbitPivotAt(e.clientX, e.clientY) : this.pickPoint(e.clientX, e.clientY) ?? this.target.clone();
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
      // Applied once per frame (flushNavigation): a 500–1000 Hz mouse sends several moves per frame.
      d.dx = (d.dx ?? 0) + dx; d.dy = (d.dy ?? 0) + dy;
      this.requestRender();
    });
    const end = (e) => { if (this.navDrag && this.navDrag.id === e.pointerId) { this.flushNavigation(); try { c.releasePointerCapture?.(e.pointerId); } catch { /* not captured */ } if (this.navDrag.moved) this.endNavigation(); else this.showPivot(null); setTimeout(() => { this.navDrag = null; }, 0); } };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.glide = null;
      const s = this.settings();
      const speed = (s.zoomSpeed ?? 100) / 100;
      const delta = (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * (s.invertZoom ? -1 : 1);
      // Smooth zoom: the notch is spread over the next frames, towards the point under the cursor.
      const z = this.zoomGlide;
      const sameSpot = z && Math.hypot(z.x - e.clientX, z.y - e.clientY) < 3;
      const pivot = sameSpot ? z.pivot : this.pickPoint(e.clientX, e.clientY, { groundFallback: true }) ?? this.target.clone();
      this.zoomGlide = { pending: (sameSpot && Math.sign(z.pending) === Math.sign(delta) ? z.pending : 0) + delta, speed, pivot, x: e.clientX, y: e.clientY };
      this.touchInteraction(220);
    }, { passive: false });
  }

  orbit(dx, dy, pivot) {
    // A drag across the view's height turns a full circle (OrbitControls' rotateSpeed 1, as in MyArchitecture).
    const speed = ((this.settings().orbitSpeed ?? 100) / 100) * ((2 * Math.PI) / Math.max(200, this.height || 600));
    const cam = this.camera;
    const yaw = -dx * speed;
    const pitch = -dy * speed;
    const offset = cam.position.clone().sub(pivot);
    const targetOffset = this.target.clone().sub(pivot);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // The horizontal right vector (the camera's own may tilt when looking straight down/up).
    const forward = this.target.clone().sub(cam.position).normalize();
    const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-8) right.crossVectors(forward, camUp);
    right.setY(0);
    if (right.lengthSq() < 1e-8) right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0);
    right.normalize();
    // Rotating by +a about `right` raises the view direction by a: keep the new elevation inside
    // (−90°, 90°) so the camera never flips over the pole (that flip made the view jump and spin).
    const elevation = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
    const margin = 0.01;
    const limited = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + margin - elevation, Math.PI / 2 - margin - elevation);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, limited);
    const q = qYaw.multiply(qPitch);
    offset.applyQuaternion(q);
    targetOffset.applyQuaternion(q);
    cam.position.copy(pivot).add(offset);
    this.target.copy(pivot).add(targetOffset);
    // Looking (almost) straight down or up, world-up is degenerate for lookAt: keep the turned screen-up.
    const newForward = this.target.clone().sub(cam.position).normalize();
    if (Math.abs(newForward.y) > 0.9995) cam.up.copy(camUp.applyQuaternion(q).setY(0).normalize());
    else cam.up.set(0, 1, 0);
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
    // Close to what is under the cursor (inside a room) a proportional step would shrink to nothing and the
    // camera could never get past the wall: below DOLLY_MIN_REACH it moves as if the point were that far,
    // the view centre travelling with it (the direction stays), so zooming walks on through the building.
    if (dist < DOLLY_MIN_REACH) {
      const move = (1 - factor) * DOLLY_MIN_REACH;
      const dir = toCam.multiplyScalar(-1 / Math.max(dist, 1e-6));
      cam.position.addScaledVector(dir, move);
      this.target.addScaledVector(dir, move);
      const ahead = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate();
      if (this.target.clone().sub(cam.position).dot(ahead) < 0.05) this.target.copy(cam.position).addScaledVector(ahead, 1);
      this.syncCameras();
      return;
    }
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

  /** The canvas' place on the page, read once per frame (hover tests and labels ask many times per frame). */
  canvasRect() {
    return (this.rect ??= this.canvas.getBoundingClientRect());
  }

  ray(clientX, clientY) {
    const r = this.canvasRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    raycaster.firstHitOnly = true;
    raycaster.params.Line.threshold = this.pixelSizeAt(this.target) * 4;
    return raycaster;
  }

  /** Lamp markers (bulbs) as pickable handles: [{ id, position, on, lit }]. */
  setLampMarkers(list) {
    for (const child of [...this.lampMarkers.children]) { child.material.dispose(); this.lampMarkers.remove(child); }
    for (const m of list) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampTexture(m.lit ? 'lit' : m.on ? 'on' : 'off'), depthTest: false, depthWrite: false, transparent: true }));
      sprite.position.copy(m.position);
      sprite.renderOrder = 20;
      sprite.userData = { entityId: m.id, entityKind: 'object', lampMarker: true };
      this.lampMarkers.add(sprite);
    }
    this.lampMarkers.visible = this.settings().showLampMarkers !== false;
    this.requestRender();
  }

  /**
   * The sun marker's frame: the centre it turns around and its distance from it. Both are fixed world
   * values — the project's sun.center / sun.distance, else a default taken once from the model when the
   * project opened (resetSunAnchor) — so zooming, orbiting or models finishing loading never move it.
   */
  sunSphere() {
    if (!this.sunAnchor) {
      const box = this.contentBox();
      const c = box.isEmpty() ? new THREE.Vector3(0, this.groundY ?? 0, 0) : box.getCenter(new THREE.Vector3());
      const round = (v) => Math.round(v * 10) / 10;
      const center = new THREE.Vector3(round(c.x), round(c.y), round(c.z));
      let radius = box.isEmpty() ? 6 : Math.max(4, box.getSize(new THREE.Vector3()).length() * 0.6);
      // Once, in the view the project opens with: short enough that the marker is on screen to be grabbed.
      const dir = this.sunState?.dir;
      if (dir) {
        const cam = this.camera;
        cam.updateMatrixWorld();
        const forward = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate();
        for (let i = 0; i < 24 && radius > 1; i++) {
          const pos = center.clone().addScaledVector(dir, radius);
          const p = pos.clone().project(cam);
          if (pos.clone().sub(cam.position).dot(forward) > 0 && Math.abs(p.x) < 0.85 && Math.abs(p.y) < 0.8) break;
          radius *= 0.88;
        }
      }
      this.sunAnchor = { center, radius: Math.max(1, Math.round(radius * 2) / 2) };
    }
    const st = this.sunState;
    return { center: (st?.center ?? this.sunAnchor.center).clone(), radius: st?.distance ?? this.sunAnchor.radius };
  }

  /** A new project: the default sun centre and distance are taken again from its model. */
  resetSunAnchor() { this.sunAnchor = null; }

  /** The sun marker's world position (metres). */
  sunPosition() {
    const st = this.sunState;
    if (!st) return null;
    const { center, radius } = this.sunSphere();
    return center.addScaledVector(st.dir, radius);
  }

  updateSunMarker() {
    const st = this.sunState;
    if (!st) return;
    this.sunSprite.material.map = sunTexture(st.on && st.altitude > 0);
    this.placeSunMarker();
    this.requestRender();
  }

  /** The marker at the sun's own coordinates (centre + direction × distance): the view never moves it. */
  placeSunMarker() {
    const st = this.sunState;
    if (!st) return;
    const { center, radius } = this.sunSphere();
    const pos = center.clone().addScaledVector(st.dir, radius);
    this.sunSprite.position.copy(pos);
    this.sunLine.geometry.setFromPoints([center, pos]);
    this.sunLine.computeLineDistances();
  }

  /** Start dragging the sun: the sphere it moves on is the one the marker is on now. */
  /** Start dragging the sun from the pointer at (x, y) with the sun at `angles` ({ azimuth, altitude }, north applied by the caller). */
  beginSunDrag(x, y, angles, north = 0) {
    const { center, radius } = this.sunSphere();
    // The marker moves like an object under the cursor: on the plane through it facing the camera
    // (the ground plane in the 2D plan), keeping the offset between the press and the marker's centre.
    const at = this.sunSprite.position.clone();
    const normal = this.planMode ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2);
    const hit = this.screenToWorldOnPlane(x, y, at, normal);
    this.sunDrag = { center, radius, start: { x, y }, angles: { ...angles }, at, normal, grab: hit ? at.clone().sub(hit) : new THREE.Vector3(), north };
  }

  endSunDrag() { this.sunDrag = null; this.updateSunMarker(); }

  /**
   * Sun while dragging its marker: the marker follows the cursor on the plane through it (facing the
   * camera in 3D, the ground plane in the 2D plan); its position seen from the sun's centre gives
   * { azimuth (clockwise from north, the model's north applied), altitude (2°…89°), distance }.
   */
  sunAnglesAt(clientX, clientY, north = 0) {
    const { center } = this.sunDrag ?? this.sunSphere();
    const drag = this.sunDrag;
    if (drag?.normal) {
      // Where the marker is dropped → its direction and distance from the sun's centre.
      const hit = this.screenToWorldOnPlane(clientX, clientY, drag.at, drag.normal);
      if (!hit) return null;
      const dir = hit.add(drag.grab).sub(center);
      const distance = dir.length();
      if (distance < 0.2) return null;
      dir.divideScalar(distance);
      const azimuth = (((THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)) - north) % 360) + 360) % 360;
      const altitude = Math.max(SUN_MIN_DRAG_ALTITUDE, Math.min(89, THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)))));
      return { azimuth, altitude, distance: Math.max(1, distance) };
    }
    if (this.planMode) {
      const hit = this.ray(clientX, clientY).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -center.y), new THREE.Vector3());
      if (!hit) return null;
      const dir = hit.sub(center).setY(0);
      if (dir.lengthSq() < 1e-6) return null;
      return { azimuth: (THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)) - north + 720) % 360 };
    }
    const d = this.sunDrag;
    if (!d?.start) return null;
    const dx = clientX - d.start.x; const dy = clientY - d.start.y;
    const perPx = 0.4;
    const altitude = Math.max(-10, Math.min(89, d.angles.altitude - dy * perPx));
    const azimuth = (((d.angles.azimuth + d.azSign * dx * perPx) % 360) + 360) % 360;
    return { azimuth, altitude };
  }

  /** Markers keep a constant size on screen (22 px; the sun 30 px) in both projections. */
  updateLampMarkerScale() {
    this.lampMarkers.visible = this.settings().showLampMarkers !== false;
    // Runs every frame: no allocations (scratch vectors).
    const cam = this.camera;
    const forward = _markerForward.setFromMatrixColumn(cam.matrixWorld, 2).negate();
    const orthoPerPixel = this.isOrtho ? (this.ortho.top - this.ortho.bottom) / (this.ortho.zoom * this.height) : 0;
    const perspK = this.isOrtho ? 0 : (2 * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2))) / this.height;
    const perPixelAt = (position) => (this.isOrtho ? orthoPerPixel : Math.max(0.05, _markerDelta.subVectors(position, cam.position).dot(forward)) * perspK);
    this.sunMarker.visible = Boolean(this.sunState?.on) && this.settings().showSunMarker !== false && !this.walk && !this.tour;
    if (this.sunMarker.visible) {
      // The marker's place is fixed world coordinates (placed when the sun changes); only its size follows the zoom.
      this.sunSprite.scale.setScalar(30 * perPixelAt(this.sunSprite.position));
      // The guide from the model to the sun can be hidden on its own (the marker stays).
      this.sunLine.visible = this.settings().showSunLine !== false;
      this.sunLine.material.dashSize = 8 * perPixelAt(this.sunSprite.position);
      this.sunLine.material.gapSize = 6 * perPixelAt(this.sunSprite.position);
    }
    if (this.pivotMarker.visible) this.pivotMarker.scale.setScalar(16 * perPixelAt(this.pivotMarker.position));
    if (!this.lampMarkers.children.length) return;
    const px = 22;
    for (const m of this.lampMarkers.children) m.scale.setScalar(px * perPixelAt(m.position));
    this.occludeLampMarkers();
  }

  /**
   * Lamp markers are drawn over everything (picked before the scene), so in 3D a lamp behind a wall would
   * show through the building: a marker shows only when the first thing between the camera and it is the
   * lamp itself (or nothing). The 2D plan shows them all. Re-checked at most every 100 ms while moving.
   */
  occludeLampMarkers() {
    const now = performance.now();
    if (this.planMode || this.isOrtho) { for (const m of this.lampMarkers.children) m.visible = true; return; }
    if (now - (this.lampOcclusionAt ?? 0) < 100) { if (!this.lampOcclusionPending) { this.lampOcclusionPending = true; setTimeout(() => { this.lampOcclusionPending = false; this.lampOcclusionAt = 0; this.requestRender(); }, 110); } return; }
    this.lampOcclusionAt = now;
    const ray = (this.lampRay ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true }));
    const cam = this.camera.position;
    for (const m of this.lampMarkers.children) {
      _markerDelta.subVectors(m.position, cam);
      const far = _markerDelta.length();
      if (far < 1e-3) { m.visible = true; continue; }
      ray.set(cam, _markerDelta.divideScalar(far));
      ray.far = far;
      // Raycasts ignore visibility: hidden levels, tags and lines do not hide a lamp.
      const hit = ray.intersectObject(this.content, true).find((h) => !h.object.isLine && !h.object.isLineSegments && !h.object.isPoints && visibleUp(h.object));
      const id = hit ? entityOf(hit.object)?.id : null;
      m.visible = !hit || id === m.userData.entityId || hit.distance > far - 0.02;
    }
  }

  /** The lamp marker (or the sun) under the cursor, as a pick result. */
  pickLampMarker(raycaster, filter) {
    this.updateLampMarkerScale();
    raycaster.camera = this.camera;
    if (this.sunMarker.visible) {
      const hit = raycaster.intersectObject(this.sunSprite, false)[0];
      if (hit) return { object: this.sunSprite, entity: { id: '__sun', kind: 'sun', object: this.sunSprite }, point: this.sunSprite.position.clone(), normal: null, faceIndex: null, distance: hit.distance, sun: true };
    }
    if (!this.lampMarkers.visible || !this.lampMarkers.children.length) return null;
    for (const hit of raycaster.intersectObjects(this.lampMarkers.children, false)) {
      const o = hit.object;
      if (!o.visible) continue; // behind the model (occludeLampMarkers)
      const entity = { id: o.userData.entityId, kind: 'object', object: o, lamp: true };
      if (filter && !filter(entity, o, hit)) continue;
      return { object: o, entity, point: o.position.clone(), normal: new THREE.Vector3(0, 1, 0), faceIndex: null, distance: hit.distance, lamp: true };
    }
    return null;
  }

  /** The first visible content surface under the cursor: { object, entity (userData.entityId walk-up), point, normal, faceIndex, distance }. */
  pick(clientX, clientY, { filter = null, includeLines = false, lamps = false } = {}) {
    const raycaster = this.ray(clientX, clientY);
    const lamp = lamps ? this.pickLampMarker(raycaster, filter) : null;
    if (lamp) return lamp;
    // The same spot with nothing changed since (hover, then the status bar's pointer, in one move): the last answer.
    const memo = this.pickMemo;
    const key = filter ? null : `${clientX},${clientY},${includeLines}`;
    if (key && memo?.key === key && memo.stamp === this.stamp) return memo.hit && { ...memo.hit, point: memo.hit.point.clone(), normal: memo.hit.normal?.clone() ?? null };
    const hit = this.castContent(raycaster, filter, includeLines);
    if (key) this.pickMemo = { key, stamp: this.stamp, hit: hit && { ...hit, point: hit.point.clone(), normal: hit.normal?.clone() ?? null } };
    return hit;
  }

  castContent(raycaster, filter, includeLines) {
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
    const r = this.canvasRect();
    const v = point.clone().project(this.camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, behind: v.z > 1 };
  }

  /** World size of one screen pixel at `point` (for tolerances and handle sizes). */
  pixelSizeAt(point) {
    if (this.isOrtho) return (this.ortho.top - this.ortho.bottom) / Math.max(1, this.height);
    const forward = _forward.setFromMatrixColumn(this.camera.matrixWorld, 2).negate();
    const depth = Math.max(0.01, _delta.subVectors(point, this.camera.position).dot(forward));
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
    for (const line of this.axes.children) {
      if (line.userData.axisDashed) line.visible = !on;
      if (line.userData.axisPlanSolid) line.visible = on;
    }
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
    for (const child of [...this.selectionHelpers.children]) { child.geometry.dispose(); child.material.dispose(); this.selectionHelpers.remove(child); }
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
    // Transparent: no sky, no ground plane, and a clear colour with alpha 0 (the model alone keeps its pixels).
    const savedClearAlpha = this.renderer.getClearAlpha();
    const groundVisible = this.ground?.visible;
    if (transparent) { this.sky.visible = false; if (this.ground) this.ground.visible = false; this.renderer.setClearAlpha(0); }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
    this.width = width; this.height = height;
    this.updateProjection();
    this.interacting = false;
    this.shadowsDirty = true;
    // A saved image has its full ambient occlusion at once (no fade-in).
    this.aoFade = null;
    this.aoShown = true;
    this.renderFrame();
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    out.getContext('2d').drawImage(this.canvas, 0, 0, width, height);
    this.renderer.setPixelRatio(savedRatio);
    this.selectionHelpers.visible = true;
    this.helpers.visible = helpersVisible;
    this.sky.visible = true;
    if (this.ground) this.ground.visible = groundVisible;
    this.renderer.setClearAlpha(savedClearAlpha);
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

/**
 * GPU time per frame with EXT_disjoint_timer_query_webgl2 (WebView2/Chromium have it): one query around a
 * frame, read back a frame or two later without waiting. Null where the extension is missing.
 */
class GpuTimer {
  static create(gl, onResult) {
    let ext = null;
    try { ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2'); } catch { ext = null; }
    return ext ? new GpuTimer(gl, ext, onResult) : null;
  }

  constructor(gl, ext, onResult) {
    this.gl = gl;
    this.ext = ext;
    this.onResult = onResult;
    this.pending = [];
    this.active = null;
  }

  begin(tag) {
    if (this.active || this.pending.length > 3) return;
    try {
      this.active = { query: this.gl.createQuery(), tag };
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active.query);
    } catch { this.active = null; }
  }

  end() {
    if (!this.active) return;
    try { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.active); } catch { /* lost context */ }
    this.active = null;
  }

  poll() {
    const gl = this.gl;
    while (this.pending.length) {
      const p = this.pending[0];
      let ready = false;
      try { ready = gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE); } catch { ready = true; }
      if (!ready) break;
      this.pending.shift();
      try {
        if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) this.onResult(gl.getQueryParameter(p.query, gl.QUERY_RESULT) / 1e6, p.tag);
        gl.deleteQuery(p.query);
      } catch { /* lost context */ }
    }
  }
}

/** Sun marker icon: a shining sun (day, on) or a grey disc with a slash (off or below the horizon). */
const SUN_TEXTURES = {};
/** The orbit centre (SketchUp): a small cube — translucent faces and crisp edges, drawn over everything, 1 unit wide (scaled to pixels per frame). */
function pivotCube() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const faces = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#1c7ed6', transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#1864ab', depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  for (const [o, order] of [[faces, 22], [edges, 23], [dot, 24]]) o.renderOrder = order;
  const group = new THREE.Group();
  group.add(faces, edges, dot);
  group.name = 'orbitPivot';
  return group;
}

/** Zooming moves at least as fast as if the point under the cursor were this far (metres): see dolly. */
const DOLLY_MIN_REACH = 2.5;

/** Dragging never takes the sun below this altitude (night is the day/night switch, as in MyArchitecture). */
const SUN_MIN_DRAG_ALTITUDE = 2;

function sunTexture(lit) {
  const key = lit ? 'lit' : 'off';
  if (SUN_TEXTURES[key]) return SUN_TEXTURES[key];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.strokeStyle = lit ? '#f08c00' : '#868e96';
  g.lineWidth = 4;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(32 + Math.cos(a) * 19, 32 + Math.sin(a) * 19); g.lineTo(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29); g.stroke(); }
  g.fillStyle = lit ? '#ffd43b' : '#ced4da';
  g.strokeStyle = lit ? '#e67700' : '#495057';
  g.lineWidth = 3;
  g.beginPath(); g.arc(32, 32, 14, 0, Math.PI * 2); g.fill(); g.stroke();
  if (!lit) { g.strokeStyle = '#e03131'; g.lineWidth = 4; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  SUN_TEXTURES[key] = tex;
  return tex;
}

/** Bulb icons for lamp markers: lit (shining), on (switched on, lights off in the view), off. */
const LAMP_TEXTURES = {};
function lampTexture(state) {
  if (LAMP_TEXTURES[state]) return LAMP_TEXTURES[state];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const fill = state === 'lit' ? '#ffd43b' : state === 'on' ? '#fff3bf' : '#adb5bd';
  if (state === 'lit') {
    g.strokeStyle = '#f59f00'; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(32 + Math.cos(a) * 20, 28 + Math.sin(a) * 20); g.lineTo(32 + Math.cos(a) * 29, 28 + Math.sin(a) * 29); g.stroke(); }
  }
  g.fillStyle = fill; g.strokeStyle = '#343a40'; g.lineWidth = 3;
  g.beginPath(); g.arc(32, 26, 15, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(39, 46); g.lineTo(25, 46); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#495057'; g.fillRect(25, 47, 14, 8);
  if (state === 'off') { g.strokeStyle = '#e03131'; g.lineWidth = 4; g.beginPath(); g.moveTo(12, 12); g.lineTo(52, 52); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  LAMP_TEXTURES[state] = tex;
  return tex;
}

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

const _forward = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _markerForward = new THREE.Vector3();
const _markerDelta = new THREE.Vector3();
const GRID_STEPS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

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

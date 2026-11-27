// The 3D graphics area (three.js). Shows bodies (tessellated by the kernel), their edges, the reference
// planes and origin, sketches on their planes, previews of features being edited, and highlights what
// the pointer is over (orange) and what is selected (blue).
//
// Mouse: left click selects, left drag or middle drag rotates, right drag / Ctrl+middle / Shift+left pans,
// wheel zooms at the pointer. Z is up (rotating is a turntable about Z, see orbit.js); units are millimetres.
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { orbitStep, freeOrbitStep, rollStep, orbitAboutAxis, edgeAxis, ORBIT_SPEED } from './orbit.js';

/** Standard views (Z up): dir points from the model to the eye. Front looks along +Y, top down −Z, right along −X. */
export const VIEWS = {
  front: { dir: [0, -1, 0], up: [0, 0, 1] },
  back: { dir: [0, 1, 0], up: [0, 0, 1] },
  top: { dir: [0, 0, 1], up: [0, 1, 0] },
  bottom: { dir: [0, 0, -1], up: [0, -1, 0] },
  right: { dir: [1, 0, 0], up: [0, 0, 1] },
  left: { dir: [-1, 0, 0], up: [0, 0, 1] },
  iso: { dir: [1, -1, 1], up: [0, 0, 1] },
  dimetric: { dir: [1, -1.6, 0.6], up: [0, 0, 1] },
  trimetric: { dir: [1.4, -0.6, 1], up: [0, 0, 1] },
};
export const WORLD_UP = [0, 0, 1];
export const DISPLAY_STYLES = ['shadedEdges', 'shaded', 'hiddenRemoved', 'hiddenVisible', 'wireframe'];

const HOVER = new THREE.Color('#f28c1e');
const SELECT = new THREE.Color('#1f7ae0');
const PREVIEW = new THREE.Color('#f6c445');

export class Viewport {
  constructor(host, options = {}) {
    this.host = host;
    this.options = options;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vp-canvas';
    this.canvas.tabIndex = 0;
    host.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.persp = new THREE.PerspectiveCamera(35, 1, 0.1, 1e6);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e6, 1e6);
    this.isOrtho = true;
    this.target = new THREE.Vector3();
    this.distance = 300;
    this.dir = new THREE.Vector3(1, -1, 1).normalize();
    this.up = new THREE.Vector3(0, 0, 1);
    this.style = 'shadedEdges';
    this.lineMaterials = new Set();
    // Lights: a soft sky, a key light that follows the camera, the room environment for metals.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1);
    this.hemi.position.set(0, 0, 1); // the sky is up (+Z)
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 1.6);
    this.scene.add(this.key);
    // The document's own lights (DisplayManager › Lights): world-placed, each with a handle to drag.
    this.userLights = new Map();
    this.lightGroup = new THREE.Group();
    this.lightGroup.name = 'lights';
    this.scene.add(this.lightGroup);
    this.showLightHandles = false;
    this.selectedLight = null;
    this.groups = {};
    for (const name of ['bodies', 'edges', 'planes', 'origin', 'sketch', 'preview', 'highlight', 'markers']) {
      this.groups[name] = new THREE.Group();
      this.groups[name].name = name;
      this.scene.add(this.groups[name]);
    }
    this.groups.highlight.renderOrder = 10;
    this.bodies = new Map();
    this.sharedGeometry = new Map();   // geometryKey → { g, count } (bodies of one part share a geometry)
    this.planes = new Map();
    this.hover = null;
    this.selection = [];
    this.section = null;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.labels = document.createElement('div');
    this.labels.className = 'vp-labels';
    host.append(this.labels);
    // Rulers, the scale bar and the cursor marks are drawn on a 2D canvas over the 3D view.
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'vp-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    host.append(this.overlay);
    this.guides = { rulers: true, grid: true, scaleBar: true, unit: 'mm', factor: 1, decimals: 2 };
    this.mouse = { x: 0, y: 0, inside: false };
    this.gridKey = '';
    this.buildOrigin();
    this.buildTriad();
    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.applyTheme();
    this.resize();
  }

  get camera() { return this.isOrtho ? this.ortho : this.persp; }

  // ───────────────────────── theme, size, rendering

  applyTheme() {
    const css = getComputedStyle(document.documentElement);
    const dark = document.documentElement.classList.contains('dark') || css.colorScheme === 'dark';
    const top = css.getPropertyValue('--vp-top').trim() || (dark ? '#2b3240' : '#dfe6ef');
    const bottom = css.getPropertyValue('--vp-bottom').trim() || (dark ? '#151a22' : '#f9fbfd');
    this.background = { top, bottom };
    this.scene.background = this.gradientTexture(top, bottom);
    this.edgeColor = new THREE.Color(dark ? '#0b0d10' : '#151a22');
    for (const body of this.bodies.values()) body.edges?.material.color.copy(this.edgeColor);
    this.requestRender();
  }

  gradientTexture(top, bottom) {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top); grad.addColorStop(1, bottom);
    g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  resize() {
    if (this.fixedSize) return;
    const w = Math.max(1, this.host.clientWidth); const h = Math.max(1, this.host.clientHeight);
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    for (const m of this.lineMaterials) m.resolution.set(w, h);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.overlay.width = Math.round(w * dpr); this.overlay.height = Math.round(h * dpr);
    this.overlay.style.width = `${w}px`; this.overlay.style.height = `${h}px`;
    this.updateCamera();
  }

  /** Rulers, grid and scale bar: { rulers, grid, scaleBar, unit ('mm' | 'cm' | 'in'), factor (mm per unit) }. */
  setGuides(guides) {
    Object.assign(this.guides, guides);
    this.requestRender();
  }

  updateCamera() {
    const aspect = this.width / this.height;
    const eye = this.target.clone().addScaledVector(this.dir, this.distance);
    for (const cam of [this.persp, this.ortho]) { cam.position.copy(eye); cam.up.copy(this.up); cam.lookAt(this.target); }
    this.persp.aspect = aspect;
    this.persp.near = Math.max(0.01, this.distance / 1000); this.persp.far = this.distance * 1000;
    this.persp.updateProjectionMatrix();
    const halfH = this.distance * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
    Object.assign(this.ortho, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH, near: -this.distance * 100, far: this.distance * 100 });
    this.ortho.updateProjectionMatrix();
    if (this.key.visible) this.key.position.copy(eye).add(new THREE.Vector3().crossVectors(this.dir, this.up).multiplyScalar(this.distance * 0.4)).addScaledVector(this.up, this.distance * 0.6);
    this.key.target.position.copy(this.target);
    this.key.target.updateMatrixWorld();
    this.options.onCamera?.(this.cameraState());
    this.requestRender();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  render() {
    const t0 = performance.now();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.updateGrid();
    this.renderer.render(this.scene, this.camera);
    this.renderTriad();
    this.positionLabels();
    this.drawOverlay();
    this.options.onStats?.({ calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, ms: performance.now() - t0 });
  }

  /**
   * The guide of a mouse gesture in progress: a ring round where the right button went down, the eight
   * directions' commands round it (the one the drag points at stands out) and the drag's line.
   */
  drawGesture(ctx) {
    const { x0, y0, x, y } = this.gesture;
    const labels = this.options.gestureLabels?.() ?? [];
    const dx = x - x0; const dy = y - y0; const far = Math.hypot(dx, dy) >= 24;
    const sector = far ? ((Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) % 8) + 8) % 8 : -1;
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue('--surface').trim() || '#f4f6f9';
    const fg = css.getPropertyValue('--text').trim() || '#1d2430';
    const accent = css.getPropertyValue('--accent').trim() || '#2f6fed';
    ctx.save();
    ctx.lineWidth = 1.5; ctx.strokeStyle = fg; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(x0, y0, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = "12px 'Segoe UI', 'Malgun Gothic', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const label = labels[i];
      if (!label) continue;
      const a = (i * Math.PI) / 4; const lx = x0 + Math.cos(a) * 78; const ly = y0 - Math.sin(a) * 58;
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = i === sector ? accent : bg; ctx.globalAlpha = i === sector ? 1 : 0.92;
      ctx.beginPath(); ctx.roundRect?.(lx - w / 2, ly - 10, w, 20, 6); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = i === sector ? accent : fg; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = i === sector ? '#fff' : fg; ctx.fillText(label, lx, ly + 0.5);
    }
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
  }

  /** Holds the drawing size at w × h (a video's frames) until releaseSize; window resizes wait till then. */
  fixSize(w, h) {
    this.fixedSize = [w, h];
    this.renderer.setSize(w, h, false);
    this.width = w; this.height = h;
    for (const m of this.lineMaterials) m.resolution.set(w, h);
    this.updateCamera();
  }

  releaseSize() { this.fixedSize = null; this.resize(); }

  /** A picture of the view (thumbnails, Save as image). */
  capture(width = this.width, height = this.height) {
    const w0 = this.width; const h0 = this.height;
    this.renderer.setSize(width, height, false);
    this.width = width; this.height = height;
    for (const m of this.lineMaterials) m.resolution.set(width, height);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    out.getContext('2d').drawImage(this.canvas, 0, 0, width, height);
    this.renderer.setSize(w0, h0, false);
    this.width = w0; this.height = h0;
    for (const m of this.lineMaterials) m.resolution.set(w0, h0);
    this.updateCamera();
    this.render();
    return out;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.canvas.remove();
    this.labels.remove();
  }

  // ───────────────────────── camera

  cameraState() {
    return { target: this.target.toArray(), dir: this.dir.toArray(), up: this.up.toArray(), distance: this.distance, ortho: this.isOrtho };
  }

  setCameraState(s) {
    if (!s) return;
    this.target.fromArray(s.target ?? [0, 0, 0]);
    this.dir.fromArray(s.dir ?? [1, -1, 1]).normalize();
    this.up.fromArray(s.up ?? [0, 0, 1]).normalize();
    this.distance = s.distance ?? 300;
    this.isOrtho = s.ortho !== false;
    this.updateCamera();
  }

  setProjection(ortho) { this.isOrtho = ortho; this.updateCamera(); }

  /** A standard view (front, top, iso …) or a view normal to a plane frame { normal, yDir }; animated. */
  setView(name, { frameOf = null, animate = true, fit = true } = {}) {
    let dir; let up;
    if (frameOf) { dir = new THREE.Vector3(...frameOf.normal); up = new THREE.Vector3(...frameOf.yDir); }
    else { const v = VIEWS[name] ?? VIEWS.iso; dir = new THREE.Vector3(...v.dir).normalize(); up = new THREE.Vector3(...v.up); }
    // Up must be at right angles to the view direction.
    up.addScaledVector(dir, -up.dot(dir)).normalize();
    const box = fit ? this.contentBox() : null;
    const target = box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : this.target.clone();
    const distance = box && !box.isEmpty() ? this.fitDistance(box, dir, up) : this.distance;
    this.glide({ dir, up, target, distance }, animate);
  }

  glide(to, animate = true) {
    cancelAnimationFrame(this.glideFrame);
    if (!animate || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.dir.copy(to.dir); this.up.copy(to.up); this.target.copy(to.target); this.distance = to.distance;
      this.updateCamera();
      return;
    }
    const from = { dir: this.dir.clone(), up: this.up.clone(), target: this.target.clone(), distance: this.distance };
    // Matrix4.lookAt(eye, target, up) puts +Z along eye − target: the view direction is +Z here.
    const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from.dir, new THREE.Vector3(), from.up));
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(to.dir, new THREE.Vector3(), to.up));
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 380);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const q = q0.clone().slerp(q1, e);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
      this.dir.set(0, 0, 1).applyMatrix4(m).normalize();
      this.up.set(0, 1, 0).applyMatrix4(m).normalize();
      this.target.lerpVectors(from.target, to.target, e);
      this.distance = from.distance + (to.distance - from.distance) * e;
      this.updateCamera();
      if (t < 1) this.glideFrame = requestAnimationFrame(step);
    };
    step();
  }

  /** Everything shown (bodies, sketches, previews); the reference planes only when there is nothing else. */
  contentBox() {
    const box = new THREE.Box3();
    for (const g of [this.groups.bodies, this.groups.sketch, this.groups.preview]) box.expandByObject(g);
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(100, 100, 100));
    return box;
  }

  fitDistance(box, dir, up) {
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const c = box.getCenter(new THREE.Vector3());
    let halfW = 0; let halfH = 0;
    for (const p of corners) { const d = p.clone().sub(c); halfW = Math.max(halfW, Math.abs(d.dot(right))); halfH = Math.max(halfH, Math.abs(d.dot(up))); }
    const aspect = this.width / this.height;
    const half = Math.max(halfH, halfW / aspect) * 1.18 + 1e-3;
    return half / Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2));
  }

  zoomToFit(box = null, animate = true) {
    const b = box ?? this.contentBox();
    this.glide({ dir: this.dir.clone(), up: this.up.clone(), target: b.getCenter(new THREE.Vector3()), distance: this.fitDistance(b, this.dir, this.up) }, animate);
  }

  zoomBy(factor, at = null) {
    const before = at ? this.worldAt(at.x, at.y) : null;
    this.distance = Math.max(0.05, Math.min(1e6, this.distance * factor));
    this.updateCamera();
    if (before) {
      const after = this.worldAt(at.x, at.y);
      this.target.add(before.sub(after));
      this.updateCamera();
    }
  }

  /** A point under the pointer on the plane through the target facing the camera. */
  worldAt(x, y) {
    const ray = this.rayAt(x, y);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.dir, this.target);
    return ray.ray.intersectPlane(plane, new THREE.Vector3()) ?? this.target.clone();
  }

  rayAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    ray.params.Line.threshold = this.pixelSize() * 4;
    return ray;
  }

  /** World size of one screen pixel at the target. */
  pixelSize() {
    return (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2))) / this.height;
  }

  /**
   * Orbit by a drag (orbit.js). 'free' (the default) turns about the screen axes with no clamp, so a model can be
   * laid down or turned over; 'turntable' turns about world Z with the elevation clamped (setting orbitMode).
   * A drag that started on an edge turns about that edge (or a circular edge's axis); one that started on a face
   * turns about the point picked.
   */
  rotateBy(dx, dy, pivot = null) {
    const speed = ORBIT_SPEED * ((this.options.orbitSpeed?.() ?? 100) / 100);
    if (pivot?.axis) { this.turnAbout(pivot.axis.point, pivot.axis.dir, -(dx + dy) * speed); return; }
    const before = { dir: this.dir.toArray(), up: this.up.toArray() };
    const mode = this.options.orbitMode?.() ?? 'free';
    const { dir, up } = mode === 'turntable' ? orbitStep(before.dir, before.up, dx, dy, speed) : freeOrbitStep(before.dir, before.up, dx, dy, speed);
    if (pivot?.point) {
      // Turn about the picked point: the target turns with the view about it (same rotation as dir and up).
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...before.dir), new THREE.Vector3(...dir));
      const p = new THREE.Vector3(...pivot.point);
      this.target.sub(p).applyQuaternion(q).add(p);
    }
    this.dir.fromArray(dir);
    this.up.fromArray(up);
    this.updateCamera();
  }

  /** Roll the view about the line of sight by `radians` (positive = the model turns anticlockwise on screen). */
  rollBy(radians) {
    const { dir, up } = rollStep(this.dir.toArray(), this.up.toArray(), radians);
    this.dir.fromArray(dir); this.up.fromArray(up);
    this.updateCamera();
  }

  /** The model turned by `radians` about a line through `point` along `axis` (world): an edge, an axis, X/Y/Z. */
  turnAbout(point, axis, radians) {
    const r = orbitAboutAxis({ dir: this.dir.toArray(), up: this.up.toArray(), target: this.target.toArray() }, point, axis, -radians);
    this.dir.fromArray(r.dir); this.up.fromArray(r.up); this.target.fromArray(r.target);
    this.updateCamera();
  }

  /**
   * The model turned about a screen axis through the orbit target by `degrees`: 'x' = the screen's horizontal
   * (positive tips the top away), 'y' = the screen's vertical (positive turns it to the right), 'z' = roll.
   */
  rotateScreen(axis, degrees) {
    const rad = THREE.MathUtils.degToRad(degrees);
    if (axis === 'z') { this.rollBy(rad); return; }
    const right = new THREE.Vector3().crossVectors(this.up, this.dir).normalize();
    this.turnAbout(this.target.toArray(), axis === 'x' ? right.toArray() : this.up.toArray(), rad);
  }

  /** The axis an edge hit turns about ({ point, dir } world) or null: a straight edge itself, an arc its axis. */
  edgeAxisOf(hit) {
    if (hit?.kind !== 'edge') return null;
    const body = this.bodies.get(hit.bodyKey);
    const seg = body?.edges?.userData.segments;
    if (!seg) return null;
    const pts = [];
    for (let k = 0, s = 0; k < seg.length; k += 6, s++) {
      if ((body.edgeSegments[s] ?? -1) !== hit.index) continue;
      for (const o of [0, 3]) { const v = new THREE.Vector3(seg[k + o], seg[k + o + 1], seg[k + o + 2]); if (body.matrix) v.applyMatrix4(body.matrix); pts.push(v.toArray()); }
    }
    const a = edgeAxis(pts);
    return a ? { point: a.point, dir: a.dir, kind: a.kind } : null;
  }

  panBy(dx, dy) {
    const s = this.pixelSize();
    const right = new THREE.Vector3().crossVectors(this.up, this.dir).normalize();
    this.target.addScaledVector(right, -dx * s).addScaledVector(this.up, dy * s);
    this.updateCamera();
  }

  // ───────────────────────── lights

  /**
   * The scene's lights: { ambient: { color, intensity, sky?, ground? }, cameraLight: { on, color, intensity },
   * lights: [{ id, kind: 'directional' | 'point' | 'spot', color, intensity, position, target, angle (spot, °), on }] }.
   */
  setLights({ ambient = null, cameraLight = null, lights = [] } = {}) {
    if (ambient) { this.hemi.color.set(ambient.color ?? '#ffffff'); this.hemi.groundColor.set(ambient.ground ?? '#8a8f99'); this.hemi.intensity = Number(ambient.intensity ?? 1.1); }
    this.key.visible = cameraLight ? cameraLight.on !== false : true;
    if (cameraLight) { this.key.color.set(cameraLight.color ?? '#ffffff'); this.key.intensity = Number(cameraLight.intensity ?? 1.6); }
    for (const l of this.userLights.values()) { l.light.removeFromParent(); l.light.dispose?.(); l.handle.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); l.handle.removeFromParent(); }
    this.userLights.clear();
    for (const spec of lights) {
      const color = new THREE.Color(spec.color ?? '#ffffff');
      const intensity = Number(spec.intensity ?? 1);
      let light;
      if (spec.kind === 'point') { light = new THREE.PointLight(color, intensity * 4e4, 0, 2); }
      else if (spec.kind === 'spot') { light = new THREE.SpotLight(color, intensity * 4e4, 0, THREE.MathUtils.degToRad(Number(spec.angle ?? 30)), 0.35, 2); }
      else light = new THREE.DirectionalLight(color, intensity);
      light.position.set(...spec.position);
      if (light.target) { light.target.position.set(...(spec.target ?? [0, 0, 0])); this.lightGroup.add(light.target); }
      light.visible = spec.on !== false;
      this.lightGroup.add(light);
      // The handle: a small bulb (point / spot) or sun (directional) and a dashed line to where it aims.
      const handle = new THREE.Group();
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: spec.on === false ? 0.35 : 0.95 }));
      bulb.renderOrder = 20;
      handle.add(bulb);
      if (spec.kind !== 'point') {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...spec.position), new THREE.Vector3(...(spec.target ?? [0, 0, 0]))]);
        const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 4, gapSize: 3, depthTest: false, transparent: true, opacity: 0.6 }));
        line.computeLineDistances();
        line.renderOrder = 19;
        handle.add(line);
      }
      bulb.position.set(...spec.position);
      handle.visible = this.showLightHandles;
      this.lightGroup.add(handle);
      this.userLights.set(spec.id, { spec, light, handle, bulb });
    }
    this.refreshLightHandles();
  }

  setLightHandles(show, selected = this.selectedLight) {
    this.showLightHandles = show;
    this.selectedLight = selected;
    this.refreshLightHandles();
  }

  refreshLightHandles() {
    const r = this.pixelSize() * 7;
    for (const [id, l] of this.userLights) {
      l.handle.visible = this.showLightHandles;
      l.bulb.scale.setScalar(id === this.selectedLight ? r * 1.5 : r);
    }
    this.requestRender();
  }

  /** The light whose handle is under the pointer (within 14 px), or null. */
  lightAt(clientX, clientY) {
    if (!this.showLightHandles) return null;
    const rect = this.canvas.getBoundingClientRect();
    let best = null;
    for (const [id, l] of this.userLights) {
      const sp = this.toScreen(l.spec.position);
      const d = Math.hypot(sp.x - (clientX - rect.left), sp.y - (clientY - rect.top));
      if (d < 14 && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  }

  // ───────────────────────── rulers, scale bar, grid

  /** The screen's axes in the world: right, up (unit), and which world axis each one runs along (if any). */
  screenAxes() {
    const right = new THREE.Vector3().crossVectors(this.up, this.dir).normalize();
    const up = this.up.clone().normalize();
    const name = (v) => { const a = ['X', 'Y', 'Z'].find((n, i) => Math.abs(Math.abs(v.getComponent(i)) - 1) < 1e-4); return a ? `${v.getComponent('XYZ'.indexOf(a)) < 0 ? '−' : ''}${a}` : ''; };
    return { right, up, rightName: name(right), upName: name(up) };
  }

  /** A "nice" step (1, 2, 5 × 10ⁿ) at least `want` long. */
  static niceStep(want) {
    const p10 = 10 ** Math.floor(Math.log10(Math.max(want, 1e-9)));
    for (const m of [1, 2, 5, 10]) if (m * p10 >= want) return m * p10;
    return 10 * p10;
  }

  drawOverlay() {
    const ctx = this.overlay.getContext('2d');
    const dpr = this.overlay.width / Math.max(1, this.width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.gesture) this.drawGesture(ctx);
    const g = this.guides;
    if (!g.rulers && !g.scaleBar) return;
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue('--surface').trim() || '#f4f6f9';
    const fg = css.getPropertyValue('--text').trim() || '#1d2430';
    const accent = '#e5484d';
    const s = this.pixelSize(); // mm per px at the target
    const unitLen = g.factor || 1; // mm per display unit
    const pxPerUnit = unitLen / s;
    const { right, up, rightName, upName } = this.screenAxes();
    const u0 = this.target.dot(right) / unitLen; // display units at the screen centre
    const v0 = this.target.dot(up) / unitLen;
    ctx.font = "10px 'Segoe UI', 'Malgun Gothic', sans-serif";
    if (g.rulers) {
      const R = 20;
      const step = Viewport.niceStep(70 / pxPerUnit);
      const minor = step / 5;
      const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this.width, R);
      ctx.fillRect(0, 0, R, this.height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = fg; ctx.fillStyle = fg; ctx.lineWidth = 1;
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.beginPath();
      // Top ruler: along the screen's right; left ruler: along its up (values grow upward).
      const uAt = (x) => u0 + (x - this.width / 2) / pxPerUnit;
      const xAt = (u) => this.width / 2 + (u - u0) * pxPerUnit;
      const vAt = (y) => v0 - (y - this.height / 2) / pxPerUnit;
      const yAt = (v) => this.height / 2 - (v - v0) * pxPerUnit;
      const isMajor = (d) => Math.abs(Math.round(d / step) * step - d) < minor / 2;
      for (let d = Math.floor(uAt(R) / minor) * minor; d <= uAt(this.width); d += minor) {
        const x = Math.round(xAt(d)) + 0.5;
        if (x < R) continue;
        const major = isMajor(d);
        ctx.moveTo(x, R); ctx.lineTo(x, major ? 4 : isMajor(d - step / 2) ? R - 9 : R - 5);
        if (major) ctx.fillText((Math.round(d / step) * step).toFixed(dec), x + 2, 2);
      }
      for (let d = Math.floor(vAt(this.height) / minor) * minor; d <= vAt(R); d += minor) {
        const y = Math.round(yAt(d)) + 0.5;
        if (y < R) continue;
        const major = isMajor(d);
        ctx.moveTo(R, y); ctx.lineTo(major ? 4 : R - 5, y);
        if (major) { ctx.save(); ctx.translate(2, y - 2); ctx.rotate(-Math.PI / 2); ctx.fillText((Math.round(d / step) * step).toFixed(dec), 0, 0); ctx.restore(); }
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, R + 0.5); ctx.lineTo(this.width, R + 0.5);
      ctx.moveTo(R + 0.5, 0); ctx.lineTo(R + 0.5, this.height);
      ctx.stroke();
      // The corner: the unit, and the world axes the rulers run along.
      ctx.fillStyle = bg; ctx.fillRect(0, 0, R, R);
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.unit, R / 2, R / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      if (rightName) ctx.fillText(rightName, this.width - 4, 2);
      if (upName) { ctx.save(); ctx.translate(2, R + 4); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(upName, 0, 0); ctx.restore(); }
      // The pointer's place on both rulers (red, like the drawing programs).
      if (this.mouse.inside) {
        ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.mouse.x + 0.5, 0); ctx.lineTo(this.mouse.x + 0.5, R);
        ctx.moveTo(0, this.mouse.y + 0.5); ctx.lineTo(R, this.mouse.y + 0.5);
        ctx.stroke();
        ctx.fillStyle = accent; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const label = `${uAt(this.mouse.x).toFixed(dec + 1)}, ${vAt(this.mouse.y).toFixed(dec + 1)}`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = bg; ctx.fillRect(this.mouse.x + 4, R + 3, tw + 6, 13);
        ctx.fillStyle = accent; ctx.fillText(label, this.mouse.x + 7, R + 4);
      }
      ctx.restore();
    }
    if (g.scaleBar) {
      // A bar of a round length near 120 px, and the screen scale (1:n at 96 dpi).
      const len = Viewport.niceStep(120 / pxPerUnit);
      const px = len * pxPerUnit;
      // Where it was dragged to (from the right and bottom edges), else the lower right corner.
      const pos = g.scaleBarPos ?? { right: 24, bottom: 12 };
      const x0 = Math.max(4, this.width - px - Math.max(0, pos.right)); const y0 = Math.max(14, this.height - 14 - Math.max(0, pos.bottom));
      this.scaleBarRect = { x: x0 - 4, y: y0 - 14, w: px + 8, h: 36 };
      ctx.save();
      ctx.fillStyle = fg; ctx.strokeStyle = fg; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) {
        const a = x0 + (px * i) / 4;
        if (i % 2 === 0) ctx.fillRect(a, y0, px / 4, 5); else ctx.strokeRect(a + 0.5, y0 + 0.5, px / 4 - 1, 4);
      }
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, px - 1, 5);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.fillText('0', x0, y0 - 2);
      ctx.textAlign = 'right'; ctx.fillText(`${len} ${g.unit}`, x0 + px, y0 - 2);
      const screenMm = 25.4 / 96; // a CSS pixel on the screen
      const ratio = s / screenMm;
      ctx.textAlign = 'center';
      ctx.fillText(this.isOrtho ? (ratio >= 1 ? `1 : ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(2)}` : `${(1 / ratio).toFixed(1)} : 1`) : '~', x0 + px / 2, y0 + 18);
      ctx.restore();
    }
  }

  /**
   * The grid: an endless-looking plane — always the same standard plane (top = XY, the floor, by default; or
   * front = XZ / right = YZ). Its lines fade out with distance from where the view looks, so no edge is ever seen. The
   * spacing keeps a steady size on screen: when zooming takes it out of 12–60 px it is redrawn at the next
   * 1·2·5 step (about 24 px); every fifth line is darker (5 × 5 cells). Rotating never changes it, and the
   * lines are rebuilt around the view only when it gets near their edge.
   */
  updateGrid() {
    const g = this.guides;
    if (!g.grid) { if (this.grid) this.grid.visible = false; return; }
    const axis = { top: 2, front: 1, right: 0 }[g.gridPlane ?? 'top'] ?? 2;
    const [a, b] = [[1, 2], [0, 2], [0, 1]][axis];
    const unitLen = g.factor || 1;
    const px = this.pixelSize();
    const cur = this.grid?.userData;
    let step = cur?.axis === axis && cur.unitLen === unitLen ? cur.step : 0;
    if (!step || step / px < 12 || step / px > 60) step = Viewport.niceStep((24 * px) / unitLen) * unitLen;
    const major = step * 5;
    // The fade radius: well beyond the view (more when looking at the plane edge-on, in perspective).
    const fade = Math.max(this.width, this.height) * px * (this.isOrtho ? 1.2 : 3);
    const n = Math.min(600, Math.ceil(fade / step / 5 + 1) * 5);
    const ta = this.target.getComponent(a); const tb = this.target.getComponent(b);
    let ca = cur?.ca ?? 0; let cb = cur?.cb ?? 0;
    if (!cur || step !== cur.step || cur.n < n || Math.abs(ta - ca) > (n * step) / 3 || Math.abs(tb - cb) > (n * step) / 3) { ca = Math.round(ta / major) * major; cb = Math.round(tb / major) * major; }
    const dark = document.documentElement.classList.contains('dark');
    const key = `${axis}|${step}|${Math.max(n, cur?.n ?? 0)}|${ca}|${cb}|${dark}`;
    if (key !== this.gridKey) {
      this.gridKey = key;
      const lines = Math.max(n, cur?.step === step ? cur.n : 0);
      if (this.grid) { this.grid.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); this.grid.removeFromParent(); }
      const minor = []; const majors = [];
      const pt = (u, v) => { const q = [0, 0, 0]; q[a] = u; q[b] = v; return q; };
      const isMajor = (w) => Math.abs(Math.round(w / major) * major - w) < step * 1e-6;
      for (let i = -lines; i <= lines; i++) {
        const u = ca + i * step; const v = cb + i * step;
        (isMajor(u) ? majors : minor).push(...pt(u, cb - lines * step), ...pt(u, cb + lines * step));
        (isMajor(v) ? majors : minor).push(...pt(ca - lines * step, v), ...pt(ca + lines * step, v));
      }
      const group = new THREE.Group();
      const color = new THREE.Color(dark ? 0x9fb0c8 : 0x4a5a72);
      for (const [list, opacity] of [[minor, dark ? 0.12 : 0.14], [majors, dark ? 0.28 : 0.32]]) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
        // Each line fades with its distance from the view's centre on the plane: the plane seems to go on forever.
        const mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false,
          uniforms: { uColor: { value: color }, uOpacity: { value: opacity }, uCentre: { value: new THREE.Vector3() }, uFade: { value: fade } },
          vertexShader: 'varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
          fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; uniform vec3 uCentre; uniform float uFade; varying vec3 vWorld; void main() { float d = distance(vWorld, uCentre); float a = uOpacity * (1.0 - smoothstep(uFade * 0.35, uFade, d)); if (a <= 0.002) discard; gl_FragColor = vec4(uColor, a); }',
        });
        group.add(new THREE.LineSegments(geo, mat));
      }
      group.renderOrder = -1;
      group.userData = { axis, unitLen, step, ca, cb, n: lines };
      this.grid = group;
      this.scene.add(group);
    }
    // The fade follows the view every frame (no rebuild): the target pushed onto the grid's plane.
    const centre = this.target.clone(); centre.setComponent(axis, 0);
    for (const line of this.grid.children) { line.material.uniforms.uCentre.value.copy(centre); line.material.uniforms.uFade.value = fade; }
    this.grid.visible = true;
  }

  /** Screen position (CSS px inside the canvas) of a world point. */
  toScreen(p) {
    const v = new THREE.Vector3(...(Array.isArray(p) ? p : [p.x, p.y, p.z])).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, behind: v.z > 1 };
  }

  // ───────────────────────── input

  bindInput() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.focus({ preventScroll: true });
      cancelAnimationFrame(this.glideFrame);
      const tool = this.options.tool?.();
      if (e.button === 0 && !e.ctrlKey && !e.metaKey && tool?.down?.(e)) { drag = { tool: true, id: e.pointerId }; c.setPointerCapture(e.pointerId); return; }
      if (e.button === 0) {
        const rect = c.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const bar = this.scaleBarRect;
        if (bar && this.guides.scaleBar && x >= bar.x && x <= bar.x + bar.w && y >= bar.y && y <= bar.y + bar.h) {
          drag = { scaleBar: true, id: e.pointerId, ox: x - bar.x, oy: y - bar.y };
          c.setPointerCapture(e.pointerId);
          return;
        }
        const lightId = this.lightAt(e.clientX, e.clientY);
        if (lightId) {
          const l = this.userLights.get(lightId);
          this.selectedLight = lightId;
          this.refreshLightHandles();
          this.options.onLightSelect?.(lightId);
          drag = { light: lightId, id: e.pointerId, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(this.dir.clone(), new THREE.Vector3(...l.spec.position)) };
          c.setPointerCapture(e.pointerId);
          return;
        }
      }
      // Mouse gestures (when on): a right-drag is a gesture — its direction runs a command; a right click still
      // opens the context menu.
      if (e.button === 2 && !e.ctrlKey && !e.altKey && this.options.gestures?.()) {
        const rect = c.getBoundingClientRect();
        this.gesture = { x0: e.clientX - rect.left, y0: e.clientY - rect.top, x: e.clientX - rect.left, y: e.clientY - rect.top };
        drag = { gesture: true, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, button: 2 };
        try { c.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone */ }
        return;
      }
      // Left drag rotates; Ctrl (or Shift) + left drag, right drag and Ctrl + middle drag move the view;
      // Alt + left or middle drag rolls. A middle drag that starts on an edge turns about that edge (a circular
      // edge: about its axis); one that starts on a face turns about the point under the pointer.
      const mode = e.altKey && e.button !== 2 ? 'roll' : e.button === 1 ? (e.ctrlKey ? 'pan' : e.shiftKey ? 'zoom' : 'rotate') : e.button === 2 ? 'pan' : (e.shiftKey || e.ctrlKey || e.metaKey ? 'pan' : 'rotate');
      let pivot = null;
      if (mode === 'rotate' && e.button === 1) {
        const hit = this.pick(e.clientX, e.clientY, { kinds: ['edge', 'face'] });
        const axis = this.edgeAxisOf(hit);
        pivot = axis ? { axis } : hit?.point ? { point: hit.point } : null;
      }
      const rect0 = c.getBoundingClientRect();
      drag = { mode, pivot, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, cx: rect0.left + rect0.width / 2, cy: rect0.top + rect0.height / 2, button: e.button, moved: false, id: e.pointerId };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointerleave', () => { this.mouse.inside = false; this.requestRender(); });
    c.addEventListener('pointermove', (e) => {
      const rect = c.getBoundingClientRect();
      this.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top, inside: true };
      if (this.guides.rulers) this.requestRender();
      if (drag?.scaleBar) {
        const bar = this.scaleBarRect;
        const x = Math.max(0, Math.min(this.width - bar.w, this.mouse.x - drag.ox));
        const y = Math.max(0, Math.min(this.height - bar.h, this.mouse.y - drag.oy));
        // Kept as the distance from the right and bottom edges (it stays in its corner when the window resizes).
        this.guides.scaleBarPos = { right: this.width - (x + bar.w), bottom: this.height - (y + bar.h) };
        this.requestRender();
        return;
      }
      if (drag?.light) {
        const p = this.rayAt(e.clientX, e.clientY).ray.intersectPlane(drag.plane, new THREE.Vector3());
        if (p) {
          const l = this.userLights.get(drag.light);
          l.spec.position = p.toArray().map((v) => Math.round(v * 100) / 100);
          l.light.position.copy(p); l.bulb.position.copy(p);
          const line = l.handle.children[1];
          if (line) { line.geometry.setFromPoints([p.clone(), new THREE.Vector3(...(l.spec.target ?? [0, 0, 0]))]); line.computeLineDistances(); }
          drag.moved = true;
          this.requestRender();
        }
        return;
      }
      if (drag?.gesture) {
        this.gesture.x = this.mouse.x; this.gesture.y = this.mouse.y;
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= 12) drag.moved = true;
        this.requestRender();
        return;
      }
      if (drag?.tool) { this.options.tool?.()?.move?.(e); return; }
      if (drag) {
        const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        drag.moved = true;
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.mode === 'roll' && !this.lockRotation) {
          // The angle swept about the view centre (a drag around the centre rolls by that angle).
          const a0 = Math.atan2(drag.y - dy - drag.cy, drag.x - dx - drag.cx); const a1 = Math.atan2(drag.y - drag.cy, drag.x - drag.cx);
          let da = a1 - a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
          this.rollBy(-da);
        } else if (drag.mode === 'rotate' && !this.lockRotation) this.rotateBy(dx, dy, drag.pivot);
        else if (drag.mode === 'pan' || (drag.mode === 'rotate' && this.lockRotation)) this.panBy(dx, dy);
        else if (drag.mode === 'zoom') this.zoomBy(Math.exp(dy * 0.01));
        c.classList.add('dragging');
        return;
      }
      const tool = this.options.tool?.();
      if (tool?.move?.(e)) return;
      this.setHover(this.pick(e.clientX, e.clientY));
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      c.classList.remove('dragging');
      try { c.releasePointerCapture(e.pointerId); } catch { /* gone */ }
      if (d.tool) { this.options.tool?.()?.up?.(e); return; }
      if (d.gesture) {
        const g = this.gesture; this.gesture = null; this.requestRender();
        const dx = e.clientX - d.sx; const dy = e.clientY - d.sy;
        if (d.moved && Math.hypot(dx, dy) >= 24) this.options.onGesture?.(dx, dy, e);
        else if (!d.moved) this.options.onContext?.(this.pick(e.clientX, e.clientY), e);
        return g;
      }
      if (d.scaleBar) { this.options.onScaleBarMoved?.(this.guides.scaleBarPos); return; }
      if (d.light) { if (d.moved) this.options.onLightMoved?.(d.light, this.userLights.get(d.light)?.spec.position); return; }
      if (!d.moved && d.button === 0) {
        const tool = this.options.tool?.();
        if (tool?.click?.(e)) return;
        this.options.onPick?.(this.pick(e.clientX, e.clientY), e);
      } else if (!d.moved && d.button === 2) this.options.onContext?.(this.pick(e.clientX, e.clientY), e);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { if (!drag) this.setHover(null); });
    c.addEventListener('dblclick', (e) => this.options.onDoubleClick?.(this.pick(e.clientX, e.clientY), e));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = Math.exp((this.options.invertZoom?.() ? -1 : 1) * Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0016));
      this.zoomBy(k, { x: e.clientX, y: e.clientY });
    }, { passive: false });
  }

  // ───────────────────────── bodies

  /**
   * Shows bodies: [{ key, mesh: { vertices, normals, triangles, faceGroups }, edges: { lines, edgeGroups },
   * color, opacity, matrix (THREE.Matrix4 | null), faceIndex: Map(faceId → i), pickable, info }].
   */
  setBodies(list) {
    for (const body of this.bodies.values()) this.disposeBody(body);
    this.bodies.clear();
    for (const spec of list) this.addBody(spec);
    // Shared geometries no body uses any more.
    for (const [k, sh] of this.sharedGeometry) if (sh.count <= 0) { sh.g.dispose(); this.sharedGeometry.delete(k); }
    this.applyStyle();
    this.refreshHighlight();
    this.requestRender();
  }

  addBody(spec) {
    // Bodies of the same part (a large assembly's repeated components) share one geometry (spec.geometryKey):
    // built once, kept while any body uses it (and across a setBodies, which re-adds before it purges).
    const shareKey = spec.geometryKey && !spec.colors ? spec.geometryKey : null;
    let g = null;
    if (shareKey && this.sharedGeometry.has(shareKey)) { const sh = this.sharedGeometry.get(shareKey); sh.count++; g = sh.g; }
    else {
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(spec.mesh.vertices, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(spec.mesh.normals, 3));
      g.setIndex(spec.mesh.triangles);
      // Per-vertex colours (stress plots, draft analysis) replace the body colour.
      if (spec.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(spec.colors, 3));
      g.computeBoundingBox(); g.computeBoundingSphere();
      if (shareKey) this.sharedGeometry.set(shareKey, { g, count: 1 });
    }
    const color = new THREE.Color(spec.colors ? '#ffffff' : spec.color ?? '#a9b4c2');
    const material = new THREE.MeshStandardMaterial({
      color, metalness: spec.metal ?? 0.35, roughness: spec.rough ?? 0.45, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: (spec.opacity ?? 1) < 1, opacity: spec.opacity ?? 1,
      clippingPlanes: this.section ? [this.clipPlane] : [],
      vertexColors: Boolean(spec.colors),
    });
    if (spec.colors) { material.metalness = 0.05; material.roughness = 0.7; }
    const mesh = new THREE.Mesh(g, material);
    if (spec.matrix) { mesh.matrixAutoUpdate = false; mesh.matrix.copy(spec.matrix); }
    mesh.userData.bodyKey = spec.key;
    this.groups.bodies.add(mesh);
    // Triangle → face: the kernel's face groups (start/count in index entries).
    const triFace = new Int32Array(spec.mesh.triangles.length / 3);
    for (const fg of spec.mesh.faceGroups) { const i = spec.faceIndex?.get(fg.faceId) ?? -1; triFace.fill(i, fg.start / 3, (fg.start + fg.count) / 3); }
    let edges = null; let edgeSegments = [];
    if (spec.edges?.lines?.length) {
      const lines = spec.edges.lines;
      // Edge groups are polylines (start/count in points): turn them into segment pairs.
      const seg = [];
      edgeSegments = [];
      for (const eg of spec.edges.edgeGroups) {
        const index = spec.edgeIndex?.get(eg.edgeId) ?? -1;
        for (let k = eg.start; k < eg.start + eg.count - 1; k++) {
          seg.push(lines[k * 3], lines[k * 3 + 1], lines[k * 3 + 2], lines[k * 3 + 3], lines[k * 3 + 4], lines[k * 3 + 5]);
          edgeSegments.push(index);
        }
      }
      const lg = new LineSegmentsGeometry();
      lg.setPositions(seg);
      const lm = this.lineMaterial(this.edgeColor ?? new THREE.Color('#151a22'), 1.3);
      lm.clippingPlanes = this.section ? [this.clipPlane] : [];
      edges = new LineSegments2(lg, lm);
      edges.userData.segments = seg;
      if (spec.matrix) { edges.matrixAutoUpdate = false; edges.matrix.copy(spec.matrix); }
      this.groups.edges.add(edges);
    }
    const body = { ...spec, shareKey, mesh, edges, triFace, edgeSegments, baseColor: color.clone(), baseOpacity: spec.opacity ?? 1 };
    this.bodies.set(spec.key, body);
    return body;
  }

  /** Moves one body without rebuilding it (motion studies): its mesh and edges get the matrix. */
  setBodyMatrix(key, matrix) {
    const body = this.bodies.get(key);
    if (!body) return;
    for (const o of [body.mesh, body.edges]) {
      if (!o) continue;
      o.matrixAutoUpdate = false;
      o.matrix.copy(matrix);
      o.matrixWorldNeedsUpdate = true;
    }
    this.requestRender();
  }

  disposeBody(body) {
    if (body.shareKey && this.sharedGeometry.has(body.shareKey)) this.sharedGeometry.get(body.shareKey).count--;
    else body.mesh.geometry.dispose();
    body.mesh.material.dispose(); body.mesh.removeFromParent();
    if (body.edges) { body.edges.geometry.dispose(); this.lineMaterials.delete(body.edges.material); body.edges.material.dispose(); body.edges.removeFromParent(); }
  }

  lineMaterial(color, width, extra = {}) {
    const m = new LineMaterial({ color, linewidth: width, worldUnits: false, ...extra });
    m.resolution.set(this.width || 1, this.height || 1);
    this.lineMaterials.add(m);
    return m;
  }

  setStyle(style) {
    this.style = DISPLAY_STYLES.includes(style) ? style : 'shadedEdges';
    this.applyStyle();
  }

  applyStyle() {
    const s = this.style;
    for (const body of this.bodies.values()) {
      const m = body.mesh.material;
      const ghost = body.ghost;
      body.mesh.visible = s !== 'wireframe' && s !== 'hiddenVisible' || ghost;
      if (s === 'hiddenRemoved' || s === 'hiddenVisible') {
        m.color.set(this.background?.bottom ?? '#ffffff'); m.metalness = 0; m.roughness = 1; m.emissive?.set(this.background?.bottom ?? '#ffffff');
        m.colorWrite = s === 'hiddenRemoved';
        body.mesh.visible = s === 'hiddenRemoved';
      } else {
        m.color.copy(body.baseColor); m.metalness = body.colors ? 0.05 : body.metal ?? 0.35; m.roughness = body.colors ? 0.7 : body.rough ?? 0.45; m.emissive?.set('#000000'); m.colorWrite = true;
      }
      m.opacity = ghost ? Math.min(0.35, body.baseOpacity) : body.baseOpacity;
      m.transparent = m.opacity < 1;
      m.depthWrite = !m.transparent;
      m.needsUpdate = true;
      if (body.edges) {
        body.edges.visible = s !== 'shaded';
        body.edges.material.depthTest = s !== 'hiddenVisible' && s !== 'wireframe';
        body.edges.material.opacity = ghost ? 0.3 : 1;
        body.edges.material.transparent = ghost;
      }
    }
    this.requestRender();
  }

  /** A section view: the bodies cut by a plane (normal, offset along it); null turns it off. */
  setSection(section) {
    this.section = section;
    if (section) this.clipPlane.set(new THREE.Vector3(...section.normal).normalize().negate(), section.offset);
    for (const body of this.bodies.values()) {
      body.mesh.material.clippingPlanes = section ? [this.clipPlane] : [];
      body.mesh.material.needsUpdate = true;
      if (body.edges) { body.edges.material.clippingPlanes = section ? [this.clipPlane] : []; body.edges.material.needsUpdate = true; }
    }
    this.requestRender();
  }

  // ───────────────────────── reference planes and origin

  buildOrigin() {
    const g = this.groups.origin;
    const axes = [[1, 0, 0, '#d64545'], [0, 1, 0, '#3aa655'], [0, 0, 1, '#2f6fd6']];
    for (const [x, y, z, color] of axes) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(x, y, z)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
      line.renderOrder = 5;
      g.add(line);
    }
    g.userData.scaleWithView = true;
  }

  /** The three standard planes (and reference planes): [{ id, frame, label, size }] — drawn as framed squares. */
  setPlanes(list) {
    for (const p of this.planes.values()) { p.group.removeFromParent(); p.group.traverse((o) => { o.geometry?.dispose(); if (o.material && !this.lineMaterials.has(o.material)) o.material.dispose?.(); }); }
    this.planes.clear();
    for (const spec of list) {
      const { frame, size = 100 } = spec;
      const group = new THREE.Group();
      const x = new THREE.Vector3(...frame.xDir); const y = new THREE.Vector3(...frame.yDir); const o = new THREE.Vector3(...frame.origin);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => o.clone().addScaledVector(x, u * size / 2).addScaledVector(y, v * size / 2));
      const fillGeo = new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]);
      fillGeo.computeVertexNormals();
      const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: '#4f8fd8', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
      fill.userData.planeId = spec.id;
      const seg = [];
      for (let i = 0; i < 4; i++) { const a = corners[i]; const b = corners[(i + 1) % 4]; seg.push(a.x, a.y, a.z, b.x, b.y, b.z); }
      const lg = new LineSegmentsGeometry(); lg.setPositions(seg);
      const border = new LineSegments2(lg, this.lineMaterial(new THREE.Color('#4f8fd8'), 1.2, { transparent: true, opacity: 0.85 }));
      group.add(fill, border);
      group.visible = spec.visible !== false;
      this.groups.planes.add(group);
      this.planes.set(spec.id, { ...spec, group, fill, border, corners });
    }
    this.refreshHighlight();
    this.requestRender();
  }

  setPlaneVisible(id, visible) { const p = this.planes.get(id); if (p) { p.group.visible = visible; this.requestRender(); } }

  // ───────────────────────── picking

  /**
   * What is under the pointer: { kind: 'edge' | 'face' | 'plane', bodyKey, index, point } or null.
   * Edges win when within a few pixels; faces otherwise; planes when nothing else is hit.
   */
  pick(clientX, clientY, { kinds = null } = {}) {
    const want = (k) => !kinds || kinds.includes(k);
    const ray = this.rayAt(clientX, clientY);
    const r = this.canvas.getBoundingClientRect();
    const mx = clientX - r.left; const my = clientY - r.top;
    let faceHit = null;
    if (want('face') || want('edge')) {
      const meshes = [...this.bodies.values()].filter((b) => b.pickable !== false && b.mesh.visible !== false || (this.style === 'hiddenVisible' || this.style === 'wireframe')).map((b) => b.mesh);
      const hits = ray.intersectObjects(meshes, false).filter((h) => !this.section || this.clipPlane.distanceToPoint(h.point) >= -1e-6);
      if (hits.length) {
        const h = hits[0];
        const body = this.bodies.get(h.object.userData.bodyKey);
        faceHit = { kind: 'face', bodyKey: body.key, index: body.triFace[h.faceIndex] ?? -1, point: h.point.toArray(), distance: h.distance };
      }
    }
    if (want('edge')) {
      let best = null;
      const tolPx = 6;
      for (const body of this.bodies.values()) {
        if (!body.edges || body.pickable === false) continue;
        const seg = body.edges.userData.segments;
        const m = body.matrix ?? null;
        for (let k = 0, s = 0; k < seg.length; k += 6, s++) {
          const a = new THREE.Vector3(seg[k], seg[k + 1], seg[k + 2]); const b = new THREE.Vector3(seg[k + 3], seg[k + 4], seg[k + 5]);
          if (m) { a.applyMatrix4(m); b.applyMatrix4(m); }
          const pa = this.toScreen(a); const pb = this.toScreen(b);
          const d = segDist(mx, my, pa.x, pa.y, pb.x, pb.y);
          if (d < tolPx && (!best || d < best.d)) {
            // Behind a face that is in front: not pickable (unless the faces are see-through).
            // Depths along the view direction (an orthographic ray starts at the pixel, not at the camera).
            const mid = a.clone().add(b).multiplyScalar(0.5);
            const forward = this.dir.clone().negate();
            const depth = mid.clone().sub(this.camera.position).dot(forward);
            const faceDepth = faceHit ? new THREE.Vector3(...faceHit.point).sub(this.camera.position).dot(forward) : Infinity;
            if (faceHit && this.style !== 'hiddenVisible' && this.style !== 'wireframe' && depth > faceDepth + this.pixelSize() * 8 && !body.ghost) continue;
            best = { d, kind: 'edge', bodyKey: body.key, index: body.edgeSegments[s] ?? -1, point: mid.toArray() };
          }
        }
      }
      if (best) return best;
    }
    if (faceHit && want('face')) return faceHit;
    if (want('plane')) {
      const fills = [...this.planes.values()].filter((p) => p.group.visible).map((p) => p.fill);
      const hits = ray.intersectObjects(fills, false);
      if (hits.length) return { kind: 'plane', id: hits[0].object.userData.planeId, point: hits[0].point.toArray() };
      // The plane's border close to the pointer.
      for (const p of this.planes.values()) {
        if (!p.group.visible) continue;
        for (let i = 0; i < 4; i++) {
          const a = this.toScreen(p.corners[i]); const b = this.toScreen(p.corners[(i + 1) % 4]);
          if (segDist(mx, my, a.x, a.y, b.x, b.y) < 5) return { kind: 'plane', id: p.id, point: p.corners[i].toArray() };
        }
      }
    }
    return null;
  }

  // ───────────────────────── highlight

  setHover(hit) {
    const key = hitKey(hit);
    if (key === hitKey(this.hover)) return;
    this.hover = hit;
    this.options.onHover?.(hit);
    this.refreshHighlight();
  }

  setSelection(list) { this.selection = list ?? []; this.refreshHighlight(); }

  refreshHighlight() {
    const g = this.groups.highlight;
    for (const o of [...g.children]) {
      o.removeFromParent();
      // A body highlight draws the body's own geometry: only its material is the highlight's.
      if (!o.userData.shared) o.geometry?.dispose();
      this.lineMaterials.delete(o.material);
      o.material?.dispose?.();
    }
    for (const p of this.planes.values()) { p.fill.material.opacity = 0.08; p.border.material.color.set('#4f8fd8'); }
    const draw = (hit, color) => {
      if (!hit) return;
      if (hit.kind === 'plane') {
        const p = this.planes.get(hit.id);
        if (p) { p.fill.material.opacity = 0.22; p.border.material.color.copy(color); }
        return;
      }
      const body = this.bodies.get(hit.bodyKey);
      if (!body) return;
      if (hit.kind === 'face' && hit.index >= 0) {
        const idx = body.mesh.geometry.index.array;
        const sub = [];
        for (let t = 0; t < body.triFace.length; t++) if (body.triFace[t] === hit.index) sub.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
        const geo = new THREE.BufferGeometry();
        // Attributes of their own over the same arrays: disposing the highlight must not drop the body's GPU buffers.
        geo.setAttribute('position', new THREE.BufferAttribute(body.mesh.geometry.getAttribute('position').array, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(body.mesh.geometry.getAttribute('normal').array, 3));
        geo.setIndex(sub);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthTest: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, clippingPlanes: this.section ? [this.clipPlane] : [] }));
        if (body.matrix) { m.matrixAutoUpdate = false; m.matrix.copy(body.matrix); }
        m.renderOrder = 10;
        g.add(m);
      } else if (hit.kind === 'edge' && hit.index >= 0 && body.edges) {
        const seg = body.edges.userData.segments;
        const pts = [];
        body.edgeSegments.forEach((e, s) => { if (e === hit.index) pts.push(...seg.slice(s * 6, s * 6 + 6)); });
        if (!pts.length) return;
        const lg = new LineSegmentsGeometry(); lg.setPositions(pts);
        const line = new LineSegments2(lg, this.lineMaterial(color, 3.2, { depthTest: false, transparent: true }));
        if (body.matrix) { line.matrixAutoUpdate = false; line.matrix.copy(body.matrix); }
        line.renderOrder = 11;
        g.add(line);
      } else if (hit.kind === 'body') {
        const m = new THREE.Mesh(body.mesh.geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthTest: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
        m.userData.shared = true;
        if (body.matrix) { m.matrixAutoUpdate = false; m.matrix.copy(body.matrix); }
        g.add(m);
      }
    };
    for (const s of this.selection) draw(s, SELECT);
    if (this.hover && !this.selection.some((s) => hitKey(s) === hitKey(this.hover))) draw(this.hover, HOVER);
    this.requestRender();
  }

  // ───────────────────────── previews and sketches (lines in 3D)

  /** A transparent preview body (a feature being edited) or null. */
  setPreview(spec) {
    for (const o of [...this.groups.preview.children]) { o.removeFromParent(); o.geometry?.dispose(); o.material?.dispose?.(); }
    if (spec?.mesh) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(spec.mesh.vertices, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(spec.mesh.normals, 3));
      g.setIndex(spec.mesh.triangles);
      // With vertex colours (a result on a region, e.g. a submodel's stress): opaque, drawn just in front of the body.
      if (spec.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(spec.colors, 3));
      const m = new THREE.Mesh(g, spec.colors
        ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
        : new THREE.MeshStandardMaterial({ color: spec.cut ? '#e05252' : PREVIEW, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
      this.groups.preview.add(m);
    }
    this.requestRender();
  }

  /** Line segments [x,y,z, x,y,z, …] in a group (sketches): { key, segments, color, width, dashed }. */
  setLines(groupName, list) {
    const g = this.groups[groupName];
    for (const o of [...g.children]) { o.removeFromParent(); o.geometry?.dispose(); if (o.material) { this.lineMaterials.delete(o.material); o.material.dispose(); } }
    for (const spec of list) {
      if (spec.points) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(spec.points, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: spec.color, size: spec.size ?? 7, sizeAttenuation: false, depthTest: false }));
        pts.renderOrder = 20;
        g.add(pts);
        continue;
      }
      if (!spec.segments?.length) continue;
      const lg = new LineSegmentsGeometry(); lg.setPositions(spec.segments);
      const line = new LineSegments2(lg, this.lineMaterial(new THREE.Color(spec.color), spec.width ?? 2, { dashed: Boolean(spec.dashed), dashSize: spec.dashSize ?? 3, gapSize: spec.gapSize ?? 2, depthTest: spec.depthTest ?? false, transparent: true, opacity: spec.opacity ?? 1 }));
      if (spec.dashed) line.computeLineDistances();
      line.renderOrder = spec.order ?? 15;
      g.add(line);
    }
    this.requestRender();
  }

  /** HTML labels at world points (dimensions in sketches): [{ id, at: [x,y,z], html, className }]. */
  setLabels(list) {
    this.labelSpecs = list;
    this.labels.innerHTML = list.map((l) => `<div class="vp-label ${l.className ?? ''}" data-label="${l.id}" ${l.title ? `title="${l.title}"` : ''}>${l.html}</div>`).join('');
    this.positionLabels();
  }

  positionLabels() {
    if (!this.labelSpecs?.length) return;
    for (const l of this.labelSpecs) {
      const el = this.labels.querySelector(`[data-label="${CSS.escape(l.id)}"]`);
      if (!el) continue;
      const s = this.toScreen(l.at);
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      el.hidden = s.behind;
    }
  }

  // ───────────────────────── triad (orientation axes in the corner)

  buildTriad() {
    this.triadScene = new THREE.Scene();
    this.triadCamera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, -10, 10);
    const axes = [[[1, 0, 0], '#d64545', 'X'], [[0, 1, 0], '#3aa655', 'Y'], [[0, 0, 1], '#2f6fd6', 'Z']];
    for (const [d, color, name] of axes) {
      const dir = new THREE.Vector3(...d);
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), 1, color, 0.28, 0.16);
      this.triadScene.add(arrow);
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = color; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 32, 34);
      const tex = new THREE.CanvasTexture(c);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sprite.position.copy(dir.clone().multiplyScalar(1.28)); sprite.scale.set(0.42, 0.42, 1);
      this.triadScene.add(sprite);
    }
  }

  renderTriad() {
    const size = 92;
    this.triadCamera.position.copy(this.dir).multiplyScalar(5);
    this.triadCamera.up.copy(this.up);
    this.triadCamera.lookAt(0, 0, 0);
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(6, 6, size, size);
    this.renderer.setViewport(6, 6, size, size);
    const auto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.triadScene, this.triadCamera);
    this.renderer.autoClear = auto;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    // The origin's axes keep a steady size on screen.
    this.groups.origin.scale.setScalar(this.pixelSize() * 40);
  }
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export const hitKey = (h) => (!h ? '' : h.kind === 'plane' ? `plane:${h.id}` : `${h.kind}:${h.bodyKey}:${h.index}`);

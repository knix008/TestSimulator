// The 3D graphics area (three.js). Shows bodies (tessellated by the kernel), their edges, the reference
// planes and origin, sketches on their planes, previews of features being edited, and highlights what
// the pointer is over (orange) and what is selected (blue), like SolidWorks.
//
// Mouse: left click selects, left drag or middle drag rotates, right drag / Ctrl+middle / Shift+left pans,
// wheel zooms at the pointer. Y is up; units are millimetres.
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const VIEWS = {
  front: { dir: [0, 0, 1], up: [0, 1, 0] },
  back: { dir: [0, 0, -1], up: [0, 1, 0] },
  top: { dir: [0, 1, 0], up: [0, 0, -1] },
  bottom: { dir: [0, -1, 0], up: [0, 0, 1] },
  right: { dir: [1, 0, 0], up: [0, 1, 0] },
  left: { dir: [-1, 0, 0], up: [0, 1, 0] },
  iso: { dir: [1, 1, 1], up: [0, 1, 0] },
  dimetric: { dir: [1, 0.6, 1.6], up: [0, 1, 0] },
  trimetric: { dir: [1.4, 1, 0.6], up: [0, 1, 0] },
};
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
    this.dir = new THREE.Vector3(1, 1, 1).normalize();
    this.up = new THREE.Vector3(0, 1, 0);
    this.style = 'shadedEdges';
    this.lineMaterials = new Set();
    // Lights: a soft sky, a key light that follows the camera, the room environment for metals.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1));
    this.key = new THREE.DirectionalLight(0xffffff, 1.6);
    this.scene.add(this.key);
    this.groups = {};
    for (const name of ['bodies', 'edges', 'planes', 'origin', 'sketch', 'preview', 'highlight', 'markers']) {
      this.groups[name] = new THREE.Group();
      this.groups[name].name = name;
      this.scene.add(this.groups[name]);
    }
    this.groups.highlight.renderOrder = 10;
    this.bodies = new Map();
    this.planes = new Map();
    this.hover = null;
    this.selection = [];
    this.section = null;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.labels = document.createElement('div');
    this.labels.className = 'vp-labels';
    host.append(this.labels);
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
    const w = Math.max(1, this.host.clientWidth); const h = Math.max(1, this.host.clientHeight);
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    for (const m of this.lineMaterials) m.resolution.set(w, h);
    this.updateCamera();
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
    this.key.position.copy(eye).add(new THREE.Vector3().crossVectors(this.dir, this.up).multiplyScalar(this.distance * 0.4)).addScaledVector(this.up, this.distance * 0.6);
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
    this.renderer.render(this.scene, this.camera);
    this.renderTriad();
    this.positionLabels();
    this.options.onStats?.({ calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, ms: performance.now() - t0 });
  }

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
    this.dir.fromArray(s.dir ?? [1, 1, 1]).normalize();
    this.up.fromArray(s.up ?? [0, 1, 0]).normalize();
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

  rotateBy(dx, dy) {
    const speed = 0.006;
    const right = new THREE.Vector3().crossVectors(this.up, this.dir).normalize();
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * speed);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * speed);
    const q = qYaw.multiply(qPitch);
    this.dir.applyQuaternion(q).normalize();
    this.up.applyQuaternion(q).normalize();
    this.updateCamera();
  }

  panBy(dx, dy) {
    const s = this.pixelSize();
    const right = new THREE.Vector3().crossVectors(this.up, this.dir).normalize();
    this.target.addScaledVector(right, -dx * s).addScaledVector(this.up, dy * s);
    this.updateCamera();
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
      if (e.button === 0 && tool?.down?.(e)) { drag = { tool: true, id: e.pointerId }; c.setPointerCapture(e.pointerId); return; }
      const mode = e.button === 1 ? (e.ctrlKey ? 'pan' : e.shiftKey ? 'zoom' : 'rotate') : e.button === 2 ? 'pan' : (e.shiftKey ? 'pan' : 'rotate');
      drag = { mode, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, moved: false, id: e.pointerId };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (drag?.tool) { this.options.tool?.()?.move?.(e); return; }
      if (drag) {
        const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        drag.moved = true;
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.mode === 'rotate' && !this.lockRotation) this.rotateBy(dx, dy);
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
    this.applyStyle();
    this.refreshHighlight();
    this.requestRender();
  }

  addBody(spec) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(spec.mesh.vertices, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(spec.mesh.normals, 3));
    g.setIndex(spec.mesh.triangles);
    g.computeBoundingBox(); g.computeBoundingSphere();
    const color = new THREE.Color(spec.color ?? '#a9b4c2');
    const material = new THREE.MeshStandardMaterial({
      color, metalness: spec.metal ?? 0.35, roughness: spec.rough ?? 0.45, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: (spec.opacity ?? 1) < 1, opacity: spec.opacity ?? 1,
      clippingPlanes: this.section ? [this.clipPlane] : [],
    });
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
    const body = { ...spec, mesh, edges, triFace, edgeSegments, baseColor: color.clone(), baseOpacity: spec.opacity ?? 1 };
    this.bodies.set(spec.key, body);
    return body;
  }

  disposeBody(body) {
    body.mesh.geometry.dispose(); body.mesh.material.dispose(); body.mesh.removeFromParent();
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
        m.color.copy(body.baseColor); m.metalness = body.metal ?? 0.35; m.roughness = body.rough ?? 0.45; m.emissive?.set('#000000'); m.colorWrite = true;
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
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: spec.cut ? '#e05252' : PREVIEW, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
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

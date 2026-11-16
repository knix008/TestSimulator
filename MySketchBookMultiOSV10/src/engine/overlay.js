// Tool feedback drawn over the model: rubber-band lines, inference points and
// dotted inference lines, protractors, and HTML labels (lengths, "Endpoint",
// "On Red Axis" …). Named layers are replaced in place, so a tool that updates
// its preview every pointer move reuses one buffer instead of allocating.
import * as THREE from 'three';

export const INFERENCE_COLORS = {
  endpoint: '#18a33a', midpoint: '#1aa6c9', center: '#1a66c9', intersection: '#d22', onEdge: '#d01b1b', onFace: '#2a5bd7', ground: '#555',
  axisX: '#d6303b', axisY: '#2e6fd6', axisZ: '#2f9e44', parallel: '#d43fd8', perpendicular: '#d43fd8', onGuide: '#555', free: '#333',
};

/**
 * Labels re-tested against the model per frame while the view moves (all of them on a still frame). One BVH ray
 * against the cached mesh list costs microseconds, so every label of a house is tested every frame: a label
 * tested a frame late showed through the building for that frame.
 */
const OCCLUSION_BUDGET = 64;

export class Overlay {
  constructor(viewport, labelHost) {
    this.viewport = viewport;
    this.tmpDir = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.name = 'tool-overlay';
    viewport.overlay.add(this.group);
    this.layers = new Map();
    this.labelHost = labelHost;
    this.labels = new Map();
    // Labels follow their 3D points every frame.
    const previous = viewport.options.beforeRender;
    viewport.options.beforeRender = (v) => { previous?.(v); this.placeLabels(); };
  }

  /** Line segments (pairs of points) on layer `name`. Options: color, dashed, width (1 only in WebGL), depthTest, opacity. */
  lines(name, points, { color = '#1f2937', dashed = false, depthTest = false, opacity = 1 } = {}) {
    let layer = this.layers.get(name);
    if (!points?.length) { this.clear(name); return; }
    const flat = new Float32Array(points.length * 3);
    points.forEach((p, i) => { flat[i * 3] = p.x; flat[i * 3 + 1] = p.y; flat[i * 3 + 2] = p.z; });
    if (!layer || layer.type !== 'lines' || layer.dashed !== dashed) {
      this.clear(name);
      const g = new THREE.BufferGeometry();
      const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.05, depthTest, transparent: true, opacity }) : new THREE.LineBasicMaterial({ color, depthTest, transparent: true, opacity });
      const object = new THREE.LineSegments(g, m);
      object.renderOrder = 20;
      object.frustumCulled = false;
      this.group.add(object);
      layer = { type: 'lines', object, dashed };
      this.layers.set(name, layer);
    }
    const g = layer.object.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    g.computeBoundingSphere();
    layer.object.material.color.set(color);
    layer.object.material.opacity = opacity;
    if (dashed) {
      // Dash size in world units scaled to stay readable at any zoom.
      const px = this.viewport.pixelSizeAt(points[0]);
      layer.object.material.dashSize = px * 7;
      layer.object.material.gapSize = px * 5;
      layer.object.computeLineDistances();
    }
    this.viewport.requestRender();
  }

  /** A polyline (connected points). */
  polyline(name, points, options = {}) {
    const pairs = [];
    for (let i = 0; i < points.length - 1; i++) pairs.push(points[i], points[i + 1]);
    if (options.closed && points.length > 2) pairs.push(points[points.length - 1], points[0]);
    this.lines(name, pairs, options);
  }

  /** Screen-sized square markers (inference points). */
  points(name, list, { color = '#18a33a', size = 9 } = {}) {
    if (!list?.length) { this.clear(name); return; }
    let layer = this.layers.get(name);
    if (!layer || layer.type !== 'points') {
      this.clear(name);
      const object = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size, sizeAttenuation: false, color, depthTest: false, transparent: true }));
      object.renderOrder = 21;
      object.frustumCulled = false;
      this.group.add(object);
      layer = { type: 'points', object };
      this.layers.set(name, layer);
    }
    layer.object.geometry.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((p) => [p.x, p.y, p.z]), 3));
    layer.object.material.color.set(color);
    layer.object.material.size = size;
    this.viewport.requestRender();
  }

  /** A translucent polygon (face preview, room outline …). */
  polygon(name, points, { color = '#2a5bd7', opacity = 0.18 } = {}) {
    if (!points || points.length < 3) { this.clear(name); return; }
    this.clear(name);
    const g = new THREE.BufferGeometry();
    const flat = [];
    for (let i = 1; i < points.length - 1; i++) for (const p of [points[0], points[i], points[i + 1]]) flat.push(p.x, p.y, p.z);
    g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    const object = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    object.renderOrder = 19;
    this.group.add(object);
    this.layers.set(name, { type: 'mesh', object });
    this.viewport.requestRender();
  }

  /** Any three.js object as a layer (e.g. a ghost of the item being placed). */
  object(name, object) {
    this.clear(name);
    if (!object) return;
    this.group.add(object);
    this.layers.set(name, { type: 'object', object, external: true });
    this.viewport.requestRender();
  }

  /** A protractor disc at `center` in the plane with `normal` (Rotate tool). */
  protractor(name, center, normal, radius, color = '#2e6fd6') {
    const pts = [];
    const n = normal.clone().normalize();
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const at = (a, r) => center.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    for (let i = 0; i < 72; i++) {
      const a0 = (i / 72) * Math.PI * 2; const a1 = ((i + 1) / 72) * Math.PI * 2;
      pts.push(at(a0, radius), at(a1, radius));
      if (i % 6 === 0) pts.push(at(a0, radius * (i % 18 === 0 ? 0.8 : 0.9)), at(a0, radius));
    }
    this.lines(name, pts, { color });
  }

  /** An HTML label anchored at a world point (offset in px). */
  /** `visible`: optional () => boolean checked when labels are placed. `occlude`: hidden where the model stands
   *  between the label's point and the camera (3D views; the 2D plan always shows it). */
  label(name, point, text, { kind = 'info', dx = 14, dy = 14, visible = null, occlude = false } = {}) {
    if (!point || !text) { this.clearLabel(name); return; }
    let entry = this.labels.get(name);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'vp-label';
      this.labelHost.append(el);
      entry = { el };
      this.labels.set(name, entry);
    }
    if (!entry.point || !entry.point.equals(point)) {
      // Moved (plan dimensions are rebuilt after the labels were placed for this frame): test it again, and keep
      // it hidden until then, so it never shows for a frame where the building stands in front of it.
      entry.seen = undefined;
      entry.tx = undefined;
      if (occlude && !this.viewport.planMode) { entry.el.hidden = true; entry.hidden = true; }
    }
    entry.point = point.clone();
    entry.dx = dx; entry.dy = dy;
    entry.visible = visible;
    entry.occlude = occlude;
    entry.el.textContent = text;
    entry.el.dataset.kind = kind;
    this.viewport.requestRender();
  }

  clearLabel(name) {
    const entry = this.labels.get(name);
    if (entry) { entry.el.remove(); this.labels.delete(name); }
  }

  placeLabels() {
    if (!this.labels.size) return;
    const vp = this.viewport;
    const r = vp.canvasRect();
    const host = this.labelHost.getBoundingClientRect();
    const moving = Boolean(vp.interacting || vp.animation);
    // A label never tested is tested now; the others are re-tested all at once on a still frame and a few
    // per frame (round robin) while the view moves, so a turning view never shows numbers through the building.
    let budget = moving ? OCCLUSION_BUDGET : Infinity;
    const occluding = [];
    for (const entry of this.labels.values()) {
      const s = vp.worldToScreen(entry.point);
      const off = s.behind || s.x < r.left || s.x > r.right || s.y < r.top || s.y > r.bottom || (entry.visible ? !entry.visible() : false);
      let hidden = off;
      if (!off && entry.occlude && !vp.planMode) {
        if (entry.seen === undefined) { entry.seen = this.seenFromCamera(entry.point); budget -= 1; }
        else occluding.push(entry);
        hidden = !entry.seen;
      }
      if (entry.hidden !== hidden) { entry.el.hidden = hidden; entry.hidden = hidden; }
      if (!hidden) {
        let tx = Math.round(s.x - host.left + entry.dx); let ty = Math.round(s.y - host.top + entry.dy);
        // A problem note stays inside the view, so the fix can be read while the piece is still moving.
        if (entry.el.dataset.kind === 'warning' || entry.el.dataset.kind === 'error') {
          const w = entry.el.offsetWidth; const h = entry.el.offsetHeight;
          if (tx + w > host.width - 8) tx = Math.max(8, host.width - w - 8);
          if (ty + h > host.height - 8) ty = Math.max(8, host.height - h - 8);
          if (ty < 8) ty = 8;
        }
        if (entry.tx !== tx || entry.ty !== ty) { entry.el.style.transform = `translate(${tx}px, ${ty}px)`; entry.tx = tx; entry.ty = ty; }
      }
    }
    if (!occluding.length || budget <= 0) return;
    const count = Math.min(occluding.length, budget);
    this.occlusionCursor = (this.occlusionCursor ?? 0) % occluding.length;
    for (let i = 0; i < count; i++) {
      const entry = occluding[(this.occlusionCursor + i) % occluding.length];
      entry.seen = this.seenFromCamera(entry.point);
      const hidden = !entry.seen;
      if (entry.hidden !== hidden) { entry.el.hidden = hidden; entry.hidden = hidden; }
    }
    this.occlusionCursor += count;
    // A label that just came out from behind the model is placed next frame (its transform was skipped).
    if (moving || occluding.some((e) => !e.hidden && e.tx === undefined)) vp.requestRender();
  }

  /** True when no mesh of the model lies between the camera and `point` (BVH raycast, first hit only). */
  seenFromCamera(point) {
    const vp = this.viewport;
    const frame = vp.renderer.info.render.frame;
    // The model does not change while the view turns: the mesh list is collected again only on still frames.
    if (!this.meshes || (this.meshFrame !== frame && !(vp.interacting || vp.animation))) {
      this.meshFrame = frame;
      this.meshes = [];
      vp.content.traverseVisible((o) => { if (o.isMesh && !o.userData.helper) this.meshes.push(o); });
    }
    if (!this.meshes.length) return true;
    this.raycaster ??= Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
    const cam = vp.camera.position;
    const dir = this.tmpDir.copy(point).sub(cam);
    const far = dir.length();
    if (far < 1e-6) return true;
    this.raycaster.set(cam, dir.divideScalar(far));
    this.raycaster.far = far - 0.05;
    return this.raycaster.intersectObjects(this.meshes, false).length === 0;
  }

  clear(name) {
    const layer = this.layers.get(name);
    if (!layer) return;
    this.group.remove(layer.object);
    if (!layer.external) { layer.object.geometry?.dispose(); layer.object.material?.dispose?.(); }
    this.layers.delete(name);
    this.viewport.requestRender();
  }

  /** Everything (tool change). */
  reset() {
    for (const name of [...this.layers.keys()]) this.clear(name);
    for (const name of [...this.labels.keys()]) this.clearLabel(name);
  }
}

/** Inference marker for a snap result (colour by kind) plus its tooltip. */
export function showInference(overlay, snap, { from = null } = {}) {
  if (!snap) { overlay.clear('inf-point'); overlay.clear('inf-line'); overlay.clearLabel('inf'); return; }
  const color = INFERENCE_COLORS[snap.kind] ?? '#333';
  if (['endpoint', 'midpoint', 'center', 'intersection', 'onEdge', 'onFace', 'onGuide'].includes(snap.kind)) overlay.points('inf-point', [snap.point], { color, size: snap.kind === 'onFace' ? 7 : 10 });
  else overlay.clear('inf-point');
  const lineFrom = snap.lineFrom ?? (snap.kind?.startsWith('axis') ? from : null);
  if (lineFrom) overlay.lines('inf-line', [lineFrom, snap.point], { color, dashed: !snap.kind?.startsWith('axis') });
  else overlay.clear('inf-line');
  overlay.label('inf', snap.point, snap.tooltip ?? '', { kind: snap.kind });
}

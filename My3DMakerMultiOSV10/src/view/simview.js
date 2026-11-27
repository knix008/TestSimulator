// The 3D graphics area of the simulation (three.js): the meshed bodies (faces picked by a click),
// boundary-condition highlights, result contours with a legend, deformed shapes and animations,
// section planes of fields in the air or the flow, streamlines, the topology iso-surface.
//
// Mouse: left drag rotates (Z up), right / middle drag pans, wheel zooms at the pointer, a click
// picks the face under the pointer. Coordinates are model units (mm).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Guides } from './guides.js';

export const VIEWS = {
  iso: [1, -1, 0.8], front: [0, -1, 0], back: [0, 1, 0], top: [0, 0, 1], bottom: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0],
};

export const COLORMAPS = {
  rainbow: ['#0000ff', '#0080ff', '#00ffff', '#00ff80', '#00ff00', '#80ff00', '#ffff00', '#ff8000', '#ff0000'],
  viridis: ['#440154', '#472c7a', '#3b518b', '#2c718e', '#21908d', '#27ad81', '#5cc863', '#aadc32', '#fde725'],
  coolwarm: ['#3b4cc0', '#6788ee', '#9abbff', '#c9d7f0', '#edd1c2', '#f7a889', '#e26952', '#b40426'],
  thermal: ['#000004', '#320a5e', '#781b6c', '#bb3654', '#ec6824', '#fbb41a', '#fcffa4'],
  grayscale: ['#202020', '#f0f0f0'],
};

const cmapCache = new Map();
function cmapColors(name) {
  if (!cmapCache.has(name)) cmapCache.set(name, (COLORMAPS[name] ?? COLORMAPS.rainbow).map((c) => new THREE.Color(c)));
  return cmapCache.get(name);
}

/** Colour of t ∈ [0, 1] on a map, optionally in `bands` steps. */
export function mapColor(t, name = 'rainbow', bands = 0, out = new THREE.Color()) {
  const stops = cmapColors(name);
  let x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  if (bands > 1) x = Math.min(bands - 1, Math.floor(x * bands)) / (bands - 1);
  const f = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  return out.copy(stops[i]).lerp(stops[i + 1], f - i);
}

export function cssColor(t, name, bands) { return `#${mapColor(t, name, bands).getHexString()}`; }

const BC_COLORS = { support: '#2f7de1', load: '#e5484d', thermal: '#f08a24', electric: '#9b59d0', magnetic: '#14a3a3', acoustic: '#d0479b', fluid: '#2fb37a', pick: '#1f7ae0', hover: '#f6a23a' };

/** A sun (disc and twelve rays) on a transparent canvas: the marker of a light. Made once. */
let sunTex = null;
function sunTexture() {
  if (sunTex) return sunTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.strokeStyle = '#f59f00';
  g.lineCap = 'round';
  g.lineWidth = 7;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const r0 = 34; const r1 = i % 2 ? 50 : 60;
    g.beginPath(); g.moveTo(r0 * Math.cos(a), r0 * Math.sin(a)); g.lineTo(r1 * Math.cos(a), r1 * Math.sin(a)); g.stroke();
  }
  const grad = g.createRadialGradient(-6, -6, 4, 0, 0, 26);
  grad.addColorStop(0, '#fff3b0'); grad.addColorStop(1, '#ffb703');
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 25, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#9a5b00'; g.stroke();
  sunTex = new THREE.CanvasTexture(c);
  sunTex.colorSpace = THREE.SRGBColorSpace;
  return sunTex;
}

export class SimView {
  constructor(host, { onPick = null, onHover = null } = {}) {
    this.host = host;
    this.onPick = onPick;
    this.onHover = onHover;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sv-canvas';
    this.canvas.tabIndex = 0;
    host.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.persp = new THREE.PerspectiveCamera(35, 1, 0.1, 1e7);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e7, 1e7);
    for (const c of [this.persp, this.ortho]) c.up.set(0, 0, 1);
    this.camera = this.ortho;
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.render());
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x80848c, 1.25);
    this.hemi.position.set(0, 0, 1);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 1.4);
    this.scene.add(this.key);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.overlay = new THREE.Group();
    this.scene.add(this.overlay);
    this.mesh = null;
    this.base = null;
    this.style = 'shadedEdges';
    this.faceColors = new Map();
    this.hover = -1;
    this.contour = null;
    this.deform = null;
    this.scale = 1;
    this.bodyColor = new Map();
    this.hiddenBodies = new Set();
    this.anim = null;
    this.labels = document.createElement('div');
    this.labels.className = 'sv-labels';
    host.append(this.labels);
    this.legend = document.createElement('div');
    this.legend.className = 'sv-legend';
    this.legend.hidden = true;
    host.append(this.legend);
    this.triad = document.createElement('canvas');
    this.triad.className = 'sv-triad';
    this.triad.width = 96;
    this.triad.height = 96;
    host.append(this.triad);
    this.ray = new THREE.Raycaster();
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (down && down.b === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) this.onPick?.(this.pickAt(e), e);
      down = null;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const hit = this.pickAt(e);
      const f = hit?.face ?? -1;
      if (f !== this.hover) { this.hover = f; this.paintFaces(); this.render(); }
      this.onHover?.(hit, e);
    });
    this.canvas.addEventListener('pointerleave', () => { if (this.hover !== -1) { this.hover = -1; this.paintFaces(); this.render(); } this.onHover?.(null); });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.box = new THREE.Box3(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50));
    // Ground grid (3D) and rulers (2D: with the mouse position).
    this.guides = new Guides(this);
    this.canvas.addEventListener('pointermove', (e) => { const r = this.canvas.getBoundingClientRect(); this.guides.cursor = [e.clientX - r.left, e.clientY - r.top]; if (this.guides.showRulers) this.guides.update(); });
    this.canvas.addEventListener('pointerleave', () => { this.guides.cursor = null; if (this.guides.showRulers) this.guides.update(); });
    this.setView('iso', false);
  }

  dispose() {
    this.stopAnimation();
    this.guides.dispose();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }

  setTheme({ bg = '#eef1f5', bg2 = null, text = '#222' } = {}) {
    const top = new THREE.Color(bg2 ?? bg);
    const bottom = new THREE.Color(bg);
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(1, `#${bottom.getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.textColor = text;
    this.drawTriad();
    this.render();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrtho();
    this.render();
  }

  updateOrtho() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const d = this.camera === this.ortho ? this.ortho.position.distanceTo(this.controls.target) : this.persp.position.distanceTo(this.controls.target);
    const half = Math.max(1e-6, d * Math.tan((35 * Math.PI) / 360));
    this.ortho.left = (-half * w) / h;
    this.ortho.right = (half * w) / h;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }

  setPerspective(on) {
    const from = this.camera;
    this.camera = on ? this.persp : this.ortho;
    this.camera.position.copy(from.position);
    this.camera.zoom = 1;
    this.controls.object = this.camera;
    this.updateOrtho();
    this.controls.update();
    this.render();
  }

  setView(name, animate = true) {
    const dir = new THREE.Vector3(...(VIEWS[name] ?? VIEWS.iso)).normalize();
    const c = this.box.getCenter(new THREE.Vector3());
    const r = Math.max(1e-3, this.box.getSize(new THREE.Vector3()).length() / 2);
    const dist = r / Math.tan((35 * Math.PI) / 360) * 1.15;
    const end = c.clone().addScaledVector(dir, dist);
    const up = name === 'top' ? new THREE.Vector3(0, 1, 0) : name === 'bottom' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1);
    const apply = (p) => { this.camera.position.copy(p); this.controls.target.copy(c); this.camera.up.copy(up); this.ortho.zoom = 1; this.camera.lookAt(c); this.updateOrtho(); this.controls.update(); this.render(); };
    if (!animate) { apply(end); return; }
    const start = this.camera.position.clone();
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 260);
      const e = t * t * (3 - 2 * t);
      apply(start.clone().lerp(end, e));
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  fit() { this.setView(this.lastView ?? 'iso', true); }

  // ───────────────────────── the mesh

  /** mesh: the solver's mesh info (positions Float32 xyz, tris, triFace, edges, faces). bodies: [{id, color}]. */
  setMesh(mesh, bodies = []) {
    this.clearResultObjects();
    if (this.mesh) { this.root.remove(this.mesh, this.edges, this.wire); this.mesh.geometry.dispose(); }
    this.info = mesh;
    if (!mesh) { this.mesh = null; this.render(); return; }
    const pos = mesh.positions;
    const tris = mesh.tris;
    const nt = tris.length / 3;
    // Unshared vertices per triangle (flat face colours, per-face picking).
    const p = new Float32Array(nt * 9);
    const faceAttr = new Float32Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) { const n = tris[3 * t + k]; p[9 * t + 3 * k] = pos[3 * n]; p[9 * t + 3 * k + 1] = pos[3 * n + 1]; p[9 * t + 3 * k + 2] = pos[3 * n + 2]; faceAttr[3 * t + k] = mesh.triFace[t]; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nt * 9).fill(0.7), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nt * 9), 3));
    g.computeBoundingBox();
    this.faceOfTri = mesh.triFace;
    this.faceBody = (mesh.faces ?? []).map((f) => f.body);
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    this.root.add(this.mesh);
    // Feature edges and the full mesh wireframe.
    const ep = new Float32Array(mesh.edges.length * 3);
    for (let i = 0; i < mesh.edges.length; i++) { const n = mesh.edges[i]; ep[3 * i] = pos[3 * n]; ep[3 * i + 1] = pos[3 * n + 1]; ep[3 * i + 2] = pos[3 * n + 2]; }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    this.edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0.85 }));
    this.root.add(this.edges);
    const wp = new Float32Array(nt * 18);
    for (let t = 0; t < nt; t++) for (const [k, [a, b]] of [[0, 1], [1, 2], [2, 0]].entries()) { for (let c = 0; c < 3; c++) { wp[18 * t + 6 * k + c] = p[9 * t + 3 * a + c]; wp[18 * t + 6 * k + 3 + c] = p[9 * t + 3 * b + c]; } }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    this.wire = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x23272e, transparent: true, opacity: 0.35 }));
    this.root.add(this.wire);
    this.basePositions = p.slice();
    this.smoothNormals();
    this.baseEdges = ep.slice();
    this.baseWire = wp.slice();
    this.bodyColor = new Map(bodies.map((b) => [b.id, new THREE.Color(b.color ?? '#9aa4b1')]));
    this.box = g.boundingBox.clone();
    this.applyStyle();
    this.paintFaces();
    this.render();
  }

  /**
   * Normals smooth within each face of the model (averaged over the triangles of the same face at a node,
   * area weighted) and sharp where faces meet: curved faces look round, edges stay crisp.
   */
  smoothNormals() {
    if (!this.mesh || !this.info) return;
    const g = this.mesh.geometry;
    const pos = g.getAttribute('position').array;
    const nrm = g.getAttribute('normal');
    const tris = this.info.tris;
    const faceOf = this.faceOfTri;
    const nt = tris.length / 3;
    const acc = new Map();
    const tn = new Float32Array(nt * 3);
    for (let t = 0; t < nt; t++) {
      const o = 9 * t;
      const ux = pos[o + 3] - pos[o]; const uy = pos[o + 4] - pos[o + 1]; const uz = pos[o + 5] - pos[o + 2];
      const vx = pos[o + 6] - pos[o]; const vy = pos[o + 7] - pos[o + 1]; const vz = pos[o + 8] - pos[o + 2];
      // Cross product: length = twice the area (area weighting).
      tn[3 * t] = uy * vz - uz * vy; tn[3 * t + 1] = uz * vx - ux * vz; tn[3 * t + 2] = ux * vy - uy * vx;
      for (let k = 0; k < 3; k++) {
        const key = tris[3 * t + k] * 65536 + (faceOf[t] % 65536);
        const a = acc.get(key);
        if (a) { a[0] += tn[3 * t]; a[1] += tn[3 * t + 1]; a[2] += tn[3 * t + 2]; } else acc.set(key, [tn[3 * t], tn[3 * t + 1], tn[3 * t + 2]]);
      }
    }
    const out = nrm.array;
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const a = acc.get(tris[3 * t + k] * 65536 + (faceOf[t] % 65536));
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        out[9 * t + 3 * k] = a[0] / l; out[9 * t + 3 * k + 1] = a[1] / l; out[9 * t + 3 * k + 2] = a[2] / l;
      }
    }
    nrm.needsUpdate = true;
  }

  setStyle(style) { this.style = style; this.applyStyle(); this.render(); }

  applyStyle() {
    if (!this.mesh) return;
    const s = this.style;
    this.mesh.visible = s !== 'wireframe';
    this.edges.visible = s === 'shadedEdges' || s === 'wireframe' || s === 'translucent';
    this.wire.visible = s === 'mesh' || s === 'wireframe';
    this.mesh.material.transparent = s === 'translucent';
    this.mesh.material.opacity = s === 'translucent' ? 0.35 : 1;
    this.mesh.material.depthWrite = s !== 'translucent';
    this.mesh.material.needsUpdate = true;
  }

  setHiddenBodies(ids) { this.hiddenBodies = new Set(ids); this.paintFaces(); this.render(); }

  /** Colours for faces (boundary conditions, selection): Map faceId → css colour or category name. */
  setFaceColors(map) { this.faceColors = map; this.paintFaces(); this.render(); }

  paintFaces() {
    if (!this.mesh) return;
    const col = this.mesh.geometry.getAttribute('color');
    const c = new THREE.Color();
    const nt = this.faceOfTri.length;
    const values = this.contour?.nodeValues;
    for (let t = 0; t < nt; t++) {
      const f = this.faceOfTri[t];
      const body = this.faceBody[f];
      const hidden = this.hiddenBodies.has(body);
      for (let k = 0; k < 3; k++) {
        if (values) {
          const n = this.info.tris[3 * t + k];
          mapColor(this.contour.norm(values[n]), this.contour.colormap, this.contour.bands, c);
        } else {
          c.copy(this.bodyColor.get(body) ?? new THREE.Color('#9aa4b1'));
        }
        const fc = this.faceColors.get(f);
        if (fc) c.lerp(new THREE.Color(BC_COLORS[fc] ?? fc), values ? 0.55 : 0.85);
        if (f === this.hover && !values) c.lerp(new THREE.Color(BC_COLORS.hover), 0.6);
        if (hidden) c.setRGB(0.92, 0.92, 0.92);
        col.setXYZ(3 * t + k, c.r, c.g, c.b);
      }
    }
    col.needsUpdate = true;
    // Hidden bodies: their triangles collapse (simple and cheap).
    const pos = this.mesh.geometry.getAttribute('position');
    if (this.hiddenBodies.size || this.hidWasSet) {
      for (let t = 0; t < nt; t++) {
        const hidden = this.hiddenBodies.has(this.faceBody[this.faceOfTri[t]]);
        for (let k = 0; k < 9; k++) pos.array[9 * t + k] = hidden ? NaN : this.currentPos(9 * t + k);
      }
      pos.needsUpdate = true;
      this.hidWasSet = this.hiddenBodies.size > 0;
    }
  }

  currentPos(i) { return this.deformedPositions ? this.deformedPositions[i] : this.basePositions[i]; }

  pickAt(event) {
    if (!this.mesh || !this.mesh.visible) return null;
    const r = this.canvas.getBoundingClientRect();
    const m = new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(m, this.camera);
    const hits = this.ray.intersectObject(this.mesh, false);
    for (const h of hits) {
      const t = h.faceIndex;
      const f = this.faceOfTri[t];
      if (this.hiddenBodies.has(this.faceBody[f])) continue;
      let value = null;
      if (this.contour?.nodeValues) {
        // The value at the hit point, interpolated in the triangle.
        const ids = [0, 1, 2].map((k) => this.info.tris[3 * t + k]);
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const pa = this.mesh.geometry.getAttribute('position');
        a.fromBufferAttribute(pa, 3 * t); b.fromBufferAttribute(pa, 3 * t + 1); c.fromBufferAttribute(pa, 3 * t + 2);
        const bary = new THREE.Vector3();
        THREE.Triangle.getBarycoord(h.point, a, b, c, bary);
        const v = this.contour.nodeValues;
        value = bary.x * v[ids[0]] + bary.y * v[ids[1]] + bary.z * v[ids[2]];
      }
      return { face: f, body: this.faceBody[f], point: h.point.toArray(), value };
    }
    return null;
  }

  // ───────────────────────── results

  /** values: per node (Float32Array) or null. opts: { min, max, colormap, bands, log, title, unit, format }. */
  setContour(values, opts = {}) {
    if (!values) { this.contour = null; this.legend.hidden = true; this.paintFaces(); this.render(); return; }
    let min = opts.min ?? Infinity;
    let max = opts.max ?? -Infinity;
    if (opts.min === undefined || opts.max === undefined) {
      for (const v of values) { if (!Number.isFinite(v)) continue; if (opts.min === undefined) min = Math.min(min, v); if (opts.max === undefined) max = Math.max(max, v); }
    }
    if (!(max > min)) max = min + (Math.abs(min) * 1e-6 || 1e-12);
    const log = Boolean(opts.log) && min > 0;
    const [lo, hi] = log ? [Math.log10(min), Math.log10(max)] : [min, max];
    const norm = (v) => (log ? (Math.log10(Math.max(v, min)) - lo) / (hi - lo) : (v - lo) / (hi - lo));
    this.contour = { nodeValues: values, min, max, norm: opts.reverse ? (v) => 1 - norm(v) : norm, colormap: opts.colormap ?? 'rainbow', bands: opts.bands ?? 0, log };
    this.drawLegend(opts);
    this.paintFaces();
    this.render();
  }

  drawLegend(opts) {
    const c = this.contour;
    const n = 9;
    const fmt = opts.format ?? ((v) => v.toPrecision(4));
    const rows = [];
    for (let i = n - 1; i >= 0; i--) {
      const t = i / (n - 1);
      const v = c.log ? 10 ** (Math.log10(c.min) + t * (Math.log10(c.max) - Math.log10(c.min))) : c.min + t * (c.max - c.min);
      const tt = opts.reverse ? 1 - t : t;
      rows.push(`<div class="sv-legend-row"><span class="sv-legend-swatch" style="background:${cssColor(tt, c.colormap, c.bands)}"></span><span>${fmt(v)}</span></div>`);
    }
    this.legend.innerHTML = `<div class="sv-legend-title">${opts.title ?? ''}</div><div class="sv-legend-unit">${opts.unit ?? ''}</div>${rows.join('')}${opts.note ? `<div class="sv-legend-note">${opts.note}</div>` : ''}`;
    this.legend.hidden = false;
  }

  /** vector: xyz per node (Float32Array, model units already scaled) or null. */
  setDeformation(vector, scale = 1) {
    this.deform = vector;
    this.scale = scale;
    this.applyDeformation(1);
  }

  applyDeformation(phase) {
    if (!this.mesh) return;
    const pos = this.mesh.geometry.getAttribute('position');
    const v = this.deform;
    const tris = this.info.tris;
    const s = this.scale * phase;
    if (!v || s === 0) { this.deformedPositions = null; pos.array.set(this.basePositions); }
    else {
      const out = this.deformedPositions ?? new Float32Array(this.basePositions.length);
      for (let i = 0; i < tris.length; i++) { const n = tris[i]; for (let c = 0; c < 3; c++) out[3 * i + c] = this.basePositions[3 * i + c] + s * v[3 * n + c]; }
      this.deformedPositions = out;
      pos.array.set(out);
    }
    pos.needsUpdate = true;
    this.smoothNormals();
    // Edges and wireframe follow (from the node positions).
    const pn = this.info.positions;
    const at = (n, c) => pn[3 * n + c] + (v && s ? s * v[3 * n + c] : 0);
    const e = this.edges.geometry.getAttribute('position');
    for (let i = 0; i < this.info.edges.length; i++) { const n = this.info.edges[i]; for (let c = 0; c < 3; c++) e.array[3 * i + c] = at(n, c); }
    e.needsUpdate = true;
    const w = this.wire.geometry.getAttribute('position');
    for (let t = 0; t < tris.length / 3; t++) for (const [k, [a, b]] of [[0, 1], [1, 2], [2, 0]].entries()) { for (let c = 0; c < 3; c++) { w.array[18 * t + 6 * k + c] = at(tris[3 * t + a], c); w.array[18 * t + 6 * k + 3 + c] = at(tris[3 * t + b], c); } }
    w.needsUpdate = true;
    if (this.hiddenBodies.size) this.paintFaces();
    if (this.undeformed) this.undeformed.visible = Boolean(v && s);
    this.render();
  }

  /** The undeformed outline as thin lines while a deformed shape shows. */
  showUndeformed(on) {
    if (this.undeformed) { this.overlay.remove(this.undeformed); this.undeformed = null; }
    if (!on || !this.edges) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.baseEdges.slice(), 3));
    this.undeformed = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7d8590, transparent: true, opacity: 0.5 }));
    this.overlay.add(this.undeformed);
    this.render();
  }

  /** Animation: frames [{ vector, values }] or a sine of the current deformation. */
  animate({ frames = null, fps = 18, onFrame = null, onPhase = null } = {}) {
    this.stopAnimation();
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (frames?.length) {
        const i = Math.floor(t * fps) % frames.length;
        const f = frames[i];
        if (f.vector) this.deform = f.vector;
        if (f.values && this.contour) { this.contour.nodeValues = f.values; this.paintFaces(); }
        this.applyDeformation(1);
        onFrame?.(i, f);
      } else {
        const phase = Math.sin(t * 2 * Math.PI * 0.8);
        this.applyDeformation(phase);
        onPhase?.(phase);
      }
      this.anim = requestAnimationFrame(tick);
    };
    tick();
  }

  stopAnimation() { if (this.anim) cancelAnimationFrame(this.anim); this.anim = null; }
  get animating() { return Boolean(this.anim); }

  clearResultObjects() {
    for (const o of [...this.overlay.children]) { this.overlay.remove(o); o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }
    this.undeformed = null;
    this.labels.innerHTML = '';
  }

  /** Section planes of a field sampled on a grid: [{ axis, at, u, v, uRange, vRange, size:[nu,nv], values }]. */
  setSlices(planes, { min, max, colormap = 'rainbow', bands = 0, opacity = 0.85 } = {}) {
    for (const o of this.overlay.children.filter((x) => x.userData.slice)) { this.overlay.remove(o); o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); }
    if (!planes) { this.render(); return; }
    for (const pl of planes) {
      const [nu, nv] = pl.size;
      const data = new Uint8Array(nu * nv * 4);
      const c = new THREE.Color();
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const v = pl.values[j * nu + i];
        const k = 4 * (j * nu + i);
        if (!Number.isFinite(v)) { data[k + 3] = 0; continue; }
        mapColor((v - min) / (max - min || 1), colormap, bands, c);
        data[k] = c.r * 255; data[k + 1] = c.g * 255; data[k + 2] = c.b * 255; data[k + 3] = 255;
      }
      const tex = new THREE.DataTexture(data, nu, nv, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const w = pl.uRange[1] - pl.uRange[0];
      const h = pl.vRange[1] - pl.vRange[0];
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
      const center = [0, 0, 0];
      center[pl.axis] = pl.at;
      center[pl.u] = (pl.uRange[0] + pl.uRange[1]) / 2;
      center[pl.v] = (pl.vRange[0] + pl.vRange[1]) / 2;
      m.position.set(...center);
      // The plane's local x → axis u, local y → axis v.
      const ex = new THREE.Vector3(); ex.setComponent(pl.u, 1);
      const ey = new THREE.Vector3(); ey.setComponent(pl.v, 1);
      const ez = new THREE.Vector3().crossVectors(ex, ey);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
      m.userData.slice = true;
      m.renderOrder = 5;
      this.overlay.add(m);
    }
    this.render();
  }

  /** Streamlines: points xyz (model units), speed per point, offsets of each line. */
  setStreamlines(lines, { min, max, colormap = 'rainbow' } = {}) {
    for (const o of this.overlay.children.filter((x) => x.userData.stream)) { this.overlay.remove(o); o.geometry.dispose(); o.material.dispose(); }
    if (!lines) { this.render(); return; }
    const { points, speed, offsets } = lines;
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    for (let l = 0; l + 1 < offsets.length; l++) {
      for (let i = offsets[l]; i + 1 < offsets[l + 1]; i++) {
        for (const j of [i, i + 1]) { pos.push(points[3 * j], points[3 * j + 1], points[3 * j + 2]); mapColor((speed[j] - min) / (max - min || 1), colormap, 0, c); col.push(c.r, c.g, c.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
    ls.userData.stream = true;
    this.overlay.add(ls);
    this.render();
  }

  /** A triangle surface (flat xyz ×3, model units), e.g. the optimised topology. */
  setSurface(tris, { color = '#3d8bd9', opacity = 1 } = {}) {
    for (const o of this.overlay.children.filter((x) => x.userData.surface)) { this.overlay.remove(o); o.geometry.dispose(); o.material.dispose(); }
    if (!tris?.length) { this.render(); return; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(tris instanceof Float32Array ? tris : new Float32Array(tris), 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide, transparent: opacity < 1, opacity }));
    m.userData.surface = true;
    this.overlay.add(m);
    this.render();
  }

  /**
   * Arrows at points: [{ p:[x,y,z], d:[dx,dy,dz], m? }], drawn as one instanced mesh. length: the
   * longest arrow (model units); `colour` by magnitude through the colormap, or one colour.
   */
  setArrows(list, length = 10, { colormap = null, color = '#e5484d', scaleByMagnitude = true } = {}) {
    for (const o of this.overlay.children.filter((x) => x.userData.arrow)) { this.overlay.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
    const items = (list ?? []).filter((a) => a.d && (a.d[0] || a.d[1] || a.d[2]));
    this.arrowCount = items.length;
    if (!items.length) { this.render(); return; }
    const mags = items.map((a) => a.m ?? Math.hypot(...a.d));
    const mmax = Math.max(...mags) || 1;
    const mmin = Math.min(...mags);
    // A unit arrow along +Y: shaft and head merged.
    // Centred on its point (half in front, half behind), so arrows into a surface still show.
    const shaft = new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8).translate(0, -0.15, 0);
    const head = new THREE.ConeGeometry(0.14, 0.3, 12).translate(0, 0.35, 0);
    const geo = mergeGeometries([shaft, head]);
    shaft.dispose(); head.dispose();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.05 });
    const inst = new THREE.InstancedMesh(geo, mat, items.length);
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    items.forEach((a, i) => {
      const dir = new THREE.Vector3(...a.d).normalize();
      q.setFromUnitVectors(up, dir);
      const l = length * (scaleByMagnitude ? 0.25 + 0.75 * (mags[i] / mmax) : 1);
      m4.compose(new THREE.Vector3(...a.p), q, new THREE.Vector3(l, l, l));
      inst.setMatrixAt(i, m4);
      if (colormap) mapColor((mags[i] - mmin) / (mmax - mmin || 1), colormap, 0, c); else c.set(color);
      inst.setColorAt(i, c);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.userData.arrow = true;
    inst.renderOrder = 6;
    this.overlay.add(inst);
    this.render();
  }

  /**
   * A section plane: { normal, point, clip, cap } — clip hides the model on the normal's side, cap:
   * the cut triangles { positions, values } coloured with the current contour (or the body colour).
   * null removes it.
   */
  setSection(section) {
    for (const o of this.overlay.children.filter((x) => x.userData.cap)) { this.overlay.remove(o); o.geometry.dispose(); o.material.dispose(); }
    this.section = section;
    const planes = section?.clip ? [new THREE.Plane(new THREE.Vector3(...section.normal).negate(), section.normal[0] * section.point[0] + section.normal[1] * section.point[1] + section.normal[2] * section.point[2])] : [];
    this.renderer.localClippingEnabled = planes.length > 0;
    for (const m of [this.mesh?.material, this.edges?.material, this.wire?.material, this.undeformed?.material]) { if (m) { m.clippingPlanes = planes; m.needsUpdate = true; } }
    for (const o of this.overlay.children) if (o.userData.stream || o.userData.surface) { o.material.clippingPlanes = planes; o.material.needsUpdate = true; }
    const cap = section?.cap;
    if (cap?.count) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(cap.positions, 3));
      const col = new Float32Array(cap.positions.length);
      const cc = new THREE.Color();
      for (let i = 0; i < cap.positions.length / 3; i++) {
        if (cap.values && this.contour) mapColor(this.contour.norm(cap.values[i]), this.contour.colormap, this.contour.bands, cc);
        else cc.set(section.color ?? '#b9c2cc');
        col[3 * i] = cc.r; col[3 * i + 1] = cc.g; col[3 * i + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      m.userData.cap = true;
      m.renderOrder = 4;
      this.overlay.add(m);
    }
    this.render();
  }

  /**
   * The user's lights: [{ type: 'directional' | 'point' | 'spot', position, target, color, intensity, angle,
   * enabled }] in model units. Each shows as a sun (a disc with rays, always facing the camera) at its
   * position, with a dashed line to where it points. With lights of its own the scene's default lighting
   * is dimmed so they show.
   */
  setLights(lights, size = 100, { showGizmos = true } = {}) {
    if (this.userLights) {
      this.scene.remove(this.userLights);
      this.userLights.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      this.userLights = null;
    }
    const on = (lights ?? []).filter((l) => l.enabled !== false);
    this.hemi.intensity = on.length ? 0.55 : 1.25;
    this.key.intensity = on.length ? 0.35 : 1.4;
    this.lightCount = on.length;
    if (!(lights ?? []).length) { this.render(); return; }
    const group = new THREE.Group();
    group.name = 'userLights';
    const tex = sunTexture();
    for (const l of lights) {
      const pos = new THREE.Vector3(...(l.position ?? [0, 0, 100]));
      const target = new THREE.Vector3(...(l.target ?? [0, 0, 0]));
      const color = new THREE.Color(l.color ?? '#fff4d6');
      if (l.enabled !== false) {
        let light;
        if (l.type === 'point') light = new THREE.PointLight(color, l.intensity ?? 1.5, 0, 0);
        else if (l.type === 'spot') light = new THREE.SpotLight(color, (l.intensity ?? 1.5) * 1.5, 0, THREE.MathUtils.degToRad(l.angle ?? 30), 0.3, 0);
        else light = new THREE.DirectionalLight(color, l.intensity ?? 1.5);
        light.position.copy(pos);
        if (light.target) { light.target.position.copy(target); group.add(light.target); }
        group.add(light);
      }
      if (!showGizmos) continue;
      // The sun: always facing the camera, drawn over the model.
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity: l.enabled === false ? 0.35 : 1 }));
      sprite.position.copy(pos);
      const s = 0.2 * size;
      sprite.scale.set(s, s, 1);
      sprite.renderOrder = 8;
      sprite.userData.light = l.id;
      group.add(sprite);
      if (l.type !== 'point') {
        const g = new THREE.BufferGeometry().setFromPoints([pos, target]);
        const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xe08a00, dashSize: 0.03 * size, gapSize: 0.02 * size, transparent: true, opacity: 0.9, depthTest: false }));
        line.computeLineDistances();
        line.renderOrder = 8;
        group.add(line);
      }
    }
    this.userLights = group;
    this.scene.add(group);
    this.render();
  }


  /** Probe markers: small spheres at points (model units), radius r. */
  setMarkers(points, r = 1, color = '#f6a23a') {
    for (const o of this.overlay.children.filter((x) => x.userData.marker)) { this.overlay.remove(o); o.geometry.dispose(); o.material.dispose(); }
    for (const p of points ?? []) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
      m.position.set(...p);
      m.userData.marker = true;
      m.renderOrder = 7;
      this.overlay.add(m);
    }
    this.render();
  }

  /** HTML labels at points: [{ p, text, cls }]. */
  setLabels(list) {
    this.labelList = list ?? [];
    this.placeLabels();
  }

  placeLabels() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.labels.innerHTML = (this.labelList ?? []).map((l) => {
      const v = new THREE.Vector3(...l.p).project(this.camera);
      if (v.z > 1) return '';
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      return `<div class="sv-label ${l.cls ?? ''}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${l.text}</div>`;
    }).join('');
  }

  /** Grid and rulers on or off. */
  setGuides(opts) { this.guides.set(opts); this.render(); }

  render() {
    this.guides?.update();
    this.key.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    if (this.labelList?.length) this.placeLabels();
    this.drawTriad();
  }

  drawTriad() {
    const g = this.triad.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 96, 96);
    const m = new THREE.Matrix4().extractRotation(this.camera.matrixWorldInverse);
    const axes = [['X', [1, 0, 0], '#e5484d'], ['Y', [0, 1, 0], '#30a46c'], ['Z', [0, 0, 1], '#3e63dd']];
    const pts = axes.map(([n, v, c]) => { const p = new THREE.Vector3(...v).applyMatrix4(m); return { n, c, x: 48 + p.x * 32, y: 48 - p.y * 32, z: p.z }; }).sort((a, b) => a.z - b.z);
    for (const p of pts) {
      g.strokeStyle = p.c; g.lineWidth = 3; g.beginPath(); g.moveTo(48, 48); g.lineTo(p.x, p.y); g.stroke();
      g.fillStyle = p.c; g.font = 'bold 13px sans-serif'; g.fillText(p.n, p.x + (p.x >= 48 ? 3 : -11), p.y + (p.y >= 48 ? 12 : -3));
    }
  }

  snapshot(type = 'image/png') { this.render(); return this.renderer.domElement.toDataURL(type); }
}

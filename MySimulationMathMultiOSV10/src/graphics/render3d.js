// 3D axes renderer (Three.js WebGL). One Axes3DView per 3D axes: it owns a
// WebGL canvas; text (tick labels, axis labels, text objects) and the light
// gizmos are drawn by drawOverlay() into the parent's 2D canvas so SVG export
// can reuse them. Node format: core/graphics/PROTOCOL.md.
import * as THREE from 'three';
import { drawTex } from './text.js';
import { rgbCss } from './theme.js';
import { mapColor } from '../../core/graphics/colormaps.js';
import { ticksFor, tickLabels, maxTicksFor } from '../../core/graphics/ticks.js';
import { createGroundGrid, updateGroundGrid } from './grid3d.js';

const DEG = Math.PI / 180;
const isMat = (v) => v && typeof v === 'object' && Array.isArray(v.dims) && v.data != null;
const matData = (v) => (isMat(v) ? v.data : Array.isArray(v) ? v : v == null ? [] : typeof v === 'number' ? [v] : []);
const matDims = (v) => (isMat(v) ? v.dims : Array.isArray(v) ? [1, v.length] : [0, 0]);
const isRgb = (c) => Array.isArray(c) && c.length >= 3 && typeof c[0] === 'number';
const fin = Number.isFinite;

function colormapRows(cm) {
  if (!isMat(cm)) return Array.isArray(cm) && Array.isArray(cm[0]) ? cm : [[0, 0, 0.5], [0, 1, 1], [1, 1, 0], [0.5, 0, 0]];
  const n = cm.dims[0];
  const rows = [];
  for (let r = 0; r < n; r++) rows.push([cm.data[r], cm.data[r + n], cm.data[r + 2 * n]]);
  return rows;
}

// Cheap change key: arrays/matrices are summarised by size + samples.
function summarise(v) {
  const sample = (a) => {
    const n = a.length;
    if (n <= 48) return Array.from(a);
    const step = Math.max(1, Math.floor(n / 32));
    let h = 0;
    for (let i = 0; i < n; i += step) h = (h * 31 + (a[i] === a[i] ? Math.round(a[i] * 1e6) : 7)) | 0;
    return `${n}:${h}:${a[0]}:${a[n - 1]}`;
  };
  return JSON.stringify(v, (k, x) => {
    if (x && typeof x === 'object' && !Array.isArray(x) && Array.isArray(x.dims) && x.data) return `M${x.dims.join('x')}:${sample(x.data)}`;
    if (Array.isArray(x) && x.length > 48 && typeof x[0] === 'number') return sample(x);
    if (typeof x === 'number' && !fin(x)) return String(x);
    return x;
  });
}

// ---------------------------------------------------------------- marker sprites

const spriteCache = new Map();
function markerTexture(shape, filled) {
  const key = `${shape}|${filled}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 64;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
  const r = S * 0.4, m = S / 2;
  g.beginPath();
  const poly = (pts) => { pts.forEach(([x, y], i) => (i ? g.lineTo(m + x * r, m + y * r) : g.moveTo(m + x * r, m + y * r))); g.closePath(); };
  let strokeOnly = false;
  switch (shape) {
    case 's': poly([[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]]); break;
    case 'd': poly([[0, -1], [1, 0], [0, 1], [-1, 0]]); break;
    case '^': poly([[0, -1], [0.95, 0.75], [-0.95, 0.75]]); break;
    case 'v': poly([[0, 1], [0.95, -0.75], [-0.95, -0.75]]); break;
    case '>': poly([[1, 0], [-0.75, 0.95], [-0.75, -0.95]]); break;
    case '<': poly([[-1, 0], [0.75, 0.95], [0.75, -0.95]]); break;
    case 'p': case 'h': {
      const k = shape === 'p' ? 5 : 6; const pts = [];
      for (let i = 0; i < 2 * k; i++) { const a = -Math.PI / 2 + (i * Math.PI) / k; const rr = i % 2 ? (shape === 'p' ? 0.45 : 0.6) : 1; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      poly(pts); break;
    }
    case '+': g.moveTo(m - r, m); g.lineTo(m + r, m); g.moveTo(m, m - r); g.lineTo(m, m + r); strokeOnly = true; break;
    case 'x': g.moveTo(m - r * 0.75, m - r * 0.75); g.lineTo(m + r * 0.75, m + r * 0.75); g.moveTo(m + r * 0.75, m - r * 0.75); g.lineTo(m - r * 0.75, m + r * 0.75); strokeOnly = true; break;
    case '*': for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; g.moveTo(m - Math.cos(a) * r, m - Math.sin(a) * r); g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); } strokeOnly = true; break;
    case '.': g.arc(m, m, r * 0.45, 0, Math.PI * 2); filled = true; break;
    case '_': g.moveTo(m - r, m); g.lineTo(m + r, m); strokeOnly = true; break;
    case '|': g.moveTo(m, m - r); g.lineTo(m, m + r); strokeOnly = true; break;
    default: g.arc(m, m, r, 0, Math.PI * 2);
  }
  if (filled && !strokeOnly) g.fill(); else g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  spriteCache.set(key, tex);
  return tex;
}

const pointsVS = /* glsl */ `
attribute float psize;
attribute vec3 pcolor;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = psize * uScale;
}`;
const pointsFS = /* glsl */ `
uniform sampler2D uMap;
uniform float uAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  if (t.a < 0.08) discard;
  gl_FragColor = vec4(vColor, t.a * uAlpha);
}`;

// ---------------------------------------------------------------- coordinate axes

/** X / Y / Z axis colours (red, green, blue) readable on dark or light backgrounds. */
export function axisPalette(dark) {
  return dark
    ? [[1.0, 0.42, 0.42], [0.37, 0.82, 0.41], [0.36, 0.64, 1.0]]
    : [[0.82, 0.13, 0.13], [0.11, 0.56, 0.2], [0.11, 0.39, 0.85]];
}

/**
 * Screen directions of the world X / Y / Z unit vectors for a camera at
 * azimuth az / elevation el (degrees), as [{ x, y, depth }] with x to the
 * right, y up and depth toward the viewer — the orientation triad.
 */
export function triadDirs(az, el) {
  const a = az * DEG, e = el * DEG;
  const d = [Math.cos(e) * Math.sin(a), -Math.cos(e) * Math.cos(a), Math.sin(e)]; // toward the camera
  const up = [-Math.sin(e) * Math.sin(a), Math.sin(e) * Math.cos(a), Math.cos(e)];
  const right = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]];
  return [0, 1, 2].map((k) => ({ x: right[k], y: up[k], depth: d[k] }));
}

// ---------------------------------------------------------------- view

export class Axes3DView {
  constructor() {
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are used as given (0..1 values)
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.dataRoot = new THREE.Group();
    this.scene.add(this.dataRoot);
    this.boxGroup = new THREE.Group();
    this.scene.add(this.boxGroup);
    this.lightGroup = new THREE.Group();
    this.scene.add(this.lightGroup);
    this.ground = createGroundGrid();
    this.scene.add(this.ground);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.persp = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.camera = this.ortho;
    this.w = 300; this.h = 200; this.dpr = 1;
    this.view = [-37.5, 30];
    this.zoomF = 1;
    this.target = new THREE.Vector3();
    this.ax = null; this.fig = null;
    this.opts = { theme: null, grid: true, gridAtZero: false, lighting: true, defaultLight: null, axesLines: true };
    this.axisGroup = new THREE.Group();
    this.scene.add(this.axisGroup);
    this.axisTips = [];
    this.cache = new Map(); // child id → { key, obj }
    this.axesKey = '';
    this.optKey = '';
    this.clipPlanes = [];
    this.half = new THREE.Vector3(0.5, 0.5, 0.5);
    this.boxViewKey = '';
  }

  // ------------------------------------------------------------ sizes / options

  setSize(cssW, cssH, dpr = 1) {
    this.w = Math.max(1, Math.round(cssW)); this.h = Math.max(1, Math.round(cssH)); this.dpr = dpr || 1;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    if (this.canvas.style) { this.canvas.style.width = `${this.w}px`; this.canvas.style.height = `${this.h}px`; }
    this.boxViewKey = '';
  }

  setOptions(o = {}) {
    Object.assign(this.opts, o);
    const key = summarise({ t: this.opts.theme && [this.opts.theme.name, this.opts.theme.fg, this.opts.theme.axes, this.opts.theme.grid, this.opts.theme.dark], l: !!this.opts.lighting });
    if (key !== this.optKey) { this.optKey = key; this.clearCache(); if (this.ax) this.rebuild(); }
    this.boxViewKey = '';
  }

  get theme() {
    return this.opts.theme || { dark: false, figure: [1, 1, 1], axes: [1, 1, 1], fg: [0.15, 0.15, 0.15], muted: [0.4, 0.4, 0.4], grid: [0.15, 0.15, 0.15], gridAlpha: 0.15, gridMajorAlpha: 0.3, accent: [0, 0.45, 0.85] };
  }

  // Colour of a prop honouring `auto` (theme) defaults.
  colorProp(node, name, themeColor) {
    const v = node.props[name];
    if (themeColor && node.auto && node.auto.includes(name)) return themeColor;
    return v;
  }

  // ------------------------------------------------------------ axes / transforms

  setAxes(axNode, figNode) {
    const firstTime = !this.ax || this.ax.id !== axNode.id;
    this.ax = axNode; this.fig = figNode;
    const p = axNode.props;
    if (firstTime || summarise(p.View) !== this.lastViewProp) {
      this.lastViewProp = summarise(p.View);
      if (Array.isArray(p.View)) this.view = [p.View[0], p.View[1]];
    }
    this.camera = p.Projection === 'perspective' ? this.persp : this.ortho;
    this.computeTransform();
    const akey = summarise({ X: p.XLim, Y: p.YLim, Z: p.ZLim, xs: p.XScale, ys: p.YScale, zs: p.ZScale, xd: p.XDir, yd: p.YDir, zd: p.ZDir, pba: p.PlotBoxAspectRatio, dar: p.DataAspectRatio, darm: p.DataAspectRatioMode, c: p.CLim, cm: p.Colormap });
    if (akey !== this.axesKey) { this.axesKey = akey; this.clearCache(); }
    this.rebuild();
    this.boxViewKey = '';
  }

  computeTransform() {
    const p = this.ax.props;
    const lim = (L, scale) => {
      let a = Array.isArray(L) ? L[0] : 0, b = Array.isArray(L) ? L[1] : 1;
      if (scale === 'log') { a = Math.log10(a > 0 ? a : 1e-300); b = Math.log10(b > 0 ? b : 1); }
      if (!(b > a)) b = a + 1;
      return [a, b];
    };
    this.flim = [lim(p.XLim, p.XScale), lim(p.YLim, p.YScale), lim(p.ZLim, p.ZScale)];
    this.logs = [p.XScale === 'log', p.YScale === 'log', p.ZScale === 'log'];
    this.rev = [p.XDir === 'reverse', p.YDir === 'reverse', p.ZDir === 'reverse'];
    let size;
    const ranges = this.flim.map(([a, b]) => b - a);
    if (p.DataAspectRatioMode === 'manual' && Array.isArray(p.DataAspectRatio)) size = ranges.map((r, i) => r / (p.DataAspectRatio[i] || 1));
    else size = Array.isArray(p.PlotBoxAspectRatio) && p.PlotBoxAspectRatio.length >= 3 ? p.PlotBoxAspectRatio.slice(0, 3) : [1, 1, 1];
    const mx = Math.max(...size.map((s) => (s > 0 && fin(s) ? s : 0)), 1e-12);
    this.size = size.map((s) => (s > 0 && fin(s) ? s / mx : 1));
    this.half.set(this.size[0] / 2, this.size[1] / 2, this.size[2] / 2);
    this.radius = this.half.length();
    const planes = [];
    const eps = 1e-4;
    planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), this.half.x + eps), new THREE.Plane(new THREE.Vector3(-1, 0, 0), this.half.x + eps));
    planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), this.half.y + eps), new THREE.Plane(new THREE.Vector3(0, -1, 0), this.half.y + eps));
    planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), this.half.z + eps), new THREE.Plane(new THREE.Vector3(0, 0, -1), this.half.z + eps));
    this.clipPlanes = planes;
  }

  // data value on axis k → world coordinate
  w1(k, v) {
    const [a, b] = this.flim[k];
    let f = this.logs[k] ? (v > 0 ? Math.log10(v) : NaN) : v;
    let u = (f - a) / (b - a);
    if (this.rev[k]) u = 1 - u;
    return (u - 0.5) * this.size[k];
  }
  d1(k, w) {
    const [a, b] = this.flim[k];
    let u = w / this.size[k] + 0.5;
    if (this.rev[k]) u = 1 - u;
    const f = a + u * (b - a);
    return this.logs[k] ? 10 ** f : f;
  }
  /** A data-space direction → unit world direction (axis scaling and direction applied). */
  dirToWorld(p) {
    const v = new THREE.Vector3(...[0, 1, 2].map((k) => { const [a, b] = this.flim[k]; const x = fin(p[k]) ? p[k] : 0; return (x / (b - a || 1)) * this.size[k] * (this.rev[k] ? -1 : 1); }));
    return v.lengthSq() > 0 ? v.normalize() : new THREE.Vector3(0, 0, 1);
  }
  /** A world direction → data-space direction scaled so its largest component is 1. */
  dirToData(w) {
    const d = [0, 1, 2].map((k) => { const [a, b] = this.flim[k]; return (w.getComponent(k) / this.size[k]) * (b - a) * (this.rev[k] ? -1 : 1); });
    const m = Math.max(...d.map(Math.abs)) || 1;
    return d.map((x) => Number((x / m).toPrecision(4)));
  }
  toWorld(x, y, z) { return [this.w1(0, x), this.w1(1, y), this.w1(2, z)]; }
  toData(v) { return [this.d1(0, v.x), this.d1(1, v.y), this.d1(2, v.z)]; }

  dataFrame() {
    const c = [this.d1(0, 0), this.d1(1, 0), this.d1(2, 0)];
    const half = [0, 1, 2].map((k) => Math.abs(this.d1(k, this.half.getComponent(k)) - this.d1(k, -this.half.getComponent(k))) / 2);
    return { center: c, half };
  }

  // ------------------------------------------------------------ camera

  getView() { return this.view.slice(); }
  setView(az, el) { this.view = [az, Math.max(-90, Math.min(90, el))]; this.boxViewKey = ''; }
  resetView() {
    const v = this.ax && this.ax.props.View;
    this.view = Array.isArray(v) ? [v[0], v[1]] : [-37.5, 30];
    this.zoomF = 1; this.target.set(0, 0, 0); this.boxViewKey = '';
  }
  orbit(dx, dy) { this.setView(this.view[0] - dx * 0.4, this.view[1] + dy * 0.4); }

  viewDir() {
    const az = this.view[0] * DEG, el = this.view[1] * DEG;
    return new THREE.Vector3(Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el));
  }
  viewUp() {
    const az = this.view[0] * DEG, el = this.view[1] * DEG;
    return new THREE.Vector3(-Math.sin(el) * Math.sin(az), Math.sin(el) * Math.cos(az), Math.cos(el));
  }

  updateCamera() {
    const R = this.radius || 0.87;
    const aspect = this.w / this.h;
    const dir = this.viewDir();
    const up = this.viewUp();
    const fit = R * 1.12;
    if (this.camera === this.ortho) {
      let hh = fit, hw = fit;
      if (aspect >= 1) hw = hh * aspect; else hh = hw / aspect;
      hh /= this.zoomF; hw /= this.zoomF;
      Object.assign(this.ortho, { left: -hw, right: hw, top: hh, bottom: -hh, near: 0.01, far: R * 40 });
      this.ortho.position.copy(this.target).addScaledVector(dir, R * 12);
    } else {
      const fov = 30;
      let dist = fit / Math.sin((fov / 2) * DEG);
      if (aspect < 1) dist /= aspect;
      dist /= this.zoomF;
      Object.assign(this.persp, { fov, aspect, near: Math.max(0.001, dist * 0.02), far: dist * 60 });
      this.persp.position.copy(this.target).addScaledVector(dir, dist);
    }
    this.camera.up.copy(up);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  unitsPerPx() {
    if (this.camera === this.ortho) return (this.ortho.right - this.ortho.left) / this.w;
    const dist = this.persp.position.distanceTo(this.target);
    return (2 * dist * Math.tan((this.persp.fov / 2) * DEG)) / this.h;
  }

  pan(dx, dy) {
    this.updateCamera();
    const u = this.unitsPerPx();
    const right = new THREE.Vector3().crossVectors(this.viewUp(), this.viewDir()).normalize(); // screen right
    this.target.addScaledVector(right, -dx * u).addScaledVector(this.viewUp(), dy * u);
    this.boxViewKey = '';
  }

  zoom(factor, cssX = this.w / 2, cssY = this.h / 2) {
    this.updateCamera();
    const u = this.unitsPerPx();
    const ox = (cssX - this.w / 2) * u, oy = -(cssY - this.h / 2) * u;
    this.zoomF = Math.max(0.05, Math.min(200, this.zoomF * factor));
    const k = 1 - 1 / factor;
    const right = new THREE.Vector3().crossVectors(this.viewUp(), this.viewDir()).normalize();
    this.target.addScaledVector(right, ox * k).addScaledVector(this.viewUp(), oy * k);
    this.boxViewKey = '';
  }

  project(pt) {
    const [x, y, z] = pt;
    return this.projectWorld(new THREE.Vector3(...this.toWorld(x, y, z)));
  }
  projectWorld(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.w, y: (1 - p.y) / 2 * this.h, z: p.z };
  }

  // ------------------------------------------------------------ build children

  clearCache() {
    for (const { obj } of this.cache.values()) { this.dataRoot.remove(obj); disposeTree(obj); }
    this.cache.clear();
  }

  rebuild() {
    const seen = new Set();
    this.lightNodes = [];
    this.textNodes = [];
    const kids = this.ax.children || [];
    for (const ch of kids) this.collectSpecial(ch);
    for (const ch of kids) {
      if (ch.type === 'light' || ch.type === 'text') continue;
      seen.add(ch.id);
      const key = summarise({ t: ch.type, p: ch.props, c: ch.children, a: ch.auto });
      const old = this.cache.get(ch.id);
      if (old && old.key === key) continue;
      if (old) { this.dataRoot.remove(old.obj); disposeTree(old.obj); }
      let obj = null;
      try { obj = this.buildNode(ch); } catch (e) { if (typeof console !== 'undefined') console.warn('render3d', ch.type, e); }
      if (!obj) obj = new THREE.Group();
      obj.userData.id = ch.id;
      this.dataRoot.add(obj);
      this.cache.set(ch.id, { key, obj });
    }
    for (const [id, { obj }] of [...this.cache]) if (!seen.has(id)) { this.dataRoot.remove(obj); disposeTree(obj); this.cache.delete(id); }
  }

  collectSpecial(n) {
    if (n.type === 'light') this.lightNodes.push(n);
    else if (n.type === 'text') this.textNodes.push(n);
    else if (n.type === 'hggroup') for (const c of n.children || []) this.collectSpecial(c);
  }

  cmapRows() { return colormapRows(this.ax.props.Colormap); }
  clim() { const c = this.ax.props.CLim; return Array.isArray(c) ? c : [0, 1]; }

  buildNode(n) {
    if (n.props && n.props.Visible === false) return null;
    switch (n.type) {
      case 'surface': return this.buildSurface(n);
      case 'patch': return this.buildPatch(n);
      case 'line': case 'animatedline': return this.buildLine(n);
      case 'scatter': return this.buildScatter(n);
      case 'quiver': return this.buildQuiver(n);
      case 'contour': return this.buildContour(n);
      case 'stem': return this.buildStem(n);
      case 'hggroup': {
        const g = new THREE.Group();
        for (const c of n.children || []) { if (c.type === 'light' || c.type === 'text') continue; const o = this.buildNode(c); if (o) { o.userData.id = c.id; g.add(o); } }
        return g;
      }
      default: return null;
    }
  }

  lit(n) { return !!this.opts.lighting && n.props.FaceLighting !== 'none'; }

  faceMaterial(n, { vertexColors = false, color = null, alpha = 1, quadNormals = false }) {
    const p = n.props;
    const common = { side: THREE.DoubleSide, vertexColors, clippingPlanes: this.clipPlanes, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    if (alpha < 1) Object.assign(common, { transparent: true, opacity: alpha, depthWrite: false });
    if (color) common.color = new THREE.Color(color[0], color[1], color[2]);
    if (this.lit(n)) {
      const spec = fin(p.SpecularStrength) ? p.SpecularStrength : 0.9;
      const diff = fin(p.DiffuseStrength) ? p.DiffuseStrength : 0.8;
      const m = new THREE.MeshPhongMaterial({
        ...common,
        flatShading: p.FaceLighting === 'flat' && !quadNormals,
        shininess: fin(p.SpecularExponent) ? p.SpecularExponent * 2 : 20,
        specular: new THREE.Color().setScalar(Math.min(1, spec * 0.3)),
      });
      if (!color) m.color = new THREE.Color().setScalar(Math.min(1.2, diff / 0.8));
      return m;
    }
    return new THREE.MeshBasicMaterial(common);
  }

  colorAt(C, m, n, i, j, mapping) {
    const mn = m * n;
    if (C.length >= 3 * mn && mn > 0) { const k = i + j * m; return [C[k], C[k + mn], C[k + 2 * mn]]; }
    const v = C[i + j * m];
    return this.mapValue(v, mapping);
  }
  mapValue(v, mapping) {
    const cmap = this.cmapRows();
    if (!fin(v)) return null;
    if (mapping === 'direct') { const k = Math.max(0, Math.min(cmap.length - 1, Math.floor(v) - 1)); return cmap[k]; }
    const [lo, hi] = this.clim();
    return mapColor(cmap, v, lo, hi);
  }

  buildSurface(n) {
    const p = n.props;
    const Z = matData(p.ZData);
    const [m, nn] = matDims(p.ZData);
    if (!(m >= 1 && nn >= 1)) return null;
    const X = matData(p.XData), Y = matData(p.YData);
    const xAt = X.length === m * nn && m > 1 ? (i, j) => X[i + j * m] : X.length >= nn ? (i, j) => X[j] : (i, j) => j + 1;
    const yAt = Y.length === m * nn && nn > 1 ? (i, j) => Y[i + j * m] : Y.length >= m ? (i) => Y[i] : (i) => i + 1;
    let C = matData(p.CData);
    if (!C.length) C = Z;
    const mapping = p.CDataMapping || 'scaled';
    const N = m * nn;
    const pos = new Float32Array(N * 3);
    const ok = new Uint8Array(N);
    for (let j = 0; j < nn; j++) for (let i = 0; i < m; i++) {
      const k = i + j * m;
      const w = this.toWorld(xAt(i, j), yAt(i, j), Z[k]);
      ok[k] = fin(w[0]) && fin(w[1]) && fin(w[2]) ? 1 : 0;
      pos[3 * k] = w[0]; pos[3 * k + 1] = w[1]; pos[3 * k + 2] = w[2];
    }
    const group = new THREE.Group();
    const fc = p.FaceColor;
    const alpha = typeof p.FaceAlpha === 'number' ? p.FaceAlpha : 1;
    if (fc !== 'none' && m > 1 && nn > 1) {
      if (fc === 'flat') {
        const tri = [];
        const col = [];
        const nor = [];
        const P = (v) => new THREE.Vector3(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
        for (let j = 0; j < nn - 1; j++) for (let i = 0; i < m - 1; i++) {
          const a = i + j * m, b = i + 1 + j * m, c = i + 1 + (j + 1) * m, d = i + (j + 1) * m;
          if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
          const cc = this.colorAt(C, m, nn, i, j, mapping);
          if (!cc) continue;
          // one normal per quad (cross product of the diagonals) so flat lighting shades whole faces
          const qn = new THREE.Vector3().crossVectors(P(c).sub(P(a)), P(d).sub(P(b))).normalize();
          for (const v of [a, b, c, a, c, d]) { tri.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); col.push(cc[0], cc[1], cc[2]); nor.push(qn.x, qn.y, qn.z); }
        }
        if (tri.length) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
          g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
          const mesh = new THREE.Mesh(g, this.faceMaterial(n, { vertexColors: true, alpha, quadNormals: true }));
          mesh.userData = { id: n.id, type: 'surface', pick: true };
          group.add(mesh);
        }
      } else {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const idx = [];
        for (let j = 0; j < nn - 1; j++) for (let i = 0; i < m - 1; i++) {
          const a = i + j * m, b = i + 1 + j * m, c = i + 1 + (j + 1) * m, d = i + (j + 1) * m;
          if (ok[a] && ok[b] && ok[c] && ok[d]) idx.push(a, b, c, a, c, d);
        }
        g.setIndex(idx);
        let mat;
        if (isRgb(fc)) mat = this.faceMaterial(n, { color: fc, alpha });
        else {
          const col = new Float32Array(N * 3);
          for (let j = 0; j < nn; j++) for (let i = 0; i < m; i++) {
            const k = i + j * m; const cc = this.colorAt(C, m, nn, i, j, mapping) || [0.5, 0.5, 0.5];
            col[3 * k] = cc[0]; col[3 * k + 1] = cc[1]; col[3 * k + 2] = cc[2];
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          mat = this.faceMaterial(n, { vertexColors: true, alpha });
        }
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, mat);
        mesh.userData = { id: n.id, type: 'surface', pick: true };
        group.add(mesh);
      }
    }
    // edges
    const ec = p.EdgeColor;
    if (ec !== 'none' && p.LineStyle !== 'none') {
      const seg = [], col = [];
      const style = p.MeshStyle || 'both';
      const push = (a, ia, ja, b, ib, jb) => {
        if (!(ok[a] && ok[b])) return;
        seg.push(pos[3 * a], pos[3 * a + 1], pos[3 * a + 2], pos[3 * b], pos[3 * b + 1], pos[3 * b + 2]);
        if (!isRgb(ec)) {
          const ca = this.colorAt(C, m, nn, ia, ja, mapping) || [0, 0, 0];
          const cb = ec === 'interp' ? this.colorAt(C, m, nn, ib, jb, mapping) || ca : ca;
          col.push(...ca, ...cb);
        }
      };
      for (let j = 0; j < nn; j++) for (let i = 0; i < m; i++) {
        const a = i + j * m;
        if (i < m - 1 && style !== 'row') push(a, i, j, a + 1, i + 1, j);
        if (j < nn - 1 && style !== 'column') push(a, i, j, a + m, i, j + 1);
      }
      if (seg.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
        const ea = typeof p.EdgeAlpha === 'number' ? p.EdgeAlpha : 1;
        const opt = { clippingPlanes: this.clipPlanes, transparent: ea < 1, opacity: ea };
        if (col.length) { g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); opt.vertexColors = true; } else opt.color = new THREE.Color(...ec.slice(0, 3));
        group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial(opt)));
      }
    }
    if (p.Marker && p.Marker !== 'none') {
      const pts = [];
      for (let k = 0; k < N; k++) if (ok[k]) pts.push(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]);
      const mc = isRgb(p.MarkerEdgeColor) ? p.MarkerEdgeColor : isRgb(ec) ? ec : [0, 0, 0];
      group.add(this.makePoints(pts, null, null, mc, (p.MarkerSize || 6) * 1.6, p.Marker, isRgb(p.MarkerFaceColor)));
    }
    return group;
  }

  buildPatch(n) {
    const p = n.props;
    const V = matData(p.Vertices), [nv, vd] = matDims(p.Vertices);
    const F = matData(p.Faces), [nf, fk] = matDims(p.Faces);
    if (!nv || !nf) return null;
    const vert = (k) => this.toWorld(V[k], V[k + nv], vd >= 3 ? V[k + 2 * nv] : 0);
    const W = []; for (let k = 0; k < nv; k++) W.push(vert(k));
    const C = matData(p.FaceVertexCData), [nc, ck] = matDims(p.FaceVertexCData);
    const mapping = p.CDataMapping || 'scaled';
    const cOf = (row) => {
      if (!nc) return null;
      const r = nc === 1 ? 0 : row;
      if (ck >= 3) return [C[r], C[r + nc], C[r + 2 * nc]];
      return this.mapValue(C[r], mapping);
    };
    const perVertex = nc === nv && nc > 1;
    const faces = [];
    for (let f = 0; f < nf; f++) {
      const ids = [];
      for (let c = 0; c < fk; c++) { const v = F[f + c * nf]; if (fin(v) && v >= 1 && v <= nv) ids.push(v - 1); }
      if (ids.length >= 2) faces.push(ids);
    }
    const group = new THREE.Group();
    const fc = p.FaceColor;
    const alpha = typeof p.FaceAlpha === 'number' ? p.FaceAlpha : 1;
    if (fc !== 'none') {
      const pos = [], col = [];
      faces.forEach((ids, f) => {
        if (ids.length < 3) return;
        const flatC = fc === 'flat' ? (perVertex ? cOf(ids[0]) : cOf(f)) : null;
        for (let t = 1; t < ids.length - 1; t++) {
          for (const v of [ids[0], ids[t], ids[t + 1]]) {
            const w = W[v]; pos.push(w[0], w[1], w[2]);
            if (!isRgb(fc)) { const cc = (fc === 'flat' ? flatC : perVertex ? cOf(v) : cOf(f)) || [0.5, 0.5, 0.5]; col.push(cc[0], cc[1], cc[2]); }
          }
        }
      });
      if (pos.length && pos.every(fin)) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, this.faceMaterial(n, col.length ? { vertexColors: true, alpha } : { color: fc, alpha }));
        mesh.userData = { id: n.id, type: 'patch', pick: true };
        group.add(mesh);
      }
    }
    const ec = p.EdgeColor;
    if (ec !== 'none' && p.LineStyle !== 'none') {
      const seg = [], col = [];
      faces.forEach((ids, f) => {
        const L = ids.length;
        for (let t = 0; t < (L === 2 ? 1 : L); t++) {
          const a = ids[t], b = ids[(t + 1) % L];
          const wa = W[a], wb = W[b];
          if (![...wa, ...wb].every(fin)) continue;
          seg.push(...wa, ...wb);
          if (!isRgb(ec)) {
            const ca = (perVertex ? cOf(a) : cOf(f)) || [0, 0, 0];
            const cb = ec === 'interp' && perVertex ? cOf(b) || ca : ca;
            col.push(...ca, ...cb);
          }
        }
      });
      if (seg.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
        const opt = { clippingPlanes: this.clipPlanes };
        if (col.length) { g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); opt.vertexColors = true; } else opt.color = new THREE.Color(...ec.slice(0, 3));
        const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial(opt));
        ls.userData = { id: n.id, type: 'patch', pick: fc === 'none' };
        group.add(ls);
      }
    }
    if (p.Marker && p.Marker !== 'none') {
      const pts = W.flat();
      const mc = isRgb(p.MarkerEdgeColor) ? p.MarkerEdgeColor : isRgb(ec) ? ec : [0, 0, 0];
      group.add(this.makePoints(pts.filter(fin).length === pts.length ? pts : [], null, null, mc, (p.MarkerSize || 6) * 1.6, p.Marker, isRgb(p.MarkerFaceColor)));
    }
    return group;
  }

  lineMaterial(color, style, width, alpha = 1) {
    const base = { color: new THREE.Color(color[0], color[1], color[2]), clippingPlanes: this.clipPlanes, linewidth: width || 1, transparent: alpha < 1, opacity: alpha };
    if (style === '--') return new THREE.LineDashedMaterial({ ...base, dashSize: 0.035, gapSize: 0.022 });
    if (style === ':') return new THREE.LineDashedMaterial({ ...base, dashSize: 0.006, gapSize: 0.016 });
    if (style === '-.') return new THREE.LineDashedMaterial({ ...base, dashSize: 0.03, gapSize: 0.02 });
    return new THREE.LineBasicMaterial(base);
  }

  buildLine(n) {
    const p = n.props;
    const X = matData(p.XData), Y = matData(p.YData), Z = matData(p.ZData);
    const N = Math.max(X.length, Y.length);
    const color = isRgb(p.Color) ? p.Color : this.theme.fg;
    const group = new THREE.Group();
    const runs = [];
    let cur = [];
    const all = [];
    for (let k = 0; k < N; k++) {
      const x = X.length ? X[k] : k + 1, y = Y[k], z = Z.length ? Z[k] : 0;
      const w = this.toWorld(x, y, z);
      if (w.every(fin)) { cur.push(...w); all.push(w); } else { if (cur.length) runs.push(cur); cur = []; all.push(null); }
    }
    if (cur.length) runs.push(cur);
    if (p.LineStyle !== 'none') {
      for (const r of runs) {
        if (r.length < 6) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(r, 3));
        const line = new THREE.Line(g, this.lineMaterial(color, p.LineStyle || '-', p.LineWidth));
        if (line.material.isLineDashedMaterial) line.computeLineDistances();
        line.userData = { id: n.id, type: n.type, pick: true };
        group.add(line);
      }
    }
    if (p.Marker && p.Marker !== 'none') {
      let pts = [];
      const idx = Array.isArray(p.MarkerIndices) && p.MarkerIndices.length ? p.MarkerIndices.map((i) => i - 1) : all.map((_, i) => i);
      for (const i of idx) if (all[i] && this.insideBox(all[i])) pts.push(...all[i]);
      const edge = isRgb(p.MarkerEdgeColor) ? p.MarkerEdgeColor : color;
      const face = isRgb(p.MarkerFaceColor) ? p.MarkerFaceColor : null;
      const pt = this.makePoints(pts, null, null, face || edge, (p.MarkerSize || 6) * 1.6, p.Marker, !!face);
      pt.userData = { id: n.id, type: n.type, pick: true };
      group.add(pt);
    }
    return group;
  }

  insideBox(w) {
    const e = 1e-6;
    return Math.abs(w[0]) <= this.half.x + e && Math.abs(w[1]) <= this.half.y + e && Math.abs(w[2]) <= this.half.z + e;
  }

  makePoints(pos, colors, sizes, uniformColor, uniformSize, shape, filled, alpha = 1) {
    const N = pos.length / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const col = colors || new Float32Array(N * 3).map((_, i) => uniformColor[i % 3]);
    g.setAttribute('pcolor', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('psize', new THREE.Float32BufferAttribute(sizes || new Float32Array(N).fill(uniformSize), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: pointsVS, fragmentShader: pointsFS, transparent: true, depthWrite: alpha >= 1,
      uniforms: { uMap: { value: markerTexture(shape === 'none' ? 'o' : shape, filled) }, uScale: { value: this.dpr }, uAlpha: { value: alpha } },
    });
    const pts = new THREE.Points(g, mat);
    pts.userData.points = true;
    return pts;
  }

  buildScatter(n) {
    const p = n.props;
    const X = matData(p.XData), Y = matData(p.YData), Z = matData(p.ZData);
    const N = Math.max(X.length, Y.length);
    const S = matData(p.SizeData);
    const C = matData(p.CData), [cm, cn] = matDims(p.CData);
    const def = this.theme.fg;
    const colorOf = (k) => {
      if (C.length === 3 && !(cm === N && cn === 1) && !(cm === 1 && cn === N)) return [C[0], C[1], C[2]];
      if (cn === 3 && cm === N) return [C[k], C[k + N], C[k + 2 * N]];
      if (C.length === N) return this.mapValue(C[k], 'scaled') || def;
      return isRgb(p.Color) ? p.Color : def;
    };
    const face = p.MarkerFaceColor, edge = p.MarkerEdgeColor;
    const filled = face === 'flat' || face === 'auto' || isRgb(face);
    const pos = [], col = [], siz = [];
    for (let k = 0; k < N; k++) {
      const w = this.toWorld(X[k], Y[k], Z.length ? Z[k] : 0);
      if (!w.every(fin) || !this.insideBox(w)) continue;
      pos.push(...w);
      let c;
      if (filled) c = isRgb(face) ? face : colorOf(k);
      else c = isRgb(edge) ? edge : colorOf(k);
      col.push(c[0], c[1], c[2]);
      const area = S.length === N ? S[k] : S.length ? S[0] : 36;
      siz.push(Math.sqrt(Math.max(1, area)) * 1.33 * 1.25);
    }
    const alpha = typeof p.MarkerFaceAlpha === 'number' && filled ? p.MarkerFaceAlpha : 1;
    const pts = this.makePoints(pos, new Float32Array(col), new Float32Array(siz), null, 8, p.Marker || 'o', filled, alpha);
    pts.userData = { id: n.id, type: 'scatter', pick: true, points: true };
    return pts;
  }

  segmentsFrom(flat, color, width) {
    const seg = [];
    for (let k = 0; k + 5 < flat.length; k += 6) {
      const a = this.toWorld(flat[k], flat[k + 1], flat[k + 2]), b = this.toWorld(flat[k + 3], flat[k + 4], flat[k + 5]);
      if (a.every(fin) && b.every(fin)) seg.push(...a, ...b);
    }
    if (!seg.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    return new THREE.LineSegments(g, this.lineMaterial(color, '-', width));
  }

  buildQuiver(n) {
    const p = n.props;
    const color = isRgb(p.Color) ? p.Color : this.theme.fg;
    const group = new THREE.Group();
    const s = p.Segments ? this.segmentsFrom(matData(p.Segments), color, p.LineWidth) : null;
    if (s) { s.userData = { id: n.id, type: 'quiver', pick: true }; group.add(s); }
    if (p.ShowArrowHead !== false && p.Heads) { const h = this.segmentsFrom(matData(p.Heads), color, p.LineWidth); if (h) group.add(h); }
    return group;
  }

  buildContour(n) {
    const p = n.props;
    const group = new THREE.Group();
    const lines = Array.isArray(p.Lines) ? p.Lines : [];
    const lc = p.LineColor;
    for (const L of lines) {
      const pts = matData(L.points);
      const c = isRgb(lc) ? lc : this.mapValue(L.level, 'scaled') || this.theme.fg;
      const pos = [];
      for (let k = 0; k + 1 < pts.length; k += 2) {
        const w = this.toWorld(pts[k], pts[k + 1], p.Is3D ? L.level : this.d1(2, -this.half.z));
        if (w.every(fin)) pos.push(...w);
      }
      if (pos.length < 6) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const line = new THREE.Line(g, this.lineMaterial(c, p.LineStyle || '-', p.LineWidth));
      if (line.material.isLineDashedMaterial) line.computeLineDistances();
      line.userData = { id: n.id, type: 'contour', pick: true };
      group.add(line);
    }
    return group;
  }

  buildStem(n) {
    const p = n.props;
    const X = matData(p.XData), Y = matData(p.YData), Z = matData(p.ZData);
    const color = isRgb(p.Color) ? p.Color : this.theme.fg;
    const base = fin(p.BaseValue) ? p.BaseValue : 0;
    const seg = [], tips = [];
    const N = Math.max(X.length, Y.length, Z.length);
    for (let k = 0; k < N; k++) {
      const x = X.length ? X[k] : k + 1, y = Y.length ? Y[k] : 0, z = Z.length ? Z[k] : 0;
      const a = this.toWorld(x, y, base), b = this.toWorld(x, y, z);
      if (a.every(fin) && b.every(fin)) { seg.push(...a, ...b); tips.push(...b); }
    }
    const group = new THREE.Group();
    if (seg.length && p.LineStyle !== 'none') {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      group.add(new THREE.LineSegments(g, this.lineMaterial(color, p.LineStyle || '-', p.LineWidth)));
    }
    const mk = p.Marker && p.Marker !== 'none' ? p.Marker : null;
    if (mk && tips.length) {
      const face = isRgb(p.MarkerFaceColor) ? p.MarkerFaceColor : null;
      const pt = this.makePoints(tips, null, null, face || color, (p.MarkerSize || 6) * 1.6, mk, !!face);
      pt.userData = { id: n.id, type: 'stem', pick: true, points: true };
      group.add(pt);
    }
    return group;
  }

  // ------------------------------------------------------------ box, grid, lights

  buildBox() {
    disposeChildren(this.boxGroup);
    const p = this.ax.props;
    const th = this.theme;
    const d = this.viewDir();
    const h = this.half;
    // the back planes are the ones facing away from the camera
    const bx = d.x >= 0 ? -h.x : h.x, by = d.y >= 0 ? -h.y : h.y, bz = d.z >= 0 ? -h.z : h.z;
    const fx = -bx, fy = -by;
    this.back = { bx, by, bz, fx, fy };
    const axesColor = this.colorProp(this.ax, 'Color', th.axes);
    // panes
    if (axesColor !== 'none' && isRgb(axesColor) && p.Visible !== false) {
      const gridOn = !!this.opts.grid;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...axesColor), side: THREE.DoubleSide, transparent: gridOn, opacity: gridOn ? 0.5 : 1, depthWrite: !gridOn, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 });
      const pane = (corners) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        const mesh = new THREE.Mesh(g, mat);
        mesh.renderOrder = gridOn ? 60 : -10;
        this.boxGroup.add(mesh);
      };
      pane([[bx, -h.y, -h.z], [bx, h.y, -h.z], [bx, h.y, h.z], [bx, -h.y, h.z]]);
      pane([[-h.x, by, -h.z], [h.x, by, -h.z], [h.x, by, h.z], [-h.x, by, h.z]]);
      if (!gridOn) pane([[-h.x, -h.y, bz], [h.x, -h.y, bz], [h.x, h.y, bz], [-h.x, h.y, bz]]);
    }
    if (p.Visible === false) return;
    const fg = th.fg;
    const axC = (k) => { const nm = ['XColor', 'YColor', 'ZColor'][k]; const c = this.colorProp(this.ax, nm, fg); return isRgb(c) ? c : fg; };
    // grid lines on the back planes
    const gcol = this.colorProp(this.ax, 'GridColor', th.grid);
    const galpha = this.ax.auto && this.ax.auto.includes('GridColor') ? th.gridMajorAlpha : (fin(p.GridAlpha) ? p.GridAlpha : 0.15);
    const gseg = [];
    const T = this.tickInfo();
    if (p.XGrid) for (const v of T[0].ticks) { const x = this.w1(0, v); gseg.push(x, -h.y, bz, x, h.y, bz, x, by, -h.z, x, by, h.z); }
    if (p.YGrid) for (const v of T[1].ticks) { const y = this.w1(1, v); gseg.push(-h.x, y, bz, h.x, y, bz, bx, y, -h.z, bx, y, h.z); }
    if (p.ZGrid) for (const v of T[2].ticks) { const z = this.w1(2, v); gseg.push(-h.x, by, z, h.x, by, z, bx, -h.y, z, bx, h.y, z); }
    if (gseg.length && gseg.every(fin)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(gseg, 3));
      const gc = isRgb(gcol) ? gcol : th.grid;
      const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(...gc), transparent: true, opacity: Math.min(1, galpha * 1.6), depthWrite: false }));
      ls.renderOrder = 61;
      this.boxGroup.add(ls);
    }
    // box edges / axis lines
    const edges = [];
    const E = this.labelEdges();
    if (p.Box) {
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) edges.push([0, [-h.x, sy * h.y, sz * h.z], [h.x, sy * h.y, sz * h.z]]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) edges.push([1, [sx * h.x, -h.y, sz * h.z], [sx * h.x, h.y, sz * h.z]]);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) edges.push([2, [sx * h.x, sy * h.y, -h.z], [sx * h.x, sy * h.y, h.z]]);
    } else {
      edges.push([0, E[0].a, E[0].b], [1, E[1].a, E[1].b], [2, E[2].a, E[2].b]);
    }
    // tick marks (into the box along the label edges)
    const tl = 0.018 * this.radius;
    for (let k = 0; k < 3; k++) {
      const e = E[k];
      for (const v of T[k].ticks) {
        const c = e.a.slice(); c[k] = this.w1(k, v);
        const q = c.map((x, i) => x - e.out[i] * tl);
        edges.push([k, c, q]);
      }
    }
    for (let k = 0; k < 3; k++) {
      const seg = [];
      for (const [kk, a, b] of edges) if (kk === k && [...a, ...b].every(fin)) seg.push(...a, ...b);
      if (!seg.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(...axC(k)) }));
      ls.renderOrder = 62;
      this.boxGroup.add(ls);
    }
  }

  /**
   * Coordinate axes: X / Y / Z lines through the data origin (1 on log axes),
   * running past the box with a cone arrowhead at the positive end. The tips
   * are kept for the labels drawn by drawOverlay.
   */
  buildAxisLines() {
    disposeChildren(this.axisGroup);
    this.axisTips = [];
    if (!this.opts.axesLines || !this.ax || this.ax.props.Visible === false) return;
    const pal = axisPalette(!!this.theme.dark);
    const R = this.radius || 0.87;
    const h = [this.half.x, this.half.y, this.half.z];
    const o = [0, 1, 2].map((k) => { const w = this.w1(k, this.logs[k] ? 1 : 0); return fin(w) ? Math.max(-h[k] * 4, Math.min(h[k] * 4, w)) : -h[k]; });
    for (let k = 0; k < 3; k++) {
      const sign = this.rev[k] ? -1 : 1;               // world direction of increasing data
      const hi = Math.max(h[k], o[k]) + 0.28 * R, lo = Math.min(-h[k], o[k]) - 0.06 * R;
      const a = o.slice(), b = o.slice();
      a[k] = sign > 0 ? lo : hi; b[k] = sign > 0 ? hi : lo;
      const col = new THREE.Color(...pal[k]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b], 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false }));
      line.renderOrder = 64;
      this.axisGroup.add(line);
      const len = 0.075 * R;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(len * 0.32, len, 14), new THREE.MeshBasicMaterial({ color: col }));
      const dir = new THREE.Vector3(...[0, 1, 2].map((i) => (i === k ? sign : 0)));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cone.position.set(b[0], b[1], b[2]).addScaledVector(dir, -len / 2);
      cone.renderOrder = 64;
      this.axisGroup.add(cone);
      this.axisTips.push({ k, world: new THREE.Vector3(b[0], b[1], b[2]).addScaledVector(dir, len * 0.9), color: pal[k] });
    }
  }

  /** The label of axis k for the axis-line tip: the user's XLabel / YLabel / ZLabel, else X / Y / Z. */
  axisName(k) {
    const lab = this.ax && this.ax.props[['XLabel', 'YLabel', 'ZLabel'][k]];
    const s = lab && lab.props && lab.props.Visible !== false ? lab.props.String : null;
    const text = Array.isArray(s) ? s.join(' ') : s == null ? '' : String(s);
    return text.trim() ? { text, interpreter: lab.props.Interpreter, user: true } : { text: 'XYZ'[k], interpreter: 'none', user: false };
  }

  // The edge each axis is labelled on, and its outward direction (world).
  labelEdges() {
    const h = this.half;
    const d = this.viewDir();
    const sz = d.z >= 0 ? -1 : 1; // labels at the bottom when looking from above
    const fy = d.y >= 0 ? 1 : -1, fx = d.x >= 0 ? 1 : -1;
    const ex = { a: [-h.x, fy * h.y, sz * h.z], b: [h.x, fy * h.y, sz * h.z], out: [0, fy, sz] };
    const ey = { a: [fx * h.x, -h.y, sz * h.z], b: [fx * h.x, h.y, sz * h.z], out: [fx, 0, sz] };
    // z: the vertical edge furthest left on screen
    this.updateCamera();
    let best = null;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const s = this.projectWorld(new THREE.Vector3(sx * h.x, sy * h.y, 0));
      if (!best || s.x < best.s.x - 1e-6) best = { s, sx, sy };
    }
    const ez = { a: [best.sx * h.x, best.sy * h.y, -h.z], b: [best.sx * h.x, best.sy * h.y, h.z], out: [best.sx, best.sy, 0] };
    const norm = (e) => { const l = Math.hypot(...e.out) || 1; e.out = e.out.map((x) => x / l); return e; };
    return [norm(ex), norm(ey), norm(ez)];
  }

  tickInfo() {
    const p = this.ax.props;
    const out = [];
    for (let k = 0; k < 3; k++) {
      const L = ['XLim', 'YLim', 'ZLim'][k], TT = ['XTick', 'YTick', 'ZTick'][k], TL = ['XTickLabel', 'YTickLabel', 'ZTickLabel'][k];
      const S = ['XScale', 'YScale', 'ZScale'][k];
      const lim = Array.isArray(p[L]) ? p[L] : [0, 1];
      let ticks = Array.isArray(p[TT]) ? matData(p[TT]) : isMat(p[TT]) ? matData(p[TT]) : null;
      const fromProps = !!(ticks && ticks.length) && this.zoomF === 1;
      if (!fromProps) ticks = ticksFor(lim[0], lim[1], p[S] || 'linear', maxTicksFor(Math.min(this.w, this.h) * 0.45, true));
      ticks = ticks.filter((v) => v >= Math.min(...lim) - 1e-9 * Math.abs(lim[1] - lim[0]) && v <= Math.max(...lim) + 1e-9 * Math.abs(lim[1] - lim[0]));
      let labels, exponent = 0;
      const given = p[TL];
      if (fromProps && Array.isArray(given) && given.length === ticks.length) labels = given.map(String);
      else { const r = tickLabels(ticks, p[S] || 'linear'); labels = r.labels; exponent = r.exponent; }
      out.push({ ticks, labels, exponent });
    }
    return out;
  }

  buildLights() {
    disposeChildren(this.lightGroup);
    if (!this.opts.lighting) return;
    const amb = new THREE.AmbientLight(0xffffff, Math.PI * 0.35);
    this.lightGroup.add(amb);
    const c0 = [0, 0, 0].map((_, k) => this.d1(k, 0));
    const R = this.radius;
    const list = [];
    const own = (this.lightNodes || []).filter((l) => l.props.Visible !== false);
    if (own.length) {
      for (const l of own) list.push({ key: l.id, position: l.props.Position || [1, 0, 1], style: l.props.Style || 'infinite', headlight: !!l.props.Headlight, color: isRgb(l.props.Color) ? l.props.Color : [1, 1, 1], intensity: 1 });
    } else if (this.opts.defaultLight !== false) {
      const dl = this.opts.defaultLight || {};
      const fr = this.dataFrame();
      const st = dl.style || 'infinite';
      // infinite: a direction (data units); local: a point
      const pos = dl.position || (st === 'local' ? [fr.center[0] - fr.half[0] * 2, fr.center[1] - fr.half[1] * 3, fr.center[2] + fr.half[2] * 4] : [-fr.half[0] * 2, -fr.half[1] * 3, fr.half[2] * 4]);
      list.push({ key: 'default', position: pos, style: st, headlight: !!dl.headlight, color: dl.color || [1, 1, 1], intensity: fin(dl.intensity) ? dl.intensity : 1 });
    }
    const center = new THREE.Vector3(...this.toWorld(...c0));
    for (const L of list) {
      const col = new THREE.Color(...L.color);
      const I = Math.PI * 0.62 * L.intensity;
      let wpos;
      if (L.headlight) {
        this.updateCamera();
        wpos = this.camera.position.clone();
      } else if (L.style === 'local') {
        const w = new THREE.Vector3(...this.toWorld(...L.position));
        wpos = [w.x, w.y, w.z].every(fin) ? w : new THREE.Vector3(1, -1, 1);
      } else {
        // an infinite light's Position is the direction it shines from (data units)
        const d = this.dirToWorld(L.position);
        wpos = center.clone().addScaledVector(d, R * 4);
      }
      let light;
      if (L.style === 'local' && !L.headlight) {
        light = new THREE.PointLight(col, I * 1.2, 0, 0);
        light.position.copy(wpos);
      } else {
        light = new THREE.DirectionalLight(col, I);
        light.position.copy(wpos);
        light.target.position.copy(L.headlight ? this.target : center);
        this.lightGroup.add(light.target);
      }
      this.lightGroup.add(light);
    }
  }

  updateGround() {
    const g = this.ground;
    g.visible = !!this.opts.grid && this.ax && this.ax.props.Visible !== false;
    if (!g.visible) return;
    const th = this.theme;
    const u = g.material.uniforms;
    const z0 = this.opts.gridAtZero ? this.w1(2, this.logs[2] ? 1 : 0) : -this.half.z;
    u.uZ0.value = fin(z0) ? z0 : -this.half.z;
    // data(f-space) = offset + scale * world
    for (let k = 0; k < 2; k++) {
      const [a, b] = this.flim[k];
      const s = ((b - a) / this.size[k]) * (this.rev[k] ? -1 : 1);
      const off = (a + b) / 2;
      if (k === 0) { u.uScale.value.x = s; u.uOffset.value.x = off; } else { u.uScale.value.y = s; u.uOffset.value.y = off; }
    }
    const span = Math.max(this.flim[0][1] - this.flim[0][0], this.flim[1][1] - this.flim[1][0]);
    u.uBase.value = 10 ** Math.floor(Math.log10(span > 0 ? span : 1)) / 125; // 5^k multiples hit 0.2, 1, 5 × 10^n
    u.uMinPx.value = 10 * this.dpr;
    u.uColor.value.setRGB(...th.grid);
    u.uAxisColor.value.setRGB(...(th.accent || [0.3, 0.8, 0.95]));
    u.uAxisOn.value = this.opts.axesLines ? 0 : 1; // the coordinate axes replace the floor's axis lines
    u.uMinorAlpha.value = Math.min(0.5, (th.gridAlpha || 0.12) * 1.6);
    u.uMajorAlpha.value = Math.min(0.8, (th.gridMajorAlpha || 0.28) * 1.7);
    u.uTarget.value.copy(this.target);
    const R = this.radius;
    const vis = this.camera === this.ortho ? (this.ortho.top - this.ortho.bottom) : R * 2 / this.zoomF;
    u.uFadeStart.value = Math.max(R * 1.2, vis * 0.9);
    u.uFadeEnd.value = Math.max(R * 6, vis * 6);
    updateGroundGrid(g, this.camera, this.w * this.dpr, this.h * this.dpr);
  }

  // ------------------------------------------------------------ render

  render() {
    if (!this.ax) { this.renderer.clear(); return; }
    this.updateCamera();
    const vk = summarise([this.view, this.w, this.h, this.zoomF, this.target.toArray(), this.axesKey, this.optKey, this.ax.props.Box, this.ax.props.XGrid, this.ax.props.YGrid, this.ax.props.ZGrid, this.opts.grid, this.ax.props.XTick, this.ax.props.YTick, this.ax.props.ZTick, !!this.opts.axesLines, this.ax.props.XLabel, this.ax.props.YLabel, this.ax.props.ZLabel]);
    if (vk !== this.boxViewKey) { this.boxViewKey = vk; this.buildBox(); this.buildAxisLines(); }
    this.buildLights();
    for (const o of this.dataRoot.children) o.traverse((c) => { if (c.material && c.material.uniforms && c.material.uniforms.uScale) c.material.uniforms.uScale.value = this.dpr; });
    this.updateGround();
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ overlay (text)

  drawOverlay(g, ox = 0, oy = 0, theme = this.theme) {
    if (!this.ax) return;
    this.updateCamera();
    const p = this.ax.props;
    const th = theme || this.theme;
    const fs = p.FontSize || 10;
    const size = fs * 1.2;
    g.save();
    g.translate(ox, oy);
    const visible = p.Visible !== false;
    if (visible) {
      const E = this.labelEdges();
      const T = this.tickInfo();
      const boxC = this.projectWorld(new THREE.Vector3(0, 0, 0));
      for (let k = 0; k < 3; k++) {
        const nm = ['XColor', 'YColor', 'ZColor'][k];
        const col = this.colorProp(this.ax, nm, th.fg);
        const css = rgbCss(isRgb(col) ? col : th.fg);
        const e = E[k];
        const off = 0.06 * this.radius;
        let far = 0;
        const place = (world) => {
          const s = this.projectWorld(world);
          const s0 = this.projectWorld(new THREE.Vector3(...e.a.map((x, i) => (i === k ? world.getComponent(k) : x))));
          let dx = s.x - s0.x, dy = s.y - s0.y;
          const l = Math.hypot(dx, dy);
          if (l < 1e-6) { dx = s.x - boxC.x; dy = s.y - boxC.y; } else { dx /= l; dy /= l; }
          return { s, dx, dy };
        };
        const ea = this.projectWorld(new THREE.Vector3(...e.a)), eb = this.projectWorld(new THREE.Vector3(...e.b));
        const endOn = Math.hypot(eb.x - ea.x, eb.y - ea.y) < Math.max(24, size * 2.5 * Math.max(1, T[k].ticks.length - 1) * 0.6);
        if (!endOn) T[k].ticks.forEach((v, i) => {
          const c = e.a.slice(); c[k] = this.w1(k, v);
          const w = new THREE.Vector3(...c.map((x, j) => x + e.out[j] * off));
          if (![w.x, w.y, w.z].every(fin)) return;
          const { s, dx, dy } = place(w);
          const align = dx < -0.35 ? 'right' : dx > 0.35 ? 'left' : 'center';
          const valign = dy > 0.35 ? 'top' : dy < -0.35 ? 'bottom' : 'middle';
          const r = drawTex(g, T[k].labels[i] || '', s.x, s.y, { size, color: css, align, valign });
          far = Math.max(far, align === 'center' ? r.height : r.width);
        });
        if (T[k].exponent && !endOn) {
          const w = new THREE.Vector3(...e.b.map((x, j) => x + e.out[j] * off * 2.5));
          const s = this.projectWorld(w);
          drawTex(g, `\\times10^{${T[k].exponent}}`, s.x, s.y, { size, color: css, align: 'center', valign: 'middle' });
        }
        // axis label
        const lab = p[['XLabel', 'YLabel', 'ZLabel'][k]];
        if (!this.opts.axesLines && lab && lab.props && lab.props.String && lab.props.Visible !== false && String(lab.props.String).length) {
          const mid = e.a.map((x, i) => (x + e.b[i]) / 2);
          const w = new THREE.Vector3(...mid.map((x, j) => x + e.out[j] * off));
          const { s, dx, dy } = place(w);
          const dist = far + 8;
          const lc = this.colorProp(lab, 'Color', th.fg);
          const lsz = (lab.props.FontSize || fs * 1.1) * 1.2;
          if (k === 2) drawTex(g, lab.props.String, s.x + dx * dist - lsz * 0.2, s.y, { size: lsz, color: rgbCss(isRgb(lc) ? lc : th.fg), align: 'center', valign: 'bottom', rotation: 90, interpreter: lab.props.Interpreter });
          else {
            // rotate x/y labels along their edge direction (screen)
            const sa = this.projectWorld(new THREE.Vector3(...e.a)), sb = this.projectWorld(new THREE.Vector3(...e.b));
            let ang = (-Math.atan2(sb.y - sa.y, sb.x - sa.x) * 180) / Math.PI;
            if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
            drawTex(g, lab.props.String, s.x + dx * (dist + lsz * 0.6), s.y + dy * (dist + lsz * 0.6), { size: lsz, color: rgbCss(isRgb(lc) ? lc : th.fg), align: 'center', valign: 'middle', rotation: ang, interpreter: lab.props.Interpreter });
          }
        }
      }
    }
    // text objects
    for (const t of this.textNodes || []) {
      const tp = t.props;
      if (tp.Visible === false || tp.String == null) continue;
      const pos = Array.isArray(tp.Position) ? tp.Position : [0, 0, 0];
      const s = this.project([pos[0], pos[1], pos[2] || 0]);
      if (!fin(s.x) || !fin(s.y)) continue;
      const col = this.colorProp(t, 'Color', th.fg);
      const ha = tp.HorizontalAlignment || 'left';
      const va = tp.VerticalAlignment || 'middle';
      drawTex(g, tp.String, s.x, s.y, {
        size: (tp.FontSize || 10) * 1.2, color: rgbCss(isRgb(col) ? col : th.fg), align: ha, valign: va,
        rotation: tp.Rotation || 0, interpreter: tp.Interpreter, bold: tp.FontWeight === 'bold', italic: tp.FontAngle === 'italic',
        background: isRgb(tp.BackgroundColor) ? rgbCss(tp.BackgroundColor) : null, edge: isRgb(tp.EdgeColor) ? rgbCss(tp.EdgeColor) : null, margin: tp.Margin,
      });
    }
    // coordinate axes: billboard labels at the positive tips, and the orientation triad
    if (visible && this.opts.axesLines) {
      const halo = rgbCss(th.axes || (th.dark ? [0.07, 0.09, 0.11] : [1, 1, 1]), 0.78);
      for (const t of this.axisTips) {
        const s = this.projectWorld(t.world);
        if (![s.x, s.y].every(fin)) continue;
        const name = this.axisName(t.k);
        const base = this.projectWorld(t.world.clone().addScaledVector(new THREE.Vector3(...[0, 1, 2].map((i) => (i === t.k ? (this.rev[t.k] ? -1 : 1) : 0))), -0.5 * (this.radius || 0.87)));
        if (Math.hypot(s.x - base.x, s.y - base.y) < 14) continue;
        const c = this.projectWorld(t.world.clone().addScaledVector(new THREE.Vector3(...[0, 1, 2].map((i) => (i === t.k ? (this.rev[t.k] ? -1 : 1) : 0))), -0.1));
        let dx = s.x - c.x, dy = s.y - c.y;
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        drawTex(g, name.text, s.x + dx * 10, s.y + dy * 10, {
          size: name.user ? size * 1.05 : size * 1.15, bold: !name.user, color: rgbCss(t.color), interpreter: name.interpreter,
          align: dx < -0.35 ? 'right' : dx > 0.35 ? 'left' : 'center', valign: dy > 0.35 ? 'top' : dy < -0.35 ? 'bottom' : 'middle', background: halo, margin: 2,
        });
      }
      this.drawTriad(g, 40, this.h - 40, 26, th);
    }
    g.restore();
  }

  /** CAD-style orientation triad centred at (cx, cy): the X / Y / Z directions as the camera sees them. */
  drawTriad(g, cx, cy, L, th) {
    const pal = axisPalette(!!th.dark);
    const dirs = triadDirs(this.view[0], this.view[1]).map((d, k) => ({ ...d, k, sign: this.rev[k] ? -1 : 1 }));
    g.save();
    g.fillStyle = rgbCss(th.axes || [0.5, 0.5, 0.5], 0.55);
    g.strokeStyle = rgbCss(th.fg || [0.5, 0.5, 0.5], 0.25); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, L + 12, 0, Math.PI * 2); g.fill(); g.stroke();
    for (const d of dirs.slice().sort((a, b) => a.depth * a.sign - b.depth * b.sign)) {
      const ex = cx + d.x * d.sign * L, ey = cy - d.y * d.sign * L;
      const col = rgbCss(d.depth * d.sign < -0.2 ? pal[d.k].map((v) => v * 0.6 + 0.2) : pal[d.k]);
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
      g.beginPath(); g.arc(ex, ey, 2.6, 0, Math.PI * 2); g.fill();
      const lx = cx + d.x * d.sign * (L + 8), ly = cy - d.y * d.sign * (L + 8);
      drawTex(g, 'XYZ'[d.k], lx, ly, { size: 11, bold: true, color: col, align: 'center', valign: 'middle', interpreter: 'none' });
    }
    g.beginPath(); g.fillStyle = rgbCss(th.fg || [0.5, 0.5, 0.5], 0.8); g.arc(cx, cy, 2, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // ------------------------------------------------------------ picking / light drag

  ray(cssX, cssY) {
    this.updateCamera();
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((cssX / this.w) * 2 - 1, -(cssY / this.h) * 2 + 1), this.camera);
    return rc;
  }

  pick(cssX, cssY) {
    if (!this.ax) return null;
    const rc = this.ray(cssX, cssY);
    rc.params.Line.threshold = this.unitsPerPx() * 5;
    rc.params.Points.threshold = this.unitsPerPx() * 6;
    const targets = [];
    this.dataRoot.traverse((o) => { if (o.userData && o.userData.pick) targets.push(o); });
    const hits = rc.intersectObjects(targets, false).filter((h) => this.insideBox(h.point.toArray()));
    if (!hits.length) return null;
    const h = hits[0];
    let pt = h.point;
    if (h.object.isPoints && h.index != null) {
      const a = h.object.geometry.attributes.position;
      pt = new THREE.Vector3(a.getX(h.index), a.getY(h.index), a.getZ(h.index));
    } else if (h.object.isLine && h.index != null) {
      const a = h.object.geometry.attributes.position;
      const p0 = new THREE.Vector3(a.getX(h.index), a.getY(h.index), a.getZ(h.index));
      const p1 = new THREE.Vector3(a.getX(h.index + 1), a.getY(h.index + 1), a.getZ(h.index + 1));
      pt = h.point.distanceTo(p0) <= h.point.distanceTo(p1) ? p0 : p1;
    }
    let id = h.object.userData.id;
    let o = h.object;
    while (id == null && o.parent) { o = o.parent; id = o.userData.id; }
    return { point: this.toData(pt), id, type: h.object.userData.type || null };
  }

  dispose() {
    this.clearCache();
    disposeChildren(this.boxGroup);
    disposeChildren(this.lightGroup);
    disposeChildren(this.axisGroup);
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch { /* already lost */ }
    this.ax = null;
  }
}

function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
  });
}
function disposeChildren(group) {
  for (const c of [...group.children]) { group.remove(c); disposeTree(c); }
}

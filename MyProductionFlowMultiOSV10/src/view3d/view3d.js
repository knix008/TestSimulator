// The 3D view: a three.js scene of the factory floor. setModel() builds the
// static blocks (rebuilt after each edit, debounced), update(sim) moves the
// dynamic layer every frame, and pointer input picks, selects and drags blocks
// on the floor. World (x, y) metres map to three.js (x, 0, y); up is +Y.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK_TYPES, baseOf, blockBounds, pathPoints, pathLength, pointAlong, portsOf } from '../sim/blocks.js';
import { Kit, labelTexture, concreteTexture, quadGeometry, rectQuad, frameRects } from './kit.js';
import { Builder, buildBlock } from './blocks3d.js';
import { DynamicLayer } from './dynamic.js';
import { gridLevel } from '../editor/grid.js';

const NO_LABEL = new Set(['zone', 'wall', 'label', 'pillar', 'tree', 'door']);
const SNAP = 0.5;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const VIEWS = { iso: [1, 0.9, 1.2], top: [0, 1, 0.0001], front: [0, 0.38, 1], side: [1, 0.38, 0] };
const QUALITY = {
  fast: { ratio: 1, shadowMap: 1024, soft: false },
  balanced: { ratio: 1.5, shadowMap: 2048, soft: true },
  high: { ratio: 2, shadowMap: 4096, soft: true },
};

export class View3D {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.cb = callbacks;
    this.opts = { shadows: true, labels: true, grid: true, quality: 'balanced' };
    this.theme = { dark: false, background: '#e9edf1', accent: '#2563eb' };
    this.kit = new Kit();
    this.model = null;
    this.groups = new Map(); // block id → group
    this.lives = []; // [{ id, fn }]
    this.labels = []; // name sprites
    this.trash = []; // per-build geometries / materials / textures
    this.labelCache = new Map(); // name → { tex, mat, aspect, used }
    this.selection = new Set();
    this.selMeshes = [];
    this.running = undefined;
    this.frames = 0;
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Renderer.
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    const canvas = r.domElement;
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', outline: 'none', touchAction: 'none' });
    canvas.tabIndex = 0;
    host.appendChild(canvas);

    // Scene, camera, lights.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.theme.background);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    this.hemi = new THREE.HemisphereLight(0xeef3ff, 0x8a7f70, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3e2, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0xdfe9ff, 0.45);
    this.scene.add(this.fill, this.fill.target);

    this.floorRoot = new THREE.Group(); this.floorRoot.name = 'floor';
    this.blockRoot = new THREE.Group(); this.blockRoot.name = 'blocks';
    this.linkRoot = new THREE.Group(); this.linkRoot.name = 'links';
    this.scene.add(this.floorRoot, this.linkRoot, this.blockRoot);
    this.dyn = new DynamicLayer(this.scene);

    // Floor, grid and shared overlay materials.
    this.floorTex = concreteTexture();
    this.floorMat = new THREE.MeshStandardMaterial({ color: '#d4d7da', map: this.floorTex, roughness: 0.92, metalness: 0 });
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#c3c8cd', roughness: 1, metalness: 0 });
    this.gridMinorMat = new THREE.LineBasicMaterial({ color: '#7d858d', transparent: true, opacity: 0.22, depthWrite: false });
    this.gridMajorMat = new THREE.LineBasicMaterial({ color: '#69717a', transparent: true, opacity: 0.45, depthWrite: false });
    this.selMat = new THREE.MeshBasicMaterial({ color: this.theme.accent, toneMapped: false, depthWrite: false, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    this.linkMat = new THREE.LineDashedMaterial({ color: '#475569', dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.55, depthWrite: false });
    this.floorKey = '';
    this.floorGeos = [];

    // Pointer input: registered before OrbitControls so a block drag can switch the controls off first.
    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e, false);
    this.onCancel = (e) => this.pointerUp(e, true);
    this.onLeave = () => { if (!this.press) this.setHover(null); };
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);

    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.12, maxPolarAngle: Math.PI / 2 - 0.03, minDistance: 1, maxDistance: 4000, zoomSpeed: 1.1, screenSpacePanning: false });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.requestRender());

    this.view = 'iso';
    this.applyOptions();
    this.buildFloor();
    this.resize();
    this.setView('iso');
    if (typeof ResizeObserver === 'function') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); }
  }

  get canvas() { return this.renderer.domElement; }

  // ───────────────────────── model

  setModel(model) {
    this.model = model;
    if (!this.builtOnce) { this.builtOnce = true; this.rebuild(); return; }
    clearTimeout(this.buildTimer);
    this.buildTimer = setTimeout(() => this.rebuild(), 60);
  }

  rebuild() {
    this.buildTimer = null;
    this.clearBlocks();
    const model = this.model;
    if (!model) { this.buildFloor(); this.requestRender(); return; }
    const B = new Builder(this.kit, this.trash);
    for (const v of this.labelCache.values()) v.used = false;
    for (const b of model.blocks ?? []) {
      const spec = BLOCK_TYPES[b.type];
      if (!spec) continue;
      let built;
      try { built = buildBlock(b, B); } catch (err) { console.warn('[view3d] block', b.type, err); continue; }
      const { group, top, live } = built;
      group.position.set(b.x, 0, b.y);
      if (!spec.path) group.rotation.y = (-(b.rot ?? 0) * Math.PI) / 180;
      group.userData.blockId = b.id;
      this.compact(group);
      if (!NO_LABEL.has(baseOf(b.type)) && b.name) this.addLabel(group, b, top, spec);
      this.blockRoot.add(group);
      this.groups.set(b.id, group);
      if (live) this.lives.push({ id: b.id, fn: live });
    }
    for (const [name, v] of this.labelCache) if (!v.used) { v.tex.dispose(); v.mat.dispose(); this.labelCache.delete(name); }
    this.buildLinks(model);
    this.buildFloor();
    this.refreshSelection();
    this.requestRender();
  }

  clearBlocks() {
    for (const g of this.groups.values()) g.removeFromParent();
    this.groups.clear();
    this.lives = [];
    this.labels = [];
    for (const m of this.selMeshes) m.geometry.dispose();
    this.selMeshes = [];
    for (const x of this.trash) x.dispose?.();
    this.trash = [];
    for (const l of this.linkRoot.children) { l.geometry.dispose(); }
    this.linkRoot.clear();
  }

  /** Merges a block's static meshes by material (fewer draw calls); live parts stay separate. */
  compact(group) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map();
    const isLive = (o) => { for (let p = o; p && p !== group; p = p.parent) if (p.userData.live) return true; return false; };
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.renderOrder !== 0 || isLive(o)) return;
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(o);
    });
    const rel = new THREE.Matrix4();
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        const g = m.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.index) return null;
        rel.multiplyMatrices(inv, m.matrixWorld);
        return g.applyMatrix4(rel);
      });
      if (geos.some((g) => !g)) { geos.forEach((g) => g?.dispose()); continue; }
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow; mesh.receiveShadow = true;
      group.add(mesh);
      this.trash.push(merged);
      for (const m of list) m.removeFromParent();
    }
  }

  addLabel(group, b, top, spec) {
    let entry = this.labelCache.get(b.name);
    if (!entry) {
      const t = labelTexture(b.name);
      const mat = new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false, toneMapped: false });
      entry = { tex: t.tex, mat, aspect: t.aspect, used: true };
      this.labelCache.set(b.name, entry);
    }
    entry.used = true;
    const s = new THREE.Sprite(entry.mat);
    const size = spec.path ? 1 : Math.max(b.w ?? spec.w, b.h ?? spec.h);
    const hgt = Math.max(0.42, Math.min(1.6, size * 0.09));
    s.scale.set(hgt * entry.aspect, hgt, 1);
    s.center.set(0.5, 0);
    s.renderOrder = 10;
    if (spec.path) {
      const pts = pathPoints(b); const q = pointAlong(pts, pathLength(pts) / 2);
      s.position.set(q.x - b.x, top, q.y - b.y);
    } else s.position.set(0, top, 0);
    s.visible = this.opts.labels;
    s.userData.label = true;
    group.add(s);
    this.labels.push(s);
  }

  /** Faint dashed floor lines for flow links (port to port, through the link's bend points). */
  buildLinks(model) {
    const byId = new Map((model.blocks ?? []).map((b) => [b.id, b]));
    const pos = [];
    const y = 0.03;
    for (const l of model.links ?? []) {
      if (l.kind === 'influence') continue;
      const a = byId.get(l.from?.block); const c = byId.get(l.to?.block);
      if (!a || !c) continue;
      let p0; let p1;
      try { const pa = portsOf(a).outs; const pc = portsOf(c).ins; p0 = pa[l.from.port] ?? pa[0]; p1 = pc[l.to.port] ?? pc[0]; } catch { continue; }
      if (!p0 || !p1) continue;
      const pts = [[p0.x, p0.y], ...(l.points ?? []), [p1.x, p1.y]];
      for (let i = 1; i < pts.length; i++) pos.push(pts[i - 1][0], y, pts[i - 1][1], pts[i][0], y, pts[i][1]);
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(g, this.linkMat);
    lines.computeLineDistances();
    lines.renderOrder = 1;
    this.linkRoot.add(lines);
  }

  /** World bounds of the blocks ({ x0, y0, x1, y1 }) or null for an empty model. */
  blockBounds() {
    let bb = null;
    for (const b of this.model?.blocks ?? []) {
      if (!BLOCK_TYPES[b.type]) continue;
      let r;
      try { r = blockBounds(b); } catch { continue; }
      if (!bb) bb = { ...r };
      else { bb.x0 = Math.min(bb.x0, r.x0); bb.y0 = Math.min(bb.y0, r.y0); bb.x1 = Math.max(bb.x1, r.x1); bb.y1 = Math.max(bb.y1, r.y1); }
    }
    return bb;
  }

  /** Floor (settings size, always covering the blocks + margin), outer ground, grid and the sun's shadow box. */
  buildFloor() {
    const s = this.model?.settings ?? {};
    const W = Math.max(1, Number(s.floorWidth) || 60); const D = Math.max(1, Number(s.floorDepth) || 40);
    const bb = this.blockBounds();
    const m = 4;
    // The floor is centred on the origin, as in the 2D editor.
    const x0 = Math.floor(Math.min(-W / 2, bb ? bb.x0 - m : -W / 2)); const z0 = Math.floor(Math.min(-D / 2, bb ? bb.y0 - m : -D / 2));
    const x1 = Math.ceil(Math.max(W / 2, bb ? bb.x1 + m : W / 2)); const z1 = Math.ceil(Math.max(D / 2, bb ? bb.y1 + m : D / 2));
    this.floorRect = { x0, z0, x1, z1 };
    const key = `${x0},${z0},${x1},${z1}`;
    if (key !== this.floorKey) {
      this.floorKey = key;
      for (const g of this.floorGeos) g.dispose();
      this.floorGeos = [];
      if (this.grid) { for (const c of this.grid.children) c.geometry.dispose(); this.grid = null; }
      this.floorRoot.clear();
      const fw = x1 - x0; const fd = z1 - z0; const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
      const own = (g) => { this.floorGeos.push(g); return g; };
      const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2)), this.floorMat);
      floor.position.set(cx, 0, cz); floor.receiveShadow = true;
      this.floorTex.repeat.set(fw / 4, fd / 4);
      this.floorTex.offset.set(x0 / 4, -z0 / 4);
      const R = Math.max(fw, fd);
      const ground = new THREE.Mesh(own(new THREE.CircleGeometry(R * 4, 48).rotateX(-Math.PI / 2)), this.groundMat);
      ground.position.set(cx, -0.03, cz); ground.receiveShadow = true;
      this.groundBox = { cx, cz, half: R * 4 * 0.7 };
      // A kerb around the floor slab.
      const edge = new THREE.Mesh(own(quadGeometry(frameRects(cx, cz, fw + 0.4, fd + 0.4, 0.2).map(rectQuad), 0.001)), this.kit.mat('#8b9096', { rough: 0.9 }));
      // The grid follows the zoom (updateGrid, every frame); it is rebuilt for the new floor.
      this.gridKey = null;
      this.floorRoot.add(ground, floor, edge);
    }
    // Sun and shadow camera around the blocks (sharper than covering the whole floor).
    const sb = bb ? { x0: bb.x0 - 3, z0: bb.y0 - 3, x1: bb.x1 + 3, z1: bb.y1 + 3 } : this.floorRect;
    const cx = (sb.x0 + sb.x1) / 2; const cz = (sb.z0 + sb.z1) / 2;
    const R = Math.max(8, Math.hypot(sb.x1 - sb.x0, sb.z1 - sb.z0) / 2);
    const dir = new THREE.Vector3(-0.45, 1, 0.55).normalize();
    this.sun.position.set(cx + dir.x * R * 2, dir.y * R * 2, cz + dir.z * R * 2);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.5; sc.far = R * 4 + 20;
    sc.updateProjectionMatrix();
    this.fill.position.set(cx + R, R, cz - R);
    this.fill.target.position.set(cx, 0, cz);
  }

  // ───────────────────────── selection

  setSelection(ids) {
    this.selection = new Set(ids ?? []);
    this.refreshSelection();
    this.requestRender();
  }

  refreshSelection() {
    for (const m of this.selMeshes) { m.removeFromParent(); m.geometry.dispose(); }
    this.selMeshes = [];
    if (!this.model) return;
    const byId = new Map(this.model.blocks.map((b) => [b.id, b]));
    for (const id of this.selection) {
      const g = this.groups.get(id); const b = byId.get(id);
      if (!g || !b) continue;
      const spec = BLOCK_TYPES[b.type];
      let cx = 0; let cz = 0; let w; let d;
      if (spec.path) {
        const r = blockBounds(b);
        cx = (r.x0 + r.x1) / 2 - b.x; cz = (r.y0 + r.y1) / 2 - b.y; w = r.x1 - r.x0; d = r.y1 - r.y0;
      } else { w = b.w ?? spec.w; d = b.h ?? spec.h; }
      const pad = 0.3; const t = Math.max(0.1, Math.min(0.3, Math.max(w, d) * 0.02));
      const rects = frameRects(cx, cz, w + pad * 2, d + pad * 2, t);
      // Corner brackets a little thicker so the selection reads from far away.
      const k = Math.min(1.2, (Math.min(w, d) + pad * 2) * 0.25); const x0 = cx - w / 2 - pad; const x1 = cx + w / 2 + pad; const z0 = cz - d / 2 - pad; const z1 = cz + d / 2 + pad; const T = t * 2;
      rects.push([x0, z0, x0 + k, z0 + T], [x0, z0, x0 + T, z0 + k], [x1 - k, z0, x1, z0 + T], [x1 - T, z0, x1, z0 + k], [x0, z1 - T, x0 + k, z1], [x0, z1 - k, x0 + T, z1], [x1 - k, z1 - T, x1, z1], [x1 - T, z1 - k, x1, z1]);
      const mesh = new THREE.Mesh(quadGeometry(rects.map(rectQuad), 0.03), this.selMat);
      mesh.renderOrder = 5;
      mesh.raycast = () => {};
      g.add(mesh);
      this.selMeshes.push(mesh);
    }
  }

  // ───────────────────────── look and options

  setTheme(theme = {}) {
    this.theme = { ...this.theme, ...theme };
    const t = this.theme;
    const bg = new THREE.Color(t.background || (t.dark ? '#1b1f24' : '#e9edf1'));
    this.scene.background = bg;
    const floor = new THREE.Color(t.dark ? '#4a5059' : '#d6d9dc');
    this.floorMat.color.copy(floor);
    this.groundMat.color.copy(bg).lerp(floor, 0.35).multiplyScalar(t.dark ? 0.9 : 0.92);
    this.gridMinorMat.color.set(t.dark ? '#aab4bf' : '#7d858d'); this.gridMinorOpacity = t.dark ? 0.14 : 0.22; this.gridMinorMat.opacity = this.gridMinorOpacity * (this.gridFade ?? 1);
    this.gridMajorMat.color.set(t.dark ? '#c3ccd6' : '#69717a'); this.gridMajorMat.opacity = t.dark ? 0.3 : 0.45;
    this.selMat.color.set(t.accent || '#2563eb');
    this.linkMat.color.set(t.dark ? '#cbd5e1' : '#475569');
    this.hemi.intensity = t.dark ? 1.05 : 1.25;
    this.requestRender();
  }

  setOptions(options = {}) {
    this.opts = { ...this.opts, ...options };
    this.applyOptions();
    this.requestRender();
  }

  applyOptions() {
    const o = this.opts;
    const q = QUALITY[o.quality] ?? QUALITY.balanced;
    const r = this.renderer;
    const type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const shadowChange = r.shadowMap.enabled !== Boolean(o.shadows) || r.shadowMap.type !== type;
    r.shadowMap.enabled = Boolean(o.shadows);
    r.shadowMap.type = type;
    this.sun.castShadow = Boolean(o.shadows);
    this.dyn.setShadows(Boolean(o.shadows));
    if (this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    if (shadowChange) this.scene.traverse((x) => { if (x.material) for (const m of [].concat(x.material)) m.needsUpdate = true; });
    for (const s of this.labels) s.visible = Boolean(o.labels);
    if (this.grid) this.grid.visible = Boolean(o.grid);
    const ratio = Math.min(window.devicePixelRatio || 1, q.ratio);
    if (r.getPixelRatio() !== ratio) { r.setPixelRatio(ratio); this.resize(); }
  }

  // ───────────────────────── camera

  /** Frames the whole model (or the floor when it is empty), keeping the current viewing direction. */
  fit(dirArr) {
    const bb = this.blockBounds();
    const f = this.floorRect;
    const r = bb ? { x0: bb.x0, z0: bb.y0, x1: bb.x1, z1: bb.y1 } : f;
    const cx = (r.x0 + r.x1) / 2; const cz = (r.z0 + r.z1) / 2;
    const radius = Math.max(3, Math.hypot(r.x1 - r.x0, r.z1 - r.z0) / 2 + 1);
    const dir = dirArr ? new THREE.Vector3(...dirArr) : this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(...VIEWS.iso);
    dir.normalize();
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.9;
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx + dir.x * dist, dir.y * dist, cz + dir.z * dist);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.requestRender();
  }

  setView(name) {
    this.view = name;
    if (name === 'free' || !VIEWS[name]) { this.controls.enableRotate = true; this.requestRender(); return; }
    this.controls.enableRotate = true;
    this.fit(VIEWS[name]);
  }

  resize() {
    const w = this.host.clientWidth; const h = this.host.clientHeight;
    if (!w || !h) return;
    if (w === this.size?.[0] && h === this.size?.[1] && this.renderer.getPixelRatio() === this.size?.[2]) return;
    this.size = [w, h, this.renderer.getPixelRatio()];
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  // ───────────────────────── frame

  /** Moves the dynamic layer and live block states; sim = null → not running. */
  update(sim) {
    if (!sim) {
      if (this.running !== false) {
        this.running = false;
        this.dyn.hide();
        for (const l of this.lives) l.fn(null);
        this.requestRender();
      }
      return;
    }
    this.running = true;
    try { this.dyn.update(sim); } catch (err) { if (!this.warned) { this.warned = true; console.warn('[view3d] dynamic', err); } }
    if (this.follow) this.followStep(sim);
    for (const l of this.lives) {
      let st = null;
      try { st = sim.blockState(l.id); } catch { st = null; }
      l.fn(st ?? {});
    }
  }

  /**
   * Follow camera: the view keeps looking at one moving entity (the oldest in the system; the next one when it
   * leaves), moving the camera with it so the viewing angle and distance stay as the user set them.
   */
  setFollow(on) {
    this.follow = on ? { id: null } : null;
    if (on) {
      // Close enough to see the entity (at most 16 m away), keeping the direction the user looks from.
      const dir = this.camera.position.clone().sub(this.controls.target);
      if (dir.length() > 16) this.camera.position.copy(this.controls.target).add(dir.setLength(16));
    }
    this.requestRender();
    return Boolean(this.follow);
  }
  followStep(sim) {
    const views = sim.entityViews();
    if (!views.length) return;
    let v = views.find((x) => x.e.id === this.follow.id);
    if (!v) { v = views.reduce((a, b) => ((b.e.created ?? 0) < (a.e.created ?? 0) ? b : a)); this.follow.id = v.e.id; }
    this.follow.at = [v.x, v.y];
    const t = this.controls.target;
    const k = 0.25; // eased, so jumps between blocks do not jerk the camera
    const dx = (v.x - t.x) * k; const dz = (v.y - t.z) * k;
    t.x += dx; t.z += dz;
    this.camera.position.x += dx; this.camera.position.z += dz;
  }

  /**
   * The 5 × 5 floor grid with a constant on-screen size (src/editor/grid.js): its spacing follows the camera's
   * distance to the point it looks at, so zooming in or out redraws it at the next 5× level instead of the lines
   * crowding together or spreading apart. Minor lines fade in between levels.
   */
  updateGrid() {
    const rect = this.floorRect;
    if (!rect || !this.size) return;
    const dist = Math.max(0.1, this.camera.position.distanceTo(this.controls.target));
    const ppm = this.size[1] / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    let level = gridLevel(ppm, 14);
    // Like the 2D grid it covers the view, not only the floor: the floor plus 150 minor steps around the point
    // looked at (snapped to the major lines), kept on the ground disc; at most ~1200 lines across.
    const area = (lv) => {
      const t = this.controls.target; const half = lv.minor * 150; const g = this.groundBox ?? { cx: 0, cz: 0, half: Infinity };
      const tx = Math.round(t.x / lv.major) * lv.major; const tz = Math.round(t.z / lv.major) * lv.major;
      const clip = (v, c) => Math.max(c - g.half, Math.min(c + g.half, v));
      return { x0: clip(Math.min(rect.x0, tx - half), g.cx), x1: clip(Math.max(rect.x1, tx + half), g.cx), z0: clip(Math.min(rect.z0, tz - half), g.cz), z1: clip(Math.max(rect.z1, tz + half), g.cz) };
    };
    let box = area(level);
    while (Math.max(box.x1 - box.x0, box.z1 - box.z0) / level.minor > 1200) { level = { ...level, minor: level.major, major: level.major * 5, fade: 1 }; box = area(level); }
    this.gridFade = level.fade;
    this.gridMinorMat.opacity = (this.gridMinorOpacity ?? 0.22) * level.fade;
    this.gridMinorMat.visible = level.fade > 0.01;
    const key = `${level.minor}|${box.x0},${box.x1},${box.z0},${box.z1}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    this.gridLevel = level;
    if (this.grid) { this.floorRoot.remove(this.grid); for (const c of this.grid.children) c.geometry.dispose(); }
    const minor = []; const major = []; const y = 0.002; const step = level.minor;
    const { x0, z0, x1, z1 } = box;
    for (let i = Math.ceil(x0 / step), n = Math.floor(x1 / step); i <= n; i++) (i % 5 === 0 ? major : minor).push(i * step, y, z0, i * step, y, z1);
    for (let i = Math.ceil(z0 / step), n = Math.floor(z1 / step); i <= n; i++) (i % 5 === 0 ? major : minor).push(x0, y, i * step, x1, y, i * step);
    const lineGeo = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
    this.grid = new THREE.Group();
    this.grid.name = 'grid';
    this.grid.add(new THREE.LineSegments(lineGeo(minor), this.gridMinorMat), new THREE.LineSegments(lineGeo(major), this.gridMajorMat));
    this.grid.visible = Boolean(this.opts.grid);
    this.floorRoot.add(this.grid);
  }

  render() {
    this.frames++;
    this.controls.update();
    this.updateGrid();
    this.renderer.render(this.scene, this.camera);
  }

  /** Renders soon unless the app's own loop renders first (keeps controls and edits responsive without a loop). */
  requestRender() {
    if (this.rafPending || this.disposed) return;
    const f = this.frames;
    this.rafPending = requestAnimationFrame(() => {
      this.rafPending = requestAnimationFrame(() => {
        this.rafPending = 0;
        if (this.frames === f && !this.disposed) this.render();
      });
    });
  }

  /** A picture at a fixed size (reports): the whole model framed from the current direction; the view is put back. */
  capture(width = 1600, height = 1000, type = 'image/png') {
    const r = this.renderer; const cam = this.camera;
    const keep = { size: r.getSize(new THREE.Vector2()), ratio: r.getPixelRatio(), aspect: cam.aspect, pos: cam.position.clone(), target: this.controls.target.clone() };
    try {
      r.setPixelRatio(1); r.setSize(width, height, false); cam.aspect = width / height; cam.updateProjectionMatrix();
      this.fit(); this.controls.update(); this.updateGrid(); r.render(this.scene, cam);
      return r.domElement.toDataURL(type, 0.92);
    } finally {
      r.setPixelRatio(keep.ratio); r.setSize(keep.size.x, keep.size.y, false); cam.aspect = keep.aspect; cam.updateProjectionMatrix();
      cam.position.copy(keep.pos); this.controls.target.copy(keep.target); this.controls.update(); this.gridKey = null; this.render();
    }
  }

  screenshot() {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  stats() {
    const i = this.renderer.info.render;
    return { calls: i.calls, triangles: i.triangles };
  }

  // ───────────────────────── pointer input

  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** The block under the pointer: { id } or null. */
  pick(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.blockRoot.children, true);
    for (const h of hits) {
      let id = null; let visible = true;
      for (let o = h.object; o; o = o.parent) { if (!o.visible) { visible = false; break; } if (o.userData.blockId) { id = o.userData.blockId; break; } }
      if (visible && id) return { id };
    }
    return null;
  }

  floorPoint(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    return this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
  }

  pointerDown(e) {
    if (e.button !== 0) return;
    const hit = this.pick(e);
    this.press = { id: hit?.id ?? null, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, drag: false, additive: e.shiftKey || e.ctrlKey || e.metaKey };
    if (hit && this.selection.has(hit.id) && !this.press.additive && (this.cb.canEdit ? this.cb.canEdit() : true)) {
      const b = this.model?.blocks.find((x) => x.id === hit.id);
      const fp = this.floorPoint(e);
      if (b && fp) {
        this.press.candidate = { start: fp, bx: b.x, by: b.y };
        this.controls.enabled = false;
        try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    }
  }

  pointerMove(e) {
    const p = this.press;
    if (p) {
      if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4) p.moved = true;
      if (p.candidate && p.moved) {
        const g = this.groups.get(p.id);
        const fp = this.floorPoint(e);
        if (g && fp) {
          p.drag = true;
          const x = snap(p.candidate.bx + fp.x - p.candidate.start.x); const y = snap(p.candidate.by + fp.z - p.candidate.start.z);
          if (!p.to || p.to[0] !== x || p.to[1] !== y) { p.to = [x, y]; g.position.set(x, 0, y); this.requestRender(); }
          this.canvas.style.cursor = 'grabbing';
        }
      }
      return;
    }
    // Hover, throttled.
    this.lastMove = { clientX: e.clientX, clientY: e.clientY };
    if (this.hoverTimer) return;
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      if (this.press || this.disposed || !this.lastMove) return;
      this.setHover(this.pick(this.lastMove)?.id ?? null);
    }, 50);
  }

  setHover(id) {
    const editable = this.cb.canEdit ? this.cb.canEdit() : true;
    this.canvas.style.cursor = id ? (this.selection.has(id) && editable ? 'move' : 'pointer') : '';
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.cb.onHover?.(id);
  }

  pointerUp(e, cancelled) {
    const p = this.press;
    if (!p || (e.pointerId != null && p.pointerId !== e.pointerId)) return;
    this.press = null;
    this.controls.enabled = true;
    try { if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    this.canvas.style.cursor = '';
    if (p.drag) {
      const moved = p.to && (p.to[0] !== p.candidate.bx || p.to[1] !== p.candidate.by);
      if (cancelled || !moved) { this.groups.get(p.id)?.position.set(p.candidate.bx, 0, p.candidate.by); this.requestRender(); return; }
      this.cb.onMove?.(p.id, p.to[0], p.to[1]);
      return;
    }
    if (cancelled || p.moved) return;
    if (p.id) this.cb.onSelect?.([p.id], p.additive);
    else this.cb.onSelect?.([], false);
  }

  // ───────────────────────── teardown

  dispose() {
    this.disposed = true;
    clearTimeout(this.buildTimer); clearTimeout(this.hoverTimer);
    if (this.rafPending) cancelAnimationFrame(this.rafPending);
    this.ro?.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('pointerleave', this.onLeave);
    this.controls.dispose();
    this.clearBlocks();
    for (const v of this.labelCache.values()) { v.tex.dispose(); v.mat.dispose(); }
    this.labelCache.clear();
    for (const g of this.floorGeos) g.dispose();
    for (const m of [this.floorMat, this.groundMat, this.gridMinorMat, this.gridMajorMat, this.selMat, this.linkMat]) m.dispose();
    this.floorTex.dispose();
    this.sun.shadow.map?.dispose();
    this.dyn.dispose();
    this.kit.dispose();
    this.renderer.dispose();
    c.remove();
  }
}

// The 3D view: one model on an endless ground grid, with coordinate axes,
// rulers, lights the user can drag, and the camera controls.
//
// Everything the right panel can change arrives through `apply(view, lights)`
// (the settings objects from lib/settings.js); the view never keeps settings
// of its own, so a restart restores it exactly. Lights the user drags report
// their new position through `onLightMove`.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';

const GRID_VERTEX = /* glsl */`
  uniform float uDistance;
  varying vec3 vWorld;
  void main() {
    vec3 pos = position.xzy * uDistance;
    pos.xz += cameraPosition.xz;
    vWorld = pos;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

// Lines of the major cells and of their subdivisions, anti-aliased with
// fwidth, fading out with the distance from the camera: an endless plane.
const GRID_FRAGMENT = /* glsl */`
  uniform float uMajor;
  uniform float uDivisions;
  uniform float uDistance;
  uniform vec3 uMinorColor;
  uniform vec3 uMajorColor;
  uniform float uOpacity;
  varying vec3 vWorld;
  float lines(float size, float width) {
    vec2 r = vWorld.xz / size;
    vec2 g = abs(fract(r - 0.5) - 0.5) / (fwidth(r) * width);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    float fade = 1.0 - min(distance(cameraPosition.xz, vWorld.xz) / uDistance, 1.0);
    fade = pow(fade, 3.0);
    float minor = lines(uMajor / uDivisions, 1.0);
    float major = lines(uMajor, 1.4);
    float a = max(minor * 0.45, major) * fade * uOpacity;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(mix(uMinorColor, uMajorColor, major), a);
  }
`;

export const LIGHT_TYPES = ['directional', 'point', 'spot', 'hemisphere', 'ambient'];
export const MOVABLE = new Set(['directional', 'point', 'spot']);

export const VIEW_PRESETS = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
  iso: [1, 0.8, 1],
};

const AXIS_COLORS = { x: 0xe5534b, y: 0x57ab5a, z: 0x4a90e2 };

function label(textContent, className) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = textContent;
  return new CSS2DObject(el);
}

function disposeObject(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose?.();
    }
  });
}

// A number for a ruler label: no trailing zeros, at most 3 decimals.
export function rulerText(value, unit = '') {
  const v = Math.abs(value) < 1e-9 ? 0 : value;
  const s = Number(v.toFixed(3)).toString();
  return unit ? `${s} ${unit}` : s;
}

// A "nice" major grid size for a model of this extent: 1, 2 or 5 × 10^n,
// so a model shows a handful of major cells.
export function niceGridSize(extent) {
  if (!(extent > 0) || !Number.isFinite(extent)) return 1;
  // About the model's own size, rounded up to 1, 2 or 5 × 10^n: a 1 m model
  // stands in a 1 m cell split 5 × 5 into 20 cm squares.
  const raw = extent * 0.8;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  const step = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return step * pow;
}

export class Viewer3D {
  constructor(container, { onLightMove, onLightSelect, onCameraChange } = {}) {
    this.container = container;
    this.onLightMove = onLightMove;
    this.onLightSelect = onLightSelect;
    this.onCameraChange = onCameraChange;
    this.view = {};
    this.lightSpecs = [];
    this.lights = new Map();       // id → { light, handle, spec }
    this.model = null;
    this.modelRoot = new THREE.Group();
    this.modelRoot.name = 'model-root';
    this.originalMaterials = new Map();
    this.selectedLight = null;
    this.mixer = null;
    this.clock = new THREE.Clock();
    this.disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.domElement.className = 'viewer3d-canvas';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const labels = new CSS2DRenderer();
    labels.domElement.className = 'viewer3d-labels';
    container.appendChild(labels.domElement);
    this.labels = labels;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
    this.camera.position.set(2.2, 1.6, 2.6);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0.5, 0);
    controls.addEventListener('change', () => this.onCameraChange?.());
    this.controls = controls;

    const gizmo = new TransformControls(this.camera, renderer.domElement);
    gizmo.setSize(0.8);
    gizmo.addEventListener('dragging-changed', (e) => {
      controls.enabled = !e.value;
      if (!e.value && this.selectedLight) this._reportLight(this.selectedLight);
    });
    gizmo.addEventListener('objectChange', () => {
      if (this.selectedLight) this._syncLightFromHandle(this.selectedLight, true);
    });
    this.gizmo = gizmo;
    this.scene.add(gizmo.getHelper());

    this.viewHelper = new ViewHelper(this.camera, renderer.domElement);
    this.viewHelper.center = controls.target;

    this.scene.add(this.modelRoot);
    this._buildGrid();
    this.axes = new THREE.Group();
    this.axes.name = 'axes';
    this.rulers = new THREE.Group();
    this.rulers.name = 'rulers';
    this.bbox = new THREE.Group();
    this.bbox.name = 'bbox';
    this.lightGroup = new THREE.Group();
    this.lightGroup.name = 'lights';
    this.handles = new THREE.Group();
    this.handles.name = 'light-handles';
    this.scene.add(this.axes, this.rulers, this.bbox, this.lightGroup, this.handles);

    this.shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = -1;
    this.scene.add(this.shadowCatcher);

    this.raycaster = new THREE.Raycaster();
    this._onPointerDown = (e) => this._pointerDown(e);
    this._onPointerUp = (e) => this._pointerUp(e);
    renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
    renderer.domElement.addEventListener('pointerup', this._onPointerUp);

    this._resize = () => this.resize();
    this.resizeObserver = new ResizeObserver(this._resize);
    this.resizeObserver.observe(container);
    this.resize();

    const loop = () => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(loop);
      this.render();
    };
    loop();
  }

  // ── Scene furniture ───────────────────────────────────
  _buildGrid() {
    const material = new THREE.ShaderMaterial({
      vertexShader: GRID_VERTEX,
      fragmentShader: GRID_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uMajor: { value: 1 },
        uDivisions: { value: 5 },
        uDistance: { value: 100 },
        uMinorColor: { value: new THREE.Color(0x666666) },
        uMajorColor: { value: new THREE.Color(0x999999) },
        uOpacity: { value: 1 },
      },
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), material);
    grid.frustumCulled = false;
    grid.renderOrder = -2;
    grid.name = 'grid';
    this.grid = grid;
    this.scene.add(grid);
  }

  // The model's own scale (the automatic grid size): light positions are in
  // these units, so lights keep their place around models of any size.
  sceneScale() {
    const s = this.modelSize();
    return this.model ? niceGridSize(Math.max(s.x, s.y, s.z) || 1) : 1;
  }

  gridSize() {
    const v = this.view;
    if (v.gridSize === 'auto' || !(Number(v.gridSize) > 0)) {
      const s = this.modelSize();
      return niceGridSize(Math.max(s.x, s.y, s.z) || 1);
    }
    return Number(v.gridSize);
  }

  _buildAxes(extent) {
    disposeObject(this.axes);
    this.axes.clear();
    const v = this.view;
    for (const [axis, color] of Object.entries(AXIS_COLORS)) {
      const dir = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      const pos = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(extent)]);
      const line = new THREE.Line(pos, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      line.renderOrder = 5;
      this.axes.add(line);
      if (v.negativeAxes) {
        const neg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(-extent)]);
        const dashed = new THREE.Line(neg, new THREE.LineDashedMaterial({
          color, dashSize: extent / 40, gapSize: extent / 60, transparent: true, opacity: 0.6, depthTest: false,
        }));
        dashed.computeLineDistances();
        dashed.renderOrder = 5;
        this.axes.add(dashed);
      }
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(extent * 0.018, extent * 0.06, 16),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }),
      );
      cone.position.copy(dir).multiplyScalar(extent);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cone.renderOrder = 5;
      this.axes.add(cone);
      const name = label(axis.toUpperCase(), `axis-label axis-${axis}`);
      name.position.copy(dir).multiplyScalar(extent * 1.07);
      this.axes.add(name);
    }
  }

  _buildRulers(major, extent) {
    disposeObject(this.rulers);
    this.rulers.clear();
    const v = this.view;
    const divisions = Math.max(1, Number(v.gridDivisions) || 5);
    const minor = major / divisions;
    const count = Math.min(400, Math.ceil(extent / minor));
    const positions = [];
    // The height ruler stands at the model's back-left corner, so its ticks
    // and numbers never sit on the model itself.
    const size = this.modelSize();
    const yx = this.model ? -(size.x / 2) - major * 0.35 : 0;
    const yz = this.model ? -(size.z / 2) - major * 0.35 : 0;
    const yCount = Math.min(400, Math.ceil((this.model ? size.y * 1.15 : extent) / minor));
    const tick = (axis, at, len) => {
      // Ticks stand across the axis they measure, in the ground plane for X
      // and Z; the height ruler's point along +X.
      if (axis === 'x') positions.push(at, 0, 0, at, 0, len);
      else if (axis === 'z') positions.push(0, 0, at, len, 0, at);
      else positions.push(yx, at, yz, yx + len, at, yz);
    };
    if (v.rulerY) positions.push(yx, 0, yz, yx, yCount * minor, yz);
    const axes = ['x', 'z', ...(v.rulerY ? ['y'] : [])];
    for (const axis of axes) {
      const from = axis === 'y' ? 1 : -count;
      const to = axis === 'y' ? yCount : count;
      for (let i = from; i <= to; i++) {
        if (i === 0) continue;
        const at = i * minor;
        const isMajor = i % divisions === 0;
        tick(axis, at, isMajor ? major * 0.12 : major * 0.05);
        if (isMajor) {
          const l = label(rulerText(at, v.units === 'none' ? '' : v.units), `ruler-label ruler-${axis}`);
          if (axis === 'x') l.position.set(at, 0, major * 0.2);
          else if (axis === 'z') l.position.set(major * 0.2, 0, at);
          else l.position.set(yx - major * 0.25, at, yz);
          this.rulers.add(l);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const color = new THREE.Color(v.rulerColor || '#d0d0d0');
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
    lines.renderOrder = 4;
    this.rulers.add(lines);
  }

  _buildBBox() {
    disposeObject(this.bbox);
    this.bbox.clear();
    if (!this.model || !this.view.boundingBox) return;
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (box.isEmpty()) return;
    const helper = new THREE.Box3Helper(box, new THREE.Color(this.view.bboxColor || '#f0b429'));
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.renderOrder = 6;
    this.bbox.add(helper);
    const size = box.getSize(new THREE.Vector3());
    const unit = this.view.units === 'none' ? '' : this.view.units;
    const put = (text, x, y, z) => {
      const l = label(text, 'dim-label');
      l.position.set(x, y, z);
      this.bbox.add(l);
    };
    put(`X ${rulerText(size.x, unit)}`, (box.min.x + box.max.x) / 2, box.min.y, box.max.z);
    put(`Y ${rulerText(size.y, unit)}`, box.max.x, (box.min.y + box.max.y) / 2, box.max.z);
    put(`Z ${rulerText(size.z, unit)}`, box.max.x, box.min.y, (box.min.z + box.max.z) / 2);
  }

  // ── Lights ────────────────────────────────────────────
  _makeLight(spec) {
    const color = new THREE.Color(spec.color || '#ffffff');
    switch (spec.type) {
      case 'ambient': return new THREE.AmbientLight(color, spec.intensity);
      case 'hemisphere': return new THREE.HemisphereLight(color, new THREE.Color(spec.groundColor || '#404040'), spec.intensity);
      case 'point': return new THREE.PointLight(color, spec.intensity, spec.distance || 0, 2);
      case 'spot': {
        const l = new THREE.SpotLight(color, spec.intensity, spec.distance || 0, THREE.MathUtils.degToRad(spec.angle || 30), spec.penumbra ?? 0.3, 2);
        this.scene.add(l.target);
        return l;
      }
      default: {
        const l = new THREE.DirectionalLight(color, spec.intensity);
        this.scene.add(l.target);
        return l;
      }
    }
  }

  _makeHandle(spec) {
    const color = new THREE.Color(spec.color || '#ffffff');
    const r = this.handleRadius();
    const group = new THREE.Group();
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 14),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }),
    );
    bulb.renderOrder = 8;
    bulb.userData.lightId = spec.id;
    group.add(bulb);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 1.35, r * 1.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.55 }),
    );
    ring.renderOrder = 7;
    ring.userData.billboard = true;
    ring.userData.lightId = spec.id;
    group.add(ring);
    if (spec.type !== 'point') {
      // A line towards where the light points (the origin / its target).
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.04, depthTest: false, transparent: true, opacity: 0.8 }));
      line.renderOrder = 7;
      line.userData.aim = true;
      group.add(line);
    }
    group.userData.lightId = spec.id;
    group.userData.baseRadius = r;
    return group;
  }

  handleRadius() {
    return Math.max(0.005, this.sceneScale() * 0.05);
  }

  _setLights(specs) {
    const keep = new Set(specs.map((s) => s.id));
    for (const [id, entry] of this.lights) {
      if (!keep.has(id) || entry.spec.type !== specs.find((s) => s.id === id)?.type) {
        if (this.selectedLight === id) this.selectLight(null);
        this.lightGroup.remove(entry.light);
        if (entry.light.target) this.scene.remove(entry.light.target);
        entry.light.dispose?.();
        if (entry.handle) { this.handles.remove(entry.handle); disposeObject(entry.handle); }
        this.lights.delete(id);
      }
    }
    for (const spec of specs) {
      let entry = this.lights.get(spec.id);
      if (!entry) {
        const light = this._makeLight(spec);
        const handle = MOVABLE.has(spec.type) ? this._makeHandle(spec) : null;
        entry = { light, handle, spec };
        this.lights.set(spec.id, entry);
        this.lightGroup.add(light);
        if (handle) this.handles.add(handle);
      }
      entry.spec = spec;
      this._updateLight(entry);
    }
  }

  _updateLight(entry) {
    const { light, handle, spec } = entry;
    light.visible = spec.enabled !== false;
    light.color.set(spec.color || '#ffffff');
    light.intensity = Number(spec.intensity) || 0;
    if (light.isHemisphereLight) light.groundColor.set(spec.groundColor || '#404040');
    if (MOVABLE.has(spec.type)) {
      // Positions are kept in grid cells, so the lights stay where they were
      // relative to the model whatever its size.
      const s = this.sceneScale();
      const [x, y, z] = spec.position || [2, 3, 2];
      light.position.set(x * s, y * s, z * s);
      if (light.target) {
        const t = this.modelCenter();
        light.target.position.copy(t);
        light.target.updateMatrixWorld();
      }
      if (light.isSpotLight) {
        light.angle = THREE.MathUtils.degToRad(Number(spec.angle) || 30);
        light.penumbra = Number(spec.penumbra ?? 0.3);
      }
      if (light.isPointLight || light.isSpotLight) light.distance = (Number(spec.distance) || 0) * s;
      const shadows = !!this.view.shadows && !!spec.castShadow;
      light.castShadow = shadows;
      if (shadows) {
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.bias = -0.0005;
        light.shadow.normalBias = 0.02;
        if (light.isDirectionalLight) {
          const s = Math.max(1, this.modelRadius() * 1.6);
          Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.01, far: s * 20 });
          light.shadow.camera.updateProjectionMatrix();
        }
      }
      if (handle) {
        handle.visible = this.view.showLightHelpers !== false && spec.enabled !== false;
        handle.position.copy(light.position);
        handle.children[0].material.color.set(spec.color || '#ffffff');
        const aim = handle.children.find((c) => c.userData.aim);
        if (aim) {
          const target = this.modelCenter().sub(light.position);
          const pts = [new THREE.Vector3(), target];
          aim.geometry.setFromPoints(pts);
          aim.computeLineDistances();
        }
      }
    }
  }

  _syncLightFromHandle(id, live) {
    const entry = this.lights.get(id);
    if (!entry?.handle) return;
    entry.light.position.copy(entry.handle.position);
    const s = this.sceneScale();
    entry.spec = { ...entry.spec, position: entry.handle.position.toArray().map((n) => Math.round((n / s) * 1000) / 1000) };
    this._updateLight(entry);
    if (live) this._reportLight(id, true);
  }

  _reportLight(id, live = false) {
    const entry = this.lights.get(id);
    if (!entry) return;
    this.onLightMove?.(id, entry.spec.position, live);
  }

  selectLight(id) {
    const entry = id ? this.lights.get(id) : null;
    this.selectedLight = entry?.handle ? id : null;
    if (entry?.handle) this.gizmo.attach(entry.handle);
    else this.gizmo.detach();
    this.onLightSelect?.(this.selectedLight);
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hits = this.raycaster.intersectObjects(this.handles.children.filter((h) => h.visible), true);
    return hits.find((h) => h.object.userData.lightId)?.object.userData.lightId || null;
  }

  _pointerDown(e) {
    this._down = { x: e.clientX, y: e.clientY, onGizmo: this.gizmo.axis !== null && this.gizmo.dragging === false && !!this.gizmo.object };
    if (e.button !== 0) return;
    const id = this._pick(e);
    if (id && id !== this.selectedLight) {
      this.selectLight(id);
      // Drag the light at once in the view plane, without first aiming at
      // one of the gizmo's handles.
      try {
        const p = this.gizmo._getPointer(e);
        this.gizmo.axis = 'XYZ';
        // The drag plane is placed when the helper updates; place it now.
        this.gizmo.getHelper().updateMatrixWorld(true);
        this.gizmo.pointerDown(p);
      } catch { /* the gizmo's handles still work */ }
    }
  }

  _pointerUp(e) {
    const d = this._down;
    this._down = null;
    if (!d || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4;
    if (moved || this.gizmo.dragging) return;
    if (this.viewHelper.handleClick(e)) return;
    const id = this._pick(e);
    if (!id && this.gizmo.axis === null) this.selectLight(null);
  }

  // ── Settings ──────────────────────────────────────────
  apply(view, lights) {
    const prev = this.view;
    this.view = { ...view };
    const v = this.view;
    const r = this.renderer;
    r.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, none: THREE.NoToneMapping }[v.toneMapping] ?? THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = Number(v.exposure) || 1;
    r.shadowMap.enabled = !!v.shadows;
    this.scene.environment = v.environment ? this.envMap : null;
    this.scene.environmentIntensity = Number(v.envIntensity ?? 1);
    this._applyBackground();

    const camera = this.camera;
    if (camera.fov !== Number(v.fov)) {
      camera.fov = Number(v.fov) || 45;
      camera.updateProjectionMatrix();
    }
    this.controls.autoRotate = !!v.autoRotate;
    this.controls.autoRotateSpeed = Number(v.autoRotateSpeed) || 2;

    this.gizmo.setSpace('world');
    this._applyMaterialMode(prev);
    this._setLights(lights || []);
    this.refreshHelpers();
  }

  _themeColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  _applyBackground() {
    const v = this.view;
    if (v.background === 'color') {
      this.scene.background = new THREE.Color(v.bgColor || '#202124');
    } else if (v.background === 'gradient') {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 256;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, v.bgColor || '#3a3f4a');
      g.addColorStop(1, v.bgColor2 || '#101215');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 2, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background?.dispose?.();
      this.scene.background = tex;
    } else if (v.background === 'environment') {
      this.scene.background = this.envMap;
      this.scene.backgroundBlurriness = 0.4;
    } else {
      this.scene.background = new THREE.Color(this._themeColor('--page-bg', '#151515'));
    }
  }

  // Grid colours follow the background so lines stay visible on both kinds.
  _gridColors() {
    const bg = this.scene.background?.isColor ? this.scene.background : new THREE.Color(this.view.bgColor2 || '#202020');
    const hsl = {};
    bg.getHSL(hsl);
    const light = hsl.l > 0.5;
    const custom = this.view.gridColor;
    const major = new THREE.Color(custom || (light ? '#7a7a7a' : '#8c8c8c'));
    const minor = major.clone().lerp(bg, 0.45);
    return { major, minor };
  }

  refreshHelpers() {
    const v = this.view;
    const major = this.gridSize();
    const radius = Math.max(this.modelRadius(), major);
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const u = this.grid.material.uniforms;
    u.uMajor.value = major;
    u.uDivisions.value = Math.max(1, Number(v.gridDivisions) || 5);
    u.uDistance.value = Math.max(camDist * 12, major * 60);
    u.uOpacity.value = Number(v.gridOpacity ?? 1);
    const { major: cMajor, minor: cMinor } = this._gridColors();
    u.uMajorColor.value.copy(cMajor);
    u.uMinorColor.value.copy(cMinor);
    this.grid.visible = !!v.grid;

    const extent = Math.max(major * (Number(v.rulerCells) || 5), radius * 1.4);
    const ms = this.modelSize();
    const key = `${major}|${extent}|${v.gridDivisions}|${v.units}|${v.rulerY}|${v.negativeAxes}|${v.rulerColor}|${ms.x.toFixed(4)}|${ms.y.toFixed(4)}|${ms.z.toFixed(4)}|${!!this.model}`;
    if (key !== this._helperKey) {
      this._helperKey = key;
      this._buildAxes(extent);
      this._buildRulers(major, extent);
    }
    this.axes.visible = !!v.axes;
    this.rulers.visible = !!v.rulers;
    this._buildBBox();

    this.shadowCatcher.visible = !!v.shadows && !!this.model;
    const s = Math.max(4, radius * 8);
    this.shadowCatcher.scale.set(s, s, 1);
    this.shadowCatcher.material.opacity = Number(v.shadowOpacity ?? 0.25);
    const rh = this.handleRadius();
    for (const entry of this.lights.values()) {
      if (entry.handle) entry.handle.scale.setScalar(rh / entry.handle.userData.baseRadius);
      this._updateLight(entry);
    }
  }

  // ── Materials ─────────────────────────────────────────
  _applyMaterialMode(prev = {}) {
    if (!this.model) return;
    const v = this.view;
    const mode = v.material || 'original';
    const clay = new THREE.Color(v.clayColor || '#c8c8c8');
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      if (!this.originalMaterials.has(o)) this.originalMaterials.set(o, o.material);
      const original = this.originalMaterials.get(o);
      let mat;
      if (mode === 'clay') {
        mat = o.userData.clay || (o.userData.clay = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }));
        mat.color.copy(clay);
      } else if (mode === 'normal') {
        mat = o.userData.normalMat || (o.userData.normalMat = new THREE.MeshNormalMaterial());
      } else if (mode === 'vertex') {
        mat = o.userData.vertexMat || (o.userData.vertexMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
        mat.vertexColors = !!o.geometry.getAttribute('color');
      } else {
        mat = original;
      }
      o.material = mat;
      for (const m of [].concat(mat)) {
        m.wireframe = !!v.wireframe;
        if ('flatShading' in m && m.flatShading !== !!v.flatShading) {
          m.flatShading = !!v.flatShading;
          m.needsUpdate = true;
        }
        const side = v.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
        if (m.side !== side && (mode !== 'original' || v.doubleSided || prev.doubleSided)) {
          m.side = side;
          m.needsUpdate = true;
        }
      }
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  // ── The model ─────────────────────────────────────────
  setModel(object, animations = []) {
    this.clearModel();
    if (!object) return;
    this.model = object;
    this.modelRoot.add(object);
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.rotation.set(0, 0, 0);
    this.modelRoot.scale.setScalar(1);
    // Centre on the ground: the bottom at y = 0, the middle over the origin.
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      object.position.x -= c.x;
      object.position.z -= c.z;
      object.position.y -= box.min.y;
    }
    if (animations.length) {
      this.mixer = new THREE.AnimationMixer(object);
      for (const clip of animations) this.mixer.clipAction(clip).play();
    }
    this._helperKey = '';
    this._applyMaterialMode();
    this.refreshHelpers();
    this.fit();
  }

  clearModel() {
    if (!this.model) return;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.modelRoot.remove(this.model);
    disposeObject(this.model);
    for (const o of this.originalMaterials.keys()) {
      for (const k of ['clay', 'normalMat', 'vertexMat']) o.userData[k]?.dispose?.();
    }
    this.originalMaterials.clear();
    this.model = null;
    this._helperKey = '';
    this.refreshHelpers();
  }

  // The model as it would be saved: original materials, current transform.
  exportRoot() {
    if (!this.model) return null;
    const restore = [];
    this.model.traverse((o) => {
      if (o.isMesh && this.originalMaterials.has(o)) {
        restore.push([o, o.material]);
        o.material = this.originalMaterials.get(o);
      }
    });
    const clone = this.modelRoot.clone(true);
    for (const [o, m] of restore) o.material = m;
    clone.updateMatrixWorld(true);
    return clone;
  }

  setTransform({ rotation = [0, 0, 0], scale = 1 } = {}) {
    this.modelRoot.rotation.set(...rotation.map((d) => THREE.MathUtils.degToRad(Number(d) || 0)));
    this.modelRoot.scale.setScalar(Number(scale) > 0 ? Number(scale) : 1);
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.updateMatrixWorld(true);
    // Keep it standing on the ground after a rotation.
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (!box.isEmpty()) this.modelRoot.position.y -= box.min.y;
    this._helperKey = '';
    this.refreshHelpers();
  }

  modelSize() {
    if (!this.model) return new THREE.Vector3(1, 1, 1);
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    return box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  }

  modelRadius() {
    if (!this.model) return 1;
    const s = this.modelSize();
    return Math.max(0.001, s.length() / 2);
  }

  modelCenter() {
    if (!this.model) return new THREE.Vector3(0, 0.5, 0);
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  }

  // ── Camera ────────────────────────────────────────────
  // Frames the model and, while their handles are shown, the lights that can
  // be dragged, so they are in view to be grabbed.
  fit(direction) {
    const center = this.modelCenter();
    let radius = this.modelRadius();
    if (this.view.showLightHelpers !== false) {
      for (const { handle, spec } of this.lights.values()) {
        if (handle && spec.enabled !== false) radius = Math.max(radius, handle.position.distanceTo(center) * 0.62);
      }
    }
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (radius / Math.sin(fov / 2)) * 1.15;
    const dir = direction
      ? new THREE.Vector3(...direction).normalize()
      : this.camera.position.clone().sub(this.controls.target).normalize();
    if (!Number.isFinite(dir.x) || dir.lengthSq() === 0) dir.set(1, 0.8, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(dir.multiplyScalar(dist));
    this.camera.near = Math.max(0.001, dist / 1000);
    this.camera.far = Math.max(100, dist * 100);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.refreshHelpers();
  }

  setView(name) {
    const dir = VIEW_PRESETS[name];
    if (dir) this.fit(dir);
  }

  // ── Frame ─────────────────────────────────────────────
  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    const dt = this.clock.getDelta();
    this.controls.update();
    if (this.viewHelper.animating) this.viewHelper.update(dt);
    this.mixer?.update(dt);
    // Keep the light rings facing the camera.
    for (const h of this.handles.children) {
      for (const c of h.children) if (c.userData.billboard) c.quaternion.copy(this.camera.quaternion);
    }
    const u = this.grid.material.uniforms;
    const camDist = this.camera.position.distanceTo(this.controls.target);
    u.uDistance.value = Math.max(camDist * 12, u.uMajor.value * 60);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.view.viewCube !== false) this.viewHelper.render(this.renderer);
    this.labels.render(this.scene, this.camera);
  }

  snapshot() {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.gizmo.dispose();
    this.controls.dispose();
    this.viewHelper.dispose?.();
    this.clearModel();
    this.envMap.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}

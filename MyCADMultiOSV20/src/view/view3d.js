// 3D view of a drawing (three.js). Closed outlines become solids extruded by
// the chosen thickness (the same mesh the STL export writes); every other line
// is drawn on the ground plane. The view has graduated X/Y/Z axes, a grid, and
// a light the user moves with the mouse (drag its sun, or the light mode) and
// switches on and off.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AUTO, isVisible, styleOf } from '../domain/drawing.js';
import { primitives } from '../domain/entities.js';
import { arcPoints } from '../domain/geometry.js';
import { solidMesh } from '../domain/solids.js';
import { buildShapes, collectLoops, extrude } from '../domain/stl.js';
import { gridStepFor, niceStep } from './renderer.js';
import { displayUnit, gridBaseFor, unitFactor } from '../domain/units.js';

export const PRESETS = ['iso', 'top', 'front', 'right'];
/** Colours of solids drawn "by layer" with the automatic colour (one per solid, in turn). */
export const SOLID_PALETTE = ['#e0b354', '#7fb3e6', '#8fcf8a', '#e48f7a', '#b9a0e8', '#6fd0c8', '#e7a3c9', '#c5c96b'];

/** Text label as a sprite (axis numbers and names). */
function textSprite(text, color, size) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = 'bold 44px "Segoe UI", sans-serif';
  context.font = font;
  canvas.width = Math.max(16, Math.ceil(context.measureText(text).width) + 12);
  canvas.height = 56;
  context.font = font;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Depth-tested: labels behind a solid are hidden by it (no depth write, so their quads hide nothing).
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true, depthWrite: false, transparent: true }));
  sprite.scale.set((size * canvas.width) / canvas.height, size, 1);
  sprite.renderOrder = 10;
  sprite.userData.text = text;
  sprite.userData.aspect = canvas.width / canvas.height;
  return sprite;
}

/** The sun marker: a glowing disc with twelve rays (on), or a grey disc with short broken rays (off). */
function sunTexture(on) {
  // Drawn at 2× (256 px) in 128-unit coordinates, with mipmaps: sharp at its on-screen size.
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size * 2;
  const c = canvas.getContext('2d');
  c.scale(2, 2);
  const mid = size / 2;
  if (on) {
    const glow = c.createRadialGradient(mid, mid, 8, mid, mid, mid);
    glow.addColorStop(0, 'rgba(255, 214, 90, 0.55)');
    glow.addColorStop(1, 'rgba(255, 214, 90, 0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, size, size);
  }
  c.strokeStyle = on ? '#ffb000' : '#8a8f98';
  c.lineCap = 'round';
  c.lineWidth = 7;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const r0 = 34;
    const r1 = on ? (i % 2 ? 54 : 60) : 44;
    c.beginPath();
    c.moveTo(mid + Math.cos(a) * r0, mid + Math.sin(a) * r0);
    c.lineTo(mid + Math.cos(a) * r1, mid + Math.sin(a) * r1);
    if (!on && i % 2) continue;
    c.stroke();
  }
  c.beginPath();
  c.arc(mid, mid, 25, 0, Math.PI * 2);
  c.fillStyle = on ? '#ffd23f' : '#b9bec7';
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = on ? '#f59e0b' : '#6b7280';
  c.stroke();
  if (!on) {
    c.beginPath();
    c.moveTo(mid - 30, mid + 30);
    c.lineTo(mid + 30, mid - 30);
    c.lineWidth = 6;
    c.strokeStyle = '#6b7280';
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** The sun's size on screen (px): the same at every zoom. */
const SUN_PX = 44;
/** Axis numbers and names: their height on screen in pixels at 100 % (Settings › Drawing). */
const AXIS_NUMBER_PX = 13;
const AXIS_NAME_PX = 18;

function disposeTree(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const material of materials) { material.map?.dispose?.(); material.dispose?.(); }
  });
}

export class View3D {
  constructor(container, { onLightChange, onLightSelect, onPick } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.onLightChange = onLightChange;
    this.onLightSelect = onLightSelect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'view3d-canvas';
    container.prepend(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => { this.updateGrid(); this.render(); });

    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x445566, 0.9);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    // The basic light, used while the sun is off: it rides with the camera (from the upper left of
    // the view), so the model stays evenly lit from wherever it is seen — no shadows, nothing to drag.
    this.headlight = new THREE.DirectionalLight(0xffffff, 1.7);
    this.headlight.position.set(-0.6, 0.8, 0.4);
    this.headlight.target.position.set(0, 0, -1);
    this.camera.add(this.headlight, this.headlight.target);
    this.scene.add(this.camera);
    this.gizmo = new THREE.Group();
    // The light is shown as a sun: a disc with rays (a sprite that always faces the viewer);
    // the invisible ball under it is what the mouse grabs.
    this.gizmoBall = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.sunIcons = { on: sunTexture(true), off: sunTexture(false) };
    this.gizmoSun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sunIcons.on, depthTest: false, transparent: true }));
    this.gizmoSun.renderOrder = 11;
    this.gizmoSun.name = 'sun';
    this.gizmoLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0xffc533, dashSize: 1, gapSize: 1 }));
    this.gizmo.add(this.gizmoBall, this.gizmoSun, this.gizmoLine);
    this.scene.add(this.gizmo);

    this.model = new THREE.Group();
    this.wires = new THREE.Group();
    this.axes = new THREE.Group();
    this.grid = new THREE.Group();
    this.scene.add(this.model, this.wires, this.axes, this.grid);

    this.light = { azimuth: 135, elevation: 55, on: true, intensity: 1, color: '#ffffff', shadows: true };
    this.options = { wireframe: false, axes: true, lightMode: false };
    this.size = 100;
    this.center = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.bindLightDrag();
  }

  // ───────────────────────── content

  /**
   * Rebuilds the scene from a drawing. colors: { background, ink, solid, edge, grid, axisText }.
   * Returns { solids, holes, triangles, open }.
   */
  update(drawing, { thickness = 10, colors = {}, extrude2d = true, selected = new Set(), axisLabelScale = 1 } = {}) {
    this.colors = colors;
    this.axisLabelScale = Math.max(0.2, Math.min(4, axisLabelScale));
    this.gridSize = gridBaseFor(drawing.grid?.size || 10);
    this.thickness = thickness;
    for (const group of [this.model, this.wires, this.axes, this.grid]) {
      disposeTree(group);
      group.clear();
    }
    this.scene.background = new THREE.Color(colors.background ?? '#20242c');
    const entities = drawing.entities.filter((entity) => isVisible(drawing, entity));
    const { loops, open } = extrude2d ? collectLoops(entities, drawing) : { loops: [], open: [] };
    const shapes = buildShapes(loops);
    const triangles = extrude(shapes, thickness);
    const solids = entities.filter((entity) => entity.type === 'solid');
    let solidTriangles = 0;
    solids.forEach((entity, index) => {
      const tris = solidMesh(entity);
      if (!tris.length) return;
      solidTriangles += tris.length;
      const style = styleOf(drawing, entity);
      const base = style.color === AUTO ? SOLID_PALETTE[index % SOLID_PALETTE.length] : style.color;
      const mesh = this.meshOf(tris, selected.has(entity.id) ? colors.selection ?? '#ff9f1c' : base, `solid:${entity.id}`);
      this.model.add(mesh, this.edgesOf(mesh.geometry, colors));
    });
    if (triangles.length) {
      const mesh = this.meshOf(triangles, colors.solid ?? '#9fb4c8', 'solids');
      const edges = this.edgesOf(mesh.geometry, colors);
      edges.name = 'edges';
      this.model.add(mesh, edges);
    }
    // Every other line of the drawing, on the ground plane.
    for (const entity of entities) {
      if (entity.type === 'text' || entity.type === 'dim' || entity.type === 'solid') continue;
      const style = styleOf(drawing, entity);
      const color = new THREE.Color(style.color === AUTO ? colors.ink ?? '#e6e9ef' : style.color);
      for (const prim of primitives(entity)) {
        let points = null;
        if (prim.kind === 'line') points = [prim.a, prim.b];
        else if (prim.kind === 'poly') points = prim.closed ? [...prim.points, prim.points[0]] : prim.points;
        else if (prim.kind === 'circle') points = arcPoints(prim.c.x, prim.c.y, prim.r, 0, 360, 4);
        else if (prim.kind === 'arc') points = arcPoints(prim.c.x, prim.c.y, prim.r, prim.start, prim.end, 4);
        if (!points) continue;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0.02))), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
        this.wires.add(line);
      }
    }
    // Size of the scene.
    const box = new THREE.Box3().setFromObject(this.model);
    box.union(new THREE.Box3().setFromObject(this.wires));
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, thickness));
    box.getCenter(this.center);
    const extent = box.getSize(new THREE.Vector3());
    this.size = Math.max(extent.x, extent.y, extent.z, 10);
    this.bounds = box;
    this.buildGround(box);
    this.buildAxes(box);
    this.placeLight();
    this.camera.near = this.size / 500;
    this.camera.far = this.size * 200;
    this.camera.updateProjectionMatrix();
    if (!this.framed) { this.view('iso'); this.framed = true; }
    this.render();
    return { solids: shapes.length + solids.length, plates: shapes.length, parts3d: solids.length, holes: shapes.reduce((sum, shape) => sum + shape.holes.length, 0), triangles: triangles.length + solidTriangles, open: open.length };
  }

  /** A shaded mesh of triangles (casts and receives shadows). */
  meshOf(triangles, color, name) {
    const positions = new Float32Array(triangles.length * 9);
    triangles.forEach((tri, i) => tri.forEach((p, j) => positions.set(p, i * 9 + j * 3)));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.42, wireframe: this.options.wireframe, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    return mesh;
  }

  /** Feature edges (sharper than 25°) drawn over a mesh. */
  edgesOf(geometry, colors) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: colors.edge ?? '#1d2433' }));
    edges.name = 'edges';
    edges.visible = !this.options.wireframe;
    return edges;
  }

  buildGround(box) {
    // The shadow catcher under the model.
    const half = Math.ceil(this.size * 1.5);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.ShadowMaterial({ opacity: 0.28 }));
    ground.position.set(this.center.x, this.center.y, -0.02);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.grid.add(ground);
    this.groundBox = { min: box.min.clone(), max: box.max.clone(), half };
    this.gridLines = null;
    this.updateGrid(true);
  }

  /**
   * The ground grid, like the 2D one: minor lines every gridSize × 5ⁿ (chosen
   * so a cell is 10–50 px at the orbit centre), major lines every 5 — a 5 × 5
   * pattern that keeps its size on screen while zooming.
   */
  updateGrid(force = false) {
    if (!this.grid || !this.colors) return;
    const height = this.canvas.clientHeight || this.canvas.height || 600;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const pxPerMm = height / (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const step = gridStepFor(this.gridSize ?? 10, pxPerMm);
    const major = step * 5;
    const target = this.controls.target;
    const reach = Math.max((distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 3), major * 3);
    const half = Math.ceil(reach / major) * major;
    const cx = Math.round(target.x / major) * major;
    const cy = Math.round(target.y / major) * major;
    const key = `${step}|${half}|${cx}|${cy}`;
    if (!force && key === this.gridKey) return;
    this.gridKey = key;
    if (this.gridLines) { this.grid.remove(this.gridLines); disposeTree(this.gridLines); }
    const minor = [];
    const majors = [];
    const n = Math.round(half / step);
    for (let i = -n; i <= n; i++) {
      const list = i % 5 === 0 ? majors : minor;
      const x = cx + i * step;
      const y = cy + i * step;
      list.push(x, cy - half, 0, x, cy + half, 0, cx - half, y, 0, cx + half, y, 0);
    }
    const lines = new THREE.Group();
    lines.name = 'grid';
    const make = (points, color, opacity) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const segments = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      segments.position.z = -0.01;
      return segments;
    };
    lines.add(make(minor, this.colors.grid ?? 0x333333, 0.8), make(majors, this.colors.gridMajor ?? 0x555555, 1));
    lines.userData = { step, major, pxPerCell: step * pxPerMm, minorLines: minor.length / 6, majorLines: majors.length / 6 };
    this.gridLines = lines;
    this.grid.add(lines);
  }

  /** X (red), Y (green), Z (blue) from the origin, with ticks and numbers at "nice" steps. */
  buildAxes(box) {
    const reach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y), box.max.z, 10);
    // Ticks at round values of the display unit.
    const factor = unitFactor(displayUnit());
    const stepInUnit = niceStep(reach / 5 / factor);
    const step = stepInUnit * factor;
    const length = Math.ceil((reach * 1.15) / step) * step;
    const tick = step * 0.08;
    // Numbers: a tenth of a step high at 100% (Settings › Drawing › size of the 3D axis numbers).
    const labelSize = step * 0.1 * (this.axisLabelScale ?? 1);
    // Lifted off the ground: the shadow plane just below z = 0 would cut the X and Y numbers in half.
    const lift = new THREE.Vector3(0, 0, labelSize * 0.75);
    const axes = [
      { name: 'X', dir: new THREE.Vector3(1, 0, 0), side: new THREE.Vector3(0, 1, 0), color: 0xe5484d },
      { name: 'Y', dir: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(1, 0, 0), color: 0x30a46c },
      { name: 'Z', dir: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), color: 0x3a8fd6 },
    ];
    this.axisInfo = { step, length, ticks: Math.round(length / step), unit: displayUnit(), stepInUnit };
    for (const axis of axes) {
      // The axes are part of the scene: solids in front of them hide them.
      const material = new THREE.LineBasicMaterial({ color: axis.color, depthTest: true, transparent: true });
      const points = [new THREE.Vector3(), axis.dir.clone().multiplyScalar(length)];
      const segments = [];
      for (let i = 1; i <= length / step + 1e-9; i++) {
        const at = axis.dir.clone().multiplyScalar(i * step);
        segments.push(at.clone().addScaledVector(axis.side, -tick), at.clone().addScaledVector(axis.side, tick));
        // Half steps get short ticks.
        const halfAt = axis.dir.clone().multiplyScalar((i - 0.5) * step);
        segments.push(halfAt.clone().addScaledVector(axis.side, -tick / 2), halfAt.clone().addScaledVector(axis.side, tick / 2));
        const number = textSprite(String(Math.round(i * stepInUnit * 1e6) / 1e6), this.colors?.axisText ?? '#cfd6e4', labelSize);
        number.position.copy(at.clone().addScaledVector(axis.side, -tick * 2.6 - labelSize * 0.6));
        if (axis.name !== 'Z') number.position.add(lift);
        number.name = `tick-${axis.name}`;
        number.userData.label = { anchor: at.clone().addScaledVector(axis.side, -tick * 2.6), away: axis.side.clone().negate(), lift: axis.name !== 'Z', px: AXIS_NUMBER_PX, max: step * 0.3 };
        this.axes.add(number);
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
      line.renderOrder = 9;
      line.name = `axis-${axis.name}`;
      const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), material);
      ticks.renderOrder = 9;
      ticks.name = `ticks-${axis.name}`;
      const head = new THREE.Mesh(new THREE.ConeGeometry(tick * 1.1, tick * 3.5, 16), new THREE.MeshBasicMaterial({ color: axis.color, depthTest: true }));
      head.position.copy(axis.dir.clone().multiplyScalar(length + tick * 2));
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.dir);
      head.renderOrder = 9;
      const name = textSprite(axis.name, `#${new THREE.Color(axis.color).getHexString()}`, labelSize * 1.5);
      name.position.copy(axis.dir.clone().multiplyScalar(length + tick * 4 + labelSize));
      if (axis.name !== 'Z') name.position.add(lift);
      name.userData.label = { anchor: axis.dir.clone().multiplyScalar(length + tick * 4), away: axis.dir.clone(), lift: axis.name !== 'Z', px: AXIS_NAME_PX, max: step * 0.45 };
      this.axes.add(line, ticks, head, name);
    }
    this.axes.visible = this.options.axes;
  }

  // ───────────────────────── light

  placeLight() {
    // Close enough to stay in view, so the sun can be grabbed.
    const distance = this.lightDistance();
    const az = THREE.MathUtils.degToRad(this.light.azimuth);
    const el = THREE.MathUtils.degToRad(this.light.elevation);
    const position = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(distance).add(this.center);
    this.sun.position.copy(position);
    this.sun.target.position.copy(this.center);
    this.sun.visible = this.light.on;
    this.sun.intensity = 2.4 * this.light.intensity;
    this.sun.color.set(this.light.color);
    this.sun.castShadow = this.light.shadows;
    this.hemisphere.intensity = 0.9;
    this.headlight.visible = !this.light.on;
    const camera = this.sun.shadow.camera;
    camera.left = -this.size; camera.right = this.size; camera.top = this.size; camera.bottom = -this.size;
    camera.near = distance * 0.05; camera.far = distance * 4;
    this.sun.shadow.normalBias = this.size * 0.002;
    camera.updateProjectionMatrix();
    this.gizmoBall.position.copy(position);
    this.gizmoSun.position.copy(position);
    this.gizmoSun.material.map = this.light.on ? this.sunIcons.on : this.sunIcons.off;
    this.gizmoSun.material.needsUpdate = true;
    this.gizmoLine.material.color.set(this.light.on ? 0xffc533 : 0x888888);
    this.gizmoLine.geometry.setFromPoints([position, this.center]);
    this.gizmoLine.material.dashSize = this.size * 0.03;
    this.gizmoLine.material.gapSize = this.size * 0.02;
    this.gizmoLine.computeLineDistances();
    // Light off: no sun at all (switch it back on with the 3D bar, Ctrl+Shift+G or the light properties).
    this.gizmo.visible = this.light.on;
    this.onLightChange?.(this.light);
  }

  /** Is the pointer (already aimed) on the sun? Never while the light is off: the sun is hidden then. */
  overSun() {
    return this.gizmo.visible && this.raycaster.intersectObject(this.gizmoBall).length > 0;
  }

  setLight({ azimuth = this.light.azimuth, elevation = this.light.elevation, on = this.light.on, intensity = this.light.intensity, color = this.light.color, shadows = this.light.shadows } = {}) {
    this.light = {
      azimuth: ((azimuth % 360) + 360) % 360, elevation: Math.max(3, Math.min(89, elevation)), on,
      intensity: Math.max(0, Math.min(5, Number(intensity) || 0)), color: /^#[0-9a-f]{6}$/i.test(color ?? '') ? color : '#ffffff', shadows: shadows !== false,
    };
    this.placeLight();
    this.render();
  }

  /** Dragging the sun (or anywhere in light mode) moves the light around the model. */
  bindLightDrag() {
    let drag = null;
    let lastSun = null;
    const pointer = new THREE.Vector2();
    const aim = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(pointer, this.camera);
    };
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      aim(event);
      const onSun = this.overSun();
      // A second press on the sun soon after the first: light on / off (a double-click).
      if (onSun && lastSun && event.timeStamp - lastSun.time < 450 && Math.hypot(event.clientX - lastSun.x, event.clientY - lastSun.y) < 6) {
        lastSun = null;
        this.setLight({ on: !this.light.on });
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      lastSun = onSun ? { time: event.timeStamp, x: event.clientX, y: event.clientY } : null;
      if (!onSun && !this.options.lightMode) return;
      drag = { x: event.clientX, y: event.clientY, moved: false, onSun };
      this.controls.enabled = false;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('moving-light');
      event.stopPropagation();
    }, true);
    this.canvas.addEventListener('pointermove', (event) => {
      aim(event);
      if (!drag) {
        if (!this.options.lightMode) this.canvas.classList.toggle('over-sun', this.overSun());
        return;
      }
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
      drag.moved = true;
      const angles = this.lightAnglesAt(this.raycaster.ray);
      if (angles) this.setLight(angles);
    });
    const end = (event) => {
      if (!drag) return;
      // A click on the sun (no drag) selects the light.
      if (!drag.moved && drag.onSun) this.onLightSelect?.(this.light);
      drag = null;
      this.controls.enabled = true;
      this.canvas.classList.remove('moving-light');
      try { this.canvas.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    // A click (no orbit drag) on a solid selects it; on empty space clears the selection.
    let press = null;
    this.canvas.addEventListener('pointerdown', (event) => { press = event.button === 0 ? { x: event.clientX, y: event.clientY } : null; });
    this.canvas.addEventListener('pointerup', (event) => {
      if (!press || drag || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) { press = null; return; }
      press = null;
      aim(event);
      if (this.overSun()) return;
      const hit = this.raycaster.intersectObjects(this.model.children.filter((child) => child.isMesh && child.name.startsWith('solid:')), false)[0];
      this.onPick?.(hit ? hit.object.name.slice(6) : null, event);
    });
  }

  /**
   * Where the light goes for a pointer ray: the ray meets the sphere the sun
   * moves on (the side facing the viewer), so the sun stays under the mouse.
   * A ray that passes the sphere uses its closest point, pushed onto the sphere.
   */
  lightAnglesAt(ray) {
    const radius = this.lightDistance();
    const centre = this.center;
    const oc = ray.origin.clone().sub(centre);
    const b = oc.dot(ray.direction);
    const c = oc.lengthSq() - radius * radius;
    const disc = b * b - c;
    let point;
    if (disc >= 0) {
      const t = -b - Math.sqrt(disc);
      point = ray.at(t >= 0 ? t : -b + Math.sqrt(disc), new THREE.Vector3());
    } else {
      point = ray.at(Math.max(0, -b), new THREE.Vector3());
    }
    const d = point.sub(centre);
    if (d.lengthSq() < 1e-12) return null;
    d.normalize();
    return { azimuth: THREE.MathUtils.radToDeg(Math.atan2(d.y, d.x)), elevation: THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, d.z)))) };
  }

  lightDistance() { return this.size * 0.85; }


  // ───────────────────────── view

  view(preset) {
    // Far enough for the model and the axes.
    const d = Math.max(this.size, (this.axisInfo?.length ?? 0) * 1.1) * 2.3;
    const directions = {
      iso: new THREE.Vector3(1, -1.25, 0.95), top: new THREE.Vector3(0, -0.0001, 1), front: new THREE.Vector3(0, -1, 0.0001), right: new THREE.Vector3(1, 0, 0.0001),
    };
    const direction = (directions[preset] ?? directions.iso).clone().normalize();
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center).addScaledVector(direction, d);
    this.camera.lookAt(this.center);
    this.controls.update();
    this.preset = preset;
    this.render();
  }

  fit() { this.view(this.preset ?? 'iso'); }

  setOption(key, value) {
    this.options[key] = value;
    if (key === 'wireframe') {
      for (const child of this.model.children) {
        if (child.isMesh) child.material.wireframe = value;
        if (child.name === 'edges') child.visible = !value;
      }
    }
    if (key === 'axes') this.axes.visible = value;
    this.canvas.classList.toggle('light-mode', Boolean(this.options.lightMode));
    this.render();
  }

  /** Zooms towards the target (toolbar / Ctrl + wheel). */
  zoom(factor) {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(1 / factor);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.render();
  }

  resize(width, height) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateGrid();
    this.render();
  }

  render() {
    this.sizeSun();
    this.sizeLabels();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Axis numbers and names keep their size on screen (AXIS_NUMBER_PX × the
   * setting) however close the camera is — at most a fraction of a tick step,
   * so far away they shrink instead of running into each other.
   */
  sizeLabels() {
    if (!this.axes?.visible) return;
    const height = this.canvas.clientHeight || this.canvas.height || 600;
    const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / height;
    const scale = this.axisLabelScale ?? 1;
    for (const sprite of this.axes.children) {
      const label = sprite.userData.label;
      if (!label) continue;
      const distance = Math.max(1e-6, this.camera.position.distanceTo(sprite.position));
      const size = Math.min(label.px * scale * perPx * distance, label.max * scale);
      sprite.scale.set(size * sprite.userData.aspect, size, 1);
      sprite.position.copy(label.anchor).addScaledVector(label.away, size * 0.6);
      if (label.lift) sprite.position.z += size * 0.75;
    }
  }

  /**
   * Keeps the sun the same size on screen (SUN_PX) however far the camera is:
   * its world size follows its distance from the camera. Its pick sphere too.
   */
  sizeSun() {
    if (!this.gizmoSun || !this.gizmo.visible) return;
    const height = this.canvas.clientHeight || this.canvas.height || 600;
    const distance = Math.max(1e-6, this.camera.position.distanceTo(this.gizmoSun.position));
    const worldPerPx = (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / height;
    this.gizmoSun.scale.setScalar(SUN_PX * worldPerPx);
    this.gizmoBall.scale.setScalar((SUN_PX / 2) * worldPerPx);
  }

  /** What the tests check: the scene in numbers. */
  inspect() {
    const meshes = this.model.children.filter((child) => child.isMesh);
    const solids = meshes[0];
    return {
      triangles: meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count / 3, 0),
      parts3d: meshes.filter((mesh) => mesh.name.startsWith('solid:')).map((mesh) => ({ id: mesh.name.slice(6), color: `#${mesh.material.color.getHexString()}`, triangles: mesh.geometry.attributes.position.count / 3 })),
      wires: this.wires.children.length,
      axes: this.axes.visible,
      grid: this.gridLines?.userData ?? null,
      axisInfo: this.axisInfo,
      tickLabels: this.axes.children.filter((child) => child.name.startsWith('tick-')).length,
      // Height on screen (px) of the tallest axis number.
      tickPx: (() => {
        this.sizeLabels();
        const height = this.canvas.clientHeight || 600;
        return Math.max(0, ...this.axes.children.filter((child) => child.name.startsWith('tick-')).map((sprite) => (sprite.scale.y / (2 * this.camera.position.distanceTo(sprite.position) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * height));
      })(),
      light: { ...this.light, position: this.sun.position.toArray(), visible: this.sun.visible, basicLight: this.headlight.visible, sunShown: this.gizmo.visible, sunPx: (() => { this.sizeSun(); const d = this.camera.position.distanceTo(this.gizmoSun.position); return (this.gizmoSun.scale.y / (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * (this.canvas.clientHeight || 600); })(), marker: this.gizmoSun.material.map === this.sunIcons.on ? 'sun' : 'sunOff' },
      wireframe: Boolean(solids?.material.wireframe),
      camera: this.camera.position.toArray(),
      sunScreen: (() => { const p = this.gizmoBall.position.clone().project(this.camera); const r = this.canvas.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; })(),
    };
  }

  dispose() {
    this.controls.dispose();
    disposeTree(this.scene);
    this.renderer.dispose();
    this.canvas.remove();
  }
}

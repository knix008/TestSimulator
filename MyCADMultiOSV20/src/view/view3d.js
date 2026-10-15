// 3D view of a drawing (three.js). Closed outlines become solids extruded by
// the chosen thickness (the same mesh the STL export writes); every other line
// is drawn on the ground plane. The view has graduated X/Y/Z axes, a grid, and
// a light the user moves with the mouse (drag its sun, or the light mode) and
// switches on and off.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { AUTO, isVisible3d, styleOf } from '../domain/drawing.js';
import { primitives } from '../domain/entities.js';
import { arcPoints } from '../domain/geometry.js';
import { placement as placementOf, solidMeshGroups, solidPoints } from '../domain/solids.js';
import { datumGlyph } from '../domain/datums.js';
import { sketchFrameOf } from '../domain/docextras.js';
import { DATUM_TYPES } from '../domain/partops.js';
import { matchElement } from '../domain/topology.js';
import { elementSignature, meshTopology } from '../domain/topology.js';
import { ARCH_COLORS, ARCH_MATERIALS, isArchKind } from '../domain/arch.js';
import { buildShapes, collectLoops, extrude } from '../domain/stl.js';
import { gridStepFor, niceStep } from './renderer.js';
import { axisUnitFor, displayUnit, gridBaseFor, unitFactor } from '../domain/units.js';

export const PRESETS = ['iso', 'top', 'front', 'right'];
/**
 * Draw styles (FreeCAD's Std_DrawStyle and more): as is (shaded with edges),
 * shaded, flat (no shading), clay, hidden line, X-ray, sketch (pencil on
 * paper), wireframe (edges), mesh (triangles), points.
 */
export const VIEW_STYLES = ['asis', 'shaded', 'flat', 'clay', 'hidden', 'xray', 'sketch', 'wireframe', 'mesh', 'points'];
const PAPER = '#f5f1e6';
const PENCIL = '#2b2a28';

/** A repeatable pseudo-random sequence (the sketch strokes stay put while the view turns). */
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
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

/** FreeCAD's standard views: the direction from the model towards the camera. */
export const VIEW_DIRECTIONS = {
  iso: new THREE.Vector3(1, -1.25, 0.95), home: new THREE.Vector3(1, -1.25, 0.95),
  top: new THREE.Vector3(0, -0.0001, 1), bottom: new THREE.Vector3(0, 0.0001, -1),
  front: new THREE.Vector3(0, -1, 0.0001), rear: new THREE.Vector3(0, 1, 0.0001),
  right: new THREE.Vector3(1, 0, 0.0001), left: new THREE.Vector3(-1, 0, 0.0001),
  // Dimetric: x and y foreshortened alike; trimetric: all three differ.
  dimetric: new THREE.Vector3(1, -1, 0.5), trimetric: new THREE.Vector3(1.7, -1, 0.9),
};

export class View3D {
  constructor(container, { onLightChange, onLightSelect, onPick, onMove } = {}) {
    this.container = container;
    this.onPick = onPick;
    this.onMove = onMove;
    this.onLightChange = onLightChange;
    this.onLightSelect = onLightSelect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    // The light's direction: a dashed line from the origin (0, 0, 0) to the sun, hidden where the
    // model is in front of it, with an arrowhead at the origin pointing where the light goes.
    this.gizmoLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0xffc533, dashSize: 1, gapSize: 1, transparent: true, opacity: 0.75 }));
    this.gizmo.add(this.gizmoBall, this.gizmoSun, this.gizmoLine);
    this.scene.add(this.gizmo);

    this.model = new THREE.Group();
    this.wires = new THREE.Group();
    // 3D wires and datums: in drawing coordinates (not on the working plane like the 2D lines).
    this.lines3d = new THREE.Group();
    this.axes = new THREE.Group();
    this.grid = new THREE.Group();
    this.scene.add(this.model, this.wires, this.lines3d, this.axes, this.grid);

    this.light = { azimuth: 135, elevation: 55, on: true, intensity: 1, color: '#ffffff', shadows: true };
    this.options = { wireframe: false, axes: true, lightMode: false, style: 'asis', handle: 'move' };
    this.styled = new THREE.Group();
    this.scene.add(this.styled);
    this.size = 100;
    this.center = new THREE.Vector3();
    // The sun turns about the drawing origin (0, 0, 0) and shines at it.
    this.lightOrigin = new THREE.Vector3(0, 0, 0);
    this.raycaster = new THREE.Raycaster();
    this.bindLightDrag();
  }

  // ───────────────────────── content

  /**
   * Rebuilds the scene from a drawing. colors: { background, ink, solid, edge, grid, axisText }.
   * Returns { solids, holes, triangles, open }.
   */
  update(drawing, { thickness = 10, colors = {}, extrude2d = true, selected = new Set(), axisLabelScale = 1, plane = null } = {}) {
    this.colors = colors;
    this.axisLabelScale = Math.max(0.2, Math.min(4, axisLabelScale));
    this.gridSize = gridBaseFor(drawing.grid?.size || 10);
    this.thickness = thickness;
    for (const group of [this.model, this.wires, this.lines3d, this.axes, this.grid]) {
      disposeTree(group);
      group.clear();
    }
    this.scene.background = new THREE.Color(colors.background ?? '#20242c');
    const entities = drawing.entities.filter((entity) => isVisible3d(drawing, entity));
    // Sketches on other planes are drawn there as lines, not extruded on the ground.
    const { loops, open } = extrude2d ? collectLoops(entities.filter((entity) => !sketchFrameOf(drawing, entity)), drawing) : { loops: [], open: [] };
    const shapes = buildShapes(loops);
    const triangles = extrude(shapes, thickness);
    const solids = entities.filter((entity) => entity.type === 'solid');
    let solidTriangles = 0;
    // Each solid's triangles in world coordinates, for its faces, edges and vertices (element selection).
    this.entityTris = new Map();
    this.topologies = new Map();
    solids.forEach((entity, index) => {
      const style = styleOf(drawing, entity);
      const own = typeof entity.color === 'string' && entity.color !== AUTO ? entity.color : null;
      const base = isArchKind(entity.kind) ? own ?? entity.material?.color ?? ARCH_COLORS[entity.kind] : style.color === AUTO ? SOLID_PALETTE[index % SOLID_PALETTE.length] : style.color;
      const chosen = selected.has(entity.id);
      // 3D wires (curves in space) and datums (planes, lines, points, coordinate systems): lines, picked like solids.
      if (entity.kind === 'wire3d' || entity.kind === 'datum') {
        this.addLineObject(entity, chosen ? colors.selection ?? '#ff9f1c' : (typeof entity.color === 'string' ? entity.color : entity.kind === 'datum' ? '#7c5cff' : colors.ink ?? '#e6e9ef'));
        return;
      }
      if (entity.kind === 'points') {
        // A point cloud: dots, picked like a solid.
        const pts = solidPoints(entity);
        const positions = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => positions.set(p, i * 3));
        const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
        // A coloured cloud (an inspection result): a colour per point.
        const painted = !chosen && entity.shape?.colors?.length === pts.length * 3;
        if (painted) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(entity.shape.colors), 3));
        const dots = new THREE.Points(geometry, new THREE.PointsMaterial({ color: chosen ? colors.selection ?? '#ff9f1c' : painted ? '#ffffff' : base, size: 3, sizeAttenuation: false, vertexColors: painted }));
        dots.name = `solid:${entity.id}`;
        dots.userData.entity = entity.id;
        dots.userData.points = true;
        this.model.add(dots);
        return;
      }
      // Arch objects come in materials (glass, wood, metal, the light volume of a space).
      for (const { material, tris } of solidMeshGroups(entity)) {
        if (!tris.length) continue;
        solidTriangles += tris.length;
        const all = this.entityTris.get(entity.id) ?? [];
        const offset = all.length;
        all.push(...tris);
        this.entityTris.set(entity.id, all);
        // Layered walls: a group per material colour ("color:#rrggbb").
        const look = material.startsWith('color:') ? { color: material.slice(6) } : ARCH_MATERIALS[material];
        const own = entity.transparency ? 1 - entity.transparency / 100 : 1;
        const mesh = this.meshOf(tris, chosen ? colors.selection ?? '#ff9f1c' : look?.color ?? base, `solid:${entity.id}`, Math.min(look?.opacity ?? 1, own), isArchKind(entity.kind) && material !== 'glass' && material !== 'metal');
        if (entity.texture?.data && !chosen) this.applyTexture(mesh, entity.texture);
        // Draft_ToggleDisplayMode: wireframe (kept through view-style changes).
        if (entity.wireframe) { mesh.material.wireframe = true; mesh.userData.keepMaterial = true; }
        // A colour map (curvature, inspection): a colour per triangle.
        const shades = entity.kind === 'mesh' && !chosen ? entity.shape?.colors : null;
        if (shades?.length === tris.length * 3) {
          const vc = new Float32Array(tris.length * 9);
          for (let i = 0; i < tris.length; i++) for (let j = 0; j < 3; j++) vc.set(shades.slice(i * 3, i * 3 + 3), i * 9 + j * 3);
          mesh.geometry.setAttribute('color', new THREE.BufferAttribute(vc, 3));
          mesh.material.vertexColors = true;
          mesh.material.color.set('#ffffff');
          mesh.userData.keepMaterial = true;
        }
        mesh.userData.entity = entity.id;
        mesh.userData.triOffset = offset;
        if (look?.edges === false) this.model.add(mesh);
        else { const edges = this.edgesOf(mesh.geometry, colors); edges.userData.entity = entity.id; this.model.add(mesh, edges); }
      }
    });
    // Part_ColorPerFace: the faces with a colour of their own, over the solid.
    for (const entity of solids) {
      if (!entity.faceColors?.length || selected.has(entity.id)) continue;
      const topology = this.topologyOf(entity.id);
      const tris = this.entityTris.get(entity.id);
      if (!topology || !tris) continue;
      for (const { signature, color } of entity.faceColors) {
        const index = matchElement(topology, 'face', signature);
        if (index < 0) continue;
        const face = topology.faces[index];
        const positions = new Float32Array(face.triangles.length * 9);
        face.triangles.forEach((t, i) => tris[t].forEach((p, j) => positions.set(p, i * 9 + j * 3)));
        const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const paint = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
        paint.userData.entity = entity.id;
        paint.userData.keepMaterial = true;
        paint.name = `paint:${entity.id}`;
        this.model.add(paint);
      }
    }
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
        const frame = sketchFrameOf(drawing, entity);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map((p) => (frame ? new THREE.Vector3(...frame(p.x, p.y)) : new THREE.Vector3(p.x, p.y, 0.02)))), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
        line.userData.entity = entity.id;
        // A sketch on its own plane stays there when the drawing's 2D moves onto a face.
        (frame ? this.lines3d : this.wires).add(line);
      }
    }
    // On a face's working plane the drawing's 2D lies on that face.
    const onPlane = (object) => {
      if (!plane || !object) return;
      object.matrixAutoUpdate = false;
      object.matrix.set(plane[0], plane[1], plane[2], plane[3], plane[4], plane[5], plane[6], plane[7], plane[8], plane[9], plane[10], plane[11], 0, 0, 0, 1);
      object.matrixWorldNeedsUpdate = true;
    };
    if (plane) {
      onPlane(this.wires);
      onPlane(this.model.children.find((child) => child.name === 'solids'));
      onPlane(this.model.children.find((child) => child.name === 'edges'));
    } else {
      this.wires.matrixAutoUpdate = true;
      this.wires.matrix.identity();
    }
    // Size of the scene.
    const box = new THREE.Box3().setFromObject(this.model);
    box.union(new THREE.Box3().setFromObject(this.wires));
    box.union(new THREE.Box3().setFromObject(this.lines3d));
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, thickness));
    box.getCenter(this.center);
    const extent = box.getSize(new THREE.Vector3());
    this.size = Math.max(extent.x, extent.y, extent.z, 10);
    this.bounds = box;
    this.buildGround(box);
    this.buildAxes(box);
    if (plane) {
      // The working plane: a see-through square on the face, its x and y axes.
      const half = Math.max(this.size * 0.25, 10);
      const square = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
      const axes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(half, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, half, 0)]), new THREE.LineBasicMaterial({ color: 0x3b82f6 }));
      for (const object of [square, axes]) { object.name = 'work-plane'; onPlane(object); this.axes.add(object); }
    }
    this.placeLight();
    this.camera.near = this.camera.isOrthographicCamera ? -this.size * 100 : this.size / 500;
    this.camera.far = this.size * 200;
    this.camera.updateProjectionMatrix();
    this.applyStyle();
    // Std_SelBoundingBox: a box round what is selected.
    if (this.options.selectionBox && selected.size) {
      const chosenBox = this.boundsOf(selected);
      if (!chosenBox.isEmpty()) {
        const helper = new THREE.Box3Helper(chosenBox, new THREE.Color(colors.selection ?? '#ff9f1c'));
        helper.name = 'selection-box';
        this.axes.add(helper);
      }
    }
    // The move / rotate handle on the one selected solid.
    const only = selected.size === 1 ? solids.find((entity) => selected.has(entity.id)) : null;
    this.attachHandle(only ?? null, drawing.grid?.size);
    if (!this.framed) { this.view('iso'); this.framed = true; }
    this.render();
    return { solids: shapes.length + solids.length, plates: shapes.length, parts3d: solids.length, holes: shapes.reduce((sum, shape) => sum + shape.holes.length, 0), triangles: triangles.length + solidTriangles, open: open.length };
  }

  /** A 3D wire's polylines or a datum's glyph, placed like a solid; a see-through square for a datum plane. */
  addLineObject(entity, color) {
    const map = placementOf(entity);
    const group = new THREE.Group();
    group.name = `solid:${entity.id}`;
    group.userData.entity = entity.id;
    const material = new THREE.LineBasicMaterial({ color });
    const lines = entity.kind === 'wire3d' ? (entity.shape?.paths ?? []).map((path) => path.map(map)) : [];
    let glyph = null;
    if (entity.kind === 'datum') {
      glyph = datumGlyph(DATUM_TYPES[entity.params?.type] ?? 'plane', entity.params?.size ?? 50);
      for (const [p, q] of glyph.lines) lines.push([map(p), map(q)]);
    }
    for (const points of lines) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p))), material);
      line.userData.entity = entity.id;
      line.userData.pickable = true;
      group.add(line);
    }
    if (glyph?.plane) {
      const s = glyph.plane / 2;
      const quad = [[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, -s, 0], [s, s, 0], [-s, s, 0]].map(map);
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(quad.flat()), 3));
      const sheet = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      sheet.name = `solid:${entity.id}`;
      sheet.userData.entity = entity.id;
      sheet.userData.keepMaterial = true;
      this.model.add(sheet);
    }
    if (glyph?.point || glyph?.axes) {
      const dot = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(map([0, 0, 0])), 3)), new THREE.PointsMaterial({ color, size: 8, sizeAttenuation: false }));
      dot.userData.entity = entity.id;
      group.add(dot);
    }
    this.lines3d.add(group);
  }

  /** A shaded mesh of triangles (casts and receives shadows). */
  meshOf(triangles, color, name, opacity = 1, matte = false) {
    const positions = new Float32Array(triangles.length * 9);
    triangles.forEach((tri, i) => tri.forEach((p, j) => positions.set(p, i * 9 + j * 3)));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const see = opacity < 1;
    const material = new THREE.MeshStandardMaterial({ color, metalness: see || matte ? 0.05 : 0.35, roughness: matte ? 0.8 : 0.42, wireframe: this.options.wireframe, side: THREE.DoubleSide, transparent: see, opacity, depthWrite: !see });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !see;
    mesh.receiveShadow = true;
    mesh.name = name;
    // What the draw styles start from.
    mesh.userData.look = { color, opacity, matte };
    return mesh;
  }

  /**
   * Gives every solid the materials of the draw style. The meshes stay in the
   * scene (also when only their edges or points show) so clicking still picks.
   */
  applyStyle() {
    const style = VIEW_STYLES.includes(this.options.style) ? this.options.style : 'asis';
    disposeTree(this.styled);
    this.styled.clear();
    const paper = style === 'sketch';
    this.scene.background = new THREE.Color(paper ? PAPER : this.colors?.background ?? '#20242c');
    this.gizmo.visible = this.light.on && style !== 'flat';
    this.updateGrid(true);
    const ground = this.grid.children.find((child) => child.name === 'ground');
    if (ground) ground.visible = !['sketch', 'hidden', 'flat', 'xray', 'wireframe', 'points'].includes(style);
    const background = paper ? PAPER : this.colors?.background ?? '#20242c';
    const random = seeded(7);
    const size = this.size || 100;
    for (const child of this.model.children) {
      // Face colours and datum planes keep their own look in every style.
      if (child.userData.keepMaterial) continue;
      if (child.isMesh) {
        const look = child.userData.look ?? { color: '#9fb4c8', opacity: 1, matte: false };
        const see = look.opacity < 1;
        const common = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
        let material;
        if (style === 'shaded' || style === 'asis') material = new THREE.MeshStandardMaterial({ ...common, color: look.color, metalness: see || look.matte ? 0.05 : 0.35, roughness: look.matte ? 0.8 : 0.42, transparent: see, opacity: look.opacity, depthWrite: !see });
        else if (style === 'flat') material = new THREE.MeshBasicMaterial({ ...common, color: look.color, transparent: see, opacity: look.opacity, depthWrite: !see });
        else if (style === 'clay') material = new THREE.MeshStandardMaterial({ ...common, color: see ? look.color : '#d8d4cc', metalness: 0, roughness: 0.95, transparent: see, opacity: look.opacity, depthWrite: !see });
        else if (style === 'hidden' || style === 'sketch') material = new THREE.MeshBasicMaterial({ ...common, color: background, transparent: see, opacity: see ? 0.35 : 1, depthWrite: !see });
        else if (style === 'xray') material = new THREE.MeshStandardMaterial({ ...common, color: look.color, metalness: 0, roughness: 0.6, transparent: true, opacity: Math.min(look.opacity, 0.22), depthWrite: false });
        else if (style === 'mesh') material = new THREE.MeshStandardMaterial({ color: look.color, wireframe: true });
        else material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        // Std_TextureMapping: the image stays on in the shaded styles.
        if (child.userData.textureMap && (style === 'asis' || style === 'shaded')) { material.map = child.userData.textureMap; material.color.set('#ffffff'); }
        child.material.dispose();
        child.material = material;
        child.castShadow = ['asis', 'shaded', 'clay'].includes(style) && !see;
        child.receiveShadow = ['asis', 'shaded', 'clay'].includes(style);
        if (style === 'points') {
          const dots = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', child.geometry.attributes.position.clone()), new THREE.PointsMaterial({ color: look.color, size: 3, sizeAttenuation: false }));
          dots.name = 'style-points';
          dots.userData.entity = child.userData.entity;
          this.styled.add(dots);
        }
      } else if (child.name === 'edges') {
        child.visible = ['asis', 'hidden', 'xray', 'wireframe', 'flat', 'clay'].includes(style);
        child.material.depthTest = style !== 'xray';
        child.material.transparent = style === 'xray';
        child.material.opacity = style === 'xray' ? 0.75 : 1;
        child.renderOrder = style === 'xray' ? 2 : 0;
        if (style === 'sketch') {
          // Pencil strokes: each edge drawn twice, a little off and running past its ends.
          const src = child.geometry.attributes.position.array;
          const out = [];
          const wobble = size * 0.0016;
          for (let i = 0; i + 5 < src.length; i += 6) {
            const a = [src[i], src[i + 1], src[i + 2]];
            const b = [src[i + 3], src[i + 4], src[i + 5]];
            const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const len = Math.hypot(...d) || 1;
            for (let k = 0; k < 2; k++) {
              const over = Math.min(len * 0.06, size * 0.006) * (0.4 + random());
              const j = () => (random() - 0.5) * 2 * wobble;
              const s = [a[0] - (d[0] / len) * over + j(), a[1] - (d[1] / len) * over + j(), a[2] - (d[2] / len) * over + j()];
              const e = [b[0] + (d[0] / len) * over + j(), b[1] + (d[1] / len) * over + j(), b[2] + (d[2] / len) * over + j()];
              out.push(...s, ...e);
            }
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
          const strokes = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: PENCIL, transparent: true, opacity: 0.8 }));
          strokes.name = 'style-sketch';
          strokes.userData.entity = child.userData.entity;
          this.styled.add(strokes);
        }
      }
    }
    this.render();
  }

  /**
   * Edges to pick (a fillet's or chamfer's): drawn over the model, picked ones
   * orange; a click near one (10 px) calls onPick(key). null ends picking.
   */
  setEdgeOverlay(edges, onPick) {
    if (!this.edgeLayer) { this.edgeLayer = new THREE.Group(); this.edgeLayer.name = 'edge-pick'; this.scene.add(this.edgeLayer); }
    disposeTree(this.edgeLayer);
    this.edgeLayer.clear();
    this.edgePick = edges ? { edges, onPick } : null;
    for (const e of edges ?? []) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(e.points.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: e.picked ? 0xff9f1c : 0x2f9eff, depthTest: false, transparent: true, opacity: e.picked ? 1 : 0.85 }));
      line.renderOrder = 6;
      line.userData.edge = e.key;
      this.edgeLayer.add(line);
    }
    this.canvas.classList.toggle('edge-pick', Boolean(edges));
    this.render();
  }

  /** Std_TextureMapping: an image on a solid, projected along each face's main axis (box mapping). */
  applyTexture(mesh, texture) {
    const geometry = mesh.geometry;
    const pos = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const scale = texture.scale > 0 ? texture.scale : 50;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(normal.getX(i)); const ny = Math.abs(normal.getY(i)); const nz = Math.abs(normal.getZ(i));
      const [u, w] = nz >= nx && nz >= ny ? [pos.getX(i), pos.getY(i)] : nx >= ny ? [pos.getY(i), pos.getZ(i)] : [pos.getX(i), pos.getZ(i)];
      uv[i * 2] = u / scale;
      uv[i * 2 + 1] = w / scale;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.textures ??= new Map();
    let map = this.textures.get(texture.data);
    if (!map) {
      map = new THREE.TextureLoader().load(texture.data, () => this.render());
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(texture.data, map);
    }
    mesh.material.map = map;
    mesh.userData.textureMap = map;
    mesh.material.color.set('#ffffff');
    mesh.material.needsUpdate = true;
  }

  /** Every entity under a screen point (CSS px in the canvas), nearest first (Std_ClarifySelection). */
  entitiesAt(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.model.children.filter((child) => child.isMesh || child.isPoints), false);
    return [...new Set(hits.map((hit) => hit.object.userData.entity).filter(Boolean))];
  }

  /** The next drag on the view draws a box; onRect gets it (CSS px, canvas) — Std_BoxElementSelection. */
  startBoxSelect(onRect) {
    const box = document.createElement('div');
    box.className = 'view3d-zoom-box';
    this.container.append(box);
    this.controls.enabled = false;
    let start = null;
    const rect = () => this.canvas.getBoundingClientRect();
    const down = (event) => { const r = rect(); start = { x: event.clientX - r.left, y: event.clientY - r.top }; event.preventDefault(); event.stopPropagation(); };
    const move = (event) => {
      if (!start) return;
      const r = rect();
      const x = event.clientX - r.left;
      const y = event.clientY - r.top;
      Object.assign(box.style, { left: `${Math.min(x, start.x)}px`, top: `${Math.min(y, start.y)}px`, width: `${Math.abs(x - start.x)}px`, height: `${Math.abs(y - start.y)}px` });
    };
    const up = (event) => {
      box.remove();
      this.controls.enabled = true;
      this.canvas.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!start) return;
      const r = rect();
      const x = event.clientX - r.left;
      const y = event.clientY - r.top;
      onRect({ minX: Math.min(x, start.x), maxX: Math.max(x, start.x), minY: Math.min(y, start.y), maxY: Math.max(y, start.y) });
    };
    this.canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Where 3D points are on the canvas (CSS px). */
  projectToScreen(points) {
    const rect = this.canvas.getBoundingClientRect();
    return points.map((p) => { const v = new THREE.Vector3(...p).project(this.camera); return [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; });
  }

  /**
   * Mesh_PolyCut and friends: the next clicks on the view draw a polygon;
   * a right click, double click or Enter closes it and onPolygon gets its
   * corners (CSS px, canvas) — Escape gives null.
   */
  startPolygonSelect(onPolygon) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'view3d-lasso');
    const line = document.createElementNS(svgNs, 'polyline');
    svg.append(line);
    this.container.append(svg);
    this.controls.enabled = false;
    const corners = [];
    let cursor = null;
    const rect = () => this.canvas.getBoundingClientRect();
    const at = (event) => { const r = rect(); return [event.clientX - r.left, event.clientY - r.top]; };
    const draw = () => line.setAttribute('points', [...corners, ...(cursor ? [cursor] : []), ...(corners.length ? [corners[0]] : [])].map((p) => p.join(',')).join(' '));
    const finish = (result) => {
      svg.remove();
      this.controls.enabled = true;
      this.canvas.removeEventListener('pointerdown', down, true);
      this.canvas.removeEventListener('contextmenu', close, true);
      this.canvas.removeEventListener('dblclick', close, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', key, true);
      onPolygon(result);
    };
    const down = (event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); corners.push(at(event)); draw(); };
    const move = (event) => { cursor = at(event); draw(); };
    const close = (event) => { event.preventDefault(); event.stopPropagation(); finish(corners.length >= 3 ? corners.slice() : null); };
    const key = (event) => {
      if (event.key === 'Enter') { event.preventDefault(); finish(corners.length >= 3 ? corners.slice() : null); }
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
    };
    this.canvas.addEventListener('pointerdown', down, true);
    this.canvas.addEventListener('contextmenu', close, true);
    this.canvas.addEventListener('dblclick', close, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', key, true);
  }

  /** The pickable edges whose whole on-screen line lies inside a rectangle (CSS px, canvas). */
  edgesInRect(box) {
    if (!this.edgePick) return [];
    const rect = this.canvas.getBoundingClientRect();
    const screen = (p) => { const v = new THREE.Vector3(...p).project(this.camera); return [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
    const inside = ([x, y]) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
    return this.edgePick.edges.filter((e) => e.points.map(screen).every(inside));
  }

  /** Faces, edges and vertices of a solid in the view (made when first needed). */
  topologyOf(id) {
    if (!this.topologies.has(id)) {
      const tris = this.entityTris?.get(id);
      this.topologies.set(id, tris ? meshTopology(tris) : null);
    }
    return this.topologies.get(id);
  }

  /** Std / Part element picking: null, 'face', 'edge' or 'vertex'; picks go to onElementPick. */
  setElementMode(kind, onElementPick) {
    this.elementMode = kind ?? null;
    this.onElementPick = onElementPick ?? null;
    this.canvas.classList.toggle('edge-pick', Boolean(kind));
  }

  /** The element under a pointer event: { id, kind, index, signature, point } or null. */
  elementAt(event) {
    const rect = this.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left; const py = event.clientY - rect.top;
    const ndc = new THREE.Vector2((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.model.children.filter((child) => child.isMesh && child.userData.entity), false)[0];
    const screen = (p) => { const v = new THREE.Vector3(...p).project(this.camera); return [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
    if (this.elementMode === 'face') {
      if (!hit) return null;
      const id = hit.object.userData.entity;
      const topology = this.topologyOf(id);
      const tri = (hit.object.userData.triOffset ?? 0) + (hit.faceIndex ?? 0);
      const index = topology?.faceOf[tri] ?? -1;
      return index < 0 ? null : { id, kind: 'face', index, signature: elementSignature(topology, 'face', index), point: hit.point.toArray() };
    }
    // Edges and vertices: the nearest on screen (within 10 px), on the solid under the pointer or any solid.
    const ids = hit ? [hit.object.userData.entity, ...[...this.entityTris.keys()].filter((k) => k !== hit.object.userData.entity)] : [...this.entityTris.keys()];
    let best = null; let bestD = 10;
    for (const id of ids) {
      const topology = this.topologyOf(id);
      if (!topology) continue;
      if (this.elementMode === 'edge') {
        topology.edges.forEach((edge, index) => {
          const pts = edge.points.map(screen);
          for (let i = 0; i + 1 < pts.length; i++) {
            const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1];
            const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
            const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
            const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
            if (d < bestD) { bestD = d; best = { id, kind: 'edge', index, signature: elementSignature(topology, 'edge', index), point: edge.mid }; }
          }
        });
      } else {
        topology.vertices.forEach((vertex, index) => {
          const [x, y] = screen(vertex.point);
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; best = { id, kind: 'vertex', index, signature: elementSignature(topology, 'vertex', index), point: vertex.point }; }
        });
      }
      if (best && hit) break;
    }
    return best;
  }

  /** The selected faces, edges and vertices, drawn over the model. */
  setElementHighlight(list) {
    if (!this.elementLayer) { this.elementLayer = new THREE.Group(); this.elementLayer.name = 'elements'; this.scene.add(this.elementLayer); }
    disposeTree(this.elementLayer);
    this.elementLayer.clear();
    const color = new THREE.Color(this.colors?.selection ?? '#ff9f1c');
    for (const element of list ?? []) {
      const topology = this.topologyOf(element.id);
      const tris = this.entityTris?.get(element.id);
      if (!topology || !tris) continue;
      if (element.kind === 'face' && topology.faces[element.index]) {
        const face = topology.faces[element.index];
        const positions = new Float32Array(face.triangles.length * 9);
        face.triangles.forEach((t, i) => tris[t].forEach((p, j) => positions.set(p, i * 9 + j * 3)));
        const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        mesh.renderOrder = 7;
        this.elementLayer.add(mesh);
      } else if (element.kind === 'edge' && topology.edges[element.index]) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(topology.edges[element.index].points.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color, depthTest: false, linewidth: 3 }));
        line.renderOrder = 8;
        this.elementLayer.add(line);
      } else if (element.kind === 'vertex' && topology.vertices[element.index]) {
        const dot = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(topology.vertices[element.index].point), 3)), new THREE.PointsMaterial({ color, size: 10, sizeAttenuation: false, depthTest: false }));
        dot.renderOrder = 9;
        this.elementLayer.add(dot);
      }
    }
    this.render();
  }

  /** Element selection inside a screen rectangle: faces whose centre or edges whose points lie in it. */
  elementsInRect(box, kind) {
    const rect = this.canvas.getBoundingClientRect();
    const screen = (p) => { const v = new THREE.Vector3(...p).project(this.camera); return [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
    const inside = ([x, y]) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
    const out = [];
    for (const id of this.entityTris?.keys() ?? []) {
      const topology = this.topologyOf(id);
      if (!topology) continue;
      if (kind === 'face') topology.faces.forEach((f, index) => { if (inside(screen(f.center))) out.push({ id, kind, index, signature: elementSignature(topology, kind, index) }); });
      else if (kind === 'edge') topology.edges.forEach((e, index) => { if (e.points.map(screen).every(inside)) out.push({ id, kind, index, signature: elementSignature(topology, kind, index) }); });
      else if (kind === 'vertex') topology.vertices.forEach((v, index) => { if (inside(screen(v.point))) out.push({ id, kind, index, signature: elementSignature(topology, kind, index) }); });
      else {
        const box3 = this.boundsOf(new Set([id]));
        if (!box3.isEmpty() && inside(screen(box3.getCenter(new THREE.Vector3()).toArray()))) out.push({ id, kind: 'object' });
      }
    }
    return out;
  }

  /** The pickable edge nearest a pointer event, within 10 px (screen distance to its segments), or null. */
  edgeAt(event) {
    if (!this.edgePick) return null;
    const rect = this.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left; const py = event.clientY - rect.top;
    const screen = (p) => { const v = new THREE.Vector3(...p).project(this.camera); return [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };
    let best = null; let bestD = 10;
    for (const e of this.edgePick.edges) {
      const pts = e.points.map(screen);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1];
        const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
        const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
        if (d < bestD) { bestD = d; best = e.key; }
      }
    }
    return best;
  }

  /**
   * Animation (FreeCAD Assembly › Animate): each solid's objects moved by a rigid
   * transform (3×4 row-major) from where they were built — no rebuilding per
   * frame. A map of entity id → transform; null puts everything back.
   */
  setPoses(deltas) {
    for (const group of [this.model, this.styled]) {
      for (const child of group.children) {
        const m = deltas?.get(child.userData.entity);
        if (m) {
          child.matrixAutoUpdate = false;
          child.matrix.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], 0, 0, 0, 1);
          child.matrixWorldNeedsUpdate = true;
        } else if (!child.matrixAutoUpdate) {
          child.matrixAutoUpdate = true;
          child.matrix.identity();
          child.matrixWorldNeedsUpdate = true;
        }
      }
    }
    // The move handle would stay where the part was.
    if (this.transform) (this.transform.getHelper ? this.transform.getHelper() : this.transform).visible = !deltas;
    this.render();
  }

  /**
   * The move / rotate handle (FreeCAD's Transform): arrows along X, Y, Z, or a
   * ring about Z, on the selected solid's own origin. Snaps to the grid and to
   * 15°; the solid follows while dragging and onMove reports the change once.
   */
  attachHandle(entity, gridSize = 10) {
    if (!this.transform) {
      this.transform = new TransformControls(this.camera, this.canvas);
      this.transform.setSize(0.9);
      this.pivot = new THREE.Object3D();
      this.scene.add(this.pivot);
      const helper = this.transform.getHelper ? this.transform.getHelper() : this.transform;
      helper.name = 'handle';
      this.scene.add(helper);
      this.transform.addEventListener('dragging-changed', (event) => {
        this.controls.enabled = !event.value;
        if (event.value) { this.handleBusy = true; return; }
        const e = this.handleEntity;
        if (!e) return;
        const start = this.handleStart;
        const p = this.pivot.position;
        const dz = THREE.MathUtils.radToDeg(this.pivot.rotation.z);
        const moved = { dx: p.x - start.x, dy: p.y - start.y, dz: p.z - start.z, drz: dz };
        if (Math.hypot(moved.dx, moved.dy, moved.dz) > 1e-9 || Math.abs(moved.drz) > 1e-9) this.onMove?.(e.id, moved);
      });
      this.transform.addEventListener('objectChange', () => this.followHandle());
      this.transform.addEventListener('mouseDown', () => { this.handleBusy = true; });
    }
    this.handleEntity = entity;
    if (!entity || !this.options.handle) {
      this.transform.detach();
      this.render();
      return;
    }
    this.handleStart = { x: entity.x ?? 0, y: entity.y ?? 0, z: entity.z ?? 0 };
    this.pivot.position.set(this.handleStart.x, this.handleStart.y, this.handleStart.z);
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld();
    this.transform.setMode(this.options.handle === 'rotate' ? 'rotate' : 'translate');
    this.transform.showX = this.options.handle !== 'rotate';
    this.transform.showY = this.options.handle !== 'rotate';
    this.transform.showZ = true;
    this.transform.setTranslationSnap(Math.max(0.001, gridSize || 10));
    this.transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.transform.attach(this.pivot);
    this.render();
  }

  /** While dragging: the selected solid's meshes and edges follow the handle. */
  followHandle() {
    const e = this.handleEntity;
    if (!e) return;
    const s = this.handleStart;
    const m = new THREE.Matrix4().makeTranslation(this.pivot.position.x, this.pivot.position.y, this.pivot.position.z)
      .multiply(new THREE.Matrix4().makeRotationZ(this.pivot.rotation.z))
      .multiply(new THREE.Matrix4().makeTranslation(-s.x, -s.y, -s.z));
    for (const child of this.model.children) {
      if (child.userData.entity !== e.id) continue;
      child.matrixAutoUpdate = false;
      child.matrix.copy(m);
      child.matrixWorldNeedsUpdate = true;
    }
    this.render();
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
    const pxPerMm = 1 / this.worldPerPx(distance, height);
    const step = gridStepFor(this.gridSize ?? 10, pxPerMm);
    const major = step * 5;
    const target = this.controls.target;
    const reach = Math.max(this.worldPerPx(distance, height) * height * 1.5, major * 3);
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
    // On the sketch style's paper the grid is pencil grey; otherwise the theme's. Always 5 × 5.
    const paper = this.options.style === 'sketch';
    lines.add(make(minor, paper ? '#d8d1bf' : this.colors.grid ?? 0x333333, 0.8), make(majors, paper ? '#aaa08a' : this.colors.gridMajor ?? 0x555555, 1));
    lines.userData = { step, major, pxPerCell: step * pxPerMm, minorLines: minor.length / 6, majorLines: majors.length / 6 };
    this.gridLines = lines;
    this.grid.add(lines);
  }

  /** X (red), Y (green), Z (blue) from the origin, with ticks and numbers at "nice" steps. */
  buildAxes(box) {
    const reach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y), box.max.z, 10);
    // Ticks at round values of a unit that keeps the numbers short (m for buildings, mm for parts).
    const unit = axisUnitFor(reach, displayUnit());
    const factor = unitFactor(unit);
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
    this.axisInfo = { step, length, ticks: Math.round(length / step), unit, stepInUnit };
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
      // The axis name carries the unit of its numbers: "X (m)".
      const name = textSprite(`${axis.name} (${unit})`, `#${new THREE.Color(axis.color).getHexString()}`, labelSize * 1.5);
      name.position.copy(axis.dir.clone().multiplyScalar(length + tick * 4 + labelSize));
      if (axis.name !== 'Z') name.position.add(lift);
      name.userData.label = { anchor: axis.dir.clone().multiplyScalar(length + tick * 4), away: axis.dir.clone(), lift: axis.name !== 'Z', px: AXIS_NAME_PX, max: step * 0.45 };
      this.axes.add(line, ticks, head, name);
    }
    this.axes.visible = this.options.axes;
  }

  // ───────────────────────── light

  placeLight() {
    // Where it was put (its own distance), else close enough to stay in view so it can be grabbed.
    const distance = this.light.distance > 0 ? this.light.distance : this.lightDistance();
    const az = THREE.MathUtils.degToRad(this.light.azimuth);
    const el = THREE.MathUtils.degToRad(this.light.elevation);
    const position = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(distance).add(this.lightOrigin);
    this.sun.position.copy(position);
    this.sun.target.position.copy(this.lightOrigin);
    this.sun.visible = this.light.on;
    this.sun.intensity = 2.4 * this.light.intensity;
    this.sun.color.set(this.light.color);
    this.sun.castShadow = this.light.shadows;
    this.hemisphere.intensity = 0.9;
    // With the sun on, the headlight stays as a soft fill: faces turned from the sun are still readable.
    this.headlight.visible = true;
    this.headlight.intensity = this.light.on ? 1.2 : 1.7;
    const camera = this.sun.shadow.camera;
    // Shadows cover the whole model seen from the origin.
    const reach = this.reachFromOrigin();
    camera.left = -reach; camera.right = reach; camera.top = reach; camera.bottom = -reach;
    camera.near = distance * 0.05; camera.far = distance * 4;
    this.sun.shadow.normalBias = this.size * 0.002;
    camera.updateProjectionMatrix();
    this.gizmoBall.position.copy(position);
    this.gizmoSun.position.copy(position);
    this.gizmoSun.material.map = this.light.on ? this.sunIcons.on : this.sunIcons.off;
    this.gizmoSun.material.needsUpdate = true;
    this.gizmoLine.material.color.set(this.light.on ? 0xffc533 : 0x888888);
    this.aimLight(position);
    // Light off — or the no-shading style, which uses no light: no sun at all.
    this.gizmo.visible = this.light.on && this.options.style !== 'flat';
    this.onLightChange?.(this.light);
  }

  /** Is the pointer (already aimed) on the sun? Never while the light is off: the sun is hidden then. */
  overSun() {
    return this.gizmo.visible && this.raycaster.intersectObject(this.gizmoBall).length > 0;
  }

  setLight({ azimuth = this.light.azimuth, elevation = this.light.elevation, on = this.light.on, intensity = this.light.intensity, color = this.light.color, shadows = this.light.shadows, distance = this.light.distance } = {}) {
    this.light = {
      // Anywhere round the origin: any height (straight overhead and below the ground too) and any distance (0 = automatic).
      azimuth: ((azimuth % 360) + 360) % 360, elevation: Math.max(-89.9, Math.min(89.9, elevation)), on, distance: Number(distance) > 0 ? Number(distance) : 0,
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
      if (this.overSun() || this.handleBusy) { this.handleBusy = false; return; }
      // Picking edges: a click takes the nearest edge, never the solid under it.
      if (this.edgePick) { const key = this.edgeAt(event); if (key !== null) this.edgePick.onPick(key); return; }
      // Element selection (Part_FaceSelection / EdgeSelection / VertexSelection): the face, edge or vertex under the click.
      if (this.elementMode) { this.onElementPick?.(this.elementAt(event), event); return; }
      // Lines of 3D wires and datums are picked within a few pixels of them.
      this.raycaster.params.Line.threshold = this.worldPerPx(this.camera.position.distanceTo(this.controls.target)) * 5;
      const pickables = [...this.model.children.filter((child) => child.isMesh && child.name.startsWith('solid:')), ...this.lines3d.children.flatMap((group) => group.children)];
      const hit = this.raycaster.intersectObjects(pickables, false)[0];
      if (hit && !hit.object.name.startsWith('solid:')) {
        this.onPick?.(hit.object.userData.entity, event, { point: hit.point.toArray(), normal: [0, 0, 1] });
        return;
      }
      // The point and the face's normal (the solids' meshes are in drawing coordinates).
      this.onPick?.(hit ? hit.object.name.slice(6) : null, event, hit ? { point: hit.point.toArray(), normal: hit.face?.normal?.toArray() ?? [0, 0, 1] } : null);
    });
  }

  /**
   * Where the light goes for a pointer ray: the ray meets the sphere the sun
   * moves on (the side facing the viewer), so the sun stays under the mouse.
   * A ray that passes the sphere uses its closest point, pushed onto the sphere.
   */
  lightAnglesAt(ray) {
    // Free in space: the sun moves on the plane facing the viewer through where it is now.
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.gizmoSun.position);
    const at = ray.intersectPlane(plane, new THREE.Vector3());
    if (at) {
      const d = at.clone().sub(this.lightOrigin);
      const length = d.length();
      if (length > 1e-6) {
        d.divideScalar(length);
        return { azimuth: THREE.MathUtils.radToDeg(Math.atan2(d.y, d.x)), elevation: THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, d.z)))), distance: length };
      }
    }
    const radius = this.lightDistance();
    const centre = this.lightOrigin;
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

  /** Farthest point of the model from the origin. */
  reachFromOrigin() {
    // The 3D model only (2D notes laid on the ground can reach far out).
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return this.size * 0.5;
    const { min, max } = box;
    return Math.max(this.size * 0.5, Math.hypot(Math.max(Math.abs(min.x), Math.abs(max.x)), Math.max(Math.abs(min.y), Math.abs(max.y)), Math.max(Math.abs(min.z), Math.abs(max.z))));
  }

  /** The sun stands outside the model, round the origin. */
  lightDistance() { return Math.max(this.size * 0.45, this.reachFromOrigin() * 0.85); }


  // ───────────────────────── view

  view(preset, box = null) {
    // Far enough for the model, the axes and the sun (it turns about the origin, so it can be off to one side).
    const sunReach = this.light?.on && !box ? this.center.distanceTo(this.sun.position) * 1.1 : 0;
    const center = box ? box.getCenter(new THREE.Vector3()) : this.center;
    const size = box ? Math.max(...box.getSize(new THREE.Vector3()).toArray(), 1) : this.size;
    const d = Math.max(size, box ? 0 : (this.axisInfo?.length ?? 0) * 1.1, sunReach) * 2.3;
    const keep = this.camera.position.clone().sub(this.controls.target);
    const direction = (VIEW_DIRECTIONS[preset] ?? (preset === 'keep' && keep.length() > 1e-9 ? keep : VIEW_DIRECTIONS.iso)).clone().normalize();
    this.setUp([0, 0, 1]);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, d);
    this.camera.lookAt(center);
    if (this.camera.isOrthographicCamera) { this.camera.zoom = 1; this.fitOrtho(d); }
    this.controls.update();
    if (preset !== 'keep') this.preset = preset;
    this.render();
  }

  /** Frames a box (Std_ViewFitSelection), looking from where the camera is. */
  fitBox(box) {
    if (!box || box.isEmpty()) return;
    this.view('keep', box);
  }

  /** The bounds of the meshes of some entities. */
  boundsOf(ids) {
    const box = new THREE.Box3();
    for (const child of [...this.model.children, ...this.lines3d.children]) if ((child.isMesh || child.isPoints || child.isGroup) && ids.has(child.userData.entity)) box.expandByObject(child);
    return box;
  }

  /** World units per screen pixel at a distance from a perspective camera, or anywhere for an orthographic one. */
  worldPerPx(distance, height = this.canvas.clientHeight || this.canvas.height || 600) {
    if (this.camera.isOrthographicCamera) return (this.camera.top - this.camera.bottom) / this.camera.zoom / height;
    return (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / height;
  }

  /** The camera's up vector; OrbitControls take it when made, so they are made again. */
  setUp(up) {
    const next = new THREE.Vector3(...up).normalize();
    if (this.camera.up.distanceTo(next) < 1e-9) return;
    this.camera.up.copy(next);
    this.makeControls();
  }

  makeControls() {
    const target = this.controls?.target.clone() ?? new THREE.Vector3();
    const enabled = this.controls?.enabled ?? true;
    this.controls?.dispose();
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.target.copy(target);
    this.controls.enabled = enabled;
    this.controls.autoRotate = Boolean(this.turntable);
    this.controls.autoRotateSpeed = this.turntable?.speed ?? 2;
    this.controls.addEventListener('change', () => { this.updateGrid(); this.render(); });
    this.controls.update();
    if (this.transform) this.transform.camera = this.camera;
  }

  /** Std_ViewRotateLeft / Right: turns the view 90° about the line of sight. */
  rotateView(degrees) {
    const sight = this.controls.target.clone().sub(this.camera.position).normalize();
    const up = this.camera.up.clone().applyAxisAngle(sight, THREE.MathUtils.degToRad(-degrees));
    this.setUp(up.toArray());
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.render();
  }

  /** Std_OrthographicCamera / Std_PerspectiveCamera. */
  setProjection(kind) {
    const ortho = kind === 'ortho';
    if (ortho === Boolean(this.camera.isOrthographicCamera)) return;
    const old = this.camera;
    const distance = old.position.distanceTo(this.controls.target);
    const camera = ortho ? new THREE.OrthographicCamera(-1, 1, 1, -1, old.near, old.far) : new THREE.PerspectiveCamera(40, this.aspect ?? 1, Math.max(old.near, this.size / 500), old.far);
    camera.position.copy(old.position);
    camera.up.copy(old.up);
    camera.quaternion.copy(old.quaternion);
    old.remove(this.headlight, this.headlight.target);
    camera.add(this.headlight, this.headlight.target);
    this.scene.remove(old);
    this.scene.add(camera);
    this.camera = camera;
    if (ortho) { camera.near = -this.size * 100; this.fitOrtho(distance); }
    camera.updateProjectionMatrix();
    this.makeControls();
    this.updateGrid(true);
    this.render();
  }

  /** The orthographic frustum that shows what the perspective camera showed at that distance. */
  fitOrtho(distance) {
    if (!this.camera.isOrthographicCamera) return;
    const half = distance * Math.tan(THREE.MathUtils.degToRad(20));
    const aspect = this.aspect ?? 1;
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
  }

  /** The camera as data (Std_ViewSaveCamera, Std_StoreWorkingView, Std_FreezeViews, Std_ViewIvIssueCamPos). */
  getCamera() {
    const round = (v) => +v.toFixed(6);
    return {
      position: this.camera.position.toArray().map(round),
      target: this.controls.target.toArray().map(round),
      up: this.camera.up.toArray().map(round),
      projection: this.camera.isOrthographicCamera ? 'ortho' : 'perspective',
      zoom: this.camera.zoom ?? 1,
    };
  }

  setCamera(camera) {
    if (!camera) return;
    this.setProjection(camera.projection);
    this.setUp(camera.up ?? [0, 0, 1]);
    this.controls.target.set(...camera.target);
    this.camera.position.set(...camera.position);
    if (this.camera.isOrthographicCamera) {
      this.fitOrtho(this.camera.position.distanceTo(this.controls.target));
      this.camera.zoom = camera.zoom ?? 1;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.render();
  }

  /** Std_ToggleClipPlane: axis planes x, y, z and one across the line of sight, each { on, offset, flip }. */
  setClipping(planes) {
    this.clipping = planes ?? null;
    const list = [];
    const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    for (const [key, normal] of Object.entries(axes)) {
      const plane = planes?.[key];
      if (!plane?.on) continue;
      // Keeps what is below the offset (or above it, flipped).
      const n = new THREE.Vector3(...normal).multiplyScalar(plane.flip ? 1 : -1);
      list.push(new THREE.Plane(n, plane.flip ? -plane.offset : plane.offset));
    }
    // Sketcher_ViewSection: a plane through a sketch, keeping what is behind it.
    if (planes?.custom) list.push(new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...planes.custom.normal).normalize(), new THREE.Vector3(...planes.custom.point)));
    if (planes?.view?.on) {
      const sight = this.controls.target.clone().sub(this.camera.position).normalize();
      const point = this.controls.target.clone().addScaledVector(sight, planes.view.offset ?? 0);
      list.push(new THREE.Plane().setFromNormalAndCoplanarPoint(sight.negate(), point));
    }
    this.renderer.clippingPlanes = list;
    this.render();
  }

  /** Std_DemoMode: the view turns about the vertical axis by itself. */
  setTurntable(on, speed = 2) {
    this.turntable = on ? { speed } : null;
    this.controls.autoRotate = Boolean(on);
    this.controls.autoRotateSpeed = speed;
    cancelAnimationFrame(this.turntableFrame);
    const spin = () => {
      if (!this.turntable) return;
      this.controls.update();
      this.render();
      this.turntableFrame = requestAnimationFrame(spin);
    };
    if (on) spin();
  }

  /** Std_ViewIvStereo*: off, anaglyph (red/cyan), interleaved rows, interleaved columns, side by side. */
  setStereo(mode) {
    this.stereo = mode && mode !== 'off' ? mode : null;
    this.render();
  }

  renderStereo() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const ratio = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(size.x * ratio));
    const h = Math.max(1, Math.floor(size.y * ratio));
    if (!this.stereoRig || this.stereoRig.w !== w || this.stereoRig.h !== h) {
      this.stereoRig?.left.dispose();
      this.stereoRig?.right.dispose();
      const target = () => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter });
      const material = new THREE.ShaderMaterial({
        uniforms: { left: { value: null }, right: { value: null }, mode: { value: 0 }, size: { value: new THREE.Vector2(w, h) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: [
          'uniform sampler2D left; uniform sampler2D right; uniform int mode; uniform vec2 size; varying vec2 vUv;',
          'void main() {',
          '  vec4 l = texture2D(left, vUv); vec4 r = texture2D(right, vUv);',
          '  if (mode == 0) { gl_FragColor = vec4(dot(l.rgb, vec3(0.299, 0.587, 0.114)), r.g, r.b, 1.0); }',
          '  else if (mode == 1) { gl_FragColor = mod(floor(vUv.y * size.y), 2.0) < 1.0 ? l : r; }',
          '  else if (mode == 2) { gl_FragColor = mod(floor(vUv.x * size.x), 2.0) < 1.0 ? l : r; }',
          '  else { gl_FragColor = vUv.x < 0.5 ? texture2D(left, vec2(vUv.x * 2.0, vUv.y)) : texture2D(right, vec2(vUv.x * 2.0 - 1.0, vUv.y)); }',
          '}',
        ].join('\n'),
        depthTest: false,
        depthWrite: false,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
      this.stereoRig = { w, h, left: target(), right: target(), material, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), eyes: new THREE.StereoCamera() };
    }
    const rig = this.stereoRig;
    this.camera.updateMatrixWorld();
    rig.eyes.eyeSep = Math.max(0.064, this.camera.position.distanceTo(this.controls.target) / 30);
    rig.eyes.update(this.camera);
    this.renderer.setRenderTarget(rig.left);
    this.renderer.render(this.scene, rig.eyes.cameraL);
    this.renderer.setRenderTarget(rig.right);
    this.renderer.render(this.scene, rig.eyes.cameraR);
    this.renderer.setRenderTarget(null);
    rig.material.uniforms.left.value = rig.left.texture;
    rig.material.uniforms.right.value = rig.right.texture;
    rig.material.uniforms.mode.value = { anaglyph: 0, rows: 1, columns: 2, sideBySide: 3 }[this.stereo] ?? 0;
    rig.material.uniforms.size.value.set(w, h);
    this.renderer.render(rig.scene, rig.camera);
  }

  /** Std_ViewBoxZoom: the next drag on the view draws a box, and the view zooms to it. */
  startBoxZoom(done) {
    const box = document.createElement('div');
    box.className = 'view3d-zoom-box';
    this.container.append(box);
    this.controls.enabled = false;
    let start = null;
    const rect = () => this.canvas.getBoundingClientRect();
    const down = (event) => { const r = rect(); start = { x: event.clientX - r.left, y: event.clientY - r.top }; event.preventDefault(); };
    const move = (event) => {
      if (!start) return;
      const r = rect();
      const x = event.clientX - r.left;
      const y = event.clientY - r.top;
      Object.assign(box.style, { left: `${Math.min(x, start.x)}px`, top: `${Math.min(y, start.y)}px`, width: `${Math.abs(x - start.x)}px`, height: `${Math.abs(y - start.y)}px` });
    };
    const finish = () => {
      box.remove();
      this.controls.enabled = true;
      this.canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      done?.();
    };
    const up = (event) => {
      if (start) {
        const r = rect();
        this.zoomToRect(start, { x: event.clientX - r.left, y: event.clientY - r.top }, r.width, r.height);
      }
      finish();
    };
    this.canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Zooms so the screen rectangle a–b fills the view (its middle becomes the centre). */
  zoomToRect(a, b, width, height) {
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (w < 4 || h < 4) return;
    const ndc = new THREE.Vector2(((a.x + b.x) / 2 / width) * 2 - 1, -(((a.y + b.y) / 2 / height) * 2 - 1));
    const sight = this.controls.target.clone().sub(this.camera.position).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(sight, this.controls.target);
    this.raycaster.setFromCamera(ndc, this.camera);
    const center = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? this.controls.target.clone();
    const factor = Math.max(w / width, h / height);
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(center);
    if (this.camera.isOrthographicCamera) {
      this.camera.position.copy(center).add(offset);
      this.camera.zoom /= factor;
      this.camera.updateProjectionMatrix();
    } else this.camera.position.copy(center).add(offset.multiplyScalar(factor));
    this.controls.update();
    this.render();
  }

  fit() { this.view(this.preset ?? 'iso'); }

  setOption(key, value) {
    this.options[key] = value;
    // The old wireframe switch is the mesh style.
    if (key === 'wireframe') this.options.style = value ? 'mesh' : 'asis';
    if (key === 'style') this.options.wireframe = value === 'mesh';
    if (key === 'wireframe' || key === 'style') this.applyStyle();
    if (key === 'handle') this.attachHandle(this.handleEntity ?? null, this.gridSize);
    if (key === 'axes') this.axes.visible = value;
    this.canvas.classList.toggle('light-mode', Boolean(this.options.lightMode));
    this.render();
  }

  /** Zooms towards the target (toolbar / Ctrl + wheel). */
  zoom(factor) {
    if (this.camera.isOrthographicCamera) {
      this.camera.zoom *= factor;
      this.camera.updateProjectionMatrix();
    } else {
      const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(1 / factor);
      this.camera.position.copy(this.controls.target).add(offset);
    }
    this.controls.update();
    this.render();
  }

  resize(width, height) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.aspect = width / height;
    if (this.camera.isOrthographicCamera) {
      const zoom = this.camera.zoom;
      this.fitOrtho(this.camera.position.distanceTo(this.controls.target));
      this.camera.zoom = zoom;
    } else this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.updateGrid();
    this.render();
  }

  render() {
    this.sizeSun();
    this.sizeLabels();
    if (this.stereo) this.renderStereo();
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Axis numbers and names keep their size on screen (AXIS_NUMBER_PX × the
   * setting) however close the camera is — at most a fraction of a tick step,
   * so far away they shrink instead of running into each other.
   */
  sizeLabels() {
    if (!this.axes?.visible) return;
    const height = this.canvas.clientHeight || this.canvas.height || 600;
    const scale = this.axisLabelScale ?? 1;
    for (const sprite of this.axes.children) {
      const label = sprite.userData.label;
      if (!label) continue;
      const distance = Math.max(1e-6, this.camera.position.distanceTo(sprite.position));
      const size = Math.min(label.px * scale * this.worldPerPx(distance, height), label.max * scale);
      sprite.scale.set(size * sprite.userData.aspect, size, 1);
      sprite.position.copy(label.anchor).addScaledVector(label.away, size * 0.6);
      if (label.lift) sprite.position.z += size * 0.75;
    }
  }

  /** The light's line: from the origin (0, 0, 0) to the sun (no arrowhead — the user asked for none). */
  aimLight(position = this.gizmoSun.position) {
    if (this.lightOrigin.distanceTo(position) < 1e-9) return;
    const end = this.lightOrigin.clone();
    this.gizmoLine.geometry.setFromPoints([end, position]);
    this.gizmoLine.computeLineDistances();
    this.sizeSun();
  }

  /**
   * Keeps the sun the same size on screen (SUN_PX) however far the camera is:
   * its world size follows its distance from the camera. Its pick sphere too.
   */
  sizeSun() {
    if (!this.gizmoSun || !this.gizmo.visible) return;
    const height = this.canvas.clientHeight || this.canvas.height || 600;
    const distance = Math.max(1e-6, this.camera.position.distanceTo(this.gizmoSun.position));
    const worldPerPx = this.worldPerPx(distance, height);
    this.gizmoSun.scale.setScalar(SUN_PX * worldPerPx);
    this.gizmoBall.scale.setScalar((SUN_PX / 2) * worldPerPx);
    // The dashes keep their size on screen too (measured at the origin end).
    const far = Math.max(1e-6, this.camera.position.distanceTo(this.lightOrigin));
    const perPx = this.worldPerPx(far, height);
    this.gizmoLine.material.dashSize = 8 * perPx;
    this.gizmoLine.material.gapSize = 6 * perPx;
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
        return Math.max(0, ...this.axes.children.filter((child) => child.name.startsWith('tick-')).map((sprite) => (sprite.scale.y / (this.worldPerPx(this.camera.position.distanceTo(sprite.position), height) * height)) * height));
      })(),
      light: { ...this.light, position: this.sun.position.toArray(), visible: this.sun.visible, basicLight: this.headlight.visible && !this.light.on, fill: this.headlight.intensity, sunShown: this.gizmo.visible, sunPx: (() => { this.sizeSun(); const d = this.camera.position.distanceTo(this.gizmoSun.position); return this.gizmoSun.scale.y / this.worldPerPx(d, this.canvas.clientHeight || 600); })(), marker: this.gizmoSun.material.map === this.sunIcons.on ? 'sun' : 'sunOff' },
      wireframe: Boolean(solids?.material.wireframe),
      style: this.options.style,
      handle: this.transform?.object ? { mode: this.transform.mode, entity: this.handleEntity?.id ?? null, at: this.pivot.position.toArray() } : null,
      styleObjects: this.styled.children.map((child) => child.name),
      background: `#${this.scene.background.getHexString()}`,
      camera: this.camera.position.toArray(),
      sunScreen: (() => { const p = this.gizmoBall.position.clone().project(this.camera); const r = this.canvas.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; })(),
    };
  }

  /** Std_ViewVR: the scene in a VR headset (WebXR), when the browser and a headset allow it. */
  async startVr() {
    if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr').catch(() => false))) return false;
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    this.renderer.xr.enabled = true;
    await this.renderer.xr.setSession(session);
    this.renderer.setAnimationLoop(() => this.renderer.render(this.scene, this.camera));
    session.addEventListener('end', () => { this.renderer.setAnimationLoop(null); this.renderer.xr.enabled = false; this.render(); });
    return true;
  }

  dispose() {
    cancelAnimationFrame(this.turntableFrame);
    this.turntable = null;
    this.controls.dispose();
    disposeTree(this.scene);
    this.renderer.dispose();
    this.canvas.remove();
  }
}

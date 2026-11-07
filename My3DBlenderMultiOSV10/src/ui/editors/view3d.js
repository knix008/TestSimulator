// The 3D viewport: navigation, shading, selection, modal transforms, edit-mode tools, sculpt and paint strokes.
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GEOMETRY_TYPES, activeObject, evaluatedMesh, getObject, rotationFromQuat, rotationQuat, selectedObjects, worldBounds, worldMatrix } from '../../core/doc.js';
import { edgeMap, faceCenter, faceNormal, selVSet, setFaceSelection, toTriangles, triangulateIndices, v3, selectionCenter } from '../../core/mesh.js';
import { allOps, getOp, selectionPivot, touch } from '../../core/ops.js';
import { SCULPT_BRUSHES, sculptDab, vertexPaintDab, weightColor, weightPaintDab } from '../../core/sculpt.js';
import { PAINT_BLENDS, texturePaintDab } from '../../core/paint.js';
import { PROPORTIONAL_FALLOFFS, proportionalWeights } from '../../core/meshops.js';
import { dyntopoRefine, multiresSculpt } from '../../core/remesh.js';
import { catmullClark } from '../../core/modifiers.js';
import { baseColorImage } from '../sync.js';
import { onionFrames } from '../../core/scenes.js';
import { encodeImageData } from '../render.js';
import { MODIFIERS } from '../../core/modifiers.js';
import { h, replace, svg } from '../dom.js';
import { icon } from '../icons.js';
import { enumName, nameOf, t } from '../i18n.js';
import { menuTitle, openMenu, openMenuBelow } from '../menus.js';
import { COLORS, SceneSync } from '../sync.js';
import { colorField, numField, panel, row, select, toggle, vecField, button, sideHead } from '../widgets.js';
import { knifeCut } from '../../core/meshtools.js';
import { propsForm } from '../opform.js';

const DEG = Math.PI / 180;
const MODE_ICON = { OBJECT: 'object', EDIT: 'mesh', SCULPT: 'tool-brush', VERTEX_PAINT: 'tool-brush', WEIGHT_PAINT: 'tool-brush', TEXTURE_PAINT: 'tool-brush', POSE: 'armature', PAINT_GPENCIL: 'gpencil' };
const SHADINGS = [['WIRE', 'wire', 'Wireframe', '와이어프레임'], ['SOLID', 'solid', 'Solid', '솔리드'], ['MATERIAL', 'shaded', 'Material Preview', '재질 미리보기'], ['RENDERED', 'rendered', 'Rendered', '렌더']];

/** Tool choice survives switching workspaces. */
export const sessionTool = { name: 'select', brush: 'DRAW', radius: 0.5, strength: 0.5, symmetryX: false, symmetryY: false, symmetryZ: false, paintColor: [1, 0.2, 0.1], weight: 1, paintBlend: 'MIX', group: '', dyntopo: false, detail: 0.1 };

export function createView3D(app, el, area) {
  const state = area.state ??= { shading: area.shading ?? 'SOLID', xray: false, grid: app.settings.viewGrid !== false, sidebar: false, toolbar: true, stats: false, wire: false, target: [0, 0, 0.5], dist: 18, yaw: 18, pitch: 22, persp: true, camView: false };
  const root = h('div', { className: 'view3d', dataset: { testid: 'view3d' } });
  const canvas = h('canvas', { className: 'gl', tabIndex: 0, dataset: { testid: 'gl-canvas' } });
  root.append(canvas);
  el.append(root);

  let renderer;
  let failed = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  } catch (error) {
    failed = String(error?.message ?? error);
    root.append(h('div', { className: 'empty-note', dataset: { testid: 'webgl-error' } }, t(`3D drawing is not available: ${failed}`, `3D 표시를 사용할 수 없습니다: ${failed}`)));
    return { dispose() { root.remove(); }, update() {}, header(hdr) { hdr.append(); }, onKey: () => false };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.debug.checkShaderErrors = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const sync = new SceneSync();
  const scene = sync.scene;
  const persp = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  persp.up.set(0, 0, 1);
  ortho.up.set(0, 0, 1);
  let camera = persp;

  // Studio light for Solid; environment for Material Preview.
  const studio = new THREE.Group();
  const head = new THREE.DirectionalLight(0xffffff, 1.4);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  const amb = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
  studio.add(head, fill, amb, head.target, fill.target);
  scene.add(studio);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment = null;
  const envMap = () => (environment ??= pmrem.fromScene(new RoomEnvironment(), 0.04).texture);

  // ── Overlays: grid, axes, 3D cursor, origins, edit cage
  let rightDragged = false;
  const overlays = new THREE.Group();
  scene.add(overlays);
  // The grid is five by five: every fifth line is a major one. Its spacing goes by powers of five with the view, so a cell keeps a
  // useful size on screen at any zoom, and it follows the view's centre. Lines are cut into one-cell pieces: a single line running
  // past the camera can vanish whole when a driver clips it.
  // It is drawn first and takes no part in depth, so it is always behind the shapes and never fights with a floor. It fades with
  // distance: far away, lines closer together than the pixels would only make noise. Looking straight along an axis it stands
  // across the view, since a floor seen edge-on would be one line.
  const gridMaterial = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false });
  const grid = new THREE.Group();
  overlays.add(grid);
  const GRID_CELLS = 80;
  let gridKey = '';
  let gridSpacing = 1;
  let gridPlane = 'XY';
  let gridStyle = { bg: '#3b3b3b', text: '#dcdcdc' };
  const axisPlane = () => {
    if (state.camView || Math.abs(state.pitch) >= 0.5) return 'XY';
    const turn = state.yaw / 90;
    if (Math.abs(turn - Math.round(turn)) > 0.006) return 'XY';
    return Math.abs(Math.round(turn)) % 2 === 0 ? 'XZ' : 'YZ';
  };
  const updateGrid = () => {
    const level = Math.floor(Math.log(Math.max(state.dist, 1e-3) / 4) / Math.log(5));
    const s = 5 ** level;
    const plane = axisPlane();
    const [uAt, vAt] = { XY: [0, 1], XZ: [0, 2], YZ: [1, 2] }[plane];
    // On major lines, so that the pattern does not shift under the eye as the centre moves.
    const cu = Math.round(state.target[uAt] / (5 * s)) * 5;
    const cv = Math.round(state.target[vAt] / (5 * s)) * 5;
    const key = `${level},${plane},${cu},${cv},${gridStyle.bg},${gridStyle.text}`;
    if (key === gridKey) return;
    gridKey = key;
    gridSpacing = s;
    gridPlane = plane;
    for (const child of [...grid.children]) { child.geometry.dispose(); grid.remove(child); }
    const bg = new THREE.Color(gridStyle.bg);
    const ink = new THREE.Color(gridStyle.text);
    const minorColor = bg.clone().lerp(ink, 0.2);
    const majorColor = bg.clone().lerp(ink, 0.42);
    const AXIS = { X: new THREE.Color(0xd0505f), Y: new THREE.Color(0x7fb034), Z: new THREE.Color(0x4f86d6) };
    const [uAxis, vAxis] = [AXIS[plane[0]], AXIS[plane[1]]];
    const n = GRID_CELLS;
    const buckets = { minor: [[], []], major: [[], []], axis: [[], []] };
    const c = new THREE.Color();
    const put = (bucket, color, reach, u, v) => {
      const p = [0, 0, 0];
      p[uAt] = u * s;
      p[vAt] = v * s;
      buckets[bucket][0].push(p[0], p[1], p[2]);
      const k = Math.hypot(u - cu, v - cv) / (n * reach);
      const fade = Math.max(0, 1 - k * k);
      c.copy(bg).lerp(color, fade);
      buckets[bucket][1].push(c.r, c.g, c.b);
    };
    const segment = (index, axisColor, u0, v0, u1, v1) => {
      const [bucket, color, reach] = index === 0 ? ['axis', axisColor, 1.2] : index % 5 === 0 ? ['major', majorColor, 1] : ['minor', minorColor, 0.55];
      put(bucket, color, reach, u0, v0);
      put(bucket, color, reach, u1, v1);
    };
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j < n; j++) {
        segment(cu + i, vAxis, cu + i, cv + j, cu + i, cv + j + 1);
        segment(cv + i, uAxis, cu + j, cv + i, cu + j + 1, cv + i);
      }
    }
    // Minor first, so that the heavier lines lie on top.
    const positions = [...buckets.minor[0], ...buckets.major[0], ...buckets.axis[0]];
    const colors = [...buckets.minor[1], ...buckets.major[1], ...buckets.axis[1]];
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(geometry, gridMaterial);
    lines.renderOrder = -1000;
    lines.frustumCulled = false;
    grid.add(lines);
  };
  const cursor3d = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute((() => {
    const out = [];
    for (let i = 0; i < 24; i++) { const [a, b] = [(i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2]; out.push(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0, Math.cos(b) * 0.15, Math.sin(b) * 0.15, 0); }
    out.push(-0.3, 0, 0, -0.17, 0, 0, 0.17, 0, 0, 0.3, 0, 0, 0, -0.3, 0, 0, -0.17, 0, 0, 0.17, 0, 0, 0.3, 0);
    return out;
  })(), 3)), new THREE.LineBasicMaterial({ color: 0xff4040, depthTest: false, transparent: true }));
  cursor3d.renderOrder = 10;
  overlays.add(cursor3d);
  const originsGeo = new THREE.BufferGeometry();
  const origins = new THREE.Points(originsGeo, new THREE.PointsMaterial({ color: COLORS.active, size: 6, sizeAttenuation: false, depthTest: false, transparent: true }));
  origins.renderOrder = 11;
  overlays.add(origins);

  const cage = new THREE.Group();
  cage.matrixAutoUpdate = false;
  scene.add(cage);
  const cageMats = {
    edge: new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 }),
    edgeSel: new THREE.LineBasicMaterial({ color: COLORS.editSel }),
    vert: new THREE.PointsMaterial({ color: 0x000000, size: 4, sizeAttenuation: false }),
    vertSel: new THREE.PointsMaterial({ color: COLORS.editSel, size: 5, sizeAttenuation: false }),
    face: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
    faceSel: new THREE.MeshBasicMaterial({ color: COLORS.editFace, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  };
  cageMats.seam = new THREE.LineBasicMaterial({ color: 0xe04040, depthTest: cageMats.edge.depthTest });
  cageMats.sharp = new THREE.LineBasicMaterial({ color: 0x28c8d8, depthTest: cageMats.edge.depthTest });
  cageMats.crease = new THREE.LineBasicMaterial({ color: 0xd040c0, depthTest: cageMats.edge.depthTest });
  /** The points Edit Mode moves on curves and surfaces: the arrays themselves, so that writing to them changes the object. */
  const controlPoints = (obj) => (obj.type === 'SURFACE' ? obj.data.points : obj.data.splines.flatMap((s) => s.points));
  const clearCage = () => {
    for (const c of [...cage.children]) { cage.remove(c); c.geometry?.dispose(); }
  };
  const buildCage = () => {
    clearCage();
    const doc = app.doc;
    const obj = activeObject(doc);
    if (doc.mode === 'EDIT' && (obj?.type === 'CURVE' || obj?.type === 'SURFACE')) {
      cage.matrix.copy(worldMatrix(doc, obj));
      cage.matrixWorldNeedsUpdate = true;
      const points = controlPoints(obj);
      const lines = [];
      if (obj.type === 'SURFACE') {
        const { pointsU: nu, pointsV: nv, points: list, cyclicU, cyclicV } = obj.data;
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
          const p = list[i + j * nu];
          if (i < nu - 1 || cyclicU) lines.push(p[0], p[1], p[2], ...list[((i + 1) % nu) + j * nu].slice(0, 3));
          if (j < nv - 1 || cyclicV) lines.push(p[0], p[1], p[2], ...list[i + ((j + 1) % nv) * nu].slice(0, 3));
        }
      } else {
        for (const s of obj.data.splines) s.points.forEach((p, i) => { const q = s.points[(i + 1) % s.points.length]; if (i < s.points.length - 1 || s.cyclic) lines.push(p[0], p[1], p[2], q[0], q[1], q[2]); });
      }
      if (lines.length) cage.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)), cageMats.edge));
      const [normal, chosen] = [[], []];
      points.forEach((p, i) => (state.pointSel?.includes(i) ? chosen : normal).push(p[0], p[1], p[2]));
      const add = (pts, mat) => { if (pts.length) cage.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), mat)); };
      add(normal, cageMats.vert);
      add(chosen, cageMats.vertSel);
      return;
    }
    if (doc.mode !== 'EDIT' || obj?.type !== 'MESH') return;
    cage.matrix.copy(worldMatrix(doc, obj));
    cage.matrixWorldNeedsUpdate = true;
    const mesh = obj.data;
    const sel = new Set(mesh.selV);
    const selectedF = mesh.selMode === 'face' ? new Set(mesh.selF) : null;
    const isFaceSel = (f, face) => (selectedF ? selectedF.has(f) : face.every((i) => sel.has(i)));
    const [edgeN, edgeS] = [[], []];
    for (const e of edgeMap(mesh).values()) {
      const selected = selectedF ? e.faces.some((f) => selectedF.has(f)) : sel.has(e.a) && sel.has(e.b);
      (selected ? edgeS : edgeN).push(...mesh.verts[e.a], ...mesh.verts[e.b]);
    }
    const lines = (pts, mat) => { if (pts.length) cage.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), mat)); };
    lines(edgeN, cageMats.edge);
    lines(edgeS, cageMats.edgeSel);
    for (const [kind, mat] of [['crease', cageMats.crease], ['sharp', cageMats.sharp], ['seam', cageMats.seam]]) {
      const pts = [];
      for (const key of Object.keys(mesh.marks?.[kind] ?? {})) {
        const [a, b] = key.split('_').map(Number);
        if (mesh.verts[a] && mesh.verts[b]) pts.push(...mesh.verts[a], ...mesh.verts[b]);
      }
      lines(pts, mat);
    }
    if (mesh.selMode !== 'face') {
      const [vN, vS] = [[], []];
      mesh.verts.forEach((v, i) => (sel.has(i) ? vS : vN).push(...v));
      const points = (pts, mat) => { if (pts.length) cage.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), mat)); };
      points(vN, cageMats.vert);
      points(vS, cageMats.vertSel);
    }
    const tri = toTriangles({ ...mesh, smooth: false, colors: null, uvs: null });
    const [fN, fS] = [[], []];
    tri.triFace.forEach((f, t) => {
      const list = isFaceSel(f, mesh.faces[f]) ? fS : fN;
      for (let k = 0; k < 9; k++) list.push(tri.positions[t * 9 + k]);
    });
    const faces = (pts, mat) => { if (pts.length) cage.add(new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), mat)); };
    faces(fN, cageMats.face);
    faces(fS, cageMats.faceSel);
    if (mesh.selMode === 'face') {
      const dots = [];
      mesh.faces.forEach((f) => dots.push(...faceCenter(mesh, f)));
      cage.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dots, 3)), cageMats.vert));
    }
  };

  // ── Transform gizmo
  const proxy = new THREE.Object3D();
  scene.add(proxy);
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(0.8);
  gizmo.attach(proxy);
  const gizmoHelper = gizmo.getHelper();
  scene.add(gizmoHelper);
  let gizmoStart = null;
  gizmo.addEventListener('dragging-changed', (e) => {
    if (e.value) {
      gizmoStart = { xform: beginXform(), pos: proxy.position.clone(), quat: proxy.quaternion.clone(), scale: proxy.scale.clone() };
    } else if (gizmoStart) {
      const name = { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[gizmo.mode];
      gizmoStart = null;
      proxy.scale.set(1, 1, 1);
      proxy.quaternion.identity();
      app.commit(name);
    }
  });
  gizmo.addEventListener('objectChange', () => {
    if (!gizmoStart) return;
    const delta = proxy.position.clone().sub(gizmoStart.pos);
    const turn = proxy.quaternion.clone().multiply(gizmoStart.quat.clone().invert());
    const s = proxy.scale.clone();
    applyXform(gizmoStart.xform, delta, turn, s);
    app.touch();
  });
  const updateGizmo = () => {
    const doc = app.doc;
    const tool = sessionTool.name;
    const usable = (doc.mode === 'OBJECT' || doc.mode === 'EDIT') && ['move', 'rotate', 'scale'].includes(tool) && doc.selected.length && !modal;
    const hasSel = doc.mode === 'EDIT' ? (activeObject(doc)?.data?.selV?.length ?? 0) > 0 : true;
    const show = Boolean(usable && hasSel && activeObject(doc)?.type !== undefined);
    gizmoHelper.visible = show;
    gizmo.enabled = show;
    if (show && !gizmoStart) {
      gizmo.setMode({ move: 'translate', rotate: 'rotate', scale: 'scale' }[tool]);
      gizmo.camera = camera;
      proxy.position.set(...selectionPivot(doc));
      proxy.quaternion.identity();
      proxy.scale.set(1, 1, 1);
    }
  };

  // ── Motion paths and onion ghosts
  const pathGroup = new THREE.Group();
  scene.add(pathGroup);
  const pathLine = new THREE.LineBasicMaterial({ color: 0x4fd0c0 });
  const pathDots = new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false });
  const pathNow = new THREE.PointsMaterial({ color: 0xef8b3c, size: 7, sizeAttenuation: false });
  let pathKey = '';
  const updatePaths = (doc) => {
    const list = doc.objects.flatMap((o) => [
      ...(o.motionPath ? [{ o, path: o.motionPath, id: o.id }] : []),
      ...(o.type === 'ARMATURE' ? o.data.bones.filter((b) => b.motionPath).map((b) => ({ o: null, path: b.motionPath, id: `${o.id}:${b.name}` })) : []),
    ]);
    const key = JSON.stringify([doc._rev ?? 0, doc.frame, list.map((x) => x.id)]);
    if (key === pathKey) return;
    pathKey = key;
    for (const c of [...pathGroup.children]) { pathGroup.remove(c); c.geometry?.dispose?.(); if (c.userData.own) c.material?.dispose?.(); }
    for (const { o, path } of list) {
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(path.points.flat(), 3));
      pathGroup.add(new THREE.Line(geometry, pathLine), new THREE.Points(geometry.clone(), pathDots));
      const i = Math.round((doc.frame - path.start) / path.step);
      if (i >= 0 && i < path.points.length) pathGroup.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(path.points[i], 3)), pathNow));
      const shape = o?.onion && sync.items.get(o.id)?.mesh?.geometry;
      if (!shape) continue;
      for (const ghost of onionFrames(path, doc.frame, o.onion)) {
        const m = new THREE.Mesh(shape.clone(), new THREE.MeshBasicMaterial({ color: ghost.frame < doc.frame ? 0x5aa9ff : 0x7cdc7c, transparent: true, opacity: ghost.opacity, depthWrite: false }));
        m.userData.own = true;
        m.matrixAutoUpdate = false;
        m.matrix.fromArray(ghost.matrix);
        m.raycast = () => {};
        pathGroup.add(m);
      }
    }
  };

  // ── Camera
  const viewDir = () => {
    const [yaw, pitch] = [state.yaw * DEG, state.pitch * DEG];
    return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch));
  };
  const size = () => ({ w: Math.max(1, root.clientWidth), h: Math.max(1, root.clientHeight) });
  const updateCamera = () => {
    const { w, h: H } = size();
    const doc = app.doc;
    const camObj = state.camView ? getObject(doc, doc.activeCamera) : null;
    camera = state.persp || camObj ? persp : ortho;
    if (camObj) {
      const c = camObj.data;
      const m = worldMatrix(doc, camObj);
      persp.matrixAutoUpdate = false;
      persp.matrix.copy(m);
      persp.matrixWorld.copy(m);
      persp.matrixWorldInverse.copy(m).invert();
      const aspect = w / H;
      const renderAspect = doc.render.width / doc.render.height;
      const fovX = 2 * Math.atan(c.sensor / (2 * c.lens));
      // The render frame fits inside the view.
      const fovY = 2 * Math.atan(Math.tan(fovX / 2) / renderAspect);
      persp.fov = (Math.min(fovY * Math.max(1, renderAspect / aspect), 170 * DEG) * 180) / Math.PI;
      persp.aspect = aspect;
      persp.near = c.clipStart ?? 0.1;
      persp.far = c.clipEnd ?? 1000;
      persp.updateProjectionMatrix();
    } else {
      const pos = new THREE.Vector3(...state.target).add(viewDir().multiplyScalar(state.dist));
      persp.matrixAutoUpdate = true;
      if (camera === persp) {
        persp.position.copy(pos);
        persp.aspect = w / H;
        persp.near = Math.max(0.01, state.dist / 2000);
        persp.far = Math.max(1000, state.dist * 200);
        persp.updateProjectionMatrix();
      } else {
        const half = state.dist * Math.tan(22.5 * DEG);
        Object.assign(ortho, { left: -half * (w / H), right: half * (w / H), top: half, bottom: -half });
        ortho.position.copy(pos);
        ortho.updateProjectionMatrix();
      }
      camera.up.set(0, 0, Math.cos(state.pitch * DEG) >= 0 ? 1 : -1);
      camera.lookAt(...state.target);
      camera.updateMatrixWorld();
    }
    gizmo.camera = camera;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    head.position.copy(eye).add(right.clone().multiplyScalar(state.dist * 0.5)).add(up.clone().multiplyScalar(state.dist * 0.7));
    head.target.position.set(...state.target);
    fill.position.copy(eye).add(right.clone().multiplyScalar(-state.dist)).sub(up.clone().multiplyScalar(state.dist * 0.3)).add(forward);
    fill.target.position.set(...state.target);
    head.target.updateMatrixWorld();
    fill.target.updateMatrixWorld();
  };

  const frameBox = (box) => {
    if (!box) return;
    state.target = v3.lerp(box.min, box.max, 0.5);
    const radius = Math.max(0.5, v3.dist(box.min, box.max) / 2);
    state.dist = Math.max(0.5, radius / Math.tan(22.5 * DEG)) * 1.15;
    state.camView = false;
  };
  const frameAll = () => { const list = app.doc.objects.filter((o) => !o.hide); frameBox(list.length ? worldBounds(app.doc, list) : null); redraw(); };
  const frameSelected = () => {
    const doc = app.doc;
    const obj = activeObject(doc);
    if (doc.mode === 'EDIT' && obj?.type === 'MESH' && obj.data.selV.length) {
      const m = worldMatrix(doc, obj);
      const q = new THREE.Vector3();
      const pts = obj.data.selV.map((i) => { q.set(...obj.data.verts[i]).applyMatrix4(m); return [q.x, q.y, q.z]; });
      const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
      const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
      frameBox({ min, max });
    } else {
      const list = selectedObjects(doc);
      if (list.length) frameBox(worldBounds(doc, list));
    }
    redraw();
  };
  const setView = (yaw, pitch) => { state.yaw = yaw; state.pitch = pitch; state.camView = false; redraw(); };

  // ── Draw
  let dirty = true;
  const redraw = () => { dirty = true; app.requestFrame(); };
  let lastW = 0;
  let lastH = 0;

  const draw = () => {
    const { w, h: H } = size();
    if (w !== lastW || H !== lastH) { renderer.setSize(w, H, false); lastW = w; lastH = H; }
    const doc = app.doc;
    updateCamera();
    // Texture paint shows the picture being painted, whatever the viewport was set to.
    const shading = doc.mode === 'TEXTURE_PAINT' && (state.shading === 'SOLID' || state.shading === 'WIRE') ? 'MATERIAL' : state.shading;
    const rendered = shading === 'RENDERED';
    sync.sync(doc, { shading, xray: state.xray, images: app.imageCache?.() });
    sync.syncLights(doc, rendered);
    updatePaths(doc);
    renderer.shadowMap.enabled = rendered;
    studio.visible = shading === 'SOLID' || shading === 'WIRE';
    for (const item of sync.items.values()) {
      if (item.wire && state.wire && item.group.visible && doc.mode !== 'EDIT') item.wire.visible = true;
    }
    scene.environment = shading === 'MATERIAL' ? envMap() : null;
    if (rendered) {
      const c = doc.world.color;
      const k = doc.world.strength;
      scene.background = new THREE.Color(c[0] * k, c[1] * k, c[2] * k);
      scene.environment = null;
    } else {
      const style = getComputedStyle(root);
      scene.background = new THREE.Color(style.getPropertyValue('--viewport-a').trim() || '#3b3b3b');
      gridStyle = { bg: style.getPropertyValue('--viewport-a').trim() || '#3b3b3b', text: style.getPropertyValue('--text').trim() || '#dcdcdc' };
    }
    renderer.toneMapping = rendered || shading === 'MATERIAL' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    updateGrid();
    grid.visible = state.grid && !rendered;
    gizmo.setSize((app.settings.gizmoSize ?? 80) / 100);
    cursor3d.visible = !rendered;
    cursor3d.position.set(...doc.cursor);
    const scale = camera === persp ? cursor3d.position.distanceTo(new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)) * 0.07 : state.dist * 0.07;
    cursor3d.scale.setScalar(scale);
    cursor3d.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(camera.matrixWorld));
    const pts = [];
    for (const obj of selectedObjects(doc)) {
      const p = new THREE.Vector3().setFromMatrixPosition(worldMatrix(doc, obj));
      pts.push(p.x, p.y, p.z);
    }
    originsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    origins.visible = pts.length > 0 && doc.mode === 'OBJECT' && !rendered;
    buildCage();
    updateGizmo();
    renderer.render(scene, camera);
    updateNavGizmo();
    updateTexts();
    dirty = false;
  };

  // ── Picking
  const ndc = (x, y) => { const { w, h: H } = size(); return new THREE.Vector2((x / w) * 2 - 1, -(y / H) * 2 + 1); };
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.05 };
  const castAt = (x, y) => { raycaster.setFromCamera(ndc(x, y), camera); return raycaster; };
  const project = (p) => {
    const { w, h: H } = size();
    const v = new THREE.Vector3(...p).project(camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * H, z: v.z };
  };
  const pickObject = (x, y) => {
    castAt(x, y);
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const place = new THREE.Vector3();
    const { h: H } = size();
    const pixel = (2 * Math.tan(22.5 * DEG)) / H;
    let best = null;
    let bestDistance = Infinity;
    for (const target of sync.pickables()) {
      const obj = getObject(app.doc, target.userData.objId);
      if (!obj || obj.hideSelect) continue;
      // A line can be picked within 6 pixels, however far away it is: the threshold is in world units at its distance.
      if (target.isLineSegments) {
        const distance = camera === persp ? eye.distanceTo(place.setFromMatrixPosition(target.matrixWorld)) : state.dist;
        raycaster.params.Line.threshold = distance * pixel * 6;
      }
      const hit = raycaster.intersectObject(target, false)[0];
      if (hit && hit.distance < bestDistance) { bestDistance = hit.distance; best = obj; }
    }
    return best;
  };
  /** World positions of an edited mesh, and a test of whether a point is hidden behind the surface. */
  const worldVerts = (obj) => {
    const m = worldMatrix(app.doc, obj);
    const q = new THREE.Vector3();
    return obj.data.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(m); return [q.x, q.y, q.z]; });
  };
  const occludedTester = (obj) => {
    if (state.xray || state.shading === 'WIRE') return () => false;
    const item = sync.items.get(obj.id);
    const target = item?.mesh;
    if (!target) return () => false;
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rc = new THREE.Raycaster();
    return (p) => {
      const point = new THREE.Vector3(...p);
      const dir = point.clone().sub(eye);
      const len = dir.length();
      rc.set(eye, dir.normalize());
      rc.far = len - Math.max(0.005, len * 0.002);
      return rc.intersectObject(target, false).length > 0;
    };
  };
  const pickInEdit = (obj, x, y) => {
    const mesh = obj.data;
    const verts = worldVerts(obj);
    const hidden = occludedTester(obj);
    if (mesh.selMode === 'vert') {
      let best = null;
      let bestD = 14;
      verts.forEach((p, i) => {
        const s = project(p);
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bestD && s.z < 1 && !hidden(p)) { best = i; bestD = d; }
      });
      return best == null ? null : { vert: best };
    }
    if (mesh.selMode === 'edge') {
      let best = null;
      let bestD = 10;
      for (const e of edgeMap(mesh).values()) {
        const [a, b] = [project(verts[e.a]), project(verts[e.b])];
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const t0 = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(a.x + dx * t0 - x, a.y + dy * t0 - y);
        if (d < bestD && !hidden(v3.lerp(verts[e.a], verts[e.b], 0.5))) { best = e; bestD = d; }
      }
      return best ? { edge: best } : null;
    }
    castAt(x, y);
    const origin = raycaster.ray.origin.toArray();
    const dir = raycaster.ray.direction.toArray();
    let best = null;
    let bestT = Infinity;
    mesh.faces.forEach((face, f) => {
      for (let i = 1; i < face.length - 1; i++) {
        const [a, b, c] = [verts[face[0]], verts[face[i]], verts[face[i + 1]]];
        const [e1, e2] = [v3.sub(b, a), v3.sub(c, a)];
        const p = v3.cross(dir, e2);
        const det = v3.dot(e1, p);
        if (Math.abs(det) < 1e-10) continue;
        const s = v3.sub(origin, a);
        const u = v3.dot(s, p) / det;
        if (u < 0 || u > 1) continue;
        const q = v3.cross(s, e1);
        const v = v3.dot(dir, q) / det;
        if (v < 0 || u + v > 1) continue;
        const d = v3.dot(e2, q) / det;
        if (d > 0 && d < bestT) { bestT = d; best = f; }
      }
    });
    return best == null ? null : { face: best };
  };
  const applyEditPick = (obj, pick, extend) => {
    const mesh = obj.data;
    if (!extend) { mesh.selV = []; mesh.selF = []; }
    if (!pick) return;
    if (pick.vert != null) {
      mesh.selV = mesh.selV.includes(pick.vert) && extend ? mesh.selV.filter((i) => i !== pick.vert) : [...mesh.selV.filter((i) => i !== pick.vert), pick.vert];
    } else if (pick.edge) {
      const { a, b } = pick.edge;
      const on = mesh.selV.includes(a) && mesh.selV.includes(b) && extend;
      mesh.selV = on ? mesh.selV.filter((i) => i !== a && i !== b) : [...new Set([...mesh.selV, a, b])];
    } else if (pick.face != null) {
      const on = extend && mesh.selF.includes(pick.face);
      setFaceSelection(mesh, on ? mesh.selF.filter((f) => f !== pick.face) : [...mesh.selF, pick.face]);
    }
  };
  const boxSelect = (r, extend) => {
    const doc = app.doc;
    const inside = (s) => s.x >= r.x0 && s.x <= r.x1 && s.y >= r.y0 && s.y <= r.y1 && s.z < 1;
    const obj = activeObject(doc);
    if (doc.mode === 'EDIT' && obj?.type === 'MESH') {
      const mesh = obj.data;
      const verts = worldVerts(obj);
      const hidden = occludedTester(obj);
      const screen = verts.map(project);
      const vis = screen.map((s, i) => inside(s) && (verts.length > 20000 || !hidden(verts[i])));
      if (mesh.selMode === 'face') {
        const hit = [];
        mesh.faces.forEach((face, f) => {
          const c = face.reduce((acc, i) => v3.add(acc, v3.mul(verts[i], 1 / face.length)), [0, 0, 0]);
          if (inside(project(c)) && !hidden(c)) hit.push(f);
        });
        setFaceSelection(mesh, extend ? [...mesh.selF, ...hit] : hit);
      } else {
        const hit = [];
        vis.forEach((v, i) => { if (v) hit.push(i); });
        mesh.selV = extend ? [...new Set([...mesh.selV, ...hit])] : hit;
      }
      return;
    }
    if (doc.mode !== 'OBJECT') return;
    const ids = [];
    const m = new THREE.Vector3();
    for (const o of doc.objects) {
      if (o.hide || o.hideSelect) continue;
      const item = sync.items.get(o.id);
      let hit = false;
      if (GEOMETRY_TYPES.has(o.type) && item?.evaluated?.verts?.length) {
        const mat = item.group.matrix;
        const list = item.evaluated.verts;
        const step = Math.max(1, Math.floor(list.length / 400));
        for (let i = 0; i < list.length && !hit; i += step) { m.set(list[i][0], list[i][1], list[i][2]).applyMatrix4(mat); hit = inside(project([m.x, m.y, m.z])); }
      } else {
        m.setFromMatrixPosition(worldMatrix(doc, o));
        hit = inside(project([m.x, m.y, m.z]));
      }
      if (hit) ids.push(o.id);
    }
    doc.selected = extend ? [...new Set([...doc.selected, ...ids])] : ids;
    if (!doc.selected.includes(doc.activeId)) doc.activeId = doc.selected.at(-1) ?? doc.activeId;
    if (ids.length && !extend) doc.activeId = ids.at(-1);
  };

  // ── Transforms
  function beginXform() {
    const doc = app.doc;
    const pivot = new THREE.Vector3(...selectionPivot(doc, app.pivotMode));
    const obj = activeObject(doc);
    if (doc.mode === 'EDIT' && (obj?.type === 'CURVE' || obj?.type === 'SURFACE')) {
      const m = worldMatrix(doc, obj);
      const q = new THREE.Vector3();
      const points = controlPoints(obj);
      const list = (state.pointSel ?? []).filter((i) => points[i]).map((i) => ({ i, p: q.set(points[i][0], points[i][1], points[i][2]).applyMatrix4(m).clone() }));
      const centre = new THREE.Vector3();
      for (const e of list) centre.add(e.p);
      if (list.length) centre.multiplyScalar(1 / list.length);
      return { kind: 'points', obj, points, pivot: list.length ? centre : pivot, inv: m.clone().invert(), list };
    }
    if (doc.mode === 'EDIT' && obj?.type === 'MESH') {
      const m = worldMatrix(doc, obj);
      const q = new THREE.Vector3();
      const entry = (i, w) => { const v = obj.data.verts[i]; return { i, w, p: q.set(v[0], v[1], v[2]).applyMatrix4(m).clone() }; };
      const list = obj.data.selV.map((i) => entry(i, 1));
      const followers = () => (doc.proportional?.enabled ? proportionalWeights(obj.data, doc.proportional).map(([i, w]) => entry(i, w)) : []);
      return { kind: 'verts', obj, pivot, inv: m.clone().invert(), list, followers: followers(), refreshFollowers: followers };
    }
    return { kind: 'objects', pivot, list: selectedObjects(doc).filter((o) => !doc.selected.includes(o.parent)).map((o) => ({ o, loc: [...o.location], rot: [...o.rotation], scale: [...o.scale], world: new THREE.Vector3().setFromMatrixPosition(worldMatrix(doc, o)), parentInv: o.parent && getObject(doc, o.parent) ? worldMatrix(doc, getObject(doc, o.parent)).clone().invert() : null })) };
  }
  const moved = new THREE.Vector3();
  function applyXform(x, translate, turn, scale, opts = {}) {
    const transformPoint = (p) => moved.copy(p).sub(x.pivot).multiply(scale).applyQuaternion(turn).add(x.pivot).add(translate);
    if (x.kind === 'points') {
      for (const { i, p } of x.list) {
        transformPoint(p).applyMatrix4(x.inv);
        const point = x.points[i];
        point[0] = moved.x; point[1] = moved.y; point[2] = moved.z;
      }
      buildCage();
      return;
    }
    if (x.kind === 'verts') {
      const mesh = x.obj.data;
      for (const { i, p } of x.list) {
        transformPoint(p).applyMatrix4(x.inv);
        mesh.verts[i] = [moved.x, moved.y, moved.z];
      }
      const part = new THREE.Quaternion();
      const size = new THREE.Vector3();
      for (const { i, p, w } of x.followers ?? []) {
        part.identity().slerp(turn, w);
        size.set(1 + (scale.x - 1) * w, 1 + (scale.y - 1) * w, 1 + (scale.z - 1) * w);
        moved.copy(p).sub(x.pivot).multiply(size).applyQuaternion(part).add(x.pivot).addScaledVector(translate, w).applyMatrix4(x.inv);
        mesh.verts[i] = [moved.x, moved.y, moved.z];
      }
      return;
    }
    for (const e of x.list) {
      transformPoint(e.world);
      const p = e.parentInv ? moved.clone().applyMatrix4(e.parentInv) : moved;
      e.o.location = [p.x, p.y, p.z];
      if (!opts.onlyLocation) {
        e.o.rotation = rotationFromQuat(turn.clone().multiply(rotationQuat(e.rot, e.o.rotationMode)), e.o.rotationMode);
        e.o.scale = [e.scale[0] * scale.x, e.scale[1] * scale.y, e.scale[2] * scale.z];
      }
    }
  }
  function cancelXform(x) {
    if (x.kind === 'points') {
      const q = new THREE.Vector3();
      for (const { i, p } of x.list) { q.copy(p).applyMatrix4(x.inv); const point = x.points[i]; point[0] = q.x; point[1] = q.y; point[2] = q.z; }
      return;
    }
    if (x.kind === 'verts') {
      const q = new THREE.Vector3();
      for (const { i, p } of [...x.list, ...(x.followers ?? [])]) { q.copy(p).applyMatrix4(x.inv); x.obj.data.verts[i] = [q.x, q.y, q.z]; }
      return;
    }
    for (const e of x.list) { e.o.location = e.loc; e.o.rotation = e.rot; e.o.scale = e.scale; }
  }

  /** G, R, S. `options.normalAxis`: move along this world axis only (extrude). */
  let modal = null;
  let mouse = { x: 0, y: 0 };
  const startModal = (type, options = {}) => {
    const doc = app.doc;
    if (!doc.selected.length && doc.mode === 'OBJECT') return;
    const x = beginXform();
    if (!x.list.length) { app.status(t('Nothing selected', '선택된 것이 없습니다')); return; }
    const pivot2d = project(x.pivot.toArray());
    modal = { type, x, axis: options.axis ?? null, start: { ...mouse }, pivot2d, typed: '', label: options.label, normalAxis: options.normalAxis ?? null, snap: false, wasNew: options.wasNew ?? false, value: type === 'S' ? 1 : 0 };
    app.status(modalText());
    updateModal();
  };
  const axisVec = (axis) => ({ X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) }[axis]);
  const NOTURN = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  const ZERO = new THREE.Vector3();
  const snapMark = h('div', { className: 'snap-mark', dataset: { testid: 'snap-mark' } });
  root.append(snapMark);
  const SNAP_PIXELS = 24;
  /** What the pointer is near, in world space: a vertex, the closest point of an edge, a face under it, or an object's centre. Things being moved do not count. */
  const snapPoint = (target, x) => {
    const doc = app.doc;
    const moving = x.kind === 'objects' ? new Set(x.list.map((e) => e.o.id)) : new Set();
    let best = null;
    let bestD = SNAP_PIXELS;
    let faceDist = Infinity;
    const consider = (p) => {
      const s = project(p);
      if (s.z > 1) return;
      const d = Math.hypot(s.x - mouse.x, s.y - mouse.y);
      if (d < bestD) { bestD = d; best = p; }
    };
    const q = new THREE.Vector3();
    const editing = doc.mode === 'EDIT' ? activeObject(doc) : null;
    for (const obj of doc.objects) {
      if (obj.hide || moving.has(obj.id)) continue;
      const m = worldMatrix(doc, obj);
      if (target === 'CENTER') { q.setFromMatrixPosition(m); consider(q.toArray()); continue; }
      if (!GEOMETRY_TYPES.has(obj.type)) continue;
      const mesh = obj === editing ? obj.data : evaluatedMesh(doc, obj);
      if (!mesh?.verts) continue;
      const selected = obj === editing ? selVSet(mesh) : null;
      const world = mesh.verts.map((v) => q.set(v[0], v[1], v[2]).applyMatrix4(m).toArray());
      if (target === 'FACE') {
        // The nearest surface under the pointer, wherever on it.
        const ray = castAt(mouse.x, mouse.y).ray;
        const [a, b, c, hit] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        for (const [i, j, k] of triangulateIndices(mesh)) {
          if (selected?.has(i) || selected?.has(j) || selected?.has(k)) continue;
          if (!ray.intersectTriangle(a.fromArray(world[i]), b.fromArray(world[j]), c.fromArray(world[k]), false, hit)) continue;
          const d = hit.distanceTo(ray.origin);
          if (d < faceDist) { faceDist = d; best = hit.toArray(); }
        }
      } else if (target === 'VERTEX') {
        world.forEach((p, i) => { if (!selected?.has(i)) consider(p); });
      } else if (target === 'EDGE') {
        for (const e of edgeMap(mesh).values()) {
          if (selected?.has(e.a) || selected?.has(e.b)) continue;
          const [a, b] = [project(world[e.a]), project(world[e.b])];
          const [dx, dy] = [b.x - a.x, b.y - a.y];
          const k = Math.max(0, Math.min(1, ((mouse.x - a.x) * dx + (mouse.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          consider(world[e.a].map((c, i) => c + (world[e.b][i] - c) * k));
        }
      }
    }
    return best;
  };
  // The knife: clicks draw a line on screen, Enter or Space cuts along it, Esc leaves it. With C held at the cut it goes through to the far side.
  const knifeLine = svg('<svg class="knife-line" data-testid="knife-line" style="display:none"><polyline fill="none" stroke="#ff5a5a" stroke-width="2"/><g></g></svg>');
  root.append(knifeLine);
  let knife = null;
  const drawKnife = () => {
    knifeLine.style.display = knife ? 'block' : 'none';
    if (!knife) return;
    const points = [...knife.path, [mouse.x, mouse.y]];
    knifeLine.querySelector('polyline').setAttribute('points', points.map((p) => p.join(',')).join(' '));
    knifeLine.querySelector('g').innerHTML = knife.path.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#ff5a5a"/>`).join('');
  };
  const startKnife = () => {
    const obj = activeObject(app.doc);
    if (app.doc.mode !== 'EDIT' || obj?.type !== 'MESH') return;
    knife = { path: [], through: false };
    canvas.style.cursor = 'crosshair';
    drawKnife();
    app.status(t('Knife: click along the cut. Enter or Space cuts, C cuts through, Esc cancels', '나이프: 자를 곳을 차례로 누릅니다. Enter 또는 스페이스로 자르고, C는 뒤까지 관통, Esc는 취소'));
  };
  const endKnife = (apply) => {
    if (!knife) return;
    const { path, through } = knife;
    knife = null;
    canvas.style.cursor = '';
    drawKnife();
    app.status('');
    if (!apply || path.length < 2) return;
    const doc = app.doc;
    const obj = activeObject(doc);
    const m = worldMatrix(doc, obj);
    const q = new THREE.Vector3();
    const cut = knifeCut(obj.data, path, (v) => { const s = project(q.set(v[0], v[1], v[2]).applyMatrix4(m).toArray()); return [s.x, s.y]; }, { through });
    if (cut) { app.commit(t('Knife', '나이프')); buildCage(); } else app.status(t('The line crosses no edge', '선이 엣지를 지나지 않습니다'));
    redraw();
  };
  const updateModal = () => {
    if (!modal) return;
    const m = modal;
    const typed = m.typed !== '' && m.typed !== '-' ? Number(m.typed) : null;
    const { x } = m;
    if (m.type === 'G') {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
      const { h: H } = size();
      const depth = camera === persp ? eye.distanceTo(x.pivot) : state.dist;
      const unit = (2 * depth * Math.tan(22.5 * DEG)) / H;
      const dx = (mouse.x - m.start.x) * unit;
      const dy = (m.start.y - mouse.y) * unit;
      let move = right.multiplyScalar(dx).add(up.multiplyScalar(dy));
      const axis = m.normalAxis ?? (m.axis ? axisVec(m.axis) : null);
      if (axis) {
        // Along an axis: how far the mouse went along the axis's direction on screen.
        const a = project(x.pivot.toArray());
        const b = project(x.pivot.clone().add(axis).toArray());
        const [sx, sy] = [b.x - a.x, b.y - a.y];
        const sl = Math.hypot(sx, sy) || 1;
        const amount = ((mouse.x - m.start.x) * sx + (mouse.y - m.start.y) * sy) / (sl * sl);
        move = axis.clone().multiplyScalar(typed ?? (m.snap ? Math.round(amount) : amount));
        m.value = typed ?? amount;
      } else if (typed != null) {
        move = new THREE.Vector3(typed, 0, 0);
        m.value = typed;
      }
      const snapping = Boolean(app.doc.snap?.enabled) !== Boolean(m.snap);
      const target = app.doc.snap?.target ?? 'INCREMENT';
      snapMark.style.display = 'none';
      if (snapping && typed == null) {
        if (target === 'INCREMENT') {
          if (!m.snap || !axis) move.set(Math.round(move.x), Math.round(move.y), Math.round(move.z));
        } else {
          const hit = snapPoint(target, x);
          if (hit) {
            const towards = new THREE.Vector3(...hit).sub(x.pivot);
            move = axis ? axis.clone().multiplyScalar(towards.dot(axis)) : towards;
            const at = project(hit);
            Object.assign(snapMark.style, { display: 'block', left: `${at.x}px`, top: `${at.y}px` });
          }
        }
      }
      m.vector = move.toArray();
      applyXform(x, move, NOTURN, ONE, { onlyLocation: true });
    } else if (m.type === 'R') {
      const a0 = Math.atan2(m.start.y - m.pivot2d.y, m.start.x - m.pivot2d.x);
      const a1 = Math.atan2(mouse.y - m.pivot2d.y, mouse.x - m.pivot2d.x);
      let angle = (a0 - a1) / DEG;
      if (m.snap) angle = Math.round(angle / 5) * 5;
      if (typed != null) angle = typed;
      m.value = angle;
      const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
      const axis = m.axis ? axisVec(m.axis) : forward;
      // Seen from the positive axis, a positive angle goes counter-clockwise; the mouse turns the same way on screen.
      const sign = !m.axis ? 1 : Math.sign(axis.dot(forward)) || 1;
      applyXform(x, ZERO, new THREE.Quaternion().setFromAxisAngle(axis, angle * DEG * sign), ONE);
      // Through a quaternion a full turn would fold back to 0. In XYZ order Z is the last turn, so about world Z the
      // angle simply adds, and 360° stays 360° for animation.
      if (x.kind === 'objects' && m.axis === 'Z') {
        for (const e of x.list) if (!e.parentInv && e.o.rotationMode === 'XYZ') e.o.rotation = [e.rot[0], e.rot[1], e.rot[2] + angle * sign];
      }
    } else {
      const d0 = Math.hypot(m.start.x - m.pivot2d.x, m.start.y - m.pivot2d.y) || 1;
      const d1 = Math.hypot(mouse.x - m.pivot2d.x, mouse.y - m.pivot2d.y);
      let s = d1 / d0;
      if (m.snap) s = Math.round(s * 10) / 10;
      if (typed != null) s = typed;
      m.value = s;
      const v = new THREE.Vector3(m.axis && m.axis !== 'X' ? 1 : s, m.axis && m.axis !== 'Y' ? 1 : s, m.axis && m.axis !== 'Z' ? 1 : s);
      applyXform(x, ZERO, NOTURN, v);
    }
    touch(app.ctx);
    app.status(modalText());
    redraw();
    app.invalidateExcept(null);
  };
  const modalText = () => {
    if (!modal) return '';
    const name = modal.label ?? { G: t('Move', '이동'), R: t('Rotate', '회전'), S: t('Scale', '크기') }[modal.type];
    const axis = modal.axis ? ` · ${t('along', '축')} ${modal.axis}` : '';
    const value = modal.typed !== '' ? modal.typed : (modal.value ?? 0).toFixed(3);
    return `${name}: ${value}${axis}   [X Y Z ${t('axis', '축')} · Ctrl ${t('snap', '스냅')} · Enter ${t('confirm', '확정')} · Esc ${t('cancel', '취소')}]`;
  };
  const confirmModal = () => {
    if (!modal) return;
    const m = modal;
    modal = null;
    app.status('');
    app.commit(m.label ?? { G: 'Move', R: 'Rotate', S: 'Scale' }[m.type]);
    redraw();
  };
  const cancelModal = () => {
    if (!modal) return;
    const m = modal;
    modal = null;
    cancelXform(m.x);
    app.status('');
    if (m.wasNew) app.undo();
    touch(app.ctx);
    app.invalidate();
    redraw();
  };

  // ── Strokes (sculpt, paint, grease pencil)
  const hitSurface = (x, y) => {
    const obj = activeObject(app.doc);
    const item = obj && sync.items.get(obj.id);
    if (!item?.mesh) return null;
    castAt(x, y);
    const hits = raycaster.intersectObject(item.mesh, false);
    if (!hits.length) return null;
    const inv = worldMatrix(app.doc, obj).clone().invert();
    const local = hits[0].point.clone().applyMatrix4(inv);
    const normal = hits[0].face.normal.clone();
    return { local: [local.x, local.y, local.z], normal: [normal.x, normal.y, normal.z], world: hits[0].point };
  };
  const strokeAt = (x, y, invert, last) => {
    const doc = app.doc;
    const obj = activeObject(doc);
    const mesh = obj.data;
    const hit = hitSurface(x, y);
    if (doc.mode === 'SCULPT') {
      const opts = { radius: sessionTool.radius, strength: sessionTool.strength, invert, symmetryX: sessionTool.symmetryX, symmetryY: sessionTool.symmetryY, symmetryZ: sessionTool.symmetryZ };
      if (sessionTool.brush === 'GRAB') {
        if (!last?.grab) return { grab: hit };
        const w = planePoint(x, y, last.grab.world);
        const inv = worldMatrix(doc, obj).clone().invert();
        const local = w.clone().applyMatrix4(inv).toArray();
        sculptDab(mesh, 'GRAB', last.grab.local, { ...opts, delta: v3.sub(local, last.grab.local) });
        return { grab: { ...last.grab, local } };
      }
      if (hit) {
        const multires = obj.modifiers.find((m) => m.type === 'MULTIRES' && m.show !== false);
        if (multires) multiresSculpt(mesh, multires, catmullClark, (top) => sculptDab(top, sessionTool.brush, hit.local, { ...opts, normal: hit.normal }));
        else {
          sculptDab(mesh, sessionTool.brush, hit.local, { ...opts, normal: hit.normal });
          if (sessionTool.dyntopo) dyntopoRefine(mesh, hit.local, sessionTool.radius * 1.2, sessionTool.detail);
        }
      }
    } else if (doc.mode === 'TEXTURE_PAINT') {
      const entry = paintTarget(obj);
      if (hit && entry) {
        texturePaintDab(mesh, entry, hit.local, { radius: sessionTool.radius, strength: sessionTool.strength, color: invert ? [1, 1, 1] : sessionTool.paintColor, blend: sessionTool.paintBlend, normal: obj.modifiers.length ? null : hit.normal });
        entry.version = (entry.version ?? 0) + 1;
        for (const editor of app.editorsOf('image')) editor.refresh?.();
      } else if (!entry) app.status(t('No image to paint on: press Add Paint Texture in the sidebar', '칠할 이미지가 없습니다: 사이드바의 칠할 텍스처 추가를 누르세요'), true);
    } else if (doc.mode === 'VERTEX_PAINT') {
      if (hit) vertexPaintDab(mesh, hit.local, { radius: sessionTool.radius, strength: sessionTool.strength, color: sessionTool.paintColor, blend: sessionTool.paintBlend });
    } else if (doc.mode === 'WEIGHT_PAINT') {
      const group = currentGroup(mesh);
      if (hit && group) weightPaintDab(mesh, group.name, hit.local, { radius: sessionTool.radius, strength: sessionTool.strength, weight: invert ? 0 : sessionTool.weight });
      if (group) showWeights(mesh, group);
    }
    return last;
  };
  /** The picture the active material shows: what Texture Paint paints on. */
  const paintTarget = (obj) => {
    const mat = obj.materials.map((id) => app.doc.materials.find((m) => m.id === id)).find((m) => m?.useNodes && m.nodes);
    const id = mat && (baseColorImage(mat.nodes) ?? mat.nodes.nodes.find((n) => n.type === 'TEX_IMAGE')?.values?.image);
    return id != null ? app.images[id] ?? null : null;
  };
  /** After a stroke the picture is stored in the document, compressed, so that it saves and undoes with everything else. */
  const storePainted = (obj) => {
    const mat = obj.materials.map((id) => app.doc.materials.find((m) => m.id === id)).find((m) => m?.useNodes && m.nodes);
    const id = mat && (baseColorImage(mat.nodes) ?? mat.nodes.nodes.find((n) => n.type === 'TEX_IMAGE')?.values?.image);
    const image = app.doc.images.find((i) => i.id === id);
    const entry = app.images[id];
    if (!image || !entry) return;
    image.dataUrl = encodeImageData(entry);
    entry.src = image.dataUrl;
  };
  const currentGroup = (mesh) => {
    if (!mesh.vgroups.length) mesh.vgroups.push({ name: 'Group', w: {} });
    return mesh.vgroups.find((g) => g.name === sessionTool.group) ?? mesh.vgroups[0];
  };
  const showWeights = (mesh, group) => { mesh.colors = mesh.verts.map((_, i) => weightColor(group.w[i] ?? 0)); };
  const planePoint = (x, y, through) => {
    castAt(x, y);
    const n = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, through);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ?? through.clone();
  };

  // ── Pointer
  let drag = null;
  const local = (e) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const boxEl = h('div', { className: 'box-select', style: { display: 'none' } });
  root.append(boxEl);
  const brushEl = h('div', { className: 'brush-cursor', style: { display: 'none' } });
  root.append(brushEl);

  const inPaint = () => ['SCULPT', 'VERTEX_PAINT', 'WEIGHT_PAINT', 'TEXTURE_PAINT'].includes(app.doc.mode);

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    app.setActiveArea(area);
    const p = local(e);
    mouse = p;
    if (knife) {
      if (e.button === 0) { knife.path.push([p.x, p.y]); drawKnife(); e.preventDefault(); } else if (e.button === 2) endKnife(false);
      return;
    }
    if (modal) {
      if (e.button === 0) confirmModal(); else if (e.button === 2) cancelModal();
      e.preventDefault();
      return;
    }
    rightDragged = false;
    const nav = e.button === 1 || (e.button === 0 && e.altKey && app.settings.emulate3 !== false);
    if (nav) {
      drag = { kind: e.shiftKey ? 'pan' : e.ctrlKey ? 'zoom' : 'orbit', x: p.x, y: p.y };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      // A drag turns the view (Shift: moves it, Ctrl: zooms); a click without moving is the menu, or with Shift places the cursor.
      if (app.settings.rightDragNav === false) { if (e.shiftKey) placeCursor(p); return; }
      drag = { kind: 'rbutton', x: p.x, y: p.y, shift: e.shiftKey, ctrl: e.ctrlKey };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (gizmoHelper.visible && gizmo.axis) return;
    const doc = app.doc;
    if (sessionTool.name === 'cursor') { placeCursor(p); return; }
    if (inPaint() && activeObject(doc)?.type === 'MESH') {
      if (doc.mode === 'WEIGHT_PAINT') showWeights(activeObject(doc).data, currentGroup(activeObject(doc).data));
      const memo = strokeAt(p.x, p.y, e.ctrlKey, null);
      drag = { kind: 'stroke', invert: e.ctrlKey, memo };
      canvas.setPointerCapture(e.pointerId);
      app.touch();
      redraw();
      return;
    }
    if (doc.mode === 'PAINT_GPENCIL' && activeObject(doc)?.type === 'GPENCIL') {
      drag = { kind: 'gp', points: [gpPoint(p)] };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (sessionTool.name === 'annotate' || doc.mode === 'POSE') return;
    drag = { kind: 'select', x: p.x, y: p.y, moved: false, extend: e.shiftKey };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    const prev = mouse;
    mouse = p;
    if (inPaint()) {
      const r = brushPixels();
      Object.assign(brushEl.style, { display: 'block', left: `${p.x}px`, top: `${p.y}px`, width: `${r * 2}px`, height: `${r * 2}px` });
    } else brushEl.style.display = 'none';
    if (modal) {
      modal.snap = e.ctrlKey;
      updateModal();
      return;
    }
    if (!drag) return;
    const [dx, dy] = [p.x - prev.x, p.y - prev.y];
    if (drag.kind === 'rbutton') {
      if (Math.hypot(p.x - drag.x, p.y - drag.y) < 4) return;
      rightDragged = true;
      const kind = drag.shift ? 'pan' : drag.ctrl ? 'zoom' : 'orbit';
      viewDrag(kind, p.x - drag.x, p.y - drag.y);
      drag = { kind, x: p.x, y: p.y };
      return;
    }
    if (drag.kind === 'select' && app.settings.leftDrag === 'orbit' && Math.hypot(p.x - drag.x, p.y - drag.y) >= 4) {
      boxEl.style.display = 'none';
      viewDrag('orbit', p.x - drag.x, p.y - drag.y);
      drag = { kind: 'orbit', x: p.x, y: p.y };
      return;
    }
    if (drag.kind === 'orbit' || drag.kind === 'pan' || drag.kind === 'zoom') {
      viewDrag(drag.kind, dx, dy);
    } else if (drag.kind === 'select') {
      if (!drag.moved && Math.hypot(p.x - drag.x, p.y - drag.y) < 4) return;
      drag.moved = true;
      Object.assign(boxEl.style, { display: 'block', left: `${Math.min(p.x, drag.x)}px`, top: `${Math.min(p.y, drag.y)}px`, width: `${Math.abs(p.x - drag.x)}px`, height: `${Math.abs(p.y - drag.y)}px` });
    } else if (drag.kind === 'stroke') {
      drag.memo = strokeAt(p.x, p.y, drag.invert, drag.memo);
      app.touch();
      redraw();
    } else if (drag.kind === 'gp') {
      drag.points.push(gpPoint(p));
      gpPreview(drag.points);
    }
  });

  const finishDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const p = local(e);
    const doc = app.doc;
    if (d.kind === 'rbutton') {
      if (d.shift) placeCursor(p);
      else if (d.menuAt) openMenu(contextItems(), d.menuAt[0], d.menuAt[1]);
      return;
    }
    if (d.kind === 'select') {
      boxEl.style.display = 'none';
      if (d.moved) {
        boxSelect({ x0: Math.min(p.x, d.x), x1: Math.max(p.x, d.x), y0: Math.min(p.y, d.y), y1: Math.max(p.y, d.y) }, d.extend);
        app.commitSelection();
        return;
      }
      const obj = activeObject(doc);
      if (doc.mode === 'EDIT' && (obj?.type === 'CURVE' || obj?.type === 'SURFACE')) {
        const m = worldMatrix(doc, obj);
        const q = new THREE.Vector3();
        let best = -1;
        let bestD = 12;
        controlPoints(obj).forEach((c, i) => {
          q.set(c[0], c[1], c[2]).applyMatrix4(m);
          const s = project([q.x, q.y, q.z]);
          const dist = Math.hypot(s.x - p.x, s.y - p.y);
          if (dist < bestD) { bestD = dist; best = i; }
        });
        const before = d.extend ? state.pointSel ?? [] : [];
        state.pointSel = best < 0 ? before : before.includes(best) ? before.filter((i) => i !== best) : [...before, best];
        buildCage();
      } else if (doc.mode === 'EDIT' && obj?.type === 'MESH') {
        applyEditPick(obj, pickInEdit(obj, p.x, p.y), d.extend);
        app.commitSelection();
      } else if (doc.mode === 'OBJECT') {
        const hit = pickObject(p.x, p.y);
        app.op('object.select_set', { id: hit?.id ?? '', extend: d.extend });
      }
    } else if (d.kind === 'stroke') {
      if (doc.mode === 'TEXTURE_PAINT') storePainted(activeObject(doc));
      app.commit(t('Brush Stroke', '브러시 스트로크'));
    } else if (d.kind === 'gp') {
      gpPreview(null);
      if (d.points.length > 1) app.op('gpencil.stroke_add', { points: d.points });
    }
    redraw();
  };
  /** One step of turning, moving or zooming the view, however the drag began. */
  const viewDrag = (kind, dx, dy) => {
    if (kind === 'orbit') {
      const speed = 0.4 * ((app.settings.orbitSpeed ?? 100) / 100);
      state.yaw -= dx * speed;
      state.pitch = Math.max(-179, Math.min(179, state.pitch + dy * speed));
    } else if (kind === 'pan') {
      const { h: H } = size();
      const unit = ((2 * state.dist * Math.tan(22.5 * DEG)) / H) * ((app.settings.panSpeed ?? 100) / 100);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      state.target = new THREE.Vector3(...state.target).add(right.multiplyScalar(-dx * unit)).add(up.multiplyScalar(dy * unit)).toArray();
    } else if (kind === 'zoom') {
      state.dist = Math.max(0.05, state.dist * (1 + dy * 0.01 * ((app.settings.zoomSpeed ?? 100) / 100)));
    }
    state.camView = false;
    redraw();
  };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', () => { drag = null; boxEl.style.display = 'none'; });
  canvas.addEventListener('pointerleave', () => { brushEl.style.display = 'none'; });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (modal || e.shiftKey) return;
    // macOS and Linux ask for the menu when the button goes down, Windows when it comes up: only a button that did not drag gets it.
    if (drag?.kind === 'rbutton') { drag.menuAt = [e.clientX, e.clientY]; return; }
    if (rightDragged) { rightDragged = false; return; }
    openMenu(contextItems(), e.clientX, e.clientY);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (inPaint() && e.ctrlKey) { sessionTool.radius = Math.max(0.01, sessionTool.radius * (e.deltaY > 0 ? 0.9 : 1.1)); app.invalidate(); return; }
    const step = 1.12 ** ((app.settings.zoomSpeed ?? 100) / 100);
    const outward = app.settings.invertZoom ? e.deltaY < 0 : e.deltaY > 0;
    state.dist = Math.max(0.05, state.dist * (outward ? step : 1 / step));
    state.camView = false;
    redraw();
  }, { passive: false });

  const brushPixels = () => {
    const obj = activeObject(app.doc);
    if (!obj) return 20;
    const p = new THREE.Vector3().setFromMatrixPosition(worldMatrix(app.doc, obj));
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const d = camera === persp ? eye.distanceTo(p) : state.dist;
    return (sessionTool.radius / (2 * d * Math.tan(22.5 * DEG))) * size().h;
  };
  const placeCursor = (p) => {
    const obj = activeObject(app.doc);
    castAt(p.x, p.y);
    const hits = raycaster.intersectObjects(sync.pickables().filter((m) => m.isMesh), false);
    const out = hits.length ? hits[0].point : planePoint(p.x, p.y, new THREE.Vector3(...app.doc.cursor));
    app.doc.cursor = out.toArray();
    void obj;
    app.commit(t('Set 3D Cursor', '3D 커서 설정'));
    redraw();
  };
  const gpPoint = (p) => {
    const obj = activeObject(app.doc);
    const w = planePoint(p.x, p.y, new THREE.Vector3(...app.doc.cursor));
    const q = w.applyMatrix4(worldMatrix(app.doc, obj).clone().invert());
    return [q.x, q.y, q.z];
  };
  let gpLine = null;
  const gpPreview = (points) => {
    if (gpLine) { scene.remove(gpLine); gpLine.geometry.dispose(); gpLine = null; }
    if (points?.length > 1) {
      gpLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3)), new THREE.LineBasicMaterial({ color: 0x000000 }));
      gpLine.matrixAutoUpdate = false;
      gpLine.matrix.copy(worldMatrix(app.doc, activeObject(app.doc)));
      scene.add(gpLine);
    }
    redraw();
  };

  // ── Nav gizmo
  const NS = 'http://www.w3.org/2000/svg';
  const navSvg = document.createElementNS(NS, 'svg');
  navSvg.setAttribute('class', 'nav-gizmo');
  navSvg.setAttribute('viewBox', '-42 -42 84 84');
  navSvg.dataset.testid = 'nav-gizmo';
  root.append(navSvg);
  // Dragging the gizmo turns the view, so that a mouse without a middle button (or a touchpad) can do it too.
  navSvg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    app.setActiveArea(area);
    const win = navSvg.ownerDocument.defaultView;
    let [lastX, lastY] = [e.clientX, e.clientY];
    let moved = false;
    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      moved = true;
      state.yaw -= (ev.clientX - lastX) * 0.5;
      state.pitch = Math.max(-179, Math.min(179, state.pitch + (ev.clientY - lastY) * 0.5));
      state.camView = false;
      [lastX, lastY] = [ev.clientX, ev.clientY];
      redraw();
    };
    const onUp = () => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      if (!moved) return;
      // The click that follows a drag must not snap the view to an axis.
      win.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
      win.setTimeout(() => win.dispatchEvent(new win.Event('click')), 0);
    };
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
  });
  const NAV =[['X', [1, 0, 0], '#e8596a', 90, 0], ['Y', [0, 1, 0], '#8cc63f', 180, 0], ['Z', [0, 0, 1], '#4f9cf0', state.yaw, 89.99], ['-X', [-1, 0, 0], '#8e3b45', -90, 0], ['-Y', [0, -1, 0], '#5a7d2a', 0, 0], ['-Z', [0, 0, -1], '#335f95', state.yaw, -89.99]];
  const updateNavGizmo = () => {
    navSvg.style.display = app.settings.showNavGizmo === false ? 'none' : '';
    while (navSvg.firstChild) navSvg.firstChild.remove();
    const hint = document.createElementNS(NS, 'title');
    hint.textContent = t('Drag to rotate the view, click an axis to look along it', '끌면 보는 방향이 회전하고, 축을 클릭하면 그 방향에서 봅니다');
    navSvg.append(hint);
    const inverse = camera.matrixWorld.clone().invert();
    const items = NAV.map(([name, axis, color, yaw, pitch]) => {
      const v = new THREE.Vector3(...axis).transformDirection(inverse);
      return { name, x: v.x * 30, y: -v.y * 30, z: v.z, color, yaw, pitch };
    }).sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (!it.name.startsWith('-')) {
        const line = document.createElementNS(NS, 'line');
        for (const [k, v] of [['x1', 0], ['y1', 0], ['x2', it.x], ['y2', it.y], ['stroke', it.color], ['stroke-width', 2]]) line.setAttribute(k, v);
        navSvg.append(line);
      }
      const c = document.createElementNS(NS, 'circle');
      for (const [k, v] of [['cx', it.x], ['cy', it.y], ['r', it.name.startsWith('-') ? 6 : 8], ['fill', it.color]]) c.setAttribute(k, v);
      c.dataset.axis = it.name;
      c.addEventListener('click', () => setView(it.name.endsWith('Z') ? state.yaw : it.yaw, it.pitch));
      navSvg.append(c);
      if (!it.name.startsWith('-')) {
        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', it.x);
        label.setAttribute('y', it.y);
        label.textContent = it.name;
        navSvg.append(label);
      }
    }
    const right = state.sidebar ? 226 : 8;
    navSvg.style.right = `${right}px`;
    navButtons.style.right = `${right + 28}px`;
  };
  /** Buttons to drag on, for a mouse or touchpad with nothing else free. */
  const navDrag = (kind) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    app.setActiveArea(area);
    let [x, y] = [e.clientX, e.clientY];
    const move = (m) => { viewDrag(kind, m.clientX - x, m.clientY - y); x = m.clientX; y = m.clientY; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const navButtons = h('div', { className: 'nav-buttons' },
    h('button', { type: 'button', className: 'tool-btn', title: t('Show or hide the sidebar (N)', '사이드바 표시·숨김 (N)'), dataset: { testid: 'nav-sidebar' }, onClick: () => { state.sidebar = !state.sidebar; update(); redraw(); } }, icon('ed-properties', 15)),
    h('button', { type: 'button', className: 'tool-btn', title: t('Drag to move the view', '끌어서 보기 이동'), dataset: { testid: 'nav-pan' }, onPointerdown: navDrag('pan') }, icon('hand', 15)),
    h('button', { type: 'button', className: 'tool-btn', title: t('Drag to zoom the view', '끌어서 확대·축소'), dataset: { testid: 'nav-zoom' }, onPointerdown: navDrag('zoom') }, icon('search', 15)),
    h('button', { type: 'button', className: 'tool-btn', title: t('Toggle camera view (Numpad 0)', '카메라 시점 전환 (숫자패드 0)'), dataset: { testid: 'nav-camera' }, onClick: () => { state.camView = !state.camView; redraw(); } }, icon('camera', 15)),
    h('button', { type: 'button', className: 'tool-btn', title: t('Perspective / orthographic (Numpad 5)', '원근/직교 전환 (숫자패드 5)'), onClick: () => { state.persp = !state.persp; redraw(); } }, icon('grid', 15)));
  root.append(navButtons);

  const emptyHint = h('div', { className: 'view-empty', dataset: { testid: 'view-empty' } }, h('strong', null, t('An empty scene', '빈 장면')), h('span', null, t('Use Add in the header, or Shift+A, to put something here.', '머리글의 추가 메뉴나 Shift+A로 무언가를 넣어 보세요.')));
  root.append(emptyHint);
  const viewText = h('div', { className: 'view-text' });
  root.append(viewText);
  const statsText = h('div', { className: 'stats-text' });
  root.append(statsText);
  const updateTexts = () => {
    const doc = app.doc;
    const obj = activeObject(doc);
    const kind = state.camView ? t('Camera', '카메라') : state.persp ? t('User Perspective', '사용자 원근') : t('User Orthographic', '사용자 직교');
    viewText.textContent = `${kind}\n(${doc.frame}) ${obj?.name ?? ''}`;
    viewText.style.left = state.toolbar ? `${(toolbar.offsetWidth || 34) + 8}px` : '8px';
    emptyHint.style.display = app.doc.objects.length ? 'none' : '';
    if (state.stats) {
      let tris = 0;
      let verts = 0;
      for (const item of sync.items.values()) { if (item.group.visible && item.evaluated) { verts += item.evaluated.verts.length; tris += item.mesh ? item.mesh.geometry.getAttribute('position').count / 3 : 0; } }
      statsText.textContent = `${t('Objects', '오브젝트')} ${doc.selected.length}/${doc.objects.length}\n${t('Vertices', '꼭짓점')} ${verts}\n${t('Triangles', '삼각형')} ${tris}`;
    } else statsText.textContent = '';
  };

  // ── Toolbar, sidebar, Adjust Last Operation
  const toolbar = h('div', { className: 'toolbar-t', dataset: { testid: 'tool-shelf' } });
  root.append(toolbar);
  const sidebar = h('div', { className: 'sidebar-n', dataset: { testid: 'sidebar' } });
  root.append(sidebar);
  const adjust = h('div', { className: 'adjust-panel', dataset: { testid: 'adjust-panel' } });
  root.append(adjust);

  const toolButton = (name, iconName, title, onClick, on) => h('button', { type: 'button', className: `tool-btn${on ? ' on' : ''}`, title, dataset: { testid: `tool-${name}` }, onClick }, icon(iconName, 16), h('span', { className: 'tool-name' }, title));
  const buildToolbar = () => {
    toolbar.style.display = state.toolbar ? '' : 'none';
    toolbar.classList.toggle('labels', app.settings.toolLabels !== false);
    toolbar.replaceChildren();
    const doc = app.doc;
    const pick = (name) => () => { sessionTool.name = name; app.invalidate(); };
    if (doc.mode === 'SCULPT') {
      for (const [id, b] of Object.entries(SCULPT_BRUSHES)) toolbar.append(toolButton(`brush-${id}`, 'tool-brush', nameOf(b), () => { sessionTool.brush = id; app.invalidate(); }, sessionTool.brush === id));
      return;
    }
    if (doc.mode === 'VERTEX_PAINT' || doc.mode === 'WEIGHT_PAINT' || doc.mode === 'TEXTURE_PAINT' || doc.mode === 'PAINT_GPENCIL') { toolbar.append(toolButton('paint', 'tool-brush', t('Brush', '브러시'), () => {}, true)); return; }
    const basic = [['select', 'tool-select', t('Select', '선택')], ['cursor', 'tool-cursor', t('3D Cursor', '3D 커서')], ['move', 'tool-move', t('Move', '이동')], ['rotate', 'tool-rotate', t('Rotate', '회전')], ['scale', 'tool-scale', t('Scale', '크기')]];
    for (const [n, i, title] of basic) toolbar.append(toolButton(n, i, title, pick(n), sessionTool.name === n));
    if (doc.mode === 'EDIT' && activeObject(doc)?.type === 'MESH') {
      toolbar.append(h('div', { className: 'tool-sep' }));
      const opTool = (id, name, iconName) => toolbar.append(toolButton(name, iconName, nameOf(getOp(id)), () => runMeshTool(id)));
      opTool('mesh.extrude_region', 'extrude', 'tool-extrude');
      opTool('mesh.inset', 'inset', 'tool-inset');
      toolbar.append(toolButton('knife', 'tool-knife', t('Knife', '나이프'), () => startKnife()));
      opTool('mesh.bevel', 'bevel', 'tool-bevel');
      opTool('mesh.loopcut', 'loopcut', 'tool-loopcut');
      opTool('mesh.bisect', 'bisect', 'tool-knife');
      opTool('mesh.spin', 'spin', 'tool-spin');
    }
  };
  const runMeshTool = (id) => {
    if (id === 'mesh.extrude_region') { extrudeModal(); return; }
    if (id === 'mesh.loopcut') { loopCutAtMouse(); return; }
    app.op(id);
  };
  const extrudeModal = () => {
    const doc = app.doc;
    const obj = activeObject(doc);
    const mesh = obj.data;
    const m = worldMatrix(doc, obj);
    const selected = mesh.selMode === 'face' ? mesh.selF : mesh.faces.map((_, f) => f).filter((f) => mesh.faces[f].every((i) => mesh.selV.includes(i)));
    let normal = [0, 0, 0];
    for (const f of selected) normal = v3.add(normal, faceNormal(mesh, mesh.faces[f]));
    const axis = v3.len(normal) > 1e-6 ? new THREE.Vector3(...v3.norm(normal)).transformDirection(m) : new THREE.Vector3(0, 0, 1);
    if (!app.op('mesh.extrude_region', { offset: 0 })) return;
    startModal('G', { normalAxis: axis, label: t('Extrude', '돌출'), wasNew: true });
  };
  const loopCutAtMouse = () => {
    const obj = activeObject(app.doc);
    const verts = worldVerts(obj);
    let best = null;
    let bestD = Infinity;
    for (const e of edgeMap(obj.data).values()) {
      const [a, b] = [project(verts[e.a]), project(verts[e.b])];
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const k = Math.max(0, Math.min(1, ((mouse.x - a.x) * dx + (mouse.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(a.x + dx * k - mouse.x, a.y + dy * k - mouse.y);
      if (d < bestD && e.faces.some((f) => obj.data.faces[f].length === 4)) { best = e; bestD = d; }
    }
    if (best) app.op('mesh.loopcut', { a: best.a, b: best.b, cuts: 1 });
  };

  const brushPanel = () => {
    const doc = app.doc;
    const out = [];
    out.push(row(t('Radius', '반지름'), numField({ value: sessionTool.radius, step: 0.01, min: 0.01, testid: 'brush-radius', onChange: (v) => { sessionTool.radius = v; } })));
    out.push(row(t('Strength', '강도'), numField({ value: sessionTool.strength, step: 0.05, min: 0, max: 1, testid: 'brush-strength', onChange: (v) => { sessionTool.strength = v; } })));
    if (doc.mode === 'SCULPT') {
      out.push(row(t('Brush', '브러시'), select({ value: sessionTool.brush, options: Object.entries(SCULPT_BRUSHES).map(([k, b]) => [k, nameOf(b)]), testid: 'brush-kind', onChange: (v) => { sessionTool.brush = v; app.invalidate(); } })));
      for (const k of ['Y', 'Z']) out.push(toggle({ value: sessionTool[`symmetry${k}`], label: t(`Symmetry ${k}`, `${k} 대칭`), testid: `symmetry-${k}`, onChange: (v) => { sessionTool[`symmetry${k}`] = v; } }));
      out.push(toggle({ value: sessionTool.symmetryX, label: t('Symmetry X', 'X 대칭'), onChange: (v) => { sessionTool.symmetryX = v; } }));
      out.push(toggle({ value: sessionTool.dyntopo, label: t('Dynamic Topology', '다이나믹 토폴로지'), testid: 'brush-dyntopo', onChange: (v) => { sessionTool.dyntopo = v; app.invalidate(); } }));
      if (sessionTool.dyntopo) out.push(row(t('Detail Size', '디테일 크기'), numField({ value: sessionTool.detail, step: 0.01, min: 0.005, testid: 'brush-detail', onChange: (v) => { sessionTool.detail = v; } })));
      out.push(button(t('Voxel Remesh', '복셀 리메시'), () => app.op('object.voxel_remesh', { voxelSize: sessionTool.detail }), { className: 'block', testid: 'brush-remesh' }));
    }
    if (doc.mode === 'TEXTURE_PAINT') {
      out.push(row(t('Color', '색'), colorField({ value: sessionTool.paintColor, onChange: (v) => { sessionTool.paintColor = v; } })));
      out.push(row(t('Blend', '혼합'), select({ value: sessionTool.paintBlend, options: PAINT_BLENDS, onChange: (v) => { sessionTool.paintBlend = v; } })));
      const obj = activeObject(doc);
      if (obj?.type === 'MESH' && !paintTarget(obj)) out.push(button(t('Add Paint Texture', '칠할 텍스처 추가'), () => app.op('paint.add_texture'), { className: 'block', testid: 'paint-add-texture' }));
    }
    if (doc.mode === 'VERTEX_PAINT') {
      out.push(row(t('Color', '색'), colorField({ value: sessionTool.paintColor, onChange: (v) => { sessionTool.paintColor = v; } })));
      out.push(row(t('Blend', '혼합'), select({ value: sessionTool.paintBlend, options: ['MIX', 'ADD', 'SUB', 'MUL'], onChange: (v) => { sessionTool.paintBlend = v; } })));
    }
    if (doc.mode === 'WEIGHT_PAINT') {
      const mesh = activeObject(doc)?.data;
      out.push(row(t('Weight', '가중치'), numField({ value: sessionTool.weight, step: 0.05, min: 0, max: 1, onChange: (v) => { sessionTool.weight = v; } })));
      out.push(row(t('Group', '그룹'), select({ value: sessionTool.group, options: (mesh?.vgroups ?? []).map((g) => [g.name, g.name]), onChange: (v) => { sessionTool.group = v; } })));
    }
    return panel('view-brush', t('Brush', '브러시'), out, { icon: 'tool-brush' });
  };
  const buildSidebar = () => {
    sidebar.style.display = state.sidebar ? '' : 'none';
    if (!state.sidebar) return;
    if (app.widgetActive(sidebar)) return;
    const doc = app.doc;
    const obj = activeObject(doc);
    const content = h('div', { className: 'scroll-y' });
    if (inPaint()) content.append(brushPanel());
    if (obj) {
      const change = (label) => (v, final) => { app.changed(label, final); };
      const items = [];
      if (doc.mode === 'EDIT' && obj.type === 'MESH') {
        const prop = doc.proportional ??= { enabled: false, size: 1, falloff: 'SMOOTH', connected: false };
        content.append(panel('view-proportional', t('Proportional Editing', '비례 편집'), [
          toggle({ value: prop.enabled, label: t('Enabled (O)', '사용 (O)'), testid: 'proportional-on', onChange: (v) => { prop.enabled = v; app.commitSelection(); } }),
          row(t('Size', '크기'), numField({ value: prop.size, step: 0.1, min: 0.001, testid: 'proportional-size', onChange: (v) => { prop.size = v; } })),
          row(t('Falloff', '감쇠'), select({ value: prop.falloff, options: PROPORTIONAL_FALLOFFS, testid: 'proportional-falloff', onChange: (v) => { prop.falloff = v; } })),
          toggle({ value: prop.connected, label: t('Connected Only', '연결된 것만'), onChange: (v) => { prop.connected = v; } }),
        ], { closed: !prop.enabled, icon: 'proportional' }));
        const mesh = obj.data;
        if (mesh.selV.length) {
          const c = selectionCenter(mesh);
          items.push(h('div', { className: 'note-line' }, t('Median', '중앙값')), vecField({
            value: [...c], testid: 'median',
            onChange: (next, final) => { const d = v3.sub(next, selectionCenter(mesh)); for (const i of mesh.selV) mesh.verts[i] = v3.add(mesh.verts[i], d); app.changed(t('Move', '이동'), final); },
          }));
        } else items.push(h('div', { className: 'note-line' }, t('Nothing selected', '선택된 것이 없습니다')));
      } else {
        const loc = vecField({ value: [...obj.location], step: 0.1, testid: 'loc', onChange: (next, final) => { obj.location = next; change('Location')(next, final); } });
        const rot = vecField({ value: [...obj.rotation], step: 1, testid: 'rot', onChange: (next, final) => { obj.rotation = next; change('Rotation')(next, final); } });
        const scl = vecField({ value: [...obj.scale], step: 0.05, testid: 'scale', onChange: (next, final) => { obj.scale = next; change('Scale')(next, final); } });
        items.push(h('div', { className: 'note-line' }, t('Location', '위치')), loc, h('div', { className: 'note-line' }, t('Rotation', '회전')), rot, h('div', { className: 'note-line' }, t('Scale', '크기')), scl);
      }
      content.append(panel('view-item', t('Transform', '트랜스폼'), items, { icon: 'tool-transform' }));
    }
    const camItems = [
      row(t('Distance', '거리'), numField({ value: state.dist, step: 0.5, min: 0.05, onChange: (v) => { state.dist = v; redraw(); } })),
      vecField({ value: [...app.doc.cursor], step: 0.1, onChange: (next, final) => { app.doc.cursor = next; app.changed('3D Cursor', final); } }),
    ];
    content.append(panel('view-view', t('View / 3D Cursor', '뷰 / 3D 커서'), camItems, { closed: true, icon: 'ed-view3d' }));
    content.classList.add('sidebar-content');
    sidebar.replaceChildren(sideHead({ icon: 'ed-properties', title: t('Sidebar', '사이드바'), side: 'right', testid: 'sidebar-fold', onToggle: () => { state.sidebar = false; update(); redraw(); } }), content);
  };
  const buildAdjust = () => {
    const last = app.ctx.lastOp;
    if (!last || app.widgetActive(adjust)) { if (!last) adjust.replaceChildren(); return; }
    const op = getOp(last.id);
    const visible = op.props.filter((p) => !p.hidden);
    if (!visible.length) { adjust.replaceChildren(); return; }
    adjust.style.left = state.toolbar ? '40px' : '6px';
    adjust.replaceChildren(panel('adjust-last', nameOf(op), propsForm(op, last.props, (values) => app.adjustLast(values)), { closed: true }));
  };

  const update = () => {
    buildToolbar();
    buildSidebar();
    buildAdjust();
    redraw();
    if (headerEl) buildHeaderDynamic();
  };

  // ── Menus
  const opItem = (id, props, label, opts = {}) => {
    const op = getOp(id);
    return { label: label ?? nameOf(op), icon: opts.icon ?? op.icon, shortcut: op.key, op: id, disabled: !app.canRun(id), onClick: () => app.op(id, props) };
  };
  const addItems = () => {
    const prims = ['plane', 'cube', 'circle', 'uv_sphere', 'ico_sphere', 'cylinder', 'cone', 'torus', 'grid'].map((n) => opItem(`mesh.primitive_${n}_add`));
    if (app.doc.mode === 'EDIT') return prims;
    return [
      { label: t('Mesh', '메시'), icon: 'mesh', items: prims },
      { label: t('Curve', '커브'), icon: 'curve', items: ['BEZIER', 'CIRCLE', 'PATH'].map((kind) => opItem('object.curve_add', { kind }, enumName(kind))) },
      { label: t('Surface', '서피스'), icon: 'curve', testid: 'add-surface', items: ['PATCH', 'CYLINDER', 'SPHERE', 'TORUS'].map((kind) => ({ ...opItem('mesh.primitive_nurbs_surface_add', { kind }, enumName(kind)), testid: `add-surface-${kind}` })) },
      opItem('object.text_add'), opItem('object.metaball_add'),
      { label: t('Volume', '볼륨'), icon: 'empty', testid: 'add-volume', items: ['NOISE', 'SPHERE', 'CONSTANT'].map((kind) => ({ ...opItem('object.volume_add', { kind }, enumName(kind)), testid: `add-volume-${kind}` })) },
      opItem('object.gpencil_add'),
      null,
      opItem('object.armature_add'), opItem('object.lattice_add'),
      { label: t('Collection Instance', '컬렉션 인스턴스'), icon: 'collection', testid: 'add-collection-instance', items: app.doc.collections.filter((c) => c.id !== 'col_root').map((c) => ({ ...opItem('object.collection_instance_add', { collection: c.id }, c.name), testid: `add-instance-${c.name}` })) },
      { label: t('Empty', '엠프티'), icon: 'empty', items: ['PLAIN_AXES', 'ARROWS', 'CUBE', 'SPHERE', 'CIRCLE'].map((display) => opItem('object.empty_add', { display }, enumName(display))) },
      null,
      { label: t('Light', '조명'), icon: 'light', items: ['POINT', 'SUN', 'SPOT', 'AREA'].map((kind) => opItem('object.light_add', { kind }, enumName(kind))) },
      opItem('object.camera_add'),
      { label: t('Force Field', '역장'), icon: 'field', items: ['WIND', 'FORCE', 'VORTEX', 'DRAG'].map((kind) => opItem('object.forcefield_add', { kind }, enumName(kind))) },
    ];
  };
  const viewItems = () => [
    { label: t('Toolbar', '도구 모음'), checked: state.toolbar, shortcut: 'T', onClick: () => { state.toolbar = !state.toolbar; update(); } },
    { label: t('Sidebar', '사이드바'), checked: state.sidebar, shortcut: 'N', onClick: () => { state.sidebar = !state.sidebar; update(); } },
    { label: t('Statistics', '통계'), checked: state.stats, onClick: () => { state.stats = !state.stats; redraw(); } },
    null,
    { label: t('Frame All', '전체 맞춤'), shortcut: 'Home', onClick: frameAll },
    { label: t('Frame Selected', '선택 맞춤'), shortcut: 'Num .', onClick: frameSelected },
    null,
    { label: t('Viewpoint', '시점'), items: [
      { label: t('Front', '앞'), shortcut: 'Num 1', onClick: () => setView(0, 0) }, { label: t('Back', '뒤'), shortcut: 'Ctrl Num 1', onClick: () => setView(180, 0) },
      { label: t('Right', '오른쪽'), shortcut: 'Num 3', onClick: () => setView(90, 0) }, { label: t('Left', '왼쪽'), shortcut: 'Ctrl Num 3', onClick: () => setView(-90, 0) },
      { label: t('Top', '위'), shortcut: 'Num 7', onClick: () => setView(0, 89.99) }, { label: t('Bottom', '아래'), shortcut: 'Ctrl Num 7', onClick: () => setView(0, -89.99) },
      null, { label: t('Camera', '카메라'), shortcut: 'Num 0', onClick: () => { state.camView = !state.camView; redraw(); } },
    ] },
    { label: t('Perspective / Orthographic', '원근/직교'), shortcut: 'Num 5', onClick: () => { state.persp = !state.persp; redraw(); } },
    null,
    { label: t('Grid', '격자'), checked: state.grid, onClick: () => { state.grid = !state.grid; redraw(); } },
    { label: t('Wireframe Overlay', '와이어프레임 오버레이'), checked: state.wire, onClick: () => { state.wire = !state.wire; redraw(); } },
  ];
  const selectItems = () => {
    if (app.doc.mode === 'EDIT') {
      return [opItem('mesh.select_all', { action: 'SELECT' }), opItem('mesh.select_all', { action: 'DESELECT' }, t('Select None', '선택 해제')), opItem('mesh.select_all', { action: 'INVERT' }, t('Invert', '반전')), null,
        opItem('mesh.select_linked'), opItem('mesh.select_more'), opItem('mesh.select_less'), opItem('mesh.select_random'), opItem('mesh.select_non_manifold')];
    }
    return [opItem('object.select_all', { action: 'SELECT' }), opItem('object.select_all', { action: 'DESELECT' }, t('Select None', '선택 해제')), opItem('object.select_all', { action: 'INVERT' }, t('Invert', '반전'))];
  };
  const objectItems = () => [
    { label: t('Transform', '트랜스폼'), items: [{ label: t('Move', '이동'), shortcut: 'G', onClick: () => startModal('G') }, { label: t('Rotate', '회전'), shortcut: 'R', onClick: () => startModal('R') }, { label: t('Scale', '크기'), shortcut: 'S', onClick: () => startModal('S') }, null, opItem('transform.mirror')] },
    { label: t('Clear', '지우기'), items: [opItem('object.location_clear'), opItem('object.rotation_clear'), opItem('object.scale_clear')] },
    { label: t('Apply', '적용'), items: [opItem('object.transform_apply'), opItem('object.visual_transform_apply')] },
    { label: t('Snap', '스냅'), icon: 'snap', items: [opItem('view3d.snap_cursor_to_center'), opItem('view3d.snap_cursor_to_selected'), opItem('view3d.snap_selected_to_cursor')] },
    opItem('object.origin_set'),
    null,
    opItem('object.duplicate'), opItem('object.join'),
    null,
    { label: t('Parent', '부모'), items: [opItem('object.parent_set', { type: 'OBJECT' }, t('Object', '오브젝트')), opItem('object.parent_set', { type: 'ARMATURE_AUTO' }, t('Armature Deform (Automatic Weights)', '아마추어 변형(자동 가중치)')), opItem('object.parent_clear')] },
    { label: t('Collection', '컬렉션'), items: [opItem('collection.create'), ...app.doc.collections.map((c) => opItem('collection.move_objects', { collection: c.id }, `${t('Move to', '이동:')} ${c.name}`))] },
    null,
    opItem('object.shade_smooth'), opItem('object.shade_flat'), opItem('object.convert_mesh'),
    null,
    { label: t('Animation', '애니메이션'), icon: 'keyframe', items: [opItem('anim.keyframe_insert'), opItem('anim.keyframe_delete'), opItem('anim.keyframe_clear'), null, opItem('object.paths_calculate', { start: app.doc.frameStart, end: app.doc.frameEnd }), opItem('object.paths_clear'), opItem('object.onion_set')] },
    { label: t('Instancing', '인스턴싱'), icon: 'duplicate', items: [opItem('object.instancer_set', { mode: 'VERTS' }, t('On Vertices', '꼭짓점에')), opItem('object.instancer_set', { mode: 'FACES' }, t('On Faces', '면에')), opItem('object.instancer_set', { mode: 'NONE' }, t('Off', '끄기')), null, opItem('object.instances_make_real')] },
    { label: t('Asset', '애셋'), icon: 'bookmark', items: [opItem('asset.mark'), opItem('asset.clear')] },
    { label: t('Rigid Body', '강체'), icon: 'physics', items: [opItem('rigidbody.object_add', { type: 'ACTIVE' }, t('Add Active', '활성 추가')), opItem('rigidbody.object_add', { type: 'PASSIVE' }, t('Add Passive', '수동 추가')), opItem('rigidbody.object_remove')] },
    null,
    opItem('object.hide_set'), opItem('object.hide_view_clear'), opItem('object.delete'),
  ];
  const meshItems = () => [
    { label: t('Transform', '트랜스폼'), items: [{ label: t('Move', '이동'), shortcut: 'G', onClick: () => startModal('G') }, { label: t('Rotate', '회전'), shortcut: 'R', onClick: () => startModal('R') }, { label: t('Scale', '크기'), shortcut: 'S', onClick: () => startModal('S') }, opItem('transform.mirror'), opItem('mesh.shrink_fatten'), opItem('mesh.to_sphere')] },
    opItem('mesh.duplicate'), { ...opItem('mesh.extrude_region'), onClick: extrudeModal }, opItem('mesh.extrude_individual'), opItem('mesh.inset'), opItem('mesh.bevel'), { ...opItem('mesh.loopcut'), onClick: loopCutAtMouse }, opItem('mesh.bisect'), opItem('mesh.spin'),
    null,
    { label: t('Vertex', '꼭짓점'), items: [opItem('mesh.edge_face_add'), opItem('mesh.vertices_smooth'), opItem('mesh.vertices_randomize'), { label: t('Merge', '병합'), items: ['CENTER', 'CURSOR', 'FIRST', 'LAST'].map((type) => opItem('mesh.merge', { type }, enumName(type))) }, opItem('mesh.remove_doubles')] },
    { label: t('Edge', '엣지'), items: [opItem('mesh.subdivide'), opItem('mesh.bridge_edge_loops'), opItem('mesh.edge_slide'), opItem('mesh.rip'), null, opItem('mesh.mark_seam'), opItem('mesh.mark_seam', { clear: true }, t('Clear Seam', '심 지우기')), opItem('mesh.mark_sharp'), opItem('mesh.mark_sharp', { clear: true }, t('Clear Sharp', '샤프 지우기')), opItem('mesh.mark_sharp_angle'), opItem('mesh.crease')] },
    { label: t('Face', '면'), items: [opItem('mesh.poke'), opItem('mesh.triangulate'), opItem('mesh.tris_to_quads'), opItem('mesh.shade_smooth'), opItem('mesh.shade_flat')] },
    { label: t('Normals', '노멀'), items: [opItem('mesh.flip_normals'), opItem('mesh.normals_make_consistent'), null, opItem('mesh.normals_custom_set'), opItem('mesh.normals_point_cursor'), opItem('mesh.normals_custom_clear')] },
    { label: t('UV', 'UV'), icon: 'ed-uv', items: [opItem('uv.unwrap'), opItem('uv.smart_project'), opItem('uv.cube_project'), opItem('uv.cylinder_project'), opItem('uv.sphere_project'), opItem('uv.reset')] },
    null,
    opItem('mesh.separate'),
    { label: t('Delete', '삭제'), icon: 'delete', items: [['VERT', t('Vertices', '꼭짓점')], ['EDGE', t('Edges', '엣지')], ['FACE', t('Faces', '면')], ['ONLY_FACE', t('Only Faces', '면만')]].map(([type, label]) => opItem('mesh.delete', { type }, label)).concat(null, opItem('mesh.dissolve_verts'), opItem('mesh.dissolve_edges'), opItem('mesh.dissolve_faces')) },
  ];
  const contextItems = () => (app.doc.mode === 'EDIT' && activeObject(app.doc)?.type === 'MESH' ? meshItems() : objectItems());

  // ── Header
  let headerEl = null;
  let headerDyn = null;
  const MODES = () => {
    const o = activeObject(app.doc);
    if (!o) return ['OBJECT'];
    if (o.type === 'MESH') return ['OBJECT', 'EDIT', 'SCULPT', 'VERTEX_PAINT', 'WEIGHT_PAINT', 'TEXTURE_PAINT'];
    if (o.type === 'ARMATURE') return ['OBJECT', 'EDIT', 'POSE'];
    if (o.type === 'GPENCIL') return ['OBJECT', 'PAINT_GPENCIL'];
    if (o.type === 'CURVE' || o.type === 'SURFACE') return ['OBJECT', 'EDIT'];
    return ['OBJECT'];
  };
  const toggleProportional = () => {
    const doc = app.doc;
    doc.proportional = { enabled: false, size: 1, falloff: 'SMOOTH', connected: false, ...doc.proportional };
    doc.proportional.enabled = !doc.proportional.enabled;
    app.commitSelection();
    app.status(doc.proportional.enabled ? t('Proportional Editing on', '비례 편집 켜짐') : t('Proportional Editing off', '비례 편집 꺼짐'));
    buildHeaderDynamic();
  };
  const buildHeaderDynamic = () => {
    if (!headerDyn) return;
    if (headerDyn.contains(headerDyn.ownerDocument.activeElement) && headerDyn.ownerDocument.activeElement?.tagName === 'SELECT') return;
    const doc = app.doc;
    const editing = doc.mode === 'EDIT' && activeObject(doc)?.type === 'MESH';
    replace(headerDyn,
      select({ value: doc.mode, options: MODES(), testid: 'mode-select', onChange: (mode) => app.op('object.mode_set', { mode }) }),
      editing ? h('span', { className: 'hdr-group' }, [['vert', 'VERT', 'V', t('Vertex', '꼭짓점')], ['edge', 'EDGE', 'E', t('Edge', '엣지')], ['face', 'FACE', 'F', t('Face', '면')]].map(([m, type, l, title]) => h('button', { type: 'button', className: `hdr-btn${activeObject(doc).data.selMode === m ? ' on' : ''}`, title, dataset: { testid: `select-mode-${m}` }, onClick: () => app.op('mesh.select_mode', { type }) }, l))) : null,
      menuTitle(t('View', '뷰'), viewItems, 'menu-view'),
      menuTitle(t('Select', '선택'), selectItems, 'menu-select'),
      menuTitle(t('Add', '추가'), addItems, 'menu-add'),
      menuTitle(editing ? t('Mesh', '메시') : t('Object', '오브젝트'), editing ? meshItems : objectItems, 'menu-object'),
      h('span', { className: 'hdr-fill' }),
      h('button', { type: 'button', className: `hdr-btn${doc.snap?.enabled ? ' on' : ''}`, title: t('Snap (Shift+Tab)', '스냅 (Shift+Tab)'), dataset: { testid: 'snap-toggle' }, onClick: () => { app.op('view3d.toggle_snap'); buildHeaderDynamic(); } }, icon('snap', 14)),
      h('button', { type: 'button', className: 'hdr-btn', title: t('Snap To', '스냅 대상'), dataset: { testid: 'snap-target' }, onClick: (e) => openMenuBelow(e.currentTarget, [['INCREMENT', t('Increment', '증분')], ['VERTEX', t('Vertex', '꼭짓점')], ['EDGE', t('Edge', '엣지')], ['FACE', t('Face', '면')], ['CENTER', t('Object Center', '오브젝트 중심')]].map(([target, label]) => ({ label, checked: (doc.snap?.target ?? 'INCREMENT') === target, testid: `snap-${target}`, onClick: () => { app.op('view3d.snap_target', { target }); buildHeaderDynamic(); } }))) }, icon('down', 9)),
      editing ? h('button', { type: 'button', className: 'hdr-btn', title: t('Knife (K)', '나이프 (K)'), dataset: { testid: 'knife-tool' }, onClick: () => startKnife() }, icon('tool-knife', 14)) : null,
      editing ? h('button', { type: 'button', className: `hdr-btn${doc.proportional?.enabled ? ' on' : ''}`, title: t('Proportional Editing (O)', '비례 편집 (O)'), dataset: { testid: 'proportional-toggle' }, onClick: () => toggleProportional() }, icon('proportional', 14)) : null,
      h('button', { type: 'button', className: `hdr-btn${state.xray ? ' on' : ''}`, title: t('X-Ray (Alt+Z)', 'X-레이 (Alt+Z)'), dataset: { testid: 'xray' }, onClick: () => { state.xray = !state.xray; buildHeaderDynamic(); redraw(); } }, icon('xray', 14)),
      h('button', { type: 'button', className: `hdr-btn${state.grid ? ' on' : ''}`, title: t('Grid', '격자'), onClick: () => { state.grid = !state.grid; buildHeaderDynamic(); redraw(); } }, icon('grid', 14)),
      h('span', { className: 'hdr-group' }, SHADINGS.map(([id, name, en, ko]) => h('button', { type: 'button', className: `hdr-btn${state.shading === id ? ' on' : ''}`, title: t(en, ko), dataset: { testid: `shading-${id}` }, onClick: () => { state.shading = id; buildHeaderDynamic(); redraw(); } }, icon(name, 14)))),
    );
  };
  const header = (hdr) => {
    headerEl = hdr;
    headerDyn = h('span', { className: 'scroll' });
    hdr.append(headerDyn);
    buildHeaderDynamic();
  };

  /** While a proportional transform runs, the wheel changes how far it reaches. */
  canvas.addEventListener('wheel', (e) => {
    if (!modal || modal.x.kind !== 'verts' || !app.doc.proportional?.enabled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const prop = app.doc.proportional;
    prop.size = Math.max(0.001, prop.size * (e.deltaY > 0 ? 1.1 : 0.9));
    cancelXform(modal.x);
    modal.x.followers = modal.x.refreshFollowers();
    updateModal();
  }, { passive: false, capture: true });

  // ── Keys
  const NUMPAD = { Numpad1: [0, 0, 180, 0], Numpad3: [90, 0, -90, 0], Numpad7: [0, 89.99, 0, -89.99] };
  let pie = null;
  const closePie = () => { pie?.remove(); pie = null; };
  const openPie = () => {
    closePie();
    const places = [[0, -62], [84, 0], [0, 62], [-84, 0]];
    const choices = [['SOLID', 'solid', t('Solid', '솔리드')], ['MATERIAL', 'shaded', t('Material', '재질')], ['RENDERED', 'rendered', t('Rendered', '렌더')], ['WIRE', 'wire', t('Wireframe', '와이어프레임')]];
    pie = h('div', { className: 'pie', dataset: { testid: 'shading-pie' }, style: { left: `${mouse.x}px`, top: `${mouse.y}px` } },
      h('span', { className: 'pie-center' }),
      choices.map(([id, name, label], i) => h('button', {
        type: 'button', className: `pie-item${state.shading === id ? ' on' : ''}`, dataset: { testid: `pie-${id}` }, style: { left: `${places[i][0]}px`, top: `${places[i][1]}px` },
        onClick: () => { state.shading = id; closePie(); buildHeaderDynamic(); redraw(); },
      }, icon(name, 14), label)));
    root.append(pie);
  };
  canvas.addEventListener('pointerdown', () => closePie(), true);
  const onKey = (e) => {
    if (pie && e.key === 'Escape') { closePie(); return true; }
    if (knife) {
      if (e.key === 'Enter' || e.key === ' ') { endKnife(true); return true; }
      if (e.key === 'Escape') { endKnife(false); return true; }
      if (e.key === 'c' || e.key === 'C') { knife.through = !knife.through; return true; }
      return true;
    }
    const doc = app.doc;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (modal) {
      if (key === 'Enter' || key === ' ') { confirmModal(); return true; }
      if (key === 'Escape') { cancelModal(); return true; }
      if (['x', 'y', 'z'].includes(key) && !modal.normalAxis) {
        const axis = key.toUpperCase();
        cancelXform(modal.x);
        modal.axis = modal.axis === axis ? null : axis;
        updateModal();
        return true;
      }
      if (/^[0-9.]$/.test(key) || (key === '-' && modal.typed === '')) { modal.typed += key; updateModal(); return true; }
      if (key === 'Backspace') { modal.typed = modal.typed.slice(0, -1); updateModal(); return true; }
      return true;
    }
    if (NUMPAD[e.code]) { const [y, p, y2, p2] = NUMPAD[e.code]; if (e.ctrlKey) setView(y2, p2); else setView(y, p); return true; }
    if (e.code === 'Numpad5') { state.persp = !state.persp; redraw(); return true; }
    if (e.code === 'Numpad0') { state.camView = !state.camView; redraw(); return true; }
    if (e.code === 'NumpadDecimal') { frameSelected(); return true; }
    if (e.key === 'Home') { frameAll(); return true; }
    if (key === 'z' && !e.ctrlKey && !e.altKey && !e.shiftKey && !modal) { if (pie) closePie(); else openPie(); return true; }
    if (key === 'k' && app.doc.mode === 'EDIT' && !e.ctrlKey && !e.altKey) { startKnife(); return true; }
    if (key === 'n' && !e.ctrlKey) { state.sidebar = !state.sidebar; update(); return true; }
    if (key === 't' && !e.ctrlKey && doc.mode === 'OBJECT') { state.toolbar = !state.toolbar; update(); return true; }
    if (key === 'z' && e.altKey) { state.xray = !state.xray; buildHeaderDynamic(); redraw(); return true; }
    if (key === 'Tab') {
      if (app.canRun('object.editmode_toggle')) app.op('object.editmode_toggle');
      return true;
    }
    if (inPaint()) {
      if (key === '[') { sessionTool.radius = Math.max(0.01, sessionTool.radius * 0.9); app.invalidate(); return true; }
      if (key === ']') { sessionTool.radius *= 1.1; app.invalidate(); return true; }
      return false;
    }
    if (doc.mode !== 'OBJECT' && doc.mode !== 'EDIT') return false;
    const editing = doc.mode === 'EDIT' && activeObject(doc)?.type === 'MESH';
    const plain = !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (plain && key === 'g') { startModal('G'); return true; }
    if (plain && key === 'r') { startModal('R'); return true; }
    if (plain && key === 's') { startModal('S'); return true; }
    if (key === 'a' && e.shiftKey) { openMenu(addItems(), e.clientX ?? rootPoint().x, rootPoint().y); return true; }
    if (key === 'a' && !e.ctrlKey) { app.op(editing ? 'mesh.select_all' : 'object.select_all', { action: e.altKey ? 'DESELECT' : 'SELECT' }); return true; }
    if (key === 'i' && e.ctrlKey && (editing || doc.mode === 'OBJECT')) { app.op(editing ? 'mesh.select_all' : 'object.select_all', { action: 'INVERT' }); return true; }
    if (editing) {
      const mesh = activeObject(doc).data;
      if (plain && ['1', '2', '3'].includes(key)) { app.op('mesh.select_mode', { type: { 1: 'VERT', 2: 'EDGE', 3: 'FACE' }[key] }); return true; }
      if (plain && key === 'e') { extrudeModal(); return true; }
      if (plain && key === 'o') { toggleProportional(); return true; }
      if (plain && key === 'v') { if (app.op('mesh.rip')) startModal('G', { wasNew: true }); return true; }
      if (plain && key === 'u') { app.op('uv.unwrap'); return true; }
      if (key === 'e' && e.shiftKey) { app.op('mesh.crease'); return true; }
      if (plain && key === 'i') { app.op('mesh.inset'); return true; }
      if (plain && key === 'f') { app.op('mesh.edge_face_add'); return true; }
      if (plain && key === 'p') { app.op('mesh.separate'); return true; }
      if (plain && (key === 'x' || key === 'Delete')) { openMenu([['VERT', t('Vertices', '꼭짓점')], ['EDGE', t('Edges', '엣지')], ['FACE', t('Faces', '면')], ['ONLY_FACE', t('Only Faces', '면만')]].map(([type, label]) => opItem('mesh.delete', { type }, label)), rootPoint().x, rootPoint().y); return true; }
      if (plain && key === 'm') { openMenu(['CENTER', 'CURSOR', 'FIRST', 'LAST'].map((type) => opItem('mesh.merge', { type }, enumName(type))), rootPoint().x, rootPoint().y); return true; }
      if (key === 'b' && e.ctrlKey) { app.op('mesh.bevel'); return true; }
      if (key === 'r' && e.ctrlKey) { loopCutAtMouse(); return true; }
      if (key === 't' && e.ctrlKey) { app.op('mesh.triangulate'); return true; }
      if (key === 'd' && e.shiftKey) { app.op('mesh.duplicate'); startModal('G', { wasNew: true }); return true; }
      if (key === 'l' && e.ctrlKey) { app.op('mesh.select_linked'); return true; }
      if (plain && key === 'l') {
        const pick = pickInEdit(activeObject(doc), mouse.x, mouse.y);
        if (pick) { applyEditPick(activeObject(doc), pick, true); app.op('mesh.select_linked'); }
        return true;
      }
      if (key === 'n' && e.shiftKey) { app.op('mesh.normals_make_consistent'); return true; }
      if (key === 'j' && e.altKey) { app.op('mesh.tris_to_quads'); return true; }
      void mesh;
      return false;
    }
    if (plain && (key === 'x' || key === 'Delete')) { if (app.canRun('object.delete')) app.op('object.delete'); return true; }
    if (plain && key === 'h') { if (app.canRun('object.hide_set')) app.op('object.hide_set'); return true; }
    if (key === 'h' && e.altKey) { app.op('object.hide_view_clear'); return true; }
    if (plain && key === 'i') { if (app.canRun('anim.keyframe_insert')) app.op('anim.keyframe_insert'); return true; }
    if (key === 'i' && e.altKey) { if (app.canRun('anim.keyframe_delete')) app.op('anim.keyframe_delete'); return true; }
    if (key === 'g' && e.altKey) { if (app.canRun('object.location_clear')) app.op('object.location_clear'); return true; }
    if (key === 'r' && e.altKey) { if (app.canRun('object.rotation_clear')) app.op('object.rotation_clear'); return true; }
    if (key === 's' && e.altKey) { if (app.canRun('object.scale_clear')) app.op('object.scale_clear'); return true; }
    if (key === 'd' && e.shiftKey) { if (app.canRun('object.duplicate')) { app.op('object.duplicate'); startModal('G', { wasNew: true }); } return true; }
    if (key === 'j' && e.ctrlKey) { if (app.canRun('object.join')) app.op('object.join'); return true; }
    if (key === 'p' && e.ctrlKey) { if (app.canRun('object.parent_set')) openMenu([opItem('object.parent_set', { type: 'OBJECT' }, t('Object', '오브젝트')), opItem('object.parent_set', { type: 'ARMATURE_AUTO' }, t('Armature Deform (Automatic Weights)', '아마추어 변형(자동 가중치)'))], rootPoint().x, rootPoint().y); return true; }
    if (key === 'p' && e.altKey) { if (app.canRun('object.parent_clear')) app.op('object.parent_clear'); return true; }
    if (key === 'a' && e.ctrlKey) { if (app.canRun('object.transform_apply')) app.op('object.transform_apply'); return true; }
    if (plain && key === 'm') { if (app.doc.selected.length) openMenu(app.doc.collections.map((c) => opItem('collection.move_objects', { collection: c.id }, c.name)), rootPoint().x, rootPoint().y); return true; }
    return false;
  };
  const rootPoint = () => { const r = root.getBoundingClientRect(); return { x: r.left + mouse.x, y: r.top + mouse.y }; };

  const resizeObserver = new ResizeObserver(() => redraw());
  resizeObserver.observe(root);

  const editor = {
    header,
    update,
    onKey,
    frame() { if (dirty) draw(); },
    dispose() {
      resizeObserver.disconnect();
      gizmo.dispose();
      clearCage();
      Object.values(cageMats).forEach((m) => m.dispose());
      sync.dispose();
      environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      root.remove();
    },
    // For tests and scripts.
    api: {
      knife: () => knife,
      gridInfo: () => ({ spacing: gridSpacing, major: gridSpacing * 5, plane: gridPlane, lines: grid.children.reduce((sum, c) => sum + c.geometry.attributes.position.count / 2, 0), behind: !gridMaterial.depthTest && !gridMaterial.depthWrite && grid.children.every((c) => c.renderOrder < 0) }),
      pathGroup, state, sync, startModal, setView, frameAll, frameSelected, project: (p) => { updateCamera(); return project(p); }, setTool: (name) => { sessionTool.name = name; app.invalidate(); }, tool: sessionTool, confirmModal, cancelModal, modal: () => modal, setMouse: (x, y) => { mouse = { x, y }; }, renderer, camera: () => camera, draw, scene,
      capture: () => { draw(); return canvas.toDataURL('image/png'); },
    },
  };
  update();
  void allOps; void MODIFIERS; void button;
  return editor;
}

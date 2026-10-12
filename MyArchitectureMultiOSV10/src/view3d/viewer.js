// 3D building viewer: the model from build.js on a ground plane under a sun,
// orbit / pan / first-person walk navigation, perspective or orthographic
// projection (elevations), render styles (realistic, white model, line
// drawing, x-ray), a horizontal section cut, picking with highlight, grid,
// axes, dimensions and every export format three.js can write.
//
// World frame: metres, X = plan x, Z = plan y, Y up (see build.js).

import * as THREE from "../vendor/three/three.module.js";
import { OrbitControls } from "../vendor/three/addons/OrbitControls.js";
import { buildBuilding, makeMaterials, modelExtent, glowMaterial, M } from "./build.js";
import { createLampRig, collectLamps } from "./lamps.js";
import { createSketchupLayer } from "./sklayer.js";
import { createBatcher, HIDDEN_LAYER } from "./batch.js";
import { pullForward, GROUND_OFFSET } from "./depth.js";

const DEG = Math.PI / 180;

export const DEFAULT_OPTIONS = {
  background: "gradient", shadows: true, grid: true, axes: false, gizmo: true, dimensions: false, units3d: "m",
  style: "realistic", section: null, levels: null, openDoors: false, furniture: true, roofs: true, ground: true,
  sunAzimuth: 135, sunAltitude: 45, north: 0, navMode: "orbit", ortho: false, fov: 45, rotateSpeed: 1,
  tool: "none", fog: false, solids: true, night: false,
};

const VIEW_DIRS = {
  iso: [0.85, 0.75, 1.0],
  top: [0, 1, 1e-4],
  front: [0, 0.0001, 1],
  back: [0, 0.0001, -1],
  left: [-1, 0.0001, 0],
  right: [1, 0.0001, 0],
  bird: [0.5, 1.6, 0.9],
};

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function backgroundTexture(top, bottom) {
  const c = makeCanvas(4, 256);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft sky environment so glass and metal have something to reflect.
function skyEnvironment(renderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const pos = geo.attributes.position;
  const colors = [];
  const top = new THREE.Color(0xbcd8f5), hor = new THREE.Color(0xf2efe8), gnd = new THREE.Color(0x7d7a70);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const c = y > 0 ? hor.clone().lerp(top, Math.min(1, y * 1.4)) : hor.clone().lerp(gnd, Math.min(1, -y * 3));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  geo.dispose();
  return tex;
}

function slerpDir(a, b, t, out) {
  const d = Math.min(1, Math.max(-1, a.dot(b)));
  const ang = Math.acos(d);
  if (ang < 1e-5) return out.copy(b);
  let axis = new THREE.Vector3().crossVectors(a, b);
  if (axis.lengthSq() < 1e-10) axis = Math.abs(a.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  axis.normalize();
  return out.copy(a).applyAxisAngle(axis, ang * t);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createViewer(container, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false, stencil: true }); // stencil: filled section cuts (sklayer.js)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true; // section planes clip the model only, not the ground (sklayer.js)
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: "block", width: "100%", height: "100%", outline: "none" });
  canvas.tabIndex = 0;
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.environment = skyEnvironment(renderer);
  scene.environmentIntensity = 0.6;

  const persp = new THREE.PerspectiveCamera(opts.fov, 1, 0.05, 5000);
  persp.position.set(20, 15, 25);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -1000, 5000);
  let camera = opts.ortho ? ortho : persp;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08; // orbit and pan glide to a stop
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  // Smooth wheel zoom: a wheel notch is spread over the next frames instead
  // of jumping at once (the zoom scale is exponential in the wheel delta, so
  // the slices add up to exactly the same zoom, still towards the cursor).
  const smoothZoom = { pending: 0, x: 0, y: 0 };
  const wheelZoom = controls._handleMouseWheel.bind(controls);
  controls._handleMouseWheel = (e) => { smoothZoom.pending += e.deltaY; smoothZoom.x = e.clientX; smoothZoom.y = e.clientY; };
  function stepSmoothZoom() {
    if (Math.abs(smoothZoom.pending) < 0.5) { smoothZoom.pending = 0; return false; }
    const d = Math.abs(smoothZoom.pending) < 2 ? smoothZoom.pending : smoothZoom.pending * 0.25;
    smoothZoom.pending -= d;
    wheelZoom({ clientX: smoothZoom.x, clientY: smoothZoom.y, deltaY: d });
    return true;
  }
  controls.maxPolarAngle = Math.PI * 0.98;

  // Lights: sky fill, the sun (shadows) and a soft headlight on the camera.
  const hemi = new THREE.HemisphereLight(0xeef4ff, 0x6b6656, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e2, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  // The sun's shadow does not depend on the camera: it is drawn again only when
  // the model, the materials, the cut or the sun change, not on every orbit frame.
  sun.shadow.autoUpdate = false;
  const invalidateShadows = () => { sun.shadow.needsUpdate = true; };
  scene.add(sun, sun.target);
  const headlight = new THREE.DirectionalLight(0xffffff, 0.35);
  headlight.position.set(0, 0, 0);
  headlight.target.position.set(0, 0, -1);
  persp.add(headlight, headlight.target);
  scene.add(persp, ortho);
  // Light fixtures: a capped pool of real lights on the nearest lit lamps.
  const lampRig = createLampRig(THREE, scene);

  const content = new THREE.Group(); // the building: what gets exported
  content.name = "model";
  scene.add(content);
  const helpers = new THREE.Group();
  scene.add(helpers);
  let building = new THREE.Group();
  content.add(building);
  const mats = makeMaterials(THREE, { textures: true });
  // Repeated meshes drawn as instances (batch.js); the items in `moving` are
  // drawn by their own meshes while a tool drags them.
  const batcher = createBatcher(THREE);
  scene.add(batcher.group);
  const moving = new Set();
  const ownMeshIds = () => new Set([...highlighted, ...moving]);
  const modelCache = new Map(); // asset id → Promise<Object3D>
  let sk = null; // the SketchUp-style tools and helpers (sklayer.js), made below

  let project = null;
  let extent = { x1: -5000, y1: -5000, x2: 5000, y2: 5000, top: 3000 };
  let ground = null;
  let grid = null;
  let axes = null;
  let dims = null;
  let edges = null;
  let wires = null; // centre lines of slender members (buildWires)
  let bgTexture = null;
  let dirty = true;
  let anim = null;
  let disposed = false;
  let lastView = "iso";
  let highlighted = new Set();
  const hlMats = new Map();
  const pickCallbacks = new Set();
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  const styleMats = {
    white: new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.9, side: THREE.DoubleSide, name: "white" }),
    lines: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, name: "paper" }),
    xray: new THREE.MeshStandardMaterial({ color: 0x9ec5ff, roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, name: "xray" }),
  };

  // ---------------------------------------------------------------- imported models
  async function loadModel(asset) {
    if (modelCache.has(asset.id)) return modelCache.get(asset.id);
    const pr = (async () => {
      const { GLTFLoader } = await import("../vendor/three/addons/GLTFLoader.js");
      const bytes = base64ToBytes(asset.data);
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
      return gltf.scene;
    })();
    modelCache.set(asset.id, pr);
    return pr;
  }

  // ---------------------------------------------------------------- build
  function disposeObject(obj) {
    obj.traverse((o) => { if (o.geometry && !o.userData.shared && !o.userData.sharedGeometry) o.geometry.dispose(); });
  }

  // Levels whose items did not change are carried over from the last build
  // (build.js levelKeys), so an edit rebuilds only the level it touched.
  function rebuild() {
    const old = building;
    content.remove(old);
    batcher.release();
    moving.clear();
    if (edges) { helpers.remove(edges); disposeGroup(edges); edges = null; }
    if (wires) { helpers.remove(wires); disposeGroup(wires); wires = null; }
    if (!project) { disposeObject(old); building = new THREE.Group(); content.add(building); lampRig.setLamps([]); invalidateShadows(); dirty = true; return; }
    building = buildBuilding(THREE, project, mats, {
      openDoors: opts.openDoors, furniture: opts.furniture, roofs: opts.roofs, levels: opts.levels, phase: opts.phase, solids: opts.solids, hiddenTags: opts.hiddenTags,
      reuse: old.userData.levels || new Map(), // always keyed, so the next build can reuse this one
      loadModel, onAsync: () => { applyStyle(); applyHighlight(); dirty = true; },
    });
    disposeObject(old); // only the levels that were built again are still in it
    content.add(building);
    // Carried-over meshes keep the material they were built with (they may be
    // showing a render style or a highlight right now).
    building.traverse((o) => { if (o.isMesh && !o.userData.baseMaterial) o.userData.baseMaterial = o.material; });
    lampRig.setLamps(collectLamps(THREE, building));
    lightKey = lampKey(project);
    extent = modelExtent(project);
    applyStyle();
    applyHighlight();
    updateHelpers();
    if (sk) sk.afterRebuild();
    dirty = true;
  }

  // ---------------------------------------------------------------- styles
  function applyStyle() {
    const style = opts.style || "realistic";
    building.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.hl = null;
      const base = o.userData.baseMaterial || o.material;
      if (style === "realistic") o.material = base;
      else if (base.transparent && style !== "xray") o.material = base; // keep glass
      else o.material = styleMats[style] || base;
    });
    if (edges) { helpers.remove(edges); disposeGroup(edges); edges = null; }
    // Edges: the line drawing, or any style with the style editor's edges on.
    if (style === "lines" || opts.edges) edges = buildEdges(opts.edgeColor || 0x1d2128);
    if (wires) { helpers.remove(wires); disposeGroup(wires); wires = null; }
    wires = buildWires(style === "lines" ? opts.edgeColor || 0x1d2128 : null);
    if (sk) sk.applyStyleExtras(); // colour by tag, profiles, watermark
    batcher.build(building); // before the cut: its filled caps follow the batches
    applyLighting();
    syncLabelDepth();
    applyClipping();
    applyHighlight();
    invalidateShadows();
    dirty = true;
  }

  // Slender members (cables, hangers, rods, light braces) seen from afar are
  // thinner than a pixel: their faces cover a pixel in one frame and miss it
  // in the next, so they break up and crawl while the view moves. A line down
  // each one (inside its material) is always at least a pixel wide and keeps
  // them whole; up close the faces cover it. In
  // the member's colour, a little darker like its shaded sides; one object.
  function buildWires(color) {
    const pos = [], col = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Color();
    building.updateMatrixWorld(true);
    building.traverseVisible((o) => {
      if (!o.isMesh || !o.userData.wire) return;
      const [u, v] = o.userData.wire; // in the section, mm (members.js wirePoint)
      a.set(u, v, 0).applyMatrix4(o.matrixWorld);
      b.set(u, v, 1).applyMatrix4(o.matrixWorld);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (color != null) c.set(color);
      else c.copy((o.material && o.material.color) || c.set(0x777777)).multiplyScalar(0.7);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    // Pulled forward a hair (depth.js) like edges: less than a round member's
    // radius until it is thinner than a pixel, when the line takes over.
    const ls = new THREE.LineSegments(geo, pullForward(new THREE.LineBasicMaterial({ vertexColors: true })));
    ls.raycast = () => {};
    const group = new THREE.Group();
    group.name = "wires";
    group.add(ls);
    helpers.add(group);
    return group;
  }

  // Every visible mesh's feature edges as ONE line object in world space:
  // a mesh's edges are worked out once per geometry (shared unit boxes and
  // component parts reuse them) and moved into place.
  function buildEdges(color) {
    const group = new THREE.Group();
    group.name = "edges";
    const cache = new Map();
    const chunks = [];
    let total = 0;
    building.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    building.traverseVisible((o) => {
      if (!o.isMesh) return;
      let eg = cache.get(o.geometry);
      if (!eg) cache.set(o.geometry, (eg = new THREE.EdgesGeometry(o.geometry, 25).attributes.position.array));
      const out = new Float32Array(eg.length);
      for (let i = 0; i < eg.length; i += 3) {
        v.set(eg[i], eg[i + 1], eg[i + 2]).applyMatrix4(o.matrixWorld);
        out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
      }
      chunks.push(out);
      total += out.length;
    });
    const all = new Float32Array(total);
    let at = 0;
    for (const c of chunks) { all.set(c, at); at += c.length; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(all, 3));
    const ls = new THREE.LineSegments(geo, pullForward(new THREE.LineBasicMaterial({ color })));
    ls.raycast = () => {};
    group.add(ls);
    helpers.add(group);
    return group;
  }

  // Day: sun, sky and headlight. Night (interior lighting): the sun is off and
  // the sky and headlight are faint, so the lamps light the rooms.
  function applyLighting() {
    const lit = (opts.style || "realistic") !== "lines";
    const night = !!opts.night && lit;
    sun.intensity = lit && !night ? 2.4 : 0;
    hemi.intensity = !lit ? 1.4 : night ? 0.05 : 0.75;
    sun.castShadow = opts.shadows !== false && lit && !night;
    headlight.intensity = night ? 0.02 : 0.35;
    scene.environmentIntensity = night ? 0.025 : 0.6;
    lampRig.invalidate();
    invalidateShadows();
    dirty = true;
  }

  // ---------------------------------------------------------------- lamps
  // What of the project is not about lamp settings: when only lamps were
  // switched or re-coloured, the model is kept and only the lamps change.
  let lightKey = "";
  function hasLamps(p) { return lampRig.lamps.length > 0 || (p && p.furniture.some((f) => f.light)); }
  function lampKey(p) {
    if (!p || !hasLamps(p)) return "";
    return JSON.stringify(p, function (k, v) {
      if (k === "light" && this && this.kind !== undefined) return undefined;
      if (k === "data" && typeof v === "string" && v.length > 256) return v.length; // imported model data
      if (k === "scenes" || k === "view") return undefined;
      return v;
    });
  }

  // Apply new lamp states ({id → light}): their glowing parts and their
  // lights, in one pass over the model.
  function setLampStates(map) {
    const states = new Map();
    for (const [id, light] of map) states.set(id, { on: light.on !== false, lumens: +light.lumens || 0, color: light.color || "#ffdfba", ...(light.beam ? { beam: light.beam } : {}) });
    let found = 0;
    building.traverse((o) => {
      const st = o.userData && (o.userData.lamp ? states.get(o.userData.lamp.id) : o.isMesh && o.userData.glow ? states.get(o.userData.id) : null);
      if (!st) return;
      if (o.userData.lamp) { Object.assign(o.userData.lamp, st); found++; return; }
      const m = glowMaterial(mats, o.userData.glow, st);
      o.userData.baseMaterial = m;
      if (!o.userData.hl) o.material = m;
      else { o.userData.hl = m; o.material = highlightMaterial(m); }
    });
    for (const [id, st] of states) lampRig.setState(id, st);
    return found;
  }
  const setLampState = (id, light) => setLampStates(new Map([[id, light]])) > 0;
  // The realistic style shows the new materials as they are; other styles
  // swap materials, so they are applied again.
  const refreshMaterials = () => { if ((opts.style || "realistic") !== "realistic") applyStyle(); dirty = true; };

  // Bring every lamp in line with the project (no rebuild).
  function updateLamps(p) {
    const byId = new Map(p.furniture.map((f) => [f.id, f]));
    const changed = new Map();
    for (const l of lampRig.lamps) {
      const f = byId.get(l.id);
      if (!f || !f.light) continue;
      const cur = { on: f.light.on !== false, lumens: +f.light.lumens || 0, color: f.light.color, beam: f.light.beam };
      if (cur.on !== l.on || cur.lumens !== l.lumens || cur.color !== l.color || (cur.beam && cur.beam !== l.beam)) changed.set(l.id, f.light);
    }
    if (changed.size) { setLampStates(changed); refreshMaterials(); }
    dirty = true;
    return changed.size;
  }

  function applyClipping() {
    const on = opts.section !== null && opts.section !== undefined && Number.isFinite(+opts.section);
    clipPlane.constant = on ? +opts.section * M : 1e6;
    // The horizontal cut and the active section plane (sklayer.js).
    renderer.clippingPlanes = on ? [clipPlane] : [];
    if (sk) sk.afterClipping();
    invalidateShadows();
    dirty = true;
  }

  // ---------------------------------------------------------------- helpers
  function labelSprite(text, color, height) {
    const c = document.createElement("canvas");
    const fs = 64;
    const g = c.getContext("2d");
    g.font = `bold ${fs}px 'Segoe UI', sans-serif`;
    c.width = Math.ceil(g.measureText(text).width + 24);
    c.height = fs + 20;
    g.font = `bold ${fs}px 'Segoe UI', sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = color;
    g.fillText(text, c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: !labelsSeeThrough(), depthWrite: false, transparent: true, toneMapped: false }));
    sp.scale.set((height * c.width) / c.height, height, 1);
    sp.renderOrder = 10;
    sp.userData.label3d = true;
    return sp;
  }

  // Labels (grid numbers, dimensions, tape readings, axis names) hide behind
  // the building like anything else; only the X-ray style, where the building
  // is see-through, shows them through walls.
  function labelsSeeThrough() { return opts.style === "xray"; }
  function syncLabelDepth() {
    const on = !labelsSeeThrough();
    scene.traverse((o) => { if ((o.isSprite || o.isLineSegments) && o.userData.label3d) o.material.depthTest = on; });
  }

  function disposeGroup(gr) {
    gr.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }

  const unitM = () => (opts.units3d === "ft" ? { k: 0.3048, name: "ft" } : { k: 1, name: "m" });
  function fmt(m, withUnit = false) {
    const u = unitM();
    const v = m / u.k;
    const s = String(+v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2));
    return withUnit ? `${s} ${u.name}` : s;
  }

  function lineSegs(pts, color, opacity = 1) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }));
  }

  function centreXZ() {
    return [((extent.x1 + extent.x2) / 2) * M, ((extent.y1 + extent.y2) / 2) * M];
  }

  function buildGround() {
    if (ground) { helpers.remove(ground); disposeGroup(ground); ground = null; }
    if (opts.ground === false) return;
    const [cx, cz] = centreXZ();
    const size = Math.max(60, Math.max(extent.x2 - extent.x1, extent.y2 - extent.y1) * M * 4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 64), new THREE.MeshStandardMaterial({ color: opts.groundColor || 0x9aa68a, roughness: 1, name: "ground", ...GROUND_OFFSET }));
    g.rotation.x = -Math.PI / 2;
    g.position.set(cx, -0.02, cz);
    g.receiveShadow = true;
    g.name = "ground";
    ground = new THREE.Group();
    ground.add(g);
    helpers.add(ground);
  }

  // Ground grid like the plan's: a bold line every 5 cells (5×5 blocks), and
  // the cell steps ×5 / ÷5 with the zoom (… 0.2 m, 1 m, 5 m, 25 m …) so the
  // blocks keep an even size on screen. It is centred where the camera looks.
  const GRID_HALF = 60; // cells each side of the centre (a multiple of 5)
  const GRID_MAJOR_PX = 1.5; // on-screen width of the block lines
  function gridPxPerUnit() {
    const h = renderer.domElement.clientHeight || 600;
    if (camera === ortho) return h / Math.max(1e-6, (ortho.top - ortho.bottom) / (ortho.zoom || 1));
    let dist;
    if (opts.navMode === "walk") dist = Math.max(2, camera.position.y * 4);
    else dist = Math.max(0.1, camera.position.distanceTo(controls.target));
    return h / (2 * dist * Math.tan((persp.fov * DEG) / 2));
  }
  function gridCellFor(px) {
    let cell = unitM().k; // 1 m (or 1 ft)
    for (let i = 0; i < 12 && cell * px < 12; i++) cell *= 5;
    for (let i = 0; i < 12 && cell * px >= 60; i++) cell /= 5;
    return cell;
  }
  function gridCentre() {
    const p = opts.navMode === "walk" ? camera.position : controls.target;
    return [p.x, p.z];
  }
  // Called before each frame: rebuilds the grid only when the cell size
  // changes or the view has moved well away from the grid's centre.
  function fitGrid() {
    if (!opts.grid || !grid) return;
    const cell = gridCellFor(gridPxPerUnit());
    const [cx, cz] = gridCentre();
    const g = grid.userData;
    const far = Math.max(Math.abs(cx - g.cx), Math.abs(cz - g.cz)) > g.major * 4;
    // Block lines keep their on-screen width: rebuild when the zoom drifts.
    const drift = Math.abs(gridPxPerUnit() / g.px - 1) > 0.2;
    if (Math.abs(cell - g.cell) > g.cell * 1e-6 || far || drift) buildGrid();
  }

  // Flat strips on the ground for the block lines: WebGL draws ordinary lines
  // 1 px wide whatever the requested width, so these are quads of a given width.
  function ribbons(segs, w, color, opacity) {
    const pos = [];
    for (const [x1, z1, x2, z2] of segs) {
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2);
      pos.push(x1 + nx, 0, z1 + nz, x2 + nx, 0, z2 + nz, x2 - nx, 0, z2 - nz, x1 + nx, 0, z1 + nz, x2 - nx, 0, z2 - nz, x1 - nx, 0, z1 - nz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    mesh.position.y = 0.001;
    mesh.renderOrder = 1;
    return mesh;
  }

  function buildGrid() {
    if (grid) { helpers.remove(grid); disposeGroup(grid); grid = null; }
    if (!opts.grid) return;
    const px = gridPxPerUnit();
    const cell = gridCellFor(px);
    const [cx, cz] = gridCentre();
    const major = cell * 5;
    const n = GRID_HALF;
    const ox = Math.round(cx / major) * major, oz = Math.round(cz / major) * major;
    // Cell lines: thin and faint. Every 5th line (5×5 blocks): a little wider
    // (1.5 px) and a little stronger — a light accent, never heavy.
    const minor = [], maj = [];
    for (let i = -n; i <= n; i++) {
      const x = ox + i * cell, z = oz + i * cell;
      if (i % 5 === 0) maj.push([x, oz - n * cell, x, oz + n * cell], [ox - n * cell, z, ox + n * cell, z]);
      else minor.push(x, 0, oz - n * cell, x, 0, oz + n * cell, ox - n * cell, 0, z, ox + n * cell, 0, z);
    }
    const dark = opts.ground === false;
    grid = new THREE.Group();
    grid.name = "grid";
    grid.add(lineSegs(minor, dark ? 0x8a93a3 : 0x5a6472, dark ? 0.18 : 0.16));
    grid.add(ribbons(maj, GRID_MAJOR_PX / px, dark ? 0xaeb6c2 : 0x4d5765, dark ? 0.4 : 0.34));
    grid.position.y = 0.002;
    const h0 = major * 0.18;
    for (let k = -n / 5; k <= n / 5; k += Math.max(1, Math.ceil(n / 5 / 6))) {
      const v = k * major;
      const lx = labelSprite(fmt(ox + v), "#ffb4a8", h0);
      lx.center.set(0.5, 0); // stands on the ground rather than half sunk into it
      lx.position.set(ox + v, 0.02, oz + major * 4 + h0); // a row of labels in view, 4 blocks from the centre
      grid.add(lx);
    }
    grid.userData = { cell, major, unit: unitM().name, cx, cz, half: n, px, majorWidth: GRID_MAJOR_PX / px };
    helpers.add(grid);
  }

  // X / Y / Z axes from the origin with tick marks and numbers. The tick
  // spacing follows the zoom like the grid (ticks 12–60 px apart, a number on
  // every tick or every fifth), and the axes rebuild when the zoom changes.
  function buildAxes() {
    if (axes) { helpers.remove(axes); disposeGroup(axes); axes = null; }
    if (!opts.axes) return;
    const px = gridPxPerUnit();
    const tick = gridCellFor(px);
    const every = tick * px >= 45 ? 1 : 5; // a number on every tick, or every fifth
    const step = tick * every;
    const h = renderer.domElement.clientHeight || 600;
    const model = Math.max(extent.x2 - extent.x1, extent.y2 - extent.y1, extent.top) * M;
    const L = Math.min(step * 200, Math.ceil(Math.max(model * 0.6, (h / px) * 0.45, step) / step) * step);
    const minor = 5 / px, major = 10 / px, gap = 16 / px, size = 13 / px;
    axes = new THREE.Group();
    axes.name = "axes";
    const add = (dir, side, color, name) => {
      const hex = `#${new THREE.Color(color).getHexString()}`;
      const pts = [0, 0, 0, dir[0] * L, dir[1] * L, dir[2] * L];
      const n = Math.round(L / tick);
      for (let i = 1; i <= n; i++) {
        const v = i * tick, len = i % every === 0 ? major : minor;
        const p = [dir[0] * v, dir[1] * v, dir[2] * v];
        pts.push(p[0] - side[0] * len, p[1] - side[1] * len, p[2] - side[2] * len, p[0] + side[0] * len, p[1] + side[1] * len, p[2] + side[2] * len);
        if (i % every === 0 && i < n) {
          const s2 = labelSprite(fmt(v), hex, size);
          s2.position.set(p[0] + side[0] * gap, p[1] + side[1] * gap, p[2] + side[2] * gap);
          axes.add(s2);
        }
      }
      const l = lineSegs(pts, color);
      // Like the numbers: hidden behind the building, seen through it in X-ray.
      l.material.depthTest = !labelsSeeThrough();
      l.userData.label3d = true;
      l.position.y = 0.006; // just above the ground, no flicker
      l.renderOrder = 9;
      axes.add(l);
      const s = labelSprite(name, hex, size * 1.6);
      s.position.set(dir[0] * (L + gap * 1.5), dir[1] * (L + gap * 1.5), dir[2] * (L + gap * 1.5));
      axes.add(s);
    };
    add([1, 0, 0], [0, 0, 1], 0xff5252, "X");
    add([0, 0, 1], [1, 0, 0], 0x448aff, "Y");
    add([0, 1, 0], [1, 0, 0], 0x69f0ae, "Z");
    axes.userData = { px, tick, every, length: L };
    helpers.add(axes);
  }
  // Before each frame: rebuild the axes when the tick spacing or zoom drifts.
  function fitAxes() {
    if (!opts.axes || !axes) return;
    const px = gridPxPerUnit(), u = axes.userData;
    if (Math.abs(gridCellFor(px) - u.tick) > u.tick * 1e-6 || Math.abs(px / u.px - 1) > 0.15) buildAxes();
  }

  function buildDims() {
    if (dims) { helpers.remove(dims); disposeGroup(dims); dims = null; }
    if (!opts.dimensions || !project) return;
    const w = (extent.x2 - extent.x1) * M, d = (extent.y2 - extent.y1) * M, h = extent.top * M;
    const x1 = extent.x1 * M, x2 = extent.x2 * M, z1 = extent.y1 * M, z2 = extent.y2 * M;
    const off = Math.max(1, Math.max(w, d) * 0.08);
    const h0 = Math.max(0.35, Math.max(w, d) / 30);
    dims = new THREE.Group();
    dims.name = "dimensions";
    const pts = [x1, 0, z2 + off, x2, 0, z2 + off, x1, 0, z2, x1, 0, z2 + off * 1.2, x2, 0, z2, x2, 0, z2 + off * 1.2,
      x2 + off, 0, z1, x2 + off, 0, z2, x2, 0, z1, x2 + off * 1.2, 0, z1, x2, 0, z2, x2 + off * 1.2, 0, z2,
      x2 + off, 0, z1 - off, x2 + off, h, z1 - off];
    const l = lineSegs(pts, 0xffd166);
    l.material.depthTest = false;
    l.renderOrder = 9;
    dims.add(l);
    const a = labelSprite(`W ${fmt(w, true)}`, "#ffd166", h0); a.center.set(0.5, 0); a.position.set((x1 + x2) / 2, 0.2, z2 + off + h0); dims.add(a);
    const b = labelSprite(`D ${fmt(d, true)}`, "#ffd166", h0); b.center.set(0.5, 0); b.position.set(x2 + off + h0 * 2.5, 0.2, (z1 + z2) / 2); dims.add(b);
    const c = labelSprite(`H ${fmt(h, true)}`, "#ffd166", h0); c.position.set(x2 + off + h0 * 2.5, h / 2, z1 - off); dims.add(c);
    dims.userData = { w, d, h };
    helpers.add(dims);
  }

  function placeSun() {
    const [cx, cz] = centreXZ();
    const r = Math.max(20, Math.max(extent.x2 - extent.x1, extent.y2 - extent.y1, extent.top) * M * 1.2);
    // Azimuth measured from north (−Z when north is up), clockwise.
    const az = ((opts.sunAzimuth || 0) + (opts.north || 0)) * DEG;
    const al = Math.max(3, Math.min(89, opts.sunAltitude || 45)) * DEG;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(al), Math.sin(al), -Math.cos(az) * Math.cos(al));
    sun.position.set(cx + dir.x * r * 2, dir.y * r * 2, cz + dir.z * r * 2);
    sun.target.position.set(cx, 0, cz);
    const sc = sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 0.5; sc.far = r * 6;
    sc.updateProjectionMatrix();
    invalidateShadows();
    dirty = true;
  }

  function updateHelpers() {
    buildGround();
    buildGrid();
    buildAxes();
    buildDims();
    placeSun();
  }

  function applyBackground() {
    if (bgTexture) { bgTexture.dispose(); bgTexture = null; }
    const bg = opts.night ? { top: "#070b16", bottom: "#1b2337" } : opts.background;
    if (bg && typeof bg === "object" && bg.top) { bgTexture = backgroundTexture(bg.top, bg.bottom); scene.background = bgTexture; }
    else if (!bg || bg === "gradient") { bgTexture = backgroundTexture("#8fb6dc", "#e9eef2"); scene.background = bgTexture; }
    else scene.background = new THREE.Color(bg);
    dirty = true;
  }

  // ---------------------------------------------------------------- camera
  function sceneBox() {
    const box = new THREE.Box3();
    box.expandByObject(building);
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    return box;
  }

  function framing(dirVec) {
    const box = sceneBox();
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    const vfov = persp.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * persp.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.9;
    return { target: center, dir: dirVec.clone().normalize(), dist, radius };
  }

  function syncOrtho() {
    // Match the orthographic frustum to what the perspective camera sees at the target.
    const dist = camera.position.distanceTo(controls.target);
    const h = 2 * dist * Math.tan((persp.fov * DEG) / 2);
    const aspect = persp.aspect;
    ortho.left = (-h * aspect) / 2; ortho.right = (h * aspect) / 2; ortho.top = h / 2; ortho.bottom = -h / 2;
    ortho.near = -dist * 20; ortho.far = dist * 40;
    ortho.updateProjectionMatrix();
  }

  function animateTo(f, duration = 450) {
    const fromDir = camera.position.clone().sub(controls.target);
    const fromDist = fromDir.length() || f.dist;
    fromDir.normalize();
    persp.near = Math.max(0.03, f.radius / 300);
    persp.far = f.radius * 60 + f.dist;
    persp.updateProjectionMatrix();
    controls.maxDistance = f.radius * 30;
    anim = { t0: performance.now(), duration, fromDir, toDir: f.dir, fromDist, toDist: f.dist, fromTarget: controls.target.clone(), toTarget: f.target.clone() };
    dirty = true;
  }

  function stepAnim(now) {
    const a = anim;
    const t = Math.min(1, (now - a.t0) / a.duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const dir = slerpDir(a.fromDir, a.toDir, e, new THREE.Vector3());
    const dist = a.fromDist + (a.toDist - a.fromDist) * e;
    controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    camera.lookAt(controls.target);
    if (camera === ortho) syncOrtho();
    if (t >= 1) anim = null;
  }

  function setView(name = "iso") {
    if (opts.navMode === "walk") setNavMode("orbit");
    const d = VIEW_DIRS[name] || VIEW_DIRS.iso;
    lastView = VIEW_DIRS[name] ? name : "iso";
    animateTo(framing(new THREE.Vector3(...d)));
  }

  function zoomToFit() {
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(...VIEW_DIRS.iso);
    animateTo(framing(dir));
  }

  function setProjection(useOrtho) {
    const next = useOrtho ? ortho : persp;
    if (next === camera) return;
    next.position.copy(camera.position);
    next.quaternion.copy(camera.quaternion);
    camera = next;
    controls.object = camera;
    if (useOrtho) { ortho.zoom = 1; syncOrtho(); }
    controls.update();
    dirty = true;
  }

  // ---------------------------------------------------------------- walk mode
  const walk = { yaw: 0, pitch: 0, keys: new Set(), drag: null, last: 0, eye: 1.6, base: 0 };
  function setNavMode(mode) {
    opts.navMode = mode === "pan" ? "pan" : mode === "walk" ? "walk" : "orbit";
    controls.enabled = opts.navMode !== "walk";
    controls.mouseButtons = opts.navMode === "pan"
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    canvas.style.cursor = opts.navMode === "pan" ? "grab" : opts.navMode === "walk" ? "crosshair" : "";
    if (opts.navMode === "walk") {
      if (camera === ortho) setProjection(false);
      // Stand at eye height on the lowest visible level, looking along the view.
      const dir = controls.target.clone().sub(camera.position);
      walk.yaw = Math.atan2(dir.x, -dir.z);
      walk.pitch = 0;
      const lv = project && project.levels.find((l) => !opts.levels || opts.levels.has(l.id));
      walk.base = lv ? lv.elevation * M : 0;
      const [cx, cz] = centreXZ();
      const inside = camera.position.y < walk.base + 3 && camera.position.y > walk.base;
      if (!inside) camera.position.set(cx, walk.base + walk.eye, cz + Math.max(2, (extent.y2 - extent.y1) * M * 0.25));
      camera.position.y = walk.base + walk.eye;
      applyWalkLook();
    }
    dirty = true;
  }

  function applyWalkLook() {
    const dir = new THREE.Vector3(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
    camera.lookAt(camera.position.clone().add(dir));
    controls.target.copy(camera.position).addScaledVector(dir, 3);
    dirty = true;
  }

  function walkStep(dt) {
    if (opts.navMode !== "walk" || !walk.keys.size) return;
    const speed = (walk.keys.has("shift") ? 4.5 : 1.6) * dt;
    const fwd = new THREE.Vector3(Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
    const right = new THREE.Vector3(Math.cos(walk.yaw), 0, Math.sin(walk.yaw));
    const k = walk.keys;
    if (k.has("w") || k.has("arrowup")) camera.position.addScaledVector(fwd, speed);
    if (k.has("s") || k.has("arrowdown")) camera.position.addScaledVector(fwd, -speed);
    if (k.has("d")) camera.position.addScaledVector(right, speed);
    if (k.has("a")) camera.position.addScaledVector(right, -speed);
    if (k.has("arrowleft")) walk.yaw -= dt * 1.4;
    if (k.has("arrowright")) walk.yaw += dt * 1.4;
    if (k.has("e") || k.has("pageup")) camera.position.y += speed;
    if (k.has("q") || k.has("pagedown")) camera.position.y = Math.max(0.3, camera.position.y - speed);
    applyWalkLook();
  }

  function walkKey(e, down) {
    if (opts.navMode !== "walk") return false;
    const k = e.key.toLowerCase();
    if (!["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "pageup", "pagedown", "shift"].includes(k)) return false;
    if (down) walk.keys.add(k); else walk.keys.delete(k);
    if (e.shiftKey) walk.keys.add("shift"); else walk.keys.delete("shift");
    return true;
  }

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(HIDDEN_LAYER); // batched meshes are picked, not drawn
  const ndc = new THREE.Vector2();
  function raycastAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(building, true).filter((h) => {
      if (!h.object.visible) return false;
      for (let o = h.object; o; o = o.parent) if (!o.visible) return false;
      // Ignore what the section cut removes.
      if ([...renderer.clippingPlanes, ...(sk ? sk.clipPlanes() : [])].some((pl) => pl.distanceToPoint(h.point) < 0)) return false;
      return true;
    });
    return hits[0] || null;
  }
  // ---------------------------------------------------------------- SketchUp-style tools
  // push/pull: drag the top face of a mass or a wall up or down; paint: click a
  // face to give it the current material; tape: click two points to measure.
  const toolCallbacks = new Set();
  const emitTool = (ev) => { for (const cb of toolCallbacks) { try { cb(ev); } catch (err) { console.error(err); } } };
  let push = null;
  let tapeA = null;
  const measures = new THREE.Group();
  measures.name = "measures";
  scene.add(measures);
  function rayFrom(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }
  // Height (m) where the pointer ray meets the vertical plane through `p`
  // facing the camera.
  function heightAt(p, clientX, clientY) {
    const ray = rayFrom(clientX, clientY);
    const n = camera.getWorldDirection(new THREE.Vector3());
    n.y = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? hit.y : null;
  }
  function addMeasure(a, b) {
    const l = lineSegs([a.x, a.y, a.z, b.x, b.y, b.z], 0xffb300);
    l.material.depthTest = false;
    l.renderOrder = 11;
    const d = a.distanceTo(b);
    const s = labelSprite(fmt(d, true), "#ffd166", Math.max(0.25, d / 14));
    s.position.copy(a).add(b).multiplyScalar(0.5);
    measures.add(l, s);
    dirty = true;
    return d;
  }
  function clearMeasures() {
    disposeGroup(measures);
    measures.clear();
    tapeA = null;
    dirty = true;
  }
  function toolDown(e) {
    const hit = raycastAt(e.clientX, e.clientY);
    const info = hit ? { id: hit.object.userData.id || null, kind: hit.object.userData.kind || null, level: hit.object.userData.level || null, point: hit.point.clone(), normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null } : null;
    if (opts.tool === "tape") {
      const p = hit ? hit.point.clone() : null;
      if (!p) return true;
      if (!tapeA) { tapeA = p; emitTool({ type: "tapeStart", point: p }); }
      else { const d = addMeasure(tapeA, p); emitTool({ type: "tape", a: tapeA, b: p, distance: d }); tapeA = null; }
      return true;
    }
    if (!info || !info.id) return opts.tool !== "none";
    if (opts.tool === "paint") { emitTool({ type: "paint", ...info }); return true; }
    if (opts.tool === "pushpull" && (info.kind === "solids" || info.kind === "walls") && info.normal && info.normal.y > 0.6) {
      push = { ...info, y0: info.point.y };
      controls.enabled = false;
      emitTool({ type: "pushStart", ...info });
      return true;
    }
    return true;
  }

  // Dragging a selected lamp: it slides on the horizontal plane through the
  // point that was grabbed (a ceiling lamp stays under the ceiling).
  let lampDrag = null;
  let lastPickId = null;
  function furnitureGroupOf(obj, id) {
    let g = obj;
    while (g.parent && g.parent !== building && !(g.userData.id === id && g.parent.name && g.parent.name.startsWith("level:"))) g = g.parent;
    return g.userData.id === id ? g : null;
  }
  function lampDown(e) {
    const hit = raycastAt(e.clientX, e.clientY);
    if (!hit || hit.object.userData.kind !== "furniture") return false;
    const id = hit.object.userData.id;
    if (!highlighted.has(id) && lastPickId !== id) return false;
    const g = furnitureGroupOf(hit.object, id);
    if (!g || !g.getObjectByName("lamp")) return false;
    lampDrag = { id, group: g, pos0: g.position.clone(), start: hit.point.clone(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), dx: 0, dy: 0, moved: false };
    unbatch([id]);
    controls.enabled = false;
    return true;
  }
  function lampMove(e) {
    const d = lampDrag;
    const hit = rayFrom(e.clientX, e.clientY).intersectPlane(d.plane, new THREE.Vector3());
    if (!hit) return;
    const dx = hit.x - d.start.x, dz = hit.z - d.start.z;
    if (!d.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;
    if (!d.moved) { d.moved = true; emitTool({ type: "lampMoveStart", id: d.id }); }
    d.dx = Math.round(dx * 1000);
    d.dy = Math.round(dz * 1000);
    d.group.position.set(d.pos0.x + dx, d.pos0.y, d.pos0.z + dz);
    d.group.updateMatrixWorld(true);
    for (const l of lampRig.lamps) if (l.anchor.parent === d.group) l.pos.setFromMatrixPosition(l.anchor.matrixWorld);
    lampRig.invalidate();
    invalidateShadows();
    dirty = true;
    emitTool({ type: "lampMove", id: d.id, dx: d.dx, dy: d.dy });
  }

  let down = null;
  function onPointerDown(e) {
    down = { x: e.clientX, y: e.clientY, button: e.button };
    if (sk && sk.pointerDown(e)) { down.tool = true; return; }
    // A drag that a tool takes (push/pull, a lamp) keeps the pointer even when
    // it leaves the canvas, so its release always ends it.
    const capture = () => {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
      // …and the window hears it too, wherever the pointer is let go.
      const win = canvas.ownerDocument.defaultView || window;
      const move = (ev) => { if (ev.target !== canvas) onPointerMove(ev); };
      const up = (ev) => { win.removeEventListener("pointermove", move, true); win.removeEventListener("pointerup", up, true); if (ev.target !== canvas) onPointerUp(ev); };
      win.addEventListener("pointermove", move, true);
      win.addEventListener("pointerup", up, true);
    };
    if (e.button === 0 && opts.tool && opts.tool !== "none" && opts.navMode !== "walk") {
      if (toolDown(e)) { down.tool = true; if (push) capture(); return; }
    }
    if (e.button === 0 && (!opts.tool || opts.tool === "none") && opts.navMode !== "walk" && lampDown(e)) { down.tool = true; capture(); return; }
    if (opts.navMode === "walk") { walk.drag = { x: e.clientX, y: e.clientY, yaw: walk.yaw, pitch: walk.pitch }; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); }
  }
  function onPointerMove(e) {
    if (sk && sk.pointerMove(e)) return;
    if (lampDrag) { lampMove(e); return; }
    if (push) {
      const y = heightAt(push.point, e.clientX, e.clientY);
      if (y !== null) emitTool({ type: "push", id: push.id, kind: push.kind, dy: (y - push.y0) * 1000, y });
      return;
    }
    if (opts.navMode === "walk" && walk.drag) {
      walk.yaw = walk.drag.yaw + (e.clientX - walk.drag.x) * 0.005 * (opts.rotateSpeed || 1);
      walk.pitch = Math.max(-1.3, Math.min(1.3, walk.drag.pitch - (e.clientY - walk.drag.y) * 0.005 * (opts.rotateSpeed || 1)));
      applyWalkLook();
    }
  }
  function onPointerUp(e) {
    walk.drag = null;
    if (sk && sk.pointerUp(e)) { down = null; return; }
    if (lampDrag) {
      const d = lampDrag;
      lampDrag = null;
      controls.enabled = opts.navMode !== "walk";
      down = null;
      if (d.moved) emitTool({ type: "lampMoveEnd", id: d.id, dx: d.dx, dy: d.dy });
      else { lastPickId = d.id; const info = { id: d.id, kind: "furniture", level: d.group.userData.level || null, point: d.start }; for (const cb of pickCallbacks) { try { cb(info); } catch (err) { console.error(err); } } }
      return;
    }
    if (push) {
      emitTool({ type: "pushEnd", id: push.id, kind: push.kind });
      push = null;
      controls.enabled = opts.navMode !== "walk";
      down = null;
      return;
    }
    if (down && down.tool) { down = null; return; }
    if (!down || down.button !== 0) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 4 || !pickCallbacks.size) return;
    const hit = raycastAt(e.clientX, e.clientY);
    const info = hit ? { id: hit.object.userData.id || null, kind: hit.object.userData.kind || null, level: hit.object.userData.level || null, point: hit.point, comp: hit.object.userData.comp || null, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey } : null;
    lastPickId = info ? info.id : null;
    for (const cb of pickCallbacks) { try { cb(info); } catch (err) { console.error(err); } }
  }
  // What is under a screen point: {id, kind, level, point, lamp} or null.
  function pickAt(clientX, clientY) {
    const hit = raycastAt(clientX, clientY);
    if (!hit) return null;
    const id = hit.object.userData.id || null;
    const g = id && hit.object.userData.kind === "furniture" ? furnitureGroupOf(hit.object, id) : null;
    const a = g && g.getObjectByName("lamp");
    return { id, kind: hit.object.userData.kind || null, level: hit.object.userData.level || null, point: hit.point.clone(), lamp: a ? { ...a.userData.lamp } : null };
  }
  const dblCallbacks = new Set();
  function onDblClick(e) {
    if (opts.navMode === "walk") return;
    if (sk && sk.dblClick(e)) return;
    if (dblCallbacks.size) {
      const info = pickAt(e.clientX, e.clientY);
      for (const cb of dblCallbacks) { try { if (cb(info)) return; } catch (err) { console.error(err); } }
    }
    const hit = raycastAt(e.clientX, e.clientY);
    if (!hit) return;
    const dir = camera.position.clone().sub(controls.target);
    const f = framing(dir);
    f.target = hit.point.clone();
    f.dist = Math.max(dir.length() * 0.6, f.radius * 0.12);
    animateTo(f, 350);
  }
  function onWheel(e) {
    if (opts.navMode !== "walk") return;
    e.preventDefault();
    const fwd = new THREE.Vector3(Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
    camera.position.addScaledVector(fwd, -Math.sign(e.deltaY) * 0.5);
    applyWalkLook();
  }
  sk = createSketchupLayer({
    THREE, scene, canvas, renderer, controls, opts,
    get camera() { return camera; }, get building() { return building; }, get project() { return project; },
    raycastAt, rayFrom, emitTool, labelSprite, fmt, addMeasure, markDirty: () => { dirty = true; invalidateShadows(); }, unbatch: (ids) => unbatch(ids),
    getHighlighted: () => highlighted,
    batches: () => batcher.group.children,
    extentSize: () => Math.max(extent.x2 - extent.x1, extent.y2 - extent.y1, extent.top) * M,
    t: (s) => (opts.translate ? opts.translate(s) : s),
    positionCamera: (pt) => { setNavMode("walk"); camera.position.set(pt.x, pt.y + walk.eye, pt.z); walk.base = pt.y; applyWalkLook(); },
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------------------------------------------------------------- highlight
  function highlightMaterial(base) {
    let m = hlMats.get(base);
    if (!m) {
      m = base.clone();
      if (m.emissive) { m.emissive = new THREE.Color(0x2a7fff); m.emissiveIntensity = 0.6; }
      else m.color = new THREE.Color(0x7fb5ff);
      hlMats.set(base, m);
    }
    return m;
  }

  // The material before highlighting is kept on the mesh, so styles and
  // highlights can be switched in any order.
  function applyHighlight() {
    building.traverse((o) => {
      if (!o.isMesh) return;
      const on = highlighted.has(o.userData.id);
      if (on && !o.userData.hl) { o.userData.hl = o.material; o.material = highlightMaterial(o.material); }
      else if (!on && o.userData.hl) { o.material = o.userData.hl; o.userData.hl = null; }
    });
    batcher.show(ownMeshIds());
    dirty = true;
  }
  // Items a tool is about to move: drawn by their own meshes until the next rebuild.
  function unbatch(ids) {
    for (const id of ids || []) if (id) moving.add(id);
    batcher.show(ownMeshIds());
    dirty = true;
  }

  // ---------------------------------------------------------------- loop / size
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    if (camera === ortho) syncOrtho();
    dirty = true;
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);
  controls.addEventListener("change", () => { dirty = true; });

  const gizmoScene = new THREE.Scene();
  const gizmoCam = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 10);
  const gizmoAxes = new THREE.AxesHelper(1);
  gizmoAxes.material.depthTest = false;
  gizmoAxes.material.toneMapped = false;
  gizmoScene.add(gizmoAxes);
  for (const [txt, col, p] of [["X", "#ff5252", [1.35, 0, 0]], ["Y", "#448aff", [0, 0, 1.35]], ["Z", "#69f0ae", [0, 1.35, 0]], ["N", "#ffffff", [0, 0, -1.35]]]) {
    const sp = labelSprite(txt, col, 0.5);
    sp.userData.label3d = false; // the corner gizmo is its own overlay
    sp.material.depthTest = false;
    sp.position.set(...p);
    gizmoScene.add(sp);
  }
  function renderGizmo() {
    if (opts.gizmo === false) return;
    const size = 96;
    const w = container.clientWidth, h = container.clientHeight;
    if (w < size * 2 || h < size * 2) return;
    gizmoCam.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(4);
    gizmoCam.up.copy(camera.up);
    gizmoCam.lookAt(0, 0, 0);
    const clip = renderer.clippingPlanes;
    renderer.clippingPlanes = [];
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setViewport(8, 8, size, size);
    renderer.setScissor(8, 8, size, size);
    renderer.clearDepth();
    renderer.render(gizmoScene, gizmoCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.autoClear = true;
    renderer.clippingPlanes = clip;
  }

  let lastT = performance.now();
  let lastFrame = { calls: 0, triangles: 0 }; // what the last main pass drew
  renderer.setAnimationLoop((now) => {
    if (disposed) return;
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (anim) stepAnim(now);
    walkStep(dt);
    const zoomed = opts.navMode !== "walk" && stepSmoothZoom();
    const changed = (opts.navMode !== "walk" && controls.update()) || zoomed;
    if (changed && camera === ortho) syncOrtho();
    if (changed || dirty || anim || walk.keys.size) {
      sk.beforeRender(); // two-point perspective, profiles
      fitGrid();
      fitAxes();
      lampRig.update(camera.position, { clip: renderer.clippingPlanes.length ? clipPlane : null });
      renderer.render(scene, camera);
      lastFrame = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      renderGizmo();
      dirty = false;
    }
  });

  // ---------------------------------------------------------------- API
  function setProject(p) {
    const first = !project;
    // Only lamps switched or re-coloured: keep the model, update the lamps.
    if (!first && hasLamps(p) && lightKey && lampKey(p) === lightKey) { project = p; updateLamps(p); return "lamps"; }
    project = p;
    rebuild();
    if (first) {
      const f = framing(new THREE.Vector3(...VIEW_DIRS[lastView]));
      controls.target.copy(f.target);
      camera.position.copy(f.target).addScaledVector(f.dir, f.dist);
      persp.near = Math.max(0.03, f.radius / 300);
      persp.far = f.radius * 60 + f.dist;
      persp.updateProjectionMatrix();
      controls.update();
    }
  }

  function setOptions(o = {}) {
    const prev = { ...opts };
    Object.assign(opts, o);
    const changed = (k) => k in o && JSON.stringify(o[k]) !== JSON.stringify(prev[k]);
    if (["openDoors", "furniture", "roofs", "levels", "phase", "hiddenTags"].some(changed)) rebuild();
    else if (["style", "edges", "edgeColor", "profiles", "profileWidth", "colorByTag"].some(changed)) applyStyle();
    if (changed("section")) applyClipping();
    if (["grid", "units3d", "ground"].some(changed)) buildGrid();
    if (changed("axes")) buildAxes();
    if (["dimensions", "units3d"].some(changed)) buildDims();
    if (changed("ground")) buildGround();
    if (["sunAzimuth", "sunAltitude", "north"].some(changed)) placeSun();
    if (changed("shadows")) sun.castShadow = opts.shadows !== false && opts.style !== "lines" && !opts.night;
    if (changed("night")) { applyLighting(); applyBackground(); applyFog(); }
    if (changed("navMode")) setNavMode(opts.navMode);
    if (changed("ortho")) setProjection(!!opts.ortho);
    if (changed("fov") && opts.fov > 5) { persp.fov = opts.fov; persp.updateProjectionMatrix(); }
    if (changed("rotateSpeed")) controls.rotateSpeed = opts.rotateSpeed || 1;
    if (changed("background")) applyBackground();
    if (changed("tool")) { tapeA = null; canvas.style.cursor = opts.tool === "none" ? "" : "crosshair"; }
    if (["fog", "background", "fogDensity"].some(changed)) applyFog();
    if (changed("groundColor")) buildGround();
    if (["sectionCuts", "sectionFill"].some(changed)) applyClipping();
    if (changed("twoPoint") && !opts.twoPoint) { persp.updateProjectionMatrix(); camera.lookAt(controls.target); }
    sk.setOptions(o, changed);
    invalidateShadows();
    dirty = true;
  }

  function applyFog() {
    if (!opts.fog) { scene.fog = null; dirty = true; return; }
    const span = Math.max(20, Math.max(extent.x2 - extent.x1, extent.y2 - extent.y1) * M);
    const col = scene.background && scene.background.isColor ? scene.background : new THREE.Color(0xdde6ee);
    const k = Math.max(0.1, +opts.fogDensity || 1); // the style editor's fog density
    scene.fog = new THREE.Fog(col, (span * 1.2) / k, (span * 6) / k);
    dirty = true;
  }

  // Saved views (scenes): camera, target and projection.
  function getCamera() {
    return { pos: camera.position.toArray().map((v) => +v.toFixed(4)), target: controls.target.toArray().map((v) => +v.toFixed(4)), ortho: camera === ortho };
  }

  function setCamera(c, duration = 900) {
    if (!c || !c.pos) return;
    if (opts.navMode === "walk") setNavMode("orbit");
    if (!!c.ortho !== (camera === ortho)) { opts.ortho = !!c.ortho; setProjection(!!c.ortho); }
    const target = new THREE.Vector3(...c.target);
    const dir = new THREE.Vector3(...c.pos).sub(target);
    const f = framing(dir);
    f.target = target;
    f.dist = dir.length();
    animateTo(f, duration);
    // An instant move (duration ≤ 1 ms) is applied now, not on the next frame:
    // whoever asked may project or pick with the camera straight away.
    if (duration <= 1) { stepAnim(anim.t0 + anim.duration + 1); camera.updateMatrixWorld(); }
  }

  function highlight(ids = []) {
    highlighted = new Set((ids || []).filter(Boolean));
    applyHighlight();
  }

  function onPick(cb) { pickCallbacks.add(cb); return () => pickCallbacks.delete(cb); }

  function screenshot() {
    sk.beforeRender();
    renderer.render(scene, camera);
    return sk.composite(canvas); // with the style's watermark
  }

  // Visible building meshes baked to world transforms (export, measurements).
  function exportRoot({ scale = 1 } = {}) {
    const root = new THREE.Group();
    root.name = project && project.meta.title ? project.meta.title : "building";
    content.updateMatrixWorld(true);
    content.traverseVisible((o) => {
      if (!o.isMesh) return;
      const mat = o.userData.baseMaterial || o.material;
      const m = new THREE.Mesh(o.geometry, mat);
      m.name = o.name || (o.parent && o.parent.name) || "";
      m.userData = { id: o.userData.id, kind: o.userData.kind };
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      if (scale !== 1) { m.position.multiplyScalar(scale); m.scale.multiplyScalar(scale); }
      root.add(m);
    });
    return root;
  }

  async function exportFile(format, { scale = 1, binary = true } = {}) {
    const root = exportRoot({ scale });
    root.updateMatrixWorld(true);
    if (format === "glb" || format === "gltf") {
      const { GLTFExporter } = await import("../vendor/three/addons/GLTFExporter.js");
      return new GLTFExporter().parseAsync(root, { binary: format === "glb", onlyVisible: true, embedImages: true });
    }
    if (format === "stl") {
      const { STLExporter } = await import("../vendor/three/addons/STLExporter.js");
      return new STLExporter().parse(root, { binary });
    }
    if (format === "obj") {
      const { OBJExporter } = await import("../vendor/three/addons/OBJExporter.js");
      return new OBJExporter().parse(root);
    }
    if (format === "ply") {
      const { PLYExporter } = await import("../vendor/three/addons/PLYExporter.js");
      return new Promise((resolve) => new PLYExporter().parse(root, resolve, { binary }));
    }
    if (format === "usdz") {
      const { USDZExporter } = await import("../vendor/three/addons/USDZExporter.js");
      return new USDZExporter().parseAsync(root, { quickLookCompatible: true });
    }
    throw new Error(`unknown 3D format ${format}`);
  }

  // meshes / triangles: the model; drawCalls: what the GPU was asked to draw
  // in the last frame (after batching); batches / instances: batch.js.
  function stats() {
    let meshes = 0, triangles = 0;
    building.traverseVisible((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    return { meshes, triangles: Math.round(triangles), drawCalls: lastFrame.calls, ...batcher.info() };
  }

  function dispose() {
    disposed = true;
    renderer.setAnimationLoop(null);
    if (ro) ro.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("dblclick", onDblClick);
    canvas.removeEventListener("wheel", onWheel);
    controls.dispose();
    lampRig.dispose();
    batcher.release();
    disposeObject(building);
    for (const g of [ground, grid, axes, dims, edges]) if (g) disposeGroup(g);
    mats.dispose();
    for (const m of hlMats.values()) m.dispose();
    for (const m of Object.values(styleMats)) m.dispose();
    if (bgTexture) bgTexture.dispose();
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  function orbit(dAz, dEl) {
    if (opts.navMode === "walk") { walk.yaw += dAz * DEG; walk.pitch = Math.max(-1.3, Math.min(1.3, walk.pitch + dEl * DEG)); applyWalkLook(); return; }
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta -= dAz * DEG;
    sph.phi = Math.min(Math.PI - 0.01, Math.max(0.01, sph.phi - dEl * DEG));
    off.setFromSpherical(sph);
    camera.position.copy(controls.target).add(off);
    camera.lookAt(controls.target);
    dirty = true;
  }

  function pan(dx, dy) {
    const dist = camera.position.distanceTo(controls.target);
    const span = 2 * dist * Math.tan((persp.fov * DEG) / 2);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const move = right.multiplyScalar(-dx * span * persp.aspect).add(up.multiplyScalar(dy * span));
    camera.position.add(move);
    controls.target.add(move);
    dirty = true;
  }

  applyBackground();
  resize();
  updateHelpers();
  setNavMode(opts.navMode);
  persp.fov = opts.fov;
  persp.updateProjectionMatrix();
  controls.rotateSpeed = opts.rotateSpeed || 1;

  return {
    setProject, setOptions, setView, zoomToFit, highlight, onPick, screenshot, orbit, pan, setNavMode, walkKey,
    onTool: (cb) => { toolCallbacks.add(cb); return () => toolCallbacks.delete(cb); }, clearMeasures, measureCount: () => measures.children.length / 2, getCamera, setCamera,
    exportFile, exportRoot, resize, dispose, stats, rebuild,
    pickAt, onDblPick: (cb) => { dblCallbacks.add(cb); return () => dblCallbacks.delete(cb); }, setLampState: (id, light) => { const ok = setLampState(id, light); refreshMaterials(); return ok; }, updateLamps: (p) => updateLamps(p || project), lampInfo: () => { lampRig.update(camera.position, { clip: renderer.clippingPlanes.length ? clipPlane : null }); return lampRig.info(); },
    getOptions: () => ({ ...opts }),
    skKey: (e, isDown) => sk.key(e, isDown), ...sk.api,
    helperInfo: () => ({ grid: grid ? { ...grid.userData } : null, dimensions: dims ? { ...dims.userData } : null, axes: axes ? { ...axes.userData } : null, edges: !!edges, ortho: camera === ortho, walk: opts.navMode === "walk", section: renderer.clippingPlanes.length > 0 }),
    get three() { return { THREE, scene, camera, renderer, controls, content, building }; },
  };
}

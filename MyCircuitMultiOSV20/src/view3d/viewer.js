// 3D board viewer: board slab with painted faces, procedural components,
// orbit camera with animated presets, picking, cross-probe highlight, export.
//
// World frame (see boardmesh.js): X = board x, Z = board y, Y = up, board
// spans 0 <= Y <= thickness. Top-side parts sit at Y = thickness; bottom-side
// parts hang from Y = 0, mirrored in x and flipped (fpTransform semantics).
// The "top" preset looks down -Y with -Z up, i.e. exactly the 2D editor.

import * as THREE from "../vendor/three/three.module.js";
import { parseValue } from "../core/project.js";
import { OrbitControls } from "../vendor/three/addons/OrbitControls.js";
import { STLExporter } from "../vendor/three/addons/STLExporter.js";
import { GLTFExporter } from "../vendor/three/addons/GLTFExporter.js";
import { getFootprint } from "../lib/footprints.js";
import { buildModel, disposeModelMaterials } from "./models.js";
import { boardShapeData, buildBoardGeometry, buildBarrelGeometry } from "./boardmesh.js";
import { textureLayout, paintBoardSide, finishColor } from "./texture.js";

export { boardShapeData } from "./boardmesh.js";
export { buildModel } from "./models.js";

const DEG = Math.PI / 180;

export const DEFAULT_OPTIONS = {
  components: true, silkscreen: true, soldermask: true, copper: true, zones: true,
  boardBody: true, axes: true, grid: true, gizmo: true, dimensions: true, units3d: "cm", transparentBoard: false,
  background: "gradient", maskColor: null, silkColor: null, shadows: true,
  // Light: the key (sun) light with shadows plus a fill and a camera headlight.
  // Off leaves only the ambient sky light, so the board stays visible.
  lights: true, lightIntensity: 100, lightAzimuth: 56, lightElevation: 56, lightPos: null, lightColor: "#ffffff", ambient: 100, headlight: 100,
  // Axes: length (% of the board), tick values on/off and label size (%).
  axesScale: 100, axesValues: true, axesLabelSize: 100,
};
export const LIGHT_OPTIONS = ["lights", "lightIntensity", "lightAzimuth", "lightElevation", "lightColor", "ambient", "headlight", "shadows"];
export const AXES_OPTIONS = ["axes", "axesScale", "axesValues", "axesLabelSize"];

// Direction from target to camera for each preset. Tiny offsets keep the
// orbit math away from the poles and pick which way is "up" on screen:
// top → -Z up (editor view); bottom → mirrored left/right like flipping the board over.
const VIEW_DIRS = {
  iso: [0.75, 1.0, 1.15],
  top: [0, 1, 1e-4],
  bottom: [0, -1, -1e-4],
  front: [0, 0.0001, 1],
  back: [0, 0.0001, -1],
  left: [-1, 0.0001, 0],
  right: [1, 0.0001, 0],
};

// Strokefont is optional (another module); fall back to canvas fillText.
let strokeTextFn = null;
const strokeFontReady = import("../fab/strokefont.js")
  .then((m) => { strokeTextFn = typeof m.strokeText === "function" ? m.strokeText : null; })
  .catch(() => { strokeTextFn = null; });

function makeCanvas(w, h) {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
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

// Soft studio environment so metal leads and pads have something to reflect.
function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x4a4e55, side: THREE.BackSide }));
  scene.add(room);
  const panel = (x, y, z, w, h, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(1.5, 4.9, 1, 4, 4, 2.2);
  panel(4.9, 2, 2, 3, 4, 2.0);
  panel(-4.9, 1, -2, 3, 3, 1.4);
  panel(0, 1, 4.9, 4, 2, 1.2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

function slerpDir(a, b, t, out) {
  const d = Math.min(1, Math.max(-1, a.dot(b)));
  const ang = Math.acos(d);
  if (ang < 1e-5) return out.copy(b);
  let axis = new THREE.Vector3().crossVectors(a, b);
  if (axis.lengthSq() < 1e-10) {
    // Opposite directions: swing through the horizon (or over the top for horizontal pairs).
    axis = Math.abs(a.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  }
  axis.normalize();
  return out.copy(a).applyAxisAngle(axis, ang * t);
}

// 4-band colour code (two digits, multiplier, 5 % gold) for a resistor value.
const BAND_NAMES = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white"];
export function resistorBandNames(value) {
  const ohms = parseValue(value);
  if (!(ohms > 0)) return null;
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** exp);
  if (sig >= 100) { sig = Math.round(sig / 10); exp += 1; }
  if (exp < -2 || exp > 9) return null;
  const mult = exp === -1 ? "gold" : exp === -2 ? "silver" : BAND_NAMES[exp];
  return [BAND_NAMES[Math.floor(sig / 10)], BAND_NAMES[sig % 10], mult, "gold"];
}

export function createViewer(container, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.outline = "none";
  canvas.tabIndex = 0;
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.position.set(60, 80, 90);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.zoomToCursor = true;

  // Lights: sky/ground fill + key (shadows) + a headlight riding on the
  // camera, so the bottom and side views are lit as well as the top.
  const hemi = new THREE.HemisphereLight(0xf4f7ff, 0x4a4a46, 0.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
  scene.add(fill, fill.target);
  const headlight = new THREE.DirectionalLight(0xffffff, 0.7);
  headlight.position.set(0, 0, 0);
  headlight.target.position.set(0, 0, -1);
  camera.add(headlight, headlight.target);
  scene.add(camera);
  const BASE = { hemi: 0.9, key: 1.9, fill: 0.35, head: 0.7 };
  const pct = (v, d = 100) => (Number.isFinite(+v) ? +v : d) / 100;
  // Light switch and settings (intensity, colour, direction, ambient, headlight).
  function applyLights() {
    const on = opts.lights !== false;
    key.visible = fill.visible = headlight.visible = on;
    key.intensity = BASE.key * pct(opts.lightIntensity);
    key.color.set(opts.lightColor || "#ffffff");
    fill.intensity = BASE.fill * pct(opts.lightIntensity);
    headlight.intensity = BASE.head * pct(opts.headlight);
    // With the lights off the sky light alone keeps the board readable.
    hemi.intensity = BASE.hemi * pct(opts.ambient) * (on ? 1 : 1.6);
    key.castShadow = on && opts.shadows !== false;
    dirty = true;
  }
  // Unit vector from the board toward the key light (azimuth from +X toward
  // the viewer, elevation above the board).
  function lightDir() {
    const az = (Number(opts.lightAzimuth) || 0) * DEG;
    const el = Math.min(89.9, Math.max(-89.9, Number(opts.lightElevation) || 0)) * DEG;
    return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  }

  const content = new THREE.Group(); // board + parts: what gets exported
  content.name = "board3d";
  scene.add(content);
  const helpers = new THREE.Group();
  scene.add(helpers);

  let project = null;
  let thickness = 1.6;
  let layout = null;
  let boardMesh = null;
  let barrelMesh = null;
  const boardMats = [];
  const faceTex = { top: null, bottom: null, topPbr: null, bottomPbr: null };
  let componentsGroup = new THREE.Group();
  content.add(componentsGroup);
  const templates = new Map(); // model key -> Group (shared geometry)
  const instances = new Map(); // ref -> holder group
  const hlMats = new Map(); // base material -> highlight clone
  let highlighted = new Set();
  const pickCallbacks = new Set();
  let grid = null;
  let axes = null;
  let bgTexture = null;
  let dirty = true;
  let anim = null;
  let disposed = false;
  let fontRepaintPending = false;
  let lastView = "iso";

  // ---------------------------------------------------------------- textures
  function paintFaces() {
    if (!project || !layout) return;
    const paintOpts = {
      soldermask: opts.soldermask, copper: opts.copper, zones: opts.zones, silkscreen: opts.silkscreen,
      maskColor: opts.maskColor, silkColor: opts.silkColor,
    };
    const helpersObj = { makeCanvas, strokeText: strokeTextFn };
    for (const side of ["top", "bottom"]) {
      for (const pbr of [false, true]) {
        const slot = pbr ? `${side}Pbr` : side;
        let tex = faceTex[slot];
        if (!tex || tex.image.width !== layout.width || tex.image.height !== layout.height) {
          if (tex) tex.dispose();
          tex = new THREE.CanvasTexture(makeCanvas(layout.width, layout.height));
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          if (!pbr) tex.colorSpace = THREE.SRGBColorSpace;
          faceTex[slot] = tex;
        }
        const ctx = tex.image.getContext("2d");
        paintBoardSide(ctx, project, side, layout, { ...paintOpts, mode: pbr ? "pbr" : "color" }, helpersObj);
        tex.needsUpdate = true;
      }
    }
    if (boardMats.length) {
      boardMats[0].map = faceTex.top;
      boardMats[0].roughnessMap = boardMats[0].metalnessMap = faceTex.topPbr;
      boardMats[1].map = faceTex.bottom;
      boardMats[1].roughnessMap = boardMats[1].metalnessMap = faceTex.bottomPbr;
      for (const m of boardMats) m.needsUpdate = true;
    }
    dirty = true;
  }

  function applyBoardMaterialMode() {
    const t = !!opts.transparentBoard;
    for (const m of boardMats) {
      m.transparent = t;
      m.opacity = t ? 0.35 : 1;
      m.depthWrite = !t;
      m.needsUpdate = true;
    }
    if (boardMesh) {
      boardMesh.visible = opts.boardBody !== false;
      boardMesh.castShadow = !t;
    }
    if (barrelMesh) barrelMesh.visible = opts.boardBody !== false && opts.copper !== false;
    dirty = true;
  }

  // ---------------------------------------------------------------- board
  function clearBoard() {
    if (boardMesh) { content.remove(boardMesh); boardMesh.geometry.dispose(); boardMesh = null; }
    if (barrelMesh) { content.remove(barrelMesh); barrelMesh.geometry.dispose(); barrelMesh.material.dispose(); barrelMesh = null; }
    for (const m of boardMats) m.dispose();
    boardMats.length = 0;
  }

  function buildBoard() {
    clearBoard();
    const pcb = project.pcb;
    const data = boardShapeData(project);
    layout = textureLayout(pcb, { maxSize: Math.min(4096, renderer.capabilities.maxTextureSize || 4096) });
    let geo;
    try {
      geo = buildBoardGeometry(THREE, data, thickness, layout);
    } catch (err) {
      console.warn("view3d: board triangulation failed, retrying without holes", err);
      geo = buildBoardGeometry(THREE, { outline: data.outline, holes: [] }, thickness, layout);
    }
    const face = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 1, side: THREE.FrontSide });
    boardMats.push(face(), face(), new THREE.MeshStandardMaterial({ color: 0xbfae7c, roughness: 0.85, metalness: 0 }));
    boardMesh = new THREE.Mesh(geo, boardMats);
    boardMesh.name = "board";
    boardMesh.receiveShadow = true;
    boardMesh.castShadow = true;
    content.add(boardMesh);
    const bg = buildBarrelGeometry(THREE, data.holes, thickness);
    if (bg) {
      const col = new THREE.Color(finishColor(pcb.finish));
      barrelMesh = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }));
      barrelMesh.name = "barrels";
      content.add(barrelMesh);
    }
    paintFaces();
    applyBoardMaterialMode();
  }

  // ---------------------------------------------------------------- components
  function modelFor(fp, def) {
    let m = def.model3d || { kind: "unknown" };
    if (m.kind === "axial" && m.body === "resistor") {
      const bands = resistorBandNames(fp.value);
      if (bands) m = { ...m, bands };
    }
    const pads = def.pads.filter((p) => p.drill && !p.npth).map((p) => [p.x, p.y]);
    const drill = (def.pads.find((p) => p.drill) || {}).drill;
    const keyStr = `${JSON.stringify(m)}|${thickness}|${JSON.stringify(pads)}|${drill}|${m.kind ? "" : JSON.stringify(def.courtyard)}`;
    let t = templates.get(keyStr);
    if (!t) {
      t = buildModel(m, THREE, { boardThickness: thickness, courtyard: def.courtyard, pads, drill });
      templates.set(keyStr, t);
    }
    return t;
  }

  function buildComponents() {
    content.remove(componentsGroup);
    componentsGroup = new THREE.Group();
    componentsGroup.name = "components";
    content.add(componentsGroup);
    instances.clear();
    let count = 0;
    for (const fp of project.pcb.footprints) {
      const def = getFootprint(fp.footprint);
      if (!def) continue;
      const inst = modelFor(fp, def).clone();
      const holder = new THREE.Group();
      const back = fp.side === "B";
      holder.position.set(fp.x, back ? 0 : thickness, fp.y);
      holder.rotation.y = (fp.rot || 0) * DEG; // CCW on screen == +Y rotation seen from above
      if (back) inst.rotation.z = Math.PI; // mirror x + hang below: (x, h, y) -> (-x, -h, y)
      holder.add(inst);
      holder.name = fp.ref || fp.id;
      holder.userData = { ref: fp.ref, fpId: fp.id, side: fp.side };
      inst.traverse((o) => { if (o.isMesh) o.userData.baseMaterial = o.material; });
      componentsGroup.add(holder);
      if (fp.ref) instances.set(fp.ref, holder);
      count++;
    }
    componentsGroup.visible = opts.components !== false;
    componentsGroup.userData.count = count;
    applyHighlight();
  }

  function highlightMaterial(base) {
    let m = hlMats.get(base);
    if (!m) {
      m = base.clone();
      m.emissive = new THREE.Color(0x2a7fff);
      m.emissiveIntensity = 0.65;
      hlMats.set(base, m);
    }
    return m;
  }

  function applyHighlight() {
    for (const [ref, holder] of instances) {
      const on = highlighted.has(ref);
      holder.traverse((o) => {
        if (!o.isMesh || !o.userData.baseMaterial) return;
        o.material = on ? highlightMaterial(o.userData.baseMaterial) : o.userData.baseMaterial;
      });
    }
    dirty = true;
  }

  // ---------------------------------------------------------------- helpers / lights
  function sceneBox(includeParts = true) {
    const box = new THREE.Box3();
    if (boardMesh) box.expandByObject(boardMesh);
    if (includeParts && componentsGroup.visible) box.expandByObject(componentsGroup);
    if (box.isEmpty()) box.set(new THREE.Vector3(-10, -1, -10), new THREE.Vector3(10, 1, 10));
    return box;
  }

  // Text that always faces the camera (axis names, grid scale).
  function labelSprite(text, color, height, depthTest = false) {
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
    g.strokeStyle = "rgba(0,0,0,0.65)";
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = color;
    g.fillText(text, c.width / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest, depthWrite: false, transparent: true, toneMapped: false }));
    sp.scale.set((height * c.width) / c.height, height, 1);
    sp.renderOrder = depthTest ? 0 : 10;
    return sp;
  }
  function disposeGroup(gr) {
    gr.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }
  // Display unit for 3D measurements: centimetres or inches (settings).
  const unit3d = () => (opts.units3d === "inch" ? { mm: 25.4, name: "in" } : { mm: 10, name: "cm" });
  function fmtLen(mm, withUnit = false) {
    const u = unit3d();
    const v = mm / u.mm;
    const dec = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : u.name === "in" ? 3 : 2;
    const txt = String(+v.toFixed(dec));
    return withUnit ? `${txt} ${u.name}` : txt;
  }
  // A tick spacing (in mm) that gives at most ~10 ticks over a length.
  function niceStep(lenMM) {
    const u = unit3d().mm;
    const L = Math.max(1e-6, lenMM / u);
    for (const st of [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]) if (L / st <= 10) return st * u;
    return 200 * u;
  }
  function lineSegs(pts, color, opacity = 1) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });
    return new THREE.LineSegments(g, m);
  }

  // Grid cell: a fifth of the unit (2 mm / 0.2 in) times a power of 5, picked
  // from the camera distance, so the 5×5 pattern looks the same at any zoom.
  // Hysteresis: zooming out keeps the current grid until its lines are three
  // times denser than at the old switch point (target ≥ 15 cells instead of
  // 5), zooming in still switches as soon as a cell is wider than the target,
  // so a cell holds over a 15× range of distance and never flickers.
  const GRID_GROW = 15;
  let gridCell = 0;
  let gridCellUnit = "";
  function wantedCell() {
    const dist = camera.position.distanceTo(controls.target) || 100;
    const base = unit3d().mm / 5;
    const target = dist / 40;
    let cell = gridCell && gridCellUnit === unit3d().name ? gridCell : base;
    let guard = 0;
    while (cell * GRID_GROW <= target && guard++ < 20) cell *= 5;
    while (cell > target && cell / 5 >= base / 25 && guard++ < 40) cell /= 5;
    return cell;
  }
  function buildGrid() {
    if (grid) { helpers.remove(grid); disposeGroup(grid); grid = null; }
    if (!opts.grid) { gridCell = 0; dirty = true; return; }
    const box = sceneBox();
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const cell = wantedCell();
    gridCell = cell;
    gridCellUnit = unit3d().name;
    const major = cell * 5;
    const half = Math.max(Math.max(sz.x, sz.z) * 0.9, cell * 120); // wide enough for the zoom-out range a cell now covers
    const n = Math.min(500, Math.ceil(half / major) * 5); // cells each side, a multiple of 5
    // Lines sit on multiples of the cell measured from the board origin.
    const cx = Math.round(c.x / major) * major;
    const cz = Math.round(c.z / major) * major;
    const y = box.min.y - 0.5;
    const minor = [];
    const majorPts = [];
    for (let i = -n; i <= n; i++) {
      const arr = i % 5 === 0 ? majorPts : minor;
      const x = cx + i * cell;
      const z = cz + i * cell;
      arr.push(x, y, cz - n * cell, x, y, cz + n * cell, cx - n * cell, y, z, cx + n * cell, y, z);
    }
    grid = new THREE.Group();
    grid.name = "grid";
    grid.userData = { cell, major, unit: unit3d().name };
    // 5 × 5 blocks: very faint inner lines and soft single major lines, so
    // the pattern reads without the grid drawing the eye away from the board.
    const bgCol = new THREE.Color(typeof opts.background === "object" && opts.background ? opts.background.bottom : opts.background === "gradient" || !opts.background ? "#14171c" : opts.background);
    const lightBg = bgCol.r * 0.3 + bgCol.g * 0.59 + bgCol.b * 0.11 > 0.55;
    grid.add(lineSegs(minor, lightBg ? 0x8a93a6 : 0x56607a, lightBg ? 0.16 : 0.13), lineSegs(majorPts, lightBg ? 0x5a6578 : 0x8d99b0, lightBg ? 0.38 : 0.36));
    // Values (in the display unit) along two edges at the major lines.
    const h0 = major * 0.32;
    const count = (2 * n) / 5 + 1;
    const every = Math.max(1, Math.ceil(count / 12));
    for (let k = -n / 5, j = 0; k <= n / 5; k++, j++) {
      if (j % every) continue;
      const v = k * major;
      const lx = labelSprite(fmtLen(cx + v), "#ff8a80", h0);
      lx.position.set(cx + v, y, cz + n * cell + h0 * 1.2);
      const lz = labelSprite(fmtLen(cz + v), "#82b1ff", h0);
      lz.position.set(cx - n * cell - h0 * 1.8, y, cz + v);
      grid.add(lx, lz);
    }
    const note = labelSprite(`□ ${fmtLen(cell, true)}   ▦ ${fmtLen(major, true)}`, "#e0e6f0", h0);
    note.position.set(cx + n * cell - h0 * 5, y, cz - n * cell - h0 * 1.4);
    grid.add(note);
    helpers.add(grid);
    dirty = true;
  }
  let gridPending = false;
  function maybeRegrid() {
    if (!opts.grid || gridPending) return;
    const want = wantedCell();
    if (gridCell && Math.abs(Math.log(want / gridCell)) < 0.1) return;
    gridPending = true;
    requestAnimationFrame(() => { gridPending = false; if (!disposed) buildGrid(); });
  }

  // Axes with scales: X (board x), Y (board y, toward the viewer), Z (up),
  // ticks and values in cm or inch. Lines and labels are depth-tested, so a
  // part or the board in front of an axis always hides it.
  function buildAxes(box) {
    const g = new THREE.Group();
    g.name = "axes";
    g.userData.helper = "axes";
    // Lifted a little above the board top so the lines don't z-fight with it.
    const top = thickness + 0.08;
    const k = Math.max(0.2, pct(opts.axesScale));
    const lenX = Math.max(10, box.max.x) * 1.08 * k;
    const lenY = Math.max(10, box.max.z) * 1.08 * k;
    const lenZ = (Math.max(5, box.max.y - top) * 1.3 + 2) * k;
    const tick = Math.max(0.6, Math.max(lenX, lenY) / 70);
    const h0 = tick * 2.2 * Math.max(0.3, pct(opts.axesLabelSize));
    const lines = [];
    const axis = (dir, len, color, css, name) => {
      const pts = [0, 0, 0, dir[0] * len, dir[1] * len, dir[2] * len];
      const step = niceStep(len);
      // tick direction: perpendicular, in the board plane for X/Y, along x for Z
      const td = dir[1] ? [1, 0, 0] : dir[0] ? [0, 0, 1] : [1, 0, 0];
      for (let d = step; d <= len + 1e-6; d += step) {
        const p = [dir[0] * d, dir[1] * d, dir[2] * d];
        pts.push(p[0], p[1], p[2], p[0] + td[0] * tick, p[1] + td[1] * tick, p[2] + td[2] * tick);
        if (opts.axesValues === false) continue;
        const lbl = labelSprite(fmtLen(d), css, h0 * 0.8, true);
        lbl.position.set(p[0] + td[0] * tick * 2.6, p[1] + td[1] * tick * 2.6 + (dir[1] ? 0 : h0 * 0.3), p[2] + td[2] * tick * 2.6);
        g.add(lbl);
      }
      const line = lineSegs(pts, color);
      line.userData.baseColor = color;
      lines.push(line);
      g.add(line);
      const end = labelSprite(`${name} (${unit3d().name})`, css, h0, true);
      end.position.set(dir[0] * (len + h0 * 1.6), dir[1] * (len + h0 * 0.9), dir[2] * (len + h0 * 1.6));
      g.add(end);
    };
    axis([1, 0, 0], lenX, 0xff5252, "#ff5252", "X");
    axis([0, 0, 1], lenY, 0x448aff, "#448aff", "Y");
    axis([0, 1, 0], lenZ, 0x69f0ae, "#69f0ae", "Z");
    const o = labelSprite("0", "#ffffff", h0 * 0.8, true);
    o.position.set(-h0 * 0.8, 0, -h0 * 0.8);
    g.add(o);
    g.position.y = top;
    g.userData.lines = lines;
    g.userData.size = Math.max(lenX, lenY, lenZ);
    return g;
  }

  // The key light shown as a sun with rays. It is there only while the light
  // is on; a faint dashed line joins it to the axes origin. Drag it with the
  // mouse, or set opts.lightPos = {x, y, z} (mm, board axes: X right, Y toward
  // the viewer, Z up). Without lightPos it sits in the azimuth / elevation
  // direction, a little beyond the board.
  let sun = null;
  let sunBox = null;
  function sunTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const glow = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    glow.addColorStop(0, "rgba(255,240,180,0.85)");
    glow.addColorStop(0.45, "rgba(255,200,80,0.25)");
    glow.addColorStop(1, "rgba(255,190,60,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    // rays: long and short spikes alternating
    g.fillStyle = "rgba(255,206,70,0.95)";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const len = i % 2 ? 84 : 118;
      const w = i % 2 ? 0.09 : 0.12;
      g.beginPath();
      g.moveTo(128 + Math.cos(a - w) * 46, 128 + Math.sin(a - w) * 46);
      g.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len);
      g.lineTo(128 + Math.cos(a + w) * 46, 128 + Math.sin(a + w) * 46);
      g.closePath(); g.fill();
    }
    const disc = g.createRadialGradient(118, 118, 4, 128, 128, 44);
    disc.addColorStop(0, "#fffbe6");
    disc.addColorStop(0.6, "#ffd54a");
    disc.addColorStop(1, "#f5a623");
    g.fillStyle = disc;
    g.beginPath(); g.arc(128, 128, 42, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(150,90,0,0.9)"; g.lineWidth = 4;
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  // Board axes (mm) <-> scene: X = x, Y = z, Z = up (y).
  const toScene = (p) => new THREE.Vector3(p.x, p.z, p.y);
  const toBoard = (v) => ({ x: +v.x.toFixed(2), y: +v.z.toFixed(2), z: +v.y.toFixed(2) });
  const axesOrigin = () => new THREE.Vector3(0, thickness + 0.08, 0);
  function defaultSunPos(box) {
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.5 + 4;
    return box.getCenter(new THREE.Vector3()).addScaledVector(lightDir(), r * 1.15);
  }
  function sunScenePos() {
    const p = opts.lightPos;
    if (p && [p.x, p.y, p.z].every((v) => Number.isFinite(+v))) return toScene({ x: +p.x, y: +p.y, z: +p.z });
    return defaultSunPos(sunBox || sceneBox());
  }
  function buildSun(box) {
    sunBox = box;
    const grp = new THREE.Group();
    grp.name = "light";
    grp.userData.helper = "light";
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), depthTest: true, depthWrite: false, transparent: true, toneMapped: false }));
    const size = box.getSize(new THREE.Vector3());
    const s = Math.max(4, (Math.max(size.x, size.z) * 0.5 + 4) * 0.2);
    sp.scale.set(s, s, 1);
    sp.userData.helper = "light";
    sp.userData.size = s;
    grp.add(sp);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const dash = Math.max(0.6, s * 0.12);
    const line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffe7a3, transparent: true, opacity: 0.45, dashSize: dash, gapSize: dash * 0.8, depthWrite: false, toneMapped: false }));
    line.userData.noPick = true;
    grp.add(line);
    grp.userData.sprite = sp;
    grp.userData.line = line;
    return grp;
  }
  // Put the sun (and the key light's direction) at a scene position.
  function placeSun(pos) {
    if (sun) {
      const { sprite, line } = sun.userData;
      sprite.position.copy(pos);
      line.geometry.setFromPoints([pos, axesOrigin()]);
      line.computeLineDistances();
    }
    const c = (sunBox || sceneBox()).getCenter(new THREE.Vector3());
    const dir = pos.clone().sub(c);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    key.position.copy(c).addScaledVector(dir, keyDistance);
    key.target.position.copy(c);
    dirty = true;
  }
  let keyDistance = 100;
  function lightPosition() { return toBoard(sunScenePos()); }

  // Selected helper ("light" | "axes" | null): drawn brighter / larger.
  let selectedHelper = null;
  function applyHelperSelection() {
    if (sun) { const sp = sun.userData.sprite; const s = sp.userData.size * (selectedHelper === "light" ? 1.35 : 1); sp.scale.set(s, s, 1); }
    if (axes) {
      for (const l of axes.userData.lines) {
        const col = new THREE.Color(l.userData.baseColor);
        if (selectedHelper === "axes") col.lerp(new THREE.Color(0xffffff), 0.45);
        l.material.color.copy(col);
      }
    }
    dirty = true;
  }
  function selectHelper(kind) {
    selectedHelper = kind === "light" || kind === "axes" ? kind : null;
    applyHelperSelection();
  }
  function buildDimensions() {
    const g = new THREE.Group();
    g.name = "dimensions";
    if (!boardMesh) return g;
    const bb = new THREE.Box3().setFromObject(boardMesh);
    const full = sceneBox();
    const w = bb.max.x - bb.min.x, dp = bb.max.z - bb.min.z, ht = full.max.y - full.min.y;
    const off = Math.max(2, Math.max(w, dp) * 0.06);
    const h0 = Math.max(1.2, Math.max(w, dp) / 40);
    const y = bb.min.y;
    const pts = [];
    const dim = (a, b2, n, label) => {
      const A = a.clone().addScaledVector(n, off), B = b2.clone().addScaledVector(n, off);
      pts.push(a.x, a.y, a.z, A.x + n.x * off * 0.3, A.y, A.z + n.z * off * 0.3, b2.x, b2.y, b2.z, B.x + n.x * off * 0.3, B.y, B.z + n.z * off * 0.3, A.x, A.y, A.z, B.x, B.y, B.z);
      const sp = labelSprite(label, "#ffd166", h0);
      sp.position.copy(A).add(B).multiplyScalar(0.5).addScaledVector(n, h0 * 0.9);
      g.add(sp);
    };
    dim(new THREE.Vector3(bb.min.x, y, bb.max.z), new THREE.Vector3(bb.max.x, y, bb.max.z), new THREE.Vector3(0, 0, 1), `W ${fmtLen(w, true)}`);
    dim(new THREE.Vector3(bb.max.x, y, bb.min.z), new THREE.Vector3(bb.max.x, y, bb.max.z), new THREE.Vector3(1, 0, 0), `D ${fmtLen(dp, true)}`);
    // Height: a vertical line at the back-right corner.
    const cx = bb.max.x + off, cz = bb.min.z - off;
    pts.push(cx, full.min.y, cz, cx, full.max.y, cz);
    const hs = labelSprite(`H ${fmtLen(ht, true)}`, "#ffd166", h0);
    hs.position.set(cx + h0 * 2, (full.min.y + full.max.y) / 2, cz);
    g.add(hs);
    const l = lineSegs(pts, 0xffd166);
    l.material.depthTest = false;
    l.renderOrder = 9;
    g.add(l);
    g.userData = { w, d: dp, h: ht };
    return g;
  }
  let dims = null;

  function updateHelpers() {
    if (axes) { helpers.remove(axes); disposeGroup(axes); axes = null; }
    if (dims) { helpers.remove(dims); disposeGroup(dims); dims = null; }
    const box = sceneBox();
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    buildGrid();
    if (opts.axes) { axes = buildAxes(box); helpers.add(axes); }
    if (opts.dimensions !== false) { dims = buildDimensions(); helpers.add(dims); }
    if (sun) { helpers.remove(sun); disposeGroup(sun); sun = null; }
    sunBox = box;
    if (opts.lightMarker !== false && opts.lights !== false) { sun = buildSun(box); helpers.add(sun); }
    applyHelperSelection();
    // Shadow camera hugs the board so the shadow map resolution isn't wasted.
    const r = Math.max(sz.x, sz.y, sz.z) * 0.8 + 5;
    keyDistance = r * 1.9;
    placeSun(sunScenePos());
    fill.position.set(c.x - r, c.y + r * 0.5, c.z - r * 0.8);
    fill.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 0.5; sc.far = r * 5;
    sc.updateProjectionMatrix();
    applyLights();
  }

  function applyBackground() {
    if (bgTexture) { bgTexture.dispose(); bgTexture = null; }
    const bg = opts.background;
    if (bg && typeof bg === "object" && bg.top && bg.bottom) {
      bgTexture = backgroundTexture(bg.top, bg.bottom);
      scene.background = bgTexture;
    } else if (!bg || bg === "gradient") {
      bgTexture = backgroundTexture("#3e4756", "#14171c");
      scene.background = bgTexture;
    } else {
      scene.background = new THREE.Color(bg);
    }
    dirty = true;
  }

  // ---------------------------------------------------------------- camera
  function framing(dirVec) {
    const box = sceneBox();
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    const vfov = camera.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.92;
    const dir = dirVec.clone().normalize();
    return { target: center, dir, dist, radius };
  }

  function animateTo(f, duration = 450) {
    const fromDir = camera.position.clone().sub(controls.target);
    const fromDist = fromDir.length() || f.dist;
    fromDir.normalize();
    camera.near = Math.max(0.05, f.radius / 200);
    camera.far = f.radius * 40 + f.dist;
    camera.updateProjectionMatrix();
    controls.maxDistance = f.radius * 20;
    anim = { t0: performance.now(), duration, fromDir, toDir: f.dir, fromDist, toDist: f.dist, fromTarget: controls.target.clone(), toTarget: f.target.clone() };
    dirty = true;
  }

  function stepAnim(now) {
    const a = anim;
    let t = Math.min(1, (now - a.t0) / a.duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in-out cubic
    const dir = slerpDir(a.fromDir, a.toDir, e, new THREE.Vector3());
    const dist = a.fromDist + (a.toDist - a.fromDist) * e;
    controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    camera.lookAt(controls.target);
    if (t >= 1) anim = null;
  }

  function setView(name = "iso") {
    const d = VIEW_DIRS[name] || VIEW_DIRS.iso;
    lastView = VIEW_DIRS[name] ? name : "iso";
    animateTo(framing(new THREE.Vector3(...d)));
  }

  function zoomToFit() {
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(...VIEW_DIRS.iso);
    animateTo(framing(dir));
  }

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function raycastAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = [];
    if (boardMesh && boardMesh.visible && !opts.transparentBoard) targets.push(boardMesh);
    if (componentsGroup.visible) targets.push(componentsGroup);
    if (sun) targets.push(sun.userData.sprite);
    if (axes) targets.push(axes);
    // Lines are thin: accept clicks within a small world distance of an axis.
    raycaster.params.Line = { threshold: axes ? Math.max(0.4, axes.userData.size / 90) : 1 };
    return raycaster.intersectObjects(targets, true)[0] || null;
  }
  function refOf(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData && o.userData.ref !== undefined && o.userData.fpId) return o.userData.ref;
    return null;
  }
  function helperOf(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData && o.userData.helper) return o.userData.helper;
    return null;
  }
  let down = null;
  function onPointerDown(e) { down = { x: e.clientX, y: e.clientY, button: e.button }; }

  // Dragging the sun moves the light in the plane facing the camera through
  // its current position. Runs in the capture phase so the orbit controls
  // never see the press.
  const lightMoveCallbacks = new Set();
  let sunDrag = null;
  function hitSun(clientX, clientY) {
    if (!sun) return false;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(sun.userData.sprite, false).length > 0;
  }
  function onSunDown(e) {
    if (e.button !== 0 || !hitSun(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    controls.enabled = false;
    const normal = camera.getWorldDirection(new THREE.Vector3());
    sunDrag = { x: e.clientX, y: e.clientY, moved: false, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, sun.userData.sprite.position.clone()), id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    canvas.style.cursor = "grabbing";
    selectHelper("light");
  }
  function onSunMove(e) {
    if (!sunDrag) {
      if (sun && e.buttons === 0) canvas.style.cursor = hitSun(e.clientX, e.clientY) ? "grab" : opts.navMode === "pan" ? "grab" : "";
      return;
    }
    if (Math.hypot(e.clientX - sunDrag.x, e.clientY - sunDrag.y) > 2) sunDrag.moved = true;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const p = raycaster.ray.intersectPlane(sunDrag.plane, new THREE.Vector3());
    if (!p) return;
    p.y = Math.max(p.y, thickness + 1); // stay above the board
    opts.lightPos = toBoard(p);
    placeSun(toScene(opts.lightPos));
    for (const cb of lightMoveCallbacks) { try { cb(opts.lightPos, false); } catch (err) { console.error(err); } }
  }
  function onSunUp(e) {
    if (!sunDrag) return;
    const moved = sunDrag.moved;
    try { canvas.releasePointerCapture(sunDrag.id); } catch { /* synthetic */ }
    sunDrag = null;
    controls.enabled = true;
    canvas.style.cursor = "grab";
    down = null;
    e.stopImmediatePropagation();
    if (moved) for (const cb of lightMoveCallbacks) { try { cb(opts.lightPos, true); } catch (err) { console.error(err); } }
    for (const cb of pickCallbacks) { try { cb(null, "light"); } catch (err) { console.error(err); } }
  }
  canvas.addEventListener("pointerdown", onSunDown, true);
  canvas.addEventListener("pointermove", onSunMove, true);
  canvas.addEventListener("pointerup", onSunUp, true);
  function onLightMove(cb) {
    lightMoveCallbacks.add(cb);
    return () => lightMoveCallbacks.delete(cb);
  }
  function onPointerUp(e) {
    if (!down || down.button !== 0) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 4 || !pickCallbacks.size) return;
    const hit = raycastAt(e.clientX, e.clientY);
    const helper = hit ? helperOf(hit.object) : null;
    const ref = hit && !helper ? refOf(hit.object) : null;
    selectHelper(helper);
    for (const cb of pickCallbacks) { try { cb(ref, helper); } catch (err) { console.error(err); } }
  }
  function onDblClick(e) {
    const hit = raycastAt(e.clientX, e.clientY);
    if (!hit || helperOf(hit.object)) return;
    const dir = camera.position.clone().sub(controls.target);
    const dist = dir.length();
    const f = framing(dir);
    f.target = hit.point.clone();
    f.dist = Math.max(dist * 0.6, f.radius * 0.15);
    animateTo(f, 350);
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------------------------------------------------------------- loop / size
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);
  controls.addEventListener("change", () => { dirty = true; maybeRegrid(); });

  // Orientation gizmo in the bottom-left corner: shows which way X/Y/Z point.
  const gizmoScene = new THREE.Scene();
  const gizmoCam = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 10);
  const gizmoAxes = new THREE.AxesHelper(1);
  gizmoAxes.material.depthTest = false;
  gizmoAxes.material.toneMapped = false;
  gizmoScene.add(gizmoAxes);
  for (const [txt, col, p] of [["X", "#ff5252", [1.35, 0, 0]], ["Y", "#448aff", [0, 0, 1.35]], ["Z", "#69f0ae", [0, 1.35, 0]]]) {
    const sp = labelSprite(txt, col, 0.55);
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
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setViewport(8, 8, size, size);
    renderer.setScissor(8, 8, size, size);
    renderer.clearDepth();
    renderer.render(gizmoScene, gizmoCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.autoClear = true;
  }

  // Left-drag rotates (default) or pans; the right button does the other.
  function setNavMode(mode) {
    opts.navMode = mode === "pan" ? "pan" : "rotate";
    controls.mouseButtons = opts.navMode === "pan"
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    canvas.style.cursor = opts.navMode === "pan" ? "grab" : "";
  }
  // Orbit about the target by angles in degrees (keyboard / buttons).
  function orbit(dAz, dEl) {
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta -= (dAz * Math.PI) / 180;
    sph.phi = Math.min(Math.PI - 0.01, Math.max(0.01, sph.phi - (dEl * Math.PI) / 180));
    off.setFromSpherical(sph);
    camera.position.copy(controls.target).add(off);
    camera.lookAt(controls.target);
    dirty = true;
  }
  // Pan by a fraction of the view (dx, dy in -1…1 screen units).
  function pan(dx, dy) {
    const dist = camera.position.distanceTo(controls.target);
    const span = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const move = right.multiplyScalar(-dx * span * camera.aspect).add(up.multiplyScalar(dy * span));
    camera.position.add(move);
    controls.target.add(move);
    dirty = true;
  }

  renderer.setAnimationLoop((now) => {
    if (disposed) return;
    if (anim) stepAnim(now);
    const changed = controls.update();
    if (changed || dirty || anim) {
      renderer.render(scene, camera);
      renderGizmo();
      dirty = false;
    }
  });

  // ---------------------------------------------------------------- API
  function setProject(p) {
    project = p;
    if (!p || !p.pcb) { clearBoard(); content.remove(componentsGroup); componentsGroup = new THREE.Group(); content.add(componentsGroup); instances.clear(); dirty = true; return; }
    const newT = Number(p.pcb.thickness) || 1.6;
    if (newT !== thickness) { for (const t of templates.values()) disposeTemplate(t); templates.clear(); }
    thickness = newT;
    const first = !boardMesh;
    buildBoard();
    buildComponents();
    updateHelpers();
    if (first) {
      const f = framing(new THREE.Vector3(...VIEW_DIRS[lastView]));
      controls.target.copy(f.target);
      camera.position.copy(f.target).addScaledVector(f.dir, f.dist);
      camera.near = Math.max(0.05, f.radius / 200);
      camera.far = f.radius * 40 + f.dist;
      camera.updateProjectionMatrix();
      controls.update();
    }
    // Once the stroke font arrives, repaint the faces with it.
    if (!strokeTextFn && !fontRepaintPending) {
      fontRepaintPending = true;
      strokeFontReady.then(() => { fontRepaintPending = false; if (strokeTextFn && !disposed) paintFaces(); });
    }
    dirty = true;
  }

  function setOptions(o = {}) {
    const prev = { ...opts };
    Object.assign(opts, o);
    const changed = (k) => k in o && o[k] !== prev[k];
    if (["silkscreen", "soldermask", "copper", "zones", "maskColor", "silkColor"].some(changed)) paintFaces();
    if (changed("components")) componentsGroup.visible = opts.components !== false;
    if (["transparentBoard", "boardBody", "copper"].some(changed)) applyBoardMaterialMode();
    if (["axes", "grid", "components", "shadows", "units3d", "dimensions", "axesScale", "axesValues", "axesLabelSize", "lightAzimuth", "lightElevation", "lights", "lightMarker"].some(changed)) updateHelpers();
    else if (["lightIntensity", "lightColor", "ambient", "headlight"].some(changed)) applyLights();
    if (changed("lightPos") && !sunDrag) placeSun(sunScenePos());
    if (changed("navMode")) setNavMode(opts.navMode);
    if (changed("fov") && opts.fov > 5) { camera.fov = opts.fov; camera.updateProjectionMatrix(); }
    if (changed("rotateSpeed")) controls.rotateSpeed = opts.rotateSpeed || 1;
    if (changed("background")) { applyBackground(); buildGrid(); }
    dirty = true;
  }

  function highlight(refs = []) {
    highlighted = new Set((refs || []).filter(Boolean));
    applyHighlight();
  }

  function onPick(cb) {
    pickCallbacks.add(cb);
    return () => pickCallbacks.delete(cb);
  }

  // The sun marker is a control, not part of the picture.
  function screenshot() {
    const was = sun ? sun.visible : false;
    if (sun) sun.visible = false;
    renderer.render(scene, camera);
    const url = canvas.toDataURL("image/png");
    if (sun) sun.visible = was;
    dirty = true;
    return url;
  }

  // Export what is visible (hidden layers are left out of the file).
  function visibleClone() {
    const root = new THREE.Group();
    root.name = "board3d";
    content.updateMatrixWorld(true);
    content.traverseVisible((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Mesh(o.geometry, o.material);
      m.name = o.name || (o.parent && o.parent.name) || "";
      o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      root.add(m);
    });
    return root;
  }

  // ASCII string by default; {binary: true} gives a DataView over an ArrayBuffer.
  function exportSTL({ binary = false } = {}) {
    return new STLExporter().parse(visibleClone(), { binary });
  }

  function exportGLB() {
    content.updateMatrixWorld(true);
    return new GLTFExporter().parseAsync(content, { binary: true, onlyVisible: true });
  }

  function stats() {
    let meshes = 0;
    let triangles = 0;
    content.traverseVisible((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    return { meshes, triangles: Math.round(triangles), components: componentsGroup.userData.count || 0 };
  }

  function disposeTemplate(t) {
    t.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }

  function dispose() {
    disposed = true;
    renderer.setAnimationLoop(null);
    if (ro) ro.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerdown", onSunDown, true);
    canvas.removeEventListener("pointermove", onSunMove, true);
    canvas.removeEventListener("pointerup", onSunUp, true);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("dblclick", onDblClick);
    controls.dispose();
    clearBoard();
    for (const t of Object.values(faceTex)) if (t) t.dispose();
    for (const t of templates.values()) disposeTemplate(t);
    templates.clear();
    for (const m of hlMats.values()) m.dispose();
    hlMats.clear();
    disposeModelMaterials(THREE);
    if (grid) disposeGroup(grid);
    if (axes) disposeGroup(axes);
    if (dims) disposeGroup(dims);
    if (sun) disposeGroup(sun);
    if (bgTexture) bgTexture.dispose();
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  applyBackground();
  resize();
  updateHelpers();
  setNavMode(opts.navMode);
  if (opts.fov > 5) { camera.fov = opts.fov; camera.updateProjectionMatrix(); }
  controls.rotateSpeed = opts.rotateSpeed || 1;

  const viewer = {
    setProject, setOptions, setView, zoomToFit, highlight, onPick, onLightMove, lightPosition, screenshot, orbit, pan, setNavMode, selectHelper,
    exportSTL, exportGLB, resize, dispose, stats,
    getOptions: () => ({ ...opts }),
    helperInfo: () => ({
      grid: grid ? { ...grid.userData } : null, dimensions: dims ? { ...dims.userData } : null, axes: !!axes, format: fmtLen,
      selected: selectedHelper, lights: { on: key.visible, key: key.intensity, ambient: hemi.intensity, head: headlight.intensity, shadows: key.castShadow },
      axesDepthTest: axes ? axes.userData.lines.every((l) => l.material.depthTest) && axes.children.every((o) => !o.isSprite || o.material.depthTest) : null,
      lightPos: lightPosition(), sunVisible: !!sun && sun.visible,
      sunLine: sun ? sun.userData.line.geometry.attributes.position.array.slice(0, 6).map((v) => +v.toFixed(2)) : null,
      sun: sun ? (() => { const v = sun.userData.sprite.position.clone().project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })() : null,
    }),
    get three() { return { THREE, scene, camera, renderer, controls, content }; },
  };
  return viewer;
}

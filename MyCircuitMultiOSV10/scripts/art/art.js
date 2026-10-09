// Renders the program artwork as real 3D scenes with three.js (the same
// component models the 3D viewer uses): the application icon (a lit, bevelled
// circuit-board tile with an IC, capacitors and an LED, floating over a soft
// shadow), the document icon, and the installer sidebar / header images.
// scripts/render-art.mjs loads this page in a hidden Electron window and
// collects the PNG data URLs from window.__art.

import * as THREE from "../../src/vendor/three/three.module.js";
import { buildModel } from "../../src/view3d/models.js";

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

// Board surface texture: solder mask with copper traces, pads and silkscreen.
function boardTexture(size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, "#1f8f4e");
  grd.addColorStop(1, "#11643a");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const u = size / 40;
  g.lineCap = "round";
  g.lineJoin = "round";
  // Copper traces under the mask: lighter green.
  g.strokeStyle = "#3fbf74";
  g.lineWidth = u * 0.9;
  const traces = [
    [[8, 14], [14, 14], [17, 17]], [[8, 26], [14, 26], [17, 23]], [[32, 12], [26, 12], [23, 15]], [[32, 28], [26, 28], [23, 25]],
    [[20, 6], [20, 12]], [[20, 34], [20, 28]], [[6, 20], [12, 20]], [[34, 20], [28, 20]],
  ];
  for (const t of traces) { g.beginPath(); t.forEach(([x, y], i) => (i ? g.lineTo(x * u, y * u) : g.moveTo(x * u, y * u))); g.stroke(); }
  // Gold pads and vias.
  g.fillStyle = "#e7c35a";
  for (const [x, y] of [[8, 14], [8, 26], [32, 12], [32, 28], [20, 6], [20, 34], [6, 20], [34, 20]]) {
    g.beginPath(); g.arc(x * u, y * u, u * 1.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#14532d"; g.beginPath(); g.arc(x * u, y * u, u * 0.6, 0, Math.PI * 2); g.fill(); g.fillStyle = "#e7c35a";
  }
  // Silkscreen frame around the IC.
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = u * 0.35;
  g.strokeRect(13 * u, 13 * u, 14 * u, 14 * u);
  return new THREE.CanvasTexture(c);
}

function scene3d({ withParts = true, tile = true } = {}) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  // Rounded tile (the icon background), bevelled for a 3D edge.
  if (tile) {
    const tileGeo = new THREE.ExtrudeGeometry(roundedRect(46, 46, 9), { depth: 3, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.6, bevelSegments: 6, curveSegments: 24 });
    tileGeo.rotateX(-Math.PI / 2);
    const tileMat = new THREE.MeshStandardMaterial({ color: 0x1b3a5c, roughness: 0.35, metalness: 0.25 });
    const tileMesh = new THREE.Mesh(tileGeo, tileMat);
    tileMesh.position.y = -4.6;
    root.add(tileMesh);
  }
  // The circuit board.
  const boardGeo = new THREE.ExtrudeGeometry(roundedRect(36, 36, 3), { depth: 1.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 3, curveSegments: 12 });
  boardGeo.rotateX(-Math.PI / 2);
  const tex = boardTexture();
  tex.colorSpace = THREE.SRGBColorSpace;
  // UVs for the top face: map x/z of the board into the texture.
  const pos = boardGeo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + 18) / 36; uv[i * 2 + 1] = 1 - (-pos.getZ(i) + 18) / 36; }
  boardGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const board = new THREE.Mesh(boardGeo, [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.1 }), new THREE.MeshStandardMaterial({ color: 0xc9b37a, roughness: 0.7 })]);
  board.position.y = -1.6;
  root.add(board);
  if (withParts) {
    const place = (model3d, x, z, rot = 0, scale = 1) => {
      const m = buildModel(model3d, THREE, { boardThickness: 1.6 });
      m.position.set(x, 0, z);
      m.rotation.y = rot;
      m.scale.setScalar(scale);
      root.add(m);
      return m;
    };
    // A big IC in the middle, a capacitor, a resistor and an LED.
    place({ kind: "qfp", W: 12, H: 1.6, n: 48, pitch: 0.9, span: 16 }, 0, 0, 0, 1);
    place({ kind: "radial", pitch: 2.5, D: 5, H: 9 }, -10.5, -10.5);
    place({ kind: "led", pitch: 2.54, D: 5, H: 8.5 }, 9.5, -11);
    place({ kind: "chip", L: 3.2, W: 1.6, H: 0.8, body: "resistor" }, -11, 10, Math.PI / 2, 1.5);
    place({ kind: "chip", L: 3.2, W: 1.6, H: 0.8, body: "capacitor" }, 11, 10, Math.PI / 2, 1.5);
  }
  // Lighting: warm key, cool fill, rim from behind for the bevel highlights.
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x203040, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-30, 60, 40);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc8ff, 0.9);
  fill.position.set(40, 25, 30);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(0, 30, -60);
  scene.add(rim);
  return { scene, root };
}

function render(width, height, { view = "icon", tile = true, parts = true, background = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const { scene, root } = scene3d({ tile, withParts: parts });
  if (background) scene.background = new THREE.Color(background);
  // The icon looks straight down on the board (a narrow lens keeps the parts'
  // sides from leaning outwards); the bevel and lighting still give it depth.
  const camera = new THREE.PerspectiveCamera(view === "icon" ? 18 : 35, width / height, 1, 2000);
  if (view === "icon") {
    camera.up.set(0, 0, -1);
    camera.position.set(0, 160, 0.001);
    root.rotation.y = 0;
  } else if (view === "side") {
    camera.position.set(-18, 70, 95);
    root.rotation.y = -0.6;
  } else {
    camera.position.set(-55, 40, 80);
    root.rotation.y = -0.2;
  }
  // Frame the model: aim at the centre of its box, then move the camera along
  // its viewing direction until every corner fits inside the margin.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  (window.__boxes = window.__boxes || []).push([view, box.min.toArray().map(Math.round), box.max.toArray().map(Math.round)]);
  const dir = camera.position.clone().sub(centre).normalize();
  // Corners of every mesh's own (rotated) box: much tighter than the
  // axis-aligned box of the turned model, whose corners are empty space.
  const corners = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld));
  });
  const margin = view === "icon" ? 0.94 : 0.8;
  let lo = 10, hi = 2000;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(centre).addScaledVector(dir, d);
    camera.lookAt(centre);
    camera.updateMatrixWorld(true);
    const fits = corners.every((c) => { const p = c.clone().project(camera); return Math.abs(p.x) <= margin && Math.abs(p.y) <= margin; });
    if (fits) hi = d; else lo = d;
  }
  camera.position.copy(centre).addScaledVector(dir, hi);
  camera.lookAt(centre);
  // Re-centre on what is actually visible (leads under the board make the
  // box bottom-heavy), then fit the distance once more.
  const target = centre.clone();
  for (let pass = 0; pass < 3; pass++) {
    camera.updateMatrixWorld(true);
    let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
    for (const c of corners) { const p = c.clone().project(camera); x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x); y1 = Math.min(y1, p.y); y2 = Math.max(y2, p.y); }
    const dist = camera.position.distanceTo(target);
    const hh = dist * Math.tan((camera.fov * Math.PI) / 360);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const shift = right.multiplyScalar(((x1 + x2) / 2) * hh * camera.aspect).add(up.multiplyScalar(((y1 + y2) / 2) * hh));
    target.add(shift);
    camera.position.add(shift);
    camera.lookAt(target);
    // Scale the distance so the larger extent fills the margin.
    const fill = Math.max((x2 - x1) / 2, (y2 - y1) / 2) / margin;
    camera.position.copy(target).addScaledVector(dir, dist * fill);
    camera.lookAt(target);
  }
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  renderer.dispose();
  return url;
}

// Downscale a big render step by step (keeps small icons crisp).
async function downscale(url, size) {
  const img = new Image();
  img.src = url;
  await img.decode();
  let cur = img;
  let w = img.width;
  while (w / 2 >= size) {
    const c = document.createElement("canvas");
    c.width = c.height = Math.round(w / 2);
    c.getContext("2d").drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
    w = c.width;
  }
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const g = out.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(cur, 0, 0, size, size);
  return out.toDataURL("image/png");
}

// Document icon: a page with a folded corner and the 3D board on it.
async function documentIcon(boardUrl, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const s = size / 512;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = 18 * s;
  g.shadowOffsetY = 8 * s;
  const grd = g.createLinearGradient(0, 0, 0, size);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(1, "#dde4ee");
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(96 * s, 24 * s); g.lineTo(336 * s, 24 * s); g.lineTo(424 * s, 112 * s); g.lineTo(424 * s, 488 * s); g.lineTo(96 * s, 488 * s); g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = "#c3cfdd";
  g.beginPath(); g.moveTo(336 * s, 24 * s); g.lineTo(336 * s, 112 * s); g.lineTo(424 * s, 112 * s); g.closePath(); g.fill();
  const img = new Image();
  img.src = boardUrl;
  await img.decode();
  g.drawImage(img, 104 * s, 150 * s, 312 * s, 312 * s);
  return c.toDataURL("image/png");
}

// Installer sidebar (shown at 164×314): brand gradient, the 3D board and the name.
async function sidebarArt(boardUrl) {
  const c = document.createElement("canvas");
  c.width = 328;
  c.height = 628;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, "#1b3a5c");
  grd.addColorStop(1, "#0b1726");
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  // Faint circuit traces in the background for depth.
  g.strokeStyle = "rgba(79,157,255,0.12)";
  g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.moveTo(-10, 60 + i * 64);
    g.lineTo(90 + (i % 3) * 40, 60 + i * 64);
    g.lineTo(140 + (i % 3) * 40, 110 + i * 64);
    g.lineTo(340, 110 + i * 64);
    g.stroke();
  }
  const img = new Image();
  img.src = boardUrl;
  await img.decode();
  g.drawImage(img, 0, 120, 328, 420);
  g.fillStyle = "#ffffff";
  g.font = "bold 46px 'Segoe UI', sans-serif";
  g.fillText("MyCircuit", 26, 76);
  g.fillStyle = "#7fb8ff";
  g.font = "600 28px 'Segoe UI', sans-serif";
  g.fillText("10.0", 26, 112);
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = "20px 'Segoe UI', 'Malgun Gothic', sans-serif";
  g.fillText("Schematic · PCB · 3D", 26, 580);
  g.fillText("Simulation · Gerber", 26, 606);
  return c.toDataURL("image/png");
}

(async () => {
  try {
    const big = render(1024, 1024, { view: "icon" });
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
    const icons = {};
    for (const n of sizes) icons[n] = n === 1024 ? big : await downscale(big, n);
    const boardOnly = render(1024, 1024, { view: "icon", tile: false });
    const doc = await documentIcon(boardOnly, 512);
    const docSizes = {};
    for (const n of [16, 24, 32, 48, 64, 128, 256]) docSizes[n] = await downscale(doc, n);
    docSizes[512] = doc;
    // Installer images: a 3D board scene on the brand gradient.
    const sidebar = await sidebarArt(render(328, 420, { view: "side", tile: false, background: null }));
    const header = render(300, 114, { view: "wide", tile: false, background: "#10243a" });
    const hero = render(1600, 900, { view: "wide", tile: false, background: null });
    window.__art = { ok: true, boxes: window.__boxes, icons, doc: docSizes, sidebar, header, hero };
  } catch (e) {
    window.__art = { ok: false, error: String(e && e.stack || e) };
  }
})();

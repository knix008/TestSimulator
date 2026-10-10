// Renders the program artwork as real 3D scenes with three.js, using the same
// building code as the 3D view: the application icon (a small gable-roofed
// house on a bevelled tile), the document icon, the start-page hero image and
// the installer sidebar / header. scripts/render-art.mjs loads this page in a
// hidden Electron window and collects the PNG data URLs from window.__art.

import * as THREE from "../../src/vendor/three/three.module.js";
import { buildBuilding, makeMaterials } from "../../src/view3d/build.js";
import { newProject, normalizeProject, newLevel } from "../../src/core/project.js";
import { makeFurniture } from "../../src/lib/furniture.js";

// A small house: two storeys, windows, a door, a gable roof and two trees.
function houseProject() {
  const p = newProject("art");
  const L = p.levels[0].id;
  const up = newLevel("2F", 2800, 2600);
  p.levels.push(up);
  let n = 0;
  const id = () => `a${n++}`;
  const loop = (level, pts, t) => pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; const w = { id: id(), level, x1: a[0], y1: a[1], x2: b[0], y2: b[1], thickness: t, height: null, material: level === L ? "brick" : "plaster" }; p.walls.push(w); return w; });
  const box = [[0, 0], [8000, 0], [8000, 6000], [0, 6000]];
  const [, e, s, w] = loop(L, box, 300);
  const [, e2, s2, w2] = loop(up.id, box, 300);
  const op = (wall, kind, at, width, height, sill, extra = {}) => p.openings.push({ id: id(), wall: wall.id, kind, type: kind === "window" ? "casement" : "single", at, width, height, sill, side: 1, hinge: "start", ...extra });
  op(s, "door", 4000, 1100, 2200, 0);
  op(s, "window", 1700, 1600, 1300, 800);
  op(s, "window", 6300, 1600, 1300, 800);
  op(s2, "window", 2000, 1400, 1200, 800);
  op(s2, "window", 6000, 1400, 1200, 800);
  op(e, "window", 3000, 1400, 1300, 800);
  op(e2, "window", 3000, 1200, 1100, 800);
  op(w, "window", 3000, 1400, 1300, 800);
  op(w2, "window", 3000, 1200, 1100, 800);
  p.rooms.push({ id: id(), level: L, name: "", pts: [[150, 150], [7850, 150], [7850, 5850], [150, 5850]], floor: "oak" });
  p.roofs.push({ id: id(), level: up.id, pts: box, kind: "gable", pitch: 38, overhang: 450, thickness: 220, material: "roof-tiles" });
  p.furniture.push({ id: id(), level: L, ...makeFurniture("tree", 9600, 1200), w: 2400, d: 2400, h: 5000 });
  p.furniture.push({ id: id(), level: L, ...makeFurniture("shrub", -900, 6400) });
  p.furniture.push({ id: id(), level: L, ...makeFurniture("shrub", 8800, 6700), w: 1200, d: 1200 });
  return normalizeProject(p);
}

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

function scene3d({ tile = true, ground = true } = {}) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const mats = makeMaterials(THREE, { textures: true });
  const house = buildBuilding(THREE, houseProject(), mats, { furniture: true, roofs: true });
  house.position.set(-4, 0, -3); // centre the 8 × 6 m house
  root.add(house);
  if (ground) {
    const lawn = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x7fae5a, roughness: 1 }));
    lawn.position.y = -0.16;
    root.add(lawn);
  }
  if (tile) {
    const geo = new THREE.ExtrudeGeometry(roundedRect(19, 19, 4), { depth: 1.2, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 6, curveSegments: 24 });
    geo.rotateX(-Math.PI / 2);
    const t = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1d4466, roughness: 0.35, metalness: 0.2 }));
    t.position.y = -1.9;
    root.add(t);
  }
  scene.add(new THREE.HemisphereLight(0xe6f1ff, 0x30405a, 1.2));
  const key = new THREE.DirectionalLight(0xfff2dd, 2.8);
  key.position.set(-20, 40, 30);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc8ff, 0.8);
  fill.position.set(30, 15, 25);
  scene.add(fill);
  return { scene, root };
}

function render(width, height, { view = "icon", tile = true, ground = true, background = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const { scene, root } = scene3d({ tile, ground });
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(view === "icon" ? 22 : 32, width / height, 0.5, 2000);
  if (view === "icon") camera.position.set(34, 30, 44);
  else if (view === "side") camera.position.set(-30, 18, 40);
  else camera.position.set(40, 16, 32);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  const dir = camera.position.clone().sub(centre).normalize();
  const corners = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld));
  });
  const margin = view === "icon" ? 0.95 : 0.82;
  let lo = 1, hi = 2000;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(centre).addScaledVector(dir, d);
    camera.lookAt(centre);
    camera.updateMatrixWorld(true);
    const fits = corners.every((c) => { const q = c.clone().project(camera); return Math.abs(q.x) <= margin && Math.abs(q.y) <= margin; });
    if (fits) hi = d; else lo = d;
  }
  camera.position.copy(centre).addScaledVector(dir, hi);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  renderer.dispose();
  return url;
}

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

// The application icon: a square tile seen straight on (rounded corners,
// transparent around it) with a blueprint grid and the 3D house on top.
async function appIcon(houseUrl, size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const m = size * 0.05, r = size * 0.18, s = size - 2 * m;
  const depth = size * 0.022; // thickness of the raised tile
  const tile = (dy = 0, inset = 0) => { g.beginPath(); g.roundRect(m + inset, m + inset + dy, s - 2 * inset, s - 2 * inset - depth, Math.max(1, r - inset)); };
  // Soft shadow on the "table" and the tile's darker side edge (it reads as a slab).
  g.save();
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = size * 0.035;
  g.shadowOffsetY = size * 0.02;
  tile(depth);
  g.fillStyle = "#0a1d31";
  g.fill();
  g.restore();
  // Top face: blue gradient lit from the top left.
  tile();
  const grd = g.createLinearGradient(m, m, m + s, m + s);
  grd.addColorStop(0, "#4a8ccc");
  grd.addColorStop(0.55, "#22568a");
  grd.addColorStop(1, "#102f50");
  g.fillStyle = grd;
  g.fill();
  g.save();
  tile();
  g.clip();
  // Blueprint grid.
  g.strokeStyle = "rgba(170,215,255,0.15)";
  g.lineWidth = size / 512;
  for (let k = 1; k < 12; k++) {
    const v = m + (s * k) / 12;
    g.beginPath(); g.moveTo(v, m); g.lineTo(v, m + s); g.moveTo(m, v); g.lineTo(m + s, v); g.stroke();
  }
  // The house, cropped to its visible pixels and placed exactly in the
  // centre of the tile's top face, as large as fits with a small margin.
  const img = new Image();
  img.src = houseUrl;
  await img.decode();
  const box = opaqueBox(img);
  const faceX = m, faceY = m, faceW = s, faceH = s - depth;
  const fit = Math.min((faceW * 0.86) / box.w, (faceH * 0.86) / box.h);
  const dw = box.w * fit, dh = box.h * fit;
  g.drawImage(img, box.x, box.y, box.w, box.h, faceX + (faceW - dw) / 2, faceY + (faceH - dh) / 2, dw, dh);
  // Light reflected in the top-left corner (glossy highlight).
  const glow = g.createRadialGradient(m + s * 0.18, m + s * 0.14, 0, m + s * 0.18, m + s * 0.14, s * 0.62);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(0.35, "rgba(255,255,255,0.16)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(m, m, s, s);
  // A sheen across the upper-left half.
  g.beginPath();
  g.moveTo(m, m);
  g.lineTo(m + s * 0.78, m);
  g.quadraticCurveTo(m + s * 0.42, m + s * 0.3, m, m + s * 0.72);
  g.closePath();
  const sheen = g.createLinearGradient(m, m, m + s * 0.5, m + s * 0.5);
  sheen.addColorStop(0, "rgba(255,255,255,0.22)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sheen;
  g.fill();
  g.restore();
  // Bevel: bright rim on the top-left edges, dark on the bottom-right.
  const rim = g.createLinearGradient(m, m, m + s, m + s);
  rim.addColorStop(0, "rgba(255,255,255,0.75)");
  rim.addColorStop(0.5, "rgba(255,255,255,0.12)");
  rim.addColorStop(1, "rgba(0,0,0,0.35)");
  g.lineWidth = size * 0.012;
  g.strokeStyle = rim;
  tile(0, size * 0.006);
  g.stroke();
  return c.toDataURL("image/png");
}

// Bounding box of the non-transparent pixels of an image.
function opaqueBox(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x1 = c.width, y1 = c.height, x2 = -1, y2 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    }
  }
  return x2 < 0 ? { x: 0, y: 0, w: c.width, h: c.height } : { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

// Document icon: a page with a folded corner, a plan grid and the house.
async function documentIcon(houseUrl, size = 512) {
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
  grd.addColorStop(1, "#dde6f0");
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(96 * s, 24 * s); g.lineTo(336 * s, 24 * s); g.lineTo(424 * s, 112 * s); g.lineTo(424 * s, 488 * s); g.lineTo(96 * s, 488 * s); g.closePath();
  g.fill();
  g.restore();
  g.strokeStyle = "rgba(40,90,140,0.18)";
  g.lineWidth = 2 * s;
  for (let x = 120; x < 420; x += 24) { g.beginPath(); g.moveTo(x * s, 130 * s); g.lineTo(x * s, 470 * s); g.stroke(); }
  for (let y = 130; y < 480; y += 24) { g.beginPath(); g.moveTo(110 * s, y * s); g.lineTo(410 * s, y * s); g.stroke(); }
  g.fillStyle = "#c3cfdd";
  g.beginPath(); g.moveTo(336 * s, 24 * s); g.lineTo(336 * s, 112 * s); g.lineTo(424 * s, 112 * s); g.closePath(); g.fill();
  const img = new Image();
  img.src = houseUrl;
  await img.decode();
  g.drawImage(img, 100 * s, 140 * s, 320 * s, 320 * s);
  return c.toDataURL("image/png");
}

async function sidebarArt(houseUrl) {
  const c = document.createElement("canvas");
  c.width = 328;
  c.height = 628;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, "#1d4466");
  grd.addColorStop(1, "#0b1726");
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  // A faint floor plan in the background.
  g.strokeStyle = "rgba(127,184,255,0.16)";
  g.lineWidth = 6;
  g.strokeRect(30, 170, 268, 300);
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(30, 330); g.lineTo(180, 330); g.lineTo(180, 470); g.moveTo(180, 170); g.lineTo(180, 260); g.stroke();
  const img = new Image();
  img.src = houseUrl;
  await img.decode();
  g.drawImage(img, 0, 140, 328, 420);
  g.fillStyle = "#ffffff";
  g.font = "bold 40px 'Segoe UI', sans-serif";
  g.fillText("MyArchitecture", 20, 72);
  g.fillStyle = "#7fb8ff";
  g.font = "600 28px 'Segoe UI', sans-serif";
  g.fillText("10.0", 22, 108);
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = "20px 'Segoe UI', 'Malgun Gothic', sans-serif";
  g.fillText("Floor plans · 3D · BIM", 22, 580);
  g.fillText("DXF · IFC · GLB · OBJ", 22, 606);
  return c.toDataURL("image/png");
}

(async () => {
  try {
    const houseOnly = render(1024, 1024, { view: "icon", tile: false });
    const big = await appIcon(houseOnly, 1024);
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
    const icons = {};
    for (const n of sizes) icons[n] = n === 1024 ? big : await downscale(big, n);
    const doc = await documentIcon(houseOnly, 512);
    const docSizes = {};
    for (const n of [16, 24, 32, 48, 64, 128, 256]) docSizes[n] = await downscale(doc, n);
    docSizes[512] = doc;
    const sidebar = await sidebarArt(render(328, 420, { view: "side", tile: false }));
    const header = render(300, 114, { view: "wide", tile: false, ground: false, background: "#10243a" });
    const hero = render(1600, 900, { view: "wide", tile: false });
    window.__art = { ok: true, icons, doc: docSizes, sidebar, header, hero };
  } catch (e) {
    window.__art = { ok: false, error: String((e && e.stack) || e) };
  }
})();

// Dev-only preview of the parametric library: each item gets its own cell (scissor viewport)
// with a 3/4 camera, image-based lighting, ACES tone mapping and soft shadows on a light floor.
// Openings are shown in a wall slab with a hole; wall items in front of a wall at their elevation.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
// Modules load one by one (?mod=dining,bedroom limits them), so one broken file does not blank the page.
const modules = import.meta.glob(['../../src/library/parametric/*.js', '!../../src/library/parametric/index.js', '!../../src/library/parametric/helpers.js']);
import { getMaterial } from '../../src/engine/materials.js';

const q = new URLSearchParams(location.search);
const wantMods = q.get('mod')?.split(',');
const PARAMETRIC_ITEMS = [];
for (const [file, load] of Object.entries(modules)) {
  const name = file.split('/').pop().replace('.js', '');
  if (wantMods && !wantMods.includes(name)) continue;
  try { PARAMETRIC_ITEMS.push(...((await load()).ITEMS ?? [])); } catch (err) { console.error(name, err); }
}
const quality = q.get('q') === 'low' ? 'low' : 'high';
let items = PARAMETRIC_ITEMS;
if (q.get('id')) items = items.filter((e) => e.id === q.get('id'));
if (q.get('ids')) { const ids = q.get('ids').split(','); items = ids.map((id) => PARAMETRIC_ITEMS.find((e) => e.id === id)).filter(Boolean); }
if (q.get('cat')) items = items.filter((e) => q.get('cat').split(',').includes(e.category));
const overrides = q.get('p') ? JSON.parse(q.get('p')) : {};
const single = items.length === 1;
const cols = single ? 1 : Number(q.get('cols') ?? 4);
const W = window.innerWidth;
const cellW = Math.floor(W / cols), cellH = single ? window.innerHeight : Math.round(cellW * 0.78);
const rows = Math.ceil(items.length / cols);
const view = q.get('view') ?? '34'; // '34' | 'front' | 'top' | 'side' | 'back'

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, rows * cellH);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('wrap').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4f2ee');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#e7e3dc', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const sun = new THREE.DirectionalLight('#fff6ea', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 6;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#ffffff', '#d8d2c8', 0.35));

const wallMat = new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.95 });
const ctx = { quality, wallThickness: 0.2, material: (id, o) => getMaterial(id, o) };
const camera = new THREE.PerspectiveCamera(32, cellW / cellH, 0.02, 200);

/** A wall slab with a hole for an opening (z = 0 is the wall's mid plane). */
function wallWithHole(w, h, sill, t) {
  const g = new THREE.Group();
  const total = 2.7, side = Math.max(0.6, w * 0.4);
  const add = (bw, bh, x, y) => { if (bw <= 0 || bh <= 0) return; const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), wallMat); m.position.set(x, y + bh / 2, 0); m.castShadow = m.receiveShadow = true; g.add(m); };
  add(side, total, -w / 2 - side / 2, 0);
  add(side, total, w / 2 + side / 2, 0);
  add(w, sill, 0, 0);
  add(w, total - sill - h, 0, sill + h);
  return g;
}

function backWall(width, height, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1), wallMat);
  m.position.set(0, height / 2, z - 0.05);
  m.receiveShadow = true;
  return m;
}

const labels = [];
const timings = [];
renderer.setScissorTest(true);
items.forEach((entry, i) => {
  const t0 = performance.now();
  const holder = new THREE.Group();
  let obj;
  try {
    obj = entry.build(overrides, ctx);
  } catch (err) {
    console.error(entry.id, err);
    obj = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 'red' }));
  }
  timings.push([entry.id, Math.round(performance.now() - t0)]);
  holder.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (entry.placement === 'opening') {
    const p = { ...Object.fromEntries(entry.params.map((p) => [p.key, p.default])), ...overrides };
    const sill = entry.category === 'windows' ? (p.sill ?? entry.defaultSill ?? 0.9) : 0;
    obj.position.y = sill;
    holder.add(wallWithHole(p.width ?? entry.size[0], p.height ?? entry.size[1], sill, ctx.wallThickness));
  } else if (entry.placement === 'wall') {
    const elev = entry.elevation ?? 1.2;
    obj.position.set(0, elev, size.z / 2);
    holder.add(backWall(Math.max(1.6, size.x + 0.8), Math.max(2.4, elev + size.y + 0.3), 0));
  } else if (entry.placement === 'ceiling') {
    obj.position.y = entry.elevation ?? Math.max(0.3, 2.5 - size.y);
  } else if (entry.placement === 'surface') {
    obj.position.y = 0;
  }
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const ob = new THREE.Box3().setFromObject(obj);
  const centre = ob.getCenter(new THREE.Vector3());
  const radius = Math.max(0.12, ob.getSize(new THREE.Vector3()).length() / 2);
  const dir = { '34': [0.85, 0.55, 1.35], front: [0, 0.12, 1], top: [0, 1, 0.001], side: [1, 0.2, 0], back: [-0.8, 0.5, -1.3] }[view] ?? [0.85, 0.55, 1.35];
  const d = new THREE.Vector3(...dir).normalize();
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92;
  camera.position.copy(centre).addScaledVector(d, dist);
  camera.near = dist / 50; camera.far = dist * 10;
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  sun.position.set(centre.x + radius * 2.2, centre.y + radius * 4, centre.z + radius * 3);
  sun.target.position.copy(centre);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -radius * 2; sc.right = sc.top = radius * 2; sc.near = 0.1; sc.far = radius * 12;
  sc.updateProjectionMatrix();
  const col = i % cols, row = Math.floor(i / cols);
  const x = col * cellW, yTop = row * cellH;
  const yGL = rows * cellH - yTop - cellH;
  renderer.setViewport(x, yGL, cellW, cellH);
  renderer.setScissor(x, yGL, cellW, cellH);
  renderer.render(scene, camera);
  scene.remove(holder);
  let tris = 0, meshes = 0;
  obj.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  labels.push(`<div class="label" style="left:${x}px;top:${yTop}px"><b>${entry.id}</b><span>${entry.ko} · ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} · ${meshes}m ${Math.round(tris / 100) / 10}k</span></div>`);
});
document.getElementById('wrap').insertAdjacentHTML('beforeend', labels.join(''));
window.__timings = timings;
window.__done = true;

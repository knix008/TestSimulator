// The sample objects (scripts/make-samples.mjs): built from three.js
// primitives so every sample is our own work and can be shipped freely.
// Runs in the browser (it is imported by the page the script drives).
import * as THREE from 'three';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

function robot() {
  const g = new THREE.Group();
  g.name = 'robot';
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.32), std('#3b82f6'));
  body.position.y = 0.62;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.02), std('#e2e8f0'));
  chest.position.set(0, 0.66, 0.17);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.3), std('#93c5fd'));
  head.position.y = 1.06;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), std('#facc15', { emissive: '#7a5a00' }));
  eyeL.position.set(-0.08, 1.08, 0.16);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10), std('#64748b'));
  antenna.position.y = 1.27;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), std('#ef4444'));
  tip.position.y = 1.35;
  const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.42, 16);
  const armL = new THREE.Mesh(armGeo, std('#64748b'));
  armL.position.set(-0.32, 0.62, 0);
  armL.rotation.z = 0.25;
  const armR = armL.clone();
  armR.position.x = 0.32;
  armR.rotation.z = -0.25;
  const legGeo = new THREE.BoxGeometry(0.14, 0.34, 0.16);
  const legL = new THREE.Mesh(legGeo, std('#1e3a8a'));
  legL.position.set(-0.12, 0.17, 0);
  const legR = legL.clone();
  legR.position.x = 0.12;
  g.add(body, chest, head, eyeL, eyeR, antenna, tip, armL, armR, legL, legR);
  return g;
}

function mug() {
  const g = new THREE.Group();
  g.name = 'mug';
  const pts = [];
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector2(0.28 + 0.02 * Math.sin(i / 12 * Math.PI), i / 12 * 0.62));
  pts.push(new THREE.Vector2(0.25, 0.62), new THREE.Vector2(0.25, 0.04), new THREE.Vector2(0.0, 0.04));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), std('#f97316', { side: THREE.DoubleSide }));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 64), std('#f97316'));
  base.position.y = 0.01;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 16, 40, Math.PI * 1.2), std('#f97316'));
  handle.position.set(0.3, 0.33, 0);
  handle.rotation.z = -Math.PI * 0.6;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.25, 48), std('#4a2a12', { roughness: 0.2 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.54;
  g.add(cup, base, handle, coffee);
  return g;
}

function pawn() {
  const pts = [
    [0, 0], [0.32, 0], [0.32, 0.06], [0.26, 0.1], [0.26, 0.14], [0.2, 0.18], [0.12, 0.4], [0.1, 0.62],
    [0.18, 0.66], [0.18, 0.7], [0.1, 0.72], [0.12, 0.76], [0.16, 0.84], [0.16, 0.92], [0.12, 1.0], [0.06, 1.03], [0, 1.04],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), std('#d6b37a', { roughness: 0.35 }));
  m.name = 'pawn';
  return m;
}

function tree() {
  const g = new THREE.Group();
  g.name = 'tree';
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 16), std('#7c4a1e'));
  trunk.position.y = 0.2;
  g.add(trunk);
  [[0.45, 0.5, 0.55], [0.36, 0.42, 0.85], [0.26, 0.34, 1.1]].forEach(([r, h, y]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 24), std('#16a34a'));
    c.position.y = y;
    g.add(c);
  });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), std('#facc15', { emissive: '#806000' }));
  star.position.y = 1.32;
  g.add(star);
  return g;
}

function toyCar() {
  const g = new THREE.Group();
  g.name = 'toy-car';
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.44), std('#dc2626', { roughness: 0.3 }));
  body.position.y = 0.22;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.4), std('#fca5a5', { roughness: 0.2 }));
  cabin.position.set(-0.05, 0.43, 0);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 24);
  for (const [x, z] of [[-0.28, 0.24], [0.28, 0.24], [-0.28, -0.24], [0.28, -0.24]]) {
    const w = new THREE.Mesh(wheelGeo, std('#111827'));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.11, z);
    g.add(w);
  }
  return g;
}

function shapes() {
  const g = new THREE.Group();
  g.name = 'shapes';
  const items = [
    [new THREE.BoxGeometry(0.3, 0.3, 0.3), '#ef4444', [-0.45, 0.15, 0]],
    [new THREE.SphereGeometry(0.17, 32, 24), '#22c55e', [0, 0.17, 0]],
    [new THREE.ConeGeometry(0.16, 0.36, 32), '#3b82f6', [0.45, 0.18, 0]],
    [new THREE.TorusKnotGeometry(0.11, 0.035, 96, 12), '#eab308', [0, 0.17, -0.45]],
    [new THREE.CylinderGeometry(0.13, 0.13, 0.3, 32), '#a855f7', [0, 0.15, 0.45]],
  ];
  for (const [geo, color, pos] of items) {
    const m = new THREE.Mesh(geo, std(color));
    m.position.set(...pos);
    g.add(m);
  }
  return g;
}

export const SCENES = { robot, mug, pawn, tree, 'toy-car': toyCar, shapes };

// A transparent picture of the object, as a photo for conversion.
export function renderPhoto(object, size = 1024) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#444444', 1.4));
  const key = new THREE.DirectionalLight('#ffffff', 2.6);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe0ff', 1.2);
  rim.position.set(-2, 1.5, -1.5);
  scene.add(rim);
  scene.add(object);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const dir = new THREE.Vector3(0.55, 0.42, 1).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05));
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  return url;
}

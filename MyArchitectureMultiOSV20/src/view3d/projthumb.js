// A 3D picture of a whole project from the iso direction — the start page's
// sample thumbnails. It needs no page: given an OffscreenCanvas it runs in a
// worker (src/view3d/thumbworker.js), so building and drawing big samples
// never freezes the app. The look follows the 3D view: a sky gradient, soft
// sky reflections, the sun with shadows on a ground plane.
import { buildBuilding, makeMaterials } from "./build.js";

const ISO = [0.85, 0.75, 1.0]; // the 3D view's iso direction (viewer.js VIEW_DIRS)

function gradientTexture(THREE, top, bottom) {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(4, 256);
  c.width = 4; c.height = 256;
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

// createProjectThumbRenderer(THREE, {canvas, width, height}) → { render(project) → Blob, dispose() }
export function createProjectThumbRenderer(THREE, { canvas = null, width = 460, height = 260, top = "#9cc0e3", bottom = "#eef2f4" } = {}) {
  const cv = canvas || (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : null);
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.debug.checkShaderErrors = false;

  const scene = new THREE.Scene();
  const bg = gradientTexture(THREE, top, bottom);
  scene.background = bg;
  // Sky reflections for glass and metal (as in thumbs.js).
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const pos = geo.attributes.position, cols = [];
  const ct = new THREE.Color(0xdde9f7), ch = new THREE.Color(0xf6f3ee), cg = new THREE.Color(0x8a867c);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const c = y > 0 ? ch.clone().lerp(ct, Math.min(1, y * 1.4)) : ch.clone().lerp(cg, Math.min(1, -y * 3)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sky, 0.02).texture;
  pmrem.dispose();
  geo.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.6;

  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x6b6656, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4e2, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 5000);
  const headlight = new THREE.DirectionalLight(0xffffff, 0.35);
  headlight.position.set(0, 0, 0);
  headlight.target.position.set(0, 0, -1);
  camera.add(headlight, headlight.target);
  scene.add(camera);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xd9ddd5, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const mats = makeMaterials(THREE, { textures: true });
  const view = new THREE.Vector3(...ISO).normalize();

  async function render(project) {
    const root = buildBuilding(THREE, project, mats, { furniture: true, roofs: true, solids: true });
    scene.add(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(1, box.getSize(new THREE.Vector3()).length() / 2);
    // Fit the bounding sphere in the narrower of the two view angles.
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 0.92;
    camera.position.copy(c).addScaledVector(view, dist);
    camera.lookAt(c);
    camera.near = Math.max(0.03, dist / 200); camera.far = dist * 6; camera.updateProjectionMatrix();
    ground.scale.set(r * 12, r * 12, 1);
    ground.position.set(c.x, box.min.y - 0.002, c.z);
    sun.position.set(c.x + r * 1.2, c.y + r * 2.2, c.z + r * 1.6);
    sun.target.position.copy(c);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -r * 1.5; sc.right = sc.top = r * 1.5; sc.near = 0.1; sc.far = r * 8; sc.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
    renderer.render(scene, camera);
    scene.remove(root);
    root.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    if (cv && cv.convertToBlob) return cv.convertToBlob({ type: "image/webp", quality: 0.85 });
    return renderer.domElement.toDataURL("image/webp", 0.85);
  }

  function dispose() {
    env.dispose();
    bg.dispose();
    mats.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch { /* already gone */ }
  }
  return { render, dispose };
}

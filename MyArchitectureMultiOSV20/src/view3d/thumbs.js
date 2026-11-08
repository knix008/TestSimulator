// Little 3D pictures of furniture: the library's thumbnails
// (scripts/render-furniture.mjs bakes the built-in ones into a sprite) and the
// pictures of items people register in their own library (src/ui/userlib.js).
// A studio: soft sky reflections, one sun with a soft shadow on an invisible
// floor, a three-quarter view from the front right.
import { buildBuilding, makeMaterials } from "./build.js";
import { newProject, normalizeProject } from "../core/project.js";
import { base64ToBytes } from "../ui/platform.js";

// A thumbnail renderer: render(furniture, models) → data URL. furniture: item
// objects as in a project (x, y relative to the picture's centre); models: the
// imported model assets they use. Call dispose() when done.
// canvas: an OffscreenCanvas to draw in a worker (src/view3d/thumbworker.js); render() then gives a Blob.
export function createThumbRenderer(THREE, { width = 160, height = 128, dir = [0.62, 0.5, 1], background = null, preserve = true, canvas = undefined } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const sky = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const pos = geo.attributes.position, cols = [];
  const top = new THREE.Color(0xdde9f7), hor = new THREE.Color(0xf6f3ee), gnd = new THREE.Color(0x8a867c);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const c = y > 0 ? hor.clone().lerp(top, Math.min(1, y * 1.4)) : hor.clone().lerp(gnd, Math.min(1, -y * 3)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sky, 0.02).texture;
  pmrem.dispose();
  geo.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(28, width / height, 0.01, 200);
  const view = new THREE.Vector3(...dir).normalize();
  const mats = makeMaterials(THREE, { textures: true });
  const modelCache = new Map();
  const loadModel = (asset) => {
    if (!modelCache.has(asset.id)) modelCache.set(asset.id, (async () => {
      const { GLTFLoader } = await import("../vendor/three/addons/GLTFLoader.js");
      return (await new GLTFLoader().parseAsync(base64ToBytes(asset.data).buffer, "")).scene;
    })());
    return modelCache.get(asset.id);
  };

  async function render(furniture, models = []) {
    const mini = normalizeProject(newProject("piece"));
    mini.levels = [{ id: "lv", name: "1F", elevation: 0, height: 100000, slab: 0 }];
    mini.view.level = "lv";
    mini.models = models;
    mini.furniture = furniture.map((f, i) => ({ ...f, id: f.id || `f${i}`, level: "lv", ...(f.light ? { light: { ...f.light, on: true } } : {}) }));
    let pending = 0, done;
    const all = new Promise((r) => { done = r; });
    const root = buildBuilding(THREE, mini, mats, { furniture: true, roofs: false, solids: false, loadModel: (a) => { pending++; return loadModel(a).finally(() => { if (--pending === 0) done(); }); } });
    if (pending) await Promise.race([all, new Promise((r) => setTimeout(r, 8000))]);
    scene.add(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
    const dist = (r / Math.sin(((camera.fov / 2) * Math.PI) / 180)) * (width < height ? height / width : 1) * 1.02;
    camera.position.copy(c).addScaledVector(view, dist);
    camera.lookAt(c);
    camera.near = dist / 50; camera.far = dist * 4; camera.updateProjectionMatrix();
    ground.scale.set(r * 8, r * 8, 1);
    ground.position.set(c.x, box.min.y + 0.0005, c.z);
    sun.position.set(c.x + r * 2, c.y + r * 5, c.z + r * 3);
    sun.target.position.copy(c);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -r * 2; sc.right = sc.top = r * 2; sc.near = 0.01; sc.far = r * 12; sc.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = renderer.domElement.convertToBlob ? await renderer.domElement.convertToBlob({ type: "image/png" }) : renderer.domElement.toDataURL("image/png");
    scene.remove(root);
    return url;
  }

  function dispose() {
    env.dispose();
    mats.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch { /* already gone */ }
  }
  return { render, dispose, canvas: renderer.domElement };
}

// 3D models as pictures for an icon: a model file (OBJ, STL, PLY, glTF/GLB, FBX, DAE, 3MF, 3DS,
// AMF, VRML) is loaded with three.js, centred and scaled to a unit size, lit, and rendered from
// the chosen angle onto a transparent background. The import window (Model3DDialog) previews it
// and the editor places the rendered PNG as a picture. three.js is loaded only when needed.

export const MODEL_EXTS = ['obj', 'stl', 'ply', 'glb', 'gltf', 'fbx', 'dae', '3mf', '3ds', 'amf', 'wrl'];
export const isModelFile = (name) => MODEL_EXTS.includes(String(name).split('.').pop().toLowerCase());

/** View presets: yaw (around the vertical axis) and pitch (looking down), in degrees. */
export const VIEW_PRESETS = {
  iso: { yaw: -35, pitch: 28 },
  front: { yaw: 0, pitch: 0 },
  side: { yaw: -90, pitch: 0 },
  top: { yaw: 0, pitch: 89 },
  back: { yaw: 180, pitch: 12 },
};

export const DEFAULT_VIEW = { ...VIEW_PRESETS.iso, roll: 0, zoom: 100, light: 100, useColor: false, color: '#3b82f6', wire: false, shadow: true };

let threeModule = null;
const three = async () => (threeModule ??= await import('three'));

const text = (buffer) => new TextDecoder().decode(buffer);

/** Reads a model from its bytes. Returns a three.js Object3D. Throws Error('BAD_MODEL') on failure. */
export async function loadModel(name, buffer) {
  const THREE = await three();
  const ext = String(name).split('.').pop().toLowerCase();
  let object;
  try {
    switch (ext) {
      case 'obj': { const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js'); object = new OBJLoader().parse(text(buffer)); break; }
      case 'stl': { const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js'); object = new THREE.Mesh(new STLLoader().parse(buffer)); break; }
      case 'ply': {
        const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
        const geometry = new PLYLoader().parse(buffer);
        const material = new THREE.MeshStandardMaterial({ vertexColors: Boolean(geometry.attributes.color) });
        object = geometry.index || geometry.attributes.position.count % 3 === 0 ? new THREE.Mesh(geometry, material) : new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.01, vertexColors: true }));
        break;
      }
      case 'glb': case 'gltf': {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().parseAsync(ext === 'gltf' ? text(buffer) : buffer, '');
        object = gltf.scene;
        break;
      }
      case 'fbx': { const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js'); object = new FBXLoader().parse(buffer, ''); break; }
      case 'dae': { const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js'); object = new ColladaLoader().parse(text(buffer), '').scene; break; }
      case '3mf': { const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js'); object = new ThreeMFLoader().parse(buffer); break; }
      case '3ds': { const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js'); object = new TDSLoader().parse(buffer, ''); break; }
      case 'amf': { const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader.js'); object = new AMFLoader().parse(buffer); break; }
      case 'wrl': { const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js'); object = new VRMLLoader().parse(text(buffer), ''); break; }
      default: throw new Error('BAD_MODEL');
    }
  } catch (err) {
    if (err?.message === 'BAD_MODEL') throw err;
    const bad = new Error('BAD_MODEL');
    bad.cause = err;
    throw bad;
  }
  let meshes = 0;
  object?.traverse?.((node) => { if (node.isMesh || node.isPoints || node.isLine) meshes += 1; });
  if (!meshes) throw new Error('BAD_MODEL');
  return object;
}

/** Size facts of a model: meshes, triangles, vertices. */
export function modelStats(object) {
  let meshes = 0; let triangles = 0; let vertices = 0;
  object.traverse((node) => {
    if (!node.geometry) return;
    meshes += 1;
    const position = node.geometry.attributes?.position;
    if (!position) return;
    vertices += position.count;
    triangles += node.geometry.index ? node.geometry.index.count / 3 : position.count / 3;
  });
  return { meshes, triangles: Math.round(triangles), vertices };
}

/**
 * A renderer for one model on a canvas. `render(view)` draws it from the view; `snapshot(size,
 * view)` returns a transparent PNG data URL of `size` pixels.
 */
export async function createModelView(canvas, object) {
  const THREE = await three();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);

  // The model centred at the origin, its largest side 1 unit.
  const holder = new THREE.Group();
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = 1 / Math.max(size.x, size.y, size.z, 1e-9);
  // The radius of the sphere around the scaled model: the camera keeps all of it in view.
  const radius = Math.max(0.05, (Math.hypot(size.x, size.y, size.z) * scale) / 2);
  object.position.sub(centre);
  holder.add(object);
  holder.scale.setScalar(scale);
  scene.add(holder);

  // Original materials kept; the "one colour" mode and wireframe swap them in and out.
  const originals = new Map();
  object.traverse((node) => {
    if (!node.isMesh) return;
    if (!node.material || (Array.isArray(node.material) && !node.material.length)) node.material = new THREE.MeshStandardMaterial({ color: 0xb8c4d6 });
    originals.set(node, node.material);
    if (node.geometry && !node.geometry.attributes.normal) node.geometry.computeVertexNormals();
  });
  const solid = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.45, metalness: 0.1 });

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.2);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  scene.add(hemi, key, fill);

  // A soft contact shadow under the model.
  const shadowTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -(size.y * scale) / 2 - 0.002;
  scene.add(shadow);

  const apply = (view) => {
    const v = { ...DEFAULT_VIEW, ...view };
    const yaw = (v.yaw * Math.PI) / 180;
    const pitch = (Math.max(-89, Math.min(89, v.pitch)) * Math.PI) / 180;
    // Far enough for the whole model in the narrower direction (with a margin), then zoomed.
    const half = (camera.fov * Math.PI) / 360;
    const narrow = camera.aspect >= 1 ? half : Math.atan(Math.tan(half) * camera.aspect);
    const distance = ((radius * 1.12) / Math.sin(narrow)) / (Math.max(20, v.zoom) / 100);
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(((v.roll || 0) * Math.PI) / 180);
    camera.updateProjectionMatrix();
    key.position.copy(camera.position).add(new THREE.Vector3(1.5, 2.5, 1));
    fill.position.set(-camera.position.x, camera.position.y * 0.3, -camera.position.z);
    const k = Math.max(0, v.light) / 100;
    hemi.intensity = 1.2 * k; key.intensity = 2.2 * k; fill.intensity = 0.8 * k;
    solid.color.set(v.color);
    solid.wireframe = Boolean(v.wire);
    for (const [node, material] of originals) {
      if (v.useColor || v.wire) node.material = solid;
      else node.material = material;
    }
    shadow.visible = Boolean(v.shadow);
  };

  return {
    stats: modelStats(object),
    render(view, width = canvas.clientWidth || canvas.width, height = canvas.clientHeight || canvas.height) {
      renderer.setPixelRatio(globalThis.devicePixelRatio || 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      apply(view);
      renderer.render(scene, camera);
    },
    snapshot(px, view) {
      renderer.setPixelRatio(1);
      renderer.setSize(px, px, false);
      camera.aspect = 1;
      apply(view);
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    },
    dispose() {
      renderer.dispose();
      object.traverse((node) => { node.geometry?.dispose?.(); });
      solid.dispose();
      shadowTexture.dispose();
    },
  };
}

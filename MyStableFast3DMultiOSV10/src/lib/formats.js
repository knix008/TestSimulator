// 3D file formats: what can be opened, what can be saved, and the code that
// does both with three.js's loaders and exporters.
//
// A model file may refer to other files next to it (an OBJ to its MTL, the
// MTL to its textures, a .gltf to its .bin and pictures). Those are found
// before parsing — `references()` reads the names out of the file — and
// handed to the loader as blob URLs, so the same code works with real paths
// on the desktop and with a multi-file selection in the browser.
import * as THREE from 'three';

export const IMPORT_FORMATS = [
  { id: 'glb', ext: ['glb'], name: 'glTF Binary' },
  { id: 'gltf', ext: ['gltf'], name: 'glTF' },
  { id: 'obj', ext: ['obj'], name: 'Wavefront OBJ' },
  { id: 'stl', ext: ['stl'], name: 'STL' },
  { id: 'ply', ext: ['ply'], name: 'PLY' },
  { id: 'fbx', ext: ['fbx'], name: 'Autodesk FBX' },
  { id: 'dae', ext: ['dae'], name: 'COLLADA' },
  { id: '3mf', ext: ['3mf'], name: '3D Manufacturing' },
  { id: '3ds', ext: ['3ds'], name: '3D Studio' },
  { id: 'usdz', ext: ['usdz', 'usda', 'usdc', 'usd'], name: 'USD / USDZ' },
  { id: 'wrl', ext: ['wrl', 'vrml'], name: 'VRML' },
  { id: 'vtk', ext: ['vtk', 'vtp'], name: 'VTK' },
  { id: 'amf', ext: ['amf'], name: 'AMF' },
  { id: 'pcd', ext: ['pcd'], name: 'Point Cloud Data' },
  { id: 'xyz', ext: ['xyz'], name: 'XYZ point cloud' },
  { id: 'kmz', ext: ['kmz'], name: 'KMZ (COLLADA)' },
  { id: 'lwo', ext: ['lwo'], name: 'LightWave' },
];

export const EXPORT_FORMATS = [
  { id: 'glb', ext: 'glb', name: 'glTF Binary (.glb)', mime: 'model/gltf-binary', textures: true },
  { id: 'gltf', ext: 'gltf', name: 'glTF (.gltf)', mime: 'model/gltf+json', textures: true },
  { id: 'obj', ext: 'obj', name: 'Wavefront OBJ (.obj)', mime: 'text/plain', textures: false },
  { id: 'stl', ext: 'stl', name: 'STL (.stl)', mime: 'model/stl', textures: false },
  { id: 'stl-ascii', ext: 'stl', name: 'STL ASCII (.stl)', mime: 'model/stl', textures: false },
  { id: 'ply', ext: 'ply', name: 'PLY (.ply)', mime: 'application/octet-stream', textures: false },
  { id: 'ply-ascii', ext: 'ply', name: 'PLY ASCII (.ply)', mime: 'text/plain', textures: false },
  { id: 'usdz', ext: 'usdz', name: 'USDZ (.usdz)', mime: 'model/vnd.usdz+zip', textures: true },
  { id: '3mf', ext: '3mf', name: '3D Manufacturing (.3mf)', mime: 'model/3mf', textures: false },
  { id: 'amf', ext: 'amf', name: 'AMF (.amf)', mime: 'application/x-amf', textures: false },
  { id: 'dae', ext: 'dae', name: 'COLLADA (.dae)', mime: 'model/vnd.collada+xml', textures: false },
  { id: 'wrl', ext: 'wrl', name: 'VRML 2.0 (.wrl)', mime: 'model/vrml', textures: false },
  { id: 'vtk', ext: 'vtk', name: 'VTK (.vtk)', mime: 'text/plain', textures: false },
  { id: 'pcd', ext: 'pcd', name: 'Point cloud PCD (.pcd)', mime: 'text/plain', textures: false, points: true },
  { id: 'xyz', ext: 'xyz', name: 'Point cloud XYZ (.xyz)', mime: 'text/plain', textures: false, points: true },
];

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'];

export const MODEL_EXTENSIONS = IMPORT_FORMATS.flatMap((f) => f.ext);

export function extOf(name) {
  const m = /\.([^./\\]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

export function baseOf(name) {
  return String(name || '').split(/[\\/]/).pop();
}

export function formatOf(name) {
  const ext = extOf(name);
  return IMPORT_FORMATS.find((f) => f.ext.includes(ext)) || null;
}

export const isModelFile = (name) => !!formatOf(name);
export const isImageFile = (name) => IMAGE_EXTENSIONS.includes(extOf(name));

export function exportFormat(id) {
  return EXPORT_FORMATS.find((f) => f.id === id) || EXPORT_FORMATS[0];
}

// The file name to save `name` as in `formatId`.
export function exportName(name, formatId) {
  const fmt = exportFormat(formatId);
  const stem = baseOf(name || 'model').replace(/\.[^.]+$/, '') || 'model';
  return `${stem}.${fmt.ext}`;
}

const text = (data) => new TextDecoder().decode(data instanceof Uint8Array ? data : new Uint8Array(data));

// The start of an AMF file as text (it may be zipped: then no unit is read).
const amfText = (data) => {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  return u8[0] === 0x50 && u8[1] === 0x4b ? '' : text(u8.subarray(0, 4096));
};

const toArrayBuffer = (data) => {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer;
};

// Names of the files a model refers to, as written in it (relative paths).
export function references(name, data) {
  const ext = extOf(name);
  const out = new Set();
  const add = (u) => {
    const v = String(u || '').trim();
    if (v && !/^(data|blob|https?):/i.test(v)) out.add(decodeURIComponent(v.replace(/\\/g, '/')));
  };
  try {
    if (ext === 'gltf') {
      const json = JSON.parse(text(data));
      for (const b of json.buffers || []) add(b.uri);
      for (const im of json.images || []) add(im.uri);
    } else if (ext === 'obj') {
      for (const m of text(data).matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)) add(m[1]);
    } else if (ext === 'mtl') {
      for (const m of text(data).matchAll(/^\s*(?:map_\w+|bump|disp|decal|refl|norm)\s+(.+?)\s*$/gim)) {
        // Options (-bm 1, -s 1 1 1 …) come before the file name, which is last.
        const parts = m[1].split(/\s+/);
        add(parts[parts.length - 1]);
      }
    } else if (ext === 'dae') {
      for (const m of text(data).matchAll(/<init_from>\s*([^<]+?)\s*<\/init_from>/g)) add(m[1]);
    }
  } catch { /* an unreadable reference list just means nothing extra is loaded */ }
  return [...out];
}

// Gathers the main file and everything it refers to (and, for OBJ, what its
// MTL refers to). `read(relPath)` returns the bytes or null.
export async function gatherFiles(main, read) {
  const files = new Map([[baseOf(main.name), main.data]]);
  const queue = references(main.name, main.data);
  const seen = new Set();
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let data = null;
    try { data = await read(rel); } catch { data = null; }
    if (!data) continue;
    files.set(rel, data);
    files.set(baseOf(rel), data);
    for (const more of references(rel, data)) queue.push(more);
  }
  return files;
}

function mimeFor(name) {
  const ext = extOf(name);
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    bmp: 'image/bmp', ktx2: 'image/ktx2', tga: 'image/x-tga',
  }[ext] || 'application/octet-stream';
}

// A LoadingManager that serves `files` (name → bytes) as blob URLs, matched
// by the path written in the model or by its base name.
function managerFor(files) {
  const urls = new Map();
  const blobs = [];
  for (const [name, data] of files) {
    const url = URL.createObjectURL(new Blob([data], { type: mimeFor(name) }));
    blobs.push(url);
    urls.set(name.toLowerCase(), url);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    const clean = decodeURIComponent(String(url).split(/[?#]/)[0]).replace(/\\/g, '/').replace(/^\.\//, '');
    return urls.get(clean.toLowerCase()) || urls.get(baseOf(clean).toLowerCase()) || url;
  });
  return { manager, dispose: () => blobs.forEach((u) => URL.revokeObjectURL(u)) };
}

// Parses a model. Returns { object, animations, format }.
export async function loadModel(name, data, files = new Map()) {
  const fmt = formatOf(name);
  if (!fmt) throw new Error(`Unsupported 3D file: ${baseOf(name)}`);
  const all = new Map(files);
  all.set(baseOf(name), data);
  const { manager, dispose } = managerFor(all);
  try {
    const result = await parse(fmt.id, name, data, manager);
    return { ...result, format: fmt.id };
  } finally {
    // Textures have been read into images by now; give the loaders a moment.
    setTimeout(dispose, 5000);
  }
}

function meshFromGeometry(geometry, points = false) {
  geometry.computeBoundingSphere();
  if (!geometry.getAttribute('normal') && !points) geometry.computeVertexNormals();
  const hasColor = !!geometry.getAttribute('color');
  if (points || !geometry.index && geometry.getAttribute('position') && !geometry.getAttribute('normal')) {
    const size = (geometry.boundingSphere?.radius || 1) / 300;
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size, vertexColors: hasColor, color: hasColor ? 0xffffff : 0xcfcfcf }));
  }
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: hasColor ? 0xffffff : 0xc8c8c8, vertexColors: hasColor, roughness: 0.7, metalness: 0.05,
  }));
}

async function parse(id, name, data, manager) {
  const buffer = () => toArrayBuffer(data);
  switch (id) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader(manager);
      const gltf = await loader.parseAsync(id === 'glb' ? buffer() : text(data), '');
      return { object: gltf.scene, animations: gltf.animations || [] };
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js');
      const loader = new OBJLoader(manager);
      const source = text(data);
      const lib = /^\s*mtllib\s+(.+?)\s*$/m.exec(source);
      if (lib) {
        try {
          const materials = await new MTLLoader(manager).loadAsync(lib[1]);
          materials.preload();
          loader.setMaterials(materials);
        } catch { /* no MTL next to it: grey material */ }
      }
      return { object: loader.parse(source), animations: [] };
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      return { object: meshFromGeometry(new STLLoader(manager).parse(buffer())), animations: [] };
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      const geometry = new PLYLoader(manager).parse(buffer());
      return { object: meshFromGeometry(geometry, !geometry.index), animations: [] };
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const object = new FBXLoader(manager).parse(buffer(), '');
      return { object, animations: object.animations || [] };
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
      const dae = new ColladaLoader(manager).parse(text(data), '');
      return { object: dae.scene, animations: dae.scene.animations || [] };
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
      return { object: new ThreeMFLoader(manager).parse(buffer()), animations: [] };
    }
    case '3ds': {
      const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js');
      return { object: new TDSLoader(manager).parse(buffer(), ''), animations: [] };
    }
    case 'usdz': {
      const { USDZLoader } = await import('three/examples/jsm/loaders/USDZLoader.js');
      return { object: new USDZLoader(manager).parse(buffer()), animations: [] };
    }
    case 'wrl': {
      const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js');
      return { object: new VRMLLoader(manager).parse(text(data), ''), animations: [] };
    }
    case 'vtk': {
      const { VTKLoader } = await import('three/examples/jsm/loaders/VTKLoader.js');
      return { object: meshFromGeometry(new VTKLoader(manager).parse(buffer(), '')), animations: [] };
    }
    case 'amf': {
      const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader.js');
      // The loader turns every unit into millimetres; the numbers are kept as
      // written instead, as for every other format (the viewer's unit setting
      // says what they mean).
      const object = new AMFLoader(manager).parse(buffer());
      const unit = /<amf\b[^>]*\bunit\s*=\s*"([^"]+)"/i.exec(amfText(data))?.[1]?.toLowerCase();
      const scale ={ inch: 25.4, feet: 304.8, meter: 1000, micron: 0.001 }[unit];
      if (scale) object.scale.multiplyScalar(1 / scale);
      return { object, animations: [] };
    }
    case 'pcd': {
      const { PCDLoader } = await import('three/examples/jsm/loaders/PCDLoader.js');
      const points = new PCDLoader(manager).parse(buffer());
      return { object: meshFromGeometry(points.geometry, true), animations: [] };
    }
    case 'xyz': {
      const { XYZLoader } = await import('three/examples/jsm/loaders/XYZLoader.js');
      const geometry = new XYZLoader(manager).parse(text(data));
      return { object: meshFromGeometry(geometry, true), animations: [] };
    }
    case 'kmz': {
      const { KMZLoader } = await import('three/examples/jsm/loaders/KMZLoader.js');
      const kmz = new KMZLoader(manager).parse(buffer());
      return { object: kmz.scene, animations: [] };
    }
    case 'lwo': {
      const { LWOLoader } = await import('three/examples/jsm/loaders/LWOLoader.js');
      const lwo = new LWOLoader(manager).parse(buffer(), '', name);
      const group = new THREE.Group();
      for (const m of lwo.meshes) group.add(m);
      return { object: group, animations: lwo.animations || [] };
    }
    default:
      throw new Error(`Unsupported 3D file: ${baseOf(name)}`);
  }
}

// Saves `object` (with its transform) as `formatId`. Returns Uint8Array.
// `units` (the viewer's unit setting) names the unit in the formats that
// record one (3MF, AMF, COLLADA); the numbers themselves are not changed.
export async function exportModel(object, formatId, { units = 'm' } = {}) {
  const fmt = exportFormat(formatId);
  object.updateMatrixWorld(true);
  switch (fmt.id) {
    case 'glb':
    case 'gltf': {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const binary = fmt.id === 'glb';
      const result = await new GLTFExporter().parseAsync(object, { binary, onlyVisible: true, maxTextureSize: 4096 });
      return binary ? new Uint8Array(result) : new TextEncoder().encode(JSON.stringify(result, null, 1));
    }
    case 'obj': {
      const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
      return new TextEncoder().encode(new OBJExporter().parse(object));
    }
    case 'stl':
    case 'stl-ascii': {
      const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
      const binary = fmt.id === 'stl';
      const out = new STLExporter().parse(object, { binary });
      return binary ? new Uint8Array(out.buffer, out.byteOffset, out.byteLength) : new TextEncoder().encode(out);
    }
    case 'ply':
    case 'ply-ascii': {
      const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js');
      const binary = fmt.id === 'ply';
      const out = await new Promise((resolve) => {
        new PLYExporter().parse(object, resolve, { binary });
      });
      return binary ? new Uint8Array(out) : new TextEncoder().encode(out);
    }
    case '3mf':
    case 'amf':
    case 'dae':
    case 'wrl':
    case 'vtk':
    case 'pcd':
    case 'xyz': {
      const w = await import('./exporters.js');
      const meshes = w.collectMeshes(object);
      const write = { '3mf': w.write3MF, amf: w.writeAMF, dae: w.writeDAE, wrl: w.writeVRML, vtk: w.writeVTK, pcd: w.writePCD, xyz: w.writeXYZ }[fmt.id];
      return write(meshes, { units });
    }
    case 'usdz': {
      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
      return new USDZExporter().parseAsync(object);
    }
    default:
      throw new Error(`Unknown format: ${formatId}`);
  }
}

// Counts for the info panel.
export function modelStats(object) {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  let points = 0;
  const materials = new Set();
  const textures = new Set();
  object.traverse((o) => {
    const g = o.geometry;
    if (!g) return;
    const n = g.getAttribute('position')?.count || 0;
    if (o.isPoints) { points += n; return; }
    if (!o.isMesh) return;
    meshes += 1;
    vertices += n;
    triangles += g.index ? g.index.count / 3 : n / 3;
    for (const m of [].concat(o.material || [])) {
      materials.add(m);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        if (m[key]) textures.add(m[key]);
      }
    }
  });
  const box = new THREE.Box3().setFromObject(object);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  return {
    meshes, vertices, triangles: Math.round(triangles), points,
    materials: materials.size, textures: textures.size,
    size: [size.x, size.y, size.z],
  };
}

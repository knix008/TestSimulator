// 3D file formats for the import / export dialogs (names, extensions, MIME types).
// `related`: the format may reference side files (textures, .mtl, .bin) the dialog should let the user pick too.
// This list is the single source: the import dialogs, drag & drop (fileformat.js isModelName) and the desktop
// file filters all derive from it, so a format added here is picked up everywhere.

export const IMPORT_FORMATS = [
  { id: 'gltf', ko: 'glTF / GLB (Draco · KTX2 포함)', en: 'glTF / GLB (incl. Draco · KTX2)', ext: ['glb', 'gltf'], mime: ['model/gltf-binary', 'model/gltf+json'], related: true },
  { id: 'obj', ko: 'Wavefront OBJ (+MTL)', en: 'Wavefront OBJ (+MTL)', ext: ['obj'], mime: ['model/obj'], related: true },
  { id: 'fbx', ko: 'Autodesk FBX', en: 'Autodesk FBX', ext: ['fbx'], mime: ['application/octet-stream'], related: true },
  { id: 'dae', ko: 'Collada (SketchUp 내보내기)', en: 'Collada (SketchUp export)', ext: ['dae'], mime: ['model/vnd.collada+xml'], related: true },
  { id: 'stl', ko: 'STL (3D 프린팅)', en: 'STL (3D printing)', ext: ['stl'], mime: ['model/stl'] },
  { id: '3ds', ko: '3D Studio (3DS)', en: '3D Studio (3DS)', ext: ['3ds'], mime: ['application/x-3ds'], related: true },
  { id: 'ply', ko: 'PLY (스캔 데이터)', en: 'PLY (scans)', ext: ['ply'], mime: ['application/ply'] },
  { id: '3mf', ko: '3MF (3D 프린팅)', en: '3MF (3D printing)', ext: ['3mf'], mime: ['model/3mf'] },
  { id: 'usdz', ko: 'USD / USDZ', en: 'USD / USDZ', ext: ['usdz', 'usda', 'usdc', 'usd'], mime: ['model/vnd.usdz+zip'] },
  { id: 'vrml', ko: 'VRML (WRL)', en: 'VRML (WRL)', ext: ['wrl', 'vrml'], mime: ['model/vrml'], related: true },
  { id: 'step', ko: 'STEP (CAD 솔리드)', en: 'STEP (CAD solids)', ext: ['step', 'stp'], mime: ['model/step'] },
  { id: 'iges', ko: 'IGES (CAD)', en: 'IGES (CAD)', ext: ['iges', 'igs'], mime: ['model/iges'] },
  { id: 'brep', ko: 'OpenCASCADE BREP', en: 'OpenCASCADE BREP', ext: ['brep', 'brp'], mime: ['application/octet-stream'] },
  { id: '3dm', ko: 'Rhino (3DM)', en: 'Rhino (3DM)', ext: ['3dm'], mime: ['model/vnd.3dm'] },
  { id: 'amf', ko: 'AMF (3D 프린팅)', en: 'AMF (3D printing)', ext: ['amf'], mime: ['application/x-amf'] },
  { id: 'kmz', ko: 'KMZ (SketchUp · Google Earth)', en: 'KMZ (SketchUp · Google Earth)', ext: ['kmz'], mime: ['application/vnd.google-earth.kmz'] },
  { id: 'lwo', ko: 'LightWave (LWO)', en: 'LightWave (LWO)', ext: ['lwo'], mime: ['application/x-lwo'], related: true },
  { id: 'vtk', ko: 'VTK (과학·해석 데이터)', en: 'VTK (scientific data)', ext: ['vtk', 'vtp'], mime: ['application/x-vtk'] },
  { id: 'off', ko: 'OFF (Object File Format)', en: 'OFF (Object File Format)', ext: ['off'], mime: ['application/x-off'] },
  { id: 'pcd', ko: 'PCD (포인트 클라우드)', en: 'PCD (point cloud)', ext: ['pcd'], mime: ['application/x-pcd'] },
  { id: 'xyz', ko: 'XYZ (포인트 클라우드)', en: 'XYZ (point cloud)', ext: ['xyz'], mime: ['text/plain'] },
  { id: 'zip', ko: 'ZIP 묶음 (모델 + 텍스처)', en: 'ZIP bundle (model + textures)', ext: ['zip'], mime: ['application/zip'] },
];

/** Side files a model may reference (picked together with it, or packed in a .zip). */
export const RELATED_EXTENSIONS = ['mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'gif', 'tif', 'tiff', 'ktx2', 'dds'];

/** Recognised but not readable: we explain why instead of failing silently. */
export const UNSUPPORTED_FORMATS = [
  { id: 'skp', ext: ['skp'], code: 'skp-unsupported', ko: 'SketchUp(.skp)는 비공개 형식이라 바로 열 수 없습니다. SketchUp에서 파일 › 내보내기 › 3D 모델로 Collada(.dae) 또는 glTF(.glb)를 저장해 가져오세요.', en: 'SketchUp (.skp) is a proprietary format and cannot be read directly. In SketchUp use File › Export › 3D Model and save Collada (.dae) or glTF (.glb), then import that.' },
];

export const EXPORT_FORMATS = [
  { id: 'glb', ko: 'GLB (glTF 바이너리)', en: 'GLB (binary glTF)', ext: 'glb', mime: 'model/gltf-binary' },
  { id: 'gltf', ko: 'glTF (내장 데이터)', en: 'glTF (embedded)', ext: 'gltf', mime: 'model/gltf+json' },
  { id: 'obj', ko: 'Wavefront OBJ', en: 'Wavefront OBJ', ext: 'obj', mime: 'model/obj', options: ['mtl'] },
  { id: 'stl', ko: 'STL (바이너리)', en: 'STL (binary)', ext: 'stl', mime: 'model/stl', options: ['units', 'upAxis'] },
  { id: 'ply', ko: 'PLY (바이너리)', en: 'PLY (binary)', ext: 'ply', mime: 'application/ply' },
  { id: 'usdz', ko: 'USDZ (AR · Apple)', en: 'USDZ (AR · Apple)', ext: 'usdz', mime: 'model/vnd.usdz+zip' },
];

export const UNIT_OPTIONS = [
  ['auto', '자동', 'Auto'], ['mm', '밀리미터', 'Millimetres'], ['cm', '센티미터', 'Centimetres'], ['m', '미터', 'Metres'], ['in', '인치', 'Inches'], ['ft', '피트', 'Feet'],
];

/** Metres per unit. */
export const UNIT_SCALE = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

const extOf = (name) => { const m = /\.([^./\\]+)$/.exec(String(name ?? '')); return m ? m[1].toLowerCase() : ''; };
export { extOf };

/** The import format of a file name (null when unknown). */
export function importFormatOf(name) {
  const ext = extOf(name);
  return IMPORT_FORMATS.find((f) => f.ext.includes(ext)) ?? null;
}

/** Model file names (readable formats plus the recognised-but-unreadable ones, which explain themselves). */
export const MODEL_EXTENSIONS = [...IMPORT_FORMATS, ...UNSUPPORTED_FORMATS].flatMap((f) => f.ext);
const MODEL_NAME = new RegExp(`\\.(${MODEL_EXTENSIONS.join('|')})$`, 'i');
export const isModelFileName = (name) => MODEL_NAME.test(String(name ?? ''));

/** Every extension the model import takes: models (+ side files when `related`). */
export function importExtensions({ related = true } = {}) {
  return related ? [...MODEL_EXTENSIONS, ...RELATED_EXTENSIONS] : IMPORT_FORMATS.flatMap((f) => f.ext);
}

/** `accept` attribute / dialog filter: every importable extension (plus side files when `related`). */
export function importAccept({ related = true } = {}) {
  return importExtensions({ related }).map((e) => `.${e}`).join(',');
}

/** Tauri dialog filters: [{ name, extensions }]. The first (import) entry also lets side files be picked. */
export function dialogFilters(lang = 'en', kind = 'import') {
  const list = kind === 'import' ? IMPORT_FORMATS : EXPORT_FORMATS;
  const filters = list.map((f) => ({ name: f[lang] ?? f.en, extensions: Array.isArray(f.ext) ? f.ext : [f.ext] }));
  if (kind === 'import') filters.unshift({ name: lang === 'ko' ? '모든 3D 모델' : 'All 3D models', extensions: importExtensions() });
  return filters;
}

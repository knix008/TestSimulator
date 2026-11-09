// 3D file formats for the import / export dialogs (names, extensions, MIME types).
// `related`: the format may reference side files (textures, .mtl, .bin) the dialog should let the user pick too.

export const IMPORT_FORMATS = [
  { id: 'gltf', ko: 'glTF / GLB', en: 'glTF / GLB', ext: ['glb', 'gltf'], mime: ['model/gltf-binary', 'model/gltf+json'], related: true },
  { id: 'obj', ko: 'Wavefront OBJ (+MTL)', en: 'Wavefront OBJ (+MTL)', ext: ['obj'], mime: ['model/obj'], related: true },
  { id: 'fbx', ko: 'Autodesk FBX', en: 'Autodesk FBX', ext: ['fbx'], mime: ['application/octet-stream'], related: true },
  { id: 'dae', ko: 'Collada (SketchUp 내보내기)', en: 'Collada (SketchUp export)', ext: ['dae'], mime: ['model/vnd.collada+xml'], related: true },
  { id: 'stl', ko: 'STL (3D 프린팅)', en: 'STL (3D printing)', ext: ['stl'], mime: ['model/stl'] },
  { id: '3ds', ko: '3D Studio (3DS)', en: '3D Studio (3DS)', ext: ['3ds'], mime: ['application/x-3ds'], related: true },
  { id: 'ply', ko: 'PLY (스캔 데이터)', en: 'PLY (scans)', ext: ['ply'], mime: ['application/ply'] },
  { id: '3mf', ko: '3MF (3D 프린팅)', en: '3MF (3D printing)', ext: ['3mf'], mime: ['model/3mf'] },
  { id: 'usdz', ko: 'USD / USDZ', en: 'USD / USDZ', ext: ['usdz', 'usda', 'usdc', 'usd'], mime: ['model/vnd.usdz+zip'] },
  { id: 'vrml', ko: 'VRML (WRL)', en: 'VRML (WRL)', ext: ['wrl', 'vrml'], mime: ['model/vrml'], related: true },
];

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

/** `accept` attribute / dialog filter: every importable extension (plus side files when `related`). */
export function importAccept({ related = true } = {}) {
  const exts = IMPORT_FORMATS.flatMap((f) => f.ext);
  if (related) exts.push('mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'skp');
  return exts.map((e) => `.${e}`).join(',');
}

/** Tauri dialog filters: [{ name, extensions }]. */
export function dialogFilters(lang = 'en', kind = 'import') {
  const list = kind === 'import' ? IMPORT_FORMATS : EXPORT_FORMATS;
  const filters = list.map((f) => ({ name: f[lang] ?? f.en, extensions: Array.isArray(f.ext) ? f.ext : [f.ext] }));
  if (kind === 'import') filters.unshift({ name: lang === 'ko' ? '모든 3D 모델' : 'All 3D models', extensions: IMPORT_FORMATS.flatMap((f) => f.ext) });
  return filters;
}

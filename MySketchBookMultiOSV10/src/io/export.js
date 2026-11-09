// Exports a model (or the whole scene) to GLB, glTF, OBJ (+MTL in a zip), STL, PLY or USDZ with three's
// exporters. The source object is never modified: it is cloned (sharing geometry/materials) under a
// wrapper that applies the output units and axis.
import * as THREE from 'three';
import { EXPORT_FORMATS, UNIT_SCALE } from './formats.js';

const exportError = (code, message) => Object.assign(new Error(message), { code });

/**
 * Wraps a clone of `object3D` for export. options.units: output unit (numbers are written in it;
 * default 'm'); options.upAxis 'z' rotates Y-up to Z-up (3D printing / CAD); options.onlyVisible skips hidden.
 */
export function prepareForExport(object3D, { units = 'm', upAxis = 'y', onlyVisible = true } = {}) {
  const wrapper = new THREE.Group();
  wrapper.name = object3D.name || 'export';
  const copy = object3D.clone(true);
  // Keep the object's own placement (world transform) so a scene exports as the user sees it.
  object3D.updateWorldMatrix(true, false);
  copy.matrixAutoUpdate = true;
  object3D.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
  if (onlyVisible) {
    const hidden = [];
    copy.traverse((node) => { if (!node.visible || node.userData.noExport) hidden.push(node); });
    for (const node of hidden) node.parent?.remove(node);
  }
  wrapper.add(copy);
  wrapper.scale.setScalar(1 / (UNIT_SCALE[units] ?? 1));
  if (upAxis === 'z') wrapper.rotation.x = Math.PI / 2; // +Y → +Z, front +Z → −Y
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

const encoder = new TextEncoder();
const toBytes = (data) => {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return encoder.encode(data);
  return encoder.encode(JSON.stringify(data));
};

const fmt = (id) => EXPORT_FORMATS.find((f) => f.id === id);

/**
 * exportModel(object3D, format, options) → { bytes: Uint8Array, mime, ext }
 *   format: 'glb' | 'gltf' | 'obj' | 'stl' | 'ply' | 'usdz'
 *   options: units ('m'), upAxis ('y' | 'z'), onlyVisible (true), mtl (OBJ: zip the .obj with a .mtl), name (file base name)
 */
export async function exportModel(object3D, format, options = {}) {
  const info = fmt(format);
  if (!info) throw exportError('export-format-unsupported', `Unsupported export format: ${format}`);
  const target = prepareForExport(object3D, options);
  const name = String(options.name ?? object3D.name ?? 'model').replace(/[\\/:*?"<>|]+/g, '_') || 'model';
  switch (format) {
    case 'glb':
    case 'gltf': {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const result = await new GLTFExporter().parseAsync(target, { binary: format === 'glb', onlyVisible: options.onlyVisible ?? true, embedImages: true, maxTextureSize: options.maxTextureSize ?? 4096 });
      return { bytes: toBytes(format === 'glb' ? result : JSON.stringify(result)), mime: info.mime, ext: info.ext };
    }
    case 'obj': {
      const { obj, mtl } = await objWithMaterials(target, name);
      if (!options.mtl) return { bytes: toBytes(obj), mime: info.mime, ext: 'obj' };
      const { zipSync } = await import('fflate');
      const zip = zipSync({ [`${name}.obj`]: toBytes(obj.replace(/^/, `mtllib ${name}.mtl\n`)), [`${name}.mtl`]: toBytes(mtl) });
      return { bytes: zip, mime: 'application/zip', ext: 'zip' };
    }
    case 'stl': {
      const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
      return { bytes: toBytes(new STLExporter().parse(target, { binary: true })), mime: info.mime, ext: info.ext };
    }
    case 'ply': {
      const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js');
      // parse() returns the result; its callback goes through requestAnimationFrame (absent in workers/Node).
      const result = new PLYExporter().parse(target, null, { binary: true });
      return { bytes: toBytes(result), mime: info.mime, ext: info.ext };
    }
    case 'usdz': {
      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
      const result = await new USDZExporter().parseAsync(target, { quickLookCompatible: true, maxTextureSize: options.maxTextureSize ?? 2048 });
      return { bytes: toBytes(result), mime: info.mime, ext: info.ext };
    }
    default:
      throw exportError('export-format-unsupported', `Unsupported export format: ${format}`);
  }
}

/**
 * OBJ text with `usemtl` per mesh (three's OBJExporter writes none) and the matching MTL text.
 * OBJExporter writes one `o` block per mesh/line/points in traverse order; we insert after each mesh's block header.
 */
export async function objWithMaterials(target, name = 'model') {
  const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
  const text = new OBJExporter().parse(target);
  const order = [];
  target.traverse((node) => { if (node.isMesh || node.isLine || node.isPoints) order.push(node); });
  const materials = new Map();
  const nameOf = (material) => {
    if (!materials.has(material.uuid)) {
      const base = (material.name || material.userData?.preset || 'material').replace(/\s+/g, '_');
      let unique = base, i = 1;
      while ([...materials.values()].some((m) => m.name === unique)) unique = `${base}_${++i}`;
      materials.set(material.uuid, { name: unique, material });
    }
    return materials.get(material.uuid).name;
  };
  let index = -1;
  // OBJExporter's own `usemtl` uses raw material names (may clash or contain spaces): replaced by ours.
  const obj = text.split('\n').filter((line) => !line.startsWith('usemtl ')).map((line) => {
    if (!line.startsWith('o ')) return line;
    const node = order[++index];
    const material = node?.isMesh ? (Array.isArray(node.material) ? node.material[0] : node.material) : null;
    return material ? `${line}\nusemtl ${nameOf(material)}` : line;
  }).join('\n');
  const mtl = [`# ${name} — MySketchBook`, ...[...materials.values()].flatMap(({ name: id, material }) => {
    const c = material.color ?? new THREE.Color(1, 1, 1);
    const e = material.emissive ?? new THREE.Color(0, 0, 0);
    const roughness = material.roughness ?? 0.8;
    const ns = Math.round(Math.max(1, 2 / Math.max(roughness * roughness, 0.0004) - 2));
    const spec = material.metalness > 0.5 ? c : new THREE.Color(0.04, 0.04, 0.04);
    return ['', `newmtl ${id}`, `Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`, `Ks ${spec.r.toFixed(4)} ${spec.g.toFixed(4)} ${spec.b.toFixed(4)}`,
      `Ke ${e.r.toFixed(4)} ${e.g.toFixed(4)} ${e.b.toFixed(4)}`, `Ns ${Math.min(ns, 1000)}`, `d ${(material.opacity ?? 1).toFixed(3)}`, 'illum 2',
      `Pr ${roughness.toFixed(3)}`, `Pm ${(material.metalness ?? 0).toFixed(3)}`];
  }), ''].join('\n');
  return { obj, mtl };
}

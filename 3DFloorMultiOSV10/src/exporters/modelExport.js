import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

/** @typedef {{ id: string, ext: string, mime: string, kind: 'image' | 'model', labelKey: string, hintKey: string }} ExportFormat */

/** @type {ExportFormat[]} */
export const EXPORT_FORMATS = [
  {
    id: 'glb',
    ext: 'glb',
    mime: 'model/gltf-binary',
    kind: 'model',
    labelKey: 'saveDialog.fmtGlb',
    hintKey: 'saveDialog.hintGlb',
  },
  {
    id: 'gltf',
    ext: 'gltf',
    mime: 'model/gltf+json',
    kind: 'model',
    labelKey: 'saveDialog.fmtGltf',
    hintKey: 'saveDialog.hintGltf',
  },
  {
    id: 'obj',
    ext: 'obj',
    mime: 'model/obj',
    kind: 'model',
    labelKey: 'saveDialog.fmtObj',
    hintKey: 'saveDialog.hintObj',
  },
  {
    id: 'stl',
    ext: 'stl',
    mime: 'model/stl',
    kind: 'model',
    labelKey: 'saveDialog.fmtStl',
    hintKey: 'saveDialog.hintStl',
  },
  {
    id: 'ply',
    ext: 'ply',
    mime: 'application/octet-stream',
    kind: 'model',
    labelKey: 'saveDialog.fmtPly',
    hintKey: 'saveDialog.hintPly',
  },
  {
    id: 'usdz',
    ext: 'usdz',
    mime: 'model/vnd.usdz+zip',
    kind: 'model',
    labelKey: 'saveDialog.fmtUsdz',
    hintKey: 'saveDialog.hintUsdz',
  },
  {
    id: 'png',
    ext: 'png',
    mime: 'image/png',
    kind: 'image',
    labelKey: 'saveDialog.fmtPng',
    hintKey: 'saveDialog.hintPng',
  },
];

export function getExportFormat(id) {
  return EXPORT_FORMATS.find((f) => f.id === id) || null;
}

/**
 * @param {import('three').Object3D} object
 * @param {string} formatId
 * @returns {Promise<{ format: ExportFormat, bytes?: ArrayBuffer | Uint8Array, text?: string, dataUrl?: string }>}
 */
export async function exportObject(object, formatId) {
  const format = getExportFormat(formatId);
  if (!format) throw new Error(`Unsupported export format: ${formatId}`);
  if (!object) throw new Error('Nothing to export');

  object.updateMatrixWorld(true);

  switch (format.id) {
    case 'glb': {
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(object, {
        binary: true,
        onlyVisible: true,
      });
      const bytes = result instanceof ArrayBuffer ? result : await blobToArrayBuffer(result);
      return { format, bytes };
    }
    case 'gltf': {
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(object, {
        binary: false,
        onlyVisible: true,
      });
      const text = `${JSON.stringify(result, null, 2)}\n`;
      return { format, text };
    }
    case 'obj': {
      const text = new OBJExporter().parse(object);
      return { format, text };
    }
    case 'stl': {
      const result = new STLExporter().parse(object, { binary: true });
      const bytes = result instanceof ArrayBuffer
        ? result
        : result?.buffer
          ? result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
          : result;
      return { format, bytes };
    }
    case 'ply': {
      const exporter = new PLYExporter();
      const bytes = await new Promise((resolve, reject) => {
        let settled = false;
        const done = (out) => {
          if (settled) return;
          settled = true;
          resolve(out);
        };
        try {
          const result = exporter.parse(object, done, { binary: true });
          if (result != null) done(result);
        } catch (err) {
          if (!settled) reject(err);
        }
      });
      return { format, bytes };
    }
    case 'usdz': {
      const bytes = await new USDZExporter().parseAsync(object);
      return { format, bytes };
    }
    default:
      throw new Error(`Format ${format.id} must be handled by the caller`);
  }
}

function blobToArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return Promise.resolve(value);
  if (value instanceof Uint8Array) {
    return Promise.resolve(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return value.arrayBuffer();
  }
  return Promise.resolve(value);
}

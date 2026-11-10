// .msk project files: a ZIP with project.json, a thumbnail and the bytes of the
// user's imported models (assets/<id>.<ext>), so a project travels as one file.
// fflate keeps it fast; models (already compressed GLB) are stored, not deflated.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { normalizeProject } from './document.js';
import { isModelFileName } from '../io/formats.js';

/** project + assets (Map id → Uint8Array) + optional PNG thumbnail → .msk bytes. */
export function packProject(project, assets = new Map(), thumbnail = null) {
  const files = {};
  const meta = { ...project, modified: new Date().toISOString() };
  files['project.json'] = [strToU8(JSON.stringify(meta)), { level: 6 }];
  if (thumbnail) files['thumbnail.png'] = [thumbnail, { level: 0 }];
  for (const [id, bytes] of assets) {
    const info = project.assets?.[id];
    if (!info) continue;
    files[`assets/${id}.${info.ext ?? 'glb'}`] = [bytes, { level: 0 }];
  }
  return zipSync(files);
}

/** .msk bytes → { project, assets: Map, thumbnail }. Also accepts a bare project.json. */
export function unpackProject(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // A JSON file (or a .msk saved as text by an old build).
  if (u8[0] === 0x7b) return { project: normalizeProject(JSON.parse(strFromU8(u8))), assets: new Map(), thumbnail: null };
  if (!(u8[0] === 0x50 && u8[1] === 0x4b)) throw Object.assign(new Error('not a MySketchBook file'), { code: 'bad-file' });
  const files = unzipSync(u8);
  if (!files['project.json']) throw Object.assign(new Error('project.json is missing'), { code: 'bad-file' });
  const project = normalizeProject(JSON.parse(strFromU8(files['project.json'])));
  const assets = new Map();
  for (const [name, data] of Object.entries(files)) {
    const m = name.match(/^assets\/([^/.]+)\.[a-z0-9]+$/i);
    if (m && project.assets[m[1]]) assets.set(m[1], data);
  }
  return { project, assets, thumbnail: files['thumbnail.png'] ?? null };
}

export const isProjectName = (name) => /\.msk$/i.test(name);
/** 3D model files (io/formats.js is the one list, so new formats are routed without changes here). */
export const isModelName = isModelFileName;

// Model files: .smdl (JSON text, or a zip with model.json inside), and the
// read-only import of .slx / .mdl files through core/compat/slx.js.
import { parseModel, serializeModel, modelNameOfPath, newModel } from './model.js';
import { zipRead } from '../lib/io/archive.js';
import { importSlx, importMdl } from '../compat/slx.js';
import { MError } from '../value.js';

const dec = (bytes) => new TextDecoder('utf-8').decode(bytes);
export const extOf = (p) => { const m = /\.([^./\\]+)$/.exec(String(p)); return m ? m[1].toLowerCase() : ''; };
export const MODEL_EXTS = ['smdl', 'slx', 'mdl'];

/** Absolute path (relative paths are taken from the current folder). */
export function absPath(fs, p) {
  const s = String(p).replace(/\\/g, '/');
  if (/^([A-Za-z]:)?\//.test(s)) return s;
  const cwd = fs && typeof fs.cwd === 'function' ? fs.cwd().replace(/\\/g, '/').replace(/\/$/, '') : '';
  return cwd ? `${cwd}/${s}` : s;
}

/** Finds the file of a model name or path: exact path, or name.smdl / .slx / .mdl in the current folder. */
export function findModelFile(fs, nameOrPath) {
  if (!fs) return null;
  const s = String(nameOrPath);
  const cands = extOf(s) && MODEL_EXTS.includes(extOf(s)) ? [s] : MODEL_EXTS.map((e) => `${s}.${e}`);
  for (const c of cands) { const p = absPath(fs, c); try { if (fs.exists(p)) return p; } catch { /* ignore */ } }
  return null;
}

/** Reads a model file → model (name from the file name). */
export function readModelFile(fs, path) {
  const name = modelNameOfPath(path);
  const ext = extOf(path);
  const bytes = fs.readBytes(path);
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (ext === 'slx') return importSlx(bytes, name);
  if (ext === 'mdl' && !isZip) return importMdl(dec(bytes), name);
  if (isZip) {
    const entries = zipRead(bytes);
    const e = entries.find((x) => /(^|\/)model\.json$/i.test(x.name));
    if (!e) {
      if (entries.some((x) => /blockdiagram\.xml$/i.test(x.name))) return importSlx(bytes, name);
      throw new MError('sim:file:format', `'${path}' is a zip file without model.json.`);
    }
    return parseModel(dec(e.data), name);
  }
  try { return parseModel(dec(bytes), name); } catch (e) { throw new MError('sim:file:format', `Cannot read model '${path}': ${e.message}`); }
}

/** Writes a model as .smdl JSON text. */
export function writeModelFile(fs, path, model) {
  if (extOf(path) && extOf(path) !== 'smdl') throw new MError('sim:file:format', `Models are saved as .smdl files (got '${path}').`);
  fs.writeText(path, serializeModel(model));
}

export { newModel, modelNameOfPath };

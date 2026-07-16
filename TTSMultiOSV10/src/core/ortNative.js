import path from 'node:path';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

/**
 * onnxruntime-node ships sibling DLLs (onnxruntime.dll, DirectML.dll, …).
 * On Windows, Electron Worker/main must see that folder on PATH or dlopen fails
 * with "The operating system cannot run %1".
 */
export function getOrtBindingDir() {
  try {
    const pkgJson = require.resolve('onnxruntime-node/package.json');
    const dir = path.join(path.dirname(pkgJson), 'bin', 'napi-v6', process.platform, process.arch);
    if (fs.existsSync(path.join(dir, 'onnxruntime_binding.node'))) return dir;
  } catch {
    /* continue */
  }
  try {
    const binding = require.resolve(
      `onnxruntime-node/bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`,
    );
    return path.dirname(binding);
  } catch {
    return null;
  }
}

export function ensureOrtNativePath() {
  const bindingDir = getOrtBindingDir();
  if (!bindingDir) return null;

  if (process.platform === 'win32') {
    const cur = process.env.PATH || '';
    const norm = bindingDir.replace(/\//g, '\\').toLowerCase();
    const parts = cur.split(path.delimiter).map((p) => p.replace(/\//g, '\\').toLowerCase());
    if (!parts.includes(norm)) {
      process.env.PATH = `${bindingDir}${path.delimiter}${cur}`;
    }
  } else {
    // Help dynamic linker find sibling shared libs next to the .node binary.
    const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
    const cur = process.env[key] || '';
    if (!cur.split(path.delimiter).includes(bindingDir)) {
      process.env[key] = cur ? `${bindingDir}${path.delimiter}${cur}` : bindingDir;
    }
  }
  return bindingDir;
}

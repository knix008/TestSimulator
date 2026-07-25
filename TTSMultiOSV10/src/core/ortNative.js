import path from 'node:path';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

function prependPathEnv(dir) {
  if (!dir) return null;
  if (process.platform === 'win32') {
    const cur = process.env.PATH || '';
    const norm = dir.replace(/\//g, '\\').toLowerCase();
    const parts = cur.split(path.delimiter).map((p) => p.replace(/\//g, '\\').toLowerCase());
    if (!parts.includes(norm)) {
      process.env.PATH = `${dir}${path.delimiter}${cur}`;
    }
  } else {
    const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
    const cur = process.env[key] || '';
    if (!cur.split(path.delimiter).includes(dir)) {
      process.env[key] = cur ? `${dir}${path.delimiter}${cur}` : dir;
    }
  }
  return dir;
}

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

/** Directory containing sherpa-onnx.node + its onnxruntime.dll / c-api DLLs. */
export function getSherpaNativeDir() {
  const platform = process.platform === 'win32' ? 'win' : process.platform;
  const pkgName = `sherpa-onnx-${platform}-${process.arch}`;
  try {
    const pkgJson = require.resolve(`${pkgName}/package.json`);
    const dir = path.dirname(pkgJson);
    if (fs.existsSync(path.join(dir, 'sherpa-onnx.node'))) return dir;
  } catch {
    /* continue */
  }
  try {
    const nodePath = require.resolve(`${pkgName}/sherpa-onnx.node`);
    return path.dirname(nodePath);
  } catch {
    return null;
  }
}

export function ensureOrtNativePath() {
  return prependPathEnv(getOrtBindingDir());
}

/**
 * Prefer sherpa's own onnxruntime.dll over onnxruntime-node's — they are
 * different builds and mixing them can abort OfflineTts construction.
 */
export function ensureSherpaNativePath() {
  return prependPathEnv(getSherpaNativeDir());
}

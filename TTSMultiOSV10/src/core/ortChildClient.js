import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const workerPath = path.join(__dirname, 'ortChildWorker.mjs');

let child = null;
let nextId = 1;
const pending = new Map();
let readyPromise = null;

function resolveNodeExecPath() {
  // Prefer real Node.js — Electron cannot load onnxruntime_binding.node on this host.
  if (!process.versions.electron) return process.execPath;
  const candidates = [
    process.env.npm_node_execpath,
    process.env.NODE_EXE,
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch { /* continue */ }
  }
  return 'node';
}

function rejectAll(error) {
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
}

function ensureChild() {
  if (child && !child.killed && readyPromise) return readyPromise;

  const execPath = resolveNodeExecPath();
  console.log(`[TTS] ORT child Node: ${execPath}`);

  readyPromise = new Promise((resolve, reject) => {
    let settled = false;
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ASAR;
    delete env.ELECTRON_PRESERVE_SYMLINKS;

    child = fork(workerPath, [], {
      execPath,
      execArgv: [],
      // Advanced serialization keeps Buffer/TypedArray binary (not JSON number[]).
      serialization: 'advanced',
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env,
      cwd: path.resolve(__dirname, '..', '..'),
    });

    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(true);
    };

    child.on('message', (msg) => {
      if (msg?.type === 'ready' && msg.ok) {
        console.log('[TTS] ORT child ready');
        finish(null);
        return;
      }
      const entry = pending.get(msg?.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg);
      else entry.reject(new Error(msg.error || 'ORT child failed'));
    });

    child.on('error', (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      rejectAll(err);
      child = null;
      readyPromise = null;
      finish(err);
    });

    child.on('exit', (code) => {
      const err = new Error(`ORT child exited with code ${code}`);
      rejectAll(err);
      child = null;
      readyPromise = null;
      if (!settled) finish(err);
    });

    child.stderr?.on('data', (buf) => {
      const text = buf.toString().trim();
      if (text) console.warn(`[ORT child] ${text}`);
    });
  });

  return readyPromise;
}

function callChild(type, payload = {}) {
  const id = nextId++;
  return ensureChild().then(() => new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      child.send({ id, type, ...payload });
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }));
}

export function isElectronProcess() {
  return Boolean(process.versions.electron);
}

export async function canLoadOrtInProcess() {
  try {
    const { ensureOrtNativePath } = await import('./ortNative.js');
    ensureOrtNativePath();
    const ort = require('onnxruntime-node');
    return Boolean(ort?.InferenceSession);
  } catch {
    return false;
  }
}

/** Proxy Tensor — matches onnxruntime-node Tensor shape used by ttsService. */
export class ProxyTensor {
  constructor(type, data, dims) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

function toBuffer(typed) {
  if (Buffer.isBuffer(typed)) return typed;
  if (ArrayBuffer.isView(typed)) {
    return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  }
  return null;
}

function serializeFeeds(feeds) {
  const out = {};
  for (const [name, tensor] of Object.entries(feeds || {})) {
    const buf = toBuffer(tensor.data);
    if (buf && tensor.type !== 'int64') {
      // Binary path for float/int32 tensors (style, speed, audio inputs).
      out[name] = { type: tensor.type, dims: tensor.dims, data: buf };
      continue;
    }
    if (buf && tensor.type === 'int64') {
      out[name] = { type: tensor.type, dims: tensor.dims, data: buf };
      continue;
    }
    // Fallback for plain arrays
    out[name] = {
      type: tensor.type,
      dims: tensor.dims,
      data: tensor.type === 'int64'
        ? Array.from(tensor.data, (v) => (typeof v === 'bigint' ? v.toString() : String(v)))
        : Array.from(tensor.data),
    };
  }
  return out;
}

function bufferToTyped(type, data) {
  const buf = Buffer.isBuffer(data)
    ? data
    : (ArrayBuffer.isView(data)
      ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : null);

  if (buf) {
    // Copy to a freshly allocated Buffer so byteOffset is 0 (8-byte aligned).
    const copy = Buffer.allocUnsafe(buf.byteLength);
    buf.copy(copy);
    if (type === 'int64') {
      return new BigInt64Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 8));
    }
    if (type === 'float64') {
      return new Float64Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 8));
    }
    if (type === 'int32') {
      return new Int32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4));
    }
    return new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4));
  }

  if (type === 'int64') return BigInt64Array.from(data.map((v) => BigInt(v)));
  if (type === 'float64') return Float64Array.from(data);
  return Float32Array.from(data);
}

function deserializeOutputs(outputs) {
  const results = {};
  for (const [name, tensor] of Object.entries(outputs || {})) {
    results[name] = {
      type: tensor.type,
      dims: tensor.dims,
      data: bufferToTyped(tensor.type, tensor.data),
    };
  }
  return results;
}

export async function createChildOrtSession(cacheKey, onnxPath, options = {}) {
  const cores = os.cpus()?.length || 4;
  const preferDml = Array.isArray(options.executionProviders)
    && options.executionProviders.includes('dml');

  const created = await callChild('sessionCreate', {
    key: cacheKey,
    modelPath: onnxPath,
    options: {
      graphOptimizationLevel: 'extended',
      executionProviders: preferDml ? ['dml', 'cpu'] : ['cpu'],
      ...(preferDml
        ? { enableMemPattern: false, executionMode: 'sequential' }
        : {
          intraOpNumThreads: options.intraOpNumThreads
            ?? Math.min(8, Math.max(2, cores - 1)),
          interOpNumThreads: options.interOpNumThreads ?? 1,
        }),
    },
  });

  const session = {
    inputNames: created.inputNames || [],
    outputNames: created.outputNames || [],
    async run(feeds) {
      const result = await callChild('sessionRun', {
        key: cacheKey,
        feeds: serializeFeeds(feeds),
      });
      if (Number.isFinite(result.inferMs)) {
        console.log(`[TTS] ORT child infer=${result.inferMs}ms`);
      }
      return deserializeOutputs(result.outputs);
    },
  };

  return {
    session,
    ort: { Tensor: ProxyTensor },
    backend: 'node-child',
    usedGpu: Boolean(preferDml),
  };
}

export async function pingOrtChild() {
  return callChild('ping');
}

export async function terminateOrtChild() {
  if (!child) return;
  const current = child;
  child = null;
  readyPromise = null;
  rejectAll(new Error('ORT child terminated'));
  current.kill();
}

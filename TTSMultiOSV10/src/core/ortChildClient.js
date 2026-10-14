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
let childGeneration = 0;

function normalizeExecCandidate(value) {
  if (!value) return '';
  return String(value).trim().replace(/^"|"$/g, '');
}

function resolveNodeExecSpec() {
  if (!process.versions.electron) {
    return { execPath: process.execPath, runAsNode: false };
  }

  // In packaged apps, prefer Electron's own executable in Node mode so .asar imports work.
  const useElectronByDefault = { execPath: process.execPath, runAsNode: true };
  const override = normalizeExecCandidate(
    process.env.ORT_NODE_EXEC_PATH || process.env.npm_node_execpath || process.env.NODE_EXE,
  );

  if (!override) return useElectronByDefault;
  if (override === 'node') return { execPath: 'node', runAsNode: false };

  try {
    if (fs.existsSync(override)) {
      return { execPath: override, runAsNode: false };
    }
  } catch {
    // ignore and keep safe default
  }

  return useElectronByDefault;
}

function rejectAll(error) {
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
}

function ensureChild() {
  if (child && !child.killed && readyPromise) return readyPromise;

  const { execPath, runAsNode } = resolveNodeExecSpec();
  console.log(`[TTS] ORT child Node: ${execPath}${runAsNode ? ' (run-as-node)' : ''}`);

  readyPromise = new Promise((resolve, reject) => {
    let settled = false;
    const env = { ...process.env };
    if (runAsNode) {
      env.ELECTRON_RUN_AS_NODE = '1';
    } else {
      delete env.ELECTRON_RUN_AS_NODE;
    }
    delete env.ELECTRON_NO_ASAR;
    delete env.ELECTRON_PRESERVE_SYMLINKS;

    childGeneration += 1;
    child = fork(workerPath, [], {
      execPath,
      execArgv: [],
      // Advanced serialization keeps Buffer/TypedArray binary (not JSON number[]).
      serialization: 'advanced',
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env,
      cwd: process.cwd(),
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

    let stderrTail = '';
    const current = child;
    child.on('exit', (code, signal) => {
      const err = new Error(
        `음성 엔진(ONNX Runtime) 프로세스가 비정상 종료되었습니다 `
        + `(종료 코드 ${code ?? '-'}${signal ? `, 시그널 ${signal}` : ''}).\n`
        + `모델 파일이 손상되었을 수 있습니다. 모델을 삭제한 뒤 다시 다운로드하세요.`
        + (stderrTail.trim() ? `\n\n엔진 출력:\n${stderrTail.trim()}` : ''),
      );
      console.error('[ORT child]', err.message);
      rejectAll(err);
      if (child === current) {
        child = null;
        readyPromise = null;
      }
      if (!settled) finish(err);
    });

    child.stderr?.on('data', (buf) => {
      const text = buf.toString().trim();
      if (!text) return;
      console.warn(`[ORT child] ${text}`);
      stderrTail = `${stderrTail}\n${text}`.slice(-4000);
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

  const createPayload = {
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
  };
  const created = await callChild('sessionCreate', createPayload);
  let sessionGeneration = childGeneration;

  const session = {
    inputNames: created.inputNames || [],
    outputNames: created.outputNames || [],
    async run(feeds) {
      if (sessionGeneration !== childGeneration || !child) {
        // Child was restarted after a crash: its sessions are gone, recreate this one.
        await callChild('sessionCreate', createPayload);
        sessionGeneration = childGeneration;
      }
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

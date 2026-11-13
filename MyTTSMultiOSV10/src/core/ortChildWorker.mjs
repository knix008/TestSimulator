/**
 * System-Node ORT worker.
 * Electron cannot load onnxruntime_binding.node on this machine ("cannot run %1"),
 * so inference runs in a plain Node.js child where the native addon works.
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ensureDllPath() {
  try {
    const pkg = path.dirname(require.resolve('onnxruntime-node/package.json'));
    const dir = path.join(pkg, 'bin', 'napi-v6', process.platform, process.arch);
    if (process.platform === 'win32') {
      process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ''}`;
    }
  } catch {
    /* ignore */
  }
}

ensureDllPath();
const ort = require('onnxruntime-node');
const sessions = new Map();

function toTypedData(type, data) {
  if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) {
    // IPC buffers often have non-aligned byteOffset; copy so TypedArray ctor is happy.
    const src = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const copy = Buffer.allocUnsafe(src.byteLength);
    src.copy(copy);
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
  if (type === 'int64') {
    return BigInt64Array.from(data.map((v) => BigInt(v)));
  }
  if (type === 'int32') {
    return Int32Array.from(data);
  }
  if (type === 'float64') {
    return Float64Array.from(data);
  }
  return Float32Array.from(data);
}

function typedToBuffer(typed) {
  return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
}

async function handleMessage(msg) {
  const { id, type } = msg || {};
  try {
    if (type === 'ping') {
      return { id, ok: true, versions: ort.env?.versions || null };
    }

    if (type === 'sessionCreate') {
      const { key, modelPath, options } = msg;
      if (sessions.has(key)) {
        try { await sessions.get(key).session.release?.(); } catch { /* ignore */ }
        sessions.delete(key);
      }
      const cores = os.cpus()?.length || 4;
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        // 'all' crashes Kokoro q8f16 on this host; extended is safe + faster than disabled.
        graphOptimizationLevel: 'extended',
        intraOpNumThreads: Math.min(8, Math.max(2, cores - 1)),
        interOpNumThreads: 1,
        ...(options || {}),
        executionProviders: options?.executionProviders || ['cpu'],
      });
      sessions.set(key, { session });
      return {
        id,
        ok: true,
        inputNames: session.inputNames,
        outputNames: session.outputNames,
      };
    }

    if (type === 'sessionRun') {
      const t0 = performance.now();
      const entry = sessions.get(msg.key);
      if (!entry) throw new Error(`ORT session not found: ${msg.key}`);
      const feeds = {};
      for (const [name, tensor] of Object.entries(msg.feeds || {})) {
        feeds[name] = new ort.Tensor(
          tensor.type,
          toTypedData(tensor.type, tensor.data),
          tensor.dims,
        );
      }
      const results = await entry.session.run(feeds);
      const t1 = performance.now();
      const outputs = {};
      for (const name of entry.session.outputNames) {
        const t = results[name];
        // Send binary Buffer (advanced serialization) — vastly faster than JSON number[].
        outputs[name] = {
          type: t.type,
          dims: t.dims,
          data: typedToBuffer(t.data),
        };
      }
      return {
        id,
        ok: true,
        outputs,
        inferMs: Math.round(t1 - t0),
      };
    }

    if (type === 'sessionRelease') {
      const entry = sessions.get(msg.key);
      if (entry) {
        try { await entry.session.release?.(); } catch { /* ignore */ }
        sessions.delete(msg.key);
      }
      return { id, ok: true };
    }

    throw new Error(`Unknown ORT child message: ${type}`);
  } catch (error) {
    return {
      id,
      ok: false,
      error: error?.stack || error?.message || String(error),
    };
  }
}

if (!process.send) {
  console.error('[ortChildWorker] must be started via child_process.fork');
  process.exit(1);
}

process.on('message', async (msg) => {
  const result = await handleMessage(msg);
  process.send(result);
});

process.send({ type: 'ready', ok: true, cwd: __dirname });

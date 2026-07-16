/**
 * System-Node ORT worker.
 * Electron cannot load onnxruntime_binding.node on this machine ("cannot run %1"),
 * so inference runs in a plain Node.js child where the native addon works.
 */
import { createRequire } from 'node:module';
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

function fromTypedData(type, typed) {
  if (type === 'int64') {
    return Array.from(typed, (v) => v.toString());
  }
  return Array.from(typed);
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
      const session = await ort.InferenceSession.create(modelPath, options || {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'extended',
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
      const outputs = {};
      for (const name of entry.session.outputNames) {
        const t = results[name];
        outputs[name] = {
          type: t.type,
          dims: t.dims,
          data: fromTypedData(t.type, t.data),
        };
      }
      return { id, ok: true, outputs };
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

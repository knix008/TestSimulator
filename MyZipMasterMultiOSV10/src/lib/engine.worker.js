// The web build's engine: the Rust core as WebAssembly, off the page's thread so the window keeps
// responding. Files the page hands over become the engine's in-memory disk.
import init, * as engine from '../engine/zipmaster_wasm.js';

const ready = init();

const send = (message, transfer) => self.postMessage(message, transfer ?? []);

self.onmessage = async (e) => {
  const m = e.data;
  try {
    await ready;
    switch (m.kind) {
      case 'stage': {
        for (const { path, file } of m.files) {
          const data = new Uint8Array(await file.arrayBuffer());
          engine.put(path, data, Math.floor((file.lastModified || 0) / 1000) || -1);
        }
        send({ id: m.id, kind: 'done', value: true });
        break;
      }
      case 'forget': {
        for (const key of m.paths) engine.remove(key);
        send({ id: m.id, kind: 'done', value: true });
        break;
      }
      case 'call': {
        let last = 0;
        const progress = (done, total, name) => {
          const now = Date.now();
          if (now - last < 80 && done < total) return;
          last = now;
          send({ id: m.id, kind: 'progress', done, total, name });
        };
        const reply = engine.call(m.op, JSON.stringify(m.options), progress);
        send({ id: m.id, kind: 'done', value: JSON.parse(reply) });
        break;
      }
      case 'readEntry': {
        const bytes = engine.read_entry(JSON.stringify(m.options));
        send({ id: m.id, kind: 'done', value: bytes }, [bytes.buffer]);
        break;
      }
      case 'read': {
        const bytes = engine.read(m.path);
        if (!bytes) throw new Error(`${m.path}: not found`);
        send({ id: m.id, kind: 'done', value: bytes }, [bytes.buffer]);
        break;
      }
      case 'walk': {
        send({ id: m.id, kind: 'done', value: JSON.parse(engine.walk(m.path)) });
        break;
      }
      default:
        throw new Error(`unknown request ${m.kind}`);
    }
  } catch (err) {
    // read_entry throws its envelope as text; anything else is the engine dying.
    let parsed = null;
    try { parsed = JSON.parse(String(err)); } catch { /* a plain error */ }
    if (parsed?.code) send({ id: m.id, kind: 'error', code: parsed.code, detail: parsed.detail });
    else send({ id: m.id, kind: 'error', code: String(err).includes('memory') ? 'memory' : 'corrupt', detail: String(err?.message ?? err) });
  }
};

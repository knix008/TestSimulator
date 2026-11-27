// The Rust core (public/hexcore.wasm) in a worker of its own (web build): long work — hashing a big file, a search,
// a template — runs here while the page stays alive and shows its progress. Messages:
//   in:  { seq, type: 'call', method, args, op } · { seq, type: 'open', bytes (ArrayBuffer), name } · { seq, type: 'bytes', id, offset, length }
//   out: { seq, ok } | { seq, error } · { type: 'progress', op, done, total } (at most every 60 ms)
let wasm = null;
let currentOp = '';
let lastProgress = 0;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function load(url) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      hx_progress(done, total) {
        const now = performance.now();
        if (currentOp && (done >= total || now - lastProgress > 60)) {
          lastProgress = now;
          postMessage({ type: 'progress', op: currentOp, done, total });
        }
        return 1;
      },
    },
  });
  wasm = instance.exports;
}

const put = (bytes) => { const ptr = wasm.hx_alloc(bytes.length); new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes); return ptr; };
const take = (ptr) => { const len = wasm.hx_result_len(ptr); const out = new Uint8Array(wasm.memory.buffer, ptr, len).slice(); wasm.hx_free(ptr, len); return out; };

function call(method, args) {
  const bytes = encoder.encode(JSON.stringify({ method, args: args ?? null }));
  const ptr = put(bytes);
  const out = wasm.hx_call(ptr, bytes.length);
  wasm.hx_free(ptr, bytes.length);
  const reply = JSON.parse(decoder.decode(take(out)));
  if ('error' in reply) throw new Error(reply.error);
  return reply.ok;
}

let ready = null;
self.onmessage = async (event) => {
  const m = event.data;
  if (m.type === 'init') { ready = load(m.url).then(() => postMessage({ seq: m.seq, ok: true }), (error) => postMessage({ seq: m.seq, error: String(error?.message ?? error) })); return; }
  await ready;
  try {
    if (m.type === 'call') {
      currentOp = m.op ?? '';
      lastProgress = 0;
      const ok = call(m.method, m.args);
      currentOp = '';
      postMessage({ seq: m.seq, ok });
    } else if (m.type === 'open') {
      const bytes = new Uint8Array(m.bytes);
      const ptr = put(bytes);
      const nameBytes = encoder.encode(m.name);
      const namePtr = put(nameBytes);
      const id = wasm.hx_open(ptr, bytes.length, namePtr, nameBytes.length);
      wasm.hx_free(namePtr, nameBytes.length);
      postMessage({ seq: m.seq, ok: call('info', { id }) });
    } else if (m.type === 'bytes') {
      const ptr = wasm.hx_bytes(m.id, m.offset, m.length);
      if (!ptr) throw new Error('read failed');
      const out = take(ptr);
      postMessage({ seq: m.seq, ok: out.buffer }, [out.buffer]);
    }
  } catch (error) {
    currentOp = '';
    postMessage({ seq: m.seq, error: String(error?.message ?? error) });
  }
};

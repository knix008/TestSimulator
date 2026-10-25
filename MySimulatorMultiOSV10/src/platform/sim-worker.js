// Web Worker: runs the Rust engine compiled to WebAssembly (engine/sim-wasm,
// ABI in ARCHITECTURE.md "WASM ABI"). One study per message; the main thread
// terminates the worker to cancel.

let instance = null;
let loading = null;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function memoryBytes() {
  return new Uint8Array(instance.exports.memory.buffer);
}

function readString(ptr, len) {
  return decoder.decode(memoryBytes().subarray(ptr, ptr + len));
}

async function load(url) {
  if (instance) return instance;
  loading ??= (async () => {
    const imports = {
      env: {
        sm_progress(phasePtr, phaseLen, fraction, msgPtr, msgLen) {
          self.postMessage({ type: 'progress', progress: { phase: readString(phasePtr, phaseLen), fraction, message: readString(msgPtr, msgLen) } });
        },
        // Cancelling terminates the worker, so the engine never needs to ask.
        sm_cancelled: () => 0,
      },
    };
    const response = await fetch(url);
    if (!response.ok) throw new Error(`sim.wasm: HTTP ${response.status}`);
    const result = WebAssembly.instantiateStreaming && response.headers.get('content-type')?.includes('wasm')
      ? await WebAssembly.instantiateStreaming(response, imports)
      : await WebAssembly.instantiate(await response.arrayBuffer(), imports);
    instance = result.instance;
    return instance;
  })();
  return loading;
}

/** Calls an export that takes (ptr, len) of UTF-8 input and returns a length-prefixed buffer. */
function call(name, text) {
  const { exports } = instance;
  const input = encoder.encode(text);
  const ptr = exports.sm_alloc(input.length);
  memoryBytes().set(input, ptr);
  const out = exports[name](ptr, input.length);
  exports.sm_free(ptr, input.length);
  const view = new DataView(exports.memory.buffer);
  const length = view.getUint32(out, true);
  const bytes = memoryBytes().slice(out + 4, out + 4 + length);
  exports.sm_result_free(out);
  return bytes;
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    await load(message.wasmUrl);
    if (message.type === 'run') {
      const bytes = call('sm_run', message.model);
      self.postMessage({ type: 'result', bytes: bytes.buffer }, [bytes.buffer]);
    } else if (message.type === 'validate') {
      const bytes = call('sm_validate', message.model);
      self.postMessage({ type: 'validated', problems: JSON.parse(decoder.decode(bytes)) });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message ?? error) });
  }
};

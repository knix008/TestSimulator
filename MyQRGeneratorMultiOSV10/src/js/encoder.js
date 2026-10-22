// One encoder interface for both builds. The desktop app calls the Rust encoder natively
// (Tauri command `qr_encode`); the browser runs the same crate compiled to WebAssembly.
// Both return the JSON written by qrcore::encode_json.

export const ECC_LEVELS = ["L", "M", "Q", "H"];
export const ECC_RECOVERY = { L: 7, M: 15, Q: 25, H: 30 };

/** Encoding options as the Rust side takes them. */
export function encodeArgs({ ecc = "M", version = 0, mask = -1, boostEcc = true, eciUtf8 = false } = {}) {
  const level = Math.max(0, ECC_LEVELS.indexOf(ecc));
  const v = Number(version) || 0;
  return {
    ecc: level,
    minVersion: v || 1,
    maxVersion: v || 40,
    mask: Number.isInteger(Number(mask)) ? Number(mask) : -1,
    flags: (boostEcc ? 1 : 0) | (eciUtf8 ? 2 : 0),
  };
}

/** Turns the JSON into `{ ok, version, size, modules: Uint8Array, … }` or `{ ok: false, error, … }`. */
export function parseResult(json) {
  const result = JSON.parse(json);
  if (result.error) return { ok: false, ...result };
  const bits = result.modules;
  const modules = new Uint8Array(bits.length);
  for (let i = 0; i < bits.length; i += 1) modules[i] = bits.charCodeAt(i) === 49 ? 1 : 0;
  return { ok: true, ...result, modules };
}

/** Instantiates qrcore.wasm (see qrcore/src/wasm.rs) from bytes or a URL. */
export async function loadWasmEncoder(source) {
  const bytes = source instanceof ArrayBuffer || ArrayBuffer.isView(source) ? source : await (await fetch(source)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exports = instance.exports;
  const utf8 = new TextEncoder();
  const fromUtf8 = new TextDecoder();
  return (text, options) => {
    const a = encodeArgs(options);
    const input = utf8.encode(String(text ?? ""));
    const ptr = exports.qr_alloc(input.length);
    new Uint8Array(exports.memory.buffer, ptr, input.length).set(input);
    const len = exports.qr_encode(ptr, input.length, a.ecc, a.minVersion, a.maxVersion, a.mask, a.flags);
    exports.qr_free(ptr, input.length);
    // memory.buffer may have grown during the call, so the view is made afterwards.
    return parseResult(fromUtf8.decode(new Uint8Array(exports.memory.buffer, exports.qr_output_ptr(), len)));
  };
}

/** The encoder for this build: always async, resolves to a parsed result. */
export async function createEncoder() {
  const tauri = globalThis.__TAURI__;
  if (tauri?.core?.invoke) {
    return {
      backend: "rust-native",
      encode: async (text, options) => parseResult(await tauri.core.invoke("qr_encode", { text: String(text ?? ""), ...encodeArgs(options) })),
    };
  }
  const encode = await loadWasmEncoder(new URL("../wasm/qrcore.wasm", import.meta.url));
  return { backend: "rust-wasm", encode: async (text, options) => encode(text, options) };
}

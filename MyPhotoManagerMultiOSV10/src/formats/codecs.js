// WebAssembly decoders loaded on first use: JPEG 2000 (OpenJPEG, via
// @cornerstonejs/codec-openjpeg) and JPEG XL (libjxl, via @jsquash/jxl).
// Both return { width, height, data: Uint8ClampedArray (RGBA) } and run in the
// page and in Web Workers; they also run under Node (used by the unit tests).
//
// OpenJPEG: the package's `exports` map publishes "./decode" →
// dist/openjpegjs_decode.js, the decoder-only build with the wasm embedded as
// base64, so no separate .wasm file has to be served. Deep paths such as
// ".../dist/openjpegjs_decode.js" are blocked by that map; use the subpath.
//
// JPEG XL: @jsquash/jxl has no `exports` map. Its Emscripten glue finds
// jxl_dec.wasm with new URL('jxl_dec.wasm', import.meta.url), which breaks
// when Vite pre-bundles the dependency in dev, so the wasm URL is imported
// explicitly with Vite's "?url" suffix and the compiled module is handed to
// init(). Under Node the file is read from node_modules instead.

const isNode = typeof process === 'object' && !!process.versions?.node && typeof window === 'undefined' && typeof WorkerGlobalScope === 'undefined';

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

// ---------------------------------------------------------------- JPEG 2000

let openjpegReady = null;

function loadOpenJpeg() {
  openjpegReady ??= import('@cornerstonejs/codec-openjpeg/decode').then((mod) => {
    // CommonJS module: the factory is the default export (sometimes nested once more).
    const factory = typeof mod.default === 'function' ? mod.default : mod.default?.default ?? mod;
    return factory({ print() {}, printErr() {} });
  });
  openjpegReady.catch(() => { openjpegReady = null; });
  return openjpegReady;
}

/** JP2 file → its contiguous codestream ('jp2c' box); a bare J2K codestream is returned as is. */
export function jpeg2000Codestream(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0x4f) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  while (p + 8 <= bytes.length) {
    let size = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    let header = 8;
    if (size === 1) {
      if (p + 16 > bytes.length) break;
      size = view.getUint32(p + 8) * 2 ** 32 + view.getUint32(p + 12);
      header = 16;
    } else if (size === 0) {
      size = bytes.length - p;
    }
    if (size < header) break;
    if (type === 'jp2c') return bytes.subarray(p + header, Math.min(bytes.length, p + size));
    p += size;
  }
  throw new Error('no JPEG 2000 codestream found');
}

/** JPEG 2000 (.jp2 boxes or .j2k/.j2c codestream), 1–4 components, any bit depth ≤ 16 → RGBA 8-bit. */
export async function decodeJpeg2000(input) {
  const codestream = jpeg2000Codestream(toBytes(input));
  const openjpeg = await loadOpenJpeg();
  const decoder = new openjpeg.J2KDecoder();
  try {
    decoder.getEncodedBuffer(codestream.length).set(codestream);
    decoder.decode();
    const { width, height, bitsPerSample, componentCount, isSigned } = decoder.getFrameInfo();
    const decoded = decoder.getDecodedBuffer(); // a view into wasm memory: read before delete()
    const total = width * height;
    const samples = bitsPerSample > 8
      ? new (isSigned ? Int16Array : Uint16Array)(decoded.buffer, decoded.byteOffset, total * componentCount)
      : isSigned ? new Int8Array(decoded.buffer, decoded.byteOffset, total * componentCount) : decoded;
    const offset = isSigned ? 2 ** (bitsPerSample - 1) : 0;
    const max = 2 ** bitsPerSample - 1;
    const scale = (v) => Math.round(((v + offset) * 255) / max);
    const data = new Uint8ClampedArray(total * 4);
    const n = componentCount;
    for (let i = 0; i < total; i++) {
      const s = i * n;
      const o = i * 4;
      if (n >= 3) {
        data[o] = scale(samples[s]); data[o + 1] = scale(samples[s + 1]); data[o + 2] = scale(samples[s + 2]);
        data[o + 3] = n >= 4 ? scale(samples[s + 3]) : 255;
      } else {
        data[o] = data[o + 1] = data[o + 2] = scale(samples[s]);
        data[o + 3] = n === 2 ? scale(samples[s + 1]) : 255;
      }
    }
    return { width, height, data };
  } finally {
    decoder.delete?.();
  }
}

// ---------------------------------------------------------------- JPEG XL

let jxlReady = null;

async function jxlWasmModule() {
  if (isNode) {
    const fsName = 'node:fs/promises';
    const { readFile } = await import(/* @vite-ignore */ fsName);
    return WebAssembly.compile(await readFile(new URL(import.meta.resolve('@jsquash/jxl/codec/dec/jxl_dec.wasm'))));
  }
  const { default: url } = await import('@jsquash/jxl/codec/dec/jxl_dec.wasm?url');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`cannot load the JPEG XL decoder (${response.status})`);
  return WebAssembly.compile(await response.arrayBuffer());
}

function loadJxl() {
  jxlReady ??= (async () => {
    const [{ default: decode, init }, wasm] = await Promise.all([import('@jsquash/jxl/decode.js'), jxlWasmModule()]);
    await init(wasm);
    return decode;
  })();
  jxlReady.catch(() => { jxlReady = null; });
  return jxlReady;
}

/** JPEG XL (.jxl) → RGBA 8-bit. */
export async function decodeJxl(input) {
  const bytes = toBytes(input);
  // The decoder constructs ImageData; Node has none, so provide a plain stand-in.
  globalThis.ImageData ??= class ImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
  };
  const decode = await loadJxl();
  const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
  const image = await decode(buffer);
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }; // copy: may view wasm memory
}

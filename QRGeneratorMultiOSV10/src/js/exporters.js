// Export formats. Raster files are encoded by the Rust crate qrimage (natively in the
// desktop app, as WebAssembly in the browser); vector files are written here from the same
// paths the preview draws (see vector.js).

export const FORMATS = [
  { id: "png", kind: "raster", ext: "png", mime: "image/png", wasmId: 0 },
  { id: "jpeg", kind: "raster", ext: "jpg", mime: "image/jpeg", wasmId: 1, quality: true, opaque: true },
  { id: "webp", kind: "raster", ext: "webp", mime: "image/webp", wasmId: 2 },
  { id: "gif", kind: "raster", ext: "gif", mime: "image/gif", wasmId: 4 },
  { id: "bmp", kind: "raster", ext: "bmp", mime: "image/bmp", wasmId: 3 },
  { id: "tiff", kind: "raster", ext: "tif", mime: "image/tiff", wasmId: 5 },
  { id: "ico", kind: "raster", ext: "ico", mime: "image/x-icon", wasmId: 6, maxSize: 256 },
  { id: "svg", kind: "vector", ext: "svg", mime: "image/svg+xml" },
  { id: "pdf", kind: "vector", ext: "pdf", mime: "application/pdf", print: true },
  { id: "eps", kind: "vector", ext: "eps", mime: "application/postscript", print: true },
];

export const formatById = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];

/** 0xRRGGBB from "#rrggbb". */
export function hexToInt(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
}

/** Instantiates qrimage.wasm (qrimage/src/wasm.rs). Returns encode(rgba, w, h, formatId, quality, bg). */
export async function loadWasmImageEncoder(source) {
  const bytes = source instanceof ArrayBuffer || ArrayBuffer.isView(source) ? source : await (await fetch(source)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports;
  return (rgba, width, height, format, quality = 92, background = 0xffffff) => {
    const f = typeof format === "string" ? formatById(format) : format;
    const ptr = ex.qri_alloc(rgba.length);
    new Uint8Array(ex.memory.buffer, ptr, rgba.length).set(rgba);
    const len = ex.qri_encode(ptr, rgba.length, width, height, f.wasmId, quality, background);
    ex.qri_free(ptr, rgba.length);
    const out = new Uint8Array(ex.memory.buffer, ex.qri_output_ptr(), Math.abs(len)).slice();
    if (len < 0) throw new Error(new TextDecoder().decode(out));
    return out;
  };
}

let wasmEncoder;
/** The browser build's raster encoder, loaded the first time it is needed. */
export function wasmImageEncoder() {
  wasmEncoder ??= loadWasmImageEncoder(new URL("../wasm/qrimage.wasm", import.meta.url));
  return wasmEncoder;
}

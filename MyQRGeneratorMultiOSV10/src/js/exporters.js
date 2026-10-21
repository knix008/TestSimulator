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

function wasmBytes(ex, ptr) {
  return new Uint8Array(ex.memory.buffer, ptr);
}

function wasmResult(ex, len) {
  const out = new Uint8Array(ex.memory.buffer, ex.qri_output_ptr(), Math.abs(len)).slice();
  if (len < 0) throw new Error(new TextDecoder().decode(out));
  return out;
}

/** Instantiates qrimage.wasm (qrimage/src/wasm.rs). Returns encode(rgba, w, h, formatId, quality, bg). The function also has decode(fileBytes) → { width, height, rgba }. */
export async function loadWasmImageEncoder(source) {
  const bytes = source instanceof ArrayBuffer || ArrayBuffer.isView(source) ? source : await (await fetch(source)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports;
  const encode = (rgba, width, height, format, quality = 92, background = 0xffffff) => {
    const f = typeof format === "string" ? formatById(format) : format;
    const ptr = ex.qri_alloc(rgba.length);
    wasmBytes(ex, ptr).set(rgba);
    const len = ex.qri_encode(ptr, rgba.length, width, height, f.wasmId, quality, background);
    ex.qri_free(ptr, rgba.length);
    return wasmResult(ex, len);
  };
  // PNG, JPEG, GIF, WebP, BMP, ICO and TIFF. AVIF and SVG are decoded by the browser.
  encode.decode = (fileBytes) => {
    const ptr = ex.qri_alloc(fileBytes.length);
    wasmBytes(ex, ptr).set(fileBytes);
    const len = ex.qri_decode(ptr, fileBytes.length);
    ex.qri_free(ptr, fileBytes.length);
    const out = wasmResult(ex, len);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    const rgba = out.subarray(8);
    if (!width || !height || rgba.length !== width * height * 4) throw new Error("image");
    return { width, height, rgba };
  };
  return encode;
}

let wasmEncoder;
/** The browser build's raster encoder, loaded the first time it is needed. */
export function wasmImageEncoder() {
  wasmEncoder ??= loadWasmImageEncoder(new URL("../wasm/qrimage.wasm", import.meta.url));
  return wasmEncoder;
}

/** Same module as the encoder. Decodes logo files the browser cannot (TIFF, and odd BMP/ICO). */
export function wasmImageDecoder() {
  return wasmImageEncoder().then((encode) => encode.decode);
}

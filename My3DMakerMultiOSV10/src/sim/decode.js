// The solver's result container (crates/sim-core/src/out.rs):
//   "SIM1" · u32 JSON length · JSON (padded to 4 bytes) · binary blobs
// Arrays inside the JSON are references {"$f32": offset, "n": count} / {"$u32": …} into the blobs;
// decode() replaces them with typed-array views (no copy).

export function decodeResult(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.length < 8 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'SIM1') throw new Error('result.badContainer');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(4, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n)));
  // Blob views need 4-byte alignment: copy once if the buffer is not aligned.
  let base = bytes.byteOffset + 8 + n;
  let buf = bytes.buffer;
  if (base % 4 !== 0) { const copy = bytes.slice(8 + n); buf = copy.buffer; base = 0; }
  const resolve = (v) => {
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object') {
      if ('$f32' in v) return new Float32Array(buf, base + v.$f32, v.n);
      if ('$u32' in v) return new Uint32Array(buf, base + v.$u32, v.n);
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = resolve(x);
      return o;
    }
    return v;
  };
  return resolve(json);
}

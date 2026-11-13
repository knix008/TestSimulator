// PCM over the line protocol: base64 of the Float32 samples (4 bytes each, little-endian).
// tauri-bridge.js does the same in the page.

export function encodeAudio(samples) {
  const f32 = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64');
}

/** `{ audioBase64 }` (Tauri page) or `{ audioBuffer: number[] }` (older callers) → Float32Array. */
export function decodeAudio(payload) {
  if (typeof payload?.audioBase64 === 'string') {
    const bytes = Buffer.from(payload.audioBase64, 'base64');
    // A fresh buffer: the decoded one may start at an offset that is not a multiple of 4.
    const copy = new ArrayBuffer(bytes.byteLength - (bytes.byteLength % 4));
    new Uint8Array(copy).set(bytes.subarray(0, copy.byteLength));
    return new Float32Array(copy);
  }
  return Float32Array.from(payload?.audioBuffer || []);
}

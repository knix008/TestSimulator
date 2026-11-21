// WAV files (CONTRACT: pure). Writes 16-, 24-bit or 32-bit float PCM from channel arrays (an
// AudioBuffer's channels), optionally normalised; reads WAV back (tests, and imported guide tracks).

/** Channel data → WAV bytes. channels: [Float32Array …]; bits: 16 | 24 | 32 (float). */
export function encodeWav(channels, sampleRate, { bits = 16, normalize = false, peakDb = -1 } = {}) {
  const n = channels.length;
  const frames = channels[0]?.length ?? 0;
  let gain = 1;
  if (normalize) {
    let peak = 0;
    for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    if (peak > 0) gain = 10 ** (peakDb / 20) / peak;
  }
  const float = bits === 32;
  const bytesPer = bits / 8;
  const dataSize = frames * n * bytesPer;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const text = (at, s) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, float ? 3 : 1, true); view.setUint16(22, n, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * n * bytesPer, true); view.setUint16(32, n * bytesPer, true); view.setUint16(34, bits, true);
  text(36, 'data'); view.setUint32(40, dataSize, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] * gain));
      if (float) { view.setFloat32(at, s, true); at += 4; }
      else if (bits === 24) { const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); view.setUint8(at, v & 0xff); view.setUint8(at + 1, (v >> 8) & 0xff); view.setUint8(at + 2, (v >> 16) & 0xff); at += 3; }
      else { view.setInt16(at, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true); at += 2; }
    }
  }
  return out;
}

/** An AudioBuffer → WAV bytes. */
export const audioBufferToWav = (buffer, options) => encodeWav(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), buffer.sampleRate, options);

/** WAV bytes → { sampleRate, channels: [Float32Array], bits }. */
export function decodeWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let at = 12;
  let fmt = null;
  while (at + 8 <= bytes.length) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') fmt = { format: view.getUint16(at + 8, true), channels: view.getUint16(at + 10, true), sampleRate: view.getUint32(at + 12, true), bits: view.getUint16(at + 22, true) };
    if (id === 'data' && fmt) {
      const bytesPer = fmt.bits / 8;
      const frames = Math.floor(size / (bytesPer * fmt.channels));
      const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
      let p = at + 8;
      for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) {
        let v;
        if (fmt.format === 3) v = view.getFloat32(p, true);
        else if (fmt.bits === 24) { let x = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16); if (x & 0x800000) x |= ~0xffffff; v = x / 0x800000; }
        else if (fmt.bits === 8) v = (bytes[p] - 128) / 128;
        else v = view.getInt16(p, true) / 0x8000;
        channels[c][i] = v;
        p += bytesPer;
      }
      return { sampleRate: fmt.sampleRate, channels, bits: fmt.bits };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('WAV file has no audio data');
}

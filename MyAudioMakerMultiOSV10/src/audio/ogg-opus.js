// Ogg Opus → PCM in JavaScript (the sound library's samples), the same on every platform: older Safari / WKWebView
// and WebKitGTK cannot decode Opus with decodeAudioData. The Ogg pages are read here (a small demuxer, RFC 3533 /
// RFC 7845); the Opus packets are decoded by libopus compiled to WebAssembly (opus-decoder, MIT).
import { OpusDecoder } from 'opus-decoder';

const isOggPage = (b, p) => b[p] === 0x4f && b[p + 1] === 0x67 && b[p + 2] === 0x67 && b[p + 3] === 0x53;

/**
 * Splits an Ogg Opus file into its header values and audio packets:
 * { channels, preSkip, inputRate, packets: Uint8Array[], granule (last page's sample position, -1 unknown) }.
 */
export function readOggOpus(bytes) {
  const packets = [];
  let partial = [];
  let granule = -1;
  let pos = 0;
  while (pos + 27 <= bytes.length) {
    if (!isOggPage(bytes, pos)) throw new Error('Not an Ogg file');
    const segments = bytes[pos + 26];
    const view = new DataView(bytes.buffer, bytes.byteOffset + pos, 27);
    const lo = view.getUint32(6, true);
    const hi = view.getInt32(10, true);
    if (!(lo === 0xffffffff && hi === -1)) granule = hi * 4294967296 + lo;
    let data = pos + 27 + segments;
    if (data > bytes.length) throw new Error('Truncated Ogg page');
    for (let i = 0; i < segments; i++) {
      const lace = bytes[pos + 27 + i];
      if (data + lace > bytes.length) throw new Error('Truncated Ogg page');
      partial.push(bytes.subarray(data, data + lace));
      data += lace;
      if (lace < 255) { packets.push(join(partial)); partial = []; }
    }
    pos = data;
  }
  if (packets.length < 2) throw new Error('Not an Opus stream');
  const head = packets[0];
  if (String.fromCharCode(...head.subarray(0, 8)) !== 'OpusHead') throw new Error('Not an Opus stream');
  const hv = new DataView(head.buffer, head.byteOffset, head.length);
  const channels = head[9];
  if (head[18] !== 0 || channels < 1 || channels > 2) throw new Error('Only mono and stereo Opus are supported');
  return { channels, preSkip: hv.getUint16(10, true), inputRate: hv.getUint32(12, true), packets: packets.slice(2), granule };
}

function join(parts) {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const decoders = new Map();
let queue = Promise.resolve();

async function decoderFor(channels) {
  let decoder = decoders.get(channels);
  if (!decoder) {
    decoder = new OpusDecoder({ channels, streamCount: 1, coupledStreamCount: channels === 2 ? 1 : 0, channelMappingTable: channels === 2 ? [0, 1] : [0], preSkip: 0 });
    decoders.set(channels, decoder);
  }
  await decoder.ready;
  return decoder;
}

/**
 * Decodes an Ogg Opus file: { channelData: Float32Array[], sampleRate: 48000, length }. The encoder's pre-skip and
 * end padding are removed, so sample positions (loop points) match the source exactly. Calls run one at a time.
 */
export function decodeOggOpus(bytes) {
  const job = queue.then(async () => {
    const { channels, preSkip, packets, granule } = readOggOpus(bytes);
    const decoder = await decoderFor(channels);
    await decoder.reset();
    const out = decoder.decodeFrames(packets);
    if (out.errors?.length) throw new Error(`Opus decoding failed: ${out.errors[0].message}`);
    const length = Math.max(0, Math.min(out.samplesDecoded - preSkip, granule >= 0 ? granule - preSkip : Infinity));
    const channelData = out.channelData.slice(0, channels).map((ch) => ch.slice(preSkip, preSkip + length));
    return { channelData, sampleRate: out.sampleRate ?? 48000, length };
  });
  queue = job.catch(() => {});
  return job;
}

// Video containers, written by hand so that they work the same everywhere: MP4 around H.264 or VP9 chunks from the browser's encoder, and AVI around
// JPEG pictures, which need no encoder at all. Both are plain bytes in, bytes out: no DOM, and tested in Node.

const utf8 = (s) => new TextEncoder().encode(s);

function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const u32 = (x) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x >>> 0); return b; };
const u16 = (x) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, x & 0xffff); return b; };
const u8 = (...x) => Uint8Array.from(x);
const zero = (n) => new Uint8Array(n);
const box = (name, ...parts) => { const body = concat(parts); return concat([u32(body.length + 8), utf8(name), body]); };
const fullBox = (name, version, flags, ...parts) => box(name, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
const MATRIX = concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);

/**
 * One video track in an MP4 file.
 * `samples`: [{ data: Uint8Array, key: boolean }] in order. `codec`: 'avc1' with `description` (the avcC record), or 'vp09' with `description` (vpcC).
 */
export function muxMP4({ samples, width, height, fps, codec = 'avc1', description }) {
  const timescale = Math.round(fps) * 1000;
  const delta = 1000;
  const duration = samples.length * delta;
  const payload = concat(samples.map((s) => s.data));
  const ftyp = box('ftyp', utf8('isom'), u32(512), utf8('isomiso2'), utf8(codec === 'avc1' ? 'avc1' : 'vp09'), utf8('mp41'));
  const header = codec === 'avc1' ? box('avcC', description) : box('vpcC', u8(1, 0, 0, 0), description);
  const visual = box(codec,
    zero(6), u16(1), zero(16), u16(width), u16(height), u32(0x480000), u32(0x480000), u32(0), u16(1), zero(32), u16(0x18), u16(0xffff), header);
  const stsd = fullBox('stsd', 0, 0, u32(1), visual);
  const stts = fullBox('stts', 0, 0, u32(1), u32(samples.length), u32(delta));
  const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
  const stss = keys.length === samples.length ? null : fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32));
  const stsz = fullBox('stsz', 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length)));
  const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1));
  const build = (offset) => {
    const stco = fullBox('stco', 0, 0, u32(1), u32(offset));
    const stbl = box('stbl', ...[stsd, stts, stss, stsc, stsz, stco].filter(Boolean));
    const url = fullBox('url ', 0, 1);
    const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), url));
    const minf = box('minf', fullBox('vmhd', 0, 1, zero(8)), dinf, stbl);
    const hdlr = fullBox('hdlr', 0, 0, u32(0), utf8('vide'), zero(12), utf8('VideoHandler\0'));
    const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));
    const mdia = box('mdia', mdhd, hdlr, minf);
    const tkhd = fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), zero(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width * 65536), u32(height * 65536));
    const trak = box('trak', tkhd, mdia);
    const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u32(0x10000), u16(0x100), zero(10), MATRIX, zero(24), u32(2));
    return box('moov', mvhd, trak);
  };
  // The sizes of moov do not depend on the offset, so a first pass finds it.
  const moov = build(ftyp.length + build(0).length + 8);
  return concat([ftyp, moov, box('mdat', payload)]);
}

/** Reads back what a video file's boxes say: for tests, and for checking what was just written. */
export function inspectMP4(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const walk = (start, end, out = {}) => {
    for (let at = start; at + 8 <= end;) {
      const size = view.getUint32(at);
      const name = new TextDecoder().decode(bytes.subarray(at + 4, at + 8));
      if (size < 8) break;
      (out[name] ??= []).push({ at: at + 8, end: at + size });
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(name)) walk(at + 8, at + size, out);
      at += size;
    }
    return out;
  };
  const boxes = walk(0, bytes.length);
  const mdhd = boxes.mdhd?.[0]?.at;
  const stsz = boxes.stsz?.[0]?.at;
  const stco = boxes.stco?.[0]?.at;
  const stsd = boxes.stsd?.[0]?.at;
  if (mdhd == null || stsz == null || stco == null || stsd == null) throw new Error('Not an MP4 file this program wrote');
  const count = view.getUint32(stsz + 8);
  const sizes = Array.from({ length: count }, (_, i) => view.getUint32(stsz + 12 + i * 4));
  return {
    count, sizes, timescale: view.getUint32(mdhd + 12), duration: view.getUint32(mdhd + 16), firstOffset: view.getUint32(stco + 8),
    codec: new TextDecoder().decode(bytes.subarray(stsd + 12, stsd + 16)),
    width: view.getUint16(stsd + 8 + 8 + 24), height: view.getUint16(stsd + 8 + 8 + 26),
    keys: boxes.stss ? view.getUint32(boxes.stss[0].at + 4) : count,
    dataAt: boxes.mdat?.[0]?.at,
  };
}

// ─────────────── AVI

const le32 = (x) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x >>> 0, true); return b; };
const le16 = (x) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, x & 0xffff, true); return b; };
const chunk = (id, ...parts) => {
  const body = concat(parts);
  return concat([utf8(id), le32(body.length), body, body.length % 2 ? zero(1) : zero(0)]);
};
const list = (id, ...parts) => { const body = concat(parts); return concat([utf8('LIST'), le32(body.length + 4), utf8(id), body]); };

/** Motion JPEG in an AVI: `pictures` are JPEG files, all of the same size. */
export function muxAVI({ pictures, width, height, fps }) {
  const microseconds = Math.round(1e6 / fps);
  const biggest = Math.max(0, ...pictures.map((p) => p.length));
  const avih = chunk('avih', le32(microseconds), le32(biggest * fps), le32(0), le32(0x10), le32(pictures.length), le32(0), le32(1), le32(biggest), le32(width), le32(height), zero(16));
  const strh = chunk('strh', utf8('vids'), utf8('MJPG'), le32(0), le16(0), le16(0), le32(0), le32(1), le32(Math.round(fps)), le32(0), le32(pictures.length), le32(biggest), le32(0xffffffff), le32(0), le16(0), le16(0), le16(width), le16(height));
  const strf = chunk('strf', le32(40), le32(width), le32(height), le16(1), le16(24), utf8('MJPG'), le32(width * height * 3), zero(16));
  const hdrl = list('hdrl', avih, list('strl', strh, strf));
  const frames = pictures.map((p) => chunk('00dc', p));
  const movi = list('movi', ...frames);
  let offset = 4;
  const entries = frames.map((f, i) => { const e = concat([utf8('00dc'), le32(0x10), le32(offset), le32(pictures[i].length)]); offset += f.length; return e; });
  const idx1 = chunk('idx1', ...entries);
  const body = concat([utf8('AVI '), hdrl, movi, idx1]);
  return concat([utf8('RIFF'), le32(body.length), body]);
}

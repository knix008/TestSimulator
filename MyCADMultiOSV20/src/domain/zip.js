// ZIP archives (3MF and FreeCAD .FCStd are ZIP files): a writer that
// deflates entries (LZ77 + fixed Huffman codes) and a reader of stored and
// deflated entries — its own deflate/inflate, so it works the same in Node,
// the browser and the desktop app.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** files: [{ name, data: string | Uint8Array }] → zip bytes (deflated when that is smaller). */
export function writeZip(files, date = new Date(2026, 0, 1), { compress = true } = {}) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(raw);
    const packed = compress && raw.length > 64 ? deflateRaw(raw) : null;
    const method = packed && packed.length < raw.length ? 8 : 0;
    const data = method ? packed : raw;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, method, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, method, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, raw.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

export const isZip = (bytes) => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;

/** zip bytes → Map(name → Uint8Array). */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endAt = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { endAt = i; break; }
  }
  if (endAt < 0) throw new Error('not a zip archive');
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('broken zip directory');
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const raw = bytes.subarray(dataAt, dataAt + compressed);
    if (!name.endsWith('/')) {
      if (method === 0) files.set(name, raw.slice());
      else if (method === 8) files.set(name, inflateRaw(raw));
      else throw new Error(`unsupported zip method ${method} (${name})`);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export const zipText = (files, name) => (files.has(name) ? decoder.decode(files.get(name)) : null);

// ───────────────────────── inflate (RFC 1951)

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function huffman(lengths) {
  const counts = new Uint16Array(16);
  for (const l of lengths) counts[l]++;
  counts[0] = 0;
  const offsets = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1];
  const symbols = new Uint16Array(lengths.length);
  lengths.forEach((l, s) => { if (l) symbols[offsets[l]++] = s; });
  return { counts, symbols };
}

export function inflateRaw(input) {
  let pos = 0;
  let bit = 0;
  let out = new Uint8Array(Math.max(1024, input.length * 4));
  let size = 0;
  const ensure = (n) => {
    if (size + n <= out.length) return;
    const bigger = new Uint8Array(Math.max(out.length * 2, size + n));
    bigger.set(out.subarray(0, size));
    out = bigger;
  };
  const bits = (n) => {
    let value = 0;
    for (let i = 0; i < n; i++) {
      if (pos >= input.length) throw new Error('inflate: unexpected end');
      value |= ((input[pos] >> bit) & 1) << i;
      if (++bit === 8) { bit = 0; pos++; }
    }
    return value;
  };
  const decode = ({ counts, symbols }) => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = counts[len];
      if (code - first < count) return symbols[index + code - first];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('inflate: bad code');
  };
  let fixed = null;
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      if (bit) { bit = 0; pos++; }
      const length = input[pos] | (input[pos + 1] << 8);
      pos += 4;
      ensure(length);
      out.set(input.subarray(pos, pos + length), size);
      size += length;
      pos += length;
      continue;
    }
    let lit;
    let dist;
    if (type === 1) {
      fixed ??= {
        lit: huffman([...Array(144).fill(8), ...Array(112).fill(9), ...Array(24).fill(7), ...Array(8).fill(8)]),
        dist: huffman(Array(30).fill(5)),
      };
      ({ lit, dist } = fixed);
    } else if (type === 2) {
      const hlit = bits(5) + 257;
      const hdist = bits(5) + 1;
      const hclen = bits(4) + 4;
      const codeLengths = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) codeLengths[ORDER[i]] = bits(3);
      const codeTree = huffman(codeLengths);
      const lengths = [];
      while (lengths.length < hlit + hdist) {
        const sym = decode(codeTree);
        if (sym < 16) lengths.push(sym);
        else if (sym === 16) { const prev = lengths[lengths.length - 1]; for (let r = 3 + bits(2); r > 0; r--) lengths.push(prev); }
        else if (sym === 17) for (let r = 3 + bits(3); r > 0; r--) lengths.push(0);
        else for (let r = 11 + bits(7); r > 0; r--) lengths.push(0);
      }
      lit = huffman(lengths.slice(0, hlit));
      dist = huffman(lengths.slice(hlit));
    } else throw new Error('inflate: bad block type');
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) { ensure(1); out[size++] = sym; continue; }
      if (sym === 256) break;
      const i = sym - 257;
      const length = LENGTH_BASE[i] + bits(LENGTH_EXTRA[i]);
      const d = decode(dist);
      const distance = DIST_BASE[d] + bits(DIST_EXTRA[d]);
      ensure(length);
      for (let k = 0; k < length; k++) { out[size] = out[size - distance]; size++; }
    }
  }
  return out.slice(0, size);
}

// ───────────────────────── deflate (RFC 1951): LZ77 with hash chains, fixed Huffman codes

/** Raw deflate of `input` (one block with the fixed codes). */
export function deflateRaw(input) {
  let out = new Uint8Array(Math.max(1024, input.length + (input.length >> 3) + 64));
  let size = 0;
  let bitBuffer = 0;
  let bitCount = 0;
  const flush = () => {
    while (bitCount >= 8) {
      if (size >= out.length) { const bigger = new Uint8Array(out.length * 2); bigger.set(out); out = bigger; }
      out[size++] = bitBuffer & 0xff;
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  const bits = (value, n) => { bitBuffer |= value << bitCount; bitCount += n; flush(); };
  // Huffman codes go most significant bit first.
  const code = (value, n) => { let r = 0; for (let i = 0; i < n; i++) r |= ((value >> i) & 1) << (n - 1 - i); bits(r, n); };
  const literal = (v) => {
    if (v < 144) code(0x30 + v, 8);
    else if (v < 256) code(0x190 + v - 144, 9);
    else if (v < 280) code(v - 256, 7);
    else code(0xc0 + v - 280, 8);
  };
  const lengthCode = (len) => { let i = 28; while (LENGTH_BASE[i] > len) i--; return i; };
  const distCode = (d) => { let i = 29; while (DIST_BASE[i] > d) i--; return i; };
  bits(1, 1); // last block
  bits(1, 2); // fixed Huffman codes
  const WINDOW = 32768;
  const HASH = 1 << 15;
  const head = new Int32Array(HASH).fill(-1);
  const prev = new Int32Array(WINDOW);
  const hash = (i) => ((input[i] << 10) ^ (input[i + 1] << 5) ^ input[i + 2]) & (HASH - 1);
  const insert = (i) => { if (i + 2 < input.length) { const h = hash(i); prev[i & (WINDOW - 1)] = head[h]; head[h] = i; } };
  let i = 0;
  while (i < input.length) {
    let bestLength = 0;
    let bestDistance = 0;
    if (i + 2 < input.length) {
      let candidate = head[hash(i)];
      let chain = 64;
      const limit = Math.min(258, input.length - i);
      while (candidate >= 0 && i - candidate <= WINDOW && chain-- > 0) {
        if (input[candidate + bestLength] === input[i + bestLength]) {
          let length = 0;
          while (length < limit && input[candidate + length] === input[i + length]) length++;
          if (length > bestLength) { bestLength = length; bestDistance = i - candidate; if (length === limit) break; }
        }
        candidate = prev[candidate & (WINDOW - 1)];
      }
    }
    if (bestLength >= 3) {
      const lc = lengthCode(bestLength);
      literal(257 + lc);
      if (LENGTH_EXTRA[lc]) bits(bestLength - LENGTH_BASE[lc], LENGTH_EXTRA[lc]);
      const dc = distCode(bestDistance);
      code(dc, 5);
      if (DIST_EXTRA[dc]) bits(bestDistance - DIST_BASE[dc], DIST_EXTRA[dc]);
      for (let k = 0; k < bestLength; k++) insert(i + k);
      i += bestLength;
    } else {
      literal(input[i]);
      insert(i);
      i += 1;
    }
  }
  literal(256);
  if (bitCount > 0) bits(0, 8 - bitCount);
  return out.slice(0, size);
}

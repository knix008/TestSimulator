// A small synchronous DEFLATE decoder (RFC 1951) with the zlib and gzip wrappers: FBX arrays and old .blend files need it, in
// the core, where there is no asynchronous stream to wait for.
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function huffman(lengths) {
  const count = new Uint16Array(16);
  for (const l of lengths) count[l]++;
  count[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
  const symbols = new Uint16Array(lengths.length);
  lengths.forEach((l, s) => { if (l) symbols[offs[l]++] = s; });
  return { count, symbols };
}

const FIXED_LIT = huffman([...Array(144).fill(8), ...Array(112).fill(9), ...Array(24).fill(7), ...Array(8).fill(8)]);
const FIXED_DIST = huffman(Array(30).fill(5));

/** Raw DEFLATE to bytes. `sizeHint` avoids regrowing when the size is known. */
export function inflateRaw(input, sizeHint = 0) {
  let out = new Uint8Array(Math.max(1024, sizeHint || input.length * 4));
  let n = 0;
  let pos = 0;
  let bit = 0;
  let bits = 0;
  const grow = (need) => {
    if (n + need <= out.length) return;
    const next = new Uint8Array(Math.max(out.length * 2, n + need));
    next.set(out.subarray(0, n));
    out = next;
  };
  const take = (count) => {
    while (bits < count) {
      if (pos >= input.length) throw new Error('The compressed data ends too early');
      bit |= input[pos++] << bits;
      bits += 8;
    }
    const v = bit & ((1 << count) - 1);
    bit >>>= count;
    bits -= count;
    return v;
  };
  const decode = (h) => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= take(1);
      const c = h.count[len];
      if (code - c < first) return h.symbols[index + (code - first)];
      index += c;
      first = (first + c) << 1;
      code <<= 1;
    }
    throw new Error('Bad compressed data');
  };
  for (let last = 0; !last;) {
    last = take(1);
    const type = take(2);
    if (type === 0) {
      bit = 0;
      bits = 0;
      const len = input[pos] | (input[pos + 1] << 8);
      pos += 4;
      grow(len);
      out.set(input.subarray(pos, pos + len), n);
      n += len;
      pos += len;
    } else if (type === 1 || type === 2) {
      let lit = FIXED_LIT;
      let dist = FIXED_DIST;
      if (type === 2) {
        const hlit = take(5) + 257;
        const hdist = take(5) + 1;
        const hclen = take(4) + 4;
        const code = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) code[ORDER[i]] = take(3);
        const h = huffman(code);
        const lengths = [];
        while (lengths.length < hlit + hdist) {
          const s = decode(h);
          if (s < 16) lengths.push(s);
          else if (s === 16) { const prev = lengths.at(-1) ?? 0; for (let k = take(2) + 3; k > 0; k--) lengths.push(prev); }
          else if (s === 17) for (let k = take(3) + 3; k > 0; k--) lengths.push(0);
          else for (let k = take(7) + 11; k > 0; k--) lengths.push(0);
        }
        lit = huffman(lengths.slice(0, hlit));
        dist = huffman(lengths.slice(hlit, hlit + hdist));
      }
      for (;;) {
        const s = decode(lit);
        if (s < 256) { grow(1); out[n++] = s; continue; }
        if (s === 256) break;
        const len = LENGTH_BASE[s - 257] + take(LENGTH_EXTRA[s - 257]);
        const d = decode(dist);
        const back = DIST_BASE[d] + take(DIST_EXTRA[d]);
        grow(len);
        for (let k = 0; k < len; k++, n++) out[n] = out[n - back];
      }
    } else throw new Error('Bad compressed data');
  }
  return out.subarray(0, n);
}

/** zlib wrapper: two header bytes, the stream, a checksum. */
export const inflateZlib = (input, sizeHint = 0) => inflateRaw(input.subarray(2), sizeHint);

/** gzip wrapper. */
export function gunzip(input) {
  if (input[0] !== 0x1f || input[1] !== 0x8b) throw new Error('Not gzip data');
  const flags = input[3];
  let pos = 10;
  if (flags & 4) pos += 2 + (input[pos] | (input[pos + 1] << 8));
  if (flags & 8) { while (input[pos++]); }
  if (flags & 16) { while (input[pos++]); }
  if (flags & 2) pos += 2;
  return inflateRaw(input.subarray(pos));
}

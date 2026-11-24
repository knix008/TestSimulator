// Synchronous crypto primitives for the PDF standard security handler:
// MD5, RC4, AES-128/256 (CBC) and SHA-256/384/512.
//
// They are plain JavaScript on purpose. WebCrypto is async-only, missing on a
// plain-http web deployment, has no MD5/RC4, and its AES-CBC insists on PKCS#7
// padding — while the PDF key algorithms need unpadded AES and many short
// rounds. Every function here is checked against node:crypto in
// test/pdf-crypt.test.js.

// ── helpers ───────────────────────────────────────────────

export function concatBytes(...parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function bytesEqual(a, b, n = Math.max(a.length, b.length)) {
  if (a.length < n || b.length < n) return false;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── MD5 ───────────────────────────────────────────────────

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));

export function md5(data) {
  const len = data.length;
  const total = (((len + 8) >>> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bits = len * 8;
  const lo = bits >>> 0;
  const hi = Math.floor(bits / 2 ** 32) >>> 0;
  for (let i = 0; i < 4; i++) {
    buf[total - 8 + i] = (lo >>> (8 * i)) & 255;
    buf[total - 4 + i] = (hi >>> (8 * i)) & 255;
  }
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  const M = new Int32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) {
      const p = off + j * 4;
      M[j] = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7 * i) & 15; }
      F = (F + A + MD5_K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      const s = MD5_S[i];
      B = (B + ((F << s) | (F >>> (32 - s)))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((w, k) => {
    for (let i = 0; i < 4; i++) out[k * 4 + i] = (w >>> (8 * i)) & 255;
  });
  return out;
}

// ── RC4 ───────────────────────────────────────────────────

export function rc4(key, data) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    const t = s[i]; s[i] = s[j]; s[j] = t;
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    const t = s[i]; s[i] = s[j]; s[j] = t;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

// ── AES ───────────────────────────────────────────────────

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
const T0 = new Int32Array(256), T1 = new Int32Array(256), T2 = new Int32Array(256), T3 = new Int32Array(256);
const D0 = new Int32Array(256), D1 = new Int32Array(256), D2 = new Int32Array(256), D3 = new Int32Array(256);

(() => {
  const rotl8 = (x, n) => ((x << n) | (x >>> (8 - n))) & 255;
  let p = 1, q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255;
    if (q & 0x80) q ^= 0x09;
    SBOX[p] = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;

  const mul = (a, b) => {
    let r = 0;
    while (b) {
      if (b & 1) r ^= a;
      a = (a << 1) ^ (a & 0x80 ? 0x11b : 0);
      b >>= 1;
    }
    return r & 255;
  };
  const ror = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < 256; i++) {
    const s = SBOX[i];
    const t = (mul(s, 2) << 24) | (s << 16) | (s << 8) | mul(s, 3);
    T0[i] = t; T1[i] = ror(t, 8); T2[i] = ror(t, 16); T3[i] = ror(t, 24);
    const v = INV_SBOX[i];
    const d = (mul(v, 14) << 24) | (mul(v, 9) << 16) | (mul(v, 13) << 8) | mul(v, 11);
    D0[i] = d; D1[i] = ror(d, 8); D2[i] = ror(d, 16); D3[i] = ror(d, 24);
  }
})();

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function expandKey(key) {
  const nk = key.length / 4;
  if (nk !== 4 && nk !== 6 && nk !== 8) throw new Error(`Bad AES key length ${key.length}`);
  const nr = nk + 6;
  const w = new Int32Array(4 * (nr + 1));
  for (let i = 0; i < nk; i++) {
    w[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
  }
  const sub = (x) => (SBOX[x >>> 24] << 24) | (SBOX[(x >>> 16) & 255] << 16) | (SBOX[(x >>> 8) & 255] << 8) | SBOX[x & 255];
  for (let i = nk; i < w.length; i++) {
    let t = w[i - 1];
    if (i % nk === 0) t = sub((t << 8) | (t >>> 24)) ^ (RCON[i / nk - 1] << 24);
    else if (nk > 6 && i % nk === 4) t = sub(t);
    w[i] = w[i - nk] ^ t;
  }
  // Equivalent inverse cipher: round keys reversed, middle ones InvMixColumn'd.
  const dw = new Int32Array(w.length);
  for (let r = 0; r <= nr; r++) {
    for (let c = 0; c < 4; c++) {
      const x = w[4 * (nr - r) + c];
      dw[4 * r + c] = (r === 0 || r === nr) ? x
        : D0[SBOX[x >>> 24]] ^ D1[SBOX[(x >>> 16) & 255]] ^ D2[SBOX[(x >>> 8) & 255]] ^ D3[SBOX[x & 255]];
    }
  }
  return { w, dw, nr };
}

function encryptBlock({ w, nr }, s) {
  let s0 = s[0] ^ w[0], s1 = s[1] ^ w[1], s2 = s[2] ^ w[2], s3 = s[3] ^ w[3];
  let k = 4;
  for (let r = 1; r < nr; r++, k += 4) {
    const t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 255] ^ T2[(s2 >>> 8) & 255] ^ T3[s3 & 255] ^ w[k];
    const t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 255] ^ T2[(s3 >>> 8) & 255] ^ T3[s0 & 255] ^ w[k + 1];
    const t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 255] ^ T2[(s0 >>> 8) & 255] ^ T3[s1 & 255] ^ w[k + 2];
    const t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 255] ^ T2[(s1 >>> 8) & 255] ^ T3[s2 & 255] ^ w[k + 3];
    s0 = t0; s1 = t1; s2 = t2; s3 = t3;
  }
  const f = (a, b, c, d, kw) => ((SBOX[a >>> 24] << 24) | (SBOX[(b >>> 16) & 255] << 16) | (SBOX[(c >>> 8) & 255] << 8) | SBOX[d & 255]) ^ kw;
  s[0] = f(s0, s1, s2, s3, w[k]);
  s[1] = f(s1, s2, s3, s0, w[k + 1]);
  s[2] = f(s2, s3, s0, s1, w[k + 2]);
  s[3] = f(s3, s0, s1, s2, w[k + 3]);
}

function decryptBlock({ dw, nr }, s) {
  let s0 = s[0] ^ dw[0], s1 = s[1] ^ dw[1], s2 = s[2] ^ dw[2], s3 = s[3] ^ dw[3];
  let k = 4;
  for (let r = 1; r < nr; r++, k += 4) {
    const t0 = D0[s0 >>> 24] ^ D1[(s3 >>> 16) & 255] ^ D2[(s2 >>> 8) & 255] ^ D3[s1 & 255] ^ dw[k];
    const t1 = D0[s1 >>> 24] ^ D1[(s0 >>> 16) & 255] ^ D2[(s3 >>> 8) & 255] ^ D3[s2 & 255] ^ dw[k + 1];
    const t2 = D0[s2 >>> 24] ^ D1[(s1 >>> 16) & 255] ^ D2[(s0 >>> 8) & 255] ^ D3[s3 & 255] ^ dw[k + 2];
    const t3 = D0[s3 >>> 24] ^ D1[(s2 >>> 16) & 255] ^ D2[(s1 >>> 8) & 255] ^ D3[s0 & 255] ^ dw[k + 3];
    s0 = t0; s1 = t1; s2 = t2; s3 = t3;
  }
  const f = (a, b, c, d, kw) => ((INV_SBOX[a >>> 24] << 24) | (INV_SBOX[(b >>> 16) & 255] << 16) | (INV_SBOX[(c >>> 8) & 255] << 8) | INV_SBOX[d & 255]) ^ kw;
  s[0] = f(s0, s3, s2, s1, dw[k]);
  s[1] = f(s1, s0, s3, s2, dw[k + 1]);
  s[2] = f(s2, s1, s0, s3, dw[k + 2]);
  s[3] = f(s3, s2, s1, s0, dw[k + 3]);
}

const readWords = (b, off, s) => {
  for (let i = 0; i < 4; i++) {
    const p = off + 4 * i;
    s[i] = (b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
  }
};
const writeWords = (s, b, off) => {
  for (let i = 0; i < 4; i++) {
    const p = off + 4 * i;
    b[p] = s[i] >>> 24; b[p + 1] = (s[i] >>> 16) & 255; b[p + 2] = (s[i] >>> 8) & 255; b[p + 3] = s[i] & 255;
  }
};

// AES-CBC encryption. `pad` adds PKCS#7 padding; without it the input must be
// a whole number of blocks.
export function aesCbcEncrypt(key, iv, data, { pad = true } = {}) {
  const ks = expandKey(key);
  let input = data;
  if (pad) {
    const n = 16 - (data.length % 16);
    input = new Uint8Array(data.length + n);
    input.set(data);
    input.fill(n, data.length);
  } else if (data.length % 16) {
    throw new Error('AES-CBC input is not a multiple of 16 bytes');
  }
  const out = new Uint8Array(input.length);
  const s = new Int32Array(4), c = new Int32Array(4);
  readWords(iv, 0, c);
  for (let off = 0; off < input.length; off += 16) {
    readWords(input, off, s);
    for (let i = 0; i < 4; i++) s[i] ^= c[i];
    encryptBlock(ks, s);
    writeWords(s, out, off);
    c.set(s);
  }
  return out;
}

// AES-CBC decryption. With `unpad`, a valid PKCS#7 tail is removed; a broken
// one is left in place (some PDF writers get the padding wrong), and a
// trailing partial block is dropped.
export function aesCbcDecrypt(key, iv, data, { unpad = true } = {}) {
  const ks = expandKey(key);
  const len = data.length - (data.length % 16);
  const out = new Uint8Array(len);
  const s = new Int32Array(4), c = new Int32Array(4), prev = new Int32Array(4);
  readWords(iv, 0, c);
  for (let off = 0; off < len; off += 16) {
    readWords(data, off, s);
    prev.set(s);
    decryptBlock(ks, s);
    for (let i = 0; i < 4; i++) s[i] ^= c[i];
    writeWords(s, out, off);
    c.set(prev);
  }
  if (unpad && len) {
    const n = out[len - 1];
    if (n >= 1 && n <= 16 && n <= len) {
      let ok = true;
      for (let i = len - n; i < len; i++) if (out[i] !== n) { ok = false; break; }
      if (ok) return out.subarray(0, len - n);
    }
  }
  return out;
}

// AES in the counter mode WinZip AE-1/AE-2 archives use: the 16-byte counter
// block starts at 1 and counts little-endian (byte 0 first) — which is why
// WebCrypto's big-endian AES-CTR cannot do it. Encrypting and decrypting are
// the same operation. `state` ({ ks, counter, stream, used }) lets a caller
// run one stream in several pieces; omitted, the stream starts fresh.
export function aesCtrWinZip(key, data, state = null) {
  const st = state || aesCtrWinZipState(key);
  const out = new Uint8Array(data.length);
  const s = new Int32Array(4);
  for (let i = 0; i < data.length; i++) {
    if (st.used === 16) {
      for (let b = 0; b < 16; b++) {   // increment, little-endian
        st.counter[b] = (st.counter[b] + 1) & 255;
        if (st.counter[b]) break;
      }
      readWords(st.counter, 0, s);
      encryptBlock(st.ks, s);
      writeWords(s, st.stream, 0);
      st.used = 0;
    }
    out[i] = data[i] ^ st.stream[st.used++];
  }
  return out;
}

export function aesCtrWinZipState(key) {
  // counter is pre-incremented, so it starts at 0 → the first block uses 1.
  return { ks: expandKey(key), counter: new Uint8Array(16), stream: new Uint8Array(16), used: 16 };
}

// ── SHA-1, HMAC-SHA1, PBKDF2 (ZIP AES key derivation) ─────

export function sha1(data) {
  const len = data.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bits = len * 8;
  const hi = Math.floor(bits / 2 ** 32);
  const lo = bits >>> 0;
  buf[total - 8] = hi >>> 24; buf[total - 7] = (hi >>> 16) & 255; buf[total - 6] = (hi >>> 8) & 255; buf[total - 5] = hi & 255;
  buf[total - 4] = lo >>> 24; buf[total - 3] = (lo >>> 16) & 255; buf[total - 2] = (lo >>> 8) & 255; buf[total - 1] = lo & 255;
  let h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, h4 = 0xc3d2e1f0 | 0;
  const W = new Int32Array(80);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const p = off + 4 * i;
      W[i] = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
    }
    for (let i = 16; i < 80; i++) W[i] = rotl(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f; let k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc | 0; }
      else { f = b ^ c ^ d; k = 0xca62c1d6 | 0; }
      const t = (rotl(a, 5) + f + e + k + W[i]) | 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  const out = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((h, i) => {
    out[4 * i] = h >>> 24; out[4 * i + 1] = (h >>> 16) & 255; out[4 * i + 2] = (h >>> 8) & 255; out[4 * i + 3] = h & 255;
  });
  return out;
}

export function hmacSha1(key, data) {
  let k = key.length > 64 ? sha1(key) : key;
  const block = new Uint8Array(64);
  block.set(k);
  const ipad = new Uint8Array(64 + data.length);
  const opad = new Uint8Array(64 + 20);
  for (let i = 0; i < 64; i++) { ipad[i] = block[i] ^ 0x36; opad[i] = block[i] ^ 0x5c; }
  ipad.set(data, 64);
  opad.set(sha1(ipad), 64);
  k = null;
  return sha1(opad);
}

export function pbkdf2Sha1(password, salt, iterations, length) {
  const out = new Uint8Array(length);
  const blocks = Math.ceil(length / 20);
  const saltBlock = new Uint8Array(salt.length + 4);
  saltBlock.set(salt);
  for (let n = 1; n <= blocks; n++) {
    saltBlock[salt.length] = n >>> 24; saltBlock[salt.length + 1] = (n >>> 16) & 255;
    saltBlock[salt.length + 2] = (n >>> 8) & 255; saltBlock[salt.length + 3] = n & 255;
    let u = hmacSha1(password, saltBlock);
    const t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmacSha1(password, u);
      for (let j = 0; j < 20; j++) t[j] ^= u[j];
    }
    out.set(t.subarray(0, Math.min(20, length - (n - 1) * 20)), (n - 1) * 20);
  }
  return out;
}

// ── SHA-2 ─────────────────────────────────────────────────
// The round constants and initial values are the fractional parts of square
// and cube roots of the first primes; computing them with BigInt keeps 160
// hand-typed hex numbers out of the source.

const PRIMES = (() => {
  const out = [];
  for (let n = 2; out.length < 80; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) out.push(n);
  }
  return out;
})();

function iroot(n, k) {
  // Integer k-th root (k = 2 or 3) of a BigInt by Newton's method.
  const K = BigInt(k);
  let x = BigInt(Math.floor(Number(n) ** (1 / k)));
  if (x < 1n) x = 1n;
  for (let i = 0; i < 200; i++) {
    const next = ((K - 1n) * x + n / x ** (K - 1n)) / K;
    if (next === x) break;
    x = next;
  }
  while (x ** K > n) x -= 1n;
  while ((x + 1n) ** K <= n) x += 1n;
  return x;
}

const fracBits = (p, k, bits) => {
  const v = iroot(BigInt(p) << BigInt(k * bits), k);
  return v & ((1n << BigInt(bits)) - 1n);
};

const K256 = Int32Array.from(PRIMES.slice(0, 64), (p) => Number(fracBits(p, 3, 32)) | 0);
const H256 = Int32Array.from(PRIMES.slice(0, 8), (p) => Number(fracBits(p, 2, 32)) | 0);

const split64 = (v) => [Number(v >> 32n) | 0, Number(v & 0xffffffffn) | 0];
const K512 = PRIMES.map((p) => split64(fracBits(p, 3, 64)));
const H512 = PRIMES.slice(0, 8).map((p) => split64(fracBits(p, 2, 64)));
const H384 = PRIMES.slice(8, 16).map((p) => split64(fracBits(p, 2, 64)));

function shaPad(data, blockBytes) {
  const lenBytes = blockBytes / 8;   // 8 for SHA-256, 16 for SHA-512
  const len = data.length;
  const total = Math.ceil((len + 1 + lenBytes) / blockBytes) * blockBytes;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bits = len * 8;
  const hi = Math.floor(bits / 2 ** 32);
  const lo = bits >>> 0;
  buf[total - 8] = hi >>> 24; buf[total - 7] = (hi >>> 16) & 255; buf[total - 6] = (hi >>> 8) & 255; buf[total - 5] = hi & 255;
  buf[total - 4] = lo >>> 24; buf[total - 3] = (lo >>> 16) & 255; buf[total - 2] = (lo >>> 8) & 255; buf[total - 1] = lo & 255;
  return buf;
}

export function sha256(data) {
  const buf = shaPad(data, 64);
  const H = Int32Array.from(H256);
  const W = new Int32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const p = off + 4 * i;
      W[i] = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + W[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[4 * i] = H[i] >>> 24; out[4 * i + 1] = (H[i] >>> 16) & 255; out[4 * i + 2] = (H[i] >>> 8) & 255; out[4 * i + 3] = H[i] & 255;
  }
  return out;
}

// SHA-512 with 64-bit words held as (hi, lo) pairs of 32-bit ints.
function sha512Core(data, init, outBytes) {
  const buf = shaPad(data, 128);
  const Hh = Int32Array.from(init, (x) => x[0]);
  const Hl = Int32Array.from(init, (x) => x[1]);
  const Wh = new Int32Array(80), Wl = new Int32Array(80);
  // 64-bit rotate right of (h,l) by n; returns via the two out slots.
  let rh = 0, rl = 0;
  const rotr = (h, l, n) => {
    if (n < 32) { rh = (h >>> n) | (l << (32 - n)); rl = (l >>> n) | (h << (32 - n)); }
    else { const m = n - 32; rh = (l >>> m) | (h << (32 - m)); rl = (h >>> m) | (l << (32 - m)); }
    if (n === 32) { rh = l; rl = h; }
  };
  const TWO32 = 2 ** 32;
  for (let off = 0; off < buf.length; off += 128) {
    for (let i = 0; i < 16; i++) {
      const p = off + 8 * i;
      Wh[i] = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
      Wl[i] = (buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7];
    }
    for (let i = 16; i < 80; i++) {
      // σ0 = rotr1 ^ rotr8 ^ shr7 ; σ1 = rotr19 ^ rotr61 ^ shr6
      let h = Wh[i - 15], l = Wl[i - 15];
      rotr(h, l, 1); let s0h = rh, s0l = rl;
      rotr(h, l, 8); s0h ^= rh; s0l ^= rl;
      s0h ^= h >>> 7; s0l ^= (l >>> 7) | (h << 25);
      h = Wh[i - 2]; l = Wl[i - 2];
      rotr(h, l, 19); let s1h = rh, s1l = rl;
      rotr(h, l, 61); s1h ^= rh; s1l ^= rl;
      s1h ^= h >>> 6; s1l ^= (l >>> 6) | (h << 26);
      const lo = (Wl[i - 16] >>> 0) + (s0l >>> 0) + (Wl[i - 7] >>> 0) + (s1l >>> 0);
      Wl[i] = lo | 0;
      Wh[i] = (Wh[i - 16] + s0h + Wh[i - 7] + s1h + Math.floor(lo / TWO32)) | 0;
    }
    let ah = Hh[0], al = Hl[0], bh = Hh[1], bl = Hl[1], ch = Hh[2], cl = Hl[2], dh = Hh[3], dl = Hl[3];
    let eh = Hh[4], el = Hl[4], fh = Hh[5], fl = Hl[5], gh = Hh[6], gl = Hl[6], hh = Hh[7], hl = Hl[7];
    for (let i = 0; i < 80; i++) {
      rotr(eh, el, 14); let S1h = rh, S1l = rl;
      rotr(eh, el, 18); S1h ^= rh; S1l ^= rl;
      rotr(eh, el, 41); S1h ^= rh; S1l ^= rl;
      const chh = (eh & fh) ^ (~eh & gh), chl = (el & fl) ^ (~el & gl);
      const t1l = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K512[i][1] >>> 0) + (Wl[i] >>> 0);
      const t1h = (hh + S1h + chh + K512[i][0] + Wh[i] + Math.floor(t1l / TWO32)) | 0;
      rotr(ah, al, 28); let S0h = rh, S0l = rl;
      rotr(ah, al, 34); S0h ^= rh; S0l ^= rl;
      rotr(ah, al, 39); S0h ^= rh; S0l ^= rl;
      const mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch), mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
      const t2l = (S0l >>> 0) + (mjl >>> 0);
      const t2h = (S0h + mjh + Math.floor(t2l / TWO32)) | 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      const el2 = (dl >>> 0) + (t1l >>> 0);
      eh = (dh + t1h + Math.floor(el2 / TWO32)) | 0; el = el2 | 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      const al2 = (t1l >>> 0) + (t2l >>> 0);
      ah = (t1h + t2h + Math.floor(al2 / TWO32)) | 0; al = al2 | 0;
    }
    const add = (i, h, l) => {
      const lo = (Hl[i] >>> 0) + (l >>> 0);
      Hl[i] = lo | 0;
      Hh[i] = (Hh[i] + h + Math.floor(lo / TWO32)) | 0;
    };
    add(0, ah, al); add(1, bh, bl); add(2, ch, cl); add(3, dh, dl);
    add(4, eh, el); add(5, fh, fl); add(6, gh, gl); add(7, hh, hl);
  }
  const out = new Uint8Array(64);
  for (let i = 0; i < 8; i++) {
    const p = 8 * i;
    out[p] = Hh[i] >>> 24; out[p + 1] = (Hh[i] >>> 16) & 255; out[p + 2] = (Hh[i] >>> 8) & 255; out[p + 3] = Hh[i] & 255;
    out[p + 4] = Hl[i] >>> 24; out[p + 5] = (Hl[i] >>> 16) & 255; out[p + 6] = (Hl[i] >>> 8) & 255; out[p + 7] = Hl[i] & 255;
  }
  return out.slice(0, outBytes);
}

export const sha512 = (data) => sha512Core(data, H512, 64);
export const sha384 = (data) => sha512Core(data, H384, 48);

// Synchronous crypto for TLS decryption with a key log (the dissectors run synchronously, so WebCrypto's
// promises cannot be used): SHA-256 / SHA-384, HMAC, HKDF-Expand-Label (TLS 1.3), the TLS 1.2 PRF,
// AES-128 / AES-256 (encrypt and decrypt), AES-GCM, AES-CBC and ChaCha20-Poly1305.
// Checked against Node's crypto in test/unit/tls-decrypt.test.mjs.
import { sha256 } from './quic-crypto.js';

export const cat = (...parts) => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const TE = new TextEncoder();

// ───────────────────────── SHA-384 (SHA-512 with another start and a shorter result)

const K512 = [
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df, 0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec, 0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c, 0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
];
const IV384 = [0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939, 0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4];

function sha512core(msg, iv, outLen) {
  const ml = msg.length;
  const total = Math.ceil((ml + 17) / 128) * 128;
  const m = new Uint8Array(total);
  m.set(msg);
  m[ml] = 0x80;
  const bits = ml * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  dv.setUint32(total - 4, bits >>> 0);
  const h = Int32Array.from(iv);
  const w = new Int32Array(160);
  for (let off = 0; off < total; off += 128) {
    for (let i = 0; i < 32; i++) w[i] = dv.getInt32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const xh = w[(i - 15) * 2], xl = w[(i - 15) * 2 + 1];
      const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
      const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
      const yh = w[(i - 2) * 2], yl = w[(i - 2) * 2 + 1];
      const s1h = ((yh >>> 19) | (yl << 13)) ^ ((yl >>> 29) | (yh << 3)) ^ (yh >>> 6);
      const s1l = ((yl >>> 19) | (yh << 13)) ^ ((yh >>> 29) | (yl << 3)) ^ ((yl >>> 6) | (yh << 26));
      let lo = (s0l >>> 0) + (s1l >>> 0) + (w[(i - 7) * 2 + 1] >>> 0) + (w[(i - 16) * 2 + 1] >>> 0);
      let hi = s0h + s1h + w[(i - 7) * 2] + w[(i - 16) * 2] + Math.floor(lo / 2 ** 32);
      w[i * 2] = hi | 0; w[i * 2 + 1] = lo | 0;
    }
    let [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl] = h;
    for (let i = 0; i < 80; i++) {
      const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
      const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
      const chh = (eh & fh) ^ (~eh & gh), chl = (el & fl) ^ (~el & gl);
      let lo = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K512[i * 2 + 1] >>> 0) + (w[i * 2 + 1] >>> 0);
      const t1h = (hh + S1h + chh + K512[i * 2] + w[i * 2] + Math.floor(lo / 2 ** 32)) | 0;
      const t1l = lo | 0;
      const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
      const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
      const mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch), mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
      lo = (S0l >>> 0) + (mjl >>> 0);
      const t2h = (S0h + mjh + Math.floor(lo / 2 ** 32)) | 0;
      const t2l = lo | 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      lo = (dl >>> 0) + (t1l >>> 0);
      eh = (dh + t1h + Math.floor(lo / 2 ** 32)) | 0; el = lo | 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      lo = (t1l >>> 0) + (t2l >>> 0);
      ah = (t1h + t2h + Math.floor(lo / 2 ** 32)) | 0; al = lo | 0;
    }
    const v = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
    for (let i = 0; i < 16; i += 2) {
      const lo = (h[i + 1] >>> 0) + (v[i + 1] >>> 0);
      h[i] = (h[i] + v[i] + Math.floor(lo / 2 ** 32)) | 0;
      h[i + 1] = lo | 0;
    }
  }
  const out = new Uint8Array(64);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) ov.setInt32(i * 4, h[i]);
  return out.subarray(0, outLen);
}
export const sha384 = (msg) => sha512core(msg, IV384, 48);
export { sha256 };

export const HASHES = { sha256: { fn: sha256, len: 32, block: 64 }, sha384: { fn: sha384, len: 48, block: 128 } };

export function hmacWith(hash, key, msg) {
  const { fn, block } = HASHES[hash];
  let k = key.length > block ? fn(key) : key;
  const pad = new Uint8Array(block); pad.set(k);
  const ipad = pad.map((b) => b ^ 0x36), opad = pad.map((b) => b ^ 0x5c);
  return fn(cat(opad, fn(cat(ipad, msg))));
}

/** TLS 1.3 HKDF-Expand-Label(secret, label, context = '', length). */
export function expandLabel(hash, secret, label, length, context = new Uint8Array(0)) {
  const full = TE.encode(`tls13 ${label}`);
  const info = cat(Uint8Array.of(length >> 8, length & 0xff, full.length), full, Uint8Array.of(context.length), context);
  const out = new Uint8Array(length);
  let t = new Uint8Array(0);
  for (let i = 1, o = 0; o < length; i++) {
    t = hmacWith(hash, secret, cat(t, info, Uint8Array.of(i)));
    out.set(t.subarray(0, Math.min(t.length, length - o)), o);
    o += t.length;
  }
  return out;
}

/** TLS 1.2 PRF (P_hash with the suite's hash). */
export function prf12(hash, secret, label, seed, length) {
  const s = cat(TE.encode(label), seed);
  const out = new Uint8Array(length);
  let a = s;
  for (let o = 0; o < length;) {
    a = hmacWith(hash, secret, a);
    const p = hmacWith(hash, secret, cat(a, s));
    out.set(p.subarray(0, Math.min(p.length, length - o)), o);
    o += p.length;
  }
  return out;
}

// ───────────────────────── AES (FIPS 197), 128- and 256-bit keys

const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
(() => {
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
})();
const xt = (b) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };

/** Expanded key: { w: Uint8Array, rounds }. */
export function aesExpand(key) {
  const nk = key.length / 4;
  const rounds = nk + 6;
  const w = new Uint8Array(16 * (rounds + 1));
  w.set(key);
  let rc = 1;
  for (let i = nk; i < 4 * (rounds + 1); i++) {
    let t = w.slice((i - 1) * 4, i * 4);
    if (i % nk === 0) { t = Uint8Array.of(SBOX[t[1]] ^ rc, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]); rc = xt(rc); }
    else if (nk > 6 && i % nk === 4) t = t.map((b) => SBOX[b]);
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - nk) * 4 + j] ^ t[j];
  }
  return { w, rounds };
}

export function aesEncryptBlock({ w, rounds }, inp) {
  const s = Uint8Array.from(inp);
  for (let i = 0; i < 16; i++) s[i] ^= w[i];
  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
    if (r < rounds) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
        s[c] = xt(a0) ^ xt(a1) ^ a1 ^ a2 ^ a3;
        s[c + 1] = a0 ^ xt(a1) ^ xt(a2) ^ a2 ^ a3;
        s[c + 2] = a0 ^ a1 ^ xt(a2) ^ xt(a3) ^ a3;
        s[c + 3] = xt(a0) ^ a0 ^ a1 ^ a2 ^ xt(a3);
      }
    }
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}

export function aesDecryptBlock({ w, rounds }, inp) {
  const s = Uint8Array.from(inp);
  for (let i = 0; i < 16; i++) s[i] ^= w[rounds * 16 + i];
  for (let r = rounds - 1; r >= 0; r--) {
    let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
    for (let i = 0; i < 16; i++) s[i] = INV[s[i]];
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
    if (r > 0) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
        s[c] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
        s[c + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
        s[c + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
        s[c + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
      }
    }
  }
  return s;
}

/** AES-CBC decryption (no padding removal). */
export function cbcDecrypt(key, iv, data) {
  const k = aesExpand(key);
  const out = new Uint8Array(data.length - (data.length % 16));
  let prev = iv;
  for (let o = 0; o + 16 <= data.length; o += 16) {
    const block = data.subarray(o, o + 16);
    const p = aesDecryptBlock(k, block);
    for (let i = 0; i < 16; i++) out[o + i] = p[i] ^ prev[i];
    prev = block;
  }
  return out;
}

// ───────────────────────── AES-GCM

function gmul(x, y) {
  const z = new Uint32Array(4);
  const v = Uint32Array.from(y);
  for (let i = 0; i < 128; i++) {
    if ((x[i >>> 5] >>> (31 - (i & 31))) & 1) { z[0] ^= v[0]; z[1] ^= v[1]; z[2] ^= v[2]; z[3] ^= v[3]; }
    const lsb = v[3] & 1;
    v[3] = (v[3] >>> 1) | (v[2] << 31); v[2] = (v[2] >>> 1) | (v[1] << 31); v[1] = (v[1] >>> 1) | (v[0] << 31); v[0] >>>= 1;
    if (lsb) v[0] ^= 0xe1000000;
  }
  return z;
}
const words = (b, o = 0) => Uint32Array.of(((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0, ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0, ((b[o + 8] << 24) | (b[o + 9] << 16) | (b[o + 10] << 8) | b[o + 11]) >>> 0, ((b[o + 12] << 24) | (b[o + 13] << 16) | (b[o + 14] << 8) | b[o + 15]) >>> 0);
function ghash(h, aad, ct) {
  let y = new Uint32Array(4);
  const feed = (data) => { for (let o = 0; o < data.length; o += 16) { const blk = new Uint8Array(16); blk.set(data.subarray(o, o + 16)); const w = words(blk); for (let i = 0; i < 4; i++) y[i] ^= w[i]; y = gmul(y, h); } };
  feed(aad); feed(ct);
  const lens = new Uint8Array(16); const dv = new DataView(lens.buffer);
  dv.setUint32(4, aad.length * 8); dv.setUint32(12, ct.length * 8);
  const w = words(lens); for (let i = 0; i < 4; i++) y[i] ^= w[i];
  y = gmul(y, h);
  const out = new Uint8Array(16); const ov = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) ov.setUint32(i * 4, y[i]);
  return out;
}
function ctrBlocks(k, j0, data) {
  const out = new Uint8Array(data.length);
  const ctr = Uint8Array.from(j0);
  for (let o = 0; o < data.length; o += 16) {
    for (let i = 15; i >= 12; i--) { ctr[i] = (ctr[i] + 1) & 0xff; if (ctr[i]) break; }
    const ks = aesEncryptBlock(k, ctr);
    for (let i = 0; i < 16 && o + i < data.length; i++) out[o + i] = data[o + i] ^ ks[i];
  }
  return out;
}
/** AES-GCM with a 12-byte nonce: plaintext, or null when the tag does not verify. */
export function gcmDecrypt(key, nonce, aad, ctTag) {
  if (ctTag.length < 16) return null;
  const k = aesExpand(key);
  const ct = ctTag.subarray(0, ctTag.length - 16), tag = ctTag.subarray(ctTag.length - 16);
  const h = words(aesEncryptBlock(k, new Uint8Array(16)));
  const j0 = new Uint8Array(16); j0.set(nonce); j0[15] = 1;
  const s = ghash(h, aad, ct);
  const ek = aesEncryptBlock(k, j0);
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= (s[i] ^ ek[i]) ^ tag[i];
  return diff ? null : ctrBlocks(k, j0, ct);
}

// ───────────────────────── ChaCha20-Poly1305 (RFC 8439)

const rotl = (x, n) => (x << n) | (x >>> (32 - n));
function chachaBlock(key32, counter, nonce32) {
  const s = new Uint32Array(16);
  s[0] = 0x61707865; s[1] = 0x3320646e; s[2] = 0x79622d32; s[3] = 0x6b206574;
  s.set(key32, 4); s[12] = counter; s.set(nonce32, 13);
  const x = Uint32Array.from(s);
  const qr = (a, b, c, d) => {
    x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 16); x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 12);
    x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 8); x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 7);
  };
  for (let i = 0; i < 10; i++) { qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15); qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14); }
  for (let i = 0; i < 16; i++) x[i] += s[i];
  return new Uint8Array(x.buffer);
}
const le32 = (b) => { const out = new Uint32Array(b.length / 4); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); for (let i = 0; i < out.length; i++) out[i] = dv.getUint32(i * 4, true); return out; };
function chacha(key, nonce, counter, data) {
  const k = le32(Uint8Array.from(key)), n = le32(Uint8Array.from(nonce));
  const out = new Uint8Array(data.length);
  for (let o = 0, c = counter; o < data.length; o += 64, c++) {
    const ks = chachaBlock(k, c, n);
    for (let i = 0; i < 64 && o + i < data.length; i++) out[o + i] = data[o + i] ^ ks[i];
  }
  return out;
}
function poly1305(key, msg) {
  const le = (b) => { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; };
  const r = le(key.subarray(0, 16)) & 0x0ffffffc0ffffffc0ffffffc0fffffffn;
  const s = le(key.subarray(16, 32));
  const p = (1n << 130n) - 5n;
  let acc = 0n;
  for (let o = 0; o < msg.length; o += 16) {
    const blk = msg.subarray(o, o + 16);
    acc = ((acc + le(blk) + (1n << BigInt(blk.length * 8))) * r) % p;
  }
  acc = (acc + s) & ((1n << 128n) - 1n);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) { out[i] = Number(acc & 0xffn); acc >>= 8n; }
  return out;
}
/** ChaCha20-Poly1305 AEAD: plaintext, or null when the tag does not verify. */
export function chachaDecrypt(key, nonce, aad, ctTag) {
  if (ctTag.length < 16) return null;
  const ct = ctTag.subarray(0, ctTag.length - 16), tag = ctTag.subarray(ctTag.length - 16);
  const otk = chacha(key, nonce, 0, new Uint8Array(32));
  const pad = (n) => new Uint8Array((16 - (n % 16)) % 16);
  const lens = new Uint8Array(16); const dv = new DataView(lens.buffer);
  dv.setUint32(0, aad.length, true); dv.setUint32(8, ct.length, true);
  const t = poly1305(otk, cat(aad, pad(aad.length), ct, pad(ct.length), lens));
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= t[i] ^ tag[i];
  return diff ? null : chacha(key, nonce, 1, ct);
}

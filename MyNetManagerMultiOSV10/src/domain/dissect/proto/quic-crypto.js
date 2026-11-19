// Synchronous QUIC Initial packet protection (RFC 9001 / RFC 9369): SHA-256, HKDF, AES-128, GCM.
// Pure JS because WebCrypto is async and dissection is synchronous. Only used for Initial packets,
// whose keys are derived from the client's Destination Connection ID (no secrets needed).

// ---- SHA-256
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(msg) {
  const l = msg.length;
  const n = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(n);
  m.set(msg); m[l] = 0x80;
  const bits = l * 8;
  m[n - 4] = (bits >>> 24) & 255; m[n - 3] = (bits >>> 16) & 255; m[n - 2] = (bits >>> 8) & 255; m[n - 1] = bits & 255;
  m[n - 5] = Math.floor(bits / 2 ** 32) & 255;
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[4 * i] = H[i] >>> 24; out[4 * i + 1] = H[i] >>> 16; out[4 * i + 2] = H[i] >>> 8; out[4 * i + 3] = H[i]; }
  return out;
}
function cat(...a) { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; }
export function hmac(key, msg) {
  if (key.length > 64) key = sha256(key);
  const k = new Uint8Array(64); k.set(key);
  const ip = k.map((b) => b ^ 0x36), op = k.map((b) => b ^ 0x5c);
  return sha256(cat(op, sha256(cat(ip, msg))));
}
const TE = new TextEncoder();
export function hkdfExpandLabel(secret, label, len) {
  const full = TE.encode('tls13 ' + label);
  const info = cat(Uint8Array.of(len >> 8, len & 255, full.length), full, Uint8Array.of(0));
  let t = new Uint8Array(0), out = new Uint8Array(0);
  for (let i = 1; out.length < len; i++) { t = hmac(secret, cat(t, info, Uint8Array.of(i))); out = cat(out, t); }
  return out.subarray(0, len);
}

// ---- AES-128 (encryption only; GCM and header protection never need the inverse cipher)
const SBOX = new Uint8Array(256);
(() => {
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
})();
const xt = (b) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
export function aesKey(key) {
  const w = new Uint8Array(176); w.set(key);
  let rc = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
    if (i % 16 === 0) { const x = t0; t0 = SBOX[t1] ^ rc; t1 = SBOX[t2]; t2 = SBOX[t3]; t3 = SBOX[x]; rc = xt(rc); }
    w[i] = w[i - 16] ^ t0; w[i + 1] = w[i - 15] ^ t1; w[i + 2] = w[i - 14] ^ t2; w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}
export function aesEncrypt(w, inp) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = inp[i] ^ w[i];
  const t = new Uint8Array(16);
  for (let r = 1; r <= 10; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    // ShiftRows (column-major state)
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) t[c * 4 + rr] = s[((c + rr) % 4) * 4 + rr];
    if (r < 10) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3], x = a0 ^ a1 ^ a2 ^ a3;
        s[4 * c] = a0 ^ x ^ xt(a0 ^ a1); s[4 * c + 1] = a1 ^ x ^ xt(a1 ^ a2);
        s[4 * c + 2] = a2 ^ x ^ xt(a2 ^ a3); s[4 * c + 3] = a3 ^ x ^ xt(a3 ^ a0);
      }
    } else s.set(t);
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  return s;
}

// ---- GCM
function gmul(X, Y) { // 128-bit GF multiply on Uint32Array(4), big-endian words
  const Z = new Uint32Array(4), V = Uint32Array.from(Y);
  for (let i = 0; i < 128; i++) {
    if ((X[i >> 5] >>> (31 - (i & 31))) & 1) { Z[0] ^= V[0]; Z[1] ^= V[1]; Z[2] ^= V[2]; Z[3] ^= V[3]; }
    const lsb = V[3] & 1;
    V[3] = (V[3] >>> 1) | (V[2] << 31); V[2] = (V[2] >>> 1) | (V[1] << 31); V[1] = (V[1] >>> 1) | (V[0] << 31); V[0] >>>= 1;
    if (lsb) V[0] ^= 0xe1000000;
  }
  return Z;
}
const words = (b, o = 0) => Uint32Array.of(
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0, ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0,
  ((b[o + 8] << 24) | (b[o + 9] << 16) | (b[o + 10] << 8) | b[o + 11]) >>> 0, ((b[o + 12] << 24) | (b[o + 13] << 16) | (b[o + 14] << 8) | b[o + 15]) >>> 0);
function ghash(H, aad, ct) {
  let Y = new Uint32Array(4);
  const blk = new Uint8Array(16);
  const feed = (d) => {
    for (let o = 0; o < d.length; o += 16) {
      blk.fill(0); blk.set(d.subarray(o, Math.min(o + 16, d.length)));
      const x = words(blk);
      Y = gmul(Uint32Array.of(Y[0] ^ x[0], Y[1] ^ x[1], Y[2] ^ x[2], Y[3] ^ x[3]), H);
    }
  };
  feed(aad); feed(ct);
  const lens = new Uint8Array(16);
  const al = aad.length * 8, cl = ct.length * 8;
  lens[4] = al >>> 24; lens[5] = al >>> 16; lens[6] = al >>> 8; lens[7] = al;
  lens[12] = cl >>> 24; lens[13] = cl >>> 16; lens[14] = cl >>> 8; lens[15] = cl;
  const x = words(lens);
  Y = gmul(Uint32Array.of(Y[0] ^ x[0], Y[1] ^ x[1], Y[2] ^ x[2], Y[3] ^ x[3]), H);
  const out = new Uint8Array(16);
  for (let i = 0; i < 4; i++) { out[4 * i] = Y[i] >>> 24; out[4 * i + 1] = Y[i] >>> 16; out[4 * i + 2] = Y[i] >>> 8; out[4 * i + 3] = Y[i]; }
  return out;
}
function ctr(w, iv, data) {
  const out = new Uint8Array(data.length);
  const cb = new Uint8Array(16); cb.set(iv); cb[15] = 2; // counter starts at 2 (1 is for the tag)
  for (let o = 0; o < data.length; o += 16) {
    const ks = aesEncrypt(w, cb);
    for (let i = 0; i < 16 && o + i < data.length; i++) out[o + i] = data[o + i] ^ ks[i];
    for (let i = 15; i >= 12; i--) { cb[i] = (cb[i] + 1) & 255; if (cb[i]) break; }
  }
  return out;
}
function tagFor(w, iv, aad, ct) {
  const H = words(aesEncrypt(w, new Uint8Array(16)));
  const S = ghash(H, aad, ct);
  const j0 = new Uint8Array(16); j0.set(iv); j0[15] = 1;
  const e = aesEncrypt(w, j0);
  return S.map((b, i) => b ^ e[i]);
}
export function gcmSeal(w, iv, aad, pt) { const ct = ctr(w, iv, pt); return cat(ct, tagFor(w, iv, aad, ct)); }
/** Returns plaintext or null when the tag does not verify. */
export function gcmOpen(w, iv, aad, ctTag) {
  if (ctTag.length < 16) return null;
  const ct = ctTag.subarray(0, ctTag.length - 16), tag = ctTag.subarray(ctTag.length - 16);
  const t = tagFor(w, iv, aad, ct);
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= t[i] ^ tag[i];
  return diff ? null : ctr(w, iv, ct);
}

// ---- QUIC initial keys
const SALTS = {
  1: '38762cf7f55934b34d179ae6a4c80cadccbb7f0a',
  0x6b3343cf: '0dede3def700a6db819381be6e269dcbf9bd2ed9',
  0xff00001d: 'afbfec289993d24c9e9786f19c6111e04390a899',
};
const hexb = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)));
export function isKnownVersion(v) { return SALTS[v] !== undefined; }
const keyCache = new Map();
/** { key schedule (aes round keys), iv, hp } for client or server Initial packets. */
export function initialKeys(dcid, version, server) {
  const ck = version + ':' + (server ? 's' : 'c') + ':' + Array.from(dcid).join('.');
  let k = keyCache.get(ck);
  if (k) return k;
  const salt = SALTS[version];
  if (!salt) return null;
  const init = hmac(hexb(salt), dcid);
  const secret = hkdfExpandLabel(init, server ? 'server in' : 'client in', 32);
  const v2 = version === 0x6b3343cf;
  k = {
    w: aesKey(hkdfExpandLabel(secret, v2 ? 'quicv2 key' : 'quic key', 16)),
    iv: hkdfExpandLabel(secret, v2 ? 'quicv2 iv' : 'quic iv', 12),
    hp: aesKey(hkdfExpandLabel(secret, v2 ? 'quicv2 hp' : 'quic hp', 16)),
  };
  if (keyCache.size > 256) keyCache.clear();
  keyCache.set(ck, k);
  return k;
}
function nonce(iv, pn) {
  const n = Uint8Array.from(iv);
  for (let i = 0; i < 4; i++) n[11 - i] ^= (pn >>> (8 * i)) & 255;
  return n;
}
/** Build a protected Initial packet. header ends with the (plain) packet number of pnLen bytes. */
export function quicProtectInitial(header, pnLen, pn, plaintext, dcid, version, server, keyDcid) {
  const k = initialKeys(keyDcid || dcid, version, server);
  const ct = gcmSeal(k.w, nonce(k.iv, pn), header, plaintext);
  const pkt = cat(header, ct);
  const pnOff = header.length - pnLen;
  const mask = aesEncrypt(k.hp, pkt.subarray(pnOff + 4, pnOff + 20));
  pkt[0] ^= mask[0] & 0x0f;
  for (let i = 0; i < pnLen; i++) pkt[pnOff + i] ^= mask[1 + i];
  return pkt;
}
/**
 * Remove header protection and decrypt. pkt = whole long-header packet bytes; pnOff = offset of the
 * packet number; returns { pn, pnLen, first, payload } or null.
 */
export function quicUnprotectInitial(pkt, pnOff, end, keyDcid, version, server) {
  const k = initialKeys(keyDcid, version, server);
  if (!k || pnOff + 20 > end) return null;
  const mask = aesEncrypt(k.hp, pkt.subarray(pnOff + 4, pnOff + 20));
  const first = pkt[0] ^ (mask[0] & 0x0f);
  const pnLen = (first & 3) + 1;
  const hdr = Uint8Array.from(pkt.subarray(0, pnOff + pnLen));
  hdr[0] = first;
  let pn = 0;
  for (let i = 0; i < pnLen; i++) { hdr[pnOff + i] ^= mask[1 + i]; pn = pn * 256 + hdr[pnOff + i]; }
  const payload = gcmOpen(k.w, nonce(k.iv, pn), hdr, pkt.subarray(pnOff + pnLen, end));
  if (!payload) return null;
  return { pn, pnLen, first, payload };
}

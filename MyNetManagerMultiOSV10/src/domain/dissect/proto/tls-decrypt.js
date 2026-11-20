// TLS decryption with a key log (Wireshark's "(Pre)-Master-Secret log filename" / pcapng Decryption
// Secrets Blocks): NSS key log lines → per-connection record keys → plaintext records.
//
//   TLS 1.2  CLIENT_RANDOM <client random> <master secret>
//            key_block = PRF(master, "key expansion", server_random + client_random); AES-GCM (4-byte salt +
//            8-byte explicit nonce), ChaCha20-Poly1305 (RFC 7905) and AES-CBC (explicit IV; MAC-then-encrypt
//            or encrypt-then-MAC, RFC 7366).
//   TLS 1.3  CLIENT_/SERVER_HANDSHAKE_TRAFFIC_SECRET and CLIENT_/SERVER_TRAFFIC_SECRET_0
//            key / iv = HKDF-Expand-Label(secret, "key" / "iv"); handshake keys until that side's Finished,
//            then the traffic secrets; KeyUpdate moves to the next secret ("traffic upd").
// Records are decrypted once, in the first pass, in order (the sequence number is part of the nonce).
import { cbcDecrypt, chachaDecrypt, expandLabel, gcmDecrypt, HASHES, prf12 } from './tls-crypto.js';

const hexOf = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

/** Cipher suites that can be decrypted: aead 'gcm' | 'chacha' | 'cbc', key length, MAC length (CBC), PRF / HKDF hash. */
export const SUITES = new Map([
  // TLS 1.3
  [0x1301, { aead: 'gcm', key: 16, hash: 'sha256', tls13: true }],
  [0x1302, { aead: 'gcm', key: 32, hash: 'sha384', tls13: true }],
  [0x1303, { aead: 'chacha', key: 32, hash: 'sha256', tls13: true }],
  // TLS 1.2 AES-GCM
  ...[0x009c, 0x009e, 0x00a2, 0xc02b, 0xc02d, 0xc02f, 0xc031].map((id) => [id, { aead: 'gcm', key: 16, hash: 'sha256' }]),
  ...[0x009d, 0x009f, 0x00a3, 0xc02c, 0xc02e, 0xc030, 0xc032].map((id) => [id, { aead: 'gcm', key: 32, hash: 'sha384' }]),
  // TLS 1.2 ChaCha20-Poly1305
  ...[0xcca8, 0xcca9, 0xccaa].map((id) => [id, { aead: 'chacha', key: 32, hash: 'sha256' }]),
  // TLS 1.2 AES-CBC with HMAC-SHA1 / SHA-256 / SHA-384
  ...[0x002f, 0x0033, 0xc004, 0xc009, 0xc00e, 0xc013].map((id) => [id, { aead: 'cbc', key: 16, mac: 20, hash: 'sha256' }]),
  ...[0x0035, 0x0039, 0xc005, 0xc00a, 0xc00f, 0xc014].map((id) => [id, { aead: 'cbc', key: 32, mac: 20, hash: 'sha256' }]),
  ...[0x003c, 0x0067, 0xc023, 0xc027].map((id) => [id, { aead: 'cbc', key: 16, mac: 32, hash: 'sha256' }]),
  ...[0x003d, 0x006b].map((id) => [id, { aead: 'cbc', key: 32, mac: 32, hash: 'sha256' }]),
  ...[0xc024, 0xc028].map((id) => [id, { aead: 'cbc', key: 32, mac: 48, hash: 'sha384' }]),
]);

/** Parses NSS key log text → Map(client random hex → { CLIENT_RANDOM, CLIENT_HANDSHAKE_TRAFFIC_SECRET, … } as bytes). */
export function parseKeyLog(text, into = new Map()) {
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*([A-Z_0-9]+)\s+([0-9a-fA-F]{64})\s+([0-9a-fA-F]+)\s*$/.exec(raw);
    if (!m) continue;
    const key = m[2].toLowerCase();
    let e = into.get(key);
    if (!e) into.set(key, e = {});
    e[m[1]] = fromHex(m[3]);
  }
  return into;
}

/** The session's key log: prefs.tlsKeyLog (Settings) plus the file's Decryption Secrets Blocks, parsed once. */
export function sessionKeys(session) {
  if (session._tlsKeys) return session._tlsKeys;
  const keys = new Map();
  parseKeyLog(session.prefs?.tlsKeyLog, keys);
  for (const s of session.file?.secrets ?? []) if (s.type === 'tls') parseKeyLog(s.text, keys);
  session._tlsKeys = keys;
  return keys;
}

const tls13Keys = (suite, secret) => ({ key: expandLabel(suite.hash, secret, 'key', suite.key), iv: expandLabel(suite.hash, secret, 'iv', 12), secret });

/**
 * Called on the first pass when a connection's ServerHello is known (TLS 1.3) or at its first Change
 * Cipher Spec (TLS 1.2). Fills c.dec = [client→server, server→client] direction states, or leaves it null.
 */
export function prepareKeys(session, c) {
  if (c.dec !== undefined || !c.crandom) return;
  const suite = SUITES.get(c.cipher);
  const entry = sessionKeys(session).get(hexOf(c.crandom));
  if (!suite || !entry) { c.dec = null; c.decWhy = !entry ? 'no key for this session in the key log' : `cipher suite 0x${c.cipher.toString(16).padStart(4, '0')} cannot be decrypted`; return; }
  if (c.version === 0x0304) {
    const chs = entry.CLIENT_HANDSHAKE_TRAFFIC_SECRET, shs = entry.SERVER_HANDSHAKE_TRAFFIC_SECRET;
    if (!chs || !shs) { c.dec = null; c.decWhy = 'the key log has no TLS 1.3 handshake secrets for this session'; return; }
    c.dec = [
      { suite, seq: 0n, ...tls13Keys(suite, chs), next: entry.CLIENT_TRAFFIC_SECRET_0 ?? null },
      { suite, seq: 0n, ...tls13Keys(suite, shs), next: entry.SERVER_TRAFFIC_SECRET_0 ?? null },
    ];
    return;
  }
  const master = entry.CLIENT_RANDOM;
  if (!master || !c.srandom) { c.dec = null; c.decWhy = 'the key log has no CLIENT_RANDOM (master secret) for this session'; return; }
  const ivLen = suite.aead === 'gcm' ? 4 : suite.aead === 'chacha' ? 12 : 16;
  const macLen = suite.aead === 'cbc' ? suite.mac : 0;
  const block = prf12(suite.hash, master, 'key expansion', new Uint8Array([...c.srandom, ...c.crandom]), 2 * (macLen + suite.key + ivLen));
  let o = 2 * macLen;
  const ck = block.slice(o, o += suite.key), sk = block.slice(o, o += suite.key);
  const civ = block.slice(o, o += ivLen), siv = block.slice(o, o += ivLen);
  c.dec = [{ suite, seq: 0n, key: ck, iv: civ, active: false }, { suite, seq: 0n, key: sk, iv: siv, active: false }];
}

const seqBytes = (seq) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, seq); return b; };
const xorNonce = (iv, seq) => { const n = Uint8Array.from(iv); const s = seqBytes(seq); for (let i = 0; i < 8; i++) n[4 + i] ^= s[i]; return n; };

/**
 * Decrypts one record of direction state `st` → { type, data } (TLS 1.3: the inner content type) or
 * { error }. header: the 5 record header bytes; body: the record's payload.
 */
export function decryptRecord(st, c, header, body) {
  const suite = st.suite;
  const type = header[0];
  const seq = st.seq;
  st.seq += 1n;
  let plain = null;
  if (suite.tls13) {
    const nonce = xorNonce(st.iv, seq);
    plain = suite.aead === 'chacha' ? chachaDecrypt(st.key, nonce, header, body) : gcmDecrypt(st.key, nonce, header, body);
    if (!plain) return { error: 'the record does not decrypt (authentication tag mismatch)' };
    let end = plain.length;
    while (end > 0 && plain[end - 1] === 0) end -= 1;
    if (!end) return { error: 'no inner content type' };
    return { type: plain[end - 1], data: plain.slice(0, end - 1) };
  }
  const aad = (len) => new Uint8Array([...seqBytes(seq), type, header[1], header[2], len >> 8, len & 0xff]);
  if (suite.aead === 'gcm') {
    if (body.length < 24) return { error: 'record too short' };
    const nonce = new Uint8Array([...st.iv, ...body.subarray(0, 8)]);
    plain = gcmDecrypt(st.key, nonce, aad(body.length - 24), body.subarray(8));
  } else if (suite.aead === 'chacha') {
    if (body.length < 16) return { error: 'record too short' };
    plain = chachaDecrypt(st.key, xorNonce(st.iv, seq), aad(body.length - 16), body);
  } else {
    // CBC: explicit IV, then (encrypt-then-MAC) ciphertext + MAC, or (MAC-then-encrypt) ciphertext of data + MAC + padding.
    const macLen = suite.mac;
    const enc = c.etm ? body.subarray(0, body.length - macLen) : body;
    if (enc.length < 32 || enc.length % 16) return { error: 'record length does not fit the block cipher' };
    const dec = cbcDecrypt(st.key, enc.subarray(0, 16), enc.subarray(16));
    const pad = dec[dec.length - 1];
    let end = dec.length - pad - 1;
    if (!c.etm) end -= macLen;
    if (end < 0) return { error: 'bad padding' };
    return { type, data: dec.slice(0, end) };
  }
  if (!plain) return { error: 'the record does not decrypt (authentication tag mismatch)' };
  return { type, data: plain };
}

/** TLS 1.3: after a side's Finished (or KeyUpdate) its records use the next traffic secret. */
export function nextTrafficKeys(st, handshakeTypes) {
  if (!st.suite.tls13) return;
  for (const t of handshakeTypes) {
    if (t === 20 && st.next) { Object.assign(st, tls13Keys(st.suite, st.next), { seq: 0n, next: null, app: true }); }
    else if (t === 24 && st.app) {
      const secret = expandLabel(st.suite.hash, st.secret, 'traffic upd', HASHES[st.suite.hash].len);
      Object.assign(st, tls13Keys(st.suite, secret), { seq: 0n });
    }
  }
}

/** The handshake message types in a run of handshake messages. */
export function handshakeTypes(data) {
  const types = [];
  for (let o = 0; o + 4 <= data.length;) {
    types.push(data[o]);
    o += 4 + ((data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]);
  }
  return types;
}

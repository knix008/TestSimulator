// PDF password protection: the standard security handler (ISO 32000-2 §7.6.4).
//
// pdf.js can *read* encrypted PDFs, but pdf-lib — which writes highlights,
// bookmarks and attachments back into the file — can neither decrypt nor
// encrypt. This module fills that gap:
//
//   loadPdfForEditing(bytes, { password })  → a pdf-lib PDFDocument with every
//       string and stream decrypted and /Encrypt removed, plus a description
//       of the protection it had.
//   encryptPdfBytes(bytes, { userPassword, ownerPassword, permissions, method })
//       → the same PDF protected with a password (AES-256 by default).
//
// Reading supports every standard-handler revision in use: RC4 40/128-bit
// (R2/R3), AES-128 (R4), and AES-256 (R5 and R6).
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFParser,
  PDFRawStream, PDFRef, PDFString, PDFBool,
} from 'pdf-lib';
import {
  aesCbcDecrypt, aesCbcEncrypt, bytesEqual, concatBytes, md5, randomBytes, rc4,
  sha256, sha384, sha512,
} from './pdf-crypto-core.js';

// Algorithm 2's password padding string.
const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);
const SALT_AES = Uint8Array.from([0x73, 0x41, 0x6c, 0x54]);   // "sAlT"
const ZERO_IV = new Uint8Array(16);

// Every permission granted (bits 1–2 must be 0; the rest 1).
export const ALL_PERMISSIONS = -4;

export const ENCRYPTION_METHODS = ['aes256', 'aes128', 'rc4-128', 'rc4-40'];

// Thrown when the password opens neither the user nor the owner entry.
export class PdfPasswordError extends Error {
  constructor(message = 'The password for this PDF is not correct.') {
    super(message);
    this.name = 'PdfPasswordError';
  }
}

// ── small helpers ─────────────────────────────────────────

const utf8 = (s) => new TextEncoder().encode(String(s ?? ''));

// R2–R4 passwords are bytes in PDFDocEncoding; Latin-1 matches it for every
// character a keyboard produces. Anything wider goes as UTF-8 (as pdf.js does).
function legacyPasswordBytes(password) {
  const s = String(password ?? '');
  const bytes = /^[\u0000-ÿ]*$/.test(s) ? Uint8Array.from(s, (ch) => ch.charCodeAt(0)) : utf8(s);
  return bytes.subarray(0, 32);
}
const modernPasswordBytes = (password) => utf8(password).subarray(0, 127);

function padPassword(pw) {
  const out = new Uint8Array(32);
  out.set(pw.subarray(0, 32));
  out.set(PAD.subarray(0, 32 - Math.min(32, pw.length)), Math.min(32, pw.length));
  return out;
}

const int32le = (n) => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);

const toHex = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

function stringBytes(obj) {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.asBytes();
  return null;
}

const nameOf = (obj) => (obj instanceof PDFName ? obj.decodeText() : null);
const numberOf = (obj, fallback) => (obj instanceof PDFNumber ? obj.asNumber() : fallback);

// Quick test for a PDF that carries an /Encrypt entry. A false positive only
// costs a slower load; loadPdfForEditing checks the real trailer.
export function mayBeEncrypted(bytes) {
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74];   // "/Encrypt"
  outer: for (let i = 0, n = bytes.length - needle.length; i <= n; i++) {
    if (bytes[i] !== 0x2f) continue;
    for (let j = 1; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// ── key derivation (R2–R4) ────────────────────────────────

function legacyFileKey({ pw, O, P, id0, R, keyBytes, encryptMetadata }) {
  const parts = [padPassword(pw), O.subarray(0, 32), int32le(P), id0];
  if (R >= 4 && !encryptMetadata) parts.push(Uint8Array.of(255, 255, 255, 255));
  let key = md5(concatBytes(...parts)).subarray(0, keyBytes);
  if (R >= 3) for (let i = 0; i < 50; i++) key = md5(key).subarray(0, keyBytes);
  return Uint8Array.from(key);
}

function legacyUserEntry(key, R, id0) {
  if (R === 2) return rc4(key, PAD);
  let x = rc4(key, md5(concatBytes(PAD, id0)));
  for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
  const out = new Uint8Array(32);
  out.set(x);   // the last 16 bytes are arbitrary padding
  return out;
}

function legacyOwnerKey(ownerPw, R, keyBytes) {
  let key = md5(padPassword(ownerPw));
  if (R >= 3) for (let i = 0; i < 50; i++) key = md5(key);
  return key.subarray(0, R === 2 ? 5 : keyBytes);
}

function legacyOwnerEntry(ownerPw, userPw, R, keyBytes) {
  const key = legacyOwnerKey(ownerPw, R, keyBytes);
  let x = rc4(key, padPassword(userPw));
  if (R >= 3) for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
  return x;
}

function checkLegacyUser(enc, pw) {
  const key = legacyFileKey({ ...enc, pw });
  const U = legacyUserEntry(key, enc.R, enc.id0);
  const n = enc.R === 2 ? 32 : 16;
  return bytesEqual(U, enc.U, n) ? key : null;
}

// Owner password → recovers the padded user password from /O, then the key.
function checkLegacyOwner(enc, pw) {
  const key = legacyOwnerKey(pw, enc.R, enc.keyBytes);
  let x = Uint8Array.from(enc.O.subarray(0, 32));
  if (enc.R === 2) x = rc4(key, x);
  else for (let i = 19; i >= 0; i--) x = rc4(key.map((b) => b ^ i), x);
  // x is the user password followed by (the start of) PAD.
  let len = 32;
  for (let n = 0; n <= 32; n++) {
    if (bytesEqual(x.subarray(n), PAD.subarray(0, 32 - n), 32 - n)) { len = n; break; }
  }
  const userPw = x.subarray(0, len);
  const fileKey = checkLegacyUser(enc, userPw);
  return fileKey ? { key: fileKey, userPw } : null;
}

// ── key derivation (R5/R6, AES-256) ───────────────────────

// Algorithm 2.B (R6) — or a single SHA-256 for the older R5.
function hash2B(pw, salt, udata, R) {
  let K = sha256(concatBytes(pw, salt, udata));
  if (R === 5) return K;
  for (let round = 0; ; round++) {
    const one = concatBytes(pw, K, udata);
    const K1 = new Uint8Array(one.length * 64);
    for (let i = 0; i < 64; i++) K1.set(one, i * one.length);
    const E = aesCbcEncrypt(K.subarray(0, 16), K.subarray(16, 32), K1, { pad: false });
    let sum = 0;
    for (let i = 0; i < 16; i++) sum += E[i];
    const mod = sum % 3;
    K = mod === 0 ? sha256(E) : mod === 1 ? sha384(E) : sha512(E);
    if (round >= 63 && E[E.length - 1] <= round - 31) break;
  }
  return K.subarray(0, 32);
}

function checkModern(enc, pw) {
  const { U, O, R } = enc;
  const u48 = U.subarray(0, 48);
  // Owner first: it grants everything and is what most tools try first too.
  if (bytesEqual(hash2B(pw, O.subarray(32, 40), u48, R), O, 32)) {
    const k = hash2B(pw, O.subarray(40, 48), u48, R);
    return { key: aesCbcDecrypt(k, ZERO_IV, enc.OE.subarray(0, 32), { unpad: false }), asOwner: true };
  }
  if (bytesEqual(hash2B(pw, U.subarray(32, 40), new Uint8Array(0), R), U, 32)) {
    const k = hash2B(pw, U.subarray(40, 48), new Uint8Array(0), R);
    return { key: aesCbcDecrypt(k, ZERO_IV, enc.UE.subarray(0, 32), { unpad: false }), asOwner: false };
  }
  return null;
}

// ── reading the /Encrypt dictionary ───────────────────────

function cryptFilterMethod(dict, filterName) {
  if (!filterName || filterName === 'Identity') return 'none';
  const cf = dict.lookup(PDFName.of('CF'));
  const f = cf instanceof PDFDict ? cf.lookup(PDFName.of(filterName)) : null;
  const cfm = f instanceof PDFDict ? nameOf(f.lookup(PDFName.of('CFM'))) : null;
  if (cfm === 'AESV2') return 'aes128';
  if (cfm === 'AESV3') return 'aes256';
  if (cfm === 'V2') return 'rc4';
  return 'none';
}

function readEncryptDict(dict, id0) {
  const filter = nameOf(dict.lookup(PDFName.of('Filter')));
  if (filter !== 'Standard') {
    throw new Error(`This PDF uses the "${filter || 'unknown'}" security handler, which is not supported.`);
  }
  const V = numberOf(dict.lookup(PDFName.of('V')), 0);
  const R = numberOf(dict.lookup(PDFName.of('R')), 2);
  const bytesOf = (k) => stringBytes(dict.lookup(PDFName.of(k))) || new Uint8Array(0);
  const em = dict.lookup(PDFName.of('EncryptMetadata'));
  const enc = {
    V, R,
    O: bytesOf('O'), U: bytesOf('U'), OE: bytesOf('OE'), UE: bytesOf('UE'),
    P: numberOf(dict.lookup(PDFName.of('P')), ALL_PERMISSIONS) | 0,
    id0: id0 || new Uint8Array(0),
    encryptMetadata: !(em instanceof PDFBool) || em.asBoolean(),
    keyBytes: 5,
  };
  if (V === 1) { enc.stream = 'rc4'; enc.string = 'rc4'; enc.keyBytes = 5; }
  else if (V === 2 || V === 3) {
    enc.stream = 'rc4'; enc.string = 'rc4';
    enc.keyBytes = Math.min(16, Math.max(5, numberOf(dict.lookup(PDFName.of('Length')), 40) / 8));
  } else if (V === 4 || V === 5) {
    enc.stream = cryptFilterMethod(dict, nameOf(dict.lookup(PDFName.of('StmF'))));
    enc.string = cryptFilterMethod(dict, nameOf(dict.lookup(PDFName.of('StrF'))));
    enc.keyBytes = V === 5 ? 32 : 16;
  } else {
    throw new Error(`Unsupported PDF encryption (V=${V}, R=${R}).`);
  }
  if (R >= 5 && (enc.U.length < 48 || enc.O.length < 48)) throw new Error('The PDF encryption dictionary is damaged.');
  return enc;
}

// Finds the file key for `password`; throws PdfPasswordError if it fits neither entry.
function authenticate(enc, password) {
  if (enc.R >= 5) {
    const hit = checkModern(enc, modernPasswordBytes(password));
    if (!hit) throw new PdfPasswordError();
    return { key: hit.key, asOwner: hit.asOwner, userPassword: hit.asOwner ? null : String(password ?? '') };
  }
  const pw = legacyPasswordBytes(password);
  const userKey = checkLegacyUser(enc, pw);
  if (userKey) return { key: userKey, asOwner: false, userPassword: String(password ?? '') };
  const owner = checkLegacyOwner(enc, pw);
  if (!owner) throw new PdfPasswordError();
  return {
    key: owner.key,
    asOwner: true,
    userPassword: new TextDecoder('latin1').decode(owner.userPw),
  };
}

// ── per-object crypt ──────────────────────────────────────

function objectKey(fileKey, ref, method, V) {
  if (V === 5) return fileKey;
  const n = ref.objectNumber, g = ref.generationNumber;
  const parts = [fileKey, Uint8Array.of(n & 255, (n >> 8) & 255, (n >> 16) & 255, g & 255, (g >> 8) & 255)];
  if (method === 'aes128') parts.push(SALT_AES);
  return md5(concatBytes(...parts)).subarray(0, Math.min(fileKey.length + 5, 16));
}

function decryptData(data, method, key) {
  if (method === 'rc4') return rc4(key, data);
  if (method === 'aes128' || method === 'aes256') {
    if (data.length < 16) return new Uint8Array(0);
    return aesCbcDecrypt(key, data.subarray(0, 16), data.subarray(16));
  }
  return data;
}

function encryptData(data, method, key) {
  if (method === 'rc4') return rc4(key, data);
  if (method === 'aes128' || method === 'aes256') {
    const iv = randomBytes(16);
    return concatBytes(iv, aesCbcEncrypt(key, iv, data));
  }
  return data;
}

const isSignatureDict = (dict) => {
  const type = nameOf(dict.lookup(PDFName.of('Type')));
  return type === 'Sig' || type === 'DocTimeStamp';
};

// Runs `fn(bytes)` over every string reachable from `obj` (without following
// references) and swaps in the result. Signature /Contents stay as they are.
function transformStrings(obj, fn) {
  if (obj instanceof PDFDict) {
    const sig = isSignatureDict(obj);
    for (const [key, value] of obj.entries()) {
      if (sig && key.decodeText() === 'Contents') continue;
      const next = transformValue(value, fn);
      if (next !== value) obj.set(key, next);
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) {
      const value = obj.get(i);
      const next = transformValue(value, fn);
      if (next !== value) obj.set(i, next);
    }
  }
}

function transformValue(value, fn) {
  const bytes = stringBytes(value);
  if (bytes) return PDFHexString.of(toHex(fn(bytes)));
  if (value instanceof PDFDict || value instanceof PDFArray) transformStrings(value, fn);
  return value;
}

// Applies string/stream crypt to one indirect object, in place.
function cryptObject(obj, ref, enc, key, direction) {
  const run = direction === 'decrypt' ? decryptData : encryptData;
  if (obj instanceof PDFRawStream) {
    const type = nameOf(obj.dict.lookup(PDFName.of('Type')));
    if (type === 'XRef') return obj;
    transformStrings(obj.dict, (b) => run(b, enc.string, objectKey(key, ref, enc.string, enc.V)));
    if (type === 'Metadata' && !enc.encryptMetadata) return obj;
    // A stream with its own /Crypt filter names that filter; only Identity
    // (no encryption) is ever used in practice.
    const filter = obj.dict.lookup(PDFName.of('Filter'));
    const first = filter instanceof PDFArray ? filter.lookup(0) : filter;
    if (nameOf(first) === 'Crypt') return obj;
    obj.contents = run(obj.contents, enc.stream, objectKey(key, ref, enc.stream, enc.V));
    return obj;
  }
  if (obj instanceof PDFHexString || obj instanceof PDFString) {
    return PDFHexString.of(toHex(run(obj.asBytes(), enc.string, objectKey(key, ref, enc.string, enc.V))));
  }
  transformStrings(obj, (b) => run(b, enc.string, objectKey(key, ref, enc.string, enc.V)));
  return obj;
}

// ── parsing with decryption ───────────────────────────────

// pdf-lib parses object streams (/Type /ObjStm) the moment it reads them, so an
// encrypted one has to be decrypted before that — inside the parser. This hooks
// one parser instance: the object read right after an "n g obj" header is
// handed to `onTopLevel(object, ref)` before pdf-lib looks at it.
function hookedParser(bytes, onTopLevel) {
  const parser = PDFParser.forBytesWithOptions(bytes, Infinity, false, false);
  const header = parser.parseIndirectObjectHeader.bind(parser);
  const parseObject = parser.parseObject.bind(parser);
  const parseIndirect = parser.parseIndirectObject.bind(parser);
  // Headers are also read by look-ahead helpers that parse no object after
  // them; only the ones inside parseIndirectObject count. Its header and
  // object are read synchronously, before the first await.
  let armed = false;
  let pending = null;
  parser.parseIndirectObject = () => {
    armed = true;
    try { return parseIndirect(); } finally { armed = false; pending = null; }
  };
  parser.parseIndirectObjectHeader = () => {
    const ref = header();
    if (armed) pending = ref;
    return ref;
  };
  parser.parseObject = () => {
    const ref = pending;
    pending = null;
    const obj = parseObject();
    return ref ? onTopLevel(obj, ref) : obj;
  };
  return parser;
}

const sameRef = (a, b) => a instanceof PDFRef && b instanceof PDFRef
  && a.objectNumber === b.objectNumber && a.generationNumber === b.generationNumber;

function firstId(context) {
  const id = context.trailerInfo.ID;
  const arr = id instanceof PDFArray ? id : (id ? context.lookup(id) : null);
  return arr instanceof PDFArray ? stringBytes(arr.get(0)) : null;
}

function describe(enc, auth) {
  const method = enc.R >= 5 ? 'aes256'
    : enc.stream === 'aes128' ? 'aes128'
      : enc.keyBytes > 5 ? 'rc4-128' : 'rc4-40';
  return {
    method,
    revision: enc.R,
    permissions: enc.P,
    openedAsOwner: auth.asOwner,
    // Known when the password given was the user password, or for R2–R4 when
    // it was the owner password (the user password is recoverable then).
    userPassword: auth.userPassword,
  };
}

// Loads `bytes` into pdf-lib for editing. Encrypted files are decrypted with
// `password` (user or owner password; '' covers "owner-only" protection) and
// come back as a plain document; `security` describes what was removed.
export async function loadPdfForEditing(bytes, { password = '' } = {}) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!mayBeEncrypted(src)) {
    return { pdfDoc: await PDFDocument.load(src, { updateMetadata: false }), security: null };
  }

  // Pass 1: find the trailer's /Encrypt and /ID. Object streams are skipped,
  // since their bytes are still ciphertext (the /Encrypt dictionary itself
  // never lives in one).
  const probe = hookedParser(src, (obj) => {
    if (obj instanceof PDFRawStream && nameOf(obj.dict.lookup(PDFName.of('Type'))) === 'ObjStm') {
      obj.dict.set(PDFName.of('Type'), PDFName.of('EncryptedObjStm'));
    }
    return obj;
  });
  const probeCtx = await probe.parseDocument();
  const encEntry = probeCtx.trailerInfo.Encrypt;
  const encDict = encEntry ? probeCtx.lookup(encEntry) : null;
  if (!(encDict instanceof PDFDict)) {
    return { pdfDoc: await PDFDocument.load(src, { updateMetadata: false }), security: null };
  }
  const enc = readEncryptDict(encDict, firstId(probeCtx));
  const auth = authenticate(enc, password);

  // Pass 2: the real parse, decrypting each top-level object as it is read.
  const parser = hookedParser(src, (obj, ref) => {
    if (sameRef(ref, encEntry)) return obj;
    return cryptObject(obj, ref, enc, auth.key, 'decrypt');
  });
  const context = await parser.parseDocument();
  const encRef = context.trailerInfo.Encrypt;
  if (encRef instanceof PDFRef) context.delete(encRef);
  delete context.trailerInfo.Encrypt;
  // The PDFDocument constructor is private in pdf-lib's typings only; this is
  // what PDFDocument.load does after parsing.
  const pdfDoc = new PDFDocument(context, false, false);
  return { pdfDoc, security: describe(enc, auth) };
}

// Decrypts a PDF and returns plain bytes.
export async function decryptPdfBytes(bytes, password = '') {
  const { pdfDoc } = await loadPdfForEditing(bytes, { password });
  const out = await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false });
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

// ── encryption ────────────────────────────────────────────

function buildEncryptDict(context, { method, userPassword, ownerPassword, permissions, id0 }) {
  const P = permissions | 0;
  const hex = (b) => PDFHexString.of(toHex(b));
  if (method === 'aes256') {
    const R = 6;
    const upw = modernPasswordBytes(userPassword);
    const opw = modernPasswordBytes(ownerPassword);
    const key = randomBytes(32);
    const uSalt = randomBytes(16);
    const U = concatBytes(hash2B(upw, uSalt.subarray(0, 8), new Uint8Array(0), R), uSalt);
    const UE = aesCbcEncrypt(hash2B(upw, uSalt.subarray(8, 16), new Uint8Array(0), R), ZERO_IV, key, { pad: false });
    const oSalt = randomBytes(16);
    const O = concatBytes(hash2B(opw, oSalt.subarray(0, 8), U, R), oSalt);
    const OE = aesCbcEncrypt(hash2B(opw, oSalt.subarray(8, 16), U, R), ZERO_IV, key, { pad: false });
    const permsPlain = concatBytes(int32le(P), Uint8Array.of(255, 255, 255, 255, 0x54, 0x61, 0x64, 0x62), randomBytes(4));
    const Perms = aesCbcEncrypt(key, ZERO_IV, permsPlain, { pad: false });
    const dict = context.obj({
      Filter: 'Standard', V: 5, R, Length: 256, P,
      CF: { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 } },
      StmF: 'StdCF', StrF: 'StdCF',
    });
    dict.set(PDFName.of('O'), hex(O));
    dict.set(PDFName.of('U'), hex(U));
    dict.set(PDFName.of('OE'), hex(OE));
    dict.set(PDFName.of('UE'), hex(UE));
    dict.set(PDFName.of('Perms'), hex(Perms));
    dict.set(PDFName.of('EncryptMetadata'), PDFBool.True);
    return { dict, key, enc: { V: 5, R, stream: 'aes256', string: 'aes256', encryptMetadata: true } };
  }

  const spec = {
    'aes128': { V: 4, R: 4, keyBytes: 16, cipher: 'aes128' },
    'rc4-128': { V: 2, R: 3, keyBytes: 16, cipher: 'rc4' },
    'rc4-40': { V: 1, R: 2, keyBytes: 5, cipher: 'rc4' },
  }[method];
  if (!spec) throw new Error(`Unknown encryption method "${method}".`);
  const upw = legacyPasswordBytes(userPassword);
  const opw = legacyPasswordBytes(ownerPassword);
  const O = legacyOwnerEntry(opw, upw, spec.R, spec.keyBytes);
  const key = legacyFileKey({ pw: upw, O, P, id0, R: spec.R, keyBytes: spec.keyBytes, encryptMetadata: true });
  const U = legacyUserEntry(key, spec.R, id0);
  const fields = { Filter: 'Standard', V: spec.V, R: spec.R, Length: spec.keyBytes * 8, P };
  if (spec.V === 4) {
    fields.CF = { StdCF: { AuthEvent: 'DocOpen', CFM: 'AESV2', Length: 16 } };
    fields.StmF = 'StdCF';
    fields.StrF = 'StdCF';
  }
  const dict = context.obj(fields);
  dict.set(PDFName.of('O'), hex(O));
  dict.set(PDFName.of('U'), hex(U));
  return { dict, key, enc: { V: spec.V, R: spec.R, stream: spec.cipher, string: spec.cipher, encryptMetadata: true } };
}

// Protects a PDF with a password. `bytes` may itself be encrypted, in which
// case `currentPassword` opens it first. The owner password defaults to a
// random one, so only the user password is needed to open the file.
export async function encryptPdfBytes(bytes, {
  userPassword = '',
  ownerPassword,
  permissions = ALL_PERMISSIONS,
  method = 'aes256',
  currentPassword = '',
} = {}) {
  const { pdfDoc } = await loadPdfForEditing(bytes, { password: currentPassword });
  const context = pdfDoc.context;

  let id0 = firstId(context);
  if (!id0 || !id0.length) {
    id0 = randomBytes(16);
    context.trailerInfo.ID = context.obj([PDFHexString.of(toHex(id0)), PDFHexString.of(toHex(id0))]);
  }

  const owner = ownerPassword == null || ownerPassword === '' ? toHex(randomBytes(16)) : ownerPassword;
  const { dict, key, enc } = buildEncryptDict(context, {
    method, userPassword, ownerPassword: owner, permissions, id0,
  });

  // The trailer /ID is never encrypted; it is direct in the trailer, so the
  // object walk below does not reach it.
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    const next = cryptObject(obj, ref, enc, key, 'encrypt');
    if (next !== obj) context.assign(ref, next);
  }
  context.trailerInfo.Encrypt = context.register(dict);

  const out = await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false });
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

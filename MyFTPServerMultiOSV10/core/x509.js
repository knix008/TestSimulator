// Self-signed TLS certificates for FTPS, and loading of the certificate the
// user configured — with nothing but node:crypto.
//
// generateSelfSigned({ commonName, validityYears }) builds the X.509 v3
// structure by hand (a small DER encoder below), signs it with a fresh RSA
// 2048 key (SHA-256) and returns PEM strings. The certificate carries the
// same extensions the WinForms original set (basicConstraints CA:FALSE,
// keyUsage digitalSignature+keyEncipherment, extKeyUsage serverAuth) plus a
// subjectAltName so hostname checks pass for the CN.
//
// loadCertificate({ certPath, keyPath, password }) accepts
//   • one PEM with the certificate and the key
//   • a certificate PEM + a separate key PEM (keyPath, or <name>_key.pem /
//     <name>.key next to it)
//   • a .pfx / .p12 with a password (Node's TLS reads PKCS#12 natively)
// and returns the options for tls.createSecureContext.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const net = require('net');

// ── DER ──
const len = (n) => {
  if (n < 0x80) return Buffer.from([n]);
  const b = [];
  while (n > 0) { b.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | b.length, ...b]);
};
const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), len(content.length), content]);
const seq = (...parts) => tlv(0x30, Buffer.concat(parts));
const set = (...parts) => tlv(0x31, Buffer.concat(parts));
const int = (buf) => { if (typeof buf === 'number') buf = Buffer.from([buf]); if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]); return tlv(0x02, buf); };
const nul = () => Buffer.from([0x05, 0x00]);
const bool = (v) => Buffer.from([0x01, 0x01, v ? 0xff : 0x00]);
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const octets = (b) => tlv(0x04, b);
const bits = (b, unused = 0) => tlv(0x03, Buffer.concat([Buffer.from([unused]), b]));
const ctx = (n, content) => tlv(0xa0 | n, content);          // [n] EXPLICIT
const ctxPrim = (n, content) => tlv(0x80 | n, content);      // [n] IMPLICIT primitive
const oid = (s) => {
  const p = s.split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const b = [v & 0x7f];
    let x = v >> 7;
    while (x > 0) { b.unshift(0x80 | (x & 0x7f)); x >>= 7; }
    out.push(...b);
  }
  return tlv(0x06, Buffer.from(out));
};
const time = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const body = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return y < 2050 ? tlv(0x17, Buffer.from(String(y).slice(2) + body)) : tlv(0x18, Buffer.from(String(y) + body));
};

const OID = {
  cn: '2.5.4.3',
  sha256WithRSA: '1.2.840.113549.1.1.11',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  subjectAltName: '2.5.29.17',
  serverAuth: '1.3.6.1.5.5.7.3.1',
  clientAuth: '1.3.6.1.5.5.7.3.2',
};

function name(cn) { return seq(set(seq(oid(OID.cn), utf8(cn)))); }
function extension(id, critical, value) { return critical ? seq(oid(id), bool(true), octets(value)) : seq(oid(id), octets(value)); }

function altName(cn) {
  if (net.isIPv4(cn)) return ctxPrim(7, Buffer.from(cn.split('.').map(Number)));
  if (net.isIPv6(cn)) return ctxPrim(7, ipv6Bytes(cn));
  return ctxPrim(2, Buffer.from(cn, 'ascii'));
}

function ipv6Bytes(ip) {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  const out = Buffer.alloc(16);
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g || '0', 16), i * 2));
  return out;
}

// Returns { cert: pem, key: pem, fingerprint, notAfter }.
function generateSelfSigned({ commonName = 'localhost', validityYears = 5, bits: modulusLength = 2048 } = {}) {
  const cn = String(commonName || 'localhost').trim() || 'localhost';
  const years = Math.min(30, Math.max(1, Number(validityYears) || 5));
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: modulusLength === 4096 ? 4096 : 2048 });

  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;                                    // positive INTEGER
  const notBefore = new Date(Date.now() - 24 * 3600 * 1000);   // -1 day: clock skew
  const notAfter = new Date(notBefore.getTime() + (years * 365 + 2) * 24 * 3600 * 1000);
  const sigAlg = seq(oid(OID.sha256WithRSA), nul());
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const extensions = ctx(3, seq(
    extension(OID.basicConstraints, true, seq()),                                 // CA:FALSE
    extension(OID.keyUsage, true, bits(Buffer.from([0xa0]), 5)),                  // digitalSignature | keyEncipherment
    extension(OID.extKeyUsage, false, seq(oid(OID.serverAuth), oid(OID.clientAuth))),
    extension(OID.subjectAltName, false, seq(altName(cn))),
  ));
  const tbs = seq(
    ctx(0, int(2)),                 // version v3
    int(serial),
    sigAlg,
    name(cn),                       // issuer = subject (self-signed)
    seq(time(notBefore), time(notAfter)),
    name(cn),
    spki,
    extensions,
  );
  const signature = crypto.sign('sha256', tbs, privateKey);
  const der = seq(tbs, sigAlg, bits(signature, 0));

  const cert = pem('CERTIFICATE', der);
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const x = new crypto.X509Certificate(cert);   // throws if the structure is broken
  return { cert, key, fingerprint: x.fingerprint256, subject: x.subject, notAfter: x.validTo };
}

function pem(label, der) {
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n').replace(/\n$/, '');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

// Writes cert + key next to each other and returns both paths.
function writeSelfSigned(certFile, opts) {
  const generated = generateSelfSigned(opts);
  const dir = path.dirname(certFile);
  fs.mkdirSync(dir, { recursive: true });
  const base = certFile.replace(/\.(pem|crt|cer)$/i, '');
  const keyFile = `${base}_key.pem`;
  fs.writeFileSync(certFile, generated.cert, 'utf-8');
  fs.writeFileSync(keyFile, generated.key, { encoding: 'utf-8', mode: 0o600 });
  return { certPath: certFile, keyPath: keyFile, fingerprint: generated.fingerprint, subject: generated.subject, notAfter: generated.notAfter };
}

// tls options for the configured certificate, plus a summary for the log.
function loadCertificate({ certPath, keyPath = '', password = '' }) {
  const file = String(certPath || '').trim();
  if (!file) { const e = new Error('No certificate configured'); e.code = 'ECERT'; throw e; }
  if (!fs.existsSync(file)) { const e = new Error(`Certificate file not found: ${file}`); e.code = 'ENOENT'; e.path = file; throw e; }
  const ext = path.extname(file).toLowerCase();
  let options;
  if (ext === '.pfx' || ext === '.p12') {
    options = { pfx: fs.readFileSync(file), passphrase: password || undefined };
  } else {
    const text = fs.readFileSync(file, 'utf-8');
    if (!/-----BEGIN CERTIFICATE-----/.test(text)) { const e = new Error(`Not a PEM certificate: ${file}`); e.code = 'ECERT'; e.path = file; throw e; }
    let key = /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(text) ? text : '';
    if (!key) {
      const candidates = [String(keyPath || '').trim(), file.replace(/\.(pem|crt|cer)$/i, '') + '_key.pem', file.replace(/\.(pem|crt|cer)$/i, '') + '.key', file.replace(/\.(pem|crt|cer)$/i, '.key')].filter(Boolean);
      const found = candidates.find((c) => fs.existsSync(c));
      if (!found) { const e = new Error(`Private key not found for ${file} (looked for ${candidates.join(', ')})`); e.code = 'EKEY'; e.path = file; throw e; }
      key = fs.readFileSync(found, 'utf-8');
    }
    options = { cert: text, key, passphrase: password || undefined };
  }
  // Fail now, with a readable message, rather than at the first connection.
  const tls = require('tls');
  const context = tls.createSecureContext(options);
  let summary = { subject: path.basename(file), expires: '' };
  try {
    const x = ext === '.pfx' || ext === '.p12' ? null : new crypto.X509Certificate(options.cert);
    if (x) summary = { subject: x.subject.replace(/\n/g, ', '), expires: x.validTo, fingerprint: x.fingerprint256 };
  } catch { /* summary is optional */ }
  return { options, context, summary };
}

// Quick info for the UI (subject / expiry) without starting anything.
function inspectCertificate(certPath) {
  try {
    const ext = path.extname(certPath).toLowerCase();
    if (ext === '.pfx' || ext === '.p12') return { ok: fs.existsSync(certPath), kind: 'pfx' };
    const x = new crypto.X509Certificate(fs.readFileSync(certPath, 'utf-8'));
    return { ok: true, kind: 'pem', subject: x.subject.replace(/\n/g, ', '), validFrom: x.validFrom, validTo: x.validTo, fingerprint: x.fingerprint256 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { generateSelfSigned, writeSelfSigned, loadCertificate, inspectCertificate };

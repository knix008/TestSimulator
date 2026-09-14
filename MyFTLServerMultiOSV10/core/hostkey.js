// SFTP (SSH) host key: an RSA private key in PEM, created on first use
// (<configDir>/ssh_host_rsa.pem by default). The fingerprint is the one
// OpenSSH-style clients (FileZilla, WinSCP, ssh) show on first connection:
// SHA-256 over the public key in SSH wire format, base64 without padding.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { utils } = require('ssh2');

function defaultKeyPath(configDir) { return path.join(configDir, 'ssh_host_rsa.pem'); }

function resolveKeyPath(configDir, custom) {
  const p = String(custom || '').trim();
  return p || defaultKeyPath(configDir);
}

// Creates a new RSA key at `file` (overwrites). Async: 2048-bit generation
// takes a moment and must not freeze the UI process.
function generateKey(file, bits = 2048) {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair('rsa', { modulusLength: bits === 4096 ? 4096 : 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } }, (err, _pub, privateKey) => {
      if (err) return reject(err);
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, privateKey, { encoding: 'utf-8', mode: 0o600 });
        resolve(file);
      } catch (e) { reject(e); }
    });
  });
}

// Returns the PEM, creating the key when the file does not exist.
async function ensureKey(file) {
  if (!fs.existsSync(file)) await generateKey(file);
  return fs.readFileSync(file, 'utf-8');
}

// { fingerprint: 'SHA256:…', type: 'ssh-rsa', bits } or { error } when unreadable.
function inspectKey(file) {
  try {
    if (!fs.existsSync(file)) return { exists: false };
    const pem = fs.readFileSync(file, 'utf-8');
    const parsed = utils.parseKey(pem);
    if (parsed instanceof Error) throw parsed;
    const key = Array.isArray(parsed) ? parsed[0] : parsed;
    const pub = key.getPublicSSH();
    const fp = crypto.createHash('sha256').update(pub).digest('base64').replace(/=+$/, '');
    const md5 = crypto.createHash('md5').update(pub).digest('hex').match(/../g).join(':');
    let bits = 0;
    try { bits = crypto.createPublicKey(key.getPublicPEM()).asymmetricKeyDetails.modulusLength || 0; } catch { /* optional */ }
    return { exists: true, type: key.type, bits, fingerprint: `SHA256:${fp}`, md5: `MD5:${md5}`, publicKey: `${key.type} ${pub.toString('base64')}` };
  } catch (err) {
    return { exists: true, error: err.message };
  }
}

module.exports = { defaultKeyPath, resolveKeyPath, generateKey, ensureKey, inspectKey };

// The synchronous crypto of TLS decryption (src/domain/dissect/proto/tls-crypto.js) against Node's crypto.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { aesDecryptBlock, aesEncryptBlock, aesExpand, cbcDecrypt, chachaDecrypt, expandLabel, gcmDecrypt, hmacWith, prf12, sha256, sha384 } from '../../src/domain/dissect/proto/tls-crypto.js';

const rnd = (n) => new Uint8Array(crypto.randomBytes(n));
const hex = (b) => Buffer.from(b).toString('hex');

test('tls crypto: SHA-256 / SHA-384 and HMAC match Node for many lengths', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 111, 112, 127, 128, 129, 1000, 4097]) {
    const m = rnd(n);
    assert.equal(hex(sha256(m)), crypto.createHash('sha256').update(m).digest('hex'), `sha256 ${n}`);
    assert.equal(hex(sha384(m)), crypto.createHash('sha384').update(m).digest('hex'), `sha384 ${n}`);
    const key = rnd(n % 200);
    assert.equal(hex(hmacWith('sha384', key, m)), crypto.createHmac('sha384', key).update(m).digest('hex'), `hmac384 ${n}`);
    assert.equal(hex(hmacWith('sha256', key, m)), crypto.createHmac('sha256', key).update(m).digest('hex'), `hmac256 ${n}`);
  }
});

test('tls crypto: AES-128 / AES-256 blocks, CBC and GCM match Node', () => {
  for (const bits of [128, 256]) {
    for (let k = 0; k < 20; k++) {
      const key = rnd(bits / 8), block = rnd(16);
      const c = crypto.createCipheriv(`aes-${bits}-ecb`, key, null).setAutoPadding(false);
      const enc = new Uint8Array(Buffer.concat([c.update(block), c.final()]));
      assert.equal(hex(aesEncryptBlock(aesExpand(key), block)), hex(enc));
      assert.equal(hex(aesDecryptBlock(aesExpand(key), enc)), hex(block));
    }
    const key = rnd(bits / 8), iv = rnd(16), pt = rnd(160);
    const c = crypto.createCipheriv(`aes-${bits}-cbc`, key, iv).setAutoPadding(false);
    assert.equal(hex(cbcDecrypt(key, iv, new Uint8Array(Buffer.concat([c.update(pt), c.final()])))), hex(pt));
    for (const n of [0, 1, 16, 17, 100, 1500]) {
      const nonce = rnd(12), aad = rnd(13), msg = rnd(n);
      const g = crypto.createCipheriv(`aes-${bits}-gcm`, key, nonce); g.setAAD(aad);
      const ct = Buffer.concat([g.update(msg), g.final(), g.getAuthTag()]);
      assert.equal(hex(gcmDecrypt(key, nonce, aad, new Uint8Array(ct))), hex(msg), `gcm ${bits} ${n}`);
      ct[0] ^= 1;
      if (n) assert.equal(gcmDecrypt(key, nonce, aad, new Uint8Array(ct)), null, 'a changed byte fails the tag');
    }
  }
});

test('tls crypto: ChaCha20-Poly1305 matches Node', () => {
  for (const n of [0, 1, 63, 64, 65, 300, 1500]) {
    const key = rnd(32), nonce = rnd(12), aad = rnd(13), msg = rnd(n);
    const c = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 }); c.setAAD(aad, { plaintextLength: n });
    const ct = Buffer.concat([c.update(msg), c.final(), c.getAuthTag()]);
    assert.equal(hex(chachaDecrypt(key, nonce, aad, new Uint8Array(ct))), hex(msg), `chacha ${n}`);
    ct[ct.length - 1] ^= 1;
    assert.equal(chachaDecrypt(key, nonce, aad, new Uint8Array(ct)), null);
  }
});

test('tls crypto: HKDF-Expand-Label (RFC 8448 values) and the TLS 1.2 PRF', () => {
  // RFC 8448 §3: server handshake traffic secret → server write key / iv.
  const secret = Uint8Array.from(Buffer.from('b67b7d690cc16c4e75e54213cb2d37b4e9c912bcded9105d42befd59d391ad38', 'hex'));
  assert.equal(hex(expandLabel('sha256', secret, 'key', 16)), '3fce516009c21727d0f2e4e86ee403bc');
  assert.equal(hex(expandLabel('sha256', secret, 'iv', 12)), '5d313eb2671276ee13000b30');
  // TLS 1.2 PRF (SHA-256) test vector from the IETF TLS list (Joseph Birr-Pixton).
  const out = prf12('sha256', Uint8Array.from(Buffer.from('9bbe436ba940f017b17652849a71db35', 'hex')), 'test label', Uint8Array.from(Buffer.from('a0ba9f936cda311827a6f796ffd5198c', 'hex')), 100);
  assert.equal(hex(out).slice(0, 64), 'e3f229ba727be17b8d122620557cd453c2aab21d07c3d495329b52d4e61edb5a');
});

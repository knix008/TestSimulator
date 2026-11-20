// TLS decryption with a key log (tls-decrypt.js + tls.js) on the "tls-keylog" sample: real TLS 1.3 / 1.2
// sessions recorded from Node's OpenSSL (AES-128/256-GCM, ChaCha20-Poly1305, AES-CBC with SHA-1 / SHA-384
// and encrypt-then-MAC). The tshark witness compares the same capture with Wireshark field by field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { readCapture, writePcapng } from '../../src/domain/capture/pcap.js';
import { parseKeyLog } from '../../src/domain/dissect/proto/tls-decrypt.js';
import { TLS_KEYLOG, TLS_SESSIONS } from '../../src/domain/capture/build/tls-keylog-data.js';

const build = () => SAMPLES.find((s) => s.id === 'tls-keylog').build();
async function open(file, prefs = {}) {
  const doc = new CaptureDoc({ name: 'tls', file, prefs });
  await doc.firstPass();
  return doc;
}
const values = (doc, name) => doc.frames.flatMap((_, i) => (doc.dissection(i).fields.get(name) ?? []).map((n) => n.value));
// A response repeats its request's URI, so each URI once.
const uris = (doc) => [...new Set(values(doc, 'http.request.uri'))];
const td = new TextDecoder();

test('key log: NSS lines by client random, TLS 1.2 and 1.3 labels', () => {
  const keys = parseKeyLog(TLS_KEYLOG);
  assert.equal(keys.size, TLS_SESSIONS.length);
  const kinds = [...keys.values()].map((e) => Object.keys(e).sort().join(','));
  assert.equal(kinds.filter((k) => k.includes('CLIENT_TRAFFIC_SECRET_0')).length, 3, 'three TLS 1.3 sessions');
  assert.equal(kinds.filter((k) => k === 'CLIENT_RANDOM').length, 4, 'four TLS 1.2 sessions');
  assert.equal(parseKeyLog('# comment\nnot a key line\nCLIENT_RANDOM zz 00').size, 0);
});

test('tls decryption: every session shows its HTTP request and the whole response body', async () => {
  const doc = await open(build());
  assert.deepEqual(uris(doc), TLS_SESSIONS.map((s) => s.path), 'one request per session, in order');
  assert.deepEqual(values(doc, 'http.response.code'), TLS_SESSIONS.map(() => 200));
  assert.ok(values(doc, 'http.request.full_uri').length && values(doc, 'http.request.full_uri').every((u) => u.startsWith('https://intranet.example/')), 'https:// inside TLS');
  // The two big responses (20 kB, several TLS records) are reassembled whole.
  for (const s of TLS_SESSIONS) {
    const no = doc.frames.findIndex((_, i) => doc.dissection(i).fields.get('http.response_for.uri')?.[0]?.value?.endsWith(s.path) || false);
    const i = no >= 0 ? no : doc.frames.findIndex((_, k) => {
      const d = doc.dissection(k);
      return d.fields.has('http.response.code') && d.fields.get('tcp.srcport')?.[0]?.value === 443 && d.fields.get('tcp.dstport')?.[0]?.value === 50100 + TLS_SESSIONS.indexOf(s);
    });
    const d = doc.dissection(i);
    const length = Number(d.fields.get('http.content_length')?.[0]?.value ?? d.fields.get('http.content_length_header')?.[0]?.value);
    const source = d.sources.find((x) => /^(Reassembled|Decrypted) TLS/.test(x.name) && td.decode(x.data).startsWith('HTTP/1.1 200'));
    assert.ok(source, `${s.label}: no decrypted response source`);
    const text = td.decode(source.data);
    assert.equal(text.length - text.indexOf('\r\n\r\n') - 4, length, `${s.label}: the whole body (${length} bytes) is there`);
    assert.ok(text.includes(s.label) || text.startsWith('HTTP/1.1 200 OK\r\nContent-Type: text/csv'), `${s.label}: body text`);
  }
  // Close Notify alerts and the TLS 1.2 Finished messages decrypt too.
  assert.equal(values(doc, 'tls.alert_message.desc').filter((v) => v === 0).length, TLS_SESSIONS.length * 2);
  assert.ok(values(doc, 'tls.handshake.type').filter((v) => v === 20).length >= TLS_SESSIONS.length * 2, 'Finished from both sides');
  assert.deepEqual(values(doc, 'tls.decryption_failed'), []);
  assert.deepEqual(doc.session.bugs, []);
});

test('tls decryption: the same keys from a loaded key log, none without keys, a wrong key says so', async () => {
  const bare = build();
  bare.secrets = [];
  const none = await open(bare);
  assert.deepEqual(uris(none), [], 'no keys: nothing decrypted');
  const loaded = await open(bare, { tlsKeyLog: TLS_KEYLOG });
  assert.deepEqual(uris(loaded), TLS_SESSIONS.map((s) => s.path), 'keys from Settings (prefs.tlsKeyLog)');
  // Change one byte of every secret: the records do not authenticate and are marked, not shown as garbage.
  const wrong = TLS_KEYLOG.replace(/^(\S+ \S+ )([0-9a-f])/gm, (m, head, c) => head + (c === '0' ? '1' : '0'));
  const bad = await open(bare, { tlsKeyLog: wrong });
  assert.deepEqual(uris(bad), []);
  assert.ok(values(bad, 'tls.decryption_failed').length > 0, 'failed records are marked');
});

test('tls decryption: Decryption Secrets Blocks survive saving as pcapng and reading back', async () => {
  const bytes = writePcapng(build());
  const back = readCapture(bytes, 'tls-keylog.pcapng');
  assert.equal(back.secrets.length, 1);
  assert.equal(back.secrets[0].type, 'tls');
  assert.equal(back.secrets[0].text, TLS_KEYLOG);
  const doc = await open(back);
  assert.equal(uris(doc).length, TLS_SESSIONS.length);
});

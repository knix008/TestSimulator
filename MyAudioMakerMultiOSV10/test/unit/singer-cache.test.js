// AI voice: cache keys (an unchanged song is not sung again; a phrase that only moved is reused),
// the download catalog, and the vocoder each bank sings through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phraseKey, vocalCacheKey } from '../../src/audio/singer/index.js';
import { CATALOG, externalVocoder, PC_NSF_ID, TIGER_ID, vocoderFor } from '../../src/audio/singer/catalog.js';
import { splitPhrases } from '../../src/audio/singer/timing.js';
import { findRoot, unzipStream } from '../../src/audio/singer/storage.js';
import { zipSync } from 'fflate';

const song = { bpm: 100, swing: 0, language: 'ko' };
const track = { notes: [{ t: 0, d: 1, p: 60, v: 0.8, syl: '사' }, { t: 1, d: 1, p: 62, v: 0.8, syl: '랑' }] };

test('the song key follows notes, syllables, tempo, swing, bank, voice colour and quality', () => {
  const key = vocalCacheKey(song, track, 'tiger');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(vocalCacheKey({ ...song }, JSON.parse(JSON.stringify(track)), 'tiger'), key, 'same input, same key');
  const other = (patch) => vocalCacheKey(patch.song ?? song, patch.track ?? track, patch.bank ?? 'tiger', patch.opts ?? {});
  const keys = [
    other({ song: { ...song, bpm: 101 } }),
    other({ song: { ...song, swing: 0.2 } }),
    other({ track: { notes: [{ ...track.notes[0], syl: '나' }, track.notes[1]] } }),
    other({ track: { notes: [{ ...track.notes[0], p: 61 }, track.notes[1]] } }),
    other({ bank: 'bank-x' }),
    other({ opts: { speaker: 'dsacoustic/tiger_disco' } }),
    other({ opts: { steps: 50 } }),
  ];
  for (const k of keys) assert.notEqual(k, key);
  assert.equal(new Set(keys).size, keys.length);
});

test('a phrase that only moved keeps its key; a changed one does not', () => {
  const [a] = splitPhrases(track.notes, { bpm: 100 });
  const [b] = splitPhrases(track.notes.map((n) => ({ ...n, t: n.t + 8 })), { bpm: 100 });
  const [c] = splitPhrases([track.notes[0], { ...track.notes[1], syl: '나' }], { bpm: 100 });
  assert.equal(phraseKey(a, 'tiger@v106', '', 10, 'ko'), phraseKey(b, 'tiger@v106', '', 10, 'ko'));
  assert.notEqual(phraseKey(a, 'tiger@v106', '', 10, 'ko'), phraseKey(c, 'tiger@v106', '', 10, 'ko'));
  assert.notEqual(phraseKey(a, 'tiger@v106', '', 10, 'ko'), phraseKey(a, 'tiger@v106', '', 20, 'ko'));
});

test('catalog: official GitHub releases with sizes and checksums; TIGER sings through PC-NSF-HiFiGAN', () => {
  for (const item of Object.values(CATALOG)) {
    assert.match(item.url, /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//);
    assert.ok(item.size > 1e6 && item.licence && item.terms.ko.length && item.terms.en.length === item.terms.ko.length);
    if (item.sha256) assert.match(item.sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(CATALOG[TIGER_ID].sha256.length, 64);
  assert.equal(CATALOG[PC_NSF_ID].sha256.length, 64);
  assert.equal(externalVocoder(TIGER_ID, { vocoder: { bundled: true } }), PC_NSF_ID);
  assert.equal(externalVocoder('bank-1', { vocoder: { bundled: true } }), null, 'an imported bank uses its own vocoder');
  assert.equal(externalVocoder('bank-1', { vocoder: { bundled: true } }, { vocoderUnsupported: true }), PC_NSF_ID, '…unless it cannot run here');
  assert.equal(externalVocoder('bank-1', { vocoder: { bundled: false, dependency: 'nsf_hifigan_44.1k_hop512_128bin_2024.02' } }), 'nsf_hifigan_44.1k_hop512_128bin_2024.02');
  assert.equal(vocoderFor('some_unknown_vocoder'), PC_NSF_ID);
});

test('archives unpack as a stream, also a zip inside the zip (as TIGER ships)', async () => {
  const inner = zipSync({ 'TIGER/dsconfig.yaml': new TextEncoder().encode('acoustic: a.onnx'), 'TIGER/dsacoustic/a.onnx': new Uint8Array(70000).fill(7) });
  const outer = zipSync({ 'PACK/readme.txt': new TextEncoder().encode('hi'), 'PACK/Voice Library/TIGER.zip': [inner, { level: 0 }] });
  const written = new Map();
  const writer = { async open(path) { const chunks = []; return { write: (c) => { chunks.push(c); }, close: async () => { written.set(path, chunks.reduce((a, c) => a + c.length, 0)); } }; } };
  const stream = new Blob([outer]).stream();
  const files = await unzipStream(stream, writer);
  const paths = files.map((f) => f.path).sort();
  assert.deepEqual(paths, ['.inner-0/TIGER/dsacoustic/a.onnx', '.inner-0/TIGER/dsconfig.yaml', 'PACK/readme.txt']);
  assert.equal(written.get('.inner-0/TIGER/dsacoustic/a.onnx'), 70000);
  assert.equal(findRoot(files, 'dsconfig.yaml'), '.inner-0/TIGER');
  assert.equal(findRoot(files, 'vocoder.yaml'), null);
});

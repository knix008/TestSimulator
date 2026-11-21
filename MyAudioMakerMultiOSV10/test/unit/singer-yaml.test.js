// AI voice: the YAML subset of voice-bank files, dsdict dictionaries, phoneme tables, SHA-256.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, plainScalar } from '../../src/audio/singer/yaml.js';
import { buildDictionary, parseLanguages, parsePhonemes, phonemeLanguage } from '../../src/audio/singer/dictionary.js';
import { Sha256, sha256Hex } from '../../src/audio/singer/sha256.js';

test('YAML: maps, nested maps, lists at the same indent, comments', () => {
  const doc = parseYaml(`# a comment
phonemes: dsacoustic/phonemes.txt   # trailing comment
hidden_size: 256
use_key_shift_embed: true
max_depth: 0.6
mel_base: '10'
web: "https://tigermeat.xyz/#tiger-ds"
augmentation_args:
  random_pitch_shifting:
    range: [-5., 5.]
    enabled: true
speakers:
- dsacoustic/tiger_fresh
- dsacoustic/tiger_disco
empty:
`);
  assert.equal(doc.phonemes, 'dsacoustic/phonemes.txt');
  assert.equal(doc.hidden_size, 256);
  assert.equal(doc.use_key_shift_embed, true);
  assert.equal(doc.max_depth, 0.6);
  assert.equal(doc.mel_base, '10', 'quoted numbers stay text');
  assert.equal(doc.web, 'https://tigermeat.xyz/#tiger-ds', '# inside quotes is not a comment');
  assert.deepEqual(doc.augmentation_args.random_pitch_shifting.range, [-5, 5]);
  assert.deepEqual(doc.speakers, ['dsacoustic/tiger_fresh', 'dsacoustic/tiger_disco']);
  assert.equal(doc.empty, null);
});

test('YAML: lists of maps, flow maps, block text, scalars', () => {
  const doc = parseYaml(`subbanks:
- {color: '01 Fresh', suffix: dsacoustic/tiger_fresh} # pitch model: standard
- color: 02 Disco
  suffix: dsacoustic/tiger_disco
readme: |
  line one
  line two
folded: >
  a
  b
nums: [1, 2.5, -3, 1e3, .5]
flags: {a: yes, b: false, c: ~, d: "x, y"}
`);
  assert.deepEqual(doc.subbanks, [{ color: '01 Fresh', suffix: 'dsacoustic/tiger_fresh' }, { color: '02 Disco', suffix: 'dsacoustic/tiger_disco' }]);
  assert.equal(doc.readme, 'line one\nline two\n');
  assert.equal(doc.folded, 'a b\n');
  assert.deepEqual(doc.nums, [1, 2.5, -3, 1000, 0.5]);
  assert.deepEqual(doc.flags, { a: 'yes', b: false, c: null, d: 'x, y' });
  assert.equal(plainScalar('0x1F'), 31);
  assert.equal(plainScalar('v106'), 'v106');
  assert.throws(() => parseYaml('a: [1, 2'), SyntaxError);
});

test('dsdict: entries, symbol types, glides, replacements, CRLF and BOM', () => {
  const text = '﻿symbols:\r\n- {symbol: a, type: vowel}\r\n- {symbol: sx, type: fricative}\r\n- {symbol: y, type: semivowel}\r\n- symbol: ng\r\n  type: nasal\r\nentries:\r\n  - grapheme: 사\r\n    phonemes: [sx, a]\r\n  - {grapheme: "요", phonemes: [y, a]}\r\n  - {grapheme: Hello, phonemes: [hh, ah]}\r\nreplacements:\r\n- {from: ah, to: a}\r\n';
  const dict = buildDictionary([text]);
  assert.deepEqual(dict.query('사'), ['sx', 'a']);
  assert.deepEqual(dict.query('요'), ['y', 'a']);
  assert.deepEqual(dict.query('Hello'), ['hh', 'a'], 'replacement applied');
  assert.deepEqual(buildDictionary(['entries:\n- {grapheme: hello, phonemes: [hh]}']).query('HELLO'), ['hh'], 'the lyric is also tried in lower case');
  assert.equal(dict.query('없음'), null);
  assert.ok(dict.isVowel('a') && dict.isVowel('SP') && dict.isVowel('AP'));
  assert.ok(!dict.isVowel('sx') && dict.isValid('ng'));
  assert.ok(dict.isGlide('y') && !dict.isGlide('a'));
  // The first file wins for a grapheme.
  const two = buildDictionary(['entries:\n- {grapheme: x, phonemes: [a]}', 'entries:\n- {grapheme: x, phonemes: [b]}\n- {grapheme: z, phonemes: [c]}']);
  assert.deepEqual(two.query('x'), ['a']);
  assert.deepEqual(two.query('z'), ['c']);
});

test('phoneme tables and language ids', () => {
  const txt = parsePhonemes('<PAD>\nAP\nSP\na\r\nko/a\n');
  assert.equal(txt.get('<PAD>'), 0);
  assert.equal(txt.get('SP'), 2);
  assert.equal(txt.get('ko/a'), 4);
  assert.equal(txt.size, 5, 'a trailing newline is not a symbol');
  const json = parsePhonemes('{"SP": 1, "ko/a": 7}', true);
  assert.equal(json.get('ko/a'), 7);
  assert.equal(parseLanguages('{"ko": 2, "en": 1}').get('ko'), 2);
  assert.equal(phonemeLanguage('ko/a'), 'ko');
  assert.equal(phonemeLanguage('a'), '');
});

test('SHA-256 matches known digests, also fed in pieces', () => {
  assert.equal(sha256Hex(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const long = new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
  assert.equal(sha256Hex(long), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  const data = new Uint8Array(100000).map((_, i) => (i * 31) & 255);
  const whole = sha256Hex(data);
  const h = new Sha256();
  for (let i = 0; i < data.length; i += 777) h.update(data.subarray(i, i + 777));
  assert.equal(h.hex(), whole);
});

// The editor's English spell check (src/lib/spell.js) with the real dictionary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nspell from 'nspell';
import { wordsOf, looksLikeCode, makeChecker } from '../src/lib/spell.js';

const dir = new URL('../node_modules/dictionary-en/', import.meta.url);
const checker = makeChecker(nspell, fs.readFileSync(new URL('index.aff', dir), 'utf8'), fs.readFileSync(new URL('index.dic', dir), 'utf8'));
const wrong = (text, known = new Set()) => wordsOf(text).map((w) => w.word).filter((w) => !looksLikeCode(w, known) && !checker.correct(w));

test('spell check: misspelled prose is found, correct prose and code-like words are not', () => {
  assert.deepEqual(wrong('% Compute the averge of the recieved samples.'), ['averge', 'recieved']);
  assert.deepEqual(wrong("% This is the plant's response; it's fine."), []);
  assert.deepEqual(wrong('% See https://example.com/docs and C:\\work\\data.mat'), [], 'paths and addresses are skipped');
  assert.deepEqual(wrong('% call myFunction, LineWidth, RMS, x2, my_var'), [], 'camelCase, ALLCAPS, digits and underscores are code');
  assert.deepEqual(wrong('% use linspace and fprintf here', new Set(['linspace', 'fprintf'])), [], 'known function names');
  assert.ok(checker.suggest('recieved').includes('received'));
});

test('spell check: word offsets point into the text', () => {
  const text = "disp('Helo world')";
  const w = wordsOf(text).find((x) => x.word === 'Helo');
  assert.equal(text.slice(w.from, w.to), 'Helo');
  assert.ok(!wordsOf('plot(x)').some((x) => x.word === 'plot'), 'a call is code');
});

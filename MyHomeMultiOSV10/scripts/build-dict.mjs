// Builds the spelling dictionaries the app loads (public/dict/en.txt, public/dict/ko.txt) from
//   an-array-of-english-words (MIT)                    → English words, with their inflections
//   dictionary-ko (hunspell-dict-ko, MPL/GPL/LGPL)     → Korean nouns, base forms of verbs and
//                                                        adjectives, and their irregular forms
// Each file is sorted and front-coded (see decodeWordList in src/domain/spell.js) so it stays small.
//   node scripts/build-dict.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWordList } from '../src/domain/spell.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'dict');
fs.mkdirSync(out, { recursive: true });

const english = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'an-array-of-english-words', 'index.json'), 'utf8'))
  .map((w) => w.toLowerCase())
  .filter((w) => /^[a-z]+$/.test(w));

const korean = fs.readFileSync(path.join(root, 'node_modules', 'dictionary-ko', 'index.dic'), 'utf8')
  .split(/\r?\n/).slice(1)
  .map((line) => line.split('/')[0].trim().normalize('NFC'))
  .filter((w) => /^[가-힣]+$/.test(w));

const sizes = {};
const write = (name, words) => {
  const list = [...new Set(words)].sort();
  sizes[name.replace('.txt', '')] = list.length;
  const text = encodeWordList(list);
  fs.writeFileSync(path.join(out, name), text);
  console.log(`${name.padEnd(8)} ${String(list.length).padStart(7)} words  ${(text.length / 1024).toFixed(0).padStart(6)} KB`);
};
write('en.txt', english);
write('ko.txt', korean);
fs.writeFileSync(path.join(root, 'src', 'domain', 'dict-info.js'), `// Written by scripts/build-dict.mjs: how many words the built-in dictionaries have (Settings › Dictionary).
export const DICT_INFO = ${JSON.stringify(sizes)};
`);
fs.writeFileSync(path.join(out, 'LICENSES.txt'), `Spelling dictionaries of MyHomeMaker
=====================================

en.txt  English words from "an-array-of-english-words" 2.0.0 by Titus Wormer (MIT License).
        https://github.com/words/an-array-of-english-words

ko.txt  Korean words from "dictionary-ko" 2.0.0, the Korean Hunspell dictionary of the
        spellcheck-ko project (hunspell-dict-ko 0.7.94), used under the Mozilla Public
        License 1.1 (also available under GPL 2.0 / LGPL 2.1).
        https://spellcheck-ko.github.io/   https://github.com/wooorm/dictionaries

Both lists were converted (sorted, de-duplicated, front-coded) by scripts/build-dict.mjs.
`);

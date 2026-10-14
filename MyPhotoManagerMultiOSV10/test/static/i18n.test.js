// Translation files: no key written twice (the later one would silently win
// and change another screen's text), and Korean and English have the same keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'i18n');
const keysIn = (file) => [...fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/(?:^\s*|[{,]\s*)'([a-zA-Z][\w.:>=<-]*)':/gm)].map((m) => m[1]);

test('no key is written twice (in a file, or in both files of a language)', () => {
  for (const files of [['en.js', 'en-more.js'], ['ko.js', 'ko-more.js']]) {
    const seen = new Set();
    const twice = new Set();
    for (const key of files.flatMap(keysIn)) { if (seen.has(key)) twice.add(key); seen.add(key); }
    assert.deepEqual([...twice], [], `${files.join(' + ')} repeat keys`);
  }
});

test('Korean and English have the same keys', () => {
  const en = new Set([...keysIn('en.js'), ...keysIn('en-more.js')]);
  const ko = new Set([...keysIn('ko.js'), ...keysIn('ko-more.js')]);
  assert.deepEqual([...en].filter((k) => !ko.has(k)), [], 'missing in Korean');
  assert.deepEqual([...ko].filter((k) => !en.has(k)), [], 'missing in English');
});

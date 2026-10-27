// Every term the views mark for a tooltip (data-term / term=) has an explanation
// in src/lib/terms.js, in Korean and English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const termsSrc = fs.readFileSync(path.resolve('src/lib/terms.js'), 'utf8');
const defined = new Set([...termsSrc.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]));

function viewFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? viewFiles(path.join(dir, e.name)) : /\.jsx$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

test('every literal term in the views is explained', () => {
  const used = new Set();
  for (const f of viewFiles(path.resolve('src'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(?:data-term|term)="([\w-]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 15, `found ${used.size} terms`);
  const missing = [...used].filter((k) => !defined.has(k) && !defined.has(k.replace(/^new_/, '')));
  assert.deepEqual(missing, []);
});

test('each term has a Korean and an English name and text', () => {
  for (const key of defined) {
    const block = termsSrc.slice(termsSrc.indexOf(`  ${key}: {`));
    assert.match(block, /ko: \['[^']+', '[^']+'\]/, key);
    assert.match(block, /en: \['[^']+', '[^']+'\]/, key);
  }
});

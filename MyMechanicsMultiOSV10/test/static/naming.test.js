// The product stands on its own: no other CAD product's name in the code, texts, tests or documents.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Built from pieces so this file does not contain the names it looks for.
const FORBIDDEN = new RegExp(['so', 'lid', '\\s?', 'wo', 'rks'].join('') + '|' + ['simulation', 'xpress'].join(''), 'i');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', 'test-results', '.git', 'gen']);
const TEXT = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.toml', '.rs', '.txt', '.nsh', '.ts', '.yml', '.yaml', '.xml', '.desktop', '.svg']);

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* files(path.join(dir, e.name)); }
    else if (TEXT.has(path.extname(e.name).toLowerCase()) && e.name !== 'package-lock.json') yield path.join(dir, e.name);
  }
}

test('no other CAD product is named anywhere in the code, texts, tests or documents', () => {
  const hits = [];
  for (const file of files(root)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => { if (FORBIDDEN.test(line)) hits.push(`${path.relative(root, file)}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});

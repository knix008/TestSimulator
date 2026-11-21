// Every popup the app opens must be allowed by the desktop shell (src-tauri/src/lib.rs POPUP_KINDS) and have a
// window size (src/platform/popups.js) — the web build opens any kind, so only the desktop app showed
// "unknown popup massprops".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function* sources(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* sources(path.join(dir, e.name));
    else if (e.name.endsWith('.js')) yield path.join(dir, e.name);
  }
}

const opened = new Map();
for (const file of sources(path.join(root, 'src'))) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/popups\.open\(\s*'([a-zA-Z]+)'/g)) {
    if (!opened.has(match[1])) opened.set(match[1], path.relative(root, file));
  }
}
const rust = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
const list = rust.match(/const POPUP_KINDS: &\[&str\] = &\[([\s\S]*?)\];/);
const allowed = new Set([...(list?.[1] ?? '').matchAll(/"([a-z]+)"/g)].map((m) => m[1]));
const sizes = fs.readFileSync(path.join(root, 'src', 'platform', 'popups.js'), 'utf8');

test('the desktop shell lists its popup kinds', () => {
  assert.ok(allowed.size > 5, 'POPUP_KINDS not found in src-tauri/src/lib.rs');
  assert.ok(opened.size > 5, 'no popups.open() calls found');
});

for (const [kind, file] of [...opened].sort()) {
  test(`popup "${kind}" (${file}) is allowed on the desktop and has a size`, () => {
    assert.ok(allowed.has(kind), `"${kind}" is missing from POPUP_KINDS in src-tauri/src/lib.rs`);
    assert.match(sizes, new RegExp(`^\\s+${kind}: \\{ width:`, 'm'), `"${kind}" has no size in src/platform/popups.js`);
  });
}

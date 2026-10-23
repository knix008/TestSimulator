// The desktop program opens only the popup kinds it knows (POPUP_KINDS in src-tauri/src/lib.rs): every popup the
// app has (POPUPS in src/platform/popups.js) must be there, or it fails on the desktop with "unknown popup …".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { POPUPS } from '../../src/platform/popups.js';

test('every popup kind of the app is known to the desktop program', () => {
  const rust = fs.readFileSync(new URL('../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const list = rust.match(/const POPUP_KINDS: &\[&str\] = &\[([^\]]*)\]/)?.[1];
  assert.ok(list, 'POPUP_KINDS in lib.rs');
  const kinds = new Set([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  assert.deepEqual(Object.keys(POPUPS).filter((kind) => !kinds.has(kind)), []);
  assert.deepEqual([...kinds].filter((kind) => !(kind in POPUPS)), []);
});

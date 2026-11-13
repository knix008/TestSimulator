// The production build's library chunks (scripts/chunks.mjs) only import downwards: core ← library-base ←
// library-more / -plus / -extra ← library-rooms, never sideways between the middle three and never into the app's
// own chunks. An import against the layers makes two chunks import each other, and the built app then stops at
// start with "Cannot access … before initialization" (it happened when new library modules landed in library-base
// while importing accessories-plus.js). The dev server does not bundle, so only this test or a built run shows it.
// Run: node --test test/unit/chunks.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkOf } from '../../scripts/chunks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIB = path.join(root, 'src/library/parametric');
const RANK = { three: 0, loaders: 0, vendor: 0, core: 1, 'library-base': 2, 'library-more': 3, 'library-plus': 3, 'library-extra': 3, 'library-rooms': 4 };

/** Static imports of a module (relative ones resolved to absolute paths; packages by name). */
function importsOf(file) {
  const text = readFileSync(file, 'utf8');
  const out = [];
  for (const m of text.matchAll(/^\s*import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1];
    out.push(spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : path.join(root, 'node_modules', spec));
  }
  return out;
}

test('every library module is in a library chunk (index.js stays with the app)', () => {
  for (const name of readdirSync(LIB).filter((f) => f.endsWith('.js'))) {
    const chunk = chunkOf(path.join(LIB, name));
    if (name === 'index.js') assert.equal(chunk, 'shared', 'index.js');
    else assert.ok(/^library-/.test(chunk), `${name}: ${chunk}`);
  }
});

/** chunk → chunk edges of the library modules' imports, each with the import that makes it. */
function chunkEdges() {
  const edges = new Map();
  for (const name of readdirSync(LIB).filter((f) => f.endsWith('.js') && f !== 'index.js')) {
    const file = path.join(LIB, name);
    const from = chunkOf(file);
    for (const target of importsOf(file)) {
      const to = chunkOf(target);
      if (to === from) continue;
      const key = `${from} → ${to}`;
      if (!edges.has(key)) edges.set(key, { from, to, via: `${name} → ${path.basename(target)}` });
    }
  }
  return [...edges.values()];
}

test('library chunks never import the app (only lower layers: core, three, vendor or other library chunks)', () => {
  const bad = chunkEdges().filter((e) => !(e.to in RANK)).map((e) => `${e.from} → ${e.to} (${e.via})`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('no two library chunks import each other, directly or round a loop', () => {
  const edges = chunkEdges().filter((e) => e.to in RANK);
  const next = new Map();
  for (const e of edges) { if (!next.has(e.from)) next.set(e.from, []); next.get(e.from).push(e); }
  const loops = [];
  const walk = (node, trail) => {
    for (const e of next.get(node) ?? []) {
      const at = trail.findIndex((t) => t.from === e.to);
      if (at >= 0 || e.to === trail[0]?.from) { loops.push([...trail.slice(Math.max(0, at)), e].map((t) => `${t.from} → ${t.to} (${t.via})`).join(', ')); continue; }
      if (trail.length < 8) walk(e.to, [...trail, e]);
    }
  };
  for (const start of next.keys()) walk(start, []);
  assert.deepEqual([...new Set(loops)], [], `chunk import loops:\n${[...new Set(loops)].join('\n')}`);
});

test('the top layer (the newest categories) imports only downwards', () => {
  const bad = chunkEdges().filter((e) => e.from === 'library-rooms' && (RANK[e.to] ?? 99) >= RANK['library-rooms']).map((e) => e.via);
  assert.deepEqual(bad, []);
});

test('the new categories have their own top layer', () => {
  for (const name of ['office-props.js', 'server-room2.js', 'computers.js', 'landscape2.js', 'security.js', 'security-moved.js', 'appliances-air.js', 'lighting-fixtures.js']) {
    assert.equal(chunkOf(path.join(LIB, name)), 'library-rooms', name);
  }
});

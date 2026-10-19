// Every component used as <Name …> in a .jsx file must be imported or defined
// there — a missing import is not a build error but a render-time crash
// (ReferenceError → blank window), so it is checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
function* walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) yield* walk(p); else if (p.endsWith('.jsx')) yield p; } }

test('JSX components are imported or defined in the file that uses them', () => {
  const problems = [];
  for (const file of walk(root)) {
    const s = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
    const imported = new Set();
    for (const m of s.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
      if (m[1]) imported.add(m[1]);
      if (m[2]) for (const n of m[2].split(',')) { const nm = n.trim().split(/\s+as\s+/).pop(); if (nm) imported.add(nm); }
    }
    const defined = new Set([...s.matchAll(/(?:function|const|class|let)\s+([A-Z]\w*)/g)].map((m) => m[1]));
    for (const m of s.matchAll(/<([A-Z]\w*)/g)) {
      const n = m[1];
      if (!imported.has(n) && !defined.has(n) && !/^React$/.test(n)) problems.push(`${path.relative(root, file)}: <${n}>`);
    }
  }
  assert.deepEqual([...new Set(problems)], []);
});

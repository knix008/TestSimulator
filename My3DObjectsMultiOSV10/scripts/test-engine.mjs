#!/usr/bin/env node
// `npm run test:engine`: the engine's Python unit tests (engine/tests). They
// run with the engine's own Python when it has been installed (it has torch),
// else with a system Python; tests that need torch skip themselves without it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultHome, venvPython } from './engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [venvPython(path.join(defaultHome(), 'venv')), 'python3', 'python'];
const py = candidates.find((p) => (p.includes(path.sep) ? fs.existsSync(p)
  : spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0));
if (!py) {
  console.log('[test:engine] No Python found; skipped.');
  process.exit(0);
}
console.log(`[test:engine] ${py}`);
const r = spawnSync(py, ['-m', 'unittest', 'discover', '-s', path.join(root, 'engine', 'tests')], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONPATH: path.join(root, 'engine') },
});
process.exit(r.status ?? 1);

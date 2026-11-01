#!/usr/bin/env node
// `npm run web`: the web build's dev server and the local engine together.
// The page talks to the engine at http://127.0.0.1:57650 (Settings → Engine
// can point it elsewhere). Ctrl+C stops both.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const children = [
  spawn(process.execPath, [path.join(root, 'scripts', 'engine.mjs'), ...process.argv.slice(2)], { stdio: 'inherit', cwd: root }),
  spawn(process.execPath, [vite, '--port', '5195'], { stdio: 'inherit', cwd: root }),
];
const stop = () => { for (const c of children) c.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', (code) => { stop(); process.exitCode = code ?? 0; });

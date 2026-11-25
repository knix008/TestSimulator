// npm run web — the web version in the browser (Vite dev server on a free port from 1470 up).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await freeDevPort(1470);
console.log(`[web] http://127.0.0.1:${port}/`);
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--open', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
vite.on('exit', (code) => process.exit(code ?? 0));

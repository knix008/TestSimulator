// npm run dev — the web UI (Vite) on a free port: 5230 or the next port that
// is free on both 127.0.0.1 and ::1. A port another program uses is never
// reused or stopped.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await freeDevPort(5230);
if (port !== 5230) console.log(`[dev] Port 5230 is in use; using ${port}.`);
execFileSync(process.execPath, [path.join(root, 'scripts', 'generate-icons.mjs'), '--if-needed'], { cwd: root, stdio: 'inherit' });
const child = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));

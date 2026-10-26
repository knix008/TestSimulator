// npm start — `tauri dev` on a free dev-server port. If another program (or
// another project's Vite) already listens on 5210, the next free port is
// used instead; nothing is stopped. The port reaches Vite (beforeDevCommand),
// the window (devUrl) and the sidecar's CORS list (MCC_DEV_PORT).
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await freeDevPort(5210);
if (port !== 5210) console.log(`[start] Port 5210 is in use by another program; using ${port}.`);

execFileSync(process.execPath, [path.join(root, 'scripts', 'generate-icons.mjs'), '--if-needed'], { cwd: root, stdio: 'inherit' });

const config = {
  build: {
    devUrl: `http://localhost:${port}`,
    beforeDevCommand: `node scripts/stage-sidecar.mjs && node node_modules/vite/bin/vite.js --port ${port} --strictPort`,
  },
};
const child = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', '--config', JSON.stringify(config), ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, MCC_DEV_PORT: String(port) },
});
child.on('exit', (code) => process.exit(code ?? 0));

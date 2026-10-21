// Copies the JavaScript service into src-tauri/sidecar so the Windows, Linux
// and macOS installers can run it. --with-deps also copies the Node binary
// of the machine doing the build (each OS builds its own installer).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src-tauri', 'sidecar');
const withNode = process.argv.includes('--with-deps');
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of ['core', 'host', 'server']) {
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
fs.cpSync(path.join(root, 'samples', 'demo'), path.join(out, 'samples', 'demo'), { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, private: true }));
if (withNode) {
  const dest = path.join(out, nodeName);
  fs.copyFileSync(process.execPath, dest);
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  console.log(`[sidecar] Staged core, host, server, samples and ${nodeName}`);
} else {
  console.log('[sidecar] Staged core, host, server and samples');
}

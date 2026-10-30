// What the Tauri program needs besides the page (tauri.conf.json build steps,
// npm start):
//
//   src-tauri/icons/       app icons (scripts/generate-icons.mjs --if-needed)
//   src/build-info.json    version / build time / commit (About)
//   src-tauri/sidecar/     the Node host as one file (host.js, core/ and ssh2
//                          inside) + build-info.json; with --release also the
//                          Node runtime itself (node.exe / node)
//
// Debug builds (`tauri build --debug`, npm start) run host/host.js from the
// project with the Node on PATH; the bundled copy is what the installer ships.
//   node scripts/prepare-tauri.mjs [--release]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidecar = path.join(root, 'src-tauri', 'sidecar');
// tauri build --debug runs beforeBuildCommand too; it never uses the runtime copy.
const release = process.argv.includes('--release') && process.env.TAURI_ENV_DEBUG !== 'true';

for (const script of ['generate-icons.mjs', 'generate-build-info.mjs']) {
  execFileSync(process.execPath, [path.join(root, 'scripts', script), '--if-needed'], { cwd: root, stdio: 'inherit' });
}

fs.rmSync(sidecar, { recursive: true, force: true });
fs.mkdirSync(sidecar, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, 'host', 'host.js')],
  outfile: path.join(sidecar, 'host.js'),
  bundle: true,
  platform: 'node',
  target: ['node20'],
  format: 'cjs',
  // ssh2's optional native helpers: it falls back to pure JS without them.
  external: ['*.node', 'cpu-features'],
  logLevel: 'warning',
});
fs.copyFileSync(path.join(root, 'src', 'build-info.json'), path.join(sidecar, 'build-info.json'));
if (release) {
  const name = process.platform === 'win32' ? 'node.exe' : 'node';
  fs.copyFileSync(process.execPath, path.join(sidecar, name));
  if (process.platform !== 'win32') fs.chmodSync(path.join(sidecar, name), 0o755);
}
console.log(`[prepare] Node host → ${path.relative(root, sidecar)}${release ? ` (with the Node ${process.version} runtime)` : ''}`);

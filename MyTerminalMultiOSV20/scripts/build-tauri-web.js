/**
 * What the Tauri program embeds and bundles (tauri.conf.json build step):
 *
 *   dist/web/       the pages, laid out like the project so the renderer's
 *                   relative paths (../../assets/…) hold: src/renderer/**,
 *                   assets/icons/** and vendor/xterm.css (index.html's
 *                   node_modules link is pointed there)
 *   dist/sidecar/   the Node host as one file (host.js, ssh2 / utif inside);
 *                   with --release also the Node runtime itself (node.exe / node)
 *
 * Before copying it patches xterm's powerline glyphs and bundles the renderer
 * (the same steps `npm start` ran for Electron).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const release = process.argv.includes('--release');
const web = path.join(root, 'dist', 'web');
const sidecar = path.join(root, 'dist', 'sidecar');

function run(script) {
  execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: root, stdio: 'inherit' });
}

function copy(rel, dest = rel) {
  const from = path.join(root, rel);
  const to = path.join(web, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    // Source maps stay out of the installer.
    filter: (src) => release ? !src.endsWith('.map') : true,
  });
}

async function main() {
  run('patch-xterm-powerline-aa.js');
  run('build-renderer.js');

  fs.rmSync(web, { recursive: true, force: true });
  copy('src/renderer');
  // Tauri refuses a page folder that contains a node_modules folder.
  copy('node_modules/@xterm/xterm/css/xterm.css', 'vendor/xterm.css');
  const index = path.join(web, 'src/renderer/index.html');
  const html = fs.readFileSync(index, 'utf8');
  const linked = html.replace('../../node_modules/@xterm/xterm/css/xterm.css', '../../vendor/xterm.css');
  if (linked === html) throw new Error('xterm.css link not found in index.html');
  fs.writeFileSync(index, linked);
  copy('assets/icons');

  fs.rmSync(sidecar, { recursive: true, force: true });
  fs.mkdirSync(sidecar, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(root, 'src/host/host.js')],
    outfile: path.join(sidecar, 'host.js'),
    bundle: true,
    platform: 'node',
    target: ['node20'],
    format: 'cjs',
    // ssh2's optional native helpers: it falls back to pure JS without them.
    external: ['*.node', 'cpu-features'],
    logLevel: 'warning',
  });
  if (release) {
    const name = process.platform === 'win32' ? 'node.exe' : 'node';
    fs.copyFileSync(process.execPath, path.join(sidecar, name));
    if (process.platform !== 'win32') fs.chmodSync(path.join(sidecar, name), 0o755);
  }
  console.log(`Tauri pages ready: ${path.relative(root, web)}; host: ${path.relative(root, sidecar)}${release ? ' (with Node runtime)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

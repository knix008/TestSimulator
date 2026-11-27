// Installs and prepares everything the project needs that git does not keep:
//   npm run setup          — node_modules (npm install), the Rust wasm32 target, public/hexcore.wasm, public/doc/
//   npm install            — runs this afterwards too (postinstall, `--after-install`: never fails the install)
// Checks: Node 22+, Rust (cargo, rustup). On Linux it lists the system packages Tauri needs (it does not
// install system packages: that needs sudo — the command is printed). Everything made here is in .gitignore.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const afterInstall = process.argv.includes('--after-install');
const win = process.platform === 'win32';
const say = (text) => console.log(`[setup] ${text}`);
const warn = (text) => console.warn(`[setup] ⚠ ${text}`);
const run = (cmd, args, options = {}) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win, ...options });
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: win }).status === 0;
let problems = 0;
const fail = (text) => { problems += 1; warn(text); };

// Node
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) fail(`Node ${process.versions.node}: Node 22 or newer is needed (https://nodejs.org).`);
else say(`Node ${process.versions.node}`);

// npm packages (skipped when npm itself is running us)
if (!afterInstall) {
  say('npm install');
  if (run('npm', ['install', '--ignore-scripts']).status !== 0) fail('npm install failed.');
}

// Rust: cargo, and the WebAssembly target for the web build
if (!has('cargo')) {
  fail('Rust (cargo) is not installed: https://rustup.rs — then run `npm run setup` again.');
} else {
  say(spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: win }).stdout.trim());
  if (has('rustup')) {
    const targets = spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8', shell: win }).stdout ?? '';
    if (!targets.includes('wasm32-unknown-unknown')) {
      say('rustup target add wasm32-unknown-unknown');
      if (run('rustup', ['target', 'add', 'wasm32-unknown-unknown']).status !== 0) fail('Could not add the wasm32-unknown-unknown target.');
    } else say('wasm32-unknown-unknown target: present');
  } else warn('rustup is not available: make sure the wasm32-unknown-unknown target is installed.');
  // The web core and the documents (scripts/prepare.mjs builds what is missing or out of date).
  if (!problems || existsSync(path.join(root, 'node_modules'))) {
    say('building public/hexcore.wasm and the documents');
    if (run(process.execPath, [path.join(root, 'scripts', 'prepare.mjs'), '--docs']).status !== 0) fail('Building the WebAssembly core or the documents failed.');
  }
}

// System packages Tauri needs on Linux (printed, not installed)
if (process.platform === 'linux') {
  say('Linux: the desktop app needs WebKitGTK and friends. On Debian / Ubuntu:');
  console.log('  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev');
  say('Fedora: sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel');
}
if (process.platform === 'darwin' && spawnSync('xcode-select', ['-p'], { stdio: 'ignore' }).status !== 0) fail('Xcode command line tools are missing: xcode-select --install');

if (problems) {
  warn(`${problems} problem(s) above. Fix them and run \`npm run setup\` again.`);
  process.exit(afterInstall ? 0 : 1);
}
say('done — npm start (desktop), npm run dev (web), npm test');

// Builds the web engine: Rust to WebAssembly, then the JS glue into src/engine/. The glue tool must
// match the wasm-bindgen crate's version exactly, so it is fetched into target/tools, not the system.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.2.130';
const exe = process.platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen';
const tool = path.join(root, 'target', 'tools', 'bin', exe);

function run(command, args) {
  const r = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const output = path.join(root, 'src', 'engine', 'zipmaster_wasm_bg.wasm');
run('rustup', ['target', 'add', 'wasm32-unknown-unknown']);
run('cargo', ['build', '-p', 'zipmaster-wasm', '--target', 'wasm32-unknown-unknown', '--profile', 'wasm']);

const version = fs.existsSync(tool) ? spawnSync(tool, ['--version'], { encoding: 'utf8' }).stdout ?? '' : '';
if (!version.includes(VERSION)) {
  run('cargo', ['install', 'wasm-bindgen-cli', '--version', VERSION, '--root', path.join('target', 'tools'), '--locked']);
}
run(tool, [
  path.join('target', 'wasm32-unknown-unknown', 'wasm', 'zipmaster_wasm.wasm'),
  '--out-dir', path.join('src', 'engine'),
  '--target', 'web',
  '--no-typescript',
]);
console.log(`[wasm] ${path.relative(root, output)} ${(fs.statSync(output).size / 1048576).toFixed(1)} MB`);

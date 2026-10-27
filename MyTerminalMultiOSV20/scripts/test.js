// npm test: the JS unit tests (node:test) and the Rust tests (cargo test).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('test', f));
const steps = [
  ['JS', process.execPath, ['--test', ...files]],
  ['Rust', 'cargo', ['test', '--manifest-path', path.join('src-tauri', 'Cargo.toml')]],
];
let failed = 0;
for (const [name, cmd, args] of steps) {
  console.log(`\n── ${name} tests ──`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}
process.exit(failed ? 1 : 0);

// Scripted smoke tests against the real Electron app.
//
//   npm run smoke            runs every scenario in test/smoke/
//   npm run smoke -- region  runs one scenario
//
// Each scenario is a JavaScript file executed inside the main window (via
// --smoke-script); `region` additionally runs region-select.js inside the
// overlay window. Screenshots of the main window and every dialog window land
// in .smoke/<scenario>[-n].png so the result can be inspected by eye. The
// literal __SMOKE_DIR__ in a scenario is replaced by that output folder.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.smoke');
const srcDir = path.join(root, 'test', 'smoke');
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('[smoke] dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

const wanted = process.argv.slice(2);
const scenarios = fs.readdirSync(srcDir)
  .filter((f) => f.endsWith('.js') && f !== 'region-select.js')
  .map((f) => f.slice(0, -3))
  .filter((n) => !wanted.length || wanted.includes(n));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// A private profile: no clash with a running copy of the app, no stray settings.
env.CM_USER_DATA = path.join(outDir, 'profile');

let failed = 0;
for (const name of scenarios) {
  const prepared = path.join(outDir, `${name}.run.js`);
  fs.writeFileSync(prepared, fs.readFileSync(path.join(srcDir, `${name}.js`), 'utf-8').replaceAll('__SMOKE_DIR__', outDir.split(String.fromCharCode(92)).join('/')));
  const args = ['.', `--smoke-shot=${path.join(outDir, name + '.png')}`, `--smoke-script=${prepared}`, '--smoke-quit'];
  if (name === 'region') {
    const sel = path.join(outDir, 'region-select.run.js');
    fs.copyFileSync(path.join(srcDir, 'region-select.js'), sel);
    args.push(`--smoke-dialog-script=${sel}`);
  }
  console.log(`\n[smoke] ▶ ${name}`);
  const res = spawnSync(electronPath, args, { cwd: root, env: { ...env, CM_SMOKE_AFTER: name === 'region' ? '2500' : '0' }, encoding: 'utf-8' });
  const out = (res.stdout || '') + (res.stderr || '');
  const lines = out.split(/\r?\n/).filter((l) => /\[smoke\]/.test(l) && !/Security Warning/.test(l));
  for (const l of lines) console.log('  ' + l);
  const ok = res.status === 0 && lines.some((l) => /script result:/.test(l)) && !lines.some((l) => /\[smoke\] \[Error/.test(l));
  console.log(ok ? `[smoke] ✓ ${name}` : `[smoke] ✗ ${name} (exit ${res.status})`);
  if (!ok) failed += 1;
}
console.log(`\n[smoke] ${scenarios.length - failed}/${scenarios.length} scenarios passed — screenshots in .smoke/`);
process.exit(failed ? 1 : 0);

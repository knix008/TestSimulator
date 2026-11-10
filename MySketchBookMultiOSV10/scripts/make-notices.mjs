// Writes licenses/ — the third-party notices shipped with the installer (tauri.conf.json resources).
// One summary (THIRD-PARTY-NOTICES.txt) listing every runtime dependency with its licence, plus each
// package's own licence files copied as <package>.<file>.txt. LGPL parts (occt-import-js: OpenCASCADE)
// are loaded as separate, replaceable files; their licence text must travel with the app.
//
//   node scripts/make-notices.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'licenses');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;
// The Tauri dependency and our own build helpers are not shipped code.
const SKIP = new Set(['@tauri-apps/cli']);
// Packages bundled through a dependency rather than listed in package.json (utif → pako).
const BUNDLED = ['pako'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const lines = [
  'MySketchBook — third-party software',
  '',
  'This application includes the following open-source packages. Their licence texts are in this folder.',
  'Packages under the LGPL (OpenCASCADE via occt-import-js) are loaded from separate files and can be replaced.',
  '',
];
for (const name of [...new Set([...Object.keys(pkg.dependencies ?? {}), ...BUNDLED])].sort()) {
  if (SKIP.has(name)) continue;
  const dir = join(root, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) { console.warn(`missing: ${name}`); continue; }
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const license = typeof meta.license === 'string' ? meta.license : meta.license?.type ?? 'see files';
  const safe = name.replace(/^@/, '').replace(/\//g, '-');
  const copied = [];
  for (const where of [dir, join(dir, 'dist')]) {
    if (!existsSync(where)) continue;
    for (const file of readdirSync(where)) {
      if (!LICENSE_FILE.test(file) && !/^license\./i.test(file)) continue;
      const target = `${safe}.${file.replace(/\.(md|txt)$/i, '')}.txt`;
      copyFileSync(join(where, file), join(out, target));
      copied.push(target);
    }
  }
  lines.push(`${meta.name} ${meta.version} — ${license}${meta.homepage ? ` — ${meta.homepage}` : ''}`);
  lines.push(copied.length ? `  ${copied.join(', ')}` : '  (no licence file in the package; licence as stated above)');
}
writeFileSync(join(out, 'THIRD-PARTY-NOTICES.txt'), `${lines.join('\r\n')}\r\n`);
console.log(`licenses/: ${readdirSync(out).length} files`);

// npm run assets:optimize — makes a fetched asset library (library/) smaller in place, with the same look:
// model textures as WebP, model geometry quantised + meshopt-compressed, material texture sets as WebP
// (scripts/lib/optimize-assets.mjs has the details). Files already optimised are skipped, so it can run again any time;
// `npm run assets` does the same for everything it downloads.
//
//   npm run assets:optimize                 everything
//   npm run assets:optimize -- --only models,textures
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimiseGlb, optimiseTextureSet } from './lib/optimize-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = path.join(root, 'library');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : ['models', 'textures'];
const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
if (!fs.existsSync(lib)) { console.log('No library/ yet: npm run assets'); process.exit(0); }

const total = { before: 0, after: 0 };
if (only.includes('models')) {
  const dir = path.join(lib, 'models');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb'));
  let before = 0; let after = 0; let kept = 0; let done = 0;
  for (const f of files) {
    const r = await optimiseGlb(path.join(dir, f));
    before += r.before; after += r.after; if (r.kept && !r.skipped) kept++;
    done++;
    if (done % 25 === 0 || done === files.length) process.stdout.write(`\r  models ${done}/${files.length}  ${mb(before)} → ${mb(after)}   `);
  }
  // The manifest records each file's size (the library tests compare it).
  const manifestFile = path.join(dir, 'manifest.json');
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    for (const e of manifest) if (fs.existsSync(path.join(dir, e.file))) e.bytes = fs.statSync(path.join(dir, e.file)).size;
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
  }
  console.log(`\n  models: ${mb(before)} → ${mb(after)} (${kept} kept as they were)`);
  total.before += before; total.after += after;
}
if (only.includes('textures')) {
  const dir = path.join(lib, 'textures');
  const indexFile = path.join(dir, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  let before = 0; let after = 0;
  for (const [id, info] of Object.entries(index)) {
    const r = await optimiseTextureSet(path.join(dir, id), info.maps ?? ['diff', 'nor', 'rough']);
    before += r.before; after += r.after;
    info.ext = r.ext;
  }
  fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);
  console.log(`  textures: ${mb(before)} → ${mb(after)}`);
  total.before += before; total.after += after;
}
console.log(`library: ${mb(total.before)} → ${mb(total.after)}`);

// Makes sure the sample books exist before the tests run.
//
// samples/ is generated (and gitignored), so a fresh clone has none. The tests
// open every one of them, which is the point: the format readers are tested
// against real files rather than hand-built fixtures.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dir = path.join(root, 'samples');

const NEEDED = [
  'sample.epub', 'sample.cbz', 'sample.fb2', 'sample.txt', 'sample.md',
  'sample.html', 'sample.mobi', 'sample.pdf', 'sample.png', 'sample.tif', 'sample.dcm',
];
const missing = NEEDED.filter((name) => !fs.existsSync(path.join(dir, name)));

if (!missing.length) {
  console.log('[samples] All sample books are present.');
} else {
  console.log(`[samples] Missing ${missing.length} sample(s) — generating.`);
  execFileSync(process.execPath, [path.join(__dirname, 'make-samples.mjs')], { stdio: 'inherit' });
}

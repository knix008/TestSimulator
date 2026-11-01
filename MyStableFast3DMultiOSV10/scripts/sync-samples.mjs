// Copies samples/ (pictures, 3D files, index.json) into public/samples, where
// the app lists and opens them (start screen, File menu, tutorial). public/ is
// copied verbatim into dist/ by Vite, so the same ./samples/… works in dev, in
// the web build and inside the desktop app. public/samples is generated (and
// gitignored); samples/ is the source (`npm run samples` remakes it).
//
// Usage: node scripts/sync-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function syncSamples() {
  const src = path.join(root, 'samples');
  const dest = path.join(root, 'public', 'samples');
  if (!fs.existsSync(src)) return 0;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, filter: (p) => !p.endsWith('.md') });
  let n = 0;
  const count = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) count(path.join(dir, e.name)); else n++; } };
  count(dest);
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`[samples] Copied ${syncSamples()} file(s) to public/samples`);
}

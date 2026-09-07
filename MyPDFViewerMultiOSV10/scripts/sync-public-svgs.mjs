// Copies the two source SVGs into public/, where the UI fetches them by URL:
//
//   assets/icon.svg       → public/icon.svg       (favicon + welcome screen)
//   assets/file-icon.svg  → public/file-icon.svg
//
// public/ is copied verbatim into dist/ by Vite, so the same URLs work in dev,
// in the web build and inside the app:// bundle. The copies are generated (and
// gitignored), so this has to run before every start/build — not only when the
// platform icons are regenerated, which is why it is its own script.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const FILES = [
  ['icon.svg', 'icon.svg'],
  ['file-icon.svg', 'file-icon.svg'],
];

export function syncPublicSvgs() {
  const dest = path.join(root, 'public');
  fs.mkdirSync(dest, { recursive: true });

  const copied = [];
  for (const [from, to] of FILES) {
    const src = path.join(root, 'assets', from);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(dest, to));
    copied.push(to);
  }
  return copied;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const copied = syncPublicSvgs();
  console.log(copied.length
    ? `[svgs] Synced public/${copied.join(', public/')}`
    : '[svgs] No source SVGs found in assets/ — skipping.');
}

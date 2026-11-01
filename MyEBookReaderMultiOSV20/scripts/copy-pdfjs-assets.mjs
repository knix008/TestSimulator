// Copies the runtime data files pdf.js needs at render time into public/pdfjs/
// so both the web build and the packaged Electron app can fetch them:
//
//   cmaps/          — CJK character maps (Korean/Japanese/Chinese PDFs render
//                     as blanks without these)
//   standard_fonts/ — the 14 standard PDF fonts, for documents that do not
//                     embed their fonts
//   wasm/           — the JPEG2000 / JBIG2 decoders used by scanned PDFs
//
// public/ is copied verbatim into dist/ by Vite, so the URLs stay the same in
// dev, in the web build and inside the app:// bundle.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const dest = path.join(root, 'public', 'pdfjs');

const DIRS = ['cmaps', 'standard_fonts', 'wasm'];

if (!fs.existsSync(src)) {
  console.warn('[pdfjs-assets] pdfjs-dist not installed — skipping.');
  process.exit(0);
}

let files = 0;
for (const dir of DIRS) {
  const from = path.join(src, dir);
  const to = path.join(dest, dir);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const f = path.join(from, name);
    if (!fs.statSync(f).isFile()) continue;
    const t = path.join(to, name);
    // Skip files that are already up to date — this runs before every start.
    try {
      if (fs.existsSync(t) && fs.statSync(t).size === fs.statSync(f).size) continue;
    } catch { /* fall through and copy */ }
    fs.copyFileSync(f, t);
    files++;
  }
}

console.log(files
  ? `[pdfjs-assets] Copied ${files} file(s) into public/pdfjs/`
  : '[pdfjs-assets] public/pdfjs/ already up to date.');

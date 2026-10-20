// Copies the program guide (doc/ — HTML pages and their pictures) into
// public/doc, where the app opens it by URL in its guide window. public/ is
// copied verbatim into dist/ by Vite, so the same ./doc/Guide.html works in
// dev, in the web build and inside the desktop app. public/doc is generated
// (and gitignored); doc/ is the source.
//
// Usage: node scripts/sync-doc.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function syncDoc() {
  const src = path.join(root, 'doc');
  const dest = path.join(root, 'public', 'doc');
  if (!fs.existsSync(src)) return 0;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  let n = 0;
  const count = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) count(path.join(dir, e.name)); else n++;
    }
  };
  count(dest);
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`[doc] Copied ${syncDoc()} file(s) to public/doc`);
}

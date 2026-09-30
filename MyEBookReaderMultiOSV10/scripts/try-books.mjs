// Opens real books in the real window and reports what the reader would see.
//
//   node scripts/try-books.mjs [folder]
//
// The samples in samples/ are written by this repository, which makes them
// perfect for testing the readers and useless for telling whether a book someone
// actually has will open. This drives the application against real files — by
// default whatever books are on the desktop — and prints, for each one, the page
// count, the page it opens on, what turning a page does and whether the chapters
// can be moved between. It is a tool for looking, not a test: nothing here fails
// a build, because whose desktop it runs on decides what it finds.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const where = process.argv[2] || path.join(os.homedir(), 'Desktop');
if (!fs.existsSync(where)) {
  console.error(`[books] There is no folder at ${where}.`);
  process.exit(1);
}

const BOOKS = /\.(epub|mobi|azw3?|prc|fb2|cbz|pdf)$/i;
const found = fs.readdirSync(where)
  .filter((name) => BOOKS.test(name))
  .map((name) => path.join(where, name));

if (!found.length) {
  console.error(`[books] No books in ${where}.`);
  process.exit(1);
}

console.log(`[books] ${found.length} book(s) in ${where}`);
const electron = require('electron');
const env = { ...process.env, EBK_TRY: found.join('\n') };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('[books] Could not start Electron:', err.message);
  process.exit(1);
});

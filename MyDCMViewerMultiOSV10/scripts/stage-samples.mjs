// Copies the start page's sample files (src/js/start/sampleList.js) into
// src-tauri/resources/samples/, which the Tauri bundle ships as <resources>/samples.
// The full samples/ folder (≈60 MB of test data) is not shipped.
//
//   node scripts/stage-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'samples');
const OUT = path.join(ROOT, 'src-tauri', 'resources', 'samples');
const { START_SAMPLES, START_SAMPLE_FOLDERS } = await import(pathToFileURL(path.join(ROOT, 'src', 'js', 'start', 'sampleList.js')).href);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let n = 0, bytes = 0;
const copy = (rel) => {
  const from = path.join(SRC, rel);
  if (!fs.existsSync(from)) { console.warn(`[stage-samples] missing samples/${rel}`); return; }
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).forEach((c) => walk(path.join(p, c))) : (n++, bytes += fs.statSync(p).size));
  walk(to);
};
for (const folder of START_SAMPLE_FOLDERS) copy(folder);
for (const s of START_SAMPLES) if (!START_SAMPLE_FOLDERS.some((f) => s.file.startsWith(`${f}/`))) copy(s.file);
console.log(`[stage-samples] ${n} files, ${(bytes / 1048576).toFixed(1)} MB → ${path.relative(ROOT, OUT)}`);

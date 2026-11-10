#!/usr/bin/env node
// `npm run samples:index`: refreshes samples/index.json without a browser —
// adds the example pictures (PHOTOS in make-samples.mjs) that are in
// samples/images and writes models/mug.obj again when it is missing (the
// repository's root .gitignore drops *.obj). `npm run samples` remakes
// everything (it needs the dev server and Edge / Chrome).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTOS } from './make-samples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'samples');

export async function writeMugObj() {
  const file = path.join(OUT, 'models', 'mug.obj');
  const { SCENES } = await import('./sample-scenes.js');
  const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
  const obj = SCENES.mug();
  obj.updateMatrixWorld(true);
  let i = 0;
  const text = `mtllib mug.mtl\n${new OBJExporter().parse(obj).replace(/^o (.*)$/gm, (m) => `${m}\nusemtl m${i++}`)}`;
  fs.writeFileSync(file, text);
  return file;
}

export function updateIndex() {
  const p = path.join(OUT, 'index.json');
  const index = JSON.parse(fs.readFileSync(p, 'utf8'));
  const known = new Set(index.images.map((e) => e.file));
  for (const ph of PHOTOS) {
    const file = `images/${ph.name}.png`;
    if (!fs.existsSync(path.join(OUT, file))) continue;
    const entry = { file, ko: ph.ko, en: ph.en, source: ph.source };
    if (known.has(file)) index.images = index.images.map((e) => (e.file === file ? entry : e));
    else index.images.push(entry);
  }
  fs.writeFileSync(p, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mug = path.join(OUT, 'models', 'mug.obj');
  if (!fs.existsSync(mug)) console.log(`[samples] wrote ${path.relative(root, await writeMugObj())}`);
  const index = updateIndex();
  console.log(`[samples] index.json: ${index.images.length} pictures, ${index.models.length} 3D files, ${index.results.length} results`);
}

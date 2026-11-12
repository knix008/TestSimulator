// `npm run samples:photos`: the example pictures in PHOTOS (make-samples.mjs)
// fetched from their repositories at a fixed commit and saved byte for byte
// as samples/images/<name>.<ext> — no scaling, no re-encoding. An original
// smaller than PHOTO_SIZE on a side is an error: list only real high-resolution
// pictures. Pictures of an earlier PHOTOS list are removed, and index.json is
// refreshed (update-sample-index.mjs). Needs raw.githubusercontent.com.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PHOTOS, PHOTO_SIZE, PHOTO_SOURCES, photoPath } from './make-samples.mjs';
import { updateIndex } from './update-sample-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'samples');
sharp.cache(false);

async function get(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'My3DObjects-samples' } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      last = new Error(`${res.status} ${res.statusText}`);
    } catch (err) { last = err; }
  }
  throw new Error(`${url}: ${last.message}`);
}

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
  const wanted = new Set(PHOTOS.map(photoPath));
  // Example pictures of an earlier list (index entries with a source).
  for (const e of index.images) {
    if (e.source && !wanted.has(e.file)) fs.rmSync(path.join(OUT, e.file), { force: true });
  }
  const queue = [...PHOTOS];
  const work = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const data = await get(PHOTO_SOURCES[p.source] + p.file);
      const { width, height } = await sharp(data).metadata();
      if (Math.min(width, height) < PHOTO_SIZE) throw new Error(`${p.name}: the original is ${width}×${height}, under ${PHOTO_SIZE} px`);
      fs.writeFileSync(path.join(OUT, photoPath(p)), data);
      console.log(`[photos] ${photoPath(p).padEnd(28)} ${width}×${height}  ${(data.length / 1024).toFixed(0)} KB`);
    }
  };
  await Promise.all([1, 2, 3, 4].map(work));
  const after = updateIndex();
  console.log(`[photos] ${PHOTOS.length} pictures; index.json lists ${after.images.length} pictures in all`);
}

main().catch((err) => { console.error(`[photos] ${err.message}`); process.exit(1); });

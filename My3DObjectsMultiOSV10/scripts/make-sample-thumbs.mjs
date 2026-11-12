// `npm run samples:thumbs`: small transparent previews of the pictures to
// convert, for the start screen's Examples card — samples/thumbs/<name>.webp,
// THUMB × THUMB, the object trimmed of empty margins and centred. A picture
// without transparency (TripoSR's fox on grey) has its background taken out
// first: the colour around the edge, as far as it reaches inward from the
// edge (the same colour inside the object stays). Each index.json picture
// gets `thumb`; previews of pictures no longer listed are removed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'samples');
export const THUMB = 192;
sharp.cache(false);

// RGBA pixels with the edge-connected background made transparent (soft rim).
export function removeFlatBackground(data, width, height, tolerance = 26) {
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  // The background colour: the median of the border pixels.
  const border = [];
  for (let x = 0; x < width; x++) border.push(px(x), px((height - 1) * width + x));
  for (let y = 0; y < height; y++) border.push(px(y * width), px(y * width + width - 1));
  const bg = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
  const dist = (i) => Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);
  // Flood fill from the edge through pixels close to that colour.
  const seen = new Uint8Array(width * height);
  const stack = [];
  const push = (i) => { if (!seen[i] && dist(i) < tolerance * 2) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    if (!seen[i]) continue;
    // Clearly background → transparent; the rim fades between 1× and 2× the tolerance.
    const a = Math.max(0, Math.min(1, (dist(i) - tolerance) / tolerance));
    out[i * 4 + 3] = Math.round(out[i * 4 + 3] * a);
  }
  return out;
}

export async function makeThumb(input) {
  let img = sharp(input).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { opaque = false; break; }
  const rgba = opaque ? removeFlatBackground(data, info.width, info.height) : data;
  img = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });
  const trimmed = await img.png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).png().toBuffer());
  const inner = Math.round(THUMB * 0.9);
  return sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .extend({ top: (THUMB - inner) >> 1, bottom: THUMB - inner - ((THUMB - inner) >> 1), left: (THUMB - inner) >> 1, right: THUMB - inner - ((THUMB - inner) >> 1), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 86, alphaQuality: 90, effort: 5 })
    .toBuffer();
}

export const thumbPath = (file) => `thumbs/${path.basename(file).replace(/\.[^.]+$/, '')}.webp`;

export async function makeThumbs({ log = () => {} } = {}) {
  const indexFile = path.join(OUT, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true });
  const keep = new Set();
  for (const e of index.images) {
    const rel = thumbPath(e.file);
    keep.add(path.basename(rel));
    const dest = path.join(OUT, rel);
    const src = path.join(OUT, e.file);
    // Remade when the picture is newer than its preview.
    if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(src).mtimeMs) {
      fs.writeFileSync(dest, await makeThumb(fs.readFileSync(src)));
      log(`${rel} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
    }
    e.thumb = rel;
  }
  for (const n of fs.readdirSync(path.join(OUT, 'thumbs'))) if (!keep.has(n)) fs.rmSync(path.join(OUT, 'thumbs', n));
  fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makeThumbs({ log: (m) => console.log(`[thumbs] ${m}`) })
    .then((index) => console.log(`[thumbs] ${index.images.length} previews`))
    .catch((err) => { console.error(`[thumbs] ${err.message}`); process.exit(1); });
}

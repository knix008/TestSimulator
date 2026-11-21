// Writes the sample songs as .mam files into samples/ (the installer ships them; the start page builds the
// same songs from their seeds). Run: npm run samples
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLES, buildSample } from '../src/music/samples.js';
import { packSong } from '../src/io/fileformat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');
fs.mkdirSync(dir, { recursive: true });
for (const old of fs.readdirSync(dir)) if (old.endsWith('.mam')) fs.rmSync(path.join(dir, old));
for (const s of SAMPLES) {
  const song = buildSample(s.id);
  const name = `${String(SAMPLES.indexOf(s) + 1).padStart(2, '0')} ${s.language === 'en' ? s.en[0] : s.ko[0]}.mam`.replace(/[\/:*?"<>|]/g, '_');
  fs.writeFileSync(path.join(dir, name), packSong(song));
}
console.log(`samples/: ${SAMPLES.length}곡`);

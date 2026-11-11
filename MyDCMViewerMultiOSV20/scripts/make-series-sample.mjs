/**
 * samples/series/ — two related CT series of one phantom, for the list / detail / tile
 * views and for playing a folder of single-frame files as one cine.
 *
 *   ax_01 … ax_12   axial stack (2 mm), a sphere that grows and shrinks
 *   loc_01 … loc_04 localizer (8 mm), the same study, a second series
 *
 *   node scripts/make-series-sample.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { makeDicom, spherePixels } = require('../test/helpers/makeDicom.js');

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'series');
const studyUid = '1.2.826.0.1.3680043.10.511.1';
const axialUid = '1.2.826.0.1.3680043.10.511.1.1';
const localUid = '1.2.826.0.1.3680043.10.511.1.2';

function writeStack({ count, prefix, seriesUid, seriesNumber, description, thickness, rows, cols }) {
  const names = [];
  for (let i = 0; i < count; i++) {
    const zNorm = (i - (count - 1) / 2) / (count / 2);
    const name = `${prefix}_${String(i + 1).padStart(2, '0')}.dcm`;
    fs.writeFileSync(path.join(out, name), makeDicom({
      rows, cols, sliceIndex: i, nSlices: count, instance: i + 1,
      seriesUid, studyUid, seriesNumber, description, thickness,
      pixels: spherePixels(rows, cols, zNorm),
    }));
    names.push(name);
  }
  return names;
}

fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(out)) if (name.endsWith('.dcm')) fs.unlinkSync(path.join(out, name));
const axial = writeStack({ count: 12, prefix: 'ax', seriesUid: axialUid, seriesNumber: 1, description: 'Axial CT stack', thickness: 2, rows: 128, cols: 128 });
const localizer = writeStack({ count: 4, prefix: 'loc', seriesUid: localUid, seriesNumber: 2, description: 'Localizer', thickness: 8, rows: 128, cols: 128 });
console.log(`wrote ${axial.length + localizer.length} files to ${out}`);

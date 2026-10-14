// Moving (cine) DICOM samples for samples/: open them and press play in the
// DICOM bar to see them move like a video.
//   node scripts/make-samples.mjs
//   cine_heart.dcm    — short-axis "cardiac MR": the ventricle beats, 30 frames at 25 fps
//   cine_phantom.dcm  — "CT phantom": rods turning around the centre, 36 frames at 12 fps
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cineDicom } from './fixture-formats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');

// Deterministic speckle so the tissue looks like an image, not flat colour.
let seed = 12345;
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
const smooth = (t) => t * t * (3 - 2 * t);

function heart(f, x, y) {
  const size = 256;
  const cx = size / 2; const cy = size / 2 + 6;
  const beat = 0.5 - 0.5 * Math.cos((2 * Math.PI * f) / 30); // 0 = filled (diastole), 1 = squeezed (systole)
  const r = Math.hypot(x - cx, y - cy);
  const body = Math.hypot((x - cx) / 118, (y - cy) / 100);
  let v = body < 1 ? 900 + 120 * smooth(Math.min(1, (1 - body) * 4)) : 120; // chest and air
  const lung = Math.hypot((x - cx - 62) / 30, (y - cy + 10) / 52) < 1 || Math.hypot((x - cx + 62) / 30, (y - cy + 10) / 52) < 1;
  if (lung && body < 1) v = 260;
  const outer = 58 - 6 * beat;                 // epicardium
  const inner = 38 - 16 * beat;                // blood pool shrinks as the wall thickens
  if (r < outer) v = 1400;                     // myocardium (dark-ish on cine MR)
  if (r < inner) v = 3200 - 300 * beat;        // bright blood
  const rv = Math.hypot((x - cx + 62) / (34 - 10 * beat), (y - cy - 4) / (26 - 6 * beat));
  if (rv < 1 && r >= outer) v = 2900;          // right ventricle
  if (Math.abs(r - outer) < 1.5) v -= 250;     // edge
  return v + noise() * 90;
}

function phantom(f, x, y) {
  const size = 192;
  const cx = size / 2; const cy = size / 2;
  const r = Math.hypot(x - cx, y - cy);
  if (r > 84) return 0;
  let v = r > 78 ? 1800 : 1100;                                // shell and water
  const a = (2 * Math.PI * f) / 36;
  for (let k = 0; k < 6; k++) {
    const ang = a + (k * Math.PI) / 3;
    const rx = cx + 48 * Math.cos(ang); const ry = cy + 48 * Math.sin(ang);
    if (Math.hypot(x - rx, y - ry) < 9) v = 1500 + k * 400;    // six rods of different density
  }
  if (r < 12) v = 2600;                                        // centre insert
  return v + noise() * 40;
}

const files = {
  'cine_heart.dcm': cineDicom({ width: 256, height: 256, frames: 30, pixel: heart, frameTime: 40, description: 'Cine MR short axis (synthetic)', patient: 'Sample^Heart', patientId: 'CINE-HEART', modality: 'MR', spacing: 1.4, center: 1900, widthWindow: 3400 }),
  'cine_phantom.dcm': cineDicom({ width: 192, height: 192, frames: 36, pixel: phantom, frameTime: 83, description: 'Rotating CT phantom (synthetic)', patient: 'Sample^Phantom', patientId: 'CINE-PHANTOM', modality: 'CT', spacing: 1.0, center: 1700, widthWindow: 2600 }),
};
fs.mkdirSync(out, { recursive: true });
for (const [name, bytes] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), bytes);
  console.log(`${name}: ${(bytes.length / 1024).toFixed(0)} KB`);
}

// The world frame. MyMechanics is Z up: the top plane is XY, the front plane XZ (seen from −Y), the right
// plane YZ (seen from +X). Projects made before (Y up: front = XY, top = XZ) are turned by R = +90° about X,
// (x, y, z) → (x, −z, y), when they are opened (zup.js), so their old +Y (up) becomes +Z.
//
// The sample builders are written in the old Y-up coordinates. They run inside withYUp(): the standard planes,
// the drawing cameras and every "which way is up" rule of the kernel code switch to their Y-up equivalents
// (Rᵀ of the Z-up ones) for that time, and the sample is turned to Z up afterwards like an old file.
// No DOM, no kernel.

/** R: Y-up → Z-up (+90° about X). */
export const toZUp = ([x, y, z]) => [x + 0, -z + 0, y + 0];
/** Rᵀ: Z-up → Y-up. */
export const toYUp = ([x, y, z]) => [x + 0, z + 0, -y + 0];

let depth = 0;
/** True while a Y-up sample builder runs. */
export const isYUp = () => depth > 0;

/** A world vector given in Z-up coordinates, as the current frame sees it (Y up inside withYUp()). */
export const worldVec = (v) => (depth ? toYUp(v) : [...v]);
/** World up (+Z). */
export const worldUp = () => worldVec([0, 0, 1]);
/** Toward the viewer of the front view (−Y). */
export const worldFront = () => worldVec([0, -1, 0]);

const tables = [];

/**
 * Registers a table of Z-up frames (name → { key: [x, y, z] … }) whose vector `keys` are swapped to their Y-up
 * equivalents while withYUp() runs (the table object itself is changed in place, so every importer sees it).
 */
export function frameTable(table, keys) {
  tables.push({ table, keys, zup: JSON.parse(JSON.stringify(table)) });
  if (depth) swap(tables.at(-1), true);
  return table;
}

function swap(t, yUp) {
  for (const [name, entry] of Object.entries(t.zup)) {
    for (const key of t.keys) if (Array.isArray(entry[key])) t.table[name][key] = yUp ? toYUp(entry[key]) : [...entry[key]];
  }
}

/** Runs `fn` in the old Y-up frame (for the sample builders); returns its result. */
export function withYUp(fn) {
  depth += 1;
  if (depth === 1) for (const t of tables) swap(t, true);
  try { return fn(); } finally {
    depth -= 1;
    if (depth === 0) for (const t of tables) swap(t, false);
  }
}

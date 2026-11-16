// The ground the building stands on in 3D: what it is made of (a library or
// preset material, so it gets the real texture and pattern) and its shape — a
// round or square field, the building plot, ground to the horizon, or gentle
// hills with a flat pad for the building. Stored in the project's 3D style
// (style3d.groundType / groundShape); new projects take the defaults from the
// settings. Pure: no three.js (view3d/viewer.js builds the mesh).

/** [id, English name, material id ("" = the style's ground colour)]. */
export const GROUND_TYPES = [
  ["plain", "Plain colour", ""],
  ["lawn", "Lawn", "plant-lawn"],
  ["lawn-lush", "Lush lawn", "plant-lawn-lush"],
  ["meadow", "Meadow (sparse grass)", "plant-lawn-sparse"],
  ["dry-grass", "Dry grass", "plant-lawn-dry"],
  ["soil", "Garden soil", "plant-soil-garden"],
  ["mulch", "Bark mulch", "plant-mulch-bark"],
  ["leaves", "Autumn leaves", "plant-leaf-litter-autumn"],
  ["snow", "Snow", "snow"],
  ["sand", "Sand", "sand"],
  ["gravel", "Gravel", "gravel"],
  ["asphalt", "Asphalt", "asphalt"],
  ["concrete", "Concrete", "floor-concrete-light"],
  ["pavers", "Concrete pavers", "pavers"],
  ["brick-paving", "Brick paving", "wall-brick-red"],
  ["stone-slabs", "Granite slabs", "stone-granite-tile-grey"],
  ["terracotta", "Terracotta tiles", "tile-terracotta-rustic"],
  ["deck", "Wooden deck", "floor-deck-teak"],
  ["water", "Water", "water-pond"],
].map(([id, name, material]) => ({ id, name, material }));

/** Shapes: the size follows the building (its plan extent). */
export const GROUND_SHAPES = [
  { id: "disc", name: "Round field" },
  { id: "square", name: "Square field" },
  { id: "plot", name: "Building plot" },
  { id: "horizon", name: "To the horizon" },
  { id: "hills", name: "Hills around a flat pad" },
];

export const groundTypeById = (id) => GROUND_TYPES.find((g) => g.id === id) || GROUND_TYPES[0];
export const groundShapeById = (id) => GROUND_SHAPES.find((g) => g.id === id) || GROUND_SHAPES[0];

/**
 * The ground's outline for a building extent (metres: { x1, z1, x2, z2 }): { kind: "circle", cx, cz, r } or
 * { kind: "rect", cx, cz, w, d }, plus `hills` (the pad radius and the hill height) for the hills.
 */
export function groundLayout(shape, ext) {
  const cx = (ext.x1 + ext.x2) / 2, cz = (ext.z1 + ext.z2) / 2;
  const w = Math.max(1, ext.x2 - ext.x1), d = Math.max(1, ext.z2 - ext.z1);
  const span = Math.max(w, d);
  const field = Math.max(60, span * 4); // the size the round field always had
  switch (groundShapeById(shape).id) {
    case "square": return { kind: "rect", cx, cz, w: field, d: field };
    case "plot": return { kind: "rect", cx, cz, w: w + 16, d: d + 16 }; // 8 m around the building
    case "horizon": return { kind: "circle", cx, cz, r: Math.max(2000, span * 40) };
    case "hills": {
      const pad = Math.hypot(w, d) / 2 + 8;
      return { kind: "rect", cx, cz, w: Math.max(240, span * 8), d: Math.max(240, span * 8), hills: { pad, height: Math.min(40, Math.max(6, span * 0.6)) } };
    }
    default: return { kind: "circle", cx, cz, r: field / 2 };
  }
}

// Smooth value noise (deterministic): rolling hills, no grid showing.
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * sx, b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * sx;
  return a + (b - a) * sz;
}

/**
 * Height (m) of the hills at (x, z): 0 on the pad around the building, rising smoothly beyond it to rolling
 * hills of about `height`. Never below 0, so nothing of the site sinks.
 */
export function hillHeight(x, z, layout) {
  const h = layout.hills;
  if (!h) return 0;
  const r = Math.hypot(x - layout.cx, z - layout.cz);
  const ramp = Math.min(1, Math.max(0, (r - h.pad) / (h.pad * 2.5)));
  if (ramp <= 0) return 0;
  const s = ramp * ramp * (3 - 2 * ramp);
  const n = noise(x / 45, z / 45) * 0.65 + noise(x / 18 + 7, z / 18 + 3) * 0.35;
  return s * h.height * (0.25 + 0.75 * n);
}

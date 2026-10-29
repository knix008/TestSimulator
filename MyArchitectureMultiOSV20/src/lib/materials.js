// Surface materials for walls, floors and roofs: a colour for the plan and the
// 3D view, and a procedural pattern (drawn on a canvas, so no image files) with
// the size of one pattern tile in millimetres.
//
// cat: the library group (MATERIAL_CATEGORIES). Optional surface physics for
// the 3D view: rough (0 mirror … 1 matt, default 0.85), metal (0…1), bump
// (relief of the pattern, 0 = flat), opacity (see-through).

export const MATERIAL_CATEGORIES = [
  ["paint", "Paint"], ["plaster", "Plaster & board"], ["masonry", "Brick & block"], ["concrete", "Concrete"], ["stone", "Stone"],
  ["wood", "Wood"], ["tile", "Tiles"], ["resilient", "Vinyl, rubber & carpet"], ["fabric", "Fabric & wallpaper"], ["metal", "Metal"],
  ["glass", "Glass"], ["roofing", "Roofing"], ["landscape", "Landscape & paving"], ["layer", "Insulation & layers"],
];

// Every pattern paintPattern() knows.
export const PATTERNS = [null, "brick", "noise", "stone", "planks", "tiles", "rooftiles", "seams",
  "herringbone", "hex", "subway", "mosaic", "terrazzo", "stripes", "slats", "boards", "gravel", "pavers", "weave", "mesh", "checker", "asphalt"];

export const MATERIALS = [
  { id: "plaster", name: "Plaster", color: "#ece8e1", pattern: null, use: ["wall"] },
  { id: "paint-white", name: "White paint", color: "#f6f6f4", pattern: null, use: ["wall"] },
  { id: "paint-sage", name: "Sage paint", color: "#bfcab3", pattern: null, use: ["wall"] },
  { id: "paint-sky", name: "Sky paint", color: "#bcd3e6", pattern: null, use: ["wall"] },
  { id: "brick", name: "Brick", color: "#a65a42", pattern: "brick", tile: 650, use: ["wall"] },
  { id: "concrete", name: "Concrete", color: "#a7a7a2", pattern: "noise", tile: 1200, use: ["wall", "floor", "roof"] },
  { id: "stone", name: "Stone", color: "#b8ae9c", pattern: "stone", tile: 1200, use: ["wall", "floor"] },
  { id: "wood-cladding", name: "Wood cladding", color: "#b98a5a", pattern: "planks", tile: 1200, use: ["wall"] },
  { id: "glass", name: "Glass", color: "#9fcde3", pattern: null, use: ["wall"] },
  { id: "oak", name: "Oak floor", color: "#c49a6c", pattern: "planks", tile: 1200, use: ["floor"] },
  { id: "walnut", name: "Walnut floor", color: "#7a553a", pattern: "planks", tile: 1200, use: ["floor"] },
  { id: "tile-white", name: "White tiles", color: "#e7e7e3", pattern: "tiles", tile: 600, use: ["floor", "wall"] },
  { id: "tile-grey", name: "Grey tiles", color: "#9c9fa3", pattern: "tiles", tile: 600, use: ["floor"] },
  { id: "marble", name: "Marble", color: "#eeeae4", pattern: "noise", tile: 1500, use: ["floor"] },
  { id: "carpet", name: "Carpet", color: "#8e8a9a", pattern: "noise", tile: 600, use: ["floor"] },
  { id: "grass", name: "Grass", color: "#6f9a4f", pattern: "noise", tile: 2000, use: ["floor"] },
  { id: "insulation", name: "Insulation", color: "#e9d77a", pattern: "noise", tile: 600, use: ["layer"] },
  { id: "air", name: "Air gap", color: "#dfe7ee", pattern: null, use: ["layer"] },
  { id: "roof-tiles", name: "Roof tiles", color: "#9b4a3a", pattern: "rooftiles", tile: 900, use: ["roof"] },
  { id: "roof-slate", name: "Slate", color: "#4f5761", pattern: "rooftiles", tile: 900, use: ["roof"] },
  { id: "roof-metal", name: "Metal roof", color: "#7d8790", pattern: "seams", tile: 1000, use: ["roof"] },
  // Structure, ceilings and frames (slabs, beams, curtain walls, railings).
  { id: "screed", name: "Screed", color: "#c9c4b8", pattern: "noise", tile: 1200, use: ["floor", "layer"] },
  { id: "gypsum", name: "Gypsum board", color: "#f1efe9", pattern: null, use: ["wall", "ceiling", "layer"] },
  { id: "acoustic-tile", name: "Acoustic ceiling tiles", color: "#ecebe6", pattern: "tiles", tile: 600, use: ["ceiling"] },
  { id: "aluminium", name: "Aluminium", color: "#8d949b", pattern: null, use: ["frame", "wall"] },
  { id: "steel", name: "Steel", color: "#6f767e", pattern: null, use: ["frame", "structure", "wall"] },
  { id: "timber", name: "Structural timber", color: "#c8a06a", pattern: "planks", tile: 1200, use: ["structure", "layer", "floor"] },
  // ---- interior paints (wall and ceiling)
  { id: "paint-warm-grey", name: "Warm grey paint", color: "#c9c3b8", pattern: null, use: ["wall", "ceiling"] },
  { id: "paint-greige", name: "Greige paint", color: "#d6cdbd", pattern: null, use: ["wall", "ceiling"] },
  { id: "paint-cream", name: "Cream paint", color: "#efe6d2", pattern: null, use: ["wall", "ceiling"] },
  { id: "paint-blush", name: "Blush pink paint", color: "#e3c3bb", pattern: null, use: ["wall"] },
  { id: "paint-terracotta", name: "Terracotta paint", color: "#c0714f", pattern: null, use: ["wall"] },
  { id: "paint-mustard", name: "Mustard paint", color: "#d2a44a", pattern: null, use: ["wall"] },
  { id: "paint-olive", name: "Olive paint", color: "#8a8a5c", pattern: null, use: ["wall"] },
  { id: "paint-forest", name: "Forest green paint", color: "#3f5a48", pattern: null, use: ["wall"] },
  { id: "paint-teal", name: "Teal paint", color: "#3d7a7d", pattern: null, use: ["wall"] },
  { id: "paint-navy", name: "Navy paint", color: "#2f3d58", pattern: null, use: ["wall"] },
  { id: "paint-charcoal", name: "Charcoal paint", color: "#45484d", pattern: null, use: ["wall", "ceiling"] },
  { id: "paint-black", name: "Matt black paint", color: "#26272a", pattern: null, use: ["wall", "ceiling"] },
  // ---- plaster and boards
  { id: "venetian-plaster", name: "Venetian plaster", color: "#ddd5c8", pattern: "noise", tile: 2400, use: ["wall", "ceiling"] },
  { id: "lime-plaster", name: "Lime plaster", color: "#e9e1d0", pattern: "noise", tile: 1800, use: ["wall"] },
  { id: "plywood", name: "Plywood", color: "#d4b48a", pattern: "planks", tile: 2400, use: ["wall", "floor", "ceiling"] },
  { id: "wood-slats", name: "Wood slat panel", color: "#a87b51", pattern: "slats", tile: 600, use: ["wall", "ceiling"] },
  // ---- brick and block
  { id: "brick-white", name: "White painted brick", color: "#ece9e2", pattern: "brick", tile: 650, use: ["wall"] },
  { id: "brick-dark", name: "Dark brick", color: "#5e3d33", pattern: "brick", tile: 650, use: ["wall"] },
  { id: "concrete-block", name: "Concrete block", color: "#b3b0a8", pattern: "subway", tile: 800, use: ["wall", "layer"] },
  // ---- concrete
  { id: "concrete-board", name: "Board-formed concrete", color: "#a9a69e", pattern: "boards", tile: 1500, use: ["wall", "structure"] },
  { id: "concrete-polished", name: "Polished concrete", color: "#b5b3ad", pattern: "noise", tile: 2000, use: ["floor"] },
  { id: "concrete-precast", name: "Precast concrete", color: "#c7c4bb", pattern: "tiles", tile: 3000, use: ["wall", "structure"] },
  { id: "concrete-dark", name: "Dark concrete", color: "#6d6d6a", pattern: "noise", tile: 1200, use: ["wall", "floor", "structure"] },
  // ---- stone
  { id: "granite", name: "Granite", color: "#8f8c88", pattern: "terrazzo", tile: 600, use: ["wall", "floor"] },
  { id: "limestone", name: "Limestone", color: "#d9cfb7", pattern: "tiles", tile: 1200, use: ["wall", "floor"] },
  { id: "travertine", name: "Travertine", color: "#d6c3a2", pattern: "stone", tile: 1200, use: ["wall", "floor"] },
  { id: "slate-floor", name: "Slate floor", color: "#59606a", pattern: "tiles", tile: 900, use: ["floor", "wall"] },
  { id: "marble-black", name: "Black marble", color: "#2c2d30", pattern: "noise", tile: 1500, use: ["floor", "wall"] },
  { id: "terrazzo", name: "Terrazzo", color: "#e2ddd3", pattern: "terrazzo", tile: 800, use: ["floor", "wall"] },
  // ---- wood
  { id: "oak-herringbone", name: "Oak herringbone", color: "#c39a6b", pattern: "herringbone", tile: 900, use: ["floor"] },
  { id: "ash", name: "Light ash floor", color: "#dcc6a3", pattern: "planks", tile: 1200, use: ["floor", "wall"] },
  { id: "teak-deck", name: "Teak decking", color: "#9a6b43", pattern: "planks", tile: 900, use: ["floor"] },
  { id: "bamboo", name: "Bamboo", color: "#d1b47a", pattern: "planks", tile: 600, use: ["floor", "wall"] },
  { id: "wood-panel", name: "Walnut panelling", color: "#6b4a33", pattern: "slats", tile: 900, use: ["wall"] },
  // ---- tiles
  { id: "tile-subway", name: "Subway tiles", color: "#f1f0ec", pattern: "subway", tile: 300, use: ["wall"] },
  { id: "tile-hex", name: "Hexagon tiles", color: "#d8d6d0", pattern: "hex", tile: 400, use: ["floor", "wall"] },
  { id: "tile-mosaic", name: "Blue mosaic", color: "#5f8fb0", pattern: "mosaic", tile: 300, use: ["wall", "floor"] },
  { id: "tile-terracotta", name: "Terracotta tiles", color: "#b8664a", pattern: "tiles", tile: 600, use: ["floor"] },
  { id: "tile-checker", name: "Checkerboard tiles", color: "#efeeea", pattern: "checker", tile: 600, use: ["floor"] },
  { id: "tile-green", name: "Green glazed tiles", color: "#5d8a73", pattern: "subway", tile: 300, use: ["wall"] },
  // ---- vinyl, rubber and carpet
  { id: "vinyl-grey", name: "Grey vinyl", color: "#a3a5a6", pattern: "noise", tile: 1000, use: ["floor"] },
  { id: "rubber-black", name: "Rubber flooring", color: "#3a3c3f", pattern: "noise", tile: 600, use: ["floor"] },
  { id: "carpet-wool", name: "Wool carpet", color: "#b8ab97", pattern: "weave", tile: 300, use: ["floor"] },
  { id: "carpet-blue", name: "Blue carpet tiles", color: "#4c5d7a", pattern: "weave", tile: 500, use: ["floor"] },
  // ---- fabric and wallpaper
  { id: "wallpaper-stripes", name: "Striped wallpaper", color: "#e5ddcd", pattern: "stripes", tile: 500, use: ["wall"] },
  { id: "wallpaper-green", name: "Green striped wallpaper", color: "#9fb5a0", pattern: "stripes", tile: 400, use: ["wall"] },
  { id: "fabric-panel", name: "Fabric wall panel", color: "#8e8a83", pattern: "weave", tile: 400, use: ["wall", "ceiling"] },
  { id: "linen", name: "Linen", color: "#d9d0bf", pattern: "weave", tile: 200, use: ["wall"] },
  // ---- metal
  { id: "stainless", name: "Stainless steel", color: "#b9bec3", pattern: null, use: ["frame", "wall", "structure"] },
  { id: "brass", name: "Brass", color: "#b8954d", pattern: null, use: ["frame", "wall"] },
  { id: "copper", name: "Copper", color: "#b06f4b", pattern: "seams", tile: 600, use: ["wall", "roof"] },
  { id: "zinc", name: "Zinc", color: "#8c949a", pattern: "seams", tile: 600, use: ["wall", "roof"] },
  { id: "corten", name: "Weathering steel", color: "#8a4a2b", pattern: "noise", tile: 1500, use: ["wall", "structure"] },
  { id: "galvanised", name: "Galvanised steel", color: "#a8adb0", pattern: "noise", tile: 2000, use: ["frame", "structure"] },
  { id: "steel-red", name: "Red painted steel", color: "#a8322d", pattern: null, use: ["structure", "frame"] },
  { id: "steel-grey", name: "Grey painted steel", color: "#7e858c", pattern: null, use: ["structure", "frame"] },
  { id: "steel-white", name: "White painted steel", color: "#e6e6e2", pattern: null, use: ["structure", "frame"] },
  { id: "metal-mesh", name: "Metal mesh", color: "#8a9096", pattern: "mesh", tile: 200, use: ["wall", "frame"] },
  { id: "cable", name: "Steel cable", color: "#55595e", pattern: null, use: ["structure"] },
  // ---- glass
  { id: "glass-frosted", name: "Frosted glass", color: "#dfe8ec", pattern: null, use: ["wall"] },
  { id: "glass-tinted", name: "Tinted glass", color: "#5f7d8c", pattern: null, use: ["wall"] },
  // ---- roofing
  { id: "roof-shingles", name: "Asphalt shingles", color: "#4b4847", pattern: "rooftiles", tile: 600, use: ["roof"] },
  { id: "roof-green", name: "Green roof", color: "#62894a", pattern: "noise", tile: 2000, use: ["roof"] },
  { id: "roof-membrane", name: "Roof membrane", color: "#8f9294", pattern: "seams", tile: 2000, use: ["roof"] },
  // ---- landscape and paving
  { id: "asphalt", name: "Asphalt", color: "#3d3f42", pattern: "asphalt", tile: 1500, use: ["floor", "structure"] },
  { id: "gravel", name: "Gravel", color: "#a39d92", pattern: "gravel", tile: 800, use: ["floor"] },
  { id: "pavers", name: "Concrete pavers", color: "#a9a49b", pattern: "pavers", tile: 600, use: ["floor"] },
  { id: "pavers-clay", name: "Clay pavers", color: "#a35d43", pattern: "herringbone", tile: 800, use: ["floor"] },
  { id: "sand", name: "Sand", color: "#d8c79e", pattern: "noise", tile: 1500, use: ["floor"] },
  { id: "soil", name: "Soil", color: "#6c5440", pattern: "noise", tile: 1500, use: ["floor"] },
  { id: "water", name: "Water", color: "#4f89a8", pattern: null, use: ["floor"] },
];

// Library group, surface physics and see-through of each material (by id;
// ids not listed: matt, flat, in the group of their first use).
const LOOK = {
  // cat, rough, metal, bump, opacity
  plaster: ["plaster"], "paint-white": ["paint"], "paint-sage": ["paint"], "paint-sky": ["paint"], brick: ["masonry", 0.9, 0, 1],
  concrete: ["concrete", 0.9, 0, 0.3], stone: ["stone", 0.85, 0, 1], "wood-cladding": ["wood", 0.75, 0, 0.6], glass: ["glass", 0.08, 0.1, 0, 0.35],
  oak: ["wood", 0.55, 0, 0.3], walnut: ["wood", 0.5, 0, 0.3], "tile-white": ["tile", 0.25, 0, 0.6], "tile-grey": ["tile", 0.3, 0, 0.6], marble: ["stone", 0.2, 0, 0],
  carpet: ["resilient", 1, 0, 0.4], grass: ["landscape", 1, 0, 0.8], insulation: ["layer", 1, 0, 0.5], air: ["layer"],
  "roof-tiles": ["roofing", 0.8, 0, 1], "roof-slate": ["roofing", 0.6, 0, 1], "roof-metal": ["roofing", 0.45, 0.4, 0.5],
  screed: ["concrete", 0.9, 0, 0.2], gypsum: ["plaster"], "acoustic-tile": ["plaster", 0.95, 0, 0.6], aluminium: ["metal", 0.35, 0.8], steel: ["metal", 0.4, 0.8],
  timber: ["wood", 0.7, 0, 0.5],
  "venetian-plaster": ["plaster", 0.35, 0, 0.15], "lime-plaster": ["plaster", 0.95, 0, 0.3], plywood: ["wood", 0.7, 0, 0.2], "wood-slats": ["wood", 0.7, 0, 1.2],
  "brick-white": ["masonry", 0.85, 0, 1], "brick-dark": ["masonry", 0.85, 0, 1], "concrete-block": ["masonry", 0.95, 0, 0.8],
  "concrete-board": ["concrete", 0.9, 0, 0.8], "concrete-polished": ["concrete", 0.25, 0, 0.1], "concrete-precast": ["concrete", 0.85, 0, 0.6], "concrete-dark": ["concrete", 0.9, 0, 0.3],
  granite: ["stone", 0.3, 0, 0.1], limestone: ["stone", 0.8, 0, 0.5], travertine: ["stone", 0.6, 0, 0.6], "slate-floor": ["stone", 0.7, 0, 0.6], "marble-black": ["stone", 0.15, 0, 0], terrazzo: ["stone", 0.3, 0, 0.1],
  "oak-herringbone": ["wood", 0.5, 0, 0.4], ash: ["wood", 0.55, 0, 0.3], "teak-deck": ["wood", 0.7, 0, 0.7], bamboo: ["wood", 0.5, 0, 0.3], "wood-panel": ["wood", 0.55, 0, 1],
  "tile-subway": ["tile", 0.15, 0, 0.6], "tile-hex": ["tile", 0.3, 0, 0.6], "tile-mosaic": ["tile", 0.15, 0, 0.5], "tile-terracotta": ["tile", 0.75, 0, 0.6], "tile-checker": ["tile", 0.2, 0, 0.3], "tile-green": ["tile", 0.12, 0, 0.6],
  "vinyl-grey": ["resilient", 0.5, 0, 0.1], "rubber-black": ["resilient", 0.8, 0, 0.3], "carpet-wool": ["resilient", 1, 0, 0.6], "carpet-blue": ["resilient", 1, 0, 0.6],
  "wallpaper-stripes": ["fabric", 0.8, 0, 0.1], "wallpaper-green": ["fabric", 0.8, 0, 0.1], "fabric-panel": ["fabric", 1, 0, 0.5], linen: ["fabric", 1, 0, 0.4],
  stainless: ["metal", 0.25, 1], brass: ["metal", 0.3, 1], copper: ["metal", 0.4, 1, 0.3], zinc: ["metal", 0.5, 0.8, 0.3], corten: ["metal", 0.85, 0.5, 0.4],
  galvanised: ["metal", 0.45, 0.9, 0.2], "steel-red": ["metal", 0.5, 0.3], "steel-grey": ["metal", 0.5, 0.3], "steel-white": ["metal", 0.5, 0.2], "metal-mesh": ["metal", 0.4, 0.8, 1], cable: ["metal", 0.35, 0.9],
  "glass-frosted": ["glass", 0.6, 0, 0, 0.7], "glass-tinted": ["glass", 0.05, 0.2, 0, 0.5],
  "roof-shingles": ["roofing", 0.95, 0, 0.8], "roof-green": ["roofing", 1, 0, 1], "roof-membrane": ["roofing", 0.7, 0, 0.2],
  asphalt: ["landscape", 0.95, 0, 0.4], gravel: ["landscape", 1, 0, 1.2], pavers: ["landscape", 0.9, 0, 0.8], "pavers-clay": ["landscape", 0.85, 0, 0.8], sand: ["landscape", 1, 0, 0.3], soil: ["landscape", 1, 0, 0.5],
  water: ["landscape", 0.05, 0, 0, 0.8],
};
for (const m of MATERIALS) {
  const [cat, rough, metal, bump, opacity] = LOOK[m.id] || [];
  m.cat = cat || (m.use.includes("roof") ? "roofing" : m.use.includes("frame") ? "metal" : m.use.includes("layer") ? "layer" : "plaster");
  if (rough !== undefined) m.rough = rough;
  if (metal) m.metal = metal;
  if (bump) m.bump = bump;
  if (opacity !== undefined) m.opacity = opacity;
}

// Physical and thermal properties (for U-values in schedules, gbXML and IFC):
// lambda = thermal conductivity W/(m·K), density kg/m³, cp = specific heat J/(kg·K).
const THERMAL = {
  plaster: [0.57, 1300, 1000], "paint-white": [0.57, 1300, 1000], "paint-sage": [0.57, 1300, 1000], "paint-sky": [0.57, 1300, 1000],
  brick: [0.77, 1800, 840], concrete: [1.95, 2400, 880], stone: [2.3, 2600, 900], "wood-cladding": [0.13, 500, 1600], glass: [1.0, 2500, 750],
  oak: [0.18, 700, 1600], walnut: [0.16, 650, 1600], "tile-white": [1.3, 2300, 840], "tile-grey": [1.3, 2300, 840], marble: [2.8, 2700, 880],
  carpet: [0.06, 200, 1300], grass: [1.5, 1800, 1200], insulation: [0.035, 30, 1030], air: [0.17, 1.2, 1006],
  "roof-tiles": [1.0, 2000, 800], "roof-slate": [2.0, 2700, 750], "roof-metal": [50, 7800, 450],
  screed: [1.4, 2000, 840], gypsum: [0.25, 900, 1000], "acoustic-tile": [0.06, 300, 1000], aluminium: [160, 2700, 880], steel: [50, 7800, 450], timber: [0.13, 500, 1600],
};
for (const m of MATERIALS) { const th = THERMAL[m.id]; if (th) [m.lambda, m.density, m.cp] = th; }

// Thermal transmittance (U, W/(m²·K)) of a layer build-up [{material, thickness mm}],
// with the usual surface resistances (inside 0.13, outside 0.04 m²K/W).
export function uValue(layers, { rsi = 0.13, rse = 0.04 } = {}) {
  let R = rsi + rse;
  for (const l of layers || []) { const m = BY_ID_LATE().get(l.material); R += (l.thickness / 1000) / ((m && m.lambda) || 1); }
  return 1 / R;
}
const BY_ID_LATE = () => BY_ID;

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

// The open project's own and edited materials (project.materials: colour,
// texture image `src`, tile size, opacity), looked up before the library; an
// entry with a library id edits that material (src/core/skmodel.js).
let PROJECT = new Map();
export function setProjectMaterials(list) {
  PROJECT = new Map();
  for (const m of list || []) {
    const lib = BY_ID.get(m.id);
    PROJECT.set(m.id, { use: ["wall", "floor", "roof"], pattern: null, ...(lib || {}), ...m, custom: !lib });
  }
}
export const projectMaterials = () => [...PROJECT.values()];

export function materialById(id) {
  return PROJECT.get(id) || BY_ID.get(id) || null;
}

export function materialsFor(use) {
  return MATERIALS.filter((m) => m.use.includes(use));
}

export const DEFAULT_MATERIAL = { wall: "plaster", exterior: "plaster", floor: "oak", roof: "roof-tiles" };

// Colour for an id or a raw "#rrggbb".
export function materialColor(id, fallback = "#cccccc") {
  if (typeof id === "string" && /^#[0-9a-f]{6}$/i.test(id)) return id;
  const m = materialById(id);
  return m ? m.color : fallback;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Paint a material's pattern on a square canvas context of `size` pixels.
// Deterministic (seeded), so screenshots and tests are stable.
export function paintPattern(g, m, size = 256) {
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = m.color;
  g.fillRect(0, 0, size, size);
  const base = m.color;
  if (m.pattern === "brick") {
    const rows = 8, h = size / rows, w = size / 2;
    g.fillStyle = shade(base, 1.25);
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < 3; c++) {
        const x = c * w + (r % 2 ? w / 2 : 0);
        g.fillStyle = shade(base, 0.85 + rnd() * 0.3);
        g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      }
    }
  } else if (m.pattern === "tiles") {
    const n = 4, s = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade(base, 0.96 + rnd() * 0.08); g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3); }
    g.strokeStyle = shade(base, 0.72);
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, size); g.moveTo(0, i * s); g.lineTo(size, i * s); g.stroke(); }
  } else if (m.pattern === "planks") {
    const n = 6, h = size / n;
    for (let r = 0; r < n; r++) {
      const off = rnd() * size;
      for (const x0 of [off - size, off]) {
        g.fillStyle = shade(base, 0.85 + rnd() * 0.3);
        g.fillRect(x0, r * h, size, h);
        g.fillStyle = shade(base, 0.6);
        g.fillRect(x0, r * h, 2, h);
      }
      g.fillStyle = shade(base, 0.65);
      g.fillRect(0, r * h, size, 1.5);
      g.strokeStyle = shade(base, 0.8);
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { const y = r * h + rnd() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(size / 3, y + 3, (2 * size) / 3, y - 3, size, y); g.stroke(); }
    }
  } else if (m.pattern === "stone") {
    for (let k = 0; k < 40; k++) {
      g.fillStyle = shade(base, 0.8 + rnd() * 0.35);
      const x = rnd() * size, y = rnd() * size, r = 14 + rnd() * 26;
      g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  } else if (m.pattern === "rooftiles") {
    const rows = 6, h = size / rows, w = size / 5;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < 6; c++) {
        const x = c * w + (r % 2 ? w / 2 : 0);
        g.fillStyle = shade(base, 0.85 + rnd() * 0.25);
        g.beginPath(); g.moveTo(x + 1, r * h); g.lineTo(x + w - 1, r * h); g.lineTo(x + w - 1, r * h + h * 0.7); g.quadraticCurveTo(x + w / 2, r * h + h + 4, x + 1, r * h + h * 0.7); g.closePath(); g.fill();
      }
      g.fillStyle = shade(base, 0.6);
      g.fillRect(0, r * h, size, 2);
    }
  } else if (m.pattern === "seams") {
    const n = 5, w = size / n;
    for (let i = 0; i < n; i++) { g.fillStyle = shade(base, 1.08); g.fillRect(i * w, 0, 4, size); g.fillStyle = shade(base, 0.8); g.fillRect(i * w + 4, 0, 2, size); }
  } else if (m.pattern === "noise") {
    for (let k = 0; k < 1800; k++) {
      g.fillStyle = shade(base, 0.86 + rnd() * 0.26);
      g.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 3, 2 + rnd() * 3);
    }
  } else if (PAINTERS[m.pattern]) PAINTERS[m.pattern](g, base, size, rnd);
}

// A shape that may cross the tile's edge is drawn again one tile over, so the
// texture repeats without seams.
function wrapped(size, x, y, w, h, draw) {
  for (const dx of [0, -size, size]) for (const dy of [0, -size, size]) {
    if (x + dx + w < 0 || x + dx - w > size || y + dy + h < 0 || y + dy - h > size) continue;
    draw(x + dx, y + dy);
  }
}
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.closePath(); g.fill(); };

// The patterns added for interiors, structures and landscape. Each one fills
// the tile (the base colour is already there) and tiles seamlessly.
const PAINTERS = {
  // Parquet in a herringbone: blocks at ±45° in alternating columns.
  herringbone(g, base, size, rnd) {
    const n = 4, L = size / n, W = L / 2;
    g.fillStyle = shade(base, 0.7);
    g.fillRect(0, 0, size, size);
    for (let col = 0; col < n * 2; col++) {
      for (let row = -1; row <= n * 2; row++) {
        const x = col * W, y = row * W + (col % 2) * (W / 2);
        g.fillStyle = shade(base, 0.85 + rnd() * 0.3);
        const up = (col + row) % 2 === 0;
        poly(g, up ? [[x + 1, y + 1], [x + W - 1, y + 1], [x + W - 1, y + W - 1], [x + 1, y + W - 1]] : [[x + 2, y + 2], [x + W - 2, y + 2], [x + W - 2, y + W - 2], [x + 2, y + W - 2]]);
      }
    }
  },
  // Hexagon tiles with grout.
  hex(g, base, size, rnd) {
    g.fillStyle = shade(base, 0.7);
    g.fillRect(0, 0, size, size);
    const r = size / 6, w = Math.sqrt(3) * r;
    const cols = Math.round(size / w), rows = Math.round(size / (1.5 * r));
    const sx = size / cols, sy = size / rows;
    for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) {
      const cx = i * sx + (j % 2 ? sx / 2 : 0), cy = j * sy;
      g.fillStyle = shade(base, 0.94 + rnd() * 0.1);
      const pts = [];
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; pts.push([cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2) * (sy / (1.5 * r))]); }
      poly(g, pts);
    }
  },
  // Running-bond rectangles (subway tiles, concrete blocks).
  subway(g, base, size, rnd) {
    g.fillStyle = shade(base, 0.75);
    g.fillRect(0, 0, size, size);
    const rows = 8, h = size / rows, w = size / 4;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
      g.fillStyle = shade(base, 0.95 + rnd() * 0.08);
      g.fillRect(c * w + (r % 2 ? w / 2 : 0) + 1.5, r * h + 1.5, w - 3, h - 3);
    }
  },
  // Small square tiles in several shades.
  mosaic(g, base, size, rnd) {
    g.fillStyle = shade(base, 1.35);
    g.fillRect(0, 0, size, size);
    const n = 12, s = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade(base, 0.75 + rnd() * 0.5); g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2); }
  },
  // Chips of stone in a binder.
  terrazzo(g, base, size, rnd) {
    for (let k = 0; k < 220; k++) {
      const x = rnd() * size, y = rnd() * size, r = 2 + rnd() * 7, rot = rnd() * 3, f = rnd();
      g.fillStyle = f < 0.4 ? shade(base, 0.45 + rnd() * 0.2) : f < 0.7 ? shade(base, 1.1 + rnd() * 0.1) : shade(base, 0.75 + rnd() * 0.2);
      wrapped(size, x, y, r, r, (px, py) => { g.beginPath(); g.ellipse(px, py, r, r * 0.7, rot, 0, Math.PI * 2); g.fill(); });
    }
  },
  // Wallpaper stripes: wide and thin bands.
  stripes(g, base, size) {
    const n = 4, w = size / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(base, 0.86);
      g.fillRect(i * w, 0, w * 0.35, size);
      g.fillStyle = shade(base, 1.08);
      g.fillRect(i * w + w * 0.55, 0, w * 0.06, size);
    }
  },
  // Vertical slats with dark gaps (wood panels).
  slats(g, base, size, rnd) {
    const n = 8, w = size / n;
    g.fillStyle = shade(base, 0.35);
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(base, 0.88 + rnd() * 0.24);
      g.fillRect(i * w, 0, w * 0.78, size);
      g.fillStyle = shade(base, 1.12);
      g.fillRect(i * w, 0, 1.5, size);
    }
  },
  // Board-formed concrete: horizontal boards with tie holes.
  boards(g, base, size, rnd) {
    const n = 6, h = size / n;
    for (let r = 0; r < n; r++) {
      g.fillStyle = shade(base, 0.9 + rnd() * 0.18);
      g.fillRect(0, r * h, size, h);
      g.fillStyle = shade(base, 0.72);
      g.fillRect(0, r * h, size, 1.5);
      for (let k = 0; k < 120; k++) { g.fillStyle = shade(base, 0.85 + rnd() * 0.25); g.fillRect(rnd() * size, r * h + rnd() * h, 6 + rnd() * 18, 1); }
    }
    g.fillStyle = shade(base, 0.55);
    for (const x of [size / 4, (3 * size) / 4]) for (let r = 0; r < n; r += 3) { g.beginPath(); g.ellipse(x, r * h + h / 2, 3, 3, 0, 0, Math.PI * 2); g.fill(); }
  },
  // Rounded pebbles.
  gravel(g, base, size, rnd) {
    g.fillStyle = shade(base, 0.6);
    g.fillRect(0, 0, size, size);
    for (let k = 0; k < 420; k++) {
      const x = rnd() * size, y = rnd() * size, r = 3 + rnd() * 6, rot = rnd() * 3;
      g.fillStyle = shade(base, 0.8 + rnd() * 0.45);
      wrapped(size, x, y, r, r, (px, py) => { g.beginPath(); g.ellipse(px, py, r, r * (0.6 + 0.3 * ((k % 5) / 5)), rot, 0, Math.PI * 2); g.fill(); });
    }
  },
  // Large rectangular pavers in a stretcher bond.
  pavers(g, base, size, rnd) {
    g.fillStyle = shade(base, 0.65);
    g.fillRect(0, 0, size, size);
    const rows = 4, h = size / rows, w = size / 2;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 3; c++) {
      g.fillStyle = shade(base, 0.88 + rnd() * 0.22);
      g.fillRect(c * w + (r % 2 ? w / 2 : 0) + 3, r * h + 3, w - 6, h - 6);
    }
  },
  // A woven texture (carpet, linen, fabric panels).
  weave(g, base, size, rnd) {
    const n = 32, s = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = shade(base, (i + j) % 2 ? 0.9 + rnd() * 0.06 : 1.04 + rnd() * 0.06);
      g.fillRect(i * s, j * s, (i + j) % 2 ? s : s * 0.9, (i + j) % 2 ? s * 0.9 : s);
    }
  },
  // Expanded metal / wire mesh: a diagonal lattice.
  mesh(g, base, size) {
    g.fillStyle = shade(base, 0.45);
    g.fillRect(0, 0, size, size);
    const n = 8, s = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = shade(base, 1.1);
      const x = i * s, y = j * s;
      poly(g, [[x + s / 2, y + 2], [x + s - 2, y + s / 2], [x + s / 2, y + s - 2], [x + 2, y + s / 2]]);
      g.fillStyle = shade(base, 0.5);
      poly(g, [[x + s / 2, y + 5], [x + s - 5, y + s / 2], [x + s / 2, y + s - 5], [x + 5, y + s / 2]]);
    }
  },
  // Light and dark squares.
  checker(g, base, size) {
    const n = 4, s = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? shade(base, 0.22) : shade(base, 1);
      g.fillRect(i * s, j * s, s, s);
    }
    g.fillStyle = shade(base, 0.6);
    for (let i = 0; i <= n; i++) { g.fillRect(i * s - 1, 0, 2, size); g.fillRect(0, i * s - 1, size, 2); }
  },
  // Asphalt: fine dark and light grains.
  asphalt(g, base, size, rnd) {
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = shade(base, rnd() < 0.15 ? 1.5 + rnd() * 0.6 : 0.7 + rnd() * 0.5);
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  },
};

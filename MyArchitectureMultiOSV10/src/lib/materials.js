// Surface materials for walls, floors and roofs: a colour for the plan and the
// 3D view, and a procedural pattern (drawn on a canvas, so no image files) with
// the size of one pattern tile in millimetres.

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
];

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
  }
}

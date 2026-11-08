// Blank projects by kind of building (start page › 새로 시작). Each preset is an
// empty project with the storeys, storey heights, wall sizes and structural
// grid usual for that kind of building, so drawing can start on the grid at
// the right level heights. Pure: the unit tests build every preset in Node.

import { newProject, newLevel, normalizeProject } from "./project.js";
import { uid } from "./geom.js";

// levels: number of storeys; height: floor-to-floor (mm); wall: default wall
// thickness; grid: [x spans], [y spans] in mm (none: no grid); basement: one
// storey below ground.
export const PRESETS = {
  house: { name: "Blank house", desc: "Two storeys of 2.8 m, ready for walls and a roof", levels: 2, height: 2800, wall: 200 },
  flat: { name: "Blank apartment unit", desc: "One 2.7 m storey with 4.2 m bays", levels: 1, height: 2700, wall: 200, grid: [[4200, 4200, 4200], [6000, 4500]] },
  apartments: { name: "Blank apartment block", desc: "Five 2.9 m storeys on a 6 m grid", levels: 5, height: 2900, wall: 250, grid: [[6000, 6000, 6000, 6000, 6000], [7200, 6000]] },
  office: { name: "Blank office building", desc: "Four 3.6 m storeys on an 8.4 m grid", levels: 4, height: 3600, wall: 250, grid: [[8400, 8400, 8400, 8400], [8400, 8400]] },
  retail: { name: "Blank shop building", desc: "Two 4.2 m storeys, open 8 m bays", levels: 2, height: 4200, wall: 250, grid: [[8000, 8000, 8000], [8000, 8000]] },
  tower: { name: "Blank high-rise", desc: "Twelve 3.8 m storeys and a basement, 9 m grid", levels: 12, height: 3800, wall: 300, basement: true, grid: [[9000, 9000, 9000, 9000], [9000, 9000, 9000]] },
  warehouse: { name: "Blank warehouse", desc: "One 8 m hall on a 12 × 20 m grid", levels: 1, height: 8000, wall: 300, grid: [[12000, 12000, 12000, 12000], [20000, 20000]] },
  public: { name: "Blank public building", desc: "Three 4 m storeys on a 7.2 m grid", levels: 3, height: 4000, wall: 250, grid: [[7200, 7200, 7200, 7200, 7200, 7200], [7200, 7200, 7200]] },
};

export const PRESET_IDS = Object.keys(PRESETS);

/** A new project for preset `id` (an unknown id gives the plain blank project). */
export function presetProject(id, title = "Untitled") {
  const pr = PRESETS[id];
  const p = newProject(title);
  if (!pr) return normalizeProject(p);
  p.defaults = { ...p.defaults, wallHeight: pr.height, wallThickness: pr.wall };
  const levels = [];
  if (pr.basement) levels.push({ ...newLevel("B1", -pr.height, pr.height) });
  for (let i = 0; i < pr.levels; i++) levels.push(newLevel(`${i + 1}F`, i * pr.height, pr.height));
  p.levels = levels;
  p.view = { level: levels.find((l) => l.elevation === 0).id };
  if (pr.grid) {
    const [xs, ys] = pr.grid;
    const X = [0], Y = [0];
    for (const s of xs) X.push(X[X.length - 1] + s);
    for (const s of ys) Y.push(Y[Y.length - 1] + s);
    const over = 1500;
    const w = X[X.length - 1], d = Y[Y.length - 1];
    X.forEach((x, i) => p.grids.push({ id: uid("g"), x1: x, y1: -over, x2: x, y2: d + over, label: String(i + 1) }));
    Y.forEach((y, j) => p.grids.push({ id: uid("g"), x1: -over, y1: y, x2: w + over, y2: y, label: String.fromCharCode(65 + j) }));
  }
  return normalizeProject(p);
}

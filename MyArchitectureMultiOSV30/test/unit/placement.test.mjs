// Furniture placement without collisions (src/core/placement.js): a piece
// dropped on a wall or on another piece goes to the nearest free spot; pieces
// at other heights (a wall TV over a console) and touching ones do not count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeSpot, collides, obstacles } from "../../src/core/placement.js";
import { makeFurniture } from "../../src/lib/furniture.js";

// A 5 × 4 m room (200 mm walls, centre lines on the rectangle) with a sofa against the north wall.
function room() {
  const L = "L";
  const w = (x1, y1, x2, y2, id) => ({ id, level: L, x1, y1, x2, y2, thickness: 200, height: 2700 });
  const p = {
    walls: [w(0, 0, 5000, 0, "n"), w(5000, 0, 5000, 4000, "e"), w(5000, 4000, 0, 4000, "s"), w(0, 4000, 0, 0, "w")],
    furniture: [{ ...makeFurniture("sofa3", 2500, 600), id: "sofa", level: L, rot: 0 }],
    rooms: [{ id: "r", level: L, name: "Living room", pts: [[100, 100], [4900, 100], [4900, 3900], [100, 3900]] }],
  };
  return p;
}
const piece = (kind, x, y, extra = {}) => ({ ...makeFurniture(kind, x, y), id: "new", level: "L", rot: 0, ...extra });

test("a free spot stays where it is", () => {
  const p = room();
  const f = piece("coffeeTable", 2500, 2200);
  assert.deepEqual(freeSpot(p, f), { x: 2500, y: 2200, moved: false });
});

test("a piece dropped on another moves next to it, clear of both", () => {
  const p = room();
  const f = piece("coffeeTable", 2500, 650);
  const s = freeSpot(p, f);
  assert.ok(s && s.moved, "moved");
  assert.ok(!collides({ ...f, x: s.x, y: s.y }, obstacles(p, "L", new Set(["new"]))), "the new spot is free");
  assert.ok(Math.hypot(s.x - 2500, s.y - 650) < 1500, `close by (${s.x}, ${s.y})`);
});

test("a piece dropped into a wall comes out into the room", () => {
  const p = room();
  const f = piece("armchair", 4980, 2500);
  const s = freeSpot(p, f);
  assert.ok(s && s.moved);
  assert.ok(s.x + f.w / 2 <= 4900 + 1 || s.x - f.w / 2 >= 5100 - 1, `clear of the east wall (${s.x})`);
});

test("pieces at other heights do not collide (a wall cabinet over a console, a ceiling lamp over a bed)", () => {
  const p = room();
  p.furniture.push({ ...makeFurniture("sideboard", 2500, 3600), id: "sb", level: "L", rot: 0, elevation: 0 });
  const f = piece("sideboard", 2500, 3600, { elevation: 1500 });
  assert.equal(freeSpot(p, f).moved, false);
});

test("touching is fine: a cabinet against a wall face, a chair beside a table", () => {
  const p = room();
  const f = piece("bookshelf", 1000, 100 + makeFurniture("bookshelf", 0, 0).d / 2); // the north wall's inner face is at y 100
  assert.equal(freeSpot(p, f).moved, false);
});

test("a piece dragged through a wall stays in the room it came from", () => {
  const p = room();
  const f = piece("armchair", -300, 2000); // dropped just outside the west wall
  const s = freeSpot(p, f, { origin: [2500, 2000] });
  assert.ok(s && s.moved);
  assert.ok(s.x - f.w / 2 >= 100 - 6, `back inside (${s.x}, ${s.y})`);
});

// Furniture placement without collisions (src/core/placement.js): a piece
// dropped on a wall or on another piece goes to the nearest free spot; pieces
// at other heights (a wall TV over a console) and touching ones do not count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeSpot, collides, obstacles, alignToWalls, settleMoved, settlePieces } from "../../src/core/placement.js";
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

// ---- against the walls, and settling where a move stops (as MySketchBook's clearOfWalls)

test("a piece near a wall goes onto its face; one in a wall is pushed out to it", () => {
  const p = room();
  const f = piece("sideboard", 2500, 0, { w: 1600, d: 450 });
  for (const y of [100 + 225 + 120, 100 + 225 - 150, 50]) {
    const a = alignToWalls({ ...f, y }, p.walls);
    assert.equal(a.y, 100 + 225, `from y=${y}`);
  }
  // Far from every wall: left alone.
  assert.deepEqual(alignToWalls({ ...f, x: 2500, y: 2000 }, p.walls), { x: 2500, y: 2000, rot: 0 });
});

test("a piece near a wall turns square to it; a deliberate angle far off is kept", () => {
  const p = room();
  const a = alignToWalls(piece("sideboard", 2500, 420, { w: 1600, d: 450, rot: 12 }), p.walls);
  assert.equal(a.rot, 0);
  assert.equal(a.y, 325);
  const b = alignToWalls(piece("sideboard", 2500, 420, { w: 1600, d: 450, rot: 12 }), p.walls, { align: false });
  assert.equal(b.rot, 12);
  assert.ok(!collides({ ...piece("sideboard", 0, 0, { w: 1600, d: 450, rot: 12 }), x: b.x, y: b.y }, obstacles(p, "L", new Set(["sofa"]))), "out of the wall");
});

test("a piece in a corner goes against both walls", () => {
  const p = room();
  const a = alignToWalls(piece("armchair", 150, 150, { w: 800, d: 800 }), p.walls);
  assert.deepEqual([a.x, a.y], [500, 500]);
});

test("a dropped piece that overlaps another settles clear of it and of the walls", () => {
  const p = room();
  p.furniture.push({ ...piece("armchair", 2700, 900), id: "chair" });
  const r = settleMoved(p, ["chair"], { origins: { chair: [2500, 2500] } });
  const c = p.furniture.find((x) => x.id === "chair");
  assert.ok(r.moved);
  assert.ok(!collides(c, obstacles(p, "L", new Set(["chair"]))), `clear at (${c.x}, ${c.y})`);
});

test("a group moved together keeps its layout and leaves the wall", () => {
  const p = room();
  p.furniture.push({ ...piece("diningTable", 2500, 3700, { w: 1600, d: 900 }), id: "t" }, { ...piece("chair", 2500, 3000, { w: 450, d: 450 }), id: "c" });
  const before = p.furniture.find((x) => x.id === "c").y - p.furniture.find((x) => x.id === "t").y;
  settleMoved(p, ["t", "c"], { origins: { t: [2500, 2500], c: [2500, 1800] } });
  const tb = p.furniture.find((x) => x.id === "t"), cb = p.furniture.find((x) => x.id === "c");
  assert.equal(cb.y - tb.y, before, "the chair stays where it was by the table");
  assert.ok(tb.y + 450 <= 3900 + 1, "the table is out of the south wall");
});

test("with no free spot the piece goes back where it was", () => {
  const p = room();
  p.furniture.push({ ...piece("bed", 2500, 2000, { w: 9000, d: 9000 }), id: "big" });
  const r = settleMoved(p, ["big"], { origins: { big: [1234, 2345] }, maxR: 300 });
  const b = p.furniture.find((x) => x.id === "big");
  assert.ok(r.back);
  assert.deepEqual([b.x, b.y], [1234, 2345]);
});

test("recognised pieces drawn near a wall end up against it", () => {
  const p = room();
  p.furniture.push({ ...piece("bed", 4900 - 800 - 80, 2600, { w: 2000, d: 1600, rot: 90 }), id: "bed" });
  settlePieces(p, ["bed"]);
  const b = p.furniture.find((x) => x.id === "bed");
  assert.equal(b.x, 4900 - 800); // turned 90°: it reaches d/2 towards the wall
});

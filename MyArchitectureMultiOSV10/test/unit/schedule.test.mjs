// Unit tests for schedules and quantities (src/core/schedule.js).
// Run: node --test test/unit/schedule.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { roomSchedule, openingSchedule, levelSummary, projectTotals, wallTypeSchedule, costEstimate, toCSV } from "../../src/core/schedule.js";
import { newProject, normalizeProject, newLevel, DEFAULT_COSTS } from "../../src/core/project.js";
import { detectRooms } from "../../src/core/rooms.js";

// ---------------------------------------------------------------- helpers

const near = (a, b, tol = 1e-9, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const wall = (id, x1, y1, x2, y2, thickness = 200, extra = {}) => ({ id, level: "L", x1, y1, x2, y2, thickness, ...extra });
const rectWalls = (prefix, x1, y1, x2, y2, t = 200, extra = {}) => [
  wall(`${prefix}n`, x1, y1, x2, y1, t, extra), wall(`${prefix}e`, x2, y1, x2, y2, t, extra),
  wall(`${prefix}s`, x2, y2, x1, y2, t, extra), wall(`${prefix}w`, x1, y2, x1, y1, t, extra),
];

// The known box: 6 × 4 m centre lines, 200 mm walls, 2.8 m high, one door
// (900 × 2100) on the north wall, one window (1200 × 1200, sill 900) on the
// south wall, one detected room of 5.8 × 3.8 m.
function boxBuilding() {
  const p = newProject("Box");
  p.levels[0].id = "L";
  p.levels[0].name = "1F";
  p.view.level = "L";
  p.walls = rectWalls("", 0, 0, 6000, 4000);
  p.openings = [
    { id: "door", wall: "n", kind: "door", at: 3000, width: 900, height: 2100, sill: 0 },
    { id: "win", wall: "s", kind: "window", at: 3000, width: 1200, height: 1200, sill: 900 },
  ];
  p.rooms = detectRooms(p.walls).map((r, i) => ({ id: `r${i}`, level: "L", name: "Room", pts: r.pts, floor: "oak" }));
  p.furniture = [{ id: "f1", level: "L", kind: "box", x: 3000, y: 2000 }];
  return normalizeProject(p);
}

// ================================================================ rooms & openings
describe("roomSchedule", () => {
  test("lists each room with level, area and perimeter", () => {
    const rows = roomSchedule(boxBuilding());
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.id, "r0");
    assert.equal(r.level, "1F");
    assert.equal(r.name, "Room");
    near(r.area, 5.8 * 3.8, 1e-9);
    near(r.perimeter, 2 * (5.8 + 3.8), 1e-9);
    assert.equal(r.floor, "oak");
  });

  test("goes level by level and fills missing names and floors with empty strings", () => {
    const p = boxBuilding();
    p.levels.push({ ...newLevel("2F", 2800), id: "U" });
    p.rooms.push({ id: "up", level: "U", pts: [[0, 0], [1000, 0], [1000, 2000], [0, 2000]] });
    normalizeProject(p);
    const rows = roomSchedule(p);
    assert.deepEqual(rows.map((r) => r.level), ["1F", "2F"]);
    assert.equal(rows[1].name, "");
    assert.equal(rows[1].floor, "");
    near(rows[1].area, 2);
    near(rows[1].perimeter, 6);
  });

  test("an empty project has no rows", () => {
    assert.deepEqual(roomSchedule(normalizeProject(newProject())), []);
  });
});

describe("openingSchedule", () => {
  test("lists every opening with its tag, sorted by tag", () => {
    const p = boxBuilding();
    p.openings.push({ id: "door2", wall: "w", kind: "door", at: 2000, width: 800, height: 2000, sill: 0, type: "double" });
    normalizeProject(p);
    const rows = openingSchedule(p);
    assert.deepEqual(rows.map((r) => r.tag), ["D01", "D02", "W01"]);
    const d = rows.find((r) => r.id === "door");
    assert.deepEqual(d, { id: "door", tag: "D01", kind: "door", type: "single", level: "1F", width: 900, height: 2100, sill: 0, wallThickness: 200 });
    assert.equal(rows.find((r) => r.id === "door2").type, "double");
    const w = rows.find((r) => r.id === "win");
    assert.equal(w.sill, 900);
    assert.equal(w.type, "casement");
  });

  test("a user tag sorts with the others", () => {
    const p = boxBuilding();
    p.openings[0].tag = "A-ENTRY";
    const rows = openingSchedule(p);
    assert.deepEqual(rows.map((r) => r.tag), ["A-ENTRY", "W01"]);
  });

  test("an opening whose wall is gone shows no level and no thickness", () => {
    const p = boxBuilding();
    p.openings.push({ id: "orphan", wall: "nope", kind: "opening", width: 1000, height: 2000, sill: 0 });
    const row = openingSchedule(p).find((r) => r.id === "orphan");
    assert.equal(row.level, "");
    assert.equal(row.wallThickness, 0);
    assert.equal(row.tag, "O01");
  });
});

// ================================================================ quantities
describe("levelSummary and projectTotals", () => {
  test("the box building's numbers", () => {
    const [s] = levelSummary(boxBuilding());
    assert.equal(s.level, "1F");
    assert.equal(s.elevation, 0);
    assert.equal(s.height, 2800);
    assert.equal(s.walls, 4);
    near(s.wallLength, 20, 1e-12, "centre-line length");
    near(s.wallAreaGross, 20 * 2.8, 1e-9);
    near(s.wallAreaNet, 56 - 0.9 * 2.1 - 1.2 * 1.2, 1e-9, "minus the door and the window");
    near(s.wallVolume, (56 - 1.89 - 1.44) * 0.2, 1e-9);
    assert.equal(s.rooms, 1);
    near(s.roomArea, 5.8 * 3.8, 1e-9);
    near(s.grossArea, 6.2 * 4.2, 1e-9, "outside of the walls");
    assert.equal(s.doors, 1);
    assert.equal(s.windows, 1);
    assert.equal(s.furniture, 1);
  });

  test("a window above the wall top only removes the part inside the wall", () => {
    const p = boxBuilding();
    p.openings[1].sill = 2000; // 1200 high, but only 800 fits under 2800
    const [s] = levelSummary(p);
    near(s.wallAreaNet, 56 - 1.89 - 1.2 * 0.8, 1e-9);
  });

  test("openings past the wall end only remove the part on the wall", () => {
    const p = boxBuilding();
    p.openings[0].at = 0; // half of the 900 door hangs off the start
    const [s] = levelSummary(p);
    near(s.wallAreaNet, 56 - 0.45 * 2.1 - 1.44, 1e-9);
  });

  test("walls with their own height count that height", () => {
    const p = boxBuilding();
    p.walls[0].height = 3800;
    const [s] = levelSummary(p);
    near(s.wallAreaGross, 6 * 3.8 + 14 * 2.8, 1e-9);
  });

  test("two levels and projectTotals", () => {
    const p = boxBuilding();
    p.levels.push({ ...newLevel("2F", 2800, 3000), id: "U" });
    p.walls.push(...rectWalls("u", 0, 0, 6000, 4000, 200, { level: "U" }));
    p.openings.push({ id: "uw", wall: "un", kind: "window", at: 1500, width: 1000, height: 1000, sill: 1000 });
    normalizeProject(p);
    const rows = levelSummary(p);
    assert.equal(rows.length, 2);
    const up = rows[1];
    assert.equal(up.level, "2F");
    assert.equal(up.elevation, 2800);
    assert.equal(up.height, 3000);
    near(up.wallAreaGross, 20 * 3, 1e-9);
    assert.equal(up.doors, 0);
    assert.equal(up.windows, 1);
    assert.equal(up.rooms, 0);
    const t = projectTotals(p);
    assert.equal(t.levels, 2);
    assert.equal(t.walls, 8);
    near(t.wallLength, 40, 1e-9);
    near(t.roomArea, 22.04, 1e-9);
    near(t.grossArea, 2 * 26.04, 1e-9);
    assert.equal(t.doors, 1);
    assert.equal(t.windows, 2);
    near(t.wallVolume, rows[0].wallVolume + rows[1].wallVolume, 1e-12);
  });

  test("an empty project sums to zero", () => {
    const t = projectTotals(normalizeProject(newProject()));
    assert.deepEqual(t, { levels: 1, walls: 0, wallLength: 0, roomArea: 0, grossArea: 0, doors: 0, windows: 0, wallVolume: 0 });
  });
});

describe("wallTypeSchedule", () => {
  test("groups typed walls by type and untyped walls by thickness", () => {
    const p = boxBuilding();
    p.walls[0].type = "ext-brick-300";
    p.walls[1].type = "ext-brick-300";
    p.walls.push(wall("x", 0, 2000, 6000, 2000, 100));
    normalizeProject(p);
    const rows = wallTypeSchedule(p);
    assert.equal(rows.length, 3);
    const brick = rows.find((r) => r.type === "Exterior brick cavity 300");
    assert.equal(brick.count, 2);
    assert.equal(brick.thickness, 300);
    near(brick.length, 10, 1e-12);
    near(brick.area, 10 * 2.8 - 1.89, 1e-9, "the door is in the north wall");
    assert.equal(brick.layers, "brick 100 / insulation 80 / concrete 100 / plaster 20");
    const plain = rows.find((r) => r.type === "200 mm");
    assert.equal(plain.count, 2);
    assert.equal(plain.layers, "");
    near(plain.area, 10 * 2.8 - 1.44, 1e-9);
    const thin = rows.find((r) => r.type === "100 mm");
    assert.equal(thin.count, 1);
    near(thin.length, 6, 1e-12);
  });

  test("rows are sorted by area, largest first", () => {
    const p = boxBuilding();
    p.walls.push(wall("x", 0, 2000, 60000, 2000, 100));
    normalizeProject(p);
    const rows = wallTypeSchedule(p);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].area >= rows[i].area);
    assert.equal(rows[0].type, "100 mm");
  });
});

// ================================================================ cost
describe("costEstimate", () => {
  const line = (est, item) => est.lines.find((l) => l.item === item);

  test("prices walls, floors, doors and windows of the box", () => {
    const est = costEstimate(boxBuilding());
    assert.equal(est.currency, "KRW");
    const walls = line(est, "Walls");
    near(walls.qty, 52.67, 1e-9);
    assert.equal(walls.unit, "m²");
    assert.equal(walls.price, DEFAULT_COSTS.wall);
    near(walls.total, 52.67 * DEFAULT_COSTS.wall, 1e-6);
    near(line(est, "Floors").qty, 22.04, 1e-9);
    assert.deepEqual(line(est, "Doors"), { item: "Doors", qty: 1, unit: "pcs", price: 450000, total: 450000 });
    assert.deepEqual(line(est, "Windows"), { item: "Windows", qty: 1, unit: "pcs", price: 380000, total: 380000 });
    assert.equal(line(est, "Roofs"), undefined, "no roof, no line");
    assert.equal(line(est, "Stairs"), undefined);
    assert.equal(line(est, "Furniture"), undefined, "furniture is free by default");
    near(est.total, est.lines.reduce((s, l) => s + l.total, 0), 1e-6);
  });

  test("roofs by plan area, stairs, columns and openings per piece", () => {
    const p = boxBuilding();
    p.roofs.push({ id: "rf", level: "L", pts: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], kind: "gable" });
    p.stairs.push({ id: "s", level: "L", x: 0, y: 0 });
    p.columns.push({ id: "c1", level: "L", x: 0, y: 0 }, { id: "c2", level: "L", x: 0, y: 0 });
    p.openings.push({ id: "gap", wall: "e", kind: "opening", at: 2000, width: 1000, height: 2100 });
    normalizeProject(p);
    const est = costEstimate(p);
    near(line(est, "Roofs").qty, 24, 1e-9);
    near(line(est, "Roofs").total, 24 * 150000, 1e-6);
    assert.equal(line(est, "Stairs").total, 2500000);
    assert.equal(line(est, "Columns").qty, 2);
    assert.equal(line(est, "Columns").total, 600000);
    assert.equal(line(est, "Openings").total, 100000);
  });

  test("demolished items are left out and existing ones cost nothing", () => {
    const p = boxBuilding();
    p.walls[0].phase = "existing";
    p.walls[1].phase = "demolish";
    p.openings[1].phase = "existing";
    const est = costEstimate(p);
    near(line(est, "Walls").qty, 6 * 2.8 + 4 * 2.8 - 1.44, 1e-9, "only the two new walls (with the window)");
    assert.equal(line(est, "Windows"), undefined);
    assert.equal(line(est, "Doors").qty, 1);
  });

  test("furniture uses each item's own price, else the unit price", () => {
    const p = boxBuilding();
    p.furniture.push({ id: "f2", level: "L", kind: "box", x: 0, y: 0, props: { price: "500000" } }, { id: "f3", level: "L", kind: "box", x: 0, y: 0, props: { price: 250000 }, phase: "demolish" });
    normalizeProject(p);
    let f = line(costEstimate(p), "Furniture");
    assert.equal(f.qty, 2, "both live items are counted");
    assert.equal(f.total, 500000);
    assert.equal(f.price, 250000, "the average price per piece");
    p.costs.furniture = 10000;
    f = line(costEstimate(p), "Furniture");
    assert.equal(f.total, 510000);
  });

  test("custom unit prices and currency, and a project without costs", () => {
    const p = boxBuilding();
    p.costs = { currency: "USD", wall: 100, door: "50" };
    const est = costEstimate(p);
    assert.equal(est.currency, "USD");
    assert.equal(line(est, "Doors").total, 50);
    assert.equal(line(est, "Windows").total, 0, "a missing price counts as zero");
    delete p.costs;
    const none = costEstimate(p);
    assert.equal(none.currency, "KRW");
    assert.equal(none.total, 0);
  });
});

// ================================================================ CSV
describe("toCSV", () => {
  const cols = [["name", "Name"], ["area", "Area (m²)"], ["n", "Count"], ["note", "Note"]];

  test("starts with a UTF-8 BOM and ends every line with CRLF", () => {
    const csv = toCSV([{ name: "Living", area: 20.456, n: 3, note: "" }], cols);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(csv, "﻿Name,Area (m²),Count,Note\r\nLiving,20.46,3,\r\n");
  });

  test("numbers: integers as they are, others with two decimals", () => {
    const csv = toCSV([{ name: 0, area: 1 / 3, n: -7, note: 1e21 }], cols);
    assert.ok(csv.includes("\r\n0,0.33,-7,1e+21\r\n"));
  });

  test("quotes fields with commas, quotes, semicolons and line breaks", () => {
    const csv = toCSV([{ name: "Bed, master", area: "say \"hi\"", n: "a;b", note: "two\nlines" }], cols);
    const row = csv.split("\r\n")[1];
    assert.equal(row, "\"Bed, master\",\"say \"\"hi\"\"\",\"a;b\",\"two\nlines\"");
  });

  test("missing values become empty fields and Korean text is kept", () => {
    const csv = toCSV([{ name: "거실", area: null }, { name: undefined, n: 2 }], cols);
    const lines = csv.slice(1).split("\r\n");
    assert.equal(lines[1], "거실,,,");
    assert.equal(lines[2], ",,2,");
    assert.equal(lines.length, 4, "header, two rows and the trailing break");
  });

  test("headers are escaped too and no rows gives just the header", () => {
    assert.equal(toCSV([], [["a", "A,B"]]), "﻿\"A,B\"\r\n");
  });

  test("a full room schedule exports one row per room", () => {
    const csv = toCSV(roomSchedule(boxBuilding()), [["level", "Level"], ["name", "Room"], ["area", "Area"], ["perimeter", "Perimeter"]]);
    assert.equal(csv, "﻿Level,Room,Area,Perimeter\r\n1F,Room,22.04,19.20\r\n");
  });
});

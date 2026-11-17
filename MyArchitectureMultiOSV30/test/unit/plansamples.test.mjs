// The 2D → 3D examples (sample/plans, from MySketchBook): every example has its
// file and thumbnail, at least 40 of them, and every CAD drawing (DXF, SVG) is
// turned into walls, doors and windows and closed rooms by io/plandrawing.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readPlanDrawing, placePlanDrawing, isPlanDrawingName } from "../../src/io/plandrawing.js";

const dir = path.resolve(import.meta.dirname, "..", "..", "sample", "plans");
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
const all = [...index.pictures, ...index.drawings];

test("40 or more examples, each with its file, thumbnail and Korean / English title", () => {
  assert.ok(all.length >= 40, `${all.length} examples`);
  assert.equal(new Set(all.map((s) => s.id)).size, all.length, "ids are unique");
  for (const s of all) {
    assert.ok(fs.existsSync(path.join(dir, s.file)), `${s.file} exists`);
    assert.ok(fs.existsSync(path.join(dir, "thumbs", `${s.id}.webp`)), `thumbnail of ${s.id}`);
    assert.equal(s.title.length, 2, `${s.id}: title [ko, en]`);
  }
});

test("every picture knows its real width (the walls come out at the real size)", () => {
  for (const s of all.filter((x) => /^(png|jpe?g|webp|gif|bmp|avif)$/.test(x.format))) assert.ok(s.widthMetres > 3 && s.widthMetres < 40, `${s.id}: ${s.widthMetres} m`);
});

for (const s of index.drawings.filter((x) => isPlanDrawingName(x.file))) {
  test(`${s.file}: walls, doors and windows, closed rooms`, () => {
    const d = readPlanDrawing(s.file, fs.readFileSync(path.join(dir, s.file), "utf8"));
    assert.ok(d.size[0] > 4 && d.size[0] < 30 && d.size[1] > 3 && d.size[1] < 30, `size ${d.size.map((v) => v.toFixed(1))} m`);
    const o = placePlanDrawing(d, { level: "L", x: 1000, y: 2000 });
    assert.ok(o.walls.length >= 6, `${o.walls.length} walls`);
    assert.ok(o.openings.length >= 4, `${o.openings.length} openings`);
    assert.ok(o.rooms.length >= 2, `${o.rooms.length} rooms`);
    for (const w of o.walls) {
      assert.ok(Math.min(w.x1, w.x2) >= 1000 - 400 && Math.min(w.y1, w.y2) >= 2000 - 400, "placed at its corner");
      assert.ok(w.thickness >= 50 && w.thickness <= 400, `thickness ${w.thickness}`);
    }
  });
}

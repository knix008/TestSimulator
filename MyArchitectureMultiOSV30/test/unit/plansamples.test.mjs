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

// Furniture read from the plans (MySketchBook's plan-furniture.js and plan-match.js): the interior plan pictures
// give their sofas, beds and plants, the CAD drawing its furniture blocks.
import { PNG } from "pngjs";
import { readPlanPicture, placePicturePlan } from "../../src/io/planpicture.js";

for (const id of ["apt59-interior", "apt74-furniture-lines", "villa-interior", "loft-furniture-lines"]) {
  test(`${id}: furniture in the rooms (a sofa, and a bed or a plant)`, async () => {
    const s = index.pictures.find((x) => x.id === id);
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, s.file)));
    const image = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
    const mpp = s.widthMetres / png.width;
    const r = await readPlanPicture(image, { metresPerPixel: mpp });
    const u = { x: 0, y: 0, w: s.widthMetres * 1000, h: (s.widthMetres * 1000 * png.height) / png.width, rot: 0 };
    const out = placePicturePlan(r, u, { level: "L", pictureWidth: png.width, metresPerPixel: mpp });
    const kinds = out.furniture.map((f) => f.kind);
    assert.ok(out.furniture.length >= 10, `${out.furniture.length} pieces`);
    assert.ok(kinds.some((k) => /sofa/.test(k)), `a sofa among ${kinds.join(", ")}`);
    if (id !== "loft-furniture-lines") assert.ok(kinds.some((k) => /bed|fig|plant/.test(k)), `a bed or a plant among ${kinds.join(", ")}`); // the loft's ground floor has neither
    for (const f of out.furniture) {
      assert.ok(f.x > -500 && f.x < u.w + 500 && f.y > -500 && f.y < u.h + 500, `${f.kind} on the plan (${f.x}, ${f.y})`);
      assert.ok(f.level === "L" && Number.isFinite(f.rot) && f.w >= 100 && f.d >= 100, `${f.kind} placed`);
    }
  });
}

test("apartment-59.dxf: its furniture blocks become a double bed and a sofa", () => {
  const d = readPlanDrawing("apartment-59.dxf", fs.readFileSync(path.join(dir, "apartment-59.dxf"), "utf8"));
  const o = placePlanDrawing(d, { level: "L" });
  const kinds = o.furniture.map((f) => f.kind).sort();
  assert.deepEqual(kinds, ["doubleBed", "sofa3"]);
});

// The living room's 2.8 m sliding window is one window (its frame lines once split it into a window and a door), and
// what stands on the furniture is found too: a lamp on a nightstand and a TV on its console, at their tops.
test("apt104-furniture-lines-en: the living room's sliding window, lamps and TVs on the furniture", async () => {
  const s = index.pictures.find((x) => x.id === "apt104-furniture-lines-en");
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, s.file)));
  const image = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  const mpp = s.widthMetres / png.width;
  const r = await readPlanPicture(image, { metresPerPixel: mpp });
  const u = { x: 0, y: 0, w: s.widthMetres * 1000, h: (s.widthMetres * 1000 * png.height) / png.width, rot: 0 };
  const out = placePicturePlan(r, u, { level: "L", pictureWidth: png.width, metresPerPixel: mpp });
  const windows = out.openings.filter((o) => o.kind === "window");
  const widths = windows.map((o) => o.width).join(", ");
  assert.equal(windows.length, 7, `windows ${widths}`);
  assert.ok(windows.some((o) => o.width >= 2600 && o.width <= 3000 && o.sill <= 100), `one wide sliding window down to the floor (${widths})`);
  assert.ok(windows.filter((o) => o.width >= 1700 && o.width <= 1950).length >= 5, `the 1.8 m windows stay 1.8 m, no wall beside them read as window (${widths})`);
  const on = (kind, host) => out.furniture.filter((f) => f.kind === kind).filter((f) => out.furniture.some((h) => h.kind === host && f.elevation === (h.elevation || 0) + h.h && Math.abs(f.x - h.x) < Math.max(h.w, h.d) / 2 && Math.abs(f.y - h.y) < Math.max(h.w, h.d) / 2));
  assert.ok(on("sb-table-lamp", "nightstand").length >= 2, "table lamps on the nightstands");
  assert.ok(on("sb-tv", "sb-tv-console").length >= 1, "a TV on its console");
});

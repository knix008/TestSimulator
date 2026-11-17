// Unit tests for walls from a plan picture (src/io/planpicture.js and the
// recogniser ported from MySketchBook): the plan pictures in sample/plan-images
// are read as the app reads an image underlay, placed where the underlay lies
// (moved, turned) and must give the drawn walls, openings and rooms.
// Run: node --test test/unit/planpicture.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { readPlanPicture, placePicturePlan, underlayPoint, turnUnderlay, openingOf, placeFurniture, scaledHeight } from "../../src/io/planpicture.js";
import { furnitureDef } from "../../src/lib/furniture.js";
import { parseProject, newProject } from "../../src/core/project.js";
import { pointInPolygon } from "../../src/core/geom.js";

const dir = path.resolve(import.meta.dirname, "..", "..", "sample", "plan-images");
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
const picture = (file) => { const png = PNG.sync.read(fs.readFileSync(path.join(dir, file))); return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height }; };

/** A plan drawn here: an 8 × 5 m outline split in two, 200 mm walls, a door gap in the middle wall. */
function drawnPlan() {
  const pxm = 50; const W = 10 * pxm; const H = 7 * pxm;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const box = (x0, y0, x1, y1) => { for (let y = Math.round(y0 * pxm); y < Math.round(y1 * pxm); y++) for (let x = Math.round(x0 * pxm); x < Math.round(x1 * pxm); x++) { const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = 20; } };
  box(1, 1, 9.2, 1.2); box(1, 6, 9.2, 6.2); box(1, 1, 1.2, 6.2); box(9, 1, 9.2, 6.2);
  box(5, 1, 5.2, 3); box(5, 3.9, 5.2, 6.2); // middle wall, a 0.9 m gap
  return { image: { data, width: W, height: H }, pxm };
}

describe("plan picture → walls", () => {
  test("underlay placement: corner, scale and turn", () => {
    const u = { x: 1000, y: 2000, w: 4000, h: 3000, rot: 90 };
    assert.deepEqual(underlayPoint(u, [0, 0]), [1000, 2000]);
    const p = underlayPoint(u, [1, 0]);
    assert.ok(Math.abs(p[0] - 1000) < 1e-9 && Math.abs(p[1] - 3000) < 1e-9, "x turns towards +y");
    // Turning about the centre keeps the centre where it was.
    const centre = (v) => underlayPoint(v, [v.w / 2, v.h / 2], 1);
    const t = { ...u, ...turnUnderlay(u, (30 * Math.PI) / 180) };
    assert.ok(Math.abs(t.rot - 120) < 1e-6);
    centre(u).forEach((v, i) => assert.ok(Math.abs(v - centre(t)[i]) < 1e-6));
  });

  test("the recogniser's openings in this app's terms", () => {
    assert.deepEqual(openingOf({ kind: "door", side: "left", hinge: "left" }), { kind: "door", type: "single", hinge: "start", side: 1 });
    assert.deepEqual(openingOf({ kind: "door", side: "right", hinge: "left" }), { kind: "door", type: "single", hinge: "end", side: -1 });
    assert.equal(openingOf({ kind: "double" }).type, "double");
    assert.equal(openingOf({ kind: "pocket" }).type, "sliding");
    assert.deepEqual(openingOf({ kind: "passage" }), { kind: "opening", hinge: "start", side: 1 });
    assert.equal(openingOf({ kind: "window", item: "window-sliding" }).type, "sliding");
    assert.equal(openingOf({ kind: "window", item: "window-casement" }).type, "casement");
  });

  test("a picture drawn here: the walls, the door and both rooms where the underlay is", async () => {
    const { image, pxm } = drawnPlan();
    const mpp = 1 / pxm;
    const result = await readPlanPicture(image, { metresPerPixel: mpp });
    for (const [x, y, rot] of [[0, 0, 0], [-3000, 5000, 0], [2000, 1000, 90]]) {
      const u = { x, y, w: image.width * mpp * 1000, h: image.height * mpp * 1000, rot };
      const out = placePicturePlan(result, u, { level: "L", pictureWidth: image.width, metresPerPixel: mpp });
      assert.ok(out.walls.length >= 5 && out.walls.length <= 7, `walls ${out.walls.length}`);
      assert.equal(out.rooms.length, 2, "two rooms");
      for (const w of out.walls) assert.ok(Math.abs(w.thickness - 200) <= 30, `thickness ${w.thickness}`);
      // Room centres where the picture has them (the left room's middle is at picture (3.1, 3.6) m).
      const c = underlayPoint(u, [3.1, 3.6]);
      assert.ok(out.rooms.some((r) => pointInPolygon(c[0], c[1], r.pts)), `left room at ${c} (${x}, ${y}, ${rot}°)`);
      const doors = out.openings.filter((o) => o.kind === "door");
      assert.equal(doors.length, 1, "the gap is a door");
      assert.ok(Math.abs(doors[0].width - 900) <= 120, `door width ${doors[0].width}`);
      // The project accepts it as it is.
      const p = newProject("Picture");
      const lv = p.levels[0].id;
      p.walls = out.walls.map((w) => ({ ...w, level: lv })); p.openings = out.openings; p.rooms = out.rooms.map((r) => ({ ...r, level: lv }));
      const back = parseProject(JSON.stringify(p));
      assert.equal(back.openings.length, out.openings.length);
      assert.equal(back.rooms.length, 2);
    }
  });

  test("a tilted picture is straightened, the underlay turned with it", async () => {
    const { image, pxm } = drawnPlan();
    const mpp = 1 / pxm;
    const result = await readPlanPicture(image, { metresPerPixel: mpp });
    const u = { x: 0, y: 0, w: image.width * mpp * 1000, h: image.height * mpp * 1000, rot: 3 };
    const out = placePicturePlan(result, u, { level: "L", pictureWidth: image.width, metresPerPixel: mpp });
    assert.ok(Math.abs(out.angle + (3 * Math.PI) / 180) < 0.01, `turned back by ${(out.angle * 180) / Math.PI}°`);
    assert.ok(Math.abs(out.underlay.rot) < 0.6, `underlay ${out.underlay.rot}°`);
    for (const w of out.walls) assert.ok(Math.abs(w.x1 - w.x2) < 1 || Math.abs(w.y1 - w.y2) < 1, "square walls");
    const kept = placePicturePlan(result, u, { level: "L", pictureWidth: image.width, metresPerPixel: mpp, straighten: false });
    assert.equal(kept.angle, 0);
    assert.equal(kept.underlay, null);
  });
});

describe("plan picture samples", () => {
  for (const s of index) {
    test(s.file, async () => {
      const img = picture(s.file);
      const mpp = 1 / s.pxPerMetre;
      const t0 = performance.now();
      const result = await readPlanPicture(img, { metresPerPixel: mpp });
      const u = { x: 0, y: 0, w: img.width * mpp * 1000, h: img.height * mpp * 1000, rot: 0 };
      const out = placePicturePlan(result, u, { level: "L", pictureWidth: img.width, metresPerPixel: mpp });
      const ms = performance.now() - t0;
      assert.ok(ms < 15000, `took ${ms.toFixed(0)} ms`);
      const want = s.counts;
      assert.ok(out.walls.length >= want.walls * 0.6, `walls ${out.walls.length} of ${want.walls}`);
      assert.ok(out.openings.length >= Math.ceil((want.doors + want.windows) * 0.4), `openings ${out.openings.length} of ${want.doors + want.windows}`);
      assert.ok(out.rooms.length >= Math.max(1, want.rooms - 2), `rooms ${out.rooms.length} of ${want.rooms}`);
      // Everything is within the picture, and every opening fits its wall.
      const walls = new Map(out.walls.map((w) => [w.id, w]));
      for (const w of out.walls) for (const v of [w.x1, w.x2]) assert.ok(v >= -500 && v <= u.w + 500);
      for (const o of out.openings) {
        const w = walls.get(o.wall);
        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        assert.ok(o.at - o.width / 2 >= -1 && o.at + o.width / 2 <= L + 1, "opening inside its wall");
      }
    });
  }
});

test("small things found in a picture keep the size they are drawn at, their height in proportion", () => {
  const u = { x: 0, y: 0, w: 10000, h: 8000, rot: 0 };
  const place = (item, size) => placeFurniture([{ item, position: [2, 2], rotation: 0, size }], { u, k: 1, toPlan: (q) => q, level: "L" })[0];
  const lamp = furnitureDef("sb-table-lamp"); // 360 × 360 × 600
  const big = place("table-lamp", [0.48, 0.48]); const small = place("table-lamp", [0.24, 0.24]);
  assert.equal(big.w, 480); assert.equal(small.w, 240);
  assert.equal(big.h, Math.round(lamp.h * 480 / 360), "a bigger lamp is taller");
  assert.equal(small.h, Math.round(lamp.h * 240 / 360), "a smaller one shorter");
  const tv = place("tv", [1.0, 0.24]);
  assert.equal(tv.h, Math.round(furnitureDef("sb-tv").h * 1000 / furnitureDef("sb-tv").w), "a screen scales with its width");
  assert.equal(place("floor-lamp-tripod", [0.4, 0.4]).h, furnitureDef("sb-floor-lamp-tripod").h, "a floor lamp keeps its height");
  assert.ok(place("fiddle-leaf-fig", [1.6, 1.6]).h <= 2400, "a big plant stays under the ceiling");
  assert.equal(scaledHeight(furnitureDef("nightstand"), 600, 400), null, "furniture is not made taller for being drawn wider");
});

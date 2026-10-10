// Unit tests for the sample projects in sample/ (listed in sample/index.json):
// each one loads, is clean under the model check, has consistent schedules
// and builds in 3D. The samples are read as they are (not regenerated).
// Run: node --test test/unit/samples.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { parseProject, serializeProject, normalizeProject, openingTags, wallLength } from "../../src/core/project.js";
import { runCheck } from "../../src/core/check.js";
import { levelSummary, projectTotals, roomSchedule, openingSchedule, costEstimate } from "../../src/core/schedule.js";
import { roomArea, detectRooms } from "../../src/core/rooms.js";
import { wallOutlines } from "../../src/core/walls.js";
import { buildBuilding, makeMaterials, modelExtent } from "../../src/view3d/build.js";
import { planBounds } from "../../src/plan/render.js";
import { materialById } from "../../src/lib/materials.js";
import { furnitureDef } from "../../src/lib/furniture.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const dir = path.resolve(import.meta.dirname, "..", "..", "sample");
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
const load = (file) => parseProject(fs.readFileSync(path.join(dir, file), "utf8"));

describe("sample index", () => {
  test("index.json lists unique, existing sample files with titles in two languages", () => {
    assert.ok(Array.isArray(index) && index.length >= 5);
    assert.equal(new Set(index.map((s) => s.file)).size, index.length);
    for (const s of index) {
      assert.match(s.file, /^\d\d-[a-z0-9-]+\.myarch$/);
      assert.ok(fs.existsSync(path.join(dir, s.file)), `${s.file} exists`);
      for (const k of ["title", "titleKo", "description", "descriptionKo"]) assert.ok(typeof s[k] === "string" && s[k].length > 1, `${s.file} ${k}`);
      assert.ok(Array.isArray(s.tags));
    }
    assert.equal(index.filter((s) => s.hero).length, 1, "exactly one hero sample");
  });

  test("every .myarch file in sample/ is listed in the index", () => {
    const files = fs.readdirSync(dir).filter((n) => n.endsWith(".myarch")).sort();
    assert.deepEqual(files, index.map((s) => s.file).sort());
  });
});

for (const entry of index) {
  const { file } = entry;
  describe(`sample ${file}`, () => {
    const p = load(file);

    test("parses as a MyArchitecture project and round-trips", () => {
      assert.equal(p.format, "myarch");
      assert.ok(typeof p.meta.title === "string" && p.meta.title.length > 1, "the project has a title");
      assert.ok(p.levels.length >= 1);
      const again = parseProject(serializeProject(p));
      assert.deepEqual(JSON.parse(serializeProject(again)), JSON.parse(serializeProject(p)));
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(raw))), p, "the file is already normalized");
    });

    test("has a building: walls or mass models, and named rooms when it has rooms", () => {
      assert.ok(p.walls.length > 0 || (p.solids || []).length > 0, "walls or solids");
      for (const r of p.rooms) {
        assert.ok(r.name && r.name.trim().length > 0, `room ${r.id} has a name`);
        assert.ok(roomArea(r) > 1e6, `room ${r.name} is bigger than 1 m²`);
      }
      if (p.walls.length && p.rooms.length) {
        // Every room matches a space the walls enclose.
        for (const lv of p.levels) {
          const detected = detectRooms(p.walls.filter((w) => w.level === lv.id));
          for (const r of p.rooms.filter((x) => x.level === lv.id)) {
            assert.ok(detected.some((d) => Math.abs(d.area - roomArea(r)) < 1), `room ${r.name} matches the walls`);
          }
        }
      }
    });

    test("references are consistent: levels, walls, wall types, materials, furniture kinds", () => {
      const levels = new Set(p.levels.map((l) => l.id));
      const ids = new Set();
      for (const k of ["walls", "openings", "rooms", "columns", "stairs", "furniture", "roofs", "dimensions", "texts", "drawings", "underlays", "solids"]) {
        for (const it of p[k] || []) {
          assert.ok(it.id, `${k} item has an id`);
          assert.ok(!ids.has(it.id), `id ${it.id} is unique`);
          ids.add(it.id);
          if (k !== "openings") assert.ok(levels.has(it.level), `${k} ${it.id} is on a level`);
        }
      }
      const walls = new Map(p.walls.map((w) => [w.id, w]));
      for (const o of p.openings) {
        const w = walls.get(o.wall);
        assert.ok(w, `opening ${o.id} sits on an existing wall`);
        assert.ok(o.at - o.width / 2 >= -1 && o.at + o.width / 2 <= wallLength(w) + 1, `opening ${o.id} fits its wall`);
      }
      for (const w of p.walls) {
        if (w.type) assert.ok(p.wallTypes.some((t) => t.id === w.type), `wall type ${w.type}`);
        if (w.material && !/^#/.test(w.material)) assert.ok(materialById(w.material), `wall material ${w.material}`);
      }
      for (const r of p.rooms) if (r.floor) assert.ok(materialById(r.floor), `floor ${r.floor}`);
      for (const f of p.furniture) if (f.kind !== "model") assert.ok(furnitureDef(f.kind), `furniture kind ${f.kind}`);
      assert.ok(levels.has(p.view.level));
    });

    test("the model check finds no errors and no warnings", () => {
      const issues = runCheck(p);
      assert.deepEqual(issues.map((i) => `${i.severity} ${i.code}: ${i.message}`), []);
    });

    test("openings have unique tags", () => {
      const tags = openingTags(p);
      assert.equal(tags.size, p.openings.length);
      assert.equal(new Set(tags.values()).size, p.openings.length);
      const rows = openingSchedule(p);
      assert.equal(rows.length, p.openings.length);
    });

    test("levelSummary is consistent with the project", () => {
      const rows = levelSummary(p);
      assert.equal(rows.length, p.levels.length);
      for (const [i, s] of rows.entries()) {
        const lv = p.levels[i];
        const walls = p.walls.filter((w) => w.level === lv.id);
        assert.equal(s.level, lv.name);
        assert.equal(s.walls, walls.length);
        near(s.wallLength, walls.reduce((t, w) => t + wallLength(w), 0) / 1000, 1e-9);
        assert.ok(s.wallAreaNet <= s.wallAreaGross + 1e-9);
        assert.ok(s.wallAreaNet >= 0);
        assert.equal(s.rooms, p.rooms.filter((r) => r.level === lv.id).length);
        near(s.roomArea, p.rooms.filter((r) => r.level === lv.id).reduce((t, r) => t + roomArea(r), 0) / 1e6, 1e-9);
        if (s.rooms) assert.ok(s.grossArea > s.roomArea, "gross floor area includes the walls");
        assert.equal(s.doors + s.windows <= p.openings.length, true);
      }
      const t = projectTotals(p);
      assert.equal(t.levels, p.levels.length);
      assert.equal(t.walls, p.walls.length);
      near(t.roomArea, roomSchedule(p).reduce((s, r) => s + r.area, 0), 1e-9);
      assert.equal(t.doors, p.openings.filter((o) => o.kind === "door").length);
      assert.equal(t.windows, p.openings.filter((o) => o.kind === "window").length);
    });

    test("the cost estimate is the sum of its lines (positive when there are walls)", () => {
      const est = costEstimate(p);
      assert.ok(p.walls.length ? est.total > 0 : est.total >= 0);
      near(est.total, est.lines.reduce((s, l) => s + l.total, 0), 1e-6);
      for (const l of est.lines) assert.ok(l.qty > 0 && Number.isFinite(l.total));
    });

    test("walls make closed outlines and the plan has bounds", () => {
      for (const lv of p.levels) {
        const walls = p.walls.filter((w) => w.level === lv.id);
        const ol = wallOutlines(walls);
        assert.equal(ol.size, walls.length);
        for (const { poly } of ol.values()) for (const [x, y] of poly) assert.ok(Number.isFinite(x) && Number.isFinite(y));
      }
      const b = planBounds(p);
      assert.ok(b && b.x2 > b.x1 && b.y2 > b.y1);
    });

    test("the 3D model builds with every element tagged", () => {
      const root = buildBuilding(THREE, p, makeMaterials(THREE, { textures: false }), { openDoors: true });
      const meshes = [];
      root.traverse((c) => { if (c.isMesh) meshes.push(c); });
      assert.ok(meshes.length > 0);
      for (const m of meshes) assert.ok(m.userData.id && m.userData.kind && m.userData.level, m.name);
      const tagged = new Set(meshes.map((m) => m.userData.id));
      for (const w of p.walls) assert.ok(tagged.has(w.id), `wall ${w.id} in 3D`);
      for (const s of p.solids || []) assert.ok(tagged.has(s.id), `solid ${s.id} in 3D`);
      for (const r of p.rooms) assert.ok(tagged.has(r.id), `room ${r.id} in 3D`);
      assert.equal(root.children.length, p.levels.length);
      const e = modelExtent(p);
      assert.ok(e.x2 > e.x1 && e.y2 > e.y1 && e.top > 0);
    });
  });
}

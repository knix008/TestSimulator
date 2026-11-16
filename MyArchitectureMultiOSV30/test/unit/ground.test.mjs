// Unit tests for the ground in 3D (src/core/ground.js, the project style's
// groundType / groundShape, src/ui/ground.js applyGroundDefaults): every
// surface is a real library material, every shape fits the building, the hills
// leave the building's pad flat, new projects take the defaults.
// Run: node --test test/unit/ground.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../src/vendor/three/three.module.js";
import { GROUND_TYPES, GROUND_SHAPES, groundTypeById, groundShapeById, groundLayout, hillHeight } from "../../src/core/ground.js";
import { materialById } from "../../src/lib/materials.js";
import { makeMaterials } from "../../src/view3d/build.js";
import { newProject, parseProject } from "../../src/core/project.js";
import { STYLE_DEFAULTS } from "../../src/core/skmodel.js";
import { applyGroundDefaults } from "../../src/ui/ground.js";

const EXT = { x1: 0, z1: 0, x2: 12, z2: 8 }; // a 12 × 8 m building

describe("ground", () => {
  test("many surfaces, each a library material the 3D view can draw", () => {
    assert.ok(GROUND_TYPES.length >= 15);
    assert.equal(new Set(GROUND_TYPES.map((g) => g.id)).size, GROUND_TYPES.length);
    assert.equal(GROUND_TYPES[0].id, "plain");
    const mats = makeMaterials(THREE, { textures: false });
    for (const g of GROUND_TYPES.slice(1)) {
      const m = materialById(g.material);
      assert.ok(m, `${g.id}: material ${g.material}`);
      assert.ok(mats.surface(g.material).isMaterial, g.id);
    }
    for (const id of ["lawn", "meadow", "soil", "snow", "sand", "gravel", "asphalt", "pavers", "deck", "water"]) assert.ok(GROUND_TYPES.some((g) => g.id === id), id);
    assert.equal(groundTypeById("nonsense").id, "plain");
  });

  test("shapes follow the building: field, plot with 8 m around it, the horizon, hills", () => {
    assert.deepEqual(GROUND_SHAPES.map((s) => s.id), ["disc", "square", "plot", "horizon", "hills"]);
    assert.equal(groundShapeById("x").id, "disc");
    const disc = groundLayout("disc", EXT);
    assert.deepEqual([disc.kind, disc.cx, disc.cz, disc.r], ["circle", 6, 4, 30]); // max(60, 12 × 4) / 2
    const sq = groundLayout("square", EXT);
    assert.deepEqual([sq.kind, sq.w, sq.d], ["rect", 60, 60]);
    const plot = groundLayout("plot", EXT);
    assert.deepEqual([plot.w, plot.d], [28, 24]);
    assert.ok(groundLayout("horizon", EXT).r >= 2000);
    // A big building gets a bigger field.
    assert.equal(groundLayout("disc", { x1: 0, z1: 0, x2: 100, z2: 20 }).r, 200);
  });

  test("hills: flat on the pad around the building, rising smoothly beyond, never below zero", () => {
    const L = groundLayout("hills", EXT);
    assert.ok(L.hills && L.hills.pad > Math.hypot(12, 8) / 2 && L.hills.height > 0);
    // The whole building and a margin are flat.
    for (const [x, z] of [[0, 0], [12, 8], [6, 4], [-2, 4], [14, 9]]) assert.equal(hillHeight(x, z, L), 0, `${x},${z}`);
    let max = 0;
    for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
      const x = L.cx - L.w / 2 + (L.w * i) / 60, z = L.cz - L.d / 2 + (L.d * j) / 60;
      const y = hillHeight(x, z, L);
      assert.ok(y >= 0 && y <= L.hills.height + 1e-9, `${y}`);
      max = Math.max(max, y);
      // Smooth: neighbours 1 m apart differ by little.
      assert.ok(Math.abs(hillHeight(x + 1, z, L) - y) < 1.5, "a cliff");
    }
    assert.ok(max > L.hills.height * 0.3, `hills rise (${max.toFixed(1)} m)`);
    assert.equal(hillHeight(100, 100, groundLayout("disc", EXT)), 0, "other shapes are flat");
  });

  test("the project's style keeps a valid ground; new projects take the defaults from the settings", () => {
    assert.equal(STYLE_DEFAULTS.groundType, "plain");
    assert.equal(STYLE_DEFAULTS.groundShape, "disc");
    const load = (style3d) => parseProject(JSON.stringify({ ...newProject("G"), style3d })).style3d;
    assert.deepEqual([load({ groundType: "lawn", groundShape: "hills" }).groundType, load({ groundType: "lawn", groundShape: "hills" }).groundShape], ["lawn", "hills"]);
    assert.deepEqual([load({ groundType: "lava", groundShape: "cube" }).groundType, load({ groundType: "lava", groundShape: "cube" }).groundShape], ["plain", "disc"]);
    const p = applyGroundDefaults(newProject("N"), { groundType: "snow", groundShape: "plot" });
    assert.deepEqual([p.style3d.groundType, p.style3d.groundShape], ["snow", "plot"]);
    assert.equal(parseProject(JSON.stringify(p)).style3d.groundType, "snow", "kept when saved");
    const q = applyGroundDefaults(newProject("N"), {});
    assert.equal((q.style3d || {}).groundType ?? "plain", "plain", "no defaults: untouched");
  });
});

// Unit tests for the material presets ported from MySketchBook
// (src/lib/presets, src/lib/presetmaterials.js, src/view3d/presetmat.js):
// every preset becomes a library material with a unique id, a group, uses and
// a Korean name; its texture set is in the downloaded library; its pattern is valid;
// the 3D view makes the right kind of material for it.
// Run: node --test test/unit/presets.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { MATERIALS, PRESET_MATERIALS, ALL_MATERIALS, MATERIAL_CATEGORIES, materialById, setProjectMaterials } from "../../src/lib/materials.js";
import { presetNamesKo } from "../../src/lib/presetmaterials.js";
import { MATERIAL_PRESETS } from "../../src/lib/presets/index.js";
import { TEXTURE_SETS } from "../../src/lib/libraryindex.js";
import { wantedFiles } from "../../src/io/assetlib.js";
import { validatePattern, patternLayout } from "../../src/lib/presets/patterns.js";
import { presetSurface, tintFactor, applySetMaps } from "../../src/view3d/presetmat.js";
import { rankedMaterial } from "../../src/view3d/depth.js";
import { makeMaterials } from "../../src/view3d/build.js";


describe("material presets", () => {
  test("all of MySketchBook's presets join the library, ids unique, building library unchanged", () => {
    assert.equal(MATERIAL_PRESETS.length, 1787);
    assert.equal(PRESET_MATERIALS.length, 1785, "all but 'default' and 'back-face'");
    assert.equal(MATERIALS.length, 98, "the building library (layers, thermal values) stays as it was");
    const ids = ALL_MATERIALS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
    // Ids the building library already has get "p-".
    assert.equal(materialById("plywood").preset, undefined);
    assert.equal(materialById("p-plywood").preset.source, "plywood");
    const cats = new Set(MATERIAL_CATEGORIES.map(([c]) => c));
    for (const m of PRESET_MATERIALS) {
      assert.ok(cats.has(m.cat), `${m.id}: group ${m.cat}`);
      assert.ok(m.use.length > 0, `${m.id}: uses`);
      assert.match(m.color, /^#[0-9a-f]{6}$/i, `${m.id}: colour`);
      assert.ok(m.rough >= 0 && m.rough <= 1 && m.metal >= 0 && m.metal <= 1, `${m.id}: roughness / metalness`);
    }
    // Every group shows up in the pickers for something.
    for (const use of ["wall", "floor", "ceiling", "roof", "frame", "furniture"]) assert.ok(PRESET_MATERIALS.some((m) => m.use.includes(use)), use);
  });

  test("every preset has a Korean name", () => {
    const ko = presetNamesKo();
    for (const m of PRESET_MATERIALS) assert.ok(ko[m.name], `${m.id} (${m.name})`);
  });

  test("texture sets: each preset's set is in the shipped metadata and in the library's download list", () => {
    const sets = new Set(PRESET_MATERIALS.filter((m) => m.preset.textures).map((m) => m.preset.textures));
    assert.ok(sets.size >= 90, `${sets.size} sets`);
    const want = new Set(wantedFiles().map((w) => w.rel));
    for (const s of sets) {
      const info = TEXTURE_SETS[s];
      assert.ok(info, `${s} in the metadata`);
      assert.ok(info.size?.[0] > 0 && /^#[0-9a-f]{6}$/i.test(info.avg), `${s}: size and average colour`);
      assert.equal(info.ext, "jpg", "the downloaded originals are JPEG");
      for (const map of info.maps) assert.ok(want.has(`textures/${s}/${map}.jpg`), `${s}/${map} downloaded`);
    }
  });

  test("patterns are valid and fit a texture", () => {
    const withPattern = PRESET_MATERIALS.filter((m) => m.preset.pattern);
    assert.ok(withPattern.length > 400);
    for (const m of withPattern) {
      assert.deepEqual(validatePattern(m.preset.pattern), [], m.id);
      const L = patternLayout(m.preset.pattern);
      assert.ok(L.cover[0] > 0 && L.px[0] >= 1 && L.px[0] <= 4096 && L.px[1] <= 4096, `${m.id}: ${L.px}`);
    }
  });

  test("3D: physical materials where the preset asks (sheen, clearcoat, glass), plain otherwise", () => {
    const find = (f) => PRESET_MATERIALS.find(f);
    const glass = find((m) => m.preset.transmission);
    const g = presetSurface(THREE, glass, { textures: false });
    assert.ok(g.isMeshPhysicalMaterial && g.transmission > 0 && g.ior >= 1);
    const fabric = find((m) => m.preset.sheen && !m.preset.clearcoat);
    assert.ok(presetSurface(THREE, fabric, { textures: false }).sheen > 0);
    const lacquer = find((m) => m.preset.clearcoat);
    assert.ok(presetSurface(THREE, lacquer, { textures: false }).clearcoat > 0);
    const plain = find((m) => !m.preset.sheen && !m.preset.clearcoat && !m.preset.transmission && !m.preset.transparent);
    const p = presetSurface(THREE, plain, { textures: false });
    assert.ok(p.isMeshStandardMaterial && !p.isMeshPhysicalMaterial);
    assert.equal(p.roughness, plain.rough);
    assert.equal("#" + p.color.getHexString(), plain.color);
    const lamp = find((m) => m.preset.emissive);
    if (lamp) assert.ok(presetSurface(THREE, lamp, { textures: false }).emissiveIntensity > 0);
    // Through the 3D builder: a wall or floor with a preset id.
    const mats = makeMaterials(THREE, { textures: false });
    assert.equal(mats.surface("floor-herringbone").userData.preset, "floor-herringbone");
    assert.equal(mats.surface("floor-herringbone"), mats.surface("floor-herringbone"), "shared");
  });

  test("an edited colour (project materials) reaches the preset's material; textures are tinted to it", () => {
    const m = PRESET_MATERIALS.find((x) => x.preset.textures && !x.preset.pattern);
    setProjectMaterials([{ id: m.id, color: "#336699" }]);
    try {
      const edited = materialById(m.id);
      assert.equal(edited.color, "#336699");
      assert.equal(edited.preset.source, m.preset.source);
      assert.equal("#" + presetSurface(THREE, edited, { textures: false }).color.getHexString(), "#336699");
    } finally { setProjectMaterials([]); }
    // The tint makes a texture of average colour `avg` come out at the target on average.
    const [r, g, b] = tintFactor("#808080", "#808080");
    assert.ok(Math.abs(r - 1) < 1e-9 && Math.abs(g - 1) < 1e-9 && Math.abs(b - 1) < 1e-9);
    assert.ok(tintFactor("#ff0000", "#808080")[0] > 1 && tintFactor("#ff0000", "#808080")[1] < 0.01);
  });
  test("textures that arrive later reach the material and the depth-ranked copies made of it (floors)", () => {
    const m = PRESET_MATERIALS.find((x) => x.id === "stone-marble-photo-white");
    const mat = presetSurface(THREE, m, { textures: false });
    const floorCopy = rankedMaterial(mat, 2);
    assert.notEqual(floorCopy, mat);
    const tex = (n) => Object.assign(new THREE.Texture(), { name: n });
    const info = { avg: "#b19d7a", roughAvg: 0.5 };
    applySetMaps(mat, m, info, { diff: tex("diff"), nor: tex("nor"), rough: tex("rough"), ao: tex("ao") });
    for (const x of [mat, floorCopy]) {
      assert.equal(x.map?.name, "diff");
      assert.equal(x.normalMap?.name, "nor");
      assert.equal(x.roughnessMap?.name, "rough");
      assert.equal(x.aoMap?.name, "ao");
      assert.ok(Math.abs(x.roughness - m.rough / 0.5) < 1e-9);
    }
    assert.ok(floorCopy.polygonOffset, "the copy keeps its depth rank");
    assert.equal(floorCopy.color.getHex(), mat.color.getHex(), "tinted like the original");
    // A pattern keeps its colour: the set adds only relief.
    const pm = PRESET_MATERIALS.find((x) => x.preset.pattern && x.preset.textures);
    if (pm) { const pmat = presetSurface(THREE, pm, { textures: false }); applySetMaps(pmat, pm, info, { diff: tex("diff"), nor: tex("nor") }); assert.equal(pmat.map, null); assert.equal(pmat.normalMap?.name, "nor"); }
  });
});

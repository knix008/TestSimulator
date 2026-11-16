// The furniture library: the catalogue's size and categories, the thumbnail
// sprite, and my library (src/ui/userlib.js) — entries from items, groups and
// models, placing them into a project (with the copy the project keeps),
// library files, and saving / loading a project that uses them.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allFurniture, makeFurniture, FURNITURE_CATEGORIES, furnitureDef } from "../../src/lib/furniture.js";
import { newProject, normalizeProject } from "../../src/core/project.js";
import { normalizeEntry, entryFromItems, entryInstances, insertEntry, libraryFileText, parseLibraryFile, mergeEntries, projectEntries } from "../../src/ui/userlib.js";
import { CATEGORY_ICONS } from "../../src/ui/library.js";
import { ICON_NAMES } from "../../src/ui/icons.js";
import { KO } from "../../src/ui/i18n-ko.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("the built-in catalogue", () => {
  test("at least 500 items over every category, each with a Korean name", () => {
    const all = allFurniture();
    assert.ok(all.length >= 500, `${all.length}`);
    for (const d of all) assert.ok(KO[d.name], `Korean name of ${d.kind} (${d.name})`);
    for (const c of FURNITURE_CATEGORIES) assert.ok(KO[c], `Korean name of the category ${c}`);
  });

  test("every category, and favourites / my library / recent, has its own icon", () => {
    for (const c of [...FURNITURE_CATEGORIES, "all", "fav", "mine", "recent", "project", "models"]) {
      assert.ok(CATEGORY_ICONS[c], `icon for ${c}`);
      assert.ok(ICON_NAMES.includes(CATEGORY_ICONS[c]), `${c}: icon ${CATEGORY_ICONS[c]} exists`);
    }
  });

  test("the thumbnail sprite has a picture of every item (npm run build:furniture)", () => {
    const j = JSON.parse(fs.readFileSync(path.join(root, "assets/furniture/thumbs.json"), "utf8"));
    assert.ok(fs.statSync(path.join(root, "assets/furniture/thumbs.webp")).size > 10000);
    for (const d of allFurniture()) assert.ok(Number.isInteger(j.index[d.kind]), `thumbnail of ${d.kind}`);
    assert.ok(j.w > 0 && j.h > 0 && j.cols > 0);
  });

  test("older kinds are all still there with their sizes", () => {
    const OLD = { sofa3: [2100, 900, 800], doubleBed: [1600, 2100, 500], toilet: [400, 700, 800], car: [1800, 4500, 1500], tree: [3000, 3000, 5000], ceilingLight: [500, 500, 120], box: [1000, 1000, 1000], streetLamp: [400, 1200, 4500], radiator: [1000, 100, 600] };
    for (const [k, s] of Object.entries(OLD)) { const d = furnitureDef(k); assert.ok(d, k); assert.deepEqual([d.w, d.d, d.h], s, k); }
  });
});

describe("my library", () => {
  const chair = { ...makeFurniture("chair", 1000, 2000), id: "a", level: "L", color: "#336699", rot: 90 };
  const table = { ...makeFurniture("diningTable4", 1000, 3000), id: "b", level: "L", group: "g1" };
  const asset = { id: "m1", name: "Lamp", format: "glb", size: [300, 300, 500], data: "Z2xURg==" };
  const model = { id: "c", level: "L", kind: "model", model: "m1", x: 0, y: 0, rot: 0, w: 300, d: 300, h: 500, elevation: 0 };

  test("one item: its size, colour and turn kept, centred", () => {
    const e = entryFromItems([chair], [], { name: "Blue chair", cat: "Dining" });
    assert.equal(e.items.length, 1);
    assert.deepEqual([e.items[0].x, e.items[0].y], [0, 0]);
    assert.equal(e.items[0].color, "#336699");
    assert.equal(e.items[0].rot, 90);
    assert.ok(!("id" in e.items[0]) && !("level" in e.items[0]) && !("group" in e.items[0]));
    assert.equal(e.w, chair.d, "turned a quarter: its footprint swaps");
    assert.equal(e.name, "Blue chair");
  });

  test("several items: kept relative to each other, placed as one group", () => {
    const e = entryFromItems([chair, table], [], { name: "Set", cat: "Dining" });
    assert.equal(e.items.length, 2);
    assert.equal(e.items[1].y - e.items[0].y, 1000);
    const placed = entryInstances(e, 5000, 5000, "L2");
    assert.equal(placed.length, 2);
    assert.ok(placed[0].group && placed[0].group === placed[1].group);
    assert.notEqual(placed[0].id, placed[1].id);
    assert.equal(placed[1].y - placed[0].y, 1000);
    assert.ok(placed.every((f) => f.level === "L2" && f.libItem === e.id));
  });

  test("a model entry carries its model; placing it puts the model and a copy of the entry in the project", () => {
    const e = entryFromItems([model], [asset, { id: "other", data: "x" }], { name: "Lamp", cat: "Lighting" });
    assert.deepEqual(e.models.map((m) => m.id), ["m1"], "only the models it uses");
    const p = normalizeProject(newProject("t"));
    const lv = p.levels[0].id;
    insertEntry(p, e, 100, 200, lv);
    insertEntry(p, e, 900, 200, lv);
    assert.equal(p.models.length, 1, "the model once");
    assert.equal(p.furniture.length, 2);
    assert.equal(projectEntries(p).length, 1, "the entry once");
    // Saved and opened elsewhere: the copy and the model are still there.
    const q = normalizeProject(JSON.parse(JSON.stringify(p)));
    assert.equal(projectEntries(q)[0].name, "Lamp");
    assert.equal(q.models[0].id, "m1");
    assert.ok(Array.isArray(normalizeProject(newProject("x")).libraryItems));
  });

  test("normalizeEntry drops broken entries and unknown kinds", () => {
    assert.equal(normalizeEntry(null), null);
    assert.equal(normalizeEntry({ items: [] }), null);
    assert.equal(normalizeEntry({ items: [{ kind: "spaceship" }] }), null);
    assert.equal(normalizeEntry({ items: [{ kind: "model", model: "nope" }] }), null, "a model entry needs its model");
    const e = normalizeEntry({ name: "x".repeat(300), items: [{ kind: "chair", w: -5, junk: 1 }], thumb: "javascript:alert(1)" });
    assert.equal(e.name.length, 120);
    assert.equal(e.items[0].w, 1000);
    assert.equal(e.items[0].junk, undefined);
    assert.equal(e.thumb, "");
  });

  test("library files: written, read back, merged without duplicates", () => {
    const a = entryFromItems([chair], [], { name: "A", cat: "Dining" });
    const b = entryFromItems([model], [asset], { name: "B", cat: "My lamps" });
    const back = parseLibraryFile(libraryFileText([a, b]));
    assert.deepEqual(back.map((e) => e.name), ["A", "B"]);
    assert.equal(back[1].models[0].data, asset.data);
    const merged = mergeEntries([a], back);
    assert.equal(merged.length, 2);
    assert.throws(() => parseLibraryFile(JSON.stringify({ format: "other", items: [] })));
  });
});

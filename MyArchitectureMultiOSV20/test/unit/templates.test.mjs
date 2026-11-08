// 새로 시작 on the start page (src/ui/starttemplates.js) and the blank
// projects by kind of building (src/core/presets.js): every group has the
// same number of tiles, every tile opens something that exists, and every
// preset is a valid project with its storeys and grid.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { START_GROUPS, START_TILE_COUNT, startTemplateStrings } from "../../src/ui/starttemplates.js";
import { PRESETS, PRESET_IDS, presetProject } from "../../src/core/presets.js";
import { ICON_NAMES } from "../../src/ui/icons.js";
import { parseProject } from "../../src/core/project.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const samples = JSON.parse(fs.readFileSync(path.join(root, "sample/index.json"), "utf8"));
// Commands are registered with C("id", …) in app.js and the feature modules (structures.js, elements.js …).
const commandSource = ["src/ui", "src/views"].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(root, d, f), "utf8"))).join(" ");
const tiles = START_GROUPS.flatMap((g) => g.items.map((it) => ({ group: g.id, kind: it[0], id: it[1], icon: it[2], name: it[3], desc: it[4] })));

test("새로 시작: at least six groups, every group with the same number of tiles (eight or more)", () => {
  assert.ok(START_GROUPS.length >= 6, `${START_GROUPS.length} groups`);
  const counts = START_GROUPS.map((g) => g.items.length);
  assert.deepEqual(new Set(counts).size, 1, `tile counts differ: ${START_GROUPS.map((g) => `${g.id}=${g.items.length}`).join(", ")}`);
  assert.ok(counts[0] >= 8, `${counts[0]} tiles a group`);
  assert.equal(START_TILE_COUNT, tiles.length);
});

test("새로 시작: group ids and tiles are unique, every tile has a known kind, icon, name and line", () => {
  assert.equal(new Set(START_GROUPS.map((g) => g.id)).size, START_GROUPS.length);
  assert.equal(new Set(tiles.map((x) => `${x.kind}:${x.id}`)).size, tiles.length, "a tile is listed twice");
  for (const g of START_GROUPS) assert.ok(ICON_NAMES.includes(g.icon), `group icon ${g.icon}`);
  for (const x of tiles) {
    assert.ok(["sample", "cmd", "preset"].includes(x.kind), `${x.id}: kind ${x.kind}`);
    assert.ok(ICON_NAMES.includes(x.icon), `${x.id}: icon ${x.icon}`);
    assert.ok(x.name && x.desc, `${x.id}: name and line`);
  }
});

test("새로 시작: every sample tile names a sample in sample/index.json, and every sample has a tile", () => {
  const files = new Set(samples.map((s) => s.file));
  for (const x of tiles.filter((t) => t.kind === "sample")) {
    assert.ok(files.has(x.id), `${x.id} is not in sample/index.json`);
    assert.ok(fs.existsSync(path.join(root, "sample", x.id)), `${x.id} is missing`);
  }
  const shown = new Set(tiles.filter((t) => t.kind === "sample").map((t) => t.id));
  assert.deepEqual(samples.map((s) => s.file).filter((f) => !shown.has(f)), [], "samples without a tile");
});

test("새로 시작: every command tile is a registered command", () => {
  for (const x of tiles.filter((t) => t.kind === "cmd")) assert.ok(commandSource.includes(`C("${x.id}",`), `command ${x.id} is not registered`);
});

test("새로 시작: every preset tile is a preset of the same name, and every preset has a tile", () => {
  const presetTiles = tiles.filter((t) => t.kind === "preset");
  for (const x of presetTiles) {
    assert.ok(PRESETS[x.id], `preset ${x.id}`);
    assert.equal(x.name, PRESETS[x.id].name);
    assert.equal(x.desc, PRESETS[x.id].desc);
  }
  assert.deepEqual(PRESET_IDS.filter((id) => !presetTiles.some((x) => x.id === id)), []);
});

test("새로 시작: the translatable strings list covers every title, name and line", () => {
  const strings = new Set(startTemplateStrings());
  for (const g of START_GROUPS) assert.ok(strings.has(g.title));
  for (const x of tiles) assert.ok(strings.has(x.name) && strings.has(x.desc), x.id);
});

test("presets: storeys stacked at their heights, ground floor current, walls as tall as a storey", () => {
  for (const id of PRESET_IDS) {
    const pr = PRESETS[id];
    const p = presetProject(id, pr.name);
    assert.equal(p.meta.title, pr.name);
    assert.equal(p.levels.length, pr.levels + (pr.basement ? 1 : 0), id);
    const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
    sorted.forEach((l, i) => { if (i) assert.equal(l.elevation - sorted[i - 1].elevation, pr.height, `${id} ${l.name}`); assert.equal(l.height, pr.height); });
    const ground = p.levels.find((l) => l.elevation === 0);
    assert.ok(ground && ground.name === "1F", id);
    assert.equal(p.view.level, ground.id, `${id}: the ground floor is shown first`);
    if (pr.basement) assert.ok(p.levels.some((l) => l.name === "B1" && l.elevation === -pr.height));
    assert.equal(p.defaults.wallHeight, pr.height);
    assert.equal(p.defaults.wallThickness, pr.wall);
    assert.equal(p.walls.length + p.rooms.length + p.furniture.length, 0, `${id} is blank`);
  }
});

test("presets: the structural grid has a line per bay edge, numbered across and lettered down", () => {
  for (const id of PRESET_IDS) {
    const pr = PRESETS[id];
    const p = presetProject(id);
    if (!pr.grid) { assert.equal(p.grids.length, 0, id); continue; }
    const [xs, ys] = pr.grid;
    const vertical = p.grids.filter((g) => g.x1 === g.x2), horizontal = p.grids.filter((g) => g.y1 === g.y2);
    assert.equal(vertical.length, xs.length + 1, id);
    assert.equal(horizontal.length, ys.length + 1, id);
    assert.deepEqual(vertical.map((g) => g.label), vertical.map((_, i) => String(i + 1)));
    assert.deepEqual(horizontal.map((g) => g.label), horizontal.map((_, j) => String.fromCharCode(65 + j)));
    assert.equal(vertical.at(-1).x1, xs.reduce((a, b) => a + b, 0));
    assert.equal(horizontal.at(-1).y1, ys.reduce((a, b) => a + b, 0));
  }
});

test("presets: save and open again unchanged; an unknown preset is the plain blank project", () => {
  for (const id of PRESET_IDS) {
    const p = presetProject(id, "x");
    const back = parseProject(JSON.stringify(p));
    assert.deepEqual(back.levels.map((l) => [l.name, l.elevation, l.height]), p.levels.map((l) => [l.name, l.elevation, l.height]), id);
    assert.equal(back.grids.length, p.grids.length);
  }
  const plain = presetProject("nope", "x");
  assert.equal(plain.levels.length, 1);
  assert.equal(plain.grids.length, 0);
});

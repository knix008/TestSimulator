// The document store: undo / redo, step labels, drags as one step, and the
// image pool that keeps tracing pictures out of the undo snapshots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/ui/store.js";

const wall = (id, x1, y1, x2, y2) => ({ id, x1, y1, x2, y2, thickness: 200, height: 2800 });

function withWalls() {
  const s = new Store();
  s.edit("Draw wall", (p) => { p.walls.push({ ...wall("w1", 0, 0, 5000, 0), level: p.levels[0].id }); });
  s.edit("Draw wall", (p) => { p.walls.push({ ...wall("w2", 5000, 0, 5000, 4000), level: p.levels[0].id }); });
  return s;
}

test("undo and redo restore the project and name the step", () => {
  const s = withWalls();
  assert.equal(s.canUndo(), true);
  assert.equal(s.canRedo(), false);
  assert.equal(s.undoLabel(), "Draw wall");
  assert.equal(s.undo(), "Draw wall");
  assert.equal(s.project.walls.length, 1);
  assert.equal(s.canRedo(), true);
  assert.equal(s.redoLabel(), "Draw wall");
  s.redo();
  assert.equal(s.project.walls.length, 2);
  assert.equal(s.redoLabel(), "");
});

test("a new edit clears the redo stack", () => {
  const s = withWalls();
  s.undo();
  s.edit("Move", (p) => { p.walls[0].x2 = 6000; });
  assert.equal(s.canRedo(), false);
  assert.equal(s.undoLabel(), "Move");
});

test("change events fire for edits, undo and redo; revision increases", () => {
  const s = new Store();
  const seen = [];
  s.on("change", (info) => seen.push(info.label));
  const r0 = s.revision;
  s.edit("Add", (p) => { p.texts.push({ id: "t1", level: p.levels[0].id, x: 0, y: 0, text: "A", size: 300, rot: 0 }); });
  s.undo();
  s.redo();
  assert.equal(seen.length, 3);
  assert.ok(s.revision >= r0 + 3);
});

test("a drag (begin / preview / commit) is one undo step", () => {
  const s = withWalls();
  const n = s.undoStack.length;
  s.begin("Move");
  for (let x = 5000; x <= 5600; x += 100) { s.project.walls[1].x1 = x; s.project.walls[1].x2 = x; s.preview(); }
  s.commit();
  assert.equal(s.undoStack.length, n + 1);
  s.undo();
  assert.equal(s.project.walls[1].x1, 5000);
});

test("tracing images are pooled: snapshots hold a short reference, undo restores the picture", () => {
  const s = new Store();
  const picture = "data:image/png;base64," + "A".repeat(200000);
  s.edit("Import underlay", (p) => { p.underlays.push({ id: "u1", level: p.levels[0].id, src: picture, x: 0, y: 0, w: 10000, h: 8000, rot: 0, opacity: 0.5 }); });
  for (let i = 1; i <= 20; i++) s.edit("Move underlay", (p) => { p.underlays[0].x = i * 100; });
  const sizes = s.undoStack.map((st) => st.json.length);
  assert.ok(Math.max(...sizes) < 5000, `largest snapshot ${Math.max(...sizes)} chars`);
  assert.equal(s.images.size, 1);
  for (let i = 0; i < 20; i++) s.undo();
  assert.equal(s.project.underlays[0].x, 0);
  assert.equal(s.project.underlays[0].src, picture);
  s.undo();
  assert.equal(s.project.underlays.length, 0);
  s.redo();
  assert.equal(s.project.underlays[0].src, picture);
});

test("opening another document empties the image pool", () => {
  const s = new Store();
  s.edit("Import underlay", (p) => { p.underlays.push({ id: "u1", level: p.levels[0].id, src: "data:image/png;base64," + "B".repeat(5000), x: 0, y: 0, w: 1000, h: 1000, rot: 0, opacity: 1 }); });
  s.edit("Move underlay", (p) => { p.underlays[0].x = 50; });
  assert.equal(s.images.size, 1);
  s.load({ format: "myarch" });
  assert.equal(s.images.size, 0);
  assert.equal(s.canUndo(), false);
});

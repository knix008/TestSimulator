// Document tabs model (src/ui/docs.js): several drawings share one Store; each
// switch parks the active document (project, undo/redo, image pool, file name,
// dirty flag) and brings another back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/ui/store.js";
import { DocumentSet } from "../../src/ui/docs.js";
import { newProject } from "../../src/core/project.js";

const wall = (id, level) => ({ id, x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, height: 2800, level });
const draw = (s, id) => s.edit("Draw wall", (p) => { p.walls.push(wall(id, p.levels[0].id)); });

function three() {
  const s = new Store();
  const d = new DocumentSet(s);
  const a = d.active;
  s.load(newProject("A"), { fileName: "a.myarch", filePath: "C:\\x\\a.myarch" });
  draw(s, "a1");
  const b = d.add();
  s.load(newProject("B"), { fileName: "b.myarch" });
  draw(s, "b1"); draw(s, "b2");
  const c = d.add();
  s.load(newProject("C"), { fileName: "c.myarch" });
  s.markSaved();
  return { s, d, a, b, c };
}

test("starts with one untouched tab", () => {
  const d = new DocumentSet(new Store());
  assert.equal(d.count, 1);
  assert.equal(d.isUntouched(), true);
  assert.equal(d.info(d.active).active, true);
});

test("each tab keeps its own project, undo stack and dirty flag", () => {
  const { s, d, a, b, c } = three();
  assert.deepEqual(d.docs.map((x) => x.id), [a.id, b.id, c.id]);
  assert.equal(s.project.meta.title, "C");
  assert.equal(s.dirty, false);
  d.switchTo(a.id);
  assert.equal(s.project.meta.title, "A");
  assert.deepEqual(s.project.walls.map((w) => w.id), ["a1"]);
  assert.equal(s.undoStack.length, 1);
  assert.equal(s.dirty, true);
  assert.equal(s.fileName, "a.myarch");
  d.switchTo(b.id);
  assert.equal(s.undoStack.length, 2);
  s.undo();
  assert.deepEqual(s.project.walls.map((w) => w.id), ["b1"]);
  d.switchTo(c.id);
  assert.equal(s.canUndo(), false);
  d.switchTo(b.id);
  assert.equal(s.canRedo(), true, "redo survives a switch");
  assert.deepEqual(d.dirtyDocs().map((x) => x.id), [a.id, b.id]);
});

test("an edit marks only the active tab dirty", () => {
  const { s, d, a, c } = three();
  d.switchTo(c.id);
  assert.equal(d.info(c).dirty, false);
  draw(s, "c1");
  assert.equal(d.info(c).dirty, true);
  assert.equal(d.info(a).dirty, true);
  s.markSaved();
  assert.equal(d.info(c).dirty, false);
  assert.equal(d.info(a).dirty, true);
});

test("the revision only grows across switches", () => {
  const { s, d, a } = three();
  const r = s.revision;
  d.switchTo(a.id);
  assert.ok(s.revision > r);
});

test("image pools are per tab (loading one tab does not clear another's)", () => {
  const s = new Store();
  const d = new DocumentSet(s);
  const a = d.active;
  s.images.set("@img:1", "data:a");
  d.add();
  s.load(newProject("B"));
  assert.equal(s.images.size, 0);
  d.switchTo(a.id);
  assert.equal(s.images.get("@img:1"), "data:a");
});

test("closing: the active tab hands over to its right, then left neighbour; the last leaves a blank tab", () => {
  const { s, d, a, b, c } = three();
  d.switchTo(b.id);
  d.remove(b.id);
  assert.equal(d.activeId, c.id);
  assert.equal(s.project.meta.title, "C");
  d.remove(c.id);
  assert.equal(d.activeId, a.id);
  assert.equal(s.project.meta.title, "A");
  d.remove(a.id);
  assert.equal(d.count, 1);
  assert.equal(d.isUntouched(), true);
  assert.equal(s.fileName, null);
});

test("closing an inactive tab leaves the store alone", () => {
  const { s, d, a } = three();
  d.remove(a.id);
  assert.equal(d.count, 2);
  assert.equal(s.project.meta.title, "C");
});

test("move, neighbour (wrapping) and find by path", () => {
  const { d, a, b, c } = three();
  d.move(c.id, 0);
  assert.deepEqual(d.docs.map((x) => x.id), [c.id, a.id, b.id]);
  // c is active (index 0): +1 → a, -1 wraps round to b
  assert.equal(d.neighbour(1).id, a.id);
  assert.equal(d.neighbour(-1).id, b.id);
  assert.equal(d.findByPath("c:/X/A.MYARCH").id, a.id);
  assert.equal(d.findByPath("c:/x/none.myarch"), null);
});

test("new tabs open right after the active one", () => {
  const { d, a, b, c } = three();
  d.switchTo(a.id);
  const n = d.add();
  assert.deepEqual(d.docs.map((x) => x.id), [a.id, n.id, b.id, c.id]);
  assert.equal(d.isUntouched(n), true);
  assert.equal(d.isUntouched(a), false);
});

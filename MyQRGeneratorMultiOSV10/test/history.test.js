import assert from "node:assert/strict";
import test from "node:test";
import { History } from "../src/js/history.js";

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("undo and redo walk through the recorded states", () => {
  const c = clock();
  const h = new History({ now: c.now });
  h.reset({ v: 0 });
  for (let v = 1; v <= 3; v += 1) {
    c.advance(1000);
    h.record({ v }, "x");
  }
  assert.deepEqual(h.undo(), { v: 2 });
  assert.deepEqual(h.undo(), { v: 1 });
  assert.deepEqual(h.redo(), { v: 2 });
  assert.equal(h.canRedo, true);
  c.advance(1000);
  h.record({ v: 9 }, "x");
  assert.equal(h.canRedo, false, "a new change drops the redo branch");
  assert.deepEqual(h.undo(), { v: 2 });
  assert.deepEqual(h.undo(), { v: 1 });
  assert.deepEqual(h.undo(), { v: 0 });
  assert.equal(h.undo(), null);
});

test("quick changes from one source merge; other sources and pauses do not", () => {
  const c = clock();
  const h = new History({ now: c.now, mergeMs: 700 });
  h.reset({ text: "" });
  for (const text of ["h", "he", "hel", "hell", "hello"]) {
    c.advance(100);
    h.record({ text }, "field-text");
  }
  assert.equal(h.entries.length, 2, "typing is one step");
  c.advance(100);
  h.record({ text: "hello", color: 1 }, "fg");
  assert.equal(h.entries.length, 3, "another control is a new step");
  c.advance(2000);
  h.record({ text: "hello", color: 2 }, "fg");
  assert.equal(h.entries.length, 4, "a pause starts a new step");
  assert.deepEqual(h.undo(), { text: "hello", color: 1 });
  assert.deepEqual(h.undo(), { text: "hello" });
  assert.deepEqual(h.undo(), { text: "" });
});

test("unchanged states are not recorded and the limit holds", () => {
  const h = new History({ limit: 3 });
  h.reset({ a: 1 });
  assert.equal(h.record({ a: 1 }), false);
  for (let a = 2; a <= 6; a += 1) h.record({ a });
  assert.equal(h.entries.length, 3);
  assert.deepEqual(h.undo(), { a: 5 });
});

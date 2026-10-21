import assert from "node:assert/strict";
import test from "node:test";
import { CARD_IDS, DEFAULT_LAYOUT, normalizeLayout } from "../src/js/layout.js";

test("the default puts the groups on the left and the QR code on the right", () => {
  assert.deepEqual(DEFAULT_LAYOUT.at(-1), ["card-preview"]);
  assert.deepEqual(DEFAULT_LAYOUT[0], ["card-content", "card-logo", "card-design"]);
  assert.deepEqual(DEFAULT_LAYOUT.flat().sort(), [...CARD_IDS].sort());
});

test("saved arrangements are kept only when every card is there exactly once", () => {
  const moved = [["card-preview", "card-content"], [], ["card-logo", "card-design", "card-encoding", "card-export"]];
  assert.deepEqual(normalizeLayout(moved), moved);
  assert.deepEqual(normalizeLayout([["card-content"], [], []]), DEFAULT_LAYOUT, "cards missing");
  assert.deepEqual(normalizeLayout([...DEFAULT_LAYOUT.slice(0, 2), ["card-preview", "card-preview"]]), DEFAULT_LAYOUT, "duplicate");
  assert.deepEqual(normalizeLayout(null), DEFAULT_LAYOUT);
  assert.deepEqual(normalizeLayout([[], []]), DEFAULT_LAYOUT, "two columns");
  const copy = normalizeLayout(moved);
  copy[0].push("x");
  assert.equal(moved[0].length, 2, "the result is a copy");
});

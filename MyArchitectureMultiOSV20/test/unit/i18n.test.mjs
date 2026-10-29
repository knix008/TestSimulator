import { test } from "node:test";
import assert from "node:assert/strict";
import { collectKeys } from "../../scripts/i18n-keys.mjs";
import { KO } from "../../src/ui/i18n-ko.js";

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every UI key has a Korean translation", async () => {
  const keys = await collectKeys();
  const missing = keys.filter((k) => !(k in KO));
  assert.deepEqual(missing, []);
});

test("translations are non-empty strings", () => {
  const bad = Object.entries(KO).filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("translations keep the same placeholders", () => {
  const bad = Object.entries(KO).filter(([k, v]) => placeholders(k).join() !== placeholders(v).join()).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("translations keep HTML tags", () => {
  const tags = (s) => (s.match(/<[^>]+>/g) || []).sort().join();
  const bad = Object.entries(KO).filter(([k, v]) => tags(k) !== tags(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test("menu and undo/redo labels are translated", () => {
  for (const k of ["File", "Edit", "View", "Undo", "Redo", "Show in plan", "New type"]) assert.ok(KO[k] && KO[k] !== k, k);
});

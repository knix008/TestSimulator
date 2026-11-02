/**
 * Folder synchronisation planning.
 *
 * Planning is pure, so this is where the modes are pinned down: what each one copies,
 * what it deletes, what it refuses to touch, and the timestamp tolerance that stops a
 * FAT filesystem or a daylight-saving shift from causing endless pointless copying.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DST_TOLERANCE,
  SYNC_MODES,
  groupByOperation,
  isSyncMode,
  newerSide,
  planSync,
} from "../core/sync.ts";

const HOUR = 60 * 60 * 1000;
const base = 1_700_000_000_000;

/** A comparison entry, with the bits the planner reads. */
function entry(rel, status, leftModified = null, rightModified = null) {
  return { rel, status, leftSize: 1, rightSize: 1, leftModified, rightModified };
}

const sample = [
  entry("same.txt", "same", base, base),
  entry("newer-left.txt", "different", base + HOUR, base),
  entry("newer-right.txt", "different", base, base + HOUR),
  entry("only-left.txt", "leftOnly", base, null),
  entry("only-right.txt", "rightOnly", null, base),
];

/** The plan as `rel -> operation`, which is what each assertion is really about. */
function asMap(plan) {
  return Object.fromEntries(plan.actions.map((action) => [action.rel, action.operation]));
}

test("sync › every mode is a known mode", () => {
  assert.equal(SYNC_MODES.length, 5);
  for (const mode of SYNC_MODES) assert.ok(isSyncMode(mode));
  assert.equal(isSyncMode("sideways"), false);
  assert.equal(isSyncMode(null), false);
});

test("sync › mirroring right makes the right side identical, deletions and all", () => {
  const plan = planSync(sample, "mirrorToRight");
  assert.deepEqual(asMap(plan), {
    "newer-left.txt": "copyToRight",
    "newer-right.txt": "copyToRight",
    "only-left.txt": "copyToRight",
    "only-right.txt": "deleteRight",
  });
  assert.equal(plan.skipped, 1, "the identical file is left alone");
});

test("sync › mirroring left is the same the other way round", () => {
  assert.deepEqual(asMap(planSync(sample, "mirrorToLeft")), {
    "newer-left.txt": "copyToLeft",
    "newer-right.txt": "copyToLeft",
    "only-right.txt": "copyToLeft",
    "only-left.txt": "deleteLeft",
  });
});

test("sync › updating never deletes and only carries the newer file", () => {
  const plan = planSync(sample, "updateToRight");
  assert.deepEqual(asMap(plan), {
    "newer-left.txt": "copyToRight",
    "only-left.txt": "copyToRight",
  });
  assert.ok(
    plan.actions.every((action) => !action.operation.startsWith("delete")),
    "an update must not delete anything",
  );
});

test("sync › two-way carries whichever side is newer, each way", () => {
  assert.deepEqual(asMap(planSync(sample, "twoWay")), {
    "newer-left.txt": "copyToRight",
    "newer-right.txt": "copyToLeft",
    "only-left.txt": "copyToRight",
    "only-right.txt": "copyToLeft",
  });
});

test("sync › two-way leaves a real conflict alone", () => {
  // Different contents, same timestamp: nothing here says which one should win, so
  // the planner must not guess.
  const plan = planSync([entry("both-edited.txt", "different", base, base)], "twoWay");
  assert.deepEqual(plan.actions, []);
  assert.equal(plan.skipped, 1);
});

test("sync › copies are planned before deletions", () => {
  const plan = planSync(sample, "mirrorToRight");
  const firstDelete = plan.actions.findIndex((action) => action.operation.startsWith("delete"));
  const lastCopy = plan.actions.map((action) => action.operation.startsWith("copy")).lastIndexOf(true);
  assert.ok(firstDelete > lastCopy, "a deletion is scheduled before a copy");
});

test("sync › the reason for each action is recorded", () => {
  const reasons = Object.fromEntries(
    planSync(sample, "mirrorToRight").actions.map((action) => [action.rel, action.reason]),
  );
  assert.equal(reasons["only-left.txt"], "missing");
  assert.equal(reasons["only-right.txt"], "orphan");
  assert.equal(reasons["newer-left.txt"], "different");
  assert.equal(planSync(sample, "updateToRight").actions[0].reason, "newer");
});

test("sync › timestamps within the tolerance are the same age", () => {
  assert.equal(newerSide({ leftModified: base + 1500, rightModified: base }), null, "FAT's two seconds");
  assert.equal(newerSide({ leftModified: base + 5000, rightModified: base }), "left");
  assert.equal(newerSide({ leftModified: base, rightModified: base + 5000 }), "right");
  assert.equal(newerSide({ leftModified: null, rightModified: base }), null);
});

test("sync › a daylight-saving shift is not an edit", () => {
  const shifted = { leftModified: base + DST_TOLERANCE, rightModified: base };
  assert.equal(newerSide(shifted), "left", "without the allowance it looks newer");
  assert.equal(newerSide(shifted, { allowDaylightShift: true }), null);

  // Two hours is the other shift that happens; three is somebody editing a file.
  assert.equal(newerSide({ leftModified: base + 2 * DST_TOLERANCE, rightModified: base }, { allowDaylightShift: true }), null);
  assert.equal(newerSide({ leftModified: base + 3 * DST_TOLERANCE, rightModified: base }, { allowDaylightShift: true }), "left");
});

test("sync › the plan groups into one operation per batch, copies first", () => {
  const groups = groupByOperation(planSync(sample, "mirrorToRight"));
  assert.deepEqual(groups.map((group) => group.operation), ["copyToRight", "deleteRight"]);
  assert.deepEqual(groups[0].relatives.sort(), ["newer-left.txt", "newer-right.txt", "only-left.txt"]);
  assert.deepEqual(groups[1].relatives, ["only-right.txt"]);
});

test("sync › an empty comparison plans nothing", () => {
  for (const mode of SYNC_MODES) {
    const plan = planSync([], mode);
    assert.deepEqual(plan.actions, []);
    assert.equal(plan.skipped, 0);
  }
});

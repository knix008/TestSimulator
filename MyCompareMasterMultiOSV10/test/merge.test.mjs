/**
 * The merge engine: the 3-way diff, the conflict-marker parser, the model's
 * resolution rules and the four-pane layout.
 *
 * The result these produce is what gets written to the user's file, so the tests go
 * all the way to the saved text rather than stopping at the model.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { containsConflictMarkers, parse } from "../core/conflictMarkers.ts";
import {
  buildResultLines,
  buildResultText,
  conflictCount,
  conflictRowStarts,
  conflicts,
  isFullyResolved,
  layout,
  markerLines,
  resolvedCount,
  resolvedLines,
  withAllResolutions,
  withCleanLine,
  withResolution,
  withResolvedLine,
} from "../core/mergeDocument.ts";
import { merge } from "../core/threeWay.ts";

const BASE = ["one", "two", "three", "four"];

test("three-way › an untouched file produces no conflicts", () => {
  const document = merge(BASE, BASE, BASE);
  assert.equal(conflictCount(document), 0);
  assert.deepEqual(buildResultLines(document), BASE);
});

test("three-way › a change on one side only is merged automatically", () => {
  const local = ["one", "TWO", "three", "four"];
  const document = merge(BASE, local, BASE);
  assert.equal(conflictCount(document), 0);
  assert.deepEqual(buildResultLines(document), local);
});

test("three-way › changes on both sides in different places both land", () => {
  const local = ["one", "TWO", "three", "four"];
  const remote = ["one", "two", "three", "FOUR"];
  const document = merge(BASE, local, remote);
  assert.equal(conflictCount(document), 0);
  assert.deepEqual(buildResultLines(document), ["one", "TWO", "three", "FOUR"]);
});

test("three-way › the same change on both sides is kept once", () => {
  const both = ["one", "SAME", "three", "four"];
  const document = merge(BASE, both, both);
  assert.equal(conflictCount(document), 0);
  assert.deepEqual(buildResultLines(document), both);
});

test("three-way › different changes to the same line conflict", () => {
  const local = ["one", "LOCAL", "three", "four"];
  const remote = ["one", "REMOTE", "three", "four"];
  const document = merge(BASE, local, remote);
  assert.equal(conflictCount(document), 1);
  const hunk = conflicts(document)[0];
  assert.deepEqual(hunk.baseLines, ["two"]);
  assert.deepEqual(hunk.localLines, ["LOCAL"]);
  assert.deepEqual(hunk.remoteLines, ["REMOTE"]);
  assert.equal(hunk.resolution, "unresolved");
});

test("three-way › an unresolved conflict writes git markers", () => {
  const document = merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]);
  const text = buildResultText(document);
  assert.ok(text.includes("<<<<<<< LOCAL"));
  assert.ok(text.includes("||||||| BASE"));
  assert.ok(text.includes("======="));
  assert.ok(text.includes(">>>>>>> REMOTE"));
});

test("three-way › insertions on both sides at the same point conflict", () => {
  const document = merge(["a", "b"], ["a", "x", "b"], ["a", "y", "b"]);
  assert.equal(conflictCount(document), 1);
});

test("three-way › the line ending of the local side is preserved", () => {
  const document = merge(BASE, BASE, BASE, { newline: "\r\n", trailingNewline: true });
  assert.ok(buildResultText(document).endsWith("\r\n"));
  assert.ok(buildResultText(document).includes("one\r\ntwo"));
});

test("resolve › each choice yields that side's lines", () => {
  const document = merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]);
  assert.deepEqual(buildResultLines(withResolution(document, 0, "local")), ["one", "L", "three", "four"]);
  assert.deepEqual(buildResultLines(withResolution(document, 0, "remote")), ["one", "R", "three", "four"]);
  assert.deepEqual(buildResultLines(withResolution(document, 0, "base")), ["one", "two", "three", "four"]);
  assert.deepEqual(buildResultLines(withResolution(document, 0, "both")), ["one", "L", "R", "three", "four"]);
});

test("resolve › resolving does not mutate the document it came from", () => {
  const document = merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]);
  const resolved = withResolution(document, 0, "local");
  assert.equal(conflicts(document)[0].resolution, "unresolved");
  assert.equal(conflicts(resolved)[0].resolution, "local");
});

test("resolve › resolve-all touches every conflict", () => {
  const document = parse([
    "<<<<<<< HEAD", "a1", "=======", "b1", ">>>>>>> x",
    "middle",
    "<<<<<<< HEAD", "a2", "=======", "b2", ">>>>>>> x",
  ]);
  assert.equal(conflictCount(document), 2);
  const all = withAllResolutions(document, "remote");
  assert.equal(resolvedCount(all), 2);
  assert.ok(isFullyResolved(all));
  assert.deepEqual(buildResultLines(all), ["b1", "middle", "b2"]);
});

test("resolve › resolvedLines of an unresolved hunk are its markers", () => {
  const document = merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]);
  const hunk = conflicts(document)[0];
  assert.deepEqual(resolvedLines(hunk), markerLines(hunk));
});

test("edit › a clean line can be replaced in place", () => {
  const document = merge(BASE, BASE, BASE);
  const edited = withCleanLine(document, 0, 1, "TWO EDITED");
  assert.deepEqual(buildResultLines(edited), ["one", "TWO EDITED", "three", "four"]);
});

test("edit › editing a resolved conflict marks it hand-edited", () => {
  const document = withResolution(
    merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]),
    0,
    "local",
  );
  const edited = withResolvedLine(document, 0, 0, "HAND");
  assert.equal(conflicts(edited)[0].resolution, "edited");
  assert.deepEqual(buildResultLines(edited), ["one", "HAND", "three", "four"]);
});

test("markers › a conflicted file is recognised and parsed", () => {
  const lines = [
    "before",
    "<<<<<<< HEAD",
    "ours",
    "||||||| merged common ancestors",
    "base",
    "=======",
    "theirs",
    ">>>>>>> branch",
    "after",
  ];
  assert.ok(containsConflictMarkers(lines));
  const document = parse(lines);
  assert.equal(conflictCount(document), 1);
  const hunk = conflicts(document)[0];
  assert.equal(hunk.hasBase, true);
  assert.deepEqual(hunk.localLines, ["ours"]);
  assert.deepEqual(hunk.baseLines, ["base"]);
  assert.deepEqual(hunk.remoteLines, ["theirs"]);
  assert.deepEqual(buildResultLines(withResolution(document, 0, "local")), ["before", "ours", "after"]);
});

test("markers › a two-way conflict has no base", () => {
  const document = parse(["<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> branch"]);
  const hunk = conflicts(document)[0];
  assert.equal(hunk.hasBase, false);
  assert.deepEqual(hunk.baseLines, []);
});

test("markers › a file without markers parses as one clean region", () => {
  const document = parse(["a", "b"]);
  assert.equal(containsConflictMarkers(["a", "b"]), false);
  assert.equal(document.regions.length, 1);
  assert.deepEqual(buildResultLines(document), ["a", "b"]);
});

test("markers › re-parsing what we wrote gives the same conflict back", () => {
  const original = merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]);
  const reparsed = parse(buildResultLines(original));
  assert.equal(conflictCount(reparsed), 1);
  const hunk = conflicts(reparsed)[0];
  assert.deepEqual(hunk.localLines, ["L"]);
  assert.deepEqual(hunk.remoteLines, ["R"]);
  assert.deepEqual(hunk.baseLines, ["two"]);
});

test("layout › the four panes have the same number of rows", () => {
  const document = merge(BASE, ["one", "L", "L2", "three", "four"], ["one", "R", "three", "four"]);
  const rows = layout(document);
  const heights = [rows.base.length, rows.local.length, rows.remote.length, rows.result.length];
  assert.equal(new Set(heights).size, 1, `pane heights differ: ${heights.join(", ")}`);
});

test("layout › a conflict's rows are tagged with its index", () => {
  const document = merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]);
  const rows = layout(document);
  const tagged = rows.result.filter((row) => row.conflict === 0);
  assert.ok(tagged.length > 0);
  assert.ok(tagged.every((row) => row.kind === "conflict" || row.kind === "pad"));
});

test("layout › resolving a conflict changes its rows to resolved", () => {
  const document = withResolution(
    merge(BASE, ["one", "L", "three", "four"], ["one", "R", "three", "four"]),
    0,
    "local",
  );
  const rows = layout(document);
  assert.ok(rows.result.some((row) => row.kind === "resolved"));
  assert.equal(rows.result.filter((row) => row.kind === "conflict").length, 0);
});

test("layout › navigation starts are the first row of each conflict", () => {
  const document = parse([
    "x",
    "<<<<<<< HEAD", "a", "=======", "b", ">>>>>>> y",
    "z",
    "<<<<<<< HEAD", "c", "=======", "d", ">>>>>>> y",
  ]);
  const rows = layout(document);
  const starts = conflictRowStarts(rows.result);
  assert.equal(starts.length, 2);
  assert.equal(rows.result[starts[0]].conflict, 0);
  assert.equal(rows.result[starts[1]].conflict, 1);
});

test("layout › line numbers count only real lines in each pane", () => {
  const document = merge(["a"], ["a", "extra"], ["a"]);
  const rows = layout(document);
  const numbers = rows.local.filter((row) => row.text !== null).map((row) => row.lineNo);
  assert.deepEqual(numbers, [1, 2]);
});

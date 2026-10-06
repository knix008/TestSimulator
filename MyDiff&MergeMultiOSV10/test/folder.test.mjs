/**
 * Rename detection, the flat view, and the operations that move files about.
 *
 * Rename detection is the one here worth being careful about: a wrong pair claims
 * two unrelated files are the same file, which is worse than reporting the rename as
 * a deletion and an addition. So as well as the matches it should find, this checks
 * the near-misses it must not.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareDirectories } from "../core/dirCompare.ts";
import { flatRows } from "../core/dirTree.ts";
import { applyOperation, renameEntry } from "../core/fileOps.ts";
import { applyRenames, detectRenames } from "../core/renames.ts";

/** A throwaway pair of folders, written from a description. */
function folders(left, right) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdm-folder-"));
  const write = (base, files) => {
    for (const [rel, body] of Object.entries(files)) {
      const target = path.join(base, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
  };
  const a = path.join(root, "left");
  const b = path.join(root, "right");
  fs.mkdirSync(a);
  fs.mkdirSync(b);
  write(a, left);
  write(b, right);
  return { root, left: a, right: b };
}

function entry(rel, status, size) {
  return {
    rel,
    status,
    leftSize: status === "rightOnly" ? null : size,
    rightSize: status === "leftOnly" ? null : size,
    leftModified: status === "rightOnly" ? null : 1,
    rightModified: status === "leftOnly" ? null : 1,
  };
}

/* ------------------------------------------------------------------ *
 * Pairing orphans back up
 * ------------------------------------------------------------------ */

test("renames › a file moved to another folder is matched by its contents", () => {
  const { left, right } = folders(
    { "old/report.txt": "the same bytes\n" },
    { "new/report.txt": "the same bytes\n" },
  );
  const result = compareDirectories(left, right, { detectRenames: true });

  assert.equal(result.renamed, 1);
  assert.equal(result.leftOnly, 0, "the orphan on the left is gone");
  assert.equal(result.rightOnly, 0, "and so is the one on the right");

  const moved = result.entries.find((item) => item.status === "renamed");
  assert.equal(moved.rel, "old/report.txt");
  assert.equal(moved.renamedTo, "new/report.txt");
});

test("renames › a renamed file in the same folder is matched too", () => {
  const { left, right } = folders({ "a.txt": "content\n" }, { "b.txt": "content\n" });
  const result = compareDirectories(left, right, { detectRenames: true });
  assert.equal(result.renamed, 1);
  assert.equal(result.entries.find((item) => item.status === "renamed").renamedTo, "b.txt");
});

test("renames › two files that merely have the same size are not a rename", () => {
  // Same length, different bytes: a size-only match would pair these wrongly.
  const { left, right } = folders({ "a.txt": "aaaa\n" }, { "b.txt": "bbbb\n" });
  const result = compareDirectories(left, right, { detectRenames: true });
  assert.equal(result.renamed, 0);
  assert.equal(result.leftOnly, 1);
  assert.equal(result.rightOnly, 1);
});

test("renames › detection is off unless it is asked for", () => {
  const { left, right } = folders({ "a.txt": "x\n" }, { "b.txt": "x\n" });
  const result = compareDirectories(left, right);
  assert.equal(result.renamed, 0);
  assert.equal(result.leftOnly, 1);
  assert.equal(result.rightOnly, 1);
});

test("renames › one file cannot be the rename of two", () => {
  // Three identical orphans on the left, one on the right: exactly one pair.
  const pairs = detectRenames(
    [
      entry("a1.txt", "leftOnly", 4),
      entry("a2.txt", "leftOnly", 4),
      entry("b.txt", "rightOnly", 4),
    ],
    "/left",
    "/right",
    () => "same-fingerprint",
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].to, "b.txt");
});

test("renames › the same name in a different folder wins over another candidate", () => {
  const pairs = detectRenames(
    [
      entry("old/report.txt", "leftOnly", 9),
      entry("new/report.txt", "rightOnly", 9),
      entry("new/other.txt", "rightOnly", 9),
    ],
    "/left",
    "/right",
    () => "same",
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].to, "new/report.txt", "the matching basename is preferred");
});

test("renames › an unreadable file pairs with nothing", () => {
  const pairs = detectRenames(
    [entry("a.txt", "leftOnly", 4), entry("b.txt", "rightOnly", 4)],
    "/left",
    "/right",
    () => "",
  );
  assert.deepEqual(pairs, []);
});

test("renames › folding a pair in removes both orphans and keeps everything else", () => {
  const entries = [
    entry("kept.txt", "same", 3),
    entry("a.txt", "leftOnly", 4),
    entry("b.txt", "rightOnly", 4),
  ];
  const folded = applyRenames(entries, [{ from: "a.txt", to: "b.txt" }]);
  assert.equal(folded.length, 2);
  assert.deepEqual(folded.map((item) => item.status), ["same", "renamed"]);
  assert.equal(folded[1].renamedTo, "b.txt");
});

/* ------------------------------------------------------------------ *
 * The flat view
 * ------------------------------------------------------------------ */

test("flat › every file is one row, named by its whole path", () => {
  const entries = [
    entry("src/deep/a.txt", "different", 1),
    entry("b.txt", "same", 1),
  ];
  const rows = flatRows(entries);
  assert.equal(rows.length, 2, "no folder rows");
  assert.ok(rows.every((row) => row.depth === 0 && !row.expandable));
  assert.deepEqual(rows.map((row) => row.node.name), ["b.txt", "src/deep/a.txt"]);
});

test("flat › the filters and the search apply to it as well", () => {
  const entries = [
    entry("a.txt", "same", 1),
    entry("b.txt", "different", 1),
    entry("c.log", "different", 1),
  ];
  const onlyDifferent = { same: false, different: true, leftOnly: true, rightOnly: true, renamed: true };
  assert.deepEqual(flatRows(entries, onlyDifferent).map((row) => row.node.rel), ["b.txt", "c.log"]);
  assert.deepEqual(flatRows(entries, onlyDifferent, ".log").map((row) => row.node.rel), ["c.log"]);
});

/* ------------------------------------------------------------------ *
 * Moving and renaming
 * ------------------------------------------------------------------ */

test("operations › a move copies across and removes the original", () => {
  const { left, right } = folders({ "a.txt": "body\n" }, {});
  const result = applyOperation("moveToRight", left, right, ["a.txt"]);

  assert.deepEqual(result.done, ["a.txt"]);
  assert.equal(fs.readFileSync(path.join(right, "a.txt"), "utf8"), "body\n");
  assert.equal(fs.existsSync(path.join(left, "a.txt")), false, "the original is gone");
});

test("operations › a move the other way works the same", () => {
  const { left, right } = folders({}, { "b.txt": "body\n" });
  applyOperation("moveToLeft", left, right, ["b.txt"]);
  assert.equal(fs.readFileSync(path.join(left, "b.txt"), "utf8"), "body\n");
  assert.equal(fs.existsSync(path.join(right, "b.txt")), false);
});

test("operations › renaming moves a file, and can move it into a folder", () => {
  const { left } = folders({ "a.txt": "body\n" }, {});
  renameEntry(left, "a.txt", "b.txt");
  assert.equal(fs.readFileSync(path.join(left, "b.txt"), "utf8"), "body\n");

  renameEntry(left, "b.txt", "sub/c.txt");
  assert.equal(fs.readFileSync(path.join(left, "sub", "c.txt"), "utf8"), "body\n");
});

test("operations › renaming refuses to overwrite, and refuses to escape the folder", () => {
  const { left } = folders({ "a.txt": "a\n", "b.txt": "b\n" }, {});
  assert.throws(() => renameEntry(left, "a.txt", "b.txt"), /already exists/i);
  assert.throws(() => renameEntry(left, "a.txt", "../escaped.txt"), /outside/i);
  assert.throws(() => renameEntry(left, "missing.txt", "x.txt"), /nothing at/i);
  // And nothing was damaged in the attempts.
  assert.equal(fs.readFileSync(path.join(left, "a.txt"), "utf8"), "a\n");
  assert.equal(fs.readFileSync(path.join(left, "b.txt"), "utf8"), "b\n");
});

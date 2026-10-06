/**
 * The comparison-tool features beyond a plain diff: the folder tree, the file masks,
 * the copy/delete operations and copying lines from one side of a file to the other.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { compareDirectories, maskFilter } from "../core/dirCompare.ts";
import { allFolders, buildTree, flatten, foldersWithDifferences } from "../core/dirTree.ts";
import { applyOperation, copyEntry, deleteEntry, resolveInside } from "../core/fileOps.ts";
import { CompareSession } from "../core/compareSession.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mdm-tools-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function pair(name) {
  const root = path.join(scratch, name);
  const left = path.join(root, "left");
  const right = path.join(root, "right");
  const put = (base, relative, text) => {
    const target = path.join(base, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, "utf8");
  };
  put(left, "README.md", "left\n");
  put(right, "README.md", "right\n");
  put(left, "same.txt", "same\n");
  put(right, "same.txt", "same\n");
  put(left, "only-left.log", "l\n");
  put(right, "only-right.log", "r\n");
  put(left, "src/app.ts", "const a = 1;\n");
  put(right, "src/app.ts", "const a = 2;\n");
  put(left, "src/util.ts", "export {};\n");
  put(right, "src/util.ts", "export {};\n");
  put(left, "src/deep/x.ts", "x\n");
  put(right, "src/deep/x.ts", "x\n");
  return { root, left, right };
}

const byRel = (nodes) => Object.fromEntries(nodes.map((node) => [node.rel, node]));

/* ------------------------------------------------------------------ tree */

test("tree › files group under their folders", () => {
  const { left, right } = pair("tree-a");
  const tree = buildTree(compareDirectories(left, right).entries);
  const top = byRel(tree);
  assert.ok(top["src"], "src is a folder node");
  assert.equal(top["src"].directory, true);
  assert.equal(top["README.md"].directory, false);
  const inSrc = byRel(top["src"].children);
  assert.ok(inSrc["src/app.ts"]);
  assert.ok(inSrc["src/deep"], "nested folders are kept");
});

test("tree › folders come before files, both alphabetically", () => {
  const { left, right } = pair("tree-b");
  const tree = buildTree(compareDirectories(left, right).entries);
  const directories = tree.filter((node) => node.directory).map((node) => node.name);
  const files = tree.filter((node) => !node.directory).map((node) => node.name);
  assert.ok(directories.length > 0 && files.length > 0, "the fixture has both");
  assert.deepEqual(tree.slice(0, directories.length).map((node) => node.name), directories);
  // The same collation the tree uses: a file manager sorts `README.md` next to
  // `readme.md`, not in a separate upper-case block.
  const collated = [...files].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "accent" }));
  assert.deepEqual(files, collated);
});

test("tree › a folder's status rolls up from its contents", () => {
  const { left, right } = pair("tree-c");
  const tree = buildTree(compareDirectories(left, right).entries);
  const top = byRel(tree);
  // src holds one changed file and two identical ones.
  assert.equal(top["src"].status, "different");
  const inSrc = byRel(top["src"].children);
  assert.equal(inSrc["src/deep"].status, "same", "a folder of identical files is identical");
});

test("tree › a folder present on one side only is marked that way", () => {
  const root = path.join(scratch, "tree-one-side");
  fs.mkdirSync(path.join(root, "left", "only"), { recursive: true });
  fs.mkdirSync(path.join(root, "right"), { recursive: true });
  fs.writeFileSync(path.join(root, "left", "only", "a.txt"), "a\n");
  const tree = buildTree(compareDirectories(path.join(root, "left"), path.join(root, "right")).entries);
  const top = byRel(tree);
  assert.equal(top["only"].status, "leftOnly");
  assert.equal(top["only"].right, null, "the right side has no node to show");
  assert.notEqual(top["only"].left, null);
});

test("tree › flattening respects expansion, filters and search", () => {
  const { left, right } = pair("tree-d");
  const tree = buildTree(compareDirectories(left, right).entries);

  const collapsed = flatten(tree, new Set());
  assert.equal(collapsed.some((row) => row.node.rel === "src/app.ts"), false, "collapsed folders hide children");
  assert.ok(collapsed.some((row) => row.node.rel === "src"));

  const expanded = flatten(tree, new Set(allFolders(tree)));
  assert.ok(expanded.some((row) => row.node.rel === "src/deep/x.ts"));
  assert.ok(expanded.find((row) => row.node.rel === "src/deep/x.ts").depth === 2, "depth follows the nesting");

  const onlyDifferent = flatten(tree, new Set(allFolders(tree)), {
    same: false, different: true, leftOnly: false, rightOnly: false,
  });
  assert.equal(onlyDifferent.some((row) => row.node.rel === "same.txt"), false);
  assert.ok(onlyDifferent.some((row) => row.node.rel === "src/app.ts"));

  const searched = flatten(tree, new Set(allFolders(tree)), undefined, "util");
  assert.ok(searched.some((row) => row.node.rel === "src/util.ts"));
  assert.equal(searched.some((row) => row.node.rel === "README.md"), false);
});

test("tree › a folder with nothing left after filtering disappears", () => {
  const { left, right } = pair("tree-e");
  const tree = buildTree(compareDirectories(left, right).entries);
  const rows = flatten(tree, new Set(allFolders(tree)), {
    same: false, different: false, leftOnly: true, rightOnly: false,
  });
  assert.equal(rows.some((row) => row.node.rel === "src"), false, "src holds nothing left-only");
  assert.ok(rows.some((row) => row.node.rel === "only-left.log"));
});

test("tree › the changed folders are the ones worth opening", () => {
  const { left, right } = pair("tree-f");
  const tree = buildTree(compareDirectories(left, right).entries);
  assert.deepEqual(foldersWithDifferences(tree), ["src"]);
});

/* ----------------------------------------------------------------- masks */

test("masks › an include mask is an allow-list", () => {
  const keep = maskFilter(["*.ts"], []);
  assert.equal(keep("app.ts"), true);
  assert.equal(keep("app.js"), false);
});

test("masks › an exclude mask always wins", () => {
  const keep = maskFilter(["*.ts"], ["*.d.ts"]);
  assert.equal(keep("app.ts"), true);
  assert.equal(keep("types.d.ts"), false);
});

test("masks › `?` matches one character and dots are literal", () => {
  const keep = maskFilter(["?.txt"], []);
  assert.equal(keep("a.txt"), true);
  assert.equal(keep("ab.txt"), false);
  assert.equal(keep("axtxt"), false, "the dot is not a wildcard");
});

test("masks › no masks means everything", () => {
  const keep = maskFilter([], []);
  assert.equal(keep("anything.at.all"), true);
});

test("masks › a comparison can be narrowed to one file type", () => {
  const { left, right } = pair("masks-a");
  const result = compareDirectories(left, right, { includeMasks: ["*.ts"] });
  assert.ok(result.entries.length > 0);
  assert.ok(result.entries.every((entry) => entry.rel.endsWith(".ts")), result.entries.map((e) => e.rel).join(", "));
});

test("masks › a comparison can skip a file type", () => {
  const { left, right } = pair("masks-b");
  const result = compareDirectories(left, right, { excludeMasks: ["*.log"] });
  assert.equal(result.entries.some((entry) => entry.rel.endsWith(".log")), false);
  assert.ok(result.entries.some((entry) => entry.rel.endsWith(".md")));
});

/* ------------------------------------------------------- file operations */

test("operations › copying a file to the other side makes them identical", () => {
  const { left, right } = pair("ops-a");
  copyEntry(left, right, "README.md");
  assert.equal(fs.readFileSync(path.join(right, "README.md"), "utf8"), "left\n");
  const result = compareDirectories(left, right);
  assert.equal(result.entries.find((entry) => entry.rel === "README.md").status, "same");
});

test("operations › copying a folder takes its contents with it", () => {
  const { left, right } = pair("ops-b");
  fs.rmSync(path.join(right, "src"), { recursive: true, force: true });
  copyEntry(left, right, "src");
  assert.ok(fs.existsSync(path.join(right, "src", "deep", "x.ts")));
});

test("operations › deleting removes the entry from that side only", () => {
  const { left, right } = pair("ops-c");
  deleteEntry(left, "only-left.log");
  assert.equal(fs.existsSync(path.join(left, "only-left.log")), false);
  assert.ok(fs.existsSync(path.join(right, "only-right.log")));
});

test("operations › a batch reports what it did and what it could not", () => {
  const { left, right } = pair("ops-d");
  const result = applyOperation("copyToRight", left, right, ["README.md", "does-not-exist.txt"]);
  assert.deepEqual(result.done, ["README.md"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].rel, "does-not-exist.txt");
});

test("operations › a path outside the compared folder is refused", () => {
  const { left, right } = pair("ops-e");
  assert.throws(() => resolveInside(left, "../right/README.md"), /outside/);
  const result = applyOperation("deleteLeft", left, right, ["../right/README.md"]);
  assert.equal(result.done.length, 0);
  assert.equal(result.failed.length, 1);
  assert.ok(fs.existsSync(path.join(right, "README.md")), "the escape attempt deleted nothing");
});

test("operations › the compared folder itself cannot be deleted", () => {
  const { left, right } = pair("ops-f");
  assert.throws(() => deleteEntry(left, ""), /cannot be deleted/);
  assert.ok(fs.existsSync(left));
  void right;
});

/* ------------------------------------------------- copying lines across */

function session(leftText, rightText) {
  const side = (label, text) => ({
    label,
    path: label,
    data: Buffer.from(text, "utf8"),
    size: text.length,
    modified: null,
    missing: false,
  });
  return new CompareSession("test", side("left.txt", leftText), side("right.txt", rightText));
}

test("apply › taking a modified row replaces that line on the target", () => {
  const compare = session("one\ntwo\nthree\n", "one\nTWO\nthree\n");
  const rowIndex = compare.allRows().findIndex((row) => row.kind === "modified");
  assert.deepEqual(compare.takeRows("right", [rowIndex]), ["one", "two", "three"]);
  assert.deepEqual(compare.takeRows("left", [rowIndex]), ["one", "TWO", "three"]);
});

test("apply › taking an added row inserts it on the other side", () => {
  const compare = session("one\nthree\n", "one\ntwo\nthree\n");
  const rowIndex = compare.allRows().findIndex((row) => row.kind === "added");
  assert.deepEqual(compare.takeRows("left", [rowIndex]), ["one", "two", "three"]);
});

test("apply › taking a removed row deletes it from the other side", () => {
  const compare = session("one\ntwo\nthree\n", "one\nthree\n");
  const rowIndex = compare.allRows().findIndex((row) => row.kind === "removed");
  assert.deepEqual(compare.takeRows("left", [rowIndex]), ["one", "three"]);
});

test("apply › taking nothing leaves the file as it was", () => {
  const compare = session("one\ntwo\n", "one\nTWO\n");
  assert.deepEqual(compare.takeRows("right", []), ["one", "TWO"]);
  assert.deepEqual(compare.takeRows("left", []), ["one", "two"]);
});

test("apply › a whole block can be taken at once", () => {
  const compare = session("a\nb\nc\nd\n", "a\nX\nY\nd\n");
  const rows = compare.allRows()
    .map((row, index) => (row.kind === "same" ? -1 : index))
    .filter((index) => index >= 0);
  assert.deepEqual(compare.takeRows("right", rows), ["a", "b", "c", "d"]);
});

test("edit › replacing one line rebuilds that side", () => {
  const compare = session("one\ntwo\n", "one\ntwo\n");
  assert.deepEqual(compare.replaceRow("left", 1, "TWO"), ["one", "TWO"]);
  assert.deepEqual(compare.sideLines("left"), ["one", "two"], "the session itself is untouched");
});

test("edit › a binary comparison refuses to be edited", () => {
  const binary = (label, bytes) => ({
    label, path: label, data: Buffer.from(bytes), size: bytes.length, modified: null, missing: false,
  });
  const compare = new CompareSession("bin", binary("a.bin", [0, 1, 2]), binary("b.bin", [0, 9, 2]));
  assert.equal(compare.mode, "binary");
  assert.throws(() => compare.takeRows("right", [0]), /cannot be edited/);
});

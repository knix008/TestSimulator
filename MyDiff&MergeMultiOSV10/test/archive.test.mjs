/**
 * Reading ZIP archives, and comparing folders that contain them.
 *
 * The archives here are written by the test rather than kept as fixtures, which is
 * what lets each case say plainly which part of the format it is about: a stored
 * entry, a deflated one, a nested path, an archive comment sitting between the end
 * record and the end of the file.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { compareDirectories } from "../core/dirCompare.ts";
import {
  isArchivePath,
  joinArchivePath,
  listZip,
  readZipEntry,
  splitArchivePath,
} from "../core/zip.ts";

/* ------------------------------------------------------------------ *
 * Writing one
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A ZIP holding the files given. `deflate` picks the method, so both paths through
 * the reader are exercised, and `comment` puts bytes after the end record.
 */
function makeZip(files, { deflate = false, comment = "" } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text, "utf8");
    const stored = deflate ? zlib.deflateRawSync(body) : body;
    const nameBytes = Buffer.from(name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt16LE(0x6000, 10); // time
    local.writeUInt16LE(0x5000, 12); // date: 2020-02-16
    local.writeUInt32LE(crc32(body), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, stored);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt16LE(0x6000, 12);
    entry.writeUInt16LE(0x5000, 14);
    entry.writeUInt32LE(crc32(body), 16);
    entry.writeUInt32LE(stored.length, 20);
    entry.writeUInt32LE(body.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + stored.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(central);
  const commentBytes = Buffer.from(comment, "utf8");

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  end.writeUInt16LE(commentBytes.length, 20);

  return Buffer.concat([localPart, centralPart, end, commentBytes]);
}

function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mdm-zip-"));
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

test("zip › archive extensions are recognised, including the ones that are zips in disguise", () => {
  assert.equal(isArchivePath("a.zip"), true);
  assert.equal(isArchivePath("lib.jar"), true);
  assert.equal(isArchivePath("report.docx"), true);
  assert.equal(isArchivePath("notes.txt"), false);
});

test("zip › a path inside an archive splits into its two halves", () => {
  assert.deepEqual(splitArchivePath("C:\\x\\a.zip!inner/file.txt"), {
    archive: "C:\\x\\a.zip",
    entry: "inner/file.txt",
  });
  // Windows will have turned the inner separators into backslashes on the way here.
  assert.equal(splitArchivePath("a.zip!inner\\deep\\file.txt").entry, "inner/deep/file.txt");
  assert.equal(splitArchivePath("plain.txt"), null);
  assert.equal(joinArchivePath("a.zip", "b.txt"), "a.zip!b.txt");
});

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

test("zip › the index lists every entry with its size and CRC", () => {
  const root = scratch();
  const file = path.join(root, "a.zip");
  fs.writeFileSync(file, makeZip({ "one.txt": "hello", "dir/two.txt": "world!" }));

  const entries = listZip(file);
  assert.deepEqual(entries.map((entry) => entry.name), ["one.txt", "dir/two.txt"]);
  assert.equal(entries[0].size, 5);
  assert.equal(entries[1].size, 6);
  assert.notEqual(entries[0].crc, entries[1].crc);
  assert.ok(entries[0].modified > 0, "the DOS timestamp was decoded");
});

test("zip › stored and deflated entries both come back as their contents", () => {
  const root = scratch();
  for (const deflate of [false, true]) {
    const file = path.join(root, `${deflate ? "deflate" : "store"}.zip`);
    fs.writeFileSync(file, makeZip({ "a.txt": "the contents" }, { deflate }));
    const data = readZipEntry(file, "a.txt");
    assert.equal(Buffer.from(data).toString("utf8"), "the contents", deflate ? "deflated" : "stored");
  }
});

test("zip › an archive comment does not hide the index", () => {
  const root = scratch();
  const file = path.join(root, "commented.zip");
  fs.writeFileSync(file, makeZip({ "a.txt": "x" }, { comment: "a comment at the end" }));
  assert.deepEqual(listZip(file).map((entry) => entry.name), ["a.txt"]);
});

test("zip › asking for something that is not there says so", () => {
  const root = scratch();
  const file = path.join(root, "a.zip");
  fs.writeFileSync(file, makeZip({ "a.txt": "x" }));
  assert.throws(() => readZipEntry(file, "missing.txt"), /not in/);
});

test("zip › a file that is not an archive is refused rather than misread", () => {
  const root = scratch();
  const file = path.join(root, "not.zip");
  fs.writeFileSync(file, "this is just text, and not very long");
  assert.throws(() => listZip(file), /not a readable archive/i);
});

/* ------------------------------------------------------------------ *
 * In a folder comparison
 * ------------------------------------------------------------------ */

function pair(leftZip, rightZip) {
  const root = scratch();
  const left = path.join(root, "left");
  const right = path.join(root, "right");
  fs.mkdirSync(left);
  fs.mkdirSync(right);
  fs.writeFileSync(path.join(left, "bundle.zip"), makeZip(leftZip));
  fs.writeFileSync(path.join(right, "bundle.zip"), makeZip(rightZip));
  return { left, right };
}

test("archives › a folder comparison looks inside them", () => {
  const { left, right } = pair(
    { "same.txt": "unchanged", "changed.txt": "before" },
    { "same.txt": "unchanged", "changed.txt": "after!" },
  );
  const result = compareDirectories(left, right, { archives: true });

  const byRel = Object.fromEntries(result.entries.map((entry) => [entry.rel, entry.status]));
  assert.equal(byRel["bundle.zip!same.txt"], "same");
  assert.equal(byRel["bundle.zip!changed.txt"], "different");
  assert.equal(byRel["bundle.zip"], undefined, "the archive itself is not also a row");
});

test("archives › a file added inside one shows as added, not as a changed archive", () => {
  const { left, right } = pair({ "a.txt": "x" }, { "a.txt": "x", "b.txt": "new" });
  const result = compareDirectories(left, right, { archives: true });

  assert.equal(result.same, 1);
  assert.equal(result.rightOnly, 1);
  assert.equal(result.different, 0, "nothing is reported as merely different");
  assert.ok(result.entries.some((entry) => entry.rel === "bundle.zip!b.txt" && entry.status === "rightOnly"));
});

test("archives › without the option an archive is one opaque file", () => {
  const { left, right } = pair({ "a.txt": "x" }, { "a.txt": "y" });
  const result = compareDirectories(left, right);
  assert.deepEqual(result.entries.map((entry) => entry.rel), ["bundle.zip"]);
  assert.equal(result.entries[0].status, "different");
});

test("archives › a file that only looks like an archive is still compared", () => {
  const root = scratch();
  const left = path.join(root, "left");
  const right = path.join(root, "right");
  fs.mkdirSync(left);
  fs.mkdirSync(right);
  fs.writeFileSync(path.join(left, "broken.zip"), "not an archive");
  fs.writeFileSync(path.join(right, "broken.zip"), "not an archive");

  const result = compareDirectories(left, right, { archives: true });
  assert.deepEqual(result.entries.map((entry) => entry.rel), ["broken.zip"]);
  assert.equal(result.entries[0].status, "same", "it fell back to comparing the file itself");
});

test("archives › the masks apply inside an archive too", () => {
  const { left, right } = pair(
    { "keep.txt": "a", "skip.log": "b" },
    { "keep.txt": "a", "skip.log": "c" },
  );
  const result = compareDirectories(left, right, { archives: true, excludeMasks: ["*.log"] });
  assert.deepEqual(result.entries.map((entry) => entry.rel), ["bundle.zip!keep.txt"]);
});

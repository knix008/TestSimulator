/**
 * The comparison engines: two-way line alignment, word-level spans and the binary
 * hex view. These are the parts a wrong answer in would be invisible on screen but
 * wrong in the saved result, so they are tested on their own rather than through the UI.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  blockStarts,
  computeRows,
  documentFromLines,
  linesEqual,
  normalizeLine,
  splitLines,
  wordSpans,
} from "../core/lineDiff.ts";
import { BYTES_PER_ROW, binaryStats, hexRowText, hexRows, isBinary, popCount } from "../core/binary.ts";

const kinds = (rows) => rows.map((row) => row.kind).join(",");

test("diff › identical files produce no differences", () => {
  const document = documentFromLines(["a", "b", "c"], ["a", "b", "c"]);
  assert.equal(document.added, 0);
  assert.equal(document.removed, 0);
  assert.equal(document.modified, 0);
  assert.deepEqual(document.diffBlocks, []);
});

test("diff › an inserted line is added on the right only", () => {
  const document = documentFromLines(["a", "c"], ["a", "b", "c"]);
  assert.equal(document.added, 1);
  assert.equal(document.removed, 0);
  assert.equal(kinds(document.rows), "same,added,same");
});

test("diff › a deleted line is removed on the left only", () => {
  const document = documentFromLines(["a", "b", "c"], ["a", "c"]);
  assert.equal(document.removed, 1);
  assert.equal(kinds(document.rows), "same,removed,same");
});

test("diff › a changed line pairs the two sides on one row", () => {
  const document = documentFromLines(["a", "b", "c"], ["a", "B", "c"]);
  assert.equal(document.modified, 1);
  assert.equal(kinds(document.rows), "same,modified,same");
  assert.equal(document.rows[1].left, "b");
  assert.equal(document.rows[1].right, "B");
});

test("diff › line numbers follow each side independently", () => {
  const document = documentFromLines(["a", "b", "c"], ["a", "c"]);
  assert.deepEqual(document.rows.map((row) => row.leftNo), [1, 2, 3]);
  assert.deepEqual(document.rows.map((row) => row.rightNo), [1, null, 2]);
});

test("diff › every run of differences is one navigation block", () => {
  const document = documentFromLines(
    ["a", "b", "c", "d", "e", "f"],
    ["a", "B", "C", "d", "e", "F"],
  );
  assert.deepEqual(document.diffBlocks, [1, 5]);
});

test("diff › blockStarts groups consecutive differences", () => {
  assert.deepEqual(blockStarts(["same", "added", "added", "same", "modified"]), [1, 4]);
});

test("diff › a file compared with an empty one is all removals", () => {
  const document = documentFromLines(["a", "b"], []);
  assert.equal(document.removed, 2);
  assert.equal(document.added, 0);
});

test("diff › alignment survives a large repeated block", () => {
  const left = Array.from({ length: 4000 }, (_, index) => `line ${index}`);
  const right = [...left];
  right[2000] = "changed";
  const document = documentFromLines(left, right);
  assert.equal(document.modified, 1);
  assert.deepEqual(document.diffBlocks, [2000]);
});

test("ignore › whitespace-only changes can be treated as equal", () => {
  const options = { ignoreWhitespace: true };
  assert.equal(normalizeLine("  a   b  ", options), "a b");
  assert.ok(linesEqual("a  b", " a b ", options));
  const document = documentFromLines(["a  b"], [" a b "], options);
  assert.equal(document.modified, 0);
  assert.equal(document.rows[0].kind, "same");
});

test("ignore › case-only changes can be treated as equal", () => {
  const document = documentFromLines(["Hello"], ["hello"], { ignoreCase: true });
  assert.equal(document.rows[0].kind, "same");
  // ...and are a real difference when the option is off.
  assert.equal(documentFromLines(["Hello"], ["hello"]).modified, 1);
});

test("ignore › the displayed text is never normalised, only the comparison", () => {
  const rows = computeRows(["a  b"], [" a b "], { ignoreWhitespace: true });
  assert.equal(rows[0].left, "a  b");
  assert.equal(rows[0].right, " a b ");
});

test("words › only the changed words are highlighted", () => {
  const spans = wordSpans("the quick brown fox", "the slow brown fox");
  assert.equal(spans.left.length, 1);
  assert.equal("the quick brown fox".slice(spans.left[0].start, spans.left[0].end), "quick");
  assert.equal("the slow brown fox".slice(spans.right[0].start, spans.right[0].end), "slow");
});

test("words › identical lines have no spans", () => {
  const spans = wordSpans("same", "same");
  assert.deepEqual(spans, { left: [], right: [] });
});

test("words › an empty side highlights the whole of the other", () => {
  const spans = wordSpans("", "added text");
  assert.deepEqual(spans.left, []);
  assert.deepEqual(spans.right, [{ start: 0, end: "added text".length }]);
});

test("lines › splitLines handles CRLF, CR and LF alike", () => {
  assert.deepEqual(splitLines("a\r\nb\rc\nd"), ["a", "b", "c", "d"]);
  assert.deepEqual(splitLines(""), []);
});

test("binary › text is not mistaken for binary", () => {
  assert.equal(isBinary(Buffer.from("plain ascii text\n")), false);
  assert.equal(isBinary(Buffer.from("한글 텍스트 파일\n", "utf8")), false);
  assert.equal(isBinary(Buffer.from([])), false);
});

test("binary › NUL bytes mean binary", () => {
  assert.equal(isBinary(Buffer.from([0x41, 0x00, 0x42])), true);
  // A real PNG: the signature, then a chunk header full of NULs.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  ]);
  assert.equal(isBinary(png), true);
});

test("binary › high-entropy bytes without a NUL still read as binary", () => {
  // Compressed data: no NUL, but far too few printable bytes to be text.
  const noise = Buffer.from(Array.from({ length: 256 }, (_, index) => 0x80 + (index % 0x7f)));
  assert.equal(isBinary(noise), true);
});

test("binary › the hex view counts differing bytes", () => {
  const left = Buffer.from([1, 2, 3, 4]);
  const right = Buffer.from([1, 9, 3, 4]);
  const stats = binaryStats(left, right);
  assert.equal(stats.rowCount, 1);
  assert.equal(stats.differentBytes, 1);
  assert.equal(stats.kinds[0], "modified");
});

test("binary › a longer right side reads as added rows", () => {
  const left = Buffer.alloc(BYTES_PER_ROW);
  const right = Buffer.alloc(BYTES_PER_ROW * 2);
  const stats = binaryStats(left, right);
  assert.equal(stats.rowCount, 2);
  assert.equal(stats.kinds[1], "added");
});

test("binary › a hex row renders offset, bytes and ascii", () => {
  const rows = hexRows(Buffer.from("ABC"), Buffer.from("ABD"), 0, 1);
  const text = hexRowText(rows[0].offset, rows[0].left);
  assert.match(text, /^00000000 {2}41 42 43/);
  assert.ok(text.includes("ABC"));
  assert.equal(popCount(rows[0].mask), 1);
});

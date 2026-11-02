// Builds the `samples/` tree: the inputs the GUI test drives the app with, and the
// quickest way for a person to see what the app does without finding two files of
// their own. Regenerated rather than committed, so it is always consistent with what
// the tests expect.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samples = path.join(root, "samples");

function write(relative, text) {
  const target = path.join(samples, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, "utf8");
  return target;
}

function writeBinary(relative, bytes) {
  const target = path.join(samples, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(bytes));
  return target;
}

fs.rmSync(samples, { recursive: true, force: true });

/* ------------------------------------------------- two files to compare */

write("files/left.txt", [
  "# Release notes",
  "",
  "## Version 1.0",
  "- First public release.",
  "- Compares two files side by side.",
  "- Compares two directory trees.",
  "",
  "## Known issues",
  "- Very large binary files are slow to open.",
  "- The printer margin is not remembered.",
  "",
  "Copyright (c) SHKWON",
  "",
].join("\n"));

write("files/right.txt", [
  "# Release notes",
  "",
  "## Version 1.1",
  "- First public release.",
  "- Compares two files side by side, with word-level highlighting.",
  "- Compares two directory trees.",
  "- Resolves git merge conflicts.",
  "",
  "## Known issues",
  "- Very large binary files are slow to open.",
  "",
  "Copyright (c) SHKWON",
  "",
].join("\n"));

write("files/identical-a.txt", "one\ntwo\nthree\n");
write("files/identical-b.txt", "one\ntwo\nthree\n");

// A pair that differs only in whitespace and case, for the "ignore" options.
write("files/loose-a.txt", "Alpha  Beta\n    gamma\nDelta\n");
write("files/loose-b.txt", "alpha beta\ngamma\nDelta\n");

writeBinary("files/left.bin", Array.from({ length: 160 }, (_, index) => (index * 7) & 0xff));
writeBinary("files/right.bin", Array.from({ length: 176 }, (_, index) => (index * 7 + (index > 80 ? 3 : 0)) & 0xff));

/* ------------------------------------------------------- a 3-way merge */

write("merge/base.txt", [
  "function greet(name) {",
  "  return 'Hello, ' + name;",
  "}",
  "",
  "function farewell(name) {",
  "  return 'Bye, ' + name;",
  "}",
  "",
].join("\n"));

write("merge/local.txt", [
  "function greet(name) {",
  "  return `Hello, ${name}!`;",
  "}",
  "",
  "function farewell(name) {",
  "  return 'Bye, ' + name;",
  "}",
  "",
  "export { greet, farewell };",
  "",
].join("\n"));

write("merge/remote.txt", [
  "function greet(name) {",
  "  return 'Hi there, ' + name;",
  "}",
  "",
  "function farewell(name) {",
  "  return 'Goodbye, ' + name + '.';",
  "}",
  "",
].join("\n"));

write("merge/merged.txt", "");

/* -------------------------------------------- a file git left conflicted */

write("conflict/conflicted.txt", [
  "# Configuration",
  "",
  "<<<<<<< HEAD",
  "timeout = 30",
  "retries = 3",
  "||||||| merged common ancestors",
  "timeout = 10",
  "=======",
  "timeout = 60",
  ">>>>>>> feature/longer-timeout",
  "",
  "log_level = info",
  "",
  "<<<<<<< HEAD",
  "colour = auto",
  "=======",
  "color = always",
  ">>>>>>> feature/longer-timeout",
  "",
].join("\n"));

/* ------------------------------------------------ two directory trees */

const shared = "shared line\nsecond line\nthird line\n";
write("tree/left/README.md", "# Sample tree\n\nThe left side.\n");
write("tree/right/README.md", "# Sample tree\n\nThe right side, edited.\n");
write("tree/left/same.txt", shared);
write("tree/right/same.txt", shared);
write("tree/left/only-left.txt", "This file exists only on the left.\n");
write("tree/right/only-right.txt", "This file exists only on the right.\n");
write("tree/left/src/app.js", "export const version = '1.0';\nexport const name = 'sample';\n");
write("tree/right/src/app.js", "export const version = '1.1';\nexport const name = 'sample';\n");
write("tree/left/src/util.js", "export const noop = () => {};\n");
write("tree/right/src/util.js", "export const noop = () => {};\n");
write("tree/left/docs/guide.md", "Step one.\nStep two.\n");
write("tree/right/docs/guide.md", "Step one.\nStep two.\nStep three.\n");

console.log(`samples  ${path.relative(root, samples)}  (files, merge, conflict, tree)`);

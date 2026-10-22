// Which files the logo picker and drag-and-drop treat as images. Decoding them is
// checkLogoInputs in scenario.js (headless browser and the desktop app).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isLogoFile, LOGO_ACCEPT, LOGO_EXTS, logoExtension } from "../src/js/logo.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the file dialog lists every logo format, including AVIF", () => {
  for (const ext of LOGO_EXTS) assert.ok(LOGO_ACCEPT.includes(`.${ext}`), ext);
  for (const mime of ["image/*", "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/svg+xml", "image/tiff", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]) {
    assert.ok(LOGO_ACCEPT.includes(mime), mime);
  }
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
  assert.match(html, new RegExp(`accept="${LOGO_ACCEPT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
});

test("an image MIME or a known extension is a logo file", () => {
  const yes = [
    { name: "a.png", type: "image/png" },
    { name: "a.jpg", type: "image/jpeg" },
    { name: "a.jpeg", type: "image/jpeg" },
    { name: "a.webp", type: "image/webp" },
    { name: "a.gif", type: "image/gif" },
    { name: "a.bmp", type: "image/bmp" },
    { name: "a.ico", type: "image/x-icon" },
    { name: "a.svg", type: "image/svg+xml" },
    { name: "a.avif", type: "image/avif" },
    { name: "a.tif", type: "image/tiff" },
    { name: "a.tiff", type: "image/tiff" },
    // Windows often reports no type for these.
    { name: "photo.AVIF", type: "" },
    { name: "scan.TIF", type: "" },
    { name: "mark.ICO", type: "application/octet-stream" },
    { name: "dot.apng", type: "" },
    { name: "shot.jfif", type: "" },
    { name: "no-name", type: "image/avif" },
  ];
  for (const file of yes) assert.equal(isLogoFile(file), true, JSON.stringify(file));
});

test("other files are not logo files", () => {
  const no = [
    null,
    undefined,
    { name: "notes.txt", type: "text/plain" },
    { name: "page.pdf", type: "application/pdf" },
    { name: "drawing.eps", type: "application/postscript" },
    { name: "photo.heic", type: "" },
    { name: "photo.heic", type: "application/octet-stream" },
    { name: "archive.tar.gz", type: "" },
    { name: "", type: "" },
  ];
  for (const file of no) assert.equal(isLogoFile(file), false, JSON.stringify(file));
  assert.equal(logoExtension("photo.AVIF"), "avif");
  assert.equal(logoExtension("archive.tar.gz"), "gz");
  assert.equal(logoExtension("noext"), "");
});

test("the AVIF fixture is a real AVIF", () => {
  const bytes = fs.readFileSync(path.join(root, "test", "fixtures", "logo.avif"));
  assert.equal(bytes.subarray(4, 12).toString("ascii"), "ftypavif");
  assert.ok(bytes.length > 32 && bytes.length < 4096, `fixture is a tiny still, got ${bytes.length} bytes`);
});

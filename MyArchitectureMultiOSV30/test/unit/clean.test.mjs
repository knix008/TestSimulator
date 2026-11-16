// Unit tests for `npm run clean` / `clean:all` (scripts/clean.mjs), run on a
// throwaway copy of the project layout in the temp folder: --dry-run deletes
// nothing, clean removes the build and test output and keeps the sources,
// samples, texture library, manuals and tutorial video; --all also removes
// node_modules.
// Run: node --test test/unit/clean.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = path.resolve(import.meta.dirname, "..", "..", "scripts", "clean.mjs");

const OUTPUT = ["dist/web/index.html", "src-tauri/target/debug/MyArchitecture.exe", "src-tauri/gen/schemas/desktop.json", "release/a.exe",
  "test-results/r.json", "smoke-shots/a.png", "windows-shots/a.png", "bench-results/a.json", "coverage/c.json",
  "MyArchitecture_1.0.3_x64-setup.exe", "MyArchitecture_1.0.3_amd64.AppImage", "bench-3d.json", "npm-debug.log", "rec.mp4.part"];
const KEPT = ["src/app.js", "src/buildinfo.js", "sample/01-studio.myarch", "library/textures/index.json", "docs/USERSGUIDE.ko.html",
  "MyArchitecture-Tutorial.mp4", "package.json", "src-tauri/Cargo.toml", "src-tauri/gen/other.txt", "test/unit/x.test.mjs", "scripts/clean.mjs"];

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myarch-clean-"));
  for (const f of [...OUTPUT, ...KEPT, "node_modules/three/package.json"]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "x".repeat(100));
  }
  fs.copyFileSync(script, path.join(dir, "scripts", "clean.mjs"));
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [path.join(dir, "scripts", "clean.mjs"), ...args], { encoding: "utf8" });
const has = (dir, f) => fs.existsSync(path.join(dir, f));

describe("npm run clean", () => {
  test("--dry-run lists what would go and deletes nothing", () => {
    const dir = project();
    try {
      const r = run(dir, "--dry-run");
      assert.equal(r.status, 0, r.stderr);
      for (const f of ["dist", "src-tauri/target", "MyArchitecture_1.0.3_x64-setup.exe", "bench-3d.json"]) assert.ok(r.stdout.includes(`would remove ${f}`), f);
      assert.ok(!r.stdout.includes("node_modules  ("), "node_modules only with --all");
      for (const f of [...OUTPUT, ...KEPT]) assert.ok(has(dir, f), f);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("clean removes build, test and benchmark output; keeps sources, samples, library, manuals, video and node_modules", () => {
    const dir = project();
    try {
      const r = run(dir);
      assert.equal(r.status, 0, r.stderr);
      for (const f of OUTPUT) assert.ok(!has(dir, f), `${f} removed`);
      for (const f of KEPT) assert.ok(has(dir, f), `${f} kept`);
      assert.ok(has(dir, "node_modules/three/package.json"));
      assert.match(r.stdout, /item\(s\) removed/);
      assert.match(r.stdout, /clean:all/);
      // A second run has nothing left to do.
      assert.match(run(dir).stdout, /already clean/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("clean:all (--all) also removes node_modules", () => {
    const dir = project();
    try {
      const r = run(dir, "--all");
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!has(dir, "node_modules"));
      for (const f of KEPT) assert.ok(has(dir, f), `${f} kept`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("package.json has both commands", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "package.json"), "utf8"));
    assert.equal(pkg.scripts.clean, "node scripts/clean.mjs");
    assert.equal(pkg.scripts["clean:all"], "node scripts/clean.mjs --all");
  });
});

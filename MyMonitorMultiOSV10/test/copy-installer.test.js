"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { TMP } = require("./helpers");
const { copyInstaller, pickOne, isInstallerName } = require("../scripts/copy-installer");

const work = path.join(TMP, "copy-installer");
const releaseDir = path.join(work, "release");
const root = path.join(work, "root");

function write(dir, name, bytes = 32) {
  fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes, 1));
}

describe("copy-installer", () => {
  beforeEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(releaseDir, { recursive: true });
    fs.mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  it("ignores blockmap and yml sidecar files", () => {
    assert.equal(isInstallerName("MyMonitor-Setup-10.0.0.exe"), true);
    assert.equal(isInstallerName("MyMonitor-Setup-10.0.0.exe.blockmap"), false);
    assert.equal(isInstallerName("latest.yml"), false);
  });

  it("picks the NSIS setup when several artifacts exist", () => {
    const chosen = pickOne([
      "latest.yml",
      "MyMonitor-Setup-10.0.0.exe.blockmap",
      "MyMonitor-Setup-10.0.0.exe",
      "MyMonitor-10.0.0.dmg"
    ]);
    assert.equal(chosen, "MyMonitor-Setup-10.0.0.exe");
  });

  it("copies only one installer to the project root", () => {
    write(releaseDir, "latest.yml", 8);
    write(releaseDir, "MyMonitor-Setup-10.0.0.exe.blockmap", 8);
    write(releaseDir, "MyMonitor-Setup-10.0.0.exe", 64);
    write(releaseDir, "MyMonitor-10.0.0.dmg", 48);

    const result = copyInstaller({ root, releaseDir });
    assert.equal(result.name, "MyMonitor-Setup-10.0.0.exe");
    const rootFiles = fs.readdirSync(root);
    assert.deepEqual(rootFiles, ["MyMonitor-Setup-10.0.0.exe"]);
    assert.equal(fs.statSync(path.join(root, result.name)).size, 64);
  });

  it("replaces a previous root installer so only one remains", () => {
    write(root, "MyMonitor-Setup-9.0.0.exe", 16);
    write(root, "MyMonitor-9.0.0.dmg", 16);
    write(releaseDir, "MyMonitor-Setup-10.0.0.exe", 40);

    const result = copyInstaller({ root, releaseDir });
    assert.equal(result.name, "MyMonitor-Setup-10.0.0.exe");
    assert.ok(result.removed.includes("MyMonitor-Setup-9.0.0.exe"));
    assert.ok(result.removed.includes("MyMonitor-9.0.0.dmg"));
    assert.deepEqual(fs.readdirSync(root), ["MyMonitor-Setup-10.0.0.exe"]);
  });
});

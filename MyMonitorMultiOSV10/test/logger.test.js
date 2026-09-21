"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { FileLogger } = require("../app/lib/logger");
const { TMP } = require("./helpers");

const dir = path.join(TMP, "logs");

describe("FileLogger", () => {
  before(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates the log directory", () => {
    const log = new FileLogger(dir);
    assert.ok(fs.existsSync(dir));
    assert.ok(log.fileFor(new Date("2026-09-21")).endsWith("mmon-20260921.log"));
  });

  it("writes a ring record with defaults", () => {
    const log = new FileLogger(dir);
    const rec = log.write({ message: "hello" });
    assert.equal(rec.level, "info");
    assert.equal(rec.message, "hello");
    assert.ok(rec.ts);
    assert.equal(log.list().length, 1);
  });

  it("keeps level, target and message", () => {
    const log = new FileLogger(dir);
    log.write({ level: "error", targetId: "t1", targetName: "node-a", message: "down", ts: 1000 });
    const rec = log.list().pop();
    assert.equal(rec.level, "error");
    assert.equal(rec.targetName, "node-a");
    assert.equal(rec.targetId, "t1");
  });

  it("caps the in-memory ring", () => {
    const log = new FileLogger(dir);
    log.maxRing = 3;
    log.write({ message: "a" });
    log.write({ message: "b" });
    log.write({ message: "c" });
    log.write({ message: "d" });
    assert.equal(log.list().length, 3);
    assert.equal(log.list()[0].message, "b");
    assert.equal(log.list()[2].message, "d");
  });

  it("exports txt, csv and json", () => {
    const log = new FileLogger(dir);
    log.write({ ts: Date.parse("2026-01-02T03:04:05Z"), level: "warn", targetName: "dev,1", message: 'say "hi"' });
    const txt = path.join(dir, "out.txt");
    const csv = path.join(dir, "out.csv");
    const json = path.join(dir, "out.json");
    log.exportTo(txt, "txt");
    log.exportTo(csv, "csv");
    log.exportTo(json, "json");
    const txtBody = fs.readFileSync(txt, "utf8");
    assert.match(txtBody, /\[warn\]/);
    assert.match(txtBody, /dev,1/);
    const csvBody = fs.readFileSync(csv, "utf8");
    assert.match(csvBody, /^ts,level,target,message/m);
    assert.match(csvBody, /""hi""/);
    const rows = JSON.parse(fs.readFileSync(json, "utf8"));
    assert.equal(rows[0].level, "warn");
  });

  it("list returns a copy", () => {
    const log = new FileLogger(dir);
    log.write({ message: "x" });
    log.list().push({ message: "injected" });
    assert.equal(log.list().filter((r) => r.message === "injected").length, 0);
  });
});

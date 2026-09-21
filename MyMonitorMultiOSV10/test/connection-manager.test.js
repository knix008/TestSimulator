"use strict";

const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { ConnectionManager } = require("../app/lib/connection-manager");

function once(ee, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    ee.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

describe("ConnectionManager", () => {
  const managers = [];

  function createManager() {
    const mgr = new ConnectionManager();
    managers.push(mgr);
    return mgr;
  }

  afterEach(() => {
    while (managers.length) {
      managers.pop().stopAll();
    }
  });

  it("starts a server simulator and emits metrics", async () => {
    const mgr = createManager();
    const wait = once(mgr, "metrics");
    const id = mgr.startSimulator({ simMode: "server", name: "srv", intervalMs: 200 });
    const sample = await wait;
    assert.equal(sample.targetId, id);
    assert.ok(sample.metrics.cpu >= 0);
    assert.ok(sample.metrics.ramTotal > 0);
    assert.ok(sample.metrics.diskTotal > 0);
    mgr.stop(id);
    assert.equal(mgr.snapshot().length, 0);
  });

  it("starts an RTOS simulator without disk metrics", async () => {
    const mgr = createManager();
    const wait = once(mgr, "metrics");
    const id = mgr.startSimulator({ simMode: "rtos", intervalMs: 200 });
    const sample = await wait;
    assert.equal(sample.hello.osType, 4);
    assert.ok(sample.metrics.heapTotal);
    assert.ok(sample.metrics.tasks >= 1);
    assert.equal(sample.metrics.diskTotal, undefined);
    mgr.stopAll();
  });

  it("starts the local collector", async () => {
    const mgr = createManager();
    const wait = once(mgr, "metrics", 15000);
    const id = mgr.startLocal({ intervalMs: 200 });
    const sample = await wait;
    assert.equal(id, "local");
    assert.ok(sample.metrics.ramTotal > 0);
    assert.equal(mgr.sampler.runningInBackground, true);
    mgr.stop(id);
  });

  it("snapshot lists status fields", () => {
    const mgr = createManager();
    mgr.startSimulator({ simMode: "server", name: "s1", intervalMs: 5000 });
    const row = mgr.snapshot()[0];
    assert.equal(row.kind, "simulator");
    assert.equal(row.status, "online");
    assert.ok(row.hello);
    mgr.stopAll();
  });

  it("restarting local replaces the previous target", () => {
    const mgr = createManager();
    mgr.startLocal({ intervalMs: 5000 });
    mgr.startLocal({ intervalMs: 5000, name: "again" });
    assert.equal(mgr.snapshot().length, 1);
    assert.equal(mgr.snapshot()[0].name, "again");
    mgr.stopAll();
  });

  it("clamps interval to 200..10000", () => {
    const mgr = createManager();
    assert.equal(mgr.setIntervalMs(10), 200);
    assert.equal(mgr.setIntervalMs(99999), 10000);
    assert.equal(mgr.setIntervalMs("500"), 500);
    assert.equal(mgr.defaultIntervalMs, 500);
  });

  it("updates running simulator interval", async () => {
    const mgr = createManager();
    const id = mgr.startSimulator({ simMode: "server", intervalMs: 5000 });
    mgr.setIntervalMs(250);
    assert.equal(mgr.targets.get(id).intervalMs, 250);
    mgr.stopAll();
  });

  it("stop on unknown id is a no-op", () => {
    const mgr = createManager();
    mgr.stop("missing");
    assert.equal(mgr.snapshot().length, 0);
  });

  it("rejects an unknown connection kind", async () => {
    const mgr = createManager();
    await assert.rejects(() => mgr.start({ kind: "ftp" }), /알 수 없는/);
  });

  it("emits a log when a simulator starts", async () => {
    const mgr = createManager();
    const wait = once(mgr, "log");
    mgr.startSimulator({ simMode: "rtos", name: "board-1", intervalMs: 5000 });
    const entry = await wait;
    assert.equal(entry.targetName, "board-1");
    assert.match(entry.message, /시작/);
    mgr.stopAll();
  });
});

"use strict";

const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { BackgroundSampler } = require("../app/lib/background-sampler");
const { MetricsPump } = require("../app/lib/metrics-pump");
const { simulateSample } = require("../app/lib/simulate");

function once(ee, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    ee.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe("background sampler", () => {
  const samplers = [];

  function create() {
    const sampler = new BackgroundSampler();
    samplers.push(sampler);
    return sampler;
  }

  afterEach(() => {
    while (samplers.length) samplers.pop().stopAll();
  });

  it("collects local samples on a worker thread", async () => {
    const sampler = create();
    assert.equal(sampler.runningInBackground, true);
    const wait = once(sampler, "sample");
    sampler.start({ id: "local", kind: "local", intervalMs: 200 });
    const msg = await wait;
    assert.equal(msg.id, "local");
    assert.ok(msg.sample.metrics.ramTotal > 0);
  });

  it("collects simulator samples without blocking the caller", async () => {
    const sampler = create();
    const wait = once(sampler, "sample");
    const t0 = Date.now();
    sampler.start({ id: "sim", kind: "simulator", simMode: "server", intervalMs: 200 });
    assert.ok(Date.now() - t0 < 50);
    const msg = await wait;
    assert.ok(msg.sample.metrics.diskTotal > 0);
  });

  it("stops emitting after stop", async () => {
    const sampler = create();
    sampler.start({ id: "sim", kind: "simulator", simMode: "rtos", intervalMs: 200 });
    await once(sampler, "sample");
    sampler.stop("sim");
    await new Promise((r) => setTimeout(r, 250));
    let extra = 0;
    sampler.on("sample", () => {
      extra += 1;
    });
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(extra, 0);
  });
});

describe("metrics pump", () => {
  it("keeps only the latest sample per target", async () => {
    const sent = [];
    const pump = new MetricsPump((sample) => sent.push(sample), 10);
    pump.push({ targetId: "a", ts: 1 });
    pump.push({ targetId: "a", ts: 2 });
    pump.push({ targetId: "b", ts: 3 });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(sent.length, 2);
    assert.equal(sent.find((s) => s.targetId === "a").ts, 2);
  });
});

describe("simulate sample", () => {
  it("builds rtos and server metrics", () => {
    const rtos = simulateSample("rtos");
    assert.equal(rtos.hello.osType, 4);
    assert.ok(rtos.metrics.heapTotal);
    const srv = simulateSample("server");
    assert.ok(srv.metrics.diskTotal > 0);
  });
});

describe("worker packaging", () => {
  it("unpacks the sampler worker from asar", () => {
    const pkg = JSON.parse(fs.readFileSync(require("path").join(__dirname, "../app/package.json"), "utf8"));
    assert.ok(pkg.build.asarUnpack.includes("lib/sample-worker.js"));
  });
});

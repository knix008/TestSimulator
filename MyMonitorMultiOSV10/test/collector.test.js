"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { collectLocal } = require("../app/lib/collector");

describe("local collector", () => {
  it("returns a timestamp and hello", async () => {
    const sample = await collectLocal();
    assert.ok(sample.ts > 0);
    assert.ok(sample.hello.hostname);
    assert.ok([1, 2, 3].includes(sample.hello.osType));
    assert.equal(sample.hello.caps, 0x1f);
  });

  it("reports ram used and total", async () => {
    const { metrics } = await collectLocal();
    assert.ok(metrics.ramTotal > 0);
    assert.ok(metrics.ramUsed >= 0);
    assert.ok(metrics.ramUsed <= metrics.ramTotal);
  });

  it("reports cpu as a percentage", async () => {
    const { metrics } = await collectLocal();
    assert.ok(Number.isFinite(metrics.cpu));
    assert.ok(metrics.cpu >= 0);
    assert.ok(metrics.cpu <= 100.5);
  });

  it("reports uptime seconds", async () => {
    const { metrics } = await collectLocal();
    assert.ok(metrics.uptime >= 0);
  });

  it("os type matches process.platform", async () => {
    const { hello } = await collectLocal();
    if (process.platform === "win32") assert.equal(hello.osType, 2);
    else if (process.platform === "darwin") assert.equal(hello.osType, 3);
    else assert.equal(hello.osType, 1);
  });

  it("returns immediately without waiting on systeminformation", async () => {
    const t0 = Date.now();
    await collectLocal();
    assert.ok(Date.now() - t0 < 250);
  });
});

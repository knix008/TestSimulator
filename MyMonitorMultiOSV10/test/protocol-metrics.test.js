"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Decoder, parseMetrics, METRIC, METRIC_KEY } = require("../app/lib/protocol");
const { encodeMetricsFrame, sampleServerMetrics, sampleRtosMetrics } = require("./helpers");

describe("METRICS frames", () => {
  it("parses a full server metric set", () => {
    const ts = 1_700_000_000_000;
    const [frame] = new Decoder().push(sampleServerMetrics(ts));
    const parsed = parseMetrics(frame.payload);
    assert.equal(parsed.ts, ts);
    assert.ok(Math.abs(parsed.metrics.cpu - 33.5) < 0.01);
    assert.equal(parsed.metrics.ramUsed, 4 * 1024 * 1024 * 1024);
    assert.equal(parsed.metrics.ramTotal, 8 * 1024 * 1024 * 1024);
    assert.equal(parsed.metrics.diskUsed, 100);
    assert.equal(parsed.metrics.diskTotal, 200);
    assert.ok(Math.abs(parsed.metrics.load1 - 0.75) < 0.01);
    assert.ok(Math.abs(parsed.metrics.load5 - 0.5) < 0.01);
    assert.ok(Math.abs(parsed.metrics.load15 - 0.25) < 0.01);
    assert.ok(Math.abs(parsed.metrics.netRxRate - 1200.5) < 0.1);
    assert.equal(parsed.metrics.uptime, 3600);
    assert.equal(parsed.metrics.procs, 142);
  });

  it("parses RTOS heap, tasks and temperature", () => {
    const [frame] = new Decoder().push(sampleRtosMetrics(42));
    const { metrics } = parseMetrics(frame.payload);
    assert.equal(metrics.heapUsed, 48 * 1024);
    assert.equal(metrics.heapTotal, 128 * 1024);
    assert.equal(metrics.tasks, 7);
    assert.ok(Math.abs(metrics.temp - 41.5) < 0.01);
    assert.equal(metrics.diskUsed, undefined);
    assert.equal(metrics.load1, undefined);
  });

  it("omits unknown metric ids", () => {
    const buf = encodeMetricsFrame(1, 10, [{ id: 250, vtype: 2, value: 9 }]);
    const { metrics } = parseMetrics(new Decoder().push(buf)[0].payload);
    assert.deepEqual(metrics, {});
  });

  it("returns null for short payloads", () => {
    assert.equal(parseMetrics(null), null);
    assert.equal(parseMetrics(Buffer.alloc(0)), null);
    assert.equal(parseMetrics(Buffer.alloc(11)), null);
  });

  it("handles zero metric count", () => {
    const buf = encodeMetricsFrame(1, 99, []);
    const parsed = parseMetrics(new Decoder().push(buf)[0].payload);
    assert.equal(parsed.ts, 99);
    assert.deepEqual(parsed.metrics, {});
  });

  it("maps every documented metric id to a key", () => {
    const ids = Object.values(METRIC);
    assert.equal(ids.length, 18);
    for (const id of ids) {
      assert.ok(METRIC_KEY[id], `missing key for metric ${id}`);
    }
  });

  it("round-trips f32 zero and u64 zero", () => {
    const buf = encodeMetricsFrame(1, 1, [
      { id: METRIC.CPU_PCT, vtype: 1, value: 0 },
      { id: METRIC.RAM_USED, vtype: 2, value: 0 }
    ]);
    const { metrics } = parseMetrics(new Decoder().push(buf)[0].payload);
    assert.equal(metrics.cpu, 0);
    assert.equal(metrics.ramUsed, 0);
  });

  it("round-trips 100 percent cpu", () => {
    const buf = encodeMetricsFrame(1, 1, [{ id: METRIC.CPU_PCT, vtype: 1, value: 100 }]);
    const { metrics } = parseMetrics(new Decoder().push(buf)[0].payload);
    assert.ok(Math.abs(metrics.cpu - 100) < 0.01);
  });

  it("preserves large byte counters", () => {
    const n = 3_000_000_000;
    const buf = encodeMetricsFrame(1, 1, [{ id: METRIC.NET_RX, vtype: 2, value: n }]);
    const { metrics } = parseMetrics(new Decoder().push(buf)[0].payload);
    assert.equal(metrics.netRx, n);
  });
});

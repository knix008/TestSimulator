"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseTextLine } = require("../app/lib/protocol");

describe("JSON Lines fallback", () => {
  it("parses metrics with snake_case keys", () => {
    const line = JSON.stringify({
      t: "metrics",
      cpu: 12.5,
      ram_used: 100,
      ram_total: 200,
      disk_used: 1,
      disk_total: 2,
      load1: 0.2,
      net_rx_rate: 10,
      net_tx_rate: 5
    });
    const parsed = parseTextLine(line);
    assert.equal(parsed.kind, "metrics");
    assert.equal(parsed.metrics.cpu, 12.5);
    assert.equal(parsed.metrics.ramUsed, 100);
    assert.equal(parsed.metrics.netRxRate, 10);
  });

  it("parses metrics with camelCase keys", () => {
    const parsed = parseTextLine(JSON.stringify({ cpu: 1, ramUsed: 2, ramTotal: 3, heapUsed: 4, heapTotal: 8, tasks: 6 }));
    assert.equal(parsed.metrics.ramUsed, 2);
    assert.equal(parsed.metrics.heapUsed, 4);
    assert.equal(parsed.metrics.tasks, 6);
  });

  it("parses a log line", () => {
    const parsed = parseTextLine(JSON.stringify({ t: "log", level: "warn", msg: "hot" }));
    assert.equal(parsed.kind, "log");
    assert.equal(parsed.level, "warn");
    assert.equal(parsed.message, "hot");
  });

  it("accepts message as well as msg", () => {
    const parsed = parseTextLine(JSON.stringify({ t: "log", message: "boot" }));
    assert.equal(parsed.message, "boot");
    assert.equal(parsed.level, "info");
  });

  it("returns null for invalid json", () => {
    assert.equal(parseTextLine("{not json"), null);
  });

  it("drops empty and NaN metric fields", () => {
    const parsed = parseTextLine(JSON.stringify({ cpu: 1, ram_used: "", temp: "x" }));
    assert.equal(parsed.metrics.cpu, 1);
    assert.equal(parsed.metrics.ramUsed, undefined);
    assert.equal(parsed.metrics.temp, undefined);
  });
});

describe("key=value fallback", () => {
  it("parses a space-separated line", () => {
    const parsed = parseTextLine("cpu=10 ram_used=20 ram_total=40 load1=0.5");
    assert.equal(parsed.kind, "metrics");
    assert.equal(parsed.metrics.cpu, 10);
    assert.equal(parsed.metrics.ramUsed, 20);
    assert.equal(parsed.metrics.load1, 0.5);
  });

  it("parses rtos heap and tasks", () => {
    const parsed = parseTextLine("heap_used=1024 heap_total=4096 tasks=5 temp=36.5");
    assert.equal(parsed.metrics.heapUsed, 1024);
    assert.equal(parsed.metrics.tasks, 5);
    assert.equal(parsed.metrics.temp, 36.5);
  });

  it("ignores unknown keys and non-numeric values", () => {
    const parsed = parseTextLine("cpu=3 foo=1 bar=abc");
    assert.deepEqual(parsed.metrics, { cpu: 3 });
  });

  it("returns null for blank, plain text, and unknown keys", () => {
    assert.equal(parseTextLine(""), null);
    assert.equal(parseTextLine("   "), null);
    assert.equal(parseTextLine("hello world"), null);
    assert.equal(parseTextLine("unknown="), null);
  });
});

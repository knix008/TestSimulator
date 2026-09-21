"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("ui stays responsive", () => {
  const collector = fs.readFileSync(path.join(__dirname, "../app/lib/collector.js"), "utf8");
  const charts = fs.readFileSync(path.join(__dirname, "../app/renderer/charts.js"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
  const manager = fs.readFileSync(path.join(__dirname, "../app/lib/connection-manager.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");
  const web = fs.readFileSync(path.join(__dirname, "../app/renderer/web-bridge.js"), "utf8");

  it("does not await currentLoad or fsSize on the collect path", () => {
    assert.doesNotMatch(collector, /currentLoad\s*\(/);
    assert.doesNotMatch(collector, /si\.fsSize\s*\(/);
    assert.doesNotMatch(collector, /si\.mem\s*\(/);
    assert.match(collector, /refreshNetAsync/);
  });

  it("runs local and simulator sampling off the UI thread", () => {
    assert.match(manager, /BackgroundSampler/);
    assert.match(manager, /this\.sampler\.start/);
    assert.match(main, /MetricsPump/);
    assert.match(web, /scheduleJob/);
    assert.match(web, /emitMetrics/);
  });

  it("caches chart theme colors instead of reading styles while drawing", () => {
    const draw = charts.slice(charts.indexOf("draw()"));
    assert.doesNotMatch(draw, /getComputedStyle/);
    assert.match(charts, /refreshTheme/);
    assert.match(charts, /requestAnimationFrame/);
    assert.match(charts, /desynchronized:\s*true/);
  });

  it("coalesces metric paints and updates cards in place", () => {
    assert.match(renderer, /requestAnimationFrame/);
    assert.match(renderer, /pendingMetrics/);
    assert.match(renderer, /kids\.length !== items\.length/);
    assert.match(renderer, /MAX_LOG_LINES/);
  });
});

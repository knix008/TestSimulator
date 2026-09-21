"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("chart time window", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/renderer/index.html"), "utf8");
  const settings = fs.readFileSync(path.join(__dirname, "../app/renderer/settings.html"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
  const charts = fs.readFileSync(path.join(__dirname, "../app/renderer/charts.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");

  it("stores timestamped points and clips by time window", () => {
    assert.match(charts, /this\.windowMs/);
    assert.match(charts, /s\.points\.push\(\{ t: ts, v:/);
    assert.match(charts, /setWindowMs\(ms\)/);
    assert.match(charts, /static setAllWindowMs/);
    assert.match(charts, /const CHART_KEEP_MS = 600000/);
    assert.match(charts, /now - this\.windowMs/);
    assert.doesNotMatch(charts, /maxPoints/);
  });

  it("puts a seconds stepper on the toolbar and in settings", () => {
    const pages = html + settings;
    assert.match(html, /id="window-sec"/);
    assert.match(html, /id="window-down"/);
    assert.match(html, /id="window-up"/);
    assert.match(settings, /id="settings-window"/);
    assert.equal([...pages.matchAll(/data-step="window"/g)].length, 2);
    assert.equal([...pages.matchAll(/data-window-dir="-1"/g)].length, 2);
    assert.equal([...pages.matchAll(/data-window-dir="1"/g)].length, 2);
  });

  it("clamps 10..600 seconds and persists windowSec", () => {
    assert.match(renderer, /const WINDOW_MIN = 10/);
    assert.match(renderer, /const WINDOW_MAX = 600/);
    assert.match(renderer, /const WINDOW_STEP = 10/);
    assert.match(renderer, /function bindWindowStepper/);
    assert.match(renderer, /function clampWindow/);
    assert.match(renderer, /bindWindowStepper\(\$\("window-sec"\)/);
    assert.match(renderer, /windowSec: state\.windowSec/);
    assert.match(main, /windowSec: 60/);
  });

  it("keeps accumulated history when only the window changes", () => {
    assert.match(renderer, /function rememberSample/);
    assert.match(renderer, /function replayHistory/);
    assert.match(renderer, /RealtimeChart\.setAllWindowMs\(next \* 1000\)/);
    const start = renderer.indexOf("function setWindowLocal");
    const end = renderer.indexOf("async function applyWindow");
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(renderer.slice(start, end), /\.reset\(/);
  });
});

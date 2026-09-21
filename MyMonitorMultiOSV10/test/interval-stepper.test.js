"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("interval stepper", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/renderer/index.html"), "utf8");
  const settings = fs.readFileSync(path.join(__dirname, "../app/renderer/settings.html"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");

  it("puts left and right buttons around a typed interval field", () => {
    const pages = html + settings;
    const steppers = [...pages.matchAll(/data-step="interval"/g)];
    assert.equal(steppers.length, 3);
    assert.match(html, /id="interval-down"/);
    assert.match(html, /id="interval-up"/);
    assert.match(html, /id="interval-ms"[^>]*type="text"/);
    assert.match(settings, /id="settings-interval"[^>]*type="text"/);
    assert.match(html, /id="conn-interval"[^>]*type="text"/);
    assert.equal([...pages.matchAll(/data-interval-dir="-1"/g)].length, 3);
    assert.equal([...pages.matchAll(/data-interval-dir="1"/g)].length, 3);
  });

  it("steps by 100 ms and clamps 200..10000", () => {
    assert.match(renderer, /const INTERVAL_MIN = 200/);
    assert.match(renderer, /const INTERVAL_MAX = 10000/);
    assert.match(renderer, /const INTERVAL_STEP = 100/);
    assert.match(renderer, /function bindIntervalStepper/);
    assert.match(renderer, /function clampInterval/);
    assert.match(renderer, /bindIntervalStepper\(\$\("interval-ms"\)/);
  });

  it("styles the stepper as a compact control", () => {
    assert.match(css, /\.interval-stepper\s*\{/);
    assert.match(css, /\.interval-stepper \.step-btn/);
    assert.match(css, /\.interval-stepper \.interval-input/);
  });
});

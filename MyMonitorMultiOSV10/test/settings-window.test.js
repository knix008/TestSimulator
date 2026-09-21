"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("settings window", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/renderer/settings.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../app/renderer/settings.js"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");

  it("splits settings into general and theme tabs", () => {
    assert.match(html, /data-tab="general"/);
    assert.match(html, /data-tab="theme"/);
    assert.match(html, /data-tab-panel="general"/);
    assert.match(html, /data-tab-panel="theme"/);
    assert.match(html, /data-theme-group="dark"/);
    assert.match(html, /data-theme-group="light"/);
    assert.match(js, /function showSettingsTab/);
    assert.match(js, /function showThemeGroup/);
  });

  it("does not use a scrollbar in the settings window", () => {
    assert.match(css, /html\.settings,\s*html\.settings body\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.settings-body\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.settings-form\s*\{[^}]*overflow:\s*hidden/s);
    assert.doesNotMatch(css, /html\.settings[^}]*overflow:\s*auto/);
  });

  it("keeps theme swatches compact", () => {
    assert.match(css, /\.settings-form \.theme-swatch\s*\{[^}]*padding:\s*4px/s);
    assert.match(css, /\.settings-form \.theme-swatch \.dot\s*\{[^}]*height:\s*10px/s);
  });

  it("opens a fixed-size settings window with a gear icon", () => {
    assert.match(main, /width:\s*560/);
    assert.match(main, /height:\s*540/);
    assert.match(main, /resizable:\s*false/);
    assert.match(main, /settings-icon\.png/);
    assert.match(html, /class="dlg-icon settings-gear"/);
    assert.ok(fs.existsSync(path.join(__dirname, "../app/assets/settings-icon.png")));
  });
});

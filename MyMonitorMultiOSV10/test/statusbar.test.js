"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("status bar", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");

  it("shows program status fields", () => {
    assert.match(html, /class="statusbar"/);
    assert.match(html, /id="sb-msg"/);
    assert.match(html, /id="sb-targets"/);
    assert.match(html, /id="sb-selected"/);
    assert.match(html, /id="sb-interval"/);
    assert.match(html, /id="sb-window"/);
    assert.match(html, /id="sb-lang"/);
    assert.match(html, /id="sb-theme"/);
    assert.match(html, /id="clock"/);
    assert.match(renderer, /function refreshStatusBar/);
  });

  it("puts a resize marker at the bottom right", () => {
    assert.match(html, /class="size-grip"/);
    assert.match(css, /\.size-grip\s*\{[^}]*cursor:\s*se-resize/s);
    const bar = html.slice(html.indexOf('class="statusbar"'));
    assert.ok(bar.indexOf("size-grip") > bar.indexOf("clock"));
  });

  it("keeps the clock on the status bar, not the menubar", () => {
    const chrome = html.slice(0, html.indexOf('class="statusbar"'));
    assert.doesNotMatch(chrome, /id="clock"/);
    assert.doesNotMatch(chrome, /id="sel-status"/);
  });
});

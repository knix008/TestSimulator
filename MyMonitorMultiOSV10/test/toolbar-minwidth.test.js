"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("toolbar min window width", () => {
  const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "../app/preload.js"), "utf8");

  it("sets a floor minWidth that can fit the toolbar", () => {
    const match = main.match(/createWindow\s*\(\)[\s\S]*?minWidth:\s*(\d+)/);
    assert.ok(match);
    assert.ok(Number(match[1]) >= 1360);
  });

  it("measures toolbar content and raises the window minimum", () => {
    assert.match(renderer, /function toolbarContentWidth/);
    assert.match(renderer, /function syncWindowMinWidth/);
    assert.match(renderer, /setMinContentWidth/);
    assert.match(preload, /window:min-content-width/);
    assert.match(main, /window:min-content-width/);
    assert.match(main, /setMinimumSize/);
  });

  it("keeps toolbar and menu labels on one line", () => {
    assert.match(css, /\.toolbar\s*\{[^}]*flex-wrap:\s*nowrap/s);
    assert.match(css, /\.toolbar\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.toolbar > \* \{ flex:\s*0 0 auto; min-width:\s*max-content/);
    assert.match(css, /\.tb-btn span\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.tb-btn span\s*\{[^}]*word-break:\s*keep-all/s);
    assert.match(css, /\.tb-btn span\s*\{[^}]*min-width:\s*max-content/s);
    assert.match(css, /\.tb-interval\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.menu-btn span\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.menu-drop button span\s*\{[^}]*white-space:\s*nowrap/s);
  });
});

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("menu icons", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");

  it("shows an icon on every top-level menu", () => {
    const menus = [...html.matchAll(/<button type="button" class="menu-btn"[^>]*data-menu=[\s\S]*?<\/button>/g)];
    assert.equal(menus.length, 4);
    for (const [block] of menus) {
      assert.match(block, /<svg /);
      assert.match(block, /data-i18n="/);
    }
  });

  it("shows an icon on every menu item", () => {
    const items = [...html.matchAll(/role="menuitem"[\s\S]*?<\/button>/g)];
    assert.ok(items.length >= 11);
    for (const [block] of items) {
      assert.match(block, /<svg /);
      assert.match(block, /<span data-i18n="/);
    }
  });

  it("keeps i18n labels on the text so icons survive language switch", () => {
    assert.doesNotMatch(html, /class="menu-btn"[^>]*data-i18n=/);
    assert.doesNotMatch(html, /role="menuitem"[^>]*data-i18n=/);
    assert.match(css, /\.menu-btn svg/);
    assert.match(css, /\.menu-drop button svg/);
    assert.match(css, /border:\s*1px solid transparent/);
  });

  it("keeps About and Settings on the right", () => {
    assert.match(html, /class="tb-right"/);
    assert.match(html, /class="menubar-right"/);
    const right = html.slice(html.indexOf('class="tb-right"'));
    assert.match(right, /data-action="settings"/);
    assert.match(right, /data-action="about"/);
    const bar = html.slice(html.indexOf('class="menubar-right"'), html.indexOf('class="toolbar"'));
    assert.match(bar, /data-action="settings"/);
    assert.match(bar, /data-action="about"/);
    assert.match(css, /\.tb-right\s*\{[^}]*margin-left:\s*auto/s);
    assert.match(css, /\.menubar-right\s*\{[^}]*margin-left:\s*auto/s);
  });
});

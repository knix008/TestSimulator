"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { THEMES } = require("../app/renderer/i18n");

describe("themes", () => {
  it("has 20 themes: 10 dark and 10 light", () => {
    assert.equal(THEMES.length, 20);
    assert.equal(THEMES.filter((t) => t.group === "dark").length, 10);
    assert.equal(THEMES.filter((t) => t.group === "light").length, 10);
  });

  it("ids are unique", () => {
    const ids = THEMES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("each theme has ko/en names, swatch and accent", () => {
    for (const t of THEMES) {
      assert.ok(t.id);
      assert.ok(t.ko);
      assert.ok(t.en);
      assert.match(t.swatch, /^#[0-9a-fA-F]{3,8}$/);
      assert.match(t.accent, /^#[0-9a-fA-F]{3,8}$/);
    }
  });

  it("css defines every theme id", () => {
    const css = fs.readFileSync(path.join(__dirname, "../app/renderer/themes.css"), "utf8");
    for (const t of THEMES) {
      assert.match(css, new RegExp(`\\[data-theme="${t.id}"\\]`), t.id);
    }
  });

  it("css themes declare required variables", () => {
    const css = fs.readFileSync(path.join(__dirname, "../app/renderer/themes.css"), "utf8");
    for (const name of ["--bg", "--text", "--accent", "--chrome", "--dlg"]) {
      const matches = css.match(new RegExp(name, "g")) || [];
      assert.ok(matches.length >= 20, name);
    }
  });

  it("includes midnight as the default dark theme", () => {
    assert.equal(THEMES[0].id, "midnight");
    assert.equal(THEMES[0].group, "dark");
  });
});

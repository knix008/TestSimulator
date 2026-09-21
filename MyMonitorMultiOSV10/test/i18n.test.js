"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { I18N } = require("../app/renderer/i18n");

describe("i18n packs", () => {
  it("supports only Korean and English", () => {
    assert.deepEqual(Object.keys(I18N).sort(), ["en", "ko"]);
  });

  it("has the same keys in ko and en", () => {
    const ko = Object.keys(I18N.ko).sort();
    const en = Object.keys(I18N.en).sort();
    assert.deepEqual(ko, en);
  });

  it("does not leave empty strings", () => {
    for (const lang of ["ko", "en"]) {
      for (const [key, value] of Object.entries(I18N[lang])) {
        assert.equal(typeof value, "string", key);
        assert.ok(value.length > 0, `${lang}.${key}`);
      }
    }
  });

  it("Korean pack contains Hangul in core labels", () => {
    assert.match(I18N.ko.file, /[가-힣]/);
    assert.match(I18N.ko.settings, /[가-힣]/);
    assert.match(I18N.ko.aboutTitle, /[가-힣]/);
  });

  it("English pack uses ASCII letters for menu titles", () => {
    assert.match(I18N.en.file, /File/);
    assert.match(I18N.en.help, /Help/);
    assert.match(I18N.en.settings, /Settings/);
  });

  it("covers connect, export and interval keys", () => {
    for (const key of ["addConn", "exportTxt", "exportCsv", "exportJson", "interval", "window", "refresh", "tipLang", "aboutAuthor", "tipIntervalDown", "tipIntervalUp", "tipWindow", "tipWindowDown", "tipWindowUp", "sbWindow"]) {
      assert.ok(I18N.ko[key]);
      assert.ok(I18N.en[key]);
    }
  });

  it("HTML data-i18n keys exist in both packs", () => {
    const rendererDir = path.join(__dirname, "../app/renderer");
    const html = fs
      .readdirSync(rendererDir)
      .filter((name) => name.endsWith(".html"))
      .map((name) => fs.readFileSync(path.join(rendererDir, name), "utf8"))
      .join("\n");
    const keys = [...html.matchAll(/data-i18n(?:-tip|-placeholder|-aria)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 20);
    for (const key of keys) {
      assert.ok(I18N.ko[key], `missing ko ${key}`);
      assert.ok(I18N.en[key], `missing en ${key}`);
    }
  });
});

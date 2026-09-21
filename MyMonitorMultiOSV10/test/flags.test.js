"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { FLAG_KO, FLAG_GB, flagForSwitch } = require("../app/renderer/i18n");

describe("language flags", () => {
  it("draws a Taegeukgi to switch to Korean", () => {
    assert.match(FLAG_KO, /#CD2E3A/i);
    assert.match(FLAG_KO, /#0047A0/i);
    assert.match(FLAG_KO, /#fff|#ffffff/i);
    assert.equal(flagForSwitch("en"), FLAG_KO);
  });

  it("draws a Union Jack to switch to English", () => {
    assert.match(FLAG_GB, /#012169/i);
    assert.match(FLAG_GB, /#C8102E/i);
    assert.doesNotMatch(FLAG_GB, /#002868|#bf0a30/i);
    assert.equal(flagForSwitch("ko"), FLAG_GB);
  });

  it("does not use a US flag in the UI", () => {
    const app = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
    const settings = fs.readFileSync(path.join(__dirname, "../app/renderer/settings.js"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");
    assert.doesNotMatch(app, /FLAG_US/);
    assert.doesNotMatch(settings, /FLAG_US/);
    assert.match(app, /flagForSwitch\(state\.lang\)/);
    assert.match(settings, /flagForSwitch\(state\.lang\)/);
    assert.match(css, /\.flag\s*\{[^}]*width:\s*36px/s);
    assert.match(css, /\.lang-btn\s*\{[^}]*padding:\s*0/s);
    assert.match(css, /\.lang-btn \.flag\s*\{[^}]*height:\s*100%/s);
  });
});

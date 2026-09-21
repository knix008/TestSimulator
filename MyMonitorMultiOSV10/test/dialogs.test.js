"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("popup dialogs", () => {
  const html = fs.readFileSync(path.join(__dirname, "../app/renderer/index.html"), "utf8");
  const dialogs = [...html.matchAll(/<dialog\b[^>]*id="([^"]+)"/g)].map((m) => m[1]);

  it("defines about and connect dialogs", () => {
    assert.deepEqual(dialogs.sort(), ["about-dlg", "dlg"]);
  });

  it("opens settings as its own movable window", () => {
    const settings = fs.readFileSync(path.join(__dirname, "../app/renderer/settings.html"), "utf8");
    const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");
    const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
    assert.match(settings, /id="settings-form"/);
    assert.match(settings, /class="dlg-icon settings-gear"/);
    assert.doesNotMatch(settings, /assets\/icon\.png/);
    assert.match(main, /settings:open/);
    assert.match(main, /modal:\s*false/);
    assert.match(main, /settings\.html/);
    assert.match(renderer, /monitor\.openSettings/);
    assert.doesNotMatch(html, /id="settings-dlg"/);
  });

  it("puts the app icon in every dialog title", () => {
    const blocks = html.split(/<dialog\b/);
    const bodies = blocks.slice(1);
    assert.equal(bodies.length, 2);
    for (const body of bodies) {
      const titleIdx = body.search(/class="dlg-title"/);
      const iconIdx = body.search(/class="dlg-icon"/);
      const h2Idx = body.search(/<h2\b/);
      assert.ok(titleIdx >= 0, "missing dlg-title");
      assert.ok(iconIdx >= 0, "missing dlg-icon");
      assert.ok(iconIdx < h2Idx, "icon should sit with the title");
      assert.match(body, /assets\/icon\.png/);
    }
  });

  it("keeps the window icon but not a menubar brand", () => {
    assert.equal(html.includes("brand-icon"), false);
    assert.equal(/class="brand"/.test(html), false);
    const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");
    assert.match(main, /"assets",\s*"icon\.png"/);
  });

  it("credits SHKWON as the program author", () => {
    const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");
    const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/package.json"), "utf8"));
    assert.match(main, /SHKWON\(knix008@naver\.com\)/);
    assert.match(renderer, /SHKWON\(knix008@naver\.com\)/);
    assert.equal(pkg.author.name, "SHKWON");
    assert.equal(pkg.author.email, "knix008@naver.com");
  });

  it("puts a separator above the log panel", () => {
    const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");
    assert.match(html, /class="log-sep"/);
    assert.match(html, /role="separator"/);
    assert.match(css, /\.log-sep\s*\{/);
  });

  it("puts a separator to the right of the target pane", () => {
    const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");
    assert.match(html, /class="side-sep"/);
    assert.match(css, /\.side-sep\s*\{/);
    assert.match(css, /grid-template-columns:\s*280px 6px 1fr/);
  });

  it("keeps the main window from scrolling", () => {
    const css = fs.readFileSync(path.join(__dirname, "../app/renderer/styles.css"), "utf8");
    const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
    assert.match(css, /html,\s*body\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.main\s*\{[^}]*overflow:\s*hidden/s);
    assert.doesNotMatch(css, /\.main\s*\{[^}]*overflow-y:\s*auto/s);
    assert.doesNotMatch(renderer, /main\.scrollTop/);
  });

  it("offers HTTPS ingest as a connection kind", () => {
    assert.match(html, /value="https"/);
    assert.match(html, /id="f-tcp"/);
    assert.doesNotMatch(html, /id="f-http"/);
    const renderer = fs.readFileSync(path.join(__dirname, "../app/renderer/app.js"), "utf8");
    assert.match(renderer, /kind === "https"/);
  });

  it("shows the package version on the title bar", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../app/package.json"), "utf8"));
    const escaped = pkg.version.replace(/\./g, "\\.");
    assert.match(html, new RegExp(`<title>MyMonitor MultiOS v${escaped}</title>`));
    const main = fs.readFileSync(path.join(__dirname, "../app/main.js"), "utf8");
    assert.match(main, /MyMonitor MultiOS v\$\{app\.getVersion\(\)\}/);
  });
});

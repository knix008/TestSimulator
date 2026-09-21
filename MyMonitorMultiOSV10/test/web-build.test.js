"use strict";

const { after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { TMP } = require("./helpers");
const { buildWeb } = require("../scripts/build-web");
const { listenWeb } = require("../scripts/serve-web");

const dest = path.join(TMP, "web-dist");

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      })
      .on("error", reject);
  });
}

describe("web build and serve", () => {
  let server;

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dest, { recursive: true, force: true });
  });

  it("writes a standalone web folder", () => {
    const result = buildWeb({ dest });
    assert.equal(result.version, "10.0.0");
    const html = fs.readFileSync(path.join(dest, "index.html"), "utf8");
    assert.match(html, /<title>MyMonitor MultiOS v10\.0\.0<\/title>/);
    assert.match(html, /src="web-bridge\.js"/);
    assert.doesNotMatch(html, /\.\.\/assets\//);
    assert.match(html, /src="assets\/icon\.png"/);
    assert.ok(fs.existsSync(path.join(dest, "assets", "icon.png")));
    assert.ok(fs.existsSync(path.join(dest, "web-bridge.js")));
    assert.ok(fs.existsSync(path.join(dest, "settings.html")));
    assert.ok(fs.existsSync(path.join(dest, "settings.js")));
    const info = JSON.parse(fs.readFileSync(path.join(dest, "version.json"), "utf8"));
    assert.equal(info.author, "SHKWON(knix008@naver.com)");
  });

  it("serves the web build", async () => {
    const listening = await listenWeb({ dist: dest, port: 0 });
    server = listening.server;
    const addr = server.address();
    const base = `http://127.0.0.1:${addr.port}`;
    const home = await get(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.body, /web-bridge\.js/);
    const css = await get(`${base}/styles.css`);
    assert.equal(css.status, 200);
    const missing = await get(`${base}/no-such-file`);
    assert.equal(missing.status, 404);
  });
});

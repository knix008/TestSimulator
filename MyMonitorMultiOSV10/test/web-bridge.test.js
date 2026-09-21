"use strict";

const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createWebMonitor } = require("../app/renderer/web-bridge");

function once(api, kind, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${kind}`)), timeoutMs);
    const off = api[kind]((payload) => {
      clearTimeout(timer);
      off();
      resolve(payload);
    });
  });
}

describe("web monitor bridge", () => {
  const monitors = [];

  function create() {
    const store = {};
    const api = createWebMonitor({
      version: "10.0.0",
      storage: {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => {
          store[k] = v;
        }
      },
      download: (name) => name
    });
    monitors.push(api);
    return api;
  }

  afterEach(() => {
    while (monitors.length) monitors.pop().stopAll();
  });

  it("does not install over an existing window.monitor", () => {
    assert.equal(typeof createWebMonitor, "function");
  });

  it("starts a simulator and emits metrics", async () => {
    const api = create();
    const wait = once(api, "onMetrics");
    const id = await api.start({ kind: "simulator", simMode: "server", intervalMs: 200 });
    const sample = await wait;
    assert.equal(sample.targetId, id);
    assert.ok(sample.metrics.ramTotal > 0);
    const info = await api.appInfo();
    assert.equal(info.author, "SHKWON(knix008@naver.com)");
    assert.equal(info.platform, "web");
  });

  it("starts browser-local collection", async () => {
    const api = create();
    const wait = once(api, "onMetrics");
    const id = await api.start({ kind: "local", intervalMs: 200 });
    const sample = await wait;
    assert.equal(id, "local");
    assert.equal(sample.hello.osName, "web");
  });

  it("rejects HTTPS ingest, TCP and serial in the browser", async () => {
    const api = create();
    await assert.rejects(() => api.start({ kind: "https", host: "0.0.0.0", port: 9511 }), /웹에서는/);
    await assert.rejects(() => api.start({ kind: "http", url: "http://127.0.0.1:9511/metrics" }), /웹에서는/);
    await assert.rejects(() => api.start({ kind: "tcp-client", host: "127.0.0.1" }), /웹에서는/);
    await assert.rejects(() => api.start({ kind: "serial", path: "COM1" }), /웹에서는/);
  });

  it("exports logs as a download name", async () => {
    const api = create();
    await api.start({ kind: "simulator", simMode: "rtos", intervalMs: 5000 });
    const name = await api.exportLogs("txt");
    assert.equal(name, "mmon-logs.txt");
  });

  it("persists settings", async () => {
    const api = create();
    const next = await api.settingsSet({ language: "en", theme: "snow", intervalMs: 500 });
    assert.equal(next.language, "en");
    const loaded = await api.settingsGet();
    assert.equal(loaded.theme, "snow");
    assert.equal(loaded.intervalMs, 500);
  });

  it("opens settings as a separate window", async () => {
    let opened = null;
    const api = createWebMonitor({
      version: "10.0.0",
      storage: { getItem: () => null, setItem: () => {} },
      download: (name) => name,
      openWindow: (url, name, features) => {
        opened = { url, name, features };
        return { focus() {} };
      }
    });
    monitors.push(api);
    const result = await api.openSettings();
    assert.equal(result, "opened");
    assert.equal(opened.url, "settings.html");
    assert.equal(opened.name, "mmon-settings");
    assert.match(opened.features, /width=560/);
    assert.match(opened.features, /scrollbars=no/);
    assert.match(opened.features, /resizable=no/);
  });
});

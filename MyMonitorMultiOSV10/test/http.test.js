"use strict";

const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { parseHttpPayload, normalizeHttpUrl } = require("../app/lib/protocol");
const { fetchMetrics } = require("../app/lib/http-client");
const { ConnectionManager } = require("../app/lib/connection-manager");

function once(ee, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    ee.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function listenJson(payload, port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      const body = typeof payload === "function" ? payload() : payload;
      const text = typeof body === "string" ? body : JSON.stringify(body);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(text);
    });
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}/metrics` });
    });
  });
}

function waitListening(mgr, id, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout listen")), timeoutMs);
    const check = () => {
      const row = mgr.targets.get(id);
      if (row && row.server && row.port) {
        clearTimeout(timer);
        mgr.off("targets", check);
        resolve(row);
      }
    };
    mgr.on("targets", check);
    check();
  });
}

function postJson(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/metrics",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

describe("HTTP payload parser", () => {
  it("fills /metrics when the path is missing", () => {
    assert.equal(normalizeHttpUrl("127.0.0.1:9511"), "https://127.0.0.1:9511/metrics");
    assert.match(normalizeHttpUrl(""), /https:\/\/127\.0\.0\.1:9511\/metrics/);
  });

  it("parses nested JSON metrics and hello", () => {
    const parsed = parseHttpPayload(
      JSON.stringify({
        hello: { hostname: "box", os_type: 2, os_name: "windows" },
        metrics: { cpu: 11, ram_used: 10, ram_total: 20 }
      }),
      "application/json"
    );
    assert.equal(parsed.kind, "metrics");
    assert.equal(parsed.metrics.cpu, 11);
    assert.equal(parsed.hello.hostname, "box");
    assert.equal(parsed.hello.osType, 2);
  });

  it("parses a flat JSON body from the agent", () => {
    const parsed = parseHttpPayload(
      JSON.stringify({ ts: 9, hostname: "n1", os_type: 1, cpu: 4, ram_used: 1, ram_total: 2 }),
      "application/json"
    );
    assert.equal(parsed.metrics.ramTotal, 2);
    assert.equal(parsed.hello.hostname, "n1");
  });
});

describe("HTTP connection", () => {
  const servers = [];
  const managers = [];

  afterEach(async () => {
    while (managers.length) managers.pop().stopAll();
    while (servers.length) {
      const server = servers.pop();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("polls an HTTP JSON endpoint", async () => {
    const { server, url } = await listenJson({ cpu: 22, ram_used: 100, ram_total: 400, hostname: "web-box", os_type: 1 });
    servers.push(server);
    const sample = await fetchMetrics(url);
    assert.equal(sample.metrics.cpu, 22);
    assert.equal(sample.hello.hostname, "web-box");
  });

  it("accepts an agent JSON push on ConnectionManager", async () => {
    const mgr = new ConnectionManager();
    managers.push(mgr);
    const id = mgr.startHttps({ host: "127.0.0.1", port: 0, name: "https-box" });
    const row = await waitListening(mgr, id);
    const wait = once(mgr, "metrics");
    await postJson(row.port, { cpu: 7, ram_used: 3, ram_total: 9, hostname: "push-box" });
    const sample = await wait;
    assert.equal(sample.metrics.cpu, 7);
    assert.equal(sample.hello.hostname, "push-box");
    const peer = mgr.snapshot().find((t) => t.kind === "https-peer");
    assert.ok(peer);
    assert.equal(sample.targetId, peer.id);
    assert.equal(row.kind, "https");
  });
});

"use strict";

const http = require("http");
const https = require("https");
const { normalizeHttpUrl, parseHttpPayload } = require("./protocol");

function httpGet(urlString, timeoutMs = 4000) {
  const href = normalizeHttpUrl(urlString);
  const u = new URL(href);
  const lib = u.protocol === "https:" ? https : http;
  const timeout = Math.max(200, Number(timeoutMs) || 4000);
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: "GET",
        timeout,
        headers: {
          Accept: "application/json, text/plain, */*",
          Connection: "close",
          "User-Agent": "MyMonitorMultiOS/10"
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            url: href,
            status: res.statusCode || 0,
            contentType: String(res.headers["content-type"] || ""),
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("HTTP timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchMetrics(urlString, timeoutMs) {
  const res = await httpGet(urlString, timeoutMs);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}`);
  }
  const parsed = parseHttpPayload(res.body, res.contentType);
  if (!parsed) throw new Error("HTTP 응답에서 메트릭을 읽지 못했습니다");
  return { ...parsed, url: res.url };
}

module.exports = { httpGet, fetchMetrics, normalizeHttpUrl };

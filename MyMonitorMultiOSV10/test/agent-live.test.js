"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { Decoder, TYPE, parseHello, parseMetrics } = require("../app/lib/protocol");

const exe = path.join(__dirname, "../agent/dist/windows/mmon-agent.exe");
const hasExe = fs.existsSync(exe);
const PORT = 9518;

describe("Windows agent live MMON session", { skip: !hasExe }, () => {
  it("sends HELLO then METRICS to a TCP client", async () => {
    const child = spawn(exe, ["--listen", `127.0.0.1:${PORT}`, "--interval", "200"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("agent did not listen")), 4000);
      const onExit = (code) => {
        clearTimeout(timer);
        reject(new Error(`agent exited ${code}`));
      };
      child.once("exit", onExit);
      child.stdout.on("data", (buf) => {
        if (String(buf).includes("listening")) {
          clearTimeout(timer);
          child.off("exit", onExit);
          resolve();
        }
      });
    });

    try {
      await ready;
      const { hello, metrics } = await new Promise((resolve, reject) => {
        const dec = new Decoder();
        const socket = net.connect({ host: "127.0.0.1", port: PORT });
        let hello;
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error("no metrics from agent"));
        }, 4000);
        socket.on("data", (buf) => {
          for (const frame of dec.push(buf)) {
            if (frame.type === TYPE.HELLO) hello = parseHello(frame.payload);
            if (frame.type === TYPE.METRICS) {
              clearTimeout(timer);
              const parsed = parseMetrics(frame.payload);
              socket.end();
              resolve({ hello, metrics: parsed.metrics });
            }
          }
        });
        socket.on("error", reject);
      });

      assert.ok(hello);
      assert.equal(hello.osType, 2);
      assert.equal(hello.osName, "windows");
      assert.ok(hello.hostname.length > 0);
      assert.ok(metrics.ramTotal > 0);
      assert.ok(metrics.diskTotal > 0);
      assert.ok(Number.isFinite(metrics.cpu));
    } finally {
      child.kill();
    }
  });
});

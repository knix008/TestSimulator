"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const exe = path.join(__dirname, "../agent/dist/windows/mmon-agent.exe");
const hasExe = fs.existsSync(exe);

describe("Windows agent CLI", { skip: !hasExe }, () => {
  it("prints usage on --help", () => {
    const bin = fs.readFileSync(exe);
    assert.ok(bin.includes(Buffer.from("--push")), "rebuild the agent so the exe includes --push");
    const res = spawnSync(exe, ["--help"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 1024 * 1024
    });
    assert.equal(res.status, 0);
    const text = `${res.stderr || ""}\n${res.stdout || ""}`;
    assert.match(text, /--listen/);
    assert.match(text, /--connect/);
    assert.match(text, /--push/);
    assert.match(text, /--http/);
    assert.match(text, /9510/);
    assert.match(text, /9511/);
  });

  it("rejects unknown flags", () => {
    const res = spawnSync(exe, ["--not-a-flag"], { encoding: "utf8" });
    assert.notEqual(res.status, 0);
  });

  it("rejects listen and connect together", () => {
    const res = spawnSync(exe, ["--listen", "127.0.0.1:9510", "--connect", "127.0.0.1:9510"], {
      encoding: "utf8"
    });
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /choose (one of|either) --listen/);
  });
});

describe("agent sources", () => {
  it("Windows platform collects cpu ram disk net", () => {
    const src = fs.readFileSync(path.join(__dirname, "../agent/src/platform_win.c"), "utf8");
    assert.match(src, /GetSystemTimes/);
    assert.match(src, /GlobalMemoryStatusEx/);
    assert.match(src, /GetDiskFreeSpaceExA/);
    assert.match(src, /GetIfTable2/);
    assert.match(src, /EnumProcesses/);
    assert.match(src, /MMON_OS_WINDOWS/);
  });

  it("service module can install and run", () => {
    const src = fs.readFileSync(path.join(__dirname, "../agent/src/win_service.c"), "utf8");
    assert.match(src, /CreateServiceA/);
    assert.match(src, /StartServiceCtrlDispatcherA/);
    assert.match(src, /MyMonitorAgent/);
  });

  it("RTOS port has no malloc in the session core", () => {
    const src = fs.readFileSync(path.join(__dirname, "../agent/rtos/mmon_rtos.c"), "utf8");
    assert.doesNotMatch(src, /malloc\s*\(/);
    assert.match(src, /mmon_rtos_tick/);
    assert.match(src, /MMON_HEAP_USED/);
    assert.match(src, /MMON_TASKS/);
  });

  it("serves JSON metrics over HTTP and can push to the monitor", () => {
    const src = fs.readFileSync(path.join(__dirname, "../agent/src/main.c"), "utf8");
    const header = fs.readFileSync(path.join(__dirname, "../agent/include/mmon.h"), "utf8");
    assert.match(src, /--http/);
    assert.match(src, /--push/);
    assert.match(src, /http_metrics_json/);
    assert.match(src, /http_post_json/);
    assert.match(src, /Access-Control-Allow-Origin/);
    assert.match(header, /MMON_DEFAULT_HTTP_PORT\s+9511/);
  });
});

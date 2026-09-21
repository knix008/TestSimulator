"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { TYPE, METRIC, OS } = require("../app/lib/protocol");

describe("protocol constants match C headers", () => {
  const header = fs.readFileSync(path.join(__dirname, "../agent/include/mmon.h"), "utf8");

  it("shares frame magic MN and version 1", () => {
    assert.match(header, /MMON_MAGIC0\s+0x4D/);
    assert.match(header, /MMON_MAGIC1\s+0x4E/);
    assert.match(header, /MMON_VERSION\s+1/);
    assert.match(header, /MMON_HELLO_SIZE\s+48/);
    assert.match(header, /MMON_METRIC_SIZE\s+12/);
    assert.match(header, /MMON_DEFAULT_PORT\s+9510/);
    assert.match(header, /MMON_DEFAULT_HTTP_PORT\s+9511/);
  });

  it("shares message type numbers", () => {
    const expected = {
      HELLO: 0x01,
      HELLO_ACK: 0x02,
      HEARTBEAT: 0x03,
      METRICS: 0x04,
      LOG: 0x05,
      SUBSCRIBE: 0x06,
      ERROR: 0x07,
      DISCONNECT: 0x08
    };
    assert.deepEqual(TYPE, expected);
    for (const [name, value] of Object.entries(expected)) {
      assert.match(header, new RegExp(`MMON_${name}\\s+=\\s+0x0${value}`));
    }
  });

  it("shares metric ids 1-18", () => {
    assert.equal(METRIC.CPU_PCT, 1);
    assert.equal(METRIC.TASKS, 18);
    assert.match(header, /MMON_CPU_PCT\s+=\s+1/);
    assert.match(header, /MMON_TASKS\s+=\s+18/);
  });

  it("shares os type numbers", () => {
    assert.equal(OS[1], "linux");
    assert.equal(OS[2], "windows");
    assert.equal(OS[4], "rtos");
    assert.match(header, /MMON_OS_WINDOWS\s+=\s+2/);
    assert.match(header, /MMON_OS_RTOS\s+=\s+4/);
  });

  it("docs mention the same default port", () => {
    const doc = fs.readFileSync(path.join(__dirname, "../docs/protocol.md"), "utf8");
    assert.match(doc, /9510/);
    assert.match(doc, /9511/);
    assert.match(doc, /CRC-16\/CCITT-FALSE/);
    assert.match(doc, /CPU_PCT/);
  });
});

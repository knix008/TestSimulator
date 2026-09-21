"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Decoder, parseLog, encodeHeartbeat, TYPE } = require("../app/lib/protocol");
const { encodeLogFrame } = require("./helpers");

describe("LOG and control frames", () => {
  it("parses debug/info/warn/error levels", () => {
    const levels = ["debug", "info", "warn", "error"];
    levels.forEach((name, level) => {
      const buf = encodeLogFrame(1, level, 123, `msg-${name}`);
      const parsed = parseLog(new Decoder().push(buf)[0].payload);
      assert.equal(parsed.level, name);
      assert.equal(parsed.ts, 123);
      assert.equal(parsed.message, `msg-${name}`);
    });
  });

  it("defaults unknown level to info", () => {
    const buf = encodeLogFrame(1, 9, 1, "x");
    assert.equal(parseLog(new Decoder().push(buf)[0].payload).level, "info");
  });

  it("keeps utf-8 log text", () => {
    const buf = encodeLogFrame(1, 1, 1, "에이전트 시작");
    assert.equal(parseLog(new Decoder().push(buf)[0].payload).message, "에이전트 시작");
  });

  it("returns null for short log payloads", () => {
    assert.equal(parseLog(null), null);
    assert.equal(parseLog(Buffer.alloc(8)), null);
  });

  it("encodes heartbeat with empty payload", () => {
    const [frame] = new Decoder().push(encodeHeartbeat(11));
    assert.equal(frame.type, TYPE.HEARTBEAT);
    assert.equal(frame.seq, 11);
    assert.equal(frame.payload.length, 0);
  });
});

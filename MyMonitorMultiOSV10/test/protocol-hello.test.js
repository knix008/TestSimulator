"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { TYPE, OS, Decoder, encodeHello, parseHello, encode } = require("../app/lib/protocol");

describe("HELLO frames", () => {
  it("encodes and parses a Windows hello", () => {
    const buf = encodeHello(7, {
      agentId: "WINHOST",
      osType: 2,
      caps: 0x1f,
      intervalMs: 500,
      hostname: "WINHOST"
    });
    const [frame] = new Decoder().push(buf);
    assert.equal(frame.type, TYPE.HELLO);
    assert.equal(frame.seq, 7);
    const hello = parseHello(frame.payload);
    assert.equal(hello.osType, 2);
    assert.equal(hello.osName, "windows");
    assert.equal(hello.caps, 0x1f);
    assert.equal(hello.intervalMs, 500);
    assert.equal(hello.hostname, "WINHOST");
    assert.equal(hello.agentId, "WINHOST");
  });

  it("parses linux, macos, rtos and electron os names", () => {
    for (const [osType, name] of [
      [1, "linux"],
      [3, "macos"],
      [4, "rtos"],
      [5, "electron-local"]
    ]) {
      const buf = encodeHello(1, { osType, hostname: name, agentId: name, caps: 1, intervalMs: 1000 });
      const hello = parseHello(new Decoder().push(buf)[0].payload);
      assert.equal(hello.osName, name);
      assert.equal(OS[osType], name);
    }
  });

  it("returns unknown for an undocumented os type", () => {
    const buf = encodeHello(1, { osType: 99, hostname: "x", agentId: "x" });
    const hello = parseHello(new Decoder().push(buf)[0].payload);
    assert.equal(hello.osName, "unknown");
  });

  it("rejects short hello payloads", () => {
    assert.equal(parseHello(null), null);
    assert.equal(parseHello(Buffer.alloc(10)), null);
    assert.equal(parseHello(Buffer.alloc(47)), null);
  });

  it("truncates hostname to 32 bytes", () => {
    const long = "n".repeat(80);
    const buf = encodeHello(1, { hostname: long, agentId: "id", osType: 1 });
    const hello = parseHello(new Decoder().push(buf)[0].payload);
    assert.ok(hello.hostname.length <= 32);
  });

  it("hello payload is always 48 bytes", () => {
    const buf = encodeHello(1, { hostname: "a", agentId: "b", osType: 4 });
    const [frame] = new Decoder().push(buf);
    assert.equal(frame.payload.length, 48);
  });

  it("round-trips empty hostname and agent id", () => {
    const buf = encodeHello(1, {});
    const hello = parseHello(new Decoder().push(buf)[0].payload);
    assert.equal(hello.hostname, "");
    assert.equal(hello.osType, 5);
    assert.equal(hello.intervalMs, 1000);
  });

  it("HELLO_ACK uses the same payload layout", () => {
    const hello = encodeHello(3, { hostname: "ack", agentId: "ack", osType: 1, caps: 3, intervalMs: 250 });
    const payload = new Decoder().push(hello)[0].payload;
    const ack = encode(TYPE.HELLO_ACK, 4, payload);
    const [frame] = new Decoder().push(ack);
    assert.equal(frame.type, TYPE.HELLO_ACK);
    assert.equal(parseHello(frame.payload).hostname, "ack");
    assert.equal(parseHello(frame.payload).intervalMs, 250);
  });
});

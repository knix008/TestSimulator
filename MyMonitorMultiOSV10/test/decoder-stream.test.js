"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Decoder, encodeHello, encodeHeartbeat, crc16, encode, TYPE } = require("../app/lib/protocol");

describe("Decoder stream reassembly", () => {
  it("reassembles a frame split across two chunks", () => {
    const full = encodeHeartbeat(1);
    const dec = new Decoder();
    assert.equal(dec.push(full.subarray(0, 4)).length, 0);
    const frames = dec.push(full.subarray(4));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, TYPE.HEARTBEAT);
  });

  it("decodes two frames concatenated in one chunk", () => {
    const a = encodeHeartbeat(1);
    const b = encodeHeartbeat(2);
    const frames = new Decoder().push(Buffer.concat([a, b]));
    assert.equal(frames.length, 2);
    assert.equal(frames[0].seq, 1);
    assert.equal(frames[1].seq, 2);
  });

  it("skips leading garbage before magic", () => {
    const hello = encodeHello(1, { hostname: "g", agentId: "g", osType: 1 });
    const junk = Buffer.from([0x00, 0x11, 0x22, 0x4d, 0x00]);
    const frames = new Decoder().push(Buffer.concat([junk, hello]));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, TYPE.HELLO);
  });

  it("drops a frame with a bad crc", () => {
    const buf = Buffer.from(encodeHeartbeat(1));
    buf[buf.length - 1] ^= 0xff;
    assert.equal(new Decoder().push(buf).length, 0);
  });

  it("drops an unsupported version", () => {
    const buf = Buffer.from(encodeHeartbeat(1));
    buf[2] = 9;
    assert.equal(new Decoder().push(buf).length, 0);
  });

  it("crc16 is stable for the same bytes", () => {
    const data = Buffer.from("MN\x01\x03");
    assert.equal(crc16(data), crc16(data));
    assert.notEqual(crc16(data), crc16(Buffer.from("xx")));
  });

  it("crc covers header and payload only", () => {
    const buf = encode(TYPE.ERROR, 1, Buffer.from("ab"));
    const bodyLen = 8 + 2;
    const stored = buf[bodyLen] | (buf[bodyLen + 1] << 8);
    assert.equal(stored, crc16(buf, 0, bodyLen));
  });

  it("keeps leftover bytes when the frame is incomplete", () => {
    const full = encodeHello(1, { hostname: "z", agentId: "z", osType: 4 });
    const dec = new Decoder();
    dec.push(full.subarray(0, 20));
    assert.ok(dec.buf.length > 0);
    assert.equal(dec.push(full.subarray(20)).length, 1);
    assert.equal(dec.buf.length, 0);
  });

  it("accepts an empty push", () => {
    assert.deepEqual(new Decoder().push(Buffer.alloc(0)), []);
  });
});

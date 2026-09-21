"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Decoder, encodeSubscribe, encode, TYPE } = require("../app/lib/protocol");

describe("SUBSCRIBE frames", () => {
  it("encodes interval and enable flag", () => {
    const [frame] = new Decoder().push(encodeSubscribe(2, 1500, 1));
    assert.equal(frame.type, TYPE.SUBSCRIBE);
    assert.equal(frame.seq, 2);
    assert.equal(frame.payload.length, 4);
    const interval = frame.payload[0] | (frame.payload[1] << 8);
    assert.equal(interval, 1500);
    assert.equal(frame.payload[2], 1);
  });

  it("encodes disable as 0", () => {
    const [frame] = new Decoder().push(encodeSubscribe(1, 0, 0));
    assert.equal(frame.payload[2], 0);
  });

  it("treats missing interval as 0", () => {
    const [frame] = new Decoder().push(encodeSubscribe(1, undefined, 1));
    const interval = frame.payload[0] | (frame.payload[1] << 8);
    assert.equal(interval, 0);
  });

  it("DISCONNECT is a typed empty frame", () => {
    const [frame] = new Decoder().push(encode(TYPE.DISCONNECT, 9, null));
    assert.equal(frame.type, TYPE.DISCONNECT);
    assert.equal(frame.payload.length, 0);
  });

  it("ERROR is a typed frame", () => {
    const [frame] = new Decoder().push(encode(TYPE.ERROR, 1, Buffer.from("fail")));
    assert.equal(frame.type, TYPE.ERROR);
    assert.equal(frame.payload.toString(), "fail");
  });
});

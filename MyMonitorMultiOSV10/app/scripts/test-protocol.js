"use strict";

const assert = require("assert");
const {
  TYPE,
  Decoder,
  encodeHello,
  encodeSubscribe,
  parseHello,
  parseMetrics
} = require("../lib/protocol");

const helloBuf = encodeHello(1, {
  agentId: "agent-1",
  osType: 4,
  caps: 0x53,
  intervalMs: 1000,
  hostname: "rtos-node"
});

const dec = new Decoder();
const frames = dec.push(helloBuf);
assert.strictEqual(frames.length, 1);
assert.strictEqual(frames[0].type, TYPE.HELLO);
const hello = parseHello(frames[0].payload);
assert.strictEqual(hello.hostname, "rtos-node");
assert.strictEqual(hello.osType, 4);

const sub = encodeSubscribe(2, 500, 1);
assert.ok(sub.length >= 10);

assert.strictEqual(parseMetrics(Buffer.alloc(8)), null);

console.log("protocol self-test ok");

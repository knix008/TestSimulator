"use strict";

const path = require("path");
const {
  encode,
  TYPE,
  METRIC
} = require("../app/lib/protocol");

const ROOT = path.join(__dirname, "..");
const TMP = path.join(__dirname, ".tmp");

function putU16(buf, off, v) {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
}

function putU64(buf, off, v) {
  let n = BigInt(v);
  for (let i = 0; i < 8; i++) {
    buf[off + i] = Number(n & 0xffn);
    n >>= 8n;
  }
}

function putF32(buf, off, v) {
  const tmp = Buffer.alloc(4);
  tmp.writeFloatLE(v, 0);
  tmp.copy(buf, off);
}

function encodeMetricsFrame(seq, ts, items) {
  const payload = Buffer.alloc(12 + items.length * 12);
  putU64(payload, 0, ts);
  payload[8] = items.length;
  items.forEach((it, i) => {
    const off = 12 + i * 12;
    payload[off] = it.id;
    payload[off + 1] = it.vtype;
    if (it.vtype === 1) putF32(payload, off + 4, it.value);
    else putU64(payload, off + 4, it.value);
  });
  return encode(TYPE.METRICS, seq, payload);
}

function encodeLogFrame(seq, level, ts, message) {
  const msg = Buffer.from(message, "utf8");
  const payload = Buffer.alloc(12 + msg.length);
  payload[0] = level;
  putU64(payload, 4, ts);
  msg.copy(payload, 12);
  return encode(TYPE.LOG, seq, payload);
}

function sampleServerMetrics(ts = Date.now()) {
  return encodeMetricsFrame(1, ts, [
    { id: METRIC.CPU_PCT, vtype: 1, value: 33.5 },
    { id: METRIC.RAM_USED, vtype: 2, value: 4 * 1024 * 1024 * 1024 },
    { id: METRIC.RAM_TOTAL, vtype: 2, value: 8 * 1024 * 1024 * 1024 },
    { id: METRIC.DISK_USED, vtype: 2, value: 100 },
    { id: METRIC.DISK_TOTAL, vtype: 2, value: 200 },
    { id: METRIC.LOAD1, vtype: 1, value: 0.75 },
    { id: METRIC.LOAD5, vtype: 1, value: 0.5 },
    { id: METRIC.LOAD15, vtype: 1, value: 0.25 },
    { id: METRIC.NET_RX_RATE, vtype: 1, value: 1200.5 },
    { id: METRIC.NET_TX_RATE, vtype: 1, value: 800 },
    { id: METRIC.UPTIME, vtype: 2, value: 3600 },
    { id: METRIC.PROCS, vtype: 2, value: 142 }
  ]);
}

function sampleRtosMetrics(ts = Date.now()) {
  return encodeMetricsFrame(2, ts, [
    { id: METRIC.CPU_PCT, vtype: 1, value: 18.25 },
    { id: METRIC.HEAP_USED, vtype: 2, value: 48 * 1024 },
    { id: METRIC.HEAP_TOTAL, vtype: 2, value: 128 * 1024 },
    { id: METRIC.TASKS, vtype: 2, value: 7 },
    { id: METRIC.TEMP, vtype: 1, value: 41.5 },
    { id: METRIC.NET_RX_RATE, vtype: 1, value: 400 },
    { id: METRIC.NET_TX_RATE, vtype: 1, value: 80 }
  ]);
}

module.exports = {
  ROOT,
  TMP,
  encodeMetricsFrame,
  encodeLogFrame,
  sampleServerMetrics,
  sampleRtosMetrics,
  METRIC,
  TYPE
};

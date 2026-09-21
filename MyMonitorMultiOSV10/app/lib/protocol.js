"use strict";

const MAGIC0 = 0x4d;
const MAGIC1 = 0x4e;
const VERSION = 1;
const HDR = 8;
const MAX_PAYLOAD = 1024 - 10;

const TYPE = {
  HELLO: 0x01,
  HELLO_ACK: 0x02,
  HEARTBEAT: 0x03,
  METRICS: 0x04,
  LOG: 0x05,
  SUBSCRIBE: 0x06,
  ERROR: 0x07,
  DISCONNECT: 0x08
};

const OS = {
  1: "linux",
  2: "windows",
  3: "macos",
  4: "rtos",
  5: "electron-local"
};

const METRIC = {
  CPU_PCT: 1,
  RAM_USED: 2,
  RAM_TOTAL: 3,
  DISK_USED: 4,
  DISK_TOTAL: 5,
  LOAD1: 6,
  LOAD5: 7,
  LOAD15: 8,
  NET_RX: 9,
  NET_TX: 10,
  NET_RX_RATE: 11,
  NET_TX_RATE: 12,
  UPTIME: 13,
  PROCS: 14,
  TEMP: 15,
  HEAP_USED: 16,
  HEAP_TOTAL: 17,
  TASKS: 18
};

const METRIC_KEY = {
  1: "cpu",
  2: "ramUsed",
  3: "ramTotal",
  4: "diskUsed",
  5: "diskTotal",
  6: "load1",
  7: "load5",
  8: "load15",
  9: "netRx",
  10: "netTx",
  11: "netRxRate",
  12: "netTxRate",
  13: "uptime",
  14: "procs",
  15: "temp",
  16: "heapUsed",
  17: "heapTotal",
  18: "tasks"
};

function crc16(buf, start = 0, len = buf.length - start) {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) {
    crc ^= buf[start + i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function putU16(buf, off, v) {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
}

function getU16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function putU64(buf, off, v) {
  const big = BigInt(v);
  for (let i = 0; i < 8; i++) {
    buf[off + i] = Number((big >> BigInt(8 * i)) & 0xffn);
  }
}

function getU64(buf, off) {
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(buf[off + i]) << BigInt(8 * i);
  }
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : n;
}

function putF32(buf, off, v) {
  const tmp = Buffer.alloc(4);
  tmp.writeFloatLE(v, 0);
  tmp.copy(buf, off);
}

function getF32(buf, off) {
  return Buffer.from(buf.subarray(off, off + 4)).readFloatLE(0);
}

function encode(type, seq, payload) {
  const payloadLen = payload ? payload.length : 0;
  const out = Buffer.alloc(HDR + payloadLen + 2);
  out[0] = MAGIC0;
  out[1] = MAGIC1;
  out[2] = VERSION;
  out[3] = type;
  putU16(out, 4, seq);
  putU16(out, 6, payloadLen);
  if (payloadLen) payload.copy(out, HDR);
  putU16(out, HDR + payloadLen, crc16(out, 0, HDR + payloadLen));
  return out;
}

function encodeHello(seq, hello) {
  const p = Buffer.alloc(48);
  Buffer.from(hello.agentId || "").copy(p, 0, 0, 16);
  p[16] = hello.osType || 5;
  p[17] = hello.caps || 0;
  putU16(p, 18, hello.intervalMs || 1000);
  Buffer.from(hello.hostname || "").copy(p, 20, 0, 32);
  return encode(TYPE.HELLO, seq, p);
}

function encodeSubscribe(seq, intervalMs, enable) {
  const p = Buffer.alloc(4);
  putU16(p, 0, intervalMs || 0);
  p[2] = enable ? 1 : 0;
  return encode(TYPE.SUBSCRIBE, seq, p);
}

function encodeHeartbeat(seq) {
  return encode(TYPE.HEARTBEAT, seq, null);
}

function parseHello(payload) {
  if (!payload || payload.length < 48) return null;
  return {
    agentId: payload.subarray(0, 16).toString("utf8").replace(/\0/g, ""),
    osType: payload[16],
    osName: OS[payload[16]] || "unknown",
    caps: payload[17],
    intervalMs: getU16(payload, 18),
    hostname: payload.subarray(20, 52).toString("utf8").replace(/\0/g, "")
  };
}

function parseMetrics(payload) {
  if (!payload || payload.length < 12) return null;
  const ts = getU64(payload, 0);
  const count = payload[8];
  const metrics = {};
  let off = 12;
  for (let i = 0; i < count && off + 12 <= payload.length; i++) {
    const id = payload[off];
    const vtype = payload[off + 1];
    const key = METRIC_KEY[id];
    if (key) {
      metrics[key] = vtype === 1 ? getF32(payload, off + 4) : getU64(payload, off + 4);
    }
    off += 12;
  }
  return { ts, metrics };
}

function parseLog(payload) {
  if (!payload || payload.length < 12) return null;
  const levels = ["debug", "info", "warn", "error"];
  return {
    level: levels[payload[0]] || "info",
    ts: getU64(payload, 4),
    message: payload.subarray(12).toString("utf8")
  };
}

class Decoder {
  constructor() {
    this.buf = Buffer.alloc(0);
  }

  push(chunk) {
    this.buf = Buffer.concat([this.buf, Buffer.from(chunk)]);
    const frames = [];
    while (this.buf.length >= HDR) {
      if (this.buf[0] !== MAGIC0 || this.buf[1] !== MAGIC1) {
        const idx = this.buf.indexOf(MAGIC0, 1);
        this.buf = idx >= 0 ? this.buf.subarray(idx) : Buffer.alloc(0);
        continue;
      }
      if (this.buf[2] !== VERSION) {
        this.buf = this.buf.subarray(1);
        continue;
      }
      const payloadLen = getU16(this.buf, 6);
      if (payloadLen > MAX_PAYLOAD) {
        this.buf = this.buf.subarray(1);
        continue;
      }
      const total = HDR + payloadLen + 2;
      if (this.buf.length < total) break;
      const exp = crc16(this.buf, 0, HDR + payloadLen);
      const got = getU16(this.buf, HDR + payloadLen);
      if (exp !== got) {
        this.buf = this.buf.subarray(1);
        continue;
      }
      frames.push({
        type: this.buf[3],
        seq: getU16(this.buf, 4),
        payload: Buffer.from(this.buf.subarray(HDR, HDR + payloadLen))
      });
      this.buf = this.buf.subarray(total);
    }
    return frames;
  }
}

function parseTextLine(line) {
  const s = String(line).trim();
  if (!s) return null;
  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s);
      if (obj.t === "log") {
        return { kind: "log", level: obj.level || "info", message: obj.msg || obj.message || "" };
      }
      const metrics = {
        cpu: num(obj.cpu),
        ramUsed: num(obj.ram_used ?? obj.ramUsed),
        ramTotal: num(obj.ram_total ?? obj.ramTotal),
        diskUsed: num(obj.disk_used ?? obj.diskUsed),
        diskTotal: num(obj.disk_total ?? obj.diskTotal),
        load1: num(obj.load1),
        load5: num(obj.load5),
        load15: num(obj.load15),
        netRxRate: num(obj.net_rx_rate ?? obj.netRxRate),
        netTxRate: num(obj.net_tx_rate ?? obj.netTxRate),
        temp: num(obj.temp),
        heapUsed: num(obj.heap_used ?? obj.heapUsed),
        heapTotal: num(obj.heap_total ?? obj.heapTotal),
        tasks: num(obj.tasks),
        uptime: num(obj.uptime),
        procs: num(obj.procs)
      };
      return { kind: "metrics", ts: obj.ts || Date.now(), metrics: compact(metrics) };
    } catch {
      return null;
    }
  }
  if (s.includes("=")) {
    const metrics = {};
    for (const part of s.split(/\s+/)) {
      const eq = part.indexOf("=");
      if (eq < 1) continue;
      const k = part.slice(0, eq);
      const v = Number(part.slice(eq + 1));
      if (Number.isNaN(v)) continue;
      const map = {
        cpu: "cpu",
        ram_used: "ramUsed",
        ram_total: "ramTotal",
        disk_used: "diskUsed",
        disk_total: "diskTotal",
        load1: "load1",
        net_rx_rate: "netRxRate",
        net_tx_rate: "netTxRate",
        heap_used: "heapUsed",
        heap_total: "heapTotal",
        tasks: "tasks",
        temp: "temp"
      };
      if (map[k]) metrics[map[k]] = v;
    }
    return Object.keys(metrics).length ? { kind: "metrics", ts: Date.now(), metrics } : null;
  }
  return null;
}

function num(v) {
  return v === undefined || v === null || v === "" ? undefined : Number(v);
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && !Number.isNaN(v)) out[k] = v;
  }
  return out;
}

function asUtf8(body) {
  if (typeof body === "string") return body;
  if (body == null) return "";
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) return body.toString("utf8");
  if (body instanceof Uint8Array) {
    if (typeof TextDecoder === "function") return new TextDecoder("utf8").decode(body);
    return String.fromCharCode(...body);
  }
  return String(body);
}

function asBytes(body) {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return body;
  if (typeof body === "string") {
    if (typeof Buffer !== "undefined") return Buffer.from(body);
    return new TextEncoder().encode(body);
  }
  return typeof Buffer !== "undefined" ? Buffer.alloc(0) : new Uint8Array(0);
}

function helloFrom(obj) {
  if (!obj || typeof obj !== "object") return null;
  const src = obj.hello && typeof obj.hello === "object" ? obj.hello : obj;
  const osType = num(src.osType ?? src.os_type);
  const hostname = src.hostname;
  const osName = src.osName || src.os_name || (osType != null ? OS[osType] : undefined);
  if (!hostname && osType == null && !osName) return null;
  return compact({ hostname, osType, osName, caps: num(src.caps) });
}

function normalizeHttpUrl(raw, defaultPort = 9511) {
  let s = String(raw || "").trim();
  if (!s) s = `https://127.0.0.1:${defaultPort}/metrics`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!u.pathname || u.pathname === "/") u.pathname = "/metrics";
  return u.toString();
}

function parseHttpPayload(body, contentType) {
  const type = String(contentType || "").toLowerCase();
  const text = asUtf8(body).replace(/^\uFEFF/, "").trim();
  if (text.startsWith("{") || type.includes("json")) {
    try {
      const obj = JSON.parse(text);
      const hello = helloFrom(obj);
      if (obj.t === "log" || obj.type === "log") {
        return { kind: "log", level: obj.level || "info", message: obj.msg || obj.message || "", hello };
      }
      const src = obj.metrics && typeof obj.metrics === "object" && !Array.isArray(obj.metrics)
        ? { ...obj, ...obj.metrics }
        : obj;
      const parsed = parseTextLine(JSON.stringify(src));
      if (parsed) return { ...parsed, hello: hello || parsed.hello };
    } catch {
      /* fall through */
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseTextLine(line);
    if (parsed) return parsed;
  }
  const bytes = asBytes(body);
  if (bytes.length >= 10 && bytes[0] === MAGIC0 && bytes[1] === MAGIC1) {
    const dec = new Decoder();
    const frames = dec.push(bytes);
    let hello = null;
    for (const fr of frames) {
      if (fr.type === TYPE.HELLO || fr.type === TYPE.HELLO_ACK) hello = parseHello(fr.payload);
      if (fr.type === TYPE.METRICS) {
        const parsed = parseMetrics(fr.payload);
        if (parsed) return { kind: "metrics", ts: parsed.ts, metrics: parsed.metrics, hello };
      }
      if (fr.type === TYPE.LOG) {
        const parsed = parseLog(fr.payload);
        if (parsed) return { kind: "log", level: parsed.level, message: parsed.message, hello };
      }
    }
    if (hello) return { kind: "hello", hello };
  }
  return null;
}

module.exports = {
  TYPE,
  OS,
  METRIC,
  METRIC_KEY,
  Decoder,
  encode,
  encodeHello,
  encodeSubscribe,
  encodeHeartbeat,
  parseHello,
  parseMetrics,
  parseLog,
  parseTextLine,
  parseHttpPayload,
  normalizeHttpUrl,
  crc16
};

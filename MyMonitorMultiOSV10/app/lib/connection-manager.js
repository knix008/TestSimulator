"use strict";

const net = require("net");
const { EventEmitter } = require("events");
const {
  TYPE,
  Decoder,
  encodeSubscribe,
  encodeHeartbeat,
  parseHello,
  parseMetrics,
  parseLog,
  parseTextLine
} = require("./protocol");
const { BackgroundSampler } = require("./background-sampler");
const { listenIngest } = require("./https-ingest");

let SerialPort = null;
try {
  ({ SerialPort } = require("serialport"));
} catch {
  SerialPort = null;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

class ConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.targets = new Map();
    this.defaultIntervalMs = 1000;
    this.sampler = new BackgroundSampler();
    this.sampler.on("sample", (msg) => this.onSample(msg));
    this.sampler.on("job-error", (msg) => {
      const target = this.targets.get(msg.id);
      if (target) this.log(target, "error", msg.message);
    });
  }

  onSample(msg) {
    const target = this.targets.get(msg.id);
    if (!target || !msg.sample) return;
    target.lastTs = msg.sample.ts;
    if (msg.sample.hello) target.hello = { ...target.hello, ...msg.sample.hello };
    this.emit("metrics", {
      targetId: target.id,
      ts: msg.sample.ts,
      metrics: msg.sample.metrics,
      hello: target.hello
    });
  }

  setIntervalMs(ms) {
    const interval = Math.max(200, Math.min(10000, Number(ms) || 1000));
    this.defaultIntervalMs = interval;
    this.sampler.setAllInterval(interval);
    for (const target of this.targets.values()) {
      target.intervalMs = interval;
      if (target.timer && typeof target.tick === "function") {
        clearTimeout(target.timer);
        clearInterval(target.timer);
        target.timer = setInterval(target.tick, interval);
      }
      const frame = encodeSubscribe(target.seq++ || 1, interval, 1);
      try {
        if (target.socket) target.socket.write(frame);
        if (target.port) target.port.write(frame);
      } catch {
        /* ignore */
      }
    }
    return interval;
  }

  snapshot() {
    return [...this.targets.values()].map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      protocol: t.protocol,
      status: t.status,
      detail: t.detail,
      hello: t.hello || null,
      lastTs: t.lastTs || 0
    }));
  }

  emitTargets() {
    this.emit("targets", this.snapshot());
  }

  log(target, level, message) {
    this.emit("log", {
      ts: Date.now(),
      level,
      targetId: target.id,
      targetName: target.name,
      message
    });
  }

  handleFrame(target, frame) {
    if (frame.type === TYPE.HELLO || frame.type === TYPE.HELLO_ACK) {
      target.hello = parseHello(frame.payload);
      this.emitTargets();
      this.log(target, "info", `HELLO ${target.hello?.hostname || ""} (${target.hello?.osName || "?"})`);
      return;
    }
    if (frame.type === TYPE.METRICS) {
      const parsed = parseMetrics(frame.payload);
      if (!parsed) return;
      target.lastTs = parsed.ts;
      target.status = "online";
      this.emit("metrics", { targetId: target.id, ts: parsed.ts, metrics: parsed.metrics, hello: target.hello });
      return;
    }
    if (frame.type === TYPE.LOG) {
      const parsed = parseLog(frame.payload);
      if (parsed) this.log(target, parsed.level, parsed.message);
    }
  }

  handleText(target, chunk) {
    target.lineBuf = (target.lineBuf || "") + chunk.toString("utf8");
    const parts = target.lineBuf.split(/\r?\n/);
    target.lineBuf = parts.pop() || "";
    for (const line of parts) {
      const parsed = parseTextLine(line);
      if (!parsed) continue;
      if (parsed.kind === "metrics") {
        target.lastTs = parsed.ts;
        target.status = "online";
        this.emit("metrics", { targetId: target.id, ts: parsed.ts, metrics: parsed.metrics, hello: target.hello });
      } else if (parsed.kind === "log") {
        this.log(target, parsed.level, parsed.message);
      }
    }
  }

  attachSocket(target, socket) {
    target.socket = socket;
    target.decoder = new Decoder();
    target.seq = 1;
    target.status = "online";
    this.emitTargets();
    socket.on("data", (buf) => {
      if (target.protocol === "jsonl" || target.protocol === "kv") {
        this.handleText(target, buf);
        return;
      }
      const frames = target.decoder.push(buf);
      if (frames.length) {
        for (const fr of frames) this.handleFrame(target, fr);
        return;
      }
      this.handleText(target, buf);
    });
    socket.on("error", (err) => {
      target.status = "error";
      target.detail = err.message;
      this.log(target, "error", err.message);
      this.emitTargets();
    });
    socket.on("close", () => {
      if (target.kind === "tcp-server") return;
      target.status = "offline";
      this.log(target, "warn", "연결이 종료되었습니다");
      this.emitTargets();
    });
    try {
      socket.write(encodeSubscribe(target.seq++, target.intervalMs || 1000, 1));
    } catch {
      /* ignore */
    }
  }

  startLocal(config) {
    const id = config.id || "local";
    if (this.targets.has(id)) this.stop(id);
    const target = {
      id,
      name: config.name || "로컬 Agent",
      kind: "local",
      protocol: "local",
      status: "online",
      intervalMs: config.intervalMs || this.defaultIntervalMs,
      hello: { hostname: require("os").hostname(), osName: process.platform, osType: 5, caps: 0x1f }
    };
    this.targets.set(id, target);
    this.sampler.start({ id, kind: "local", intervalMs: target.intervalMs });
    this.log(target, "info", "로컬 수집을 시작했습니다");
    this.emitTargets();
    return id;
  }

  startSimulator(config) {
    const id = config.id || uid("sim");
    const mode = config.simMode || "rtos";
    const target = {
      id,
      name: config.name || (mode === "rtos" ? "RTOS 시뮬레이터" : "서버 시뮬레이터"),
      kind: "simulator",
      protocol: "mmon",
      status: "online",
      intervalMs: config.intervalMs || this.defaultIntervalMs,
      hello: {
        hostname: mode === "rtos" ? "rtos-sim" : "server-sim",
        osName: mode === "rtos" ? "rtos" : "linux",
        osType: mode === "rtos" ? 4 : 1,
        caps: mode === "rtos" ? 0x73 : 0x1f
      }
    };
    this.targets.set(id, target);
    this.sampler.start({ id, kind: "simulator", simMode: mode, intervalMs: target.intervalMs });
    this.log(target, "info", `${target.name} 시작`);
    this.emitTargets();
    return id;
  }

  startHttps(config) {
    const id = config.id || uid("https");
    const host = config.host || "0.0.0.0";
    const parsedPort = Number(config.port);
    const port = config.port === 0 || parsedPort === 0 ? 0 : Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 9511;
    const target = {
      id,
      name: config.name || `HTTPS :${port}`,
      kind: "https",
      protocol: "https-json",
      status: "listening",
      detail: `https://${host}:${port}/metrics`,
      intervalMs: config.intervalMs || this.defaultIntervalMs,
      host,
      port,
      children: []
    };
    this.targets.set(id, target);
    this.emitTargets();
    listenIngest(
      ({ parsed, peer }) => this.onHttpsPush(id, parsed, peer),
      { host, port }
    )
      .then(({ server, port: bound }) => {
        if (!this.targets.has(id)) {
          server.close();
          return;
        }
        target.server = server;
        target.port = bound;
        target.detail = `https://${host}:${bound}/metrics`;
        this.log(target, "info", `HTTPS 수신 ${bound} — 에이전트가 POST /metrics 로 push`);
        this.emitTargets();
      })
      .catch((err) => {
        if (!this.targets.has(id)) return;
        target.status = "error";
        target.detail = err.message;
        this.log(target, "error", err.message);
        this.emitTargets();
      });
    return id;
  }

  onHttpsPush(parentId, parsed, peer) {
    const parent = this.targets.get(parentId);
    if (!parent) return;
    const key = (peer && peer.agentId) || (parsed.hello && parsed.hello.hostname) || (peer && peer.address) || "agent";
    let child = [...this.targets.values()].find((row) => row.parentId === parentId && row.agentKey === key);
    if (!child) {
      const childId = uid("peer");
      child = {
        id: childId,
        name: parsed.hello && parsed.hello.hostname ? parsed.hello.hostname : key,
        kind: "https-peer",
        protocol: "https-json",
        status: "online",
        parentId,
        agentKey: key,
        intervalMs: parent.intervalMs,
        hello: parsed.hello || null
      };
      this.targets.set(childId, child);
      this.log(child, "info", `HTTPS push ${key}`);
      this.emitTargets();
    }
    if (parsed.kind === "log") {
      this.log(child, parsed.level, parsed.message);
      return;
    }
    if (parsed.hello) child.hello = { ...child.hello, ...parsed.hello };
    if (parsed.kind === "metrics") {
      const was = child.status;
      child.lastTs = parsed.ts;
      child.status = "online";
      if (was !== "online") this.emitTargets();
      this.emit("metrics", {
        targetId: child.id,
        ts: parsed.ts,
        metrics: parsed.metrics,
        hello: child.hello
      });
    }
  }

  startTcpClient(config) {
    const id = config.id || uid("tcp");
    const target = {
      id,
      name: config.name || `${config.host}:${config.port}`,
      kind: "tcp-client",
      protocol: config.protocol || "mmon",
      status: "connecting",
      detail: `${config.host}:${config.port}`,
      intervalMs: config.intervalMs || this.defaultIntervalMs,
      host: config.host,
      port: Number(config.port) || 9510
    };
    this.targets.set(id, target);
    this.emitTargets();
    const socket = net.connect({ host: target.host, port: target.port }, () => {
      this.log(target, "info", `TCP 연결됨 ${target.host}:${target.port}`);
      this.attachSocket(target, socket);
    });
    socket.on("error", (err) => {
      target.status = "error";
      target.detail = err.message;
      this.log(target, "error", err.message);
      this.emitTargets();
    });
    return id;
  }

  startTcpServer(config) {
    const id = config.id || uid("listen");
    const port = Number(config.port) || 9510;
    const target = {
      id,
      name: config.name || `수신 :${port}`,
      kind: "tcp-server",
      protocol: config.protocol || "mmon",
      status: "listening",
      detail: `0.0.0.0:${port}`,
      intervalMs: config.intervalMs || this.defaultIntervalMs,
      children: []
    };
    const server = net.createServer((socket) => {
      const childId = uid("peer");
      const child = {
        id: childId,
        name: `${socket.remoteAddress}:${socket.remotePort}`,
        kind: "tcp-peer",
        protocol: target.protocol,
        status: "online",
        intervalMs: target.intervalMs,
        parentId: id
      };
      this.targets.set(childId, child);
      this.log(child, "info", "에이전트가 접속했습니다");
      this.attachSocket(child, socket);
      socket.on("close", () => {
        child.status = "offline";
        this.emitTargets();
      });
    });
    server.on("error", (err) => {
      target.status = "error";
      target.detail = err.message;
      this.log(target, "error", err.message);
      this.emitTargets();
    });
    server.listen(port, "0.0.0.0", () => {
      this.log(target, "info", `TCP 수신 대기 ${port}`);
      this.emitTargets();
    });
    target.server = server;
    this.targets.set(id, target);
    this.emitTargets();
    return id;
  }

  async startSerial(config) {
    if (!SerialPort) {
      throw new Error("serialport 모듈이 없습니다. app 폴더에서 npm install 후 npm run rebuild 를 실행하세요.");
    }
    const id = config.id || uid("serial");
    const target = {
      id,
      name: config.name || config.path,
      kind: "serial",
      protocol: config.protocol || "mmon",
      status: "connecting",
      detail: `${config.path} ${config.baudRate || 115200}`,
      intervalMs: config.intervalMs || this.defaultIntervalMs
    };
    this.targets.set(id, target);
    this.emitTargets();
    const port = new SerialPort({
      path: config.path,
      baudRate: Number(config.baudRate) || 115200,
      autoOpen: false
    });
    target.port = port;
    target.decoder = new Decoder();
    target.seq = 1;
    port.on("data", (buf) => {
      if (target.protocol === "jsonl" || target.protocol === "kv") {
        this.handleText(target, buf);
        return;
      }
      const frames = target.decoder.push(buf);
      if (frames.length) {
        for (const fr of frames) this.handleFrame(target, fr);
        return;
      }
      this.handleText(target, buf);
    });
    port.on("error", (err) => {
      target.status = "error";
      target.detail = err.message;
      this.log(target, "error", err.message);
      this.emitTargets();
    });
    port.on("close", () => {
      target.status = "offline";
      this.emitTargets();
    });
    await new Promise((resolve, reject) => {
      port.open((err) => (err ? reject(err) : resolve()));
    });
    target.status = "online";
    this.log(target, "info", `Serial 열림 ${config.path}`);
    try {
      port.write(encodeSubscribe(target.seq++, target.intervalMs, 1));
    } catch {
      /* ignore */
    }
    this.emitTargets();
    return id;
  }

  async start(config) {
    switch (config.kind) {
      case "local":
        return this.startLocal(config);
      case "simulator":
        return this.startSimulator(config);
      case "tcp-client":
        return this.startTcpClient(config);
      case "tcp-server":
        return this.startTcpServer(config);
      case "https":
      case "http":
        return this.startHttps(config);
      case "serial":
        return this.startSerial(config);
      default:
        throw new Error(`알 수 없는 연결 종류: ${config.kind}`);
    }
  }

  stop(id) {
    const target = this.targets.get(id);
    if (!target) return;
    this.sampler.stop(id);
    if (target.timer) {
      clearInterval(target.timer);
      clearTimeout(target.timer);
    }
    if (target.socket) {
      try {
        target.socket.end();
        target.socket.destroy();
      } catch {
        /* ignore */
      }
    }
    if (target.server) {
      try {
        target.server.close();
      } catch {
        /* ignore */
      }
    }
    if (target.port) {
      try {
        target.port.close();
      } catch {
        /* ignore */
      }
    }
    for (const [cid, child] of this.targets) {
      if (child.parentId === id) this.stop(cid);
    }
    this.targets.delete(id);
    this.emitTargets();
  }

  stopAll() {
    for (const id of [...this.targets.keys()]) this.stop(id);
    this.sampler.stopAll();
  }

  async listSerialPorts() {
    if (!SerialPort) return [];
    try {
      return await SerialPort.list();
    } catch {
      return [];
    }
  }

  ping(id) {
    const target = this.targets.get(id);
    if (!target) return;
    const buf = encodeHeartbeat(target.seq++ || 1);
    if (target.socket) target.socket.write(buf);
    if (target.port) target.port.write(buf);
  }
}

module.exports = { ConnectionManager };

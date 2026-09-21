"use strict";

function createWebMonitor(options) {
  const version = (options && options.version) || "10.0.0";
  const author = (options && options.author) || "SHKWON(knix008@naver.com)";
  const storage = (options && options.storage) || (typeof localStorage !== "undefined" ? localStorage : null);
  const download = (options && options.download) || downloadBlob;

  const listeners = { targets: [], metrics: [], log: [], settings: [] };
  const openWindow = options.openWindow || (typeof window !== "undefined" && window.open ? window.open.bind(window) : null);
  let bus = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      bus = new BroadcastChannel("mymonitor-settings");
      bus.onmessage = (e) => {
        if (e.data && e.data.type === "settings") {
          const payload = e.data.payload || {};
          if (payload.intervalMs) setIntervalMs(payload.intervalMs, true);
          emitSettingsLocal(payload);
        }
      };
    } catch {
      bus = null;
    }
  }
  const targets = new Map();
  const logs = [];
  let defaultIntervalMs = 1000;

  function emit(type, payload) {
    for (const cb of listeners[type] || []) cb(payload);
  }

  function emitSettingsLocal(payload) {
    for (const cb of listeners.settings) cb(payload);
  }

  function emitSettings(payload) {
    emitSettingsLocal(payload);
    if (bus) bus.postMessage({ type: "settings", payload });
  }

  function snapshot() {
    return [...targets.values()].map((t) => ({
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

  function emitTargets() {
    emit("targets", snapshot());
  }

  function log(target, level, message) {
    const rec = {
      ts: Date.now(),
      level,
      targetId: target.id,
      targetName: target.name,
      message
    };
    logs.push(rec);
    if (logs.length > 2000) logs.shift();
    emit("log", rec);
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const pendingMetrics = new Map();
  let metricsFlush = 0;

  function emitMetrics(sample) {
    pendingMetrics.set(sample.targetId, sample);
    if (metricsFlush) return;
    const flush = () => {
      metricsFlush = 0;
      const rows = [...pendingMetrics.values()];
      pendingMetrics.clear();
      for (const row of rows) emit("metrics", row);
    };
    if (typeof requestAnimationFrame === "function") {
      metricsFlush = requestAnimationFrame(flush);
    } else {
      metricsFlush = setTimeout(flush, 0);
    }
  }

  function scheduleJob(target, tick) {
    const loop = () => {
      if (!targets.has(target.id)) return;
      try {
        tick();
      } catch (err) {
        log(target, "error", err.message || String(err));
      }
      if (!targets.has(target.id)) return;
      target.timer = setTimeout(loop, target.intervalMs);
    };
    target.timer = setTimeout(loop, 0);
  }

  function collectBrowser() {
    const mem = typeof performance !== "undefined" ? performance.memory : null;
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const wave = 0.5 + 0.5 * Math.sin(Date.now() / 4000);
    return {
      ts: Date.now(),
      hello: {
        hostname: typeof location !== "undefined" ? location.hostname || "web" : "web",
        osName: "web",
        osType: 5,
        caps: 0x13
      },
      metrics: {
        cpu: Math.round((8 + wave * 22) * 10) / 10,
        ramUsed: mem ? mem.usedJSHeapSize : Math.round((48 + wave * 24) * 1024 * 1024),
        ramTotal: mem ? mem.jsHeapSizeLimit : 256 * 1024 * 1024,
        procs: nav.hardwareConcurrency || 4,
        uptime: Math.round(now / 1000),
        netRxRate: 200 + wave * 800,
        netTxRate: 80 + wave * 240
      }
    };
  }

  function startLocal(config) {
    const id = config.id || "local";
    if (targets.has(id)) stop(id);
    const target = {
      id,
      name: config.name || "로컬 Agent",
      kind: "local",
      protocol: "local",
      status: "online",
      intervalMs: config.intervalMs || defaultIntervalMs,
      hello: { hostname: "web", osName: "web", osType: 5, caps: 0x13 }
    };
    const tick = () => {
      const sample = collectBrowser();
      target.lastTs = sample.ts;
      target.hello = { ...target.hello, ...sample.hello };
      emitMetrics({ targetId: id, ts: sample.ts, metrics: sample.metrics, hello: target.hello });
    };
    target.tick = tick;
    targets.set(id, target);
    scheduleJob(target, tick);
    log(target, "info", "웹 로컬 수집을 시작했습니다");
    emitTargets();
    return id;
  }

  function startSimulator(config) {
    const id = config.id || uid("sim");
    const mode = config.simMode || "rtos";
    const target = {
      id,
      name: config.name || (mode === "rtos" ? "RTOS 시뮬레이터" : "서버 시뮬레이터"),
      kind: "simulator",
      protocol: "mmon",
      status: "online",
      intervalMs: config.intervalMs || defaultIntervalMs,
      hello: {
        hostname: mode === "rtos" ? "rtos-sim" : "server-sim",
        osName: mode === "rtos" ? "rtos" : "linux",
        osType: mode === "rtos" ? 4 : 1,
        caps: mode === "rtos" ? 0x73 : 0x1f
      }
    };
    const tick = () => {
      const t = Date.now() / 1000;
      const wave = (0.5 + 0.5 * Math.sin(t / 4)) * (0.6 + 0.4 * Math.sin(t / 11));
      const metrics =
        mode === "rtos"
          ? {
              cpu: 12 + wave * 38,
              heapUsed: Math.round((48 + wave * 24) * 1024),
              heapTotal: 128 * 1024,
              ramUsed: Math.round((48 + wave * 24) * 1024),
              ramTotal: 128 * 1024,
              tasks: 6 + Math.round(wave * 4),
              netRxRate: 400 + wave * 2400,
              netTxRate: 80 + wave * 600,
              temp: 38 + wave * 12,
              uptime: Math.round(t)
            }
          : {
              cpu: 18 + wave * 45,
              ramUsed: Math.round((2.1 + wave * 1.4) * 1024 * 1024 * 1024),
              ramTotal: 8 * 1024 * 1024 * 1024,
              diskUsed: 120 * 1024 * 1024 * 1024,
              diskTotal: 512 * 1024 * 1024 * 1024,
              load1: 0.3 + wave * 1.8,
              load5: 0.4 + wave * 1.1,
              load15: 0.5 + wave * 0.6,
              netRxRate: 8000 + wave * 40000,
              netTxRate: 2000 + wave * 12000,
              procs: 140 + Math.round(wave * 30),
              uptime: Math.round(t)
            };
      target.lastTs = Date.now();
      emitMetrics({ targetId: id, ts: target.lastTs, metrics, hello: target.hello });
    };
    target.tick = tick;
    targets.set(id, target);
    scheduleJob(target, tick);
    log(target, "info", `${target.name} 시작`);
    emitTargets();
    return id;
  }

  async function start(config) {
    switch (config.kind) {
      case "local":
        return startLocal(config);
      case "simulator":
        return startSimulator(config);
      case "https":
      case "http":
      case "tcp-client":
      case "tcp-server":
      case "serial":
        throw new Error("웹에서는 HTTPS 수신·Serial·TCP를 열 수 없습니다. Electron 앱 또는 시뮬레이터·로컬 수집을 사용하세요.");
      default:
        throw new Error(`알 수 없는 연결 종류: ${config.kind}`);
    }
  }

  function stop(id) {
    const target = targets.get(id);
    if (!target) return;
    if (target.timer) clearTimeout(target.timer);
    targets.delete(id);
    emitTargets();
  }

  function stopAll() {
    for (const id of [...targets.keys()]) stop(id);
  }

  function setIntervalMs(ms, silent) {
    const interval = Math.max(200, Math.min(10000, Number(ms) || 1000));
    defaultIntervalMs = interval;
    for (const target of targets.values()) {
      target.intervalMs = interval;
      if (target.timer && typeof target.tick === "function") {
        clearTimeout(target.timer);
        scheduleJob(target, target.tick);
      }
    }
    if (!silent) {
      const merged = { language: "ko", theme: "midnight", intervalMs: 1000, windowSec: 60, ...loadSettings(), intervalMs: interval };
      if (storage) storage.setItem("mymonitor-settings", JSON.stringify(merged));
      emitSettings(merged);
    }
    return interval;
  }

  function loadSettings() {
    try {
      return JSON.parse(storage.getItem("mymonitor-settings") || "{}");
    } catch {
      return {};
    }
  }

  function saveSettings(next) {
    const merged = { language: "ko", theme: "midnight", intervalMs: 1000, windowSec: 60, ...loadSettings(), ...next };
    if (storage) storage.setItem("mymonitor-settings", JSON.stringify(merged));
    if (merged.intervalMs) setIntervalMs(merged.intervalMs, true);
    emitSettings(merged);
    return merged;
  }

  function exportText(format) {
    if (format === "json") return JSON.stringify(logs, null, 2);
    if (format === "csv") {
      const header = "ts,level,target,message\n";
      const body = logs
        .map((r) => `${new Date(r.ts).toISOString()},${r.level},"${String(r.targetName || "").replace(/"/g, '""')}","${String(r.message).replace(/"/g, '""')}"`)
        .join("\n");
      return header + body;
    }
    return logs.map((r) => `${new Date(r.ts).toISOString()} [${r.level}] [${r.targetName || r.targetId}] ${r.message}`).join("\n") + "\n";
  }

  function downloadBlob(name, text, type) {
    if (typeof document === "undefined") return name;
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return name;
  }

  return {
    start,
    stop,
    stopAll,
    list: async () => snapshot(),
    serialPorts: async () => [],
    logs: async () => logs.slice(),
    exportLogs: async (format) => {
      const ext = format === "json" ? "json" : format === "csv" ? "csv" : "txt";
      const mime = ext === "json" ? "application/json" : ext === "csv" ? "text/csv" : "text/plain";
      return download(`mmon-logs.${ext}`, exportText(format), mime);
    },
    quit: async () => {
      stopAll();
      if (typeof window !== "undefined") window.close();
    },
    setMinContentWidth: async (width) => {
      const next = Math.max(1360, Math.ceil(Number(width) || 0) + 16);
      if (typeof document !== "undefined") {
        document.documentElement.style.minWidth = `${next}px`;
        document.body.style.minWidth = `${next}px`;
      }
      return next;
    },
    settingsGet: async () => ({ language: "ko", theme: "midnight", intervalMs: 1000, windowSec: 60, ...loadSettings() }),
    settingsSet: async (next) => saveSettings(next),
    openSettings: async () => {
      if (!openWindow) return "unavailable";
      const popup = openWindow("settings.html", "mmon-settings", "width=560,height=540,resizable=no,scrollbars=no");
      if (popup && popup.focus) popup.focus();
      return popup ? "opened" : "blocked";
    },
    closeSettings: async () => {
      if (typeof window !== "undefined") window.close();
      return true;
    },
    setIntervalMs: async (ms) => setIntervalMs(ms),
    onSettings: (cb) => {
      listeners.settings.push(cb);
      return () => {
        listeners.settings = listeners.settings.filter((fn) => fn !== cb);
      };
    },
    appInfo: async () => ({
      name: "MyMonitor MultiOS",
      version,
      author,
      electron: "web",
      chrome: typeof navigator !== "undefined" ? navigator.userAgent : "web",
      node: "web",
      platform: "web",
      arch: "web"
    }),
    onTargets: (cb) => {
      listeners.targets.push(cb);
      return () => {
        listeners.targets = listeners.targets.filter((fn) => fn !== cb);
      };
    },
    onMetrics: (cb) => {
      listeners.metrics.push(cb);
      return () => {
        listeners.metrics = listeners.metrics.filter((fn) => fn !== cb);
      };
    },
    onLog: (cb) => {
      listeners.log.push(cb);
      return () => {
        listeners.log = listeners.log.filter((fn) => fn !== cb);
      };
    }
  };
}

if (typeof window !== "undefined" && !window.monitor) {
  window.monitor = createWebMonitor({ version: window.MMON_WEB_VERSION });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createWebMonitor };
}

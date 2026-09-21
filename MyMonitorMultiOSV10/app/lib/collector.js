"use strict";

const os = require("os");
const fs = require("fs");

let si = null;
try {
  si = require("systeminformation");
} catch {
  si = null;
}

let prevCpu = null;
let diskCache = { ts: 0, used: undefined, total: undefined };
let netCache = { rxRate: undefined, txRate: undefined, rx: undefined, tx: undefined };
let siBusy = false;
let lastNetRefresh = 0;
const DISK_TTL_MS = 15000;
const NET_TTL_MS = 2000;

function loadavgSafe() {
  const v = os.loadavg();
  if (!v || (v[0] === 0 && v[1] === 0 && v[2] === 0 && process.platform === "win32")) {
    return null;
  }
  return v;
}

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }
  return { idle, total };
}

function cpuPercent() {
  const now = cpuTimes();
  let pct = 0;
  if (prevCpu) {
    const idle = now.idle - prevCpu.idle;
    const total = now.total - prevCpu.total;
    pct = total > 0 ? (1 - idle / total) * 100 : 0;
  } else if (now.total) {
    pct = (1 - now.idle / now.total) * 100;
  }
  prevCpu = now;
  return Math.max(0, Math.min(100, pct));
}

function readDiskFast() {
  try {
    if (typeof fs.statfsSync === "function") {
      const root = process.platform === "win32" ? "C:/" : "/";
      const s = fs.statfsSync(root);
      const total = Number(s.blocks) * Number(s.bsize);
      const free = Number(s.bavail) * Number(s.bsize);
      return { used: total - free, total };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function refreshDiskCache(force) {
  const now = Date.now();
  if (!force && diskCache.total && now - diskCache.ts < DISK_TTL_MS) return;
  const fast = readDiskFast();
  if (fast && fast.total) {
    diskCache = { ts: now, used: fast.used, total: fast.total };
  }
}

function refreshNetAsync() {
  if (!si || siBusy) return;
  const now = Date.now();
  if (now - lastNetRefresh < NET_TTL_MS) return;
  lastNetRefresh = now;
  siBusy = true;
  si.networkStats()
    .then((net) => {
      if (Array.isArray(net) && net[0]) {
        netCache = {
          rxRate: Math.max(0, net[0].rx_sec || 0),
          txRate: Math.max(0, net[0].tx_sec || 0),
          rx: net[0].rx_bytes,
          tx: net[0].tx_bytes
        };
      }
    })
    .catch(() => {
      /* keep last cache */
    })
    .finally(() => {
      siBusy = false;
    });
}

function collectLocal() {
  const metrics = {};
  const memTotal = os.totalmem();
  metrics.ramUsed = memTotal - os.freemem();
  metrics.ramTotal = memTotal;
  metrics.uptime = os.uptime();
  metrics.cpu = cpuPercent();

  const loads = loadavgSafe();
  if (loads) {
    metrics.load1 = loads[0];
    metrics.load5 = loads[1];
    metrics.load15 = loads[2];
  }

  refreshDiskCache(false);
  if (diskCache.total) {
    metrics.diskUsed = diskCache.used;
    metrics.diskTotal = diskCache.total;
  }

  if (netCache.rxRate !== undefined) {
    metrics.netRxRate = netCache.rxRate;
    metrics.netTxRate = netCache.txRate;
    metrics.netRx = netCache.rx;
    metrics.netTx = netCache.tx;
  }

  refreshNetAsync();

  return {
    ts: Date.now(),
    metrics,
    hello: {
      hostname: os.hostname(),
      osType: process.platform === "win32" ? 2 : process.platform === "darwin" ? 3 : 1,
      osName: process.platform,
      caps: 0x1f
    }
  };
}

async function collectLocalAsync() {
  return collectLocal();
}

module.exports = {
  collectLocal: collectLocalAsync,
  collectLocalSync: collectLocal
};

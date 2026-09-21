"use strict";

function simulateSample(mode) {
  const t = Date.now() / 1000;
  const wave = (0.5 + 0.5 * Math.sin(t / 4)) * (0.6 + 0.4 * Math.sin(t / 11));
  if (mode === "rtos") {
    return {
      ts: Date.now(),
      hello: {
        hostname: "rtos-sim",
        osName: "rtos",
        osType: 4,
        caps: 0x73
      },
      metrics: {
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
    };
  }
  return {
    ts: Date.now(),
    hello: {
      hostname: "server-sim",
      osName: "linux",
      osType: 1,
      caps: 0x1f
    },
    metrics: {
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
    }
  };
}

module.exports = { simulateSample };

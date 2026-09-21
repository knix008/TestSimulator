"use strict";

const { parentPort } = require("worker_threads");
const { collectLocalSync } = require("./collector");
const { simulateSample } = require("./simulate");

const jobs = new Map();

function sampleOf(job) {
  if (job.kind === "local") return collectLocalSync();
  return simulateSample(job.simMode || "rtos");
}

function run(job) {
  try {
    const sample = sampleOf(job);
    parentPort.postMessage({ type: "sample", id: job.id, sample });
  } catch (err) {
    parentPort.postMessage({ type: "error", id: job.id, message: err.message || String(err) });
  }
}

function startJob(job) {
  stopJob(job.id);
  const next = {
    id: job.id,
    kind: job.kind,
    simMode: job.simMode,
    intervalMs: Math.max(200, Math.min(10000, Number(job.intervalMs) || 1000))
  };
  run(next);
  next.timer = setInterval(() => run(next), next.intervalMs);
  jobs.set(next.id, next);
}

function stopJob(id) {
  const job = jobs.get(id);
  if (!job) return;
  if (job.timer) clearInterval(job.timer);
  jobs.delete(id);
}

function stopAll() {
  for (const id of [...jobs.keys()]) stopJob(id);
}

parentPort.on("message", (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "start" && msg.job) startJob(msg.job);
  else if (msg.type === "interval" && msg.id) {
    const job = jobs.get(msg.id);
    if (!job) return;
    job.intervalMs = Math.max(200, Math.min(10000, Number(msg.intervalMs) || job.intervalMs));
    startJob(job);
  } else if (msg.type === "interval-all") {
    const intervalMs = Math.max(200, Math.min(10000, Number(msg.intervalMs) || 1000));
    for (const job of jobs.values()) {
      job.intervalMs = intervalMs;
      startJob(job);
    }
  } else if (msg.type === "stop" && msg.id) stopJob(msg.id);
  else if (msg.type === "stop-all") stopAll();
});

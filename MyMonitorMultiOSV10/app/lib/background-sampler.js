"use strict";

const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const { collectLocalSync } = require("./collector");
const { simulateSample } = require("./simulate");

function workerScript() {
  const packed = path.join(__dirname, "sample-worker.js");
  const unpacked = packed.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  if (unpacked !== packed) {
    try {
      if (fs.existsSync(unpacked)) return unpacked;
    } catch {
      /* use packed */
    }
  }
  return packed;
}

class BackgroundSampler extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.worker = null;
    this.useWorker = true;
    this._spawnWorker();
  }

  get runningInBackground() {
    return Boolean(this.worker && this.useWorker);
  }

  _spawnWorker() {
    try {
      const { Worker } = require("worker_threads");
      this.worker = new Worker(workerScript());
      this.worker.on("message", (msg) => {
        if (!msg) return;
        if (msg.type === "sample") this.emit("sample", msg);
        else if (msg.type === "error") this.emit("job-error", msg);
      });
      this.worker.on("error", () => {
        this.useWorker = false;
        try {
          this.worker.terminate();
        } catch {
          /* ignore */
        }
        this.worker = null;
        this._fallbackAll();
      });
      this.worker.on("exit", (code) => {
        this.worker = null;
        if (code && this.jobs.size) {
          this.useWorker = false;
          this._fallbackAll();
        }
      });
    } catch {
      this.useWorker = false;
      this.worker = null;
    }
  }

  start(job) {
    this.stop(job.id, true);
    const next = {
      id: job.id,
      kind: job.kind,
      simMode: job.simMode,
      intervalMs: Math.max(200, Math.min(10000, Number(job.intervalMs) || 1000))
    };
    this.jobs.set(next.id, next);
    if (this.worker && this.useWorker) {
      this.worker.postMessage({ type: "start", job: next });
      return;
    }
    this._startInline(next);
  }

  setIntervalMs(id, intervalMs) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.intervalMs = Math.max(200, Math.min(10000, Number(intervalMs) || job.intervalMs));
    if (this.worker && this.useWorker) {
      this.worker.postMessage({ type: "interval", id, intervalMs: job.intervalMs });
      return;
    }
    this._startInline(job);
  }

  setAllInterval(intervalMs) {
    const next = Math.max(200, Math.min(10000, Number(intervalMs) || 1000));
    if (this.worker && this.useWorker) {
      for (const job of this.jobs.values()) job.intervalMs = next;
      this.worker.postMessage({ type: "interval-all", intervalMs: next });
      return;
    }
    for (const id of this.jobs.keys()) this.setIntervalMs(id, next);
  }

  stop(id, keepRecord) {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }
    if (!keepRecord) this.jobs.delete(id);
    if (this.worker && this.useWorker) {
      this.worker.postMessage({ type: "stop", id });
    }
  }

  stopAll() {
    for (const id of [...this.jobs.keys()]) this.stop(id);
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "stop-all" });
        this.worker.terminate();
      } catch {
        /* ignore */
      }
      this.worker = null;
    }
  }

  _fallbackAll() {
    for (const job of this.jobs.values()) this._startInline(job);
  }

  _startInline(job) {
    if (job.timer) clearTimeout(job.timer);
    const run = () => {
      const current = this.jobs.get(job.id);
      if (!current) return;
      try {
        const sample = current.kind === "local" ? collectLocalSync() : simulateSample(current.simMode);
        this.emit("sample", { type: "sample", id: current.id, sample });
      } catch (err) {
        this.emit("job-error", { id: current.id, message: err.message || String(err) });
      }
      current.timer = setTimeout(run, current.intervalMs);
    };
    job.timer = setTimeout(run, 0);
  }
}

module.exports = { BackgroundSampler, workerScript };

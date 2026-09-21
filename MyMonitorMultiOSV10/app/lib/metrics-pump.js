"use strict";

class MetricsPump {
  constructor(send, gapMs = 32) {
    this.send = send;
    this.gapMs = Math.max(0, Number(gapMs) || 0);
    this.latest = new Map();
    this.timer = null;
  }

  push(sample) {
    if (!sample || !sample.targetId) return;
    this.latest.set(sample.targetId, sample);
    if (this.timer != null) return;
    this.timer = setTimeout(() => this.flush(), this.gapMs);
  }

  flush() {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.latest.size) return;
    const batch = [...this.latest.values()];
    this.latest.clear();
    for (const sample of batch) this.send(sample);
  }
}

module.exports = { MetricsPump };

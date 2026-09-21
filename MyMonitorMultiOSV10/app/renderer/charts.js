const CHART_KEEP_MS = 600000;

class RealtimeChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx =
      canvas.getContext("2d", { alpha: false, desynchronized: true }) ||
      canvas.getContext("2d");
    this.windowMs = options.windowMs || 60000;
    this.series = (options.series || [{ key: "a", color: "#3ee0c3" }]).map((s) => ({
      ...s,
      points: []
    }));
    this.unit = options.unit || "";
    this.min = options.min;
    this.max = options.max;
    this.colors = { line: "#24314d", muted: "#8ea0c2", bg: "#151f35" };
    this._raf = 0;
    this.refreshTheme();
    this.resize();
    RealtimeChart.instances.push(this);
    if (RealtimeChart._ro) RealtimeChart._ro.observe(this.canvas);
    else RealtimeChart.watchResize();
  }

  static setAllWindowMs(ms) {
    for (const chart of RealtimeChart.instances) chart.setWindowMs(ms);
  }

  static watchResize() {
    if (RealtimeChart._watching) return;
    RealtimeChart._watching = true;
    const flush = () => {
      for (const chart of RealtimeChart.instances) chart.resize();
    };
    if (typeof ResizeObserver === "function") {
      let raf = 0;
      RealtimeChart._ro = new ResizeObserver(() => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          flush();
        });
      });
      for (const chart of RealtimeChart.instances) {
        RealtimeChart._ro.observe(chart.canvas);
      }
    } else {
      let timer = 0;
      window.addEventListener("resize", () => {
        clearTimeout(timer);
        timer = setTimeout(flush, 80);
      });
    }
  }

  refreshTheme() {
    const styles = getComputedStyle(document.documentElement);
    this.colors.line = styles.getPropertyValue("--line").trim() || "#24314d";
    this.colors.muted = styles.getPropertyValue("--muted").trim() || "#8ea0c2";
    this.colors.bg = styles.getPropertyValue("--card").trim() || "#151f35";
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width === w && this.canvas.height === h && this.w === rect.width && this.h === rect.height) {
      return;
    }
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
    this.draw();
  }

  scheduleDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.draw();
    });
  }

  setWindowMs(ms) {
    const next = Math.max(10000, Math.min(CHART_KEEP_MS, Number(ms) || this.windowMs));
    this.windowMs = next;
    this.trim();
    this.scheduleDraw();
  }

  trim() {
    const cutoff = Date.now() - CHART_KEEP_MS;
    for (const s of this.series) {
      while (s.points.length && s.points[0].t < cutoff) s.points.shift();
    }
  }

  push(sample, ts = Date.now()) {
    for (const s of this.series) {
      const v = sample[s.key];
      s.points.push({ t: ts, v: Number.isFinite(v) ? v : null });
    }
    this.trim();
    this.scheduleDraw();
  }

  reset() {
    for (const s of this.series) s.points = [];
    this.scheduleDraw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.w || this.canvas.clientWidth;
    const h = this.h || this.canvas.clientHeight;
    if (!w || !h) return;
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, w, h);

    const pad = { l: 42, r: 12, t: 8, b: 22 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const now = Date.now();
    const t0 = now - this.windowMs;
    const visible = this.series.flatMap((s) => s.points.filter((p) => p.t >= t0 && p.v !== null).map((p) => p.v));
    let min = this.min;
    let max = this.max;
    if (min === undefined || max === undefined) {
      let lo = 0;
      let hi = 1;
      if (visible.length) {
        lo = visible[0];
        hi = visible[0];
        for (let i = 1; i < visible.length; i++) {
          const v = visible[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      const span = hi - lo || 1;
      if (min === undefined) min = Math.max(0, lo - span * 0.1);
      if (max === undefined) max = hi + span * 0.15;
    }
    if (max <= min) max = min + 1;

    ctx.strokeStyle = this.colors.line;
    ctx.lineWidth = 1;
    ctx.fillStyle = this.colors.muted;
    ctx.font = "10px Segoe UI, sans-serif";
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      const label = max - ((max - min) * i) / 4;
      ctx.fillText(formatAxis(label, this.unit), 4, y + 3);
    }

    ctx.textAlign = "center";
    for (let i = 0; i <= 2; i++) {
      const x = pad.l + (plotW * i) / 2;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
      ctx.stroke();
      const age = this.windowMs * (1 - i / 2);
      ctx.fillText(i === 2 ? "0" : `-${formatWindow(age)}`, x, h - 6);
    }
    ctx.textAlign = "left";

    for (const s of this.series) {
      const pts = s.points.filter((p) => p.t >= t0);
      if (pts.length < 1) continue;
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        const x = pad.l + ((p.t - t0) / this.windowMs) * plotW;
        const nv = p.v === null ? min : p.v;
        const y = pad.t + (1 - (nv - min) / (max - min)) * plotH;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

RealtimeChart.instances = [];

function formatAxis(v, unit) {
  if (unit === "%") return `${v.toFixed(0)}%`;
  if (unit === "B") return formatBytes(v);
  if (unit === "B/s") return `${formatBytes(v)}/s`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(1);
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)}${u[i]}`;
}

function formatPct(n) {
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
}

function formatWindow(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m${r}s` : `${m}m`;
  }
  return `${s}s`;
}

window.RealtimeChart = RealtimeChart;
window.formatBytes = formatBytes;
window.formatPct = formatPct;
window.formatWindow = formatWindow;

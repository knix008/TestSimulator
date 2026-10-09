// Simulation tab: analysis settings, run, waveform plot with cursors,
// operating-point table, probe management. Results of an operating-point run
// are also overlaid on the schematic wires.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, toast, input, select, checkbox } from "./widgets.js";
import { buildNetlist } from "../core/netlist.js";
import { parseValue, formatValue } from "../core/project.js";
import { getSymbol } from "../lib/symbols.js";

const COLORS = ["#4f9dff", "#ff6b6b", "#3fbf6f", "#f0a63a", "#b47cff", "#2fd4d4", "#ff8fd0", "#c8d84a", "#ff9b4a", "#7aa6ff"];

function niceStep(range, target = 8) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// series: [{name, color, y:[]}], x: [] ; opts: {logX, xUnit, yUnit, title}
export function drawPlot(ctx, w, hgt, x, series, opts = {}, theme = {}) {
  const pad = { l: 64, r: 18, t: 22, b: 36 };
  ctx.fillStyle = theme.bg || "#14171d";
  ctx.fillRect(0, 0, w, hgt);
  const pw = w - pad.l - pad.r;
  const ph = hgt - pad.t - pad.b;
  if (!x || !x.length || !series.length) {
    ctx.fillStyle = theme.muted || "#888";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.empty || "", w / 2, hgt / 2);
    return null;
  }
  const fx = opts.logX ? (v) => Math.log10(Math.max(v, 1e-30)) : (v) => v;
  let x0 = fx(x[0]);
  let x1 = fx(x[x.length - 1]);
  if (x1 === x0) x1 = x0 + 1;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of series) for (const v of s.y) if (Number.isFinite(v)) { y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
  if (!Number.isFinite(y0)) { y0 = 0; y1 = 1; }
  if (y1 - y0 < 1e-12) { y0 -= 0.5; y1 += 0.5; }
  const m = (y1 - y0) * 0.08;
  y0 -= m; y1 += m;
  const sx = (v) => pad.l + ((fx(v) - x0) / (x1 - x0)) * pw;
  const sy = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * ph;
  // Grid.
  ctx.strokeStyle = theme.grid || "#2a2f39";
  ctx.lineWidth = 1;
  ctx.fillStyle = theme.muted || "#8d96a7";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ys = niceStep(y1 - y0, Math.max(3, Math.floor(ph / 50)));
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) {
    const yy = Math.round(sy(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l + pw, yy); ctx.stroke();
    ctx.fillText(formatValue(Math.abs(v) < ys / 1000 ? 0 : v, opts.yUnit || ""), pad.l - 6, yy);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (opts.logX) {
    for (let d = Math.floor(x0); d <= Math.ceil(x1); d++) {
      for (const k of [1, 2, 5]) {
        const v = k * 10 ** d;
        const xx = sx(v);
        if (xx < pad.l - 1 || xx > pad.l + pw + 1) continue;
        ctx.globalAlpha = k === 1 ? 1 : 0.45;
        ctx.beginPath(); ctx.moveTo(Math.round(xx) + 0.5, pad.t); ctx.lineTo(Math.round(xx) + 0.5, pad.t + ph); ctx.stroke();
        ctx.globalAlpha = 1;
        if (k === 1) ctx.fillText(formatValue(v, opts.xUnit || ""), xx, pad.t + ph + 6);
      }
    }
  } else {
    const xs = niceStep(x1 - x0, Math.max(3, Math.floor(pw / 90)));
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + xs * 1e-6; v += xs) {
      const xx = Math.round(pad.l + ((v - x0) / (x1 - x0)) * pw) + 0.5;
      ctx.beginPath(); ctx.moveTo(xx, pad.t); ctx.lineTo(xx, pad.t + ph); ctx.stroke();
      ctx.fillText(formatValue(Math.abs(v) < xs / 1000 ? 0 : v, opts.xUnit || ""), xx, pad.t + ph + 6);
    }
  }
  ctx.strokeStyle = theme.axis || "#4a5160";
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, pw, ph);
  // Traces.
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.l, pad.t, pw, ph);
  ctx.clip();
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let started = false;
    // Decimate to about two points per pixel column.
    const step = Math.max(1, Math.floor(x.length / (pw * 2)));
    for (let i = 0; i < x.length; i += step) {
      const v = s.y[i];
      if (!Number.isFinite(v)) { started = false; continue; }
      const px = sx(x[i]);
      const py = sy(v);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
  if (opts.title) {
    ctx.fillStyle = theme.text || "#ddd";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.fillText(opts.title, pad.l, 4);
  }
  return { sx, sy, pad, pw, ph, x0, x1, y0, y1, invX: (px) => { const f = x0 + ((px - pad.l) / pw) * (x1 - x0); return opts.logX ? 10 ** f : f; } };
}

export class SimView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.hidden = new Set();
    this.cursor = null;
    this.acView = "db";
  }

  get sim() { return this.app.store.project.sim; }

  activate() {
    this.build();
    this.render();
    this.app.setHint(t("Pick an analysis, choose probes on the left and press Run (F5). Operating-point voltages also appear on the schematic."));
  }

  build() {
    const sim = this.sim;
    this.host.innerHTML = "";
    const modes = [["op", t("Operating point")], ["tran", t("Transient")], ["ac", t("AC (Bode)")], ["dc", t("DC sweep")]];
    const seg = h("div", { class: "seg" }, ...modes.map(([m, label]) => h("button", { class: sim.mode === m ? "on" : "", onclick: () => { this.app.store.edit(t("Simulation mode"), () => { sim.mode = m; }); this.activate(); } }, label)));
    const param = (label, key, width = 80) => {
      const el = input(sim[key] ?? "", { cls: "num" });
      el.style.width = `${width}px`;
      el.addEventListener("change", () => this.app.store.edit(t("Simulation settings"), () => { sim[key] = el.value; }));
      el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { el.blur(); this.run(); } });
      return h("label", { class: "check" }, h("span", { class: "field-label" }, label), el);
    };
    const params = h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } });
    if (sim.mode === "tran") params.append(param(t("Stop time"), "tStop"), param(t("Step"), "tStep"));
    if (sim.mode === "ac") params.append(param(t("Start freq"), "fStart"), param(t("Stop freq"), "fStop"), param(t("Points/decade"), "points", 60),
      select(this.acView, [["db", t("Magnitude (dB)")], ["mag", t("Magnitude (V)")], ["phase", t("Phase (°)")]], { onChange: (v) => { this.acView = v; this.render(); } }));
    if (sim.mode === "dc") {
      const sources = this.app.store.project.schematic.parts.filter((p) => { const s = getSymbol(p.lib); return s && s.sim && (s.sim.model === "V" || s.sim.model === "I"); });
      if (!sim.dcSource && sources[0]) sim.dcSource = sources[0].ref;
      const srcSel = select(sim.dcSource || "", sources.map((p) => [p.ref, `${p.ref} (${p.value})`]), { onChange: (v) => this.app.store.edit(t("Simulation settings"), () => { sim.dcSource = v; }) });
      params.append(h("label", { class: "check" }, h("span", { class: "field-label" }, t("Source")), srcSel), param(t("Start"), "dcStart", 60), param(t("Stop"), "dcStop", 60), param(t("Step"), "dcStep", 60));
      if (sim.dcStart == null) { sim.dcStart = "0"; sim.dcStop = "10"; sim.dcStep = "0.1"; }
    }
    const runBtn = h("button", { class: "btn primary", onclick: () => this.run() }, h("span", { html: icon("play", 14) }), t("Run"), h("kbd", { style: { marginLeft: "6px" } }, "F5"));
    this.status = h("span", { class: "field-hint" });
    this.legend = h("div", { class: "legend" });
    const top = h("div", { class: "sim-top" }, seg, params, runBtn, this.status, h("div", { style: { flex: 1 } }), this.legend);
    this.plotHost = h("div", { class: "sim-plot" });
    this.canvas = h("canvas", {});
    this.plotHost.append(this.canvas);
    this.table = h("div", { class: "sim-table" });
    this.host.append(h("div", { class: "sim-wrap" }, top, this.plotHost, this.table));
    this.canvas.addEventListener("pointermove", (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.render();
    });
    this.canvas.addEventListener("pointerleave", () => { this.cursor = null; this.render(); });
    if (!this.ro) {
      this.ro = new ResizeObserver(() => this.render());
    }
    this.ro.disconnect();
    this.ro.observe(this.plotHost);
    this.renderTable();
  }

  async run() {
    const project = this.app.store.project;
    const sim = project.sim;
    if (!project.schematic.parts.length) { toast(t("The schematic is empty — draw a circuit first."), "warn"); return; }
    const { simulate } = await import("../sim/engine.js");
    const t0 = performance.now();
    const opts = { mode: sim.mode };
    if (sim.mode === "tran") Object.assign(opts, { tStop: sim.tStop, tStep: sim.tStep, maxPoints: +this.app.settings.simMaxPoints || 100000 });
    if (sim.mode === "ac") Object.assign(opts, { fStart: sim.fStart, fStop: sim.fStop, points: +sim.points || 20 });
    if (sim.mode === "dc") Object.assign(opts, { source: sim.dcSource, start: parseValue(sim.dcStart), stop: parseValue(sim.dcStop), step: parseValue(sim.dcStep) });
    let res;
    try { res = simulate(project, opts); } catch (e) { res = { ok: false, errors: [e.message], warnings: [] }; }
    const ms = Math.round(performance.now() - t0);
    this.app.simResult = res;
    if (!res.ok) {
      toast(t("Simulation failed: {m}", { m: (res.errors || []).join("; ") }), "error", 7000);
      this.status.textContent = (res.errors || []).join("; ");
    } else {
      this.status.textContent = t("Done in {ms} ms", { ms }) + ((res.warnings || []).length ? ` · ${res.warnings.length} ${t("warnings")}` : "");
      if (res.mode === "op") {
        this.app.simOverlay = { voltages: res.voltages, currents: res.currents };
        this.app.sch.request();
      }
      // First run with no probes: show every net so something useful appears.
      if (res.mode !== "op" && !sim.probes.length) {
        const nets = Object.keys(res.signals || {}).filter((k) => k.startsWith("V(")).slice(0, 4).map((k) => k.slice(2, -1));
        sim.probes = nets;
      }
      if ((res.warnings || []).length) toast(res.warnings.slice(0, 3).join("\n"), "warn", 5000);
    }
    this.renderTable();
    this.render();
    this.app.renderLeft();
  }

  series() {
    const res = this.app.simResult;
    if (!res || !res.ok || res.mode === "op") return null;
    const probes = this.sim.probes || [];
    const out = [];
    let ci = 0;
    const keys = Object.keys(res.signals);
    for (const p of probes) {
      const key = keys.includes(p) ? p : keys.includes(`V(${p})`) ? `V(${p})` : null;
      if (!key) continue;
      const color = COLORS[ci++ % COLORS.length];
      if (this.hidden.has(key)) { out.push({ name: key, color, y: [], hidden: true }); continue; }
      const sig = res.signals[key];
      let y = sig;
      if (res.mode === "ac") y = this.acView === "phase" ? sig.phase : this.acView === "mag" ? sig.mag : sig.db;
      out.push({ name: key, color, y });
    }
    return out;
  }

  render() {
    if (!this.canvas || !this.plotHost.isConnected) return;
    const w = this.plotHost.clientWidth;
    const hh = this.plotHost.clientHeight;
    if (!w || !hh) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = hh * dpr;
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const theme = { bg: css.getPropertyValue("--bg").trim(), grid: css.getPropertyValue("--line").trim(), axis: css.getPropertyValue("--line2").trim(), muted: css.getPropertyValue("--muted").trim(), text: css.getPropertyValue("--text").trim() };
    const res = this.app.simResult;
    const ser = this.series();
    this.legend.innerHTML = "";
    if (!res || !res.ok || res.mode === "op" || !ser) {
      drawPlot(ctx, w, hh, null, [], { empty: res && res.ok && res.mode === "op" ? t("Operating point results are in the table below and on the schematic.") : t("Press Run (F5) to simulate. Add probes from the panel on the left or right-click a wire in the schematic.") }, theme);
      return;
    }
    const x = res.mode === "tran" ? res.time : res.mode === "ac" ? res.freq : res.sweep;
    const visible = ser.filter((s) => !s.hidden);
    const yUnit = res.mode === "ac" ? (this.acView === "phase" ? "°" : this.acView === "db" ? "dB" : "V") : "";
    const geo = drawPlot(ctx, w, hh, x, visible, { logX: res.mode === "ac", xUnit: res.mode === "tran" ? "s" : res.mode === "ac" ? "Hz" : "V", yUnit, title: { tran: t("Transient"), ac: t("AC (Bode)"), dc: t("DC sweep") }[res.mode] }, theme);
    for (const s of ser) {
      const el = h("span", { class: s.hidden ? "off" : "", title: t("Click to show / hide") }, h("i", { style: { background: s.color } }), s.name);
      el.addEventListener("click", () => { if (this.hidden.has(s.name)) this.hidden.delete(s.name); else this.hidden.add(s.name); this.render(); });
      this.legend.append(el);
    }
    // Cursor read-out.
    if (geo && this.cursor && this.cursor.x > geo.pad.l && this.cursor.x < geo.pad.l + geo.pw) {
      const xv = geo.invX(this.cursor.x);
      let idx = 0;
      let best = Infinity;
      for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - xv); if (d < best) { best = d; idx = i; } }
      const px = geo.sx(x[idx]);
      ctx.strokeStyle = theme.muted;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, geo.pad.t); ctx.lineTo(px, geo.pad.t + geo.ph); ctx.stroke();
      ctx.setLineDash([]);
      const lines = [`${formatValue(x[idx], res.mode === "tran" ? "s" : res.mode === "ac" ? "Hz" : "V", 4)}`];
      for (const s of visible) {
        const v = s.y[idx];
        lines.push(`${s.name}: ${formatValue(v, yUnit || (s.name.startsWith("I(") ? "A" : "V"), 4)}`);
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(px, geo.sy(v), 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = "12px 'Segoe UI', sans-serif";
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
      const bx = Math.min(px + 12, w - bw - 6);
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.fillRect(bx, geo.pad.t + 6, bw, lines.length * 17 + 8);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? "#fff" : visible[i - 1].color; ctx.fillText(l, bx + 8, geo.pad.t + 11 + i * 17); });
    }
  }

  renderTable() {
    const res = this.app.simResult;
    this.table.innerHTML = "";
    if (!res || !res.ok) {
      if (res && res.errors && res.errors.length) this.table.append(h("div", { class: "empty-note", style: { padding: "10px 14px", color: "var(--danger)" } }, res.errors.join("\n")));
      return;
    }
    if (res.mode === "op") {
      const v = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("Net")), h("th", {}, t("Voltage"))));
      for (const [n, val] of Object.entries(res.voltages).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) v.append(h("tr", {}, h("td", {}, n), h("td", { class: "num" }, formatValue(val, "V", 4))));
      const c = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("Part")), h("th", {}, t("Current")), h("th", {}, t("Power"))));
      for (const [ref, val] of Object.entries(res.currents).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) c.append(h("tr", {}, h("td", {}, ref), h("td", { class: "num" }, formatValue(val, "A", 4)), h("td", { class: "num" }, formatValue((res.power || {})[ref], "W", 3))));
      this.table.append(h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "8px 12px" } }, v, c));
      this.table.style.maxHeight = "100%";
      this.plotHost.style.display = "none";
    } else {
      this.plotHost.style.display = "";
      this.table.style.maxHeight = "";
      if ((res.warnings || []).length) this.table.append(h("div", { class: "empty-note", style: { padding: "6px 14px" } }, res.warnings.join(" · ")));
    }
  }

  renderToolbar(bar, btn, sep) {
    bar.append(btn("sim.run", { label: true }), sep(), btn("sim.op"), btn("sim.tran"), btn("sim.ac"), btn("sim.dc"), sep(), btn("sim.spice", { label: true }), btn("file.exportSpice"), sep(), btn("view.sch", { label: true }), btn("sim.clear"));
  }

  renderPanel(host) {
    const sim = this.sim;
    const nl = buildNetlist(this.app.store.project.schematic);
    const panel = h("div", { class: "panel grow" });
    panel.append(h("div", { class: "panel-head" }, h("span", {}, t("Probes")), h("div", { class: "grow" }),
      h("button", { class: "icon-btn", title: t("Clear probes"), html: icon("trash", 14), onclick: () => { this.app.store.edit(t("Clear probes"), () => { sim.probes = []; }); this.render(); this.app.renderLeft(); } })));
    const body = h("div", { class: "panel-body" });
    body.append(h("div", { class: "empty-note" }, t("Tick the nets (voltages) and parts (currents) to plot.")));
    const probes = new Set(sim.probes || []);
    const toggle = (key, on) => {
      this.app.store.edit(t("Probe"), () => {
        const set = new Set(sim.probes || []);
        if (on) set.add(key); else set.delete(key);
        sim.probes = [...set];
      });
      this.render();
    };
    body.append(h("div", { class: "prop-section" }, t("Voltages")));
    for (const n of nl.nets) {
      if (/^(GND|0|AGND)$/i.test(n.name)) continue;
      body.append(h("div", {}, checkbox(probes.has(n.name), n.name, { onChange: (v) => toggle(n.name, v) })));
    }
    body.append(h("div", { class: "prop-section" }, t("Currents")));
    for (const p of this.app.store.project.schematic.parts) {
      const s = getSymbol(p.lib);
      if (!s || !s.sim) continue;
      const key = `I(${p.ref})`;
      body.append(h("div", {}, checkbox(probes.has(key), `${p.ref} (${p.value})`, { onChange: (v) => toggle(key, v) })));
    }
    if (!nl.nets.length) body.append(h("div", { class: "empty-note" }, t("No nets yet.")));
    panel.append(body);
    host.append(panel);
  }
}

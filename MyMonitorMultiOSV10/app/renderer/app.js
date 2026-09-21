const state = {
  targets: [],
  selected: null,
  last: new Map(),
  history: new Map(),
  lang: "ko",
  theme: "midnight",
  intervalMs: 1000,
  windowSec: 60
};

function t(key) {
  const pack = I18N[state.lang] || I18N.ko;
  return pack[key] || I18N.en[key] || key;
}

const $ = (id) => document.getElementById(id);
const cardsEl = $("cards");
const listEl = $("target-list");
const logView = $("log-view");

const charts = {
  cpu: new RealtimeChart($("chart-cpu"), {
    series: [
      { key: "cpu", color: "#3ee0c3" },
      { key: "load1", color: "#6ea8ff" }
    ],
    min: 0,
    unit: "%"
  }),
  mem: new RealtimeChart($("chart-mem"), {
    series: [
      { key: "ramPct", color: "#6ea8ff" },
      { key: "heapPct", color: "#f5c14a" }
    ],
    min: 0,
    max: 100,
    unit: "%"
  }),
  disk: new RealtimeChart($("chart-disk"), {
    series: [{ key: "diskPct", color: "#c084fc" }],
    min: 0,
    max: 100,
    unit: "%"
  }),
  net: new RealtimeChart($("chart-net"), {
    series: [
      { key: "netRxRate", color: "#3ee0c3" },
      { key: "netTxRate", color: "#ff5d73" }
    ],
    min: 0,
    unit: "B/s"
  })
};

function kindLabel(kind) {
  return {
    local: t("kindLocalShort"),
    simulator: t("kindSimShort"),
    "tcp-client": t("kindTcpIn"),
    "tcp-server": t("kindTcpOut"),
    https: t("kindHttpsShort"),
    http: t("kindHttpsShort"),
    "https-peer": t("kindHttpsPeer"),
    "tcp-peer": t("kindPeer"),
    serial: "Serial"
  }[kind] || kind;
}

function renderTargets() {
  listEl.innerHTML = "";
  if (!state.targets.length) {
    listEl.innerHTML = `<li class="muted">${t("noTargets")}</li>`;
    return;
  }
  for (const t of state.targets) {
    const li = document.createElement("li");
    if (t.id === state.selected) li.classList.add("active");
    li.innerHTML = `<span class="name">${escapeHtml(t.name)}</span>
      <span class="meta">${kindLabel(t.kind)} · ${t.status}${t.hello?.osName ? " · " + t.hello.osName : ""}</span>`;
    li.onclick = () => selectTarget(t.id);
    listEl.appendChild(li);
  }
}

function selectTarget(id) {
  if (state.selected !== id) replayHistory(id);
  state.selected = id;
  const row = state.targets.find((x) => x.id === id);
  $("empty").classList.toggle("hidden", !!row);
  $("dash").classList.toggle("hidden", !row);
  if (!row) {
    refreshStatusBar();
    return;
  }
  $("dash-title").textContent = row.name;
  $("dash-sub").textContent = `${kindLabel(row.kind)} / ${row.protocol || "mmon"} / ${row.detail || row.hello?.hostname || ""}`;
  renderTargets();
  const last = state.last.get(id);
  renderCards(last ? last.metrics : {}, last ? last.hello : row.hello);
  refreshStatusBar();
}

function cardItems(metrics, hello) {
  const rtos = hello && (hello.osType === 4 || hello.osName === "rtos" || metrics.heapTotal);
  const ramUsed = metrics.ramUsed ?? metrics.heapUsed;
  const ramTotal = metrics.ramTotal ?? metrics.heapTotal;
  const items = [
    { key: "cpu", label: "CPU", value: formatPct(metrics.cpu), pct: metrics.cpu },
    {
      key: "ram",
      label: rtos ? "Heap / RAM" : "RAM",
      value: ramTotal ? `${formatBytes(ramUsed)} / ${formatBytes(ramTotal)}` : "—",
      pct: ramTotal ? (ramUsed / ramTotal) * 100 : 0
    }
  ];
  if (!rtos) {
    items.push({
      key: "disk",
      label: "Disk",
      value: metrics.diskTotal ? `${formatBytes(metrics.diskUsed)} / ${formatBytes(metrics.diskTotal)}` : "—",
      pct: metrics.diskTotal ? (metrics.diskUsed / metrics.diskTotal) * 100 : 0
    });
    items.push({
      key: "load",
      label: "Load",
      value: Number.isFinite(metrics.load1) ? metrics.load1.toFixed(2) : "—",
      pct: Number.isFinite(metrics.load1) ? Math.min(100, metrics.load1 * 25) : 0
    });
  } else {
    items.push({
      key: "tasks",
      label: "Tasks",
      value: Number.isFinite(metrics.tasks) ? String(metrics.tasks) : "—",
      pct: Number.isFinite(metrics.tasks) ? Math.min(100, metrics.tasks * 8) : 0
    });
    items.push({
      key: "temp",
      label: "Temp",
      value: Number.isFinite(metrics.temp) ? `${metrics.temp.toFixed(1)}°C` : "—",
      pct: Number.isFinite(metrics.temp) ? Math.min(100, metrics.temp) : 0
    });
  }
  items.push({
    key: "net",
    label: "Network",
    value: `↓${formatBytes(metrics.netRxRate || 0)}/s  ↑${formatBytes(metrics.netTxRate || 0)}/s`,
    pct: Math.min(100, ((metrics.netRxRate || 0) + (metrics.netTxRate || 0)) / 20000 * 100)
  });
  return items;
}

function renderCards(metrics, hello) {
  const items = cardItems(metrics, hello);
  const kids = cardsEl.children;
  if (kids.length !== items.length) {
    cardsEl.innerHTML = items
      .map(
        (it) => `<article class="card">
        <div class="label">${it.label}</div>
        <div class="value">${it.value}</div>
        <div class="bar"><span style="width:${Math.max(0, Math.min(100, it.pct || 0)).toFixed(1)}%"></span></div>
      </article>`
      )
      .join("");
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const el = kids[i];
    el.querySelector(".label").textContent = it.label;
    el.querySelector(".value").textContent = it.value;
    el.querySelector(".bar > span").style.width = `${Math.max(0, Math.min(100, it.pct || 0)).toFixed(1)}%`;
  }
}

function chartSampleFrom(m) {
  const ramUsed = m.ramUsed ?? m.heapUsed;
  const ramTotal = m.ramTotal ?? m.heapTotal;
  return {
    cpu: m.cpu,
    load1: m.load1 != null ? Math.min(100, m.load1 * 25) : undefined,
    ramPct: ramTotal ? (ramUsed / ramTotal) * 100 : undefined,
    heapPct: m.heapTotal ? (m.heapUsed / m.heapTotal) * 100 : undefined,
    diskPct: m.diskTotal ? (m.diskUsed / m.diskTotal) * 100 : undefined,
    netRxRate: m.netRxRate,
    netTxRate: m.netTxRate
  };
}

let pendingMetrics = null;
let metricsRaf = 0;

function onMetrics(sample) {
  state.last.set(sample.targetId, sample);
  const ts = sample.ts || Date.now();
  const chartSample = chartSampleFrom(sample.metrics || {});
  rememberSample(sample.targetId, chartSample, ts);
  if (sample.targetId !== state.selected) {
    if (!state.selected) selectTarget(sample.targetId);
    return;
  }
  charts.cpu.push(chartSample, ts);
  charts.mem.push(chartSample, ts);
  charts.disk.push(chartSample, ts);
  charts.net.push(chartSample, ts);
  pendingMetrics = sample;
  if (metricsRaf) return;
  metricsRaf = requestAnimationFrame(() => {
    metricsRaf = 0;
    const next = pendingMetrics;
    pendingMetrics = null;
    if (!next || next.targetId !== state.selected) return;
    renderCards(next.metrics || {}, next.hello);
  });
}

const HISTORY_KEEP_MS = 600000;

function rememberSample(id, chartSample, ts) {
  let rows = state.history.get(id);
  if (!rows) {
    rows = [];
    state.history.set(id, rows);
  }
  rows.push({ t: ts, sample: chartSample });
  const cutoff = ts - HISTORY_KEEP_MS;
  while (rows.length && rows[0].t < cutoff) rows.shift();
}

function replayHistory(id) {
  for (const c of Object.values(charts)) c.reset();
  const rows = state.history.get(id) || [];
  for (const row of rows) {
    charts.cpu.push(row.sample, row.t);
    charts.mem.push(row.sample, row.t);
    charts.disk.push(row.sample, row.t);
    charts.net.push(row.sample, row.t);
  }
}

const logLines = [];
const MAX_LOG_LINES = 200;

function appendLog(entry) {
  const time = new Date(entry.ts).toLocaleTimeString();
  logLines.push(`${time} [${entry.level}] [${entry.targetName || ""}] ${entry.message}`);
  if (logLines.length > MAX_LOG_LINES) logLines.splice(0, logLines.length - MAX_LOG_LINES);
  logView.textContent = `${logLines.join("\n")}\n`;
  const msg = $("sb-msg");
  if (msg) msg.textContent = `${entry.level}: ${entry.message}`;
}

function refreshStatusBar() {
  const msg = $("sb-msg");
  const targetsEl = $("sb-targets");
  const selectedEl = $("sb-selected");
  const intervalEl = $("sb-interval");
  const windowEl = $("sb-window");
  const langEl = $("sb-lang");
  const themeEl = $("sb-theme");
  if (!targetsEl) return;
  const live = state.targets.filter((row) => row.status === "online" || row.status === "listening").length;
  targetsEl.textContent = `${t("sbTargets")}: ${live}/${state.targets.length}`;
  const row = state.targets.find((x) => x.id === state.selected);
  if (selectedEl) {
    selectedEl.textContent = row ? `${t("sbSelected")}: ${row.name} · ${row.status}` : t("noTarget");
    selectedEl.className = `sb-item ${row ? row.status : "idle"}`;
  }
  if (intervalEl) intervalEl.textContent = `${t("sbInterval")}: ${state.intervalMs} ms`;
  if (windowEl) windowEl.textContent = `${t("sbWindow")}: ${state.windowSec} s`;
  if (langEl) langEl.textContent = state.lang === "ko" ? "한국어" : "English";
  const theme = typeof THEMES !== "undefined" ? THEMES.find((th) => th.id === state.theme) : null;
  if (themeEl) themeEl.textContent = theme ? (state.lang === "en" ? theme.en : theme.ko) : state.theme;
  if (msg && !msg.textContent) msg.textContent = t("sbReady");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toggleFields() {
  const kind = $("kind").value;
  const tcpLike = kind === "tcp-client" || kind === "tcp-server" || kind === "https" || kind === "http";
  $("f-tcp").classList.toggle("hidden", !tcpLike);
  $("f-serial").classList.toggle("hidden", kind !== "serial");
  $("f-sim").classList.toggle("hidden", kind !== "simulator");
  const port = $("conn-port");
  const host = $("conn-host");
  if (port && (kind === "https" || kind === "http")) port.value = "9511";
  else if (port && (kind === "tcp-client" || kind === "tcp-server")) port.value = "9510";
  if (host && (kind === "https" || kind === "http") && (host.value === "127.0.0.1" || !host.value)) host.value = "0.0.0.0";
}

async function refreshSerial() {
  const ports = await window.monitor.serialPorts();
  const sel = $("serial-path");
  sel.innerHTML = "";
  if (!ports.length) {
    sel.innerHTML = `<option value="">${t("noPort")}</option>`;
    return;
  }
  for (const p of ports) {
    const opt = document.createElement("option");
    opt.value = p.path;
    opt.textContent = `${p.path}${p.friendlyName ? " — " + p.friendlyName : ""}`;
    sel.appendChild(opt);
  }
}

async function openAddDialog() {
  await refreshSerial();
  $("dlg").showModal();
}

async function startLocal() {
  const id = await window.monitor.start({ kind: "local", name: t("localAgent"), intervalMs: state.intervalMs });
  selectTarget(id);
}

async function startSim(mode) {
  const name = mode === "rtos" ? t("startRtos") : t("startServer");
  const id = await window.monitor.start({ kind: "simulator", simMode: mode, name, intervalMs: state.intervalMs });
  selectTarget(id);
}

async function stopSelected() {
  if (state.selected) {
    await window.monitor.stop(state.selected);
    state.selected = null;
    selectTarget(null);
  }
}

async function exportLogs(format) {
  const file = await window.monitor.exportLogs(format);
    if (file) appendLog({ ts: Date.now(), level: "info", targetName: "ui", message: `${t("logSaved")}: ${file}` });
}

function toggleLogPanel() {
  document.querySelector(".shell").classList.toggle("log-hidden");
}

async function runAction(action) {
  closeMenus();
  hideTooltip();
  switch (action) {
    case "add":
      return openAddDialog();
    case "local":
      return startLocal();
    case "sim-rtos":
      return startSim("rtos");
    case "sim-srv":
      return startSim("server");
    case "stop":
      return stopSelected();
    case "export-txt":
      return exportLogs("txt");
    case "export-csv":
      return exportLogs("csv");
    case "export-json":
      return exportLogs("json");
    case "toggle-log":
      return toggleLogPanel();
    case "settings":
      return openSettings();
    case "toggle-lang":
      return toggleLang();
    case "about":
      return openAbout();
    case "quit":
      return window.monitor.quit();
    default:
      return;
  }
}

function closeMenus() {
  document.querySelectorAll(".menu.open").forEach((el) => el.classList.remove("open"));
}

function hideTooltip() {
  const tip = $("tooltip");
  tip.hidden = true;
}

function showTooltip(el) {
  const tip = $("tooltip");
  const text = el.getAttribute("data-tip") || (el.dataset.i18nTip ? t(el.dataset.i18nTip) : "");
  if (!text) return;
  tip.textContent = text;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth;
  let left = r.left + r.width / 2;
  left = Math.max(tw / 2 + 8, Math.min(left, window.innerWidth - tw / 2 - 8));
  tip.style.left = `${left}px`;
  tip.style.top = `${r.bottom + 8}px`;
}

document.querySelectorAll(".menu-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = btn.parentElement;
    const open = menu.classList.contains("open");
    closeMenus();
    if (!open) menu.classList.add("open");
  });
});

document.addEventListener("click", () => closeMenus());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenus();
});

document.querySelectorAll("[data-action]").forEach((el) => {
  el.addEventListener("click", (e) => {
    if (el.classList.contains("menu-btn") && el.dataset.menu) return;
    e.preventDefault();
    runAction(el.dataset.action);
  });
});

document.querySelectorAll("[data-tip], [data-i18n-tip]").forEach((el) => {
  if (!el.getAttribute("aria-label") && (el.dataset.tip || el.dataset.i18nTip)) {
    el.setAttribute("aria-label", el.dataset.tip || t(el.dataset.i18nTip));
  }
  el.addEventListener("mouseenter", () => showTooltip(el));
  el.addEventListener("mouseleave", hideTooltip);
  el.addEventListener("focus", () => showTooltip(el));
  el.addEventListener("blur", hideTooltip);
});

function toolbarContentWidth() {
  const bar = document.querySelector(".toolbar");
  if (!bar) return 1360;
  const styles = getComputedStyle(bar);
  const pad = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
  const gap = parseFloat(styles.columnGap || styles.gap) || 0;
  const kids = [...bar.children];
  let width = pad;
  kids.forEach((el, i) => {
    width += el.getBoundingClientRect().width;
    if (i < kids.length - 1) width += gap;
  });
  return Math.ceil(width);
}

function syncWindowMinWidth() {
  const apply = () => {
    const width = toolbarContentWidth();
    if (window.monitor.setMinContentWidth) window.monitor.setMinContentWidth(width);
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
  for (const c of Object.values(charts)) {
    if (typeof c.refreshTheme === "function") c.refreshTheme();
    c.draw();
  }
  refreshStatusBar();
}

function applyLang(lang) {
  state.lang = lang === "en" ? "en" : "ko";
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (el.id === "dash-title" || el.id === "sb-msg" || el.id === "sb-selected") return;
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-tip]").forEach((el) => {
    el.setAttribute("data-tip", t(el.dataset.i18nTip));
    el.setAttribute("aria-label", t(el.dataset.i18nTip));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  const flag = flagForSwitch(state.lang);
  $("lang-flag").innerHTML = flag;
  document.querySelectorAll(".flag-clone").forEach((el) => {
    el.innerHTML = flag;
  });
  const langLabel = $("settings-lang-label");
  if (langLabel) langLabel.textContent = state.lang === "ko" ? "한국어" : "English";
  renderThemeGrid();
  if (state.selected) selectTarget(state.selected);
  else {
    renderTargets();
    refreshStatusBar();
  }
  syncWindowMinWidth();
}

async function persist() {
  await window.monitor.settingsSet({
    language: state.lang,
    theme: state.theme,
    intervalMs: state.intervalMs,
    windowSec: state.windowSec
  });
}

async function toggleLang() {
  applyLang(state.lang === "ko" ? "en" : "ko");
  await persist();
}

function renderThemeGrid() {
  const dark = $("theme-dark");
  const light = $("theme-light");
  if (!dark || !light) return;
  const paint = (el, group) => {
    el.innerHTML = THEMES.filter((th) => th.group === group)
      .map((th) => `<button type="button" class="theme-swatch${th.id === state.theme ? " active" : ""}" data-theme="${th.id}">
        <div class="dot" style="background:${th.swatch}; box-shadow: inset 0 0 0 2px ${th.accent}"></div>
        <small>${state.lang === "en" ? th.en : th.ko}</small>
      </button>`)
      .join("");
    el.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.onclick = async () => {
        applyTheme(btn.dataset.theme);
        await persist();
      };
    });
  };
  paint(dark, "dark");
  paint(light, "light");
}

function openSettings() {
  return window.monitor.openSettings();
}

function applyIncomingSettings(s) {
  if (!s) return;
  if (s.theme && s.theme !== state.theme) applyTheme(s.theme);
  if (s.language && s.language !== state.lang) applyLang(s.language);
  if (Number.isFinite(s.intervalMs) && s.intervalMs !== state.intervalMs) {
    setIntervalLocal(s.intervalMs);
  }
  if (Number.isFinite(s.windowSec) && s.windowSec !== state.windowSec) {
    setWindowLocal(s.windowSec);
  }
}

async function openAbout() {
  const info = await window.monitor.appInfo();
  $("about-meta").innerHTML = `
    <li>${t("aboutAuthor")}: ${info.author || "SHKWON(knix008@naver.com)"}</li>
    <li>${t("aboutVer")}: ${info.version}</li>
    <li>${t("aboutPlat")}: Web / Windows / Linux / macOS / RTOS</li>
    <li>${t("aboutConn")}: Serial, Ethernet (TCP)</li>
    <li>${t("aboutProto")}: MMON, JSON Lines, key=value</li>
    <li>${t("aboutLang")}: 한국어, English</li>
    <li>${t("aboutTheme")}: Dark 10 / Light 10</li>
    <li>Electron ${info.electron} · Node ${info.node}</li>
  `;
  $("about-dlg").showModal();
}

const INTERVAL_MIN = 200;
const INTERVAL_MAX = 10000;
const INTERVAL_STEP = 100;

function clampInterval(ms, fallback = 1000) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(INTERVAL_MIN, Math.min(INTERVAL_MAX, Math.round(n)));
}

function syncIntervalButtons(stepper, value) {
  const down = stepper.querySelector("[data-interval-dir='-1']");
  const up = stepper.querySelector("[data-interval-dir='1']");
  if (down) down.disabled = value <= INTERVAL_MIN;
  if (up) up.disabled = value >= INTERVAL_MAX;
}

function refreshIntervalButtons() {
  document.querySelectorAll('.interval-stepper[data-step="interval"]').forEach((stepper) => {
    const input = stepper.querySelector(".interval-input");
    syncIntervalButtons(stepper, clampInterval(input && input.value, state.intervalMs));
  });
}

function setIntervalLocal(ms) {
  const next = clampInterval(ms, state.intervalMs);
  state.intervalMs = next;
  const bar = $("interval-ms");
  if (bar) bar.value = String(next);
  const conn = $("conn-interval");
  if (conn) conn.value = String(next);
  refreshIntervalButtons();
  refreshStatusBar();
  return next;
}

async function applyInterval(ms) {
  const next = setIntervalLocal(ms);
  await window.monitor.setIntervalMs(next);
}

function bindIntervalStepper(input, options = {}) {
  const stepper = input.closest(".interval-stepper");
  if (!stepper) return;
  const down = stepper.querySelector("[data-interval-dir='-1']");
  const up = stepper.querySelector("[data-interval-dir='1']");

  async function commit(raw) {
    const next = clampInterval(raw, state.intervalMs);
    input.value = String(next);
    syncIntervalButtons(stepper, next);
    if (options.apply) await options.apply(next);
  }

  if (down) down.addEventListener("click", () => commit(clampInterval(input.value, state.intervalMs) - INTERVAL_STEP));
  if (up) up.addEventListener("click", () => commit(clampInterval(input.value, state.intervalMs) + INTERVAL_STEP));
  input.addEventListener("change", () => commit(input.value));
  input.addEventListener("blur", () => {
    input.value = String(clampInterval(input.value, state.intervalMs));
    syncIntervalButtons(stepper, Number(input.value));
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      commit(clampInterval(input.value, state.intervalMs) - INTERVAL_STEP);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      commit(clampInterval(input.value, state.intervalMs) + INTERVAL_STEP);
    } else if (e.key === "Enter" && options.applyOnEnter) {
      e.preventDefault();
      commit(input.value);
    }
  });
  syncIntervalButtons(stepper, clampInterval(input.value, state.intervalMs));
}

const WINDOW_MIN = 10;
const WINDOW_MAX = 600;
const WINDOW_STEP = 10;

function clampWindow(sec, fallback = 60) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(WINDOW_MIN, Math.min(WINDOW_MAX, Math.round(n)));
}

function syncWindowButtons(stepper, value) {
  const down = stepper.querySelector("[data-window-dir='-1']");
  const up = stepper.querySelector("[data-window-dir='1']");
  if (down) down.disabled = value <= WINDOW_MIN;
  if (up) up.disabled = value >= WINDOW_MAX;
}

function refreshWindowButtons() {
  document.querySelectorAll('.interval-stepper[data-step="window"]').forEach((stepper) => {
    const input = stepper.querySelector(".interval-input");
    syncWindowButtons(stepper, clampWindow(input && input.value, state.windowSec));
  });
}

function setWindowLocal(sec) {
  const next = clampWindow(sec, state.windowSec);
  state.windowSec = next;
  const bar = $("window-sec");
  if (bar) bar.value = String(next);
  RealtimeChart.setAllWindowMs(next * 1000);
  refreshWindowButtons();
  refreshStatusBar();
  return next;
}

async function applyWindow(sec) {
  const next = setWindowLocal(sec);
  await persist();
  return next;
}

function bindWindowStepper(input, options = {}) {
  const stepper = input && input.closest(".interval-stepper");
  if (!input || !stepper) return;
  const down = stepper.querySelector("[data-window-dir='-1']");
  const up = stepper.querySelector("[data-window-dir='1']");

  async function commit(raw) {
    const next = clampWindow(raw, state.windowSec);
    input.value = String(next);
    syncWindowButtons(stepper, next);
    if (options.apply) await options.apply(next);
  }

  if (down) down.addEventListener("click", () => commit(clampWindow(input.value, state.windowSec) - WINDOW_STEP));
  if (up) up.addEventListener("click", () => commit(clampWindow(input.value, state.windowSec) + WINDOW_STEP));
  input.addEventListener("change", () => commit(input.value));
  input.addEventListener("blur", () => {
    input.value = String(clampWindow(input.value, state.windowSec));
    syncWindowButtons(stepper, Number(input.value));
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      commit(clampWindow(input.value, state.windowSec) - WINDOW_STEP);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      commit(clampWindow(input.value, state.windowSec) + WINDOW_STEP);
    } else if (e.key === "Enter" && options.applyOnEnter) {
      e.preventDefault();
      commit(input.value);
    }
  });
  syncWindowButtons(stepper, clampWindow(input.value, state.windowSec));
}

$("btn-dlg-cancel").onclick = () => $("dlg").close();
$("kind").onchange = toggleFields;
bindIntervalStepper($("interval-ms"), { apply: applyInterval, applyOnEnter: true });
bindIntervalStepper($("conn-interval"));
bindWindowStepper($("window-sec"), { apply: applyWindow, applyOnEnter: true });

$("conn-form").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  e.preventDefault();
  const fd = new FormData($("conn-form"));
  const config = Object.fromEntries(fd.entries());
  config.intervalMs = Number(config.intervalMs) || state.intervalMs;
  config.port = Number(config.port) || 9510;
  config.baudRate = Number(config.baudRate) || 115200;
  try {
    const id = await window.monitor.start(config);
    $("dlg").close();
    selectTarget(id);
    for (const c of Object.values(charts)) c.reset();
  } catch (err) {
    appendLog({ ts: Date.now(), level: "error", targetName: "ui", message: err.message });
  }
});

$("btn-add").onclick = () => runAction("add");
$("btn-local").onclick = () => runAction("local");
$("btn-sim-rtos").onclick = () => runAction("sim-rtos");
$("btn-sim-srv").onclick = () => runAction("sim-srv");
$("btn-stop").onclick = () => runAction("stop");

window.monitor.onTargets((list) => {
  state.targets = list;
  if (state.selected && !list.some((t) => t.id === state.selected)) {
    state.selected = list[0]?.id || null;
    selectTarget(state.selected);
    return;
  }
  renderTargets();
  refreshStatusBar();
});

window.monitor.onMetrics(onMetrics);
window.monitor.onLog(appendLog);
if (window.monitor.onSettings) window.monitor.onSettings(applyIncomingSettings);

function tickClock() {
  $("clock").textContent = new Date().toLocaleString();
}
tickClock();
setInterval(tickClock, 1000);

window.monitor.logs().then((rows) => rows.forEach(appendLog));
renderTargets();
refreshStatusBar();
toggleFields();

window.monitor.settingsGet().then(async (s) => {
  try {
    const info = await window.monitor.appInfo();
    document.title = `MyMonitor MultiOS v${info.version}`;
    applyTheme(s.theme || "midnight");
    applyLang(s.language || "ko");
    await applyInterval(s.intervalMs || 1000);
    setWindowLocal(s.windowSec || 60);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => syncWindowMinWidth()).catch(() => syncWindowMinWidth());
    } else syncWindowMinWidth();
  } catch (err) {
    appendLog({ ts: Date.now(), level: "error", targetName: "ui", message: err.message });
  }
  const id = await window.monitor.start({ kind: "local", name: t("localAgent"), intervalMs: state.intervalMs });
  selectTarget(id);
}).catch((err) => {
  appendLog({ ts: Date.now(), level: "error", targetName: "ui", message: String(err && err.message || err) });
});

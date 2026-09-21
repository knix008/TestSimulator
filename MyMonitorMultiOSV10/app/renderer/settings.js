const state = {
  lang: "ko",
  theme: "midnight",
  intervalMs: 1000,
  windowSec: 60
};

const INTERVAL_MIN = 200;
const INTERVAL_MAX = 10000;
const INTERVAL_STEP = 100;
const $ = (id) => document.getElementById(id);

function t(key) {
  const pack = I18N[state.lang] || I18N.ko;
  return pack[key] || I18N.en[key] || key;
}

function settingsTitle() {
  return state.lang === "en" ? "Settings — MyMonitor MultiOS" : "설정 — MyMonitor MultiOS";
}

function hideTooltip() {
  const tip = $("tooltip");
  if (tip) tip.hidden = true;
}

function showTooltip(el) {
  const tip = $("tooltip");
  if (!tip) return;
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

function setIntervalLocal(ms) {
  const next = clampInterval(ms, state.intervalMs);
  state.intervalMs = next;
  const input = $("settings-interval");
  if (input) input.value = String(next);
  const stepper = input && input.closest(".interval-stepper");
  if (stepper) syncIntervalButtons(stepper, next);
  return next;
}

async function applyInterval(ms) {
  const next = setIntervalLocal(ms);
  await window.monitor.setIntervalMs(next);
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

function applyLang(lang) {
  state.lang = lang === "en" ? "en" : "ko";
  document.documentElement.lang = state.lang;
  document.title = settingsTitle();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-tip]").forEach((el) => {
    el.setAttribute("data-tip", t(el.dataset.i18nTip));
    el.setAttribute("aria-label", t(el.dataset.i18nTip));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  const flag = flagForSwitch(state.lang);
  document.querySelectorAll(".flag-clone").forEach((el) => {
    el.innerHTML = flag;
  });
  const label = $("settings-lang-label");
  if (label) label.textContent = state.lang === "ko" ? "한국어" : "English";
  renderThemeGrid();
  syncThemeGroup();
}

async function persist() {
  await window.monitor.settingsSet({
    language: state.lang,
    theme: state.theme,
    intervalMs: state.intervalMs,
    windowSec: state.windowSec
  });
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

function showSettingsTab(id) {
  const next = id === "theme" ? "theme" : "general";
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.tab === next ? "true" : "false");
  });
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== next);
  });
}

function showThemeGroup(group) {
  const next = group === "light" ? "light" : "dark";
  document.querySelectorAll("[data-theme-group]").forEach((btn) => {
    btn.setAttribute("aria-selected", btn.dataset.themeGroup === next ? "true" : "false");
  });
  const dark = $("theme-dark");
  const light = $("theme-light");
  if (dark) dark.classList.toggle("hidden", next !== "dark");
  if (light) light.classList.toggle("hidden", next !== "light");
}

function syncThemeGroup() {
  const row = typeof THEMES !== "undefined" ? THEMES.find((th) => th.id === state.theme) : null;
  showThemeGroup(row && row.group === "light" ? "light" : "dark");
}

function bindIntervalStepper(input, options = {}) {
  const stepper = input.closest(".interval-stepper");
  if (!stepper) return;

  async function commit(raw) {
    const next = clampInterval(raw, state.intervalMs);
    input.value = String(next);
    syncIntervalButtons(stepper, next);
    if (options.apply) await options.apply(next);
  }

  stepper.querySelector("[data-interval-dir='-1']")?.addEventListener("click", () => {
    commit(clampInterval(input.value, state.intervalMs) - INTERVAL_STEP);
  });
  stepper.querySelector("[data-interval-dir='1']")?.addEventListener("click", () => {
    commit(clampInterval(input.value, state.intervalMs) + INTERVAL_STEP);
  });
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

function setWindowLocal(sec) {
  const next = clampWindow(sec, state.windowSec);
  state.windowSec = next;
  const input = $("settings-window");
  if (input) input.value = String(next);
  const stepper = input && input.closest(".interval-stepper");
  if (stepper) syncWindowButtons(stepper, next);
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

  async function commit(raw) {
    const next = clampWindow(raw, state.windowSec);
    input.value = String(next);
    syncWindowButtons(stepper, next);
    if (options.apply) await options.apply(next);
  }

  stepper.querySelector("[data-window-dir='-1']")?.addEventListener("click", () => {
    commit(clampWindow(input.value, state.windowSec) - WINDOW_STEP);
  });
  stepper.querySelector("[data-window-dir='1']")?.addEventListener("click", () => {
    commit(clampWindow(input.value, state.windowSec) + WINDOW_STEP);
  });
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

function applyIncoming(s) {
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

document.querySelectorAll("[data-tab]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    showSettingsTab(el.dataset.tab);
  });
});

document.querySelectorAll("[data-theme-group]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    showThemeGroup(el.dataset.themeGroup);
  });
});

document.querySelectorAll("[data-action]").forEach((el) => {
  el.addEventListener("click", async (e) => {
    e.preventDefault();
    if (el.dataset.action === "toggle-lang") {
      applyLang(state.lang === "ko" ? "en" : "ko");
      await persist();
    }
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

bindIntervalStepper($("settings-interval"), { apply: applyInterval, applyOnEnter: true });
bindWindowStepper($("settings-window"), { apply: applyWindow, applyOnEnter: true });

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  applyTheme(state.theme);
  await applyInterval($("settings-interval").value);
  await applyWindow($("settings-window").value);
  await persist();
});

$("btn-settings-close").onclick = async () => {
  if (window.monitor.closeSettings) await window.monitor.closeSettings();
  else window.close();
};

if (window.monitor.onSettings) window.monitor.onSettings(applyIncoming);

window.monitor.settingsGet().then((s) => {
  applyTheme(s.theme || "midnight");
  applyLang(s.language || "ko");
  setIntervalLocal(s.intervalMs || 1000);
  setWindowLocal(s.windowSec || 60);
  syncThemeGroup();
}).catch(() => {
  applyTheme("midnight");
  applyLang("ko");
  syncThemeGroup();
});

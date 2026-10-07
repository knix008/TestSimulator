import { APP_INFO } from "../core/app-info.js";
import { errorCopyText } from "../core/errors.js";
import { FONT_STYLES } from "../core/fonts.js";
import { CUSTOM_THEME_ID, DARK_THEMES, LIGHT_THEMES, applyThemeVars, sanitizeCustomTheme, themeColors, themeVars } from "../core/themes.js";
import { SOURCE_IDS } from "../weather/providers.js";
import { esc } from "./html.js";
import { icon } from "./icons.js";
import { layoutTabScroller } from "./tab-scroller.js";

const ROW = "display:flex;align-items:center;gap:8px;height:32px;white-space:nowrap;overflow:hidden;flex:0 0 auto";
export const THEME_GRID_HEIGHT = 252;
const SETTINGS_ROW_GAP = 10;

export function buildSettingsSpec(model) {
  const t = model.t;
  const values = model.values;
  const recent = model.recent || [];
  return {
    type: "settings",
    icon: "settings",
    title: t("popup.settings"),
    width: 680,
    height: 640,
    resizable: false,
    scroll: "none",
    activeTab: model.activeTab || "general",
    catalog: model.catalog || [],
    language: model.language || "ko",
    tabs: [
      { id: "general", label: t("tab.general"), rows: generalRows(model) },
      { id: "appearance", label: t("tab.appearance"), rows: appearanceRows(model) },
      { id: "wallpaper", label: t("tab.wallpaper"), rows: wallpaperRows(model) },
      { id: "font", label: t("tab.font"), rows: fontRows(model) },
      { id: "data", label: t("tab.data"), rows: dataRows(model) },
      { id: "recent", label: t("tab.recent"), rows: recentRows(recent, t) },
    ],
    closeLabel: t("tip.close"),
    buttons: [
      { id: "ok", action: "ok", icon: "check", label: t("btn.ok") },
      { id: "cancel", action: "cancel", icon: "close", label: t("btn.cancel") },
    ],
    values,
  };
}

export function buildAboutSpec(t) {
  return {
    type: "about",
    icon: "about",
    title: t("popup.about"),
    width: 560,
    height: 420,
    resizable: false,
    scroll: "none",
    rows: [
      { kind: "static", id: "name", label: APP_INFO.name, value: APP_INFO.version },
      { kind: "static", id: "version", label: t("about.version"), value: APP_INFO.version },
      { kind: "static", id: "build", label: t("about.buildNumber"), value: APP_INFO.buildNumber },
      { kind: "static", id: "date", label: t("about.buildDate"), value: APP_INFO.buildDate },
      { kind: "static", id: "author", label: t("about.author"), value: APP_INFO.author },
      { kind: "static", id: "desc", label: t("about.description"), value: APP_INFO.author },
    ],
    buttons: [{ id: "close", action: "close", icon: "close", label: t("btn.close") }],
  };
}

export const ERROR_DETAIL_LINES = 3;
export const ERROR_TEXT_HEIGHT = 116;

export function buildErrorSpec(info, t) {
  const lines = String(info.details || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => index > 0 || line !== `${info.code}: ${info.message}`);
  const rows = [{ kind: "static", id: "summary", label: info.code, value: info.message, tone: "danger" }];
  if (info.time) rows.push({ kind: "static", id: "time", label: t("error.time"), value: info.time });
  if (info.operation) rows.push({ kind: "static", id: "operation", label: t("error.operation"), value: info.operation });
  if (info.app) rows.push({ kind: "static", id: "app", label: t("error.app"), value: info.app });
  if (info.environment) rows.push({ kind: "static", id: "environment", label: t("error.environment"), value: info.environment });
  lines.slice(0, ERROR_DETAIL_LINES).forEach((line, index) => {
    rows.push({ kind: "static", id: `detail-${index}`, label: `${t("error.detail")} ${index + 1}`, value: line });
  });
  if (lines.length > ERROR_DETAIL_LINES) rows.push({ kind: "static", id: "more", label: t("error.more"), value: t("error.moreCount", { n: lines.length - ERROR_DETAIL_LINES }) });
  const copyText = errorCopyText(info, {
    time: t("error.time"),
    operation: t("error.operation"),
    app: t("error.app"),
    environment: t("error.environment"),
  });
  rows.push({ kind: "input", id: "full", label: t("error.copyHint"), value: copyText, multiline: true });
  return {
    type: "error",
    icon: "warning",
    title: t("popup.error"),
    width: 680,
    height: 520,
    resizable: false,
    scroll: "none",
    copyText,
    rows,
    buttons: [
      { id: "copy", action: "copy", icon: "copy", label: t("btn.copy") },
      { id: "close", action: "close", icon: "close", label: t("btn.close") },
    ],
  };
}

export function buildProgressSpec(title, t) {
  return {
    type: "progress",
    icon: "download",
    title,
    width: 480,
    height: 220,
    resizable: false,
    scroll: "none",
    rows: [
      { kind: "static", id: "message", label: t("progress.fetch"), value: title },
      { kind: "bar", id: "bar", label: "0%" },
    ],
    buttons: [{ id: "cancel", action: "cancel", icon: "close", label: t("btn.cancel") }],
  };
}

export function buildUnsavedSpec(fileLabel, t) {
  return {
    type: "unsaved",
    icon: "save",
    title: t("popup.unsaved"),
    width: 520,
    height: 240,
    resizable: false,
    scroll: "none",
    rows: [
      { kind: "static", id: "message", label: t("unsaved.message"), value: "" },
      { kind: "static", id: "file", label: fileLabel || "MyWeather", value: "" },
    ],
    buttons: [
      { id: "save", action: "save", icon: "save", label: t("btn.save") },
      { id: "discard", action: "discard", icon: "trash", label: t("btn.discard") },
      { id: "cancel", action: "cancel", icon: "close", label: t("btn.cancel") },
    ],
  };
}

export function buildPrintSpec(t, draft) {
  return {
    type: "print",
    icon: "print",
    title: t("popup.print"),
    width: 560,
    height: 360,
    resizable: false,
    scroll: "none",
    rows: [
      { kind: "radio", id: "scope-all", name: "scope", value: "all", checked: draft.scope === "all", label: t("print.scopeAll") },
      { kind: "radio", id: "scope-current", name: "scope", value: "current", checked: draft.scope !== "all" && draft.scope !== "custom", label: t("print.scopeCurrent") },
      { kind: "radio", id: "scope-custom", name: "scope", value: "custom", checked: draft.scope === "custom", label: t("print.scopeCustom") },
      { kind: "date", id: "from", label: t("print.from"), value: draft.from || "" },
      { kind: "date", id: "to", label: t("print.to"), value: draft.to || "" },
    ],
    buttons: [
      { id: "preview", action: "preview", icon: "eye", label: t("btn.preview") },
      { id: "cancel", action: "cancel", icon: "close", label: t("btn.cancel") },
    ],
  };
}

export function buildPreviewSpec(printModel, t) {
  const setup = printModel.pageSetup;
  return {
    type: "preview",
    icon: "print",
    title: t("popup.preview"),
    width: 760,
    height: 620,
    resizable: false,
    scroll: "none",
    html: printModel.html,
    activeTab: "setup",
    tabs: [
      {
        id: "setup",
        label: t("tab.setup"),
        rows: [
          {
            kind: "select",
            id: "paper",
            setup: true,
            label: t("print.paper"),
            value: setup.paper,
            options: ["A4", "A3", "Letter"].map((value) => ({ value, label: value })),
          },
          {
            kind: "select",
            id: "orientation",
            setup: true,
            label: t("print.orientation"),
            value: setup.orientation,
            options: [
              { value: "portrait", label: t("print.portrait") },
              { value: "landscape", label: t("print.landscape") },
            ],
          },
          {
            kind: "select",
            id: "margin",
            setup: true,
            label: t("print.margin"),
            value: String(setup.margin),
            options: [10, 15, 20].map((value) => ({ value: String(value), label: `${value} mm` })),
          },
        ],
      },
      ...printModel.pages.map((page, index) => ({
        id: `page-${index}`,
        label: t("print.page", { n: index + 1 }),
        rows: [],
        lines: page,
      })),
    ],
    buttons: [
      { id: "print", action: "print", icon: "print", label: t("btn.printNow") },
      { id: "close", action: "close", icon: "close", label: t("btn.close") },
    ],
  };
}

const FORECAST_WIDTH = { daily: 640, weekly: 720, monthly: 720 };

export function buildForecastSpec({ range, markup, fitHeight, transparency = 0, t }) {
  const body = Math.max(72, Number(fitHeight) || 72);
  return {
    type: "forecast",
    range,
    icon: range,
    title: t(`forecast.${range}`),
    transparency: Math.max(0, Math.min(100, Math.round(Number(transparency) || 0))),
    width: FORECAST_WIDTH[range] || 640,
    height: 44 + 48 + 16 + body,
    markup,
    fitHeight: body,
    buttons: [{ id: "close", action: "close", icon: "close", label: t("btn.close") }],
  };
}

export function buildPopupElement(spec) {
  const el = document.createElement("section");
  el.className = "popup";
  el.dataset.popup = spec.type;
  el.dataset.gui = "popup";
  el.dataset.scroll = "none";
  el.dataset.independent = "true";
  el.dataset.columns = "1";
  el.tabIndex = -1;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.style.width = `${spec.width}px`;
  el.style.height = `${spec.height}px`;
  el.style.overflow = "hidden";
  el.style.resize = "none";
  el.style.position = "fixed";
  el.style.boxSizing = "border-box";
  el._html = spec.html || "";
  el.dataset.printHtml = spec.html || "";
  const tabs = spec.tabs || [];
  const panels = tabs.length
    ? tabs
        .map(
          (tab) =>
            `<div class="popup-panel" data-panel="${esc(tab.id)}" ${tab.id === (spec.activeTab || tabs[0].id) ? "" : "hidden"} style="overflow:hidden;display:${tab.id === (spec.activeTab || tabs[0].id) ? "flex" : "none"};flex-direction:column">${tab.lines ? previewBlock(tab.lines) : ""}${tab.rows.map((row) => renderRow(row)).join("")}</div>`,
        )
        .join("")
    : `<div class="popup-panel" data-panel="main" style="overflow:hidden;display:flex;flex-direction:column">${forecastBlock(spec)}${(spec.rows || []).map((row) => renderRow(row)).join("")}</div>`;
  const tabBar = tabs.length
    ? `<div class="popup-tabs" data-gui="popup-tabs" style="display:flex;height:36px;overflow:hidden;flex:0 0 auto"><div class="popup-tabstrip" style="display:flex;overflow:hidden;flex:1;min-width:0"></div><button type="button" data-action="tab-prev" data-gui="tab-nav" title="&lt;">&lt;</button><button type="button" data-action="tab-next" data-gui="tab-nav" title="&gt;">&gt;</button></div>`
    : "";
  const closeLabel = spec.closeLabel || "Close";
  el.innerHTML = `<header class="popup-head" style="height:44px;display:flex;align-items:center;gap:8px;overflow:hidden;flex:0 0 auto;white-space:nowrap"><span class="popup-icon">${icon(spec.icon || "info")}</span><span class="popup-title">${esc(spec.title || "")}</span><button type="button" class="icon-btn win-btn win-close popup-x" data-action="${spec.type === "progress" ? "cancel" : "close"}" data-gui="popup-close" title="${esc(closeLabel)}" aria-label="${esc(closeLabel)}">${icon("windowClose")}</button></header>${tabBar}<div class="popup-body" style="overflow:hidden;flex:1 1 auto;min-height:0">${panels}</div><footer class="popup-foot" style="height:48px;display:flex;align-items:center;justify-content:flex-end;gap:8px;overflow:hidden;flex:0 0 auto">${(spec.buttons || [])
    .map(
      (button, index) =>
        `<button type="button" class="popup-btn${index === 0 ? " primary" : ""}" data-action="${esc(button.action)}" data-gui="popup-button" title="${esc(button.label)}" style="white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${icon(button.icon || "dot")}<span class="menu-label">${esc(button.label)}</span></button>`,
    )
    .join("")}</footer>`;
  for (const row of rowsOf(spec)) {
    if (row.kind !== "input" || !/^[\w-]+$/.test(row.id)) continue;
    const input = el.querySelector(`[data-field="${row.id}"]`);
    if (input) input.value = row.value == null ? "" : String(row.value);
  }
  return el;
}

function themeDraft(el) {
  return {
    theme: el.querySelector('[data-field="theme"]')?.value || "",
    transparency: el.querySelector('[data-field="transparency"]')?.value,
    customTheme: sanitizeCustomTheme({
      mode: el.querySelector('[data-field="customMode"]')?.value,
      bg: el.querySelector('[data-field="customBg"]')?.value,
      text: el.querySelector('[data-field="customText"]')?.value,
      accent: el.querySelector('[data-field="customAccent"]')?.value,
    }),
  };
}

function showThemeGroup(el, mode) {
  el.querySelectorAll("[data-theme-group]").forEach((group) => {
    const on = group.dataset.themeGroup === mode;
    group.hidden = !on;
    group.style.display = on ? (mode === CUSTOM_THEME_ID ? "flex" : "grid") : "none";
  });
  el.querySelectorAll("[data-theme-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeMode === mode)));
}

function markTheme(el, id) {
  const field = el.querySelector('[data-field="theme"]');
  if (field) field.value = id;
  el.querySelectorAll(".swatch[data-theme-id]").forEach((swatch) => swatch.setAttribute("aria-pressed", String(swatch.dataset.themeId === id)));
}

function paintCustomChip(el) {
  const draft = themeDraft(el).customTheme;
  const chip = el.querySelector('.swatch[data-theme-id="custom"] .chip');
  if (!chip) return;
  chip.style.background = `linear-gradient(160deg, ${draft.bg}, ${draft.bg})`;
  chip.style.color = draft.text;
  const dot = chip.querySelector("i");
  if (dot) dot.style.background = draft.accent;
}

function forecastBlock(spec) {
  if (!spec.markup) return "";
  const height = Math.max(0, Number(spec.fitHeight) || 0);
  return `<div class="forecast-fit" data-gui="forecast" data-range="${esc(spec.range || "")}" data-fit-height="${height}" style="height:${height}px;overflow:hidden;display:flex;flex-direction:column;min-height:0">${spec.markup}</div>`;
}

function rowsOf(spec) {
  const rows = [...(spec.rows || [])];
  for (const tab of spec.tabs || []) rows.push(...(tab.rows || []));
  return rows;
}

export function wirePopup(el, spec, handlers = {}) {
  const finish = (result) => handlers.result?.(result);
  let tabStart = 0;
  const renderTabs = () => {
    const strip = el.querySelector(".popup-tabstrip");
    if (!strip || !spec.tabs) return;
    const layout = layoutTabScroller(tabStart, spec.tabs.length, Math.max(132, (spec.width || 640) - 120), 132);
    tabStart = layout.start;
    strip.innerHTML = "";
    spec.tabs.slice(layout.start, layout.start + layout.visible).forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "popup-tab";
      button.dataset.tab = tab.id;
      button.dataset.gui = "popup-tab";
      button.title = tab.label;
      button.style.whiteSpace = "nowrap";
      button.style.height = "32px";
      button.textContent = tab.label;
      if (tab.id === activeTab()) button.classList.add("is-active");
      button.addEventListener("click", () => activate(tab.id));
      strip.appendChild(button);
    });
    const prev = el.querySelector('[data-action="tab-prev"]');
    const next = el.querySelector('[data-action="tab-next"]');
    if (prev) prev.disabled = !layout.showPrev;
    if (next) next.disabled = !layout.showNext;
    el.dataset.tabStart = String(layout.start);
  };
  const activeTab = () => el.querySelector(".popup-panel:not([hidden])")?.dataset.panel || spec.activeTab;
  const activate = (id) => {
    el.querySelectorAll(".popup-panel").forEach((panel) => {
      const on = panel.dataset.panel === id;
      panel.hidden = !on;
      panel.style.display = on ? "flex" : "none";
    });
    el.querySelectorAll(".popup-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === id));
  };
  renderTabs();
  const previewTheme = () => {
    const draft = themeDraft(el);
    handlers.localTheme?.(draft);
    void handlers.immediate?.({ type: "theme-preview", ...draft, popupId: spec.popupId });
  };
  const setTransparency = (value) => {
    const input = el.querySelector('[data-field="transparency"]');
    if (!input) return;
    input.value = String(Math.max(0, Math.min(100, Math.round(Number(value) || 0))));
    const out = el.querySelector('[data-out="transparency"]');
    if (out) out.textContent = `${input.value}%`;
    previewTheme();
  };
  el.addEventListener("contextmenu", (event) => {
    if (spec.type !== "forecast") return;
    const day = event.target.closest("[data-date]");
    if (!day) return;
    event.preventDefault();
    void handlers.immediate?.({ type: "select-date", date: day.dataset.date, clientX: event.clientX, clientY: event.clientY, popupId: spec.popupId });
  });
  let suppressClick = false;
  const onPopupPointer = (event) => {
    const forecastDay = spec.type === "forecast" ? event.target.closest("[data-date]") : null;
    if (forecastDay && !event.target.closest("[data-action]")) {
      void handlers.immediate?.({ type: "select-date", date: forecastDay.dataset.date, popupId: spec.popupId });
      return;
    }
    const recent = event.target.closest("[data-action='recent-delete']");
    if (recent) {
      recent.closest(".popup-row")?.remove();
      void handlers.immediate?.({ type: "recent-delete", path: recent.dataset.path, popupId: spec.popupId });
      return;
    }
    const opener = event.target.closest("[data-action='recent-open']");
    if (opener) {
      finish({ action: "recent-open", path: opener.dataset.path });
      return;
    }
    const modeButton = event.target.closest("[data-theme-mode]");
    if (modeButton) {
      showThemeGroup(el, modeButton.dataset.themeMode);
      return;
    }
    const swatchButton = event.target.closest(".swatch[data-theme-id]");
    if (swatchButton) {
      markTheme(el, swatchButton.dataset.themeId);
      previewTheme();
      return;
    }
    const step = event.target.closest("[data-step]");
    if (step) {
      const input = el.querySelector(`[data-field="${step.dataset.target}"]`);
      setTransparency(Number(input?.value || 0) + Number(step.dataset.step));
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "tab-prev") {
      tabStart -= 1;
      renderTabs();
      return;
    }
    if (action === "tab-next") {
      tabStart += 1;
      renderTabs();
      return;
    }
    if (action === "recent-clear") {
      el.querySelectorAll(".popup-row[data-recent]").forEach((row) => row.remove());
      void handlers.immediate?.({ type: "recent-clear", popupId: spec.popupId });
      return;
    }
    if (action === "search-online") {
      void handlers.immediate?.({ type: "search-online", query: el.querySelector('[data-field="search"]')?.value || "", popupId: spec.popupId });
      return;
    }
    if (action === "pick-wallpaper" || action === "clear-wallpaper") {
      void handlers.immediate?.({ type: action, popupId: spec.popupId });
      return;
    }
    if (action === "copy") {
      const text = spec.copyText || el.querySelector('[data-field="full"]')?.value || "";
      void handlers.copy?.(text);
      return;
    }
    if (action === "preview") {
      finish({
        action: "preview",
        values: {
          scope: el.querySelector('input[name="scope"]:checked')?.value || "current",
          from: el.querySelector('[data-field="from"]')?.value || "",
          to: el.querySelector('[data-field="to"]')?.value || "",
        },
      });
      return;
    }
    if (action === "print") {
      finish({
        action: "print",
        html: el.dataset.printHtml || el._html || "",
        pageSetup: setupValues(el),
      });
      return;
    }
    if (action === "ok") {
      finish({ action: "ok", values: collectValues(el) });
      return;
    }
    if (action === "cancel" && spec.type === "progress") {
      void handlers.immediate?.({ type: "progress-cancel", popupId: spec.popupId });
    }
    finish({ action });
  };
  el.addEventListener("pointerup", (event) => {
    if (event.button != null && event.button !== 0) return;
    const hit = event.target?.closest?.("button, [data-action], [data-date], [data-step], .swatch");
    if (!hit || !el.contains(hit)) return;
    suppressClick = true;
    onPopupPointer(event);
    queueMicrotask(() => {
      suppressClick = false;
    });
  });
  el.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    onPopupPointer(event);
  });
  const customEdited = (field) => {
    const out = el.querySelector(`[data-out="${field}"]`);
    const input = el.querySelector(`[data-field="${field}"]`);
    if (out && input) out.textContent = input.value;
    paintCustomChip(el);
    markTheme(el, CUSTOM_THEME_ID);
    previewTheme();
  };
  el.addEventListener("change", (event) => {
    const field = event.target.dataset?.field;
    if (field === "countryCode") refillCities(el, spec);
    if (field === "customMode") customEdited(field);
    if (event.target.dataset?.setup) {
      void handlers.immediate?.({ type: "page-setup", popupId: spec.popupId, values: setupValues(el) });
    }
  });
  el.addEventListener("input", (event) => {
    const field = event.target.dataset?.field;
    if (field === "transparency") {
      setTransparency(event.target.value);
      return;
    }
    if (field === "customBg" || field === "customText" || field === "customAccent") {
      customEdited(field);
      return;
    }
    if (field === "backgroundOpacity") {
      const out = el.querySelector(`[data-out="${field}"]`);
      if (out) out.textContent = event.target.value;
    }
  });
  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      finish({ action: "close" });
    }
  });
  el._update = (patch) => applyPatch(el, patch, spec);
  return el;
}

export function applyPopupTheme(spec, draft = {}) {
  const theme = draft.theme || spec.theme;
  const colors = themeColors(theme, draft.customTheme || spec.customTheme);
  const transparency = spec.type === "forecast" ? Number(draft.transparency ?? spec.transparency) || 0 : 0;
  applyThemeVars(document.documentElement, themeVars(colors, transparency), colors.mode);
  document.body.dataset.theme = theme || "";
  document.body.dataset.transparency = String(transparency);
}

export function bootPopup(spec, api, container = document.body) {
  applyPopupTheme(spec);
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.fontFamily = spec.fontFamily ? `"${spec.fontFamily}", sans-serif` : "sans-serif";
  document.body.style.fontSize = `${spec.fontSize || 14}px`;
  const el = buildPopupElement(spec);
  el.style.position = "relative";
  el.style.left = "0";
  el.style.top = "0";
  wirePopup(el, spec, {
    result: (result) => api.finish?.(result),
    localTheme: (draft) => applyPopupTheme(spec, draft),
    immediate: (msg) => api.immediate?.({ ...msg, popupId: spec.popupId }),
    copy: (text) => api.immediate?.({ type: "copy", text, popupId: spec.popupId }),
  });
  api.onUpdate?.((patch) => el._update(patch));
  container.appendChild(el);
  return el;
}

export function fitPopupToViewport(el, view = window) {
  const width = parseInt(el.style.width, 10) || 0;
  const height = parseInt(el.style.height, 10) || 0;
  const roomW = (view?.innerWidth || 0) - 16;
  const roomH = (view?.innerHeight || 0) - 16;
  const scale = width && height && roomW > 0 && roomH > 0 ? Math.min(1, roomW / width, roomH / height) : 1;
  el.dataset.scale = String(Math.round(scale * 1000) / 1000);
  el.style.transform = scale < 1 ? `translate(-50%, -50%) scale(${el.dataset.scale})` : "";
  return scale;
}

export class PopupLayer {
  constructor(overlay) {
    this.overlay = overlay;
    this.waiters = new Set();
    this.progress = null;
    this.onResize = () => this.overlay.querySelectorAll(".popup").forEach((el) => fitPopupToViewport(el));
    if (typeof window !== "undefined") window.addEventListener("resize", this.onResize);
  }

  open(spec, handlers = {}) {
    this.closeType(spec.type);
    const backdrop = document.createElement("div");
    backdrop.className = "popup-backdrop";
    backdrop.dataset.backdrop = spec.type;
    const el = buildPopupElement(spec);
    return new Promise((resolve) => {
      const finish = (result) => {
        if (finish.done) return;
        finish.done = true;
        this.waiters.delete(finish);
        backdrop.remove();
        el.remove();
        resolve(result);
      };
      this.waiters.add(finish);
      wirePopup(el, spec, {
        result: finish,
        immediate: async (msg) => {
          const patch = await handlers.immediate?.(msg);
          if (patch) el._update(patch);
          return patch;
        },
        copy: handlers.copy,
      });
      this.overlay.appendChild(backdrop);
      this.overlay.appendChild(el);
      fitPopupToViewport(el);
      el.focus();
    });
  }

  showProgress(spec) {
    this.closeProgress();
    const backdrop = document.createElement("div");
    backdrop.className = "popup-backdrop";
    backdrop.dataset.backdrop = "progress";
    const el = buildPopupElement(spec);
    const handle = {
      aborted: false,
      closed: false,
      el,
      update(percent, message) {
        el._update({ percent, message });
      },
      close() {
        if (handle.closed) return;
        handle.closed = true;
        backdrop.remove();
        el.remove();
      },
    };
    wirePopup(el, spec, {
      result: (result) => {
        if (result.action === "cancel" || result.action === "close") {
          handle.aborted = true;
          handle.onAbort?.();
        }
        handle.close();
      },
      immediate: async (msg) => {
        if (msg.type === "progress-cancel") {
          handle.aborted = true;
          handle.onAbort?.();
        }
      },
    });
    this.overlay.appendChild(backdrop);
    this.overlay.appendChild(el);
    fitPopupToViewport(el);
    this.progress = handle;
    return handle;
  }

  closeType(type) {
    for (const waiter of [...this.waiters]) {
      const popup = this.overlay.querySelector(`[data-popup="${type}"]`);
      if (popup) waiter({ action: "close" });
    }
    this.overlay.querySelectorAll(`[data-popup="${type}"],[data-backdrop="${type}"]`).forEach((node) => node.remove());
  }

  closeProgress() {
    this.progress?.close();
    this.progress = null;
    this.overlay.querySelectorAll('[data-popup="progress"],[data-backdrop="progress"]').forEach((node) => node.remove());
  }

  closeAll() {
    if (typeof window !== "undefined") window.removeEventListener("resize", this.onResize);
    for (const waiter of [...this.waiters]) waiter({ action: "close" });
    this.waiters.clear();
    this.closeProgress();
    this.overlay.querySelectorAll("[data-popup],[data-backdrop]").forEach((node) => node.remove());
  }
}

function generalRows(model) {
  const t = model.t;
  const values = model.values;
  const language = model.language || "ko";
  return [
    {
      kind: "select",
      id: "language",
      label: t("field.language"),
      value: values.language,
      options: [
        { value: "ko", label: "한국어" },
        { value: "en", label: "English" },
      ],
    },
    {
      kind: "select",
      id: "units",
      label: t("field.units"),
      value: values.units,
      options: [
        { value: "C", label: t("units.c") },
        { value: "F", label: t("units.f") },
      ],
    },
    {
      kind: "select",
      id: "countryCode",
      label: t("field.country"),
      value: values.countryCode,
      options: uniqueCountries(model.catalog).map((entry) => ({
        value: entry.countryCode,
        label: language === "ko" ? entry.countryKo : entry.countryEn,
      })),
    },
    {
      kind: "select",
      id: "cityEn",
      label: t("field.city"),
      value: values.cityEn,
      options: model.catalog
        .filter((entry) => entry.countryCode === values.countryCode)
        .map((entry) => ({
          value: entry.cityEn,
          label: language === "ko" ? entry.cityKo || entry.cityEn : entry.cityEn,
        })),
    },
    { kind: "text", id: "search", label: t("field.search"), value: values.search || "" },
    { kind: "action", id: "search-online", action: "search-online", icon: "search", label: t("tip.search") },
    { kind: "number", id: "lat", label: t("field.lat"), value: values.lat ?? "" },
    { kind: "number", id: "lon", label: t("field.lon"), value: values.lon ?? "" },
    { kind: "check", id: "reopen", label: t("field.reopen"), checked: Boolean(values.reopen) },
  ];
}

function appearanceRows(model) {
  const t = model.t;
  const values = model.values;
  const language = model.language || "ko";
  const theme = values.theme;
  const mode = theme === CUSTOM_THEME_ID ? CUSTOM_THEME_ID : DARK_THEMES.some((item) => item.id === theme) ? "dark" : "light";
  const custom = sanitizeCustomTheme(values.customTheme);
  return [
    { kind: "range", id: "transparency", label: t("field.transparency"), value: values.transparency, stepper: true, t },
    {
      kind: "theme-mode",
      id: "themeMode",
      label: t("field.theme"),
      value: mode,
      options: [
        { value: "light", icon: "sun", label: t("theme.modeLight") },
        { value: "dark", icon: "moon", label: t("theme.modeDark") },
        { value: CUSTOM_THEME_ID, icon: "palette", label: t("theme.modeCustom") },
      ],
    },
    {
      kind: "themes",
      id: "themes",
      value: theme,
      mode,
      language,
      custom,
      t,
    },
  ];
}

function wallpaperRows(model) {
  const t = model.t;
  const values = model.values;
  return [
    { kind: "static", id: "wallpaper", label: t("field.wallpaper"), value: values.backgroundName || "—" },
    { kind: "action", id: "pick-wallpaper", action: "pick-wallpaper", icon: "image", label: t("btn.chooseImage") },
    { kind: "action", id: "clear-wallpaper", action: "clear-wallpaper", icon: "trash", label: t("btn.clearImage") },
    { kind: "range", id: "backgroundOpacity", label: t("field.wallpaperOpacity"), value: values.backgroundOpacity },
  ];
}

function fontRows(model) {
  const t = model.t;
  const values = model.values;
  const fonts = model.fonts?.length ? model.fonts : [values.fontFamily];
  return [
    {
      kind: "select",
      id: "fontFamily",
      label: t("field.fontFamily"),
      value: values.fontFamily,
      options: fonts.map((name) => ({ value: name, label: name })),
    },
    { kind: "number", id: "fontSize", label: t("field.fontSize"), value: values.fontSize, min: 8, max: 72 },
    {
      kind: "select",
      id: "fontStyle",
      label: t("field.fontStyle"),
      value: values.fontStyle,
      options: FONT_STYLES.map((style) => ({ value: style, label: t(`style.${style}`) })),
    },
  ];
}

function dataRows(model) {
  const t = model.t;
  const enabled = new Set(model.values.enabledSources || []);
  const status = model.values.sourceStatus || {};
  return [
    ...SOURCE_IDS.map((id) => {
      const source = status[id];
      const state = !source ? "—" : source.ok ? t("source.ok") : t("source.fail");
      return {
        kind: "source",
        id: `source-${id}`,
        source: id,
        label: t(`source.${id}`),
        checked: enabled.has(id),
        state,
        tone: !source ? "idle" : source.ok ? "ok" : "bad",
        stateTitle: source?.error || state,
      };
    }),
    { kind: "static", id: "lastDirectory", label: t("field.lastDirectory"), value: model.values.lastDirectory || "—" },
  ];
}

function recentRows(recent, t) {
  if (!recent.length) {
    return [
      { kind: "static", id: "empty", label: t("recent.empty"), value: "" },
      { kind: "action", id: "clear-recent", action: "recent-clear", icon: "clear", label: t("btn.clearRecent") },
    ];
  }
  return [
    ...recent.map((filePath, index) => ({
      kind: "recent",
      id: `recent-${index}`,
      path: filePath,
      label: filePath,
      tip: t("tip.deleteRecent"),
      openTip: t("tip.recentOpen"),
    })),
    { kind: "action", id: "clear-recent", action: "recent-clear", icon: "clear", label: t("btn.clearRecent") },
  ];
}

function renderRow(row) {
  const style = ` style="${ROW}"`;
  if (row.kind === "select") {
    const options = (row.options || [])
      .map((option) => `<option value="${esc(option.value)}"${option.value === row.value ? " selected" : ""}>${esc(option.label)}</option>`)
      .join("");
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><label>${esc(row.label)}</label><select data-field="${esc(row.id)}" ${row.setup ? 'data-setup="1"' : ""} title="${esc(row.label)}">${options}</select></div>`;
  }
  if (row.kind === "check" || row.kind === "source") {
    const source = row.kind === "source" ? ` data-group="source" data-source="${esc(row.source)}"` : "";
    const state = row.kind === "source"
      ? `<span class="source-state is-${esc(row.tone || "idle")}" data-gui="source-state" title="${esc(row.stateTitle || row.state || "")}">${esc(row.state || "—")}</span>`
      : "";
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span>${esc(row.label)}</span>${state}<input type="checkbox" data-field="${esc(row.kind === "source" ? row.source : row.id)}"${source} title="${esc(row.label)}"${row.checked ? " checked" : ""}></label>`;
  }
  if (row.kind === "radio") {
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span>${esc(row.label)}</span><input type="radio" name="${esc(row.name)}" value="${esc(row.value)}" title="${esc(row.label)}"${row.checked ? " checked" : ""}></label>`;
  }
  if (row.kind === "range") {
    const minus = row.stepper
      ? `<button type="button" class="step-btn" data-step="-5" data-target="${esc(row.id)}" data-gui="popup-button" title="-5">−</button>`
      : "";
    const plus = row.stepper
      ? `<button type="button" class="step-btn" data-step="5" data-target="${esc(row.id)}" data-gui="popup-button" title="+5">+</button>`
      : "";
    return `<div class="popup-row range-row" data-row="${esc(row.id)}"${style}><label>${esc(row.label)}</label>${minus}<span class="range-end">0</span><input type="range" min="0" max="100" data-field="${esc(row.id)}" title="${esc(row.label)}" value="${esc(row.value)}"><span class="range-end">100</span>${plus}<output data-out="${esc(row.id)}">${esc(row.value)}${row.stepper ? "%" : ""}</output></div>`;
  }
  if (row.kind === "theme-mode") {
    const buttons = row.options
      .map(
        (option) =>
          `<button type="button" class="seg-btn" data-theme-mode="${esc(option.value)}" data-gui="popup-button" title="${esc(option.label)}" aria-pressed="${option.value === row.value}">${icon(option.icon)}<span>${esc(option.label)}</span></button>`,
      )
      .join("");
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><label>${esc(row.label)}</label><div class="segmented" role="group">${buttons}</div></div>`;
  }
  if (row.kind === "themes") return themeBlock(row);
  if (row.kind === "number" || row.kind === "date" || row.kind === "text") {
    const type = row.kind === "date" ? "date" : row.kind === "text" ? "text" : "number";
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span>${esc(row.label)}</span><input type="${type}" data-field="${esc(row.id)}" title="${esc(row.label)}" value="${esc(row.value)}"${type === "number" ? ' step="any"' : ""}${row.min != null ? ` min="${row.min}" max="${row.max}"` : ""}></label>`;
  }
  if (row.kind === "input" && row.multiline) {
    return `<label class="text-block" data-row="${esc(row.id)}" data-fit-height="${ERROR_TEXT_HEIGHT}" style="display:flex;flex-direction:column;gap:4px;height:${ERROR_TEXT_HEIGHT}px;overflow:hidden;flex:0 0 auto"><span>${esc(row.label)}</span><textarea readonly wrap="off" data-field="${esc(row.id)}" title="${esc(row.label)}"></textarea></label>`;
  }
  if (row.kind === "input") {
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span>${esc(row.label)}</span><input type="text" readonly data-field="${esc(row.id)}" title="${esc(row.label)}"></label>`;
  }
  if (row.kind === "action") {
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><span></span><button type="button" data-action="${esc(row.action)}" data-gui="popup-button" title="${esc(row.label)}" style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap">${icon(row.icon || "dot")}<span class="menu-label">${esc(row.label)}</span></button></div>`;
  }
  if (row.kind === "recent") {
    return `<div class="popup-row" data-row="${esc(row.id)}" data-recent="1"${style}><span class="path" title="${esc(row.label)}">${esc(row.label)}</span><button type="button" class="icon-btn" data-action="recent-open" data-path="${esc(row.path)}" data-gui="popup-button" title="${esc(row.openTip || row.label)}" style="white-space:nowrap">${icon("open")}</button><button type="button" class="icon-btn" data-action="recent-delete" data-path="${esc(row.path)}" data-gui="popup-button" title="${esc(row.tip || row.label)}" style="white-space:nowrap">${icon("trash")}</button></div>`;
  }
  if (row.kind === "bar") {
    return `<div class="popup-row" data-row="bar"${style}><div class="bar-track" style="flex:1;height:8px;overflow:hidden"><div class="bar-fill" style="width:0%;height:8px"></div></div><span data-progress-pct>0%</span></div>`;
  }
  const tone = row.tone ? ` data-tone="${esc(row.tone)}"` : "";
  return `<div class="popup-row" data-row="${esc(row.id || "static")}"${tone}${style}><span>${esc(row.label || "")}</span><span title="${esc(row.value || "")}">${esc(row.value || "")}</span></div>`;
}

function swatch(id, name, colors, selected) {
  return `<button type="button" class="swatch" data-theme-id="${esc(id)}" data-gui="theme-swatch" title="${esc(name)}" aria-pressed="${selected}"><span class="chip" style="background:linear-gradient(160deg, ${colors.bgTop}, ${colors.bg});color:${colors.text}"><span class="swatch-name">${esc(name)}</span><i style="background:${colors.accent}"></i></span></button>`;
}

function themeBlock(row) {
  const { t, language, value, mode, custom } = row;
  const group = (id, themes) =>
    `<div class="theme-grid" data-theme-group="${id}" ${mode === id ? "" : "hidden"} style="display:${mode === id ? "grid" : "none"}">${themes
      .map((theme) => swatch(theme.id, theme.name[language] || theme.name.en, theme, theme.id === value))
      .join("")}</div>`;
  const customColors = themeColors(CUSTOM_THEME_ID, custom);
  const colorRow = (id, label, current) =>
    `<label class="popup-row" data-row="${id}" style="${ROW}"><span>${esc(label)}</span><input type="color" data-field="${id}" title="${esc(label)}" value="${esc(current)}"><code data-out="${id}">${esc(current)}</code></label>`;
  const customGroup = `<div class="custom-theme" data-theme-group="${CUSTOM_THEME_ID}" ${mode === CUSTOM_THEME_ID ? "" : "hidden"} style="display:${mode === CUSTOM_THEME_ID ? "flex" : "none"};flex-direction:column">
    <div class="custom-head">${swatch(CUSTOM_THEME_ID, t("theme.custom"), customColors, value === CUSTOM_THEME_ID)}<span class="custom-hint">${esc(t("theme.customHint"))}</span></div>
    <div class="popup-row" data-row="customMode" style="${ROW}"><label>${esc(t("field.customMode"))}</label><select data-field="customMode" title="${esc(t("field.customMode"))}"><option value="dark"${custom.mode === "dark" ? " selected" : ""}>${esc(t("theme.modeDark"))}</option><option value="light"${custom.mode === "light" ? " selected" : ""}>${esc(t("theme.modeLight"))}</option></select></div>
    ${colorRow("customBg", t("field.customBg"), custom.bg)}
    ${colorRow("customText", t("field.customText"), custom.text)}
    ${colorRow("customAccent", t("field.customAccent"), custom.accent)}
  </div>`;
  return `<div class="theme-block" data-row="themes" data-fit-height="${THEME_GRID_HEIGHT}" style="height:${THEME_GRID_HEIGHT}px;overflow:hidden;flex:0 0 auto"><input type="hidden" data-field="theme" value="${esc(value)}">${group("light", LIGHT_THEMES)}${group("dark", DARK_THEMES)}${customGroup}</div>`;
}

function previewBlock(lines) {
  const body = (lines || [])
    .map((line) => `<div style="white-space:nowrap;overflow:hidden;height:22px">${esc(line.text)}</div>`)
    .join("");
  return `<div class="preview-fit" data-gui="preview" style="height:340px;overflow:hidden">${body}</div>`;
}

function collectValues(el) {
  const values = { sources: {} };
  el.querySelectorAll("[data-field]").forEach((node) => {
    if (node.dataset.group === "source") {
      values.sources[node.dataset.source] = node.checked;
      return;
    }
    if (node.type === "checkbox") values[node.dataset.field] = node.checked;
    else if (node.type !== "radio") values[node.dataset.field] = node.value;
  });
  return values;
}

function setupValues(el) {
  return {
    paper: el.querySelector('[data-field="paper"]')?.value || "A4",
    orientation: el.querySelector('[data-field="orientation"]')?.value || "portrait",
    margin: Number(el.querySelector('[data-field="margin"]')?.value || 15),
  };
}

function refillCities(el, spec) {
  const country = el.querySelector('[data-field="countryCode"]')?.value;
  const city = el.querySelector('[data-field="cityEn"]');
  if (!city || !spec.catalog) return;
  const language = spec.language || "ko";
  const current = city.value;
  city.innerHTML = "";
  spec.catalog
    .filter((entry) => entry.countryCode === country)
    .forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.cityEn;
      option.textContent = language === "ko" ? entry.cityKo || entry.cityEn : entry.cityEn;
      city.appendChild(option);
    });
  if ([...city.options].some((option) => option.value === current)) city.value = current;
}

function uniqueCountries(catalog) {
  const map = new Map();
  for (const entry of catalog || []) if (!map.has(entry.countryCode)) map.set(entry.countryCode, entry);
  return [...map.values()];
}

function refillCountries(el, spec) {
  const country = el.querySelector('[data-field="countryCode"]');
  if (!country || !spec?.catalog) return;
  const language = spec.language || "ko";
  const current = country.value;
  country.innerHTML = "";
  uniqueCountries(spec.catalog).forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.countryCode;
    option.textContent = language === "ko" ? entry.countryKo : entry.countryEn;
    country.appendChild(option);
  });
  if ([...country.options].some((option) => option.value === current)) country.value = current;
}

function applyPatch(el, patch, spec) {
  if (!patch) return;
  if (patch.catalog && spec) {
    spec.catalog = patch.catalog;
    refillCountries(el, spec);
  }
  if (patch.countryCode) {
    const country = el.querySelector('[data-field="countryCode"]');
    if (country && [...country.options].some((option) => option.value === patch.countryCode)) country.value = patch.countryCode;
    if (spec) refillCities(el, spec);
  }
  if (patch.cityEn) {
    const city = el.querySelector('[data-field="cityEn"]');
    if (city && [...city.options].some((option) => option.value === patch.cityEn)) city.value = patch.cityEn;
  }
  if (patch.lat != null) {
    const lat = el.querySelector('[data-field="lat"]');
    if (lat) lat.value = String(patch.lat);
  }
  if (patch.lon != null) {
    const lon = el.querySelector('[data-field="lon"]');
    if (lon) lon.value = String(patch.lon);
  }
  if (patch.percent != null) {
    const fill = el.querySelector(".bar-fill");
    if (fill) fill.style.width = `${patch.percent}%`;
    const pct = el.querySelector("[data-progress-pct]");
    if (pct) pct.textContent = `${patch.percent}%`;
    const message = el.querySelector('[data-row="message"] span:last-child');
    if (message && patch.message) message.textContent = patch.message;
  }
  if (patch.backgroundName != null) {
    const row = el.querySelector('[data-row="wallpaper"] span:last-child');
    if (row) row.textContent = patch.backgroundName || "—";
  }
  if (patch.html) {
    el._html = patch.html;
    el.dataset.printHtml = patch.html;
  }
  if (patch.pages) {
    patch.pages.forEach((page, index) => {
      const panel = el.querySelector(`[data-panel="page-${index}"] .preview-fit`);
      if (!panel) return;
      panel.innerHTML = page
        .map((line) => `<div style="white-space:nowrap;overflow:hidden;height:22px">${esc(line.text)}</div>`)
        .join("");
    });
  }
}

export function popupFits(el) {
  const height = parseInt(el.style.height, 10);
  const tabChrome = el.querySelector(".popup-tabs") ? 36 : 0;
  const panel = el.querySelector(".popup-panel:not([hidden])") || el.querySelector(".popup-panel");
  const rows = panel ? [...panel.children].filter((node) => node.classList.contains("popup-row")).length : 0;
  const blocks = panel ? [...panel.children].filter((node) => node.classList.contains("preview-fit") || node.dataset.fitHeight) : [];
  const extra = blocks.reduce((sum, node) => sum + (parseInt(node.dataset.fitHeight || node.style.height, 10) || 0), 0);
  const settings = el.dataset.popup === "settings";
  const gaps = settings ? Math.max(0, rows + blocks.length - 1) * SETTINGS_ROW_GAP : 0;
  const pad = settings ? 32 : 16;
  const used = 44 + tabChrome + rows * 32 + gaps + extra + 48 + pad;
  return { used, height, fits: used <= height, rows };
}

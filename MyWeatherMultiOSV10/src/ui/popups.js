import { APP_INFO } from "../core/app-info.js";
import { errorCopyText } from "../core/errors.js";
import { CUSTOM_THEME_ID, DARK_THEMES, LIGHT_THEMES, applyThemeVars, sanitizeCustomTheme, themeColors, themeVars } from "../core/themes.js";
import { createI18n, formatMessage } from "../core/i18n.js";
import { DATE_FORMATS, DEFAULT_SETTINGS, DISPLAY_PRIORITIES, MAX_CITIES, ROTATE_SECONDS, UPDATE_HOURS, clamp, samePlace } from "../core/settings.js";
import { MARGINS, PAGE_NUMBER_SPOTS, PAPERS, PRINT_RANGES, SCALES, pageHtml, paperSize } from "../core/print-model.js";
import { PRINT_CSS } from "../core/print-style.js";
import { SOURCE_IDS } from "../weather/providers.js";
import { esc } from "./html.js";
import { flagIcon, icon } from "./icons.js";
import { keepsOneWindow, placeBeside, popupKey } from "./menu-layout.js";
import { layoutTabScroller } from "./tab-scroller.js";

const ROW = "display:flex;align-items:center;gap:8px;height:32px;white-space:nowrap;overflow:hidden;flex:0 0 auto";

function textKey(key) {
  return key ? ` data-i18n="${esc(key)}" data-i18n-title="${esc(key)}"` : "";
}

function titleOnly(key) {
  return key ? ` data-i18n-title="${esc(key)}"` : "";
}

function textOnly(key) {
  return key ? ` data-i18n="${esc(key)}"` : "";
}
export const THEME_GRID_HEIGHT = 252;
const SETTINGS_ROW_GAP = 10;
const SKIP_LIVE = new Set(["search", "wallpaperEdited", "backgroundImage", "backgroundName"]);

export function buildSettingsSpec(model) {
  const t = model.t;
  const values = model.values;
  const requested = model.activeTab === "font" ? "wallpaper" : model.activeTab;
  const activeTab = ["general", "cities", "data", "appearance", "wallpaper"].includes(requested) ? requested : "general";
  return {
    type: "settings",
    icon: "settings",
    title: t("popup.settings"),
    titleKey: "popup.settings",
    width: 680,
    height: 600,
    resizable: false,
    scroll: "none",
    activeTab,
    catalog: model.catalog || [],
    language: model.language || "ko",
    tabs: [
      { id: "general", icon: "general", label: t("tab.general"), rows: generalRows(model) },
      { id: "cities", icon: "city", label: t("tab.cities"), rows: cityRows(model) },
      { id: "data", icon: "weather", label: t("tab.data"), rows: dataRows(model) },
      { id: "appearance", icon: "palette", label: t("tab.appearance"), rows: appearanceRows(model) },
      { id: "wallpaper", icon: "image", label: t("tab.wallpaper"), rows: [...wallpaperRows(model), ...fontRows(model)] },
    ],
    closeLabel: t("tip.close"),
    closeKey: "tip.close",
    buttons: [
      { id: "reset", action: "reset", icon: "refresh", label: t("btn.reset"), title: t("tip.reset"), i18n: "btn.reset", titleKey: "tip.reset", align: "start" },
      { id: "ok", action: "ok", icon: "check", label: t("btn.ok"), i18n: "btn.ok" },
      { id: "cancel", action: "cancel", icon: "close", label: t("btn.cancel"), i18n: "btn.cancel" },
    ],
    values,
  };
}

export function buildSearchSpec({ query, results, language, t, target = "" }) {
  return {
    type: "search",
    icon: "search",
    title: t("popup.search"),
    titleKey: "popup.search",
    query: String(query || ""),
    results: Array.isArray(results) ? results : [],
    language: language === "en" ? "en" : "ko",
    target: String(target || ""),
    width: 560,
    height: 44 + 48 + 32 + 32 + SEARCH_BOX_GAP + SETTINGS_ROW_GAP + SEARCH_LIST_HEIGHT + SETTINGS_ROW_GAP + 32 + 2,
    resizable: false,
    scroll: "none",
    rows: [
      {
        kind: "search",
        id: "query",
        i18n: "field.search",
        label: t("field.search"),
        value: String(query || ""),
        placeholder: t("field.searchHint"),
        wide: true,
        action: "city-search",
        buttonLabel: t("tip.search"),
        buttonKey: "tip.search",
      },
      { kind: "found", id: "cityFound", label: "", height: SEARCH_LIST_HEIGHT },
      { kind: "pager", id: "cityPager" },
    ],
    buttons: [{ id: "close", action: "close", icon: "close", label: t("btn.close") }],
  };
}

export function buildAboutSpec(t) {
  return {
    type: "about",
    icon: "about",
    title: t("popup.about"),
    width: 560,
    height: 380,
    resizable: false,
    scroll: "none",
    rows: [
      { kind: "about", id: "intro", name: APP_INFO.name, description: t("about.description"), icon: "../assets/icon.png" },
      { kind: "static", id: "version", label: t("about.version"), value: APP_INFO.version },
      { kind: "static", id: "build", label: t("about.buildNumber"), value: APP_INFO.buildNumber },
      { kind: "static", id: "date", label: t("about.buildDate"), value: APP_INFO.buildDate },
      { kind: "static", id: "author", label: t("about.author"), value: APP_INFO.author },
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

/**
 * The print window shows what will come out and everything that decides it, side by side.
 * Pressing print sends the sheet straight to the printer; there is no second window.
 */
export function buildPrintSpec(t, draft, model) {
  const setup = model.pageSetup;
  const wanted = Array.isArray(draft.ranges) ? draft.ranges : [...PRINT_RANGES];
  return {
    type: "print",
    icon: "print",
    title: t("popup.print"),
    titleKey: "popup.print",
    width: 980,
    height: 700,
    resizable: false,
    scroll: "none",
    pages: model.pages,
    pageSetup: setup,
    html: model.html,
    labels: { prev: t("print.pagePrev"), next: t("print.pageNext") },
    rows: [
      { kind: "static", id: "whatHead", i18n: "print.what", label: t("print.what"), value: "" },
      { kind: "radio", id: "scope-all", name: "scope", value: "all", checked: draft.scope === "all", label: t("print.scopeAll") },
      { kind: "radio", id: "scope-current", name: "scope", value: "current", checked: draft.scope !== "all" && draft.scope !== "custom", label: t("print.scopeCurrent") },
      { kind: "radio", id: "scope-custom", name: "scope", value: "custom", checked: draft.scope === "custom", label: t("print.scopeCustom") },
      { kind: "date", id: "from", i18n: "print.from", label: t("print.from"), value: draft.from || "" },
      { kind: "date", id: "to", i18n: "print.to", label: t("print.to"), value: draft.to || "" },
      { kind: "check", id: "range-daily", i18n: "forecast.daily", label: t("forecast.daily"), checked: wanted.includes("daily") },
      { kind: "check", id: "range-weekly", i18n: "forecast.weekly", label: t("forecast.weekly"), checked: wanted.includes("weekly") },
      { kind: "check", id: "range-monthly", i18n: "forecast.monthly", label: t("forecast.monthly"), checked: wanted.includes("monthly") },
      { kind: "static", id: "paperHead", i18n: "print.paperHead", label: t("print.paperHead"), value: "" },
      {
        kind: "select",
        id: "paper",
        setup: true,
        i18n: "print.paper",
        label: t("print.paper"),
        value: setup.paper,
        options: PAPERS.map((value) => ({ value, label: value })),
      },
      {
        kind: "select",
        id: "orientation",
        setup: true,
        i18n: "print.orientation",
        label: t("print.orientation"),
        value: setup.orientation,
        options: [
          { value: "portrait", i18n: "print.portrait", label: t("print.portrait") },
          { value: "landscape", i18n: "print.landscape", label: t("print.landscape") },
        ],
      },
      {
        kind: "select",
        id: "margin",
        setup: true,
        i18n: "print.margin",
        label: t("print.margin"),
        value: String(setup.margin),
        options: MARGINS.map((value) => ({ value: String(value), label: `${value} mm` })),
      },
      {
        kind: "select",
        id: "scale",
        setup: true,
        i18n: "print.scale",
        label: t("print.scale"),
        value: String(setup.scale),
        options: SCALES.map((value) => ({ value: String(value), label: `${value} %` })),
      },
      {
        kind: "select",
        id: "header",
        setup: true,
        i18n: "print.header",
        label: t("print.header"),
        value: setup.header ? "on" : "off",
        options: [
          { value: "on", i18n: "print.headerOn", label: t("print.headerOn") },
          { value: "off", i18n: "print.headerOff", label: t("print.headerOff") },
        ],
      },
      {
        kind: "select",
        id: "pageNumber",
        setup: true,
        i18n: "print.pageNumber",
        label: t("print.pageNumber"),
        value: setup.pageNumber ? "on" : "off",
        options: [
          { value: "on", i18n: "print.headerOn", label: t("print.headerOn") },
          { value: "off", i18n: "print.headerOff", label: t("print.headerOff") },
        ],
      },
      {
        kind: "select",
        id: "pageNumberAt",
        setup: true,
        i18n: "print.pageNumberAt",
        label: t("print.pageNumberAt"),
        value: setup.pageNumberAt,
        options: PAGE_NUMBER_SPOTS.map((value) => ({ value, i18n: `print.at${value[0].toUpperCase()}${value.slice(1)}`, label: t(`print.at${value[0].toUpperCase()}${value.slice(1)}`) })),
      },
    ],
    buttons: [
      { id: "print", action: "print", icon: "print", label: t("btn.printNow"), i18n: "btn.printNow" },
      { id: "cancel", action: "cancel", icon: "close", label: t("btn.cancel"), i18n: "btn.cancel" },
    ],
  };
}

const FORECAST_WIDTH = { daily: 640, weekly: 720, monthly: 720 };

export function buildForecastSpec({ range, markup, fitHeight, when = "", city = "", refreshLabel = "", transparency = 0, backgroundImage = "", backgroundOpacity = 40, t }) {
  const body = Math.max(72, Number(fitHeight) || 72);
  return {
    type: "forecast",
    range,
    icon: range,
    title: t(`forecast.${range}`),
    city: typeof city === "string" ? city : "",
    when: typeof when === "string" ? when : "",
    refresh: true,
    refreshLabel: refreshLabel || t("cmd.refresh"),
    refreshKey: "cmd.refresh",
    transparency: Math.max(0, Math.min(100, Math.round(Number(transparency) || 0))),
    backgroundImage: typeof backgroundImage === "string" ? backgroundImage : "",
    backgroundOpacity: Math.max(0, Math.min(100, Math.round(Number(backgroundOpacity) || 0))),
    width: FORECAST_WIDTH[range] || 640,
    height: 44 + 48 + 16 + body,
    markup,
    fitHeight: body,
    buttons: [{ id: "close", action: "close", icon: "close", label: t("btn.close") }],
  };
}

/** Page settings on the left, the sheet on the right, and only previous and next below it. */
function previewPanel(spec) {
  const labels = spec.labels || {};
  const rows = (spec.rows || []).map((row) => renderRow(row)).join("");
  return `<div class="popup-panel preview-panel" data-panel="main" style="display:flex;flex-direction:row;gap:16px;overflow:hidden;height:100%;flex:1 1 auto"><div class="preview-setup">${rows}</div><div class="preview-side"><div class="preview-stage" data-preview-stage><div class="preview-paper" data-preview-paper><style>${PRINT_CSS}</style><div class="print-doc preview-sheet" data-preview-sheet></div></div></div><div class="preview-nav"><button type="button" class="popup-btn nav-btn" data-action="page-prev" data-gui="popup-button" title="${esc(labels.prev || "")}" style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap">${icon("arrowLeft")}<span class="menu-label">${esc(labels.prev || "")}</span></button><span class="preview-count" data-preview-count></span><button type="button" class="popup-btn nav-btn" data-action="page-next" data-gui="popup-button" title="${esc(labels.next || "")}" style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><span class="menu-label">${esc(labels.next || "")}</span>${icon("arrowRight")}</button></div></div></div>`;
}

/**
 * The sheet is as large as the stage allows while keeping the paper's proportions, so turning
 * a page or changing what is printed never changes its size.
 */
function fitPaper(el, paper, size) {
  const stage = el.querySelector("[data-preview-stage]");
  if (!stage) return;
  const box = stage.getBoundingClientRect();
  const room = { width: box.width - 16, height: box.height - 16 };
  if (!(room.width > 0) || !(room.height > 0)) return;
  const ratio = size.width / size.height;
  let width = room.height * ratio;
  let height = room.height;
  if (width > room.width) {
    width = room.width;
    height = room.width / ratio;
  }
  paper.style.width = `${Math.round(width)}px`;
  paper.style.height = `${Math.round(height)}px`;
}

/** Shows one page and keeps the counter and the two buttons honest. */
export function paintPreviewPage(el, spec, at) {
  const sheet = el?.querySelector("[data-preview-sheet]");
  if (!sheet) return;
  const pages = Array.isArray(spec?.pages) ? spec.pages : [];
  const count = Math.max(1, pages.length);
  const page = Math.min(Math.max(0, Number(at) || 0), count - 1);
  const setup = spec.pageSetup || {};
  spec.pageAt = page;
  sheet.innerHTML = pages[page] ? pageHtml(pages[page], setup, page, count) : "";
  sheet.dataset.page = String(page + 1);
  const paper = el.querySelector("[data-preview-paper]");
  if (paper) {
    // The sheet is the size of the paper, so what is on it is laid out, never resized by it.
    const size = paperSize(setup);
    paper.dataset.orientation = setup.orientation || "portrait";
    paper.style.aspectRatio = `${size.width} / ${size.height}`;
    paper.style.setProperty("--paper-margin", `${((Number(setup.margin) || 15) / size.width) * 100}%`);
    paper.style.setProperty("--paper-scale", String((Number(setup.scale) || 100) / 100));
    fitPaper(el, paper, size);
  }
  const counter = el.querySelector("[data-preview-count]");
  if (counter) counter.textContent = `${page + 1} / ${count}`;
  const prev = el.querySelector('[data-action="page-prev"]');
  const next = el.querySelector('[data-action="page-next"]');
  if (prev) prev.disabled = page === 0;
  if (next) next.disabled = page >= count - 1;
}

export function paintWallpaper(layer, image, opacity) {
  if (!layer) return;
  const picture = typeof image === "string" ? image : "";
  const value = Math.max(0, Math.min(100, Number(opacity) || 0));
  layer.style.backgroundImage = picture ? `url("${picture}")` : "none";
  layer.style.opacity = picture ? String(value / 100) : "0";
  layer.dataset.image = picture ? "yes" : "no";
}

export function buildPopupElement(spec) {
  const el = document.createElement("section");
  el.className = "popup";
  el.dataset.popup = spec.type;
  el.dataset.theme = spec.theme || "";
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
    : spec.type === "print"
      ? previewPanel(spec)
      : `<div class="popup-panel" data-panel="main" style="overflow:hidden;display:flex;flex-direction:column">${forecastBlock(spec)}${(spec.rows || []).map((row) => renderRow(row)).join("")}</div>`;
  const tabBar = tabs.length
    ? `<div class="popup-tabs" data-gui="popup-tabs" style="display:flex;height:36px;overflow:hidden;flex:0 0 auto"><div class="popup-tabstrip" style="display:flex;overflow:hidden;flex:1;min-width:0"></div><button type="button" data-action="tab-prev" data-gui="tab-nav" title="&lt;">&lt;</button><button type="button" data-action="tab-next" data-gui="tab-nav" title="&gt;">&gt;</button></div>`
    : "";
  const closeLabel = spec.closeLabel || "Close";
  const titleIcon = icon(spec.icon || "info", { colorful: ["about", "forecast", "search"].includes(spec.type) });
  const place = spec.type === "forecast" ? `<span class="popup-city" data-gui="popup-city">${esc(spec.city || "")}</span>` : "";
  const when = spec.type === "forecast" || spec.type === "search" ? `<span class="popup-when">${esc(spec.when || "")}</span>` : "";
  const refresher = spec.refresh
    ? `<button type="button" class="icon-btn popup-refresh" data-action="forecast-refresh" data-gui="popup-button" title="${esc(spec.refreshLabel || "")}" aria-label="${esc(spec.refreshLabel || "")}"${titleOnly(spec.refreshKey)}>${icon("refresh", { colorful: true })}</button>`
    : "";
  const hasOk = (spec.buttons || []).some((button) => button.action === "ok");
  el.innerHTML = `${spec.type === "forecast" ? `<div class="wallpaper" data-gui="wallpaper"></div>` : ""}<header class="popup-head" style="height:44px;display:flex;align-items:center;gap:8px;overflow:hidden;flex:0 0 auto;white-space:nowrap"><span class="popup-icon">${titleIcon}</span><span class="popup-title"${textKey(spec.titleKey)}>${esc(spec.title || "")}</span>${place}${when}${refresher}<button type="button" class="icon-btn win-btn win-close popup-x" data-action="${spec.type === "progress" ? "cancel" : "close"}" data-gui="popup-close" title="${esc(closeLabel)}" aria-label="${esc(closeLabel)}"${titleOnly(spec.closeKey)}>${icon("windowClose")}</button></header>${tabBar}<div class="popup-body" style="overflow:hidden;flex:1 1 auto;min-height:0">${panels}</div><footer class="popup-foot" style="height:48px;display:flex;align-items:center;justify-content:flex-end;gap:8px;overflow:hidden;flex:0 0 auto">${(spec.buttons || [])
    .map(
      (button, index) =>
        `<button type="button" class="popup-btn${button.action === "ok" || (!hasOk && index === 0) ? " primary" : ""}" data-action="${esc(button.action)}" data-gui="popup-button" title="${esc(button.title || button.label)}"${titleOnly(button.titleKey || button.i18n)} style="white-space:nowrap;display:inline-flex;align-items:center;gap:6px;${button.align === "start" ? "margin-right:auto;" : ""}">${icon(button.icon || "dot")}<span class="menu-label"${textKey(button.i18n)}>${esc(button.label)}</span></button>`,
    )
    .join("")}</footer>`;
  if (spec.type === "forecast") paintWallpaper(el.querySelector("[data-gui='wallpaper']"), spec.backgroundImage, spec.backgroundOpacity);
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
    const showAll = spec.type === "settings";
    const layout = showAll
      ? { start: 0, visible: spec.tabs.length, showPrev: false, showNext: false }
      : layoutTabScroller(tabStart, spec.tabs.length, Math.max(132, (spec.width || 640) - 120), 132);
    tabStart = layout.start;
    strip.innerHTML = "";
    const tabs = showAll ? spec.tabs : spec.tabs.slice(layout.start, layout.start + layout.visible);
    tabs.forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "popup-tab";
      button.dataset.tab = tab.id;
      button.dataset.gui = "popup-tab";
      button.title = tab.label;
      button.style.whiteSpace = "nowrap";
      button.style.height = "32px";
      button.style.display = "inline-flex";
      button.style.alignItems = "center";
      button.style.gap = "6px";
      button.innerHTML = `${tab.icon ? icon(tab.icon) : ""}<span${spec.type === "settings" ? textOnly(`tab.${tab.id}`) : ""}>${esc(tab.label)}</span>`;
      if (spec.type === "settings") button.dataset.i18nTitle = `tab.${tab.id}`;
      if (tab.id === activeTab()) button.classList.add("is-active");
      button.addEventListener("click", () => activate(tab.id));
      strip.appendChild(button);
    });
    const prev = el.querySelector('[data-action="tab-prev"]');
    const next = el.querySelector('[data-action="tab-next"]');
    if (prev) {
      prev.disabled = !layout.showPrev;
      prev.hidden = showAll;
    }
    if (next) {
      next.disabled = !layout.showNext;
      next.hidden = showAll;
    }
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
  renderCityList(el, spec);
  renderFoundList(el, spec);
  if (spec.type === "print") {
    el._html = spec.html || "";
    el.dataset.printHtml = spec.html || "";
    paintPreviewPage(el, spec, 0);
  }
  const previewTheme = () => {
    const draft = themeDraft(el);
    handlers.localTheme?.(draft);
    void handlers.immediate?.({ type: "theme-preview", ...draft, popupId: spec.popupId });
  };
  const previewSettings = () => {
    if (spec.type !== "settings") return;
    const values = collectValues(el);
    const language = values.language === "en" ? "en" : "ko";
    if (spec.language !== language) {
      spec.language = language;
      applyPopupLanguage(el, spec);
    }
    applyPopupFont(el, values);
    void handlers.immediate?.({ type: "settings-preview", values, popupId: spec.popupId });
  };
  const setSteppedNumber = (input, value) => {
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    input.value = String(Math.max(min, Math.min(max, Math.round(Number(value) || 0))));
  };
  const setRange = (field, value) => {
    const input = el.querySelector(`[data-field="${field}"]`);
    if (!input) return;
    input.value = String(Math.max(0, Math.min(100, Math.round(Number(value) || 0))));
    const out = el.querySelector(`[data-out="${field}"]`);
    if (out) out.textContent = `${input.value}%`;
    if (field === "transparency") previewTheme();
    if (field === "backgroundOpacity") {
      void handlers.immediate?.({ type: "wallpaper-opacity", value: Number(input.value), popupId: spec.popupId });
    }
  };
  el.addEventListener("contextmenu", (event) => {
    if (spec.type !== "forecast") return;
    event.preventDefault();
    const day = event.target.closest("[data-date]");
    const point = { clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY, popupId: spec.popupId };
    if (!day) {
      void handlers.immediate?.({ type: "window-menu", ...point });
      return;
    }
    void handlers.immediate?.({ type: "select-date", date: day.dataset.date, range: spec.range, ...point });
  });
  el.addEventListener("dblclick", (event) => {
    if (spec.type !== "forecast" || spec.range === "daily") return;
    const day = event.target.closest("[data-date]");
    if (!day) return;
    event.preventDefault();
    void handlers.immediate?.({ type: "open-daily", date: day.dataset.date, range: spec.range, popupId: spec.popupId });
  });
  let dragFrom = -1;
  const cityField = () => el.querySelector('[data-field="cities"]');
  const cityListEl = () => el.querySelector('[data-row="cityList"] .city-list');

  /** Rows keep their own element through a move, so the shuffle can be animated. */
  const renumberCityRows = () => {
    const list = cityListEl();
    if (!list) return;
    [...list.children].forEach((row, index) => {
      row.dataset.cityEntry = String(index);
      const remove = row.querySelector('[data-action="city-remove"]');
      if (remove) remove.dataset.index = String(index);
      const grip = row.querySelector("[data-city-grip]");
      if (grip) grip.dataset.cityGrip = String(index);
    });
  };

  /**
   * First/Last/Invert/Play: the rows that give way are moved in the DOM, then slid from where
   * they used to be back to where they now are, so the list settles instead of jumping.
   */
  const glideCityRows = (change) => {
    const list = cityListEl();
    if (!list) {
      change();
      return;
    }
    const rows = [...list.children];
    const before = new Map(rows.map((row) => [row, row.getBoundingClientRect().top]));
    change();
    for (const row of [...list.children]) {
      const start = before.get(row);
      if (start == null) continue;
      const delta = start - row.getBoundingClientRect().top;
      if (!delta) continue;
      row.style.transition = "none";
      row.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        row.style.transition = "transform 140ms ease";
        row.style.transform = "";
      });
    }
  };

  const markCityDrag = () => {
    const list = cityListEl();
    const block = el.querySelector('[data-row="cityList"]');
    if (!list || !block) return;
    list.querySelectorAll("[data-dragged]").forEach((row) => row.removeAttribute("data-dragged"));
    if (dragFrom < 0) {
      block.removeAttribute("data-dragging");
      return;
    }
    block.setAttribute("data-dragging", "1");
    list.children[dragFrom]?.setAttribute("data-dragged", "1");
  };

  const endCityDrag = () => {
    if (dragFrom < 0) return;
    dragFrom = -1;
    markCityDrag();
  };

  el.addEventListener("pointerdown", (event) => {
    const grip = event.target.closest("[data-city-grip]");
    if (!grip) return;
    event.preventDefault();
    try {
      // Capture keeps the moves coming if the pointer outruns the row; losing it is not fatal.
      if (event.pointerId != null) grip.setPointerCapture?.(event.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    dragFrom = Number(grip.dataset.cityGrip);
    markCityDrag();
  });

  el.addEventListener("pointermove", (event) => {
    if (dragFrom < 0) return;
    const list = cityListEl();
    const field = cityField();
    if (!list || !field) return;
    const target = cityDropIndex(list, event);
    if (!Number.isFinite(target) || target === dragFrom) return;
    const moving = list.children[dragFrom];
    if (!moving) return;
    glideCityRows(() => {
      const anchor = list.children[target > dragFrom ? target + 1 : target];
      list.insertBefore(moving, anchor || null);
    });
    field.value = JSON.stringify(moveCity(parseCityList(field.value), dragFrom, target));
    dragFrom = target;
    renumberCityRows();
    markCityDrag();
  });

  for (const name of ["pointerup", "pointercancel"]) el.addEventListener(name, endCityDrag);
  let suppressClick = false;
  const onPopupPointer = (event) => {
    const forecastDay = spec.type === "forecast" ? event.target.closest("[data-date]") : null;
    if (forecastDay && !event.target.closest("[data-action]")) {
      void handlers.immediate?.({ type: "select-date", date: forecastDay.dataset.date, range: spec.range, popupId: spec.popupId });
      return;
    }
    const turn = event.target.closest('[data-action="page-prev"], [data-action="page-next"]');
    if (turn && !turn.disabled) {
      paintPreviewPage(el, spec, (Number(spec.pageAt) || 0) + (turn.dataset.action === "page-next" ? 1 : -1));
      return;
    }
    const pageStep = event.target.closest(".pager-btn");
    if (pageStep && !pageStep.disabled) {
      const block = el.querySelector(".list-block[data-page-count]");
      const at = Number(block?.dataset.pageAt) || 1;
      const pages = Number(block?.dataset.pageCount) || 1;
      const want = pageStep.dataset.page;
      const steps = { "back-span": at - PAGE_SPAN, prev: at - 1, next: at + 1, "next-span": at + PAGE_SPAN };
      const next = want in steps ? steps[want] : Number(want) || at;
      block.dataset.pageAt = String(Math.min(Math.max(1, next), pages));
      renderFoundList(el, spec);
      return;
    }
    const useCity = event.target.closest("[data-action='city-use']");
    if (useCity) {
      const place = (spec.results || [])[Number(useCity.dataset.index)];
      if (place) void handlers.immediate?.({ type: "city-pick", place, target: spec.target || "", popupId: spec.popupId });
      return;
    }
    const dropCity = event.target.closest("[data-action='city-remove']");
    if (dropCity) {
      const field = el.querySelector('[data-field="cities"]');
      const cities = parseCityList(field?.value);
      const index = Number(dropCity.dataset.index);
      if (cities.length <= 1) {
        void handlers.immediate?.({ type: "city-notice", notice: "last", popupId: spec.popupId });
        return;
      }
      if (index >= 0 && index < cities.length) {
        cities.splice(index, 1);
        field.value = JSON.stringify(cities);
        renderCityList(el, spec);
      }
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
    const choice = event.target.closest("[data-choice]");
    if (choice) {
      const field = el.querySelector(`[data-field="${choice.dataset.choice}"]`);
      if (field) field.value = choice.dataset.value;
      markChoice(el, choice.dataset.choice);
      previewSettings();
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
      const field = step.dataset.target;
      const input = el.querySelector(`[data-field="${field}"]`);
      const next = Number(input?.value || 0) + Number(step.dataset.step);
      if (input?.type === "number") {
        setSteppedNumber(input, next);
        previewSettings();
      } else setRange(field, next);
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
    if (action === "reset") {
      resetSettingsForm(el, spec);
      previewTheme();
      void handlers.immediate?.({
        type: "wallpaper-preview",
        image: "",
        opacity: DEFAULT_SETTINGS.backgroundOpacity,
        popupId: spec.popupId,
      });
      previewSettings();
      return;
    }
    if (action === "forecast-refresh") {
      void handlers.immediate?.({ type: "forecast-refresh", range: spec.range, popupId: spec.popupId });
      return;
    }
    if (action === "open-search") {
      void handlers.immediate?.({
        type: "open-search",
        cities: el.querySelector('[data-field="cities"]')?.value || "[]",
        popupId: spec.popupId,
      });
      return;
    }
    if (action === "city-search") {
      void handlers.immediate?.({ type: "city-search", query: el.querySelector('[data-field="query"]')?.value || "", popupId: spec.popupId });
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
          ranges: ["daily", "weekly", "monthly"].filter((range) => el.querySelector(`[data-field="range-${range}"]`)?.checked),
        },
      });
      return;
    }
    if (action === "print") {
      finish({ action: "print", html: el.dataset.printHtml || el._html || "", pageSetup: setupValues(el) });
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
    setTimeout(() => {
      suppressClick = false;
    }, 50);
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
    if (field === "countryCode") {
      refillCities(el, spec);
      void handlers.immediate?.({ type: "country-pick", countryCode: event.target.value, popupId: spec.popupId });
    }
    if (field === "customMode") customEdited(field);
    if (spec.type === "print") {
      void handlers.immediate?.({ type: "print-setup", popupId: spec.popupId, values: printValues(el) });
      return;
    }
    if (event.target.dataset?.setup) {
      void handlers.immediate?.({ type: "page-setup", popupId: spec.popupId, values: setupValues(el) });
    }
    if (field && event.target.dataset?.group !== "source" && SKIP_LIVE.has(field)) return;
    previewSettings();
  });
  el.addEventListener("input", (event) => {
    const field = event.target.dataset?.field;
    if (field === "transparency" || field === "backgroundOpacity") {
      setRange(field, event.target.value);
      return;
    }
    if (field === "customBg" || field === "customText" || field === "customAccent") customEdited(field);
    if (!field || SKIP_LIVE.has(field)) return;
    previewSettings();
  });
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target?.dataset?.field === "query") {
      event.preventDefault();
      event.stopPropagation();
      void handlers.immediate?.({ type: "city-search", query: event.target.value || "", popupId: spec.popupId });
      return;
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      finish({ action: "close" });
    }
  });
  el._update = (patch) => applyPatch(el, patch, spec);
  el._spec = spec;
  return el;
}

export function paintPopupSurface(popup, colors, transparency, theme) {
  if (!popup) return;
  const forecast = popup.dataset.popup === "forecast";
  applyThemeVars(popup, themeVars(colors, forecast ? transparency : 0), colors.mode);
  popup.dataset.theme = theme || "";
}

export function applyPopupTheme(spec, draft = {}) {
  const theme = draft.theme || spec.theme;
  const colors = themeColors(theme, draft.customTheme || spec.customTheme);
  const transparency = spec.type === "forecast" ? Number(draft.transparency ?? spec.transparency) || 0 : 0;
  const vars = themeVars(colors, transparency);
  applyThemeVars(document.documentElement, vars, colors.mode);
  document.body.dataset.theme = theme || "";
  document.body.dataset.transparency = String(transparency);
  paintPopupSurface(document.querySelector("[data-popup]"), colors, transparency, theme);
}

export function bootPopup(spec, api, container = document.body) {
  applyPopupTheme(spec);
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.fontFamily = spec.fontFamily ? `"${spec.fontFamily}", sans-serif` : "sans-serif";
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
  paintPopupSurface(el, themeColors(spec.theme, spec.customTheme), Number(spec.transparency) || 0, spec.theme);
  return el;
}

const COMPANION_POPUPS = new Set(["forecast", "settings", "about", "search"]);

export function placeCompanionPopup(el, view = window) {
  if (!COMPANION_POPUPS.has(el.dataset.popup) || Number(el.dataset.scale) < 1) return;
  const shell = document.querySelector(".window-shell");
  if (!shell) return;
  const parent = shell.getBoundingClientRect();
  const width = parseInt(el.style.width, 10) || 0;
  const height = parseInt(el.style.height, 10) || 0;
  if (!width || !height) return;
  const spot = placeBeside(
    { x: parent.left, y: parent.top, width: parent.width, height: parent.height },
    { width, height },
    { x: 0, y: 0, width: view.innerWidth || 0, height: view.innerHeight || 0 },
  );
  el.style.left = `${spot.x}px`;
  el.style.top = `${spot.y}px`;
  el.style.transform = "none";
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
    this.onResize = () =>
      this.overlay.querySelectorAll(".popup").forEach((el) => {
        fitPopupToViewport(el);
        placeCompanionPopup(el);
      });
    if (typeof window !== "undefined") window.addEventListener("resize", this.onResize);
  }

  raise(el) {
    this.z = (this.z || 80) + 1;
    el.style.zIndex = String(this.z);
    this.overlay.appendChild(el);
    el.focus();
  }

  open(spec, handlers = {}) {
    const key = popupKey(spec);
    const existing = keepsOneWindow(spec) ? this.overlay.querySelector(`[data-popup-key="${key}"]`) : null;
    if (existing) {
      this.raise(existing);
      return Promise.resolve({ action: "focused" });
    }
    if (spec.type !== "forecast") this.closeType(spec.type);
    const companion = COMPANION_POPUPS.has(spec.type);
    const backdrop = companion ? null : document.createElement("div");
    if (backdrop) {
      backdrop.className = "popup-backdrop";
      backdrop.dataset.backdrop = spec.type;
    }
    const el = buildPopupElement(spec);
    return new Promise((resolve) => {
      const finish = (result) => {
        if (finish.done) return;
        finish.done = true;
        this.waiters.delete(finish);
        backdrop?.remove();
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
      el.dataset.popupKey = key;
      if (backdrop) this.overlay.appendChild(backdrop);
      this.raise(el);
      paintPopupSurface(el, themeColors(spec.theme, spec.customTheme), Number(spec.transparency) || 0, spec.theme);
      fitPopupToViewport(el);
      placeCompanionPopup(el);
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
      kind: "choice",
      id: "language",
      i18n: "field.language",
      label: t("field.language"),
      value: values.language === "en" ? "en" : "ko",
      options: [
        { value: "ko", label: "한국어", flag: "kr" },
        { value: "en", label: "English", flag: "gb" },
      ],
    },
    {
      kind: "select",
      id: "dateFormat",
      i18n: "field.dateFormat",
      label: t("field.dateFormat"),
      value: DATE_FORMATS.includes(values.dateFormat) ? values.dateFormat : "long",
      options: DATE_FORMATS.map((id) => ({ value: id, i18n: `date.${id}`, label: t(`date.${id}`) })),
    },
    {
      kind: "select",
      id: "units",
      i18n: "field.units",
      label: t("field.units"),
      value: values.units,
      options: [
        { value: "C", i18n: "units.c", label: t("units.c") },
        { value: "F", i18n: "units.f", label: t("units.f") },
      ],
    },
    {
      kind: "select",
      id: "updateHours",
      i18n: "field.updateHours",
      label: t("field.updateHours"),
      value: String(values.updateHours ?? 1),
      options: UPDATE_HOURS.map((hours) => ({ value: String(hours), i18n: `update.h${hours}`, label: t(`update.h${hours}`) })),
    },
    {
      kind: "select",
      id: "rotateSeconds",
      i18n: "field.rotateSeconds",
      label: t("field.rotateSeconds"),
      value: String(values.rotateSeconds ?? 0),
      options: ROTATE_SECONDS.map((seconds) => ({ value: String(seconds), i18n: `rotate.s${seconds}`, label: t(`rotate.s${seconds}`) })),
    },
    {
      kind: "select",
      id: "displayPriority",
      i18n: "field.displayPriority",
      label: t("field.displayPriority"),
      value: values.displayPriority || "average",
      options: DISPLAY_PRIORITIES.map((id) => ({
        value: id,
        i18n: id === "average" ? "priority.average" : `source.${id}`,
        label: id === "average" ? t("priority.average") : t(`source.${id}`),
      })),
    },
    { kind: "check", id: "openAtLogin", i18n: "field.openAtLogin", label: t("field.openAtLogin"), checked: Boolean(values.openAtLogin) },
  ];
}

/** The shown city, the list the window rotates through, and how long each city stays up. */
function cityRows(model) {
  const t = model.t;
  const values = model.values;
  const language = model.language || "ko";
  const cities = Array.isArray(values.cities) ? values.cities : [];
  return [
    {
      kind: "select",
      id: "countryCode",
      i18n: "field.country",
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
      i18n: "field.city",
      label: t("field.city"),
      value: values.cityEn,
      options: model.catalog
        .filter((entry) => entry.countryCode === values.countryCode)
        .map((entry) => ({
          value: entry.cityEn,
          label: language === "ko" ? entry.cityKo || entry.cityEn : entry.cityEn,
        })),
    },
    { kind: "number", id: "lat", i18n: "field.lat", label: t("field.lat"), value: values.lat ?? "" },
    { kind: "number", id: "lon", i18n: "field.lon", label: t("field.lon"), value: values.lon ?? "" },
    { kind: "action", id: "add-city", action: "open-search", icon: "add", i18n: "btn.addCity", label: t("btn.addCity"), title: t("tip.addCity"), titleKey: "tip.addCity" },
    { kind: "hidden", id: "cities", value: JSON.stringify(cities) },
    {
      kind: "cities",
      id: "cityList",
      i18n: "field.cities",
      label: t("field.cities"),
      cities,
      language,
      removeTip: t("tip.removeCity"),
    },
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
    {
      kind: "range",
      id: "transparency",
      i18n: "field.transparency",
      label: t("field.transparency"),
      value: values.transparency,
      suffix: "%",
      decrease: t("tip.decrease"),
      increase: t("tip.increase"),
      decreaseKey: "tip.decrease",
      increaseKey: "tip.increase",
    },
    {
      kind: "theme-mode",
      id: "themeMode",
      i18n: "field.theme",
      label: t("field.theme"),
      value: mode,
      options: [
        { value: "light", icon: "sun", i18n: "theme.modeLight", label: t("theme.modeLight") },
        { value: "dark", icon: "moon", i18n: "theme.modeDark", label: t("theme.modeDark") },
        { value: CUSTOM_THEME_ID, icon: "palette", i18n: "theme.modeCustom", label: t("theme.modeCustom") },
      ],
    },
    {
      kind: "themes",
      id: "themes",
      value: theme,
      mode,
      language,
      custom,
      labels: {
        custom: t("theme.custom"),
        customHint: t("theme.customHint"),
        customMode: t("field.customMode"),
        modeDark: t("theme.modeDark"),
        modeLight: t("theme.modeLight"),
        customBg: t("field.customBg"),
        customText: t("field.customText"),
        customAccent: t("field.customAccent"),
      },
    },
  ];
}

function wallpaperRows(model) {
  const t = model.t;
  const values = model.values;
  return [
    { kind: "hidden", id: "wallpaperEdited", value: "" },
    { kind: "hidden", id: "backgroundImage", value: "" },
    { kind: "hidden", id: "backgroundName", value: values.backgroundName || "" },
    { kind: "picture", id: "wallpaper", image: values.backgroundImage || "", name: values.backgroundName || "" },
    {
      kind: "actions",
      id: "wallpaperButtons",
      buttons: [
        { action: "pick-wallpaper", icon: "image", i18n: "btn.chooseImage", label: t("btn.chooseImage") },
        { action: "clear-wallpaper", icon: "trash", i18n: "btn.clearImage", label: t("btn.clearImage") },
      ],
    },
    {
      kind: "range",
      id: "backgroundOpacity",
      i18n: "field.wallpaperOpacity",
      label: t("field.wallpaperOpacity"),
      value: values.backgroundOpacity ?? 40,
      suffix: "%",
      decrease: t("tip.decrease"),
      increase: t("tip.increase"),
      decreaseKey: "tip.decrease",
      increaseKey: "tip.increase",
    },
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
      i18n: "field.fontFamily",
      label: t("field.fontFamily"),
      value: values.fontFamily,
      options: fonts.map((name) => ({ value: name, label: name })),
    },
    { kind: "fontsample", id: "fontSample", i18n: "field.fontSample", label: t("field.fontSample"), text: t("field.fontSampleText") },
  ];
}

function dataRows(model) {
  const t = model.t;
  const enabled = new Set(model.values.enabledSources || []);
  const status = model.values.sourceStatus || {};
  return [
    { kind: "static", id: "sources", i18n: "field.sources", label: t("field.sources"), valueKey: "field.sourcesHint", value: t("field.sourcesHint") },
    ...SOURCE_IDS.map((id) => {
      const source = status[id];
      const state = !source ? "—" : source.ok ? t("source.ok") : t("source.fail");
      return {
        kind: "source",
        id: `source-${id}`,
        source: id,
        i18n: `source.${id}`,
        label: t(`source.${id}`),
        detailKey: `source.${id}From`,
        detail: t(`source.${id}From`),
        checked: enabled.has(id),
        state,
        stateKey: !source ? "" : source.ok ? "source.ok" : "source.fail",
        tone: !source ? "idle" : source.ok ? "ok" : "bad",
        stateTitle: source?.error || state,
      };
    }),
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

function resetSettingsForm(el, spec) {
  const defaults = DEFAULT_SETTINGS;
  const place = defaults.defaultLocation;
  const custom = sanitizeCustomTheme(defaults.customTheme);
  const assign = (field, value) => {
    const node = el.querySelector(`[data-field="${field}"]`);
    if (node) node.value = value == null ? "" : String(value);
  };
  assign("language", defaults.language);
  markChoice(el, "language");
  assign("dateFormat", defaults.dateFormat);
  assign("units", defaults.units);
  assign("updateHours", defaults.updateHours);
  assign("rotateSeconds", defaults.rotateSeconds);
  assign("displayPriority", defaults.displayPriority);
  const cityField = el.querySelector('[data-field="cities"]');
  if (cityField) {
    cityField.value = JSON.stringify(defaults.cities);
    renderCityList(el, spec);
  }
  assign("countryCode", place.countryCode);
  if (spec) refillCities(el, spec);
  assign("cityEn", place.cityEn);
  assign("lat", place.lat);
  assign("lon", place.lon);
  assign("search", "");
  const openAtLogin = el.querySelector('[data-field="openAtLogin"]');
  if (openAtLogin) openAtLogin.checked = defaults.openAtLogin;
  el.querySelectorAll('[data-group="source"]').forEach((box) => {
    box.checked = defaults.enabledSources.includes(box.dataset.source);
  });
  assign("fontFamily", defaults.fontFamily);
  assign("customMode", custom.mode);
  assign("customBg", custom.bg);
  assign("customText", custom.text);
  assign("customAccent", custom.accent);
  const mode = defaults.theme === CUSTOM_THEME_ID ? CUSTOM_THEME_ID : DARK_THEMES.some((item) => item.id === defaults.theme) ? "dark" : "light";
  showThemeGroup(el, mode);
  markTheme(el, defaults.theme);
  paintCustomChip(el);
  assign("wallpaperEdited", "1");
  assign("backgroundImage", "");
  assign("backgroundName", "");
  paintWallpaperPreview(el, "", "");
  assign("transparency", defaults.transparency);
  assign("backgroundOpacity", defaults.backgroundOpacity);
  for (const field of ["transparency", "backgroundOpacity"]) {
    const out = el.querySelector(`[data-out="${field}"]`);
    const input = el.querySelector(`[data-field="${field}"]`);
    if (out && input) out.textContent = `${input.value}%`;
  }
}

function choiceRow(row) {
  const current = row.value;
  const buttons = (row.options || [])
    .map(
      (option) =>
        `<button type="button" class="choice-btn" data-choice="${esc(row.id)}" data-value="${esc(option.value)}" data-gui="popup-button" title="${esc(option.label)}" aria-pressed="${option.value === current}">${flagIcon(option.flag)}<span>${esc(option.label)}</span></button>`,
    )
    .join("");
  return `<div class="popup-row" data-row="${esc(row.id)}" style="${ROW}"><label${textKey(row.i18n)}>${esc(row.label)}</label><div class="choice-row" role="group" aria-label="${esc(row.label)}">${buttons}</div><input type="hidden" data-field="${esc(row.id)}" value="${esc(current)}"></div>`;
}

function markChoice(el, field) {
  const value = el.querySelector(`[data-field="${field}"]`)?.value;
  el.querySelectorAll(`[data-choice="${field}"]`).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.value === value));
  });
}

function wallpaperCard(row) {
  const name = row.name || "—";
  const image = row.image || "";
  return `<div class="wallpaper-card" data-row="wallpaper" data-fit-height="112" data-gui="wallpaper-card" style="display:flex;align-items:center;gap:12px;height:112px;overflow:hidden;flex:0 0 auto"><div class="wallpaper-thumb" data-gui="wallpaper-preview" data-image="${image ? "yes" : "no"}" style="background-image:${cssImage(image)}"></div><span class="wallpaper-file" title="${esc(name)}">${esc(name)}</span></div>`;
}

function cssImage(image) {
  const picture = String(image || "").replace(/['"\\\n\r]/g, "");
  return picture ? `url('${picture}')` : "none";
}

function paintWallpaperPreview(el, image, name) {
  const thumb = el.querySelector("[data-gui='wallpaper-preview']");
  if (thumb) {
    const picture = image || "";
    thumb.dataset.image = picture ? "yes" : "no";
    thumb.style.backgroundImage = cssImage(picture);
  }
  const file = el.querySelector("[data-row='wallpaper'] .wallpaper-file");
  if (file) {
    const label = name || "—";
    file.textContent = label;
    file.title = label;
  }
}

function renderRow(row) {
  const style = ` style="${ROW}"`;
  if (row.kind === "about") {
    return `<div class="about-intro" data-row="${esc(row.id)}"><img class="about-app-icon" src="${esc(row.icon)}" alt="" width="72" height="72"><div class="about-copy"><strong class="about-name">${esc(row.name)}</strong><p class="about-desc">${esc(row.description)}</p></div></div>`;
  }
  if (row.kind === "hidden") return `<input type="hidden" data-field="${esc(row.id)}" value="${esc(row.value || "")}">`;
  if (row.kind === "picture") return wallpaperCard(row);
  if (row.kind === "choice") return choiceRow(row);
  if (row.kind === "select") {
    const options = (row.options || [])
      .map((option) => `<option value="${esc(option.value)}"${textOnly(option.i18n)}${option.value === row.value ? " selected" : ""}>${esc(option.label)}</option>`)
      .join("");
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><label${textKey(row.i18n)}>${esc(row.label)}</label><select data-field="${esc(row.id)}" ${row.setup ? 'data-setup="1"' : ""} title="${esc(row.label)}"${titleOnly(row.i18n)}>${options}</select></div>`;
  }
  if (row.kind === "source") {
    return `<label class="popup-row source-row" data-row="${esc(row.id)}"${style}><input type="checkbox" data-field="${esc(row.source)}" data-group="source" data-source="${esc(row.source)}" title="${esc(row.label)}"${titleOnly(row.i18n)}${row.checked ? " checked" : ""}><span class="source-name"${textOnly(row.i18n)}>${esc(row.label)}</span><span class="source-detail" title="${esc(row.detail || "")}"${textOnly(row.detailKey)}>${esc(row.detail || "")}</span><span class="source-state is-${esc(row.tone || "idle")}" data-gui="source-state" title="${esc(row.stateTitle || row.state || "")}"${textOnly(row.stateKey)}>${esc(row.state || "—")}</span></label>`;
  }
  if (row.kind === "check") {
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span${textKey(row.i18n)}>${esc(row.label)}</span><input type="checkbox" data-field="${esc(row.id)}" title="${esc(row.label)}"${titleOnly(row.i18n)}${row.checked ? " checked" : ""}></label>`;
  }
  if (row.kind === "radio") {
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span>${esc(row.label)}</span><input type="radio" name="${esc(row.name)}" value="${esc(row.value)}" title="${esc(row.label)}"${row.checked ? " checked" : ""}></label>`;
  }
  if (row.kind === "range") {
    const decrease = row.decrease || "−";
    const increase = row.increase || "+";
    return `<div class="popup-row range-row" data-row="${esc(row.id)}"${style}><label${textKey(row.i18n)}>${esc(row.label)}</label><div class="range-control"><button type="button" class="step-btn" data-step="-5" data-target="${esc(row.id)}" data-gui="popup-button" title="${esc(decrease)}" aria-label="${esc(decrease)}"${titleOnly(row.decreaseKey)}>−</button><span class="range-end">0</span><input type="range" min="0" max="100" data-field="${esc(row.id)}" title="${esc(row.label)}"${titleOnly(row.i18n)} value="${esc(row.value)}"><span class="range-end">100</span><button type="button" class="step-btn" data-step="5" data-target="${esc(row.id)}" data-gui="popup-button" title="${esc(increase)}" aria-label="${esc(increase)}"${titleOnly(row.increaseKey)}>+</button></div><output data-out="${esc(row.id)}">${esc(row.value)}${esc(row.suffix || "")}</output></div>`;
  }
  if (row.kind === "theme-mode") {
    const buttons = row.options
      .map(
        (option) =>
          `<button type="button" class="seg-btn" data-theme-mode="${esc(option.value)}" data-gui="popup-button" title="${esc(option.label)}"${titleOnly(option.i18n)} aria-pressed="${option.value === row.value}">${icon(option.icon)}<span${textOnly(option.i18n)}>${esc(option.label)}</span></button>`,
      )
      .join("");
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><label${textKey(row.i18n)}>${esc(row.label)}</label><div class="segmented" role="group">${buttons}</div></div>`;
  }
  if (row.kind === "pager") {
    return `<div class="popup-row pager-row" data-row="${esc(row.id)}" style="${ROW};padding:0;justify-content:center"><div class="pager" data-pager></div></div>`;
  }
  if (row.kind === "themes") return themeBlock(row);
  if (row.kind === "cities") return cityBlock(row);
  if (row.kind === "found") return foundBlock(row);
  if (row.kind === "search") {
    // A row with no label column also drops the inset, so it lines up with the list below it.
    const label = row.wide ? "" : `<label${textKey(row.i18n)}>${esc(row.label)}</label>`;
    const box = row.wide ? ` style="${ROW};padding:0;margin-bottom:${SEARCH_BOX_GAP}px"` : style;
    return `<div class="popup-row" data-row="${esc(row.id)}"${box}>${label}<div class="search-control"><input type="text" data-field="${esc(row.id)}" title="${esc(row.label)}"${titleOnly(row.i18n)} value="${esc(row.value || "")}" placeholder="${esc(row.placeholder || "")}"><button type="button" data-action="${esc(row.action)}" data-gui="popup-button" title="${esc(row.buttonLabel)}"${titleOnly(row.buttonKey)}>${icon("search")}<span${textOnly(row.buttonKey)}>${esc(row.buttonLabel)}</span></button></div></div>`;
  }
  if (row.kind === "number" && row.decrease) {
    const amount = Number(row.step) || 1;
    const decrease = row.decrease || "−";
    const increase = row.increase || "+";
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><label${textKey(row.i18n)}>${esc(row.label)}</label><div class="range-control"><button type="button" class="step-btn" data-step="-${amount}" data-target="${esc(row.id)}" data-gui="popup-button" title="${esc(decrease)}" aria-label="${esc(decrease)}"${titleOnly(row.decreaseKey)}>−</button><input type="number" data-field="${esc(row.id)}" title="${esc(row.label)}"${titleOnly(row.i18n)} value="${esc(row.value)}" min="${esc(row.min)}" max="${esc(row.max)}" step="${amount}"><button type="button" class="step-btn" data-step="${amount}" data-target="${esc(row.id)}" data-gui="popup-button" title="${esc(increase)}" aria-label="${esc(increase)}"${titleOnly(row.increaseKey)}>+</button></div></div>`;
  }
  if (row.kind === "number" || row.kind === "date" || row.kind === "text") {
    const type = row.kind === "date" ? "date" : row.kind === "text" ? "text" : "number";
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span${textKey(row.i18n)}>${esc(row.label)}</span><input type="${type}" data-field="${esc(row.id)}" title="${esc(row.label)}"${titleOnly(row.i18n)} value="${esc(row.value)}"${type === "number" ? ' step="any"' : ""}${row.min != null ? ` min="${row.min}" max="${row.max}"` : ""}></label>`;
  }
  if (row.kind === "input" && row.multiline) {
    return `<label class="text-block" data-row="${esc(row.id)}" data-fit-height="${ERROR_TEXT_HEIGHT}" style="display:flex;flex-direction:column;gap:4px;height:${ERROR_TEXT_HEIGHT}px;overflow:hidden;flex:0 0 auto"><span>${esc(row.label)}</span><textarea readonly wrap="off" data-field="${esc(row.id)}" title="${esc(row.label)}"></textarea></label>`;
  }
  if (row.kind === "input") {
    return `<label class="popup-row" data-row="${esc(row.id)}"${style}><span>${esc(row.label)}</span><input type="text" readonly data-field="${esc(row.id)}" title="${esc(row.label)}"></label>`;
  }
  if (row.kind === "fontsample") {
    return `<div class="popup-row font-sample-row" data-row="${esc(row.id)}"${style}><span${textKey(row.i18n)}>${esc(row.label)}</span><div class="font-sample" data-font-sample>${esc(row.text)}</div></div>`;
  }
  if (row.kind === "actions") {
    const buttons = (row.buttons || [])
      .map(
        (button) =>
          `<button type="button" data-action="${esc(button.action)}" data-gui="popup-button" title="${esc(button.label)}"${titleOnly(button.i18n)} style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap">${icon(button.icon || "dot")}<span class="menu-label"${textOnly(button.i18n)}>${esc(button.label)}</span></button>`,
      )
      .join("");
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><span></span><div class="row-actions">${buttons}</div></div>`;
  }
  if (row.kind === "action") {
    return `<div class="popup-row" data-row="${esc(row.id)}"${style}><span></span><button type="button" data-action="${esc(row.action)}" data-gui="popup-button" title="${esc(row.label)}"${titleOnly(row.i18n)} style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap">${icon(row.icon || "dot")}<span class="menu-label"${textOnly(row.i18n)}>${esc(row.label)}</span></button></div>`;
  }
  if (row.kind === "recent") {
    return `<div class="popup-row" data-row="${esc(row.id)}" data-recent="1"${style}><span class="path" title="${esc(row.label)}">${esc(row.label)}</span><button type="button" class="icon-btn" data-action="recent-open" data-path="${esc(row.path)}" data-gui="popup-button" title="${esc(row.openTip || row.label)}" style="white-space:nowrap">${icon("open")}</button><button type="button" class="icon-btn" data-action="recent-delete" data-path="${esc(row.path)}" data-gui="popup-button" title="${esc(row.tip || row.label)}" style="white-space:nowrap">${icon("trash")}</button></div>`;
  }
  if (row.kind === "bar") {
    return `<div class="popup-row" data-row="bar"${style}><div class="bar-track" style="flex:1;height:8px;overflow:hidden"><div class="bar-fill" style="width:0%;height:8px"></div></div><span data-progress-pct>0%</span></div>`;
  }
  const tone = row.tone ? ` data-tone="${esc(row.tone)}"` : "";
  return `<div class="popup-row" data-row="${esc(row.id || "static")}"${tone}${style}><span${textKey(row.i18n)}>${esc(row.label || "")}</span><span${textKey(row.valueKey)} title="${esc(row.value || "")}">${esc(row.value || "")}</span></div>`;
}

function swatch(id, name, colors, selected) {
  return `<button type="button" class="swatch" data-theme-id="${esc(id)}" data-gui="theme-swatch" title="${esc(name)}" aria-pressed="${selected}"><span class="chip" style="background:linear-gradient(160deg, ${colors.bgTop}, ${colors.bg});color:${colors.text}"><span class="swatch-name">${esc(name)}</span><i style="background:${colors.accent}"></i></span></button>`;
}

function themeBlock(row) {
  const { language, value, mode, custom } = row;
  const t = (key) => row.labels?.[key] || "";
  const group = (id, themes) =>
    `<div class="theme-grid" data-theme-group="${id}" ${mode === id ? "" : "hidden"} style="display:${mode === id ? "grid" : "none"}">${themes
      .map((theme) => swatch(theme.id, theme.name[language] || theme.name.en, theme, theme.id === value))
      .join("")}</div>`;
  const customColors = themeColors(CUSTOM_THEME_ID, custom);
  const colorRow = (id, label, current, key) =>
    `<label class="popup-row" data-row="${id}" style="${ROW}"><span${textKey(key)}>${esc(label)}</span><input type="color" data-field="${id}" title="${esc(label)}"${titleOnly(key)} value="${esc(current)}"><code data-out="${id}">${esc(current)}</code></label>`;
  const customGroup = `<div class="custom-theme" data-theme-group="${CUSTOM_THEME_ID}" ${mode === CUSTOM_THEME_ID ? "" : "hidden"} style="display:${mode === CUSTOM_THEME_ID ? "flex" : "none"};flex-direction:column">
    <div class="custom-head">${swatch(CUSTOM_THEME_ID, t("custom"), customColors, value === CUSTOM_THEME_ID)}<span class="custom-hint"${textOnly("theme.customHint")}>${esc(t("customHint"))}</span></div>
    <div class="popup-row" data-row="customMode" style="${ROW}"><label${textKey("field.customMode")}>${esc(t("customMode"))}</label><select data-field="customMode" title="${esc(t("customMode"))}"${titleOnly("field.customMode")}><option value="dark"${textOnly("theme.modeDark")}${custom.mode === "dark" ? " selected" : ""}>${esc(t("modeDark"))}</option><option value="light"${textOnly("theme.modeLight")}${custom.mode === "light" ? " selected" : ""}>${esc(t("modeLight"))}</option></select></div>
    ${colorRow("customBg", t("customBg"), custom.bg, "field.customBg")}
    ${colorRow("customText", t("customText"), custom.text, "field.customText")}
    ${colorRow("customAccent", t("customAccent"), custom.accent, "field.customAccent")}
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
    scale: Number(el.querySelector('[data-field="scale"]')?.value || 100),
    header: el.querySelector('[data-field="header"]')?.value !== "off",
    pageNumber: el.querySelector('[data-field="pageNumber"]')?.value !== "off",
    pageNumberAt: el.querySelector('[data-field="pageNumberAt"]')?.value || "right",
  };
}

/** Everything the print window decides: what goes on the paper and how the paper is set up. */
function printValues(el) {
  return {
    ...setupValues(el),
    scope: el.querySelector('input[name="scope"]:checked')?.value || "current",
    from: el.querySelector('[data-field="from"]')?.value || "",
    to: el.querySelector('[data-field="to"]')?.value || "",
    ranges: ["daily", "weekly", "monthly"].filter((range) => el.querySelector(`[data-field="range-${range}"]`)?.checked),
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

export function applyPopupLanguage(root, spec) {
  const language = spec?.language === "en" ? "en" : "ko";
  if (spec) spec.language = language;
  const i18n = createI18n(language);
  const text = (key) => (key ? i18n.t(key) : "");
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const next = text(node.dataset.i18n);
    if (!next || next.startsWith("«")) return;
    node.textContent = next;
  });
  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const next = text(node.dataset.i18nTitle);
    if (!next || next.startsWith("«")) return;
    node.title = next;
    if (node.hasAttribute("aria-label")) node.setAttribute("aria-label", next);
  });
  for (const theme of [...LIGHT_THEMES, ...DARK_THEMES]) {
    const button = root.querySelector(`.swatch[data-theme-id="${theme.id}"]`);
    if (!button) continue;
    const name = theme.name?.[language] || theme.name?.en || "";
    if (!name) continue;
    button.title = name;
    const label = button.querySelector(".swatch-name");
    if (label) label.textContent = name;
  }
  const customName = text("theme.custom");
  const custom = root.querySelector(`.swatch[data-theme-id="${CUSTOM_THEME_ID}"]`);
  if (custom && customName && !customName.startsWith("«")) {
    custom.title = customName;
    const label = custom.querySelector(".swatch-name");
    if (label) label.textContent = customName;
  }
  if (spec?.catalog) {
    refillCountries(root, spec);
    refillCities(root, spec);
  }
  renderCityList(root, spec);
  renderFoundList(root, spec);
}

/**
 * The chosen font is shown on a sample line rather than applied to the whole dialog, which
 * would reshape its own labels and buttons.
 */
export function applyPopupFont(el, values = {}) {
  if (!el) return;
  const sample = el?.querySelector("[data-font-sample]");
  if (!sample) return;
  const family = values.fontFamily || "";
  sample.style.fontFamily = family ? `"${family}", sans-serif` : "";
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
  if (patch.backgroundName != null || patch.backgroundImage != null) {
    const name = el.querySelector('[data-field="backgroundName"]');
    const image = el.querySelector('[data-field="backgroundImage"]');
    const edited = el.querySelector('[data-field="wallpaperEdited"]');
    if (patch.backgroundName != null && name) name.value = patch.backgroundName || "";
    if (patch.backgroundImage != null && image) image.value = patch.backgroundImage || "";
    if (edited) edited.value = "1";
    paintWallpaperPreview(
      el,
      patch.backgroundImage != null ? patch.backgroundImage : image?.value || "",
      patch.backgroundName != null ? patch.backgroundName : name?.value || "",
    );
  }
  if (patch.markup != null) {
    const fit = el.querySelector(".forecast-fit");
    if (fit) fit.innerHTML = patch.markup;
    if (spec) spec.markup = patch.markup;
  }
  if (patch.query != null) {
    const box = el.querySelector('[data-field="query"]');
    if (box) box.value = String(patch.query);
    if (spec) spec.query = String(patch.query);
  }
  if (patch.results != null) {
    if (spec) spec.results = Array.isArray(patch.results) ? patch.results : [];
    const block = el.querySelector('[data-row="cityFound"]');
    if (block) block.dataset.pageAt = "1";
    renderFoundList(el, spec);
  }
  if (patch.cities != null) {
    const field = el.querySelector('[data-field="cities"]');
    if (field) {
      field.value = JSON.stringify(parseCityList(patch.cities));
      renderCityList(el, spec);
      const list = el.querySelector('[data-row="cityList"] .city-list');
      if (list) list.scrollTop = list.scrollHeight;
    }
  }
  if (patch.city != null) {
    const label = el.querySelector(".popup-city");
    if (label) label.textContent = patch.city || "";
    if (spec) spec.city = patch.city;
  }
  if (patch.when != null) {
    const label = el.querySelector(".popup-when");
    if (label) label.textContent = patch.when || "";
    if (spec) spec.when = patch.when;
  }
  if (patch.html) {
    el._html = patch.html;
    el.dataset.printHtml = patch.html;
  }
  if (spec?.type === "print" && patch.html) spec.html = patch.html;
  if (patch.pages) {
    if (spec) {
      spec.pages = patch.pages;
      if (patch.pageSetup) spec.pageSetup = patch.pageSetup;
    }
    paintPreviewPage(el, spec, spec?.pageAt || 0);
  }
}

export const CITY_LIST_HEIGHT = 190;
export const SEARCH_LIST_HEIGHT = 144;
/** Space under the search box, so it reads apart from the results it brings back. */
export const SEARCH_BOX_GAP = 12;
export const CITY_PAGE_SIZE = 8;

/** A label on the left and a paged list on the right, so the block lines up with the plain rows. */
function listBlock(row, { listClass, gui }) {
  const height = Number(row.height) || CITY_LIST_HEIGHT;
  return `<div class="list-block" data-row="${esc(row.id)}" data-fit-height="${height}" style="display:flex;gap:8px;height:${height}px;overflow:hidden;flex:0 0 auto"><span class="list-block-label"${textOnly(row.i18n)}>${esc(row.label)}</span><div class="list-block-body"><div class="${listClass}" data-gui="${gui}"></div></div></div>`;
}

function cityBlock(row) {
  const height = Number(row.height) || CITY_LIST_HEIGHT;
  return `<div class="list-block" data-row="${esc(row.id)}" data-fit-height="${height}" style="display:flex;gap:8px;height:${height}px;overflow:hidden;flex:0 0 auto"><span class="list-block-label"${textOnly(row.i18n)}>${esc(row.label)}</span><div class="list-block-body"><div class="city-list" data-gui="city-list"></div></div></div>`;
}

function foundBlock(row) {
  return listBlock(row, { listClass: "city-grid", gui: "city-found" });
}

export function cityName(place, language) {
  const ko = language !== "en";
  if (!place) return "";
  return ko ? place.cityKo || place.cityEn || "" : place.cityEn || place.cityKo || "";
}

export function countryName(place, language) {
  const ko = language !== "en";
  if (!place) return "";
  return ko ? place.countryKo || place.countryEn || "" : place.countryEn || place.countryKo || "";
}

/** How many page numbers are offered at once, and how far the outer arrows jump. */
export const PAGE_SPAN = 10;

/** Pages are 1-based for the reader and clamped so an emptied list never shows a blank page. */
export function pageWindow(count, page, size = CITY_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(Math.max(0, count) / size));
  const at = Math.min(Math.max(1, Math.round(Number(page) || 1)), pages);
  const first = Math.max(1, Math.min(at - Math.floor(PAGE_SPAN / 2), pages - PAGE_SPAN + 1));
  const numbers = [];
  for (let n = first; n <= Math.min(pages, first + PAGE_SPAN - 1); n += 1) numbers.push(n);
  return { page: at, pages, start: (at - 1) * size, end: Math.min(count, at * size), numbers };
}

function pagerHtml(window_, labels) {
  if (window_.pages <= 1) return "";
  const step = (action, text, tip, off) =>
    `<button type="button" class="pager-btn" data-page="${action}" data-gui="popup-button" title="${esc(tip)}" aria-label="${esc(tip)}"${off ? " disabled" : ""}>${esc(text)}</button>`;
  const numbers = window_.numbers
    .map(
      (n) =>
        `<button type="button" class="pager-btn pager-num${n === window_.page ? " is-active" : ""}" data-page="${n}" data-gui="popup-button" title="${n}" aria-label="${n}">${n}</button>`,
    )
    .join("");
  return `${step("back-span", "\u00ab", labels.backSpan, window_.page === 1)}${step("prev", "\u2039", labels.prev, window_.page === 1)}${numbers}${step("next", "\u203a", labels.next, window_.page === window_.pages)}${step("next-span", "\u00bb", labels.nextSpan, window_.page === window_.pages)}`;
}

function cityEntries(cities, language, tip, action) {
  return (cities || [])
    .map((place, index) => {
      const name = cityName(place, language);
      const full = `${name} · ${countryName(place, language)}`;
      return `<div class="city-entry" data-city-entry="${index}"><span class="city-name" title="${esc(full)}">${esc(name)}</span><span class="city-country" title="${esc(countryName(place, language))}">${esc(countryName(place, language))}</span><button type="button" class="icon-btn" data-action="${esc(action)}" data-index="${index}" data-gui="popup-button" title="${esc(tip)}" aria-label="${esc(tip)}">${icon("add", { colorful: true })}</button></div>`;
    })
    .join("");
}

/** One city per line, with the country beside it and the handle that moves it. */
function cityLines(cities, language, removeTip, dragTip) {
  return (cities || [])
    .map((place, index) => {
      const name = cityName(place, language);
      const country = countryName(place, language);
      return `<div class="city-row" data-city-entry="${index}"><span class="city-name" title="${esc(name)}">${esc(name)}</span><span class="city-country" title="${esc(country)}">${esc(country)}</span><button type="button" class="icon-btn" data-action="city-remove" data-index="${index}" data-gui="popup-button" title="${esc(removeTip)}" aria-label="${esc(removeTip)}">${icon("trash", { colorful: true })}</button><button type="button" class="icon-btn city-grip" data-city-grip="${index}" data-gui="popup-button" title="${esc(dragTip)}" aria-label="${esc(dragTip)}">${icon("grip")}</button></div>`;
    })
    .join("");
}

/**
 * Which row the pointer is over. The cursor position decides it when the list has laid out,
 * and the row under the pointer otherwise, which is what a test sees.
 */
function cityDropIndex(list, event) {
  const rows = [...list.children];
  const box = list.getBoundingClientRect();
  if (box.height > 0 && Number.isFinite(event.clientY)) {
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) return index;
    }
    return rows.length - 1;
  }
  const over = event.target?.closest?.("[data-city-entry]");
  return over && list.contains(over) ? rows.indexOf(over) : Number.NaN;
}

/** Moving an entry pushes the ones it passes along, instead of swapping two of them. */
export function moveCity(list, from, to) {
  const next = [...(list || [])];
  if (from < 0 || from >= next.length) return next;
  const at = Math.min(Math.max(0, to), next.length - 1);
  if (at === from) return next;
  const [moved] = next.splice(from, 1);
  next.splice(at, 0, moved);
  return next;
}

export function parseCityList(value) {
  if (Array.isArray(value)) return value;
  try {
    const list = JSON.parse(String(value || "[]"));
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry === "object") : [];
  } catch {
    return [];
  }
}

function pagerLabels(i18n) {
  return {
    backSpan: formatMessage(i18n.t("page.backSpan"), { n: PAGE_SPAN }),
    prev: i18n.t("page.prev"),
    next: i18n.t("page.next"),
    nextSpan: formatMessage(i18n.t("page.nextSpan"), { n: PAGE_SPAN }),
  };
}

function paintList(block, pager, places, language, tip, action) {
  if (!block) return;
  const grid = block.querySelector(".city-grid");
  if (!grid) return;
  const i18n = createI18n(language);
  const window_ = pageWindow(places.length, Number(block.dataset.pageAt) || 1);
  block.dataset.pageAt = String(window_.page);
  block.dataset.pageCount = String(window_.pages);
  const shown = places.slice(window_.start, window_.end);
  const offset = (attribute) => (html) => html.replace(new RegExp(`${attribute}="(\\d+)"`, "g"), (_, at) => `${attribute}="${window_.start + Number(at)}"`);
  grid.innerHTML = offset("data-city-entry")(offset("data-index")(cityEntries(shown, language, tip, action)));
  if (pager) pager.innerHTML = pagerHtml(window_, pagerLabels(i18n));
}

function renderCityList(el, spec) {
  const block = el?.querySelector('[data-row="cityList"]');
  const field = el?.querySelector('[data-field="cities"]');
  const list = block?.querySelector(".city-list");
  if (!block || !field || !list) return;
  const language = spec?.language === "en" ? "en" : "ko";
  const i18n = createI18n(language);
  list.innerHTML = cityLines(parseCityList(field.value), language, i18n.t("tip.removeCity"), i18n.t("tip.reorderCity"));
}

function renderFoundList(el, spec) {
  const block = el?.querySelector('[data-row="cityFound"]');
  if (!block) return;
  const language = spec?.language === "en" ? "en" : "ko";
  const found = Array.isArray(spec?.results) ? spec.results : [];
  paintList(block, el.querySelector("[data-pager]"), found, language, createI18n(language).t("tip.addCity"), "city-use");
  const empty = block.querySelector(".city-grid");
  if (empty && !found.length) empty.innerHTML = `<span class="city-empty">${esc(createI18n(language).t("field.foundHint"))}</span>`;
}

function addCity(el, spec, handlers, place) {
  if (!place) return;
  const field = el.querySelector('[data-field="cities"]');
  const cities = parseCityList(field?.value);
  if (cities.some((entry) => samePlace(entry, place))) {
    void handlers.immediate?.({ type: "city-notice", notice: "exists", popupId: spec.popupId });
    return;
  }
  if (cities.length >= MAX_CITIES) {
    void handlers.immediate?.({ type: "city-notice", notice: "full", popupId: spec.popupId });
    return;
  }
  cities.push(place);
  field.value = JSON.stringify(cities);
  renderCityList(el, spec);
  void handlers.immediate?.({ type: "city-notice", notice: "added", popupId: spec.popupId });
}

/** The country and city pickers describe one place; the catalog carries its names and coordinates. */
function pickedPlace(el, spec) {
  const countryCode = el.querySelector('[data-field="countryCode"]')?.value || "";
  const cityEn = el.querySelector('[data-field="cityEn"]')?.value || "";
  const found = (spec?.catalog || []).find((entry) => entry.countryCode === countryCode && entry.cityEn === cityEn);
  if (!found) return null;
  const lat = Number(el.querySelector('[data-field="lat"]')?.value);
  const lon = Number(el.querySelector('[data-field="lon"]')?.value);
  return {
    ...found,
    lat: Number.isFinite(lat) ? lat : found.lat,
    lon: Number.isFinite(lon) ? lon : found.lon,
  };
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

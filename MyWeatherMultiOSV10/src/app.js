import { WINDOW_TITLE } from "./core/app-info.js";
import { copyRange, cutText, pasteText } from "./core/clipboard.js";
import { createDocument, createPlace, createTab, displayCity, displayCountry, parseDocument, serializeDocument, suggestedFileName } from "./core/document.js";
import { acceptImage, classifyDrop } from "./core/drop.js";
import { AppError, normalizeError } from "./core/errors.js";
import { resolveFontList } from "./core/fonts.js";
import { DICT, createI18n, formatMessage } from "./core/i18n.js";
import { dirname } from "./core/paths.js";
import { buildPrintModel, normalizeSetup } from "./core/print-model.js";
import { RecentFiles } from "./core/recent.js";
import { clamp, sanitizeSettings } from "./core/settings.js";
import { applyThemeVars, isTheme, sanitizeCustomTheme, themeColors, themeVars } from "./core/themes.js";
import { UndoStack } from "./core/undo.js";
import { FONT_STYLES } from "./core/fonts.js";
import { CITIES, filterCities } from "./weather/cities.js";
import { formatTemp, isoDate } from "./weather/format.js";
import { geocodeUrl, parseGeocoding, sourcePageUrl } from "./weather/providers.js";
import { loadWeather } from "./weather/service.js";
import { conditionText } from "./weather/wmo.js";
import { gripIcon, icon } from "./ui/icons.js";
import { layoutMenu } from "./ui/menu-layout.js";
import { buildMenuElement, buildMenuItems } from "./ui/menus.js";
import {
  PopupLayer,
  buildAboutSpec,
  buildErrorSpec,
  buildForecastSpec,
  buildPreviewSpec,
  buildPrintSpec,
  buildProgressSpec,
  buildSettingsSpec,
  buildUnsavedSpec,
} from "./ui/popups.js";
import { TAB_WIDTH, layoutTabScroller } from "./ui/tab-scroller.js";
import { attachWindowDrag } from "./ui/window-drag.js";
import { CONTENT_PADDING, WINDOW_DEFAULT, clampWindowSize, sceneFit } from "./ui/window-spec.js";
import { forecastFitHeight, renderForecastHtml, renderWeatherHtml } from "./ui/weather-view.js";

export function createApp(container, options = {}) {
  const app = new WeatherApp(container, options);
  app.mount();
  return app;
}

const TOAST_MS = 2600;

class WeatherApp {
  constructor(container, options) {
    this.root = container;
    this.options = options;
    this.platform = options.platform;
    this.i18n = createI18n("ko");
    this.history = new UndoStack();
    this.recent = new RecentFiles(10);
    this.extraCities = [];
    this.fonts = resolveFontList([]);
    this.settings = sanitizeSettings(this.platform.readSettingsSync?.() || null);
    this.recent.load(this.settings.recentFiles);
    this.i18n.setLanguage(this.settings.language);
    this.doc = createDocument(this.settings.defaultLocation);
    this.pageSetup = { paper: "A4", orientation: "portrait", margin: 15 };
    this.selectionText = "";
    this.progressLog = [];
    this.tabStart = 0;
    this.workspaceWidth = null;
    this.searchQuery = "";
    this.locationDraft = null;
    this.closed = false;
    this.destroyed = false;
    this.menuEl = null;
    this.progressAborted = false;
    this.now = options.now || (() => new Date());
    this.maximized = false;
    this.minimized = false;
    this.shellOffset = { x: 0, y: 0 };
    this.statusMessage = "";
    this.titleText = "";
    this.shellSize = clampWindowSize(this.settings.windowSize || WINDOW_DEFAULT);
  }

  mount() {
    this.root.innerHTML = `
      <div class="app-frame" data-chromeless="true" data-gui="window" data-host="${escapeAttr(this.platform.kind || "web")}" data-maximized="false" data-minimized="false">
        <div class="window-shell" data-gui="shell">
          <div class="wallpaper" data-gui="wallpaper"></div>
          <div class="shell-top" data-gui="drag-region">
            <div class="titlebar" data-gui="titlebar">
              <img class="title-icon" src="../assets/icon.png" alt="" width="18" height="18">
              <span class="title-name" data-gui="window-title">${WINDOW_TITLE}</span>
            </div>
            <div class="range-tools" data-gui="range-tools">
              <button type="button" class="tool-btn" data-cmd="daily" data-gui="range-button" data-i18n-title="forecast.daily">${icon("daily")}</button>
              <button type="button" class="tool-btn" data-cmd="weekly" data-gui="range-button" data-i18n-title="forecast.weekly">${icon("weekly")}</button>
              <button type="button" class="tool-btn" data-cmd="monthly" data-gui="range-button" data-i18n-title="forecast.monthly">${icon("monthly")}</button>
            </div>
            <div class="tabbar" data-gui="tabbar" hidden>
              <button type="button" class="chev" data-cmd="tab-prev" data-gui="tab-nav" data-i18n-title="tip.tabPrev">${icon("left")}</button>
              <div id="tab-strip" class="tab-strip"></div>
              <button type="button" class="chev" data-cmd="tab-next" data-gui="tab-nav" data-i18n-title="tip.tabNext">${icon("right")}</button>
            </div>
            <div class="corner-actions" data-gui="corner-actions">
              <button type="button" class="icon-btn" data-cmd="refresh" data-gui="corner-button" data-i18n-title="tip.refresh">${icon("refresh")}</button>
              <button type="button" class="icon-btn" data-cmd="settings" data-gui="corner-button" data-i18n-title="tip.settings">${icon("settings")}</button>
              <span class="corner-sep" aria-hidden="true"></span>
              <button type="button" class="icon-btn win-btn" data-cmd="minimize" data-gui="window-control" data-i18n-title="tip.minimize">${icon("windowMin")}</button>
              <button type="button" class="icon-btn win-btn" data-cmd="maximize" data-gui="window-control" data-i18n-title="tip.maximize">${icon("windowMax")}</button>
              <button type="button" class="icon-btn win-btn win-close" data-cmd="close" data-gui="window-control" data-i18n-title="tip.close">${icon("windowClose")}</button>
            </div>
          </div>
          <div id="content" class="content" data-gui="content"></div>
          <div class="toast" data-gui="toast" role="status" aria-live="polite" hidden></div>
          <button type="button" class="resize-grip" data-gui="resize-grip" data-i18n-title="tip.resize">${gripIcon()}</button>
        </div>
      </div>
      <div id="overlay-root" data-gui="overlay"></div>`;
    this.frame = this.root.querySelector(".app-frame");
    this.shell = this.root.querySelector(".window-shell");
    this.overlay = this.root.querySelector("#overlay-root");
    this.content = this.root.querySelector("#content");
    this.tabStrip = this.root.querySelector("#tab-strip");
    this.toast = this.root.querySelector(".toast");
    this.grip = this.root.querySelector(".resize-grip");
    this.wallpaper = this.root.querySelector(".wallpaper");
    this.popups = new PopupLayer(this.overlay);
    this.bind();
    this.detachDrag = attachWindowDrag(this.shell, (step) => this.onShellDrag(step));
    this.applyShellSize();
    if (typeof ResizeObserver === "function") {
      this.sceneObserver = new ResizeObserver(() => this.applySceneScale());
      this.sceneObserver.observe(this.content);
    }
    this.applyAll();
    this.platform.onMenuCommand?.((id) => this.run(id));
    this.platform.onRequestClose?.(() => this.requestClose());
    this.platform.onWindowState?.((state) => this.applyWindowState(state));
    this.platform.onPopupImmediate?.(async (msg) => {
      const handler = this.nativeImmediate || ((item) => this.handlePopupImmediate(item));
      const patch = await handler(msg);
      if (patch && msg.popupId) await this.platform.updatePopup?.(msg.popupId, patch);
    });
    if (this.options.reportGlobalErrors) {
      this.onWindowError = (event) => this.reportError(event.error || new Error(event.message || "Unknown error"), "window");
      this.onRejection = (event) => this.reportError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), "promise");
      window.addEventListener("error", this.onWindowError);
      window.addEventListener("unhandledrejection", this.onRejection);
    }
    this.ready = this.finishLoad();
  }

  async finishLoad() {
    try {
      if (!this.platform.readSettingsSync && this.platform.readSettings) {
        const raw = await this.platform.readSettings();
        if (raw) {
          this.settings = sanitizeSettings(raw);
          this.recent.load(this.settings.recentFiles);
          this.i18n.setLanguage(this.settings.language);
        }
      }
      this.fonts = resolveFontList(await this.platform.listFonts());
      if (!this.fonts.includes(this.settings.fontFamily)) this.fonts.unshift(this.settings.fontFamily);
      this.applyAll();
      if (this.options.autoLoad) await this.refreshWeather();
    } catch (error) {
      this.reportError(error, "startup");
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.toastTimer);
    this.endResize?.();
    this.detachDrag?.();
    this.popups?.closeAll();
    this.sceneObserver?.disconnect();
    this.closeMenu();
    this.unbind?.();
    if (this.onWindowError) window.removeEventListener("error", this.onWindowError);
    if (this.onRejection) window.removeEventListener("unhandledrejection", this.onRejection);
    this.root.innerHTML = "";
  }

  t(key, vars) {
    return formatMessage(this.i18n.t(key), vars);
  }

  currentTab() {
    return this.doc.tabs[this.doc.activeIndex] || this.doc.tabs[0];
  }

  cityChoices() {
    return [...CITIES, ...this.extraCities];
  }

  bind() {
    const onKey = (event) => this.onKey(event);
    const onPointer = (event) => this.onPointer(event);
    let suppressClick = null;
    const runCommand = (button, event) => {
      const cmd = button.dataset.cmd;
      if (cmd.startsWith("menu:")) this.openMenu(cmd.slice(5), event);
      else this.run(cmd);
    };
    const onPointerUp = (event) => {
      if (event.button != null && event.button !== 0) return;
      const button = event.target?.closest?.("[data-cmd]");
      if (!button || button.disabled || !this.frame.contains(button)) return;
      suppressClick = button;
      runCommand(button, event);
      queueMicrotask(() => {
        if (suppressClick === button) suppressClick = null;
      });
    };
    const onClick = (event) => {
      const button = event.target.closest("[data-cmd]");
      if (!button || button.disabled || !this.frame.contains(button)) return;
      if (suppressClick === button) {
        suppressClick = null;
        return;
      }
      runCommand(button, event);
    };
    const onInput = (event) => this.onInput(event);
    const onChange = (event) => this.onChange(event);
    const onFocusIn = (event) => {
      if (event.target.dataset?.prop) event.target.dataset.before = event.target.type === "checkbox" ? String(event.target.checked) : event.target.value;
    };
    const onFocusOut = (event) => this.onFocusOut(event);
    const onWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      this.setZoom(this.settings.zoom + (event.deltaY < 0 ? 10 : -10), { recordUndo: false });
    };
    const onDragOver = (event) => {
      event.preventDefault();
      this.frame.classList.add("drop-active");
    };
    const onDragLeave = () => this.frame.classList.remove("drop-active");
    const onDrop = (event) => {
      event.preventDefault();
      this.frame.classList.remove("drop-active");
      void this.handleDroppedFiles(event.dataTransfer?.files);
    };
    const onContext = (event) => {
      const day = event.target.closest("[data-date]");
      if (day && this.content.contains(day)) {
        event.preventDefault();
        this.selectDate(day.dataset.date);
        this.openMenu("context", event, { atPointer: true });
        return;
      }
      if (event.target.closest("input, textarea, select")) return;
      event.preventDefault();
      this.openMenu("window", event, { atPointer: true });
    };
    const onTopDouble = (event) => {
      if (event.target.closest("button")) return;
      void this.run("maximize");
    };
    const onGripDown = (event) => this.beginResize(event);
    const onContentClick = (event) => {
      const day = event.target.closest("[data-date]");
      if (day) this.selectDate(day.dataset.date);
    };
    const onTabClick = (event) => {
      const tab = event.target.closest("[data-tab-id]");
      if (tab) this.selectTab(tab.dataset.tabId);
    };
    this.frame.addEventListener("pointerup", onPointerUp);
    this.frame.addEventListener("click", onClick);
    this.frame.addEventListener("input", onInput);
    this.frame.addEventListener("change", onChange);
    this.frame.addEventListener("focusin", onFocusIn);
    this.frame.addEventListener("focusout", onFocusOut);
    this.frame.addEventListener("wheel", onWheel, { passive: false });
    this.frame.addEventListener("dragover", onDragOver);
    this.frame.addEventListener("dragleave", onDragLeave);
    this.frame.addEventListener("drop", onDrop);
    this.shell.addEventListener("contextmenu", onContext);
    this.root.querySelector(".shell-top").addEventListener("dblclick", onTopDouble);
    this.grip.addEventListener("pointerdown", onGripDown);
    this.content.addEventListener("click", onContentClick);
    this.tabStrip.addEventListener("click", onTabClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    this.unbind = () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }

  onPointer(event) {
    if (!this.menuEl) return;
    if (this.menuEl.contains(event.target) || event.target.closest?.(".menubar")) return;
    this.closeMenu();
  }

  onKey(event) {
    if (this.destroyed) return;
    if (event.key === "Escape" && this.menuEl) {
      this.closeMenu();
      return;
    }
    if (event.key === "F5") {
      event.preventDefault();
      void this.run("refresh");
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    const map = {
      n: () => this.run("new"),
      o: () => this.run("open"),
      s: () => this.run(event.shiftKey ? "save-as" : "save"),
      z: () => this.run(event.shiftKey ? "redo" : "undo"),
      y: () => this.run("redo"),
      x: () => this.run("cut"),
      c: () => this.run("copy"),
      v: () => this.run("paste"),
      p: () => this.run("print"),
      ",": () => this.run("settings"),
      "0": () => this.run("zoom-reset"),
      "=": () => this.run("zoom-in"),
      "+": () => this.run("zoom-in"),
      "-": () => this.run("zoom-out"),
    };
    if (!map[key]) return;
    event.preventDefault();
    map[key]();
  }

  onInput(event) {
    const field = event.target.dataset?.field;
    if (field === "search") {
      this.searchQuery = event.target.value;
      this.fillCities();
    }
  }

  onChange(event) {
    const field = event.target.dataset?.field;
    if (field === "country") this.fillCities();
    if (field === "city") this.fillCoordinatesFromCity();
    if (field === "view") this.commitView(event.target.value);
    if (event.target.dataset?.group === "source") this.toggleSource(event.target.dataset.source, event.target.checked);
    if (field === "day") this.selectDate(event.target.value);
    if (event.target.dataset?.prop === "favorite") this.commitProp("favorite", event.target.checked, event.target.dataset.before === "true");
  }

  onFocusOut(event) {
    const prop = event.target.dataset?.prop;
    if (!prop || prop === "favorite") return;
    this.commitProp(prop, event.target.value, event.target.dataset.before);
  }

  async run(id) {
    try {
      if (!id) return;
      if (id.startsWith("recent:")) return await this.openRecent(Number(id.slice(7)));
      if (id.startsWith("theme:")) return await this.setTheme(id.slice(6));
      if (id.startsWith("lang:")) return await this.setLanguage(id.slice(5));
      const actions = {
        new: () => this.newDocument(),
        open: () => this.open(),
        save: () => this.save(),
        "save-as": () => this.saveAs(),
        undo: () => this.undo(),
        redo: () => this.redo(),
        cut: () => this.cut(),
        copy: () => this.copy(),
        paste: () => this.paste(),
        print: () => this.openPrint(),
        refresh: () => this.refreshWeather(),
        settings: () => this.showSettings("general"),
        fonts: () => this.showSettings("font"),
        about: () => this.showAbout(),
        minimize: () => this.minimizeWindow(),
        maximize: () => this.toggleMaximize(),
        close: () => this.requestClose(),
        exit: () => this.requestClose(),
        "tab-prev": () => this.nudgeTabs(-1),
        "tab-next": () => this.nudgeTabs(1),
        "apply-location": () => this.applyLocation(),
        "add-tab": () => this.addTab(),
        "close-tab": () => this.closeTab(),
        "search-online": () => this.searchOnline(),
        download: () => this.downloadWeather(),
        "open-link": () => this.openSourceLink(),
        "choose-wallpaper": () => this.chooseWallpaper(),
        "clear-wallpaper": () => this.setWallpaper("", ""),
        "zoom-in": () => this.setZoom(this.settings.zoom + 10),
        "zoom-out": () => this.setZoom(this.settings.zoom - 10),
        "zoom-reset": () => this.setZoom(100),
        daily: () => this.showForecast("daily"),
        weekly: () => this.showForecast("weekly"),
        monthly: () => this.showForecast("monthly"),
        "clear-recent": () => this.clearRecent(),
        "toggle-favorite": () => this.toggleFavorite(),
      };
      if (actions[id]) await actions[id]();
    } catch (error) {
      if (error?.name === "AbortError") {
        this.setStatus(this.t("status.cancelled"));
        return;
      }
      this.reportError(error, id);
    }
  }

  operationLabel(id) {
    if (!id) return "";
    const key = `cmd.${String(id).replace(/[-:](\w)/g, (_, ch) => ch.toUpperCase())}`;
    return Object.prototype.hasOwnProperty.call(DICT[this.settings.language] || DICT.ko, key) ? `${this.t(key)} (${id})` : String(id);
  }

  async minimizeWindow() {
    await this.platform.windowControl?.("minimize");
    if (this.platform.nativeWindow) return;
    this.applyWindowState({ minimized: !this.minimized, maximized: this.maximized });
  }

  async toggleMaximize() {
    await this.platform.windowControl?.("maximize");
    if (this.platform.nativeWindow) return;
    this.applyWindowState({ maximized: !this.maximized, minimized: false });
  }

  applyWindowState(state = {}) {
    if (this.destroyed) return;
    this.maximized = Boolean(state.maximized);
    this.minimized = Boolean(state.minimized);
    this.frame.dataset.maximized = String(this.maximized);
    this.frame.dataset.minimized = String(this.minimized);
    const button = this.root.querySelector('[data-cmd="maximize"]');
    if (button) {
      const key = this.maximized ? "tip.restore" : "tip.maximize";
      button.innerHTML = icon(this.maximized ? "windowRestore" : "windowMax");
      button.dataset.i18nTitle = key;
      button.title = this.t(key);
      button.dataset.tip = button.title;
      button.setAttribute("aria-label", button.title);
    }
    this.grip.hidden = this.maximized || this.minimized;
    this.applyShellSize();
  }

  applyShellSize() {
    const native = Boolean(this.platform.nativeWindow);
    this.shell.dataset.sized = native || this.maximized ? "fill" : "fixed";
    if (native || this.maximized) {
      this.shell.style.removeProperty("width");
      this.shell.style.removeProperty("height");
      this.shell.style.removeProperty("transform");
      this.shellOffset = { x: 0, y: 0 };
    } else {
      this.shell.style.width = `${this.shellSize.width}px`;
      this.shell.style.height = this.minimized ? "" : `${this.shellSize.height}px`;
    }
    this.applySceneScale();
  }

  onShellDrag(step) {
    if (this.maximized || this.minimized) return;
    if (this.platform.nativeWindow) {
      void this.platform.moveWindow?.(step);
      return;
    }
    if (step.phase === "start") {
      this.dragOrigin = { ...this.shellOffset };
      return;
    }
    if (step.phase !== "move") return;
    const origin = this.dragOrigin || this.shellOffset;
    this.shellOffset = { x: origin.x + step.dx, y: origin.y + step.dy };
    this.shell.style.transform = `translate(${this.shellOffset.x}px, ${this.shellOffset.y}px)`;
  }

  beginResize(event) {
    if (event.button != null && event.button !== 0) return;
    if (this.maximized || this.minimized) return;
    event.preventDefault();
    this.endResize?.();
    const native = Boolean(this.platform.nativeWindow);
    const start = { x: event.screenX ?? event.clientX ?? 0, y: event.screenY ?? event.clientY ?? 0, size: { ...this.shellSize } };
    this.frame.classList.add("is-resizing");
    try {
      this.grip.setPointerCapture?.(event.pointerId);
    } catch {
      /* synthetic pointer */
    }
    if (native) void this.platform.resizeWindow?.({ phase: "start" });
    const move = (next) => {
      const dx = (next.screenX ?? next.clientX ?? 0) - start.x;
      const dy = (next.screenY ?? next.clientY ?? 0) - start.y;
      if (native) {
        void this.platform.resizeWindow?.({ phase: "move", dx: Math.round(dx), dy: Math.round(dy) });
        return;
      }
      this.shellSize = clampWindowSize({ width: start.size.width + dx, height: start.size.height + dy });
      this.applyShellSize();
      this.renderTabs();
    };
    const up = () => {
      this.endResize?.();
      if (native) {
        void this.platform.resizeWindow?.({ phase: "end" });
        return;
      }
      this.settings.windowSize = { ...this.shellSize };
      void this.persist();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    this.endResize = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      this.frame.classList.remove("is-resizing");
      this.endResize = null;
    };
  }

  fillCountries() {
    const select = this.root.querySelector("#country-select");
    if (!select) return;
    const current = this.currentTab()?.place.countryCode;
    select.innerHTML = "";
    const seen = new Map();
    for (const entry of this.cityChoices()) if (!seen.has(entry.countryCode)) seen.set(entry.countryCode, entry);
    for (const entry of seen.values()) {
      const option = document.createElement("option");
      option.value = entry.countryCode;
      option.textContent = this.settings.language === "ko" ? entry.countryKo : entry.countryEn;
      select.appendChild(option);
    }
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  fillCities() {
    const countrySelect = this.root.querySelector("#country-select");
    if (!countrySelect) return;
    const country = countrySelect.value;
    const select = this.root.querySelector("#city-select");
    const current = select.value || this.currentTab()?.place.cityEn;
    const list = filterCities(this.cityChoices(), country, this.searchQuery);
    select.innerHTML = "";
    for (const entry of list) {
      const option = document.createElement("option");
      option.value = entry.cityEn;
      option.dataset.lat = String(entry.lat);
      option.dataset.lon = String(entry.lon);
      option.textContent = this.settings.language === "ko" ? entry.cityKo || entry.cityEn : entry.cityEn;
      select.appendChild(option);
    }
    if ([...select.options].some((option) => option.value === current)) select.value = current;
    this.fillCoordinatesFromCity();
  }

  fillCoordinatesFromCity() {
    const select = this.root.querySelector("#city-select");
    const option = select?.selectedOptions?.[0];
    if (!option) return;
    const lat = this.root.querySelector("#lat-input");
    const lon = this.root.querySelector("#lon-input");
    if (document.activeElement !== lat) lat.value = option.dataset.lat || lat.value;
    if (document.activeElement !== lon) lon.value = option.dataset.lon || lon.value;
  }

  fillSources() {
    const box = this.root.querySelector("#source-box");
    box.innerHTML = ["ecmwf", "gfs", "jma", "metno", "wttr"]
      .map(
        (id) =>
          `<label class="tool-row"><input type="checkbox" data-group="source" data-source="${id}" data-gui="panel-control" data-i18n-title="source.${id}" title="${escapeAttr(this.t(`source.${id}`))}"><span data-i18n="source.${id}"></span></label>`,
      )
      .join("");
  }

  applyAll() {
    this.i18n.setLanguage(this.settings.language);
    this.applyTheme();
    this.applyFont();
    this.applyZoom();
    this.applyWallpaper();
    this.applyI18n();
    this.syncPanels();
  }

  applyI18n() {
    this.i18n.setLanguage(this.settings.language);
    this.root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = this.t(el.dataset.i18n);
    });
    this.root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const text = this.t(el.dataset.i18nTitle);
      el.title = text;
      el.dataset.tip = text;
      el.setAttribute("aria-label", text);
    });
    this.fillCountries();
    this.fillCities();
    this.renderTabs();
    this.renderWeather();
    this.renderStatus();
    this.root.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.title) return;
      const span = el.parentElement?.querySelector("[data-i18n]");
      if (span?.textContent) el.title = span.textContent;
    });
  }

  applyTheme(draft = {}) {
    const theme = draft.theme && isTheme(draft.theme) ? draft.theme : this.settings.theme;
    const custom = draft.customTheme ? sanitizeCustomTheme(draft.customTheme) : this.settings.customTheme;
    const transparency = draft.transparency != null && draft.transparency !== "" ? clamp(draft.transparency, 0, 100) : this.settings.transparency;
    const colors = themeColors(theme, custom);
    const vars = themeVars(colors, transparency);
    applyThemeVars(document.documentElement, vars, colors.mode);
    this.themeState = { vars, mode: colors.mode };
    this.frame.dataset.theme = theme;
    this.frame.dataset.mode = colors.mode;
    this.frame.dataset.transparency = String(transparency);
    document.documentElement.dataset.theme = theme;
    this.themePreview = draft.theme || draft.customTheme || draft.transparency != null ? { theme, customTheme: custom, transparency } : null;
  }

  async setTransparency(value, { recordUndo = true } = {}) {
    const next = clamp(Math.round(Number(value)), 0, 100);
    const prev = this.settings.transparency;
    if (prev === next) return;
    this.settings.transparency = next;
    this.applyTheme();
    if (recordUndo) {
      this.pushUndo({
        undo: () => this.setTransparency(prev, { recordUndo: false }),
        redo: () => this.setTransparency(next, { recordUndo: false }),
      });
    }
    await this.persist();
  }

  applyFont() {
    const style = this.settings.fontStyle;
    this.frame.style.fontFamily = `"${this.settings.fontFamily}", sans-serif`;
    this.frame.style.fontSize = `${this.settings.fontSize}px`;
    this.frame.style.fontWeight = style === "bold" || style === "bolditalic" ? "700" : "400";
    this.frame.style.fontStyle = style === "italic" || style === "bolditalic" ? "italic" : "normal";
  }

  applyZoom() {
    this.content.dataset.zoom = String(this.settings.zoom);
    this.content.style.zoom = String(this.settings.zoom / 100);
  }

  applyWallpaper() {
    const image = this.settings.backgroundImage;
    this.wallpaper.style.backgroundImage = image ? `url("${image}")` : "none";
    this.wallpaper.style.opacity = String((this.settings.backgroundOpacity ?? 0) / 100);
    this.wallpaper.dataset.image = image ? "yes" : "no";
  }

  renderTabs() {
    const multiple = this.doc.tabs.length > 1;
    const tabbar = this.root.querySelector(".tabbar");
    if (tabbar) tabbar.hidden = !multiple;
    const bar = this.tabStrip.parentElement?.clientWidth || 0;
    const width = this.workspaceWidth || (bar > 60 ? bar - 60 : 0) || 720;
    const layout = layoutTabScroller(this.tabStart, this.doc.tabs.length, width, TAB_WIDTH);
    this.tabStart = layout.start;
    const slice = this.doc.tabs.slice(layout.start, layout.start + layout.visible);
    this.tabStrip.innerHTML = "";
    this.tabStrip.dataset.tabStart = String(layout.start);
    this.tabStrip.style.overflow = "hidden";
    if (!multiple) return;
    for (const tab of slice) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab";
      button.dataset.tabId = tab.id;
      button.dataset.gui = "tab";
      const label = tab.properties.label || String(this.doc.tabs.indexOf(tab) + 1);
      button.textContent = `${tab.properties.favorite ? "★ " : ""}${label}`;
      button.title = button.textContent;
      button.style.whiteSpace = "nowrap";
      if (tab.id === this.currentTab()?.id) button.classList.add("is-active");
      this.tabStrip.appendChild(button);
    }
    const prev = this.root.querySelector('[data-cmd="tab-prev"]');
    const next = this.root.querySelector('[data-cmd="tab-next"]');
    const scrolling = layout.showPrev || layout.showNext;
    if (prev) {
      prev.disabled = !layout.showPrev;
      prev.hidden = !scrolling;
    }
    if (next) {
      next.disabled = !layout.showNext;
      next.hidden = !scrolling;
    }
  }

  setWorkspaceWidth(px) {
    this.workspaceWidth = px;
    this.renderTabs();
  }

  nudgeTabs(delta) {
    this.tabStart += delta;
    this.renderTabs();
  }

  selectTab(id) {
    const index = this.doc.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    this.doc.activeIndex = index;
    this.afterStructure();
  }

  renderWeather() {
    const tab = this.currentTab();
    this.content.innerHTML = renderWeatherHtml({
      tab,
      language: this.settings.language,
      units: this.settings.units,
      today: this.now(),
      t: (key, vars) => this.t(key, vars),
    });
  }

  renderStatus() {
    if (this.destroyed) return;
    this.frame.dataset.dirty = String(Boolean(this.doc.dirty));
    this.updateTitle();
  }

  setStatus(text) {
    this.statusMessage = text;
    this.renderStatus();
    if (!text || text === this.t("status.ready") || text === this.t("status.loading")) return;
    this.showToast(text);
  }

  showToast(text) {
    if (!this.toast || this.destroyed) return;
    this.toast.textContent = text;
    this.toast.hidden = false;
    this.toast.dataset.visible = "true";
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (!this.toast) return;
      this.toast.dataset.visible = "false";
      this.toast.hidden = true;
    }, TOAST_MS);
  }

  updateTitle() {
    this.titleText = WINDOW_TITLE;
    const label = this.root.querySelector("[data-gui='window-title']");
    if (label) label.textContent = WINDOW_TITLE;
    if (typeof document !== "undefined") document.title = this.titleText;
  }

  syncPanels() {
    const tab = this.currentTab();
    if (!tab || this.destroyed) return;
    const country = this.root.querySelector("#country-select");
    if (country && [...country.options].some((option) => option.value === tab.place.countryCode)) country.value = tab.place.countryCode;
    this.fillCities();
    const city = this.root.querySelector("#city-select");
    if (city && [...city.options].some((option) => option.value === tab.place.cityEn)) city.value = tab.place.cityEn;
    const lat = this.root.querySelector("#lat-input");
    const lon = this.root.querySelector("#lon-input");
    if (lat && document.activeElement !== lat) lat.value = String(tab.place.lat);
    if (lon && document.activeElement !== lon) lon.value = String(tab.place.lon);
    const view = this.root.querySelector("#view-select");
    if (view) view.value = tab.view;
    this.root.querySelectorAll("[data-group='source']").forEach((box) => {
      box.checked = this.settings.enabledSources.includes(box.dataset.source);
    });
    this.setValue("#prop-label", tab.properties.label);
    const favorite = this.root.querySelector("#prop-favorite");
    if (favorite) favorite.checked = Boolean(tab.properties.favorite);
    this.setValue("#prop-country", displayCountry(tab.place, this.settings.language));
    this.setValue("#prop-city", displayCity(tab.place, this.settings.language));
    this.setValue("#prop-alert-high", tab.properties.alertHigh);
    this.setValue("#prop-alert-low", tab.properties.alertLow);
    const day = this.root.querySelector("#prop-day");
    if (day) {
      const dates = tab.weather?.daily?.map((row) => row.date) || [];
      day.innerHTML = "";
      for (const date of dates) {
        const option = document.createElement("option");
        option.value = date;
        option.textContent = date;
        day.appendChild(option);
      }
      if (tab.selectedDate) day.value = tab.selectedDate;
    }
    this.setValue("#prop-summary", this.selectionText);
    this.root.querySelectorAll("#left-panel [data-gui='panel-control'], #right-panel [data-gui='panel-control']").forEach((el) => {
      if (!el.title) el.title = el.getAttribute("aria-label") || el.dataset.prop || el.dataset.field || "control";
    });
  }

  setValue(selector, value) {
    const node = this.root.querySelector(selector);
    if (node && document.activeElement !== node) node.value = value ?? "";
  }

  afterStructure() {
    this.renderTabs();
    this.syncPanels();
    this.renderWeather();
    this.renderStatus();
  }

  pushUndo(command) {
    this.history.push(command);
  }

  undo() {
    this.history.undo();
    this.afterStructure();
  }

  redo() {
    this.history.redo();
    this.afterStructure();
  }

  markDirty() {
    this.doc.dirty = true;
    this.renderStatus();
  }

  setZoom(value, { recordUndo = true } = {}) {
    const next = clamp(Math.round(Number(value)), 50, 200);
    const prev = this.settings.zoom;
    if (prev === next) return;
    this.settings.zoom = next;
    this.applyZoom();
    this.renderStatus();
    if (recordUndo) {
      this.pushUndo({
        undo: () => this.setZoom(prev, { recordUndo: false }),
        redo: () => this.setZoom(next, { recordUndo: false }),
      });
    }
    void this.persist();
  }

  async setTheme(id, { recordUndo = true } = {}) {
    if (!isTheme(id) || id === this.settings.theme) return;
    const prev = this.settings.theme;
    this.settings.theme = id;
    this.applyTheme();
    this.renderStatus();
    if (recordUndo) {
      this.pushUndo({
        undo: () => this.setTheme(prev, { recordUndo: false }),
        redo: () => this.setTheme(id, { recordUndo: false }),
      });
    }
    await this.persist();
  }

  async setLanguage(lang) {
    const next = lang === "en" ? "en" : "ko";
    const prev = this.settings.language;
    if (prev === next) return;
    this.settings.language = next;
    this.applyI18n();
    this.pushUndo({
      undo: () => {
        this.settings.language = prev;
        this.applyI18n();
        void this.persist();
      },
      redo: () => {
        this.settings.language = next;
        this.applyI18n();
        void this.persist();
      },
    });
    await this.persist();
  }

  async setWallpaper(dataUrl, name = "") {
    this.settings.backgroundImage = dataUrl || "";
    this.settings.backgroundName = name || "";
    this.applyWallpaper();
    await this.persist();
  }

  showForecast(range) {
    const tab = this.currentTab();
    const hasWeather = Boolean(tab?.weather?.daily?.length);
    const t = (key, vars) => this.t(key, vars);
    const markup = renderForecastHtml({
      range,
      tab,
      language: this.settings.language,
      units: this.settings.units,
      today: this.now(),
      t,
    });
    return this.openPopup(buildForecastSpec({ range, markup, fitHeight: forecastFitHeight(range, hasWeather), transparency: this.settings.transparency, t }), {
      immediate: (msg) => {
        if (msg?.type !== "select-date") return;
        this.selectDate(msg.date);
        if (msg.clientX == null) return;
        this.openMenu("context", { clientX: msg.clientX, clientY: msg.clientY }, { atPointer: true });
      },
    });
  }

  applySceneScale() {
    if (!this.content) return;
    const measured = this.content.clientWidth > 0 && this.content.clientHeight > 0;
    const available = measured
      ? {
        width: this.content.clientWidth - CONTENT_PADDING.left - CONTENT_PADDING.right,
        height: this.content.clientHeight - CONTENT_PADDING.top - CONTENT_PADDING.bottom,
      }
      : {
        width: this.shellSize.width - CONTENT_PADDING.left - CONTENT_PADDING.right,
        height: this.shellSize.height - 46 - CONTENT_PADDING.top - CONTENT_PADDING.bottom,
      };
    const copy = this.content.querySelector(".scene-copy");
    const current = Number(this.content.style.getPropertyValue("--scene-scale")) || 1;
    const textWidth = copy && copy.scrollWidth > 0 ? copy.scrollWidth / current : 200;
    const fit = sceneFit(available, textWidth);
    this.content.style.setProperty("--scene-scale", String(fit.text));
    this.content.style.setProperty("--art-scale", String(fit.art));
  }

  toggleSource(id, enabled) {
    const before = [...this.settings.enabledSources];
    const set = new Set(before);
    if (enabled) set.add(id);
    else set.delete(id);
    const after = [...set];
    this.settings.enabledSources = after;
    this.pushUndo({
      undo: () => {
        this.settings.enabledSources = before;
        this.syncPanels();
        void this.persist();
      },
      redo: () => {
        this.settings.enabledSources = after;
        this.syncPanels();
        void this.persist();
      },
    });
    void this.persist();
  }

  commitView(next) {
    const tab = this.currentTab();
    const prev = tab.view;
    if (prev === next) return;
    const id = tab.id;
    this.pushUndo({
      undo: () => this.setView(id, prev),
      redo: () => this.setView(id, next),
    });
    this.setView(id, next);
    this.markDirty();
  }

  setView(tabId, view) {
    const tab = this.doc.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    tab.view = view;
    this.renderWeather();
    this.syncPanels();
  }

  applyLocation() {
    const tab = this.currentTab();
    const prev = { ...tab.place };
    const countryCode = this.root.querySelector("#country-select").value;
    const cityEn = this.root.querySelector("#city-select").value;
    const found = this.cityChoices().find((entry) => entry.countryCode === countryCode && entry.cityEn === cityEn);
    const lat = Number(this.root.querySelector("#lat-input").value);
    const lon = Number(this.root.querySelector("#lon-input").value);
    const next = createPlace({ ...(found || prev), lat, lon });
    this.pushUndo({
      undo: () => this.setPlace(tab.id, prev),
      redo: () => this.setPlace(tab.id, next),
    });
    this.setPlace(tab.id, next);
    this.markDirty();
    this.setStatus(this.t("msg.applied"));
  }

  setPlace(tabId, place) {
    const tab = this.doc.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    tab.place = createPlace(place);
    this.syncPanels();
    this.renderTabs();
    this.renderStatus();
  }

  commitProp(field, value, before) {
    const tab = this.currentTab();
    if (!tab) return;
    if (field === "lat" || field === "lon" || field === "country" || field === "city") {
      this.commitPlaceField(field, value, before);
      return;
    }
    const prev = field === "favorite" ? before === true || before === "true" : before != null ? String(before) : tab.properties[field];
    const next = field === "favorite" ? Boolean(value) : String(value ?? "");
    if (prev === next) return;
    this.pushUndo({
      undo: () => this.setProp(tab.id, field, prev),
      redo: () => this.setProp(tab.id, field, next),
    });
    this.setProp(tab.id, field, next);
    this.markDirty();
  }

  commitPlaceField(field, value, before) {
    const tab = this.currentTab();
    const prev = { ...tab.place };
    const next = { ...tab.place };
    if (field === "lat" || field === "lon") next[field] = Number(value);
    if (field === "city") {
      next.cityEn = String(value);
      next.cityKo = String(value);
    }
    if (field === "country") {
      next.countryEn = String(value);
      next.countryKo = String(value);
    }
    if (JSON.stringify(prev) === JSON.stringify(next)) return;
    this.pushUndo({
      undo: () => this.setPlace(tab.id, prev),
      redo: () => this.setPlace(tab.id, next),
    });
    this.setPlace(tab.id, next);
    this.markDirty();
  }

  setProp(tabId, field, value) {
    const tab = this.doc.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    tab.properties[field] = value;
    this.syncPanels();
    this.renderTabs();
    this.renderWeather();
  }

  toggleFavorite() {
    const tab = this.currentTab();
    this.commitProp("favorite", !tab.properties.favorite, tab.properties.favorite);
  }

  selectDate(date) {
    const tab = this.currentTab();
    if (!tab) return;
    tab.selectedDate = date || "";
    const day = tab.weather?.daily?.find((row) => row.date === date);
    const city = displayCity(tab.place, this.settings.language);
    this.selectionText = day
      ? `${city} ${day.date} ${conditionText(day.code, this.settings.language)} ${formatTemp(day.tempMin, this.settings.units)} ${formatTemp(day.tempMax, this.settings.units)}`
      : city;
    this.renderWeather();
    this.syncPanels();
    this.renderStatus();
  }

  addTab() {
    const tab = createTab(this.settings.defaultLocation);
    const index = this.doc.tabs.length;
    this.doc.tabs.push(tab);
    const id = tab.id;
    this.pushUndo({
      undo: () => {
        this.doc.tabs = this.doc.tabs.filter((item) => item.id !== id);
        this.doc.activeIndex = Math.max(0, Math.min(this.doc.activeIndex, this.doc.tabs.length - 1));
        this.afterStructure();
      },
      redo: () => {
        this.doc.tabs.push(tab);
        this.doc.activeIndex = this.doc.tabs.length - 1;
        this.afterStructure();
      },
    });
    this.doc.activeIndex = index;
    this.markDirty();
    this.afterStructure();
  }

  closeTab() {
    if (this.doc.tabs.length <= 1) {
      this.setStatus(this.t("msg.lastTab"));
      return;
    }
    const index = this.doc.activeIndex;
    const removed = this.doc.tabs[index];
    this.doc.tabs.splice(index, 1);
    this.doc.activeIndex = Math.max(0, index - 1);
    this.pushUndo({
      undo: () => {
        this.doc.tabs.splice(index, 0, removed);
        this.doc.activeIndex = index;
        this.afterStructure();
      },
      redo: () => {
        const at = this.doc.tabs.findIndex((item) => item.id === removed.id);
        if (at >= 0) this.doc.tabs.splice(at, 1);
        this.doc.activeIndex = Math.max(0, Math.min(index, this.doc.tabs.length - 1));
        this.afterStructure();
      },
    });
    this.markDirty();
    this.afterStructure();
  }

  async refreshWeather() {
    this.operationAbort?.abort();
    this.operationAbort = new AbortController();
    this.progressAborted = false;
    const tab = this.currentTab();
    this.setStatus(this.t("status.loading"));
    try {
      const weather = await this.withProgress("progress.fetch", (report) =>
        loadWeather(tab.place, {
          fetchImpl: (url, options) => this.platform.fetch(url, options),
          sources: this.settings.enabledSources,
          signal: this.operationAbort.signal,
          onProgress: (percent, id) => report(percent, this.t(`source.${id}`)),
        }),
      );
      weather.fetchedAt = new Date().toISOString();
      tab.weather = weather;
      const date = tab.selectedDate || this.preferredDate(weather);
      this.selectDate(date);
      this.setStatus(this.t("status.ready"));
    } catch (error) {
      if (error?.name === "AbortError" || this.progressAborted) {
        this.setStatus(this.t("status.cancelled"));
        return;
      }
      this.setStatus(this.t("status.ready"));
      throw error;
    }
  }

  preferredDate(weather) {
    const today = isoDate(this.now());
    if (weather.daily.some((day) => day.date === today)) return today;
    return weather.daily.find((day) => day.date >= today)?.date || weather.daily[0]?.date || "";
  }

  async searchOnline(query) {
    const field = this.root.querySelector("#search-input") || document.querySelector('[data-popup="settings"] [data-field="search"]');
    const typed = String(query ?? field?.value ?? this.searchQuery ?? "").trim();
    const q = typed || this.currentTab().place.cityEn;
    await this.withProgress("progress.search", async (report) => {
      report(30, q);
      const response = await this.platform.fetch(geocodeUrl(q, this.settings.language));
      if (!response.ok) throw new AppError(this.t("msg.noResults"), `HTTP ${response.status}`, "GEO");
      const rows = parseGeocoding(await response.json());
      report(100, this.t("progress.done"));
      if (!rows.length) throw new AppError(this.t("msg.noResults"), q, "GEO");
      this.extraCities.push(...rows);
      const first = rows[0];
      this.locationDraft = { ...first };
      const country = this.root.querySelector("#country-select");
      if (!country) return;
      this.fillCountries();
      if ([...country.options].some((option) => option.value === first.countryCode)) country.value = first.countryCode;
      this.searchQuery = "";
      const search = this.root.querySelector("#search-input");
      if (search) search.value = first.cityEn;
      this.fillCities();
      const city = this.root.querySelector("#city-select");
      if (city && [...city.options].some((option) => option.value === first.cityEn)) city.value = first.cityEn;
      const lat = this.root.querySelector("#lat-input");
      const lon = this.root.querySelector("#lon-input");
      if (lat) lat.value = String(first.lat);
      if (lon) lon.value = String(first.lon);
    });
  }

  async downloadWeather() {
    const tab = this.currentTab();
    if (!tab.weather) throw new AppError(this.t("msg.noWeather"), displayCity(tab.place, this.settings.language), "NO_WEATHER");
    const text = JSON.stringify(tab.weather, null, 2);
    await this.withProgress("progress.download", async (report) => {
      report(25, this.t("progress.prepare"));
      const saved = await this.platform.saveFile({
        startDir: this.settings.lastDirectory,
        suggestedName: `${displayCity(tab.place, this.settings.language)}.json`,
        text,
      });
      report(100, this.t("progress.done"));
      if (saved?.directory) this.rememberDir(saved.directory);
      return saved;
    });
  }

  async openSourceLink() {
    const url = sourcePageUrl(this.currentTab().place);
    await this.withProgress("progress.link", async (report) => {
      report(40, url);
      await this.platform.openExternal(url);
      report(100, this.t("progress.done"));
    });
  }

  async newDocument() {
    if (!(await this.ensureSaved())) return false;
    this.doc = createDocument(this.settings.defaultLocation);
    this.history = new UndoStack();
    this.selectionText = "";
    this.afterStructure();
    return true;
  }

  async open() {
    if (!(await this.ensureSaved())) return false;
    const picked = await this.withProgress("progress.open", async (report) => {
      report(20, this.t("progress.read"));
      const file = await this.platform.openFile({ startDir: this.settings.lastDirectory });
      report(100, this.t("progress.done"));
      return file;
    });
    if (!picked) return false;
    try {
      this.installDocument(parseDocument(picked.text), picked.path);
    } catch (error) {
      this.reportError(error, "open");
      return false;
    }
    this.recent.add(picked.path);
    this.rememberDir(picked.directory || dirname(picked.path));
    await this.persist();
    return true;
  }

  async openRecent(index) {
    const filePath = this.recent.items[index];
    if (!filePath) return;
    if (!(await this.ensureSaved())) return;
    try {
      const text = await this.withProgress("progress.open", async (report) => {
        report(30, this.t("progress.read"));
        const data = await this.platform.readFile(filePath);
        report(100, this.t("progress.done"));
        return data;
      });
      this.installDocument(parseDocument(text), filePath);
      this.recent.add(filePath);
      this.rememberDir(dirname(filePath));
      await this.persist();
    } catch (error) {
      this.reportError(new AppError(this.t("msg.noFile"), error.stack || error.message, "ENOENT"), "open");
    }
  }

  async save() {
    if (!this.doc.filePath) return this.saveAs();
    const text = serializeDocument(this.doc);
    await this.withProgress("progress.save", async (report) => {
      report(20, this.t("progress.prepare"));
      report(60, this.t("progress.write"));
      const saved = await this.platform.writeFile(this.doc.filePath, text);
      report(100, this.t("progress.done"));
      if (saved?.directory) this.rememberDir(saved.directory);
    });
    this.doc.dirty = false;
    this.recent.add(this.doc.filePath);
    this.setStatus(this.t("msg.saved"));
    await this.persist();
    return true;
  }

  async saveAs() {
    const text = serializeDocument(this.doc);
    const saved = await this.withProgress("progress.save", async (report) => {
      report(20, this.t("progress.prepare"));
      const file = await this.platform.saveFile({
        startDir: this.settings.lastDirectory,
        suggestedName: suggestedFileName(this.doc, this.settings.language),
        text,
      });
      report(100, this.t("progress.done"));
      return file;
    });
    if (!saved) return false;
    this.doc.filePath = saved.path;
    this.doc.dirty = false;
    this.recent.add(saved.path);
    this.rememberDir(saved.directory || dirname(saved.path));
    this.setStatus(this.t("msg.saved"));
    await this.persist();
    this.updateTitle();
    return true;
  }

  installDocument(doc, filePath) {
    doc.filePath = filePath || "";
    doc.dirty = false;
    this.doc = doc;
    this.history = new UndoStack();
    this.selectionText = "";
    this.afterStructure();
  }

  async loadDocumentText(text, filePath = "") {
    if (!(await this.ensureSaved())) return false;
    this.installDocument(parseDocument(text), filePath);
    if (filePath) {
      this.recent.add(filePath);
      this.rememberDir(dirname(filePath));
      await this.persist();
    }
    return true;
  }

  rememberDir(dir) {
    if (!dir || dir === this.settings.lastDirectory) return;
    this.settings.lastDirectory = dir;
    void this.persist();
  }

  async ensureSaved() {
    if (!this.doc.dirty) return true;
    const answer = await this.openPopup(buildUnsavedSpec(this.doc.filePath || suggestedFileName(this.doc, this.settings.language), (key, vars) => this.t(key, vars)));
    if (!answer || answer.action === "cancel" || answer.action === "close") return false;
    if (answer.action === "discard") return true;
    if (answer.action === "save") return Boolean(await this.save());
    return false;
  }

  async requestClose() {
    if (!(await this.ensureSaved())) return "cancelled";
    await this.shutdown();
    return "closed";
  }

  async shutdown() {
    this.popups?.closeAll();
    this.closeMenu();
    await this.persist();
    this.closed = true;
    this.destroy();
    await this.platform.confirmQuit?.();
  }

  async copy() {
    const picked = this.selectedEditableText();
    const text = picked != null ? picked : this.selectionText || "";
    await this.writeClipboard(text);
    this.setStatus(this.t("msg.copied"));
    return text;
  }

  async cut() {
    const input = this.focusedField();
    if (input?.dataset?.prop && input.selectionStart !== input.selectionEnd) {
      const result = cutText(input.value, input.selectionStart, input.selectionEnd);
      await this.writeClipboard(result.clipboard);
      const before = input.value;
      input.value = result.text;
      this.commitProp(input.dataset.prop, result.text, before);
      return;
    }
    await this.copy();
  }

  async paste() {
    const input = this.focusedField();
    if (!input?.dataset?.prop) return;
    const clip = await this.readClipboard();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value;
    const next = pasteText(input.value, start, end, clip);
    input.value = next.text;
    this.commitProp(input.dataset.prop, next.text, before);
  }

  focusedField() {
    const active = document.activeElement;
    if (active && this.frame.contains(active) && active.dataset?.prop) return active;
    return null;
  }

  selectedEditableText() {
    const input = this.focusedField();
    if (!input || input.selectionStart === input.selectionEnd) return null;
    return copyRange(input.value, input.selectionStart, input.selectionEnd);
  }

  async writeClipboard(text) {
    if (this.platform.writeClipboard) await this.platform.writeClipboard(text);
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  }

  async readClipboard() {
    if (this.platform.readClipboard) return this.platform.readClipboard();
    if (navigator.clipboard?.readText) return navigator.clipboard.readText();
    return "";
  }

  async openPrint() {
    const days = this.currentTab().weather?.daily || [];
    const draft = {
      scope: "current",
      from: days[0]?.date || isoDate(this.now()),
      to: days[days.length - 1]?.date || isoDate(this.now()),
    };
    const answer = await this.openPopup(buildPrintSpec((key, vars) => this.t(key, vars), draft));
    if (!answer || answer.action !== "preview") return;
    this.printDraft = answer.values;
    try {
      await this.openPreview();
    } catch (error) {
      this.reportError(new AppError(this.t("msg.badRange"), `${answer.values.from} > ${answer.values.to}\n${error.message}`, "PRINT_RANGE"), "print");
    }
  }

  async openPreview() {
    const build = () =>
      buildPrintModel({
        scope: this.printDraft.scope,
        tabs: this.doc.tabs,
        activeIndex: this.doc.activeIndex,
        fromDate: this.printDraft.from,
        toDate: this.printDraft.to,
        pageSetup: this.pageSetup,
        language: this.settings.language,
      });
    const model = build();
    const answer = await this.openPopup(buildPreviewSpec(model, (key, vars) => this.t(key, vars)), {
      immediate: async (msg) => {
        if (msg.type !== "page-setup") return this.handlePopupImmediate(msg);
        this.pageSetup = normalizeSetup(msg.values);
        const next = build();
        return { pages: next.pages, html: next.html };
      },
    });
    if (answer?.action === "print") await this.platform.print({ html: answer.html || model.html, pageSetup: answer.pageSetup || this.pageSetup });
  }

  async showSettings(activeTab = "general") {
    const place = this.currentTab()?.place || this.settings.defaultLocation;
    const spec = buildSettingsSpec({
      t: (key, vars) => this.t(key, vars),
      language: this.settings.language,
      fonts: this.fonts,
      recent: this.recent.toJSON(),
      catalog: this.cityChoices(),
      activeTab,
      values: {
        language: this.settings.language,
        units: this.settings.units,
        countryCode: place.countryCode,
        cityEn: place.cityEn,
        lat: place.lat,
        lon: place.lon,
        search: "",
        reopen: this.settings.reopenLast,
        theme: this.settings.theme,
        customTheme: this.settings.customTheme,
        transparency: this.settings.transparency,
        backgroundOpacity: this.settings.backgroundOpacity,
        backgroundName: this.settings.backgroundName,
        fontFamily: this.settings.fontFamily,
        fontSize: this.settings.fontSize,
        fontStyle: this.settings.fontStyle,
        enabledSources: this.settings.enabledSources,
        sourceStatus: Object.fromEntries((this.currentTab()?.weather?.sources || []).map((source) => [source.id, source])),
        lastDirectory: this.settings.lastDirectory,
      },
    });
    const answer = await this.openPopup(spec, { immediate: (msg) => this.handlePopupImmediate(msg) });
    this.applyTheme();
    if (answer?.action === "ok") await this.applySettingsForm(answer.values);
    if (answer?.action === "recent-open") await this.openRecentPath(answer.path);
    return answer;
  }

  async openRecentPath(filePath) {
    const index = this.recent.items.indexOf(filePath);
    if (index >= 0) await this.openRecent(index);
  }

  async applySettingsForm(values) {
    const before = structuredClone(this.settings);
    const tab = this.currentTab();
    const placeBefore = tab ? { ...tab.place } : null;
    this.settings.language = values.language === "en" ? "en" : "ko";
    this.settings.units = values.units === "F" ? "F" : "C";
    if (isTheme(values.theme)) this.settings.theme = values.theme;
    if (values.customBg || values.customText || values.customAccent || values.customMode) {
      this.settings.customTheme = sanitizeCustomTheme({
        mode: values.customMode,
        bg: values.customBg,
        text: values.customText,
        accent: values.customAccent,
      });
    }
    if (values.transparency != null && values.transparency !== "") this.settings.transparency = clamp(values.transparency, 0, 100);
    this.settings.backgroundOpacity = clamp(values.backgroundOpacity, 0, 100);
    if (values.fontFamily) this.settings.fontFamily = values.fontFamily;
    this.settings.fontSize = clamp(values.fontSize, 8, 72);
    this.settings.fontStyle = FONT_STYLES.includes(values.fontStyle) ? values.fontStyle : "normal";
    this.settings.reopenLast = Boolean(values.reopen);
    if (values.sources) this.settings.enabledSources = Object.entries(values.sources).filter(([, on]) => on).map(([id]) => id);
    const found = this.cityChoices().find((entry) => entry.countryCode === values.countryCode && entry.cityEn === values.cityEn);
    let placeAfter = placeBefore;
    if (found) {
      const lat = values.lat === "" || values.lat == null ? found.lat : Number(values.lat);
      const lon = values.lon === "" || values.lon == null ? found.lon : Number(values.lon);
      placeAfter = createPlace({ ...found, lat, lon });
      this.settings.defaultLocation = placeAfter;
    }
    const after = structuredClone(this.settings);
    this.pushUndo({
      undo: () => {
        this.replaceSettings(before);
        if (tab && placeBefore) this.setPlace(tab.id, placeBefore);
      },
      redo: () => {
        this.replaceSettings(after);
        if (tab && placeAfter) this.setPlace(tab.id, placeAfter);
      },
    });
    this.replaceSettings(after);
    if (tab && placeAfter) this.setPlace(tab.id, placeAfter);
    await this.persist();
  }

  replaceSettings(next) {
    this.settings = sanitizeSettings(structuredClone(next));
    this.recent.load(this.settings.recentFiles);
    this.applyAll();
  }

  async showAbout() {
    await this.openPopup(buildAboutSpec((key, vars) => this.t(key, vars)));
  }

  reportError(error, operation = "") {
    const info = normalizeError(error, { operation: this.operationLabel(operation), time: this.now() });
    this.lastError = info;
    try {
      const spec = this.decorate(buildErrorSpec(info, (key, vars) => this.t(key, vars)));
      const inWindow = () =>
        this.popups.open(spec, {
          copy: async (text) => {
            await this.writeClipboard(text);
            this.showToast(this.t("msg.copied"));
          },
        });
      this.errorShown =
        this.platform.nativePopups && this.platform.openPopup ? this.platform.openPopup(spec).catch(() => inWindow()) : inWindow();
    } catch (failure) {
      console.error(info, failure);
    }
    return info;
  }

  async handlePopupImmediate(msg) {
    if (!msg) return null;
    if (msg.type === "recent-delete") {
      this.removeRecent(msg.path);
      return { recent: this.recent.toJSON() };
    }
    if (msg.type === "recent-clear") {
      this.clearRecent();
      return { recent: [] };
    }
    if (msg.type === "pick-wallpaper") {
      await this.chooseWallpaper();
      return { backgroundName: this.settings.backgroundName || "" };
    }
    if (msg.type === "clear-wallpaper") {
      await this.setWallpaper("", "");
      return { backgroundName: "" };
    }
    if (msg.type === "search-online") {
      await this.searchOnline(msg.query);
      const place = this.locationDraft;
      if (!place) return null;
      return { catalog: this.cityChoices(), countryCode: place.countryCode, cityEn: place.cityEn, lat: place.lat, lon: place.lon };
    }
    if (msg.type === "theme-preview") {
      this.applyTheme({ theme: msg.theme, customTheme: msg.customTheme, transparency: msg.transparency });
      return null;
    }
    if (msg.type === "progress-cancel") this.operationAbort?.abort();
    if (msg.type === "copy" && msg.text) await this.writeClipboard(msg.text);
    return null;
  }

  removeRecent(filePath) {
    const before = this.recent.toJSON();
    this.recent.remove(filePath);
    this.pushUndo({
      undo: () => {
        this.recent.load(before);
        void this.persist();
      },
      redo: () => {
        this.recent.remove(filePath);
        void this.persist();
      },
    });
    void this.persist();
  }

  clearRecent() {
    const before = this.recent.toJSON();
    this.recent.clear();
    this.pushUndo({
      undo: () => {
        this.recent.load(before);
        void this.persist();
      },
      redo: () => {
        this.recent.clear();
        void this.persist();
      },
    });
    void this.persist();
  }

  async chooseWallpaper() {
    const image = await this.platform.pickImage?.({ startDir: this.settings.lastDirectory });
    if (!image?.dataUrl) return;
    const check = acceptImage({ name: image.name || "image.png", type: image.type || "image/png", size: image.size ?? image.dataUrl.length });
    if (!check.ok) throw new AppError(this.t("msg.dropUnknown"), image.name || "", "DROP");
    if (image.directory) this.rememberDir(image.directory);
    await this.setWallpaper(image.dataUrl, image.name || "");
  }

  async handleDroppedFiles(fileList) {
    const files = [...(fileList || [])];
    for (const file of files) {
      const kind = classifyDrop(file);
      if (kind === "image") {
        const check = acceptImage(file);
        if (!check.ok) {
          this.reportError(new AppError(this.t("msg.dropUnknown"), file.name, "DROP"), "drop");
          continue;
        }
        const dataUrl = await readAsDataURL(file);
        await this.setWallpaper(dataUrl, file.name);
      } else if (kind === "document") {
        const text = await readAsText(file);
        await this.loadDocumentText(text, file.name);
      } else {
        this.reportError(new AppError(this.t("msg.dropUnknown"), file.name || "", "DROP"), "drop");
      }
    }
  }

  openMenu(name, anchorEvent, { atPointer = false } = {}) {
    const items = buildMenuItems(name, {
      t: (key, vars) => this.t(key, vars),
      recent: this.recent.toJSON(),
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
    });
    const rect = atPointer ? null : anchorEvent?.currentTarget?.getBoundingClientRect?.() || anchorEvent?.target?.getBoundingClientRect?.();
    const anchor = {
      x: rect ? rect.left : (anchorEvent?.clientX ?? anchorEvent?.x ?? 0),
      y: rect ? rect.bottom : (anchorEvent?.clientY ?? anchorEvent?.y ?? 0),
      screenX: anchorEvent?.screenX ?? 0,
      screenY: anchorEvent?.screenY ?? 0,
    };
    const layout = layoutMenu(items, anchor, this.frame.getBoundingClientRect());
    if (this.platform.nativeMenus) {
      void this.platform.showMenu?.({ items, layout, theme: this.themeState });
      return;
    }
    this.closeMenu();
    const menu = buildMenuElement(items);
    menu.dataset.menu = name;
    menu.style.position = "fixed";
    const viewW = window.innerWidth || layout.x + layout.width;
    const viewH = window.innerHeight || layout.y + layout.height;
    const scale = Math.min(1, (viewH - 8) / layout.height);
    const height = layout.height * scale;
    const left = Math.max(4, Math.min(layout.x, viewW - layout.width * scale - 4));
    const preferred = layout.y + height > viewH - 4 ? layout.y - height : layout.y;
    const top = Math.max(4, Math.min(preferred, viewH - height - 4));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    if (scale < 1) {
      menu.style.transformOrigin = "0 0";
      menu.style.transform = `scale(${scale.toFixed(3)})`;
      menu.dataset.scale = scale.toFixed(3);
    }
    menu.style.zIndex = "80";
    menu.addEventListener("click", (event) => {
      const item = event.target.closest(".menu-item");
      if (!item || item.dataset.enabled === "false") return;
      const cmd = item.dataset.cmd;
      this.closeMenu();
      void this.run(cmd);
    });
    this.overlay.appendChild(menu);
    this.menuEl = menu;
  }

  closeMenu() {
    this.menuEl?.remove();
    this.menuEl = null;
  }

  decorate(spec) {
    return {
      ...spec,
      theme: this.settings.theme,
      customTheme: this.settings.customTheme,
      fontFamily: this.settings.fontFamily,
      fontSize: this.settings.fontSize,
      fontStyle: this.settings.fontStyle,
      language: this.settings.language,
      closeLabel: this.t("tip.close"),
    };
  }

  async openPopup(spec, handlers = {}) {
    const decorated = this.decorate(spec);
    if (this.platform.nativePopups && this.platform.openPopup) {
      this.nativeImmediate = handlers.immediate || null;
      try {
        return await this.platform.openPopup(decorated);
      } finally {
        this.nativeImmediate = null;
      }
    }
    return this.popups.open(decorated, handlers);
  }

  async withProgress(titleKey, fn) {
    const spec = buildProgressSpec(this.t(titleKey), (key, vars) => this.t(key, vars));
    const decorated = this.decorate(spec);
    let handle;
    if (this.platform.nativePopups && this.platform.beginProgress) handle = await this.platform.beginProgress(decorated);
    else handle = this.popups.showProgress(decorated);
    handle.onAbort = () => {
      this.progressAborted = true;
      this.operationAbort?.abort();
    };
    try {
      return await fn((percent, message) => {
        this.progressLog.push({ title: this.t(titleKey), percent, message });
        handle.update(percent, message);
      });
    } finally {
      handle.close();
    }
  }

  async persist() {
    this.settings.recentFiles = this.recent.toJSON();
    await this.platform.writeSettings(sanitizeSettings(this.settings));
  }
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function basenameSafe(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function readAsText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

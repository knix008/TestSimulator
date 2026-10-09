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
import { MAX_CITIES, clamp, normalizeDateFormat, normalizeDisplayPriority, normalizeRotateSeconds, normalizeUpdateHours, sanitizeCities, sanitizeSettings, samePlace } from "./core/settings.js";
import { applyThemeVars, isTheme, sanitizeCustomTheme, themeColors, themeVars } from "./core/themes.js";
import { UndoStack } from "./core/undo.js";
import { CITIES, filterCities } from "./weather/cities.js";
import { formatTemp, isoDate } from "./weather/format.js";
import { geocodeUrl, mergeGeocoding, parseGeocoding, sourcePageUrl } from "./weather/providers.js";
import { loadWeather } from "./weather/service.js";
import { conditionText } from "./weather/wmo.js";
import { gripIcon, icon } from "./ui/icons.js";
import { layoutMenu } from "./ui/menu-layout.js";
import { buildMenuElement, buildMenuItems } from "./ui/menus.js";
import {
  paintPopupSurface,
  paintWallpaper,
  PopupLayer,
  buildAboutSpec,
  buildErrorSpec,
  buildForecastSpec,
  buildPrintSpec,
  buildProgressSpec,
  applyPopupLanguage,
  buildSearchSpec,
  buildSettingsSpec,
  buildUnsavedSpec,
  parseCityList,
} from "./ui/popups.js";
import { attachWindowDrag } from "./ui/window-drag.js";
import { CONTENT_PADDING, SCENE_TEXT, WINDOW_DEFAULT, clampWindowSize, isCompactWidth, sceneFit } from "./ui/window-spec.js";
import { forecastFitHeight, forecastWhen, renderForecastHtml, renderWeatherHtml } from "./ui/weather-view.js";

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
    /** Extra windows keep their own city list, so only the first window stores one. */
    this.ownsCityList = true;
    this.fonts = resolveFontList([]);
    this.settings = sanitizeSettings(this.platform.readSettingsSync?.() || null);
    this.recent.load(this.settings.recentFiles);
    this.i18n.setLanguage(this.settings.language);
    this.doc = createDocument(this.settings.cities);
    this.pageSetup = { paper: "A4", orientation: "portrait", margin: 15 };
    this.selectionText = "";
    this.progressLog = [];
    this.searchQuery = "";
    this.locationDraft = null;
    this.closed = false;
    this.destroyed = false;
    this.menuEl = null;
    this.progressAborted = false;
    this.now = options.now || (() => new Date());
    this.maximized = Boolean(this.settings.windowMaximized);
    this.minimized = false;
    this.placementReady = typeof this.platform.readSettingsSync === "function";
    this.pendingPlacement = null;
    this.shellOffset = this.settings.windowPosition ? { ...this.settings.windowPosition } : { x: 0, y: 0 };
    this.statusMessage = "";
    this.titleText = "";
    this.forecastAnchor = { daily: "", weekly: "", monthly: "" };
    this.shellSize = clampWindowSize(this.settings.windowSize || WINDOW_DEFAULT);
  }

  mount() {
    this.root.innerHTML = `
      <div class="app-frame" data-chromeless="true" data-gui="window" data-host="${escapeAttr(this.platform.kind || "web")}" data-maximized="false" data-minimized="false">
        <div class="window-shell" data-gui="shell">
          <div class="wallpaper" data-gui="wallpaper"></div>
          <div class="shell-top" data-gui="drag-region">
            <div class="titlebar" data-gui="titlebar">
              <img class="title-icon" src="../assets/icon.png" alt="" width="18" height="18" draggable="false">
              <span class="title-name" data-gui="window-title">${WINDOW_TITLE}</span>
            </div>
            <div class="range-tools" data-gui="range-tools">
              <button type="button" class="tool-btn" data-cmd="daily" data-gui="range-button" data-i18n-title="forecast.daily">${icon("daily")}</button>
              <button type="button" class="tool-btn" data-cmd="weekly" data-gui="range-button" data-i18n-title="forecast.weekly">${icon("weekly")}</button>
              <button type="button" class="tool-btn" data-cmd="monthly" data-gui="range-button" data-i18n-title="forecast.monthly">${icon("monthly")}</button>
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
    this.toast = this.root.querySelector(".toast");
    this.grip = this.root.querySelector(".resize-grip");
    this.wallpaper = this.root.querySelector(".wallpaper");
    this.popups = new PopupLayer(this.overlay);
    this.bind();
    this.detachDrag = attachWindowDrag(this.shell, (step) => this.onShellDrag(step));
    this.applyShellSize();
    this.onWindowResize = () => this.syncWindowTitle();
    window.addEventListener("resize", this.onWindowResize);
    if (typeof ResizeObserver === "function") {
      this.sceneObserver = new ResizeObserver(() => {
        this.applySceneScale();
        this.syncWindowTitle();
      });
      this.sceneObserver.observe(this.content);
      this.sceneObserver.observe(this.root.querySelector(".shell-top"));
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
      this.extraCities = [...(this.settings.extraCities || [])];
      this.syncTabsToCities();
      const boot = await this.platform.windowBoot?.();
      if (boot?.primary === false) this.ownsCityList = false;
      if (boot && Number.isFinite(Number(boot.cityIndex))) this.doc.activeIndex = Math.max(0, Math.min(this.doc.tabs.length - 1, Math.round(Number(boot.cityIndex))));
      this.shellSize = clampWindowSize(this.settings.windowSize || WINDOW_DEFAULT);
      if (this.settings.windowPosition) this.shellOffset = { ...this.settings.windowPosition };
      this.applyShellSize();
      if (this.settings.windowMaximized) this.applyWindowState({ maximized: true });
      this.applyAll();
      this.syncOpenAtLogin();
      this.placementReady = true;
      this.applySceneScale();
      if (this.pendingPlacement) {
        const pending = this.pendingPlacement;
        this.pendingPlacement = null;
        this.rememberWindowPlacement(pending);
      }
      if (this.options.autoLoad) void this.refreshWeather({ quiet: true });
    } catch (error) {
      this.reportError(error, "startup");
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.toastTimer);
    clearTimeout(this.updateTimer);
    this.updateTimer = null;
    clearTimeout(this.rotateTimer);
    this.rotateTimer = null;
    clearTimeout(this.sceneDragTimer);
    this.weatherAbort?.abort();
    this.endResize?.();
    this.detachDrag?.();
    this.popups?.closeAll();
    this.sceneObserver?.disconnect();
    if (this.onWindowResize) window.removeEventListener("resize", this.onWindowResize);
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
      setTimeout(() => {
        if (suppressClick === button) suppressClick = null;
      }, 50);
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
    const onDragStart = (event) => {
      if (event.target?.closest?.("img")) event.preventDefault();
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
      // The weather picture is also the drag handle, so the click that ends a drag is not a choice.
      const day = event.target.closest("[data-date]");
      if (day) {
        this.selectDate(day.dataset.date);
        return;
      }
      if (this.suppressSceneClick) return;
      if (event.target.closest("[data-cmd], button, input, select, textarea, a")) return;
      this.nextCity();
    };
    this.frame.addEventListener("pointerup", onPointerUp);
    this.frame.addEventListener("click", onClick);
    this.frame.addEventListener("input", onInput);
    this.frame.addEventListener("change", onChange);
    this.frame.addEventListener("focusin", onFocusIn);
    this.frame.addEventListener("focusout", onFocusOut);
    this.frame.addEventListener("wheel", onWheel, { passive: false });
    this.frame.addEventListener("dragstart", onDragStart);
    this.frame.addEventListener("dragover", onDragOver);
    this.frame.addEventListener("dragleave", onDragLeave);
    this.frame.addEventListener("drop", onDrop);
    this.shell.addEventListener("contextmenu", onContext);
    this.root.querySelector(".shell-top").addEventListener("dblclick", onTopDouble);
    this.grip.addEventListener("pointerdown", onGripDown);
    this.content.addEventListener("click", onContentClick);
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
      if (id.startsWith("city:")) return this.showCity(Number(id.slice(5)));
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
        refresh: () => this.refreshWeather({ progress: true }),
        settings: () => this.showSettings("general"),
        fonts: () => this.showSettings("font"),
        about: () => this.showAbout(),
        "show-window": () => {},
        minimize: () => this.minimizeWindow(),
        maximize: () => this.toggleMaximize(),
        close: () => this.requestClose(),
        exit: () => this.quitApp(),
        "next-city": () => this.nextCity(),
        "apply-location": () => this.applyLocation(),
        "add-tab": () => this.addTab(),
        "add-city": () => this.openCitySearch(),
        "new-window": () => this.openWeatherWindow(),
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
    const nextMaximized = state.maximized === undefined ? this.maximized : Boolean(state.maximized);
    const placementChanged = state.maximized !== undefined && nextMaximized !== Boolean(this.settings.windowMaximized);
    this.maximized = nextMaximized;
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
    if (placementChanged) this.rememberWindowPlacement({ maximized: this.maximized });
  }

  applyShellSize() {
    const native = Boolean(this.platform.nativeWindow);
    this.shell.dataset.sized = native || this.maximized ? "fill" : "fixed";
    if (native || this.maximized) {
      this.shell.style.removeProperty("width");
      this.shell.style.removeProperty("height");
      this.shell.style.removeProperty("transform");
    } else {
      this.shell.style.width = `${this.shellSize.width}px`;
      this.shell.style.height = this.minimized ? "" : `${this.shellSize.height}px`;
      this.shell.style.transform = this.shellOffset.x || this.shellOffset.y ? `translate(${this.shellOffset.x}px, ${this.shellOffset.y}px)` : "";
    }
    this.applySceneScale();
    this.syncWindowTitle();
  }

  syncWindowTitle() {
    // The window's own width is the measure; the shell's border would lose two pixels.
    const measured = this.platform.nativeWindow ? this.frame?.clientWidth || 0 : 0;
    if (this.frame) this.frame.dataset.compact = isCompactWidth(measured > 0 ? measured : this.shellSize.width) ? "true" : "false";
    const name = this.root.querySelector("[data-gui='window-title']");
    if (!name) return;
    if (this.minimized) {
      name.hidden = true;
      return;
    }
    name.hidden = false;
    const needed = name.scrollWidth;
    const width = name.clientWidth;
    if (needed > 0 && needed > width + 1) name.hidden = true;
  }

  rememberWindowPlacement(bounds) {
    if (!bounds || typeof bounds !== "object") return;
    if (!this.placementReady) {
      this.pendingPlacement = { ...this.pendingPlacement, ...bounds };
      return;
    }
    let changed = false;
    if (Number.isFinite(Number(bounds.width)) && Number.isFinite(Number(bounds.height))) {
      this.shellSize = clampWindowSize({ width: bounds.width, height: bounds.height });
      this.settings.windowSize = { ...this.shellSize };
      changed = true;
    }
    if (Number.isFinite(Number(bounds.x)) && Number.isFinite(Number(bounds.y))) {
      this.settings.windowPosition = { x: Math.round(Number(bounds.x)), y: Math.round(Number(bounds.y)) };
      if (!this.platform.nativeWindow) this.shellOffset = { ...this.settings.windowPosition };
      changed = true;
    }
    if (typeof bounds.maximized === "boolean" && this.settings.windowMaximized !== bounds.maximized) {
      this.settings.windowMaximized = bounds.maximized;
      changed = true;
    }
    if (changed) void this.persist();
  }

  onShellDrag(step) {
    if (this.maximized || this.minimized) return;
    if (this.platform.nativeWindow) {
      void Promise.resolve(this.platform.moveWindow?.(step)).then((bounds) => {
        if (step.phase !== "end") return;
        this.noteSceneDrag();
        this.rememberWindowPlacement(bounds);
      });
      return;
    }
    if (step.phase === "start") {
      this.dragOrigin = { ...this.shellOffset };
      return;
    }
    if (step.phase === "end") {
      this.noteSceneDrag();
      this.rememberWindowPlacement({ x: this.shellOffset.x, y: this.shellOffset.y, width: this.shellSize.width, height: this.shellSize.height });
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
      };
    const up = () => {
      this.endResize?.();
      if (native) {
        void Promise.resolve(this.platform.resizeWindow?.({ phase: "end" })).then((bounds) => this.rememberWindowPlacement(bounds));
        return;
      }
      this.rememberWindowPlacement({ ...this.shellSize, x: this.shellOffset.x, y: this.shellOffset.y });
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
    this.syncUpdateTimer();
    this.syncRotateTimer();
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
    this.renderWeather();
    this.renderStatus();
    this.root.querySelectorAll("input, select, textarea").forEach((el) => {
      if (el.title) return;
      const span = el.parentElement?.querySelector("[data-i18n]");
      if (span?.textContent) el.title = span.textContent;
    });
    this.refreshOpenForecasts();
    this.retranslateOpenPopups();
  }

  /** Dialogs drawn inside the window follow the language too, as the separate ones already do. */
  retranslateOpenPopups() {
    for (const popup of this.overlay?.querySelectorAll("[data-popup]") || []) {
      if (!popup._spec) continue;
      popup._spec.language = this.settings.language;
      applyPopupLanguage(popup, popup._spec);
    }
  }

  applyTheme(draft = {}) {
    const theme = draft.theme && isTheme(draft.theme) ? draft.theme : this.settings.theme;
    const custom = draft.customTheme ? sanitizeCustomTheme(draft.customTheme) : this.settings.customTheme;
    const transparency = draft.transparency != null && draft.transparency !== "" ? clamp(draft.transparency, 0, 100) : this.settings.transparency;
    const colors = themeColors(theme, custom);
    const vars = themeVars(colors, transparency);
    applyThemeVars(document.documentElement, vars, colors.mode);
    document.querySelectorAll("[data-popup]").forEach((popup) => paintPopupSurface(popup, colors, transparency, theme));
    this.themeState = { vars, mode: colors.mode };
    this.platform.broadcastTheme?.({
      vars,
      mode: colors.mode,
      theme,
      customTheme: custom,
      transparency,
      language: this.settings.language,
      fontFamily: this.settings.fontFamily,
    });
    this.applyWallpaper(this.wallpaperOpacityPreview ?? this.settings.backgroundOpacity);
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
    this.frame.style.fontFamily = `"${this.settings.fontFamily}", sans-serif`;
  }

  applyZoom() {
    this.content.dataset.zoom = String(this.settings.zoom);
    this.content.style.zoom = String(this.settings.zoom / 100);
  }

  applyWallpaper(opacity = this.settings.backgroundOpacity) {
    const savedImage = this.settings.backgroundImage || "";
    const image = this.wallpaperImagePreview != null ? this.wallpaperImagePreview : savedImage;
    const value = clamp(opacity, 0, 100);
    paintWallpaper(this.wallpaper, image, value);
    document.querySelectorAll('[data-popup="forecast"] [data-gui="wallpaper"]').forEach((layer) => paintWallpaper(layer, image, value));
    const key = `${image}\n${value}`;
    if (key === this.wallpaperBroadcast) return;
    this.wallpaperBroadcast = key;
    this.platform.broadcastWallpaper?.({ image, opacity: value });
  }

  cities() {
    return this.doc.tabs.map((tab) => createPlace(tab.place));
  }

  /**
   * What the results list offers: the catalog narrowed by the search box, or by the chosen
   * country while the box is empty, so there is always something to add from.
   */
  cityMatches(query, countryCode = "") {
    const typed = String(query || "").trim();
    const pool = this.cityChoices();
    if (!typed) return countryCode ? pool.filter((entry) => entry.countryCode === countryCode) : pool.slice(0, 60);
    return filterCities(pool, "", typed).slice(0, 60);
  }

  /** The same spot under two spellings is still the same city, so coordinates settle it. */
  knownPlace(place) {
    const spot = placeKey(place);
    return [...CITIES, ...this.extraCities].some((entry) => samePlace(entry, place) || placeKey(entry) === spot);
  }

  /** A city the window does not show yet, so adding one never repeats what is already listed. */
  freeCity() {
    const shown = this.cities();
    const fresh = this.cityChoices().find((entry) => !shown.some((place) => samePlace(place, entry)));
    return fresh || this.settings.defaultLocation;
  }

  /** A click that ends a window drag must not also count as "next city". */
  noteSceneDrag() {
    this.suppressSceneClick = true;
    clearTimeout(this.sceneDragTimer);
    this.sceneDragTimer = setTimeout(() => {
      this.suppressSceneClick = false;
    }, 150);
  }

  /** Another window starts on the city after the one this window shows. */
  async openWeatherWindow() {
    if (!this.platform.newWindow) {
      this.setStatus(this.t("msg.oneWindow"));
      return;
    }
    const count = this.doc.tabs.length;
    const cityIndex = count > 1 ? (this.doc.activeIndex + 1) % count : this.doc.activeIndex;
    await this.persist();
    await this.platform.newWindow({ cityIndex });
  }

  /** A click on the window, the tray, or the rotation timer all land here. */
  nextCity(delta = 1) {
    const count = this.doc.tabs.length;
    if (count < 2) {
      this.setStatus(this.t("msg.oneCity"));
      return;
    }
    this.showCity(this.doc.activeIndex + delta);
  }

  showCity(index) {
    const count = this.doc.tabs.length;
    if (!count) return;
    const wanted = Number(index);
    if (!Number.isFinite(wanted)) return;
    this.doc.activeIndex = ((Math.round(wanted) % count) + count) % count;
    this.afterStructure();
    const tab = this.currentTab();
    this.selectDate(tab.selectedDate || (tab.weather ? this.preferredDate(tab.weather) : ""));
    this.armRotateTimer();
    // A window told not to load on its own does not go fetching when the city changes either.
    if (!tab.weather && this.options.autoLoad !== false) void this.refreshWeather({ quiet: true });
  }

  /** Keeps one tab per listed city, reusing the tab a city already had so its weather survives. */
  syncTabsToCities() {
    const cities = sanitizeCities(this.settings.cities, this.settings.defaultLocation);
    const previous = this.doc.tabs;
    const activeId = previous[this.doc.activeIndex]?.id;
    const taken = new Set();
    this.doc.tabs = cities.map((place, index) => {
      const match = previous.findIndex((tab, at) => !taken.has(at) && samePlace(tab.place, place));
      if (match >= 0) {
        taken.add(match);
        previous[match].place = createPlace(place);
        return previous[match];
      }
      if (previous[index] && !taken.has(index)) {
        taken.add(index);
        const reused = previous[index];
        reused.place = createPlace(place);
        reused.weather = null;
        reused.selectedDate = "";
        return reused;
      }
      return createTab(place);
    });
    const at = this.doc.tabs.findIndex((tab) => tab.id === activeId);
    this.doc.activeIndex = at >= 0 ? at : Math.min(this.doc.activeIndex, this.doc.tabs.length - 1);
  }

  renderWeather() {
    const tab = this.currentTab();
    this.content.innerHTML = renderWeatherHtml({
      tab,
      language: this.settings.language,
      units: this.settings.units,
      priority: this.settings.displayPriority,
      dateFormat: this.dateFormatPreview || this.settings.dateFormat,
      today: this.now(),
      cityCount: this.doc.tabs.length,
      t: (key, vars) => this.t(key, vars),
    });
    this.applySceneScale();
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
      if (box.closest("[data-popup='settings']")) return;
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
    this.syncPanels();
    this.renderWeather();
    this.renderStatus();
    this.refreshOpenForecasts();
    this.platform.shownCity?.(this.doc.activeIndex);
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

  /** Windows of their own hear about the language through the theme broadcast. */
  applyLanguage() {
    this.applyI18n();
    this.applyTheme();
  }

  async setLanguage(lang) {
    const next = lang === "en" ? "en" : "ko";
    const prev = this.settings.language;
    if (prev === next) return;
    this.settings.language = next;
    this.applyLanguage();
    this.pushUndo({
      undo: () => {
        this.settings.language = prev;
        this.applyLanguage();
        void this.persist();
      },
      redo: () => {
        this.settings.language = next;
        this.applyLanguage();
        void this.persist();
      },
    });
    await this.persist();
  }

  async setWallpaper(dataUrl, name = "") {
    this.settings.backgroundImage = dataUrl || "";
    this.settings.backgroundName = name || "";
    this.wallpaperImagePreview = dataUrl || "";
    this.applyWallpaper(this.wallpaperOpacityPreview ?? this.settings.backgroundOpacity);
    await this.persist();
  }

  forecastView(range, anchor = "") {
    const tab = this.currentTab();
    const basis = anchor || this.forecastAnchor[range] || isoDate(this.now());
    const t = (key, vars) => this.t(key, vars);
    const shared = {
      range,
      tab,
      language: this.settings.language,
      units: this.settings.units,
      priority: this.settings.displayPriority,
      dateFormat: this.dateFormatPreview || this.settings.dateFormat,
      today: this.now(),
      anchor: basis,
      t,
    };
    return {
      anchor: basis,
      markup: renderForecastHtml(shared),
      when: forecastWhen(shared),
      city: displayCity(tab?.place, this.settings.language),
    };
  }

  async showForecast(range, options = {}) {
    const anchor = options.anchor || isoDate(this.now());
    this.forecastAnchor[range] = anchor;
    const tab = this.currentTab();
    const hasWeather = Boolean(tab?.weather?.daily?.length);
    const t = (key, vars) => this.t(key, vars);
    const { markup, when, city } = this.forecastView(range, anchor);
    const spec = buildForecastSpec({
      range,
      markup,
      when,
      city,
      fitHeight: forecastFitHeight(range, hasWeather),
      refreshLabel: this.t("cmd.refresh"),
      transparency: this.themePreview?.transparency ?? this.settings.transparency,
      backgroundImage: this.settings.backgroundImage,
      backgroundOpacity: this.wallpaperOpacityPreview ?? this.settings.backgroundOpacity,
      t,
    });
    const handlers = {
      immediate: (msg) => {
        const point = { clientX: msg?.clientX, clientY: msg?.clientY, screenX: msg?.screenX, screenY: msg?.screenY };
        if (msg?.type === "window-menu") {
          this.openMenu("window", point, { atPointer: true });
          return;
        }
        if (msg?.type === "open-daily") {
          this.selectDate(msg.date);
          if (msg.range === "monthly") this.followMonthSelection(msg.date, { daily: false });
          void this.showForecast("daily", { anchor: msg.date });
          return;
        }
        if (msg?.type === "forecast-refresh") {
          void this.refreshForecast();
          return;
        }
        if (msg?.type !== "select-date") return;
        this.selectDate(msg.date);
        if (msg.range === "monthly") this.followMonthSelection(msg.date);
        if (msg.clientX == null) return;
        this.openMenu("context", point, { atPointer: true });
      },
    };
    if (this.replaceLocalForecast(range, markup, when, city)) return Promise.resolve({ action: "focused" });
    if (!this.platform.refreshPopup) return this.openPopup(spec, handlers);
    return this.openOrRefreshForecast(spec, handlers, markup, city);
  }

  /** Fetch the shown city again and repaint whatever forecast windows are open. */
  async refreshForecast() {
    await this.refreshWeather({ quiet: true });
    this.refreshOpenForecasts();
  }

  replaceLocalForecast(range, markup, when, city = "") {
    const popup = this.overlay.querySelector(`[data-popup-key="forecast:${range}"]`);
    if (!popup) return false;
    const fit = popup.querySelector(".forecast-fit");
    if (fit) fit.innerHTML = markup;
    const place = popup.querySelector(".popup-city");
    if (place) place.textContent = city || "";
    const label = popup.querySelector(".popup-when");
    if (label) label.textContent = when || "";
    this.popups.raise(popup);
    return true;
  }

  followMonthSelection(date, options = {}) {
    this.forecastAnchor.weekly = date;
    if (options.daily !== false) this.forecastAnchor.daily = date;
    this.paintOpenForecast("weekly");
    if (options.daily !== false) this.paintOpenForecast("daily");
    this.paintOpenForecast("monthly");
  }

  paintOpenForecast(range) {
    const popup = this.overlay?.querySelector(`[data-popup-key="forecast:${range}"]`);
    if (!popup && !this.platform.refreshPopup) return;
    const { markup, when, city } = this.forecastView(range);
    const fit = popup?.querySelector(".forecast-fit");
    if (fit) fit.innerHTML = markup;
    const place = popup?.querySelector(".popup-city");
    if (place) place.textContent = city || "";
    const label = popup?.querySelector(".popup-when");
    if (label) label.textContent = when || "";
    if (this.platform.refreshPopup) void this.platform.refreshPopup(`forecast:${range}`, { markup, when: when || "", city: city || "" }, { focus: false });
  }

  refreshOpenForecasts() {
    if (!this.overlay) return;
    for (const range of ["daily", "weekly", "monthly"]) this.paintOpenForecast(range);
  }

  async openOrRefreshForecast(spec, handlers, markup, city = "") {
    const refreshed = await this.platform.refreshPopup(`forecast:${spec.range}`, { markup, when: spec.when || "", city });
    if (refreshed?.focused) return { action: "focused" };
    return this.openPopup(spec, handlers);
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
    const fit = sceneFit(available, SCENE_TEXT);
    const boxKey = `${Math.round(available.width)}x${Math.round(available.height)}`;
    if (this.content.dataset.sceneReady === "1" && this._sceneBox === boxKey) return;
    if (this.content.dataset.sceneReady === "1") {
      const prevArt = Number(this.content.style.getPropertyValue("--art-scale"));
      const prevText = Number(this.content.style.getPropertyValue("--scene-scale"));
      if (Math.abs(prevArt - fit.art) < 0.03 && Math.abs(prevText - fit.text) < 0.03) {
        this._sceneBox = boxKey;
        return;
      }
    }
    this.content.style.setProperty("--scene-text", `${SCENE_TEXT}px`);
    this.content.style.setProperty("--scene-scale", String(fit.text));
    this.content.style.setProperty("--art-scale", String(fit.art));
    if (this.placementReady && measured) {
      this._sceneBox = boxKey;
      this.content.dataset.sceneReady = "1";
    }
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

  addTab(place) {
    const tab = createTab(place || this.freeCity());
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
    this.markDirty();
    this.showCity(index);
    void this.persist();
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
    void this.persist();
  }

  updateIntervalMs() {
    return this.settings.updateHours * 60 * 60 * 1000;
  }

  rotateIntervalMs() {
    return normalizeRotateSeconds(this.settings.rotateSeconds) * 1000;
  }

  syncRotateTimer() {
    if (this.destroyed) return;
    const seconds = normalizeRotateSeconds(this.settings.rotateSeconds);
    const count = this.doc.tabs.length;
    if (seconds === this.rotateArmed && count === this.rotateCount) return;
    this.armRotateTimer();
  }

  /** Off, or a single city, leaves no timer running. */
  armRotateTimer() {
    clearTimeout(this.rotateTimer);
    this.rotateTimer = null;
    const seconds = normalizeRotateSeconds(this.settings.rotateSeconds);
    this.rotateArmed = seconds;
    this.rotateCount = this.doc.tabs.length;
    this.rotateDelay = seconds * 1000;
    if (!this.rotateDelay || this.rotateCount < 2 || this.destroyed) return;
    this.rotateTimer = setTimeout(() => {
      this.rotateTimer = null;
      if (this.destroyed) return;
      this.nextCity();
    }, this.rotateDelay);
  }

  syncUpdateTimer() {
    if (this.destroyed) return;
    if (this.updateTimer && this.updateHoursArmed === this.settings.updateHours) return;
    this.armUpdateTimer();
  }

  armUpdateTimer() {
    clearTimeout(this.updateTimer);
    this.updateHoursArmed = this.settings.updateHours;
    this.updateDelay = this.updateIntervalMs();
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      void this.refreshWeather({ quiet: true, all: true }).finally(() => {
        if (!this.destroyed) this.armUpdateTimer();
      });
    }, this.updateDelay);
  }

  async refreshWeather({ quiet = false, progress = false, all = false } = {}) {
    if (quiet && this.refreshJob) return;
    const generation = (this.refreshGeneration || 0) + 1;
    this.refreshGeneration = generation;
    this.weatherAbort?.abort();
    this.weatherAbort = new AbortController();
    const signal = this.weatherAbort.signal;
    if (progress) {
      this.progressAborted = false;
      this.operationAbort = this.weatherAbort;
    }
    const tabs = all ? [...this.doc.tabs] : [this.currentTab()].filter(Boolean);
    const job = progress
      ? this.withProgress("progress.fetch", (report) => this.loadTabs(tabs, signal, false, report))
      : this.loadTabs(tabs, signal, quiet);
    this.refreshJob = job;
    try {
      await job;
    } finally {
      if (this.refreshGeneration === generation) this.refreshJob = null;
    }
  }

  async loadTabs(tabs, signal, quiet, report) {
    if (!tabs.length) return;
    this.setStatus(this.t("status.loading"));
    let failed = null;
    for (const tab of tabs) {
      if (signal.aborted || this.destroyed || this.progressAborted) break;
      try {
        const weather = await loadWeather(tab.place, {
          fetchImpl: (url, options) => this.platform.fetch(url, options),
          sources: this.previewSources || this.settings.enabledSources,
          signal,
          onProgress: report ? (percent, id) => report(percent, this.t(`source.${id}`)) : undefined,
        });
        if (signal.aborted || this.destroyed || this.progressAborted) break;
        weather.fetchedAt = new Date().toISOString();
        tab.weather = weather;
        if (tab.id === this.currentTab()?.id) {
          this.selectDate(tab.selectedDate || this.preferredDate(weather));
          this.refreshOpenForecasts();
        }
      } catch (error) {
        if (error?.name === "AbortError" || signal.aborted || this.progressAborted) break;
        failed = error;
        if (!quiet) break;
      }
    }
    if (this.destroyed) return;
    if (signal.aborted || this.progressAborted) {
      this.setStatus(this.t("status.cancelled"));
      return;
    }
    this.setStatus(this.t("status.ready"));
    if (failed && !quiet) throw failed;
  }

  preferredDate(weather) {
    const today = isoDate(this.now());
    if (weather.daily.some((day) => day.date === today)) return today;
    return weather.daily.find((day) => day.date >= today)?.date || weather.daily[0]?.date || "";
  }

  /**
   * One window does the searching, wherever it was asked for. Opened from the settings dialog
   * it fills that dialog's list; opened from a menu it adds to the window straight away.
   */
  async openCitySearch({ settingsId = "", cities = null, query = "" } = {}) {
    this.citySearchFor = settingsId;
    this.pendingCities = settingsId ? sanitizeCities(parseCityList(cities), this.settings.defaultLocation) : null;
    const spec = buildSearchSpec({
      query,
      results: this.cityMatches(query),
      language: this.settings.language,
      target: settingsId,
      t: (key, vars) => this.t(key, vars),
    });
    if (this.replaceLocalSearch(spec)) return;
    const refreshed = await this.platform.refreshPopup?.("search", { results: spec.results, query, target: settingsId });
    if (refreshed?.focused) return;
    await this.openPopup(spec, { immediate: (message) => this.handlePopupImmediate(message) });
  }

  replaceLocalSearch(spec) {
    const popup = this.overlay?.querySelector('[data-popup-key="search"]');
    if (!popup?._update) return false;
    popup._update({ results: spec.results, query: spec.query });
    this.popups.raise(popup);
    return true;
  }

  /**
   * Every city in the world is reachable: the built-in ones answer at once and the geocoder is
   * always asked as well, so a name that is not in the list still turns up. A search that cannot
   * reach the network still shows what is known here.
   */
  async findCities(query) {
    const typed = String(query || "").trim();
    this.searchQuery = typed;
    if (!typed) return this.cityMatches("");
    const known = this.cityMatches(typed);
    try {
      await this.searchOnline(typed);
    } catch (error) {
      if (!known.length) throw error;
    }
    const results = this.cityMatches(typed);
    if (!results.length) this.setStatus(this.t("msg.noResults"));
    return results;
  }

  /** A city chosen in the search window joins whichever list asked for the window. */
  takeFoundCity(place, target = "") {
    if (!place) return null;
    if (!target) return this.addCityPlace(place);
    const next = [...(this.pendingCities || [])];
    if (next.some((entry) => samePlace(entry, place))) {
      this.setStatus(this.t("msg.cityExists"));
      return null;
    }
    if (next.length >= MAX_CITIES) {
      this.setStatus(this.t("msg.cityFull", { n: MAX_CITIES }));
      return null;
    }
    next.push(createPlace(place));
    this.pendingCities = next;
    this.setStatus(this.t("msg.applied"));
    void this.pushCityList(next);
    return null;
  }

  /** Adding without the settings dialog open puts the city straight into this window. */
  addCityPlace(place) {
    const next = createPlace(place);
    if (this.doc.tabs.some((tab) => samePlace(tab.place, next))) {
      this.setStatus(this.t("msg.cityExists"));
      return null;
    }
    if (this.doc.tabs.length >= MAX_CITIES) {
      this.setStatus(this.t("msg.cityFull", { n: MAX_CITIES }));
      return null;
    }
    this.addTab(next);
    this.setStatus(this.t("msg.applied"));
    return null;
  }

  async pushCityList(cities) {
    const patch = { cities };
    const popup = this.overlay?.querySelector('[data-popup="settings"]');
    if (popup?._update) {
      popup._update(patch);
      return;
    }
    if (this.citySearchFor) await this.platform.updatePopup?.(this.citySearchFor, patch);
  }

  async searchOnline(query) {
    const field = this.root.querySelector("#search-input") || document.querySelector('[data-popup="settings"] [data-field="search"]');
    const typed = String(query ?? field?.value ?? this.searchQuery ?? "").trim();
    const q = typed || this.currentTab().place.cityEn;
    await this.withProgress("progress.search", async (report) => {
      report(30, q);
      const fetchRows = async (language) => {
        const response = await this.platform.fetch(geocodeUrl(q, language));
        if (!response.ok) throw new AppError(this.t("msg.noResults"), `HTTP ${response.status}`, "GEO");
        return parseGeocoding(await response.json());
      };
      const korean = await fetchRows("ko");
      report(70, q);
      const english = await fetchRows("en").catch(() => []);
      const rows = mergeGeocoding(korean, english);
      report(100, this.t("progress.done"));
      if (!rows.length) throw new AppError(this.t("msg.noResults"), q, "GEO");
      for (const row of rows) {
        if (!this.knownPlace(row)) this.extraCities.push(row);
      }
      void this.persist();
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
    this.doc = createDocument(this.settings.cities);
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

  /** The window keeps running behind the tray icon; only the tray's exit ends the program. */
  async requestClose() {
    if (this.platform.nativeWindow) return this.hideWindow();
    return this.quitApp();
  }

  async hideWindow() {
    this.popups?.closeAll();
    this.closeMenu();
    const bounds = await this.platform.windowBounds?.();
    if (bounds) this.rememberWindowPlacement(bounds);
    await this.persist();
    await this.platform.windowControl?.("hide");
    return "hidden";
  }

  /** Settings keep themselves; there is no document to save, so exit just goes. */
  async quitApp() {
    await this.shutdown();
    return "closed";
  }

  async shutdown() {
    this.popups?.closeAll();
    this.closeMenu();
    const bounds = await this.platform.windowBounds?.();
    if (bounds) this.rememberWindowPlacement(bounds);
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

  /**
   * One window: what to print and how it will look, side by side with the sheet itself.
   * Print sends it straight to the printer.
   */
  async openPrint() {
    const days = this.currentTab().weather?.daily || [];
    this.printDraft = {
      scope: this.printDraft?.scope || "current",
      from: days[0]?.date || isoDate(this.now()),
      to: days[days.length - 1]?.date || isoDate(this.now()),
      ranges: this.printDraft?.ranges || ["daily", "weekly", "monthly"],
    };
    const build = () =>
      buildPrintModel({
        scope: this.printDraft.scope,
        tabs: this.doc.tabs,
        activeIndex: this.doc.activeIndex,
        fromDate: this.printDraft.from,
        toDate: this.printDraft.to,
        pageSetup: this.pageSetup,
        language: this.settings.language,
        ranges: this.printDraft.ranges,
        today: this.now(),
        units: this.settings.units,
        priority: this.settings.displayPriority,
        dateFormat: this.dateFormatPreview || this.settings.dateFormat,
        t: (key, vars) => this.t(key, vars),
      });
    let model = build();
    const spec = buildPrintSpec((key, vars) => this.t(key, vars), this.printDraft, model);
    const answer = await this.openPopup(spec, {
      immediate: async (msg) => {
        if (msg?.type !== "print-setup") return this.handlePopupImmediate(msg);
        const values = msg.values || {};
        this.printDraft = {
          scope: values.scope || "current",
          from: values.from || this.printDraft.from,
          to: values.to || this.printDraft.to,
          ranges: Array.isArray(values.ranges) && values.ranges.length ? values.ranges : this.printDraft.ranges,
        };
        this.pageSetup = normalizeSetup(values);
        try {
          model = build();
        } catch (error) {
          // A backwards date range leaves the last good sheet on screen and says so.
          this.setStatus(this.t("msg.badRange"));
          void error;
          return null;
        }
        return { pages: model.pages, pageSetup: model.pageSetup, html: model.html };
      },
    });
    if (answer?.action !== "print") return;
    await this.platform.print({ html: answer.html || model.html, pageSetup: answer.pageSetup || this.pageSetup });
    this.setStatus(this.t("status.ready"));
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
        dateFormat: this.settings.dateFormat,
        units: this.settings.units,
        updateHours: this.settings.updateHours,
        rotateSeconds: this.settings.rotateSeconds,
        cities: this.cities(),
        displayPriority: this.settings.displayPriority,
        countryCode: place.countryCode,
        cityEn: place.cityEn,
        lat: place.lat,
        lon: place.lon,
        search: "",
        openAtLogin: this.settings.openAtLogin,
        theme: this.settings.theme,
        customTheme: this.settings.customTheme,
        transparency: this.settings.transparency,
        backgroundOpacity: this.settings.backgroundOpacity,
        backgroundName: this.settings.backgroundName,
        backgroundImage: this.settings.backgroundImage,
        fontFamily: this.settings.fontFamily,
        enabledSources: this.settings.enabledSources,
        sourceStatus: Object.fromEntries((this.currentTab()?.weather?.sources || []).map((source) => [source.id, source])),
        lastDirectory: this.settings.lastDirectory,
      },
    });
    const answer = await this.openPopup(spec, { immediate: (msg) => this.handlePopupImmediate(msg) });
    if (answer?.action === "focused") return answer;
    if (answer?.action === "ok") await this.applySettingsForm(answer.values);
    else this.syncOpenAtLogin();
    this.dateFormatPreview = null;
    this.previewSources = null;
    this.wallpaperOpacityPreview = null;
    this.wallpaperImagePreview = null;
    if (answer?.action === "ok") this.applyTheme();
    else this.applyAll();
    if (answer?.action === "recent-open") await this.openRecentPath(answer.path);
    return answer;
  }

  async openRecentPath(filePath) {
    const index = this.recent.items.indexOf(filePath);
    if (index >= 0) await this.openRecent(index);
  }

  writeSettingsValues(target, values) {
    target.language = values.language === "en" ? "en" : "ko";
    target.units = values.units === "F" ? "F" : "C";
    target.dateFormat = normalizeDateFormat(values.dateFormat);
    target.updateHours = normalizeUpdateHours(values.updateHours);
    target.rotateSeconds = normalizeRotateSeconds(values.rotateSeconds);
    target.displayPriority = normalizeDisplayPriority(values.displayPriority);
    if (isTheme(values.theme)) target.theme = values.theme;
    if (values.customBg || values.customText || values.customAccent || values.customMode) {
      target.customTheme = sanitizeCustomTheme({
        mode: values.customMode,
        bg: values.customBg,
        text: values.customText,
        accent: values.customAccent,
      });
    }
    if (values.transparency != null && values.transparency !== "") target.transparency = clamp(values.transparency, 0, 100);
    if (values.backgroundOpacity != null && values.backgroundOpacity !== "") target.backgroundOpacity = clamp(values.backgroundOpacity, 0, 100);
    if (values.wallpaperEdited === "1") {
      target.backgroundImage = values.backgroundImage || "";
      target.backgroundName = values.backgroundName || "";
    }
    if (values.fontFamily) target.fontFamily = values.fontFamily;
    target.openAtLogin = Boolean(values.openAtLogin);
    if (values.sources) {
      const nextSources = Object.entries(values.sources).filter(([, on]) => on).map(([id]) => id);
      if (nextSources.length) target.enabledSources = nextSources;
    }
    const edited = values.cities == null ? null : sanitizeCities(parseCityList(values.cities), target.defaultLocation);
    if (edited) target.cities = edited;
    const found = this.cityChoices().find((entry) => entry.countryCode === values.countryCode && entry.cityEn === values.cityEn);
    if (!found) return null;
    const lat = values.lat === "" || values.lat == null ? found.lat : Number(values.lat);
    const lon = values.lon === "" || values.lon == null ? found.lon : Number(values.lon);
    const place = createPlace({ ...found, lat, lon });
    target.defaultLocation = place;
    target.cities = this.listWithShownCity(target.cities, place);
    return place;
  }

  /**
   * The pickers name the city on screen, so a pick that is not in the list replaces the shown
   * entry; a pick already listed was just added and stays where it is.
   */
  listWithShownCity(cities, place) {
    const list = sanitizeCities(cities, place);
    if (list.some((entry) => samePlace(entry, place))) return list;
    const shown = this.currentTab()?.place;
    const at = list.findIndex((entry) => samePlace(entry, shown));
    const index = at >= 0 ? at : Math.min(this.doc.activeIndex, list.length - 1);
    const next = [...list];
    next[index] = createPlace(place);
    return next;
  }

  previewSettingsForm(values) {
    const saved = this.settings;
    const draft = structuredClone(saved);
    const tab = this.currentTab();
    const placeBefore = tab ? createPlace(tab.place) : null;
    const placeAfter = this.writeSettingsValues(draft, values);
    this.settings = draft;
    this.previewSources = draft.enabledSources;
    if (values.backgroundOpacity != null && values.backgroundOpacity !== "") this.wallpaperOpacityPreview = clamp(values.backgroundOpacity, 0, 100);
    if (values.wallpaperEdited === "1") this.wallpaperImagePreview = values.backgroundImage || "";
    try {
      if (tab && placeAfter) tab.place = placeAfter;
      this.dateFormatPreview = draft.dateFormat;
      this.applyAll();
      this.syncOpenAtLogin(draft.openAtLogin);
      this.themePreview = {
        theme: draft.theme,
        customTheme: draft.customTheme,
        transparency: draft.transparency,
      };
    } finally {
      this.settings = saved;
      if (tab && placeBefore) tab.place = placeBefore;
    }
  }

  /** The saved city list carries the pickers' choice, so restoring the settings restores the tabs. */
  async applySettingsForm(values) {
    const before = structuredClone(this.settings);
    this.writeSettingsValues(this.settings, values);
    const after = structuredClone(this.settings);
    this.pushUndo({
      undo: () => this.replaceSettings(before),
      redo: () => this.replaceSettings(after),
    });
    this.replaceSettings(after);
    await this.persist();
  }

  replaceSettings(next) {
    this.settings = sanitizeSettings(structuredClone(next));
    this.recent.load(this.settings.recentFiles);
    this.syncTabsToCities();
    this.afterStructure();
    this.applyAll();
    this.syncOpenAtLogin();
  }

  syncOpenAtLogin(enabled = this.settings.openAtLogin) {
    void this.platform.setOpenAtLogin?.(Boolean(enabled));
  }

  async showAbout() {
    return this.openPopup(buildAboutSpec((key, vars) => this.t(key, vars)));
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
      return { backgroundName: this.settings.backgroundName || "", backgroundImage: this.settings.backgroundImage || "" };
    }
    if (msg.type === "clear-wallpaper") {
      await this.setWallpaper("", "");
      return { backgroundName: "", backgroundImage: "" };
    }
    if (msg.type === "wallpaper-preview") {
      this.wallpaperImagePreview = typeof msg.image === "string" ? msg.image : "";
      this.wallpaperOpacityPreview = clamp(msg.opacity, 0, 100);
      this.applyWallpaper(this.wallpaperOpacityPreview);
      return null;
    }
    if (msg.type === "city-notice") {
      const text = {
        exists: this.t("msg.cityExists"),
        full: this.t("msg.cityFull", { n: MAX_CITIES }),
        last: this.t("msg.lastCity"),
        added: this.t("msg.applied"),
      }[msg.notice];
      if (text) this.setStatus(text);
      return null;
    }
    if (msg.type === "open-search") {
      // A dialog drawn inside the window has no popup id; the request itself says it came from settings.
      await this.openCitySearch({ settingsId: msg.popupId || "settings", cities: msg.cities });
      return null;
    }
    if (msg.type === "city-search") {
      return { results: await this.findCities(msg.query) };
    }
    if (msg.type === "city-pick") {
      return this.takeFoundCity(msg.place, msg.target);
    }
    if (msg.type === "theme-preview") {
      this.applyTheme({ theme: msg.theme, customTheme: msg.customTheme, transparency: msg.transparency });
      return null;
    }
    if (msg.type === "wallpaper-opacity") {
      this.wallpaperOpacityPreview = clamp(msg.value, 0, 100);
      this.applyWallpaper(this.wallpaperOpacityPreview);
      return null;
    }
    if (msg.type === "settings-preview") {
      this.previewSettingsForm(msg.values || {});
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
    const image = await this.platform.pickImage?.({ startDir: this.settings.imageDirectory || "" });
    if (!image?.dataUrl) return;
    const check = acceptImage({ name: image.name || "image.png", type: image.type || "image/png", size: image.size ?? image.dataUrl.length });
    if (!check.ok) throw new AppError(this.t("msg.dropUnknown"), image.name || "", "DROP");
    if (image.directory) this.settings.imageDirectory = image.directory;
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
    const live = this.themePreview;
    return {
      ...spec,
      theme: live?.theme || this.settings.theme,
      customTheme: live?.customTheme || this.settings.customTheme,
      fontFamily: this.settings.fontFamily,
      language: this.settings.language,
      closeLabel: this.t("tip.close"),
    };
  }

  async openPopup(spec, handlers = {}) {
    const decorated = this.decorate(spec);
    if (this.platform.nativePopups && this.platform.openPopup) {
      const previous = this.nativeImmediate;
      this.nativeImmediate = handlers.immediate || previous;
      try {
        return await this.platform.openPopup(decorated);
      } finally {
        this.nativeImmediate = previous;
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
    if (this.ownsCityList) this.settings.cities = this.cities();
    this.settings.extraCities = this.extraCities.map((entry) => createPlace(entry));
    await this.platform.writeSettings(sanitizeSettings(this.settings));
  }
}

/** Two places within about a kilometre of each other are the same city for our purposes. */
function placeKey(place) {
  return `${Number(place?.lat).toFixed(2)}|${Number(place?.lon).toFixed(2)}`;
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

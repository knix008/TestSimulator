import { WINDOW_TITLE } from "./core/app-info.js";
import { copyRange, cutText, pasteText } from "./core/clipboard.js";
import {
  createBoard,
  createDocument,
  createTab,
  displayCountry,
  displayMarket,
  parseDocument,
  serializeDocument,
  suggestedFileName,
  withSymbol,
  withoutSymbol,
} from "./core/document.js";
import { acceptImage, classifyDrop } from "./core/drop.js";
import { AppError, normalizeError } from "./core/errors.js";
import { FONT_STYLES, resolveFontList } from "./core/fonts.js";
import { DICT, createI18n, formatMessage } from "./core/i18n.js";
import { dirname } from "./core/paths.js";
import { buildPrintModel, normalizeSetup } from "./core/print-model.js";
import { RecentFiles } from "./core/recent.js";
import {
  MAX_RATE_CURRENCIES,
  MAX_SYMBOLS,
  clamp,
  normalizeCurrency,
  normalizeRateCurrencies,
  normalizeDisplayPriority,
  normalizeRotateSeconds,
  normalizeSceneMode,
  normalizeUpdateHours,
  sanitizeSettings,
} from "./core/settings.js";
import { applyThemeVars, isTheme, sanitizeCustomTheme, themeColors, themeVars } from "./core/themes.js";
import { UndoStack } from "./core/undo.js";
import { activeQuote } from "./market/aggregate.js";
import { formatPercent, formatPrice, formatSigned, isoDate } from "./market/format.js";
import { CURRENCIES, LISTINGS, MARKETS, currencyName, filterListings, findListing, findMarket, listingName } from "./market/markets.js";
import { sourcePageUrl } from "./market/providers.js";
import { loadBoard, searchSymbols } from "./market/service.js";
import { trendText } from "./market/trend.js";
import { gripIcon, icon } from "./ui/icons.js";
import { layoutMenu } from "./ui/menu-layout.js";
import { buildMenuElement, buildMenuItems } from "./ui/menus.js";
import {
  paintWallpaper,
  PopupLayer,
  buildAboutSpec,
  buildErrorSpec,
  buildPanelSpec,
  buildPreviewSpec,
  buildPrintSpec,
  buildProgressSpec,
  buildSettingsSpec,
  buildUnsavedSpec,
} from "./ui/popups.js";
import { TAB_WIDTH, layoutTabScroller } from "./ui/tab-scroller.js";
import { attachWindowDrag } from "./ui/window-drag.js";
import { CONTENT_PADDING, SCENE_TEXT, WINDOW_DEFAULT, boardWindowSize, clampWindowSize, sceneFit, showsTitleText } from "./ui/window-spec.js";
import { boardRowCount, panelFitHeight, panelRowCount, renderMarketHtml, renderPanelHtml } from "./ui/market-view.js";

export function createApp(container, options = {}) {
  const app = new MoneyApp(container, options);
  app.mount();
  return app;
}

const TOAST_MS = 2600;

class MoneyApp {
  constructor(container, options) {
    this.root = container;
    this.options = options;
    this.platform = options.platform;
    this.i18n = createI18n("ko");
    this.history = new UndoStack();
    this.recent = new RecentFiles(10);
    this.extraListings = [];
    this.fonts = resolveFontList([]);
    this.settings = sanitizeSettings(this.platform.readSettingsSync?.() || null);
    this.recent.load(this.settings.recentFiles);
    this.i18n.setLanguage(this.settings.language);
    this.doc = createDocument(this.settings.defaultBoard);
    this.pageSetup = { paper: "A4", orientation: "portrait", margin: 15 };
    this.selectionText = "";
    this.progressLog = [];
    this.tabStart = 0;
    this.workspaceWidth = null;
    this.searchQuery = "";
    this.listingDraft = null;
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
              <button type="button" class="tool-btn" data-cmd="stocks" data-gui="range-button" data-i18n-title="panel.stocks">${icon("stocks")}</button>
              <button type="button" class="tool-btn" data-cmd="rates" data-gui="range-button" data-i18n-title="panel.rates">${icon("rates")}</button>
              <button type="button" class="tool-btn" data-cmd="news" data-gui="range-button" data-i18n-title="panel.news">${icon("news")}</button>
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
      this.sceneObserver = new ResizeObserver(() => {
        this.applyTitleRoom();
        this.applySceneScale();
      });
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
      this.shellSize = clampWindowSize(this.settings.windowSize || WINDOW_DEFAULT);
      if (this.settings.windowPosition) this.shellOffset = { ...this.settings.windowPosition };
      this.applyShellSize();
      if (this.settings.windowMaximized) this.applyWindowState({ maximized: true });
      this.applyAll();
      this.placementReady = true;
      this.applySceneScale();
      if (this.pendingPlacement) {
        const pending = this.pendingPlacement;
        this.pendingPlacement = null;
        this.rememberWindowPlacement(pending);
      }
      if (this.options.autoLoad) void this.refreshMarket({ quiet: true });
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
    clearInterval(this.rotateTimer);
    this.rotateTimer = null;
    clearTimeout(this.sceneDragTimer);
    clearTimeout(this.refreshSoonTimer);
    this.refreshSoonTimer = null;
    this.marketAbort?.abort();
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

  /** Built-in listings plus anything an online search has added this session. */
  listingChoices() {
    return [...LISTINGS, ...this.extraListings];
  }

  marketChoices() {
    const map = new Map(MARKETS.map((market) => [market.marketCode, market]));
    for (const entry of this.extraListings) {
      if (map.has(entry.marketCode)) continue;
      const market = findMarket(entry.marketCode);
      if (market) map.set(market.marketCode, market);
    }
    return [...map.values()];
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
      const quote = event.target.closest("[data-symbol]");
      if (quote && this.content.contains(quote)) {
        event.preventDefault();
        this.selectSymbol(quote.dataset.symbol);
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
      // The quote area is also the drag handle, so the click that ends a drag is not a choice.
      if (this.suppressSceneClick) return;
      if (event.target.closest("[data-scene-advance]")) {
        this.cycleSymbol(1);
        return;
      }
      const quote = event.target.closest("[data-symbol]");
      if (quote) this.selectSymbol(quote.dataset.symbol);
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
    if (field === "search") this.searchQuery = event.target.value;
  }

  onChange(event) {
    const field = event.target.dataset?.field;
    if (field === "view") this.commitView(event.target.value);
    if (event.target.dataset?.group === "source") this.toggleSource(event.target.dataset.source, event.target.checked);
    if (field === "symbol") this.selectSymbol(event.target.value);
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
        refresh: () => this.refreshMarket({ progress: true }),
        settings: () => this.showSettings("general"),
        fonts: () => this.showSettings("font"),
        about: () => this.showAbout(),
        "show-window": () => {},
        minimize: () => this.minimizeWindow(),
        maximize: () => this.toggleMaximize(),
        close: () => this.requestClose(),
        exit: () => this.requestClose(),
        "tab-prev": () => this.nudgeTabs(-1),
        "tab-next": () => this.nudgeTabs(1),
        "add-tab": () => this.addTab(),
        "close-tab": () => this.closeTab(),
        "search-online": () => this.searchOnline(),
        download: () => this.downloadMarket(),
        "open-link": () => this.openSourceLink(),
        "choose-wallpaper": () => this.chooseWallpaper(),
        "clear-wallpaper": () => this.setWallpaper("", ""),
        "zoom-in": () => this.setZoom(this.settings.zoom + 10),
        "zoom-out": () => this.setZoom(this.settings.zoom - 10),
        "zoom-reset": () => this.setZoom(100),
        stocks: () => this.showPanel("stocks"),
        rates: () => this.showPanel("rates"),
        news: () => this.showPanel("news"),
        "clear-recent": () => this.clearRecent(),
        "toggle-favorite": () => this.toggleFavorite(),
        "next-symbol": () => this.cycleSymbol(1),
        "remove-symbol": () => this.removeSymbol(this.currentTab()?.selectedSymbol),
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
    this.applyTitleRoom();
    this.applySceneScale();
  }

  /**
   * Below a certain width the program name steps aside and only the icon stays.
   * The window's own width is the measure; the shell's border would lose two
   * pixels and hide the name one pixel early.
   */
  applyTitleRoom() {
    if (!this.frame) return;
    const measured = this.platform.nativeWindow ? this.frame.clientWidth || 0 : 0;
    const width = measured > 0 ? measured : this.shellSize.width;
    this.frame.dataset.titleText = showsTitleText(width) ? "shown" : "hidden";
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
      this.renderTabs();
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
    this.syncBoardWindow();
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
    this.renderTabs();
    this.renderMarket();
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
    this.platform.broadcastTheme?.({ vars, mode: colors.mode, theme, customTheme: custom, transparency });
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

  applyWallpaper(opacity = this.settings.backgroundOpacity) {
    const savedImage = this.settings.backgroundImage || "";
    const image = this.wallpaperImagePreview != null ? this.wallpaperImagePreview : savedImage;
    const value = clamp(opacity, 0, 100);
    paintWallpaper(this.wallpaper, image, value);
    document.querySelectorAll('[data-popup="panel"] [data-gui="wallpaper"]').forEach((layer) => paintWallpaper(layer, image, value));
    const key = `${image}\n${value}`;
    if (key === this.wallpaperBroadcast) return;
    this.wallpaperBroadcast = key;
    this.platform.broadcastWallpaper?.({ image, opacity: value });
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

  renderMarket() {
    const tab = this.currentTab();
    this.content.innerHTML = renderMarketHtml({
      tab,
      language: this.settings.language,
      units: this.settings.units,
      baseCurrency: this.settings.baseCurrency,
      priority: this.settings.displayPriority,
      mode: this.settings.sceneMode,
      today: this.now(),
      t: (key, vars) => this.t(key, vars),
    });
    this.content.dataset.sceneMode = this.settings.sceneMode;
    this.applySceneScale();
    this.syncBoardWindow();
  }

  /** A click that ends a window drag must not also count as "next symbol". */
  noteSceneDrag() {
    this.suppressSceneClick = true;
    clearTimeout(this.sceneDragTimer);
    this.sceneDragTimer = setTimeout(() => {
      this.suppressSceneClick = false;
    }, 150);
  }

  /** Move to the next watched symbol, wrapping round. */
  cycleSymbol(delta = 1) {
    const tab = this.currentTab();
    const symbols = (tab?.board?.symbols || []).map((entry) => entry.symbol);
    if (symbols.length < 2) return symbols[0] || "";
    const at = symbols.indexOf(tab.selectedSymbol || tab.board.activeSymbol);
    const from = at < 0 ? 0 : at;
    const next = symbols[(((from + delta) % symbols.length) + symbols.length) % symbols.length];
    this.selectSymbol(next);
    return next;
  }

  syncRotateTimer() {
    clearInterval(this.rotateTimer);
    this.rotateTimer = null;
    this.rotateDelay = 0;
    if (this.destroyed) return;
    const seconds = normalizeRotateSeconds(this.settings.rotateSeconds);
    if (!seconds || this.settings.sceneMode !== "single") return;
    this.rotateDelay = seconds * 1000;
    this.rotateTimer = setInterval(() => this.cycleSymbol(1), this.rotateDelay);
  }

  /**
   * The whole-watchlist window is exactly as tall as its rows. Leaving that
   * mode gives the window its previous size back instead of a tall sliver.
   */
  syncBoardWindow({ force = false } = {}) {
    if (this.destroyed || !this.placementReady) return;
    if (this.settings.sceneMode !== "all") {
      const previous = this.sizeBeforeBoard;
      this.boardRows = null;
      this.sizeBeforeBoard = null;
      if (previous) this.resizeShell(previous);
      return;
    }
    if (this.maximized || this.minimized) return;
    const rows = boardRowCount(this.currentTab());
    if (!force && this.boardRows === rows) return;
    if (this.boardRows == null) this.sizeBeforeBoard = { ...this.shellSize };
    this.boardRows = rows;
    this.resizeShell(boardWindowSize(rows, this.shellSize.width));
  }

  resizeShell(size) {
    const next = clampWindowSize(size);
    if (next.width === this.shellSize.width && next.height === this.shellSize.height) return;
    if (this.platform.nativeWindow) {
      void Promise.resolve(this.platform.resizeWindowTo?.(next)).then((bounds) => {
        this.shellSize = clampWindowSize(bounds || next);
        this.rememberWindowPlacement(bounds || next);
      });
      return;
    }
    this.shellSize = next;
    this.applyShellSize();
    this.rememberWindowPlacement({ ...next, x: this.shellOffset.x, y: this.shellOffset.y });
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
    this.root.querySelectorAll("[data-group='source']").forEach((box) => {
      box.checked = this.settings.enabledSources.includes(box.dataset.source);
    });
    this.setValue("#prop-label", tab.properties.label);
    const favorite = this.root.querySelector("#prop-favorite");
    if (favorite) favorite.checked = Boolean(tab.properties.favorite);
    this.setValue("#prop-market", displayMarket(tab.board, this.settings.language));
    this.setValue("#prop-country", displayCountry(tab.board, this.settings.language));
    this.setValue("#prop-alert-high", tab.properties.alertHigh);
    this.setValue("#prop-alert-low", tab.properties.alertLow);
    this.setValue("#prop-summary", this.selectionText);
  }

  setValue(selector, value) {
    const node = this.root.querySelector(selector);
    if (node && document.activeElement !== node) node.value = value ?? "";
  }

  afterStructure() {
    this.renderTabs();
    this.syncPanels();
    this.renderMarket();
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
    this.wallpaperImagePreview = dataUrl || "";
    this.applyWallpaper(this.wallpaperOpacityPreview ?? this.settings.backgroundOpacity);
    await this.persist();
  }

  showPanel(panel) {
    const tab = this.currentTab();
    const t = (key, vars) => this.t(key, vars);
    const markup = renderPanelHtml({
      panel,
      tab,
      language: this.settings.language,
      units: this.settings.units,
      baseCurrency: this.settings.baseCurrency,
      currencies: this.settings.rateCurrencies,
      priority: this.settings.displayPriority,
      today: this.now(),
      t,
    });
    return this.openPopup(
      buildPanelSpec({
        panel,
        markup,
        fitHeight: panelFitHeight(panel, panelRowCount(panel, { ...tab, rateCurrencies: this.settings.rateCurrencies })),
        transparency: this.settings.transparency,
        backgroundImage: this.settings.backgroundImage,
        backgroundOpacity: this.wallpaperOpacityPreview ?? this.settings.backgroundOpacity,
        t,
      }),
      {
        immediate: (msg) => {
          if (msg?.type === "open-news") return this.openNews(msg.url);
          if (msg?.type !== "select-symbol") return null;
          this.selectSymbol(msg.symbol);
          if (msg.clientX == null) return null;
          this.openMenu("context", { clientX: msg.clientX, clientY: msg.clientY }, { atPointer: true });
          return null;
        },
      },
    );
  }

  async openNews(url) {
    if (!url) return null;
    await this.platform.openExternal(url);
    return null;
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
    this.renderMarket();
    this.syncPanels();
  }

  setBoard(tabId, board) {
    const tab = this.doc.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    tab.board = createBoard(board);
    if (!tab.board.symbols.some((entry) => entry.symbol === tab.selectedSymbol)) tab.selectedSymbol = tab.board.activeSymbol || "";
    this.syncPanels();
    this.renderTabs();
    this.renderMarket();
    this.renderStatus();
  }

  /** Switch the board to another market, keeping only that market's symbols. */
  applyMarket(marketCode) {
    const tab = this.currentTab();
    const market = findMarket(marketCode);
    if (!tab || !market || tab.board.marketCode === market.marketCode) return false;
    const prev = { ...tab.board, symbols: tab.board.symbols.map((entry) => ({ ...entry })) };
    const kept = tab.board.symbols.filter((entry) => entry.marketCode === market.marketCode);
    const fallback = kept.length ? kept : filterListings(this.listingChoices(), market.marketCode, "").slice(0, 3);
    const next = createBoard({
      ...market,
      baseCurrency: this.settings.baseCurrency,
      symbols: fallback,
      activeSymbol: fallback[0]?.symbol || "",
    });
    this.pushUndo({
      undo: () => this.setBoard(tab.id, prev),
      redo: () => this.setBoard(tab.id, next),
    });
    this.setBoard(tab.id, next);
    this.markDirty();
    this.setStatus(this.t("msg.applied"));
    this.refreshSoon();
    return true;
  }

  /** Add one listing to the watchlist. Returns the message key the caller reports. */
  addSymbol(symbol) {
    const tab = this.currentTab();
    if (!tab || !symbol) return "none";
    if (tab.board.symbols.some((entry) => entry.symbol === symbol)) {
      this.setStatus(this.t("msg.symbolExists"));
      return "exists";
    }
    if (tab.board.symbols.length >= MAX_SYMBOLS) {
      this.setStatus(this.t("msg.symbolFull", { n: MAX_SYMBOLS }));
      return "full";
    }
    const listing = findListing(this.listingChoices(), symbol);
    if (!listing) return "none";
    const prev = { ...tab.board, symbols: tab.board.symbols.map((entry) => ({ ...entry })) };
    const next = withSymbol(prev, listing);
    this.pushUndo({
      undo: () => this.setBoard(tab.id, prev),
      redo: () => this.setBoard(tab.id, next),
    });
    this.setBoard(tab.id, next);
    this.markDirty();
    this.setStatus(this.t("msg.symbolAdded", { n: listingName(listing, this.settings.language) }));
    this.refreshSoon();
    return "added";
  }

  removeSymbol(symbol) {
    const tab = this.currentTab();
    if (!tab || !symbol) return "none";
    if (!tab.board.symbols.some((entry) => entry.symbol === symbol)) return "none";
    if (tab.board.symbols.length <= 1) {
      this.setStatus(this.t("msg.lastSymbol"));
      return "last";
    }
    const listing = tab.board.symbols.find((entry) => entry.symbol === symbol);
    const prev = { ...tab.board, symbols: tab.board.symbols.map((entry) => ({ ...entry })) };
    const next = withoutSymbol(prev, symbol);
    this.pushUndo({
      undo: () => this.setBoard(tab.id, prev),
      redo: () => this.setBoard(tab.id, next),
    });
    this.setBoard(tab.id, next);
    if (tab.data) tab.data = { ...tab.data, quotes: (tab.data.quotes || []).filter((quote) => quote.symbol !== symbol) };
    this.markDirty();
    this.afterStructure();
    this.setStatus(this.t("msg.symbolRemoved", { n: listingName(listing, this.settings.language) }));
    return "removed";
  }

  /** The chosen currencies, plus the board's own so a converted price still works. */
  fetchCurrencies(tab) {
    const wanted = new Set(this.settings.rateCurrencies);
    for (const code of [tab?.board?.currency, this.settings.baseCurrency]) {
      if (code && code !== this.settings.baseCurrency) wanted.add(code);
    }
    return [...wanted].filter((code) => CURRENCIES.includes(code));
  }

  addCurrency(code) {
    const want = String(code || "").toUpperCase();
    if (!CURRENCIES.includes(want)) return "none";
    if (want === this.settings.baseCurrency) {
      this.setStatus(this.t("msg.currencyBase"));
      return "base";
    }
    if (this.settings.rateCurrencies.includes(want)) {
      this.setStatus(this.t("msg.currencyExists"));
      return "exists";
    }
    if (this.settings.rateCurrencies.length >= MAX_RATE_CURRENCIES) {
      this.setStatus(this.t("msg.currencyFull", { n: MAX_RATE_CURRENCIES }));
      return "full";
    }
    const before = [...this.settings.rateCurrencies];
    const after = [...before, want];
    this.pushUndo({
      undo: () => this.setRateCurrencies(before),
      redo: () => this.setRateCurrencies(after),
    });
    this.setRateCurrencies(after);
    this.setStatus(this.t("msg.currencyAdded", { n: currencyName(want, this.settings.language) }));
    this.refreshSoon();
    return "added";
  }

  removeCurrency(code) {
    const want = String(code || "").toUpperCase();
    if (!this.settings.rateCurrencies.includes(want)) return "none";
    const before = [...this.settings.rateCurrencies];
    const after = before.filter((entry) => entry !== want);
    this.pushUndo({
      undo: () => this.setRateCurrencies(before),
      redo: () => this.setRateCurrencies(after),
    });
    this.setRateCurrencies(after);
    this.setStatus(this.t("msg.currencyRemoved", { n: currencyName(want, this.settings.language) }));
    return "removed";
  }

  setRateCurrencies(list) {
    this.settings.rateCurrencies = normalizeRateCurrencies(list, this.settings.baseCurrency);
    void this.persist();
  }

  rateListRows() {
    return this.settings.rateCurrencies.map((code) => ({ symbol: code, name: currencyName(code, this.settings.language) }));
  }

  /** Currencies still free to add, for the Settings picker. */
  addableCurrencies(base = this.settings.baseCurrency) {
    const listed = new Set(this.settings.rateCurrencies);
    return CURRENCIES.filter((code) => code !== base && !listed.has(code)).map((code) => ({
      value: code,
      label: `${code} · ${currencyName(code, this.settings.language)}`,
    }));
  }

  watchlistRows() {
    const tab = this.currentTab();
    return (tab?.board?.symbols || []).map((entry) => ({ symbol: entry.symbol, name: listingName(entry, this.settings.language) }));
  }

  commitProp(field, value, before) {
    const tab = this.currentTab();
    if (!tab) return;
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

  setProp(tabId, field, value) {
    const tab = this.doc.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    tab.properties[field] = value;
    this.syncPanels();
    this.renderTabs();
    this.renderMarket();
  }

  toggleFavorite() {
    const tab = this.currentTab();
    this.commitProp("favorite", !tab.properties.favorite, tab.properties.favorite);
  }

  selectSymbol(symbol) {
    const tab = this.currentTab();
    if (!tab) return;
    tab.selectedSymbol = symbol || "";
    const quote = activeQuote(tab.data, symbol);
    const listing = tab.board.symbols.find((entry) => entry.symbol === symbol);
    const name = listing ? listingName(listing, this.settings.language) : symbol || displayMarket(tab.board, this.settings.language);
    this.selectionText =
      quote && quote.symbol === symbol
        ? `${name} ${quote.symbol} ${formatPrice(quote.last, quote.currency, this.settings.language)} ${quote.currency} ${formatSigned(quote.change, quote.currency, this.settings.language)} ${formatPercent(quote.changePercent)} ${trendText(quote.trend, this.settings.language)}`
        : name;
    this.renderMarket();
    this.syncPanels();
    this.renderStatus();
  }

  addTab() {
    const tab = createTab(this.settings.defaultBoard);
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

  updateIntervalMs() {
    return this.settings.updateHours * 60 * 60 * 1000;
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
      void this.refreshMarket({ quiet: true, all: true }).finally(() => {
        if (!this.destroyed) this.armUpdateTimer();
      });
    }, this.updateDelay);
  }

  /**
   * Re-fetch after the board changed, even if a quiet refresh is already
   * running. A burst of edits - a market swap, then three added symbols -
   * collapses into one fetch.
   */
  refreshSoon() {
    clearTimeout(this.refreshSoonTimer);
    this.refreshSoonTimer = setTimeout(() => {
      this.refreshSoonTimer = null;
      if (!this.destroyed) void this.refreshMarket({ quiet: true, force: true });
    }, 60);
  }

  async refreshMarket({ quiet = false, progress = false, all = false, force = false } = {}) {
    if (quiet && this.refreshJob && !force) return;
    const generation = (this.refreshGeneration || 0) + 1;
    this.refreshGeneration = generation;
    this.marketAbort?.abort();
    this.marketAbort = new AbortController();
    const signal = this.marketAbort.signal;
    if (progress) {
      this.progressAborted = false;
      this.operationAbort = this.marketAbort;
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
        const data = await loadBoard(
          { ...tab.board, baseCurrency: this.settings.baseCurrency, currencies: this.fetchCurrencies(tab) },
          {
            fetchImpl: (url, options) => this.platform.fetch(url, options),
            sources: this.settings.enabledSources,
            language: this.settings.language,
            signal,
            onProgress: report ? (percent, id) => report(percent, this.t(`source.${id}`)) : undefined,
          },
        );
        if (signal.aborted || this.destroyed || this.progressAborted) break;
        data.fetchedAt = new Date().toISOString();
        tab.data = data;
        if (tab.id === this.currentTab()?.id) {
          this.selectSymbol(tab.selectedSymbol || this.preferredSymbol(tab, data));
        }
      } catch (error) {
        if (error?.name === "AbortError" || signal.aborted || this.progressAborted) break;
        failed = error;
        if (!quiet) break;
      }
    }
    if (this.destroyed) return;
    if (signal.aborted || this.progressAborted) {
      // Only a refresh the reader cancelled is worth saying out loud; one
      // replaced by a newer fetch should leave the last numbers alone.
      if (this.progressAborted) this.setStatus(this.t("status.cancelled"));
      return;
    }
    this.setStatus(this.t("status.ready"));
    if (failed && !quiet) throw failed;
  }

  preferredSymbol(tab, data) {
    const wanted = tab.board.activeSymbol;
    const quotes = data?.quotes || [];
    if (quotes.some((quote) => quote.symbol === wanted)) return wanted;
    return quotes[0]?.symbol || wanted || "";
  }

  async searchOnline(query) {
    const field = this.root.querySelector("#search-input") || document.querySelector('[data-popup="settings"] [data-field="search"]');
    const typed = String(query ?? field?.value ?? this.searchQuery ?? "").trim();
    const q = typed || this.currentTab().board.activeSymbol;
    await this.withProgress("progress.search", async (report) => {
      report(30, q);
      const rows = await searchSymbols(q, { fetchImpl: (url, options) => this.platform.fetch(url, options) });
      report(100, this.t("progress.done"));
      const usable = rows.filter((row) => findMarket(marketCodeOf(row.symbol)));
      if (!usable.length) throw new AppError(this.t("msg.noResults"), q, "SEARCH");
      const listings = usable.map((row) => ({ ...row, marketCode: marketCodeOf(row.symbol) }));
      for (const listing of listings) {
        if (!findListing(this.listingChoices(), listing.symbol)) this.extraListings.push(listing);
      }
      this.listingDraft = { ...listings[0] };
      this.searchQuery = "";
    });
  }

  async downloadMarket() {
    const tab = this.currentTab();
    if (!tab.data) throw new AppError(this.t("msg.noData"), displayMarket(tab.board, this.settings.language), "NO_DATA");
    const text = JSON.stringify(tab.data, null, 2);
    await this.withProgress("progress.download", async (report) => {
      report(25, this.t("progress.prepare"));
      const saved = await this.platform.saveFile({
        startDir: this.settings.lastDirectory,
        suggestedName: `${displayMarket(tab.board, this.settings.language)}.json`,
        text,
      });
      report(100, this.t("progress.done"));
      if (saved?.directory) this.rememberDir(saved.directory);
      return saved;
    });
  }

  async openSourceLink() {
    const tab = this.currentTab();
    const url = sourcePageUrl(tab.selectedSymbol || tab.board.activeSymbol);
    await this.withProgress("progress.link", async (report) => {
      report(40, url);
      await this.platform.openExternal(url);
      report(100, this.t("progress.done"));
    });
  }

  async newDocument() {
    if (!(await this.ensureSaved())) return false;
    this.doc = createDocument(this.settings.defaultBoard);
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

  async openPrint() {
    const days = this.currentTab().data?.quotes?.[0]?.days || [];
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
    const board = this.currentTab()?.board || this.settings.defaultBoard;
    const spec = buildSettingsSpec({
      t: (key, vars) => this.t(key, vars),
      language: this.settings.language,
      fonts: this.fonts,
      recent: this.recent.toJSON(),
      catalog: this.listingChoices(),
      markets: this.marketChoices(),
      activeTab,
      values: {
        language: this.settings.language,
        units: this.settings.units,
        baseCurrency: this.settings.baseCurrency,
        rateCurrencies: [...this.settings.rateCurrencies],
        updateHours: this.settings.updateHours,
        displayPriority: this.settings.displayPriority,
        sceneMode: this.settings.sceneMode,
        rotateSeconds: this.settings.rotateSeconds,
        marketCode: board.marketCode,
        symbol: board.activeSymbol || filterListings(this.listingChoices(), board.marketCode, "")[0]?.symbol || "",
        watchlist: this.watchlistRows(),
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
        sourceStatus: Object.fromEntries((this.currentTab()?.data?.sources || []).map((source) => [source.id, source])),
        lastDirectory: this.settings.lastDirectory,
      },
    });
    const answer = await this.openPopup(spec, { immediate: (msg) => this.handlePopupImmediate(msg) });
    if (answer?.action === "focused") return answer;
    if (answer?.action === "ok") await this.applySettingsForm(answer.values);
    this.wallpaperOpacityPreview = null;
    this.wallpaperImagePreview = null;
    this.applyTheme();
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
    const boardBefore = tab ? structuredClone(tab.board) : null;
    this.settings.language = values.language === "en" ? "en" : "ko";
    this.settings.units = values.units === "base" ? "base" : "native";
    this.settings.baseCurrency = normalizeCurrency(values.baseCurrency);
    this.settings.rateCurrencies = normalizeRateCurrencies(this.settings.rateCurrencies, this.settings.baseCurrency);
    this.settings.updateHours = normalizeUpdateHours(values.updateHours);
    this.settings.displayPriority = normalizeDisplayPriority(values.displayPriority);
    this.settings.sceneMode = normalizeSceneMode(values.sceneMode);
    this.settings.rotateSeconds = normalizeRotateSeconds(values.rotateSeconds);
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
    if (values.backgroundOpacity != null && values.backgroundOpacity !== "") this.settings.backgroundOpacity = clamp(values.backgroundOpacity, 0, 100);
    if (values.wallpaperEdited === "1") {
      this.settings.backgroundImage = values.backgroundImage || "";
      this.settings.backgroundName = values.backgroundName || "";
    }
    if (values.fontFamily) this.settings.fontFamily = values.fontFamily;
    this.settings.fontSize = clamp(values.fontSize, 8, 72);
    this.settings.fontStyle = FONT_STYLES.includes(values.fontStyle) ? values.fontStyle : "normal";
    this.settings.reopenLast = Boolean(values.reopen);
    if (values.sources) {
      const nextSources = Object.entries(values.sources).filter(([, on]) => on).map(([id]) => id);
      if (nextSources.length) this.settings.enabledSources = nextSources;
    }
    const market = findMarket(values.marketCode);
    let boardAfter = boardBefore;
    if (market && boardBefore) {
      const sameMarket = boardBefore.marketCode === market.marketCode;
      const kept = sameMarket ? boardBefore.symbols : boardBefore.symbols.filter((entry) => entry.marketCode === market.marketCode);
      const symbols = kept.length ? kept : filterListings(this.listingChoices(), market.marketCode, "").slice(0, 3);
      boardAfter = createBoard({
        ...market,
        baseCurrency: this.settings.baseCurrency,
        symbols,
        activeSymbol: symbols.some((entry) => entry.symbol === boardBefore.activeSymbol) ? boardBefore.activeSymbol : symbols[0]?.symbol || "",
      });
      this.settings.defaultBoard = structuredClone(boardAfter);
    }
    const after = structuredClone(this.settings);
    this.pushUndo({
      undo: () => {
        this.replaceSettings(before);
        if (tab && boardBefore) this.setBoard(tab.id, boardBefore);
      },
      redo: () => {
        this.replaceSettings(after);
        if (tab && boardAfter) this.setBoard(tab.id, boardAfter);
      },
    });
    this.replaceSettings(after);
    if (tab && boardAfter) this.setBoard(tab.id, boardAfter);
    await this.persist();
  }

  replaceSettings(next) {
    this.settings = sanitizeSettings(structuredClone(next));
    this.recent.load(this.settings.recentFiles);
    this.applyAll();
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
    if (msg.type === "add-symbol") {
      if (msg.marketCode) this.applyMarket(msg.marketCode);
      this.addSymbol(msg.symbol);
      return { watchlist: this.watchlistRows(), marketCode: this.currentTab()?.board.marketCode, catalog: this.listingChoices() };
    }
    if (msg.type === "symbol-remove") {
      this.removeSymbol(msg.symbol);
      return { watchlist: this.watchlistRows() };
    }
    if (msg.type === "add-currency") {
      this.addCurrency(msg.code);
      return { rateList: this.rateListRows(), currencyOptions: this.addableCurrencies() };
    }
    if (msg.type === "currency-remove") {
      this.removeCurrency(msg.symbol);
      return { rateList: this.rateListRows(), currencyOptions: this.addableCurrencies() };
    }
    if (msg.type === "base-currency") {
      const base = normalizeCurrency(msg.base);
      this.setRateCurrencies(this.settings.rateCurrencies.filter((code) => code !== base));
      return { rateList: this.rateListRows(), currencyOptions: this.addableCurrencies(base) };
    }
    if (msg.type === "open-news") return this.openNews(msg.url);
    if (msg.type === "search-online") {
      await this.searchOnline(msg.query);
      const listing = this.listingDraft;
      if (!listing) return null;
      return {
        markets: this.marketChoices(),
        catalog: this.listingChoices(),
        marketCode: listing.marketCode,
        symbol: listing.symbol,
      };
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
      canRemoveSymbol: (this.currentTab()?.board.symbols || []).length > 1,
      canCycle: (this.currentTab()?.board.symbols || []).length > 1,
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

/** Yahoo suffix back to a market code, so a searched symbol lands in the right market. */
function marketCodeOf(symbol) {
  const text = String(symbol || "");
  const dot = text.lastIndexOf(".");
  const suffix = dot > 0 ? text.slice(dot) : "";
  const market = MARKETS.find((entry) => entry.suffix === suffix);
  return market ? market.marketCode : "US";
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
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

(function () {
  const BUILD = window.MYMERGE_BUILD;
  const metrics = window.MyMergeMetrics;
  const Merge = window.MergeEngine;
  const Session = window.MyMergeSession;
  const Fonts = window.MyMergeFonts;
  const Git = window.MyMergeGit;
  const Print = window.MyMergePrint;
  const Themes = window.MyMergeThemes;
  const I18n = window.MyMergeI18n;
  const Icons = window.MyMergeIcons;
  const Store = window.MyMergeStore;
  const Sample = window.MyMergeSample;
  const TEST = new URLSearchParams(location.search).get("test") === "1";
  const GUIDE_URL = "https://localhost/mymerge/USERSGUIDE.md";

  let settings = Store.defaults();
  let docs = [];
  let active = 0;
  let conflictIndex = 0;
  let nextId = 1;
  let undoStack = [];
  let redoStack = [];
  let clipboard = "";
  let typing = false;
  let git = { root: "", branch: "", conflicts: [] };
  let lastError = "";
  let lastSaved = null;
  let lastDownload = null;
  let lastLink = "";
  let lastPrint = null;
  let progressMarks = [];
  let popupEl = null;
  let menuEl = null;
  let appClosed = false;
  let fontCatalog = Fonts.FALLBACK.slice();
  let pendingDrop = null;
  let launchMode = "standalone";
  let printState = Object.assign({}, settings.print, { pageIndex: 0 });
  let bgObjectUrl = "";
  let settingsTab = "general";

  const $ = (id) => document.getElementById(id);
  const t = (key) => I18n.translate(settings.language, key);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));

  function current() { return docs[active] || docs[0]; }

  function clamp(value, min, max) {
    const number = Number(value);
    if (Number.isNaN(number)) return min;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function idb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("mymerge", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbPut(key, value) {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function idbGet(key) {
    const db = await idb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const request = tx.objectStore("files").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value;
  }

  async function idbDelete(key) {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function saveSettings() {
    try { Store.save(localStorage, settings); }
    catch (error) { showError(error); }
  }

  function cssFamily(name) {
    const clean = String(name || "Consolas").replace(/["\\]/g, "");
    return '"' + clean + '", sans-serif';
  }

  function applyVisual() {
    const theme = Themes.byId(settings.theme, settings.custom);
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    root.dataset.mode = theme.mode;
    root.style.colorScheme = theme.mode === "light" ? "light" : "dark";
    root.lang = settings.language === "en" ? "en" : "ko";
    Object.entries(theme.vars).forEach(([key, value]) => root.style.setProperty(key, value));
    root.style.setProperty("--editor-font", cssFamily(settings.fontFamily));
    root.style.setProperty("--editor-size", settings.fontSize + "px");
    root.style.setProperty("--editor-weight", String(settings.fontStyle).indexOf("bold") >= 0 ? "700" : "400");
    root.style.setProperty("--editor-style", String(settings.fontStyle).indexOf("italic") >= 0 ? "italic" : "normal");
    root.style.setProperty("--zoom", String(settings.zoom / 100));
    root.style.setProperty("--code-line", Math.max(14, Math.round(settings.fontSize * (settings.zoom / 100) * 1.6)) + "px");
    root.style.setProperty("--workspace-image-opacity", String((settings.backgroundOpacity || 0) / 100));
    applyLayout();
    document.title = BUILD.title;
    const title = $("appTitle");
    if (title) title.textContent = BUILD.title;
  }

  function layout() {
    if (!settings.layout) settings.layout = { left: 240, right: 260, result: 0, srcA: 0, srcB: 0 };
    return settings.layout;
  }

  function applyLayout() {
    const root = document.documentElement;
    const box = layout();
    root.style.setProperty("--left", Math.max(160, box.left || 240) + "px");
    root.style.setProperty("--right", Math.max(160, box.right || 260) + "px");
    root.style.setProperty("--result", box.result > 0 ? box.result + "px" : "38%");
    root.style.setProperty("--src-a", box.srcA > 0 ? box.srcA + "px" : "1fr");
    root.style.setProperty("--src-b", box.srcB > 0 ? box.srcB + "px" : "1fr");
  }

  function bindSplitters() {
    const root = document.documentElement;
    const panes = ["paneBase", "paneLocal", "paneRemote"].map((id) => $(id));
    const bars = {
      splitLeft: (event) => {
        const left = document.querySelector(".body").getBoundingClientRect().left;
        const value = clamp(event.clientX - left, 160, 520);
        layout().left = value;
        root.style.setProperty("--left", value + "px");
      },
      splitRight: (event) => {
        const right = document.querySelector(".body").getBoundingClientRect().right;
        const value = clamp(right - event.clientX, 160, 520);
        layout().right = value;
        root.style.setProperty("--right", value + "px");
      },
      splitPaneA: (event) => {
        const box = document.querySelector(".sources").getBoundingClientRect();
        const value = clamp(event.clientX - box.left, 120, box.width - 260);
        layout().srcA = value;
        root.style.setProperty("--src-a", value + "px");
      },
      splitPaneB: (event) => {
        const box = document.querySelector(".sources").getBoundingClientRect();
        const start = box.left + (layout().srcA || panes[0].offsetWidth) + 4;
        const value = clamp(event.clientX - start, 120, box.width - (layout().srcA || panes[0].offsetWidth) - 140);
        layout().srcB = value;
        root.style.setProperty("--src-b", value + "px");
      },
      splitResult: (event) => {
        const box = document.querySelector(".center").getBoundingClientRect();
        const value = clamp(box.bottom - event.clientY, 120, box.height - 200);
        layout().result = value;
        root.style.setProperty("--result", value + "px");
      },
    };
    Object.keys(bars).forEach((id) => {
      const bar = $(id);
      if (!bar) return;
      bar.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (id === "splitPaneA" || id === "splitPaneB") {
          if (!layout().srcA) { layout().srcA = panes[0].offsetWidth; root.style.setProperty("--src-a", layout().srcA + "px"); }
          if (!layout().srcB) { layout().srcB = panes[1].offsetWidth; root.style.setProperty("--src-b", layout().srcB + "px"); }
        }
        bar.classList.add("dragging");
        try { bar.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
        const move = (motion) => bars[id](motion);
        const stop = () => {
          bar.classList.remove("dragging");
          bar.removeEventListener("pointermove", move);
          bar.removeEventListener("pointerup", stop);
          bar.removeEventListener("pointercancel", stop);
          saveSettings();
          syncResultScroll();
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", stop);
        bar.addEventListener("pointercancel", stop);
      });
      bar.addEventListener("dblclick", () => {
        const box = layout();
        if (id === "splitLeft") box.left = 240;
        else if (id === "splitRight") box.right = 260;
        else if (id === "splitResult") box.result = 0;
        else { box.srcA = 0; box.srcB = 0; }
        applyLayout();
        saveSettings();
      });
    });
  }

  function docFromTexts(source) {
    const merged = Merge.merge3(source.baseText, source.localText, source.remoteText, source.labels);
    const conflicts = Merge.parseConflicts(merged.text).conflicts.length;
    return {
      id: source.id || ("doc-" + (nextId++)),
      name: source.name || "untitled",
      baseText: source.baseText || "",
      localText: source.localText || "",
      remoteText: source.remoteText || "",
      resultText: source.resultText == null ? merged.text : source.resultText,
      basePath: source.basePath || "",
      localPath: source.localPath || "",
      remotePath: source.remotePath || "",
      mergedPath: source.mergedPath || "",
      encoding: source.encoding || "UTF-8",
      eol: source.eol || "LF",
      labels: Object.assign({ base: "BASE", local: "LOCAL", remote: "REMOTE" }, source.labels || {}),
      dirty: Boolean(source.dirty),
      initialConflicts: source.initialConflicts == null ? conflicts : source.initialConflicts,
      resolved: source.resolved || 0,
    };
  }

  function sidesFromMarkers(text) {
    const parsed = Merge.parseConflicts(text);
    const base = [];
    const local = [];
    const remote = [];
    parsed.parts.forEach((part) => {
      if (part.type === "text") {
        base.push.apply(base, part.lines);
        local.push.apply(local, part.lines);
        remote.push.apply(remote, part.lines);
      } else {
        base.push.apply(base, part.conflict.base);
        local.push.apply(local, part.conflict.local);
        remote.push.apply(remote, part.conflict.remote);
      }
    });
    return {
      baseText: Merge.joinLines(base, parsed.trailing),
      localText: Merge.joinLines(local, parsed.trailing),
      remoteText: Merge.joinLines(remote, parsed.trailing),
      resultText: String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
    };
  }

  function capture() {
    return JSON.stringify({ active: active, conflictIndex: conflictIndex, docs: docs });
  }

  function pushUndo() {
    undoStack.push(capture());
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }

  function restore(raw) {
    const data = JSON.parse(raw);
    docs = data.docs;
    active = data.active;
    conflictIndex = data.conflictIndex || 0;
    renderAll();
  }

  function conflictsOf(doc) {
    return Merge.parseConflicts(doc ? doc.resultText : "").conflicts;
  }

  function button(action, icon, label, extra) {
    return '<button type="button" class="tool-btn" data-action="' + action + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + Icons.icon(icon) + (extra || "") + "</button>";
  }

  function renderToolbar() {
    const zoomTip = t("view.zoomReset");
    $("toolbar").innerHTML = [
      button("new", "new", t("file.new")),
      button("open", "open", t("file.open")),
      button("save", "save", t("file.save")),
      button("saveAs", "saveAs", t("file.saveAs")),
      '<i class="sep"></i>',
      button("undo", "undo", t("edit.undo")),
      button("redo", "redo", t("edit.redo")),
      '<i class="sep"></i>',
      button("cut", "cut", t("edit.cut")),
      button("copy", "copy", t("edit.copy")),
      button("paste", "paste", t("edit.paste")),
      '<i class="sep"></i>',
      button("takeBase", "base", t("merge.takeBase")),
      button("takeLocal", "local", t("merge.takeLocal")),
      button("takeRemote", "remote", t("merge.takeRemote")),
      button("takeBoth", "both", t("merge.takeBoth")),
      button("prevConflict", "prev", t("merge.prev")),
      button("nextConflict", "next", t("merge.next")),
      '<i class="sep"></i>',
      button("zoomOut", "zoomOut", t("view.zoomOut")),
      '<button type="button" class="tool-btn zoom-readout" data-action="zoomReset" id="zoomValue" title="' + esc(zoomTip) + '">' + settings.zoom + "%</button>",
      button("zoomIn", "zoomIn", t("view.zoomIn")),
      '<i class="sep"></i>',
      button("git", "git", t("file.openRepo")),
      button("print", "print", t("file.print")),
      '<i class="sep"></i>',
      button("toggleLeft", "panelLeft", t("view.left")),
      button("toggleRight", "panelRight", t("view.right")),
      '<span class="toolbar-end">' + toolbarActions().map(toolActionButton).join("") + "</span>",
    ].join("");
    updateHistoryButtons();
  }

  function languageButton() {
    const toEnglish = settings.language !== "en";
    const label = toEnglish ? "English" : "한국어";
    const code = toEnglish ? "uk" : "kr";
    const tip = t("view.language") + ": " + label;
    return '<button type="button" class="tool-btn lang-btn" data-action="language" data-flag="' + code + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
      Icons.flag(code) + '<span class="lang-label">' + esc(label) + "</span></button>";
  }

  function updateHistoryButtons() {
    document.querySelectorAll('[data-action="undo"]').forEach((el) => { el.disabled = undoStack.length === 0; });
    document.querySelectorAll('[data-action="redo"]').forEach((el) => { el.disabled = redoStack.length === 0; });
  }

  function menuItem(action, icon, label, shortcut, disabled) {
    return { action: action, icon: icon, label: label, shortcut: shortcut || "", disabled: Boolean(disabled) };
  }

  function menuDefinitions() {
    const recent = (settings.recent || []).map((row) => menuItem("recent:" + row.id, "file", row.name));
    if (!recent.length) recent.push(menuItem("recent-none", "file", t("file.none"), "", true));
    return [
      { id: "file", label: t("menu.file"), icon: "file", items: [
        menuItem("new", "new", t("file.new"), "Ctrl+N"),
        menuItem("open", "open", t("file.open"), "Ctrl+O"),
        menuItem("git", "git", t("file.openRepo")),
        menuItem("save", "save", t("file.save"), "Ctrl+S"),
        menuItem("saveAs", "saveAs", t("file.saveAs")),
        menuItem("saveSession", "save", t("file.saveSession")),
      ].concat(recent).concat([
        menuItem("recentManager", "folder", t("file.manageRecent")),
        menuItem("clearRecent", "trash", t("file.clearRecent")),
        menuItem("print", "print", t("file.print"), "Ctrl+P"),
        menuItem("exit", "exit", t("file.exit")),
      ]) },
      { id: "edit", label: t("menu.edit"), icon: "copy", items: [
        menuItem("undo", "undo", t("edit.undo"), "Ctrl+Z", undoStack.length === 0),
        menuItem("redo", "redo", t("edit.redo"), "Ctrl+Y", redoStack.length === 0),
        menuItem("cut", "cut", t("edit.cut"), "Ctrl+X"),
        menuItem("copy", "copy", t("edit.copy"), "Ctrl+C"),
        menuItem("paste", "paste", t("edit.paste"), "Ctrl+V"),
        menuItem("selectAll", "check", t("edit.selectAll"), "Ctrl+A"),
      ] },
      { id: "merge", label: t("menu.merge"), icon: "both", items: [
        menuItem("takeBase", "base", t("merge.takeBase")),
        menuItem("takeLocal", "local", t("merge.takeLocal")),
        menuItem("takeRemote", "remote", t("merge.takeRemote")),
        menuItem("takeBoth", "both", t("merge.takeBoth")),
        menuItem("prevConflict", "prev", t("merge.prev")),
        menuItem("nextConflict", "next", t("merge.next")),
        menuItem("remerge", "git", t("merge.remerge")),
      ] },
      { id: "view", label: t("menu.view"), icon: "zoomIn", items: [
        menuItem("zoomIn", "zoomIn", t("view.zoomIn")),
        menuItem("zoomOut", "zoomOut", t("view.zoomOut")),
        menuItem("zoomReset", "check", t("view.zoomReset")),
        menuItem("toggleLeft", "panelLeft", t("view.left")),
        menuItem("toggleRight", "panelRight", t("view.right")),
      ] },
      { id: "tools", label: t("menu.tools"), icon: "wrench", items: [
        menuItem("git", "git", t("tools.git")),
        menuItem("download", "download", t("tools.download")),
        menuItem("link", "link", t("tools.link")),
      ] },
      { id: "help", label: t("menu.help"), icon: "help", items: [
        menuItem("guide", "help", t("help.guide")),
        menuItem("about", "about", t("help.about")),
      ] },
    ];
  }

  function menuRootButton(menu) {
    return '<button type="button" class="menu-root" data-menu="' + menu.id + '" data-align="' + (menu.align === "right" ? "right" : "left") + '" title="' + esc(menu.label) + '">' +
      Icons.icon(menu.icon) + "<span>" + esc(menu.label) + "</span></button>";
  }

  function toolbarActions() {
    return [
      { action: "themeCycle", icon: "theme", tip: t("view.theme") },
      { action: "themeMenu", icon: "caret", tip: t("view.themeList"), caret: true },
      { action: "language", icon: "language", tip: t("view.language") },
      { action: "settings", icon: "settings", tip: t("file.settings") },
      { action: "about", icon: "about", tip: t("help.about") },
    ];
  }

  function toolActionButton(item) {
    if (item.action === "language") return languageButton();
    return button(item.action, item.icon, item.tip).replace('class="tool-btn"', 'class="tool-btn' + (item.caret ? " tool-caret" : "") + '"');
  }

  function windowControls() {
    const button = (name, label, path) => (
      '<button type="button" class="win-btn' + (name === "close" ? " close" : "") + '" data-window="' + name + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      '<svg viewBox="0 0 10 10" aria-hidden="true">' + path + "</svg></button>"
    );
    return '<div class="window-controls">' +
      button("minimize", t("window.minimize"), '<path d="M0 5h10"/>') +
      button("maximize", t("window.maximize"), '<rect x="0.5" y="0.5" width="9" height="9"/>') +
      button("close", t("window.close"), '<path d="M0 0l10 10M10 0 0 10"/>') +
      "</div>";
  }

  function renderMenubar() {
    const menus = menuDefinitions().filter((menu) => menu.align !== "right");
    $("menubar").innerHTML =
      '<span class="app-title"><img src="assets/icon.png" width="16" height="16" alt=""><strong id="appTitle">' + esc(BUILD.title) + "</strong></span>" +
      menus.map(menuRootButton).join("") +
      '<span class="menu-spacer"></span>' +
      windowControls();
  }

  function renderTabs() {
    const strip = $("tabstrip");
    strip.innerHTML = docs.map((doc, index) => (
      '<button type="button" class="tab' + (index === active ? " active" : "") + '" data-tab="' + index + '" title="' + esc(doc.name) + '">' + esc(doc.name) + "</button>"
    )).join("");
    const overflow = strip.scrollWidth > strip.clientWidth + 1;
    $("tabPrev").disabled = !overflow;
    $("tabNext").disabled = !overflow;
    $("tabPrev").title = t("tab.prev");
    $("tabNext").title = t("tab.next");
  }

  function paneRows(doc) {
    const sides = ["base", "local", "remote"];
    const plain = {
      base: Merge.splitLines(doc.baseText).lines,
      local: Merge.splitLines(doc.localText).lines,
      remote: Merge.splitLines(doc.remoteText).lines,
    };
    const marked = { base: [], local: [], remote: [] };
    try {
      Merge.merge3(doc.baseText, doc.localText, doc.remoteText, doc.labels).hunks.forEach((hunk) => {
        const kind = hunk.type === "equal" ? "" : hunk.type;
        sides.forEach((side) => {
          (hunk[side] || hunk.lines || []).forEach((text) => marked[side].push({ text: text, kind: kind }));
        });
      });
    } catch (error) {
      sides.forEach((side) => { marked[side] = []; });
    }
    const rows = {};
    sides.forEach((side) => {
      const list = marked[side];
      const fits = list.length === plain[side].length && list.every((row, index) => row.text === plain[side][index]);
      rows[side] = fits ? list : plain[side].map((text) => ({ text: text, kind: "" }));
    });
    return rows;
  }

  function codeHTML(rows) {
    return rows.map((row, index) => (
      '<div class="code-line' + (row.kind ? " " + row.kind : "") + '">' +
      '<span class="no">' + (index + 1) + "</span>" +
      '<span class="text">' + esc(row.text) + "</span></div>"
    )).join("");
  }

  function resultRows(doc) {
    const lines = Merge.splitLines(doc ? doc.resultText : "").lines;
    const rows = [];
    let mode = "";
    let index = -1;
    lines.forEach((text) => {
      if (text.startsWith("<<<<<<<")) {
        index += 1;
        mode = "local";
        rows.push({ kind: "marker", index: index });
        return;
      }
      if (mode && text.startsWith("|||||||")) {
        mode = "base";
        rows.push({ kind: "marker", index: index });
        return;
      }
      if (mode && (text === "=======" || text.startsWith("======= "))) {
        mode = "remote";
        rows.push({ kind: "marker", index: index });
        return;
      }
      if (mode && text.startsWith(">>>>>>>")) {
        rows.push({ kind: "marker", index: index });
        mode = "";
        return;
      }
      rows.push({ kind: mode, index: mode ? index : -1 });
    });
    return rows;
  }

  function renderResultDecor() {
    const rows = resultRows(current());
    const stripes = $("resultStripes");
    const gutter = $("resultGutter");
    if (!stripes || !gutter) return;
    stripes.innerHTML = rows.map((row) => {
      const names = [row.kind, row.index >= 0 && row.index === conflictIndex ? "active" : ""].filter(Boolean).join(" ");
      return '<div class="' + names + '"></div>';
    }).join("");
    gutter.innerHTML = rows.map((row, index) => "<div>" + (index + 1) + "</div>").join("");
    syncResultScroll();
  }

  function syncResultScroll() {
    const area = $("resultText");
    const stripes = $("resultStripes");
    const gutter = $("resultGutter");
    if (!area || !stripes || !gutter) return;
    stripes.style.transform = "translateY(" + -area.scrollTop + "px)";
    gutter.scrollTop = area.scrollTop;
  }

  function renderSources() {
    const doc = current();
    const rows = paneRows(doc);
    const map = { paneBase: "base", paneLocal: "local", paneRemote: "remote" };
    Object.entries(map).forEach(([id, side]) => {
      const pane = $(id);
      pane.querySelector(".pane-head").innerHTML =
        '<span class="tag">' + esc(t("pane." + side)) + "</span>" +
        '<span class="count">' + rows[side].length + "</span>";
      pane.querySelector(".code-lines").innerHTML = codeHTML(rows[side]);
    });
    const conflicts = conflictsOf(doc);
    $("resultHead").innerHTML =
      '<span class="tag">' + esc(t("pane.result")) + "</span>" +
      '<span class="count">' + esc(t("status.conflicts")) + " " + conflicts.length + "</span>";
    $("resultText").value = doc.resultText;
    renderResultDecor();
  }

  function renderLeft() {
    const doc = current();
    const conflicts = conflictsOf(doc);
    const items = conflicts.map((conflict, index) => (
      '<button type="button" class="conflict-item' + (index === conflictIndex ? " active" : "") + '" data-action="conflict:' + index + '" title="' + esc(t("status.conflicts") + " " + (index + 1)) + '">' +
      Icons.icon("conflict") + "<span>" + esc(t("status.conflicts") + " " + (index + 1)) + '</span><i class="dot"></i></button>'
    )).join("") || '<div class="line">' + esc(t("git.none")) + "</div>";
    const tools = [
      ["open", "open", "file.open"],
      ["git", "git", "file.openRepo"],
      ["takeLocal", "local", "merge.takeLocal"],
      ["takeRemote", "remote", "merge.takeRemote"],
      ["takeBase", "base", "merge.takeBase"],
      ["takeBoth", "both", "merge.takeBoth"],
      ["prevConflict", "prev", "merge.prev"],
      ["nextConflict", "next", "merge.next"],
    ].map((row) => (
      '<button type="button" class="panel-btn" data-action="' + row[0] + '" title="' + esc(t(row[2])) + '">' + Icons.icon(row[1]) + "<span>" + esc(t(row[2])) + "</span></button>"
    )).join("");
    $("leftPanel").classList.toggle("hidden", !settings.showLeft);
    $("splitLeft").classList.toggle("hidden", !settings.showLeft);
    $("leftPanel").innerHTML = '<h2>' + esc(t("left.tools")) + "</h2><div class=\"panel-tools\">" + tools + "</div><h2>" + esc(t("left.conflicts")) + "</h2><div class=\"conflict-list\">" + items + "</div>";
  }

  function propLine(field, label, value, control) {
    return '<label class="line prop-line"><span>' + esc(label) + "</span>" + control + "</label>";
  }

  function renderRight() {
    const doc = current();
    const conflicts = conflictsOf(doc);
    const input = (field, label, value) => '<input data-prop="' + field + '" type="text" value="' + esc(value || "") + '" title="' + esc(label) + '">';
    $("rightPanel").classList.toggle("hidden", !settings.showRight);
    $("splitRight").classList.toggle("hidden", !settings.showRight);
    $("rightPanel").innerHTML = [
      "<h2>" + esc(t("right.props")) + "</h2>",
      '<div class="props">',
      propLine("name", t("prop.name"), doc.name, input("name", t("prop.name"), doc.name)),
      propLine("base", t("prop.base"), doc.basePath, input("basePath", t("prop.base"), doc.basePath)),
      propLine("local", t("prop.local"), doc.localPath, input("localPath", t("prop.local"), doc.localPath)),
      propLine("remote", t("prop.remote"), doc.remotePath, input("remotePath", t("prop.remote"), doc.remotePath)),
      propLine("merged", t("prop.merged"), doc.mergedPath, input("mergedPath", t("prop.merged"), doc.mergedPath)),
      propLine("encoding", t("prop.encoding"), doc.encoding, '<select data-prop="encoding" title="' + esc(t("prop.encoding")) + '"><option>UTF-8</option><option>UTF-16</option></select>'),
      propLine("eol", t("prop.eol"), doc.eol, '<select data-prop="eol" title="' + esc(t("prop.eol")) + '"><option>LF</option><option>CRLF</option></select>'),
      '<div class="line"><span>' + esc(t("prop.resolved")) + "</span><b class=\"grow\" id=\"resolvedCount\">" + doc.resolved + "/" + doc.initialConflicts + "</b></div>",
      '<div class="line"><span>' + esc(t("git.branch")) + "</span><b class=\"grow\">" + esc(git.branch || "-") + "</b></div>",
      '<div class="line"><span>' + esc(t("status.conflicts")) + "</span><b class=\"grow\">" + conflicts.length + "</b></div>",
      "</div>",
    ].join("");
    const encoding = $("rightPanel").querySelector('[data-prop="encoding"]');
    const eol = $("rightPanel").querySelector('[data-prop="eol"]');
    if (encoding) encoding.value = doc.encoding;
    if (eol) eol.value = doc.eol;
  }

  function renderStatus() {
    const doc = current();
    const area = $("resultText");
    const conflicts = conflictsOf(doc);
    const upto = area.value.slice(0, area.selectionStart || 0);
    const line = upto.split("\n").length;
    const fields = [
      ["stState", t("status.ready")],
      ["stFile", doc.name],
      ["stConflicts", t("status.conflicts") + " " + conflicts.length],
      ["stDirty", doc.dirty ? t("status.dirty") : t("status.clean")],
      ["stZoom", t("status.zoom") + " " + settings.zoom + "%"],
      ["stLang", settings.language === "en" ? "EN" : "KO"],
      ["stTheme", Themes.nameOf(Themes.byId(settings.theme, settings.custom), settings.language)],
      ["stEncoding", doc.encoding],
      ["stPos", t("status.line") + " " + line],
      ["stGit", git.root ? t("status.repo") : t("status.standalone")],
      ["stVersion", BUILD.version],
    ];
    $("statusbar").innerHTML = fields.map((field) => '<span id="' + field[0] + '">' + esc(field[1]) + "</span>").join("");
    const grip = $("resizeGrip");
    if (grip) grip.title = t("window.resize");
  }

  function renderAll() {
    applyVisual();
    renderMenubar();
    renderToolbar();
    renderTabs();
    renderSources();
    renderLeft();
    renderRight();
    renderStatus();
  }

  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
  }

  function themeMenuHTML() {
    const column = (mode) => Themes.THEMES.filter((item) => item.mode === mode).map((item) => (
      '<button type="button" class="menu-item theme-choice' + (item.id === settings.theme ? " on" : "") + '" data-action="theme:' + esc(item.id) + '" title="' + esc(Themes.nameOf(item, settings.language)) + '">' +
      '<i class="swatch" style="background:' + esc(item.vars["--bg"]) + ";border-color:" + esc(item.vars["--accent"]) + '"></i>' +
      '<span class="label">' + esc(Themes.nameOf(item, settings.language)) + "</span></button>"
    )).join("");
    const col = (mode, label) => '<div class="theme-col"><div class="theme-col-head">' + esc(label) + "</div>" + column(mode) + "</div>";
    return '<div class="theme-cols">' + col("dark", t("theme.dark")) + col("light", t("theme.light")) + "</div>" +
      '<button type="button" class="menu-item theme-custom' + (settings.theme === "custom" ? " on" : "") + '" data-action="themeCustom">' +
      '<span class="ico">' + Icons.icon("image") + "</span>" +
      '<span class="label">' + esc(t("theme.custom")) + "</span></button>";
  }

  function openThemeMenu(x, y) {
    const width = 360;
    const height = 24 + 20 * 24 + 34 + 10;
    const left = Math.max(0, x - width);
    if (window.desktop && window.desktop.openMenu && !TEST) {
      window.desktop.openMenu({
        id: "theme",
        x: left,
        y: y,
        width: width,
        height: height,
        html: themeStyle() + '<div class="menu theme-menu">' + themeMenuHTML() + "</div>",
        background: Themes.byId(settings.theme, settings.custom).vars["--menu"],
      });
      return null;
    }
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu theme-menu";
    el.dataset.menu = "theme";
    el.style.left = left + "px";
    el.style.top = y + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.innerHTML = themeMenuHTML();
    $("menuLayer").appendChild(el);
    menuEl = el;
    return el;
  }

  function openMenu(id, x, y, align) {
    const def = menuDefinitions().find((item) => item.id === id);
    if (!def) return null;
    const width = 320;
    const height = def.items.length * metrics.MENU_ROW + metrics.MENU_PAD + 2;
    const left = align === "right" ? x - width : x;
    const top = y;
    if (window.desktop && window.desktop.openMenu && !TEST) {
      window.desktop.openMenu({
        id: id,
        x: left,
        y: top,
        width: width,
        height: height,
        html: themeStyle() + '<div class="menu">' + menuHTML(def.items) + "</div>",
        background: Themes.byId(settings.theme, settings.custom).vars["--menu"],
      });
      return null;
    }
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.dataset.menu = id;
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.innerHTML = menuHTML(def.items);
    $("menuLayer").appendChild(el);
    menuEl = el;
    return el;
  }

  function menuHTML(items) {
    return items.map((item) => (
      '<button type="button" class="menu-item" data-action="' + esc(item.action) + '"' + (item.disabled ? " disabled" : "") + ' title="' + esc(item.label) + '">' +
      '<span class="ico">' + Icons.icon(item.icon) + "</span>" +
      '<span class="label">' + esc(item.label) + "</span>" +
      '<span class="shortcut">' + esc(item.shortcut) + "</span></button>"
    )).join("");
  }

  function openContext(x, y) {
    closeMenu();
    const items = [
      menuItem("cut", "cut", t("edit.cut"), "Ctrl+X"),
      menuItem("copy", "copy", t("edit.copy"), "Ctrl+C"),
      menuItem("paste", "paste", t("edit.paste"), "Ctrl+V"),
      menuItem("selectAll", "check", t("edit.selectAll"), "Ctrl+A"),
      menuItem("takeLocal", "local", t("merge.takeLocal")),
      menuItem("takeRemote", "remote", t("merge.takeRemote")),
      menuItem("takeBase", "base", t("merge.takeBase")),
      menuItem("takeBoth", "both", t("merge.takeBoth")),
    ];
    const width = 280;
    const height = items.length * metrics.MENU_ROW + metrics.MENU_PAD + 2;
    const el = document.createElement("div");
    el.className = "menu";
    el.dataset.menu = "context";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.innerHTML = menuHTML(items);
    $("menuLayer").appendChild(el);
    menuEl = el;
    return el;
  }

  function themeCss() {
    const theme = Themes.byId(settings.theme, settings.custom);
    const css = Object.entries(theme.vars).map((pair) => pair[0] + ":" + pair[1]).join(";");
    return ":root{color-scheme:" + theme.mode + ";" + css + "}";
  }

  function themeStyle() {
    return '<style id="themeVars">' + themeCss() + "</style>";
  }

  function optionTag(value, label, current) {
    return '<option value="' + esc(value) + '"' + (String(value) === String(current) ? " selected" : "") + ">" + esc(label) + "</option>";
  }

  function popupIcon(kind) {
    const icons = {
      settings: "settings",
      about: "about",
      theme: "theme",
      print: "print",
      git: "git",
      guide: "help",
      error: "conflict",
      progress: "download",
      recent: "folder",
      save: "save",
      unsaved: "save",
      assign: "both",
    };
    return icons[kind] || "settings";
  }

  function popupTitle(kind) {
    const keys = {
      about: "popup.about",
      error: "popup.error",
      progress: "popup.progress",
      print: "popup.print",
      unsaved: "popup.unsaved",
      recent: "popup.recent",
      save: "popup.save",
      git: "popup.git",
      assign: "popup.assign",
      theme: "popup.theme",
      guide: "popup.guide",
    };
    return t(keys[kind] || "popup.settings");
  }

  function popupHTML(kind) {
    const head = (title) => (
      '<header class="popup-titlebar"><strong><span class="popup-ico">' + Icons.icon(popupIcon(kind)) + "</span>" +
      '<span class="popup-title">' + esc(title) + "</span></strong>" +
      '<button type="button" class="dialog-x" data-popup-action="cancel" title="' + esc(t("action.close")) + '" aria-label="' + esc(t("action.close")) + '">' +
      '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8"/></svg></button></header>'
    );
    const foot = (buttons) => '<footer><span class="spacer"></span>' + buttons + "</footer>";
    const btn = (action, label, primary) => '<button type="button" class="action' + (primary ? " primary" : "") + '" data-popup-action="' + action + '">' + esc(label) + "</button>";
    const number = (field, value, min, max) => (
      '<span class="spin">' +
      '<button type="button" class="spin-btn" data-spin="' + field + ':-1" tabindex="-1" aria-label="-">&#8722;</button>' +
      '<input data-field="' + field + '" type="number" min="' + min + '" max="' + max + '" value="' + esc(value) + '">' +
      '<button type="button" class="spin-btn" data-spin="' + field + ':1" tabindex="-1" aria-label="+">+</button></span>'
    );
    if (kind === "about") {
      return head(t("popup.about")) +
        '<div class="popup-body">' +
        '<div class="line"><img src="assets/icon.png" width="20" height="20" alt=""><b>' + esc(BUILD.title) + "</b></div>" +
        '<div class="line" id="aboutBuild">' + esc(t("status.ready") === "Ready" ? "Build" : "빌드") + " " + esc(BUILD.build) + "</div>" +
        '<div class="line" id="aboutAuthor" data-author="' + esc(BUILD.author) + '">' + esc(BUILD.author) + "</div>" +
        '<div class="line">' + esc(t("about.desc")) + "</div>" +
        '<div class="line">' + esc(BUILD.builtAt) + "</div>" +
        "</div>" + foot(btn("close", t("action.close")));
    }
    if (kind === "error") {
      const message = (lastError.split("\n")[1] || lastError).slice(0, 180);
      return head(t("popup.error")) +
        '<div class="popup-body">' +
        '<div class="line" id="errorMessage" title="' + esc(message) + '">' + esc(message) + "</div>" +
        '<input id="errorDetail" class="line-input" readonly value="' + esc(lastError.replace(/\s+/g, " ").trim()) + '">' +
        "</div>" + foot(btn("copy-error", t("action.copy")) + btn("close", t("action.close")));
    }
    if (kind === "progress") {
      const value = progressMarks.length ? progressMarks[progressMarks.length - 1] : 0;
      return head(t("popup.progress")) +
        '<div class="popup-body">' +
        '<div class="line" id="progressText">' + esc(t("status.busy")) + "</div>" +
        '<div class="bar"><div id="progressFill" style="width:' + value + '%"></div></div>' +
        '<div class="line"><span id="progressPct">' + value + "</span><span>%</span></div>" +
        "</div>" + foot(btn("close", t("action.cancel")));
    }
    if (kind === "unsaved") {
      return head(t("popup.unsaved")) +
        '<div class="popup-body"><div class="line">' + esc(t("unsaved.message")) + "</div></div>" +
        foot(btn("save-close", t("action.save"), true) + btn("discard", t("action.discard")) + btn("cancel", t("action.cancel")));
    }
    if (kind === "save") {
      const doc = current();
      return head(t("popup.save")) +
        '<div class="popup-body">' +
        '<label class="line"><span>' + esc(t("save.name")) + '</span><input data-field="name" type="text" value="' + esc(doc.mergedPath || doc.name) + '"></label>' +
        '<label class="line"><span>' + esc(t("save.dir")) + '</span><input data-field="dir" type="text" value="' + esc(settings.lastSaveDir) + '"></label>' +
        "</div>" + foot(btn("confirm-save", t("action.save"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "git") {
      const command = Git.mergetoolConfig("MyMerge").join(" && ");
      return head(t("popup.git")) +
        '<div class="popup-body">' +
        '<label class="line"><span>' + esc(t("git.path")) + '</span><input data-field="path" type="text" value="' + esc(git.root) + '"></label>' +
        '<div class="line"><span>' + esc(t("git.branch")) + "</span><b>" + esc(git.branch || "-") + "</b></div>" +
        '<label class="line"><span>' + esc(t("git.mergetool")) + '</span><input data-field="cmd" type="text" readonly value="' + esc(command) + '"></label>' +
        "</div>" + foot(btn("git-open", t("action.open"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "assign") {
      return head(t("popup.assign")) +
        '<div class="popup-body">' +
        '<label class="line"><input type="radio" name="role" data-field="role" value="base" checked> ' + esc(t("assign.base")) + "</label>" +
        '<label class="line"><input type="radio" name="role" value="local"> ' + esc(t("assign.local")) + "</label>" +
        '<label class="line"><input type="radio" name="role" value="remote"> ' + esc(t("assign.remote")) + "</label>" +
        '<label class="line"><input type="radio" name="role" value="conflict"> ' + esc(t("assign.conflict")) + "</label>" +
        "</div>" + foot(btn("assign-apply", t("action.ok"), true) + btn("cancel", t("action.cancel")));
    }
    if (kind === "recent") {
      const rows = (settings.recent || []).map((row) => (
        '<div class="line"><span class="grow">' + esc(row.name) + '</span><button type="button" class="action" data-popup-action="remove-recent" data-id="' + esc(row.id) + '">' + esc(t("action.delete")) + "</button></div>"
      )).join("") || '<div class="line">' + esc(t("recent.empty")) + "</div>";
      return head(t("popup.recent")) +
        '<div class="popup-body"><div class="recent-slot">' + rows + "</div></div>" +
        foot(btn("clear-recent", t("action.deleteAll")) + btn("close", t("action.close")));
    }
    if (kind === "print") {
      const pages = pagesForPrint();
      const page = pages[printState.pageIndex] || pages[0];
      return head(t("popup.print")) +
        '<div class="popup-body">' +
        '<label class="line"><span>' + esc(t("print.scope")) + '</span><select data-field="scope">' + optionTag("all", t("print.all"), printState.scope) + optionTag("current", t("print.current"), printState.scope) + optionTag("custom", t("print.custom"), printState.scope) + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.from")) + "</span>" + number("from", printState.from, 1, 9999) + '<span class="mid">' + esc(t("print.to")) + "</span>" + number("to", printState.to, 1, 9999) + "</label>" +
        '<label class="line"><span>' + esc(t("print.paper")) + '</span><select data-field="paper">' + optionTag("A4", "A4", printState.paper) + optionTag("Letter", "Letter", printState.paper) + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.orientation")) + '</span><select data-field="orientation">' + optionTag("portrait", t("print.portrait"), printState.orientation) + optionTag("landscape", t("print.landscape"), printState.orientation) + "</select></label>" +
        '<label class="line"><span>' + esc(t("print.margin")) + "</span>" + number("margin", printState.margin, 0, 40) + "</label>" +
        '<div class="line"><button type="button" class="action" data-popup-action="print-prev">&lt;</button><span id="printPage">' + esc(t("print.page")) + " " + (printState.pageIndex + 1) + "/" + pages.length + '</span><button type="button" class="action" data-popup-action="print-next">&gt;</button></div>' +
        '<div class="preview" id="printPreview"><pre>' + esc((page.lines || []).join("\n")) + "</pre></div>" +
        "</div>" + foot(btn("do-print", t("action.print"), true) + btn("close", t("action.close")));
    }
    if (kind === "theme") {
      const colors = Object.assign(Themes.defaultCustom(), settings.custom || {});
      const colorLine = (key) => '<label class="line"><span>' + esc(t("theme." + key)) + '</span><input data-field="' + key + '" type="color" value="' + esc(colors[key]) + '"></label>';
      return head(t("popup.theme")) +
        '<div class="popup-body"><div data-panel="custom">' +
        '<label class="line"><span>' + esc(t("theme.mode")) + '</span><select data-field="mode">' + optionTag("dark", t("theme.dark"), colors.mode) + optionTag("light", t("theme.light"), colors.mode) + "</select></label>" +
        ["bg", "panel", "text", "muted", "accent", "border", "toolbar", "status", "menu"].map(colorLine).join("") +
        '<div class="line"><span class="grow"></span><button type="button" class="action primary" data-popup-action="apply-custom">' + esc(t("action.apply")) + "</button></div>" +
        "</div></div>";
    }
    if (kind === "guide") {
      const sections = [
        ["open", ["guide.open.1", "guide.open.2", "guide.open.3", "guide.open.4", "guide.open.5"]],
        ["pick", ["guide.pick.1", "guide.pick.2", "guide.pick.3", "guide.pick.4", "guide.pick.5", "guide.pick.6"]],
        ["save", ["guide.save.1", "guide.save.2", "guide.save.3", "guide.save.4", "guide.save.5", "guide.save.6"]],
        ["view", ["guide.view.1", "guide.view.2", "guide.view.3", "guide.view.4", "guide.view.5", "guide.view.6", "guide.view.7"]],
      ];
      const tabs = sections.map((section, index) => (
        '<button type="button" data-tab="' + section[0] + '"' + (index === 0 ? ' class="on"' : "") + ">" + esc(t("guide.tab." + section[0])) + "</button>"
      )).join("");
      const panels = sections.map((section, index) => (
        '<div data-panel="' + section[0] + '"' + (index === 0 ? "" : " hidden") + ">" +
        section[1].map((key) => '<div class="line">' + esc(t(key)) + "</div>").join("") +
        "</div>"
      )).join("");
      return head(t("popup.guide")) +
        '<div class="popup-body"><div class="tabs">' + tabs + "</div>" + panels + "</div>" +
        foot(btn("close", t("action.close")));
    }
    return head(t("popup.settings")) +
      '<div class="popup-body">' +
      '<div class="tabs">' +
      [["general", "settings.general"], ["font", "settings.font"], ["appearance", "settings.appearance"], ["workspace", "settings.workspace"]].map((pair) => (
        '<button type="button" data-tab="' + pair[0] + '"' + (settingsTab === pair[0] ? ' class="on"' : "") + ">" + esc(t(pair[1])) + "</button>"
      )).join("") + "</div>" +
      '<div data-panel="general"' + (settingsTab === "general" ? "" : " hidden") + ">" +
      '<label class="line"><span>' + esc(t("settings.language")) + '</span><select data-field="language">' + optionTag("ko", t("lang.ko"), settings.language) + optionTag("en", t("lang.en"), settings.language) + "</select></label>" +
      '<label class="line"><span>' + esc(t("settings.theme")) + '</span><select data-field="theme">' +
      Themes.THEMES.concat([Themes.byId("custom", settings.custom)]).map((item) => optionTag(item.id, Themes.nameOf(item, settings.language), settings.theme)).join("") + "</select></label>" +
      '<label class="line"><input data-field="restoreSession" type="checkbox"' + (settings.restoreSession ? " checked" : "") + "> " + esc(t("settings.restore")) + "</label>" +
      "</div>" +
      '<div data-panel="font"' + (settingsTab === "font" ? "" : " hidden") + ">" +
      '<label class="line"><span>' + esc(t("settings.family")) + '</span><select data-field="fontFamily">' + fontCatalog.map((name) => optionTag(name, name, settings.fontFamily)).join("") + "</select></label>" +
      '<label class="line"><span>' + esc(t("settings.size")) + "</span>" + number("fontSize", settings.fontSize, 8, 96) + "</label>" +
      '<label class="line"><span>' + esc(t("settings.style")) + '</span><select data-field="fontStyle">' + optionTag("normal", t("font.normal"), settings.fontStyle) + optionTag("italic", t("font.italic"), settings.fontStyle) + optionTag("bold", t("font.bold"), settings.fontStyle) + optionTag("bold-italic", t("font.boldItalic"), settings.fontStyle) + "</select></label>" +
      "</div>" +
      '<div data-panel="appearance"' + (settingsTab === "appearance" ? "" : " hidden") + ">" +
      '<div class="line"><span class="grow">' + esc(settings.backgroundName || t("settings.bgChoose")) + '</span><button type="button" class="action" data-popup-action="bg-choose">' + esc(t("action.browse")) + "</button></div>" +
      '<div class="line"><span class="grow">' + esc(t("settings.bgClear")) + '</span><button type="button" class="action" data-popup-action="bg-clear">' + esc(t("action.delete")) + "</button></div>" +
      '<label class="line"><span>' + esc(t("settings.bgOpacity")) + "</span>" + number("backgroundOpacity", settings.backgroundOpacity, 0, 100) + "</label>" +
      "</div>" +
      '<div data-panel="workspace"' + (settingsTab === "workspace" ? "" : " hidden") + ">" +
      '<label class="line"><input data-field="showLeft" type="checkbox"' + (settings.showLeft ? " checked" : "") + "> " + esc(t("settings.showLeft")) + "</label>" +
      '<label class="line"><input data-field="showRight" type="checkbox"' + (settings.showRight ? " checked" : "") + "> " + esc(t("settings.showRight")) + "</label>" +
      '<div class="line"><span>' + esc(t("settings.recentDirs")) + "</span>" +
      '<select data-field="recentDir" title="' + esc(t("settings.recentDirs")) + '">' +
      ((settings.recentDirs || []).length
        ? (settings.recentDirs || []).map((dir) => optionTag(dir, dir, settings.lastOpenDir)).join("")
        : '<option value="">' + esc(t("settings.dirsEmpty")) + "</option>") + "</select>" +
      '<button type="button" class="action" data-popup-action="remove-dir"' + ((settings.recentDirs || []).length ? "" : " disabled") + ">" + esc(t("action.delete")) + "</button>" +
      '<button type="button" class="action" data-popup-action="clear-dirs"' + ((settings.recentDirs || []).length ? "" : " disabled") + ">" + esc(t("action.deleteAll")) + "</button></div>" +
      '<label class="line"><span>' + esc(t("settings.lastOpen")) + '</span><input data-field="lastOpenDir" type="text" readonly value="' + esc(settings.lastOpenDir) + '"></label>' +
      '<label class="line"><span>' + esc(t("settings.lastSave")) + '</span><input data-field="lastSaveDir" type="text" readonly value="' + esc(settings.lastSaveDir) + '"></label>' +
      "</div></div>" + foot(btn("apply-settings", t("action.apply"), true) + btn("cancel", t("action.cancel")));
  }

  function closePopup() {
    if (popupEl) popupEl.remove();
    popupEl = null;
  }

  function popupDocument(kind) {
    return themeStyle() + '<section class="popup" data-kind="' + kind + '">' + popupHTML(kind) + "</section>";
  }

  function openPopup(kind, anchor) {
    if (kind === "print") {
      printState = Object.assign({}, settings.print, { pageIndex: 0 });
    }
    const html = popupHTML(kind);
    const spec = metrics.POPUPS[kind];
    const place = anchor || {
      x: Math.max(0, (window.innerWidth - spec.width) / 2),
      y: Math.max(0, (window.innerHeight - spec.height) / 2),
    };
    if (window.desktop && window.desktop.openPopup && !TEST) {
      window.desktop.openPopup({
        kind: kind,
        title: popupTitle(kind),
        width: spec.width,
        height: spec.height,
        html: popupDocument(kind),
        background: Themes.byId(settings.theme, settings.custom).vars["--panel"],
        x: place.x,
        y: place.y,
        anchor: Boolean(anchor),
      });
      return null;
    }
    closePopup();
    const el = document.createElement("section");
    el.className = "popup";
    el.dataset.kind = kind;
    el.style.width = spec.width + "px";
    el.style.height = spec.height + "px";
    el.style.left = place.x + "px";
    el.style.top = place.y + "px";
    el.innerHTML = html;
    $("popupLayer").appendChild(el);
    popupEl = el;
    bindPopup(el, kind);
    return el;
  }

  function stepSpin(root, target) {
    const spin = target.closest ? target.closest("[data-spin]") : null;
    if (!spin || !root.contains(spin)) return false;
    const parts = String(spin.dataset.spin).split(":");
    const input = root.querySelector('[data-field="' + parts[0] + '"]');
    if (!input) return true;
    const step = Number(parts[1]) || 1;
    const low = input.min === "" ? -Infinity : Number(input.min);
    const high = input.max === "" ? Infinity : Number(input.max);
    input.value = String(Math.min(high, Math.max(low, (Number(input.value) || 0) + step)));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function bindPopup(el, kind) {
    if (kind === "error") {
      const detail = el.querySelector("#errorDetail");
      if (detail) detail.value = lastError.replace(/\s+/g, " ").trim();
    }
    if (kind === "settings") {
      const fields = {
        language: settings.language,
        fontFamily: settings.fontFamily,
        fontSize: String(settings.fontSize),
        fontStyle: settings.fontStyle,
        theme: settings.theme,
      };
      Object.entries(fields).forEach(([key, value]) => {
        const node = el.querySelector('[data-field="' + key + '"]');
        if (node) node.value = value;
      });
    }
    if (kind === "print") {
      ["scope", "paper", "orientation", "margin", "from", "to"].forEach((key) => {
        const node = el.querySelector('[data-field="' + key + '"]');
        if (node && printState[key] != null) node.value = printState[key];
      });
    }
    if (kind === "progress") paintProgress();
  }

  function readFields(root) {
    const fields = {};
    root.querySelectorAll("[data-field]").forEach((el) => {
      if (el.type === "radio") {
        if (el.checked) fields[el.name === "role" ? "role" : el.dataset.field] = el.value;
        return;
      }
      fields[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
    });
    return fields;
  }

  function pagesForPrint() {
    return Print.selectPages(docs.map((doc) => ({ name: doc.name, text: doc.resultText })), {
      scope: printState.scope,
      currentIndex: active,
      from: Number(printState.from) || 1,
      to: Number(printState.to) || 1,
      rows: Print.ROWS,
    });
  }

  function refreshPrintPreview() {
    if (!popupEl || popupEl.dataset.kind !== "print") return;
    const pages = pagesForPrint();
    if (printState.pageIndex >= pages.length) printState.pageIndex = pages.length - 1;
    if (printState.pageIndex < 0) printState.pageIndex = 0;
    const page = pages[printState.pageIndex];
    const label = popupEl.querySelector("#printPage");
    const preview = popupEl.querySelector("#printPreview pre");
    if (label) label.textContent = t("print.page") + " " + (printState.pageIndex + 1) + "/" + pages.length;
    if (preview) preview.textContent = (page.lines || []).join("\n");
  }

  function showError(error) {
    const message = error && error.message ? error.message : String(error);
    const code = error && error.code ? "code: " + error.code : "";
    const stack = error && error.stack ? error.stack : "";
    lastError = [BUILD.title, message, code, stack].filter(Boolean).join("\n");
    openPopup("error");
    return lastError;
  }

  function beginProgress(label) {
    progressMarks.push(0);
    openPopup("progress");
    paintProgress(label, 0);
  }

  function paintProgress(label, value) {
    if (!popupEl || popupEl.dataset.kind !== "progress") return;
    const text = popupEl.querySelector("#progressText");
    const fill = popupEl.querySelector("#progressFill");
    const pct = popupEl.querySelector("#progressPct");
    const current = value == null ? (progressMarks[progressMarks.length - 1] || 0) : value;
    if (text && label) text.textContent = label;
    if (fill) fill.style.width = current + "%";
    if (pct) pct.textContent = String(current);
  }

  async function stepProgress(value, label) {
    progressMarks.push(value);
    paintProgress(label, value);
    await delay(0);
  }

  function endProgress() {
    if (popupEl && popupEl.dataset.kind === "progress") closePopup();
  }

  async function withProgress(label, size, work) {
    const slow = size >= metrics.PROGRESS_BYTES;
    if (slow) beginProgress(label);
    const result = await work(async (value) => { if (slow) await stepProgress(value, label); });
    if (slow) {
      await stepProgress(100, label);
      endProgress();
    }
    return result;
  }

  function setLanguage(lang) {
    settings.language = lang === "en" ? "en" : "ko";
    saveSettings();
    renderAll();
  }

  function setTheme(id) {
    settings.theme = Themes.byId(id, settings.custom).id;
    saveSettings();
    applyVisual();
    renderStatus();
    paintChildWindows();
  }

  function paintChildWindows() {
    if (window.desktop && window.desktop.applyTheme && !TEST) window.desktop.applyTheme(themeCss());
  }

  function setCustom(colors) {
    settings.custom = Object.assign({}, Themes.defaultCustom(), settings.custom || {}, colors || {});
    if (settings.theme === "custom") applyVisual();
    saveSettings();
    renderStatus();
    return settings.custom;
  }

  function anchorUnder(selector, width) {
    const btn = document.querySelector(selector);
    if (!btn) return { x: 12, y: 70 };
    const rect = btn.getBoundingClientRect();
    return { x: Math.max(0, rect.right - width), y: rect.bottom };
  }

  function setZoom(value) {
    settings.zoom = clamp(value, 50, 200);
    saveSettings();
    applyVisual();
    const label = $("zoomValue");
    if (label) label.textContent = settings.zoom + "%";
    renderStatus();
  }

  function setFont(family, size, style) {
    settings.fontFamily = family || settings.fontFamily;
    settings.fontSize = clamp(size == null ? settings.fontSize : size, 8, 96);
    settings.fontStyle = style || settings.fontStyle;
    saveSettings();
    applyVisual();
  }

  function validateBackground() { return true; }

  async function setBackgroundBlob(blob, name) {
    if (!validateBackground(blob.size)) throw new Error("Background rejected");
    if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = URL.createObjectURL(blob);
    settings.backgroundName = name || "";
    settings.backgroundBytes = blob.size;
    document.documentElement.style.setProperty("--workspace-image", 'url("' + bgObjectUrl + '")');
    document.documentElement.style.setProperty("--workspace-image-opacity", String(settings.backgroundOpacity / 100));
    saveSettings();
    try { await idbPut("background", blob); }
    catch (error) { showError(error); }
  }

  async function clearBackground() {
    if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = "";
    settings.backgroundName = "";
    settings.backgroundBytes = 0;
    document.documentElement.style.setProperty("--workspace-image", "none");
    saveSettings();
    try { await idbDelete("background"); } catch (error) { /* already empty */ }
  }

  function bindPaneScroll() {
    const views = ["paneBase", "paneLocal", "paneRemote"].map((id) => $(id).querySelector(".code-view"));
    let syncing = false;
    views.forEach((view) => {
      view.addEventListener("scroll", () => {
        if (syncing) return;
        syncing = true;
        views.forEach((other) => {
          if (other === view) return;
          other.scrollTop = view.scrollTop;
          other.scrollLeft = view.scrollLeft;
        });
        syncing = false;
      });
    });
  }

  function showConflictRow() {
    const area = $("resultText");
    const rows = resultRows(current());
    const first = rows.findIndex((row) => row.index === conflictIndex);
    if (first < 0) return;
    const height = area.clientHeight;
    const step = Math.max(1, Math.round(area.scrollHeight / Math.max(1, rows.length)));
    const top = first * step;
    if (top < area.scrollTop || top > area.scrollTop + height - step) {
      area.scrollTop = Math.max(0, top - Math.round(height / 3));
    }
    syncResultScroll();
  }

  function focusConflict(index) {
    const conflicts = conflictsOf(current());
    if (!conflicts.length) return;
    conflictIndex = (index + conflicts.length) % conflicts.length;
    const conflict = conflicts[conflictIndex];
    const area = $("resultText");
    area.focus();
    area.selectionStart = conflict.start;
    area.selectionEnd = conflict.end;
    renderResultDecor();
    showConflictRow();
    renderLeft();
    renderStatus();
  }

  function resolve(choice) {
    const doc = current();
    const conflicts = conflictsOf(doc);
    if (!conflicts.length) return doc.resultText;
    pushUndo();
    const index = Math.max(0, Math.min(conflictIndex, conflicts.length - 1));
    doc.resultText = Merge.applyChoice(doc.resultText, index, choice);
    doc.resolved += 1;
    doc.dirty = true;
    const left = conflictsOf(doc).length;
    if (conflictIndex >= left) conflictIndex = Math.max(0, left - 1);
    renderSources();
    renderLeft();
    renderRight();
    renderStatus();
    updateHistoryButtons();
    return doc.resultText;
  }

  function remerge() {
    const doc = current();
    pushUndo();
    const merged = Merge.merge3(doc.baseText, doc.localText, doc.remoteText, doc.labels);
    doc.resultText = merged.text;
    doc.initialConflicts = merged.conflicts;
    doc.resolved = 0;
    doc.dirty = true;
    conflictIndex = 0;
    renderAll();
  }

  function addDoc(doc, remember) {
    docs.push(doc);
    active = docs.length - 1;
    conflictIndex = 0;
    if (remember) rememberDoc(doc);
    renderAll();
    return doc;
  }

  function rememberDoc(doc) {
    Store.addRecent(settings, {
      id: doc.mergedPath || doc.name,
      name: doc.name,
      path: doc.mergedPath || doc.name,
      payload: {
        name: doc.name,
        baseText: doc.baseText,
        localText: doc.localText,
        remoteText: doc.remoteText,
        resultText: doc.resultText,
      },
    });
    saveSettings();
  }

  function openPayload(payload, name) {
    const doc = docFromTexts(Object.assign({ name: name || payload.name, dirty: false }, payload));
    if (payload.resultText != null) doc.resultText = payload.resultText;
    return addDoc(doc, false);
  }

  const actions = {
    new: () => addDoc(docFromTexts({ name: "untitled-" + nextId + ".txt", baseText: "", localText: "", remoteText: "", dirty: true }), false),
    open: () => {
      if (TEST || !window.desktop) {
        if (TEST) {
          openPayload(Sample.total, "opened-total.js");
          return;
        }
        $("fileOpen").click();
        return;
      }
      window.desktop.pickFiles(settings.lastOpenDir).then((files) => { if (files && files.length) ingestPaths(files); }).catch(showError);
    },
    save: () => saveCurrent(false),
    saveAs: () => openPopup("save"),
    saveSession: () => saveSessionFile(),
    undo: () => doUndo(),
    redo: () => doRedo(),
    cut: () => doCut(),
    copy: () => doCopy(),
    paste: () => doPaste(),
    selectAll: () => doSelectAll(),
    takeBase: () => resolve("base"),
    takeLocal: () => resolve("local"),
    takeRemote: () => resolve("remote"),
    takeBoth: () => resolve("both"),
    prevConflict: () => focusConflict(conflictIndex - 1),
    nextConflict: () => focusConflict(conflictIndex + 1),
    remerge: () => remerge(),
    zoomIn: () => setZoom(settings.zoom + 10),
    zoomOut: () => setZoom(settings.zoom - 10),
    zoomReset: () => setZoom(100),
    print: () => openPopup("print"),
    settings: () => openPopup("settings"),
    about: () => openPopup("about"),
    language: () => setLanguage(settings.language === "en" ? "ko" : "en"),
    themeCycle: () => setTheme(Themes.next(settings.theme)),
    themeMenu: () => {
      const place = anchorUnder("[data-action='themeMenu']", 0);
      return openThemeMenu(place.x, place.y);
    },
    themeCustom: () => openPopup("theme", anchorUnder("[data-action='themeMenu']", metrics.POPUPS.theme.width)),
    toggleLeft: () => { settings.showLeft = !settings.showLeft; saveSettings(); renderLeft(); },
    toggleRight: () => { settings.showRight = !settings.showRight; saveSettings(); renderRight(); },
    git: () => openGit(),
    download: () => downloadSample(),
    link: () => openLink(GUIDE_URL),
    guide: () => openPopup("guide"),
    recentManager: () => openPopup("recent"),
    clearRecent: () => { Store.clearRecent(settings); saveSettings(); renderMenubar(); },
    exit: () => requestClose(),
  };

  function runAction(action) {
    try {
      if (action.startsWith("recent:")) return openRecent(action.slice(7));
      if (action.startsWith("conflict:")) return focusConflict(Number(action.slice(9)));
      if (action.startsWith("theme:")) { closeMenu(); return setTheme(action.slice(6)); }
      const fn = actions[action];
      if (!fn) throw new Error("Unknown action: " + action);
      closeMenu();
      return Promise.resolve(fn()).catch(showError);
    } catch (error) {
      showError(error);
      return null;
    }
  }

  function openRecent(id) {
    const row = (settings.recent || []).find((item) => item.id === id);
    if (!row) return;
    if (row.payload) openPayload(row.payload, row.name);
    else addDoc(docFromTexts({ name: row.name, baseText: "", localText: "", remoteText: "", mergedPath: row.path }), false);
    Store.rememberDirectory(settings, "open", row.path);
    saveSettings();
  }

  function doUndo() {
    if (!undoStack.length) return false;
    redoStack.push(capture());
    restore(undoStack.pop());
    updateHistoryButtons();
    return true;
  }

  function doRedo() {
    if (!redoStack.length) return false;
    undoStack.push(capture());
    restore(redoStack.pop());
    updateHistoryButtons();
    return true;
  }

  function selectedText() {
    const area = $("resultText");
    return area.value.substring(area.selectionStart, area.selectionEnd);
  }

  function doCopy() {
    const text = selectedText();
    if (!text) return "";
    clipboard = text;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    return text;
  }

  function doCut() {
    const area = $("resultText");
    const text = doCopy();
    if (!text) return "";
    pushUndo();
    const next = area.value.slice(0, area.selectionStart) + area.value.slice(area.selectionEnd);
    area.value = next;
    current().resultText = next;
    current().dirty = true;
    renderLeft();
    renderStatus();
    return text;
  }

  function doPaste() {
    const area = $("resultText");
    pushUndo();
    const start = area.selectionStart;
    const next = area.value.slice(0, start) + clipboard + area.value.slice(area.selectionEnd);
    area.value = next;
    area.selectionStart = area.selectionEnd = start + clipboard.length;
    current().resultText = next;
    current().dirty = true;
    renderLeft();
    renderRight();
    renderStatus();
    return clipboard;
  }

  function doSelectAll() {
    const area = $("resultText");
    area.focus();
    area.selectionStart = 0;
    area.selectionEnd = area.value.length;
    return area.value;
  }

  async function saveCurrent(forceDialog) {
    const doc = current();
    if (forceDialog || !doc.mergedPath) {
      if (TEST && !forceDialog) {
        doc.mergedPath = doc.mergedPath || doc.name;
        return finishSave(doc, doc.mergedPath);
      }
      openPopup("save");
      return null;
    }
    return finishSave(doc, doc.mergedPath);
  }

  async function finishSave(doc, filePath) {
    const payload = doc.eol === "CRLF" ? doc.resultText.replace(/\n/g, "\r\n") : doc.resultText;
    await withProgress(t("progress.saving"), payload.length, async (report) => {
      await report(40);
      lastSaved = { path: filePath, text: payload, bytes: payload.length };
      await report(80);
    });
    doc.mergedPath = filePath;
    doc.dirty = false;
    Store.rememberDirectory(settings, "save", filePath);
    rememberDoc(doc);
    renderStatus();
    renderRight();
    if (window.desktop && window.desktop.writeFile && !TEST) {
      await window.desktop.writeFile(filePath, payload);
    } else if (!TEST) {
      downloadBlob(filePath.split(/[/\\]/).pop(), new Blob([payload], { type: "text/plain" }));
    }
    return lastSaved;
  }

  async function saveSessionFile() {
    const text = Session.serialize(docs);
    const name = (current().name || "session").replace(/\.[^.]+$/, "") + ".mmerge";
    await withProgress(t("progress.saving"), text.length, async (report) => {
      await report(50);
      lastSaved = { path: name, text: text, bytes: text.length, session: true };
      await report(100);
    });
    rememberDoc(current());
    if (!TEST) downloadBlob(name, new Blob([text], { type: "application/vnd.mymerge.session" }));
    return lastSaved;
  }

  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadSample() {
    const text = Session.serialize([docFromTexts(Sample.total), docFromTexts(Sample.readme)]);
    const blob = new Blob([text], { type: "application/vnd.mymerge.session" });
    await withProgress(t("progress.downloading"), Math.max(blob.size, metrics.PROGRESS_BYTES), async (report) => {
      await report(25);
      await report(70);
      lastDownload = { name: "sample.mmerge", text: text, bytes: blob.size };
    });
    if (!TEST) downloadBlob("sample.mmerge", blob);
    return lastDownload;
  }

  async function openLink(url) {
    await withProgress(t("progress.link"), metrics.PROGRESS_BYTES, async (report) => {
      await report(30);
      lastLink = url;
      await report(90);
    });
    if (window.desktop && window.desktop.openExternal && !TEST) window.desktop.openExternal(url);
    else if (!TEST) window.open(url, "_blank", "noopener");
    return lastLink;
  }

  function openGit() {
    if (TEST) {
      git = { root: "D:/sample/repo", branch: "main", conflicts: ["total.js"] };
      const existing = docs.findIndex((doc) => doc.name === "total.js");
      if (existing >= 0) active = existing;
      renderAll();
      openPopup("git");
      return git;
    }
    if (window.desktop && window.desktop.pickDirectory) {
      window.desktop.pickDirectory(settings.lastOpenDir).then((dir) => inspectGit(dir)).catch(showError);
      return null;
    }
    openPopup("git");
    return git;
  }

  async function openLaunch(launch) {
  launchMode = launch && launch.mode ? launch.mode : "standalone";
  if (!window.desktop || !window.desktop.readFile || launchMode === "standalone") return;
  if (launchMode === "file") {
    const text = await window.desktop.readFile(launch.file);
    const name = String(launch.file).split(/[/\\]/).pop();
    if (name.toLowerCase().endsWith(".mmerge")) api.openSessionText(text);
    else if (Merge.looksConflicted(text)) {
      const sides = sidesFromMarkers(text);
      docs = [docFromTexts(Object.assign({ name: name, resultText: sides.resultText }, sides))];
      active = 0;
      renderAll();
    }
    return;
  }
  if (launchMode === "mergetool") {
    const base = await window.desktop.readFile(launch.base);
    const local = await window.desktop.readFile(launch.local);
    const remote = await window.desktop.readFile(launch.remote);
    const name = String(launch.merged).split(/[/\\]/).pop();
    docs = [docFromTexts({
      name: name,
      baseText: base,
      localText: local,
      remoteText: remote,
      basePath: launch.base,
      localPath: launch.local,
      remotePath: launch.remote,
      mergedPath: launch.merged,
    })];
    active = 0;
    renderAll();
  }
}

async function inspectGit(dir) {
    if (!dir) return git;
    Store.rememberDirectory(settings, "open", dir.replace(/\\/g, "/") + "/repo");
    saveSettings();
    if (window.desktop && window.desktop.gitInspect) {
      try {
        git = await window.desktop.gitInspect(dir);
        renderAll();
        openPopup("git");
      } catch (error) {
        showError(new Error(Git.formatGitError("status", error.stderr || error.message)));
      }
      return git;
    }
    git = { root: dir, branch: "", conflicts: [] };
    openPopup("git");
    return git;
  }

  function requestClose() {
    if (docs.some((doc) => doc.dirty)) {
      openPopup("unsaved");
      return "ask";
    }
    closeApplication();
    return "closed";
  }

  function closeApplication(code) {
    appClosed = true;
    closeMenu();
    closePopup();
    if (window.desktop && window.desktop.forceClose) window.desktop.forceClose(code || 0);
  }

  function applySettingsForm(fields, live) {
    const languageChanged = Boolean(fields.language) && fields.language !== settings.language;
    if (fields.language) setLanguage(fields.language);
    if (fields.theme) setTheme(fields.theme);
    setFont(fields.fontFamily || settings.fontFamily, fields.fontSize, fields.fontStyle || settings.fontStyle);
    if (fields.backgroundOpacity != null && fields.backgroundOpacity !== "") {
      settings.backgroundOpacity = clamp(fields.backgroundOpacity, 0, 100);
      document.documentElement.style.setProperty("--workspace-image-opacity", String(settings.backgroundOpacity / 100));
    }
    settings.restoreSession = Boolean(fields.restoreSession);
    settings.showLeft = fields.showLeft !== false && Boolean(fields.showLeft || settings.showLeft);
    if ("showLeft" in fields) settings.showLeft = Boolean(fields.showLeft);
    if ("showRight" in fields) settings.showRight = Boolean(fields.showRight);
    saveSettings();
    renderAll();
    if (!live) {
      closePopup();
      return;
    }
    if (languageChanged) refreshSettingsPopup();
  }

  function refreshSettingsPopup(tab) {
    settingsTab = tab || settingsTab;
    if (window.desktop && window.desktop.refreshPopup && !TEST) {
      window.desktop.refreshPopup(popupDocument("settings"));
      return;
    }
    if (popupEl && popupEl.dataset.kind === "settings") {
      popupEl.innerHTML = popupHTML("settings");
      bindPopup(popupEl, "settings");
      const button = popupEl.querySelector('[data-tab="' + settingsTab + '"]');
      if (button) button.click();
    }
  }

function popupAction(action, source, fieldOverride) {
  const root = source && source.closest ? source.closest(".popup") : popupEl;
  const fields = fieldOverride || (root ? readFields(root) : {});
    if (action === "close" || action === "cancel") { closePopup(); return; }
    if (action === "copy-error") {
      const detail = root && root.querySelector("#errorDetail");
      clipboard = detail && detail.value ? detail.value : lastError;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastError).catch(() => {});
      return lastError;
    }
    if (action === "apply-settings") { applySettingsForm(fields); return; }
    if (action === "settings-sync") { applySettingsForm(fields, true); return; }
    if (action === "pick-theme") {
      setTheme((fields && fields.theme) || (source && source.dataset && source.dataset.theme));
      closePopup();
      return;
    }
    if (action === "apply-custom") {
      setCustom(fields);
      setTheme("custom");
      closePopup();
      return;
    }
    if (action === "discard") {
      docs.forEach((doc) => { doc.dirty = false; });
      closeApplication(launchMode === "mergetool" ? 1 : 0);
      return;
    }
    if (action === "save-close") {
      const doc = current();
      doc.mergedPath = doc.mergedPath || doc.name;
      finishSave(doc, doc.mergedPath).then(() => closeApplication());
      return;
    }
    if (action === "confirm-save") {
      const name = fields.name || current().name;
      const dir = fields.dir || settings.lastSaveDir || "";
      const path = dir ? (dir.replace(/\\/g, "/").replace(/\/$/, "") + "/" + name.split(/[/\\]/).pop()) : name;
      finishSave(current(), path).then(() => closePopup());
      return;
    }
    if (action === "clear-dirs" || action === "remove-dir") {
      if (action === "clear-dirs") {
        Store.clearRecentDirs(settings);
        settings.lastOpenDir = "";
        settings.lastSaveDir = "";
      } else {
        const dir = fields.recentDir || settings.lastOpenDir;
        Store.removeRecentDir(settings, dir);
        if (settings.lastOpenDir === dir) settings.lastOpenDir = (settings.recentDirs || [])[0] || "";
      }
      saveSettings();
      refreshSettingsPopup("workspace");
      return;
    }
    if (action === "bg-choose") { $("bgOpen").click(); return; }
    if (action === "bg-clear") { clearBackground(); return; }
    if (action === "remove-recent") {
      const id = (fieldOverride && fieldOverride.id) || (source && source.dataset && source.dataset.id);
      Store.removeRecent(settings, id);
      saveSettings();
      openPopup("recent");
      return;
    }
    if (action === "clear-recent") {
      Store.clearRecent(settings);
      saveSettings();
      openPopup("recent");
      return;
    }
    if (action === "git-open") { inspectGit(fields.path); return; }
    if (action === "assign-apply") { applyDropRole(fields.role || "base"); closePopup(); return; }
    if (action === "print-prev" || action === "print-next" || action === "do-print") {
      syncPrintFields(fields);
      if (action === "print-prev") printState.pageIndex -= 1;
      if (action === "print-next") printState.pageIndex += 1;
      if (action === "do-print") {
        const pages = pagesForPrint();
        lastPrint = {
          scope: printState.scope,
          paper: printState.paper,
          orientation: printState.orientation,
          margin: Number(printState.margin),
          count: pages.length,
          from: Number(printState.from),
          to: Number(printState.to),
        };
        settings.print = Object.assign({}, printState);
        saveSettings();
        if (!TEST) printDocument(pages);
        return lastPrint;
      }
      refreshPrintPreview();
      if (!popupEl && window.desktop && window.desktop.refreshPopup && !TEST) window.desktop.refreshPopup(popupDocument("print"));
    }
    if (action === "print-sync") {
      syncPrintFields(fields);
      printState.pageIndex = 0;
      refreshPrintPreview();
      if (!popupEl && window.desktop && window.desktop.refreshPopup && !TEST) window.desktop.refreshPopup(popupDocument("print"));
    }
  }

  function syncPrintFields(fields) {
    if (!fields) return;
    ["scope", "paper", "orientation"].forEach((key) => { if (fields[key]) printState[key] = fields[key]; });
    if (fields.margin != null && fields.margin !== "") printState.margin = Number(fields.margin);
    if (fields.from) printState.from = Number(fields.from);
    if (fields.to) printState.to = Number(fields.to);
  }

  function printDocument(pages) {
    const html = pages.map((page) => "<section><h1>" + esc(page.name) + "</h1><pre>" + esc(page.lines.join("\n")) + "</pre></section>").join("");
    const frame = $("printFrame");
    const doc = frame.contentDocument;
    doc.open();
    doc.write("<!DOCTYPE html><html><head><title>" + esc(BUILD.title) + "</title></head><body>" + html + "</body></html>");
    doc.close();
    if (window.desktop && window.desktop.print) window.desktop.print();
    else frame.contentWindow.print();
  }

  async function handleDroppedFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const names = list.map((file) => file.name);
    const plan = Git.assignDroppedFiles(names);
    const texts = [];
    for (const file of list) texts.push(await readMaybeSlow(file));
    list.forEach((file) => Store.rememberDirectory(settings, "open", "drop/" + file.name));
    saveSettings();
    if (plan.kind === "session") {
      const data = Session.parse(texts[0]);
      pushUndo();
      docs = data.files.map((file) => docFromTexts(file));
      active = 0;
      renderAll();
      return;
    }
    if (plan.kind === "three" || plan.kind === "three-order") {
      const pick = (slot) => texts[plan[slot].index];
      const doc = docFromTexts({
        name: plan.merged ? plan.merged.name : "merged.txt",
        baseText: pick("base"),
        localText: pick("local"),
        remoteText: pick("remote"),
        mergedPath: plan.merged ? plan.merged.name : "",
        dirty: true,
      });
      pushUndo();
      addDoc(doc, true);
      return;
    }
    const text = texts[0];
    const name = list[0].name;
    if (name.toLowerCase().endsWith(".mmerge") || plan.kind === "session") {
      const data = Session.parse(text);
      pushUndo();
      docs = data.files.map((file) => docFromTexts(file));
      active = 0;
      renderAll();
      return;
    }
    if (Merge.looksConflicted(text)) {
      const sides = sidesFromMarkers(text);
      pushUndo();
      addDoc(docFromTexts(Object.assign({ name: name, dirty: true, resultText: sides.resultText }, sides)), true);
      return;
    }
    pendingDrop = { name: name, text: text };
    openPopup("assign");
  }

  async function readMaybeSlow(file) {
    return withProgress(t("progress.opening"), file.size || String(file.text || "").length, async (report) => {
      await report(20);
      const text = typeof file.text === "function" ? await file.text() : String(file.text || "");
      await report(85);
      return text;
    });
  }

  function applyDropRole(role) {
    if (!pendingDrop) return;
    if (role === "conflict" || Merge.looksConflicted(pendingDrop.text)) {
      const sides = sidesFromMarkers(pendingDrop.text);
      addDoc(docFromTexts(Object.assign({ name: pendingDrop.name, dirty: true, resultText: sides.resultText }, sides)), true);
      pendingDrop = null;
      return;
    }
    const doc = current();
    pushUndo();
    if (role === "local") doc.localText = pendingDrop.text;
    else if (role === "remote") doc.remoteText = pendingDrop.text;
    else doc.baseText = pendingDrop.text;
    const merged = Merge.merge3(doc.baseText, doc.localText, doc.remoteText, doc.labels);
    doc.resultText = merged.text;
    doc.initialConflicts = merged.conflicts;
    doc.dirty = true;
    pendingDrop = null;
    renderAll();
  }

  async function onPickedFiles(fileList) {
    await handleDroppedFiles(fileList);
  }

  function onPropertyChange(event) {
    const target = event.target;
    if (!target.dataset || !target.dataset.prop) return;
    const doc = current();
    pushUndo();
    doc[target.dataset.prop] = target.value;
    doc.dirty = true;
    if (target.dataset.prop === "name") renderTabs();
    renderStatus();
  }

  function wireResizeGrip() {
    const grip = $("resizeGrip");
    if (!grip) return;
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (!window.desktop || !window.desktop.resizeWindow) return;
      event.preventDefault();
      const startX = event.screenX;
      const startY = event.screenY;
      const startW = window.outerWidth;
      const startH = window.outerHeight;
      grip.setPointerCapture(event.pointerId);
      const move = (ev) => {
        window.desktop.resizeWindow(startW + (ev.screenX - startX), startH + (ev.screenY - startY));
      };
      const end = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
  }

  function wire() {
    wireResizeGrip();
    $("toolbar").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    $("menubar").addEventListener("click", (event) => {
      const control = event.target.closest("[data-window]");
      if (control) {
        closeMenu();
        if (window.desktop && window.desktop.windowCommand) window.desktop.windowCommand(control.dataset.window);
        return;
      }
      const btn = event.target.closest("[data-menu]");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const align = btn.dataset.align === "right" ? "right" : "left";
      openMenu(btn.dataset.menu, align === "right" ? rect.right : rect.left, rect.bottom, align);
    });
    $("leftPanel").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn) runAction(btn.dataset.action);
    });
    $("menuLayer").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (btn && !btn.disabled) runAction(btn.dataset.action);
    });
    $("popupLayer").addEventListener("click", (event) => {
      if (event.target.id === "popupLayer") { closePopup(); return; }
      const tab = event.target.closest("[data-tab]");
      if (tab && popupEl && popupEl.contains(tab)) {
        if (popupEl.dataset.kind === "settings") settingsTab = tab.dataset.tab;
        popupEl.querySelectorAll("[data-tab]").forEach((node) => node.classList.toggle("on", node === tab));
        popupEl.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
        return;
      }
      if (popupEl && stepSpin(popupEl, event.target)) return;
      const btn = event.target.closest("[data-popup-action]");
      if (btn) popupAction(btn.dataset.popupAction, btn);
    });
    $("popupLayer").addEventListener("change", (event) => {
      if (!popupEl) return;
      if (popupEl.dataset.kind === "settings") {
        applySettingsForm(readFields(popupEl), true);
        return;
      }
      if (popupEl.dataset.kind !== "print") return;
      syncPrintFields(readFields(popupEl));
      printState.pageIndex = 0;
      refreshPrintPreview();
    });
    $("tabstrip").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (!tab) return;
      active = Number(tab.dataset.tab);
      conflictIndex = 0;
      renderAll();
    });
    $("tabPrev").addEventListener("click", () => { $("tabstrip").scrollLeft -= 140; });
    $("tabNext").addEventListener("click", () => { $("tabstrip").scrollLeft += 140; });
    $("rightPanel").addEventListener("change", onPropertyChange);
    const area = $("resultText");
    area.addEventListener("beforeinput", () => { if (!typing) { pushUndo(); typing = true; } });
    area.addEventListener("input", () => {
      current().resultText = area.value;
      current().dirty = true;
      renderResultDecor();
      renderLeft();
      renderStatus();
    });
    area.addEventListener("scroll", syncResultScroll);
    bindSplitters();
    area.addEventListener("blur", () => { typing = false; });
    bindPaneScroll();
    area.addEventListener("keyup", () => renderStatus());
    area.addEventListener("click", () => renderStatus());
    area.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openContext(event.clientX, event.clientY);
    });
    $("leftPanel").addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openContext(event.clientX, event.clientY);
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeMenu(); return; }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "c") doCopy();
      else if (key === "v") { event.preventDefault(); doPaste(); }
      else if (key === "x") { event.preventDefault(); doCut(); }
      else if (key === "z" && event.shiftKey) { event.preventDefault(); doRedo(); }
      else if (key === "z") { event.preventDefault(); doUndo(); }
      else if (key === "y") { event.preventDefault(); doRedo(); }
      else if (key === "a") { event.preventDefault(); doSelectAll(); }
      else if (key === "s") { event.preventDefault(); actions.save(); }
      else if (key === "p") { event.preventDefault(); actions.print(); }
      else if (key === "n") { event.preventDefault(); actions.new(); }
      else if (key === "o") { event.preventDefault(); actions.open(); }
    });
    window.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(settings.zoom + (event.deltaY < 0 ? 10 : -10));
    }, { passive: false });
    window.addEventListener("dragover", (event) => { event.preventDefault(); });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        handleDroppedFiles(event.dataTransfer.files).catch(showError);
      }
    });
    document.addEventListener("mousedown", (event) => {
      if (menuEl && !menuEl.contains(event.target) && !event.target.closest("[data-menu]") && !event.target.closest("#toolbar [data-action]")) closeMenu();
    });
    $("fileOpen").addEventListener("change", () => { onPickedFiles($("fileOpen").files).catch(showError); });
    $("bgOpen").addEventListener("change", () => {
      const file = $("bgOpen").files && $("bgOpen").files[0];
      if (file) setBackgroundBlob(file, file.name).catch(showError);
    });
    if (!window.desktop) {
      window.addEventListener("beforeunload", (event) => {
        if (TEST) return;
        if (docs.some((doc) => doc.dirty)) {
          event.preventDefault();
          event.returnValue = "";
        }
      });
    }
    if (window.desktop && window.desktop.onCloseRequest) {
      window.desktop.onCloseRequest(() => requestClose());
    }
    if (window.desktop && window.desktop.onHostAction) {
      window.desktop.onHostAction((payload) => {
        const name = payload && payload.name;
        if (!name) return;
        if (actions[name] || name.startsWith("recent:") || name.startsWith("conflict:") || name.startsWith("theme:")) runAction(name);
        else popupAction(name, null, payload.detail || {});
      });
    }
    if (window.desktop && window.desktop.onLaunch) {
      window.desktop.onLaunch((launch) => { openLaunch(launch).catch(showError); });
    }
    window.addEventListener("error", (event) => { if (!TEST) showError(event.error || new Error(event.message)); });
  }

  async function loadFonts() {
    if (TEST) {
      fontCatalog = Fonts.FALLBACK.slice();
      return fontCatalog;
    }
    try {
      if (typeof window.queryLocalFonts === "function") {
        const faces = await window.queryLocalFonts();
        const names = Fonts.uniqueFamilies(faces.map((face) => face.family));
        if (names.length) { fontCatalog = names; return fontCatalog; }
      }
    } catch (error) { /* permission or unsupported */ }
    if (window.desktop && window.desktop.listFonts) {
      try {
        const names = await window.desktop.listFonts();
        if (names && names.length) { fontCatalog = names; return fontCatalog; }
      } catch (error) { /* fall through */ }
    }
    fontCatalog = Fonts.FALLBACK.slice();
    return fontCatalog;
  }

  async function boot() {
    settings = TEST ? Store.defaults() : Store.load(localStorage);
    if (!TEST && settings.backgroundName) {
      try {
        const blob = await idbGet("background");
        if (blob) {
          bgObjectUrl = URL.createObjectURL(blob);
          document.documentElement.style.setProperty("--workspace-image", 'url("' + bgObjectUrl + '")');
        }
      } catch (error) { /* image is optional */ }
    }
    docs = [docFromTexts(Sample.total), docFromTexts(Sample.readme)];
    active = 0;
    wire();
    await loadFonts();
    renderAll();
    window.MyMerge = api;
    api.ready = true;
  }

  async function resetForTests() {
    closeMenu();
    closePopup();
    settings = Store.defaults();
    Store.save(localStorage, settings);
    localStorage.removeItem(Store.SESSION_KEY);
    undoStack = [];
    redoStack = [];
    clipboard = "";
    typing = false;
    git = { root: "", branch: "", conflicts: [] };
    lastError = "";
    lastSaved = null;
    lastDownload = null;
    lastLink = "";
    lastPrint = null;
    progressMarks = [];
    appClosed = false;
    pendingDrop = null;
    fontCatalog = Fonts.FALLBACK.slice();
    docs = [docFromTexts(Sample.total), docFromTexts(Sample.readme)];
    active = 0;
    conflictIndex = 0;
    await clearBackground().catch(() => {});
    settings.backgroundOpacity = 35;
    renderAll();
  }

  const api = {
    ready: false,
    build: BUILD,
    metrics: metrics,
    resetForTests: resetForTests,
    t: (key) => t(key),
    setLanguage: setLanguage,
    getLanguage: () => settings.language,
    setTheme: setTheme,
    getTheme: () => settings.theme,
    themes: () => Themes.ids(),
    setCustom: setCustom,
    setZoom: setZoom,
    getZoom: () => settings.zoom,
    setFont: setFont,
    setFontCatalog: (names) => { fontCatalog = Fonts.uniqueFamilies(names); return fontCatalog; },
    getFontCatalog: () => fontCatalog.slice(),
    getSettings: () => Object.assign({}, settings),
    saveSettings: saveSettings,
    loadSettings: () => { settings = Store.load(localStorage); applyVisual(); renderAll(); return api.getSettings(); },
    rememberDirectory: (kind, filePath) => { Store.rememberDirectory(settings, kind, filePath); saveSettings(); return kind === "save" ? settings.lastSaveDir : settings.lastOpenDir; },
    run: runAction,
    menuDefinitions: menuDefinitions,
    openMenu: (id, x, y) => openMenu(id, x == null ? 12 : x, y == null ? 70 : y),
    closeMenu: closeMenu,
    getMenu: () => menuEl,
    openContextAt: (x, y) => openContext(x == null ? 30 : x, y == null ? 80 : y),
    openPopup: openPopup,
    closePopup: closePopup,
    getPopup: () => popupEl,
    closeApplication: closeApplication,
    isClosed: () => appClosed,
    reopen: () => { appClosed = false; },
    getDoc: () => current(),
    getDocs: () => docs.slice(),
    setResultText: (text) => { pushUndo(); current().resultText = text; current().dirty = true; renderSources(); renderLeft(); renderStatus(); },
    getResultText: () => current().resultText,
    selectResult: (start, end) => { const area = $("resultText"); area.focus(); area.selectionStart = start; area.selectionEnd = end == null ? area.value.length : end; },
    copy: doCopy,
    paste: doPaste,
    cut: doCut,
    getClipboard: () => clipboard,
    undo: doUndo,
    redo: doRedo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    resolve: resolve,
    conflictCount: () => conflictsOf(current()).length,
    addTabs: (count) => { for (let i = 0; i < count; i += 1) docs.push(docFromTexts({ name: "extra-" + i + ".txt", baseText: "a\n", localText: "a\n", remoteText: "a\n" })); renderTabs(); },
    tabOverflow: () => $("tabstrip").scrollWidth > $("tabstrip").clientWidth + 1,
    scrollTabs: (dir) => { $("tabstrip").scrollLeft += dir * 140; return $("tabstrip").scrollLeft; },
    showError: showError,
    getErrorText: () => lastError,
    copyError: () => { clipboard = lastError; return lastError; },
    showProgress: (label, value) => { progressMarks.push(value); openPopup("progress"); paintProgress(label, value); },
    progressValue: () => (progressMarks.length ? progressMarks[progressMarks.length - 1] : 0),
    progressMarks: () => progressMarks.slice(),
    finishProgress: endProgress,
    runDownload: downloadSample,
    runOpenLink: openLink,
    getLastDownload: () => lastDownload,
    getLastLink: () => lastLink,
    getLastSaved: () => lastSaved,
    getLastPrint: () => lastPrint,
    setPrintOption: (key, value) => {
      printState[key] = value;
      settings.print[key] = value;
      if (popupEl) {
        const node = popupEl.querySelector('[data-field="' + key + '"]');
        if (node) node.value = value;
      }
      refreshPrintPreview();
    },
    previewCount: () => pagesForPrint().length,
    requestClose: requestClose,
    dropFiles: async (items) => {
      const files = items.map((item) => new File([item.text], item.name, { type: item.type || "text/plain" }));
      await handleDroppedFiles(files);
    },
    validateBackground: validateBackground,
    setBackgroundBytes: async (bytes, type, name) => setBackgroundBlob(new Blob([bytes], { type: type || "application/octet-stream" }), name),
    addRecent: (item) => { Store.addRecent(settings, item); saveSettings(); return settings.recent.slice(); },
    removeRecent: (id) => { Store.removeRecent(settings, id); saveSettings(); return settings.recent.slice(); },
    clearRecent: () => { Store.clearRecent(settings); saveSettings(); return settings.recent.slice(); },
    openSessionText: (text) => {
      const data = Session.parse(text);
      docs = data.files.map((file) => docFromTexts(file));
      active = 0;
      renderAll();
      return docs.length;
    },
  };

  boot().catch((error) => {
    console.error(error);
    showError(error);
  });
})();

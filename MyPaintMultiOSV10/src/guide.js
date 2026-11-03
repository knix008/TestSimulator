/* The user's guide window (guide.html).
 *
 * Theme and language come from the app's own settings (MyPaintStore, localStorage key
 * "mypaint.settings.v1"); the window `storage` event fires here whenever the main window
 * saves them, so a theme or language change in the app reaches an open guide at once.
 * What belongs to the guide alone — text size, a language picked with the guide's own flags,
 * the last section, whether the contents are shown — is kept under "mypaint.guide.v1".
 * ?lang=ko|en and ?section=<id> override both when the window opens.
 */
(function () {
  "use strict";

  const Themes = window.MyPaintThemes;
  const Store = window.MyPaintStore;
  const Icons = window.MyPaintIcons;
  const Content = window.MyPaintGuideContent;

  const GUIDE_KEY = "mypaint.guide.v1";
  const SETTINGS_KEY = (Store && Store.KEY) || "mypaint.settings.v1";
  const FONT_MIN = 12;
  const FONT_MAX = 28;
  const FONT_DEFAULT = 15;
  const IMAGE_DIR = "doc/images/";

  const $ = (id) => document.getElementById(id);

  /* ── storage ─────────────────────────────────────────────── */

  function readGuide() {
    try {
      const raw = window.localStorage.getItem(GUIDE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      return data && typeof data === "object" ? data : {};
    } catch (error) {
      return {};
    }
  }

  function writeGuide() {
    try {
      window.localStorage.setItem(GUIDE_KEY, JSON.stringify({
        fontSize: state.size,
        lang: state.userLang || null,
        langBase: state.userLang ? state.appLang : null,
        section: state.section,
        toc: state.tocOpen,
      }));
    } catch (error) { /* storage blocked: nothing to remember */ }
  }

  function readAppSettings() {
    try {
      if (Store && Store.load) return Store.load(window.localStorage);
    } catch (error) { /* fall back to the defaults */ }
    try {
      if (Store && Store.defaults) return Store.defaults();
    } catch (error) { /* no store at all */ }
    return { language: "ko", theme: "", custom: null };
  }

  /* ── state ───────────────────────────────────────────────── */

  const params = new URLSearchParams(window.location.search);
  const saved = readGuide();
  const app = readAppSettings();

  function clampSize(value) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return FONT_DEFAULT;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, number));
  }

  function validLang(value) {
    return value === "en" || value === "ko" ? value : "";
  }

  function validSection(value) {
    return Content.section(value) ? value : "";
  }

  const appLang = validLang(app.language) || "ko";
  const urlLang = validLang(params.get("lang"));
  const savedOverride = validLang(saved.lang) && saved.langBase === appLang ? validLang(saved.lang) : "";

  const state = {
    appLang: appLang,
    lang: urlLang || savedOverride || appLang,
    userLang: savedOverride,
    size: clampSize(saved.fontSize == null ? FONT_DEFAULT : saved.fontSize),
    section: validSection(params.get("section")) || validSection(saved.section) || Content.SECTIONS[0].id,
    query: "",
    tocOpen: saved.toc !== false,
    themeId: "",
  };

  function ui(key) {
    const table = Content.UI[state.lang] || Content.UI.ko;
    return table[key] || Content.UI.en[key] || key;
  }

  /* ── theme ───────────────────────────────────────────────── */

  function applyTheme(settings) {
    if (!Themes || !Themes.byId) return;
    let theme;
    try {
      theme = Themes.byId(settings.theme, settings.custom);
    } catch (error) {
      return;
    }
    if (!theme || !theme.vars) return;
    const rootStyle = document.documentElement.style;
    Object.keys(theme.vars).forEach((name) => rootStyle.setProperty(name, theme.vars[name]));
    rootStyle.setProperty("color-scheme", theme.mode === "dark" ? "dark" : "light");
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.dataset.mode = theme.mode;
    state.themeId = theme.id;
  }

  /* ── text helpers ────────────────────────────────────────── */

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function keyCombo(text) {
    return String(text).split(" / ").map((combo) => (
      combo.split(/\+(?!$)/).map((key) => "<kbd>" + esc(key) + "</kbd>").join('<span class="g-kplus">+</span>')
    )).join(' <span class="g-kplus">/</span> ');
  }

  /* **bold**, `code` and [[Ctrl+S]] inside a sentence. */
  function inline(text) {
    const source = String(text == null ? "" : text);
    const pattern = /`([^`]+)`|\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*/g;
    let out = "";
    let last = 0;
    let match;
    while ((match = pattern.exec(source))) {
      out += esc(source.slice(last, match.index));
      if (match[1] != null) out += "<code>" + esc(match[1]) + "</code>";
      else if (match[2] != null) out += keyCombo(match[2]);
      else out += "<strong>" + inline(match[3]) + "</strong>";
      last = pattern.lastIndex;
    }
    return out + esc(source.slice(last));
  }

  function plain(text) {
    return String(text == null ? "" : text).replace(/`|\[\[|\]\]|\*\*/g, "");
  }

  function blockText(block) {
    if (typeof block === "string") return plain(block);
    if (!block) return "";
    if (block.h) return plain(block.h);
    if (block.list) return block.list.map(plain).join(" ");
    if (block.steps) return block.steps.map(plain).join(" ");
    if (block.keys) return block.keys.map((row) => row.join(" ")).join(" ");
    if (block.table) return block.table.head.join(" ") + " " + block.table.rows.map((row) => row.join(" ")).join(" ");
    if (block.img) return plain(block.alt) + " " + plain(block.caption);
    if (block.tip) return plain(block.tip);
    if (block.note) return plain(block.note);
    return "";
  }

  function sectionText(item) {
    const body = item[state.lang] || item.ko;
    return (body.title + " " + body.blocks.map(blockText).join(" ")).toLowerCase();
  }

  function imageSrc(name, english) {
    return IMAGE_DIR + name + (english ? "-en" : "") + ".png";
  }

  function renderBlock(block) {
    if (typeof block === "string") return "<p>" + inline(block) + "</p>";
    if (!block) return "";
    if (block.h) return "<h2>" + inline(block.h) + "</h2>";
    if (block.list) return "<ul>" + block.list.map((item) => "<li>" + inline(item) + "</li>").join("") + "</ul>";
    if (block.steps) return "<ol>" + block.steps.map((item) => "<li>" + inline(item) + "</li>").join("") + "</ol>";
    if (block.keys) {
      return '<table class="g-table g-keys"><thead><tr><th>' + esc(ui("keyHead")) + "</th><th>" + esc(ui("actionHead")) + "</th></tr></thead><tbody>" +
        block.keys.map((row) => "<tr><td>" + keyCombo(row[0]) + "</td><td>" + inline(row[1]) + "</td></tr>").join("") +
        "</tbody></table>";
    }
    if (block.table) {
      return '<table class="g-table"><thead><tr>' + block.table.head.map((cell) => "<th>" + inline(cell) + "</th>").join("") + "</tr></thead><tbody>" +
        block.table.rows.map((row) => "<tr>" + row.map((cell) => "<td>" + inline(cell) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table>";
    }
    if (block.img) {
      const english = state.lang === "en";
      return '<figure class="g-figure" data-image="' + esc(block.img) + '">' +
        '<img src="' + esc(imageSrc(block.img, english)) + '" data-fallback="' + (english ? esc(imageSrc(block.img, false)) : "") + '"' +
        ' alt="' + esc(block.alt || "") + '" title="' + esc(ui("enlarge")) + '" loading="lazy" decoding="async">' +
        (block.caption ? "<figcaption>" + inline(block.caption) + "</figcaption>" : "") +
        "</figure>";
    }
    if (block.tip || block.note) {
      const kind = block.tip ? "tip" : "note";
      const icon = Icons ? Icons.icon(kind === "tip" ? "help" : "warning") : "";
      return '<div class="g-callout ' + kind + '">' + icon + "<p>" + inline(block.tip || block.note) + "</p></div>";
    }
    return "";
  }

  function renderSection(item) {
    const body = item[state.lang] || item.ko;
    const icon = Icons ? Icons.icon(item.icon) : "";
    return '<article class="g-section" id="sec-' + esc(item.id) + '" data-section="' + esc(item.id) + '">' +
      "<h1>" + icon + "<span>" + inline(body.title) + "</span></h1>" +
      body.blocks.map(renderBlock).join("") +
      "</article>";
  }

  /* ── search ──────────────────────────────────────────────── */

  function matches() {
    const query = state.query.trim().toLowerCase();
    if (!query) return null;
    return Content.SECTIONS.filter((item) => sectionText(item).indexOf(query) >= 0);
  }

  function countHits(item, query) {
    const text = sectionText(item);
    let count = 0;
    let at = text.indexOf(query);
    while (at >= 0) {
      count += 1;
      at = text.indexOf(query, at + query.length);
    }
    return count;
  }

  function highlight(container, query) {
    if (!query) return;
    const lower = query.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.nodeValue.toLowerCase().indexOf(lower) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const text = node.nodeValue;
      const fragment = document.createDocumentFragment();
      let last = 0;
      let at = text.toLowerCase().indexOf(lower);
      while (at >= 0) {
        if (at > last) fragment.appendChild(document.createTextNode(text.slice(last, at)));
        const mark = document.createElement("mark");
        mark.className = "g-hit";
        mark.textContent = text.slice(at, at + query.length);
        fragment.appendChild(mark);
        last = at + query.length;
        at = text.toLowerCase().indexOf(lower, last);
      }
      if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(fragment, node);
    });
  }

  /* ── rendering ───────────────────────────────────────────── */

  function renderChrome() {
    document.documentElement.lang = state.lang;
    document.title = ui("title");
    $("title").textContent = ui("title");
    $("langKo").innerHTML = Icons ? Icons.flag("kr") : "KO";
    $("langEn").innerHTML = Icons ? Icons.flag("uk") : "EN";
    $("langKo").title = ui("korean");
    $("langEn").title = ui("english");
    $("langKo").setAttribute("aria-label", ui("korean"));
    $("langEn").setAttribute("aria-label", ui("english"));
    $("langKo").setAttribute("aria-pressed", String(state.lang === "ko"));
    $("langEn").setAttribute("aria-pressed", String(state.lang === "en"));
    $("langGroup").setAttribute("aria-label", ui("language"));
    $("fontGroup").setAttribute("aria-label", ui("fontSize"));
    $("fontDown").title = ui("fontSmaller");
    $("fontUp").title = ui("fontLarger");
    $("fontReset").title = ui("fontReset");
    $("fontDown").setAttribute("aria-label", ui("fontSmaller"));
    $("fontUp").setAttribute("aria-label", ui("fontLarger"));
    $("fontReset").setAttribute("aria-label", ui("fontReset"));
    $("fontReset").innerHTML = Icons ? Icons.icon("undo") : "↺";
    $("fontValue").title = ui("fontSize");
    $("tocToggle").innerHTML = Icons ? Icons.icon("panelLeft") : "≡";
    $("tocToggle").title = ui("toc");
    $("tocToggle").setAttribute("aria-label", ui("toc"));
    $("tocToggle").setAttribute("aria-pressed", String(state.tocOpen));
    $("search").placeholder = ui("search");
    $("search").setAttribute("aria-label", ui("search"));
    $("searchClear").title = ui("clearSearch");
    $("searchClear").setAttribute("aria-label", ui("clearSearch"));
    $("tocHead").textContent = ui("contents");
    $("toc").setAttribute("aria-label", ui("contents"));
    $("winMin").title = ui("minimize");
    $("winMax").title = ui("maximize");
    $("winClose").title = ui("close");
    $("winMin").setAttribute("aria-label", ui("minimize"));
    $("winMax").setAttribute("aria-label", ui("maximize"));
    $("winClose").setAttribute("aria-label", ui("close"));
    $("lightboxClose").title = ui("closeImage");
    $("lightboxClose").setAttribute("aria-label", ui("closeImage"));
    $("guide").classList.toggle("toc-hidden", !state.tocOpen);
  }

  function renderFont() {
    document.documentElement.style.setProperty("--guide-size", state.size + "px");
    $("fontValue").textContent = state.size + "px";
    $("fontDown").disabled = state.size <= FONT_MIN;
    $("fontUp").disabled = state.size >= FONT_MAX;
    $("fontReset").disabled = state.size === FONT_DEFAULT;
  }

  function renderToc(found) {
    const query = state.query.trim().toLowerCase();
    $("tocList").innerHTML = Content.SECTIONS.map((item) => {
      const body = item[state.lang] || item.ko;
      const shown = !found || found.indexOf(item) >= 0;
      const count = found && shown ? countHits(item, query) : 0;
      const on = !found && item.id === state.section;
      return "<li" + (shown ? "" : " hidden") + ">" +
        '<button type="button" class="g-toc-link' + (on ? " on" : "") + '" data-goto="' + esc(item.id) + '"' + (on ? ' aria-current="page"' : "") + ">" +
        (Icons ? Icons.icon(item.icon) : "") + "<span>" + esc(plain(body.title)) + "</span>" +
        (count ? '<em class="g-toc-count">' + count + "</em>" : "") +
        "</button></li>";
    }).join("");
  }

  function renderPager() {
    const list = Content.SECTIONS;
    const index = list.findIndex((item) => item.id === state.section);
    const prev = list[index - 1];
    const next = list[index + 1];
    const button = (item, kind) => {
      const body = item[state.lang] || item.ko;
      return '<button type="button" class="' + kind + '" data-goto="' + esc(item.id) + '"><small>' +
        esc(ui(kind)) + "</small><b>" + esc(plain(body.title)) + "</b></button>";
    };
    $("pager").innerHTML = (prev ? button(prev, "prev") : "") + (next ? button(next, "next") : "");
  }

  function wireImages() {
    $("sections").querySelectorAll(".g-figure img").forEach((img) => {
      img.addEventListener("error", () => {
        const fallback = img.dataset.fallback;
        if (fallback) {
          img.dataset.fallback = "";
          img.src = fallback;
          return;
        }
        const figure = img.closest(".g-figure");
        if (!figure) return;
        figure.classList.add("missing");
        const box = document.createElement("div");
        box.className = "g-noimage";
        box.textContent = ui("noImage") + " — " + (img.alt || figure.dataset.image);
        img.replaceWith(box);
      });
    });
  }

  function renderContent(found) {
    const info = $("searchInfo");
    if (found) {
      $("sections").innerHTML = found.map(renderSection).join("");
      highlight($("sections"), state.query.trim());
      info.hidden = false;
      info.textContent = found.length ? ui("found").replace("{n}", found.length) : ui("notFound");
      $("pager").innerHTML = "";
    } else {
      const item = Content.section(state.section) || Content.SECTIONS[0];
      $("sections").innerHTML = renderSection(item);
      info.hidden = true;
      info.textContent = "";
      renderPager();
    }
    wireImages();
  }

  function render(options) {
    const found = matches();
    renderChrome();
    renderFont();
    renderToc(found);
    renderContent(found);
    $("searchClear").hidden = !state.query;
    if (!options || options.scroll !== false) $("content").scrollTop = 0;
  }

  /* ── actions ─────────────────────────────────────────────── */

  function show(id) {
    if (!Content.section(id)) return false;
    if (state.query.trim()) {
      const target = document.getElementById("sec-" + id);
      if (target) {
        $("content").scrollTo({ top: target.offsetTop - 12, behavior: "auto" });
        return true;
      }
      state.query = "";
      $("search").value = "";
    }
    state.section = id;
    writeGuide();
    render();
    return true;
  }

  function step(delta) {
    const list = Content.SECTIONS;
    const index = list.findIndex((item) => item.id === state.section);
    const next = list[Math.min(list.length - 1, Math.max(0, index + delta))];
    if (next) show(next.id);
  }

  function setLang(lang, userPicked) {
    const next = validLang(lang);
    if (!next) return false;
    state.lang = next;
    if (userPicked) state.userLang = next !== state.appLang ? next : "";
    writeGuide();
    render({ scroll: false });
    return true;
  }

  function setFontSize(size) {
    state.size = clampSize(size);
    writeGuide();
    renderFont();
    return state.size;
  }

  function setQuery(text) {
    state.query = String(text == null ? "" : text);
    if ($("search").value !== state.query) $("search").value = state.query;
    render();
  }

  function applySettings(settings) {
    const next = settings || readAppSettings();
    applyTheme(next);
    const lang = validLang(next.language) || "ko";
    if (lang !== state.appLang) {
      state.appLang = lang;
      state.userLang = "";
      state.lang = lang;
      writeGuide();
      render({ scroll: false });
    }
  }

  function openLightbox(img) {
    const figure = img.closest(".g-figure");
    const caption = figure ? figure.querySelector("figcaption") : null;
    $("lightboxImg").src = img.currentSrc || img.src;
    $("lightboxImg").alt = img.alt;
    $("lightboxCaption").textContent = caption ? caption.textContent : "";
    $("lightbox").hidden = false;
    $("lightboxClose").focus();
  }

  function closeLightbox() {
    if ($("lightbox").hidden) return false;
    $("lightbox").hidden = true;
    $("lightboxImg").removeAttribute("src");
    return true;
  }

  function windowCommand(name) {
    try {
      if (window.desktop && typeof window.desktop.windowCommand === "function") {
        const result = window.desktop.windowCommand(name);
        if (result && typeof result.catch === "function") result.catch(() => {});
      }
    } catch (error) { /* the host may be gone */ }
  }

  /* ── wiring ──────────────────────────────────────────────── */

  function wire() {
    if (window.desktop && typeof window.desktop.windowCommand === "function") {
      $("winButtons").hidden = false;
      $("winButtons").addEventListener("click", (event) => {
        const button = event.target.closest("[data-win]");
        if (button) windowCommand(button.dataset.win);
      });
      $("titlebar").addEventListener("dblclick", (event) => {
        if (event.target.closest("button")) return;
        if (!window.__TAURI_INTERNALS__) windowCommand("maximize");
      });
    } else {
      $("winButtons").hidden = true;
    }
    $("langKo").addEventListener("click", () => setLang("ko", true));
    $("langEn").addEventListener("click", () => setLang("en", true));
    $("fontDown").addEventListener("click", () => setFontSize(state.size - 1));
    $("fontUp").addEventListener("click", () => setFontSize(state.size + 1));
    $("fontReset").addEventListener("click", () => setFontSize(FONT_DEFAULT));
    $("tocToggle").addEventListener("click", () => {
      state.tocOpen = !state.tocOpen;
      writeGuide();
      renderChrome();
    });
    $("search").addEventListener("input", () => setQuery($("search").value));
    $("searchClear").addEventListener("click", () => {
      setQuery("");
      $("search").focus();
    });
    document.addEventListener("click", (event) => {
      const go = event.target.closest("[data-goto]");
      if (go) {
        show(go.dataset.goto);
        return;
      }
      const img = event.target.closest(".g-figure img");
      if (img) openLightbox(img);
    });
    $("lightbox").addEventListener("click", () => closeLightbox());
    window.addEventListener("keydown", (event) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.key === "Escape") {
        if (closeLightbox()) { event.preventDefault(); return; }
        if (state.query) { event.preventDefault(); setQuery(""); return; }
        return;
      }
      if (ctrl && !event.altKey && (event.key === "f" || event.key === "F" || event.code === "KeyF")) {
        event.preventDefault();
        $("search").focus();
        $("search").select();
        return;
      }
      if (ctrl && (event.key === "+" || event.key === "=" || event.code === "Equal" || event.code === "NumpadAdd")) {
        event.preventDefault();
        setFontSize(state.size + 1);
        return;
      }
      if (ctrl && (event.key === "-" || event.code === "Minus" || event.code === "NumpadSubtract")) {
        event.preventDefault();
        setFontSize(state.size - 1);
        return;
      }
      if (ctrl && (event.key === "0" || event.code === "Digit0" || event.code === "Numpad0")) {
        event.preventDefault();
        setFontSize(FONT_DEFAULT);
        return;
      }
      if (event.altKey && !ctrl && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        if (event.target.closest && event.target.closest("input")) return;
        event.preventDefault();
        step(event.key === "ArrowLeft" ? -1 : 1);
      }
    });
    window.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setFontSize(state.size + (event.deltaY < 0 ? 1 : -1));
    }, { passive: false });
    window.addEventListener("storage", (event) => {
      if (event.key === SETTINGS_KEY || event.key === null) applySettings();
    });
  }

  applyTheme(app);
  wire();
  render();
  writeGuide();

  window.MyPaintGuide = {
    ready: true,
    state: () => Object.assign({}, state),
    show: show,
    step: step,
    setLang: (lang) => setLang(lang, true),
    setFontSize: setFontSize,
    search: setQuery,
    applySettings: applySettings,
    FONT_MIN: FONT_MIN,
    FONT_MAX: FONT_MAX,
    FONT_DEFAULT: FONT_DEFAULT,
    STORAGE_KEY: GUIDE_KEY,
  };
})();

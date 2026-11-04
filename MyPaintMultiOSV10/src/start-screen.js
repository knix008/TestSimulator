/* The start screen: over the work area when the program starts (if the settings say so) and
 * whenever the home button is pressed.
 *
 * A moving 3D background (start-background.js) fills it, and over that sits a board of
 * translucent cards that can be dragged to other places and resized (start-layout.js): the hero
 * (icon, name, version, the quickest ways in), the ways to begin, the recent files, the drawings
 * already open, the themes and the background. The background, its speed, the card opacity and
 * the card layout live in settings.startScreen, shared with Settings > Start screen.
 *
 * Every action goes through the program's runAction, so the start screen can never offer
 * something the rest of the program cannot do. Changing a preference does not rebuild the cards:
 * a slider being dragged keeps its pointer, and a tile keeps its focus. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintStartScreen = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const Layout = root.MyPaintStartLayout;
  const Range = root.MyPaintRange;
  const Bg = root.MyPaintStartBackground;
  const Store = root.MyPaintStore;

  const CARD_IDS = ["hero", "begin", "recent", "docs", "theme", "background"];
  // The theme and background cards span the board so every choice is a readable tile.
  const DEFAULT_SPAN = { hero: 3, begin: 3, recent: 2, docs: 1, theme: 3, background: 3 };

  /* One background as a tile; attrs says what pressing it does in this place. */
  function backgroundTile(kind, on, attrs, host) {
    const name = host.t("start.bg." + kind);
    return '<button type="button" role="radio" aria-checked="' + (on ? "true" : "false") + '" class="bg-tile' + (on ? " on" : "") + '" data-background="' + kind + '" ' + attrs +
      ' title="' + host.esc(name + " - " + host.t("start.bg." + kind + ".hint")) + '">' +
      host.icon(Bg.ICONS[kind]) + "<span>" + host.esc(name) + "</span></button>";
  }

  function create(host) {
    const el = host.el;
    const t = host.t;
    const esc = host.esc;
    const icon = host.icon;

    let canvas = null;
    let scroller = null;
    let board = null;
    let background = null;
    let shuffleTimer = 0;
    let shuffleEvery = 0;
    let drag = null;          // { id, mode, target }
    let measured = {};
    let burst = { at: 0, n: 0 };
    let rects = new Map();
    let observer = null;
    const motion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const reduced = () => Boolean(motion && motion.matches);
    const speedNow = () => Store.effectiveStartSpeed(host.prefs(), reduced());

    /* ---------------------------------------------------------- the shell */

    function ensureShell() {
      if (canvas) return;
      el.innerHTML = '<canvas class="start-bg" aria-hidden="true"></canvas><div class="start-scroll"></div>';
      canvas = el.querySelector(".start-bg");
      scroller = el.querySelector(".start-scroll");
      background = new Bg.StartBackground(canvas, { kind: host.prefs().background, speed: () => speedNow() / 100 });
      Range.bind(el);
      el.addEventListener("click", onClick);
      el.addEventListener("change", onChange);
      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("dblclick", onDoubleClick);
      el.addEventListener("keydown", onKeyDown);
    }

    /* ---------------------------------------------------------- the cards */

    function card(id, iconName, title, body, extra) {
      const bare = id === "hero";
      return '<section class="start-card start-card-' + id + (bare ? " bare" : "") + '" data-card="' + id + '"' + (title ? ' aria-label="' + esc(title) + '"' : "") + ">" +
        (bare
          ? '<span class="card-handle-float">' + handle(id) + "</span>"
          : "<h2>" + handle(id) + icon(iconName) + '<span class="start-card-title">' + esc(title) + '</span><span class="grow"></span>' + (extra || "") + "</h2>") +
        '<div class="card-body">' + body + "</div>" +
        '<span class="card-resize" data-card-resize="' + id + '" title="' + esc(t("start.resizeCard")) + '"></span></section>';
    }

    function handle(id) {
      const label = esc(t("start.moveCard"));
      return '<button type="button" class="card-handle" data-card-handle="' + id + '" title="' + label + '" aria-label="' + label + '">' + icon("drag") + "</button>";
    }

    function button(action, iconName, label, primary, tip) {
      return '<button type="button" class="start-btn' + (primary ? " primary" : "") + '" data-action="' + action + '" title="' + esc(tip || label) + '">' + icon(iconName) + "<span>" + esc(label) + "</span></button>";
    }

    function heroCard() {
      return card("hero", "", "",
        '<img class="start-icon" src="assets/icon.png" alt="" width="76" height="76">' +
        '<div class="start-hero-text"><h1 id="startTitle"><span>' + esc(host.build.name) + '</span><small title="' + esc(host.build.title) + '">v' + esc(host.build.version) + "</small></h1>" +
        "<p>" + esc(t("start.subtitle")) + "</p></div>" +
        '<div class="start-hero-actions"><div class="start-docs">' +
        button("guide", "help", t("help.guide")) +
        button("settingsStart", "settings", t("start.settings")) +
        "</div>" +
        button("new", "new", t("file.new"), true) +
        button("open", "open", t("file.open")) +
        button("openUrl", "link", t("file.openUrl")) +
        "</div>");
    }

    function beginCard() {
      const tiles = [
        ["new", "new", t("file.new"), t("start.hint.new")],
        ["open", "open", t("file.open"), t("start.hint.open")],
        ["openUrl", "link", t("file.openUrl"), t("start.hint.openUrl")],
        ["hideStart", "canvas", t("start.continue"), t("start.hint.continue")],
        ["formats", "image", t("popup.formats"), t("start.hint.formats")],
        ["recentManager", "folder", t("file.manageRecent"), t("start.hint.recent")],
      ];
      return card("begin", "new", t("start.begin"),
        '<div class="start-tiles">' + tiles.map((row) => (
          '<button type="button" class="start-tile" data-action="' + row[0] + '" title="' + esc(row[3]) + '">' + icon(row[1]) + "<b>" + esc(row[2]) + "</b><small>" + esc(row[3]) + "</small></button>"
        )).join("") + "</div>");
    }

    function recentCard() {
      const rows = host.recent();
      const list = rows.map((row) => (
        '<div class="start-row">' +
        '<button type="button" class="start-link" data-action="recent:' + esc(row.id) + '" title="' + esc(row.path || row.name) + '">' +
        icon(host.isDrawing(row.name) ? "file" : "image") +
        '<span class="name">' + esc(row.name) + '</span><span class="path">' + esc(Store.directoryOf(row.path) || "") + "</span></button>" +
        '<button type="button" class="start-x" data-action="recentRemove:' + esc(row.id) + '" title="' + esc(t("recent.remove")) + '" aria-label="' + esc(t("recent.remove") + " " + row.name) + '">' + icon("trash") + "</button></div>"
      )).join("");
      return card("recent", "folder", t("file.recent"),
        '<div class="start-list">' + (list || '<div class="start-empty">' + icon("about") + "<span>" + esc(t("recent.empty")) + "</span></div>") + "</div>" +
        '<p class="start-hint">' + icon("drag") + "<span>" + esc(t("start.dropHint")) + "</span></p>",
        rows.length ? '<button type="button" class="start-btn small" data-action="clearRecent">' + icon("trash") + "<span>" + esc(t("action.deleteAll")) + "</span></button>" : "");
    }

    function docsCard() {
      const activeIndex = host.activeIndex();
      const list = host.docs().map((doc, index) => (
        '<div class="start-row">' +
        '<button type="button" class="start-link' + (index === activeIndex ? " on" : "") + '" data-action="startDoc:' + index + '" title="' + esc(doc.path || doc.name) + '">' +
        icon(host.isDrawing(doc.name) ? "file" : "image") +
        '<span class="name">' + esc((doc.dirty ? "* " : "") + doc.name) + '</span><span class="path">' + doc.width + " x " + doc.height + "</span></button>" +
        '<button type="button" class="start-x" data-action="startDocClose:' + index + '" title="' + esc(t("start.docClose")) + '" aria-label="' + esc(t("start.docClose") + " " + doc.name) + '">' + icon("clear") + "</button></div>"
      )).join("");
      return card("docs", "canvas", t("start.docs"), '<div class="start-list">' + list + "</div>");
    }

    function themeTile(item) {
      const name = host.themeName(item);
      return '<button type="button" role="radio" aria-checked="false" class="bg-tile st-theme-tile" data-theme-id="' + esc(item.id) + '" data-action="theme:' + esc(item.id) + '" title="' + esc(name) + '">' +
        '<span class="st-theme-chip" aria-hidden="true"></span><span>' + esc(name) + "</span></button>";
    }

    function themeCard() {
      const group = (mode, iconName, label) => (
        '<section class="st-theme-group" data-theme-kind="' + mode + '"><h3>' + icon(iconName) + "<span>" + esc(label) + "</span></h3>" +
        '<div class="bg-grid st-theme-tiles" role="radiogroup" aria-label="' + esc(label) + '">' +
        host.themes().filter((item) => item.mode === mode).map(themeTile).join("") + "</div></section>"
      );
      return card("theme", "themePalette", t("start.theme"),
        '<div class="st-theme-groups"><div class="st-theme-custom-row" role="radiogroup" aria-label="' + esc(t("theme.custom")) + '">' +
        themeTile(host.customTheme()) +
        button("themeCustom", "settings", t("start.themeEdit")) +
        '</div><div class="st-theme-columns">' +
        group("light", "sun", t("theme.light")) + group("dark", "moon", t("theme.dark")) +
        "</div></div>",
        '<span class="start-card-note" data-theme-note></span>');
    }

    function backgroundCard() {
      const prefs = host.prefs();
      const range = (field, iconName, label, min, max, step, value, tip) => (
        '<div class="start-range"' + (tip ? ' title="' + esc(tip) + '"' : "") + '><span class="start-range-label">' + icon(iconName) + "<span>" + esc(label) + "</span></span>" +
        Range.html({ field: field, label: esc(label), min: min, max: max, step: step, suffix: "%", value: value }) + "</div>"
      );
      return card("background", "image", t("start.background"),
        '<div class="bg-grid" role="radiogroup" aria-label="' + esc(t("start.background")) + '">' +
        Bg.KINDS.map((kind) => backgroundTile(kind, kind === prefs.background, 'data-start-bg="' + kind + '"', host)).join("") +
        '<button type="button" role="switch" aria-checked="false" class="bg-tile shuffle" data-start-shuffle title="' + esc(t("start.shuffleTip").replace("{0}", Store.START_SHUFFLE_SECONDS)) + '">' + icon("shuffle") + "<span>" + esc(t("start.shuffle")) + "</span></button>" +
        "</div>" +
        '<div class="start-ranges">' +
        range("startCardSpeed", "speed", t("start.speed"), Store.START_SPEED.min, Store.START_SPEED.max, Store.START_SPEED.step, speedNow(), reduced() && prefs.speed === null ? t("start.reducedMotion") : "") +
        range("startCardOpacity", "opacity", t("start.cardOpacity"), Store.START_OPACITY.min, Store.START_OPACITY.max, Store.START_OPACITY.step, prefs.cardOpacity) +
        "</div>");
    }

    function render() {
      ensureShell();
      if (drag) return;
      const top = scroller.scrollTop;
      const prefs = host.prefs();
      const cards = { hero: heroCard, begin: beginCard, recent: recentCard, docs: docsCard, theme: themeCard, background: backgroundCard };
      scroller.innerHTML =
        '<div class="start-inner">' +
        '<div class="start-tools">' +
        '<label class="start-show"><input type="checkbox" data-start-show' + (prefs.show ? " checked" : "") + "><span>" + esc(t("start.showAtStart")) + "</span></label>" +
        '<span class="grow"></span>' +
        '<button type="button" class="start-btn" data-start-arrange title="' + esc(t("start.autoArrangeTip")) + '">' + icon("grid") + "<span>" + esc(t("start.autoArrange")) + "</span></button>" +
        "</div>" +
        '<div class="start-board">' + CARD_IDS.map((id) => cards[id]()).join("") + "</div>" +
        '<footer class="start-foot">' + icon("about") + '<span class="grow">' + esc(host.build.title) + '</span><span class="muted">&copy; ' + esc(host.build.author) + "</span></footer>" +
        "</div>";
      board = scroller.querySelector(".start-board");
      rects = new Map();
      if (observer) observer.disconnect();
      observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
      if (observer) {
        cardNodes().forEach((node) => observer.observe(node));
        observer.observe(board);
      }
      syncPrefs();
      syncTheme();
      layout();
      measure();
      scroller.scrollTop = top;
    }

    /* ---------------------------------------------- following the settings */

    /* Everything a preference changes, without rebuilding a thing. */
    function syncPrefs() {
      if (!board) return;
      const prefs = host.prefs();
      el.style.setProperty("--start-card-alpha", prefs.cardOpacity + "%");
      canvas.dataset.backgroundKind = prefs.background;
      el.querySelectorAll("[data-start-bg]").forEach((node) => {
        const on = node.dataset.startBg === prefs.background;
        node.classList.toggle("on", on);
        node.setAttribute("aria-checked", on ? "true" : "false");
      });
      const shuffle = el.querySelector("[data-start-shuffle]");
      shuffle.classList.toggle("on", prefs.shuffleSec > 0);
      shuffle.setAttribute("aria-checked", prefs.shuffleSec > 0 ? "true" : "false");
      Range.show(el.querySelector('[data-range="startCardSpeed"]'), speedNow());
      Range.show(el.querySelector('[data-range="startCardOpacity"]'), prefs.cardOpacity);
      el.querySelector("[data-start-show]").checked = prefs.show;
      background.setKind(prefs.background);
      if (!el.hidden) run();
      layout();
    }

    /* A speed of zero keeps the last frame rather than redrawing the same one. */
    function run() {
      if (speedNow() > 0) background.start();
      else background.still();
      const every = host.prefs().shuffleSec;
      if (every === shuffleEvery && (shuffleTimer || !every)) return;
      clearInterval(shuffleTimer);
      shuffleTimer = 0;
      shuffleEvery = every;
      if (every) shuffleTimer = setInterval(() => background.shuffle(), every * 1000);
    }

    function syncTheme() {
      if (!board) return;
      const id = host.themeId();
      const paint = (node, item) => {
        const on = item.id === id;
        node.classList.toggle("on", on);
        node.setAttribute("aria-checked", on ? "true" : "false");
        const chip = node.querySelector(".st-theme-chip");
        chip.style.background = item.swatch[0];
        chip.style.borderColor = item.swatch[2];
        chip.innerHTML = '<i style="background:' + item.swatch[1] + '"></i><i style="background:' + item.swatch[2] + '"></i>';
      };
      const items = host.themes().concat([host.customTheme()]);
      el.querySelectorAll("[data-theme-id]").forEach((node) => {
        const item = items.find((row) => row.id === node.dataset.themeId);
        if (item) paint(node, item);
      });
      const note = el.querySelector("[data-theme-note]");
      const current = items.find((row) => row.id === id);
      if (note && current) note.textContent = host.themeName(current);
      background.refreshColors();
    }

    /* -------------------------------------------------------------- board */

    const cardNodes = () => [...board.querySelectorAll(":scope > .start-card:not(.start-ghost)")];
    const saved = () => Layout.cardsOf(host.prefs().layout, CARD_IDS, DEFAULT_SPAN, measured);
    const saveLayout = (cards) => host.savePrefs({ layout: Layout.layoutValue(Layout.compact(cards)) });

    function layout() {
      if (!board) return;
      const base = saved();
      const now = drag && drag.target ? Layout.place(base, drag.id, drag.target) : base;
      cardNodes().forEach((node) => {
        const id = node.dataset.card;
        const mine = drag && drag.id === id;
        const cell = mine ? base[id] : now[id];
        node.style.gridColumn = (cell.col + 1) + " / span " + cell.w;
        node.style.gridRow = (cell.row + 1) + " / span " + cell.h;
        node.style.height = cell.fit ? "" : (cell.h * Layout.ROW - Layout.GAP) + "px";
        node.classList.toggle("fit", cell.fit);
        node.classList.toggle("fixed-height", !cell.fit);
        node.classList.toggle("drag-origin", Boolean(mine && drag.mode === "move"));
        node.classList.toggle("resizing", Boolean(mine && drag.mode === "resize"));
      });
      const outline = board.querySelector(".card-drop-outline");
      if (drag && drag.target) {
        const cell = now[drag.id];
        const box = outline || board.appendChild(Object.assign(document.createElement("div"), { className: "card-drop-outline" }));
        box.style.gridColumn = (cell.col + 1) + " / span " + cell.w;
        box.style.gridRow = (cell.row + 1) + " / span " + cell.h;
        box.style.height = (cell.h * Layout.ROW - Layout.GAP) + "px";
      } else if (outline) {
        outline.remove();
      }
      slide();
    }

    /* The other cards slide to their new places rather than jumping. */
    function slide() {
      const seen = new Map();
      cardNodes().forEach((node) => {
        const box = node.getBoundingClientRect();
        const before = rects.get(node.dataset.card);
        seen.set(node.dataset.card, box);
        if (!before || reduced() || node.classList.contains("drag-origin") || !node.animate) return;
        const dx = before.left - box.left;
        const dy = before.top - box.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          node.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "translate(0,0)" }], { duration: 180, easing: "ease-out" });
        }
      });
      rects = seen;
    }

    /* Fit cards take the height of their content, measured in rows. Growing always applies;
     * shrinking by a single row does not, so a card whose height depends on where compaction put
     * it cannot flip between two heights. A burst of updates stops after a dozen. */
    function measure() {
      if (!board || el.hidden) return;
      const now = performance.now();
      if (now - burst.at > 1000) burst = { at: now, n: 0 };
      if (burst.n > 12) return;
      let changed = false;
      cardNodes().filter((node) => node.classList.contains("fit")).forEach((node) => {
        const id = node.dataset.card;
        const rows = Layout.rowsFor(node.offsetHeight);
        if (measured[id] === undefined || rows > measured[id] || measured[id] - rows > 1) {
          measured[id] = rows;
          changed = true;
        }
      });
      if (changed) {
        burst.n += 1;
        layout();
      }
    }

    const columnWidth = () => (board.getBoundingClientRect().width - Layout.GAP * (Layout.COLS - 1)) / Layout.COLS;

    function cellAt(x, y, w) {
      const box = board.getBoundingClientRect();
      const col = columnWidth();
      return {
        col: Math.max(0, Math.min(Layout.COLS - w, Math.round((x - box.left) / (col + Layout.GAP)))),
        row: Math.max(0, Math.round((y - box.top) / Layout.ROW)),
      };
    }

    function autoScroll(event) {
      const box = scroller.getBoundingClientRect();
      if (event.clientY > box.bottom - 36) scroller.scrollTop += 14;
      else if (event.clientY < box.top + 36) scroller.scrollTop -= 14;
    }

    function follow(move, done) {
      const up = (event) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        done(event);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }

    /* A see-through copy of the dragged card that follows the pointer. */
    function dragGhost(node, event) {
      const box = node.getBoundingClientRect();
      const offX = event.clientX - box.left;
      const offY = event.clientY - box.top;
      const ghost = node.cloneNode(true);
      ghost.classList.add("start-ghost");
      ghost.removeAttribute("data-card");
      ghost.setAttribute("aria-hidden", "true");
      ghost.querySelectorAll("[data-action],[data-field],[id]").forEach((child) => {
        child.removeAttribute("data-action");
        child.removeAttribute("data-field");
        child.removeAttribute("id");
      });
      Object.assign(ghost.style, { width: box.width + "px", height: box.height + "px", transformOrigin: offX + "px " + offY + "px", gridColumn: "auto", gridRow: "auto" });
      let last = { x: event.clientX, y: event.clientY };
      const put = () => {
        const b = board.getBoundingClientRect();
        ghost.style.left = (last.x - offX - b.left) + "px";
        ghost.style.top = (last.y - offY - b.top) + "px";
      };
      put();
      board.appendChild(ghost);
      return {
        topLeft: () => ({ x: last.x - offX, y: last.y - offY }),
        move: (e) => { last = { x: e.clientX, y: e.clientY }; put(); },
        destroy: () => ghost.remove(),
      };
    }

    function startMove(event, id) {
      event.preventDefault();
      const node = event.target.closest(".start-card");
      const ghost = dragGhost(node, event);
      const c = saved()[id];
      let target = { col: c.col, row: c.row };
      drag = { id: id, mode: "move", target: target };
      layout();
      follow((ev) => {
        // Scroll first: the ghost is placed against the board, which scrolling moves.
        autoScroll(ev);
        ghost.move(ev);
        const p = ghost.topLeft();
        const next = cellAt(p.x, p.y, c.w);
        if (next.col !== target.col || next.row !== target.row) {
          target = next;
          drag = { id: id, mode: "move", target: target };
          layout();
        }
      }, (ev) => {
        ghost.destroy();
        const before = saved();
        drag = null;
        if (ev.type === "pointerup" && (target.col !== c.col || target.row !== c.row)) saveLayout(Layout.place(before, id, target));
        else layout();
      });
    }

    function startResize(event, id) {
      event.preventDefault();
      event.stopPropagation();
      const node = event.target.parentElement;
      const box = node.getBoundingClientRect();
      const col = columnWidth();
      const c = saved()[id];
      const startX = event.clientX;
      const startY = event.clientY;
      let target = { w: c.w, h: c.h };
      drag = { id: id, mode: "resize", target: null };
      layout();
      follow((ev) => {
        autoScroll(ev);
        const w = Math.max(1, Math.min(Layout.COLS - c.col, Math.round((box.width + ev.clientX - startX + Layout.GAP) / (col + Layout.GAP))));
        const h = Math.max(4, Math.round((box.height + ev.clientY - startY + Layout.GAP) / Layout.ROW));
        if (w !== target.w || h !== target.h) {
          target = { w: w, h: h };
          drag = { id: id, mode: "resize", target: Object.assign({}, target, { fit: false }) };
          layout();
        }
      }, (ev) => {
        const before = saved();
        drag = null;
        if (ev.type === "pointerup" && (target.w !== c.w || target.h !== c.h)) saveLayout(Layout.place(before, id, Object.assign({}, target, { fit: false })));
        else layout();
      });
    }

    /* ------------------------------------------------------------- events */

    function arrange() {
      saveLayout(Layout.autoArrange(CARD_IDS, DEFAULT_SPAN, measured));
    }

    function onClick(event) {
      const node = event.target.closest("button, [data-action]");
      if (!node || node.disabled) return;
      if (node.dataset.startBg) { host.savePrefs({ background: node.dataset.startBg }); return; }
      if ("startShuffle" in node.dataset) {
        host.savePrefs({ shuffleSec: host.prefs().shuffleSec > 0 ? 0 : Store.START_SHUFFLE_SECONDS });
        return;
      }
      if ("startArrange" in node.dataset) { arrange(); return; }
      if (node.dataset.action) host.run(node.dataset.action);
    }

    function onChange(event) {
      const target = event.target;
      if ("startShow" in target.dataset) { host.savePrefs({ show: target.checked }); return; }
      if (target.dataset.field === "startCardSpeed") host.savePrefs({ speed: Number(target.value) });
      if (target.dataset.field === "startCardOpacity") host.savePrefs({ cardOpacity: Number(target.value) });
    }

    function onPointerDown(event) {
      if (event.button !== 0 || !board) return;
      const grab = event.target.closest("[data-card-handle]");
      if (grab) { startMove(event, grab.dataset.cardHandle); return; }
      const corner = event.target.closest("[data-card-resize]");
      if (corner) startResize(event, corner.dataset.cardResize);
    }

    function onDoubleClick(event) {
      const corner = event.target.closest("[data-card-resize]");
      if (corner) saveLayout(Layout.place(saved(), corner.dataset.cardResize, { fit: true }));
    }

    /* Alt+arrows move a card one cell; Alt+Shift+arrows resize it. */
    function onKeyDown(event) {
      const grab = event.target.closest && event.target.closest("[data-card-handle]");
      if (!grab || !event.altKey || !event.key.startsWith("Arrow")) return;
      event.preventDefault();
      event.stopPropagation();
      const id = grab.dataset.cardHandle;
      const cards = saved();
      const c = Object.assign({}, cards[id]);
      const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (event.shiftKey) {
        c.w = Math.max(1, Math.min(Layout.COLS - c.col, c.w + dx));
        if (dy) {
          c.h = Math.max(4, c.h + dy);
          c.fit = false;
        }
        saveLayout(Layout.place(cards, id, c));
      } else if (dy) {
        // A plain move up or down would compact straight back: swap with the neighbour.
        saveLayout(Layout.swapVertical(cards, id, dy));
      } else {
        c.col = Math.max(0, Math.min(Layout.COLS - c.w, c.col + dx));
        saveLayout(Layout.place(cards, id, c));
      }
      const back = board.querySelector('[data-card-handle="' + id + '"]');
      if (back) back.focus();
    }

    /* ------------------------------------------------------------ showing */

    function show() {
      ensureShell();
      el.hidden = false;
      background.resize(); // it was measured while hidden
      render();
      run();
      background.refreshColors();
    }

    function hide() {
      el.hidden = true;
      if (background) background.stop();
      clearInterval(shuffleTimer);
      shuffleTimer = 0;
      shuffleEvery = 0;
    }

    return {
      show: show,
      hide: hide,
      render: render,
      syncPrefs: syncPrefs,
      syncTheme: syncTheme,
      arrange: arrange,
      background: () => background,
      cells: saved,
    };
  }

  return { create: create, backgroundTile: backgroundTile, CARD_IDS: CARD_IDS, DEFAULT_SPAN: DEFAULT_SPAN };
});

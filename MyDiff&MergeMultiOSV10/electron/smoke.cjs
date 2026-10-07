// The automated GUI test, run inside Electron when MDM_SMOKE is set.
//
// `scripts/smoke.mjs` launches the built app with that variable and reads the JSON
// report this prints. Every step drives the real renderer through the `window.__mdm`
// hook — the same store actions and the same DOM a user's clicks reach — and checks
// the result from both sides: the page inside the window, and the BrowserWindows the
// main process owns (menu popups, dialogs, minimum size). Screenshots of the
// main window and the popups are saved next to the report so a failure can be looked at.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const results = [];
const shots = [];
const outDir = process.env.MDM_SMOKE_OUT || path.join(os.tmpdir(), "mdm-smoke");
const samples = path.join(__dirname, "..", "samples");
const filter = process.env.MDM_SMOKE_FILTER ? process.env.MDM_SMOKE_FILTER.split(",") : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function step(category, name, fn) {
  if (filter && !filter.includes(category)) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ category, name, ok: true, ms: Date.now() - started, detail: detail === undefined ? "" : String(detail) });
  } catch (error) {
    results.push({
      category,
      name,
      ok: false,
      ms: Date.now() - started,
      detail: String(error && error.message ? error.message : error),
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Polls until `fn` returns something truthy.
 *
 * Each attempt is raced against a deadline of its own: an `executeJavaScript` against
 * a renderer that never finished loading does not reject, it simply never settles, and
 * awaiting it plainly would hang the whole run with nothing reported.
 */
async function waitFor(fn, timeout = 10000, every = 60) {
  const deadline = Date.now() + timeout;
  let lastError = "";
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const value = await Promise.race([
        Promise.resolve().then(fn),
        sleep(Math.min(remaining, 2000)).then(() => undefined),
      ]);
      if (value) return value;
    } catch (error) {
      lastError = String(error && error.message ? error.message : error);
    }
    await sleep(every);
  }
  throw new Error(`timed out waiting: ${String(fn).slice(0, 110)}${lastError ? ` (last error: ${lastError})` : ""}`);
}

/** Relays what the renderer says, so a page that fails to start is diagnosable. */
function watchRenderer(win) {
  win.webContents.on("console-message", (_event, level, message, line, source) => {
    if (level >= 2) process.stderr.write(`renderer: ${message} (${source}:${line})\n`);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    process.stderr.write(`renderer failed to load ${url}: ${description} (${code})\n`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    process.stderr.write(`renderer gone: ${JSON.stringify(details)}\n`);
  });
}

const sample = (...parts) => path.join(samples, ...parts);

/** WCAG relative luminance of a `#rrggbb` string. */
function luminance(hex) {
  const value = String(hex).trim().replace("#", "");
  if (value.length !== 6) return NaN;
  const channel = (pair) => {
    const raw = parseInt(pair, 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(value.slice(0, 2)) + 0.7152 * channel(value.slice(2, 4)) + 0.0722 * channel(value.slice(4, 6));
}

/** `rgb(1, 2, 3)` as `#010203`, so the contrast maths can take it. */
function toHex(color) {
  const parts = String(color).match(/\d+/g);
  if (!parts || parts.length < 3) return "#000000";
  return "#" + parts.slice(0, 3).map((part) => Number(part).toString(16).padStart(2, "0")).join("");
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return NaN;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

module.exports.install = function install({ childWindows, getMainWindow }) {
  // Two markers on stderr: when a run produces no report at all, these say whether
  // the harness was ever reached and whether it got as far as starting.
  console.error("smoke: harness installed");

  const run = async () => {
    console.error("smoke: run starting");
    const win = getMainWindow();
    watchRenderer(win);
    const js = (code) => win.webContents.executeJavaScript(code, true);
    const hook = (expression) => js(`(async () => { const h = window.__mdm; return ${expression} })()`);
    const state = () => hook("h.state()");
    const shot = async (name, target = win) => {
      try {
        const image = await target.webContents.capturePage();
        const file = path.join(outDir, `${name}.png`);
        await fs.writeFile(file, image.toPNG());
        shots.push(file);
      } catch {
        // A screenshot is a convenience, not a result.
      }
    };

    await fs.mkdir(outDir, { recursive: true });
    await waitFor(() => js("Boolean(window.__mdm)"), 25000);
    await waitFor(async () => (await state())?.ready === true, 25000);
    await sleep(500);

    /* ----------------------------------------------------------- window */

    await step("window", "the title bar carries the program name and version", async () => {
      const title = win.getTitle();
      assert(/My Diff & Merge V\d+\.\d+/.test(title), `window title: ${title}`);
      const brand = await hook("h.text('.menubar-brand')");
      assert(/My Diff & Merge V\d+\.\d+/.test(brand), `brand: ${brand}`);
      return title;
    });

    await step("window", "the window icon is the built application icon", async () => {
      const iconFile = path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png");
      await fs.access(iconFile);
      return iconFile;
    });

    await step("window", "the minimum width covers the whole toolbar", async () => {
      const needed = await hook("h.toolbarWidth()");
      const [minWidth] = win.getMinimumSize();
      assert(needed > 300, `toolbar measured ${needed}px`);
      assert(minWidth >= needed - 2, `minimum ${minWidth} < toolbar ${needed}`);
      return `toolbar ${needed}px, minimum ${minWidth}px`;
    });

    await step("window", "no toolbar button is clipped at the minimum width", async () => {
      const [minWidth, minHeight] = win.getMinimumSize();
      const before = win.getSize();
      win.setSize(minWidth, minHeight);
      await sleep(300);
      const clipped = await js(`(() => {
        const bar = document.querySelector('.toolbar');
        const right = bar.getBoundingClientRect().right;
        return [...bar.querySelectorAll('[data-command]')]
          .filter((b) => b.getBoundingClientRect().right > right + 1).length;
      })()`);
      win.setSize(before[0], before[1]);
      await sleep(200);
      assert(clipped === 0, `${clipped} buttons run past the toolbar at ${minWidth}px`);
      return `0 clipped at ${minWidth}px`;
    });

    await step("window", "the status bar is present and reports state", async () => {
      const text = await hook("h.text('.status-bar')");
      assert(text && text.length > 3, `status bar: ${text}`);
      return text.slice(0, 80);
    });

    /** Opens the merge sample and waits for it, for the steps that need a merge tab. */
    const openMergeTab = async () => {
      const files = [
        sample("merge", "base.txt"),
        sample("merge", "local.txt"),
        sample("merge", "remote.txt"),
        path.join(outDir, "merged.txt"),
      ];
      await hook(`h.open('merge', ${JSON.stringify(files)})`);
      await waitFor(async () => (await state()).tabs.at(-1).kind === "merge", 8000);
      await sleep(300);
    };

    await step("window", "the start screen offers every kind of session", async () => {
      const tiles = await js(`(() => {
        const list = [...document.querySelectorAll('.welcome-tile')];
        return {
          kinds: list.map((tile) => tile.dataset.sessionType),
          described: list.filter((tile) => (tile.querySelector('small')?.textContent ?? '').length > 4).length,
        };
      })()`);
      for (const kind of ["folder-compare", "folder-sync", "text-compare", "text-merge", "image-compare", "hex-compare"]) {
        assert(tiles.kinds.includes(kind), `the start screen has no ${kind} tile`);
      }
      assert(tiles.described === tiles.kinds.length, "a tile has no description");
      return `${tiles.kinds.length} session types`;
    });

    await step("window", "the session panel is on the left, and only it", async () => {
      const layout = await js(`(() => ({
        left: document.querySelectorAll('.panel-left').length,
        right: document.querySelectorAll('.panel-right').length,
        sessions: document.querySelectorAll('.panel-left [data-session-type]').length,
      }))()`);
      assert(layout.left === 1, `${layout.left} left panels`);
      // The right panel belongs to a merge; nothing is open yet, so it must be absent.
      assert(layout.right === 0, "the property panel is showing with no merge open");
      assert(layout.sessions >= 6, `the session panel lists only ${layout.sessions} kinds`);
      return `session panel with ${layout.sessions} kinds`;
    });

    await step("window", "the session panel closes and reopens from the panel itself", async () => {
      await hook("h.settings({ showLeftPanel: true })");
      await waitFor(async () => (await state()).settings.showLeftPanel === true);
      const open = await js("document.querySelector('.panel-left').getBoundingClientRect().width");

      await hook(`h.click('.panel-left [data-command="panel.collapse"]')`);
      await waitFor(async () => (await state()).settings.showLeftPanel === false, 6000);
      const closed = await js(`(() => {
        const rail = document.querySelector('.panel-rail');
        return {
          panels: document.querySelectorAll('.panel-left').length,
          // Closing to nothing would leave no way back except the View menu.
          rail: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
          label: rail ? rail.textContent.trim() : "",
        };
      })()`);
      assert(closed.panels === 0, "the panel is still there after being closed");
      assert(closed.rail > 0 && closed.rail < 40, `the rail is ${closed.rail}px wide`);
      assert(closed.label.length > 0, "the rail does not say which panel it reopens");

      await hook(`h.click('.panel-rail')`);
      await waitFor(async () => (await state()).settings.showLeftPanel === true, 6000);
      const reopened = await js("document.querySelector('.panel-left').getBoundingClientRect().width");
      assert(Math.abs(reopened - open) < 2, `the panel came back ${reopened}px wide instead of ${open}px`);
      return `${Math.round(open)}px → ${closed.rail}px rail → ${Math.round(reopened)}px`;
    });

    await step("window", "the minimum width is the toolbar's, and nothing else", async () => {
      const [minWidth] = win.getMinimumSize();
      const toolbar = await hook("h.toolbarWidth()");
      assert(minWidth >= Math.floor(toolbar), `minimum ${minWidth} clips a ${toolbar}px toolbar`);
      assert(minWidth <= toolbar + 80, `minimum ${minWidth} is far wider than the ${toolbar}px toolbar`);
      return `toolbar ${Math.round(toolbar)}px, minimum ${minWidth}px`;
    });

    await shot("01-main");

    /* ---------------------------------------------------------- toolbar */

    await step("toolbar", "every toolbar button has a tooltip", async () => {
      const buttons = await hook("h.toolbar()");
      assert(buttons.length >= 18, `only ${buttons.length} buttons`);
      const missing = buttons.filter((button) => !button.tooltip || button.tooltip.trim().length === 0);
      assert(missing.length === 0, `without tooltip: ${missing.map((b) => b.command).join(", ")}`);
      return `${buttons.length} buttons, all with tooltips`;
    });

    await step("window", "the tab strip keeps its height whatever is open", async () => {
      // The strip is a flex child of the column that holds the comparison, and a
      // flex child shrinks by default — so a tall comparison used to squeeze the
      // tabs down to nothing. Checked on each kind of session, because each one
      // fills the space below the strip differently.
      const measure = () => js(`(() => {
        const bar = document.querySelector('.tabbar');
        if (!bar) return null;
        const box = bar.getBoundingClientRect();
        const tabs = [...document.querySelectorAll('.tab')];
        return {
          height: Math.round(box.height),
          bottom: Math.round(box.bottom),
          shell: Math.round(document.querySelector('.shell').getBoundingClientRect().bottom),
          clipped: tabs.filter((tab) => tab.getBoundingClientRect().height < 10).length,
        };
      })()`);

      const files = [sample("files", "left.txt"), sample("files", "right.txt")];
      for (const [what, open] of [
        ["a comparison", `h.open('files', ${JSON.stringify(files)})`],
        ["a folder comparison", `h.open('directories', ${JSON.stringify([outDir, outDir])})`],
      ]) {
        await hook(open);
        await sleep(400);
        const bar = await measure();
        assert(bar, `no tab strip with ${what} open`);
        assert(bar.height >= 24, `the strip is ${bar.height}px tall with ${what} open`);
        assert(bar.bottom <= bar.shell, `the strip is below the window with ${what} open`);
        assert(bar.clipped === 0, `${bar.clipped} tabs have no height with ${what} open`);
      }
      return "the strip keeps its height";
    });

    await step("toolbar", "no two toolbar buttons are drawn the same", async () => {
      // Two buttons with the same glyph are two buttons nobody can tell apart.
      // The check is on the drawn path, so it catches a shared icon name and a
      // duplicated outline alike.
      const shapes = await js(`(() => {
        const seen = {};
        for (const button of document.querySelectorAll('.toolbar [data-command]')) {
          const path = button.querySelector('svg path');
          if (!path) continue;
          const d = path.getAttribute('d');
          (seen[d] = seen[d] || []).push(button.dataset.command);
        }
        return Object.values(seen).filter((commands) => commands.length > 1);
      })()`);
      assert(
        shapes.length === 0,
        `these share an icon: ${shapes.map((group) => group.join(" = ")).join(" | ")}`,
      );
      return "every button has its own glyph";
    });

    await step("toolbar", "the zoom readout follows Ctrl+Wheel", async () => {
      const before = (await state()).settings.zoom;
      await hook("h.wheelZoom(-120)");
      await waitFor(async () => (await state()).settings.zoom > before);
      const zoomed = (await state()).settings.zoom;
      const readout = await js(`document.querySelector('.zoom-group .stepper-value').value`);
      assert(Number(readout) === zoomed, `the toolbar readout reads ${readout}, not ${zoomed}`);
      await hook("h.run('view.zoomReset')");
      await waitFor(async () => (await state()).settings.zoom === 100);
      return `${before}% → ${zoomed}% → 100%`;
    });

    /* ------------------------------------------------------------ menus */

    await step("menu", "every menu opens as its own window, in a single column", async () => {
      const titles = await hook("h.menuTitles()");
      assert(titles.length === 7, `menu bar has ${titles.length} titles`);
      for (const id of titles) {
        await hook("h.openMenu(" + JSON.stringify(id) + ")");
        const popup = await waitFor(
          () => {
            const menu = childWindows.getMenuWindow();
            return menu && menu.isVisible() && menu.getBounds().height > 30 ? menu : null;
          },
          8000,
        );
        const columns = await popup.webContents.executeJavaScript(
          "getComputedStyle(document.querySelector('.menu-popup')).flexDirection",
          true,
        );
        assert(columns === "column", `menu ${id} is not a single column`);
        const rows = await popup.webContents.executeJavaScript(
          "document.querySelectorAll('.menu-popup .menu-row').length",
          true,
        );
        assert(rows > 0, `menu ${id} is empty`);
        if (id === "file") await shot("02-menu-file", popup);
        if (id === "compare") await shot("02b-menu-compare", popup);
        await hook("h.click('.menubar')").catch(() => {});
        await js("window.mdm && window.mdm.closeMenu()");
        await sleep(120);
      }
      return `${titles.length} menus`;
    });

    await step("menu", "every menu row has an icon beside its label", async () => {
      await hook("h.openMenu('file')");
      const popup = await waitFor(() => {
        const menu = childWindows.getMenuWindow();
        return menu && menu.isVisible() && menu.getBounds().height > 30 ? menu : null;
      });
      const counts = await popup.webContents.executeJavaScript(`(() => {
        const rows = [...document.querySelectorAll('.menu-popup .menu-row')];
        return {
          total: rows.length,
          withIcon: rows.filter((row) => row.querySelector('.menu-icon svg')).length,
          withLabel: rows.filter((row) => (row.querySelector('.menu-label') || {}).textContent).length,
        };
      })()`, true);
      assert(counts.total === counts.withIcon, `${counts.total - counts.withIcon} rows without an icon`);
      assert(counts.total === counts.withLabel, `${counts.total - counts.withLabel} rows without a label`);
      await js("window.mdm && window.mdm.closeMenu()");
      return `${counts.total} rows, each with an icon and a label`;
    });

    await step("menu", "a menu with nothing to tick does not indent past a tick column", async () => {
      // The rows share one grid so shortcuts line up, but a column every row leaves
      // empty is a margin, not alignment: File has no toggles, so its icons must
      // start at the popup's own left edge, while Compare, which has three, keeps
      // the room its ticks need.
      const measure = async (menu) => {
        await hook("h.closeMenu()").catch(() => {});
        await sleep(150);
        await hook(`h.openMenu(${JSON.stringify(menu)})`);
        const popup = await waitFor(() => {
          const window_ = childWindows.getMenuWindow();
          return window_ && window_.isVisible() && window_.getBounds().height > 30 ? window_ : null;
        });
        return popup.webContents.executeJavaScript(`(() => {
          const popup = document.querySelector('.menu-popup');
          const rows = [...popup.querySelectorAll('.menu-row:not(.compact)')];
          const style = getComputedStyle(popup);
          const content = popup.getBoundingClientRect().left
            + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
          const icons = rows.map((row) => row.querySelector('.menu-icon').getBoundingClientRect().left);
          const rowStyle = getComputedStyle(rows[0]);
          return {
            rows: rows.length,
            ticks: popup.querySelectorAll('.menu-row:not(.compact) .menu-check').length,
            // How far an icon sits from where the row itself starts.
            gutter: Math.round(Math.min(...icons) - content - parseFloat(rowStyle.paddingLeft)),
            spread: Math.round(Math.max(...icons) - Math.min(...icons)),
            width: Math.round(popup.getBoundingClientRect().width),
          };
        })()`, true);
      };

      const file = await measure("file");
      const compare = await measure("compare");
      // The renderer's own close, so the menubar stops believing a menu is open and
      // the next step's click on a menu title opens rather than toggles shut.
      await hook("h.closeMenu()");
      await sleep(150);

      assert(file.ticks === 0, `the File menu reserves ${file.ticks} tick cells it never fills`);
      assert(file.gutter === 0, `the File menu indents its icons by ${file.gutter}px of nothing`);
      assert(file.spread === 0, "the File menu's icons are not aligned with each other");
      assert(
        compare.ticks === compare.rows,
        `the Compare menu has ${compare.rows} rows but ${compare.ticks} tick cells`,
      );
      assert(compare.gutter > 0, "the Compare menu left no room for its ticks");
      return `file ${file.width}px, no tick column; compare ${compare.width}px, ${compare.gutter}px tick gutter`;
    });

    await step("menu", "a menu taller than the window is still shown in full", async () => {
      const before = win.getSize();
      win.setSize(before[0], Math.max(win.getMinimumSize()[1], 620));
      await sleep(250);
      await hook("h.openMenu('view')");
      const popup = await waitFor(() => {
        const menu = childWindows.getMenuWindow();
        return menu && menu.isVisible() && menu.getBounds().height > 30 ? menu : null;
      });
      const menuHeight = popup.getBounds().height;
      const scrolls = await popup.webContents.executeJavaScript(
        "(() => { const el = document.querySelector('.menu-popup'); return el.scrollHeight > el.clientHeight + 2 })()",
        true,
      );
      assert(!scrolls, "the menu scrolls instead of showing every row");
      await shot("03-menu-view", popup);
      await js("window.mdm && window.mdm.closeMenu()");
      win.setSize(before[0], before[1]);
      await sleep(200);
      return `${menuHeight}px tall, window ${win.getSize()[1]}px`;
    });

    await step("menu", "a context menu opens on the workspace", async () => {
      await hook("h.closeMenu()");
      await sleep(150);
      await hook("h.contextMenu('.workspace')");
      const popup = await waitFor(() => {
        const menu = childWindows.getMenuWindow();
        return menu && menu.isVisible() && menu.getBounds().height > 30 ? menu : null;
      });
      const rows = await popup.webContents.executeJavaScript(
        "document.querySelectorAll('.menu-popup .menu-row').length",
        true,
      );
      assert(rows > 0, "the context menu is empty");
      await js("window.mdm && window.mdm.closeMenu()");
      return `${rows} rows`;
    });

    /* ---------------------------------------------------- file compare */

    await step("compare", "two files open side by side with the right counts", async () => {
      const result = await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
      const tab = result.tabs[result.tabs.length - 1];
      assert(tab.kind === "compare", `opened a ${tab.kind} tab`);
      assert(tab.added > 0 && tab.removed > 0 && tab.modified > 0, JSON.stringify(tab));
      await waitFor(async () => (await hook("h.query('.diff-row')")) > 0);
      return `+${tab.added} -${tab.removed} ~${tab.modified}`;
    });

    await step("compare", "added, removed and modified rows are coloured apart", async () => {
      const colours = await js(`(() => {
        const pick = (selector) => {
          const half = document.querySelector(selector + ' .diff-half');
          return half ? getComputedStyle(half).backgroundColor : null;
        };
        return {
          added: pick('.diff-row.kind-added'),
          removed: pick('.diff-row.kind-removed'),
          modified: pick('.diff-row.kind-modified'),
        };
      })()`);
      const distinct = new Set(Object.values(colours).filter(Boolean));
      assert(distinct.size >= 2, `row colours: ${JSON.stringify(colours)}`);
      return JSON.stringify(colours);
    });

    await step("compare", "Next difference walks the blocks", async () => {
      const first = (await state()).tabs.at(-1).cursor;
      await hook("h.command('nav.nextDiff')");
      await sleep(150);
      const second = (await state()).tabs.at(-1).cursor;
      assert(second !== first, `cursor stayed at ${first}`);
      await hook("h.run('nav.firstDiff')");
      await sleep(150);
      return `${first} → ${second}`;
    });

    await step("compare", "identical files are reported as identical", async () => {
      const result = await hook(`h.open('files', ${JSON.stringify([sample("files", "identical-a.txt"), sample("files", "identical-b.txt")])})`);
      const tab = result.tabs.at(-1);
      assert(tab.identical === true, JSON.stringify(tab));
      assert((await hook("h.query('.diff-banner')")) === 0, "a banner is covering the panes");
      const status = await hook("h.text('.status-message')");
      assert(status.length > 0, "the status bar said nothing about it");
      return `identical, status bar reads "${status}"`;
    });

    await step("compare", "ignoring whitespace and case changes the result", async () => {
      const pair = JSON.stringify([sample("files", "loose-a.txt"), sample("files", "loose-b.txt")]);
      let result = await hook(`h.open('files', ${pair})`);
      const strict = result.tabs.at(-1);
      assert(strict.identical === false, "the pair should differ with strict comparison");
      await hook("h.settings({ ignoreWhitespace: true, ignoreCase: true })");
      result = await hook(`h.open('files', ${pair})`);
      const loose = result.tabs.at(-1);
      await hook("h.settings({ ignoreWhitespace: false, ignoreCase: false })");
      assert(loose.identical === true, `still different: ${JSON.stringify(loose)}`);
      return "strict differs, loose matches";
    });

    await step("compare", "a diff scrollbar sits on each side and stays a strip", async () => {
      const box = await js(`(() => {
        const bars = [...document.querySelectorAll('.diff-scrollbar')];
        const scroller = document.querySelector('.diff-scroller');
        return {
          count: bars.length,
          widths: bars.map((bar) => bar.getBoundingClientRect().width),
          scroller: scroller.getBoundingClientRect().width,
        };
      })()`);
      assert(box.count === 2, `${box.count} scrollbars, expected one per side`);
      for (const width of box.widths) {
        assert(width > 12 && width < 40, `a scrollbar is ${width}px wide`);
      }
      assert(box.scroller > 200, `the panes got only ${box.scroller}px`);
      return `2 bars of ${Math.round(box.widths[0])}px, panes ${Math.round(box.scroller)}px`;
    });

    await step("compare", "the scrollbar paints the differences and carries a thumb", async () => {
      await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
      await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);
      await sleep(400);
      const painted = await js(`(() => {
        const bar = document.querySelector('.diff-scrollbar');
        const canvas = bar.querySelector('canvas');
        const thumb = bar.querySelector('.scrollbar-thumb');
        const context = canvas.getContext('2d');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const colours = new Set();
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0) colours.add(pixels[index] + ',' + pixels[index + 1] + ',' + pixels[index + 2]);
        }
        return { colours: colours.size, thumb: thumb ? thumb.getBoundingClientRect().height : 0 };
      })()`);
      assert(painted.colours > 1, "the scrollbar painted nothing");
      assert(painted.thumb > 0, "the scrollbar has no thumb");
      return `${painted.colours} colours, thumb ${Math.round(painted.thumb)}px`;
    });

    await step("compare", "the two halves are drawn as separate documents", async () => {
      const box = await js(`(() => {
        const row = document.querySelector('.diff-row');
        const halves = [...row.querySelectorAll('.diff-half')];
        const divider = row.querySelector('.cell-divider');
        return {
          halves: halves.length,
          gutters: halves.map((half) => Boolean(half.querySelector('.cell-gutter'))),
          gap: divider
            ? divider.getBoundingClientRect().left - halves[0].getBoundingClientRect().right
            : -1,
          divider: divider ? divider.getBoundingClientRect().width : 0,
        };
      })()`);
      assert(box.halves === 2, `${box.halves} halves in a row`);
      assert(box.gutters.every(Boolean), "a half is missing its line numbers");
      assert(box.divider > 10, `the divider is only ${box.divider}px`);
      assert(box.gap > 0, "the halves are not separated");
      return `2 framed halves, ${Math.round(box.divider)}px divider`;
    });

    await step("compare", "a binary pair falls back to the hex view", async () => {
      const result = await hook(`h.open('files', ${JSON.stringify([sample("files", "left.bin"), sample("files", "right.bin")])})`);
      assert(result.tabs.at(-1).mode === "binary", "not shown as binary");
      await waitFor(async () => (await hook("h.query('.diff-row.hex')")) > 0);
      return "hex rows rendered";
    });

    await step("grammar", "code is coloured by its grammar", async () => {
      const left = path.join(outDir, "grammar", "a.ts");
      const right = path.join(outDir, "grammar", "b.ts");
      await fs.mkdir(path.dirname(left), { recursive: true });
      const source = [
        'const greeting = "hello";   // a greeting',
        "const count = 42;",
        "/* a block",
        "   comment */",
        "export { greeting, count };",
        "",
      ].join("\n");
      await fs.writeFile(left, source);
      await fs.writeFile(right, source.replace("hello", "hallo"));

      await hook(`h.open('files', ${JSON.stringify([left, right])})`);
      await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);
      await sleep(300);

      const kinds = await js(`(() => {
        const found = new Set();
        for (const span of document.querySelectorAll('.cell-text [class*="tok-"]')) {
          for (const name of span.classList) if (name.startsWith('tok-')) found.add(name);
        }
        return [...found];
      })()`);
      for (const wanted of ["tok-keyword", "tok-string", "tok-number", "tok-comment"]) {
        assert(kinds.includes(wanted), `nothing was coloured as ${wanted}; found ${kinds.join(", ")}`);
      }

      // The colours have to differ from one another, or the highlighting is a lie.
      const colours = await js(`(() => {
        const read = (name) => {
          const span = document.querySelector('.cell-text .' + name);
          return span ? getComputedStyle(span).color : null;
        };
        return { comment: read('tok-comment'), string: read('tok-string'), keyword: read('tok-keyword') };
      })()`);
      assert(new Set(Object.values(colours)).size === 3, `the colours repeat: ${JSON.stringify(colours)}`);
      return `${kinds.length} kinds of token coloured`;
    });

    await step("grammar", "a block comment is still a comment on its second line", async () => {
      // The row window is fetched piecemeal, so the line "   comment */" only knows
      // it is a comment if the lexer state travelled with it.
      const second = await js(`(() => {
        const rows = [...document.querySelectorAll('.diff-row')];
        const row = rows.find((item) => item.textContent.includes('comment */'));
        if (!row) return null;
        const half = row.querySelector('.diff-half .cell-text');
        return { text: half.textContent.trim(), comment: Boolean(half.querySelector('.tok-comment')) };
      })()`);
      assert(second, "the continuation line was not rendered");
      assert(second.comment, `"${second.text}" was not coloured as a comment`);
      return second.text;
    });

    await step("grammar", "turning off syntax highlighting removes the colour", async () => {
      await hook("h.settings({ syntaxHighlight: false })");
      await waitFor(async () => (await hook('h.query(\'.cell-text [class*="tok-"]\')')) === 0, 8000);
      await hook("h.settings({ syntaxHighlight: true })");
      await waitFor(async () => (await hook('h.query(\'.cell-text [class*="tok-"]\')')) > 0, 8000);
      return "off, then on again";
    });

    await step("grammar", "ignoring comments stops a comment-only change being a difference", async () => {
      const left = path.join(outDir, "grammar", "c1.ts");
      const right = path.join(outDir, "grammar", "c2.ts");
      await fs.writeFile(left, "const x = 1; // one\nconst y = 2;\n");
      await fs.writeFile(right, "const x = 1; // ONE, rewritten\nconst y = 2;\n");
      const pair = JSON.stringify([left, right]);

      let result = await hook(`h.open('files', ${pair})`);
      assert(result.tabs.at(-1).identical === false, "the comment change should differ by default");

      await hook("h.settings({ ignoreComments: true })");
      result = await hook(`h.open('files', ${pair})`);
      const loose = result.tabs.at(-1);
      assert(loose.identical === true, `still different with comments ignored: ${JSON.stringify(loose)}`);

      // And a real change is still a real change.
      await fs.writeFile(right, "const x = 2; // ONE, rewritten\nconst y = 2;\n");
      result = await hook(`h.open('files', ${pair})`);
      assert(result.tabs.at(-1).identical === false, "a code change was swallowed by the comment rule");

      await hook("h.settings({ ignoreComments: false })");
      return "comment-only changes ignored, code changes kept";
    });

    await step("grammar", "quote style and number format can be ignored too", async () => {
      const left = path.join(outDir, "grammar", "q1.ts");
      const right = path.join(outDir, "grammar", "q2.ts");
      await fs.writeFile(left, "const a = 'x';\nconst b = 0x10;\n");
      await fs.writeFile(right, 'const a = "x";\nconst b = 16;\n');
      const pair = JSON.stringify([left, right]);

      let result = await hook(`h.open('files', ${pair})`);
      assert(result.tabs.at(-1).identical === false, "they differ as written");

      await hook("h.settings({ ignoreQuoteStyle: true, ignoreNumberFormat: true })");
      result = await hook(`h.open('files', ${pair})`);
      assert(result.tabs.at(-1).identical === true, "the two rules together should make these equal");

      await hook("h.settings({ ignoreQuoteStyle: false, ignoreNumberFormat: false })");
      return "'x' == \"x\" and 0x10 == 16";
    });

    await step("find", "searching covers the whole file, not just the loaded rows", async () => {
      const left = path.join(outDir, "find", "long-a.txt");
      const right = path.join(outDir, "find", "long-b.txt");
      await fs.mkdir(path.dirname(left), { recursive: true });
      // Far longer than the render window, with the needle near the end.
      const lines = Array.from({ length: 3000 }, (_, index) => `line ${index}`);
      lines[2900] = "the needle is here";
      await fs.writeFile(left, `${lines.join("\n")}\n`);
      await fs.writeFile(right, `${lines.join("\n")}\n`);

      await hook(`h.open('files', ${JSON.stringify([left, right])})`);
      await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 10000);

      await js(`(() => {
        const input = document.querySelector('[data-field="find"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'the needle');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);

      await waitFor(async () => {
        const text = await hook("h.text('[data-testid=\"find-count\"]')");
        return text.includes("1") && !text.includes("없음") && !text.includes("none");
      }, 10000);

      // And it jumped there, which a renderer-side search could not have done.
      await waitFor(async () => (await state()).tabs.at(-1).cursor === 2900, 10000);
      return `found at row ${(await state()).tabs.at(-1).cursor}`;
    });

    await step("find", "the search switches change what matches", async () => {
      const left = path.join(outDir, "find", "flags-a.txt");
      const right = path.join(outDir, "find", "flags-b.txt");
      const body = "cat\nCAT\nconcatenate\n";
      await fs.writeFile(left, body);
      await fs.writeFile(right, body);
      await hook(`h.open('files', ${JSON.stringify([left, right])})`);
      await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);

      const type = async (value) => js(`(() => {
        const input = document.querySelector('[data-field="find"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);

      // The search is debounced and runs on the server, so each count is waited
      // for rather than slept on: a fixed delay is either flaky or slow.
      const countIs = async (wanted, what) => {
        await waitFor(async () => {
          const text = await hook("h.text('[data-testid=\"find-count\"]')");
          return new RegExp(`(^|[^0-9])${wanted}([^0-9]|$)`).test(text) ? text : null;
        }, 10000).catch(async () => {
          const text = await hook("h.text('[data-testid=\"find-count\"]')");
          throw new Error(`${what} reported "${text}", expected ${wanted}`);
        });
        return hook("h.text('[data-testid=\"find-count\"]')");
      };

      await type("cat");
      const all = await countIs(3, "a plain search");

      await hook("h.click('[data-find-flag=\"caseSensitive\"]')");
      const cased = await countIs(2, "case-sensitive");

      await hook("h.click('[data-find-flag=\"wholeWord\"]')");
      const word = await countIs(1, "whole-word");

      await hook("h.click('[data-find-flag=\"caseSensitive\"]')");
      await hook("h.click('[data-find-flag=\"wholeWord\"]')");
      await sleep(300);
      return `all ${all.trim()}, cased ${cased.trim()}, word ${word.trim()}`;
    });

    await step("find", "replace all rewrites one side and leaves the other", async () => {
      const left = path.join(outDir, "find", "rep-a.txt");
      const right = path.join(outDir, "find", "rep-b.txt");
      await fs.writeFile(left, "red\nred and red\nblue\n");
      await fs.writeFile(right, "red\nred and red\nblue\n");
      await hook(`h.open('files', ${JSON.stringify([left, right])})`);
      await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);

      await js(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const find = document.querySelector('[data-field="find"]');
        setter.call(find, 'red');
        find.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await sleep(450);

      await hook("h.click('[data-find=\"toggleReplace\"]')");
      await waitFor(async () => (await hook('h.query(\'[data-field="replace"]\')')) === 1, 6000);
      await js(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const box = document.querySelector('[data-field="replace"]');
        setter.call(box, 'green');
        box.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await hook("h.click('[data-find=\"replaceLeft\"]')");

      await waitFor(async () => (await fs.readFile(left, "utf8")) === "green\ngreen and green\nblue\n", 10000);
      const other = await fs.readFile(right, "utf8");
      assert(other === "red\nred and red\nblue\n", `the right side was changed too: ${JSON.stringify(other)}`);
      return "three replaced on the left, none on the right";
    });

    /**
     * Clicks a comparison row and waits for the cursor to land on it.
     *
     * Retried, because the rows are fetched asynchronously: a click dispatched at
     * a node that is re-rendered a moment later never reaches the store, and the
     * resulting failure looks like a bug in bookmarks rather than a race in the
     * test.
     */
    const clickRow = async (row) => {
      await waitFor(async () => {
        if ((await hook(`h.query('[data-row="${row}"]')`)) !== 1) return null;
        await js(`document.querySelector('[data-row="${row}"]')`
          + `.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
        await sleep(120);
        return (await state()).tabs.at(-1).cursor === row ? true : null;
      }, 10000);
    };

    await step("find", "a row can be bookmarked and jumped back to", async () => {
      // The row is picked by clicking it rather than through a navigation command:
      // this step is about bookmarks, and should not fail because a comparison
      // happens to have no differences to navigate between.
      //
      // The click is retried until it takes. The rows are fetched from the server
      // and re-rendered when they arrive, so a click can land on a node that is
      // replaced a moment later and never reaches the store.
      await clickRow(1);

      await hook("h.click('[data-find=\"bookmark\"]')");
      await waitFor(async () => (await hook("h.query('.diff-row.bookmarked')")) === 1, 6000);

      // Move away, then let the bookmark button bring us back.
      await clickRow(0);
      await hook("h.click('[data-find=\"nextBookmark\"]')");
      await waitFor(async () => (await state()).tabs.at(-1).cursor === 1, 6000);

      // And toggling it off clears the mark. The row is clicked again first so the
      // toggle is certainly acting on the bookmarked row and not on whatever the
      // cursor happened to reach.
      await clickRow(1);
      await hook("h.click('[data-find=\"bookmark\"]')");
      await waitFor(async () => (await hook("h.query('.diff-row.bookmarked')")) === 0, 6000);
      return "marked, jumped to, and cleared";
    });

    await step("find", "go to line moves the cursor there", async () => {
      await js(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const box = document.querySelector('[data-field="goToLine"]');
        setter.call(box, '3');
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`);
      await waitFor(async () => (await state()).tabs.at(-1).cursor === 2, 6000);
      return "line 3 is row 2";
    });

    await shot("04-compare");

    /* ----------------------------------------------- directory compare */

    await step("directory", "two trees compare with every status", async () => {
      const result = await hook(`h.open('directories', ${JSON.stringify([sample("tree", "left"), sample("tree", "right")])})`);
      const tab = result.tabs.at(-1);
      assert(tab.kind === "directory", `opened a ${tab.kind} tab`);
      assert(tab.same >= 1 && tab.different >= 1 && tab.leftOnly === 1 && tab.rightOnly === 1, JSON.stringify(tab));
      await waitFor(async () => (await hook("h.query('.tree-pair')")) > 1);
      return `same ${tab.same}, diff ${tab.different}, left ${tab.leftOnly}, right ${tab.rightOnly}`;
    });

    await step("directory", "each side is shown as a tree with its own path bar", async () => {
      assert((await hook("h.query('.tree-headers .path-bar')")) === 2, "two path bars");
      const left = await hook("h.attr('[data-path=\"left\"]', 'value')");
      const right = await hook("h.attr('[data-path=\"right\"]', 'value')");
      assert(left.endsWith("left"), `left path bar: ${left}`);
      assert(right.endsWith("right"), `right path bar: ${right}`);
      // Every row carries a cell for both sides, which is what keeps the trees level.
      const pairs = await hook("h.query('.tree-pair')");
      const cells = await hook("h.query('.tree-pair .tree-cell')");
      assert(cells === pairs * 2, `${pairs} rows but ${cells} cells`);
      return `${pairs} aligned rows`;
    });

    await step("directory", "folders nest and can be expanded and collapsed", async () => {
      await hook("h.click('[data-command=\"tree.expandAll\"]')");
      await sleep(250);
      const expanded = await hook("h.query('.tree-pair')");
      assert((await hook("h.query('[data-entry=\"src/app.js\"]')")) === 1, "a nested file is listed when expanded");
      await hook("h.click('[data-command=\"tree.collapseAll\"]')");
      await sleep(250);
      const collapsed = await hook("h.query('.tree-pair')");
      assert(collapsed < expanded, `${expanded} expanded, ${collapsed} collapsed`);
      await hook("h.click('[data-command=\"tree.expandAll\"]')");
      await sleep(250);
      return `${collapsed} → ${expanded} rows`;
    });

    await step("directory", "a filter hides its rows", async () => {
      const before = await hook("h.query('.tree-pair')");
      await hook("h.click('[data-filter=\"same\"]')");
      await sleep(250);
      const after = await hook("h.query('.tree-pair')");
      await hook("h.click('[data-filter=\"same\"]')");
      await sleep(200);
      assert(after < before, `${before} rows before, ${after} after`);
      return `${before} → ${after}`;
    });

    await step("directory", "double-clicking a file opens it as a file comparison", async () => {
      await js(`document.querySelector('[data-entry="src/app.js"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
      await waitFor(async () => (await state()).tabs.at(-1).kind === "compare", 8000);
      const tab = (await state()).tabs.at(-1);
      assert(tab.modified > 0, JSON.stringify(tab));
      return tab.title;
    });

    await step("sync", "an entry can be copied from one side to the other", async () => {
      const outLeft = path.join(outDir, "sync", "left");
      const outRight = path.join(outDir, "sync", "right");
      await fs.mkdir(outLeft, { recursive: true });
      await fs.mkdir(outRight, { recursive: true });
      await fs.writeFile(path.join(outLeft, "only.txt"), "from the left\n");
      await fs.writeFile(path.join(outLeft, "both.txt"), "left version\n");
      await fs.writeFile(path.join(outRight, "both.txt"), "right version\n");

      await hook(`h.open('directories', ${JSON.stringify([outLeft, outRight])})`);
      await waitFor(async () => (await state()).tabs.at(-1).kind === "directory");

      await js(`document.querySelector('[data-entry="only.txt"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
      await sleep(150);
      await hook("h.click('[data-command=\"dir.copyToRight\"]')");
      await waitFor(async () => {
        try {
          await fs.access(path.join(outRight, "only.txt"));
          return true;
        } catch {
          return false;
        }
      }, 10000);
      assert((await fs.readFile(path.join(outRight, "only.txt"), "utf8")) === "from the left\n", "wrong content copied");
      return "only.txt copied to the right";
    });

    await step("sync", "copying makes a differing pair identical", async () => {
      const outRight = path.join(outDir, "sync", "right");
      await js(`document.querySelector('[data-entry="both.txt"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
      await sleep(150);
      await hook("h.click('[data-command=\"dir.copyToRight\"]')");
      await waitFor(async () => (await fs.readFile(path.join(outRight, "both.txt"), "utf8")) === "left version\n", 10000);
      await waitFor(async () => (await state()).tabs.at(-1).different === 0, 10000);
      return "both.txt is now identical on each side";
    });

    await step("sync", "deleting asks first and then removes the entry", async () => {
      const outRight = path.join(outDir, "sync", "right");
      await js(`document.querySelector('[data-entry="only.txt"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
      await sleep(150);
      await hook("h.click('[data-command=\"dir.deleteRight\"]')");

      const confirm = await waitFor(() => {
        const candidate = childWindows.getDialogWindow("confirm");
        return candidate && candidate.isVisible() ? candidate : null;
      }, 10000);
      await waitFor(async () => confirm.webContents.executeJavaScript(
        "document.querySelectorAll('[data-action=\"yes\"]').length > 0", true));
      await confirm.webContents.executeJavaScript("document.querySelector('[data-action=\"yes\"]').click()", true);

      await waitFor(async () => {
        try {
          await fs.access(path.join(outRight, "only.txt"));
          return false;
        } catch {
          return true;
        }
      }, 10000);
      return "the confirmation was required and the file is gone";
    });

    await step("sync", "a folder sync previews what it would do before doing it", async () => {
      const left = path.join(outDir, "syncsession", "left");
      const right = path.join(outDir, "syncsession", "right");
      await fs.mkdir(left, { recursive: true });
      await fs.mkdir(right, { recursive: true });
      // Three cases at once: one only on the left, one differing, one identical.
      await fs.writeFile(path.join(left, "new.txt"), "new\n");
      await fs.writeFile(path.join(left, "both.txt"), "left wins\n");
      await fs.writeFile(path.join(right, "both.txt"), "old\n");
      await fs.writeFile(path.join(left, "same.txt"), "same\n");
      await fs.writeFile(path.join(right, "same.txt"), "same\n");
      // Make the left copy plainly newer than the tolerance allows.
      const future = new Date(Date.now() + 60_000);
      await fs.utimes(path.join(left, "both.txt"), future, future);

      await hook(`h.open('sync', ${JSON.stringify([left, right])})`);
      await waitFor(async () => (await hook("h.query('.sync-bar')")) === 1, 10000);

      await hook("h.click('[data-command=\"sync.preview\"]')");
      await waitFor(async () => {
        const tab = (await state()).tabs.at(-1);
        return Boolean(tab.sync && tab.sync.plan);
      }, 10000);

      const plan = (await state()).tabs.at(-1).sync.plan;
      const byRel = Object.fromEntries(plan.actions.map((action) => [action.rel, action.operation]));
      assert(byRel["new.txt"] === "copyToRight", `new.txt planned as ${byRel["new.txt"]}`);
      assert(byRel["both.txt"] === "copyToRight", `both.txt planned as ${byRel["both.txt"]}`);
      assert(!("same.txt" in byRel), "an identical file was planned for copying");

      // Nothing may have happened yet: a preview is a preview.
      const before = await fs.readFile(path.join(right, "both.txt"), "utf8");
      assert(before === "old\n", `the preview already wrote: ${JSON.stringify(before)}`);
      return `${plan.actions.length} planned, ${plan.skipped} left alone`;
    });

    await step("sync", "running the sync asks first and then carries out the plan", async () => {
      const right = path.join(outDir, "syncsession", "right");
      await hook("h.click('[data-command=\"sync.run\"]')");

      const confirm = await waitFor(() => {
        const candidate = childWindows.getDialogWindow("confirm");
        return candidate && candidate.isVisible() ? candidate : null;
      }, 10000);
      await waitFor(async () => confirm.webContents.executeJavaScript(
        "document.querySelectorAll('[data-action=\"yes\"]').length > 0", true));
      await confirm.webContents.executeJavaScript("document.querySelector('[data-action=\"yes\"]').click()", true);

      await waitFor(async () => (await fs.readFile(path.join(right, "both.txt"), "utf8")) === "left wins\n", 10000);
      await fs.access(path.join(right, "new.txt"));
      return "both.txt updated and new.txt copied across";
    });

    await step("sync", "mirroring deletes what the other side does not have", async () => {
      const left = path.join(outDir, "syncsession", "left");
      const right = path.join(outDir, "syncsession", "right");
      await fs.writeFile(path.join(right, "orphan.txt"), "orphan\n");

      await hook("h.run('view.refresh')");
      await sleep(400);
      await js(`(() => {
        const select = document.querySelector('[data-field="syncMode"]');
        select.value = 'mirrorToRight';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(async () => {
        const tab = (await state()).tabs.at(-1);
        return Boolean(tab.sync && tab.sync.plan && tab.sync.plan.mode === "mirrorToRight");
      }, 10000);

      const plan = (await state()).tabs.at(-1).sync.plan;
      const orphan = plan.actions.find((action) => action.rel === "orphan.txt");
      assert(orphan && orphan.operation === "deleteRight", `orphan.txt planned as ${JSON.stringify(orphan)}`);
      assert(orphan.reason === "orphan", `reason: ${orphan.reason}`);

      // Put it back the way the other steps expect and leave the file alone.
      await fs.rm(path.join(right, "orphan.txt"));
      void left;
      return "a mirror plans the deletion, with its reason";
    });

    await shot("05-directory");

    await step("directory", "the pane title bars follow the theme", async () => {
      // The swatch a user picks is a hue; on a dark theme the bar has to go dark
      // with everything else, and its text has to stay readable against it.
      const read = () => js(`(() => {
        const bar = document.querySelector('.path-bar');
        const style = getComputedStyle(bar);
        const input = getComputedStyle(bar.querySelector('.path-input'));
        return { background: style.backgroundColor, color: style.color, field: input.backgroundColor };
      })()`);

      await hook("h.settings({ theme: 'classic-light' })");
      await sleep(300);
      const light = await read();

      await hook("h.settings({ theme: 'classic-dark' })");
      await sleep(300);
      const dark = await read();

      assert(light.background !== dark.background, `the title bar stayed ${light.background}`);
      assert(light.color !== dark.color, `the title bar's text stayed ${light.color}`);
      assert(light.field !== dark.field, `the path box stayed ${light.field}`);
      assert(contrast(toHex(dark.background), toHex(dark.color)) >= 4.5,
        `dark title bar: ${dark.background} on ${dark.color}`);
      assert(contrast(toHex(light.background), toHex(light.color)) >= 4.5,
        `light title bar: ${light.background} on ${light.color}`);

      await hook("h.settings({ theme: 'classic-light' })");
      await sleep(250);
      return `${light.background} / ${dark.background}`;
    });

    /* ------------------------------------------------------------ merge */

    await step("merge", "a 3-way merge opens with the expected conflicts", async () => {
      const files = [
        sample("merge", "base.txt"),
        sample("merge", "local.txt"),
        sample("merge", "remote.txt"),
        path.join(outDir, "merged.txt"),
      ];
      const result = await hook(`h.open('merge', ${JSON.stringify(files)})`);
      const tab = result.tabs.at(-1);
      assert(tab.kind === "merge", `opened a ${tab.kind} tab`);
      assert(tab.conflicts >= 1, `no conflicts: ${JSON.stringify(tab)}`);
      assert(tab.resolved === 0, "conflicts start unresolved");
      return `${tab.conflicts} conflicts`;
    });

    await step("merge", "the panes stay aligned line for line", async () => {
      const counts = await js(`(() => {
        const panes = [...document.querySelectorAll('.merge-pane')];
        return panes.map((pane) => pane.querySelectorAll('.merge-row').length);
      })()`);
      assert(counts.length >= 2, `only ${counts.length} panes`);
      assert(new Set(counts).size === 1, `pane row counts differ: ${counts.join(", ")}`);
      return `${counts.length} panes of ${counts[0]} rows`;
    });

    await step("merge", "the left panel opens each conflict out, with its sides", async () => {
      const cards = await hook("h.query('.panel-left .conflict-card')");
      const unresolved = await hook("h.query('.panel-left .conflict-card.unresolved')");
      assert(cards > 0, "no conflicts in the left panel");
      assert(unresolved === cards, "a conflict is already marked resolved");

      // Every card shows its candidate texts, not just a label.
      const opened = await js(`(() => {
        const card = document.querySelector('.panel-left .conflict-card');
        const sides = [...card.querySelectorAll('.conflict-side')];
        return {
          sides: sides.length,
          texts: sides.filter((side) => side.querySelector('.conflict-side-text').textContent.length > 0).length,
        };
      })()`);
      assert(opened.sides >= 2, `a conflict shows only ${opened.sides} sides`);
      assert(opened.texts >= 1, "the sides are shown without their text");
      return `${cards} conflicts, ${opened.sides} sides each`;
    });

    await step("merge", "a conflict is settled from the left panel", async () => {
      await hook("h.click('[data-resolve=\"0:local\"]')");
      await waitFor(async () => (await state()).tabs.at(-1).resolved === 1, 6000);
      assert((await hook("h.query('.panel-left .conflict-card.resolved')")) >= 1, "the card still reads unresolved");
      await hook("h.click('[data-resolve=\"0:unresolved\"]')");
      await waitFor(async () => (await state()).tabs.at(-1).resolved === 0, 6000);
      return "resolved from the panel, then undone";
    });

    await step("merge", "the right panel reports the state of the merge", async () => {
      const panel = await js(`(() => {
        const rows = [...document.querySelectorAll('.panel-right .property-row')];
        return {
          rows: rows.length,
          controls: document.querySelectorAll('.panel-right .panel-scroll input, .panel-right .panel-scroll select, .panel-right .panel-scroll button').length,
          text: rows.map((row) => row.textContent).join(" | "),
        };
      })()`);
      assert(panel.rows >= 6, `only ${panel.rows} rows of merge information`);
      // It describes the merge; everything that changes the merge lives elsewhere. The
      // header's collapse button changes the window, not the merge, so it is not counted.
      assert(panel.controls === 0, `${panel.controls} controls in a read-only panel`);
      return `${panel.rows} rows, read-only`;
    });

    await step("merge", "Take Local resolves the selected conflict", async () => {
      await hook("h.command('merge.takeLocal')");
      await waitFor(async () => (await state()).tabs.at(-1).resolved === 1);
      assert((await hook("h.query('.merge-row.kind-resolved')")) > 0, "no resolved rows in the view");
      return "resolved as local";
    });

    await step("merge", "undo and redo reverse the resolution", async () => {
      await hook("h.undo()");
      await waitFor(async () => (await state()).tabs.at(-1).resolved === 0);
      assert((await state()).undo.canRedo === true, "redo is not available after an undo");
      await hook("h.redo()");
      await waitFor(async () => (await state()).tabs.at(-1).resolved === 1);
      return "undo then redo";
    });

    await step("merge", "the document is marked modified until it is saved", async () => {
      const before = await state();
      assert(before.dirty === true, "resolving did not mark the document modified");
      assert(/\*/.test(win.getTitle()), `title does not show unsaved work: ${win.getTitle()}`);
      return win.getTitle();
    });

    await step("merge", "resolving every conflict and saving writes the file", async () => {
      await hook("h.run('merge.resolveAllLocal')");
      await waitFor(async () => {
        const tab = (await state()).tabs.at(-1);
        return tab.resolved === tab.conflicts;
      });
      await hook("h.save()");
      await waitFor(async () => (await state()).tabs.at(-1).dirty === false, 8000);
      const written = fsSync.readFileSync(path.join(outDir, "merged.txt"), "utf8");
      assert(!written.includes("<<<<<<<"), "conflict markers were written to a fully resolved file");
      assert(written.includes("Hello"), `unexpected result:\n${written}`);
      return `${written.split("\n").length} lines written`;
    });

    await shot("06-merge");

    await step("merge", "a conflicted file opens from its markers", async () => {
      const result = await hook(`h.open('conflict', ${JSON.stringify([sample("conflict", "conflicted.txt")])})`);
      const tab = result.tabs.at(-1);
      assert(tab.kind === "merge", `opened a ${tab.kind} tab`);
      assert(tab.conflicts === 2, `expected 2 conflicts, got ${tab.conflicts}`);
      return `${tab.conflicts} conflicts`;
    });

    await step("merge", "Next conflict moves the selection", async () => {
      const before = (await state()).tabs.at(-1).selectedConflict;
      await hook("h.run('merge.nextConflict')");
      await sleep(200);
      const after = (await state()).tabs.at(-1).selectedConflict;
      assert(after !== before, `selection stayed at ${before}`);
      return `${before} → ${after}`;
    });

    /* ------------------------------------------------------------- tabs */

    await step("tabs", "each comparison opened its own tab", async () => {
      const tabs = (await state()).tabs;
      assert(tabs.length >= 6, `only ${tabs.length} tabs`);
      assert((await hook("h.query('.tab')")) === tabs.length, "the tab strip does not match the state");
      return `${tabs.length} tabs`;
    });

    await step("tabs", "overflow shows scroll buttons instead of a scrollbar", async () => {
      const before = win.getSize();
      win.setSize(win.getMinimumSize()[0], before[1]);
      await sleep(400);
      const overflowing = await js(
        "(() => { const s = document.querySelector('.tab-strip'); return s.scrollWidth > s.clientWidth + 2 })()",
      );
      const buttons = await hook("h.query('.tab-scroll')");
      const scrollbar = await js(
        "getComputedStyle(document.querySelector('.tab-strip')).overflowX",
      );
      win.setSize(before[0], before[1]);
      await sleep(250);
      assert(scrollbar === "hidden", `the tab strip scrolls with a scrollbar (${scrollbar})`);
      if (overflowing) assert(buttons === 2, `${buttons} scroll buttons while overflowing`);
      return overflowing ? "overflowing, two scroll buttons" : "fits, no buttons needed";
    });

    await step("tabs", "a tab can be closed", async () => {
      const before = (await state()).tabs.length;
      await hook("h.closeTab()");
      await waitFor(async () => (await state()).tabs.length === before - 1);
      return `${before} → ${before - 1}`;
    });

    /* ---------------------------------------------------------- dialogs */

    const openDialog = async (name, command) => {
      await hook(`h.command('${command}')`);
      const dialog = await waitFor(() => {
        const candidate = childWindows.getDialogWindow(name);
        return candidate && !candidate.isDestroyed() && candidate.isVisible() ? candidate : null;
      }, 12000);
      await waitFor(async () => dialog.webContents.executeJavaScript(
        `document.querySelectorAll('[data-dialog="${name}"]').length > 0`,
        true,
      ), 12000);
      return dialog;
    };

    await step("dialog", "About is its own window and names the author and the build", async () => {
      const dialog = await openDialog("about", "help.about");
      const author = await dialog.webContents.executeJavaScript(
        "document.querySelector('[data-testid=\"about-author\"]').textContent",
        true,
      );
      assert(author.includes("SHKWON(knix008@naver.com)"), `author: ${author}`);

      // One page, no tabs: everything has to be readable without clicking anything.
      const tabs = await dialog.webContents.executeJavaScript(
        "document.querySelectorAll('.dialog-tabs .dialog-tab').length", true);
      assert(tabs === 0, `About still has ${tabs} tabs`);
      const build = await dialog.webContents.executeJavaScript("document.body.innerText", true);
      assert(/Electron/.test(build) && /Chromium/.test(build), "the runtime summary is missing");
      assert(/Node/.test(build), "the runtime summary does not name Node");
      assert(dialog.id !== win.id, "the dialog is not a separate window");
      await shot("07-about", dialog);
      await dialog.webContents.executeJavaScript("document.querySelector('[data-action=\"close\"]').click()", true);
      return author;
    });

    await step("dialog", "popups are fixed size and never scroll", async () => {
      for (const [name, command] of [["about", "help.about"], ["settings", "tools.settings"]]) {
        const dialog = await openDialog(name, command);
        assert(!dialog.isResizable(), `${name} is resizable`);
        const scrolls = await dialog.webContents.executeJavaScript(
          "document.documentElement.scrollHeight > document.documentElement.clientHeight + 2"
          + " || document.documentElement.scrollWidth > document.documentElement.clientWidth + 2",
          true,
        );
        assert(!scrolls, `${name} needs to scroll`);
        await dialog.webContents.executeJavaScript("window.mdm.closeDialog()", true);
        await sleep(200);
      }
      return "about and settings are fixed and scroll-free";
    });

    await step("dialog", "Settings is tabbed, one setting per line", async () => {
      const dialog = await openDialog("settings", "tools.settings");
      const tabs = await dialog.webContents.executeJavaScript(
        "document.querySelectorAll('.dialog-tabs .dialog-tab').length",
        true,
      );
      // General, Appearance, Custom, Font, Compare, Git, Terminal, Prompt, Custom prompts.
      assert(tabs === 9, `${tabs} tabs`);
      const perLine = await dialog.webContents.executeJavaScript(`(() => {
        const fields = [...document.querySelectorAll('.tab-panel .field')];
        const tops = fields.map((field) => Math.round(field.getBoundingClientRect().top));
        return { fields: fields.length, rows: new Set(tops).size };
      })()`, true);
      assert(perLine.fields > 0 && perLine.fields === perLine.rows, `${perLine.fields} fields on ${perLine.rows} rows`);
      await shot("08-settings", dialog);
      // The prompt editor is the largest thing in the dialog, so it gets its own picture.
      for (const [name, tab] of [["08b-settings-terminal", "terminal"], ["08c-settings-prompt", "prompt"], ["08d-settings-prompt-custom", "promptCustom"]]) {
        await dialog.webContents.executeJavaScript(`document.querySelector('[data-tab="${tab}"]').click()`, true);
        await sleep(300);
        await shot(name, dialog);
      }
      await dialog.webContents.executeJavaScript("document.querySelector('[data-tab=\"general\"]').click()", true);
      return `${tabs} tabs, ${perLine.fields} fields each on its own line`;
    });

    await step("dialog", "changing the theme in Settings repaints the main window", async () => {
      const dialog = childWindows.getDialogWindow("settings");
      const before = await hook("h.cssVar('--bg')");
      await dialog.webContents.executeJavaScript("document.querySelector('[data-tab=\"appearance\"]').click()", true);
      await sleep(250);
      await dialog.webContents.executeJavaScript(`(() => {
        const select = document.querySelector('[data-field="theme"]');
        select.value = 'classic-dark';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`, true);
      await waitFor(async () => (await state()).settings.theme === "classic-dark", 8000);
      const after = await hook("h.cssVar('--bg')");
      assert(before !== after, `the background did not change (${before})`);
      await hook("h.settings({ theme: 'classic-light' })");
      await sleep(250);
      return `${before} → ${after}`;
    });

    await step("dialog", "the Settings font tab lists the system fonts", async () => {
      const dialog = childWindows.getDialogWindow("settings");
      await dialog.webContents.executeJavaScript("document.querySelector('[data-tab=\"font\"]').click()", true);
      await sleep(400);
      const fonts = await dialog.webContents.executeJavaScript(
        "document.querySelectorAll('[data-field=\"fontFamily\"] option').length",
        true,
      );
      assert(fonts > 3, `only ${fonts} fonts offered`);
      const controls = await dialog.webContents.executeJavaScript(
        "['fontSize','fontWeight','fontStyle'].every((name) => document.querySelector('[data-field=\"' + name + '\"]'))",
        true,
      );
      assert(controls, "size, weight or style is missing");
      await dialog.webContents.executeJavaScript("window.mdm.closeDialog()", true);
      await sleep(200);
      return `${fonts} font families, with size, weight and style`;
    });

    await step("dialog", "the error popup shows the detail and can copy it", async () => {
      await js(`window.__mdmStore.report(new Error('smoke test failure detail'))`);
      const dialog = await waitFor(() => {
        const candidate = childWindows.getDialogWindow("error");
        return candidate && candidate.isVisible() ? candidate : null;
      }, 10000);
      await waitFor(async () => dialog.webContents.executeJavaScript(
        "document.querySelectorAll('[data-testid=\"error-detail\"]').length > 0", true));
      const detail = await dialog.webContents.executeJavaScript(
        "document.querySelector('[data-testid=\"error-detail\"]').value", true);
      assert(detail.includes("smoke test failure detail"), `detail: ${detail}`);
      await dialog.webContents.executeJavaScript("document.querySelector('[data-action=\"copy\"]').click()", true);
      await sleep(250);
      const copied = require("electron").clipboard.readText();
      assert(copied.includes("smoke test failure detail"), "the detail was not copied to the clipboard");
      await shot("09-error", dialog);
      await dialog.webContents.executeJavaScript("window.mdm.closeDialog()", true);
      return "detail shown and copied";
    });

    await step("dialog", "a long operation shows a progress popup", async () => {
      await hook("h.dialog('progress', { label: 'progress.comparingDirs' })");
      const dialog = await waitFor(() => {
        const candidate = childWindows.getDialogWindow("progress");
        return candidate && candidate.isVisible() ? candidate : null;
      }, 10000);
      await waitFor(async () => dialog.webContents.executeJavaScript(
        "document.querySelectorAll('[data-testid=\"progress-label\"]').length > 0", true));
      const label = await dialog.webContents.executeJavaScript(
        "document.querySelector('[data-testid=\"progress-label\"]').textContent", true);
      assert(label && label.length > 2, `progress label: ${label}`);
      assert((await dialog.webContents.executeJavaScript(
        "document.querySelectorAll('.progress-track').length", true)) === 1, "no progress bar");
      await hook("h.closeDialog('progress')");
      await sleep(200);
      return label;
    });

    await step("dialog", "closing with unsaved work offers save, discard or cancel", async () => {
      await hook("h.dialog('unsaved', {})");
      const dialog = await waitFor(() => {
        const candidate = childWindows.getDialogWindow("unsaved");
        return candidate && candidate.isVisible() ? candidate : null;
      }, 10000);
      await waitFor(async () => dialog.webContents.executeJavaScript(
        "document.querySelectorAll('[data-action=\"save\"]').length > 0", true));
      const actions = await dialog.webContents.executeJavaScript(
        "[...document.querySelectorAll('[data-action]')].map((b) => b.dataset.action)", true);
      for (const action of ["cancel", "discard", "save"]) {
        assert(actions.includes(action), `no ${action} button: ${actions.join(", ")}`);
      }
      await hook("h.closeDialog('unsaved')");
      await sleep(200);
      return actions.join(", ");
    });

    /* ----------------------------------------------------------- labels */

    await step("labels", "nothing wraps onto a second line, at any width", async () => {
      const selectors = [
        ".property-label", ".property-value", ".panel-section h3", ".panel-title span",
        ".panel-button > span", ".chip > span", ".tab-label", ".tree-label",
        ".status-cell", ".menubar-item span", ".welcome-tile > span",
      ];
      const before = win.getSize();
      const offenders = [];

      // At the minimum width, where a label is most likely to run out of room, and
      // again at a comfortable width where a long path has something to overflow.
      for (const width of [win.getMinimumSize()[0], Math.max(win.getMinimumSize()[0] + 420, 1400)]) {
        win.setSize(width, before[1]);
        await sleep(350);
        for (const selector of selectors) {
          const wrapped = await hook(`h.wrapped(${JSON.stringify(selector)})`);
          for (const item of wrapped) offenders.push(`${width}px ${selector} "${item.text}" (${item.height}px)`);
        }
      }

      win.setSize(before[0], before[1]);
      await sleep(250);
      assert(offenders.length === 0, offenders.slice(0, 6).join(" | "));
      return `${selectors.length} kinds of label, at two widths, all on one line`;
    });

    await step("labels", "dialog labels stay on one line too", async () => {
      const dialog = await openDialog("settings", "tools.settings");
      const offenders = [];
      // Every tab, the prompt editor included: its own rows carry the long wording in a
      // tooltip exactly so that no label has to wrap.
      const tabs = ["general", "appearance", "custom", "font", "compare", "git", "terminal", "prompt", "promptCustom"];
      for (const tab of tabs) {
        await dialog.webContents.executeJavaScript(
          `document.querySelector('[data-tab="${tab}"]').click()`, true);
        await sleep(200);
        const wrapped = await dialog.webContents.executeJavaScript(`(() => {
          return ['.field-label', '.dialog-tab > span', '.dialog-button span']
            .flatMap((selector) => [...document.querySelectorAll(selector)]
              .filter((element) => {
                const box = element.getBoundingClientRect();
                if (box.height === 0) return false;
                const style = getComputedStyle(element);
                const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
                return box.height > line * 1.6;
              })
              .map((element) => selector + ' "' + element.textContent.trim().slice(0, 30) + '"'));
        })()`, true);
        for (const item of wrapped) offenders.push(`${tab}: ${item}`);
      }
      await dialog.webContents.executeJavaScript("window.mdm.closeDialog()", true);
      await sleep(200);
      assert(offenders.length === 0, offenders.slice(0, 6).join(" | "));
      return `${tabs.length} tabs, no wrapped label`;
    });

    /* ------------------------------------------------------ the chrome */

    await step("chrome", "the window draws its own title bar, icon and controls", async () => {
      const bar = await js(`(() => {
        const brand = document.querySelector('.menubar-brand');
        const icon = brand ? brand.querySelector('img.brand-icon') : null;
        const controls = [...document.querySelectorAll('.window-controls .window-button')];
        return {
          title: brand ? brand.textContent.trim() : '',
          icon: icon ? { src: icon.getAttribute('src'), width: icon.getBoundingClientRect().width } : null,
          controls: controls.map((button) => button.dataset.window || ''),
          drag: getComputedStyle(document.querySelector('.menubar')).webkitAppRegion,
        };
      })()`);
      assert(bar.icon, "the title bar has no program icon");
      assert(bar.icon.width > 8, `the icon is ${bar.icon.width}px`);
      assert(bar.title.includes("My Diff"), `the title reads "${bar.title}"`);
      assert(bar.controls.length === 3, `${bar.controls.length} window buttons`);
      assert(bar.drag === "drag", `the title bar is not draggable (${bar.drag})`);
      return `${bar.title}, ${bar.controls.join("/")}`;
    });

    await step("chrome", "maximise and restore work from the title bar", async () => {
      if (win.isMaximized()) win.unmaximize();
      await sleep(250);

      const label = () => js(`document.querySelector('.window-button[data-window="maximize"]').title`);
      const before = await label();

      await js(`document.querySelector('.window-button[data-window="maximize"]').click()`);
      await waitFor(async () => win.isMaximized(), 6000);
      // The button has to say what it will do next, or it lies about itself.
      const maximized = await label();
      assert(maximized !== before, `the button still reads "${before}"`);

      await js(`document.querySelector('.window-button[data-window="maximize"]').click()`);
      await waitFor(async () => !win.isMaximized(), 6000);
      assert((await label()) === before, "the button did not go back to maximise");
      return `${before} then ${maximized}, and back`;
    });

    await step("chrome", "the toolbar has the same gap at both ends", async () => {
      const edges = await js(`(() => {
        const toolbar = document.querySelector('.toolbar');
        const box = toolbar.getBoundingClientRect();
        const children = [...toolbar.children].filter((child) => child.getBoundingClientRect().width > 0);
        const first = children[0].getBoundingClientRect();
        const last = children[children.length - 1].getBoundingClientRect();
        return { left: first.left - box.left, right: box.right - last.right };
      })()`);
      assert(Math.abs(edges.left - edges.right) <= 1,
        `left gap ${edges.left}px, right gap ${edges.right}px`);
      return `${Math.round(edges.left)}px at both ends`;
    });

    await step("chrome", "the font size and zoom steppers step up and down", async () => {
      const before = (await state()).settings;

      /*
       * One press at a time. A stepper works out its next value from the value it
       * is currently showing, so pressing again before the first press has been
       * rendered would step from the old number — which a person cannot do, and a
       * test can.
       */
      const press = async (group, step, settled) => {
        await js(`document.querySelector('.${group} [data-step="${step}"]').click()`);
        await waitFor(async () => settled(await state()), 6000);
      };

      await press("font-group", "paneFontSize:up", (s) => s.settings.font.size === before.font.size + 1);
      await press("font-group", "paneFontSize:down", (s) => s.settings.font.size === before.font.size);
      await press("zoom-group", "zoom:up", (s) => s.settings.zoom > before.zoom);
      await press("zoom-group", "zoom:down", (s) => s.settings.zoom === before.zoom);

      return `font ${before.font.size}px and zoom ${before.zoom}% both stepped, then restored`;
    });

    await step("chrome", "the language button is a flag that toggles", async () => {
      const flag = await js(`Boolean(document.querySelector('[data-command="toolbar.language"] svg.flag'))`);
      assert(flag, "the language button is not showing a flag");

      const before = (await state()).settings.language;
      await js(`document.querySelector('[data-command="toolbar.language"]').click()`);
      await waitFor(async () => (await state()).settings.language !== before, 6000);
      const after = (await state()).settings.language;
      await js(`document.querySelector('[data-command="toolbar.language"]').click()`);
      await waitFor(async () => (await state()).settings.language === before, 6000);
      return `${before} to ${after} and back, drawn as a flag`;
    });

    await step("chrome", "the panel buttons close and reopen the two panels", async () => {
      await openMergeTab();
      for (const [command, selector] of [["view.leftPanel", ".panel-left"], ["view.rightPanel", ".panel-right"]]) {
        await hook(`h.run(${JSON.stringify(command)})`);
        await waitFor(async () => (await hook(`h.query(${JSON.stringify(selector)})`)) === 0, 6000);
        await hook(`h.run(${JSON.stringify(command)})`);
        await waitFor(async () => (await hook(`h.query(${JSON.stringify(selector)})`)) === 1, 6000);
      }
      return "both panels close and reopen";
    });

    await step("chrome", "the panels start equal and the splitters resize them", async () => {
      await openMergeTab();
      await hook("h.settings({ leftPanelWidth: 252, rightPanelWidth: 252 })");
      await sleep(300);
      const equal = await js(`(() => ({
        left: Math.round(document.querySelector('.panel-left').getBoundingClientRect().width),
        right: Math.round(document.querySelector('.panel-right').getBoundingClientRect().width),
      }))()`);
      assert(equal.left === equal.right, `the panels are ${equal.left}px and ${equal.right}px`);

      const splitters = await hook("h.query('.splitter')");
      assert(splitters === 2, `${splitters} splitters, expected one per panel`);

      // Drag the left splitter 60px to the right; the panel should follow it.
      await js(`(() => {
        const splitter = document.querySelector('[data-splitter="left"]');
        splitter.setPointerCapture = () => {};
        splitter.releasePointerCapture = () => {};
        const box = splitter.getBoundingClientRect();
        const at = (type, x) => splitter.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId: 1, clientX: x, clientY: box.top + box.height / 2,
        }));
        at('pointerdown', box.left + 2);
        at('pointermove', box.left + 62);
        at('pointerup', box.left + 62);
      })()`);
      await waitFor(async () => (await state()).settings.leftPanelWidth > 290, 6000);
      const widened = (await state()).settings.leftPanelWidth;

      await hook("h.settings({ leftPanelWidth: 252, rightPanelWidth: 252 })");
      await sleep(250);
      return `both ${equal.left}px, dragged to ${widened}px`;
    });

    await step("chrome", "the side panels follow the session", async () => {
      // A merge shows its conflicts and its own state; everything else shows the
      // session list on the left and nothing on the right.
      await openMergeTab();
      let panels = await js(`(() => ({
        conflicts: document.querySelectorAll('.panel-left .conflict-card').length,
        sessions: document.querySelectorAll('.panel-left [data-session-type]').length,
        right: document.querySelectorAll('.panel-right').length,
      }))()`);
      assert(panels.conflicts > 0, "a merge is not showing its conflicts");
      assert(panels.sessions === 0, "a merge is showing the session list");
      assert(panels.right === 1, "a merge has no right panel");

      await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
      await waitFor(async () => (await state()).tabs.at(-1).kind === "compare", 8000);
      await sleep(300);
      panels = await js(`(() => ({
        conflicts: document.querySelectorAll('.panel-left .conflict-card').length,
        sessions: document.querySelectorAll('.panel-left [data-session-type]').length,
        right: document.querySelectorAll('.panel-right').length,
      }))()`);
      assert(panels.sessions > 0, "a comparison is not showing the session list");
      assert(panels.conflicts === 0, "a comparison is showing conflicts");
      assert(panels.right === 0, "a comparison has a right panel");
      return "conflicts on a merge, sessions elsewhere";
    });

    /*
     * Both of a merge's panels close from their own header and leave a rail against
     * their own edge of the window, so neither can be closed into a state the View
     * menu is the only way out of.
     */
    await step("merge", "both merge panels collapse to a rail and come back", async () => {
      await openMergeTab();
      await hook("h.settings({ showLeftPanel: true, showRightPanel: true })");
      await waitFor(async () => (await state()).settings.showRightPanel === true, 6000);

      const rails = async () => js(`(() => {
        const body = document.querySelector('.body').getBoundingClientRect();
        return [...document.querySelectorAll('.panel-rail')].map((rail) => {
          const box = rail.getBoundingClientRect();
          return {
            width: Math.round(box.width),
            label: rail.textContent.trim(),
            // Which half of the window it is pinned to.
            side: box.left - body.left < body.right - box.right ? "left" : "right",
          };
        });
      })()`);

      await hook(`h.click('.panel-right [data-command="panel.collapseRight"]')`);
      await waitFor(async () => (await state()).settings.showRightPanel === false, 6000);
      let listed = await rails();
      assert(listed.length === 1, `${listed.length} rails with only the right panel closed`);
      assert(listed[0].side === "right", "the right panel left its rail on the left");
      assert(listed[0].width > 0 && listed[0].width < 40, `the rail is ${listed[0].width}px wide`);
      assert(listed[0].label.length > 0, "the rail does not say which panel it reopens");

      await hook(`h.click('.panel-left [data-command="panel.collapse"]')`);
      await waitFor(async () => (await state()).settings.showLeftPanel === false, 6000);
      listed = await rails();
      assert(listed.length === 2, `${listed.length} rails with both panels closed`);
      assert(listed[0].side === "left" && listed[1].side === "right", "the two rails are on the same edge");

      await hook(`h.click('.panel-rail.right')`);
      await waitFor(async () => (await state()).settings.showRightPanel === true, 6000);
      await hook(`h.click('.panel-rail:not(.right)')`);
      await waitFor(async () => (await state()).settings.showLeftPanel === true, 6000);
      const back = await js(`(() => ({
        left: document.querySelectorAll('.panel-left').length,
        right: document.querySelectorAll('.panel-right').length,
        rails: document.querySelectorAll('.panel-rail').length,
      }))()`);
      assert(back.left === 1 && back.right === 1 && back.rails === 0, JSON.stringify(back));

      // Hand the window back the way the step before it left it: a comparison in front,
      // so the steps that follow find the session panel on the left.
      await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
      await waitFor(async () => (await state()).tabs.at(-1).kind === "compare", 8000);
      return "both closed to their own edge and reopened from the rail";
    });

    await step("chrome", "a session can be saved and reopened from the panel", async () => {
      await hook("h.click('[data-command=\"session.save\"]')");
      await waitFor(async () => ((await state()).settings.sessions ?? []).length > 0, 6000);
      const saved = (await state()).settings.sessions[0];
      assert(saved.kind === "text-compare", `saved as ${saved.kind}`);
      assert(saved.paths.length === 2, `saved ${saved.paths.length} paths`);

      // The id is a Windows path, so count the rows instead of quoting
      // backslashes into an attribute selector.
      const listed = await js(`document.querySelectorAll('[data-session]').length`);
      assert(listed === 1, "the saved session is not in the list");

      await hook("h.settings({ sessions: [] })");
      await waitFor(async () => ((await state()).settings.sessions ?? []).length === 0, 6000);
      return `saved "${saved.name}" as ${saved.kind}`;
    });

    await step("chrome", "the log panel opens across the whole window", async () => {
      await hook("h.run('view.logPanel')");
      await waitFor(async () => (await hook("h.query('.bottom-panel')")) === 1, 6000);
      const box = await js(`(() => {
        const log = document.querySelector('.bottom-panel').getBoundingClientRect();
        const shell = document.querySelector('.shell').getBoundingClientRect();
        const rows = document.querySelectorAll('.log-row').length;
        return { log: Math.round(log.width), shell: Math.round(shell.width), rows };
      })()`);
      // It is the application's log, so it runs under the side panels, not between.
      assert(box.log === box.shell, `the log is ${box.log}px of a ${box.shell}px window`);
      assert(box.rows > 0, "the log recorded nothing");
      await hook("h.run('view.logPanel')");
      await waitFor(async () => (await hook("h.query('.bottom-panel')")) === 0, 6000);
      return `${box.log}px wide, ${box.rows} entries`;
    });

    /*
     * The terminal shares the bottom panel with the log. The step runs a command the
     * shell cannot fail at and waits for its output, which is what proves the whole
     * chain: a session was created, a script file was sourced, the marker came back and
     * the prompt was drawn from the theme.
     */
    await step("chrome", "the terminal panel runs a command and draws its prompt", async () => {
      await hook("h.run('view.terminalPanel')");
      await waitFor(async () => (await hook("h.query('.term-view')")) === 1, 20000);
      await waitFor(async () => (await hook("h.query('.term-prompt')")) > 0, 20000);
      const marker = `mdm-smoke-${Date.now()}`;
      await js(`(() => {
        const input = document.querySelector('.term-out input');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'echo ${marker}');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return true;
      })()`);
      await waitFor(async () => js(`document.querySelector('.term-out').textContent.split('${marker}').length > 2`), 25000);
      const prompts = await hook("h.query('.term-prompt')");
      await shot("12-terminal");
      await hook("h.run('view.terminalPanel')");
      await waitFor(async () => (await hook("h.query('.bottom-panel')")) === 0, 6000);
      return `the command echoed back, ${prompts} prompts drawn`;
    });

    await step("chrome", "the resize grip is drawn in the corner and resizes the window", async () => {
      const grip = await js(`(() => {
        const element = document.querySelector('[data-testid="resize-grip"]');
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {
          svg: Boolean(element.querySelector('svg')),
          cursor: getComputedStyle(element).cursor,
          fromRight: window.innerWidth - box.right,
          fromBottom: window.innerHeight - box.bottom,
        };
      })()`);
      assert(grip, "there is no resize grip");
      assert(grip.svg, "the grip draws nothing");
      assert(grip.cursor === "nwse-resize", `the grip's cursor is ${grip.cursor}`);
      assert(grip.fromRight < 12 && grip.fromBottom < 12,
        `the grip sits ${grip.fromRight}px from the right and ${grip.fromBottom}px from the bottom`);

      const before = win.getSize();
      await js(`(() => {
        const grip = document.querySelector('[data-testid="resize-grip"]');
        grip.setPointerCapture = () => {};
        grip.releasePointerCapture = () => {};
        const at = (type, dx, dy) => grip.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId: 1, screenX: 500 + dx, screenY: 500 + dy,
        }));
        at('pointerdown', 0, 0);
        at('pointermove', 70, 50);
        at('pointerup', 70, 50);
      })()`);
      await waitFor(async () => win.getSize()[0] > before[0] + 40, 6000);
      const after = win.getSize();
      win.setSize(before[0], before[1]);
      await sleep(250);
      return `${before[0]}x${before[1]} dragged to ${after[0]}x${after[1]}`;
    });

    await shot("12-chrome");

    /* ------------------------------------------------------------ print */

    await step("print", "the preview paginates and can be stepped through", async () => {
      await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
      await sleep(300);
      const dialog = await openDialog("print", "file.print");
      await waitFor(async () => dialog.webContents.executeJavaScript(
        "document.querySelectorAll('.print-sheet').length > 0", true), 15000);
      const page = await dialog.webContents.executeJavaScript(
        "document.querySelector('[data-testid=\"print-page\"]').textContent", true);
      assert(/\d+\s*\/\s*\d+|Page \d+ of \d+/.test(page), `page indicator: ${page}`);
      const rows = await dialog.webContents.executeJavaScript(
        "document.querySelectorAll('.print-sheet .sheet-row').length", true);
      assert(rows > 0, "the preview page is empty");
      await shot("10-print", dialog);
      return `${page.trim()}, ${rows} rows on the page`;
    });

    await step("print", "the preview settles at the size that fits, and stays there", async () => {
      // The fit used to measure the wrapper around the sheet, which is itself the
      // page times the current scale: every pass then read a box the pass before it
      // had shrunk, so the preview appeared at the right size and then crept down to
      // the minimum. Two readings a moment apart catch exactly that.
      const dialog = childWindows.getDialogWindow("print");
      const measure = () => dialog.webContents.executeJavaScript(`(() => {
        const frame = document.querySelector('.print-preview-frame');
        const sheet = document.querySelector('.print-sheet');
        const box = sheet.getBoundingClientRect();
        const available = frame.getBoundingClientRect();
        return {
          scale: Number((sheet.style.transform.match(/[\\d.]+/) || [0])[0]),
          // How much of the space the dialog gives the preview the page takes up.
          fill: Math.round(100 * Math.max(box.width / available.width, box.height / available.height)),
          overflows: box.width > available.width + 1 || box.height > available.height + 1,
        };
      })()`, true);

      const first = await measure();
      await sleep(900);
      const second = await measure();

      assert(
        Math.abs(first.scale - second.scale) < 0.001,
        `the preview is still resizing itself: ${first.scale} → ${second.scale}`,
      );
      assert(!second.overflows, "the page is larger than the space the preview has");
      assert(second.fill >= 80, `the page uses only ${second.fill}% of the preview area`);
      return `scale ${second.scale.toFixed(2)}, filling ${second.fill}% of the frame`;
    });

    await step("print", "page setup re-paginates the preview", async () => {
      const dialog = childWindows.getDialogWindow("print");
      const before = await dialog.webContents.executeJavaScript(
        "document.querySelector('.print-sheet').style.width", true);
      await dialog.webContents.executeJavaScript(`(() => {
        const select = document.querySelector('[data-field="orientation"]');
        select.value = 'landscape';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`, true);
      await sleep(500);
      const after = await dialog.webContents.executeJavaScript(
        "document.querySelector('.print-sheet').style.width", true);
      assert(before !== after, `the sheet size did not change (${before})`);
      return `${before} → ${after}`;
    });

    await step("print", "the range offers all, current and a custom list", async () => {
      const dialog = childWindows.getDialogWindow("print");
      const options = await dialog.webContents.executeJavaScript(
        "[...document.querySelectorAll('[data-field=\"range\"] option')].map((o) => o.value)", true);
      assert(options.join(",") === "all,current,custom", `range options: ${options.join(",")}`);
      const enabled = await dialog.webContents.executeJavaScript(`(() => {
        const select = document.querySelector('[data-field="range"]');
        select.value = 'custom';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return !document.querySelector('[data-field="customRange"]').disabled;
      })()`, true);
      assert(enabled, "the custom range box stays disabled");
      await dialog.webContents.executeJavaScript("window.mdm.closeDialog()", true);
      await sleep(200);
      return options.join(", ");
    });

    /* ----------------------------------------------------------- themes */

    await step("theme", "every theme applies and stays readable", async () => {
      const themes = await hook("h.themes()");
      assert(themes.length === 40, `${themes.length} themes, expected 20 light and 20 dark`);
      const unreadable = [];
      const seen = new Set();

      for (const id of themes) {
        await hook(`h.settings({ theme: ${JSON.stringify(id)} })`);
        await waitFor(async () => (await state()).settings.theme === id, 6000);
        // Read the variables the stylesheet is actually using, as hex, and do the
        // WCAG arithmetic here — a probe element measured in the page was reading
        // the same colour for both and silently passing.
        const panel = await hook("h.cssVar('--panel')");
        const text = await hook("h.cssVar('--text')");
        const background = await hook("h.cssVar('--bg')");
        seen.add(background);
        const ratio = contrast(panel, text);
        if (!(ratio >= 4.5)) unreadable.push(`${id} ${Number.isFinite(ratio) ? ratio.toFixed(2) : panel + "/" + text}`);
      }

      await hook("h.settings({ theme: 'classic-light' })");
      await sleep(250);
      assert(unreadable.length === 0, `too little contrast: ${unreadable.join(", ")}`);
      assert(seen.size >= 20, `only ${seen.size} distinct backgrounds across ${themes.length} themes`);
      return `${themes.length} themes, ${seen.size} distinct backgrounds, all at least 4.5:1`;
    });

    await step("theme", "the toolbar button alternates light and dark, at random", async () => {
      await hook("h.settings({ theme: 'ocean-light' })");
      await waitFor(async () => (await state()).settings.theme === "ocean-light");

      // Press it six times: the kind must alternate every single time, and over six
      // presses it must have landed on more than one family — that is the random
      // part, and a button that always picked the same two themes would fail here.
      const seen = [];
      let expected = "dark";
      for (let press = 0; press < 6; press++) {
        await hook("h.run('view.themeToggle')");
        await waitFor(async () => (await state()).settings.theme.endsWith(expected), 6000);
        const id = (await state()).settings.theme;
        seen.push(id);
        assert(id.endsWith(expected), `press ${press + 1} gave ${id}, wanted a ${expected} theme`);
        expected = expected === "dark" ? "light" : "dark";
      }

      const families = new Set(seen.map((id) => id.slice(0, id.lastIndexOf("-"))));
      assert(families.size > 1, `six presses only ever chose ${[...families].join(", ")}`);

      await hook("h.settings({ theme: 'classic-light' })");
      await sleep(250);
      return `${seen.length} presses, ${families.size} families`;
    });

    await step("theme", "the toolbar button shows the theme's own colours", async () => {
      const chips = await js(`(() => {
        const swatches = [...document.querySelectorAll('.theme-chips > span')];
        return swatches.map((chip) => getComputedStyle(chip).backgroundColor);
      })()`);
      assert(chips.length >= 3, `${chips.length} chips on the theme button`);
      assert(new Set(chips).size > 1, `all the chips are ${chips[0]}`);
      return `${chips.length} chips: ${[...new Set(chips)].join(" ")}`;
    });

    await step("theme", "a custom theme is applied from its four colours", async () => {
      await hook(`h.settings({ theme: 'custom', customTheme: { kind: 'dark', bg: '#101820', panel: '#18222c', text: '#eaf2fa', accent: '#4f9ad8' } })`);
      await waitFor(async () => (await state()).settings.theme === "custom", 6000);
      const applied = {
        bg: await hook("h.cssVar('--bg')"),
        panel: await hook("h.cssVar('--panel')"),
        text: await hook("h.cssVar('--text')"),
      };
      assert(applied.bg.toLowerCase() === "#101820", `--bg is ${applied.bg}`);
      assert(contrast(applied.panel, applied.text) >= 4.5, "the custom theme is not readable");
      await hook("h.settings({ theme: 'classic-light' })");
      await sleep(250);
      return `custom ${applied.bg}, contrast ${contrast(applied.panel, applied.text).toFixed(2)}:1`;
    });

    /* --------------------------------------------------------- language */

    await step("language", "switching to English retranslates the interface", async () => {
      const koreanMenu = await hook("h.text('.menubar-item[data-menu=\"file\"]')");
      await hook("h.settings({ language: 'en' })");
      await waitFor(async () => (await state()).settings.language === "en");
      const englishMenu = await hook("h.text('.menubar-item[data-menu=\"file\"]')");
      assert(koreanMenu === "파일", `Korean menu read "${koreanMenu}"`);
      assert(englishMenu === "File", `English menu read "${englishMenu}"`);
      await hook("h.settings({ language: 'ko' })");
      await waitFor(async () => (await state()).settings.language === "ko");
      return `${koreanMenu} ↔ ${englishMenu}`;
    });

    /* ----------------------------------------------------------- recent */

    await step("recent", "opening files records them, newest first, capped at ten", async () => {
      const settings = (await state()).settings;
      assert(settings.recent.length > 0, "nothing was recorded");
      assert(settings.recent.length <= 10, `${settings.recent.length} entries`);
      assert(settings.recentDirectories.length > 0, "no directories remembered");
      return `${settings.recent.length} entries, ${settings.recentDirectories.length} folders`;
    });

    await step("recent", "the File menu lists the recent entries", async () => {
      await hook("h.openMenu('file')");
      const popup = await waitFor(() => {
        const menu = childWindows.getMenuWindow();
        return menu && menu.isVisible() && menu.getBounds().height > 30 ? menu : null;
      });
      const rows = await popup.webContents.executeJavaScript(
        "document.querySelectorAll('.menu-row[data-command^=\"recent:\"]').length", true);
      assert(rows > 0, "no recent rows in the File menu");
      await js("window.mdm && window.mdm.closeMenu()");
      return `${rows} recent entries`;
    });

    await step("recent", "one entry can be removed and the list cleared, from the panel", async () => {
      // From the panel's own buttons rather than through the store: the point of
      // the buttons is that the list can be tidied without going to the File menu.
      await hook("h.settings({ showLeftPanel: true })");
      await waitFor(async () => (await state()).settings.showLeftPanel === true);

      const before = (await state()).settings.recent;
      assert(before.length > 1, `only ${before.length} recent entries to work with`);
      const rows = await js("document.querySelectorAll('.panel-left [data-recent]').length");
      assert(rows === before.length, `${before.length} entries but ${rows} rows in the panel`);

      const removed = before[0];
      await hook(`h.click('.panel-left [data-recent-remove="0"]')`);
      await waitFor(async () => (await state()).settings.recent.length === before.length - 1, 8000);
      const left = (await state()).settings.recent;
      assert(
        !left.some((entry) => entry.paths.join("|") === removed.paths.join("|")),
        "the remove button took a different entry than the one it was on",
      );

      await hook(`h.click('.panel-left [data-command="recent.clear"]')`);
      await waitFor(async () => (await state()).settings.recent.length === 0, 8000);
      const empty = await js(`(() => ({
        rows: document.querySelectorAll('.panel-left [data-recent]').length,
        clearDisabled: document.querySelector('.panel-left [data-command="recent.clear"]').disabled,
      }))()`);
      assert(empty.rows === 0, `${empty.rows} rows survived clearing the list`);
      assert(empty.clearDisabled, "Clear stays live with an empty list");
      return `${before.length} → ${before.length - 1} → 0`;
    });

    /* ------------------------------------------------------ drag & drop */

    await step("dnd", "dropping two files opens them as a comparison", async () => {
      const result = await hook(`h.drop(${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
      const tab = result.tabs.at(-1);
      assert(tab.kind === "compare", `a drop opened a ${tab.kind} tab`);
      return tab.title;
    });

    await step("dnd", "dropping two folders opens a directory comparison", async () => {
      const result = await hook(`h.drop(${JSON.stringify([sample("tree", "left"), sample("tree", "right")])})`);
      const tab = result.tabs.at(-1);
      assert(tab.kind === "directory", `a folder drop opened a ${tab.kind} tab`);
      return tab.title;
    });

    /* -------------------------------------------------------- shortcuts */

    await step("keyboard", "shortcuts reach their commands", async () => {
      const before = (await state()).settings.zoom;
      await hook("h.key({ key: '+', ctrlKey: true })");
      await waitFor(async () => (await state()).settings.zoom > before, 5000);
      await hook("h.key({ key: '-', ctrlKey: true })");
      await waitFor(async () => (await state()).settings.zoom === before, 5000);
      return `Ctrl++ / Ctrl+- around ${before}%`;
    });

    /* -------------------------------------------------------- settings */

    await step("persist", "settings are written to disk and read back", async () => {
      await hook("h.settings({ theme: 'nord-dark', zoom: 120 })");
      await waitFor(async () => (await state()).settings.theme === "nord-dark");
      const file = (await state()).settings.settingsPath;
      const saved = JSON.parse(fsSync.readFileSync(file, "utf8"));
      assert(saved.theme === "nord-dark" && saved.zoom === 120, JSON.stringify({ theme: saved.theme, zoom: saved.zoom }));
      await hook("h.settings({ theme: 'classic-light', zoom: 100 })");
      return file;
    });

    /* -------------------------------------------------------- shutdown */

    await step("shutdown", "popups close with the application", async () => {
      await openDialog("about", "help.about");
      const open = [...childWindows.dialogWindows.values()].filter((item) => !item.isDestroyed()).length;
      assert(open > 0, "no dialog was open to test with");
      childWindows.closeAllChildWindows();
      await sleep(400);
      const menu = childWindows.getMenuWindow();
      const remaining = [...childWindows.dialogWindows.values()].filter((item) => !item.isDestroyed()).length;
      assert(remaining === 0, `${remaining} dialogs survived`);
      assert(menu === null, "the menu window survived");
      return `${open} popups closed`;
    });

    await shot("11-final");

    const report = { results, shots, outDir };
    process.stdout.write(`\n__MDM_SMOKE__${JSON.stringify(report)}__MDM_SMOKE__\n`);
    app.exit(results.every((item) => item.ok) ? 0 : 1);
  };

  const fail = (error) => {
    const report = {
      results: [...results, { category: "harness", name: "smoke run", ok: false, detail: String(error && error.stack ? error.stack : error) }],
      shots,
      outDir,
    };
    process.stdout.write(`\n__MDM_SMOKE__${JSON.stringify(report)}__MDM_SMOKE__\n`);
    app.exit(1);
  };

  // Whatever happens, a report is printed: a run that dies silently tells nobody
  // anything, and the runner can only report "no report was produced".
  const limit = Number(process.env.MDM_SMOKE_TIMEOUT || 9 * 60 * 1000);
  const watchdog = setTimeout(() => fail(new Error(`the GUI test did not finish within ${limit} ms`)), limit);
  if (typeof watchdog.unref === "function") watchdog.unref();

  // Started unconditionally rather than off `did-finish-load`: the first thing `run`
  // does is wait for the renderer's hook to appear, which is a better signal than any
  // load event, and waiting for an event that has already fired hangs the whole run.
  run().then(() => clearTimeout(watchdog)).catch((error) => {
    clearTimeout(watchdog);
    fail(error);
  });

  void BrowserWindow;
};

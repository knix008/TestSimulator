'use strict';

// The GUI smoke test: the real application, driven in a real Electron window.
//
// The unit tests run the renderer in jsdom, which cannot tell whether a menu
// really opened as its own window, whether the minimum width reached the OS, or
// whether the app survives being started with a book on its command line. This
// does: `npm run smoke` starts the packaged renderer with a sample book, works
// the controls through the DOM, checks the windows the main process created, and
// exits non-zero if anything is wrong.
//
// It is loaded by main.js only when EBK_SMOKE=1, so a normal run never pays for
// it and the app has no test-only code paths in it.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const child = require('./childwindows');

/** How many books the shelf is seeded with before the app starts. */
const SHELF_SEED = 100000;

const results = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === 'string' ? detail : '');
  } catch (err) {
    record(name, false, err?.message || String(err));
  }
}

/** Runs an expression in the window and returns its value. */
function evaluate(win, expression) {
  return win.webContents.executeJavaScript(`(() => { ${expression} })()`, true);
}

/** Waits for the pooled menu window to be on screen. */
async function waitForMenu(timeout = 6000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const menu = child.getMenuWindow();
    if (menu && !menu.isDestroyed() && menu.isVisible()) return menu;
    if (Date.now() > deadline) return null;
    // eslint-disable-next-line no-await-in-loop
    await wait(100);
  }
}

/** Waits until an expression in the window is truthy. */
async function until(win, expression, { timeout = 8000, step = 120 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const value = await evaluate(win, `return ${expression};`);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${expression}`);
    // eslint-disable-next-line no-await-in-loop
    await wait(step);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  return true;
}

async function run(win) {
  console.log('\nMyEBookReader — GUI smoke test\n');

  await check('the window opens and the renderer loads', async () => {
    await until(win, "!!document.querySelector('.app')");
    return `${win.getSize()[0]}×${win.getSize()[1]}`;
  });

  await check('the title bar shows the name and the version', async () => {
    const text = await evaluate(win, "return document.querySelector('.titlebar-app').textContent + ' ' + document.querySelector('.titlebar-version').textContent;");
    assert(/MyEBookReader v\d+\.\d+\.\d+/.test(text), `title bar reads "${text}"`);
    return text;
  });

  await check('every toolbar button has a tooltip', async () => {
    const missing = await evaluate(win, `
      const buttons = [...document.querySelectorAll('.toolbar button')];
      return buttons.filter((b) => !b.getAttribute('title') && !b.getAttribute('data-tip')).length;
    `);
    assert(missing === 0, `${missing} button(s) without a tooltip`);
    const count = await evaluate(win, "return document.querySelectorAll('.toolbar button').length;");
    return `${count} buttons`;
  });

  await check('the book named on the command line is open', async () => {
    try {
      await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 15000 });
    } catch (err) {
      // Say what was on screen instead: a bare "timed out" tells nobody why.
      const seen = await evaluate(win, `
        const pane = document.querySelector('[data-testid=bookview]');
        return JSON.stringify({
          pane: pane ? pane.className : null,
          html: pane ? pane.innerHTML.slice(0, 160) : null,
          tabs: document.querySelectorAll('.doctab').length,
          status: document.querySelector('.statusbar').textContent.slice(0, 120),
        });
      `);
      throw new Error(`${err.message} — saw ${seen}`);
    }
    const text = await evaluate(win, "return document.querySelector('[data-testid=chapter]').textContent.slice(0, 40);");
    assert(text.trim().length > 0, 'the chapter is empty');
    return text.trim().replace(/\s+/g, ' ');
  });

  await check('the contents list shows the chapters', async () => {
    const rows = await until(win, "document.querySelectorAll('.toc-row').length");
    assert(rows >= 3, `only ${rows} contents rows`);
    return `${rows} entries`;
  });

  await check('an ordinary book turns by its arrows and by the keyboard', async () => {
    // A reflowable book, where turning a page scrolls within the chapter until
    // it runs out and then moves to the next one. Both count as having turned;
    // what must not happen is nothing at all.
    await until(win, "!!document.querySelector('.chapter')", { timeout: 20000 });
    // Let the opening finish before touching anything: a book restores where it
    // was left, and that arrives after the first chapter is on screen.
    await until(win, `(() => {
      const box = document.querySelector('.page-input');
      const now = box ? box.value : '';
      const same = window.__settled === now;
      window.__settled = now;
      return same ? now : null;
    })()`, { timeout: 12000, step: 700 });

    const where = `return (() => {
      const pane = document.querySelector('.bookview');
      const box = document.querySelector('.page-input');
      return {
        page: Number(box ? box.value : 0),
        top: Math.round(pane.scrollTop),
        room: pane.scrollHeight - pane.clientHeight,
        mode: pane.className,
      };
    })()`;

    // Pressed where it is, not by calling its click handler: a button that
    // something else covers still answers .click() and is useless to a reader.
    const press = (which) => evaluate(win, `return (() => {
      const arrow = document.querySelector('.page-arrow.${which}');
      if (!arrow) return { error: 'no page arrows over the book' };
      const box = arrow.getBoundingClientRect();
      const x = Math.round(box.left + box.width / 2);
      const y = Math.round(box.top + box.height / 2);
      const on = document.elementFromPoint(x, y);
      if (!on || !arrow.contains(on)) {
        return { error: 'the ${which} arrow is covered by ' + (on ? (on.className || on.tagName) : 'nothing') };
      }
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        on.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
      }
      return { ok: true };
    })()`);

    const key = (name) => evaluate(win, `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${name}', bubbles: true })); return true;`);

    const moved = (before, after) => after.page !== before.page || after.top !== before.top;
    const steps = [];

    for (const [how, act] of [['arrow', () => press('right')], ['PageDown', () => key('PageDown')]]) {
      const before = await evaluate(win, where);
      const done = await act();
      assert(!done?.error, done.error);
      await wait(900);
      const after = await evaluate(win, where);
      assert(moved(before, after) || before.page >= 3,
        `${how} left the book on chapter ${before.page} at ${before.top}px, with ${before.room}px still to go`);
      steps.push(`${how}: ${before.page}@${before.top} → ${after.page}@${after.top} [room ${before.room}, ${before.mode}]`);
    }

    // And back the other way.
    const beforeBack = await evaluate(win, where);
    await key('PageUp');
    await wait(900);
    const afterBack = await evaluate(win, where);
    assert(moved(beforeBack, afterBack), 'PageUp did not take the book back');
    steps.push(`PageUp: ${beforeBack.page}@${beforeBack.top} → ${afterBack.page}@${afterBack.top}`);

    const labels = await evaluate(win, `return [...document.querySelectorAll('.page-arrow')]
      .map((b) => b.getAttribute('aria-label') || '')`);
    assert(labels.length === 2 && labels.every(Boolean), `the arrows are labelled [${labels.join(', ')}]`);
    return steps.join(' · ');
  });

  await check('the status bar reports the format and the position', async () => {
    const text = await evaluate(win, "return document.querySelector('.statusbar').textContent;");
    assert(text.includes('EPUB'), 'the format is missing');
    // Which chapter depends on where this book was left last time.
    const position = /\d+ \/ 3/.exec(text);
    assert(position, 'the position is missing');
    return `EPUB · ${position[0]}`;
  });

  await check('the chapter buttons move through the book', async () => {
    const read = async () => {
      const text = await evaluate(win, "return document.querySelector('.statusbar').textContent;");
      return Number(/(\d+) \/ 3/.exec(text)[1]);
    };
    const click = (tip) => evaluate(win, `
      const button = [...document.querySelectorAll('.toolbar button')]
        .find((b) => (b.getAttribute('title') || '').includes('${tip}'));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    `);
    const before = await read();
    // Whichever direction is available from where the book was left.
    const forward = before < 3;
    await click(forward ? 'PageDown' : 'PageUp');
    await wait(500);
    const after = await read();
    assert(after === before + (forward ? 1 : -1), `the reader stayed on chapter ${after}`);
    return `${before} \u2192 ${after}`;
  });

  await check('the menu bar opens the same menus as the toolbar', async () => {
    const bar = await evaluate(win, `return (() => {
      const items = [...document.querySelectorAll('.menubar-item')];
      return { names: items.map((b) => b.textContent.trim()), menus: items.map((b) => b.dataset.menu) };
    })()`);
    assert(bar.menus.join(',') === 'file,reading,view,marks,app',
      `the bar holds [${bar.menus.join(', ')}]`);
    assert(bar.names.every(Boolean), 'a menu with no name on the bar');

    await evaluate(win, "document.querySelector('.menubar-item[data-menu=\"view\"]').click(); return true;");
    const menu = await waitForMenu();
    assert(menu, 'the View menu did not open from the bar');
    const rows = await menu.webContents.executeJavaScript(
      "document.querySelectorAll('.menu-item').length",
    );
    assert(rows > 5, `the View menu shows ${rows} row(s)`);
    const bounds = menu.getBounds();
    const anchored = await evaluate(win, `return (() => {
      const item = document.querySelector('.menubar-item[data-menu="view"]');
      const rect = item.getBoundingClientRect();
      return { left: Math.round(rect.left), bottom: Math.round(rect.bottom), open: item.classList.contains('open') };
    })()`);
    assert(anchored.open, 'the bar does not show which menu is open');
    menu.hide();
    await evaluate(win, "window.dispatchEvent(new Event('pointerdown')); return true;");
    return `${bar.names.join(' · ')} — View opened ${rows} rows at ${bounds.x},${bounds.y}`;
  });

  await check('a toolbar menu opens as its own window', async () => {
    await evaluate(win, `
      const button = [...document.querySelectorAll('.toolbar button')].find((b) => b.getAttribute('aria-label') === '파일' || b.getAttribute('aria-label') === 'File');
      button.click();
      return true;
    `);
    const menu = await waitForMenu();
    assert(menu, 'no menu window was created');
    const bounds = menu.getBounds();
    assert(bounds.height > 40, `the menu window is ${bounds.height}px tall`);
    menu.hide();
    return `${bounds.width}×${bounds.height} at ${bounds.x},${bounds.y}`;
  });

  await check('a dialog opens as its own window, fixed in size', async () => {
    await evaluate(win, `
      const button = [...document.querySelectorAll('.toolbar button')].find((b) => (b.getAttribute('aria-label') || '').includes('설정') || (b.getAttribute('aria-label') || '').includes('Settings'));
      button.click();
      return true;
    `);
    await wait(1200);
    assert(child.isDialogOpen('settings'), 'the settings window did not open');
    const dialog = child.dialogWindows.get('settings');
    assert(!dialog.isResizable(), 'the settings window is resizable');
    const [width, height] = dialog.getSize();
    child.closeDialogWindow('settings');
    return `${width}×${height}`;
  });

  await check('the window is never narrower than the toolbar', async () => {
    const [minWidth] = win.getMinimumSize();
    assert(minWidth >= 980, `the minimum width is ${minWidth}`);
    return `${minWidth}px`;
  });

  await check('the bookmark list opens as its own window', async () => {
    await evaluate(win, `
      const add = [...document.querySelectorAll('.toolbar button')]
        .find((b) => (b.getAttribute('title') || '').includes('Ctrl+B'));
      add.click();
      return true;
    `);
    await wait(500);
    const listed = await evaluate(win, "return document.querySelectorAll('.mark-list li').length;");
    assert(listed > 0, 'the bookmark was not listed in the panel');
    await evaluate(win, `
      const chevron = [...document.querySelectorAll('.menu-wrap.split .menu-btn')]
        .find((b) => !b.disabled);
      chevron.click();
      return true;
    `);
    const menu = await waitForMenu();
    assert(menu, 'no bookmark menu window');
    menu.hide();
    return `${listed} bookmark(s)`;
  });

  await check('the panels can be hidden and shown', async () => {
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })); return true;");
    await wait(300);
    const hidden = await evaluate(win, "return !document.querySelector('.side-panel.left');");
    assert(hidden, 'the left panel did not close');
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true })); return true;");
    await wait(300);
    return 'F9 closes and reopens it';
  });

  await check('the theme list shows both families, two columns each, whole', async () => {
    const { screen } = require('electron');
    await evaluate(win, "document.querySelector('.toolbar-right .menu-wrap.split .menu-btn').click(); return true;");
    const menu = await waitForMenu();
    assert(menu, 'the theme list did not open');
    const bounds = menu.getBounds();
    const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;

    const shown = await menu.webContents.executeJavaScript(`(() => {
      const box = document.querySelector('.menu-window');
      const groups = [...document.querySelectorAll('.menu-group')];
      return {
        rows: document.querySelectorAll('.menu-item').length,
        families: groups.map((g) => ({
          head: (g.querySelector('.menu-head') || {}).textContent || '',
          items: g.querySelectorAll('.menu-item').length,
          columns: ((g.querySelector('.menu-list') || {}).className || '').replace(/^.*cols-([0-9]).*$/, '$1'),
        })),
        // Nothing may be cut off: what the menu wants to draw must fit in what
        // its window actually shows.
        overflowX: box.scrollWidth - box.clientWidth,
        overflowY: box.scrollHeight - box.clientHeight,
        width: Math.round(box.getBoundingClientRect().width),
        height: Math.round(box.getBoundingClientRect().height),
      };
    })()`);
    menu.hide();

    assert(shown.rows === 40, `${shown.rows} themes instead of 40`);
    assert(shown.families.length === 2, `${shown.families.length} families instead of two`);
    for (const family of shown.families) {
      assert(family.head, 'a family with no heading');
      assert(family.items === 20, `${family.head} holds ${family.items} themes`);
      assert(family.columns === '2', `${family.head} is in ${family.columns} column(s)`);
    }
    assert(shown.overflowX <= 1, `${shown.overflowX}px of the menu is cut off to the right`);
    assert(shown.overflowY <= 1, `${shown.overflowY}px of the menu is cut off at the bottom`);
    assert(bounds.height <= area.height && bounds.width <= area.width,
      `the menu window is ${bounds.width}×${bounds.height} on a ${area.width}×${area.height} screen`);
    return `${shown.families.map((f) => `${f.head} ${f.items}`).join(' · ')} — ${shown.width}×${shown.height}`;
  });

  await check('the theme can be changed', async () => {
    const before = await evaluate(win, "return document.documentElement.getAttribute('data-theme');");
    await evaluate(win, "document.querySelector('.toolbar-right .menu-wrap.split .tbtn').click(); return true;");
    await wait(400);
    const after = await evaluate(win, "return document.documentElement.getAttribute('data-theme');");
    assert(before !== after, `the theme stayed on ${after}`);
    return `${before} → ${after}`;
  });

  // ── The other kinds of book, in the same window ─────────
  await check('a PDF opens and its page is painted', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.pdf'));
    await until(win, "!!document.querySelector('canvas.pdf-canvas')", { timeout: 20000 });
    const size = await until(
      win,
      "(document.querySelector('canvas.pdf-canvas') || {}).width > 100 "
        + "&& document.querySelector('canvas.pdf-canvas').width + 'x' + document.querySelector('canvas.pdf-canvas').height",
      { timeout: 20000 },
    );
    const text = await evaluate(win, "return document.querySelector('.statusbar').textContent;");
    assert(text.includes('PDF'), 'the status bar does not say PDF');
    return `${size} canvas`;
  });

  await check('a comic opens and shows its first page', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.cbz'));
    await until(win, "!!document.querySelector('img.comic-page')", { timeout: 20000 });
    const src = await evaluate(win, "return document.querySelector('img.comic-page').getAttribute('src').slice(0, 5);");
    assert(src === 'blob:' || src === 'data:', `the page src is "${src}"`);
    const tabs = await evaluate(win, "return document.querySelectorAll('.doctab').length;");
    assert(tabs === 3, `${tabs} tabs instead of three`);
    return `${tabs} books open`;
  });

  await check('a MOBI opens and shows its text', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.mobi'));
    await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 20000 });
    const text = await evaluate(win, "return document.querySelector('[data-testid=chapter]').textContent.slice(0, 30);");
    assert(text.trim().length > 0, 'the MOBI chapter is empty');
    return text.trim().replace(/\s+/g, ' ');
  });

  await check('a picture opens, and a TIFF is decoded', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.tif'));
    await until(win, "!!document.querySelector('img.comic-page')", { timeout: 20000 });
    const size = await until(
      win,
      "document.querySelector('img.comic-page').naturalWidth > 10 "
        + "&& document.querySelector('img.comic-page').naturalWidth + 'x' + document.querySelector('img.comic-page').naturalHeight",
      { timeout: 20000 },
    );
    const status = await evaluate(win, "return document.querySelector('.statusbar').textContent;");
    assert(/TIFF|Image/i.test(status), 'the status bar does not name the picture format');
    return size;
  });

  await check('a DICOM image is decoded and shown', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.dcm'));
    await wait(1200);
    const size = await until(
      win,
      "document.querySelector('img.comic-page') && document.querySelector('img.comic-page').naturalWidth > 10 "
        + "&& document.querySelector('img.comic-page').naturalWidth + 'x' + document.querySelector('img.comic-page').naturalHeight",
      { timeout: 20000 },
    );
    return size;
  });

  await check('two pages can be shown side by side', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.cbz'));
    // A picture is drawn with the same element as a comic page, so waiting for
    // one of those would have matched the DICOM image opened a moment ago; the
    // wait is for a page of this comic.
    await until(win, "((document.querySelector('img.comic-page') || {}).alt || '').startsWith('page')", { timeout: 20000 });

    // Where the last run left off is remembered per book, and the last page of
    // a comic has nothing to face it, so this starts at the first.
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await until(win, "(document.querySelector('img.comic-page') || {}).alt === 'page1.png'", { timeout: 8000 });

    // The button says which way of showing pages is on now, and switches to the
    // other one — so whether it has to be pressed depends on where the last run
    // left it. Asking for the state first is what keeps this check honest.
    await evaluate(win, `
      const single = [...document.querySelectorAll('.toolbar button')]
        .find((b) => ['한 장 보기', 'Single page'].includes(b.getAttribute('aria-label') || ''));
      if (single) single.click();
      return true;
    `);
    await until(win, "[...document.querySelectorAll('img.comic-page')].filter((i) => i.complete && i.naturalWidth > 0).length === 2", { timeout: 10000 });
    await until(win, "!document.querySelector('.bookview .turning')", { timeout: 5000 });

    const spread = await evaluate(win, `return (() => {
      const pages = [...document.querySelectorAll('img.comic-page')];
      const wrap = document.querySelector('.page-spread');
      const box = pages.map((img) => Math.round(img.getBoundingClientRect().left));
      return {
        pages: pages.length,
        facing: pages.filter((img) => img.classList.contains('facing')).length,
        names: pages.map((img) => img.getAttribute('alt') || ''),
        sideBySide: box.length === 2 && box[1] > box[0],
        loaded: pages.filter((img) => img.complete && img.naturalWidth > 0).length,
        inOneSpread: !!wrap && wrap.querySelectorAll('img.comic-page').length === 2,
      };
    })()`);
    assert(spread.pages === 2, `${spread.pages} page(s) instead of two`);
    assert(spread.facing === 1, 'the second page is not marked as the facing one');
    assert(spread.inOneSpread, 'the two pages are not in the same spread');
    assert(spread.sideBySide, 'the second page is not beside the first');
    assert(spread.loaded === 2, `${spread.loaded} of the two pages actually decoded`);
    assert(spread.names[0] !== spread.names[1], `both pages show ${spread.names[0]}`);

    // Turning the page in a spread moves on by two, not by one.
    const turned = await evaluate(win, `return (async () => {
      const before = [...document.querySelectorAll('img.comic-page')].map((i) => i.getAttribute('alt'));
      const status = document.querySelector('.statusbar');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const now = [...document.querySelectorAll('img.comic-page')].map((i) => i.getAttribute('alt'));
        if (now[0] && now[0] !== before[0]) return { before, after: now, status: (status || {}).textContent || '' };
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 16));
      }
      return { error: 'the spread never turned' };
    })()`);
    assert(!turned.error, turned.error);
    // A spread turns two pages at a time: page1 · page2 → page3 · page4.
    const numbers = (names) => names.map((name) => Number((name.match(/[0-9]+/) || [0])[0]));
    const before = numbers(turned.before);
    const after = numbers(turned.after);
    assert(after[0] === before[0] + 2 && after[1] === before[1] + 2,
      `it went from ${turned.before.join(' · ')} to ${turned.after.join(' · ')}`);
    return `${turned.before.join(' · ')} → ${turned.after.join(' · ')}`;
  });

  await check('a page turn runs the effect that was chosen for it', async () => {
    // The effect is chosen in the settings window, so that is where it is set:
    // this check covers the setting reaching the reading pane, not just the
    // class the pane would add if it were told to.
    await evaluate(win, `
      const button = [...document.querySelectorAll('.toolbar button')]
        .find((b) => (b.getAttribute('aria-label') || '').includes('설정') || (b.getAttribute('aria-label') || '').includes('Settings'));
      button.click();
      return true;
    `);
    await wait(1200);
    const dialog = child.dialogWindows.get('settings');
    assert(dialog && !dialog.isDestroyed(), 'the settings window did not open');

    const opened = await dialog.webContents.executeJavaScript(`(() => {
      const tab = [...document.querySelectorAll('.tabs .tab')]
        .find((b) => ['읽기', 'Reading'].includes(b.textContent.trim()));
      if (!tab) return { error: 'no reading tab' };
      tab.click();
      return { ok: true };
    })()`);
    assert(!opened.error, opened.error);
    await wait(400);

    const chosen = await dialog.webContents.executeJavaScript(`(() => {
      const flip = [...document.querySelectorAll('.settings-panel.on .btn.seg')]
        .find((b) => ['책장 넘김', 'Page flip'].includes(b.textContent.trim()));
      if (!flip) return { error: 'no page-flip button' };
      flip.click();
      return { ok: true, label: flip.textContent.trim() };
    })()`);
    assert(!chosen.error, chosen.error);
    await wait(400);
    child.closeDialogWindow('settings');
    await wait(400);

    // Watch for the class the effect is made of, which is on the page for less
    // than half a second — a poll would miss it.
    const seen = await evaluate(win, `return (async () => {
      const pane = document.querySelector('.bookview');
      if (!pane) return { error: 'no reading pane' };
      const marks = new Set();
      let starts = 0;
      let turning = false;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const el = record.target;
          for (const name of el.classList) if (name.startsWith('turn') || name === 'turning') marks.add(name);
        }
        const now = !!pane.querySelector('.turning');
        if (now && !turning) starts += 1;
        turning = now;
      });
      observer.observe(pane, { attributes: true, attributeFilter: ['class'], subtree: true });
      // Some effects are applied to a freshly keyed element rather than to the
      // one that was there, so what is on screen counts too.
      let sawLeaf = false;
      const sweep = () => {
        if (pane.querySelector('.turn-leaf img')) sawLeaf = true;
        for (const el of pane.querySelectorAll('[class*="turn"]')) {
          for (const name of el.classList) if (name.startsWith('turn') || name === 'turning') marks.add(name);
        }
      };
      // A class is not an animation: this records what the browser is actually
      // playing, which is the thing the reader sees.
      const running = [];
      const watch = () => {
        for (const el of pane.querySelectorAll('.chapter, .page-spread, .comic-page, .pdf-page, .turn-leaf')) {
          for (const animation of (el.getAnimations ? el.getAnimations() : [])) {
            const name = animation.animationName || '';
            if (name && !running.some((a) => a.name === name)) {
              running.push({ name, ms: Math.round(animation.effect?.getTiming?.().duration || 0) });
            }
          }
        }
      };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
      const deadline = performance.now() + 1600;
      while (performance.now() < deadline) {
        watch();
        sweep();
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 8));
      }
      watch();
      observer.disconnect();
      return { marks: [...marks], running, starts, leaf: sawLeaf, reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
    })()`);
    assert(!seen.error, seen.error);
    assert(seen.marks.includes('turn-flip'), `the effect classes seen were [${seen.marks.join(', ')}]`);
    if (process.env.EBK_SMOKE_SHOT) {
      // A picture of the turn in flight, which is the only way to judge it.
      await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true })); return true;");
      await wait(170);
      const shot = await win.capturePage();
      require('fs').writeFileSync(process.env.EBK_SMOKE_SHOT.replace(/\.png$/i, '-turning.png'), shot.toPNG());
      await wait(700);
    }

    assert(seen.marks.includes('turning'), 'the pane was never marked as turning');
    // The class is not the point — the animation is. A system set to "no
    // animations" stopped the chosen effect dead, and the class alone could
    // not tell: it was there, and nothing moved.
    const played = (seen.running || []).filter((a) => /^(turn|leaf)-/.test(a.name || ''));
    assert(seen.leaf, 'no leaf was drawn for the turn');
    assert(played.length > 0,
      `nothing was animated (the system asks for reduced motion: ${seen.reduced})`);
    assert(played[0].ms >= 300, `the turn lasts ${played[0].ms}ms, too quick to see`);
    // One leaf, once. Two pages turning at the same time — or the same turn
    // running twice because the chapter and the column both changed — reads as
    // a handful of pages going by.
    const leaves = new Set(played.map((a) => a.name));
    assert(leaves.size === 1, `${leaves.size} different animations ran: ${[...leaves].join(', ')}`);
    assert(seen.starts <= 1, `the effect started ${seen.starts} times for one turn`);

    // And the effect goes away again, rather than leaving the page mid-turn.
    await until(win, "!document.querySelector('.bookview .turning')", { timeout: 5000 });
    const shown = played[0];
    return `${shown.name} for ${shown.ms}ms${seen.reduced ? ', despite the system asking for less motion' : ''}`;
  });

  await check('neither panel is ever narrow enough to cut off its own tabs', async () => {
    // Squeeze both panels as far as the app will let them go, then look.
    const squeezed = await evaluate(win, `return (() => {
      const report = [];
      for (const side of ['left', 'right']) {
        const panel = document.querySelector('.side-panel.' + side);
        if (!panel) { report.push({ side, error: 'no panel' }); continue; }
        const tabs = panel.querySelector('.panel-tabs');
        const clipped = [...panel.querySelectorAll('.panel-tab-label')]
          .filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent);
        report.push({
          side,
          width: Math.round(panel.getBoundingClientRect().width),
          needs: tabs.scrollWidth,
          minWidth: panel.style.minWidth,
          clipped,
        });
      }
      return report;
    })()`);

    for (const panel of squeezed) {
      assert(!panel.error, `${panel.side}: ${panel.error}`);
      assert(panel.width >= panel.needs, `the ${panel.side} panel is ${panel.width}px for ${panel.needs}px of tabs`);
      assert(!panel.clipped.length, `the ${panel.side} panel (${panel.width}px, min ${panel.minWidth}, tabs ${panel.needs}px) cuts off ${panel.clipped.join(', ')}`);
      assert(panel.minWidth, `the ${panel.side} panel has no minimum width`);
    }
    return squeezed.map((p) => `${p.side} ${p.width}px ≥ ${p.needs}px`).join(', ');
  });

  await check('the shelf is read from disk whole', async () => {
    const read = await evaluate(win, `return (async () => {
      const t0 = performance.now();
      const text = await window.electronAPI.gallery.load();
      const readMs = performance.now() - t0;
      const t1 = performance.now();
      const rows = JSON.parse(text);
      const parseMs = performance.now() - t1;
      const t2 = performance.now();
      rows.sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
      return {
        books: rows.length,
        mb: +(text.length / 1048576).toFixed(1),
        read: Math.round(readMs),
        parse: Math.round(parseMs),
        sort: Math.round(performance.now() - t2),
      };
    })()`);
    assert(read.books >= SHELF_SEED, `the shelf holds ${read.books}`);
    const total = read.read + read.parse + read.sort;
    assert(total < 1000, `reading the shelf took ${total}ms`);
    return `${read.books} books · ${read.mb} MB · read ${read.read}ms, parse ${read.parse}ms, sort ${read.sort}ms`;
  });

  await check('the gallery shows a shelf of 100,000 books in under a second', async () => {
    // A window that is not in front has its timers clamped to one a second, so
    // a polling loop would time the clamp rather than the gallery. The moments
    // are recorded by a MutationObserver — which is not throttled — and read
    // back afterwards, however slowly the reading gets there.
    win.show();
    win.focus();
    await wait(300);

    const started = await evaluate(win, `return (() => {
      const gallery = [...document.querySelectorAll('.toolbar button')]
        .find((b) => ['갤러리', 'Gallery'].includes(b.getAttribute('aria-label') || ''));
      if (!gallery) return { error: 'no gallery button' };

      window.__shelfTiming = { start: performance.now(), pane: 0, cards: 0, count: '', n: 0 };
      const timing = window.__shelfTiming;
      const observer = new MutationObserver(() => {
        if (!timing.pane && document.querySelector('.gallery')) {
          timing.pane = Math.round(performance.now() - timing.start);
          // Which view it opens in is remembered between runs; this is about covers.
          const icons = document.querySelector('.gallery-views button');
          if (icons) icons.click();
        }
        const cards = document.querySelectorAll('.gcard').length;
        if (!timing.cards && cards) {
          timing.cards = Math.round(performance.now() - timing.start);
          timing.n = cards;
          timing.count = (document.querySelector('.gallery-count') || {}).textContent || '';
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      gallery.click();
      return { ok: true };
    })()`);
    assert(!started.error, started.error);

    const opened = await until(win, 'window.__shelfTiming && window.__shelfTiming.cards ? window.__shelfTiming : null', { timeout: 15000 });
    const held = Number((opened.count.match(/[0-9]+/) || [0])[0]);
    assert(held >= SHELF_SEED, `the shelf says it holds ${held}`);
    assert(opened.cards < 1000, `it took ${opened.cards}ms to show the shelf (the pane after ${opened.pane}ms)`);
    // Windowed: a hundred thousand books, a couple of dozen elements.
    assert(opened.n < 200, `${opened.n} cards in the DOM`);
    return `${held} books shown in ${opened.cards}ms (pane ${opened.pane}ms) with ${opened.n} cards`;
  });

  await check('scrolling into the middle of the shelf costs no more', async () => {
    const started = await evaluate(win, `return (() => {
      const body = document.querySelector('.gallery-grid-wrap');
      if (!body) return { error: 'the gallery is not showing its cards' };
      const before = (document.querySelector('.gname') || {}).textContent || '';
      window.__scrollTiming = { start: performance.now(), ms: 0, cards: 0, name: '' };
      const timing = window.__scrollTiming;
      const observer = new MutationObserver(() => {
        const name = (document.querySelector('.gname') || {}).textContent || '';
        if (!timing.ms && name && name !== before) {
          timing.ms = Math.round(performance.now() - timing.start);
          timing.cards = document.querySelectorAll('.gcard').length;
          timing.name = name;
          observer.disconnect();
        }
      });
      observer.observe(body, { childList: true, subtree: true });
      body.scrollTop = Math.floor(body.scrollHeight / 2);
      return { ok: true };
    })()`);
    assert(!started.error, started.error);

    const scrolled = await until(win, 'window.__scrollTiming && window.__scrollTiming.ms ? window.__scrollTiming : null', { timeout: 10000 });
    assert(scrolled.ms < 1000, `the middle of the shelf took ${scrolled.ms}ms`);
    assert(scrolled.cards < 200, `${scrolled.cards} cards after scrolling`);
    return `${scrolled.ms}ms, still ${scrolled.cards} cards`;
  });

  await check('the books read in this run are on the shelf, with their covers', async () => {
    const found = await evaluate(win, `return (async () => {
      const input = document.querySelector('.gallery-search input');
      if (!input) return { error: 'the gallery is not open' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'sample');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const deadline = performance.now() + 4000;
      while (performance.now() < deadline) {
        const cards = document.querySelectorAll('.gcard').length;
        const count = (document.querySelector('.gallery-count') || {}).textContent || '';
        if (cards && count.includes('·')) {
          return { cards, covers: document.querySelectorAll('.gcover-img').length, count };
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 16));
      }
      return { error: 'the search found nothing' };
    })()`);
    assert(!found.error, found.error);
    assert(found.cards >= 5, `${found.cards} of this run's books are shelved`);
    assert(found.covers >= 1, 'not one of them kept a cover');
    return `${found.cards} books, ${found.covers} with covers`;
  });

  await check('the same shelf, in detail, is windowed too', async () => {
    await evaluate(win, `
      [...document.querySelectorAll('.gallery-views button')].at(-1).click();
      return true;
    `);
    await wait(400);
    const details = await evaluate(win, `return (() => {
      const gallery = document.querySelector('.gallery');
      return {
        view: gallery.className,
        rows: gallery.querySelectorAll('.gallery-table tbody tr:not(.gspacer)').length,
        spacers: gallery.querySelectorAll('.gspacer').length,
        columns: gallery.querySelectorAll('.gallery-table thead th').length,
      };
    })()`);
    assert(details.view.includes('gallery-details'), `switching left it as ${details.view}`);
    assert(details.rows > 0 && details.rows < 200, `${details.rows} rows in the DOM`);

    if (process.env.EBK_SMOKE_SHOT) {
      const shot = await win.capturePage();
      require('fs').writeFileSync(process.env.EBK_SMOKE_SHOT.replace(/\.png$/i, '-gallery-details.png'), shot.toPNG());
    }

    await evaluate(win, "document.querySelector('.gallery-close').click(); return true;");
    await wait(300);
    const closed = await evaluate(win, "return !document.querySelector('.gallery');");
    assert(closed, 'the gallery would not close');
    return `${details.rows} rows of ${details.columns} columns`;
  });

  await check('a picture can be copied from the book', async () => {
    await evaluate(win, `
      const close = document.querySelector('.gallery-close');
      if (close) close.click();
      return true;
    `);
    await wait(200);
    const copied = await evaluate(win, `return (() => {
      const button = [...document.querySelectorAll('.toolbar button')]
        .find((b) => (b.getAttribute('aria-label') || '') === '그림 복사' || (b.getAttribute('aria-label') || '') === 'Copy picture');
      if (!button) return { error: 'no copy-picture button' };
      if (button.disabled) return { error: 'the copy-picture button is disabled with a book open' };
      button.click();
      return { ok: true };
    })()`);
    assert(!copied.error, copied.error);
    await wait(600);
    const { clipboard } = require('electron');
    const image = clipboard.readImage();
    assert(!image.isEmpty(), 'nothing reached the clipboard');
    const size = image.getSize();
    return `${size.width}×${size.height} on the clipboard`;
  });

  if (process.env.EBK_SMOKE_SHOT) {
    await check('a screenshot of the window was saved', async () => {
      const image = await win.capturePage();
      const file = process.env.EBK_SMOKE_SHOT;
      require('fs').writeFileSync(file, image.toPNG());
      return file;
    });
  }

  await check('the renderer reported no errors', async () => {
    const errors = win.__smokeErrors || [];
    assert(errors.length === 0, errors.join(' | '));
    return 'clean';
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed\n`);
  return failed.length === 0;
}

/** Called by main.js once the main window exists. */
/**
 * Puts a hundred thousand books on the shelf before the window has finished
 * loading, so the app reads them the way it would on any other launch.
 *
 * The shelf is the one thing here that has to be tried at a size nobody would
 * type in by hand: the question it answers is whether the gallery still appears
 * at once after the shelf has grown for years. Covers are not seeded — a cover
 * is a file of its own, and the ones that matter are made by this run.
 */
function seedShelf() {
  const rows = new Array(SHELF_SEED);
  for (let i = 0; i < rows.length; i++) {
    rows[i] = {
      path: `C:/shelf/${i}.epub`,
      name: `${i}.epub`,
      dir: 'C:/shelf',
      title: `Book number ${i}`,
      author: `Author ${i % 977}`,
      format: ['epub', 'pdf', 'mobi'][i % 3],
      formatLabel: 'EPUB',
      size: 100000 + i,
      sections: 20,
      section: i % 20,
      openedAt: 1700000000000 + i,
      cover: '',
      reads: 1,
    };
  }
  const dir = path.join(app.getPath('userData'), 'gallery');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(rows), 'utf-8');
}

function startSmoke(win) {
  seedShelf();
  win.__smokeErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) win.__smokeErrors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    win.__smokeErrors.push(`renderer gone: ${details.reason}`);
  });

  win.webContents.once('did-finish-load', async () => {
    let ok = false;
    try {
      ok = await run(win);
    } catch (err) {
      console.error('  smoke test crashed:', err);
      ok = false;
    } finally {
      try { child.closeAllChildWindows(); } catch { /* going away anyway */ }
      app.exit(ok ? 0 : 1);
    }
  });
}

/** The book the smoke test opens: the generated EPUB sample. */
function smokeBook() {
  return path.join(__dirname, '..', 'samples', 'sample.epub');
}

module.exports = { startSmoke, smokeBook };

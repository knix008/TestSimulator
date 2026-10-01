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
  // EBK_SMOKE_ONLY narrows the run to the checks whose name contains it, which
  // is how one check is worked on without sitting through the other fifty.
  const only = process.env.EBK_SMOKE_ONLY;
  if (only && !name.includes(only)) return;
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

/**
 * Puts the book on screen into one of the two ways pages come — one at a time,
 * or a continuous run — whichever it is in now.
 *
 * The settings outlive a run of this test, so no check may assume which way the
 * last one left it: `want` says what this check needs and the button is pressed
 * only if it is not already that way.
 */
async function setPageMode(win, want) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const flowing = await evaluate(win, `return (() => {
      const pane = document.querySelector('.bookview');
      if (!pane) return false;
      // Text says so with 'scrolling' (against 'paged'); pages say so with
      // 'flowing'. The same question, a different class.
      return pane.classList.contains('reflow')
        ? pane.classList.contains('scrolling')
        : pane.classList.contains('flowing');
    })()`);
    if ((want === 'scroll') === flowing) return want;
    // eslint-disable-next-line no-await-in-loop
    const clicked = await evaluate(win, `
      const b = document.querySelector('[data-testid=${want === 'scroll' ? 'view-continuous' : 'view-single'}]');
      if (!b || b.disabled) return false;
      b.click();
      return true;
    `);
    if (!clicked) throw new Error('the page-view button is not there to press');
    // eslint-disable-next-line no-await-in-loop
    await wait(450);
  }
  throw new Error(`the pages would not come ${want === 'scroll' ? 'as a run' : 'one at a time'}`);
}

/**
 * Sets the reading text size by pressing the toolbar's own control.
 *
 * The sample chapters are short enough to fit the window at 100 %, and a chapter
 * that fits has no second page and no end to arrive at — so the checks that are
 * about reading a long chapter make one, by making the letters bigger. `presses`
 * of 0 presses the readout instead, which puts the size back to 100 %.
 */
async function setTextScale(win, presses) {
  // By name, not by position. This used to take `.zoom-readout` and press the
  // button after it — but two controls carry that class, the document zoom and
  // the text size, and querySelector returns the first. The button after the
  // document zoom's readout is Zoom in, which is disabled for a reflowable
  // book, so every check that needed bigger letters failed saying the text-size
  // control was not there. It was there; this was pressing the wrong thing.
  const done = await evaluate(win, `return (() => {
    const id = ${presses > 0} ? 'font-bigger' : 'font-readout';
    const target = document.querySelector('[data-testid=' + id + ']');
    if (!target) return { error: 'the text-size control is not on the toolbar' };
    if (target.disabled) return { error: 'the text-size control is greyed out' };
    for (let i = 0; i < ${Math.max(1, Math.abs(presses))}; i += 1) target.click();
    return { ok: true };
  })()`);
  if (done.error) throw new Error(done.error);
  await wait(700);
  return evaluate(win, "return document.querySelector('[data-testid=font-readout]')?.textContent.trim() || '';");
}

/**
 * Puts a chapter of text into one column or two.
 *
 * There is no toolbar button for it — it is a Reading-menu row — so this opens
 * that menu on the bar and presses the row by the command it runs, which is the
 * same in either language.
 */
async function setTwoColumns(win, want) {
  const on = await evaluate(win, "return document.querySelector('.bookview')?.getAttribute('data-layout') === 'double';");
  if (on === want) return want;
  // `return`, because evaluate() wraps what it is given in a function body: an
  // expression on its own is evaluated and thrown away, so this read `.error`
  // off undefined and every check that sets the layout died on that.
  const chose = await evaluate(win, `return (() => {
    const b = document.querySelector('[data-testid=${want ? 'view-double' : 'view-single'}]');
    if (!b || b.disabled) return { error: 'the page-view button is not there' };
    b.click();
    return { ok: true };
  })()`);
  if (chose.error) throw new Error(chose.error);
  await wait(500);
  const now = await evaluate(win, "return document.querySelector('.bookview')?.getAttribute('data-layout') === 'double';");
  if (now !== want) throw new Error(`two pages would not go ${want ? 'on' : 'off'}`);
  return want;
}

/**
 * Chooses the page-turn effect from the toolbar's drop-down.
 *
 * The control used to cycle through the effects when pressed, and this pressed
 * it until the pane said it had the one wanted. It is a list now — one row per
 * effect — so the list is opened and the row is chosen by the command it runs,
 * which is the same in every language.
 */
async function setPageTurn(win, want) {
  const command = { none: 'turnNone', slide: 'turnSlide', flip: 'turnFlip' }[want];
  if (!command) throw new Error(`there is no page-turn effect called ${want}`);

  const now = await evaluate(win, "return (document.querySelector('.bookview') || {}).dataset ? document.querySelector('.bookview').dataset.turn : '';");
  if (now === want) return want;

  const opened = await evaluate(win, `
    const b = document.querySelector('[data-testid=page-turn]');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  `);
  if (!opened) throw new Error('the page-turn control is not there to press');

  const menu = await waitForMenu();
  if (!menu) throw new Error('the page-turn list did not open');
  const chose = await menu.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('.menu-item[data-id="${command}"]');
    if (!row) {
      const seen = [...document.querySelectorAll('.menu-item')].map((r) => r.dataset.id || '?');
      return { error: 'no ' + ${JSON.stringify(command)} + ' row; the list holds [' + seen.join(', ') + ']' };
    }
    if (row.disabled) return { error: ${JSON.stringify(command)} + ' is greyed out — there is no page to turn' };
    row.click();
    return { ok: true };
  })()`, true);
  if (chose.error) throw new Error(chose.error);

  await wait(400);
  const got = await evaluate(win, "return (document.querySelector('.bookview') || {}).dataset ? document.querySelector('.bookview').dataset.turn : '';");
  if (got !== want) throw new Error(`the page-turn effect would not be set to ${want} (it is ${got || 'unset'})`);
  return want;
}

/**
 * Makes the letters bigger until the chapter no longer fits the window.
 *
 * The sample chapters fit a window at 100 %, and a chapter that fits has no
 * second page and no end to arrive at — so the checks that are about reading a
 * long chapter make one. Pressing a fixed number of times is not enough: how
 * many it takes depends on the window, the panels and what size the last check
 * left, so this presses until the chapter actually overflows and says how big it
 * had to go.
 */
async function growTextUntilItOverflows(win, { across = false } = {}) {
  for (let press = 0; press <= 16; press += 1) {
    // eslint-disable-next-line no-await-in-loop
    const room = await evaluate(win, `return (() => {
      const pane = document.querySelector('.bookview');
      if (!pane) return null;
      return {
        over: ${across ? 'pane.scrollWidth - pane.clientWidth' : 'pane.scrollHeight - pane.clientHeight'},
        // The *text* size, not the document zoom: two controls share the
        // zoom-readout class and the first of them is the page's zoom.
        at: (document.querySelector('[data-testid=font-readout]') || {}).textContent || '',
        w: pane.scrollWidth,
        h: pane.scrollHeight,
        cw: pane.clientWidth,
        ch: pane.clientHeight,
      };
    })()`);
    if (room && room.over > 40) return room.at.trim();
    if (press === 16) {
      throw new Error(`the chapter still fits at ${room?.at.trim()}: `
        + `${room?.w}×${room?.h} in ${room?.cw}×${room?.ch}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await setTextScale(win, 1);
  }
  throw new Error('the chapter never overflowed');
}

/**
 * Runs a command from one of the menu-bar menus, by the id of its row.
 *
 * Some commands have no button of their own — the full-window gallery is
 * opened by `galleryIcons`, where the toolbar's Gallery button now opens the
 * gallery *tool* in the left panel instead. The menu is the way to reach them,
 * and it is a window of its own, so the row is clicked over there.
 */
async function runMenuCommand(win, menu, command) {
  const opened = await evaluate(win, `
    const b = document.querySelector('.menubar-item[data-menu="${menu}"]');
    if (!b) return false;
    b.click();
    return true;
  `);
  if (!opened) throw new Error(`the ${menu} menu is not on the bar`);
  const sheet = await waitForMenu();
  if (!sheet) throw new Error(`the ${menu} menu did not open`);
  const chose = await sheet.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('.menu-item[data-id="${command}"]');
    if (!row) {
      const seen = [...document.querySelectorAll('.menu-item')].map((r) => r.dataset.id || '?');
      return { error: 'no ' + ${JSON.stringify(command)} + ' row; the menu holds [' + seen.join(', ') + ']' };
    }
    if (row.disabled) return { error: ${JSON.stringify(command)} + ' is greyed out' };
    row.click();
    return { ok: true };
  })()`, true);
  if (chose.error) throw new Error(chose.error);
  await wait(250);
  return true;
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
    // Which panel is showing is remembered between runs, and other checks open
    // the library one — so this asks for the contents, which is its first tab.
    // By name, not by position: the order of the rail is a design decision
    // and it has already changed once under this check.
    await evaluate(win, `
      const tab = document.querySelector('.side-panel.left .panel-tab[data-panel=contents]');
      if (tab && !tab.classList.contains('active')) tab.click();
      return true;
    `);
    await wait(300);
    const rows = await until(win, "document.querySelectorAll('.toc-row').length");
    assert(rows >= 3, `only ${rows} contents rows`);
    return `${rows} entries`;
  });

  await check('an ordinary book turns by its arrows and by the keyboard', async () => {
    // How big the letters are and how pages come are both remembered between
    // runs, and both change what "turn the page" does — so this check says what
    // it needs rather than depending on where the last run left them.
    await setTextScale(win, 0);
    await setPageMode(win, 'scroll');
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
      const items = [...document.querySelectorAll('.menubar-item[data-menu]')];
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

  await check('a toolbar drop-down opens as its own window', async () => {
    // The toolbar holds no menu the menu bar holds; what is left of its
    // drop-downs is the theme list, which is not one of them.
    await evaluate(win, `
      const button = [...document.querySelectorAll('.toolbar button[aria-haspopup=menu]')]
        .find((b) => (b.getAttribute('aria-label') || '').includes('테마') || (b.getAttribute('aria-label') || '').includes('Theme'));
      if (!button) throw new Error('no theme list button on the toolbar');
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

  await check('the toolbar holds no menu that the menu bar already holds', async () => {
    const seen = await evaluate(win, `return (() => {
      const bar = [...document.querySelectorAll('.menubar-item[data-menu]')].map((b) => b.dataset.menu);
      const drops = [...document.querySelectorAll('.toolbar button[aria-haspopup=menu]')]
        .map((b) => (b.getAttribute('aria-label') || '').trim());
      return { bar, drops };
    })()`);
    // Every command had two ways to it an inch apart: the same five menus on
    // the bar and again as drop-downs on the row below it.
    const names = ['파일', 'File', '읽기', 'Reading', '보기', 'View', '표시·편집', 'Marks'];
    const clash = seen.drops.filter((label) => names.includes(label));
    assert(!clash.length, `the toolbar still drops down ${clash.join(', ')}`);
    assert(seen.bar.length === 5, `the menu bar holds ${seen.bar.length} menus`);
    return `bar [${seen.bar.join(', ')}] · toolbar [${seen.drops.join(', ')}]`;
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

    // Its own buttons: putting everything back, and saying done. They belong to
    // the window rather than to any one tab, so they are there on all of them.
    const buttons = await dialog.webContents.executeJavaScript(`(() => {
      const foot = document.querySelector('.dialog-foot');
      if (!foot) return { error: 'the window has no buttons along its foot' };
      const tabs = [...document.querySelectorAll('.tabs .tab')];
      const labels = [];
      for (const tab of tabs) {
        tab.click();
        const here = [...foot.querySelectorAll('button')].map((b) => b.textContent.trim());
        labels.push(here.join(' · '));
      }
      if (tabs[0]) tabs[0].click();
      return { tabs: tabs.length, labels };
    })()`, true);
    assert(!buttons.error, buttons.error);
    assert(buttons.labels.length === buttons.tabs, 'the tabs could not be walked');
    assert(buttons.labels.every((l) => l === buttons.labels[0] && l.includes('·')),
      `the buttons change from tab to tab: ${buttons.labels.join(' / ')}`);

    // Nothing is cut off at this size: every tab's content fits the window it is
    // given, which is what "fixed size" has to mean.
    const fits = await dialog.webContents.executeJavaScript(`(() => {
      const tabs = [...document.querySelectorAll('.tabs .tab')];
      const over = [];
      for (const tab of tabs) {
        tab.click();
        const panel = document.querySelector('.settings-panel.on');
        if (panel && panel.scrollHeight > panel.clientHeight + 4) {
          over.push(tab.textContent.trim() + ' by ' + (panel.scrollHeight - panel.clientHeight) + 'px');
        }
      }
      if (tabs[0]) tabs[0].click();
      return over;
    })()`, true);
    assert(fits.length === 0, `these tabs do not fit the window: ${fits.join(', ')}`);

    // And the close button goes red under the pointer.
    //
    // A synthetic mouse move does not put a window into the hover state, so what
    // is checked is the rule itself: that there is one for the close button
    // being pointed at, and that the colour it paints resolves to a red.
    const x = await dialog.webContents.executeJavaScript(`(() => {
      const close = document.querySelector('.dialog-x');
      if (!close) return { error: 'the settings window has no close button' };
      const rules = [...document.styleSheets].flatMap((sheet) => {
        try { return [...sheet.cssRules]; } catch { return []; }
      });
      const hover = rules.find((r) => r.selectorText && r.selectorText.includes('.dialog-x:hover'));
      if (!hover) return { error: 'nothing says what the close button does under the pointer' };
      // The rule uses the background shorthand, so the longhand is empty.
      const named = hover.style.backgroundColor || hover.style.background || '';
      const variable = (named.match(/var\((--[a-z-]+)\)/) || [])[1];
      const paint = variable
        ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
        : named;
      // Resolved through an element, so a name or a hex both come back as rgb.
      const probe = document.createElement('span');
      probe.style.color = paint;
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return { selector: hover.selectorText.slice(0, 40), paint, rgb };
    })()`, true);
    assert(!x.error, x.error);
    const red = (x.rgb.match(/[0-9]+/g) || []).map(Number);
    assert(red.length >= 3 && red[0] > 120 && red[0] > red[1] * 1.6 && red[0] > red[2] * 1.6,
      `the close button goes ${x.rgb} under the pointer, which is not red`);

    child.closeDialogWindow('settings');
    return `${width}×${height}, ${buttons.tabs} tabs, close goes ${x.rgb}`;
  });

  await check('the window is never narrower than the toolbar', async () => {
    const [minWidth] = win.getMinimumSize();
    assert(minWidth >= 980, `the minimum width is ${minWidth}`);
    return `${minWidth}px`;
  });

  await check('a bookmark is kept, and the Marks menu opens as its own window', async () => {
    // Ctrl+B, because there is no bookmark button on the toolbar: bookmarks
    // are one of the left-hand tools. This used to hunt the toolbar for a
    // button whose tooltip said Ctrl+B, find nothing, and call .click() on
    // undefined — which is where one of the renderer's uncaught errors came
    // from, and why the check never got as far as what it was testing.
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })); return true;");
    await wait(500);
    const listed = await evaluate(win, "return document.querySelectorAll('.mark-list li').length;");
    assert(listed > 0, 'the bookmark was not listed in the panel');
    await runMenuCommand(win, 'marks', 'addBookmark');
    await wait(400);
    const after = await evaluate(win, "return document.querySelectorAll('.mark-list li').length;");
    assert(after >= listed, `the list went from ${listed} to ${after}`);
    return `${after} bookmark(s)`;
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

  await check('an AZW3 (KF8) opens and its parts are threaded back together', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.azw3'));
    await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 20000 });
    const read = await until(win, `(() => {
      const chapter = document.querySelector('[data-testid=chapter]');
      const text = (chapter && chapter.textContent) || '';
      if (!text.trim()) return null;
      const said = (document.querySelector('.statusbar') || {}).textContent || '';
      return { text: text.replace(/\s+/g, ' ').trim().slice(0, 40), said };
    })()`, { timeout: 20000 });
    // The frame and the pieces of a part go back together in the right order, so
    // the heading comes first — read as one MOBI 6 stream they interleave and
    // the page is a jumble.
    assert(read.text.includes('첫 장'), `the first part reads "${read.text}"`);
    return read.text;
  });

  await check('a MOBI opens and shows its text', async () => {
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.mobi'));
    // Asked for in one go. Waiting for the chapter and *then* reading it are two
    // moments, and between them the chapter can be gone again — the pane is
    // rebuilt for each book, so one that is still loading has no chapter at all.
    const text = await until(win, `(() => {
      const chapter = document.querySelector('[data-testid=chapter]');
      const said = (chapter && chapter.textContent) || '';
      return said.trim() ? said.replace(/\s+/g, ' ').trim().slice(0, 30) : null;
    })()`, { timeout: 20000 });
    assert(text.length > 0, 'the MOBI chapter is empty');
    return text;
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

    // Two pages side by side is a way of showing one spread at a time, so the
    // pages come one spread at a time here however the last run left it.
    await setPageMode(win, 'paged');

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
    // A page turn needs a page to turn: in a continuous run the reader scrolls
    // and there is no turn to animate, so this starts from one page at a time.
    await setPageMode(win, 'paged');
    await setPageTurn(win, 'flip');
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
        // The page being left, held still: for a book of pages it is a picture,
        // for a chapter of text a copy of the markup.
        if (pane.querySelector('[data-testid=turn-page] img, [data-testid=turn-page] .chapter')) sawLeaf = true;
        for (const el of pane.querySelectorAll('[class*="turn"]')) {
          for (const name of el.classList) if (name.startsWith('turn') || name === 'turning') marks.add(name);
        }
      };
      // A class is not an animation: this records what the browser is actually
      // playing, which is the thing the reader sees.
      const running = [];
      const seenNames = [];
      const watch = () => {
        for (const el of pane.querySelectorAll('.page-spread, .turn-page, .chapter')) {
          const cs = getComputedStyle(el);
          const note = el.className + ' :: ' + cs.animationName + ' ' + cs.animationDuration;
          if (!seenNames.includes(note)) seenNames.push(note);
        }
        for (const el of pane.querySelectorAll('.chapter, .page-spread, .comic-page, .pdf-page, .turn-page, .turn-leaf')) {
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
      return {
        marks: [...marks], running, starts, leaf: sawLeaf,
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        motion: document.documentElement.dataset.motion || '',
        saw: seenNames,
      };
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
    const played = (seen.running || []).filter((a) => /^(turn|leaf|page)-/.test(a.name || ''));
    assert(seen.leaf, 'the page being left was not held on the screen for the turn');
    assert(played.length > 0,
      `nothing was animated (reduced motion: ${seen.reduced}, data-motion: ${seen.motion}) — ${JSON.stringify(seen.saw)}`);
    assert(played[0].ms >= 300, `the turn lasts ${played[0].ms}ms, too quick to see`);
    // One page arriving, once. Two pages turning at the same time — or the same
    // turn running twice because the chapter and the column both changed —
    // reads as a handful of pages going by.
    const leaves = new Set(played.map((a) => a.name));
    assert(leaves.size === 1, `${leaves.size} different animations ran: ${[...leaves].join(', ')}`);
    assert(seen.starts <= 1, `the effect started ${seen.starts} times for one turn`);

    // And the effect goes away again, rather than leaving the page mid-turn.
    await until(win, "!document.querySelector('.bookview .turning')", { timeout: 5000 });
    const shown = played[0];
    return `${shown.name} for ${shown.ms}ms${seen.reduced ? ', despite the system asking for less motion' : ''}`;
  });

  await check('a file opened is shown whole, inside the window', async () => {
    // Zoom the book that is open right in, then open a file that is not: what
    // the reader should see is the new file fitted to the window, not a corner
    // of it at the zoom the last one happened to be left at.
    await evaluate(win, `
      const buttons = [...document.querySelectorAll('.toolbar button')];
      const readout = document.querySelector('.zoom-readout');
      const at = buttons.indexOf(readout);
      // The three controls are smaller · the readout · larger, in that order.
      const bigger = buttons[at + 1];
      if (bigger && !bigger.disabled) { bigger.click(); bigger.click(); bigger.click(); }
      return true;
    `);
    await wait(500);
    const zoomed = await evaluate(win, "return document.querySelector('.zoom-readout').textContent;");

    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.png'));
    await until(
      win,
      "!!document.querySelector('img.comic-page') && document.querySelector('img.comic-page').naturalWidth > 0",
      { timeout: 20000 },
    );
    await wait(700);

    const fit = await evaluate(win, `return (() => {
      const pane = document.querySelector('.bookview');
      const page = document.querySelector('canvas.pdf-canvas, img.comic-page');
      if (!pane || !page) return { error: 'no page on screen' };
      const box = page.getBoundingClientRect();
      const room = pane.getBoundingClientRect();
      return {
        pageW: Math.round(box.width), pageH: Math.round(box.height),
        paneW: Math.round(room.width), paneH: Math.round(room.height),
        overflowX: pane.scrollWidth > pane.clientWidth + 2,
        overflowY: pane.scrollHeight > pane.clientHeight + 2,
        readout: document.querySelector('.zoom-readout').textContent,
        fitted: !!document.querySelector('[data-testid=fit-page].active'),
      };
    })()`);
    assert(!fit.error, fit.error);
    assert(fit.pageW > 0 && fit.pageH > 0, 'the page has no size');
    assert(fit.pageW <= fit.paneW, `the page is ${fit.pageW}px wide in a ${fit.paneW}px pane`);
    assert(fit.pageH <= fit.paneH, `the page is ${fit.pageH}px tall in a ${fit.paneH}px pane`);
    assert(!fit.overflowX && !fit.overflowY,
      `the page runs off the pane (across: ${fit.overflowX}, down: ${fit.overflowY})`);
    assert(fit.fitted, 'the page is not marked as fitted to the window');
    return `${zoomed.trim()} → ${fit.readout.trim()}, ${fit.pageW}×${fit.pageH} inside ${fit.paneW}×${fit.paneH}`;
  });

  await check('a PDF can be read as a continuous run, and the page follows the scrolling', async () => {
    // Back to the PDF, one page at a time, which is where a run has to start
    // from for there to be a page per place in it.
    const ready = await evaluate(win, `return (() => {
      const tab = [...document.querySelectorAll('.doctab')].find((d) => d.textContent.includes('sample'));
      const pdf = [...document.querySelectorAll('.doctab')].find((d) => /pdf/i.test(d.textContent));
      (pdf || tab).click();
      return { tabs: document.querySelectorAll('.doctab').length, clicked: !!pdf };
    })()`);
    assert(ready.clicked, `no PDF among the ${ready.tabs} open books`);
    await until(win, "!!document.querySelector('canvas.pdf-canvas')", { timeout: 20000 });

    // One page beside another halves the number of places in the run, so the
    // spread is put back to a single page first.
    await evaluate(win, `
      const spread = document.querySelector('[data-testid=view-double]');
      if (spread && spread.classList.contains('active')) {
        document.querySelector('[data-testid=view-single]')?.click();
      }
      return true;
    `);
    await wait(400);

    const live = await evaluate(win, `
      const b = document.querySelector('[data-testid=view-continuous]');
      return !!b && !b.disabled;
    `);
    assert(live, 'the page-mode button is disabled for a PDF');
    try {
      return await readAsRun(win);
    } finally {
      // Whatever happened, the book goes back to one page at a time: the checks
      // after this one — and the next run of this test, which reads the same
      // settings file — expect to find it that way.
      await setPageMode(win, 'paged').catch(() => {});
    }
  });

  /** The body of the check above, so that the setting is always put back. */
  async function readAsRun(win) {
    // From the first page. Where this book was left is remembered, and scrolling
    // to the end of a run that is already at its end proves nothing.
    await setPageMode(win, 'paged');
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await until(
      win,
      "/(^|[^0-9])1\\s*\\/\\s*[0-9]+/.test(document.querySelector('.statusbar').textContent)",
      { timeout: 8000 },
    );
    await setPageMode(win, 'scroll');
    await until(win, "!!document.querySelector('.bookview.flowing .page-slot')", { timeout: 8000 });
    await wait(800);

    const run = await evaluate(win, `return (() => {
      const pane = document.querySelector('.bookview');
      const slots = [...pane.querySelectorAll('.page-slot')];
      return {
        slots: slots.length,
        painted: slots.filter((s) => s.querySelector('canvas, img')).length,
        heights: slots.map((s) => s.offsetHeight),
        scrollable: pane.scrollHeight > pane.clientHeight + 10,
      };
    })()`);
    assert(run.slots > 1, `the run has ${run.slots} page(s) in it`);
    assert(run.heights.every((h) => h > 40), `a page holds ${run.heights.join(', ')}px open`);
    assert(run.scrollable, 'the run does not scroll');

    // Scrolling on moves the page the status bar reports.
    const moved = await evaluate(win, `return (async () => {
      const pane = document.querySelector('.bookview');
      const said = () => (document.querySelector('.statusbar') || {}).textContent || '';
      const slots = [...pane.querySelectorAll('.page-slot')];
      const start = said();
      pane.scrollTop = slots[slots.length - 1].offsetTop;
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
      const deadline = performance.now() + 6000;
      while (performance.now() < deadline) {
        if (said() !== start) return { start, now: said() };
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 32));
      }
      return { error: 'scrolling the run never changed the page' };
    })()`);
    assert(!moved.error, moved.error);
    const pageOf = (text) => Number((text.match(/([0-9]+)\s*\/\s*[0-9]+/) || [0, 0])[1]);
    assert(pageOf(moved.now) > pageOf(moved.start),
      `the page went from ${pageOf(moved.start)} to ${pageOf(moved.now)}`);

    return `${run.slots} pages in the run · page ${pageOf(moved.start)} → ${pageOf(moved.now)}`;
  }

  await check('the words of a PDF page can be selected', async () => {
    await until(win, "!!document.querySelector('canvas.pdf-canvas')", { timeout: 20000 });
    // The text layer is filled in after the page is painted, so it is waited
    // for rather than assumed — and if it never fills, what was on screen is
    // worth more than a bare timeout.
    const filled = await evaluate(win, `return (async () => {
      const deadline = performance.now() + 20000;
      while (performance.now() < deadline) {
        const words = [...document.querySelectorAll('.textLayer span')]
          .filter((sp) => (sp.textContent || '').trim());
        if (words.length) return { words: words.length };
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 120));
      }
      const pane = document.querySelector('.bookview');
      const layer = document.querySelector('.textLayer');
      const canvas = document.querySelector('canvas.pdf-canvas');
      return {
        error: 'the text layer never filled',
        layers: document.querySelectorAll('.textLayer').length,
        canvases: document.querySelectorAll('canvas.pdf-canvas').length,
        spans: document.querySelectorAll('.textLayer span').length,
        // Set by renderTextLayer before it lays anything out, so its presence
        // says whether the text layer was ever even reached.
        scaleFactor: layer ? layer.style.getPropertyValue('--scale-factor') : '(no layer)',
        kids: layer ? layer.childNodes.length : -1,
        painted: canvas ? canvas.width + 'x' + canvas.height : '(no canvas)',
        onPage: canvas && canvas.closest('.pdf-page') ? canvas.closest('.pdf-page').getAttribute('data-page') : '?',
        classes: pane ? pane.className : '(no pane)',
      };
    })()`);
    const grumbles = (win.__smokeWarnings || []).filter((m) => m.includes('[pdf]'));
    assert(!filled.error,
      filled.error
        ? `${filled.error} — ${filled.layers} layer(s) with ${filled.kids} child(ren), scale factor "${filled.scaleFactor}", canvas ${filled.painted} on page ${filled.onPage}, pane "${filled.classes}"`
          + (grumbles.length ? ` — the renderer said: ${grumbles.slice(-3).join(' | ')}` : ' — the renderer said nothing')
        : '');

    const picked = await evaluate(win, `return (() => {
      const layer = document.querySelector('.textLayer');
      const spans = [...layer.querySelectorAll('span')].filter((s) => (s.textContent || '').trim());
      const style = getComputedStyle(layer);
      const range = document.createRange();
      range.setStartBefore(spans[0]);
      range.setEndAfter(spans[Math.min(3, spans.length - 1)]);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('mouseup', { bubbles: true }));
      return {
        spans: spans.length,
        opacity: style.opacity,
        text: selection.toString().replace(/\s+/g, ' ').trim().slice(0, 40),
      };
    })()`);
    // The layer's own words are transparent, so anything less than opaque made
    // the selection highlight — the only thing ever actually drawn in it — too
    // faint to see.
    assert(Number(picked.opacity) === 1, `the text layer is drawn at opacity ${picked.opacity}`);
    assert(picked.text.length > 0, 'nothing was selected');
    const said = await until(
      win,
      "(document.querySelector('.statusbar').textContent.match(/([0-9]+)/g) || []).length > 0"
        + " && document.querySelector('.statusbar').textContent",
      { timeout: 6000 },
    );
    assert(said.includes(picked.text.slice(0, 3)) || /[0-9]+/.test(said),
      'the status bar says nothing about the selection');
    return `${picked.spans} words on the page, "${picked.text}" selected`;
  });

  await check('a picture inside a PDF page can be pointed at, framed and copied', async () => {
    // A PDF page is one canvas, so there is no element to click: the pictures
    // are found by replaying the page's own drawing operators, and the click is
    // tested against those rectangles. Before that, "copy picture" on a PDF
    // copied the whole rendered page.
    await until(win, "!!document.querySelector('canvas.pdf-canvas')", { timeout: 20000 });
    await wait(1200);

    const found = await evaluate(win, `return (async () => {
      const canvas = document.querySelector('canvas.pdf-canvas');
      if (!canvas) return { error: 'no PDF page on screen' };
      const box = canvas.getBoundingClientRect();
      // Sweep the page until the outline of a picture appears under the pointer.
      for (let fy = 0.1; fy < 0.95; fy += 0.06) {
        for (let fx = 0.1; fx < 0.95; fx += 0.06) {
          const x = Math.round(box.left + box.width * fx);
          const y = Math.round(box.top + box.height * fy);
          const at = document.elementFromPoint(x, y);
          if (!at) continue;
          at.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 16));
          if (document.querySelector('.pdf-figure')) return { x, y };
        }
      }
      return { error: 'no picture was found anywhere on the page' };
    })()`);
    assert(!found.error, found.error);

    const picked = await evaluate(win, `return (() => {
      const at = document.elementFromPoint(${found.x}, ${found.y});
      const o = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: ${found.x}, clientY: ${found.y} };
      at.dispatchEvent(new PointerEvent('pointerdown', o));
      at.dispatchEvent(new MouseEvent('mouseup', o));
      return true;
    })()`);
    assert(picked, 'the picture could not be pressed');
    await wait(400);

    const state = await evaluate(win, `return (() => {
      const frame = document.querySelector('.pdf-figure.picked');
      const canvas = document.querySelector('canvas.pdf-canvas');
      const cell = document.querySelector('[data-testid=picked-image]');
      return {
        framed: !!frame,
        // The frame is the picture, not the page.
        smaller: frame && canvas
          ? frame.getBoundingClientRect().width < canvas.getBoundingClientRect().width * 0.9
          : false,
        said: cell ? cell.textContent.trim() : '',
      };
    })()`);
    assert(state.framed, 'the picture was not framed when it was clicked');
    assert(state.smaller, 'the frame is the whole page rather than the picture in it');
    assert(/[0-9]+\s*×\s*[0-9]+/.test(state.said), `the status bar says "${state.said}"`);

    // And the menu offers to copy it, which it cannot when nothing is picked.
    await evaluate(win, `return (() => {
      const pane = document.querySelector('.bookview');
      const o = { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: ${found.x}, clientY: ${found.y} };
      (document.elementFromPoint(${found.x}, ${found.y}) || pane).dispatchEvent(new MouseEvent('contextmenu', o));
      return true;
    })()`);
    const menu = await waitForMenu();
    assert(menu, 'the right-click menu did not open');
    const rows = await menu.webContents.executeJavaScript(`(() => {
      const row = document.querySelector('.menu-item[data-id="copyImage"]');
      return { there: !!row, off: !!row?.disabled };
    })()`, true);
    menu.hide();
    assert(rows.there, 'there is no "copy picture" row in the menu');
    const live = await evaluate(win, "return { framed: document.querySelectorAll('.pdf-figure.picked').length, cell: document.querySelector('[data-testid=picked-image]')?.textContent?.trim() || 'none' };");
    assert(!rows.off,
      `"copy picture" is greyed out although a picture is picked (${JSON.stringify(live)})`);
    return `${state.said}, framed and copyable`;
  });

  await check('clicking a page frames the picture, and says no more than its size', async () => {
    const shown = await evaluate(win, `return (() => {
      const pane = document.querySelector('.bookview');
      const canvas = pane.querySelector('canvas.pdf-canvas');
      if (!canvas) return { error: 'no PDF page on screen' };
      const box = canvas.getBoundingClientRect();
      // The middle of the page, where the pointer lands on the text layer that
      // covers the canvas rather than on the canvas itself.
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (!target) return { error: 'nothing is under the middle of the page' };
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      return { tag: (target.tagName || '').toLowerCase() };
    })()`);
    assert(!shown.error, shown.error);

    const marked = await until(win, `(() => {
      const picked = document.querySelector('.bookview .picked');
      const cell = document.querySelector('[data-testid=picked-image]');
      const mark = document.querySelector('[data-testid=picked-mark]');
      if (!picked || !cell || !mark) return null;
      // The frame is the mark's border, drawn once. The picture itself used to
      // carry an outline as well, which showed as a second rectangle around
      // the first, so the element is checked for *not* having one.
      const style = getComputedStyle(mark);
      return {
        what: picked.tagName.toLowerCase(),
        outline: style.borderTopWidth,
        onElement: getComputedStyle(picked).outlineWidth,
        said: cell.textContent.trim(),
        caption: (mark.textContent || '').trim(),
      };
    })()`, { timeout: 6000 });
    assert(marked.what === 'canvas', `what was picked is a <${marked.what}>`);
    assert(parseFloat(marked.outline) >= 2, `the frame is ${marked.outline}`);
    // One frame, not two.
    assert(!(parseFloat(marked.onElement) > 0),
      `the picture carries a second frame of its own (${marked.onElement})`);
    // The size, and no announcement with it: the frame round the picture is
    // what says it is picked, and the right-click menu is what copies it.
    assert(/^[0-9]+\s*×\s*[0-9]+$/.test(marked.said), `the status bar says "${marked.said}"`);
    assert(!marked.caption, `the page carries a caption reading "${marked.caption}"`);

    // Clicking away lets it go again.
    await evaluate(win, `
      const pane = document.querySelector('.bookview');
      pane.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      return true;
    `);
    await until(win, "!document.querySelector('[data-testid=picked-image]')", { timeout: 6000 });
    return `${marked.said}, outlined ${marked.outline}`;
  });

  /** Puts the reading settings back the way an untouched installation has them. */
  async function restoreReading(win) {
    await setTextScale(win, 0).catch(() => {});
    await setPageMode(win, 'scroll').catch(() => {});
  }

  await check('an EPUB is read to the end of a chapter and back into the one before', async () => {
    try {
      return await readAChapterBothWays(win);
    } finally {
      await restoreReading(win);
    }
  });

  /** The body of the check above, so the reading settings are always put back. */
  async function readAChapterBothWays(win) {
    // The EPUB opened on the command line, from its second chapter, read as one
    // unbroken column — which is how a chapter of text comes by default.
    const ready = await evaluate(win, `return (() => {
      const tab = [...document.querySelectorAll('.doctab')].find((d) => /epub/i.test(d.textContent));
      if (!tab) return { error: 'the EPUB is not open' };
      tab.click();
      return { ok: true };
    })()`);
    assert(!ready.error, ready.error);
    await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 20000 });
    await setPageMode(win, 'scroll');
    // Big enough letters that a chapter no longer fits the window: a chapter that
    // fits has no end to arrive at, and would prove nothing.
    await setTextScale(win, 0);
    const bigger = await growTextUntilItOverflows(win);

    // To the second chapter, then down it to its foot.
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await wait(400);
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })); return true;");
    await wait(600);

    const read = await evaluate(win, `return (async () => {
      const pane = document.querySelector('.bookview');
      const said = () => (document.querySelector('.statusbar') || {}).textContent || '';
      const chapterOf = (text) => Number((text.match(/([0-9]+)\\s*\\/\\s*[0-9]+/) || [0, 0])[1]);
      const press = async (key) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await new Promise((r) => setTimeout(r, 420));
      };

      // Down the chapter until it gives way to the next one. Every press has to
      // move something — either the scroll or the chapter.
      const start = chapterOf(said());
      const seen = [];
      let stuck = 0;
      for (let i = 0; i < 40; i += 1) {
        const before = { top: pane.scrollTop, chapter: chapterOf(said()) };
        // eslint-disable-next-line no-await-in-loop
        await press('PageDown');
        const after = { top: pane.scrollTop, chapter: chapterOf(said()) };
        seen.push(after.chapter);
        if (after.top === before.top && after.chapter === before.chapter) stuck += 1;
        if (after.chapter > start) return { start, reached: after.chapter, stuck, presses: i + 1, tail: pane.scrollTop };
      }
      return { error: 'the chapter never gave way, however many pages were turned' };
    })()`);
    assert(!read.error, read.error);
    assert(read.stuck === 0, `${read.stuck} press(es) moved nothing at all`);

    // And back. Turning back has to arrive at the *end* of the chapter before,
    // not its top — arriving at the top meant the next press went back another
    // chapter and the whole of this one was skipped.
    const back = await evaluate(win, `return (async () => {
      const pane = document.querySelector('.bookview');
      const said = () => (document.querySelector('.statusbar') || {}).textContent || '';
      const chapterOf = (text) => Number((text.match(/([0-9]+)\\s*\\/\\s*[0-9]+/) || [0, 0])[1]);
      const from = chapterOf(said());
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        if (chapterOf(said()) < from) {
          // Give the chapter a moment to be laid out and landed on.
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 400));
          return {
            from,
            to: chapterOf(said()),
            top: Math.round(pane.scrollTop),
            room: Math.max(0, pane.scrollHeight - pane.clientHeight),
          };
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 32));
      }
      return { error: 'turning back never reached the chapter before' };
    })()`);
    assert(!back.error, back.error);
    assert(back.to === back.from - 1, `it went from chapter ${back.from} to ${back.to}`);
    assert(back.room > 8,
      `the chapter fits the window even at ${bigger}, so there is no end to arrive at`);
    assert(back.top > back.room - 8,
      `it arrived ${back.top}px down a chapter whose end is at ${back.room}px`);
    return `at ${bigger}: chapter ${read.start} → ${read.reached} in ${read.presses} presses, back to ${back.to} at ${back.top}/${back.room}px`;
  }

  await check('an EPUB read a page at a time reaches the last page of a chapter', async () => {
    try {
      return await readAChapterAPageAtATime(win);
    } finally {
      await restoreReading(win);
    }
  });

  /** The body of the check above, so the reading settings are always put back. */
  async function readAChapterAPageAtATime(win) {
    await setPageMode(win, 'paged');
    await until(win, "!!document.querySelector('.bookview.reflow.paged')", { timeout: 8000 });
    await setTextScale(win, 0);
    const size = await growTextUntilItOverflows(win, { across: true });
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await wait(700);

    const paged = await evaluate(win, `return (async () => {
      const pane = document.querySelector('.bookview');
      // Where in the chapter the reader is, which the status bar shows as
      // 'page / pages' while a chapter runs to more than one page. It used
      // to be a pill floating over the page (.column-readout); that is gone,
      // and looking for it is why this read every chapter as a single page.
      const readout = () => (document.querySelector('[data-testid=chapter-pages]') || {}).textContent || '';
      const pagesOf = (text) => {
        const m = text.match(/([0-9]+)\\s*\\/\\s*([0-9]+)/);
        return m ? { page: Number(m[1]), pages: Number(m[2]) } : null;
      };
      const first = pagesOf(readout());
      // The columns of a chapter come to whatever width they come to; what
      // matters is that the reader can reach the end of them.
      const reach = { width: pane.scrollWidth, shown: pane.clientWidth };
      if (!first) return { pages: 1, reach, last: 0, ok: true };
      let at = first;
      for (let i = 0; i < first.pages + 3; i += 1) {
        if (at.page >= at.pages) break;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 380));
        const now = pagesOf(readout());
        if (!now) break;
        at = now;
      }
      // A glide takes a moment; the last one has to finish before the position
      // it arrived at means anything.
      let settled = -1;
      for (let i = 0; i < 40 && settled !== pane.scrollLeft; i += 1) {
        settled = pane.scrollLeft;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 80));
      }
      const limit = pane.scrollWidth - pane.clientWidth;
      return {
        pages: first.pages,
        reach,
        last: at.page,
        left: Math.round(pane.scrollLeft),
        limit: Math.round(limit),
        // The far end of the columns is on screen once the pane has scrolled as
        // far as it goes.
        atEnd: pane.scrollLeft >= limit - 4,
      };
    })()`);
    assert(paged.pages > 1,
      `the chapter still fits one page at ${size}, so there is no last page to reach`
      + ` (columns ${paged.reach.width}px wide in a page of ${paged.reach.shown}px)`);
    // The whole point: the page the counter calls the last has to be reachable,
    // and reaching it has to actually show the end of the text. Counting the
    // pages by rounding to the nearest said there were fewer than there are, and
    // the tail of every such chapter could not be reached at all.
    assert(paged.last === paged.pages, `it stopped on page ${paged.last} of ${paged.pages}`);
    assert(paged.atEnd,
      `the last page stops at ${paged.left}px of a possible ${paged.limit}px, so the end of the chapter is off screen`);
    return `at ${size}: ${paged.pages} pages of ${paged.reach.width}px in a ${paged.reach.shown}px pane, reached ${paged.last}`;
  }

  await check('a book dropped on the window from outside opens', async () => {
    const before = await evaluate(win, "return document.querySelectorAll('.doctab').length;");
    const dropped = await evaluate(win, `return (async () => {
      const app = document.querySelector('.app');
      if (!app) return { error: 'no window to drop on' };
      // What a file manager hands over: a real File in a real DataTransfer, on a
      // real drop event. The bytes are a small Markdown book made here.
      const text = '# \\ub5a8\\uc5b4\\ub728\\ub9b0 \\ucc45\\n\\n\\ubc16\\uc5d0\\uc11c \\ub04c\\uc5b4\\ub2e4 \\ub193\\uc740 \\ud30c\\uc77c\\uc785\\ub2c8\\ub2e4.\\n';
      const file = new File([text], 'dropped-in.md', { type: 'text/markdown' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      app.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
      // The highlight is drawn on the render the event causes, not on the event.
      await new Promise((r) => setTimeout(r, 150));
      const highlighted = !!document.querySelector('.dropzone');
      app.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline) {
        const tabs = [...document.querySelectorAll('.doctab')].map((d) => d.textContent).join(' ');
        if (tabs.includes('dropped-in')) {
          return {
            highlighted,
            tabs: document.querySelectorAll('.doctab').length,
            gone: !document.querySelector('.dropzone'),
            text: (document.querySelector('[data-testid=chapter]') || {}).textContent || '',
          };
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 60));
      }
      return { error: 'the dropped book never opened' };
    })()`);
    assert(!dropped.error, dropped.error);
    assert(dropped.highlighted, 'the window never said it would take the file');
    assert(dropped.gone, 'the drop highlight stayed after the book opened');
    assert(dropped.tabs === before + 1, `${before} tab(s) became ${dropped.tabs}`);
    assert(dropped.text.includes('떨어뜨린 책'), `the chapter reads "${dropped.text.slice(0, 40)}"`);
    return `${before} → ${dropped.tabs} tabs, and the highlight came and went`;
  });

  await check('a drop that names a file instead of handing it over opens it too', async () => {
    const named = await evaluate(win, `return (async () => {
      const app = document.querySelector('.app');
      const transfer = new DataTransfer();
      // Some applications hand over a location, not a file. This used to do
      // nothing at all.
      transfer.setData('text/uri-list', ${JSON.stringify('file:///' + path.join(__dirname, '..', 'samples', 'sample.txt').replace(/\\/g, '/'))});
      app.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline) {
        const tabs = [...document.querySelectorAll('.doctab')].map((d) => d.textContent).join(' ');
        if (tabs.includes('sample.txt')) return { tabs: document.querySelectorAll('.doctab').length };
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 60));
      }
      return { error: 'the named file never opened' };
    })()`);
    assert(!named.error, named.error);
    return `opened by name, ${named.tabs} books now open`;
  });

  await check('a folder dropped on the window is shown as a folder, not read as a book', async () => {
    const folder = await evaluate(win, `return (async () => {
      const app = document.querySelector('.app');
      const transfer = new DataTransfer();
      transfer.setData('text/uri-list', ${JSON.stringify('file:///' + path.join(__dirname, '..', 'samples').replace(/\\/g, '/'))});
      const tabsBefore = document.querySelectorAll('.doctab').length;
      app.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline) {
        const tree = document.querySelector('.side-panel.left .folder-tree, .side-panel.left .folder-list');
        const said = (document.querySelector('.statusbar') || {}).textContent || '';
        if (said.includes('samples')) {
          return {
            tabsBefore,
            tabsAfter: document.querySelectorAll('.doctab').length,
            panel: !!tree,
            said: said.slice(0, 60),
          };
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 60));
      }
      return { error: 'the folder was never opened as a folder' };
    })()`);
    assert(!folder.error, folder.error);
    // A folder is not a book: nothing may be opened as one.
    assert(folder.tabsAfter === folder.tabsBefore,
      `${folder.tabsBefore} tab(s) became ${folder.tabsAfter} — the folder was read as a book`);
    // Opening a folder shows the library panel. The settings outlive this test,
    // so the panel goes back to the contents, which is its first tab — the checks
    // earlier in this file look for the chapter list there.
    await evaluate(win, `
      const toc = document.querySelector('.side-panel.left .panel-tab[data-panel=contents]');
      if (toc) toc.click();
      return true;
    `);
    await wait(300);
    return `the folder went to the panel, ${folder.tabsAfter} books still open`;
  });

  await check('a PDF turns page after page with the effect, and without lurching', async () => {
    const ready = await evaluate(win, `return (() => {
      const pdf = [...document.querySelectorAll('.doctab')].find((d) => /pdf/i.test(d.textContent));
      if (!pdf) return { error: 'the PDF is not open' };
      pdf.click();
      return { ok: true };
    })()`);
    assert(!ready.error, ready.error);
    await until(win, "!!document.querySelector('canvas.pdf-canvas')", { timeout: 20000 });
    await setPageMode(win, 'paged');
    await evaluate(win, `
      const spread = document.querySelector('[data-testid=view-double]');
      if (spread && spread.classList.contains('active')) {
        document.querySelector('[data-testid=view-single]')?.click();
      }
      return true;
    `);
    await setPageTurn(win, 'flip');
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await wait(1200);

    const turns = await evaluate(win, `return (async () => {
      const pane = document.querySelector('.bookview');
      const canvasOf = () => pane.querySelector('canvas.pdf-canvas');
      // The canvas's own size in pixels, not the rectangle it draws into. The
      // page that arrives is the element the effect moves, so its rectangle is
      // narrow for as long as the page is edge-on — which is the turn working,
      // not the page collapsing. What the lurch did was throw the canvas away
      // and build a new one, and that shows in the bitmap.
      const boxOf = () => {
        const c = canvasOf();
        return { w: c ? c.width : 0, h: c ? c.height : 0 };
      };
      const start = boxOf();
      if (!start.w) return { error: 'no page on screen to turn' };

      const seen = [];
      for (let turn = 0; turn < 2; turn += 1) {
        let leaf = '';
        let collapsed = 0;
        let smallest = start.w;
        // Watch the turn all the way through: what the page being left is drawn
        // with, and whether the page arriving ever loses its size while it is
        // being painted — which is the lurch.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
        const deadline = performance.now() + 1500;
        while (performance.now() < deadline) {
          const face = pane.querySelector('[data-testid=turn-page] img');
          if (face && face.getAttribute('src')) leaf = face.getAttribute('src').slice(0, 24);
          const box = boxOf();
          if (box.w) {
            smallest = Math.min(smallest, box.w);
            if (box.w < start.w * 0.6) collapsed += 1;
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 16));
        }
        seen.push({ leaf, collapsed, smallest });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 300));
      }
      return { start, seen, page: (document.querySelector('.statusbar') || {}).textContent || '' };
    })()`);
    assert(!turns.error, turns.error);

    // Every turn holds the page being left on the screen — not only the first.
    // The picture used to be taken when the page *changed*, which caught the
    // page before the last one, so the second turn onwards held the wrong page
    // or nothing at all.
    turns.seen.forEach((t, i) => {
      assert(t.leaf.startsWith('data:image'),
        `turn ${i + 1} held the page being left as "${t.leaf || 'nothing'}"`);
    });
    // And the page never folds up while the next one is being painted.
    turns.seen.forEach((t, i) => {
      assert(t.collapsed === 0,
        `turn ${i + 1}: the page shrank to ${t.smallest}px of ${turns.start.w}px while the next was painted`);
    });
    return `two turns, leaves drawn from ${turns.seen.map((t) => t.leaf.slice(0, 16)).join(' · ')}, page held at ${turns.start.w}×${turns.start.h}`;
  });

  await check('dragging over the words of a PDF page selects those words and no others', async () => {
    await until(win, "!!document.querySelector('canvas.pdf-canvas')", { timeout: 20000 });
    await until(
      win,
      "[...document.querySelectorAll('.textLayer span')].filter((s) => (s.textContent || '').trim()).length",
      { timeout: 25000 },
    );

    const dragged = await evaluate(win, `return (async () => {
      const layer = document.querySelector('.textLayer');
      const words = [...layer.querySelectorAll('span')].filter((s) => (s.textContent || '').trim());
      if (!words.length) return { error: 'the page has no words to drag across' };
      const first = words[0];
      const box = first.getBoundingClientRect();

      // A press on the first line, then the pointer taken *below* the text — over
      // the empty part of the page. The browser's own answer to that is to reach
      // for whatever text is nearest in document order, which used to take the
      // selection down the whole page.
      first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0,
        clientX: box.left + 1, clientY: box.top + box.height / 2 }));
      const armed = layer.classList.contains('selecting') || true;

      const range = document.createRange();
      range.setStart(first.firstChild, 0);
      range.setEnd(first.firstChild, first.textContent.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((r) => setTimeout(r, 60));

      const guard = layer.querySelector('.endOfContent');
      if (!guard) return { error: 'the text layer has no guard block in it' };
      const nameOf = (node) => (node
        ? (node.nodeName || '').toLowerCase()
          + (node.className ? '.' + String(node.className).split(' ')[0] : '')
        : '(nothing)');
      const state = {
        armed,
        hasGuard: true,
        anchor: nameOf(selection.anchorNode && selection.anchorNode.parentNode),
        after: nameOf(guard.previousSibling),
        selecting: layer.classList.contains('selecting'),
        beside: guard.previousSibling === first || guard.nextSibling === first,
        stretched: getComputedStyle(guard).top,
        picked: selection.toString().trim(),
      };

      // Letting go puts the guard back at the foot of the page. Left stretched,
      // the next press in empty space would land on it and take the selection to
      // the end of the page.
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      state.parkedAfter = !layer.classList.contains('selecting')
        && guard.parentElement === layer && !guard.nextSibling;
      state.tuckedAway = getComputedStyle(guard).top;
      return state;
    })()`);
    assert(!dragged.error, dragged.error);
    assert(dragged.selecting,
      `the guard was never armed for the drag (anchor "${dragged.anchor}", guard ${dragged.hasGuard ? 'present' : 'missing'})`);
    assert(dragged.beside,
      `the guard was not put beside the words being dragged over — it sits after "${dragged.after}"`);
    assert(dragged.picked.length > 0, 'nothing was selected');
    assert(dragged.parkedAfter, 'the guard was left armed after the drag ended');
    // Armed it covers the page; parked it sits below the foot of it.
    assert(parseFloat(dragged.stretched) < parseFloat(dragged.tuckedAway),
      `the guard did not move: ${dragged.stretched} while dragging, ${dragged.tuckedAway} after`);
    return `"${dragged.picked.slice(0, 28)}" selected; guard ${dragged.stretched} → ${dragged.tuckedAway}`;
  });

  await check('a PDF page is not marked as a selected picture', async () => {
    const marked = await evaluate(win, `return (() => {
      const pane = document.querySelector('.bookview');
      const canvas = pane.querySelector('canvas.pdf-canvas');
      if (!canvas) return { error: 'no page on screen' };
      const box = canvas.getBoundingClientRect();
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height * 0.85);
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      const mark = pane.querySelector('[data-testid=picked-mark]');
      return {
        picked: canvas.classList.contains('picked'),
        mark: mark ? mark.textContent.trim() : '',
      };
    })()`);
    assert(!marked.error, marked.error);
    assert(!marked.picked, 'the PDF page was outlined as a picture');
    assert(!marked.mark, `the page says "${marked.mark}"`);
    return 'a click on the page leaves it unmarked';
  });

  await check('a right click puts a bookmark on that spot, and it is drawn there', async () => {
    const placed = await evaluate(win, `return (async () => {
      const pane = document.querySelector('.bookview');
      const page = pane.querySelector('.pdf-page, .page-frame, .chapter');
      if (!page) return { error: 'nothing on screen to bookmark' };
      const box = page.getBoundingClientRect();
      // A quarter across and a third of the way down the page.
      const at = { x: Math.round(box.left + box.width * 0.25), y: Math.round(box.top + box.height / 3) };
      pane.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, clientX: at.x, clientY: at.y,
      }));
      return { at, box: { left: box.left, top: box.top, width: box.width, height: box.height } };
    })()`);
    assert(!placed.error, placed.error);

    // The right-click menu opens as its own window; the row is pressed there.
    const menu = await waitForMenu(6000);
    assert(menu, 'the right-click menu did not open');
    const chose = await menu.webContents.executeJavaScript(`(() => {
      // The button is what answers a click; the list item around it does not.
      const rows = [...document.querySelectorAll('.menu-item, button')];
      const row = rows.find((r) => (r.textContent || '').includes('여기에 책갈피')
        || (r.textContent || '').includes('Bookmark this spot'));
      if (!row) return { error: 'no "bookmark this spot" row: ' + rows.map((r) => (r.textContent || '').trim()).slice(0, 12).join(' | ') };
      row.click();
      return { ok: true };
    })()`, true);
    assert(!chose.error, chose.error);

    const pin = await evaluate(win, `return (async () => {
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline) {
        const el = document.querySelector('[data-testid=bookmark-pin]');
        if (el) {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), top: Math.round(r.top), label: el.textContent.trim() };
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 80));
      }
      return {
        error: 'no pin was drawn',
        marks: document.querySelectorAll('.bm-list li, .bookmark-row').length,
        said: (document.querySelector('.statusbar') || {}).textContent || '',
        panel: (document.querySelector('.side-panel.left') || {}).textContent || '',
      };
    })()`);
    assert(!pin.error,
      pin.error
        ? `${pin.error} — ${pin.marks} bookmark row(s); status "${(pin.said || '').slice(0, 50)}"; panel "${(pin.panel || '').replace(/\s+/g, ' ').slice(0, 80)}"`
        : '');

    // Drawn where it was put, within a pixel or two of the click.
    assert(Math.abs(pin.left - placed.at.x) <= 4,
      `the pin is ${pin.left}px across, the click was at ${placed.at.x}px`);
    assert(Math.abs(pin.top - placed.at.y) <= 4,
      `the pin is ${pin.top}px down, the click was at ${placed.at.y}px`);
    return `pinned at ${pin.left},${pin.top} for a click at ${placed.at.x},${placed.at.y} — "${pin.label}"`;
  });

  await check('jumping to a chapter from the contents leaves the page whole', async () => {
    const ready = await evaluate(win, `return (() => {
      const tab = [...document.querySelectorAll('.doctab')].find((d) => /epub/i.test(d.textContent));
      if (!tab) return { error: 'the EPUB is not open' };
      tab.click();
      const toc = document.querySelector('.side-panel.left .panel-tab[data-panel=contents]');
      if (toc) toc.click();
      return { ok: true };
    })()`);
    assert(!ready.error, ready.error);
    await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 20000 });

    // Read a page at a time, with the effect on: the chapter is then one very
    // wide element poured into columns and the pane is scrolled sideways across
    // it, which is where a slide that moved the element threw the words out of
    // the window.
    await setPageMode(win, 'paged');
    await setPageTurn(win, 'slide');
    await until(win, "!!document.querySelector('.bookview.reflow.paged')", { timeout: 8000 });
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await wait(600);

    const jumped = await evaluate(win, `return (async () => {
      const rows = [...document.querySelectorAll('.side-panel.left .toc-row')];
      if (rows.length < 2) return { error: rows.length + ' contents row(s) to jump with' };
      const pane = document.querySelector('.bookview');
      const before = (document.querySelector('[data-testid=chapter]') || {}).textContent || '';

      // While the turn is running, and after it, the words have to be where the
      // reader can see them.
      rows[rows.length - 1].click();
      const seen = [];
      const deadline = performance.now() + 1600;
      while (performance.now() < deadline) {
        const chapter = document.querySelector('[data-testid=chapter]');
        if (chapter) {
          const box = chapter.getBoundingClientRect();
          const room = pane.getBoundingClientRect();
          seen.push({
            // How far the first column sits from the pane's left edge, allowing
            // for how far the pane is scrolled.
            off: Math.round(box.left - room.left + pane.scrollLeft),
            left: Math.round(pane.scrollLeft),
          });
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 24));
      }
      const chapter = document.querySelector('[data-testid=chapter]');
      return {
        before: before.slice(0, 24),
        after: (chapter.textContent || '').slice(0, 24),
        worst: seen.reduce((w, s) => Math.max(w, Math.abs(s.off)), 0),
        settled: seen[seen.length - 1],
        columns: (document.querySelector('[data-testid=chapter-pages]') || {}).textContent || '',
      };
    })()`);
    assert(!jumped.error, jumped.error);
    assert(jumped.after !== jumped.before, 'the contents row did not move the book');
    // The chapter never leaves the pane: a slide that moved the columns put the
    // text hundreds of pixels out of it, which is what looked torn.
    assert(jumped.worst <= 4,
      `the chapter was ${jumped.worst}px out of the pane while it was turning`);
    assert(jumped.settled && jumped.settled.left === 0,
      `the chapter opened at column ${jumped.settled ? jumped.settled.left : '?'}px instead of its first`);
    await setPageMode(win, 'scroll');
    return `"${jumped.before.trim()}" → "${jumped.after.trim()}", never more than ${jumped.worst}px out${jumped.columns ? `, at ${jumped.columns.trim()}` : ''}`;
  });

  await check('the pages of an EPUB are counted, and the last page is the last one', async () => {
    const ready = await evaluate(win, `return (() => {
      const tab = [...document.querySelectorAll('.doctab')].find((d) => /epub/i.test(d.textContent));
      if (!tab) return { error: 'the EPUB is not open' };
      tab.click();
      return { ok: true };
    })()`);
    assert(!ready.error, ready.error);
    await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 20000 });
    await setPageMode(win, 'scroll');
    await setTextScale(win, 0);
    // From the first page, so "where the reader is" means something.
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await wait(500);

    // The count is worked out in the background, so it is waited for.
    const counted = await until(win, `(() => {
      const cell = document.querySelector('[data-testid=page-readout]');
      if (!cell) return null;
      const m = cell.textContent.match(/([0-9]+)\\s*\\/\\s*([0-9]+)/);
      return m ? { page: Number(m[1]), pages: Number(m[2]) } : null;
    })()`, { timeout: 20000 });
    assert(counted.pages > 0, 'the book was never given a page count');
    assert(counted.page >= 1 && counted.page <= counted.pages,
      `it says page ${counted.page} of ${counted.pages}`);

    // At the very end of the book, the page has to be the last page. Counting
    // the characters of the whole book and counting the pages of each chapter
    // used to give different answers, so the end of the book read "2 / 3".
    const atEnd = await evaluate(win, `return (async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      const pane = document.querySelector('.bookview');
      pane.scrollTop = pane.scrollHeight;
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      const cell = document.querySelector('[data-testid=page-readout]');
      const m = cell.textContent.match(/([0-9]+)\\s*\\/\\s*([0-9]+)/);
      return m ? { page: Number(m[1]), pages: Number(m[2]) } : { error: 'no page readout' };
    })()`);
    assert(!atEnd.error, atEnd.error);
    assert(atEnd.page === atEnd.pages,
      `the end of the book says page ${atEnd.page} of ${atEnd.pages}`);
    return `${counted.page}/${counted.pages} at the start, ${atEnd.page}/${atEnd.pages} at the end`;
  });

  await check('a PDF page holds perfectly still once the turn is over', async () => {
    const ready = await evaluate(win, `return (() => {
      const pdf = [...document.querySelectorAll('.doctab')].find((d) => /pdf/i.test(d.textContent));
      if (!pdf) return { error: 'the PDF is not open' };
      pdf.click();
      return { ok: true };
    })()`);
    assert(!ready.error, ready.error);
    await until(win, "!!document.querySelector('canvas.pdf-canvas')", { timeout: 20000 });
    await setPageMode(win, 'paged');
    await evaluate(win, `
      const spread = document.querySelector('[data-testid=view-double]');
      if (spread && spread.classList.contains('active')) {
        document.querySelector('[data-testid=view-single]')?.click();
      }
      return true;
    `);
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await wait(1200);

    // Both effects, because they disturb the page in different ways: the leaf
    // sweeps across it and the slide moves the whole spread.
    const report = [];
    for (const effect of ['slide', 'flip']) {
      // eslint-disable-next-line no-await-in-loop
      await setPageTurn(win, effect);
      // eslint-disable-next-line no-await-in-loop
      await wait(300);
      // eslint-disable-next-line no-await-in-loop
      const still = await evaluate(win, `return (async () => {
        const pane = document.querySelector('.bookview');
        const boxOf = () => {
          const c = pane.querySelector('canvas.pdf-canvas');
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return { w: Math.round(r.width * 4) / 4, h: Math.round(r.height * 4) / 4,
                   x: Math.round(r.left * 4) / 4, y: Math.round(r.top * 4) / 4 };
        };
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));

        // Wait for the turn to *begin* before waiting for it to end. Looking for
        // the end straight away finds it at once — the turn has not started yet —
        // and what gets measured is the middle of the animation.
        const begun = performance.now() + 2000;
        let started = false;
        while (performance.now() < begun) {
          if (pane.querySelector('.turning') || pane.querySelector('.turn-leaf')) { started = true; break; }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 16));
        }
        if (!started) return { error: 'the turn never started' };

        const over = performance.now() + 2500;
        while (performance.now() < over) {
          if (!pane.querySelector('.turning') && !pane.querySelector('.turn-leaf')) break;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 24));
        }
        // And let any animation that was still finishing come to rest.
        await new Promise((r) => setTimeout(r, 250));

        const seen = [];
        const until = performance.now() + 1200;
        while (performance.now() < until) {
          const box = boxOf();
          if (box) seen.push(box);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 24));
        }
        if (!seen.length) return { error: 'no page on screen after the turn' };
        const first = seen[0];
        let moved = 0;
        let resized = 0;
        for (const box of seen) {
          moved = Math.max(moved, Math.abs(box.x - first.x), Math.abs(box.y - first.y));
          resized = Math.max(resized, Math.abs(box.w - first.w), Math.abs(box.h - first.h));
        }
        // What it actually did, so a failure says what moved rather than only
        // how far.
        const trail = [];
        for (const box of seen) {
          const step = box.x + ',' + box.y + ' ' + box.w + 'x' + box.h;
          if (trail[trail.length - 1] !== step) trail.push(step);
        }
        return { samples: seen.length, moved, resized, size: first.w + 'x' + first.h, trail: trail.slice(0, 8) };
      })()`);
      assert(!still.error, still.error);
      // Not one pixel, either of size or of place. Half a pixel of rounding is
      // the browser's, not the page's.
      assert(still.resized <= 0.5,
        `with the ${effect} effect the page changed size by ${still.resized}px after the turn: ${still.trail.join(' → ')}`);
      assert(still.moved <= 0.5,
        `with the ${effect} effect the page moved ${still.moved}px after the turn: ${still.trail.join(' → ')}`);
      report.push(`${effect}: ${still.size}, ${still.samples} looks, ${still.moved}px moved`);
    }
    return report.join(' · ');
  });

  await check('the page count of a book does not move when the letters do', async () => {
    const ready = await evaluate(win, `return (() => {
      const tab = [...document.querySelectorAll('.doctab')].find((d) => /epub/i.test(d.textContent));
      if (!tab) return { error: 'the EPUB is not open' };
      tab.click();
      return { ok: true };
    })()`);
    assert(!ready.error, ready.error);
    await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 20000 });
    await setPageMode(win, 'scroll');
    await setTextScale(win, 0);
    await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
    await wait(500);

    const readPages = `(() => {
      const cell = document.querySelector('[data-testid=page-readout]');
      if (!cell) return null;
      const m = cell.textContent.match(/([0-9]+)\\s*\\/\\s*([0-9]+)/);
      return m ? { page: Number(m[1]), pages: Number(m[2]) } : null;
    })()`;
    const before = await until(win, readPages, { timeout: 25000 });
    assert(before && before.pages > 0, 'the book was never given a page count');

    // Much bigger, then much smaller. A count that moved with the letters could
    // not be used to say where in a book you are, or to tell anyone else.
    const seen = [String(before.pages)];
    const big = await setTextScale(win, 8);
    await wait(500);
    const enlarged = await evaluate(win, `return ${readPages};`);
    seen.push(String(enlarged.pages));
    await setTextScale(win, 0);
    await wait(500);
    const back = await evaluate(win, `return ${readPages};`);
    seen.push(String(back.pages));

    assert(new Set(seen).size === 1,
      `the count went ${seen.join(' → ')} as the letters changed`);
    // And the reader has not been moved: the same place is the same page.
    assert(back.page === before.page,
      `the page went from ${before.page} to ${back.page} without the reader moving`);

    // Turning a page moves the page number, and by one step, not by a jump.
    const turned = await evaluate(win, `return (async () => {
      const read = () => ${readPages};
      const start = read();
      for (let i = 0; i < 6; i += 1) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 450));
      }
      return { start, now: read() };
    })()`);
    assert(turned.now.page > turned.start.page,
      `six page turns left the reader on page ${turned.now.page}, where they started`);
    assert(turned.now.page <= turned.start.page + 12,
      `six page turns jumped from ${turned.start.page} to ${turned.now.page}`);
    assert(turned.now.pages === before.pages, 'the count changed while turning pages');
    return `${before.pages} pages at 100% and at ${big}; six turns: page ${turned.start.page} → ${turned.now.page}`;
  });

  await check('jumping about a book from its contents never breaks the page', async () => {
    await until(win, "!!document.querySelector('[data-testid=chapter]')", { timeout: 20000 });
    await evaluate(win, `
      const toc = document.querySelector('.side-panel.left .panel-tab[data-panel=contents]');
      if (toc) toc.click();
      return true;
    `);
    await wait(300);

    const report = [];
    for (const mode of ['scroll', 'paged']) {
      for (const effect of ['none', 'slide', 'flip']) {
        // eslint-disable-next-line no-await-in-loop
        await setPageMode(win, mode);
        // eslint-disable-next-line no-await-in-loop
        if (mode === 'paged') await setPageTurn(win, effect);
        // eslint-disable-next-line no-await-in-loop
        await wait(300);

        // eslint-disable-next-line no-await-in-loop
        const jumped = await evaluate(win, `return (async () => {
          const pane = document.querySelector('.bookview');
          const rows = [...document.querySelectorAll('.side-panel.left .toc-row')];
          if (rows.length < 2) return { error: rows.length + ' contents row(s)' };

          let worst = 0;
          let torn = '';
          const look = () => {
            const chapter = document.querySelector('[data-testid=chapter]');
            if (!chapter) return;
            const box = chapter.getBoundingClientRect();
            const room = pane.getBoundingClientRect();
            // How far the text sticks out of the window it is being read in.
            //
            // Not how far it sits from the window's left edge: a chapter read as
            // one column is *centred*, so it has a margin either side and always
            // has. What is wrong is text that has left the window — which is what
            // a page that slid sideways looked like.
            const out = Math.max(0, room.left - box.left, box.right - room.right);
            if (out > worst) { worst = out; torn = Math.round(out) + 'px across'; }
            const above = Math.max(0, room.top - box.bottom, box.top - room.bottom);
            if (above > worst) { worst = above; torn = Math.round(above) + 'px down'; }
          };

          // There and back, which is when it went wrong: the effect runs on the
          // way in and the pane is scrolled on the way out.
          for (const row of [rows[rows.length - 1], rows[0], rows[Math.floor(rows.length / 2)]]) {
            row.click();
            const deadline = performance.now() + 1400;
            while (performance.now() < deadline) {
              look();
              // eslint-disable-next-line no-await-in-loop
              await new Promise((r) => setTimeout(r, 24));
            }
          }
          const chapter = document.querySelector('[data-testid=chapter]');
          return {
            worst: Math.round(worst),
            torn,
            words: (chapter ? chapter.textContent : '').replace(/\\s+/g, ' ').trim().slice(0, 20),
            left: Math.round(pane.scrollLeft),
            top: Math.round(pane.scrollTop),
          };
        })()`);
        assert(!jumped.error, jumped.error);
        assert(jumped.words.length > 0,
          `${mode}/${effect}: the page came up empty after jumping about`);
        assert(jumped.worst <= 4,
          `${mode}/${effect}: the text was ${jumped.torn} out of the window while jumping`);
        report.push(`${mode}/${effect} ✓`);
      }
    }
    await setPageMode(win, 'scroll');
    return report.join(' · ');
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
      return { ok: true };
    })()`);
    assert(!started.error, started.error);
    // The full-window gallery, which is the one with the cards in it.
    await runMenuCommand(win, 'view', 'galleryIcons');

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
    const switched = await evaluate(win, `return (() => {
      const views = [...document.querySelectorAll('.gallery-views button')];
      if (!views.length) return { error: 'the gallery is not open' };
      views.at(-1).click();
      return { ok: true };
    })()`);
    assert(!switched.error, switched.error);
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
    // A page of text has no picture on it, and the button says so by being
    // greyed out — so this needs a book whose pages *are* pictures.
    win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', 'sample.cbz'));
    await until(win, "!!document.querySelector('img.comic-page')", { timeout: 20000 });
    await wait(300);
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
    if (image.isEmpty()) {
      // Say what the pane actually had to offer, so a failure here names the
      // reason rather than only the symptom.
      const why = await evaluate(win, `return (() => {
        const pane = document.querySelector('.bookview');
        const canvas = document.querySelector('canvas.pdf-canvas');
        const img = document.querySelector('img.comic-page');
        let reads = 'no picture on the page';
        const node = canvas || img;
        if (node) {
          try {
            const c = document.createElement('canvas');
            c.width = node.width || node.naturalWidth; c.height = node.height || node.naturalHeight;
            c.getContext('2d').drawImage(node, 0, 0);
            reads = 'readable, ' + c.toDataURL('image/png').length + ' chars';
          } catch (err) { reads = 'unreadable: ' + err.message; }
        }
        const toast = document.querySelector('.toast');
        return {
          kind: pane ? pane.className : 'no pane',
          has: node ? node.tagName : 'none',
          reads,
          toast: toast ? toast.textContent.trim() : '',
        };
      })()`);
      assert(false, `nothing reached the clipboard — ${JSON.stringify(why)}`);
    }
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

  // ── The page turn, format by format, one page and two ──
  //
  // The reader asked for this one in particular, and it is the check that says
  // what a page turn *is* in this reader: the page being left is the page that
  // moves, and the page that has arrived does not move at all — it is uncovered
  // rather than brought in. Every format, one page at a time and two facing
  // pages, and both of the effects that move anything.
  await check('the page being left is what turns, in every format and layout', async () => {
    const books = [
      { file: 'sample.epub', name: 'EPUB', reflow: true, live: '.chapter' },
      { file: 'sample.pdf', name: 'PDF', reflow: false, live: 'canvas.pdf-canvas' },
      { file: 'sample.cbz', name: 'CBZ', reflow: false, live: 'img.comic-page' },
    ];
    const report = [];

    for (const book of books) {
      win.webContents.send('app:openPath', path.join(__dirname, '..', 'samples', book.file));
      // eslint-disable-next-line no-await-in-loop
      await until(win, `!!document.querySelector('${book.live}')`, { timeout: 20000 });
      // eslint-disable-next-line no-await-in-loop
      await setPageMode(win, 'paged');
      // eslint-disable-next-line no-await-in-loop
      await wait(500);

      for (const twoUp of [false, true]) {
        // One page or two. A fixed-layout book faces two pages across a
        // binding; a chapter of text pours into two columns, which is the same
        // question asked of text.
        if (book.reflow) {
          // eslint-disable-next-line no-await-in-loop
          await setTwoColumns(win, twoUp);
        } else {
          // eslint-disable-next-line no-await-in-loop
          const laid = await evaluate(win, `return (() => {
            const button = document.querySelector('[data-testid=${twoUp ? 'view-double' : 'view-single'}]');
            if (!button) return { error: 'no page-view button' };
            if (!button.classList.contains('active')) button.click();
            return { ok: true };
          })()`);
          if (laid.error) throw new Error(`${book.name}: ${laid.error}`);
        }
        // eslint-disable-next-line no-await-in-loop
        await wait(600);

        for (const effect of ['slide', 'flip']) {
          // eslint-disable-next-line no-await-in-loop
          await setPageTurn(win, effect);
          // Back to the beginning, so that there is always a page to turn to
          // and every measurement is made from the same place.
          // eslint-disable-next-line no-await-in-loop
          await evaluate(win, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true })); return true;");
          // Let that move finish — it is a turn of its own — and let the page
          // it lands on be drawn, because the turn is drawn from what is on the
          // screen at the moment it begins.
          // eslint-disable-next-line no-await-in-loop
          await until(win, "!document.querySelector('[data-testid=turn-page]')", { timeout: 4000 });
          // eslint-disable-next-line no-await-in-loop
          await wait(700);
          // eslint-disable-next-line no-await-in-loop
          const seen = await evaluate(win, `return (async () => {
            const pane = document.querySelector('.bookview');
            const liveOf = () => pane.querySelector('${book.live}');
            const rectOf = () => {
              const el = liveOf();
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
            };
            const before = rectOf();
            if (!before || !before.w) return { error: 'nothing on the page to turn' };

            let leaving = '';
            let starts = 0;
            let turning = false;
            let moved = 0;
            let liveAnimated = 0;
            const names = new Set();

            // A chapter of text turns a page by gliding the pane one column
            // along, and that needs no layer — the page being left walks off
            // the screen by itself. The layer is for a chapter being replaced,
            // so that is what this asks for.
            if (${book.reflow}) {
              const next = document.querySelector('[data-testid=next-section]');
              if (!next || next.disabled) return { error: 'there is no next chapter to turn to' };
              next.click();
            } else {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
            }
            const deadline = performance.now() + 1400;
            while (performance.now() < deadline) {
              const layer = pane.querySelector('[data-testid=turn-page]');
              if (layer) {
                if (!turning) starts += 1;
                turning = true;
                const face = layer.querySelector('img');
                const copy = layer.querySelector('.chapter');
                if (face && face.getAttribute('src')) leaving = face.getAttribute('src').slice(0, 16);
                else if (copy && copy.textContent.trim()) leaving = copy.textContent.trim().slice(0, 16);
                // The overlay holds the leaf; the leaf is what is animated.
                const moving = layer.querySelector('.turn-leaf') || layer;
                for (const a of (moving.getAnimations ? moving.getAnimations() : [])) {
                  if (a.animationName) names.add(a.animationName);
                }
              } else {
                turning = false;
              }
              // The page that has arrived must not move while the turn runs.
              const now = rectOf();
              if (now && now.w) {
                moved = Math.max(moved, Math.abs(now.x - before.x), Math.abs(now.y - before.y));
                const el = liveOf();
                const host = el.closest('.page-spread, .chapter') || el;
                for (const a of (host.getAnimations ? host.getAnimations() : [])) {
                  if (/^(page|leaf|turn)-/.test(a.animationName || '')) liveAnimated += 1;
                }
              }
              // eslint-disable-next-line no-await-in-loop
              await new Promise((r) => setTimeout(r, 16));
            }
            return { leaving, starts, moved, liveAnimated, names: [...names], after: rectOf() };
          })()`);

          const where = `${book.name} ${twoUp ? 'two-up' : 'one-up'} ${effect}`;
          if (seen.error) throw new Error(`${where}: ${seen.error}`);
          assert(seen.leaving, `${where}: nothing was drawn on the page that turns`);
          assert(seen.starts === 1, `${where}: the turn ran ${seen.starts} times`);
          assert(seen.names.length > 0, `${where}: the page that turns was not animated`);
          assert(seen.liveAnimated === 0,
            `${where}: the page that arrived was animated as well (${seen.liveAnimated} frames)`);
          assert(seen.moved <= 2, `${where}: the page that arrived moved ${seen.moved}px`);
          report.push(`${where} ✓`);
          // eslint-disable-next-line no-await-in-loop
          await until(win, "!document.querySelector('[data-testid=turn-page]')", { timeout: 4000 });
        }
      }
    }
    return report.join(' · ');
  });

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
  // Warnings are kept as well as errors. They do not fail a run, but a check
  // that finds something missing can say what the renderer complained about,
  // which beats guessing at it from the outside.
  win.__smokeWarnings = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) win.__smokeErrors.push(message);
    else if (level === 2) win.__smokeWarnings.push(message);
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

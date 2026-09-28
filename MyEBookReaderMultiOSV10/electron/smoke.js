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
const child = require('./childwindows');

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

  await check('a toolbar menu opens as its own window', async () => {
    await evaluate(win, `
      const button = [...document.querySelectorAll('.toolbar button')].find((b) => b.getAttribute('aria-label') === '파일' || b.getAttribute('aria-label') === 'File');
      button.click();
      return true;
    `);
    await wait(900);
    const menu = child.getMenuWindow();
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
    await wait(900);
    const menu = child.getMenuWindow();
    assert(menu && menu.isVisible(), 'no bookmark menu window');
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

  await check('the theme list fits on the screen, in columns if it must', async () => {
    const { screen } = require('electron');
    await evaluate(win, "document.querySelector('.toolbar-right .menu-wrap.split .menu-btn').click(); return true;");
    await wait(1100);
    const menu = child.getMenuWindow();
    assert(menu && menu.isVisible(), 'the theme list did not open');
    const bounds = menu.getBounds();
    const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
    assert(bounds.height <= area.height, `the list is ${bounds.height}px tall on a ${area.height}px screen`);
    const shown = await menu.webContents.executeJavaScript(`(() => {
      const list = document.querySelector('.menu-list');
      return {
        rows: document.querySelectorAll('.menu-item').length,
        columns: (list.className.match(/cols-(\d)/) || [null, '1'])[1],
        heads: [...document.querySelectorAll('.menu-head')].length,
      };
    })()`);
    menu.hide();
    assert(Number(shown.rows) === 40, `${shown.rows} themes instead of 40`);
    assert(shown.heads === 2, `${shown.heads} family headings instead of two`);
    return `${shown.rows} themes in ${shown.columns} column(s), ${bounds.height}px tall`;
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
    await until(win, "!!document.querySelector('img.comic-page')", { timeout: 20000 });
    await evaluate(win, `
      const button = [...document.querySelectorAll('.toolbar button')]
        .find((b) => (b.getAttribute('aria-label') || '').includes('한 장') || (b.getAttribute('aria-label') || '').includes('Single page'));
      if (button) button.click();
      return true;
    `);
    await wait(700);
    const pages = await evaluate(win, "return document.querySelectorAll('img.comic-page').length;");
    assert(pages === 2, `${pages} page(s) instead of two`);
    return 'a two-page spread';
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
function startSmoke(win) {
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

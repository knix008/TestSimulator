'use strict';

// Opens real books in the real window and reports what a reader would see.
//
// Driven by scripts/try-books.mjs, which passes the files in EBK_TRY. Loaded by
// main.js only when that is set, so a normal run never pays for it.
//
// For each book it reports what the reader is actually told — the page count and
// the page they are on, from the status bar — and then works the controls: turn
// a page, turn it back, jump a chapter. What it prints is what someone looking
// at the window would see, which is the point: the samples in this repository
// are written here and prove the readers work on files we made.

const { app } = require('electron');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function evaluate(win, expression) {
  return win.webContents.executeJavaScript(`(() => { ${expression} })()`, true);
}

async function until(win, expression, { timeout = 15000, step = 120 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const value = await evaluate(win, `return ${expression};`);
    if (value) return value;
    if (Date.now() > deadline) return null;
    // eslint-disable-next-line no-await-in-loop
    await wait(step);
  }
}

/** What the status bar says about where the reader is. */
const READ_STATE = `(() => {
  const said = (document.querySelector('.statusbar') || {}).textContent || '';
  const page = document.querySelector('[data-testid=page-readout]');
  const pages = page ? (page.textContent.match(/([0-9]+)\\s*\\/\\s*([0-9]+)/) || null) : null;
  const pane = document.querySelector('.bookview');
  const chapter = document.querySelector('[data-testid=chapter]');
  const canvas = pane && pane.querySelector('canvas.pdf-canvas');
  const picture = pane && pane.querySelector('img.comic-page');
  return {
    page: pages ? Number(pages[1]) : 0,
    pages: pages ? Number(pages[2]) : 0,
    counting: !!page && page.textContent.includes('…'),
    section: (said.match(/([0-9]+)\\s*\\/\\s*([0-9]+)/) || [0, 0])[1],
    scrollTop: pane ? Math.round(pane.scrollTop) : -1,
    shows: chapter ? 'text' : (canvas ? 'pdf' : (picture ? 'picture' : 'nothing')),
    words: chapter ? chapter.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30) : '',
  };
})()`;

async function readOne(win, file) {
  const name = file.split(/[\\/]/).pop();
  win.webContents.send('app:openPath', file);

  // Wait for *this* book, not for a book. The one before it stays on screen
  // until the new one has been read, and everything reported below would then be
  // about that one instead — which is how this tool first mislabelled every book
  // it looked at.
  const want = JSON.stringify(name.slice(0, 24));
  const opened = await until(
    win,
    `(() => {
      const tab = document.querySelector('.doctab.active') || document.querySelector('.doctab');
      if (!tab || !tab.textContent.includes(${want})) return null;
      const s = ${READ_STATE};
      return s.shows !== 'nothing' ? s : null;
    })()`,
    { timeout: 60000 },
  );
  if (!opened) {
    const failed = await evaluate(win, `return (() => {
      const err = document.querySelector('.toasts, .modal');
      return err ? err.textContent.replace(/\\s+/g, ' ').trim().slice(0, 100) : 'it never opened';
    })()`);
    console.log(`  ✗ ${name}\n      ${failed}`);
    return;
  }

  // The page count is worked out in the background for a book of text.
  const counted = await until(
    win,
    `(() => { const s = ${READ_STATE}; return s.pages > 0 ? s : null; })()`,
    { timeout: 60000 },
  ) || opened;

  const format = await evaluate(win, `return (() => {
    const cells = [...document.querySelectorAll('.statusbar .st-cell')].map((c) => c.textContent.trim());
    return cells.find((c) => /^(EPUB|PDF|DJVU|DjVu|MOBI|AZW3|FictionBook|Comic|Markdown|HTML|Text|Image)/i.test(c)) || '?';
  })()`);

  // Turning a page, and turning it back.
  const turned = await evaluate(win, `return (async () => {
    const read = () => ${READ_STATE};
    const before = read();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const after = read();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const back = read();
    return { before, after, back };
  })()`);

  // And moving a whole chapter.
  const jumped = await evaluate(win, `return (async () => {
    const read = () => ${READ_STATE};
    const before = read();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: false, bubbles: true }));
    const next = [...document.querySelectorAll('.toolbar button')]
      .find((b) => (b.getAttribute('aria-label') || '').match(/다음 장|Next section/));
    if (next && !next.disabled) next.click();
    await new Promise((r) => setTimeout(r, 1200));
    return { before, after: read() };
  })()`);

  const moved = (a, b) => (a.page !== b.page || a.section !== b.section || a.scrollTop !== b.scrollTop);
  console.log(
    `  ✓ ${name}\n`
    + `      ${format} · ${counted.shows} · page ${counted.page}/${counted.pages}`
    + ` · chapter ${counted.section}\n`
    + `      PageDown → page ${turned.after.page}, chapter ${turned.after.section},`
    + ` top ${turned.after.scrollTop}px ${moved(turned.before, turned.after) ? '(moved)' : '(NOTHING MOVED)'}\n`
    + `      PageUp   → page ${turned.back.page}, chapter ${turned.back.section},`
    + ` top ${turned.back.scrollTop}px ${moved(turned.after, turned.back) ? '(moved)' : '(NOTHING MOVED)'}\n`
    + `      next chapter → page ${jumped.after.page}, chapter ${jumped.after.section}`
    + ` ${moved(jumped.before, jumped.after) ? '(moved)' : '(NOTHING MOVED)'}`
    + (counted.words ? `\n      "${counted.words}"` : ''),
  );
}

async function run(win) {
  const files = String(process.env.EBK_TRY || '').split('\n').filter(Boolean);
  console.log(`\nMyEBookReader — reading ${files.length} real book(s)\n`);
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    try { await readOne(win, file); } catch (err) { console.log(`  ✗ ${file}\n      ${err.message}`); }
  }
  console.log('\n[books] Done.\n');
}

exports.startTryBooks = function startTryBooks(win) {
  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(2500);
      await run(win);
    } catch (err) {
      console.error('[books] failed:', err?.message || err);
    } finally {
      app.exit(0);
    }
  });
};

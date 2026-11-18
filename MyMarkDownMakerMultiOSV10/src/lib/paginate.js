// Laying a standalone HTML document out in A4 pages with paged.js — the way the PDF and the print
// come out — to learn the page of every heading (`h-N`) and picture (`fig-N`). The contents and the
// figure index of the Word and HTML exports get those numbers baked in.
//
// The layout runs in a frame of the window that asks (the main window): it is on the screen, behind
// everything (opacity 0), so the browser does not throttle it — a hidden window renders about once a
// second, which makes paged.js forty times slower. The render window (src/render.js) uses the same
// functions on its own document.

/** The paged.js polyfill as text (loaded once, on first use). */
let polyfill = null;
export async function pagedPolyfill() {
  polyfill ??= (await import('../../node_modules/pagedjs/dist/paged.polyfill.js?raw')).default;
  return polyfill;
}

/** Runs paged.js in `win` (its document holds the HTML): resolves when every page is laid out. */
export async function runPaged(win) {
  const doc = win.document;
  win.PagedConfig = { auto: false };
  const script = doc.createElement('script');
  // As a script element's text, not inside the HTML: paged.js holds markup in strings that break HTML parsing.
  script.textContent = await pagedPolyfill();
  doc.head.append(script);
  if (!win.Paged?.Previewer) throw new Error('paged.js did not load');
  const previewer = new win.Paged.Previewer();
  await previewer.preview();
  return doc.querySelectorAll('.pagedjs_page').length;
}

/** { 'h-0': 3, 'fig-2': 5, … } of a laid-out document. */
export function pageMapOf(doc) {
  const map = {};
  for (const el of doc.querySelectorAll('[id^="h-"], [id^="fig-"]')) {
    const n = el.closest('.pagedjs_page')?.getAttribute('data-page-number');
    if (n != null) map[el.id] = Number.parseInt(n, 10);
  }
  return map;
}

/** Writes the page numbers into the contents and figure-index rows of a laid-out document. */
export function fillIndexPages(doc) {
  for (const row of doc.querySelectorAll('.toc-table tr')) {
    const link = row.querySelector('a');
    const cell = row.querySelector('.toc-c-pg');
    if (!link || !cell) continue;
    const id = (link.getAttribute('href') || '').slice(1);
    const target = id && doc.getElementById(id);
    const n = target?.closest('.pagedjs_page')?.getAttribute('data-page-number');
    if (n != null) cell.textContent = n;
  }
}

/** Replaces `doc`'s content by a whole HTML document given as text (no scripts run). */
export function loadHtml(doc, html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  doc.documentElement.replaceWith(doc.importNode(parsed.documentElement, true));
}

/** The page map of `html`, laid out in a frame of this window (null when it cannot be done). */
export async function computePageMap(html, { timeout = 120_000 } = {}) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:1200px;border:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.append(frame);
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    const done = runPaged(frame.contentWindow);
    const late = new Promise((_, reject) => setTimeout(() => reject(new Error('pagination timed out')), timeout));
    await Promise.race([done, late]);
    const map = pageMapOf(doc);
    return Object.keys(map).length ? map : null;
  } catch (error) {
    console.warn('pagination failed', error);
    return null;
  } finally {
    frame.remove();
  }
}

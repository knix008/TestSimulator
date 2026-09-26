// Thin abstraction over the two runtimes:
//   • Electron — native dialogs / filesystem via window.electronAPI (preload)
//   • Web      — <input type=file webkitdirectory> + Blob downloads
// paged.js polyfill as a plain asset URL: it is injected into the off-screen
// iframe the web build paginates in. Imported by path because pagedjs's
// "exports" map blocks a deep import of the standalone bundle.
import pagedPolyfillUrl from '../../node_modules/pagedjs/dist/paged.polyfill.js?url';

export const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
export const isElectron = !!(api && api.isElectron);

// Save text to disk. Electron opens a native Save dialog; the web build
// triggers a browser download. Returns the saved path (Electron) or the
// suggested filename (Web), or null if cancelled.
export async function saveText({ defaultName, content, filters, defaultDir }) {
  if (isElectron) {
    return api.saveText({ defaultName, content, filters, defaultDir });
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName || 'merged.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName || 'merged.md';
}

// Save binary data (a Blob) — Word/PDF export. Electron routes through a native
// Save dialog; the web build downloads the blob. Returns saved path / filename.
export async function saveBlob({ defaultName, blob, filters }) {
  if (isElectron) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return api.saveBinary({ defaultName, base64: bytesToBase64(bytes), filters });
  }
  downloadBlob(blob, defaultName);
  return defaultName;
}

// Overwrite an existing file in place (Electron only) — the Save path for a
// document that already has a location. Throws on failure; returns null when
// there is no filesystem to write to (web build).
export async function writeTextTo(filePath, content) {
  if (!(isElectron && api.writeText && filePath)) return null;
  const res = await api.writeText({ filePath, content });
  if (res && res.error) throw new Error(res.error);
  return res ? res.path : null;
}

// Open a single text file (Electron only) and return { name, content } or null.
// The web build handles opening via a hidden <input type=file> in the app.
export async function openTextFile(filters, defaultDir) {
  if (isElectron && api.openTextFile) {
    return api.openTextFile({ filters, defaultDir });
  }
  return null;
}

// Read a file at an absolute path (Electron only) — used to reopen recents.
export async function readPath(filePath) {
  if (isElectron && api.readFile) return api.readFile(filePath);
  return null;
}

// Export a standalone HTML string to PDF.
//   • Electron — native printToPDF via the main process (silent, file saved).
//   • Web      — opens a print window; the user picks “Save as PDF”.
export async function exportPdf({ html, defaultName, pdfOptions, defaultDir }) {
  if (isElectron) {
    return api.exportPdf({ html, defaultName, pdfOptions, defaultDir });
  }
  printHtml(html);
  return defaultName;
}

// Paginate a standalone HTML document (Electron only) and return a map of each
// heading anchor to its page number ({ 'h-0': 3, … }), used to bake real TOC
// page numbers into Word / HTML exports. Returns null when unavailable (web).
export async function computeTocPageMap(html) {
  if (isElectron && api.paginate) {
    try {
      const map = await api.paginate(html);
      return map && Object.keys(map).length ? map : null;
    } catch { return null; }
  }
  return null;
}

// ── Web pagination (paged.js in an offscreen iframe) ──────
// The desktop build paginates in a hidden Electron window; in the browser we do
// the same work in a same-origin iframe parked off-screen, so "current page" and
// a page range work in the web build too.

// Load paged.js into the document with auto-run disabled. Pagination itself is
// started from the parent once the frame has loaded — a <head> script would run
// while <body> does not exist yet and paged.js would throw.
function injectWebPaged(html) {
  // The cover's screen rule uses 100vh, which paged.js can treat as the browser
  // window rather than the page and then stall. Neutralise it only inside this
  // pagination frame; the exported document is unchanged.
  const inject = `<script>window.PagedConfig={auto:false};</script>`
    + `<style>@media screen{.cover{min-height:0 !important;height:auto !important}}</style>`
    + `<script src="${pagedPolyfillUrl}"></script>`;
  return html.includes('</head>') ? html.replace('</head>', `${inject}</head>`) : inject + html;
}

// Build the off-screen iframe, paginate it and hand the frame to `fn`. The
// iframe is removed afterwards unless `fn` asks to keep it (by returning an
// object with `keep: true` — printing needs the document to stay alive).
async function withPagedFrame(html, fn) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'print');
  // Off-screen rather than hidden: a display:none / visibility:hidden frame
  // lays out at zero size, which would break pagination and print blank.
  // The viewport is kept short on purpose — the cover styles itself with
  // `min-height: calc(100vh - 96px)` on screen, and a tall frame would make it
  // taller than one printed page, which stalls paged.js.
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:640px;border:0;opacity:0;';
  document.body.appendChild(frame);
  const drop = () => { try { frame.remove(); } catch { /* ignore */ } };
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(injectWebPaged(html));
    doc.close();
    // Wait for the injected scripts to run, then for pagination to finish.
    // Wait for the injected polyfill to be in place. The frame's load event can
    // fire before the listener is attached, so poll for the global as well.
    await new Promise((res) => {
      const started = Date.now();
      const tick = () => {
        if (frame.contentWindow?.Paged || Date.now() - started > 8000) { res(); return; }
        setTimeout(tick, 30);
      };
      tick();
    });
    const w = frame.contentWindow;
    if (!w || !w.Paged) { drop(); return null; }
    // paged.js can stall on content it cannot break; never let that hang the UI.
    const paginated = await Promise.race([
      new w.Paged.Previewer().preview().then(() => true, () => false),
      new Promise((res) => setTimeout(() => res(false), 20000)),
    ]);
    if (!paginated || !doc.querySelectorAll('.pagedjs_page').length) { drop(); return null; }
    const out = await fn(frame, doc);
    if (!out || !out.keep) drop();
    return out;
  } catch {
    drop();
    return null;
  }
}

// Total page count + the page every heading anchor landed on, read off a
// paginated document.
function readPagedInfo(doc) {
  const map = {};
  doc.querySelectorAll('[id^="h-"]').forEach((el) => {
    const pg = el.closest('.pagedjs_page');
    const n = pg && pg.getAttribute('data-page-number');
    if (n != null) map[el.id] = parseInt(n, 10);
  });
  return { pages: doc.querySelectorAll('.pagedjs_page').length, map };
}

// Keep only `keep` (1-based page numbers). paged.js renders the page number as
// `content: … counter(page)`, which would restart at 1 once pages are removed —
// so freeze every counter-driven margin box to its literal number first.
function prunePages(doc, keep) {
  const all = [...doc.querySelectorAll('.pagedjs_page')];
  if (!keep) return { pages: all.length, printed: all.length };
  const rules = [];
  all.forEach((p) => {
    const n = p.getAttribute('data-page-number');
    if (n == null) return;
    p.querySelectorAll('.pagedjs_margin-content').forEach((m) => {
      const c = (doc.defaultView.getComputedStyle(m, ':after').content) || '';
      if (!c.includes('counter(page)')) return;
      m.setAttribute('data-mtg-pgno', n);
      rules.push(`.pagedjs_margin-content[data-mtg-pgno="${n}"]:after{content:${c.split('counter(page)').join(`"${n}"`)} !important}`);
    });
  });
  if (rules.length) {
    const st = doc.createElement('style');
    st.textContent = rules.join('');
    doc.head.appendChild(st);
  }
  all.forEach((p) => {
    const n = parseInt(p.getAttribute('data-page-number'), 10);
    if (!keep.includes(n)) p.remove();
  });
  return { pages: all.length, printed: doc.querySelectorAll('.pagedjs_page').length };
}

// Paginate a standalone HTML document and report { pages, map } — the total
// page count plus the page every heading anchor (h-0, h-1 …) landed on.
// Electron paginates in a hidden window, the web build in an off-screen iframe.
// Returns null only when pagination is genuinely unavailable.
// The web print dialog paginates once. printInfo keeps the per-page documents
// so the preview does not have to lay the same file out a second time.
let previewCache = null;

export async function printInfo(html) {
  if (isElectron && api.printInfo) {
    try {
      const info = await api.printInfo(html);
      return info && info.pages ? info : null;
    } catch { return null; }
  }
  const info = await withPagedFrame(html, (_f, doc) => {
    const pages = pagesFromPagedDoc(doc);
    previewCache = pages.length ? { html, pages } : null;
    return readPagedInfo(doc);
  });
  return info && info.pages ? info : null;
}

export function cachedPrintPreview(html) {
  return previewCache && previewCache.html === html ? previewCache.pages : null;
}

// Paginate `html` and return one standalone document per printed page, so the
// print dialog can show the same layout the printer will use. Returns null when
// pagination fails (the caller can fall back to the unpaginated document).
// Freeze counter(page) margin boxes to the literal page number. Extracted
// preview pages are standalone documents, so the CSS counter would otherwise
// restart at 1 on every page.
function freezePageNumbers(doc) {
  const rules = [];
  [...doc.querySelectorAll('.pagedjs_page')].forEach((p) => {
    const n = p.getAttribute('data-page-number');
    if (n == null) return;
    p.querySelectorAll('.pagedjs_margin-content').forEach((m) => {
      const c = (doc.defaultView.getComputedStyle(m, ':after').content) || '';
      if (!c.includes('counter(page)')) return;
      m.setAttribute('data-mtg-pgno', n);
      rules.push(`.pagedjs_margin-content[data-mtg-pgno="${n}"]:after{content:${c.split('counter(page)').join(`"${n}"`)} !important}`);
    });
  });
  if (!rules.length) return;
  const st = doc.createElement('style');
  st.textContent = rules.join('');
  doc.head.appendChild(st);
}

function pagesFromPagedDoc(doc) {
  freezePageNumbers(doc);
  const styles = [...doc.querySelectorAll('style')].map((n) => n.outerHTML).join('');
  return [...doc.querySelectorAll('.pagedjs_page')].map((p, i) => {
    const n = parseInt(p.getAttribute('data-page-number'), 10) || (i + 1);
    const rect = p.getBoundingClientRect();
    const w = Math.round(rect.width) || 794;
    const h = Math.round(rect.height) || 1123;
    const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}`
      + `<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}`
      + `.pagedjs_page{margin:0 !important}</style></head><body>${p.outerHTML}</body></html>`;
    return { n, w, h, srcdoc };
  });
}

export async function buildPrintPreview(html) {
  const cached = cachedPrintPreview(html);
  if (cached) return cached;
  const out = await withPagedFrame(html, (_frame, doc) => ({ pages: pagesFromPagedDoc(doc) }));
  return out && out.pages && out.pages.length ? out.pages : null;
}

// The printers this machine can reach ([] on the web build, where the browser
// print dialog owns printer selection).
export async function printPrinters() {
  if (isElectron && api.printPrinters) {
    try { return (await api.printPrinters()) || []; } catch { return []; }
  }
  return [];
}

// Print a standalone HTML document.
//   • Electron — paginates offscreen, drops the pages outside `pages`
//                (1-based; null = all) and prints with `options` (printer,
//                copies, colour, duplex, orientation, scale, N-up). With
//                options.silent false the system print dialog opens first.
//   • Web      — opens a print window; the browser dialog owns every option.
// Returns { ok, reason, pages, printed } (Electron) or { ok: true } (web).
export async function printDocument({ html, pages, options }) {
  if (isElectron && api.printDocument) {
    return api.printDocument({ html, pages: pages || null, options: options || {} });
  }
  // Web: paginate in the off-screen iframe, drop the pages that were not
  // selected, then let the browser's own dialog handle printer and copies.
  const keep = Array.isArray(pages) && pages.length ? pages : null;
  const r = await withPagedFrame(html, (frame, doc) => {
    const counts = prunePages(doc, keep);
    if (!counts.printed) return { ...counts, keep: false };
    frame.contentWindow.focus();
    frame.contentWindow.print();
    // Give the print dialog time to take a snapshot before the frame goes away.
    setTimeout(() => { try { frame.remove(); } catch { /* ignore */ } }, 60000);
    return { ...counts, keep: true };
  });
  if (r && r.printed) return { ok: true, reason: '', pages: r.pages, printed: r.printed };
  if (r && !r.printed) return { ok: false, reason: 'empty', pages: r.pages, printed: 0 };
  // Pagination unavailable — fall back to printing the whole document.
  printHtml(html);
  return { ok: true, reason: '', pages: 0, printed: 0 };
}

function printHtml(html) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Give the browser a tick to lay out before invoking the print dialog.
  win.onload = () => { win.focus(); win.print(); };
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 400);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ── Settings persistence ──────────────────────────────────
// localStorage is the live/cross-window store; on Electron we also mirror to a
// userData JSON file so settings survive restarts even for file:// origins.
const LS = {
  export: 'mtg-export', theme: 'mtg-theme', lang: 'mtg-lang', recent: 'mtg-recent',
  themeAuto: 'mtg-theme-auto', themeDark: 'mtg-theme-dark', themeLight: 'mtg-theme-light',
};

export function saveSettingsToDisk() {
  if (!isElectron || !api.saveSettings) return;
  try {
    api.saveSettings({
      export: JSON.parse(localStorage.getItem(LS.export) || '{}'),
      theme: localStorage.getItem(LS.theme) || '',
      themeAuto: localStorage.getItem(LS.themeAuto) || '0',
      themeDark: localStorage.getItem(LS.themeDark) || '',
      themeLight: localStorage.getItem(LS.themeLight) || '',
      lang: localStorage.getItem(LS.lang) || '',
      recent: JSON.parse(localStorage.getItem(LS.recent) || 'null'),
    });
  } catch { /* ignore */ }
}

// Loads persisted settings from disk (Electron) into localStorage before the
// app renders, so restarts restore the last-used configuration.
export async function seedSettingsFromDisk() {
  if (!isElectron || !api.loadSettings) return;
  try {
    const s = await api.loadSettings();
    if (!s) return;
    if (s.export && typeof s.export === 'object') localStorage.setItem(LS.export, JSON.stringify(s.export));
    if (s.theme) localStorage.setItem(LS.theme, s.theme);
    if (s.themeAuto != null && s.themeAuto !== '') {
      const on = s.themeAuto === true || s.themeAuto === '1' || s.themeAuto === 1;
      localStorage.setItem(LS.themeAuto, on ? '1' : '0');
    }
    if (s.themeDark) localStorage.setItem(LS.themeDark, s.themeDark);
    if (s.themeLight) localStorage.setItem(LS.themeLight, s.themeLight);
    if (s.lang) localStorage.setItem(LS.lang, s.lang);
    if (s.recent && typeof s.recent === 'object') localStorage.setItem(LS.recent, JSON.stringify(s.recent));
  } catch { /* ignore */ }
}

// Reads a browser File object as UTF-8 text.
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

// Reads a browser File object as a Base64 data URL (for inlining images).
export function readFileDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

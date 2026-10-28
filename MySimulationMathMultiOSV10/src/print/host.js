// Where a finished print document goes.
//   desktop (Tauri, Windows): src-tauri/src/print.rs: print_info (printers),
//     print_pdf (WebView2 PrintToPdf), print_html (silent print on the chosen
//     printer: no second dialog).
//   web, or a desktop without silent printing: a hidden <iframe> and its
//     window.print() (the browser's print dialog opens; the paper, margins and
//     scale are already in the document).
import { isDesktop } from '../lib/backend';

async function invoke(cmd, args) {
  const m = await import('@tauri-apps/api/core');
  return m.invoke(cmd, args);
}

let infoCache = null;
/** { printers: [{ name, isDefault }], silent, pdf } */
export function printInfo({ refresh = false } = {}) {
  if (!isDesktop) return Promise.resolve({ printers: [], silent: false, pdf: false });
  if (!infoCache || refresh) infoCache = invoke('print_info').catch(() => ({ printers: [], silent: false, pdf: false }));
  return infoCache;
}

/** Images as data: URLs, so the document prints from a file with nothing to fetch. */
export async function inlineImages(html) {
  if (typeof DOMParser === 'undefined' || !/<img\b/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.querySelector('base');
  const baseHref = base ? base.href : document.baseURI;
  await Promise.all([...doc.images].map(async (img) => {
    const raw = img.getAttribute('src') || '';
    if (!raw || raw.startsWith('data:')) return;
    try {
      const res = await fetch(new URL(raw, baseHref).href);
      const blob = await res.blob();
      const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
      img.setAttribute('src', url);
    } catch { /* left as it is */ }
  }));
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

/** job: { html, widthMm, heightMm, printer, copies, color, duplex, collate } */
export async function printSilently(job) {
  const html = await inlineImages(job.html);
  return invoke('print_html', { job: { ...job, html } });
}

/** { pdf (base64, '' when written to output), pages, bytes, path } */
export async function printPdf(job) {
  const html = await inlineImages(job.html);
  return invoke('print_pdf', { job: { ...job, html } });
}

let frame = null;
/** The browser's print dialog for the document. Resolves when it closes. */
export function printInBrowser(html) {
  return new Promise((resolve, reject) => {
    if (frame) { try { frame.remove(); } catch { /* gone */ } frame = null; }
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;visibility:hidden;';
    frame = f;
    let done = false;
    const finish = (fn) => { if (done) return; done = true; setTimeout(() => { if (frame === f) { f.remove(); frame = null; } }, 1000); fn(); };
    f.onload = () => {
      const w = f.contentWindow;
      if (!w) { finish(() => reject(new Error('print frame unavailable'))); return; }
      const go = () => {
        w.addEventListener('afterprint', () => finish(() => resolve({ ok: true })));
        try { w.focus(); w.print(); } catch (err) { finish(() => reject(err)); return; }
        setTimeout(() => finish(() => resolve({ ok: true })), 120000);
      };
      const imgs = [...w.document.images].filter((i) => !i.complete);
      if (!imgs.length) { setTimeout(go, 50); return; }
      let left = imgs.length;
      imgs.forEach((i) => { const one = () => { left -= 1; if (!left) go(); }; i.onload = one; i.onerror = one; });
    };
    document.body.appendChild(f);
    f.srcdoc = html;
  });
}

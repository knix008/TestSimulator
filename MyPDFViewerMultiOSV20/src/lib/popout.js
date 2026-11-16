// Dialogs in a window of their own (the print dialog).
//
// Desktop: window.open("about:blank#dialog-<name>") asks the host
// (src-tauri/src/popout.rs) for a frameless window owned by the main one.
// Web: the same call opens a browser pop-up window.
// Either way its document belongs to this page — same origin, same renderer —
// so React renders into it with a portal and every handler, setting and state
// stays exactly where it was. This file gives that blank document the page's
// look and keeps it in step: the stylesheets, and the theme variables on <html>.
// (After MyEBookReaderMultiOSV20's src/lib/popout.js.)
import { api, isDesktop } from './platform.js';

const desktopPopouts = () => isDesktop && !!api?.win?.popoutShow;

// jsdom (the tests) has no windows to open; the dialog stays in the page there.
const isJsdom = () => typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');

export const canPopOut = () => typeof window !== 'undefined' && typeof window.open === 'function'
  && !isJsdom() && (desktopPopouts() || !isDesktop);

// Copies the page's stylesheets and <html> attributes into `doc` and keeps
// copying them while they change (theme switches, font settings, Vite's hot
// style updates). Returns a function that stops it.
export function mirrorDocument(doc, src = document, { rootClass = '' } = {}) {
  const head = doc.head;
  const base = doc.createElement('base');
  base.href = src.baseURI;
  head.append(base);

  const copyStyles = () => {
    for (const n of [...head.querySelectorAll('[data-mirror]')]) n.remove();
    for (const n of src.querySelectorAll('style, link[rel="stylesheet"]')) {
      const c = n.cloneNode(true);
      if (c.tagName === 'LINK') c.href = n.href;
      c.setAttribute('data-mirror', '');
      head.append(c);
    }
  };
  const copyRoot = () => {
    const from = src.documentElement;
    const to = doc.documentElement;
    for (const a of [...to.attributes]) if (!from.hasAttribute(a.name)) to.removeAttribute(a.name);
    for (const a of from.attributes) to.setAttribute(a.name, a.value);
    if (rootClass) to.classList.add(rootClass);
  };
  copyStyles();
  copyRoot();
  const roots = new MutationObserver(copyRoot);
  roots.observe(src.documentElement, { attributes: true });
  const styles = new MutationObserver(copyStyles);
  styles.observe(src.head, { childList: true, subtree: true, characterData: true });
  return () => { roots.disconnect(); styles.disconnect(); };
}

// Opens a dialog window and gives it a blank, styled document with a root
// element to render into. Returns { win, root, label, web, stop, close } or
// null (tests, a blocked pop-up, or a host that refused).
export function openPopout(name, { width = 400, height = 300, rootClass = '', title = 'MyPDFViewer' } = {}) {
  if (!canPopOut()) return null;
  const web = !desktopPopouts();
  const w = Math.round(width);
  const h = Math.round(height);
  let win = null;
  try {
    if (web) {
      // Centred over the page; the browser adds its own frame around it.
      const left = Math.round((window.screenX || 0) + Math.max(0, ((window.outerWidth || w) - w) / 2));
      const top = Math.round((window.screenY || 0) + Math.max(0, ((window.outerHeight || h) - h) / 2));
      win = window.open('about:blank', `mypdfviewer-${name}`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
    } else {
      win = window.open(`about:blank#${name}`, '', `width=${w},height=${h}`);
    }
  } catch { win = null; }
  if (!win || !win.document) return null;
  const doc = win.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>`);
  doc.close();
  doc.title = title;
  const stop = mirrorDocument(doc, document, { rootClass });
  const root = doc.createElement('div');
  root.className = 'popout-root';
  doc.body.append(root);
  const label = name;
  const close = () => {
    if (web) { try { win.close(); } catch { /* already gone */ } return; }
    api.win.popoutClose(label).catch(() => {});
  };
  return { win, root, label, web, stop, close };
}

// The size of `el` in CSS px, rounded up so nothing is cut by a fraction.
export function measure(el) {
  const r = el.getBoundingClientRect();
  return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
}

const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Sizes (and, unless resizeOnly, places and shows) a dialog window so its
// viewport is exactly `want` (CSS px). The host's frameless windows and the
// browser's pop-ups both come out with a viewport off what was asked, so the
// page checks its own viewport afterwards and asks again with the difference;
// the correction is remembered for that window.
export async function fitPopoutTo(host, want, opts = {}) {
  if (host.web) {
    for (let i = 0; i < 3; i++) {
      const dw = want.width - host.win.innerWidth;
      const dh = want.height - host.win.innerHeight;
      if (Math.abs(dw) < 1 && Math.abs(dh) < 1) break;
      try { host.win.resizeBy(dw, dh); } catch { break; }
      await pause(60);
    }
    try { host.win.focus(); } catch { /* fine */ }
    return;
  }
  const pad = host.pad || { w: 0, h: 0 };
  await api.win.popoutShow({ ...opts, label: host.label, width: want.width + pad.w, height: want.height + pad.h });
  for (let i = 0; i < 2; i++) {
    await pause(60);
    // A window that has only just been made reports 0×0 for a moment; that
    // is not a size to correct against.
    if (!host.win.innerWidth || !host.win.innerHeight) continue;
    const dw = want.width - host.win.innerWidth;
    const dh = want.height - host.win.innerHeight;
    if (Math.abs(dw) < 1 && Math.abs(dh) < 1) return;
    host.pad = { w: (host.pad?.w || 0) + dw, h: (host.pad?.h || 0) + dh };
    await api.win.popoutShow({ label: host.label, width: want.width + host.pad.w, height: want.height + host.pad.h, resizeOnly: true });
  }
}

export const fitPopout = (host, el, opts = {}) => fitPopoutTo(host, measure(el), opts);

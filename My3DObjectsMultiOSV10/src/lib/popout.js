// Pop-out windows on the desktop: Settings, About and the context menu.
//
// window.open("about:blank#<name>") asks the host (src-tauri/src/popout.rs)
// for a frameless window owned by the main one. Its document belongs to this
// page — same origin, same renderer — so React renders into it with a portal
// and every handler, setting and state stays exactly where it was. This file
// gives that blank document the page's look and keeps it in step: the
// stylesheets, and the theme / font variables on <html>.
import { api, isDesktop } from './platform.js';

export const canPopOut = () => isDesktop && typeof window !== 'undefined' && !!api?.win?.popoutShow;

// The host window label for a pop-out name ("menu" → "popout-menu").
export const popoutLabel = (name) => (name === 'menu' ? 'popout-menu' : name);

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

// Opens a pop-out window and gives it a blank, styled document with a root
// element to render into. Returns { win, root, label, stop } or null (web,
// tests, or a host that refused).
export function openPopout(name, { width = 400, height = 300, rootClass = '' } = {}) {
  if (!canPopOut()) return null;
  let win = null;
  try {
    win = window.open(`about:blank#${name}`, '', `width=${Math.round(width)},height=${Math.round(height)}`);
  } catch { win = null; }
  if (!win || !win.document) return null;
  const doc = win.document;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><title>My3DObjects</title></head><body></body></html>');
  doc.close();
  const stop = mirrorDocument(doc, document, { rootClass });
  const root = doc.createElement('div');
  root.className = 'popout-root';
  doc.body.append(root);
  return { win, root, label: popoutLabel(name), stop };
}

// The size of `el` in CSS px, rounded up so nothing is cut by a fraction.
export function measure(el) {
  const r = el.getBoundingClientRect();
  return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
}

// Sizes (and, unless resizeOnly, places and shows) a pop-out to fit `el`.
// The host's frameless windows come out with a viewport a caption's height
// off what was asked, so the page checks its own viewport afterwards and asks
// again with the difference; the correction is remembered for that window.
export async function fitPopout(host, el, opts = {}) {
  const want = measure(el);
  const pad = host.pad || { w: 0, h: 0 };
  await api.win.popoutShow({ ...opts, label: host.label, width: want.width + pad.w, height: want.height + pad.h });
  for (let i = 0; i < 2; i++) {
    await new Promise((r) => { setTimeout(r, 60); });
    const dw = want.width - host.win.innerWidth;
    const dh = want.height - host.win.innerHeight;
    if (Math.abs(dw) < 1 && Math.abs(dh) < 1) return;
    host.pad = { w: (host.pad?.w || 0) + dw, h: (host.pad?.h || 0) + dh };
    await api.win.popoutShow({ label: host.label, width: want.width + host.pad.w, height: want.height + host.pad.h, resizeOnly: true });
  }
}

// Where a point in this window's client area is on the screen. In the desktop
// webview window.screenX/Y is the client area's origin.
export function toScreen(x, y, win = window) {
  return { x: (win.screenX || 0) + x, y: (win.screenY || 0) + y };
}

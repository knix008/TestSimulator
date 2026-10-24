// Pop-out windows (desktop only): dialogs and drop-down menus in windows of their own, so they can reach past
// the main window. The page opens `about:blank#popout-…` (same origin), copies its style sheets and theme into
// it and moves the dialog's DOM there — listeners and state come along, so the dialog code does not change.
// The desktop side (src-tauri/src/popout.rs) makes the window hidden and owned; place() sizes and shows it.
// The web build, the tests (localStorage myheat.inlineWindows = 1) and the tutorial keep everything in the page.
import { isTauri, invoke } from './native.js';

let inlineWhen = () => false;

/** The app tells when windows must stay in the page (the tutorial points at them). */
export function setInlinePredicate(fn) {
  inlineWhen = fn;
}

export function popoutsEnabled() {
  if (!isTauri) return false;
  try { if (globalThis.localStorage?.getItem('myheat.inlineWindows') === '1') return false; } catch { /* no storage */ }
  return !inlineWhen();
}

let seq = 0;
const open = new Set();

/** A window can take its time to get a document; requestAnimationFrame does not run while it is hidden. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function copyAppearance(fromApp, root) {
  root.className = `${fromApp.className} popout-root`;
  root.style.cssText = fromApp.style.cssText;
  // The main window's minimum width (every toolbar button showing) and size are its own, not the pop-out's.
  root.style.minWidth = '0';
  root.style.width = '';
  root.style.height = '';
  for (const [key, value] of Object.entries(fromApp.dataset)) root.dataset[key] = value;
  root.ownerDocument.documentElement.style.cssText = document.documentElement.style.cssText;
  root.ownerDocument.documentElement.lang = document.documentElement.lang;
}

/**
 * Opens a pop-out window named popout-<kind>-<n>. Resolves to { win, root, label } once its document holds a
 * root element with the app's look (class "app", theme variables, font), or null when that cannot be done.
 */
export async function openPopout(kind, extraClass = '') {
  const label = `popout-${kind}-${++seq}`.replace(/[^a-zA-Z0-9-]/g, '');
  let win = null;
  try { win = window.open(`about:blank#${label}`, label, 'popup=yes,width=400,height=300'); } catch { win = null; }
  if (!win) return null;
  const start = Date.now();
  while (!win.closed) {
    let doc = null;
    try { doc = win.document; } catch { doc = null; }
    if (doc?.body) break;
    if (Date.now() - start > 3000) { try { win.close(); } catch { /* gone */ } return null; }
    await wait(15);
  }
  if (win.closed) return null;
  const doc = win.document;
  const styles = [...document.querySelectorAll('style, link[rel=stylesheet]')].map((el) => {
    if (el.tagName === 'LINK') return `<link rel="stylesheet" href="${el.href}">`;
    return `<style>${el.textContent}</style>`;
  }).join('');
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>MyHeatManager</title>${styles}</head><body class="popout-body"><div id="popout-root"></div></body></html>`);
  doc.close();
  // Linked style sheets must load before the window is measured.
  const links = [...doc.querySelectorAll('link[rel=stylesheet]')];
  await Promise.race([Promise.all(links.map((link) => (link.sheet ? null : new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; })))), wait(1500)]);
  const root = doc.getElementById('popout-root');
  const fromApp = document.querySelector('.app') ?? document.body;
  copyAppearance(fromApp, root);
  if (extraClass) root.classList.add(...extraClass.split(' '));
  const observer = new MutationObserver(() => {
    try { if (!win.closed) { copyAppearance(fromApp, root); if (extraClass) root.classList.add(...extraClass.split(' ')); } } catch { observer.disconnect(); }
  });
  observer.observe(fromApp, { attributes: true, attributeFilter: ['style', 'class', 'data-theme', 'data-theme-mode'] });
  // Windows moves the window by the CSS app-region of its title row; macOS and Linux are asked to.
  doc.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || navigator.userAgent.includes('Windows')) return;
    if (!event.target.closest?.('.popup-title') || event.target.closest('button, input, select, a')) return;
    event.preventDefault();
    invoke('drag_popout', { label }).catch(() => {});
  });
  const popout = { win, root, label, observer };
  open.add(popout);
  return popout;
}

/** Sizes and shows the window: centred over the main window, or with its top-left at the page point (x, y). */
export async function placePopout(popout, { x = 0, y = 0, width, height, center = false, focus = true }) {
  // screenX / screenY are the client origin of the frameless main window, in CSS px (= logical px at zoom 1).
  const sx = window.screenX + x;
  const sy = window.screenY + y;
  await invoke('place_popout', { label: popout.label, x: sx, y: sy, width: Math.ceil(width), height: Math.ceil(height), center, focus }).catch(() => false);
  if (focus) { try { popout.win.focus(); } catch { /* gone */ } }
}

/** Documents of the open pop-out windows (tests look for dialogs there). */
export function popoutDocuments() {
  return [...open].filter((p) => !p.win.closed).map((p) => p.win.document);
}

export function hidePopout(popout) {
  if (popout) invoke('hide_popout', { label: popout.label }).catch(() => {});
}

export function closePopout(popout) {
  if (!popout) return;
  open.delete(popout);
  popout.observer.disconnect();
  invoke('close_popout', { label: popout.label }).catch(() => { try { popout.win.close(); } catch { /* gone */ } });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { for (const popout of [...open]) closePopout(popout); });
}

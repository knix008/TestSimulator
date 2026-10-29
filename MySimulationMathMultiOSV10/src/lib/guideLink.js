// Main window ↔ user-manual window: the look (theme tokens) and requests.
//
// Desktop: Tauri events (lib/popups broadcast / onBroadcast). Web: the manual
// is another browser tab, so a BroadcastChannel carries the messages (plus a
// window event for the same tab, where BroadcastChannel does not deliver).
//
// The look is the main window's *computed* theme — every --* token on the
// root element, data-theme and data-mode — so built-in, custom and previewed
// (not yet saved) themes all reach the manual exactly.
import { isDesktop } from './backend';
import { broadcast, onBroadcast } from './popups';

const CHANNEL = 'msm-guide';
const LOOK_KEY = 'msm.guide.look';
let bc = null;
const channel = () => {
  if (!bc && typeof BroadcastChannel !== 'undefined') { try { bc = new BroadcastChannel(CHANNEL); } catch { bc = null; } }
  return bc;
};

export function postGuide(type, payload) {
  if (isDesktop) return broadcast(type, payload).catch(() => {});
  try { window.dispatchEvent(new CustomEvent(type, { detail: payload })); } catch { /* no window */ }
  const c = channel();
  if (c) { try { c.postMessage({ type, payload }); } catch { /* closed */ } }
  return Promise.resolve();
}

/** Listens for a message; returns an unsubscribe function (sync). */
export function onGuide(type, fn) {
  if (isDesktop) {
    let off = null;
    let gone = false;
    onBroadcast(type, fn).then((u) => { if (gone) u(); else off = u; }).catch(() => {});
    return () => { gone = true; if (off) off(); };
  }
  const h = (e) => fn(e.detail);
  window.addEventListener(type, h);
  const c = channel();
  const m = (e) => { if (e.data && e.data.type === type) fn(e.data.payload); };
  if (c) c.addEventListener('message', m);
  return () => { window.removeEventListener(type, h); if (c) c.removeEventListener('message', m); };
}

/** The look of this window now: { theme, mode, tokens }. */
export function currentLook() {
  const root = document.documentElement;
  const tokens = {};
  for (let i = 0; i < root.style.length; i += 1) {
    const k = root.style[i];
    if (k.startsWith('--')) tokens[k] = root.style.getPropertyValue(k).trim();
  }
  return { theme: root.dataset.theme || '', mode: root.dataset.mode || 'dark', tokens };
}

export function applyLook(look) {
  if (!look || !look.tokens) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(look.tokens)) root.style.setProperty(k, v);
  if (look.theme) root.dataset.theme = look.theme;
  if (look.mode) { root.dataset.mode = look.mode; root.style.colorScheme = look.mode; }
}

export function storeLook(look = currentLook()) {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* storage blocked */ }
  return look;
}
export function storedLook() {
  try { return JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); } catch { return null; }
}

/** Main window: sends the look whenever the theme on the root element changes. */
export function watchLook() {
  let timer = null;
  const send = () => { clearTimeout(timer); timer = setTimeout(() => postGuide('msm-look', storeLook()), 60); };
  const mo = new MutationObserver(send);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'data-mode'] });
  storeLook();
  return () => { clearTimeout(timer); mo.disconnect(); };
}

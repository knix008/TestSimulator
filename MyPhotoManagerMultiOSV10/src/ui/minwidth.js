// The main window is never narrower than its widest visible toolbar: every button
// stays reachable. The minimum follows the toolbars as they change (view mode,
// a video's controls, the DICOM bar…); a window already narrower grows to fit.
import { invoke, isDesktop } from '../platform/native.js';

const TOOLBARS = '.app-header, .app-toolbar, .viewer-toolbar, .editor-toolbar';
const BASE = { width: 960, height: 600 }; // the window's own minimum (lib.rs)

/** Width of an element's own children, ignoring a stretched parent box. */
function contentWidth(el) {
  const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
  let width = 0;
  let count = 0;
  for (const child of el.children) {
    const cs = getComputedStyle(child);
    if (cs.display === 'none' || cs.position === 'absolute' || child.hidden) continue;
    count++;
    width += Math.max(child.getBoundingClientRect().width, child.scrollWidth);
  }
  return width + gap * Math.max(0, count - 1);
}

/** Width a single-row toolbar needs to show all of its children. */
export function naturalWidth(bar) {
  const style = getComputedStyle(bar);
  const gap = parseFloat(style.columnGap) || 0;
  const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  let width = pad;
  let count = 0;
  let sideMax = 0;
  let zoomWidth = 0;
  for (const child of bar.children) {
    const cs = getComputedStyle(child);
    if (cs.display === 'none' || child.hidden) continue;
    if (child.classList.contains('editor-zoom')) {
      zoomWidth = Math.max(child.getBoundingClientRect().width, child.scrollWidth);
      continue;
    }
    if (cs.position === 'absolute') continue;
    count++;
    if (child.classList.contains('editor-bar-side')) {
      const inner = contentWidth(child);
      sideMax = Math.max(sideMax, inner);
      width += inner;
      continue;
    }
    // Stretching parts (spacers, the address box) count with their minimum only.
    width += Number(cs.flexGrow) > 0 ? parseFloat(cs.minWidth) || 0 : Math.max(child.getBoundingClientRect().width, child.scrollWidth);
  }
  // Margins are left out: centring uses auto margins, which grow with the window.
  width = Math.ceil(width + gap * Math.max(0, count - 1)) + 8;
  // The edit zoom is centred, so each side needs room for the wider side plus half the zoom.
  if (zoomWidth) width = Math.max(width, Math.ceil(zoomWidth + sideMax * 2 + pad) + 8);
  return width;
}

/** The widest visible toolbar. */
export function neededWidth(root = document) {
  let need = 0;
  for (const bar of root.querySelectorAll(TOOLBARS)) {
    if (!bar.offsetParent && getComputedStyle(bar).position !== 'fixed') continue; // not shown
    need = Math.max(need, naturalWidth(bar));
  }
  return need;
}

let applied = 0;
let timer = null;

function apply() {
  timer = null;
  const width = Math.max(BASE.width, neededWidth());
  if (width === applied) return;
  applied = width;
  if (!isDesktop()) return;
  invoke('plugin:window|set_min_size', { label: 'main', value: { Logical: { width, height: BASE.height } } }).catch(() => {});
  if (window.innerWidth < width) invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width, height: window.innerHeight } } }).catch(() => {});
}

/** Watches the toolbars and keeps the window's minimum width in step. */
export function watchMinWidth() {
  const later = () => { clearTimeout(timer); timer = setTimeout(apply, 120); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  document.fonts?.ready.then(later);
  later();
  return { current: () => applied, apply };
}

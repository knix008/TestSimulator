// Small DOM helpers shared by the views.
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const attr = escapeHtml;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const isMac = /Mac/i.test(globalThis.navigator?.platform ?? '');
export const keyLabel = (key) => (isMac ? key.replace('Ctrl+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥') : key);

/** Runs `fn` at most once per animation frame. */
export function frameThrottle(fn) {
  let scheduled = false;
  let lastArgs = [];
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
}

/** Starts a pointer drag: move(dx, dy, event) on each move, end(event, moved) when released. */
export function pointerDrag(event, { move, end, threshold = 3, cursor = '' }) {
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  const target = event.currentTarget ?? event.target;
  try { target.setPointerCapture?.(event.pointerId); } catch { /* synthetic event */ }
  if (cursor) document.body.style.cursor = cursor;
  const onMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < threshold) return;
    moved = true;
    move?.(dx, dy, e);
  };
  const onUp = (e) => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    document.body.style.cursor = '';
    end?.(e, moved);
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
}

/** Text width in px of `text` in the font of `element`. */
export function textWidth(text, element) {
  const canvas = textWidth.canvas ?? (textWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  context.font = getComputedStyle(element).font;
  return context.measureText(text).width;
}

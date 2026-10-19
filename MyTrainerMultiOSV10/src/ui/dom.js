// Small DOM helpers shared by the views.
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Starts a pointer drag: move(event, dx, dy) on every move, end(event, moved) once released. */
export function dragPointer(event, { move, end }) {
  const sx = event.clientX;
  const sy = event.clientY;
  let moved = false;
  const onMove = (e) => {
    moved ||= Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 2;
    move?.(e, e.clientX - sx, e.clientY - sy);
  };
  const onUp = (e) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    end?.(e, moved);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/** Calls fn at most once per animation frame. */
export function throttleFrame(fn) {
  let pending = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(...lastArgs); });
  };
}

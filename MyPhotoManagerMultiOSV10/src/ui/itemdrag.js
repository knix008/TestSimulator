// Pointer drag of files and folders inside the window, and — on the desktop —
// an OS file drag once the pointer leaves the window.
import { plural, t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { errorText, isDesktop, startFileDrag } from '../platform/native.js';
import { toast } from './dialog.js';
import { h } from './dom.js';
import { icon } from './icons.js';

let sink = null;

/** Where an internal drop lands (a folder path, the basket, or the map). */
export function setItemDropSink(fn) {
  sink = fn;
}

function atEdge(event) {
  return event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth - 1 || event.clientY >= window.innerHeight - 1;
}

/** Drag `paths`. Dropping on a `[data-drop]` target calls the sink; leaving the window drags the real files out. */
export function beginPointerDrag(paths, { onDrop = null, onExternal = null } = {}) {
  const ghost = h('div.drag-ghost', h('span', { html: icon('images') }), h('span', plural('drag.items', paths.length)));
  document.body.append(ghost);
  let target = null;
  let auto = 0;
  let external = false;
  let told = false;
  const setTarget = (el) => {
    if (target === el) return;
    target?.classList.remove('drop-target');
    target = el;
    target?.classList.add('drop-target');
  };
  const finish = () => {
    cancelAnimationFrame(auto);
    ghost.remove();
    setTarget(null);
    window.removeEventListener('pointerleave', leave);
  };
  const startExternal = () => {
    if (external) return;
    const real = paths.filter((path) => path && !fs.isReadOnly(path));
    if (!isDesktop()) return;
    if (!real.length) {
      if (!told) { told = true; toast(t('drag.readOnly'), 'info'); }
      return;
    }
    external = true;
    finish();
    onExternal?.();
    startFileDrag(real).catch((error) => toast(errorText(error) || t('drag.outFailed'), 'error'));
  };
  const leave = () => startExternal();
  window.addEventListener('pointerleave', leave);
  return {
    get external() { return external; },
    move(event) {
      if (external) return;
      ghost.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 10}px)`;
      ghost.classList.toggle('copy', event.ctrlKey || event.altKey);
      const under = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-drop]');
      setTarget(under && !paths.includes(under.dataset.drop) ? under : null);
      const scroller = document.querySelector('.filelist');
      cancelAnimationFrame(auto);
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const edge = event.clientY < rect.top + 30 ? -12 : event.clientY > rect.bottom - 30 && event.clientY < rect.bottom + 10 ? 12 : 0;
        if (edge) {
          const step = () => { scroller.scrollTop += edge; auto = requestAnimationFrame(step); };
          auto = requestAnimationFrame(step);
        }
      }
      if (atEdge(event) && !target) startExternal();
    },
    drop(event) {
      if (external) return;
      const el = target;
      finish();
      if (el) (onDrop ?? sink)?.(paths, el.dataset.drop, { copy: event.ctrlKey || event.altKey, x: event.clientX, y: event.clientY });
    },
  };
}

/** After the pointer moves `threshold` pixels, drag the paths from `getPaths()`. A drag swallows the following click. */
export function pressDrag(event, getPaths, { threshold = 8 } = {}) {
  const startX = event.clientX;
  const startY = event.clientY;
  const clickTarget = event.currentTarget;
  let dragging = null;
  const move = (e) => {
    if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) > threshold) {
      const paths = getPaths().filter(Boolean);
      if (!paths.length) return;
      dragging = beginPointerDrag(paths, {
        onExternal() {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        },
      });
    }
    dragging?.move(e);
  };
  const up = (e) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!dragging) return;
    dragging.drop(e);
    clickTarget?.addEventListener?.('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

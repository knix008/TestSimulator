import { t } from './i18n.js';

function resolveTooltipText(el) {
  if (!el) return '';
  const direct = el.getAttribute('data-tooltip');
  if (direct && direct.trim()) return direct;
  const key = el.getAttribute('data-i18n-tooltip');
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return el.getAttribute('title') || '';
}

/**
 * Custom tooltips for [data-tooltip] / [data-i18n-tooltip].
 * Pass document (or body) once — nested roots cause mouseleave races that hide tips.
 */
export function initTooltips(root = document) {
  const tip = document.getElementById('tooltip');
  if (!tip || !root) return () => {};

  // Ensure tooltip lives on body and paints above frameless chrome.
  if (tip.parentElement !== document.body) {
    document.body.appendChild(tip);
  }

  let activeEl = null;

  const hide = () => {
    tip.hidden = true;
    tip.textContent = '';
    tip.style.left = '';
    tip.style.top = '';
    activeEl = null;
  };

  const place = (clientX, clientY) => {
    const pad = 8;
    const rect = tip.getBoundingClientRect();
    let left = clientX + 14;
    let top = clientY + 18;
    if (left + rect.width + pad > window.innerWidth) {
      left = clientX - rect.width - 12;
    }
    if (top + rect.height + pad > window.innerHeight) {
      top = clientY - rect.height - 12;
    }
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  };

  const show = (el, text, clientX, clientY) => {
    if (!text) return;
    activeEl = el;
    tip.textContent = text;
    tip.hidden = false;
    tip.removeAttribute('hidden');
    // First pass may have 0 size while hidden; place twice after layout.
    place(clientX, clientY);
    requestAnimationFrame(() => {
      if (activeEl === el && !tip.hidden) place(clientX, clientY);
    });
  };

  const onMove = (e) => {
    const el = e.target?.closest?.('[data-tooltip], [data-i18n-tooltip]');
    if (!el || (root !== document && root !== document.body && !root.contains(el))) {
      if (activeEl) hide();
      return;
    }
    const text = resolveTooltipText(el);
    if (!text) {
      if (activeEl) hide();
      return;
    }
    show(el, text, e.clientX, e.clientY);
  };

  const onLeave = (e) => {
    const next = e.relatedTarget;
    if (next && (root === document || root === document.body || root.contains(next))) {
      return;
    }
    hide();
  };

  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('mousemove', onMove, { passive: true });
  root.addEventListener('mouseleave', onLeave);
  root.addEventListener('mousedown', hide);
  window.addEventListener('blur', hide);

  return () => {
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('mousemove', onMove);
    root.removeEventListener('mouseleave', onLeave);
    root.removeEventListener('mousedown', hide);
    window.removeEventListener('blur', hide);
    hide();
  };
}

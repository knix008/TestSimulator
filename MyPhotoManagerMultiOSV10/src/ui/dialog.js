// Modal dialogs, toasts and progress.
//
// Desktop: every dialog is its own top-level window (window.open → a fixed-size
// Tauri window owned by the main one, with the app icon and the dialog title in
// the system title bar). The dialog's DOM lives in that window's document but is
// built and driven from here, so all dialog code works unchanged. The main
// window is covered by a shield while a dialog is open (modal).
// Web: dialogs are drawn over the page (browsers block or misplace popups).
import { t } from '../i18n.js';
import { invoke, isDesktop } from '../platform/native.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { wrapNumber } from './steppers.js';

const stack = [];
const windows = new Set(); // open dialog windows (Window objects)

const useWindows = () => isDesktop() && !globalThis.__myphotoInlineDialogs;
let windowSeq = 0;

/** Closes a dialog window: the page's window.close() only ends its webview, the backend removes the window. */
function closeWindow(win) {
  const label = win.__dialogLabel;
  if (!win.closed) win.close();
  if (label) invoke('close_dialog_window', { label }).catch(() => {});
}

// ───────────────────────── dialog windows

/** Copies the page's styles and theme into a dialog window's document. */
function dressWindow(win, title) {
  const doc = win.document;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><title></title></head><body class="dialog-window"></body></html>');
  doc.close();
  doc.title = title;
  // Every rule the page has (style/link elements and constructed sheets alike).
  const css = [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])].map((sheet) => {
    try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); } catch { return sheet.href ? `@import url("${sheet.href}");` : ''; }
  }).join('\n');
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.append(style);
  syncTheme(doc);
}

function syncTheme(doc) {
  const from = document.documentElement;
  const to = doc.documentElement;
  to.lang = from.lang;
  to.style.cssText = from.style.cssText;
  for (const name of ['data-theme', 'data-theme-id']) {
    if (from.hasAttribute(name)) to.setAttribute(name, from.getAttribute(name)); else to.removeAttribute(name);
  }
}

// Theme changes (also the live preview of the custom theme) reach open dialog windows.
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver(() => { for (const win of windows) if (!win.closed) syncTheme(win.document); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'data-theme-id', 'lang'] });
}

/** Size the dialog needs (laid out off-screen in the page). */
function measure(box) {
  const probe = h('div.dialog-measure', box);
  document.body.append(probe);
  const rect = box.getBoundingClientRect();
  const head = box.querySelector(':scope > .dialog-head')?.getBoundingClientRect().height ?? 0; // the window's title bar replaces it
  probe.remove();
  return { width: Math.ceil(rect.width), height: Math.ceil(rect.height - head + 12) };
}

function openWindow(box, title) {
  const { width, height } = measure(box);
  const w = Math.min(width, screen.availWidth - 40);
  const hgt = Math.min(height, screen.availHeight - 80);
  const left = Math.round(window.screenX + Math.max(0, (window.outerWidth - w) / 2));
  const top = Math.round(window.screenY + Math.max(40, (window.outerHeight - hgt) / 2.4));
  // The fragment names the Tauri window, so it can be closed for good (closeWindow).
  const label = `dialog-${Date.now().toString(36)}-${(windowSeq += 1)}`;
  const win = window.open(`about:blank#${label}`, '', `popup=yes,width=${w},height=${hgt},left=${left},top=${top}`);
  if (!win) return null;
  win.__dialogLabel = label;
  try {
    dressWindow(win, title);
  } catch {
    win.close();
    return null;
  }
  box.classList.add('in-window');
  win.document.body.append(box);
  for (const input of box.querySelectorAll('input[type=number]')) wrapNumber(input);
  windows.add(win);
  // Off-screen measuring can come out a little short (fonts, wrapped inputs): if the
  // content is taller than the window once it is there, grow the window to fit.
  const fit = () => {
    if (win.closed) return;
    const need = Math.min(Math.max(box.scrollHeight, win.document.documentElement.scrollHeight), screen.availHeight - 80);
    if (need - win.innerHeight <= 1) return;
    invoke('plugin:window|set_size', { label, value: { Logical: { width: win.innerWidth, height: need } } }).catch(() => win.resizeTo(win.outerWidth, win.outerHeight + need - win.innerHeight));
  };
  // Late layout (fonts, printer lists, images) can still make it taller: keep watching.
  new win.ResizeObserver(() => fit()).observe(box);
  win.document.fonts?.ready.then(fit);
  return win;
}

/** Documents that may hold dialogs (the page and every open dialog window) — tests use it. */
export function dialogDocuments() {
  return [document, ...[...windows].filter((win) => !win.closed).map((win) => win.document)];
}

// ───────────────────────── dialogs

/**
 * Opens a modal dialog. `buttons`: [{ label, value, primary, danger }].
 * Resolves with the clicked button's value (null for Esc / × / closing the window).
 * `onSubmit(value)` may return false to keep the dialog open (validation).
 * `delay` (ms): show only if still open by then (progress of quick work never flashes).
 */
export function openDialog({ title, body, buttons = [{ label: t('common.ok'), value: true, primary: true }], width = 460, className = '', onOpen, onSubmit, closable = true, id, delay = 0 }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    let win = null;
    let shown = false;
    let closed = false;
    let watch = null;
    let shield = null;
    const close = async (value) => {
      if (closed) return;
      if (value !== null && value !== undefined && onSubmit && (await onSubmit(value)) === false) return;
      closed = true;
      clearInterval(watch);
      clearTimeout(timer);
      overlay.remove();
      shield?.remove();
      if (win) { windows.delete(win); win.document.removeEventListener('keydown', onKey, true); closeWindow(win); }
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1); // never splice(-1): that would drop another dialog
      document.removeEventListener('keydown', onKey, true);
      if (previous instanceof HTMLElement) previous.focus?.();
      resolve(value);
    };
    const footer = h('div.dialog-buttons', buttons.map((spec) => h(`button.btn${spec.primary ? '.primary' : ''}${spec.danger ? '.danger' : ''}`, {
      type: 'button', onclick: () => close(spec.value), dataset: { value: String(spec.value) },
    }, spec.label)));
    const box = h(`div.dialog${className ? `.${className}` : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: typeof width === 'number' ? `min(${width}px, calc(100vw - 32px))` : width }, id },
      h('div.dialog-head', h('span.dialog-icon', { html: icon('images') }), h('div.dialog-title', title), closable ? h('button.tool.dialog-close', { type: 'button', title: t('common.close'), html: icon('close'), onclick: () => close(null) }) : null),
      h('div.dialog-body', body),
      buttons.length ? footer : null);
    const overlay = h('div.dialog-overlay', box);
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay && closable) close(null); });
    const onKey = (event) => {
      if (stack[stack.length - 1] !== entry) return;
      if (event.key === 'Escape' && closable) { event.preventDefault(); event.stopPropagation(); close(null); return; }
      if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLButtonElement) && !event.target?.closest?.('.swatches')) {
        const primary = buttons.find((b) => b.primary);
        if (primary) { event.preventDefault(); event.stopPropagation(); close(primary.value); }
      }
    };
    const entry = { overlay, close, box, get window() { return win; } };
    stack.push(entry);
    document.addEventListener('keydown', onKey, true);

    const focusFirst = () => {
      const focus = box.querySelector('[autofocus], input:not([type=hidden]):not([disabled]):not(.swatch-native), select, textarea, .btn.primary');
      focus?.focus();
      if (focus instanceof HTMLInputElement && focus.type === 'text') focus.select();
    };
    const show = () => {
      if (closed || shown) return;
      shown = true;
      if (useWindows()) win = openWindow(box, title);
      if (win) {
        // Keys typed in the dialog window: Esc / Enter here, then the page's own
        // listeners (e.g. the shortcut editor capturing a key) get a copy.
        win.document.addEventListener('keydown', onKey, true);
        win.document.addEventListener('keydown', (event) => {
          if (event.defaultPrevented) return;
          const copy = new KeyboardEvent('keydown', { key: event.key, code: event.code, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, bubbles: true, cancelable: true });
          document.dispatchEvent(copy);
          if (copy.defaultPrevented) event.preventDefault();
        });
        shield = h('div.dialog-shield', { onpointerdown: () => win?.focus() });
        document.body.append(shield);
        watch = setInterval(() => { if (win.closed) close(closable ? null : undefined); }, 250);
        win.focus();
      } else {
        box.classList.remove('in-window');
        document.body.append(overlay);
      }
      onOpen?.(box, close);
      requestAnimationFrame(focusFirst);
    };
    const timer = delay ? setTimeout(show, delay) : null;
    if (!delay) show();
    else if (!useWindows()) show(); // in the page a progress bar may appear at once
  });
}

export const dialogOpen = () => stack.length > 0;
export function closeAllDialogs() { for (const entry of [...stack].reverse()) entry.close(null); }
/** The topmost dialog box (in the page or in its window). */
export const topDialog = () => stack.at(-1)?.box ?? null;

export function alertDialog(message, title = t('app.name')) {
  return openDialog({ title, body: h('p.dialog-message', message) });
}

export async function confirmDialog(message, { title = t('app.name'), ok = t('common.ok'), cancel = t('common.cancel'), danger = false, detail } = {}) {
  const value = await openDialog({
    title,
    body: h('div', h('p.dialog-message', message), detail ? h('p.dialog-detail', detail) : null),
    buttons: [{ label: cancel, value: false }, { label: ok, value: true, primary: true, danger }],
  });
  return value === true;
}

/** Text prompt; `validate(text)` returns an error message or null. */
export async function promptDialog(label, value = '', { title = t('app.name'), ok = t('common.ok'), validate, selectStem = false } = {}) {
  const input = h('input.input', { type: 'text', value, spellcheck: false });
  const error = h('div.field-error');
  const result = await openDialog({
    title,
    body: h('label.field', h('span.field-label', label), input, error),
    buttons: [{ label: t('common.cancel'), value: false }, { label: ok, value: true, primary: true }],
    onOpen: () => {
      if (selectStem) requestAnimationFrame(() => { const dot = input.value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : input.value.length); });
    },
    onSubmit: (v) => {
      if (!v) return true;
      const problem = validate?.(input.value);
      error.textContent = problem ?? '';
      return !problem;
    },
  });
  return result === true ? input.value : null;
}

// ───────────────────────── toasts

let toastHost = null;
export function toast(message, kind = 'info', ms = 3200) {
  if (!toastHost) { toastHost = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const el = h(`div.toast.${kind}`, h('span', { html: icon(kind === 'error' ? 'warning' : kind === 'success' ? 'check' : 'info') }), h('span.toast-text', message));
  toastHost.append(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); }, ms);
}

// ───────────────────────── progress

/**
 * Progress: { update(done, total, text), close(), cancelled }. Shown in the
 * status bar at once and, when the work takes longer, in a dialog window.
 */
export function progressDialog(title, { cancellable = true } = {}) {
  const bar = h('div.progress-bar', h('div.progress-fill'));
  const label = h('div.progress-label', '');
  const count = h('div.progress-count', '');
  const state = { cancelled: false };
  let closeFn = null;
  const task = statusProgress.start(title);
  openDialog({
    title,
    body: h('div.progress', label, bar, count),
    buttons: cancellable ? [{ label: t('common.cancel'), value: 'cancel' }] : [],
    closable: false,
    delay: 400,
    onOpen: (box, close) => { closeFn = close; },
  }).then((value) => { if (value === 'cancel') state.cancelled = true; });
  let closing = false;
  return {
    get cancelled() { return state.cancelled; },
    update(done, total, text) {
      bar.firstChild.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
      count.textContent = total ? `${done} / ${total}` : '';
      if (text != null) label.textContent = text;
      task.update(done, total, text);
    },
    close() {
      if (closing) return;
      closing = true;
      task.done();
      if (closeFn) closeFn(undefined);
      else { const entry = stack.find((e) => e.box.contains(bar)); entry?.close(undefined); }
    },
  };
}

/**
 * Background work shown in the status bar (thumbnails, loading a big picture,
 * progress dialogs): start(title) → { update(done, total, text), done() }.
 * The app draws `statusProgress.current()` (see onChange).
 */
export const statusProgress = (() => {
  const tasks = new Set();
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    start(title) {
      const task = { title, done: 0, total: 0, text: '' };
      tasks.add(task);
      emit();
      return {
        update(done, total, text) { Object.assign(task, { done, total, text: text ?? task.text }); emit(); },
        done() { tasks.delete(task); emit(); },
      };
    },
    /** The newest running task or null. */
    current() { return [...tasks].at(-1) ?? null; },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
})();

/** Labeled form field. */
export function field(label, control, hint) {
  return h('label.field', h('span.field-label', label), control, hint ? h('span.field-hint', hint) : null);
}

export function selectEl(options, value, onchange) {
  const select = h('select.input', { onchange: (e) => onchange?.(e.target.value) }, options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
  return select;
}

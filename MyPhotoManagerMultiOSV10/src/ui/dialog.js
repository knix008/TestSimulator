// Modal dialogs, toasts and progress.
import { t } from '../i18n.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const stack = [];

/**
 * Opens a modal dialog. `buttons`: [{ label, value, primary, danger }].
 * Resolves with the clicked button's value (null for Esc / ×).
 * `onSubmit(value)` may return false to keep the dialog open (validation).
 */
export function openDialog({ title, body, buttons = [{ label: t('common.ok'), value: true, primary: true }], width = 460, className = '', onOpen, onSubmit, closable = true, id }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const close = async (value) => {
      if (value !== null && onSubmit && (await onSubmit(value)) === false) return;
      overlay.remove();
      stack.splice(stack.indexOf(entry), 1);
      document.removeEventListener('keydown', onKey, true);
      if (previous instanceof HTMLElement) previous.focus?.();
      resolve(value);
    };
    const footer = h('div.dialog-buttons', buttons.map((spec) => h(`button.btn${spec.primary ? '.primary' : ''}${spec.danger ? '.danger' : ''}`, {
      type: 'button', onclick: () => close(spec.value), dataset: { value: String(spec.value) },
    }, spec.label)));
    const box = h(`div.dialog${className ? `.${className}` : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: typeof width === 'number' ? `min(${width}px, calc(100vw - 32px))` : width }, id },
      h('div.dialog-head', h('div.dialog-title', title), closable ? h('button.tool.dialog-close', { type: 'button', title: t('common.close'), html: icon('close'), onclick: () => close(null) }) : null),
      h('div.dialog-body', body),
      buttons.length ? footer : null);
    const overlay = h('div.dialog-overlay', box);
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay && closable) close(null); });
    const onKey = (event) => {
      if (stack[stack.length - 1] !== entry) return;
      if (event.key === 'Escape' && closable) { event.preventDefault(); event.stopPropagation(); close(null); }
      if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLButtonElement)) {
        const primary = buttons.find((b) => b.primary);
        if (primary) { event.preventDefault(); event.stopPropagation(); close(primary.value); }
      }
    };
    const entry = { overlay, close };
    stack.push(entry);
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    onOpen?.(box, close);
    requestAnimationFrame(() => {
      const focus = box.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, .btn.primary');
      focus?.focus();
      if (focus instanceof HTMLInputElement && focus.type === 'text') focus.select();
    });
  });
}

export const dialogOpen = () => stack.length > 0;
export function closeAllDialogs() { for (const entry of [...stack].reverse()) entry.close(null); }

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

/** Progress dialog: { update(done, total, text), close(), cancelled }. */
export function progressDialog(title, { cancellable = true } = {}) {
  const bar = h('div.progress-bar', h('div.progress-fill'));
  const label = h('div.progress-label', '');
  const count = h('div.progress-count', '');
  const state = { cancelled: false };
  let closeFn = null;
  openDialog({
    title,
    body: h('div.progress', label, bar, count),
    buttons: cancellable ? [{ label: t('common.cancel'), value: 'cancel' }] : [],
    closable: false,
    onOpen: (box, close) => { closeFn = close; },
  }).then((value) => { if (value === 'cancel') state.cancelled = true; });
  return {
    get cancelled() { return state.cancelled; },
    update(done, total, text) {
      bar.firstChild.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
      count.textContent = total ? `${done} / ${total}` : '';
      if (text != null) label.textContent = text;
    },
    close() { closeFn?.(undefined); },
  };
}

/** Labeled form field. */
export function field(label, control, hint) {
  return h('label.field', h('span.field-label', label), control, hint ? h('span.field-hint', hint) : null);
}

export function selectEl(options, value, onchange) {
  const select = h('select.input', { onchange: (e) => onchange?.(e.target.value) }, options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
  return select;
}

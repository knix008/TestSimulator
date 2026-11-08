// Dialogs drawn like MyUMLMaker's popup windows (.popup, .popup-head, .popup-body, .popup-foot).
// On the desktop every dialog is a window of its own (ui/winbridge.js, dialogwindow.js): the
// question helpers below open one and wait for its answer. In the browser they are layers over the
// page. The head moves the dialog (the window); Esc and × cancel; Enter presses the default button.
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { runInWindow, useWindows } from './winbridge.js';

const open = new Set();
export const dialogOpen = () => open.size > 0;

/**
 * Set by dialogwindow.js: the next dialog fills this window (its head moves the window) and
 * ready(box) gives the window the dialog's size and shows it.
 */
let windowMode = null;
export function drawInWindow(mode) { windowMode = mode; }

/**
 * openDialog({ id, title, icon, body (html), width, buttons: [{ id, label, icon, primary, danger }], onMount(el, close), onButton(id, el) → false keeps it open })
 * Resolves with the id of the button that closed it ('cancel' for Esc / ×).
 */
export function openDialog({ id = 'dialog', title: rawTitle, icon: glyph = 'info', body = '', width = 520, height, buttons = [], onMount, onButton, className = '' }) {
  // Menu labels end in … ("Settings…"); the dialog's own title does not.
  const title = String(rawTitle ?? '').replace(/…$/, '');
  return new Promise((resolve) => {
    const mode = windowMode;
    windowMode = null;
    const overlay = document.createElement('div');
    overlay.className = `dialog-overlay ${mode ? 'in-window' : ''}`;
    overlay.innerHTML = `<section class="popup ${height ? '' : 'fit'} dialog ${className}" data-dialog="${escapeHtml(id)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" style="width:min(${width}px, calc(100vw - 24px));${height ? `height:min(${height}px, calc(100vh - 24px));` : ''}">
      <header class="popup-head" data-dialog-drag><h2>${icon(glyph)}<span>${escapeHtml(title)}</span></h2>
        <button type="button" class="window-button dialog-close" data-dialog-button="cancel" title="${escapeHtml(t('action.close'))}" aria-label="${escapeHtml(t('action.close'))}">${icon('winClose')}</button></header>
      <div class="popup-body">${body}</div>
      ${buttons.length ? `<footer class="popup-foot"><span class="grow"></span>${buttons.map((b) => `<button type="button" class="button ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-dialog-button="${escapeHtml(b.id)}" title="${escapeHtml(b.tip ?? b.label)}">${b.icon ? icon(b.icon) : ''}<span>${escapeHtml(b.label)}</span></button>`).join('')}</footer>` : ''}
    </section>`;
    document.body.appendChild(overlay);
    const box = overlay.querySelector('.popup');
    const previous = document.activeElement;
    open.add(overlay);

    const close = (result) => {
      if (!overlay.isConnected) return;
      overlay.remove();
      open.delete(overlay);
      document.removeEventListener('keydown', onKey, true);
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
      resolve(result);
    };
    const press = async (buttonId) => {
      if (onButton && buttonId !== 'cancel' && (await onButton(buttonId, box, close)) === false) return;
      close(buttonId);
    };
    const onKey = (event) => {
      if (![...open].pop() || [...open].pop() !== overlay) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close('cancel'); }
      if (event.key === 'Enter' && !event.isComposing && !(event.target instanceof HTMLTextAreaElement) && !event.target.closest?.('.cm-editor')) {
        const primary = buttons.find((b) => b.primary);
        if (primary && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); press(primary.id); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => {
      const button = event.target.closest('[data-dialog-button]');
      if (button && box.contains(button)) press(button.dataset.dialogButton);
    });

    // The head moves the dialog (in a window of its own: the window).
    box.querySelector('[data-dialog-drag]').addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      if (mode) { mode.drag(); return; }
      const rect = box.getBoundingClientRect();
      const dx = event.clientX - rect.left;
      const dy = event.clientY - rect.top;
      const move = (e) => {
        box.style.position = 'fixed';
        box.style.margin = '0';
        box.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dx))}px`;
        box.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dy))}px`;
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    onMount?.(box, close);
    const first = box.querySelector('[autofocus]') ?? box.querySelector('.popup-body input, .popup-body select, .popup-body textarea') ?? box.querySelector('.button.primary');
    requestAnimationFrame(() => {
      mode?.ready(box, { width, height });
      first?.focus();
      if (first?.select && first.type !== 'checkbox') first.select();
    });
  });
}

export async function renderConfirm({ title, message, detail = '', icon: glyph = 'question', yes = t('action.ok'), no = t('action.cancel'), extra = null, danger = false }) {
  const buttons = [
    ...(extra ? [{ id: 'extra', label: extra.label, icon: extra.icon, danger: extra.danger }] : []),
    { id: 'no', label: no, icon: 'close' },
    { id: 'yes', label: yes, icon: danger ? 'trash' : 'check', primary: true, danger },
  ];
  return openDialog({
    id: 'confirm', title, icon: glyph, width: 470, buttons,
    body: `<div class="confirm-message">${icon(glyph, `icon big ${danger ? 'danger-text' : ''}`)}<div><p><b>${escapeHtml(message)}</b></p>${detail ? `<p class="muted">${escapeHtml(detail)}</p>` : ''}</div></div>`,
  });
}

export async function renderAlert({ title, message, detail = '', icon: glyph = 'info', error = false }) {
  await openDialog({
    id: error ? 'error' : 'alert', title, icon: error ? 'error' : glyph, width: 470, className: error ? 'popup-error' : '',
    buttons: [{ id: 'ok', label: t('action.ok'), icon: 'check', primary: true }],
    body: `<div class="confirm-message">${icon(error ? 'error' : glyph, `icon big ${error ? 'danger-text' : ''}`)}<div><p><b>${escapeHtml(message)}</b></p>${detail ? `<p class="muted dialog-detail">${escapeHtml(detail)}</p>` : ''}</div></div>`,
  });
}

/** fields: [{ id, label, icon, type ('text'|'number'|'select'|'checkbox'), value, options: [[value, label]], min, max }] → values or null. */
export async function renderForm({ title, icon: glyph = 'edit', fields, ok = t('action.ok'), width = 480, note = '' }) {
  let values = null;
  const field = (f) => {
    const control = f.type === 'select'
      ? `<select data-field="${f.id}">${f.options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(f.value) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`
      : f.type === 'checkbox'
        ? `<label class="switch-wrap"><input type="checkbox" data-field="${f.id}" ${f.value ? 'checked' : ''}/><span class="switch"></span></label>`
        : `<input data-field="${f.id}" type="${f.type ?? 'text'}" value="${escapeHtml(f.value ?? '')}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} placeholder="${escapeHtml(f.placeholder ?? '')}" ${f.autofocus ? 'autofocus' : ''}/>`;
    return `<div class="row"><span class="row-label">${icon(f.icon ?? 'edit')}<span>${escapeHtml(f.label)}</span></span><span class="row-control">${control}</span></div>`;
  };
  const result = await openDialog({
    id: 'form', title, icon: glyph, width,
    body: `<div class="form-rows" style="--label-col: 150px">${fields.map(field).join('')}</div>${note ? `<p class="muted form-note">${escapeHtml(note)}</p>` : ''}`,
    buttons: [{ id: 'cancel', label: t('action.cancel'), icon: 'close' }, { id: 'ok', label: ok, icon: 'check', primary: true }],
    onButton: (id, box) => {
      if (id !== 'ok') return true;
      values = {};
      for (const f of fields) {
        const el = box.querySelector(`[data-field="${f.id}"]`);
        values[f.id] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? Number(el.value) : el.value;
      }
      return true;
    },
  });
  return result === 'ok' ? values : null;
}

// ───────────────────────── the questions the app asks: a window of their own on the desktop

/** "Save the changes?" and the like → 'yes' | 'no' | 'extra' | 'cancel'. */
export function confirmDialog(params) {
  return useWindows() ? runInWindow('confirm', params, { title: params.title, width: 470, height: 200 }) : renderConfirm(params);
}

export function alertDialog(params) {
  return useWindows() ? runInWindow('alert', params, { title: params.title, width: 470, height: 200 }) : renderAlert(params);
}

/** A small form (link, table size, go to line …) → its values, or null when cancelled. */
export function formDialog(params) {
  return useWindows() ? runInWindow('form', params, { title: params.title, width: params.width ?? 480, height: 240 }) : renderForm(params);
}

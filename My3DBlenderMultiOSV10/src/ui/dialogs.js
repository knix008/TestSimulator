// Dialogs. On the desktop they are windows of their own (src/platform/popout.js), on the web they float in the page;
// the content is the same DOM. Errors are selectable text with a copy button.
import { h, clear, gripDots } from './dom.js';
import { startResize } from '../platform/native.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { button } from './widgets.js';
import { closePopout, openPopout, placePopout, popoutsEnabled } from '../platform/popout.js';

const openDialogs = new Set();
export const dialogDocuments = () => [document, ...[...openDialogs].map((d) => d.doc).filter(Boolean)];
/** Finds an element in the page or in any open dialog window. */
export function queryAll(selector) {
  for (const doc of dialogDocuments()) {
    const found = doc.querySelector(selector);
    if (found) return found;
  }
  return null;
}

/** Opens a dialog; returns { close, body, root }. `id`: an open dialog of the same id comes to the front instead. */
export async function openDialog({ id, title, icon: name, width = 480, height = 400, body, actions = null, onClose = null, modal = true }) {
  const existing = id && [...openDialogs].find((d) => d.id === id);
  if (existing) { existing.focus(); return existing; }
  const content = h('div', { className: 'dialog-body' }, body);
  const footer = actions ? h('div', { className: 'dialog-actions' }, actions) : null;
  const dialog = { id, closed: false };
  const close = () => {
    if (dialog.closed) return;
    dialog.closed = true;
    openDialogs.delete(dialog);
    onClose?.();
    if (dialog.popout) closePopout(dialog.popout);
    else dialog.backdrop?.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  const head = h('header', { className: 'popup-title' },
    h('span', { className: 'popup-heading' }, name ? icon(name, 15) : null, h('strong', null, title)),
    h('button', { type: 'button', className: 'popup-close', title: t('Close', '닫기'), dataset: { testid: 'dialog-close' }, onClick: close }, icon('close', 13)));
  const box = h('div', { className: 'popup', role: 'dialog', dataset: { testid: id ? `dialog-${id}` : 'dialog' } }, head, content, footer);
  Object.assign(dialog, { close, body: content, root: box, focus: () => { if (dialog.popout) { try { dialog.popout.win.focus(); } catch { /* gone */ } } } });
  openDialogs.add(dialog);
  if (popoutsEnabled()) {
    const popout = await openPopout(`dialog-${id ?? 'x'}`, 'dialog-window');
    if (popout) {
      dialog.popout = popout;
      dialog.doc = popout.win.document;
      box.style.width = '100%';
      box.style.height = '100%';
      // A window of its own has no frame: the size grip goes in its bottom right corner.
      box.append(h('span', { className: 'size-grip popup-grip', title: t('Drag to resize the window', '끌어서 창 크기 조절'), dataset: { testid: 'dialog-grip' }, onPointerdown: (e) => { if (e.button === 0) { e.preventDefault(); startResize(popout.label); } } }, gripDots()));
      popout.root.append(box);
      popout.win.addEventListener('keydown', onKey, true);
      popout.win.addEventListener('pagehide', () => { if (!dialog.closed) close(); });
      await placePopout(popout, { width, height, center: true });
      return dialog;
    }
  }
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
  dialog.backdrop = h('div', { className: `popup-backdrop${modal ? '' : ' modeless'}`, onPointerdown: (e) => { if (e.target === dialog.backdrop && modal) close(); } }, box);
  document.querySelector('.app').append(dialog.backdrop);
  document.addEventListener('keydown', onKey, true);
  return dialog;
}

export function closeAllDialogs() {
  for (const d of [...openDialogs]) d.close();
}

/** An error the user can read and copy. Never blocks the program. */
export function showError(title, detail) {
  const text = String(detail ?? '');
  const pre = h('pre', { className: 'error-text', dataset: { testid: 'error-text' } }, text);
  return openDialog({
    title, icon: 'ed-info', width: 560, height: 320, body: pre,
    actions: [button(t('Copy', '복사'), () => navigator.clipboard?.writeText(text), { testid: 'error-copy' })],
  });
}

/** A yes / no question. Resolves to the id of the pressed button, or null. */
export function ask({ title, message, buttons }) {
  return new Promise((resolve) => {
    let result = null;
    let dialog;
    openDialog({
      title, width: 440, height: 170, body: h('p', { className: 'ask-text' }, message),
      actions: buttons.map(([id, label, primary]) => button(label, () => { result = id; dialog?.close(); }, { className: primary ? 'primary' : '', testid: `ask-${id}` })),
      onClose: () => resolve(result),
    }).then((d) => { dialog = d; });
  });
}

/** A progress dialog with cancel. */
export function progressDialog(title, onCancel) {
  const fill = h('div', { className: 'progress-fill', style: { width: '0%' } });
  const label = h('div', { className: 'progress-label', dataset: { testid: 'progress-label' } }, '');
  let dialog;
  const ready = openDialog({
    id: 'progress', title, width: 420, height: 150,
    body: [h('div', { className: 'progress-track' }, fill), label],
    actions: onCancel ? [button(t('Cancel', '취소'), () => { onCancel(); }, { testid: 'progress-cancel' })] : null,
  }).then((d) => { dialog = d; });
  return {
    set(fraction, text) { fill.style.width = `${Math.round(fraction * 100)}%`; if (text != null) clear(label).append(text); },
    close: () => ready.then(() => dialog?.close()),
  };
}

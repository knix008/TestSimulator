// The app's own right-click menu for text: in text fields (Undo, Cut, Copy, Paste,
// Delete, Select all) and for selected text anywhere (Copy). It replaces the
// webview's native menu, so every context menu in MyCapture is the same menu window
// with colour icons. The menu window takes the focus, so the field and its selection
// are remembered when the menu opens and put back before a command runs.
import { t } from './i18n.js';

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password', 'number', '']);

/** The text field under `target` (input of a text type, or textarea), or null. */
export function textFieldOf(target) {
  const field = target?.closest?.('input, textarea');
  if (!field) return null;
  if (field.tagName === 'TEXTAREA') return field;
  return TEXT_TYPES.has((field.getAttribute('type') ?? '').toLowerCase()) ? field : null;
}

/** The selected text outside text fields, or ''. */
export const pageSelection = (doc = globalThis.document) => String(doc?.getSelection?.() ?? '').trim();

let saved = null; // { field, key, start, end, selection }

/** How to find a field again if the page rebuilt it while the menu was open. */
const fieldKey = (field) => (field.dataset?.input ? `[data-input="${field.dataset.input}"]` : field.id ? `#${field.id}` : field.className ? `.${String(field.className).trim().split(/\s+/)[0]}` : '');

/** Remembers what the menu will act on: the field and its selection, or the page selection. */
export function rememberTarget(target, doc = globalThis.document) {
  const field = textFieldOf(target);
  saved = field
    ? { field, key: fieldKey(field), start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0, selection: '' }
    : { field: null, start: 0, end: 0, selection: pageSelection(doc) };
  return saved;
}

const item = (command, glyph, labelKey, extra = {}) => ({ command: `text:${command}`, icon: glyph, label: t(labelKey), ...extra });

/** Menu items for a remembered text field. */
export function fieldItems(field = saved?.field, start = saved?.start ?? 0, end = saved?.end ?? 0) {
  if (!field) return [];
  const selected = end > start;
  const editable = !field.readOnly && !field.disabled;
  const hidden = field.type === 'password';
  return [
    item('undo', 'undo', 'text.undo', { hint: 'Ctrl+Z', disabled: !editable }),
    { separator: true },
    item('cut', 'cut', 'text.cut', { hint: 'Ctrl+X', disabled: !selected || !editable || hidden }),
    item('copy', 'copy', 'text.copy', { hint: 'Ctrl+C', disabled: !selected || hidden }),
    item('paste', 'paste', 'text.paste', { hint: 'Ctrl+V', disabled: !editable }),
    item('delete', 'trash', 'text.delete', { hint: 'Del', disabled: !selected || !editable }),
    { separator: true },
    item('select-all', 'selectAll', 'text.selectAll', { hint: 'Ctrl+A', disabled: !field.value }),
  ];
}

/** Menu items for selected text outside a field (empty when nothing is selected). */
export function selectionItems(selection = saved?.selection ?? '') {
  return selection ? [item('copy-selection', 'copy', 'text.copy', { hint: 'Ctrl+C' })] : [];
}

/**
 * Runs a `text:` command on the remembered target. `clipboard` = { copy(text), read() }
 * (the app's clipboard commands; the webview's own clipboard refuses while the menu
 * window has the focus).
 */
export async function runTextCommand(command, clipboard) {
  const target = saved;
  if (!target) return;
  if (command === 'copy-selection') {
    if (target.selection) await clipboard.copy(target.selection);
    return;
  }
  const { start, end } = target;
  let { field } = target;
  // Rebuilt meanwhile (a list refresh): the same field, found again.
  if (field && !field.isConnected && target.key) field = field.ownerDocument?.querySelector?.(target.key) ?? field;
  if (!field || !field.isConnected) return;
  field.focus();
  field.setSelectionRange?.(start, end);
  const text = field.value.slice(start, end);
  // execCommand keeps the field's own undo history and sends the input events.
  const edit = (name, value) => field.ownerDocument.execCommand(name, false, value);
  switch (command) {
    case 'undo': edit('undo'); break;
    case 'copy': if (text) await clipboard.copy(text); break;
    case 'cut':
      if (!text) break;
      await clipboard.copy(text);
      field.focus();
      field.setSelectionRange?.(start, end);
      edit('delete');
      break;
    case 'paste': {
      const pasted = await clipboard.read();
      if (!pasted) break;
      field.focus();
      field.setSelectionRange?.(start, end);
      edit('insertText', pasted);
      break;
    }
    case 'delete': if (text) edit('delete'); break;
    case 'select-all': field.select(); break;
    default: break;
  }
  // Selection changes (select all, cut, paste) are remembered for the next menu.
  saved = { field, key: target.key, start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0, selection: '' };
}

/** Where a menu of `items` opens for a right-click at (clientX, clientY): screen CSS px, kept on screen. */
export function menuAnchor(event, items, win = globalThis.window) {
  const width = 250;
  const height = items.reduce((sum, entry) => sum + (entry.separator ? 9 : 32), 10);
  const screenArea = win.screen;
  const left = screenArea.availLeft ?? 0;
  const top = screenArea.availTop ?? 0;
  let x = win.screenX + event.clientX;
  let y = win.screenY + event.clientY;
  if (x + width > left + screenArea.availWidth) x -= width;
  if (y + height > top + screenArea.availHeight) y = Math.max(top, y - height);
  return { x, y };
}

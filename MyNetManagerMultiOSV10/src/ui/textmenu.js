// The right-click menu of text boxes (filter bar, search boxes, dialogs' fields and text areas), drawn by the
// app's own menu popup so it follows the program's theme, instead of the web view's built-in menu (which
// follows Windows' theme). Used by the main window (app.js) and by every popup window (popup.js, through the
// main window, which owns the menu popup).

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password', 'number', '']);

/** The text box an event happened in, or null (check boxes, sliders, colour pickers … have no text menu). */
export function textTarget(target) {
  const el = target?.closest?.('textarea, input');
  if (!el) return null;
  if (el.tagName === 'TEXTAREA') return el;
  return TEXT_TYPES.has((el.getAttribute('type') ?? '').toLowerCase()) ? el : null;
}

function range(el) {
  try {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    return { start, end, text: el.value.slice(start, end) };
  } catch {
    // Some input types have no selection API: the whole value then.
    return { start: 0, end: el.value.length, text: el.value };
  }
}

/** The selection at the moment of the right-click: the menu window takes the focus, and the box may not keep it. */
export function savedRange(el) {
  const { start, end } = range(el);
  return { start, end };
}

/** What the menu can offer for this box right now. */
export function textState(el) {
  const { text } = range(el);
  const editable = !el.readOnly && !el.disabled;
  return { selected: text.length > 0, editable, empty: el.value.length === 0, password: el.type === 'password' };
}

/** Menu items ({ id, label, icon, shortcut, disabled }) for a text box with state `s`. */
export function textMenuItems(t, s) {
  return [
    { id: 'custom:text:undo', label: t('textMenu.undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: !s.editable },
    { separator: true },
    { id: 'custom:text:cut', label: t('textMenu.cut'), icon: 'cut', shortcut: 'Ctrl+X', disabled: !s.editable || !s.selected || s.password },
    { id: 'custom:text:copy', label: t('textMenu.copy'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !s.selected || s.password },
    { id: 'custom:text:paste', label: t('textMenu.paste'), icon: 'paste', shortcut: 'Ctrl+V', disabled: !s.editable },
    { id: 'custom:text:delete', label: t('textMenu.delete'), icon: 'trash', shortcut: 'Del', disabled: !s.editable || !s.selected },
    { separator: true },
    { id: 'custom:text:selectAll', label: t('textMenu.selectAll'), icon: 'selectAll', shortcut: 'Ctrl+A', disabled: s.empty },
  ];
}

/** Puts `insert` in place of the selection, through the editor when it can (keeps Undo), else directly. */
function replaceSelection(el, insert) {
  el.focus();
  const done = insert ? document.execCommand('insertText', false, insert) : document.execCommand('delete');
  if (done) return;
  const { start, end } = range(el);
  el.setRangeText(insert, start, end, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Runs a text menu command on `el`. clipboard: { write(text), read() → text }; saved: savedRange at the right-click. */
export async function textCommand(el, id, clipboard, saved = null) {
  if (!el || !el.isConnected) return;
  if (saved) {
    el.focus();
    const max = el.value.length;
    try { el.setSelectionRange(Math.min(saved.start, max), Math.min(saved.end, max)); } catch { /* no selection API */ }
  }
  const { text } = range(el);
  switch (id) {
    case 'custom:text:undo': el.focus(); document.execCommand('undo'); break;
    case 'custom:text:copy': if (text) await clipboard.write(text); el.focus(); break;
    case 'custom:text:cut': if (text) { await clipboard.write(text); replaceSelection(el, ''); } break;
    case 'custom:text:paste': { const value = await clipboard.read(); if (value) replaceSelection(el, el.tagName === 'TEXTAREA' ? value : value.replace(/\r?\n/g, ' ')); else el.focus(); break; }
    case 'custom:text:delete': if (text) replaceSelection(el, ''); break;
    case 'custom:text:selectAll': el.focus(); el.select(); break;
    default: break;
  }
}

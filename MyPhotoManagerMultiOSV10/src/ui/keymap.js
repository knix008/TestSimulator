// Keyboard shortcuts of the Manage mode as commands the user can reassign
// (settings.keys = { commandId: 'Ctrl+Shift+K' }). Combos are written like
// "Ctrl+Shift+N", "Alt+ArrowLeft", "F2", "Delete".
import { t } from '../i18n.js';
import { app } from '../store.js';
import { openDialog, toast } from './dialog.js';
import { h } from './dom.js';

/** "Ctrl+Shift+N" for a keydown event (Cmd counts as Ctrl). */
export function comboOf(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey && (event.key.length > 1 || /[a-z]/i.test(event.key))) parts.push('Shift');
  let key = event.key;
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  parts.push(key);
  return parts.join('+');
}

export const normalizeCombo = (combo) => String(combo ?? '').split('+').map((part) => (part.length === 1 ? part.toUpperCase() : part)).join('+');

let commands = [];

/** Registers the app's commands: [{ id, label (i18n key), key (default combo), run }]. */
export function registerCommands(list) {
  commands = list;
}

export const keyOf = (command) => normalizeCombo(app.settings.keys[command.id] ?? command.key);

/** The command bound to this key press, or null. */
export function commandFor(event) {
  const combo = comboOf(event);
  if (!combo) return null;
  return commands.find((command) => keyOf(command) && keyOf(command) === combo) ?? null;
}

/** Editable list of the shortcuts. */
export async function keymapDialog() {
  const table = h('table.prop-table.keymap');
  let capturing = null;
  const render = () => {
    table.replaceChildren(...commands.map((command) => {
      const combo = keyOf(command);
      const conflict = combo && commands.some((other) => other !== command && keyOf(other) === combo);
      const keyCell = h(`button.btn.small.key-button${capturing === command.id ? '.on' : ''}`, { type: 'button', dataset: { command: command.id }, onclick: () => { capturing = command.id; render(); } }, capturing === command.id ? t('keys.press') : combo || '—');
      return h(`tr${conflict ? '.diff' : ''}`, h('th', t(command.label)), h('td', keyCell,
        app.settings.keys[command.id] != null ? h('button.tool.small', { type: 'button', title: t('keys.reset'), onclick: () => { delete app.settings.keys[command.id]; render(); } }, '↺') : '',
        h('button.tool.small', { type: 'button', title: t('keys.clear'), onclick: () => { app.settings.keys[command.id] = ''; render(); } }, '✕')));
    }));
  };
  const onKey = (event) => {
    if (!capturing) return;
    const combo = comboOf(event);
    if (!combo) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (combo === 'Escape') { capturing = null; render(); return; }
    app.settings.keys[capturing] = combo;
    capturing = null;
    render();
  };
  document.addEventListener('keydown', onKey, true);
  render();
  await openDialog({
    title: t('keys.title'), width: 620, id: 'keymap-dialog',
    body: h('div', h('p.hint', t('keys.hint')), h('div.keymap-scroll', table),
      h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: () => { app.settings.keys = {}; render(); } }, t('keys.resetAll')))),
    buttons: [{ label: t('common.close'), value: true, primary: true }],
  });
  document.removeEventListener('keydown', onKey, true);
  app.saveSettings();
  toast(t('keys.saved'), 'success', 1500);
}

export const listCommands = () => commands;

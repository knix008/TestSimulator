// Keyboard shortcuts of the Manage, View and Edit modes as commands the user can reassign
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
  let key = event.key;
  if (key === ' ') key = 'Space';
  // Shift counts for named keys and letters ("+" or "*" already need it).
  if (event.shiftKey && (key.length > 1 || /[a-z]/i.test(key))) parts.push('Shift');
  if (key.length === 1) key = key.toUpperCase();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  parts.push(key);
  return parts.join('+');
}

export const normalizeCombo = (combo) => String(combo ?? '').split('+').map((part) => (part.length === 1 ? part.toUpperCase() : part)).join('+');

// Commands per mode: 'manage', 'view' (the viewer) and 'edit' (the editor).
// A command's default `key` may be one combo or several; a user's choice
// (settings.keys[id]) replaces them with one combo ('' = no key).
const scopes = new Map();
export const SCOPES = ['manage', 'view', 'edit'];

/** Registers a mode's commands: [{ id, label (i18n key), key (combo or [combos]), run }]. */
export function registerCommands(list, scope = 'manage') {
  scopes.set(scope, list);
}

/** The combos that run the command now. */
export function keysOf(command) {
  const own = app.settings.keys[command.id];
  if (own != null) return own ? [normalizeCombo(own)] : [];
  return [].concat(command.key ?? []).filter(Boolean).map(normalizeCombo);
}
export const keyOf = (command) => keysOf(command).join(' / ');

/** The command of this mode bound to the key press, or null. */
export function commandFor(event, scope = 'manage') {
  const combo = comboOf(event);
  if (!combo) return null;
  return (scopes.get(scope) ?? []).find((command) => keysOf(command).includes(combo)) ?? null;
}

/** Editable list of the shortcuts. */
export async function keymapDialog() {
  const table = h('table.prop-table.keymap');
  let capturing = null;
  const render = () => {
    table.replaceChildren(...SCOPES.flatMap((scope) => [h('tr.keymap-scope', h('th', { colSpan: 2 }, t(`keys.scope.${scope}`))), ...(scopes.get(scope) ?? []).map((command) => {
      const commands = scopes.get(scope);
      const combo = keyOf(command);
      const conflict = keysOf(command).some((c) => commands.some((other) => other !== command && keysOf(other).includes(c)));
      const keyCell = h(`button.btn.small.key-button${capturing === command.id ? '.on' : ''}`, { type: 'button', dataset: { command: command.id }, onclick: () => { capturing = command.id; render(); } }, capturing === command.id ? t('keys.press') : combo || '—');
      return h(`tr${conflict ? '.diff' : ''}`, h('th', t(command.label)), h('td', keyCell,
        app.settings.keys[command.id] != null ? h('button.tool.small', { type: 'button', title: t('keys.reset'), onclick: () => { delete app.settings.keys[command.id]; render(); } }, '↺') : '',
        h('button.tool.small', { type: 'button', title: t('keys.clear'), onclick: () => { app.settings.keys[command.id] = ''; render(); } }, '✕')));
    })]));
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

export const listCommands = (scope = 'manage') => scopes.get(scope) ?? [];

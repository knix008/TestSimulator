// The keymap: which key runs which operator. Operators carry their default key; the user's changes are a small table
// { operatorId: 'Ctrl+K' } kept in the preferences. A key's name is always written the same way: Ctrl+Alt+Shift+Key.
import { allOps, getOp } from './ops.js';

const SPECIAL = { ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc' };

/** The canonical name of a key press, or null for a modifier on its own. */
export function comboFromEvent(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = SPECIAL[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  parts.push(key);
  return parts.join('+');
}

/** Any spelling ('shift+a', 'Shift + A') in the canonical form. */
export function normalizeCombo(text) {
  if (!text) return '';
  const parts = text.split('+').map((p) => p.trim()).filter(Boolean);
  const set = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  const last = parts.at(-1) ?? '';
  const out = [];
  if (set.has('ctrl') || set.has('cmd')) out.push('Ctrl');
  if (set.has('alt')) out.push('Alt');
  if (set.has('shift')) out.push('Shift');
  out.push(last.length === 1 ? last.toUpperCase() : last);
  return out.join('+');
}

const defaults = new Map();

/** The operator's own key, whatever has been changed since. */
export function defaultKey(id) {
  const op = getOp(id);
  if (!op) return '';
  if (!defaults.has(id)) defaults.set(id, op.key ?? '');
  return defaults.get(id);
}

/** Applies a table of changes: menus and search show the new keys from then on. */
export function applyKeymap(overrides = {}) {
  for (const op of allOps()) {
    const base = defaultKey(op.id);
    op.key = overrides[op.id] !== undefined ? overrides[op.id] || undefined : base || undefined;
  }
}

/** What to do with a key press: { run: operator id } for a key the user assigned, { swallow: true } for a default taken away. */
export function lookupKey(overrides, combo, canRun) {
  if (!combo) return null;
  for (const [id, key] of Object.entries(overrides)) {
    if (key && normalizeCombo(key) === combo && canRun(id)) return { run: id };
  }
  for (const id of Object.keys(overrides)) {
    if (normalizeCombo(defaultKey(id)) === combo && canRun(id)) return { swallow: true };
  }
  return null;
}

/** Other operators that answer to the same key. */
export function keyConflicts(id, combo) {
  const key = normalizeCombo(combo);
  if (!key) return [];
  return allOps().filter((op) => op.id !== id && op.key && normalizeCombo(op.key) === key).map((op) => op.id);
}

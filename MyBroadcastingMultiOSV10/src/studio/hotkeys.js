// Hotkeys (Settings › Hotkeys): every action that can have a key — outputs, studio mode, each scene, each
// item's show / hide, each source's mute / push-to-talk / push-to-mute / media controls, quick transitions.
// Bindings are lists of key combinations ("Ctrl+Shift+R"). On the desktop they are registered as global
// shortcuts (they work while another program is in front); in the browser while the page has focus.
// Pure — tested in node.
import { SOURCE_TYPES } from '../bc/catalog.js';
import { allItems } from '../bc/model.js';

/** Fixed actions (the "General" group of the hotkeys list). */
export const GENERAL_ACTIONS = [
  'startStream', 'stopStream', 'toggleStream', 'startRecording', 'stopRecording', 'toggleRecording', 'pauseRecording', 'unpauseRecording',
  'splitRecording', 'addChapter', 'startReplay', 'stopReplay', 'saveReplay', 'startVirtualCam', 'stopVirtualCam',
  'toggleStudio', 'transition', 'resetStats', 'screenshotOutput', 'screenshotSource', 'toggleMultiview',
];

/** Every action of a collection, grouped: [{ group, id, label: [key, params] }]. */
export function hotkeyActions(c) {
  const out = GENERAL_ACTIONS.map((id) => ({ group: 'general', id, label: [`hk.${id}`] }));
  for (const q of c.quick ?? []) out.push({ group: 'general', id: `quick:${q.id}`, label: ['hk.quick', { name: c.transitions.find((x) => x.id === q.transition)?.name ?? '?', ms: q.duration }] });
  for (const s of c.scenes) {
    out.push({ group: `scene:${s.id}`, id: `scene:${s.id}`, label: ['hk.switchScene', { name: s.name }] });
    for (const it of allItems(s)) {
      const name = c.sources[it.source]?.name ?? c.scenes.find((x) => x.id === it.source)?.name ?? '?';
      out.push({ group: `scene:${s.id}`, id: `item:${s.id}:${it.id}:show`, label: ['hk.itemShow', { name }] });
      out.push({ group: `scene:${s.id}`, id: `item:${s.id}:${it.id}:hide`, label: ['hk.itemHide', { name }] });
    }
  }
  for (const src of Object.values(c.sources)) {
    const type = SOURCE_TYPES[src.type];
    if (type?.audio && src.type !== 'group') for (const k of ['mute', 'unmute', 'ptt', 'ptm']) out.push({ group: `source:${src.id}`, id: `source:${src.id}:${k}`, label: [`hk.${k}`, { name: src.name }] });
    if (type?.media || src.type === 'slideshow') for (const k of ['play', 'pause', 'stop', 'restart', 'next', 'previous']) out.push({ group: `source:${src.id}`, id: `source:${src.id}:${k}`, label: [`hk.media.${k}`, { name: src.name }] });
  }
  return out;
}

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const KEY_NAMES = { ' ': 'Space', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', '+': 'Plus' };

/** A keydown event → "Ctrl+Shift+R" (null for a bare modifier). */
export function comboOf(e) {
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key)) return null;
  let key = e.code?.startsWith('Key') ? e.code.slice(3) : e.code?.startsWith('Digit') ? e.code.slice(5) : e.code?.startsWith('Numpad') ? `Num${e.code.slice(6)}` : KEY_NAMES[e.key] ?? (e.key?.length === 1 ? e.key.toUpperCase() : e.key);
  if (/^F\d{1,2}$/.test(e.key)) key = e.key;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean);
  return [...mods, key].join('+');
}

/** "shift+ctrl+r" → "Ctrl+Shift+R" (stable order, capitalised). */
export function normalizeCombo(text) {
  const parts = String(text || '').split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  const mods = parts.slice(0, -1).map((m) => ({ control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta', command: 'Meta', super: 'Meta', win: 'Meta' }[m.toLowerCase()] ?? m));
  const key = parts.at(-1);
  const k = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
  return [...MOD_ORDER.filter((m) => mods.includes(m)), k].join('+');
}

/** "Ctrl+Shift+R" → Tauri's accelerator "CommandOrControl+Shift+KeyR" form. */
export function toAccelerator(combo) {
  const parts = normalizeCombo(combo).split('+');
  const key = parts.pop();
  const mods = parts.map((m) => ({ Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift', Meta: 'Super' }[m]));
  const k = /^[A-Z]$/.test(key) ? `Key${key}` : /^\d$/.test(key) ? `Digit${key}` : /^Num(\d)$/.test(key) ? `Numpad${key.slice(3)}` : { Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', Esc: 'Escape', Plus: 'Equal' }[key] ?? key;
  return [...mods, k].join('+');
}

/** Bindings: { action: [combo, …] } → combo → [actions] (one key may run several actions). */
export function keyMap(bindings) {
  const map = new Map();
  for (const [action, combos] of Object.entries(bindings ?? {})) for (const c of [].concat(combos ?? [])) {
    const k = normalizeCombo(c);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(action);
  }
  return map;
}

/** Bindings that point at scenes, items or sources no longer there are dropped. */
export function pruneBindings(bindings, c) {
  const valid = new Set(hotkeyActions(c).map((a) => a.id));
  return Object.fromEntries(Object.entries(bindings ?? {}).filter(([id, combos]) => valid.has(id) && [].concat(combos).length));
}

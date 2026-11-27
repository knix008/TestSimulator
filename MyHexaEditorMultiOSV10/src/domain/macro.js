// Keystroke macros (UltraEdit): what is typed in the hex view (keys, text from an input method) and the commands run
// while recording, played back in the same order. Saved macros live in localStorage. Pure data handling here; the
// app (src/app.js) records and plays.

export const MACROS_KEY = 'myhexa.macros.v1';
/** Commands that are not recorded: the macro commands themselves and ones that only open windows or change the look. */
export const NOT_RECORDED = new Set(['macroRecord', 'macroPlay', 'macroRepeat', 'macroSave', 'macroLoad', 'macroDelete', 'commandPalette', 'settings', 'about', 'shortcuts', 'welcome',
  'tutorial', 'userGuide', 'tutorialDoc', 'startPage', 'exit', 'print', 'fullscreen', 'theme', 'themeMenu', 'language', 'leftPanel', 'rightPanel', 'bottomPanel', 'statusBar',
  'shuffleBackground', 'backgroundImage', 'clearBackground', 'zoomIn', 'zoomOut', 'zoomReset', 'showMessages', 'clearMessages']);
/** Keys of the hex view a macro keeps (characters too). */
const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Tab', 'Insert', 'Escape', 'Backspace', 'Delete']);

export function createRecorder() {
  let steps = null;
  return {
    get recording() { return steps != null; },
    start() { steps = []; },
    /** The recorded steps (recording ends). */
    stop() { const out = steps ?? []; steps = null; return out; },
    key(event) {
      if (!steps || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
      if (!(event.key.length === 1 || KEYS.has(event.key))) return false;
      steps.push({ type: 'key', key: event.key, shift: Boolean(event.shiftKey) });
      return true;
    },
    text(text) {
      if (!steps || !text) return false;
      const last = steps[steps.length - 1];
      if (last?.type === 'text') last.text += text; else steps.push({ type: 'text', text });
      return true;
    },
    command(id) {
      if (!steps || NOT_RECORDED.has(id) || id.startsWith('macro')) return false;
      steps.push({ type: 'command', id });
      return true;
    },
  };
}

/** A short description for menus and the log: "12 keys, 1 text, 2 commands". */
export function describeSteps(steps) {
  const n = { key: 0, text: 0, command: 0 };
  for (const s of steps ?? []) n[s.type] = (n[s.type] ?? 0) + 1;
  return n;
}

export function loadMacros(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(MACROS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((m) => m && typeof m.name === 'string' && Array.isArray(m.steps)).map((m) => ({ name: m.name, steps: m.steps.filter(validStep) })) : [];
  } catch { return []; }
}

export function saveMacros(list, storage = globalThis.localStorage) {
  storage?.setItem(MACROS_KEY, JSON.stringify(list.map((m) => ({ name: m.name, steps: m.steps }))));
}

/** Adds or replaces a macro by name (names are unique, case-insensitive). */
export function putMacro(list, name, steps) {
  const clean = String(name ?? '').trim() || 'macro';
  const out = list.filter((m) => m.name.toLowerCase() !== clean.toLowerCase());
  out.push({ name: clean, steps: steps.filter(validStep) });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function validStep(s) {
  if (s?.type === 'key') return typeof s.key === 'string' && (s.key.length === 1 || KEYS.has(s.key));
  if (s?.type === 'text') return typeof s.text === 'string';
  if (s?.type === 'command') return typeof s.id === 'string';
  return false;
}

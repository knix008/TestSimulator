// Promise-based input dialogs drawn by <PromptHost/>:
//   askText({ title, label, value, icon })                 → string | null
//   askPath({ mode: 'open'|'save'|'folder', title, start, name, exts }) → path | null
// askPath is the in-page file chooser (web build, or when a native dialog is
// not available); the desktop normally uses the system dialogs (chooseFile).
import { isDesktop, pickFile, pickFolder, pickSavePath, joinPath } from './backend';

const subs = new Set();
let current = null;
const emit = () => subs.forEach((fn) => fn(current));

export function subscribePrompt(fn) {
  subs.add(fn);
  fn(current);
  return () => subs.delete(fn);
}

function show(req) {
  return new Promise((resolve) => {
    current = { ...req, resolve: (v) => { current = null; emit(); resolve(v); } };
    emit();
  });
}

export const askText = (opts) => show({ kind: 'text', ...opts });
export const askPath = (opts) => show({ kind: 'path', mode: 'open', ...opts });

/**
 * Open / save / folder chooser: the system dialog on the desktop, the in-page
 * chooser on the web. exts: ['.m', '.mat'] (empty = any file).
 */
export async function chooseFile({ mode = 'open', title, start, name, exts = [], filterName = '' } = {}) {
  if (isDesktop) {
    const filters = exts.length ? [{ name: filterName || exts.join(' '), extensions: exts.map((e) => e.replace(/^\./, '')) }] : undefined;
    if (mode === 'folder') return pickFolder({ defaultPath: start });
    if (mode === 'save') return pickSavePath({ defaultPath: start && name ? joinPath(start, name) : name || start, filters });
    return pickFile({ defaultPath: start, filters });
  }
  return askPath({ mode, title, start, name, exts });
}

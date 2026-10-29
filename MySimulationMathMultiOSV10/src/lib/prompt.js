// Promise-based input dialogs drawn by <PromptHost/>:
//   askText({ title, label, value, icon })                 → string | null
//   askPath({ mode: 'open'|'save'|'folder', title, start, name, exts }) → path | null
// askPath is the in-page file chooser, used on the web and on the desktop alike:
// the Windows system dialog left a large empty band above its buttons and does
// not follow the app theme.

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

/** Open / save / folder chooser (the in-page chooser). exts: ['.m', '.mat'] (empty = any file). */
export async function chooseFile({ mode = 'open', title, start, name, exts = [] } = {}) {
  return askPath({ mode, title, start, name, exts });
}

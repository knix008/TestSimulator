// A dialog in a window of its own (desktop). Rust opened this window with
// window.__MYTEXTMASTER_DIALOG__ = { id, kind, params, owner, width, height, fixed }: this page draws
// that dialog filling the window, sizes the window to it and shows it, and when the dialog is done
// sends its answer to the owner window ("dialog-result") and closes. Changes the settings and the
// user dictionary make are sent to the main window ("app-call"), which applies and stores them.
import { drawInWindow, renderAlert, renderConfirm, renderForm } from './ui/dialog.js';
import { renderAbout, renderDictionary, renderHash, renderSettings, renderShortcuts, renderStats } from './ui/appdialogs.js';
import { renderPrint } from './ui/printwindow.js';
import { setLanguage } from './i18n.js';
import { applyFont, applyTheme, resolveTheme } from './themes.js';
import { loadSettings, normalizeSettings } from './domain/settings.js';
import { addWords, loadUserDictionary } from './domain/userdict.js';
import * as native from './platform/native.js';

const spec = window.__MYTEXTMASTER_DIALOG__;
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
let settings = loadSettings(globalThis.localStorage);
let words = spec.params?.words ?? loadUserDictionary(globalThis.localStorage);

function applyLook() {
  setLanguage(settings.language);
  applyTheme(resolveTheme(settings.theme, prefersDark(), settings.customTheme));
  applyFont(settings);
}

async function callMain(method, ...args) {
  const { emitTo } = await import('@tauri-apps/api/event');
  await emitTo('main', 'app-call', { method, args });
}

/** What the settings and dictionary dialogs see as "the app" here. */
const app = {
  settings: () => settings,
  updateSettings(patch, options) {
    settings = normalizeSettings({ ...settings, ...patch });
    applyLook();
    callMain('updateSettings', patch, options);
  },
  notify: (kind, text) => callMain('notify', kind, text),
  userWords: () => words,
  setUserDictionary(list) { words = addWords([], list); callMain('setUserDictionary', words); },
  version: () => spec.params?.version ?? '',
};

let sent = false;
async function finish(result) {
  if (sent) return;
  sent = true;
  const [{ emitTo }, { getCurrentWindow }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/window')]);
  await emitTo(spec.owner, 'dialog-result', { id: spec.id, result: result ?? null }).catch(() => {});
  await getCurrentWindow().destroy();
}

async function main() {
  document.documentElement.classList.add('is-dialog-window');
  applyLook();
  // Alt+F4 or the taskbar: the same as Cancel.
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  getCurrentWindow().onCloseRequested((event) => { event.preventDefault(); finish('cancel'); });
  drawInWindow({
    drag: () => native.windowDrag(),
    // Fixed dialogs keep their size; the others take the height of their content.
    ready: (box) => {
      const height = spec.fixed ? spec.height : Math.ceil(box.getBoundingClientRect().height);
      native.fitDialogWindow(spec.owner, spec.width, height).catch(() => {});
    },
  });
  const p = spec.params ?? {};
  const copy = (text) => import('@tauri-apps/api/core').then(({ invoke }) => invoke('clipboard_write', { text }));
  const run = {
    confirm: () => renderConfirm(p),
    alert: () => renderAlert(p),
    form: () => renderForm(p),
    settings: () => renderSettings(app, p.tab),
    about: () => renderAbout(p),
    stats: () => renderStats(p),
    shortcuts: () => renderShortcuts(p),
    dictionary: () => renderDictionary(app),
    hash: () => renderHash(p, copy),
    print: () => renderPrint(p),
  }[spec.kind];
  if (!run) { await finish(null); return; }
  await finish(await run());
}

main().catch((error) => {
  console.error(error);
  finish('cancel');
});

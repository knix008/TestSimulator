// The desktop/web boundary. Everything here degrades to a browser implementation,
// so the same page runs in a browser tab and inside the Tauri window.

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function core() { return import('@tauri-apps/api/core'); }

export async function readTextFile() {
  if (!isDesktop()) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.c,.cpp,.cc,.java,.py,.go,.rs,.js,.txt';
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, text: await file.text() } : null);
      };
      input.click();
    });
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: 'Source', extensions: ['c', 'cpp', 'cc', 'java', 'py', 'go', 'rs', 'js', 'txt'] }] });
  if (!path) return null;
  const { invoke } = await core();
  return { name: String(path).split(/[\\/]/).pop(), text: await invoke('read_text_file', { path }) };
}

export async function writeTextFile(name, text) {
  if (!isDesktop()) {
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: name });
  if (!path) return false;
  const { invoke } = await core();
  await invoke('write_text_file', { path, text });
  return true;
}

/** { desktop, tools: { id: { installed, version } } } */
export async function toolchainStatus() {
  if (!isDesktop()) return { desktop: false, tools: { javascript: { installed: true, version: 'browser' } } };
  const { invoke } = await core();
  return invoke('toolchain_status');
}

/** Installs a language toolchain, streaming `{ line }` events to onProgress. */
export async function installToolchain(language, onProgress) {
  const { invoke } = await core();
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen('install-progress', (event) => onProgress?.(event.payload));
  try {
    return await invoke('install_toolchain', { language });
  } finally {
    unlisten();
  }
}

/** Compiles and runs source on the desktop, feeding `input` as stdin. */
export async function runCode(language, source, input) {
  const { invoke } = await core();
  return invoke('run_code', { language, source, input });
}

/** Saves the current project. A remembered path is overwritten; otherwise a dialog (or a download) is used. */
export async function saveProjectFile(name, text, existingPath = '') {
  if (!isDesktop()) {
    const blob = new Blob([text], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return existingPath || name;
  }
  const { invoke } = await core();
  if (existingPath) {
    await invoke('write_text_file', { path: existingPath, text });
    return existingPath;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: name, filters: [{ name: 'MyAlgorithmSimulator', extensions: ['json'] }] });
  if (!path) return '';
  await invoke('write_text_file', { path, text });
  return String(path);
}

const PRINT_KEY = 'myalgorithmsimulator.print';

/** Opens the print window and hands it the current algorithm sheet. */
export async function openPrintWindow({ title, lang, theme, dark, payload }) {
  const text = JSON.stringify(payload);
  localStorage.setItem(PRINT_KEY, text);
  const params = new URLSearchParams({ lang, theme });
  const popup = () => {
    const opened = window.open(`print.html?${params}`, 'myalgorithmsimulator-print', 'popup=yes,width=1100,height=780');
    opened?.focus();
  };
  if (!isDesktop()) { popup(); return; }
  try {
    const { invoke } = await core();
    await invoke('set_print_payload', { payload: text });
    await invoke('open_print_window', { title, lang, theme, dark });
  } catch {
    popup();
  }
}

export async function getPrintPayload() {
  if (!isDesktop()) return localStorage.getItem(PRINT_KEY) || '';
  try {
    const { invoke } = await core();
    return await invoke('get_print_payload');
  } catch {
    return localStorage.getItem(PRINT_KEY) || '';
  }
}

export async function listPrinters() {
  if (!isDesktop()) return { printers: [], defaultPrinter: '', filePrinters: [] };
  const { invoke } = await core();
  return invoke('list_printers');
}

/** Prints the calling window straight to `job.printer` (no system dialog). */
export async function printDirect(job) {
  const { invoke } = await core();
  return invoke('print_direct', { job });
}

/** The language chosen while installing ("ko" or "en"), once. Later starts use the saved choice. */
export async function takeInstallLanguage() {
  if (!isDesktop()) return null;
  try {
    const { invoke } = await core();
    const lang = await invoke('take_install_language');
    return lang === 'ko' || lang === 'en' ? lang : null;
  } catch {
    return null;
  }
}

export async function quit() {
  if (!isDesktop()) { window.close(); return; }
  const { invoke } = await core();
  await invoke('quit');
}

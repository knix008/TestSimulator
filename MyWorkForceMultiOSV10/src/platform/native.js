import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { requestMain } from './data.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

export const isDesktop = () => Boolean(globalThis.window?.__TAURI_INTERNALS__);

export function invoke(command, args) {
  if (!isDesktop()) return Promise.reject(new Error('desktop-only'));
  return tauriInvoke(command, args);
}

export const errorText = (error) => (error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? ''));

const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0',
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev',
  date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date().toISOString(),
};

export async function appInfo() {
  if (!isDesktop()) {
    return {
      name: 'MyWorkForce', version: BUILD.version, commit: BUILD.commit, buildDate: BUILD.date,
      target: 'web', profile: import.meta.env?.MODE || 'web', tauri: '-', rustc: '-',
      os: navigator.userAgentData?.platform || navigator.platform || 'web', arch: '-', web: true,
    };
  }
  const info = await invoke('app_info');
  return { ...info, web: false, buildDate: new Date(info.buildTime * 1000).toISOString() };
}

export const setBackendLanguage = (language) => (isDesktop() ? invoke('set_language', { language }).catch(() => {}) : Promise.resolve());
export const startupFiles = () => (isDesktop() ? invoke('startup_files') : Promise.resolve([]));
export const readTextFile = (path) => invoke('read_text_file', { path });
export const writeTextFile = (path, content) => invoke('write_text_file', { path, content });
export const workspaceFile = () => invoke('workspace_file');
export async function setLaunchAtStartup(enabled) {
  if (!isDesktop()) return false;
  const plugin = await import('@tauri-apps/plugin-autostart');
  if (enabled) await plugin.enable();
  else await plugin.disable();
  await invoke('set_talk_autostart', { enabled });
  return plugin.isEnabled();
}

export function openBrowser(url) {
  const target = String(url || '');
  if (!/^https?:\/\//i.test(target) || /[\s"'<>]/.test(target)) return Promise.resolve();
  if (!isDesktop()) {
    window.open(target, '_blank', 'noopener');
    return Promise.resolve();
  }
  return invoke('open_browser', { url: target }).catch(() => { window.open(target, '_blank', 'noopener'); });
}

export function openMain(target = {}, options = {}) {
  requestMain(target);
  if (options.focus === false) return Promise.resolve();
  const popup = () => { window.open('./index.html', 'myworkforce-main'); return Promise.resolve(); };
  if (!isDesktop()) return popup();
  return invoke('open_main').catch(() => popup());
}

export function openTalk() {
  const popup = () => { window.open('./chat.html', 'myworkforce-talk', 'width=980,height=720'); return Promise.resolve(); };
  if (!isDesktop()) return popup();
  return invoke('open_talk').catch(() => popup());
}

export async function chooseOpen() {
  return (await openDialog({ multiple: false, filters: [{ name: 'MyWorkForce', extensions: ['mwf', 'json'] }] })) || null;
}

export async function chooseSave(filename, extensions = ['mwf']) {
  return (await saveDialog({ defaultPath: filename, filters: [{ name: 'MyWorkForce', extensions }] })) || null;
}

export async function showMain() {
  if (isDesktop()) await getCurrentWindow().show();
}

export async function windowControl(action) {
  if (!isDesktop()) return false;
  const win = getCurrentWindow();
  if (action === 'minimize') await win.minimize();
  else if (action === 'maximize') await win.toggleMaximize();
  else if (action === 'close') await win.close();
  return win.isMaximized();
}

export async function dragWindow() {
  if (isDesktop()) await getCurrentWindow().startDragging();
}

export async function resizeWindow() {
  if (isDesktop()) await getCurrentWindow().startResizeDragging('SouthEast');
}

export async function setWindowTheme(dark) {
  if (!isDesktop()) return;
  try { await getCurrentWindow().setTheme(dark ? 'dark' : 'light'); } catch { /* the page colours still change */ }
}

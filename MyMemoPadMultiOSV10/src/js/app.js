import { applyI18n, detectLocale, setLocale, t } from './i18n.js';
import { initTooltips } from './tooltip.js';
import { initErrorDialog, showAlert } from './dialogs.js';
import { initSettings } from './settings.js';
import { initPad } from './pad.js';
import { initList } from './list.js';
import {
  DEFAULT_SETTINGS,
  applyThemeVars,
  fileToHtml,
  lockSettingsTheme,
  lookFromSettings
} from './shared.js';
import {
  webApplyBackColorToAllLooks,
  webGetLook,
  webLoadMemos,
  webLoadSettings,
  webRemoveLook,
  webSaveMemos,
  webSaveSettings,
  webSetLook
} from './persist.js';
import {
  onSettingsCommand,
  onSettingsLoad,
  openSettingsWindow
} from './settings-bus.js';

const isElectron = Boolean(window.desktopAPI?.isElectron);
const api = window.desktopAPI || {};
const params = new URLSearchParams(location.search);
const role = isElectron
  ? (params.get('role') || 'pad')
  : (params.get('role') === 'settings' ? 'settings' : 'web');

document.body.classList.toggle('is-electron', isElectron);
document.body.classList.add(`role-${role}`);
document.documentElement.classList.add(`role-${role}`);
if (role === 'settings') {
  lockSettingsTheme();
}

let memos = [];
let settings = { ...DEFAULT_SETTINGS };
let appInfo = { version: '1.0.0' };

function getMemos() {
  return memos;
}

function setMemos(items) {
  memos = items.slice();
  if (isElectron) api.saveMemos(memos);
  else webSaveMemos(memos);
  list?.render();
}

function getSettings() {
  return settings;
}

function setSettings(next) {
  settings = { ...settings, ...next };
  if (isElectron) api.saveSettings(settings);
  else webSaveSettings(settings);
}

function setLook(index, look) {
  if (isElectron) api.setLook(index, look);
  else webSetLook(index, look);
}

function removeLook(index) {
  if (isElectron) api.removeLook(index);
  else webRemoveLook(index);
}

function wireWindowDrag() {
  if (!isElectron) return;
  document.querySelectorAll('[data-drag="1"]').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      api.beginWindowDrag();
      const move = (ev) => api.updateWindowDrag(ev.screenX, ev.screenY);
      const up = () => {
        api.endWindowDrag();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });
}

function showWebView(which) {
  document.body.classList.toggle('web-pad', which === 'pad');
  document.body.classList.toggle('web-list', which === 'list');
  document.getElementById('view-pad').hidden = which !== 'pad';
  document.getElementById('view-list').hidden = which !== 'list';
  const listBtn = document.getElementById('btn-list');
  if (listBtn) {
    listBtn.hidden = false;
    listBtn.setAttribute('data-tooltip', t('main.back'));
  }
}

function openSettingsFrom(ownerRole) {
  const look = ownerRole === 'list' ? lookFromSettings(settings) : pad.getLook();
  openSettingsWindow({
    ownerRole,
    sourceIndex: ownerRole === 'pad' ? pad.getSourceIndex() : -1,
    look,
    settings,
    html: ownerRole === 'pad' ? pad.getHtml() : '',
    appInfo
  });
}

function applyCommit(cmd) {
  if (!cmd?.look || !cmd.settings) return;
  setSettings(cmd.settings);
  if (cmd.look.editorBackColor) {
    if (!isElectron) webApplyBackColorToAllLooks(cmd.look.editorBackColor);
    applyThemeVars(cmd.look.editorBackColor);
    if (role === 'pad' || document.body.classList.contains('web-pad')) {
      pad.applyLook({
        editorBackColor: cmd.look.editorBackColor,
        formBackColor: cmd.look.formBackColor || cmd.look.editorBackColor
      }, { persistOpacity: false });
    }
    if (role === 'list' || document.body.classList.contains('web-list')) {
      list.applyTheme();
    }
  }
  if (cmd.ownerRole === 'pad' && cmd.sourceIndex >= 0) {
    setLook(cmd.sourceIndex, cmd.look);
  }
  setLocale(cmd.settings.language);
  applyI18n(document);
}

async function restoreLooksFromStore() {
  if (role === 'list' || document.body.classList.contains('web-list')) {
    applyThemeVars(getSettings().editorBackColor);
    list.applyTheme();
    return;
  }
  if (role === 'pad' || document.body.classList.contains('web-pad')) {
    const index = pad.getSourceIndex();
    const look = isElectron ? await api.getLook(index) : webGetLook(index);
    if (look) pad.applyLook(look);
  }
}

initErrorDialog();
initTooltips(document);

const pad = initPad({
  isElectron,
  isWeb: role === 'web',
  api,
  getMemos,
  setMemos,
  getSettings,
  setSettings,
  getLook: (index) => (isElectron ? api.getLook(index) : webGetLook(index)),
  setLook,
  removeLook,
  showList: () => api.showList?.(),
  openSettings: () => openSettingsFrom('pad'),
  onWebNew: () => {
    const url = new URL(location.href);
    url.search = 'role=web&pad=1';
    window.open(url.toString(), '_blank');
  },
  onWebBack: () => {
    showWebView('list');
    list?.render();
  }
});

const list = initList({
  isElectron,
  isWeb: role === 'web',
  api,
  getMemos,
  setMemos,
  getSettings,
  removeLook,
  openSettings: () => openSettingsFrom('list'),
  openMemo: async (index) => {
    if (isElectron) {
      await api.openMemoIndex(index);
      return;
    }
    const stored = memos[index];
    pad.loadPayload({
      sourceIndex: index,
      html: stored,
      look: webGetLook(index),
      settings
    });
    showWebView('pad');
  },
  openNew: async () => {
    if (isElectron) {
      await api.openNewMemo();
      return;
    }
    const url = new URL(location.href);
    url.search = 'role=web&pad=1';
    window.open(url.toString(), '_blank');
  },
  importFile: async () => {
    if (isElectron) {
      const result = await api.openTextFile();
      if (result?.error === 'missing') await showAlert(t('list.openFile.missing'), t('common.error'));
      if (result?.error === 'failed') await showAlert(t('list.openFile.failed'), t('common.error'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.rtf,.html,.md,text/plain';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const content = await file.text();
      const ext = `.${file.name.split('.').pop() || 'txt'}`;
      pad.loadPayload({
        sourceIndex: -1,
        html: fileToHtml(ext, content),
        look: lookFromSettings(settings),
        settings
      });
      showWebView('pad');
    });
    input.click();
  }
});

if (role !== 'settings') {
  onSettingsCommand((cmd) => {
    if (role === 'list' || document.body.classList.contains('web-list')) {
      if (cmd.type === 'previewColor' && cmd.color) {
        applyThemeVars(cmd.color);
      }
      if (cmd.type === 'cancel' && cmd.snapshot?.settings) {
        applyThemeVars(cmd.snapshot.settings.editorBackColor);
        setLocale(cmd.snapshot.settings.language);
        applyI18n(document);
        list.applyTheme();
      }
      if (cmd.type === 'commit') {
        applyCommit(cmd);
        applyThemeVars(cmd.look.editorBackColor);
        list.applyTheme();
        list.render();
      }
      return;
    }
    pad.handleSettingsCommand(cmd);
    if (cmd.type === 'commit') applyCommit(cmd);
    if (cmd.type === 'cancel' && cmd.snapshot?.settings) {
      setLocale(cmd.snapshot.settings.language);
      applyI18n(document);
    }
  });
}

async function boot() {
  if (isElectron) {
    appInfo = (await api.getAppInfo()) || appInfo;
    settings = (await api.getSettings()) || settings;
    memos = (await api.getMemos()) || [];
    api.onMemosChanged?.((next) => {
      memos = next || [];
      list.render();
    });
    api.onSettingsChanged?.((next) => {
      settings = next || settings;
      setLocale(settings.language);
      applyI18n(document);
      if (role !== 'settings') {
        applyThemeVars(settings.editorBackColor);
      }
      if (role === 'pad') {
        pad.applyLook({
          editorBackColor: settings.editorBackColor,
          formBackColor: settings.formBackColor || settings.editorBackColor
        }, { persistOpacity: false });
      }
      if (role === 'list') {
        list.applyTheme();
        list.render();
      }
    });
    api.onPreviewColor?.((color) => {
      if (role === 'settings') return;
      applyThemeVars(color);
      if (role === 'pad') {
        pad.applyLook({ editorBackColor: color, formBackColor: color }, { persistOpacity: false });
      }
    });
    api.onRestoreLooks?.(restoreLooksFromStore);
    api.onLanguageChanged?.((language) => {
      setLocale(language);
      applyI18n(document);
    });
  } else {
    settings = webLoadSettings();
    memos = webLoadMemos();
  }

  setLocale(settings.language || detectLocale());
  applyI18n(document);
  if (role !== 'settings') {
    applyThemeVars(settings.editorBackColor);
  }

  if (role === 'settings') {
    lockSettingsTheme();
    document.getElementById('view-settings').hidden = false;
    document.title = t('settings.title');
    const settingsUi = initSettings({
      isElectron,
      getAppInfo: () => appInfo
    });
    if (isElectron && api.getSettingsContext) {
      const existing = await api.getSettingsContext();
      if (existing) await settingsUi.load({ ...existing, appInfo });
    }
    onSettingsLoad((context) => settingsUi.load({ ...context, appInfo }));
    wireWindowDrag();
    return;
  }

  document.title = role === 'list' ? t('list.title') : t('tray.tooltip');

  if (role === 'pad') {
    document.getElementById('view-pad').hidden = false;
    pad.applyLook(lookFromSettings(settings));
  } else if (role === 'list') {
    document.getElementById('view-list').hidden = false;
    list.applyTheme();
    list.render();
  } else if (params.get('pad') === '1') {
    showWebView('pad');
    pad.applyLook(lookFromSettings(settings));
  } else {
    showWebView('list');
    list.render();
  }

  wireWindowDrag();
}

boot();

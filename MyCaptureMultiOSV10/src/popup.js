// Popup windows: settings (tabs), about, confirmation, theme dropdown.
// Each is its own OS window (label "popup-<kind>") running this page. Settings
// live in localStorage, which the main window watches, so a change here shows
// there at once — and changes made there show here.
import './styles.css';
import appIcon from '../assets/icon.svg';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { GALLERY_KEY, loadGallery, storeGallery } from './domain/gallery.js';
import { defaultSettings, IMAGE_FORMATS, loadSettings, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import { listMicrophones, meterPosition, MicrophoneChain } from './platform/microphone.js';
import { defaultDirectories, errorText, platformInfo, setBackendLanguage } from './platform/native.js';
import { openPopup, popupKey, popupParams, SESSION_KEY } from './platform/popups.js';
import { recordingSupport } from './platform/recorder.js';
import {
  applyTheme, CUSTOM, CUSTOM_FIELDS, resolveTheme, SYSTEM, THEMES, themeName,
} from './themes.js';
import { escapeHtml, formatNote, settingRow, swatch, widgets } from './ui.js';

const root = document.querySelector('#app');
const appWindow = getCurrentWindow();
const kind = appWindow.label.replace(/^popup-/, '');
document.title = appWindow.label;

const state = {
  settings: loadSettings(globalThis.localStorage),
  params: popupParams(kind),
  tab: popupParams(kind).tab ?? 'general',
  dirs: { pictures: null, videos: null },
  info: { platform: '', version: '' },
  mic: { devices: [], error: null, opening: false, testing: 0, testUrl: null, status: null },
  support: recordingSupport(),
};
let micChain = null;
let meterFrame = 0;
let shown = false;

const s = () => state.settings;
const ui = widgets(s);
const recording = () => ['starting', 'recording', 'paused', 'stopping'].includes(globalThis.localStorage?.getItem(SESSION_KEY));
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const currentTheme = () => resolveTheme(s().theme, s().customTheme, prefersDark());
const directoryFor = (which) => (which === 'image' ? s().imageDirectory ?? state.dirs.pictures : s().videoDirectory ?? state.dirs.videos);

function update(patch) {
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
}

/** Messages for the main window's status bar. */
const notifyMain = (noticeKind, text) => emit('mycapture-notice', { kind: noticeKind, text }).catch(() => {});

// ───────────────────────── frame

const SETTINGS_TABS = [
  ['general', 'globe', 'settings.general'],
  ['capture', 'camera', 'mode.capture'],
  ['record', 'video', 'mode.record'],
  ['mic', 'mic', 'mic.name'],
  ['save', 'folder', 'save.label'],
  ['theme', 'palette', 'settings.theme'],
];

function render() {
  if (kind === 'theme-menu') return renderThemeMenu();
  const [glyph, title] = { settings: ['gear', t('settings.title')], about: ['info', t('about.title')], confirm: ['trash', t('gallery.clearTitle')] }[kind];
  const body = kind === 'settings' ? settingsBody() : kind === 'about' ? aboutBody() : confirmBody();
  const foot = kind === 'settings'
    ? `<button class="button" data-action="reset-settings" ${recording() ? 'disabled' : ''}>${icon('refresh')}<span>${t('settings.reset')}</span></button>
       <button class="primary small" data-action="close">${t('modal.done')}</button>`
    : kind === 'about'
      ? `<span class="about-copy">© shkwon · MyCapture</span><button class="primary small" data-action="close">${t('modal.done')}</button>`
      : `<button class="button" data-action="close">${t('modal.cancel')}</button>
         <button class="primary small danger" data-action="gallery-clear-confirm">${icon('trash')}<span>${t('gallery.clear')}</span></button>`;
  root.innerHTML = `
    <div class="popup popup-${kind}" role="${kind === 'confirm' ? 'alertdialog' : 'dialog'}" aria-labelledby="popup-title">
      <header class="popup-head" data-tauri-drag-region>
        <h2 id="popup-title" data-tauri-drag-region>${icon(glyph)}<span data-tauri-drag-region>${title}</span></h2>
        <button class="window-button close" data-action="close" title="${t('modal.close')}" aria-label="${t('modal.close')}">${icon('close')}</button>
      </header>
      ${kind === 'settings' ? `<nav class="tabs" role="tablist" aria-label="${t('settings.title')}">
        ${SETTINGS_TABS.map(([tab, tabIcon, key]) => `
          <button role="tab" class="tab ${state.tab === tab ? 'active' : ''}" aria-selected="${state.tab === tab}" data-action="settings-tab" data-value="${tab}">${icon(tabIcon)}<span>${t(key)}</span></button>`).join('')}
      </nav>` : ''}
      <div class="modal-body">${body}</div>
      <footer class="modal-foot">${foot}</footer>
    </div>`;
  if (kind === 'confirm') root.querySelector('[data-action="gallery-clear-confirm"]').focus();
  if (kind === 'about') fitHeight();
  ready();
}

/** The about window is exactly as tall as its content. */
function fitHeight() {
  const popup = root.querySelector('.popup');
  popup.classList.add('fit');
  const height = Math.ceil(popup.getBoundingClientRect().height);
  popup.classList.remove('fit');
  if (Math.abs(height - window.innerHeight) > 1) appWindow.setSize(new LogicalSize(window.innerWidth, height)).catch(() => {});
}

function ready() {
  if (shown) return;
  shown = true;
  invoke('popup_ready').catch(() => {});
}

// ───────────────────────── settings

function settingsBody() {
  const settings = s();
  const active = recording();
  const support = state.support;
  switch (state.tab) {
    case 'capture':
      return `
        ${settingRow(t('tool.format'), ui.imageFormatSelect())}
        ${settingRow(t('tool.jpgQuality'), ui.qualitySlider())}
        <p class="hint">${escapeHtml(formatNote(settings.imageFormat))}</p>
        <div class="toggles">${ui.toggle('copyToClipboard', t('tool.clipboard'), t('tool.clipboardTip'))}</div>`;
    case 'record':
      return `
        ${settingRow(t('tool.engine'), ui.segmented('engine', [['display', t('tool.engineDisplay')], ['native', t('tool.engineNative')]], settings.engine, active))}
        <p class="hint">${t(settings.engine === 'native' ? 'tool.engineNativeTip' : 'tool.engineDisplayTip')}</p>
        ${settingRow(t('tool.format'), ui.segmented('videoFormat', [['mp4', 'MP4'], ['webm', 'WebM']], settings.videoFormat, active))}
        ${settingRow('FPS', ui.segmented('fps', [[15, '15'], [30, '30'], [60, '60']], settings.fps, active))}
        <div class="toggles">
          ${ui.toggle('systemAudio', t('tool.systemAudio'), t(settings.engine === 'native' ? 'tool.systemAudioNativeTip' : 'tool.systemAudioTip'), active || settings.engine === 'native', 'speaker')}
          ${ui.toggle('microphone', t('tool.microphone'), t('tool.microphoneTip'), active || !support.microphone, 'mic')}
        </div>`;
    case 'mic':
      return micBody();
    case 'save':
      return `
        ${settingRow(t('settings.imageFolder'), ui.folderRow('image', directoryFor('image'), active))}
        ${settingRow(t('settings.videoFolder'), ui.folderRow('video', directoryFor('video'), active))}
        <div class="toggles">${ui.toggle('askPath', t('save.ask'), t('save.askDetail'), active)}</div>`;
    case 'theme':
      return themeSettingsBody();
    default:
      return `
        ${settingRow(t('settings.language'), ui.segmented('language', [['ko', '한국어'], ['en', 'English']], getLanguage()))}
        <p class="hint">${t('settings.languageHint')}</p>
        ${settingRow(t('settings.panel'), ui.segmented('sidebarCollapsed', [['false', t('settings.panelOpen')], ['true', t('settings.panelClosed')]], String(settings.sidebarCollapsed)))}
        ${settingRow(t('settings.historyPanel'), ui.segmented('historyCollapsed', [['false', t('settings.panelOpen')], ['true', t('settings.panelClosed')]], String(settings.historyCollapsed)))}`;
  }
}

function themeSettingsBody() {
  const settings = s();
  const custom = settings.customTheme;
  const language = getLanguage();
  const grid = (mode) => `<div class="theme-grid" role="radiogroup" aria-label="${t(mode === 'dark' ? 'theme.dark' : 'theme.light')}">
    ${THEMES.filter((theme) => theme.mode === mode).map((theme) => `<button class="theme-chip ${settings.theme === theme.id ? 'current' : ''}" role="radio" aria-checked="${settings.theme === theme.id}" data-action="theme-set" data-value="${theme.id}" title="${escapeHtml(themeName(theme, language))}" aria-label="${escapeHtml(themeName(theme, language))}">${swatch(theme)}</button>`).join('')}
  </div>`;
  const name = settings.theme === SYSTEM ? `${t('theme.system')} · ${themeName(currentTheme(), language)}` : themeName(currentTheme(), language);
  return `
    ${settingRow(t('theme.current'), `<span class="theme-current">${swatch(currentTheme())}<b>${escapeHtml(name)}</b></span>
      <button class="button small ${settings.theme === SYSTEM ? 'active' : ''}" data-action="theme-set" data-value="${SYSTEM}">${icon('monitor')}<span>${t('theme.system')}</span></button>`)}
    <div class="theme-group"><span class="setting-label">${t('theme.dark')}</span>${grid('dark')}</div>
    <div class="theme-group"><span class="setting-label">${t('theme.light')}</span>${grid('light')}</div>
    <div class="theme-custom ${settings.theme === CUSTOM ? 'current' : ''}">
      <div class="theme-custom-head">
        <span class="setting-label">${t('theme.customTitle')}</span>
        ${ui.segmented('customMode', [['dark', t('theme.dark')], ['light', t('theme.light')]], custom.mode)}
        <button class="button small" data-action="theme-from-current" title="${t('theme.fromCurrentTip')}">${icon('copy')}<span>${t('theme.fromCurrent')}</span></button>
      </div>
      <div class="theme-colors">${CUSTOM_FIELDS.map((field) => `<label class="theme-color"><input type="color" value="${custom[field]}" data-custom="${field}" /><span>${t(`theme.field.${field}`)}</span></label>`).join('')}</div>
    </div>`;
}

function micBody() {
  const mic = state.mic;
  const options = [`<option value="">${t('mic.default')}</option>`]
    .concat(mic.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${s().micDeviceId === device.id ? 'selected' : ''}>${escapeHtml(device.label)}</option>`));
  return `
    ${settingRow(t('mic.device'), `<select class="select wide" data-select="micDeviceId" aria-label="${t('mic.device')}">${options.join('')}</select>`)}
    ${settingRow(t('mic.gain'), `<span class="quality">
      <input type="range" min="0" max="200" step="5" value="${s().micGain}" data-input="micGain" aria-label="${t('mic.gain')}" />
      <output data-output="micGain">${s().micGain}%</output>
    </span>`)}
    <div class="meter-block">
      <div class="setting-label">${t('mic.level')} <output id="meter-db">-∞ dB</output></div>
      <div class="meter" role="meter" aria-label="${t('mic.level')}" aria-valuemin="-60" aria-valuemax="0">
        <div class="meter-fill" id="meter-fill"></div><div class="meter-peak" id="meter-peak"></div>
      </div>
      <div class="meter-scale">${[-60, -40, -20, -10, 0].map((db) => `<span style="left:${((db + 60) / 60) * 100}%">${db === 0 ? '0 dB' : db}</span>`).join('')}</div>
      <p class="hint">${mic.opening ? t('mic.opening') : escapeHtml(mic.error ?? mic.status ?? t('mic.levelHint'))}</p>
    </div>
    <div class="mic-test">
      <button class="button" data-action="mic-test" ${mic.testing || !micChain ? 'disabled' : ''}>${icon('record')}<span>${mic.testing ? t('mic.testing', { s: mic.testing }) : t('mic.test')}</span></button>
      <audio id="mic-playback" controls ${mic.testUrl ? `src="${mic.testUrl}"` : 'hidden'}></audio>
    </div>`;
}

/** The microphone is open exactly while the Microphone tab is shown. */
async function syncMicChain() {
  const wanted = kind === 'settings' && state.tab === 'mic';
  if (!wanted) closeMicChain();
  render();
  if (wanted && !micChain && !state.mic.opening) await startMicChain();
}

async function startMicChain() {
  closeMicChain();
  state.mic = { ...state.mic, opening: true, error: null };
  render();
  try {
    micChain = await MicrophoneChain.open(s().micDeviceId, s().micGain);
    // Labels only appear once permission is granted, so list after opening.
    state.mic.devices = await listMicrophones().catch(() => []);
  } catch (error) {
    micChain = null;
    state.mic.error = errorText(error);
  }
  state.mic.opening = false;
  if (state.tab !== 'mic') {
    closeMicChain();
    return;
  }
  render();
  let peakHold = 0;
  const tick = () => {
    if (!micChain || state.tab !== 'mic') return;
    const { db } = micChain.level();
    const position = meterPosition(db);
    peakHold = Math.max(position, peakHold - 0.008);
    const fill = root.querySelector('#meter-fill');
    if (fill) {
      fill.style.setProperty('--meter-width', `${fill.parentElement.clientWidth}px`);
      fill.style.width = `${(position * 100).toFixed(1)}%`;
      root.querySelector('#meter-peak').style.left = `${(peakHold * 100).toFixed(1)}%`;
      root.querySelector('#meter-db').textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : '-∞ dB';
    }
    meterFrame = requestAnimationFrame(tick);
  };
  meterFrame = requestAnimationFrame(tick);
}

function closeMicChain() {
  cancelAnimationFrame(meterFrame);
  micChain?.close();
  micChain = null;
  if (state.mic.testUrl) URL.revokeObjectURL(state.mic.testUrl);
  state.mic = { ...state.mic, testing: 0, testUrl: null, status: null };
}

async function testMicrophone() {
  if (!micChain || state.mic.testing) return;
  if (state.mic.testUrl) URL.revokeObjectURL(state.mic.testUrl);
  state.mic.testUrl = null;
  state.mic.testing = 3;
  render();
  const countdown = setInterval(() => {
    state.mic.testing = Math.max(1, state.mic.testing - 1);
    render();
  }, 1000);
  try {
    state.mic.testUrl = await micChain.testRecording(3000);
    state.mic.status = t('mic.testDone');
  } catch (error) {
    state.mic.error = errorText(error);
  } finally {
    clearInterval(countdown);
    state.mic.testing = 0;
    render();
    root.querySelector('#mic-playback')?.play().catch(() => {});
  }
}

// ───────────────────────── about / confirm

function aboutBody() {
  const rows = [
    [t('about.version'), state.info.version || '—'],
    [t('about.platform'), state.info.platform || '—'],
    [t('about.engine'), 'Tauri 2 · Rust (xcap, image) · WebView'],
    [t('about.formats'), `${IMAGE_FORMATS.map((f) => f.toUpperCase()).join(' · ')} / MP4 · WebM`],
    [t('about.data'), t('about.dataValue')],
  ];
  return `
    <div class="about-hero">
      <img src="${appIcon}" alt="" width="72" height="72" />
      <div><strong>MyCapture</strong><span>${t('about.tagline')}</span></div>
    </div>
    <dl class="about-list">${rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    <ul class="about-features">${['about.f1', 'about.f2', 'about.f3', 'about.f4'].map((key) => `<li>${t(key)}</li>`).join('')}</ul>`;
}

function confirmBody() {
  const count = loadGallery(globalThis.localStorage).length;
  return `<p class="confirm-text">${t('gallery.clearBody', { count })}</p>`;
}

// ───────────────────────── theme dropdown

function themeRow(theme) {
  const current = s().theme === theme.id;
  return `<button class="theme-row ${current ? 'current' : ''}" role="menuitemradio" aria-checked="${current}" data-action="theme-set" data-value="${theme.id}">
    ${swatch(theme)}<span>${escapeHtml(themeName(theme, getLanguage()))}</span>${current ? icon('check', 'icon theme-check') : ''}
  </button>`;
}

function renderThemeMenu() {
  const column = (mode) => `<div class="theme-col"><h4>${t(mode === 'dark' ? 'theme.dark' : 'theme.light')}</h4>${THEMES.filter((theme) => theme.mode === mode).map(themeRow).join('')}</div>`;
  const system = s().theme === SYSTEM;
  const custom = s().theme === CUSTOM;
  root.innerHTML = `
    <div class="theme-menu popup-menu" role="menu" aria-label="${t('theme.choose')}">
      <div class="theme-cols">${column('dark')}${column('light')}</div>
      <div class="theme-extra">
        <button class="theme-row ${system ? 'current' : ''}" role="menuitemradio" aria-checked="${system}" data-action="theme-set" data-value="${SYSTEM}">${icon('monitor')}<span>${t('theme.system')}</span>${system ? icon('check', 'icon theme-check') : ''}</button>
        <button class="theme-row ${custom ? 'current' : ''}" role="menuitem" data-action="theme-custom">${swatch(resolveTheme(CUSTOM, s().customTheme))}<span>${t('theme.customEdit')}</span>${custom ? icon('check', 'icon theme-check') : ''}</button>
      </div>
    </div>`;
  // As tall as its content.
  const height = Math.ceil(root.querySelector('.theme-menu').getBoundingClientRect().height);
  appWindow.setSize(new LogicalSize(window.innerWidth, height)).catch(() => {});
  ready();
}

// ───────────────────────── actions

function applySettingsFromStorage() {
  const before = state.settings;
  state.settings = loadSettings(globalThis.localStorage);
  if (before.language !== state.settings.language) setLanguage(state.settings.language);
  applyTheme(currentTheme());
  render();
}

function setTheme(id) {
  update({ theme: id });
  applyTheme(currentTheme());
}

function updateCustom(patch) {
  update({ customTheme: { ...s().customTheme, ...patch }, theme: CUSTOM });
  applyTheme(currentTheme());
}

function close() {
  closeMicChain();
  appWindow.close().catch(() => appWindow.destroy());
}

const actions = {
  close: () => close(),
  'settings-tab': (value) => {
    state.tab = value;
    syncMicChain();
  },
  setting: (value, button) => {
    const key = button.dataset.key;
    if (key === 'language') {
      update({ language: value });
      setLanguage(value);
      setBackendLanguage(value).catch(() => {});
    } else if (key === 'customMode') {
      updateCustom({ mode: value });
    } else {
      const parsed = key === 'fps' ? Number(value) : key === 'sidebarCollapsed' || key === 'historyCollapsed' ? value === 'true' : value;
      update({ [key]: parsed });
      if (key === 'engine' && value === 'native' && s().systemAudio) update({ systemAudio: false });
    }
    render();
  },
  'choose-folder': async (value) => {
    const which = value === 'video' ? 'video' : 'image';
    const directory = await openDialog({ directory: true, multiple: false, title: t('save.chooseFolder'), defaultPath: directoryFor(which) ?? undefined });
    if (typeof directory === 'string') update(which === 'image' ? { imageDirectory: directory } : { videoDirectory: directory });
    render();
  },
  'reset-settings': () => {
    // Keep where files go, the language and the theme; everything else back to defaults.
    const { imageDirectory, videoDirectory, language, theme, customTheme } = s();
    state.settings = { ...defaultSettings, imageDirectory, videoDirectory, language, theme, customTheme };
    storeSettings(globalThis.localStorage, state.settings);
    render();
  },
  'mic-test': () => testMicrophone(),
  'theme-set': (value) => {
    setTheme(value);
    if (kind === 'theme-menu') close();
    else render();
  },
  'theme-custom': async () => {
    await openPopup('settings', { params: { tab: 'theme' } });
    close();
  },
  'theme-from-current': () => {
    const theme = currentTheme();
    const vars = theme.vars;
    updateCustom({
      mode: theme.mode, bg: vars['--bg'], panel: vars['--panel'], text: vars['--text'], muted: vars['--muted'],
      border: vars['--line'], accent: vars['--accent'], danger: vars['--rec'],
    });
    render();
  },
  'gallery-clear-confirm': () => {
    const count = loadGallery(globalThis.localStorage).length;
    // Only the history is cleared; the saved files stay where they are.
    storeGallery(globalThis.localStorage, []);
    notifyMain('success', t('gallery.cleared', { count }));
    close();
  },
};

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  actions[button.dataset.action]?.(button.dataset.value, button);
});

root.addEventListener('change', (event) => {
  const input = event.target;
  if (input.dataset.toggle) {
    update({ [input.dataset.toggle]: input.checked });
    render();
  } else if (input.dataset.select === 'imageFormat') {
    update({ imageFormat: input.value });
    render();
  } else if (input.dataset.select === 'micDeviceId') {
    update({ micDeviceId: input.value || null });
    closeMicChain();
    syncMicChain();
  } else if (input.dataset.input === 'jpegQuality' || input.dataset.input === 'micGain') {
    update({ [input.dataset.input]: Number(input.value) });
  } else if (input.dataset.custom) {
    render();
  }
});

root.addEventListener('input', (event) => {
  const input = event.target;
  if (input.dataset.custom) {
    updateCustom({ [input.dataset.custom]: input.value });
  } else if (input.dataset.input === 'jpegQuality' || input.dataset.input === 'micGain') {
    const suffix = input.dataset.input === 'micGain' ? '%' : '';
    root.querySelectorAll(`[data-output="${input.dataset.input}"]`).forEach((output) => { output.textContent = `${input.value}${suffix}`; });
    if (input.dataset.input === 'micGain') micChain?.setGain(Number(input.value));
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') close();
});

// Other windows changed something: settings, the session, or how this popup should open.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) applySettingsFromStorage();
  else if (event.key === SESSION_KEY || event.key === GALLERY_KEY) render();
  else if (event.key === popupKey(kind)) {
    state.params = popupParams(kind);
    if (state.params.tab && state.params.tab !== state.tab) {
      state.tab = state.params.tab;
      syncMicChain();
    } else {
      render();
    }
  }
});

// A dropdown closes as soon as the user clicks anywhere else.
if (kind === 'theme-menu') {
  window.addEventListener('blur', () => {
    try { globalThis.localStorage?.setItem('mycapture.popup.theme-menu.closedAt', String(Date.now())); } catch { /* ignore */ }
    close();
  });
}

async function initialize() {
  applyTheme(currentTheme());
  render();
  if (kind === 'settings') {
    state.dirs = await defaultDirectories().catch(() => state.dirs);
    await syncMicChain();
  }
  if (kind === 'about') {
    state.info = await platformInfo().catch(() => state.info);
    render();
  }
}

initialize();

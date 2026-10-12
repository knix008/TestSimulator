import './styles.css';
import appIcon from '../assets/icon.svg';
import { version as packageVersion } from '../package.json';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { baseName, formatBytes, formatDuration, joinPath, timestampStem } from './domain/naming.js';
import { elapsedMs, initialSession, isActive, sessionReducer } from './domain/session.js';
import { captureSource, loadSettings, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addToGallery, GALLERY_KEY, loadGallery, removeFromGallery, storeGallery } from './domain/gallery.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import { MediaViewer } from './viewer.js';
import { applyTheme, nextTheme, resolveTheme, SYSTEM, themeName } from './themes.js';
import { openPopup, SESSION_KEY } from './platform/popups.js';
import { escapeHtml, widgets } from './ui.js';
import {
  APP_SOURCE, beginRegionSelect, copyImageFile, copyPending, copyText, defaultDirectories, errorText, grab, isDesktopShell, listSources,
  monitorInfo, openPath, platformInfo, recordingAbort, recordingFinish, recordingOpen, revealPath,
  hideRecordingPanel, pathsExist, previewUrl, savePending, setBackendLanguage, setSelfRecording, showMain, showRecordingPanel, sourceThumbnail,
} from './platform/native.js';
import { encoderWarm, recordingSupport, ScreenRecorder, warmUpEncoder } from './platform/recorder.js';

const root = document.querySelector('#app');
const desktop = isDesktopShell();

const state = {
  settings: loadSettings(globalThis.localStorage),
  platform: null,
  version: '',
  dirs: { pictures: null, videos: null },
  monitors: [],
  windows: [],
  windowFilter: '',
  thumbs: new Map(),
  preview: null, // { url, caption }
  previewLoading: false,
  regionThumb: null,
  result: null, // { kind: 'image'|'video', path, bytes, width, height, durationMs, thumbnail }
  busy: null,
  session: initialSession,
  notice: null,
  support: recordingSupport(),
  maximized: false,
  viewing: null, // id of the history item shown in the viewer
  gallery: loadGallery(globalThis.localStorage),
  missing: new Set(), // gallery ids whose file is gone
  selfRecording: false, // the recording in progress is of MyCapture's own window
};

let recorder = null;
let recordingId = null;
let regionPurpose = null;
let clock = null;
let previewTicket = 0;
let viewer = null; // MediaViewer showing a capture from the history
let recordingPanel = false; // the floating "recbar" controls are up

/** "MyCapture v1.0": name plus major.minor, shown in the title bar and the taskbar. */
const APP_TITLE = `MyCapture v${packageVersion.split('.').slice(0, 2).join('.')}`;

/** Long edge of preview images: sharp up to a full-HD-sized preview area. */
const PREVIEW_EDGE = 1920;

const s = () => state.settings;
const ui = widgets(s);
const locked = () => isActive(state.session) || Boolean(state.busy);

// ───────────────────────── state helpers

function update(patch) {
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
}

function notify(kind, text) {
  state.notice = text ? { kind, text } : null;
  renderStatus();
}

function dispatch(action) {
  state.session = sessionReducer(state.session, action);
  try { globalThis.localStorage?.setItem(SESSION_KEY, state.session.phase); } catch { /* popups just won't lock */ }
  if (recordingPanel) emit('recording-state', state.session).catch(() => {});
  render();
}

async function task(label, work) {
  if (state.busy) return;
  state.busy = label;
  render();
  try {
    await work();
  } catch (error) {
    notify('error', errorText(error));
  } finally {
    state.busy = null;
    render();
  }
}

// Some drivers report no friendly name ("Unknown Monitor 65537"); number those instead.
const monitorName = (monitor, index = state.monitors.indexOf(monitor)) => {
  const name = monitor?.name?.trim();
  return name && !name.startsWith('Unknown Monitor') ? name : t('monitor.name', { n: index + 1 });
};

function primaryMonitor() {
  return state.monitors.find((monitor) => monitor.primary) ?? state.monitors[0] ?? null;
}

function selectedWindow() {
  return state.windows.find((window) => window.id === s().windowId) ?? null;
}

function sourceLabel() {
  const settings = s();
  if (settings.target === 'window') return selectedWindow()?.title ?? t('source.pickWindow');
  if (settings.target === 'region') {
    const region = settings.region;
    if (!region) return t('source.pickRegion');
    const monitor = state.monitors.find((item) => item.id === region.monitorId);
    return `${monitor ? monitorName(monitor) : t('source.display')} · ${region.width} × ${region.height}`;
  }
  if (settings.monitorId == null) {
    return settings.mode === 'record' ? monitorName(primaryMonitor()) : t('monitor.all');
  }
  const monitor = state.monitors.find((item) => item.id === settings.monitorId);
  return monitor ? monitorName(monitor) : t('source.display');
}

function desktopSize() {
  if (!state.monitors.length) return null;
  const left = Math.min(...state.monitors.map((m) => m.x));
  const top = Math.min(...state.monitors.map((m) => m.y));
  const right = Math.max(...state.monitors.map((m) => m.x + m.width));
  const bottom = Math.max(...state.monitors.map((m) => m.y + m.height));
  return { width: right - left, height: bottom - top };
}

/** Source for the in-app recording engine: one monitor, never the whole desktop. */
function recordSource() {
  const source = captureSource(s());
  if (source?.kind === 'allMonitors') {
    const primary = primaryMonitor();
    return primary ? { kind: 'monitor', id: primary.id } : null;
  }
  return source;
}

const usesPicker = () => s().mode === 'record' && s().engine === 'display';
const directoryFor = (kind) => (kind === 'image' ? s().imageDirectory ?? state.dirs.pictures : s().videoDirectory ?? state.dirs.videos);

// ───────────────────────── rendering

function render() {
  if (!root.firstElementChild) {
    root.innerHTML = `
      <div class="app">
        <header class="bar" id="bar"></header>
        <div class="toolbar" id="toolbar" role="toolbar"></div>
        <div class="body" id="body">
          <aside class="panel sources" id="sources"></aside>
          <div class="splitter" data-split="left" role="separator" aria-orientation="vertical"></div>
          <main class="stage" id="stage"></main>
          <div class="splitter" data-split="right" role="separator" aria-orientation="vertical"></div>
          <aside class="panel history" id="history"></aside>
        </div>
        <footer class="status" id="status" role="status" aria-live="polite"></footer>
      </div>`;
  }
  const body = root.querySelector('#body');
  body.classList.toggle('left-collapsed', s().sidebarCollapsed);
  body.classList.toggle('right-collapsed', s().historyCollapsed);
  root.querySelector('#toolbar').setAttribute('aria-label', t('tool.settings'));
  renderBar();
  renderSources();
  renderToolbar();
  renderStage();
  renderGallery();
  renderStatus();
  applyPanelWidths();
}

// ───────────────────────── themes

const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const currentTheme = () => resolveTheme(s().theme, s().customTheme, prefersDark());

function setTheme(id) {
  update({ theme: id });
  applyTheme(currentTheme());
  render();
}

/** Opens the theme dropdown window under the ▾ button (it may extend past the main window). */
function toggleThemeMenu() {
  // The dropdown closes itself when it loses focus — which is what clicking ▾ again does.
  const closedAt = Number(globalThis.localStorage?.getItem('mycapture.popup.theme-menu.closedAt') ?? 0);
  if (Date.now() - closedAt < 400) return;
  const caret = root.querySelector('[data-action="theme-menu"]').getBoundingClientRect();
  const width = 460;
  openPopup('theme-menu', { anchor: { x: window.screenX + caret.right - width, y: window.screenY + caret.bottom + 4 } }).catch(reportError);
}

// ───────────────────────── side panels: widths and splitters

const PANEL_FLOOR = 200;
const PANEL_MAX = 480;

/**
 * Smallest width of either side panel (both share it): the left panel's tab row
 * with every label on one line, and never under PANEL_FLOOR. While the left panel
 * is collapsed its tabs are not on the page, so the last measurement stands.
 */
function panelMinWidth() {
  const tabs = root.querySelector('#sources .targets');
  if (!tabs) return state.panelMin ?? 220;
  const style = getComputedStyle(tabs);
  const gap = parseFloat(style.columnGap) || 0;
  const segments = [...tabs.children];
  const content = segments.reduce((sum, segment) => sum + segment.scrollWidth, 0) + gap * (segments.length - 1);
  const frame = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  const panel = getComputedStyle(root.querySelector('#sources'));
  return Math.max(PANEL_FLOOR, Math.ceil(content + frame + parseFloat(panel.paddingLeft) + parseFloat(panel.paddingRight) + 1));
}

function applyPanelWidths() {
  const body = root.querySelector('#body');
  if (!body) return;
  const min = panelMinWidth();
  state.panelMin = min;
  const left = Math.min(PANEL_MAX, Math.max(min, s().leftWidth ?? 300));
  const right = Math.min(PANEL_MAX, Math.max(min, s().rightWidth ?? 260));
  body.style.setProperty('--left-width', `${left}px`);
  body.style.setProperty('--right-width', `${right}px`);
}

function startSplitDrag(event, side) {
  const body = root.querySelector('#body');
  const startX = event.clientX;
  const startWidth = root.querySelector(side === 'left' ? '#sources' : '#history').getBoundingClientRect().width;
  const min = state.panelMin ?? 220;
  let width = startWidth;
  const move = (moveEvent) => {
    const delta = moveEvent.clientX - startX;
    width = Math.min(PANEL_MAX, Math.max(min, startWidth + (side === 'left' ? delta : -delta)));
    body.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${Math.round(width)}px`);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    body.classList.remove('resizing');
    update(side === 'left' ? { leftWidth: Math.round(width) } : { rightWidth: Math.round(width) });
  };
  body.classList.add('resizing');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function renderBar() {
  const settings = s();
  const platform = state.platform ?? t('app.browser');
  const bar = root.querySelector('#bar');
  // The whole bar drags the frameless window; buttons inside stay clickable.
  bar.setAttribute('data-tauri-drag-region', '');
  bar.innerHTML = `
    <div class="brand" data-tauri-drag-region><img class="brand-icon" src="${appIcon}" alt="" data-tauri-drag-region /><span data-tauri-drag-region>MyCapture</span><span class="brand-version" data-tauri-drag-region>${APP_TITLE.slice('MyCapture '.length)}</span></div>
    <nav class="modes" role="tablist" aria-label="${t('mode.label')}">
      ${['capture', 'record'].map((mode) => `
        <button role="tab" class="mode ${settings.mode === mode ? 'active' : ''}" aria-selected="${settings.mode === mode}"
          data-action="mode" data-value="${mode}" ${locked() && settings.mode !== mode ? 'disabled' : ''}>
          ${icon(mode === 'capture' ? 'camera' : 'video')}<span>${t(`mode.${mode}`)}</span>
        </button>`).join('')}
    </nav>
    <div class="bar-end" data-tauri-drag-region>
      <span class="pill" title="${t('app.platform')}" data-tauri-drag-region>${escapeHtml(platform)}</span>
      <button class="bar-button flag-button" data-action="language" title="${t('lang.switch')}" aria-label="${t('lang.switch')}">${switchFlag(getLanguage())}</button>
      <span class="theme-split">
        <button class="bar-button" data-action="theme-next" title="${escapeHtml(`${t('theme.next')} — ${themeName(currentTheme(), getLanguage())}`)}" aria-label="${t('theme.next')}">${icon('palette')}</button>
        <button class="bar-button caret" data-action="theme-menu" title="${t('theme.choose')}" aria-label="${t('theme.choose')}" aria-haspopup="menu">${icon('chevronDown')}</button>
      </span>
      <button class="bar-button" data-action="open-settings" title="${t('settings.title')}" aria-label="${t('settings.title')}">${icon('gear')}</button>
      <button class="bar-button" data-action="open-about" title="${t('about.title')}" aria-label="${t('about.title')}">${icon('info')}</button>
      ${desktop ? `<div class="window-controls">
        <button class="window-button" data-action="win-minimize" title="${t('win.minimize')}" aria-label="${t('win.minimize')}">${icon('winMinimize')}</button>
        <button class="window-button" data-action="win-maximize" title="${t(state.maximized ? 'win.restore' : 'win.maximize')}" aria-label="${t(state.maximized ? 'win.restore' : 'win.maximize')}">${icon(state.maximized ? 'winRestore' : 'winMaximize')}</button>
        <button class="window-button close" data-action="win-close" title="${t('win.close')}" aria-label="${t('win.close')}">${icon('close')}</button>
      </div>` : ''}
    </div>`;
}

function targetTabs() {
  const tabs = ['monitor', 'window', 'region'];
  return `<div class="segmented targets" role="radiogroup" aria-label="${t('target.kinds')}">
    ${tabs.map((value) => `
      <button role="radio" class="segment ${s().target === value ? 'active' : ''}" aria-checked="${s().target === value}"
        data-action="target" data-value="${value}" ${locked() ? 'disabled' : ''}>${icon(value)}<span>${t(`target.${value}`)}</span></button>`).join('')}
  </div>`;
}

function renderSources() {
  const settings = s();
  const panel = root.querySelector('#sources');
  panel.setAttribute('aria-label', t('target.label'));

  if (settings.sidebarCollapsed) {
    // Collapsed: a slim strip that still names the panel and shows the current source.
    panel.innerHTML = `
      <button class="rail" data-action="sidebar" title="${t('sidebar.expand')}" aria-label="${t('sidebar.expand')}" aria-expanded="false">
        ${icon('chevronRight', 'icon rail-chevron')}
        ${icon('target', 'icon rail-icon')}
        <span class="rail-title">${t('target.label')}</span>
        ${icon(settings.target, 'icon rail-icon')}
        <span class="rail-sub">${escapeHtml(t(`target.${settings.target}`))}</span>
      </button>`;
    return;
  }

  const picker = usesPicker() && settings.target !== 'region';
  let body = '';
  if (settings.target === 'monitor') {
    const allOption = settings.mode === 'capture'
      ? sourceItem({ action: 'monitor', value: 'all', selected: settings.monitorId == null, glyph: 'region', title: t('monitor.all'), detail: t('monitor.allDetail', { count: state.monitors.length }) })
      : '';
    const list = state.monitors.map((monitor, index) => sourceItem({
      action: 'monitor',
      value: monitor.id,
      selected: settings.monitorId === monitor.id || (settings.mode === 'record' && settings.monitorId == null && monitor === primaryMonitor()),
      glyph: 'monitor',
      title: monitorName(monitor, index),
      detail: `${monitor.width} × ${monitor.height} · ${Math.round(monitor.scaleFactor * 100)}%`,
      badge: monitor.primary ? t('monitor.primary') : '',
    })).join('');
    body = `<div class="list">${allOption}${list || emptyList(t('monitor.none'))}</div>`;
  } else if (settings.target === 'window') {
    const filter = state.windowFilter.trim().toLowerCase();
    const windows = state.windows.filter((window) => !filter || `${window.title} ${window.appName}`.toLowerCase().includes(filter));
    body = `
      <label class="search"><span class="sr-only">${t('window.search')}</span>
        <input type="search" placeholder="${t('window.searchPlaceholder')}" value="${escapeHtml(state.windowFilter)}" data-input="windowFilter" />
      </label>
      <div class="list windows">${windows.map((window) => sourceItem({
        action: 'window',
        value: window.id,
        selected: settings.windowId === window.id,
        thumb: state.thumbs.get(window.id),
        glyph: 'window',
        title: window.title,
        detail: `${window.appName || t('window.app')} · ${window.width} × ${window.height}`,
      })).join('') || emptyList(t(filter ? 'window.noMatch' : 'window.none'))}</div>`;
  } else {
    const region = settings.region;
    const monitor = region && state.monitors.find((item) => item.id === region.monitorId);
    body = region
      ? `<div class="region-card">
          ${state.regionThumb ? `<img src="${state.regionThumb}" alt="" />` : `<div class="region-glyph">${icon('region')}</div>`}
          <dl>
            <div><dt>${t('region.screen')}</dt><dd>${escapeHtml(monitor ? monitorName(monitor) : t('region.disconnected'))}</dd></div>
            <div><dt>${t('region.position')}</dt><dd>${region.x}, ${region.y}</dd></div>
            <div><dt>${t('region.size')}</dt><dd>${region.width} × ${region.height}</dd></div>
          </dl>
          <button class="button" data-action="select-region" ${locked() ? 'disabled' : ''}>${icon('region')}<span>${t('region.reselect')}</span></button>
        </div>`
      : `<div class="empty">
          <p>${t('region.emptyHint')}</p>
          <button class="button" data-action="select-region" ${locked() ? 'disabled' : ''}>${icon('region')}<span>${t('region.select')}</span></button>
        </div>`;
  }

  panel.innerHTML = `
    <div class="panel-head">
      <h2>${icon('target')}<span>${t('target.label')}</span></h2>
      <div class="panel-head-actions">
        <button class="icon-button" data-action="refresh" title="${t('target.refresh')}" aria-label="${t('target.refresh')}" ${locked() ? 'disabled' : ''}>${icon('refresh')}</button>
        <button class="icon-button" data-action="sidebar" title="${t('sidebar.collapse')}" aria-label="${t('sidebar.collapse')}" aria-expanded="true">${icon('chevronLeft')}</button>
      </div>
    </div>
    ${targetTabs()}
    ${settings.selfMode ? `<p class="hint">${t('self.hint')}</p>`
      : picker ? `<p class="hint">${t(settings.target === 'window' ? 'picker.hintWindow' : 'picker.hintMonitor')}</p>` : ''}
    <div class="source-body ${picker || settings.selfMode ? 'dimmed' : ''}">${body}</div>`;
  if (settings.target === 'window') loadWindowThumbs();
}

function sourceItem({ action, value, selected, glyph, thumb, title, detail, badge }) {
  return `<button class="item ${selected ? 'selected' : ''}" data-action="${action}" data-value="${value}" aria-pressed="${selected}" ${locked() ? 'disabled' : ''}>
    <span class="item-visual">${thumb ? `<img src="${thumb}" alt="" />` : icon(glyph)}</span>
    <span class="item-text"><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
    ${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ''}
  </button>`;
}

const emptyList = (text) => `<p class="empty-line">${escapeHtml(text)}</p>`;

function renderStage() {
  const settings = s();
  const session = state.session;
  const stage = root.querySelector('#stage');
  const recordingLive = ['recording', 'paused', 'stopping'].includes(session.phase);

  if (!stage.firstElementChild) {
    stage.innerHTML = `
      <div class="preview" id="preview">
        <video id="live" muted playsinline hidden></video>
        <div id="preview-still"></div>
        <div class="viewer" id="viewer" hidden></div>
        <div class="rec-badge" id="rec-badge" hidden><i></i><span id="rec-time">00:00</span></div>
      </div>
      <div class="preview-caption" id="preview-caption"></div>
      <div class="actions" id="actions"></div>
      <div id="result"></div>`;
    viewer = new MediaViewer(stage.querySelector('#viewer'), {
      onClose: () => closeViewer(),
      onOpenExternal: (item) => openPath(item.path).catch(reportError),
      onReveal: (item) => revealPath(item.path).catch(reportError),
    });
  }

  // Recording itself, the window must not show the recording: each frame would hold
  // the previous one, a picture-in-picture tunnel that shifts all the time.
  const mirror = recordingLive && state.selfRecording;
  const live = stage.querySelector('#live');
  live.hidden = !recordingLive || mirror;
  if (recordingLive && recorder && !live.srcObject) {
    live.srcObject = recorder.previewStream;
    live.play().catch(() => {});
  }
  if (!recordingLive && live.srcObject) live.srcObject = null;

  const viewing = Boolean(viewer?.open) && !recordingLive;
  const still = stage.querySelector('#preview-still');
  still.hidden = (recordingLive && !mirror) || viewing;
  if (mirror) {
    still.innerHTML = placeholder('self', t('self.recording'), '');
  } else if (!recordingLive && !viewing) {
    if (settings.selfMode) {
      still.innerHTML = placeholder('self', t('source.self'), t('self.hint'));
    } else if (usesPicker() && settings.target !== 'region') {
      still.innerHTML = placeholder('video', t('preview.pickerTitle'), t('preview.pickerDetail'));
    } else if (state.preview?.url) {
      still.innerHTML = `<img src="${state.preview.url}" alt="${t('preview.alt')}" />${state.previewLoading ? '<span class="spinner"></span>' : ''}`;
    } else {
      still.innerHTML = state.previewLoading
        ? '<span class="spinner"></span>'
        : placeholder(settings.target, t(settings.target === 'window' ? 'preview.pickWindow' : settings.target === 'region' ? 'preview.pickRegion' : 'preview.failed'), '');
    }
  }

  const badge = stage.querySelector('#rec-badge');
  badge.hidden = !recordingLive;
  badge.classList.toggle('paused', session.phase === 'paused');
  updateClock();

  const shown = viewing ? galleryItem(state.viewing) : null;
  stage.querySelector('#preview-caption').innerHTML = shown
    ? `<span>${icon('images')}<b>${t('gallery.title')}</b></span>
      <span>${escapeHtml([shown.width ? `${shown.width} × ${shown.height}` : '', shown.durationMs != null ? formatDuration(shown.durationMs) : '', shown.bytes ? formatBytes(shown.bytes) : ''].filter(Boolean).join(' · '))}</span>`
    : (recordingLive ? state.selfRecording : settings.selfMode)
      ? `<span>${icon('self')}<b>${t('source.self')}</b></span>
      <span>${recordingLive ? escapeHtml(baseName(session.outputPath)) : ''}</span>`
    : `<span>${icon(settings.target)}<b>${escapeHtml(usesPicker() && settings.target !== 'region' ? t('picker.name') : sourceLabel())}</b></span>
      <span>${recordingLive ? escapeHtml(baseName(session.outputPath)) : state.preview?.caption ?? ''}</span>`;

  stage.querySelector('#actions').innerHTML = settings.mode === 'capture' ? captureActions() : recordActions();
  stage.querySelector('#result').innerHTML = resultCard();
}

const placeholder = (glyph, title, detail) =>
  `<div class="placeholder">${icon(glyph, 'placeholder-icon')}<strong>${escapeHtml(title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;

/** Round shutter button in the middle, secondary actions either side. */
function actionRow(left, center, right, note = '') {
  return `<div class="action-side left">${left}</div><div class="action-center">${center}</div><div class="action-side right">${right}</div>${note}`;
}

/** Icon-only round shutter; the action's name lives in the tooltip and aria-label. */
function shutter(action, glyph, label, variant, disabled) {
  return `<button class="shutter ${variant}" data-action="${action}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}>
    <span class="shutter-disc">${icon(glyph)}</span>
  </button>`;
}

const busyNote = () => (state.busy ? `<span class="busy"><span class="spinner small"></span>${escapeHtml(state.busy)}</span>` : '');

function captureActions() {
  const settings = s();
  const busy = Boolean(state.busy) || !desktop;
  const format = settings.imageFormat.toUpperCase();
  if (settings.selfMode) {
    return actionRow('', shutter('capture', 'camera', t('action.captureSelf', { format }), 'capture', busy), busyNote());
  }
  const region = settings.target === 'region';
  const disabled = busy || (settings.target === 'window' && !selectedWindow());
  const again = region && settings.region
    ? `<button class="round-button" data-action="recapture-region" title="${t('action.recaptureRegion')}" aria-label="${t('action.recaptureRegion')}" ${busy ? 'disabled' : ''}>${icon('repeat')}</button>`
    : '';
  return actionRow('', shutter('capture', 'camera', `${t(region ? 'action.captureRegion' : 'action.capture')} (${format})`, 'capture', disabled),
    again + busyNote());
}

function unsupportedReason() {
  const settings = s();
  const support = state.support;
  if (!support.recorder) return t('unsupported.recorder');
  if (settings.engine === 'display' && !support.display) return t('unsupported.display');
  if (!support.formats[settings.videoFormat]) return t('unsupported.format', { format: settings.videoFormat.toUpperCase() });
  return '';
}

function recordActions() {
  const settings = s();
  const phase = state.session.phase;
  if (phase === 'recording' || phase === 'paused') {
    const pauseKey = phase === 'recording' ? 'action.pause' : 'action.resume';
    return actionRow(
      `<button class="round-button ${phase === 'recording' ? 'pause' : 'resume'}" data-action="${phase === 'recording' ? 'pause' : 'resume'}" title="${t(pauseKey)}" aria-label="${t(pauseKey)}">${icon(phase === 'recording' ? 'pause' : 'play')}</button>`,
      shutter('stop', 'stop', t('action.stop'), 'stop', false),
      '',
    );
  }
  if (phase === 'starting' || phase === 'stopping') {
    return actionRow('', shutter('record', 'video', t(phase === 'starting' ? 'busy.preparing' : 'busy.finishing'), 'record busy', true), '<span class="spinner small"></span>');
  }
  const format = settings.videoFormat.toUpperCase();
  if (settings.selfMode) {
    // Itself is always recorded with the in-app engine, so the picker's support doesn't matter.
    const support = state.support;
    const unsupported = !support.recorder ? t('unsupported.recorder') : !support.formats[settings.videoFormat] ? t('unsupported.format', { format }) : '';
    const disabled = !desktop || Boolean(state.busy) || Boolean(unsupported) || !support.canvas;
    return actionRow('', shutter('record', 'video', t('action.recordSelf', { format }), 'record', disabled), busyNote(),
      unsupported ? `<p class="hint warn action-note">${escapeHtml(unsupported)}</p>` : '');
  }
  const unsupported = unsupportedReason();
  const needsTarget = (settings.engine === 'native' || settings.target === 'region') && !recordSource();
  const disabled = !desktop || Boolean(state.busy) || Boolean(unsupported) || needsTarget;
  const selectRegion = settings.target === 'region'
    ? `<button class="round-button" data-action="select-region" title="${t('region.select')}" aria-label="${t('region.select')}" ${state.busy ? 'disabled' : ''}>${icon('region')}</button>`
    : '';
  return actionRow(selectRegion, shutter('record', 'video', `${t('action.record')} (${format})`, 'record', disabled),
    busyNote(),
    unsupported ? `<p class="hint warn action-note">${escapeHtml(unsupported)}</p>` : '');
}

/** Shown only for a capture whose save dialog was cancelled; saved ones live in the gallery. */
function resultCard() {
  const result = state.result;
  if (!result || result.path) return '';
  const saved = Boolean(result.path);
  const meta = [
    result.width ? `${result.width} × ${result.height}` : '',
    result.durationMs != null ? formatDuration(result.durationMs) : '',
    result.bytes ? formatBytes(result.bytes) : '',
  ].filter(Boolean).join(' · ');
  return `<section class="result" aria-label="${t('result.label')}">
    <div class="result-thumb">${result.thumbnail ? `<img src="${result.thumbnail}" alt="" />` : icon(result.kind === 'video' ? 'video' : 'camera')}</div>
    <div class="result-text">
      <strong title="${escapeHtml(result.path ?? '')}">${escapeHtml(saved ? baseName(result.path) : t('result.unsaved'))}</strong>
      <small>${escapeHtml(meta)}</small>
    </div>
    <div class="result-actions">
      ${saved ? `
        <button class="icon-button" data-action="open-result" title="${t('result.open')}" aria-label="${t('result.open')}">${icon('open')}</button>
        <button class="icon-button" data-action="reveal-result" title="${t('result.reveal')}" aria-label="${t('result.reveal')}">${icon('folder')}</button>` : `
        <button class="icon-button" data-action="save-result" title="${t('result.save')}" aria-label="${t('result.save')}" ${state.busy ? 'disabled' : ''}>${icon('save')}</button>`}
      ${result.kind === 'image' ? `<button class="icon-button" data-action="copy-result" title="${t('result.copy')}" aria-label="${t('result.copy')}">${icon('copy')}</button>` : ''}
    </div>
  </section>`;
}

// ───────────────────────── capture history (right panel)

function renderGallery() {
  const host = root.querySelector('#history');
  if (!host) return;
  const items = state.gallery;
  host.setAttribute('aria-label', t('gallery.title'));
  if (s().historyCollapsed) {
    host.innerHTML = `
      <button class="rail" data-action="history-panel" title="${t('history.expand')}" aria-label="${t('history.expand')}" aria-expanded="false">
        ${icon('chevronLeft', 'icon rail-chevron')}
        ${icon('images', 'icon rail-icon')}
        <span class="rail-title">${t('gallery.title')}</span>
        <span class="gallery-count">${items.length}</span>
      </button>`;
    return;
  }
  // A list that grows downward: oldest first, newest at the bottom. It follows new
  // entries when the user is at the bottom, and stays put while they look further up.
  const list = host.querySelector('.history-list');
  const scroll = list?.scrollTop ?? 0;
  const atBottom = !list || list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
  host.innerHTML = `
    <div class="panel-head">
      <h2>${icon('images')}<span>${t('gallery.title')}</span><span class="gallery-count">${items.length}</span></h2>
      <div class="panel-head-actions">
        <button class="icon-button" data-action="history-panel" title="${t('history.collapse')}" aria-label="${t('history.collapse')}" aria-expanded="true">${icon('chevronRight')}</button>
      </div>
    </div>
    <button class="text-button danger history-clear" data-action="gallery-clear" ${items.length ? '' : 'disabled'}>${icon('trash')}<span>${t('gallery.clear')}</span></button>
    <div class="history-list" role="list">${items.length ? [...items].reverse().map(galleryTile).join('') : `<p class="gallery-empty">${t('gallery.empty')}</p>`}</div>`;
  const next = host.querySelector('.history-list');
  next.scrollTop = atBottom ? next.scrollHeight : scroll;
}

function galleryTile(item) {
  const name = baseName(item.path);
  const missing = state.missing.has(item.id);
  const meta = [
    item.width ? `${item.width} × ${item.height}` : '',
    item.durationMs != null ? formatDuration(item.durationMs) : '',
    item.bytes ? formatBytes(item.bytes) : '',
  ].filter(Boolean).join(' · ');
  const extension = (name.split('.').pop() ?? '').toUpperCase();
  const title = `${name}${meta ? `\n${meta}` : ''}${missing ? `\n${t('gallery.missing')}` : ''}`;
  const selected = state.viewing === item.id;
  return `<div class="tile ${item.kind} ${missing ? 'missing' : ''} ${selected ? 'selected' : ''}" data-id="${item.id}">
    <button class="tile-open" data-action="gallery-open" data-value="${item.id}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${t('viewer.view')}: ${name}`)}" aria-pressed="${selected}">
      <span class="tile-image">
        ${item.thumbnail ? `<img src="${item.thumbnail}" alt="" loading="lazy" />` : `<span class="tile-placeholder">${icon(item.kind === 'video' ? 'video' : 'camera')}</span>`}
        ${item.kind === 'video' ? `<span class="tile-play" aria-hidden="true">${icon('play')}</span>
          <span class="tile-video">${icon('video')}<span>${t('gallery.video')}${item.durationMs != null ? ` · ${formatDuration(item.durationMs)}` : ''}</span></span>` : ''}
        <span class="tile-format">${missing ? t('gallery.missingShort') : escapeHtml(extension)}</span>
      </span>
      <span class="tile-caption"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(meta)}</small></span>
    </button>
    <button class="tile-action reveal" data-action="gallery-reveal" data-value="${item.id}" title="${t('result.reveal')}" aria-label="${t('result.reveal')}" ${missing ? 'disabled' : ''}>${icon('folder')}</button>
    <button class="tile-action delete" data-action="gallery-delete" data-value="${item.id}" title="${t('gallery.delete')}" aria-label="${escapeHtml(`${t('gallery.delete')}: ${name}`)}">${icon('trash')}</button>
  </div>`;
}

/** Small JPEG for the history, so it stays light in storage. */
async function smallThumbnail(dataUrl, maxWidth = 192) {
  if (!dataUrl) return null;
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    return null;
  }
}

async function addGalleryItem(item) {
  const thumbnail = await smallThumbnail(item.thumbnail);
  state.gallery = addToGallery(state.gallery, { ...item, thumbnail });
  storeGallery(globalThis.localStorage, state.gallery);
  renderGallery();
  const list = root.querySelector('.history-list');
  list?.scrollTo({ top: list.scrollHeight });
}

const galleryItem = (id) => state.gallery.find((item) => item.id === id);

/** Shows a capture from the history in the preview area (zoom for images, playback for videos). */
async function openViewer(id) {
  const item = galleryItem(id);
  if (!item) return;
  if (isActive(state.session)) {
    notify('warn', t('viewer.busyRecording'));
    return;
  }
  if (state.viewing === id && viewer?.open) return;
  try {
    const url = await previewUrl(item.path);
    if (!url) {
      state.missing.add(id);
      renderGallery();
      notify('error', t('viewer.error'));
      return;
    }
    viewer.show(item, url);
    state.viewing = id;
    renderGallery();
    renderStage();
  } catch (error) {
    reportError(error);
  }
}

function closeViewer() {
  if (!state.viewing && !viewer?.open) return;
  viewer?.close();
  state.viewing = null;
  renderGallery();
  renderStage();
}

/** Removes entries from the history. The files themselves are never touched. */
function deleteGalleryItems(ids) {
  const items = state.gallery.filter((item) => ids.includes(item.id));
  if (!items.length) return;
  if (ids.includes(state.viewing)) closeViewer();
  state.gallery = removeFromGallery(state.gallery, ids);
  for (const id of ids) state.missing.delete(id);
  storeGallery(globalThis.localStorage, state.gallery);
  renderGallery();
  notify('success', ids.length === 1 ? t('gallery.deleted', { name: baseName(items[0].path) }) : t('gallery.cleared', { count: items.length }));
}

/** Marks history entries whose file was moved or deleted outside MyCapture. */
async function checkGalleryFiles() {
  if (!desktop || !state.gallery.length) return;
  try {
    const exists = await pathsExist(state.gallery.map((item) => item.path));
    state.missing = new Set(state.gallery.filter((_, index) => !exists[index]).map((item) => item.id));
    renderGallery();
  } catch { /* the strip still works without the marks */ }
}

// ───────────────────────── toolbar

/** The quick options of the current mode, in one wrapping row under the title bar. */
function renderToolbar() {
  const settings = s();
  const active = isActive(state.session);
  const support = state.support;
  const native = settings.engine === 'native';

  const groups = [selfModeChip(active), ...(settings.mode === 'capture'
    ? [
      tool(t('tool.format'), ui.imageFormatSelect(), 'fileFormat'),
      settings.imageFormat === 'jpg'
        ? tool(t('tool.quality'), ui.qualitySlider(), 'quality')
        : tool('', `<span class="tool-note">${icon('info')}<span>${escapeHtml(t(`format.note.${settings.imageFormat}`))}</span></span>`),
      `<div class="tool-chips">${chip('copyToClipboard', 'copy', t('tool.clipboard'), t('tool.clipboardTip'))}</div>`,
    ]
    : [
      tool(t('tool.engine'), ui.segmented('engine', [['display', t('tool.engineDisplay')], ['native', t('tool.engineNative')]], settings.engine, active,
        { display: t('tool.engineDisplayTip'), native: t('tool.engineNativeTip') }), 'engine'),
      tool(t('tool.format'), ui.segmented('videoFormat', [['mp4', `MP4${support.formats.mp4 ? '' : ' ✕'}`], ['webm', `WebM${support.formats.webm ? '' : ' ✕'}`]], settings.videoFormat, active), 'fileFormat'),
      tool('FPS', ui.segmented('fps', [[15, '15'], [30, '30'], [60, '60']], settings.fps, active), 'fps'),
      `<div class="tool-chips">
        ${chip('systemAudio', 'speaker', t('tool.systemAudio'), t(native ? 'tool.systemAudioNativeTip' : 'tool.systemAudioTip'), active || native)}
        <span class="chip-group">
          ${chip('microphone', 'mic', t('tool.microphone'), support.microphone ? t('tool.microphoneTip') : t('tool.unsupported'), active || !support.microphone)}
          <button class="chip chip-tail" data-action="open-mic" title="${t('tool.micSettings')}" aria-label="${t('tool.micSettings')}" ${active || !support.microphone ? 'disabled' : ''}>${icon('sliders')}</button>
        </span>
      </div>`,
    ])];

  root.querySelector('#toolbar').innerHTML = groups.join('<span class="tool-divider" aria-hidden="true"></span>');
}

/**
 * Toggle for "self mode": while on, the capture/record shutter takes MyCapture's own
 * window instead of the selected source. Locked (but still showing its state) while recording.
 */
function selfModeChip(disabled) {
  const on = s().selfMode;
  return `<div class="tool-chips"><button class="chip ${on ? 'on' : ''}" data-action="self-mode" aria-pressed="${on}"
    title="${escapeHtml(t('tool.selfModeTip'))}" ${disabled ? 'disabled' : ''}>${icon('self')}<span>${t('tool.selfMode')}</span></button></div>`;
}

/** One toolbar group: icon + label, then its control. */
function tool(label, control, glyph = null) {
  return `<div class="tool">${label ? `<span class="tool-label">${glyph ? icon(glyph) : ''}<span>${label}</span></span>` : ''}${control}</div>`;
}

function chip(key, glyph, label, title, disabled = false) {
  const on = Boolean(s()[key]) && !disabled;
  return `<button class="chip ${on ? 'on' : ''}" data-action="toggle" data-key="${key}" aria-pressed="${on}"
    title="${escapeHtml(title)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}<span>${label}</span></button>`;
}

function renderStatus() {
  const notice = state.notice;
  const status = root.querySelector('#status');
  if (!status) return;
  status.className = `status ${notice ? `status-${notice.kind}` : ''}`;
  status.innerHTML = notice
    ? `<span class="status-text">${escapeHtml(notice.text)}</span><button class="icon-button small" data-action="dismiss" aria-label="${t('status.dismiss')}" title="${t('status.dismiss')}">${icon('close')}</button>`
    : `<span class="status-text muted">${t(desktop ? 'app.ready' : 'app.browserPreview')}</span>`;
  if (desktop && !state.maximized) {
    status.insertAdjacentHTML('beforeend', `<span class="resize-grip" data-resize title="${t('resize.grip')}" aria-hidden="true"></span>`);
  }
}

function updateClock() {
  const time = root.querySelector('#rec-time');
  const ms = elapsedMs(state.session, Date.now());
  if (time) time.textContent = formatDuration(ms);
  if (desktop) {
    const phase = state.session.phase;
    const title = phase === 'recording' ? t('title.recording', { time: formatDuration(ms), app: APP_TITLE })
      : phase === 'paused' ? t('title.paused', { time: formatDuration(ms), app: APP_TITLE }) : APP_TITLE;
    if (document.title !== title) {
      document.title = title;
      getCurrentWindow().setTitle(title).catch(() => {});
    }
  }
}

// ───────────────────────── previews

async function refreshPreview() {
  const ticket = ++previewTicket;
  const settings = s();
  if (!desktop || (usesPicker() && settings.target !== 'region')) {
    state.preview = null;
    renderStage();
    return;
  }
  const source = settings.mode === 'record' ? recordSource() : captureSource(settings);
  if (!source) {
    state.preview = null;
    renderStage();
    return;
  }
  if (settings.target === 'region' && state.regionThumb) {
    state.preview = { url: state.regionThumb, caption: `${settings.region.width} × ${settings.region.height}` };
    renderStage();
    return;
  }
  state.previewLoading = true;
  renderStage();
  try {
    // Big enough to stay sharp when the preview fills a large window.
    const url = await sourceThumbnail(source, PREVIEW_EDGE);
    if (ticket !== previewTicket) return;
    const size = source.kind === 'window' ? selectedWindow()
      : source.kind === 'region' ? source
        : source.kind === 'allMonitors' ? desktopSize()
          : state.monitors.find((monitor) => monitor.id === source.id);
    state.preview = { url, caption: size ? `${size.width} × ${size.height}` : '' };
    if (source.kind === 'region') state.regionThumb = url;
  } catch (error) {
    if (ticket !== previewTicket) return;
    state.preview = null;
    notify('warn', errorText(error));
  } finally {
    if (ticket === previewTicket) {
      state.previewLoading = false;
      renderStage();
    }
  }
}

const thumbQueue = [];
let thumbWorkers = 0;

function loadWindowThumbs() {
  const missing = state.windows.filter((window) => !state.thumbs.has(window.id) && !thumbQueue.includes(window.id));
  if (!desktop || !missing.length) return;
  thumbQueue.push(...missing.map((window) => window.id));
  while (thumbWorkers < 3 && thumbQueue.length) {
    thumbWorkers += 1;
    (async () => {
      while (thumbQueue.length) {
        const id = thumbQueue.shift();
        try {
          state.thumbs.set(id, await sourceThumbnail({ kind: 'window', id }, 160));
        } catch {
          state.thumbs.set(id, null);
        }
        const visual = root.querySelector(`.item[data-action="window"][data-value="${id}"] .item-visual`);
        const url = state.thumbs.get(id);
        if (visual && url) visual.innerHTML = `<img src="${url}" alt="" />`;
      }
      thumbWorkers -= 1;
    })();
  }
}

async function refreshSources({ keepThumbs = false } = {}) {
  if (!desktop) return;
  try {
    const sources = await listSources();
    state.monitors = sources.monitors;
    state.windows = sources.windows;
    if (!keepThumbs) state.thumbs.clear();
    const settings = s();
    if (settings.monitorId != null && !state.monitors.some((monitor) => monitor.id === settings.monitorId)) update({ monitorId: null });
    if (settings.windowId != null && !state.windows.some((window) => window.id === settings.windowId)) update({ windowId: null });
  } catch (error) {
    notify('error', errorText(error));
  }
  render();
  refreshPreview();
}

// ───────────────────────── output

async function chooseOutput(kind) {
  const settings = s();
  const image = kind === 'image';
  const extension = image ? settings.imageFormat : settings.videoFormat;
  const stem = timestampStem(image ? 'Capture' : 'Recording');
  const directory = directoryFor(kind);
  if (!settings.askPath && directory) return { kind: 'folder', directory, stem };
  const extensions = { jpg: ['jpg', 'jpeg'], tiff: ['tiff', 'tif'] }[extension] ?? [extension];
  const path = await saveDialog({
    title: t(image ? 'save.imageDialog' : 'save.videoDialog'),
    defaultPath: joinPath(directory, `${stem}.${extension}`, state.platform),
    filters: [{ name: extension.toUpperCase(), extensions }],
  });
  return path ? { kind: 'exact', path } : null;
}

function rememberDirectory(kind, output, path) {
  if (output.kind !== 'exact') return;
  const directory = path.replace(/[\\/][^\\/]*$/, '');
  update(kind === 'image' ? { imageDirectory: directory } : { videoDirectory: directory });
}

async function deliverImage(grabbed) {
  state.result = { kind: 'image', width: grabbed.width, height: grabbed.height, thumbnail: grabbed.thumbnail, path: null };
  render();
  let copied = false;
  if (s().copyToClipboard) {
    await copyPending();
    copied = true;
  }
  await saveResult(copied);
}

async function saveResult(copied = false) {
  const output = await chooseOutput('image');
  if (!output) {
    notify('info', t(copied ? 'notice.copiedNotSaved' : 'notice.saveCancelled'));
    return;
  }
  const saved = await savePending(output, s().imageFormat, s().jpegQuality);
  rememberDirectory('image', output, saved.path);
  state.result = { ...state.result, path: saved.path, bytes: saved.bytes };
  await addGalleryItem({ kind: 'image', path: saved.path, thumbnail: state.result.thumbnail, width: state.result.width, height: state.result.height, bytes: saved.bytes });
  notify('success', t(copied ? 'notice.savedCopied' : 'notice.saved', { name: baseName(saved.path) }));
}

// ───────────────────────── capture

/** The shutter: MyCapture's own window in self mode, otherwise the selected source. */
function captureNow() {
  return s().selfMode ? captureSelf() : captureTarget();
}

function captureTarget() {
  closeViewer();
  const settings = s();
  if (settings.target === 'region') return startRegionSelect('capture');
  const source = captureSource(settings);
  if (!source) return notify('warn', t('notice.pickWindowFirst'));
  return task(t('busy.capturing'), async () => deliverImage(await grab(source)));
}

function recaptureRegion() {
  closeViewer();
  const source = captureSource({ ...s(), target: 'region' });
  if (!source) return undefined;
  return task(t('busy.capturing'), async () => {
    const grabbed = await grab(source);
    state.regionThumb = grabbed.thumbnail;
    await deliverImage(grabbed);
  });
}

/** Captures MyCapture's own window as it is on screen right now (nothing is hidden first). */
async function captureSelf() {
  if (state.busy || isActive(state.session) || !desktop) return;
  // Grab before anything on screen changes (no spinner, no disabled buttons in the picture).
  state.busy = t('busy.capturing');
  let grabbed;
  try {
    grabbed = await grab(APP_SOURCE);
  } catch (error) {
    reportError(error);
    return;
  } finally {
    state.busy = null;
  }
  await task(t('busy.saving'), () => deliverImage(grabbed));
}

async function startRegionSelect(purpose) {
  if (state.busy || !desktop) return;
  closeViewer();
  regionPurpose = purpose;
  state.busy = t('busy.dragRegion');
  render();
  try {
    await beginRegionSelect();
  } catch (error) {
    state.busy = null;
    regionPurpose = null;
    notify('error', errorText(error));
    render();
  }
}

async function onRegionSelected(payload) {
  const { monitorId, x, y, width, height, thumbnail } = payload;
  update({ target: 'region', region: { monitorId, x, y, width, height } });
  state.regionThumb = thumbnail;
  state.preview = { url: thumbnail, caption: `${width} × ${height}` };
  state.busy = null;
  const purpose = regionPurpose;
  regionPurpose = null;
  render();
  if (purpose === 'capture') await task(t('busy.saving'), () => deliverImage({ width, height, thumbnail }));
  else notify('info', t('notice.regionSet', { width, height }));
}

// ───────────────────────── recording

/** Lets MyCapture drop out of captures again after recording itself. */
function endSelfRecording() {
  if (!state.selfRecording) return;
  state.selfRecording = false;
  setSelfRecording(false).catch(() => {});
}

/** `self`: record MyCapture's own window (always with the in-app engine: the picker cannot offer it). */
async function startRecording({ self = false } = {}) {
  const settings = s();
  if (recorder || state.session.phase !== 'idle') return;
  closeViewer();
  let crop = null;
  const native = self || settings.engine === 'native';
  const source = self ? APP_SOURCE : native ? recordSource() : null;
  if (native && !source) return notify('warn', t('notice.pickTargetFirst'));
  if (!native && settings.target === 'region') {
    if (!settings.region) return notify('warn', t('notice.pickRegionFirst'));
    const monitor = state.monitors.find((item) => item.id === settings.region.monitorId) ?? (await monitorInfo(settings.region.monitorId));
    crop = { ...settings.region, monitorWidth: monitor.width, monitorHeight: monitor.height };
  }

  dispatch({ type: 'START_REQUEST' });
  if (self) {
    state.selfRecording = true;
    await setSelfRecording(true).catch(() => {});
  }
  const candidate = new ScreenRecorder({
    engine: native ? 'native' : settings.engine,
    source,
    crop,
    surface: settings.target === 'window' ? 'window' : 'monitor',
    format: settings.videoFormat,
    fps: settings.fps,
    systemAudio: settings.systemAudio && !native,
    microphone: settings.microphone,
    micDeviceId: settings.micDeviceId,
    micGain: settings.micGain,
    onEnded: (reason) => stopRecording(reason),
    onWarning: (message) => notify('warn', message),
  });
  let opened = null;
  try {
    const info = await candidate.prepare();
    // An MP4 started while the encoder is still warming up would come out empty.
    if (settings.videoFormat === 'mp4') await Promise.race([encoderWarm(), new Promise((resolve) => setTimeout(resolve, 15000))]);
    const output = await chooseOutput('video');
    if (!output) {
      candidate.dispose();
      endSelfRecording();
      dispatch({ type: 'CANCEL' });
      notify('info', t('notice.recordCancelled'));
      return;
    }
    opened = await recordingOpen(output, settings.videoFormat);
    rememberDirectory('video', output, opened.path);
    recorder = candidate;
    recordingId = opened.id;
    candidate.start(opened.id);
    dispatch({ type: 'STARTED', outputPath: opened.path, at: Date.now() });
    clock = setInterval(updateClock, 250);
    const values = { width: info.width, height: info.height, fps: settings.fps, count: info.audioTracks };
    if (state.notice?.kind !== 'warn') notify('info', t(info.audioTracks ? 'notice.recordingAudio' : 'notice.recording', values));
    // A whole-screen recording gets the small floating controls and the main window
    // steps aside. (The main window is excluded from capture on Windows and macOS
    // anyway; Linux has no such switch, so there it always gets out of the way.)
    const wholeScreen = !self && (native ? source.kind === 'monitor' : !crop && candidate.surface === 'monitor');
    if (wholeScreen) {
      recordingPanel = true;
      await showRecordingPanel(native ? source.id : null).catch(() => { recordingPanel = false; });
    }
    if (recordingPanel || (hidesByMinimizing() && !self)) getCurrentWindow().minimize().catch(() => {});
  } catch (error) {
    candidate.dispose();
    recorder = null;
    if (opened) recordingAbort(opened.id).catch(() => {});
    endSelfRecording();
    dispatch({ type: 'FAIL', error: errorText(error) });
    notify('error', errorText(error));
  }
}

const hidesByMinimizing = () => state.platform === 'linux';

function pauseRecording() {
  if (!recorder || state.session.phase !== 'recording') return;
  recorder.pause();
  dispatch({ type: 'PAUSE', at: Date.now() });
}

function resumeRecording() {
  if (!recorder || state.session.phase !== 'paused') return;
  recorder.resume();
  dispatch({ type: 'RESUME', at: Date.now() });
}

function snapshotLive() {
  const video = root.querySelector('#live');
  if (!video?.videoWidth) return null;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 480 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function stopRecording(reason = null) {
  const phase = state.session.phase;
  if (!recorder || (phase !== 'recording' && phase !== 'paused')) return;
  const active = recorder;
  const id = recordingId;
  const thumbnail = snapshotLive();
  const size = active.size;
  dispatch({ type: 'STOP_REQUEST', at: Date.now() });
  clearInterval(clock);
  try {
    const { durationMs } = await active.stop();
    const saved = await recordingFinish(id, durationMs);
    state.result = { kind: 'video', path: saved.path, bytes: saved.bytes, durationMs, width: size?.width, height: size?.height, thumbnail };
    dispatch({ type: 'FINISHED' });
    await addGalleryItem({ ...state.result });
    const message = t('notice.recordSaved', { name: baseName(saved.path), duration: formatDuration(durationMs) });
    notify('success', reason ? `${reason} ${message}` : message);
  } catch (error) {
    recordingAbort(id).catch(() => {});
    dispatch({ type: 'FAIL', error: errorText(error) });
    notify('error', errorText(error));
  } finally {
    recorder = null;
    recordingId = null;
    const self = state.selfRecording;
    endSelfRecording();
    updateClock();
    if (recordingPanel) {
      recordingPanel = false;
      hideRecordingPanel().catch(() => {});
      showMain().catch(() => {});
    } else if (hidesByMinimizing() && !self) {
      showMain().catch(() => {});
    }
  }
}

// ───────────────────────── events

function switchLanguage(language) {
  const next = language ?? (getLanguage() === 'ko' ? 'en' : 'ko');
  update({ language: next });
  setLanguage(next);
  setBackendLanguage(next).catch(() => {});
  render();
  viewer?.relabel();
}

function applySetting(key, value) {
  if (key === 'language') return switchLanguage(value);
  update({ [key]: key === 'fps' ? Number(value) : value });
  if (key === 'engine' && value === 'native' && s().systemAudio) update({ systemAudio: false });
  render();
  if (key === 'engine') refreshPreview();
  return undefined;
}

const reportError = (error) => notify('error', errorText(error));

const actions = {
  mode: (value) => {
    if (isActive(state.session)) return;
    closeViewer();
    update({ mode: value });
    render();
    refreshPreview();
  },
  target: (value) => {
    closeViewer();
    update({ target: value });
    render();
    refreshPreview();
    if (value === 'window') refreshSources({ keepThumbs: true });
  },
  monitor: (value) => {
    closeViewer();
    update({ monitorId: value === 'all' ? null : Number(value) });
    render();
    refreshPreview();
  },
  window: (value) => {
    closeViewer();
    update({ windowId: Number(value) });
    render();
    refreshPreview();
  },
  setting: (value, button) => applySetting(button.dataset.key, value),
  toggle: (value, button) => {
    update({ [button.dataset.key]: !s()[button.dataset.key] });
    render();
  },
  sidebar: () => {
    update({ sidebarCollapsed: !s().sidebarCollapsed });
    render();
  },
  'history-panel': () => {
    update({ historyCollapsed: !s().historyCollapsed });
    render();
  },
  language: () => switchLanguage(),
  'open-settings': () => openPopup('settings', { params: { tab: 'general' } }).catch(reportError),
  'open-about': () => openPopup('about').catch(reportError),
  'open-mic': () => openPopup('settings', { params: { tab: 'mic' } }).catch(reportError),
  'theme-next': () => {
    setTheme(nextTheme(s().theme, prefersDark()));
    notify('info', t('theme.changed', { name: themeName(currentTheme(), getLanguage()) }));
  },
  'theme-menu': () => toggleThemeMenu(),
  'gallery-open': (id) => openViewer(id),
  'gallery-reveal': (id) => revealPath(galleryItem(id)?.path).catch((error) => { reportError(error); checkGalleryFiles(); }),
  'gallery-delete': (id) => deleteGalleryItems([id]),
  'gallery-clear': () => openPopup('confirm').catch(reportError),
  refresh: () => refreshSources(),
  capture: () => captureNow(),
  'recapture-region': () => recaptureRegion(),
  'select-region': () => startRegionSelect('define'),
  record: () => startRecording({ self: s().selfMode }),
  'self-mode': () => {
    if (isActive(state.session)) return;
    closeViewer();
    update({ selfMode: !s().selfMode });
    render();
    if (!s().selfMode) refreshPreview();
  },
  pause: () => pauseRecording(),
  resume: () => resumeRecording(),
  stop: () => stopRecording(),
  'save-result': () => task(t('busy.saving'), () => saveResult()),
  'copy-result': () => copyPending().then(() => notify('success', t('notice.copied'))).catch(reportError),
  'open-result': () => openPath(state.result.path).catch(reportError),
  'reveal-result': () => revealPath(state.result.path).catch(reportError),
  dismiss: () => notify(null, null),
  'win-minimize': () => getCurrentWindow().minimize(),
  'win-maximize': () => getCurrentWindow().toggleMaximize(),
  'win-close': () => getCurrentWindow().close(),
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
    applySetting('imageFormat', input.value);
  } else if (input.dataset.input === 'jpegQuality') {
    update({ jpegQuality: Number(input.value) });
  }
});

root.addEventListener('input', (event) => {
  const input = event.target;
  if (input.dataset.input === 'jpegQuality') {
    root.querySelectorAll('[data-output="jpegQuality"]').forEach((output) => { output.textContent = input.value; });
  } else if (input.dataset.input === 'windowFilter') {
    state.windowFilter = input.value;
    const caret = input.selectionStart;
    renderSources();
    const search = root.querySelector('[data-input="windowFilter"]');
    search?.focus();
    search?.setSelectionRange(caret, caret);
  }
});

// ───────────────────────── context menus (own window, with icons)

const menuItem = (command, glyph, labelKey, extra = {}) => ({ command, icon: glyph, label: t(labelKey), ...extra });
const SEP = { separator: true };

/** Items for whatever was right-clicked. */
function contextItems(target) {
  const tile = target.closest('#history .tile');
  if (tile) {
    const item = galleryItem(tile.dataset.id);
    if (!item) return [];
    const missing = state.missing.has(item.id);
    return [
      menuItem(`view:${item.id}`, 'eye', 'viewer.view', { disabled: missing }),
      menuItem(`open:${item.id}`, 'open', 'viewer.openExternal', { disabled: missing }),
      menuItem(`reveal:${item.id}`, 'folder', 'result.reveal', { disabled: missing }),
      SEP,
      ...(item.kind === 'image' ? [menuItem(`copy-image:${item.id}`, 'copy', 'menu.copyImage', { disabled: missing })] : []),
      menuItem(`copy-path:${item.id}`, 'link', 'menu.copyPath'),
      SEP,
      menuItem(`delete:${item.id}`, 'trash', 'gallery.delete', { danger: true }),
    ];
  }
  if (target.closest('#viewer') && viewer?.open) {
    const video = viewer.item.kind === 'video';
    return [
      ...(video
        ? [menuItem('viewer:play', 'play', 'viewer.play'), menuItem('viewer:pause', 'pause', 'viewer.pause'), menuItem('viewer:stop', 'stop', 'viewer.stop')]
        : [menuItem('viewer:zoom-in', 'zoomIn', 'viewer.zoomIn'), menuItem('viewer:zoom-out', 'zoomOut', 'viewer.zoomOut'), menuItem('viewer:fit', 'fit', 'viewer.fit'), menuItem('viewer:actual', 'actual', 'viewer.actual')]),
      SEP,
      menuItem('viewer:external', 'open', 'viewer.openExternal'),
      menuItem('viewer:reveal', 'folder', 'result.reveal'),
      SEP,
      menuItem('viewer:close', 'close', 'viewer.close'),
    ];
  }
  const source = target.closest('.item[data-action="monitor"], .item[data-action="window"]');
  if (source && !locked()) {
    return [
      menuItem(`capture-source:${source.dataset.action}:${source.dataset.value}`, 'camera', 'menu.captureThis'),
      menuItem(`select-source:${source.dataset.action}:${source.dataset.value}`, 'eye', 'menu.previewThis'),
    ];
  }
  if (target.closest('#stage, #sources')) {
    const recordMode = s().mode === 'record';
    const active = isActive(state.session);
    return [
      recordMode
        ? (active ? menuItem('stop', 'stop', 'action.stop', { danger: true }) : menuItem('record', 'video', 'action.record'))
        : menuItem('capture', 'camera', 'action.capture', { disabled: Boolean(state.busy) }),
      menuItem('self-mode', s().selfMode ? 'check' : 'self', 'tool.selfMode', { disabled: active }),
      menuItem('select-region', 'region', 'region.select', { disabled: locked() }),
      ...(!recordMode && s().region ? [menuItem('recapture-region', 'repeat', 'action.recaptureRegion', { disabled: Boolean(state.busy) })] : []),
      SEP,
      menuItem('refresh', 'refresh', 'target.refresh', { disabled: locked() }),
    ];
  }
  return [
    menuItem('mode:capture', 'camera', 'mode.capture', { disabled: isActive(state.session) }),
    menuItem('mode:record', 'video', 'mode.record', { disabled: isActive(state.session) }),
    SEP,
    menuItem('theme-next', 'palette', 'theme.next'),
    menuItem('open-settings', 'gear', 'settings.title'),
    menuItem('open-about', 'info', 'about.title'),
  ];
}

function showContextMenu(event) {
  const items = contextItems(event.target);
  if (!items.length || !desktop) return;
  // Place it at the pointer, kept on the screen (it may extend past the window).
  const width = 250;
  const height = items.reduce((sum, item) => sum + (item.separator ? 9 : 32), 10);
  const screenArea = window.screen;
  const left = screenArea.availLeft ?? 0;
  const top = screenArea.availTop ?? 0;
  let x = window.screenX + event.clientX;
  let y = window.screenY + event.clientY;
  if (x + width > left + screenArea.availWidth) x -= width;
  if (y + height > top + screenArea.availHeight) y = Math.max(top, y - height);
  openPopup('menu', { params: { items, origin: 'main' }, anchor: { x, y } }).catch(reportError);
}

/** A command chosen in a context menu. */
function runMenuCommand(command) {
  const [name, ...rest] = command.split(':');
  const value = rest.join(':');
  const item = galleryItem(value);
  switch (name) {
    case 'view': return openViewer(value);
    case 'open': return item && openPath(item.path).catch(reportError);
    case 'reveal': return item && revealPath(item.path).catch(reportError);
    case 'copy-image': return item && copyImageFile(item.path).then(() => notify('success', t('notice.copied'))).catch(reportError);
    case 'copy-path': return item && copyText(item.path).then(() => notify('success', t('menu.pathCopied'))).catch(reportError);
    case 'delete': return deleteGalleryItems([value]);
    case 'viewer': return viewer?.command(value);
    case 'mode': return actions.mode(value);
    case 'capture-source': {
      const [action, id] = value.split(':');
      actions[action](id);
      return captureTarget();
    }
    case 'select-source': {
      const [action, id] = value.split(':');
      return actions[action](id);
    }
    default: return actions[name]?.(value || undefined, { dataset: {} });
  }
}

root.addEventListener('contextmenu', (event) => {
  // Text fields keep the normal cut / copy / paste menu.
  if (event.target.closest('input[type=text], input[type=search], textarea')) return;
  event.preventDefault();
  showContextMenu(event);
});

// Dragging the thin bars between the panels resizes them.
root.addEventListener('pointerdown', (event) => {
  const splitter = event.target.closest?.('[data-split]');
  if (splitter && event.button === 0) {
    event.preventDefault();
    startSplitDrag(event, splitter.dataset.split);
  }
});

// Frameless window: the grip in the bottom-right corner resizes it.
root.addEventListener('mousedown', (event) => {
  if (event.button === 0 && event.target.closest?.('[data-resize]')) {
    event.preventDefault();
    getCurrentWindow().startResizeDragging('SouthEast').catch(() => {});
  }
});

window.addEventListener('keydown', (event) => {
  if (event.target.closest?.('input, select, textarea')) return;
  if (event.key === 'Escape' && viewer?.open) closeViewer();
  else if (viewer?.key(event)) event.preventDefault();
});

/** Settings or the capture history changed in another window (a popup): follow it. */
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    const before = state.settings;
    state.settings = loadSettings(globalThis.localStorage);
    if (before.language !== state.settings.language) {
      setLanguage(state.settings.language);
      setBackendLanguage(getLanguage()).catch(() => {});
      viewer?.relabel();
    }
    applyTheme(currentTheme());
    render();
    if (['engine', 'mode', 'target', 'monitorId', 'windowId'].some((key) => before[key] !== state.settings[key])) refreshPreview();
  } else if (event.key === GALLERY_KEY) {
    state.gallery = loadGallery(globalThis.localStorage);
    if (state.viewing && !galleryItem(state.viewing)) closeViewer();
    renderGallery();
  }
});

window.addEventListener('focus', () => {
  // Windows come and go while MyCapture is in the background.
  if (s().target === 'window' && !state.busy && !isActive(state.session)) refreshSources({ keepThumbs: true });
});

async function initialize() {
  render();
  if (!desktop) return;
  setBackendLanguage(getLanguage()).catch(() => {});
  // "Follow the system" reacts when Windows switches between light and dark.
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (s().theme === SYSTEM) {
      applyTheme(currentTheme());
      render();
    }
  });
  try {
    const [info, dirs] = await Promise.all([platformInfo(), defaultDirectories()]);
    state.platform = info.platform;
    state.version = info.version;
    state.dirs = dirs;
  } catch (error) {
    reportError(error);
  }
  await listen('region-selected', (event) => onRegionSelected(event.payload));
  await listen('mycapture-notice', ({ payload }) => notify(payload.kind, payload.text));
  await listen('mycapture-menu', ({ payload }) => {
    if (payload?.origin === 'main') runMenuCommand(String(payload.command ?? ''));
  });
  await listen('recbar-command', ({ payload }) => {
    const command = payload?.command;
    if (command === 'ready') emit('recording-state', state.session).catch(() => {});
    else if (command === 'pause') pauseRecording();
    else if (command === 'resume') resumeRecording();
    else if (command === 'stop') stopRecording();
    else if (command === 'show') showMain().catch(() => {});
  });
  await listen('region-cancelled', () => {
    state.busy = null;
    regionPurpose = null;
    notify('info', t('notice.regionCancelled'));
    render();
  });
  const appWindow = getCurrentWindow();
  const syncMaximized = async () => {
    const maximized = await appWindow.isMaximized();
    if (maximized !== state.maximized) {
      state.maximized = maximized;
      renderBar();
      renderStatus();
    }
  };
  await appWindow.onResized(syncMaximized);
  syncMaximized();
  await appWindow.onCloseRequested(async (event) => {
    const what = unsavedWork();
    if (!what) return;
    // Something would be lost: ask first (save / don't save / cancel).
    event.preventDefault();
    await showMain().catch(() => {});
    openPopup('confirm', { params: { type: 'exit', what } }).catch(reportError);
  });
  await listen('mycapture-exit', ({ payload }) => quitAfterChoice(payload?.choice));
  await refreshSources();
  checkGalleryFiles();
  // The first H.264 encode in a process starts slowly; get that out of the way now.
  if (state.support.formats.mp4) warmUpEncoder('mp4');
}

// ───────────────────────── quitting with unsaved work

/** What closing now would lose: a recording in progress, a capture not yet saved, or nothing. */
function unsavedWork() {
  if (recorder) return 'recording';
  if (state.result && !state.result.path) return 'image';
  return null;
}

/** The answer from the "save before quitting?" window. Cancel never gets here. */
async function quitAfterChoice(choice) {
  const what = unsavedWork();
  if (what && choice === 'save') {
    if (what === 'recording') {
      await stopRecording(t('notice.beforeClose'));
    } else {
      await task(t('busy.saving'), () => saveResult());
    }
    // A save dialog cancelled, or a save that failed: stay open so nothing is lost.
    if (unsavedWork()) return;
  } else if (what === 'recording' && choice === 'discard') {
    const id = recordingId;
    recorder?.dispose();
    recorder = null;
    recordingId = null;
    endSelfRecording();
    if (id != null) await recordingAbort(id).catch(() => {});
  } else if (choice !== 'discard') {
    return;
  }
  await getCurrentWindow().destroy();
}

// Test hook for the end-to-end suite (test/e2e): read-only state and a few entry points.
window.__mycapture = { state, actions, t };

initialize();

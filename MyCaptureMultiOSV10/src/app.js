import './styles.css';
import appIcon from '../assets/icon.svg';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { baseName, formatBytes, formatDuration, joinPath, timestampStem } from './domain/naming.js';
import { elapsedMs, initialSession, isActive, sessionReducer } from './domain/session.js';
import { captureSource, defaultSettings, IMAGE_FORMATS, loadSettings, storeSettings } from './domain/settings.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import { listMicrophones, meterPosition, MicrophoneChain } from './platform/microphone.js';
import {
  beginRegionSelect, copyPending, defaultDirectories, errorText, grab, isDesktopShell, listSources,
  monitorInfo, openPath, platformInfo, recordingAbort, recordingFinish, recordingOpen, revealPath,
  hideRecordingPanel, savePending, setBackendLanguage, showMain, showRecordingPanel, sourceThumbnail,
} from './platform/native.js';
import { recordingSupport, ScreenRecorder, warmUpEncoder } from './platform/recorder.js';

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
  modal: null, // 'settings' | 'about'
  settingsTab: 'general',
  mic: { devices: [], error: null, opening: false, testing: 0, testUrl: null },
};

let recorder = null;
let recordingId = null;
let regionPurpose = null;
let clock = null;
let previewTicket = 0;
let micChain = null;
let recordingPanel = false; // the floating "recbar" controls are up
let meterFrame = 0;

const s = () => state.settings;
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
          <main class="stage" id="stage"></main>
        </div>
        <footer class="status" id="status" role="status" aria-live="polite"></footer>
        <div id="modal"></div>
      </div>`;
  }
  root.querySelector('#body').classList.toggle('collapsed', s().sidebarCollapsed);
  root.querySelector('#toolbar').setAttribute('aria-label', t('tool.settings'));
  renderBar();
  renderSources();
  renderToolbar();
  renderStage();
  renderStatus();
}

function renderBar() {
  const settings = s();
  const platform = state.platform ? `${state.platform}${state.version ? ` · v${state.version}` : ''}` : t('app.browser');
  const bar = root.querySelector('#bar');
  // The whole bar drags the frameless window; buttons inside stay clickable.
  bar.setAttribute('data-tauri-drag-region', '');
  bar.innerHTML = `
    <div class="brand" data-tauri-drag-region><img class="brand-icon" src="${appIcon}" alt="" data-tauri-drag-region /><span data-tauri-drag-region>MyCapture</span></div>
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
    ${picker ? `<p class="hint">${t(settings.target === 'window' ? 'picker.hintWindow' : 'picker.hintMonitor')}</p>` : ''}
    <div class="source-body ${picker ? 'dimmed' : ''}">${body}</div>
    ${saveLocation()}`;
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

/** Bottom of the left panel: where files of the current mode go. */
function saveLocation() {
  const kind = s().mode === 'capture' ? 'image' : 'video';
  const directory = directoryFor(kind);
  return `<section class="save-location" aria-label="${t('save.label')}">
    <div class="panel-head"><h2>${icon('folder')}<span>${t(kind === 'image' ? 'save.imageTitle' : 'save.videoTitle')}</span></h2></div>
    ${folderRow(kind, directory)}
    <div class="toggles">
      ${toggle('askPath', t('save.ask'), t('save.askDetail'), isActive(state.session))}
    </div>
  </section>`;
}

function folderRow(kind, directory) {
  return `<div class="folder">
    <span class="folder-path" title="${escapeHtml(directory ?? '')}">${escapeHtml(directory ?? t('save.none'))}</span>
    <button class="button small" data-action="choose-folder" data-value="${kind}" ${isActive(state.session) ? 'disabled' : ''}>${icon('folder')}<span>${t('save.change')}</span></button>
  </div>`;
}

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
        <div class="rec-badge" id="rec-badge" hidden><i></i><span id="rec-time">00:00</span></div>
      </div>
      <div class="preview-caption" id="preview-caption"></div>
      <div class="actions" id="actions"></div>
      <div id="result"></div>`;
  }

  const live = stage.querySelector('#live');
  live.hidden = !recordingLive;
  if (recordingLive && recorder && !live.srcObject) {
    live.srcObject = recorder.previewStream;
    live.play().catch(() => {});
  }
  if (!recordingLive && live.srcObject) live.srcObject = null;

  const still = stage.querySelector('#preview-still');
  still.hidden = recordingLive;
  if (!recordingLive) {
    if (usesPicker() && settings.target !== 'region') {
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

  stage.querySelector('#preview-caption').innerHTML = `
    <span>${icon(settings.target)}<b>${escapeHtml(usesPicker() && settings.target !== 'region' ? t('picker.name') : sourceLabel())}</b></span>
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
  const region = settings.target === 'region';
  const disabled = busy || (settings.target === 'window' && !selectedWindow());
  const again = region && settings.region
    ? `<button class="round-button" data-action="recapture-region" title="${t('action.recaptureRegion')}" aria-label="${t('action.recaptureRegion')}" ${busy ? 'disabled' : ''}>${icon('repeat')}</button>`
    : '';
  return actionRow('', shutter('capture', 'camera', `${t(region ? 'action.captureRegion' : 'action.capture')} (${settings.imageFormat.toUpperCase()})`, 'capture', disabled), again + busyNote());
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
      `<button class="round-button" data-action="${phase === 'recording' ? 'pause' : 'resume'}" title="${t(pauseKey)}" aria-label="${t(pauseKey)}">${icon(phase === 'recording' ? 'pause' : 'play')}</button>`,
      shutter('stop', 'stop', t('action.stop'), 'stop', false),
      '',
    );
  }
  if (phase === 'starting' || phase === 'stopping') {
    return actionRow('', shutter('record', 'video', t(phase === 'starting' ? 'busy.preparing' : 'busy.finishing'), 'record busy', true), '<span class="spinner small"></span>');
  }
  const unsupported = unsupportedReason();
  const needsTarget = (settings.engine === 'native' || settings.target === 'region') && !recordSource();
  const disabled = !desktop || Boolean(state.busy) || Boolean(unsupported) || needsTarget;
  const selectRegion = settings.target === 'region'
    ? `<button class="round-button" data-action="select-region" title="${t('region.select')}" aria-label="${t('region.select')}" ${state.busy ? 'disabled' : ''}>${icon('region')}</button>`
    : '';
  return actionRow(selectRegion, shutter('record', 'video', `${t('action.record')} (${settings.videoFormat.toUpperCase()})`, 'record', disabled), busyNote(),
    unsupported ? `<p class="hint warn action-note">${escapeHtml(unsupported)}</p>` : '');
}

function resultCard() {
  const result = state.result;
  if (!result) return '';
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

// ───────────────────────── toolbar

/** The quick options of the current mode, in one wrapping row under the title bar. */
function renderToolbar() {
  const settings = s();
  const active = isActive(state.session);
  const support = state.support;
  const native = settings.engine === 'native';

  const groups = settings.mode === 'capture'
    ? [
      tool(t('tool.format'), imageFormatSelect()),
      settings.imageFormat === 'jpg'
        ? tool(t('tool.quality'), qualitySlider())
        : tool('', `<span class="tool-note">${escapeHtml(formatNote(settings.imageFormat))}</span>`),
      `<div class="tool-chips">${chip('copyToClipboard', 'copy', t('tool.clipboard'), t('tool.clipboardTip'))}</div>`,
    ]
    : [
      tool(t('tool.engine'), segmented('engine', [['display', t('tool.engineDisplay')], ['native', t('tool.engineNative')]], settings.engine, active,
        { display: t('tool.engineDisplayTip'), native: t('tool.engineNativeTip') })),
      tool(t('tool.format'), segmented('videoFormat', [['mp4', `MP4${support.formats.mp4 ? '' : ' ✕'}`], ['webm', `WebM${support.formats.webm ? '' : ' ✕'}`]], settings.videoFormat, active)),
      tool('FPS', segmented('fps', [[15, '15'], [30, '30'], [60, '60']], settings.fps, active)),
      `<div class="tool-chips">
        ${chip('systemAudio', 'speaker', t('tool.systemAudio'), t(native ? 'tool.systemAudioNativeTip' : 'tool.systemAudioTip'), active || native)}
        <span class="chip-group">
          ${chip('microphone', 'mic', t('tool.microphone'), support.microphone ? t('tool.microphoneTip') : t('tool.unsupported'), active || !support.microphone)}
          <button class="chip chip-tail" data-action="open-mic" title="${t('tool.micSettings')}" aria-label="${t('tool.micSettings')}" ${active || !support.microphone ? 'disabled' : ''}>${icon('sliders')}</button>
        </span>
      </div>`,
    ];

  root.querySelector('#toolbar').innerHTML = groups.join('<span class="tool-divider" aria-hidden="true"></span>');
}

const formatNote = (format) => t(`format.note.${format}`);

function imageFormatSelect() {
  return `<select class="select" data-select="imageFormat" aria-label="${t('tool.format')}">
    ${IMAGE_FORMATS.map((format) => `<option value="${format}" ${s().imageFormat === format ? 'selected' : ''}>${format.toUpperCase()}</option>`).join('')}
  </select>`;
}

function qualitySlider() {
  return `<span class="quality">
    <input type="range" min="40" max="100" step="1" value="${s().jpegQuality}" data-input="jpegQuality" aria-label="${t('tool.jpgQuality')}" />
    <output data-output="jpegQuality">${s().jpegQuality}</output>
  </span>`;
}

function tool(label, control) {
  return `<div class="tool">${label ? `<span class="tool-label">${label}</span>` : ''}${control}</div>`;
}

function chip(key, glyph, label, title, disabled = false) {
  const on = Boolean(s()[key]) && !disabled;
  return `<button class="chip ${on ? 'on' : ''}" data-action="toggle" data-key="${key}" aria-pressed="${on}"
    title="${escapeHtml(title)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}<span>${label}</span></button>`;
}

function segmented(key, options, current, disabled = false, titles = {}) {
  return `<div class="segmented" role="radiogroup">
    ${options.map(([value, label]) => `
      <button role="radio" class="segment ${current === value ? 'active' : ''}" aria-checked="${current === value}"
        data-action="setting" data-key="${key}" data-value="${value}" ${titles[value] ? `title="${escapeHtml(titles[value])}"` : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`).join('')}
  </div>`;
}

function toggle(key, title, detail, disabled = false, glyph = '') {
  return `<label class="toggle ${disabled ? 'disabled' : ''}">
    <span class="toggle-text">${glyph ? icon(glyph) : ''}<span><strong>${title}</strong><small>${escapeHtml(detail)}</small></span></span>
    <input type="checkbox" data-toggle="${key}" ${s()[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
    <span class="switch" aria-hidden="true"></span>
  </label>`;
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
    const title = phase === 'recording' ? t('title.recording', { time: formatDuration(ms) })
      : phase === 'paused' ? t('title.paused', { time: formatDuration(ms) }) : 'MyCapture';
    if (document.title !== title) {
      document.title = title;
      getCurrentWindow().setTitle(title).catch(() => {});
    }
  }
}

// ───────────────────────── dialogs (settings with tabs, about)

const SETTINGS_TABS = [
  ['general', 'globe', 'settings.general'],
  ['capture', 'camera', 'mode.capture'],
  ['record', 'video', 'mode.record'],
  ['mic', 'mic', 'mic.name'],
  ['save', 'folder', 'save.label'],
];

function renderModal() {
  const host = root.querySelector('#modal');
  if (!host) return;
  if (!state.modal) {
    host.innerHTML = '';
    return;
  }
  const settings = state.modal === 'settings';
  const [glyph, title, body] = settings ? ['gear', t('settings.title'), settingsBody()] : ['info', t('about.title'), aboutBody()];
  host.innerHTML = `
    <div class="modal-backdrop" data-backdrop>
      <section class="modal modal-${state.modal}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-head">
          <h2 id="modal-title">${icon(glyph)}<span>${title}</span></h2>
          <button class="icon-button" data-action="close-modal" title="${t('modal.close')}" aria-label="${t('modal.close')}">${icon('close')}</button>
        </header>
        ${settings ? `<nav class="tabs" role="tablist" aria-label="${t('settings.title')}">
          ${SETTINGS_TABS.map(([tab, tabIcon, key]) => `
            <button role="tab" class="tab ${state.settingsTab === tab ? 'active' : ''}" aria-selected="${state.settingsTab === tab}"
              data-action="settings-tab" data-value="${tab}">${icon(tabIcon)}<span>${t(key)}</span></button>`).join('')}
        </nav>` : ''}
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">
          ${settings ? `<button class="button" data-action="reset-settings" ${isActive(state.session) ? 'disabled' : ''}>${icon('refresh')}<span>${t('settings.reset')}</span></button>` : '<span class="about-copy">© shkwon · MyCapture</span>'}
          <button class="primary small" data-action="close-modal">${t('modal.done')}</button>
        </footer>
      </section>
    </div>`;
}

function settingRow(label, control) {
  return `<div class="setting-row"><span class="setting-label">${label}</span><div class="setting-control">${control}</div></div>`;
}

function settingsBody() {
  const settings = s();
  const active = isActive(state.session);
  const support = state.support;
  switch (state.settingsTab) {
    case 'capture':
      return `
        ${settingRow(t('tool.format'), imageFormatSelect())}
        ${settingRow(t('tool.jpgQuality'), qualitySlider())}
        <p class="hint">${escapeHtml(formatNote(settings.imageFormat))}</p>
        <div class="toggles">${toggle('copyToClipboard', t('tool.clipboard'), t('tool.clipboardTip'))}</div>`;
    case 'record':
      return `
        ${settingRow(t('tool.engine'), segmented('engine', [['display', t('tool.engineDisplay')], ['native', t('tool.engineNative')]], settings.engine, active))}
        <p class="hint">${t(settings.engine === 'native' ? 'tool.engineNativeTip' : 'tool.engineDisplayTip')}</p>
        ${settingRow(t('tool.format'), segmented('videoFormat', [['mp4', 'MP4'], ['webm', 'WebM']], settings.videoFormat, active))}
        ${settingRow('FPS', segmented('fps', [[15, '15'], [30, '30'], [60, '60']], settings.fps, active))}
        <div class="toggles">
          ${toggle('systemAudio', t('tool.systemAudio'), t(settings.engine === 'native' ? 'tool.systemAudioNativeTip' : 'tool.systemAudioTip'), active || settings.engine === 'native', 'speaker')}
          ${toggle('microphone', t('tool.microphone'), t('tool.microphoneTip'), active || !support.microphone, 'mic')}
        </div>`;
    case 'mic':
      return micBody();
    case 'save':
      return `
        ${settingRow(t('settings.imageFolder'), folderRow('image', directoryFor('image')))}
        ${settingRow(t('settings.videoFolder'), folderRow('video', directoryFor('video')))}
        <div class="toggles">${toggle('askPath', t('save.ask'), t('save.askDetail'), active)}</div>`;
    default:
      return `
        ${settingRow(t('settings.language'), segmented('language', [['ko', '한국어'], ['en', 'English']], getLanguage()))}
        <p class="hint">${t('settings.languageHint')}</p>
        ${settingRow(t('settings.panel'), segmented('sidebarCollapsed', [['false', t('settings.panelOpen')], ['true', t('settings.panelClosed')]], String(settings.sidebarCollapsed)))}`;
  }
}

function aboutBody() {
  const rows = [
    [t('about.version'), state.version || '—'],
    [t('about.platform'), state.platform || t('app.browser')],
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

function micBody() {
  const settings = s();
  const mic = state.mic;
  const options = [`<option value="">${t('mic.default')}</option>`]
    .concat(mic.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${settings.micDeviceId === device.id ? 'selected' : ''}>${escapeHtml(device.label)}</option>`));
  return `
    ${settingRow(t('mic.device'), `<select class="select wide" data-select="micDeviceId" aria-label="${t('mic.device')}">${options.join('')}</select>`)}
    ${settingRow(t('mic.gain'), `<span class="quality">
      <input type="range" min="0" max="200" step="5" value="${settings.micGain}" data-input="micGain" aria-label="${t('mic.gain')}" />
      <output data-output="micGain">${settings.micGain}%</output>
    </span>`)}
    <div class="meter-block">
      <div class="setting-label">${t('mic.level')} <output id="meter-db">-∞ dB</output></div>
      <div class="meter" role="meter" aria-label="${t('mic.level')}" aria-valuemin="-60" aria-valuemax="0">
        <div class="meter-fill" id="meter-fill"></div><div class="meter-peak" id="meter-peak"></div>
      </div>
      <div class="meter-scale">${[-60, -40, -20, -10, 0].map((db) => `<span style="left:${((db + 60) / 60) * 100}%">${db === 0 ? '0 dB' : db}</span>`).join('')}</div>
      <p class="hint">${mic.opening ? t('mic.opening') : escapeHtml(mic.error ?? t('mic.levelHint'))}</p>
    </div>
    <div class="mic-test">
      <button class="button" data-action="mic-test" ${mic.testing || !micChain ? 'disabled' : ''}>${icon('record')}<span>${mic.testing ? t('mic.testing', { s: mic.testing }) : t('mic.test')}</span></button>
      <audio id="mic-playback" controls ${mic.testUrl ? `src="${mic.testUrl}"` : 'hidden'}></audio>
    </div>`;
}

/** Opens a dialog; settings can open straight on a tab. The mic tab holds the microphone open. */
async function openModal(name, tab = null) {
  if (tab) state.settingsTab = tab;
  state.modal = name;
  await syncMicChain();
}

async function selectSettingsTab(tab) {
  state.settingsTab = tab;
  await syncMicChain();
}

function closeModal() {
  state.modal = null;
  closeMicChain();
  renderModal();
}

/** Runs the microphone exactly while the Microphone tab is on screen. */
async function syncMicChain() {
  const wanted = state.modal === 'settings' && state.settingsTab === 'mic' && !isActive(state.session);
  if (!wanted) closeMicChain();
  renderModal();
  if (wanted && !micChain && !state.mic.opening) await startMicChain();
}

const micTabOpen = () => state.modal === 'settings' && state.settingsTab === 'mic';

async function startMicChain() {
  closeMicChain();
  state.mic = { ...state.mic, opening: true, error: null };
  renderModal();
  try {
    micChain = await MicrophoneChain.open(s().micDeviceId, s().micGain);
    // Labels only appear once permission is granted, so list after opening.
    state.mic.devices = await listMicrophones().catch(() => []);
  } catch (error) {
    micChain = null;
    state.mic.error = errorText(error);
  }
  state.mic.opening = false;
  if (!micTabOpen()) {
    closeMicChain();
    return;
  }
  renderModal();
  let peakHold = 0;
  const tick = () => {
    if (!micChain || !micTabOpen()) return;
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
  state.mic = { ...state.mic, testing: 0, testUrl: null };
}

async function testMicrophone() {
  if (!micChain || state.mic.testing) return;
  if (state.mic.testUrl) URL.revokeObjectURL(state.mic.testUrl);
  state.mic.testUrl = null;
  state.mic.testing = 3;
  renderModal();
  const countdown = setInterval(() => {
    state.mic.testing = Math.max(1, state.mic.testing - 1);
    renderModal();
  }, 1000);
  try {
    state.mic.testUrl = await micChain.testRecording(3000);
    notify('info', t('mic.testDone'));
  } catch (error) {
    notify('error', errorText(error));
  } finally {
    clearInterval(countdown);
    state.mic.testing = 0;
    renderModal();
    root.querySelector('#mic-playback')?.play().catch(() => {});
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
    const url = await sourceThumbnail(source, 960);
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
  notify('success', t(copied ? 'notice.savedCopied' : 'notice.saved', { name: baseName(saved.path) }));
}

// ───────────────────────── capture

function captureNow() {
  const settings = s();
  if (settings.target === 'region') return startRegionSelect('capture');
  const source = captureSource(settings);
  if (!source) return notify('warn', t('notice.pickWindowFirst'));
  return task(t('busy.capturing'), async () => deliverImage(await grab(source)));
}

function recaptureRegion() {
  const source = captureSource({ ...s(), target: 'region' });
  if (!source) return undefined;
  return task(t('busy.capturing'), async () => {
    const grabbed = await grab(source);
    state.regionThumb = grabbed.thumbnail;
    await deliverImage(grabbed);
  });
}

async function startRegionSelect(purpose) {
  if (state.busy || !desktop) return;
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

async function startRecording() {
  const settings = s();
  if (recorder || state.session.phase !== 'idle') return;
  if (state.modal) closeModal(); // releases the microphone the test panel holds
  let crop = null;
  const native = settings.engine === 'native';
  const source = native ? recordSource() : null;
  if (native && !source) return notify('warn', t('notice.pickTargetFirst'));
  if (!native && settings.target === 'region') {
    if (!settings.region) return notify('warn', t('notice.pickRegionFirst'));
    const monitor = state.monitors.find((item) => item.id === settings.region.monitorId) ?? (await monitorInfo(settings.region.monitorId));
    crop = { ...settings.region, monitorWidth: monitor.width, monitorHeight: monitor.height };
  }

  dispatch({ type: 'START_REQUEST' });
  const candidate = new ScreenRecorder({
    engine: settings.engine,
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
    const output = await chooseOutput('video');
    if (!output) {
      candidate.dispose();
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
    const wholeScreen = native ? source.kind === 'monitor' : !crop && candidate.surface === 'monitor';
    if (wholeScreen) {
      recordingPanel = true;
      await showRecordingPanel(native ? source.id : null).catch(() => { recordingPanel = false; });
    }
    if (recordingPanel || hidesByMinimizing()) getCurrentWindow().minimize().catch(() => {});
  } catch (error) {
    candidate.dispose();
    recorder = null;
    if (opened) recordingAbort(opened.id).catch(() => {});
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
    const message = t('notice.recordSaved', { name: baseName(saved.path), duration: formatDuration(durationMs) });
    notify('success', reason ? `${reason} ${message}` : message);
  } catch (error) {
    recordingAbort(id).catch(() => {});
    dispatch({ type: 'FAIL', error: errorText(error) });
    notify('error', errorText(error));
  } finally {
    recorder = null;
    recordingId = null;
    updateClock();
    if (recordingPanel) {
      recordingPanel = false;
      hideRecordingPanel().catch(() => {});
      showMain().catch(() => {});
    } else if (hidesByMinimizing()) {
      showMain().catch(() => {});
    }
  }
}

// ───────────────────────── events

async function chooseFolder(kind) {
  const directory = await openDialog({ directory: true, multiple: false, title: t('save.chooseFolder'), defaultPath: directoryFor(kind) ?? undefined });
  if (typeof directory === 'string') update(kind === 'image' ? { imageDirectory: directory } : { videoDirectory: directory });
}

function switchLanguage(language) {
  const next = language ?? (getLanguage() === 'ko' ? 'en' : 'ko');
  update({ language: next });
  setLanguage(next);
  setBackendLanguage(next).catch(() => {});
  render();
  renderModal();
}

function applySetting(key, value) {
  if (key === 'language') return switchLanguage(value);
  if (key === 'sidebarCollapsed') value = value === 'true';
  update({ [key]: key === 'fps' ? Number(value) : value });
  if (key === 'engine' && value === 'native' && s().systemAudio) update({ systemAudio: false });
  render();
  renderModal();
  if (key === 'engine') refreshPreview();
  return undefined;
}

const reportError = (error) => notify('error', errorText(error));

const actions = {
  mode: (value) => {
    if (isActive(state.session)) return;
    update({ mode: value });
    render();
    refreshPreview();
  },
  target: (value) => {
    update({ target: value });
    render();
    refreshPreview();
    if (value === 'window') refreshSources({ keepThumbs: true });
  },
  monitor: (value) => {
    update({ monitorId: value === 'all' ? null : Number(value) });
    render();
    refreshPreview();
  },
  window: (value) => {
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
  language: () => switchLanguage(),
  'open-settings': () => openModal('settings'),
  'open-about': () => openModal('about'),
  'open-mic': () => openModal('settings', 'mic'),
  'settings-tab': (value) => selectSettingsTab(value),
  'close-modal': () => closeModal(),
  'reset-settings': () => {
    // Keep where files go and the language; everything else back to defaults.
    const { imageDirectory, videoDirectory, language } = s();
    state.settings = { ...defaultSettings, imageDirectory, videoDirectory, language };
    storeSettings(globalThis.localStorage, state.settings);
    render();
    renderModal();
    refreshPreview();
  },
  'mic-test': () => testMicrophone(),
  refresh: () => refreshSources(),
  capture: () => captureNow(),
  'recapture-region': () => recaptureRegion(),
  'select-region': () => startRegionSelect('define'),
  record: () => startRecording(),
  pause: () => pauseRecording(),
  resume: () => resumeRecording(),
  stop: () => stopRecording(),
  'choose-folder': (value) => chooseFolder(value === 'video' ? 'video' : 'image').then(() => { render(); renderModal(); }).catch(reportError),
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
  if (event.target.matches?.('[data-backdrop]')) return closeModal();
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return undefined;
  return actions[button.dataset.action]?.(button.dataset.value, button);
});

root.addEventListener('change', (event) => {
  const input = event.target;
  if (input.dataset.toggle) {
    update({ [input.dataset.toggle]: input.checked });
    render();
    renderModal();
  } else if (input.dataset.select === 'imageFormat') {
    applySetting('imageFormat', input.value);
  } else if (input.dataset.select === 'micDeviceId') {
    update({ micDeviceId: input.value || null });
    closeMicChain();
    syncMicChain();
  } else if (input.dataset.input === 'jpegQuality' || input.dataset.input === 'micGain') {
    update({ [input.dataset.input]: Number(input.value) });
  }
});

root.addEventListener('input', (event) => {
  const input = event.target;
  if (input.dataset.input === 'jpegQuality' || input.dataset.input === 'micGain') {
    const suffix = input.dataset.input === 'micGain' ? '%' : '';
    root.querySelectorAll(`[data-output="${input.dataset.input}"]`).forEach((output) => { output.textContent = `${input.value}${suffix}`; });
    if (input.dataset.input === 'micGain') micChain?.setGain(Number(input.value));
  } else if (input.dataset.input === 'windowFilter') {
    state.windowFilter = input.value;
    const caret = input.selectionStart;
    renderSources();
    const search = root.querySelector('[data-input="windowFilter"]');
    search?.focus();
    search?.setSelectionRange(caret, caret);
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
  if (event.key === 'Escape' && state.modal) closeModal();
});

window.addEventListener('focus', () => {
  // Windows come and go while MyCapture is in the background.
  if (s().target === 'window' && !state.busy && !isActive(state.session)) refreshSources({ keepThumbs: true });
});

async function initialize() {
  render();
  if (!desktop) return;
  setBackendLanguage(getLanguage()).catch(() => {});
  try {
    const [info, dirs] = await Promise.all([platformInfo(), defaultDirectories()]);
    state.platform = info.platform;
    state.version = info.version;
    state.dirs = dirs;
  } catch (error) {
    reportError(error);
  }
  await listen('region-selected', (event) => onRegionSelected(event.payload));
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
    if (!recorder) return;
    // Closing mid-recording would leave an unfinished file: finish it first.
    event.preventDefault();
    await stopRecording(t('notice.beforeClose'));
    await appWindow.destroy();
  });
  await refreshSources();
  // The first H.264 encode in a process starts slowly; get that out of the way now.
  if (state.support.formats.mp4) setTimeout(() => warmUpEncoder('mp4'), 1500);
}

// Test hook for the end-to-end suite (test/e2e): read-only state and a few entry points.
window.__mycapture = { state, actions, t };

initialize();

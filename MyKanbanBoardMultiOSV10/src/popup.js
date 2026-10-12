// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web, ?popup=<kind>). Every popup has a fixed
// size chosen so its content fits without scrolling; long settings are split
// into tabs and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { COLOR_HEX } from './domain/board.js';
import { defaultPrintOptions, MARGINS, PAPERS, paginate, selectContent } from './domain/print.js';
import { loadRecent, MAX_RECENT, removeRecent, storeRecent } from './domain/recent.js';
import {
  BACKGROUND_FITS, defaultSettings, DENSITIES, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, loadSettings, RECENT_KEY, STORAGE_KEY, storeSettings, ZOOM,
} from './domain/settings.js';
import { formatBytes, getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { POPUPS, popupParams } from './platform/popups.js';
import { applyFont, applyTheme, resolveTheme, THEME_IDS, THEMES } from './themes.js';
import { dbConfig, DEFAULT_PORTS, STORAGE_KINDS, storageProblems, usesServer } from './domain/project.js';

const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const kind = desktop ? appWindow.label.replace(/^popup-/, '') : new URLSearchParams(location.search).get('popup');
const root = document.querySelector('#app');
document.title = `popup-${kind}`;
document.documentElement.classList.add(`popup-kind-${kind}`);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);

// ───────────────────────── bridge to the main window

function send(type, data) {
  if (desktop) return native.emitTo('main', 'popup-message', { kind, type, data }).catch(() => {});
  globalThis.parent?.postMessage({ mykanban: true, kind, type, data }, location.origin);
  return Promise.resolve();
}
const result = (data) => send('result', data);
const action = (name, data = {}) => send('action', { action: name, ...data });

async function close(value = null) {
  if (value) await result(value);
  if (desktop) await native.invoke('close_popup', { kind }).catch(() => {});
  else send('close');
}

async function hide(value = null) {
  await result(value);
  if (desktop) await native.invoke('hide_popup', { kind }).catch(() => {});
  else send('hide');
}

let shown = false;
function ready() {
  if (shown && kind !== 'menu') return;
  shown = true;
  if (desktop) native.invoke('popup_ready').catch(() => {});
  else send('ready');
}

const state = {
  settings: loadSettings(globalThis.localStorage),
  params: popupParams(kind),
  tab: popupParams(kind).tab ?? 'general',
  fonts: null,
  fontError: null,
  info: null,
  progress: null,
  copied: false,
  exists: {},
  print: null,
  page: 0,
  menuIndex: -1,
};
const s = () => state.settings;

function applyLook() {
  setLanguage(s().language);
  applyTheme(resolveTheme(s().theme, prefersDark()));
  applyFont(s());
}

function update(patch) {
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  applyLook();
  render();
}

window.addEventListener('error', (event) => action('report-error', { message: String(event.error?.stack ?? event.message), context: `popup-${kind}` }));
window.addEventListener('unhandledrejection', (event) => action('report-error', { message: native.errorText(event.reason), context: `popup-${kind}` }));

// ───────────────────────── frame

const TITLES = {
  settings: ['gear', 'settings.title'], about: ['info', 'about.title'], error: ['error', 'error.title'], progress: ['refresh', 'progress.wait'],
  recent: ['recent', 'recent.title'], print: ['print', 'print.title'], confirm: ['info', 'confirm.ok'],
};

let osTitle = '';
function setOsTitle(title) {
  if (!desktop || !title || title === osTitle) return;
  osTitle = title;
  native.invoke('app_info').then((info) => appWindow.setTitle(`${title} — MyKanbanBoard v${info.version}`)).catch(() => {});
}

function frame({ glyph, title, body, foot = '', tabs = '' }) {
  setOsTitle(title);
  return `<div class="popup popup-${kind}" role="dialog" aria-labelledby="popup-title">
    <header class="popup-head" data-tauri-drag-region data-drag-region>
      <h2 id="popup-title" data-tauri-drag-region>${icon(glyph)}<span data-tauri-drag-region>${escapeHtml(title)}</span></h2>
      <button class="window-button" data-action="close" title="${escapeHtml(t('error.close'))}" aria-label="${escapeHtml(t('error.close'))}">${icon('close')}</button>
    </header>
    ${tabs}
    <div class="popup-body">${body}</div>
    ${foot ? `<footer class="popup-foot">${foot}</footer>` : ''}
  </div>`;
}

const button = (actionName, label, glyph = '', extra = '', value = '') =>
  `<button class="button ${extra}" data-action="${actionName}" ${value !== '' ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`;

const row = (glyph, label, control, title = label) => `<div class="row" title="${escapeHtml(title)}"><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control">${control}</span></div>`;

const toggle = (key, label, glyph) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-toggle="${key}" ${s()[key] ? 'checked' : ''} /><span class="switch" aria-hidden="true"></span></label>`);

const segmented = (key, options, current) => `<span class="segmented" role="radiogroup">${options.map(([value, label]) => `
  <button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" data-setting="${key}" data-value="${escapeHtml(value)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')}</span>`;

function render() {
  try {
    ({
      settings: renderSettings, about: renderAbout, confirm: renderConfirm, error: renderError, progress: renderProgress,
      recent: renderRecent, print: renderPrint, menu: renderMenu, project: renderProject, image: renderImage,
    })[kind]?.();
  } catch (error) {
    action('report-error', { message: String(error?.stack ?? error), context: `popup-${kind}` });
  }
}

/** Popups whose height follows their content (confirm, about): sized once drawn. */
function fitHeight() {
  const popup = root.querySelector('.popup');
  if (!popup) return;
  popup.classList.add('fit');
  const height = Math.ceil(popup.getBoundingClientRect().height);
  popup.classList.remove('fit');
  const target = Math.min(height, window.screen.availHeight - 40);
  if (Math.abs(target - window.innerHeight) <= 1) return;
  if (desktop) appWindow.setSize(new LogicalSize(window.innerWidth, target)).catch(() => {});
  else send('place', { ...frameAnchor(), width: POPUPS[kind].width, height: target });
}

function frameAnchor() {
  const rect = globalThis.frameElement?.parentElement?.getBoundingClientRect();
  return rect ? { x: rect.left + globalThis.parent.screenX, y: rect.top + globalThis.parent.screenY } : { x: 0, y: 0 };
}

// ───────────────────────── settings

const SETTINGS_TABS = [
  ['general', 'globe', 'settings.general'],
  ['appearance', 'palette', 'settings.appearance'],
  ['font', 'font', 'settings.font'],
  ['background', 'image', 'settings.background'],
  ['board', 'board', 'settings.board'],
  ['recent', 'recent', 'settings.recent'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

function renderSettings() {
  const tabs = `<nav class="tabs" role="tablist">${SETTINGS_TABS.map(([id, glyph, key]) => `
    <button class="tab ${state.tab === id ? 'active' : ''}" role="tab" aria-selected="${state.tab === id}" data-action="tab" data-value="${id}" title="${escapeHtml(t(key))}">${icon(glyph)}<span>${escapeHtml(t(key))}</span></button>`).join('')}</nav>`;
  const body = {
    general: settingsGeneral, appearance: settingsAppearance, font: settingsFont, background: settingsBackground,
    board: settingsBoard, recent: settingsRecent, shortcuts: settingsShortcuts,
  }[state.tab]?.() ?? '';
  root.innerHTML = frame({
    glyph: 'gear', title: t('settings.title'), tabs, body: `<div class="settings-page settings-${state.tab}">${body}</div>`,
    foot: `${button('reset-settings', t('settings.reset'), 'refresh')}<span class="grow"></span>${button('close', t('settings.done'), 'check', 'primary')}`,
  });
  if (state.tab === 'font' && !state.fonts && !state.fontError) loadFonts();
  if (state.tab === 'recent') checkRecent();
  ready();
}

function settingsGeneral() {
  return [
    row('globe', t('settings.language'), segmented('language', [['ko', '한국어'], ['en', 'English']], s().language)),
    toggle('restoreSession', t('settings.restoreSession'), 'refresh'),
    toggle('confirmDelete', t('settings.confirmDelete'), 'trash'),
    toggle('statusClock', t('settings.statusClock'), 'recent'),
    toggle('showLeftPanel', t('action.leftPanel'), 'panelLeft'),
    toggle('showRightPanel', t('action.rightPanel'), 'panelRight'),
    toggle('showStatusBar', t('action.statusBar'), 'statusBar'),
    row('folder', t('settings.lastDirectory'), `<span class="path" title="${escapeHtml(s().lastDirectory ?? '')}">${escapeHtml(s().lastDirectory ?? t('settings.none'))}</span>`),
  ].join('');
}

function settingsAppearance() {
  return `<div class="theme-list" role="radiogroup">${THEME_IDS.map((id) => {
    const theme = id === 'system' ? resolveTheme('system', prefersDark()) : THEMES.find((item) => item.id === id);
    const active = s().theme === id;
    return `<button class="theme-row ${active ? 'active' : ''}" role="radio" aria-checked="${active}" data-setting="theme" data-value="${id}" title="${escapeHtml(t(`theme.${id}`))}">
      <span class="theme-swatch">${theme.swatch.map((color) => `<i style="background:${color}"></i>`).join('')}</span>
      ${icon(id === 'system' ? 'sun' : theme.dark ? 'moon' : 'sun')}<span class="theme-name">${escapeHtml(t(`theme.${id}`))}</span>${active ? icon('check', 'icon check') : ''}
    </button>`;
  }).join('')}</div>`;
}

function settingsFont() {
  const fonts = state.fonts ?? [];
  const current = s().fontFamily;
  const options = [`<option value="">${escapeHtml(t('settings.fontDefault'))}</option>`]
    .concat((current && !fonts.includes(current) ? [current, ...fonts] : fonts).map((family) => `<option value="${escapeHtml(family)}" ${family === current ? 'selected' : ''}>${escapeHtml(family)}</option>`));
  const status = state.fontError ? `<span class="danger-text">${escapeHtml(t('error.fonts'))}: ${escapeHtml(state.fontError)}</span>`
    : state.fonts ? t('settings.fontCount', { count: fonts.length }) : t('settings.fontLoading');
  return [
    row('font', t('settings.fontFamily'), `<select data-select="fontFamily" id="font-family" title="${escapeHtml(t('settings.fontFamily'))}">${options.join('')}</select>`),
    row('info', '', `<span class="muted" id="font-status">${status}</span>`, status),
    row('zoomIn', t('settings.fontSize'), `<span class="range-wrap"><span class="scale">${FONT_SIZE.min}</span><input type="range" min="${FONT_SIZE.min}" max="${FONT_SIZE.max}" step="1" value="${s().fontSize}" data-range="fontSize" title="${escapeHtml(t('settings.fontSize'))}" /><span class="scale">${FONT_SIZE.max}</span><output>${s().fontSize}px</output></span>`),
    row('edit', t('settings.fontWeight'), `<select data-select="fontWeight" title="${escapeHtml(t('settings.fontWeight'))}">${FONT_WEIGHTS.map((weight) => `<option value="${weight}" ${s().fontWeight === weight ? 'selected' : ''}>${weight} — ${escapeHtml(t(`settings.weight.${weight}`))}</option>`).join('')}</select>`),
    row('font', t('settings.fontStyle'), segmented('fontStyle', FONT_STYLES.map((style) => [style, t(`settings.${style}`)]), s().fontStyle)),
    `<div class="row font-sample" style="font-family:var(--font-family);font-size:${s().fontSize}px;font-weight:${s().fontWeight};font-style:${s().fontStyle}">${escapeHtml(t('settings.fontSample'))}</div>`,
  ].join('');
}

async function loadFonts() {
  try {
    state.fonts = await native.listFonts();
  } catch (error) {
    state.fontError = native.errorText(error);
  }
  if (state.tab === 'font') render();
}

function settingsBackground() {
  const name = s().backgroundName || (s().backgroundImage ? s().backgroundImage : t('settings.bgNone'));
  return [
    row('image', t('settings.bgImage'), `<span class="path" id="bg-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      ${button('choose-background', t('settings.bgChoose'), 'folder', 'small')}
      ${button('clear-background', t('settings.bgClear'), 'trash', 'small', '')}`),
    row('opacity', t('settings.bgOpacity'), `<span class="range-wrap"><span class="scale">0</span><input type="range" min="0" max="100" step="1" value="${s().backgroundOpacity}" data-range="backgroundOpacity" title="${escapeHtml(t('settings.bgOpacity'))}" /><span class="scale">100</span><output>${s().backgroundOpacity}%</output></span>`),
    row('board', t('settings.bgFit'), segmented('backgroundFit', BACKGROUND_FITS.map((fit) => [fit, t(`settings.fit.${fit}`)]), s().backgroundFit)),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.bgHint'))}</span>`, t('settings.bgHint')),
  ].join('');
}

function settingsBoard() {
  return [
    row('list', t('settings.density'), segmented('cardDensity', DENSITIES.map((density) => [density, t(`settings.density.${density}`)]), s().cardDensity)),
    toggle('showCardDetails', t('settings.cardDetails'), 'tag'),
    row('addColumn', t('settings.newColumns'), `<input class="wide" data-text="newBoardColumns" value="${escapeHtml(s().newBoardColumns)}" title="${escapeHtml(t('settings.newColumns'))}" />`),
    row('zoomIn', t('settings.zoom'), `<span class="range-wrap"><span class="scale">${ZOOM.min}</span><input type="range" min="${ZOOM.min}" max="${ZOOM.max}" step="${ZOOM.step}" value="${s().zoom}" data-range="zoom" title="${escapeHtml(t('settings.zoom'))}" /><span class="scale">${ZOOM.max}</span><output>${s().zoom}%</output></span>`),
  ].join('');
}

function recentRows(list, { compact = false } = {}) {
  if (!list.length) return `<div class="row empty">${icon('info')}<span>${escapeHtml(t('recent.empty'))}</span></div>`;
  return list.map((item) => {
    const missing = state.exists[item.path] === false;
    const name = item.path.split(/[\\/]/).pop();
    return `<div class="row recent-row ${missing ? 'missing' : ''}" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
      <span class="row-label">${icon('file')}<span class="recent-name">${escapeHtml(name)}</span></span>
      <span class="recent-path">${escapeHtml(item.web ? t('recent.webFile') : item.path)}</span>
      ${missing ? `<span class="badge danger">${escapeHtml(t('recent.missing'))}</span>` : ''}
      ${compact ? '' : button('open-recent', t('recent.open'), 'open', 'small', item.path)}
      <button class="icon-button" data-action="remove-recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('trash')}</button>
    </div>`;
  }).join('');
}

function settingsRecent() {
  const list = loadRecent(globalThis.localStorage);
  return `${recentRows(list, { compact: true })}
    <div class="row">${button('clear-recent', t('recent.clear'), 'trash', `small danger`, '')}<span class="muted">${escapeHtml(t('recent.count', { count: list.length }))}</span></div>`;
}

async function checkRecent() {
  const list = loadRecent(globalThis.localStorage).filter((item) => !item.web && !(item.path in state.exists));
  if (!list.length || !desktop) return;
  const exists = await native.pathsExist(list.map((item) => item.path)).catch(() => list.map(() => true));
  list.forEach((item, index) => { state.exists[item.path] = exists[index]; });
  render();
}

const SHORTCUT_LIST = [
  ['Ctrl+N', 'action.new'], ['Ctrl+O', 'action.open'], ['Ctrl+S', 'action.save'], ['Ctrl+Shift+S', 'action.saveAs'], ['Ctrl+Alt+S', 'action.saveAll'],
  ['Ctrl+R', 'action.recent'], ['Ctrl+W', 'action.closeTab'], ['Ctrl+P', 'action.print'], ['Ctrl+Z', 'action.undo'], ['Ctrl+Y', 'action.redo'],
  ['Ctrl+X', 'action.cut'], ['Ctrl+C', 'action.copy'], ['Ctrl+V', 'action.paste'], ['Ctrl+D', 'action.duplicate'], ['Delete', 'action.delete'],
  ['Ctrl+A', 'action.selectAll'], ['Esc', 'action.clearSelection'], ['Ctrl+Enter', 'action.addCard'], ['Ctrl+Shift+N', 'action.addColumn'],
  ['Enter', 'action.editCard'], ['Alt+←/→', 'action.moveRight'], ['F2', 'action.renameBoard'], ['Ctrl+F', 'action.find'], ['Ctrl+= / Ctrl+-', 'action.zoomIn'],
  ['Ctrl+0', 'action.zoomReset'], ['shortcut.wheel', 'action.zoomIn'], ['Ctrl+Tab', 'action.nextTab'], ['Ctrl+Shift+L', 'action.language'],
  ['Ctrl+,', 'action.settings'], ['F1', 'action.about'],
];

function settingsShortcuts() {
  return `<div class="shortcut-grid">${SHORTCUT_LIST.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyKanbanBoard', version: '?', error: native.errorText(error) }));
  const info = state.info;
  const date = info.buildDate ? new Date(info.buildDate).toLocaleString() : '-';
  const rows = [
    ['info', t('about.version'), `${info.version}`],
    ['refresh', t('about.buildDate'), date],
    ['link', t('about.commit'), info.commit ?? '-'],
    ['board', t('about.target'), `${info.target ?? '-'} (${info.profile ?? '-'})`],
    ['gear', t('about.runtime'), info.web ? t('about.webBuild') : `Tauri ${info.tauri} · ${info.rustc ?? ''}`],
    ['globe', t('about.platform'), `${info.os ?? '-'} / ${info.arch ?? '-'}`],
    ['user', t('about.author'), 'SHKWON(knix008@naver.com)'],
  ];
  root.innerHTML = frame({
    glyph: 'info', title: t('about.title'),
    body: `<div class="about">
      <img class="about-icon" src="${appIcon}" alt="" />
      <div class="about-name">${escapeHtml(info.name)} <span class="about-version">v${escapeHtml(info.version)}</span></div>
      <div class="about-tagline">${escapeHtml(t('about.tagline'))}</div>
      <div class="about-rows" id="about-rows">${rows.map(([glyph, label, value]) => row(glyph, label, `<span class="about-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`)).join('')}</div>
    </div>`,
    foot: `<span class="muted">© SHKWON(knix008@naver.com)</span><span class="grow"></span>${button('copy-about', t('action.copy'), 'copy')}${button('close', t('settings.done'), 'check', 'primary')}`,
  });
  fitHeight();
  ready();
}

// ───────────────────────── confirm

function renderConfirm() {
  const p = state.params;
  const items = p.items ?? [];
  const shownItems = items.slice(0, 6);
  root.innerHTML = frame({
    glyph: p.icon ?? 'info', title: p.title ?? t('confirm.ok'),
    body: `<div class="confirm">
      <div class="confirm-message">${icon(p.icon ?? 'info', 'icon big')}<p>${escapeHtml(p.message ?? '')}</p></div>
      ${shownItems.length ? `<ul class="confirm-items">${shownItems.map((item) => `<li title="${escapeHtml(item)}">${icon('board')}<span>${escapeHtml(item)}</span></li>`).join('')}${items.length > shownItems.length ? `<li>… +${items.length - shownItems.length}</li>` : ''}</ul>` : ''}
    </div>`,
    foot: `<span class="grow"></span>${(p.buttons ?? [{ id: 'ok', label: t('confirm.ok'), primary: true }]).map((b) => `<button class="button ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-action="choice" data-value="${escapeHtml(b.id)}" title="${escapeHtml(b.label)}">${b.icon ? icon(b.icon) : ''}<span>${escapeHtml(b.label)}</span></button>`).join('')}`,
  });
  fitHeight();
  root.querySelector('.button.primary')?.focus();
  ready();
}

// ───────────────────────── error

function errorReport() {
  const p = state.params;
  return [
    `[${p.title ?? t('error.title')}]`,
    p.message ?? '',
    '',
    `${t('error.when')}: ${p.time ?? ''}`,
    p.context ? `${t('error.where')}: ${p.context}` : '',
    `App: ${p.app ?? ''}`,
    p.detail ? `\n${t('error.detail')}:\n${p.detail}` : '',
  ].filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function renderError() {
  const p = state.params;
  root.innerHTML = frame({
    glyph: 'error', title: p.title ?? t('error.title'),
    body: `<div class="error-view">
      <div class="error-message">${icon('error', 'icon big danger-text')}<p id="error-message" title="${escapeHtml(p.message)}">${escapeHtml(p.message ?? '')}</p></div>
      ${row('recent', t('error.when'), `<span>${escapeHtml(p.time ?? '')}</span>`)}
      ${row('list', t('error.where'), `<span class="path" title="${escapeHtml(p.context || '-')}">${escapeHtml(p.context || '-')}</span>`)}
      ${row('info', 'App', `<span class="path">${escapeHtml(p.app ?? '')}</span>`)}
      <p class="muted hint">${escapeHtml(t('error.hint'))}</p>
      <textarea class="error-detail" id="error-detail" readonly spellcheck="false" aria-label="${escapeHtml(t('error.detail'))}">${escapeHtml(errorReport())}</textarea>
    </div>`,
    foot: `<span class="muted" id="copy-state">${state.copied ? `${icon('check')} ${escapeHtml(t('error.copied'))}` : ''}</span><span class="grow"></span>${button('copy-error', t('error.copy'), 'copy')}${button('close', t('error.close'), 'check', 'primary')}`,
  });
  ready();
}

async function copyText(text) {
  if (desktop) return native.clipboardWrite(text);
  try {
    return await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return undefined;
  }
}

// ───────────────────────── progress

function renderProgress() {
  const p = state.params;
  const progress = state.progress ?? p.last ?? null;
  const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;
  root.innerHTML = frame({
    glyph: 'refresh', title: p.title ?? t('progress.wait'),
    body: `<div class="progress-view">
      <div class="row">${icon('file')}<span class="path" title="${escapeHtml(p.name ?? '')}">${escapeHtml(p.name ?? '')}</span></div>
      <div class="progress-bar ${percent == null ? 'indeterminate' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent ?? 0}"><i style="width:${percent ?? 30}%"></i></div>
      <div class="row muted"><span id="progress-text">${progress ? escapeHtml(t('progress.bytes', { done: formatBytes(progress.done), total: formatBytes(progress.total) })) : escapeHtml(t('progress.wait'))}</span><span class="grow"></span><b id="progress-percent">${percent == null ? '' : `${percent}%`}</b></div>
    </div>`,
  });
  ready();
}

// ───────────────────────── recent files

function renderRecent() {
  const list = loadRecent(globalThis.localStorage);
  root.innerHTML = frame({
    glyph: 'recent', title: t('recent.title'),
    body: `<div class="recent-list">${recentRows(list)}</div>`,
    foot: `<span class="muted">${escapeHtml(t('recent.count', { count: list.length }))} · ${MAX_RECENT}</span><span class="grow"></span>${button('clear-recent', t('recent.clear'), 'trash', 'danger', '')}${button('close', t('settings.done'), 'check', 'primary')}`,
  });
  root.querySelector('[data-action="clear-recent"]').disabled = !list.length;
  checkRecent();
  ready();
}

// ───────────────────────── print preview

function printSetup() {
  if (!state.print) {
    const saved = (() => { try { return JSON.parse(globalThis.localStorage?.getItem('mykanban.print.v1') ?? '{}'); } catch { return {}; } })();
    state.print = { ...defaultPrintOptions(), ...saved, range: 'current', columnIds: null, selectedOnly: false };
  }
  return state.print;
}

function printLayout() {
  const options = printSetup();
  const p = state.params;
  const boards = p.boards ?? [];
  const content = selectContent(boards, p.current ?? 0, options, p.selected ?? []);
  return paginate(content, options);
}

function pageHtml(page, layout, options) {
  const { size, margin } = layout;
  const columns = page.columns.map((column) => `<div class="pp-column" style="width:${layout.columnWidth}mm">
      <div class="pp-column-head" style="border-color:${COLOR_HEX[column.color] === 'transparent' ? '#999' : COLOR_HEX[column.color]}">${escapeHtml(column.title || '—')} <small>${column.count}${column.continued ? ` ${escapeHtml(t('print.continued'))}` : ''}</small></div>
      ${column.cards.map((card) => `<div class="pp-card" style="border-left-color:${COLOR_HEX[card.color] === 'transparent' ? '#ccc' : COLOR_HEX[card.color]}">
        <div class="pp-title">${escapeHtml(card.title || '—')}</div>
        ${options.descriptions && card.description ? `<div class="pp-desc">${escapeHtml(card.description)}</div>` : ''}
        ${[card.priority !== 'none' ? t(`priority.${card.priority}`) : '', card.due, card.assignee, (card.tags ?? []).join(', '), card.checklist?.length ? `☑ ${card.checklist.filter((i) => i.done).length}/${card.checklist.length}` : ''].filter(Boolean).length
          ? `<div class="pp-meta">${escapeHtml([card.priority !== 'none' ? t(`priority.${card.priority}`) : '', card.due, card.assignee, (card.tags ?? []).join(', '), card.checklist?.length ? `☑ ${card.checklist.filter((i) => i.done).length}/${card.checklist.length}` : ''].filter(Boolean).join(' · '))}</div>` : ''}
      </div>`).join('')}
    </div>`).join('');
  return `<div class="print-page" style="width:${size.width}mm;height:${size.height}mm;padding:${margin}mm">
    ${options.header ? `<div class="pp-header"><b>${escapeHtml(page.board)}</b><span>${escapeHtml(t('print.printedAt', { date: new Date().toLocaleDateString() }))}</span></div>` : ''}
    <div class="pp-columns" style="font-size:${(options.scale / 100) * 9}pt">${columns}</div>
    ${options.footer ? `<div class="pp-footer">${escapeHtml(t('print.page', { n: page.number, total: page.total }))}</div>` : ''}
  </div>`;
}

function renderPrint() {
  const options = printSetup();
  const p = state.params;
  const boards = p.boards ?? [];
  const current = boards[p.current ?? 0];
  const layout = printLayout();
  const pages = layout.pages;
  state.page = Math.max(0, Math.min(state.page, pages.length - 1));
  const page = pages[state.page];
  const columnChips = (current?.columns ?? []).map((column) => {
    const checked = !options.columnIds || options.columnIds.includes(column.id);
    return `<label class="chip-check" title="${escapeHtml(column.title)}"><input type="checkbox" data-print-column="${column.id}" ${checked ? 'checked' : ''} ${options.range === 'custom' ? '' : 'disabled'} /><span>${escapeHtml(column.title || '—')}</span></label>`;
  }).join('');
  const select = (key, values, label) => `<select data-print="${key}" title="${escapeHtml(label)}">${values.map(([value, text]) => `<option value="${value}" ${String(options[key]) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
  const check = (key, label, glyph) => row(glyph, label, `<label class="switch-wrap"><input type="checkbox" data-print-toggle="${key}" ${options[key] ? 'checked' : ''} /><span class="switch" aria-hidden="true"></span></label>`);
  root.innerHTML = frame({
    glyph: 'print', title: t('print.title'),
    body: `<div class="print-view">
      <div class="print-options">
        <h3>${icon('list')}<span>${escapeHtml(t('print.range'))}</span></h3>
        ${['all', 'current', 'custom'].map((range) => `<label class="row radio-row" title="${escapeHtml(t(`print.${range}`))}"><input type="radio" name="range" data-print-range="${range}" ${options.range === range ? 'checked' : ''} /><span>${escapeHtml(t(`print.${range}`))}</span></label>`).join('')}
        <div class="chip-checks ${options.range === 'custom' ? '' : 'disabled'}">${columnChips}</div>
        <label class="row radio-row" title="${escapeHtml(t('print.selectedOnly'))}"><input type="checkbox" data-print-toggle="selectedOnly" ${options.selectedOnly ? 'checked' : ''} ${options.range === 'custom' ? '' : 'disabled'} /><span>${escapeHtml(t('print.selectedOnly'))} (${(p.selected ?? []).length})</span></label>
        <h3>${icon('pageSetup')}<span>${escapeHtml(t('print.pageSetup'))}</span></h3>
        ${row('file', t('print.paper'), select('paper', Object.keys(PAPERS).map((paper) => [paper, paper]), t('print.paper')))}
        ${row('board', t('print.orientation'), `<span class="segmented">${['portrait', 'landscape'].map((o) => `<button class="segment ${options.orientation === o ? 'active' : ''}" data-print-orientation="${o}" title="${escapeHtml(t(`print.${o}`))}">${escapeHtml(t(`print.${o}`))}</button>`).join('')}</span>`)}
        ${row('panelLeft', t('print.margin'), select('margin', Object.keys(MARGINS).map((margin) => [margin, t(`print.margin.${margin}`)]), t('print.margin')))}
        ${row('zoomIn', t('print.scale'), `<span class="range-wrap"><input type="range" min="50" max="150" step="10" value="${options.scale}" data-print-scale title="${escapeHtml(t('print.scale'))}" /><output>${options.scale}%</output></span>`)}
        ${check('descriptions', t('print.descriptions'), 'list')}
        ${check('header', t('print.header'), 'board')}
        ${check('footer', t('print.footer'), 'pageSetup')}
      </div>
      <div class="print-preview" id="print-preview">
        ${page ? `<div class="preview-stage">${pageHtml(page, layout, options)}</div>` : `<div class="preview-empty">${icon('info')}<span>${escapeHtml(options.selectedOnly && !(p.selected ?? []).length ? t('print.selectedNone') : t('print.empty'))}</span></div>`}
      </div>
    </div>
    <div class="print-sheet" aria-hidden="true">${pages.map((item) => pageHtml(item, layout, options)).join('')}</div>`,
    foot: `<button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number">${escapeHtml(pages.length ? t('print.page', { n: state.page + 1, total: pages.length }) : t('print.empty'))}</span>
      <button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= pages.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
      <span class="grow"></span>
      <button class="button primary" data-action="print" title="${escapeHtml(t('print.print'))}" ${pages.length ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(t('print.print'))}</span></button>
      ${button('close', t('print.close'), 'close')}`,
  });
  // @page size follows the page setup.
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  style.textContent = `@page { size: ${layout.size.width}mm ${layout.size.height}mm; margin: 0; }`;
  fitPreview();
  ready();
}

/** Scales the preview page to fit the preview area (no scroll bars). */
function fitPreview() {
  const area = root.querySelector('#print-preview');
  const stage = area?.querySelector('.preview-stage');
  const page = stage?.querySelector('.print-page');
  if (!page) return;
  const box = area.getBoundingClientRect();
  const scale = Math.min((box.width - 24) / page.offsetWidth, (box.height - 24) / page.offsetHeight);
  stage.style.transform = `scale(${scale})`;
  stage.style.width = `${page.offsetWidth}px`;
  stage.style.height = `${page.offsetHeight}px`;
  stage.style.left = `${(box.width - page.offsetWidth * scale) / 2}px`;
  stage.style.top = `${(box.height - page.offsetHeight * scale) / 2}px`;
}

function savePrintOptions() {
  const { range, columnIds, selectedOnly, ...setup } = state.print;
  try { globalThis.localStorage?.setItem('mykanban.print.v1', JSON.stringify(setup)); } catch { /* ignore */ }
}

function changePrint(patch) {
  state.print = { ...printSetup(), ...patch };
  savePrintOptions();
  render();
}

async function doPrint() {
  try {
    if (window.__mykanbanPrintHook) window.__mykanbanPrintHook(printLayout());
    else await native.printWindow();
    action('printed');
  } catch (error) {
    action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
  }
}

// ───────────────────────── menu

function renderMenu() {
  const p = state.params;
  // Created ahead of time (prewarm) or reopened without a menu: stay hidden.
  if (p.prewarm || !Array.isArray(p.items) || !shownOnce()) return;
  const items = p.items;
  setOsTitle(p.header?.title);
  const header = p.header ? `<div class="menu-head">${icon(p.header.icon)}<span>${escapeHtml(p.header.title)}</span></div>` : '';
  root.innerHTML = `<div class="popup-menu" role="menu" aria-label="${escapeHtml(p.header?.title ?? '')}">${header}${items.map((item, index) => (item.separator
    ? '<div class="menu-sep" role="separator"></div>'
    : `<button class="menu-item ${item.danger ? 'danger' : ''}" role="menuitem" data-index="${index}" data-id="${escapeHtml(item.id)}" ${item.disabled ? 'disabled aria-disabled="true"' : ''} title="${escapeHtml(item.label)}">
        <span class="menu-icon">${item.swatch ? `<i class="menu-swatch" style="background:${item.swatch === 'transparent' ? 'none' : item.swatch}"></i>` : icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key">${escapeHtml(item.shortcut ?? '')}</span>
        <span class="menu-check">${item.checked ? icon('check') : ''}</span>
      </button>`)).join('')}</div>`;
  state.menuIndex = -1;
  const menu = root.querySelector('.popup-menu');
  const width = Math.ceil(menu.scrollWidth) + 2;
  const height = Math.ceil(menu.scrollHeight) + 2;
  const anchor = p.anchor ?? { x: 100, y: 100 };
  if (desktop) {
    native.invoke('place_popup', { x: anchor.x, y: anchor.y, width, height, flipY: anchor.flipY ?? null, show: true })
      .then(() => window.focus())
      .catch(() => {});
  } else {
    send('place', { x: anchor.x, y: anchor.y, width, height, flipY: anchor.flipY ?? null });
  }
  menuOpen = true;
}

let menuOpen = false;
/** The menu window shows a menu only for an open request made after it loaded or the one that created it. */
const loadedAt = Date.now();
function shownOnce() {
  const at = Number(state.params.at) || 0;
  return at >= loadedAt - 60_000;
}
async function chooseMenu(id) {
  if (!menuOpen) return;
  menuOpen = false;
  await hide({ id });
}

function moveMenuFocus(direction) {
  const items = [...root.querySelectorAll('.menu-item:not([disabled])')];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement);
  const next = items[(current + direction + items.length) % items.length];
  next.focus();
}

// ───────────────────────── project settings

function projectInit() {
  const p = state.params;
  const project = p.project ?? {};
  const storage = { ...(project.storage ?? {}) };
  state.draft = {
    name: project.name ?? '',
    description: project.description ?? '',
    storage: { ...storage, password: p.password ?? storage.password ?? '' },
    boards: (p.boards ?? []).map((board) => ({ ...board })),
  };
  state.tab = p.tab ?? (p.mode === 'connect' ? 'storage' : 'general');
  state.dbResult = null;
}

function renderProject() {
  if (!state.draft) projectInit();
  const p = state.params;
  const d = state.draft;
  const mode = p.mode ?? 'edit';
  const title = t(mode === 'new' ? 'project.titleNew' : mode === 'connect' ? 'project.titleConnect' : 'project.titleEdit');
  const tabsList = mode === 'connect' ? [['storage', 'database', 'project.tabStorage']]
    : [['general', 'project', 'project.tabGeneral'], ['storage', 'database', 'project.tabStorage'], ...(mode === 'edit' ? [['boards', 'board', 'project.tabBoards']] : [])];
  const tabs = '<nav class="tabs" role="tablist">' + tabsList.map(([id, glyph, key]) => '<button class="tab ' + (state.tab === id ? 'active' : '') + '" role="tab" aria-selected="' + (state.tab === id) + '" data-action="tab" data-value="' + id + '" title="' + escapeHtml(t(key)) + '">' + icon(glyph) + '<span>' + escapeHtml(t(key)) + '</span></button>').join('') + '</nav>';
  const input = (key, value, type = 'text', extra = '') => '<input type="' + type + '" data-draft="' + key + '" value="' + escapeHtml(value ?? '') + '" title="' + escapeHtml(t('project.' + key.split('.').pop())) + '" ' + extra + ' />';
  let body = '';
  if (state.tab === 'general') {
    body = [
      row('edit', t('project.name'), input('name', d.name, 'text', 'id="project-name"')),
      row('list', t('project.description'), input('description', d.description)),
      row('file', t('project.file'), '<span class="path" title="' + escapeHtml(p.path ?? '') + '">' + escapeHtml(p.path ?? t('project.unsaved')) + '</span>'),
      row('info', t('project.id'), '<span class="path">' + escapeHtml(p.project?.id ?? '') + '</span>'),
      row('board', t('project.boardCount'), '<span>' + (p.boards?.length ?? p.project?.boards?.length ?? 0) + '</span>'),
    ].join('');
  } else if (state.tab === 'storage') {
    const kind = d.storage.kind ?? 'local';
    const kinds = STORAGE_KINDS.map((value) => '<button class="segment ' + (kind === value ? 'active' : '') + '" role="radio" aria-checked="' + (kind === value) + '" data-storage-kind="' + value + '" title="' + escapeHtml(t('storage.' + value)) + '" ' + (!desktop && value !== 'local' ? 'disabled' : '') + ' ' + (mode === 'connect' && value !== kind ? 'disabled' : '') + '>' + escapeHtml(t('storage.' + value)) + '</button>').join('');
    const rows = [row('database', t('project.kind'), '<span class="segmented" role="radiogroup">' + kinds + '</span>')];
    if (mode === 'connect') rows.unshift('<div class="row notice-row">' + icon('plug') + '<span>' + escapeHtml(t('project.connectHint')) + '</span></div>');
    if (kind === 'local') rows.push(row('info', '', '<span class="muted result">' + escapeHtml(desktop ? t('project.localHint') : t('project.webOnlyLocal')) + '</span>'));
    if (kind === 'sqlite') {
      rows.push(row('file', t('project.sqliteFile'), input('storage.file', d.storage.file, 'text', 'id="sqlite-file"') + button('browse-db', t('project.browse'), 'folder', 'small')));
      rows.push(row('info', '', '<span class="muted">' + escapeHtml(t('project.sqliteHint')) + '</span>'));
    }
    if (usesServer(kind)) {
      rows.push(row('globe', t('project.host'), input('storage.host', d.storage.host)));
      rows.push(row('plug', t('project.port'), input('storage.port', d.storage.port ?? DEFAULT_PORTS[kind], 'number', 'min="1" max="65535"')));
      rows.push(row('database', t('project.database'), input('storage.database', d.storage.database)));
      rows.push(row('user', t('project.user'), input('storage.user', d.storage.user, 'text', 'autocomplete="off"')));
      rows.push(row('gear', t('project.password'), input('storage.password', d.storage.password, 'password', 'id="db-password" autocomplete="new-password"')));
      if (mode !== 'connect') rows.push(row('save', t('project.savePassword'), '<label class="switch-wrap"><input type="checkbox" data-draft-toggle="savePassword" ' + (d.storage.savePassword ? 'checked' : '') + ' /><span class="switch" aria-hidden="true"></span></label>'));
    }
    if (kind !== 'local') {
      const result = state.dbResult;
      rows.push(row('plug', t('project.test'), '<span class="result ' + (result ? (result.ok === null ? 'pending' : result.ok ? 'ok' : 'fail') : '') + '" id="db-result" title="' + escapeHtml(result?.text ?? '') + '">' + escapeHtml(result?.text ?? '') + '</span>' + button('test-db', t('project.test'), 'plug', 'small')));
      rows.push(row('info', '', '<span class="muted result">' + escapeHtml(t('project.dbHint')) + '</span>'));
    }
    body = rows.join('');
  } else {
    body = d.boards.length ? d.boards.map((board, index) => '<div class="row board-row" title="' + escapeHtml(board.title) + '"><span class="row-label">' + icon('board') + '<span>' + escapeHtml(board.title) + (board.dirty ? ' ●' : '') + '</span></span>'
      + '<button class="icon-button" data-action="board-move" data-value="' + index + ':-1" title="' + escapeHtml(t('project.moveUp')) + '" ' + (index === 0 ? 'disabled' : '') + '>' + icon('chevronLeft') + '</button>'
      + '<button class="icon-button" data-action="board-move" data-value="' + index + ':1" title="' + escapeHtml(t('project.moveDown')) + '" ' + (index === d.boards.length - 1 ? 'disabled' : '') + '>' + icon('chevronRight') + '</button>'
      + '<button class="icon-button" data-action="board-remove" data-value="' + index + '" title="' + escapeHtml(t('project.remove')) + '">' + icon('minus') + '</button></div>').join('')
      : '<div class="row empty">' + icon('info') + '<span>' + escapeHtml(t('project.noBoards')) + '</span></div>';
  }
  const primary = t(mode === 'new' ? 'project.create' : mode === 'connect' ? 'project.connect' : 'project.apply');
  root.innerHTML = frame({
    glyph: mode === 'connect' ? 'plug' : 'project', title: title + (d.name && mode !== 'new' ? ' — ' + d.name : ''), tabs,
    body: '<div class="project-view">' + body + '</div>',
    foot: '<span class="grow"></span>' + button('close', t('confirm.cancel'), 'close') + button('project-apply', primary, mode === 'connect' ? 'plug' : 'check', 'primary'),
  });
  ready();
}

function draftConfig() {
  return dbConfig(state.draft.storage, { projectPath: state.params.path, password: state.draft.storage.password });
}

async function testDatabase() {
  const problems = storageProblems({ ...state.draft.storage, host: state.draft.storage.host ?? '', database: state.draft.storage.database ?? '', file: state.draft.storage.file ?? '' });
  if (problems.length) {
    state.dbResult = { ok: false, text: problems.map((code) => t(code)).join(' · ') };
    return render();
  }
  state.dbResult = { ok: null, text: t('project.testing') };
  render();
  try {
    const version = await native.dbTest(draftConfig());
    state.dbResult = { ok: true, text: t('project.testOk', { version }) };
  } catch (error) {
    state.dbResult = { ok: false, text: native.errorText(error) };
  }
  return render();
}

async function applyProject() {
  const d = state.draft;
  const storage = { ...d.storage, port: d.storage.port ? Number(d.storage.port) : null };
  const problems = storageProblems({ ...storage, host: storage.host ?? '', database: storage.database ?? '', file: storage.file ?? '' });
  if (problems.length) {
    state.tab = 'storage';
    state.dbResult = { ok: false, text: problems.map((code) => t(code)).join(' · ') };
    return render();
  }
  if (state.params.mode === 'connect') {
    // Check the password before handing it over.
    state.dbResult = { ok: null, text: t('project.testing') };
    render();
    try {
      await native.dbTest(draftConfig());
    } catch (error) {
      state.dbResult = { ok: false, text: native.errorText(error) };
      return render();
    }
    return close({ action: 'apply', password: storage.password ?? '' });
  }
  const { password, ...rest } = storage;
  return close({
    action: 'apply',
    project: { name: d.name.trim() || t('project.defaultName'), description: d.description, storage: rest },
    password: password ?? '',
    boards: state.params.mode === 'edit' ? d.boards.map((board) => board.id) : undefined,
  });
}

// ───────────────────────── image viewer

function renderImage() {
  const p = state.params;
  const items = p.items ?? [];
  if (state.imageIndex == null) state.imageIndex = p.index ?? 0;
  state.imageIndex = Math.max(0, Math.min(state.imageIndex, items.length - 1));
  const item = items[state.imageIndex];
  state.imageCache ??= new Map();
  const data = item ? state.imageCache.get(item.id) : null;
  if (item && data === undefined) {
    state.imageCache.set(item.id, null);
    action('attachment-data', { id: item.id });
  }
  root.innerHTML = frame({
    glyph: 'image', title: t('image.title') + (p.title ? ' — ' + p.title : ''),
    body: '<div class="image-stage" id="image-stage">' + (item ? '<img id="image-view" src="' + (data || item.thumb || '') + '" alt="' + escapeHtml(item.name) + '" class="' + (data ? 'full' : 'thumb') + '" />' : '') + '</div>'
      + (item ? '<div class="image-info">' + icon('image') + '<span class="name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</span><span class="muted">' + formatBytes(item.size) + (item.width ? ' · ' + item.width + '×' + item.height : '') + '</span><span class="grow"></span><span id="image-count">' + escapeHtml(t('image.count', { n: state.imageIndex + 1, total: items.length })) + '</span>' + (data ? '' : '<span class="muted">' + escapeHtml(t('image.loading')) + '</span>') + '</div>' : ''),
    foot: '<button class="icon-button" data-action="image-step" data-value="-1" title="' + escapeHtml(t('image.prev')) + '" aria-label="' + escapeHtml(t('image.prev')) + '" ' + (state.imageIndex <= 0 ? 'disabled' : '') + '>' + icon('chevronLeft') + '</button>'
      + '<button class="icon-button" data-action="image-step" data-value="1" title="' + escapeHtml(t('image.next')) + '" aria-label="' + escapeHtml(t('image.next')) + '" ' + (state.imageIndex >= items.length - 1 ? 'disabled' : '') + '>' + icon('chevronRight') + '</button>'
      + '<span class="grow"></span>' + button('image-open', t('attachment.open'), 'open') + button('image-save', t('attachment.save'), 'save') + button('close', t('error.close'), 'check', 'primary'),
  });
  ready();
}

// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-print-orientation], [data-storage-kind]');
  if (!target || target.disabled) return;
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id);
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const raw = target.dataset.value;
    return update({ [key]: typeof s()[key] === 'number' ? Number(raw) : raw });
  }
  if (target.dataset.printOrientation) return changePrint({ orientation: target.dataset.printOrientation });
  if (target.dataset.storageKind) {
    const kind = target.dataset.storageKind;
    const storage = state.draft.storage;
    if (!storage.port || Object.values(DEFAULT_PORTS).includes(Number(storage.port))) storage.port = DEFAULT_PORTS[kind] ?? null;
    storage.kind = kind;
    state.dbResult = null;
    return render();
  }
  const value = target.dataset.value;
  switch (target.dataset.action) {
    case 'close':
      if (kind === 'menu') return chooseMenu(null);
      return close(kind === 'confirm' ? { choice: 'cancel' } : null);
    case 'tab':
      state.tab = value;
      return render();
    case 'choice':
      return close({ choice: value });
    case 'reset-settings': {
      const keep = { backgroundImage: s().backgroundImage, backgroundName: s().backgroundName, lastDirectory: s().lastDirectory, language: s().language };
      return update({ ...defaultSettings(s().language), ...keep });
    }
    case 'choose-background':
      return action('choose-background');
    case 'clear-background':
      return action('clear-background');
    case 'open-recent':
      await action('open-recent', { path: value });
      return kind === 'recent' ? close() : undefined;
    case 'remove-recent':
      storeRecent(globalThis.localStorage, removeRecent(loadRecent(globalThis.localStorage), value));
      return render();
    case 'clear-recent':
      storeRecent(globalThis.localStorage, []);
      return render();
    case 'copy-error':
      try {
        await copyText(errorReport());
        state.copied = true;
        render();
      } catch (error) {
        root.querySelector('#copy-state').textContent = `${t('error.copyFailed')}: ${native.errorText(error)}`;
      }
      return undefined;
    case 'copy-about':
      return copyText([...root.querySelectorAll('#about-rows .row')].map((element) => element.innerText.replace(/\s*\n\s*/g, ': ')).join('\n'))
        .then(() => action('notice', { kind: 'success', text: t('error.copied') }));
    case 'page':
      state.page += Number(value);
      return render();
    case 'print':
      return doPrint();
    case 'test-db':
      return testDatabase();
    case 'project-apply':
      return applyProject();
    case 'browse-db': {
      const file = await native.chooseDatabaseFile(state.draft.storage.file || 'mykanban.db');
      if (file) { state.draft.storage.file = file; render(); }
      return undefined;
    }
    case 'board-move': {
      const [index, step] = value.split(':').map(Number);
      const boards = state.draft.boards;
      [boards[index], boards[index + step]] = [boards[index + step], boards[index]];
      return render();
    }
    case 'board-remove':
      state.draft.boards.splice(Number(value), 1);
      return render();
    case 'image-step':
      state.imageIndex += Number(value);
      return render();
    case 'image-open':
      return action('attachment-open', { item: state.params.items[state.imageIndex] });
    case 'image-save':
      return action('attachment-save', { item: state.params.items[state.imageIndex] });
    default:
      return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.draftToggle) { state.draft.storage[target.dataset.draftToggle] = target.checked; return undefined; }
  if (target.dataset.draft) return undefined;
  if (target.dataset.toggle) return update({ [target.dataset.toggle]: target.checked });
  if (target.dataset.select) {
    const key = target.dataset.select;
    return update({ [key]: typeof s()[key] === 'number' ? Number(target.value) : target.value });
  }
  if (target.dataset.text) return update({ [target.dataset.text]: target.value });
  if (target.dataset.range) return update({ [target.dataset.range]: Number(target.value) });
  if (target.dataset.printRange) return changePrint({ range: target.dataset.printRange, columnIds: null, selectedOnly: target.dataset.printRange === 'custom' ? printSetup().selectedOnly : false });
  if (target.dataset.printToggle) return changePrint({ [target.dataset.printToggle]: target.checked });
  if (target.dataset.print) return changePrint({ [target.dataset.print]: target.value });
  if ('printScale' in target.dataset) return changePrint({ scale: Number(target.value) });
  if (target.dataset.printColumn) {
    const all = (state.params.boards?.[state.params.current ?? 0]?.columns ?? []).map((column) => column.id);
    const current = new Set(printSetup().columnIds ?? all);
    if (target.checked) current.add(target.dataset.printColumn); else current.delete(target.dataset.printColumn);
    return changePrint({ columnIds: all.filter((id) => current.has(id)) });
  }
  return undefined;
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.draft) {
    const [first, second] = target.dataset.draft.split('.');
    if (second) state.draft[first][second] = target.value;
    else state.draft[first] = target.value;
  }
  const output = target.parentElement?.querySelector('output');
  if (target.dataset.range && output) output.textContent = `${target.value}${target.dataset.range === 'fontSize' ? 'px' : '%'}`;
  if ('printScale' in target.dataset && output) output.textContent = `${target.value}%`;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (kind === 'menu') chooseMenu(null);
    else if (kind !== 'progress') close(kind === 'confirm' ? { choice: 'cancel' } : null);
  }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    if (event.key === 'Enter' && document.activeElement?.classList.contains('menu-item')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id); }
  }
  if (kind === 'print' && event.key === 'PageDown') { state.page += 1; render(); }
  if (kind === 'image' && event.key === 'ArrowRight' && state.imageIndex < (state.params.items?.length ?? 0) - 1) { state.imageIndex += 1; render(); }
  if (kind === 'image' && event.key === 'ArrowLeft' && state.imageIndex > 0) { state.imageIndex -= 1; render(); }
  if (kind === 'project' && event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); applyProject(); }
  if (kind === 'print' && event.key === 'PageUp') { state.page -= 1; render(); }
});
document.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('textarea, input')) event.preventDefault();
});

// Menus close when they lose focus (a click anywhere else).
window.addEventListener('blur', () => {
  if (kind === 'menu' && menuOpen) setTimeout(() => { if (!document.hasFocus()) chooseMenu(null); }, 60);
});

// Web: drag the frame by its header.
if (!desktop) {
  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-drag-region]');
    if (!handle || event.target.closest('button')) return;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => send('drag', { dx: moveEvent.movementX, dy: moveEvent.movementY });
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true });
  });
}

// Settings changed elsewhere (main window: zoom, panels, theme menu…).
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    state.settings = loadSettings(globalThis.localStorage);
    applyLook();
    if (kind !== 'menu') render();
  } else if (event.key === RECENT_KEY && (kind === 'recent' || state.tab === 'recent')) {
    render();
  }
});

function onHostMessage(message) {
  if (message?.type === 'progress') {
    state.progress = message;
    if (kind === 'progress') render();
  } else if (message?.type === 'done' && kind === 'progress') {
    state.progress = state.progress ? { ...state.progress, done: state.progress.total } : null;
    render();
  } else if (message?.type === 'attachment' && kind === 'image') {
    state.imageCache?.set(message.id, message.data ?? '');
    render();
  } else if (message?.type === 'refresh') {
    refresh();
  }
}

function refresh() {
  state.params = popupParams(kind);
  state.settings = loadSettings(globalThis.localStorage);
  if (state.params.tab) state.tab = state.params.tab;
  state.copied = false;
  state.progress = null;
  state.page = 0;
  if (kind === 'print') state.print = null;
  if (kind === 'project') state.draft = null;
  if (kind === 'image') { state.imageIndex = null; state.imageCache = new Map(); }
  applyLook();
  render();
}

if (desktop) {
  native.listen('popup-message', onHostMessage);
  native.listen('popup-refresh', () => refresh());
  if (kind === 'progress') {
    native.listen('io-progress', (progress) => {
      if (progress.op !== state.params.op) return;
      state.progress = progress;
      render();
    });
  }
} else {
  window.addEventListener('message', (event) => {
    if (event.origin === location.origin && event.data?.mykanbanHost) onHostMessage(event.data);
  });
}
window.addEventListener('resize', () => { if (kind === 'print') fitPreview(); });

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__mykanbanPopup = { kind, state, render, close, errorReport, printLayout, refresh, applyProject, testDatabase };

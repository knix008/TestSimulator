// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web build, tutorial: ?popup=<kind>). Every
// popup has a fixed size chosen so its content fits without scrolling; long
// content is split into tabs or pages, and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { loadRecent, loadRecentDirs, MAX_RECENT, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, BACKGROUND_FITS, BACKGROUND_KINDS, defaultSettings, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, loadSettings, PRINT_KEY,
  RECENT_DIRS_KEY, RECENT_KEY, STORAGE_KEY, storeSettings, VIEWS, ZOOM, GRID_SIZES, STENCIL_SIZES, DESIGN_IDS, PAPERS as PAPER_IDS, UNIT_IDS, ROUTE_IDS,
  DB_KINDS, dbPortOf, dbProblems, usesDbServer,
} from './domain/settings.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { POPUPS, popupParams } from './platform/popups.js';
import {
  applyFont, applyTheme, contrast, CUSTOM, CUSTOM_KEYS, customFrom, DARK_THEMES, LIGHT_THEMES, resolveTheme, SYSTEM, themeName,
} from './themes.js';
import { bindSteppers, stepperHtml } from './stepper.js';
import { defaultPrintOptions, FITS, MARGINS, PAPERS, RANGES, renderPrintSheets } from './print/render.js';
import { normalizeDocument } from './domain/format.js';
import { ANIMATION_INTERVALS } from './domain/settings.js';
import { intervalLabel } from './ui/startpage.js';
import { IMAGE_FORMATS, IMAGE_SCALES, imageFormat, rasterSize } from './export/image-encode.js';
import { ARROWS, DASHES, DESIGNS, FONTS, FILL_PATTERNS, QUICK_VARIANTS, variantColors } from './domain/designs.js';
import { DATA_TYPES, formatLength, PAGE_SIZES, paperSize, parseLength, newId } from './domain/diagram.js';
import { LAYOUTS } from './domain/layout.js';
import { canvasMeasure } from './views/canvas.js';

const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const kind = new URLSearchParams(location.search).get('popup') ?? (desktop ? appWindow.label.replace(/^popup-/, '') : 'settings');
const root = document.querySelector('#app');
document.title = `popup-${kind}`;
document.documentElement.classList.add(`popup-kind-${kind}`);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

// ───────────────────────── bridge to the main window

function send(type, data) {
  if (desktop) return native.emitTo('main', 'popup-message', { kind, type, data }).catch(() => {});
  globalThis.parent?.postMessage({ mydiagram: true, kind, type, data }, location.origin);
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
  themeGroup: popupParams(kind).themeGroup ?? null,
  fonts: null,
  fontError: null,
  info: null,
  progress: null,
  copied: false,
  exists: {},
  print: null,
  page: 0,
  pager: {},
};
const s = () => state.settings;
const P = () => state.params;
const L = () => getLanguage();

function applyLook() {
  setLanguage(s().language);
  applyTheme(resolveTheme(s().theme, prefersDark(), s().customTheme));
  applyFont(s());
}

function update(patch) {
  // A changed connection makes the last connection test meaningless.
  if (Object.keys(patch).some((key) => key.startsWith('db'))) state.dbResult = null;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  applyLook();
  render();
}

window.addEventListener('error', (event) => action('report-error', { message: String(event.error?.message ?? event.message), detail: String(event.error?.stack ?? ''), context: `popup-${kind}` }));
window.addEventListener('unhandledrejection', (event) => action('report-error', { message: native.errorText(event.reason), detail: String(event.reason?.stack ?? ''), context: `popup-${kind}` }));

// ───────────────────────── frame

let osTitle = '';
function setOsTitle(title) {
  if (!desktop || !title || title === osTitle) return;
  osTitle = title;
  appWindow.setTitle(`${title} — MyDiagram v${VERSION}`).catch(() => {});
}

function frame({ glyph, title, body, foot = '', tabs = '' }) {
  setOsTitle(title);
  return `<div class="popup popup-${kind}" role="dialog" aria-labelledby="popup-title">
    <header class="popup-head" data-tauri-drag-region data-drag-region>
      <h2 id="popup-title" data-tauri-drag-region>${icon(glyph)}<span data-tauri-drag-region>${escapeHtml(title)}</span></h2>
      <button class="window-button" data-action="close" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button>
    </header>
    ${tabs}
    <div class="popup-body">${body}</div>
    ${foot ? `<footer class="popup-foot">${foot}</footer>` : ''}
  </div>`;
}

const button = (actionName, label, glyph = '', extra = '', value = '', attrs = '') =>
  `<button class="button ${extra}" data-action="${actionName}" ${value !== '' ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(label)}" ${attrs}>${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`;

const row = (glyph, label, control, title = label, cls = '') => `<div class="row ${cls}" title="${escapeHtml(title)}"><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control">${control}</span></div>`;

/** [−] value [+] for a number. */
const numberField = (key, value, min, max, step, unit, label) => stepperHtml({
  key, value, min, max, step, unit, label,
  decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }),
});

const toggle = (key, label, glyph, checked = s()[key], attr = 'data-toggle') => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" ${attr}="${key}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);

const segmented = (key, options, current, attr = 'data-setting') => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `
  <button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" ${attr}="${key}" data-value="${escapeHtml(value)}" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}${escapeHtml(label)}</button>`).join('')}</span>`;

const select = (attrName, key, options, current, label) => `<select ${attrName}="${key}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(current) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;

// Tabs scroll inside their strip; "<" ">" at the right end move it (no scroll bar).
const tabsHtml = (list, current, actionName = 'tab') => `<nav class="tabs" role="tablist"><div class="tabs-strip">${list.map(([id, glyph, label]) => `
  <button class="tab ${current === id ? 'active' : ''}" role="tab" aria-selected="${current === id}" data-action="${actionName}" data-value="${id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</div>
  <span class="tabs-nav">
    <button class="tabs-scroll" data-action="tabs-scroll" data-value="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
    <button class="tabs-scroll" data-action="tabs-scroll" data-value="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
  </span></nav>`;

/** Keeps the popup's tab strip where it was across redraws, shows the active tab, and enables "<" ">" only when there is more to see. */
function updateTabsNav({ reveal = true } = {}) {
  const strip = root.querySelector('.tabs-strip');
  if (!strip) return;
  strip.scrollLeft = state.tabScroll ?? 0;
  const active = strip.querySelector('.tab.active');
  if (reveal && active) {
    if (active.offsetLeft < strip.scrollLeft) strip.scrollLeft = active.offsetLeft;
    else if (active.offsetLeft + active.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = active.offsetLeft + active.offsetWidth - strip.clientWidth;
  }
  state.tabScroll = strip.scrollLeft;
  const [left, right] = root.querySelectorAll('.tabs-scroll');
  left.disabled = strip.scrollLeft <= 0;
  right.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  root.querySelector('.tabs')?.classList.toggle('overflow', strip.scrollWidth > strip.clientWidth + 1);
}

function scrollPopupTabs(direction) {
  const strip = root.querySelector('.tabs-strip');
  if (!strip) return;
  strip.scrollLeft += direction * Math.max(120, strip.clientWidth * 0.6);
  state.tabScroll = strip.scrollLeft;
  updateTabsNav({ reveal: false });
}


/** Pages for lists that do not fit (no scroll bars): [items of this page, pager html]. */
function paged(name, items, perPage) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.max(0, Math.min(pages - 1, state.pager[name] ?? 0));
  state.pager[name] = page;
  const pager = pages > 1 ? `<span class="pager"><button class="icon-button" data-action="pager" data-value="${name}:-1" title="${escapeHtml(t('common.prevPage'))}" aria-label="${escapeHtml(t('common.prevPage'))}" ${page === 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button><span>${page + 1} / ${pages}</span><button class="icon-button" data-action="pager" data-value="${name}:1" title="${escapeHtml(t('common.nextPage'))}" aria-label="${escapeHtml(t('common.nextPage'))}" ${page >= pages - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button></span>` : '';
  return [items.slice(page * perPage, (page + 1) * perPage), pager, page * perPage];
}

function render() {
  try {
    ({
      settings: renderSettings, about: renderAbout, confirm: renderConfirm, error: renderError, progress: renderProgress, recent: renderRecent,
      print: renderPrint, menu: renderMenu, theme: renderThemePicker, welcome: renderWelcome, image: renderImage, database: renderDatabase,
      shape: renderShapeFormat, data: renderData, page: renderPageSetup, layers: renderLayers, find: renderFind, document: renderDocument,
      layout: renderLayout, hyperlink: renderHyperlink, design: renderDesign, import: renderImport, stencil: renderStencil, color: renderColor, prompt: renderPrompt,
    })[kind]?.();
    alignRows();
    updateTabsNav();
  } catch (error) {
    action('report-error', { message: String(error?.message ?? error), detail: String(error?.stack ?? ''), context: `popup-${kind}` });
  }
}

/** One label column per popup body: as wide as its widest label, so all controls line up. */
function alignRows() {
  for (const body of root.querySelectorAll('.popup-body')) {
    const labels = [...body.querySelectorAll('.row:not(.col-row):not(.recent-row) > .row-label')];
    if (!labels.length) continue;
    body.style.setProperty('--label-col', 'max-content');
    const widest = Math.max(...labels.map((label) => Math.ceil(label.getBoundingClientRect().width)));
    const width = Math.min(Math.max(widest + 12, 140), Math.round(body.clientWidth * 0.5));
    body.style.setProperty('--label-col', `${width}px`);
  }
}

/** Popups whose height follows their content (confirm, about, welcome): sized once drawn. */
function fitHeight() {
  const popup = root.querySelector('.popup');
  if (!popup) return;
  popup.classList.add('fit');
  const height = Math.ceil(popup.getBoundingClientRect().height);
  popup.classList.remove('fit');
  const target = Math.min(height, window.screen.availHeight - 40);
  if (Math.abs(target - window.innerHeight) <= 1) return;
  if (desktop) appWindow.setSize(new LogicalSize(window.innerWidth, target)).catch(() => {});
  else send('resize', { height: target });
}

// ───────────────────────── settings

const SETTINGS_TABS = [
  ['general', 'globe', 'settings.general'],
  ['start', 'home', 'settings.startPage'],
  ['appearance', 'palette', 'settings.theme'],
  ['font', 'font', 'settings.font'],
  ['background', 'sparkles', 'settings.background'],
  ['drawing', 'viewDrawing', 'settings.drawing'],
  ['defaults', 'fileNew', 'settings.defaults'],
  ['database', 'database', 'settings.database'],
  ['recent', 'recent', 'settings.recent'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

function renderSettings() {
  const body = {
    general: settingsGeneral, start: settingsStart, appearance: settingsAppearance, font: settingsFont, background: settingsBackground,
    drawing: settingsDrawing, defaults: settingsDefaults, database: settingsDatabase, recent: settingsRecent, shortcuts: settingsShortcuts,
  }[state.tab]?.() ?? '';
  root.innerHTML = frame({
    glyph: 'gear', title: t('settings.title'), tabs: tabsHtml(SETTINGS_TABS.map(([id, glyph, key]) => [id, glyph, t(key)]), state.tab),
    body: `<div class="settings-page settings-${state.tab}">${body}</div>`,
    foot: `${button('reset-settings', t('settings.reset'), 'refresh')}<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
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
    toggle('statusClock', t('settings.statusClock'), 'clock'),
    toggle('showStatusBar', t('action.statusBar'), 'statusBar'),
    row('folder', t('settings.lastDirectory'), `<span class="path" title="${escapeHtml(s().lastDirectory ?? '')}">${escapeHtml(s().lastDirectory ?? t('common.none'))}</span>`),
    row('tutorial', t('settings.tutorial'), button('start-tutorial', t('start.tutorialStart'), 'play', 'small')),
  ].join('');
}

/** Start page: shown at start or not, and which of its parts it shows. */
function settingsStart() {
  return [
    toggle('showStartPage', t('settings.showStartPage'), 'home'),
    toggle('startShowRecent', t('settings.startShowRecent'), 'recent'),
    row('list', t('settings.startRecentCount'), numberField('startRecentCount', s().startRecentCount, 1, 10, 1, '', t('settings.startRecentCount'))),
    toggle('startShowFolders', t('settings.startShowFolders'), 'recentFolder'),
    toggle('startShowSamples', t('settings.startShowSamples'), 'samples'),
    toggle('startShowBackground', t('settings.startShowBackground'), 'sparkles'),
    toggle('startShowTutorialBanner', t('settings.startShowTutorialBanner'), 'bulb'),
    row('home', t('settings.startOpen'), button('show-start', t('settings.startOpenButton'), 'home', 'small')),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.startHint'))}</span>`, t('settings.startHint')),
  ].join('');
}

function themeRow(theme, active) {
  const name = themeName(theme.id, L());
  return `<button class="theme-row ${active ? 'active' : ''}" role="radio" aria-checked="${active}" data-setting="theme" data-value="${theme.id}" title="${escapeHtml(name)}">
    <span class="theme-swatch">${theme.swatch.map((color) => `<i style="background:${color}"></i>`).join('')}</span>
    <span class="theme-name">${escapeHtml(name)}</span>${active ? icon('check', 'icon check') : ''}
  </button>`;
}

function settingsAppearance() {
  const current = s().theme;
  const group = state.themeGroup ?? (current === CUSTOM ? 'custom' : DARK_THEMES.some((theme) => theme.id === current) ? 'dark' : 'light');
  state.themeGroup = group;
  const groups = [['dark', 'moon', t('settings.themeDark', { count: DARK_THEMES.length })], ['light', 'sun', t('settings.themeLight', { count: LIGHT_THEMES.length })], ['custom', 'palette', t('settings.themeCustom')]];
  const head = `<div class="row theme-head">
    <span class="segmented" role="tablist">${groups.map(([id, glyph, label]) => `<button class="segment ${group === id ? 'active' : ''}" data-theme-group="${id}" role="tab" aria-selected="${group === id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</span>
    <span class="grow"></span>
    <button class="theme-row compact ${current === SYSTEM ? 'active' : ''}" data-setting="theme" data-value="${SYSTEM}" title="${escapeHtml(themeName(SYSTEM, L()))}">${icon('sun')}<span class="theme-name">${escapeHtml(themeName(SYSTEM, L()))}</span>${current === SYSTEM ? icon('check', 'icon check') : ''}</button>
  </div>`;
  if (group === 'custom') return head + customThemeEditor();
  const list = group === 'dark' ? DARK_THEMES : LIGHT_THEMES;
  return `${head}<div class="theme-list" role="radiogroup">${list.map((theme) => themeRow(theme, current === theme.id)).join('')}</div>`;
}

/** Custom theme: dark/light, the editable colours, copy from the current theme; a warning when text would be hard to read. */
function customThemeEditor() {
  const custom = s().customTheme;
  const using = s().theme === CUSTOM;
  const low = [['text', 'bg'], ['text', 'surface'], ['accentText', 'accent'], ['text', 'panel']].filter(([a, b]) => contrast(custom[a], custom[b]) < 4.5);
  return `<div class="row custom-actions">
      <button class="button small ${using ? 'primary' : ''}" data-action="use-custom" title="${escapeHtml(t('settings.useCustom'))}">${icon(using ? 'check' : 'palette')}<span>${escapeHtml(t('settings.useCustom'))}</span></button>
      <label class="switch-wrap" title="${escapeHtml(t('settings.customDark'))}"><input type="checkbox" data-custom-dark ${custom.dark ? 'checked' : ''} aria-label="${escapeHtml(t('settings.customDark'))}" /><span class="switch" aria-hidden="true"></span></label><span>${escapeHtml(t('settings.customDark'))}</span>
      <span class="grow"></span>
      <button class="button small" data-action="copy-theme" title="${escapeHtml(t('settings.copyTheme'))}">${icon('copy')}<span>${escapeHtml(t('settings.copyTheme'))}</span></button>
    </div>
    <div class="color-grid">${CUSTOM_KEYS.map((key) => `<label class="row color-row" title="${escapeHtml(t(`colorKey.${key}`))}">
      <span class="row-label">${icon('palette')}<span>${escapeHtml(t(`colorKey.${key}`))}</span></span>
      <span class="row-control"><code>${escapeHtml(custom[key])}</code><input type="color" data-custom-color="${key}" value="${escapeHtml(custom[key])}" aria-label="${escapeHtml(t(`colorKey.${key}`))}" /></span>
    </label>`).join('')}</div>
    <div class="row theme-preview" style="background:${custom.bg};color:${custom.text};border-color:${custom.border}">
      <span class="preview-chip" style="background:${custom.surface};color:${custom.text};border:1px solid ${custom.border}">${escapeHtml(t('shape.sample'))}</span>
      <span class="preview-chip" style="background:${custom.accent};color:${custom.accentText}">${escapeHtml(t('settings.themeCustom'))}</span>
      <span style="color:${custom.muted}">${escapeHtml(t('settings.fontSample'))}</span>
      <span class="grow"></span>${low.length ? `<span class="badge danger" title="${escapeHtml(t('settings.lowContrast'))}">${icon('warning')}${escapeHtml(t('settings.lowContrast'))}</span>` : `<span class="badge ok">${icon('check')}${escapeHtml(t('settings.contrastOk'))}</span>`}
    </div>`;
}

// ───────────────────────── theme dropdown (toolbar): two columns, dark | light

let pickerDone = false;
function renderThemePicker() {
  const current = s().theme;
  const column = (glyph, title, list) => `<div class="picker-column">
    <h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>
    ${list.map((theme) => `<button class="picker-item ${current === theme.id ? 'active' : ''}" data-pick-theme="${theme.id}" title="${escapeHtml(themeName(theme.id, L()))}">
      <span class="theme-swatch">${theme.swatch.map((color) => `<i style="background:${color}"></i>`).join('')}</span>
      <span class="theme-name">${escapeHtml(themeName(theme.id, L()))}</span>${current === theme.id ? icon('check', 'icon check') : ''}
    </button>`).join('')}
  </div>`;
  root.innerHTML = frame({
    glyph: 'palette', title: t('theme.pickTitle'),
    body: `<div class="theme-picker">
      <div class="picker-top">
        <button class="picker-item ${current === SYSTEM ? 'active' : ''}" data-pick-theme="${SYSTEM}" title="${escapeHtml(themeName(SYSTEM, L()))}">${icon('sun')}<span class="theme-name">${escapeHtml(themeName(SYSTEM, L()))}</span>${current === SYSTEM ? icon('check', 'icon check') : ''}</button>
        <button class="picker-item ${current === CUSTOM ? 'active' : ''}" data-pick-theme="${CUSTOM}" title="${escapeHtml(themeName(CUSTOM, L()))}">${icon('palette')}<span class="theme-name">${escapeHtml(themeName(CUSTOM, L()))}</span>${current === CUSTOM ? icon('check', 'icon check') : ''}</button>
      </div>
      <div class="picker-columns">${column('moon', t('theme.darkGroup', { count: DARK_THEMES.length }), DARK_THEMES)}${column('sun', t('theme.lightGroup', { count: LIGHT_THEMES.length }), LIGHT_THEMES)}</div>
    </div>`,
    foot: `<button class="button small" data-action="edit-custom" title="${escapeHtml(t('settings.editCustom'))}">${icon('edit')}<span>${escapeHtml(t('settings.editCustom'))}</span></button><button class="button small" data-action="random-theme" title="${escapeHtml(t('action.themeRandom'))}">${icon('dice')}<span>${escapeHtml(t('action.themeRandom'))}</span></button><span class="grow"></span>${button('close', t('common.close'), 'close')}`,
  });
  const anchor = P().anchor;
  if (anchor && !state.placed) {
    state.placed = true;
    const size = POPUPS.theme;
    if (desktop) native.invoke('place_popup', { x: anchor.x, y: anchor.y, width: size.width, height: size.height, flipY: anchor.flipY ?? null, show: true }).catch(() => {});
    else send('place', { x: anchor.x, y: anchor.y, width: size.width, height: size.height, flipY: anchor.flipY ?? null });
  }
  ready();
}

function settingsFont() {
  const fonts = state.fonts ?? [];
  const current = s().fontFamily;
  const options = [`<option value="">${escapeHtml(t('settings.fontDefault'))}</option>`]
    .concat((current && !fonts.includes(current) ? [current, ...fonts] : fonts).map((family) => `<option value="${escapeHtml(family)}" ${family === current ? 'selected' : ''}>${escapeHtml(family)}</option>`));
  const status = state.fontError ? `${t('error.fonts')}: ${state.fontError}` : state.fonts ? t('settings.fontCount', { count: fonts.length }) : t('settings.fontLoading');
  return [
    row('font', t('settings.fontFamily'), `<select data-select="fontFamily" id="font-family" title="${escapeHtml(t('settings.fontFamily'))}" aria-label="${escapeHtml(t('settings.fontFamily'))}">${options.join('')}</select>`),
    row('info', t('settings.fontScope'), `<span class="muted" id="font-status">${escapeHtml(status)}</span>`, status),
    row('zoomIn', t('settings.fontSize'), numberField('fontSize', s().fontSize, FONT_SIZE.min, FONT_SIZE.max, 1, 'px', t('settings.fontSize'))),
    row('edit', t('settings.fontWeight'), select('data-select', 'fontWeight', FONT_WEIGHTS.map((weight) => [weight, `${weight} — ${t(`settings.weight.${weight}`)}`]), s().fontWeight, t('settings.fontWeight'))),
    row('font', t('settings.fontStyle'), segmented('fontStyle', FONT_STYLES.map((style) => [style, t(`settings.${style}`)]), s().fontStyle)),
    row('list', t('settings.rowHeight'), numberField('rowHeight', s().rowHeight, 20, 44, 2, 'px', t('settings.rowHeight'))),
    row('zoomReset', t('settings.zoom'), numberField('zoom', s().zoom, ZOOM.min, ZOOM.max, ZOOM.step, '%', t('settings.zoom'))),
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
    row('layers', t('settings.bgKind'), segmented('backgroundKind', BACKGROUND_KINDS.map((k) => [k, t(`bgKind.${k}`)]), s().backgroundKind)),
    row('sparkles', t('settings.animation'), select('data-select', 'animation', ANIMATIONS.map((a) => [a, t(`animation.${a}`)]), s().animation, t('settings.animation'))
      + button('shuffle-background', t('action.shuffleBackground'), 'dice', 'small'), t('settings.animation'), 'full'),
    row('speed', t('settings.animationSpeed'), numberField('animationSpeed', s().animationSpeed, 0, 300, 10, '%', t('settings.animationSpeed'))),
    toggle('animationRandom', t('settings.bgRandom'), 'dice'),
    row('clock', t('settings.bgInterval'), select('data-select', 'animationInterval', ANIMATION_INTERVALS.map((n) => [n, intervalLabel(n)]), s().animationInterval, t('settings.bgInterval'))),
    toggle('animationOnStartOnly', t('settings.animationOnStartOnly'), 'home'),
    row('imageBg', t('settings.bgImage'), `<span class="path" id="bg-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      ${button('choose-background', t('settings.bgChoose'), 'folder', 'small')}
      ${button('clear-background', t('settings.bgClear'), 'imageClear', 'small')}`, t('settings.bgImage'), 'full'),
    row('opacity', t('settings.bgOpacity'), numberField('backgroundOpacity', s().backgroundOpacity, 0, 100, 5, '%', t('settings.bgOpacity'))),
    row('fitPage', t('settings.bgFit'), segmented('backgroundFit', BACKGROUND_FITS.map((fit) => [fit, t(`settings.fit.${fit}`)]), s().backgroundFit), t('settings.bgFit'), 'full'),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.bgHint'))}</span>`, t('settings.bgHint')),
  ].join('');
}

// The desktop app also shows popups as frames (tutorial); the database needs the desktop app.
// (__mydiagramDbPreview: layout checks draw the full tab in the web build.)
const desktopApp = () => desktop || Boolean(globalThis.__mydiagramDbPreview) || (() => { try { return Boolean(globalThis.parent?.__TAURI_INTERNALS__); } catch { return false; } })();
const DB_NAMES = { sqlite: 'SQLite', mariadb: 'MariaDB', mysql: 'MySQL', postgres: 'PostgreSQL' };
const dbText = (key, label, attrs = '') => `<input type="text" data-db-text="${key}" value="${escapeHtml(s()[key])}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" spellcheck="false" autocomplete="off" ${attrs} />`;

function settingsDatabase() {
  if (!desktopApp()) return row('info', '', `<span class="muted">${escapeHtml(t('db.desktopOnly'))}</span>`, t('db.desktopOnly'));
  const kind = s().dbKind;
  const rows = [row('database', t('db.kind'), segmented('dbKind', DB_KINDS.map((k) => [k, k === 'none' ? t('db.kindNone') : DB_NAMES[k]]), kind))];
  if (kind === 'sqlite') {
    rows.push(row('file', t('db.file'), `${dbText('dbFile', t('db.file'), `placeholder="${escapeHtml(t('db.filePlaceholder'))}"`)}${button('db-browse', t('db.browse'), 'folder', 'small')}`));
  }
  if (usesDbServer(kind)) {
    const password = s().dbSavePassword ? s().dbPassword : state.dbPassword ?? '';
    rows.push(
      row('server', t('db.host'), dbText('dbHost', t('db.host'))),
      row('plug', t('db.port'), numberField('dbPort', dbPortOf(s()), 1, 65535, 1, '', t('db.port'))),
      row('layers', t('db.name'), dbText('dbName', t('db.name'))),
      row('user', t('db.user'), dbText('dbUser', t('db.user'))),
      row('key', t('db.password'), `<input type="password" data-db-password value="${escapeHtml(password)}" placeholder="${escapeHtml(s().dbSavePassword ? '' : t('db.passwordSession'))}" title="${escapeHtml(t('db.password'))}" aria-label="${escapeHtml(t('db.password'))}" autocomplete="new-password" />`),
      toggle('dbSavePassword', t('db.savePassword'), 'save', s().dbSavePassword, 'data-db-toggle'),
    );
  }
  if (kind !== 'none') {
    const result = state.dbResult;
    const badge = result ? `<span class="badge ${result.ok === null ? '' : result.ok ? 'ok' : 'danger'} db-result" id="db-result" title="${escapeHtml(result.text)}">${icon(result.ok === null ? 'clock' : result.ok ? 'check' : 'warning')}<span>${escapeHtml(result.text)}</span></span>` : '';
    rows.push(row('plug', t('db.test'), `${button('db-test', t('db.test'), 'plug', 'small')}${badge}`));
  }
  rows.push(row('info', '', `<span class="muted">${escapeHtml(t(kind === 'none' ? 'db.hintNone' : 'db.hint'))}</span>`, t(kind === 'none' ? 'db.hintNone' : 'db.hint')));
  return rows.join('');
}

function testDatabase() {
  const problems = dbProblems(s());
  if (problems.length) {
    state.dbResult = { ok: false, text: problems.map((code) => t(code)).join(' · ') };
    return render();
  }
  state.dbResult = { ok: null, text: t('db.testing') };
  render();
  return action('db-test', { password: s().dbSavePassword ? '' : state.dbPassword ?? '' });
}

// ───────────────────────── plans stored in the database (File › Open from database)

function renderDatabase() {
  const p = P();
  const items = state.dbItems ?? p.items ?? [];
  const [page, pager, start] = paged('database', items, 12);
  const when = (seconds) => (Number(seconds) ? new Date(Number(seconds) * 1000).toLocaleString(L() === 'en' ? 'en-US' : 'ko-KR') : '');
  const rows = items.length ? page.map((item, index) => {
    const name = item.title || item.id;
    return `<div class="row recent-row db-row" data-id="${escapeHtml(item.id)}" title="${escapeHtml(`${name} · ${item.id}`)}">
      <span class="row-label"><b class="recent-index">${start + index + 1}</b>${icon('diagram')}<span class="recent-name">${escapeHtml(name)}</span></span>
      <span class="row-control"><span class="recent-path">${escapeHtml(t('db.updated', { when: when(item.updated), size: formatBytes(Number(item.size) || 0) }))}</span>
      ${button('db-open', t('db.open'), 'folderOpen', 'small', item.id)}
      <button class="icon-button" data-action="db-delete" data-value="${escapeHtml(item.id)}" data-title="${escapeHtml(name)}" title="${escapeHtml(t('db.delete'))}" aria-label="${escapeHtml(t('db.delete'))}">${icon('trash')}</button></span>
    </div>`;
  }).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('db.empty'))}</span></div>`;
  root.innerHTML = frame({
    glyph: 'dbOpen', title: t('db.openTitle'),
    body: `<div class="recent-list">${rows}</div>`,
    foot: `<span class="muted path" title="${escapeHtml(p.where ?? '')}">${escapeHtml(t('db.count', { count: items.length, where: p.where ?? '' }))}</span>${pager}<span class="grow"></span>${button('db-refresh', t('db.refresh'), 'refresh')}${button('close', t('common.done'), 'check', 'primary')}`,
  });
  ready();
}

function recentRows(list, { compact = false, folders = false, start = 0 } = {}) {
  if (!list.length) return `<div class="row empty">${icon('info')}<span>${escapeHtml(t(folders ? 'recent.noFolders' : 'recent.empty'))}</span></div>`;
  return list.map((item, index) => {
    const missing = state.exists[item.path] === false;
    const name = item.path.split(/[\\/]/).pop() || item.path;
    return `<div class="row recent-row ${missing ? 'missing' : ''}" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
      <span class="row-label"><b class="recent-index">${start + index + 1}</b>${icon(folders ? 'folder' : 'diagram')}<span class="recent-name">${escapeHtml(name)}</span></span>
      <span class="recent-path">${escapeHtml(item.web ? t('recent.webFile') : item.path)}</span>
      ${missing ? `<span class="badge danger">${escapeHtml(t('recent.missing'))}</span>` : ''}
      ${compact ? '' : button(folders ? 'open-folder' : 'open-recent', t(folders ? 'recent.openFolder' : 'recent.open'), folders ? 'folderOpen' : 'importFile', 'small', item.path)}
      <button class="icon-button" data-action="${folders ? 'remove-folder' : 'remove-recent'}" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t(folders ? 'recent.removeFolder' : 'recent.remove'))}" aria-label="${escapeHtml(t(folders ? 'recent.removeFolder' : 'recent.remove'))}">${icon('trash')}</button>
    </div>`;
  }).join('');
}

function settingsRecent() {
  const list = loadRecent(globalThis.localStorage);
  const dirs = loadRecentDirs(globalThis.localStorage);
  const [files, filePager] = paged('settings-recent', list, 6);
  const [folders, folderPager, folderStart] = paged('settings-dirs', dirs, 4);
  return `<h3 class="section-title">${icon('recent')}${escapeHtml(t('start.recent'))} <span class="muted">(${list.length}/${MAX_RECENT})</span>${filePager}<span class="grow"></span>${button('clear-recent', t('recent.clear'), 'clearHistory', 'small danger', '', list.length ? '' : 'disabled')}</h3>
    ${recentRows(files, { compact: true, start: (state.pager['settings-recent'] ?? 0) * 6 })}
    <h3 class="section-title">${icon('recentFolder')}${escapeHtml(t('start.recentFolders'))} <span class="muted">(${dirs.length}/${MAX_RECENT})</span>${folderPager}<span class="grow"></span>${button('clear-folders', t('recent.clearFolders'), 'trash', 'small danger', '', dirs.length ? '' : 'disabled')}</h3>
    ${recentRows(folders, { compact: true, folders: true, start: folderStart })}`;
}

async function checkRecent() {
  const list = [...loadRecent(globalThis.localStorage), ...loadRecentDirs(globalThis.localStorage)].filter((item) => !item.web && !(item.path in state.exists));
  if (!list.length || !desktop) return;
  const exists = await native.pathsExist(list.map((item) => item.path)).catch(() => list.map(() => true));
  list.forEach((item, index) => { state.exists[item.path] = exists[index]; });
  render();
}

export const SHORTCUT_LIST = [
  ['Ctrl+N', 'action.new'], ['Ctrl+O', 'action.open'], ['Ctrl+S', 'action.save'], ['Ctrl+Shift+S', 'action.saveAs'], ['Ctrl+Alt+S', 'action.saveAll'], ['Ctrl+W', 'action.closeTab'],
  ['Ctrl+P', 'action.print'], ['Ctrl+Z', 'action.undo'], ['Ctrl+Y', 'action.redo'], ['Ctrl+X', 'action.cut'], ['Ctrl+C', 'action.copy'], ['Ctrl+V', 'action.paste'],
  ['Ctrl+D', 'action.duplicate'], ['Delete', 'action.delete'], ['Ctrl+A', 'action.selectAll'], ['Esc', 'action.clearSelection'], ['Ctrl+F', 'action.find'], ['Ctrl+H', 'action.replace'],
  ['Ctrl+G', 'action.goToPage'], ['F2', 'canvas.editText'], ['shortcut.type', 'shortcut.typeText'], ['Ctrl+1', 'tool.pointer'], ['Ctrl+2', 'tool.text'], ['Ctrl+3', 'tool.connector'],
  ['Ctrl+4', 'tool.pencil'], ['Ctrl+5', 'tool.polyline'], ['Ctrl+6', 'tool.line'], ['Ctrl+8', 'tool.rect'], ['Ctrl+9', 'tool.ellipse'], ['Ctrl+B / I / U', 'action.bold'],
  ['Ctrl+Shift+> / <', 'action.fontUp'], ['Ctrl+Shift+G / U', 'action.group'], ['Ctrl+Shift+F / K', 'action.bringFront'], ['Ctrl+R / L', 'action.rotateRight'], ['Ctrl+J / M', 'action.flipH'],
  ['Ctrl+Shift+C', 'action.formatPainter'], ['Ctrl+Shift+D', 'action.shapeData'], ['Ctrl+K', 'action.insertHyperlink'], ['shortcut.arrows', 'shortcut.nudge'], ['shortcut.shiftDrag', 'shortcut.constrain'],
  ['shortcut.ctrlDrag', 'shortcut.copyDrag'], ['shortcut.altDrag', 'shortcut.noSnap'], ['Ctrl+= / Ctrl+-', 'action.zoomIn'], ['Ctrl+0', 'action.zoomReset'], ['Ctrl+Shift+W', 'action.fitPage'],
  ['shortcut.wheel', 'action.zoomIn'], ['shortcut.space', 'shortcut.pan'], ['Ctrl+PageUp / PageDown', 'action.pageNext'], ['Shift+F11', 'action.pageNew'], ['F5', 'action.presentation'],
  ['Ctrl+Tab', 'tabs.next'], ['Ctrl+Shift+L', 'action.language'], ['Ctrl+Shift+B', 'action.shuffleBackground'], ['Ctrl+Shift+H', 'action.startPage'], ['Ctrl+,', 'action.settings'],
  ['F11', 'action.tutorial'], ['F1', 'action.about'],
];

function settingsShortcuts() {
  const [list, pager] = paged('shortcuts', SHORTCUT_LIST, 36);
  return `<div class="shortcut-grid">${list.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>${pager ? `<div class="row">${pager}</div>` : ''}`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyDiagram', version: VERSION, error: native.errorText(error) }));
  const info = state.info;
  const date = info.buildDate ? new Date(info.buildDate).toLocaleString() : '-';
  const build = [
    ['info', t('about.version'), `${info.version}`],
    ['clock', t('about.buildDate'), date],
    ['hyperlink', t('about.commit'), info.commit ?? '-'],
    ['layers', t('about.target'), info.target ?? '-'],
    ['gear', t('about.profile'), info.profile ?? '-'],
    ['calculate', t('about.runtime'), info.web ? t('about.webBuild') : `Tauri ${info.tauri} · ${info.rustc ?? ''}`],
    ['globe', t('about.platform'), `${info.os ?? '-'} / ${info.arch ?? '-'}`],
    ['user', t('about.author'), 'SHKWON(knix008@naver.com)'],
  ];
  const table = (title, glyph, rows) => `<h3 class="about-section">${icon(glyph)}<span>${escapeHtml(title)}</span></h3>
    <dl class="about-table">${rows.map(([rowGlyph, label, value]) => `<dt title="${escapeHtml(label)}">${icon(rowGlyph)}<span>${escapeHtml(label)}</span></dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('')}</dl>`;
  root.innerHTML = frame({
    glyph: 'info', title: t('about.title'),
    body: `<div class="about">
      <div class="about-top">
        <img class="about-icon" src="${appIcon}" alt="" />
        <div class="about-text">
          <div class="about-name">${escapeHtml(info.name)} <span class="about-version">v${escapeHtml(info.version)}</span></div>
          <div class="about-tagline">${escapeHtml(t('about.tagline'))}</div>
          <p class="about-description">${escapeHtml(t('about.description'))}</p>
        </div>
      </div>
      <div class="about-rows" id="about-rows">${table(t('about.buildInfo'), 'gear', build)}</div>
    </div>`,
    foot: `<span class="grow"></span>${button('copy-about', t('action.copy'), 'copy')}${button('close', t('common.done'), 'check', 'primary')}`,
  });
  fitHeight();
  ready();
}

// ───────────────────────── confirm, welcome

function renderConfirm() {
  const p = P();
  const items = p.items ?? [];
  const shownItems = items.slice(0, 6);
  root.innerHTML = frame({
    glyph: p.icon ?? 'question', title: p.title ?? t('confirm.title'),
    body: `<div class="confirm">
      <div class="confirm-message">${icon(p.icon ?? 'question', 'icon big')}<p>${escapeHtml(p.message ?? '')}</p></div>
      ${shownItems.length ? `<ul class="confirm-items">${shownItems.map((item) => `<li title="${escapeHtml(item)}">${icon('diagram')}<span>${escapeHtml(item || '—')}</span></li>`).join('')}${items.length > shownItems.length ? `<li>… +${items.length - shownItems.length}</li>` : ''}</ul>` : ''}
    </div>`,
    foot: `<span class="grow"></span>${(p.buttons ?? [{ id: 'ok', label: t('common.ok'), primary: true }]).map((b) => `<button class="button ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-action="choice" data-value="${escapeHtml(b.id)}" title="${escapeHtml(b.label)}">${b.icon ? icon(b.icon) : ''}<span>${escapeHtml(b.label)}</span></button>`).join('')}`,
  });
  fitHeight();
  root.querySelector('.button.primary')?.focus();
  ready();
}

function renderWelcome() {
  root.innerHTML = frame({
    glyph: 'tutorial', title: t('welcome.title'),
    body: `<div class="welcome">
      <div class="about-top"><img class="about-icon small" src="${appIcon}" alt="" /><div><div class="about-name">MyDiagram <span class="about-version">v${escapeHtml(VERSION)}</span></div><p class="about-description">${escapeHtml(t('welcome.text'))}</p></div></div>
      <ul class="welcome-list">
        <li>${icon('tutorial')}<span>${escapeHtml(t('welcome.point1'))}</span></li>
        <li>${icon('samples')}<span>${escapeHtml(t('welcome.point2'))}</span></li>
        <li>${icon('userGuide')}<span>${escapeHtml(t('welcome.point3'))}</span></li>
      </ul>
    </div>`,
    foot: `${button('choice', t('welcome.later'), 'close', '', 'later')}<span class="grow"></span>${button('choice', t('welcome.sample'), 'samples', '', 'sample')}${button('choice', t('welcome.start'), 'play', 'primary', 'tutorial')}`,
  });
  fitHeight();
  root.querySelector('.button.primary')?.focus();
  ready();
}

// ───────────────────────── error

function errorReport() {
  const p = P();
  return [
    `[${p.title ?? t('error.title')}]`,
    p.message ?? '',
    '',
    `${t('error.when')}: ${p.time ?? ''}`,
    p.context ? `${t('error.where')}: ${p.context}` : '',
    `App: ${p.app ?? ''}`,
    p.detail ? `\n${t('error.detail')}:\n${p.detail}` : '',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function renderError() {
  const p = P();
  root.innerHTML = frame({
    glyph: 'error', title: p.title ?? t('error.title'),
    body: `<div class="error-view">
      <div class="error-message">${icon('error', 'icon big danger-text')}<p id="error-message" title="${escapeHtml(p.message)}">${escapeHtml(p.message ?? '')}</p></div>
      ${row('clock', t('error.when'), `<span>${escapeHtml(p.time ?? '')}</span>`)}
      ${row('goTo', t('error.where'), `<span class="path" title="${escapeHtml(p.context || '-')}">${escapeHtml(p.context || '-')}</span>`)}
      ${row('info', 'App', `<span class="path">${escapeHtml(p.app ?? '')}</span>`)}
      <p class="muted hint">${escapeHtml(t('error.hint'))}</p>
      <textarea class="error-detail" id="error-detail" readonly spellcheck="false" aria-label="${escapeHtml(t('error.detail'))}">${escapeHtml(errorReport())}</textarea>
    </div>`,
    foot: `<span class="muted" id="copy-state">${state.copied ? `${icon('check')} ${escapeHtml(t('error.copied'))}` : ''}</span><span class="grow"></span>${button('copy-error', t('error.copy'), 'copy')}${button('close', t('common.close'), 'check', 'primary')}`,
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

const formatBytes = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`);

function renderProgress() {
  const p = P();
  const progress = state.progress ?? p.last ?? null;
  const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;
  const bytes = progress && progress.total > 1000;
  root.innerHTML = frame({
    glyph: 'hourglass', title: p.title ?? t('progress.wait'),
    body: `<div class="progress-view">
      <div class="row">${icon('file')}<span class="path" title="${escapeHtml(p.name ?? '')}">${escapeHtml(p.name ?? '')}</span></div>
      <div data-scrolls class="progress-bar ${percent == null ? 'indeterminate' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent ?? 0}"><i style="width:${percent ?? 30}%"></i></div>
      <div class="row muted"><span id="progress-text">${progress ? escapeHtml(bytes ? t('progress.bytes', { done: formatBytes(progress.done), total: formatBytes(progress.total) }) : t('progress.steps', { done: progress.done, total: progress.total })) : escapeHtml(t('progress.wait'))}</span><span class="grow"></span><b id="progress-percent">${percent == null ? '' : `${percent}%`}</b></div>
    </div>`,
  });
  ready();
}

// ───────────────────────── recent files and folders

function renderRecent() {
  const list = loadRecent(globalThis.localStorage);
  const dirs = loadRecentDirs(globalThis.localStorage);
  const tab = state.tab === 'folders' ? 'folders' : 'files';
  const items = tab === 'files' ? list : dirs;
  const [page, pager, startIndex] = paged(`recent-${tab}`, items, 10);
  root.innerHTML = frame({
    glyph: 'recent', title: t('recent.title'),
    tabs: tabsHtml([['files', 'recent', `${t('start.recent')} (${list.length})`], ['folders', 'recentFolder', `${t('start.recentFolders')} (${dirs.length})`]], tab),
    body: `<div class="recent-list">${recentRows(page, { folders: tab === 'folders', start: startIndex })}</div>`,
    foot: `<span class="muted">${escapeHtml(t('recent.count', { count: items.length, max: MAX_RECENT }))}</span>${pager}<span class="grow"></span>${button(tab === 'files' ? 'clear-recent' : 'clear-folders', tab === 'files' ? t('recent.clear') : t('recent.clearFolders'), 'clearHistory', 'danger', '', items.length ? '' : 'disabled')}${button('close', t('common.done'), 'check', 'primary')}`,
  });
  checkRecent();
  ready();
}

// ───────────────────────── menu

function renderMenu() {
  const p = P();
  // Created ahead of time (prewarm) or reopened without a menu: stay hidden.
  if (p.prewarm || !Array.isArray(p.items) || !shownOnce()) return;
  const items = p.items;
  setOsTitle(p.header?.title);
  // Items only: no name/icon header row (the name stays the window title and the accessible name).
  const header = '';
  root.innerHTML = `<div class="popup-menu" role="menu" aria-label="${escapeHtml(p.header?.title ?? '')}">${header}${items.map((item, index) => (item.separator
    ? '<div class="menu-sep" role="separator"></div>'
    : `<button class="menu-item ${item.danger ? 'danger' : ''} ${item.submenu ? 'has-sub' : ''}" role="menuitem" data-index="${index}" data-id="${escapeHtml(item.id)}" ${item.submenu ? 'aria-haspopup="menu"' : ''} ${item.disabled ? 'disabled aria-disabled="true"' : ''} title="${escapeHtml(item.label)}">
        <span class="menu-icon">${icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key">${escapeHtml(item.shortcut ?? '')}</span>
        <span class="menu-check">${item.submenu ? icon('chevronRight') : item.checked ? icon('check') : ''}</span>
      </button>`)).join('')}</div>`;
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
const loadedAt = Date.now();
function shownOnce() {
  const at = Number(P().at) || 0;
  return at >= loadedAt - 60_000;
}
async function chooseMenu(id) {
  if (!menuOpen) return;
  menuOpen = false;
  const item = id ? root.querySelector(`.menu-item[data-id="${CSS.escape(id)}"]`) : null;
  // A group: the host opens its items in a menu just right of this row (screen coordinates).
  if (item?.classList.contains('has-sub')) {
    const rect = item.getBoundingClientRect();
    const frame = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const x = window.screenX + frame.left + rect.right + 2;
    const y = window.screenY + frame.top + rect.top - 6;
    return hide({ id, at: { x, y, flipY: window.screenY + frame.top + rect.bottom + 6 } });
  }
  await hide({ id });
}

function moveMenuFocus(direction) {
  const items = [...root.querySelectorAll('.menu-item:not([disabled])')];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement);
  items[(current + direction + items.length) % items.length].focus();
}


// ───────────────────────── settings: drawing and defaults

function settingsDrawing() {
  return [
    toggle('showRulers', t('action.rulers'), 'rulers'),
    toggle('showGrid', t('action.grid'), 'grid'),
    row('grid', t('settings.gridSize'), segmented('gridSize', Object.keys(GRID_SIZES).map((g) => [g, t(`settings.grid.${g}`)]), s().gridSize)),
    toggle('showGuides', t('action.guides'), 'guides'),
    toggle('showPageBreaks', t('action.pageBreaks'), 'pageBreaks'),
    toggle('showConnectionPoints', t('action.connectionPoints'), 'connectionPoints'),
    toggle('showMinimap', t('action.minimap'), 'minimap'),
    toggle('snapToGrid', t('action.snapGrid'), 'snap'),
    toggle('smartGuides', t('action.smartGuides'), 'smartGuides'),
    toggle('autoConnect', t('action.autoConnectToggle'), 'connectorTool'),
    toggle('wheelZoom', t('settings.wheelZoom'), 'zoomIn'),
    row('stBasic', t('stencil.size'), segmented('stencilSize', STENCIL_SIZES.map((v) => [v, t(`stencil.size.${v}`)]), s().stencilSize), t('stencil.size'), 'full'),
  ].join('');
}

function settingsDefaults() {
  return [
    row('design', t('settings.defaultDesign'), select('data-select', 'defaultDesign', DESIGN_IDS.map((id) => [id, DESIGNS.find((d) => d.id === id)?.name[L()] ?? id]), s().defaultDesign, t('settings.defaultDesign'))),
    row('pageSetup', t('settings.defaultPaper'), select('data-select', 'defaultPaper', PAPER_IDS.map((p) => [p, p]), s().defaultPaper, t('settings.defaultPaper'))),
    row('rotateRight', t('page.orientation'), segmented('defaultOrientation', [['portrait', t('page.portrait')], ['landscape', t('page.landscape')]], s().defaultOrientation)),
    row('rulers', t('doc.units'), select('data-select', 'defaultUnits', UNIT_IDS.map((u) => [u, t(`unit.${u}`)]), s().defaultUnits, t('doc.units'))),
    row('routeOrtho', t('doc.route'), segmented('defaultRoute', ROUTE_IDS.map((r) => [r, t(`route.${r}`)]), s().defaultRoute)),
    row('eye', t('settings.defaultView'), select('data-select', 'defaultView', VIEWS.map((v) => [v, t(`view.${v}`)]), s().defaultView, t('settings.defaultView'))),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.defaultsHint'))}</span>`, t('settings.defaultsHint')),
  ].join('');
}

// ───────────────────────── print preview

let printMeasure = null;
function printDoc() {
  if (!state.printData) state.printData = normalizeDocument(P().doc ?? { pages: [] }, L());
  return state.printData;
}

function printSetup() {
  if (!state.print) state.print = { ...defaultPrintOptions(), ...(P().setup ?? {}), range: 'all' };
  return state.print;
}

function printLayout() {
  printMeasure ??= canvasMeasure();
  return renderPrintSheets(printDoc(), printSetup(), { measure: printMeasure, currentPageId: P().currentPageId, language: L(), t });
}

function renderPrint() {
  const options = printSetup();
  const p = P();
  const layout = printLayout();
  state.page = Math.max(0, Math.min(state.page, layout.pages.length - 1));
  const page = layout.pages[state.page];
  const sel = (key, values, label) => select('data-print', key, values, options[key], label);
  const check = (key, label, glyph) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-print-toggle="${key}" ${options[key] ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
  const custom = options.range === 'custom';
  const tab = ['range', 'page', 'header'].includes(state.tab) ? state.tab : 'range';
  const count = printDoc().pages.filter((pg) => !pg.background).length;
  root.innerHTML = frame({
    glyph: 'print', title: t('print.title'),
    tabs: tabsHtml([['range', 'list', t('print.tabRange')], ['page', 'pageSetup', t('print.tabPage')], ['header', 'notes', t('print.tabHeader')]], tab),
    body: `<div class="print-view">
      <div class="print-options">
        ${tab === 'page' ? [
          row('file', t('print.paper'), sel('paper', Object.keys(PAPERS).map((paper) => [paper, paper]), t('print.paper'))),
          row('pageSetup', t('print.orientation'), segmented('orientation', [['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], options.orientation, 'data-print-segment')),
          row('fitPage', t('print.margin'), sel('margin', Object.keys(MARGINS).map((margin) => [margin, t(`print.margin.${margin}`)]), t('print.margin'))),
          row('zoomIn', t('print.fit'), segmented('fit', FITS.map((f) => [f, t(`print.fit.${f}`)]), options.fit, 'data-print-segment')),
          row('zoomIn', t('print.scale'), numberField('print:scale', options.scale, 10, 400, 10, '%', t('print.scale')), t('print.scale'), options.fit === 'percent' ? '' : 'disabled-row'),
          check('center', t('print.center'), 'alignCenter'),
          check('background', t('print.background'), 'fillColor'),
        ].join('') : tab === 'header' ? [
          check('header', t('print.header'), 'notes'),
          row('edit', t('print.headerText'), `<input type="text" data-print-text="headerText" value="${escapeHtml(options.headerText)}" placeholder="${escapeHtml(p.title ?? '')}" title="${escapeHtml(t('print.headerText'))}" />`),
          check('footer', t('print.footer'), 'pageSetup'),
          row('edit', t('print.footerText'), `<input type="text" data-print-text="footerText" value="${escapeHtml(options.footerText)}" placeholder="MyDiagram" title="${escapeHtml(t('print.footerText'))}" />`),
        ].join('') : [
          ...RANGES.map((range) => `<label class="row radio-row" title="${escapeHtml(t(`print.range.${range}`))}"><input type="radio" name="range" data-print-range="${range}" ${options.range === range ? 'checked' : ''} /><span>${icon({ all: 'selectAll', current: 'eye', custom: 'filter' }[range])}${escapeHtml(t(`print.range.${range}`))}</span></label>`),
          row('list', t('print.pages'), `${numberField('print:from', Math.min(options.from, count), 1, Math.max(1, count), 1, '', t('print.from'))}<span>–</span>${numberField('print:to', Math.min(options.to, count), 1, Math.max(1, count), 1, '', t('print.to'))}`, t('print.pages'), custom ? '' : 'disabled-row'),
          row('info', t('print.summary'), `<span class="muted">${escapeHtml(t('print.summaryText', { pages: count, sheets: layout.count }))}</span>`),
        ].join('')}
      </div>
      <div class="print-preview" id="print-preview">
        ${page ? `<div class="preview-stage">${page.svg}</div>` : `<div class="preview-empty">${icon('info')}<span>${escapeHtml(t('print.empty'))}</span></div>`}
      </div>
    </div>
    <div class="print-sheet" aria-hidden="true">${layout.pages.map((item) => `<div class="print-page">${item.svg}</div>`).join('')}</div>`,
    foot: `<button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number">${escapeHtml(t('print.page', { n: state.page + 1, total: layout.count }))}</span>
      <button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= layout.count - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
      <span class="grow"></span>
      <button class="button primary" data-action="print" title="${escapeHtml(t('print.print'))}" ${layout.count ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(t('print.print'))}</span></button>
      ${button('close', t('common.close'), 'close')}`,
  });
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  style.textContent = `@page { size: ${layout.paper.width}mm ${layout.paper.height}mm; margin: 0; }`;
  fitPreview();
  ready();
}

function fitPreview() {
  const area = root.querySelector('#print-preview');
  const stage = area?.querySelector('.preview-stage');
  const svg = stage?.querySelector('svg');
  if (!svg) return;
  const box = area.getBoundingClientRect();
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  const scale = Math.min((box.width - 24) / w, (box.height - 24) / h);
  stage.style.transform = `scale(${scale})`;
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  stage.style.left = `${(box.width - w * scale) / 2}px`;
  stage.style.top = `${(box.height - h * scale) / 2}px`;
}

function changePrint(patch) {
  state.print = { ...printSetup(), ...patch };
  const { range, from, to, ...setup } = state.print;
  void range; void from; void to;
  try { globalThis.localStorage?.setItem(PRINT_KEY, JSON.stringify(setup)); } catch { /* ignore */ }
  render();
}

async function doPrint() {
  try {
    if (window.__mydiagramPrintHook) window.__mydiagramPrintHook(printLayout());
    else await native.printWindow();
    action('printed');
  } catch (error) {
    action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
  }
}

// ───────────────────────── export as image

function renderImage() {
  const p = P();
  const areas = p.areas ?? ['content', 'page'];
  if (!state.draft) state.draft = { format: 'png', transparent: true, area: 'content', scale: 2, quality: 92, ...(p.last ?? {}) };
  const d = state.draft;
  if (!areas.includes(d.area)) d.area = 'content';
  const format = imageFormat(d.format);
  const transparent = format.alpha && d.transparent;
  const drawing = p.sizes?.[d.area] ?? { width: 0, height: 0 };
  const size = format.encoder === 'svg' ? { width: Math.round(drawing.width), height: Math.round(drawing.height) } : rasterSize(drawing.width, drawing.height, Number(d.scale));
  const hint = !format.alpha ? t('image.noAlpha', { format: format.label }) : format.encoder === 'svg' ? t('image.vectorHint') : t('image.alphaHint');
  root.innerHTML = frame({
    glyph: 'exportImage', title: t('image.title'),
    body: `<div class="editor">
      ${row('imageFormat', t('image.format'), segmented('format', IMAGE_FORMATS.map((f) => [f.id, f.label]), d.format, 'data-draft-segment'))}
      ${row('palette', t('image.background'), segmented('transparent', [['true', t('image.transparent'), 'transparentBg'], ['false', t('image.white'), 'whiteBg']], String(transparent), 'data-draft-segment'), t('image.background'), format.alpha ? '' : 'disabled-row')}
      ${row('viewDrawing', t('image.area'), segmented('area', areas.map((a) => [a, t(`image.area.${a}`)]), d.area, 'data-draft-segment'))}
      ${row('zoomIn', t('image.scale'), segmented('scale', IMAGE_SCALES.map((n) => [String(n), `${n}×`]), String(d.scale), 'data-draft-segment'), t('image.scale'), format.encoder === 'svg' ? 'disabled-row' : '')}
      ${row('quality', t('image.quality'), numberField('draft:quality', d.quality, 40, 100, 4, '%', t('image.quality')), t('image.quality'), format.quality ? '' : 'disabled-row')}
      ${row('ruler', t('image.size'), `<span class="image-size" data-image-size>${size.width} × ${size.height} px</span>`)}
      ${row('info', '', `<span class="muted">${escapeHtml(hint)}</span>`)}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('image-apply', t('image.export'), 'exportImage', 'primary')}`,
  });
  ready();
}

// ───────────────────────── format shape

const colorInput = (key, value, label) => `<span class="color-input"><input type="color" data-draft-color-input="${key}" value="${escapeHtml(/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#ffffff')}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" /><code>${escapeHtml(value === 'none' || !value ? t('color.none') : value)}</code></span>`;
const swatches = (key) => `<span class="swatch-row">${[...(P().colors ?? []), '#000000', '#7f7f7f', '#ffffff', '#c00000', '#ffc000', '#00b050', '#0070c0', '#7030a0'].map((c) => `<button class="swatch" data-draft-swatch="${key}" data-value="${c}" style="--swatch:${c}" title="${c}"></button>`).join('')}</span>`;
const draftToggle = (key, label, glyph, checked) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-draft-toggle="${key}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
const draftSelect = (key, options, current, label) => select('data-draft-select', key, options, current, label);
const draftNumber = (key, value, min, max, step, unit, label) => numberField(`draft:${key}`, value, min, max, step, unit, label);

function renderShapeFormat() {
  const p = P();
  if (!state.draft) {
    state.draft = { ...(p.style ?? {}), box: p.shape ? { ...p.shape } : null, locked: { ...(p.shape?.locked ?? {}) }, touched: new Set() };
    if (state.draft.box) for (const key of ['x', 'y', 'w', 'h']) state.draft.box[`${key}Text`] = formatLength(state.draft.box[key], p.units);
  }
  const d = state.draft;
  const tabs = p.connector ? [['line', 'lineColor', t('format.line')], ['arrows', 'arrowEnd', t('format.arrows')], ['text', 'textTool', t('format.text')]]
    : [['fill', 'fillColor', t('format.fill')], ['line', 'lineColor', t('format.line')], ['text', 'textTool', t('format.text')], ['effects', 'shadow', t('format.effects')], ['size', 'position', t('format.size')], ['protect', 'lock', t('format.protect')]];
  const tab = tabs.some(([id]) => id === state.tab) ? state.tab : tabs[0][0];
  let body = '';
  if (tab === 'fill') {
    body = [
      draftToggle('noFill', t('format.noFill'), 'close', d.fill === 'none' || d.fillPattern === 'none'),
      row('fillColor', t('props.fillColor'), `${colorInput('fill', d.fill, t('props.fillColor'))}${swatches('fill')}`),
      row('quickStyle', t('props.fillPattern'), draftSelect('fillPattern', FILL_PATTERNS.filter((x) => x !== 'none').map((x) => [x, t(`pattern.${x}`)]), d.fillPattern === 'none' ? 'solid' : d.fillPattern ?? 'solid', t('props.fillPattern'))),
      row('fillColor', t('props.fill2'), colorInput('fill2', d.fill2, t('props.fill2')), t('props.fill2'), ['linear', 'radial', 'hatch', 'cross', 'dots'].includes(d.fillPattern) ? '' : 'disabled-row'),
      row('rotateRight', t('format.gradientAngle'), draftNumber('gradientAngle', d.gradientAngle ?? 90, 0, 360, 15, '°', t('format.gradientAngle')), t('format.gradientAngle'), d.fillPattern === 'linear' ? '' : 'disabled-row'),
      row('opacity', t('props.fillOpacity'), draftNumber('fillOpacity', d.fillOpacity ?? 100, 0, 100, 5, '%', t('props.fillOpacity'))),
    ].join('');
  } else if (tab === 'line') {
    body = [
      draftToggle('noLine', t('format.noLine'), 'close', d.line === 'none'),
      row('lineColor', t('props.lineColor'), `${colorInput('line', d.line, t('props.lineColor'))}${swatches('line')}`),
      row('lineWeight', t('props.lineWidth'), draftNumber('lineWidth', d.lineWidth ?? 1, 0, 30, 0.25, ' px', t('props.lineWidth'))),
      row('linePattern', t('props.dash'), draftSelect('dash', DASHES.map((x) => [x, t(`dash.${x}`)]), d.dash ?? 'solid', t('props.dash'))),
      p.connector ? '' : row('rounding', t('props.rounding'), draftNumber('rounding', d.rounding ?? 0, 0, 100, 1, ' px', t('props.rounding'))),
      row('opacity', t('format.lineOpacity'), draftNumber('lineOpacity', d.lineOpacity ?? 100, 0, 100, 5, '%', t('format.lineOpacity'))),
    ].join('');
  } else if (tab === 'arrows') {
    body = [
      row('arrowStart', t('props.startArrow'), draftSelect('startArrow', ARROWS.map((a) => [a, t(`arrow.${a}`)]), d.startArrow ?? 'none', t('props.startArrow'))),
      row('arrowEnd', t('props.endArrow'), draftSelect('endArrow', ARROWS.map((a) => [a, t(`arrow.${a}`)]), d.endArrow ?? 'arrow', t('props.endArrow'))),
      row('zoomIn', t('props.arrowSize'), draftNumber('arrowSize', d.arrowSize ?? 1, 0.4, 3, 0.1, '×', t('props.arrowSize'))),
    ].join('');
  } else if (tab === 'text') {
    body = [
      row('font', t('props.font'), draftSelect('font', FONTS.map((f) => [f, f || t('props.fontDefault')]).concat(FONTS.includes(d.font ?? '') ? [] : [[d.font, d.font]]), d.font ?? '', t('props.font'))),
      row('fontUp', t('props.fontSize'), draftNumber('fontSize', d.fontSize ?? 13, 4, 200, 1, ' px', t('props.fontSize'))),
      row('textColor', t('props.textColor'), `${colorInput('textColor', d.textColor, t('props.textColor'))}${swatches('textColor')}`),
      row('bold', t('format.style'), ['bold', 'italic', 'underline', 'strike'].map((k) => `<label class="check-row inline"><input type="checkbox" data-draft-toggle="${k}" ${d[k] ? 'checked' : ''} /><span>${icon(k)}${escapeHtml(t(`action.${k}`))}</span></label>`).join('')),
      row('textAlignCenter', t('format.align'), segmented('align', ['left', 'center', 'right'].map((a) => [a, t(`align.${a}`)]), d.align ?? 'center', 'data-draft-segment')),
      p.connector ? '' : row('valignMiddle', t('format.valign'), segmented('valign', ['top', 'middle', 'bottom'].map((a) => [a, t(`valign.${a}`)]), d.valign ?? 'middle', 'data-draft-segment')),
      row('rotateRight', t('props.textAngle'), segmented('textAngle', [0, 90, 180, 270].map((a) => [String(a), `${a}°`]), String(d.textAngle ?? 0), 'data-draft-segment')),
      row('list', t('format.lineSpacing'), draftNumber('lineSpacing', d.lineSpacing ?? 1.2, 0.8, 3, 0.1, '×', t('format.lineSpacing'))),
      row('fitWidth', t('format.margin'), draftNumber('margin', d.margin ?? 4, 0, 60, 1, ' px', t('format.margin'))),
    ].join('');
  } else if (tab === 'effects') {
    body = [draftToggle('shadow', t('action.shadow'), 'shadow', d.shadow), row('opacity', t('props.opacity'), draftNumber('opacity', d.opacity ?? 100, 10, 100, 5, '%', t('props.opacity')))].join('');
  } else if (tab === 'size' && d.box) {
    const b = d.box;
    body = [
      row('position', 'X', `<input type="text" data-box="x" value="${escapeHtml(b.xText)}" aria-label="X" />`),
      row('position', 'Y', `<input type="text" data-box="y" value="${escapeHtml(b.yText)}" aria-label="Y" />`),
      row('sameSize', t('field.width'), `<input type="text" data-box="w" value="${escapeHtml(b.wText)}" aria-label="${escapeHtml(t('field.width'))}" />`),
      row('sameSize', t('field.height'), `<input type="text" data-box="h" value="${escapeHtml(b.hText)}" aria-label="${escapeHtml(t('field.height'))}" />`),
      row('rotateRight', t('field.angle'), numberField('box:angle', Math.round((b.angle ?? 0) * 10) / 10, 0, 359, 1, '°', t('field.angle'))),
      draftToggle('box:flipH', t('action.flipH'), 'flipH', b.flipH),
      draftToggle('box:flipV', t('action.flipV'), 'flipV', b.flipV),
      `<p id="format-error" class="danger-text"></p>`,
    ].join('');
  } else if (tab === 'protect') {
    body = ['move', 'size', 'rotate', 'delete', 'text', 'aspect'].map((k) => draftToggle(`lock:${k}`, t(`lock.${k}`), 'lock', d.locked[k])).join('');
  }
  root.innerHTML = frame({
    glyph: 'formatShape', title: p.count > 1 ? t('format.titleMulti', { count: p.count }) : t('format.title'),
    tabs: tabsHtml(tabs, tab),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="muted">${escapeHtml(t('format.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('format-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

function applyFormat() {
  const d = state.draft;
  const style = {};
  for (const key of d.touched) if (!key.startsWith('box') && !key.startsWith('lock') && !['noFill', 'noLine'].includes(key)) style[key] = d[key];
  if (d.touched.has('noFill')) { if (d.noFill) { style.fill = 'none'; style.fillPattern = 'none'; } else { style.fillPattern = d.fillPattern && d.fillPattern !== 'none' ? d.fillPattern : 'solid'; if (d.fill === 'none') style.fill = '#ffffff'; } }
  if (d.touched.has('noLine')) style.line = d.noLine ? 'none' : (d.line && d.line !== 'none' ? d.line : '#000000');
  const out = { action: 'apply', style };
  if (d.box && [...d.touched].some((k) => k.startsWith('box'))) {
    const units = P().units;
    const box = { ...d.box };
    for (const key of ['x', 'y', 'w', 'h']) {
      const px = parseLength(box[`${key}Text`], units);
      if (px == null) { const el = root.querySelector('#format-error'); if (el) el.textContent = t('field.badNumber'); else { state.tab = 'size'; render(); } return undefined; }
      box[key] = key === 'w' || key === 'h' ? Math.max(1, px) : px;
    }
    out.box = box;
  }
  if ([...d.touched].some((k) => k.startsWith('lock'))) out.locked = Object.fromEntries(Object.entries(d.locked).filter(([, v]) => v));
  return close(out);
}

// ───────────────────────── shape data

function renderData() {
  const p = P();
  if (!state.draft) state.draft = { fields: (p.fields ?? []).map((f) => ({ ...f, optionsText: (f.options ?? []).join('; ') })), applyValues: false };
  const d = state.draft;
  const [page, pager, startIndex] = paged('data', d.fields, 8);
  root.innerHTML = frame({
    glyph: 'shapeData', title: p.count > 1 ? t('data.titleMulti', { count: p.count }) : t('data.title', { name: p.name || '' }),
    body: `<div class="data-editor">
      <div class="row col-row data-head"><span>${escapeHtml(t('data.label'))}</span><span>${escapeHtml(t('data.type'))}</span><span>${escapeHtml(t('data.value'))}</span><span>${escapeHtml(t('data.options'))}</span><span></span></div>
      ${page.length ? page.map((f, i) => {
        const index = startIndex + i;
        return `<div class="row col-row data-row">
          <input type="text" data-field-edit="label:${index}" value="${escapeHtml(f.label)}" placeholder="${escapeHtml(t('data.label'))}" aria-label="${escapeHtml(t('data.label'))}" />
          <select data-field-edit="type:${index}" aria-label="${escapeHtml(t('data.type'))}">${DATA_TYPES.map((type) => `<option value="${type}" ${f.type === type ? 'selected' : ''}>${escapeHtml(t(`dataType.${type}`))}</option>`).join('')}</select>
          ${f.type === 'bool' ? `<select data-field-edit="value:${index}" aria-label="${escapeHtml(t('data.value'))}"><option value="true" ${['true', '1', 'yes'].includes(String(f.value).toLowerCase()) ? 'selected' : ''}>${escapeHtml(t('common.yes'))}</option><option value="false" ${['true', '1', 'yes'].includes(String(f.value).toLowerCase()) ? '' : 'selected'}>${escapeHtml(t('common.no'))}</option></select>`
            : f.type === 'list' && f.optionsText ? `<select data-field-edit="value:${index}" aria-label="${escapeHtml(t('data.value'))}">${f.optionsText.split(';').map((o) => o.trim()).filter(Boolean).map((o) => `<option ${o === f.value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`
              : `<input type="${f.type === 'date' ? 'date' : 'text'}" data-field-edit="value:${index}" value="${escapeHtml(f.value)}" placeholder="${escapeHtml(t('data.value'))}" aria-label="${escapeHtml(t('data.value'))}" />`}
          <input type="text" data-field-edit="optionsText:${index}" value="${escapeHtml(f.optionsText)}" placeholder="${escapeHtml(t('data.optionsHint'))}" aria-label="${escapeHtml(t('data.options'))}" ${f.type === 'list' ? '' : 'disabled'} />
          <button class="icon-button" data-action="field-remove" data-value="${index}" title="${escapeHtml(t('data.remove'))}" aria-label="${escapeHtml(t('data.remove'))}">${icon('trash')}</button>
        </div>`;
      }).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('data.empty'))}</span></div>`}
      <div class="row">${button('field-add', t('data.add'), 'plus', 'small')}<span class="grow"></span>${pager}</div>
      ${p.count > 1 ? toggle('applyValues', t('data.applyValues'), 'copy', d.applyValues, 'data-draft-toggle') : ''}
    </div>`,
    foot: `<span class="muted">${escapeHtml(t('data.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('data-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── page setup

function renderPageSetup() {
  const p = P();
  if (!state.draft) {
    const page = p.page ?? {};
    state.draft = { ...page, units: p.units, options: { ...(p.options ?? {}) }, widthText: formatLength(page.width, p.units), heightText: formatLength(page.height, p.units) };
  }
  const d = state.draft;
  const tab = ['size', 'page', 'layout'].includes(state.tab) ? state.tab : 'size';
  let body;
  if (tab === 'size') {
    body = [
      row('pageSetup', t('page.paper'), draftSelect('paper', [...Object.keys(PAGE_SIZES).map((x) => [x, x]), ['custom', t('page.custom')]], d.paper ?? 'custom', t('page.paper'))),
      row('rotateRight', t('page.orientation'), segmented('orientation', [['portrait', t('page.portrait')], ['landscape', t('page.landscape')]], d.orientation, 'data-draft-segment')),
      row('sameSize', t('field.width'), `<input type="text" data-draft="widthText" value="${escapeHtml(d.widthText)}" aria-label="${escapeHtml(t('field.width'))}" />`),
      row('sameSize', t('field.height'), `<input type="text" data-draft="heightText" value="${escapeHtml(d.heightText)}" aria-label="${escapeHtml(t('field.height'))}" />`),
      draftToggle('autoSize', t('action.autoSize'), 'autoSize', d.autoSize),
      row('info', '', `<span class="muted">${escapeHtml(t('page.autoSizeHint'))}</span>`),
      `<p id="page-error" class="danger-text"></p>`,
    ].join('');
  } else if (tab === 'page') {
    body = [
      row('edit', t('page.name'), `<input type="text" data-draft="name" value="${escapeHtml(d.name)}" aria-label="${escapeHtml(t('page.name'))}" />`),
      draftToggle('background', t('page.backgroundPage'), 'pageBg', d.background),
      row('pageBg', t('page.background'), draftSelect('backgroundId', [['', t('page.noBackground')], ...(p.backgrounds ?? []).map((b) => [b.id, b.name])], d.backgroundId ?? '', t('page.background')), t('page.background'), d.background ? 'disabled-row' : ''),
      row('fillColor', t('page.color'), `${colorInput('color', d.color || p.designPage, t('page.color'))}${button('page-color-reset', t('page.colorReset'), 'refresh', 'small')}`),
      draftToggle('grid', t('page.showGrid'), 'grid', d.grid !== false),
      row('grid', t('page.gridSize'), draftNumber('gridSize', d.gridSize ?? 0, 0, 200, 5, ' px', t('page.gridSize'))),
      row('info', '', `<span class="muted">${escapeHtml(t('page.gridHint'))}</span>`),
    ].join('');
  } else {
    const o = d.options;
    body = [
      row('routeOrtho', t('doc.route'), segmented('option:connectorRoute', ROUTE_IDS.map((r) => [r, t(`route.${r}`)]), o.connectorRoute ?? 'orthogonal', 'data-draft-segment')),
      draftToggle('option:lineJumps', t('action.lineJumps'), 'lineJumps', o.lineJumps !== false),
      row('lineJumps', t('page.jumpSize'), draftNumber('option:jumpSize', o.jumpSize ?? 1, 0.5, 3, 0.25, '×', t('page.jumpSize'))),
      draftToggle('option:avoidShapes', t('action.avoidShapes'), 'avoidShapes', o.avoidShapes !== false),
      draftToggle('option:glue', t('action.glue'), 'glue', o.glue !== false),
      draftToggle('option:snapGrid', t('page.snapGrid'), 'snap', o.snapGrid !== false),
      draftToggle('option:snapShapes', t('page.snapShapes'), 'smartGuides', o.snapShapes !== false),
      draftToggle('option:dataGraphics', t('action.dataGraphics'), 'dataGraphics', Boolean(o.dataGraphics)),
      row('rulers', t('doc.units'), draftSelect('units', UNIT_IDS.map((u) => [u, t(`unit.${u}`)]), d.units, t('doc.units'))),
    ].join('');
  }
  root.innerHTML = frame({
    glyph: 'pageSetup', title: t('page.setupTitle'),
    tabs: tabsHtml([['size', 'pageSetup', t('page.tabSize')], ['page', 'pageBg', t('page.tabPage')], ['layout', 'routeOrtho', t('page.tabLayout')]], tab),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('page-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

function applyPageSetup() {
  const d = state.draft;
  const w = parseLength(d.widthText, d.units);
  const h = parseLength(d.heightText, d.units);
  if (w == null || h == null || w < 20 || h < 20) { state.tab = 'size'; render(); root.querySelector('#page-error').textContent = t('field.badNumber'); return undefined; }
  return close({
    action: 'apply', units: d.units, options: d.options,
    page: { name: String(d.name || '').trim() || P().page.name, paper: d.paper, orientation: d.orientation, width: w, height: h, autoSize: Boolean(d.autoSize), background: Boolean(d.background), backgroundId: d.background ? null : d.backgroundId || null, color: d.color || '', grid: d.grid !== false, gridSize: Number(d.gridSize) || 0 },
  });
}

// ───────────────────────── layers

function renderLayers() {
  const p = P();
  if (!state.draft) state.draft = { layers: (p.layers ?? []).map((l) => ({ ...l })), activeLayer: p.activeLayer ?? null, deleteShapes: [], assign: null, assignLayer: p.layers?.[0]?.id ?? '', assignMode: 'only' };
  const d = state.draft;
  const [page, pager] = paged('layers', d.layers, 8);
  root.innerHTML = frame({
    glyph: 'layerProps', title: t('layer.title'),
    body: `<div class="layers-editor">
      <div class="row col-row layer-head"><span>${escapeHtml(t('layer.active'))}</span><span>${escapeHtml(t('layer.name'))}</span><span>${escapeHtml(t('layer.visible'))}</span><span>${escapeHtml(t('layer.print'))}</span><span>${escapeHtml(t('layer.locked'))}</span><span>${escapeHtml(t('layer.color'))}</span><span>${escapeHtml(t('layer.count'))}</span><span></span></div>
      ${page.length ? page.map((l) => `<div class="row col-row layer-edit-row">
        <input type="radio" name="active" data-layer-active="${l.id}" ${d.activeLayer === l.id ? 'checked' : ''} aria-label="${escapeHtml(t('layer.active'))}" />
        <input type="text" data-layer-name="${l.id}" value="${escapeHtml(l.name)}" aria-label="${escapeHtml(t('layer.name'))}" />
        <input type="checkbox" data-layer-flag="visible:${l.id}" ${l.visible ? 'checked' : ''} aria-label="${escapeHtml(t('layer.visible'))}" />
        <input type="checkbox" data-layer-flag="print:${l.id}" ${l.print ? 'checked' : ''} aria-label="${escapeHtml(t('layer.print'))}" />
        <input type="checkbox" data-layer-flag="locked:${l.id}" ${l.locked ? 'checked' : ''} aria-label="${escapeHtml(t('layer.locked'))}" />
        <span class="color-input"><input type="color" data-layer-color="${l.id}" value="${escapeHtml(l.color || '#000000')}" aria-label="${escapeHtml(t('layer.color'))}" />${l.color ? `<button class="icon-button" data-action="layer-color-clear" data-value="${l.id}" title="${escapeHtml(t('layer.colorClear'))}" aria-label="${escapeHtml(t('layer.colorClear'))}">${icon('close')}</button>` : ''}</span>
        <span class="muted">${p.counts?.[l.id] ?? 0}</span>
        <button class="icon-button" data-action="layer-remove" data-value="${l.id}" title="${escapeHtml(t('layer.remove'))}" aria-label="${escapeHtml(t('layer.remove'))}">${icon('trash')}</button>
      </div>`).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('layer.empty'))}</span></div>`}
      <div class="row">${button('layer-add', t('layer.add'), 'plus', 'small')}<label class="check-row inline"><input type="radio" name="active" data-layer-active="" ${d.activeLayer ? '' : 'checked'} /><span>${escapeHtml(t('layer.noActive'))}</span></label><span class="grow"></span>${pager}</div>
      ${p.selected ? `<div class="row assign-row">${icon('selectAll')}<span>${escapeHtml(t('layer.assign', { count: p.selected }))}</span>${select('data-draft-select', 'assignLayer', d.layers.map((l) => [l.id, l.name]), d.assignLayer, t('layer.name'))}${segmented('assignMode', [['only', t('layer.only')], ['add', t('layer.addTo')], ['remove', t('layer.removeFrom')]], d.assignMode, 'data-draft-segment')}${button('layer-assign', d.assign ? t('layer.assigned') : t('layer.assignDo'), d.assign ? 'check' : 'layerProps', 'small')}</div>` : ''}
    </div>`,
    foot: `<span class="muted">${escapeHtml(t('layer.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('layers-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── find / replace / go to page

function renderFind() {
  const p = P();
  if (!state.draft) state.draft = { mode: p.mode ?? 'find', text: p.text ?? '', replacement: '', matchCase: false, whole: false, data: true, scope: 'all', message: '', pageId: p.pages?.[0]?.id ?? '' };
  const d = state.draft;
  const tab = d.mode;
  let body;
  if (tab === 'page') {
    body = row('pageSetup', t('find.page'), select('data-draft-select', 'pageId', (p.pages ?? []).map((pg) => [pg.id, pg.name]), d.pageId, t('find.page')));
  } else {
    body = [
      row('search', t('find.what'), `<input type="text" data-draft="text" value="${escapeHtml(d.text)}" aria-label="${escapeHtml(t('find.what'))}" autofocus />`),
      tab === 'replace' ? row('replace', t('find.with'), `<input type="text" data-draft="replacement" value="${escapeHtml(d.replacement)}" aria-label="${escapeHtml(t('find.with'))}" />`) : '',
      row('filter', t('find.options'), ['matchCase', 'whole', 'data'].map((k) => `<label class="check-row inline"><input type="checkbox" data-draft-toggle="${k}" ${d[k] ? 'checked' : ''} /><span>${escapeHtml(t(`find.${k}`))}</span></label>`).join('')),
      row('viewPages', t('find.scope'), segmented('scope', [['page', t('find.scopePage')], ['all', t('find.scopeAll')]], d.scope, 'data-draft-segment')),
      `<div class="row"><span class="muted" id="find-message">${escapeHtml(d.message)}</span></div>`,
    ].join('');
  }
  const foot = tab === 'page' ? `<span class="grow"></span>${button('close', t('common.close'), 'close')}${button('go', t('find.go'), 'goTo', 'primary')}`
    : `<span class="grow"></span>${button('close', t('common.close'), 'close')}${tab === 'replace' ? `${button('replace-one', t('find.replaceOne'), 'replace')}${button('replace-all', t('find.replaceAll'), 'replace')}` : ''}${button('find-prev', t('find.prev'), 'chevronLeft')}${button('find-next', t('find.next'), 'chevronRight', 'primary')}`;
  root.innerHTML = frame({
    glyph: tab === 'replace' ? 'replace' : tab === 'page' ? 'goTo' : 'search', title: t(`find.title.${tab}`),
    tabs: tabsHtml([['find', 'search', t('find.tab.find')], ['replace', 'replace', t('find.tab.replace')], ['page', 'goTo', t('find.tab.page')]], tab, 'find-mode'),
    body: `<div class="editor">${body}</div>`, foot,
  });
  root.querySelector('[data-draft="text"]')?.focus();
  ready();
}

// ───────────────────────── document properties

function renderDocument() {
  const p = P();
  if (!state.draft) state.draft = { props: { ...(p.props ?? {}) } };
  const d = state.draft;
  const tab = state.tab === 'stats' ? 'stats' : 'summary';
  const field = (key, glyph) => row(glyph, t(`doc.${key}`), `<input type="text" data-doc-prop="${key}" value="${escapeHtml(d.props[key] ?? '')}" aria-label="${escapeHtml(t(`doc.${key}`))}" />`);
  const st = p.stats ?? {};
  const body = tab === 'summary' ? [field('title', 'edit'), field('subject', 'notes'), field('author', 'user'), field('manager', 'user'), field('company', 'server'), field('category', 'tag'), field('keywords', 'search'),
    row('notes', t('doc.description'), `<textarea data-doc-prop="description" rows="3" aria-label="${escapeHtml(t('doc.description'))}">${escapeHtml(d.props.description ?? '')}</textarea>`, t('doc.description'), 'tall')].join('')
    : [['viewPages', 'report.pages', st.pages], ['stBasic', 'report.shapes', st.shapes], ['connectorTool', 'report.connectors', st.connectors], ['groupShapes', 'report.groups', st.groups], ['textTool', 'report.withText', st.texts], ['shapeData', 'report.withData', st.data], ['comment', 'report.comments', st.comments], ['stencilMore', 'report.masters', st.byMaster],
      ['clock', 'doc.created', p.created ? new Date(p.created).toLocaleString(L() === 'en' ? 'en-US' : 'ko-KR') : '-'], ['folder', 'doc.path', p.path || t('doc.notSaved')]].map(([g, k, v]) => row(g, t(k), `<span class="path" title="${escapeHtml(String(v ?? ''))}">${escapeHtml(String(v ?? 0))}</span>`)).join('');
  root.innerHTML = frame({
    glyph: 'docProps', title: t('doc.titleDialog'),
    tabs: tabsHtml([['summary', 'docProps', t('doc.tabSummary')], ['stats', 'viewReports', t('doc.tabStats')]], tab),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('document-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── re-layout page

const LAYOUT_ICONS = { flowTB: 'stFlowchart', flowLR: 'routeOrtho', treeTB: 'tplOrg', treeLR: 'layout', radial: 'stMind', circular: 'reportConnections', grid: 'grid' };

function renderLayout() {
  const p = P();
  if (!state.draft) state.draft = { kind: 'flowTB', spacing: 50, scope: p.selected > 1 ? 'selection' : 'page', route: '', ...(p.last ?? {}) };
  const d = state.draft;
  root.innerHTML = frame({
    glyph: 'layout', title: t('layout.title'),
    body: `<div class="editor">
      <div class="layout-grid">${LAYOUTS.map((kind2) => `<button class="layout-card ${d.kind === kind2 ? 'active' : ''}" data-draft-segment="kind" data-value="${kind2}" title="${escapeHtml(t(`layout.${kind2}`))}">${icon(LAYOUT_ICONS[kind2])}<b>${escapeHtml(t(`layout.${kind2}`))}</b><small>${escapeHtml(t(`layout.${kind2}.hint`))}</small></button>`).join('')}</div>
      ${row('distributeH', t('layout.spacing'), numberField('draft:spacing', d.spacing, 10, 300, 10, ' px', t('layout.spacing')))}
      ${row('selectAll', t('layout.scope'), segmented('scope', [['page', t('layout.scopePage')], ['selection', t('layout.scopeSelection')]], d.scope, 'data-draft-segment'), t('layout.scope'), p.selected > 1 ? '' : 'disabled-row')}
      ${row('routeOrtho', t('layout.route'), select('data-draft-select', 'route', [['', t('layout.keepRoute')], ...ROUTE_IDS.map((r) => [r, t(`route.${r}`)])], d.route, t('layout.route')))}
    </div>`,
    foot: `<span class="muted">${escapeHtml(t('layout.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('layout-apply', t('layout.apply'), 'layout', 'primary')}`,
  });
  ready();
}

// ───────────────────────── hyperlink

function renderHyperlink() {
  const p = P();
  if (!state.draft) {
    const address = p.address ?? '';
    const page = address.startsWith('page:') ? address.slice(5) : '';
    state.draft = { type: page ? 'page' : 'url', address: page ? '' : address, pageId: (p.pages ?? []).find((pg) => pg.id === page || pg.name === page)?.id ?? p.pages?.[0]?.id ?? '' };
  }
  const d = state.draft;
  root.innerHTML = frame({
    glyph: 'hyperlink', title: t('link.title'),
    body: `<div class="editor">
      ${row('hyperlink', t('link.type'), segmented('type', [['url', t('link.url')], ['page', t('link.page')]], d.type, 'data-draft-segment'))}
      ${d.type === 'url' ? row('globe', t('link.address'), `<input type="text" data-draft="address" value="${escapeHtml(d.address)}" placeholder="https://…" aria-label="${escapeHtml(t('link.address'))}" />`) : row('pageSetup', t('link.page'), select('data-draft-select', 'pageId', (p.pages ?? []).map((pg) => [pg.id, pg.name]), d.pageId, t('link.page')))}
      ${row('info', '', `<span class="muted">${escapeHtml(t('link.hint'))}</span>`)}
    </div>`,
    foot: `${button('link-remove', t('link.remove'), 'trash', 'danger')}<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('link-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── design (themes, variants, quick styles)

function renderDesign() {
  const p = P();
  const tab = state.tab === 'quick' ? 'quick' : 'themes';
  let body;
  if (tab === 'themes') {
    body = `<div class="design-grid">${DESIGNS.map((dsg) => `<div class="design-card ${p.design === dsg.id ? 'active' : ''}" title="${escapeHtml(dsg.name[L()])}">
      <button class="design-main" data-pick-design="${dsg.id}:${p.design === dsg.id ? p.variant : 0}" style="background:${dsg.page}"><span class="design-sample">${dsg.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span><b style="color:${dsg.dark ? dsg.text : '#1f2937'}">${escapeHtml(dsg.name[L()])}</b></button>
      <span class="design-variants">${[0, 1, 2, 3].map((v) => `<button class="variant-chip ${p.design === dsg.id && p.variant === v ? 'active' : ''}" data-pick-design="${dsg.id}:${v}" title="${escapeHtml(t('props.variant', { n: v + 1 }))}">${variantColors(dsg.id, v).slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</button>`).join('')}</span>
    </div>`).join('')}</div>`;
  } else {
    const colors = variantColors(p.design, p.variant);
    body = p.selected ? `<div class="quick-big">${QUICK_VARIANTS.map((variant) => `<div class="quick-line"><span>${escapeHtml(t(`quick.${variant}`))}</span>${colors.map((c, i) => `<button class="quick-swatch big v-${variant} ${(p.qs?.color ?? 1) === i + 1 && (p.qs?.variant ?? 'fill') === variant ? 'active' : ''}" data-pick-quick="${i + 1}:${variant}" style="--qs:${c};--qs-bg:${{ fill: c, subtle: `${c}33`, outline: 'transparent', intense: c, gradient: `linear-gradient(${c}88, ${c})`, none: 'transparent' }[variant]}" title="${escapeHtml(t('props.quickTip', { n: i + 1, variant: t(`quick.${variant}`) }))}">${variant === 'none' ? icon('textTool', 'icon tiny') : ''}</button>`).join('')}</div>`).join('')}</div>`
      : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('design.selectShapes'))}</span></div>`;
  }
  root.innerHTML = frame({
    glyph: 'design', title: t('design.title'),
    tabs: tabsHtml([['themes', 'design', t('design.tabThemes')], ['quick', 'quickStyle', t('design.tabQuick')]], tab),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="muted">${escapeHtml(t(tab === 'themes' ? 'design.hint' : 'design.quickHint'))}</span><span class="grow"></span>${button('close', t('common.close'), 'close')}`,
  });
  ready();
}

// ───────────────────────── data import (org chart, link data, list)

const IMPORT_SAMPLES = {
  org: { ko: '이름,직함,상사,부서\n김대표,대표이사,,경영\n이부장,개발 부장,김대표,개발\n박부장,영업 부장,김대표,영업\n최과장,백엔드,이부장,개발\n정대리,프론트엔드,이부장,개발\n한과장,국내 영업,박부장,영업', en: 'Name,Title,Manager,Department\nAlex Kim,CEO,,Management\nSara Lee,CTO,Alex Kim,Development\nJames Park,Sales Director,Alex Kim,Sales\nDaniel Kang,Back-end,Sara Lee,Development\nHana Jung,Front-end,Sara Lee,Development\nErin Han,Domestic Sales,James Park,Sales' },
  link: { ko: '이름,담당자,비용,상태\n주문 확정,김민지,1200,진행 중\n상품 포장,이준호,3500,완료', en: 'Name,Owner,Cost,Status\nConfirm order,Mina Kim,1200,In progress\nPick & pack,Jun Lee,3500,Done' },
  list: { ko: '요청 접수\n검토\n승인\n처리\n완료 통보', en: 'Receive request\nReview\nApprove\nProcess\nNotify' },
};

function renderImport() {
  const p = P();
  if (!state.draft) state.draft = { tab: ['org', 'link', 'list'].includes(p.tab) ? p.tab : 'org', text: p.text ?? '', name: p.name ?? '', spacing: 40, createMissing: false, master: 'process' };
  const d = state.draft;
  const tab = d.tab;
  const rows = d.text.split(/\r?\n/).filter((l) => l.trim()).length;
  root.innerHTML = frame({
    glyph: { org: 'orgData', link: 'linkData', list: 'list' }[tab], title: t(`import.title.${tab}`),
    tabs: tabsHtml([['org', 'orgData', t('import.tab.org')], ['link', 'linkData', t('import.tab.link')], ['list', 'list', t('import.tab.list')]], tab, 'import-tab'),
    body: `<div class="import-view">
      <p class="muted">${escapeHtml(t(`import.hint.${tab}`))}</p>
      <div class="row">${button('import-file', t('import.file'), 'folderOpen', 'small')}${button('import-sample', t('import.sample'), 'samples', 'small')}<span class="path muted">${escapeHtml(d.name)}</span><span class="grow"></span><span class="muted">${escapeHtml(t('import.rows', { count: Math.max(0, rows - (tab === 'list' ? 0 : 1)) }))}</span></div>
      <textarea class="import-text" data-draft="text" spellcheck="false" placeholder="${escapeHtml(t('import.placeholder'))}" aria-label="${escapeHtml(t('import.placeholder'))}">${escapeHtml(d.text)}</textarea>
      ${tab === 'org' ? row('distributeH', t('layout.spacing'), numberField('draft:spacing', d.spacing, 10, 200, 5, ' px', t('layout.spacing'))) : ''}
      ${tab === 'link' ? toggle('createMissing', t('import.createMissing'), 'plus', d.createMissing, 'data-draft-toggle') : ''}
      ${tab === 'list' ? row('stFlowchart', t('import.master'), select('data-draft-select', 'master', ['process', 'roundRect', 'ellipse', 'terminator', 'mainTopic'].map((m) => [m, t(`import.masterName.${m}`)]), d.master, t('import.master'))) : ''}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('import-apply', t(`import.apply.${tab}`), 'check', 'primary', '', d.text.trim() ? '' : 'disabled')}`,
  });
  ready();
}

// ───────────────────────── my shapes

function renderStencil() {
  const p = P();
  if (!state.draft) state.draft = { items: (p.items ?? []).map((item) => ({ ...item })) };
  const d = state.draft;
  const [page, pager] = paged('stencil', d.items, 6);
  root.innerHTML = frame({
    glyph: 'myShapes', title: t('myShapes.title'),
    body: `<div class="stencil-editor">${page.length ? page.map((item) => `<div class="row my-shape-row">
      <span class="my-shape-preview">${String(item.svg ?? '').replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ').replace(/ width="\d+" height="\d+"/, ' width="56" height="40"')}</span>
      <input type="text" data-my-name="${item.id}" value="${escapeHtml(item.name)}" aria-label="${escapeHtml(t('myShapes.name'))}" />
      ${button('my-insert', t('myShapes.insert'), 'plus', 'small', item.id)}
      <button class="icon-button" data-action="my-remove" data-value="${item.id}" title="${escapeHtml(t('myShapes.remove'))}" aria-label="${escapeHtml(t('myShapes.remove'))}">${icon('trash')}</button>
    </div>`).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('myShapes.empty'))}</span></div>`}<div class="row">${pager}</div></div>`,
    foot: `<span class="muted">${escapeHtml(t('myShapes.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('stencil-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── colour picker (toolbar, properties)

let colorDone = false;
function renderColor() {
  const p = P();
  const sw = (c) => `<button class="swatch big ${String(p.current).toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-pick-color="${c}" style="--swatch:${c}" title="${c}"></button>`;
  root.innerHTML = `<div class="color-picker" role="dialog" aria-label="${escapeHtml(t(`color.title.${p.key}`, null, t('color.title.fill')))}">
    <div class="color-head">${icon('palette')}<b>${escapeHtml(t(`color.title.${p.key}`, null, t('color.title.fill')))}</b><span class="grow"></span><button class="icon-button" data-action="close" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button></div>
    <small class="muted">${escapeHtml(t('color.theme'))}</small><div class="color-grid6">${(p.accents ?? []).map(sw).join('')}</div>
    <small class="muted">${escapeHtml(t('color.standard'))}</small><div class="color-grid6">${(p.standard ?? []).map(sw).join('')}</div>
    <div class="color-foot">${p.allowNone ? `<button class="small-button" data-pick-color="none" title="${escapeHtml(t('color.none'))}">${icon('close')}<span>${escapeHtml(t('color.none'))}</span></button>` : ''}<label class="small-button" title="${escapeHtml(t('color.custom'))}">${icon('fillColor')}<span>${escapeHtml(t('color.custom'))}</span><input type="color" data-color-custom value="${escapeHtml(/^#[0-9a-f]{6}$/i.test(p.current ?? '') ? p.current : '#4472c4')}" /></label></div>
  </div>`;
  const menu = root.querySelector('.color-picker');
  const width = Math.ceil(menu.scrollWidth) + 2;
  const height = Math.ceil(menu.scrollHeight) + 2;
  const anchor = p.anchor;
  if (!state.placed) {
    state.placed = true;
    const at = anchor ?? { x: window.screenX + 200, y: window.screenY + 200 };
    if (desktop) native.invoke('place_popup', { x: at.x, y: at.y, width, height, flipY: at.flipY ?? null, show: true }).catch(() => {});
    else send('place', { x: at.x, y: at.y, width, height, flipY: at.flipY ?? null });
  }
  ready();
}

// ───────────────────────── prompt (a name)

function renderPrompt() {
  const p = P();
  if (!state.draft) state.draft = { value: p.value ?? '' };
  root.innerHTML = frame({
    glyph: p.icon ?? 'edit', title: p.title ?? '',
    body: `<div class="editor">${row(p.icon ?? 'edit', p.label ?? '', `<input type="text" data-draft="value" value="${escapeHtml(state.draft.value)}" aria-label="${escapeHtml(p.label ?? '')}" />`)}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('prompt-apply', t('common.ok'), 'check', 'primary')}`,
  });
  fitHeight();
  const input = root.querySelector('[data-draft="value"]');
  input?.focus();
  input?.select();
  ready();
}

// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-theme-group], [data-pick-theme], [data-draft-segment], [data-print-segment], [data-draft-swatch], [data-pick-design], [data-pick-quick], [data-pick-color]');
  if (!target || target.disabled) return undefined;
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id);
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const raw = target.dataset.value;
    return update({ [key]: typeof s()[key] === 'number' ? Number(raw) : raw });
  }
  if (target.dataset.themeGroup) { state.themeGroup = target.dataset.themeGroup; return render(); }
  if (target.dataset.pickTheme) { pickerDone = true; return close({ theme: target.dataset.pickTheme }); }
  if (target.dataset.pickDesign) { const [design, variant] = target.dataset.pickDesign.split(':'); return close({ action: 'design', design, variant: Number(variant) }); }
  if (target.dataset.pickQuick) { const [color, variant] = target.dataset.pickQuick.split(':'); return close({ action: 'quick', color: Number(color), variant }); }
  if (target.dataset.pickColor) { colorDone = true; return close({ color: target.dataset.pickColor }); }
  const d = state.draft;
  if (target.dataset.draftSegment) {
    const key = target.dataset.draftSegment;
    const value = target.dataset.value;
    const parsed = value === 'true' ? true : value === 'false' ? false : key === 'textAngle' ? Number(value) : value;
    if (key.startsWith('option:')) d.options[key.slice(7)] = parsed;
    else d[key] = parsed;
    d.touched?.add(key);
    if (kind === 'page' && key === 'orientation' && d.paper !== 'custom') {
      const size = paperSize(d.paper, parsed);
      d.widthText = formatLength(size.width, d.units);
      d.heightText = formatLength(size.height, d.units);
    } else if (kind === 'page' && key === 'orientation') [d.widthText, d.heightText] = [d.heightText, d.widthText];
    return render();
  }
  if (target.dataset.draftSwatch) { const key = target.dataset.draftSwatch; d[key] = target.dataset.value; d.touched.add(key); if (key === 'fill') { d.noFill = false; d.touched.add('noFill'); } if (key === 'line') { d.noLine = false; d.touched.add('noLine'); } return render(); }
  if (target.dataset.printSegment) return changePrint({ [target.dataset.printSegment]: target.dataset.value });
  const value = target.dataset.value;
  switch (target.dataset.action) {
    case 'close':
      if (kind === 'menu') return chooseMenu(null);
      if (kind === 'color') colorDone = true;
      return close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null);
    case 'tab': state.tab = value; return render();
    case 'tabs-scroll': return scrollPopupTabs(Number(value));
    case 'pager': { const [name, step] = value.split(':'); state.pager[name] = (state.pager[name] ?? 0) + Number(step); return render(); }
    case 'choice': return close({ choice: value });
    case 'reset-settings': {
      const keep = { backgroundImage: s().backgroundImage, backgroundName: s().backgroundName, lastDirectory: s().lastDirectory, language: s().language, tutorialOffered: true, tutorialDone: s().tutorialDone };
      return update({ ...defaultSettings(s().language), ...keep });
    }
    case 'choose-background': return action('choose-background');
    case 'clear-background': return action('clear-background');
    case 'shuffle-background': return action('shuffle-background');
    case 'start-tutorial': await action('start-tutorial'); return close();
    case 'show-start': return action('show-start');
    case 'open-recent': await action('open-recent', { path: value }); return kind === 'recent' ? close() : undefined;
    case 'open-folder': await action('open-folder', { path: value }); return kind === 'recent' ? close() : undefined;
    case 'remove-recent': storeRecent(globalThis.localStorage, removeRecent(loadRecent(globalThis.localStorage), value)); return render();
    case 'remove-folder': storeRecentDirs(globalThis.localStorage, removeRecent(loadRecentDirs(globalThis.localStorage), value)); return render();
    case 'clear-recent': storeRecent(globalThis.localStorage, []); return render();
    case 'clear-folders': storeRecentDirs(globalThis.localStorage, []); return render();
    case 'db-test': return testDatabase();
    case 'db-browse': return action('db-browse');
    case 'db-open': return close({ action: 'open', id: value });
    case 'db-delete': return action('db-delete', { id: value, title: target.dataset.title ?? '' });
    case 'db-refresh': return action('db-refresh');
    case 'copy-error':
      try { await copyText(errorReport()); state.copied = true; render(); } catch (error) { root.querySelector('#copy-state').textContent = `${t('error.copyFailed')}: ${native.errorText(error)}`; }
      return undefined;
    case 'copy-about':
      return copyText([...root.querySelectorAll('#about-rows dt')].map((dt) => `${dt.textContent.trim()}: ${dt.nextElementSibling.textContent.trim()}`).join('\n')).then(() => action('notice', { kind: 'success', text: t('error.copied') }));
    case 'page': state.page += Number(value); return render();
    case 'print': return doPrint();
    case 'use-custom': return update({ theme: CUSTOM });
    case 'copy-theme': { const from = resolveTheme(s().theme === CUSTOM ? 'light' : s().theme, prefersDark(), s().customTheme); return update({ customTheme: customFrom(from) }); }
    case 'edit-custom': pickerDone = true; await action('open-settings', { tab: 'appearance', themeGroup: 'custom' }); return close();
    case 'random-theme': { const all = [...LIGHT_THEMES, ...DARK_THEMES].map((theme) => theme.id).filter((id) => id !== s().theme); pickerDone = true; return close({ theme: all[Math.floor(Math.random() * all.length)] }); }
    // diagram popups
    case 'image-apply': return close({ format: d.format, transparent: imageFormat(d.format).alpha && d.transparent, area: d.area, scale: Number(d.scale), quality: Number(d.quality) });
    case 'format-apply': return applyFormat();
    case 'field-add': d.fields.push({ key: '', label: t('data.newLabel', { n: d.fields.length + 1 }), type: 'text', value: '', optionsText: '' }); state.pager.data = Math.floor((d.fields.length - 1) / 8); return render();
    case 'field-remove': d.fields.splice(Number(value), 1); return render();
    case 'data-apply': return close({ action: 'apply', applyValues: Boolean(d.applyValues), fields: d.fields.filter((f) => String(f.label).trim()).map((f) => ({ key: String(f.key || f.label).trim(), label: String(f.label).trim(), type: f.type, value: f.value ?? '', options: String(f.optionsText ?? '').split(';').map((o) => o.trim()).filter(Boolean) })) });
    case 'page-apply': return applyPageSetup();
    case 'page-color-reset': d.color = ''; return render();
    case 'layer-add': { const id = newId('layer'); d.layers.push({ id, name: t('layer.newName', { n: d.layers.length + 1 }), visible: true, print: true, locked: false, color: '' }); state.pager.layers = Math.floor((d.layers.length - 1) / 8); return render(); }
    case 'layer-remove': d.layers = d.layers.filter((l) => l.id !== value); if (d.activeLayer === value) d.activeLayer = null; return render();
    case 'layer-color-clear': d.layers.find((l) => l.id === value).color = ''; return render();
    case 'layer-assign': d.assign = d.assignLayer ? { layerId: d.assignLayer, mode: d.assignMode } : null; return render();
    case 'layers-apply': return close({ action: 'apply', layers: d.layers, activeLayer: d.activeLayer, assign: d.assign, deleteShapes: d.deleteShapes });
    case 'find-mode': d.mode = value; d.message = ''; return render();
    case 'find-next': return action('find-next', { text: d.text, matchCase: d.matchCase, whole: d.whole, data: d.data, scope: d.scope, direction: 1 });
    case 'find-prev': return action('find-next', { text: d.text, matchCase: d.matchCase, whole: d.whole, data: d.data, scope: d.scope, direction: -1 });
    case 'replace-one': return action('replace-one', { text: d.text, replacement: d.replacement, matchCase: d.matchCase, whole: d.whole, scope: d.scope });
    case 'replace-all': return action('replace-all', { text: d.text, replacement: d.replacement, matchCase: d.matchCase, whole: d.whole, scope: d.scope });
    case 'go': await action('go-to-page', { pageId: d.pageId }); return close();
    case 'document-apply': return close({ action: 'apply', props: d.props });
    case 'layout-apply': return close({ action: 'apply', kind: d.kind, spacing: Number(d.spacing), scope: d.scope, route: d.route || null });
    case 'link-apply': return close({ action: 'apply', address: d.type === 'page' ? (d.pageId ? `page:${d.pageId}` : '') : String(d.address ?? '').trim() });
    case 'link-remove': return close({ action: 'apply', address: '' });
    case 'import-tab': d.tab = value; return render();
    case 'import-file': return action('import-file');
    case 'import-sample': d.text = IMPORT_SAMPLES[d.tab][L() === 'en' ? 'en' : 'ko']; d.name = t('import.sampleName'); return render();
    case 'import-apply': return close({ action: d.tab, text: d.text, spacing: Number(d.spacing), createMissing: Boolean(d.createMissing), master: d.master });
    case 'my-insert': return close({ action: 'insert', id: value });
    case 'my-remove': d.items = d.items.filter((item) => item.id !== value); return render();
    case 'stencil-apply': return close({ action: 'apply', items: d.items.map(({ id, name }) => ({ id, name })) });
    case 'prompt-apply': return close({ value: d.value });
    default: return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  const d = state.draft;
  if (target.dataset.toggle) return update({ [target.dataset.toggle]: target.checked });
  if (target.dataset.dbText || 'dbPassword' in target.dataset) {
    const patch = target.dataset.dbText ? { [target.dataset.dbText]: target.value.trim() } : null;
    if (!patch) state.dbPassword = target.value;
    if (!patch && !s().dbSavePassword) action('db-password', { password: target.value });
    const changes = patch ?? (s().dbSavePassword ? { dbPassword: target.value } : null);
    if (changes) { state.settings = { ...state.settings, ...changes }; storeSettings(globalThis.localStorage, state.settings); }
    state.dbResult = null;
    root.querySelector('#db-result')?.remove();
    return undefined;
  }
  if (target.dataset.dbToggle) {
    if (target.checked) return update({ dbSavePassword: true, dbPassword: state.dbPassword ?? '' });
    state.dbPassword = s().dbPassword;
    action('db-password', { password: state.dbPassword });
    return update({ dbSavePassword: false, dbPassword: '' });
  }
  if (target.dataset.select) { const key = target.dataset.select; return update({ [key]: typeof s()[key] === 'number' ? Number(target.value) : target.value }); }
  if (target.dataset.customColor) return update({ customTheme: { ...s().customTheme, [target.dataset.customColor]: target.value }, theme: CUSTOM });
  if ('customDark' in target.dataset) return update({ customTheme: { ...s().customTheme, dark: target.checked }, theme: CUSTOM });
  if (target.dataset.colorCustom !== undefined && 'colorCustom' in target.dataset) { colorDone = true; return close({ color: target.value }); }
  if (target.dataset.draftToggle) {
    const key = target.dataset.draftToggle;
    if (key.startsWith('box:')) d.box[key.slice(4)] = target.checked;
    else if (key.startsWith('lock:')) d.locked[key.slice(5)] = target.checked;
    else if (key.startsWith('option:')) d.options[key.slice(7)] = target.checked;
    else d[key] = target.checked;
    d.touched?.add(key);
    return kind === 'find' ? undefined : render();
  }
  if (target.dataset.draftSelect) {
    const key = target.dataset.draftSelect;
    d[key] = target.value;
    d.touched?.add(key);
    if (kind === 'page' && key === 'paper' && target.value !== 'custom') {
      const size = paperSize(target.value, d.orientation);
      d.widthText = formatLength(size.width, d.units);
      d.heightText = formatLength(size.height, d.units);
    }
    if (kind === 'page' && key === 'units') {
      const w = parseLength(d.widthText, P().units) ?? d.width; const h = parseLength(d.heightText, P().units) ?? d.height;
      d.widthText = formatLength(w, d.units); d.heightText = formatLength(h, d.units);
    }
    return render();
  }
  if (target.dataset.draftColorInput) { const key = target.dataset.draftColorInput; d[key] = target.value; d.touched?.add(key); if (key === 'fill') { d.noFill = false; d.touched?.add('noFill'); } if (key === 'line') { d.noLine = false; d.touched?.add('noLine'); } return render(); }
  if (target.dataset.box) { d.box[`${target.dataset.box}Text`] = target.value; d.touched.add(`box:${target.dataset.box}`); return undefined; }
  if (target.dataset.fieldEdit) {
    const [key, index] = target.dataset.fieldEdit.split(':');
    d.fields[Number(index)][key] = target.value;
    if (key === 'type' || key === 'optionsText') return render();
    return undefined;
  }
  if (target.dataset.layerName) { d.layers.find((l) => l.id === target.dataset.layerName).name = target.value; return undefined; }
  if (target.dataset.layerFlag) { const [key, id] = target.dataset.layerFlag.split(':'); d.layers.find((l) => l.id === id)[key] = target.checked; return undefined; }
  if (target.dataset.layerColor) { d.layers.find((l) => l.id === target.dataset.layerColor).color = target.value; return render(); }
  if ('layerActive' in target.dataset) { d.activeLayer = target.dataset.layerActive || null; return undefined; }
  if (target.dataset.docProp) { d.props[target.dataset.docProp] = target.value; return undefined; }
  if (target.dataset.myName) { d.items.find((item) => item.id === target.dataset.myName).name = target.value; return undefined; }
  if (target.dataset.printRange) return changePrint({ range: target.dataset.printRange });
  if (target.dataset.printToggle) return changePrint({ [target.dataset.printToggle]: target.checked });
  if (target.dataset.print) return changePrint({ [target.dataset.print]: target.value });
  if (target.dataset.printText) return changePrint({ [target.dataset.printText]: target.value });
  return undefined;
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.draft && state.draft) {
    state.draft[target.dataset.draft] = target.value;
    state.draft.touched?.add(target.dataset.draft);
    if (kind === 'import') { const btn = root.querySelector('[data-action="import-apply"]'); if (btn) btn.disabled = !target.value.trim(); }
  }
  if (target.dataset.docProp && state.draft) state.draft.props[target.dataset.docProp] = target.value;
  if (target.dataset.fieldEdit && state.draft) { const [key, index] = target.dataset.fieldEdit.split(':'); if (key !== 'type') state.draft.fields[Number(index)][key] = target.value; }
  if (target.dataset.layerName && state.draft) state.draft.layers.find((l) => l.id === target.dataset.layerName).name = target.value;
  if (target.dataset.box && state.draft) { state.draft.box[`${target.dataset.box}Text`] = target.value; state.draft.touched.add(`box:${target.dataset.box}`); }
  if (target.dataset.myName && state.draft) state.draft.items.find((item) => item.id === target.dataset.myName).name = target.value;
  if ('dbPassword' in target.dataset) state.dbPassword = target.value;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (kind === 'menu') chooseMenu(null);
    else if (kind !== 'progress') { if (kind === 'color') colorDone = true; close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null); }
  }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    if (event.key === 'Enter' && document.activeElement?.classList.contains('menu-item')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id); }
    if (event.key === 'ArrowRight' && document.activeElement?.classList.contains('has-sub')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id); }
  }
  if (kind === 'print' && event.key === 'PageDown') { state.page += 1; render(); }
  if (kind === 'print' && event.key === 'PageUp') { state.page -= 1; render(); }
  if (event.key === 'Enter' && event.target.matches?.('input[type="text"]') && !event.target.matches('.stepper-value')) {
    const primary = { shape: 'format-apply', data: 'data-apply', page: 'page-apply', layers: 'layers-apply', find: state.draft?.mode === 'page' ? 'go' : 'find-next', document: 'document-apply', hyperlink: 'link-apply', prompt: 'prompt-apply', stencil: 'stencil-apply' }[kind];
    if (primary) {
      event.preventDefault();
      event.target.dispatchEvent(new Event('change', { bubbles: true }));
      root.querySelector(`[data-action="${primary}"]`)?.click();
    }
  }
});
document.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('textarea, input')) event.preventDefault();
});

// The theme dropdown and the colour picker close when they lose focus.
window.addEventListener('blur', () => {
  if (kind === 'theme' && !pickerDone) setTimeout(() => { if (!document.hasFocus() && !pickerDone) { pickerDone = true; close(); } }, 120);
  if (kind === 'color' && !colorDone) setTimeout(() => { if (!document.hasFocus() && !colorDone && !document.querySelector('[data-color-custom]:focus')) { colorDone = true; close(); } }, 200);
});

// Number fields (steppers).
bindSteppers(root, (key, value) => {
  const [scope, field] = key.includes(':') ? key.split(':') : ['setting', key];
  if (scope === 'setting') update({ [field]: value });
  else if (scope === 'print') changePrint({ [field]: value });
  else if (scope === 'box') { state.draft.box[field] = value; state.draft.touched.add(`box:${field}`); }
  else if (scope === 'draft') {
    const rest = key.slice('draft:'.length);
    if (rest.startsWith('option:')) state.draft.options[rest.slice(7)] = value;
    else { state.draft[rest] = value; state.draft.touched?.add(rest); }
  }
  return undefined;
});

// Menus close when they lose focus (a click anywhere else).
window.addEventListener('blur', () => {
  if (kind === 'menu' && menuOpen) setTimeout(() => { if (!document.hasFocus()) chooseMenu(null); }, 60);
});

// Frames: drag the popup by its header (OS windows use data-tauri-drag-region).
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

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    state.settings = loadSettings(globalThis.localStorage);
    applyLook();
    if (!['menu', 'color'].includes(kind)) render();
  } else if ((event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) && (kind === 'recent' || state.tab === 'recent')) {
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
  } else if (message?.type === 'find-result' && kind === 'find' && state.draft) {
    state.draft.message = message.count != null && message.found === undefined ? t('find.replaced', { count: message.count }) : message.found ? t('find.foundAt', { index: message.index, count: message.count }) : t('find.notFound');
    const el = root.querySelector('#find-message');
    if (el) el.textContent = state.draft.message;
  } else if (message?.type === 'import-text' && kind === 'import' && state.draft) {
    state.draft.text = String(message.text ?? '');
    state.draft.name = String(message.name ?? '');
    render();
  } else if (message?.type === 'db-result' && kind === 'settings') {
    state.dbResult = { ok: Boolean(message.ok), text: String(message.text ?? '') };
    render();
  } else if (message?.type === 'db-list' && kind === 'database') {
    state.dbItems = Array.isArray(message.items) ? message.items : [];
    render();
  } else if (message?.type === 'refresh') {
    refresh();
  }
}

function refresh() {
  state.params = popupParams(kind);
  state.settings = loadSettings(globalThis.localStorage);
  state.tab = state.params.tab ?? 'general';
  state.copied = false;
  state.progress = null;
  state.page = 0;
  state.pager = {};
  state.dbItems = null;
  state.dbResult = null;
  state.draft = null;
  state.print = null;
  state.printData = null;
  if (kind === 'theme' || kind === 'color') { state.placed = false; pickerDone = false; colorDone = false; }
  if (kind === 'settings' && state.params.themeGroup) state.themeGroup = state.params.themeGroup;
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
    if (event.origin === location.origin && event.data?.mydiagramHost) onHostMessage(event.data);
  });
}
window.addEventListener('resize', () => { if (kind === 'print') fitPreview(); });

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__mydiagramPopup = { kind, state, render, close, errorReport, printLayout, refresh, applyFormat, applyPageSetup };

// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web build, tutorial: ?popup=<kind>). Every
// popup has a fixed size chosen so its content fits without scrolling; long
// content is split into tabs or pages, and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { loadRecent, loadRecentDirs, MAX_RECENT, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, BACKGROUND_FITS, BACKGROUND_KINDS, defaultSettings, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, loadSettings, PRINT_KEY,
  RECENT_DIRS_KEY, RECENT_KEY, STORAGE_KEY, storeSettings, ZOOM, GRID_SIZES, LINE_STYLES, DIAGRAM_THEME_IDS,
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
import { normalizeProject } from './domain/format.js';
import { ANIMATION_INTERVALS } from './domain/settings.js';
import { intervalLabel } from './ui/startpage.js';
import { IMAGE_FORMATS, IMAGE_SCALES, imageFormat, rasterSize } from './export/image-encode.js';
import { canvasMeasure } from './views/diagram.js';
import { backgroundLayers, diagramBackground, DIAGRAM_THEMES } from './render/notation.js';
import { backgroundControlsHtml, backgroundValue } from './ui/diagram-background.js';
import { REPORT_SECTIONS, REPORT_TEMPLATE_IDS, REPORT_TEMPLATES } from './domain/report.js';
import { PLANTUML_MORE_EXAMPLES } from './domain/interop/plantuml-examples.js';
import { DIFF_CATEGORIES, DIFF_STATUSES, diffTree } from './domain/diff.js';
import { typeDef } from './domain/meta.js';
import { REQUIREMENT_KINDS, REQUIREMENT_PRIORITIES, REQUIREMENT_STATUSES } from './domain/meta.js';
import { COMMITTED_STATUSES, matrixCsv, matrixTsv, requirementsCsv } from './domain/trace.js';

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
  globalThis.parent?.postMessage({ myumlmaker: true, kind, type, data }, location.origin);
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
  appWindow.setTitle(`${title} — MyUMLMaker v${VERSION}`).catch(() => {});
}

function frame({ glyph, title, body, foot = '', tabs = '' }) {
  setOsTitle(title);
  return `<div class="popup popup-${kind}" role="dialog" aria-labelledby="popup-title">
    <header class="popup-head" data-window-drag data-drag-region>
      <h2 id="popup-title" data-window-drag>${icon(glyph)}<span data-window-drag>${escapeHtml(title)}</span></h2>
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
      find: renderFind, validation: renderValidation, codegen: renderCodegen, textimport: renderTextImport, color: renderColor, prompt: renderPrompt,
      document: renderDocument, baselines: renderBaselines, compare: renderCompare, background: renderBackground,
      requirements: renderRequirements, tracematrix: renderTraceMatrix,
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

/** Popups whose height follows their content (confirm, about, welcome): sized once drawn, and again when
 * web fonts and pictures have loaded (they change the height: About in English was 7 px short). */
function fitHeight() {
  fitHeightNow();
  document.fonts?.ready.then(() => requestAnimationFrame(fitHeightNow)).catch(() => {});
  for (const img of root.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', fitHeightNow, { once: true });
}

function fitHeightNow() {
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
  ['diagram', 'dgClass', 'settings.diagram'],
  ['database', 'database', 'settings.database'],
  ['recent', 'recent', 'settings.recent'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

function renderSettings() {
  const body = {
    general: settingsGeneral, start: settingsStart, appearance: settingsAppearance, font: settingsFont, background: settingsBackground,
    diagram: settingsDiagram, database: settingsDatabase, recent: settingsRecent, shortcuts: settingsShortcuts,
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
// (__myumlmakerDbPreview: layout checks draw the full tab in the web build.)
const desktopApp = () => desktop || Boolean(globalThis.__myumlmakerDbPreview) || (() => { try { return Boolean(globalThis.parent?.__TAURI_INTERNALS__); } catch { return false; } })();
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
  ['Ctrl+P', 'action.print'], ['Ctrl+R', 'action.recent'], ['Ctrl+Z', 'action.undo'], ['Ctrl+Y', 'action.redo'], ['Ctrl+X', 'action.cut'], ['Ctrl+C', 'action.copy'], ['Ctrl+V', 'action.paste'],
  ['Ctrl+D', 'action.duplicate'], ['Delete', 'action.delete'], ['Ctrl+Delete', 'action.deleteFromModel'], ['Ctrl+A', 'action.selectAll'], ['Esc', 'action.clearSelection'], ['Ctrl+F', 'action.find'],
  ['Ctrl+E', 'action.selectInExplorer'], ['F2 / Enter', 'action.editName'], ['shortcut.doubleClick', 'shortcut.quickEdit'], ['Ctrl+Enter', 'shortcut.applyQuickEdit'], ['Ctrl+1', 'tool.pointer'],
  ['shortcut.shiftCreate', 'shortcut.keepTool'], ['Ctrl+B / I', 'action.bold'], ['Ctrl+Shift+> / <', 'action.fontUp'], ['Ctrl+Shift+F / K', 'action.bringFront'], ['Ctrl+Up / Down', 'action.moveUp'],
  ['shortcut.arrows', 'shortcut.nudge'], ['shortcut.shiftDrag', 'shortcut.constrain'], ['shortcut.altDrag', 'shortcut.noSnap'], ['Ctrl+= / Ctrl+-', 'action.zoomIn'], ['Ctrl+0', 'action.zoomReset'],
  ['Ctrl+Shift+W', 'action.fitDiagram'], ['shortcut.wheel', 'action.zoomIn'], ['shortcut.space', 'shortcut.pan'], ['Ctrl+PageUp / PageDown', 'action.nextDiagram'],
  ['Ctrl+Shift+G', 'action.generateCode'], ['Ctrl+Shift+R', 'action.reverse'], ['Ctrl+Shift+V', 'action.validate'], ['F5', 'action.presentation'], ['Ctrl+Tab', 'tabs.next'],
  ['Ctrl+Shift+1 / 2', 'action.toolboxPanel'], ['Ctrl+J', 'action.bottomPanel'], ['Ctrl+Shift+L', 'action.language'], ['Ctrl+Shift+B', 'action.shuffleBackground'], ['Ctrl+Shift+H', 'action.startPage'], ['Ctrl+,', 'action.settings'],
  ['F11', 'action.tutorial'], ['F1', 'action.about'],
];

function settingsShortcuts() {
  const [list, pager] = paged('shortcuts', SHORTCUT_LIST, 36);
  return `<div class="shortcut-grid">${list.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>${pager ? `<div class="row">${pager}</div>` : ''}`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyUMLMaker', version: VERSION, error: native.errorText(error) }));
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
      <div class="about-top"><img class="about-icon small" src="${appIcon}" alt="" /><div><div class="about-name">MyUMLMaker <span class="about-version">v${escapeHtml(VERSION)}</span></div><p class="about-description">${escapeHtml(t('welcome.text'))}</p></div></div>
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
//
// A menu and its open groups are panels in this one popup. A group row (`children`) opens its
// items in a panel beside it when the pointer rests on it (or on a click, → or Enter), and the
// popup grows to hold every open panel. Where the window can be transparent (Windows, Linux, the
// web frame) only the panels show, each with its own shadow in MENU_MARGIN around them; macOS
// windows stay opaque (Tauri needs its private API for that), so there the popup is a plain box.

const menuGlass = !desktop || !/Mac/i.test(navigator.platform);
const MENU_MARGIN = menuGlass ? 10 : 0;
const MENU_OPEN_DELAY = 120;
const MENU_CLOSE_DELAY = 300;
if (kind === 'menu' && menuGlass) document.documentElement.classList.add('menu-glass');
/** Open panels, outermost first: { el, items, row (the group row that opened it), x, y, w, h } in screen pixels. */
let menuPanels = [];
let menuTimer = 0;

function menuPanelHtml(items, level, label) {
  return `<div class="popup-menu" role="menu" data-level="${level}" aria-label="${escapeHtml(label ?? '')}">${items.map((item, index) => (item.separator
    ? '<div class="menu-sep" role="separator"></div>'
    : `<button class="menu-item ${item.danger ? 'danger' : ''} ${item.submenu ? 'has-sub' : ''}" role="menuitem" data-index="${index}" data-id="${escapeHtml(item.id)}" ${item.submenu ? 'aria-haspopup="menu" aria-expanded="false"' : ''} ${item.disabled ? 'disabled aria-disabled="true"' : ''} title="${escapeHtml(item.label)}">
        <span class="menu-icon">${icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key">${escapeHtml(item.shortcut ?? '')}</span>
        <span class="menu-check">${item.submenu ? icon('chevronRight') : item.checked ? icon('check') : ''}</span>
      </button>`)).join('')}</div>`;
}

/** Adds a panel (hidden until placed) and measures it. */
function addMenuPanel(items, level, label) {
  root.querySelector('.menu-stack').insertAdjacentHTML('beforeend', menuPanelHtml(items, level, label));
  const el = root.querySelector(`.popup-menu[data-level="${level}"]`);
  return { el, items, w: Math.ceil(el.offsetWidth), h: Math.ceil(el.offsetHeight) };
}

/** Screen position of this popup's top-left corner (the web frame: inside the page, as popups.js places it). */
function menuOrigin() {
  const frame = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { x: window.screenX + frame.left, y: window.screenY + frame.top };
}

/** Where panels may go: the monitor's work area (desktop) or the page (web), less the shadow margin. */
function menuBounds() {
  const m = Math.max(MENU_MARGIN, 4);
  if (desktop || !window.parent || window.parent === window) {
    const s = window.screen;
    const left = s.availLeft ?? 0;
    const top = s.availTop ?? 0;
    return { left: left + m, top: top + m, right: left + s.availWidth - m, bottom: top + s.availHeight - m };
  }
  return { left: window.screenX + m, top: window.screenY + m, right: window.screenX + window.parent.innerWidth - m, bottom: window.screenY + window.parent.innerHeight - m };
}

function placeMenuWindow(x, y, width, height, flipY = null) {
  if (desktop) {
    native.invoke('place_popup', { x, y, width, height, flipY, show: true }).then(() => window.focus()).catch(() => {});
  } else {
    send('place', { x, y, width, height, flipY });
  }
}

/** Sizes the popup to the open panels (plus their shadow margin) and puts each panel at its place. */
function layoutMenus() {
  const left = Math.min(...menuPanels.map((p) => p.x)) - MENU_MARGIN;
  const top = Math.min(...menuPanels.map((p) => p.y)) - MENU_MARGIN;
  const right = Math.max(...menuPanels.map((p) => p.x + p.w)) + MENU_MARGIN;
  const bottom = Math.max(...menuPanels.map((p) => p.y + p.h)) + MENU_MARGIN;
  for (const p of menuPanels) {
    p.el.style.left = `${p.x - left}px`;
    p.el.style.top = `${p.y - top}px`;
    p.el.style.visibility = '';
  }
  placeMenuWindow(left, top, right - left, bottom - top);
}

function renderMenu() {
  const p = P();
  // Created ahead of time (prewarm) or reopened without a menu: stay hidden.
  if (p.prewarm || !Array.isArray(p.items) || !shownOnce()) return;
  setOsTitle(p.header?.title);
  clearTimeout(menuTimer);
  // Items only: no name/icon header row (the name stays the window title and the accessible name).
  root.innerHTML = '<div class="menu-stack"></div>';
  const main = addMenuPanel(p.items, 0, p.header?.title);
  main.el.style.left = `${MENU_MARGIN}px`;
  main.el.style.top = `${MENU_MARGIN}px`;
  menuPanels = [main];
  const anchor = p.anchor ?? { x: 100, y: 100 };
  // The host keeps the menu on the screen (and opens it above `flipY` when there is no room below).
  placeMenuWindow(anchor.x - MENU_MARGIN, anchor.y - MENU_MARGIN, main.w + 2 * MENU_MARGIN, main.h + 2 * MENU_MARGIN, anchor.flipY != null ? anchor.flipY + MENU_MARGIN : null);
  menuOpen = true;
}

const panelLevel = (element) => Number(element?.closest('.popup-menu')?.dataset.level ?? 0);

/** Closes the panels from `level` on (the group rows that opened them are no longer open). */
function closeSubmenus(level) {
  if (menuPanels.length <= level) return;
  for (const panel of menuPanels.splice(level)) {
    panel.el.remove();
    panel.row?.classList.remove('open');
    panel.row?.setAttribute('aria-expanded', 'false');
  }
  layoutMenus();
}

/** Opens a group row's items beside it: right of its panel, or left when the screen ends there. */
function openSubmenu(row, focusFirst = false) {
  const level = panelLevel(row);
  const parent = menuPanels[level];
  const item = parent?.items[Number(row.dataset.index)];
  if (!item?.children?.length || row.disabled) return false;
  if (menuPanels[level + 1]?.row !== row) {
    // The first panel's place on the screen, from where the host really put it.
    if (level === 0 && menuPanels.length === 1) {
      const origin = menuOrigin();
      parent.x = origin.x + parseFloat(parent.el.style.left);
      parent.y = origin.y + parseFloat(parent.el.style.top);
    }
    closeSubmenus(level + 1);
    const panel = addMenuPanel(item.children, level + 1, item.label);
    panel.el.style.visibility = 'hidden';
    const bounds = menuBounds();
    const rowTop = parent.y + (row.getBoundingClientRect().top - parent.el.getBoundingClientRect().top);
    let x = parent.x + parent.w + 2;
    if (x + panel.w > bounds.right) x = parent.x - panel.w - 2;
    let y = rowTop - 7;
    if (y + panel.h > bounds.bottom) y = bounds.bottom - panel.h;
    Object.assign(panel, { row, x: Math.max(bounds.left, x), y: Math.max(bounds.top, y) });
    menuPanels.push(panel);
    row.classList.add('open');
    row.setAttribute('aria-expanded', 'true');
    layoutMenus();
  }
  if (focusFirst) menuPanels[level + 1].el.querySelector('.menu-item:not([disabled])')?.focus();
  return true;
}

let menuOpen = false;
const loadedAt = Date.now();
function shownOnce() {
  const at = Number(P().at) || 0;
  return at >= loadedAt - 60_000;
}
async function chooseMenu(id, row = null) {
  if (!menuOpen) return;
  const item = row ?? (id ? root.querySelector(`.menu-item[data-id="${CSS.escape(id)}"]`) : null);
  // A group opens beside its row and the menu stays.
  if (item?.classList.contains('has-sub') && openSubmenu(item, true)) return;
  menuOpen = false;
  clearTimeout(menuTimer);
  // A group without its items (should not happen): the host opens them in a menu just right of the row.
  if (item?.classList.contains('has-sub')) {
    const rect = item.getBoundingClientRect();
    const origin = menuOrigin();
    return hide({ id, at: { x: origin.x + rect.right + 2, y: origin.y + rect.top - 6, flipY: origin.y + rect.bottom + 6 } });
  }
  await hide({ id });
}

/** ↑ / ↓ within the panel that has the focus (else the innermost one). */
function moveMenuFocus(direction) {
  const panel = document.activeElement?.closest?.('.popup-menu') ?? menuPanels.at(-1)?.el;
  const items = [...(panel?.querySelectorAll('.menu-item:not([disabled])') ?? [])];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement);
  items[(current + direction + items.length) % items.length].focus();
}

/** ← / Esc in a submenu: closes it and gives the focus back to its group row. */
function closeInnermostSubmenu() {
  const level = Math.max(panelLevel(document.activeElement), menuPanels.length - 1);
  if (level < 1 || !menuPanels[level]) return false;
  const row = menuPanels[level].row;
  closeSubmenus(level);
  row?.focus();
  return true;
}

// The pointer resting on a group row opens it; resting on another row of that panel closes the
// open group (later, so that a diagonal move into the submenu does not close it on the way).
root.addEventListener('pointerover', (event) => {
  if (kind !== 'menu' || !menuOpen) return;
  const panel = event.target.closest('.popup-menu');
  if (!panel) return;
  clearTimeout(menuTimer);
  const row = event.target.closest('.menu-item');
  if (!row) return;
  const level = panelLevel(row);
  if (row.classList.contains('has-sub') && !row.disabled) {
    if (menuPanels[level + 1]?.row !== row) menuTimer = setTimeout(() => openSubmenu(row), MENU_OPEN_DELAY);
  } else if (menuPanels.length > level + 1) {
    menuTimer = setTimeout(() => closeSubmenus(level + 1), MENU_CLOSE_DELAY);
  }
});

// A click on the empty space around the panels closes the menu, as a click outside it does.
root.addEventListener('pointerdown', (event) => {
  if (kind === 'menu' && menuOpen && !event.target.closest('.popup-menu')) chooseMenu(null);
});


// ───────────────────────── settings: drawing and defaults

function settingsDiagram() {
  return [
    row('palette', t('settings.diagramTheme'), segmented('diagramTheme', DIAGRAM_THEME_IDS.map((id) => [id, t(`diagramTheme.${id}`)]), s().diagramTheme)),
    row('lineRectilinear', t('settings.defaultLineStyle'), segmented('defaultLineStyle', LINE_STYLES.map((id) => [id, t(`lineStyle.${id}`)]), s().defaultLineStyle)),
    row('font', t('settings.diagramFont'), `<input type="text" data-setting-text="diagramFont" value="${escapeHtml(s().diagramFont)}" placeholder="${escapeHtml(t('style.default'))}" />`),
    row('fontUp', t('settings.diagramFontSize'), numberField('diagramFontSize', s().diagramFontSize, 9, 24, 1, 'px', t('settings.diagramFontSize'))),
    toggle('showGrid', t('action.grid'), 'grid'),
    toggle('showRulers', t('action.rulers'), 'rulers'),
    row('grid', t('settings.gridSize'), segmented('gridSize', GRID_SIZES.map((g) => [String(g), `${g}px`]), String(s().gridSize))),
    toggle('snapToGrid', t('action.snapGrid'), 'snap'),
    toggle('showMinimap', t('action.minimap'), 'minimap'),
    toggle('showShadow', t('action.showShadows'), 'shadow'),
    toggle('showQuickButtons', t('action.quickButtons'), 'quickButtons'),
    toggle('reparentOnDrop', t('settings.reparentOnDrop'), 'umlPackage'),
    toggle('showBottomPanel', t('action.bottomPanel'), 'panelBottom'),
    toggle('autoValidate', t('settings.autoValidate'), 'validate'),
    row('save', t('settings.autoSave'), segmented('autoSaveMinutes', [0, 1, 5, 10, 30].map((m) => [String(m), m ? t('settings.minutes', { n: m }) : t('start.never')]), String(s().autoSaveMinutes))),
  ].join('');
}

// ───────────────────────── print preview

/** Number of diagrams in a project. */
function diagramCount(project) {
  let count = 0;
  const visit = (element) => {
    if (/Diagram$/.test(element?._type ?? '')) count += 1;
    for (const value of Object.values(element ?? {})) if (Array.isArray(value)) for (const child of value) if (child && typeof child === 'object' && child._type && !/View$/.test(child._type)) visit(child);
  };
  visit(project);
  return count;
}

let printMeasure = null;
function printDoc() {
  if (!state.printData) state.printData = normalizeProject(P().doc ?? { _type: 'Project', ownedElements: [] });
  return state.printData;
}

function printSetup() {
  if (!state.print) state.print = { ...defaultPrintOptions(), ...(P().setup ?? {}), range: 'all' };
  return state.print;
}

function printLayout() {
  printMeasure ??= canvasMeasure();
  return renderPrintSheets(printDoc(), printSetup(), { measure: printMeasure, currentPageId: P().currentPageId, language: L(), t, theme: P().theme, lineStyle: P().lineStyle });
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
  const count = diagramCount(printDoc());
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
          row('edit', t('print.footerText'), `<input type="text" data-print-text="footerText" value="${escapeHtml(options.footerText)}" placeholder="MyUMLMaker" title="${escapeHtml(t('print.footerText'))}" />`),
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
    if (window.__myumlmakerPrintHook) window.__myumlmakerPrintHook(printLayout());
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

// ───────────────────────── diagram background (the editor panel has the same controls: ui/diagram-background.js)

function renderBackground() {
  const p = P();
  if (!state.draft) {
    state.draft = { fields: { ...(p.fields ?? {}) }, hasImage: Boolean(p.hasImage), image: '', preview: null };
    // The drawing and the picture come by message (too big for the popup parameters).
    action('background-request');
  }
  const d = state.draft;
  const values = { ...d.fields, backgroundImage: d.hasImage ? d.image || (p.hasImage ? 'data:image/png;base64,' : '') : '' };
  root.innerHTML = frame({
    glyph: 'diagramBackground', title: t('bg.title'),
    body: `<div class="bg-editor">
      <div class="editor bg-form">${backgroundControlsHtml(values, { t, theme: p.theme, row: (label, control, cls = '', glyph = 'dot') => row(glyph, label, control, label, cls) })}</div>
      <figure class="bg-preview-box"><figcaption>${icon('eye')}<span>${escapeHtml(t('bg.preview'))}</span><span class="muted" title="${escapeHtml(p.name ?? '')}">${escapeHtml(p.name ?? '')}</span></figcaption><div class="bg-preview">${backgroundPreviewSvg()}</div></figure>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('background-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

/** The diagram drawn over the draft background (transparent parts show the checkerboard behind). */
function backgroundPreviewSvg() {
  const d = state.draft;
  const preview = d?.preview;
  if (!preview?.svg) return `<span class="muted">${icon('info')}</span>`;
  const palette = DIAGRAM_THEMES[P().theme] ?? DIAGRAM_THEMES.classic;
  const b = preview.bounds;
  const bg = diagramBackground({ ...d.fields, backgroundImage: d.hasImage ? d.image : '' }, palette);
  const back = bg ? backgroundLayers(bg, b, { id: 'preview-bg' }) : `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${escapeHtml(palette.background)}"/>`;
  const inner = preview.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">${back}${inner}</svg>`;
}

function setBackgroundDraft(key, raw, { redraw = true } = {}) {
  const d = state.draft;
  if (!d) return;
  d.fields[key] = backgroundValue(key, raw);
  if (redraw) render();
  else { const box = root.querySelector('.bg-preview'); if (box) box.innerHTML = backgroundPreviewSvg(); }
}

// ───────────────────────── find (elements by name, documentation, type)

const draftToggle = (key, label, glyph, checked) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-draft-toggle="${key}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);

function renderFind() {
  const p = P();
  if (!state.draft) state.draft = { text: p.query ?? '', matchCase: false, whole: false, documentation: true, results: null };
  const d = state.draft;
  const results = d.results;
  const list = results === null ? `<div class="muted find-hint">${icon('info')}<span>${escapeHtml(t('find.hint'))}</span></div>`
    : results.length ? `<div class="result-list">${results.map((r) => `<button class="result-row" data-action="find-select" data-value="${escapeHtml(r.id)}" title="${escapeHtml(r.path)}">${icon(r.icon)}<b>${escapeHtml(r.name)}</b><span class="muted">${escapeHtml(r.type)}</span><span class="path">${escapeHtml(r.path)}</span></button>`).join('')}</div>`
      : `<div class="muted find-hint">${icon('info')}<span>${escapeHtml(t('find.notFound'))}</span></div>`;
  root.innerHTML = frame({
    glyph: 'search', title: t('find.title'),
    body: `<div class="editor find-editor">
      ${row('search', t('find.what'), `<input type="text" data-draft="text" value="${escapeHtml(d.text)}" aria-label="${escapeHtml(t('find.what'))}" autofocus />`)}
      ${row('filter', t('find.options'), ['matchCase', 'whole', 'documentation'].map((k) => `<label class="check-row inline"><input type="checkbox" data-draft-toggle="${k}" ${d[k] ? 'checked' : ''} /><span>${escapeHtml(t(`find.${k}`))}</span></label>`).join(''))}
      <div class="row"><span class="muted">${results ? escapeHtml(t('find.count', { count: results.length })) : ''}</span></div>
      ${list}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.close'), 'close')}${button('find-run', t('find.run'), 'search', 'primary')}`,
  });
  const input = root.querySelector('[data-draft="text"]');
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
  ready();
}

// ───────────────────────── validation results (and other element lists)

function renderValidation() {
  const p = P();
  const problems = p.problems ?? [];
  const [items, pager] = paged('problems', problems, 11);
  const counts = { error: problems.filter((x) => x.severity === 'error').length, warning: problems.filter((x) => x.severity === 'warning').length };
  root.innerHTML = frame({
    glyph: 'validate', title: p.title ?? t('action.validate'),
    body: `<div class="editor">
      <div class="row badges"><span class="badge error">${icon('error')}<span>${escapeHtml(t('validation.errors', { count: counts.error }))}</span></span><span class="badge warning">${icon('warning')}<span>${escapeHtml(t('validation.warnings', { count: counts.warning }))}</span></span><span class="muted">${escapeHtml(t('validation.total', { count: problems.length }))}</span></div>
      <div class="result-list">${items.map((x) => `<button class="result-row ${x.severity}" data-action="validation-select" data-value="${escapeHtml(x.id ?? '')}" ${x.id ? '' : 'disabled'} title="${escapeHtml(x.name ?? '')}">${icon(x.severity === 'error' ? 'error' : x.severity === 'warning' ? 'warning' : 'info')}<b>${escapeHtml(x.name || x.rule || '')}</b><span>${escapeHtml(x.message?.[L()] ?? x.message?.en ?? '')}</span></button>`).join('')}</div>
    </div>`,
    foot: `${pager}<span class="grow"></span>${button('close', t('common.close'), 'close', 'primary')}`,
  });
  ready();
}

// ───────────────────────── requirements list (Model › Requirements)

const REQ_COLUMNS = [
  ['reqId', 'req.col.id'], ['name', 'req.col.name'], ['kind', 'req.col.kind'], ['status', 'req.col.status'], ['priority', 'req.col.priority'], ['risk', 'req.col.risk'],
  ['verifyMethod', 'req.col.verify'], ['satisfiedBy', 'req.col.satisfied'], ['verifiedBy', 'req.col.verified'], ['derivedFrom', 'req.col.derived'],
];
/** Sort ranks of the ordered attributes (high before low, proposed before verified …). */
const REQ_RANK = {
  priority: REQUIREMENT_PRIORITIES, status: REQUIREMENT_STATUSES, risk: ['high', 'medium', 'low', ''], kind: REQUIREMENT_KINDS,
};
const enumText = (value) => (value ? t(`enum.${value}`, null, value) : '—');
const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function requirementsShown() {
  const d = state.draft;
  const query = String(d.text ?? '').trim().toLowerCase();
  const rows = (state.reqRows ?? P().rows ?? []).filter((r) => (!d.status || r.status === d.status) && (!d.priority || r.priority === d.priority)
    && (!query || [r.reqId, r.name, r.text, r.path].some((x) => String(x ?? '').toLowerCase().includes(query))));
  const key = d.sort;
  const rank = REQ_RANK[key];
  const cmp = (a, b) => {
    if (typeof a[key] === 'number') return a[key] - b[key];
    if (rank) return rank.indexOf(a[key] ?? '') - rank.indexOf(b[key] ?? '');
    return naturalOrder.compare(String(a[key] ?? ''), String(b[key] ?? ''));
  };
  return [...rows].sort((a, b) => (d.desc ? -1 : 1) * cmp(a, b) || naturalOrder.compare(a.reqId, b.reqId));
}

function renderRequirements() {
  if (!state.draft) state.draft = { text: '', status: '', priority: '', sort: 'reqId', desc: false };
  const d = state.draft;
  const all = state.reqRows ?? P().rows ?? [];
  const shown = requirementsShown();
  const [items, pager] = paged('requirements', shown, 13);
  const head = REQ_COLUMNS.map(([key, label]) => `<th class="${typeof all[0]?.[key] === 'number' ? 'num' : ''}"><button class="sort-head ${d.sort === key ? 'active' : ''}" data-action="req-sort" data-value="${key}" title="${escapeHtml(t('req.sortBy', { name: t(label) }))}">${escapeHtml(t(label))}${d.sort === key ? icon(d.desc ? 'chevronDown' : 'chevronUp', 'icon tiny') : ''}</button></th>`).join('');
  const pick = (r, key, options) => `<select data-req-field="${key}" data-id="${escapeHtml(r.id)}" title="${escapeHtml(t(`field.${key}`))}" aria-label="${escapeHtml(t(`field.${key}`))}">${options.map((o) => `<option value="${o}" ${r[key] === o ? 'selected' : ''}>${escapeHtml(enumText(o))}</option>`).join('')}</select>`;
  const count = (n, warn) => `<td class="num ${warn && !n ? 'missing' : ''}" ${warn && !n ? `title="${escapeHtml(t('req.uncovered'))}"` : ''}>${n}</td>`;
  const body = items.map((r) => {
    const committed = COMMITTED_STATUSES.includes(r.status) && !r.children;
    return `<tr class="status-${escapeHtml(r.status)}">
      <td><button class="req-link" data-action="req-select" data-value="${escapeHtml(r.id)}" title="${escapeHtml(t('req.reveal', { name: r.path }))}">${escapeHtml(r.reqId || '—')}</button></td>
      <td class="req-name" title="${escapeHtml(r.text ? `${r.name}\n${r.text}` : r.name)}">${escapeHtml(r.name)}</td>
      <td>${escapeHtml(enumText(r.kind))}</td><td>${pick(r, 'status', REQUIREMENT_STATUSES)}</td><td>${pick(r, 'priority', REQUIREMENT_PRIORITIES)}</td>
      <td>${escapeHtml(enumText(r.risk))}</td><td>${escapeHtml(enumText(r.verifyMethod))}</td>
      ${count(r.satisfiedBy, committed)}${count(r.verifiedBy, committed)}${count(r.derivedFrom, false)}
    </tr>`;
  }).join('');
  const choice = (key, options, label) => select('data-draft-select', key, [['', label], ...options.map((o) => [o, enumText(o)])], d[key], label);
  root.innerHTML = frame({
    glyph: 'sysmlRequirement', title: t('action.requirements'),
    body: `<div class="editor req-editor">
      <div class="req-filters">
        <span class="req-search">${icon('search')}<input type="text" data-draft="text" value="${escapeHtml(d.text)}" placeholder="${escapeHtml(t('req.filterText'))}" aria-label="${escapeHtml(t('req.filterText'))}" /></span>
        ${choice('status', REQUIREMENT_STATUSES, t('req.anyStatus'))}${choice('priority', REQUIREMENT_PRIORITIES, t('req.anyPriority'))}
        <span class="grow"></span><span class="muted">${escapeHtml(t('req.count', { shown: shown.length, count: all.length }))}</span>
      </div>
      ${all.length ? `<table class="req-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` : `<div class="muted find-hint">${icon('info')}<span>${escapeHtml(t('req.empty'))}</span></div>`}
    </div>`,
    foot: `${pager}<span class="grow"></span>${button('req-export', t('req.exportCsv'), 'csvFile', '', '', all.length ? '' : 'disabled')}${button('close', t('common.close'), 'close', 'primary')}`,
  });
  ready();
}

function exportRequirementsCsv() {
  const text = requirementsCsv(requirementsShown(), { language: L(), label: (v) => t(`enum.${v}`, null, v) });
  return action('save-csv', { name: `${t('action.requirements')}.csv`, text });
}

// ───────────────────────── relationship matrix (Model › Traceability Matrix)

const TRACE_ROWS = 14;
const TRACE_COLS = 14;

function traceOptionsHtml(o, p) {
  const types = [['', t('trace.anyType')], ...(p.elementTypes ?? []).map((x) => [x.type, `${x.label} (${x.count})`])];
  const scopes = [['', t('trace.wholeProject')], ...(p.scopes ?? []).map((x) => [x.id, x.path || x.name])];
  const rels = [['', t('trace.allRelations')], ...(p.relationTypes ?? []).map((x) => [x.type, x.label])];
  const sel = (key, options, label) => `<select data-trace="${key}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(o[key] ?? '') === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
  return `<div class="trace-options">
    <span class="trace-label">${icon('list')}${escapeHtml(t('trace.source'))}</span>${sel('sourceType', types, t('trace.sourceType'))}${sel('sourceScope', scopes, t('trace.sourceScope'))}
    <button class="icon-button" data-action="trace-swap" title="${escapeHtml(t('trace.swap'))}" aria-label="${escapeHtml(t('trace.swap'))}">${icon('viewSwitch')}</button>
    <span class="trace-label">${icon('columns')}${escapeHtml(t('trace.target'))}</span>${sel('targetType', types, t('trace.targetType'))}${sel('targetScope', scopes, t('trace.targetScope'))}
  </div>
  <div class="trace-options">
    <span class="trace-label">${icon('link')}${escapeHtml(t('trace.relation'))}</span>${sel('relationType', rels, t('trace.relation'))}
    <span class="trace-label">${icon('plus')}${escapeHtml(t('trace.createAs'))}</span>${segmented('direction', [['rowToCol', t('trace.rowToCol')], ['colToRow', t('trace.colToRow')]], o.direction ?? 'rowToCol', 'data-trace-segment')}
  </div>`;
}

function renderTraceMatrix() {
  const p = P();
  const o = state.traceOptions ?? p.options ?? {};
  state.traceOptions = o;
  const m = state.traceMatrix ?? p.matrix ?? { rows: [], cols: [], cells: {}, emptyRows: [], emptyCols: [], total: 0 };
  state.traceMatrix = m;
  const [rows, rowPager] = paged('traceRows', m.rows, TRACE_ROWS);
  const [cols, colPager] = paged('traceCols', m.cols, TRACE_COLS);
  const typeName = (type) => (p.relationTypes ?? []).find((x) => x.type === type)?.label ?? type;
  const empty = new Set(m.emptyRows);
  const canEdit = Boolean(o.relationType);
  const head = `<tr><th class="corner">${escapeHtml(t('trace.corner'))}</th>${cols.map((c) => `<th class="col-head ${c.count ? '' : 'empty'}" title="${escapeHtml(`${c.label}\n${c.path}`)}"><button class="trace-head" data-action="req-select" data-value="${escapeHtml(c.id)}"><span>${escapeHtml(c.label)}</span></button></th>`).join('')}<th class="sum">Σ</th></tr>`;
  const body = rows.map((r) => `<tr class="${empty.has(r.id) ? 'empty-row' : ''}"><th class="row-head" title="${escapeHtml(`${r.label}\n${r.path}`)}"><button class="trace-head" data-action="req-select" data-value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</button></th>${cols.map((c) => {
    const list = m.cells[`${r.id}|${c.id}`] ?? [];
    const tip = list.length ? list.map((x) => `${x.arrow} ${typeName(x.type)}`).join('\n') : canEdit ? t('trace.cellCreate', { type: typeName(o.relationType) }) : t('trace.pickType');
    return `<td class="cell ${list.length ? 'filled' : ''}"><button data-action="trace-cell" data-row="${escapeHtml(r.id)}" data-col="${escapeHtml(c.id)}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(`${r.label} / ${c.label}: ${tip}`)}" ${canEdit ? '' : 'aria-disabled="true"'}>${escapeHtml([...new Set(list.map((x) => x.arrow))].join(''))}</button></td>`;
  }).join('')}<td class="sum">${r.count}</td></tr>`).join('');
  const foot = `<tr><th class="row-head sum">Σ</th>${cols.map((c) => `<td class="sum ${c.count ? '' : 'empty'}">${c.count}</td>`).join('')}<td class="sum">${m.total}</td></tr>`;
  const grid = m.rows.length && m.cols.length ? `<div class="trace-grid"><table class="trace-table"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>` : `<div class="muted find-hint">${icon('info')}<span>${escapeHtml(t('trace.none'))}</span></div>`;
  root.innerHTML = frame({
    glyph: 'table', title: t('action.traceMatrix'),
    body: `<div class="editor trace-editor">
      ${traceOptionsHtml(o, p)}
      <div class="trace-status"><span class="muted">${escapeHtml(t('trace.legend'))}</span><span class="grow"></span><span class="badge ${m.emptyRows.length ? 'warn' : 'ok'}">${escapeHtml(t('trace.emptyRows', { count: m.emptyRows.length, total: m.rows.length }))}</span></div>
      ${grid}
    </div>`,
    foot: `${rowPager ? `<span class="trace-pager">${icon('list', 'icon tiny')}${rowPager}</span>` : ''}${colPager ? `<span class="trace-pager">${icon('columns', 'icon tiny')}${colPager}</span>` : ''}<span class="grow"></span>${button('trace-copy', t('trace.copy'), 'copy', '', '', m.rows.length ? '' : 'disabled')}${button('trace-export', t('req.exportCsv'), 'csvFile', '', '', m.rows.length ? '' : 'disabled')}${button('close', t('common.close'), 'close', 'primary')}`,
  });
  ready();
}

function runTrace(patch) {
  state.traceOptions = { ...state.traceOptions, ...patch };
  state.pager.traceRows = 0;
  state.pager.traceCols = 0;
  render();
  return action('trace-run', { options: state.traceOptions });
}

// ───────────────────────── code generation

function renderCodegen() {
  const p = P();
  if (!state.draft) {
    const language = p.language ?? 'java';
    state.draft = { language, scope: p.root ? 'selection' : 'all', target: p.desktop ? 'folder' : 'zip', options: { ...(p.defaults?.[language] ?? {}), ...(p.options?.[language] ?? {}) }, preview: null };
    action('codegen-preview', { language, options: state.draft.options, scope: state.draft.scope, rootId: p.root?.id });
  }
  const d = state.draft;
  const opts = d.options;
  const optionRows = Object.entries(p.defaults?.[d.language] ?? {}).map(([key, def]) => {
    const label = t(`codegen.option.${key}`, null, key);
    if (typeof def === 'boolean') return draftToggle(`option:${key}`, label, 'check', Boolean(opts[key]));
    if (key === 'dialect') return row('database', label, select('data-draft-select', 'option:dialect', (p.dialects ?? []).map((x) => [x.id, x.name]), opts.dialect, label));
    if (typeof def === 'number') return row('ruler', label, `<input type="number" min="1" max="8" data-draft-option="${key}" value="${escapeHtml(opts[key] ?? def)}" />`);
    return row('edit', label, `<input type="text" data-draft-option="${key}" value="${escapeHtml(opts[key] ?? '')}" />`);
  }).join('');
  const preview = d.preview;
  const files = preview?.files ?? [];
  state.previewIndex = Math.min(state.previewIndex ?? 0, Math.max(0, files.length - 1));
  const shown = files[state.previewIndex];
  root.innerHTML = frame({
    glyph: 'generateCode', title: t('codegen.title'),
    body: `<div class="codegen">
      <div class="codegen-options editor">
        ${row('generateCode', t('codegen.language'), select('data-draft-select', 'language', (p.languages ?? []).map((l) => [l.id, l.name]), d.language, t('codegen.language')))}
        ${row('umlPackage', t('codegen.scope'), segmented('scope', [['all', t('codegen.scopeAll')], ...(p.root ? [['selection', p.root.name]] : [])], d.scope, 'data-draft-segment'))}
        ${p.desktop ? row('folderOpen', t('codegen.target'), segmented('target', [['folder', t('codegen.targetFolder')], ['zip', t('codegen.targetZip')]], d.target, 'data-draft-segment')) : ''}
        ${optionRows}
      </div>
      <div class="codegen-preview">
        <div class="preview-files">${files.length ? `<select data-preview-file>${files.map((f, i) => `<option value="${i}" ${i === state.previewIndex ? 'selected' : ''}>${escapeHtml(f.path)}</option>`).join('')}</select><span class="muted">${escapeHtml(t('codegen.fileCount', { count: files.length }))}</span>` : `<span class="muted">${escapeHtml(preview?.error ?? (preview ? t('codegen.nothing') : t('codegen.previewing')))}</span>`}</div>
        <pre class="code-preview">${escapeHtml(shown?.content ?? '')}</pre>
      </div>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('codegen-apply', t('codegen.generate'), 'generateCode', 'primary', '', files.length ? '' : 'disabled')}`,
  });
  ready();
}

function codegenPreview() {
  const d = state.draft;
  action('codegen-preview', { language: d.language, options: d.options, scope: d.scope, rootId: P().root?.id });
}

// ───────────────────────── text import (Mermaid, PlantUML)

const TEXT_SAMPLES = {
  mermaid: {
    class: 'classDiagram\n  class Animal {\n    <<abstract>>\n    +String name\n    +speak() String\n  }\n  class Dog\n  class Owner\n  Animal <|-- Dog\n  Owner "1" o-- "*" Dog : pets',
    sequence: 'sequenceDiagram\n  actor User\n  participant Web\n  participant API\n  User->>Web: open page\n  Web->>API: GET /items\n  API-->>Web: items\n  alt empty\n    Web-->>User: show hint\n  else\n    Web-->>User: show list\n  end',
    flowchart: 'flowchart TD\n  A([Start]) --> B[Read input]\n  B --> C{Valid?}\n  C -- yes --> D[(Save)]\n  C -- no --> B\n  D --> E([End])',
    er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE : contains\n  CUSTOMER {\n    int id PK\n    string name\n  }\n  ORDER {\n    int id PK\n    int customer_id FK\n  }',
    state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running : start\n  Running --> Idle : stop\n  Running --> [*] : quit',
  },
  plantuml: {
    class: '@startuml\npackage shapes {\n  abstract class Shape {\n    - name : String\n    {abstract} + area() : double\n  }\n  class Circle {\n    - radius : double\n  }\n  interface Drawable\n  enum Color {\n    RED\n    GREEN\n  }\n}\nclass Canvas\nShape <|-- Circle\nDrawable <|.. Shape\nCanvas "1" *-- "0..*" Shape : contains >\nShape ..> Color\nnote right of Canvas : draws shapes\n@enduml',
    object: '@startuml\nobject "kim : Customer" as kim {\n  name = "Kim"\n}\nobject "order1 : Order" as order1 {\n  total = 120\n}\nmap Stock {\n  apples => 10\n  pears => 4\n}\nkim --> order1 : places\norder1 ..> Stock\n@enduml',
    usecase: '@startuml\nleft to right direction\nactor Customer\nactor :Bank Clerk: as Clerk\nrectangle ATM {\n  usecase "Withdraw Cash" as UC1\n  (Check Balance) as UC2\n  (Authenticate)\n}\nCustomer --> UC1\nCustomer --> UC2\nClerk --> UC2\nUC1 ..> (Authenticate) : <<include>>\nUC2 ..> (Authenticate) : <<include>>\n@enduml',
    sequence: '@startuml\nautonumber\nactor User\nparticipant "Web App" as Web\ndatabase DB\nUser -> Web : login(id)\nactivate Web\nWeb -> DB : find user\nDB --> Web : row\nalt found\n  Web --> User : token\nelse missing\n  Web --> User : error\nend\ndeactivate Web\nnote over User, Web : HTTPS\n@enduml',
    activity: '@startuml\n|Customer|\nstart\n:Choose items;\n|Shop|\nif (In stock?) then (yes)\n  fork\n    :Charge card;\n  fork again\n    :Pack items;\n  end fork\n  :Ship;\nelse (no)\n  :Apologise;\nendif\nwhile (More orders?) is (yes)\n  :Process next;\nendwhile (no)\nstop\n@enduml',
    state: '@startuml\n[*] --> Idle\nstate Running {\n  [*] --> Working\n  Working --> Paused : pause\n  Paused --> Working : resume\n}\nIdle --> Running : start [ready] / init()\nRunning --> Idle : stop\nRunning : entry / lock()\nstate check <<choice>>\nRunning --> check : done\ncheck --> [*] : [ok]\ncheck --> Idle : [retry]\n@enduml',
    component: '@startuml\npackage "Front End" {\n  [Web UI] as UI\n}\ncomponent Orders {\n  port api\n}\ninterface REST\ndatabase "Orders DB" as DB\nOrders - REST\nUI ..> REST : use\nOrders --> DB\n@enduml',
    deployment: '@startuml\nnode "Web Server" as web <<device>> {\n  node Tomcat <<executionEnvironment>> {\n    artifact "shop.war" as war\n  }\n}\nnode "DB Server" as dbs {\n  database PostgreSQL\n}\nweb -- dbs : JDBC\n@enduml',
    timing: '@startuml\nrobust "Web Browser" as WB\nconcise "Web User" as WU\nWB has Idle,Processing,Waiting\n@0\nWU is Idle\nWB is Idle\n@100\nWU is Waiting\nWB is Processing\n@300\nWB is Waiting\nWB -> WU : page\n@400\nWU is Idle\nWB@100 <-> @300 : {200 ms}\n@enduml',
    er: '@startuml\nentity Customer {\n  *id : int\n  --\n  *name : varchar(80)\n  email : varchar(120)\n}\nentity Order {\n  *id : int\n  --\n  *customer_id : int <<FK>>\n  total : decimal\n}\nCustomer ||--o{ Order : places\n@enduml',
    mindmap: '@startmindmap\n* Shop launch\n** Products\n*** Catalogue\n*** Pricing\n** Marketing\nleft side\n** Risks\n*** Payment outage\n@endmindmap',
    // Beyond UML: Gantt, WBS, chronology, ArchiMate, nwdiag, JSON, YAML, EBNF, regex, Salt.
    ...PLANTUML_MORE_EXAMPLES,
  },
};

function renderTextImport() {
  const p = P();
  if (!state.draft) state.draft = { format: p.format ?? 'mermaid', text: p.text ?? '' };
  const d = state.draft;
  const samples = TEXT_SAMPLES[d.format] ?? {};
  root.innerHTML = frame({
    glyph: 'mermaid', title: t('textImport.title'),
    body: `<div class="editor text-import">
      ${row('mermaid', t('textImport.format'), segmented('format', [['mermaid', 'Mermaid'], ['plantuml', 'PlantUML']], d.format, 'data-draft-segment'))}
      ${row('samples', t('textImport.samples'), `<select data-text-sample title="${escapeHtml(t('textImport.samples'))}" aria-label="${escapeHtml(t('textImport.samples'))}"><option value="">${escapeHtml(t('textImport.samplePick'))}</option>${Object.keys(samples).map((k) => `<option value="${k}">${escapeHtml(t(`textImport.sample.${k}`))}</option>`).join('')}</select>`)}
      <textarea class="code-input" data-draft="text" spellcheck="false" placeholder="${escapeHtml(t(d.format === 'plantuml' ? 'textImport.placeholderPlantUml' : 'textImport.placeholder'))}">${escapeHtml(d.text)}</textarea>
      <p class="muted">${escapeHtml(t(d.format === 'plantuml' ? 'textImport.hintPlantUml' : 'textImport.hint'))}</p>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('text-apply', t('textImport.import'), 'importFile', 'primary', '', d.text.trim() ? '' : 'disabled')}`,
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
    <small class="muted">${escapeHtml(t('color.soft'))}</small><div class="color-grid6">${['#fff2cc', '#dae8fc', '#d5e8d4', '#f8cecc', '#e1d5e7', '#ffe6cc', '#f5f5f5', '#fce4ec', '#e0f7fa', '#f1f8e9', '#ede7f6', '#fff8e1'].map(sw).join('')}</div>
    <small class="muted">${escapeHtml(t('color.standard'))}</small><div class="color-grid6">${['#000000', '#404040', '#7f7f7f', '#bfbfbf', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0', '#d6336c', '#795548', '#1f4e79'].map(sw).join('')}</div>
    <div class="color-foot"><button class="small-button" data-pick-color="" title="${escapeHtml(t('style.default'))}">${icon('refresh')}<span>${escapeHtml(t('style.default'))}</span></button>${p.allowNone ? `<button class="small-button" data-pick-color="none" title="${escapeHtml(t('color.none'))}">${icon('close')}<span>${escapeHtml(t('color.none'))}</span></button>` : ''}<label class="small-button" title="${escapeHtml(t('color.custom'))}">${icon('fillColor')}<span>${escapeHtml(t('color.custom'))}</span><input type="color" data-color-custom value="${escapeHtml(/^#[0-9a-f]{6}$/i.test(p.current ?? '') ? p.current : '#4472c4')}" /></label></div>
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

// ───────────────────────── generate document (templates → Word, PDF, HTML)

const DOC_FORMATS = [['docx', 'Word (.docx)', 'reportWord'], ['pdf', 'PDF', 'reportPdf'], ['html', 'HTML', 'reportHtml']];
function docSectionsOf(template) {
  const def = REPORT_TEMPLATES[template] ?? REPORT_TEMPLATES.full;
  return Object.fromEntries(REPORT_SECTIONS.map((section) => [section, def.sections.includes(section)]));
}

function renderDocument() {
  const p = P();
  if (!state.draft) {
    const last = p.last ?? {};
    const template = REPORT_TEMPLATES[last.template] ? last.template : 'full';
    state.draft = {
      scope: p.root ? 'selection' : 'all', template, sections: { ...docSectionsOf(template), ...(last.template === template ? last.sections ?? {} : {}) },
      language: last.language ?? (L() === 'en' ? 'en' : 'ko'), format: last.format ?? 'docx',
      title: p.title ?? '', author: p.author ?? '', version: p.version ?? '', date: p.date ?? '',
    };
  }
  const d = state.draft;
  const text = (key, label) => `<input type="text" data-doc-text="${key}" value="${escapeHtml(d[key])}" aria-label="${escapeHtml(label)}" spellcheck="false" />`;
  const checks = REPORT_SECTIONS.map((section) => `<label class="check-row inline"><input type="checkbox" data-doc-section="${section}" ${d.sections[section] ? 'checked' : ''} /><span>${escapeHtml(t(`report.section.${section}`))}</span></label>`).join('');
  root.innerHTML = frame({
    glyph: 'reportWord', title: t('report.title'),
    body: `<div class="editor document-editor">
      ${row('umlPackage', t('report.scope'), segmented('scope', [['all', t('report.scopeAll')], ...(p.root ? [['selection', p.root.name]] : [])], d.scope, 'data-doc-seg'))}
      ${row('template', t('report.template'), select('data-doc-select', 'template', REPORT_TEMPLATE_IDS.map((id) => [id, t(`report.template.${id}`)]), d.template, t('report.template')))}
      ${row('list', t('report.sections'), `<span class="doc-sections">${checks}</span>`)}
      ${row('globe', t('report.language'), segmented('language', [['ko', '한국어'], ['en', 'English']], d.language, 'data-doc-seg'))}
      ${row('file', t('report.format'), segmented('format', DOC_FORMATS, d.format, 'data-doc-seg'))}
      ${row('edit', t('report.docTitle'), text('title', t('report.docTitle')))}
      ${row('user', t('report.author'), text('author', t('report.author')))}
      ${row('tag', t('report.version'), text('version', t('report.version')))}
      ${row('calendar', t('report.date'), text('date', t('report.date')))}
      ${row('info', '', `<span class="muted">${escapeHtml(t('report.hint'))}</span>`)}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}<button class="button primary" data-doc-action="generate" title="${escapeHtml(t('report.generate'))}">${icon(DOC_FORMATS.find((f) => f[0] === d.format)?.[2] ?? 'reportWord')}<span>${escapeHtml(t('report.generate'))}</span></button>`,
  });
  ready();
}

// ───────────────────────── baselines

function renderBaselines() {
  const p = P();
  if (!state.draft) state.draft = { name: '', note: '', scope: 'all' };
  const d = state.draft;
  const items = (state.baselineItems?.for === p ? state.baselineItems.items : null) ?? p.baselines ?? [];
  const when = (iso) => { try { return new Date(iso).toLocaleString(L() === 'en' ? 'en-US' : 'ko-KR'); } catch { return iso; } };
  const iconButton = (act, id, glyph, label) => `<button class="icon-button" data-bl-action="${act}" data-value="${escapeHtml(id)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(glyph)}</button>`;
  const list = items.length ? `<div class="result-list baseline-list">${items.map((b) => `<div class="result-row baseline-row" title="${escapeHtml(b.note || b.name)}">${icon('clock')}<b>${escapeHtml(b.name)}</b><span class="muted">${escapeHtml(`${when(b.date)} · ${b.scopeName} · ${t('baseline.elements', { count: b.elements ?? 0 })}${b.note ? ` · ${b.note}` : ''}`)}</span><span class="baseline-actions">${iconButton('compare', b._id, 'viewSwitch', t('baseline.compare'))}${iconButton('export', b._id, 'exportFile', t('baseline.export'))}${iconButton('delete', b._id, 'trash', t('baseline.delete'))}</span></div>`).join('')}</div>`
    : `<div class="muted find-hint">${icon('info')}<span>${escapeHtml(t('baseline.none'))}</span></div>`;
  root.innerHTML = frame({
    glyph: 'clock', title: t('baseline.title'),
    body: `<div class="editor baseline-editor">
      ${row('edit', t('baseline.name'), `<input type="text" data-bl-text="name" value="${escapeHtml(d.name)}" placeholder="${escapeHtml(p.suggestedName ?? '')}" aria-label="${escapeHtml(t('baseline.name'))}" />`)}
      ${row('notes', t('baseline.note'), `<input type="text" data-bl-text="note" value="${escapeHtml(d.note)}" aria-label="${escapeHtml(t('baseline.note'))}" />`)}
      ${row('umlPackage', t('baseline.scope'), `${segmented('scope', [['all', t('report.scopeAll')], ...(p.root ? [['selection', p.root.name]] : [])], d.scope, 'data-bl-seg')}<button class="button primary" data-bl-action="create" title="${escapeHtml(t('baseline.create'))}">${icon('plus')}<span>${escapeHtml(t('baseline.create'))}</span></button>`)}
      ${list}
    </div>`,
    foot: `<button class="button" data-bl-action="compare-file" title="${escapeHtml(t('action.compareFile'))}">${icon('folderOpen')}<span>${escapeHtml(t('action.compareFile'))}</span></button><span class="grow"></span>${button('close', t('common.close'), 'close', 'primary')}`,
  });
  ready();
}

// ───────────────────────── compare (baseline or file ↔ current model)

function currentDiff() {
  const p = P();
  return (state.compareDiff?.for === p ? state.compareDiff.diff : null) ?? p.diff ?? { items: [], summary: { added: 0, removed: 0, changed: 0 } };
}
function compareRows() {
  const d = state.draft;
  return diffTree(currentDiff(), { statuses: DIFF_STATUSES.filter((s) => d.show[s]), categories: DIFF_CATEGORIES.filter((c) => d.cats[c]), text: d.text });
}
function compareListHtml() {
  const d = state.draft;
  const rows = compareRows();
  if (!rows.length) return `<div class="muted find-hint">${icon('info')}<span>${escapeHtml(t('compare.none'))}</span></div>`;
  return rows.map((r) => `<button class="result-row cmp-row ${r.status ?? 'context'} ${d.selected === r.id ? 'selected' : ''}" data-cmp-action="select" data-value="${escapeHtml(r.id)}" style="padding-left:${8 + r.depth * 16}px" title="${escapeHtml(r.path ?? r.name)}">${icon(typeDef(r.type)?.icon ?? 'umlClass')}<b>${escapeHtml(r.name || r.typeLabel || '')}</b><span class="muted">${escapeHtml(r.status ? `${t(`compare.status.${r.status}`)}${r.renamed ? ` · ${t('compare.renamed', { name: r.oldName })}` : ''}` : '')}</span></button>`).join('');
}
function compareDetailHtml() {
  const p = P();
  const diff = currentDiff();
  const item = diff.items.find((x) => x.id === state.draft.selected);
  if (!item) return `<div class="muted find-hint">${icon('info')}<span>${escapeHtml(t('compare.pick'))}</span></div>`;
  const field = (key) => t(`compare.field.${key}`, null, key);
  const changes = item.changes.length ? `<table class="cmp-table"><thead><tr><th>${escapeHtml(t('compare.field'))}</th><th>${escapeHtml(t('compare.before'))}</th><th>${escapeHtml(t('compare.after'))}</th></tr></thead><tbody>${item.changes.map((c) => `<tr><td>${escapeHtml(field(c.field))}</td><td>${escapeHtml(c.before)}</td><td>${escapeHtml(c.after)}</td></tr>`).join('')}</tbody></table>` : '';
  const actions = [
    item.status !== 'removed' ? `<button class="button" data-cmp-action="reveal" data-value="${escapeHtml(item.id)}">${icon('goTo')}<span>${escapeHtml(t('compare.reveal'))}</span></button>` : '',
    p.canRestore && item.status !== 'added' ? `<button class="button primary" data-cmp-action="restore" data-value="${escapeHtml(item.id)}">${icon('undo')}<span>${escapeHtml(t('compare.restore'))}</span></button>` : '',
  ].join('');
  return `<div class="cmp-head"><b>${escapeHtml(item.name || item.typeLabel)}</b><span class="badge ${item.status === 'removed' ? 'danger' : item.status === 'added' ? 'ok' : 'warn'}">${escapeHtml(t(`compare.status.${item.status}`))}</span></div>
    <div class="muted">${escapeHtml(`${item.typeLabel} · ${item.path}`)}</div>${changes}<div class="cmp-actions">${actions}</div>`;
}

function renderCompare() {
  const p = P();
  if (!state.draft) state.draft = { show: { added: true, removed: true, changed: true }, cats: Object.fromEntries(DIFF_CATEGORIES.map((c) => [c, true])), text: '', selected: null };
  const d = state.draft;
  const summary = currentDiff()?.summary ?? { added: 0, removed: 0, changed: 0 };
  const chip = (group, key, label) => `<label class="check-row inline"><input type="checkbox" data-cmp-toggle="${group}:${key}" ${d[group][key] ? 'checked' : ''} /><span>${escapeHtml(label)}</span></label>`;
  root.innerHTML = frame({
    glyph: 'viewSwitch', title: t('compare.title', { name: p.name ?? '' }),
    body: `<div class="editor compare-editor">
      <div class="row badges"><span class="badge ok"><span>${escapeHtml(t('compare.added', { count: summary.added }))}</span></span><span class="badge danger"><span>${escapeHtml(t('compare.removed', { count: summary.removed }))}</span></span><span class="badge warn"><span>${escapeHtml(t('compare.changed', { count: summary.changed }))}</span></span><span class="muted">${escapeHtml(p.subtitle ?? '')}</span></div>
      ${row('filter', t('compare.filter'), `${DIFF_STATUSES.map((s) => chip('show', s, t(`compare.status.${s}`))).join('')}${DIFF_CATEGORIES.map((c) => chip('cats', c, t(`compare.category.${c}`))).join('')}`)}
      ${row('search', t('compare.search'), `<input type="text" data-cmp-text value="${escapeHtml(d.text)}" aria-label="${escapeHtml(t('compare.search'))}" />`)}
      <div class="compare-grid"><div class="result-list cmp-list" id="cmp-list">${compareListHtml()}</div><div class="cmp-detail" id="cmp-detail">${compareDetailHtml()}</div></div>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.close'), 'close', 'primary')}`,
  });
  ready();
}

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-doc-seg], [data-doc-action], [data-bl-seg], [data-bl-action], [data-cmp-action]');
  if (!target || target.disabled || !state.draft) return undefined;
  const d = state.draft;
  const value = target.dataset.value;
  if (target.dataset.docSeg) { d[target.dataset.docSeg] = value; return render(); }
  if (target.dataset.docAction === 'generate') return close({ scope: d.scope, template: d.template, sections: d.sections, language: d.language, format: d.format, title: d.title, author: d.author, version: d.version, date: d.date });
  if (target.dataset.blSeg) { d[target.dataset.blSeg] = value; return render(); }
  switch (target.dataset.blAction) {
    case 'create': { const data = { name: d.name, note: d.note, scope: d.scope }; d.name = ''; d.note = ''; return action('baseline-create', data); }
    case 'compare': return close({ action: 'compare', id: value });
    case 'export': return action('baseline-export', { id: value });
    case 'delete': return action('baseline-delete', { id: value });
    case 'compare-file': return close({ action: 'compare-file' });
    default: break;
  }
  switch (target.dataset.cmpAction) {
    case 'select': {
      d.selected = value;
      for (const el of root.querySelectorAll('.cmp-row')) el.classList.toggle('selected', el.dataset.value === value);
      const detail = root.querySelector('#cmp-detail');
      if (detail) detail.innerHTML = compareDetailHtml();
      const item = currentDiff()?.items.find((x) => x.id === value);
      if (item?.status !== 'removed') action('compare-reveal', { id: value });
      return undefined;
    }
    case 'reveal': return action('compare-reveal', { id: value });
    case 'restore': return action('compare-restore', { id: value });
    default: return undefined;
  }
});
root.addEventListener('change', (event) => {
  const target = event.target;
  const d = state.draft;
  if (!d) return undefined;
  // Text import: an example from the list (21 for PlantUML) fills the text box.
  if (target.matches('[data-text-sample]')) { if (target.value) { d.text = TEXT_SAMPLES[d.format][target.value]; return render(); } return undefined; }
  if (target.dataset.docSelect === 'template') { d.template = target.value; d.sections = docSectionsOf(d.template); return render(); }
  if (target.dataset.docSection) { d.sections[target.dataset.docSection] = target.checked; return undefined; }
  if (target.dataset.cmpToggle) { const [group, key] = target.dataset.cmpToggle.split(':'); d[group][key] = target.checked; const list = root.querySelector('#cmp-list'); if (list) list.innerHTML = compareListHtml(); }
  return undefined;
});
root.addEventListener('input', (event) => {
  const target = event.target;
  const d = state.draft;
  if (!d) return;
  if (target.dataset.docText) d[target.dataset.docText] = target.value;
  if (target.dataset.blText) d[target.dataset.blText] = target.value;
  if ('cmpText' in target.dataset) { d.text = target.value; const list = root.querySelector('#cmp-list'); if (list) list.innerHTML = compareListHtml(); }
});
function onReportHostMessage(message) {
  if (message?.type === 'baselines' && kind === 'baselines') { state.baselineItems = { for: P(), items: Array.isArray(message.items) ? message.items : [] }; render(); }
  if (message?.type === 'compare-diff' && kind === 'compare') {
    state.compareDiff = { for: P(), diff: message.diff ?? { items: [], summary: { added: 0, removed: 0, changed: 0 } } };
    if (state.draft && !state.compareDiff.diff.items.some((x) => x.id === state.draft.selected)) state.draft.selected = null;
    render();
  }
}
if (desktop) native.listen('popup-message', onReportHostMessage);
else window.addEventListener('message', (event) => { if (event.origin === location.origin && event.data?.myumlmakerHost) onReportHostMessage(event.data); });

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
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-theme-group], [data-pick-theme], [data-draft-segment], [data-print-segment], [data-draft-swatch], [data-pick-design], [data-pick-quick], [data-pick-color], [data-trace-segment], [data-bg], [data-bg-action]');
  if (!target || target.disabled) return undefined;
  if (kind === 'background' && target.dataset.bg !== undefined) return setBackgroundDraft(target.dataset.bg, target.dataset.value);
  if (kind === 'background' && target.dataset.bgAction) {
    if (target.dataset.bgAction === 'pick') return action('background-pick');
    Object.assign(state.draft, { hasImage: false, image: '' });
    delete state.draft.fields.backgroundImageWidth;
    delete state.draft.fields.backgroundImageHeight;
    return render();
  }
  if (target.dataset.traceSegment) return runTrace({ [target.dataset.traceSegment]: target.dataset.value });
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id, target);
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
    d[key] = value === 'true' ? true : value === 'false' ? false : value;
    if (kind === 'codegen' && key === 'scope') codegenPreview();
    return render();
  }
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
    case 'find-run': return action('find-run', { text: d.text, matchCase: d.matchCase, whole: d.whole, documentation: d.documentation });
    case 'find-select': return action('find-select', { id: value });
    case 'validation-select': return action('validation-select', { id: value });
    case 'req-select': return action('req-select', { id: value });
    case 'req-sort': d.desc = d.sort === value ? !d.desc : false; d.sort = value; return render();
    case 'req-export': return exportRequirementsCsv();
    case 'trace-cell': return action('trace-toggle', { rowId: target.dataset.row, colId: target.dataset.col });
    case 'trace-swap': {
      const o = state.traceOptions ?? {};
      return runTrace({ sourceType: o.targetType, targetType: o.sourceType, sourceScope: o.targetScope, targetScope: o.sourceScope, direction: o.direction === 'colToRow' ? 'rowToCol' : 'colToRow' });
    }
    case 'trace-export': {
      const typeName = (type) => (P().relationTypes ?? []).find((x) => x.type === type)?.label ?? type;
      return action('save-csv', { name: `${t('action.traceMatrix')}.csv`, text: matrixCsv(state.traceMatrix, { language: L(), typeName }) });
    }
    case 'trace-copy':
      try { await copyText(matrixTsv(state.traceMatrix)); return action('notice', { kind: 'success', text: t('trace.copied') }); } catch (error) { return action('notice', { kind: 'error', text: `${t('error.copyFailed')}: ${native.errorText(error)}` }); }
    case 'codegen-apply': return close({ language: d.language, scope: d.scope, target: d.target, options: d.options });
    case 'text-sample': d.text = TEXT_SAMPLES[d.format][value]; return render();
    case 'text-apply': return close({ format: d.format, text: d.text });
    case 'prompt-apply': return close({ value: d.value });
    case 'background-apply': return close({ fields: d.fields, hasImage: d.hasImage });
    default: return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  const d = state.draft;
  if (target.dataset.reqField) return action('req-set', { id: target.dataset.id, key: target.dataset.reqField, value: target.value });
  if (kind === 'background' && target.dataset.bgInput) return setBackgroundDraft(target.dataset.bgInput, target.value);
  if (target.dataset.trace) return runTrace({ [target.dataset.trace]: target.value });
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
    if (key.startsWith('option:')) { d.options[key.slice(7)] = target.checked; codegenPreview(); } else d[key] = target.checked;
    return kind === 'find' ? undefined : render();
  }
  if (target.dataset.draftSelect) {
    const key = target.dataset.draftSelect;
    if (key.startsWith('option:')) { d.options[key.slice(7)] = target.value; codegenPreview(); return render(); }
    d[key] = target.value;
    if (kind === 'codegen' && key === 'language') { const p = P(); d.options = { ...(p.defaults?.[d.language] ?? {}), ...(p.options?.[d.language] ?? {}) }; d.preview = null; state.previewIndex = 0; codegenPreview(); }
    return render();
  }
  if (target.dataset.draftOption) { const key = target.dataset.draftOption; d.options[key] = target.type === 'number' ? Number(target.value) : target.value; codegenPreview(); return undefined; }
  if ('previewFile' in target.dataset) { state.previewIndex = Number(target.value); return render(); }
  if (target.dataset.settingText) return update({ [target.dataset.settingText]: target.value.trim() });
  if (target.dataset.printRange) return changePrint({ range: target.dataset.printRange });
  if (target.dataset.printToggle) return changePrint({ [target.dataset.printToggle]: target.checked });
  if (target.dataset.print) return changePrint({ [target.dataset.print]: target.value });
  if (target.dataset.printText) return changePrint({ [target.dataset.printText]: target.value });
  return undefined;
});

root.addEventListener('input', (event) => {
  const target = event.target;
  // Background sliders, numbers and colours: the preview follows while dragging (the change redraws the controls).
  if (kind === 'background' && target.dataset.bgInput) {
    for (const twin of target.closest('.bg-slider')?.querySelectorAll('input') ?? []) if (twin !== target) twin.value = target.value;
    return setBackgroundDraft(target.dataset.bgInput, target.value, { redraw: false });
  }
  if (target.dataset.draft && state.draft) {
    state.draft[target.dataset.draft] = target.value;
    if (kind === 'textimport') { const btn = root.querySelector('[data-action="text-apply"]'); if (btn) btn.disabled = !target.value.trim(); }
    if (kind === 'requirements') {
      // The list filters as you type; the box keeps focus and caret over the redraw.
      const caret = target.selectionStart;
      state.pager.requirements = 0;
      render();
      const box = root.querySelector('[data-draft="text"]');
      box?.focus();
      box?.setSelectionRange(caret, caret);
    }
  }
  if ('dbPassword' in target.dataset) state.dbPassword = target.value;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    // A menu: Esc closes the innermost open submenu first.
    if (kind === 'menu') { if (!closeInnermostSubmenu()) chooseMenu(null); }
    else if (kind !== 'progress') { if (kind === 'color') colorDone = true; close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null); }
  }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    if (event.key === 'Enter' && document.activeElement?.classList.contains('menu-item')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id, document.activeElement); }
    if (event.key === 'ArrowRight' && document.activeElement?.classList.contains('has-sub')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id, document.activeElement); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); closeInnermostSubmenu(); }
  }
  if (kind === 'print' && event.key === 'PageDown') { state.page += 1; render(); }
  if (kind === 'print' && event.key === 'PageUp') { state.page -= 1; render(); }
  if (event.key === 'Enter' && event.target.matches?.('input[type="text"]') && !event.target.matches('.stepper-value')) {
    const primary = { find: 'find-run', prompt: 'prompt-apply' }[kind];
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

/**
 * The main window (undecorated) can take the activation back by itself right after a dropdown got it.
 * Such a loss of focus (the main window got the focus without a click or key there — app.js trackMaximized
 * records both) is undone: the dropdown takes the focus again and stays open.
 */
function regainedFromMain(lostAt) {
  if (!desktop) return false;
  const time = (key) => { try { return Number(globalThis.localStorage?.getItem(key)) || 0; } catch { return 0; } };
  if (time('myumlmaker.main.focus') < lostAt - 100 || time('myumlmaker.main.input') >= lostAt - 400) return false;
  window.focus();
  native.invoke('popup_ready').catch(() => {});
  return true;
}

// The theme dropdown and the colour picker close when they lose focus.
window.addEventListener('blur', () => {
  const lostAt = Date.now();
  if (kind === 'theme' && !pickerDone) setTimeout(() => { if (!document.hasFocus() && !pickerDone && !regainedFromMain(lostAt)) { pickerDone = true; close(); } }, 150);
  if (kind === 'color' && !colorDone) setTimeout(() => { if (!document.hasFocus() && !colorDone && !document.querySelector('[data-color-custom]:focus') && !regainedFromMain(lostAt)) { colorDone = true; close(); } }, 200);
});

// Number fields (steppers).
bindSteppers(root, (key, value) => {
  const [scope, field] = key.includes(':') ? key.split(':') : ['setting', key];
  if (scope === 'setting') update({ [field]: value });
  else if (scope === 'print') changePrint({ [field]: value });
  return undefined;
});

// Menus close when they lose focus (a click anywhere else).
window.addEventListener('blur', () => {
  if (kind !== 'menu' || !menuOpen) return;
  const lostAt = Date.now();
  setTimeout(() => { if (!document.hasFocus() && menuOpen && !regainedFromMain(lostAt)) chooseMenu(null); }, 150);
});

// OS windows: the header moves the popup (lib.rs window_drag starts the system move loop from the cursor).
if (desktop) {
  root.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !event.target.closest?.('[data-window-drag]') || event.target.closest('button, input, select, textarea')) return;
    event.preventDefault();
    native.invoke('window_drag', {}).catch(() => {});
  });
}

// Frames: drag the popup by its header.
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
  } else if (message?.type === 'find-results' && kind === 'find' && state.draft) {
    state.draft.results = Array.isArray(message.results) ? message.results : [];
    render();
  } else if (message?.type === 'codegen-preview' && kind === 'codegen' && state.draft) {
    state.draft.preview = { files: message.files ?? [], error: message.error ?? null };
    render();
  } else if (message?.type === 'db-result' && kind === 'settings') {
    state.dbResult = { ok: Boolean(message.ok), text: String(message.text ?? '') };
    render();
  } else if (message?.type === 'db-list' && kind === 'database') {
    state.dbItems = Array.isArray(message.items) ? message.items : [];
    render();
  } else if (message?.type === 'req-rows' && kind === 'requirements') {
    state.reqRows = Array.isArray(message.rows) ? message.rows : [];
    keepFocus(render);
  } else if (message?.type === 'trace-matrix' && kind === 'tracematrix') {
    state.params = { ...state.params, elementTypes: message.elementTypes, relationTypes: message.relationTypes, scopes: message.scopes };
    state.traceOptions = message.options ?? state.traceOptions;
    state.traceMatrix = message.matrix ?? state.traceMatrix;
    keepFocus(render);
  } else if (message?.type === 'background-data' && kind === 'background' && state.draft) {
    state.draft.preview = message.preview ?? null;
    if (state.draft.hasImage) state.draft.image = String(message.image ?? '');
    render();
  } else if (message?.type === 'background-image' && kind === 'background' && state.draft) {
    Object.assign(state.draft, { hasImage: true, image: String(message.image ?? '') });
    Object.assign(state.draft.fields, { backgroundKind: 'image', backgroundImageWidth: message.width, backgroundImageHeight: message.height });
    render();
  } else if (message?.type === 'refresh') {
    refresh();
  }
}

/** Redraws without losing the focused control (a select or the filter box being used). */
function keepFocus(draw) {
  const active = document.activeElement;
  const selector = active && active !== document.body ? ['data-draft', 'data-trace', 'data-req-field', 'data-action'].map((a) => (active.hasAttribute(a) ? `[${a}="${CSS.escape(active.getAttribute(a))}"]${active.dataset.id ? `[data-id="${CSS.escape(active.dataset.id)}"]` : ''}${active.dataset.row ? `[data-row="${CSS.escape(active.dataset.row)}"][data-col="${CSS.escape(active.dataset.col)}"]` : ''}` : '')).find(Boolean) : '';
  draw();
  if (selector) root.querySelector(selector)?.focus();
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
  state.reqRows = null;
  state.traceOptions = null;
  state.traceMatrix = null;
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
    if (event.origin === location.origin && event.data?.myumlmakerHost) onHostMessage(event.data);
  });
}
window.addEventListener('resize', () => { if (kind === 'print') fitPreview(); });

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__myumlmakerPopup = { kind, state, render, close, errorReport, printLayout, refresh };

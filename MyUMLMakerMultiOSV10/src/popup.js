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
      find: renderFind, validation: renderValidation, codegen: renderCodegen, textimport: renderTextImport, color: renderColor, prompt: renderPrompt,
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
  ['Ctrl+Shift+1 / 2', 'action.toolboxPanel'], ['Ctrl+Shift+L', 'action.language'], ['Ctrl+Shift+B', 'action.shuffleBackground'], ['Ctrl+Shift+H', 'action.startPage'], ['Ctrl+,', 'action.settings'],
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
    class: '@startuml\nabstract class Shape {\n  - name : String\n  + area() : double\n}\nclass Circle\ninterface Drawable\nShape <|-- Circle\nDrawable <|.. Shape\n@enduml',
    sequence: '@startuml\nactor User\nparticipant Server\nUser -> Server : login(id)\nServer --> User : token\n@enduml',
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
      ${row('samples', t('textImport.samples'), Object.keys(samples).map((k) => `<button class="small-button" data-action="text-sample" data-value="${k}">${escapeHtml(t(`textImport.sample.${k}`))}</button>`).join(''))}
      <textarea class="code-input" data-draft="text" spellcheck="false" placeholder="${escapeHtml(t('textImport.placeholder'))}">${escapeHtml(d.text)}</textarea>
      <p class="muted">${escapeHtml(t('textImport.hint'))}</p>
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
    case 'codegen-apply': return close({ language: d.language, scope: d.scope, target: d.target, options: d.options });
    case 'text-sample': d.text = TEXT_SAMPLES[d.format][value]; return render();
    case 'text-apply': return close({ format: d.format, text: d.text });
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
  if (target.dataset.draft && state.draft) {
    state.draft[target.dataset.draft] = target.value;
    if (kind === 'textimport') { const btn = root.querySelector('[data-action="text-apply"]'); if (btn) btn.disabled = !target.value.trim(); }
  }
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
    if (event.origin === location.origin && event.data?.myumlmakerHost) onHostMessage(event.data);
  });
}
window.addEventListener('resize', () => { if (kind === 'print') fitPreview(); });

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__myumlmakerPopup = { kind, state, render, close, errorReport, printLayout, refresh };

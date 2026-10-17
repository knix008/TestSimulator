// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web build, tutorial: ?popup=<kind>). Every
// popup has a fixed size chosen so its content fits without scrolling; long
// content is split into tabs or pages, and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { loadRecent, loadRecentDirs, MAX_RECENT, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, BACKGROUND_FITS, BACKGROUND_KINDS, BAR_TEXT, DATE_FORMATS, defaultSettings, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, loadSettings, PRINT_KEY,
  RECENT_DIRS_KEY, RECENT_KEY, STORAGE_KEY, storeSettings, VIEWS, ZOOM,
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
import { bindDateFields, calendarText, dateFieldHtml } from './calendar.js';
import { ACCRUALS, CONSTRAINTS, DATED_CONSTRAINTS, RESOURCE_TYPES, TASK_TYPES, BAR_COLORS } from './domain/project.js';
import { compactDuration, formatDuration, formatLag, formatMoney, LINK_TYPES, parseDuration, unitMinutes, UNITS } from './domain/duration.js';
import { formatDay, fromMin, minToClock, clockToMin, toMin, dayOf, dayStart } from './domain/time.js';
import { normalizePeriods, periodMinutes } from './domain/calendars.js';
import { BASELINE_COUNT } from './domain/tracking.js';
import { PATTERNS } from './domain/recurring.js';
import { TASK_FIELD_MAP, RESOURCE_FIELD_MAP } from './domain/fields.js';
import { CONTENTS, defaultPrintOptions, MARGINS, PAPERS, RANGES, renderPrintSvg } from './print/render.js';
import { normalizeProject } from './domain/format.js';
import { ANIMATION_INTERVALS } from './domain/settings.js';
import { intervalLabel } from './ui/startpage.js';
import { IMAGE_FORMATS, IMAGE_SCALES, imageFormat, rasterSize } from './export/image-encode.js';
import { schedule } from './domain/schedule.js';

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
  globalThis.parent?.postMessage({ myworkplan: true, kind, type, data }, location.origin);
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
  appWindow.setTitle(`${title} — MyWorkPlan v${VERSION}`).catch(() => {});
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

const dateField = (key, value, label) => dateFieldHtml({ key, value: value ? String(value).slice(0, 10) : '', label, text: calendarText(t, L()) });

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
      print: renderPrint, menu: renderMenu, theme: renderThemePicker, task: renderTask, resource: renderResource, project: renderProject,
      calendar: renderCalendar, link: renderLink, baseline: renderBaseline, update: renderUpdate, leveling: renderLeveling, recurring: renderRecurring,
      find: renderFind, columns: renderColumns, assign: renderAssign, welcome: renderWelcome, image: renderImage,
      database: renderDatabase,
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
  ['appearance', 'palette', 'settings.theme'],
  ['font', 'font', 'settings.font'],
  ['background', 'sparkles', 'settings.background'],
  ['schedule', 'calculate', 'settings.schedule'],
  ['gantt', 'viewGantt', 'settings.gantt'],
  ['database', 'database', 'settings.database'],
  ['recent', 'recent', 'settings.recent'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

function renderSettings() {
  const body = {
    general: settingsGeneral, appearance: settingsAppearance, font: settingsFont, background: settingsBackground,
    schedule: settingsSchedule, gantt: settingsGantt, database: settingsDatabase, recent: settingsRecent, shortcuts: settingsShortcuts,
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
    row('calendar', t('settings.dateFormat'), select('data-select', 'dateFormat', DATE_FORMATS.map((f) => [f, `${t(`dateFormat.${f}`)} — ${formatDay(toMin('2026-10-19'), f)}`]), s().dateFormat, t('settings.dateFormat'))),
    toggle('showTime', t('settings.showTime'), 'clock'),
    row('eye', t('settings.defaultView'), select('data-select', 'defaultView', VIEWS.map((v) => [v, t(`view.${v}`)]), s().defaultView, t('settings.defaultView'))),
    toggle('showStartPage', t('settings.showStartPage'), 'home'),
    toggle('restoreSession', t('settings.restoreSession'), 'refresh'),
    toggle('confirmDelete', t('settings.confirmDelete'), 'trash'),
    toggle('statusClock', t('settings.statusClock'), 'clock'),
    toggle('showStatusBar', t('action.statusBar'), 'statusBar'),
    row('folder', t('settings.lastDirectory'), `<span class="path" title="${escapeHtml(s().lastDirectory ?? '')}">${escapeHtml(s().lastDirectory ?? t('common.none'))}</span>`),
    row('tutorial', t('settings.tutorial'), button('start-tutorial', t('start.tutorialStart'), 'play', 'small')),
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
      <span class="preview-chip" style="background:${custom.surface};color:${custom.text};border:1px solid ${custom.border}">${escapeHtml(t('task.newName'))}</span>
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
      + button('shuffle-background', t('action.shuffleBackground'), 'dice', 'small')),
    row('speed', t('settings.animationSpeed'), numberField('animationSpeed', s().animationSpeed, 0, 300, 10, '%', t('settings.animationSpeed'))),
    toggle('animationRandom', t('settings.bgRandom'), 'dice'),
    row('clock', t('settings.bgInterval'), select('data-select', 'animationInterval', ANIMATION_INTERVALS.map((n) => [n, intervalLabel(n)]), s().animationInterval, t('settings.bgInterval'))),
    toggle('animationOnStartOnly', t('settings.animationOnStartOnly'), 'home'),
    row('imageBg', t('settings.bgImage'), `<span class="path" id="bg-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      ${button('choose-background', t('settings.bgChoose'), 'folder', 'small')}
      ${button('clear-background', t('settings.bgClear'), 'imageClear', 'small')}`),
    row('opacity', t('settings.bgOpacity'), numberField('backgroundOpacity', s().backgroundOpacity, 0, 100, 5, '%', t('settings.bgOpacity'))),
    row('fitProject', t('settings.bgFit'), segmented('backgroundFit', BACKGROUND_FITS.map((fit) => [fit, t(`settings.fit.${fit}`)]), s().backgroundFit)),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.bgHint'))}</span>`, t('settings.bgHint')),
  ].join('');
}

function settingsSchedule() {
  return [
    row('clock', t('settings.hoursPerDay'), numberField('hoursPerDay', s().hoursPerDay, 1, 24, 0.5, '', t('settings.hoursPerDay'))),
    row('calendar', t('settings.hoursPerWeek'), numberField('hoursPerWeek', s().hoursPerWeek, 1, 168, 1, '', t('settings.hoursPerWeek'))),
    row('calendarEdit', t('settings.daysPerMonth'), numberField('daysPerMonth', s().daysPerMonth, 1, 31, 1, '', t('settings.daysPerMonth'))),
    row('autoMode', t('settings.defaultTaskMode'), segmented('defaultTaskMode', [['auto', t('mode.auto'), 'autoMode'], ['manual', t('mode.manual'), 'manualMode']], s().defaultTaskMode)),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.scheduleHint'))}</span>`, t('settings.scheduleHint')),
  ].join('');
}

function settingsGantt() {
  return [
    toggle('showCritical', t('action.showCritical'), 'critical'),
    toggle('showSlack', t('action.showSlack'), 'slack'),
    toggle('showBaseline', t('action.showBaseline'), 'baselineShow'),
    toggle('showProgressLine', t('action.showProgressLine'), 'progressLine'),
    toggle('showLinks', t('settings.showLinks'), 'link'),
    toggle('showToday', t('settings.showToday'), 'today'),
    toggle('shadeNonWorking', t('settings.shadeNonWorking'), 'calendar'),
    row('tag', t('settings.barText'), segmented('barText', BAR_TEXT.map((b) => [b, t(`barText.${b}`)]), s().barText)),
  ].join('');
}

// The desktop app also shows popups as frames (tutorial); the database needs the desktop app.
// (__myworkplanDbPreview: layout checks draw the full tab in the web build.)
const desktopApp = () => desktop || Boolean(globalThis.__myworkplanDbPreview) || (() => { try { return Boolean(globalThis.parent?.__TAURI_INTERNALS__); } catch { return false; } })();
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
      <span class="row-label"><b class="recent-index">${start + index + 1}</b>${icon('plan')}<span class="recent-name">${escapeHtml(name)}</span></span>
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
      <span class="row-label"><b class="recent-index">${start + index + 1}</b>${icon(folders ? 'folder' : 'plan')}<span class="recent-name">${escapeHtml(name)}</span></span>
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
  ['Ctrl+N', 'action.new'], ['Ctrl+O', 'action.open'], ['Ctrl+S', 'action.save'], ['Ctrl+Shift+S', 'action.saveAs'], ['Ctrl+Alt+S', 'action.saveAll'],
  ['Ctrl+R', 'action.recent'], ['Ctrl+W', 'action.closeTab'], ['Ctrl+P', 'action.print'], ['Ctrl+Z', 'action.undo'], ['Ctrl+Y', 'action.redo'],
  ['Ctrl+X', 'action.cut'], ['Ctrl+C', 'action.copy'], ['Ctrl+V', 'action.paste'], ['Ctrl+D', 'action.fillDown'], ['Delete', 'action.delete'],
  ['Ctrl+A', 'action.selectAll'], ['Esc', 'action.clearSelection'], ['Insert', 'action.insertTask'], ['Ctrl+Shift+M', 'action.insertMilestone'],
  ['Ctrl+Shift+K', 'action.insertSummary'], ['Alt+Shift+→ / ←', 'action.indent'], ['Alt+Shift+↑ / ↓', 'action.moveUp'], ['Ctrl+F2', 'action.link'],
  ['Ctrl+Shift+F2', 'action.unlink'], ['Shift+F2', 'action.taskInfo'], ['Alt+F10', 'action.assign'], ['F2 / Enter', 'grid.editCell'], ['Ctrl+F', 'action.find'],
  ['Ctrl+H', 'action.replace'], ['Ctrl+G', 'action.goTo'], ['Ctrl+= / Ctrl+-', 'action.zoomIn'], ['Ctrl+0', 'action.zoomReset'], ['shortcut.wheel', 'action.zoomIn'],
  ['Ctrl+Shift+= / -', 'action.timescaleIn'], ['shortcut.drag', 'shortcut.pan'], ['F9', 'action.calculate'], ['Ctrl+Tab', 'tabs.next'], ['Ctrl+Shift+L', 'action.language'],
  ['Ctrl+Shift+B', 'action.shuffleBackground'], ['Ctrl+Shift+H', 'action.startPage'], ['Ctrl+,', 'action.settings'], ['F11', 'action.tutorial'], ['F1', 'action.about'],
];

function settingsShortcuts() {
  const [list, pager] = paged('shortcuts', SHORTCUT_LIST, 36);
  return `<div class="shortcut-grid">${list.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>${pager ? `<div class="row">${pager}</div>` : ''}`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyWorkPlan', version: VERSION, error: native.errorText(error) }));
  const info = state.info;
  const date = info.buildDate ? new Date(info.buildDate).toLocaleString() : '-';
  const rows = [
    ['info', t('about.version'), `${info.version}`],
    ['clock', t('about.buildDate'), date],
    ['hyperlink', t('about.commit'), info.commit ?? '-'],
    ['layers', t('about.target'), info.target ?? '-'],
    ['gear', t('about.profile'), info.profile ?? '-'],
    ['calculate', t('about.runtime'), info.web ? t('about.webBuild') : `Tauri ${info.tauri} · ${info.rustc ?? ''}`],
    ['globe', t('about.platform'), `${info.os ?? '-'} / ${info.arch ?? '-'}`],
    ['user', t('about.author'), 'SHKWON(knix008@naver.com)'],
  ];
  const table = `<dl class="about-table">${rows.map(([rowGlyph, label, value]) => `<dt title="${escapeHtml(label)}">${icon(rowGlyph)}<span>${escapeHtml(label)}</span></dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('')}</dl>`;
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
      <div class="about-rows" id="about-rows">${table}</div>
    </div>`,
    foot: `<span class="muted">© SHKWON(knix008@naver.com)</span><span class="grow"></span>${button('copy-about', t('action.copy'), 'copy')}${button('close', t('common.done'), 'check', 'primary')}`,
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
      ${shownItems.length ? `<ul class="confirm-items">${shownItems.map((item) => `<li title="${escapeHtml(item)}">${icon('plan')}<span>${escapeHtml(item || '—')}</span></li>`).join('')}${items.length > shownItems.length ? `<li>… +${items.length - shownItems.length}</li>` : ''}</ul>` : ''}
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
      <div class="about-top"><img class="about-icon small" src="${appIcon}" alt="" /><div><div class="about-name">MyWorkPlan <span class="about-version">v${escapeHtml(VERSION)}</span></div><p class="about-description">${escapeHtml(t('welcome.text'))}</p></div></div>
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

// ───────────────────────── print preview

function printProject() {
  if (!state.printData) {
    const project = normalizeProject(P().project ?? { tasks: [] }, L());
    state.printData = { project, sched: schedule(project) };
  }
  return state.printData;
}

function printSetup() {
  if (!state.print) state.print = { ...defaultPrintOptions(), ...(P().setup ?? {}), range: 'all', selectedOnly: false };
  return state.print;
}

function printLayout() {
  const options = printSetup();
  const { project, sched } = printProject();
  return renderPrintSvg(project, sched, {
    ...options, columns: P().columns, t, language: L(), dateFormat: P().dateFormat ?? s().dateFormat, title: P().title, visible: P().visible, selected: P().selected, showCritical: P().showCritical,
  });
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
  root.innerHTML = frame({
    glyph: 'print', title: t('print.title'),
    tabs: tabsHtml([['range', 'list', t('print.tabRange')], ['page', 'pageSetup', t('print.tabPage')], ['header', 'notes', t('print.tabHeader')]], state.tab === 'general' ? 'range' : state.tab),
    body: `<div class="print-view">
      <div class="print-options">
        ${(state.tab === 'page') ? [
          row('file', t('print.paper'), sel('paper', Object.keys(PAPERS).map((paper) => [paper, paper]), t('print.paper'))),
          row('pageSetup', t('print.orientation'), segmented('orientation', [['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], options.orientation, 'data-print-segment')),
          row('fitProject', t('print.margin'), sel('margin', Object.keys(MARGINS).map((margin) => [margin, t(`print.margin.${margin}`)]), t('print.margin'))),
          row('zoomIn', t('print.scale'), numberField('print:scale', options.scale, 50, 150, 10, '%', t('print.scale'))),
          row('layers', t('print.content'), sel('content', CONTENTS.map((c) => [c, t(`print.content.${c}`)]), t('print.content'))),
          check('legend', t('print.legend'), 'list'),
        ].join('') : state.tab === 'header' ? [
          check('header', t('print.header'), 'notes'),
          row('edit', t('print.headerText'), `<input type="text" data-print-text="headerText" value="${escapeHtml(options.headerText)}" placeholder="${escapeHtml(p.title ?? '')}" title="${escapeHtml(t('print.headerText'))}" />`),
          check('footer', t('print.footer'), 'pageSetup'),
          row('edit', t('print.footerText'), `<input type="text" data-print-text="footerText" value="${escapeHtml(options.footerText)}" placeholder="MyWorkPlan" title="${escapeHtml(t('print.footerText'))}" />`),
        ].join('') : [
          ...RANGES.map((range) => `<label class="row radio-row" title="${escapeHtml(t(`print.range.${range}`))}"><input type="radio" name="range" data-print-range="${range}" ${options.range === range ? 'checked' : ''} /><span>${icon({ all: 'selectAll', view: 'eye', custom: 'filter' }[range])}${escapeHtml(t(`print.range.${range}`))}</span></label>`),
          row('list', t('print.rows'), `${numberField('print:fromRow', options.fromRow, 1, 9999, 1, '', t('print.fromRow'))}<span>–</span>${numberField('print:toRow', Math.min(options.toRow, 9999), 1, 9999, 1, '', t('print.toRow'))}`, t('print.rows'), custom ? '' : 'disabled-row'),
          row('calendar', t('print.dates'), `${dateField('print:fromDate', options.fromDate, t('print.fromDate'))}<span>–</span>${dateField('print:toDate', options.toDate, t('print.toDate'))}`, t('print.dates'), custom ? '' : 'disabled-row'),
          `<label class="row radio-row ${custom ? '' : 'disabled-row'}" title="${escapeHtml(t('print.selectedOnly'))}"><input type="checkbox" data-print-toggle="selectedOnly" ${options.selectedOnly ? 'checked' : ''} ${custom ? '' : 'disabled'} /><span>${icon('selectAll')}${escapeHtml(t('print.selectedOnly'))} (${(p.selected ?? []).length})</span></label>`,
          row('info', t('print.summary'), `<span class="muted">${escapeHtml(t('print.summaryText', { rows: layout.rows, pages: layout.count }))}</span>`),
        ].join('')}
      </div>
      <div class="print-preview" id="print-preview">
        ${page && layout.rows ? `<div class="preview-stage">${page.svg}</div>` : `<div class="preview-empty">${icon('info')}<span>${escapeHtml(t('print.empty'))}</span></div>`}
      </div>
    </div>
    <div class="print-sheet" aria-hidden="true">${layout.pages.map((item) => `<div class="print-page">${item.svg}</div>`).join('')}</div>`,
    foot: `<button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number">${escapeHtml(t('print.page', { n: state.page + 1, total: layout.count }))}</span>
      <button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= layout.count - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
      <span class="grow"></span>
      <button class="button primary" data-action="print" title="${escapeHtml(t('print.print'))}" ${layout.rows ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(t('print.print'))}</span></button>
      ${button('close', t('common.close'), 'close')}`,
  });
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  const paper = PAPERS[options.paper] ?? PAPERS.A4;
  const landscape = options.orientation === 'landscape';
  style.textContent = `@page { size: ${landscape ? paper.height : paper.width}mm ${landscape ? paper.width : paper.height}mm; margin: 0; }`;
  fitPreview();
  ready();
}

/** Scales the preview page to fit the preview area (no scroll bars). */
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
  const { range, selectedOnly, fromRow, toRow, fromDate, toDate, ...setup } = state.print;
  void range; void selectedOnly; void fromRow; void toRow; void fromDate; void toDate;
  try { globalThis.localStorage?.setItem(PRINT_KEY, JSON.stringify(setup)); } catch { /* ignore */ }
  render();
}

async function doPrint() {
  try {
    if (window.__myworkplanPrintHook) window.__myworkplanPrintHook(printLayout());
    else await native.printWindow();
    action('printed');
  } catch (error) {
    action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
  }
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

// ───────────────────────── task information

function taskInit() {
  const p = P();
  const task = p.task ?? {};
  state.draft = {
    name: task.name ?? '', duration: compactDuration(p.info?.duration ?? task.duration ?? 0, task.durationUnit ?? 'd', p.options), estimated: Boolean(task.estimated),
    percentComplete: p.info?.percentComplete ?? task.percentComplete ?? 0, priority: task.priority ?? 500, manual: Boolean(task.manual), milestone: Boolean(task.milestone),
    active: task.active !== false, start: p.start ?? '', finish: p.finish ?? '', notes: task.notes ?? '', hyperlink: task.hyperlink ?? '',
    constraintType: task.constraint?.type ?? 'ASAP', constraintDate: task.constraint?.date ?? '', deadline: task.deadline ?? '', type: task.type ?? 'fixedUnits',
    effortDriven: Boolean(task.effortDriven), calendarId: task.calendarId ?? '', text1: task.text1 ?? '', text2: task.text2 ?? '', text3: task.text3 ?? '', number1: task.number1 ?? 0,
    flag1: Boolean(task.flag1), barColor: task.barColor ?? '', hideBar: Boolean(task.hideBar), timeline: Boolean(task.timeline), fixedCost: task.fixedCost ?? 0,
    predecessors: (task.predecessors ?? []).map((link) => ({ ...link, lagText: link.lag ? formatLag(link.lag, link.lagUnit, p.options) : '' })),
    assignments: (p.assignments ?? []).map((a) => ({ resourceId: a.resourceId, units: a.units, cost: a.cost })),
    touched: new Set(),
  };
}

const TASK_TABS = [['general', 'edit', 'taskInfo.general'], ['predecessors', 'link2', 'taskInfo.predecessors'], ['resources', 'user', 'taskInfo.resources'], ['advanced', 'constraint', 'taskInfo.advanced'], ['notes', 'notes', 'taskInfo.notes'], ['custom', 'tag', 'taskInfo.custom']];

function renderTask() {
  if (!state.draft) taskInit();
  const p = P();
  const d = state.draft;
  const multi = p.multi;
  const tab = TASK_TABS.some(([id]) => id === state.tab) ? state.tab : 'general';
  const summary = p.info?.summary;
  const input = (key, type = 'text', extra = '') => `<input type="${type}" data-draft="${key}" value="${escapeHtml(d[key])}" title="${escapeHtml(t(`taskInfo.${key}`))}" aria-label="${escapeHtml(t(`taskInfo.${key}`))}" ${extra} />`;
  const switchFor = (key) => `<label class="switch-wrap" title="${escapeHtml(t(`taskInfo.${key}`))}"><input type="checkbox" data-draft-toggle="${key}" ${d[key] ? 'checked' : ''} aria-label="${escapeHtml(t(`taskInfo.${key}`))}" /><span class="switch" aria-hidden="true"></span></label>`;
  let body = '';
  if (tab === 'general') {
    body = [
      multi ? row('selectAll', t('taskInfo.multi'), `<span>${escapeHtml(t('taskInfo.multiHint', { count: p.count }))}</span>`) : row('edit', t('taskInfo.name'), input('name', 'text', 'id="task-name"')),
      row('hourglass', t('taskInfo.duration'), `${input('duration', 'text', summary ? 'disabled' : '')}<label class="inline-check" title="${escapeHtml(t('taskInfo.estimated'))}"><input type="checkbox" data-draft-toggle="estimated" ${d.estimated ? 'checked' : ''} ${summary ? 'disabled' : ''} /><span>${escapeHtml(t('taskInfo.estimated'))}</span></label>`),
      row('percent', t('taskInfo.percentComplete'), numberField('draft:percentComplete', d.percentComplete, 0, 100, 5, '%', t('taskInfo.percentComplete'))),
      row('priority', t('taskInfo.priority'), numberField('draft:priority', d.priority, 0, 1000, 50, '', t('taskInfo.priority'))),
      row('autoMode', t('taskInfo.mode'), segmented('manual', [['false', t('mode.auto'), 'autoMode'], ['true', t('mode.manual'), 'manualMode']], String(d.manual), 'data-draft-segment')),
      row('calendar', t('taskInfo.start'), d.manual && !multi ? dateField('draft:start', d.start, t('taskInfo.start')) : `<span class="muted">${escapeHtml(formatDay(toMin(d.start), p.dateFormat ?? 'iso', true))}</span>`),
      row('flag', t('taskInfo.finish'), d.manual && !multi ? dateField('draft:finish', d.finish, t('taskInfo.finish')) : `<span class="muted">${escapeHtml(formatDay(toMin(d.finish), p.dateFormat ?? 'iso', true))}</span>`),
      row('milestone', t('taskInfo.milestone'), switchFor('milestone')),
      row('inactive', t('taskInfo.active'), switchFor('active')),
    ].join('');
  } else if (tab === 'predecessors') {
    const tasks = (p.tasks ?? []).filter((item) => item.id !== p.task?.id);
    const [page, pager, startIndex] = paged('preds', d.predecessors, 7);
    body = multi ? `<div class="row empty">${icon('info')}<span>${escapeHtml(t('taskInfo.multiNo'))}</span></div>` : `
      <div class="row table-head"><span class="col-id">${escapeHtml(t('field.id'))}</span><span class="col-name">${escapeHtml(t('field.name'))}</span><span class="col-type">${escapeHtml(t('link.type'))}</span><span class="col-lag">${escapeHtml(t('link.lag'))}</span><span class="col-act"></span></div>
      ${page.length ? page.map((link, i) => {
        const index = startIndex + i;
        const target = tasks.find((item) => item.id === link.taskId);
        return `<div class="row table-row"><span class="col-id">${target?.row ?? '?'}</span>
          <span class="col-name">${select('data-pred-task', index, tasks.map((item) => [item.id, `${item.row}. ${item.name || '—'}`]), link.taskId, t('field.name'))}</span>
          <span class="col-type">${select('data-pred-type', index, LINK_TYPES.map((type) => [type, t(`linkType.${type}`)]), link.type, t('link.type'))}</span>
          <span class="col-lag"><input type="text" data-pred-lag="${index}" value="${escapeHtml(link.lagText)}" placeholder="0d" title="${escapeHtml(t('link.lag'))}" aria-label="${escapeHtml(t('link.lag'))}" /></span>
          <span class="col-act"><button class="icon-button" data-action="pred-remove" data-value="${index}" title="${escapeHtml(t('taskInfo.removeLink'))}" aria-label="${escapeHtml(t('taskInfo.removeLink'))}">${icon('trash')}</button></span></div>`;
      }).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('taskInfo.noPredecessors'))}</span></div>`}
      <div class="row">${button('pred-add', t('taskInfo.addLink'), 'link', 'small', '', tasks.length ? '' : 'disabled')}<span class="grow"></span>${pager}<span class="muted">${escapeHtml(t('taskInfo.lagHint'))}</span></div>`;
  } else if (tab === 'resources') {
    const resources = p.resources ?? [];
    const [page, pager, startIndex] = paged('res', d.assignments, 7);
    body = summary ? `<div class="row empty">${icon('info')}<span>${escapeHtml(t('taskInfo.summaryNoResources'))}</span></div>` : `
      <div class="row table-head"><span class="col-name">${escapeHtml(t('field.name'))}</span><span class="col-type">${escapeHtml(t('field.resourceType'))}</span><span class="col-units">${escapeHtml(t('taskInfo.units'))}</span><span class="col-act"></span></div>
      ${page.length ? page.map((a, i) => {
        const index = startIndex + i;
        const r = resources.find((item) => item.id === a.resourceId);
        const unitLabel = r?.type === 'material' ? (r.materialLabel || t('taskInfo.quantity')) : r?.type === 'cost' ? (P().options?.currency ?? '₩') : '%';
        const value = r?.type === 'work' ? Math.round((a.units ?? 1) * 100) : r?.type === 'cost' ? (a.cost ?? 0) : a.units ?? 1;
        return `<div class="row table-row">
          <span class="col-name">${select('data-assign-resource', index, resources.map((item) => [item.id, item.name || '—']), a.resourceId, t('field.name'))}</span>
          <span class="col-type">${escapeHtml(t(`resourceType.${r?.type ?? 'work'}`))}</span>
          <span class="col-units">${numberField(`assign:${index}`, value, 0, r?.type === 'cost' ? 100000000 : r?.type === 'material' ? 100000 : 1000, r?.type === 'work' ? 10 : 1, unitLabel === '%' ? '%' : '', `${t('taskInfo.units')} (${unitLabel})`)}</span>
          <span class="col-act"><button class="icon-button" data-action="assign-remove" data-value="${index}" title="${escapeHtml(t('taskInfo.unassign'))}" aria-label="${escapeHtml(t('taskInfo.unassign'))}">${icon('trash')}</button></span></div>`;
      }).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t(resources.length ? 'taskInfo.noAssignments' : 'taskInfo.noResources'))}</span></div>`}
      <div class="row">${button('assign-add', t('taskInfo.assign'), 'assign', 'small', '', resources.length ? '' : 'disabled')}<span class="grow"></span>${pager}</div>`;
  } else if (tab === 'advanced') {
    const dated = DATED_CONSTRAINTS.includes(d.constraintType);
    body = [
      row('constraint', t('taskInfo.constraintType'), select('data-draft-select', 'constraintType', CONSTRAINTS.map((c) => [c, t(`constraint.${c}`)]), d.constraintType, t('taskInfo.constraintType'))),
      row('calendar', t('taskInfo.constraintDate'), dated ? dateField('draft:constraintDate', d.constraintDate, t('taskInfo.constraintDate')) : `<span class="muted">${escapeHtml(t('common.na'))}</span>`),
      row('deadline', t('taskInfo.deadline'), dateField('draft:deadline', d.deadline, t('taskInfo.deadline'))),
      row('layers', t('taskInfo.type'), select('data-draft-select', 'type', TASK_TYPES.map((type) => [type, t(`taskType.${type}`)]), d.type, t('taskInfo.type'))),
      row('reportWork', t('taskInfo.effortDriven'), switchFor('effortDriven')),
      row('calendarEdit', t('taskInfo.calendar'), select('data-draft-select', 'calendarId', [['', t('common.none')], ...(p.calendars ?? []).map((cal) => [cal.id, cal.name])], d.calendarId, t('taskInfo.calendar'))),
      row('money', t('taskInfo.fixedCost'), `<input type="text" data-draft="fixedCost" value="${escapeHtml(d.fixedCost)}" title="${escapeHtml(t('taskInfo.fixedCost'))}" aria-label="${escapeHtml(t('taskInfo.fixedCost'))}" />`),
      row('flag', t('taskInfo.wbs'), `<span class="muted">${escapeHtml(p.info?.wbs ?? '')}</span>`),
    ].join('');
  } else if (tab === 'notes') {
    body = `<textarea class="notes-area" data-draft="notes" title="${escapeHtml(t('taskInfo.notes'))}" aria-label="${escapeHtml(t('taskInfo.notes'))}" placeholder="${escapeHtml(t('taskInfo.notesPlaceholder'))}">${escapeHtml(d.notes)}</textarea>
      ${row('hyperlink', t('taskInfo.hyperlink'), input('hyperlink'))}`;
  } else {
    body = [
      row('tag', t('field.text1'), input('text1')),
      row('tag', t('field.text2'), input('text2')),
      row('tag', t('field.text3'), input('text3')),
      row('calculate', t('field.number1'), `<input type="text" data-draft="number1" value="${escapeHtml(d.number1)}" title="${escapeHtml(t('field.number1'))}" aria-label="${escapeHtml(t('field.number1'))}" />`),
      row('flag', t('field.flag1'), switchFor('flag1')),
      row('palette', t('props.barColor'), `<span class="swatches">${BAR_COLORS.map((color) => `<button class="swatch ${d.barColor === color ? 'active' : ''} ${color ? '' : 'swatch-none'}" data-draft-color="${color}" style="--swatch:${color || 'transparent'}" title="${escapeHtml(color || t('props.barColorDefault'))}"></button>`).join('')}</span>`),
      row('eye', t('taskInfo.hideBar'), switchFor('hideBar')),
      row('viewTimeline', t('taskInfo.timeline'), switchFor('timeline')),
    ].join('');
  }
  root.innerHTML = frame({
    glyph: summary ? 'summaryBar' : d.milestone ? 'milestone' : 'taskInfo', title: `${t(multi ? 'taskInfo.titleMulti' : 'taskInfo.title')}${multi ? ` (${p.count})` : d.name ? ` — ${d.name}` : ''}`,
    tabs: tabsHtml(TASK_TABS.map(([id, glyph, key]) => [id, glyph, t(key)]), tab),
    body: `<div class="editor editor-task">${body}</div>`,
    foot: `<span class="muted" id="task-error"></span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('task-apply', t('common.ok'), 'check', 'primary')}`,
  });
  if (!shown && tab === 'general') root.querySelector('#task-name')?.focus();
  ready();
}

function applyTask() {
  const p = P();
  const d = state.draft;
  const options = p.options;
  const patch = {};
  const errorEl = root.querySelector('#task-error');
  const fail = (text) => { if (errorEl) { errorEl.textContent = text; errorEl.classList.add('danger-text'); } return null; };
  const has = (key) => !p.multi || d.touched.has(key);
  if (!p.multi) patch.name = d.name;
  if (has('duration') && !p.info?.summary) {
    const parsed = parseDuration(d.duration, options, p.task?.durationUnit ?? 'd');
    if (!parsed) return fail(t('field.badDuration'));
    patch.duration = d.milestone ? 0 : parsed.minutes;
    patch.durationUnit = parsed.unit;
    patch.estimated = d.estimated || parsed.estimated;
  }
  for (const key of ['priority', 'manual', 'active', 'notes', 'hyperlink', 'type', 'effortDriven', 'text1', 'text2', 'text3', 'flag1', 'barColor', 'hideBar', 'timeline']) if (has(key)) patch[key] = d[key];
  if (has('milestone')) patch.milestone = d.milestone;
  if (has('percentComplete')) patch.percentComplete = Number(d.percentComplete);
  if (has('calendarId')) patch.calendarId = d.calendarId || null;
  if (has('number1')) patch.number1 = Number(d.number1) || 0;
  if (has('fixedCost')) patch.fixedCost = Number(String(d.fixedCost).replace(/[^0-9.-]/g, '')) || 0;
  if (has('constraintType') || has('constraintDate')) {
    const dated = DATED_CONSTRAINTS.includes(d.constraintType);
    if (dated && !d.constraintDate) return fail(t('taskInfo.needDate'));
    const time = d.constraintType.startsWith('F') || d.constraintType === 'MFO' ? 'T17:00' : 'T08:00';
    patch.constraint = { type: d.constraintType, date: dated ? (String(d.constraintDate).length > 10 ? String(d.constraintDate).slice(0, 16) : `${String(d.constraintDate).slice(0, 10)}${time}`) : null };
  }
  if (has('deadline')) patch.deadline = d.deadline ? `${String(d.deadline).slice(0, 10)}T17:00` : null;
  if (d.manual && !p.multi) {
    patch.manualStart = d.start ? (String(d.start).length > 10 ? String(d.start).slice(0, 16) : `${d.start}T08:00`) : null;
    patch.manualFinish = d.finish ? (String(d.finish).length > 10 ? String(d.finish).slice(0, 16) : `${d.finish}T17:00`) : null;
  }
  const predecessors = [];
  for (const link of d.predecessors) {
    let lag = { lag: 0, lagUnit: 'd' };
    if (String(link.lagText).trim()) {
      const text = String(link.lagText).trim();
      const percent = /^([-+]?\d*\.?\d+)\s*%$/.exec(text);
      if (percent) lag = { lag: Number(percent[1]), lagUnit: '%' };
      else {
        const parsed = parseDuration(text, options, 'd', { allowNegative: true });
        if (!parsed) return fail(`${t('link.lag')}: ${t('field.badDuration')}`);
        lag = { lag: parsed.minutes, lagUnit: parsed.unit };
      }
    }
    if (!predecessors.some((other) => other.taskId === link.taskId)) predecessors.push({ taskId: link.taskId, type: link.type, ...lag });
  }
  const assignments = [];
  for (const a of d.assignments) {
    const r = (p.resources ?? []).find((item) => item.id === a.resourceId);
    if (!r || assignments.some((other) => other.resourceId === a.resourceId)) continue;
    assignments.push({ resourceId: a.resourceId, units: r.type === 'cost' ? 1 : Number(a.units) || 0, cost: r.type === 'cost' ? Number(a.cost) || 0 : undefined });
  }
  return close({ action: 'apply', patch, predecessors: p.multi ? null : predecessors, assignments: p.multi || p.info?.summary ? null : assignments });
}

// ───────────────────────── resource information

function renderResource() {
  const p = P();
  if (!state.draft) state.draft = { ...p.resource, assignments: (p.assignments ?? []).map((a) => ({ ...a })) };
  const d = state.draft;
  const tab = ['general', 'costs', 'assignments', 'notes'].includes(state.tab) ? state.tab : 'general';
  const input = (key) => `<input type="text" data-draft="${key}" value="${escapeHtml(d[key] ?? '')}" title="${escapeHtml(t(`field.${key}`))}" aria-label="${escapeHtml(t(`field.${key}`))}" ${key === 'name' ? 'id="resource-name"' : ''} />`;
  const currency = p.options?.currency ?? '₩';
  let body = '';
  if (tab === 'general') {
    body = [
      row('edit', t('field.name'), input('name')),
      row('user', t('field.resourceType'), segmented('type', RESOURCE_TYPES.map((type) => [type, t(`resourceType.${type}`)]), d.type, 'data-draft-segment')),
      d.type === 'material' ? row('layers', t('field.materialLabel'), input('materialLabel')) : '',
      row('tag', t('field.initials'), input('initials')),
      row('group', t('field.group'), input('group')),
      row('hyperlink', t('field.email'), input('email')),
      d.type === 'work' ? row('percent', t('field.maxUnits'), numberField('draft:maxUnitsPct', Math.round((d.maxUnits ?? 1) * 100), 0, 10000, 10, '%', t('field.maxUnits'))) : '',
      d.type === 'work' ? row('calendarEdit', t('field.calendar'), select('data-draft-select', 'calendarId', [['', t('common.projectCalendar')], ...(p.calendars ?? []).map((cal) => [cal.id, cal.name])], d.calendarId ?? '', t('field.calendar'))) : '',
      row('flag', t('field.code'), input('code')),
    ].join('');
  } else if (tab === 'costs') {
    body = [
      d.type !== 'cost' ? row('money', `${t('field.stdRate')} (${currency}${d.type === 'work' ? t('unit.perHour') : ''})`, input('stdRate')) : '',
      d.type === 'work' ? row('money', `${t('field.ovtRate')} (${currency}${t('unit.perHour')})`, input('ovtRate')) : '',
      d.type !== 'cost' ? row('reportCost', `${t('field.costPerUse')} (${currency})`, input('costPerUse')) : '',
      row('clock', t('field.accrue'), segmented('accrue', ACCRUALS.map((a) => [a, t(`accrue.${a}`)]), d.accrue ?? 'prorated', 'data-draft-segment')),
      row('reportWork', t('field.work'), `<span>${escapeHtml(formatDuration(p.info?.work ?? 0, 'h', p.options, L()))}</span>`),
      row('reportCost', t('field.cost'), `<span>${escapeHtml(formatMoney(p.info?.cost ?? 0, currency))}</span>`),
      row('overallocation', t('field.peak'), `<span class="${p.info?.overallocated ? 'danger-text' : ''}">${Math.round((p.info?.peak ?? 0) * 100)}%${p.info?.overallocated ? ` · ${escapeHtml(t('ind.overallocatedResource'))}` : ''}</span>`),
    ].join('');
  } else if (tab === 'assignments') {
    const [page, pager, startIndex] = paged('rassign', d.assignments, 8);
    body = page.length ? `<div class="row table-head"><span class="col-name">${escapeHtml(t('field.name'))}</span><span class="col-units">${escapeHtml(t('taskInfo.units'))}</span><span class="col-lag">${escapeHtml(t('field.work'))}</span></div>`
      + page.map((a, i) => `<div class="row table-row"><span class="col-name" title="${escapeHtml(a.taskName)}">${icon('bar')}${escapeHtml(a.taskName || '—')}</span>
        <span class="col-units">${d.type === 'work' ? numberField(`rassign:${startIndex + i}`, Math.round((a.units ?? 1) * 100), 0, 1000, 10, '%', t('taskInfo.units')) : escapeHtml(String(a.units ?? 1))}</span>
        <span class="col-lag">${escapeHtml(formatDuration(a.work ?? 0, 'h', p.options, L()))}</span></div>`).join('') + (pager ? `<div class="row">${pager}</div>` : '')
      : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('resourceInfo.noAssignments'))}</span></div>`;
  } else {
    body = `<textarea class="notes-area" data-draft="notes" title="${escapeHtml(t('field.notes'))}" aria-label="${escapeHtml(t('field.notes'))}">${escapeHtml(d.notes ?? '')}</textarea>`;
  }
  root.innerHTML = frame({
    glyph: 'resourceInfo', title: `${t('resourceInfo.title')}${d.name ? ` — ${d.name}` : ''}`,
    tabs: tabsHtml([['general', 'user', t('resourceInfo.general')], ['costs', 'money', t('resourceInfo.costs')], ['assignments', 'list', t('resourceInfo.assignments')], ['notes', 'notes', t('field.notes')]], tab),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="muted" id="resource-error"></span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('resource-apply', t('common.ok'), 'check', 'primary')}`,
  });
  if (!shown && tab === 'general') root.querySelector('#resource-name')?.focus();
  ready();
}

function applyResource() {
  const d = state.draft;
  const money = (value) => Number(String(value ?? 0).replace(/[^0-9.-]/g, '')) || 0;
  const patch = {
    name: String(d.name ?? '').trim(), type: d.type, initials: d.initials ?? '', group: d.group ?? '', email: d.email ?? '', maxUnits: d.maxUnits ?? 1,
    calendarId: d.calendarId || null, code: d.code ?? '', stdRate: money(d.stdRate), ovtRate: money(d.ovtRate), costPerUse: money(d.costPerUse), accrue: d.accrue ?? 'prorated',
    materialLabel: d.materialLabel ?? '', notes: d.notes ?? '',
  };
  return close({ action: 'apply', patch, assignments: d.assignments.map((a) => ({ id: a.id, units: a.units })) });
}

// ───────────────────────── project information

function renderProject() {
  const p = P();
  if (!state.draft) state.draft = { ...p.project, options: { ...p.project.options } };
  const d = state.draft;
  const tab = ['general', 'status', 'statistics', 'properties'].includes(state.tab) ? state.tab : 'general';
  const fmt = p.dateFormat ?? 'iso';
  const st = p.stats ?? {};
  const options = d.options;
  let body = '';
  const input = (key) => `<input type="text" data-draft="${key}" value="${escapeHtml(d[key] ?? '')}" title="${escapeHtml(t(`project.${key}`))}" aria-label="${escapeHtml(t(`project.${key}`))}" />`;
  if (tab === 'general') {
    body = [
      row('edit', t('project.title'), input('title')),
      row('autoMode', t('project.scheduleFrom'), segmented('scheduleFrom', [['start', t('project.fromStart')], ['finish', t('project.fromFinish')]], d.scheduleFrom, 'data-draft-segment')),
      row('calendar', t('project.start'), d.scheduleFrom === 'start' ? dateField('draft:start', d.start, t('project.start')) : `<span class="muted">${escapeHtml(formatDay(st.start, fmt))}</span>`),
      row('flag', t('project.finish'), d.scheduleFrom === 'finish' ? dateField('draft:finish', d.finish ?? fromMin(st.finish), t('project.finish')) : `<span class="muted">${escapeHtml(formatDay(st.finish, fmt))}</span>`),
      row('calendarEdit', t('project.calendar'), select('data-draft-select', 'calendarId', (d.calendars ?? []).map((cal) => [cal.id, cal.name]), d.calendarId, t('project.calendar'))),
      row('priority', t('project.priority'), numberField('draft:priority', d.priority ?? 500, 0, 1000, 50, '', t('project.priority'))),
      row('money', t('project.currency'), select('data-option', 'currency', [['₩', '₩ KRW'], ['$', '$ USD'], ['€', '€ EUR'], ['¥', '¥ JPY'], ['£', '£ GBP']], options.currency, t('project.currency'))),
      row('critical', t('project.criticalSlack'), numberField('option:criticalSlack', options.criticalSlack ?? 0, 0, 30, 1, '', t('project.criticalSlack'))),
      toggle('honorConstraints', t('project.honorConstraints'), 'constraint', options.honorConstraints !== false, 'data-option-toggle'),
    ].join('');
  } else if (tab === 'status') {
    body = [
      row('statusDate', t('project.statusDate'), dateField('draft:statusDate', d.statusDate, t('project.statusDate'))),
      row('today', t('project.currentDate'), `<span>${escapeHtml(formatDay(toMin(new Date()), fmt))}</span>`),
      row('percent', t('field.percentComplete'), `<span class="mini-progress wide"><i style="width:${st.percentComplete ?? 0}%"></i></span><b>${st.percentComplete ?? 0}%</b>`),
      row('reportLate', t('props.lateCount', { count: st.late ?? 0 }), `<span class="${st.late ? 'danger-text' : ''}">${st.late ?? 0}</span>`),
      row('critical', t('props.criticalCount', { count: st.critical ?? 0 }), `<span>${st.critical ?? 0}</span>`),
      row('warning', t('props.conflicts', { count: st.conflicts ?? 0 }), `<span>${st.conflicts ?? 0}</span>`),
      row('info', '', `<span class="muted">${escapeHtml(t('project.statusHint'))}</span>`),
    ].join('');
  } else if (tab === 'statistics') {
    const money = (v) => formatMoney(v ?? 0, options.currency);
    const hours = (v) => formatDuration(v ?? 0, 'h', options, L());
    const daysText = (v) => formatDuration(v ?? 0, 'd', options, L());
    const line = (label, current, baseline, actual, remaining) => `<div class="row stat-row"><span class="row-label">${escapeHtml(label)}</span><span>${escapeHtml(current)}</span><span>${escapeHtml(baseline)}</span><span>${escapeHtml(actual)}</span><span>${escapeHtml(remaining)}</span></div>`;
    body = `<div class="row stat-row head"><span class="row-label"></span><span>${escapeHtml(t('stats.current'))}</span><span>${escapeHtml(t('stats.baseline'))}</span><span>${escapeHtml(t('stats.actual'))}</span><span>${escapeHtml(t('stats.remaining'))}</span></div>
      ${line(t('field.start'), formatDay(st.start, fmt), st.baselineStart ? formatDay(st.baselineStart, fmt) : t('common.na'), '', '')}
      ${line(t('field.finish'), formatDay(st.finish, fmt), st.baselineFinish ? formatDay(st.baselineFinish, fmt) : t('common.na'), '', '')}
      ${line(t('field.duration'), daysText(st.duration), '', daysText(Math.round(((st.duration ?? 0) * (st.percentComplete ?? 0)) / 100)), daysText(Math.round(((st.duration ?? 0) * (100 - (st.percentComplete ?? 0))) / 100)))}
      ${line(t('field.work'), hours(st.work), hours(st.baselineWork), hours(st.actualWork), hours((st.work ?? 0) - (st.actualWork ?? 0)))}
      ${line(t('field.cost'), money(st.cost), money(st.baselineCost), money(st.actualCost), money((st.cost ?? 0) - (st.actualCost ?? 0)))}
      ${row('list', t('props.taskCount'), `<span>${st.tasks ?? 0} · ${escapeHtml(t('stats.milestones', { count: st.milestones ?? 0 }))}</span>`)}
      ${row('user', t('props.resourceCount'), `<span>${st.resources ?? 0}</span>`)}
      ${row('percent', t('field.percentComplete'), `<span class="mini-progress wide"><i style="width:${st.percentComplete ?? 0}%"></i></span><b>${st.percentComplete ?? 0}%</b>`)}`;
  } else {
    body = ['subject', 'author', 'manager', 'company', 'category', 'keywords', 'comments'].map((key) => row({ subject: 'tag', author: 'user', manager: 'user', company: 'tplBuild', category: 'layers', keywords: 'search', comments: 'notes' }[key], t(`project.${key}`), input(key))).join('');
  }
  root.innerHTML = frame({
    glyph: 'projectInfo', title: `${t('project.infoTitle')} — ${d.title}`,
    tabs: tabsHtml([['general', 'projectInfo', t('project.tabGeneral')], ['status', 'statusDate', t('project.tabStatus')], ['statistics', 'statistics', t('project.tabStatistics')], ['properties', 'notes', t('project.tabProperties')]], tab),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('project-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

function applyProject() {
  const d = state.draft;
  const day = (value, time) => (value ? (String(value).length > 10 ? String(value).slice(0, 16) : `${String(value).slice(0, 10)}T${time}`) : null);
  const patch = {
    title: String(d.title ?? '').trim() || P().project.title, scheduleFrom: d.scheduleFrom, start: day(d.start, '08:00') ?? P().project.start,
    finish: d.scheduleFrom === 'finish' ? day(d.finish, '17:00') : P().project.finish, calendarId: d.calendarId, priority: Number(d.priority) || 500,
    statusDate: day(d.statusDate, '17:00'),
  };
  for (const key of ['subject', 'author', 'manager', 'company', 'category', 'keywords', 'comments']) patch[key] = d[key] ?? '';
  return close({ action: 'apply', patch, options: d.options });
}

// ───────────────────────── change working time (calendars)

const WEEKDAYS = () => (L() === 'en' ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']);

function renderCalendar() {
  const p = P();
  if (!state.cals) {
    state.cals = JSON.parse(JSON.stringify(p.calendars ?? []));
    state.calId = p.projectCalendar ?? state.cals[0]?.id;
    state.projectCalendar = p.projectCalendar;
  }
  const cal = state.cals.find((item) => item.id === state.calId) ?? state.cals[0];
  const tab = ['week', 'exceptions'].includes(state.tab) ? state.tab : 'week';
  const top = row('calendarEdit', t('calendar.forCalendar'), `${select('data-cal-select', 'calendar', state.cals.map((item) => [item.id, `${item.name}${item.id === state.projectCalendar ? ` (${t('calendar.projectCal')})` : ''}`]), cal.id, t('calendar.forCalendar'))}
    ${button('cal-new', t('calendar.new'), 'plus', 'small')}${button('cal-rename', t('calendar.rename'), 'edit', 'small')}${button('cal-delete', t('calendar.delete'), 'trash', 'small danger', '', cal.id === 'standard' || cal.id === state.projectCalendar ? 'disabled' : '')}
    ${button('cal-project', t('calendar.setProject'), 'check', 'small', '', cal.id === state.projectCalendar ? 'disabled' : '')}`);
  let body = '';
  if (tab === 'week') {
    const base = cal.base ? state.cals.find((item) => item.id === cal.base) : null;
    body = WEEKDAYS().map((name, wd) => {
      const own = Array.isArray(cal.week?.[wd]);
      const periods = normalizePeriods(own ? cal.week[wd] : base?.week?.[wd] ?? []);
      const working = periods.length > 0;
      const text = periods.map(([a, b]) => `${minToClock(a)}-${minToClock(b)}`).join(', ');
      return `<div class="row week-row" title="${escapeHtml(name)}"><span class="row-label">${icon(working ? 'calendar' : 'moon')}<span>${escapeHtml(name)}</span></span>
        <span class="row-control"><label class="switch-wrap" title="${escapeHtml(t('calendar.working'))}"><input type="checkbox" data-week-working="${wd}" ${working ? 'checked' : ''} aria-label="${escapeHtml(t('calendar.working'))}" /><span class="switch" aria-hidden="true"></span></label>
        <input type="text" class="periods" data-week-periods="${wd}" value="${escapeHtml(text)}" placeholder="08:00-12:00, 13:00-17:00" title="${escapeHtml(t('calendar.periods'))}" aria-label="${escapeHtml(t('calendar.periods'))}" ${working ? '' : 'disabled'} />
        <span class="muted hours">${escapeHtml(t('calendar.hours', { hours: periodMinutes(periods) / 60 }))}</span></span></div>`;
    }).join('') + row('info', '', `<span class="muted">${escapeHtml(t('calendar.weekHint'))}</span>`);
  } else {
    const list = cal.exceptions ?? [];
    const [page, pager] = paged('exceptions', list, 6);
    body = `<div class="row table-head"><span class="col-name">${escapeHtml(t('calendar.exName'))}</span><span class="col-date">${escapeHtml(t('calendar.exStart'))}</span><span class="col-date">${escapeHtml(t('calendar.exFinish'))}</span><span class="col-type">${escapeHtml(t('calendar.exKind'))}</span><span class="col-act"></span></div>
      ${page.length ? page.map((ex) => `<div class="row table-row"><span class="col-name" title="${escapeHtml(ex.name)}">${icon(ex.working ? 'clock' : 'moon')}${escapeHtml(ex.name || '—')}</span><span class="col-date">${escapeHtml(ex.start)}</span><span class="col-date">${escapeHtml(ex.finish)}</span><span class="col-type">${escapeHtml(ex.working ? `${t('calendar.workingEx')} ${normalizePeriods(ex.periods).map(([a, b]) => `${minToClock(a)}-${minToClock(b)}`).join(', ')}` : t('calendar.nonworking'))}</span>
        <span class="col-act"><button class="icon-button" data-action="ex-remove" data-value="${escapeHtml(ex.id)}" title="${escapeHtml(t('calendar.exRemove'))}" aria-label="${escapeHtml(t('calendar.exRemove'))}">${icon('trash')}</button></span></div>`).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('calendar.noExceptions'))}</span></div>`}
      ${pager ? `<div class="row">${pager}</div>` : ''}
      <h3 class="section-title">${icon('plus')}${escapeHtml(t('calendar.addException'))}</h3>
      <div class="row ex-new"><input type="text" id="ex-name" placeholder="${escapeHtml(t('calendar.exName'))}" title="${escapeHtml(t('calendar.exName'))}" aria-label="${escapeHtml(t('calendar.exName'))}" />
        ${dateField('ex:start', state.exStart ?? '', t('calendar.exStart'))}${dateField('ex:finish', state.exFinish ?? '', t('calendar.exFinish'))}
        <input type="text" id="ex-periods" placeholder="${escapeHtml(t('calendar.exPeriodsHint'))}" title="${escapeHtml(t('calendar.exPeriodsHint'))}" aria-label="${escapeHtml(t('calendar.exPeriodsHint'))}" />
        ${button('ex-add', t('calendar.exAdd'), 'plus', 'small primary')}</div>`;
  }
  root.innerHTML = frame({
    glyph: 'calendarEdit', title: t('calendar.title'),
    tabs: tabsHtml([['week', 'calendar', t('calendar.tabWeek')], ['exceptions', 'moon', t('calendar.tabExceptions')]], tab),
    body: `<div class="editor calendar-editor">${top}${body}</div>`,
    foot: `<span class="muted" id="calendar-error"></span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('calendar-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

function parsePeriods(text) {
  const out = [];
  for (const part of String(text ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
    const match = /^(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})$/.exec(part);
    if (!match) return null;
    const a = clockToMin(match[1]);
    const b = clockToMin(match[2]);
    if (a == null || b == null || b <= a) return null;
    out.push([a, b]);
  }
  return normalizePeriods(out);
}

// ───────────────────────── link (dependency)

function renderLink() {
  const p = P();
  if (!state.draft) state.draft = { type: p.link?.type ?? 'FS', lag: p.link?.lag ? formatLag(p.link.lag, p.link.lagUnit, p.options) : '' };
  const d = state.draft;
  root.innerHTML = frame({
    glyph: 'link2', title: t('link.title'),
    body: `<div class="editor">
      ${row('bar', t('link.from'), `<span class="path">${escapeHtml(`${p.from?.row}. ${p.from?.name ?? ''}`)}</span>`)}
      ${row('bar', t('link.to'), `<span class="path">${escapeHtml(`${p.to?.row}. ${p.to?.name ?? ''}`)}</span>`)}
      ${row('link', t('link.type'), select('data-draft-select', 'type', LINK_TYPES.map((type) => [type, t(`linkType.${type}`)]), d.type, t('link.type')))}
      ${row('hourglass', t('link.lag'), `<input type="text" data-draft="lag" id="link-lag" value="${escapeHtml(d.lag)}" placeholder="0d, 2d, -1d, 50%" title="${escapeHtml(t('link.lag'))}" aria-label="${escapeHtml(t('link.lag'))}" />`)}
    </div>`,
    foot: `${button('link-delete', t('link.delete'), 'unlink', 'danger')}<span class="muted" id="link-error"></span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('link-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── baseline

function renderBaseline() {
  const p = P();
  if (!state.draft) state.draft = { mode: p.mode ?? 'set', index: 0, scope: 'all', keepCopy: false };
  const d = state.draft;
  const options = Array.from({ length: BASELINE_COUNT }, (_, i) => [i, `${i === 0 ? t('baseline.name0') : t('baseline.nameN', { n: i })}${p.dates?.[i] ? ` (${t('baseline.savedAt', { date: new Date(p.dates[i]).toLocaleDateString() })})` : ''}`]);
  root.innerHTML = frame({
    glyph: d.mode === 'set' ? 'baselineSet' : 'baselineClear', title: t(d.mode === 'set' ? 'baseline.setTitle' : 'baseline.clearTitle'),
    body: `<div class="editor">
      ${row('baselineShow', t('baseline.action'), segmented('mode', [['set', t('baseline.set'), 'baselineSet'], ['clear', t('baseline.clear'), 'baselineClear']], d.mode, 'data-draft-segment'))}
      ${row('list', t('baseline.which'), select('data-draft-select', 'index', options, d.index, t('baseline.which')))}
      ${row('selectAll', t('baseline.for'), segmented('scope', [['all', t('baseline.entire')], ['selected', t('baseline.selected', { count: p.selected ?? 0 })]], d.scope, 'data-draft-segment'))}
      ${d.mode === 'set' && d.index === 0 && (p.saved ?? []).includes(0) ? toggle('keepCopy', t('baseline.keepCopy'), 'copy', d.keepCopy, 'data-draft-toggle') : ''}
      ${row('info', '', `<span class="muted">${escapeHtml(t(d.mode === 'set' ? 'baseline.setHint' : 'baseline.clearHint'))}</span>`)}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('baseline-apply', t('common.ok'), 'check', 'primary', '', d.scope === 'selected' && !p.selected ? 'disabled' : '')}`,
  });
  ready();
}

// ───────────────────────── export as image

function renderImage() {
  const p = P();
  if (!state.draft) state.draft = { format: 'png', transparent: true, content: 'both', scale: 2, quality: 92, ...(p.last ?? {}) };
  const d = state.draft;
  const format = imageFormat(d.format);
  const transparent = format.alpha && d.transparent;
  const drawing = p.sizes?.[d.content] ?? { width: 0, height: 0 };
  const size = format.encoder === 'svg' ? { width: Math.round(drawing.width), height: Math.round(drawing.height) } : rasterSize(drawing.width, drawing.height, Number(d.scale));
  const hint = !format.alpha ? t('image.noAlpha', { format: format.label }) : format.encoder === 'svg' ? t('image.vectorHint') : t('image.alphaHint');
  root.innerHTML = frame({
    glyph: 'exportImage', title: t('image.title'),
    body: `<div class="editor">
      ${row('imageFormat', t('image.format'), segmented('format', IMAGE_FORMATS.map((f) => [f.id, f.label]), d.format, 'data-draft-segment'))}
      ${row('palette', t('image.background'), segmented('transparent', [['true', t('image.transparent'), 'transparentBg'], ['false', t('image.white'), 'whiteBg']], String(transparent), 'data-draft-segment'), t('image.background'), format.alpha ? '' : 'disabled-row')}
      ${row('viewGantt', t('image.content'), segmented('content', [['both', t('image.both')], ['chart', t('image.chart')], ['table', t('image.table')]], d.content, 'data-draft-segment'))}
      ${row('zoomIn', t('image.scale'), segmented('scale', IMAGE_SCALES.map((n) => [String(n), `${n}×`]), String(d.scale), 'data-draft-segment'), t('image.scale'), format.encoder === 'svg' ? 'disabled-row' : '')}
      ${row('quality', t('image.quality'), numberField('draft:quality', d.quality, 40, 100, 4, '%', t('image.quality')), t('image.quality'), format.quality ? '' : 'disabled-row')}
      ${row('ruler', t('image.size'), `<span class="image-size" data-image-size>${size.width} × ${size.height} px</span>`)}
      ${row('info', '', `<span class="muted">${escapeHtml(hint)}</span>`)}
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('image-apply', t('image.export'), 'exportImage', 'primary')}`,
  });
  ready();
}

// ───────────────────────── update tasks / update project

function renderUpdate() {
  const p = P();
  const options = p.options ?? {};
  if (!state.draft) {
    state.draft = p.mode === 'task'
      ? { percentComplete: p.info?.percentComplete ?? 0, actualStart: p.task?.actualStart ?? '', actualFinish: p.task?.actualFinish ?? '', actualDuration: compactDuration(p.info?.actualDuration ?? 0, 'd', options), remainingDuration: compactDuration(p.info?.remainingDuration ?? 0, 'd', options) }
      : { date: p.statusDate ?? '', how: 'complete', scope: 'all' };
  }
  const d = state.draft;
  let body;
  if (p.mode === 'task') {
    body = [
      row('bar', t('field.name'), `<span class="path">${escapeHtml(p.task?.name ?? '')}</span>`),
      row('calendar', t('field.start'), `<span class="muted">${escapeHtml(formatDay(p.info?.start, p.dateFormat ?? 'iso', true))}</span>`),
      row('flag', t('field.finish'), `<span class="muted">${escapeHtml(formatDay(p.info?.finish, p.dateFormat ?? 'iso', true))}</span>`),
      row('percent', t('field.percentComplete'), numberField('draft:percentComplete', d.percentComplete, 0, 100, 5, '%', t('field.percentComplete'))),
      row('hourglass', t('field.actualDuration'), `<input type="text" data-draft="actualDuration" value="${escapeHtml(d.actualDuration)}" title="${escapeHtml(t('field.actualDuration'))}" aria-label="${escapeHtml(t('field.actualDuration'))}" />`),
      row('hourglass', t('field.remainingDuration'), `<input type="text" data-draft="remainingDuration" value="${escapeHtml(d.remainingDuration)}" title="${escapeHtml(t('field.remainingDuration'))}" aria-label="${escapeHtml(t('field.remainingDuration'))}" />`),
      row('play', t('field.actualStart'), dateField('draft:actualStart', d.actualStart, t('field.actualStart'))),
      row('check', t('field.actualFinish'), dateField('draft:actualFinish', d.actualFinish, t('field.actualFinish'))),
    ].join('');
  } else {
    body = [
      row('statusDate', t('update.through'), dateField('draft:date', d.date, t('update.through'))),
      row('onTrack', t('update.how'), segmented('how', [['complete', t('update.howComplete')], ['reschedule', t('update.howReschedule')]], d.how, 'data-draft-segment')),
      row('selectAll', t('update.for'), segmented('scope', [['all', t('baseline.entire')], ['selected', t('baseline.selected', { count: p.selected ?? 0 })]], d.scope, 'data-draft-segment')),
      row('info', '', `<span class="muted">${escapeHtml(t(d.how === 'complete' ? 'update.completeHint' : 'update.rescheduleHint'))}</span>`),
    ].join('');
  }
  root.innerHTML = frame({
    glyph: p.mode === 'task' ? 'updateTasks' : 'updateProject', title: t(p.mode === 'task' ? 'update.taskTitle' : 'update.projectTitle'),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="muted" id="update-error"></span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('update-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── leveling

function renderLeveling() {
  const p = P();
  if (!state.draft) state.draft = { ...p.options };
  const d = state.draft;
  root.innerHTML = frame({
    glyph: 'levelOptions', title: t('leveling.title'),
    body: `<div class="editor">
      ${row('sort', t('leveling.order'), segmented('order', [['standard', t('leveling.standard')], ['id', t('leveling.byId')], ['priority', t('leveling.byPriority')]], d.order, 'data-draft-segment'))}
      ${toggle('withinSlack', t('leveling.withinSlack'), 'slack', d.withinSlack, 'data-draft-toggle')}
      ${toggle('clear', t('leveling.clearFirst'), 'levelClear', d.clear !== false, 'data-draft-toggle')}
      ${row('overallocation', t('leveling.over'), `<span class="path ${p.over?.length ? 'danger-text' : ''}" title="${escapeHtml((p.over ?? []).join(', '))}">${escapeHtml(p.over?.length ? p.over.join(', ') : t('leveling.none'))}</span>`)}
      ${row('info', '', `<span class="muted">${escapeHtml(t('leveling.hint'))}</span>`)}
    </div>`,
    foot: `${button('leveling-clear', t('action.clearLeveling'), 'levelClear')}<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('leveling-ok', t('common.save'), 'save')}${button('leveling-run', t('leveling.levelNow'), 'level', 'primary')}`,
  });
  ready();
}

// ───────────────────────── recurring task

function renderRecurring() {
  const p = P();
  const options = p.options ?? {};
  if (!state.draft) state.draft = { name: t('recurring.defaultName'), duration: '1h', kind: 'weekly', every: 1, weekdays: [1], dayOfMonth: 1, start: String(p.start ?? '').slice(0, 10), end: '', count: 8, endBy: 'count', time: '10:00', workdaysOnly: true };
  const d = state.draft;
  const days = L() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['일', '월', '화', '수', '목', '금', '토'];
  root.innerHTML = frame({
    glyph: 'recurring', title: t('recurring.title'),
    body: `<div class="editor">
      ${row('edit', t('recurring.name'), `<input type="text" data-draft="name" value="${escapeHtml(d.name)}" title="${escapeHtml(t('recurring.name'))}" aria-label="${escapeHtml(t('recurring.name'))}" />`)}
      ${row('hourglass', t('recurring.duration'), `<input type="text" data-draft="duration" value="${escapeHtml(d.duration)}" title="${escapeHtml(t('recurring.duration'))}" aria-label="${escapeHtml(t('recurring.duration'))}" /><input type="text" data-draft="time" value="${escapeHtml(d.time)}" class="short" title="${escapeHtml(t('recurring.time'))}" aria-label="${escapeHtml(t('recurring.time'))}" />`)}
      ${row('recurring', t('recurring.pattern'), segmented('kind', PATTERNS.map((k) => [k, t(`recurring.${k}`)]), d.kind, 'data-draft-segment'))}
      ${row('refresh', t('recurring.every'), numberField('draft:every', d.every, 1, 52, 1, '', t('recurring.every')))}
      ${d.kind === 'weekly' ? row('calendar', t('recurring.on'), `<span class="day-checks">${days.map((name, wd) => `<label title="${escapeHtml(name)}"><input type="checkbox" data-weekday="${wd}" ${d.weekdays.includes(wd) ? 'checked' : ''} /><span>${escapeHtml(name)}</span></label>`).join('')}</span>`) : ''}
      ${d.kind === 'monthly' || d.kind === 'yearly' ? row('calendar', t('recurring.dayOfMonth'), numberField('draft:dayOfMonth', d.dayOfMonth, 1, 31, 1, '', t('recurring.dayOfMonth'))) : ''}
      ${d.kind === 'daily' ? toggle('workdaysOnly', t('recurring.workdaysOnly'), 'calendar', d.workdaysOnly, 'data-draft-toggle') : ''}
      ${row('play', t('recurring.start'), dateField('draft:start', d.start, t('recurring.start')))}
      ${row('stop', t('recurring.endBy'), `${segmented('endBy', [['count', t('recurring.afterCount')], ['date', t('recurring.byDate')]], d.endBy, 'data-draft-segment')}${d.endBy === 'count' ? numberField('draft:count', d.count, 1, 500, 1, '', t('recurring.count')) : dateField('draft:end', d.end, t('recurring.end'))}`)}
    </div>`,
    foot: `<span class="muted" id="recurring-error"></span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('recurring-apply', t('common.ok'), 'check', 'primary')}`,
  });
  void options;
  ready();
}

// ───────────────────────── find / replace / go to / date range

function renderFind() {
  const p = P();
  if (!state.draft) state.draft = { mode: p.mode ?? 'find', text: p.text ?? '', replacement: '', field: 'name', matchCase: false, whole: false, row: '', date: '', from: String(p.from ?? '').slice(0, 10), to: String(p.to ?? '').slice(0, 10), message: '' };
  const d = state.draft;
  const fields = (p.fields ?? ['name']).map((f) => [f, t(`field.${f}`)]);
  let body;
  if (d.mode === 'goto') {
    body = [
      row('list', t('find.row'), `<input type="text" data-draft="row" id="find-row" value="${escapeHtml(d.row)}" inputmode="numeric" title="${escapeHtml(t('find.row'))}" aria-label="${escapeHtml(t('find.row'))}" />`),
      row('calendar', t('find.date'), dateField('draft:date', d.date, t('find.date'))),
    ].join('');
  } else if (d.mode === 'range') {
    body = [
      row('play', t('find.from'), dateField('draft:from', d.from, t('find.from'))),
      row('stop', t('find.to'), dateField('draft:to', d.to, t('find.to'))),
      row('info', '', `<span class="muted">${escapeHtml(t('find.rangeHint'))}</span>`),
    ].join('');
  } else {
    body = [
      row('search', t('find.what'), `<input type="text" data-draft="text" id="find-text" value="${escapeHtml(d.text)}" title="${escapeHtml(t('find.what'))}" aria-label="${escapeHtml(t('find.what'))}" />`),
      d.mode === 'replace' ? row('replace', t('find.with'), `<input type="text" data-draft="replacement" value="${escapeHtml(d.replacement)}" title="${escapeHtml(t('find.with'))}" aria-label="${escapeHtml(t('find.with'))}" />`) : '',
      row('columns', t('find.field'), select('data-draft-select', 'field', fields, d.field, t('find.field'))),
      toggle('matchCase', t('find.matchCase'), 'font', d.matchCase, 'data-draft-toggle'),
      toggle('whole', t('find.whole'), 'selectAll', d.whole, 'data-draft-toggle'),
      row('info', t('find.result'), `<span id="find-message" class="muted">${escapeHtml(d.message)}</span>`),
    ].join('');
  }
  const modes = [['find', 'search', t('find.tabFind')], ['replace', 'replace', t('find.tabReplace')], ['goto', 'goTo', t('find.tabGoto')], ['range', 'calendar', t('find.tabRange')]];
  const foot = d.mode === 'goto' ? button('go', t('find.go'), 'goTo', 'primary')
    : d.mode === 'range' ? button('range-apply', t('find.applyRange'), 'filter', 'primary')
      : `${button('find-prev', t('find.prev'), 'chevronUp')}${button('find-next', t('find.next'), 'chevronDown', 'primary')}${d.mode === 'replace' ? button('replace-all', t('find.replaceAll'), 'replace') : ''}`;
  root.innerHTML = frame({
    glyph: modes.find(([id]) => id === d.mode)[1], title: t('find.title'),
    tabs: tabsHtml(modes, d.mode, 'find-mode'),
    body: `<div class="editor">${body}</div>`,
    foot: `<span class="grow"></span>${foot}${button('close', t('common.close'), 'close')}`,
  });
  if (!shown) root.querySelector('#find-text, #find-row')?.focus();
  ready();
}

// ───────────────────────── columns

function renderColumns() {
  const p = P();
  if (!state.cols) state.cols = [...(p.columns ?? [])];
  const cols = state.cols;
  const map = p.kind === 'resource' ? RESOURCE_FIELD_MAP : TASK_FIELD_MAP;
  const available = (p.all ?? []).filter((id) => !cols.includes(id) && map.has(id));
  const [shownList, shownPager, shownStart] = paged('cols-shown', cols, 10);
  const [availList, availPager] = paged('cols-avail', available, 10);
  root.innerHTML = frame({
    glyph: 'columns', title: `${t('columns.title')} — ${t(`tableName.${p.table ?? 'entry'}`)}`,
    body: `<div class="columns-editor">
      <section><h3 class="section-title">${icon('eye')}${escapeHtml(t('columns.shown'))} (${cols.length})${shownPager}</h3>
        ${shownList.map((id, i) => `<div class="row col-row"><span class="row-label">${icon('columns')}<span>${escapeHtml(t(`field.${id}`))}</span></span><span class="row-control">
          <button class="icon-button" data-action="col-up" data-value="${shownStart + i}" title="${escapeHtml(t('columns.up'))}" aria-label="${escapeHtml(t('columns.up'))}" ${shownStart + i === 0 ? 'disabled' : ''}>${icon('moveUp')}</button>
          <button class="icon-button" data-action="col-down" data-value="${shownStart + i}" title="${escapeHtml(t('columns.down'))}" aria-label="${escapeHtml(t('columns.down'))}" ${shownStart + i === cols.length - 1 ? 'disabled' : ''}>${icon('moveDown')}</button>
          <button class="icon-button" data-action="col-hide" data-value="${escapeHtml(id)}" title="${escapeHtml(t('columns.hide'))}" aria-label="${escapeHtml(t('columns.hide'))}" ${id === 'name' ? 'disabled' : ''}>${icon('chevronRight')}</button></span></div>`).join('')}
      </section>
      <section><h3 class="section-title">${icon('list')}${escapeHtml(t('columns.available'))} (${available.length})${availPager}</h3>
        ${availList.map((id) => `<div class="row col-row"><span class="row-control start"><button class="icon-button" data-action="col-show" data-value="${escapeHtml(id)}" title="${escapeHtml(t('columns.show'))}" aria-label="${escapeHtml(t('columns.show'))}">${icon('chevronLeft')}</button></span><span class="row-label">${icon('columns')}<span>${escapeHtml(t(`field.${id}`))}</span></span></div>`).join('') || `<div class="row empty">${icon('check')}<span>${escapeHtml(t('columns.allShown'))}</span></div>`}
      </section>
    </div>`,
    foot: `${button('col-reset', t('columns.reset'), 'refresh')}<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('columns-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── assign resources

function renderAssign() {
  const p = P();
  if (!state.assign) {
    const units = new Map();
    for (const r of p.resources ?? []) {
      const list = (p.assignments ?? []).filter((a) => a.resourceId === r.id);
      if (list.length === (p.tasks ?? []).length && list.length) units.set(r.id, { units: list[0].units, cost: list[0].cost });
    }
    state.assign = { units, original: new Map(units), newResources: [] };
  }
  const a = state.assign;
  const resources = [...(p.resources ?? []), ...a.newResources];
  const [page, pager] = paged('assign', resources, 8);
  root.innerHTML = frame({
    glyph: 'assign', title: `${t('assign.title')} — ${(p.tasks ?? []).length === 1 ? p.tasks[0].name : t('props.multi', { count: (p.tasks ?? []).length })}`,
    body: `<div class="editor">
      <div class="row table-head"><span class="col-check"></span><span class="col-name">${escapeHtml(t('field.name'))}</span><span class="col-type">${escapeHtml(t('field.resourceType'))}</span><span class="col-units">${escapeHtml(t('taskInfo.units'))}</span></div>
      ${page.length ? page.map((r) => {
        const assigned = a.units.has(r.id);
        const value = r.type === 'work' ? Math.round((a.units.get(r.id)?.units ?? 1) * 100) : r.type === 'cost' ? (a.units.get(r.id)?.cost ?? 0) : (a.units.get(r.id)?.units ?? 1);
        return `<div class="row table-row ${assigned ? 'assigned' : ''}"><span class="col-check"><input type="checkbox" data-assign-check="${escapeHtml(r.id)}" ${assigned ? 'checked' : ''} title="${escapeHtml(t('assign.toggle'))}" aria-label="${escapeHtml(t('assign.toggle'))}" /></span>
          <span class="col-name">${icon(r.overallocated ? 'overallocation' : r.type === 'material' ? 'layers' : r.type === 'cost' ? 'money' : 'user')}<span class="${r.overallocated ? 'danger-text' : ''}">${escapeHtml(r.name || '—')}</span></span>
          <span class="col-type">${escapeHtml(t(`resourceType.${r.type}`))}</span>
          <span class="col-units">${assigned ? numberField(`unit:${r.id}`, value, 0, r.type === 'cost' ? 100000000 : 10000, r.type === 'work' ? 10 : 1, r.type === 'work' ? '%' : '', t('taskInfo.units')) : ''}</span></div>`;
      }).join('') : `<div class="row empty">${icon('info')}<span>${escapeHtml(t('taskInfo.noResources'))}</span></div>`}
      <div class="row"><input type="text" id="new-resource" placeholder="${escapeHtml(t('assign.newPlaceholder'))}" title="${escapeHtml(t('assign.newPlaceholder'))}" aria-label="${escapeHtml(t('assign.newPlaceholder'))}" />${button('assign-new', t('assign.add'), 'resourceAdd', 'small')}<span class="grow"></span>${pager}</div>
    </div>`,
    foot: `<span class="muted">${escapeHtml(t('assign.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('assign-apply', t('common.ok'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-theme-group], [data-pick-theme], [data-draft-segment], [data-print-segment], [data-draft-color]');
  if (!target || target.disabled) return undefined;
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id);
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const raw = target.dataset.value;
    return update({ [key]: typeof s()[key] === 'number' ? Number(raw) : raw });
  }
  if (target.dataset.themeGroup) { state.themeGroup = target.dataset.themeGroup; return render(); }
  if (target.dataset.pickTheme) { pickerDone = true; return close({ theme: target.dataset.pickTheme }); }
  if (target.dataset.draftSegment) {
    const key = target.dataset.draftSegment;
    const value = target.dataset.value;
    state.draft[key] = value === 'true' ? true : value === 'false' ? false : value;
    state.draft.touched?.add(key);
    return render();
  }
  if (target.dataset.printSegment) return changePrint({ [target.dataset.printSegment]: target.dataset.value });
  if (target.dataset.draftColor !== undefined) { state.draft.barColor = target.dataset.draftColor; state.draft.touched?.add('barColor'); return render(); }
  const value = target.dataset.value;
  const d = state.draft;
  switch (target.dataset.action) {
    case 'close':
      if (kind === 'menu') return chooseMenu(null);
      return close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null);
    case 'tab':
      state.tab = value;
      return render();
    case 'tabs-scroll':
      return scrollPopupTabs(Number(value));
    case 'pager': {
      const [name, step] = value.split(':');
      state.pager[name] = (state.pager[name] ?? 0) + Number(step);
      return render();
    }
    case 'choice':
      return close({ choice: value });
    case 'reset-settings': {
      const keep = { backgroundImage: s().backgroundImage, backgroundName: s().backgroundName, lastDirectory: s().lastDirectory, language: s().language, tutorialOffered: true, tutorialDone: s().tutorialDone };
      return update({ ...defaultSettings(s().language), ...keep });
    }
    case 'choose-background': return action('choose-background');
    case 'clear-background': return action('clear-background');
    case 'shuffle-background': return action('shuffle-background');
    case 'start-tutorial': await action('start-tutorial'); return close();
    case 'open-recent':
      await action('open-recent', { path: value });
      return kind === 'recent' ? close() : undefined;
    case 'open-folder':
      await action('open-folder', { path: value });
      return kind === 'recent' ? close() : undefined;
    case 'remove-recent':
      storeRecent(globalThis.localStorage, removeRecent(loadRecent(globalThis.localStorage), value));
      return render();
    case 'remove-folder':
      storeRecentDirs(globalThis.localStorage, removeRecent(loadRecentDirs(globalThis.localStorage), value));
      return render();
    case 'clear-recent':
      storeRecent(globalThis.localStorage, []);
      return render();
    case 'clear-folders':
      storeRecentDirs(globalThis.localStorage, []);
      return render();
    case 'db-test': return testDatabase();
    case 'db-browse': return action('db-browse');
    case 'db-open': return close({ action: 'open', id: value });
    case 'db-delete': return action('db-delete', { id: value, title: target.dataset.title ?? '' });
    case 'db-refresh': return action('db-refresh');
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
      return copyText([...root.querySelectorAll('#about-rows dt')].map((dt) => `${dt.textContent.trim()}: ${dt.nextElementSibling.textContent.trim()}`).join('\n'))
        .then(() => action('notice', { kind: 'success', text: t('error.copied') }));
    case 'page':
      state.page += Number(value);
      return render();
    case 'print':
      return doPrint();
    case 'use-custom':
      return update({ theme: CUSTOM });
    case 'copy-theme': {
      const from = resolveTheme(s().theme === CUSTOM ? 'light' : s().theme, prefersDark(), s().customTheme);
      return update({ customTheme: customFrom(from) });
    }
    case 'edit-custom':
      pickerDone = true;
      await action('open-settings', { tab: 'appearance', themeGroup: 'custom' });
      return close();
    case 'random-theme': {
      const all = [...LIGHT_THEMES, ...DARK_THEMES].map((theme) => theme.id).filter((id) => id !== s().theme);
      pickerDone = true;
      return close({ theme: all[Math.floor(Math.random() * all.length)] });
    }
    // task information
    case 'task-apply': return applyTask();
    case 'pred-add': {
      const first = (P().tasks ?? []).find((item) => item.id !== P().task?.id && !d.predecessors.some((link) => link.taskId === item.id));
      if (first) d.predecessors.push({ taskId: first.id, type: 'FS', lag: 0, lagUnit: 'd', lagText: '' });
      state.pager.preds = Math.floor((d.predecessors.length - 1) / 7);
      return render();
    }
    case 'pred-remove': d.predecessors.splice(Number(value), 1); return render();
    case 'assign-add': {
      const free = (P().resources ?? []).find((r) => !d.assignments.some((a) => a.resourceId === r.id)) ?? P().resources?.[0];
      if (free) d.assignments.push({ resourceId: free.id, units: free.type === 'work' ? 1 : 1, cost: 0 });
      state.pager.res = Math.floor((d.assignments.length - 1) / 7);
      return render();
    }
    case 'assign-remove': d.assignments.splice(Number(value), 1); return render();
    // resource information
    case 'resource-apply': return applyResource();
    // project
    case 'project-apply': return applyProject();
    // calendar
    case 'cal-new': {
      const base = state.cals.find((item) => item.id === state.calId) ?? state.cals[0];
      const id = `cal-${Date.now().toString(36)}`;
      state.cals.push({ ...JSON.parse(JSON.stringify(base)), id, name: t('calendar.copyName', { name: base.name }), base: null });
      state.calId = id;
      return render();
    }
    case 'cal-rename': {
      const cal = state.cals.find((item) => item.id === state.calId);
      const name = root.querySelector('[data-cal-name]')?.value;
      state.renaming = !state.renaming;
      if (!state.renaming && name) cal.name = name;
      if (state.renaming) {
        const control = target.closest('.row-control');
        control.insertAdjacentHTML('afterbegin', `<input type="text" data-cal-name value="${escapeHtml(cal.name)}" title="${escapeHtml(t('calendar.rename'))}" aria-label="${escapeHtml(t('calendar.rename'))}" />`);
        control.querySelector('[data-cal-name]').focus();
        return undefined;
      }
      return render();
    }
    case 'cal-delete': state.cals = state.cals.filter((item) => item.id !== state.calId); state.calId = state.projectCalendar; return render();
    case 'cal-project': state.projectCalendar = state.calId; return render();
    case 'ex-remove': {
      const cal = state.cals.find((item) => item.id === state.calId);
      cal.exceptions = cal.exceptions.filter((ex) => ex.id !== value);
      return render();
    }
    case 'ex-add': {
      const cal = state.cals.find((item) => item.id === state.calId);
      const name = root.querySelector('#ex-name').value.trim();
      const start = state.exStart;
      const finish = state.exFinish || start;
      const periodsText = root.querySelector('#ex-periods').value.trim();
      const periods = periodsText ? parsePeriods(periodsText) : [];
      const error = root.querySelector('#calendar-error');
      if (!start) { error.textContent = t('calendar.needStart'); return undefined; }
      if (periods == null) { error.textContent = t('calendar.badPeriods'); return undefined; }
      if (finish < start) { error.textContent = t('calendar.badRange'); return undefined; }
      cal.exceptions = [...(cal.exceptions ?? []), { id: `ex-${Date.now().toString(36)}`, name: name || t('calendar.holiday'), start, finish, working: periods.length > 0, periods }].sort((x, y) => x.start.localeCompare(y.start));
      state.exStart = '';
      state.exFinish = '';
      return render();
    }
    case 'calendar-apply': {
      const error = root.querySelector('#calendar-error');
      for (const input of root.querySelectorAll('[data-week-periods]')) {
        if (!input.disabled && parsePeriods(input.value) == null) { if (error) error.textContent = t('calendar.badPeriods'); return undefined; }
      }
      return close({ action: 'apply', calendars: state.cals, projectCalendar: state.projectCalendar });
    }
    // link
    case 'link-delete': return close({ action: 'delete' });
    case 'link-apply': {
      const text = String(d.lag ?? '').trim();
      let lag = { lag: 0, lagUnit: 'd' };
      if (text) {
        const percent = /^([-+]?\d*\.?\d+)\s*%$/.exec(text);
        if (percent) lag = { lag: Number(percent[1]), lagUnit: '%' };
        else {
          const parsed = parseDuration(text, P().options, 'd', { allowNegative: true });
          if (!parsed) { root.querySelector('#link-error').textContent = t('field.badDuration'); return undefined; }
          lag = { lag: parsed.minutes, lagUnit: parsed.unit };
        }
      }
      return close({ action: 'apply', type: d.type, ...lag });
    }
    // baseline
    case 'image-apply': return close({ format: d.format, transparent: imageFormat(d.format).alpha && d.transparent, content: d.content, scale: Number(d.scale), quality: Number(d.quality) });
    case 'baseline-apply': return close({ action: d.mode, index: Number(d.index), scope: d.scope, keepCopy: d.keepCopy, copyTo: 1 });
    // update
    case 'update-apply': {
      const p = P();
      if (p.mode === 'task') {
        const parse = (text) => parseDuration(text, p.options, 'd');
        const actual = parse(d.actualDuration);
        const remaining = parse(d.remainingDuration);
        if (!actual || !remaining) { root.querySelector('#update-error').textContent = t('field.badDuration'); return undefined; }
        const changedDurations = actual.minutes !== (p.info?.actualDuration ?? 0) || remaining.minutes !== (p.info?.remainingDuration ?? 0);
        return close({
          action: 'apply',
          values: {
            percentComplete: Number(d.percentComplete),
            actualStart: d.actualStart ? (String(d.actualStart).length > 10 ? String(d.actualStart).slice(0, 16) : `${d.actualStart}T08:00`) : null,
            actualFinish: d.actualFinish ? (String(d.actualFinish).length > 10 ? String(d.actualFinish).slice(0, 16) : `${d.actualFinish}T17:00`) : null,
            ...(changedDurations ? { actualDuration: actual.minutes, remainingDuration: remaining.minutes } : {}),
          },
        });
      }
      if (!d.date) { root.querySelector('#update-error').textContent = t('field.badDate'); return undefined; }
      return close({ action: 'apply', date: String(d.date).length > 10 ? String(d.date).slice(0, 16) : `${d.date}T17:00`, how: d.how, scope: d.scope });
    }
    // leveling
    case 'leveling-ok': return close({ action: 'save', options: { order: d.order, withinSlack: Boolean(d.withinSlack), clear: d.clear !== false } });
    case 'leveling-run': return close({ action: 'level', options: { order: d.order, withinSlack: Boolean(d.withinSlack), clear: d.clear !== false } });
    case 'leveling-clear': return close({ action: 'clear', options: { order: d.order, withinSlack: Boolean(d.withinSlack), clear: d.clear !== false } });
    // recurring
    case 'recurring-apply': {
      const p = P();
      const parsed = parseDuration(d.duration, p.options, 'h');
      const error = root.querySelector('#recurring-error');
      if (!parsed || parsed.minutes <= 0) { error.textContent = t('field.badDuration'); return undefined; }
      if (!d.start) { error.textContent = t('field.badDate'); return undefined; }
      const time = clockToMin(d.time) ?? 480;
      return close({
        action: 'apply',
        data: {
          name: d.name.trim() || t('recurring.defaultName'), duration: parsed.minutes, durationUnit: parsed.unit, startTime: time,
          pattern: { kind: d.kind, every: Number(d.every), weekdays: d.weekdays, dayOfMonth: Number(d.dayOfMonth), workdaysOnly: d.workdaysOnly, start: d.start, end: d.endBy === 'date' ? d.end : null, count: d.endBy === 'count' ? Number(d.count) : null },
        },
      });
    }
    // find
    case 'find-mode': d.mode = value; return render();
    case 'find-next': return action('find-next', { text: d.text, field: d.field, matchCase: d.matchCase, whole: d.whole, direction: 1 });
    case 'find-prev': return action('find-next', { text: d.text, field: d.field, matchCase: d.matchCase, whole: d.whole, direction: -1 });
    case 'replace-all': return action('replace-all', { text: d.text, replacement: d.replacement, field: d.field, matchCase: d.matchCase, whole: d.whole });
    case 'go': await action('go-to', { row: d.row ? Number(d.row) : null, date: d.date || null }); return close();
    case 'range-apply': await action('date-range', { from: d.from ? `${d.from}T00:00` : null, to: d.to ? `${d.to}T23:59` : null }); return close();
    // columns
    case 'col-up': { const i = Number(value); [state.cols[i - 1], state.cols[i]] = [state.cols[i], state.cols[i - 1]]; return render(); }
    case 'col-down': { const i = Number(value); [state.cols[i + 1], state.cols[i]] = [state.cols[i], state.cols[i + 1]]; return render(); }
    case 'col-hide': state.cols = state.cols.filter((id) => id !== value); return render();
    case 'col-show': state.cols.push(value); return render();
    case 'col-reset': state.cols = [...(P().defaults ?? [])]; return render();
    case 'columns-apply': return close({ columns: state.cols });
    // assign
    case 'assign-new': {
      const name = root.querySelector('#new-resource').value.trim();
      if (!name) return undefined;
      const id = `r-new-${Date.now().toString(36)}`;
      state.assign.newResources.push({ id, name, type: 'work', maxUnits: 1 });
      state.assign.units.set(id, { units: 1 });
      return render();
    }
    case 'assign-apply': {
      const a = state.assign;
      const changes = [];
      const all = [...(P().resources ?? []), ...a.newResources];
      for (const r of all) {
        const now = a.units.get(r.id);
        const before = a.original.get(r.id);
        if (now && (!before || before.units !== now.units || before.cost !== now.cost)) changes.push({ resourceId: r.id, units: r.type === 'cost' ? 1 : now.units, cost: r.type === 'cost' ? now.cost ?? 0 : undefined });
        else if (!now && before) changes.push({ resourceId: r.id, units: 0 });
      }
      return close({ action: 'apply', changes, newResources: a.newResources });
    }
    default:
      return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  const d = state.draft;
  if (target.dataset.toggle) return update({ [target.dataset.toggle]: target.checked });
  // Database text fields are stored without redrawing (a redraw here would swallow a click on "Test connection").
  if (target.dataset.dbText || 'dbPassword' in target.dataset) {
    const patch = target.dataset.dbText ? { [target.dataset.dbText]: target.value.trim() } : null;
    if (!patch) state.dbPassword = target.value;
    if (!patch && !s().dbSavePassword) action('db-password', { password: target.value });
    const changes = patch ?? (s().dbSavePassword ? { dbPassword: target.value } : null);
    if (changes) {
      state.settings = { ...state.settings, ...changes };
      storeSettings(globalThis.localStorage, state.settings);
    }
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
  if (target.dataset.select) {
    const key = target.dataset.select;
    return update({ [key]: typeof s()[key] === 'number' ? Number(target.value) : target.value });
  }
  if (target.dataset.customColor) return update({ customTheme: { ...s().customTheme, [target.dataset.customColor]: target.value }, theme: CUSTOM });
  if ('customDark' in target.dataset) return update({ customTheme: { ...s().customTheme, dark: target.checked }, theme: CUSTOM });
  if (target.dataset.draftToggle) { d[target.dataset.draftToggle] = target.checked; d.touched?.add(target.dataset.draftToggle); return render(); }
  if (target.dataset.draftSelect) {
    const key = target.dataset.draftSelect;
    d[key] = key === 'index' ? Number(target.value) : target.value;
    d.touched?.add(key);
    return render();
  }
  if (target.dataset.option) { d.options[target.dataset.option] = target.value; return undefined; }
  if (target.dataset.optionToggle) { d.options[target.dataset.optionToggle] = target.checked; return undefined; }
  if (target.dataset.predTask) { d.predecessors[Number(target.dataset.predTask)].taskId = target.value; return render(); }
  if (target.dataset.predType) { d.predecessors[Number(target.dataset.predType)].type = target.value; return undefined; }
  if (target.dataset.assignResource) { d.assignments[Number(target.dataset.assignResource)].resourceId = target.value; return render(); }
  if (target.dataset.calSelect) { state.calId = target.value; return render(); }
  if (target.dataset.weekWorking) {
    const cal = state.cals.find((item) => item.id === state.calId);
    const wd = Number(target.dataset.weekWorking);
    cal.week = { ...cal.week, [wd]: target.checked ? [[480, 720], [780, 1020]] : [] };
    return render();
  }
  if (target.dataset.weekPeriods) {
    const cal = state.cals.find((item) => item.id === state.calId);
    const periods = parsePeriods(target.value);
    const error = root.querySelector('#calendar-error');
    if (periods == null) { error.textContent = t('calendar.badPeriods'); target.classList.add('invalid'); return undefined; }
    error.textContent = '';
    cal.week = { ...cal.week, [Number(target.dataset.weekPeriods)]: periods };
    return render();
  }
  if (target.dataset.weekday) {
    const wd = Number(target.dataset.weekday);
    d.weekdays = target.checked ? [...new Set([...d.weekdays, wd])].sort() : d.weekdays.filter((x) => x !== wd);
    return undefined;
  }
  if (target.dataset.assignCheck) {
    const id = target.dataset.assignCheck;
    if (target.checked) state.assign.units.set(id, { units: 1, cost: 0 }); else state.assign.units.delete(id);
    return render();
  }
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
  }
  if (target.dataset.predLag) state.draft.predecessors[Number(target.dataset.predLag)].lagText = target.value;
  if ('dbPassword' in target.dataset) state.dbPassword = target.value;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (kind === 'menu') chooseMenu(null);
    else if (kind !== 'progress') close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null);
  }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    if (event.key === 'Enter' && document.activeElement?.classList.contains('menu-item')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id); }
    if (event.key === 'ArrowRight' && document.activeElement?.classList.contains('has-sub')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id); }
  }
  if (kind === 'print' && event.key === 'PageDown') { state.page += 1; render(); }
  if (kind === 'print' && event.key === 'PageUp') { state.page -= 1; render(); }
  if (event.key === 'Enter' && event.target.matches?.('input[type="text"]') && !event.target.matches('.date-input, .stepper-value')) {
    const primary = { task: 'task-apply', resource: 'resource-apply', link: 'link-apply', project: 'project-apply', find: state.draft?.mode === 'goto' ? 'go' : 'find-next', recurring: 'recurring-apply' }[kind];
    if (primary) { event.preventDefault(); root.querySelector(`[data-action="${primary}"]`)?.click(); }
  }
});
document.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('textarea, input')) event.preventDefault();
});

// The theme dropdown closes when it loses focus.
window.addEventListener('blur', () => {
  if (kind === 'theme' && !pickerDone) setTimeout(() => { if (!document.hasFocus() && !pickerDone) { pickerDone = true; close(); } }, 120);
});

// Date fields (calendar).
bindDateFields(root, () => calendarText(t, L()), (key, value) => {
  const [scope, field] = key.split(':');
  if (scope === 'draft' && state.draft) { state.draft[field] = value; state.draft.touched?.add(field); }
  else if (scope === 'print') changePrint({ [field]: value || null });
  else if (scope === 'ex') { if (field === 'start') state.exStart = value; else state.exFinish = value; }
});

// Number fields (steppers).
bindSteppers(root, (key, value) => {
  const [scope, field] = key.includes(':') ? key.split(':') : ['setting', key];
  if (scope === 'setting') update({ [field]: value });
  else if (scope === 'print') changePrint({ [field]: value });
  else if (scope === 'draft') {
    if (field === 'maxUnitsPct') state.draft.maxUnits = value / 100;
    else state.draft[field] = value;
    state.draft.touched?.add(field);
  } else if (scope === 'option') state.draft.options[field] = value;
  else if (scope === 'assign') {
    const a = state.draft.assignments[Number(field)];
    const r = (P().resources ?? []).find((item) => item.id === a.resourceId);
    if (r?.type === 'work') a.units = value / 100; else if (r?.type === 'cost') a.cost = value; else a.units = value;
  } else if (scope === 'rassign') state.draft.assignments[Number(field)].units = value / 100;
  else if (scope === 'unit') {
    const id = key.slice(5);
    const r = [...(P().resources ?? []), ...state.assign.newResources].find((item) => item.id === id);
    const entry = state.assign.units.get(id) ?? {};
    if (r?.type === 'work') entry.units = value / 100; else if (r?.type === 'cost') entry.cost = value; else entry.units = value;
    state.assign.units.set(id, entry);
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

// Settings changed elsewhere (main window: zoom, panels, theme menu…).
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    state.settings = loadSettings(globalThis.localStorage);
    applyLook();
    if (kind !== 'menu') render();
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
    state.draft.message = message.count != null ? t('find.replaced', { count: message.count }) : message.found ? t('find.foundAt', { row: message.row }) : t('find.notFound');
    const el = root.querySelector('#find-message');
    if (el) el.textContent = state.draft.message;
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
  state.cals = null;
  state.cols = null;
  state.assign = null;
  state.print = null;
  state.printData = null;
  if (kind === 'theme') { state.placed = false; pickerDone = false; }
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
    if (event.origin === location.origin && event.data?.myworkplanHost) onHostMessage(event.data);
  });
}
window.addEventListener('resize', () => { if (kind === 'print') fitPreview(); });

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__myworkplanPopup = { kind, state, render, close, errorReport, printLayout, refresh, applyTask, applyResource, applyProject };


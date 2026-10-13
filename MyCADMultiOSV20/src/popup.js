// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web, ?popup=<kind>). Every popup has a fixed
// size chosen so its content fits without scrolling; long settings are split
// into tabs and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { formatNumber } from './domain/entities.js';
import { evaluate } from './domain/expr.js';
import { CATEGORY_ICONS, categoryOf, generatePart, normalizeParams, optionIsWord, PART_CATEGORIES, PARTS, partInfo } from './domain/parts.js';
import './view/partIcons.js';
import { defaultPrintOptions, MARGINS, PAPERS, paginate, pageSvg, SCALES, selectContent } from './domain/print.js';
import { loadRecent, MAX_RECENT, removeRecent, storeRecent } from './domain/recent.js';
import {
  BACKGROUND_FITS, defaultSettings, FONT_STYLES, FONT_WEIGHTS, GRID_SIZES, loadSettings, RECENT_KEY, SNAP_MODES, STORAGE_KEY, storeSettings, TEXT_HEIGHT,
} from './domain/settings.js';
import { previewSvg } from './domain/svg.js';
import { prepareStl } from './domain/stl.js';
import { normalizeEntity } from './domain/entities.js';
import { coverageSummary, FREECAD_COVERAGE } from './domain/freecad.js';
import {
  ALL_SOLID_KINDS, featureFrom, normalizeSolidParams, projectEdges, REVOLVE_AXES, sectionAt, shadedView, SOLID_ICONS, SOLID_KINDS, SOLIDS, solidMesh, solidProperties, VIEW_AXES,
} from './domain/solids.js';
import { isVisible } from './domain/drawing.js';
import { formatBytes, getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { POPUPS, popupParams } from './platform/popups.js';
import { bindSteppers, stepperHtml } from './stepper.js';
import {
  applyFont, applyTheme, CUSTOM, CUSTOM_KEYS, customFrom, DARK_THEMES, drawingFontStack, LIGHT_THEMES, resolveTheme, SYSTEM, themeName,
} from './themes.js';

const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const kind = desktop ? appWindow.label.replace(/^popup-/, '') : new URLSearchParams(location.search).get('popup');
const root = document.querySelector('#app');
document.title = `popup-${kind}`;
document.documentElement.classList.add(`popup-kind-${kind}`);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const fmt = (value, digits = 3) => formatNumber(value, digits);

// ───────────────────────── bridge to the main window

function send(type, data) {
  if (desktop) return native.emitTo('main', 'popup-message', { kind, type, data }).catch(() => {});
  globalThis.parent?.postMessage({ mycad: true, kind, type, data }, location.origin);
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
};
const s = () => state.settings;

function applyLook() {
  setLanguage(s().language);
  applyTheme(resolveTheme(s().theme, prefersDark(), s().customTheme));
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

let osTitle = '';
function setOsTitle(title) {
  if (!desktop || !title || title === osTitle) return;
  osTitle = title;
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  appWindow.setTitle(`${title} — MyCAD v${version}`).catch(() => {});
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

/** [−] value [+] for a number setting. */
const numberField = (key, value, min, max, step, unit, label) => stepperHtml({
  key, value, min, max, step, unit, label,
  decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }),
});

const switchControl = (attribute, checked, label) => `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" ${attribute} ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`;
const toggle = (key, label, glyph) => row(glyph, label, switchControl(`data-toggle="${key}"`, s()[key], label));

const segmented = (key, options, current, attribute = 'data-setting') => `<span class="segmented" role="radiogroup">${options.map(([value, label]) => `
  <button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" ${attribute}="${key}" data-value="${escapeHtml(value)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')}</span>`;

function render() {
  try {
    ({
      settings: renderSettings, about: renderAbout, confirm: renderConfirm, error: renderError, progress: renderProgress,
      recent: renderRecent, print: renderPrint, menu: renderMenu, theme: renderThemePicker, part: renderPart, array: renderArray, stl: renderStl, solid: renderSolid, coverage: renderCoverage,
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
  ['drawing', 'grid', 'settings.drawing'],
  ['snaps', 'snap', 'settings.snaps'],
  ['recent', 'recent', 'settings.recent'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

function renderSettings() {
  const tabs = `<nav class="tabs" role="tablist">${SETTINGS_TABS.map(([id, glyph, key]) => `
    <button class="tab ${state.tab === id ? 'active' : ''}" role="tab" aria-selected="${state.tab === id}" data-action="tab" data-value="${id}" title="${escapeHtml(t(key))}">${icon(glyph)}<span>${escapeHtml(t(key))}</span></button>`).join('')}</nav>`;
  const body = {
    general: settingsGeneral, appearance: settingsAppearance, font: settingsFont, background: settingsBackground,
    drawing: settingsDrawing, snaps: settingsSnaps, recent: settingsRecent, shortcuts: settingsShortcuts,
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
    row('user', t('settings.author'), `<input class="wide" data-text="author" value="${escapeHtml(s().author)}" placeholder="${escapeHtml(t('settings.authorHint'))}" title="${escapeHtml(t('settings.author'))}" />`),
    toggle('restoreSession', t('settings.restoreSession'), 'refresh'),
    toggle('confirmDelete', t('settings.confirmDelete'), 'trash'),
    toggle('statusClock', t('settings.statusClock'), 'recent'),
    toggle('showLeftPanel', t('action.leftPanel'), 'panelLeft'),
    toggle('showRightPanel', t('action.rightPanel'), 'panelRight'),
    toggle('showStatusBar', t('action.statusBar'), 'statusBar'),
    row('folder', t('settings.lastDirectory'), `<span class="path" title="${escapeHtml(s().lastDirectory ?? '')}">${escapeHtml(s().lastDirectory ?? t('settings.none'))}</span>`),
  ].join('');
}

function themeRow(theme, active) {
  const name = themeName(theme.id, getLanguage());
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
    <button class="theme-row compact ${current === SYSTEM ? 'active' : ''}" data-setting="theme" data-value="${SYSTEM}" title="${escapeHtml(themeName(SYSTEM, getLanguage()))}">${icon('sun')}<span class="theme-name">${escapeHtml(themeName(SYSTEM, getLanguage()))}</span>${current === SYSTEM ? icon('check', 'icon check') : ''}</button>
  </div>`;
  if (group === 'custom') return head + customThemeEditor();
  const list = group === 'dark' ? DARK_THEMES : LIGHT_THEMES;
  return `${head}<div class="theme-list" role="radiogroup">${list.map((theme) => themeRow(theme, current === theme.id)).join('')}</div>`;
}

/** Custom theme: dark/light, the editable colours, copy from the current theme. */
function customThemeEditor() {
  const custom = s().customTheme;
  const using = s().theme === CUSTOM;
  return `<div class="row custom-actions">
      <button class="button small ${using ? 'primary' : ''}" data-action="use-custom" title="${escapeHtml(t('settings.useCustom'))}">${icon(using ? 'check' : 'palette')}<span>${escapeHtml(t('settings.useCustom'))}</span></button>
      ${switchControl('data-custom-dark', custom.dark, t('settings.customDark'))}<span>${escapeHtml(t('settings.customDark'))}</span>
      <span class="grow"></span>
      <button class="button small" data-action="copy-theme" title="${escapeHtml(t('settings.copyTheme'))}">${icon('copy')}<span>${escapeHtml(t('settings.copyTheme'))}</span></button>
    </div>
    <div class="color-grid">${CUSTOM_KEYS.map((key) => `<label class="row color-row" title="${escapeHtml(t(`colorKey.${key}`))}">
      <span class="row-label">${icon('palette')}<span>${escapeHtml(t(`colorKey.${key}`))}</span></span>
      <span class="row-control"><code>${escapeHtml(custom[key])}</code><input type="color" data-custom-color="${key}" value="${escapeHtml(custom[key])}" aria-label="${escapeHtml(t(`colorKey.${key}`))}" /></span>
    </label>`).join('')}</div>
    <div class="row theme-preview" style="background:${custom.bg};color:${custom.text};border-color:${custom.border}">
      <span class="preview-chip" style="background:${custom.canvas};color:${custom.text};border:1px solid ${custom.border}">${escapeHtml(t('colorKey.canvas'))}</span>
      <span class="preview-chip" style="background:${custom.panel};color:${custom.text}">${escapeHtml(t('colorKey.panel'))}</span>
      <span class="preview-chip" style="background:${custom.accent};color:${custom.accentText}">${escapeHtml(t('settings.themeCustom'))}</span>
      <span style="color:${custom.muted}">${escapeHtml(t('settings.fontSample'))}</span>
    </div>`;
}

// ───────────────────────── theme dropdown (toolbar): two columns, dark | light

let pickerDone = false;
function renderThemePicker() {
  const current = s().theme;
  const column = (glyph, title, list) => `<div class="picker-column">
    <h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>
    ${list.map((theme) => `<button class="picker-item ${current === theme.id ? 'active' : ''}" data-pick-theme="${theme.id}" title="${escapeHtml(themeName(theme.id, getLanguage()))}">
      <span class="theme-swatch">${theme.swatch.map((color) => `<i style="background:${color}"></i>`).join('')}</span>
      <span class="theme-name">${escapeHtml(themeName(theme.id, getLanguage()))}</span>${current === theme.id ? icon('check', 'icon check') : ''}
    </button>`).join('')}
  </div>`;
  root.innerHTML = frame({
    glyph: 'palette', title: t('theme.pickTitle'),
    body: `<div class="theme-picker">
      <div class="picker-top">
        <button class="picker-item ${current === SYSTEM ? 'active' : ''}" data-pick-theme="${SYSTEM}" title="${escapeHtml(themeName(SYSTEM, getLanguage()))}">${icon('sun')}<span class="theme-name">${escapeHtml(themeName(SYSTEM, getLanguage()))}</span>${current === SYSTEM ? icon('check', 'icon check') : ''}</button>
        <button class="picker-item ${current === CUSTOM ? 'active' : ''}" data-pick-theme="${CUSTOM}" title="${escapeHtml(themeName(CUSTOM, getLanguage()))}">${icon('palette')}<span class="theme-name">${escapeHtml(themeName(CUSTOM, getLanguage()))}</span>${current === CUSTOM ? icon('check', 'icon check') : ''}</button>
      </div>
      <div class="picker-columns">${column('moon', t('theme.darkGroup', { count: DARK_THEMES.length }), DARK_THEMES)}${column('sun', t('theme.lightGroup', { count: LIGHT_THEMES.length }), LIGHT_THEMES)}</div>
    </div>`,
    foot: `<button class="button small" data-action="edit-custom" title="${escapeHtml(t('settings.editCustom'))}">${icon('edit')}<span>${escapeHtml(t('settings.editCustom'))}</span></button><span class="grow"></span>${button('close', t('error.close'), 'close')}`,
  });
  const anchor = state.params.anchor;
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
    row('font', t('settings.fontFamily'), `<select data-select="fontFamily" id="font-family" title="${escapeHtml(t('settings.fontFamily'))}">${options.join('')}</select>`),
    row('info', t('settings.fontScope'), `<span class="muted ${state.fontError ? 'danger-text' : ''}" id="font-status">${escapeHtml(status)}</span>`, status),
    row('text', t('settings.textHeight'), numberField('textHeight', s().textHeight, TEXT_HEIGHT.min, TEXT_HEIGHT.max, 0.5, 'mm', t('settings.textHeight'))),
    row('dimension', t('settings.dimTextHeight'), numberField('dimTextHeight', s().dimTextHeight, TEXT_HEIGHT.min, TEXT_HEIGHT.max, 0.5, 'mm', t('settings.dimTextHeight'))),
    row('edit', t('settings.fontWeight'), `<select data-select="fontWeight" title="${escapeHtml(t('settings.fontWeight'))}">${FONT_WEIGHTS.map((weight) => `<option value="${weight}" ${s().fontWeight === weight ? 'selected' : ''}>${weight} — ${escapeHtml(t(`settings.weight.${weight}`))}</option>`).join('')}</select>`),
    row('font', t('settings.fontStyle'), segmented('fontStyle', FONT_STYLES.map((style) => [style, t(`settings.${style}`)]), s().fontStyle)),
    `<div class="row font-sample" style="font-family:${escapeHtml(drawingFontStack(s().fontFamily))};font-size:${Math.min(30, s().textHeight * 5)}px;font-weight:${s().fontWeight};font-style:${s().fontStyle}">${escapeHtml(t('settings.fontSample'))}</div>`,
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
      ${button('clear-background', t('settings.bgClear'), 'trash', 'small')}`),
    row('opacity', t('settings.bgOpacity'), numberField('backgroundOpacity', s().backgroundOpacity, 0, 100, 5, '%', t('settings.bgOpacity'))),
    row('zoomFit', t('settings.bgFit'), segmented('backgroundFit', BACKGROUND_FITS.map((fit) => [fit, t(`settings.fit.${fit}`)]), s().backgroundFit)),
    row('info', t('settings.bgNote'), `<span class="muted">${escapeHtml(t('settings.bgHint'))}</span>`, t('settings.bgHint')),
  ].join('');
}

function settingsDrawing() {
  return [
    toggle('showGrid', t('action.grid'), 'grid'),
    toggle('showRulers', t('action.rulers'), 'ruler'),
    row('grid', t('settings.gridSize'), `<select data-select="gridSize" title="${escapeHtml(t('settings.gridSize'))}">${GRID_SIZES.map((size) => `<option value="${size}" ${s().gridSize === size ? 'selected' : ''}>${size} mm</option>`).join('')}</select>`),
    toggle('snapGrid', t('action.snapGrid'), 'grid'),
    toggle('snapObject', t('action.snap'), 'snap'),
    toggle('ortho', t('action.ortho'), 'ortho'),
    toggle('showLineWeights', t('action.lineWeights'), 'line'),
    toggle('crosshair', t('action.crosshair'), 'coordinate'),
    row('cube', t('view3d.thickness'), numberField('extrudeHeight', s().extrudeHeight, 0.1, 1000, 1, 'mm', t('view3d.thickness'))),
    row('dimension', t('settings.dimPrecision'), `<select data-select="dimPrecision" title="${escapeHtml(t('settings.dimPrecision'))}">${[0, 1, 2, 3, 4].map((p) => `<option value="${p}" ${s().dimPrecision === p ? 'selected' : ''}>${p === 0 ? '0' : `0.${'0'.repeat(p)}`}</option>`).join('')}</select>`),
  ].join('');
}

function settingsSnaps() {
  return [
    `<div class="row notice-row">${icon('snap')}<span>${escapeHtml(t('settings.snapHint'))}</span></div>`,
    ...SNAP_MODES.map((mode) => row(`snap`, t(`snap.${mode}`), switchControl(`data-snap-mode="${mode}"`, s().snapModes[mode], t(`snap.${mode}`)))),
  ].join('');
}

function recentRows(list, { compact = false } = {}) {
  if (!list.length) return `<div class="row empty">${icon('info')}<span>${escapeHtml(t('recent.empty'))}</span></div>`;
  return list.map((item) => {
    const missing = state.exists[item.path] === false;
    const name = item.path.split(/[\\/]/).pop();
    return `<div class="row recent-row ${missing ? 'missing' : ''}" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
      <span class="row-label">${icon('drawing')}<span class="recent-name">${escapeHtml(name)}</span></span>
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
    <div class="row">${button('clear-recent', t('recent.clear'), 'trash', 'small danger')}<span class="muted">${escapeHtml(t('recent.count', { count: list.length }))}</span></div>`;
}

async function checkRecent() {
  const list = loadRecent(globalThis.localStorage).filter((item) => !item.web && !(item.path in state.exists));
  if (!list.length || !desktop) return;
  const exists = await native.pathsExist(list.map((item) => item.path)).catch(() => list.map(() => true));
  list.forEach((item, index) => { state.exists[item.path] = exists[index]; });
  render();
}

const SHORTCUT_LIST = [
  ['Ctrl+N', 'action.new'], ['Ctrl+O', 'action.open'], ['Ctrl+S', 'action.save'], ['Ctrl+Shift+S', 'action.saveAs'], ['Ctrl+Shift+R', 'action.recent'],
  ['Ctrl+P', 'action.print'], ['Ctrl+Z', 'action.undo'], ['Ctrl+Y', 'action.redo'], ['Ctrl+X', 'action.cut'], ['Ctrl+C', 'action.copy'],
  ['Ctrl+V', 'action.paste'], ['Ctrl+D', 'action.duplicate'], ['Delete', 'action.delete'], ['Ctrl+A', 'action.selectAll'], ['Esc', 'shortcut.escape'],
  ['Enter', 'shortcut.enter'], ['shortcut.wheel', 'action.zoomIn'], ['Ctrl+0', 'action.zoom100'], ['Home', 'action.zoomFit'], ['shortcut.pan', 'tool.pan'],
  ['F3', 'action.snap'], ['F7', 'action.grid'], ['F8', 'action.ortho'], ['Ctrl+R', 'action.rulers'], ['Ctrl+Shift+3', 'action.view3d'], ['Ctrl+Shift+P', 'action.exportStl'], ['L · P · R · C', 'shortcut.drawKeys'],
  ['A · E · G · T', 'shortcut.drawKeys2'], ['D · M · O · I', 'shortcut.modifyKeys'], ['shortcut.coordinates', 'shortcut.coordinatesDesc'], ['F9', 'action.snapGrid'], ['F1', 'action.about'],
];

function settingsShortcuts() {
  return `<div class="shortcut-grid">${SHORTCUT_LIST.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyCAD', version: '?', error: native.errorText(error) }));
  const info = state.info;
  const date = info.buildDate ? new Date(info.buildDate).toLocaleString() : '-';
  const build = [
    ['info', t('about.version'), `${info.version}`],
    ['refresh', t('about.buildDate'), date],
    ['link', t('about.commit'), info.commit ?? '-'],
    ['drawing', t('about.target'), info.target ?? '-'],
    ['gear', t('about.profile'), info.profile ?? '-'],
    ['part', t('about.runtime'), info.web ? t('about.webBuild') : `Tauri ${info.tauri} · ${info.rustc ?? ''}`],
    ['globe', t('about.platform'), `${info.os ?? '-'} / ${info.arch ?? '-'}`],
  ];
  const author = [
    ['user', t('about.author'), 'SHKWON(knix008@naver.com)'],
    ['check', t('about.copyright'), `© ${new Date().getFullYear()} SHKWON(knix008@naver.com)`],
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
      <div class="about-rows" id="about-rows">${table(t('about.buildInfo'), 'gear', build)}${table(t('about.authorInfo'), 'user', author)}</div>
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
      ${shownItems.length ? `<ul class="confirm-items">${shownItems.map((item) => `<li title="${escapeHtml(item)}">${icon('drawing')}<span>${escapeHtml(item)}</span></li>`).join('')}${items.length > shownItems.length ? `<li>… +${items.length - shownItems.length}</li>` : ''}</ul>` : ''}
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
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
    foot: `<span class="muted">${escapeHtml(t('recent.count', { count: list.length }))} · ${MAX_RECENT}</span><span class="grow"></span>${button('clear-recent', t('recent.clear'), 'trash', 'danger')}${button('close', t('settings.done'), 'check', 'primary')}`,
  });
  root.querySelector('[data-action="clear-recent"]').disabled = !list.length;
  checkRecent();
  ready();
}

// ───────────────────────── print preview

const PRINT_KEY = 'mycad.print.v1';

function printSetup() {
  if (!state.print) {
    const saved = (() => { try { return JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}'); } catch { return {}; } })();
    state.print = { ...defaultPrintOptions(), ...saved, range: 'current', layers: null, selectedOnly: false };
  }
  return state.print;
}

function printLayout() {
  const options = printSetup();
  const p = state.params;
  return paginate(selectContent(p.drawings ?? [], p.current ?? 0, options, p.selected ?? []), options);
}

function titleLabels() {
  return {
    title: t('titleBlock.title'), number: t('titleBlock.number'), scale: t('titleBlock.scale'), material: t('titleBlock.material'), drawnBy: t('titleBlock.drawnBy'),
    date: t('titleBlock.date'), sheet: t('titleBlock.sheet'), units: t('titleBlock.units'), tile: t('titleBlock.tile'),
  };
}

const pageMarkup = (page, layout, options) => pageSvg(page, layout, options, { fonts: state.params.fonts ?? {}, labels: titleLabels() });

function renderPrint() {
  const options = printSetup();
  const p = state.params;
  const drawings = p.drawings ?? [];
  const current = drawings[p.current ?? 0];
  const layout = printLayout();
  const pages = layout.pages;
  state.page = Math.max(0, Math.min(state.page, pages.length - 1));
  const page = pages[state.page];
  const custom = options.range === 'custom';
  const layerChips = (current?.layers ?? []).map((layer) => {
    const checked = !options.layers || options.layers.includes(layer.id);
    return `<label class="chip-check" title="${escapeHtml(layer.name)}"><input type="checkbox" data-print-layer="${escapeHtml(layer.id)}" ${checked ? 'checked' : ''} ${custom ? '' : 'disabled'} /><span>${escapeHtml(layer.name)}</span></label>`;
  }).join('');
  const select = (key, values, label) => `<select data-print="${key}" title="${escapeHtml(label)}">${values.map(([value, text]) => `<option value="${value}" ${String(options[key]) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
  const check = (key, label, glyph) => row(glyph, label, switchControl(`data-print-toggle="${key}"`, options[key], label));
  root.innerHTML = frame({
    glyph: 'print', title: t('print.title'),
    body: `<div class="print-view">
      <div class="print-options">
        <h3>${icon('list')}<span>${escapeHtml(t('print.range'))}</span></h3>
        ${['all', 'current', 'custom'].map((range) => `<label class="row radio-row" title="${escapeHtml(t(`print.${range}`))}"><input type="radio" name="range" data-print-range="${range}" ${options.range === range ? 'checked' : ''} /><span>${escapeHtml(t(`print.${range}`))}${range === 'all' ? ` (${drawings.length})` : ''}</span></label>`).join('')}
        <div class="chip-checks ${custom ? '' : 'disabled'}" title="${escapeHtml(t('print.layers'))}">${layerChips}</div>
        <label class="row radio-row" title="${escapeHtml(t('print.selectedOnly'))}"><input type="checkbox" data-print-toggle="selectedOnly" ${options.selectedOnly ? 'checked' : ''} ${custom ? '' : 'disabled'} /><span>${escapeHtml(t('print.selectedOnly'))} (${(p.selected ?? []).length})</span></label>
        <h3>${icon('pageSetup')}<span>${escapeHtml(t('print.pageSetup'))}</span></h3>
        ${row('file', t('print.paper'), select('paper', Object.keys(PAPERS).map((paper) => [paper, paper]), t('print.paper')))}
        ${row('drawing', t('print.orientation'), `<span class="segmented">${['portrait', 'landscape'].map((o) => `<button class="segment ${options.orientation === o ? 'active' : ''}" data-print-orientation="${o}" title="${escapeHtml(t(`print.${o}`))}">${escapeHtml(t(`print.${o}`))}</button>`).join('')}</span>`)}
        ${row('panelLeft', t('print.margin'), select('margin', Object.keys(MARGINS).map((margin) => [margin, t(`print.margin.${margin}`)]), t('print.margin')))}
        ${row('zoomIn', t('print.scale'), select('scale', SCALES.map((scale) => [scale, scale === 'fit' ? t('print.fit') : scale]), t('print.scale')))}
        ${check('frame', t('print.frame'), 'rect')}
        ${check('titleBlock', t('print.titleBlock'), 'pageSetup')}
        ${check('monochrome', t('print.monochrome'), 'palette')}
      </div>
      <div class="print-preview" id="print-preview">
        ${page ? `<div class="preview-stage">${pageMarkup(page, layout, options)}</div>` : `<div class="preview-empty">${icon('info')}<span>${escapeHtml(options.selectedOnly && !(p.selected ?? []).length ? t('print.selectedNone') : t('print.empty'))}</span></div>`}
      </div>
    </div>
    <div class="print-sheet" aria-hidden="true">${pages.map((item) => `<div class="print-page">${pageMarkup(item, layout, options)}</div>`).join('')}</div>`,
    foot: `<button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number">${escapeHtml(pages.length ? t('print.page', { n: state.page + 1, total: pages.length }) : t('print.empty'))}</span>
      <button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= pages.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
      <span class="muted" id="page-size">${escapeHtml(`${options.paper} · ${t(`print.${options.orientation}`)} · ${layout.size.width}×${layout.size.height} mm`)}</span>
      <span class="grow"></span>
      <button class="button primary" data-action="print" title="${escapeHtml(t('print.print'))}" ${pages.length ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(t('print.print'))}</span></button>
      ${button('close', t('print.close'), 'close')}`,
  });
  // @page size follows the page setup.
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  style.textContent = `@page { size: ${layout.size.width}mm ${layout.size.height}mm; margin: 0; } .print-page svg { width: ${layout.size.width}mm; height: ${layout.size.height}mm; }`;
  fitPreview();
  ready();
}

/** Scales the preview page to fit the preview area (no scroll bars). */
function fitPreview() {
  const area = root.querySelector('#print-preview');
  const svg = area?.querySelector('.preview-stage svg');
  if (!svg) return;
  const box = area.getBoundingClientRect();
  const width = parseFloat(svg.getAttribute('width'));
  const height = parseFloat(svg.getAttribute('height'));
  const scale = Math.min((box.width - 24) / width, (box.height - 24) / height);
  svg.style.width = `${width * scale}px`;
  svg.style.height = `${height * scale}px`;
}

function savePrintOptions() {
  const { range, layers, selectedOnly, ...setup } = state.print;
  try { globalThis.localStorage?.setItem(PRINT_KEY, JSON.stringify(setup)); } catch { /* ignore */ }
}

function changePrint(patch) {
  state.print = { ...printSetup(), ...patch };
  state.page = 0;
  savePrintOptions();
  render();
}

async function doPrint() {
  try {
    if (window.__mycadPrintHook) window.__mycadPrintHook(printLayout());
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
        <span class="menu-icon">${icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key">${escapeHtml(item.shortcut ?? '')}</span>
        <span class="menu-check">${item.checked ? icon('check') : ''}</span>
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

// ───────────────────────── part window: kind, parameters, live preview

function partInit() {
  const p = state.params;
  const partKind = PARTS[p.kind] ? p.kind : 'gear';
  state.part = { kind: partKind, params: normalizeParams(partKind, p.params ?? {}), angle: Number(p.angle) || 0, cache: {} };
}

function renderPart() {
  if (!state.part) partInit();
  const d = state.part;
  const mode = state.params.mode ?? 'insert';
  const def = PARTS[d.kind];
  const category = categoryOf(d.kind);
  const tabs = `<nav class="tabs" role="tablist">${Object.keys(PART_CATEGORIES).map((id) => `<button class="tab ${category === id ? 'active' : ''}" role="tab" aria-selected="${category === id}" data-part-category="${id}" ${mode === 'edit' && id !== category ? 'disabled' : ''} title="${escapeHtml(t(`cat.${id}`))}">${icon(CATEGORY_ICONS[id])}<span>${escapeHtml(t(`cat.${id}`))}</span></button>`).join('')}</nav>`;
  const kinds = PART_CATEGORIES[category].map((id) => `<button class="part-kind ${d.kind === id ? 'active' : ''}" data-part-kind="${id}" ${mode === 'edit' && id !== d.kind ? 'disabled' : ''} title="${escapeHtml(`${t(`part.${id}`)}${PARTS[id].standard ? ` — ${PARTS[id].standard}` : ''}`)}">${icon(PARTS[id].icon)}<span>${escapeHtml(t(`part.${id}`))}</span></button>`).join('');
  const fields = def.params.map((param) => {
    const label = t(`param.${param.key}`);
    const value = d.params[param.key];
    if (param.type === 'bool') return row('check', label, switchControl(`data-part-param="${param.key}"`, value, label));
    if (param.type === 'select' && param.key === 'view') return row('eye', label, `<span class="segmented">${param.options.map((option) => `<button class="segment ${value === option ? 'active' : ''}" data-part-view="${option}" title="${escapeHtml(t(`opt.${option}`))}">${escapeHtml(t(`opt.${option}`))}</button>`).join('')}</span>`);
    if (param.type === 'select') return row('list', label, `<select data-part-param="${param.key}" title="${escapeHtml(label)}">${param.options.map((option) => `<option value="${option}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(optionIsWord(option) ? t(`opt.${option}`) : `${param.unit}${option}`)}</option>`).join('')}</select>`);
    if (param.type === 'text') return row('edit', label, `<input class="wide" data-part-param="${param.key}" value="${escapeHtml(value)}" title="${escapeHtml(t('param.segmentsTip'))}" />`, t('param.segmentsTip'));
    return row('measure', label, numberField(`part:${param.key}`, value, param.min, param.max, param.step, param.unit === '°' ? '°' : '', label));
  }).join('');
  const standard = PARTS[d.kind].standard ? `<span class="info-chip standard" title="${escapeHtml(t('part.standard'))}">${icon('list')} <b>${escapeHtml(PARTS[d.kind].standard)}</b></span>` : '';
  const info = standard + Object.entries(partInfo(d.kind, d.params)).map(([key, value]) => `<span class="info-chip" title="${escapeHtml(t(`info.${key}`))}">${escapeHtml(t(`info.${key}`))} <b>${escapeHtml(fmt(value))}</b> mm</span>`).join('');
  const theme = resolveTheme(s().theme, prefersDark(), s().customTheme);
  const svg = previewSvg(generatePart(d.kind, d.params), { width: 330, height: 300, stroke: theme.colors.text });
  root.innerHTML = frame({
    glyph: 'part', title: `${t(mode === 'edit' ? 'partWindow.edit' : 'partWindow.insert')} — ${t(`part.${d.kind}`)}`, tabs,
    body: `<div class="part-view">
      <div class="part-kinds" role="radiogroup">${kinds}</div>
      <div class="part-fields">${fields}${row('rotate', t('prop.angle'), numberField('part-angle', d.angle, -360, 360, 15, '°', t('prop.angle')))}</div>
      <div class="part-preview"><div class="part-svg" id="part-preview">${svg}</div><div class="part-info">${info}</div></div>
    </div>`,
    foot: `<span class="muted">${escapeHtml(t(mode === 'edit' ? 'partWindow.editHint' : 'partWindow.insertHint'))}</span><span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}${button('part-apply', t(mode === 'edit' ? 'partWindow.apply' : 'partWindow.place'), mode === 'edit' ? 'check' : 'part', 'primary')}`,
  });
  ready();
}

function applyPart() {
  const d = state.part;
  return close({ action: state.params.mode === 'edit' ? 'apply' : 'insert', kind: d.kind, params: normalizeParams(d.kind, d.params), angle: d.angle });
}

// ───────────────────────── array window

function arrayInit() {
  const p = state.params;
  const w = Math.max(1, Math.round((p.width ?? 10) * 1.5));
  const h = Math.max(1, Math.round((p.height ?? 10) * 1.5));
  state.array = { mode: 'rect', rows: 2, columns: 3, dx: w, dy: h, count: 6, angle: 360, cx: Number(fmt(p.cx ?? 0)), cy: Number(fmt(p.cy ?? 0)), rotateItems: true };
}

function renderArray() {
  if (!state.array) arrayInit();
  const a = state.array;
  const total = a.mode === 'rect' ? a.rows * a.columns : a.count;
  const input = (key, label, unit = 'mm') => row('measure', label, `<input class="num" data-array="${key}" value="${escapeHtml(a[key])}" title="${escapeHtml(label)}" /><small>${unit}</small>`);
  const fields = a.mode === 'rect'
    ? [row('list', t('array.rows'), numberField('array:rows', a.rows, 1, 200, 1, '', t('array.rows'))), row('list', t('array.columns'), numberField('array:columns', a.columns, 1, 200, 1, '', t('array.columns'))), input('dx', t('array.dx')), input('dy', t('array.dy'))]
    : [row('list', t('array.count'), numberField('array:count', a.count, 2, 360, 1, '', t('array.count'))), input('angle', t('array.angle'), '°'), input('cx', t('array.cx')), input('cy', t('array.cy')), row('rotate', t('array.rotateItems'), switchControl('data-array-toggle="rotateItems"', a.rotateItems, t('array.rotateItems')))];
  // Schematic preview: the positions of the copies.
  const dots = [];
  if (a.mode === 'rect') {
    for (let r = 0; r < Math.min(a.rows, 30); r++) for (let c = 0; c < Math.min(a.columns, 30); c++) dots.push({ x: c * a.dx, y: r * a.dy, first: !r && !c });
  } else {
    const full = Math.abs(Math.abs(a.angle) - 360) < 1e-9;
    const step = a.count > 1 ? a.angle / (full ? a.count : a.count - 1) : 0;
    for (let i = 0; i < Math.min(a.count, 360); i++) dots.push({ x: Math.cos(((90 + step * i) * Math.PI) / 180), y: Math.sin(((90 + step * i) * Math.PI) / 180), first: !i });
  }
  const minX = Math.min(...dots.map((dot) => dot.x)); const maxX = Math.max(...dots.map((dot) => dot.x));
  const minY = Math.min(...dots.map((dot) => dot.y)); const maxY = Math.max(...dots.map((dot) => dot.y));
  const k = Math.min(200 / Math.max(maxX - minX, 1e-9), 160 / Math.max(maxY - minY, 1e-9), 60);
  const preview = `<svg width="240" height="200" viewBox="0 0 240 200">${dots.map((dot) => `<rect x="${20 + (dot.x - minX) * k - 6}" y="${180 - (dot.y - minY) * k - 6}" width="12" height="12" rx="2" fill="${dot.first ? 'var(--accent)' : 'none'}" stroke="var(--accent)" stroke-width="1.5"/>`).join('')}</svg>`;
  root.innerHTML = frame({
    glyph: 'array', title: t('array.title'),
    body: `<div class="array-view">
      <div class="array-fields">
        ${row('array', t('array.mode'), segmented('mode', [['rect', t('array.rect')], ['polar', t('array.polar')]], a.mode, 'data-array-mode'))}
        ${fields.join('')}
        ${row('info', t('array.total'), `<b id="array-total">${total}</b><span class="muted">${escapeHtml(t('array.selection', { count: state.params.count ?? 0 }))}</span>`)}
      </div>
      <div class="array-preview">${preview}</div>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}${button('array-apply', t('array.apply'), 'check', 'primary')}`,
  });
  ready();
}

function applyArray() {
  const a = state.array;
  return close({ action: 'apply', mode: a.mode, rows: a.rows, columns: a.columns, dx: a.dx, dy: a.dy, count: a.count, angle: a.angle, cx: a.cx, cy: a.cy, rotateItems: a.rotateItems });
}

// ───────────────────────── STL (3D printing) window

const STL_KEY = 'mycad.stl.v1';

function stlInit() {
  const saved = (() => { try { return JSON.parse(globalThis.localStorage?.getItem(STL_KEY) ?? '{}'); } catch { return {}; } })();
  const hasSelection = (state.params.selected ?? []).length > 0;
  state.stl = { thickness: Number(saved.thickness) > 0 ? Number(saved.thickness) : s().extrudeHeight, ascii: Boolean(saved.ascii), scope: hasSelection ? 'selection' : 'all' };
}

function stlMesh() {
  const drawing = state.params.drawing;
  if (!drawing) return null;
  const selected = new Set(state.params.selected ?? []);
  const entities = drawing.entities.filter((entity) => isVisible(drawing, entity) && (state.stl.scope !== 'selection' || selected.has(entity.id)));
  return prepareStl(entities, drawing, { thickness: state.stl.thickness });
}

/** Top view of the solids: material filled, holes cut out. */
function stlPreview(mesh) {
  if (!mesh?.shapes.length) return `<div class="preview-empty">${icon('info')}<span>${escapeHtml(t('stl.noOutline'))}</span></div>`;
  const all = mesh.shapes.flatMap((shape) => shape.outer);
  const minX = Math.min(...all.map((p) => p.x)); const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)); const maxY = Math.max(...all.map((p) => p.y));
  const w = 330; const h = 300; const pad = 14;
  const k = Math.min((w - pad * 2) / Math.max(maxX - minX, 1e-6), (h - pad * 2) / Math.max(maxY - minY, 1e-6));
  const x0 = (w - (maxX - minX) * k) / 2; const y0 = (h - (maxY - minY) * k) / 2;
  const path = (loop) => `M${loop.map((p) => `${(x0 + (p.x - minX) * k).toFixed(1)} ${(y0 + (maxY - p.y) * k).toFixed(1)}`).join('L')}Z`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path fill-rule="evenodd" fill="color-mix(in srgb, var(--accent) 30%, transparent)" stroke="var(--accent)" stroke-width="1.2" d="${mesh.shapes.map((shape) => [shape.outer, ...shape.holes].map(path).join('')).join('')}"/></svg>`;
}

function renderStl() {
  if (!state.stl) stlInit();
  const options = state.stl;
  const mesh = stlMesh();
  const hasSelection = (state.params.selected ?? []).length > 0;
  const info = mesh?.size ? [
    row('part', t('stl.solids'), `<b id="stl-solids">${mesh.shapes.length}</b>`),
    row('circle', t('stl.holes'), `<b id="stl-holes">${mesh.holes}</b>`),
    row('zoomFit', t('stl.size'), `<b id="stl-size">${fmt(mesh.size.x, 2)} × ${fmt(mesh.size.y, 2)} × ${fmt(mesh.size.z, 2)} mm</b>`),
    row('measure', t('stl.volume'), `<b>${fmt(mesh.volume / 1000, 2)} cm³</b>`),
    row('polygon', t('stl.triangles'), `<b id="stl-triangles">${mesh.triangles.length}</b>`),
  ] : [];
  if (mesh?.open) info.push(`<div class="row notice-row warn-row">${icon('warning')}<span>${escapeHtml(t('stl.openWarning', { count: mesh.open }))}</span></div>`);
  const segment = (attribute, value, active, label, disabled = false) => `<button class="segment ${active ? 'active' : ''}" ${attribute}="${value}" title="${escapeHtml(label)}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`;
  root.innerHTML = frame({
    glyph: 'printer3d', title: `${t('stl.title')} — ${state.params.name ?? ''}`,
    body: `<div class="stl-view">
      <div class="stl-fields">
        ${row('measure', t('stl.thickness'), numberField('stl:thickness', options.thickness, 0.1, 500, 0.5, 'mm', t('stl.thickness')))}
        ${row('selectAll', t('stl.scope'), `<span class="segmented">${segment('data-stl-scope', 'all', options.scope === 'all', t('stl.scopeAll'))}${segment('data-stl-scope', 'selection', options.scope === 'selection', t('stl.scopeSelection'), !hasSelection)}</span>`)}
        ${row('file', t('stl.format'), `<span class="segmented">${segment('data-stl-ascii', '0', !options.ascii, t('stl.binary'))}${segment('data-stl-ascii', '1', options.ascii, t('stl.ascii'))}</span>`)}
        ${info.join('')}
        <p class="muted hint">${escapeHtml(t('stl.hint'))}</p>
      </div>
      <div class="stl-preview" id="stl-preview">${stlPreview(mesh)}</div>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}<button class="button primary" data-action="stl-export" title="${escapeHtml(t('stl.export'))}" ${mesh?.triangles.length ? '' : 'disabled'}>${icon('printer3d')}<span>${escapeHtml(t('stl.export'))}</span></button>`,
  });
  ready();
}

function applyStl() {
  try { globalThis.localStorage?.setItem(STL_KEY, JSON.stringify({ thickness: state.stl.thickness, ascii: state.stl.ascii })); } catch { /* ignore */ }
  return close({ action: 'export', thickness: state.stl.thickness, scope: state.stl.scope, ascii: state.stl.ascii });
}

// ───────────────────────── 3D solid window (FreeCAD Part: primitives, Extrude/Revolve/Loft/Sweep, Section, Projection)

const PLACE_KEYS = [['x', 'mm'], ['y', 'mm'], ['z', 'mm'], ['rx', '°'], ['ry', '°'], ['rz', '°']];

function solidInit() {
  const p = state.params;
  const mode = p.mode ?? 'insert';
  const solidKind = ALL_SOLID_KINDS.includes(p.kind) ? p.kind : 'box';
  state.solid = {
    mode, kind: solidKind,
    params: normalizeSolidParams(solidKind, p.params ?? {}),
    place: Object.fromEntries(PLACE_KEYS.map(([key]) => [key, Number(p[key]) || 0])),
    axis: REVOLVE_AXES.includes(p.axis) ? p.axis : 'yAxis',
    level: Number(p.level) || 0,
    views: { top: true, front: true, right: true, iso: false, ...(p.views ?? {}) },
    gap: Number(p.gap) || 20,
    cache: {},
  };
}

/** The solid the window would make (raw entity data), or null. */
function solidPreviewEntity() {
  const d = state.solid;
  const p = state.params;
  if (d.mode === 'feature') return p.source ? featureFrom(d.kind, p.source, d.params, { axis: d.axis }) : null;
  if (d.mode === 'insert' || d.mode === 'edit') return { type: 'solid', kind: d.kind, params: d.params, ...d.place, shape: p.shape ?? undefined };
  return null;
}

/** A shaded isometric picture of solids with their visible edges (and `extra` lines, e.g. a section, on top). */
function isoSvg(entities, { width = 330, height = 300, extra = [] } = {}) {
  const tris = [];
  for (const raw of entities) {
    const entity = normalizeEntity(raw);
    if (entity) tris.push(...solidMesh(entity));
  }
  const shaded = tris.length <= 60000 ? shadedView(tris, 'iso') : [];
  const segments = tris.length ? projectEdges(tris, 'iso', { hidden: tris.length <= 60000 }).filter((seg) => !seg.hidden) : [];
  const all = [...segments.flat(), ...shaded.flatMap((tri) => tri.points), ...extra.flat()];
  if (!all.length) return `<div class="preview-empty">${icon('info')}<span>${escapeHtml(t('solid.noPreview'))}</span></div>`;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const p of all) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pad = 14;
  const k = Math.min((width - pad * 2) / Math.max(maxX - minX, 1e-6), (height - pad * 2) / Math.max(maxY - minY, 1e-6));
  const x0 = (width - (maxX - minX) * k) / 2; const y0 = (height - (maxY - minY) * k) / 2;
  const X = (p) => (x0 + (p.x - minX) * k).toFixed(1);
  const Y = (p) => (y0 + (maxY - p.y) * k).toFixed(1);
  const path = (list) => list.map(([a, b]) => `M${X(a)} ${Y(a)}L${X(b)} ${Y(b)}`).join('');
  // Faces in a few light levels (one path each), far to near.
  const levels = new Map();
  for (const tri of shaded) {
    const level = Math.round(tri.light * 12);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(`M${X(tri.points[0])} ${Y(tri.points[0])}L${X(tri.points[1])} ${Y(tri.points[1])}L${X(tri.points[2])} ${Y(tri.points[2])}Z`);
  }
  // Painter's order matters across levels too, so faces are drawn one by one when there are few.
  const faces = shaded.length <= 6000
    ? shaded.map((tri) => { const mixPct = Math.round(25 + tri.light * 60); const d = `M${X(tri.points[0])} ${Y(tri.points[0])}L${X(tri.points[1])} ${Y(tri.points[1])}L${X(tri.points[2])} ${Y(tri.points[2])}Z`; return `<path d="${d}" fill="color-mix(in srgb, var(--accent) ${mixPct}%, #ffffff)" stroke="color-mix(in srgb, var(--accent) ${mixPct}%, #ffffff)" stroke-width="0.6"/>`; }).join('')
    : [...levels.entries()].map(([level, list]) => `<path d="${list.join('')}" fill="color-mix(in srgb, var(--accent) ${Math.round(25 + (level / 12) * 60)}%, #ffffff)"/>`).join('');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-segments="${segments.length}" data-faces="${shaded.length}">
    ${faces}
    <path d="${path(segments)}" stroke="var(--text)" stroke-width="1" fill="none" stroke-linecap="round"/>
    ${extra.length ? `<path d="${path(extra)}" stroke="#e5484d" stroke-width="2" fill="none"/>` : ''}</svg>`;
}

function renderSolid() {
  if (!state.solid) solidInit();
  const d = state.solid;
  const p = state.params;
  const num = (key, value, param, label) => row(param?.unit === '°' ? 'rotate' : 'measure', label, numberField(key, value, param?.min ?? -1e6, param?.max ?? 1e6, param?.step ?? 1, param?.unit === '°' ? '°' : param?.unit ? 'mm' : '', label));
  const paramRows = () => SOLIDS[d.kind].params.map((param) => num(`solid:${param.key}`, d.params[param.key], param, t(`solidParam.${param.key}`))).join('');
  let glyph = SOLID_ICONS[d.kind] ?? 'solidBox';
  let title;
  let left = '';
  let fields = '';
  let preview = '';
  let info = '';
  let applyLabel = t('solid.insert');
  if (d.mode === 'insert' || d.mode === 'edit') {
    title = `${t(d.mode === 'edit' ? 'solid.editTitle' : 'solid.insertTitle')} — ${t(`solid.${d.kind}`)}`;
    const kinds = d.mode === 'edit' && !SOLID_KINDS.includes(d.kind) ? [d.kind] : SOLID_KINDS;
    left = `<div class="part-kinds" role="radiogroup">${kinds.map((id) => `<button class="part-kind ${d.kind === id ? 'active' : ''}" data-solid-kind="${id}" ${d.mode === 'edit' && id !== d.kind ? 'disabled' : ''} title="${escapeHtml(`${t(`solid.${id}`)} — ${t(`solidTip.${id}`)}`)}">${icon(SOLID_ICONS[id])}<span>${escapeHtml(t(`solid.${id}`))}</span></button>`).join('')}</div>`;
    fields = `${paramRows()}<h4 class="sub-head">${icon('move')}<span>${escapeHtml(t('solid.placement'))}</span></h4>${PLACE_KEYS.map(([key, unit]) => num(`solidPlace:${key}`, d.place[key], { unit, step: unit === '°' ? 15 : 1 }, t(`solidPlace.${key}`))).join('')}`;
    const entity = solidPreviewEntity();
    preview = isoSvg([entity]);
    const props = solidProperties(normalizeEntity(entity));
    info = `<span class="info-chip">${escapeHtml(t('measure.volume'))} <b>${escapeHtml(fmt(props.volume, 2))}</b> mm³</span><span class="info-chip">${escapeHtml(t('measure.surface'))} <b>${escapeHtml(fmt(props.area, 2))}</b> mm²</span>${props.sizeX !== undefined ? `<span class="info-chip">${escapeHtml(t('measure.size3d'))} <b>${escapeHtml(`${fmt(props.sizeX, 2)} × ${fmt(props.sizeY, 2)} × ${fmt(props.sizeZ, 2)}`)}</b> mm</span>` : ''}`;
    applyLabel = t(d.mode === 'edit' ? 'solid.apply' : 'solid.insert');
  } else if (d.mode === 'feature') {
    title = `${t(`feature.${d.kind}`)} — ${t('feature.fromSelection', { count: p.count ?? 0 })}`;
    left = `<div class="feature-help">${icon(glyph, 'icon feature-icon')}<p>${escapeHtml(t(`featureTip.${d.kind}`))}</p></div>`;
    fields = paramRows();
    if (d.kind === 'revolution') fields += row('axes', t('feature.axis'), `<span class="segmented">${REVOLVE_AXES.map((axis) => `<button class="segment ${d.axis === axis ? 'active' : ''}" data-solid-axis="${axis}" title="${escapeHtml(t(`axis.${axis}`))}">${escapeHtml(t(`axis.${axis}`))}</button>`).join('')}</span>`);
    const entity = solidPreviewEntity();
    preview = entity ? isoSvg([entity]) : '';
    if (entity) {
      const props = solidProperties(normalizeEntity(entity));
      info = `<span class="info-chip">${escapeHtml(t('measure.volume'))} <b>${escapeHtml(fmt(props.volume, 2))}</b> mm³</span><span class="info-chip">${escapeHtml(t('measure.size3d'))} <b>${escapeHtml(`${fmt(props.sizeX, 2)} × ${fmt(props.sizeY, 2)} × ${fmt(props.sizeZ, 2)}`)}</b> mm</span>`;
    }
    applyLabel = t(`feature.${d.kind}`);
  } else if (d.mode === 'section') {
    glyph = 'solidSection';
    title = t('section.title');
    left = `<div class="feature-help">${icon('solidSection', 'icon feature-icon')}<p>${escapeHtml(t('section.help'))}</p></div>`;
    const range = p.range ?? [0, 10];
    fields = num('section:level', d.level, { min: -1e6, max: 1e6, step: 1, unit: 'mm' }, t('section.level'))
      + row('info', t('section.range'), `<b>${escapeHtml(`${fmt(range[0], 2)} … ${fmt(range[1], 2)} mm`)}</b>`);
    const solids = p.solids ?? [];
    const cut = solids.flatMap((raw) => { const entity = normalizeEntity(raw); return entity ? sectionAt(solidMesh(entity), d.level) : []; });
    // The cut drawn in the iso view at its height.
    const lifted = cut.map(([a, b]) => [VIEW_AXES.iso([a.x, a.y, d.level]), VIEW_AXES.iso([b.x, b.y, d.level])]);
    preview = isoSvg(solids, { extra: lifted });
    info = `<span class="info-chip">${escapeHtml(t('section.segments'))} <b id="section-count">${cut.length}</b></span>`;
    applyLabel = t('section.apply');
  } else {
    glyph = 'solidProject';
    title = t('project.title');
    left = `<div class="feature-help">${icon('solidProject', 'icon feature-icon')}<p>${escapeHtml(t('project.help'))}</p></div>`;
    fields = ['front', 'top', 'right', 'iso'].map((view) => row('eye', t(`view3d.${view}`), switchControl(`data-solid-view="${view}"`, d.views[view], t(`view3d.${view}`)))).join('')
      + num('project:gap', d.gap, { min: 0, max: 10000, step: 5, unit: 'mm' }, t('project.gap'));
    preview = isoSvg(p.solids ?? []);
    applyLabel = t('project.apply');
  }
  root.innerHTML = frame({
    glyph, title,
    body: `<div class="part-view solid-view">
      ${left}
      <div class="part-fields">${fields}</div>
      <div class="part-preview"><div class="part-svg" id="solid-preview">${preview}</div><div class="part-info">${info}</div></div>
    </div>`,
    foot: `<span class="muted">${escapeHtml(t(d.mode === 'insert' ? 'solid.insertHint' : 'solid.hint'))}</span><span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}<button class="button primary" data-action="solid-apply" title="${escapeHtml(applyLabel)}" ${d.mode === 'project' && !Object.values(d.views).some(Boolean) ? 'disabled' : ''}>${icon(d.mode === 'edit' ? 'check' : glyph)}<span>${escapeHtml(applyLabel)}</span></button>`,
  });
  ready();
}

function applySolid() {
  const d = state.solid;
  if (d.mode === 'section') return close({ action: 'section', level: d.level });
  if (d.mode === 'project') return close({ action: 'project', views: d.views, gap: d.gap });
  if (d.mode === 'feature') return close({ action: 'feature', kind: d.kind, params: normalizeSolidParams(d.kind, d.params), axis: d.axis });
  return close({ action: d.mode === 'edit' ? 'apply' : 'insert', kind: d.kind, params: normalizeSolidParams(d.kind, d.params), ...d.place });
}

// ───────────────────────── FreeCAD coverage window

function renderCoverage() {
  const ko = getLanguage() === 'ko';
  const group = FREECAD_COVERAGE.find((entry) => entry.id === state.tab) ?? FREECAD_COVERAGE[0];
  const summary = coverageSummary();
  const mark = { full: ['check', 'status-full'], partial: ['warning', 'status-partial'], none: ['close', 'status-none'] };
  const tabs = `<nav class="tabs coverage-tabs" role="tablist">${FREECAD_COVERAGE.map((entry) => `<button class="tab ${entry.id === group.id ? 'active' : ''}" role="tab" aria-selected="${entry.id === group.id}" data-action="tab" data-value="${entry.id}" title="${escapeHtml(ko ? entry.ko : entry.en)}">${icon(entry.icon)}<span>${escapeHtml((ko ? entry.ko : entry.en).replace(/ \(.*\)$/, ''))}</span></button>`).join('')}</nav>`;
  const rows = group.items.map((entry) => {
    const [glyph, cls] = mark[entry.status];
    const note = ko ? entry.noteKo : entry.noteEn;
    const tip = `${ko ? entry.ko : entry.en}${note ? ` — ${note}` : ''}${entry.commands.length ? `\n${t('coverage.commands')}: ${entry.commands.join(', ')}` : ''}`;
    return `<div class="coverage-row ${cls}" data-status="${entry.status}" title="${escapeHtml(tip)}"><span class="coverage-mark">${icon(glyph)}<span>${escapeHtml(t(`coverage.${entry.status}`))}</span></span><span class="coverage-name">${escapeHtml(ko ? entry.ko : entry.en)}</span><span class="coverage-note">${escapeHtml(note)}</span></div>`;
  }).join('');
  root.innerHTML = frame({
    glyph: 'freecad', title: t('coverage.title'), tabs,
    body: `<div class="coverage-view">${rows}</div>`,
    foot: `<span class="info-chip status-full">${icon('check')} ${escapeHtml(t('coverage.full'))} <b>${summary.full}</b></span><span class="info-chip status-partial">${icon('warning')} ${escapeHtml(t('coverage.partial'))} <b>${summary.partial}</b></span><span class="info-chip status-none">${icon('close')} ${escapeHtml(t('coverage.none'))} <b>${summary.none}</b></span><span class="muted">${escapeHtml(t('coverage.hint'))}</span><span class="grow"></span>${button('close', t('error.close'), 'close', 'primary')}`,
  });
  ready();
}

// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-print-orientation], [data-theme-group], [data-pick-theme], [data-part-kind], [data-part-category], [data-part-view], [data-array-mode], [data-stl-scope], [data-stl-ascii], [data-solid-kind], [data-solid-axis], [data-coverage-filter]');
  if (!target || target.disabled) return undefined;
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id);
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const raw = target.dataset.value;
    return update({ [key]: typeof s()[key] === 'number' ? Number(raw) : raw });
  }
  if (target.dataset.printOrientation) return changePrint({ orientation: target.dataset.printOrientation });
  if (target.dataset.themeGroup) { state.themeGroup = target.dataset.themeGroup; return render(); }
  if (target.dataset.pickTheme) { pickerDone = true; return close({ theme: target.dataset.pickTheme }); }
  if (target.dataset.partCategory) {
    state.part.cache[state.part.kind] = state.part.params;
    state.part.kind = PART_CATEGORIES[target.dataset.partCategory][0];
    state.part.params = normalizeParams(state.part.kind, state.part.cache[state.part.kind] ?? {});
    return render();
  }
  if (target.dataset.partView) {
    state.part.params = normalizeParams(state.part.kind, { ...state.part.params, view: target.dataset.partView });
    state.part.cache[state.part.kind] = state.part.params;
    return render();
  }
  if (target.dataset.partKind) {
    state.part.kind = target.dataset.partKind;
    state.part.params = normalizeParams(state.part.kind, state.part.cache[state.part.kind] ?? {});
    return render();
  }
  if (target.dataset.solidKind) {
    const d = state.solid;
    d.cache[d.kind] = d.params;
    d.kind = target.dataset.solidKind;
    d.params = normalizeSolidParams(d.kind, d.cache[d.kind] ?? {});
    return render();
  }
  if (target.dataset.solidAxis) { state.solid.axis = target.dataset.solidAxis; return render(); }
  if (target.dataset.coverageFilter) { state.coverageFilter = target.dataset.coverageFilter; return render(); }
  if (target.dataset.arrayMode) { state.array.mode = target.dataset.value; return render(); }
  if (target.dataset.stlScope) { state.stl.scope = target.dataset.stlScope; return render(); }
  if (target.dataset.stlAscii) { state.stl.ascii = target.dataset.stlAscii === '1'; return render(); }
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
      const keep = { backgroundImage: s().backgroundImage, backgroundName: s().backgroundName, lastDirectory: s().lastDirectory, language: s().language, author: s().author };
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
    case 'part-apply':
      return applyPart();
    case 'array-apply':
      return applyArray();
    case 'stl-export':
      return applyStl();
    case 'solid-apply':
      return applySolid();
    default:
      return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.customColor) return update({ customTheme: { ...s().customTheme, [target.dataset.customColor]: target.value }, theme: CUSTOM });
  if ('customDark' in target.dataset) return update({ customTheme: { ...s().customTheme, dark: target.checked }, theme: CUSTOM });
  if (target.dataset.toggle) return update({ [target.dataset.toggle]: target.checked });
  if (target.dataset.snapMode) return update({ snapModes: { ...s().snapModes, [target.dataset.snapMode]: target.checked } });
  if (target.dataset.select) {
    const key = target.dataset.select;
    return update({ [key]: typeof s()[key] === 'number' ? Number(target.value) : target.value });
  }
  if (target.dataset.text) return update({ [target.dataset.text]: target.value });
  if (target.dataset.printRange) return changePrint({ range: target.dataset.printRange, layers: null, selectedOnly: target.dataset.printRange === 'custom' ? printSetup().selectedOnly : false });
  if (target.dataset.printToggle) return changePrint({ [target.dataset.printToggle]: target.checked });
  if (target.dataset.print) return changePrint({ [target.dataset.print]: target.value });
  if (target.dataset.printLayer) {
    const all = (state.params.drawings?.[state.params.current ?? 0]?.layers ?? []).map((layer) => layer.id);
    const current = new Set(printSetup().layers ?? all);
    if (target.checked) current.add(target.dataset.printLayer); else current.delete(target.dataset.printLayer);
    return changePrint({ layers: all.filter((id) => current.has(id)) });
  }
  if (target.dataset.partParam) {
    const d = state.part;
    const param = PARTS[d.kind].params.find((item) => item.key === target.dataset.partParam);
    d.params = normalizeParams(d.kind, { ...d.params, [param.key]: param.type === 'bool' ? target.checked : target.value });
    d.cache[d.kind] = d.params;
    return render();
  }
  if (target.dataset.array) {
    const value = evaluate(target.value);
    if (Number.isFinite(value)) state.array[target.dataset.array] = value;
    return render();
  }
  if (target.dataset.arrayToggle) { state.array[target.dataset.arrayToggle] = target.checked; return render(); }
  if (target.dataset.solidView) { state.solid.views[target.dataset.solidView] = target.checked; return render(); }
  return undefined;
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
  if (kind === 'print' && event.key === 'PageUp') { state.page -= 1; render(); }
  if ((kind === 'part' || kind === 'array' || kind === 'stl' || kind === 'solid') && event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); if (kind === 'part') applyPart(); else if (kind === 'array') applyArray(); else if (kind === 'solid') applySolid(); else applyStl(); }
});
document.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('textarea, input')) event.preventDefault();
});

// The theme dropdown also closes when it loses focus.
window.addEventListener('blur', () => {
  if (kind === 'theme' && !pickerDone) setTimeout(() => { if (!document.hasFocus() && !pickerDone) { pickerDone = true; close(); } }, 120);
});

// Number fields (steppers).
bindSteppers(root, (key, value) => {
  const [scope, field] = key.includes(':') ? key.split(':') : ['setting', key];
  if (key === 'part-angle') { state.part.angle = value; return render(); }
  if (scope === 'setting') update({ [field]: value });
  else if (scope === 'part') {
    const d = state.part;
    d.params = normalizeParams(d.kind, { ...d.params, [field]: value });
    d.cache[d.kind] = d.params;
    render();
  } else if (scope === 'array') { state.array[field] = value; render(); } else if (scope === 'stl') { state.stl[field] = value; render(); } else if (scope === 'solid') {
    const d = state.solid;
    d.params = normalizeSolidParams(d.kind, { ...d.params, [field]: value });
    d.cache[d.kind] = d.params;
    render();
  } else if (scope === 'solidPlace') { state.solid.place[field] = value; render(); } else if (scope === 'section') { state.solid.level = value; render(); } else if (scope === 'project') { state.solid.gap = value; render(); }
  return undefined;
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

// Settings changed elsewhere (main window: toolbar toggles, theme menu…).
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
  if (kind === 'theme') { state.placed = false; pickerDone = false; }
  if (kind === 'part') state.part = null;
  if (kind === 'array') state.array = null;
  if (kind === 'stl') state.stl = null;
  if (kind === 'solid') state.solid = null;
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
    if (event.origin === location.origin && event.data?.mycadHost) onHostMessage(event.data);
  });
}
window.addEventListener('resize', () => { if (kind === 'print') fitPreview(); });

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__mycadPopup = { kind, state, render, close, errorReport, printLayout, refresh, applyPart, applyArray, applyStl, stlMesh, applySolid };

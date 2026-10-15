// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web, ?popup=<kind>). Every popup has a fixed
// size chosen so its content fits without scrolling; long settings are split
// into tabs and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { formatNumber } from './domain/entities.js';
import { evaluate } from './domain/expr.js';
import { evaluateLength, formatArea, formatLength, formatVolume, LENGTH_UNITS, lengthValue, setDisplayUnit, unitLabel } from './domain/units.js';
import { FILE_FORMATS } from './domain/format.js';
import { CATEGORY_ICONS, categoryOf, generatePart, normalizeParams, optionIsWord, PART_CATEGORIES, PARTS, partInfo } from './domain/parts.js';
import './view/partIcons.js';
import { defaultPrintOptions, MARGINS, PAPERS, paginate, pageSvg, SCALES, selectContent } from './domain/print.js';
import { loadRecent, MAX_RECENT, removeRecent, storeRecent } from './domain/recent.js';
import {
  BACKGROUND_FITS, CROSSHAIR_WIDTHS, defaultSettings, FONT_STYLES, FONT_WEIGHTS, GRID_SIZES, loadSettings, RECENT_KEY, SNAP_MODES, STORAGE_KEY, storeSettings, TEXT_HEIGHT,
} from './domain/settings.js';
import { previewSvg } from './domain/svg.js';
import { prepareStl } from './domain/stl.js';
import { normalizeEntity } from './domain/entities.js';
import { coverageSummary, FREECAD_COVERAGE } from './domain/freecad.js';
import { CAM_3D, CAM_OPERATIONS, camPaths, camStats, normalizeCamOptions, PROFILE_SIDES, RASTER_DIRECTIONS, TOOL_SHAPES } from './domain/cam.js';
import { gridFor, simulate, stockCheck } from './domain/cam3d.js';
import { cellPos, columnName, computeSheet, isCell, mergeCells, mergeOf, normalizeSpreadsheet, rangeCells, SHEET_ROWS, splitCell, styleCells } from './domain/spreadsheet.js';
import { SHEET_TOOLS } from './commands/sheet.js';
import { analyzeFrame, autoScale, deformedShape, MATERIALS, momentDiagram, normalizeFem, SECTION_TYPES, SUPPORT_TYPES } from './domain/fem.js';
import { analyzeSolid, boundaryQuads, FEM3D_FACES, normalizeFem3d } from './domain/fem3d.js';
import { analyzePlate, normalizePlate, PLATE_SUPPORTS, plateDeformed, platePeak, plateScale, plateSides, stressColor } from './domain/plate.js';
import {
  ALL_SOLID_KINDS, featureFrom, normalizeSolidParams, projectEdges, REVOLVE_AXES, sectionAt, shadedView, SOLID_ICONS, SOLID_KINDS, SOLIDS, solidMesh, solidProperties, VIEW_AXES,
} from './domain/solids.js';
import { isVisible } from './domain/drawing.js';
import { ARCH_INSERT_KINDS, archFrom, defaultOpening, EQUIPMENT_SIZES, EQUIPMENT_TYPES, isArchKind, MATERIAL_PATTERNS, normalizeBim, OPENING_TYPES, presetMaterials, wallLength } from './domain/arch.js';
import { formatBytes, getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { POPUPS, popupParams } from './platform/popups.js';
// The icons of the workbench command modules (dialog titles and fields use them).
import './commands/std-icons.js';
import './commands/std2-icons.js';
import './commands/part-icons.js';
import './commands/partdesign-icons.js';
import './commands/sketcher-icons.js';
import './commands/draft-icons.js';
import './commands/mesh-icons.js';
import './commands/assembly-icons.js';
import './commands/openscad-icons.js';
import './commands/camjob-icons.js';
import './commands/femx-icons.js';
import './commands/techdraw-icons.js';
import './commands/bim-icons.js';
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
/** "V1.0": how the version is shown. */
const displayVersion = (version) => (version && version !== '?' ? `V${String(version).split('.').slice(0, 2).join('.')}` : String(version ?? ''));

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
  setDisplayUnit(s().units);
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
  appWindow.setTitle(`${title} — MyCAD ${displayVersion(version)}`).catch(() => {});
}

const frameHtml = (parts) => frame(parts);
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
// unit 'mm' marks a length: shown and stepped in the display unit (onChange still gets mm).
const numberField = (key, value, min, max, step, unit, label) => stepperHtml({
  key, value, min, max, step, unit, label, length: unit === 'mm',
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
      recent: renderRecent, print: renderPrint, menu: renderMenu, theme: renderThemePicker, form: renderForm, viewer: renderViewer, part: renderPart, array: renderArray, stl: renderStl, solid: renderSolid, coverage: renderCoverage, tutorial: renderTutorial, bim: renderBim, check: renderCheck, cam: renderCam, fem: renderFem, plate: renderPlate, fem3d: renderFem3d, addons: renderAddons, spreadsheet: renderSheet,
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
  else send('place', { ...frameAnchor(), width: window.innerWidth || POPUPS[kind].width, height: target });
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
    row('measure', t('settings.units'), `<select data-select="units" id="settings-units" title="${escapeHtml(t('settings.unitsTip'))}">${LENGTH_UNITS.map((unit) => `<option value="${unit}" ${s().units === unit ? 'selected' : ''}>${escapeHtml(t(`units.${unit}`))}</option>`).join('')}</select>`, t('settings.unitsTip')),
    row('user', t('settings.author'), `<input class="wide" data-text="author" value="${escapeHtml(s().author)}" placeholder="${escapeHtml(t('settings.authorHint'))}" title="${escapeHtml(t('settings.author'))}" />`),
    toggle('restoreSession', t('settings.restoreSession'), 'refresh'),
    toggle('showStartPage', t('settings.showStartPage'), 'home'),
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
    toggle('showScaleBar', t('action.scaleBar'), 'scaleBar'),
    row('grid', t('settings.gridSize'), `<select data-select="gridSize" title="${escapeHtml(t('settings.gridSize'))}">${GRID_SIZES.map((size) => `<option value="${size}" ${s().gridSize === size ? 'selected' : ''}>${escapeHtml(formatLength(size))}</option>`).join('')}</select>`),
    toggle('snapGrid', t('action.snapGrid'), 'grid'),
    toggle('snapObject', t('action.snap'), 'snap'),
    toggle('ortho', t('action.ortho'), 'ortho'),
    toggle('showLineWeights', t('action.lineWeights'), 'line'),
    toggle('crosshair', t('action.crosshair'), 'coordinate'),
    row('palette', t('settings.crosshairLook'), `<span class="pair"><input type="color" data-setting-color="crosshairColor" value="${escapeHtml(s().crosshairColor)}" title="${escapeHtml(t('settings.crosshairColor'))}" aria-label="${escapeHtml(t('settings.crosshairColor'))}" /><select data-select="crosshairWidth" title="${escapeHtml(t('settings.crosshairWidth'))}" aria-label="${escapeHtml(t('settings.crosshairWidth'))}">${CROSSHAIR_WIDTHS.map((w) => `<option value="${w}" ${s().crosshairWidth === w ? 'selected' : ''}>${w} px</option>`).join('')}</select></span>`),
    row('cube', t('view3d.thickness'), numberField('extrudeHeight', s().extrudeHeight, 0.1, 1000, 1, 'mm', t('view3d.thickness'))),
    row('text', t('settings.axisLabelSize'), numberField('axisLabelSize', s().axisLabelSize, 40, 250, 10, '%', t('settings.axisLabelSize'))),
    row('dimension', t('settings.dimPrecision'), `<select data-select="dimPrecision" title="${escapeHtml(t('settings.dimPrecision'))}">${[0, 1, 2, 3, 4].map((p) => `<option value="${p}" ${s().dimPrecision === p ? 'selected' : ''}>${p === 0 ? '0' : `0.${'0'.repeat(p)}`}</option>`).join('')}</select>`),
  ].join('');
}

function settingsSnaps() {
  return [
    `<div class="row notice-row">${icon('snap')}<span>${escapeHtml(t('settings.snapHint'))}</span></div>`,
    // Every snap of the Draft snap toolbar, then snapping onto the working plane and the live dimensions (compact rows).
    `<div class="snap-list">${[
      ...SNAP_MODES.map((mode) => row(`snap`, t(`snap.${mode}`), switchControl(`data-snap-mode="${mode}"`, s().snapModes[mode], t(`snap.${mode}`)))),
      toggle('snapWorkingPlane', t('snap.workingPlane'), 'workPlane'),
      toggle('snapDimensions', t('snap.dimensions'), 'dimension'),
    ].join('')}</div>`,
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
    ['info', t('about.version'), `${displayVersion(info.version)} (${info.version})`],
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
  const tab = state.tab === 'files' ? 'files' : 'info';
  const tabs = `<nav class="tabs" role="tablist">${[['info', 'info', 'about.tabInfo'], ['files', 'folder', 'about.tabFiles']].map(([id, glyph, key]) => `
    <button class="tab ${tab === id ? 'active' : ''}" role="tab" aria-selected="${tab === id}" data-action="tab" data-value="${id}" title="${escapeHtml(t(key))}">${icon(glyph)}<span>${escapeHtml(t(key))}</span></button>`).join('')}</nav>`;
  const foot = `<span class="muted">© SHKWON(knix008@naver.com)</span><span class="grow"></span>${button('copy-about', t('action.copy'), 'copy')}${button('close', t('settings.done'), 'check', 'primary')}`;
  if (tab === 'files') {
    root.innerHTML = frame({ glyph: 'info', title: t('about.title'), tabs, body: `<div class="about about-files-page">${fileFormatsHtml()}</div>`, foot });
    fitHeight();
    ready();
    return;
  }
  root.innerHTML = frame({
    glyph: 'info', title: t('about.title'), tabs,
    body: `<div class="about">
      <div class="about-top">
        <img class="about-icon" src="${appIcon}" alt="" />
        <div class="about-text">
          <div class="about-name">${escapeHtml(info.name)} <span class="about-version">${escapeHtml(displayVersion(info.version))}</span></div>
          <div class="about-tagline">${escapeHtml(t('about.tagline'))}</div>
          <p class="about-description">${escapeHtml(t('about.description'))}</p>
        </div>
      </div>
      <div class="about-rows" id="about-rows">${table(t('about.buildInfo'), 'gear', build)}${table(t('about.authorInfo'), 'user', author)}</div>
    </div>`,
    foot,
  });
  fitHeight();
  ready();
}

/** Supported file formats, by group: name, extensions, read / write. */
function fileFormatsHtml() {
  const mark = (on, label) => `<span class="format-mark ${on ? 'yes' : 'no'}" title="${escapeHtml(`${label}: ${on ? t('about.yes') : t('about.no')}`)}">${icon(on ? 'check' : 'close')}<span>${escapeHtml(label)}</span></span>`;
  const groups = [['drawing', 'drawing'], ['model', 'cube'], ['other', 'image']];
  const sections = groups.map(([group, glyph]) => {
    const rows = FILE_FORMATS.filter((format) => format.group === group).map((format) => {
      const name = format.id === 'image' || format.id === 'text' ? t(`about.fileName.${format.id}`) : format.name;
      const extensions = format.extensions.map((ext) => `.${ext}`).join(' ');
      const use = format.use ? t(`about.use.${format.use}`) : '';
      const copy = `${name} (${extensions}): ${[format.read ? t('about.read') : '', format.write ? t('about.write') : ''].filter(Boolean).join(', ')}${use ? ` — ${use}` : ''}`;
      return `<div class="format-row" data-format="${format.id}" data-copy="${escapeHtml(copy)}" title="${escapeHtml(copy)}">
        <span class="format-name">${escapeHtml(name)}${use ? `<small>${escapeHtml(use)}</small>` : ''}</span>
        <span class="format-ext">${escapeHtml(extensions)}</span>${mark(format.read, t('about.read'))}${mark(format.write, t('about.write'))}</div>`;
    }).join('');
    return `<h3 class="about-section">${icon(glyph)}<span>${escapeHtml(t(`about.files.${group}`))}</span></h3><div class="format-table">${rows}</div>`;
  }).join('');
  return `<div class="about-rows" id="about-rows">${sections}</div><p class="muted about-files-hint">${escapeHtml(t('about.filesHint'))}</p>`;
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
  // Submenus open in the same window: the path of open groups, reset for each new menu.
  if (menuPath.params !== p) { menuPath.params = p; menuPath.list = []; }
  let items = p.items;
  let parent = null;
  for (const index of menuPath.list) if (items[index]?.items) { parent = items[index]; items = parent.items; }
  // Only the items: the menu's name is the OS window title and the accessible name.
  setOsTitle(p.header?.title);
  const contains = (item) => (item.items ?? []).flatMap((sub) => (sub.items ? contains(sub) : sub.id ? [sub.id] : [])).join(' ');
  const back = parent ? `<button class="menu-item menu-back" role="menuitem" data-menu-back title="${escapeHtml(parent.label)}">
        <span class="menu-icon">${icon('chevronLeft')}</span>
        <span class="menu-label">${escapeHtml(parent.label)}</span>
        <span class="menu-key"></span><span class="menu-check"></span>
      </button><div class="menu-sep" role="separator"></div>` : '';
  root.innerHTML = `<div class="popup-menu" role="menu" aria-label="${escapeHtml(p.header?.title ?? '')}" data-title="${escapeHtml(p.header?.title ?? '')}" data-depth="${menuPath.list.length}">${back}${items.map((item, index) => (item.separator
    ? '<div class="menu-sep" role="separator"></div>'
    : item.items
      ? `<button class="menu-item has-sub" role="menuitem" aria-haspopup="menu" data-sub="${index}" data-contains="${escapeHtml(contains(item))}" title="${escapeHtml(item.label)}">
        <span class="menu-icon">${icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key"></span>
        <span class="menu-check">${icon('chevronRight')}</span>
      </button>`
      : `<button class="menu-item ${item.danger ? 'danger' : ''}" role="menuitem" data-index="${index}" data-id="${escapeHtml(item.id)}" ${item.disabled ? 'disabled aria-disabled="true"' : ''} title="${escapeHtml(item.label)}">
        <span class="menu-icon">${icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key">${escapeHtml(item.shortcut ?? '')}</span>
        <span class="menu-check">${item.checked ? icon('check') : ''}</span>
      </button>`)).join('')}</div>`;
  const menu = root.querySelector('.popup-menu');
  const anchor = p.anchor ?? { x: 100, y: 100 };
  let placed = null;
  const place = () => {
    if (!menu.isConnected) return;
    const width = Math.ceil(menu.scrollWidth) + 2;
    const height = Math.ceil(menu.scrollHeight) + 2;
    if (placed && placed.width === width && placed.height === height) return;
    placed = { width, height };
    if (desktop) {
      native.invoke('place_popup', { x: anchor.x, y: anchor.y, width, height, flipY: anchor.flipY ?? null, show: true })
        .then(() => window.focus())
        .catch(() => {});
    } else {
      send('place', { x: anchor.x, y: anchor.y, width, height, flipY: anchor.flipY ?? null });
    }
  };
  place();
  // The first menu can be measured before the interface font has loaded: follow its size until it is replaced.
  menuResize?.disconnect();
  menuResize = new ResizeObserver(() => place());
  menuResize.observe(menu);
  menuOpen = true;
}

let menuOpen = false;
let menuResize = null;
const menuPath = { params: null, list: [] };
/** Opens a group of the menu in place (index in the shown list), or goes back one level (null). */
function openSubmenu(index) {
  if (index === null) menuPath.list.pop();
  else menuPath.list.push(index);
  renderMenu();
  root.querySelector('.menu-item:not([disabled])')?.focus();
}
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
  const info = standard + Object.entries(partInfo(d.kind, d.params)).map(([key, value]) => `<span class="info-chip" title="${escapeHtml(t(`info.${key}`))}">${escapeHtml(t(`info.${key}`))} <b>${escapeHtml(lengthValue(value))}</b> ${unitLabel()}</span>`).join('');
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
  const input = (key, label, unit = 'mm') => (unit === 'mm'
    ? row('measure', label, `<input class="num" data-array="${key}" data-length="1" value="${escapeHtml(lengthValue(a[key]))}" title="${escapeHtml(`${label} (${unitLabel()})`)}" /><small>${unitLabel()}</small>`)
    : row('measure', label, `<input class="num" data-array="${key}" value="${escapeHtml(a[key])}" title="${escapeHtml(label)}" /><small>${unit}</small>`));
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
    row('zoomFit', t('stl.size'), `<b id="stl-size">${lengthValue(mesh.size.x)} × ${lengthValue(mesh.size.y)} × ${lengthValue(mesh.size.z)} ${unitLabel()}</b>`),
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
  // Pocket and Groove are features, not solid kinds: their window still takes them.
  const solidKind = ALL_SOLID_KINDS.includes(p.kind) || (mode === 'feature' && SOLIDS[p.kind]) ? p.kind : 'box';
  state.solid = {
    mode, kind: solidKind,
    params: normalizeSolidParams(solidKind, p.params ?? {}),
    place: Object.fromEntries(PLACE_KEYS.map(([key]) => [key, Number(p[key]) || 0])),
    axis: REVOLVE_AXES.includes(p.axis) ? p.axis : 'yAxis',
    level: Number(p.level) || 0,
    views: { top: true, front: true, right: true, iso: false, ...(p.views ?? {}) },
    gap: Number(p.gap) || 20,
    cache: {},
    // A wall's shape (its windows and doors are edited here).
    // A wall's or roof's shape (windows and doors, material layers; slope per edge) is edited here.
    shape: ['wall', 'roof'].includes(solidKind) && p.shape ? structuredClone(p.shape) : null,
    // Opened to add a window or door: straight to the openings.
    tab: Number.isInteger(p.focus) ? 'openings' : 'shape',
    edge: 0,
    focus: Number.isInteger(p.focus) ? p.focus : null,
  };
}

/** Label of a solid parameter: per kind when it reads differently (a wall's width is its thickness). */
function solidParamLabel(kind, key) {
  const own = `solidParam.${kind}.${key}`;
  const text = t(own);
  return text === own ? t(`solidParam.${key}`) : text;
}

/** Segmented buttons of a choice. */
// More than four choices (steel sections, presets): a dropdown whose options carry the same attributes.
const choiceControl = (attrs, options, value, labelOf) => (options.length > 4
  ? `<select class="choice-select" title="${escapeHtml(labelOf(options[value] ?? options[0]))}">${options.map((option, i) => `<option ${attrs(i)} value="${i}" ${value === i ? 'selected' : ''}>${escapeHtml(labelOf(option))}</option>`).join('')}</select>`
  : `<span class="segmented">${options.map((option, i) => `<button class="segment ${value === i ? 'active' : ''}" ${attrs(i)} title="${escapeHtml(labelOf(option))}">${escapeHtml(labelOf(option))}</button>`).join('')}</span>`);

/**
 * The windows, doors and openings of the wall being edited (FreeCAD: windows
 * hosted by the wall): a chip per opening and the "+" kinds, then the fields of
 * the chosen opening, so the window keeps its fixed size.
 */
function openingRows(d) {
  const openings = d.shape?.openings ?? [];
  const length = wallLength({ shape: d.shape });
  if (openings.length && !(Number.isInteger(d.focus) && d.focus >= 0 && d.focus < openings.length)) d.focus = openings.length - 1;
  const counts = {};
  const chips = openings.map((o, i) => {
    counts[o.type] = (counts[o.type] ?? 0) + 1;
    const name = t('opening.number', { type: t(`archOpt.${o.type}`), n: counts[o.type] });
    return `<button class="opening-chip ${d.focus === i ? 'active' : ''}" data-opening-pick="${i}" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">${icon(o.type === 'window' ? 'archWindow' : 'archDoor')}<span>${i + 1}</span></button>`;
  }).join('');
  const adders = OPENING_TYPES.map((type) => `<button class="icon-button opening-add" data-opening-add="${type}" title="${escapeHtml(t('opening.add', { name: t(`archOpt.${type}`) }))}" aria-label="${escapeHtml(t('opening.add', { name: t(`archOpt.${type}`) }))}">${icon(type === 'window' ? 'archWindow' : 'archDoor')}<b>+</b></button>`).join('');
  const head = `<h4 class="sub-head" title="${escapeHtml(t('opening.hint', { length: `${lengthValue(length)} ${unitLabel()}` }))}">${icon('archWindow')}<span>${escapeHtml(t('opening.title'))}</span><span class="grow"></span>${adders}</h4>`;
  if (!openings.length) return `${head}<p class="hint">${escapeHtml(t('opening.none'))}</p>`;
  const i = d.focus;
  const o = openings[i];
  const field = (key, value, min, max) => numberField(`opening:${i}.${key}`, value, min, max, 10, 'mm', t(`opening.${key}`));
  const door = ['door', 'doubleDoor'].includes(o.type);
  return `${head}<div class="opening-chips">${chips}<button class="icon-button" data-opening-remove="${i}" title="${escapeHtml(t('opening.remove'))}" aria-label="${escapeHtml(t('opening.remove'))}">${icon('trash')}</button></div>
    ${row('list', t('opening.type'), choiceControl((k) => `data-opening-choice="${i}.type" data-value="${k}"`, OPENING_TYPES, OPENING_TYPES.indexOf(o.type), (option) => t(`archOpt.${option}`)))}
    ${row('measure', `${t('opening.at')} / ${t('opening.width')}`, `<span class="pair">${field('at', o.at, 0, Math.max(0, length))}${field('width', o.width, 50, 50000)}</span>`)}
    ${row('measure', `${t('opening.sill')} / ${t('opening.height')}`, `<span class="pair">${field('sill', o.sill, 0, 50000)}${field('height', o.height, 50, 50000)}</span>`)}
    ${door ? row('rotate', o.type === 'door' ? `${t('opening.swing')} / ${t('opening.hinge')}` : t('opening.swing'), `<span class="pair">${choiceControl((k) => `data-opening-choice="${i}.swing" data-value="${k}"`, ['swingLeft', 'swingRight'], o.swing > 0 ? 0 : 1, (option) => t(`opening.${option}`))}${o.type === 'door' ? choiceControl((k) => `data-opening-choice="${i}.hinge" data-value="${k}"`, ['hingeStart', 'hingeEnd'], o.hinge > 0 ? 0 : 1, (option) => t(`opening.${option}`)) : ''}</span>`) : ''}
    ${o.type === 'window' ? row('list', `${t('opening.cols')} / ${t('opening.rows')}`, `<span class="pair">${numberField(`opening:${i}.cols`, o.cols ?? 1, 1, 8, 1, '', t('opening.cols'))}${numberField(`opening:${i}.rows`, o.rows ?? 1, 1, 8, 1, '', t('opening.rows'))}</span>`) : ''}
    ${o.type === 'custom' ? `<p class="hint opening-hint">${escapeHtml(t('opening.customHint'))}</p>` : ''}`;
}

/** The material layers of a wall, outside to inside (FreeCAD MultiMaterial). */
function layerRows(d) {
  const layers = d.shape.layers ?? [];
  const materials = state.params.materials?.length ? state.params.materials : presetMaterials(getLanguage());
  const total = layers.reduce((sum, layer) => sum + layer.thickness, 0);
  const head = `<h4 class="sub-head">${icon('archMaterial')}<span>${escapeHtml(t('layers.title'))}</span><span class="grow"></span><button class="small-button" data-layer-add="1" title="${escapeHtml(t('layers.add'))}">${icon('plus')}<span>${escapeHtml(t('layers.add'))}</span></button></h4>`;
  if (!layers.length) return `${head}<p class="hint">${escapeHtml(t('layers.none'))}</p>`;
  const rows = layers.map((layer, i) => `<div class="row wall-layer" title="${escapeHtml(layer.material.name)}"><span class="row-label"><i class="swatch" style="background:${layer.material.color}"></i><span>${i + 1}</span></span><span class="row-control"><select data-layer-material="${i}" title="${escapeHtml(t('layers.material'))}">${materials.map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === layer.material.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select>${numberField(`layer:${i}`, layer.thickness, 1, 5000, 5, 'mm', t('layers.thickness'))}<button class="icon-button" data-layer-move="${i}:-1" title="${escapeHtml(t('layers.up'))}" aria-label="${escapeHtml(t('layers.up'))}" ${i ? '' : 'disabled'}>${icon('chevronUp')}</button><button class="icon-button" data-layer-move="${i}:1" title="${escapeHtml(t('layers.down'))}" aria-label="${escapeHtml(t('layers.down'))}" ${i < layers.length - 1 ? '' : 'disabled'}>${icon('chevronDown')}</button><button class="icon-button" data-layer-remove="${i}" title="${escapeHtml(t('layers.remove'))}" aria-label="${escapeHtml(t('layers.remove'))}">${icon('trash')}</button></span></div>`).join('');
  return `${head}${rows}<p class="hint">${escapeHtml(t('layers.total', { width: `${lengthValue(total)} ${unitLabel()}` }))}</p>`;
}

/** The slope of each roof edge (90° = gable), like FreeCAD's roof angles per edge. */
function edgeRows(d) {
  const outer = d.shape.outer ?? [];
  const n = outer.length;
  d.shape.slopes = Array.from({ length: n }, (_, i) => d.shape.slopes?.[i] ?? null);
  if (!(Number.isInteger(d.edge) && d.edge >= 0 && d.edge < n)) d.edge = 0;
  const len = (i) => Math.hypot(outer[(i + 1) % n].x - outer[i].x, outer[(i + 1) % n].y - outer[i].y);
  const chips = outer.map((_, i) => { const v = d.shape.slopes[i]; const mark = v === null ? '' : v >= 89.999 ? ' ⊥' : ` ${Math.round(v)}°`; return `<button class="opening-chip ${d.edge === i ? 'active' : ''}" data-edge-pick="${i}" title="${escapeHtml(`${t('roofEdges.edge', { n: i + 1 })} · ${lengthValue(len(i))} ${unitLabel()}`)}">${icon('line')}<span>${i + 1}${mark}</span></button>`; }).join('');
  const v = d.shape.slopes[d.edge];
  const mode = v === null ? 0 : v >= 89.999 ? 1 : 2;
  return `<h4 class="sub-head" title="${escapeHtml(t('roofEdges.hint'))}">${icon('archRoof')}<span>${escapeHtml(t('roofEdges.title'))}</span></h4>
    <div class="opening-chips">${chips}</div>
    ${row('line', t('roofEdges.edge', { n: d.edge + 1 }), `<b>${escapeHtml(`${lengthValue(len(d.edge))} ${unitLabel()}`)}</b>`)}
    ${row('list', t('roofEdges.slope'), choiceControl((k) => `data-edge-mode="${k}"`, ['default', 'gable', 'own'], mode, (option) => (option === 'default' ? t('roofEdges.default') : option === 'gable' ? t('roofEdges.gable') : t('roofEdges.slope'))))}
    ${mode === 2 ? row('rotate', t('roofEdges.slope'), numberField(`edge:${d.edge}`, v, 1, 89, 2.5, '°', t('roofEdges.slope'))) : ''}
    <p class="hint opening-hint">${escapeHtml(t('roofEdges.hint'))}</p>`;
}

/** The solid the window would make (raw entity data), or null. */
function solidPreviewEntity() {
  const d = state.solid;
  const p = state.params;
  if (d.mode === 'feature') return p.source ? featureFrom(d.kind, p.source, d.params, { axis: d.axis }) : null;
  if (d.mode === 'dressup') return { type: 'solid', kind: d.kind, params: d.params, shape: p.shape, ...d.place };
  if (d.mode === 'arch') return p.source ? archFrom(d.kind, p.source, d.params, { normalizeParams: normalizeSolidParams }) : null;
  if (d.mode === 'insert' || d.mode === 'edit') return { type: 'solid', kind: d.kind, params: d.params, ...d.place, shape: d.shape ?? p.shape ?? undefined };
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
  const paramRows = () => SOLIDS[d.kind].params.map((param) => (param.type === 'choice'
    ? row('list', solidParamLabel(d.kind, param.key), choiceControl((i) => `data-solid-choice="${param.key}" data-value="${i}"`, param.options, d.params[param.key], (option) => t(`archOpt.${option}`)))
    : num(`solid:${param.key}`, d.params[param.key], param, solidParamLabel(d.kind, param.key)))).join('');
  let glyph = SOLID_ICONS[d.kind] ?? 'solidBox';
  let title;
  let left = '';
  let fields = '';
  let preview = '';
  let info = '';
  let applyLabel = t('solid.insert');
  if (d.mode === 'insert' || d.mode === 'edit') {
    title = `${t(d.mode === 'edit' ? 'solid.editTitle' : 'solid.insertTitle')} — ${t(`solid.${d.kind}`)}`;
    const kinds = d.mode === 'edit' && !SOLID_KINDS.includes(d.kind) ? [d.kind] : isArchKind(d.kind) ? ARCH_INSERT_KINDS : SOLID_KINDS;
    left = `<div class="part-kinds" role="radiogroup">${kinds.map((id) => `<button class="part-kind ${d.kind === id ? 'active' : ''}" data-solid-kind="${id}" ${d.mode === 'edit' && id !== d.kind ? 'disabled' : ''} title="${escapeHtml(`${t(`solid.${id}`)} — ${t(`solidTip.${id}`)}`)}">${icon(SOLID_ICONS[id])}<span>${escapeHtml(t(`solid.${id}`))}</span></button>`).join('')}</div>`;
    // BIM objects stand upright: their placement is x, y, z and a turn about z.
    const placeKeys = isArchKind(d.kind) ? PLACE_KEYS.filter(([key]) => !['rx', 'ry'].includes(key)) : PLACE_KEYS;
    const shapeTab = `${paramRows()}<h4 class="sub-head">${icon('move')}<span>${escapeHtml(t('solid.placement'))}</span></h4>${placeKeys.map(([key, unit]) => num(`solidPlace:${key}`, d.place[key], { unit, step: unit === '°' ? 15 : 1 }, t(`solidPlace.${key}`))).join('')}`;
    // Walls and roofs have more to edit than fits: tabs.
    const tabs = d.shape && d.kind === 'wall' ? ['shape', 'openings', 'layers'] : d.shape && d.kind === 'roof' ? ['shape', 'edges'] : [];
    if (!tabs.includes(d.tab)) d.tab = 'shape';
    const tabBar = tabs.length ? `<nav class="segmented solid-tabs" role="tablist">${tabs.map((id) => `<button class="segment ${d.tab === id ? 'active' : ''}" role="tab" aria-selected="${d.tab === id}" data-solid-tab="${id}" title="${escapeHtml(t(`solidTab.${id}`))}">${escapeHtml(t(`solidTab.${id}`))}</button>`).join('')}</nav>` : '';
    fields = tabBar + (d.tab === 'openings' ? openingRows(d) : d.tab === 'layers' ? layerRows(d) : d.tab === 'edges' ? edgeRows(d) : shapeTab);
    const entity = solidPreviewEntity();
    preview = isoSvg([entity]);
    const props = solidProperties(normalizeEntity(entity));
    info = `<span class="info-chip">${escapeHtml(t('measure.volume'))} <b>${escapeHtml(formatVolume(props.volume))}</b></span><span class="info-chip">${escapeHtml(t('measure.surface'))} <b>${escapeHtml(formatArea(props.area))}</b></span>${props.sizeX !== undefined ? `<span class="info-chip">${escapeHtml(t('measure.size3d'))} <b>${escapeHtml(`${lengthValue(props.sizeX)} × ${lengthValue(props.sizeY)} × ${lengthValue(props.sizeZ)}`)}</b> ${unitLabel()}</span>` : ''}`;
    applyLabel = t(d.mode === 'edit' ? 'solid.apply' : 'solid.insert');
  } else if (d.mode === 'feature') {
    title = `${t(`feature.${d.kind}`)} — ${t('feature.fromSelection', { count: p.count ?? 0 })}`;
    left = `<div class="feature-help">${icon(glyph, 'icon feature-icon')}<p>${escapeHtml(t(`featureTip.${d.kind}`))}</p></div>`;
    fields = paramRows();
    if (d.kind === 'revolution' || d.kind === 'groove') fields += row('axes', t('feature.axis'), `<span class="segmented">${REVOLVE_AXES.map((axis) => `<button class="segment ${d.axis === axis ? 'active' : ''}" data-solid-axis="${axis}" title="${escapeHtml(t(`axis.${axis}`))}">${escapeHtml(t(`axis.${axis}`))}</button>`).join('')}</span>`);
    const entity = solidPreviewEntity();
    preview = entity ? isoSvg([entity]) : '';
    if (entity) {
      const props = solidProperties(normalizeEntity(entity));
      info = `<span class="info-chip">${escapeHtml(t('measure.volume'))} <b>${escapeHtml(formatVolume(props.volume))}</b></span><span class="info-chip">${escapeHtml(t('measure.size3d'))} <b>${escapeHtml(`${lengthValue(props.sizeX)} × ${lengthValue(props.sizeY)} × ${lengthValue(props.sizeZ)}`)}</b> ${unitLabel()}</span>`;
    }
    applyLabel = t(`feature.${d.kind}`);
  } else if (d.mode === 'dressup') {
    title = t(`dress.${d.kind}`);
    left = `<div class="feature-help">${icon(glyph, 'icon feature-icon')}<p>${escapeHtml(t(`dressTip.${d.kind}`))}</p></div>`;
    fields = paramRows();
    const entity = solidPreviewEntity();
    preview = isoSvg([entity]);
    const props = solidProperties(normalizeEntity(entity));
    info = `<span class="info-chip">${escapeHtml(t('measure.volume'))} <b>${escapeHtml(formatVolume(props.volume))}</b></span>`;
    applyLabel = t(`dress.${d.kind}`);
  } else if (d.mode === 'arch') {
    title = `${t(`solid.${d.kind}`)} — ${t('feature.fromSelection', { count: p.count ?? 0 })}`;
    left = `<div class="feature-help">${icon(glyph, 'icon feature-icon')}<p>${escapeHtml(t(`featureTip.${d.kind}`))}</p></div>`;
    fields = paramRows();
    const made = solidPreviewEntity() ?? [];
    preview = made.length ? isoSvg(made) : '';
    const props = made.map((raw) => solidProperties(normalizeEntity(raw)));
    if (props.length) info = `<span class="info-chip">${escapeHtml(t(`solid.${d.kind}`))} <b>${made.length}</b></span><span class="info-chip">${escapeHtml(t('measure.volume'))} <b>${escapeHtml(formatVolume(props.reduce((sum, item) => sum + Math.abs(item.volume ?? 0), 0)))}</b></span>`;
    applyLabel = t(`solid.${d.kind}`);
  } else if (d.mode === 'section') {
    glyph = 'solidSection';
    title = t('section.title');
    left = `<div class="feature-help">${icon('solidSection', 'icon feature-icon')}<p>${escapeHtml(t('section.help'))}</p></div>`;
    const range = p.range ?? [0, 10];
    fields = num('section:level', d.level, { min: -1e6, max: 1e6, step: 1, unit: 'mm' }, t('section.level'))
      + row('info', t('section.range'), `<b>${escapeHtml(`${lengthValue(range[0])} … ${lengthValue(range[1])} ${unitLabel()}`)}</b>`);
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
  const single = d.mode === 'edit' && isArchKind(d.kind);
  if (single) left = '';
  root.innerHTML = frame({
    glyph, title,
    body: `<div class="part-view solid-view ${single ? 'no-kinds' : ''}">
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
  if (d.mode === 'arch') return close({ action: 'arch', kind: d.kind, params: normalizeSolidParams(d.kind, d.params) });
  if (d.mode === 'dressup') return close({ action: 'dressup', kind: d.kind, params: normalizeSolidParams(d.kind, d.params) });
  // A layered wall is as wide as its layers.
  if (d.kind === 'wall' && d.shape?.layers?.length) d.params.width = d.shape.layers.reduce((sum, layer) => sum + layer.thickness, 0);
  return close({ action: d.mode === 'edit' ? 'apply' : 'insert', kind: d.kind, params: normalizeSolidParams(d.kind, d.params), ...d.place, ...(d.shape ? { shape: d.shape } : {}) });
}

// ───────────────────────── building window (site, building, levels, materials)

function renderBim() {
  state.bim ??= normalizeBim(structuredClone(state.params.bim ?? {}), getLanguage());
  state.tab ??= 'building';
  const b = state.bim;
  const tabs = `<nav class="tabs" role="tablist">${[['building', 'archBuilding'], ['materials', 'archMaterial']].map(([id, glyph]) => `<button class="tab ${state.tab === id ? 'active' : ''}" role="tab" aria-selected="${state.tab === id}" data-action="tab" data-value="${id}" title="${escapeHtml(t(`bim.tab.${id}`))}">${icon(glyph)}<span>${escapeHtml(t(`bim.tab.${id}`))}</span></button>`).join('')}</nav>`;
  let body;
  if (state.tab === 'materials') {
    const rows = b.materials.map((m, i) => `<div class="row bim-row"><span class="row-label"><i class="swatch" style="background:${m.color}"></i></span><span class="row-control"><input data-bim-text="materials.${i}.name" value="${escapeHtml(m.name)}" title="${escapeHtml(t('bim.materialName'))}" /><input type="color" data-bim-text="materials.${i}.color" value="${m.color}" title="${escapeHtml(t('bim.color'))}" /><select data-bim-text="materials.${i}.pattern" title="${escapeHtml(t('bim.pattern'))}">${MATERIAL_PATTERNS.map((pattern) => `<option value="${pattern}" ${m.pattern === pattern ? 'selected' : ''}>${escapeHtml(t(`archPattern.${pattern}`))}</option>`).join('')}</select><button class="icon-button" data-bim-action="removeMaterial" data-value="${i}" title="${escapeHtml(t('bim.removeMaterial'))}" aria-label="${escapeHtml(t('bim.removeMaterial'))}" ${b.materials.length > 1 ? '' : 'disabled'}>${icon('trash')}</button></span></div>`).join('');
    body = `<div class="bim-view"><div class="bim-list">${rows}</div><div class="bim-actions"><button class="small-button" data-bim-action="addMaterial" title="${escapeHtml(t('bim.addMaterial'))}">${icon('plus')}<span>${escapeHtml(t('bim.addMaterial'))}</span></button></div></div>`;
  } else {
    const counts = state.params.counts ?? {};
    const levels = [...b.levels].sort((x, y) => y.elevation - x.elevation).map((level) => {
      const i = b.levels.indexOf(level);
      return `<div class="row bim-row"><span class="row-label">${icon('archLevel')}<small>${counts[level.id] ?? 0}</small></span><span class="row-control"><input data-bim-text="levels.${i}.name" value="${escapeHtml(level.name)}" title="${escapeHtml(t('bim.levelName'))}" />${numberField(`bimLevel:${i}.elevation`, level.elevation, -100000, 1000000, 100, 'mm', t('bim.elevation'))}${numberField(`bimLevel:${i}.height`, level.height, 100, 100000, 100, 'mm', t('bim.height'))}<button class="icon-button" data-bim-action="removeLevel" data-value="${i}" title="${escapeHtml(t('bim.removeLevel'))}" aria-label="${escapeHtml(t('bim.removeLevel'))}" ${b.levels.length > 1 ? '' : 'disabled'}>${icon('trash')}</button></span></div>`;
    }).join('');
    body = `<div class="bim-view">
      ${row('globe', t('bim.site'), `<input data-bim-text="site" value="${escapeHtml(b.site)}" title="${escapeHtml(t('bim.site'))}" />`)}
      ${row('archBuilding', t('bim.building'), `<input data-bim-text="building" value="${escapeHtml(b.building)}" title="${escapeHtml(t('bim.building'))}" />`)}
      <h4 class="sub-head">${icon('archLevel')}<span>${escapeHtml(t('bim.levels'))}</span><span class="grow"></span><span class="muted">${escapeHtml(`${t('bim.levelName')} · ${t('bim.elevation')} · ${t('bim.height')}`)}</span></h4>
      <div class="bim-list">${levels}</div>
      <div class="bim-actions"><button class="small-button" data-bim-action="addLevel" title="${escapeHtml(t('bim.addLevel'))}">${icon('plus')}<span>${escapeHtml(t('bim.addLevel'))}</span></button></div>
    </div>`;
  }
  root.innerHTML = frame({
    glyph: 'archBuilding', title: t('bim.title'), tabs,
    body,
    foot: `<span class="muted">${escapeHtml(t('bim.hint'))}</span><span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}<button class="button primary" data-bim-action="apply" title="${escapeHtml(t('bim.apply'))}">${icon('check')}<span>${escapeHtml(t('bim.apply'))}</span></button>`,
  });
  ready();
}

function bimAction(name, value) {
  const b = state.bim;
  if (name === 'apply') return close({ bim: b });
  if (name === 'addLevel') {
    const top = b.levels.reduce((best, level) => (level.elevation > best.elevation ? level : best), b.levels[0]);
    let n = b.levels.length + 1;
    while (b.levels.some((level) => level.id === `L${n}`)) n += 1;
    b.levels.push({ id: `L${n}`, name: getLanguage() === 'en' ? `Level ${b.levels.length + 1}` : `${b.levels.length + 1}층`, elevation: top.elevation + top.height, height: top.height, visible: true });
  }
  if (name === 'removeLevel' && b.levels.length > 1) b.levels.splice(Number(value), 1);
  if (name === 'addMaterial') {
    let n = b.materials.length + 1;
    while (b.materials.some((m) => m.id === `m${n}`)) n += 1;
    b.materials.push({ id: `m${n}`, name: `${t('prop.material')} ${n}`, color: '#b0b8c4', pattern: 'ansi31' });
  }
  if (name === 'removeMaterial' && b.materials.length > 1) b.materials.splice(Number(value), 1);
  return render();
}

root.addEventListener('change', (event) => {
  const target = event.target;
  if (kind === 'bim' && target.dataset.bimText) {
    const path = target.dataset.bimText.split('.');
    let at = state.bim;
    for (const key of path.slice(0, -1)) at = at[key];
    at[path.at(-1)] = target.value;
    if (path.at(-1) === 'color') render();
    return;
  }
  if (kind === 'solid' && target.dataset.layerMaterial !== undefined) {
    const materials = state.params.materials?.length ? state.params.materials : presetMaterials(getLanguage());
    const layer = state.solid.shape.layers[Number(target.dataset.layerMaterial)];
    const material = materials.find((m) => m.id === target.value);
    if (layer && material) layer.material = { ...material };
    render();
  }
});

// ───────────────────────── spreadsheet window (FreeCAD Spreadsheet)

const SHEET_COLS_SHOWN = 8;
const SHEET_ROWS_SHOWN = 13;

/** Spreadsheet_Style* / Align* / MergeCells / SplitCell on the picked cells (Shift+click picks a block). */
function sheetCommand(id) {
  const sh = state.sheetEdit;
  if (!sh) return;
  const cells = rangeCells(sh.sel, sh.sel2 ?? sh.sel);
  const keep = { sel: sh.sel, sel2: sh.sel2, row0: sh.row0, col0: sh.col0, error: '' };
  const all = (k, v = true) => cells.every((c) => sh.styles?.[c]?.[k] === v);
  let next = sh;
  if (id === 'bold' || id === 'italic' || id === 'underline') { const k = id[0]; next = styleCells(sh, cells, { [k]: all(k) ? null : true }); }
  else if (['alignLeft', 'alignCenter', 'alignRight'].includes(id)) { const h = { alignLeft: 'left', alignCenter: 'center', alignRight: 'right' }[id]; next = styleCells(sh, cells, { h: all('h', h) ? null : h }); }
  else if (['alignTop', 'alignVCenter', 'alignBottom'].includes(id)) { const v = { alignTop: 'top', alignVCenter: 'middle', alignBottom: 'bottom' }[id]; next = styleCells(sh, cells, { v: all('v', v) ? null : v }); }
  else if (id === 'merge') next = mergeCells(sh, sh.sel, sh.sel2 ?? sh.sel);
  else if (id === 'split') next = splitCell(sh, sh.sel);
  state.sheetEdit = { ...next, ...keep };
  render();
}

function renderSheet() {
  state.sheetEdit ??= { ...normalizeSpreadsheet(state.params.sheet ?? {}), sel: 'A1', sel2: null, row0: 0, col0: 0, error: '' };
  const sh = state.sheetEdit;
  const values = computeSheet(sh);
  const aliasOf = (cell) => Object.entries(sh.aliases).find(([, c]) => c === cell)?.[0] ?? '';
  const show = (v) => (v === undefined ? '' : typeof v === 'object' ? `#${t(`sheet.err.${v.error}`)}` : typeof v === 'number' ? fmt(v, 6) : v);
  const cols = Array.from({ length: SHEET_COLS_SHOWN }, (_, i) => sh.col0 + i).filter((c) => c < 26);
  const rows = Array.from({ length: SHEET_ROWS_SHOWN }, (_, i) => sh.row0 + i + 1).filter((r) => r <= SHEET_ROWS);
  const picked = new Set(rangeCells(sh.sel, sh.sel2 ?? sh.sel));
  const visible = (cell) => { const p = cellPos(cell); return cols.includes(p.col) && rows.includes(p.row); };
  const styleClass = (s = {}) => [s.b ? 'sb' : '', s.i ? 'si' : '', s.u ? 'su' : '', s.h ? `ah-${s.h}` : '', s.v ? `av-${s.v}` : ''].join(' ');
  const grid = `<div class="sheet-grid" style="grid-template-columns: 38px repeat(${cols.length}, minmax(0, 1fr)); grid-template-rows: repeat(${rows.length + 1}, 28px)"><span class="sheet-corner"></span>${cols.map((c) => `<span class="sheet-head">${columnName(c)}</span>`).join('')}${rows.map((r) => `<span class="sheet-head">${r}</span>${cols.map((c) => {
    const cell = `${columnName(c)}${r}`;
    // Spreadsheet_MergeCells: a block shows as its top-left cell spanning the rest.
    const block = mergeOf(sh, cell);
    if (block && block.from !== cell && visible(block.from)) return '';
    let span = '';
    if (block && block.from === cell) {
      const end = cellPos(block.to);
      const spanCols = Math.min(end.col, cols[cols.length - 1]) - c + 1;
      const spanRows = Math.min(end.row, rows[rows.length - 1]) - r + 1;
      span = ` style="grid-column: span ${spanCols}; grid-row: span ${spanRows}"`;
    }
    const v = values[cell];
    const alias = aliasOf(cell);
    return `<button class="sheet-cell ${cell === sh.sel ? 'active' : ''} ${picked.size > 1 && picked.has(cell) ? 'in-range' : ''} ${block ? 'merged' : ''} ${typeof v === 'number' ? 'num' : ''} ${v && typeof v === 'object' ? 'err' : ''} ${styleClass(sh.styles?.[cell])}" data-sheet-cell="${cell}"${span} title="${escapeHtml([cell, alias && `(${alias})`, sh.cells[cell] ?? ''].filter(Boolean).join(' '))}">${alias ? '<i class="sheet-alias-dot"></i>' : ''}<span>${escapeHtml(show(v))}</span></button>`;
  }).join('')}`).join('')}</div>`;
  const tools = `<div class="sheet-tools">${SHEET_TOOLS.map((tool) => (tool === '-' ? '<span class="sheet-tools-gap"></span>' : `<button class="icon-button ${tool.on?.(sh, [...picked]) ? 'on' : ''}" data-sheet-cmd="${tool.id}" title="${escapeHtml(t(tool.label))}" aria-label="${escapeHtml(t(tool.label))}">${icon(tool.icon)}</button>`)).join('')}<span class="grow"></span><span class="muted sheet-range">${escapeHtml(picked.size > 1 ? `${sh.sel}:${sh.sel2}` : '')}</span>${button('sheet-import', t('sheet.importCsv'), 'import')}</div>`;
  const pager = (axis, label, glyph, step) => `<button class="icon-button" data-sheet-page="${axis}:${step}" title="${escapeHtml(t(label))}" aria-label="${escapeHtml(t(label))}">${icon(glyph)}</button>`;
  root.innerHTML = frame({
    glyph: 'spreadsheet', title: t('sheet.title'),
    body: `<div class="sheet-view">
      <div class="sheet-bar">
        <b class="sheet-name" id="sheet-sel">${sh.sel}</b>
        <input id="sheet-formula" data-sheet-formula value="${escapeHtml(sh.cells[sh.sel] ?? '')}" placeholder="${escapeHtml(t('sheet.formulaHint'))}" title="${escapeHtml(t('sheet.formulaHint'))}" spellcheck="false" />
        <input id="sheet-alias" data-sheet-alias value="${escapeHtml(aliasOf(sh.sel))}" placeholder="${escapeHtml(t('sheet.alias'))}" title="${escapeHtml(t('sheet.aliasHint'))}" spellcheck="false" />
        <span class="sheet-pager">${pager('col', 'sheet.left', 'chevronLeft', -SHEET_COLS_SHOWN)}${pager('col', 'sheet.right', 'chevronRight', SHEET_COLS_SHOWN)}${pager('row', 'sheet.up', 'chevronUp', -SHEET_ROWS_SHOWN)}${pager('row', 'sheet.down', 'chevronDown', SHEET_ROWS_SHOWN)}</span>
      </div>
      ${tools}
      ${sh.error ? `<div class="row notice-row warn-row">${icon('warning')}<span>${escapeHtml(sh.error)}</span></div>` : ''}
      ${grid}
      <p class="muted hint">${escapeHtml(t('sheet.hint'))}</p>
    </div>`,
    foot: `<span class="info-chip">${escapeHtml(t('sheet.cells'))} <b id="sheet-count">${Object.keys(sh.cells).length}</b></span><span class="info-chip">${escapeHtml(t('sheet.aliases'))} <b>${Object.keys(sh.aliases).length}</b></span><span class="grow"></span>${button('sheet-csv', t('sheet.csv'), 'export')}${button('close', t('confirm.cancel'), 'close')}<button class="button primary" data-action="sheet-apply" title="${escapeHtml(t('sheet.apply'))}">${icon('check')}<span>${escapeHtml(t('sheet.apply'))}</span></button>`,
  });
  ready();
}

const sheetResult = () => normalizeSpreadsheet({ cells: state.sheetEdit.cells, aliases: state.sheetEdit.aliases, styles: state.sheetEdit.styles, merged: state.sheetEdit.merged });

// ───────────────────────── CAM window (FreeCAD CAM: profile, pocket, drilling, engrave → G-code)

const CAM_KEY = 'mycad.cam';

function camInit() {
  let saved = {};
  try { saved = JSON.parse(globalThis.localStorage?.getItem(CAM_KEY) ?? '{}') ?? {}; } catch { /* ignore */ }
  state.cam = normalizeCamOptions({ ...saved, ...(state.params.options ?? {}) });
  // The operation follows what there is to machine: solids → 3D, outlines → 2D.
  const source = state.params.source ?? {};
  const has2d = Boolean(source.loops?.length || source.chains?.length || source.circles?.length);
  if (source.model && !has2d && !CAM_3D.includes(state.cam.operation)) state.cam.operation = 'rough3d';
  if (!source.model && CAM_3D.includes(state.cam.operation)) state.cam.operation = 'profile';
  state.camView = 'paths';
  state.camSim = null;
}

/** The job for the window's options, kept while they do not change (the simulator reuses it). */
function camJob(source) {
  const key = JSON.stringify(state.cam);
  if (state.camJob?.key !== key) state.camJob = { key, job: camPaths(source, state.cam) };
  return state.camJob.job;
}

/** The simulator: the stock grid (the model's, or one over the paths) cut up to `cut` path points. */
function camSimState(source, job) {
  const key = state.camJob.key;
  if (state.camSim?.key === key) return state.camSim;
  const grid = source.model ?? gridFor(job);
  state.camSim = { key, grid, top: job.options.top, run: grid ? { stock: new Array(grid.nx * grid.ny).fill(job.options.top), cut: 0, total: job.paths.reduce((n, p) => n + p.points.length, 0) } : null, playing: false };
  return state.camSim;
}

/** Shows the stock cut up to point `count` (forward from where it is, or again from the start). */
function camSimTo(count) {
  const sim = state.camSim;
  const job = state.camJob?.job;
  if (!sim?.grid || !job) return;
  const target = Math.max(0, Math.min(sim.run.total, Math.round(count)));
  sim.run = target >= sim.run.cut
    ? simulate(sim.grid, job, { count: target, top: sim.top, from: sim.run })
    : simulate(sim.grid, job, { count: target, top: sim.top });
  drawCamSim();
}

/** Hill-shaded stock, coloured by height, with the tool path done so far. */
function drawCamSim() {
  const sim = state.camSim;
  const canvas = root.querySelector('#cam-sim');
  if (!sim?.grid || !canvas) return;
  const { grid, run } = sim;
  const { nx, ny, cell } = grid;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(nx, ny);
  const lo = grid.zMin; const hi = Math.max(sim.top, lo + 1e-6);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const h = run.stock[k];
      const dx = (run.stock[j * nx + Math.min(nx - 1, i + 1)] - run.stock[j * nx + Math.max(0, i - 1)]) / (2 * cell);
      const dy = (run.stock[Math.min(ny - 1, j + 1) * nx + i] - run.stock[Math.max(0, j - 1) * nx + i]) / (2 * cell);
      const shade = Math.max(0.25, Math.min(1, (-dx * -0.5 + -dy * 0.5 + 1) / Math.sqrt(dx * dx + dy * dy + 1) / 1.2247 + 0.2));
      const t = (h - lo) / (hi - lo);
      // Cut faces: steel blue → aluminium; the untouched top: warm stock colour.
      const base = Math.abs(h - sim.top) < 1e-6 ? [214, 170, 110] : [90 + 120 * t, 120 + 110 * t, 160 + 80 * t];
      // Rows from the top (y up in the drawing).
      const p = ((ny - 1 - j) * nx + i) * 4;
      image.data[p] = base[0] * shade; image.data[p + 1] = base[1] * shade; image.data[p + 2] = base[2] * shade; image.data[p + 3] = 255;
    }
  }
  const off = new OffscreenCanvas(nx, ny);
  off.getContext('2d').putImageData(image, 0, 0);
  const k = Math.min(canvas.width / nx, canvas.height / ny);
  const w = nx * k; const h = ny * k;
  const ox = (canvas.width - w) / 2; const oy = (canvas.height - h) / 2;
  ctx.fillStyle = getComputedStyle(root).getPropertyValue('--canvas') || '#20242c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, ox, oy, w, h);
  // The path done so far, and the tool where it is.
  const X = (x) => ox + ((x - grid.x0) / cell + 0.5) * k;
  const Y = (y) => oy + h - ((y - grid.y0) / cell + 0.5) * k;
  ctx.strokeStyle = 'rgba(229, 72, 77, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  let index = 0; let last = null;
  for (const path of state.camJob.job.paths) {
    for (let q = 0; q < path.points.length && index < run.cut; q++, index++) {
      const pt = path.points[q];
      if (q === 0) ctx.moveTo(X(pt.x), Y(pt.y)); else ctx.lineTo(X(pt.x), Y(pt.y));
      last = pt;
    }
    if (index >= run.cut) break;
  }
  ctx.stroke();
  if (last) {
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(last.x), Y(last.y), Math.max(3, (state.cam.tool / 2 / cell) * k), 0, Math.PI * 2); ctx.stroke();
  }
  const slider = root.querySelector('#cam-sim-pos');
  if (slider && document.activeElement !== slider) slider.value = String(run.cut);
  const pct = root.querySelector('#cam-sim-pct');
  if (pct) pct.textContent = `${Math.round((run.cut / Math.max(1, run.total)) * 100)} %`;
  const check = root.querySelector('#cam-sim-check');
  if (check && state.params.source?.model && run.cut >= run.total) {
    const c = stockCheck(grid, run.stock);
    check.innerHTML = `<span class="info-chip ${c.gouge > cell / 4 ? 'status-none' : 'status-full'}" id="cam-gouge">${escapeHtml(t('cam.gouge'))} <b>${fmt(c.gouge, 3)} mm</b></span><span class="info-chip" id="cam-left">${escapeHtml(t('cam.left'))} <b>${fmt(c.left, 3)} mm</b></span>`;
  } else if (check) check.innerHTML = '';
  canvas.dataset.cut = String(run.cut);
  canvas.dataset.total = String(run.total);
}

function camSimStep() {
  const sim = state.camSim;
  if (!sim?.playing) return;
  // About ten seconds for a whole job.
  camSimTo(sim.run.cut + Math.max(1, Math.ceil(sim.run.total / 600)));
  if (sim.run.cut >= sim.run.total) { sim.playing = false; render(); return; }
  sim.frame = requestAnimationFrame(camSimStep);
}

/** Top view of the outlines and the tool paths. */
function camPreview(source, job) {
  const pts = [...source.loops.flat(), ...source.chains.flat(), ...job.paths.flatMap((p) => p.points), ...source.circles.flatMap((c) => [{ x: c.x - c.r, y: c.y - c.r }, { x: c.x + c.r, y: c.y + c.r }])];
  if (!pts.length) return `<p class="muted">${escapeHtml(t('cam.nothing'))}</p>`;
  const minX = Math.min(...pts.map((p) => p.x)); const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)); const maxY = Math.max(...pts.map((p) => p.y));
  const w = 520; const h = 400; const pad = 14;
  const k = Math.min((w - 2 * pad) / Math.max(maxX - minX, 1e-6), (h - 2 * pad) / Math.max(maxY - minY, 1e-6));
  const X = (x) => (pad + (x - minX) * k + ((w - 2 * pad) - (maxX - minX) * k) / 2).toFixed(1);
  const Y = (y) => (h - pad - (y - minY) * k - ((h - 2 * pad) - (maxY - minY) * k) / 2).toFixed(1);
  const line = (points, closed) => points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join('') + (closed ? 'Z' : '');
  // Only the deepest pass of each path is drawn (the others lie on top of it).
  const deepest = Math.min(...job.paths.map((p) => p.points[0].z), 0);
  const cuts = job.paths.filter((p) => p.kind === 'cut' && Math.abs(p.points[0].z - deepest) < 1e-9);
  let at = null;
  const rapids = [];
  for (const p of cuts) { if (at) rapids.push(`M${X(at.x)} ${Y(at.y)}L${X(p.points[0].x)} ${Y(p.points[0].y)}`); at = p.points[p.points.length - 1]; }
  return `<svg id="cam-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-cuts="${cuts.length}" data-drills="${job.paths.filter((p) => p.kind === 'drill').length}">
    <path d="${[...source.loops.map((l) => line(l, true)), ...source.chains.map((c) => line(c, false))].join('')}" fill="none" stroke="var(--muted)" stroke-width="1"/>
    <path d="${rapids.join('')}" fill="none" stroke="#d08a00" stroke-width="0.8" stroke-dasharray="4 3"/>
    <path d="${cuts.map((p) => line(p.points, false)).join('')}" fill="none" stroke="var(--accent)" stroke-width="1.6"/>
    ${job.paths.filter((p) => p.kind === 'drill').map((p) => `<circle cx="${X(p.points[0].x)}" cy="${Y(p.points[0].y)}" r="${Math.max(2, (job.options.tool / 2) * k).toFixed(1)}" fill="color-mix(in srgb, var(--accent) 30%, transparent)" stroke="var(--accent)"/>`).join('')}
  </svg>`;
}

function renderCam() {
  if (!state.cam) camInit();
  const o = state.cam;
  const source = state.params.source ?? { loops: [], chains: [], circles: [] };
  const job = camJob(source);
  const stats = camStats(job);
  const has2d = Boolean(source.loops?.length || source.chains?.length || source.circles?.length);
  const is3d = CAM_3D.includes(o.operation);
  const seg = (attr, value, active, label) => `<button class="segment ${active ? 'active' : ''}" ${attr}="${value}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
  const field = (key, label, glyph, min, max, step, unit) => row(glyph, t(label), numberField(`cam:${key}`, o[key], min, max, step, unit, t(label)));
  const toggleRow = (key, label) => row('check', t(label), switchControl(`data-cam-toggle="${key}"`, o[key], t(label)));
  const op = o.operation;
  const fields = [
    row('cam', t('cam.operation'), `<span class="segmented">${CAM_OPERATIONS.filter((id) => !CAM_3D.includes(id)).map((id) => seg('data-cam-op', id, op === id, t(`cam.op.${id}`)).replace('<button', has2d ? '<button' : '<button disabled')).join('')}</span>`),
    row('solidBox', t('cam.operation3d'), `<span class="segmented">${CAM_3D.map((id) => seg('data-cam-op', id, op === id, t(`cam.op.${id}`)).replace('<button', source.model ? '<button' : '<button disabled')).join('')}</span>`),
    is3d ? row('circle', t('cam.toolShape'), `<span class="segmented">${TOOL_SHAPES.map((id) => seg('data-cam-shape', id, o.toolShape === id, t(`cam.shape.${id}`))).join('')}</span>`) : '',
    op === 'profile' ? row('offset', t('cam.side'), `<span class="segmented">${PROFILE_SIDES.map((id) => seg('data-cam-side', id, o.side === id, t(`cam.side.${id}`))).join('')}</span>`) : '',
    field('tool', 'cam.tool', 'circle', 0.1, 100, 0.5, 'mm'),
    is3d ? field('stockTop', 'cam.stockTop', 'chevronUp', 0, 500, 0.5, 'mm') : field('depth', 'cam.depth', 'measure', 0.01, 500, 0.5, 'mm'),
    op === 'drill' ? field('peck', 'cam.peck', 'chevronDown', 0, 100, 0.5, 'mm') : op === 'finish3d' ? '' : field('stepDown', 'cam.stepDown', 'chevronDown', 0.01, 100, 0.25, 'mm'),
    op === 'pocket' || is3d ? field('stepOver', 'cam.stepOver', 'array', 0.05, 1, 0.05, '×') : '',
    op === 'rough3d' ? field('leave', 'cam.leave', 'offset', 0, 50, 0.1, 'mm') : '',
    is3d ? row('array', t('cam.direction'), `<span class="segmented">${RASTER_DIRECTIONS.map((id) => seg('data-cam-direction', id, o.direction === id, t(`cam.direction.${id}`))).join('')}</span>`) : '',
    field('feed', 'cam.feed', 'move', 1, 20000, 50, 'mm/min'),
    field('plunge', 'cam.plunge', 'chevronDown', 1, 5000, 10, 'mm/min'),
    field('spindle', 'cam.spindle', 'rotate', 0, 60000, 500, 'rpm'),
    field('safeZ', 'cam.safeZ', 'chevronUp', 0.1, 200, 1, 'mm'),
    op === 'profile' || op === 'pocket' ? toggleRow('climb', 'cam.climb') : '',
    op === 'pocket' ? toggleRow('finish', 'cam.finish') : '',
  ].join('');
  const warn = job.warnings.map((w) => `<div class="row notice-row warn-row">${icon('warning')}<span>${escapeHtml(t(`cam.warn.${w}`))}</span></div>`).join('');
  root.innerHTML = frame({
    glyph: 'cam', title: `${t('cam.title')} — ${state.params.name ?? ''}`,
    body: `<div class="cam-view"><div class="cam-fields">${fields}${warn}</div><div class="cam-side"><span class="segmented cam-tabs" role="tablist">${['paths', 'sim'].map((id) => seg('data-cam-view', id, state.camView === id, t(`cam.view.${id}`))).join('')}</span>${state.camView === 'sim' ? camSimHtml(source, job) : `<div class="cam-preview" id="cam-preview">${is3d ? camPreview3d(source, job) : camPreview(source, job)}</div>`}</div></div>`,
    foot: `<span class="info-chip">${escapeHtml(t('cam.paths'))} <b id="cam-paths">${stats.paths}</b></span><span class="info-chip">${escapeHtml(t('cam.cut'))} <b>${escapeHtml(formatLength(stats.cut))}</b></span><span class="info-chip">${escapeHtml(t('cam.time'))} <b id="cam-time">${fmt(stats.minutes, 1)} ${escapeHtml(t('cam.minutes'))}</b></span><span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}<button class="button" data-action="cam-stock" title="${escapeHtml(t('cam.stockTip'))}" ${job.paths.length ? '' : 'disabled'}>${icon('solidBox')}<span>${escapeHtml(t('cam.stock'))}</span></button><button class="button primary" data-action="cam-export" title="${escapeHtml(t('cam.export'))}" ${job.paths.length ? '' : 'disabled'}>${icon('export')}<span>${escapeHtml(t('cam.export'))}</span></button>`,
  });
  ready();
  if (state.camView === 'sim') drawCamSim();
}

/** The simulator tab: the stock, play / pause, the position along the job, the checks. */
function camSimHtml(source, job) {
  const sim = camSimState(source, job);
  if (!sim.grid) return `<p class="muted">${escapeHtml(t('cam.nothing'))}</p>`;
  return `<div class="cam-preview cam-sim-view"><canvas id="cam-sim" width="540" height="380"></canvas></div>
    <div class="cam-sim-bar"><button class="icon-button" data-cam-sim="play" title="${escapeHtml(t(sim.playing ? 'anim.pause' : 'cam.simPlay'))}" aria-label="${escapeHtml(t(sim.playing ? 'anim.pause' : 'cam.simPlay'))}">${icon(sim.playing ? 'pause' : 'play')}</button><button class="icon-button" data-cam-sim="end" title="${escapeHtml(t('cam.simEnd'))}" aria-label="${escapeHtml(t('cam.simEnd'))}">${icon('chevronRight')}</button><input type="range" id="cam-sim-pos" min="0" max="${sim.run.total}" step="1" value="${sim.run.cut}" title="${escapeHtml(t('cam.simPos'))}" aria-label="${escapeHtml(t('cam.simPos'))}" /><span id="cam-sim-pct" class="muted"></span><span id="cam-sim-check"></span></div>`;
}

/** 3D jobs from above: the model's height as shading and the tool paths. */
function camPreview3d(source, job) {
  const m = source.model;
  if (!m) return `<p class="muted">${escapeHtml(t('cam.warn.noModel'))}</p>`;
  const w = 520; const h = 400; const pad = 14;
  const k = Math.min((w - 2 * pad) / (m.nx * m.cell), (h - 2 * pad) / (m.ny * m.cell));
  const ox = (w - m.nx * m.cell * k) / 2; const oy = (h - m.ny * m.cell * k) / 2;
  const X = (x) => (ox + (x - m.x0) * k).toFixed(1);
  const Y = (y) => (h - oy - (y - m.y0) * k).toFixed(1);
  const shown = job.paths.length > 400 ? job.paths.filter((_, i) => i % Math.ceil(job.paths.length / 400) === 0) : job.paths;
  return `<svg id="cam-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-cuts="${job.paths.length}" data-drills="0">
    <rect x="${X(m.x0)}" y="${Y(m.y0 + (m.ny - 1) * m.cell)}" width="${((m.nx - 1) * m.cell * k).toFixed(1)}" height="${((m.ny - 1) * m.cell * k).toFixed(1)}" fill="none" stroke="var(--muted)" stroke-dasharray="4 3"/>
    <path d="${shown.map((p) => p.points.map((q, i) => `${i ? 'L' : 'M'}${X(q.x)} ${Y(q.y)}`).join('')).join('')}" fill="none" stroke="var(--accent)" stroke-width="0.8"/>
  </svg>`;
}

function applyCam() {
  try { globalThis.localStorage?.setItem(CAM_KEY, JSON.stringify(state.cam)); } catch { /* ignore */ }
  return close({ action: 'export', options: state.cam });
}

// ───────────────────────── FEM window (FreeCAD FEM: frames of beam elements, linear static)

const FEM_PAGE = 6;
const SECTION_FIELDS = { rect: ['b', 'h'], circle: ['d'], tube: ['d', 't'], ibeam: ['h', 'b', 'tw', 'tf'], custom: ['A', 'I'] };

function femInit() {
  state.fem = { options: normalizeFem(state.params.fem ?? {}), view: { deformed: true, moment: true } };
  state.page = 0;
}

/** Elevation of the frame with supports, loads, the deformed shape and the moment diagram. */
function femPreview(frame, o, result, view) {
  const xs = frame.nodes.map((n) => n.x);
  const ys = frame.nodes.map((n) => n.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const deformed = result.ok && view.deformed ? deformedShape(frame, result, autoScale(frame, result)) : [];
  const momentScale = result.ok && result.max.moment ? (size * 0.12) / Math.abs(result.max.moment) : 0;
  const moments = result.ok && view.moment ? momentDiagram(frame, result, momentScale) : [];
  const pts = [...frame.nodes, ...deformed.flat(), ...moments.flat()];
  const pad = size * 0.12;
  const minX = Math.min(...pts.map((p) => p.x)) - pad; const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad; const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const w = 560; const h = 420;
  const k = Math.min(w / (maxX - minX), h / (maxY - minY));
  const X = (x) => ((x - minX) * k + (w - (maxX - minX) * k) / 2).toFixed(1);
  const Y = (y) => (h - (y - minY) * k - (h - (maxY - minY) * k) / 2).toFixed(1);
  const path = (list) => list.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join('');
  const members = frame.members.map((m) => `M${X(frame.nodes[m.i].x)} ${Y(frame.nodes[m.i].y)}L${X(frame.nodes[m.j].x)} ${Y(frame.nodes[m.j].y)}`).join('');
  const supports = frame.nodes.map((n) => {
    const type = o.supports[n.key];
    if (!type) return '';
    const x = Number(X(n.x)); const y = Number(Y(n.y));
    if (type === 'fixed') return `<path d="M${x - 10} ${y + 1}h20M${x - 10} ${y + 1}l-4 6M${x - 3} ${y + 1}l-4 6M${x + 4} ${y + 1}l-4 6M${x + 10} ${y + 1}l-4 6" class="fem-support"/>`;
    const tri = `<path d="M${x} ${y}l-8 12h16z" class="fem-support"/>`;
    return type === 'pinned' ? tri : `${tri}<circle cx="${x}" cy="${y + 15}" r="2.5" class="fem-support"/>`;
  }).join('');
  const loads = frame.nodes.map((n) => {
    const l = o.loads[n.key];
    if (!l || (!l.fx && !l.fy)) return '';
    const len = Math.hypot(l.fx, l.fy);
    const ux = l.fx / len; const uy = -l.fy / len;
    const x = Number(X(n.x)); const y = Number(Y(n.y));
    return `<path d="M${x - ux * 34} ${y - uy * 34}L${x - ux * 4} ${y - uy * 4}" class="fem-load"/><path d="M${x - ux * 4} ${y - uy * 4}l${-ux * 7 - uy * 4} ${-uy * 7 + ux * 4}l${uy * 8} ${-ux * 8}z" class="fem-load fill"/>`;
  }).join('');
  const labels = frame.nodes.map((n) => `<text x="${Number(X(n.x)) + 5}" y="${Number(Y(n.y)) - 5}" class="fem-node">${n.id + 1}</text>`).join('');
  return `<svg id="fem-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-ok="${result.ok}" data-deformed="${deformed.length}" data-moments="${moments.length}">
    ${moments.map((list) => `<path d="${path(list)}Z" class="fem-moment"/>`).join('')}
    <path d="${members}" class="fem-member"/>
    ${deformed.map((list) => `<path d="${path(list)}" class="fem-deformed"/>`).join('')}
    ${supports}${loads}${labels}
  </svg>`;
}

// ───────────────────────── Plate FEM (plane stress)

function plateInit() {
  state.plate = { options: normalizePlate(state.params.plate ?? {}), view: { deformed: true, mesh: false } };
  state.page = 0;
}

/** The plate coloured by von Mises stress, with its sides numbered, supports, loads and the deformed outline. */
function platePreview(source, sides, o, result, view) {
  const pts = [...source.outer, ...source.holes.flat()];
  const deformed = result.ok && view.deformed ? plateDeformed(result, plateScale(result)) : [];
  const all = [...pts, ...deformed.flat()];
  const size = Math.max(Math.max(...all.map((p) => p.x)) - Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.y)) - Math.min(...all.map((p) => p.y)), 1);
  const pad = size * 0.1;
  const minX = Math.min(...all.map((p) => p.x)) - pad; const maxX = Math.max(...all.map((p) => p.x)) + pad;
  const minY = Math.min(...all.map((p) => p.y)) - pad; const maxY = Math.max(...all.map((p) => p.y)) + pad;
  const w = 560; const h = 420;
  const k = Math.min(w / (maxX - minX), h / (maxY - minY));
  const X = (x) => ((x - minX) * k + (w - (maxX - minX) * k) / 2).toFixed(1);
  const Y = (y) => (h - (y - minY) * k - (h - (maxY - minY) * k) / 2).toFixed(1);
  const ring = (list) => `${list.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join('')}Z`;
  let fill = '';
  if (result.ok) {
    // Smoothed: each triangle takes the mean of its nodes' (area-averaged) stresses.
    const top = Math.max(...result.nodalVm) || 1;
    const { nodes, tris } = result.mesh;
    const shade = (t) => stressColor((result.nodalVm[t[0]] + result.nodalVm[t[1]] + result.nodalVm[t[2]]) / 3 / top);
    fill = tris.map((t) => `<path d="M${X(nodes[t[0]][0])} ${Y(nodes[t[0]][1])}L${X(nodes[t[1]][0])} ${Y(nodes[t[1]][1])}L${X(nodes[t[2]][0])} ${Y(nodes[t[2]][1])}Z" fill="${shade(t)}"${view.mesh ? ' class="plate-tri"' : ` stroke="${shade(t)}"`}/>`).join('');
  }
  const loops = [source.outer, ...source.holes];
  const sideMarks = sides.map((side, i) => {
    const loop = loops[side.loop];
    const run = Array.from({ length: side.count + 1 }, (_, j) => loop[(side.from + j) % loop.length]);
    const line = run.map((p, j) => `${j ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join('');
    const support = o.supports[i] ? `<path d="${line}" class="plate-support"/>` : '';
    const l = o.loads[i];
    let arrow = '';
    if (l) {
      const len = Math.hypot(l.fx, l.fy);
      const ux = l.fx / len; const uy = -l.fy / len;
      const x = Number(X(side.mid.x)); const y = Number(Y(side.mid.y));
      arrow = `<path d="M${x - ux * 34} ${y - uy * 34}L${x - ux * 4} ${y - uy * 4}" class="fem-load"/><path d="M${x - ux * 4} ${y - uy * 4}l${-ux * 7 - uy * 4} ${-uy * 7 + ux * 4}l${uy * 8} ${-ux * 8}z" class="fem-load fill"/>`;
    }
    return `${support}${arrow}<text x="${Number(X(side.mid.x)) + 4}" y="${Number(Y(side.mid.y)) - 4}" class="fem-node plate-side">${i + 1}</text>`;
  }).join('');
  return `<svg id="plate-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-ok="${result.ok}" data-elements="${result.ok ? result.mesh.tris.length : 0}" data-deformed="${deformed.length}">
    ${fill}
    <path d="${loops.map(ring).join('')}" class="fem-member plate-outline"/>
    ${deformed.map((list) => `<path d="${ring(list)}" class="fem-deformed"/>`).join('')}
    ${sideMarks}
  </svg>`;
}

function renderPlate() {
  if (!state.plate) plateInit();
  const source = state.params.source ?? { outer: [], holes: [] };
  const o = state.plate.options;
  const view = state.plate.view;
  const sides = plateSides([source.outer, ...source.holes]);
  const result = analyzePlate(source.outer, source.holes, o);
  const pages = Math.max(1, Math.ceil(sides.length / FEM_PAGE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const field = (key, label, glyph, min, max, step, unit) => row(glyph, t(label), numberField(`plate:${key}`, o[key], min, max, step, unit, t(label)));
  const sideRows = sides.slice(state.page * FEM_PAGE, (state.page + 1) * FEM_PAGE).map((side, j) => {
    const i = state.page * FEM_PAGE + j;
    const load = o.loads[i] ?? { fx: 0, fy: 0 };
    const num = (part) => `<input class="fem-num" data-plate-load="${i}:${part}" value="${fmt(load[part], 4)}" title="${escapeHtml(t(`plate.load.${part}`))}" aria-label="${escapeHtml(t(`plate.load.${part}`))}" />`;
    return `<div class="fem-node-row plate-side-row"><b>${i + 1}</b><span class="muted">${escapeHtml(`${side.loop ? t('plate.hole') : t('plate.edge')} · ${fmt(side.length, 1)} mm`)}</span><select data-plate-support="${i}" title="${escapeHtml(t('fem.support'))}">${PLATE_SUPPORTS.map((v) => `<option value="${v}" ${(o.supports[i] ?? 'free') === v ? 'selected' : ''}>${escapeHtml(t(`fem.support.${v}`))}</option>`).join('')}</select>${num('fx')}${num('fy')}</div>`;
  }).join('');
  const pager = pages > 1 ? `<span class="check-pager"><button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button><span>${state.page + 1} / ${pages}</span><button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= pages - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button></span>` : '';
  const util = result.ok ? result.max.utilisation : 0;
  const chips = result.ok
    ? `<span class="info-chip">${escapeHtml(t('fem.maxDisp'))} <b id="plate-disp">${fmt(result.max.displacement, 4)} mm</b></span><span class="info-chip">${escapeHtml(t('plate.maxVm'))} <b id="plate-vm">${fmt(result.max.vm, 1)} MPa</b></span><span class="info-chip ${util > 1 ? 'status-none' : util > 0.8 ? 'status-partial' : 'status-full'}">${escapeHtml(t('fem.utilisation'))} <b>${fmt(util * 100, 0)} %</b></span>`
    : `<span class="info-chip status-none" id="plate-error">${icon('warning')} ${escapeHtml(t(`plate.error.${result.error}`))}</span>`;
  const legend = result.ok ? `<span class="plate-legend" title="${escapeHtml(t('plate.legend'))}"><span>0</span><i style="background: linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((v) => stressColor(v)).join(', ')})"></i><span>${fmt(Math.max(...result.nodalVm), 1)} MPa</span></span>` : '';
  root.innerHTML = frameHtml({
    glyph: 'femPlate', title: `${t('plate.title')} — ${state.params.name ?? ''}`,
    body: `<div class="fem-view"><div class="fem-fields">
      ${row('layers', t('fem.material'), `<select data-plate-material title="${escapeHtml(t('fem.material'))}">${[...Object.keys(MATERIALS), 'custom'].map((m) => `<option value="${m}" ${o.material === m ? 'selected' : ''}>${escapeHtml(t(`fem.material.${m}`))}</option>`).join('')}</select>`)}
      ${o.material === 'custom' ? field('E', 'fem.E', 'measure', 1, 1e7, 1000, 'MPa') : ''}
      ${field('nu', 'plate.nu', 'measure', 0, 0.49, 0.01, '')}
      ${field('thickness', 'plate.thickness', 'measure', 0.001, 1e5, 1, 'mm')}
      ${field('size', 'plate.size', 'grid', 0, 1e5, 1, 'mm')}
      <div class="fem-node-head plate-side-head"><span>#</span><span>${escapeHtml(t('plate.side'))}</span><span>${escapeHtml(t('fem.support'))}</span><span>Fx N</span><span>Fy N</span></div>
      <div class="fem-nodes">${sideRows}</div>${pager}
    </div>
    <div class="fem-side"><div class="fem-preview">${platePreview(source, sides, o, result, view)}</div>
      <div class="fem-toggles"><label>${switchControl('data-plate-view="deformed"', view.deformed, t('fem.deformed'))}<span>${escapeHtml(t('fem.deformed'))}</span></label><label>${switchControl('data-plate-view="mesh"', view.mesh, t('plate.mesh'))}<span>${escapeHtml(t('plate.mesh'))}</span></label>${legend}<span class="muted">${escapeHtml(t('plate.counts', { nodes: result.ok ? result.mesh.nodes.length : 0, elements: result.ok ? result.mesh.tris.length : 0 }))}</span></div>
    </div></div>`,
    foot: `${chips}<span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}<button class="button" data-action="plate-apply" title="${escapeHtml(t('fem.applyTip'))}">${icon('save')}<span>${escapeHtml(t('fem.apply'))}</span></button><button class="button primary" data-action="plate-draw" title="${escapeHtml(t('plate.drawTip'))}" ${result.ok ? '' : 'disabled'}>${icon('femPlate')}<span>${escapeHtml(t('fem.draw'))}</span></button>`,
  });
  ready();
}

// ───────────────────────── FEM of solids (voxel bricks, CalculiX)

function fem3dTris() {
  const t = state.params.tris ?? [];
  const out = [];
  for (let i = 0; i + 8 < t.length; i += 9) out.push([[t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]]]);
  return out;
}

/** Iso view of the bricks' outer faces, moved by the displacements (scaled) and coloured by von Mises stress. */
function drawFem3d(result) {
  const canvas = root.querySelector('#fem3d-canvas');
  if (!canvas || !result?.ok) return;
  const ctx = canvas.getContext('2d');
  const quads = boundaryQuads(result);
  const size = Math.max(...[0, 1, 2].map((d) => Math.max(...result.nodes.map((p) => p[d])) - Math.min(...result.nodes.map((p) => p[d]))), 1);
  const scale = state.fem3d.view.deformed && result.max.displacement ? (size * 0.06) / result.max.displacement : 0;
  const P = result.nodes.map((p, i) => [p[0] + result.u[3 * i] * scale, p[1] + result.u[3 * i + 1] * scale, p[2] + result.u[3 * i + 2] * scale]);
  // Iso: x to the right-down, y to the right-up, z up.
  const iso = ([x, y, z]) => [(x - y) * 0.866, (x + y) * 0.5 - z];
  const depth = ([x, y, z]) => x + y + z;
  const pts = P.map(iso);
  const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const k = Math.min((canvas.width - 40) / (maxX - minX || 1), (canvas.height - 40) / (maxY - minY || 1));
  const ox = (canvas.width - (maxX - minX) * k) / 2; const oy = (canvas.height - (maxY - minY) * k) / 2;
  const S = (q) => [ox + (q[0] - minX) * k, oy + (q[1] - minY) * k];
  ctx.fillStyle = getComputedStyle(root).getPropertyValue('--canvas') || '#20242c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const top = result.max.vm || 1;
  // Painter's order: far faces first; faces pointing away from the viewer left out.
  const faces = quads.map(([quad, e]) => ({ quad, e, d: quad.reduce((s, i) => s + depth(P[i]), 0) })).sort((a, b) => a.d - b.d);
  for (const { quad, e } of faces) {
    const q = quad.map((i) => S(pts[i]));
    const area = q.reduce((s, p, i) => { const n = q[(i + 1) % 4]; return s + p[0] * n[1] - n[0] * p[1]; }, 0);
    if (area > 0) continue;
    ctx.beginPath();
    q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = stressColor(result.vm[e] / top);
    ctx.fill();
    if (state.fem3d.view.mesh) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5; ctx.stroke(); }
  }
  canvas.dataset.faces = String(faces.length);
}

function renderFem3d() {
  if (!state.fem3d) { const options = normalizeFem3d(state.params.fem3d ?? {}); state.fem3d = { options, view: { deformed: true, mesh: true }, loadFace: options.loads[0]?.face ?? 'zmax' }; }
  const o = state.fem3d.options;
  const key = JSON.stringify(o);
  if (state.fem3d.key !== key) { state.fem3d.key = key; state.fem3d.result = analyzeSolid(fem3dTris(), o); }
  const result = state.fem3d.result;
  const field = (k, label, glyph, min, max, step, unit) => row(glyph, t(label), numberField(`fem3d:${k}`, o[k], min, max, step, unit, t(label)));
  // The chosen face stays chosen while its force is still zero (a zero load is no load).
  const load = o.loads[0] ?? { face: state.fem3d.loadFace, fx: 0, fy: 0, fz: 0 };
  const num = (part) => `<input class="fem-num" data-fem3d-load="${part}" value="${fmt(load[part], 4)}" title="${escapeHtml(t(`fem3d.load.${part}`))}" aria-label="${escapeHtml(t(`fem3d.load.${part}`))}" />`;
  const util = result.ok ? result.max.utilisation : 0;
  const chips = result.ok
    ? `<span class="info-chip">${escapeHtml(t('fem.maxDisp'))} <b id="fem3d-disp">${fmt(result.max.displacement, 4)} mm</b></span><span class="info-chip">${escapeHtml(t('plate.maxVm'))} <b id="fem3d-vm">${fmt(result.max.vm, 1)} MPa</b></span><span class="info-chip ${util > 1 ? 'status-none' : util > 0.8 ? 'status-partial' : 'status-full'}">${escapeHtml(t('fem.utilisation'))} <b>${fmt(util * 100, 0)} %</b></span>`
    : `<span class="info-chip status-none" id="fem3d-error">${icon('warning')} ${escapeHtml(t(`fem3d.error.${result.error}`))}</span>`;
  root.innerHTML = frame({
    glyph: 'femSolid', title: `${t('fem3d.title')} — ${state.params.name ?? ''}`,
    body: `<div class="fem-view"><div class="fem-fields">
      ${row('layers', t('fem.material'), `<select data-fem3d-material title="${escapeHtml(t('fem.material'))}">${[...Object.keys(MATERIALS), 'custom'].map((m) => `<option value="${m}" ${o.material === m ? 'selected' : ''}>${escapeHtml(t(`fem.material.${m}`))}</option>`).join('')}</select>`)}
      ${o.material === 'custom' ? field('E', 'fem.E', 'measure', 1, 1e7, 1000, 'MPa') : ''}
      ${field('nu', 'plate.nu', 'measure', 0, 0.49, 0.01, '')}
      ${field('resolution', 'fem3d.resolution', 'grid', 4, 80, 2, '')}
      ${row('lock', t('fem3d.fixed'), `<span class="segmented fem3d-faces">${FEM3D_FACES.map((f) => `<button class="segment ${o.fixed.includes(f) ? 'active' : ''}" data-fem3d-fixed="${f}" title="${escapeHtml(t(`fem3d.face.${f}`))}">${escapeHtml(t(`fem3d.faceShort.${f}`))}</button>`).join('')}</span>`)}
      ${row('chevronDown', t('fem3d.loadFace'), `<select data-fem3d-load-face title="${escapeHtml(t('fem3d.loadFace'))}">${FEM3D_FACES.map((f) => `<option value="${f}" ${load.face === f ? 'selected' : ''}>${escapeHtml(t(`fem3d.face.${f}`))}</option>`).join('')}</select>`)}
      <div class="fem-node-head fem3d-load-head"><span>Fx N</span><span>Fy N</span><span>Fz N</span></div>
      <div class="fem-node-row fem3d-load-row">${num('fx')}${num('fy')}${num('fz')}</div>
      ${row('check', t('fem.selfWeight'), switchControl('data-fem3d-toggle="gravity"', o.gravity, t('fem.selfWeight')))}
      <p class="muted fem3d-counts">${escapeHtml(result.ok ? t('fem3d.counts', { elements: result.elements.length, nodes: result.nodes.length, h: fmt(result.grid.h, 2) }) : '')}</p>
    </div>
    <div class="fem-side"><div class="fem-preview"><canvas id="fem3d-canvas" width="560" height="420"></canvas></div>
      <div class="fem-toggles"><label>${switchControl('data-fem3d-view="deformed"', state.fem3d.view.deformed, t('fem.deformed'))}<span>${escapeHtml(t('fem.deformed'))}</span></label><label>${switchControl('data-fem3d-view="mesh"', state.fem3d.view.mesh, t('plate.mesh'))}<span>${escapeHtml(t('plate.mesh'))}</span></label></div>
    </div></div>`,
    foot: `${chips}<span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}<button class="button" data-action="fem3d-inp" title="${escapeHtml(t('fem3d.inpTip'))}" ${result.ok ? '' : 'disabled'}>${icon('export')}<span>.inp</span></button><button class="button" data-action="fem3d-ccx" title="${escapeHtml(t('fem3d.ccxTip'))}" ${result.ok ? '' : 'disabled'}>${icon('fem')}<span>CalculiX</span></button><button class="button primary" data-action="fem3d-draw" title="${escapeHtml(t('fem3d.drawTip'))}" ${result.ok ? '' : 'disabled'}>${icon('femSolid')}<span>${escapeHtml(t('fem.draw'))}</span></button>`,
  });
  ready();
  drawFem3d(result);
}

// ───────────────────────── addon manager (FreeCAD Addon Manager, for macros)

function renderAddons() {
  const ko = getLanguage() === 'ko';
  const catalog = state.params.catalog ?? [];
  const installed = state.params.installed ?? [];
  state.addons ??= { url: '', checked: new Set() };
  const has = (name) => installed.some((m) => m.name === name);
  const lang = (l) => `<span class="addon-lang ${l}">${l === 'python' ? 'Python' : 'JS'}</span>`;
  const rows = catalog.map((a) => {
    const name = ko ? a.name.ko : a.name.en;
    const done = has(name);
    return `<div class="addon-row" data-addon="${escapeHtml(a.id)}"><div class="addon-text"><b>${escapeHtml(name)}</b> ${lang(a.language)}<small>${escapeHtml(ko ? a.description.ko : a.description.en)}</small></div>
      ${done ? `<span class="info-chip status-full">${escapeHtml(t('addons.isInstalled'))}</span><button class="small-button" data-addon-run="${escapeHtml(name)}" title="${escapeHtml(t('addons.run'))}">${icon('play')}<span>${escapeHtml(t('addons.run'))}</span></button>`
        : `<button class="small-button primary" data-addon-install="${escapeHtml(a.id)}" title="${escapeHtml(t('addons.install'))}">${icon('import')}<span>${escapeHtml(t('addons.install'))}</span></button>`}</div>`;
  }).join('');
  const mine = installed.map((m) => `<div class="addon-row installed"><div class="addon-text"><b>${escapeHtml(m.name)}</b> ${lang(m.language)}<small>${escapeHtml(m.source ?? t('addons.local'))}</small></div>
    ${m.source ? `<button class="icon-button" data-addon-update="${escapeHtml(m.name)}" title="${escapeHtml(t('addons.update'))}" aria-label="${escapeHtml(t('addons.update'))}">${icon('undo')}</button>` : ''}
    <button class="icon-button" data-addon-run="${escapeHtml(m.name)}" title="${escapeHtml(t('addons.run'))}" aria-label="${escapeHtml(t('addons.run'))}">${icon('play')}</button>
    <button class="icon-button" data-addon-remove="${escapeHtml(m.name)}" title="${escapeHtml(t('addons.remove'))}" aria-label="${escapeHtml(t('addons.remove'))}">${icon('trash')}</button></div>`).join('') || `<p class="muted">${escapeHtml(t('addons.none'))}</p>`;
  root.innerHTML = frame({
    glyph: 'part', title: t('addons.title'),
    body: `<div class="addons-view">
      <section><h3>${icon('list')}<span>${escapeHtml(t('addons.catalog'))}</span></h3><div class="addon-list" id="addon-catalog">${rows}</div></section>
      <section><h3>${icon('check')}<span>${escapeHtml(t('addons.installedTitle', { count: installed.length }))}</span></h3><div class="addon-list" id="addon-installed">${mine}</div>
        <h3>${icon('link')}<span>${escapeHtml(t('addons.fromUrl'))}</span></h3>
        <div class="addon-url"><input id="addon-url" placeholder="https://…/macro.FCMacro" value="${escapeHtml(state.addons.url)}" title="${escapeHtml(t('addons.urlTip'))}" aria-label="${escapeHtml(t('addons.fromUrl'))}" /><button class="small-button" data-addon-url title="${escapeHtml(t('addons.urlTip'))}">${icon('import')}<span>${escapeHtml(t('addons.install'))}</span></button></div>
        <label class="small-button addon-file" title="${escapeHtml(t('addons.fileTip'))}">${icon('open')}<span>${escapeHtml(t('addons.fromFile'))}</span><input type="file" id="addon-file" accept=".py,.FCMacro,.fcmacro,.js,.txt" hidden /></label>
      </section></div>`,
    foot: `<span class="muted">${escapeHtml(t('addons.hint'))}</span><span class="grow"></span>${button('close', t('error.close'), 'close')}`,
  });
  ready();
}

function renderFem() {
  if (!state.fem) femInit();
  const frame = state.params.frame ?? { nodes: [], members: [] };
  const o = state.fem.options;
  const view = state.fem.view;
  const result = analyzeFrame(frame, o);
  const pages = Math.max(1, Math.ceil(frame.nodes.length / FEM_PAGE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const segment = (attr, value, active, label) => `<button class="segment ${active ? 'active' : ''}" ${attr}="${value}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
  const field = (key, label, glyph, min, max, step, unit) => row(glyph, t(label), numberField(key, key.startsWith('fem:section.') ? o.section[key.slice(12)] : o[key.slice(4)], min, max, step, unit, t(label)));
  const nodeRows = frame.nodes.slice(state.page * FEM_PAGE, (state.page + 1) * FEM_PAGE).map((n) => {
    const load = o.loads[n.key] ?? { fx: 0, fy: 0, m: 0 };
    const num = (part) => `<input class="fem-num" data-fem-load="${escapeHtml(n.key)}:${part}" value="${fmt(load[part] / (part === 'm' ? 1000 : 1), 4)}" title="${escapeHtml(t(`fem.load.${part}`))}" aria-label="${escapeHtml(t(`fem.load.${part}`))}" />`;
    return `<div class="fem-node-row"><b>${n.id + 1}</b><span class="muted">${escapeHtml(`${fmt(n.x, 1)}, ${fmt(n.y, 1)}`)}</span><select data-fem-support="${escapeHtml(n.key)}" title="${escapeHtml(t('fem.support'))}">${SUPPORT_TYPES.map((s) => `<option value="${s}" ${(o.supports[n.key] ?? 'free') === s ? 'selected' : ''}>${escapeHtml(t(`fem.support.${s}`))}</option>`).join('')}</select>${num('fx')}${num('fy')}${num('m')}</div>`;
  }).join('');
  const pager = pages > 1 ? `<span class="check-pager"><button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button><span>${state.page + 1} / ${pages}</span><button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= pages - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button></span>` : '';
  const sectionFields = SECTION_FIELDS[o.section.type].map((key) => field(`fem:section.${key}`, `fem.section.${key}`, 'measure', 0.001, key === 'I' ? 1e12 : key === 'A' ? 1e8 : 1e5, key === 'I' || key === 'A' ? 100 : 1, key === 'A' ? 'mm²' : key === 'I' ? 'mm⁴' : 'mm')).join('');
  const util = result.ok ? result.max.utilisation : 0;
  const chips = result.ok
    ? `<span class="info-chip">${escapeHtml(t('fem.maxDisp'))} <b id="fem-disp">${fmt(result.max.displacement, 3)} mm</b></span><span class="info-chip">${escapeHtml(t('fem.maxMoment'))} <b id="fem-moment">${fmt(result.max.moment / 1e6, 3)} kN·m</b></span><span class="info-chip">${escapeHtml(t('fem.maxStress'))} <b id="fem-stress">${fmt(result.max.sigma, 1)} MPa</b></span><span class="info-chip ${util > 1 ? 'status-none' : util > 0.8 ? 'status-partial' : 'status-full'}">${escapeHtml(t('fem.utilisation'))} <b>${fmt(util * 100, 0)} %</b></span>`
    : `<span class="info-chip status-none" id="fem-error">${icon('warning')} ${escapeHtml(t(`fem.error.${result.error}`))}</span>`;
  root.innerHTML = frameHtml({
    glyph: 'fem', title: `${t('fem.title')} — ${state.params.name ?? ''}`,
    body: `<div class="fem-view"><div class="fem-fields">
      ${row('layers', t('fem.material'), `<select data-fem-material title="${escapeHtml(t('fem.material'))}">${[...Object.keys(MATERIALS), 'custom'].map((m) => `<option value="${m}" ${o.material === m ? 'selected' : ''}>${escapeHtml(t(`fem.material.${m}`))}</option>`).join('')}</select>`)}
      ${o.material === 'custom' ? field('fem:E', 'fem.E', 'measure', 1, 1e7, 1000, 'MPa') : ''}
      ${row('polygon', t('fem.section'), `<span class="segmented">${SECTION_TYPES.map((s) => segment('data-fem-section', s, o.section.type === s, t(`fem.section.${s}`))).join('')}</span>`)}
      ${sectionFields}
      ${field('fem:q', 'fem.q', 'chevronDown', -1e6, 1e6, 0.5, 'N/mm')}
      ${row('check', t('fem.selfWeight'), switchControl('data-fem-toggle="selfWeight"', o.selfWeight, t('fem.selfWeight')))}
      <div class="fem-node-head"><span>#</span><span>${escapeHtml(t('fem.position'))}</span><span>${escapeHtml(t('fem.support'))}</span><span>Fx N</span><span>Fy N</span><span>M N·m</span></div>
      <div class="fem-nodes">${nodeRows}</div>${pager}
    </div>
    <div class="fem-side"><div class="fem-preview">${femPreview(frame, o, result, view)}</div>
      <div class="fem-toggles"><label>${switchControl('data-fem-view="deformed"', view.deformed, t('fem.deformed'))}<span>${escapeHtml(t('fem.deformed'))}</span></label><label>${switchControl('data-fem-view="moment"', view.moment, t('fem.moment'))}<span>${escapeHtml(t('fem.moment'))}</span></label><span class="muted">${escapeHtml(t('fem.counts', { nodes: frame.nodes.length, members: frame.members.length }))}</span></div>
    </div></div>`,
    foot: `${chips}<span class="grow"></span>${button('close', t('confirm.cancel'), 'close')}<button class="button" data-action="fem-apply" title="${escapeHtml(t('fem.applyTip'))}">${icon('save')}<span>${escapeHtml(t('fem.apply'))}</span></button><button class="button primary" data-action="fem-draw" title="${escapeHtml(t('fem.drawTip'))}" ${result.ok ? '' : 'disabled'}>${icon('fem')}<span>${escapeHtml(t('fem.draw'))}</span></button>`,
  });
  ready();
}

// ───────────────────────── check geometry window (FreeCAD Part › Check geometry, Mesh › Analyze / Repair)

const CHECK_PAGE = 9;
const CHECK_ISSUES = ['degenerate', 'duplicates', 'openEdges', 'nonManifold', 'flipped', 'inverted', 'selfIntersections'];
const CHECK_REPAIRABLE = ['degenerate', 'duplicates', 'openEdges', 'flipped', 'inverted'];

function renderCheck() {
  const rows = state.params.rows ?? [];
  state.check ??= { focus: rows.findIndex((r) => !r.report.ok), marked: new Set(rows.filter((r) => r.report.repairable).map((r) => r.id)) };
  const c = state.check;
  if (!(c.focus >= 0 && c.focus < rows.length)) c.focus = 0;
  const pages = Math.max(1, Math.ceil(rows.length / CHECK_PAGE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const shown = rows.slice(state.page * CHECK_PAGE, (state.page + 1) * CHECK_PAGE);
  const mark = (r) => (r.report.empty ? ['info', 'muted', t('check.empty')] : r.report.ok ? ['check', 'status-full', t('check.ok')] : r.report.repairable ? ['warning', 'status-partial', t('check.problems', { count: r.report.issues.length })] : ['close', 'status-none', t('check.problems', { count: r.report.issues.length })]);
  const list = shown.map((r) => {
    const index = rows.indexOf(r);
    const [glyph, cls, text] = mark(r);
    const box = r.report.repairable ? `<input type="checkbox" data-check-mark="${escapeHtml(r.id)}" ${c.marked.has(r.id) ? 'checked' : ''} title="${escapeHtml(t('check.markRepair'))}" aria-label="${escapeHtml(t('check.markRepair'))}" />` : '<span class="check-box-space"></span>';
    return `<div class="check-row ${index === c.focus ? 'active' : ''} ${cls}" data-check-focus="${index}" title="${escapeHtml(`${r.name} — ${text}`)}">${box}<span class="check-name">${icon(r.icon || 'solidBox')}<span>${escapeHtml(r.name)}</span></span><span class="check-mark">${icon(glyph)}<span>${escapeHtml(text)}</span></span></div>`;
  }).join('');
  const r = rows[c.focus];
  const value = (key) => {
    const n = r.report[key];
    if (key === 'selfIntersections' && n === null) return t('check.notChecked');
    return formatNumber(n);
  };
  const detail = r ? `<h3 class="check-title">${icon(r.icon || 'solidBox')}<span>${escapeHtml(r.name)}</span></h3>
    <dl class="about-table check-table">
      ${['triangles', 'vertices', ...(r.report.blocks > 1 ? ['blocks'] : []), 'shells', 'holes'].map((key) => `<dt>${escapeHtml(t(`check.${key}`))}</dt><dd>${value(key)}</dd>`).join('')}
      <dt>${escapeHtml(t('check.closed'))}</dt><dd class="${r.report.closed ? 'status-full' : 'status-none'}">${escapeHtml(t(r.report.closed ? 'check.yes' : 'check.no'))}</dd>
      <dt>${escapeHtml(t('measure.volume'))}</dt><dd>${escapeHtml(formatVolume(Math.abs(r.report.volume)))}</dd>
      <dt>${escapeHtml(t('measure.surface'))}</dt><dd>${escapeHtml(formatArea(r.report.area))}</dd>
      ${CHECK_ISSUES.map((key) => {
        const bad = r.report[key] > 0;
        const tip = bad ? t(CHECK_REPAIRABLE.includes(key) ? 'check.canRepair' : 'check.cannotRepair') : '';
        return `<dt class="${bad ? (CHECK_REPAIRABLE.includes(key) ? 'status-partial' : 'status-none') : ''}" title="${escapeHtml(tip)}">${icon(bad ? 'warning' : 'check')}${escapeHtml(t(`check.${key}`))}</dt><dd class="${bad ? 'check-bad' : ''}" title="${escapeHtml(tip)}">${value(key)}</dd>`;
      }).join('')}
    </dl>` : `<p class="muted">${escapeHtml(t('check.none'))}</p>`;
  const ok = rows.filter((x) => x.report.ok).length;
  const pager = pages > 1 ? `<span class="check-pager"><button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button><span>${state.page + 1} / ${pages}</span><button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= pages - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button></span>` : '';
  root.innerHTML = frame({
    glyph: 'checkGeometry', title: t('check.title'),
    body: `<div class="check-view"><div class="check-list"><div class="check-rows">${list}</div><p class="muted hint">${escapeHtml(t('check.hint'))}</p>${pager}</div><div class="check-detail">${detail}</div></div>`,
    foot: `<span class="info-chip status-full">${icon('check')} ${escapeHtml(t('check.ok'))} <b>${ok}</b></span><span class="info-chip status-partial">${icon('warning')} ${escapeHtml(t('check.withProblems'))} <b id="check-bad">${rows.length - ok}</b></span><span class="grow"></span>${button('close', t('error.close'), 'close')}<button class="button primary" data-action="check-repair" title="${escapeHtml(t('check.repairTip'))}" ${c.marked.size ? '' : 'disabled'}>${icon('meshRepair')}<span>${escapeHtml(t('check.repair', { count: c.marked.size }))}</span></button>`,
  });
  ready();
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
    glyph: 'checklist', title: t('coverage.title'), tabs,
    body: `<div class="coverage-view">${rows}</div>`,
    foot: `<span class="info-chip status-full">${icon('check')} ${escapeHtml(t('coverage.full'))} <b>${summary.full}</b></span><span class="info-chip status-partial">${icon('warning')} ${escapeHtml(t('coverage.partial'))} <b>${summary.partial}</b></span><span class="info-chip status-none">${icon('close')} ${escapeHtml(t('coverage.none'))} <b>${summary.none}</b></span><span class="muted">${escapeHtml(t('coverage.hint'))}</span><span class="grow"></span>${button('close', t('error.close'), 'close', 'primary')}`,
  });
  ready();
}

// ───────────────────────── tutorial panel
// The player runs in the main window (it works the real interface there); this
// window shows its panel and sends the buttons back.

function renderTutorial() {
  const html = state.tutorialHtml ?? state.params.html;
  if (!html) return;
  setOsTitle(getLanguage() === 'en' ? 'Interactive tutorial' : '따라 하는 튜토리얼');
  root.innerHTML = `<section class="tut-panel tut-window" role="dialog">${html}</section>`;
  for (const el of root.querySelectorAll('.tut-head, .tut-head > b, .tut-head > svg')) el.setAttribute('data-tauri-drag-region', '');
  const height = Math.ceil(root.querySelector('.tut-panel').getBoundingClientRect().height);
  if (desktop && Math.abs(height - window.innerHeight) > 1) appWindow.setSize(new LogicalSize(POPUPS.tutorial.width, height)).catch(() => {});
  ready();
}

// ───────────────────────── viewer (Std_ViewCreate / Std_ViewUndock: the 3D view in its own window)

async function renderViewer() {
  const p = state.params;
  if (!p.drawing) return;
  if (!state.viewer) {
    root.innerHTML = frame({
      glyph: 'cube', title: `${t('std.viewerTitle')} — ${p.name ?? ''}`,
      body: `<div class="viewer-bar">${['iso', 'top', 'front', 'right', 'rear', 'left', 'bottom'].map((view) => `<button class="small-button" data-viewer-view="${view}" title="${escapeHtml(t(`std.view${view === 'iso' ? 'Isometric' : view[0].toUpperCase() + view.slice(1)}`))}">${escapeHtml(t(`std.view${view === 'iso' ? 'Isometric' : view[0].toUpperCase() + view.slice(1)}`))}</button>`).join('')}<span class="grow"></span><button class="small-button" data-viewer-view="fit">${icon('zoomFit')}<span>${escapeHtml(t('action.zoomFit'))}</span></button></div><div class="viewer-host" id="viewer-host"></div>`,
    });
    ready();
    const { View3D } = await import('./view/view3d.js');
    const host = root.querySelector('#viewer-host');
    state.viewer = new View3D(host, {});
    state.viewer.options.style = p.style ?? 'asis';
    new ResizeObserver(() => { const r = host.getBoundingClientRect(); state.viewer.resize(r.width, r.height); }).observe(host);
  }
  const r = root.querySelector('#viewer-host').getBoundingClientRect();
  state.viewer.resize(r.width, r.height);
  state.viewer.update(p.drawing, { thickness: p.thickness ?? 10, colors: p.colors ?? {} });
  if (!state.viewerFramed) { state.viewer.view('iso'); state.viewerFramed = true; }
}

root.addEventListener('click', (event) => {
  if (kind !== 'viewer') return;
  const view = event.target.closest('[data-viewer-view]')?.dataset.viewerView;
  if (!view || !state.viewer) return;
  if (view === 'fit') state.viewer.fit();
  else state.viewer.view(view);
});

// ───────────────────────── form (the dialogs of many small commands)
//
// params: { title, icon, intro, fields: [{ key, label, icon, type, value, min, max, step, unit,
// options: [[value, label]], rows, readonly }], actions: [{ id, label, icon, primary, keep }], live }
// Field types: number, text, textarea, select, check, color, range, info (read-only text),
// list (a list of rows with a button each: options = [[id, label, button]]).
// Answers { action, values }; with `live`, every change is also sent as the action 'form:change'.

function formValues() {
  const values = { ...(state.form ?? {}) };
  for (const input of root.querySelectorAll('[data-form]')) {
    const key = input.dataset.form;
    if (input.type === 'checkbox') values[key] = input.checked;
    else if (input.type === 'number' || input.type === 'range') values[key] = Number(input.value);
    else values[key] = input.value;
  }
  return values;
}

function formControl(field) {
  const attr = `data-form="${escapeHtml(field.key)}" aria-label="${escapeHtml(field.label ?? field.key)}" ${field.readonly ? 'readonly' : ''}`;
  const value = field.value ?? '';
  switch (field.type) {
    case 'number': return `<input class="num form-num" type="number" ${attr} value="${escapeHtml(value)}" ${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''} step="${field.step ?? 'any'}" />${field.unit ? `<span class="form-unit">${escapeHtml(field.unit)}</span>` : ''}`;
    case 'range': return `<input class="form-range" type="range" ${attr} value="${escapeHtml(value)}" min="${field.min ?? 0}" max="${field.max ?? 100}" step="${field.step ?? 1}" /><output class="form-out">${escapeHtml(value)}${field.unit ? ` ${escapeHtml(field.unit)}` : ''}</output>`;
    case 'select': return `<select class="choice-select" ${attr}>${(field.options ?? []).map(([v, label]) => `<option value="${escapeHtml(v)}" ${String(v) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
    case 'check': return switchControl(attr, Boolean(value), field.label ?? '');
    case 'color': return `<input class="form-color" type="color" ${attr} value="${escapeHtml(value || '#000000')}" />`;
    case 'textarea': return `<textarea class="form-text" ${attr} rows="${field.rows ?? 6}" spellcheck="false">${escapeHtml(value)}</textarea>`;
    case 'info': return `<span class="form-info" ${attr}>${escapeHtml(value)}</span>`;
    case 'list': return `<div class="form-list" data-form-list="${escapeHtml(field.key)}">${(field.options ?? []).map(([id, label, buttonLabel]) => `<div class="form-list-row"><span>${escapeHtml(label)}</span>${buttonLabel ? `<button class="button small" data-form-pick="${escapeHtml(field.key)}" data-value="${escapeHtml(id)}">${escapeHtml(buttonLabel)}</button>` : ''}</div>`).join('') || `<span class="muted">${escapeHtml(field.empty ?? '—')}</span>`}</div>`;
    default: return `<input class="wide form-text-input" type="text" ${attr} value="${escapeHtml(value)}" />`;
  }
}

function renderForm() {
  const p = state.params;
  if (!Array.isArray(p.fields)) return;
  const wide = (field) => field.type === 'textarea' || field.type === 'list';
  const rows = p.fields.map((field) => (wide(field)
    ? `<div class="form-block"><span class="row-label">${icon(field.icon ?? 'info')}<span>${escapeHtml(field.label ?? '')}</span></span>${formControl(field)}</div>`
    : row(field.icon ?? 'info', field.label ?? field.key, formControl(field), field.tip ?? field.label ?? field.key))).join('');
  root.innerHTML = frame({
    glyph: p.icon ?? 'settings',
    // A dialog's title is the command's name without the menu's "…".
    title: (p.title ?? '').replace(/…$/, ''),
    body: `<div class="form">${p.intro ? `<p class="form-intro">${escapeHtml(p.intro)}</p>` : ''}${rows}</div>`,
    foot: `<span class="grow"></span>${(p.actions ?? [{ id: 'ok', label: t('confirm.ok'), primary: true }]).map((b) => `<button class="button ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-form-action="${escapeHtml(b.id)}" ${b.keep ? 'data-keep="1"' : ''} title="${escapeHtml(b.label)}">${b.icon ? icon(b.icon) : ''}<span>${escapeHtml(b.label)}</span></button>`).join('')}`,
  });
  fitHeight();
  (root.querySelector('[data-form]:not([readonly])') ?? root.querySelector('.button.primary'))?.focus();
  ready();
}

root.addEventListener('click', (event) => {
  if (kind !== 'form') return;
  const pick = event.target.closest('[data-form-pick]');
  if (pick) { action('form:pick', { key: pick.dataset.formPick, value: pick.dataset.value, values: formValues() }); return; }
  const button = event.target.closest('[data-form-action]');
  if (!button) return;
  const answer = { action: button.dataset.formAction, values: formValues() };
  if (button.dataset.keep) action('form:button', answer);
  else close(answer);
});
const formChanged = (event) => {
  if (kind !== 'form' || !event.target.matches('[data-form]')) return;
  const out = event.target.parentElement?.querySelector('.form-out');
  if (out) out.textContent = `${event.target.value}${state.params.fields?.find((f) => f.key === event.target.dataset.form)?.unit ? ` ${state.params.fields.find((f) => f.key === event.target.dataset.form).unit}` : ''}`;
  if (state.params.live) action('form:change', { values: formValues() });
};
root.addEventListener('input', formChanged);
root.addEventListener('change', formChanged);
root.addEventListener('keydown', (event) => {
  if (kind !== 'form' || event.key !== 'Enter' || event.target.matches('textarea')) return;
  const primary = root.querySelector('[data-form-action].primary');
  if (primary) { event.preventDefault(); primary.click(); }
});

root.addEventListener('click', (event) => {
  if (kind !== 'tutorial') return;
  const tut = event.target.closest('[data-tut]')?.dataset.tut;
  if (tut) action('tutorial', { tut });
});
root.addEventListener('change', (event) => {
  if (kind !== 'tutorial') return;
  if (event.target.matches('.tut-lesson')) action('tutorial', { lesson: Number(event.target.value) });
  if (event.target.matches('.tut-speed')) action('tutorial', { speed: Number(event.target.value) });
});

// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-print-orientation], [data-theme-group], [data-pick-theme], [data-part-kind], [data-part-category], [data-part-view], [data-array-mode], [data-stl-scope], [data-stl-ascii], [data-solid-kind], [data-solid-axis], [data-coverage-filter], [data-solid-choice], [data-opening-choice], [data-opening-add], [data-opening-remove], [data-opening-pick], [data-solid-tab], [data-layer-add], [data-layer-move], [data-layer-remove], [data-edge-pick], [data-edge-mode], [data-bim-action], [data-check-focus], [data-cam-op], [data-cam-side], [data-fem3d-fixed], [data-addon-install], [data-addon-run], [data-addon-remove], [data-addon-update], [data-addon-url], [data-cam-shape], [data-cam-direction], [data-cam-view], [data-cam-sim], [data-fem-section], [data-sheet-cell], [data-sheet-page], [data-sheet-cmd]');
  if (!target || target.disabled) return undefined;
  if (target.classList.contains('menu-item')) {
    if (target.dataset.sub !== undefined) return openSubmenu(Number(target.dataset.sub));
    if (target.dataset.menuBack !== undefined) return openSubmenu(null);
    return chooseMenu(target.dataset.id);
  }
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
  if (target.dataset.solidChoice) {
    const d = state.solid;
    const key = target.dataset.solidChoice;
    const value = Number(target.dataset.value);
    // A new piece of equipment takes the usual size of its type.
    const size = key === 'equipment' && d.mode !== 'edit' ? EQUIPMENT_SIZES[EQUIPMENT_TYPES[value]] : null;
    d.params = normalizeSolidParams(d.kind, { ...d.params, [key]: value, ...(size ? { length: size[0], width: size[1], height: size[2] } : {}) });
    d.cache[d.kind] = d.params;
    return render();
  }
  if (target.dataset.openingChoice) {
    const [index, key] = target.dataset.openingChoice.split('.');
    const o = state.solid.shape.openings[Number(index)];
    const value = Number(target.dataset.value);
    if (key === 'type') {
      const type = OPENING_TYPES[value];
      const fresh = defaultOpening(type);
      Object.assign(o, { type, width: fresh.width, height: fresh.height, sill: fresh.sill });
    } else o[key] = value === 0 ? 1 : -1;
    state.solid.focus = Number(index);
    return render();
  }
  if (target.dataset.openingAdd) {
    const d = state.solid;
    const fresh = defaultOpening(target.dataset.openingAdd);
    const total = wallLength({ shape: d.shape });
    const end = d.shape.openings.reduce((max, o) => Math.max(max, o.at + o.width), 0);
    fresh.at = Math.max(0, Math.min(total - fresh.width, d.shape.openings.length ? end + 600 : (total - fresh.width) / 2));
    d.shape.openings.push(fresh);
    d.focus = d.shape.openings.length - 1;
    return render();
  }
  if (target.dataset.openingPick) { state.solid.focus = Number(target.dataset.openingPick); return render(); }
  if (target.dataset.solidTab) { state.solid.tab = target.dataset.solidTab; return render(); }
  if (target.dataset.layerAdd) {
    const layers = state.solid.shape.layers ??= [];
    const materials = state.params.materials?.length ? state.params.materials : presetMaterials(getLanguage());
    // A new wall starts as its single material; more layers stack inwards.
    if (!layers.length) layers.push({ material: { ...(materials.find((m) => m.id === 'concrete') ?? materials[0]) }, thickness: state.solid.params.width });
    else layers.push({ material: { ...(materials.find((m) => m.id === 'gypsum') ?? materials[0]) }, thickness: 12 });
    return render();
  }
  if (target.dataset.layerMove) {
    const [i, step] = target.dataset.layerMove.split(':').map(Number);
    const layers = state.solid.shape.layers;
    [layers[i], layers[i + step]] = [layers[i + step], layers[i]];
    return render();
  }
  if (target.dataset.layerRemove) { state.solid.shape.layers.splice(Number(target.dataset.layerRemove), 1); return render(); }
  if (target.dataset.edgePick) { state.solid.edge = Number(target.dataset.edgePick); return render(); }
  if (target.dataset.edgeMode) {
    const d = state.solid;
    const mode = Number(target.dataset.edgeMode);
    d.shape.slopes[d.edge] = mode === 0 ? null : mode === 1 ? 90 : Math.min(d.params.slope || 30, 89);
    return render();
  }
  if (target.dataset.bimAction) return bimAction(target.dataset.bimAction, target.dataset.value);
  if (target.dataset.openingRemove) {
    state.solid.shape.openings.splice(Number(target.dataset.openingRemove), 1);
    state.solid.focus = null;
    return render();
  }
  if (target.dataset.sheetCell) {
    // Shift+click: a block from the picked cell to this one.
    if (event.shiftKey) state.sheetEdit.sel2 = target.dataset.sheetCell;
    else { state.sheetEdit.sel = target.dataset.sheetCell; state.sheetEdit.sel2 = null; }
    state.sheetEdit.error = '';
    render();
    root.querySelector('#sheet-formula')?.focus();
    return undefined;
  }
  if (target.dataset.sheetCmd) return sheetCommand(target.dataset.sheetCmd);
  if (target.dataset.sheetPage) {
    const [axis, step] = target.dataset.sheetPage.split(':');
    const sh = state.sheetEdit;
    if (axis === 'row') sh.row0 = Math.max(0, Math.min(SHEET_ROWS - 1, sh.row0 + Number(step))); else sh.col0 = Math.max(0, Math.min(25, sh.col0 + Number(step)));
    return render();
  }
  if (target.dataset.femSection) { state.fem.options = normalizeFem({ ...state.fem.options, section: { ...state.fem.options.section, type: target.dataset.femSection } }); return render(); }
  if (target.dataset.camOp) { state.cam.operation = target.dataset.camOp; return render(); }
  if (target.dataset.addonInstall) {
    const a = (state.params.catalog ?? []).find((x) => x.id === target.dataset.addonInstall);
    if (a) return close({ action: 'install', items: [{ name: getLanguage() === 'ko' ? a.name.ko : a.name.en, code: a.code, language: a.language }] });
  }
  if (target.dataset.addonRun) return close({ action: 'run', name: target.dataset.addonRun });
  if (target.dataset.addonRemove) return close({ action: 'remove', names: [target.dataset.addonRemove] });
  if (target.dataset.addonUpdate) {
    const m = (state.params.installed ?? []).find((x) => x.name === target.dataset.addonUpdate);
    if (m?.source) return close({ action: 'install', items: [{ name: m.name, url: m.source, language: m.language }] });
  }
  if (target.dataset.addonUrl !== undefined) {
    const url = root.querySelector('#addon-url')?.value.trim();
    if (url) return close({ action: 'install', items: [{ url, name: decodeURIComponent(url.split('/').pop() || '').replace(/\.(py|fcmacro|js)$/i, '') }] });
    return undefined;
  }
  if (target.dataset.fem3dFixed) { const f = target.dataset.fem3dFixed; const fixed = state.fem3d.options.fixed.includes(f) ? state.fem3d.options.fixed.filter((x) => x !== f) : [...state.fem3d.options.fixed, f]; state.fem3d.options = normalizeFem3d({ ...state.fem3d.options, fixed }); return render(); }
  if (target.dataset.camShape) { state.cam.toolShape = target.dataset.camShape; return render(); }
  if (target.dataset.camDirection) { state.cam.direction = target.dataset.camDirection; return render(); }
  if (target.dataset.camView) { if (state.camSim) { state.camSim.playing = false; cancelAnimationFrame(state.camSim.frame); } state.camView = target.dataset.camView; return render(); }
  if (target.dataset.camSim) {
    const sim = state.camSim;
    if (!sim?.grid) return undefined;
    if (target.dataset.camSim === 'end') { sim.playing = false; camSimTo(sim.run.total); return render(); }
    sim.playing = !sim.playing;
    if (sim.playing) { if (sim.run.cut >= sim.run.total) camSimTo(0); sim.frame = requestAnimationFrame(camSimStep); } else cancelAnimationFrame(sim.frame);
    return render();
  }
  if (target.dataset.camSide) { state.cam.side = target.dataset.camSide; return render(); }
  if (target.dataset.checkFocus !== undefined && !target.closest('input')) { state.check.focus = Number(target.dataset.checkFocus); return render(); }
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
      if (root.querySelector('#about-rows [data-copy]')) return copyText([...root.querySelectorAll('#about-rows [data-copy]')].map((row) => row.dataset.copy).join('\n'));
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
    case 'cam-export':
      return applyCam();
    case 'cam-stock':
      try { globalThis.localStorage?.setItem(CAM_KEY, JSON.stringify(state.cam)); } catch { /* ignore */ }
      return close({ action: 'stock', options: state.cam });
    case 'sheet-apply':
      return close({ action: 'apply', sheet: sheetResult() });
    case 'sheet-csv':
      return close({ action: 'csv', sheet: sheetResult() });
    case 'sheet-import':
      return close({ action: 'import', sheet: sheetResult() });
    case 'fem-apply':
      return close({ action: 'apply', fem: state.fem.options });
    case 'fem-draw':
      return close({ action: 'draw', fem: state.fem.options, view: state.fem.view });
    case 'fem3d-draw': case 'fem3d-inp': case 'fem3d-ccx':
      return close({ action: action.slice(6), fem3d: state.fem3d.options });
    case 'plate-apply':
      return close({ action: 'apply', plate: state.plate.options });
    case 'plate-draw':
      return close({ action: 'draw', plate: state.plate.options, view: state.plate.view });
    case 'check-repair':
      return close({ action: 'repair', ids: [...state.check.marked] });
    default:
      return undefined;
  }
});

// The addon manager's file input: the macro text is installed.
root.addEventListener('change', async (event) => {
  if (event.target.id !== 'addon-file') return;
  const file = event.target.files?.[0];
  if (!file) return;
  const code = await file.text();
  close({ action: 'install', items: [{ name: file.name.replace(/\.(py|fcmacro|js|txt)$/i, ''), code, language: /\.js$/i.test(file.name) ? 'js' : 'python' }] });
});

// The CAM simulator's position: dragging pauses and shows the stock at that point.
root.addEventListener('input', (event) => {
  if (event.target.id !== 'cam-sim-pos' || !state.camSim) return;
  if (state.camSim.playing) { state.camSim.playing = false; cancelAnimationFrame(state.camSim.frame); }
  camSimTo(Number(event.target.value));
});

root.addEventListener('change', (event) => {
  const target = event.target;
  // A choice dropdown acts like clicking the chosen option's segment.
  if (target.classList?.contains('choice-select')) {
    target.selectedOptions[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return undefined;
  }
  if (target.dataset.sheetFormula !== undefined) {
    const sh = state.sheetEdit;
    const text = target.value.trim();
    if (text) sh.cells[sh.sel] = text; else delete sh.cells[sh.sel];
    // Enter-like: move one row down so a column fills quickly.
    const m = /^([A-Z])(\d+)$/.exec(sh.sel);
    if (m && Number(m[2]) < SHEET_ROWS) sh.sel = `${m[1]}${Number(m[2]) + 1}`;
    return render();
  }
  if (target.dataset.sheetAlias !== undefined) {
    const sh = state.sheetEdit;
    const name = target.value.trim();
    for (const [k, c] of Object.entries(sh.aliases)) if (c === sh.sel) delete sh.aliases[k];
    sh.error = '';
    if (name) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || isCell(name.toUpperCase())) sh.error = t('sheet.badAlias', { name });
      else if (sh.aliases[name]) sh.error = t('sheet.usedAlias', { name, cell: sh.aliases[name] });
      else sh.aliases[name] = sh.sel;
    }
    return render();
  }
  if (target.dataset.femToggle) { state.fem.options = normalizeFem({ ...state.fem.options, [target.dataset.femToggle]: target.checked }); return render(); }
  if (target.dataset.femView) { state.fem.view[target.dataset.femView] = target.checked; return render(); }
  if (target.dataset.femMaterial !== undefined) { state.fem.options = normalizeFem({ ...state.fem.options, material: target.value, E: state.fem.options.E, density: state.fem.options.density, fy: state.fem.options.fy }); return render(); }
  if (target.dataset.femSupport) { const supports = { ...state.fem.options.supports, [target.dataset.femSupport]: target.value }; state.fem.options = normalizeFem({ ...state.fem.options, supports }); return render(); }
  if (target.dataset.femLoad) {
    const [key, part] = [target.dataset.femLoad.slice(0, target.dataset.femLoad.lastIndexOf(':')), target.dataset.femLoad.slice(target.dataset.femLoad.lastIndexOf(':') + 1)];
    const value = Number(evaluate(target.value));
    if (!Number.isFinite(value)) return render();
    const loads = { ...state.fem.options.loads, [key]: { fx: 0, fy: 0, m: 0, ...(state.fem.options.loads[key] ?? {}), [part]: part === 'm' ? value * 1000 : value } };
    state.fem.options = normalizeFem({ ...state.fem.options, loads });
    return render();
  }
  if (target.dataset.fem3dView) { state.fem3d.view[target.dataset.fem3dView] = target.checked; drawFem3d(state.fem3d.result); return undefined; }
  if (target.dataset.fem3dToggle) { state.fem3d.options = normalizeFem3d({ ...state.fem3d.options, [target.dataset.fem3dToggle]: target.checked }); return render(); }
  if (target.dataset.fem3dMaterial !== undefined) { state.fem3d.options = normalizeFem3d({ ...state.fem3d.options, material: target.value, nu: undefined, density: undefined }); return render(); }
  if (target.dataset.fem3dLoadFace !== undefined) { state.fem3d.loadFace = target.value; const l = state.fem3d.options.loads[0] ?? { fx: 0, fy: 0, fz: 0 }; state.fem3d.options = normalizeFem3d({ ...state.fem3d.options, loads: [{ ...l, face: target.value }] }); return render(); }
  if (target.dataset.fem3dLoad) {
    const value = Number(evaluate(target.value));
    if (!Number.isFinite(value)) return render();
    const l = state.fem3d.options.loads[0] ?? { face: state.fem3d.loadFace, fx: 0, fy: 0, fz: 0 };
    state.fem3d.options = normalizeFem3d({ ...state.fem3d.options, loads: [{ face: state.fem3d.loadFace, fx: l.fx, fy: l.fy, fz: l.fz, [target.dataset.fem3dLoad]: value }] });
    return render();
  }
  if (target.dataset.plateView) { state.plate.view[target.dataset.plateView] = target.checked; return render(); }
  if (target.dataset.plateMaterial !== undefined) { state.plate.options = normalizePlate({ ...state.plate.options, material: target.value, E: state.plate.options.E, nu: undefined }); return render(); }
  if (target.dataset.plateSupport) { state.plate.options = normalizePlate({ ...state.plate.options, supports: { ...state.plate.options.supports, [target.dataset.plateSupport]: target.value } }); return render(); }
  if (target.dataset.plateLoad) {
    const [side, part] = target.dataset.plateLoad.split(':');
    const value = Number(evaluate(target.value));
    if (!Number.isFinite(value)) return render();
    state.plate.options = normalizePlate({ ...state.plate.options, loads: { ...state.plate.options.loads, [side]: { fx: 0, fy: 0, ...(state.plate.options.loads[side] ?? {}), [part]: value } } });
    return render();
  }
  if (target.dataset.camToggle) { state.cam[target.dataset.camToggle] = target.checked; return render(); }
  if (target.dataset.checkMark) {
    if (target.checked) state.check.marked.add(target.dataset.checkMark); else state.check.marked.delete(target.dataset.checkMark);
    return render();
  }
  if (target.dataset.settingColor) return update({ [target.dataset.settingColor]: target.value });
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
    const value = target.dataset.length ? evaluateLength(target.value) : evaluate(target.value);
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
    else if (kind === 'tutorial') action('tutorial', { tut: 'close' });
    else if (kind !== 'progress') close(kind === 'confirm' ? { choice: 'cancel' } : null);
  }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    const focused = document.activeElement?.classList.contains('menu-item') ? document.activeElement : null;
    if ((event.key === 'Enter' || event.key === 'ArrowRight') && focused?.dataset.sub !== undefined) { event.preventDefault(); openSubmenu(Number(focused.dataset.sub)); return; }
    if ((event.key === 'ArrowLeft' || event.key === 'Backspace' || (event.key === 'Enter' && focused?.dataset.menuBack !== undefined)) && menuPath.list.length) { event.preventDefault(); openSubmenu(null); return; }
    if (event.key === 'Enter' && focused) { event.preventDefault(); chooseMenu(focused.dataset.id); }
  }
  if (kind === 'print' && event.key === 'PageDown') { state.page += 1; render(); }
  if (kind === 'print' && event.key === 'PageUp') { state.page -= 1; render(); }
  if ((kind === 'part' || kind === 'array' || kind === 'stl' || kind === 'solid' || kind === 'bim') && event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); if (kind === 'part') applyPart(); else if (kind === 'array') applyArray(); else if (kind === 'solid') applySolid(); else if (kind === 'bim') bimAction('apply'); else applyStl(); }
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
  } else if (scope === 'array') { state.array[field] = value; render(); } else if (scope === 'stl') { state.stl[field] = value; render(); } else if (scope === 'cam') { state.cam = normalizeCamOptions({ ...state.cam, [field]: value }); render(); } else if (scope === 'fem3d') {
    state.fem3d.options = normalizeFem3d({ ...state.fem3d.options, [field]: value });
    render();
  } else if (scope === 'plate') {
    state.plate.options = normalizePlate({ ...state.plate.options, [field]: value });
    render();
  } else if (scope === 'fem') {
    const o = state.fem.options;
    state.fem.options = normalizeFem(field.startsWith('section.') ? { ...o, section: { ...o.section, [field.slice(8)]: value } } : { ...o, [field]: value });
    render();
  } else if (scope === 'solid') {
    const d = state.solid;
    d.params = normalizeSolidParams(d.kind, { ...d.params, [field]: value });
    d.cache[d.kind] = d.params;
    render();
  } else if (scope === 'opening') {
    const [index, key] = field.split('.');
    const o = state.solid.shape?.openings[Number(index)];
    if (o) { o[key] = ['cols', 'rows'].includes(key) ? Math.min(8, Math.max(1, Math.round(value))) : Math.max(key === 'at' || key === 'sill' ? 0 : 50, value); state.solid.focus = Number(index); }
    render();
  } else if (scope === 'layer') {
    const layer = state.solid.shape?.layers?.[Number(field)];
    if (layer) layer.thickness = Math.max(1, value);
    render();
  } else if (scope === 'edge') {
    state.solid.shape.slopes[Number(field)] = Math.min(89, Math.max(1, value));
    render();
  } else if (scope === 'bimLevel') {
    const [index, key] = field.split('.');
    const level = state.bim?.levels[Number(index)];
    if (level) level[key] = key === 'height' ? Math.max(100, value) : value;
    render();
  } else if (scope === 'solidPlace') { state.solid.place[field] = value; render(); } else if (scope === 'section') { state.solid.level = value; render(); } else if (scope === 'project') { state.solid.gap = value; render(); }
  return undefined;
});

// Menus close when the focus leaves MyCAD (a click in another program). A click
// in the main window closes them there; the focus merely moving to the main
// window (Windows activating the owner a moment late) must not close a menu that just opened.
window.addEventListener('blur', () => {
  if (kind !== 'menu' || !menuOpen) return;
  setTimeout(async () => {
    if (document.hasFocus() || !menuOpen) return;
    const focused = desktop ? await native.invoke('focused_window').catch(() => null) : null;
    if (focused !== 'main') chooseMenu(null);
  }, 60);
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
  } else if (message?.type === 'tutorial' && kind === 'tutorial') {
    state.tutorialHtml = message.html;
    render();
  } else if (message?.type === 'viewer:drawing' && kind === 'viewer') {
    state.params = { ...state.params, drawing: message.drawing, name: message.name };
    renderViewer();
  } else if (message?.type === 'sheet:command' && kind === 'spreadsheet') {
    sheetCommand(message.id);
  } else if (message?.type === 'sheet:load' && kind === 'spreadsheet') {
    // Spreadsheet_Import from the main window: the imported sheet replaces what is shown.
    state.sheetEdit = { ...normalizeSpreadsheet(message.sheet ?? {}), sel: 'A1', sel2: null, row0: 0, col0: 0, error: '' };
    render();
  } else if (message?.type === 'form:fields' && kind === 'form') {
    // The host changed the fields (e.g. another kind of unit): drawn again with them.
    state.params = { ...state.params, fields: message.fields };
    render();
  } else if (message?.type === 'form:set' && kind === 'form') {
    const target = root.querySelector(`[data-form="${CSS.escape(message.key)}"]`);
    if (target && 'value' in target && target.tagName !== 'SPAN') target.value = message.value;
    else if (target) target.textContent = message.value;
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
  if (kind === 'check') { state.check = null; state.page = 0; }
  if (kind === 'cam') { state.cam = null; state.camJob = null; if (state.camSim) cancelAnimationFrame(state.camSim.frame); state.camSim = null; }
  if (kind === 'fem') state.fem = null;
  if (kind === 'plate') state.plate = null;
  if (kind === 'fem3d') state.fem3d = null;
  if (kind === 'addons') state.addons = null;
  if (kind === 'spreadsheet') state.sheetEdit = null;
  if (kind === 'tutorial') state.tutorialHtml = null;
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

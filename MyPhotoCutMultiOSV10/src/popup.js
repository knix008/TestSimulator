// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web build: ?popup=<kind>). Every popup has a
// fixed size chosen so its content fits without scrolling; long content is split
// into tabs or pages, and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { loadRecent, loadRecentDirs, MAX_RECENT, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, ANIMATION_INTERVALS, BACKGROUND_FITS, BACKGROUND_KINDS, defaultSettings, EXPORT_SIZES, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, GALLERY_COLUMNS, IMAGE_TYPES, loadSettings,
  RECENT_DIRS_KEY, RECENT_KEY, STORAGE_KEY, storeSettings, WORK_SIZES, ZOOM,
} from './domain/settings.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { POPUPS, popupParams } from './platform/popups.js';
import {
  applyFont, applyTheme, contrast, CUSTOM, CUSTOM_KEYS, customFrom, DARK_THEMES, LIGHT_THEMES, resolveTheme, SYSTEM, themeName,
} from './themes.js';
import { bindSteppers, stepperHtml } from './stepper.js';
import { intervalLabel } from './ui/startpage.js';
import { CLASSIC_STYLE_IDS, DEFAULT_STYLE_IDS, STYLES } from './engine/styles.js';
import { SAMPLE_PHOTOS, sampleUrl } from './domain/samples.js';
import { layoutPages, MARGINS as PRINT_MARGINS, normalizePrintOptions, pageHtml, PAPERS as PRINT_PAPERS, PRINT_KEY } from './print/layout.js';

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
  globalThis.parent?.postMessage({ myphotocut: true, kind, type, data }, location.origin);
  return Promise.resolve();
}
const result = (data) => send('result', data);
const action = (name, data = {}) => send('action', { action: name, ...data });

async function close(value = null) {
  stopCamera();
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
  pager: {},
  draft: null,
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
  appWindow.setTitle(`${title} — MyPhotoCut v${VERSION}`).catch(() => {});
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

const withIcon = (control, glyph) => (glyph ? String(control).replace(/<select(?![^>]*data-icon=)/g, `<select data-icon="${glyph}"`) : control);
const row = (glyph, label, control, title = label, cls = '') => `<div class="row ${cls}" title="${escapeHtml(title)}"><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control">${withIcon(control, glyph)}</span></div>`;

const numberField = (key, value, min, max, step, unit, label) => stepperHtml({
  key, value, min, max, step, unit, label,
  decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }),
});

const toggle = (key, label, glyph, checked = s()[key], attr = 'data-toggle') => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" ${attr}="${key}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);

const segmented = (key, options, current, attr = 'data-setting') => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `
  <button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" ${attr}="${key}" data-value="${escapeHtml(value)}" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}${escapeHtml(label)}</button>`).join('')}</span>`;

const select = (attrName, key, options, current, label, extra = '') => `<select ${attrName}="${key}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${extra}>${options.map(([value, text, glyph]) => `<option value="${escapeHtml(value)}"${glyph ? ` data-icon="${glyph}"` : ''} ${String(current) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;

const tabsHtml = (list, current, actionName = 'tab') => `<nav class="tabs" role="tablist"><div class="tabs-strip">${list.map(([id, glyph, label]) => `
  <button class="tab ${current === id ? 'active' : ''}" role="tab" aria-selected="${current === id}" data-action="${actionName}" data-value="${id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</div>
  <span class="tabs-nav">
    <button class="tabs-scroll" data-action="tabs-scroll" data-value="-1" title="${escapeHtml(t('tabs.left'))}" aria-label="${escapeHtml(t('tabs.left'))}">${icon('chevronLeft')}</button>
    <button class="tabs-scroll" data-action="tabs-scroll" data-value="1" title="${escapeHtml(t('tabs.right'))}" aria-label="${escapeHtml(t('tabs.right'))}">${icon('chevronRight')}</button>
  </span></nav>`;

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
      menu: renderMenu, theme: renderThemePicker, welcome: renderWelcome, image: renderExport, prompt: renderPrompt, styles: renderStyles, camera: renderCamera, print: renderPrint,
    })[kind]?.();
    alignRows();
    updateTabsNav();
  } catch (error) {
    action('report-error', { message: String(error?.message ?? error), detail: String(error?.stack ?? ''), context: `popup-${kind}` });
  }
}

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
  ['caricature', 'generate', 'settings.caricature'],
  ['start', 'home', 'settings.startPage'],
  ['appearance', 'palette', 'settings.theme'],
  ['font', 'font', 'settings.font'],
  ['background', 'sparkles', 'settings.background'],
  ['recent', 'recent', 'settings.recent'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

function renderSettings() {
  const body = {
    general: settingsGeneral, caricature: settingsCaricature, start: settingsStart, appearance: settingsAppearance, font: settingsFont, background: settingsBackground,
    recent: settingsRecent, shortcuts: settingsShortcuts,
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
  ].join('');
}

function settingsCaricature() {
  return [
    row('styleSet', t('settings.styleSet'), `<span class="path">${escapeHtml(t('settings.styleSetValue', { count: s().styleSet.length }))}</span>${button('open-styles', t('action.styleSet'), 'styleSet', 'small')}`, t('settings.styleSet'), 'full'),
    toggle('autoGenerate', t('settings.autoGenerate'), 'generate'),
    toggle('autoCrop', t('settings.autoCrop'), 'crop'),
    toggle('personalWarp', t('settings.personalWarp'), 'faceFind'),
    row('wStrength', t('settings.personalGain'), numberField('personalGain', s().personalGain, 0, 500, 25, '%', t('settings.personalGain')), t('settings.personalGainTip')),
    toggle('useFaceModel', t('settings.useFaceModel'), 'faceFind'),
    toggle('usePersonMask', t('settings.usePersonMask'), 'fxBackground'),
    row('photo', t('settings.workSize'), segmented('workSize', WORK_SIZES.map((n) => [n, `${n}px`]), s().workSize), t('settings.workSizeTip'), 'full'),
    row('exportImage', t('settings.exportSize'), segmented('exportSize', EXPORT_SIZES.map((n) => [n, `${n}px`]), s().exportSize), t('settings.exportSizeTip'), 'full'),
    row('vary', t('settings.varySpread'), numberField('varySpread', s().varySpread, 0, 40, 2, '%', t('settings.varySpread')), t('settings.varySpreadTip')),
    row('gallery', t('settings.galleryColumns'), segmented('galleryColumns', GALLERY_COLUMNS.map((n) => [n, n ? String(n) : t('action.columnsAuto')]), s().galleryColumns), t('settings.galleryColumns'), 'full'),
    toggle('showLandmarks', t('action.landmarks'), 'landmarks'),
    toggle('showNames', t('action.showNames'), 'rename'),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.caricatureHint'))}</span>`, t('settings.caricatureHint')),
  ].join('');
}

function settingsStart() {
  return [
    toggle('showStartPage', t('settings.showStartPage'), 'home'),
    toggle('showWelcome', t('settings.showWelcome'), 'bulb'),
    toggle('startShowRecent', t('settings.startShowRecent'), 'recent'),
    row('list', t('settings.startRecentCount'), numberField('startRecentCount', s().startRecentCount, 1, 10, 1, '', t('settings.startRecentCount'))),
    toggle('startShowFolders', t('settings.startShowFolders'), 'recentFolder'),
    toggle('startShowSamples', t('settings.startShowSamples'), 'samples'),
    toggle('startShowBackground', t('settings.startShowBackground'), 'sparkles'),
    row('home', t('settings.startOpen'), button('show-start', t('settings.startOpenButton'), 'home', 'small')),
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
      <span class="preview-chip" style="background:${custom.surface};color:${custom.text};border:1px solid ${custom.border}">${escapeHtml(t('settings.sample'))}</span>
      <span class="preview-chip" style="background:${custom.accent};color:${custom.accentText}">${escapeHtml(t('settings.themeCustom'))}</span>
      <span style="color:${custom.muted}">${escapeHtml(t('settings.fontSample'))}</span>
      <span class="grow"></span>${low.length ? `<span class="badge danger" title="${escapeHtml(t('settings.lowContrast'))}">${icon('warning')}${escapeHtml(t('settings.lowContrast'))}</span>` : `<span class="badge ok">${icon('check')}${escapeHtml(t('settings.contrastOk'))}</span>`}
    </div>`;
}

// ───────────────────────── theme dropdown (toolbar): two columns, dark | light

let pickerDone = false;
/** The toolbar's theme drop-down: a list under the button (dark | light columns), no title bar. */
function renderThemePicker() {
  const current = s().theme;
  const item = (id, glyph, swatch) => `<button class="picker-item ${current === id ? 'active' : ''}" data-pick-theme="${id}" role="menuitemradio" aria-checked="${current === id}" title="${escapeHtml(themeName(id, L()))}">
      ${swatch ? `<span class="theme-swatch">${swatch.map((color) => `<i style="background:${color}"></i>`).join('')}</span>` : icon(glyph)}
      <span class="theme-name">${escapeHtml(themeName(id, L()))}</span>${current === id ? icon('check', 'icon check') : ''}
    </button>`;
  const column = (glyph, title, list) => `<div class="picker-column"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${list.map((theme) => item(theme.id, '', theme.swatch)).join('')}</div>`;
  setOsTitle(t('theme.pickTitle'));
  root.innerHTML = `<div class="theme-dropdown" role="menu" aria-label="${escapeHtml(t('theme.pickTitle'))}">
    <div class="picker-top">${item(SYSTEM, 'sun')}${item(CUSTOM, 'palette')}</div>
    <div class="picker-columns">${column('moon', t('theme.darkGroup', { count: DARK_THEMES.length }), DARK_THEMES)}${column('sun', t('theme.lightGroup', { count: LIGHT_THEMES.length }), LIGHT_THEMES)}</div>
    <div class="picker-bottom"><button class="picker-item" data-action="random-theme" title="${escapeHtml(t('action.themeRandom'))}">${icon('dice')}<span>${escapeHtml(t('action.themeRandom'))}</span></button><button class="picker-item" data-action="edit-custom" title="${escapeHtml(t('settings.editCustom'))}">${icon('edit')}<span>${escapeHtml(t('settings.editCustom'))}</span></button></div>
  </div>`;
  const anchor = P().anchor;
  const box = root.querySelector('.theme-dropdown');
  const size = { width: POPUPS.theme.width, height: Math.ceil(box.scrollHeight) + 2 };
  if (anchor && !state.placed) {
    state.placed = true;
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
    row('sparkles', t('settings.animation'), select('data-select', 'animation', ANIMATIONS.map((a) => [a, t(`animation.${a}`)]), s().animation, t('settings.animation'), 'data-icon-prefix="anim"')
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
  ].join('');
}

function recentRows(list, { compact = false, folders = false, start = 0 } = {}) {
  if (!list.length) return `<div class="row empty">${icon('info')}<span>${escapeHtml(t(folders ? 'recent.noFolders' : 'recent.empty'))}</span></div>`;
  return list.map((item, index) => {
    const missing = state.exists[item.path] === false;
    const name = item.path.split(/[\\/]/).pop() || item.path;
    return `<div class="row recent-row ${missing ? 'missing' : ''}" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
      <span class="row-label"><b class="recent-index">${start + index + 1}</b>${icon(folders ? 'folder' : /\.mypcut$/i.test(name) ? 'gallery' : 'photo')}<span class="recent-name">${escapeHtml(name)}</span></span>
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
  ['Ctrl+O', 'action.open'], ['Ctrl+Shift+O', 'action.camera'], ['Ctrl+V', 'action.pastePhoto'], ['Ctrl+S', 'action.save'], ['Ctrl+Shift+S', 'action.saveAs'],
  ['Ctrl+E', 'action.exportImage'], ['Ctrl+Shift+E', 'action.exportAll'], ['Ctrl+Shift+C', 'action.copyImage'], ['Ctrl+P', 'action.print'], ['Ctrl+W', 'action.closePhoto'],
  ['Ctrl+Z', 'action.undo'], ['Ctrl+Y / Ctrl+Shift+Z', 'action.redo'], ['Ctrl+D', 'action.duplicate'], ['Ctrl+R', 'action.vary'], ['Ctrl+Shift+R', 'action.varyAll'],
  ['F5', 'action.generate'], ['Delete', 'action.delete'], ['F2', 'action.rename'], ['← → ↑ ↓', 'shortcut.select'], ['Enter', 'action.single'], ['Esc', 'action.gallery'],
  ['Ctrl+1', 'action.gallery'], ['Ctrl+2', 'action.single'], ['Ctrl+3', 'action.layout'], ['Ctrl+K', 'action.compare'], ['Ctrl+= / Ctrl+-', 'action.zoomIn'], ['Ctrl+0', 'action.zoomFit'], ['shortcut.wheel', 'action.zoomIn'],
  ['Ctrl+Shift+F', 'action.faceFind'], ['Ctrl+L', 'action.landmarks'], ['Ctrl+J', 'action.cropFace'], ['shortcut.dragPoint', 'shortcut.movePoint'], ['Ctrl+Shift+1 / 2', 'action.leftPanel'],
  ['Ctrl+Shift+L', 'action.language'], ['Ctrl+Shift+B', 'action.shuffleBackground'], ['Ctrl+Shift+H', 'action.startPage'], ['Ctrl+,', 'action.settings'], ['F1', 'action.about'],
];

function settingsShortcuts() {
  const [list, pager] = paged('shortcuts', SHORTCUT_LIST, 36);
  return `<div class="shortcut-grid">${list.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>${pager ? `<div class="row">${pager}</div>` : ''}`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyPhotoCut', version: VERSION, error: native.errorText(error) }));
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
    ['faceFind', t('about.faceModel'), 'MediaPipe Face Landmarker · Selfie Segmenter (Apache-2.0)'],
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
      ${shownItems.length ? `<ul class="confirm-items">${shownItems.map((item) => `<li title="${escapeHtml(item)}">${icon('photo')}<span>${escapeHtml(item || '—')}</span></li>`).join('')}${items.length > shownItems.length ? `<li>… +${items.length - shownItems.length}</li>` : ''}</ul>` : ''}
    </div>`,
    foot: `<span class="grow"></span>${(p.buttons ?? [{ id: 'ok', label: t('common.ok'), primary: true }]).map((b) => `<button class="button ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-action="choice" data-value="${escapeHtml(b.id)}" title="${escapeHtml(b.label)}">${b.icon ? icon(b.icon) : ''}<span>${escapeHtml(b.label)}</span></button>`).join('')}`,
  });
  fitHeight();
  root.querySelector('.button.primary')?.focus();
  ready();
}

function renderWelcome() {
  root.innerHTML = frame({
    glyph: 'bulb', title: t('welcome.title'),
    body: `<div class="welcome">
      <div class="about-top"><img class="about-icon small" src="${appIcon}" alt="" /><div><div class="about-name">MyPhotoCut <span class="about-version">v${escapeHtml(VERSION)}</span></div><p class="about-description">${escapeHtml(t('welcome.text'))}</p></div></div>
      <ul class="welcome-list">
        <li>${icon('faceFind')}<span>${escapeHtml(t('welcome.point1'))}</span></li>
        <li>${icon('generate')}<span>${escapeHtml(t('welcome.point2'))}</span></li>
        <li>${icon('addEffect')}<span>${escapeHtml(t('welcome.point3'))}</span></li>
      </ul>
      <label class="welcome-again" title="${escapeHtml(t('welcome.showAtStartTip'))}"><input type="checkbox" data-toggle="showWelcome" ${s().showWelcome ? 'checked' : ''} /><span>${escapeHtml(t('welcome.showAtStart'))}</span></label>
    </div>`,
    foot: `${button('choice', t('welcome.later'), 'close', '', 'later')}<span class="grow"></span>${button('choice', t('action.camera'), 'camera', '', 'camera')}${button('choice', t('welcome.sample'), 'samples', '', 'sample')}${button('choice', t('welcome.open'), 'folderOpen', 'primary', 'open')}`,
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

// ───────────────────────── export as image

function renderExport() {
  const p = P();
  if (!state.draft) state.draft = { scope: p.scope ?? 'selected', type: IMAGE_TYPES.includes(p.type) ? p.type : 'png', size: Number(p.size) || 1600, quality: Number(p.quality) || 92 };
  const d = state.draft;
  const lossy = ['jpg', 'webp', 'avif', 'pdf'].includes(d.type);
  root.innerHTML = frame({
    glyph: 'exportImage', title: t('export.title'),
    body: `<div class="editor">
      ${row('gallery', t('export.scope'), segmented('scope', [['selected', t('export.scope.selected'), 'viewSingle'], ['all', t('export.scope.all', { count: p.count ?? 0 }), 'exportAll'], ['sheet', t('export.scope.sheet'), 'contactSheet']], d.scope, 'data-draft-segment'), t('export.scope'), 'full')}
      ${row('photo', t('export.type'), select('data-draft-select', 'type', IMAGE_TYPES.map((type) => [type, `${type === 'jpg' ? 'JPEG' : type.toUpperCase()} — ${t(`export.format.${type}`)}`, 'imageFormat']), d.type, t('export.type')), t('export.type'))}
      ${row('ruler', t('export.size'), segmented('size', EXPORT_SIZES.map((n) => [n, `${n}px`]), d.size, 'data-draft-segment'), t('export.sizeTip'), 'full')}
      ${row('quality', t('export.quality'), numberField('draft:quality', d.quality, 40, 100, 2, '%', t('export.quality')).replace('class="stepper', `class="stepper${lossy ? '' : ' disabled'}`), t('export.qualityTip'))}
      <p class="muted hint">${icon('info')} ${escapeHtml(t(d.scope === 'all' ? 'export.hintAll' : d.scope === 'sheet' ? 'export.hintSheet' : 'export.hintSelected', { name: p.name ?? '' }))}</p>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('export-apply', t('export.save'), 'save', 'primary')}`,
  });
  fitHeight();
  ready();
}

// ───────────────────────── prompt (a name)

function renderPrompt() {
  const p = P();
  if (!state.draft) state.draft = { value: p.value ?? '' };
  root.innerHTML = frame({
    glyph: p.icon ?? 'edit', title: p.title ?? '',
    body: `<div class="editor">${row(p.icon ?? 'edit', p.label ?? '', `<input type="text" data-draft="value" value="${escapeHtml(state.draft.value)}" maxlength="80" aria-label="${escapeHtml(p.label ?? '')}" />`)}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('prompt-apply', t('common.ok'), 'check', 'primary')}`,
  });
  fitHeight();
  const input = root.querySelector('[data-draft="value"]');
  input?.focus();
  input?.select();
  ready();
}

// ───────────────────────── the styles a new photo gets

function renderStyles() {
  const p = P();
  if (!state.draft) state.draft = { set: new Set(Array.isArray(p.set) ? p.set : DEFAULT_STYLE_IDS) };
  const set = state.draft.set;
  root.innerHTML = frame({
    glyph: 'styleSet', title: t('styles.title'),
    body: `<p class="muted hint">${icon('info')} ${escapeHtml(t('styles.hint'))}</p>
      <div class="style-pick-grid">${STYLES.map((style) => `<button class="style-pick ${set.has(style.id) ? 'on' : ''}" data-pick-style="${style.id}" role="checkbox" aria-checked="${set.has(style.id)}" title="${escapeHtml(t(`style.${style.id}.desc`))}">
        <span class="style-pick-icon">${icon(style.icon)}</span><b>${escapeHtml(t(`style.${style.id}`))}</b><small>${escapeHtml(t(`style.${style.id}.desc`))}</small>${set.has(style.id) ? icon('check', 'icon tick') : ''}</button>`).join('')}</div>`,
    foot: `<span class="badge info">${escapeHtml(t('styles.count', { count: set.size, total: STYLES.length }))}</span>
      ${button('styles-default', t('styles.default'), 'refresh', 'small')}${button('styles-all', t('styles.all'), 'check', 'small')}
      <span class="grow"></span>${button('close', t('common.cancel'), 'close')}${p.hasDoc ? button('styles-generate', t('styles.saveGenerate'), 'generate', '', '', set.size ? '' : 'disabled') : ''}${button('styles-apply', t('common.ok'), 'check', 'primary', '', set.size ? '' : 'disabled')}`,
  });
  ready();
}

// ───────────────────────── camera (take a photo)

let cameraStream = null;
function stopCamera() {
  for (const track of cameraStream?.getTracks() ?? []) track.stop();
  cameraStream = null;
}

async function startCamera() {
  const video = root.querySelector('#camera-video');
  const status = root.querySelector('#camera-status');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('camera.unsupported'));
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' }, audio: false });
    video.srcObject = cameraStream;
    await video.play();
    status.textContent = t('camera.ready');
    root.querySelector('[data-action="camera-shoot"]').disabled = false;
  } catch (error) {
    status.textContent = `${t('camera.failed')}: ${native.errorText(error)}`;
    status.classList.add('danger-text');
  }
}

function renderCamera() {
  const mirror = state.draft?.mirror ?? true;
  state.draft ??= { mirror };
  root.innerHTML = frame({
    glyph: 'camera', title: t('camera.title'),
    body: `<div class="camera-view ${mirror ? 'mirror' : ''}"><video id="camera-video" playsinline muted></video><div class="camera-count" id="camera-count"></div></div>
      <div class="row muted"><span id="camera-status">${escapeHtml(t('camera.starting'))}</span></div>`,
    foot: `<label class="welcome-again"><input type="checkbox" data-draft-toggle="mirror" ${mirror ? 'checked' : ''} /><span>${escapeHtml(t('camera.mirror'))}</span></label>
      <span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('camera-timer', t('camera.timer'), 'clock', '')}${button('camera-shoot', t('camera.shoot'), 'camera', 'primary', '', 'disabled')}`,
  });
  ready();
  if (!cameraStream) startCamera();
  else { const video = root.querySelector('#camera-video'); video.srcObject = cameraStream; video.play().catch(() => {}); root.querySelector('[data-action="camera-shoot"]').disabled = false; root.querySelector('#camera-status').textContent = t('camera.ready'); }
}

function shoot() {
  const video = root.querySelector('#camera-video');
  if (!video?.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (state.draft?.mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0);
  close({ data: canvas.toDataURL('image/jpeg', 0.93) });
}

function shootWithTimer() {
  let n = 3;
  const count = root.querySelector('#camera-count');
  const tick = () => {
    if (!count?.isConnected) return;
    if (n === 0) { count.textContent = ''; shoot(); return; }
    count.textContent = String(n);
    n -= 1;
    setTimeout(tick, 1000);
  };
  tick();
}


// ───────────────────────── print (printer, page setup, preview; prints straight to the printer)

function printOptions() {
  if (!state.print) {
    let saved = {};
    try { saved = JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}') ?? {}; } catch { /* defaults */ }
    state.print = normalizePrintOptions({ ...saved, scope: P().scope ?? saved.scope }, L());
    state.page = 0;
  }
  return state.print;
}

function printLayoutNow() {
  return layoutPages(state.printImages ?? [], printOptions(), { title: P().docName ?? '', footerDefault: 'MyPhotoCut' });
}

function requestPrintImages() {
  state.printImages = null;
  state.printScope = printOptions().scope;
  action('print-request', { scope: state.printScope });
}

function renderPrint() {
  const o = printOptions();
  if (state.printScope !== o.scope) requestPrintImages();
  if (!state.printers) {
    state.printers = { printers: [], defaultPrinter: '' };
    native.listPrinters().then((list) => { state.printers = list; render(); }).catch(() => {});
  }
  const { printers, defaultPrinter } = state.printers;
  const layout = printLayoutNow();
  state.page = Math.max(0, Math.min(state.page, layout.pages.length - 1));
  const page = layout.pages[state.page];
  const sel = (key, values, label, glyph) => select('data-print', key, values.map(([v, text]) => [v, text, glyph]), o[key], label);
  const seg = (key, values) => segmented(key, values, o[key], 'data-print-segment');
  const check = (key, label, glyph) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-print-toggle="${key}" ${o[key] ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
  const section = (glyph, title, rows) => `<section class="print-section"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${rows.join('')}</section>`;
  const count = (state.printImages ?? []).length;
  root.innerHTML = frame({
    glyph: 'print', title: t('print.title'),
    body: `<div class="print-view photo-print">
      <div class="print-options">
        <div class="print-column">
          ${section('print', t('print.printer'), [
            printers.length
              ? row('print', t('print.printer'), sel('printer', [['', t('print.defaultPrinter', { name: defaultPrinter || '-' })], ...printers.map((name) => [name, name])], t('print.printer'), 'print'))
              : row('info', '', `<span class="muted">${escapeHtml(t('print.systemDialog'))}</span>`),
            row('duplicate', t('print.copies'), numberField('print:copies', o.copies, 1, 99, 1, '', t('print.copies'))),
          ])}
          ${section('gallery', t('print.content'), [
            row('gallery', t('print.what'), select('data-print', 'scope', [['selected', t('export.scope.selected'), 'viewSingle'], ['all', t('print.all', { count: P().count ?? 0 }), 'exportAll'], ['sheet', t('export.scope.sheet'), 'contactSheet']], o.scope, t('print.what'))),
            row('layoutGrid', t('print.perPage'), seg('perPage', [1, 2, 4, 6, 9].map((n) => [n, String(n)]))),
            check('captions', t('print.captions'), 'rename'),
            check('border', t('print.border'), 'fxFrame'),
            check('grayscale', t('print.grayscale'), 'fxGrayscale'),
          ])}
          ${section('pageSetup', t('print.page'), [
            row('file', t('print.paper'), sel('paper', Object.keys(PRINT_PAPERS).map((p) => [p, t(`print.paper.${p}`)]), t('print.paper'), 'file')),
            row('pageSetup', t('print.orientation'), seg('orientation', [['auto', t('print.auto')], ['portrait', t('print.portrait')], ['landscape', t('print.landscape')]])),
            row('fitPage', t('print.margin'), seg('margin', Object.keys(PRINT_MARGINS).map((m) => [m, t(`print.margin.${m}`)]))),
            row('zoomIn', t('print.fit'), seg('fit', [['fit', t('print.fit.fit')], ['fill', t('print.fit.fill')]])),
            row('ruler', t('print.gap'), numberField('print:gap', o.gap, 0, 30, 1, 'mm', t('print.gap'))),
            check('header', t('print.header'), 'notes'),
            row('edit', t('print.headerText'), `<input type="text" data-print-text="headerText" value="${escapeHtml(o.headerText)}" placeholder="${escapeHtml(P().docName ?? '')}" title="${escapeHtml(t('print.headerText'))}" />`),
            check('footer', t('print.footer'), 'pageSetup'),
          ])}
        </div>
      </div>
      <div class="print-preview" id="print-preview">
        ${!state.printImages ? `<div class="preview-empty"><span class="cari-spinner small"></span><span>${escapeHtml(t('print.preparing'))}</span></div>`
          : page ? `<div class="preview-stage">${pageHtml(page, layout)}</div>` : `<div class="preview-empty">${icon('info')}<span>${escapeHtml(t('print.empty'))}</span></div>`}
      </div>
    </div>
    <div class="print-sheet" aria-hidden="true">${state.printImages ? layout.pages.map((p) => `<div class="print-page">${pageHtml(p, layout)}</div>`).join('') : ''}</div>`,
    foot: `<button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number">${escapeHtml(t('print.pageOf', { n: layout.pages.length ? state.page + 1 : 0, total: state.printImages ? layout.pages.length : 0 }))}</span>
      <button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= layout.pages.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
      <span class="muted">${escapeHtml(t('print.summary', { pictures: count, paper: `${layout.paper.width.toFixed(0)} × ${layout.paper.height.toFixed(0)} mm` }))}</span>
      <span class="grow"></span>
      ${button('close', t('common.close'), 'close')}
      <button class="button primary" data-action="print" title="${escapeHtml(t('print.print'))}" ${state.printImages?.length && !state.printing ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(state.printing ? t('print.printing') : t('print.print'))}</span></button>`,
  });
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  style.textContent = `@page { size: ${layout.paper.width}mm ${layout.paper.height}mm; margin: 0; }
@media print { .print-sheet .print-page { width: ${layout.paper.width}mm; height: ${layout.paper.height - 0.5}mm; } }`;
  fitPrintPreview();
  ready();
}

function fitPrintPreview() {
  const area = root.querySelector('#print-preview');
  const stage = area?.querySelector('.preview-stage');
  const sheet = stage?.querySelector('.pp-page');
  if (!sheet) return;
  stage.style.transform = 'none';
  const box = area.getBoundingClientRect();
  const w = sheet.offsetWidth;
  const h = sheet.offsetHeight;
  const scale = Math.min((box.width - 32) / w, (box.height - 32) / h);
  Object.assign(stage.style, { transform: `scale(${scale})`, width: `${w}px`, height: `${h}px`, left: `${(box.width - w * scale) / 2}px`, top: `${(box.height - h * scale) / 2}px` });
}

function changePrint(patch) {
  state.print = normalizePrintOptions({ ...printOptions(), ...patch }, L());
  try { globalThis.localStorage?.setItem(PRINT_KEY, JSON.stringify(state.print)); } catch { /* ignore */ }
  render();
}

async function doPrint() {
  const layout = printLayoutNow();
  const o = printOptions();
  if (!layout.pages.length) return;
  state.printing = true;
  render();
  // The sheet's pictures must be decoded before the printer gets the page.
  await Promise.all([...root.querySelectorAll('.print-sheet img')].map((img) => img.decode().catch(() => {})));
  try {
    const job = { printer: state.printers?.printers.includes(o.printer) ? o.printer : '', copies: o.copies, widthMm: layout.paper.width, heightMm: layout.paper.height };
    if (window.__myphotocutPrintHook) await window.__myphotocutPrintHook(layout, job);
    else if (state.printers?.printers.length) await native.printDirect(job);
    else await native.printWindow();
    action('printed', { printer: job.printer || state.printers?.defaultPrinter || '', pages: layout.pages.length * o.copies });
  } catch (error) {
    action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
  } finally {
    state.printing = false;
    render();
  }
}

// ───────────────────────── menu
//
// A menu is a panel in this popup (transparent window where possible, each panel draws its own shadow).

const menuGlass = !desktop || !/Mac/i.test(navigator.platform);
const MENU_MARGIN = menuGlass ? 10 : 0;
if (kind === 'menu' && menuGlass) document.documentElement.classList.add('menu-glass');
let menuPanels = [];

function menuPanelHtml(items, level, label) {
  return `<div class="popup-menu" role="menu" data-level="${level}" aria-label="${escapeHtml(label ?? '')}">${items.map((item, index) => (item.separator
    ? '<div class="menu-sep" role="separator"></div>'
    : `<button class="menu-item ${item.danger ? 'danger' : ''}" role="menuitem" data-index="${index}" data-id="${escapeHtml(item.id)}" ${item.disabled ? 'disabled aria-disabled="true"' : ''} title="${escapeHtml(item.label)}">
        <span class="menu-icon">${icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key">${escapeHtml(item.shortcut ?? '')}</span>
        <span class="menu-check">${item.checked ? icon('check') : ''}</span>
      </button>`)).join('')}</div>`;
}

function placeMenuWindow(x, y, width, height, flipY = null) {
  if (desktop) native.invoke('place_popup', { x, y, width, height, flipY, show: true }).then(() => window.focus()).catch(() => {});
  else send('place', { x, y, width, height, flipY });
}

let menuOpen = false;
const loadedAt = Date.now();
const shownOnce = () => (Number(P().at) || 0) >= loadedAt - 60_000;

function renderMenu() {
  const p = P();
  if (p.prewarm || !Array.isArray(p.items) || !shownOnce()) return;
  setOsTitle(p.header?.title);
  root.innerHTML = '<div class="menu-stack"></div>';
  root.querySelector('.menu-stack').insertAdjacentHTML('beforeend', menuPanelHtml(p.items, 0, p.header?.title));
  const el = root.querySelector('.popup-menu');
  const w = Math.ceil(el.offsetWidth);
  const h = Math.ceil(el.offsetHeight);
  el.style.left = `${MENU_MARGIN}px`;
  el.style.top = `${MENU_MARGIN}px`;
  menuPanels = [{ el, items: p.items, w, h }];
  const anchor = p.anchor ?? { x: 100, y: 100 };
  placeMenuWindow(anchor.x - MENU_MARGIN, anchor.y - MENU_MARGIN, w + 2 * MENU_MARGIN, h + 2 * MENU_MARGIN, anchor.flipY != null ? anchor.flipY + MENU_MARGIN : null);
  menuOpen = true;
}

async function chooseMenu(id) {
  if (!menuOpen) return;
  menuOpen = false;
  await hide({ id });
}

function moveMenuFocus(direction) {
  const items = [...(menuPanels[0]?.el.querySelectorAll('.menu-item:not([disabled])') ?? [])];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement);
  items[(current + direction + items.length) % items.length].focus();
}

root.addEventListener('pointerdown', (event) => {
  if (kind === 'menu' && menuOpen && !event.target.closest('.popup-menu')) chooseMenu(null);
});

// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-theme-group], [data-pick-theme], [data-draft-segment], [data-pick-style], [data-print-segment]');
  if (!target || target.disabled) return undefined;
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id);
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const raw = target.dataset.value;
    return update({ [key]: typeof s()[key] === 'number' ? Number(raw) : raw });
  }
  if (target.dataset.themeGroup) { state.themeGroup = target.dataset.themeGroup; return render(); }
  if (target.dataset.pickTheme) { pickerDone = true; return close({ theme: target.dataset.pickTheme }); }
  if (target.dataset.printSegment) { const key = target.dataset.printSegment; return changePrint({ [key]: key === 'perPage' ? Number(target.dataset.value) : target.dataset.value }); }
  if (target.dataset.pickStyle) {
    const set = state.draft.set;
    if (set.has(target.dataset.pickStyle)) set.delete(target.dataset.pickStyle); else set.add(target.dataset.pickStyle);
    return render();
  }
  const d = state.draft;
  if (target.dataset.draftSegment) {
    const key = target.dataset.draftSegment;
    d[key] = key === 'size' ? Number(target.dataset.value) : target.dataset.value;
    return render();
  }
  const value = target.dataset.value;
  const styleSet = () => STYLES.map((x) => x.id).filter((id) => d.set.has(id));
  switch (target.dataset.action) {
    case 'close':
      if (kind === 'menu') return chooseMenu(null);
      return close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null);
    case 'tab': state.tab = value; return render();
    case 'tabs-scroll': return scrollPopupTabs(Number(value));
    case 'pager': { const [name, step] = value.split(':'); state.pager[name] = (state.pager[name] ?? 0) + Number(step); return render(); }
    case 'choice': return close({ choice: value });
    case 'reset-settings': {
      const keep = { backgroundImage: s().backgroundImage, backgroundName: s().backgroundName, lastDirectory: s().lastDirectory, language: s().language, styleSet: s().styleSet };
      return update({ ...defaultSettings(s().language), ...keep });
    }
    case 'open-styles': await action('open-styles'); return undefined;
    case 'choose-background': return action('choose-background');
    case 'clear-background': return action('clear-background');
    case 'shuffle-background': return action('shuffle-background');
    case 'show-start': return action('show-start');
    case 'open-recent': await action('open-recent', { path: value }); return kind === 'recent' ? close() : undefined;
    case 'open-folder': await action('open-folder', { path: value }); return kind === 'recent' ? close() : undefined;
    case 'remove-recent': storeRecent(globalThis.localStorage, removeRecent(loadRecent(globalThis.localStorage), value)); return render();
    case 'remove-folder': storeRecentDirs(globalThis.localStorage, removeRecent(loadRecentDirs(globalThis.localStorage), value)); return render();
    case 'clear-recent': storeRecent(globalThis.localStorage, []); return render();
    case 'clear-folders': storeRecentDirs(globalThis.localStorage, []); return render();
    case 'copy-error':
      try { await copyText(errorReport()); state.copied = true; render(); } catch (error) { root.querySelector('#copy-state').textContent = `${t('error.copyFailed')}: ${native.errorText(error)}`; }
      return undefined;
    case 'copy-about':
      return copyText([...root.querySelectorAll('#about-rows dt')].map((dt) => `${dt.textContent.trim()}: ${dt.nextElementSibling.textContent.trim()}`).join('\n')).then(() => action('notice', { kind: 'success', text: t('error.copied') }));
    case 'use-custom': return update({ theme: CUSTOM });
    case 'copy-theme': { const from = resolveTheme(s().theme === CUSTOM ? 'light' : s().theme, prefersDark(), s().customTheme); return update({ customTheme: customFrom(from) }); }
    case 'edit-custom': pickerDone = true; await action('open-settings', { tab: 'appearance', themeGroup: 'custom' }); return close();
    case 'random-theme': { const all = [...LIGHT_THEMES, ...DARK_THEMES].map((theme) => theme.id).filter((id) => id !== s().theme); pickerDone = true; return close({ theme: all[Math.floor(Math.random() * all.length)] }); }
    case 'export-apply': return close({ scope: d.scope, type: d.type, size: d.size, quality: d.quality });
    case 'prompt-apply': return close({ value: d.value });
    case 'styles-default': d.set = new Set(CLASSIC_STYLE_IDS); return render();
    case 'styles-all': d.set = new Set(STYLES.map((x) => x.id)); return render();
    case 'styles-apply': return close({ set: styleSet() });
    case 'styles-generate': return close({ set: styleSet(), generate: true });
    case 'page': state.page += Number(value); return render();
    case 'print': return doPrint();
    case 'camera-shoot': return shoot();
    case 'camera-timer': return shootWithTimer();
    default: return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.toggle) return update({ [target.dataset.toggle]: target.checked });
  if (target.dataset.select) { const key = target.dataset.select; return update({ [key]: typeof s()[key] === 'number' ? Number(target.value) : target.value }); }
  if (target.dataset.customColor) return update({ customTheme: { ...s().customTheme, [target.dataset.customColor]: target.value }, theme: CUSTOM });
  if ('customDark' in target.dataset) return update({ customTheme: { ...s().customTheme, dark: target.checked }, theme: CUSTOM });
  if (target.dataset.print) return changePrint({ [target.dataset.print]: target.value });
  if (target.dataset.printToggle) return changePrint({ [target.dataset.printToggle]: target.checked });
  if (target.dataset.printText) return changePrint({ [target.dataset.printText]: target.value });
  if (target.dataset.draftSelect && state.draft) { state.draft[target.dataset.draftSelect] = target.value; return render(); }
  if (target.dataset.draftToggle) {
    state.draft[target.dataset.draftToggle] = target.checked;
    root.querySelector('.camera-view')?.classList.toggle('mirror', state.draft.mirror);
    return undefined;
  }
  return undefined;
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.draft && state.draft) state.draft[target.dataset.draft] = target.value;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (kind === 'menu') chooseMenu(null);
    else if (kind !== 'progress') close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null);
  }
  if (kind === 'print' && event.key === 'PageDown') { state.page += 1; render(); }
  if (kind === 'print' && event.key === 'PageUp') { state.page -= 1; render(); }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    if (event.key === 'Enter' && document.activeElement?.classList.contains('menu-item')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id); }
  }
  if (kind === 'camera' && event.key === ' ' && !event.repeat) { event.preventDefault(); shoot(); }
  if (event.key === 'Enter' && event.target.matches?.('input[type="text"]') && !event.target.matches('.stepper-value')) {
    const primary = { prompt: 'prompt-apply' }[kind];
    if (primary) {
      event.preventDefault();
      event.target.dispatchEvent(new Event('input', { bubbles: true }));
      root.querySelector(`[data-action="${primary}"]`)?.click();
    }
  }
});
document.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('textarea, input')) event.preventDefault();
});

function regainedFromMain(lostAt) {
  if (!desktop) return false;
  const time = (key) => { try { return Number(globalThis.localStorage?.getItem(key)) || 0; } catch { return 0; } };
  if (time('myphotocut.main.focus') < lostAt - 100 || time('myphotocut.main.input') >= lostAt - 400) return false;
  window.focus();
  native.invoke('popup_ready').catch(() => {});
  return true;
}

window.addEventListener('blur', () => {
  const lostAt = Date.now();
  if (kind === 'theme' && !pickerDone) setTimeout(() => { if (!document.hasFocus() && !pickerDone && !regainedFromMain(lostAt)) { pickerDone = true; close(); } }, 150);
  if (kind === 'menu' && menuOpen) setTimeout(() => { if (!document.hasFocus() && menuOpen && !regainedFromMain(lostAt)) chooseMenu(null); }, 150);
});

bindSteppers(root, (key, value) => {
  const [scope, field] = key.includes(':') ? key.split(':') : ['setting', key];
  if (scope === 'setting') update({ [field]: value });
  else if (scope === 'draft' && state.draft) state.draft[field] = value;
  else if (scope === 'print') changePrint({ [field]: value });
  return undefined;
});

if (desktop) {
  root.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !event.target.closest?.('[data-window-drag]') || event.target.closest('button, input, select, textarea')) return;
    event.preventDefault();
    native.invoke('window_drag', {}).catch(() => {});
  });
}

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
    if (!['menu', 'camera', 'image', 'styles', 'prompt', 'print'].includes(kind)) render();
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
  } else if (message?.type === 'print-images' && kind === 'print') {
    if (message.scope === state.printScope) { state.printImages = Array.isArray(message.images) ? message.images : []; state.page = 0; render(); }
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
  state.pager = {};
  state.draft = null;
  if (kind === 'theme') { state.placed = false; pickerDone = false; }
  if (kind === 'print') { state.print = null; state.printImages = null; state.printScope = null; }
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
    if (event.origin === location.origin && event.data?.myphotocutHost) onHostMessage(event.data);
  });
}
window.addEventListener('pagehide', stopCamera);
window.addEventListener('resize', () => { if (kind === 'print') fitPrintPreview(); });

applyLook();
render();

// Test hook: state and actions of this popup.
window.__myphotocutPopup = { kind, state, render, close, errorReport, refresh, samples: SAMPLE_PHOTOS.map(sampleUrl) };

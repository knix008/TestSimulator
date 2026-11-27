// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web build, tutorial: ?popup=<kind>). Every
// popup has a fixed size chosen so its content fits without scrolling; long
// content is split into tabs or pages, and each item takes one line.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { loadRecent, loadRecentDirs, MAX_RECENT, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, BACKGROUND_FITS, BACKGROUND_KINDS, defaultSettings, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, loadSettings,
  RECENT_DIRS_KEY, RECENT_KEY, STORAGE_KEY, storeSettings, ZOOM, ANIMATION_INTERVALS, EDITOR_FONT,
  NOTE_MODES, READING_THEMES, READING_FONTS, FOCUS_MODES,
} from './domain/settings.js';
import { aiSettingsHtml, bindAiSettings } from './ai/settings-ui.js';
import './ai/ai.css';
import './app.css';
import './print/print.css';
import { fitPreview, layoutPreview, MARGINS, normalizePrint, PAPERS, pageAtTop, pageCss, parseRanges, rangesText, sheetOf, showPage } from './print/printwin.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { forPopup, POPUPS, popupParams } from './platform/popups.js';
import {
  applyFont, applyTheme, contrast, CUSTOM, CUSTOM_KEYS, customFrom, DARK_THEMES, LIGHT_THEMES, resolveTheme, SYSTEM, themeName,
} from './themes.js';
import { bindSteppers, stepperHtml } from './stepper.js';
import { intervalLabel } from './ui/startpage.js';

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
  globalThis.parent?.postMessage({ mymarkdown: true, kind, type, data }, location.origin);
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
  // The host may wait for this (popups.whenDrawn), e.g. before making the next window.
  if (kind !== 'progress') requestAnimationFrame(() => send('drawn'));
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
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  applyLook();
  render();
}

window.addEventListener('error', (event) => { if (/^ResizeObserver loop/.test(String(event.message ?? ''))) return; action('report-error', { message: String(event.error?.message ?? event.message), detail: String(event.error?.stack ?? ''), context: `popup-${kind}` }); });
window.addEventListener('unhandledrejection', (event) => action('report-error', { message: native.errorText(event.reason), detail: String(event.reason?.stack ?? ''), context: `popup-${kind}` }));

// ───────────────────────── frame

let osTitle = '';
function setOsTitle(title) {
  if (!desktop || !title || title === osTitle) return;
  osTitle = title;
  appWindow.setTitle(`${title} — MyMarkdownMaster v${VERSION}`).catch(() => {});
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

// A dropdown in a row shows the row's icon on its items unless it names its own (ui/dropdown.js).
const withIcon = (control, glyph) => (glyph ? String(control).replace(/<select(?![^>]*data-icon=)/g, `<select data-icon="${glyph}"`) : control);
const row = (glyph, label, control, title = label, cls = '') => `<div class="row ${cls}" title="${escapeHtml(title)}"><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control">${withIcon(control, glyph)}</span></div>`;

/** [−] value [+] for a number. */
const numberField = (key, value, min, max, step, unit, label) => stepperHtml({
  key, value, min, max, step, unit, label,
  decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }),
});

const toggle = (key, label, glyph, checked = s()[key], attr = 'data-toggle') => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" ${attr}="${key}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);

const segmented = (key, options, current, attr = 'data-setting') => `<span class="segmented" role="radiogroup">${options.map(([value, label, glyph]) => `
  <button class="segment ${String(current) === String(value) ? 'active' : ''}" role="radio" aria-checked="${String(current) === String(value)}" ${attr}="${key}" data-value="${escapeHtml(value)}" title="${escapeHtml(label)}">${glyph ? icon(glyph) : ''}${escapeHtml(label)}</button>`).join('')}</span>`;

const select = (attrName, key, options, current, label, extra = '') => `<select ${attrName}="${key}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${extra}>${options.map(([value, text, glyph]) => `<option value="${escapeHtml(value)}"${glyph ? ` data-icon="${glyph}"` : ''} ${String(current) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;

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
      menu: renderMenu, welcome: renderWelcome, color: renderColor, prompt: renderPrompt, print: renderPrint, suggest: renderSuggest,
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
  ['editor', 'editMode', 'settings.editor'],
  ['reading', 'readingTheme', 'settings.reading'],
  ['files', 'filesList', 'settings.files'],
  ['notes', 'calendar', 'settings.notes'],
  ['writing', 'spellCheck', 'settings.writing'],
  ['export', 'exportFile', 'settings.export'],
  ['ai', 'aiSpark', 'settings.ai'],
  ['appearance', 'palette', 'settings.theme'],
  ['font', 'font', 'settings.font'],
  ['start', 'home', 'settings.startPage'],
  ['background', 'sparkles', 'settings.background'],
  ['recent', 'recent', 'settings.recent'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

let aiBinding = null;
function renderSettings() {
  aiBinding?.destroy?.();
  aiBinding = null;
  const body = {
    general: settingsGeneral, editor: settingsEditor, reading: settingsReading, files: settingsFiles, notes: settingsNotes, writing: settingsWriting,
    export: settingsExport, ai: () => aiSettingsHtml(s().ai, t), start: settingsStart, appearance: settingsAppearance, font: settingsFont,
    background: settingsBackground, recent: settingsRecent, shortcuts: settingsShortcuts,
  }[state.tab]?.() ?? '';
  root.innerHTML = frame({
    glyph: 'gear', title: t('settings.title'), tabs: tabsHtml(SETTINGS_TABS.map(([id, glyph, key]) => [id, glyph, t(key)]), state.tab),
    body: `<div class="settings-page settings-${state.tab}">${body}</div>`,
    foot: `${button('reset-settings', t('settings.reset'), 'refresh')}<span class="grow"></span>${button('close', t('common.done'), 'check', 'primary')}`,
  });
  if (['font', 'editor'].includes(state.tab) && !state.fonts && !state.fontError) loadFonts();
  if (state.tab === 'ai') {
    // The AI tab draws and saves itself (its later answers — models, connection tests — land in this element).
    aiBinding = bindAiSettings(root.querySelector('.settings-ai'), {
      get: () => s().ai,
      set: (ai) => { state.settings = { ...state.settings, ai }; storeSettings(globalThis.localStorage, state.settings); },
      t,
    });
  }
  ready();
}

function settingsGeneral() {
  return [
    row('globe', t('settings.language'), segmented('language', [['ko', '한국어'], ['en', 'English']], s().language)),
    toggle('restoreSession', t('settings.restoreSession'), 'refresh'),
    toggle('autosave', t('settings.autosave'), 'save'),
    row('clock', t('settings.autosaveDelay'), numberField('autosaveDelay', s().autosaveDelay, 300, 30000, 100, 'ms', t('settings.autosaveDelay'))),
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
    toggle('showWelcome', t('settings.showWelcome'), 'bulb'),
    toggle('startShowRecent', t('settings.startShowRecent'), 'recent'),
    row('list', t('settings.startRecentCount'), numberField('startRecentCount', s().startRecentCount, 1, 10, 1, '', t('settings.startRecentCount'))),
    toggle('startShowSamples', t('settings.startShowSamples'), 'samples'),
    toggle('startShowTemplates', t('settings.startShowTemplates'), 'template'),
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
    row('editorText', t('settings.editorFontSize'), numberField('editorFontSize', s().editorFontSize, EDITOR_FONT.min, EDITOR_FONT.max, 1, 'px', t('settings.editorFontSize'))),
    `<div class="row font-sample" style="font-family:var(--font-family);font-size:${s().fontSize}px;font-weight:${s().fontWeight};font-style:${s().fontStyle}">${escapeHtml(t('settings.fontSample'))}</div>`,
  ].join('');
}

async function loadFonts() {
  try {
    state.fonts = await native.listFonts();
  } catch (error) {
    state.fontError = native.errorText(error);
  }
  if (['font', 'typography', 'pages'].includes(state.tab)) render();
}

function settingsBackground() {
  const name = s().backgroundName || (s().backgroundImage ? s().backgroundImage : t('settings.bgNone'));
  return [
    row('layers', t('settings.bgKind'), segmented('backgroundKind', BACKGROUND_KINDS.map((k) => [k, t(`bgKind.${k}`)]), s().backgroundKind), t('settings.bgKind'), 'full'),
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
    row('info', '', `<span class="muted">${escapeHtml(t('settings.bgHint'))}</span>`, t('settings.bgHint')),
  ].join('');
}

function recentRows(list, { compact = false, start = 0 } = {}) {
  if (!list.length) return `<div class="row empty">${icon('info')}<span>${escapeHtml(t(desktop ? 'recent.empty' : 'recent.emptyWeb'))}</span></div>`;
  return list.map((item, index) => {
    const name = item.title || item.path;
    return `<div class="row recent-row" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
      <span class="row-label"><b class="recent-index">${start + index + 1}</b>${icon(item.kind === 'folder' ? 'folder' : 'markdownFile')}<span class="recent-name">${escapeHtml(name)}</span></span>
      <span class="recent-path">${escapeHtml(item.path)}</span>
      ${compact ? '' : button('open-recent', t('recent.open'), 'folderOpen', 'small', item.path, `data-kind="${item.kind}"`)}
      <button class="icon-button" data-action="remove-recent" data-kind="${item.kind}" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('trash')}</button>
    </div>`;
  }).join('');
}

/** Files and folders, newest first. */
const recentAll = () => [...loadRecentDirs(globalThis.localStorage).map((x) => ({ ...x, kind: 'folder' })), ...loadRecent(globalThis.localStorage).map((x) => ({ ...x, kind: 'file' }))].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

function settingsRecent() {
  const list = recentAll();
  const [files, filePager] = paged('settings-recent', list, 10);
  return `<h3 class="section-title">${icon('recent')}${escapeHtml(t('start.recent'))} <span class="muted">(${list.length}/${MAX_RECENT * 2})</span>${filePager}<span class="grow"></span>${button('clear-recent', t('recent.clear'), 'clearHistory', 'small danger', '', list.length ? '' : 'disabled')}</h3>
    ${recentRows(files, { compact: true, start: (state.pager['settings-recent'] ?? 0) * 10 })}`;
}

// ───────────────────────── the vault, the editor, reading, writing, exports

const textField = (key, placeholder = '') => `<input type="text" data-setting-text="${key}" value="${escapeHtml(s()[key] ?? '')}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" />`;
const hint = (key) => row('info', '', `<span class="muted">${escapeHtml(t(key))}</span>`, t(key));
const section = (glyph, key) => `<h3 class="section-title">${icon(glyph)}<span>${escapeHtml(t(key))}</span></h3>`;
const MODE_ICONS = { live: 'editMode', source: 'markdownFile', reading: 'preview', split: 'splitView' };

function uiFontSelect(key, emptyLabel) {
  const fonts = state.fonts ?? [];
  const current = s()[key] ?? '';
  const list = current && !fonts.includes(current) ? [current, ...fonts] : fonts;
  return `<select data-select="${key}" data-icon="font" aria-label="${escapeHtml(emptyLabel)}"><option value="">${escapeHtml(emptyLabel)}</option>${list.map((f) => `<option value="${escapeHtml(f)}" ${f === current ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}</select>`;
}

function settingsEditor() {
  return [
    row('editMode', t('settings.defaultMode'), segmented('defaultMode', NOTE_MODES.map((m) => [m, t(`mode.${m}`), MODE_ICONS[m]]), s().defaultMode)),
    row('fontSize', t('settings.editorFontSize'), numberField('editorFontSize', s().editorFontSize, EDITOR_FONT.min, EDITOR_FONT.max, 1, 'px', t('settings.editorFontSize'))),
    row('font', t('settings.editorFont'), uiFontSelect('editorFontFamily', t('settings.fontDefault'))),
    row('lineSpacing', t('settings.lineHeight'), numberField('lineHeight', s().lineHeight, 1, 3, 0.05, '', t('settings.lineHeight'))),
    toggle('readableLineLength', t('view.readable'), 'readableWidth'),
    row('readableWidth', t('settings.maxWidth'), numberField('maxWidth', s().maxWidth, 480, 1600, 20, 'px', t('settings.maxWidth'))),
    toggle('lineNumbers', t('view.lineNumbers'), 'lineNumbers'),
    toggle('foldGutter', t('settings.foldGutter'), 'fold'),
    toggle('syncScroll', t('view.syncScroll'), 'syncScroll'),
    toggle('autoPair', t('settings.autoPair'), 'code'),
    toggle('spellcheck', t('settings.spellcheck'), 'spellCheck'),
    row('indent', t('settings.tabSize'), numberField('tabSize', s().tabSize, 1, 8, 1, '', t('settings.tabSize'))),
    toggle('indentWithTabs', t('settings.indentWithTabs'), 'indent'),
    toggle('codeWrap', t('settings.codeWrap'), 'codeBlock'),
  ].join('');
}

function settingsReading() {
  return [
    row('readingTheme', t('settings.readingTheme'), select('data-select', 'readingTheme', READING_THEMES.map((id) => [id, t(`readingTheme.${id}`), 'readingTheme']), s().readingTheme, t('settings.readingTheme'))),
    row('font', t('settings.readingFont'), select('data-select', 'readingFont', READING_FONTS.map((id) => [id, t(`readingFont.${id}`), 'font']), s().readingFont, t('settings.readingFont'))),
    row('readableWidth', t('settings.readingPadding'), segmented('readingPadding', ['compact', 'normal', 'roomy'].map((id) => [id, t(`readingPadding.${id}`)]), s().readingPadding)),
    row('readableWidth', t('settings.readingWidth'), numberField('readingWidth', s().readingWidth, 480, 1600, 20, 'px', t('settings.readingWidth'))),
    row('fontSize', t('settings.readingFontSize'), numberField('readingFontSize', s().readingFontSize, 10, 32, 1, 'px', t('settings.readingFontSize'))),
    toggle('hoverNeedsMod', t('settings.hoverNeedsMod'), 'preview'),
    hint('settings.readingHint'),
  ].join('');
}

function settingsFiles() {
  return [
    row('fileNew', t('settings.newNoteLocation'), select('data-select', 'newNoteLocation', [['current', t('settings.loc.current'), 'folderOpen'], ['root', t('settings.loc.root'), 'vault'], ['folder', t('settings.loc.folder'), 'folder']], s().newNoteLocation, t('settings.newNoteLocation'))),
    row('folder', t('settings.newNoteFolder'), textField('newNoteFolder', t('settings.folderPh'))),
    row('picture', t('settings.attachmentLocation'), select('data-select', 'attachmentLocation', [['subfolder', t('settings.att.subfolder'), 'folderAdd'], ['same', t('settings.att.same'), 'folderOpen'], ['root', t('settings.loc.root'), 'vault'], ['folder', t('settings.loc.folder'), 'folder']], s().attachmentLocation, t('settings.attachmentLocation'))),
    row('folderAdd', t('settings.attachmentSubfolder'), textField('attachmentSubfolder', 'attachments')),
    row('folder', t('settings.attachmentFolder'), textField('attachmentFolder', 'attachments')),
    toggle('updateLinks', t('settings.updateLinks'), 'hyperlink'),
    toggle('useWikiLinks', t('settings.useWikiLinks'), 'wikiLink'),
    ...(desktop ? [row('trash', t('settings.deleteMode'), select('data-select', 'deleteMode', [['system', t('settings.del.system'), 'trash'], ['vault', t('settings.del.vault'), 'folder'], ['permanent', t('settings.del.permanent'), 'close']], s().deleteMode, t('settings.deleteMode')))] : []),
    toggle('showAllFiles', t('settings.showAllFiles'), 'file'),
  ].join('');
}

function settingsNotes() {
  return [
    section('calendar', 'settings.daily'),
    row('folder', t('settings.dailyFolder'), textField('dailyFolder', t('settings.folderPh'))),
    row('calendar', t('settings.dailyFormat'), textField('dailyFormat', 'YYYY-MM-DD')),
    row('template', t('settings.dailyTemplate'), textField('dailyTemplate', 'Templates/Daily note')),
    toggle('openDailyOnStart', t('settings.openDailyOnStart'), 'calendar'),
    section('template', 'settings.templates'),
    row('folder', t('settings.templateFolder'), textField('templateFolder', 'Templates')),
    row('calendar', t('settings.templateDateFormat'), textField('templateDateFormat', 'YYYY-MM-DD')),
    row('clock', t('settings.templateTimeFormat'), textField('templateTimeFormat', 'HH:mm')),
    section('idCard', 'settings.unique'),
    row('idCard', t('settings.uniqueFormat'), textField('uniqueFormat', 'YYYYMMDDHHmm')),
    row('folder', t('settings.uniqueFolder'), textField('uniqueFolder', t('settings.folderPh'))),
    row('template', t('settings.uniqueTemplate'), textField('uniqueTemplate', '')),
    hint('settings.formatHint'),
  ].join('');
}

function settingsWriting() {
  return [
    row('focus', t('write.focus'), segmented('focusMode', FOCUS_MODES.map((m) => [m, t(`settings.focus.${m}`)]), s().focusMode)),
    toggle('typewriter', t('write.typewriter'), 'typewriter'),
    toggle('smartPunctuation', t('write.smartPunctuation'), 'quote'),
    toggle('showStyleCheck', t('write.styleCheck'), 'spellCheck'),
    row('globe', t('settings.styleLanguage'), segmented('styleLanguage', [['auto', t('settings.styleAuto')], ['ko', '한국어'], ['en', 'English']], s().styleLanguage)),
    row('warning', t('settings.longSentence'), numberField('longSentence', s().longSentence, 10, 200, 5, t('goal.words'), t('settings.longSentence'))),
    toggle('highlightSyntax', t('write.syntax'), 'syntax'),
    section('history', 'settings.recovery'),
    row('clock', t('settings.recoveryInterval'), numberField('recoveryInterval', s().recoveryInterval, 0, 120, 1, t('settings.minutes'), t('settings.recoveryInterval'))),
    row('history', t('settings.recoveryKeep'), numberField('recoveryKeep', s().recoveryKeep, 1, 500, 5, '', t('settings.recoveryKeep'))),
  ].join('');
}

function settingsExport() {
  const o = s().exportOptions ?? {};
  const optToggle = (key, label, glyph) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-export-opt="${key}" ${o[key] ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
  return [
    optToggle('toc', t('settings.exportToc'), 'structureTree'),
    optToggle('numberHeadings', t('settings.exportNumbering'), 'numbering'),
    optToggle('embedImages', t('settings.exportEmbedImages'), 'picture'),
    row('fitPage', t('settings.exportPage'), `<span class="segmented">${['A4', 'Letter'].map((v) => `<button class="segment ${o.pageSize === v ? 'active' : ''}" data-export-set="pageSize" data-value="${v}">${v}</button>`).join('')}</span>`),
    row('exportAgain', t('action.exportAgain'), `<span class="muted">${escapeHtml(s().lastExport ? `${t(`export.${s().lastExport.format}`)}${s().lastExport.path ? ` → ${s().lastExport.path}` : ''}` : t('common.none'))}</span>`),
    hint('settings.exportHint'),
  ].join('');
}

export const SHORTCUT_LIST = [
  ['Ctrl+N', 'action.newNote'], ['Ctrl+O', 'action.quickSwitcher'], ['Ctrl+P', 'action.commandPalette'], ['Ctrl+Shift+O', 'vault.openFolder'], ['Ctrl+S', 'action.save'], ['Ctrl+Alt+S', 'action.saveAll'],
  ['Ctrl+Shift+F', 'action.searchVault'], ['Ctrl+F', 'action.find'], ['Ctrl+H', 'action.replace'], ['Ctrl+G', 'graph.open'], ['Alt+D', 'action.dailyNote'], ['Alt+T', 'action.insertTemplate'],
  ['Ctrl+1 / 2 / 3 / 4', 'shortcut.modes'], ['Ctrl+E', 'mode.toggle'], ['Ctrl+\\', 'pane.splitRight'], ['Ctrl+Shift+\\', 'pane.splitDown'], ['Ctrl+W', 'tab.close'], ['Ctrl+Tab', 'tab.next'],
  ['Alt+← / →', 'shortcut.navigate'], ['Ctrl+B / I', 'shortcut.boldItalic'], ['Ctrl+K', 'md.link'], ['Ctrl+L', 'md.task'], ['Ctrl+Shift+H', 'md.highlight'], ['[[', 'shortcut.wikiLink'],
  ['/', 'shortcut.slash'], ['F2', 'file.rename'], ['F5 / Shift+F5', 'shortcut.present'], ['F7', 'write.styleCheck'], ['F8', 'write.focus'], ['F9', 'write.typewriter'],
  ['F11', 'view.fullscreen'], ['Ctrl+Alt+E', 'action.exportAgain'], ['Ctrl+Shift+P', 'action.print'], ['Ctrl+Shift+A', 'ai.panel'], ['Ctrl+= / Ctrl+-', 'shortcut.zoom'], ['Ctrl+Shift+1 / 2', 'shortcut.panels'],
  ['Ctrl+J', 'action.bottomPanel'], ['Ctrl+Shift+L', 'action.language'], ['Ctrl+Shift+H', 'action.startPage'], ['Ctrl+,', 'action.settings'], ['Shift+F1', 'action.tutorial'], ['F1', 'action.about'],
];

function settingsShortcuts() {
  // Every shortcut on one page (two columns), no paging.
  const list = SHORTCUT_LIST;
  const pager = '';
  return `<div class="shortcut-grid">${list.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>${pager ? `<div class="row">${pager}</div>` : ''}`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyMarkdownMaster', version: VERSION, error: native.errorText(error) }));
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


// ───────────────────────── print window (print/printwin.js)
//
// The document comes from the main window (print-content: the paginated HTML, the printers); the
// preview is laid out here in a frame; Print sends the setup back (print-run) and the main window
// prints through the render window — at once, without the system dialog, where the system allows it.

const pr = () => (state.print ??= { html: null, printers: null, pages: 0, current: 1, busy: false, status: '', laidOut: '' });
const ps = () => normalizePrint(s().print);
function updatePrint(patch) { state.settings = { ...state.settings, print: normalizePrint({ ...ps(), ...patch }) }; storeSettings(globalThis.localStorage, state.settings); renderPrint(); }
const isFilePrinter = (name) => (pr().printers?.filePrinters ?? []).includes(name);
const chosenPrinter = () => { const list = pr().printers?.printers ?? []; const p = ps().printer; return list.includes(p) ? p : pr().printers?.defaultPrinter || list[0] || ''; };
const selectedPages = () => (ps().range === 'range' ? parseRanges(ps().rangeText, pr().pages) : null);

function renderPrint() {
  const P = pr();
  const p = ps();
  if (!P.requested) { P.requested = true; action('print-content'); }
  const printers = P.printers?.printers ?? [];
  const printer = chosenPrinter();
  const [w, h] = sheetOf(p);
  const pages = selectedPages();
  const rangeBad = p.range === 'range' && !pages && P.pages > 0;
  const printerRow = desktop && printers.length
    ? row('print', t('print.printer'), `<select data-print="printer" data-icon="print" aria-label="${escapeHtml(t('print.printer'))}">${printers.map((name) => `<option value="${escapeHtml(name)}" data-icon="${isFilePrinter(name) ? 'pdfFile' : 'print'}" ${name === printer ? 'selected' : ''}>${escapeHtml(name)}${name === P.printers.defaultPrinter ? ` (${t('print.default')})` : ''}</option>`).join('')}</select>`)
    : row('print', t('print.printer'), `<span class="muted">${escapeHtml(desktop ? (P.printers ? t('print.systemDialog') : t('print.loadingPrinters')) : t('print.browserDialog'))}</span>`);
  const settingsHtml = [
    `<h3 class="print-head">${icon('print')}<span>${escapeHtml(t('print.printerSection'))}</span></h3>`,
    printerRow,
    isFilePrinter(printer) ? `<div class="row print-note">${icon('info')}<span>${escapeHtml(t('print.fileNote'))}</span></div>` : '',
    row('copy', t('print.copies'), stepperHtml({ key: 'print:copies', value: p.copies, min: 1, max: 99, step: 1, unit: '', label: t('print.copies'), decreaseTip: t('stepper.decrease', { label: t('print.copies') }), increaseTip: t('stepper.increase', { label: t('print.copies') }) })),
    row('palette', t('print.color'), segmented('color', [['color', t('print.colorColor'), 'palette'], ['gray', t('print.colorGray'), 'contrast']], p.color, 'data-print-set')),
    `<h3 class="print-head">${icon('pageSetup')}<span>${escapeHtml(t('print.pageSection'))}</span></h3>`,
    row('pageSetup', t('print.paper'), `<select data-print="paper" data-icon="pageSetup" aria-label="${escapeHtml(t('print.paper'))}">${Object.entries(PAPERS).map(([id, [pw, ph]]) => `<option value="${id}" ${p.paper === id ? 'selected' : ''}>${escapeHtml(`${id} (${pw} × ${ph} mm)`)}</option>`).join('')}</select>`),
    row('rotateRight', t('print.orientation'), segmented('orientation', [['portrait', t('print.portrait'), 'pageNumber'], ['landscape', t('print.landscape'), 'rotateRight']], p.orientation, 'data-print-set')),
    row('fitPage', t('print.margins'), segmented('margins', Object.keys(MARGINS).map((id) => [id, t(`print.margin.${id}`)]), p.margins, 'data-print-set')),
    row('list', t('print.pages'), `${segmented('range', [['all', t('print.all')], ['range', t('print.range')]], p.range, 'data-print-set')}<input type="text" data-print-text="rangeText" class="${rangeBad ? 'invalid' : ''}" value="${escapeHtml(p.rangeText)}" placeholder="${escapeHtml(t('print.rangePh'))}" ${p.range === 'range' ? '' : 'disabled'} aria-label="${escapeHtml(t('print.range'))}" />`),
  ].join('');
  const nav = `<div class="print-nav">
      <button class="icon-button" data-action="print-page" data-value="-1" title="${escapeHtml(t('common.prevPage'))}" ${P.current <= 1 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="print-pageno"><b id="print-current">${P.pages ? P.current : '–'}</b> / <span>${P.pages || '–'}</span></span>
      <button class="icon-button" data-action="print-page" data-value="1" title="${escapeHtml(t('common.nextPage'))}" ${P.current >= P.pages ? 'disabled' : ''}>${icon('chevronRight')}</button>
      <span class="grow"></span><span class="muted">${escapeHtml(`${p.paper} · ${t(`print.${p.orientation}`)} · ${Math.round(w)} × ${Math.round(h)} mm`)}</span></div>`;
  const summary = P.pages ? t('print.summary', { pages: pages ? pages.length : P.pages, sheets: (pages ? pages.length : P.pages) * p.copies }) : t('print.layingOut');
  if (!root.querySelector('.print-window')) {
    root.innerHTML = frame({
      glyph: 'print', title: t('print.title'),
      body: `<div class="print-window"><aside class="print-settings"></aside><section class="print-preview">${nav}<div class="print-frame-wrap"><iframe class="print-frame" title="${escapeHtml(t('print.preview'))}"></iframe><div class="print-busy">${icon('hourglass', 'icon big')}<span>${escapeHtml(t('print.layingOut'))}</span></div></div></section></div>`,
      foot: `<span class="muted" id="print-summary"></span><span class="grow"></span>${desktop ? button('print-pdf', t('print.savePdf'), 'pdfFile') : ''}${button('print-dialog', t('print.systemDialogButton'), 'gear')}${button('close', t('common.cancel'), 'close')}${button('print-run', t('print.print'), 'print', 'primary')}`,
    });
    const iframe = root.querySelector('.print-frame');
    iframe.addEventListener('load', () => { iframe.contentWindow?.addEventListener('scroll', () => { const n = pageAtTop(iframe); if (n !== pr().current) { pr().current = n; updatePrintNav(); } }, { passive: true }); });
    new ResizeObserver(() => fitPreview(iframe, ps(), selectedPages())).observe(iframe);
    ready();
  }
  const settingsHost = root.querySelector('.print-settings');
  const focusKey = document.activeElement?.dataset?.printText;
  settingsHost.innerHTML = settingsHtml;
  if (focusKey) { const input = settingsHost.querySelector(`[data-print-text="${focusKey}"]`); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }
  root.querySelector('.print-nav').outerHTML = nav;
  root.querySelector('#print-summary').textContent = P.status || summary;
  const run = root.querySelector('[data-action="print-run"]');
  run.disabled = P.busy || !P.pages || rangeBad;
  root.querySelector('.print-busy').hidden = !P.busy && Boolean(P.pages);
  alignRows();
  relayout();
}

function updatePrintNav() {
  const P = pr();
  const el = root.querySelector('#print-current');
  if (el) el.textContent = String(P.current);
  const [prev, next] = root.querySelectorAll('[data-action="print-page"]');
  if (prev) prev.disabled = P.current <= 1;
  if (next) next.disabled = P.current >= P.pages;
}

/** Lays the pages out again when the document or the page setup changed (paper, orientation, margins, grey). */
let layoutTimer = 0;
function relayout() {
  const P = pr();
  const iframe = root.querySelector('.print-frame');
  if (!iframe || !P.html) return;
  const key = JSON.stringify([P.html.length, P.htmlStamp, pageCss(ps())]);
  if (key === P.laidOut) { fitPreview(iframe, ps(), selectedPages()); return; }
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(async () => {
    P.laidOut = key;
    P.busy = true;
    root.querySelector('.print-busy').hidden = false;
    try {
      P.pages = await layoutPreview(iframe, P.html, ps());
      P.current = 1;
    } catch (error) {
      P.status = native.errorText(error);
    }
    P.busy = false;
    renderPrint();
    fitPreview(iframe, ps(), selectedPages());
  }, 120);
}

function printJob(mode) {
  const p = ps();
  const [widthMm, heightMm] = sheetOf(p);
  const pages = selectedPages();
  return { mode, css: pageCss(p), printer: chosenPrinter(), copies: p.copies, widthMm, heightMm, pageRanges: pages ? rangesText(pages) : '' };
}

async function startPrint(mode) {
  const P = pr();
  if (P.busy) return;
  P.busy = true;
  P.status = t(mode === 'pdf' ? 'print.savingPdf' : 'print.printing');
  renderPrint();
  await action('print-run', printJob(mode));
}

function printHostMessage(message) {
  const P = pr();
  if (message?.type === 'print-content') {
    P.html = message.html;
    P.htmlStamp = Date.now();
    P.printers = message.printers ?? { printers: [], defaultPrinter: '', filePrinters: [] };
    P.status = '';
    renderPrint();
    return true;
  }
  if (message?.type === 'print-done') {
    P.busy = false;
    P.status = message.ok ? '' : `${t('print.failed')}: ${message.error ?? ''}`;
    if (message.ok && !message.keep) { close({ printed: true }); return true; }
    renderPrint();
    return true;
  }
  return false;
}

function printClick(target) {
  const value = target.dataset.value;
  if (target.dataset.printSet) { updatePrint({ [target.dataset.printSet]: value }); return true; }
  switch (target.dataset.action) {
    case 'print-run': startPrint('direct'); return true;
    case 'print-pdf': startPrint('pdf'); return true;
    case 'print-dialog': startPrint('dialog'); return true;
    case 'print-page': { const P = pr(); P.current = Math.max(1, Math.min(P.pages, P.current + Number(value))); showPage(root.querySelector('.print-frame'), P.current); updatePrintNav(); return true; }
    default: return false;
  }
}

function printChange(target) {
  if (target.dataset.print) { updatePrint({ [target.dataset.print]: target.value }); return true; }
  if (target.dataset.printText) { updatePrint({ [target.dataset.printText]: target.value }); return true; }
  return false;
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
      ${shownItems.length ? `<ul class="confirm-items">${shownItems.map((item) => `<li title="${escapeHtml(item)}">${icon('columns')}<span>${escapeHtml(item || '—')}</span></li>`).join('')}${items.length > shownItems.length ? `<li>… +${items.length - shownItems.length}</li>` : ''}</ul>` : ''}
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
      <div class="about-top"><img class="about-icon small" src="${appIcon}" alt="" /><div><div class="about-name">MyMarkdownMaster <span class="about-version">v${escapeHtml(VERSION)}</span></div><p class="about-description">${escapeHtml(t('welcome.text'))}</p></div></div>
      <ul class="welcome-list">
        <li>${icon('tutorial')}<span>${escapeHtml(t('welcome.point1'))}</span></li>
        <li>${icon('samples')}<span>${escapeHtml(t('welcome.point2'))}</span></li>
        <li>${icon('userGuide')}<span>${escapeHtml(t('welcome.point3'))}</span></li>
      </ul>
      <label class="welcome-again" title="${escapeHtml(t('welcome.showAtStartTip'))}"><input type="checkbox" data-toggle="showWelcome" ${s().showWelcome ? 'checked' : ''} /><span>${escapeHtml(t('welcome.showAtStart'))}</span></label>
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
  // Created ahead of time (prewarm), hidden until a job asks for it: nothing to draw yet.
  if (p.warm) { root.innerHTML = ''; return; }
  const progress = state.progress ?? p.last ?? null;
  const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;
  // `text` (phase, "120 / 256 samples · 14 s left") wins over byte or step counts.
  const bytes = progress && !progress.text && progress.total > 1000 && progress.total !== 1000;
  const text = progress?.text ? progress.text : progress ? (bytes ? t('progress.bytes', { done: formatBytes(progress.done), total: formatBytes(progress.total) }) : t('progress.steps', { done: progress.done, total: progress.total })) : t('progress.wait');
  const elapsed = Math.round((Date.now() - (state.progressStart ??= Date.now())) / 1000);
  root.innerHTML = frame({
    glyph: 'hourglass', title: p.title ?? t('progress.wait'),
    body: `<div class="progress-view">
      <div class="row">${icon('file')}<span class="path" title="${escapeHtml(p.name ?? '')}">${escapeHtml(p.name ?? '')}</span><span class="grow"></span><span class="muted" id="progress-elapsed">${escapeHtml(t('progress.elapsed', { s: elapsed }))}</span></div>
      <div data-scrolls class="progress-bar ${percent == null ? 'indeterminate' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent ?? 0}"><i style="width:${percent ?? 30}%"></i></div>
      <div class="row muted"><span id="progress-text">${escapeHtml(text)}</span><span class="grow"></span><b id="progress-percent">${percent == null ? '' : `${percent}%`}</b></div>
    </div>`,
    foot: p.cancellable ? `<span class="grow"></span>${button('progress-cancel', state.cancelled ? t('progress.cancelling') : t('common.cancel'), 'close', 'danger', '', state.cancelled ? 'disabled' : '')}` : '',
  });
  // With a delay the backend shows the window when it is due (open_popup): not at once from here.
  if (!(p.delay > 0)) ready();
  // The host waits for this before a long computation starts (it would hold the page before the window is drawn).
  requestAnimationFrame(() => send('drawn'));
}

// ───────────────────────── recent files and folders

function renderRecent() {
  const list = loadRecent(globalThis.localStorage);
  const [page, pager, startIndex] = paged('recent-files', list, 10);
  root.innerHTML = frame({
    glyph: 'recent', title: t('recent.title'),
    body: `<div class="recent-list">${recentRows(page, { start: startIndex })}</div>`,
    foot: `<span class="muted">${escapeHtml(t('recent.count', { count: list.length, max: MAX_RECENT }))}</span>${pager}<span class="grow"></span>${button('clear-recent', t('recent.clear'), 'clearHistory', 'danger', '', list.length ? '' : 'disabled')}${button('close', t('common.done'), 'check', 'primary')}`,
  });
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

/** One menu row (a command, a group that opens a submenu, a theme with its colour swatch). */
function menuItemHtml(item, index) {
  return `<button class="menu-item ${item.danger ? 'danger' : ''} ${item.submenu ? 'has-sub' : ''}" role="menuitem" data-index="${index}" data-id="${escapeHtml(item.id)}" ${item.submenu ? 'aria-haspopup="menu" aria-expanded="false"' : ''} ${item.disabled ? 'disabled aria-disabled="true"' : ''} title="${escapeHtml(item.label)}">
        <span class="menu-icon">${item.swatch ? `<span class="theme-swatch menu-swatch">${item.swatch.map((color) => `<i style="background:${escapeHtml(color)}"></i>`).join('')}</span>` : icon(item.icon)}</span>
        <span class="menu-label">${escapeHtml(item.label)}</span>
        <span class="menu-key">${escapeHtml(item.shortcut ?? '')}</span>
        <span class="menu-check">${item.submenu ? icon('chevronRight') : item.checked ? icon('check') : ''}</span>
      </button>`;
}

/**
 * A panel. Besides rows and separators an item can be { columns: [[rows], [rows]], heads?, headIcons? }: the rows
 * side by side under their headings, all on one level (the theme drop-down's dark and light themes).
 */
function menuPanelHtml(items, level, label) {
  const row = (item, index) => (item.separator ? '<div class="menu-sep" role="separator"></div>' : menuItemHtml(item, index));
  const columns = (item, index) => `<div class="menu-columns${item.row ? ' menu-row' : ''}" style="--menu-cols:${item.columns.length}">${item.columns.map((col, k) => `<div class="menu-column" role="group" aria-label="${escapeHtml(item.heads?.[k] ?? '')}">${item.heads?.[k] ? `<div class="menu-group">${icon(item.headIcons?.[k] ?? 'dot')}<span>${escapeHtml(item.heads[k])}</span></div>` : ''}${col.map((x, j) => row(x, `${index}.${k}.${j}`)).join('')}</div>`).join('')}</div>`;
  return `<div class="popup-menu${items.some((x) => x.columns) ? ' has-columns' : ''}" role="menu" data-level="${level}" aria-label="${escapeHtml(label ?? '')}">${items.map((item, index) => (item.columns ? columns(item, index) : row(item, index))).join('')}</div>`;
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


// ───────────────────────── find (elements by name, documentation, type)

const draftToggle = (key, label, glyph, checked) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-draft-toggle="${key}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);

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

function renderPrompt() {
  const p = P();
  if (!state.draft) state.draft = { value: p.value ?? '' };
  root.innerHTML = frame({
    glyph: p.icon ?? 'edit', title: p.title ?? '',
    body: `<div class="editor">${row(p.icon ?? 'edit', p.label ?? '', `<input type="text" data-draft="value" value="${escapeHtml(state.draft.value)}" aria-label="${escapeHtml(p.label ?? '')}" />`, p.label ?? '', p.error ? 'prompt-error-row' : '')}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('prompt-apply', t('common.ok'), 'check', 'primary')}`,
  });
  fitHeight();
  const input = root.querySelector('[data-draft="value"]');
  input?.focus();
  // A file name: the name without its extension is selected (rename keeps ".png").
  const dot = state.draft.value.lastIndexOf('.');
  if (input && p.selectStem && dot > 0) input.setSelectionRange(0, dot); else input?.select();
  ready();
}

// ───────────────────────── suggest (command palette, quick switcher, pickers)
//
// The list comes from the main window: each change of the filter asks for it ("suggest-query"); the answer
// arrives as a host message ("suggest-items"). Choosing answers { id, query, newTab, shift }.

const sug = () => (state.suggest ??= { query: P().initial ?? '', items: [], selected: 0, seq: 0, shownQuery: null });
const mark = (text, positions = []) => { const set = new Set(positions ?? []); return [...String(text ?? '')].map((c, i) => (set.has(i) ? `<b>${escapeHtml(c)}</b>` : escapeHtml(c))).join(''); };

function renderSuggest() {
  const p = P();
  const st = sug();
  if (!root.querySelector('.suggest-popup')) {
    root.innerHTML = frame({
      glyph: p.icon ?? 'search', title: p.title ?? '',
      body: `<div class="suggest-popup"><label class="suggest-input">${icon(p.icon ?? 'search')}<input type="text" data-suggest-input spellcheck="false" autocomplete="off" placeholder="${escapeHtml(p.placeholder ?? '')}" value="${escapeHtml(st.query)}" /></label><div class="suggest-list" role="listbox"></div></div>`,
      foot: `<div class="suggest-foot">${(p.footer ?? []).map(([k, v]) => `<span><kbd>${escapeHtml(k)}</kbd>${escapeHtml(v)}</span>`).join('')}</div>`,
    });
    const input = root.querySelector('[data-suggest-input]');
    input.focus();
    input.select();
    ready();
    querySuggest();
  }
  drawSuggestList();
}

function querySuggest() {
  const st = sug();
  st.seq += 1;
  action('suggest-query', { query: st.query, seq: st.seq });
}

function drawSuggestList() {
  const st = sug();
  const list = root.querySelector('.suggest-list');
  if (!list) return;
  list.innerHTML = st.items.length ? st.items.map((it, i) => `<div class="suggest-item ${i === st.selected ? 'selected' : ''}" data-suggest="${i}" role="option" aria-selected="${i === st.selected}">
      ${it.icon ? icon(it.icon) : ''}<span class="suggest-main"><span class="suggest-label">${it.positions ? mark(it.label, it.positions) : escapeHtml(it.label)}</span>${it.detail ? `<span class="suggest-detail">${escapeHtml(it.detail)}</span>` : ''}</span>
      ${it.hint ? `<span class="suggest-hint">${escapeHtml(it.hint)}</span>` : ''}${it.kbd ? `<kbd>${escapeHtml(it.kbd)}</kbd>` : ''}</div>`).join('')
    : `<div class="suggest-empty">${escapeHtml(st.seq && st.shownQuery === st.query ? P().emptyText ?? '' : '…')}</div>`;
  list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
}

function chooseSuggest(index, event) {
  const st = sug();
  const item = st.items[index];
  if (!item) return;
  close({ id: item.id, query: st.query, newTab: Boolean(event?.ctrlKey || event?.metaKey), shift: Boolean(event?.shiftKey) });
}

if (kind === 'suggest') {
  root.addEventListener('input', (event) => { if (!('suggestInput' in event.target.dataset)) return; sug().query = event.target.value; querySuggest(); });
  root.addEventListener('keydown', (event) => {
    if (!('suggestInput' in (event.target.dataset ?? {})) || event.isComposing) return;
    const st = sug();
    const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[event.key];
    if (move) { event.preventDefault(); st.selected = Math.max(0, Math.min(st.items.length - 1, st.selected + move)); drawSuggestList(); }
    else if (event.key === 'Enter') { event.preventDefault(); chooseSuggest(st.selected, event); }
  });
  root.addEventListener('pointerdown', (event) => { const row = event.target.closest?.('[data-suggest]'); if (row) { event.preventDefault(); chooseSuggest(Number(row.dataset.suggest), event); } });
  root.addEventListener('pointermove', (event) => { const row = event.target.closest?.('[data-suggest]'); const st = sug(); if (row && Number(row.dataset.suggest) !== st.selected) { st.selected = Number(row.dataset.suggest); for (const el of root.querySelectorAll('[data-suggest]')) el.classList.toggle('selected', Number(el.dataset.suggest) === st.selected); } });
}

/** What other modules use from this page. */


// ───────────────────────── events

root.addEventListener('click', async (event) => {
  const link = event.target.closest('a[data-ai-link], a[target="_blank"]');
  if (link) { event.preventDefault(); if (desktop) native.openExternal(link.href).catch(() => {}); else globalThis.open(link.href, '_blank', 'noopener'); return undefined; }
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-theme-group], [data-draft-segment], [data-pick-color], [data-export-set], [data-print-set]');
  if (!target || target.disabled) return undefined;
  if (kind === 'print' && printClick(target)) return undefined;
  if (target.closest('.settings-ai') && !target.dataset.action?.startsWith('tab')) return undefined;
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id, target);
  if (target.dataset.exportSet) return update({ exportOptions: { ...s().exportOptions, [target.dataset.exportSet]: target.dataset.value } });
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const raw = target.dataset.value;
    return update({ [key]: typeof s()[key] === 'number' ? Number(raw) : raw });
  }
  if (target.dataset.themeGroup) { state.themeGroup = target.dataset.themeGroup; return render(); }
  if (target.dataset.pickColor) { colorDone = true; return close({ color: target.dataset.pickColor }); }
  const d = state.draft;
  if (target.dataset.draftSegment) {
    const key = target.dataset.draftSegment;
    const value = target.dataset.value;
    d[key] = value === 'true' ? true : value === 'false' ? false : value;
    return render();
  }
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
      const keep = { backgroundImage: s().backgroundImage, backgroundName: s().backgroundName, lastDirectory: s().lastDirectory, language: s().language, tutorialOffered: true, tutorialDone: s().tutorialDone, ai: s().ai };
      return update({ ...defaultSettings(s().language), ...keep });
    }
    case 'choose-background': return action('choose-background');
    case 'clear-background': return action('clear-background');
    case 'shuffle-background': return action('shuffle-background');
    case 'start-tutorial': await action('start-tutorial'); return close();
    case 'show-start': return action('show-start');
    case 'open-recent': await action('open-recent', { path: value, kind: target.dataset.kind }); return kind === 'recent' ? close() : undefined;
    case 'remove-recent':
      if (target.dataset.kind === 'folder') storeRecentDirs(globalThis.localStorage, removeRecent(loadRecentDirs(globalThis.localStorage), value));
      else storeRecent(globalThis.localStorage, removeRecent(loadRecent(globalThis.localStorage), value));
      return render();
    case 'clear-recent': storeRecent(globalThis.localStorage, []); storeRecentDirs(globalThis.localStorage, []); return render();
    case 'copy-error':
      try { await copyText(errorReport()); state.copied = true; render(); } catch (error) { root.querySelector('#copy-state').textContent = `${t('error.copyFailed')}: ${native.errorText(error)}`; }
      return undefined;
    case 'copy-about':
      return copyText([...root.querySelectorAll('#about-rows dt')].map((dt) => `${dt.textContent.trim()}: ${dt.nextElementSibling.textContent.trim()}`).join('\n')).then(() => action('notice', { kind: 'success', text: t('error.copied') }));
    case 'use-custom': return update({ theme: CUSTOM });
    case 'copy-theme': { const from = resolveTheme(s().theme === CUSTOM ? 'light' : s().theme, prefersDark(), s().customTheme); return update({ customTheme: customFrom(from) }); }
    case 'prompt-apply': return close({ value: d.value });
    case 'progress-cancel': state.cancelled = true; await action('progress-cancel', { op: P().op }); return render();
    default: return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  const d = state.draft;
  if (kind === 'print' && printChange(target)) return undefined;
  if (target.closest('.settings-ai')) return undefined;
  if (target.dataset.exportOpt) return update({ exportOptions: { ...s().exportOptions, [target.dataset.exportOpt]: target.checked } });
  if (target.dataset.toggle) return update({ [target.dataset.toggle]: target.checked });
  if (target.dataset.select) { const key = target.dataset.select; return update({ [key]: typeof s()[key] === 'number' ? Number(target.value) : target.value }); }
  if (target.dataset.customColor) return update({ customTheme: { ...s().customTheme, [target.dataset.customColor]: target.value }, theme: CUSTOM });
  if ('customDark' in target.dataset) return update({ customTheme: { ...s().customTheme, dark: target.checked }, theme: CUSTOM });
  if (target.dataset.colorCustom !== undefined && 'colorCustom' in target.dataset) { colorDone = true; return close({ color: target.value }); }
  if (target.dataset.draftToggle) {
    const key = target.dataset.draftToggle;
    d[key] = target.checked;
    return render();
  }
  if (target.dataset.draftSelect) {
    const key = target.dataset.draftSelect;
    d[key] = target.value;
    return render();
  }
  if (target.dataset.settingText) return update({ [target.dataset.settingText]: target.value.trim() });
  return undefined;
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.draft && state.draft) {
    state.draft[target.dataset.draft] = target.value;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    // A menu: Esc closes the innermost open submenu first.
    if (kind === 'menu') { if (!closeInnermostSubmenu()) chooseMenu(null); }
    else if (kind === 'progress') { if (state.params.cancellable) { state.cancelled = true; action('progress-cancel', { op: P().op }); render(); } }
    else { if (kind === 'color') colorDone = true; close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null); }
  }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    if (event.key === 'Enter' && document.activeElement?.classList.contains('menu-item')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id, document.activeElement); }
    if (event.key === 'ArrowRight' && document.activeElement?.classList.contains('has-sub')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id, document.activeElement); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); closeInnermostSubmenu(); }
  }
  if (event.key === 'Enter' && event.target.matches?.('input[type="text"], input[type="password"]') && !event.target.matches('.stepper-value')) {
    const primary = { prompt: 'prompt-apply' }[kind];
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
  if (time('mymarkdown.main.focus') < lostAt - 100 || time('mymarkdown.main.input') >= lostAt - 400) return false;
  window.focus();
  native.invoke('popup_ready').catch(() => {});
  return true;
}

// The colour picker closes when it loses focus.
window.addEventListener('blur', () => {
  const lostAt = Date.now();
  if (kind === 'color' && !colorDone) setTimeout(() => { if (!document.hasFocus() && !colorDone && !document.querySelector('[data-color-custom]:focus') && !regainedFromMain(lostAt)) { colorDone = true; close(); } }, 200);
});

// Number fields (steppers).
bindSteppers(root, (key, value) => {
  const [scope, field] = key.includes(':') ? key.split(':') : ['setting', key];
  if (scope === 'setting') update({ [field]: value });
  if (scope === 'print') updatePrint({ [field]: value });
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
    if (kind === 'print') { renderPrint(); return; }
    if (kind === 'settings' && state.tab === 'ai') return;
    if (!['menu', 'color'].includes(kind)) keepFocus(render);
  } else if ((event.key === RECENT_KEY || event.key === RECENT_DIRS_KEY) && (kind === 'recent' || state.tab === 'recent')) {
    render();
  }
});

function onHostMessage(message) {
  if (kind === 'suggest' && message?.type === 'suggest-items') {
    const st = sug();
    if (message.seq !== st.seq) return;
    if (st.shownQuery !== st.query) st.selected = 0;
    st.shownQuery = st.query;
    st.items = message.items ?? [];
    st.selected = Math.min(st.selected, Math.max(0, st.items.length - 1));
    drawSuggestList();
    return;
  }
  if (kind === 'print' && printHostMessage(message)) return;
  if (message?.type === 'progress') {
    state.progress = message;
    if (kind === 'progress') render();
  } else if (message?.type === 'done' && kind === 'progress') {
    state.progress = state.progress ? { ...state.progress, done: state.progress.total } : null;
    render();
    // The window is kept (hidden) for the next job: cleared once hidden, so it never comes back showing "done".
    const stamp = (state.doneAt = Date.now());
    setTimeout(() => { if (state.doneAt === stamp) root.innerHTML = ''; }, 1500);
  } else if (message?.type === 'refresh') {
    refresh();
  }
}

/** Redraws without losing the focused control (a select or the filter box being used). */
function keepFocus(draw) {
  const active = document.activeElement;
  const selector = active && active !== document.body ? ['data-draft', 'data-doc-text', 'data-action'].map((a) => (active.hasAttribute(a) ? `[${a}="${CSS.escape(active.getAttribute(a))}"]${active.dataset.id ? `[data-id="${CSS.escape(active.dataset.id)}"]` : ''}${active.dataset.row ? `[data-row="${CSS.escape(active.dataset.row)}"][data-col="${CSS.escape(active.dataset.col)}"]` : ''}` : '')).find(Boolean) : '';
  draw();
  if (selector) root.querySelector(selector)?.focus();
}

function refresh() {
  state.params = popupParams(kind);
  state.settings = loadSettings(globalThis.localStorage);
  state.tab = state.params.tab ?? 'general';
  state.copied = false;
  state.progress = null;
  state.progressStart = null;
  state.cancelled = false;
  state.doneAt = null;
  state.page = 0;
  state.pager = {};
  state.draft = null;
  if (kind === 'color') { state.placed = false; colorDone = false; }
  if (kind === 'print') { state.print = null; root.innerHTML = ''; }
  if (kind === 'suggest') { state.suggest = null; root.innerHTML = ''; }
  if (kind === 'settings' && state.params.themeGroup) state.themeGroup = state.params.themeGroup;
  applyLook();
  render();
}

if (desktop) {
  // Tauri delivers these to every window that listens, whichever one they were sent to: each popup only
  // takes its own (a hidden menu that redrew for the progress window's refresh would show itself again).
  native.listen('popup-message', (message) => { if (forPopup(kind, message?.to)) onHostMessage(message); });
  native.listen('popup-refresh', (target) => { if (forPopup(kind, target)) refresh(); });
  if (kind === 'progress') {
    // The elapsed seconds keep counting during a long step that sends no news (the job is still alive).
    setInterval(() => {
      const el = root.querySelector('#progress-elapsed');
      if (el && state.progressStart != null && state.doneAt == null) el.textContent = t('progress.elapsed', { s: Math.round((Date.now() - state.progressStart) / 1000) });
    }, 1000);
    native.listen('io-progress', (progress) => {
      if (progress.op !== state.params.op) return;
      state.progress = progress;
      render();
    });
  }
} else {
  window.addEventListener('message', (event) => {
    if (event.origin === location.origin && event.data?.mymarkdownHost) onHostMessage(event.data);
  });
}

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__mymarkdownPopup = { kind, state, render, close, errorReport, refresh };

// Popup windows. Each runs this page in its own OS window (desktop, label "popup-<kind>") or in
// a frame (web build, tutorial: ?popup=<kind>). Every popup has a fixed size chosen so its
// content fits without scrolling; long content is split into tabs or pages.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { loadRecent, loadRecentDirs, MAX_RECENT, removeRecent, storeRecent, storeRecentDirs } from './domain/recent.js';
import {
  ANIMATIONS, ANIMATION_INTERVALS, BACKGROUND_FITS, BACKGROUND_KINDS, defaultSettings, DEVICE_IDS, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, loadSettings,
  normalizeUserWords, RECENT_DIRS_KEY, RECENT_KEY, STORAGE_KEY, storeSettings, USER_WORDS_MAX, ZOOM,
} from './domain/settings.js';
import { normalizeWord, validUserWord } from './domain/spell.js';
import { DICT_INFO } from './domain/dict-info.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { POPUPS, popupParams } from './platform/popups.js';
import {
  applyFont, applyTheme, contrast, CUSTOM, CUSTOM_KEYS, customFrom, DARK_THEMES, LIGHT_THEMES, resolveTheme, SYSTEM, themeName,
} from './themes.js';
import { bindSteppers, stepperHtml } from './stepper.js';
import { intervalLabel } from './ui/startpage.js';
import { DESIGNS, FONTS, designById } from './domain/designs.js';
import { TEMPLATES } from './domain/templates.js';
import { SAMPLE_GROUPS, SAMPLES } from './domain/samples.js';
import { idbGet } from './platform/idb.js';
import { formatSize, packageSize, PACKAGES } from './domain/packages.js';
import { PACKAGES_STATE_KEY, packageView } from './platform/packages.js';
import { defaultPrintOptions, FITS, MARGINS, normalizePrintOptions, PAPERS, PRINT_DEVICES, PRINT_JOB_KEY, PRINT_SETUP_KEY, RANGES, selectPrintPages } from './print/layout.js';
import { fillFrames, jobLayout, measurePages, sheetsHtml, sheetsKey } from './print/window.js';

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
  globalThis.parent?.postMessage({ myhomemaker: true, kind, type, data }, location.origin);
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
  appWindow.setTitle(`${title} — MyHomeMaker v${VERSION}`).catch(() => {});
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
      menu: renderMenu, theme: renderThemePicker, welcome: renderWelcome, prompt: renderPrompt, design: renderDesign, template: renderTemplate, publish: renderPublish,
      print: renderPrint, packages: renderPackages,
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
  ['editor', 'siteProject', 'settings.editor'],
  ['dictionary', 'dictionary', 'settings.dictionary'],
  ['recent', 'recent', 'settings.recent'],
  ['packages', 'importFile', 'settings.packages'],
  ['shortcuts', 'keyboard', 'settings.shortcuts'],
];

function renderSettings() {
  const body = {
    general: settingsGeneral, start: settingsStart, appearance: settingsAppearance, font: settingsFont, background: settingsBackground,
    editor: settingsEditor, dictionary: settingsDictionary, recent: settingsRecent, packages: settingsPackages, shortcuts: settingsShortcuts,
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
    row('save', t('settings.autoSave'), select('data-select', 'autoSaveMinutes', [0, 1, 5, 10, 30].map((n) => [n, n ? t('settings.everyMinutes', { n }) : t('settings.off')]), s().autoSaveMinutes, t('settings.autoSave'))),
    row('folder', t('settings.lastDirectory'), `<span class="path" title="${escapeHtml(s().lastDirectory ?? '')}">${escapeHtml(s().lastDirectory ?? t('common.none'))}</span>`),
    row('tutorial', t('settings.tutorial'), button('start-tutorial', t('start.tutorialStart'), 'play', 'small')),
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
    toggle('startShowTutorialBanner', t('settings.startShowTutorialBanner'), 'bulb'),
    row('home', t('settings.startOpen'), button('show-start', t('settings.startOpenButton'), 'home', 'small')),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.startHint'))}</span>`, t('settings.startHint')),
  ].join('');
}

/** Spelling: on / off per language, and the user's own words (added here or from the Problems panel). */
function settingsDictionary() {
  const words = s().userWords ?? [];
  const query = (state.dictQuery ?? '').trim().toLowerCase();
  const shown = query ? words.filter((w) => w.toLowerCase().includes(query)) : words;
  const [page, pager] = paged('dict', shown, 24);
  const note = state.dictNote ? `<span class="dict-note ${state.dictNote.kind}">${icon(state.dictNote.kind === 'error' ? 'warning' : 'check')}<span>${escapeHtml(state.dictNote.text)}</span></span>` : '';
  const chips = page.length
    ? `<div class="dict-words">${page.map((w) => `<span class="dict-word" title="${escapeHtml(w)}"><span>${escapeHtml(w)}</span><button class="icon-button tiny" data-action="dict-remove" data-value="${escapeHtml(w)}" title="${escapeHtml(t('settings.dictRemove', { word: w }))}" aria-label="${escapeHtml(t('settings.dictRemove', { word: w }))}">${icon('close')}</button></span>`).join('')}</div>`
    : `<p class="muted dict-empty">${escapeHtml(words.length ? t('problems.noneFiltered') : t('settings.dictEmpty'))}</p>`;
  return [
    toggle('spellCheck', t('settings.spellCheck'), 'spellCheck'),
    toggle('spellEnglish', t('settings.spellEnglish'), 'globe'),
    toggle('spellKorean', t('settings.spellKorean'), 'globe'),
    row('addWord', t('settings.dictWord'), `<span class="dict-add"><input type="text" id="dict-word" maxlength="40" placeholder="${escapeHtml(t('settings.dictPlaceholder'))}" aria-label="${escapeHtml(t('settings.dictWord'))}" spellcheck="false" value="${escapeHtml(state.dictDraft ?? '')}" />${button('dict-add', t('settings.dictAdd'), 'plus', 'small primary')}</span>${note}`),
    row('dictionary', t('settings.dictWords', { count: words.length }), `<span class="dict-tools"><label class="search-box" title="${escapeHtml(t('settings.dictFind'))}">${icon('search')}<input type="search" id="dict-find" placeholder="${escapeHtml(t('settings.dictFind'))}" value="${escapeHtml(state.dictQuery ?? '')}" spellcheck="false" /></label>${pager}<span class="grow"></span>${button('dict-clear', t('settings.dictClear'), 'trash', 'small danger', '', words.length ? '' : 'disabled')}</span>`),
    `<div class="dict-list">${chips}</div>`,
    row('info', '', `<span class="muted">${escapeHtml(t('settings.dictSizes', { en: DICT_INFO.en.toLocaleString(), ko: DICT_INFO.ko.toLocaleString() }))}</span>`, t('settings.dictSizes', { en: DICT_INFO.en, ko: DICT_INFO.ko })),
  ].join('');
}

function addDictionaryWord() {
  const input = root.querySelector('#dict-word');
  const raw = (input?.value ?? state.dictDraft ?? '').trim();
  const words = s().userWords ?? [];
  if (!validUserWord(raw)) { state.dictNote = { kind: 'error', text: t('settings.dictInvalid') }; state.dictDraft = raw; return render(); }
  const word = normalizeWord(raw);
  if (words.includes(word)) { state.dictNote = { kind: 'error', text: t('settings.dictExists', { word }) }; state.dictDraft = raw; return render(); }
  if (words.length >= USER_WORDS_MAX) return render();
  state.dictNote = { kind: 'success', text: t('settings.dictAdded', { word }) };
  state.dictDraft = '';
  update({ userWords: normalizeUserWords([...words, word]) });
  requestAnimationFrame(() => root.querySelector('#dict-word')?.focus());
  return undefined;
}

/** The editor: the design new sites start with, the device shown, fitting, publishing. */
function settingsEditor() {
  return [
    row('designPicker', t('settings.defaultDesign'), select('data-select', 'defaultDesign', DESIGNS.map((d) => [d.id, `${d[L()]}${d.dark ? ` · ${t('design.darkTag')}` : ''}`, 'palette']), s().defaultDesign, t('settings.defaultDesign'))),
    row('devDesktop', t('settings.defaultDevice'), segmented('defaultDevice', DEVICE_IDS.map((id) => [id, t(`device.${id}`), `dev${id[0].toUpperCase()}${id.slice(1)}`]), s().defaultDevice)),
    toggle('autoFit', t('settings.autoFit'), 'zoomFit'),
    toggle('toolboxCompact', t('settings.toolboxCompact'), 'gridView'),
    toggle('publishExtractImages', t('settings.publishExtractImages'), 'picture'),
    row('info', '', `<span class="muted">${escapeHtml(t('settings.editorHint'))}</span>`, t('settings.editorHint')),
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
  ['Ctrl+N', 'action.new'], ['Ctrl+O', 'action.open'], ['Ctrl+S', 'action.save'], ['Ctrl+Shift+S', 'action.saveAs'], ['Ctrl+W', 'action.closeSite'], ['Ctrl+R', 'action.recent'],
  ['Ctrl+Z', 'action.undo'], ['Ctrl+Y', 'action.redo'], ['Ctrl+X', 'action.cut'], ['Ctrl+C', 'action.copy'], ['Ctrl+V', 'action.paste'], ['Ctrl+D', 'action.duplicate'],
  ['Delete', 'action.delete'], ['Ctrl+Up / Down', 'action.moveUp'], ['Ctrl+H', 'action.toggleHidden'], ['Alt+Up / Down', 'action.selectNext'], ['Enter', 'action.editContent'], ['Esc', 'action.clearSelection'],
  ['shortcut.click', 'shortcut.select'], ['shortcut.clickAgain', 'shortcut.inlineEdit'], ['shortcut.doubleClick', 'shortcut.doubleClickDo'], ['shortcut.drag', 'shortcut.dragDo'], ['shortcut.ctrlClick', 'shortcut.ctrlClickDo'],
  ['Ctrl+Shift+A', 'action.addBlock'], ['Ctrl+Shift+N', 'action.addPage'], ['F2', 'action.renamePage'], ['Ctrl+PageUp / PageDown', 'action.nextPage'], ['Ctrl+Tab', 'action.nextPage'],
  ['Ctrl+= / Ctrl+-', 'action.zoomIn'], ['Ctrl+0', 'action.zoomReset'], ['Ctrl+Shift+W', 'action.zoomFit'], ['shortcut.wheel', 'action.zoomIn'], ['Ctrl+E', 'action.previewMode'],
  ['F5', 'action.previewBrowser'], ['Ctrl+Shift+P', 'action.publish'], ['Ctrl+Shift+D', 'action.designPicker'], ['Ctrl+Shift+1 / 2', 'action.blocksPanel'], ['Ctrl+Shift+L', 'action.language'],
  ['Ctrl+Shift+B', 'action.shuffleBackground'], ['Ctrl+Shift+H', 'action.startPage'], ['Ctrl+,', 'action.settings'], ['F11', 'action.tutorial'], ['F1', 'action.about'],
];


function settingsShortcuts() {
  const [list, pager] = paged('shortcuts', SHORTCUT_LIST, 36);
  return `<div class="shortcut-grid">${list.map(([key, label]) => `<div class="shortcut-row" title="${escapeHtml(t(label))}"><kbd>${escapeHtml(key.startsWith('shortcut.') ? t(key) : key)}</kbd><span>${escapeHtml(t(label).replace(/…$/, ''))}</span></div>`).join('')}</div>${pager ? `<div class="row">${pager}</div>` : ''}`;
}

// ───────────────────────── about

async function renderAbout() {
  if (!state.info) state.info = await native.appInfo().catch((error) => ({ name: 'MyHomeMaker', version: VERSION, error: native.errorText(error) }));
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
      <div class="about-top"><img class="about-icon small" src="${appIcon}" alt="" /><div><div class="about-name">MyHomeMaker <span class="about-version">v${escapeHtml(VERSION)}</span></div><p class="about-description">${escapeHtml(t('welcome.text'))}</p></div></div>
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

// ───────────────────────── prompt (a name; with `choices`, also what to start with)

function renderPrompt() {
  const p = P();
  if (!state.draft) state.draft = { value: p.value ?? '', choice: p.choice ?? p.choices?.[0]?.[0] ?? '' };
  const choices = Array.isArray(p.choices) && p.choices.length
    ? row('layers', t('prompt.startWith'), `<span class="choice-grid">${p.choices.map(([id, label]) => `<button class="segment ${state.draft.choice === id ? 'active' : ''}" data-draft-segment="choice" data-value="${escapeHtml(id)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')}</span>`, t('prompt.startWith'), 'full')
    : '';
  root.innerHTML = frame({
    glyph: p.icon ?? 'edit', title: p.title ?? '',
    body: `<div class="editor">${row(p.icon ?? 'edit', p.label ?? '', `<input type="text" data-draft="value" value="${escapeHtml(state.draft.value)}" aria-label="${escapeHtml(p.label ?? '')}" />`)}${choices}</div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('prompt-apply', t('common.ok'), 'check', 'primary')}`,
  });
  fitHeight();
  const input = root.querySelector('[data-draft="value"]');
  input?.focus();
  input?.select();
  ready();
}

// ───────────────────────── site designs: a card per design, a small picture of a page in its colours

function designCard(d, current) {
  const font = (id) => FONTS[id]?.css ?? FONTS.sans.css;
  const r = Math.min(d.radius, 14);
  return `<button class="design-card ${current === d.id ? 'active' : ''}" data-pick-design="${d.id}" title="${escapeHtml(d[L()])}" role="radio" aria-checked="${current === d.id}">
    <span class="design-mock" style="background:${d.bg};color:${d.text};border-color:${d.border}">
      <span class="dm-nav" style="background:${d.headerBg};color:${d.headerText}"><b style="font-family:${escapeHtml(font(d.headingFont))}">Aa</b><i style="background:${d.primary};border-radius:${r}px"></i></span>
      <span class="dm-hero" style="background:${d.primary};color:${d.primaryText}"><b style="font-family:${escapeHtml(font(d.headingFont))}">${escapeHtml(t('design.mockTitle'))}</b><i style="background:${d.primaryText};border-radius:${r}px"></i></span>
      <span class="dm-cards">${[0, 1, 2].map(() => `<i style="background:${d.surface};border:1px solid ${d.border};border-radius:${r / 2}px"><em style="background:${d.accent}"></em></i>`).join('')}</span>
      <span class="dm-foot" style="background:${d.footerBg}"></span>
    </span>
    <span class="design-name">${escapeHtml(d[L()])}${current === d.id ? icon('check', 'icon check') : ''}</span>
  </button>`;
}

function renderDesign() {
  const p = P();
  if (!state.draft) state.draft = { group: DESIGNS.find((d) => d.id === p.current)?.dark ? 'dark' : 'light', current: p.current, reset: true };
  const d = state.draft;
  const list = DESIGNS.filter((x) => (d.group === 'dark' ? x.dark : !x.dark));
  root.innerHTML = frame({
    glyph: 'designPicker', title: t('design.title'),
    tabs: tabsHtml([['light', 'sun', t('design.light', { count: DESIGNS.filter((x) => !x.dark).length })], ['dark', 'moon', t('design.dark', { count: DESIGNS.filter((x) => x.dark).length })]], d.group, 'design-group'),
    body: `<div class="design-grid" role="radiogroup">${list.map((x) => designCard(x, d.current)).join('')}</div>`,
    foot: `${p.hasOverrides ? `<label class="check-row" title="${escapeHtml(t('design.keepOverrides'))}"><input type="checkbox" data-draft-toggle="keep" ${d.reset ? '' : 'checked'} /><span>${escapeHtml(t('design.keepOverrides'))}</span></label>` : `<span class="muted">${escapeHtml(t('design.hint'))}</span>`}<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('design-apply', t('design.apply'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── new site: templates and samples, a name and a design

function renderTemplate() {
  const p = P();
  if (!state.draft) state.draft = { group: 'templates', template: 'blank', sample: null, name: '', design: p.design ?? 'ocean' };
  const d = state.draft;
  const groups = [['templates', 'templateNew', t('template.groupTemplates', { count: TEMPLATES.length })], ...SAMPLE_GROUPS.map((g) => [g.id, g.icon, `${g[L()]} (${SAMPLES.filter((x) => x.group === g.id).length})`])];
  const card = (id, glyph, title, text, active, attr) => `<button class="dg-card ${active ? 'active' : ''}" ${attr}="${escapeHtml(id)}" title="${escapeHtml(`${title} — ${text}`)}" role="radio" aria-checked="${active}">${icon(glyph)}<b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></button>`;
  const cards = d.group === 'templates'
    ? TEMPLATES.map(([id, , glyph]) => card(id, glyph, t(`template.${id}`), t(`template.${id}.desc`), !d.sample && d.template === id, 'data-pick-template')).join('')
    : SAMPLES.filter((x) => x.group === d.group).map((x) => card(x.id, x.icon, x[L()][0], x[L()][1], d.sample === x.id, 'data-pick-sample')).join('');
  const designSelect = `<select data-draft-select="design" aria-label="${escapeHtml(t('template.design'))}" ${d.sample || (d.template !== 'blank') ? 'disabled' : ''}>${DESIGNS.map((x) => `<option value="${x.id}" data-icon="palette" ${d.design === x.id ? 'selected' : ''}>${escapeHtml(x[L()])}</option>`).join('')}</select>`;
  root.innerHTML = frame({
    glyph: 'fileNew', title: t('template.title'),
    body: `<div class="dg-picker">
      <nav class="dg-groups">${groups.map(([id, glyph, label]) => `<button class="dg-group ${d.group === id ? 'active' : ''}" data-action="template-group" data-value="${escapeHtml(id)}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</nav>
      <div class="dg-cards">${cards}</div>
    </div>
    <div class="dg-bottom">${row('edit', t('template.name'), `<input type="text" data-draft="name" value="${escapeHtml(d.name)}" placeholder="${escapeHtml(t('template.namePlaceholder'))}" />`)}${row('palette', t('template.design'), designSelect, d.sample || d.template !== 'blank' ? t('template.designFixed') : t('template.design'))}</div>`,
    foot: `<span class="muted">${escapeHtml(t('template.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('template-create', t('template.create'), 'check', 'primary')}`,
  });
  ready();
}

// ───────────────────────── publish

const formatBytesShort = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function renderPublish() {
  const p = P();
  if (!state.draft) state.draft = { format: p.format ?? (p.desktop ? 'folder' : 'zip'), extract: p.extract !== false };
  const d = state.draft;
  const formats = [['folder', 'publishFolder', t('publish.folder'), t('publish.folderTip'), !p.desktop], ['zip', 'publishZip', t('publish.zip'), t('publish.zipTip'), false], ['html', 'htmlPage', t('publish.html'), t('publish.htmlTip'), false]];
  const checks = Array.isArray(p.checks) ? p.checks : [];
  root.innerHTML = frame({
    glyph: 'publish', title: t('publish.title'),
    body: `<div class="publish-view">
      <div class="publish-formats" role="radiogroup">${formats.map(([id, glyph, label, tip, off]) => `<button class="publish-format ${d.format === id ? 'active' : ''}" data-draft-segment="format" data-value="${id}" ${off ? 'disabled' : ''} role="radio" aria-checked="${d.format === id}" title="${escapeHtml(off ? t('publish.desktopOnly') : tip)}">${icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(off ? t('publish.desktopOnly') : tip)}</small></button>`).join('')}</div>
      ${row('picture', t('publish.extract'), `<label class="switch-wrap" title="${escapeHtml(t('publish.extract'))}"><input type="checkbox" data-draft-toggle="extract" ${d.extract ? 'checked' : ''} ${d.format === 'html' ? 'disabled' : ''} /><span class="switch" aria-hidden="true"></span></label>`, t('publish.extractTip'))}
      ${row('pagesTree', t('publish.pages'), `<span class="path" title="${escapeHtml((p.pages ?? []).map(([n, f]) => `${n} (${f})`).join(', '))}">${escapeHtml((p.pages ?? []).map(([, f]) => f).join(' · '))}</span>`)}
      ${row('file', t('publish.size'), `<span>${escapeHtml(t('publish.sizeValue', { files: p.files ?? 0, size: formatBytesShort(p.size ?? 0) }))}</span>`)}
      <h3 class="section-title">${icon(checks.length ? 'warning' : 'checkSite')}${escapeHtml(checks.length ? t('publish.checks', { count: checks.length }) : t('check.ok'))}</h3>
      ${checks.length ? `<ul class="confirm-items publish-checks">${checks.slice(0, 6).map((c) => `<li title="${escapeHtml(c)}">${icon('warning')}<span>${escapeHtml(c)}</span></li>`).join('')}${checks.length > 6 ? `<li>… +${checks.length - 6}</li>` : ''}</ul>` : `<p class="muted hint">${escapeHtml(t('publish.ready'))}</p>`}
      <p class="muted hint">${escapeHtml(t('publish.hostHint'))}</p>
    </div>`,
    foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('publish-apply', t('publish.go'), 'publish', 'primary')}`,
  });
  fitHeight();
  ready();
}


// ───────────────────────── events

// ───────────────────────── packages (Settings › Packages and the packages window)

/** One card per package: what it is for, its state, a progress bar while it downloads, and its buttons. */
function packagesHtml() {
  const views = PACKAGES.map((pkg) => [pkg, packageView(pkg.id)]);
  const busy = views.some(([, v]) => ['download', 'queued', 'saving'].includes(v.phase));
  const missing = views.filter(([, v]) => v.state !== 'installed').map(([pkg]) => pkg.id);
  const card = ([pkg, v]) => {
    const running = v.phase === 'download' || v.phase === 'saving';
    const queued = v.phase === 'queued';
    const failed = v.phase === 'failed' && v.state !== 'installed';
    const pct = v.total ? Math.floor((v.received / v.total) * 100) : 0;
    const badge = running ? ['download', t('packages.state.downloading', { pct })] : queued ? ['queued', t('packages.state.queued')] : failed ? ['failed', t('packages.state.failed')]
      : v.state === 'installed' ? ['installed', t('packages.state.installed', { version: pkg.version })] : v.state === 'outdated' ? ['outdated', t('packages.state.outdated', { version: v.installed })] : ['missing', t('packages.state.missing')];
    const buttons = running || queued
      ? button('package-cancel', t('packages.cancel'), 'stop', 'small danger')
      : [
        v.state === 'installed' ? button('package-install', t('packages.reinstall'), 'refresh', 'small', pkg.id) : button('package-install', failed ? t('packages.retry') : t('packages.install'), failed ? 'refresh' : 'importFile', 'small primary', pkg.id),
        v.state !== 'missing' ? button('package-remove', t('packages.remove'), 'trash', 'small', pkg.id, busy ? 'disabled' : '') : '',
      ].join('');
    return `<section class="package-card ${badge[0]}" data-package="${pkg.id}">
      <div class="package-head">${icon('importFile')}<b>${escapeHtml(pkg.name)}</b><span class="muted">${escapeHtml(pkg.version)} · ${escapeHtml(formatSize(packageSize(pkg)))} · ${escapeHtml(pkg.license)}</span><span class="grow"></span><span class="package-badge ${badge[0]}">${escapeHtml(badge[1])}</span></div>
      <div class="package-purpose">${escapeHtml(pkg[L()] ?? pkg.en)}</div>
      ${running || queued ? `<div class="progress-bar ${queued ? 'indeterminate' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${queued ? 30 : pct}%"></i></div><div class="muted package-bytes">${escapeHtml(t('packages.bytes', { done: formatSize(v.received), total: formatSize(v.total || packageSize(pkg)) }))}</div>` : ''}
      ${failed && v.error ? `<div class="package-error">${icon('warning')}<span>${escapeHtml(t('packages.errorText', { error: v.error }))}</span></div>` : ''}
      <div class="package-actions">${buttons}</div>
    </section>`;
  };
  return `<div class="packages-view">
    ${toggle('autoDownloadPackages', t('settings.autoDownloadPackages'), 'importFile')}
    <div class="packages-list">${views.map(card).join('')}</div>
    <div class="packages-foot"><span class="muted">${escapeHtml(t('packages.hint'))}</span><span class="grow"></span>
      ${busy ? button('package-cancel', t('packages.cancelAll'), 'stop', 'small danger') : button('package-install-all', t('packages.installAll'), 'importFile', 'small primary', '', missing.length ? '' : 'disabled')}</div>
  </div>`;
}

function settingsPackages() {
  return packagesHtml();
}

function renderPackages() {
  root.innerHTML = frame({
    glyph: 'importFile', title: t('packages.title'),
    body: packagesHtml(),
    foot: `<span class="grow"></span>${button('close', t('common.close'), 'close', 'primary')}`,
  });
  ready();
}

// ───────────────────────── print

/** The job (the site's pages) comes from IndexedDB; the window's own choices from localStorage. */
async function loadPrintJob() {
  state.printJob = 'loading';
  try {
    const job = await idbGet(PRINT_JOB_KEY);
    state.printJob = job?.pages ? job : { pages: [], title: '' };
  } catch {
    state.printJob = { pages: [], title: '' };
  }
  state.print = null;
  state.page = 0;
  render();
}

function printSetup() {
  if (!state.print) {
    let saved = {};
    try { saved = JSON.parse(globalThis.localStorage?.getItem(PRINT_SETUP_KEY) ?? '{}') ?? {}; } catch { saved = {}; }
    const job = state.printJob && state.printJob !== 'loading' ? state.printJob : null;
    state.print = normalizePrintOptions({ ...defaultPrintOptions(), device: job?.device in PRINT_DEVICES ? job.device : 'desktop', ...saved, range: 'all', from: 1, to: job?.pages.length || 1 });
  }
  return state.print;
}

function printLayout() {
  const job = state.printJob;
  if (!job || job === 'loading') return { sheets: [], count: 0, paper: { width: 210, height: 297 } };
  return jobLayout(job, printSetup(), job.currentPageId, selectPrintPages);
}

let printHost = null;
let printKey = '';
let printFrames = Promise.resolve();

function renderPrint() {
  if (!state.printJob) loadPrintJob();
  const job = state.printJob && state.printJob !== 'loading' ? state.printJob : { pages: [] };
  const options = printSetup();
  const count = job.pages.length;
  const sel = (key, values, label) => select('data-print', key, values, options[key], label);
  const check = (key, label, glyph) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-print-toggle="${key}" ${options[key] ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
  // The printers are asked for once; until then, and without any, the system dialog prints.
  if (!state.printers) {
    state.printers = { printers: [], defaultPrinter: '' };
    native.listPrinters().then((list) => { state.printers = list; if (list.printers.length) render(); }).catch(() => {});
  }
  const { printers, defaultPrinter } = state.printers;
  const measured = state.printJob !== 'loading' && state.printMeasured === options.device;
  const layout = measured ? printLayout() : { sheets: [], count: 0 };
  const section = (glyph, title, rows) => `<section class="print-section"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${rows.join('')}</section>`;
  state.page = Math.max(0, Math.min(state.page, Math.max(0, layout.count - 1)));
  const summary = measured ? t('print.summaryText', { pages: selectPrintPages(job.pages, options, job.currentPageId).length, sheets: layout.count }) : t('print.measuring');
  root.innerHTML = frame({
    glyph: 'print', title: t('print.title'),
    body: `<div class="print-view">
      <div class="print-options">
        <div class="print-column">
        ${section('print', t('print.printer'), [
          printers.length ? row('print', t('print.printer'), select('data-print', 'printer', [['', t('print.defaultPrinter', { name: defaultPrinter || '-' }), 'print'], ...printers.map((name) => [name, name, 'print'])], printers.includes(options.printer) ? options.printer : '', t('print.printer'))) : row('info', '', `<span class="muted">${escapeHtml(t('print.systemDialog'))}</span>`),
          printers.length ? row('duplicate', t('print.copies'), numberField('print:copies', options.copies, 1, 99, 1, '', t('print.copies'))) : '',
        ])}
        ${section('list', t('print.tabRange'), [
          ...RANGES.map((range) => `<label class="row radio-row" title="${escapeHtml(t(`print.range.${range}`))}"><input type="radio" name="range" data-print-range="${range}" ${options.range === range ? 'checked' : ''} /><span>${icon({ all: 'selectAll', current: 'eye', custom: 'filter' }[range])}${escapeHtml(t(`print.range.${range}`))}</span></label>`),
          row('list', t('print.pages'), `${numberField('print:from', Math.min(options.from, Math.max(1, count)), 1, Math.max(1, count), 1, '', t('print.from'))}<span>–</span>${numberField('print:to', Math.min(options.to, Math.max(1, count)), 1, Math.max(1, count), 1, '', t('print.to'))}`, t('print.pages'), options.range === 'custom' ? '' : 'disabled-row'),
          row('info', t('print.summary'), `<span class="muted" id="print-summary">${escapeHtml(summary)}${layout.truncated ? ` · ${escapeHtml(t('print.truncated'))}` : ''}</span>`),
        ])}
        ${section('notes', t('print.tabHeader'), [
          check('header', t('print.header'), 'notes'),
          row('edit', t('print.headerText'), `<input type="text" data-print-text="headerText" value="${escapeHtml(options.headerText)}" placeholder="${escapeHtml(job.siteName || job.title || '')}" title="${escapeHtml(t('print.headerText'))}" />`),
          check('footer', t('print.footer'), 'pageSetup'),
          row('edit', t('print.footerText'), `<input type="text" data-print-text="footerText" value="${escapeHtml(options.footerText)}" placeholder="MyHomeMaker" title="${escapeHtml(t('print.footerText'))}" />`),
        ])}
        </div>
        <div class="print-column">
        ${section('pageSetup', t('print.tabPage'), [
          row('file', t('print.paper'), sel('paper', Object.keys(PAPERS).map((paper) => [paper, paper]), t('print.paper'))),
          row('pageSetup', t('print.orientation'), segmented('orientation', [['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], options.orientation, 'data-print-segment')),
          row('fitPage', t('print.margin'), sel('margin', Object.keys(MARGINS).map((margin) => [margin, t(`print.margin.${margin}`)]), t('print.margin'))),
          row('viewSwitch', t('print.device'), segmented('device', Object.keys(PRINT_DEVICES).map((device) => [device, t(`print.device.${device}`)]), options.device, 'data-print-segment')),
          row('zoomIn', t('print.fit'), segmented('fit', FITS.map((fit) => [fit, t(`print.fit.${fit}`)]), options.fit, 'data-print-segment')),
          row('zoomIn', t('print.scale'), numberField('print:scale', options.scale, 10, 400, 10, '%', t('print.scale')), t('print.scale'), options.fit === 'percent' ? '' : 'disabled-row'),
          check('background', t('print.background'), 'fillColor'),
        ])}
        </div>
      </div>
      <div class="print-preview" id="print-preview">${count || state.printJob === 'loading' ? '' : `<div class="preview-empty">${icon('info')}<span>${escapeHtml(t('print.empty'))}</span></div>`}</div>
    </div>`,
    foot: `<button class="icon-button" data-action="page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${state.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <span class="page-number" id="page-number">${escapeHtml(t('print.page', { n: layout.count ? state.page + 1 : 0, total: layout.count }))}</span>
      <button class="icon-button" data-action="page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${state.page >= layout.count - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
      <span class="grow"></span>
      <button class="button primary" data-action="print" title="${escapeHtml(t('print.print'))}" ${layout.count ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(t('print.print'))}</span></button>
      ${button('close', t('common.close'), 'close')}`,
  });
  ready();
  if (state.printJob === 'loading' || !count) { printHost?.replaceChildren(); printKey = ''; fitPreview(); return; }
  if (!measured) {
    const device = options.device;
    measurePages(job, device).then(() => { state.printMeasured = device; render(); });
    return;
  }
  drawSheets(job, layout, options);
}

function drawSheets(job, layout, options) {
  if (!printHost) {
    printHost = document.createElement('div');
    printHost.id = 'print-host';
    printHost.addEventListener('scroll', () => {
      const sheets = [...printHost.querySelectorAll('.print-page')];
      const zoom = Number(printHost.dataset.zoom) || 1;
      const top = printHost.scrollTop + printHost.clientHeight / 3;
      const index = Math.max(0, sheets.findLastIndex((sheet) => sheet.offsetTop * zoom <= top));
      if (index !== state.page) { state.page = index; updatePageNumber(); }
    }, { passive: true });
    document.body.append(printHost);
  }
  const key = sheetsKey(options, layout);
  if (key !== printKey) {
    printKey = key;
    printHost.innerHTML = `<div class="print-zoom">${sheetsHtml(job, layout, options, { t, siteName: job.siteName || job.title })}</div>`;
    printFrames = fillFrames(printHost, job, options);
  }
  let style = document.querySelector('#page-style');
  if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
  // A hair under the paper's height: a sheet exactly as tall as the page can round over it and print an empty page.
  style.textContent = `@page { size: ${layout.paper.width}mm ${layout.paper.height}mm; margin: 0; }
@media print { #print-host .print-page { height: ${layout.paper.height - 0.5}mm !important; } }`;
  fitPreview();
}

function updatePageNumber() {
  const total = printHost?.querySelectorAll('.print-page').length ?? 0;
  const number = root.querySelector('#page-number');
  if (number) number.textContent = t('print.page', { n: total ? state.page + 1 : 0, total });
  const [prev, next] = root.querySelectorAll('[data-action="page"]');
  if (prev) prev.disabled = state.page <= 0;
  if (next) next.disabled = state.page >= total - 1;
}

/** The sheets over the preview area, zoomed so one whole sheet fits; scrolled to the current one. */
function fitPreview() {
  const area = root.querySelector('#print-preview');
  const zoomBox = printHost?.querySelector('.print-zoom');
  if (!printHost) return;
  if (!area || !zoomBox) { printHost.hidden = true; return; }
  printHost.hidden = false;
  const box = area.getBoundingClientRect();
  Object.assign(printHost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  const sheet = zoomBox.querySelector('.print-page');
  if (!sheet) return;
  zoomBox.style.zoom = '1';
  const zoom = Math.min((box.width - 40) / sheet.offsetWidth, (box.height - 32) / sheet.offsetHeight);
  zoomBox.style.zoom = String(zoom);
  printHost.dataset.zoom = String(zoom);
  showSheet(state.page);
}

function showSheet(index) {
  const sheets = printHost?.querySelectorAll('.print-page') ?? [];
  const sheet = sheets[Math.min(index, sheets.length - 1)];
  if (!sheet) return;
  const zoom = Number(printHost.dataset.zoom) || 1;
  printHost.scrollTop = Math.max(0, sheet.offsetTop * zoom - 16);
  state.page = Math.min(index, sheets.length - 1);
  updatePageNumber();
}

function changePrint(patch) {
  state.print = normalizePrintOptions({ ...printSetup(), ...patch });
  const { range, from, to, ...setup } = state.print;
  void range; void from; void to;
  try { globalThis.localStorage?.setItem(PRINT_SETUP_KEY, JSON.stringify(setup)); } catch { /* not kept */ }
  render();
}

async function doPrint() {
  const go = root.querySelector('[data-action="print"]');
  if (go) go.disabled = true;
  try {
    await printFrames;
    const layout = printLayout();
    const options = printSetup();
    const job = { printer: state.printers?.printers.includes(options.printer) ? options.printer : '', copies: options.copies ?? 1, widthMm: layout.paper.width, heightMm: layout.paper.height };
    if (window.__myhomemakerPrintHook) await window.__myhomemakerPrintHook(layout, job);
    else if (state.printers?.printers.length) await native.printDirect(job);
    else await native.printWindow();
    action('printed');
  } catch (error) {
    action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
  } finally {
    if (go) go.disabled = false;
  }
}

window.addEventListener('resize', () => { if (kind === 'print') fitPreview(); });

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-setting], .menu-item, [data-theme-group], [data-pick-theme], [data-draft-segment], [data-pick-design], [data-pick-template], [data-pick-sample], [data-print-segment]');
  if (!target || target.disabled) return undefined;
  if (target.dataset.printSegment) return changePrint({ [target.dataset.printSegment]: target.dataset.value });
  if (target.classList.contains('menu-item')) return chooseMenu(target.dataset.id, target);
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const raw = target.dataset.value;
    return update({ [key]: typeof s()[key] === 'number' ? Number(raw) : raw });
  }
  if (target.dataset.themeGroup) { state.themeGroup = target.dataset.themeGroup; return render(); }
  if (target.dataset.pickTheme) { pickerDone = true; return close({ theme: target.dataset.pickTheme }); }
  const d = state.draft;
  if (target.dataset.pickDesign) {
    d.current = target.dataset.pickDesign;
    for (const el of root.querySelectorAll('.design-card')) { const on = el.dataset.pickDesign === d.current; el.classList.toggle('active', on); el.setAttribute('aria-checked', String(on)); }
    return event.detail >= 2 ? close({ design: d.current, reset: d.reset }) : undefined;
  }
  if (target.dataset.pickTemplate) { d.template = target.dataset.pickTemplate; d.sample = null; render(); return event.detail >= 2 ? close({ template: d.template, name: d.name, design: d.design }) : undefined; }
  if (target.dataset.pickSample) { d.sample = target.dataset.pickSample; render(); return event.detail >= 2 ? close({ sample: d.sample, name: d.name }) : undefined; }
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
      return close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null);
    case 'tab': state.tab = value; state.dictNote = null; return render();
    case 'dict-add': return addDictionaryWord();
    case 'dict-remove': state.dictNote = null; return update({ userWords: (s().userWords ?? []).filter((w) => w !== value) });
    case 'dict-clear': state.dictNote = null; state.pager.dict = 0; return update({ userWords: [] });
    case 'design-group': d.group = value; return render();
    case 'template-group': d.group = value; return render();
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
    case 'copy-error':
      try { await copyText(errorReport()); state.copied = true; render(); } catch (error) { root.querySelector('#copy-state').textContent = `${t('error.copyFailed')}: ${native.errorText(error)}`; }
      return undefined;
    case 'copy-about':
      return copyText([...root.querySelectorAll('#about-rows dt')].map((dt) => `${dt.textContent.trim()}: ${dt.nextElementSibling.textContent.trim()}`).join('\n')).then(() => action('notice', { kind: 'success', text: t('error.copied') }));
    case 'use-custom': return update({ theme: CUSTOM });
    case 'copy-theme': { const from = resolveTheme(s().theme === CUSTOM ? 'light' : s().theme, prefersDark(), s().customTheme); return update({ customTheme: customFrom(from) }); }
    case 'edit-custom': pickerDone = true; await action('open-settings', { tab: 'appearance', themeGroup: 'custom' }); return close();
    case 'random-theme': { const all = [...LIGHT_THEMES, ...DARK_THEMES].map((theme) => theme.id).filter((id) => id !== s().theme); pickerDone = true; return close({ theme: all[Math.floor(Math.random() * all.length)] }); }
    case 'prompt-apply': return close({ value: d.value, choice: d.choice });
    case 'design-apply': return close({ design: d.current, reset: d.reset });
    case 'template-create': return close(d.sample ? { sample: d.sample, name: d.name.trim() } : { template: d.template, name: d.name.trim(), design: d.design });
    case 'publish-apply': return close({ format: d.format, extract: d.extract });
    case 'print': return doPrint();
    case 'package-install': return action('package-install', { ids: [value] });
    case 'package-install-all': return action('package-install', { ids: PACKAGES.filter((pkg) => packageView(pkg.id).state !== 'installed').map((pkg) => pkg.id) });
    case 'package-cancel': return action('package-cancel');
    case 'package-remove': return action('package-remove', { id: value });
    case 'page': return showSheet(Math.max(0, state.page + Number(value)));
    default: return undefined;
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  const d = state.draft;
  if (target.dataset.toggle) return update({ [target.dataset.toggle]: target.checked });
  if (target.dataset.select) { const key = target.dataset.select; return update({ [key]: typeof s()[key] === 'number' ? Number(target.value) : target.value }); }
  if (target.dataset.customColor) return update({ customTheme: { ...s().customTheme, [target.dataset.customColor]: target.value }, theme: CUSTOM });
  if ('customDark' in target.dataset) return update({ customTheme: { ...s().customTheme, dark: target.checked }, theme: CUSTOM });
  if (target.dataset.draftToggle && d) {
    if (target.dataset.draftToggle === 'keep') d.reset = !target.checked;
    else d[target.dataset.draftToggle] = target.checked;
    return render();
  }
  if (target.dataset.draftSelect && d) { d[target.dataset.draftSelect] = target.value; return render(); }
  if (target.dataset.settingText) return update({ [target.dataset.settingText]: target.value.trim() });
  if (target.dataset.printRange) return changePrint({ range: target.dataset.printRange });
  if (target.dataset.printToggle) return changePrint({ [target.dataset.printToggle]: target.checked });
  if (target.dataset.print) return changePrint({ [target.dataset.print]: target.value });
  if (target.dataset.printText) return changePrint({ [target.dataset.printText]: target.value });
  return undefined;
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset.draft && state.draft) state.draft[target.dataset.draft] = target.value;
  if (target.id === 'dict-word') state.dictDraft = target.value;
  if (target.id === 'dict-find') { state.dictQuery = target.value; state.pager.dict = 0; render(); const find = root.querySelector('#dict-find'); find?.focus(); find?.setSelectionRange(find.value.length, find.value.length); }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (kind === 'menu') { if (!closeInnermostSubmenu()) chooseMenu(null); }
    else if (kind !== 'progress') close(kind === 'confirm' || kind === 'welcome' ? { choice: 'cancel' } : null);
  }
  if (kind === 'menu') {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveMenuFocus(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveMenuFocus(-1); }
    if (event.key === 'Enter' && document.activeElement?.classList.contains('menu-item')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id, document.activeElement); }
    if (event.key === 'ArrowRight' && document.activeElement?.classList.contains('has-sub')) { event.preventDefault(); chooseMenu(document.activeElement.dataset.id, document.activeElement); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); closeInnermostSubmenu(); }
  }
  if (kind === 'print' && event.key === 'PageDown') { event.preventDefault(); showSheet(state.page + 1); }
  if (kind === 'print' && event.key === 'PageUp') { event.preventDefault(); showSheet(Math.max(0, state.page - 1)); }
  if (event.key === 'Enter' && event.target.id === 'dict-word') { event.preventDefault(); addDictionaryWord(); return; }
  if (event.key === 'Enter' && event.target.matches?.('input[type="text"]') && !event.target.matches('.stepper-value')) {
    const primary = { prompt: 'prompt-apply', template: 'template-create' }[kind];
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

/** The main window (undecorated) can take the activation back by itself right after a dropdown got it: undone. */
function regainedFromMain(lostAt) {
  if (!desktop) return false;
  const time = (key) => { try { return Number(globalThis.localStorage?.getItem(key)) || 0; } catch { return 0; } };
  if (time('myhomemaker.main.focus') < lostAt - 100 || time('myhomemaker.main.input') >= lostAt - 400) return false;
  window.focus();
  native.invoke('popup_ready').catch(() => {});
  return true;
}

// The theme dropdown closes when it loses focus.
window.addEventListener('blur', () => {
  const lostAt = Date.now();
  if (kind === 'theme' && !pickerDone) setTimeout(() => { if (!document.hasFocus() && !pickerDone && !regainedFromMain(lostAt)) { pickerDone = true; close(); } }, 150);
});

// Number fields (steppers).
bindSteppers(root, (key, value) => (key.startsWith('print:') ? changePrint({ [key.slice(6)]: value }) : update({ [key]: value })));

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
    if (!['menu'].includes(kind)) render();
  } else if (event.key === PACKAGES_STATE_KEY && (kind === 'packages' || (kind === 'settings' && state.tab === 'packages'))) {
    render();
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
  state.draft = null;
  if (kind === 'print') { state.printJob = null; state.printMeasured = null; state.print = null; printKey = ''; }
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
    if (event.origin === location.origin && event.data?.myhomemakerHost) onHostMessage(event.data);
  });
}

applyLook();
render();

// Test hook (E2E): state and actions of this popup.
window.__myhomemakerPopup = { kind, state, render, close, errorReport, refresh, printLayout, printSetup, changePrint };

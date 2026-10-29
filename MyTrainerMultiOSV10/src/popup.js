// Popup windows. Each runs this page in its own OS window (desktop, label
// "popup-<kind>") or in a frame (web build: ?popup=<kind>). Every popup has a
// fixed size chosen so its content fits; long content is split into tabs.
//   settings · about · confirm · error · progress · pyenv (Python / PyTorch) · samples · prompt · shortcuts
import { getCurrentWindow } from '@tauri-apps/api/window';
import appIcon from '../assets/icon-256.png';
import { SAMPLE_GROUPS, SAMPLE_IDS, SAMPLES } from './domain/samples.js';
import { defaultReportSettings, renderPages } from './report/report.js';
import { COLOR_MAPS, FONT_SIZE, FONT_STYLES, FONT_WEIGHTS, defaultSettings, loadSettings, storeSettings, CODE_FONT_SIZE } from './domain/settings.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { popupParams } from './platform/popups.js';
import { bindSteppers, stepperHtml } from './stepper.js';
import { applyFont, applyTheme, CUSTOM, CUSTOM_KEYS, customFrom, customTheme, DARK_THEMES, LIGHT_THEMES, normalizeCustom, resolveTheme, SYSTEM, themeName } from './themes.js';
import { escapeHtml } from './ui/dom.js';
import { showContextMenu, textMenuItems } from './ui/contextmenu.js';

const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const kind = new URLSearchParams(location.search).get('popup') ?? (desktop ? appWindow.label.replace(/^popup-/, '') : 'settings');
const root = document.querySelector('#app');
document.title = `popup-${kind}`;
document.documentElement.classList.add(`popup-kind-${kind}`);
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

// ───────────────────────── bridge to the main window

function send(type, data) {
  if (desktop) return native.emitTo('main', 'popup-message', { kind, type, data }).catch(() => {});
  globalThis.parent?.postMessage({ mytrainer: true, kind, type, data }, location.origin);
  return Promise.resolve();
}
const result = (data) => send('result', data);
const action = (name, data = {}) => send('action', { action: name, ...data });

async function close(value = null) {
  if (value) await result(value);
  if (desktop) await native.invoke('close_popup', { kind }).catch(() => {});
  else send('close');
}

let shown = false;
function ready() {
  if (shown) return;
  shown = true;
  if (desktop) native.invoke('popup_ready').catch(() => {});
  else send('ready');
}

const state = {
  settings: loadSettings(globalThis.localStorage),
  params: popupParams(kind),
  tab: { font: 'fontCode', code: 'fontCode', visual: 'general', python: 'general' }[popupParams(kind).tab] ?? popupParams(kind).tab ?? 'general',
  fonts: null,
  info: null,
  log: [],
  installing: false,
  detecting: false,
  message: null,
  group: null,
};
const s = () => state.settings;
// Settings: every change shows in the main window at once; Cancel puts back what was there when the window opened.
let original = kind === 'settings' ? { ...state.settings } : null;
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
  if (kind === 'settings') action('settings-preview');
  render();
}

/** Reset: the defaults of what this window shows (the window layout and the Python set-up are kept). */
function resetSettings() {
  const keep = ['language', 'showLeftPanel', 'showRightPanel', 'showBottomPanel', 'showStatusBar', 'leftWidth', 'rightWidth', 'bottomHeight', 'pythonAutoSetup', 'micGain', 'micThreshold'];
  const defaults = defaultSettings(s().language);
  for (const key of keep) delete defaults[key];
  update(defaults);
}

function cancelSettings() {
  state.settings = { ...original };
  storeSettings(globalThis.localStorage, state.settings);
  action('settings-preview');
  close(null);
}

/** The window's × and Escape: Cancel in the settings, else what each popup does. */
function dismiss() {
  if (kind === 'settings') cancelSettings();
  else close(kind === 'confirm' ? { choice: 'cancel' } : null);
}

window.addEventListener('error', (event) => action('report-error', { message: String(event.error?.message ?? event.message), detail: String(event.error?.stack ?? ''), context: `popup-${kind}` }));

// ───────────────────────── frame and controls

function frame({ glyph, title, body, foot = '', tabs = '' }) {
  if (desktop) appWindow.setTitle(`${title} — MyTrainer v${VERSION}`).catch(() => {});
  return `<div class="popup popup-${kind}" role="dialog" aria-labelledby="popup-title">
    <header class="popup-head" data-window-drag>
      <h2 id="popup-title" data-window-drag>${icon(glyph)}<span data-window-drag>${escapeHtml(title)}</span></h2>
      <button class="window-button" data-action="close" title="${escapeHtml(t('common.close'))}" aria-label="${escapeHtml(t('common.close'))}">${icon('close')}</button>
    </header>
    ${tabs}
    <div class="popup-body">${body}</div>
    ${foot ? `<footer class="popup-foot">${foot}</footer>` : ''}
  </div>`;
}

const button = (name, label, glyph = '', extra = '', value = '', attrs = '') => `<button class="button ${extra}" data-action="${name}" ${value !== '' ? `data-value="${escapeHtml(value)}"` : ''} ${attrs}>${glyph ? icon(glyph) : ''}<span>${escapeHtml(label)}</span></button>`;
const row = (glyph, label, control, title = label) => `<div class="row" title="${escapeHtml(title)}"><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control">${control}</span></div>`;
const toggle = (key, label, glyph, title = label) => row(glyph, label, `<label class="switch-wrap"><input type="checkbox" data-toggle="${key}" ${s()[key] ? 'checked' : ''} aria-label="${escapeHtml(label)}"/><span class="switch"></span></label>`, title);
const select = (key, options, current, label) => `<select data-setting="${key}" aria-label="${escapeHtml(label)}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(current) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
const tabsHtml = (list, current) => `<nav class="tabs" role="tablist"><div class="tabs-strip">${list.map(([id, glyph, label]) => `<button class="tab ${current === id ? 'active' : ''}" data-tab="${id}" role="tab">${icon(glyph)} ${escapeHtml(label)}</button>`).join('')}</div></nav>`;

// ───────────────────────── popups

function render() {
  const renderers = { report: renderReport, summary: renderSummary, export: renderExport, settings: renderSettings, about: renderAbout, welcome: renderWelcome, confirm: renderConfirm, error: renderError, progress: renderProgress, pyenv: renderPyEnv, samples: renderSamples, prompt: renderPrompt, shortcuts: renderShortcuts, themes: renderThemes };
  const html = (renderers[kind] ?? renderSettings)();
  if (html != null) root.innerHTML = html;
  bindSteppers(root, (key, value) => update({ [key]: value }));
  if (kind === 'report') drawReportPreview().catch(() => {});
  requestAnimationFrame(ready);
}

/** The theme drop-down: dark themes (two columns), light themes (two columns), custom, system. Picks apply at once. */
function renderThemes() {
  const current = s().theme;
  const cell = (theme) => `<button class="theme-row compact-cell ${current === theme.id ? 'active' : ''}" data-pick-theme="${theme.id}" title="${escapeHtml(theme.name[L()] ?? theme.name.en)}"><span class="swatches">${theme.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span class="theme-name">${escapeHtml(theme.name[L()] ?? theme.name.en)}</span></button>`;
  const group = (glyph, title, list) => `<h4 class="themes-head">${icon(glyph, 'icon tiny')}<span>${escapeHtml(title)} (${list.length})</span></h4><div class="themes-grid">${list.map(cell).join('')}</div>`;
  return `<div class="themes-drop" role="menu">
    ${group('moon', t('settings.dark'), DARK_THEMES)}
    ${group('sun', t('settings.light'), LIGHT_THEMES)}
    <div class="menu-sep"></div>
    <div class="themes-foot">
      <span class="themes-custom"><button class="theme-row wide-row ${current === CUSTOM ? 'active' : ''}" data-pick-theme="${CUSTOM}">${icon('palette', 'icon tiny')}<span class="swatches">${customTheme(s().customTheme).swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span>${escapeHtml(t('settings.customTheme'))}</span></button><button class="icon-button" data-edit-custom title="${escapeHtml(t('menu.customThemeEdit'))}">${icon('edit')}</button></span>
      <button class="theme-row wide-row ${current === SYSTEM ? 'active' : ''}" data-pick-theme="${SYSTEM}">${icon('globe', 'icon tiny')}<span>${escapeHtml(t('settings.systemTheme'))}</span></button>
    </div>
  </div>`;
}

function renderSettings() {
  // Four tabs of about the same height (the window has one fixed size): general with visualization and
  // PyTorch, the theme list, the custom theme, font with code.
  const tabs = [['general', 'gear', t('settings.general')], ['appearance', 'palette', t('settings.appearance')], ['custom', 'edit', t('settings.customTheme')], ['fontCode', 'font', t('settings.fontCode')]];
  const section = (glyph, title) => `<h4 class="settings-section">${icon(glyph, 'icon tiny')}<span>${escapeHtml(title)}</span></h4>`;
  let body = '';
  switch (state.tab) {
    case 'general':
      body = row('globe', t('settings.language'), `<span class="segmented"><button class="segment ${s().language === 'ko' ? 'active' : ''}" data-set="language" data-value="ko">한국어</button><button class="segment ${s().language === 'en' ? 'active' : ''}" data-set="language" data-value="en">English</button></span>`)
        + toggle('showWelcome', t('settings.showWelcome'), 'tutorial')
        + toggle('showStartPage', t('settings.showStartPage'), 'home')
        + toggle('confirmExit', t('settings.confirmExit'), 'exit')
        + toggle('saveWeights', t('settings.saveWeights'), 'save')
        + toggle('notifyTrainDone', t('settings.notifyTrainDone'), 'flag')
        + section('nodesView', t('settings.visual'))
        + row('palette', t('model.colorMap'), select('colorMap', COLOR_MAPS.map((m) => [m, t(`colorMap.${m}`)]), s().colorMap, t('model.colorMap')), t('settings.visualHint'))
        + row('neuron', t('model.maxNeurons'), stepperHtml({ key: 'maxNeurons', value: s().maxNeurons, min: 4, max: 64, step: 4, label: t('model.maxNeurons') }), t('settings.visualHint'))
        + toggle('animateFlow', t('model.animate'), 'animNeural')
        + section('python', t('settings.python'))
        + row('python', t('settings.pythonPath'), `<input type="text" data-setting="pythonPath" value="${escapeHtml(s().pythonPath)}" spellcheck="false" placeholder="${escapeHtml(t('settings.pythonAuto'))}"/>`, t('settings.pythonHint'))
        + row('install', t('settings.torchVariant'), select('torchVariant', ['auto', 'cpu', 'cuda', 'default'].map((v) => [v, t(`py.variant.${v}`)]), s().torchVariant, t('settings.torchVariant')), t('settings.pythonHint'));
      break;
    case 'appearance': {
      const themeRow = (theme) => `<button class="theme-row ${s().theme === theme.id ? 'active' : ''}" data-set="theme" data-value="${theme.id}"><span class="swatches">${theme.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span>${escapeHtml(theme.name[L()] ?? theme.name.en)}</span></button>`;
      body = `<div class="theme-head">${row('palette', t('settings.theme'), `<button class="theme-row ${s().theme === SYSTEM ? 'active' : ''}" data-set="theme" data-value="${SYSTEM}">${icon('sun')}<span>${escapeHtml(themeName(SYSTEM, L()))}</span></button>`)}</div>
        <div class="theme-columns"><div><h4>${icon('sun', 'icon tiny')} ${escapeHtml(t('settings.light'))} (${LIGHT_THEMES.length})</h4><div class="theme-grid">${LIGHT_THEMES.map(themeRow).join('')}</div></div>
        <div><h4>${icon('moon', 'icon tiny')} ${escapeHtml(t('settings.dark'))} (${DARK_THEMES.length})</h4><div class="theme-grid">${DARK_THEMES.map(themeRow).join('')}</div></div></div>
        <div class="theme-head">${row('edit', t('settings.customTheme'), `${themeRow(customTheme(s().customTheme))}<button class="button small" data-tab="custom">${icon('edit')}<span>${escapeHtml(t('menu.customThemeEdit'))}</span></button>`)}</div>`;
      break;
    }
    case 'custom': {
      const custom = normalizeCustom(s().customTheme ?? customFrom(resolveTheme(s().theme === CUSTOM ? 'light' : s().theme, prefersDark(), null)));
      const preview = customTheme(custom);
      body = `<p class="muted">${escapeHtml(t('settings.customHint'))}</p>
        ${row('palette', t('settings.useCustom'), `<label class="switch-wrap"><input type="checkbox" data-custom-use ${s().theme === CUSTOM ? 'checked' : ''}/><span class="switch"></span></label>`)}
        ${row('moon', t('settings.customDark'), `<label class="switch-wrap"><input type="checkbox" data-custom-dark ${custom.dark ? 'checked' : ''}/><span class="switch"></span></label>`)}
        <div class="custom-colors">${CUSTOM_KEYS.map((key) => `<label class="custom-color"><input type="color" data-custom-color="${key}" value="${custom[key]}"/><span>${escapeHtml(t(`color.${key}`))}</span><code>${custom[key]}</code></label>`).join('')}</div>
        <div class="custom-actions">
          <select data-custom-from><option value="">${escapeHtml(t('settings.customFrom'))}</option>${[...LIGHT_THEMES, ...DARK_THEMES].map((th) => `<option value="${th.id}">${escapeHtml(th.name[L()] ?? th.name.en)}</option>`).join('')}</select>
        </div>
        <div class="custom-preview" style="background:${preview.colors.bg};color:${preview.colors.text};border-color:${preview.colors.border}">
          <div class="preview-bar" style="background:${preview.colors.panel ?? preview.colors.surface};border-bottom:1px solid ${preview.colors.border}"><b>MyTrainer</b><span style="color:${preview.colors.muted}">${escapeHtml(t('settings.previewMuted'))}</span></div>
          <div class="preview-main">
            <span class="preview-chip" style="background:${preview.colors.surface};border:1px solid ${preview.colors.border}">${escapeHtml(t('settings.previewSurface'))}</span>
            <span class="preview-chip" style="background:${preview.colors.accent};color:${preview.colors.accentText}">${escapeHtml(t('settings.previewAccent'))}</span>
            <span style="color:${preview.colors.muted}">${escapeHtml(t('settings.previewMuted'))}</span>
          </div>
        </div>`;
      break;
    }
    case 'fontCode':
      if (!state.fonts) native.listFonts().then((fonts) => { state.fonts = fonts; render(); }).catch(() => { state.fonts = []; render(); });
      body = row('font', t('settings.fontFamily'), `<select data-setting="fontFamily"><option value="">${escapeHtml(t('settings.fontDefault'))}</option>${(state.fonts ?? []).map((f) => `<option value="${escapeHtml(f)}" ${s().fontFamily === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}</select>`)
        + row('fontUp', t('settings.fontSize'), stepperHtml({ key: 'fontSize', value: s().fontSize, min: FONT_SIZE.min, max: FONT_SIZE.max, step: 1, unit: 'px', label: t('settings.fontSize') }))
        + row('bold', t('settings.fontWeight'), select('fontWeight', FONT_WEIGHTS.map((w) => [w, String(w)]), s().fontWeight, t('settings.fontWeight')))
        + row('italic', t('settings.fontStyle'), select('fontStyle', FONT_STYLES.map((v) => [v, t(`settings.style.${v}`)]), s().fontStyle, t('settings.fontStyle')))
        + `<p class="font-preview" style="font-family:var(--font-family)">${escapeHtml(t('settings.fontPreview'))}</p>`
        + section('tabCode', t('settings.code'))
        + row('fontUp', t('code.fontSize'), stepperHtml({ key: 'codeFontSize', value: s().codeFontSize, min: CODE_FONT_SIZE.min, max: CODE_FONT_SIZE.max, step: 1, unit: 'px', label: t('code.fontSize') }))
        + toggle('codeWrap', t('code.wrap'), 'textAlignLeft')
        + toggle('codeHooks', t('code.hooks'), 'probe', t('code.hooksTip'))
        + `<pre class="code-preview" style="font-size:${s().codeFontSize}px">model = nn.Sequential(nn.Linear(2, 16), nn.ReLU())  # ${escapeHtml(t('settings.fontPreview'))}</pre>`;
      break;
    default: break;
  }
  return frame({ glyph: 'gear', title: t('settings.title'), tabs: tabsHtml(tabs, state.tab), body: `<div class="settings-body">${body}</div>`, foot: `${button('settingsReset', t('settings.reset'), 'undo', '', '', `title="${escapeHtml(t('settings.resetTip'))}"`)}<span class="grow"></span>${button('settingsOk', t('common.ok'), 'check', 'primary')}${button('settingsCancel', t('common.cancel'), 'close')}` });
}

function renderAbout() {
  if (!state.info) native.appInfo().then((info) => { state.info = info; render(); });
  const i = state.info;
  const rows = i ? [[t('about.version'), i.version], [t('about.build'), `${i.commit} · ${new Date(i.buildDate).toLocaleString(L() === 'en' ? 'en-US' : 'ko-KR')}`], [t('about.target'), i.target], ['Tauri', i.tauri], [t('about.os'), `${i.os} ${i.arch}`]] : [];
  root.innerHTML = frame({
    glyph: 'info', title: t('menu.about'),
    body: `<div class="about"><img src="${appIcon}" alt="" class="about-icon"/><div><h1>MyTrainer</h1><p>${escapeHtml(t('start.tagline'))}</p>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
      <p class="muted small">${escapeHtml(t('about.libraries'))}: TensorFlow.js, PyTorch (${escapeHtml(t('about.optional'))}), CodeMirror 6, Tauri 2</p>
      <p class="muted small">© SHKWON (knix008@naver.com)</p></div></div>`,
    foot: `<span class="grow"></span>${button('close', t('common.close'), 'check', 'primary')}`,
  });
  requestAnimationFrame(ready);
  return null;
}

/** At start: where to begin (tutorial, its document and video, the guide, the samples, a new project), and whether to show this next time. */
function renderWelcome() {
  const go = (value, glyph, label, hint, extra = '') => `<button class="welcome-action ${extra}" data-action="welcomeGo" data-value="${value}" title="${escapeHtml(hint)}">${icon(glyph)}<span><b>${escapeHtml(label)}</b><small>${escapeHtml(hint)}</small></span></button>`;
  root.innerHTML = frame({
    glyph: 'home', title: t('welcome.title'),
    body: `<div class="welcome"><div class="welcome-head"><img src="${appIcon}" alt="" class="about-icon small"/><div><h1>MyTrainer <small>v${escapeHtml(VERSION)}</small></h1><p>${escapeHtml(t('start.tagline'))}</p><p class="muted small">${escapeHtml(t('welcome.lead', { n: P().samples ?? '' }))}</p></div></div>
      <div class="welcome-grid">
        ${go('tutorial', 'tutorial', t('welcome.tutorial'), t('welcome.tutorialHint'), 'primary')}
        ${go('tutorialDoc', 'tutorialDoc', t('menu.tutorialDoc'), t('welcome.tutorialDocHint'))}
        ${go('tutorialVideo', 'tutorialVideo', t('menu.tutorialVideo'), t('welcome.videoHint'))}
        ${go('guide', 'userGuide', t('menu.guide'), t('welcome.guideHint'))}
        ${go('gallery', 'samples', t('start.gallery'), t('welcome.galleryHint'))}
        ${go('new', 'file', t('welcome.new'), t('welcome.newHint'))}
      </div></div>`,
    foot: `<label class="inline-check"><input type="checkbox" data-welcome-show ${s().showWelcome ? 'checked' : ''}/><span>${escapeHtml(t('settings.showWelcome'))}</span></label><span class="grow"></span>${button('close', t('common.close'), 'check')}`,
  });
  requestAnimationFrame(ready);
  return null;
}

function renderConfirm() {
  const p = P();
  const buttons = (p.buttons ?? [['ok', t('common.ok'), 'primary'], ['cancel', t('common.cancel'), '']]).map(([value, label, extra]) => button('choice', label, '', extra, value)).join('');
  return frame({ glyph: 'question', title: p.title ?? t('common.confirm'), body: `<p class="confirm-text">${escapeHtml(p.message ?? '')}</p>`, foot: `<span class="grow"></span>${buttons}` });
}

/**
 * Print / save the results: page settings, the sections and the file format on the left, the pages on the
 * right (drawn by the same layout as the printout and the PDF).
 */
function renderReport() {
  const p = P();
  state.reportSettings ??= { ...defaultReportSettings(), ...(p.settings ?? {}) };
  const st = state.reportSettings;
  state.reportFormat ??= 'pdf';
  const sections = p.report?.sections ?? [];
  const on = (id) => st.sections?.[id] !== false;
  const opt = (value, label, current) => `<option value="${value}" ${String(current) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const side = `<div class="report-side">
      <h4>${icon('pageSetup', 'icon tiny')}${escapeHtml(t('report.page'))}</h4>
      <label class="prop-row"><span class="prop-label">${escapeHtml(t('report.paper'))}</span><span class="prop-control"><select data-report="paper">${opt('a4', 'A4 (210 × 297 mm)', st.paper)}${opt('letter', 'Letter (8.5 × 11 in)', st.paper)}${opt('a3', 'A3 (297 × 420 mm)', st.paper)}</select></span></label>
      <div class="prop-row"><span class="prop-label">${escapeHtml(t('report.orientation'))}</span><span class="prop-control"><span class="segmented"><button class="segment ${st.landscape ? '' : 'active'}" data-report-landscape="0">${escapeHtml(t('report.portrait'))}</button><button class="segment ${st.landscape ? 'active' : ''}" data-report-landscape="1">${escapeHtml(t('report.landscape'))}</button></span></span></div>
      <label class="prop-row"><span class="prop-label">${escapeHtml(t('report.margin'))}</span><span class="prop-control"><select data-report="margin">${[10, 15, 20, 25].map((m) => opt(m, `${m} mm`, st.margin)).join('')}</select></span></label>
      <h4>${icon('list', 'icon tiny')}${escapeHtml(t('report.sections'))}</h4>
      <div class="report-sections">${sections.map((s) => `<label class="inline-check"><input type="checkbox" data-report-section="${s.id}" ${on(s.id) ? 'checked' : ''}/><span>${escapeHtml(s.name)}</span></label>`).join('')}</div>
      <h4>${icon('save', 'icon tiny')}${escapeHtml(t('report.saveAs'))}</h4>
      <label class="prop-row"><span class="prop-label">${escapeHtml(t('report.format'))}</span><span class="prop-control"><select data-report-format>${opt('pdf', 'PDF (.pdf)', state.reportFormat)}${opt('docx', 'Word (.docx)', state.reportFormat)}${opt('md', t('report.mdOption'), state.reportFormat)}${opt('csv', t('report.csvOption'), state.reportFormat)}</select></span></label>
      <p class="muted small">${escapeHtml(t(`report.formatHint.${state.reportFormat}`))}</p>
      <p class="muted small report-pages" data-report-count></p>
    </div>`;
  return frame({ glyph: 'print', title: t('report.dialogTitle'), body: `<div class="report-layout">${side}<div class="report-preview" data-report-preview><p class="muted">${escapeHtml(t('report.drawing'))}</p></div></div>`, foot: `${button('reportPrint', t('report.print'), 'print', p.mode === 'print' ? 'primary' : '')}${button('reportSave', t('report.save'), 'save', p.mode === 'save' ? 'primary' : '')}<span class="grow"></span>${button('close', t('common.close'), 'close')}` });
}

/** The pages of the report drawn into the preview (after every change of the settings). */
let previewTurn = 0;
async function drawReportPreview() {
  const host = root.querySelector('[data-report-preview]');
  const report = P().report;
  if (!host || !report) return;
  const turn = ++previewTurn;
  const pages = await renderPages(report, state.reportSettings, 110);
  if (turn !== previewTurn) return;
  host.replaceChildren(...pages.map((canvas) => { canvas.className = 'report-page'; return canvas; }));
  const count = root.querySelector('[data-report-count]');
  if (count) count.textContent = t('report.pageCount', { n: pages.length });
}

/** Prints the pages (drawn sharper than the preview) through a hidden frame: one picture per sheet. */
async function printReport() {
  const st = state.reportSettings;
  const pages = await renderPages(P().report, st, 200);
  const size = `${st.paper === 'letter' ? 'letter' : st.paper === 'a3' ? 'A3' : 'A4'} ${st.landscape ? 'landscape' : 'portrait'}`;
  const frameEl = document.createElement('iframe');
  frameEl.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px';
  document.body.appendChild(frameEl);
  const doc = frameEl.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(P().report.title)}</title><style>@page { size: ${size}; margin: 0 } html, body { margin: 0 } img { display: block; width: 100%; height: auto; page-break-after: always; break-after: page } img:last-child { page-break-after: auto; break-after: auto }</style></head><body>${pages.map((c) => `<img src="${c.toDataURL('image/png')}">`).join('')}</body></html>`);
  doc.close();
  await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))));
  frameEl.contentWindow.focus();
  frameEl.contentWindow.print();
  setTimeout(() => frameEl.remove(), 60000);
}

/** A summary: a lead line and [label, value] rows (the end of a training). */
function renderSummary() {
  const p = P();
  const rows = (p.rows ?? []).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('');
  return frame({ glyph: 'check', title: p.title ?? '', body: `<p class="summary-lead">${escapeHtml(p.lead ?? '')}</p><table class="summary-kv">${rows}</table>`, foot: `<span class="grow"></span>${button('close', t('common.ok'), 'check', 'primary')}` });
}

/** Export: pick the format (ONNX · TensorFlow.js · C/C++ · PyTorch code). */
function renderExport() {
  const p = P();
  state.format ??= 'onnx';
  const formats = [
    ['onnx', 'exportOnnx', t('export.onnx'), t('export.onnxDesc')],
    ['tfjs', 'exportFile', t('export.tfjs'), t('export.tfjsDesc'), p.engine === 'torch' ? t('export.tfjsNeedsTf') : null],
    ['c', 'exportC', t('export.c'), t('export.cDesc')],
    ['py', 'tabCode', t('export.py'), t('export.pyDesc')],
  ];
  const cards = formats.map(([id, glyph, name, desc, off]) => `<button class="export-card ${state.format === id ? 'active' : ''}" data-format="${id}" ${off ? `disabled title="${escapeHtml(off)}"` : ''}>${icon(glyph)}<span class="export-text"><b>${escapeHtml(name)}</b><span class="muted">${escapeHtml(off ?? desc)}</span></span></button>`).join('');
  return frame({ glyph: 'exportOnnx', title: t('export.title'), body: `<div class="export-cards">${cards}</div>${p.trained ? '' : `<p class="small warning-text">${escapeHtml(t('export.untrained'))}</p>`}`, foot: `<span class="grow"></span>${button('exportGo', t('export.go'), 'exportFile', 'primary')}${button('close', t('common.cancel'), 'close')}` });
}

function renderError() {
  const p = P();
  return frame({ glyph: 'error', title: t('error.title'), body: `<p>${escapeHtml(p.message ?? '')}</p><pre class="error-detail">${escapeHtml(p.detail ?? '')}</pre>`, foot: `${button('copy', state.copied ? t('error.copied') : t('error.copy'), state.copied ? 'check' : 'copy')}<span class="grow"></span>${button('close', t('common.close'), 'check', 'primary')}` });
}

function renderProgress() {
  const p = P();
  return frame({ glyph: 'hourglass', title: p.title ?? t('progress.title'), body: `<p>${escapeHtml(p.message ?? '')}</p><div class="progress-line"><i style="width:${p.percent ?? 0}%"></i></div>` });
}

function renderPrompt() {
  const p = P();
  return frame({ glyph: 'edit', title: p.title ?? '', body: `<p>${escapeHtml(p.message ?? '')}</p><input type="text" class="wide" data-prompt value="${escapeHtml(p.value ?? '')}"/>`, foot: `<span class="grow"></span>${button('promptOk', t('common.ok'), 'check', 'primary')}${button('close', t('common.cancel'))}` });
}

function renderShortcuts() {
  const list = [
    ['Ctrl+N', 'menu.new'], ['Ctrl+O', 'menu.open'], ['Ctrl+S', 'menu.save'], ['Ctrl+Shift+S', 'menu.saveAs'], ['Ctrl+Z', 'menu.undo'], ['Ctrl+Y', 'menu.redo'],
    ['Ctrl+1 … 6', 'shortcut.tabs'], ['Del', 'menu.delete'], ['Ctrl+D', 'menu.duplicate'], ['Ctrl+A', 'menu.selectAll'], ['Ctrl+L', 'menu.autoLayout'], ['Ctrl+E', 'menu.neurons'],
    ['Ctrl+= / Ctrl+-', 'shortcut.zoom'], ['Ctrl+0', 'menu.fit'], ['Ctrl+G', 'menu.grid'], ['F5', 'menu.train'], ['F6', 'menu.pause'], ['F10', 'menu.step'], ['Shift+F5', 'menu.stop'], ['F1', 'menu.guide'],
    ['Ctrl+F', 'shortcut.find'], ['Ctrl+Space', 'shortcut.complete'], ['Shift+drag', 'shortcut.band'], ['Ctrl+wheel', 'shortcut.zoom'],
  ];
  return frame({ glyph: 'keyboard', title: t('menu.shortcuts'), body: `<div class="shortcut-grid">${list.map(([key, label]) => `<div class="shortcut-row"><kbd>${escapeHtml(key)}</kbd><span>${escapeHtml(t(label))}</span></div>`).join('')}</div>`, foot: `<span class="grow"></span>${button('close', t('common.close'), 'check', 'primary')}` });
}

function renderSamples() {
  const group = state.group;
  const list = SAMPLE_IDS.filter((id) => !group || SAMPLES[id].group === group);
  const tabs = [[null, 'samples', t('dictKind.all')], ...SAMPLE_GROUPS.map((g) => [g, SAMPLES[SAMPLE_IDS.find((id) => SAMPLES[id].group === g)].icon, t(`sampleGroup.${g}`)])];
  const tabHtml = `<nav class="tabs"><div class="tabs-strip">${tabs.map(([id, glyph, label]) => `<button class="tab ${group === id ? 'active' : ''}" data-group="${id ?? ''}">${icon(glyph)} ${escapeHtml(label)}</button>`).join('')}</div></nav>`;
  const cards = list.map((id) => {
    const sample = SAMPLES[id];
    // A sample with a choice of models shows its first one (and the names of the others).
    const spec = sample.layers ?? Object.values(sample.variants ?? {})[0]?.layers ?? [];
    const layers = spec.filter(([, type]) => type !== 'input').map(([, type]) => t(`layer.${type}`));
    const variants = sample.variants ? Object.values(sample.variants).map((v) => (L() === 'en' ? v.en : v.ko)).join(' / ') : '';
    const source = sample.dataset.source;
    const dataName = source.kind === 'sounds' ? t(`bank.${source.bank}`) : t(`gen.${source.id}`);
    return `<button class="sample-card" data-sample="${id}">
      <span class="sample-card-icon">${icon(sample.icon)}</span>
      <span class="sample-card-text"><b>${escapeHtml(L() === 'en' ? sample.en : sample.ko)}</b><span>${escapeHtml(L() === 'en' ? sample.descEn : sample.descKo)}</span>
      <small>${icon('dataset', 'icon tiny')} ${escapeHtml(dataName)} · ${icon('tabModel', 'icon tiny')} ${escapeHtml(variants || layers.slice(0, 5).join(' → '))}${!variants && layers.length > 5 ? ' …' : ''}</small></span></button>`;
  }).join('');
  return frame({ glyph: 'samples', title: t('start.gallery'), tabs: tabHtml, body: `<div class="sample-cards">${cards}</div>`, foot: `<span class="muted">${escapeHtml(t('samples.hint', { n: SAMPLE_IDS.length }))}</span><span class="grow"></span>${button('close', t('common.close'))}` });
}

// ── Python / PyTorch environment

const canInstall = (p) => p.implementation === 'CPython' && p.bits === 64 && (() => { const [major, minor] = p.version.split('.').map(Number); return major === 3 && minor >= 9; })() && !p.venv && !p.own;

function renderPyEnv() {
  const detection = state.params.detection;
  const chosen = state.params.chosen ?? s().pythonPath;
  const pythons = detection?.pythons ?? [];
  const withTorch = pythons.filter((p) => p.torch && p.numpy);
  const current = pythons.find((p) => p.path === chosen && p.torch) ?? (detection?.best != null ? pythons[detection.best] : null);
  const bases = pythons.filter(canInstall);
  const baseDefault = detection?.base != null ? pythons[detection.base]?.path : bases[0]?.path;
  const statusHtml = state.detecting || !detection
    ? `<div class="py-status busy">${icon('hourglass')}<span>${escapeHtml(t('py.detecting'))}</span></div>`
    : current
      ? `<div class="py-status ok">${icon('check')}<span>${escapeHtml(t('py.found', { torch: current.torch, version: current.version, device: current.cuda ? `CUDA · ${current.gpu ?? ''}` : current.mps ? 'Apple MPS' : 'CPU' }))}</span><code>${escapeHtml(current.path)}</code></div>`
      : `<div class="py-status warn">${icon('warning')}<span>${escapeHtml(pythons.length ? t('py.noTorch') : t('py.noPython'))}</span></div>`;
  const rows = pythons.map((p) => `<tr class="${p.path === current?.path ? 'current' : ''}">
      <td title="${escapeHtml(p.path)}"><code>${escapeHtml(p.path)}</code>${p.own ? ` <span class="chip small">${escapeHtml(t('py.own'))}</span>` : ''}</td>
      <td>${escapeHtml(p.version)}</td>
      <td>${p.torch ? escapeHtml(p.torch) : `<span class="muted">${escapeHtml(t('py.none'))}</span>`}${p.error ? ` <span class="danger-text" title="${escapeHtml(p.error)}">!</span>` : ''}</td>
      <td>${p.cuda ? 'CUDA' : p.mps ? 'MPS' : p.torch ? 'CPU' : '–'}</td>
      <td>${escapeHtml(t(`py.source.${p.source}`, null, p.source))}</td>
      <td>${p.torch && p.numpy ? (p.path === current?.path ? `<span class="chip small active">${escapeHtml(t('py.inUse'))}</span>` : button('use', t('py.use'), '', 'small', p.path)) : ''}</td></tr>`).join('');
  const install = withTorch.length && !state.installing && !state.message ? `<p class="muted">${escapeHtml(t('py.alreadyHint'))}</p>` : '';
  const variant = s().torchVariant;
  const installHtml = `<section class="py-install"><h4>${icon('install')} ${escapeHtml(t('py.installTitle'))}</h4>
    ${install}
    ${bases.length ? `<div class="py-install-row">
      <label>${escapeHtml(t('py.base'))} <select data-py="base">${bases.map((p) => `<option value="${escapeHtml(p.path)}" ${p.path === (state.base ?? baseDefault) ? 'selected' : ''}>Python ${escapeHtml(p.version)} — ${escapeHtml(p.path)}</option>`).join('')}</select></label>
      <label>${escapeHtml(t('py.variant'))} <select data-py="variant">${['auto', 'cpu', 'cuda', 'default'].map((v) => `<option value="${v}" ${variant === v ? 'selected' : ''}>${escapeHtml(t(`py.variant.${v}`))}${v === 'auto' ? ` (${detection?.nvidia ? 'CUDA' : 'CPU'})` : ''}</option>`).join('')}</select></label>
      ${state.installing ? button('cancelInstall', t('common.cancel'), 'close', 'danger') : button('install', t('py.install'), 'install', 'primary')}
    </div><p class="muted small">${escapeHtml(t('py.installHint', { dir: detection?.envDir ?? '' }))}</p>`
      : `<p>${escapeHtml(t('py.noBase'))}</p>${button('installPython', t('py.installPython'), 'install', 'primary', '', state.installing ? 'disabled' : '')}<p class="muted small">${escapeHtml(t('py.installPythonManual'))}</p>`}
    ${state.message ? `<div class="py-message ${state.message.kind}">${icon(state.message.kind === 'error' ? 'error' : 'check')}<span>${escapeHtml(state.message.text)}</span></div>` : ''}
    <pre class="py-log" ${state.log.length ? '' : 'hidden'}>${escapeHtml(state.log.slice(-400).join('\n'))}</pre></section>`;
  return frame({
    glyph: 'python', title: t('py.title'),
    body: `<div class="pyenv">${statusHtml}
      <p class="muted small">${escapeHtml(t('py.intro'))}</p>
      <div class="py-table-wrap"><table class="py-table"><thead><tr><th>${escapeHtml(t('py.path'))}</th><th>Python</th><th>PyTorch</th><th>${escapeHtml(t('py.device'))}</th><th>${escapeHtml(t('py.where'))}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="muted">${escapeHtml(state.detecting || !detection ? t('py.detecting') : t('py.noPython'))}</td></tr>`}</tbody></table></div>
      ${installHtml}</div>`,
    foot: `${button('detect', t('py.detect'), 'refresh', '', '', state.detecting || state.installing ? 'disabled' : '')}<span class="grow"></span>${button('close', t('common.close'), 'check', 'primary')}`,
  });
}

function onHostMessage(message) {
  if (!message || kind !== 'pyenv') {
    if (message?.type === 'refresh') { state.params = popupParams(kind); render(); }
    return;
  }
  switch (message.type) {
    case 'detecting': state.detecting = true; break;
    case 'detection': state.detecting = false; state.params = { ...state.params, detection: message.detection, chosen: message.chosen }; break;
    case 'log': state.log.push(message.line.text); if (state.log.length > 2000) state.log.splice(0, 500); break;
    case 'installing': state.installing = true; state.log = []; state.message = null; break;
    case 'installed': state.installing = false; state.params = { ...state.params, detection: message.detection, chosen: message.chosen }; state.message = { kind: 'ok', text: t('py.installDone') }; break;
    case 'installFailed': state.installing = false; state.message = { kind: 'error', text: message.message }; break;
    case 'error': state.detecting = false; state.message = { kind: 'error', text: message.message }; break;
    case 'refresh': state.params = popupParams(kind); break;
    default: break;
  }
  render();
  const logBox = root.querySelector('.py-log');
  if (logBox) logBox.scrollTop = logBox.scrollHeight;
}

// ───────────────────────── input

root.addEventListener('click', (event) => {
  const target = event.target;
  const pickTheme = target.closest('[data-pick-theme]');
  if (pickTheme) {
    const id = pickTheme.dataset.pickTheme;
    update(id === CUSTOM ? { theme: CUSTOM, customTheme: s().customTheme ?? customFrom(resolveTheme(s().theme, prefersDark(), null)) } : { theme: id });
    close({ theme: id });
    return;
  }
  if (target.closest('[data-edit-custom]')) { close({ editCustom: true }); return; }
  const tab = target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; render(); return; }
  const group = target.closest('[data-group]');
  if (group) { state.group = group.dataset.group || null; render(); return; }
  const sample = target.closest('[data-sample]');
  if (sample) { close({ sample: sample.dataset.sample }); return; }
  const landscape = target.closest('[data-report-landscape]');
  if (landscape) { state.reportSettings = { ...state.reportSettings, landscape: landscape.dataset.reportLandscape === '1' }; render(); return; }
  const format = target.closest('[data-format]');
  if (format && !format.disabled) { state.format = format.dataset.format; render(); return; }
  const set = target.closest('[data-set]');
  if (set) { update({ [set.dataset.set]: set.dataset.value }); return; }
  const actionButton = target.closest('[data-action]');
  if (!actionButton || actionButton.disabled) return;
  const name = actionButton.dataset.action;
  switch (name) {
    case 'close': dismiss(); break;
    case 'settingsOk': close({ ok: true }); break;
    case 'exportGo': close({ format: state.format ?? 'onnx' }); break;
    case 'reportPrint': printReport().catch((error) => action('report-error', { message: String(error?.message ?? error), detail: String(error?.stack ?? ''), context: 'print' })); break;
    case 'reportSave': action('report-save', { format: state.reportFormat ?? 'pdf', settings: state.reportSettings }); break;
    case 'settingsCancel': cancelSettings(); break;
    case 'settingsReset': resetSettings(); break;
    case 'choice': close({ choice: actionButton.dataset.value }); break;
    case 'welcomeGo': close({ go: actionButton.dataset.value }); break;
    case 'promptOk': close({ value: root.querySelector('[data-prompt]')?.value ?? '' }); break;
    case 'copy': navigator.clipboard.writeText(`${P().message}\n${P().detail}`).then(() => { state.copied = true; render(); }).catch(() => {}); break;
    case 'use': action('py-use', { path: actionButton.dataset.value }); break;
    case 'detect': state.detecting = true; state.message = null; render(); action('py-refresh'); break;
    case 'install': {
      state.installing = true;
      state.message = null;
      state.log = [];
      const base = root.querySelector('[data-py="base"]')?.value;
      const variant = root.querySelector('[data-py="variant"]')?.value ?? 'auto';
      action('py-install', { base, variant });
      render();
      break;
    }
    case 'installPython': state.installing = true; state.log = []; action('py-install-python'); render(); break;
    case 'cancelInstall': action('py-cancel'); break;
    default: break;
  }
});

function updateCustom(patch) {
  const base = normalizeCustom(s().customTheme ?? customFrom(resolveTheme(s().theme === CUSTOM ? 'light' : s().theme, prefersDark(), null)));
  update({ customTheme: { ...base, ...patch }, theme: CUSTOM });
}

root.addEventListener('input', (event) => {
  if (event.target.matches('[data-custom-color]')) updateCustom({ [event.target.dataset.customColor]: event.target.value });
});

root.addEventListener('change', (event) => {
  const reportField = event.target.closest?.('[data-report], [data-report-section], [data-report-format]');
  if (reportField) {
    const el = reportField;
    if (el.dataset.reportFormat !== undefined) state.reportFormat = el.value;
    else if (el.dataset.reportSection) state.reportSettings = { ...state.reportSettings, sections: { ...(state.reportSettings.sections ?? {}), [el.dataset.reportSection]: el.checked } };
    else state.reportSettings = { ...state.reportSettings, [el.dataset.report]: el.dataset.report === 'margin' ? Number(el.value) : el.value };
    render();
    return;
  }
  const target = event.target;
  if (target.matches('[data-custom-use]')) { if (target.checked) updateCustom({}); else update({ theme: 'light' }); return; }
  if (target.matches('[data-custom-dark]')) { updateCustom({ dark: target.checked }); return; }
  if (target.matches('[data-custom-from]') && target.value) { update({ customTheme: customFrom(resolveTheme(target.value, false, null)), theme: CUSTOM }); return; }
  // The main window owns the settings while this popup is open: it saves the choice at once.
  if (target.matches('[data-welcome-show]')) { state.settings = { ...state.settings, showWelcome: target.checked }; action('welcome-show', { value: target.checked }); return; }
  if (target.matches('[data-toggle]')) update({ [target.dataset.toggle]: target.checked });
  else if (target.matches('[data-setting]')) {
    const key = target.dataset.setting;
    update({ [key]: ['fontWeight', 'maxNeurons'].includes(key) ? Number(target.value) : target.value });
  } else if (target.matches('[data-py="base"]')) state.base = target.value;
  else if (target.matches('[data-py="variant"]')) update({ torchVariant: target.value });
});

root.addEventListener('pointerdown', (event) => {
  if (desktop && event.button === 0 && event.target.closest('[data-window-drag]') && !event.target.closest('button')) native.invoke('window_drag', {}).catch(() => {});
});

// Our own context menu (with icons) instead of the WebView's.
window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  const items = textMenuItems(event.target, t);
  if (kind !== 'menu') items.push(...(items.length ? ['sep'] : []), { label: t('common.close'), icon: 'close', action: dismiss });
  showContextMenu(items, { x: event.clientX, y: event.clientY });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') dismiss();
  if (event.key === 'Enter' && kind === 'prompt') close({ value: root.querySelector('[data-prompt]')?.value ?? '' });
});

// Messages from the main window
if (desktop) {
  native.listen('popup-message', onHostMessage);
  native.listen('popup-refresh', () => { state.params = popupParams(kind); state.copied = false; state.settings = loadSettings(globalThis.localStorage); if (original) original = { ...state.settings }; applyLook(); state.log = []; state.message = null; render(); });
}
window.addEventListener('message', (event) => {
  if (event.origin === location.origin && event.data?.mytrainerHost) onHostMessage(event.data);
});
window.addEventListener('storage', (event) => {
  if (event.key === 'mytrainer.settings.v1') { state.settings = loadSettings(globalThis.localStorage); applyLook(); }
});

applyLook();
render();

// The theme drop-down closes as soon as it loses the focus (a click anywhere else), like a menu.
if (kind === 'themes') {
  if (desktop) appWindow.onFocusChanged(({ payload: focused }) => { if (!focused && shown) close(); }).catch(() => {});
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
}

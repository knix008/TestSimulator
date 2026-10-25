// Dialogs in the MyCAD style: a fixed-size card with a title bar, a body and
// right-aligned actions, over a dimmed backdrop. Each opener gets the app API
// (state, actions, t) and returns nothing; closing removes the backdrop.
import { h, replace, numberField, themeSwatch, aboutMark } from './dom.js';
import { t, getLanguage } from '../core/i18n.js';
import { commandIcon, commandName, SHORTCUTS, WORKBENCHES } from '../core/commands.js';
import { THEMES, themesByMode, THEME_TOKENS, CUSTOM_THEME_ID, createCustomTheme, sanitizeTheme, resolveTheme } from '../core/themes.js';
import { COLORMAPS, COLORMAP_NAMES, cssColor, formatValue, lut } from '../core/colormap.js';
import { MATERIAL_LIBRARY, MATERIAL_CATEGORIES, materialFromLibrary, materialName } from '../core/materials.js';
import { SAMPLE_IDS, SAMPLE_TAGS, sampleModel } from '../core/samples.js';
import { bodyBounds, newId, cellCount } from '../core/model.js';
import { componentLife, systemLife, survival, sectionFigures } from '../core/reliability.js';
import { parseNodeCsv, nodesAt, nodeStats, nodeBounds, idwRaster, sampleNodeCsv, sampleNodeCsv3d } from '../core/heatmap.js';
import { materialColor } from './editor2d.js';
import { field as fieldOf } from '../core/result.js';
import { ANIMATION_KINDS, ANIMATION_ICONS } from './background.js';
import { showParametric as parametricDialog } from './parametric.js';
import { showThermalAnalysis as thermalDialog } from './thermaltool.js';
import { dewPoint, temperatureFactor, uFactorByTag, cavityK } from '../core/interop.js';
import { bodyIntegrals } from '../core/result.js';
import { toDisplayT, tUnitLabel, DEFAULT_SETTINGS } from '../core/settings.js';
import { popoutsEnabled, openPopout, placePopout, closePopout } from '../platform/popout.js';
import { FORMATS, UNSUPPORTED } from '../core/formats.js';

let host = null;
const stack = [];

export function setDialogHost(element) {
  host = element;
}

/** Opens a dialog. Returns { el, body, close }. */
export function popup({ id, title, icon = '', width = 520, height = 360, body, actions = [], onClose = null }) {
  closeDialog(id);
  const card = h('div', { className: 'popup', role: 'dialog', 'aria-label': title, dataset: { testid: `dialog-${id}` }, style: { width: `${width}px`, height: `${height}px` } });
  let closed = false;
  let popout = null;
  let shade = null;
  let watch = 0;
  const close = () => {
    if (closed) return;
    closed = true;
    const at = stack.findIndex((entry) => entry.id === id);
    if (at >= 0) stack.splice(at, 1);
    clearInterval(watch);
    backdrop.remove();
    shade?.remove();
    closePopout(popout);
    onClose?.();
  };
  const titleBar = h('header', { className: 'popup-title', dataset: { testid: 'popup-title' } },
    h('span', { className: 'popup-heading' }, h('span', { className: 'menu-icon' }, icon), h('strong', null, title)),
    h('button', { type: 'button', className: 'ghost', title: t('close'), onClick: close, dataset: { testid: `dialog-close-${id}` } }, '✕'));
  const bodyEl = h('div', { className: 'popup-body' });
  if (body) replace(bodyEl, body);
  card.append(titleBar, bodyEl);
  if (actions.length) {
    bodyEl.append(h('div', { className: 'row popup-actions' }, ...actions.map((action) => h('button', {
      type: 'button', className: action.primary ? 'primary' : null, dataset: action.testid ? { testid: action.testid } : undefined,
      onClick: () => (action.onClick ? action.onClick(close) : close()),
    }, action.label))));
  }
  const backdrop = h('div', { className: 'popup-backdrop', onMousedown: (event) => { if (event.target === backdrop) close(); } }, card);
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  });
  (host ?? document.body).append(backdrop);
  stack.push({ id, close, el: backdrop, get win() { return popout?.win ?? null; } });
  const focusFirst = () => (card.querySelector('input, select, button.primary') ?? card.querySelector('button'))?.focus();
  if (!popoutsEnabled()) {
    requestAnimationFrame(focusFirst);
    return { el: card, body: bodyEl, close };
  }
  // Desktop: the dialog gets a window of its own (it may reach past the main window). It is laid out here first,
  // unseen, so the opener's code can measure it; then it moves to the window. A dimmed main window brings it forward.
  backdrop.style.visibility = 'hidden';
  openPopout(`dialog-${id}`, 'popup-window').then((opened) => {
    if (closed) { closePopout(opened); return; }
    if (!opened) { backdrop.style.visibility = ''; requestAnimationFrame(focusFirst); return; }
    popout = opened;
    backdrop.style.visibility = '';
    popout.root.append(popout.win.document.adoptNode(backdrop));
    shade = h('div', { className: 'popup-backdrop popup-shade', dataset: { testid: `dialog-shade-${id}` }, onMousedown: () => { try { popout.win.focus(); } catch { /* gone */ } } });
    (host ?? document.body).append(shade);
    // Closed by the system (Alt+F4) rather than by the dialog's own buttons.
    popout.win.addEventListener('pagehide', close);
    watch = setInterval(() => { if (popout.win.closed) close(); }, 300);
    placePopout(popout, { width, height, center: true, focus: true }).then(focusFirst);
  });
  return { el: card, body: bodyEl, close };
}

export function closeDialog(id) {
  const entry = stack.find((item) => item.id === id);
  entry?.close();
}

export function topDialog() {
  return stack[stack.length - 1] ?? null;
}

const row = (label, control, extra = null) => h('div', { className: 'row' }, h('span', null, label), control, extra);
const select = (value, options, onChange, testid) => {
  const el = h('select', { dataset: testid ? { testid } : undefined, onChange: (event) => onChange(event.target.value) },
    ...options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
  return el;
};
const check = (value, onChange, testid) => h('input', { type: 'checkbox', checked: Boolean(value), dataset: testid ? { testid } : undefined, onChange: (event) => onChange(event.target.checked) });
const group = (legend, ...children) => h('fieldset', { className: 'field-group' }, h('legend', null, legend), ...children);

// ───────────────────────── confirm / error / message

export function confirmSave(app, onSave, onDiscard) {
  popup({
    id: 'confirm', title: t('saveBtn'), icon: '💾', width: 420, height: 170,
    body: h('p', { className: 'error-headline' }, t('saveChanges')),
    actions: [
      { label: t('saveBtn'), primary: true, testid: 'confirm-save', onClick: (close) => { close(); onSave(); } },
      { label: t('discard'), testid: 'confirm-discard', onClick: (close) => { close(); onDiscard(); } },
      { label: t('cancel'), testid: 'confirm-cancel' },
    ],
  });
}

export function showError(message, detail = '') {
  popup({
    id: 'error', title: t('errorTitle'), icon: '⚠', width: 560, height: detail ? 360 : 190,
    body: [h('p', { className: 'error-headline' }, message), detail ? h('pre', { className: 'error-detail' }, detail) : null],
    actions: [
      { label: t('copyError'), onClick: () => navigator.clipboard?.writeText(`${message}\n${detail}`) },
      { label: t('close'), primary: true },
    ],
  });
}

export function showMessage(id, title, icon, content, width = 560, height = 300) {
  popup({ id, title, icon, width, height, body: content, actions: [{ label: t('close'), primary: true }] });
}

// ───────────────────────── about / shortcuts / batch

export async function showAbout(app) {
  const info = await app.appInfo();
  const date = info.buildTime ? new Date(info.buildTime * 1000).toISOString().slice(0, 10) : '';
  const item = (label, value) => h('div', { className: 'about-row' }, h('dt', null, label), h('dd', { title: String(value ?? '') }, value ?? ''));
  popup({
    id: 'about', title: t('aboutTitle'), icon: 'ℹ️', width: 560, height: 470,
    body: [
      h('div', { className: 'about-head' },
        h('img', { className: 'about-icon', src: './icon.png', width: 64, height: 64, alt: '' }),
        h('div', { className: 'about-title' }, h('strong', null, 'MyHeatManager'), h('span', { className: 'muted' }, `${t('version')} ${info.version}`))),
      h('dl', { className: 'about-grid' },
        item(t('version'), info.version),
        item(t('buildDate'), date),
        item(t('commit'), info.commit),
        item(t('platform'), `${info.os} ${info.arch}${info.tauri ? ` · Tauri ${info.tauri}` : ''}`),
        item(t('engine'), info.engine === 'native' ? t('engineNative') : t('engineWasm')),
        item(t('author'), 'SHKWON (knix008@naver.com)')),
      h('p', { className: 'about-note' }, t('aboutText')),
    ],
    actions: [{ label: t('close'), primary: true }],
  });
}

export function showShortcuts(app) {
  const lang = getLanguage();
  // Sized to the list: three columns, every row visible, no scroll bar.
  const rows = Math.ceil(Object.keys(SHORTCUTS).length / 3);
  popup({
    id: 'shortcuts', title: t('shortcutsTitle'), icon: '⌨', width: 900, height: Math.min(window.innerHeight - 20, 120 + rows * 28),
    body: h('div', null, h('div', { className: 'shortcut-grid', style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } },
      ...Object.entries(SHORTCUTS).map(([id, keys]) => h('div', { className: 'row' }, h('span', null, `${commandIcon(id)}  ${commandName(id, lang)}`), h('kbd', null, keys))))),
    actions: [{ label: t('close'), primary: true }],
  });
}

export function showBatchHelp(app) {
  const exe = navigator.platform?.startsWith('Win') ? 'MyHeatManager.exe' : 'MyHeatManager';
  const code = `${exe} --batch model.myheat
${exe} --batch a.myheat b.myheat --out results --field T
${exe} --batch pcb.myheat --field vonMises --quiet

→ results/a.summary.json   (Tmin, Tmax, probes, bodies, boundaries, balance)
→ results/a.T.csv          (x_mm, y_mm, [z_mm], value)
→ results/a.T.png          (heat map)`;
  popup({
    id: 'batch', title: t('batchTitle'), icon: '⌨', width: 640, height: 400,
    body: [h('p', { className: 'part-help' }, app.isTauri ? t('batchText') : `${t('batchText')} ${t('batchWeb')}`), h('pre', { className: 'code-block' }, code)],
    actions: [{ label: t('copyText'), onClick: () => navigator.clipboard?.writeText(code) }, { label: t('close'), primary: true }],
  });
}

/** A line through a 3D result typed as two points A and B (x, y, z in mm); the chart plots the values along it. */
export function showLineCut3d(app) {
  const d = app.doc();
  const dom = d.model.domain;
  const old = d.lineCut && Number.isFinite(d.lineCut.a?.z) ? d.lineCut : { a: { x: 0, y: dom.height / 2, z: dom.depth / 2 }, b: { x: dom.width, y: dom.height / 2, z: dom.depth / 2 } };
  const line = { a: { ...old.a }, b: { ...old.b } };
  const point = (key) => ['x', 'y', 'z'].map((axis) => row(`${key.toUpperCase()} · ${axis}`, numberField({ value: line[key][axis], step: 1, min: 0, max: { x: dom.width, y: dom.height, z: dom.depth }[axis], suffix: 'mm', testid: `line3d-${key}${axis}`, onChange: (v) => { line[key][axis] = v; } })));
  popup({
    id: 'line3d', title: commandName('lineCut3d', getLanguage()), icon: '⟋', width: 420, height: 400,
    body: [group('A', ...point('a')), group('B', ...point('b'))],
    actions: [
      { label: t('cancel') },
      { label: t('apply'), primary: true, testid: 'line3d-apply', onClick: (close) => { app.setLineCut(line); close(); } },
    ],
  });
}

/** The file formats that can be opened and saved (core/formats.js FORMATS) and the proprietary ones that cannot. */
export function showFormats() {
  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  const mark = (on) => (on ? '✓' : '—');
  const table = (head, rows) => h('table', { className: 'data-table' }, h('thead', null, h('tr', null, ...head.map((x) => h('th', null, x)))),
    h('tbody', null, ...rows.map((r) => h('tr', null, ...r.map((x, i) => h('td', { className: i >= 2 && i <= 3 && head.length === 5 ? 'num' : null }, x))))));
  const body = h('div', { className: 'scroll', dataset: { testid: 'formats-list' } },
    h('h3', { className: 'tool-group-title' }, t('formatsSupported')),
    table([t('formatsProduct'), t('formatsFormat'), t('formatsOpen'), t('formatsSave'), ''], FORMATS.map((f) => [f.product, `.${f.ext}`, mark(f.open), mark(f.save), f.name[lang]])),
    h('p', { className: 'part-help' }, t('formatsNote')),
    h('h3', { className: 'tool-group-title' }, t('formatsUnsupported')),
    table([t('formatsFormat'), t('formatsProduct'), t('formatsReason')], UNSUPPORTED.map((f) => [`.${f.ext}`, f.product, f.reason[lang]])));
  popup({ id: 'formats', title: t('formatsTitle'), icon: '🗂', width: 820, height: 600, body, actions: [{ label: t('close'), primary: true }] });
}

// ───────────────────────── settings

/**
 * Settings: every preference, grouped in tabs. Changes show at once (live preview); Apply keeps them and closes,
 * Cancel puts back what was set when the window opened, Reset returns to the defaults (recent files stay).
 */
export function showSettings(app, initialTab = null) {
  const tabs = [
    ['tabGeneral', '⚙'], ['tabTheme', '◐'], ['tabCustomTheme', '🎨'], ['tabFont', '🔤'], ['tabStartPage', '🏠'],
    ['tabResults', '🌡'], ['tabEditor', '✎'], ['tabPanels', '◧'], ['tabFiles', '🕘'],
  ];
  let tab = initialTab ?? 'tabGeneral';
  const original = structuredClone(app.state.settings);
  const rail = h('nav', { className: 'settings-tabs' });
  const panel = h('div', { className: 'settings-panel' });
  const render = () => {
    const s = app.state.settings;
    const lang = getLanguage();
    replace(rail, ...tabs.map(([id, icon]) => h('button', { type: 'button', className: id === tab ? 'on' : null, dataset: { testid: `settings-${id}` }, onClick: () => { tab = id; render(); panel.scrollTop = 0; } }, h('span', { className: 'menu-icon' }, icon), h('span', null, t(id)))));
    const patch = (p) => { app.patchSettings(p); render(); };
    const toggles = (items) => items.map(([key, label, testid]) => row(label, check(s[key], (v) => patch({ [key]: v }), testid)));
    if (tab === 'tabGeneral') {
      replace(panel,
        group(t('tabGeneral'),
          row(t('language'), select(s.language, [['ko', t('korean')], ['en', t('english')]], (v) => patch({ language: v }), 'settings-language')),
          row(t('tUnit'), select(s.temperatureUnit, [['C', '°C'], ['K', 'K'], ['F', '°F']], (v) => patch({ temperatureUnit: v }), 'settings-tunit')),
          row(t('lUnit'), select(s.lengthUnit, [['mm', 'mm'], ['cm', 'cm'], ['m', 'm'], ['in', 'in']], (v) => patch({ lengthUnit: v }), 'settings-lunit')),
          row(t('workbenchDefault'), select(s.workbench, WORKBENCH_CHOICES(lang), (v) => patch({ workbench: v }))),
          ...toggles([['autoRun', t('autoRun'), 'settings-autorun'], ['confirmClose', t('confirmClose')]])));
    } else if (tab === 'tabTheme') {
      const swatches = (list) => h('div', { className: 'theme-grid' }, ...list.map((theme) => h('button', {
        type: 'button', className: theme.id === s.theme ? 'theme-swatch on' : 'theme-swatch', dataset: { testid: `theme-${theme.id}` }, onClick: () => patch({ theme: theme.id }),
      }, themeSwatch(theme, 15), h('span', { className: 'ellipsis' }, lang === 'en' ? theme.name.en : theme.name.ko))));
      const custom = s.customTheme ? sanitizeTheme(s.customTheme) : createCustomTheme();
      replace(panel,
        group(t('themesDark'), swatches(themesByMode('dark'))),
        group(t('themesLight'), swatches(themesByMode('light'))),
        group(t('customTheme'), swatches([custom]), h('p', { className: 'part-help' }, t('customThemeHint'))));
    } else if (tab === 'tabCustomTheme') {
      const custom = s.customTheme ? sanitizeTheme(s.customTheme) : createCustomTheme(resolveTheme(s.theme));
      const save = (next) => patch({ customTheme: next, theme: CUSTOM_THEME_ID });
      replace(panel,
        group(t('customTheme'),
          row(t('customBase'), select('', [['', '—'], ...THEMES.map((th) => [th.id, lang === 'en' ? th.name.en : th.name.ko])], (v) => { if (v) save(createCustomTheme(THEMES.find((th) => th.id === v))); }, 'settings-custom-base')),
          row(t('customMode'), select(custom.mode, [['dark', t('themesDark')], ['light', t('themesLight')]], (v) => save({ ...custom, mode: v }))),
          h('div', { className: 'color-grid', dataset: { testid: 'settings-custom-colors' } }, ...THEME_TOKENS.map((token) => h('label', { className: 'color-row', title: lang === 'en' ? token.en : token.ko },
            h('input', { type: 'color', value: custom.colors[token.key], onInput: (event) => save({ ...custom, colors: { ...custom.colors, [token.key]: event.target.value } }) }),
            h('span', { className: 'ellipsis' }, lang === 'en' ? token.en : token.ko)))),
          h('div', { className: 'row' }, h('button', { type: 'button', dataset: { testid: 'settings-custom-use' }, onClick: () => save(custom) }, t('useCustomTheme')))));
    } else if (tab === 'tabFont') {
      replace(panel, group(t('font'),
        row(t('font'), select(s.fontFamily, (app.fonts.includes(s.fontFamily) ? app.fonts : [s.fontFamily, ...app.fonts]).map((f) => [f, f]), (v) => patch({ fontFamily: v }), 'settings-font')),
        row(t('fontSize'), numberField({ value: s.fontSize, min: 10, max: 20, step: 1, suffix: 'px', onChange: (v) => patch({ fontSize: v }) })),
        h('p', { className: 'part-help', style: { fontFamily: `"${s.fontFamily}"`, fontSize: `${s.fontSize}px` } }, t('fontPreview'))));
    } else if (tab === 'tabStartPage') {
      const transparency = numberField({ value: s.startBgTransparency, min: 0, max: 95, step: 5, suffix: '%', testid: 'settings-transparency', onChange: (v) => patch({ startBgTransparency: Math.round(v) }) });
      replace(panel, group(t('startPageGroup'),
        row(t('startShow'), check(s.showStartPage, (v) => patch({ showStartPage: v }), 'settings-show-start')),
        h('div', { className: 'settings-anim' }, h('span', { className: 'field-label' }, t('startBackground')),
          h('div', { className: 'anim-chips', dataset: { testid: 'settings-animation' } }, ...ANIMATION_KINDS.map((k) => h('button', { type: 'button', className: k === s.animation ? 'anim-chip active' : 'anim-chip', dataset: { testid: `settings-anim-${k}` }, onClick: () => patch({ animation: k }) }, h('span', { className: 'icon' }, ANIMATION_ICONS[k]), h('span', null, t(`anim_${k}`)))))),
        row(t('startTransparency'), transparency),
        row(t('startSpeed'), numberField({ value: s.animationSpeed, min: 0, max: 300, step: 10, suffix: '%', onChange: (v) => patch({ animationSpeed: Math.round(v) }) })),
        row(t('startRandom'), check(s.animationRandom, (v) => patch({ animationRandom: v }))),
        row(t('startLayoutReset'), h('button', { type: 'button', onClick: () => patch({ startLayout: null }) }, t('reset')))));
    } else if (tab === 'tabResults') {
      const preview = (name) => h('span', { className: 'colormap-preview', style: { background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((v) => cssColor(name, v)).join(', ')})` } });
      replace(panel, group(t('tabResults'),
        row(t('colormap'), select(s.colormap, Object.keys(COLORMAPS).map((k) => [k, COLORMAP_NAMES[k]]), (v) => patch({ colormap: v }), 'settings-colormap'), preview(s.colormap)),
        row(t('colorSteps'), select(s.colorSteps, [[0, t('smooth')], [8, '8'], [10, '10'], [12, '12'], [16, '16'], [20, '20']], (v) => patch({ colorSteps: Number(v) }), 'settings-steps')),
        row(t('isoCount'), numberField({ value: s.isoCount, min: 2, max: 40, step: 1, onChange: (v) => patch({ isoCount: Math.round(v) }) }))));
    } else if (tab === 'tabEditor') {
      replace(panel, group(t('tabEditor'),
        row(t('snapStep'), select(s.snap, [[0, t('off')], [0.05, '0.05 mm'], [0.1, '0.1 mm'], [0.25, '0.25 mm'], [0.5, '0.5 mm'], [1, '1 mm'], [2, '2 mm'], [5, '5 mm'], [10, '10 mm']], (v) => patch({ snap: Number(v) }), 'settings-snap')),
        ...toggles([['showGrid', commandName('showGrid', lang), 'settings-grid'], ['showMesh', commandName('showMesh', lang)], ['showRulers', commandName('showRulers', lang)], ['showLabels', commandName('showLabels', lang)]])));
    } else if (tab === 'tabPanels') {
      replace(panel, group(t('tabPanels'),
        ...toggles([['showToolPanel', commandName('toolPanel', lang)], ['showPropertyPanel', commandName('propertyPanel', lang)], ['showChartPanel', commandName('chartPanel', lang)],
          ['leftCollapsed', `${commandName('toolPanel', lang)} — ${t('panelCollapse')}`], ['rightCollapsed', `${commandName('propertyPanel', lang)} — ${t('panelCollapse')}`]]),
        row(t('panelWidth'), numberField({ value: s.panelSize, min: 220, max: 520, step: 10, suffix: 'px', onChange: (v) => patch({ panelSize: Math.round(v) }) })),
        row(t('chartHeight'), numberField({ value: s.chartHeight, min: 120, max: 420, step: 10, suffix: 'px', onChange: (v) => patch({ chartHeight: Math.round(v) }) }))));
    } else {
      replace(panel, group(t('recentFiles'),
        h('div', { className: 'recent-list' }, ...s.recentFiles.map((file) => h('div', { className: 'row recent-row' },
          h('span', { className: 'ellipsis', title: file.path }, file.name),
          h('button', { type: 'button', title: t('remove'), onClick: () => patch({ recentFiles: s.recentFiles.filter((f) => f.path !== file.path) }) }, '✕')))),
        s.recentFiles.length ? null : h('p', { className: 'part-help' }, t('startRecentEmpty')),
        h('div', { className: 'row' }, h('button', { type: 'button', onClick: () => patch({ recentFiles: [] }) }, t('clearRecent')))));
    }
  };
  render();
  popup({
    id: 'settings', title: t('settingsTitle'), icon: '⚙', width: 820, height: 560, body: h('div', { className: 'settings-layout' }, rail, panel),
    onClose: null,
    actions: [
      { label: `↺ ${t('reset')}`, testid: 'settings-reset', onClick: () => { const { recentFiles } = app.state.settings; app.patchSettings({ ...DEFAULT_SETTINGS, recentFiles }); render(); } },
      { label: t('cancel'), testid: 'settings-cancel', onClick: (close) => { app.patchSettings(original); close(); } },
      { label: t('apply'), primary: true, testid: 'settings-apply', onClick: (close) => close() },
    ],
  });
}

const WORKBENCH_CHOICES = (lang) => WORKBENCHES.map((wb) => [wb.id, `${wb.icon}  ${lang === 'en' ? wb.en : wb.ko}`]);

// ───────────────────────── samples

/** A small picture of a model: its bodies in their material colours. */
export function drawPreview(canvas, model) {
  const ctx = canvas.getContext('2d');
  const w = (canvas.width = 480);
  const hgt = (canvas.height = 240);
  const d = model.domain;
  const scale = Math.min((w - 20) / d.width, (hgt - 20) / d.height);
  const ox = (w - d.width * scale) / 2;
  const oy = (hgt + d.height * scale) / 2;
  const mats = new Map(model.materials.map((m) => [m.id, m]));
  ctx.fillStyle = d.background ? materialColor(mats.get(d.background)) : 'rgba(0,0,0,0.15)';
  ctx.globalAlpha = 0.35;
  ctx.fillRect(ox, oy - d.height * scale, d.width * scale, d.height * scale);
  ctx.globalAlpha = 1;
  for (const body of model.bodies) {
    ctx.fillStyle = materialColor(mats.get(body.material));
    ctx.beginPath();
    if (body.shape === 'circle') ctx.arc(ox + body.cx * scale, oy - body.cy * scale, body.r * scale, 0, Math.PI * 2);
    else if (body.shape === 'polygon') body.points.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * scale, oy - y * scale) : ctx.moveTo(ox + x * scale, oy - y * scale)));
    else ctx.rect(ox + body.x * scale, oy - (body.y + body.h) * scale, body.w * scale, body.h * scale);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
  }
}

export function showSamples(app) {
  const lang = getLanguage();
  const grid = h('div', { className: 'sample-grid' });
  for (const id of SAMPLE_IDS) {
    const model = sampleModel(id, lang);
    const canvas = h('canvas');
    drawPreview(canvas, model);
    grid.append(h('button', {
      type: 'button', className: 'sample-card', dataset: { testid: `sample-${id}` },
      onClick: () => { closeDialog('samples'); app.openModel(model, null); },
    }, canvas, h('strong', null, model.name), h('div', { className: 'tags' }, ...(SAMPLE_TAGS[id] ?? []).map((tag) => h('span', { className: 'tag' }, tag)),
      h('span', { className: 'tag' }, `${model.domain.dim}D · ${cellCount(model.domain).toLocaleString()} ${t('cells')}`)), h('p', null, model.description)));
  }
  popup({ id: 'samples', title: t('sampleGallery'), icon: '🗂', width: 900, height: 620, body: h('div', { className: 'scroll' }, grid), actions: [{ label: t('close') }] });
}

// ───────────────────────── materials

const MATERIAL_FIELDS = [
  ['k', 'conductivity', 'W/m·K', 0.1],
  ['kx', 'anisotropic', 'kx', 0.1],
  ['ky', 'anisotropic', 'ky', 0.1],
  ['kz', 'anisotropic', 'kz', 0.1],
  ['rho', 'density', 'kg/m³', 10],
  ['cp', 'specificHeat', 'J/kg·K', 10],
  ['emissivity', 'emissivity', '', 0.05],
  ['absorptivity', 'absorptivity', '', 0.05],
  ['E', 'youngs', 'GPa', 1, 1e9],
  ['nu', 'poisson', '', 0.01],
  ['alpha', 'cte', 'ppm/K', 0.5, 1e-6],
  ['mu', 'viscosity', 'mPa·s', 0.1, 1e-3, 'fluid'],
  ['beta', 'expansion', '1/K', 1e-4, 1, 'fluid'],
  ['Tmelt', 'meltT', '°C', 1, 1, 'pcm'],
  ['meltRange', 'meltRange', 'K', 0.5, 1, 'pcm'],
  ['latent', 'latent', 'kJ/kg', 5, 1e3, 'pcm'],
  ['kLiquid', 'kLiquid', 'W/m·K', 0.05, 1, 'pcm'],
  ['porosity', 'porosity', '', 0.05, 1, 'porous'],
  ['permeability', 'permeability', 'm²', 1e-9, 1, 'porous'],
  ['sigma', 'sigma', 'MS/m', 1, 1e6],
  ['alphaR', 'alphaR', '1/K', 0.0005, 1],
  // Pennes bioheat (tissue): blood perfusion rate, metabolic heat, arterial blood temperature
  ['perfusion', 'perfusion', '1/s', 0.0005, 1],
  ['metabolic', 'metabolic', 'W/m³', 100, 1],
  ['bloodT', 'bloodT', '°C', 0.5, 1],
];

/** Temperature tables of a material as editable "°C:value, …" text. */
const tableText = (rows) => (Array.isArray(rows) ? rows.map(([x, v]) => `${x}:${v}`).join(', ') : '');
const parseTable = (text) => { const rows = String(text).split(/[,;\n]+/).map((pair) => pair.split(':').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)).sort((a, b) => a[0] - b[0]); return rows.length ? rows : null; };

/** Editable properties of one model material. */
export function materialEditor(material, onPatch, model = null) {
  const kinds = [['solid', t('kindSolid')], ['fluid', t('kindFluid')], ['pcm', t('kindPcm')], ['porous', t('kindPorous')]];
  const rows = [
    row(t('name'), h('input', { type: 'text', value: material.name ?? '', onChange: (event) => onPatch({ name: event.target.value }) })),
    row(t('kind'), select(material.kind ?? 'solid', kinds, (v) => onPatch({ kind: v }))),
    row(t('color'), h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(material.color ?? '') ? material.color : '#999999', onChange: (event) => onPatch({ color: event.target.value }) })),
  ];
  for (const [key, label, unit, step, factor = 1, only] of MATERIAL_FIELDS) {
    if (only && only !== material.kind) continue;
    // A material without a solar absorptivity uses the engine's default, 0.6.
    const value = material[key] ?? (key === 'absorptivity' ? 0.6 : null);
    const labelText = key.startsWith('k') && key.length === 2 ? `${t(label)} ${unit}` : t(label);
    rows.push(row(labelText, numberField({
      value: value == null ? NaN : value / factor, step, suffix: key.length === 2 && key.startsWith('k') ? 'W/m·K' : unit,
      onChange: (v) => onPatch({ [key]: Number.isFinite(v) ? v * factor : null }),
    })));
  }  // Temperature-dependent conductivity and specific heat (COMSOL / Ansys style), °C:value pairs.
  rows.push(row('k(T)', h('input', { type: 'text', value: tableText(material.kT), placeholder: '20:150, 200:140', dataset: { testid: 'mat-kT' }, onChange: (event) => onPatch({ kT: parseTable(event.target.value) }) }), h('span', { className: 'muted' }, '°C:W/mK')));
  rows.push(row('cp(T)', h('input', { type: 'text', value: tableText(material.cpT), placeholder: '20:900, 300:1050', dataset: { testid: 'mat-cpT' }, onChange: (event) => onPatch({ cpT: parseTable(event.target.value) }) }), h('span', { className: 'muted' }, '°C:J/kgK')));

  if (material.kind === 'porous' && model) {
    rows.push(row(t('poreFluid'), select(material.fluid ?? '', [['', '—'], ...model.materials.filter((m) => m.kind === 'fluid').map((m) => [m.id, m.name])], (v) => onPatch({ fluid: v || null }))));
  }
  return rows;
}

export function showMaterials(app) {
  const lang = getLanguage();
  let selected = { from: 'model', id: app.doc()?.model.materials[0]?.id };
  const list = h('div', { className: 'material-list' });
  const props = h('div', { className: 'material-props' });
  const render = () => {
    const model = app.doc().model;
    const item = (from, m, meta) => h('button', {
      type: 'button', className: selected.from === from && selected.id === m.id ? 'material-item on' : 'material-item', dataset: { testid: `mat-${from}-${m.id}` },
      onClick: () => { selected = { from, id: m.id }; render(); },
    }, h('span', { className: 'chip', style: { background: materialColor(m) } }), h('span', { className: 'ellipsis' }, materialName(m, lang)), h('span', { className: 'meta' }, meta));
    replace(list,
      h('p', { className: 'menu-section' }, t('inModel')),
      ...model.materials.map((m) => item('model', m, `k ${formatValue(m.k)}`)),
      ...MATERIAL_CATEGORIES.flatMap((cat) => [
        h('p', { className: 'menu-section' }, `${t('libraryList')} · ${lang === 'en' ? cat.en : cat.ko}`),
        ...MATERIAL_LIBRARY.filter((m) => m.category === cat.id).map((m) => item('library', m, `k ${formatValue(m.kx ?? m.k)}`)),
      ]));
    if (selected.from === 'model') {
      const material = model.materials.find((m) => m.id === selected.id);
      if (!material) { replace(props); return; }
      const used = model.bodies.filter((b) => b.material === material.id).length + (model.domain.background === material.id ? 1 : 0);
      replace(props, ...materialEditor(material, (patch) => { app.updateMaterial(material.id, patch); render(); }, model),
        h('div', { className: 'row' },
          h('button', { type: 'button', onClick: () => { app.assignMaterial(material.id); } }, `${commandIcon('assignMaterial')} ${commandName('assignMaterial', lang)}`),
          h('button', { type: 'button', disabled: used > 0, title: used ? `${used}` : '', onClick: () => { app.removeMaterial(material.id); selected = { from: 'model', id: app.doc().model.materials[0]?.id }; render(); } }, t('remove'))));
    } else {
      const source = MATERIAL_LIBRARY.find((m) => m.id === selected.id);
      const facts = [
        [t('conductivity'), `${formatValue(source.k)}${source.kx ? ` (x ${formatValue(source.kx)})` : ''} W/m·K`],
        [t('density'), `${formatValue(source.rho)} kg/m³`],
        [t('specificHeat'), `${formatValue(source.cp)} J/kg·K`],
        [t('emissivity'), formatValue(source.emissivity ?? 0)],
        ...(source.E ? [[t('youngs'), `${formatValue(source.E / 1e9)} GPa`], [t('cte'), `${formatValue((source.alpha ?? 0) * 1e6)} ppm/K`]] : []),
        ...(source.mu ? [[t('viscosity'), `${formatValue(source.mu * 1e3)} mPa·s`]] : []),
        ...(source.latent ? [[t('meltT'), `${source.Tmelt} °C`], [t('latent'), `${formatValue(source.latent / 1e3)} kJ/kg`]] : []),
        ...(source.porosity ? [[t('porosity'), formatValue(source.porosity)], [t('permeability'), `${source.permeability} m²`]] : []),
      ];
      replace(props, h('h3', { className: 'tool-group-title' }, materialName(source, lang)), ...facts.map(([a, b]) => row(a, h('span', null, b))),
        h('div', { className: 'row' }, h('button', { type: 'button', className: 'primary', dataset: { testid: 'mat-add' }, onClick: () => {
          const id = app.addLibraryMaterial(source.id);
          selected = { from: 'model', id };
          render();
        } }, t('addToModel'))));
    }
  };
  render();
  popup({ id: 'materials', title: t('materialLibrary'), icon: '🧱', width: 820, height: 600, body: h('div', { className: 'material-layout' }, list, props), actions: [{ label: t('close'), primary: true }] });
}

// ───────────────────────── domain / study

export function showDomain(app) {
  const doc = app.doc();
  const draft = structuredClone(doc.model.domain);
  let ambient = doc.model.ambient;
  const info = h('p', { className: 'part-help' });
  const update = () => {
    const dz = draft.dim === 3 ? `× ${formatValue(draft.depth / draft.nz)}` : '';
    info.textContent = `${t('cells')}: ${cellCount(draft).toLocaleString()} · Δ = ${formatValue(draft.width / draft.nx)} × ${formatValue(draft.height / draft.ny)} ${dz} mm`;
  };
  const num = (key, step, suffix, min = 0.001) => numberField({ value: draft[key], step, min, suffix, onChange: (v) => { draft[key] = v; update(); } });
  const intField = (key) => numberField({ value: draft[key], step: 10, min: 1, max: 2000, onChange: (v) => { draft[key] = Math.round(v); update(); } });
  const body = h('div', { className: 'print-options' },
    row(t('dimension'), select(draft.dim, [[2, '2D'], [3, '3D']], (v) => { draft.dim = Number(v); update(); }, 'domain-dim')),
    row(t('width'), num('width', 10, 'mm')),
    row(t('height'), num('height', 10, 'mm')),
    row(t('depth'), num('depth', 1, 'mm')),
    row(t('cellsX'), intField('nx')),
    row(t('cellsY'), intField('ny')),
    row(t('cellsZ'), intField('nz')),
    row(t('background'), select(draft.background ?? '', [['', t('void')], ...doc.model.materials.map((m) => [m.id, m.name])], (v) => { draft.background = v || null; })),
    row(t('ambient'), numberField({ value: ambient, step: 1, min: -273, suffix: '°C', onChange: (v) => { ambient = v; } })),
    info);
  update();
  popup({
    id: 'domain', title: commandName('domain', getLanguage()), icon: '⬚', width: 460, height: 470, body,
    actions: [
      { label: t('apply'), primary: true, testid: 'domain-apply', onClick: (close) => { app.updateModel((m) => ({ ...m, domain: { ...draft }, ambient }), true); close(); } },
      { label: t('cancel') },
    ],
  });
}

export function studyFields(study, onPatch, dim) {
  const lang = getLanguage();
  const rows = [
    row(t('studyType'), select(study.type, [['steady', commandName('steady', lang)], ['transient', commandName('transient', lang)]], (v) => onPatch({ type: v }), 'study-type')),
    row(commandName('toggleFlow', lang), check(study.flow, (v) => onPatch({ flow: v }), 'study-flow')),
    row(commandName('toggleNatural', lang), check(study.natural, (v) => onPatch({ natural: v }))),
    row(commandName('toggleTurbulence', lang), select(study.turbulence ?? 'laminar', [['laminar', t('laminar')], ['kOmegaSST', 'k-ω SST']], (v) => onPatch({ turbulence: v, flow: v === 'laminar' ? study.flow : true }), 'study-turbulence')),
    row(commandName('toggleElectric', lang), check(study.electric, (v) => onPatch({ electric: v }), 'study-electric')),
    row(commandName('toggleStress', lang), check(study.stress, (v) => onPatch({ stress: v }), 'study-stress')),
    row(commandName('toggleModal', lang), check(study.modal?.enabled, (v) => onPatch({ modal: { ...(study.modal ?? {}), enabled: v } }), 'study-modal')),
    row(t('s2sRadiation'), check(study.s2s, (v) => onPatch({ s2s: v }), 'study-s2s')),
  ];
  const solar = study.solar ?? { enabled: false, irradiance: 1000, elevation: 60, azimuth: 0 };
  rows.push(row(t('solarLoad'), check(solar.enabled, (v) => onPatch({ solar: { ...solar, enabled: v } }), 'study-solar')));
  if (solar.enabled) {
    rows.push(
      row(t('solarIrradiance'), numberField({ value: solar.irradiance, min: 0, max: 5000, step: 50, suffix: 'W/m²', testid: 'study-solar-g', onChange: (v) => onPatch({ solar: { ...solar, irradiance: v } }) })),
      row(t('solarElevation'), numberField({ value: solar.elevation, min: -90, max: 90, step: 5, suffix: '°', testid: 'study-solar-el', onChange: (v) => onPatch({ solar: { ...solar, elevation: v } }) })),
      row(t('solarAzimuth'), numberField({ value: solar.azimuth, min: -360, max: 360, step: 15, suffix: '°', testid: 'study-solar-az', onChange: (v) => onPatch({ solar: { ...solar, azimuth: v } }) })),
    );
  }
  if (study.s2s) rows.push(row(t('s2sMedium'), select(study.s2sMedium ?? 'void', [['void', t('s2sVoid')], ['fluids', t('s2sFluids')]], (v) => onPatch({ s2sMedium: v }), 'study-s2s-medium')));
  if (study.stress) {
    rows.push(row(t('thermalStrain'), check(study.thermalStrain !== false, (v) => onPatch({ thermalStrain: v }))));
    rows.push(row(t('gravityLoad'), check(study.gravityLoad, (v) => onPatch({ gravityLoad: v }))));
  }
  if (study.modal?.enabled) rows.push(row(t('modeCount'), numberField({ value: study.modal.modes ?? 6, min: 1, max: 20, step: 1, onChange: (v) => onPatch({ modal: { ...study.modal, modes: Math.round(v) } }) })));
  if (study.type === 'transient') {
    rows.push(
      row(t('endTime'), numberField({ value: study.endTime, step: 10, min: 1e-6, suffix: 's', onChange: (v) => onPatch({ endTime: v }) })),
      row(t('timeStep'), numberField({ value: study.dt, step: 0.5, min: 1e-6, suffix: 's', onChange: (v) => onPatch({ dt: v }) })),
      row(t('frames'), numberField({ value: study.frames, step: 10, min: 2, max: 500, onChange: (v) => onPatch({ frames: Math.round(v) }) })),
      row(t('initialT'), numberField({ value: study.initialT, step: 1, suffix: '°C', onChange: (v) => onPatch({ initialT: v }) })));
  }
  if (study.flow) rows.push(row(t('flowSteps'), numberField({ value: study.flowSteps, step: 500, min: 10, max: 100000, onChange: (v) => onPatch({ flowSteps: Math.round(v) }) })));
  if (study.flow) {
    // Thermal comfort (ISO 7730 PMV / PPD) inputs: the occupant and the room's radiant temperature.
    const c = { met: 1.2, clo: 0.5, rh: 50, tr: null, ...(study.comfort ?? {}) };
    const setC = (patch) => onPatch({ comfort: { ...c, ...patch } });
    rows.push(
      row(t('comfortMet'), numberField({ value: c.met, step: 0.1, min: 0.8, max: 4, suffix: 'met', testid: 'study-met', onChange: (v) => setC({ met: v }) })),
      row(t('comfortClo'), numberField({ value: c.clo, step: 0.1, min: 0, max: 2, suffix: 'clo', testid: 'study-clo', onChange: (v) => setC({ clo: v }) })),
      row(t('comfortRh'), numberField({ value: c.rh, step: 5, min: 0, max: 100, suffix: '%', testid: 'study-rh', onChange: (v) => setC({ rh: v }) })),
      row(t('comfortTr'), check(Number.isFinite(c.tr), (on) => setC({ tr: on ? 20 : null }), 'study-tr-on'),
        Number.isFinite(c.tr) ? numberField({ value: c.tr, step: 0.5, suffix: '°C', testid: 'study-tr', onChange: (v) => setC({ tr: v }) }) : h('span', { className: 'muted' }, t('comfortTrAir'))));
  }
  if (study.stress || study.natural) rows.push(row(t('refT'), numberField({ value: study.Tref, step: 1, suffix: '°C', onChange: (v) => onPatch({ Tref: v }) })));
  if (study.stress && dim === 2) rows.push(row(t('planeStrain'), check(study.planeStrain, (v) => onPatch({ planeStrain: v }))));
  rows.push(
    row(t('tolerance'), numberField({ value: study.tolerance, step: 1e-7, min: 1e-14, onChange: (v) => onPatch({ tolerance: v }) })),
    row(t('maxIter'), numberField({ value: study.maxIter, step: 1000, min: 10, onChange: (v) => onPatch({ maxIter: Math.round(v) }) })));
  return rows;
}

export function showStudy(app) {
  const doc = app.doc();
  let draft = { ...doc.model.study };
  const content = h('div', { className: 'print-options' });
  const render = () => replace(content, ...studyFields(draft, (p) => { draft = { ...draft, ...p }; render(); }, doc.model.domain.dim));
  render();
  popup({
    id: 'study', title: t('studyTitle'), icon: '⚙', width: 460, height: 500, body: content,
    actions: [
      { label: t('apply'), primary: true, testid: 'study-apply', onClick: (close) => { app.updateModel((m) => ({ ...m, study: { ...draft } }), true); close(); } },
      { label: t('cancel') },
    ],
  });
}

export function showValidation(issues) {
  const content = issues.length
    ? h('div', { className: 'issue-list scroll' }, ...issues.map((issue) => h('div', { className: `issue ${issue.level}` }, h('span', { className: 'mark' }, issue.level === 'error' ? '⛔' : '⚠'), h('span', null, issue.text))))
    : h('p', { className: 'error-headline' }, `✔ ${t('validateOk')}`);
  popup({ id: 'validate', title: t('validateTitle'), icon: '✔', width: 560, height: issues.length ? 360 : 180, body: content, actions: [{ label: t('close'), primary: true }] });
}

// ───────────────────────── report

/**
 * The study report as standalone HTML (also used for the dialog and printing). include picks the sections:
 * { title, model, results, log } (all on by default; printing turns them on and off).
 */
export function reportHtml(app, doc, include = {}) {
  const on = { title: true, model: true, results: true, log: true, ...include };
  const { model, result } = doc;
  const lang = getLanguage();
  const unit = app.state.settings.temperatureUnit;
  const T = (v) => (Number.isFinite(v) ? `${formatValue(toDisplayT(v, unit))} ${tUnitLabel(unit)}` : '—');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const table = (head, rows) => `<table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x, i) => `<td${i ? ' class="num"' : ''}>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const header = result?.header;
  const bodyName = (id) => model.bodies.find((b) => b.id === id)?.name || id;
  const bcName = (id) => model.boundaries.find((b) => b.id === id)?.name || id;
  const probeName = (id) => model.probes.find((p) => p.id === id)?.name || id;
  const d = model.domain;
  const parts = on.title ? [`<h1>${esc(model.name || t('untitled'))}</h1>`, model.description ? `<p>${esc(model.description)}</p>` : ''] : [];
  if (on.model) parts.push(
    `<h2>${t('reportModel')}</h2>`,
    `<p>${d.dim}D · ${d.width} × ${d.height}${d.dim === 3 ? ` × ${d.depth}` : ''} mm · ${cellCount(d).toLocaleString()} ${t('cells')} · ${commandName(model.study.type, lang)}${model.study.flow ? ` · ${commandName('toggleFlow', lang)}` : ''}${model.study.stress ? ` · ${commandName('toggleStress', lang)}` : ''}</p>`,
    table([t('treeBodies'), t('material'), t('power')], model.bodies.map((b) => [b.name || b.id, model.materials.find((m) => m.id === b.material)?.name ?? '—', b.current ? 'I²R' : b.powerProfile ? 'P(t)' : `${formatValue(b.power)} W`])),
    table([t('treeBoundaries'), t('target'), t('type')], model.boundaries.map((bc) => [bc.name || bc.id, bc.target, t(`bc${bc.type[0].toUpperCase()}${bc.type.slice(1)}`)])),
  );
  if (header && on.results) {
    parts.push(
      `<h2>${t('reportSummary')}</h2>`,
      `<p>${t('minT')} ${T(header.stats.Tmin)} · ${t('maxT')} ${T(header.stats.Tmax)}${header.stats.vmax ? ` · v<sub>max</sub> ${formatValue(header.stats.vmax)} m/s` : ''}${header.stats.vonMisesMax ? ` · σ<sub>vM,max</sub> ${formatValue(header.stats.vonMisesMax / 1e6)} MPa` : ''} · ${t('elapsed')} ${formatValue((header.elapsedMs ?? 0) / 1000)} s</p>`,
      `<h2>${t('reportBodies')}</h2>`,
      table([t('treeBodies'), t('minT'), t('avgT'), t('maxT')], (header.bodies ?? []).map((b) => [bodyName(b.id), T(b.min), T(b.avg), T(b.max)])),
      `<h2>${t('reportIntegrals')}</h2>`,
      (() => { try { const ints = bodyIntegrals(result, model, 'T', Math.max(0, (header.times?.length ?? 1) - 1)); return table([t('treeBodies'), `${t('volume')} (cm³)`, t('minT'), t('avgT'), t('maxT'), '∫T dV (°C·cm³)'], ints.bodies.filter((b) => b.cells > 0).map((b) => [b.name, formatValue(b.volume * 1e6), T(b.min), T(b.mean), T(b.max), formatValue(b.integral * 1e6)])); } catch { return ''; } })(),
      `<h2>${t('reportBoundaries')}</h2>`,
      table([t('treeBoundaries'), `${t('heat')} (W)`, `${t('area')} (m²)`], (header.boundaries ?? []).map((b) => [bcName(b.id), formatValue(b.heat), formatValue(b.area)])),
      `<h2>${t('reportBalance')}</h2>`,
      header.balance ? `<p>${t('generated')} ${formatValue(header.balance.generated)} W · ${t('throughBoundaries')} ${formatValue(header.balance.boundaries)} W · ${t('stored')} ${formatValue(header.balance.stored)} W · ${t('balanceError')} ${formatValue((header.balance.error ?? 0) * 100)} %</p>` : '',
    );
    if (header.probes?.length) parts.push(`<h2>${t('reportProbes')}</h2>`, table([t('treeProbes'), t('maxT'), t('temperature')], header.probes.map((p) => {
      const values = (p.values ?? []).filter((v) => Number.isFinite(v));
      return [probeName(p.id), T(Math.max(...values)), T(values[values.length - 1])];
    })));
    if (header.warnings?.length) parts.push(`<h2>${t('warnings')}</h2>`, ...header.warnings.map((w) => `<p>⚠ ${esc(w)}</p>`));
    if (header.log?.length && on.log) parts.push(`<h2>${t('reportLog')}</h2>`, table(['phase', 'iterations', 'residual'], header.log.map((l) => [l.phase, l.iterations ?? '', l.residual != null ? Number(l.residual).toExponential(2) : ''])));
  } else if (on.results) {
    parts.push(`<p>${t('noResults')}</p>`);
  }
  return parts.join('\n');
}

export function standaloneReport(app, doc) {
  const css = 'body{font:13px "Segoe UI","Malgun Gothic",sans-serif;margin:24px;color:#1c2833}h1{font-size:20px}h2{font-size:14px;color:#1478b8;margin-top:18px}table{border-collapse:collapse;margin:6px 0}th,td{border:1px solid #d5dee8;padding:3px 8px;text-align:left}td.num{text-align:right}th{background:#eef3f8}';
  return `<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><title>${doc.model.name}</title><style>${css}</style></head><body>${reportHtml(app, doc)}<p style="color:#888;margin-top:24px">MyHeatManager · ${new Date().toLocaleString()}</p></body></html>`;
}

export function showReport(app) {
  const doc = app.doc();
  const content = h('div', { className: 'scroll report-html' });
  content.innerHTML = reportHtml(app, doc).replace(/<table>/g, '<table class="data-table">');
  popup({
    id: 'report', title: t('reportTitle'), icon: '📄', width: 820, height: 620, body: content,
    actions: [
      { label: t('saveFile'), testid: 'report-save', onClick: () => app.saveReport() },
      { label: commandName('print', getLanguage()), onClick: () => app.printReport() },
      { label: t('close'), primary: true },
    ],
  });
}

// ───────────────────────── reliability (Sherlock-style)

export function showReliability(app) {
  const doc = app.doc();
  const content = h('div', { className: 'scroll' });
  const render = () => {
    const { model, result } = app.doc();
    if (!result) {
      replace(content, h('p', { className: 'error-headline' }, t('needResults')));
      return;
    }
    const components = model.reliability.components;
    const stats = new Map((result.header.bodies ?? []).map((b) => [b.id, b]));
    const lives = [];
    const unit = app.state.settings.temperatureUnit;
    const update = (index, patch) => {
      app.updateModel((m) => ({ ...m, reliability: { components: m.reliability.components.map((c, i) => (i === index ? { ...c, ...patch } : c)) } }), true);
      render();
    };
    const numberInput = (value, onChange, step = 1, min = 0) => numberField({ value: value ?? NaN, step: Number(step), min, onChange });
    const rows = components.map((component, index) => {
      const s = stats.get(component.body) ?? { max: NaN, min: NaN };
      const history = s.maxHistory?.filter(Number.isFinite) ?? [];
      const swing = history.length > 1 ? Math.max(...history) - Math.min(...history) : 0;
      const life = componentLife(component, { max: s.max, min: s.min, swing }, model.ambient);
      lives.push(life);
      return h('tr', null,
        h('td', null, select(component.body, model.bodies.map((b) => [b.id, b.name || b.id]), (v) => update(index, { body: v }))),
        h('td', { className: 'num' }, `${formatValue(toDisplayT(s.max, unit))} ${tUnitLabel(unit)}`),
        h('td', null, numberInput(component.Ea ?? 0.7, (v) => update(index, { Ea: v }), '0.05')),
        h('td', null, numberInput(component.Tref ?? 55, (v) => update(index, { Tref: v }), '1')),
        h('td', null, numberInput(component.mttfRef ?? 1e6, (v) => update(index, { mttfRef: v }), '1000')),
        h('td', null, numberInput(component.cycles ?? 3650, (v) => update(index, { cycles: v }), '1')),
        h('td', null, numberInput(component.dTcycle, (v) => update(index, { dTcycle: v }), '1')),
        h('td', { className: 'num' }, formatValue(life.af)),
        h('td', { className: 'num' }, `${formatValue(life.mttf)} h`),
        h('td', { className: 'num' }, formatValue(life.fit)),
        h('td', { className: 'num' }, `${formatValue(life.fatigueYears)} y`),
        h('td', { className: 'num' }, `${formatValue(life.lifeYears)} y`),
        h('td', null, h('button', { type: 'button', title: t('remove'), onClick: () => {
          app.updateModel((m) => ({ ...m, reliability: { components: m.reliability.components.filter((_, i) => i !== index) } }), true);
          render();
        } }, '✕')));
    });
    const system = systemLife(lives);
    replace(content,
      h('div', { className: 'stat-grid' },
        h('div', { className: 'stat' }, h('span', null, `${t('system')} ${t('fit')}`), h('b', null, formatValue(system.fit))),
        h('div', { className: 'stat' }, h('span', null, `${t('system')} ${t('mttf')}`), h('b', null, `${formatValue(system.years)} y`)),
        h('div', { className: 'stat' }, h('span', null, t('survival5')), h('b', null, `${formatValue(survival(system.mttf, 5 * 8766) * 100)} %`)),
        h('div', { className: 'stat' }, h('span', null, t('life')), h('b', null, `${formatValue(system.minLifeYears)} y`))),
      h('table', { className: 'data-table' },
        h('thead', null, h('tr', null, ...[t('component'), t('maxT'), `${t('activation')} (eV)`, `${t('ratedT')} (°C)`, `${t('ratedMttf')} (h)`, t('cyclesYear'), `${t('cycleDT')} (K)`, t('af'), t('mttf'), t('fit'), t('fatigue'), t('life'), ''].map((x) => h('th', null, x)))),
        h('tbody', null, ...rows)),
      h('div', { className: 'row' }, h('button', { type: 'button', dataset: { testid: 'rel-add' }, disabled: !model.bodies.length, onClick: () => {
        const body = model.bodies.find((b) => b.power > 0 || b.current || b.powerProfile) ?? model.bodies[0];
        app.updateModel((m) => ({ ...m, reliability: { components: [...m.reliability.components, { body: body.id, Ea: 0.7, Tref: 55, mttfRef: 1e6, cycles: 3650, dTcycle: null }] } }), true);
        render();
      } }, `✚ ${t('addComponent')}`)),
      h('p', { className: 'part-help' }, getLanguage() === 'en'
        ? 'Arrhenius: AF = exp[Ea/k·(1/T_rated − 1/T_use)], MTTF = MTTF_rated / AF. Coffin–Manson: N_f = C·ΔT^−n with ΔT from the transient swing of the body (or its rise over ambient when the study is steady, i.e. one power cycle). Life = the smaller of the two; the system is a series system (FIT add).'
        : '아레니우스: AF = exp[Ea/k·(1/T정격 − 1/T사용)], MTTF = MTTF정격 / AF. 코핀-맨슨: N_f = C·ΔT^−n — ΔT 는 과도 해석의 물체 온도 변동폭(정상 상태면 주위 대비 상승분 = 전원 1회 사이클). 수명은 둘 중 짧은 값이고, 시스템은 직렬(FIT 합)로 계산합니다.'));
  };
  render();
  popup({ id: 'reliability', title: t('reliabilityTitle'), icon: '🛡', width: 1060, height: 520, body: content, actions: [{ label: t('close'), primary: true }] });
  return doc;
}

// ───────────────────────── U-factor (THERM-style)

/**
 * The coldest surface cell on the warm side: cells whose outer face (next to void or the domain edge) carries the
 * warm boundary — its edge, its body, or for "exterior" its region.
 */
export function warmSurfaceMin(result, model, bc) {
  if (!result || !bc) return NaN;
  const { nx, ny, nz, dim, dx, dy } = result.header.grid;
  const lastT = (result.header.fields.T.frames ?? 1) - 1;
  const T = fieldOf(result, 'T', lastT);
  const mat = fieldOf(result, 'mat');
  const layers = dim === 3 ? nz : 1;
  const bodyMat = bc.target.startsWith('body:') ? model.bodies.find((b) => `body:${b.id}` === bc.target)?.material : null;
  const matIndex = bodyMat != null ? result.header.materials.indexOf(bodyMat) : -1;
  let min = Infinity;
  const inRegion = (x, y) => !bc.region || (x >= bc.region[0] && x <= bc.region[2] && y >= bc.region[1] && y <= bc.region[3]);
  const solid = (i, j, k) => i >= 0 && j >= 0 && i < nx && j < ny && mat[i + nx * (j + ny * k)] < 255;
  for (let k = 0; k < layers; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = i + nx * (j + ny * k);
    if (mat[n] >= 255 || !Number.isFinite(T[n])) continue;
    if (matIndex >= 0 && mat[n] !== matIndex) continue;
    for (const [di, dj, edge] of [[-1, 0, 'left'], [1, 0, 'right'], [0, -1, 'bottom'], [0, 1, 'top']]) {
      const outside = !solid(i + di, j + dj, k);
      if (!outside) continue;
      const atEdge = (edge === 'left' && i === 0) || (edge === 'right' && i === nx - 1) || (edge === 'bottom' && j === 0) || (edge === 'top' && j === ny - 1);
      if (['left', 'right', 'top', 'bottom'].includes(bc.target) && !(atEdge && edge === bc.target)) continue;
      const x = (i + 0.5 + di * 0.5) * dx;
      const y = (j + 0.5 + dj * 0.5) * dy;
      if (!inRegion(x, y)) continue;
      if (bc.range && ['left', 'right'].includes(bc.target) && (y < bc.range[0] || y > bc.range[1])) continue;
      if (bc.range && ['top', 'bottom'].includes(bc.target) && (x < bc.range[0] || x > bc.range[1])) continue;
      min = Math.min(min, T[n]);
    }
  }
  return min;
}

export function showUFactor(app) {
  const content = h('div', { className: 'print-options' });
  const render = () => {
    const { model, result } = app.doc();
    if (!result) {
      replace(content, h('p', { className: 'error-headline' }, t('needResults')));
      return;
    }
    const convective = model.boundaries.filter((bc) => bc.type === 'convection');
    const pick = model.view?.uFactor ?? {};
    const warm = convective.find((bc) => bc.id === pick.warm) ?? [...convective].sort((a, b) => b.Tinf - a.Tinf)[0];
    const cold = convective.find((bc) => bc.id === pick.cold) ?? [...convective].sort((a, b) => a.Tinf - b.Tinf)[0];
    const heatOf = (bc) => result.header.boundaries?.find((b) => b.id === bc?.id);
    const setPick = (p) => { app.updateModel((m) => ({ ...m, view: { ...m.view, uFactor: { warm: warm?.id, cold: cold?.id, ...p } } }), false); render(); };
    const info = heatOf(warm);
    const figures = warm && cold && info ? sectionFigures(info.heat, info.area, model.domain.depth / 1000, warm.Tinf, cold.Tinf) : null;
    replace(content,
      row(t('warmSide'), select(warm?.id ?? '', convective.map((bc) => [bc.id, `${bc.name || bc.id} (${bc.Tinf} °C)`]), (v) => setPick({ warm: v }), 'u-warm')),
      row(t('coldSide'), select(cold?.id ?? '', convective.map((bc) => [bc.id, `${bc.name || bc.id} (${bc.Tinf} °C)`]), (v) => setPick({ cold: v }), 'u-cold')),
      h('div', { className: 'stat-grid' },
        h('div', { className: 'stat' }, h('span', null, `${t('uValue')} (W/m²K)`), h('b', { dataset: { testid: 'u-value' } }, figures ? formatValue(figures.U) : '—')),
        h('div', { className: 'stat' }, h('span', null, `${t('rValue')} (m²K/W)`), h('b', null, figures ? formatValue(figures.R) : '—')),
        h('div', { className: 'stat' }, h('span', null, `${t('l2d')} (W/mK)`), h('b', null, figures ? formatValue(figures.L2D) : '—')),
        h('div', { className: 'stat' }, h('span', null, `${t('heat')} (W)`), h('b', null, info ? formatValue(info.heat) : '—'))),
      h('p', { className: 'part-help' }, t('uNote')),
      tagTable(model, result, warm, cold),
      cavity(),
      condensation(model, result, warm, cold));
  };
  // THERM / NFRC tags: U on the total and the projected length of every tagged boundary group.
  const tagTable = (model, result, warm, cold) => {
    if (!warm || !cold) return null;
    const rows = uFactorByTag({ boundaries: model.boundaries, results: result.header.boundaries, depth: model.domain.depth, Twarm: warm.Tinf, Tcold: cold.Tinf });
    return h('fieldset', { className: 'field-group' }, h('legend', null, t('uByTag')),
      rows.length ? h('table', { className: 'data-table', dataset: { testid: 'u-tags' } },
        h('thead', null, h('tr', null, ...[t('uTag'), `${t('heat')} (W)`, `L (mm)`, `${t('uValue')} (W/m²K)`, `L_proj (mm)`, `U_proj (W/m²K)`].map((x) => h('th', null, x)))),
        h('tbody', null, ...rows.map((r) => h('tr', null, h('td', null, r.tag), ...[r.heat, r.length, r.Utotal, r.projectedLength, r.Uprojected].map((v) => h('td', { className: 'num' }, formatValue(v)))))))
        : h('p', { className: 'part-help' }, t('uTagHint')));
  };
  // ISO 10077-2 frame cavity: the equivalent conductivity of an air cavity from its size and surfaces.
  const cav = { width: 10, height: 20, dT: 10, Tmean: 10, e1: 0.9, e2: 0.9, heatFlow: 'horizontal' };
  const cavity = () => {
    const r = cavityK(cav);
    const set = (p) => { Object.assign(cav, p); render(); };
    return h('fieldset', { className: 'field-group' }, h('legend', null, t('cavityTitle')),
      row(t('cavityWidth'), numberField({ value: cav.width, min: 0.5, max: 200, step: 1, suffix: 'mm', testid: 'cavity-width', onChange: (v) => set({ width: v }) })),
      row(t('cavityHeight'), numberField({ value: cav.height, min: 0.5, max: 500, step: 1, suffix: 'mm', onChange: (v) => set({ height: v }) })),
      row('ΔT · T_m', numberField({ value: cav.dT, min: 0.1, max: 60, step: 1, suffix: 'K', onChange: (v) => set({ dT: v }) }), numberField({ value: cav.Tmean, min: -30, max: 60, step: 1, suffix: '°C', onChange: (v) => set({ Tmean: v }) })),
      row('ε₁ · ε₂', numberField({ value: cav.e1, min: 0.02, max: 1, step: 0.05, onChange: (v) => set({ e1: v }) }), numberField({ value: cav.e2, min: 0.02, max: 1, step: 0.05, onChange: (v) => set({ e2: v }) })),
      row(t('cavityFlow'), select(cav.heatFlow, [['horizontal', t('flowHorizontal')], ['up', t('flowUp')], ['down', t('flowDown')]], (v) => set({ heatFlow: v }))),
      cavityTarget(r.k),
      h('div', { className: 'stat-grid' }, h('div', { className: 'stat' }, h('span', null, 'k_eq (W/mK)'), h('b', { dataset: { testid: 'cavity-k' } }, formatValue(r.k))),
        h('div', { className: 'stat' }, h('span', null, 'h_a (W/m²K)'), h('b', null, formatValue(r.ha))), h('div', { className: 'stat' }, h('span', null, 'h_r (W/m²K)'), h('b', null, formatValue(r.hr)))));
  };
  // The equivalent conductivity goes into a cavity material of the model (THERM's frame-cavity workflow).
  const cavityTarget = (k) => {
    const mats = app.doc().model.materials.filter((m) => m.kind !== 'fluid');
    if (!mats.length) return null;
    cav.material = mats.some((m) => m.id === cav.material) ? cav.material : (mats.find((m) => /cavity|gap|공동/i.test(`${m.id} ${m.name}`)) ?? mats[0]).id;
    const target = mats.find((m) => m.id === cav.material);
    return h('div', { className: 'row' }, h('span', null, t('cavityMaterial')),
      select(cav.material, mats.map((m) => [m.id, `${m.name} (k ${formatValue(m.k)})`]), (v) => { cav.material = v; render(); }, 'cavity-material'),
      h('button', { type: 'button', dataset: { testid: 'cavity-apply' }, onClick: () => {
        const value = Number(k.toPrecision(4));
        app.updateMaterial(target.id, { k: value, kx: null, ky: null, kz: null });
        app.setStatus(t('cavityApplied', { name: target.name, k: formatValue(value) }));
        render();
      } }, t('cavityApply')));
  };
  const rh = { value: 50 };
  const condensation = (model, result, warm, cold) => {
    if (!warm || !cold) return null;
    const tsi = warmSurfaceMin(result, model, warm);
    const dew = dewPoint(warm.Tinf, rh.value);
    const f = temperatureFactor(tsi, warm.Tinf, cold.Tinf);
    const risk = tsi <= dew;
    return h('fieldset', { className: 'field-group' }, h('legend', null, t('condensationTitle')),
      row(t('indoorRh'), numberField({ value: rh.value, min: 10, max: 95, step: 5, suffix: '%', onChange: (v) => { rh.value = v; render(); } })),
      h('div', { className: 'stat-grid' },
        h('div', { className: 'stat' }, h('span', null, t('minSurfaceT')), h('b', { dataset: { testid: 'u-tsi' } }, `${formatValue(tsi)} °C`)),
        h('div', { className: 'stat' }, h('span', null, t('dewPointT')), h('b', null, `${formatValue(dew)} °C`)),
        h('div', { className: 'stat' }, h('span', null, 'fRsi'), h('b', { dataset: { testid: 'u-frsi' } }, formatValue(f))),
        h('div', { className: 'stat' }, h('span', null, t('condensationRisk')), h('b', { style: { color: risk ? 'var(--danger)' : 'var(--accent)' } }, risk ? t('riskYes') : f < 0.75 ? t('riskMould') : t('riskNo')))),
      h('p', { className: 'part-help' }, t('condensationNote')));
  };
  render();
  popup({ id: 'ufactor', title: t('uFactorTitle'), icon: '🏠', width: 720, height: 680, body: h('div', { className: 'scroll' }, content), actions: [{ label: t('close'), primary: true }] });
}

// ───────────────────────── heat map from node data (HAM-style)

export function showHeatmap(app, initial = null) {
  const hm = app.state.heatmap;
  if (initial) Object.assign(hm, { data: initial.data, name: initial.name, time: null });
  const canvas = h('canvas', { className: 'heatmap-canvas', dataset: { testid: 'heatmap-canvas' } });
  const side = h('div', { className: 'heatmap-side' });
  const paint = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!hm.data) return;
    const nodes = shownNodes();
    if (!nodes.length) {
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--muted') || '#888';
      ctx.fillText(t('heatmapNoNodes'), 20, 30);
      return;
    }
    if (hm.view === '3d' && zSpread()) { paint3d(ctx, rect, nodes); return; }
    const b = nodeBounds(nodes);
    const aspect = (b.y1 - b.y0) / (b.x1 - b.x0);
    const nx = hm.resolution;
    const ny = Math.max(4, Math.round(nx * aspect));
    const raster = idwRaster(nodes, b, nx, ny, hm.power);
    let lo = Infinity; let hi = -Infinity;
    for (const v of raster) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const table = lut(app.state.settings.colormap, app.state.settings.colorSteps);
    const off = document.createElement('canvas');
    off.width = nx; off.height = ny;
    const octx = off.getContext('2d');
    const image = octx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = raster[i + j * nx];
      const n = Math.max(0, Math.min(255, Math.round(((v - lo) / (hi - lo || 1)) * 255)));
      const p = (i + (ny - 1 - j) * nx) * 4;
      image.data[p] = table[n * 3]; image.data[p + 1] = table[n * 3 + 1]; image.data[p + 2] = table[n * 3 + 2]; image.data[p + 3] = 255;
    }
    octx.putImageData(image, 0, 0);
    const pad = 30;
    const scale = Math.min((rect.width - pad * 2 - 70) / (b.x1 - b.x0), (rect.height - pad * 2) / (b.y1 - b.y0));
    const w = (b.x1 - b.x0) * scale;
    const hgt = (b.y1 - b.y0) * scale;
    const ox = pad;
    const oy = (rect.height - hgt) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, ox, oy, w, hgt);
    if (hm.showNodes) {
      ctx.font = '10px "Segoe UI", sans-serif';
      for (const n of nodes) {
        const x = ox + (n.x - b.x0) * scale;
        const y = oy + hgt - (n.y - b.y0) * scale;
        ctx.fillStyle = hm.limit != null && n.T > hm.limit ? '#ff3030' : 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    // colour bar
    const barX = ox + w + 16;
    for (let y = 0; y < hgt; y++) {
      const n = Math.round((1 - y / hgt) * 255);
      ctx.fillStyle = `rgb(${table[n * 3]},${table[n * 3 + 1]},${table[n * 3 + 2]})`;
      ctx.fillRect(barX, oy + y, 14, 1);
    }
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--text');
    ctx.fillText(`${formatValue(hi)} °C`, barX + 18, oy + 8);
    ctx.fillText(`${formatValue(lo)} °C`, barX + 18, oy + hgt);
    hm.raster = { raster, nx, ny, bounds: b, lo, hi };
  };
  // 3D node data (a z column with more than one value): a z range for the plan map and a turnable point view.
  const zSpread = () => {
    const zs = (hm.data?.nodes ?? []).map((n) => n.z);
    return zs.length ? Math.max(...zs) - Math.min(...zs) : 0;
  };
  const shownNodes = () => {
    const all = nodesAt(hm.data, hm.time);
    if (!zSpread() || !hm.zRange) return all;
    return all.filter((n) => n.z >= hm.zRange[0] - 1e-9 && n.z <= hm.zRange[1] + 1e-9);
  };
  hm.yaw ??= -0.6;
  hm.pitch ??= 0.5;
  const paint3d = (ctx, rect, nodes) => {
    const xs = nodes.map((n) => n.x); const ys = nodes.map((n) => n.y); const zs = nodes.map((n) => n.z);
    const c = [xs, ys, zs].map((a) => (Math.min(...a) + Math.max(...a)) / 2);
    const size = Math.max(...[xs, ys, zs].map((a) => Math.max(...a) - Math.min(...a))) || 1;
    const scale = (Math.min(rect.width - 110, rect.height - 40) / size) * 0.8;
    const [cy, sy, cp, sp] = [Math.cos(hm.yaw), Math.sin(hm.yaw), Math.cos(hm.pitch), Math.sin(hm.pitch)];
    // Orthographic view: turn about z (yaw), then tilt about the screen x axis (pitch); depth for back-to-front drawing.
    const project = (x, y, z) => {
      const X = (x - c[0]) * cy - (y - c[1]) * sy;
      const Y = (x - c[0]) * sy + (y - c[1]) * cy;
      const Z = z - c[2];
      return [rect.width / 2 - 35 + X * scale, rect.height / 2 - (Z * cp - Y * sp) * scale, Y * cp + Z * sp];
    };
    const Ts = nodes.map((n) => n.T);
    const lo = Math.min(...Ts); const hi = Math.max(...Ts);
    const table = lut(app.state.settings.colormap, app.state.settings.colorSteps);
    const text = getComputedStyle(canvas).getPropertyValue('--text');
    // Axes from the lower corner.
    const o = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
    ctx.lineWidth = 1;
    ctx.font = '11px "Segoe UI", sans-serif';
    for (const [d, label, col] of [[[size * 0.3, 0, 0], 'x', '#e5534b'], [[0, size * 0.3, 0], 'y', '#57ab5a'], [[0, 0, size * 0.3], 'z', '#539bf5']]) {
      const a = project(...o); const e = project(o[0] + d[0], o[1] + d[1], o[2] + d[2]);
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(label, e[0] + 3, e[1] - 3);
    }
    const pts = nodes.map((n) => ({ n, p: project(n.x, n.y, n.z) })).sort((a, b) => b.p[2] - a.p[2]);
    for (const { n, p } of pts) {
      const k = Math.max(0, Math.min(255, Math.round(((n.T - lo) / (hi - lo || 1)) * 255)));
      ctx.fillStyle = hm.limit != null && n.T > hm.limit ? '#ff3030' : `rgb(${table[k * 3]},${table[k * 3 + 1]},${table[k * 3 + 2]})`;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const barX = rect.width - 60; const top = 30; const hgt = rect.height - 60;
    for (let y = 0; y < hgt; y++) {
      const n = Math.round((1 - y / hgt) * 255);
      ctx.fillStyle = `rgb(${table[n * 3]},${table[n * 3 + 1]},${table[n * 3 + 2]})`;
      ctx.fillRect(barX, top + y, 14, 1);
    }
    ctx.fillStyle = text;
    ctx.fillText(`${formatValue(hi)} °C`, barX - 4, top - 8);
    ctx.fillText(`${formatValue(lo)} °C`, barX - 4, top + hgt + 16);
    hm.raster = null;
  };
  let turning = null;
  canvas.addEventListener('pointerdown', (e) => { if (hm.view === '3d') { turning = [e.clientX, e.clientY, hm.yaw, hm.pitch]; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    if (!turning) return;
    hm.yaw = turning[2] + (e.clientX - turning[0]) * 0.01;
    hm.pitch = Math.max(-1.5, Math.min(1.5, turning[3] + (e.clientY - turning[1]) * 0.01));
    paint();
  });
  canvas.addEventListener('pointerup', () => { turning = null; });
  const renderSide = () => {
    if (!hm.data) {
      replace(side, h('p', { className: 'part-help' }, t('heatmapHint')),
        h('button', { type: 'button', dataset: { testid: 'heatmap-import' }, onClick: () => app.importNodeData() }, `${commandIcon('heatmapImport')} ${commandName('heatmapImport', getLanguage())}`),
        h('button', { type: 'button', dataset: { testid: 'heatmap-sample' }, onClick: () => { hm.data = parseNodeCsv(sampleNodeCsv()); hm.name = 'radiator-nodes.csv'; renderSide(); paint(); } }, t('heatmapSample')),
        h('button', { type: 'button', dataset: { testid: 'heatmap-sample-3d' }, onClick: () => { hm.data = parseNodeCsv(sampleNodeCsv3d()); hm.name = 'battery-module-nodes.csv'; hm.zRange = null; hm.view = '3d'; renderSide(); paint(); } }, t('heatmapSample3d')));
      return;
    }
    const spread = zSpread();
    if (spread && !hm.zRange) { const zs = hm.data.nodes.map((n) => n.z); hm.zRange = [Math.min(...zs), Math.max(...zs)]; }
    if (!spread) hm.zRange = null;
    const nodes = shownNodes();
    const stats = nodeStats(nodes.length ? nodes : nodesAt(hm.data, hm.time), hm.limit);
    replace(side,
      h('strong', null, hm.name ?? ''),
      spread ? h('div', { className: 'row' }, h('span', null, t('heatmapView')), select(hm.view ?? '2d', [['2d', t('heatmapView2d')], ['3d', t('heatmapView3d')]], (v) => { hm.view = v; renderSide(); paint(); }, 'heatmap-view')) : null,
      spread ? h('div', { className: 'row' }, h('span', null, t('heatmapZRange')),
        numberField({ value: hm.zRange[0], step: spread / 10, testid: 'heatmap-z0', onChange: (v) => { hm.zRange = [v, hm.zRange[1]]; renderSide(); paint(); } }),
        numberField({ value: hm.zRange[1], step: spread / 10, testid: 'heatmap-z1', onChange: (v) => { hm.zRange = [hm.zRange[0], v]; renderSide(); paint(); } })) : null,
      hm.data.times.length > 1 ? h('div', { className: 'row' }, h('span', null, t('heatmapTime')), select(hm.time ?? hm.data.times[hm.data.times.length - 1], hm.data.times.map((x) => [x, String(x)]), (v) => { hm.time = Number(v); renderSide(); paint(); })) : null,
      h('div', { className: 'row' }, h('span', null, t('heatmapLimit')), numberField({ value: hm.limit ?? NaN, step: 5, suffix: '°C', onChange: (v) => { hm.limit = Number.isFinite(v) ? v : null; renderSide(); paint(); } })),
      h('div', { className: 'row' }, h('span', null, t('heatmapPower')), numberField({ value: hm.power, step: 0.5, min: 0.5, max: 8, onChange: (v) => { hm.power = v; paint(); } })),
      h('div', { className: 'row' }, h('span', null, t('heatmapResolution')), select(hm.resolution, [[80, '80'], [160, '160'], [240, '240'], [400, '400']], (v) => { hm.resolution = Number(v); paint(); })),
      h('div', { className: 'row' }, h('span', null, t('heatmapShowNodes')), check(hm.showNodes, (v) => { hm.showNodes = v; paint(); })),
      h('table', { className: 'data-table' }, h('tbody', null,
        ...[[t('heatmapNodes'), stats.count], [t('minT'), `${formatValue(stats.min)} °C`], [t('maxT'), `${formatValue(stats.max)} °C`], [t('avgT'), `${formatValue(stats.mean)} °C`], ['σ', `${formatValue(stats.sd)} K`], ['P5 / P50 / P95', `${formatValue(stats.p5)} / ${formatValue(stats.p50)} / ${formatValue(stats.p95)}`],
          ...(hm.limit != null ? [[t('heatmapOver'), stats.over.length]] : [])].map(([a, b]) => h('tr', null, h('td', null, a), h('td', { className: 'num' }, b))))),
      h('strong', null, t('heatmapHottest')),
      h('table', { className: 'data-table' }, h('tbody', null, ...stats.hottest.map((n) => h('tr', null, h('td', null, n.id), h('td', { className: 'num' }, `(${formatValue(n.x)}, ${formatValue(n.y)})`), h('td', { className: 'num' }, `${formatValue(n.T)} °C`))))),
      h('div', { className: 'row' },
        h('button', { type: 'button', onClick: () => app.importNodeData() }, commandIcon('heatmapImport')),
        h('button', { type: 'button', dataset: { testid: 'heatmap-png' }, onClick: () => canvas.toBlob((blob) => app.saveBlob(`${(hm.name ?? 'heatmap').replace(/\.[^.]+$/, '')}-heatmap.png`, blob, 'pngFiles', 'png')) }, 'PNG'),
        h('button', { type: 'button', onClick: () => {
          const r = hm.raster;
          if (!r) return;
          const lines = ['x,y,T_C'];
          for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) lines.push(`${(r.bounds.x0 + ((i + 0.5) / r.nx) * (r.bounds.x1 - r.bounds.x0)).toFixed(3)},${(r.bounds.y0 + ((j + 0.5) / r.ny) * (r.bounds.y1 - r.bounds.y0)).toFixed(3)},${r.raster[i + j * r.nx].toFixed(3)}`);
          app.saveText(`${(hm.name ?? 'heatmap').replace(/\.[^.]+$/, '')}-raster.csv`, `${lines.join('\n')}\n`, 'csvFiles', 'csv');
        } }, 'CSV')));
  };
  renderSide();
  const dialog = popup({ id: 'heatmap', title: t('heatmapTitle'), icon: '🗺', width: 1000, height: 660, body: h('div', { className: 'heatmap-layout' }, canvas, side), actions: [{ label: t('close'), primary: true }] });
  requestAnimationFrame(paint);
  app.refreshHeatmap = () => { renderSide(); paint(); };
  return dialog;
}

export function showThermal(app) {
  thermalDialog(app, popup);
}

export function showParametric(app) {
  parametricDialog(app, popup);
}

export { THEMES };

// Dialogs in the MyCAD style: a fixed-size card with a title bar, a body and
// right-aligned actions, over a dimmed backdrop. Each opener gets the app API
// (state, actions, t) and returns nothing; closing removes the backdrop.
import { h, replace, numberField, themeSwatch, aboutMark } from './dom.js';
import { t, getLanguage } from '../core/i18n.js';
import { commandIcon, commandName, SHORTCUTS, WORKBENCHES } from '../core/commands.js';
import { THEMES, themesByMode, THEME_TOKENS, CUSTOM_THEME_ID, createCustomTheme, sanitizeTheme, resolveTheme } from '../core/themes.js';
import { COLORMAPS, COLORMAP_NAMES, cssColor, formatValue } from '../core/colormap.js';
import { SAMPLE_IDS, SAMPLE_TAGS, sampleModel } from '../core/samples.js';
import { NODES, CATEGORIES, nodeSpec, nodeName, nodeHelp, categoryOf } from '../core/catalog.js';
import { executionOrder } from '../core/model.js';
import { ANIMATION_KINDS, ANIMATION_ICONS } from './background.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { chartSpec, drawSpec, scalarRows } from './views.js';
import { NODE_W, nodeHeight } from './graph.js';
import { popoutsEnabled, openPopout, placePopout, closePopout } from '../platform/popout.js';
import * as native from '../platform/native.js';

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
        h('div', { className: 'about-title' }, h('strong', null, 'MySimulator'), h('span', { className: 'muted' }, `${t('version')} ${info.version}`))),
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

/** A one-line text question (rename). */
export function prompt(app, title, value, onOk) {
  const input = h('input', { type: 'text', value, dataset: { testid: 'prompt-input' }, onKeydown: (event) => { if (event.key === 'Enter') { close(); onOk(input.value); } } });
  const { close } = popup({
    id: 'prompt', title, icon: '✎', width: 420, height: 160, body: input,
    actions: [{ label: t('cancel') }, { label: t('ok'), primary: true, testid: 'prompt-ok', onClick: (c) => { c(); onOk(input.value); } }],
  });
}

/** Asks before a pipeline runs programs on this computer (Python, a command). Resolves true when allowed. */
export function confirmExternal(app, nodes) {
  return new Promise((resolve) => {
    let answered = false;
    const lang = getLanguage();
    const list = h('ul', { className: 'external-list' }, ...nodes.map((n) => h('li', null, `${nodeSpec(n.type)?.icon ?? ''} ${n.name} — `,
      h('code', null, n.type === 'io.python' ? `python (${String(n.params.code ?? '').split('\n').length} ${t('lines')})` : `${n.params.program ?? ''} ${n.params.arguments ?? ''}`))));
    popup({
      id: 'external', title: t('externalTitle'), icon: '⚠', width: 600, height: 340,
      body: [h('p', { className: 'error-headline' }, t('externalText')), list, h('p', { className: 'part-help' }, t('externalNote'))],
      onClose: () => { if (!answered) resolve(false); },
      actions: [
        { label: t('cancel'), testid: 'external-cancel', onClick: (close) => { answered = true; close(); resolve(false); } },
        { label: t('externalAllow'), primary: true, testid: 'external-allow', onClick: (close) => { answered = true; close(); resolve(true); } },
      ],
    });
    void lang;
  });
}

export function showBatchHelp(app) {
  const exe = navigator.platform?.startsWith('Win') ? 'MySimulator.exe' : 'MySimulator';
  const code = `${exe} --batch pipeline.mysim
${exe} --batch a.mysim b.mysim --out results
${exe} --batch filter.mysim --set lp.cutoff=40 --set sig.noise=0.2
${exe} --batch pid.mysim --only kpi1,plot1 --quiet

→ results/a.summary.json        (every node: ok/error, warnings, result values, tables)
→ results/a.<node>.<table>.csv  (every table of every node)
→ results/a.<node>.<grid>.png   (spectrograms, maps)
exit code 0 = all nodes ran, 2 = a node failed, 1 = bad arguments`;
  popup({
    id: 'batch', title: t('batchTitle'), icon: '⌨', width: 700, height: 470,
    body: [h('p', { className: 'part-help' }, app.isTauri ? t('batchText') : `${t('batchText')} ${t('batchWeb')}`), h('pre', { className: 'code-block' }, code)],
    actions: [{ label: t('copyText'), onClick: () => navigator.clipboard?.writeText(code) }, { label: t('close'), primary: true }],
  });
}

// ───────────────────────── settings

/**
 * Settings: every preference, grouped in tabs. Changes show at once (live preview); Apply keeps them and closes,
 * Cancel puts back what was set when the window opened, Reset returns to the defaults (recent files stay).
 */
export function showSettings(app, initialTab = null) {
  const tabs = [['tabGeneral', '⚙'], ['tabTheme', '◐'], ['tabCustomTheme', '🎨'], ['tabFont', '🔤'], ['tabStartPage', '🏠'], ['tabEditor', '⛓'], ['tabPanels', '◧'], ['tabFiles', '🕘']];
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
          row(t('workbenchDefault'), select(s.workbench, WORKBENCHES.map((wb) => [wb.id, `${wb.icon}  ${lang === 'en' ? wb.en : wb.ko}`]), (v) => patch({ workbench: v }))),
          ...toggles([['autoRun', commandName('autoRun', lang), 'settings-autorun'], ['confirmClose', t('confirmClose')]])));
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
    } else if (tab === 'tabEditor') {
      const preview = (name) => h('span', { className: 'colormap-preview', style: { background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((v) => cssColor(name, v)).join(', ')})` } });
      replace(panel, group(t('tabEditor'),
        ...toggles([['showGrid', commandName('showGrid', lang), 'settings-grid'], ['showRulers', commandName('showRulers', lang), 'settings-rulers'], ['chartGrid', commandName('chartGrid', lang), 'settings-chart-grid'], ['grid3d', commandName('grid3d', lang), 'settings-grid3d'], ['axes3d', commandName('axes3d', lang), 'settings-axes3d'], ['snap', commandName('snap', lang), 'settings-snap'], ['showPreviews', commandName('showPreviews', lang), 'settings-previews'], ['showHelp', t('showHelpSetting'), 'settings-help']]),
        row(t('colormap'), select(s.colormap, Object.keys(COLORMAPS).map((k) => [k, COLORMAP_NAMES[k]]), (v) => patch({ colormap: v }), 'settings-colormap'), preview(s.colormap))));
    } else if (tab === 'tabPanels') {
      replace(panel, group(t('tabPanels'),
        ...toggles([['showToolPanel', commandName('toolPanel', lang)], ['showPropertyPanel', commandName('propertyPanel', lang)], ['showChartPanel', commandName('chartPanel', lang)],
          ['leftCollapsed', `${commandName('toolPanel', lang)} — ${t('panelCollapse')}`], ['rightCollapsed', `${commandName('propertyPanel', lang)} — ${t('panelCollapse')}`]]),
        row(t('panelWidth'), numberField({ value: s.panelSize, min: 220, max: 520, step: 10, suffix: 'px', onChange: (v) => patch({ panelSize: Math.round(v) }) })),
        row(t('chartHeight'), numberField({ value: s.chartHeight, min: 120, max: 560, step: 10, suffix: 'px', onChange: (v) => patch({ chartHeight: Math.round(v) }) }))));
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

// ───────────────────────── samples

/** A small picture of a pipeline: its nodes as category-coloured boxes and the links between them. */
export function drawPreview(canvas, model) {
  const ctx = canvas.getContext('2d');
  const w = (canvas.width = 480);
  const hgt = (canvas.height = 240);
  ctx.clearRect(0, 0, w, hgt);
  if (!model.nodes.length) return;
  const sizes = new Map(model.nodes.map((n) => [n.id, nodeHeight(n, false)]));
  const x0 = Math.min(...model.nodes.map((n) => n.x));
  const y0 = Math.min(...model.nodes.map((n) => n.y));
  const x1 = Math.max(...model.nodes.map((n) => n.x + NODE_W));
  const y1 = Math.max(...model.nodes.map((n) => n.y + sizes.get(n.id)));
  const scale = Math.min((w - 24) / (x1 - x0), (hgt - 24) / (y1 - y0), 0.8);
  const ox = (w - (x1 - x0) * scale) / 2 - x0 * scale;
  const oy = (hgt - (y1 - y0) * scale) / 2 - y0 * scale;
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  ctx.lineWidth = 2;
  for (const l of model.links) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) continue;
    const ax = ox + (a.x + NODE_W) * scale; const ay = oy + (a.y + 42) * scale;
    const bx = ox + b.x * scale; const by = oy + (b.y + 42) * scale;
    const dx = Math.max(20, Math.abs(bx - ax) * 0.5);
    ctx.strokeStyle = categoryOf(a.type).color;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.bezierCurveTo(ax + dx, ay, bx - dx, by, bx, by); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const n of model.nodes) {
    const x = ox + n.x * scale; const y = oy + n.y * scale; const ww = NODE_W * scale; const hh = sizes.get(n.id) * scale;
    ctx.fillStyle = 'rgba(30,36,46,0.92)';
    ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = categoryOf(n.type).color;
    ctx.fillRect(x, y, ww, Math.max(5, 30 * scale));
    ctx.fillStyle = '#10141a';
    ctx.font = `600 ${Math.max(9, Math.round(14 * scale))}px "Segoe UI", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(nodeSpec(n.type)?.icon ?? '', x + 5 * scale, y + 15 * scale);
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
      onClick: () => { closeDialog('samples'); app.openApp(model); },
    }, canvas, h('strong', null, model.name), h('div', { className: 'tags' }, ...(SAMPLE_TAGS[id] ?? []).map((tag) => h('span', { className: tag === 'desktop' ? 'tag warn' : 'tag' }, t(`tag_${tag}`))),
      h('span', { className: 'tag' }, `${model.nodes.length} ${t('nodesShort')}`)), h('p', null, model.description)));
  }
  popup({ id: 'samples', title: t('sampleGallery'), icon: '🗂', width: 940, height: 640, body: h('div', { className: 'scroll' }, grid), actions: [{ label: t('close') }] });
}

// ───────────────────────── node library and help

/** Every node, searchable, with its help; a click adds it (where the library was opened from). */
export function showNodeLibrary(app, at = null) {
  const lang = getLanguage();
  let query = '';
  let cat = '';
  let picked = null;
  const list = h('div', { className: 'library-list scroll', dataset: { testid: 'library-list' } });
  const help = h('div', { className: 'library-help scroll', dataset: { testid: 'library-help' } });
  const search = h('input', { type: 'search', placeholder: t('librarySearch'), dataset: { testid: 'library-search' }, onInput: (event) => { query = event.target.value.trim().toLowerCase(); render(); } });
  const cats = h('div', { className: 'library-cats' });
  const add = (type) => { closeDialog('library'); app.addNode(type); };
  const render = () => {
    replace(cats, h('button', { type: 'button', className: cat ? null : 'on', onClick: () => { cat = ''; render(); } }, t('allCategories')),
      ...Object.entries(CATEGORIES).map(([id, c]) => h('button', { type: 'button', className: cat === id ? 'on' : null, dataset: { testid: `library-cat-${id}` }, onClick: () => { cat = id; render(); } }, h('span', { style: { color: c.color } }, c.icon), ` ${lang === 'en' ? c.en : c.ko}`)));
    const hits = NODES.filter((n) => (!cat || n.cat === cat) && (!query || `${n.ko} ${n.en} ${n.type} ${n.help.join(' ')}`.toLowerCase().includes(query)));
    replace(list, ...hits.map((n) => h('button', {
      type: 'button', className: picked === n.type ? 'library-item on' : 'library-item', dataset: { testid: `library-${n.type}` },
      onClick: () => { picked = n.type; render(); }, onDblclick: () => add(n.type),
    }, h('span', { className: 'menu-icon', style: { color: categoryOf(n.type).color } }, n.icon), h('span', { className: 'ellipsis' }, nodeName(n, lang)), n.desktopOnly ? h('span', { className: 'tag warn' }, '🖥') : null)),
    hits.length ? null : h('p', { className: 'panel-hint' }, t('libraryNone')));
    const spec = nodeSpec(picked) ?? hits[0];
    replace(help, spec ? nodeHelpContent(spec, lang, () => add(spec.type)) : null);
  };
  render();
  popup({ id: 'library', title: t('libraryTitle'), icon: '📚', width: 900, height: 600,
    body: h('div', { className: 'library-layout' }, h('div', { className: 'library-top' }, search, cats), h('div', { className: 'library-main' }, list, help)),
    actions: [{ label: t('close') }] });
  void at;
}

function nodeHelpContent(spec, lang, onAdd = null) {
  const c = categoryOf(spec.type);
  return h('div', { className: 'node-help-card' },
    h('h3', null, h('span', { style: { color: c.color } }, spec.icon), ` ${nodeName(spec, lang)}`),
    h('p', { className: 'muted' }, `${lang === 'en' ? c.en : c.ko} · ${spec.type}`),
    h('p', null, nodeHelp(spec, lang)),
    spec.desktopOnly ? h('p', { className: 'warn-text' }, t('desktopOnlyWeb')) : null,
    spec.inputs.length ? h('p', null, h('b', null, `${t('inputs')}: `), spec.inputs.map((p) => (lang === 'en' ? p.en : p.ko)).join(', ')) : h('p', null, h('b', null, `${t('inputs')}: `), t('noInputs')),
    h('table', { className: 'data-table' }, h('thead', null, h('tr', null, h('th', null, t('parameter')), h('th', null, t('defaultValue')))),
      h('tbody', null, ...spec.params.map((p) => h('tr', null, h('td', null, `${lang === 'en' ? p.en : p.ko}${p.unit ? ` (${p.unit})` : ''}`), h('td', null, h('code', null, String(p.def ?? '').split('\n')[0]?.slice(0, 48) ?? '')))))),
    spec.presets?.length ? h('p', null, h('b', null, `${t('preset')}: `), spec.presets.map((x) => (lang === 'en' ? x.en : x.ko)).join(' · ')) : null,
    onAdd ? h('div', { className: 'row' }, h('button', { type: 'button', className: 'primary', dataset: { testid: 'library-add' }, onClick: onAdd }, `✚ ${t('addNode')}`)) : null);
}

export function showNodeHelp(app, type) {
  const spec = nodeSpec(type);
  if (!spec) return;
  popup({ id: 'nodehelp', title: nodeName(spec, getLanguage()), icon: spec.icon, width: 640, height: 520, body: h('div', { className: 'scroll' }, nodeHelpContent(spec, getLanguage())), actions: [{ label: t('close'), primary: true }] });
}

const FUNCTIONS = [
  ['sin cos tan asin acos atan atan2(y, x)', 'trig'], ['sinh cosh tanh', 'hyperbolic'], ['exp ln (= log) log10 log2 sqrt cbrt', 'exp'],
  ['abs sign floor ceil round mod(a, b)', 'round'], ['min(a, b, …) max(…) clamp(x, lo, hi) sat(x[, lim])', 'limit'],
  ['pow(a, b) hypot(a, b) x^y x**y', 'power'], ['step(x) if(c, a, b) && || ! < <= > >= == !=', 'logic'],
  ['sinc(x) erf(x) gauss(x[, μ, σ]) deg(x) rad(x)', 'special'], ['pi e', 'const'],
];

export function showExpressionHelp(app) {
  const lang = getLanguage();
  const dists = 'normal(μ, σ) · uniform(a, b) · triangular(a, mode, b) · lognormal(μ, σ) · exponential(λ) · weibull(k, λ) · gamma(k, θ) · beta(α, β) · bernoulli(p) · poisson(λ) · const(v)';
  popup({
    id: 'exprhelp', title: commandName('expressionHelp', lang), icon: 'ƒ', width: 760, height: 600,
    body: h('div', { className: 'scroll expr-help' },
      h('p', null, t('exprIntro')),
      h('table', { className: 'data-table' }, h('tbody', null, ...FUNCTIONS.map(([fns, key]) => h('tr', null, h('td', null, t(`exprCat_${key}`)), h('td', null, h('code', null, fns)))))),
      h('h3', null, t('exprExamples')),
      h('pre', { className: 'code-block' }, "y = 2*sin(2*pi*f*t) + 0.5*x^2\nx' = v\nv' = -k/m*x - c/m*v + F*step(t - 1)\ngap = housing - partA - partB\nok = if(T > 80, 0, 1)"),
      h('h3', null, t('exprDists')),
      h('p', null, h('code', null, dists)),
      h('p', { className: 'part-help' }, t('exprNotes'))),
    actions: [{ label: t('close'), primary: true }],
  });
}

export async function showPythonInfo(app) {
  const python = app.isTauri ? await native.pythonInfo() : null;
  const code = `# ${t('pyComment1')}
# data   = { "t": [...], "y": [...] }   ${t('pyComment2')}
# out    = { "name": [...] } or a pandas DataFrame
# result("peak", value)                ${t('pyComment3')}
import math
out['t'] = data['t']
out['y2'] = [v * 2 for v in data['y']]
result('max', max(out['y2']))`;
  popup({
    id: 'python', title: commandName('pythonInfo', getLanguage()), icon: '🐍', width: 700, height: 520,
    body: h('div', { className: 'scroll' },
      h('p', { className: 'error-headline', dataset: { testid: 'python-found' } }, app.isTauri ? (python ? `✔ ${t('pythonFound')}: ${python}` : `⚠ ${t('pythonNotFound')}`) : `ℹ ${t('pythonWeb')}`),
      h('p', { className: 'part-help' }, t('pythonText')),
      h('pre', { className: 'code-block' }, code),
      h('p', { className: 'part-help' }, t('pythonCommand'))),
    actions: [{ label: t('close'), primary: true }],
  });
}

export function showPipelineSettings(app) {
  const d = app.doc();
  const m = d.model;
  const name = h('input', { type: 'text', value: m.name, dataset: { testid: 'pipeline-name' } });
  const desc = h('textarea', { rows: 4, value: m.description });
  let seed = m.settings.seed;
  popup({
    id: 'pipeline', title: commandName('pipelineSettings', getLanguage()), icon: '⚙', width: 520, height: 360,
    body: [row(t('name'), name), row(t('description'), desc), row(t('seed'), numberField({ value: seed, min: 0, step: 1, onChange: (v) => { seed = Math.round(v); } })), h('p', { className: 'part-help' }, t('seedHelp'))],
    actions: [
      { label: t('cancel') },
      { label: t('apply'), primary: true, testid: 'pipeline-apply', onClick: (close) => { app.updateModel((model) => ({ ...model, name: name.value, description: desc.value, settings: { ...model.settings, seed } })); close(); } },
    ],
  });
}

export function showValidation(issues) {
  const content = issues.length
    ? h('div', { className: 'issue-list scroll' }, ...issues.map((issue) => h('div', { className: `issue ${issue.level}` }, h('span', { className: 'mark' }, issue.level === 'error' ? '⛔' : issue.level === 'info' ? 'ℹ' : '⚠'), h('span', null, issue.text))))
    : h('p', { className: 'error-headline' }, `✔ ${t('validateOk')}`);
  popup({ id: 'validate', title: t('validateTitle'), icon: '✔', width: 560, height: issues.length ? 360 : 180, body: content, actions: [{ label: t('close'), primary: true }] });
}

// ───────────────────────── report

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A node's chart drawn off screen as a PNG data URL (for the report), or null. */
function chartImage(app, node, out) {
  const spec = chartSpec(out, node.type === 'out.plot' ? node.params : {}, node.type);
  if (spec.kind === 'none' || spec.kind === 'table') return null;
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', left: '-10000px', top: '0', width: '760px', height: '300px' });
  // The report is light: draw with dark text on white.
  const vars = { '--text': '#1c2833', '--muted': '#5d6d7e', '--line': '#c9d3de', '--accent': '#1478b8' };
  document.body.append(canvas);
  try {
    drawSpec(canvas, { ...spec, opts: { ...(spec.opts ?? {}), css: (name) => vars[name] ?? '' } }, app.state.settings);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    canvas.remove();
  }
}

/**
 * The pipeline report as HTML (also used for the dialog and printing). include picks the sections:
 * { title, model, results, log } (all on by default).
 */
export function reportHtml(app, doc, include = {}) {
  const on = { title: true, model: true, results: true, log: true, ...include };
  const lang = getLanguage();
  const model = doc.model;
  const table = (head, rows) => `<table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x, i) => `<td${i ? ' class="num"' : ''}>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const parts = on.title ? [`<h1>${esc(model.name || t('untitled'))}</h1>`, model.description ? `<p>${esc(model.description)}</p>` : ''] : [];
  const order = executionOrder(model) ?? model.nodes.map((n) => n.id);
  const nodes = order.map((id) => model.nodes.find((n) => n.id === id)).filter(Boolean);
  if (on.model) {
    parts.push(`<h2>${t('reportPipeline')}</h2>`);
    parts.push(table(['#', t('name'), t('nodeType'), t('inputs')], nodes.map((n, i) => {
      const spec = nodeSpec(n.type);
      const ins = model.links.filter((l) => l.to === n.id).map((l) => model.nodes.find((x) => x.id === l.from)?.name ?? l.from).join(', ');
      return [String(i + 1), n.name, spec ? nodeName(spec, lang) : n.type, ins || '—'];
    })));
  }
  if (on.results && doc.results) {
    parts.push(`<h2>${t('reportResults')}</h2>`);
    for (const n of nodes) {
      const out = doc.results.get(n.id);
      if (!out) continue;
      parts.push(`<h3>${esc(nodeSpec(n.type)?.icon ?? '')} ${esc(n.name)}</h3>`);
      if (!out.ok) {
        parts.push(`<p class="err">✕ ${esc(out.error)}</p>`);
        continue;
      }
      const rows = scalarRows(out);
      if (rows.length) parts.push(table([t('result'), t('value')], rows));
      if (out.text) parts.push(`<pre>${esc(out.text)}</pre>`);
      if (n.type === 'out.plot' || (!model.nodes.some((x) => x.type === 'out.plot') && (out.tables.length || out.grids.length))) {
        const img = chartImage(app, n, out);
        if (img) parts.push(`<p><img src="${img}" style="max-width:100%"></p>`);
      }
    }
  }
  if (on.log && doc.results) {
    const problems = nodes.flatMap((n) => {
      const out = doc.results.get(n.id);
      if (!out) return [];
      return [...(out.ok ? [] : [[n.name, `✕ ${out.error}`]]), ...out.warnings.map((w) => [n.name, `⚠ ${w}`])];
    });
    parts.push(`<h2>${t('reportLog')}</h2>`, problems.length ? table([t('name'), t('message')], problems) : `<p>✔ ${t('reportNoProblems')}</p>`);
  }
  return parts.join('\n');
}

export function standaloneReport(app, doc) {
  const css = 'body{font:13px "Segoe UI","Malgun Gothic",sans-serif;margin:24px;color:#1c2833}h1{font-size:20px}h2{font-size:15px;color:#1478b8;margin-top:20px}h3{font-size:13px;margin:14px 0 4px}table{border-collapse:collapse;margin:6px 0}th,td{border:1px solid #d5dee8;padding:3px 8px;text-align:left}td.num{text-align:right}th{background:#eef3f8}pre{background:#f4f7fa;padding:6px;white-space:pre-wrap}.err{color:#b03a2e}';
  return `<!doctype html><html lang="${getLanguage()}"><head><meta charset="utf-8"><title>${esc(doc.model.name)}</title><style>${css}</style></head><body>${reportHtml(app, doc)}<p style="color:#888;margin-top:24px">MySimulator · ${new Date().toLocaleString()}</p></body></html>`;
}

export function showReport(app) {
  const doc = app.doc();
  const content = h('div', { className: 'scroll report-html', dataset: { testid: 'report-html' } });
  content.innerHTML = reportHtml(app, doc).replace(/<table>/g, '<table class="data-table">');
  popup({
    id: 'report', title: t('reportTitle'), icon: '📄', width: 860, height: 640, body: content,
    actions: [
      { label: t('saveFile'), testid: 'report-save', onClick: () => app.saveReport() },
      { label: commandName('print', getLanguage()), onClick: () => app.printReport() },
      { label: t('close'), primary: true },
    ],
  });
}

export { THEMES, formatValue };

// Settings, About, Document statistics and Keyboard shortcuts. Settings apply as they change.
import appIcon from '../../assets/icon-256.png';
import { openDialog, confirmDialog } from './dialog.js';
import { escapeHtml, keyLabel } from './dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { DEFAULTS, EDITOR_FONTS, PREVIEW_STYLES, TAB_SIZES, ANIMATION_INTERVALS } from '../domain/settings.js';
import { THEMES, LIGHT_THEMES, DARK_THEMES, themeName, customFrom, resolveTheme, CUSTOM_KEYS } from '../themes.js';
import { addWords, isWord, parseWordList } from '../domain/userdict.js';
import { download } from '../platform/native.js';
import { intervalLabel } from './startpage.js';
import { ANIMATION_KINDS } from './background.js';

const TABS = [
  ['general', 'gear'], ['appearance', 'palette'], ['custom', 'diagramThemes'], ['editor', 'edit'], ['spelling', 'spellCheck'], ['preview', 'viewPreview'], ['files', 'save'], ['start', 'home'],
];

const row = (glyph, label, control, tip = '') => `<div class="row" ${tip ? `title="${escapeHtml(tip)}"` : ''}><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control">${control}</span></div>`;
const toggle = (key, value) => `<label class="switch-wrap"><input type="checkbox" data-setting="${key}" ${value ? 'checked' : ''}/><span class="switch"></span></label>`;
const select = (key, value, options) => `<select data-setting="${key}">${options.map(([v, label]) => `<option value="${escapeHtml(v)}" ${String(v) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
const number = (key, value, min, max, step = 1, unit = '') => `<input type="number" data-setting="${key}" value="${value}" min="${min}" max="${max}" step="${step}" style="max-width:110px"/>${unit ? `<span class="muted">${escapeHtml(unit)}</span>` : ''}`;
const range = (key, value, min, max, step, unit) => `<input type="range" data-setting="${key}" value="${value}" min="${min}" max="${max}" step="${step}"/><output>${value}${unit}</output>`;

function pane(tab, s) {
  const L = getLanguage();
  switch (tab) {
    case 'general': return [
      row('globe', t('settings.language'), select('language', s.language, [['ko', '한국어'], ['en', 'English']])),
      row('fileNew', t('settings.defaultKind'), select('defaultKind', s.defaultKind, [['markdown', t('kind.markdown')], ['html', t('kind.html')], ['text', t('kind.text')]]), t('settings.defaultKindTip')),
      row('statusBar', t('action.statusBar'), toggle('showStatusBar', s.showStatusBar)),
      row('panelLeft', t('action.leftPanel'), toggle('leftOpen', s.leftOpen)),
      row('panelRight', t('action.rightPanel'), toggle('rightOpen', s.rightOpen)),
      row('panelBottom', t('action.bottomPanel'), toggle('bottomOpen', s.bottomOpen)),
      row('pinTop', t('action.alwaysOnTop'), toggle('alwaysOnTop', s.alwaysOnTop)),
      row('eye', t('explorer.hidden'), toggle('showHidden', s.showHidden)),
    ].join('');
    case 'appearance': {
      // Small theme buttons: the system setting and the custom theme, then 20 dark and 20 light.
      const chip = (theme) => `<span class="mini-chip" style="background:${theme.swatch[0]};border-color:${theme.swatch[2]}"><i style="background:${theme.swatch[1]}"></i><i style="background:${theme.swatch[2]}"></i></span>`;
      const tile = (id, lead, name) => `<button type="button" class="mini-theme ${s.theme === id ? 'on' : ''}" data-pick-theme="${id}" role="radio" aria-checked="${s.theme === id}" title="${escapeHtml(name)}">${lead}<span>${escapeHtml(name)}</span></button>`;
      const group = (glyph, title, list) => `<h4>${icon(glyph)}<span>${escapeHtml(title)}</span></h4><div class="mini-themes" role="radiogroup" aria-label="${escapeHtml(title)}">${list.map((theme) => tile(theme.id, chip(theme), theme.name[L])).join('')}</div>`;
      return [
        `<div class="settings-themes">
          <div class="mini-themes top">${tile('system', icon('sun'), themeName('system', L))}${tile('custom', icon('palette'), themeName('custom', L))}</div>
          ${group('moon', t('theme.darkGroup', { count: DARK_THEMES.length }), DARK_THEMES)}
          ${group('sun', t('theme.lightGroup', { count: LIGHT_THEMES.length }), LIGHT_THEMES)}
        </div>`,
        row('font', t('settings.uiFont'), `<input type="text" data-setting="fontFamily" value="${escapeHtml(s.fontFamily)}" placeholder="Segoe UI, Malgun Gothic…"/>`),
        row('fontSizeUp', t('settings.uiFontSize'), number('fontSize', s.fontSize, 11, 18, 1, 'px')),
      ].join('');
    }
    case 'custom': {
      // The custom theme's own tab: its colours, light or dark, a theme to start from, a preview. Changing a colour uses it.
      const custom = s.customTheme ?? customFrom(resolveTheme(s.theme === 'custom' ? 'light' : s.theme));
      const using = s.theme === 'custom';
      const sources = THEMES.map((theme) => [theme.id, `${theme.dark ? '◐' : '○'} ${theme.name[L]}`]);
      return [
        `<div class="custom-head">${icon('palette')}<b>${escapeHtml(themeName('custom', L))}</b>
          <span class="custom-state ${using ? 'on' : ''}">${icon(using ? 'check' : 'info', 'icon tiny')}<span>${escapeHtml(t(using ? 'settings.customInUse' : 'settings.customNotInUse'))}</span></span>
          <span class="grow"></span>
          ${using ? '' : `<button type="button" class="small-button primary-ish" data-custom-use>${icon('check')}<span>${escapeHtml(t('settings.customUse'))}</span></button>`}
        </div>`,
        row('copy', t('settings.customCopyFrom'), `<select data-custom-copy><option value="">${escapeHtml(t('settings.customCopyPick'))}</option>${sources.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('')}</select>`),
        row('moon', t('color.dark'), `<label class="switch-wrap"><input type="checkbox" data-custom="dark" ${custom.dark ? 'checked' : ''}/><span class="switch"></span></label>`),
        `<div class="custom-colors">${CUSTOM_KEYS.map((key) => `<label class="custom-color" title="${escapeHtml(t(`color.${key}`, null, key))}"><input type="color" data-custom="${key}" value="${custom[key]}"/><span>${escapeHtml(t(`color.${key}`, null, key))}</span><code>${escapeHtml(custom[key])}</code></label>`).join('')}</div>`,
        `<div class="custom-preview" style="background:${custom.bg};color:${custom.text};border-color:${custom.border}">
          <div class="cp-bar" style="background:${custom.toolbar};border-color:${custom.border}"><b>${escapeHtml(t('settings.customPreview'))}</b><span class="cp-accent" style="background:${custom.accent};color:${custom.accentText}">${escapeHtml(t('action.save'))}</span></div>
          <div class="cp-body" style="background:${custom.chart}"><span>${escapeHtml(t('settings.customSampleText'))}</span> <span style="color:${custom.muted}">${escapeHtml(t('settings.customSampleMuted'))}</span></div>
          <div class="cp-status" style="background:${custom.status};color:${custom.muted};border-color:${custom.border}">${escapeHtml(t('status.cursor', { line: 1, lines: 12, col: 1 }))}</div>
        </div>`,
      ].join('');
    }
    case 'editor': return [
      row('font', t('settings.editorFont'), `<input type="text" list="editor-fonts" data-setting="editorFont" value="${escapeHtml(s.editorFont)}"/><datalist id="editor-fonts">${EDITOR_FONTS.map((f) => `<option value="${escapeHtml(f)}"></option>`).join('')}</datalist>`),
      row('fontSizeUp', t('settings.editorFontSize'), number('editorFontSize', s.editorFontSize, 9, 32, 1, 'px')),
      row('indentMore', t('settings.tabSize'), select('tabSize', s.tabSize, TAB_SIZES.map((n) => [n, String(n)]))),
      row('whitespace', t('settings.insertSpaces'), toggle('insertSpaces', s.insertSpaces)),
      row('wrap', t('action.wordWrap'), toggle('wordWrap', s.wordWrap)),
      row('lineNumbers', t('action.lineNumbers'), toggle('lineNumbers', s.lineNumbers)),
      row('activeLine', t('action.activeLine'), toggle('highlightActiveLine', s.highlightActiveLine)),
      row('whitespace', t('action.whitespace'), toggle('showWhitespace', s.showWhitespace)),
      row('codeInline', t('settings.autoCloseBrackets'), toggle('autoCloseBrackets', s.autoCloseBrackets)),
      row('image', t('action.inlineImages'), toggle('inlineImages', s.inlineImages)),
    ].join('');
    case 'spelling': return [
      row('spellCheck', t('action.spellCheck'), toggle('spellCheck', s.spellCheck)),
      row('globe', t('submenu.spellLanguages'), select('spellLanguages', s.spellLanguages, [['both', t('spell.both')], ['en', t('spell.en')], ['ko', t('spell.ko')]])),
      row('dictionary', t('action.userDictionary'), `<button type="button" class="button small" data-open-dictionary>${icon('dictionary')}<span>${escapeHtml(t('dictionary.manage'))}</span></button>`),
      `<p class="muted settings-note">${icon('info')}<span>${escapeHtml(t('settings.spellNote'))}</span></p>`,
    ].join('');
    case 'preview': return [
      row('viewSplit', t('settings.viewMode'), select('viewMode', s.viewMode, [['editor', t('action.viewEditor')], ['split', t('action.viewSplit')], ['preview', t('action.viewPreview')]])),
      row('syncScroll', t('action.syncScroll'), toggle('syncScroll', s.syncScroll)),
      row('viewPreview', t('submenu.previewStyle'), select('previewStyle', s.previewStyle, PREVIEW_STYLES.map((id) => [id, t(`previewStyle.${id}`)]))),
      row('warning', t('settings.previewScripts'), toggle('previewScripts', s.previewScripts), t('settings.previewScriptsTip')),
      `<p class="muted settings-note">${icon('info')}<span>${escapeHtml(t('settings.previewScriptsTip'))}</span></p>`,
    ].join('');
    case 'files': return [
      row('save', t('settings.autoSave'), toggle('autoSave', s.autoSave), t('settings.autoSaveTip')),
      row('clock', t('settings.autoSaveSeconds'), number('autoSaveSeconds', s.autoSaveSeconds, 5, 600, 5, t('settings.seconds'))),
      row('recent', t('settings.restoreSession'), toggle('restoreSession', s.restoreSession), t('settings.restoreSessionTip')),
    ].join('');
    case 'start': return [
      row('home', t('settings.showStartPage'), toggle('showStartPage', s.showStartPage)),
      row('recent', t('settings.startShowRecent'), toggle('startShowRecent', s.startShowRecent)),
      row('list', t('settings.startRecentCount'), number('startRecentCount', s.startRecentCount, 3, 20)),
      row('samples', t('settings.startShowSamples'), toggle('startShowSamples', s.startShowSamples)),
      row('sparkles', t('settings.startShowBackground'), toggle('startShowBackground', s.startShowBackground)),
      row('play', t('settings.backgroundMoves'), select('backgroundKind', s.backgroundKind, [['animated', t('settings.bgAnimated')], ['static', t('settings.bgStatic')]])),
      row('sparkles', t('settings.animation'), select('animation', s.animation, ANIMATION_KINDS.map((kind) => [kind, t(`animation.${kind}`)]))),
      row('speed', t('settings.animationSpeed'), range('animationSpeed', s.animationSpeed, 0, 300, 10, '%')),
      row('opacity', t('start.cardOpacity'), range('startCardOpacity', s.startCardOpacity, 20, 100, 5, '%')),
      row('clock', t('start.bgInterval'), select('animationInterval', s.animationInterval, ANIMATION_INTERVALS.map((n) => [n, intervalLabel(n)]))),
      row('dice', t('start.bgRandom'), toggle('animationRandom', s.animationRandom)),
    ].join('');
    default: return '';
  }
}

const NUMERIC = new Set(['fontSize', 'editorFontSize', 'tabSize', 'autoSaveSeconds', 'startRecentCount', 'animationSpeed', 'startCardOpacity', 'animationInterval']);

export async function openSettings(app, first = 'general') {
  let tab = first;
  /** Every tab gets the height of the tallest one (measured off-screen at the pane's width): no tab scrolls and the window does not jump. */
  const fit = (box) => {
    const pane = box.querySelector('.settings-pane');
    const probe = pane.cloneNode(false);
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '-10000px', top: '0', width: `${pane.clientWidth}px`, height: 'auto' });
    box.appendChild(probe);
    let tallest = 0;
    for (const [id] of TABS) { probe.innerHTML = paneFor(id); tallest = Math.max(tallest, probe.scrollHeight); }
    probe.remove();
    pane.style.height = `${Math.ceil(tallest) + 2}px`;
  };
  const paneFor = (id) => pane(id, app.settings());
  const draw = (box) => {
    box.querySelector('.tabs').innerHTML = TABS.map(([id, glyph]) => `<button type="button" class="tab ${id === tab ? 'active' : ''}" data-settings-tab="${id}">${icon(glyph)}<span>${escapeHtml(t(`settings.tab.${id}`))}</span></button>`).join('');
    box.querySelector('.settings-pane').innerHTML = paneFor(tab);
  };
  /** A colour of the custom theme changed (or all of them): the custom theme is used from then on. */
  const setCustom = (box, patch) => {
    const s = app.settings();
    const base = s.customTheme ?? customFrom(resolveTheme(s.theme === 'custom' ? 'light' : s.theme));
    app.updateSettings({ theme: 'custom', customTheme: { ...base, ...patch } }, { quiet: true });
    draw(box);
  };
  await openDialog({
    id: 'settings', title: t('action.settings'), icon: 'gear', width: 880, className: 'settings-dialog',
    body: '<div class="tabs" role="tablist"></div><div class="settings-pane form-rows"></div>',
    buttons: [{ id: 'reset', label: t('settings.reset'), icon: 'refresh', danger: true }, { id: 'close', label: t('action.close'), icon: 'check', primary: true }],
    onMount: (box) => {
      draw(box);
      requestAnimationFrame(() => fit(box));
      box.addEventListener('click', (event) => {
        const button = event.target.closest('[data-settings-tab]');
        if (button) { tab = button.dataset.settingsTab; draw(box); return; }
        const pick = event.target.closest('[data-pick-theme]');
        if (pick) {
          const id = pick.dataset.pickTheme;
          if (id === 'custom') setCustom(box, {}); else { app.updateSettings({ theme: id }, { quiet: true }); draw(box); }
          return;
        }
        if (event.target.closest('[data-custom-use]')) { setCustom(box, {}); return; }
        if (event.target.closest('[data-open-dictionary]')) openUserDictionary(app);
      });
      const apply = (event) => {
        const el = event.target;
        if (el.matches('[data-custom-copy]')) {
          if (event.type === 'change' && el.value) setCustom(box, customFrom(resolveTheme(el.value)));
          return;
        }
        if (el.dataset.custom) {
          const value = el.type === 'checkbox' ? el.checked : el.value;
          // While a colour is dragged the theme follows; the tab is drawn again when the choice is made.
          if (event.type === 'input' && el.type === 'color') {
            const s = app.settings();
            const base = s.customTheme ?? customFrom(resolveTheme(s.theme === 'custom' ? 'light' : s.theme));
            app.updateSettings({ theme: 'custom', customTheme: { ...base, [el.dataset.custom]: value } }, { quiet: true });
            const code = el.parentElement.querySelector('code');
            if (code) code.textContent = value;
            return;
          }
          if (event.type === 'change') setCustom(box, { [el.dataset.custom]: value });
          return;
        }
        const key = el.dataset.setting;
        if (!key) return;
        let value = el.type === 'checkbox' ? el.checked : el.value;
        if (NUMERIC.has(key)) value = Number(value);
        if (el.type === 'range') el.nextElementSibling.textContent = `${value}%`;
        if (event.type === 'input' && el.type !== 'range' && el.type !== 'color') return;
        const patch = { [key]: value };
        if (key === 'theme' && value === 'custom' && !app.settings().customTheme) patch.customTheme = customFrom(resolveTheme(app.settings().theme));
        app.updateSettings(patch, { quiet: true });
        // Another language or the custom theme's colours: the panel is drawn again.
        if (key === 'language' || key === 'theme' || key === 'fontSize' || key === 'fontFamily') {
          box.querySelector('.popup-head h2 span').textContent = t('action.settings');
          draw(box);
          box.querySelector('[data-dialog-button="reset"] span').textContent = t('settings.reset');
          box.querySelector('[data-dialog-button="close"] span').textContent = t('action.close');
          // Other words or another text size: the tabs are measured again.
          requestAnimationFrame(() => fit(box));
        }
      };
      box.addEventListener('change', apply);
      box.addEventListener('input', apply);
    },
    onButton: async (id, box) => {
      if (id !== 'reset') return true;
      const answer = await confirmDialog({ title: t('settings.reset'), message: t('settings.resetConfirm'), yes: t('settings.reset'), danger: true, icon: 'refresh' });
      if (answer === 'yes') {
        const keep = { startLayout: null, explorerRoot: app.settings().explorerRoot };
        app.updateSettings({ ...DEFAULTS, ...keep }, { quiet: true });
        draw(box);
        requestAnimationFrame(() => fit(box));
        app.notify('success', t('settings.resetDone'));
      }
      return false;
    },
  });
}

export async function openAbout(app) {
  const info = await app.appInfo().catch(() => null);
  const L = getLanguage();
  const built = typeof __BUILD_DATE__ === 'string' ? new Date(__BUILD_DATE__) : null;
  const rows = [
    ['tag', t('about.version'), `v${app.version()}`],
    ['calendar', t('about.built'), built ? built.toLocaleString(L === 'ko' ? 'ko-KR' : 'en-US') : '—'],
    ['hyperlink', t('about.commit'), info?.commit ?? (typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '—')],
    ['server', t('about.platform'), info ? `${info.os} · ${info.arch}` : `${t('status.web')} · ${navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] ?? ''}`],
    ['layers', t('about.runtime'), info ? `Tauri ${info.tauri} · ${info.profile}` : 'Web'],
    ['user', t('about.author'), 'SHKWON (knix008@naver.com)'],
  ];
  await openDialog({
    id: 'about', title: t('action.about'), icon: 'info', width: 600,
    body: `<div class="about"><div class="about-top"><img class="about-icon" src="${appIcon}" alt=""/><div class="about-text">
        <div class="about-name">MyTextMaster <span class="about-version">v${escapeHtml(app.version())}</span></div>
        <p class="about-tagline">${escapeHtml(t('start.tagline'))}</p>
        <p class="about-description">${escapeHtml(t('about.description'))}</p></div></div>
      <div class="about-section">${icon('info')}<span>${escapeHtml(t('about.build'))}</span></div>
      <dl class="about-table">${rows.map(([glyph, label, value]) => `<dt>${icon(glyph)}<span>${escapeHtml(label)}</span></dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('')}</dl>
      <div class="about-section">${icon('star')}<span>${escapeHtml(t('about.libraries'))}</span></div>
      <p class="about-description muted">CodeMirror 6 · marked · DOMPurify · Tauri 2 · Vite</p></div>`,
    buttons: [{ id: 'ok', label: t('action.ok'), icon: 'check', primary: true }],
  });
}

export async function openStats(app) {
  const doc = app.activeDoc();
  if (!doc) return;
  const s = app.stats(doc);
  const editor = app.editor();
  const selected = editor.selection().text;
  const rows = [
    ['wordCount', t('stats.words'), s.words],
    ['textTool', t('stats.chars'), s.chars],
    ['trimSpace', t('stats.noSpaces'), s.noSpaces],
    ['lineNumbers', t('stats.lines'), s.lines],
    ['notes', t('stats.paragraphs'), s.paragraphs],
    ['clock', t('stats.reading'), t('stats.minutes', { n: s.minutes })],
    ['encoding', t('stats.encoding'), `${app.encodingLabel(doc.encoding)} · ${doc.eol.toUpperCase()}`],
    ['file', t('stats.kind'), t(`kind.${doc.kind}`)],
  ];
  await openDialog({
    id: 'stats', title: t('action.stats'), icon: 'docStats', width: 460,
    body: `<p class="stats-name">${icon('file')}<b>${escapeHtml(doc.name)}</b></p><dl class="about-table stats-table">${rows.map(([glyph, label, value]) => `<dt>${icon(glyph)}<span>${escapeHtml(label)}</span></dt><dd>${escapeHtml(typeof value === 'number' ? value.toLocaleString() : value)}</dd>`).join('')}</dl>${selected ? `<p class="muted">${escapeHtml(t('stats.selection', { n: selected.length.toLocaleString() }))}</p>` : ''}`,
    buttons: [{ id: 'ok', label: t('action.ok'), icon: 'check', primary: true }],
  });
}

export async function openShortcuts(app) {
  const groups = [
    ['file', ['new', 'open', 'openFolder', 'save', 'saveAs', 'saveAll', 'exportHtml', 'print', 'closeTab']],
    ['edit', ['undo', 'redo', 'find', 'replace', 'findInFiles', 'gotoLine', 'duplicateLine', 'toggleComment', 'indentMore', 'indentLess', 'joinLines', 'dateTime', 'bookmarkToggle', 'bookmarkNext', 'bookmarkPrev']],
    ['format', ['bold', 'italic', 'strike', 'inlineCode', 'heading1', 'heading2', 'heading3', 'paragraph', 'bulletList', 'orderedList', 'taskList', 'quote', 'link', 'image', 'codeBlock', 'formatHtml']],
    ['view', ['cycleView', 'viewWysiwyg', 'leftPanel', 'rightPanel', 'bottomPanel', 'explorer', 'outline', 'problems', 'wordWrap', 'foldAll', 'unfoldAll', 'zoomIn', 'zoomOut', 'zoomReset', 'focusMode', 'spellCheck', 'settings', 'userGuide']],
    ['macro', ['macroRecord', 'macroStop', 'macroPlay']],
  ];
  const extra = [['Ctrl+Tab', t('shortcut.nextTab')], ['Ctrl+Shift+Tab', t('shortcut.prevTab')], ['Alt+↑ / Alt+↓', t('shortcut.moveLine')], ['Ctrl+D', t('shortcut.selectNext')], ['Alt+' + t('shortcut.click'), t('shortcut.multiCursor')], ['Alt', t('shortcut.menu')]];
  await openDialog({
    id: 'shortcuts', title: t('action.shortcuts'), icon: 'keyboard', width: 760, height: 620, className: 'shortcuts-dialog',
    body: `<div class="shortcut-columns">${groups.map(([menu, ids]) => `<section><h3>${icon({ file: 'file', edit: 'edit', format: 'bold', view: 'eye', macro: 'macroRecord' }[menu])}<span>${escapeHtml(t(`menu.${menu}`))}</span></h3>${ids.filter((id) => app.commands[id]?.key).map((id) => `<div class="shortcut-row">${icon(app.commands[id].icon)}<span>${escapeHtml(t(app.commands[id].label))}</span><kbd>${escapeHtml(keyLabel(app.commands[id].key))}</kbd></div>`).join('')}</section>`).join('')}
      <section><h3>${icon('keyboard')}<span>${escapeHtml(t('shortcut.editor'))}</span></h3>${extra.map(([key, label]) => `<div class="shortcut-row">${icon('dot')}<span>${escapeHtml(label)}</span><kbd>${escapeHtml(keyLabel(key))}</kbd></div>`).join('')}</section></div>`,
    buttons: [{ id: 'ok', label: t('action.ok'), icon: 'check', primary: true }],
  });
}

/** The user's dictionary: words the spell checker accepts. Add, remove, import and export (one word per line). */
export async function openUserDictionary(app) {
  let filter = '';
  const draw = (box) => {
    const words = app.userWords().filter((w) => !filter || w.toLowerCase().includes(filter.toLowerCase()));
    box.querySelector('.dict-count').textContent = t('dictionary.count', { n: app.userWords().length });
    box.querySelector('.dict-list').innerHTML = words.length
      ? words.map((w) => `<div class="dict-row"><span>${escapeHtml(w)}</span><button type="button" class="icon-button" data-dict-remove="${escapeHtml(w)}" title="${escapeHtml(t('dictionary.remove'))}">${icon('close')}</button></div>`).join('')
      : `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('dictionary.empty'))}</span></p>`;
  };
  const add = (box) => {
    const input = box.querySelector('[data-dict-word]');
    const words = input.value.split(/[\s,]+/).filter(Boolean);
    const bad = words.filter((w) => !isWord(w));
    if (bad.length) { app.notify('error', t('dictionary.invalid', { word: bad.join(', ') })); return; }
    if (!words.length) return;
    app.setUserDictionary(addWords(app.userWords(), words));
    input.value = '';
    draw(box);
  };
  await openDialog({
    id: 'dictionary', title: t('action.userDictionary'), icon: 'dictionary', width: 560, height: 560, className: 'dictionary-dialog',
    body: `<p class="muted">${escapeHtml(t('dictionary.about'))}</p>
      <div class="dict-add"><div class="search-box">${icon('dictionaryAdd')}<input data-dict-word placeholder="${escapeHtml(t('dictionary.placeholder'))}" autofocus/></div><button type="button" class="button primary" data-dict-add>${icon('plus')}<span>${escapeHtml(t('dictionary.add'))}</span></button></div>
      <div class="dict-tools"><div class="search-box">${icon('filter')}<input data-dict-filter placeholder="${escapeHtml(t('dictionary.filter'))}"/></div><span class="dict-count muted"></span></div>
      <div class="dict-list"></div>`,
    buttons: [
      { id: 'import', label: t('dictionary.import'), icon: 'importFile' },
      { id: 'export', label: t('dictionary.export'), icon: 'exportFile' },
      { id: 'clear', label: t('dictionary.clear'), icon: 'trash', danger: true },
      { id: 'close', label: t('action.close'), icon: 'check', primary: true },
    ],
    onMount: (box) => {
      draw(box);
      box.addEventListener('click', (event) => {
        if (event.target.closest('[data-dict-add]')) add(box);
        const remove = event.target.closest('[data-dict-remove]');
        if (remove) { app.setUserDictionary(app.userWords().filter((w) => w !== remove.dataset.dictRemove)); draw(box); }
      });
      box.querySelector('[data-dict-word]').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); add(box); } });
      box.querySelector('[data-dict-filter]').addEventListener('input', (event) => { filter = event.target.value; draw(box); });
    },
    onButton: async (id, box) => {
      if (id === 'close') return true;
      if (id === 'export') { download('MyTextMaster-dictionary.txt', `${app.userWords().join('\n')}\n`); return false; }
      if (id === 'clear') {
        if ((await confirmDialog({ title: t('dictionary.clear'), message: t('dictionary.clearConfirm'), yes: t('dictionary.clear'), danger: true, icon: 'trash' })) === 'yes') { app.setUserDictionary([]); draw(box); }
        return false;
      }
      if (id === 'import') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.dic,text/plain';
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          const words = parseWordList(await file.text()).map((line) => line.split('/')[0]).filter(isWord);
          app.setUserDictionary(addWords(app.userWords(), words));
          app.notify('success', t('dictionary.imported', { n: words.length }));
          draw(box);
        });
        input.click();
        return false;
      }
      return true;
    },
  });
}

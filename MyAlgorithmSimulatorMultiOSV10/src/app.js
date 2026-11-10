import { ALGORITHMS, CATEGORIES, algorithmById } from './algorithms/index.js';
import { gridCellAt, drawFrame, INK_COLORS, LEGEND } from './viz/draw.js';
import { gridToText } from './algorithms/pathfinding.js';
import { animationIcon, icon } from './icons.js';
import { languageFlag, switchFlag } from './flags.js';
import { t, setLanguage } from './i18n.js';
import { DARK_THEMES, LIGHT_THEMES, SYSTEM, applyTheme, resolveTheme, themeName } from './themes.js';
import { createEditor } from './ui/editor.js';
import { CODE_LANGUAGES, extension, sample } from './samples/index.js';
import { isDesktop, installToolchain, openPrintWindow, quit, readTextFile, runCode, saveProjectFile, toolchainStatus, writeTextFile } from './platform/native.js';
import { runJavaScript } from './runner/web.js';
import { ANIMATION_KINDS, AnimatedBackground } from './ui/background.js';
import { startBoard } from './ui/startboard.js';

const STORE = 'myalgorithmsimulator.settings';
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const CATEGORY_ICON = { sorting: 'sort', searching: 'search', graph: 'graph', path: 'grid', dp: 'table', string: 'text', tree: 'tree', backtracking: 'crown', greedy: 'star', math: 'sigma' };

const state = {
  page: 'start', lang: 'ko', themeId: 'light', algorithmId: 'bubble-sort', inputText: '',
  frames: [], frame: 0, playing: false, speed: 1, error: '', status: '', query: '',
  collapsed: {}, rightTab: 'explain', codeLang: 'python', code: {}, output: null, running: false,
  showLeft: true, showRight: true, showPseudo: true, bottomTab: 'code', recent: [], menu: null, modal: null, maximized: false,
  animation: 'aurora', animationSpeed: 100, animationOpacity: 100, startLayout: null, projectPath: '',
};

let editor = null;
let timer = null;
let backdrop = null;
let board = null;
const CARD_GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></g></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function save() {
  localStorage.setItem(STORE, JSON.stringify({
    lang: state.lang, themeId: state.themeId, speed: state.speed, codeLang: state.codeLang,
    algorithmId: state.algorithmId, recent: state.recent, showLeft: state.showLeft,
    showRight: state.showRight, showPseudo: state.showPseudo,
    animation: state.animation, animationSpeed: state.animationSpeed, animationOpacity: state.animationOpacity, startLayout: state.startLayout,
  }));
}

function themeOf() {
  const style = getComputedStyle(document.documentElement);
  return {
    text: style.getPropertyValue('--text').trim(), muted: style.getPropertyValue('--muted').trim(),
    border: style.getPropertyValue('--border').trim(), surface: style.getPropertyValue('--surface').trim(),
    accent: style.getPropertyValue('--accent').trim(), dark: document.documentElement.dataset.mode === 'dark',
  };
}

const tx = (value) => (value && typeof value === 'object' ? (value[state.lang] ?? value.ko) : (value ?? ''));
const algo = () => algorithmById(state.algorithmId);
const codeKey = () => `${state.algorithmId}:${state.codeLang}`;

function currentCode() {
  if (state.code[codeKey()] !== undefined) return state.code[codeKey()];
  return sample(state.algorithmId, state.codeLang) ?? placeholder();
}

function placeholder() {
  const name = tx(algo().name);
  return state.lang === 'en'
    ? `// ${name} — sample coming soon.\n// Write your own version here: read the input box from stdin and print the result.\n`
    : `// ${name} — 샘플을 준비 중입니다.\n// 여기에 직접 작성해 보세요. 입력 상자의 내용을 표준 입력으로 읽고 결과를 출력하면 됩니다.\n`;
}

// ───────────────────────── playback & drawing

function stopPlayback() { state.playing = false; if (timer) { clearTimeout(timer); timer = null; } }

function play() {
  if (state.page === 'start') openAlgorithm(state.recent[0] || state.algorithmId);
  if (!state.frames.length) applyInput();
  if (state.frame >= state.frames.length - 1) state.frame = 0;
  state.playing = true;
  updateTransport();
  tick();
}

function tick() {
  if (!state.playing) return;
  if (state.frame >= state.frames.length - 1) { stopPlayback(); updateTransport(); state.status = t('status.done'); updateHud(); return; }
  state.frame += 1;
  refreshFrame();
  timer = setTimeout(tick, 700 / state.speed);
}

/** Redraws the stage and the step-dependent readouts without rebuilding the page. */
function refreshFrame() {
  paint();
  updateHud();
  updatePseudo();
  if (state.rightTab === 'vars') updateVars();
}

function paint() {
  const canvas = document.getElementById('stage-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFrame(ctx, rect.width, rect.height, state.frames[state.frame]?.view ?? null, themeOf(), state.lang);
  const caption = document.getElementById('stage-caption');
  if (caption) {
    const message = state.frames[state.frame]?.msg;
    caption.textContent = message ? tx(message) : t('stage.ready');
  }
}

function updateHud() {
  const step = document.getElementById('step-label');
  if (step) step.textContent = state.frames.length ? t('stage.step', { n: state.frame + 1, total: state.frames.length }) : '–';
  const scrub = document.getElementById('scrubber');
  if (scrub) { scrub.max = Math.max(0, state.frames.length - 1); scrub.value = state.frame; }
  const status = document.getElementById('status-text');
  if (status) status.textContent = state.error || state.status;
  updateTransport();
}

function updateTransport() {
  const playButton = document.getElementById('play-button');
  if (!playButton) return;
  const label = state.playing ? t('cmd.pause') : t('cmd.auto');
  playButton.innerHTML = `${icon(state.playing ? 'pause' : 'play')}<span>${esc(label)}</span>`;
  playButton.title = label;
  playButton.classList.toggle('active', state.playing);
}

function updatePseudo() {
  const line = state.frames[state.frame]?.line;
  document.querySelectorAll('.pseudo-line').forEach((el, index) => {
    const on = index === line;
    el.classList.toggle('current', on);
    if (on && !el.closest('[hidden]')) el.scrollIntoView({ block: 'nearest' });
  });
  const banner = document.getElementById('trace-banner');
  if (banner) {
    const text = Number.isInteger(line) ? algo().pseudo[line] : '';
    banner.textContent = text ? text.trim() : t('trace.ready');
  }
  editor?.follow(line);
}

function updateVars() {
  const host = document.getElementById('vars-host');
  if (!host) return;
  const vars = state.frames[state.frame]?.vars ?? {};
  const rows = Object.entries(vars);
  host.innerHTML = rows.length
    ? `<table class="vars">${rows.map(([key, value]) => `<tr><td>${esc(key)}</td><td>${esc(value)}</td></tr>`).join('')}</table>`
    : `<p class="muted">${esc(t('vars.empty'))}</p>`;
}

// ───────────────────────── input & algorithms

function applyInput() {
  const area = document.getElementById('algo-input');
  if (area) state.inputText = area.value;
  try {
    const input = algo().input.parse(state.inputText);
    state.frames = algo().run(input);
    state.frame = 0;
    state.error = '';
    state.status = t('status.applied');
  } catch (error) {
    state.frames = [];
    state.frame = 0;
    state.error = error.text ? tx(error.text) : String(error);
    state.status = '';
  }
  const error = document.getElementById('input-error');
  if (error) error.textContent = state.error;
  refreshFrame();
}

function openAlgorithm(id) {
  stopPlayback();
  state.algorithmId = id;
  state.page = 'work';
  state.inputText = algorithmById(id).input.default;
  state.output = null;
  state.recent = [id, ...state.recent.filter((item) => item !== id)].slice(0, 8);
  save();
  render();
  applyInput();
}

function randomInput() {
  state.inputText = algo().input.random();
  const area = document.getElementById('algo-input');
  if (area) area.value = state.inputText;
  applyInput();
}

/** Clicking the A* grid toggles a wall and reruns. */
function onStageClick(event) {
  if (state.algorithmId !== 'astar' || !state.frames.length) return;
  const canvas = document.getElementById('stage-canvas');
  const rect = canvas.getBoundingClientRect();
  const view = state.frames[state.frame].view;
  const cell = gridCellAt(view, rect.width, rect.height, event.clientX - rect.left, event.clientY - rect.top);
  if (cell < 0 || cell === view.start || cell === view.goal) return;
  const grid = algo().input.parse(state.inputText);
  const walls = new Set(grid.walls);
  if (walls.has(cell)) walls.delete(cell); else walls.add(cell);
  state.inputText = gridToText({ ...grid, walls: [...walls] });
  const area = document.getElementById('algo-input');
  if (area) area.value = state.inputText;
  applyInput();
}

// ───────────────────────── code running

async function executeCode() {
  if (state.running) return;
  const source = editor ? editor.get() : currentCode();
  state.code[codeKey()] = source;
  state.running = true;
  state.page = 'work';
  state.rightTab = 'output';
  state.output = null;
  render();
  let result;
  try {
    if (state.codeLang === 'javascript') result = await runJavaScript(source, state.inputText);
    else if (!isDesktop()) result = { ok: false, stdout: '', stderr: t('code.desktopOnly') };
    else result = await runCode(state.codeLang, source, state.inputText);
  } catch (error) {
    result = { ok: false, stdout: '', stderr: String(error) };
  }
  state.running = false;
  state.output = result;
  render();
}

function loadSample() {
  const source = sample(state.algorithmId, state.codeLang);
  state.code[codeKey()] = source ?? placeholder();
  render();
}

// ───────────────────────── rendering

function rich(text) {
  const blocks = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n\n+/);
  return blocks.map((block) => (block.startsWith('- ')
    ? `<ul>${block.split('\n').map((line) => `<li>${line.replace(/^- /, '')}</li>`).join('')}</ul>`
    : `<p>${block.replace(/\n/g, '<br>')}</p>`)).join('');
}

function algorithmList() {
  const query = state.query.trim().toLowerCase();
  return CATEGORIES.map((category) => {
    const items = ALGORITHMS.filter((item) => item.category === category.id && (!query || tx(item.name).toLowerCase().includes(query) || item.id.includes(query)));
    if (!items.length) return '';
    const collapsed = state.collapsed[category.id] && !query;
    const rows = items.map((item) => `<button class="algo-item${item.id === state.algorithmId ? ' active' : ''}" data-act="open-algo" data-arg="${item.id}">${icon(item.id)}<span>${esc(tx(item.name))}</span></button>`).join('');
    return `<section class="algo-cat${collapsed ? ' collapsed' : ''}"><button class="cat-toggle" data-act="toggle-cat" data-arg="${category.id}">${icon(CATEGORY_ICON[category.id] ?? 'dot')}<span>${esc(tx(category.name))}</span><span class="cat-side"><span class="algo-count">${items.length}</span>${icon('chevronDown', 'icon tiny chev')}</span></button>${collapsed ? '' : rows}</section>`;
  }).join('');
}

const TAB_ICON = { explain: 'info', code: 'code', vars: 'list', output: 'terminal' };

function rightPanel() {
  if (!state.showRight) {
    return `<div class="panel-rail"><button class="rail-button expand" data-act="menu-right" title="${esc(t('panel.detail'))}">${icon('panelRightOpen')}<span class="rail-label">${esc(t('panel.expand'))}</span></button><div class="rail-title">${icon('info')}<span>${esc(t('panel.detailShort'))}</span></div></div>`;
  }
  const current = algo();
  const side = state.rightTab === 'vars' || state.rightTab === 'output' ? state.rightTab : 'explain';
  const tabs = ['explain', 'vars', 'output'].map((id) => `<button class="editor-tab${side === id ? ' active' : ''}" data-act="tab" data-arg="${id}">${icon(TAB_ICON[id])}<span>${esc(t(`tab.${id}`))}</span></button>`).join('');
  let body = '';
  if (side === 'explain') {
    const legend = (LEGEND[current.view] ?? []).map(([name, label]) => `<span><i style="background:${INK_COLORS[name]}"></i>${esc(tx(label))}</span>`).join('');
    const complexity = Object.entries(current.complexity).map(([key, value]) => `<b>${esc(key)}</b><span>${esc(value)}</span>`).join('');
    body = `<div class="explain"><h3 class="algo-title">${icon(current.id)}<span>${esc(tx(current.name))}</span></h3><p class="muted">${esc(tx(current.summary))}</p>${rich(tx(current.description))}<h3>${esc(t('complexity.title'))}</h3><div class="complexity">${complexity}</div><p class="muted">${esc(tx(current.traits))}</p>${legend ? `<h3>${esc(t('legend.title'))}</h3><div class="legend">${legend}</div>` : ''}</div>`;
  } else if (side === 'vars') {
    body = `<div id="vars-host"></div>`;
  } else {
    const result = state.output;
    const text = state.running ? t('code.running') : result ? `${result.stdout ?? ''}${result.stderr ? `\n${result.stderr}` : ''}` : t('output.empty');
    body = `<pre class="output${result && !result.ok ? ' err' : ''}">${esc(text)}</pre>`;
  }
  return `<div class="panel-header">${icon('info')}<span>${esc(t('panel.detail'))}</span><button class="icon-button" data-act="menu-right" title="${esc(t('cmd.right'))}">${icon('panelRightClose')}</button></div><div class="editor-tabs">${tabs}</div><div class="panel-body">${body}</div>`;
}

function programBar() {
  const options = CODE_LANGUAGES.map((item) => `<option value="${item.id}"${item.id === state.codeLang ? ' selected' : ''}>${item.name}</option>`).join('');
  const codeOn = state.bottomTab === 'code';
  return `<div class="problems-header">
      <button class="editor-tab${codeOn ? ' active' : ''}" data-act="bottom" data-arg="code">${icon('code')}<span>${esc(t('panel.editor'))}</span></button>
      <button class="editor-tab${codeOn ? '' : ' active'}" data-act="bottom" data-arg="pseudo">${icon('list')}<span>${esc(t('pseudo.title'))}</span></button>
      <span class="grow"></span>
      <select class="tool-select" id="code-lang" title="${esc(t('code.language'))}">${options}</select>
      <button class="button" data-act="sample">${icon('book')}<span>${esc(t('code.sample'))}</span></button>
      <button class="button primary" data-act="run">${icon('run')}<span>${esc(t('code.run'))}</span></button>
      <button class="icon-button" data-act="menu-pseudo" title="${esc(t('cmd.pseudo'))}">${icon('close')}</button>
    </div>`;
}

function leftPanel() {
  if (!state.showLeft) {
    return `<div class="panel-rail"><button class="rail-button expand" data-act="menu-left" title="${esc(t('cmd.left'))}">${icon('panelLeftOpen')}<span class="rail-label">${esc(t('panel.expand'))}</span></button><div class="rail-title">${icon('layers')}<span>${esc(t('panel.algorithmsShort'))}</span></div></div>`;
  }
  const current = algo();
  return `<div class="panel-header">${icon('layers')}<span>${esc(t('panel.algorithms'))}</span><button class="icon-button" data-act="menu-left" title="${esc(t('cmd.left'))}">${icon('panelLeftClose')}</button></div>
    <div class="search-box">${icon('search')}<input id="algo-search" placeholder="${esc(t('search.placeholder'))}" value="${esc(state.query)}"></div>
    <div class="panel-body" id="algo-list">${algorithmList()}</div>
    <div class="input-box">
      <div class="input-label">${icon('terminal')}<span>${esc(t('input.label'))}</span></div>
      <textarea id="algo-input" spellcheck="false">${esc(state.inputText)}</textarea>
      <div class="input-hint">${esc(tx(current.input.hint))}</div>
      <div id="input-error" class="input-error">${esc(state.error)}</div>
      <div class="row-buttons"><button class="button" data-act="random">${icon('random')}<span>${esc(t('input.random'))}</span></button><button class="button primary" data-act="apply" title="${esc(t('cmd.apply'))}">${icon('check')}<span>${esc(t('input.apply'))}</span></button></div>
    </div>`;
}

const MENUS = {
  file: [['new', 'fileNew', 'cmd.new'], ['open', 'folderOpen', 'cmd.open'], ['save', 'save', 'cmd.save'], 'sep', ['exit', 'exit', 'cmd.exit']],
  view: [['left', 'panelLeft', 'cmd.left'], ['right', 'panelRight', 'cmd.right'], ['pseudo', 'list', 'cmd.pseudo'], 'sep', ['theme', 'palette', 'cmd.theme'], ['ui-lang', 'globe', '']],
  run: [['play', 'play', 'cmd.play', 'Space'], ['stepBack', 'stepBack', 'cmd.stepBack', '←'], ['stepForward', 'stepForward', 'cmd.stepForward', '→'], ['stop', 'restart', 'cmd.stop', 'Home'], 'sep', ['random', 'random', 'cmd.random', 'R'], ['run', 'run', 'cmd.runCode'], 'sep', ['toolchains', 'download', 'cmd.toolchains']],
  help: [['guide', 'book', 'cmd.guide'], ['settings', 'gear', 'cmd.settings'], ['about', 'info', 'cmd.about']],
};
const MENU_ICON = { file: 'file', view: 'eye', run: 'play', help: 'question' };

function themeChoice(theme) {
  const on = theme.id === state.themeId;
  const dots = (theme.swatch ?? []).map((color) => `<i style="background:${color}"></i>`).join('');
  return `<button class="picker-item${on ? ' active' : ''}" data-act="set-theme" data-arg="${theme.id}" title="${esc(themeName(theme.id, state.lang))}"><span class="swatch-dots">${dots}</span><span>${esc(themeName(theme.id, state.lang))}</span>${on ? icon('check') : ''}</button>`;
}

function themeMenuHtml() {
  const systemOn = state.themeId === SYSTEM;
  const column = (title, list) => `<div class="picker-column"><h3>${esc(title)}</h3>${list.map(themeChoice).join('')}</div>`;
  return `<div class="menu theme-menu" style="left:${state.menu.x}px;top:${state.menu.y}px" role="menu">
    <button class="picker-item${systemOn ? ' active' : ''}" data-act="set-theme" data-arg="${SYSTEM}">${icon('globe')}<span>${esc(themeName(SYSTEM, state.lang))}</span>${systemOn ? icon('check') : ''}</button>
    <div class="picker-columns">${column(t('theme.light'), LIGHT_THEMES)}${column(t('theme.dark'), DARK_THEMES)}</div>
  </div>`;
}

function menuHtml() {
  if (!state.menu) return '';
  if (state.menu.id === 'theme') return themeMenuHtml();
  const checked = { left: state.showLeft, right: state.showRight, pseudo: state.showPseudo };
  const buttons = MENUS[state.menu.id].map((item) => {
    if (item === 'sep') return '<div class="menu-sep"></div>';
    const [id, glyph, key, shortcut] = item;
    const label = id === 'ui-lang' ? (state.lang === 'ko' ? 'English' : '한국어') : t(key);
    const mark = id === 'ui-lang' ? switchFlag(state.lang) : icon(glyph);
    return `<button class="menu-item" data-act="menu-${id}"><span class="menu-icon">${mark}</span><span>${esc(label)}</span><span class="menu-key">${esc(shortcut ?? '')}</span><span class="menu-check">${checked[id] ? icon('check') : ''}</span></button>`;
  }).join('');
  return `<div class="menu" style="left:${state.menu.x}px;top:${state.menu.y}px">${buttons}</div>`;
}

function popup(title, glyph, body) {
  return `<div class="modal-back"><div class="popup" role="dialog"><div class="popup-head">${icon(glyph)}<span>${esc(title)}</span><button class="icon-button" data-act="close-modal">${icon('close')}</button></div><div class="popup-body">${body}</div><div class="popup-foot"><button class="button primary" data-act="close-modal">OK</button></div></div></div>`;
}

function animationChips() {
  return `<div class="anim-chips" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip${state.animation === kind ? ' on' : ''}" data-act="pick-animation" data-arg="${kind}" role="radio" aria-checked="${state.animation === kind}" title="${esc(t(`anim.${kind}`))}">${icon(animationIcon(kind))}<span>${esc(t(`anim.${kind}`))}</span></button>`).join('')}</div>`;
}

function animControls() {
  const stepper = (which, glyph, label, value) => `<div class="anim-stepper">
      <span class="step-label">${icon(glyph)}<span>${esc(label)}</span></span>
      <button type="button" class="step-btn" data-act="nudge-anim" data-arg="${which}" data-delta="-10" title="${esc(t('nudge.down'))}" aria-label="${esc(t('nudge.down'))}">${icon('minus')}</button>
      <output data-readout="${which}">${value}%</output>
      <button type="button" class="step-btn" data-act="nudge-anim" data-arg="${which}" data-delta="10" title="${esc(t('nudge.up'))}" aria-label="${esc(t('nudge.up'))}">${icon('plus')}</button>
    </div>`;
  return `<div class="anim-controls">${stepper('speed', 'speed', t('settings.animationSpeed'), state.animationSpeed)}${stepper('opacity', 'opacity', t('settings.opacity'), state.animationOpacity)}</div>`;
}

function modalHtml() {
  if (!state.modal) return '';
  if (state.modal.type === 'about') {
    const rows = [
      ['info', t('about.version'), __APP_VERSION__],
      ['speed', t('about.buildDate'), __BUILD_DATE__.slice(0, 16).replace('T', ' ')],
      ['hash', t('about.commit'), __BUILD_COMMIT__],
      ['globe', t('about.runtime'), isDesktop() ? t('status.desktop') : t('status.web')],
      ['star', t('about.author'), 'SHKWON (knix008@naver.com)'],
    ];
    const table = rows.map(([glyph, label, value]) => `<dt>${icon(glyph)}<span>${esc(label)}</span></dt><dd>${esc(value)}</dd>`).join('');
    return popup(t('cmd.about'), 'info', `<div class="about"><div class="about-top"><img class="about-icon" src="icon.svg" alt=""><div><div class="about-name">MyAlgorithmSimulator <span class="about-version">v${esc(__APP_VERSION__)}</span></div><div class="about-tagline">${esc(t('about.tagline'))}</div><p>${esc(t('about.text'))}</p></div></div><h3>${icon('gear')}<span>${esc(t('about.buildInfo'))}</span></h3><dl class="about-table">${table}</dl></div>`);
  }
  if (state.modal.type === 'settings') {
    const langs = [['ko', '한국어'], ['en', 'English']].map(([id, label]) => `<button class="button${state.lang === id ? ' primary' : ''}" data-act="set-lang" data-arg="${id}">${languageFlag(id)}<span>${label}</span></button>`).join('');
    const speeds = SPEEDS.map((speed) => `<option value="${speed}"${speed === state.speed ? ' selected' : ''}>${speed}×</option>`).join('');
    return popup(t('cmd.settings'), 'gear', `<section class="settings-block"><h3>${icon('globe')}<span>${esc(t('menu.lang'))}</span></h3><div class="row-buttons">${langs}</div></section>
      <section class="settings-block"><h3>${icon('speed')}<span>${esc(t('speed.label'))}</span></h3><select id="pref-speed" class="tool-select">${speeds}</select></section>
      <section class="settings-block"><h3>${icon('star')}<span>${esc(t('start.background'))}</span></h3>${animationChips()}${animControls()}
        <div class="row-buttons"><button class="button" data-act="shuffle-bg">${icon('random')}<span>${esc(t('start.shuffle'))}</span></button></div>
      </section>
      <section class="settings-block"><h3>${icon('download')}<span>${esc(t('install.title'))}</span></h3><p class="muted">${esc(t('start.toolsTip'))}</p><div class="row-buttons"><button class="button" data-act="menu-toolchains">${icon('download')}<span>${esc(t('cmd.toolchains'))}</span></button></div></section>`);
  }
  if (state.modal.type === 'tools') {
    const rows = (state.modal.tools ?? []).map((tool) => `<div class="tool-row">${icon('terminal')}<b>${esc(tool.name)}</b><span class="grow muted">${esc(tool.version ?? '')}</span><span class="badge ${tool.installed ? 'ok' : 'no'}">${esc(tool.installed ? t('install.ok') : t('install.missing'))}</span>${tool.installed || !state.modal.desktop ? '' : `<button class="button" data-act="install" data-arg="${tool.id}">${esc(t('code.install'))}</button>`}</div>`).join('');
    const log = state.modal.log ? `<pre class="output">${esc(state.modal.log)}</pre>` : '';
    return popup(t('install.title'), 'download', `<p>${esc(t('install.intro'))}</p><div class="tool-list">${rows}</div>${log}`);
  }
  return '';
}

function windowButtons() {
  if (!isDesktop()) return '';
  const button = (id, glyph, key, extra = '') => `<button class="window-button ${extra}" data-act="window" data-arg="${id}" title="${esc(t(key))}" aria-label="${esc(t(key))}">${icon(glyph)}</button>`;
  return `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${button('maximize', state.maximized ? 'winRestore' : 'winMaximize', state.maximized ? 'window.restore' : 'window.maximize')}${button('close', 'winClose', 'window.close', 'close')}</div>`;
}

function mountStartBoard() {
  board?.destroy();
  board = null;
  const host = document.querySelector('#start-page .start-board');
  if (!host) return;
  board = startBoard(host, {
    saved: state.startLayout,
    onSave: (layout) => { state.startLayout = layout; save(); },
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
}

function startCard(id, glyph, title, body, { bare = false, extra = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="${esc(t('start.moveCard'))}" aria-label="${esc(t('start.moveCard'))}">${icon('moveHandle')}</button>`;
  const head = bare
    ? `<span class="card-handle-float">${handle}</span>`
    : `<h2>${handle}${icon(glyph)}<span class="start-card-title">${esc(title)}</span>${extra}</h2>`;
  const grip = `<span class="card-resize" data-card-resize="${id}" title="${esc(t('start.resizeCard'))}">${CARD_GRIP}</span>`;
  return `<section class="start-card start-card-${id}${bare ? ' bare' : ''}" data-card="${id}">${head}<div class="card-body">${body}</div>${grip}</section>`;
}

function render() {
  board?.destroy();
  board = null;
  editor?.destroy();
  editor = null;
  const current = algo();
  const root = document.getElementById('app');
  root.className = [state.page === 'start' ? 'on-start' : '', state.showLeft ? '' : 'no-left', state.showRight ? '' : 'no-right', state.showPseudo ? '' : 'no-pseudo'].filter(Boolean).join(' ');
  const onStart = state.page === 'start';
  root.innerHTML = `
    <nav id="menubar">
      <div class="app-brand" data-window-drag title="MyAlgorithmSimulator v${esc(__APP_VERSION__)}"><img class="app-brand-icon" src="icon.svg" alt="" data-window-drag><span class="app-brand-name" data-window-drag>MyAlgorithmSimulator</span><span class="app-brand-version" data-window-drag>v${esc(__APP_VERSION__)}</span></div>
      <button class="menubar-item menubar-home${onStart ? ' current' : ''}" data-act="home" title="${esc(t('cmd.home'))}">${icon('home')}<span>${esc(t('menu.home'))}</span></button>
      <span class="menubar-sep"></span>
      ${['file', 'view', 'run', 'help'].map((id) => `<button class="menubar-item${state.menu?.id === id ? ' open' : ''}" data-act="menu" data-arg="${id}">${icon(MENU_ICON[id])}<span>${esc(t(`menu.${id}`))}</span></button>`).join('')}
      <span class="menubar-project${onStart ? ' empty' : ''}" data-window-drag><span class="app-brand-project-name" data-window-drag>${onStart ? '' : esc(tx(current.name))}</span></span>
      <div class="menubar-drag" data-window-drag></div>
      ${windowButtons()}
    </nav>
    <div id="toolbar"><div class="toolbar-inner">
      <div class="toolbar-left">
        <div class="tool-group">
          <button class="tool-button tool-labeled" data-act="save-project" title="${esc(t('cmd.saveProject'))}">${icon('save')}<span>${esc(t('cmd.saveProject'))}</span></button>
          <button class="tool-button tool-labeled" data-act="print" title="${esc(t('cmd.print'))}">${icon('print')}<span>${esc(t('cmd.print'))}</span></button>
          <span class="tool-sep"></span>
          <button class="tool-button tool-labeled" data-act="step-back" title="${esc(t('cmd.stepBack'))}">${icon('stepBack')}<span>${esc(t('cmd.stepBack'))}</span></button>
          <button class="tool-button tool-labeled" data-act="step-forward" title="${esc(t('cmd.stepForward'))}">${icon('stepForward')}<span>${esc(t('cmd.stepForward'))}</span></button>
          <button class="tool-button tool-labeled${state.playing ? ' active' : ''}" id="play-button" data-act="play" title="${esc(state.playing ? t('cmd.pause') : t('cmd.auto'))}">${icon(state.playing ? 'pause' : 'play')}<span>${esc(state.playing ? t('cmd.pause') : t('cmd.auto'))}</span></button>
          <button class="tool-button tool-labeled" data-act="stop" title="${esc(t('cmd.stop'))}">${icon('restart')}<span>${esc(t('cmd.stop'))}</span></button>
          <button class="button primary" data-act="run" title="${esc(t('cmd.runCode'))}">${icon('run')}<span>${esc(t('code.run'))}</span></button>
        </div>
        <span class="tool-sep"></span>
        <div class="scrub-group"><span id="step-label"></span><input id="scrubber" type="range" min="0" max="0" value="0"></div>
        <label class="tool-speed" title="${esc(t('speed.label'))}">${icon('speed')}<select id="speed" class="tool-select" title="${esc(t('speed.label'))}">${SPEEDS.map((speed) => `<option value="${speed}"${speed === state.speed ? ' selected' : ''}>${speed}×</option>`).join('')}</select></label>
        <span class="tool-sep"></span>
        <button class="tool-button" data-act="random" title="${esc(t('cmd.random'))}">${icon('random')}</button>
        <button class="button" data-act="apply" title="${esc(t('cmd.apply'))}">${icon('check')}<span>${esc(t('input.apply'))}</span></button>
      </div>
      <span class="grow"></span>
      <div class="toolbar-right">
        <button class="button theme-button${state.menu?.id === 'theme' ? ' open' : ''}" data-act="menu-theme" title="${esc(t('start.themeTip'))}" aria-haspopup="menu">${icon('palette')}<span>${esc(themeName(state.themeId, state.lang))}</span>${icon('chevronDown', 'icon tiny')}</button>
        <button class="tool-button" data-act="menu-ui-lang" title="${esc(t('start.langTip'))}" aria-label="${esc(state.lang === 'ko' ? 'English' : '한국어')}">${switchFlag(state.lang)}</button>
        <button class="button" data-act="menu-about" title="${esc(t('start.aboutTip'))}">${icon('info')}<span>${esc(t('cmd.about'))}</span></button>
      </div>
    </div></div>
    <main id="workspace">
      <aside id="left-panel" class="side-panel">${leftPanel()}</aside>
      <div class="splitter panel-split" data-split="left"></div>
      <section id="center">
        <div id="tabs"><button class="tab active">${icon(current.id)}<span>${esc(tx(current.name))}</span></button><span class="grow"></span></div>
        <div id="center-body">
          <div id="stage"><canvas id="stage-canvas"></canvas><div id="stage-caption" class="stage-caption"></div></div>
          <div id="start-page">${startPage()}</div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom"></div>
        <section id="bottom-panel">
          ${programBar()}
          <div id="trace-banner"></div>
          <div id="program-pane"${state.bottomTab === 'code' ? '' : ' hidden'}><div id="editor-host"></div></div>
          <div id="pseudo"${state.bottomTab === 'code' ? ' hidden' : ''}>${current.pseudo.map((line, index) => `<div class="pseudo-line"><span class="ln">${index + 1}</span><span>${esc(line)}</span></div>`).join('')}</div>
        </section>
      </section>
      <div class="splitter panel-split" data-split="right"></div>
      <aside id="right-panel" class="side-panel">${rightPanel()}</aside>
    </main>
    <footer id="statusbar">
      <span class="status-item">${icon(current.id)}<b id="status-algo">${esc(tx(current.name))}</b></span>
      <span class="status-notice"><span id="status-text">${esc(state.error || state.status)}</span></span>
      <span class="status-item">${esc(CODE_LANGUAGES.find((item) => item.id === state.codeLang)?.name ?? '')}</span>
      <span class="status-item">${esc(isDesktop() ? t('status.desktop') : t('status.web'))}</span>
      <button class="status-item" data-act="menu-ui-lang" title="${esc(t('start.langTip'))}">${switchFlag(state.lang)}<span>${state.lang === 'ko' ? '한국어' : 'English'}</span></button>
    </footer>
    ${isDesktop() ? `<div class="resize-grip" data-resize-grip>${icon('grip')}</div>` : `<div class="resize-grip static">${icon('grip')}</div>`}
    ${menuHtml()}${modalHtml()}`;

  if (state.page !== 'start' && state.showPseudo && document.getElementById('editor-host')) {
    editor = createEditor(document.getElementById('editor-host'), {
      code: currentCode(), language: state.codeLang, onChange: (text) => { state.code[codeKey()] = text; },
    });
  }
  if (state.rightTab === 'vars') updateVars();
  paint();
  updateHud();
  updatePseudo();
  mountBackground();
  mountStartBoard();
}

function mountBackground() {
  backdrop?.destroy();
  backdrop = null;
  const canvas = document.querySelector('#start-page .start-bg');
  if (!canvas) return;
  backdrop = new AnimatedBackground(canvas, {
    vivid: true,
    kind: ANIMATION_KINDS.includes(state.animation) ? state.animation : 'aurora',
    speed: () => (Number(state.animationSpeed) || 0) / 100,
    opacity: (Number(state.animationOpacity) || 0) / 100,
    colors: () => {
      const style = getComputedStyle(document.documentElement);
      const pick = (name) => style.getPropertyValue(name).trim();
      return {
        bg: pick('--bg') || '#eef1f6', accent: pick('--accent') || '#3b6cff',
        accent2: pick('--chart') || pick('--accent') || '#3b6cff', text: pick('--text') || '#222222',
        dark: document.documentElement.dataset.mode === 'dark',
      };
    },
  });
  backdrop.start();
  const paintNow = () => {
    if (!backdrop) return;
    canvas.getBoundingClientRect();
    backdrop.resize();
    backdrop.draw();
  };
  paintNow();
  requestAnimationFrame(paintNow);
}

function tile(act, glyph, label, tip, arg = '') {
  return `<button class="start-tile" data-act="${act}" ${arg ? `data-arg="${esc(arg)}"` : ''} title="${esc(tip)}">${icon(glyph)}<b>${esc(label)}</b><small>${esc(tip)}</small></button>`;
}

function startPage() {
  const actions = [
    ['begin', 'play', t('start.begin'), t('start.beginTip')],
    ['random-start', 'random', t('start.random'), t('start.randomTip')],
    ['menu-settings', 'gear', t('cmd.settings'), t('start.settingsTip')],
    ['menu-about', 'info', t('cmd.about'), t('start.aboutTip')],
    ['menu-guide', 'book', t('cmd.guide'), t('start.guideTip')],
    ['menu-toolchains', 'download', t('cmd.toolchains'), t('start.toolsTip')],
    ['menu-exit', 'exit', t('cmd.exit'), t('start.quitTip')],
  ].map(([act, glyph, label, tip]) => tile(act, glyph, label, tip)).join('');
  const recentItems = state.recent.map((id) => algorithmById(id)).filter(Boolean);
  const recent = recentItems.length
    ? recentItems.map((item) => `<button class="start-link" data-act="open-algo" data-arg="${item.id}">${icon(item.id)}<span class="name">${esc(tx(item.name))}</span><small>${esc(tx(CATEGORIES.find((category) => category.id === item.category)?.name))}</small></button>`).join('')
    : `<div class="start-empty">${icon('info')}<span>${esc(t('start.empty'))}</span></div>`;
  const groups = CATEGORIES.map((category) => {
    const items = ALGORITHMS.filter((item) => item.category === category.id);
    const tiles = items.map((item) => tile('open-algo', item.id, tx(item.name), tx(item.summary), item.id)).join('');
    return `<section class="sample-group"><h3>${icon(CATEGORY_ICON[category.id])}<span>${esc(tx(category.name))}</span><span class="sample-count">${items.length}</span></h3><div class="sample-tiles">${tiles}</div></section>`;
  }).join('');
  return `<canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll"><div class="start-inner">
    <div class="start-tools">
      <button class="button" data-act="menu-settings">${icon('gear')}<span>${esc(t('cmd.settings'))}</span></button>
      <button class="button" data-act="menu-about">${icon('info')}<span>${esc(t('cmd.about'))}</span></button>
      <button class="button" data-act="shuffle-bg">${icon('random')}<span>${esc(t('start.shuffle'))}</span></button>
    </div>
    <section class="start-card start-card-hero bare">
      <div class="card-body"><img class="start-icon" src="icon.svg" alt=""><div class="start-hero-text"><h1>MyAlgorithmSimulator <small>v${esc(__APP_VERSION__)}</small></h1><p>${esc(t('start.tagline'))}</p></div><div class="start-hero-actions"><button class="button big" data-act="menu-settings">${icon('gear')}<span>${esc(t('cmd.settings'))}</span></button><button class="button big" data-act="menu-about">${icon('info')}<span>${esc(t('cmd.about'))}</span></button><button class="button big" data-act="menu-guide">${icon('book')}<span>${esc(t('cmd.guide'))}</span></button><button class="button primary big" data-act="begin">${icon('play')}<span>${esc(t('start.begin'))}</span></button></div></div>
    </section>
    <div class="start-board">
      ${startCard('actions', 'home', t('start.actions'), `<div class="start-actions">${actions}</div>`)}
      ${startCard('recent', 'star', t('start.recent'), `<div class="start-list">${recent}</div>`)}
      ${startCard('background', 'theme', t('start.background'), `${animationChips()}${animControls()}`)}
      ${startCard('algorithms', 'layers', t('start.algorithms'), groups, { extra: `<span class="start-card-note">${ALGORITHMS.length}</span>` })}
    </div>
    <footer class="start-foot"><button class="start-link" data-act="menu-about">${icon('info')}<span class="name">MyAlgorithmSimulator v${esc(__APP_VERSION__)}</span></button><span class="grow"></span><span class="muted">© SHKWON (knix008@naver.com)</span></footer>
  </div></div>`;
}

// ───────────────────────── actions

const actions = {
  menu(el) {
    if (state.menu?.id === el.dataset.arg) { state.menu = null; render(); return; }
    const rect = el.getBoundingClientRect();
    state.menu = { id: el.dataset.arg, x: Math.max(8, Math.min(rect.left, window.innerWidth - 280)), y: rect.bottom + 4 };
    render();
  },
  'open-algo': (el) => openAlgorithm(el.dataset.arg),
  'toggle-cat'(el) { state.collapsed[el.dataset.arg] = !state.collapsed[el.dataset.arg]; render(); },
  play() { if (state.playing) { stopPlayback(); updateTransport(); } else play(); },
  'step-forward'() { stopPlayback(); if (state.page === 'start') openAlgorithm(state.algorithmId); if (!state.frames.length) applyInput(); state.frame = Math.min(state.frames.length - 1, state.frame + 1); refreshFrame(); },
  'step-back'() { stopPlayback(); state.frame = Math.max(0, state.frame - 1); refreshFrame(); },
  stop() { stopPlayback(); state.frame = 0; refreshFrame(); },
  random() { if (state.page === 'start') openAlgorithm(state.algorithmId); randomInput(); },
  apply() { if (state.page === 'start') openAlgorithm(state.algorithmId); applyInput(); },
  begin() { openAlgorithm(state.recent[0] || state.algorithmId); },
  'random-start'() { openAlgorithm(state.algorithmId); randomInput(); },
  home() { stopPlayback(); state.page = 'start'; state.menu = null; render(); },
  tab(el) { state.rightTab = el.dataset.arg; state.page = 'work'; render(); },
  bottom(el) {
    const tab = el.dataset.arg === 'pseudo' ? 'pseudo' : 'code';
    state.bottomTab = tab;
    const code = document.getElementById('program-pane');
    const pseudo = document.getElementById('pseudo');
    if (!code || !pseudo) { render(); return; }
    code.hidden = tab !== 'code';
    pseudo.hidden = tab === 'code';
    document.querySelectorAll('#bottom-panel .editor-tab').forEach((button) => button.classList.toggle('active', button.dataset.arg === tab));
    if (tab === 'code') editor?.relayout();
    updatePseudo();
  },
  run: executeCode,
  sample() { state.page = 'work'; loadSample(); },
  'set-lang'(el) { state.lang = el.dataset.arg === 'en' ? 'en' : 'ko'; setLanguage(state.lang); state.menu = null; save(); render(); },
  'pick-animation'(el) {
    if (!ANIMATION_KINDS.includes(el.dataset.arg)) return;
    state.animation = el.dataset.arg;
    save();
    backdrop?.setKind(state.animation);
    document.querySelectorAll('[data-act="pick-animation"]').forEach((button) => {
      const on = button.dataset.arg === state.animation;
      button.classList.toggle('on', on);
      button.setAttribute('aria-checked', String(on));
    });
  },
  'nudge-anim'(el) {
    const which = el.dataset.arg === 'opacity' ? 'opacity' : 'speed';
    const delta = Number(el.dataset.delta) || 0;
    if (which === 'opacity') {
      state.animationOpacity = Math.max(0, Math.min(100, state.animationOpacity + delta));
      backdrop?.setOpacity(state.animationOpacity / 100);
    } else state.animationSpeed = Math.max(0, Math.min(300, state.animationSpeed + delta));
    save();
    const value = which === 'opacity' ? state.animationOpacity : state.animationSpeed;
    document.querySelectorAll(`[data-readout="${which}"]`).forEach((node) => { node.textContent = `${value}%`; });
  },
  'save-project': saveCurrentProject,
  print() { openPrint(); },
  'shuffle-bg'() {
    const others = ANIMATION_KINDS.filter((kind) => kind !== state.animation);
    state.animation = others[Math.floor(Math.random() * others.length)] ?? 'aurora';
    save();
    backdrop?.setKind(state.animation);
    document.querySelectorAll('[data-act="pick-animation"]').forEach((button) => button.classList.toggle('on', button.dataset.arg === state.animation));
  },
  'close-modal'() { state.modal = null; render(); },
  'set-theme'(el) {
    state.themeId = el.dataset.arg;
    state.menu = null;
    const theme = resolveTheme(state.themeId, matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(theme);
    save();
    desktopWindow().then((win) => win?.setTheme(theme.dark ? 'dark' : 'light').catch(() => {}));
    render();
  },
};

function projectDocument() {
  if (editor) state.code[codeKey()] = editor.get();
  return {
    version: 1, algorithmId: state.algorithmId, inputText: state.inputText,
    codeLang: state.codeLang, code: state.code, frame: state.frame, lang: state.lang,
  };
}

async function saveCurrentProject() {
  const path = await saveProjectFile(`${state.algorithmId}.myalgo.json`, JSON.stringify(projectDocument(), null, 2), state.projectPath);
  if (!path) return;
  state.projectPath = path;
  state.status = t('print.saved');
  const notice = document.getElementById('status-text');
  if (notice) notice.textContent = state.status;
}

function openPrint() {
  const current = algo();
  const frame = state.frames[state.frame];
  const canvas = document.getElementById('stage-canvas');
  let image = '';
  if (canvas && state.page !== 'start' && canvas.width) {
    try { image = canvas.toDataURL('image/png'); } catch { image = ''; }
  }
  const theme = resolveTheme(state.themeId, matchMedia('(prefers-color-scheme: dark)').matches);
  openPrintWindow({
    title: `MyAlgorithmSimulator — ${t('cmd.print')}`,
    lang: state.lang,
    theme: state.themeId,
    dark: theme.dark,
    payload: {
      lang: state.lang,
      title: tx(current.name),
      summary: tx(current.summary),
      description: tx(current.description).replace(/\*\*/g, ''),
      complexity: current.complexity,
      traits: tx(current.traits),
      input: state.inputText,
      pseudo: current.pseudo,
      code: editor ? editor.get() : currentCode(),
      language: CODE_LANGUAGES.find((item) => item.id === state.codeLang)?.name ?? state.codeLang,
      step: frame ? tx(frame.msg) : '',
      vars: frame?.vars ?? {},
      image,
      stepNo: state.frames.length ? state.frame + 1 : 0,
      stepTotal: state.frames.length,
    },
  });
}

function openGuide() {
  const theme = resolveTheme(state.themeId, matchMedia('(prefers-color-scheme: dark)').matches);
  const title = `MyAlgorithmSimulator — ${t('cmd.guide')}`;
  const params = new URLSearchParams({ lang: state.lang, theme: state.themeId });
  const popup = () => {
    const opened = window.open(`guide.html?${params}`, 'myalgorithmsimulator-guide', 'popup=yes,width=1120,height=800');
    if (!opened) return;
    opened.focus();
    opened.postMessage({ type: 'guide-theme', theme: state.themeId }, location.origin);
  };
  if (!isDesktop()) { popup(); return; }
  import('@tauri-apps/api/core').then(({ invoke }) => invoke('open_guide_window', {
    title, lang: state.lang, theme: state.themeId, dark: theme.dark,
  })).catch(() => popup());
}

const menuActions = {
  'menu-new'() { state.page = 'work'; state.inputText = algo().input.default; state.menu = null; render(); applyInput(); },
  'menu-open': async () => { state.menu = null; const file = await readTextFile(); if (file) { state.code[codeKey()] = file.text; state.bottomTab = 'code'; state.page = 'work'; } render(); },
  'menu-save': async () => { state.menu = null; render(); await writeTextFile(`${state.algorithmId}.${extension(state.codeLang)}`, editor ? editor.get() : currentCode()); },
  'menu-home'() { actions.home(); },
  'menu-exit': () => quit(),
  'menu-left'() { state.showLeft = !state.showLeft; state.menu = null; save(); render(); },
  'menu-right'() { state.showRight = !state.showRight; state.menu = null; save(); render(); },
  'menu-pseudo'() { state.showPseudo = !state.showPseudo; state.menu = null; save(); render(); },
  'menu-theme'(el) {
    if (state.menu?.id === 'theme') { state.menu = null; render(); return; }
    const rect = el?.getBoundingClientRect?.() ?? { left: 8, right: 8, top: 36, bottom: 64 };
    const width = 440;
    const height = Math.min(560, window.innerHeight - 16);
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    let y = rect.bottom + 4;
    if (y + height > window.innerHeight - 8) y = Math.max(8, rect.top - 4 - height);
    state.menu = { id: 'theme', x, y };
    render();
  },
  'menu-settings'() { state.menu = null; state.modal = { type: 'settings' }; render(); },
  'menu-ui-lang'() { state.lang = state.lang === 'ko' ? 'en' : 'ko'; setLanguage(state.lang); state.menu = null; save(); render(); },
  'menu-play'() { state.menu = null; render(); actions.play(); },
  'menu-stepForward'() { state.menu = null; actions['step-forward'](); },
  'menu-stepBack'() { state.menu = null; actions['step-back'](); },
  'menu-stop'() { state.menu = null; actions.stop(); },
  'menu-random'() { state.menu = null; actions.random(); },
  'menu-run'() { state.menu = null; executeCode(); },
  'menu-toolchains': () => openTools(),
  'menu-guide'() { state.menu = null; render(); openGuide(); },
  'menu-about'() { state.menu = null; state.modal = { type: 'about' }; render(); },
};

async function desktopWindow() {
  if (!isDesktop()) return null;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

async function windowCommand(id) {
  const win = await desktopWindow();
  if (!win) return;
  if (id === 'minimize') win.minimize().catch(() => {});
  else if (id === 'maximize') {
    await win.toggleMaximize().catch(() => {});
    state.maximized = await win.isMaximized().catch(() => !state.maximized);
    const button = document.querySelector('[data-act="window"][data-arg="maximize"]');
    if (button) {
      button.innerHTML = icon(state.maximized ? 'winRestore' : 'winMaximize');
      button.title = t(state.maximized ? 'window.restore' : 'window.maximize');
    }
  } else if (id === 'close') quit();
}

async function openTools() {
  state.menu = null;
  state.modal = { type: 'tools', tools: [], desktop: isDesktop(), log: '' };
  render();
  const status = await toolchainStatus();
  const order = [['c', 'C (gcc)'], ['cpp', 'C++ (g++)'], ['java', 'Java (javac)'], ['python', 'Python'], ['go', 'Go'], ['rust', 'Rust (rustc)'], ['javascript', 'JavaScript']];
  state.modal.tools = order.map(([id, name]) => ({ id, name, ...(status.tools?.[id] ?? { installed: false }) }));
  state.modal.desktop = status.desktop;
  render();
}

async function install(id) {
  state.modal.log = '';
  render();
  try {
    await installToolchain(id, (payload) => { state.modal.log += `${payload.line ?? ''}\n`; const pre = document.querySelector('.popup .output'); if (pre) pre.textContent = state.modal.log; });
    state.modal.log += `\n${t('install.done')}`;
  } catch (error) {
    state.modal.log += `\n${error}`;
  }
  const status = await toolchainStatus();
  state.modal.tools = state.modal.tools.map((tool) => ({ ...tool, ...(status.tools?.[tool.id] ?? {}) }));
  render();
}

function bind() {
  const root = document.getElementById('app');
  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-act]');
    if (!el) { if (state.menu && !event.target.closest('.menu')) { state.menu = null; render(); } return; }
    const act = el.dataset.act;
    if (act === 'window') { windowCommand(el.dataset.arg); return; }
    if (actions[act]) actions[act](el, event);
    else if (menuActions[act]) menuActions[act](el, event);
    else if (act === 'install') install(el.dataset.arg);
  });
  root.addEventListener('input', (event) => {
    if (event.target.id === 'algo-search') { state.query = event.target.value; const body = document.getElementById('algo-list'); if (body) body.innerHTML = algorithmList(); }
    if (event.target.id === 'scrubber') { stopPlayback(); state.frame = Number(event.target.value); refreshFrame(); }
    if (event.target.id === 'algo-input') state.inputText = event.target.value;
    if (event.target.classList.contains('anim-speed')) {
      state.animationSpeed = Number(event.target.value);
      save();
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.id === 'speed' || event.target.id === 'pref-speed') { state.speed = Number(event.target.value); save(); }
    if (event.target.id === 'code-lang') { if (editor) state.code[codeKey()] = editor.get(); state.codeLang = event.target.value; save(); render(); }
  });
  root.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.ctrlKey && event.target.id === 'algo-input') { event.preventDefault(); applyInput(); } });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.modal) { state.modal = null; render(); return; }
      if (state.menu) { state.menu = null; render(); return; }
    }
    if (event.target.matches('input, textarea, select') || event.target.closest('.cm-editor')) return;
    if (event.key === ' ') { event.preventDefault(); actions.play(); }
    else if (event.key === 'ArrowRight') actions['step-forward']();
    else if (event.key === 'ArrowLeft') actions['step-back']();
    else if (event.key === 'Home') actions.stop();
    else if (event.key === 'r' && !event.ctrlKey && !event.metaKey) actions.random();
  });
  root.addEventListener('mousedown', (event) => {
    if (event.button === 0 && event.target.closest('[data-resize-grip]')) {
      desktopWindow().then((win) => win?.startResizeDragging('SouthEast').catch(() => {}));
      return;
    }
    if (event.button === 0 && event.target.closest('[data-window-drag]') && !event.target.closest('button, input, a, select')) {
      desktopWindow().then((win) => win?.startDragging().catch(() => {}));
      return;
    }
    const splitter = event.target.closest('.splitter');
    if (!splitter) return;
    const side = splitter.dataset.split;
    const start = side === 'bottom' ? event.clientY : event.clientX;
    const initial = cssVar(side === 'left' ? '--left-width' : side === 'right' ? '--right-width' : '--bottom-height', side === 'left' ? 268 : side === 'right' ? 380 : 300);
    const move = (e) => {
      if (side === 'bottom') {
        const value = Math.min(560, Math.max(160, initial - (e.clientY - start)));
        document.documentElement.style.setProperty('--bottom-height', `${value}px`);
        editor?.relayout();
      } else {
        const delta = e.clientX - start;
        const value = side === 'left' ? Math.min(460, Math.max(200, initial + delta)) : Math.min(640, Math.max(280, initial - delta));
        document.documentElement.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${value}px`);
      }
      paint();
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  root.addEventListener('click', (event) => { if (event.target.id === 'stage-canvas') onStageClick(event); });
  new ResizeObserver(() => paint()).observe(root);
}

function cssVar(name, fallback) {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

export function start() {
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  Object.assign(state, {
    lang: saved.lang ?? (navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'ko'),
    themeId: saved.themeId ?? 'light', speed: saved.speed ?? 1, codeLang: saved.codeLang ?? 'python',
    algorithmId: saved.algorithmId ?? 'bubble-sort', recent: saved.recent ?? [],
    showLeft: saved.showLeft ?? true, showRight: saved.showRight ?? true, showPseudo: saved.showPseudo ?? true,
    animation: ANIMATION_KINDS.includes(saved.animation) ? saved.animation : 'aurora',
    animationSpeed: Number.isFinite(saved.animationSpeed) ? saved.animationSpeed : 100,
    animationOpacity: Number.isFinite(saved.animationOpacity) ? saved.animationOpacity : 100,
    startLayout: saved.startLayout ?? null,
  });
  state.inputText = algo().input.default;
  setLanguage(state.lang);
  const theme = resolveTheme(state.themeId, matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(theme);
  bind();
  render();
  desktopWindow().then(async (win) => {
    if (!win) return;
    win.setDecorations(false).catch(() => {});
    win.setTheme(theme.dark ? 'dark' : 'light').catch(() => {});
    state.maximized = await win.isMaximized().catch(() => false);
    const button = document.querySelector('[data-act="window"][data-arg="maximize"]');
    if (button && state.maximized) button.innerHTML = icon('winRestore');
  });
}

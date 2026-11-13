// The window around the TTS editor, in the MyUMLMaker look: the menu bar row as the title bar
// (icon, name, version, open file, Home, menus, window buttons), the colour icon toolbar, the
// start page (a moving background behind a board of movable cards), the 40 colour themes plus
// "system" and "custom", and the status bar extras. main.js keeps the TTS logic; this module
// only calls back into it through the `actions` it is given.
import {
  CUSTOM, CUSTOM_KEYS, DARK_THEMES, LIGHT_THEMES, SYSTEM, THEME_IDS,
  applyTheme as applyThemeVars, customFrom, normalizeCustom, randomThemeId, resolveTheme, themeName,
} from './themes.js';
import { animationIcon, icon } from './icons.js';
import { installTooltips } from './tooltip.js';
import { ANIMATIONS, ANIMATION_INTERVALS, AnimatedBackground } from './background.js';
import { startBoard } from './startboard.js';
import { SAMPLE_GROUPS, SAMPLES } from './samples.js';
import * as docTabs from './doctabs.js';
import { showContextMenu } from './contextmenu.js';

export const APP_NAME = 'MyTTS';
export const VERSION = '0.1.0';
const APP_ICON = './assets/icon.svg';

// ───────────────────────── helpers

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseName = (path) => String(path ?? '').replace(/.*[\\/]/, '');
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const storage = {
  get(key) { try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null'); } catch { return null; } },
  set(key, value) { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};

const ANIMATION_NAMES = {
  aurora: '오로라', waves: '물결', particles: '입자', constellation: '별자리', bubbles: '거품', gridflow: '흐르는 격자',
  flowchart: '순서도', starfield: '별빛', rain: '비', snow: '눈', fireflies: '반딧불', ripples: '파문', coderain: '코드 비',
  hexagons: '육각 격자', orbits: '궤도', lava: '라바 램프', spiral: '은하 나선', confetti: '색종이', nodes: '노드 네트워크', ribbons: '리본',
};
const CUSTOM_LABELS = {
  bg: '배경', surface: '표면', panel: '패널', text: '글자', muted: '흐린 글자', border: '테두리',
  accent: '강조색', accentText: '강조색 위 글자', gridAlt: '교차 줄', chart: '파형 영역', toolbar: '툴바', status: '상태 표시줄',
};
const intervalLabel = (seconds) => (!seconds ? '끄기' : seconds < 60 ? `${seconds}초마다` : `${seconds / 60}분마다`);

// ───────────────────────── settings

const SETTINGS_KEY = 'tts-ui-settings';
const RECENT_KEY = 'tts-recent-files';
const DEFAULTS = {
  theme: 'light', customTheme: null,
  showStartPage: true, startShowRecent: true, startShowModels: true, startShowSamples: true, startShowBackground: true,
  startRecentCount: 8, startCardOpacity: 80, startLayout: null,
  animation: 'aurora', animationSpeed: 100, animationRandom: true, animationInterval: 30,
  showStatusBar: true,
};

function loadSettings() {
  const saved = storage.get(SETTINGS_KEY) ?? {};
  const s = { ...DEFAULTS, ...saved };
  // Before this look the program had only "dark" and "light" (key tts-theme): keep that choice once.
  if (!saved.theme) { try { const old = globalThis.localStorage?.getItem('tts-theme'); if (old === 'dark' || old === 'light') s.theme = old; } catch { /* ignore */ } }
  if (!THEME_IDS.includes(s.theme)) s.theme = DEFAULTS.theme;
  if (!ANIMATIONS.includes(s.animation)) s.animation = DEFAULTS.animation;
  if (!ANIMATION_INTERVALS.includes(Number(s.animationInterval))) s.animationInterval = DEFAULTS.animationInterval;
  s.animationSpeed = Math.max(0, Math.min(300, Number(s.animationSpeed) || 0));
  s.startCardOpacity = Math.max(20, Math.min(100, Number(s.startCardOpacity) || 80));
  s.startRecentCount = Math.max(1, Math.min(20, Number(s.startRecentCount) || 8));
  s.customTheme = s.customTheme ? normalizeCustom(s.customTheme) : null;
  return s;
}

// ───────────────────────── state

let actions = {};
let settings = loadSettings();
let recent = (storage.get(RECENT_KEY) ?? []).filter((item) => item && item.path);
let showingStart = false;
let openMenu = null;
let startCards = null;
let startBackground = null;
let backgroundChangedAt = Date.now();
let maximized = false;
const desktop = Boolean(globalThis.ttsBridge?.windowControl);
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);

function saveSettings() { storage.set(SETTINGS_KEY, settings); }
function updateSettings(patch) {
  const themeChanged = 'theme' in patch || 'customTheme' in patch;
  settings = { ...settings, ...patch };
  saveSettings();
  if (themeChanged) applyCurrentTheme();
  if (showingStart) renderStartPage();
  renderStatusExtras();
  $('#app')?.classList.toggle('no-status', !settings.showStatusBar);
}

export const currentTheme = () => resolveTheme(settings.theme, prefersDark(), settings.customTheme);

function applyCurrentTheme() {
  const theme = currentTheme();
  applyThemeVars(theme);
  document.documentElement.dataset.themeId = settings.theme;
  actions.onThemeChange?.(theme);
  renderStatusExtras();
}

// ───────────────────────── commands

/** Commands that press a button main.js already handles: same enabled state, same behaviour. */
const MIRRORS = {
  speak: 'speakText', speakAll: 'speakAllVoices', pause: 'pausePlayback', stop: 'stopPlayback',
  download: 'downloadModel', deleteModel: 'deleteModel', resetVoice: 'saveAudioDefaults', resetAdvanced: 'pcmDefaultsBtn',
};

const COMMANDS = {
  newText: { label: '새 텍스트 탭', icon: 'ttsNewText', key: 'Ctrl+N', tip: '빈 텍스트 탭을 새로 엽니다' },
  closeTab: { label: '탭 닫기', icon: 'closeTab', key: 'Ctrl+W', tip: '지금 텍스트 탭을 닫습니다' },
  open: { label: '열기…', icon: 'folderOpen', key: 'Ctrl+O', tip: '텍스트 파일(.txt, .md)을 탭으로 엽니다' },
  save: { label: '오디오 저장', icon: 'save', key: 'Ctrl+S', tip: '합성한 음성을 WAV/MP3로 저장합니다' },
  saveAs: { label: '다른 이름으로 저장…', icon: 'saveAs', key: 'Ctrl+Shift+S', tip: '합성한 음성을 다른 이름으로 저장합니다' },
  clearRecent: { label: '최근 파일 지우기', icon: 'clearHistory', tip: '최근 파일 목록을 비웁니다' },
  exit: { label: '종료', icon: 'exit', key: 'Alt+F4', tip: '프로그램을 닫습니다' },
  speak: { label: '읽기', icon: 'play', key: 'F5', tip: '텍스트를 합성해 읽습니다' },
  speakAll: { label: '모든 화자로 생성', icon: 'ttsVoice', key: 'Shift+F5', tip: '이 모델의 모든 화자로 텍스트를 생성해 아래 「화자별 결과」에 보여 줍니다 (화자가 둘 이상인 모델)' },
  pause: { label: '멈춤', icon: 'pause', key: 'F6', tip: '재생을 잠시 멈춥니다' },
  stop: { label: '중단', icon: 'stop', key: 'F7', tip: '재생을 멈추고 처음으로 돌아갑니다' },
  download: { label: '모델 다운로드', icon: 'ttsDownload', tip: '선택한 모델을 내려받아 설치합니다' },
  deleteModel: { label: '모델 삭제', icon: 'trash', tip: '선택한 모델을 지웁니다' },
  refresh: { label: '모델 목록 새로고침', icon: 'refresh', tip: '모델 목록과 설치 상태를 다시 읽습니다' },
  resetVoice: { label: '음성 기본값으로', icon: 'ttsReset', tip: '볼륨 100%, 속도 1.00×, 피치 ±0 으로 되돌립니다' },
  resetAdvanced: { label: '고급 합성 기본값으로', icon: 'ttsTune', tip: '변동성·리듬·정규화를 기본값으로 되돌립니다' },
  home: { label: '시작 화면', icon: 'home', key: 'Ctrl+Home', tip: '시작 화면과 편집기를 오갑니다' },
  themeSettings: { label: '테마 설정…', icon: 'palette', tip: '테마를 고르고 색을 바꿉니다' },
  randomTheme: { label: '무작위 테마', icon: 'dice', tip: '다른 테마를 무작위로 고릅니다' },
  startSettings: { label: '시작 화면 설정…', icon: 'gear', tip: '시작 화면에 보일 항목을 고릅니다' },
  statusBar: { label: '상태 표시줄', icon: 'statusBar', tip: '아래쪽 상태 표시줄을 보이거나 숨깁니다', checked: () => settings.showStatusBar },
  guide: { label: '사용 설명서', icon: 'ttsGuide', key: 'F1', tip: '사용 설명서를 별도 창에서 엽니다' },
  tutorial: { label: '튜토리얼', icon: 'ttsTutorial', tip: '처음부터 따라 하는 튜토리얼을 엽니다' },
  about: { label: '프로그램 정보', icon: 'info', tip: '버전과 지원 모델을 봅니다' },
};

const MENUS = {
  file: { label: '파일', icon: 'file', items: ['newText', 'open', 'closeTab', '-', 'save', 'saveAs', '-', 'recent', 'clearRecent', '-', 'exit'] },
  play: { label: '재생', icon: 'ttsWaveform', items: ['speak', 'speakAll', 'pause', 'stop'] },
  model: { label: '모델', icon: 'ttsModel', items: ['download', 'deleteModel', 'refresh', '-', 'resetVoice', 'resetAdvanced'] },
  view: { label: '보기', icon: 'eye', items: ['home', '-', 'themeSettings', 'randomTheme', '-', 'startSettings', 'statusBar'] },
  help: { label: '도움말', icon: 'question', items: ['guide', 'tutorial', '-', 'about'] },
};

function isEnabled(id) {
  if (MIRRORS[id]) return !document.getElementById(MIRRORS[id])?.disabled;
  if (id === 'save' || id === 'saveAs') return actions.canSave?.() ?? true;
  if (id === 'clearRecent') return recent.length > 0;
  return true;
}

export async function runCommand(id, value) {
  closeMenu();
  if (MIRRORS[id]) {
    const target = document.getElementById(MIRRORS[id]);
    if (!target || target.disabled) return;
    if (id === 'speak' || id === 'speakAll' || id === 'pause' || id === 'stop') showStart(false);
    target.click();
    return;
  }
  switch (id) {
    case 'newText':
      showStart(false);
      if (docTabs.newTab()) actions.status?.('새 텍스트 탭을 열었습니다.');
      return undefined;
    case 'open': showStart(false); return actions.open?.();
    case 'closeTab': showStart(false); return docTabs.closeTab();
    case 'save': return actions.save?.();
    case 'saveAs': return actions.saveAs?.();
    case 'refresh': return actions.refresh?.();
    case 'exit': return desktop ? globalThis.ttsBridge.windowControl('close') : globalThis.close();
    case 'home': return showStart(!showingStart);
    case 'themeSettings': return openThemeDialog();
    case 'randomTheme': return updateSettings({ theme: randomThemeId(settings.theme) });
    case 'startSettings': return openStartSettings();
    case 'statusBar': return updateSettings({ showStatusBar: !settings.showStatusBar });
    case 'about': return actions.about?.();
    case 'guide': return openGuide('guide');
    case 'tutorial': return openGuide('tutorial');
    case 'clearRecent': recent = []; storage.set(RECENT_KEY, recent); return showingStart ? renderStartPage() : undefined;
    case 'openRecent': return openRecent(value);
    default: return undefined;
  }
}

// ───────────────────────── menu bar (title bar row)

function renderMenubar() {
  const bar = $('#menubar');
  const brand = `<div class="app-brand" title="${escapeHtml(`${APP_NAME} v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" /><span class="app-brand-name">${APP_NAME}</span><span class="app-brand-version">v${VERSION}</span></div>`;
  // Home and the menus follow the version directly; the open tab's name comes after the menus.
  const project = '<span class="app-brand-project"><span class="app-brand-project-name"></span><span class="app-brand-dirty">●</span></span>';
  const home = `<button class="menubar-item menubar-home" data-cmd="home" title="${escapeHtml(COMMANDS.home.tip)}" aria-pressed="false">${icon('home')}<span>시작</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const menus = Object.entries(MENUS).map(([name, menu]) => `<button class="menubar-item" data-menu="${name}" aria-haspopup="true" title="${escapeHtml(menu.label)}">${icon(menu.icon)}<span>${escapeHtml(menu.label)}</span></button>`).join('');
  const winButton = (id, glyph, label) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${winButton('minimize', 'winMinimize', '최소화')}${winButton('maximize', maximized ? 'winRestore' : 'winMaximize', maximized ? '이전 크기로' : '최대화')}${winButton('close', 'winClose', '닫기')}</div>` : '';
  bar.innerHTML = brand + home + menus + project + `<div class="menubar-drag"></div>${controls}`;
  renderDocName();
  renderHomeState();
}

function renderDocName() {
  const box = $('.app-brand-project');
  if (!box) return;
  const doc = docTabs.activeTab();
  const shown = !showingStart && doc?.name;
  box.classList.toggle('empty', !shown);
  box.classList.toggle('dirty', Boolean(shown && doc.dirty));
  box.querySelector('.app-brand-project-name').textContent = shown ? doc.name : '';
  box.title = shown ? `${doc.path ?? doc.name}${doc.dirty ? ' (수정됨)' : ''}` : '';
}

function renderHomeState() {
  const home = $('.menubar-home');
  home?.classList.toggle('current', showingStart);
  home?.setAttribute('aria-pressed', String(showingStart));
  $('#toolbar [data-cmd="home"]')?.classList.toggle('active', showingStart);
}

function menuItemsHtml(name) {
  return MENUS[name].items.map((id) => {
    if (id === '-') return '<div class="menu-sep" role="separator"></div>';
    if (id === 'recent') {
      if (!recent.length) return `<button class="menu-item" disabled><span class="menu-icon">${icon('recent')}</span><span>최근 파일 없음</span><span></span><span></span></button>`;
      return recent.slice(0, 8).map((item, i) => `<button class="menu-item" data-cmd="openRecent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}"><span class="menu-icon">${icon('ttsTextFile')}</span><span>${i + 1}. ${escapeHtml(item.name || baseName(item.path))}</span><span></span><span></span></button>`).join('');
    }
    const cmd = COMMANDS[id];
    const check = cmd.checked ? (cmd.checked() ? icon('check') : '') : '';
    return `<button class="menu-item ${id === 'exit' || id === 'deleteModel' ? 'danger' : ''}" data-cmd="${id}" ${isEnabled(id) ? '' : 'disabled'}><span class="menu-icon">${icon(cmd.icon)}</span><span>${escapeHtml(cmd.label)}</span><span class="menu-key">${escapeHtml(cmd.key ?? '')}</span><span class="menu-check">${check}</span></button>`;
  }).join('');
}

function showMenu(name) {
  const anchor = $(`#menubar [data-menu="${name}"]`);
  if (!anchor) return;
  closeMenu();
  openMenu = name;
  anchor.classList.add('open');
  const layer = document.createElement('div');
  layer.className = 'menu-layer';
  layer.innerHTML = `<div class="popup-menu" role="menu" aria-label="${escapeHtml(MENUS[name].label)}">${menuItemsHtml(name)}</div>`;
  document.body.appendChild(layer);
  const rect = anchor.getBoundingClientRect();
  const menu = layer.firstElementChild;
  menu.style.left = `${Math.min(rect.left, innerWidth - menu.offsetWidth - 4)}px`;
  menu.style.top = `${rect.bottom + 2}px`;
}

function closeMenu() {
  if (!openMenu) return;
  $(`#menubar [data-menu="${openMenu}"]`)?.classList.remove('open');
  $('.menu-layer')?.remove();
  openMenu = null;
}

// ───────────────────────── toolbar

const TOOLBAR = [
  ['newText', 'open', 'closeTab', 'save', 'saveAs'],
  ['speak', 'speakAll', 'pause', 'stop'],
  ['download', 'deleteModel', 'refresh'],
  ['resetVoice', 'resetAdvanced'],
];
const TOOLBAR_RIGHT = ['home', 'randomTheme', 'themeSettings', 'startSettings', 'guide', 'about'];
const LABELED = new Set(['speak']);

function toolButton(id) {
  const cmd = COMMANDS[id];
  const tip = `${cmd.label.replace(/…$/, '')}${cmd.key ? ` (${cmd.key})` : ''}\n${cmd.tip}`;
  const labeled = LABELED.has(id);
  return `<button class="tool-button ${labeled ? 'tool-labeled' : ''}" data-cmd="${id}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(cmd.label)}">${icon(cmd.icon)}${labeled ? `<span>${escapeHtml(cmd.label)}</span>` : ''}</button>`;
}

function renderToolbar() {
  const groups = TOOLBAR.map((group) => `<div class="tool-group">${group.map(toolButton).join('')}</div>`).join('<span class="tool-sep"></span>');
  $('#toolbar').innerHTML = `<div class="toolbar-inner"><div class="toolbar-left">${groups}</div><span class="grow"></span><div class="toolbar-left toolbar-right"><div class="tool-group">${TOOLBAR_RIGHT.map(toolButton).join('')}</div></div></div>`;
  syncToolbar();
}

function syncToolbar() {
  for (const button of $$('#toolbar [data-cmd]')) button.disabled = !isEnabled(button.dataset.cmd);
  renderHomeState();
}

// ───────────────────────── status bar extras (theme, clock)

function renderStatusExtras() {
  const theme = $('#statusTheme');
  if (theme) theme.innerHTML = `${icon('palette')}<span>${escapeHtml(themeName(settings.theme))}</span>`;
  const clock = $('#statusClock');
  if (clock) {
    const now = new Date();
    clock.innerHTML = `${icon('clock')}<span>${now.getHours() < 12 ? '오전' : '오후'} ${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}</span>`;
  }
}

// ───────────────────────── recent files

export function noteFileOpened({ filePath, content }) {
  if (!filePath) return;
  const web = !globalThis.ttsBridge;
  const entry = { path: filePath, name: baseName(filePath), web, ...(web && content && content.length < 20000 ? { content } : {}) };
  recent = [entry, ...recent.filter((item) => item.path !== filePath)].slice(0, 20);
  storage.set(RECENT_KEY, recent);
  if (showingStart) renderStartPage();
}

/** Text from a file, a sample or the recent list: into its tab (see doctabs.openDocument). */
export function openText({ text, name, path = null, language }) {
  const tab = docTabs.openDocument({ name, path, text });
  if (!tab) return null;
  showStart(false);
  actions.loadText?.(text, { name, path, language });
  return tab;
}

async function openRecent(path) {
  const item = recent.find((entry) => entry.path === path);
  if (!item) return;
  try {
    let content = item.content;
    if (content == null && globalThis.ttsBridge?.readTextFile) content = (await globalThis.ttsBridge.readTextFile(path))?.content;
    if (content == null) throw new Error('파일을 다시 읽을 수 없습니다. 열기로 다시 고르세요.');
    if (!openText({ text: content, name: item.name, path })) return;
    noteFileOpened({ filePath: path, content });
  } catch (error) {
    recent = recent.filter((entry) => entry.path !== path);
    storage.set(RECENT_KEY, recent);
    if (showingStart) renderStartPage();
    actions.showError?.(error, '최근 파일을 열지 못했습니다.');
  }
}

/** The active tab gets a name / file (or loses its "modified" mark). */
export function setDocument(name, path = null, dirty = false) {
  docTabs.updateActive({ name, path, dirty });
}

// ───────────────────────── start page

function card(id, glyph, title, body, { extra = '', bare = false, classes = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="끌어서 카드 옮기기" aria-label="끌어서 카드 옮기기">${icon('moveHandle')}</button>`;
  const grip = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';
  return `<section class="start-card start-card-${id} ${classes} ${bare ? 'bare' : ''}" data-card="${id}" ${title ? `aria-label="${escapeHtml(title)}"` : ''}>
    ${bare ? `<span class="card-handle-float">${handle}</span>` : `<h2>${handle}${icon(glyph)}<span class="start-card-title">${escapeHtml(title)}</span><span class="grow"></span>${extra}</h2>`}
    <div class="card-body">${body}</div>
    <span class="card-resize" data-card-resize="${id}" title="끌어서 카드 크기 바꾸기 (두 번 누르면 내용에 맞춤)">${grip}</span>
  </section>`;
}

const tile = (start, glyph, label, tip, { value = '', cls = 'start-tile' } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}">${icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;

function actionsBody() {
  const items = [
    ['newText', 'ttsNewText', '새 텍스트', '빈 편집기에서 시작합니다'],
    ['open', 'folderOpen', '열기…', '텍스트 파일(.txt, .md)을 엽니다'],
    ['editor', 'ttsSpeak', '편집기로', '지금 텍스트로 돌아가 읽습니다'],
    ['download', 'ttsDownload', '모델 다운로드', '선택한 모델을 설치합니다'],
    ['theme-settings', 'palette', '테마 설정', '테마를 고르고 색을 바꿉니다'],
    ['random-theme', 'dice', '무작위 테마', '다른 테마를 무작위로 고릅니다'],
    ['start-settings', 'home', '시작 화면 설정', '시작 화면에 보일 항목을 고릅니다'],
    ['guide', 'ttsGuide', '사용 설명서', '기능과 사용법을 별도 창에서 봅니다 (F1)'],
    ['tutorial', 'ttsTutorial', '튜토리얼', '처음부터 따라 하며 배웁니다'],
    ['about', 'info', '프로그램 정보', '버전과 지원 모델을 봅니다'],
    ['exit', 'exit', '종료', '프로그램을 닫습니다'],
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip]) => tile(start, glyph, label, tip)).join('')}</div>`;
}

function recentBody() {
  const items = recent.slice(0, settings.startRecentCount);
  const rows = items.length ? items.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon('ttsTextFile')}<span class="name">${escapeHtml(item.name || baseName(item.path))}</span><span class="path">${escapeHtml(item.web ? '브라우저에서 연 파일' : item.path)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${escapeHtml(item.path)}" title="목록에서 지우기" aria-label="목록에서 지우기">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>최근에 연 텍스트 파일이 없습니다.</span></div>`;
  return `<h3 class="start-sub">${icon('recent')}<span>최근 파일</span><span class="grow"></span>${items.length ? `<button class="small-button danger" data-start="clear-recent" title="최근 파일 지우기">${icon('clearHistory')}<span>지우기</span></button>` : ''}</h3><div class="start-list">${rows}</div>`;
}

function modelsBody() {
  const models = actions.models?.() ?? [];
  if (!models.length) return `<div class="start-empty">${icon('info')}<span>모델 목록을 읽는 중입니다…</span></div>`;
  const current = document.getElementById('modelSelect')?.value;
  return `<div class="template-grid">${models.map((m) => {
    const status = m.downloaded ? '설치됨' : '미설치';
    const tip = `${m.language} · ${m.sizeHint ?? ''} · ${status}${m.description ? ` · ${m.description}` : ''}`;
    return `<button type="button" class="start-tile template-tile model-tile ${m.downloaded ? 'installed' : ''} ${m.id === current ? 'on' : ''}" data-start="model" data-value="${escapeHtml(m.id)}" title="${escapeHtml(tip)}">${icon(m.downloaded ? 'ttsModel' : 'ttsDownload')}<b>${escapeHtml(m.label)}<span class="model-badge">${status}</span></b><small>${escapeHtml(`${m.language} · ${m.sizeHint ?? ''} · ${m.runtime ?? ''}`)}</small></button>`;
  }).join('')}</div>`;
}

function samplesBody() {
  return `<div class="sample-groups">${SAMPLE_GROUPS.map((group) => {
    const items = SAMPLES.filter((sample) => sample.group === group.id);
    return `<section class="sample-group"><h3>${icon(group.icon)}<span>${escapeHtml(group.label)}</span><span class="sample-count">${items.length}</span></h3>
      <div class="sample-tiles">${items.map((sample) => tile('sample', sample.icon, sample.title, sample.tip, { value: sample.id })).join('')}</div></section>`;
  }).join('')}</div>`;
}

function themeTile(theme, action = 'pick-theme') {
  const on = settings.theme === theme.id;
  return `<button type="button" role="radio" aria-checked="${on}" class="bg-tile st-theme-tile ${on ? 'on' : ''}" data-start="${action}" data-value="${theme.id}" title="${escapeHtml(theme.name.ko)}">
    <span class="st-theme-chip" aria-hidden="true" style="background:${theme.swatch[0]};border-color:${theme.swatch[2]}"><i style="background:${theme.swatch[1]}"></i><i style="background:${theme.swatch[2]}"></i></span><span>${escapeHtml(theme.name.ko)}</span></button>`;
}

function themeBody() {
  const group = (kind, glyph, label, themes) => `<section class="sample-group" data-theme-kind="${kind}"><h3>${icon(glyph)}<span>${escapeHtml(label)}</span><span class="sample-count">${themes.length}</span></h3><div class="bg-grid st-theme-tiles" role="radiogroup" aria-label="${escapeHtml(label)}">${themes.map((theme) => themeTile(theme)).join('')}</div></section>`;
  return `<div class="sample-groups">${group('dark', 'moon', '어두운 테마', DARK_THEMES)}${group('light', 'sun', '밝은 테마', LIGHT_THEMES)}</div>`;
}

function backgroundBody() {
  return `<div class="anim-chips bg-grid" role="radiogroup">${ANIMATIONS.map((kind) => `<button class="anim-chip bg-tile ${settings.animation === kind ? 'active on' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(ANIMATION_NAMES[kind])}">${icon(animationIcon(kind))}<span>${escapeHtml(ANIMATION_NAMES[kind])}</span></button>`).join('')}</div>
    <div class="start-controls">
      <button class="start-btn" data-start="shuffle" title="움직이는 배경 바꾸기">${icon('dice')}<span>움직이는 배경 바꾸기</span></button>
      <label class="start-speed" title="움직임 속도">${icon('speed')}<span>움직임 속도</span><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-start-speed /><output>${settings.animationSpeed}%</output></label>
      <label class="start-speed" title="카드 불투명도">${icon('opacity')}<span>카드 불투명도</span><input type="range" min="20" max="100" step="5" value="${settings.startCardOpacity}" data-start-opacity /><output>${settings.startCardOpacity}%</output></label>
      <label class="start-check" title="프로그램을 시작할 때마다 다른 움직이는 배경을 무작위로 고릅니다"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>시작할 때 무작위</span></label>
      <label class="start-interval" title="시작 화면이 열려 있는 동안 정한 시간마다 배경을 다른 것으로 자동으로 바꿉니다">${icon('clock')}<span>자동 변경</span><select data-start-interval aria-label="자동 변경">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
    </div>`;
}

function startPageHtml() {
  const hero = `
    <img src="${APP_ICON}" alt="" class="start-icon" />
    <div class="start-hero-text">
      <h1><span>${APP_NAME}</span> <small>v${VERSION}</small></h1>
      <p>한국어와 영어 문장을 설치한 ONNX·sherpa-onnx 모델로 직접 합성해 읽고, 파형을 보며 WAV·MP3로 저장합니다.</p>
    </div>
    <div class="start-hero-actions">
      <div class="start-docs" role="group" aria-label="빠른 시작">
        <button class="button big doc-button" data-start="guide" title="기능과 사용법을 별도 창에서 봅니다 (F1)">${icon('ttsGuide')}<span>사용 설명서</span></button>
        <button class="button big doc-button" data-start="tutorial" title="처음부터 따라 하며 배웁니다">${icon('ttsTutorial')}<span>튜토리얼</span></button>
        <button class="button big doc-button" data-start="about" title="버전과 지원 모델을 봅니다">${icon('info')}<span>프로그램 정보</span></button>
      </div>
      <button class="button primary big" data-start="editor" title="편집기로 가서 텍스트를 읽습니다">${icon('ttsSpeak')}<span>텍스트 읽기 시작</span></button>
    </div>`;
  const models = actions.models?.() ?? [];
  const cards = [
    card('actions', 'launcher', '바로 가기', actionsBody()),
    settings.startShowRecent ? card('recent', 'recent', '최근 항목', recentBody()) : '',
    settings.startShowModels ? card('models', 'ttsModel', '음성 모델', modelsBody(), { extra: `<span class="start-card-note">${models.filter((m) => m.downloaded).length}/${models.length} 설치됨</span>` }) : '',
    settings.startShowSamples ? card('samples', 'samples', '예제 텍스트', samplesBody(), { extra: `<span class="start-card-note">${SAMPLES.length}</span>` }) : '',
    card('theme', 'palette', '테마', themeBody(), { extra: `<button class="start-btn small" data-start="theme-settings" title="테마를 고르고 색을 바꿉니다">${icon('gear')}<span>테마 설정</span></button>` }),
    settings.startShowBackground ? card('background', 'sparkles', '움직이는 배경', backgroundBody()) : '',
  ];
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner" style="--start-card-alpha:${settings.startCardOpacity}%">
        <div class="start-tools">
          <label class="start-btn start-startup check-row" title="시작할 때 시작 화면 표시"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>시작할 때 시작 화면 표시</span></label>
          <button class="start-btn" data-start="start-settings" title="시작 화면에 보일 항목을 고릅니다">${icon('gear')}<span>시작 화면 설정</span></button>
          <button class="start-btn" data-start="arrange" title="카드를 처음 배치로 되돌립니다">${icon('launcher')}<span>자동 정렬</span></button>
        </div>
        <section class="start-card start-card-hero start-hero bare fixed" data-fixed-card="hero" aria-label="${APP_NAME}"><div class="card-body">${hero}</div></section>
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">${icon('info')}<span class="grow">${APP_NAME} v${VERSION}</span><span class="muted">© SHKWON(knix008@naver.com)</span></footer>
      </div>
    </div>`;
}

function backgroundColors() {
  const theme = currentTheme();
  return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' };
}

function renderStartPage() {
  const host = $('#start-page');
  if (!host) return;
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml();
  startCards = startBoard(host.querySelector('.start-board'), {
    saved: settings.startLayout,
    reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    onSave: (layout) => { settings.startLayout = layout; saveSettings(); },
  });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  const canvas = host.querySelector('.start-bg');
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => settings.animationSpeed / 100, kind: settings.animation, vivid: true });
  startBackground.start();
}

export function showStart(show = true) {
  closeMenu();
  showingStart = show;
  $('#app').classList.toggle('on-start', show);
  const host = $('#start-page');
  host.hidden = !show;
  if (show) { backgroundChangedAt = Date.now(); renderStartPage(); } else { startCards?.destroy(); startCards = null; startBackground?.destroy(); startBackground = null; host.innerHTML = ''; }
  renderDocName();
  renderHomeState();
  if (!show) requestAnimationFrame(() => actions.onEditorShown?.());
}

export const isStartShown = () => showingStart;

function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'newText': return runCommand('newText');
    case 'open': return runCommand('open');
    case 'guide': return runCommand('guide');
    case 'tutorial': return runCommand('tutorial');
    case 'editor': return showStart(false);
    case 'download': return runCommand('download');
    case 'about': return runCommand('about');
    case 'exit': return runCommand('exit');
    case 'open-recent': return openRecent(value);
    case 'remove-recent': recent = recent.filter((item) => item.path !== value); storage.set(RECENT_KEY, recent); return renderStartPage();
    case 'clear-recent': return runCommand('clearRecent');
    case 'model': {
      const select = document.getElementById('modelSelect');
      if (select && select.value !== value) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }
      return showStart(false);
    }
    case 'sample': {
      const sample = SAMPLES.find((item) => item.id === value);
      if (!sample) return undefined;
      openText({ text: sample.text, name: `예제 · ${sample.title}`, language: SAMPLE_GROUPS.find((g) => g.id === sample.group)?.language });
      return undefined;
    }
    case 'arrange': return startCards?.arrange();
    case 'pick-theme': return updateSettings({ theme: value });
    case 'random-theme': return runCommand('randomTheme');
    case 'theme-settings': return openThemeDialog();
    case 'start-settings': return openStartSettings();
    case 'animation': updateSettings({ animation: value }); return actions.status?.(`움직이는 배경: ${ANIMATION_NAMES[value]}`);
    case 'shuffle': {
      const next = startBackground?.shuffle() ?? ANIMATIONS[0];
      updateSettings({ animation: next });
      return actions.status?.(`움직이는 배경: ${ANIMATION_NAMES[next]}`);
    }
    default: return undefined;
  }
}

function rotateStartBackground() {
  backgroundChangedAt = Date.now();
  const others = ANIMATIONS.filter((kind) => kind !== settings.animation);
  const next = others[Math.floor(Math.random() * others.length)];
  const canvas = $('#start-page .start-bg');
  canvas?.classList.add('fading');
  setTimeout(() => {
    settings.animation = next;
    saveSettings();
    startBackground?.setKind(next);
    for (const chip of $$('#start-page [data-start="animation"]')) {
      const on = chip.dataset.value === next;
      chip.classList.toggle('on', on); chip.classList.toggle('active', on); chip.setAttribute('aria-checked', String(on));
    }
    $('#start-page .start-bg')?.classList.remove('fading');
  }, 450);
}

function tickStartBackground() {
  if (!showingStart || !settings.animationInterval || document.hidden) { backgroundChangedAt = Date.now(); return; }
  if (Date.now() - backgroundChangedAt >= settings.animationInterval * 1000) rotateStartBackground();
}

// ───────────────────────── popups (theme settings, start page settings)

function popup(id, glyph, title, body, foot, { wide = false } = {}) {
  let dialog = document.getElementById(id);
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = `app-dialog ${wide ? 'wide' : ''}`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }
  dialog.innerHTML = `<div class="popup">
    <header class="popup-head"><h2>${icon(glyph)}<span>${escapeHtml(title)}</span></h2><button type="button" class="window-button close" data-close title="닫기" aria-label="닫기">${icon('winClose')}</button></header>
    <div class="popup-body">${body}</div>
    <footer class="popup-foot">${foot}</footer>
  </div>`;
  dialog.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  if (!dialog.open) dialog.showModal();
  return dialog;
}

function themeDialogBody() {
  const custom = settings.customTheme ?? customFrom(currentTheme());
  const special = [
    { id: SYSTEM, name: { ko: '시스템 설정' }, swatch: resolveTheme(SYSTEM, prefersDark()).swatch },
    resolveTheme(CUSTOM, false, custom),
  ];
  const group = (glyph, label, themes) => `<section class="sample-group"><h3>${icon(glyph)}<span>${escapeHtml(label)}</span><span class="sample-count">${themes.length}</span></h3><div class="bg-grid st-theme-tiles" role="radiogroup">${themes.map((theme) => themeTile(theme, 'dlg-theme')).join('')}</div></section>`;
  const colors = CUSTOM_KEYS.map((key) => `<label class="custom-color"><input type="color" value="${custom[key]}" data-custom-key="${key}" /><span>${escapeHtml(CUSTOM_LABELS[key])}</span></label>`).join('');
  return `<div class="theme-dialog sample-groups">
    ${group('gear', '기본', special)}
    ${group('moon', '어두운 테마', DARK_THEMES)}
    ${group('sun', '밝은 테마', LIGHT_THEMES)}
    <section class="sample-group custom-editor ${settings.theme === CUSTOM ? '' : 'inactive'}"><h3>${icon('palette')}<span>사용자 정의 색</span><span class="grow"></span>
      <label class="start-check"><input type="checkbox" data-custom-dark ${custom.dark ? 'checked' : ''} /><span>어두운 테마</span></label>
      <button class="small-button" data-theme-copy title="지금 보이는 테마의 색을 사용자 정의 색으로 가져옵니다">${icon('copy')}<span>현재 테마 색 가져오기</span></button></h3>
      <div class="custom-colors">${colors}</div>
      <p class="muted custom-hint">색을 바꾸면 사용자 정의 테마가 바로 적용됩니다.</p>
    </section>
  </div>`;
}

function openThemeDialog() {
  closeMenu();
  const dialog = popup('themeDialog', 'palette', '테마 설정', themeDialogBody(),
    `<span class="muted">테마 ${LIGHT_THEMES.length + DARK_THEMES.length}개 · 시스템 설정 · 사용자 정의</span><span class="grow"></span><button class="button" data-random title="다른 테마를 무작위로 고릅니다">${icon('dice')}<span>무작위</span></button><button class="button primary" data-close>${icon('check')}<span>닫기</span></button>`, { wide: true });
  const refresh = () => {
    const scroll = dialog.querySelector('.popup-body').scrollTop;
    dialog.querySelector('.popup-body').innerHTML = themeDialogBody();
    dialog.querySelector('.popup-body').scrollTop = scroll;
  };
  dialog.onclick = (event) => {
    if (event.target === dialog) return dialog.close();
    const pick = event.target.closest('[data-start="dlg-theme"]');
    if (pick) { updateSettings({ theme: pick.dataset.value }); return refresh(); }
    if (event.target.closest('[data-random]')) { updateSettings({ theme: randomThemeId(settings.theme) }); return refresh(); }
    if (event.target.closest('[data-theme-copy]')) { updateSettings({ customTheme: customFrom(currentTheme()), theme: CUSTOM }); return refresh(); }
    return undefined;
  };
  dialog.oninput = (event) => {
    const key = event.target.dataset.customKey;
    if (key) updateSettings({ customTheme: { ...(settings.customTheme ?? customFrom(currentTheme())), [key]: event.target.value }, theme: CUSTOM });
  };
  dialog.onchange = (event) => {
    if (event.target.matches('[data-custom-dark]')) { updateSettings({ customTheme: { ...(settings.customTheme ?? customFrom(currentTheme())), dark: event.target.checked }, theme: CUSTOM }); refresh(); }
    else if (event.target.dataset.customKey) refresh();
  };
}

function openStartSettings() {
  closeMenu();
  const check = (key, glyph, label) => `<label class="row check-line"><span class="row-label">${icon(glyph)}<span>${escapeHtml(label)}</span></span><span class="row-control"><input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''} /></span></label>`;
  const body = `<div class="settings-rows">
    ${check('showStartPage', 'home', '시작할 때 시작 화면 표시')}
    ${check('startShowRecent', 'recent', '최근 항목 카드')}
    ${check('startShowModels', 'ttsModel', '음성 모델 카드')}
    ${check('startShowSamples', 'samples', '예제 텍스트 카드')}
    ${check('startShowBackground', 'sparkles', '움직이는 배경 카드')}
    <label class="row"><span class="row-label">${icon('recent')}<span>최근 파일 개수</span></span><span class="row-control"><input type="number" min="1" max="20" value="${settings.startRecentCount}" data-setting-number="startRecentCount" /></span></label>
    <label class="row"><span class="row-label">${icon('opacity')}<span>카드 불투명도</span></span><span class="row-control"><input type="range" min="20" max="100" step="5" value="${settings.startCardOpacity}" data-setting-number="startCardOpacity" /><output>${settings.startCardOpacity}%</output></span></label>
    <label class="row"><span class="row-label">${icon('speed')}<span>움직임 속도</span></span><span class="row-control"><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-setting-number="animationSpeed" /><output>${settings.animationSpeed}%</output></span></label>
  </div>`;
  const dialog = popup('startSettingsDialog', 'home', '시작 화면 설정', body,
    `<button class="button" data-arrange>${icon('launcher')}<span>카드 자동 정렬</span></button><span class="grow"></span><button class="button primary" data-close>${icon('check')}<span>닫기</span></button>`);
  dialog.onchange = (event) => {
    const key = event.target.dataset.setting;
    if (key) updateSettings({ [key]: event.target.checked });
  };
  dialog.oninput = (event) => {
    const key = event.target.dataset.settingNumber;
    if (!key) return;
    const value = Number(event.target.value);
    const out = event.target.parentElement.querySelector('output');
    if (out) out.textContent = `${value}%`;
    updateSettings({ [key]: value });
  };
  dialog.onclick = (event) => {
    if (event.target === dialog) dialog.close();
    if (event.target.closest('[data-arrange]')) { updateSettings({ startLayout: null }); startCards?.arrange(); }
  };
}

// ───────────────────────── user guide window

/** doc/UsersGuide*.md or doc/Tutorial*.md in the guide window (desktop) or a browser tab (web). */
export function openGuide(doc = 'guide') {
  if (globalThis.ttsBridge?.openGuide) {
    return globalThis.ttsBridge.openGuide({ doc, lang: 'ko' }).catch((error) => actions.showError?.(error, '사용 설명서를 열지 못했습니다.'));
  }
  globalThis.open(`guide.html?doc=${doc}`, 'tts-guide');
  return undefined;
}

// ───────────────────────── context menus (editor, text tabs)

async function readClipboardText() {
  if (globalThis.ttsBridge?.readClipboard) return globalThis.ttsBridge.readClipboard();
  return navigator.clipboard?.readText?.() ?? '';
}

function editorMenu(textarea, x, y) {
  const selected = textarea.selectionStart !== textarea.selectionEnd;
  const edit = (command, value) => () => { textarea.focus(); document.execCommand(command, false, value); };
  showContextMenu(x, y, [
    { label: '실행 취소', icon: 'undo', key: 'Ctrl+Z', run: edit('undo') },
    { label: '다시 실행', icon: 'redo', key: 'Ctrl+Y', run: edit('redo') },
    '-',
    { label: '잘라내기', icon: 'cut', key: 'Ctrl+X', disabled: !selected, run: edit('cut') },
    { label: '복사', icon: 'copy', key: 'Ctrl+C', disabled: !selected, run: edit('copy') },
    { label: '붙여넣기', icon: 'paste', key: 'Ctrl+V', run: async () => { const text = await readClipboardText(); if (text) edit('insertText', text)(); } },
    { label: '모두 선택', icon: 'ttsSelectAll', key: 'Ctrl+A', run: () => { textarea.focus(); textarea.select(); } },
    '-',
    { label: '읽기', icon: 'play', key: 'F5', disabled: !isEnabled('speak'), run: () => runCommand('speak') },
    { label: '모든 화자로 생성', icon: 'ttsVoice', key: 'Shift+F5', disabled: !isEnabled('speakAll'), run: () => runCommand('speakAll') },
    '-',
    { label: '텍스트 모두 지우기', icon: 'ttsEraser', danger: true, disabled: !textarea.value, run: () => { textarea.focus(); textarea.select(); document.execCommand('delete'); } },
  ], '편집기 메뉴');
}

function tabMenu(id, x, y) {
  const many = docTabs.allTabs().length > 1;
  showContextMenu(x, y, [
    { label: '새 텍스트 탭', icon: 'ttsNewText', key: 'Ctrl+N', run: () => runCommand('newText') },
    { label: '열기…', icon: 'folderOpen', key: 'Ctrl+O', run: () => runCommand('open') },
    '-',
    { label: '탭 닫기', icon: 'closeTab', key: 'Ctrl+W', run: () => docTabs.closeTab(id) },
    { label: '다른 탭 모두 닫기', icon: 'ttsCloseOthers', disabled: !many, run: () => docTabs.closeOthers(id) },
  ], '탭 메뉴');
}

function installContextMenus() {
  const textarea = $('#textInput');
  textarea?.addEventListener('contextmenu', (event) => { event.preventDefault(); editorMenu(textarea, event.clientX, event.clientY); });
  $('#docTabs')?.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const tab = event.target.closest('[data-doc-tab]');
    tabMenu(tab ? Number(tab.dataset.docTab) : docTabs.activeTab()?.id, event.clientX, event.clientY);
  });
}

// ───────────────────────── init

/** Builds the window chrome. `actions` are main.js callbacks (see the calls above). */
export function initShell(given) {
  actions = given;
  // Static markup names its icons with <i data-i="…">; they become the coloured SVG icons.
  for (const el of $$('i[data-i]')) el.outerHTML = icon(el.dataset.i, el.dataset.class || 'icon');
  if (settings.animationRandom) {
    const others = ANIMATIONS.filter((kind) => kind !== settings.animation);
    settings.animation = others[Math.floor(Math.random() * others.length)];
    saveSettings();
  }
  applyCurrentTheme();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (settings.theme === SYSTEM) applyCurrentTheme(); });
  renderMenubar();
  renderToolbar();
  renderStatusExtras();
  $('#app').classList.toggle('no-status', !settings.showStatusBar);
  installTooltips(document);

  // Toolbar buttons follow the enabled state of the buttons they mirror.
  const observer = new MutationObserver(() => syncToolbar());
  for (const id of Object.values(MIRRORS)) {
    const target = document.getElementById(id);
    if (target) observer.observe(target, { attributes: true, attributeFilter: ['disabled'] });
  }

  document.addEventListener('click', (event) => {
    const menuButton = event.target.closest('#menubar [data-menu]');
    if (menuButton) { const name = menuButton.dataset.menu; return openMenu === name ? closeMenu() : showMenu(name); }
    const cmd = event.target.closest('[data-cmd]');
    if (cmd && !cmd.disabled && (cmd.closest('#menubar, #toolbar, .menu-layer, #statusbar, .panel-header, #docTabs'))) return runCommand(cmd.dataset.cmd, cmd.dataset.value);
    const win = event.target.closest('[data-window]');
    if (win) return globalThis.ttsBridge?.windowControl(win.dataset.window === 'maximize' ? 'toggleMaximize' : win.dataset.window);
    const start = event.target.closest('#start-page [data-start]');
    if (start && !(start.matches('input, select'))) return onStartAction(start);
    if (openMenu && !event.target.closest('.popup-menu')) closeMenu();
    return undefined;
  });
  document.addEventListener('pointerdown', (event) => { if (openMenu && !event.target.closest('.popup-menu, #menubar [data-menu]')) closeMenu(); }, true);
  document.addEventListener('pointerover', (event) => {
    const item = event.target.closest?.('#menubar [data-menu]');
    if (openMenu && item && item.dataset.menu !== openMenu) showMenu(item.dataset.menu);
  });
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);

  // Start page controls that are inputs.
  document.addEventListener('input', (event) => {
    const t = event.target;
    if (!t.closest('#start-page')) return;
    if (t.matches('[data-start-speed]')) { settings.animationSpeed = Number(t.value); saveSettings(); t.nextElementSibling.textContent = `${t.value}%`; }
    if (t.matches('[data-start-opacity]')) { settings.startCardOpacity = Number(t.value); saveSettings(); t.nextElementSibling.textContent = `${t.value}%`; $('#start-page .start-inner')?.style.setProperty('--start-card-alpha', `${t.value}%`); }
  });
  document.addEventListener('change', (event) => {
    const t = event.target;
    if (!t.closest('#start-page')) return;
    if (t.matches('[data-start-toggle]')) { settings.showStartPage = t.checked; saveSettings(); }
    if (t.matches('[data-start-random]')) { settings.animationRandom = t.checked; saveSettings(); }
    if (t.matches('[data-start-interval]')) { settings.animationInterval = Number(t.value); backgroundChangedAt = Date.now(); saveSettings(); }
  });

  document.addEventListener('keydown', (event) => {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape' && openMenu) { closeMenu(); return; }
    let id = null;
    if (ctrl && !event.shiftKey && key === 'n') id = 'newText';
    else if (ctrl && !event.shiftKey && key === 'o') id = 'open';
    else if (ctrl && !event.shiftKey && key === 'w') id = 'closeTab';
    else if (ctrl && event.key === 'Tab' && !showingStart) { event.preventDefault(); docTabs.cycle(event.shiftKey ? -1 : 1); return; }
    else if (ctrl && event.key === 'Home') id = 'home';
    else if (!ctrl && event.shiftKey && event.key === 'F5') id = 'speakAll';
    else if (!ctrl && event.key === 'F5') id = 'speak';
    else if (!ctrl && event.key === 'F6') id = 'pause';
    else if (!ctrl && event.key === 'F7') id = 'stop';
    else if (!ctrl && event.key === 'F1') id = 'guide';
    if (!id) return;
    event.preventDefault();
    runCommand(id);
  });

  docTabs.initDocTabs($('#docTabs'), $('#textInput'), {
    onChange: () => renderDocName(),
    canSwitch: () => actions.canSwitchTab?.() ?? true,
    captureAudio: () => actions.captureTabAudio?.() ?? null,
    restoreAudio: (saved) => actions.restoreTabAudio?.(saved),
    onSwitched: (tab) => actions.onTabSwitched?.(tab),
    confirmClose: (tab) => actions.confirm?.('탭 닫기', `「${tab.name}」 탭의 텍스트를 닫을까요?\n저장하지 않은 텍스트는 사라집니다.`, { okLabel: '닫기' }) ?? Promise.resolve(true),
    status: (message) => actions.status?.(message),
  });
  installContextMenus();

  // The resize grip: the system sizing loop on the desktop, a plain marker in a browser.
  const grip = $('#resizeGrip');
  if (grip) {
    if (desktop) grip.addEventListener('pointerdown', (event) => { if (event.button === 0) { event.preventDefault(); globalThis.ttsBridge.windowControl('startResize'); } });
    else grip.classList.add('static');
  }

  const windowState = (value) => { maximized = Boolean(value?.maximized); $('#app').classList.toggle('maximized', maximized); renderMenubar(); };
  globalThis.ttsBridge?.onWindowState?.(windowState);
  globalThis.ttsBridge?.windowState?.().then(windowState).catch(() => {});

  setInterval(renderStatusExtras, 15000);
  setInterval(tickStartBackground, 1000);
  setInterval(syncToolbar, 1000);
  showStart(settings.showStartPage);
}

/** main.js tells the shell that the model list changed (the start page shows the models). */
export function modelsChanged() {
  syncToolbar();
  if (showingStart && settings.startShowModels) renderStartPage();
}

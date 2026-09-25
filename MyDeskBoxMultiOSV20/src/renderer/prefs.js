'use strict';

// 프로그램 전체 설정 창. 박스 하나의 설정은 settings.js 가 맡는다.
// 여기서 고친 것은 모든 박스와 다음에 만들 박스에 걸린다.
//
// 창 크기는 고정이다. 항목을 탭으로 나눠 어느 탭에서도 스크롤 막대가 생기지 않게 한다.

const el = (name) => document.getElementById(name);
const themesEl = el('themes');
const cornerEl = el('corner');
const cornerOut = el('cornerOut');
const opacityEl = el('opacity');
const opacityOut = el('opacityOut');

let lang = window.DeskI18n.DEFAULT_LANG;
let settings = null;
// 우리가 보낸 값이 되돌아와 손을 방해하지 않도록 잠깐 막는다.
let holding = false;

const say = (key) => window.DeskI18n.t(lang, key);
const pick = (label) => (label && (label[lang] || label.ko)) || '';

function send(patch) {
  desk.prefsChange(patch);
}

// ── 탭 ────────────────────────────────────────────────────────────────────

const TABS = [
  ['general', 'prefs.general'],
  ['look', 'prefs.look'],
  ['files', 'prefs.folders'],
  ['about', 'tray.about'],
];

function showTab(name) {
  for (const button of document.querySelectorAll('.tab')) {
    button.setAttribute('aria-selected', String(button.dataset.tab === name));
  }
  for (const pane of document.querySelectorAll('.pane')) {
    pane.hidden = pane.dataset.pane !== name;
  }
}

for (const button of document.querySelectorAll('.tab')) {
  button.addEventListener('click', () => showTab(button.dataset.tab));
}

showTab('general');

// ── 고르는 것들 ───────────────────────────────────────────────────────────

function paintRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const ratio = max === min ? 0 : (Number(input.value) - min) / (max - min);
  input.style.setProperty('--fill', `${Math.round(ratio * 100)}%`);
}

// 고르는 단추 줄. 언어와 '한 번/두 번 눌러 열기'가 이것을 쓴다.
function drawChips(host, rows, current, onPick) {
  host.textContent = '';
  for (const row of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = row.label;
    button.setAttribute('aria-checked', String(row.id === current));
    button.addEventListener('click', () => onPick(row.id));
    host.appendChild(button);
  }
}

function drawThemes(list, current) {
  themesEl.textContent = '';
  for (const theme of list) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.title = pick(theme.label);
    button.style.background = theme.bg;
    button.setAttribute('aria-checked', String(theme.id === current));
    const bar = document.createElement('span');
    bar.style.cssText = `position:absolute;inset:0 0 auto 0;height:34%;background:${theme.bar}`;
    button.appendChild(bar);
    button.addEventListener('click', () => send({ theme: theme.id }));
    themesEl.appendChild(button);
  }
}

function drawAbout(about) {
  if (!about) return;
  if (about.icon) el('aboutMark').src = about.icon;
  el('aboutName').textContent = about.name || 'MyDeskBox';
  const rows = el('aboutRows');
  rows.textContent = '';
  const add = (tag, value) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = tag;
    const dd = document.createElement('dd');
    dd.textContent = value;
    rows.append(dt, dd);
  };
  add(say('about.version'), about.version);
  add(say('about.made'), about.author);
  add(say('about.mail'), about.email);
}

function step(kind, by) {
  const input = kind === 'corner' ? cornerEl : opacityEl;
  const next = Number(input.value) + by * Number(input.step || 1);
  input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), next)));
  paintRange(input);
  apply(kind);
}

function apply(kind) {
  if (kind === 'corner') {
    cornerOut.textContent = `${cornerEl.value}px`;
    send({ corner: Number(cornerEl.value) });
  } else {
    opacityOut.textContent = `${opacityEl.value}%`;
    send({ opacity: Number(opacityEl.value) / 100 });
  }
}

desk.onPrefs((payload) => {
  if (!payload) return;
  lang = payload.lang || lang;
  settings = payload.settings;

  el('heading').textContent = say('prefs.title');
  document.title = say('prefs.title');
  // 제목 줄에는 설정을 뜻하는 톱니바퀴를 둔다.
  if (payload.gear) el('mark').src = payload.gear;
  for (const [name, key] of TABS) {
    const button = document.querySelector(`.tab[data-tab="${name}"]`);
    if (button) button.textContent = say(key);
  }
  el('langTag').textContent = say('tray.language');
  el('startupTag').textContent = say('tray.startup');
  el('openTag').textContent = say('tray.openWith');
  el('shadowTag').textContent = say('settings.shadow');
  el('themeTag').textContent = say('tray.newTheme');
  el('cornerTag').textContent = say('tray.newCorner');
  el('opacityTag').textContent = say('tray.newOpacity');
  el('folderTag').textContent = say('prefs.open');
  el('whereTag').textContent = say('prefs.where');
  el('backTag').textContent = say('prefs.desktop');
  el('boxRoot').textContent = say('tray.boxRoot');
  el('dataRoot').textContent = say('tray.folder');
  el('putBack').textContent = say('tray.putBack');
  el('where').textContent = payload.boxRoot || '';
  el('ok').textContent = say('settings.ok');
  el('close').title = say('settings.ok');
  for (const button of document.querySelectorAll('.step')) {
    button.title = say(button.dataset.act.endsWith('-') ? 'settings.less' : 'settings.more');
  }

  drawChips(el('langs'), payload.langs, settings.lang, (id) => send({ lang: id }));
  drawChips(
    el('opens'),
    [{ id: 'double', label: say('tray.openDouble') }, { id: 'single', label: say('tray.openSingle') }],
    settings.openWith,
    (id) => send({ openWith: id })
  );
  drawThemes(payload.themes, settings.theme);
  drawAbout(payload.about);
  el('startup').setAttribute('aria-checked', String(!!settings.openAtLogin));
  el('shadow').setAttribute('aria-checked', String(!!settings.shadow));

  if (!holding) {
    cornerEl.min = String(payload.corner.min);
    cornerEl.max = String(payload.corner.max);
    cornerEl.step = '1';
    cornerEl.value = String(settings.corner);
    cornerOut.textContent = `${settings.corner}px`;
    paintRange(cornerEl);

    opacityEl.min = String(Math.round(payload.opacity.min * 100));
    opacityEl.max = String(Math.round(payload.opacity.max * 100));
    opacityEl.step = '1';
    opacityEl.value = String(Math.round(settings.opacity * 100));
    opacityOut.textContent = `${opacityEl.value}%`;
    paintRange(opacityEl);
  }
});

for (const [input, kind] of [[cornerEl, 'corner'], [opacityEl, 'opacity']]) {
  input.addEventListener('pointerdown', () => { holding = true; });
  input.addEventListener('pointerup', () => { holding = false; });
  input.addEventListener('input', () => {
    paintRange(input);
    apply(kind);
  });
}

for (const button of document.querySelectorAll('.step')) {
  button.addEventListener('click', () => {
    const act = button.dataset.act;
    step(act.slice(0, -1), act.endsWith('+') ? 1 : -1);
  });
}

el('startup').addEventListener('click', () => send({ openAtLogin: !settings.openAtLogin }));
el('shadow').addEventListener('click', () => send({ shadow: !settings.shadow }));
el('boxRoot').addEventListener('click', () => desk.prefsOpen('boxes'));
el('dataRoot').addEventListener('click', () => desk.prefsOpen('data'));
el('putBack').addEventListener('click', () => desk.prefsOpen('putBack'));
el('ok').addEventListener('click', () => desk.prefsClose());
el('close').addEventListener('click', () => desk.prefsClose());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter') desk.prefsClose();
});

desk.prefsReady();

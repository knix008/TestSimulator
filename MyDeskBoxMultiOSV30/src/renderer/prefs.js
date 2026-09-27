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
  ['rules', 'prefs.rules'],
  ['pages', 'prefs.pages'],
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

// ── 규칙·페이지·스냅샷 목록 ───────────────────────────────────────────────
//
// 몇 개가 될지 알 수 없는 것들이다. 줄마다 손으로 고치고 지울 수 있어야 하므로
// 값이 올 때마다 그 자리에서 다시 그린다. 글을 적고 있는 줄만 건드리지 않는다.
// 글자 하나마다 다시 그리면 커서가 튀어 이름을 적을 수 없다.

function edit(payload) {
  return desk.prefsEdit(payload);
}

function line() {
  const row = document.createElement('div');
  row.className = 'line';
  return row;
}

function emptyLine(text) {
  const row = document.createElement('div');
  row.className = 'empty';
  row.textContent = text;
  return row;
}

function miniButton(className, text, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini ' + className;
  button.textContent = text;
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

function selectOf(rows, current, onPick) {
  const box = document.createElement('select');
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = row.label;
    if (row.id === current) option.selected = true;
    box.appendChild(option);
  }
  box.addEventListener('change', () => onPick(box.value));
  return box;
}

// 고치고 있는 입력칸이 이 목록 안에 있는가.
function busy(host) {
  const at = document.activeElement;
  return !!(at && host.contains(at) && at.tagName === 'INPUT');
}

// 규칙 한 줄: 무엇을 볼지, 어떤 값일 때, 어느 박스로.
function drawRules(payload) {
  const host = el('rules');
  if (busy(host)) return;
  host.textContent = '';
  if (!payload.boxes.length) {
    host.appendChild(emptyLine(say('rules.noBox')));
    return;
  }
  if (!payload.rules.length) {
    host.appendChild(emptyLine(say('rules.none')));
    return;
  }
  const kinds = payload.ruleKinds.map((kind) => ({ id: kind, label: say('rules.kind.' + kind) }));
  const boxes = payload.boxes.map((box) => ({ id: box.id, label: box.title }));
  const types = payload.ruleTypes.map((type) => ({ id: type, label: say('box.' + type) }));
  for (const rule of payload.rules) {
    const row = line();
    row.appendChild(selectOf(kinds, rule.kind, (kind) => edit({ act: 'rule-change', id: rule.id, rule: { kind } })));
    // '종류' 규칙이 고를 값은 정해져 있다. 나머지는 사람이 글로 적는다.
    if (rule.kind === 'type') {
      const box = selectOf(types, rule.value, (value) => edit({ act: 'rule-change', id: rule.id, rule: { value } }));
      box.className = 'grow';
      row.appendChild(box);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'grow';
      input.spellcheck = false;
      input.value = rule.value;
      input.placeholder = say('rules.value.' + rule.kind);
      input.addEventListener('change', () => edit({ act: 'rule-change', id: rule.id, rule: { value: input.value } }));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') input.blur();
      });
      row.appendChild(input);
    }
    row.appendChild(selectOf(boxes, rule.fence, (fence) => edit({ act: 'rule-change', id: rule.id, rule: { fence } })));
    const onOff = miniButton('on', rule.on ? '●' : '○', say('rules.off'), () => edit({ act: 'rule-change', id: rule.id, rule: { on: !rule.on } }));
    onOff.setAttribute('aria-checked', String(!!rule.on));
    row.appendChild(onOff);
    row.appendChild(miniButton('drop', '×', say('rules.drop'), () => edit({ act: 'rule-remove', id: rule.id })));
    host.appendChild(row);
  }
}

// 페이지 한 줄: 지금 보고 있는지, 이름, 지우기.
function drawPages(payload) {
  const host = el('pageList');
  if (busy(host)) return;
  host.textContent = '';
  for (const page of payload.pages) {
    const row = line();
    const shown = document.createElement('button');
    shown.type = 'button';
    shown.className = 'pick';
    shown.textContent = page.label;
    shown.title = say('page.show');
    shown.setAttribute('aria-checked', String(page.id === payload.page));
    shown.addEventListener('click', () => edit({ act: 'page-show', id: page.id }));
    row.appendChild(shown);

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'grow';
    name.spellcheck = false;
    name.value = page.name;
    name.placeholder = page.label;
    name.addEventListener('change', () => edit({ act: 'page-rename', id: page.id, name: name.value }));
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') name.blur();
    });
    row.appendChild(name);

    const drop = miniButton('drop', '×', say('page.drop'), () => edit({ act: 'page-remove', id: page.id }));
    // 페이지가 하나뿐이면 지울 수 없다. 박스가 갈 데가 없어진다.
    drop.disabled = payload.pages.length < 2;
    row.appendChild(drop);
    host.appendChild(row);
  }
}

// 스냅샷 한 줄: 이름과 박스 수, 되돌리기, 지우기.
function drawSnaps(payload) {
  const host = el('snapList');
  host.textContent = '';
  if (!payload.snaps.length) {
    host.appendChild(emptyLine(say('snap.none')));
    return;
  }
  for (const snap of payload.snaps) {
    const row = line();
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'pick';
    back.textContent = snap.name + ' · ' + say('snap.boxes', { n: snap.boxes });
    back.title = say('snap.apply');
    back.addEventListener('click', () => edit({ act: 'snap-apply', id: snap.id }));
    row.appendChild(back);
    row.appendChild(miniButton('drop', '×', say('snap.drop'), () => edit({ act: 'snap-remove', id: snap.id })));
    host.appendChild(row);
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
  el('autoSortTag').textContent = say('rules.auto');
  el('rulesTag').textContent = say('rules.list');
  el('addRule').textContent = say('rules.add');
  el('sortNow').textContent = say('rules.sortNow');
  el('pagesTag').textContent = say('page.list');
  el('addPage').textContent = say('page.add');
  el('snapsTag').textContent = say('snap.list');
  el('saveSnap').textContent = say('snap.save');

  drawThemes(payload.themes, settings.theme);
  drawAbout(payload.about);
  drawRules(payload);
  drawPages(payload);
  drawSnaps(payload);
  el('autoSort').setAttribute('aria-checked', String(!!settings.autoSort));
  // 규칙이 없으면 지금 적용할 것도 없다.
  el('sortNow').disabled = !payload.rules.length;
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
el('autoSort').addEventListener('click', () => send({ autoSort: !settings.autoSort }));
el('addRule').addEventListener('click', () => edit({ act: 'rule-add', rule: {} }));
el('sortNow').addEventListener('click', () => edit({ act: 'sort-now' }));
el('addPage').addEventListener('click', () => edit({ act: 'page-add', name: '' }));
el('saveSnap').addEventListener('click', () => edit({ act: 'snap-save', name: '' }));
el('boxRoot').addEventListener('click', () => desk.prefsOpen('boxes'));
el('dataRoot').addEventListener('click', () => desk.prefsOpen('data'));
el('putBack').addEventListener('click', () => desk.prefsOpen('putBack'));
el('ok').addEventListener('click', () => desk.prefsClose());
el('close').addEventListener('click', () => desk.prefsClose());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter') desk.prefsClose();
});

desk.prefsReady();

'use strict';

const id = new URLSearchParams(location.search).get('id');

const el = (name) => document.getElementById(name);
const heading = el('heading');
const mark = el('mark');
const nameEl = el('name');
const themesEl = el('themes');
const bgEl = el('bg');
const barEl = el('bar');
const cornerEl = el('corner');
const cornerOut = el('cornerOut');
const opacityEl = el('opacity');
const opacityOut = el('opacityOut');
const collapseEl = el('collapse');
const shadowEl = el('shadow');
// 이 박스만의 글자 색과 그림·글씨 크기
const labelColorEl = el('labelColor');
const titleColorEl = el('titleColor');
const iconEl = el('iconSize');
const iconOut = el('iconOut');
const fontEl = el('fontSize');
const fontOut = el('fontOut');

let lang = window.DeskI18n.DEFAULT_LANG;
let fence = null;
// 그림자는 모든 박스에 함께 걸린다. 트레이 메뉴의 그것과 같은 값이다.
let shadow = false;
// 우리가 보낸 값이 되돌아와 손을 방해하지 않도록 잠깐 막는다.
let holding = false;

const say = (key) => window.DeskI18n.t(lang, key);
const pick = (label) => (label && (label[lang] || label.ko)) || '';

function send(patch) {
  desk.boxChange(id, patch);
}

// 슬라이더의 채워진 정도를 눈에 보이게 한다.
function paintRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const ratio = max === min ? 0 : (Number(input.value) - min) / (max - min);
  input.style.setProperty('--fill', `${Math.round(ratio * 100)}%`);
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

// 좌우 단추와 슬라이더가 함께 다루는 값들.
const SLIDERS = {
  corner: () => cornerEl,
  opacity: () => opacityEl,
  icon: () => iconEl,
  font: () => fontEl,
};

function step(kind, by) {
  const input = SLIDERS[kind] && SLIDERS[kind]();
  if (!input) return;
  const next = Number(input.value) + by * Number(input.step || 1);
  input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), next)));
  paintRange(input);
  apply(kind);
}

function apply(kind) {
  if (kind === 'corner') {
    cornerOut.textContent = `${cornerEl.value}px`;
    send({ corner: Number(cornerEl.value) });
  } else if (kind === 'icon') {
    iconOut.textContent = `${iconEl.value}px`;
    send({ look: { icon: Number(iconEl.value) } });
  } else if (kind === 'font') {
    fontOut.textContent = `${fontEl.value}px`;
    send({ look: { font: Number(fontEl.value) } });
  } else {
    opacityOut.textContent = `${opacityEl.value}%`;
    send({ opacity: Number(opacityEl.value) / 100 });
  }
}

// 페이지 고르는 단추 줄. 페이지가 둘 이상일 때만 보인다.
function drawPages(pages, current) {
  const host = el('pages');
  host.textContent = '';
  for (const page of pages || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = page.label;
    button.setAttribute('aria-checked', String(page.id === current));
    button.addEventListener('click', () => send({ page: page.id }));
    host.appendChild(button);
  }
}

desk.onBoxSettings((payload) => {
  if (!payload || payload.fence.id !== id) return;
  lang = payload.lang || lang;
  fence = payload.fence;

  heading.textContent = say('settings.title');
  document.title = say('settings.title');
  el('nameTag').textContent = say('menu.rename');
  el('themeTag').textContent = say('menu.theme');
  el('customTag').textContent = say('settings.custom');
  el('bgTag').textContent = say('settings.bg');
  el('barTag').textContent = say('settings.bar');
  el('textTag').textContent = say('settings.textColor');
  el('labelTag').textContent = say('settings.label');
  el('titleTag').textContent = say('settings.titleText');
  el('autoText').textContent = say('settings.auto');
  el('iconTag').textContent = say('settings.iconSize');
  el('fontTag').textContent = say('settings.fontSize');
  el('portalTag').textContent = say('portal.tag');
  el('pageTag').textContent = say('settings.page');
  el('cornerTag').textContent = say('menu.corner');
  el('opacityTag').textContent = say('menu.opacity');
  el('collapseTag').textContent = say('settings.collapse');
  el('shadowTag').textContent = say('settings.shadow');
  el('reset').textContent = say('settings.reset');
  el('ok').textContent = say('settings.ok');
  el('close').title = say('settings.ok');
  for (const button of document.querySelectorAll('.step')) {
    button.title = say(button.dataset.act.endsWith('-') ? 'settings.less' : 'settings.more');
  }
  if (payload.icon) mark.src = payload.icon;

  if (document.activeElement !== nameEl) nameEl.value = fence.title;
  drawThemes(payload.themes, fence.theme);
  bgEl.value = payload.look.bg;
  barEl.value = payload.look.bar;
  // 글자 색을 따로 정하지 않았으면 테마가 고른 색을 그대로 보여 준다.
  labelColorEl.value = payload.shown.text;
  titleColorEl.value = payload.shown.bar;
  el('autoText').setAttribute('aria-checked', String(!payload.mine.text && !payload.mine.bar));

  // 포털이면 비추는 폴더를, 페이지가 둘 이상이면 고를 페이지를 보여 준다.
  el('portalRow').hidden = !payload.portal;
  el('portalWhere').textContent = payload.portal || '';
  el('pageRow').hidden = (payload.pages || []).length < 2;
  drawPages(payload.pages, payload.page);

  if (!holding) {
    cornerEl.min = String(payload.corner.min);
    cornerEl.max = String(payload.corner.max);
    cornerEl.step = '1';
    cornerEl.value = String(payload.corner.radius);
    cornerOut.textContent = `${payload.corner.radius}px`;
    paintRange(cornerEl);

    opacityEl.min = String(Math.round(payload.opacity.min * 100));
    opacityEl.max = String(Math.round(payload.opacity.max * 100));
    opacityEl.step = '1';
    opacityEl.value = String(Math.round(payload.opacity.value * 100));
    opacityOut.textContent = `${opacityEl.value}%`;
    paintRange(opacityEl);

    iconEl.min = String(payload.iconSize.min);
    iconEl.max = String(payload.iconSize.max);
    iconEl.step = '2';
    iconEl.value = String(payload.iconSize.value);
    iconOut.textContent = `${payload.iconSize.value}px`;
    paintRange(iconEl);

    fontEl.min = String(payload.fontSize.min);
    fontEl.max = String(payload.fontSize.max);
    fontEl.step = '1';
    fontEl.value = String(payload.fontSize.value);
    fontOut.textContent = `${payload.fontSize.value}px`;
    paintRange(fontEl);
  }

  collapseEl.setAttribute('aria-checked', String(!!fence.collapsed));
  shadow = !!payload.shadow;
  shadowEl.setAttribute('aria-checked', String(shadow));
  requestAnimationFrame(fit);
});

nameEl.addEventListener('input', () => send({ title: nameEl.value }));
nameEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') nameEl.blur();
});

for (const [input, kind] of [[cornerEl, 'corner'], [opacityEl, 'opacity'], [iconEl, 'icon'], [fontEl, 'font']]) {
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

bgEl.addEventListener('input', () => send({ custom: { bg: bgEl.value, bar: barEl.value } }));
barEl.addEventListener('input', () => send({ custom: { bg: bgEl.value, bar: barEl.value } }));

labelColorEl.addEventListener('input', () => send({ look: { text: labelColorEl.value } }));
titleColorEl.addEventListener('input', () => send({ look: { bar: titleColorEl.value } }));
// 빈 글자를 보내면 그 색은 다시 테마가 고른 것으로 돌아간다.
el('autoText').addEventListener('click', () => send({ look: { text: '', bar: '' } }));

collapseEl.addEventListener('click', () => send({ collapsed: !fence.collapsed }));
shadowEl.addEventListener('click', () => send({ shadow: !shadow }));
el('reset').addEventListener('click', () => desk.boxReset(id));
el('ok').addEventListener('click', () => desk.boxClose(id));
el('close').addEventListener('click', () => desk.boxClose(id));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter') desk.boxClose(id);
});

// 스크롤 막대가 생기지 않도록 창을 내용 높이에 맞춘다.
function fit() {
  const panel = document.getElementById('panel');
  const style = getComputedStyle(panel);
  const num = (value) => Number.parseFloat(value) || 0;
  const height = document.getElementById('head').offsetHeight
    + document.getElementById('body').scrollHeight
    + document.getElementById('foot').offsetHeight
    + num(style.borderTopWidth) + num(style.borderBottomWidth);
  desk.boxSize(id, Math.ceil(height));
}

desk.boxReady(id);

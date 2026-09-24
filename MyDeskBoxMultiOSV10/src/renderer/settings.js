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

let lang = window.DeskI18n.DEFAULT_LANG;
let fence = null;
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
  el('cornerTag').textContent = say('menu.corner');
  el('opacityTag').textContent = say('menu.opacity');
  el('collapseTag').textContent = say('settings.collapse');
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
  }

  collapseEl.setAttribute('aria-checked', String(!!fence.collapsed));
  requestAnimationFrame(fit);
});

nameEl.addEventListener('input', () => send({ title: nameEl.value }));
nameEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') nameEl.blur();
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

bgEl.addEventListener('input', () => send({ custom: { bg: bgEl.value, bar: barEl.value } }));
barEl.addEventListener('input', () => send({ custom: { bg: bgEl.value, bar: barEl.value } }));

collapseEl.addEventListener('click', () => send({ collapsed: !fence.collapsed }));
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

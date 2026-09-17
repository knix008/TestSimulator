'use strict';

/** 전체 화면 시계 — 현재 설정을 그대로 사용하고, 입력이 있으면 닫는다. */

const api = window.myclock;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad2 = (n) => String(n).padStart(2, '0');

const dateEl = document.getElementById('fullDate');
const digitalEl = document.getElementById('fullDigital');
const ampmEl = document.getElementById('fullAmPm');
const canvasEl = document.getElementById('fullCanvas');
const textEl = document.getElementById('fullText');
const analogEl = document.getElementById('fullAnalog');

let settings = null;

function applySettings(next) {
  settings = next;
  applyTheme(settings.theme);
  document.documentElement.style.setProperty('--digital-text-color', settings.digitColor);
  document.documentElement.style.setProperty('--digital-ampm-color', settings.amPmColor);

  const canvasStyle = usesCanvasDigital(settings.digitalStyle);
  digitalEl.hidden = !settings.isDigital;
  analogEl.hidden = settings.isDigital;
  canvasEl.hidden = !canvasStyle;
  textEl.hidden = canvasStyle;

  if (!canvasStyle) {
    const font = textDigitalFont(settings.digitalStyle);
    textEl.style.fontFamily = font.family;
    textEl.style.fontWeight = String(font.weight);
    textEl.style.textShadow = font.glow
      ? `0 0 ${font.glow * 2}px ${settings.digitColor}, 0 0 ${font.glow}px ${settings.digitColor}`
      : 'none';
  }
}

function formatClockTime(date, use24h, showSeconds) {
  let h = date.getHours();
  if (!use24h) {
    h %= 12;
    if (h === 0) h = 12;
  }
  const base = `${pad2(h)}:${pad2(date.getMinutes())}`;
  return showSeconds ? `${base}:${pad2(date.getSeconds())}` : base;
}

function tick() {
  if (!settings) return;
  const now = new Date();
  dateEl.textContent = `${now.getFullYear()}년 ${pad2(now.getMonth() + 1)}월 ${pad2(now.getDate())}일 ${WEEKDAYS[now.getDay()]}`;

  if (settings.isDigital) {
    ampmEl.textContent = settings.use24h ? '' : now.getHours() < 12 ? '오전' : '오후';
    if (usesCanvasDigital(settings.digitalStyle)) {
      const dim = (getComputedStyle(document.documentElement).getPropertyValue('--seg-dim') || '').trim() || '#1a2040';
      const text = formatClockTime(now, settings.use24h, true);
      if (settings.digitalStyle === 'DotMatrix') drawDotMatrix(canvasEl, text, settings.digitColor, dim);
      else drawSevenSegment(canvasEl, text, settings.digitColor, dim);
    } else {
      const showSeconds = settings.digitalStyle !== 'Minimal';
      textEl.textContent =
        settings.digitalStyle === 'Korean'
          ? formatKoreanClock(now, settings.use24h, showSeconds)
          : formatClockTime(now, settings.use24h, showSeconds);
    }
  } else {
    drawAnalogClock(analogEl, now, settings.analogStyle, analogColorsFrom());
  }
}

function close() {
  api.fullscreen.close();
}

api.settings.load().then((loaded) => {
  applySettings(loaded);
  tick();
  window.setInterval(tick, 200);
});

api.bus.onFromClock((message) => {
  if (message && message.type === 'state' && message.settings) applySettings(message.settings);
});

for (const event of ['keydown', 'mousedown', 'wheel']) {
  window.addEventListener(event, close);
}
// 창이 열린 직후의 잔여 마우스 이동으로 바로 닫히지 않도록 잠시 무시한다.
window.setTimeout(() => window.addEventListener('mousemove', close), 1200);

'use strict';

/** 전체 화면 시계 — 시계 상자만 창으로 남긴다. ESC 로 원래 시계에 돌아온다. */

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
  setCustomTheme(settings.customThemeColor, settings.customThemeLight);
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
      const text = formatClockTime(now, settings.use24h, true);
      if (settings.digitalStyle === 'DotMatrix') drawDotMatrix(canvasEl, text, settings.digitColor);
      else drawSevenSegment(canvasEl, text, settings.digitColor);
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

let fitted = false;

function freezeElement(el, rect) {
  const cs = getComputedStyle(el);
  el.style.flex = '0 0 auto';
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.fontSize = cs.fontSize;
  el.style.lineHeight = cs.lineHeight;
  if (cs.gap && cs.gap !== 'normal') el.style.gap = cs.gap;
}

/** 시계가 실제로 차지하는 상자만 창으로 남긴다. 그 밖은 마우스가 바탕으로 간다. */
function fitToClock() {
  if (fitted) return;
  const clock = document.querySelector('.full-clock');
  if (!clock) return;
  const nodes = [clock, ...clock.querySelectorAll('*')];
  const rects = nodes.map((el) => el.getBoundingClientRect());
  const rect = rects[0];
  if (rect.width < 8 || rect.height < 8) return;
  fitted = true;
  nodes.forEach((el, index) => {
    if (rects[index].width < 1 || rects[index].height < 1) return;
    freezeElement(el, rects[index]);
  });
  const pad = 28;
  api.fullscreen.fit({
    x: Math.round(rect.left - pad),
    y: Math.round(rect.top - pad),
    width: Math.ceil(rect.width + pad * 2),
    height: Math.ceil(rect.height + pad * 2)
  });
}

function scheduleFit() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(fitToClock);
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  api.fullscreen.close();
});

api.settings.load().then((loaded) => {
  applySettings(loaded);
  tick();
  window.setInterval(tick, 200);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit);
  else scheduleFit();
});

api.bus.onFromClock((message) => {
  if (message && message.type === 'state' && message.settings) applySettings(message.settings);
});

'use strict';

/**
 * 아날로그 시계 — MyClockWinV10/Controls/AnalogClockControl.xaml.cs 이식.
 * 380×380 디자인 좌표계에서 그린 값을 창 크기에 맞춰 배율 조정한다.
 */

const DESIGN_SIZE = 380;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** 테마 CSS 변수에서 시계 색상을 읽어온다. */
function analogColorsFrom(element) {
  const s = getComputedStyle(element || document.documentElement);
  const pick = (name, fallback) => (s.getPropertyValue(name) || '').trim() || fallback;
  return {
    face: pick('--clock-face', '#000000'),
    border: pick('--clock-border', '#808080'),
    tickMark: pick('--tick-mark', '#696969'),
    hourTick: pick('--hour-tick', '#FFFFFF'),
    number: pick('--number', '#FFFFFF'),
    hourHand: pick('--hour-hand', '#FFFFFF'),
    minuteHand: pick('--minute-hand', '#ADD8E6'),
    secondHand: pick('--second-hand', '#FF0000'),
    centerDot: pick('--center-dot', '#FF0000')
  };
}

/** 시계 그리기 상태 — 중심·반지름·배율을 한 번 계산해 모든 헬퍼가 공유한다. */
function createGeometry(ctx, size) {
  const scale = size / DESIGN_SIZE;
  const sc = (units) => units * scale;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - sc(12);
  return {
    ctx,
    cx,
    cy,
    r,
    sc,
    /** 반지름 비례 글꼴 크기. */
    numFont: (factor) => Math.max(10, r * factor)
  };
}

function line(g, x1, y1, x2, y2, stroke, width, round = true) {
  const { ctx } = g;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineCap = round ? 'round' : 'butt';
  ctx.stroke();
}

function radialLine(g, angle, outerR, innerR, stroke, width, round = true) {
  line(
    g,
    g.cx + outerR * Math.sin(angle),
    g.cy - outerR * Math.cos(angle),
    g.cx + innerR * Math.sin(angle),
    g.cy - innerR * Math.cos(angle),
    stroke,
    width,
    round
  );
}

function circle(g, cx, cy, radius, fill, alpha = 1) {
  const { ctx } = g;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function placeLabel(g, text, angle, radius, fontSize, weight, color) {
  const { ctx } = g;
  ctx.save();
  ctx.font = `${weight} ${fontSize}px 'Segoe UI', 'Noto Sans KR', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, g.cx + radius * Math.sin(angle), g.cy - radius * Math.cos(angle));
  ctx.restore();
}

function addHand(g, angle, len, thickness, stroke, tail = 0) {
  line(
    g,
    g.cx - tail * Math.sin(angle),
    g.cy + tail * Math.cos(angle),
    g.cx + len * Math.sin(angle),
    g.cy - len * Math.cos(angle),
    stroke,
    thickness
  );
}

// ── 문자판 스타일 ───────────────────────────────────────────────────────

function drawAllTicks(g, c) {
  for (let i = 0; i < 60; i++) {
    const isHour = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    radialLine(
      g,
      a,
      g.r - g.sc(4),
      isHour ? g.r - g.sc(24) : g.r - g.sc(11),
      isHour ? c.hourTick : c.tickMark,
      isHour ? g.sc(3) : g.sc(1)
    );
  }
}

function drawArabicNumbers(g, c) {
  const fontSize = g.numFont(0.145);
  const labelR = g.r * 0.72;
  for (let i = 1; i <= 12; i++) {
    placeLabel(g, String(i), (i * 30 * Math.PI) / 180, labelR, fontSize, 700, c.number);
  }
}

function drawRomanNumbers(g, c) {
  const fontSize = g.numFont(0.115);
  const labelR = g.r * 0.7;
  for (let i = 1; i <= 12; i++) {
    placeLabel(g, ROMAN[i], (i * 30 * Math.PI) / 180, labelR, fontSize, 700, c.number);
  }
}

function drawCardinalDots(g, c) {
  for (let i = 0; i < 12; i++) {
    const isCardinal = i % 3 === 0;
    const a = (i * 30 * Math.PI) / 180;
    const dotR = g.sc(isCardinal ? 6 : 3);
    const pos = g.r - g.sc(14);
    circle(g, g.cx + pos * Math.sin(a), g.cy - pos * Math.cos(a), dotR, c.hourTick, isCardinal ? 1 : 0.45);
  }
}

function drawIndexMarkers(g, c) {
  for (let i = 0; i < 12; i++) {
    const isCardinal = i % 3 === 0;
    const a = (i * 30 * Math.PI) / 180;
    radialLine(
      g,
      a,
      g.r - g.sc(4),
      isCardinal ? g.r - g.sc(30) : g.r - g.sc(18),
      c.hourTick,
      isCardinal ? g.sc(7) : g.sc(4),
      false
    );
  }
}

function drawRailroadMarkers(g, c) {
  for (let i = 0; i < 60; i++) {
    const isHour = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    radialLine(
      g,
      a,
      g.r - g.sc(4),
      isHour ? g.r - g.sc(28) : g.r - g.sc(10),
      isHour ? c.hourTick : c.tickMark,
      isHour ? g.sc(5) : g.sc(1)
    );
  }
}

function drawBauhausMarkers(g, c) {
  const { ctx } = g;
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const a = (i * 6 * Math.PI) / 180;
    ctx.save();
    ctx.globalAlpha = 0.5;
    radialLine(g, a, g.r - g.sc(4), g.r - g.sc(9), c.tickMark, g.sc(1), false);
    ctx.restore();
  }
  for (let h = 0; h < 12; h += 3) {
    const a = (h * 30 * Math.PI) / 180;
    const outerR = g.r - g.sc(6);
    radialLine(g, a, outerR, outerR - g.sc(22), c.hourTick, g.sc(4), false);
  }
}

function drawDotRing(g, c) {
  const { ctx } = g;
  for (let i = 0; i < 60; i++) {
    const isHour = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    const pos = g.r - g.sc(10);
    const cx = g.cx + pos * Math.sin(a);
    const cy = g.cy - pos * Math.cos(a);

    if (i === 0) {
      // 12시 위치: 방사 방향으로 길쭉한 pill 바
      const bw = g.sc(5);
      const bh = g.sc(20);
      ctx.save();
      ctx.fillStyle = c.hourTick;
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, bw / 2);
      ctx.fill();
      ctx.restore();
    } else {
      const dotR = g.sc(isHour ? 4.5 : 2.5);
      circle(g, cx, cy, dotR, isHour ? c.hourTick : c.tickMark, isHour ? 1 : 0.65);
    }
  }
}

function drawNauticalFace(g, c) {
  const { ctx } = g;
  for (let i = 0; i < 60; i++) {
    const isHour = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    ctx.save();
    ctx.globalAlpha = isHour ? 1 : 0.55;
    radialLine(
      g,
      a,
      g.r - g.sc(4),
      isHour ? g.r - g.sc(26) : g.r - g.sc(9),
      isHour ? c.hourTick : c.tickMark,
      isHour ? g.sc(3.5) : g.sc(1)
    );
    ctx.restore();
  }

  for (const h of [12, 3, 6, 9]) {
    const a = (h * 30 * Math.PI) / 180;
    const tipR = g.r - g.sc(8);
    const baseR = g.r - g.sc(28);
    const halfW = g.sc(7);
    const bx = g.cx + baseR * Math.sin(a);
    const by = g.cy - baseR * Math.cos(a);
    const tx = g.cx + tipR * Math.sin(a);
    const ty = g.cy - tipR * Math.cos(a);
    const px = Math.cos(a) * halfW;
    const py = Math.sin(a) * halfW;

    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx - px, by - py);
    ctx.lineTo(bx + px, by + py);
    ctx.closePath();
    ctx.fillStyle = c.hourTick;
    ctx.fill();
  }

  drawArabicNumbers(g, c);
}

function drawModernFace(g, c) {
  for (let i = 0; i < 12; i++) {
    const isCardinal = i % 3 === 0;
    const a = (i * 30 * Math.PI) / 180;
    if (isCardinal) {
      radialLine(g, a, g.r - g.sc(6), g.r - g.sc(34), c.hourTick, g.sc(3), false);
    } else {
      const pos = g.r - g.sc(12);
      circle(g, g.cx + pos * Math.sin(a), g.cy - pos * Math.cos(a), g.sc(2.5), c.tickMark, 0.7);
    }
  }
}

function drawSteampunkFace(g, c) {
  const { ctx } = g;
  const innerR = g.r - g.sc(22);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = g.sc(2);
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const pos = g.r - g.sc(3);
    circle(g, g.cx + pos * Math.sin(a), g.cy - pos * Math.cos(a), g.sc(3), c.hourTick, 0.85);
  }

  drawAllTicks(g, c);
  drawRomanNumbers(g, c);
}

function drawAviatorFace(g, c) {
  const fontSize = g.numFont(0.15);
  const labelR = g.r * 0.71;
  for (let i = 0; i < 12; i++) {
    const isCardinal = i % 3 === 0;
    const a = (i * 30 * Math.PI) / 180;
    radialLine(
      g,
      a,
      g.r - g.sc(4),
      isCardinal ? g.r - g.sc(26) : g.r - g.sc(12),
      isCardinal ? c.hourTick : c.tickMark,
      isCardinal ? g.sc(4) : g.sc(1)
    );
  }
  for (const h of [12, 3, 6, 9]) {
    placeLabel(g, String(h), (h * 30 * Math.PI) / 180, labelR, fontSize, 700, c.number);
  }
}

const FACE_DRAWERS = {
  Classic: (g, c) => {
    drawAllTicks(g, c);
    drawArabicNumbers(g, c);
  },
  Minimal: drawCardinalDots,
  Roman: (g, c) => {
    drawAllTicks(g, c);
    drawRomanNumbers(g, c);
  },
  Indices: drawIndexMarkers,
  Railroad: drawRailroadMarkers,
  Bauhaus: drawBauhausMarkers,
  Dots: drawDotRing,
  Aviator: drawAviatorFace,
  Nautical: drawNauticalFace,
  Modern: drawModernFace,
  Steampunk: drawSteampunkFace
};

/** 문자판 안에 들어가도록 글자를 줄인다 (도시 이름이 길 때). */
function fitLabel(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** 12시 아래 오전/오후(+도시), 6시 위 날짜 뱃지. */
function drawAmPmAndDate(g, date, color, label) {
  const { ctx } = g;
  const ampm = date.getHours() < 12 ? '오전' : '오후';
  // 멀리서도 읽히도록 문자판 숫자(0.145)에 가깝게 키운다.
  const ampmFont = g.numFont(0.135);

  ctx.save();
  ctx.font = `600 ${ampmFont}px 'Segoe UI', 'Noto Sans KR', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ampm, g.cx, g.cy - g.r * 0.5);
  ctx.restore();

  // 도시 이름 — 오전/오후 바로 아래, 문자판 안쪽에 둔다.
  if (label) {
    const cityFont = g.numFont(0.125);
    ctx.save();
    ctx.font = `700 ${cityFont}px 'Segoe UI', 'Noto Sans KR', sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitLabel(ctx, String(label), g.r * 1.1), g.cx, g.cy - g.r * 0.32);
    ctx.restore();
  }

  const dateStr = String(date.getDate()).padStart(2, '0');
  const dateFont = g.numFont(0.15);
  ctx.save();
  ctx.font = `700 ${dateFont}px 'Segoe UI', 'Noto Sans KR', sans-serif`;
  const metrics = ctx.measureText(dateStr);
  const textW = metrics.width;
  const textH = dateFont * 1.2;
  const padX = g.sc(5);
  const padY = g.sc(2.5);
  const bgW = textW + padX * 2;
  const bgH = textH + padY * 2;
  const dateCy = g.cy + g.r * 0.5;

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(g.cx - bgW / 2, dateCy - bgH / 2, bgW, bgH, g.sc(2));
  ctx.fill();

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dateStr, g.cx, dateCy);
  ctx.restore();
}

/**
 * 아날로그 시계 한 프레임을 그린다.
 * @param {HTMLCanvasElement} canvas 대상 캔버스
 * @param {Date} date 표시할 시각
 * @param {string} style AnalogStyle id
 * @param {object} colors analogColorsFrom() 결과
 * @param {string} [label] 문자판 안에 적을 도시 이름 (추가 시계)
 */
function drawAnalogClock(canvas, date, style, colors, label) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 1 || cssH < 1) return;

  const pixelW = Math.round(cssW * dpr);
  const pixelH = Math.round(cssH * dpr);
  if (canvas.width !== pixelW) canvas.width = pixelW;
  if (canvas.height !== pixelH) canvas.height = pixelH;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixelW, pixelH);

  const size = Math.min(cssW, cssH);
  ctx.setTransform(dpr, 0, 0, dpr, ((cssW - size) / 2) * dpr, ((cssH - size) / 2) * dpr);

  const g = createGeometry(ctx, size);
  const c = colors;

  // 바깥 글로우 링
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.r + g.sc(8), 0, Math.PI * 2);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = g.sc(1);
  ctx.stroke();
  ctx.restore();

  // 문자판
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  ctx.fillStyle = c.face;
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = g.sc(5);
  ctx.stroke();

  (FACE_DRAWERS[style] || FACE_DRAWERS.Classic)(g, c);
  drawAmPmAndDate(g, date, c.number, label);

  const secA = (date.getSeconds() * 6 * Math.PI) / 180;
  const minA = ((date.getMinutes() + date.getSeconds() / 60) * 6 * Math.PI) / 180;
  const hrA = (((date.getHours() % 12) + date.getMinutes() / 60) * 30 * Math.PI) / 180;

  addHand(g, hrA, g.r * 0.5, g.sc(8), c.hourHand);
  addHand(g, minA, g.r * 0.72, g.sc(5), c.minuteHand);
  addHand(g, secA, g.r * 0.85, g.sc(2), c.secondHand, g.r * 0.22);

  circle(g, g.cx, g.cy, g.sc(8), c.centerDot);
}

/**
 * 세계 시간 목록과 트레이 아이콘에 쓰는 미니 아날로그 시계.
 * MyClockWinV10/Controls/MiniAnalogClockControl.xaml.cs 이식 (72×72 디자인).
 */
function drawMiniAnalogClock(canvas, date, colors) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  if (cssW < 1 || cssH < 1) return;

  const pixelW = Math.round(cssW * dpr);
  const pixelH = Math.round(cssH * dpr);
  if (canvas.width !== pixelW) canvas.width = pixelW;
  if (canvas.height !== pixelH) canvas.height = pixelH;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixelW, pixelH);

  const size = Math.min(cssW, cssH);
  const scale = (size / 72) * dpr;
  ctx.setTransform(scale, 0, 0, scale, (pixelW - 72 * scale) / 2, (pixelH - 72 * scale) / 2);

  const g = { ctx, cx: 36, cy: 36, r: 32, sc: (u) => u, numFont: () => 10 };
  const c = colors;

  ctx.beginPath();
  ctx.arc(36, 36, 32, 0, Math.PI * 2);
  ctx.fillStyle = c.face;
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const major = i % 3 === 0;
    radialLine(g, a, 30, major ? 23 : 26, c.hourTick, major ? 2 : 1);
  }

  const secA = (date.getSeconds() * 6 * Math.PI) / 180;
  const minA = ((date.getMinutes() + date.getSeconds() / 60) * 6 * Math.PI) / 180;
  const hrA = (((date.getHours() % 12) + date.getMinutes() / 60) * 30 * Math.PI) / 180;

  addHand(g, hrA, 16, 3, c.hourHand);
  addHand(g, minA, 23, 2, c.minuteHand);
  addHand(g, secA, 26.2, 1, c.secondHand, 4.8);

  circle(g, 36, 36, 3, c.centerDot);
}

if (typeof module !== 'undefined') {
  module.exports = { drawAnalogClock, drawMiniAnalogClock, analogColorsFrom };
}

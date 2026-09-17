'use strict';

/**
 * 캔버스 디지털 디스플레이 — legacy-wpf/Controls/SevenSegmentDisplay.xaml.cs 와
 * DotMatrixDisplay.xaml.cs 의 기하 구조를 그대로 옮겼다.
 * 두 함수 모두 디자인 좌표계로 그린 뒤 캔버스 크기에 맞춰 균일 배율을 적용한다.
 */

// ── 7-세그먼트 ─────────────────────────────────────────────────────────

const SEG_DW = 52; // 숫자 폭
const SEG_DH = 96; // 숫자 높이
const SEG_ST = 10; // 세그먼트 두께
const SEG_GAP = 3; // 숫자 가장자리 여백
const SEG_CG = 12; // 문자 간격
const SEG_CW = 24; // 콜론 폭

// 세그먼트 패턴: [a, b, c, d, e, f, g]
const SEG_MAP = {
  0: [1, 1, 1, 1, 1, 1, 0],
  1: [0, 1, 1, 0, 0, 0, 0],
  2: [1, 1, 0, 1, 1, 0, 1],
  3: [1, 1, 1, 1, 0, 0, 1],
  4: [0, 1, 1, 0, 0, 1, 1],
  5: [1, 0, 1, 1, 0, 1, 1],
  6: [1, 0, 1, 1, 1, 1, 1],
  7: [1, 1, 1, 0, 0, 0, 0],
  8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0, 0, 0, 1]
};

function sevenSegmentWidth(text) {
  let x = 0;
  for (const ch of text) x += ch === ':' ? SEG_CW : SEG_DW + SEG_CG;
  return x > 0 ? x - SEG_CG : 0;
}

function polygon(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function segH(ctx, x, y, w, h, on, onColor, dimColor) {
  const c = h / 2;
  polygon(
    ctx,
    [
      [x + c, y],
      [x + w - c, y],
      [x + w, y + c],
      [x + w - c, y + h],
      [x + c, y + h],
      [x, y + c]
    ],
    on ? onColor : dimColor
  );
}

function segV(ctx, x, y, w, h, on, onColor, dimColor) {
  const c = w / 2;
  polygon(
    ctx,
    [
      [x + c, y],
      [x + w, y + c],
      [x + w, y + h - c],
      [x + c, y + h],
      [x, y + h - c],
      [x, y + c]
    ],
    on ? onColor : dimColor
  );
}

function drawSevenSegmentDigit(ctx, x, s, onColor, dimColor) {
  // a – 위
  segH(ctx, x + SEG_GAP, 0, SEG_DW - 2 * SEG_GAP, SEG_ST, s[0], onColor, dimColor);
  // b – 오른쪽 위
  segV(ctx, x + SEG_DW - SEG_ST, SEG_GAP, SEG_ST, SEG_DH / 2 - 2 * SEG_GAP, s[1], onColor, dimColor);
  // c – 오른쪽 아래
  segV(ctx, x + SEG_DW - SEG_ST, SEG_DH / 2 + SEG_GAP, SEG_ST, SEG_DH / 2 - 2 * SEG_GAP, s[2], onColor, dimColor);
  // d – 아래
  segH(ctx, x + SEG_GAP, SEG_DH - SEG_ST, SEG_DW - 2 * SEG_GAP, SEG_ST, s[3], onColor, dimColor);
  // e – 왼쪽 아래
  segV(ctx, x, SEG_DH / 2 + SEG_GAP, SEG_ST, SEG_DH / 2 - 2 * SEG_GAP, s[4], onColor, dimColor);
  // f – 왼쪽 위
  segV(ctx, x, SEG_GAP, SEG_ST, SEG_DH / 2 - 2 * SEG_GAP, s[5], onColor, dimColor);
  // g – 가운데
  segH(ctx, x + SEG_GAP, (SEG_DH - SEG_ST) / 2, SEG_DW - 2 * SEG_GAP, SEG_ST, s[6], onColor, dimColor);
}

function drawSevenSegmentColon(ctx, x, onColor) {
  const r = SEG_ST * 0.7;
  const cx = x + SEG_CW / 2 - r / 2;
  for (const cy of [SEG_DH / 3 - r / 2, (2 * SEG_DH) / 3 - r / 2]) {
    ctx.beginPath();
    ctx.arc(cx + r / 2, cy + r / 2, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = onColor;
    ctx.fill();
  }
}

// ── 도트 매트릭스 (7×7) ────────────────────────────────────────────────

const DOT_ROWS = 7;
const DOT_COLS = 7;
const DOT_PX = 4;
const DOT_GAP = 2;
const DOT_CELL = DOT_PX + DOT_GAP;
const DOT_DIGIT_W = DOT_COLS * DOT_CELL;
const DOT_DIGIT_H = DOT_ROWS * DOT_CELL;
const DOT_COLON_W = DOT_CELL * 2;
const DOT_CHAR_GAP = DOT_CELL;

const DOT_PATTERNS = {
  0: ['0111110', '1000001', '1000001', '1000001', '1000001', '1000001', '0111110'],
  1: ['0001000', '0011000', '0001000', '0001000', '0001000', '0001000', '0111110'],
  2: ['0111110', '1000001', '0000001', '0011110', '0110000', '1000000', '1111111'],
  3: ['0111110', '1000001', '0000001', '0001110', '0000001', '1000001', '0111110'],
  4: ['0010001', '0100001', '1000001', '1111111', '0000001', '0000001', '0000001'],
  5: ['1111111', '1000000', '1000000', '0111110', '0000001', '0000001', '0111110'],
  6: ['0111110', '1000000', '1000000', '1111110', '1000001', '1000001', '0111110'],
  7: ['1111111', '0000001', '0000010', '0000100', '0001000', '0010000', '0010000'],
  8: ['0111110', '1000001', '1000001', '0111110', '1000001', '1000001', '0111110'],
  9: ['0111110', '1000001', '1000001', '0111111', '0000001', '0000001', '0111110'],
  ' ': ['0000000', '0000000', '0000000', '0000000', '0000000', '0000000', '0000000']
};

function dotMatrixWidth(text) {
  let x = 0;
  for (const ch of text) x += (ch === ':' ? DOT_COLON_W : DOT_DIGIT_W) + DOT_CHAR_GAP;
  return x > 0 ? x - DOT_CHAR_GAP : 0;
}

// ── 공용 진입점 ─────────────────────────────────────────────────────────

/** 캔버스를 실제 픽셀 해상도에 맞추고 디자인 좌표계를 중앙 정렬로 세운다. */
function prepareCanvas(canvas, designW, designH) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 1 || cssH < 1 || designW < 1 || designH < 1) return null;

  const pixelW = Math.round(cssW * dpr);
  const pixelH = Math.round(cssH * dpr);
  if (canvas.width !== pixelW) canvas.width = pixelW;
  if (canvas.height !== pixelH) canvas.height = pixelH;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(cssW / designW, cssH / designH) * dpr;
  ctx.setTransform(scale, 0, 0, scale, (pixelW - designW * scale) / 2, (pixelH - designH * scale) / 2);
  return ctx;
}

/** 7-세그먼트 시각 표시. */
function drawSevenSegment(canvas, text, onColor, dimColor) {
  const width = sevenSegmentWidth(text);
  const ctx = prepareCanvas(canvas, width, SEG_DH);
  if (!ctx) return;

  let x = 0;
  for (const ch of text) {
    if (ch === ':') {
      drawSevenSegmentColon(ctx, x, onColor);
      x += SEG_CW;
    } else {
      const pattern = SEG_MAP[ch];
      if (pattern) drawSevenSegmentDigit(ctx, x, pattern, onColor, dimColor);
      x += SEG_DW + SEG_CG;
    }
  }
}

/** 도트 매트릭스 시각 표시. */
function drawDotMatrix(canvas, text, onColor, dimColor) {
  const width = dotMatrixWidth(text);
  const ctx = prepareCanvas(canvas, width, DOT_DIGIT_H);
  if (!ctx) return;

  let x = 0;
  for (const ch of text) {
    if (ch === ':') {
      const cx = x + (DOT_COLON_W - DOT_PX) / 2;
      ctx.fillStyle = onColor;
      ctx.fillRect(cx, 2 * DOT_CELL, DOT_PX, DOT_PX);
      ctx.fillRect(cx, 4 * DOT_CELL, DOT_PX, DOT_PX);
      x += DOT_COLON_W + DOT_CHAR_GAP;
      continue;
    }
    const rows = DOT_PATTERNS[ch];
    if (rows) {
      for (let r = 0; r < DOT_ROWS; r++) {
        for (let c = 0; c < DOT_COLS; c++) {
          ctx.fillStyle = rows[r][c] === '1' ? onColor : dimColor;
          ctx.fillRect(x + c * DOT_CELL, r * DOT_CELL, DOT_PX, DOT_PX);
        }
      }
    }
    x += DOT_DIGIT_W + DOT_CHAR_GAP;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { drawSevenSegment, drawDotMatrix, sevenSegmentWidth, dotMatrixWidth };
}

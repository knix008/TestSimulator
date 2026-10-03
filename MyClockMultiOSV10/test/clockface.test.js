'use strict';

/**
 * 시계 그리기 — 아날로그 11가지 스타일, 미니 시계, 7세그먼트·도트 디지털.
 * 캔버스를 가짜로 끼워, 창을 띄우지 않고도 "그려졌는지"를 확인한다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeCanvas, installDom } = require('./helpers/fakes');
const { ANALOG_STYLES, DIGITAL_STYLES, usesCanvasDigital, textDigitalFont } = require('../src/js/data/styles');
const { drawAnalogClock, drawMiniAnalogClock, analogColorsFrom } = require('../src/js/analog-clock');
const { drawSevenSegment, drawDotMatrix, sevenSegmentWidth, dotMatrixWidth } = require('../src/js/digital-display');

const AT = new Date(2026, 9, 2, 10, 8, 42);

const COLORS = {
  face: '#101020',
  border: '#89B4FA',
  tickMark: '#45475A',
  hourTick: '#CDD6F4',
  number: '#BAC2DE',
  hourHand: '#CDD6F4',
  minuteHand: '#89B4FA',
  secondHand: '#F38BA8',
  centerDot: '#F38BA8'
};

test('아날로그 스타일 11가지가 모두 문자판·바늘을 그린다', () => {
  const restore = installDom();
  try {
    assert.equal(ANALOG_STYLES.length, 11);
    for (const style of ANALOG_STYLES) {
      const canvas = fakeCanvas(300, 300);
      drawAnalogClock(canvas, AT, style.id, COLORS);
      const ctx = canvas.ctx;

      assert.ok(ctx.countOf('arc') >= 1, `${style.id}: 문자판 원을 그리지 않았다`);
      assert.ok(ctx.countOf('fill') >= 1, `${style.id}: 칠한 것이 없다`);
      // 시침·분침·초침 — 선을 적어도 세 번 긋는다.
      assert.ok(ctx.countOf('lineTo') >= 3, `${style.id}: 바늘이 모자라다 (${ctx.countOf('lineTo')})`);

      const used = new Set([...ctx.calls.filter((c) => c.name.startsWith('set:')).map((c) => c.args[0])]);
      for (const color of ['#CDD6F4', '#89B4FA', '#F38BA8']) {
        assert.ok(used.has(color), `${style.id}: 테마 색 ${color} 을 쓰지 않았다`);
      }
      assert.equal(canvas.width, 300, '캔버스를 실제 픽셀 수로 맞춘다');
    }
  } finally {
    restore();
  }
});

test('모르는 아날로그 스타일은 클래식으로 그린다', () => {
  const restore = installDom();
  try {
    const known = fakeCanvas(240, 240);
    const unknown = fakeCanvas(240, 240);
    drawAnalogClock(known, AT, 'Classic', COLORS);
    drawAnalogClock(unknown, AT, '없는스타일', COLORS);
    assert.equal(unknown.ctx.calls.length, known.ctx.calls.length);
  } finally {
    restore();
  }
});

test('크기가 0인 캔버스에는 그리지 않는다 (창이 숨었을 때)', () => {
  const restore = installDom();
  try {
    const canvas = fakeCanvas(0, 0);
    drawAnalogClock(canvas, AT, 'Classic', COLORS);
    assert.equal(canvas.ctx.calls.length, 0);
  } finally {
    restore();
  }
});

test('높은 DPI 화면에서는 캔버스를 그만큼 크게 잡는다', () => {
  const restore = installDom();
  try {
    global.window.devicePixelRatio = 2;
    const canvas = fakeCanvas(150, 150);
    drawAnalogClock(canvas, AT, 'Classic', COLORS);
    assert.equal(canvas.width, 300);
    assert.equal(canvas.height, 300);
  } finally {
    restore();
  }
});

test('미니 아날로그 시계 (세계 시간 목록·트레이 아이콘)', () => {
  const restore = installDom();
  try {
    const canvas = fakeCanvas(64, 64);
    drawMiniAnalogClock(canvas, AT, COLORS);
    assert.ok(canvas.ctx.countOf('arc') >= 1);
    assert.ok(canvas.ctx.countOf('lineTo') >= 2, '최소한 시침·분침은 그린다');
  } finally {
    restore();
  }
});

test('아날로그 색은 테마 CSS 변수에서 읽어 온다', () => {
  const restore = installDom({
    '--clock-face': '#001122',
    '--clock-border': '#334455',
    '--second-hand': '#FF0000'
  });
  try {
    const colors = analogColorsFrom();
    assert.equal(colors.face, '#001122');
    assert.equal(colors.border, '#334455');
    assert.equal(colors.secondHand, '#FF0000');
    // 테마에 없는 색은 기본값으로 채운다 — 색이 비어 시계가 사라지지 않도록.
    assert.match(colors.hourHand, /^#[0-9A-Fa-f]{6}$/);
  } finally {
    restore();
  }
});

test('7세그먼트 — 글자 폭 계산', () => {
  assert.equal(sevenSegmentWidth(''), 0);
  assert.ok(sevenSegmentWidth('12:34:56') > sevenSegmentWidth('12:34'));
  assert.ok(sevenSegmentWidth(':') < sevenSegmentWidth('0'), '콜론은 숫자보다 좁다');
});

test('7세그먼트 — 켜진 세그먼트만 고른 색으로 그린다', () => {
  const restore = installDom();
  try {
    const canvas = fakeCanvas(280, 100);
    drawSevenSegment(canvas, '10:08:42', '#58A6FF');
    const ctx = canvas.ctx;

    assert.ok(ctx.countOf('fill') > 20, `세그먼트를 그린 횟수: ${ctx.countOf('fill')}`);
    const colors = new Set(ctx.colors());
    assert.deepEqual([...colors], ['#58A6FF'], '꺼진 세그먼트는 아예 그리지 않는다');

    // 1 은 두 세그먼트, 8 은 일곱 세그먼트 — 같은 자리 수라도 그린 양이 다르다.
    const one = fakeCanvas(80, 100);
    const eight = fakeCanvas(80, 100);
    drawSevenSegment(one, '1', '#58A6FF');
    drawSevenSegment(eight, '8', '#58A6FF');
    assert.ok(eight.ctx.countOf('fill') > one.ctx.countOf('fill'));
  } finally {
    restore();
  }
});

test('도트 매트릭스 — 글자 폭과 점 찍기', () => {
  const restore = installDom();
  try {
    assert.equal(dotMatrixWidth(''), 0);
    assert.ok(dotMatrixWidth('00:00') > dotMatrixWidth('00'));

    const canvas = fakeCanvas(280, 100);
    drawDotMatrix(canvas, '10:08:42', '#A6E3A1');
    assert.ok(canvas.ctx.countOf('fillRect') > 40, `점을 찍은 횟수: ${canvas.ctx.countOf('fillRect')}`);
    assert.deepEqual([...new Set(canvas.ctx.colors())], ['#A6E3A1']);
  } finally {
    restore();
  }
});

test('디지털 스타일 10가지 — 캔버스로 그릴 것과 글꼴로 그릴 것이 갈린다', () => {
  assert.equal(DIGITAL_STYLES.length, 10);
  assert.equal(usesCanvasDigital('SevenSegment'), true);
  assert.equal(usesCanvasDigital('DotMatrix'), true);

  for (const style of DIGITAL_STYLES) {
    if (usesCanvasDigital(style.id)) continue;
    const font = textDigitalFont(style.id);
    assert.ok(font.family, `${style.id}: 글꼴이 없다`);
    assert.ok(font.size >= 20, `${style.id}: 글자가 너무 작다`);
    assert.ok(font.weight >= 100 && font.weight <= 900);
    assert.ok(font.glow >= 0);
  }
  // 모르는 스타일에도 글꼴을 준다 — 빈 화면이 되지 않도록.
  assert.ok(textDigitalFont('없는스타일').family);
});

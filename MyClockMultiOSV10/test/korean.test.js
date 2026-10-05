'use strict';

/** 한글 시각 표기 — 디지털 "한글" 스타일이 쓰는 변환. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { toSino, formatKoreanClock, formatKoreanCountdown } = require('../src/js/korean');

test('한자어 수사 0~59', () => {
  assert.equal(toSino(0), '영');
  assert.equal(toSino(1), '일');
  assert.equal(toSino(9), '구');
  assert.equal(toSino(10), '십');
  assert.equal(toSino(11), '십일');
  assert.equal(toSino(19), '십구');
  assert.equal(toSino(20), '이십');
  assert.equal(toSino(21), '이십일');
  assert.equal(toSino(30), '삼십');
  assert.equal(toSino(45), '사십오');
  assert.equal(toSino(59), '오십구');
});

test('한자어 수사 — 범위를 벗어나면 숫자 그대로', () => {
  assert.equal(toSino(100), '100');
  assert.equal(toSino(-1), '-1');
  assert.equal(toSino(1.5), '1.5');
});

test('12시간 표기는 고유어 시(한 시, 두 시…)를 쓴다', () => {
  const at = (h, m, s) => formatKoreanClock(new Date(2026, 0, 1, h, m, s), false, true);
  assert.equal(at(1, 0, 0), '한시:영분:영초');
  assert.equal(at(13, 5, 9), '한시:오분:구초');
  assert.equal(at(0, 30, 0), '열두시:삼십분:영초');
  assert.equal(at(12, 0, 0), '열두시:영분:영초');
  assert.equal(at(23, 59, 59), '열한시:오십구분:오십구초');
});

test('24시간 표기는 한자어 시(십삼 시)를 쓴다', () => {
  const at = (h, m) => formatKoreanClock(new Date(2026, 0, 1, h, m, 0), true, false);
  assert.equal(at(13, 5), '십삼시:오분');
  assert.equal(at(0, 0), '영시:영분');
  assert.equal(at(20, 40), '이십시:사십분');
});

test('초를 숨기면 시·분만 나온다', () => {
  assert.equal(formatKoreanClock(new Date(2026, 0, 1, 9, 7, 30), false, false), '아홉시:칠분');
});

test('카운트다운 — 한 시간이 넘으면 시간 자리가 붙는다', () => {
  assert.equal(formatKoreanCountdown(0, true), '영분:영초');
  assert.equal(formatKoreanCountdown(65 * 1000, true), '일분:오초');
  assert.equal(formatKoreanCountdown(3661 * 1000, true), '일시간:일분:일초');
  assert.equal(formatKoreanCountdown(3661 * 1000, false), '일시간:일분');
  assert.equal(formatKoreanCountdown(-5000, true), '영분:영초', '음수는 0으로 본다');
});

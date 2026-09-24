'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaps, DOUBLE_MS } = require('../src/shared/taps');

// 시계를 직접 쥐고 시간을 흘려 본다.
function fake() {
  let now = 1000;
  const taps = createTaps(DOUBLE_MS, () => now);
  return { taps, wait: (ms) => { now += ms; } };
}

test('같은 아이콘을 빠르게 두 번 누르면 실행한다', () => {
  const { taps, wait } = fake();
  assert.equal(taps.tap('a.lnk'), false, '한 번 눌러서는 실행하지 않는다');
  wait(120);
  assert.equal(taps.tap('a.lnk'), true);
});

test('천천히 두 번 누르면 실행하지 않는다', () => {
  const { taps, wait } = fake();
  taps.tap('a.lnk');
  wait(DOUBLE_MS + 1);
  assert.equal(taps.tap('a.lnk'), false);
});

test('다른 아이콘을 이어서 누르면 실행하지 않는다', () => {
  const { taps, wait } = fake();
  taps.tap('a.lnk');
  wait(50);
  assert.equal(taps.tap('b.lnk'), false);
  wait(50);
  assert.equal(taps.tap('b.lnk'), true, 'b 를 두 번 누른 것은 센다');
});

test('세 번 눌러도 한 번만 실행한다', () => {
  const { taps, wait } = fake();
  assert.equal(taps.tap('a.lnk'), false);
  wait(80);
  assert.equal(taps.tap('a.lnk'), true);
  wait(80);
  assert.equal(taps.tap('a.lnk'), false, '세 번째는 새로 세기 시작한다');
  wait(80);
  assert.equal(taps.tap('a.lnk'), true);
});

test('끌어 옮긴 뒤에는 두 번 누른 것으로 세지 않는다', () => {
  const { taps, wait } = fake();
  taps.tap('a.lnk');
  taps.forget();
  wait(50);
  assert.equal(taps.tap('a.lnk'), false);
  assert.equal(taps.pending(), 'a.lnk');
});

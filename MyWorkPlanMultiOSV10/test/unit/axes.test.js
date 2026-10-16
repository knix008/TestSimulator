// Chart axes (src/ui/axes.js): round ticks, short labels, date label spacing.
import assert from 'node:assert/strict';
import test from 'node:test';
import { compactMoney, labelIndexes, niceTicks, valueAxis } from '../../src/ui/axes.js';

const isRound = (step) => [1, 2, 2.5, 5].some((m) => Math.abs(step / 10 ** Math.floor(Math.log10(step)) - m) < 1e-9);

test('ticks start at 0, use round steps, cover the maximum with little room to spare', () => {
  for (const max of [0.9, 1, 7, 48, 110, 146, 160, 763.63, 3e6, 5.9e7]) {
    const { step, top, ticks } = niceTicks(max);
    assert.equal(ticks[0], 0, `${max}`);
    assert.ok(isRound(step), `${max}: step ${step}`);
    assert.ok(top >= max, `${max}: axis end ${top}`);
    assert.ok(top < max * 1.6 + step, `${max}: axis end ${top} not far above`);
    assert.ok(ticks.length >= 4 && ticks.length <= 9, `${max}: ${ticks.length} ticks`);
    for (let i = 1; i < ticks.length; i++) assert.ok(Math.abs(ticks[i] - ticks[i - 1] - step) < step * 1e-9);
  }
  assert.deepEqual(niceTicks(763.63).ticks, [0, 200, 400, 600, 800]);
  assert.deepEqual(niceTicks(146).ticks, [0, 50, 100, 150]);
});

test('a cap on the number of intervals (narrow bar charts)', () => {
  for (const max of [48, 110, 160, 7, 9e5]) assert.ok(niceTicks(max, 4, 5).ticks.length <= 6, `${max}`);
});

test('nothing to show still gives an axis', () => {
  assert.deepEqual(niceTicks(0).ticks, [0, 1]);
  assert.deepEqual(niceTicks(Number.NaN).ticks, [0, 1]);
});

test('value axes: hours from minutes, money in 만/억 or K/M, percent fixed 0–100', () => {
  const hours = valueAxis(146 * 60, 'hours', { language: 'ko' });
  assert.deepEqual(hours.ticks.map((tick) => tick.text), ['0시간', '50시간', '100시간', '150시간']);
  assert.equal(hours.top, 150 * 60);
  assert.deepEqual(hours.ticks.map((tick) => tick.at), [0, 1 / 3, 2 / 3, 1]);
  assert.deepEqual(valueAxis(146 * 60, 'hours', { language: 'en' }).ticks.map((tick) => tick.text), ['0h', '50h', '100h', '150h']);
  assert.deepEqual(valueAxis(5.9e7, 'money', { currency: 'KRW', language: 'ko' }).ticks.map((tick) => tick.text), ['₩0', '₩2,000만', '₩4,000만', '₩6,000만']);
  assert.deepEqual(valueAxis(5.9e7, 'money', { currency: 'USD', language: 'en' }).ticks.map((tick) => tick.text), ['$0', '$20M', '$40M', '$60M']);
  assert.deepEqual(valueAxis(37, 'percent').ticks.map((tick) => tick.text), ['0%', '25%', '50%', '75%', '100%']);
  assert.equal(compactMoney(250000000, 'KRW', 'ko'), '₩2.5억');
  assert.equal(compactMoney(3500, 'EUR', 'en'), '€3.5K');
});

test('date labels are spaced so they do not touch', () => {
  assert.deepEqual(labelIndexes(10, 1000, 64), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const some = labelIndexes(80, 640, 64);
  assert.equal(some[0], 0);
  const gap = (640 / 80) * (some[1] - some[0]);
  assert.ok(gap >= 64, `labels ${gap}px apart`);
  assert.deepEqual(labelIndexes(0, 500), []);
});

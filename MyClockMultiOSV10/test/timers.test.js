'use strict';

/** 타이머 · 스톱워치 — 시작/일시정지/정지, 완료 알림, 랩 기록. */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CountdownTimer,
  Stopwatch,
  formatCentiseconds,
  formatHms,
  TIMER_IDLE,
  TIMER_RUNNING,
  TIMER_PAUSED
} = require('../src/js/timers');

test('시간 표기 — HH:MM:SS 와 HH:MM:SS.cc', () => {
  assert.equal(formatHms(0), '00:00:00');
  assert.equal(formatHms(5 * 60 * 1000), '00:05:00');
  assert.equal(formatHms(3661 * 1000), '01:01:01');
  assert.equal(formatHms(-5000), '00:00:00', '음수는 0으로 본다');
  assert.equal(formatCentiseconds(0), '00:00:00.00');
  assert.equal(formatCentiseconds(1234), '00:00:01.23');
  assert.equal(formatCentiseconds(3600 * 1000 + 70 * 1000 + 90), '01:01:10.09');
});

test('타이머 — 시/분/초로 기간을 정한다', () => {
  const timer = new CountdownTimer({ hours: 1, minutes: 2, seconds: 3 });
  assert.equal(timer.durationMs, (3600 + 120 + 3) * 1000);
  assert.equal(timer.remainingMs, timer.durationMs);
  assert.equal(timer.state, TIMER_IDLE);
  assert.ok(timer.id.startsWith('timer-'));
});

test('타이머 — 입력값은 한계를 넘지 않고, 돌아가는 중에는 바뀌지 않는다', () => {
  const timer = new CountdownTimer({ minutes: 5 });
  timer.setField('minutes', 90);
  assert.equal(timer.minutes, 59);
  timer.setField('seconds', -10);
  assert.equal(timer.seconds, 0);
  timer.setField('hours', 500);
  assert.equal(timer.hours, 99);
  timer.setField('없는칸', 3);
  assert.equal(timer.hours, 99, '모르는 칸은 무시한다');

  timer.setField('hours', 0);
  timer.setField('minutes', 1);
  timer.setField('seconds', 0);
  timer.start();
  timer.setField('minutes', 30);
  assert.equal(timer.durationMs, 60 * 1000, '돌아가는 중에는 기간이 바뀌지 않는다');
});

test('타이머 — 시작·일시정지·재개·정지', () => {
  const timer = new CountdownTimer({ minutes: 0, seconds: 10 });
  timer.start();
  assert.equal(timer.state, TIMER_RUNNING);
  assert.equal(timer.toView().startLabel, '시작');

  timer.pause();
  assert.equal(timer.state, TIMER_PAUSED);
  assert.equal(timer.toView().startLabel, '재개');
  const held = timer.remainingMs;
  assert.ok(held > 0 && held <= 10000);

  timer.start();
  assert.equal(timer.state, TIMER_RUNNING);

  timer.stop();
  assert.equal(timer.state, TIMER_IDLE);
  assert.equal(timer.remainingMs, timer.durationMs, '정지하면 처음 기간으로 돌아간다');
});

test('타이머 — 0초가 되면 완료를 한 번만 알린다', () => {
  const timer = new CountdownTimer({ minutes: 0, seconds: 1 });
  let fired = 0;
  timer.onCompleted = () => {
    fired += 1;
  };

  timer.start();
  // 끝날 시각을 과거로 돌려 "다 지난" 상태를 흉내 낸다.
  timer.endAt = Date.now() - 1;
  timer.tick();
  timer.tick();
  timer.tick();

  assert.equal(fired, 1);
  assert.equal(timer.remainingMs, 0);
  assert.equal(timer.state, TIMER_IDLE);
});

test('타이머 — 기간이 0이면 시작하지 않는다', () => {
  const timer = new CountdownTimer({ hours: 0, minutes: 0, seconds: 0 });
  timer.start();
  assert.equal(timer.state, TIMER_IDLE);
});

test('타이머 — 패널로 보낼 표현과 설정으로 저장할 표현', () => {
  const timer = new CountdownTimer({ label: '라면', minutes: 3 });
  const view = timer.toView();
  assert.equal(view.label, '라면');
  assert.equal(view.display, '00:03:00.00');
  assert.equal(view.endAt, 0, '돌지 않는 동안에는 종료 시각을 보내지 않는다');
  assert.equal(view.canStart, true);
  assert.equal(view.canStop, false);

  timer.start();
  assert.ok(timer.toView().endAt > Date.now(), '돌 때는 종료 시각을 함께 보낸다');
  assert.deepEqual(timer.toSettings(), { label: '라면', hours: 0, minutes: 3, seconds: 0 });
});

test('타이머 — 시계에 카운트다운을 띄울 때를 가린다', () => {
  const timer = new CountdownTimer({ minutes: 3 });
  assert.equal(timer.isDisplayingCountdown, false, '손대지 않은 타이머는 시계를 가리지 않는다');
  timer.start();
  assert.equal(timer.isDisplayingCountdown, true);
  timer.pause();
  assert.equal(timer.isDisplayingCountdown, true);
  timer.stop();
  assert.equal(timer.isDisplayingCountdown, false);
});

test('스톱워치 — 시작하면 흐르고 정지하면 멈춘다', async () => {
  const sw = new Stopwatch();
  assert.equal(sw.elapsedMs, 0);

  sw.start();
  assert.equal(sw.running, true);
  await new Promise((done) => setTimeout(done, 30));
  const running = sw.elapsedMs;
  assert.ok(running >= 20, `흐른 시간: ${running}ms`);

  sw.stop();
  const stopped = sw.elapsedMs;
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(sw.elapsedMs, stopped, '정지하면 더 흐르지 않는다');

  sw.start();
  await new Promise((done) => setTimeout(done, 20));
  assert.ok(sw.elapsedMs > stopped, '다시 시작하면 이어서 흐른다');
});

test('스톱워치 — 랩은 최신 것이 맨 위에 쌓인다', () => {
  const sw = new Stopwatch();
  sw.start();
  sw.recordLap();
  sw.recordLap();
  sw.recordLap();

  const view = sw.toView();
  assert.equal(view.laps.length, 3);
  assert.deepEqual(view.laps.map((l) => l.label), ['#03', '#02', '#01']);
  assert.match(view.display, /^\d\d:\d\d:\d\d\.\d\d$/);

  sw.reset();
  assert.equal(sw.running, false);
  assert.equal(sw.elapsedMs, 0);
  assert.deepEqual(sw.toView().laps, []);
});

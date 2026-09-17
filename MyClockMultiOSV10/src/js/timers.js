'use strict';

/**
 * 타이머 / 스톱워치 — MyClockWinV10/Services/TimerService.cs, StopwatchService.cs,
 * Models/TimerItem.cs 이식. 시계 창이 상태를 소유하고 패널 창은 보기만 한다.
 */

const TIMER_IDLE = 'Idle';
const TIMER_RUNNING = 'Running';
const TIMER_PAUSED = 'Paused';

/** ms → "HH:MM:SS.cc" */
function formatCentiseconds(ms) {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** ms → "HH:MM:SS" */
function formatHms(ms) {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 카운트다운 타이머 하나. 남은 시간은 종료 시각 기준으로 계산해 드리프트가 없다. */
class CountdownTimer {
  constructor({ label = '', hours = 0, minutes = 5, seconds = 0 } = {}) {
    this.id = `timer-${Math.random().toString(36).slice(2, 10)}`;
    this.label = label;
    this.hours = hours;
    this.minutes = minutes;
    this.seconds = seconds;
    this.state = TIMER_IDLE;
    this.durationMs = this.configuredDurationMs();
    this.remainingMs = this.durationMs;
    this.endAt = 0;
    this.pausedRemaining = 0;
    /** @type {null | (timer: CountdownTimer) => void} */
    this.onCompleted = null;
  }

  configuredDurationMs() {
    return ((this.hours * 60 + this.minutes) * 60 + this.seconds) * 1000;
  }

  get isIdle() {
    return this.state === TIMER_IDLE;
  }
  get isRunning() {
    return this.state === TIMER_RUNNING;
  }
  get isPaused() {
    return this.state === TIMER_PAUSED;
  }
  /** 시계 본체에 카운트다운을 띄워야 하는 상태인가. */
  get isDisplayingCountdown() {
    return this.state !== TIMER_IDLE || this.remainingMs !== this.durationMs;
  }

  /** 시/분/초 입력값을 기간에 반영 — 정지 상태에서만 가능. */
  applyDuration() {
    if (!this.isIdle) return;
    this.durationMs = this.configuredDurationMs();
    this.remainingMs = this.durationMs;
  }

  setField(field, value) {
    const limits = { hours: 99, minutes: 59, seconds: 59 };
    if (!(field in limits)) return;
    this[field] = Math.min(limits[field], Math.max(0, Math.round(value)));
    this.applyDuration();
  }

  start() {
    if (this.durationMs <= 0) return;
    if (this.state === TIMER_PAUSED) {
      this.endAt = Date.now() + this.pausedRemaining;
    } else {
      this.remainingMs = this.durationMs;
      this.endAt = Date.now() + this.remainingMs;
    }
    this.state = TIMER_RUNNING;
    this.tick();
  }

  pause() {
    if (this.state !== TIMER_RUNNING) return;
    this.remainingMs = Math.max(0, this.endAt - Date.now());
    this.pausedRemaining = this.remainingMs;
    this.state = TIMER_PAUSED;
  }

  stop() {
    this.remainingMs = this.durationMs;
    this.pausedRemaining = this.durationMs;
    this.state = TIMER_IDLE;
  }

  /** 매 프레임 호출 — 0에 도달하면 한 번만 완료 콜백을 부른다. */
  tick() {
    if (this.state !== TIMER_RUNNING) return;
    this.remainingMs = Math.max(0, this.endAt - Date.now());
    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.state = TIMER_IDLE;
      if (this.onCompleted) this.onCompleted(this);
    }
  }

  /** 패널 창으로 보낼 직렬화 가능한 표현. */
  toView() {
    return {
      id: this.id,
      label: this.label,
      hours: this.hours,
      minutes: this.minutes,
      seconds: this.seconds,
      state: this.state,
      remainingMs: this.remainingMs,
      // 패널이 IPC 없이도 매 프레임 남은 시간을 직접 계산할 수 있도록 종료 시각을 함께 보낸다.
      endAt: this.state === TIMER_RUNNING ? this.endAt : 0,
      durationMs: this.durationMs,
      display: formatCentiseconds(this.remainingMs),
      startLabel: this.isPaused ? '재개' : '시작',
      canStart: this.state !== TIMER_RUNNING,
      canStop: this.state !== TIMER_IDLE
    };
  }

  toSettings() {
    return { label: this.label, hours: this.hours, minutes: this.minutes, seconds: this.seconds };
  }
}

/** 랩 기록이 있는 스톱워치. */
class Stopwatch {
  constructor() {
    this.running = false;
    this.startedAt = 0;
    this.accumulated = 0;
    /** @type {{number: number, timeMs: number}[]} */
    this.laps = [];
  }

  get elapsedMs() {
    return this.accumulated + (this.running ? Date.now() - this.startedAt : 0);
  }

  start() {
    if (this.running) return;
    this.startedAt = Date.now();
    this.running = true;
  }

  stop() {
    if (!this.running) return;
    this.accumulated = this.elapsedMs;
    this.running = false;
  }

  recordLap() {
    this.laps.unshift({ number: this.laps.length + 1, timeMs: this.elapsedMs });
  }

  reset() {
    this.running = false;
    this.startedAt = 0;
    this.accumulated = 0;
    this.laps = [];
  }

  toView() {
    return {
      running: this.running,
      startedAt: this.startedAt,
      accumulated: this.accumulated,
      elapsedMs: this.elapsedMs,
      display: formatCentiseconds(this.elapsedMs),
      laps: this.laps.map((lap) => ({
        number: lap.number,
        label: `#${String(lap.number).padStart(2, '0')}`,
        display: formatCentiseconds(lap.timeMs)
      }))
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    CountdownTimer,
    Stopwatch,
    formatCentiseconds,
    formatHms,
    TIMER_IDLE,
    TIMER_RUNNING,
    TIMER_PAUSED
  };
}

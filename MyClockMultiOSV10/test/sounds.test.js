'use strict';

/** 알람음 — 카탈로그와 소리 합성, 재생/정지/볼륨. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { ALARM_SOUNDS } = require('../src/js/data/styles');
const { PATTERNS, AlarmSoundPlayer } = require('../src/js/tones');

/** 소리를 내지 않는 가짜 Web Audio — 무엇을 재생하라고 했는지만 적어 둔다. */
function fakeAudio() {
  const log = { buffers: [], started: 0, stopped: 0, gains: [], resumed: 0 };

  class FakeBuffer {
    constructor(channels, length, rate) {
      this.length = length;
      this.sampleRate = rate;
      this.data = new Float32Array(length);
    }
    getChannelData() {
      return this.data;
    }
  }

  const context = {
    state: 'suspended',
    destination: { name: 'speakers' },
    resume() {
      log.resumed += 1;
      context.state = 'running';
    },
    createBuffer(channels, length, rate) {
      const buffer = new FakeBuffer(channels, length, rate);
      log.buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        onended: null,
        start() {
          log.started += 1;
        },
        stop() {
          log.stopped += 1;
        },
        connect(next) {
          return next;
        },
        disconnect() {}
      };
    },
    createGain() {
      const gain = { gain: { value: 1 }, connect: (next) => next, disconnect() {} };
      log.gains.push(gain);
      return gain;
    }
  };

  const saved = global.window;
  global.window = { AudioContext: function AudioContext() { return context; } };
  const restore = () => {
    global.window = saved;
  };
  restore.log = log;
  restore.context = context;
  return restore;
}

test('알람음 카탈로그의 모든 소리에 합성 공식이 있다', () => {
  assert.ok(ALARM_SOUNDS.length >= 30, `알람음 수: ${ALARM_SOUNDS.length}`);
  for (const sound of ALARM_SOUNDS) {
    assert.ok(PATTERNS[sound.id], `${sound.id}(${sound.label}) 의 소리를 만들 수 없다`);
  }
  assert.equal(new Set(ALARM_SOUNDS.map((s) => s.id)).size, ALARM_SOUNDS.length, 'id 가 겹친다');
  assert.equal(new Set(ALARM_SOUNDS.map((s) => s.label)).size, ALARM_SOUNDS.length, '이름이 겹친다');
});

test('모든 알람음이 들리는 길이의 정상적인 파형을 만든다', () => {
  for (const sound of ALARM_SOUNDS) {
    const samples = PATTERNS[sound.id]();
    assert.ok(samples instanceof Float32Array, `${sound.id}: 파형이 아니다`);
    // 44.1kHz 기준 최소 0.3초 — 너무 짧으면 알람으로 들리지 않는다.
    assert.ok(samples.length > 44100 * 0.3, `${sound.id}: 너무 짧다 (${samples.length})`);

    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i];
      if (!Number.isFinite(value)) throw new Error(`${sound.id}: ${i} 번째 표본이 숫자가 아니다`);
      peak = Math.max(peak, Math.abs(value));
    }
    assert.ok(peak > 0.1, `${sound.id}: 소리가 거의 없다 (peak ${peak.toFixed(3)})`);
    assert.ok(peak <= 1.0001, `${sound.id}: 진폭이 넘친다 (peak ${peak.toFixed(3)})`);
  }
});

test('알람음 재생 — 반복으로 틀고, 정지하면 멈춘다', () => {
  const restore = fakeAudio();
  try {
    const player = new AlarmSoundPlayer();
    player.play('Marimba', 0.4, true);

    assert.equal(restore.log.started, 1);
    assert.equal(restore.log.gains.at(-1).gain.value, 0.4);
    assert.equal(restore.context.state, 'running', '멈춰 있던 오디오를 깨운다');

    player.stop();
    assert.equal(restore.log.stopped, 1);
    player.stop();
    assert.equal(restore.log.stopped, 1, '두 번 정지해도 한 번만 멈춘다');
  } finally {
    restore();
  }
});

test('미리듣기는 한 번만 재생한다', () => {
  const restore = fakeAudio();
  try {
    const player = new AlarmSoundPlayer();
    player.preview('Bell', 0.5);
    assert.equal(restore.log.started, 1);
    assert.equal(restore.log.buffers.length, 1);
  } finally {
    restore();
  }
});

test('같은 소리를 다시 틀면 만들어 둔 파형을 다시 쓴다', () => {
  const restore = fakeAudio();
  try {
    const player = new AlarmSoundPlayer();
    player.play('Radar', 0.3);
    player.play('Radar', 0.3);
    assert.equal(restore.log.buffers.length, 1, '파형을 두 번 만들지 않는다');
    player.play('Chime', 0.3);
    assert.equal(restore.log.buffers.length, 2);
  } finally {
    restore();
  }
});

test('모르는 알람음을 고르면 기본 소리로 대신한다', () => {
  const restore = fakeAudio();
  try {
    const player = new AlarmSoundPlayer();
    player.play('없는소리', 0.3);
    assert.equal(restore.log.started, 1);
    assert.equal(restore.log.buffers.length, 1);
  } finally {
    restore();
  }
});

test('볼륨은 0~1 밖으로 나가지 않는다', () => {
  const restore = fakeAudio();
  try {
    const player = new AlarmSoundPlayer();
    player.play('Marimba', 5);
    assert.equal(restore.log.gains.at(-1).gain.value, 1);

    player.setVolume(-3);
    assert.equal(player.volume, 0);
    assert.equal(restore.log.gains.at(-1).gain.value, 0, '틀고 있는 소리에도 바로 먹는다');

    player.setVolume(0.6);
    assert.equal(restore.log.gains.at(-1).gain.value, 0.6);
  } finally {
    restore();
  }
});

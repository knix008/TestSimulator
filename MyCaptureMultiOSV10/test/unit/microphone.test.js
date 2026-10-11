import test from 'node:test';
import assert from 'node:assert/strict';
import { gainFactor, measureLevel, meterPosition } from '../../src/platform/microphone.js';
import { defaultSettings, IMAGE_FORMATS, sanitizeSettings } from '../../src/domain/settings.js';

test('gain: percent → linear factor, clamped to 0–2', () => {
  assert.equal(gainFactor(100), 1);
  assert.equal(gainFactor(50), 0.5);
  assert.equal(gainFactor(300), 2);
  assert.equal(gainFactor(-5), 0);
});

test('level: peak and dBFS of a sample buffer', () => {
  assert.deepEqual(measureLevel(new Float32Array(16)), { peak: 0, db: -Infinity });
  const half = measureLevel(Float32Array.from([0.1, -0.5, 0.2]));
  assert.equal(half.peak, 0.5);
  assert.ok(Math.abs(half.db - -6.0206) < 0.001);
  assert.equal(measureLevel(Float32Array.from([1.7])).peak, 1, 'clipped input reads as full scale');
});

test('meter: -60 dB … 0 dB maps to 0 … 1', () => {
  assert.equal(meterPosition(-Infinity), 0);
  assert.equal(meterPosition(-80), 0);
  assert.equal(meterPosition(-30), 0.5);
  assert.equal(meterPosition(0), 1);
  assert.equal(meterPosition(6), 1);
});

test('settings: microphone, language, panel and the six image formats', () => {
  assert.deepEqual(IMAGE_FORMATS, ['jpg', 'png', 'gif', 'tiff', 'bmp', 'webp']);
  for (const format of IMAGE_FORMATS) assert.equal(sanitizeSettings({ imageFormat: format }).imageFormat, format);
  assert.equal(sanitizeSettings({ imageFormat: 'heic' }).imageFormat, 'jpg');
  const s = sanitizeSettings({ micGain: '250', micDeviceId: 'abc', language: 'en', sidebarCollapsed: true });
  assert.equal(s.micGain, 200);
  assert.equal(s.micDeviceId, 'abc');
  assert.equal(s.language, 'en');
  assert.equal(s.sidebarCollapsed, true);
  assert.equal(sanitizeSettings({ language: 'de' }).language, null, 'unknown language → follow the system');
  assert.equal(sanitizeSettings({ micDeviceId: '' }).micDeviceId, null);
  assert.equal(defaultSettings.micGain, 100);
});

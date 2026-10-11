import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedMs, initialSession, isActive, sessionReducer } from '../../src/domain/session.js';
import { baseName, formatBytes, formatDuration, joinPath, timestampStem } from '../../src/domain/naming.js';
import { clampRect, evenSize, fitInside, rectFromPoints, videoBitrate, viewToImage } from '../../src/domain/geometry.js';
import { captureSource, defaultSettings, loadSettings, sanitizeSettings, STORAGE_KEY, storeSettings } from '../../src/domain/settings.js';

const run = (actions) => actions.reduce(sessionReducer, initialSession);

test('recording lifecycle: idle → starting → recording ⇄ paused → stopping → idle', () => {
  let state = run([{ type: 'START_REQUEST' }]);
  assert.equal(state.phase, 'starting');
  assert.ok(isActive(state));
  state = sessionReducer(state, { type: 'STARTED', outputPath: 'a.mp4', at: 1000 });
  assert.equal(state.phase, 'recording');
  state = sessionReducer(state, { type: 'PAUSE', at: 3000 });
  assert.equal(elapsedMs(state, 99_999), 2000, 'paused time does not count');
  state = sessionReducer(state, { type: 'RESUME', at: 5000 });
  assert.equal(elapsedMs(state, 6000), 3000);
  state = sessionReducer(state, { type: 'STOP_REQUEST', at: 7000 });
  assert.equal(state.phase, 'stopping');
  assert.equal(elapsedMs(state, 50_000), 4000, 'stopped clock is frozen');
  state = sessionReducer(state, { type: 'FINISHED' });
  assert.equal(state, initialSession);
});

test('stopping while paused counts the pause', () => {
  const state = run([
    { type: 'START_REQUEST' }, { type: 'STARTED', outputPath: 'a', at: 0 },
    { type: 'PAUSE', at: 1000 }, { type: 'STOP_REQUEST', at: 9000 },
  ]);
  assert.equal(elapsedMs(state, 0), 1000);
});

test('invalid transitions leave the state untouched; failures and cancel return to idle', () => {
  assert.equal(sessionReducer(initialSession, { type: 'PAUSE', at: 1 }), initialSession);
  assert.equal(sessionReducer(initialSession, { type: 'STOP_REQUEST', at: 1 }), initialSession);
  const recording = run([{ type: 'START_REQUEST' }, { type: 'STARTED', outputPath: 'a', at: 0 }]);
  assert.equal(sessionReducer(recording, { type: 'START_REQUEST' }), recording);
  assert.equal(sessionReducer(recording, { type: 'CANCEL' }), recording);
  const failed = sessionReducer(recording, { type: 'FAIL', error: 'disk full' });
  assert.equal(failed.phase, 'idle');
  assert.equal(failed.error, 'disk full');
  assert.equal(sessionReducer(run([{ type: 'START_REQUEST' }]), { type: 'CANCEL' }).phase, 'idle');
  assert.equal(sessionReducer(failed, { type: 'START_REQUEST' }).error, null, 'a new attempt clears the old error');
});

test('file names and formatting', () => {
  assert.equal(timestampStem('Capture', new Date(2026, 0, 2, 3, 4, 5)), 'Capture_2026-01-02_03-04-05');
  assert.equal(joinPath('C:\\Pics\\', 'a.png', 'windows'), 'C:\\Pics\\a.png');
  assert.equal(joinPath('/home/u/Pictures/', 'a.png', 'linux'), '/home/u/Pictures/a.png');
  assert.equal(joinPath(null, 'a.png', 'linux'), 'a.png');
  assert.equal(baseName('C:\\x\\y\\z.mp4'), 'z.mp4');
  assert.equal(baseName('/a/b.webm'), 'b.webm');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(250 * 1024 * 1024), '250 MB');
  assert.equal(formatDuration(65_400), '01:05');
  assert.equal(formatDuration(3_723_000), '1:02:03');
});

test('geometry: drag rectangles, clamping and view → image mapping', () => {
  assert.deepEqual(rectFromPoints({ x: 10, y: 20 }, { x: 4, y: 2 }), { x: 4, y: 2, width: 6, height: 18 });
  assert.deepEqual(clampRect({ x: -5, y: 2.4, width: 20, height: 3.2 }, 10, 10), { x: 0, y: 2, width: 10, height: 4 });
  assert.deepEqual(clampRect({ x: 50, y: 50, width: 5, height: 5 }, 10, 10), { x: 10, y: 10, width: 0, height: 0 });
  // 150% scaling: a 1280×720 CSS view over a 1920×1080 screenshot.
  assert.deepEqual(viewToImage({ x: 100, y: 100, width: 200, height: 100 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }),
    { x: 150, y: 150, width: 300, height: 150 });
  assert.deepEqual(evenSize(1281, 721), { width: 1280, height: 720 });
  assert.deepEqual(evenSize(1, 1), { width: 2, height: 2 });
  assert.deepEqual(fitInside({ width: 100, height: 50 }, { width: 200, height: 200 }), { x: 0, y: 50, width: 200, height: 100 });
  assert.equal(videoBitrate(10, 10, 15), 2e6);
  assert.equal(videoBitrate(1920, 1080, 30), Math.round(1920 * 1080 * 30 * 0.12));
  assert.equal(videoBitrate(7680, 4320, 60), 40e6);
});

test('settings: sanitize anything, round-trip through storage', () => {
  assert.deepEqual(sanitizeSettings(null), { ...defaultSettings });
  const odd = sanitizeSettings({ mode: 'hack', fps: '60', jpegQuality: 7, region: { monitorId: 1, x: 0, y: 0, width: 0, height: 5 }, askPath: 'yes' });
  assert.equal(odd.mode, 'capture');
  assert.equal(odd.fps, 60);
  assert.equal(odd.jpegQuality, 40);
  assert.equal(odd.region, null);
  assert.equal(odd.askPath, true);

  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  storeSettings(storage, { ...defaultSettings, imageFormat: 'png', windowId: 42 });
  assert.equal(loadSettings(storage).imageFormat, 'png');
  assert.equal(loadSettings(storage).windowId, 42);
  memory.set(STORAGE_KEY, '{broken');
  assert.deepEqual(loadSettings(storage), { ...defaultSettings });
  assert.deepEqual(loadSettings({ getItem: () => { throw new Error('denied'); } }), { ...defaultSettings });
});

test('settings map to backend capture sources', () => {
  assert.deepEqual(captureSource({ ...defaultSettings }), { kind: 'allMonitors' });
  assert.deepEqual(captureSource({ ...defaultSettings, monitorId: 3 }), { kind: 'monitor', id: 3 });
  assert.equal(captureSource({ ...defaultSettings, target: 'window' }), null);
  assert.deepEqual(captureSource({ ...defaultSettings, target: 'window', windowId: 9 }), { kind: 'window', id: 9 });
  const region = { monitorId: 1, x: 2, y: 3, width: 4, height: 5 };
  assert.deepEqual(captureSource({ ...defaultSettings, target: 'region', region }), { kind: 'region', ...region });
});

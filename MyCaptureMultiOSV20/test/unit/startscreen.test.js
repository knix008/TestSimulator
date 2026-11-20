// Start screen: background settings, theme names, recent captures (newest first, delete one / delete all),
// entries whose file is gone, and the moving capture background (startbg.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneMissing } from '../../src/domain/gallery.js';
import {
  defaultSettings, sanitizeSettings, START_BG_KINDS, START_BG_MOTIONS, START_BG_SETTINGS, START_BG_SHUFFLE, START_BG_SPEED, START_BG_TRANSPARENCY, START_CARD_TRANSPARENCY,
} from '../../src/domain/settings.js';
import { GENERAL_SCENES } from '../../src/startscenes.js';
import { messages, setLanguage } from '../../src/i18n.js';
import { startHtml } from '../../src/start.js';
import { backgroundOptions, CYCLE, DEFAULT_OPTIONS, isRecordingCycle, landingTime, SHUTTER, StartBackground, stripFrames } from '../../src/startbg.js';
import { THEMES, themeName } from '../../src/themes.js';

const item = (n, extra = {}) => ({ id: `g${n}`, kind: 'image', path: `C:\\shots\\shot-${n}.png`, thumbnail: null, width: 10, height: 10, bytes: 1, durationMs: null, createdAt: n, ...extra });
// The history is stored newest first.
const gallery = (count) => Array.from({ length: count }, (_, i) => item(count - i));
const html = ({ items = [], language = 'ko', missing = new Set(), theme = 'dark-navy' } = {}) => {
  setLanguage(language);
  return startHtml({ appIcon: 'icon.svg', version: 'v1.0.2', settings: { ...defaultSettings, theme }, language, gallery: items, missing, locked: false });
};
const all = (text, re) => [...text.matchAll(re)];
const recentIds = (text) => all(text, /class="start-recent-item [^"]*" data-id="([^"]+)"/g).map((m) => m[1]);
const clearButton = (text) => /<button type="button" class="start-card-action danger" data-action="gallery-clear"[^>]*>/.exec(text)?.[0] ?? '';

test('start screen: no themes card (themes are in the title bar menu and Settings)', () => {
  for (const language of ['ko', 'en']) {
    const text = html({ language });
    assert.doesNotMatch(text, /data-card="themes"|class="start-theme|data-action="theme-set"/);
    assert.match(text, /data-card="background"/, 'the background card is there instead');
  }
});

test('start screen: recent captures are the newest eight, newest first', () => {
  const text = html({ items: gallery(12) });
  assert.deepEqual(recentIds(text), ['g12', 'g11', 'g10', 'g9', 'g8', 'g7', 'g6', 'g5']);
  assert.match(text, /<span class="gallery-count">12<\/span>/, 'the count is the whole history');
});

test('start screen: each recent capture has its own delete button; delete all asks', () => {
  const items = gallery(3);
  const text = html({ items });
  for (const entry of items) {
    const open = new RegExp(`class="start-recent-open" data-action="start-recent" data-value="${entry.id}"`);
    const remove = new RegExp(`class="start-recent-delete" data-action="gallery-delete" data-value="${entry.id}"[^>]*aria-label="[^"]+: shot-${entry.id.slice(1)}\\.png"`);
    assert.match(text, open, `${entry.id} opens`);
    assert.match(text, remove, `${entry.id} has a labelled delete button`);
  }
  // No button inside a button (the open and delete buttons are siblings).
  assert.doesNotMatch(text, /<button[^>]*start-recent-open[^>]*>(?:(?!<\/button>).)*<button/s);
  // Delete all: the same action as the history panel's (which asks first), enabled.
  const clear = clearButton(text);
  assert.ok(clear, 'delete-all button in the card header');
  assert.doesNotMatch(clear, /disabled/);
  assert.match(clear, new RegExp(`title="${messages.ko['gallery.clearTitle']}"`));
  assert.ok(text.includes(messages.ko['gallery.clear']));
  // Empty history: the empty note, and delete all disabled.
  const empty = html({ items: [] });
  assert.match(empty, /class="start-empty"/);
  assert.deepEqual(recentIds(empty), []);
  assert.match(clearButton(empty), /disabled/);
});

test('start screen: the background canvas sits behind the board', () => {
  const text = html();
  assert.match(text, /^<div class="start-bg" aria-hidden="true"><canvas class="start-bg-canvas"><\/canvas><\/div>/);
  assert.ok(text.indexOf('start-bg-canvas') < text.indexOf('start-board'));
});

test('history: entries whose file is gone are dropped, unknown answers kept', () => {
  const items = [item(3), item(2), item(1)];
  const exists = new Map([[items[0].path, true], [items[1].path, false]]); // g1: no answer
  const { items: kept, gone } = pruneMissing(items, exists);
  assert.deepEqual(gone, ['g2']);
  assert.deepEqual(kept.map((entry) => entry.id), ['g3', 'g1']);
  const same = pruneMissing(items, new Map(items.map((entry) => [entry.path, true])));
  assert.deepEqual(same.gone, []);
  assert.equal(same.items, items, 'nothing gone: the same list');
  assert.deepEqual(pruneMissing(items, new Map(items.map((entry) => [entry.path, false]))).items, []);
  // The notice exists in both languages.
  for (const language of ['ko', 'en']) assert.match(messages[language]['gallery.pruned'], /\{count\}/);
});

test('background: cycles alternate still / recording, a recording lands later', () => {
  assert.deepEqual([-2, -1, 0, 1, 2, 3].map(isRecordingCycle), [false, true, false, true, false, true]);
  assert.ok(SHUTTER.record > SHUTTER.capture);
  assert.ok(landingTime(1) - CYCLE > landingTime(0), 'later in its cycle');
  assert.ok(landingTime(1) < 2 * CYCLE, 'but within it');
});

test('background: film-strip frames never overlap and move left only', () => {
  const frameW = 74;
  const gap = 12;
  const slotX = 900;
  let before = null;
  for (let time = 0; time < CYCLE * 30; time += 0.05) {
    const frames = stripFrames(time, slotX, frameW, gap);
    // Newest first, never right of the entry slot, at least a gap apart.
    for (let i = 0; i < frames.length; i += 1) {
      assert.ok(frames[i].x <= slotX + 1e-9, `t=${time.toFixed(2)}: frame right of the slot`);
      assert.ok(frames[i].x + frameW > 0, 'off-screen frames are left out');
      if (i > 0) {
        assert.equal(frames[i].cycle, frames[i - 1].cycle - 1);
        assert.ok(frames[i - 1].x - frames[i].x >= frameW + gap - 1e-6, `t=${time.toFixed(2)}: frames ${frames[i].cycle} and ${frames[i - 1].cycle} overlap`);
      }
      assert.equal(frames[i].video, isRecordingCycle(frames[i].cycle));
    }
    // A frame only appears after landing, and never moves right.
    for (const frame of frames) {
      assert.ok(time >= landingTime(frame.cycle));
      const old = before?.find((entry) => entry.cycle === frame.cycle);
      if (old) assert.ok(frame.x <= old.x + 1e-9, 'moves left');
    }
    before = frames;
  }
  // After a while the strip is full of frames.
  assert.ok(stripFrames(CYCLE * 20, slotX, frameW, gap).length >= 8);
});

/** A canvas good enough for StartBackground: records the drawing calls. */
function fakeCanvas(width = 1200, height = 800) {
  const calls = [];
  const context = new Proxy({ calls }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return (text) => ({ width: String(text).length * 7 });
      if (String(key).startsWith('create')) return (...args) => { calls.push([key, ...args]); return { addColorStop: () => {} }; };
      return (...args) => { calls.push([key, ...args]); };
    },
    set(target, key, value) { if (key === 'calls') return false; calls.push([`=${String(key)}`, value]); return true; },
  });
  return { clientWidth: width, clientHeight: height, width: 0, height: 0, style: {}, getContext: () => context, calls };
}

function withDom(colors, run) {
  const saved = {};
  const set = (key, value) => { saved[key] = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  const listeners = new Map();
  set('document', {
    hidden: false,
    documentElement: {},
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  });
  set('getComputedStyle', () => ({ getPropertyValue: (name) => colors[name] ?? '' }));
  set('ResizeObserver', class { observe() {} disconnect() {} });
  const frames = [];
  set('requestAnimationFrame', (fn) => { frames.push(fn); return frames.length; });
  try {
    return run({ listeners, frames });
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const DARK = { '--bg': '#14171c', '--accent': '#4c8dff', '--text': '#e4e9f0', '--rec': '#eb5050' };
const LIGHT = { '--bg': '#f6f7f9', '--accent': '#2563eb', '--text': '#1b1f24', '--rec': 'rgb(220, 40, 40)' };

test('background: draws a whole still and a whole recording cycle in dark and light themes', () => {
  for (const colors of [DARK, LIGHT]) {
    withDom(colors, () => {
      const canvas = fakeCanvas();
      const scene = new StartBackground(canvas, { time: 0 });
      assert.deepEqual([canvas.width, canvas.height], [1200, 800], 'sized to the element');
      assert.equal(scene.colors.dark, colors === DARK);
      const texts = new Set();
      for (let time = CYCLE * 4; time < CYCLE * 6; time += 0.1) {
        scene.time = time;
        canvas.calls.length = 0;
        scene.draw();
        assert.ok(canvas.calls.some(([name]) => name === 'clearRect'), 'clears each frame');
        for (const [name, value] of canvas.calls) if (name === 'fillText') texts.add(String(value).replace(/\d/g, '0'));
        // No NaN reaches the canvas.
        for (const call of canvas.calls) for (const arg of call.slice(1)) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${call[0]} got ${arg}`);
      }
      assert.ok([...texts].some((text) => /^000 × 000$/.test(text) || /^0+ × 0+$/.test(text)), `size label shown: ${[...texts]}`);
      assert.ok([...texts].some((text) => text.startsWith('REC ')), 'REC shown while recording');
      scene.destroy();
    });
  }
});

test('background: runs at 30 frames a second, pauses when hidden, carries its clock over', () => {
  withDom(DARK, ({ listeners, frames }) => {
    const canvas = fakeCanvas();
    const scene = new StartBackground(canvas, { time: 12.5 });
    assert.equal(scene.time, 12.5, 'the clock carried over from the previous page');
    scene.start();
    assert.equal(frames.length, 1, 'asked for a frame');
    const drawn = scene.frames;
    const t0 = scene.last;
    frames.shift()(t0 + 10); // too soon: skipped
    assert.equal(scene.frames, drawn);
    frames.shift()(t0 + 40);
    assert.equal(scene.frames, drawn + 1);
    assert.ok(Math.abs(scene.time - 12.54) < 1e-9);
    // Hidden: stops asking for frames; shown again: carries on.
    globalThis.document.hidden = true;
    listeners.get('visibilitychange')();
    assert.equal(scene.running, false);
    globalThis.document.hidden = false;
    listeners.get('visibilitychange')();
    assert.equal(scene.running, true);
    scene.destroy();
    assert.equal(scene.running, false);
    assert.equal(listeners.has('visibilitychange'), false, 'listener removed');
  });
});

test('background: with reduced motion it draws one still frame and never animates', () => {
  withDom(DARK, ({ frames }) => {
    const canvas = fakeCanvas();
    const scene = new StartBackground(canvas, { reduced: true });
    const time = scene.time;
    scene.start();
    assert.equal(frames.length, 0, 'no animation frames');
    assert.equal(scene.time, time);
    assert.ok(scene.frames >= 1, 'but a picture');
    // A theme change redraws it in the new colours.
    const before = scene.frames;
    scene.refresh();
    assert.equal(scene.frames, before + 1);
    scene.destroy();
  });
});

// ───────────────────────── background settings

test('settings: start screen background — defaults, validation, steps and limits', () => {
  assert.deepEqual(
    START_BG_SETTINGS.map((key) => defaultSettings[key]),
    ['studio', 'animated', 100, 0, 15, 0],
  );
  // At least twenty scenes: MyCapture's four, then the twenty general ones (as MyUMLMaker).
  assert.ok(START_BG_KINDS.length >= 20, `${START_BG_KINDS.length} scenes`);
  assert.deepEqual(START_BG_KINDS.slice(0, 4), ['studio', 'region', 'film', 'lens']);
  assert.deepEqual(START_BG_KINDS.slice(4), GENERAL_SCENES);
  assert.equal(new Set(START_BG_KINDS).size, START_BG_KINDS.length, 'no duplicates');
  assert.deepEqual(START_BG_MOTIONS, ['animated', 'still', 'off']);
  const clean = (value) => sanitizeSettings(value);
  for (const kind of START_BG_KINDS) assert.equal(clean({ startBgKind: kind }).startBgKind, kind);
  for (const motion of START_BG_MOTIONS) assert.equal(clean({ startBgMotion: motion }).startBgMotion, motion);
  assert.equal(clean({ startBgKind: 'volcano' }).startBgKind, 'studio');
  assert.equal(clean({ startBgMotion: true }).startBgMotion, 'animated');
  // Speed and the two transparencies: clamped to their range, rounded to the slider's step.
  assert.equal(clean({ startBgSpeed: 1000 }).startBgSpeed, START_BG_SPEED.max);
  assert.equal(clean({ startBgSpeed: 1 }).startBgSpeed, START_BG_SPEED.min);
  assert.equal(clean({ startBgSpeed: 140 }).startBgSpeed, 150);
  assert.equal(clean({ startBgSpeed: '75' }).startBgSpeed, 75, 'a number in a string');
  assert.equal(clean({ startBgSpeed: '' }).startBgSpeed, 100, 'empty is not zero');
  assert.equal(clean({ startBgTransparency: 99 }).startBgTransparency, START_BG_TRANSPARENCY.max);
  assert.equal(clean({ startBgTransparency: -5 }).startBgTransparency, 0);
  assert.equal(clean({ startBgTransparency: 42 }).startBgTransparency, 40);
  assert.equal(clean({ startCardTransparency: 95 }).startCardTransparency, START_CARD_TRANSPARENCY.max);
  assert.equal(clean({ startCardTransparency: 'x' }).startCardTransparency, 15);
  // Automatic change: only the offered intervals.
  for (const seconds of START_BG_SHUFFLE) assert.equal(clean({ startBgShuffle: seconds }).startBgShuffle, seconds);
  assert.equal(clean({ startBgShuffle: '60' }).startBgShuffle, 60);
  assert.equal(clean({ startBgShuffle: 45 }).startBgShuffle, 0);
  // Old settings (with the former "strength") get the defaults.
  const old = clean({ theme: 'dark-navy', showStartScreen: false, startBgStrength: 150 });
  assert.deepEqual(START_BG_SETTINGS.map((key) => old[key]), ['studio', 'animated', 100, 0, 15, 0]);
  assert.equal('startBgStrength' in old, false);
});

test('settings: every background label exists in Korean and English', () => {
  const keys = [
    'startBg.tab', 'startBg.card', 'startBg.button', 'startBg.tip', 'startBg.menu', 'startBg.showDetail', 'startBg.scene', 'startBg.motion',
    'startBg.speed', 'startBg.transparency', 'startBg.cardTransparency', 'startBg.reset', 'startBg.random', 'startBg.randomTip',
    'startBg.shuffle', 'startBg.shuffle.off', 'startBg.shuffle.seconds', 'startBg.shuffle.minutes', 'start.recentClear',
    ...START_BG_KINDS.flatMap((kind) => [`startBg.kind.${kind}`, `startBg.kind.${kind}.detail`]),
    ...START_BG_MOTIONS.map((motion) => `startBg.motion.${motion}`),
  ];
  for (const language of ['ko', 'en']) for (const key of keys) assert.ok(messages[language][key], `${language}: ${key}`);
  // Every scene has a name of its own.
  for (const language of ['ko', 'en']) {
    assert.equal(new Set(START_BG_KINDS.map((kind) => messages[language][`startBg.kind.${kind}`])).size, START_BG_KINDS.length, `${language}: names`);
  }
});

test('start screen: a Background button opens the background settings', () => {
  for (const language of ['ko', 'en']) {
    const text = html({ language });
    const button = /<button type="button" class="start-btn" data-action="start-background" title="([^"]+)">.*?<span>([^<]+)<\/span><\/button>/.exec(text);
    assert.ok(button, `${language}: background button`);
    assert.equal(button[1], messages[language]['startBg.tip']);
    assert.equal(button[2], messages[language]['startBg.button']);
  }
});

test('background: options from the settings, with safe fallbacks', () => {
  assert.deepEqual(backgroundOptions({}), DEFAULT_OPTIONS);
  assert.deepEqual(backgroundOptions(undefined), DEFAULT_OPTIONS);
  assert.deepEqual(
    backgroundOptions({ ...defaultSettings, startBgKind: 'aurora', startBgMotion: 'still', startBgSpeed: 200, startBgTransparency: 50 }),
    { kind: 'aurora', motion: 'still', speed: 200, transparency: 50 },
  );
  assert.deepEqual(backgroundOptions({ startBgKind: 'x', startBgMotion: 'y', startBgSpeed: 1e6, startBgTransparency: -5 }), {
    kind: 'studio', motion: 'animated', speed: START_BG_SPEED.max, transparency: 0,
  });
});

test('background: every scene (all 24) draws its own picture, without NaN', () => {
  withDom(DARK, () => {
    const pictures = new Map();
    for (const kind of START_BG_KINDS) {
      const canvas = fakeCanvas();
      const settings = { ...defaultSettings, startBgKind: kind };
      const scene = new StartBackground(canvas, { settings: () => settings });
      const ops = new Map();
      for (let time = CYCLE * 4; time < CYCLE * 6; time += 0.25) {
        scene.time = time;
        canvas.calls.length = 0;
        scene.draw();
        for (const call of canvas.calls) {
          ops.set(call[0], (ops.get(call[0]) ?? 0) + 1);
          for (const arg of call.slice(1)) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${kind}: ${call[0]} got ${arg}`);
        }
      }
      const drawn = ['fill', 'fillRect', 'stroke', 'fillText'].reduce((sum, op) => sum + (ops.get(op) ?? 0), 0);
      assert.ok(drawn > 50, `${kind}: draws something (${drawn})`);
      pictures.set(kind, ops);
      scene.destroy();
    }
    // Each scene draws differently: no two have the same mix of drawing calls.
    const signature = (kind) => ['fill', 'fillRect', 'stroke', 'fillText', 'arc', 'ellipse', 'rect', 'lineTo', 'createRadialGradient'].map((op) => pictures.get(kind).get(op) ?? 0).join(',');
    assert.equal(new Set(START_BG_KINDS.map(signature)).size, START_BG_KINDS.length, 'twenty-four different pictures');
    // What sets the capture scenes apart.
    const count = (kind, op) => pictures.get(kind).get(op) ?? 0;
    assert.ok(count('studio', 'fillText') > 0 && count('region', 'fillText') > 0, 'the selection size label in studio and region');
    assert.equal(count('film', 'fillText'), 0, 'film: no selection');
    assert.equal(count('lens', 'fillText'), 0, 'lens: no selection');
    assert.ok(count('film', 'fillRect') > count('studio', 'fillRect'), 'film: three strips of sprocket holes');
    const strip = (kind) => {
      const canvas = fakeCanvas();
      const scene = new StartBackground(canvas, { settings: () => ({ startBgKind: kind }) });
      canvas.calls.length = 0;
      scene.draw();
      scene.destroy();
      return canvas.calls.some(([name, x, , w]) => name === 'fillRect' && x === 0 && w === 1200);
    };
    assert.equal(strip('studio'), true);
    assert.equal(strip('film'), true);
    assert.equal(strip('region'), false);
    assert.equal(strip('lens'), false);
  });
});

test('background: motion off draws nothing, still never animates, both follow changes live', () => {
  withDom(DARK, ({ frames }) => {
    const settings = { ...defaultSettings, startBgMotion: 'off' };
    const canvas = fakeCanvas();
    const scene = new StartBackground(canvas, { settings: () => settings });
    canvas.calls.length = 0;
    scene.start();
    assert.equal(frames.length, 0, 'off: no animation');
    assert.deepEqual(canvas.calls.map(([name]) => name), ['clearRect'], 'off: the canvas is cleared and left empty');
    // Still: one picture, no frames, the clock does not move.
    settings.startBgMotion = 'still';
    canvas.calls.length = 0;
    scene.sync();
    assert.equal(frames.length, 0);
    assert.ok(canvas.calls.length > 50, 'still: a picture');
    // Animated: it starts.
    settings.startBgMotion = 'animated';
    scene.sync();
    assert.equal(scene.running, true);
    assert.equal(frames.length, 1);
    // Switched to still while running: the next frame stops the loop.
    settings.startBgMotion = 'still';
    const time = scene.time;
    frames.shift()(scene.last + 100);
    assert.equal(scene.running, false);
    assert.equal(frames.length, 0, 'no more frames asked for');
    assert.equal(scene.time, time, 'the clock stopped');
    scene.destroy();
  });
});

test('background: speed scales the clock, transparency fades the picture', () => {
  withDom(DARK, ({ frames }) => {
    const settings = { ...defaultSettings, startBgSpeed: 200 };
    const scene = new StartBackground(fakeCanvas(), { time: 10, settings: () => settings });
    scene.start();
    frames.shift()(scene.last + 50);
    assert.ok(Math.abs(scene.time - 10.1) < 1e-9, `200%: 50 ms → 0.1 s (${scene.time})`);
    settings.startBgSpeed = 50;
    frames.shift()(scene.last + 50);
    assert.ok(Math.abs(scene.time - 10.125) < 1e-9, `50%: 50 ms → 0.025 s (${scene.time})`);
    scene.destroy();
    // Transparency: the canvas's opacity, for every scene, also when off.
    for (const [transparency, opacity] of [[0, '1'], [40, '0.6'], [90, '0.09999999999999998']]) {
      const canvas = fakeCanvas();
      const fading = new StartBackground(canvas, { settings: () => ({ ...defaultSettings, startBgKind: 'aurora', startBgTransparency: transparency }) });
      fading.draw();
      assert.equal(canvas.style.opacity, opacity, `${transparency}%`);
      fading.destroy();
    }
  });
});

test('start screen: the moving background card — 24 scene tiles, motion, another one, change by itself, speed, transparency, reset', async () => {
  const { backgroundBody, backgroundKey, SCENE_ICONS, MOTION_ICONS, shuffleLabel } = await import('../../src/start.js');
  const { ICON_NAMES } = await import('../../src/icons.js');
  for (const glyph of [...Object.values(SCENE_ICONS), ...Object.values(MOTION_ICONS), 'shuffle', 'opacity', 'clock']) assert.ok(ICON_NAMES.includes(glyph), glyph);
  assert.deepEqual(Object.keys(SCENE_ICONS), START_BG_KINDS);
  assert.equal(new Set(Object.values(SCENE_ICONS)).size, START_BG_KINDS.length, 'an icon of its own for each scene');
  assert.deepEqual(Object.keys(MOTION_ICONS), START_BG_MOTIONS);
  for (const language of ['ko', 'en']) {
    setLanguage(language);
    const settings = { ...defaultSettings, startBgKind: 'snow', startBgMotion: 'still', startBgSpeed: 150, startBgTransparency: 30, startCardTransparency: 40, startBgShuffle: 60 };
    const body = backgroundBody(settings);
    const tiles = all(body, /<button type="button" class="bg-tile( on)?" role="radio" aria-checked="(true|false)" data-action="start-bg-kind" data-value="([a-z]+)" title="([^"]*)">(.*?)<\/button>/gs);
    assert.deepEqual(tiles.map((m) => m[3]), START_BG_KINDS);
    for (const [, on, checked, kind, title, inner] of tiles) {
      assert.equal(Boolean(on), kind === 'snow', `${kind} marked`);
      assert.equal(checked, String(kind === 'snow'));
      assert.match(inner, new RegExp(`data-icon="${SCENE_ICONS[kind]}" data-tone="[a-z]+"`), `${kind} icon`);
      assert.ok(inner.includes(messages[language][`startBg.kind.${kind}`]), `${language}: ${kind} name`);
      assert.equal(title, messages[language][`startBg.kind.${kind}.detail`], `${language}: ${kind} description in the tooltip`);
    }
    const radios = (action) => all(body, new RegExp(`class="start-btn( on)?" role="radio" aria-checked="(?:true|false)" data-action="${action}" data-value="([0-9a-z]+)">(.*?)</button>`, 'gs'));
    const motions = radios('start-bg-motion');
    assert.deepEqual(motions.map((m) => m[2]), START_BG_MOTIONS);
    assert.deepEqual(motions.filter((m) => m[1]).map((m) => m[2]), ['still']);
    for (const [, , motion, inner] of motions) assert.match(inner, new RegExp(`data-icon="${MOTION_ICONS[motion]}"`));
    const shuffles = radios('start-bg-auto');
    assert.deepEqual(shuffles.map((m) => Number(m[2])), START_BG_SHUFFLE);
    assert.deepEqual(shuffles.filter((m) => m[1]).map((m) => m[2]), ['60']);
    assert.ok(shuffles.every((m) => m[3].includes(shuffleLabel(Number(m[2])))), 'interval labels');
    assert.match(body, /data-action="start-bg-random"[^>]*>.*data-icon="shuffle"/s, 'another one, with its icon');
    // Sliders in percent; speed and background transparency off while the background is off.
    assert.match(body, /min="25" max="300" step="25" value="150" data-input="startBgSpeed"/);
    assert.match(body, /data-output="startBgTransparency">30%</);
    assert.match(body, /data-output="startCardTransparency">40%</);
    assert.match(body, /data-action="start-bg-reset"/);
    const off = backgroundBody({ ...settings, startBgMotion: 'off' });
    assert.deepEqual(all(off, /data-input="(startBg[A-Za-z]+|startCard[A-Za-z]+)"[^>]* disabled/g).map((m) => m[1]), ['startBgSpeed', 'startBgTransparency']);
  }
  assert.equal(shuffleLabel(0), messages.en['startBg.shuffle.off']);
  assert.equal(shuffleLabel(30), '30 s');
  assert.equal(shuffleLabel(300), '5 min');
  // The card is on the board, titled, and rebuilt only when its settings change.
  const text = html();
  assert.match(text, /<section class="start-card start-card-background" data-card="background" aria-label="움직이는 배경">/);
  const base = { ...defaultSettings };
  assert.equal(backgroundKey(base), backgroundKey({ ...base, theme: 'dark-navy', language: 'en' }));
  for (const key of START_BG_SETTINGS) {
    const changed = { ...base, [key]: key === 'startBgKind' ? 'rain' : key === 'startBgMotion' ? 'off' : 45 };
    assert.notEqual(backgroundKey(changed), backgroundKey(base), key);
  }
  const { SPAN } = await import('../../src/startboard.js');
  assert.equal(SPAN.background, 3, 'full width');
});


test('background: the twenty general scenes are twenty different drawings (same items, same moment)', async () => {
  const { drawGeneralScene, GENERAL_SCENES, sceneItems } = await import('../../src/startscenes.js');
  assert.equal(GENERAL_SCENES.length, 20);
  const items = sceneItems('particles').slice(0, 40); // the same dots for every scene
  const colours = { accent: [76, 141, 255], text: [228, 233, 240], rec: [235, 80, 80], dark: true };
  const drawing = (kind) => {
    const canvas = fakeCanvas();
    drawGeneralScene(kind, canvas.getContext(), 1200, 800, 12.3, colours, items, { boost: 2, size: 1.6 });
    return JSON.stringify(canvas.calls.map((call) => call.map((value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value))));
  };
  const seen = new Map();
  for (const kind of GENERAL_SCENES) {
    const picture = drawing(kind);
    assert.ok(picture.length > 50, `${kind} draws`);
    assert.equal(seen.get(picture), undefined, `${kind} draws exactly like ${seen.get(picture)}`);
    seen.set(picture, kind);
  }
  // Unknown names draw nothing (no crash).
  assert.equal(drawing('nope'), '[]');
});

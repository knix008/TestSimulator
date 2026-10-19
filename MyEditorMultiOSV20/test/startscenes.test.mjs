import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_SCENE_IDS, START_SPEED_CHANNELS, startSceneId, startSpeedPercent, channelPercent,
  startRates, startTransparency, startIsStill,
} from '../src/lib/startscenes.js';
import { SETTINGS_DEFAULTS, pickSettings } from '../src/lib/settings.js';
import { SCENE_IDS } from '../src/lib/start3d/scenes.js';

test('start scenes keep the designed set and an unknown id falls back to the terminal', () => {
  assert.equal(START_SCENE_IDS.length, 20);
  assert.equal(startSceneId('coderain'), 'coderain');
  assert.equal(startSceneId('editor'), 'terminal');
  assert.equal(startSceneId('nope'), 'terminal');
  assert.equal(startSceneId(undefined), 'terminal');
  assert.equal(startSceneId('valley'), 'terminal');
  assert.deepEqual(SCENE_IDS, START_SCENE_IDS);
});

test('start speeds scale the three clocks and a still picture is detected', () => {
  assert.equal(startSpeedPercent('slow'), 20);
  assert.equal(startSpeedPercent(0), 0);
  assert.equal(channelPercent(undefined), 100);
  assert.equal(startTransparency(140), 100);
  const rates = startRates({ motion: 20, cameraSpeed: 100, objectSpeed: 0, skySpeed: 200 });
  assert.equal(rates.camera, 1);
  assert.equal(rates.objects, 0);
  assert.equal(rates.sky, 2);
  assert.equal(startIsStill({ camera: 0, objects: 0, sky: 0 }), true);
  assert.equal(START_SPEED_CHANNELS.map((c) => c.key).join(','), 'cameraSpeed,objectSpeed,skySpeed');
});

test('the editor default start screen is the terminal at the designed pace', () => {
  const screen = pickSettings({}).startScreen;
  assert.deepEqual(screen, SETTINGS_DEFAULTS.startScreen);
  assert.equal(screen.scene, 'terminal');
  assert.equal(screen.motion, 20);
});

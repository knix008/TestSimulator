import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings, normalizeSettings, START_SCENE_ICONS, START_SCENES } from '../../src/domain/settings.js';
import { hasIcon } from '../../src/icons.js';
import { definedStartScenes, sceneItems } from '../../src/view/startscenes.js';
import { startPageHtml } from '../../src/view/startpage.js';

test('twenty CAD start scenes', () => {
  assert.equal(START_SCENES.length, 20);
  assert.deepEqual([...definedStartScenes()].sort(), [...START_SCENES].sort());
  for (const id of START_SCENES) {
    const items = sceneItems(id);
    assert.ok(items.length >= 3, id);
    assert.ok(items.every((item) => item.shape), id);
  }
  assert.ok(sceneItems('gears').some((item) => item.tris?.length > 10), 'gear pair is a real solid');
  assert.equal(sceneItems('landscape'), sceneItems('gears'));
});

test('start page shows background choices under recent files', () => {
  const settings = defaultSettings('en');
  settings.startScene = 'lathe';
  const html = startPageHtml({
    t: (key) => key, language: 'en', appIcon: 'icon.png', version: 'V1.0', recent: [], samples: [], error: null, settings,
  });
  const recentAt = html.indexOf('start.recent');
  const scenesAt = html.indexOf('start-scene-grid');
  assert.ok(recentAt > 0 && scenesAt > recentAt);
  for (const id of START_SCENES) {
    assert.ok(hasIcon(START_SCENE_ICONS[id]), id);
    assert.match(html, new RegExp(`data-start-scene="${id}"[^>]*>\\s*<svg`), id);
  }
  assert.match(html, /class="start-scene active"[^>]*data-start-scene="lathe"/);
  assert.ok(html.includes('data-stepper="startTransparency"'));
  assert.ok(html.includes('data-stepper="startMotion"'));
  assert.ok(html.includes('data-start-motion-reset'));
});

test('start screen settings stay in range', () => {
  const fresh = defaultSettings();
  assert.equal(fresh.startScene, 'gears');
  assert.equal(fresh.startTransparency, 0);
  assert.equal(fresh.startMotion, 20);
  assert.equal(fresh.startCamera, 100);
  assert.equal(fresh.startObjects, 100);
  const repaired = normalizeSettings({ startScene: 'nope', startTransparency: 140, startMotion: -3, startCamera: 9999, startObjects: 50 });
  assert.equal(repaired.startScene, 'gears');
  assert.equal(repaired.startTransparency, 100);
  assert.equal(repaired.startMotion, 0);
  assert.equal(repaired.startCamera, 300);
  assert.equal(repaired.startObjects, 50);
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

// config.js only touches electron's `app` inside the Config constructor, so
// the module itself loads fine on plain Node and its pure helpers can be
// exercised directly.
const fs = require('fs');
const path = require('path');

const { merge, defaults } = require('../src/main/config');

const ROOT = path.join(__dirname, '..');

describe('settings merge', () => {
  it('keeps keys the patch does not mention', () => {
    const result = merge({ a: 1, b: 2 }, { b: 3 });
    assert.deepStrictEqual(result, { a: 1, b: 3 });
  });

  it('descends into nested objects rather than replacing them', () => {
    const base = { dock: { iconSize: 48, spacing: 10, position: 'bottom' } };
    const result = merge(base, { dock: { spacing: 4 } });
    assert.deepStrictEqual(result.dock, { iconSize: 48, spacing: 4, position: 'bottom' });
  });

  it('replaces arrays wholesale instead of merging them element-wise', () => {
    const result = merge({ items: [1, 2, 3] }, { items: [9] });
    assert.deepStrictEqual(result.items, [9]);
  });

  it('does not mutate the object it was given', () => {
    const base = { dock: { spacing: 10 } };
    merge(base, { dock: { spacing: 99 } });
    assert.strictEqual(base.dock.spacing, 10);
  });

  it('accepts false and 0 as real values rather than treating them as missing', () => {
    const result = merge({ dock: { autoHide: true, opacity: 1 } }, { dock: { autoHide: false, opacity: 0 } });
    assert.strictEqual(result.dock.autoHide, false);
    assert.strictEqual(result.dock.opacity, 0);
  });
});

describe('default settings', () => {
  it('defines every key the settings window binds to', () => {
    const dock = defaults().dock;
    const expected = [
      'position', 'display', 'align', 'edgeOffset', 'iconSize', 'spacing', 'padding',
      'plateThickness', 'maxZoom', 'zoomRange', 'animation', 'clickEffect',
      'clickEffectDirection',
      'autoHide', 'autoHidePeek', 'autoHideDelay', 'autoShowDelay', 'autoHideAnimation',
      'stackingLevel', 'showOnAllWorkspaces',
      'showLabels', 'showReflection', 'showRunningIndicator', 'showRunningApps',
      'opacity', 'plateOpacity', 'lockItems',
    ];
    for (const key of expected) {
      assert.ok(key in dock, `dock.${key} is missing from the defaults`);
    }
  });

  it('starts locked off and with an empty dock', () => {
    const config = defaults();
    assert.strictEqual(config.dock.lockItems, false);
    assert.deepStrictEqual(config.items, []);
    assert.strictEqual(config.firstRun, true);
  });

  it('defaults the locale to following the system', () => {
    assert.strictEqual(defaults().locale, 'auto');
  });

  it('binds every numeric setting the settings window offers a slider for', () => {
    const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'settings.html'), 'utf8');
    const sliders = [...html.matchAll(/<input type="range" id="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(sliders.length > 8, 'expected the settings window to be full of sliders');

    const config = defaults();
    const orphans = sliders.filter((id) => !(id in config.dock));
    assert.deepStrictEqual(orphans, [], `sliders with no setting behind them: ${orphans.join(', ')}`);
  });

  it('gives every slider a range its default actually falls inside', () => {
    const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'settings.html'), 'utf8');
    const dock = defaults().dock;
    const wrong = [];

    for (const m of html.matchAll(/<input type="range" id="([^"]+)"[^>]*min="([^"]+)"[^>]*max="([^"]+)"/g)) {
      const [, id, min, max] = m;
      const value = dock[id];
      if (typeof value !== 'number') continue;
      // A default outside its own slider snaps to the end the moment the
      // settings window opens, silently changing the user's dock.
      if (value < Number(min) || value > Number(max)) wrong.push(`${id}=${value} not in ${min}..${max}`);
    }
    assert.deepStrictEqual(wrong, []);
  });

  it('slides the dock away over a visible span rather than blinking it out', () => {
    const ms = defaults().dock.autoHideAnimation;
    assert.ok(ms >= 120, `${ms}ms is too quick to read as movement`);
    assert.ok(ms <= 600, `${ms}ms would keep the user waiting`);
  });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const fs = require('fs');
const path = require('path');

// The merge rules themselves are tested in Rust (src-tauri/src/config.rs);
// these check that the one declaration of the defaults fits the settings window.
const ROOT = path.join(__dirname, '..');
const defaults = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'data', 'defaults.json'), 'utf8'));

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

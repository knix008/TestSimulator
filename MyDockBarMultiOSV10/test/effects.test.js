'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { defaults } = require('../src/main/config');
const i18n = require('../src/shared/i18n');

const ROOT = path.join(__dirname, '..');
// Normalised: git may well have checked these out with CRLF, and every
// pattern below is written against plain newlines.
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const HTML = read('src/renderer/settings.html');
const CSS = read('src/renderer/css/effects.css');
const DOCK_JS = read('src/renderer/js/dock.js');
const SETTINGS_JS = read('src/renderer/js/settings.js');

/** The `value="…"` of every option inside one `<select>`. */
function optionsOf(id) {
  const open = HTML.indexOf(`<select id="${id}">`);
  assert.ok(open >= 0, `settings.html has no <select id="${id}">`);
  const block = HTML.slice(open, HTML.indexOf('</select>', open));
  return [...block.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
}

/** The REMOVE_EFFECTS table as one of the two renderers declares it. */
function durationTable(source, where) {
  const open = source.indexOf('const REMOVE_EFFECTS = {');
  assert.ok(open >= 0, `${where} has no REMOVE_EFFECTS table`);
  const block = source.slice(open, source.indexOf('};', open));
  const table = {};
  for (const match of block.matchAll(/(\w+):\s*(\d+)/g)) table[match[1]] = Number(match[2]);
  return table;
}

const OPTIONS = optionsOf('removeEffect');
const DOCK_TABLE = durationTable(DOCK_JS, 'dock.js');
const SETTINGS_TABLE = durationTable(SETTINGS_JS, 'settings.js');

describe('the drag-off effects', () => {
  it('offers more than one, so the choice is worth having', () => {
    assert.ok(OPTIONS.length >= 3, `only ${OPTIONS.length} on offer`);
    assert.strictEqual(new Set(OPTIONS).size, OPTIONS.length, 'an option is listed twice');
  });

  it('starts on one of the effects it offers', () => {
    assert.ok(OPTIONS.includes(defaults().dock.removeEffect),
      `the default "${defaults().dock.removeEffect}" is not in the list`);
  });

  it('gives the dock a duration for every option', () => {
    for (const name of OPTIONS) {
      assert.ok(name in DOCK_TABLE, `dock.js does not know how long "${name}" runs`);
    }
  });

  it('knows of no effect the settings window does not offer', () => {
    for (const name of Object.keys(DOCK_TABLE)) {
      assert.ok(OPTIONS.includes(name), `"${name}" has a duration but cannot be chosen`);
    }
  });

  it('times the settings preview exactly as the dock times itself', () => {
    assert.deepStrictEqual(SETTINGS_TABLE, DOCK_TABLE);
  });

  it('has an animation in the shared stylesheet for every moving option', () => {
    for (const name of OPTIONS) {
      if (DOCK_TABLE[name] === 0) continue;         // "none" has nothing to draw
      assert.ok(CSS.includes(`.vanish-${name} .icon-inner`),
        `effects.css has no rule for .vanish-${name}`);
    }
  });

  it('waits at least as long as the animation it is playing', () => {
    // The entry is only taken off the dock once the effect has finished; a
    // duration shorter than the CSS would cut the animation off halfway.
    for (const name of OPTIONS) {
      const rule = new RegExp(`\\.vanish-${name} \\.icon-inner \\{[^}]*?(\\d+)ms`, 's');
      const match = rule.exec(CSS);
      if (!match) continue;
      assert.ok(DOCK_TABLE[name] >= Number(match[1]),
        `"${name}" waits ${DOCK_TABLE[name]}ms for a ${match[1]}ms animation`);
    }
  });

  it('is loaded by both windows, so the preview is the real thing', () => {
    for (const page of ['src/renderer/index.html', 'src/renderer/settings.html']) {
      assert.ok(read(page).includes('css/effects.css'), `${page} does not load effects.css`);
    }
  });

  it('names every option in both languages', () => {
    for (const name of OPTIONS) {
      const key = `o.${name}`;
      assert.ok(key in i18n.STRINGS.en, `English has no ${key}`);
      assert.ok(key in i18n.STRINGS.ko, `Korean has no ${key}`);
    }
  });
});

describe('the taskbar setting', () => {
  it('starts switched off - the dock is chrome, not a window to switch to', () => {
    assert.strictEqual(defaults().dock.showInTaskbar, false);
  });

  it('has a checkbox of its own', () => {
    assert.ok(HTML.includes('id="showInTaskbar"'), 'settings.html has no showInTaskbar checkbox');
    assert.ok(SETTINGS_JS.includes("'showInTaskbar'"), 'settings.js never binds showInTaskbar');
  });

  it('is what the dock window actually asks the OS for', () => {
    const source = read('src/main/dock-window.js');
    assert.ok(/skipTaskbar: !this\.wantsTaskbar\(dock\)/.test(source),
      'the window is still created with a hard-coded skipTaskbar');
    assert.ok(/setSkipTaskbar\(!this\.wantsTaskbar\(dock\)\)/.test(source),
      'changing the setting never reaches the live window');
    assert.ok(/startWithOS\) return false/.test(source),
      'a login launch can still take a taskbar button');
    assert.ok(/applyConfig\(\)[\s\S]{0,400}applyTaskbar\(/.test(source),
      'applyConfig does not reapply the taskbar setting');
  });

  it('is named in both languages', () => {
    assert.ok('c.showInTaskbar' in i18n.STRINGS.en);
    assert.ok('c.showInTaskbar' in i18n.STRINGS.ko);
  });
});

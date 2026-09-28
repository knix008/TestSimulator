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

/** A duration table as one of the two renderers declares it. */
function durationTable(source, where, name = 'REMOVE_EFFECTS') {
  const open = source.indexOf(`const ${name} = {`);
  assert.ok(open >= 0, `${where} has no ${name} table`);
  const block = source.slice(open, source.indexOf('};', open));
  const table = {};
  for (const match of block.matchAll(/(\w+):\s*(\d+)/g)) table[match[1]] = Number(match[2]);
  return table;
}

const OPTIONS = optionsOf('removeEffect');
const DOCK_TABLE = durationTable(DOCK_JS, 'dock.js');
const SETTINGS_TABLE = durationTable(SETTINGS_JS, 'settings.js');

const TRASH_OPTIONS = optionsOf('trashEmptyEffect');
const DOCK_TRASH = durationTable(DOCK_JS, 'dock.js', 'TRASH_EFFECTS');
const SETTINGS_TRASH = durationTable(SETTINGS_JS, 'settings.js', 'TRASH_EFFECTS');

/** The body of a top-level function in one of the renderer sources. */
function bodyOf(source, signature) {
  const open = source.indexOf(signature);
  assert.ok(open >= 0, `no ${signature}`);
  const end = source.indexOf('\n  }\n', open);
  return source.slice(open, end < 0 ? undefined : end);
}

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

describe('removing an icon other than by dragging it off', () => {
  // A removal from the icon's own menu, or from the settings window, reaches
  // the dock as an ordinary config change. That is where the farewell for it
  // has to come from, since nothing in the dock started it.
  const FAREWELLS = bodyOf(DOCK_JS, 'function playFarewells(');

  it('is bid the same farewell as one dragged off', () => {
    assert.ok(/await playFarewells\(items\);[\s\S]{0,240}state\.items = items;/.test(DOCK_JS),
      'the list is swapped before the farewell finishes, leaving nothing to animate');
  });

  it('plays it only for the entries that really left', () => {
    assert.ok(FAREWELLS.includes('!keep.has(item.id)'), 'it never checks what is left in the list');
    assert.ok(FAREWELLS.includes('!item.transient'),
      'a running-application icon is not an entry and cannot be removed');
  });

  it('does not play it twice over a drag that already said goodbye', () => {
    assert.ok(FAREWELLS.includes("classList.contains('vanishing')"),
      'an icon already on its way out is not recognised');
  });

  it('is what the field in the settings window now promises', () => {
    assert.ok(!/drag/i.test(i18n.STRINGS.en['f.removeEffect']),
      'the field still claims a drag is the only way an icon leaves');
  });
});

describe('the trash-emptying effects', () => {
  it('offers a choice, and "none" is one of them', () => {
    assert.ok(TRASH_OPTIONS.length >= 2, `only ${TRASH_OPTIONS.length} on offer`);
    assert.strictEqual(new Set(TRASH_OPTIONS).size, TRASH_OPTIONS.length, 'an option is listed twice');
    assert.ok(TRASH_OPTIONS.includes('none'), 'the effect cannot be turned off');
  });

  it('starts on one of the effects it offers', () => {
    const chosen = defaults().dock.trashEmptyEffect;
    assert.ok(TRASH_OPTIONS.includes(chosen), `the default "${chosen}" is not in the list`);
  });

  it('is set under General, where it was asked for', () => {
    const general = HTML.slice(HTML.indexOf('<section id="tab-general"'),
      HTML.indexOf('<section id="tab-themes"'));
    assert.ok(general.includes('id="trashEmptyEffect"'), 'the setting is not on the General tab');
    assert.ok(general.includes('id="trash-preview-play"'),
      'there is no way to see the effect before settling on it');
  });

  it('gives the dock a duration for every option, and knows of no other', () => {
    for (const name of TRASH_OPTIONS) {
      assert.ok(name in DOCK_TRASH, `dock.js does not know how long "${name}" runs`);
    }
    for (const name of Object.keys(DOCK_TRASH)) {
      assert.ok(TRASH_OPTIONS.includes(name), `"${name}" has a duration but cannot be chosen`);
    }
  });

  it('times the settings preview exactly as the dock times itself', () => {
    assert.deepStrictEqual(SETTINGS_TRASH, DOCK_TRASH);
  });

  it('has an animation in the shared stylesheet for every moving option', () => {
    for (const name of TRASH_OPTIONS) {
      if (DOCK_TRASH[name] === 0) continue;         // "none" has nothing to draw
      assert.ok(CSS.includes(`.trash-${name} .icon-inner`),
        `effects.css has no rule for .trash-${name}`);
    }
  });

  it('waits at least as long as the animation it is playing', () => {
    for (const name of TRASH_OPTIONS) {
      const rule = new RegExp(`\\.trash-${name} \\.icon-inner \\{[^}]*?(\\d+)ms`, 's');
      const match = rule.exec(CSS);
      if (!match) continue;
      assert.ok(DOCK_TRASH[name] >= Number(match[1]),
        `"${name}" is tidied up after ${DOCK_TRASH[name]}ms for a ${match[1]}ms animation`);
    }
  });

  it('leaves the Trash icon sitting still afterwards', () => {
    // The Trash is not going anywhere, so every class and particle has to come
    // off again; one left behind would leave the bin squashed or shaking.
    const body = bodyOf(DOCK_JS, 'function playTrashEffect(');
    assert.ok(/classList\.remove\('trash-emptying'/.test(body), 'the effect class is never taken off');
    assert.ok(/particles\.remove\(\)/.test(body), 'the particles are left on the icon');
  });

  it('plays on a real emptying, not on the bin merely becoming empty', () => {
    // Dragging the last file back out of the bin also leaves it empty, and
    // that is not something to play an emptying over.
    const IPC = read('src/main/ipc.js');
    const body = bodyOf(IPC, 'async function emptyTrash()');
    assert.ok(/if \(!result\.ok\)[\s\S]{0,200}return result;/.test(body),
      'a cancelled or failed emptying is announced all the same');
    assert.ok(body.indexOf("broadcast('dock:trash-emptied'") > body.indexOf('if (!result.ok)'),
      'the announcement goes out before the emptying is known to have worked');
    assert.ok(!/trash\.empty\(dockHwnd/.test(IPC.replace(body, '')),
      'something still empties the bin without announcing it');
    assert.ok(read('src/preload/preload.js').includes("on('dock:trash-emptied'"),
      'the dock window is never told about an emptying');
    assert.ok(DOCK_JS.includes('api.trash.onEmptied('), 'dock.js never listens for one');
  });

  it('plays over a bin that has already been repainted as empty', () => {
    const open = DOCK_JS.indexOf('api.trash.onEmptied(');
    const body = DOCK_JS.slice(open, DOCK_JS.indexOf('\n    });', open));
    assert.ok(body.includes('playTrashEffect()'), 'the effect is never played');
    assert.ok(body.indexOf('render()') < body.indexOf('playTrashEffect()'),
      'the repaint comes after the effect and would wipe it out');
  });

  it('names every option, and the setting itself, in both languages', () => {
    for (const key of [...TRASH_OPTIONS.map((name) => `o.${name}`),
      'h.trash', 'f.trashEmptyEffect', 'm.trashEffectHint']) {
      assert.ok(key in i18n.STRINGS.en, `English has no ${key}`);
      assert.ok(key in i18n.STRINGS.ko, `Korean has no ${key}`);
    }
  });
});

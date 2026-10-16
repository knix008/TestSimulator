'use strict';

/**
 * The pages and the Rust side meet in exactly two places: the commands
 * src/bridge.js invokes, and the notifications src-tauri posts. A name that is
 * spelled differently on the two sides fails silently at run time - the call
 * is rejected and the dock simply does nothing - so they are matched here.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const BRIDGE = read('src/bridge.js');
const LIB = read('src-tauri/src/lib.rs');
const RUST = fs.readdirSync(path.join(ROOT, 'src-tauri', 'src'))
  .filter((f) => f.endsWith('.rs'))
  .map((f) => read(`src-tauri/src/${f}`))
  .join('\n');

const handlerBlock = LIB.slice(LIB.indexOf('generate_handler!['), LIB.indexOf('])', LIB.indexOf('generate_handler![')));
const registered = new Set([...handlerBlock.matchAll(/\b([a-z_]+),/g)].map((m) => m[1]));
const invoked = new Set([...BRIDGE.matchAll(/\b(?:invoke|send)\('([a-z_]+)'/g)].map((m) => m[1]));

describe('commands', () => {
  it('every call the bridge makes is a registered command', () => {
    const missing = [...invoked].filter((name) => !registered.has(name));
    assert.deepStrictEqual(missing, [], `not registered in lib.rs: ${missing.join(', ')}`);
  });

  it('every registered command is something the bridge calls', () => {
    const unused = [...registered].filter((name) => !invoked.has(name));
    assert.deepStrictEqual(unused, [], `registered but never called: ${unused.join(', ')}`);
  });

  it('every registered command is defined as one', () => {
    const undefinedOnes = [...registered].filter((name) => !new RegExp(`#\\[tauri::command\\]\\n(?:async )?fn ${name}\\(`).test(LIB));
    assert.deepStrictEqual(undefinedOnes, []);
  });

  it('keeps the dockApi shape the pages were written against', () => {
    // The Electron preload's groups; the page code calls into all of them.
    for (const group of ['config', 'items', 'dock', 'themes', 'apps', 'dialog', 'system', 'settings', 'trash', 'icons', 'app']) {
      assert.ok(new RegExp(`\\n    ${group}: \\{`).test(BRIDGE), `dockApi.${group} is missing`);
    }
    const pages = read('src/renderer/js/dock.js') + read('src/renderer/js/settings.js');
    const used = new Set([...pages.matchAll(/\bapi\.([a-z]+)\.([a-zA-Z]+)\(/g)].map((m) => `${m[1]}.${m[2]}`));
    const missing = [...used].filter((call) => {
      const [group, method] = call.split('.');
      const open = BRIDGE.indexOf(`\n    ${group}: {`);
      if (open < 0) return true;
      const body = BRIDGE.slice(open, BRIDGE.indexOf('\n    },', open));
      return !new RegExp(`\\b${method}[:,]`).test(body);
    });
    assert.deepStrictEqual(missing, [], `the pages call methods the bridge lacks: ${missing.join(', ')}`);
  });

  it('turns dropped files back into paths, not the removed Electron call', () => {
    const pages = read('src/renderer/js/dock.js') + read('src/renderer/js/settings.js');
    assert.ok(!pages.includes('pathForFile('), 'a page still calls the Electron-only pathForFile');
    assert.ok(pages.includes('api.pathsForFiles('));
    assert.ok(BRIDGE.includes('mydockbar-files:') && RUST.includes('"mydockbar-files:"'),
      'the page and the host disagree on the dropped-files message');
  });
});

describe('notifications', () => {
  it('every one a page listens for is posted by the Rust side', () => {
    const heard = [...BRIDGE.matchAll(/\bon\('([a-z:-]+)'/g)].map((m) => m[1]);
    const unsent = heard.filter((event) => !RUST.includes(`"${event}"`));
    assert.deepStrictEqual(unsent, [], `listened for but never sent: ${unsent.join(', ')}`);
  });

  it('the error window and the pages load the bridge first', () => {
    for (const page of ['index.html', 'settings.html', 'error.html']) {
      const html = read(`src/renderer/${page}`);
      const bridge = html.indexOf('../bridge.js');
      assert.ok(bridge >= 0, `${page} does not load the bridge`);
      const others = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].filter((m) => m[1] !== '../bridge.js' && m.index < bridge).map((m) => m[1]);
      assert.deepStrictEqual(others, [], `${page} runs a script before the bridge`);
    }
  });
});

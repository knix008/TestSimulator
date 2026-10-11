'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'src', 'shared');

// Files the window loads via <script>, and the global name each one leaves behind.
const SCRIPTS = [
  ['arrange.js', 'DeskArrange'],
  ['deliver.js', 'DeskDeliver'],
  ['taps.js', 'DeskTaps'],
  ['i18n.js', 'DeskI18n'],
  ['deskgrid.js', 'DeskGrid'],
];

// In a window, multiple <script> tags share one global scope.
// If one file declares a top-level const, the next file using the same name dies entirely.
// Load them all into one context the same way here to catch such collisions.
test('all files survive being loaded together in one window', () => {
  const context = vm.createContext({ console });
  for (const [file] of SCRIPTS) {
    const code = fs.readFileSync(path.join(SHARED, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  for (const [file, name] of SCRIPTS) {
    assert.equal(typeof context[name], 'object', `${file} did not leave ${name} behind`);
  }
});

test('the script list the window loads matches the actual files', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.html'), 'utf8');
  const listed = [...html.matchAll(/<script src="\.\.\/shared\/([\w.]+)"/g)].map((m) => m[1]);
  for (const name of listed) {
    assert.ok(fs.existsSync(path.join(SHARED, name)), `fence.html loads ${name}, which does not exist`);
  }
  // Every name fence.js uses must be created by a loaded file.
  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  const used = new Set([...code.matchAll(/window\.(Desk\w+)/g)].map((m) => m[1]));
  const given = new Set(SCRIPTS.filter(([file]) => listed.includes(file)).map(([, name]) => name));
  for (const name of used) {
    assert.ok(given.has(name), `fence.html does not load ${name}, which fence.js uses`);
  }
});

test('requiring from main yields the same thing', () => {
  for (const [file, name] of SCRIPTS) {
    const loaded = require(path.join(SHARED, file));
    assert.equal(typeof loaded, 'object', `cannot require ${file}`);
    assert.ok(Object.keys(loaded).length > 0, `${name} is empty`);
  }
  const arrange = require(path.join(SHARED, 'arrange.js'));
  assert.equal(typeof arrange.gridOf, 'function');
  assert.equal(typeof arrange.windowRect, 'function');
});

test('names used inside the window do not pollute the global scope', () => {
  const context = vm.createContext({ console });
  for (const [file] of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(SHARED, file), 'utf8'), context, { filename: file });
  }
  // Names used only within a file must not leak out.
  for (const leaked of ['api', 'TEXT', 'CELL_W', 'FALLBACK', 'DOUBLE_MS']) {
    assert.equal(context[leaked], undefined, `${leaked} leaked into the global scope`);
  }
});

// A box is a single window. This window draws the panel, the title bar, and the icons inside.
// Held files live in the box folder and have no desktop icons, so there is no reason to pass
// mouse events in the middle of the window through. Doing so would make box icons unselectable.
test('the box window draws its icons too', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'fences.js'), 'utf8');
  // The box window does not pass mouse events through. Only the drag ghost image does,
  // because if it captured the mouse it would block other programs under the cursor.
  const fencePart = main.slice(0, main.indexOf('function ensureGhost'));
  assert.equal(/setIgnoreMouseEvents/.test(fencePart), false, 'the box window is passing mouse events through');
  assert.match(main, /ghost\.setIgnoreMouseEvents\(true\)/, 'the drag ghost blocks other windows');
  assert.equal(/behindIcons/.test(main), false, 'still placing a panel behind the icon layer');
  assert.equal(/openPanel|placePanel/.test(main), false, 'the panel window still exists');
  // Icon images must be sent along so the window can draw icons.
  assert.match(main, /icon: await thumb\(item\.path\)/, 'does not send icon images to the window');

  // The window side also needs a place to put icons.
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.html'), 'utf8');
  assert.match(html, /id="body"/, 'no container for icons');
  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /desk\.open\(filePath\)/, 'icons cannot be opened');
  assert.match(code, /desk\.transfer\(/, 'icons cannot be dragged');

  // This window paints the panel.
  assert.match(code, /panel\.style\.background/, 'does not paint the panel color');
});

// The panel window (panel.*) is no longer used. Make sure its files were deleted too.
test('the panel window placed behind icons no longer exists', () => {
  for (const name of ['panel.html', 'panel.js', 'panel.css']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'src', 'renderer', name)), false, `${name} still exists`);
  }
});

// Item rename makes a round trip: main -> window -> main.
// The window needs a DOM to run, so here we only check that no link in the chain is missing.
test('the item rename path reaches the window', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  assert.match(preload, /onRenameItem/, 'no path for the window to receive rename notifications');
  assert.match(preload, /renameItem: \(id, filePath, name\)/, 'no path for the window to send the new name');

  const ipc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc.js'), 'utf8');
  assert.match(ipc, /fence:rename-item/, 'main does not receive the new name');
  assert.match(ipc, /host\.renameItem\(/, 'nothing handles the received name');

  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /desk\.onRenameItem\(/, 'the window does not start renaming');
  assert.match(code, /desk\.renameItem\(/, 'the window does not send the new name');

  const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.css'), 'utf8');
  assert.match(css, /\.icon input\.edit/, 'no styling for the name input');
});

// Dragging out to other programs goes window -> main.
// The Recycle Bin does not take that path.
test('the drag-out-to-other-programs path reaches the window', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  assert.match(preload, /overForeign:/, 'no path for the window to ask whether it is over another program');
  assert.match(preload, /dragOut:/, 'no path for the window to send a drag-out');
  assert.match(preload, /dragOutLater:/, 'no path to hand off after the mouse message finishes');

  const ipc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc.js'), 'utf8');
  assert.match(ipc, /fence:over-foreign/, 'main does not receive what is under the cursor');
  assert.match(ipc, /fence:drag-out/, 'main does not receive drag-outs');
  assert.match(ipc, /fence:drag-out-later[\s\S]*?setImmediate/, 'hands off immediately inside the mouse message');
  assert.match(ipc, /host\.dragOut\(/, 'nothing handles the received drag-out');

  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /function canHandOff[\s\S]*?item\.recycle/, 'does not exclude the Recycle Bin');
  assert.match(code, /addEventListener\('dragstart', onIconDragStart\)/, 'no drag-out entry point');
  assert.match(code, /function onIconDragStart[\s\S]*?desk\.dragOut\(/, 'the entry point does not hand off to other programs');
  assert.match(code, /el\.draggable = false/, 'OS drag hijacks dropping between boxes');
  assert.match(code, /desk\.dragOutLater\(/, 'does not hand off the drag-out over other programs');
  assert.match(code, /desk\.transfer\(/, 'does not send the drop position between boxes');
});

// Counting on both release and click would open on a single click even in double-click mode.
test('icon open clicks are counted in only one place', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  const click = code.slice(code.indexOf('function onIconClick'), code.indexOf('function pick'));
  assert.equal(click.includes('taps.tap'), false, 'counting on click too turns one press into two');
  assert.match(code, /openWith === 'single' \|\| taps\.tap\(filePath\)/, 'does not open on release');
  assert.match(code, /pick\(null\);\s*desk\.open\(filePath\)/, 'the selection outline remains after opening');
});

// Copy and cut/paste go from the window's keyboard shortcuts to main.
test('the copy and cut/paste paths reach the window', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  assert.match(preload, /copyItem:/, 'no path for the window to send copy');
  assert.match(preload, /cutItem:/, 'no path for the window to send cut');
  assert.match(preload, /paste:/, 'no path for the window to send paste');

  const ipc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc.js'), 'utf8');
  assert.match(ipc, /fence:copy/, 'main does not receive copy');
  assert.match(ipc, /fence:cut/, 'main does not receive cut');
  assert.match(ipc, /fence:paste/, 'main does not receive paste');

  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /desk\.copyItem\(/, 'keyboard shortcut does not copy');
  assert.match(code, /event\.key === 'Delete'/, 'Delete key does not delete');
  assert.match(code, /desk\.removeItems\(/, 'does not send selected items for deletion');
  assert.match(code, /mode === 'toggle'/, 'Ctrl does not multi-select');
  assert.match(code, /picked\.length > 1/, 'leaves an outline even with a single selection');
  assert.match(preload, /removeItems:/, 'no path for the window to send delete');
  assert.match(code, /desk\.cutItem\(/, 'keyboard shortcut does not cut');
  assert.match(code, /desk\.paste\(/, 'keyboard shortcut does not paste');
});

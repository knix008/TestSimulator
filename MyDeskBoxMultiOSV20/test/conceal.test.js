'use strict';

// Hidden and temporary files inside a box.
// Explorer does not draw hidden files, so a box must not either, unless the box is set to show them.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const conceal = require('../src/shared/conceal');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-conceal-'));

function realItem(name) {
  const full = path.join(SANDBOX, name);
  fs.writeFileSync(full, '');
  return { name, path: full };
}

function openWith(items, extra) {
  const state = baseState({ fences: [fence({ items, ...extra })] });
  const loaded = loadHost(state);
  // A file Explorer hides: the hidden attribute is set, the name looks ordinary.
  loaded.desktop.module.fileFlags = (at) => ({ hidden: path.basename(at).startsWith('secret'), system: false, temporary: false });
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  return { ...loaded, state };
}

async function shownNames(host, electron) {
  await host.push('a');
  const last = fenceWindows(electron)[0].messages('fence:state').at(-1);
  return last.items.map((item) => item.name);
}

test('temporary file names are recognised', () => {
  for (const name of ['~$보고서.docx', '~WRL0001.tmp', 'setup.exe.crdownload', 'a.TEMP', 'notes.txt~', 'Thumbs.db', 'desktop.ini', '.hidden']) {
    assert.equal(conceal.isConcealed(name, null), true, `${name} is not hidden`);
  }
  for (const name of ['보고서.docx', 'temp.txt', 'part.zip', '~home.txt', 'MyDeskBox.lnk']) {
    assert.equal(conceal.isConcealed(name, null), false, `${name} is hidden`);
  }
});

test('file attributes from the OS hide a file whatever its name', () => {
  assert.equal(conceal.isConcealed('보고서.docx', { hidden: true }), true);
  assert.equal(conceal.isConcealed('보고서.docx', { system: true }), true);
  assert.equal(conceal.isConcealed('보고서.docx', { temporary: true }), true);
  assert.equal(conceal.isConcealed('보고서.docx', { hidden: false, system: false, temporary: false }), false);
});

test('a box does not draw hidden or temporary files by default', async () => {
  const items = ['보고서.docx', '~$보고서.docx', 'secret.txt', 'download.crdownload', '사진.png'].map(realItem);
  const { host, electron, state } = openWith(items);
  assert.deepEqual(await shownNames(host, electron), ['보고서.docx', '사진.png']);
  // The files stay in the box; only drawing changes.
  assert.equal(state.fences[0].items.length, 5, 'hidden files were dropped from the box');
});

test('box setting shows hidden files, and turning it off hides them again', async () => {
  const items = ['a.txt', '~$a.txt', 'secret.txt'].map(realItem);
  const { host, electron, state } = openWith(items);
  host.changeBox('a', { showHidden: true });
  assert.equal(state.fences[0].showHidden, true);
  assert.deepEqual(await shownNames(host, electron), ['a.txt', '~$a.txt', 'secret.txt']);

  host.changeBox('a', { showHidden: false });
  assert.deepEqual(await shownNames(host, electron), ['a.txt']);
});

// The settings window gets the box itself, so the value only needs a switch wired to it.
test('the box settings window has a show-hidden switch in both languages', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'settings.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'settings.js'), 'utf8');
  const i18n = require('../src/shared/i18n');
  assert.match(html, /id="showHidden"/);
  assert.match(js, /showHidden: !fence\.showHidden/, 'switch does not toggle the setting');
  assert.match(js, /aria-checked', String\(!!fence\.showHidden\)/, 'switch does not show the current value');
  for (const lang of ['ko', 'en']) {
    assert.notEqual(i18n.t(lang, 'settings.showHidden'), 'settings.showHidden', `${lang} text missing`);
  }
});

test('Defaults turns showing hidden files back off', () => {
  const { host, state } = openWith([realItem('c.txt')], { showHidden: true });
  host.resetBox('a');
  assert.equal(state.fences[0].showHidden, false);
});

// The window counts only the icons it draws. A hidden file between them must not shift the drop slot.
test('dropping between icons lands next to the icons the user sees', async () => {
  const items = ['one.txt', '~$one.txt', 'two.txt'].map(realItem);
  const { host, state } = openWith(items);
  const extra = realItem('three.txt');
  // Second visible slot = in front of two.txt.
  await host.dropAt('a', [extra.path], 1);
  const names = state.fences[0].items.map((item) => path.basename(item.path));
  assert.deepEqual(names, ['one.txt', '~$one.txt', 'three.txt', 'two.txt']);
});

test('the setting is saved with the box', () => {
  const store = require('../src/main/store');
  const raw = { id: 'x', items: [], showHidden: true };
  assert.equal(store.normalizeFence(raw).showHidden, true);
  assert.equal(store.normalizeFence({ id: 'y', items: [] }).showHidden, false, 'older saves must start hidden');
});

// The app settings window (Files tab) switches it for every box at once.
test('app settings show hidden files in every box and in new boxes', async () => {
  const items = ['d.txt', '~$d.txt'].map(realItem);
  const state = baseState({ fences: [fence({ items }), fence({ id: 'b', x: 600, items: [] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  assert.deepEqual(await shownNames(host, electron), ['d.txt']);

  host.changePrefs({ showHidden: true });
  assert.equal(state.settings.showHidden, true);
  assert.deepEqual(state.fences.map((one) => one.showHidden), [true, true]);
  assert.deepEqual(await shownNames(host, electron), ['d.txt', '~$d.txt']);

  const made = host.finishDraw({ x: 10, y: 500, w: 300, h: 240 });
  assert.equal(made.showHidden, true, 'a new box does not follow the app setting');

  host.changePrefs({ showHidden: false });
  assert.deepEqual(state.fences.map((one) => one.showHidden), [false, false, false]);
});

test('the app settings window has the switch on the Files tab', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.js'), 'utf8');
  const files = html.slice(html.indexOf('data-pane="files"'), html.indexOf('data-pane="about"'));
  assert.match(files, /id="showHidden"/, 'switch is not on the Files tab');
  assert.match(js, /showHidden: !settings\.showHidden/, 'switch does not toggle the setting');
  assert.match(js, /aria-checked', String\(!!settings\.showHidden\)/, 'switch does not show the current value');
});

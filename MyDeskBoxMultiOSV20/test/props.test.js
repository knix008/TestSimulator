'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// Picks only the properties windows, so they don't mix with box windows.
function propsWindows(electron) {
  return electron.windows.filter((win) => win.loaded && /props\.html$/.test(win.loaded.file));
}

// What was handed to the window. The window draws it as is, so checking this pins down the screen.
function shown(electron) {
  const win = propsWindows(electron).at(-1);
  assert.ok(win, 'the properties window did not open');
  return { win, props: JSON.parse(win.loaded.opts.query.props) };
}

function valueOf(props, label) {
  const row = props.rows.find((one) => one.label === label);
  return row ? row.value : null;
}

// A stand-in desktop. Files move into the box folder once held, so paths here soon go stale.
function deskDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-props-'));
}

// Opens one box and finds the current path of each held item.
// Size and date are measured for real, so real files are needed.
async function openWith(items, extra) {
  const state = baseState({ ...extra, fences: [fence({ items })] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  await loaded.host.push('a');
  const sent = fenceWindows(loaded.electron)[0].messages('fence:state').at(-1).items;
  return {
    ...loaded,
    // The path after holding. A box works out of its own folder.
    pathOf(name) {
      const found = sent.find((one) => one.name === name);
      assert.ok(found, `'${name}' was not held in the box`);
      return found.path;
    },
  };
}

test('the icon menu has Properties with an icon', async () => {
  const { host, electron } = await openWith([]);
  host.showMenu('a', 'C:/Desktop/노트.txt');
  const item = electron.menus.at(-1).find((one) => one.label === '속성');
  assert.ok(item, 'the menu has no Properties');
  assert.ok(item.icon && fs.existsSync(item.icon.path), 'Properties has no icon');
});

test('the menu opened on an empty spot has no Properties', async () => {
  const { host, electron } = await openWith([]);
  host.showMenu('a', null);
  const labels = electron.menus.at(-1).map((one) => one.label);
  assert.equal(labels.includes('속성'), false, 'Properties is shown with nothing selected');
});

test('file properties show name, location, size, and date', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, '노트.txt'), 'x'.repeat(2048));
  const { host, electron, pathOf } = await openWith([{ name: '노트.txt', path: path.join(dir, '노트.txt') }]);
  const file = pathOf('노트.txt');

  await host.showProps('a', file);
  const { props } = shown(electron);
  assert.equal(props.title, '노트.txt');
  assert.equal(props.kind, 'TXT 파일');
  assert.equal(valueOf(props, '위치'), path.dirname(file));
  assert.equal(valueOf(props, '담긴 박스'), '박스');
  // Over 1024 bytes, both a readable value and the exact byte count are shown.
  assert.equal(valueOf(props, '크기'), '2.0 KB (2,048 바이트)');
  assert.ok(valueOf(props, '수정한 날짜'), 'the modified date is empty');
  assert.equal(valueOf(props, '특성'), '없음');
});

test('under 1024 bytes only the byte count is shown', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.alloc(300));
  const { host, electron, pathOf } = await openWith([{ name: 'a.bin', path: path.join(dir, 'a.bin') }]);

  await host.showProps('a', pathOf('a.bin'));
  assert.equal(valueOf(shown(electron).props, '크기'), '300 바이트');
});

test('folder properties show the item count inside and the total size', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '일감');
  fs.mkdirSync(path.join(folder, '속'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'a.txt'), Buffer.alloc(100));
  fs.writeFileSync(path.join(folder, '속', 'b.txt'), Buffer.alloc(200));
  const { host, electron, pathOf } = await openWith([{ name: '일감', path: folder }]);

  await host.showProps('a', pathOf('일감'));
  const { props } = shown(electron);
  assert.equal(props.kind, '폴더');
  assert.equal(valueOf(props, '크기'), '300 바이트');
  assert.equal(valueOf(props, '안의 항목'), '파일 2개 · 폴더 1개');
});

test('an item deleted from outside still opens properties and says it cannot be found', async () => {
  const gone = path.join(deskDir(), '없는것.txt');
  const { host, electron } = await openWith([{ name: '없는것.txt', path: gone }]);

  await host.showProps('a', gone);
  const { props } = shown(electron);
  assert.match(props.kind, /찾을 수 없습니다/);
  assert.equal(valueOf(props, '크기'), null, 'a size was shown for something that cannot be measured');
  assert.equal(valueOf(props, '위치'), path.dirname(gone));
});

test('with several selected, the count and total are shown', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(100));
  fs.writeFileSync(path.join(dir, 'b.txt'), Buffer.alloc(200));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: 'b.txt', path: path.join(dir, 'b.txt') },
  ]);
  const one = pathOf('a.txt');
  const two = pathOf('b.txt');

  await host.showProps('a', one, [one, two]);
  const { props } = shown(electron);
  assert.equal(props.title, '2개 항목');
  assert.equal(valueOf(props, '크기'), '300 바이트');
  assert.equal(valueOf(props, '안의 항목'), '파일 2개 · 폴더 0개');
});

test('with only one selected, that item is shown rather than a group', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const one = pathOf('a.txt');

  await host.showProps('a', one, [one]);
  assert.equal(shown(electron).props.title, 'a.txt');
});

test('the same item never gets two properties windows', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const one = pathOf('a.txt');

  await host.showProps('a', one);
  await host.showProps('a', one);
  assert.equal(propsWindows(electron).length, 1, 'two properties windows opened');
});

test('items with no file to measure, like the Recycle Bin, still open properties', async () => {
  const { host, electron } = await openWith([{ name: '휴지통', path: 'shell:RecycleBinFolder' }]);

  await host.showProps('a', 'shell:RecycleBinFolder');
  const { props } = shown(electron);
  assert.equal(props.kind, '시스템 항목');
  assert.equal(valueOf(props, '위치'), 'shell:RecycleBinFolder');
  assert.equal(valueOf(props, '크기'), null, 'a size was made up for a shell item');
});

test('the window shrinks to the height it reports and Close closes it', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  await host.showProps('a', pathOf('a.txt'));
  const { win, props } = shown(electron);
  electron.module.ipcMain.emit('props:size', { key: props.key, height: 220 });
  assert.equal(win.getBounds().height, 220 + 18 * 2, 'the window did not shrink to the reported height');
  assert.equal(win.isVisible(), true, 'the window stayed hidden after reporting its height');

  electron.module.ipcMain.emit('props:close', props.key);
  assert.equal(win.isDestroyed(), true, 'Close did not close the window');
});

test('in English, the properties text is in English too', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith(
    [{ name: 'a.txt', path: path.join(dir, 'a.txt') }],
    { settings: { lang: 'en' } }
  );
  const file = pathOf('a.txt');

  await host.showProps('a', file);
  const { props } = shown(electron);
  assert.equal(props.close, 'Close');
  assert.equal(valueOf(props, 'Location'), path.dirname(file));
  assert.equal(valueOf(props, 'Size'), '10 bytes');
});

// ── Does it really open from the menu ─────────────────────
// The checks above call showProps directly. They would still pass if the menu wiring broke,
// so there is a separate check that follows the path a person clicks.

function propsItem(electron) {
  const item = electron.menus.at(-1).find((one) => one.label === '속성');
  assert.ok(item, 'the menu has no Properties');
  return item;
}

test('the window opens only when Properties is clicked in the menu', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, '노트.txt'), 'hello');
  const { host, electron, pathOf } = await openWith([{ name: '노트.txt', path: path.join(dir, '노트.txt') }]);
  const file = pathOf('노트.txt');

  host.showMenu('a', file, [file]);
  assert.equal(propsWindows(electron).length, 0, 'a window appeared just from opening the menu');
  await propsItem(electron).click();
  assert.equal(shown(electron).props.title, '노트.txt');
});

test('clicking Properties with several selected opens properties for the group', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(100));
  fs.writeFileSync(path.join(dir, 'b.txt'), Buffer.alloc(100));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: 'b.txt', path: path.join(dir, 'b.txt') },
  ]);
  const group = [pathOf('a.txt'), pathOf('b.txt')];

  host.showMenu('a', group[0], group);
  await propsItem(electron).click();
  const { props } = shown(electron);
  assert.equal(props.title, '2개 항목');
  assert.equal(valueOf(props, '크기'), '200 바이트');
});

// ── The window itself ─────────────────────────────────────

test('the properties window does not hide behind always-on-top boxes', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  await host.showProps('a', pathOf('a.txt'));
  const { win } = shown(electron);
  assert.equal(win.options.alwaysOnTop, true, 'it hides behind boxes');
  assert.equal(win.options.frame, false, 'it has a window frame');
  assert.equal(win.options.transparent, true, 'the shadow area is not transparent');
  assert.equal(win.options.skipTaskbar, true, 'it shows up in the taskbar');
  assert.equal(win.options.resizable, false, 'it can be resized');
});

test('the window is shown even if it never reports its height', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  await host.showProps('a', pathOf('a.txt'));
  const { win } = shown(electron);
  assert.equal(win.isVisible(), false, 'the window was shown before it was drawn');
  win.ready();
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(win.isVisible(), true, 'without a reported height the window stays hidden forever');
});

test('after closing the window, properties for the same item can open again', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const file = pathOf('a.txt');

  await host.showProps('a', file);
  shown(electron).win.close();
  await host.showProps('a', file);
  assert.equal(propsWindows(electron).length, 2, 'the closed window is still held, so it does not reopen');
});

test('each item gets its own properties window', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'b.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: 'b.txt', path: path.join(dir, 'b.txt') },
  ]);

  await host.showProps('a', pathOf('a.txt'));
  await host.showProps('a', pathOf('b.txt'));
  assert.equal(propsWindows(electron).length, 2, 'one window was reused for a different item');
});

// ── Values shown ──────────────────────────────────────────

test('read-only files are marked in the attributes', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const file = pathOf('a.txt');
  fs.chmodSync(file, 0o444);

  await host.showProps('a', file);
  assert.equal(valueOf(shown(electron).props, '특성'), '읽기 전용');
  fs.chmodSync(file, 0o644);   // restore so the test folder can be cleaned up
});

test('shortcuts show their target', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, '한글.lnk'), 'link');
  const { host, electron, pathOf } = await openWith([{ name: '한글.lnk', path: path.join(dir, '한글.lnk') }]);
  const link = pathOf('한글.lnk');
  electron.shell.links.set(link, { target: 'C:/Program Files/Hnc/Hwp.exe', icon: '' });

  await host.showProps('a', link);
  const { props } = shown(electron);
  assert.equal(props.kind, '바로가기');
  assert.equal(valueOf(props, '가리키는 곳'), 'C:/Program Files/Hnc/Hwp.exe');
  // Long paths must wrap anywhere so they don't overflow the window.
  assert.equal(props.rows.find((one) => one.label === '가리키는 곳').wide, true);
});

test('hitting the limit marks the measured value as a minimum', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '많은것');
  fs.mkdirSync(folder);
  for (let i = 0; i < 20; i += 1) fs.writeFileSync(path.join(folder, `${i}.txt`), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: '많은것', path: folder }]);

  // Narrow the limit so only five of twenty are counted. Don't make up a value; append "or more".
  await host.showProps('a', pathOf('많은것'), null, { entries: 5 });
  assert.match(valueOf(shown(electron).props, '크기'), /이상$/);
});

test('counting everything within the limit does not mark it as a minimum', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '조금');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: '조금', path: folder }]);

  await host.showProps('a', pathOf('조금'));
  assert.equal(valueOf(shown(electron).props, '크기'), '10 바이트');
});

test('rows handed to the window have no empty values or untranslated keys', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '일감');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'a.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, '노트.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([
    { name: '일감', path: folder },
    { name: '노트.txt', path: path.join(dir, '노트.txt') },
  ]);

  for (const name of ['일감', '노트.txt']) {
    await host.showProps('a', pathOf(name));
    const { props } = shown(electron);
    assert.ok(props.title, `the title of ${name} is empty`);
    assert.ok(props.kind, `the kind of ${name} is empty`);
    assert.ok(props.close, `the Close button of ${name} is empty`);
    assert.ok(props.rows.length >= 4, `${name} has too few rows`);
    for (const row of props.rows) {
      assert.ok(row.label.trim(), `${name} has a row without a label`);
      assert.ok(row.value.trim(), `the '${row.label}' value of ${name} is empty`);
      // i18n.t returns unknown keys unchanged, so a typo would show up on screen as is.
      for (const text of [row.label, row.value, props.kind, props.close]) {
        assert.doesNotMatch(text, /^(props|menu|box)\./, `untranslated key: ${text}`);
      }
    }
  }
});

// ── Wiring between the window and main ────────────────────

const ROOT = path.join(__dirname, '..');

test('all properties window files exist and reference each other', () => {
  const dir = path.join(ROOT, 'src', 'renderer');
  for (const name of ['props.html', 'props.css', 'props.js']) {
    assert.ok(fs.existsSync(path.join(dir, name)), `src/renderer/${name} is missing`);
  }
  const html = fs.readFileSync(path.join(dir, 'props.html'), 'utf8');
  assert.match(html, /href="props\.css"/, 'the properties window does not load its stylesheet');
  assert.match(html, /src="props\.js"/, 'the properties window does not load its script');
  // Slots for the rows that main sends
  for (const id of ['mark', 'title', 'kind', 'rows', 'close']) {
    assert.match(html, new RegExp(`id="${id}"`), `the properties window has no ${id} slot`);
  }
});

test('every call the properties window makes is exposed in preload', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'props.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  const used = [...code.matchAll(/desk\.(\w+)\(/g)].map((hit) => hit[1]);
  assert.ok(used.length >= 2, 'the properties window never talks to main');
  for (const name of new Set(used)) {
    assert.match(preload, new RegExp(`\\b${name}:`), `preload has no ${name}`);
  }
});

test('values in the properties window can be selected and copied', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'props.css'), 'utf8');
  // Text selection is off for the whole panel; only paths and dates are selectable.
  assert.match(css, /#rows dd \{[^}]*user-select: text/s, 'paths cannot be copied');
  assert.match(css, /#rows dd\.wide \{[^}]*word-break: break-all/s, 'long paths overflow the window');
});

// ── Measuring a group ─────────────────────────────────────

test('folders in a group are counted and their contents added', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '일감');
  fs.mkdirSync(path.join(folder, '속'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'a.txt'), Buffer.alloc(100));
  fs.writeFileSync(path.join(folder, '속', 'b.txt'), Buffer.alloc(200));
  fs.writeFileSync(path.join(dir, '노트.txt'), Buffer.alloc(50));
  const { host, electron, pathOf } = await openWith([
    { name: '일감', path: folder },
    { name: '노트.txt', path: path.join(dir, '노트.txt') },
  ]);
  const group = [pathOf('일감'), pathOf('노트.txt')];

  await host.showProps('a', group[0], group);
  const { props } = shown(electron);
  assert.equal(valueOf(props, '크기'), '350 바이트');
  // The selected folder plus the folder inside it; two files inside plus the selected note
  assert.equal(valueOf(props, '안의 항목'), '파일 3개 · 폴더 2개');
  assert.equal(props.kind, '여러 종류');
});

test('a group of the same kind shows that kind', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'b.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: 'b.txt', path: path.join(dir, 'b.txt') },
  ]);
  const group = [pathOf('a.txt'), pathOf('b.txt')];

  await host.showProps('a', group[0], group);
  assert.equal(shown(electron).props.kind, 'TXT 파일');
});

test('shell items in a group are not added to the size', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(120));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: '휴지통', path: 'shell:RecycleBinFolder' },
  ]);
  const group = [pathOf('a.txt'), 'shell:RecycleBinFolder'];

  await host.showProps('a', group[0], group);
  const { props } = shown(electron);
  assert.equal(props.title, '2개 항목');
  // A shell item has no file to measure. It is counted neither as 0 nor as a made-up value.
  assert.equal(valueOf(props, '크기'), '120 바이트');
  assert.equal(valueOf(props, '안의 항목'), '파일 1개 · 폴더 0개');
});

test('if the clicked item is not in the selected group, only that item is shown', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'b.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'c.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: 'b.txt', path: path.join(dir, 'b.txt') },
    { name: 'c.txt', path: path.join(dir, 'c.txt') },
  ]);

  // An icon outside the selection was clicked. Show that item, not the selected group.
  await host.showProps('a', pathOf('c.txt'), [pathOf('a.txt'), pathOf('b.txt')]);
  assert.equal(shown(electron).props.title, 'c.txt');
});

test('groups respect the limit too', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '많은것');
  fs.mkdirSync(folder);
  for (let i = 0; i < 20; i += 1) fs.writeFileSync(path.join(folder, `${i}.txt`), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, '노트.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([
    { name: '많은것', path: folder },
    { name: '노트.txt', path: path.join(dir, '노트.txt') },
  ]);
  const group = [pathOf('많은것'), pathOf('노트.txt')];

  await host.showProps('a', group[0], group, { entries: 5 });
  assert.match(valueOf(shown(electron).props, '크기'), /이상$/);
});

// ── When nothing should open ──────────────────────────────

test('no window opens for an unknown box or an empty item', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  assert.equal(await host.showProps('없는박스', pathOf('a.txt')), null);
  assert.equal(await host.showProps('a', null), null);
  assert.equal(await host.showProps('a', ''), null);
  assert.equal(propsWindows(electron).length, 0, 'a window appeared with nothing to open');
});

'use strict';

// 창(렌더러)과 메인(Rust) 사이의 길을 본다.
// 창은 src/renderer/bridge.js 의 window.desk 만 쓰고, bridge.js 는 Tauri 명령(src-tauri/src/commands.rs)과
// 사건 이름으로 메인과 이야기한다. 어느 한 고리라도 빠지면 창은 조용히 아무 일도 안 하므로 여기서 잡는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'src', 'shared');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const RUST = path.join(ROOT, 'src-tauri', 'src');

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

// 창이 <script> 로 읽는 파일과 각 파일이 남기는 전역 이름.
const SCRIPTS = [
  ['arrange.js', 'DeskArrange'],
  ['deliver.js', 'DeskDeliver'],
  ['taps.js', 'DeskTaps'],
  ['i18n.js', 'DeskI18n'],
];

function rustFiles(dir = RUST) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...rustFiles(full));
    else if (entry.name.endsWith('.rs') && !/tests?(_\w+)?\.rs$|testkit\.rs$|fake\.rs$/.test(entry.name)) out.push(fs.readFileSync(full, 'utf8'));
  }
  return out;
}

function deskApi() {
  const code = read(RENDERER, 'bridge.js');
  const body = code.slice(code.indexOf('window.desk = {'));
  return new Set([...body.matchAll(/^\s{4}(\w+)(?::|,\r?$)/gm)].map((m) => m[1]));
}

// 창 하나에서는 여러 <script> 가 전역 범위를 함께 쓴다.
// 한 파일이 맨 위에 const 를 두면 같은 이름을 쓰는 다음 파일이 통째로 죽는다.
test('all files survive being loaded together in one window', () => {
  const context = vm.createContext({ console });
  for (const [file] of SCRIPTS) {
    vm.runInContext(read(SHARED, file), context, { filename: file });
  }
  for (const [file, name] of SCRIPTS) {
    assert.equal(typeof context[name], 'object', `${file} did not leave ${name} behind`);
  }
  for (const leaked of ['api', 'TEXT', 'CELL_W', 'FALLBACK', 'DOUBLE_MS']) {
    assert.equal(context[leaked], undefined, `${leaked} leaked into the global scope`);
  }
});

test('the script list the window loads matches the actual files', () => {
  const html = read(RENDERER, 'fence.html');
  const listed = [...html.matchAll(/<script src="\.\.\/shared\/([\w.]+)"/g)].map((m) => m[1]);
  for (const name of listed) {
    assert.ok(fs.existsSync(path.join(SHARED, name)), `fence.html loads ${name}, which does not exist`);
  }
  const code = read(RENDERER, 'fence.js');
  const used = new Set([...code.matchAll(/window\.(Desk\w+)/g)].map((m) => m[1]));
  const given = new Set(SCRIPTS.filter(([file]) => listed.includes(file)).map(([, name]) => name));
  for (const name of used) {
    assert.ok(given.has(name), `fence.html does not load ${name}, which fence.js uses`);
  }
});

// 박스 창에서 쓰는 칸 크기와 놓는 자리 판단은 메인(Rust)도 똑같이 셈한다. 두 곳의 수가 같아야 한다.
test('the box grid in the window and in Rust use the same numbers', () => {
  const arrange = require(path.join(SHARED, 'arrange.js'));
  const geom = read(RUST, 'geom.rs');
  for (const name of ['CELL_W', 'CELL_H', 'PAD', 'TITLE_H', 'SHADOW']) {
    const found = geom.match(new RegExp(`pub const ${name}: f64 = ([\\d.]+);`));
    assert.ok(found, `geom.rs has no ${name}`);
    assert.equal(Number(found[1]), arrange[name], `${name} differs between arrange.js and geom.rs`);
  }
  const deliver = require(path.join(SHARED, 'deliver.js'));
  assert.deepEqual(deliver.PICTURE, { left: 15, right: 71, top: 2, bottom: 54 }, 'update picture_area_matches_the_icon in geom.rs too');
});

// 모든 화면은 bridge.js 를 맨 먼저 읽어야 window.desk 가 있다.
test('every window loads the bridge first', () => {
  for (const file of fs.readdirSync(RENDERER).filter((name) => name.endsWith('.html'))) {
    const html = read(RENDERER, file);
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(scripts[0], 'bridge.js', `${file} does not load bridge.js first`);
  }
  for (const gone of ['preload', 'main']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'src', gone)), false, `src/${gone} (Electron) is still there`);
  }
  for (const file of fs.readdirSync(RENDERER).filter((name) => name.endsWith('.js') && name !== 'bridge.js')) {
    assert.equal(/location\.search/.test(read(RENDERER, file)), false, `${file} reads location.search instead of window.deskQuery`);
  }
});

test('every desk call in the windows exists in the bridge', () => {
  const api = deskApi();
  for (const file of fs.readdirSync(RENDERER).filter((name) => name.endsWith('.js') && name !== 'bridge.js')) {
    for (const [, name] of read(RENDERER, file).matchAll(/\bdesk\.(\w+)/g)) {
      assert.ok(api.has(name), `${file} calls desk.${name}, which bridge.js does not provide`);
    }
  }
});

test('every command the bridge invokes is a registered Tauri command', () => {
  const bridge = read(RENDERER, 'bridge.js');
  const commands = read(RUST, 'commands.rs');
  const lib = read(RUST, 'lib.rs');
  const handler = lib.slice(lib.indexOf('generate_handler!['), lib.indexOf(']', lib.indexOf('generate_handler![')));
  const invoked = new Set([...bridge.matchAll(/(?:invoke|whenListening)\('(\w+)'/g)].map((m) => m[1]));
  assert.ok(invoked.size > 30, 'could not read the invoked commands');
  for (const name of invoked) {
    assert.match(commands, new RegExp(`#\\[tauri::command\\]\\s*pub async fn ${name}\\(`), `commands.rs has no async command ${name}`);
    assert.match(handler, new RegExp(`commands::${name}\\b`), `lib.rs does not register ${name}`);
  }
  // 명령은 모두 async 여야 한다. 동기 명령은 주 스레드에서 돌아 창을 만들 때 멈춘다.
  assert.equal(/#\[tauri::command\]\s*pub fn /.test(commands), false, 'a command is not async');
});

test('every event the bridge listens to is sent from Rust', () => {
  const bridge = read(RENDERER, 'bridge.js');
  const rust = rustFiles().join('\n');
  const events = new Set([...bridge.matchAll(/on\('([\w:-]+)'/g)].map((m) => m[1]));
  assert.ok(events.size >= 8, 'could not read the events');
  for (const name of events) {
    assert.ok(rust.includes(`"${name}"`), `nothing in src-tauri sends ${name}`);
  }
});

// 상자는 창 하나다. 이 창이 판과 제목 줄과 안의 아이콘을 그린다.
// 가운데 마우스를 흘려보내면 박스 아이콘을 고를 수 없다. 끄는 그림(ghost)만 흘려보낸다.
test('the box window draws its icons and only the drag ghost lets the mouse through', () => {
  const host = read(RUST, 'host', 'mod.rs');
  const fenceSpec = host.slice(host.indexOf('page: "renderer/fence.html"'), host.indexOf('page: "renderer/fence.html"') + 400);
  assert.match(fenceSpec, /ignore_mouse: false/, 'the box window is passing mouse events through');
  const ghostSpec = host.slice(host.indexOf('page: "renderer/ghost.html"'), host.indexOf('page: "renderer/ghost.html"') + 400);
  assert.match(ghostSpec, /ignore_mouse: true/, 'the drag ghost blocks other windows');
  for (const name of ['panel.html', 'panel.js', 'panel.css']) {
    assert.equal(fs.existsSync(path.join(RENDERER, name)), false, `${name} still exists`);
  }
  const html = read(RENDERER, 'fence.html');
  assert.match(html, /id="body"/, 'no container for icons');
  const code = read(RENDERER, 'fence.js');
  assert.match(code, /desk\.open\(filePath\)/, 'icons cannot be opened');
  assert.match(code, /desk\.transfer\(/, 'icons cannot be dragged');
  assert.match(code, /panel\.style\.background/, 'does not paint the panel color');
});

test('the item rename path reaches the window', () => {
  const code = read(RENDERER, 'fence.js');
  assert.match(code, /desk\.onRenameItem\(/, 'the window does not start renaming');
  assert.match(code, /desk\.renameItem\(/, 'the window does not send the new name');
  assert.match(read(RENDERER, 'fence.css'), /\.icon input\.edit/, 'no styling for the name input');
});

// 다른 프로그램으로 끌어내기는 창 → 메인. 휴지통은 그 길을 타지 않는다.
test('the drag-out-to-other-programs path reaches the window', () => {
  const code = read(RENDERER, 'fence.js');
  assert.match(code, /function canHandOff[\s\S]*?item\.recycle/, 'does not exclude the Recycle Bin');
  assert.match(code, /addEventListener\('dragstart', onIconDragStart\)/, 'no drag-out entry point');
  assert.match(code, /function onIconDragStart[\s\S]*?desk\.dragOut\(/, 'the entry point does not hand off to other programs');
  assert.match(code, /el\.draggable = false/, 'OS drag hijacks dropping between boxes');
  assert.match(code, /desk\.dragOutLater\(/, 'does not hand off the drag-out over other programs');
  // 탐색기에서 끌어 온 파일은 Tauri 의 끌어 놓기 사건으로 받는다 (HTML 의 drop 은 오지 않는다).
  assert.match(code, /desk\.onFileDrag\(/, 'files dragged in from Explorer are not received');
  assert.match(code, /desk\.dropFiles\(/, 'dropped files are not sent');
});

// 놓을 때와 누를 때 둘 다 세면 두 번 눌러 열기에서도 한 번에 열린다.
test('icon open clicks are counted in only one place', () => {
  const code = read(RENDERER, 'fence.js');
  const click = code.slice(code.indexOf('function onIconClick'), code.indexOf('function pick'));
  assert.equal(click.includes('taps.tap'), false, 'counting on click too turns one press into two');
  assert.match(code, /openWith === 'single' \|\| taps\.tap\(filePath\)/, 'does not open on release');
  assert.match(code, /pick\(null\);\s*desk\.open\(filePath\)/, 'the selection outline remains after opening');
});

test('the copy and cut/paste paths reach the window', () => {
  const code = read(RENDERER, 'fence.js');
  assert.match(code, /desk\.copyItem\(/, 'keyboard shortcut does not copy');
  assert.match(code, /event\.key === 'Delete'/, 'Delete key does not delete');
  assert.match(code, /desk\.removeItems\(/, 'does not send selected items for deletion');
  assert.match(code, /mode === 'toggle'/, 'Ctrl does not multi-select');
  assert.match(code, /picked\.length > 1/, 'leaves an outline even with a single selection');
  assert.match(code, /desk\.cutItem\(/, 'keyboard shortcut does not cut');
  assert.match(code, /desk\.paste\(/, 'keyboard shortcut does not paste');
});

test('the settings windows have the show-hidden switch in both languages', () => {
  const i18n = require(path.join(SHARED, 'i18n.js'));
  const box = read(RENDERER, 'settings.html');
  const boxJs = read(RENDERER, 'settings.js');
  assert.match(box, /id="showHidden"/);
  assert.match(boxJs, /showHidden: !fence\.showHidden/, 'switch does not toggle the setting');
  assert.match(boxJs, /aria-checked', String\(!!fence\.showHidden\)/, 'switch does not show the current value');
  for (const lang of ['ko', 'en']) {
    assert.notEqual(i18n.t(lang, 'settings.showHidden'), 'settings.showHidden', `${lang} text missing`);
  }
  const prefs = read(RENDERER, 'prefs.html');
  const prefsJs = read(RENDERER, 'prefs.js');
  const files = prefs.slice(prefs.indexOf('data-pane="files"'), prefs.indexOf('data-pane="about"'));
  assert.match(files, /id="showHidden"/, 'switch is not on the Files tab');
  assert.match(prefsJs, /showHidden: !settings\.showHidden/, 'switch does not toggle the setting');
  assert.match(prefsJs, /aria-checked', String\(!!settings\.showHidden\)/, 'switch does not show the current value');
});

// 설정 창 같은 곳의 버튼은 가로·세로로 줄을 맞춘다: 글자는 가운데, 한 줄의 버튼은 같은 너비와 높이.
test('dialog buttons are aligned', () => {
  const rule = (css, selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `no rule for ${selector}`);
    return css.slice(at, css.indexOf('}', at));
  };
  for (const [file, selector] of [['ask.css', '#buttons'], ['props.css', '#buttons']]) {
    const body = rule(read(RENDERER, file), selector);
    assert.match(body, /display: grid/, `${file} ${selector} is not a grid`);
    assert.match(body, /grid-auto-columns: 1fr/, `${file} buttons do not share one width`);
  }
  const settings = read(RENDERER, 'settings.css');
  assert.match(rule(settings, '#foot button'), /flex: 1 1 0/, 'settings footer buttons differ in width');
  for (const [file, selector] of [['settings.css', '#foot button'], ['ask.css', 'button'], ['props.css', 'button'], ['prefs.css', '.chip']]) {
    const body = rule(read(RENDERER, file), selector);
    assert.match(body, /align-items: center/, `${file} ${selector} text is not centered vertically`);
    assert.match(body, /justify-content: center/, `${file} ${selector} text is not centered horizontally`);
  }
});

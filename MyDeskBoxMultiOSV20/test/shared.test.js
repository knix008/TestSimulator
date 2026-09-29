'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'src', 'shared');

// 창이 <script> 로 읽는 파일과 그 파일이 남기는 이름.
const SCRIPTS = [
  ['arrange.js', 'DeskArrange'],
  ['deliver.js', 'DeskDeliver'],
  ['taps.js', 'DeskTaps'],
  ['i18n.js', 'DeskI18n'],
  ['deskgrid.js', 'DeskGrid'],
];

// 창에서는 여러 <script> 가 전역을 함께 쓴다.
// 한 파일이 최상위에 const 를 두면 다음 파일이 같은 이름을 쓸 때 통째로 죽는다.
// 여기서 같은 방식으로 한 자리에 모아 읽어 그런 부딪힘을 잡아낸다.
test('여러 파일을 한 창에 함께 읽어도 모두 살아남는다', () => {
  const context = vm.createContext({ console });
  for (const [file] of SCRIPTS) {
    const code = fs.readFileSync(path.join(SHARED, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  for (const [file, name] of SCRIPTS) {
    assert.equal(typeof context[name], 'object', `${file} 이 ${name} 을 남기지 못했다`);
  }
});

test('창이 읽는 목록과 실제 파일이 맞는다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.html'), 'utf8');
  const listed = [...html.matchAll(/<script src="\.\.\/shared\/([\w.]+)"/g)].map((m) => m[1]);
  for (const name of listed) {
    assert.ok(fs.existsSync(path.join(SHARED, name)), `fence.html 이 없는 ${name} 을 읽는다`);
  }
  // fence.js 가 쓰는 이름은 모두 읽어 둔 파일이 만들어야 한다.
  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  const used = new Set([...code.matchAll(/window\.(Desk\w+)/g)].map((m) => m[1]));
  const given = new Set(SCRIPTS.filter(([file]) => listed.includes(file)).map(([, name]) => name));
  for (const name of used) {
    assert.ok(given.has(name), `fence.js 가 쓰는 ${name} 을 fence.html 이 읽지 않는다`);
  }
});

test('메인에서 require 로 읽어도 같은 것이 나온다', () => {
  for (const [file, name] of SCRIPTS) {
    const loaded = require(path.join(SHARED, file));
    assert.equal(typeof loaded, 'object', `${file} 을 require 할 수 없다`);
    assert.ok(Object.keys(loaded).length > 0, `${name} 이 비어 있다`);
  }
  const arrange = require(path.join(SHARED, 'arrange.js'));
  assert.equal(typeof arrange.gridOf, 'function');
  assert.equal(typeof arrange.windowRect, 'function');
});

test('창 안에서 쓰는 이름이 전역을 더럽히지 않는다', () => {
  const context = vm.createContext({ console });
  for (const [file] of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(SHARED, file), 'utf8'), context, { filename: file });
  }
  // 파일 안에서만 쓰는 이름은 밖으로 새지 않아야 한다.
  for (const leaked of ['api', 'TEXT', 'CELL_W', 'FALLBACK', 'DOUBLE_MS']) {
    assert.equal(context[leaked], undefined, `${leaked} 이 전역으로 새 나갔다`);
  }
});

// 박스는 창 하나다. 판도, 제목 줄도, 그 안의 아이콘도 이 창이 그린다.
// 담긴 파일은 박스 폴더에 있어 바탕화면 아이콘이 없으므로, 창 가운데의 마우스를
// 아래로 흘려보낼 까닭이 없다. 흘려보내면 박스 안의 아이콘을 고를 수 없다.
test('박스 창이 아이콘까지 그린다', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'fences.js'), 'utf8');
  // 박스 창은 마우스를 아래로 흘려보내지 않는다. 따라다니는 그림만 흘려보낸다.
  // 그 그림이 마우스를 받으면 커서 아래의 다른 프로그램을 가린다.
  const fencePart = main.slice(0, main.indexOf('function ensureGhost'));
  assert.equal(/setIgnoreMouseEvents/.test(fencePart), false, '박스 창이 마우스를 아래로 흘려보내고 있다');
  assert.match(main, /ghost\.setIgnoreMouseEvents\(true\)/, '따라다니는 그림이 다른 창을 가린다');
  assert.equal(/behindIcons/.test(main), false, '아이콘 층 뒤에 판을 넣고 있다');
  assert.equal(/openPanel|placePanel/.test(main), false, '판 창이 남아 있다');
  // 그림을 함께 보내야 창이 아이콘을 그릴 수 있다.
  assert.match(main, /icon: await thumb\(item\.path\)/, '아이콘 그림을 창에 보내지 않는다');

  // 창 쪽에도 아이콘을 놓을 자리가 있어야 한다.
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.html'), 'utf8');
  assert.match(html, /id="body"/, '아이콘을 담을 자리가 없다');
  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /desk\.open\(filePath\)/, '아이콘을 열 수 없다');
  assert.match(code, /desk\.transfer\(/, '아이콘을 끌어 옮길 수 없다');

  // 판은 이 창이 칠한다.
  assert.match(code, /panel\.style\.background/, '판 색을 칠하지 않는다');
});

// 판 창(panel.*)은 더 쓰지 않는다. 파일까지 지웠는지 확인한다.
test('아이콘 뒤에 넣던 판 창은 남아 있지 않다', () => {
  for (const name of ['panel.html', 'panel.js', 'panel.css']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'src', 'renderer', name)), false, `${name} 이 남아 있다`);
  }
});

// 항목 이름 바꾸기는 메인 → 창 → 메인으로 한 바퀴 돈다.
// 창은 DOM 이 있어야 돌아가므로 여기서는 길이 끊긴 자리가 없는지만 본다.
test('항목 이름 바꾸기 길이 창까지 이어진다', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  assert.match(preload, /onRenameItem/, '창이 이름 바꾸기 알림을 받을 길이 없다');
  assert.match(preload, /renameItem: \(id, filePath, name\)/, '창이 바꾼 이름을 보낼 길이 없다');

  const ipc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc.js'), 'utf8');
  assert.match(ipc, /fence:rename-item/, '메인이 바꾼 이름을 받지 않는다');
  assert.match(ipc, /host\.renameItem\(/, '받은 이름을 아무도 다루지 않는다');

  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /desk\.onRenameItem\(/, '창이 이름 바꾸기를 시작하지 않는다');
  assert.match(code, /desk\.renameItem\(/, '창이 바꾼 이름을 보내지 않는다');

  const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.css'), 'utf8');
  assert.match(css, /\.icon input\.edit/, '이름을 적을 자리의 모양이 없다');
});

// 다른 프로그램으로 끌어 내기는 창 → 메인으로 이어진다.
// 휴지통은 그 길에 올라타지 않는다.
test('다른 프로그램으로 끌어 내는 길이 창까지 이어진다', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  assert.match(preload, /overForeign:/, '창이 다른 프로그램 위인지 물을 길이 없다');
  assert.match(preload, /dragOut:/, '창이 끌어 내기를 보낼 길이 없다');

  const ipc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc.js'), 'utf8');
  assert.match(ipc, /fence:over-foreign/, '메인이 커서 아래를 받지 않는다');
  assert.match(ipc, /fence:drag-out/, '메인이 끌어 내기를 받지 않는다');
  assert.match(ipc, /host\.dragOut\(/, '받은 끌어 내기를 아무도 다루지 않는다');

  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /function canHandOff[\s\S]*?item\.recycle/, '휴지통을 가리지 않는다');
  assert.match(code, /addEventListener\('dragstart', onIconDragStart\)/, '끌어 내기 시작점이 없다');
  assert.match(code, /function onIconDragStart[\s\S]*?desk\.dragOut\(/, '시작점에서 다른 프로그램으로 넘기지 않는다');
  assert.match(code, /el\.draggable = canHandOff\(item\)/, '넘길 수 있는 항목만 끌 수 있어야 한다');
});

// 복사와 잘라 붙이기는 창의 글쇠에서 메인으로 이어진다.
test('복사와 잘라 붙이기 길이 창까지 이어진다', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  assert.match(preload, /copyItem:/, '창이 복사를 보낼 길이 없다');
  assert.match(preload, /cutItem:/, '창이 잘라내기를 보낼 길이 없다');
  assert.match(preload, /paste:/, '창이 붙여넣기를 보낼 길이 없다');

  const ipc = fs.readFileSync(path.join(ROOT, 'src', 'main', 'ipc.js'), 'utf8');
  assert.match(ipc, /fence:copy/, '메인이 복사를 받지 않는다');
  assert.match(ipc, /fence:cut/, '메인이 잘라내기를 받지 않는다');
  assert.match(ipc, /fence:paste/, '메인이 붙여넣기를 받지 않는다');

  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'fence.js'), 'utf8');
  assert.match(code, /desk\.copyItem\(/, '글쇠로 복사하지 않는다');
  assert.match(code, /desk\.cutItem\(/, '글쇠로 자르지 않는다');
  assert.match(code, /desk\.paste\(/, '글쇠로 붙이지 않는다');
});

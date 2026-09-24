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

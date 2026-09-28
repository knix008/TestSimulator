'use strict';

// 자동 분류 규칙.
//
// 바탕화면에 새로 생긴 항목을 규칙대로 박스에 담는다. **파일이 저절로 옮겨 가는 일**이므로
// 사람이 켜 주기 전에는 아무것도 하지 않아야 한다. 그것이 여기서 가장 중요하게 보는 것이다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState } = require('./helpers/fakes');
const rules = require('../src/shared/rules');

function deskDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-rules-'));
}

// 규칙이 보는 모습으로 항목 하나를 만든다.
function file(name, directory) {
  return { name, path: `C:/Desktop/${name}`, directory: !!directory };
}

// ── 짝 맞추기 (shared/rules.js) ──────────────────────────────────────────

test('확장자 규칙은 여러 개를 함께 적을 수 있다', () => {
  const rule = rules.normalizeRule({ kind: 'ext', value: 'pdf, .docx  xlsx', fence: 'a' });
  assert.deepEqual(rules.extList(rule.value), ['pdf', 'docx', 'xlsx']);
  assert.equal(rules.matches(rule, file('보고서.pdf')), true);
  assert.equal(rules.matches(rule, file('표.XLSX')), true, '대소문자를 가리지 말아야 한다');
  assert.equal(rules.matches(rule, file('메모.txt')), false);
  // 폴더에는 확장자가 없다. 'Work.old' 같은 폴더 이름에 걸리지 않아야 한다.
  assert.equal(rules.matches(rule, file('Work.pdf', true)), false);
  // 이름 앞의 점은 확장자가 아니다.
  assert.equal(rules.matches(rules.normalizeRule({ kind: 'ext', value: 'gitignore', fence: 'a' }), file('.gitignore')), false);
});

test('이름 규칙은 들어 있으면 맞고, 별표를 쓰면 그 모양대로 맞는다', () => {
  const has = rules.normalizeRule({ kind: 'name', value: '보고서', fence: 'a' });
  assert.equal(rules.matches(has, file('3분기 보고서.docx')), true);
  assert.equal(rules.matches(has, file('메모.txt')), false);

  const star = rules.normalizeRule({ kind: 'name', value: '보고서*', fence: 'a' });
  assert.equal(rules.matches(star, file('보고서 3분기.docx')), true);
  assert.equal(rules.matches(star, file('3분기 보고서.docx')), false, '별표는 그 자리만 아무것이다');

  // 정규식 글자를 적어도 글자 그대로 본다.
  const dots = rules.normalizeRule({ kind: 'name', value: 'a.b', fence: 'a' });
  assert.equal(rules.matches(dots, file('a.b')), true);
  assert.equal(rules.matches(dots, file('axb')), false);
});

test('종류 규칙은 첫 실행 분류와 같은 갈래를 쓴다', () => {
  const folder = rules.normalizeRule({ kind: 'type', value: 'folder', fence: 'a' });
  assert.equal(rules.matches(folder, file('일감', true)), true);
  assert.equal(rules.matches(folder, file('일감.txt')), false);

  const media = rules.normalizeRule({ kind: 'type', value: 'media', fence: 'a' });
  assert.equal(rules.matches(media, file('사진.png')), true);
  assert.equal(rules.matches(media, file('문서.pdf')), false);
  assert.ok(rules.TYPES().includes('shortcut'), '갈래 목록을 읽지 못한다');
});

test('값이 비었거나 꺼 둔 규칙은 아무것도 받지 않는다', () => {
  assert.equal(rules.matches(rules.normalizeRule({ kind: 'ext', value: '', fence: 'a' }), file('a.pdf')), false);
  const off = [rules.normalizeRule({ kind: 'ext', value: 'pdf', fence: 'a', on: false })];
  assert.equal(rules.pick(off, file('a.pdf')), '');
});

test('먼저 적은 규칙이 이긴다', () => {
  const list = rules.normalizeRules([
    { id: 'one', kind: 'ext', value: 'pdf', fence: 'a' },
    { id: 'two', kind: 'type', value: 'document', fence: 'b' },
  ]);
  assert.equal(rules.pick(list, file('보고서.pdf')), 'a');
  assert.equal(rules.pick(list, file('표.xlsx')), 'b');
  assert.equal(rules.pick(list, file('사진.png')), '');
});

test('이름이 겹치는 규칙은 하나만 남는다', () => {
  const list = rules.normalizeRules([
    { id: 'same', kind: 'ext', value: 'pdf', fence: 'a' },
    { id: 'same', kind: 'ext', value: 'txt', fence: 'b' },
    null,
    'not a rule',
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].value, 'pdf');
});

// ── 실제로 담기 (fences.js) ──────────────────────────────────────────────

test('규칙을 켜지 않았으면 새로 생긴 것을 건드리지 않는다', async () => {
  const desk = deskDir();
  const state = baseState({
    fences: [fence()],
    settings: { rules: [{ id: 'r1', kind: 'ext', value: 'pdf', fence: 'a' }], autoSort: false },
  });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();
  host.refreshIcons();

  const at = path.join(desk, '보고서.pdf');
  fs.writeFileSync(at, 'x');
  host.refreshIcons();
  await new Promise((done) => setTimeout(done, 20));

  assert.deepEqual(state.fences[0].items, [], '켜지도 않았는데 담았다');
  assert.equal(fs.existsSync(at), true, '켜지도 않았는데 파일을 옮겼다');
});

test('규칙을 켜 두면 새로 생긴 것이 그 박스로 들어간다', async () => {
  const desk = deskDir();
  const state = baseState({
    fences: [fence({ id: 'docs' }), fence({ id: 'pics' })],
    settings: {
      autoSort: true,
      rules: [
        { id: 'r1', kind: 'ext', value: 'pdf, docx', fence: 'docs' },
        { id: 'r2', kind: 'type', value: 'media', fence: 'pics' },
      ],
    },
  });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();
  // 켤 때 이미 있던 것은 '새로 생긴 것' 이 아니다.
  host.refreshIcons();

  fs.writeFileSync(path.join(desk, '계약서.pdf'), 'a');
  fs.writeFileSync(path.join(desk, '사진.png'), 'b');
  fs.writeFileSync(path.join(desk, '메모.txt'), 'c');
  host.refreshIcons();
  await new Promise((done) => setTimeout(done, 40));

  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['계약서.pdf'], '문서 박스가 비었다');
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['사진.png'], '사진 박스가 비었다');
  // 규칙에 맞지 않는 것은 바탕화면에 그대로 둔다.
  assert.equal(fs.existsSync(path.join(desk, '메모.txt')), true, '규칙에 없는 것을 담았다');
});

test('지금 규칙대로 담기는 이미 있던 것에도 걸린다', async () => {
  const desk = deskDir();
  fs.writeFileSync(path.join(desk, '오래된.pdf'), 'a');
  fs.writeFileSync(path.join(desk, '오래된.txt'), 'b');
  const state = baseState({
    fences: [fence()],
    settings: { rules: [{ id: 'r1', kind: 'ext', value: 'pdf', fence: 'a' }] },
  });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();

  assert.equal(await host.sortNow(), 1, '담은 개수를 잘못 셌다');
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['오래된.pdf']);
  assert.equal(fs.existsSync(path.join(desk, '오래된.txt')), true);
});

test('규칙을 켜는 순간 지금 바탕화면에도 걸린다', async () => {
  const desk = deskDir();
  fs.writeFileSync(path.join(desk, '지금.pdf'), 'a');
  const state = baseState({
    fences: [fence()],
    settings: { rules: [{ id: 'r1', kind: 'ext', value: 'pdf', fence: 'a' }] },
  });
  const { host, desktop } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();

  host.setAutoSort(true);
  await new Promise((done) => setTimeout(done, 40));

  assert.equal(state.settings.autoSort, true);
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['지금.pdf']);
});

test('규칙을 더하고 고치고 지운다', () => {
  const state = baseState({ fences: [fence({ id: 'box1' })] });
  const { host } = loadHost(state);
  host.openAll();

  // 보낼 박스를 고르지 않으면 첫 박스로 둔다.
  const id = host.addRule({ kind: 'ext', value: 'pdf' });
  assert.equal(state.settings.rules.length, 1);
  assert.equal(state.settings.rules[0].fence, 'box1');

  host.changeRule(id, { kind: 'name', value: '보고서*' });
  assert.deepEqual(
    [state.settings.rules[0].kind, state.settings.rules[0].value],
    ['name', '보고서*']
  );

  host.changeRule(id, { on: false });
  assert.equal(state.settings.rules[0].on, false);

  assert.equal(host.removeRule(id), true);
  assert.deepEqual(state.settings.rules, []);
  assert.equal(host.removeRule(id), false, '없는 규칙을 지웠다고 한다');
});

test('박스를 지우면 그 박스로 보내라는 규칙도 함께 치운다', async () => {
  const state = baseState({ fences: [fence({ id: 'a' }), fence({ id: 'b', x: 700 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.addRule({ kind: 'ext', value: 'pdf', fence: 'a' });
  host.addRule({ kind: 'ext', value: 'png', fence: 'b' });

  electron.setDialogAnswer(0); // 삭제
  await host.removeFence('a');

  assert.deepEqual(state.settings.rules.map((rule) => rule.fence), ['b']);
});

test('이름이 부딪히는 것은 규칙보다 물음이 앞선다', async () => {
  const desk = deskDir();
  const onDesk = path.join(desk, '메모.txt');
  fs.writeFileSync(onDesk, '묵은 것');
  const state = baseState({
    fences: [fence()],
    settings: { autoSort: true, rules: [{ id: 'r1', kind: 'ext', value: 'txt', fence: 'a' }] },
  });
  const { host, desktop, electron, asks } = loadHost(state);
  desktop.useDesktop(desk);
  host.openAll();
  host.refreshIcons();
  await host.dropFiles('a', [onDesk]);
  assert.equal(state.fences[0].items.length, 1, '담기지 않았다');

  // 같은 이름을 바탕화면에 새로 만든다. 규칙에도 맞지만 물음이 먼저다.
  fs.writeFileSync(onDesk, '새로 만든 것');
  electron.setDialogAnswer(1); // 그대로 두기
  host.refreshIcons();
  await new Promise((done) => setTimeout(done, 40));

  assert.equal(asks.calls.length, 1, '대체할지 묻지 않았다');
  assert.match(asks.calls[0].title, /새로 만들었습니다/);
  assert.equal(fs.existsSync(onDesk), true, '묻고 나서 그대로 두지 않았다');
});

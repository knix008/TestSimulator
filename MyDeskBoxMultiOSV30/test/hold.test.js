'use strict';

// 보관함 폴더. 담는다는 것은 파일을 이리로 옮긴다는 뜻이고,
// 꺼낸다는 것은 담기 전 폴더로 돌려보낸다는 뜻이다.
// 무엇을 어디서 가져왔는지는 보관함 안의 restore.json 에 남는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hold = require('../src/main/hold');

function room(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mydeskbox-${name}-`));
}

// 검사마다 빈 보관함과 빈 바탕화면을 새로 준다.
function fresh() {
  const root = room('hold');
  const desk = room('desk');
  const user = room('user');
  hold.configure({ root, desktopDir: desk, userDir: user });
  return { root, desk, user };
}

function fileIn(dir, name, body = '') {
  const at = path.join(dir, name);
  fs.writeFileSync(at, body);
  return { name, path: at };
}

function box(extra) {
  return { id: 'a', title: '일감', folder: '', items: [], ...extra };
}

// 보관함은 사람이 들여다볼 자리가 아니다. 바탕화면에 두면 '숨긴 항목 표시'를
// 켜 둔 사람에게 폴더가 하나 더 보이므로 사용자 전용 폴더에 둔다.
test('설정에 보관함이 없으면 사용자 데이터 폴더 아래 boxes 를 쓴다', () => {
  const user = room('user');
  const desk = room('desk');
  hold.configure({ root: '', desktopDir: desk, userDir: user });
  assert.equal(hold.rootDir(), path.join(user, 'boxes'));
  assert.equal(hold.rootDir().includes('.MyDeskBox'), false, '바탕화면 숨김 폴더를 그대로 쓴다');
  assert.equal(hold.rootDir().startsWith(desk), false, '바탕화면 아래에 두었다');
});

test('사용자 폴더의 보관함은 감추려 들지 않는다', () => {
  const user = room('user');
  const desk = room('desk');
  const asked = [];
  hold.configure({ root: '', desktopDir: desk, userDir: user, hide: (dir) => asked.push(dir) });
  hold.ensureRoot();
  assert.deepEqual(asked, [], '감출 까닭이 없는 폴더를 감추려 했다');
});

test('설정으로 바탕화면에 둔 보관함은 감춰 달라고 알린다', () => {
  const desk = room('desk');
  const asked = [];
  const onDesk = path.join(desk, 'boxes');
  hold.configure({ root: onDesk, desktopDir: desk, hide: (dir) => asked.push(dir) });
  assert.equal(hold.ensureRoot(), onDesk);
  assert.deepEqual(asked, [onDesk], '바탕화면에 둔 보관함을 감추지 않았다');
});

// 앞선 판은 바탕화면 아래 숨김 폴더를 썼다. 올라온 사람의 파일을 두고 갈 수 없다.
test('바탕화면에 남은 앞선 판의 보관함을 옮겨 온다', () => {
  const desk = room('desk');
  const user = room('user');
  const legacy = path.join(desk, '.MyDeskBox');
  fs.mkdirSync(path.join(legacy, '지난 박스'), { recursive: true });
  fs.writeFileSync(path.join(legacy, '지난 박스', '담긴.txt'), '내용');
  fs.writeFileSync(path.join(legacy, 'restore.json'), '{"version":1,"items":[]}');

  hold.configure({ root: '', desktopDir: desk, userDir: user });
  const root = hold.ensureRoot();

  assert.equal(fs.existsSync(path.join(root, '지난 박스', '담긴.txt')), true, '담긴 파일을 옮겨 오지 않았다');
  assert.equal(fs.readFileSync(path.join(root, '지난 박스', '담긴.txt'), 'utf8'), '내용');
  assert.equal(fs.existsSync(legacy), false, '바탕화면에 빈 폴더를 남겼다');
});

test('옮겨 올 것이 없으면 바탕화면을 건드리지 않는다', () => {
  const desk = room('desk');
  const user = room('user');
  hold.configure({ root: '', desktopDir: desk, userDir: user });
  hold.ensureRoot();
  assert.deepEqual(fs.readdirSync(desk), [], '바탕화면에 무언가를 만들었다');
});

test('둘 곳을 모르면 보관함도 없다', () => {
  hold.configure({ root: '', desktopDir: '', userDir: '' });
  assert.equal(hold.rootDir(), '');
  assert.equal(hold.ensureRoot(), '');
});

test('담으면 파일이 박스 폴더로 옮겨 간다', () => {
  const { root, desk } = fresh();
  const one = fileIn(desk, '보고서.txt', '내용');
  const fence = box();

  const moved = hold.take(fence, one);

  assert.equal(moved.path, path.join(root, '일감', '보고서.txt'));
  assert.equal(fs.existsSync(one.path), false, '있던 자리에 그대로 남았다');
  assert.equal(fs.readFileSync(moved.path, 'utf8'), '내용', '내용이 달라졌다');
  assert.equal(moved.home, desk, '어디서 왔는지 적어 두지 않았다');
});

test('꺼내면 담기 전 폴더로 돌아간다', () => {
  const { desk } = fresh();
  const one = fileIn(desk, '노트.txt', '글');
  const fence = box();
  const moved = hold.take(fence, one);

  const back = hold.give(moved);

  assert.equal(back, path.join(desk, '노트.txt'));
  assert.equal(fs.existsSync(moved.path), false, '보관함에 그대로 남았다');
  assert.equal(fs.readFileSync(back, 'utf8'), '글');
});

test('담기 전 폴더가 없어졌으면 바탕화면으로 간다', () => {
  const { desk } = fresh();
  const gone = room('gone');
  const one = fileIn(gone, '떠돌이.txt');
  const moved = hold.take(box(), one);
  fs.rmSync(gone, { recursive: true, force: true });

  const back = hold.give(moved);

  assert.equal(path.dirname(back), desk, '갈 곳을 잃은 파일을 바탕화면으로 들이지 않았다');
});

test('같은 이름이 있으면 덮어쓰지 않고 번호를 붙인다', () => {
  const { root, desk } = fresh();
  const fence = box();
  hold.take(fence, fileIn(desk, '같은이름.txt', '먼저'));
  const second = room('other');
  const moved = hold.take(fence, fileIn(second, '같은이름.txt', '나중'));

  assert.equal(moved.path, path.join(root, '일감', '같은이름 (2).txt'));
  assert.equal(fs.readFileSync(path.join(root, '일감', '같은이름.txt'), 'utf8'), '먼저', '먼저 것을 덮어썼다');
});

test('이미 박스 폴더에 있는 것은 그대로 둔다', () => {
  const { desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '한번.txt'));
  const again = hold.take(fence, moved);
  assert.equal(again.path, moved.path, '박스 안에서 또 옮겼다');
  assert.equal(again.home, moved.home, '어디서 왔는지 잊었다');
});

test('폴더 이름은 박스 이름에서 따되 쓸 수 없는 글자는 뺀다', () => {
  fresh();
  assert.equal(hold.safeName('보고서', 'id1'), '보고서');
  assert.equal(hold.safeName('a/b\\c:d*e?f"g<h>i|j', 'id1'), 'a b c d e f g h i j');
  assert.equal(hold.safeName('   ', 'abcdefghij'), 'box-abcdefgh', '이름이 다 지워지면 박스 번호를 쓴다');
  assert.equal(hold.safeName('끝에 점.', 'id1'), '끝에 점', '끝의 점은 Windows 가 받지 않는다');
});

test('이름이 같은 박스 둘은 폴더가 겹치지 않는다', () => {
  const { root } = fresh();
  const first = box({ id: 'a' });
  const second = box({ id: 'b' });
  hold.dirFor(first);
  hold.dirFor(second);
  assert.notEqual(first.folder, second.folder, '두 박스가 한 폴더를 함께 쓴다');
  assert.equal(fs.existsSync(path.join(root, second.folder)), true);
});

test('한 번 정한 폴더는 박스 이름을 바꿔도 그대로다', () => {
  fresh();
  const fence = box();
  hold.dirFor(fence);
  const folder = fence.folder;
  fence.title = '다른 이름';
  hold.dirFor(fence);
  assert.equal(fence.folder, folder);
});

test('박스 폴더의 내용을 이름으로 알려 준다', () => {
  const { desk } = fresh();
  const fence = box();
  hold.take(fence, fileIn(desk, 'a.txt'));
  hold.take(fence, fileIn(desk, 'b.txt'));
  assert.deepEqual(hold.names(fence).sort(), ['a.txt', 'b.txt']);
});

test('빈 박스 폴더만 치운다', () => {
  const { root, desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, 'c.txt'));
  assert.equal(hold.drop(fence), false, '안에 든 것이 있는데 폴더를 지웠다');
  hold.give(moved);
  assert.equal(hold.drop(fence), true);
  assert.equal(fs.existsSync(path.join(root, fence.folder)), false);
});

// 앱이 갑자기 끝나면 layout.json 을 못 쓸 수 있다. 보관함 안의 기록으로 되돌린다.
test('보관함에 적어 둔 기록으로 되돌릴 수 있다', () => {
  const { root, desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '남은.txt', '남은 것'));

  const noted = JSON.parse(fs.readFileSync(path.join(root, 'restore.json'), 'utf8'));
  assert.equal(noted.items.length, 1);
  assert.equal(noted.items[0].home, desk, '어디서 왔는지 적어 두지 않았다');

  // 다음에 켠 것처럼 기억을 비우고 파일에 적힌 것만 읽는다.
  hold.configure({ root, desktopDir: desk });
  const back = hold.recover([]);

  assert.deepEqual(back, [path.join(desk, '남은.txt')]);
  assert.equal(fs.existsSync(moved.path), false, '보관함에 그대로 남았다');
  assert.equal(fs.readFileSync(path.join(desk, '남은.txt'), 'utf8'), '남은 것');
});

test('아직 박스가 들고 있는 것은 되돌리지 않는다', () => {
  const { root, desk } = fresh();
  const fence = box();
  const kept = hold.take(fence, fileIn(desk, '담긴.txt'));
  const stray = hold.take(fence, fileIn(desk, '남은.txt'));

  hold.configure({ root, desktopDir: desk });
  const back = hold.recover([kept.path]);

  assert.deepEqual(back, [path.join(desk, '남은.txt')]);
  assert.equal(fs.existsSync(kept.path), true, '박스가 들고 있는 것을 돌려보냈다');
});

test('되돌린 것은 기록에서 지운다', () => {
  const { root, desk } = fresh();
  hold.take(box(), fileIn(desk, '한번만.txt'));
  hold.configure({ root, desktopDir: desk });
  hold.recover([]);
  const noted = JSON.parse(fs.readFileSync(path.join(root, 'restore.json'), 'utf8'));
  assert.deepEqual(noted.items, [], '되돌린 뒤에도 기록이 남았다');
});

test('보관함 안의 파일인지 가려낸다', () => {
  const { root, desk } = fresh();
  assert.equal(hold.inside(path.join(root, '일감', 'a.txt')), true);
  assert.equal(hold.inside(path.join(desk, 'a.txt')), false);
  assert.equal(hold.inside(''), false);
});

test('없는 파일을 꺼내라고 해도 넘어간다', () => {
  const { root } = fresh();
  assert.equal(hold.give({ path: path.join(root, '없는', 'x.txt'), home: '' }), '');
  assert.equal(hold.give(null), '');
  assert.equal(hold.take(box(), null), null);
});

// 박스에서 박스로 옮길 때. 온 자리는 앞 박스의 폴더이지만 집은 바탕화면이다.
test('박스 사이를 옮겨도 담기 전 폴더를 잊지 않는다', () => {
  const { desk } = fresh();
  const first = box({ id: 'a', title: '첫 박스' });
  const second = box({ id: 'b', title: '둘째 박스' });
  const moved = hold.take(first, fileIn(desk, '옮길.txt', '글'));
  // 박스 사이의 이동은 집을 들고 오지 않는다. 경로만 넘어온다.
  const again = hold.take(second, { name: moved.name, path: moved.path });

  assert.equal(path.dirname(again.path), path.join(hold.rootDir(), '둘째 박스'), '둘째 박스로 가지 않았다');
  assert.equal(again.home, desk, '집을 앞 박스 폴더로 적었다');
  assert.equal(hold.give(again), path.join(desk, '옮길.txt'), '꺼내니 앞 박스 폴더로 갔다');
});

test('박스 사이를 옮기면 앞 박스의 기록은 지운다', () => {
  const { root, desk } = fresh();
  const first = box({ id: 'a', title: '첫 박스' });
  const second = box({ id: 'b', title: '둘째 박스' });
  const moved = hold.take(first, fileIn(desk, '한번.txt'));
  const again = hold.take(second, { name: moved.name, path: moved.path });

  const noted = JSON.parse(fs.readFileSync(path.join(root, 'restore.json'), 'utf8'));
  assert.deepEqual(noted.items.map((row) => row.path), [again.path], '앞 박스의 기록이 남았다');
});

// 바탕화면과 박스에 이름이 같은 항목이 따로 있을 수 있다. 담기 전에 알아야 묻을 수 있다.
test('담으면 이름이 부딪히는 파일을 미리 알려 준다', () => {
  const { root, desk } = fresh();
  const fence = box();
  hold.take(fence, fileIn(desk, '겹치는이름.txt', '먼저'));
  const other = room('other');
  const coming = fileIn(other, '겹치는이름.txt', '나중');

  assert.equal(hold.clash(fence, coming.path), path.join(root, '일감', '겹치는이름.txt'));
  assert.equal(hold.clash(fence, fileIn(other, '딴이름.txt').path), '', '부딪히지 않는 이름을 부딪힌다고 한다');
  // 이미 박스 폴더에 있는 것은 자기 자신과 부딪히지 않는다.
  assert.equal(hold.clash(fence, path.join(root, '일감', '겹치는이름.txt')), '');
  assert.equal(hold.clash(box({ folder: '' }), coming.path), '', '폴더가 없는 박스에는 부딪힐 것이 없다');
});

test('박스 안의 파일 이름을 바꾸면 어디서 왔는지도 새 이름으로 따라간다', () => {
  const { root, desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '처음.txt', '글'));

  const next = hold.relabel(moved, '나중.txt');

  assert.equal(next.path, path.join(root, '일감', '나중.txt'));
  assert.equal(next.name, '나중.txt');
  assert.equal(next.home, desk, '어디서 왔는지 잊었다');
  assert.equal(fs.existsSync(moved.path), false, '예전 이름이 남아 있다');
  assert.equal(fs.readFileSync(next.path, 'utf8'), '글');
  assert.equal(hold.noted(next.path), desk, 'restore.json 이 새 이름을 모른다');
  assert.equal(hold.noted(moved.path), '', 'restore.json 에 예전 이름이 남아 있다');

  // 꺼내면 새 이름 그대로 담기 전 폴더로 간다.
  assert.equal(hold.give(next), path.join(desk, '나중.txt'));
});

test('바꿀 수 없는 이름이면 파일을 건드리지 않는다', () => {
  const { desk } = fresh();
  const fence = box();
  const moved = hold.take(fence, fileIn(desk, '그대로.txt', '글'));

  assert.equal(hold.relabel(moved, ''), null);
  assert.equal(hold.relabel(null, '뭐든.txt'), null);
  assert.equal(fs.existsSync(moved.path), true, '이름을 바꾸지도 못하고 파일을 잃었다');
});

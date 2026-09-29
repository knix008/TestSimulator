'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// 속성 창만 고른다. 박스 창과 섞이지 않게 한다.
function propsWindows(electron) {
  return electron.windows.filter((win) => win.loaded && /props\.html$/.test(win.loaded.file));
}

// 창에 넘긴 것. 창은 이것을 그대로 그리므로 여기까지 검사하면 화면까지 정해진다.
function shown(electron) {
  const win = propsWindows(electron).at(-1);
  assert.ok(win, '속성 창이 열리지 않았다');
  return { win, props: JSON.parse(win.loaded.opts.query.props) };
}

function valueOf(props, label) {
  const row = props.rows.find((one) => one.label === label);
  return row ? row.value : null;
}

// 바탕화면 흉내. 박스에 담기면 파일은 박스 폴더로 옮겨 가므로 여기 경로는 곧 헌 것이 된다.
function deskDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-props-'));
}

// 박스 하나를 열고 담긴 항목의 지금 경로를 찾아 준다.
// 크기와 날짜는 실제로 재는 값이라 진짜 파일이 있어야 한다.
async function openWith(items, extra) {
  const state = baseState({ ...extra, fences: [fence({ items })] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  await loaded.host.push('a');
  const sent = fenceWindows(loaded.electron)[0].messages('fence:state').at(-1).items;
  return {
    ...loaded,
    // 담긴 뒤의 경로. 박스는 제 폴더에서 돌아간다.
    pathOf(name) {
      const found = sent.find((one) => one.name === name);
      assert.ok(found, `'${name}' 이 박스에 담기지 않았다`);
      return found.path;
    },
  };
}

test('아이콘 메뉴에 속성이 그림과 함께 있다', async () => {
  const { host, electron } = await openWith([]);
  host.showMenu('a', 'C:/Desktop/노트.txt');
  const item = electron.menus.at(-1).find((one) => one.label === '속성');
  assert.ok(item, '메뉴에 속성이 없다');
  assert.ok(item.icon && fs.existsSync(item.icon.path), '속성에 그림이 없다');
});

test('빈 곳을 눌러 연 메뉴에는 속성이 없다', async () => {
  const { host, electron } = await openWith([]);
  host.showMenu('a', null);
  const labels = electron.menus.at(-1).map((one) => one.label);
  assert.equal(labels.includes('속성'), false, '고른 항목이 없는데 속성이 있다');
});

test('파일의 속성에 이름·위치·크기·날짜가 적힌다', async () => {
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
  // 1024 바이트가 넘으면 읽기 쉬운 값과 정확한 바이트 수를 함께 적는다.
  assert.equal(valueOf(props, '크기'), '2.0 KB (2,048 바이트)');
  assert.ok(valueOf(props, '수정한 날짜'), '수정한 날짜가 비었다');
  assert.equal(valueOf(props, '특성'), '없음');
});

test('1024 바이트가 안 되면 바이트 수만 적는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.alloc(300));
  const { host, electron, pathOf } = await openWith([{ name: 'a.bin', path: path.join(dir, 'a.bin') }]);

  await host.showProps('a', pathOf('a.bin'));
  assert.equal(valueOf(shown(electron).props, '크기'), '300 바이트');
});

test('폴더의 속성에는 안의 개수와 합친 크기가 적힌다', async () => {
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

test('바깥에서 지워진 항목도 속성 창은 뜨고 찾을 수 없다고 적는다', async () => {
  const gone = path.join(deskDir(), '없는것.txt');
  const { host, electron } = await openWith([{ name: '없는것.txt', path: gone }]);

  await host.showProps('a', gone);
  const { props } = shown(electron);
  assert.match(props.kind, /찾을 수 없습니다/);
  assert.equal(valueOf(props, '크기'), null, '잴 수 없는데 크기를 적었다');
  assert.equal(valueOf(props, '위치'), path.dirname(gone));
});

test('여럿을 고른 채 누르면 개수와 합계를 적는다', async () => {
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

test('고른 것이 하나뿐이면 묶음이 아니라 그 항목을 적는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const one = pathOf('a.txt');

  await host.showProps('a', one, [one]);
  assert.equal(shown(electron).props.title, 'a.txt');
});

test('같은 항목의 속성 창을 두 번 열지 않는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const one = pathOf('a.txt');

  await host.showProps('a', one);
  await host.showProps('a', one);
  assert.equal(propsWindows(electron).length, 1, '속성 창이 두 개 열렸다');
});

test('휴지통처럼 잴 파일이 없는 항목도 속성이 열린다', async () => {
  const { host, electron } = await openWith([{ name: '휴지통', path: 'shell:RecycleBinFolder' }]);

  await host.showProps('a', 'shell:RecycleBinFolder');
  const { props } = shown(electron);
  assert.equal(props.kind, '시스템 항목');
  assert.equal(valueOf(props, '위치'), 'shell:RecycleBinFolder');
  assert.equal(valueOf(props, '크기'), null, '셸 항목의 크기를 지어냈다');
});

test('창이 알려 준 높이로 줄이고 닫기로 닫는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  await host.showProps('a', pathOf('a.txt'));
  const { win, props } = shown(electron);
  electron.module.ipcMain.emit('props:size', { key: props.key, height: 220 });
  assert.equal(win.getBounds().height, 220 + 18 * 2, '알려 준 높이로 줄이지 않았다');
  assert.equal(win.isVisible(), true, '높이를 알려 준 뒤에도 창을 보여 주지 않았다');

  electron.module.ipcMain.emit('props:close', props.key);
  assert.equal(win.isDestroyed(), true, '닫기가 창을 닫지 않았다');
});

test('영어로 두면 속성의 말도 영어로 적힌다', async () => {
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

// ── 메뉴에서 실제로 열리는지 ───────────────────────────────
// 위의 검사는 showProps 를 바로 부른다. 메뉴에 매어 둔 길이 끊겨도 통과하므로
// 사람이 누르는 길을 따라가는 검사를 따로 둔다.

function propsItem(electron) {
  const item = electron.menus.at(-1).find((one) => one.label === '속성');
  assert.ok(item, '메뉴에 속성이 없다');
  return item;
}

test('메뉴의 속성을 눌러야 창이 열린다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, '노트.txt'), 'hello');
  const { host, electron, pathOf } = await openWith([{ name: '노트.txt', path: path.join(dir, '노트.txt') }]);
  const file = pathOf('노트.txt');

  host.showMenu('a', file, [file]);
  assert.equal(propsWindows(electron).length, 0, '메뉴를 열기만 했는데 창이 떴다');
  await propsItem(electron).click();
  assert.equal(shown(electron).props.title, '노트.txt');
});

test('메뉴에서 여럿을 고른 채 누르면 그 묶음의 속성이 열린다', async () => {
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

// ── 창 자체 ────────────────────────────────────────────────

test('속성 창은 늘 위에 있는 박스 뒤로 숨지 않는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  await host.showProps('a', pathOf('a.txt'));
  const { win } = shown(electron);
  assert.equal(win.options.alwaysOnTop, true, '박스 뒤로 숨는다');
  assert.equal(win.options.frame, false, '창틀이 붙어 있다');
  assert.equal(win.options.transparent, true, '그림자 자리가 투명하지 않다');
  assert.equal(win.options.skipTaskbar, true, '작업 표시줄에 남는다');
  assert.equal(win.options.resizable, false, '크기를 바꿀 수 있다');
});

test('높이를 알려 주지 못해도 창은 보여 준다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  await host.showProps('a', pathOf('a.txt'));
  const { win } = shown(electron);
  assert.equal(win.isVisible(), false, '그려지기 전에 창을 보여 줬다');
  win.ready();
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(win.isVisible(), true, '높이를 알려 주지 않으면 창이 영원히 숨는다');
});

test('창을 닫으면 같은 항목의 속성을 다시 열 수 있다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const file = pathOf('a.txt');

  await host.showProps('a', file);
  shown(electron).win.close();
  await host.showProps('a', file);
  assert.equal(propsWindows(electron).length, 2, '닫은 창을 붙잡고 있어 다시 열리지 않는다');
});

test('항목마다 저마다의 속성 창을 얻는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'b.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: 'b.txt', path: path.join(dir, 'b.txt') },
  ]);

  await host.showProps('a', pathOf('a.txt'));
  await host.showProps('a', pathOf('b.txt'));
  assert.equal(propsWindows(electron).length, 2, '다른 항목인데 한 창을 돌려 썼다');
});

// ── 적히는 값 ──────────────────────────────────────────────

test('읽기 전용 파일은 특성에 적는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);
  const file = pathOf('a.txt');
  fs.chmodSync(file, 0o444);

  await host.showProps('a', file);
  assert.equal(valueOf(shown(electron).props, '특성'), '읽기 전용');
  fs.chmodSync(file, 0o644);   // 검사 폴더를 걷을 수 있게 되돌린다
});

test('바로가기는 가리키는 곳을 적는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, '한글.lnk'), 'link');
  const { host, electron, pathOf } = await openWith([{ name: '한글.lnk', path: path.join(dir, '한글.lnk') }]);
  const link = pathOf('한글.lnk');
  electron.shell.links.set(link, { target: 'C:/Program Files/Hnc/Hwp.exe', icon: '' });

  await host.showProps('a', link);
  const { props } = shown(electron);
  assert.equal(props.kind, '바로가기');
  assert.equal(valueOf(props, '가리키는 곳'), 'C:/Program Files/Hnc/Hwp.exe');
  // 긴 경로는 어디서든 접어야 창을 넘지 않는다.
  assert.equal(props.rows.find((one) => one.label === '가리키는 곳').wide, true);
});

test('한도에 닿으면 잰 값에 이상을 붙인다', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '많은것');
  fs.mkdirSync(folder);
  for (let i = 0; i < 20; i += 1) fs.writeFileSync(path.join(folder, `${i}.txt`), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: '많은것', path: folder }]);

  // 스무 개 중 다섯 개만 세도록 한도를 좁힌다. 지어내지 말고 '이상'을 붙여야 한다.
  await host.showProps('a', pathOf('많은것'), null, { entries: 5 });
  assert.match(valueOf(shown(electron).props, '크기'), /이상$/);
});

test('한도 안에서 다 세면 이상을 붙이지 않는다', async () => {
  const dir = deskDir();
  const folder = path.join(dir, '조금');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: '조금', path: folder }]);

  await host.showProps('a', pathOf('조금'));
  assert.equal(valueOf(shown(electron).props, '크기'), '10 바이트');
});

test('창에 넘기는 줄에 빈 값이나 옮기지 못한 말이 없다', async () => {
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
    assert.ok(props.title, `${name} 의 이름이 비었다`);
    assert.ok(props.kind, `${name} 의 종류가 비었다`);
    assert.ok(props.close, `${name} 의 닫기 단추가 비었다`);
    assert.ok(props.rows.length >= 4, `${name} 의 줄이 너무 적다`);
    for (const row of props.rows) {
      assert.ok(row.label.trim(), `${name} 에 이름표 없는 줄이 있다`);
      assert.ok(row.value.trim(), `${name} 의 '${row.label}' 값이 비었다`);
      // i18n.t 는 없는 이름표를 그대로 돌려준다. 오타가 화면에 그대로 나온다.
      for (const text of [row.label, row.value, props.kind, props.close]) {
        assert.doesNotMatch(text, /^(props|menu|box)\./, `옮기지 못한 말이 있다: ${text}`);
      }
    }
  }
});

// ── 창과 메인을 잇는 길 ────────────────────────────────────

const ROOT = path.join(__dirname, '..');

test('속성 창 파일이 모두 있고 서로를 가리킨다', () => {
  const dir = path.join(ROOT, 'src', 'renderer');
  for (const name of ['props.html', 'props.css', 'props.js']) {
    assert.ok(fs.existsSync(path.join(dir, name)), `src/renderer/${name} 가 없다`);
  }
  const html = fs.readFileSync(path.join(dir, 'props.html'), 'utf8');
  assert.match(html, /href="props\.css"/, '속성 창이 제 모양새를 읽지 않는다');
  assert.match(html, /src="props\.js"/, '속성 창이 제 길을 읽지 않는다');
  // 메인이 주는 줄이 들어갈 자리
  for (const id of ['mark', 'title', 'kind', 'rows', 'close']) {
    assert.match(html, new RegExp(`id="${id}"`), `속성 창에 ${id} 자리가 없다`);
  }
});

test('속성 창이 쓰는 길은 preload 에 모두 열려 있다', () => {
  const code = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'props.js'), 'utf8');
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'preload.js'), 'utf8');
  const used = [...code.matchAll(/desk\.(\w+)\(/g)].map((hit) => hit[1]);
  assert.ok(used.length >= 2, '속성 창이 메인에게 말을 걸지 않는다');
  for (const name of new Set(used)) {
    assert.match(preload, new RegExp(`\\b${name}:`), `preload 에 ${name} 이 없다`);
  }
});

test('속성 창은 값을 골라 복사할 수 있다', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'props.css'), 'utf8');
  // 판 전체는 글을 고르지 못하게 해 두었다. 경로와 날짜만 풀어 준다.
  assert.match(css, /#rows dd \{[^}]*user-select: text/s, '경로를 복사할 수 없다');
  assert.match(css, /#rows dd\.wide \{[^}]*word-break: break-all/s, '긴 경로가 창을 넘는다');
});

// ── 묶음을 재는 길 ─────────────────────────────────────────

test('묶음에 폴더가 섞여 있으면 폴더도 세고 안까지 더한다', async () => {
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
  // 고른 폴더 하나 + 그 안의 폴더 하나, 파일은 폴더 안의 둘 + 고른 노트 하나
  assert.equal(valueOf(props, '안의 항목'), '파일 3개 · 폴더 2개');
  assert.equal(props.kind, '여러 종류');
});

test('묶음의 종류가 같으면 그 종류를 적는다', async () => {
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

test('묶음에 섞인 셸 항목은 크기에 넣지 않는다', async () => {
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
  // 셸 항목에는 잴 파일이 없다. 0 으로도, 지어낸 값으로도 세지 않는다.
  assert.equal(valueOf(props, '크기'), '120 바이트');
  assert.equal(valueOf(props, '안의 항목'), '파일 1개 · 폴더 0개');
});

test('누른 항목이 고른 묶음에 없으면 그 항목만 본다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'b.txt'), Buffer.alloc(10));
  fs.writeFileSync(path.join(dir, 'c.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([
    { name: 'a.txt', path: path.join(dir, 'a.txt') },
    { name: 'b.txt', path: path.join(dir, 'b.txt') },
    { name: 'c.txt', path: path.join(dir, 'c.txt') },
  ]);

  // 골라 둔 것 밖의 아이콘을 눌렀다. 고른 묶음이 아니라 누른 것의 속성이다.
  await host.showProps('a', pathOf('c.txt'), [pathOf('a.txt'), pathOf('b.txt')]);
  assert.equal(shown(electron).props.title, 'c.txt');
});

test('묶음도 한도를 지킨다', async () => {
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

// ── 열지 않아야 할 때 ──────────────────────────────────────

test('없는 박스나 빈 항목으로는 창을 열지 않는다', async () => {
  const dir = deskDir();
  fs.writeFileSync(path.join(dir, 'a.txt'), Buffer.alloc(10));
  const { host, electron, pathOf } = await openWith([{ name: 'a.txt', path: path.join(dir, 'a.txt') }]);

  assert.equal(await host.showProps('없는박스', pathOf('a.txt')), null);
  assert.equal(await host.showProps('a', null), null);
  assert.equal(await host.showProps('a', ''), null);
  assert.equal(propsWindows(electron).length, 0, '열 것이 없는데 창이 떴다');
});

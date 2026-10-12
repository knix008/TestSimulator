// Web build end-to-end cases (headless Edge/Chrome). Popups are frames here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { root } from './harness.mjs';

const kb = (app, expression) => app.main.eval(`(() => { const k = window.__mykanban; return ${expression}; })()`);
const iconB64 = fs.readFileSync(path.join(root, 'assets', 'icon-256.png')).toString('base64');

/** Drops files (name, text|base64, type) at a point, like a drag from the desktop. */
function drop(app, files, point, text = '') {
  return app.main.eval(`(async () => {
    const dt = new DataTransfer();
    for (const f of ${JSON.stringify(files)}) {
      const bytes = f.base64 ? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)) : new TextEncoder().encode(f.text);
      dt.items.add(new File([bytes], f.name, { type: f.type ?? '' }));
    }
    if (${JSON.stringify(text)}) dt.setData('text/plain', ${JSON.stringify(text)});
    const p = ${JSON.stringify(point ?? { x: 700, y: 600 })};
    const target = document.elementFromPoint(p.x, p.y) ?? document.body;
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: p.x, clientY: p.y }));
    await new Promise((r) => setTimeout(r, 600));
    return 1;
  })()`);
}

const sample = (title, cards) => JSON.stringify({ format: 'mykanbanboard', version: 1, board: { title, columns: [{ id: 'c1', title: 'A', cards: cards.map((t, i) => ({ id: `w${i}`, title: t })) }, { id: 'c2', title: 'B', cards: [] }] } });

export const cases = [
  { group: '페이지', name: '제목에 프로그램 이름과 버전', async run(app) {
    assert.match(await app.main.eval('document.title'), /^MyKanbanBoard v1\.0\.0/);
    assert.equal(await app.main.eval(`document.querySelector('link[rel="icon"]').getAttribute('href')`), './icon.png');
  } },
  { group: '툴바', name: '모든 버튼에 툴팁, 설정·정보는 오른쪽', async run(app) {
    const missing = await app.main.eval(`[...document.querySelectorAll('button')].filter((b) => !(b.title || '').trim()).length`);
    assert.equal(missing, 0);
    const gap = await app.main.eval(`document.querySelector('#toolbar').getBoundingClientRect().right - document.querySelector('[data-command="about"]').getBoundingClientRect().right`);
    assert.ok(gap < 20, `${gap}`);
  } },
  { group: '메뉴', name: '메뉴: 한 줄, 아이콘+이름, 머리글', async run(app) {
    await app.main.click('[data-menu="edit"]');
    await app.waitFrame('menu', `document.querySelectorAll('.menu-item').length > 5`);
    const info = await app.frame('menu', `({ lefts: new Set([...document.querySelectorAll('.menu-item')].map((i) => Math.round(i.getBoundingClientRect().left))).size, icons: [...document.querySelectorAll('.menu-item')].every((i) => i.querySelector('.menu-icon svg')), head: document.querySelector('.menu-head').textContent.trim() })`);
    assert.equal(info.lefts, 1);
    assert.ok(info.icons);
    assert.equal(info.head, '편집');
    await app.main.eval(`document.querySelector('.web-popup-shield').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1`);
    await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
  } },
  { group: '메뉴', name: '컨텍스트 메뉴: 카드와 열이 다름', async run(app) {
    const open = async (selector) => {
      const p = await app.main.center(selector);
      await app.main.realClick(p.x, p.y, { button: 'right' });
      await app.waitFrame('menu', `document.querySelector('.menu-item')`);
      const ids = await app.frame('menu', `[...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id)`);
      await app.frame('menu', `(document.querySelector('.menu-item:not([disabled])'), window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 1)`);
      await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
      return ids;
    };
    const card = await open('.card');
    const column = await open('.column-title');
    assert.ok(card.includes('editCard'));
    assert.ok(column.includes('custom:addRight'));
  } },
  { group: '편집', name: '카드 추가 · Ctrl+Z · Ctrl+Y', async run(app) {
    const count = () => kb(app, 'k.board.allCards(k.actions.activeBoard()).length');
    const before = await count();
    await app.main.click('[data-column-add]');
    assert.equal(await count(), before + 1);
    await app.main.eval('document.activeElement.blur(); 1');
    await app.main.key('z', 2);
    assert.equal(await count(), before);
    await app.main.key('y', 2);
    assert.equal(await count(), before + 1);
  } },
  { group: '편집', name: '카드 끌어 옮기기 (마우스)', async run(app) {
    const id = await kb(app, `k.actions.activeBoard().columns[0].cards[0].id`);
    const target = await kb(app, `k.actions.activeBoard().columns[1].id`);
    await app.main.drag(await app.main.center(`.card[data-card-id="${id}"]`), await app.main.center(`.column[data-column-id="${target}"] .cards`));
    await app.main.waitFor(`window.__mykanban.board.findCard(window.__mykanban.actions.activeBoard(), '${id}').column.id === '${target}'`);
  } },
  { group: '편집', name: 'Ctrl+C / Ctrl+V (브라우저 클립보드)', async run(app) {
    await kb(app, `(() => { const c = k.board.allCards(k.actions.activeBoard())[0]; k.actions.select('card', [c.id]); return 1; })()`);
    const before = await kb(app, 'k.board.allCards(k.actions.activeBoard()).length');
    await app.main.key('c', 2);
    await sleep(300);
    await app.main.key('v', 2);
    await app.main.waitFor(`window.__mykanban.board.allCards(window.__mykanban.actions.activeBoard()).length === ${before + 1}`);
  } },
  { group: '편집', name: 'Ctrl+마우스 휠 확대', async run(app) {
    const p = await app.main.center('#board-area');
    await app.main.wheel(p.x, p.y, -120, 2);
    await app.main.waitFor(`window.__mykanban.state.settings.zoom === 110`);
    await kb(app, 'k.actions.setZoom(100) || 1');
  } },
  { group: '끌어다 놓기', name: '보드 파일·텍스트·이미지(카드 첨부, 배경)', async run(app) {
    await drop(app, [{ name: 'web.mkanban', text: sample('웹 보드', ['x', 'y']), type: 'application/json' }]);
    await app.main.waitFor(`window.__mykanban.actions.activeBoard().title === '웹 보드'`);
    const column = await app.main.center('.column[data-column-id="c2"] .cards');
    await drop(app, [{ name: 'list.txt', text: '하나\n둘', type: 'text/plain' }], column);
    assert.equal(await kb(app, `k.actions.activeBoard().columns[1].cards.length`), 2);
    const card = await app.main.center('.card[data-card-id="w0"] .card-title');
    await drop(app, [{ name: 'pic.png', base64: iconB64, type: 'image/png' }], card);
    await app.main.waitFor(`document.querySelector('.card[data-card-id="w0"] .card-thumb')`);
    await drop(app, [{ name: 'bg.png', base64: iconB64, type: 'image/png' }], { x: 1300, y: 700 });
    await app.main.waitFor(`document.querySelector('.board-bg').classList.contains('has-image')`);
  } },
  { group: '끌어다 놓기', name: '이미지 보기 팝업', async run(app) {
    await app.main.click('.card[data-card-id="w0"] .card-thumb');
    await app.waitFrame('image', `document.querySelector('#image-view')?.classList.contains('full')`);
    assert.equal(await app.frame('image', `document.querySelector('#image-view').naturalWidth`), 256);
    await app.frame('image', `(document.querySelector('[data-action="close"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-image')`);
  } },
  { group: '팝업', name: '오류 팝업: 깨진 파일', async run(app) {
    await drop(app, [{ name: 'bad.mkanban', text: '{oops', type: 'application/json' }]);
    await app.waitFrame('error', `document.querySelector('#error-message')`);
    assert.match(await app.frame('error', `document.querySelector('#error-message').textContent`), /JSON/);
    await app.frame('error', `(document.querySelector('[data-action="close"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-error')`);
  } },
  { group: '팝업', name: '설정: 탭마다 스크롤 없음, 테마 적용', async run(app) {
    await app.main.click('[data-command="settings"]');
    await app.waitFrame('settings');
    for (const tab of ['general', 'appearance', 'font', 'background', 'board', 'recent', 'shortcuts']) {
      await app.frame('settings', `(document.querySelector('[data-action="tab"][data-value="${tab}"]').click(), 1)`);
      await sleep(150);
      assert.equal(await app.frame('settings', `(() => { const b = document.querySelector('.popup-body'); return b.scrollHeight > b.clientHeight + 1; })()`), false, tab);
    }
    await app.frame('settings', `(document.querySelector('[data-action="tab"][data-value="appearance"]').click(), 1)`);
    await app.frame('settings', `(document.querySelector('[data-theme-group="dark"]').click(), 1)`);
    await app.frame('settings', `(document.querySelector('[data-setting="theme"][data-value="dracula"]').click(), 1)`);
    await app.main.waitFor(`document.documentElement.dataset.theme === 'dracula'`);
    await app.frame('settings', `(document.querySelector('[data-action="close"]').click(), 1)`);
  } },
  { group: '테마', name: '테마 버튼(다음 테마)과 드롭다운(다크|라이트 두 줄)', async run(app) {
    const before = await app.main.eval('document.documentElement.dataset.theme');
    await app.main.click('[data-command="theme"]');
    assert.notEqual(await app.main.eval('document.documentElement.dataset.theme'), before);
    await app.main.click('[data-command="themeMenu"]');
    await app.waitFrame('theme', `document.querySelectorAll('.picker-column').length === 2`);
    assert.deepEqual(await app.frame('theme', `[...document.querySelectorAll('.picker-column')].map((c) => c.querySelectorAll('[data-pick-theme]').length)`), [20, 20]);
    await app.frame('theme', `(document.querySelector('[data-pick-theme="nord"]').click(), 1)`);
    await app.main.waitFor(`document.documentElement.dataset.theme === 'nord'`);
    await app.main.waitFor(`!document.querySelector('.web-popup-theme')`);
    await kb(app, `k.actions.updateSettings({ theme: 'light' }) || 1`);
  } },
  { group: '카드', name: '카드 설정 창으로 이미지 끌어다 놓기 → 첨부', async run(app) {
    const cardId = await kb(app, `(() => { const b = k.actions.activeBoard(); return k.actions.addCard(b.columns[0].id, { title: 'web editor' }).id; })()`);
    kb(app, `k.actions.openCardEditor('${cardId}').then(() => 1)`).catch(() => {});
    await app.waitFrame('card', `document.querySelector('#card-title')`);
    await app.frame('card', `(() => {
      const dt = new DataTransfer();
      const bytes = Uint8Array.from(atob('${iconB64}'), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
      for (const type of ['dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      return 1;
    })()`);
    await app.waitFrame('card', `document.querySelectorAll('.attach-tile img').length === 1`);
    await app.frame('card', `(document.querySelector('[data-action="editor-apply"]').click(), 1)`);
    await app.main.waitFor(`window.__mykanban.board.findCard(window.__mykanban.actions.activeBoard(), '${cardId}').card.attachments.length === 1`);
  } },
  { group: '팝업', name: '프로그램 정보 (웹 빌드, 제작자)', async run(app) {
    await app.main.click('[data-command="about"]');
    await app.waitFrame('about', `document.querySelector('#about-rows')`);
    const text = await app.frame('about', 'document.body.innerText');
    assert.ok(text.includes('SHKWON(knix008@naver.com)'));
    assert.ok(/웹 빌드|Web build/.test(text));
    await app.frame('about', `(document.querySelector('[data-action="close"]').click(), 1)`);
  } },
  { group: '팝업', name: '인쇄 미리보기', async run(app) {
    await app.main.click('[data-command="print"]');
    await app.waitFrame('print', `document.querySelector('.preview-stage .print-page')`);
    assert.ok(await app.frame('print', `window.__mykanbanPopup.printLayout().pages.length`) >= 1);
    await app.frame('print', `(document.querySelector('[data-action="close"]').click(), 1)`);
  } },
  { group: '팝업', name: '프로젝트: 웹에서는 로컬 저장소만', async run(app) {
    kb(app, `k.actions.newProject().then(() => 1)`).catch(() => {});
    await app.waitFrame('project');
    await app.frame('project', `(document.querySelector('[data-action="tab"][data-value="storage"]').click(), 1)`);
    const disabled = await app.frame('project', `[...document.querySelectorAll('[data-storage-kind]')].filter((b) => b.disabled).map((b) => b.dataset.storageKind)`);
    assert.deepEqual(disabled, ['sqlite', 'mariadb', 'mysql', 'postgres']);
    await app.frame('project', `(document.querySelector('[data-action="project-apply"]').click(), 1)`);
    await app.main.waitFor(`window.__mykanban.state.project?.project.storage.kind === 'local'`);
    await kb(app, `k.actions.closeProject({ force: true }).then(() => 1)`);
  } },
  { group: '설정', name: '언어 전환과 다시 불러온 뒤 설정 유지', async run(app) {
    await kb(app, `k.actions.updateSettings({ theme: 'dracula' }) || 1`);
    await app.main.click('[data-command="language"]');
    await app.main.waitFor(`document.querySelector('[data-menu="file"]').textContent.includes('File')`);
    await app.reload();
    assert.ok(app.dialogs.includes('beforeunload'), 'unsaved boards: the browser asks before leaving');
    assert.ok(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent.includes('File')`));
    assert.equal(await app.main.eval('document.documentElement.dataset.theme'), 'dracula');
    await kb(app, `k.actions.updateSettings({ language: 'ko', theme: 'light' }) || 1`);
  } },
  { group: '화면', name: '패널 접기와 탭 넘침 버튼', async run(app) {
    await app.main.click('[data-panel-toggle="left"]');
    assert.ok(await app.main.eval(`document.querySelectorAll('#left-panel .rail-button').length >= 8`));
    await app.main.click('[data-panel-toggle="left"]');
    await kb(app, `(() => { for (let i = 0; i < 16; i++) k.actions.newBoard(); return 1; })()`);
    assert.ok(await app.main.eval(`document.querySelector('#tabs').classList.contains('overflow')`));
  } },
];

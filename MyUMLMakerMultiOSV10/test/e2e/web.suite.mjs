// Web build end-to-end cases (headless Edge/Chrome). Popups are frames here.
// Mouse cases use real pointer events (CDP Input) and check that no error
// popup appeared and that one drag is one undo step.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { listTargets, Page, sleep, waitTarget } from './cdp.mjs';
import { root } from './harness.mjs';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const W = (app, expression) => app.main.eval(`(() => { const w = window.__myumlmaker; const a = w.actions; const api = w.api; const M = w.domain.M; return ${expression}; })()`);
const FRAME_SCROLL_CHECK = `[...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return ['auto', 'scroll'].includes(s.overflowY) && e.scrollHeight > e.clientHeight + 1 && !['SELECT', 'TEXTAREA', 'PRE'].includes(e.tagName) && !e.classList.contains('result-list') && !e.classList.contains('codegen-options'); }).map((e) => e.className || e.tagName)`;

async function closeFrames(app) {
  await app.main.eval(`window.__myumlmaker.popups.closeAll().then(() => 1)`).catch(() => {});
  await sleep(150);
}

const noError = async (app, where) => assert.equal(await app.main.eval(`Boolean(document.querySelector('.web-popup-error'))`), false, `${where}: no error popup`);

/** The start page with nothing open and the default arrangement. */
let welcomeWaited = false;
async function startFresh(app) {
  // The welcome popup comes a moment after the page loads: wait for it once, when a run starts here.
  if (!welcomeWaited) { welcomeWaited = true; await sleep(800); }
  await closeFrames(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); w.state.settings.startLayout = null; a.showStartPage(true); document.querySelector('.start-scroll').scrollTop = 0; return 1; })()`);
  await sleep(300);
}

/** The sample project, class diagram open, at 100 %. */
async function freshSample(app) {
  await closeFrames(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSampleBuiltin(); a.setCanvasZoom(100); return 1; })()`);
  await sleep(500);
}

/** A new project from a start page template tile (a real click on the tile); open projects are closed first (no save question). */
async function fromTemplateTile(app, id) {
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.showStartPage(true); return 1; })()`);
  await sleep(300);
  await app.main.click(`[data-start="template"][data-value="${id}"]`);
}

/** A new project (empty class diagram) at 100 %. */
async function freshProject(app, template = 'blank') {
  await closeFrames(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.newProject(${JSON.stringify(template)}); a.setCanvasZoom(100); return 1; })()`);
  await sleep(400);
}

/** The view of the element named `name` on the current diagram: { id, x, y } (client point near the top of its box). */
const viewAt = (app, name, fx = 0.5, dy = 12) => W(app, `(() => {
  const tab = a.activeDoc(); const v = api.view;
  const el = [...tab.index.byId.values()].find((e) => e.name === ${JSON.stringify(name)} && !/View$/.test(e._type));
  const view = api.diagram().ownedViews.find((x) => x.model?.$ref === el?._id);
  if (!view) return null;
  v.reveal(view._id);
  const b = v.boxOf(view._id); const r = v.stage.getBoundingClientRect(); const p = v.toStage({ x: b.x + b.w * ${fx}, y: b.y + ${dy} });
  return { id: view._id, model: el._id, x: r.left + p.x, y: r.top + p.y, box: b };
})()`);
/** A client point inside the visible canvas (fractions of the scroll area). */
const canvasPoint = (app, fx, fy) => app.main.eval(`(() => { const r = window.__myumlmaker.api.view.scroll.getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height * ${fy} }; })()`);
const elementNamed = (app, name) => W(app, `(() => { const e = [...a.activeDoc().index.byId.values()].find((x) => x.name === ${JSON.stringify(name)} && !/View$/.test(x._type)); return e ? JSON.parse(JSON.stringify(e)) : null; })()`);

export const cases = [
  { group: '페이지', name: '제목에 프로그램 이름과 버전, 아이콘', async run(app) {
    assert.equal(await app.main.eval('document.title'), `MyUMLMaker v${VERSION}`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('link[rel="icon"]'))`));
  } },
  { group: '페이지', name: '처음 열면 튜토리얼 안내 (프레임 팝업): 시작할 때 보이기 끄고 → 나중에', async run(app) {
    await app.waitFrame('welcome', `document.querySelector('.popup-head h2 svg')`);
    assert.match(await app.frame('welcome', `document.querySelector('.popup').innerText`), /튜토리얼/);
    await app.frame('welcome', `(document.querySelector('[data-toggle="showWelcome"]').click(), 1)`);
    await app.main.waitFor(`window.__myumlmaker.state.settings.showWelcome === false`, { timeout: 3000, message: 'the box turns the welcome at start off' });
    await app.frame('welcome', `(document.querySelector('[data-value="later"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-welcome')`);
  } },
  { group: '시작 페이지', name: '템플릿 전부·예제·튜토리얼, 템플릿을 누르면 새 프로젝트', async run(app) {
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const info = await app.main.eval(`({ templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('[data-start="tutorial"]')), sample: document.querySelectorAll('[data-start="sample"]').length === 40, panelsHidden: getComputedStyle(document.querySelector('#left-panel')).display === 'none' })`);
    assert.equal(info.templates, await W(app, 'w.domain.TEMPLATES.length'));
    assert.ok(info.tutorial && info.sample && info.panelsHidden, JSON.stringify(info));
    await app.main.click('[data-start="template"][data-value="sequence"]');
    await sleep(500);
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLSequenceDiagram');
    assert.ok(await W(app, 'api.diagram().ownedViews.length >= 4'));
    await noError(app, 'template');
  } },
  { group: '시작 페이지', name: '카드 보드: MyMind 와 같은 카드 7장, 겹치지 않고 가로로 넘치지 않는다', async run(app) {
    await startFresh(app);
    const info = await app.main.eval(`(() => {
      const cards = [...document.querySelectorAll('.start-board > .start-card')];
      const rects = cards.map((c) => c.getBoundingClientRect());
      let overlaps = 0;
      rects.forEach((a, i) => rects.forEach((b, j) => { if (j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps += 1; }));
      const scroll = document.querySelector('.start-scroll');
      return { ids: cards.map((c) => c.dataset.card), overlaps, overflow: scroll.scrollWidth - scroll.clientWidth,
        handles: document.querySelectorAll('.start-board [data-card-handle]').length, corners: document.querySelectorAll('.start-board [data-card-resize]').length,
        translucent: getComputedStyle(cards[1]).backgroundColor, hero: rects[0].height, width: rects[0].width };
    })()`);
    assert.deepEqual(info.ids, ['hero', 'actions', 'recent', 'templates', 'samples', 'theme', 'background']);
    assert.equal(info.overlaps, 0, 'no card covers another');
    assert.ok(info.overflow <= 0, `no sideways scrolling (${info.overflow})`);
    assert.equal(info.handles, 7);
    assert.equal(info.corners, 7);
    assert.match(info.translucent, /color\(srgb .* \/ 0.8\)|rgba\(.*0.8\)/, `cards are translucent: ${info.translucent}`);
    assert.ok(info.hero < 180, `the title card is not taller than its content (${info.hero})`);
  } },
  { group: '시작 페이지', name: '카드 안의 글과 타일이 잘리거나 카드 밖으로 나가지 않는다 (작은 창에서도)', async run(app) {
    await startFresh(app);
    for (const [width, height] of [[1600, 1000], [1000, 700]]) {
      await app.main.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await sleep(500);
      const bad = await app.main.eval(`(() => {
        const out = [];
        for (const card of document.querySelectorAll('.start-board > .start-card')) {
          const box = card.getBoundingClientRect();
          if (card.scrollWidth > card.clientWidth + 1) out.push(card.dataset.card + ': wider than the card');
          if (card.classList.contains('fit') && card.scrollHeight > card.clientHeight + 1) out.push(card.dataset.card + ': taller than the card');
          for (const item of card.querySelectorAll('button, label, select')) {
            const r = item.getBoundingClientRect();
            if (r.width && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)) out.push(card.dataset.card + ': ' + (item.dataset.start ?? item.textContent.trim()).slice(0, 30));
          }
        }
        const scroll = document.querySelector('.start-scroll');
        if (scroll.scrollWidth > scroll.clientWidth) out.push('page wider than the window');
        return out;
      })()`);
      assert.deepEqual(bad, [], `at ${width}×${height}`);
    }
    await app.main.send('Emulation.clearDeviceMetricsOverride');
    await sleep(300);
  } },
  { group: '시작 페이지', name: '최근 항목 카드에는 최근 파일·폴더만 있고, 도움말은 위쪽 단추와 메뉴에 있다', async run(app) {
    await startFresh(app);
    const info = await app.main.eval(`({ title: document.querySelector('.start-card.recent .start-card-title').textContent, subs: document.querySelectorAll('.start-card.recent .start-sub').length, help: document.querySelectorAll('.start-card.recent [data-start="guide"], .start-card.recent [data-start="tutorial-doc"], .start-card.recent [data-start="tutorial-video"], .start-card.recent [data-start="shortcuts"]').length, hero: ['guide', 'tutorial-doc', 'tutorial-video', 'help-menu'].every((x) => document.querySelector('.start-hero [data-start="' + x + '"]')) })`);
    assert.deepEqual(info, { title: '최근 항목', subs: 2, help: 0, hero: true });
    await W(app, '(w.state.settings.startShowRecent = false, w.state.settings.startShowFolders = false, a.showStartPage(true), 1)');
    await sleep(300);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.start-card.recent'))`), false, 'with both off the card is gone');
    await W(app, '(w.state.settings.startShowRecent = true, w.state.settings.startShowFolders = true, a.showStartPage(true), 1)');
    await sleep(300);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.start-card.recent'))`), true);
  } },
  { group: '시작 페이지', name: '예제 40개: 8묶음·5개씩, 제목과 설명이 언어를 따른다', async run(app) {
    await startFresh(app);
    const read = () => app.main.eval(`({ groups: [...document.querySelectorAll('[data-sample-group]')].map((g) => [g.dataset.sampleGroup, g.querySelectorAll('[data-start="sample"]').length, g.querySelector('.sample-count').textContent]), first: document.querySelector('[data-start="sample"] b').textContent, desc: document.querySelector('[data-start="sample"] small').textContent, icons: [...document.querySelectorAll('[data-start="sample"] svg')].length })`);
    const ko = await read();
    assert.deepEqual(ko.groups.map((g) => g[1]), [5, 5, 5, 5, 5, 5, 5, 5]);
    assert.ok(ko.groups.every((g) => g[2] === '5'), 'each group shows its count');
    assert.equal(ko.icons, 40, 'every tile has an icon');
    assert.equal(ko.first, '온라인 쇼핑몰');
    await app.main.click('[data-start="language"]');
    await sleep(400);
    const en = await read();
    assert.equal(en.first, 'Online Shop');
    assert.notEqual(en.desc, ko.desc);
    await app.main.click('[data-start="language"]');
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.language'), 'ko');
  } },
  { group: '시작 페이지', name: '예제 타일 40개를 하나씩 누르면 그 프로젝트가 열리고 다이어그램이 그려지며 문제가 없다', async run(app) {
    await startFresh(app);
    const ids = await app.main.eval(`[...document.querySelectorAll('[data-start="sample"]')].map((b) => [b.dataset.value, b.querySelector('b').textContent])`);
    assert.equal(ids.length, 40);
    for (const [id, title] of ids) {
      await startFresh(app);
      await app.main.click(`[data-start="sample"][data-value="${id}"]`);
      await app.main.waitFor(`window.__myumlmaker.state.docs.length === 1 && Boolean(window.__myumlmaker.api.diagram()) && document.querySelector('#start-page').hidden`, { timeout: 8000, message: `${id} opens` });
      await sleep(120);
      const info = await W(app, `({ name: w.api.project?.()?.name ?? w.state.docs[0].project?.name, drawn: document.querySelectorAll('.canvas-svg [data-view]').length, diagrams: w.domain.M.allDiagrams(w.state.docs[0].project).length, dirty: Boolean(w.state.docs[0].dirty) })`);
      assert.equal(info.name, title, `${id}: the project takes the tile's title`);
      assert.ok(info.drawn >= 2, `${id}: the first diagram is drawn (${info.drawn})`);
      assert.ok(info.diagrams >= 2, `${id}: ${info.diagrams} diagrams`);
      assert.equal(info.dirty, false, `${id}: a sample just opened has nothing to save`);
      await noError(app, id);
    }
  } },
  { group: '시작 페이지', name: '카드를 손잡이로 끌어 옮기면 배치가 저장되고, 자동 정렬이 되돌린다', async run(app) {
    await startFresh(app);
    const cell = (id) => app.main.eval(`document.querySelector('[data-card="${id}"]').style.gridRow + ' | ' + document.querySelector('[data-card="${id}"]').style.gridColumn`);
    const before = await cell('recent');
    assert.match(before, /span 1$/);
    assert.match(before, /\| 3 \/ span 1/, 'the recent card starts in the third column');
    const handle = await app.main.center('[data-card-handle="recent"]');
    const target = await app.main.center('[data-card="actions"] .start-tile');
    const during = await (async () => {
      await app.main.mouse('mouseMoved', handle.x, handle.y);
      await app.main.mouse('mousePressed', handle.x, handle.y);
      for (let i = 1; i <= 10; i += 1) await app.main.mouse('mouseMoved', handle.x + ((target.x - handle.x) * i) / 10, handle.y + ((target.y - handle.y) * i) / 10);
      await sleep(100);
      return app.main.eval(`({ ghost: Boolean(document.querySelector('.start-ghost')), outline: Boolean(document.querySelector('.card-drop-outline')), origin: document.querySelector('[data-card="recent"]').classList.contains('drag-origin') })`);
    })();
    assert.deepEqual(during, { ghost: true, outline: true, origin: true }, 'a copy follows the pointer, the drop place shows');
    await app.main.mouse('mouseReleased', target.x, target.y);
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[document.querySelectorAll('.start-ghost').length, document.querySelectorAll('.card-drop-outline').length]`), [0, 0], 'the copy is gone');
    const after = await cell('recent');
    assert.notEqual(after, before, 'the card moved');
    assert.match(after, /\| 1 \/ span 1/, 'to the first column');
    const saved = await W(app, 'w.state.settings.startLayout');
    assert.equal(saved.cards.recent.col, 0, 'saved in the settings');
    assert.match(await app.main.eval(`localStorage.getItem('myumlmaker.settings.v1')`), /startLayout/, 'and kept for the next start');
    await W(app, '(a.showStartPage(false), a.showStartPage(true), 1)');
    await sleep(300);
    await app.main.eval(`window.__myumlmaker.actions.showStartPage(true), 1`);
    await sleep(300);
    assert.equal(await cell('recent'), after, 'the arrangement comes back when the page is built again');
    await app.main.click('[data-start="arrange"]');
    await sleep(300);
    assert.equal(await cell('recent'), before, 'Arrange puts it back');
    assert.equal((await W(app, 'w.state.settings.startLayout')).cards.recent.col, 2);
    await noError(app, 'move card');
  } },
  { group: '시작 페이지', name: '모서리로 카드 크기를 바꾸면 고정 높이·내부 스크롤, 두 번 누르면 내용에 맞춘다', async run(app) {
    await startFresh(app);
    const read = () => app.main.eval(`(() => { const c = document.querySelector('[data-card="samples"]'); return { h: c.getBoundingClientRect().height, fixed: c.classList.contains('fixed-height'), scrolls: c.querySelector('.card-body').scrollHeight > c.querySelector('.card-body').clientHeight }; })()`);
    const before = await read();
    assert.equal(before.fixed, false);
    await app.main.eval(`document.querySelector('[data-card-resize="samples"]').scrollIntoView({ block: 'center' }), 1`);
    await sleep(100);
    const corner = await app.main.center('[data-card-resize="samples"]');
    await app.main.drag(corner, { x: corner.x, y: corner.y - 300 });
    await sleep(300);
    const small = await read();
    assert.ok(small.fixed && small.h < before.h - 200, `smaller and fixed: ${JSON.stringify(small)}`);
    assert.ok(small.scrolls, 'the rest scrolls inside the card');
    await app.main.eval(`document.querySelector('[data-card-resize="samples"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 1`);
    await sleep(300);
    const fitted = await read();
    assert.equal(fitted.fixed, false, 'fits again');
    assert.ok(Math.abs(fitted.h - before.h) < 2, `the same height as before: ${fitted.h} / ${before.h}`);
    await app.main.click('[data-start="arrange"]');
    await noError(app, 'resize card');
  } },
  { group: '시작 페이지', name: '다시 그려도 스크롤 위치가 그대로이고, 끌지 않은 누름은 배치를 바꾸지 않는다', async run(app) {
    await startFresh(app);
    await app.main.eval(`document.querySelector('.start-scroll').scrollTop = 500, 1`);
    const handle = await app.main.center('[data-card-handle="theme"]');
    const layout = await W(app, 'JSON.stringify(w.state.settings.startLayout)');
    await app.main.realClick(handle.x, handle.y);
    await sleep(200);
    assert.equal(await W(app, 'JSON.stringify(w.state.settings.startLayout)'), layout, 'a click on the handle moves nothing');
    await app.main.eval(`document.querySelector('[data-start="animation"][data-value="nodes"]').click(), 1`);
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('.start-scroll').scrollTop > 400`), 'choosing a background does not jump to the top');
  } },
  { group: '시작 페이지', name: '바로 가기 타일: 언어·설정·테마 설정·시작 화면 설정·정보, 끝내기까지 모두 동작', async run(app) {
    await startFresh(app);
    const tiles = await app.main.eval(`[...document.querySelectorAll('.start-actions [data-start]')].map((b) => b.dataset.start)`);
    assert.deepEqual(tiles, ['open', 'import', 'reverse', 'textImport', 'tutorial', 'theme-settings', 'language', 'settings', 'start-settings', 'about', 'exit']);
    assert.ok(await app.main.eval(`[...document.querySelectorAll('.start-actions .start-tile')].every((b) => b.title && b.querySelector('b').textContent && b.querySelector('small').textContent && b.querySelector('svg'))`), 'each has a picture, name, description and tooltip');
    for (const [start, kind, tab] of [['settings', 'settings', 'general'], ['theme-settings', 'settings', 'appearance'], ['start-settings', 'settings', 'start'], ['about', 'about', null]]) {
      await startFresh(app);
      await app.main.click(`.start-actions [data-start="${start}"]`);
      await app.waitFrame(kind, `document.querySelector('.popup')`);
      if (tab) assert.ok(await app.frame(kind, `document.querySelector('[data-action="tab"].active, .tab.active, [role="tab"][aria-selected="true"]')?.dataset.value === ${JSON.stringify(tab)} || document.body.innerHTML.includes('data-value="${tab}"')`), `${start} opens ${tab}`);
      await closeFrames(app);
    }
    await noError(app, 'launcher');
  } },
  { group: '시작 페이지', name: '테마 카드: 어두운 20 · 밝은 20, 누르면 바뀌고 고른 타일이 표시된다', async run(app) {
    await startFresh(app);
    const info = await app.main.eval(`({ dark: document.querySelectorAll('[data-theme-kind="dark"] [data-start="pick-theme"]').length, light: document.querySelectorAll('[data-theme-kind="light"] [data-start="pick-theme"]').length, chip: Boolean(document.querySelector('[data-start="pick-theme"] .st-theme-chip')) })`);
    assert.deepEqual(info, { dark: 20, light: 20, chip: true });
    const previous = await W(app, 'w.state.settings.theme');
    await app.main.click('[data-start="pick-theme"][data-value="nord"]');
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[document.documentElement.dataset.theme, document.documentElement.dataset.mode, document.querySelector('[data-start="pick-theme"][data-value="nord"]').classList.contains('on'), document.querySelector('[data-start="pick-theme"][data-value="nord"]').getAttribute('aria-checked')]`), ['nord', 'dark', true, 'true']);
    await app.main.click(`[data-start="pick-theme"][data-value="${previous}"]`);
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.theme'), previous);
  } },
  { group: '시작 페이지', name: '카드 불투명도 슬라이더가 바로 반영되고 저장된다', async run(app) {
    await startFresh(app);
    const set = (value, type) => app.main.eval(`(() => { const i = document.querySelector('[data-start-opacity]'); i.value = ${value}; i.dispatchEvent(new Event('${type}', { bubbles: true })); return 1; })()`);
    await set(40, 'input');
    assert.equal(await app.main.eval(`getComputedStyle(document.querySelector('.start-inner')).getPropertyValue('--start-card-alpha').trim()`), '40%');
    assert.equal(await app.main.eval(`document.querySelector('[data-start-opacity]').parentElement.querySelector('output').textContent`), '40%');
    await set(40, 'change');
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.startCardOpacity'), 40);
    await set(80, 'change');
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.startCardOpacity'), 80);
  } },
  { group: '시작 페이지', name: '설정에서 끈 예제·배경 카드는 사라지고 배치가 메워진다', async run(app) {
    await startFresh(app);
    await W(app, '(w.state.settings.startShowSamples = false, w.state.settings.startShowBackground = false, a.showStartPage(true), 1)');
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card)`), ['hero', 'actions', 'recent', 'templates', 'theme']);
    await W(app, '(w.state.settings.startShowSamples = true, w.state.settings.startShowBackground = true, a.showStartPage(true), 1)');
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelectorAll('.start-board > .start-card').length`), 7);
  } },
  { group: '자동 정렬', name: '툴바의 자동 정렬: 이름이 보이고, 시작 페이지에서는 카드를, 다이어그램에서는 노드를 정렬한다', async run(app) {
    await startFresh(app);
    const label = await app.main.eval(`(() => { const b = document.querySelector('#toolbar [data-command="autoArrange"]'); return { text: b?.textContent.trim(), disabled: b?.disabled, inside: b.getBoundingClientRect().right <= innerWidth }; })()`);
    assert.deepEqual(label, { text: '자동 정렬', disabled: false, inside: true }, 'a named, enabled button on the toolbar');
    const handle = await app.main.center('[data-card-handle="recent"]');
    const target = await app.main.center('[data-card="actions"] .start-tile');
    await app.main.drag(handle, target);
    await sleep(300);
    assert.equal((await W(app, 'w.state.settings.startLayout')).cards.recent.col, 0, 'moved away');
    await app.main.click('#toolbar [data-command="autoArrange"]');
    await sleep(300);
    assert.equal((await W(app, 'w.state.settings.startLayout')).cards.recent.col, 2, 'the cards are back');
    await W(app, `(a.openSampleBuiltin('inventory'), 1)`);
    await sleep(500);
    const place = () => W(app, `JSON.stringify(w.api.diagram().ownedViews.filter((v) => !v.tail).map((v) => [v.left, v.top]))`);
    const before = await place();
    await W(app, `(() => { const d = w.api.diagram(); for (const v of d.ownedViews) if (!v.tail) { v.left = 40; v.top = 40; } return 1; })()`);
    await app.main.click('#toolbar [data-command="autoArrange"]');
    await sleep(500);
    const after = JSON.parse(await place());
    assert.ok(new Set(after.map((p) => p.join())).size === after.length, `nodes piled up are spread out again (${before})`);
    await W(app, 'a.undo?.() ?? w.run("undo")');
    await sleep(300);
    const inMenu = await W(app, `Boolean(w.commands.autoArrange)`);
    assert.ok(inMenu);
    await noError(app, 'auto arrange');
  } },
  { group: '툴팁', name: '버튼 위에 마우스를 올리면 곧바로 툴팁이 뜨고, 떠나면 사라지며 title 이 돌아온다', async run(app) {
    await startFresh(app);
    const button = await app.main.center('#toolbar [data-command="autoArrange"]');
    const title = await app.main.eval(`document.querySelector('#toolbar [data-command="autoArrange"]').title`);
    assert.ok(title, 'it has a tooltip');
    await app.main.mouse('mouseMoved', button.x, button.y, { button: 'none' });
    const started = Date.now();
    await app.main.waitFor(`Boolean(document.querySelector('.app-tooltip'))`, { timeout: 1000, interval: 20, message: 'the tooltip appears' });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 450, `quickly: ${elapsed} ms`);
    const box = await app.main.eval(`(() => { const t = document.querySelector('.app-tooltip'); const r = t.getBoundingClientRect(); const b = document.querySelector('#toolbar [data-command="autoArrange"]'); return { text: t.textContent, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, below: r.top >= b.getBoundingClientRect().bottom, nativeOff: !b.hasAttribute('title'), events: getComputedStyle(t).pointerEvents }; })()`);
    assert.deepEqual(box, { text: title, inside: true, below: true, nativeOff: true, events: 'none' }, 'the browser shows no second tooltip');
    const other = await app.main.center('#toolbar [data-command="open"]');
    await app.main.mouse('mouseMoved', other.x, other.y, { button: 'none' });
    await app.main.waitFor(`document.querySelector('.app-tooltip')?.textContent === document.querySelector('#toolbar [data-command="open"]').dataset.tip`, { timeout: 1000, interval: 20, message: 'moves on to the next button' });
    assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="autoArrange"]').title`), title, 'the first button has its title back');
    const empty = await app.main.center('.start-foot .muted');
    await app.main.mouse('mouseMoved', empty.x, empty.y, { button: 'none' });
    await app.main.waitFor(`!document.querySelector('.app-tooltip')`, { timeout: 1000, message: 'gone when the pointer leaves' });
    // A press hides it, and it does not come back on the same button.
    await app.main.mouse('mouseMoved', other.x, other.y, { button: 'none' });
    await app.main.waitFor(`Boolean(document.querySelector('.app-tooltip'))`, { timeout: 1000 });
    await app.main.key('Escape');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.app-tooltip'))`), false, 'a key hides it');
    await app.main.mouse('mouseMoved', empty.x, empty.y, { button: 'none' });
    await sleep(200);
  } },
  { group: '툴팁', name: '시작 화면의 타일과 카드 손잡이도 빠른 툴팁을 보인다', async run(app) {
    await startFresh(app);
    for (const selector of ['[data-card-handle="actions"]', '.start-actions [data-start="open"]', '[data-start="sample"][data-value="library"]']) {
      await app.main.eval(`document.querySelector('${selector.replace(/'/g, "\\'")}').scrollIntoView({ block: 'center' }), 1`);
      await sleep(60);
      const at = await app.main.center(selector);
      await app.main.mouse('mouseMoved', at.x, at.y, { button: 'none' });
      await app.main.waitFor(`Boolean(document.querySelector('.app-tooltip')?.textContent)`, { timeout: 1000, interval: 20, message: selector });
      await app.main.mouse('mouseMoved', 2, 2, { button: 'none' });
      await sleep(80);
    }
  } },
  { group: '눈금자', name: '마우스 위치를 표시하는 선은 어느 테마에서나 빨간 점선이다', async run(app) {
    await startFresh(app); // waits for the welcome popup when a run starts here: it would cover the canvas
    await freshSample(app);
    await W(app, '(a.updateSettings({ showRulers: true }), 1)');
    await sleep(300);
    const red = () => app.main.eval(`(() => { const count = (selector) => { const c = document.querySelector(selector); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 0xe5 && d[i + 1] === 0x19 && d[i + 2] === 0x1c && d[i + 3] > 200) n += 1; return n; }; return [count('.ruler-h'), count('.ruler-v')]; })()`);
    const box = await app.main.eval(`(() => { const r = document.querySelector('.canvas-scroll').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    for (const theme of ['light', 'nord']) {
      await W(app, `(a.updateSettings({ theme: '${theme}' }), 1)`);
      await sleep(250);
      await app.main.mouse('mouseMoved', box.x + 11, box.y + 7, { button: 'none' });
      await app.main.mouse('mouseMoved', box.x + 13, box.y + 9, { button: 'none' });
      await sleep(250);
      const [h, v] = await red();
      // A solid line would fill the ruler's 20 px; dashes 2 on, 2 off fill half of it.
      assert.ok(h >= 8 && h <= 12 && v >= 8 && v <= 12, `${theme}: a red dotted line on both rulers (${h}, ${v})`);
    }
    await W(app, `(a.updateSettings({ theme: 'light' }), 1)`);
    await sleep(200);
  } },
  { group: '다이어그램 아이콘', name: 'UML이 아닌 다이어그램의 도구 상자에만 아이콘 도구가 있고, 창에서 고르면 가운데에 들어간다', async run(app) {
    await freshSample(app);
    const toolIn = (type) => W(app, `(() => { const d = w.domain.M.allDiagrams(w.state.docs[0].project).find((x) => x._type === '${type}'); a.openDiagram ? a.openDiagram(d._id) : w.actions.showDiagram?.(d._id); return Boolean(w.domain.toolboxFor('${type}').flatMap((g) => g[3]).find((t) => t.id === 'insertIcon')); })()`);
    assert.equal(await toolIn('UMLClassDiagram'), false);
    assert.equal(await toolIn('FCFlowchartDiagram'), true);
    await W(app, `(a.newProject('flowchart'), a.setCanvasZoom(100), 1)`);
    await sleep(400);
    const before = await W(app, `w.api.diagram().ownedViews.length`);
    await app.main.click('[data-tool="insertIcon"]');
    await app.waitFrame('iconpicker', `document.querySelector('.icon-tile')`);
    const info = await app.frame('iconpicker', `({ tiles: document.querySelectorAll('[data-action="pick-icon"]').length, groups: document.querySelectorAll('[data-icon-group]').length, add: Boolean(document.querySelector('[data-action="add-my-icon"]')), named: [...document.querySelectorAll('[data-action="pick-icon"]')].every((b) => b.title || b.dataset.tip), drawn: [...document.querySelectorAll('[data-action="pick-icon"] svg')].every((s) => s.getBoundingClientRect().width > 10), overflow: document.querySelector('.icon-groups').scrollHeight - document.querySelector('.icon-groups').clientHeight })`);
    assert.equal(info.tiles, 100, JSON.stringify(info));
    assert.equal(info.groups, 11, JSON.stringify(info));
    assert.ok(info.add && info.named && info.drawn, JSON.stringify(info));
    assert.ok(info.overflow <= 0, `all fit without scrolling (${info.overflow})`);
    await app.frame('iconpicker', `(() => { const i = document.querySelector('[data-icon-search]'); i.value = '방패'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.equal(await app.frame('iconpicker', `document.querySelectorAll('[data-action="pick-icon"]').length`), 1, 'the search narrows the list');
    assert.equal(await app.frame('iconpicker', `document.activeElement === document.querySelector('[data-icon-search]') && document.activeElement.value === '방패'`), true, 'typing goes on');
    await app.frame('iconpicker', `(document.querySelector('[data-action="pick-icon"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-iconpicker')`, { timeout: 4000 });
    await sleep(300);
    const placed = await W(app, `(() => { const views = w.api.diagram().ownedViews; const v = views.at(-1); const s = document.querySelector('.canvas-svg [data-view="' + v._id + '"]'); return { count: views.length, type: v._type, icon: v.iconId, selected: w.state.selection.ids.includes(v._id), drawn: Boolean(s?.querySelector('g[transform] path')), editing: Boolean(document.querySelector('.canvas-editor, .inline-editor')) }; })()`);
    assert.deepEqual(placed, { count: before + 1, type: 'IconView', icon: 'shield', selected: true, drawn: true, editing: false });
    // The Properties panel changes it; undo takes it back.
    await sleep(200);
    await app.main.eval(`document.querySelector('[data-icon-pick]').click(), 1`);
    await app.waitFrame('iconpicker', `document.querySelector('.icon-tile')`);
    await app.frame('iconpicker', `(document.querySelector('[data-action="pick-icon"][data-value="cloud"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-iconpicker')`, { timeout: 4000 });
    await sleep(300);
    assert.equal(await W(app, `w.api.diagram().ownedViews.at(-1).iconId`), 'cloud');
    await W(app, `w.run('undo')`);
    await sleep(200);
    assert.equal(await W(app, `w.api.diagram().ownedViews.at(-1).iconId`), 'shield');
    await noError(app, 'icon');
  } },
  { group: '다이어그램 아이콘', name: '내 아이콘을 추가해 넣고, 창에서 지울 수 있다', async run(app) {
    await W(app, `(() => { localStorage.setItem('myumlmaker.myIcons.v1', JSON.stringify([{ id: 'my-1', name: 'Logo', src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMCAxMCc+PGNpcmNsZSBjeD0nNScgY3k9JzUnIHI9JzQnLz48L3N2Zz4=' }])); a.newProject('flowchart'); return 1; })()`);
    await sleep(400);
    await app.main.click('[data-tool="insertIcon"]');
    await app.waitFrame('iconpicker', `document.querySelector('.icon-tile')`);
    assert.equal(await app.frame('iconpicker', `document.querySelectorAll('[data-icon-group="mine"] img').length`), 1);
    await app.frame('iconpicker', `(document.querySelector('[data-action="pick-my-icon"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-iconpicker')`, { timeout: 4000 });
    await sleep(300);
    const v = await W(app, `(() => { const v = w.api.diagram().ownedViews.at(-1); return { type: v._type, image: Boolean(document.querySelector('.canvas-svg [data-view="' + v._id + '"] image')), src: v.src.slice(0, 14) }; })()`);
    assert.deepEqual(v, { type: 'IconView', image: true, src: 'data:image/svg' });
    await app.main.click('[data-tool="insertIcon"]');
    await app.waitFrame('iconpicker', `document.querySelector('.icon-tile')`);
    await app.frame('iconpicker', `(document.querySelector('[data-action="remove-my-icon"]').click(), 1)`);
    await sleep(200);
    assert.equal(await app.frame('iconpicker', `document.querySelectorAll('[data-icon-group="mine"] img').length`), 0);
    assert.equal(await app.main.eval(`localStorage.getItem('myumlmaker.myIcons.v1')`), '[]');
    assert.equal(await W(app, `Boolean(document.querySelector('.canvas-svg [data-view] image'))`), true, 'an icon already on the diagram stays');
    await closeFrames(app);
    await noError(app, 'my icon');
  } },
  { group: '다이어그램 테마', name: '기본: 다이어그램 배경이 프로그램 테마를 따르고, 사용자가 색 구성이나 다이어그램별 배경으로 바꿀 수 있다', async run(app) {
    await freshSample(app);
    const shown = () => app.main.eval(`getComputedStyle(document.querySelector('.canvas-svg')).backgroundColor`);
    assert.equal(await W(app, 'w.state.settings.diagramTheme'), 'theme', 'the default');
    const set = (patch) => W(app, `(a.updateSettings(${JSON.stringify(patch)}), 1)`);
    await set({ theme: 'light' });
    await sleep(300);
    const light = await shown();
    await set({ theme: 'nord' });
    await sleep(400);
    const dark = await shown();
    assert.notEqual(dark, light, 'the diagram changes with the program theme');
    assert.equal(await app.main.eval(`document.documentElement.dataset.mode`), 'dark');
    assert.equal(dark, await app.main.eval(`(() => { const e = document.createElement('i'); e.style.color = getComputedStyle(document.documentElement).getPropertyValue('--chart'); document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; })()`), 'the paper is the drawing colour of the theme');
    // The user's choice: a scheme stays whatever the program theme.
    await set({ diagramTheme: 'classic' });
    await sleep(300);
    const white = await shown();
    assert.notEqual(white, dark, 'white paper in a dark program');
    await set({ theme: 'light' });
    await sleep(300);
    await set({ theme: 'nord' });
    await sleep(300);
    assert.equal(await shown(), white, 'and it stays when the theme changes');
    // One diagram's own background still wins.
    await set({ diagramTheme: 'theme' });
    await sleep(200);
    await W(app, `(a.change ? a.change('op.edit', (project, diagram) => { diagram.backgroundKind = 'color'; diagram.backgroundColor = '#112233'; }) : null, 1)`);
    await sleep(300);
    assert.notEqual(await shown(), dark, 'the diagram has its own background');
    // On paper and in images: white, also from a dark program.
    await W(app, `(w.run('print'), 1)`);
    await app.waitFrame('print', `document.querySelector('#print-preview svg')`);
    assert.equal(await W(app, `JSON.parse(localStorage.getItem('myumlmaker.popup.print') ?? '{}').theme ?? 'classic'`), 'classic', 'prints on white');
    await closeFrames(app);
    await set({ theme: 'light' });
    await sleep(200);
    await noError(app, 'follow the theme');
  } },
  { group: '시작 페이지', name: '시작 버튼은 토글: 시작 페이지 ↔ 보던 다이어그램 (프로젝트가 없으면 시작 페이지 유지)', async run(app) {
    await freshSample(app);
    const state = () => app.main.eval(`({ start: !document.querySelector('#start-page').hidden, pressed: document.querySelector('#menubar [data-home]').getAttribute('aria-pressed'), text: document.querySelector('#menubar [data-home]').textContent.trim() })`);
    const diagram = await W(app, 'w.api.diagram()._id');
    assert.deepEqual(await state(), { start: false, pressed: 'false', text: '시작' });
    await app.main.click('#menubar [data-home]');
    await sleep(300);
    assert.deepEqual(await state(), { start: true, pressed: 'true', text: '시작' }, 'opens');
    await app.main.click('#menubar [data-home]');
    await sleep(400);
    assert.deepEqual(await state(), { start: false, pressed: 'false', text: '시작' }, 'closes');
    assert.equal(await W(app, 'w.api.diagram()._id'), diagram, 'the same diagram is back');
    assert.ok(await app.main.eval(`document.querySelectorAll('.canvas-svg [data-view]').length > 0`), 'and drawn');
    await startFresh(app);
    await app.main.click('#menubar [data-home]');
    await sleep(300);
    assert.equal((await state()).start, true, 'nothing open: the start page stays');
    await noError(app, 'start toggle');
  } },
  { group: '인쇄', name: '툴바의 인쇄 버튼: 프로젝트가 있으면 인쇄 창을 열고, 없으면 꺼져 있다', async run(app) {
    await startFresh(app);
    const button = `#toolbar [data-command="print"]`;
    const info = await app.main.eval(`(() => { const b = document.querySelector('${button}'); return { there: Boolean(b), disabled: b?.disabled, icon: b?.querySelector('svg')?.dataset.icon, tip: Boolean(b?.title || b?.dataset.tip), inside: b.getBoundingClientRect().right <= innerWidth }; })()`);
    assert.deepEqual(info, { there: true, disabled: true, icon: 'print', tip: true, inside: true });
    await freshSample(app);
    assert.equal(await app.main.eval(`document.querySelector('${button}').disabled`), false);
    await app.main.click(button);
    await app.waitFrame('print', `document.querySelector('#print-preview svg')`);
    await closeFrames(app);
    await noError(app, 'toolbar print');
  } },
  { group: '다이어그램 테마', name: '색 구성 창: 밝은 20 · 어두운 20, 누르면 바로 다이어그램에 적용되고 설정에도 40개가 있다', async run(app) {
    await freshSample(app);
    const previous = await W(app, 'w.state.settings.diagramTheme');
    await W(app, `(w.run('diagramThemeMore'), 1)`);
    await app.waitFrame('diagramtheme', `document.querySelector('.dt-tile')`);
    const info = await app.frame('diagramtheme', `({ light: document.querySelectorAll('[data-theme-kind="light"] .dt-tile').length, dark: document.querySelectorAll('[data-theme-kind="dark"] .dt-tile').length, on: document.querySelector('.dt-tile.on')?.dataset.value, overflow: document.querySelector('.dt-groups').scrollHeight - document.querySelector('.dt-groups').clientHeight, cut: [...document.querySelectorAll('.dt-tile')].filter((b) => b.scrollWidth > b.clientWidth + 1).length })`);
    assert.deepEqual(info, { light: 20, dark: 20, on: previous, overflow: 0, cut: 0 });
    assert.equal(await app.frame('diagramtheme', `document.querySelector('[data-theme-kind="follow"] .dt-tile').dataset.value`), 'theme');
    const paper = () => app.main.eval(`getComputedStyle(document.querySelector('.canvas-svg .node-view rect:not(.hit)') ?? document.body).fill`);
    const before = await paper();
    for (const id of ['neon', 'lavender', 'chalkboard']) {
      await app.frame('diagramtheme', `(document.querySelector('[data-value="${id}"]').click(), 1)`);
      await sleep(350);
      assert.equal(await W(app, 'w.state.settings.diagramTheme'), id);
      assert.equal(await app.frame('diagramtheme', `document.querySelector('.dt-tile.on').dataset.value`), id, 'the window stays open and marks it');
    }
    assert.notEqual(await paper(), before, 'the diagram changed colour');
    await app.frame('diagramtheme', `(document.querySelector('[data-value="${previous}"]').click(), 1)`);
    await sleep(250);
    await closeFrames(app);
    await W(app, `(w.popups.open('settings', { tab: 'diagram' }), 1)`);
    await app.waitFrame('settings', `document.querySelector('[data-select="diagramTheme"]')`);
    assert.equal(await app.frame('settings', `document.querySelectorAll('[data-select="diagramTheme"] option').length`), 41, '40 and following the theme');
    await closeFrames(app);
    await noError(app, 'diagram themes');
  } },
  { group: '인쇄', name: '인쇄 창: 탭 없이 범위·용지·머리글·프린터 설정과 미리보기가 한 화면에 있고 스크롤이 없다', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('print'), 1)`);
    await app.waitFrame('print', `document.querySelector('#print-preview svg')`);
    const info = await app.frame('print', `(() => {
      const options = document.querySelector('.print-options');
      const visible = (selector) => { const e = document.querySelector(selector); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom <= innerHeight && r.right <= innerWidth; };
      return { tabs: document.querySelectorAll('.tabs, [data-action="tab"]').length, sections: document.querySelectorAll('.print-section').length,
        range: visible('[data-print-range="all"]'), paper: visible('[data-print="paper"]'), orientation: visible('[data-print-segment="orientation"]'), margin: visible('[data-print="margin"]'), fit: visible('[data-print-segment="fit"]'), header: visible('[data-print-toggle="header"]'), footerText: visible('[data-print-text="footerText"]'), background: visible('[data-print-toggle="background"]'), preview: visible('#print-preview svg'), print: visible('[data-action="print"]'),
        clipped: options.scrollHeight - options.clientHeight, wide: options.scrollWidth - options.clientWidth };
    })()`);
    assert.deepEqual({ ...info, clipped: 0, wide: 0 }, { tabs: 0, sections: 4, range: true, paper: true, orientation: true, margin: true, fit: true, header: true, footerText: true, background: true, preview: true, print: true, clipped: 0, wide: 0 });
    assert.ok(info.clipped <= 0 && info.wide <= 0, `nothing is cut off ${JSON.stringify(info)}`);
    // The browser has no printer list: Print opens its own window, and says so.
    assert.ok(await app.frame('print', `document.querySelector('.print-options').textContent.includes(window.__myumlmaker?.t?.('print.systemDialog') ?? '시스템 인쇄 창')`));
    // Changing a setting updates the preview beside it at once.
    const size = () => app.frame('print', `(() => { const s = document.querySelector('#print-preview svg').getBoundingClientRect(); return s.width > s.height; })()`);
    const wide = await size();
    await app.frame('print', `(document.querySelector('[data-print-segment="orientation"]:not(.active)').click(), 1)`);
    await sleep(300);
    assert.notEqual(await size(), wide, 'the preview turned');
    await app.frame('print', `(document.querySelector('[data-print-segment="orientation"]:not(.active)').click(), 1)`);
    await sleep(200);
    await closeFrames(app);
    await noError(app, 'print window');
  } },
  { group: '아이콘', name: '화면의 모든 아이콘이 색을 가지며, 테마에 따라 음영이 바뀐다', async run(app) {
    await startFresh(app);
    const colours = () => app.main.eval(`(() => {
      const icons = [...document.querySelectorAll('svg.icon')];
      const seen = {};
      for (const i of icons) if (i.dataset.tone) seen[i.dataset.tone] = getComputedStyle(i).color;
      return { total: icons.length, unmarked: icons.filter((i) => !i.dataset.tone).length, hues: new Set(icons.map((i) => getComputedStyle(i).color)).size, seen, toolbarHues: new Set([...document.querySelectorAll('#toolbar svg.icon')].map((i) => getComputedStyle(i).color)).size, primary: getComputedStyle(document.querySelector('.button.primary svg.icon')).color === getComputedStyle(document.querySelector('.button.primary')).color };
    })()`);
    const light = await colours();
    assert.ok(light.total > 100, `icons on screen: ${light.total}`);
    assert.equal(light.unmarked, 0, 'every icon has a colour');
    assert.ok(light.hues >= 10, `many colours: ${light.hues}`);
    assert.ok(light.toolbarHues >= 5, `the toolbar is colourful: ${light.toolbarHues}`);
    assert.ok(light.primary, 'on the accent button the icon takes the button text colour');
    const previous = await W(app, 'w.state.settings.theme');
    await app.main.click('[data-start="pick-theme"][data-value="nord"]');
    await sleep(300);
    const dark = await colours();
    for (const tone of ['blue', 'red', 'green', 'amber']) assert.notEqual(dark.seen[tone], light.seen[tone], `${tone}: a brighter shade on dark themes`);
    await app.main.click(`[data-start="pick-theme"][data-value="${previous}"]`);
    await sleep(200);
  } },
  { group: '아이콘', name: '패널·메뉴·팝업의 아이콘도 색이 있다 (예제 프로젝트 화면)', async run(app) {
    await freshSample(app);
    const panes = await app.main.eval(`Object.fromEntries(['#left-panel', '#right-panel', '#menubar', '#explorer', '#tabs'].map((s) => [s, new Set([...document.querySelectorAll(s + ' svg.icon')].map((i) => getComputedStyle(i).color)).size]))`);
    for (const [selector, hues] of Object.entries(panes)) assert.ok(hues >= 3, `${selector}: ${hues} colours`);
    await app.main.click('[data-menu="file"]');
    await sleep(400);
    await closeFrames(app);
  } },
  { group: '창', name: '도구 상자·모델 탐색기·편집기·프로젝트 이름과 다이어그램 탭', async run(app) {
    await freshSample(app);
    const info = await app.main.eval(`({
      tools: document.querySelectorAll('#left-panel .tool-item[data-tool]').length,
      tree: document.querySelectorAll('#explorer .tree-row').length,
      editorTabs: document.querySelectorAll('#editor-tabs .editor-tab').length,
      diagramTab: document.querySelector('#tabs .tab[data-diagram-tab].active')?.textContent.trim(),
      diagramTabs: document.querySelectorAll('#tabs .tab[data-diagram-tab]').length,
      project: document.querySelector('#menubar .app-brand-project-name')?.textContent,
      views: document.querySelectorAll('.canvas-svg [data-view]').length,
    })`);
    assert.ok(info.tools > 20 && info.tree > 3 && info.editorTabs === 4 && info.views > 10, JSON.stringify(info));
    assert.ok(info.diagramTab, 'the open diagram has a tab');
    assert.equal(info.diagramTabs, await W(app, 'M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).length'), 'a tab per diagram');
    assert.ok(info.project, 'the project name in the title bar');
  } },
  { group: '다이어그램', name: '클래스를 누르면 선택·탐색기에서 선택·속성 표시 (실제 마우스)', async run(app) {
    await freshSample(app);
    const v = await viewAt(app, 'Customer');
    await app.main.realClick(v.x, v.y);
    await sleep(300);
    assert.deepEqual(await W(app, 'w.state.selection.ids'), [v.id]);
    assert.deepEqual(await W(app, 'w.state.explorer'), [v.model]);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#explorer .tree-row.selected'))`));
    assert.equal(await app.main.eval(`document.querySelector('#editors [data-field="name"]').value`), 'Customer');
  } },
  { group: '다이어그램', name: '끌어 옮기기는 실행 취소 한 단계, 격자에 맞춤 (실제 마우스)', async run(app) {
    await freshSample(app);
    const v = await viewAt(app, 'Payable');
    const steps = await W(app, 'a.activeDoc().history.undoStack.length');
    await app.main.drag({ x: v.x, y: v.y }, { x: v.x + 47, y: v.y + 31 });
    await sleep(300);
    const after = await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)})`);
    assert.equal(after.left % 10, 0, 'snapped to the 10 px grid');
    assert.notEqual(after.left, v.box.x);
    assert.equal(await W(app, 'a.activeDoc().history.undoStack.length'), steps + 1, 'one undo step');
    await W(app, '(a.undo(), 1)');
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)}).left`), v.box.x);
    await noError(app, 'move');
  } },
  { group: '다이어그램', name: '모서리를 끌어 크기 조정 (실제 마우스)', async run(app) {
    await freshSample(app);
    const v = await viewAt(app, 'Payable');
    await app.main.realClick(v.x, v.y);
    await sleep(200);
    const handle = await app.main.eval(`(() => { const h = document.querySelector('.canvas-overlay [data-resize="4"]').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; })()`);
    await app.main.drag(handle, { x: handle.x + 80, y: handle.y + 60 });
    await sleep(300);
    const view = await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)})`);
    assert.ok(view.width >= v.box.w + 60 && view.height >= v.box.h + 40, JSON.stringify(view));
    await noError(app, 'resize');
  } },
  { group: '다이어그램', name: '도구 상자: 클래스를 누르고 그려 이름 입력 → 일반화 관계를 끌어 연결 (실제 마우스)', async run(app) {
    await freshProject(app);
    await app.main.click('[data-tool="UMLClass"]');
    const p1 = await canvasPoint(app, 0.2, 0.3);
    await app.main.realClick(p1.x, p1.y);
    await sleep(300);
    await app.main.type('Animal');
    await app.main.key('Enter', 2);
    await sleep(200);
    await app.main.click('[data-tool="UMLClass"]');
    const p2 = await canvasPoint(app, 0.2, 0.7);
    await app.main.realClick(p2.x, p2.y);
    await sleep(300);
    await app.main.type('Dog');
    await app.main.key('Enter', 2);
    await sleep(200);
    assert.ok(await elementNamed(app, 'Animal') && await elementNamed(app, 'Dog'), 'both classes named');
    await app.main.click('[data-tool="UMLGeneralization"]');
    const dog = await viewAt(app, 'Dog');
    const animal = await viewAt(app, 'Animal');
    await app.main.drag({ x: dog.x, y: dog.y }, { x: animal.x, y: animal.y }, 16);
    await sleep(300);
    const gen = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').map((g) => [g.source.$ref, g.target.$ref])`);
    assert.deepEqual(gen, [[dog.model, animal.model]]);
    assert.equal(await W(app, 'w.state.tool'), null, 'the tool goes back to the pointer');
    await noError(app, 'create');
  } },
  { group: '다이어그램', name: '빠른 편집: 두 번 눌러 이름·속성·오퍼레이션을 글로 고침 (Ctrl+Enter)', async run(app) {
    await freshProject(app, 'classModel');
    const v = await viewAt(app, '과목');
    await app.main.realClick(v.x, v.y, { clickCount: 2 });
    await app.main.waitFor(`Boolean(document.querySelector('.text-editor.multi'))`);
    await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); e.value = '«entity» Lecture\\n--\\n-title: String\\n+credits: int = 3\\n--\\n+enroll(student: 학생): boolean {query}'; return 1; })()`);
    await app.main.key('Enter', 2);
    await sleep(300);
    const lecture = await elementNamed(app, 'Lecture');
    assert.ok(lecture, 'renamed');
    assert.equal(lecture.stereotype, 'entity');
    assert.deepEqual(lecture.attributes.map((x) => [x.name, x.visibility, x.defaultValue ?? '']), [['title', 'private', ''], ['credits', 'public', '3']]);
    assert.equal(lecture.operations[0].name, 'enroll');
    assert.equal(lecture.operations[0].isQuery, true);
    assert.ok(lecture.operations[0].parameters[0].type.$ref, 'Student became a reference to the class');
    await noError(app, 'quick edit');
  } },
  { group: '다이어그램', name: '빠른 단추: 속성 추가, 관련 요소(하위 클래스) 추가', async run(app) {
    await freshProject(app, 'classModel');
    const v = await viewAt(app, '사람');
    await app.main.realClick(v.x, v.y);
    await sleep(300);
    const before = (await elementNamed(app, '사람')).attributes.length;
    await app.main.click('.quick-bar [data-quick="addAttribute"]');
    await sleep(300);
    await app.main.key('Escape');
    assert.equal((await elementNamed(app, '사람')).attributes.length, before + 1);
    await W(app, `(a.addRelated(${JSON.stringify(v.id)}, 'subclass'), 1)`);
    await sleep(200);
    assert.equal(await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').length`), 2);
  } },
  { group: '다이어그램', name: '선: 중간을 끌어 꺾고, 끝을 다른 클래스로 옮김 (실제 마우스)', async run(app) {
    await freshProject(app, 'classModel');
    const edge = await W(app, `api.diagram().ownedViews.find((x) => x._type === 'UMLGeneralizationView')._id`);
    await W(app, `(a.select([${JSON.stringify(edge)}]), 1)`);
    await sleep(200);
    const mid = await app.main.eval(`(() => { const h = document.querySelector('.canvas-overlay [data-insert]'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    assert.ok(mid, 'a handle to add a bend point');
    await app.main.drag(mid, { x: mid.x - 60, y: mid.y });
    await sleep(300);
    assert.ok(await W(app, `M.findView(api.diagram(), ${JSON.stringify(edge)}).points.length >= 1`), 'a bend point');
    await W(app, `(a.select([${JSON.stringify(edge)}]), 1)`);
    await sleep(150);
    const head = await app.main.eval(`(() => { const r = document.querySelector('.canvas-overlay [data-end="head"]').getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; })()`);
    const course = await viewAt(app, '과목');
    await app.main.drag(head, { x: course.x, y: course.y + 10 }, 14);
    await sleep(300);
    const gen = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization')[0].target.$ref`);
    assert.equal(gen, course.model, 'reconnected in the model too');
    await noError(app, 'edge');
  } },
  { group: '다이어그램', name: '시퀀스: 라이프라인 사이에 메시지를 그리고, 위아래로 끌어 순서를 바꿈 (실제 마우스)', async run(app) {
    await freshProject(app, 'sequence');
    const count = await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLMessageView').length`);
    await app.main.click('[data-tool="message:asynchCall"]');
    const a1 = await viewAt(app, '클라이언트', 0.5, 190);
    const b1 = await viewAt(app, '서버', 0.5, 190);
    await app.main.drag({ x: a1.x, y: a1.y }, { x: b1.x, y: b1.y }, 12);
    await sleep(300);
    const messages = await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLMessageView').map((v) => v.y)`);
    assert.equal(messages.length, count + 1, 'a new message');
    await noError(app, 'message');
  } },
  { group: '다이어그램', name: '모델 탐색기에서 다이어그램으로 끌어 놓으면 뷰와 관계가 생김 (실제 마우스)', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(() => { const d = api.diagram(); d.ownedViews = []; a.activeDoc().touch(); api.view.update(); return 1; })()`);
    await W(app, `(api.explorer.expanded.add(a.activeDoc().project.ownedElements[0]._id), api.explorer.renderTree(), 1)`);
    await sleep(200);
    for (const name of ['사람', '학생']) {
      const row = await app.main.eval(`(() => { const r = [...document.querySelectorAll('#explorer .tree-row')].find((x) => x.querySelector('.tree-name')?.textContent === ${JSON.stringify(name)})?.getBoundingClientRect(); return r ? { x: r.left + 60, y: r.top + r.height / 2 } : null; })()`);
      assert.ok(row, `${name} row`);
      const target = await canvasPoint(app, 0.3, name === '사람' ? 0.2 : 0.6);
      await app.main.drag(row, target, 14);
      await sleep(300);
    }
    const kinds = await W(app, `api.diagram().ownedViews.map((v) => v._type).sort()`);
    assert.deepEqual(kinds, ['UMLClassView', 'UMLClassView', 'UMLGeneralizationView']);
    await noError(app, 'drop');
  } },
  { group: '다이어그램', name: 'Delete는 다이어그램에서만, Ctrl+Delete는 모델에서도 지움', async run(app) {
    await freshProject(app, 'classModel');
    const v = await viewAt(app, '과목');
    await app.main.realClick(v.x, v.y);
    await sleep(200);
    await app.main.key('Delete');
    await sleep(200);
    assert.ok(await elementNamed(app, '과목'), 'still in the model');
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)})`), null);
    await W(app, '(a.undo(), 1)');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), 1)`);
    await W(app, `(a.updateSettings({ confirmDelete: false }), 1)`);
    await app.main.key('Delete', 2);
    await sleep(300);
    assert.equal(await elementNamed(app, '과목'), null, 'gone from the model');
    await W(app, `(a.updateSettings({ confirmDelete: true }), 1)`);
  } },
  { group: '다이어그램', name: '모든 다이어그램 종류: 도구 상자의 모든 도구로 그려도 오류 없음', async run(app) {
    await freshProject(app);
    const types = await W(app, 'Object.keys(w.domain.DIAGRAM_TYPES)');
    const report = [];
    for (const type of types) report.push(...await W(app, `(() => {
      const out = [];
      { const type = ${JSON.stringify(type)};
        // A project per type: one project with every diagram would make each later drawing slower.
      for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true });
      a.newProject('blank');
      a.addDiagram(type);
        let i = 0;
        for (const [, , , tools] of w.domain.toolboxFor(type)) for (const tool of tools) {
          if (tool.kind !== 'node' || /Pin$/.test(tool.type)) continue;
          const r = a.createNodeAt(tool, { x: 40 + (i % 6) * 210, y: 40 + Math.floor(i / 6) * 180, w: 0, h: 0 });
          api.view?.finishEdit?.(true);
          i += 1;
          if (!r?.view) out.push(type + ':' + tool.id);
        }
      }
      return out;
    })()`));
    assert.deepEqual(report, []);
    await noError(app, 'all tools');
  } },
  { group: '편집', name: '복사·붙여넣기(새 요소), 실행 취소·다시 실행', async run(app) {
    await freshProject(app, 'classModel');
    const v = await viewAt(app, '과목');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), a.copySelection(), a.pasteClipboard(), 1)`);
    const classes = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLClass').map((e) => e.name).sort()`);
    assert.equal(classes.length, 4, JSON.stringify(classes));
    await W(app, '(a.undo(), 1)');
    assert.equal(await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLClass').length`), 3);
    await W(app, '(a.redo(), 1)');
    assert.equal(await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLClass').length`), 4);
  } },
  { group: '편집', name: 'Ctrl+마우스 휠로 확대, 맞춤', async run(app) {
    await freshSample(app);
    const p = await canvasPoint(app, 0.5, 0.5);
    await app.main.wheel(p.x, p.y, -240, 2);
    await sleep(300);
    assert.ok(await W(app, `a.activeDoc().view.zoom[api.diagram()._id] > 100`));
    await W(app, `(w.run('fitPage'), 1)`);
    await sleep(200);
    assert.ok(await W(app, `a.activeDoc().view.zoom[api.diagram()._id] <= 100`));
  } },
  { group: '편집', name: '자동 레이아웃: 상위 클래스가 위로', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(a.runLayout('TB'), 1)`);
    const person = await viewAt(app, '사람');
    const student = await viewAt(app, '학생');
    assert.ok(person.box.y < student.box.y);
    await W(app, `(a.runLayout('LR'), 1)`);
    const p2 = await viewAt(app, '사람');
    const s2 = await viewAt(app, '학생');
    assert.ok(p2.box.x < s2.box.x);
  } },
  { group: '팝업', name: '팝업은 스크롤 없이 그려짐 (설정 모든 탭·찾기·검증·코드 생성·텍스트 가져오기·그림·인쇄·정보·요구사항·추적·문서·기준선·배경), 배경 무늬 적용', async run(app) {
    await freshSample(app);
    const open = [
      ['settings', `w.popups.open('settings', { tab: 'general' })`], ['find', `w.run('find')`], ['validation', `w.popups.open('validation', { title: 'x', problems: [{ id: '', severity: 'warning', name: 'a', message: { ko: '경고', en: 'warning' } }] })`],
      ['codegen', `w.run('generateCode')`], ['textimport', `w.run('importText')`], ['image', `w.run('exportImage')`], ['print', `w.run('print')`], ['about', `w.run('about')`],
      ['requirements', `w.run('requirements')`], ['tracematrix', `w.run('traceMatrix')`], ['document', `w.run('generateDocument')`], ['baselines', `w.run('baselines')`], ['background', `w.run('diagramBackground')`],
    ];
    for (const [kind, js] of open) {
      await closeFrames(app);
      await W(app, `(${js}, 1)`);
      await app.waitFrame(kind);
      await sleep(kind === 'codegen' || kind === 'print' ? 900 : 250);
      assert.deepEqual(await app.frame(kind, FRAME_SCROLL_CHECK), [], `${kind}: no scroll bars`);
    }
    // Diagram background: pattern picked in the frame, OK → the canvas draws it; one undo step.
    await closeFrames(app);
    await W(app, `(w.run('diagramBackground'), 1)`);
    await app.waitFrame('background');
    await app.frame('background', `(document.querySelector('[data-bg="backgroundKind"][data-value="pattern"]').click(), 1)`);
    await app.waitFrame('background', `document.querySelector('.bg-pattern[data-value="dots"]')`);
    await app.frame('background', `(document.querySelector('.bg-pattern[data-value="dots"]').click(), 1)`);
    assert.deepEqual(await app.frame('background', FRAME_SCROLL_CHECK), [], 'background (pattern): no scroll bars');
    await app.frame('background', `(document.querySelector('[data-action="background-apply"]').click(), 1)`);
    await app.main.waitFor(`Boolean(document.querySelector('#view-host .bg-layer pattern'))`, { timeout: 5000, message: 'the canvas draws the pattern' });
    assert.equal(await W(app, 'api.diagram().backgroundPattern'), 'dots');
    await W(app, '(a.undo(), 1)');
    assert.equal(await W(app, 'api.diagram().backgroundKind ?? ""'), '', 'one undo step');
    for (const tab of ['start', 'appearance', 'font', 'background', 'diagram', 'database', 'recent', 'shortcuts']) {
      await app.frame('settings', `(window.__myumlmakerPopup.state.tab = ${JSON.stringify(tab)}, window.__myumlmakerPopup.render(), 1)`).catch(() => {});
    }
    await closeFrames(app);
    await noError(app, 'popups');
  } },
  { group: '모델 도구', name: '찾기: 결과를 누르면 그 요소로 감', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('find'), 1)`);
    await app.waitFrame('find');
    await app.frame('find', `(() => { const i = document.querySelector('[data-draft="text"]'); i.value = 'Order'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-action="find-run"]').click(); return 1; })()`);
    await app.waitFrame('find', `document.querySelectorAll('.result-row').length > 0`);
    await app.frame('find', `(document.querySelector('.result-row').click(), 1)`);
    await sleep(400);
    assert.ok(await W(app, `w.state.explorer.length === 1`));
    await closeFrames(app);
  } },
  { group: '모델 도구', name: '검증: 문제를 찾아 팝업으로, 누르면 그 요소', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(a.change('op.edit', (p) => { M.elementsWhere(p, (e) => e.name === '과목')[0].name = ''; }), 1)`);
    await W(app, `(w.run('validate'), 1)`);
    await app.waitFrame('validation', `document.querySelectorAll('.result-row').length > 0`);
    assert.match(await app.frame('validation', `document.querySelector('.result-list').innerText`), /이름|Name/);
    assert.ok(await W(app, `w.state.validation.errors >= 1`));
    await closeFrames(app);
  } },
  { group: '모델 도구', name: '코드 생성: 미리 보기에 Java 클래스, 언어를 바꾸면 Python', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(w.run('generateCode'), 1)`);
    await app.waitFrame('codegen', `document.querySelector('.code-preview')?.textContent.includes('class ')`);
    assert.match(await app.frame('codegen', `document.querySelector('.code-preview').textContent`), /public (abstract )?class \S+/);
    await app.frame('codegen', `(() => { const s = document.querySelector('[data-draft-select="language"]'); s.value = 'python'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.waitFrame('codegen', `/^class \\S+/m.test(document.querySelector('.code-preview')?.textContent ?? '')`);
    await closeFrames(app);
  } },
  { group: '모델 도구', name: '역공학: Java 소스 → 클래스·상속·연관과 다이어그램', async run(app) {
    await freshProject(app);
    await W(app, `(a.reverseFiles([{ name: 'shop/Order.java', content: 'package shop; public class Order extends Base { private Customer customer; private int total; public int total() { return total; } }' }, { name: 'shop/Customer.java', content: 'package shop; public class Customer {}' }, { name: 'shop/Base.java', content: 'package shop; public abstract class Base {}' }], 'java'), 1)`);
    await sleep(500);
    assert.ok(await elementNamed(app, 'Order') && await elementNamed(app, 'Customer'));
    assert.equal(await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').length`), 1);
    assert.equal(await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLClassView').length`), 3, 'a diagram of what was read');
    await noError(app, 'reverse');
  } },
  { group: '모델 도구', name: 'Mermaid 가져오기 팝업: 예제 → 가져오기 → 다이어그램', async run(app) {
    await freshProject(app);
    await W(app, `(w.run('importText'), 1)`);
    await app.waitFrame('textimport');
    await app.frame('textimport', `(() => { const s = document.querySelector('select[data-text-sample]'); s.value = 'sequence'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.waitFrame('textimport', `!document.querySelector('[data-action="text-apply"]').disabled`);
    await app.frame('textimport', `(document.querySelector('[data-action="text-apply"]').click(), 1)`);
    await app.main.waitFor(`window.__myumlmaker.api.diagram()?._type === 'UMLSequenceDiagram'`);
    assert.ok(await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLMessageView').length >= 4`));
  } },
  { group: '파일', name: 'StarUML .mdj 와 Mermaid 파일을 끌어다 놓으면 열림', async run(app) {
    await freshProject(app);
    const mdj = fs.readFileSync(path.join(root, 'samples', 'staruml-sample.mdj'), 'utf8');
    await app.main.eval(`(async () => {
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(mdj)}], 'sample.mdj', { type: 'application/json' }));
      for (const type of ['dragenter', 'dragover', 'drop']) document.body.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 700, clientY: 400 }));
      await new Promise((r) => setTimeout(r, 800));
      return 1;
    })()`);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'the StarUML project replaced the current one (one project at a time)');
    assert.ok(await W(app, 'M.allDiagrams(a.activeDoc().project).length >= 2'));
    await noError(app, 'drop');
  } },
  { group: '파일', name: '저장 텍스트를 다시 열면 같은 프로젝트', async run(app) {
    await freshSample(app);
    const text = await W(app, 'a.activeDoc().text()');
    await W(app, `(a.openContent('copy.myuml', ${JSON.stringify(await W(app, 'a.activeDoc().text()'))}), 1)`);
    await sleep(300);
    const again = await W(app, 'a.activeDoc().text()');
    assert.equal(JSON.parse(again).project._id, JSON.parse(text).project._id);
    assert.deepEqual(JSON.parse(again).project, JSON.parse(text).project);
  } },
  { group: '마인드맵', name: 'MindManager 방식: Tab=하위 토픽, Enter=같은 수준 토픽, 자동 배치(겹침 없음), 표식·과제 정보, +/− 접기, 아래로(조직도) 배치 (실제 키·클릭)', async run(app) {
    // Keys go to the canvas only without a popup in front (the welcome popup, shown shortly after the start, when run alone).
    await app.main.waitFor(`Boolean(document.querySelector('.web-popup-welcome'))`, { timeout: 2500 }).catch(() => {});
    await closeFrames(app);
    await fromTemplateTile(app, 'mindmap');
    await sleep(800);
    const topics = () => W(app, `api.diagram().ownedViews.filter((v) => v._type === 'MMNodeView').map((v) => { const e = a.activeDoc().index.get(v.model.$ref); return { id: v._id, name: e.name, parent: a.activeDoc().index.parent(e._id)?.name ?? null, x: v.left, y: v.top }; })`);
    const central = (await topics()).find((t) => t.parent === '마인드맵1' || t.name === '프로젝트');
    const box = await app.main.eval(`(() => { const r = document.querySelector('#view-host g[data-view="${central.id}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await app.main.realClick(box.x, box.y);
    await sleep(200);
    assert.deepEqual(await W(app, 'w.state.selection.ids'), [central.id], 'the click selects the central topic');
    const name = async (text) => { await sleep(250); await app.main.type(text); await app.main.key('Enter'); await sleep(250); };
    await app.main.key('Tab'); await name('예산');
    await app.main.key('Enter'); await name('일정 계획');
    await app.main.key('Tab'); await name('1분기');
    await app.main.key('Enter'); await name('2분기');
    const list = await topics();
    const parent = (n) => list.find((t) => t.name === n)?.parent;
    assert.deepEqual(['예산', '일정 계획', '1분기', '2분기'].map(parent), [central.name, central.name, '일정 계획', '일정 계획'], JSON.stringify(list));
    const overlaps = await app.main.eval(`(() => { const r = [...document.querySelectorAll('#view-host g[data-view].node-view .hit')].map((e) => e.getBoundingClientRect()); let n = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const p = r[i], q = r[j]; if (p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) n++; } return n; })()`);
    assert.equal(overlaps, 0, 'the map is laid out without overlaps');
    // Markers and task information from the properties panel.
    const plan = list.find((t) => t.name === '일정 계획');
    await W(app, `(a.select([${JSON.stringify(plan.id)}], { primary: ${JSON.stringify(plan.id)} }), 1)`);
    await sleep(250);
    for (const [field, value] of [['priority', 'p1'], ['progress', 'pct50'], ['marker', 'flag'], ['shape', 'hexagonal']]) {
      await app.main.eval(`(() => { const s = document.querySelector('select[data-field="${field}"]'); s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await sleep(120);
    }
    await app.main.eval(`(() => { const i = document.querySelector('input[data-field="resource"]'); i.value = '권수호'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(250);
    const drawn = await app.main.eval(`(() => { const g = document.querySelector('#view-host g[data-view="${plan.id}"]'); return { circles: g.querySelectorAll('circle').length, text: g.textContent, hexagon: Boolean(g.querySelector('path')) }; })()`);
    assert.ok(drawn.circles >= 4 && drawn.text.includes('권수호') && drawn.text.startsWith('1'), `priority, progress, flag, +/− and the owner are drawn ${JSON.stringify(drawn)}`);
    // The +/− of 일정 계획: a real click collapses its branch (the badge counts the hidden topics), another opens it.
    const kids = list.filter((t) => t.parent === '일정 계획').map((t) => t.id);
    const drawnKids = () => app.main.eval(`${JSON.stringify(kids)}.filter((id) => document.querySelector('#view-host g[data-view="' + id + '"]')).length`);
    assert.equal(await drawnKids(), 2);
    const toggleAt = () => app.main.eval(`(() => { const r = document.querySelector('#view-host g[data-view="${plan.id}"] [data-mm-toggle]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    let p = await toggleAt();
    await app.main.realClick(p.x, p.y);
    await sleep(350);
    assert.equal(await drawnKids(), 0, 'its two subtopics are hidden');
    assert.equal(await app.main.eval(`document.querySelector('#view-host g[data-view="${plan.id}"] [data-mm-toggle] text').textContent`), '2');
    p = await toggleAt();
    await app.main.realClick(p.x, p.y);
    await sleep(350);
    assert.equal(await drawnKids(), 2, 'shown again');
    // Map layout: down (org chart).
    await W(app, '(a.select([]), 1)');
    await sleep(200);
    await app.main.eval(`(() => { const s = document.querySelector('select[data-field="mindLayout"]'); s.value = 'down'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(200);
    await W(app, `(w.run('mmRelayout'), 1)`);
    await sleep(400);
    const down = await topics();
    const c = down.find((t) => t.id === central.id);
    assert.ok(down.filter((t) => t.id !== central.id).every((t) => t.y > c.y), 'every topic below the central one');
    await noError(app, 'mind map');
  } },
  { group: '마인드맵', name: '개요 탭: 들여쓴 글로 하위 토픽 추가, 줄을 누르면 토픽 선택, ▸로 접기(맵에서도); 관계선·경계', async run(app) {
    await closeFrames(app);
    await fromTemplateTile(app, 'mindmap');
    await sleep(800);
    const central = await W(app, `api.diagram().ownedViews.find((v) => v._type === 'MMNodeView' && a.activeDoc().index.parent(v.model.$ref)?._type !== 'MMNode')._id`);
    await W(app, `(a.select([${JSON.stringify(central)}], { primary: ${JSON.stringify(central)} }), 1)`);
    await sleep(200);
    await app.main.click('[data-editor-tab="outline"]');
    await sleep(300);
    const before = await app.main.eval(`document.querySelectorAll('.outline-row').length`);
    await app.main.eval(`(() => { const t = document.querySelector('[data-outline-text]'); t.value = '- 마케팅\\n  - SNS 광고\\n  - 이메일\\n- 고객 지원'; return 1; })()`);
    await app.main.click('[data-outline-add]');
    await sleep(500);
    const rows = await app.main.eval(`[...document.querySelectorAll('.outline-row')].map((r) => [r.querySelector('.outline-name').textContent, parseInt(r.style.paddingLeft, 10)])`);
    assert.equal(rows.length, before + 4, JSON.stringify(rows));
    const at = (name) => rows.find(([n]) => n === name)[1];
    assert.ok(at('SNS 광고') > at('마케팅') && at('마케팅') === at('고객 지원'), 'nested as written');
    await app.main.eval(`(() => { [...document.querySelectorAll('.outline-row')].find((r) => r.textContent.includes('이메일')).click(); return 1; })()`);
    await sleep(250);
    assert.equal(await W(app, `a.activeDoc().index.get(api.diagram().ownedViews.find((v) => v._id === w.state.selection.ids[0]).model.$ref).name`), '이메일', 'a row selects its topic');
    await app.main.eval(`(() => { [...document.querySelectorAll('.outline-row')].find((r) => r.textContent.includes('마케팅')).querySelector('[data-outline-toggle]').click(); return 1; })()`);
    await sleep(400);
    assert.equal(await app.main.eval(`document.querySelectorAll('.outline-row').length`), before + 2, 'collapsed in the outline');
    assert.equal(await W(app, `a.activeDoc().index.get(api.diagram().ownedViews.find((v) => v._id === w.state.selection.ids[0]).model.$ref).name`), '마케팅', 'the selection moves to the collapsed topic');
    await noError(app, 'outline collapse');
    // A relationship arrow and a boundary from the toolbox.
    const tool = (id) => `w.domain.toolboxFor('MMMindmapDiagram').flatMap((g) => g[3]).find((t) => t.id === '${id}')`;
    const view = (name) => W(app, `api.diagram().ownedViews.find((v) => v._type === 'MMNodeView' && a.activeDoc().index.get(v.model.$ref).name === ${JSON.stringify(name)})._id`);
    await W(app, `(a.createEdgeBetween(${tool('MMRelationship')}, ${JSON.stringify(await view('목표'))}, ${JSON.stringify(await view('위험'))}), 1)`);
    await W(app, `(a.createNodeAt(${tool('MMBoundary')}, { x: 20, y: 20, w: 200, h: 120 }), 1)`);
    await sleep(300);
    await app.main.key('Escape');
    assert.deepEqual(await W(app, `api.diagram().ownedViews.map((v) => v._type).filter((t) => /Relationship|Boundary/.test(t)).sort()`), ['MMBoundaryView', 'MMRelationshipView']);
    await noError(app, 'relationship and boundary');
    // The new boundary opened its name for editing: finish it so the next case starts clean.
    await W(app, '(w.state.view?.finishEdit?.(), a.select([]), 1)');
    await sleep(200);
  } },
  { group: '애자일·UX', name: '사용자 스토리 맵·고객 여정 지도: 시작 페이지 템플릿, 예제 프로젝트의 완성된 다이어그램, 오류 없이 그려짐', async run(app) {
    await closeFrames(app);
    for (const [template, type, min] of [['storymap', 'UserStoryMapDiagram', 7], ['journey', 'CustomerJourneyDiagram', 15]]) {
      await fromTemplateTile(app, template);
      await sleep(700);
      assert.equal(await W(app, 'api.diagram()?._type'), type, `${template}: the template opens its diagram`);
      const drawn = await app.main.eval(`document.querySelectorAll('#view-host g[data-view]').length`);
      assert.ok(drawn >= min, `${template}: ${drawn} views drawn`);
      await noError(app, template);
    }
    await freshSample(app);
    for (const type of ['UserStoryMapDiagram', 'CustomerJourneyDiagram']) {
      const id = await W(app, `[...a.activeDoc().index.byId.values()].find((e) => e._type === ${JSON.stringify(type)})._id`);
      await W(app, `(a.openDiagram(${JSON.stringify(id)}), 1)`);
      await sleep(400);
      assert.ok(await app.main.eval(`document.querySelectorAll('#view-host g[data-view]').length`) > 15, `${type}: the sample diagram is drawn`);
    }
    await noError(app, 'agile samples');
  } },
  { group: 'BPMN', name: '프로세스 시뮬레이션: 도구 › BPMN 프로세스 시뮬레이션, 한 단계·재생으로 끝까지, 100회 분석(완료 100), 닫기', async run(app) {
    await closeFrames(app);
    await fromTemplateTile(app, 'bpmn');
    await sleep(700);
    await W(app, `(w.run('bpmnSimulate'), 1)`);
    await sleep(300);
    const status = () => app.main.eval(`document.querySelector('[data-sim-status]')?.textContent ?? ''`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.sim-bar'))`), 'the simulation bar');
    assert.equal(await app.main.eval(`document.querySelectorAll('.canvas-sim .sim-token').length`), 1, 'a token on the start event');
    await app.main.click('[data-sim="step"]');
    await sleep(900);
    assert.match(await status(), /단계 1/);
    await app.main.click('[data-sim="play"]');
    await app.main.waitFor(`/완료/.test(document.querySelector('[data-sim-status]')?.textContent ?? '')`, { timeout: 15000, message: 'the run completes' });
    await app.main.click('[data-sim="analyse"]');
    await sleep(400);
    assert.match(await status(), /100회: 완료 100 · 교착 0/);
    assert.ok(await app.main.eval(`document.querySelectorAll('.canvas-sim text').length`) >= 5, 'every element shows the share of runs that reached it');
    await app.main.click('[data-sim="close"]');
    await sleep(200);
    assert.ok(await app.main.eval(`!document.querySelector('.sim-bar') && !document.querySelector('.canvas-sim').innerHTML`), 'closed and cleared');
    await noError(app, 'simulation');
  } },
  { group: '보기', name: '다이어그램 색 구성·선 모양·언어를 바꿔도 오류 없음', async run(app) {
    await freshSample(app);
    for (const theme of ['pastel', 'blueprint', 'dark', 'classic']) { await W(app, `(a.updateSettings({ diagramTheme: ${JSON.stringify(theme)} }), 1)`); await sleep(150); }
    for (const s of ['oblique', 'curve', 'roundRect', 'rectilinear']) { await W(app, `(a.updateSettings({ defaultLineStyle: ${JSON.stringify(s)} }), 1)`); await sleep(100); }
    await W(app, `(w.run('language'), 1)`);
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="model"] span').textContent`), 'Model');
    await W(app, `(w.run('language'), 1)`);
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="model"] span').textContent`), '모델');
    await noError(app, 'themes');
  } },
  { group: '보기', name: '프레젠테이션: 다이어그램을 차례로, Esc 로 끝', async run(app) {
    await freshSample(app);
    await W(app, `(a.startPresentation(), 1)`);
    await sleep(400);
    assert.ok(await app.main.eval(`!document.querySelector('#presentation').hidden && Boolean(document.querySelector('#presentation svg'))`));
    await W(app, `(a.presentStep(1), 1)`);
    await W(app, `(a.stopPresentation(), 1)`);
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('#presentation').hidden`));
  } },
  { group: '도움말', name: '시작 페이지의 사용 설명서·튜토리얼 문서·튜토리얼 동영상 단추 → 문서 보기 페이지를 새 탭으로 (장, 언어, 찾기; 동영상이 없으면 안내)', async run(app) {
    await closeFrames(app);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const viewerTab = async (kind, ready) => {
      const target = await waitTarget(app.port, (item) => item.type === 'page' && item.url.includes(`viewer=${kind}`), 15000);
      const page = await new Page(target).open();
      await page.waitFor(`Boolean(window.__myumlmakerViewer) && (${ready})`, { timeout: 15000, message: `the ${kind} tab is drawn` });
      return page;
    };
    const docReady = `document.querySelectorAll('[data-viewer-chapter] option').length > 5 && Boolean(document.querySelector('.viewer-frame')?.contentDocument?.querySelector('h1'))`;
    // User's guide.
    await app.main.click('.start-hero [data-start="guide"]');
    const guide = await viewerTab('guide', docReady);
    assert.match(await guide.eval('document.title'), /MyUMLMaker — 사용 설명서/);
    assert.match(await guide.eval(`document.querySelector('.viewer-frame').contentDocument.querySelector('h1').textContent`), /MyUMLMaker 사용 설명서/);
    await guide.eval(`(() => { const s = document.querySelector('[data-viewer-chapter]'); s.value = s.options[8].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(300);
    assert.ok(await guide.eval(`document.querySelector('.viewer-frame').contentWindow.scrollY > 200`), 'a chapter can be picked');
    await guide.eval(`(window.__myumlmakerViewer.runFind('StarUML', true), 1)`);
    assert.match(await guide.eval(`document.querySelector('[data-find-count]').textContent`), /^1\/\d+$/, 'find in page');
    await guide.click('[data-viewer="lang"][data-value="en"]');
    await guide.waitFor(`/User's Guide/i.test(document.querySelector('.viewer-frame').contentDocument?.querySelector('h1')?.textContent ?? '')`, { timeout: 10000, message: 'the English guide' });
    // Choosing it again reuses the tab.
    await app.main.click('.start-hero [data-start="guide"]');
    await sleep(1200);
    assert.equal((await listTargets(app.port)).filter((item) => item.type === 'page' && item.url.includes('viewer=guide')).length, 1, 'one guide tab');
    guide.close();
    // Tutorial document.
    await app.main.click('.start-hero [data-start="tutorial-doc"]');
    const tutorial = await viewerTab('tutorial', docReady);
    assert.equal(await tutorial.eval(`document.querySelector('.viewer-frame').contentDocument.querySelectorAll('h3').length`), await W(app, 'w.domain.tutorialSteps()'), 'every tutorial step');
    tutorial.close();
    // Tutorial video: not copied into the web build by default → how to make it, no error.
    await app.main.click('.start-hero [data-start="tutorial-video"]');
    const hasVideo = fs.existsSync(path.join(root, 'dist', 'docs', 'video', 'MyUMLMaker-Tutorial.mp4'));
    const video = await viewerTab('video', hasVideo ? `document.querySelector('video').readyState >= 1` : `!document.querySelector('[data-video-message]').hidden && /tutorial:video/.test(document.querySelector('[data-video-message]').textContent)`);
    if (!hasVideo) assert.match(await video.eval(`document.querySelector('[data-video-message]').textContent`), /npm run tutorial:video/);
    else assert.ok(await video.eval(`document.querySelector('video').duration > 60`));
    video.close();
    for (const item of (await listTargets(app.port)).filter((x) => x.type === 'page' && x.url.includes('viewer='))) await fetch(`http://127.0.0.1:${app.port}/json/close/${item.id}`).catch(() => {});
    await noError(app, 'document tabs');
  } },
  { group: '도움말', name: '튜토리얼의 모든 단계가 오류 없이 대상 요소를 그림, 강조 사각형은 늘 창 안쪽', async run(app) {
    await closeFrames(app);
    await W(app, `(a.startTutorial(), 1)`);
    const count = await W(app, 'w.domain.tutorialSteps()');
    const missing = [];
    const outside = [];
    for (let i = 0; i < count; i += 1) {
      await app.main.waitFor(`window.__myumlmaker.tutorial()?.state().index === ${i} && !window.__myumlmaker.tutorial().state().busy`, { timeout: 20000 });
      const step = await W(app, 'w.tutorial().state().id');
      if (!await app.main.eval(`Boolean(document.querySelector('.tour-outline'))`)) missing.push(step);
      // The whole outline (its border) inside the window, also for targets at an edge of the window.
      const box = await app.main.eval(`(() => { const o = document.querySelector('.tour-outline'); if (!o) return null; o.style.transition = 'none'; const r = o.getBoundingClientRect(); return { l: r.left, t: r.top, r: innerWidth - r.right, b: innerHeight - r.bottom, iw: innerWidth, ih: innerHeight }; })()`);
      if (box && Math.min(box.l, box.t, box.r, box.b) < 0) outside.push(`${step} ${JSON.stringify(box)}`);
      if (i < count - 1) await app.main.eval(`(document.querySelector('[data-tour="next"]').click(), 1)`);
    }
    await W(app, `(w.tutorial().stop(), 1)`);
    await sleep(500);
    assert.deepEqual(missing, [], 'every step outlines its target');
    assert.ok(!outside.length, `the outline never runs past an edge of the window: ${outside.join(' · ')}`);
    await noError(app, 'tutorial');
  } },
  { group: '드롭다운', name: '모든 드롭다운에 아이콘: 선택 목록(속성·스타일·설정 팝업)과 입력 제안 목록(스테레오타입), 키보드·마우스로 고름, 마인드맵 토픽에는 스테레오타입 없음', async run(app) {
    await freshSample(app);
    const views = `(() => { const all = []; const walk = (vs) => { for (const x of vs ?? []) { all.push(x); walk(x.subViews); } }; walk(api.diagram().ownedViews); return all; })()`;
    // Earlier cases may leave another editor tab open: the Properties tab first.
    const id = await W(app, `(() => { w.state.rightTab = 'properties'; const v = ${views}.find((x) => x._type === 'UMLClassView'); a.select([v._id]); return v.model.$ref; })()`);
    await sleep(300);
    // A real press on a control, scrolled into view first (the window may be small).
    const press = async (selector) => { const where = await app.main.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return JSON.stringify({ tab: window.__myumlmaker.state.rightTab, right: window.__myumlmaker.state.settings.showRightPanel, focus: document.activeElement?.outerHTML.slice(0, 90), fields: [...document.querySelectorAll('#editors [data-field]')].map((x) => x.dataset.field).slice(0, 8), sel: window.__myumlmaker.state.selection.ids.length }); e.scrollIntoView({ block: 'center', behavior: 'instant' }); return ''; })()`); assert.equal(where, '', `${selector} is on the page`); await sleep(100); const c = await app.main.center(selector); await app.main.realClick(c.x, c.y); };
    const listInfo = () => app.main.eval(`(() => { const l = document.querySelector('.dd-list'); if (!l) return null; const items = [...l.querySelectorAll('.dd-item')]; const r = l.getBoundingClientRect(); return { n: items.length, icons: items.filter((i) => i.querySelector('svg.icon')).length, chosen: l.querySelector('.dd-item.chosen')?.dataset.value ?? null, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
    const field = (key) => W(app, `a.activeDoc().index.get(${JSON.stringify(id)}).${key} ?? null`);
    // Every select of the window is one of ours and shows its option's icon.
    const plain = await app.main.eval(`[...document.querySelectorAll('select')].filter((s) => !s.classList.contains('dd-select') || !s.style.backgroundImage.includes('svg')).map((s) => s.outerHTML.slice(0, 80))`);
    assert.deepEqual(plain, [], 'every select shows an icon');
    // A select: the list opens on a press, every item has an icon, ↓ Enter picks.
    await press('#editors select[data-field="visibility"]');
    await sleep(300);
    let info = await listInfo();
    assert.ok(info && info.n >= 4 && info.icons === info.n && info.inside, `the list has an icon on every item ${JSON.stringify(info)}`);
    const before = (await field('visibility')) ?? 'public';
    assert.equal(info.chosen, before, 'the current value is marked');
    await app.main.key('ArrowDown');
    await app.main.key('Enter');
    await sleep(300);
    assert.equal(await listInfo(), null, 'Enter closes the list');
    assert.notEqual(await field('visibility'), before, 'and sets the next value');
    // A suggestion list: icons, filtered while typing, a click picks.
    await press('#editors input[data-field="stereotype"]');
    await sleep(300);
    info = await listInfo();
    assert.ok(info && info.n > 10 && info.icons === info.n, `the stereotype suggestions have icons ${JSON.stringify(info)}`);
    await app.main.type('bound');
    await sleep(200);
    const item = await app.main.center('.dd-list .dd-item[data-value="boundary"]');
    await app.main.realClick(item.x, item.y);
    await sleep(400);
    assert.equal(await field('stereotype'), 'boundary', 'a click on a suggestion sets it');
    // The next click is not lost (the box let go of the focus): the Style tab opens.
    await press('[data-editor-tab="style"]');
    await sleep(300);
    await press('#editors select[data-style="stereotypeDisplay"]');
    await sleep(200);
    assert.equal((await listInfo())?.icons, 4, 'stereotype display: four items with icons');
    await app.main.key('Escape');
    await sleep(200);
    assert.equal(await listInfo(), null, 'Esc closes it');
    // A popup (a frame here, a window on the desktop): Settings › Font › weight.
    await W(app, `(w.run('settings'), 1)`);
    await app.waitFrame('settings', `Boolean(document.querySelector('.popup'))`);
    await app.frame('settings', `(document.querySelector('[data-action="tab"][data-value="font"]').click(), 1)`);
    await sleep(300);
    await app.frame('settings', `(() => { const s = document.querySelector('select[data-select="fontWeight"]'); s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); return 1; })()`);
    await sleep(300);
    assert.ok(await app.frame('settings', `(() => { const items = [...document.querySelectorAll('.dd-list .dd-item')]; return items.length >= 4 && items.every((i) => i.querySelector('svg')); })()`), 'a popup has the same dropdown');
    await closeFrames(app);
    // A mind map topic has no stereotype field (its shape never shows one).
    await W(app, `(a.openDiagram(M.allDiagrams(a.activeDoc().project).find((d) => d._type === 'MMMindmapDiagram')._id), 1)`);
    await sleep(300);
    await W(app, `(a.select([${views}.find((x) => x._type === 'MMNodeView')._id]), 1)`);
    await press('[data-editor-tab="properties"]');
    await sleep(300);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#editors [data-field="stereotype"]'))`), false, 'no stereotype field on a mind map topic');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#editors [data-field="shape"]'))`), true, 'its own fields are there');
    await noError(app, 'dropdowns');
  } },
  { group: '메뉴', name: '메뉴 막대의 모든 항목(하위 메뉴 포함)이 오류 없이 실행됨: 클래스·관계선·마인드맵 토픽을 골라 두고 하나씩', async run(app) {
    // Every command of every menu and submenu, once each.
    const ids = await W(app, `(() => {
      const { MENUS, SUBMENUS } = w.menus;
      const out = []; const seen = new Set();
      const walk = (list, path) => { for (const id of list) {
        if (id === '-') continue;
        if (typeof id === 'object') { walk(SUBMENUS[id.sub].items, [...path, id.sub]); continue; }
        if (!seen.has(id)) { seen.add(id); out.push({ id, path: path.join(' › ') }); }
      } };
      for (const [name, list] of Object.entries(MENUS)) walk(list, [name]);
      return out;
    })()`);
    assert.ok(ids.length > 120, `the menus have many commands (${ids.length})`);
    // Leaves the app, or needs the desktop or a native file dialog the browser has no answer for.
    const SKIP = new Set(['exit', 'open', 'dbOpen', 'dbSave', 'compareFile', 'importMdj', 'importXmi', 'importFragment', 'openFolder']);
    const settings = await W(app, `JSON.stringify(w.state.settings)`);
    const views = `(() => { const all = []; const walk = (vs) => { for (const x of vs ?? []) { all.push(x); walk(x.subViews); } }; walk(api.diagram().ownedViews); return all; })()`;
    // Each state puts the app where more commands apply: a class, a line, two classes, a mind map topic, nothing.
    const states = [
      ['class', `(() => { a.openDiagram(M.allDiagrams(a.activeDoc().project).find((d) => d._type === 'UMLClassDiagram')._id); const v = ${views}.find((x) => x._type === 'UMLClassView'); a.select([v._id]); return 1; })()`],
      ['two classes', `(() => { a.openDiagram(M.allDiagrams(a.activeDoc().project).find((d) => d._type === 'UMLClassDiagram')._id); const v = ${views}.filter((x) => x._type === 'UMLClassView').slice(0, 3); a.select(v.map((x) => x._id)); return 1; })()`],
      ['line', `(() => { a.openDiagram(M.allDiagrams(a.activeDoc().project).find((d) => d._type === 'UMLClassDiagram')._id); const v = ${views}.find((x) => M.isEdgeView(x)); a.select([v._id]); return 1; })()`],
      ['mind map topic', `(() => { a.openDiagram(M.allDiagrams(a.activeDoc().project).find((d) => d._type === 'MMMindmapDiagram')._id); const v = ${views}.find((x) => x._type === 'MMNodeView'); a.select([v._id]); return 1; })()`],
      ['BPMN', `(() => { a.openDiagram(M.allDiagrams(a.activeDoc().project).find((d) => d._type === 'BPMNDiagram')._id); a.select([]); return 1; })()`],
      ['nothing', `(() => { a.select([]); return 1; })()`],
      // Undo, redo, clear bends and clear recent need history, a bent line and recent files.
      ['after an edit', `(() => { a.change('op.edit', (p) => { p.name = 'Walk'; }); return 1; })()`],
      ['after an undo', `(() => { a.undo(); return 1; })()`],
      ['bent line', `(() => { a.openDiagram(M.allDiagrams(a.activeDoc().project).find((d) => d._type === 'UMLClassDiagram')._id); const v = ${views}.find((x) => M.isEdgeView(x)); a.change('op.edit', (p, d) => { const e = M.findView(d, v._id); e.points = [{ x: 300, y: 40 }]; }); a.select([v._id]); return 1; })()`],
      ['recent files', `(() => { w.state.recent = [{ path: 'walk.myuml', title: 'Walk', web: true }]; return 1; })()`],
    ];
    const ran = []; const failed = []; const neverEnabled = [];
    for (const { id, path } of ids) {
      if (SKIP.has(id)) continue;
      let done = false;
      await freshSample(app);
      for (const [label, setup] of states) {
        await W(app, setup);
        await sleep(120);
        if (!(await W(app, `w.menus.enabled(${JSON.stringify(id)})`))) continue;
        app.main.errors.length = 0;
        await W(app, `(Promise.resolve(w.run(${JSON.stringify(id)})).catch((e) => { window.__menuWalkError = String(e?.stack ?? e); }), 1)`);
        await sleep(450);
        const problem = await app.main.eval(`(() => { const e = window.__menuWalkError; window.__menuWalkError = null; const f = document.querySelector('.web-popup-error'); return e || (f && getComputedStyle(f).visibility !== 'hidden' ? (f.querySelector('iframe')?.contentDocument?.querySelector('.popup')?.innerText ?? 'error popup').slice(0, 400) : null); })()`);
        const errors = [...app.main.errors];
        if (problem || errors.length) failed.push(`${path} › ${id} [${label}]: ${problem ?? errors[0]}`);
        ran.push(id);
        done = true;
        // Undo what it opened or started, and the settings it changed.
        await W(app, `(() => { try { w.tutorial()?.stop?.(); } catch {} try { a.stopPresentation(); } catch {} try { a.closeDocFrames(); } catch {} a.updateSettings(${settings}, { quiet: true }); return 1; })()`).catch(() => {});
        await app.main.key('Escape').catch(() => {});
        await closeFrames(app);
        break;
      }
      if (!done) neverEnabled.push(`${path} › ${id}`);
    }
    console.log(`      메뉴 항목 ${ran.length}개 실행, 건너뜀 ${[...SKIP].length}개, 어느 상태에서도 꺼져 있음 ${neverEnabled.length}개${neverEnabled.length ? `: ${neverEnabled.join(', ')}` : ''}`);
    assert.deepEqual(failed, [], 'every menu command runs without an error');
    assert.ok(ran.length > 110, `most commands ran (${ran.length})`);
  } },
];

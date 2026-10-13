// Web build end-to-end cases (headless Edge/Chrome). Popups are frames here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { root } from './harness.mjs';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const m = (app, expression) => app.main.eval(`(() => { const k = window.__mycad; return ${expression}; })()`);
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
    const p = ${JSON.stringify(point ?? { x: 700, y: 500 })};
    const target = document.elementFromPoint(p.x, p.y) ?? document.body;
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: p.x, clientY: p.y }));
    await new Promise((r) => setTimeout(r, 600));
    return 1;
  })()`);
}

const closeFrames = (app) => app.main.eval(`(() => { for (const kind of ['settings','about','confirm','error','progress','recent','print','theme','part','array','stl','solid','coverage','menu']) window.__mycad.popups.close(kind); return 1; })()`);
const fresh = async (app) => {
  await closeFrames(app);
  await m(app, `(k.actions.toggle3d(false), k.actions.setTool('select'), k.actions.newDrawing(), k.actions.updateSettings({ language: 'ko', snapObject: false }), (() => { const vp = k.actions.ensureViewport(k.actions.activeDoc()); vp.cx = 0; vp.cy = 0; vp.zoom = 2; k.actions.drawCanvas(); })(), 1)`);
};
const at = (app, x, y) => m(app, `(() => { const r = document.querySelector('#cad-canvas').getBoundingClientRect(); const s = k.actions.activeDoc().vp.toScreen({ x: ${x}, y: ${y} }); return { x: r.left + s.x, y: r.top + s.y }; })()`);

export const cases = [
  { group: '페이지', name: '제목에 프로그램 이름과 버전, 아이콘', async run(app) {
    assert.match(await app.main.eval('document.title'), new RegExp(`^MyCAD V${VERSION.split('.').slice(0, 2).join('\\.')}`));
    assert.equal(await app.main.eval(`document.querySelector('link[rel="icon"]').getAttribute('href')`), './icon.png');
  } },
  { group: '툴바', name: '모든 버튼에 툴팁, 투명도 설정 없음', async run(app) {
    assert.equal(await app.main.eval(`[...document.querySelectorAll('button')].filter((b) => !(b.title || '').trim()).length`), 0);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#transparency-range, .opacity-control'))`), false);
  } },
  { group: '메뉴', name: '메뉴: 한 줄, 아이콘+이름, 머리글 없이 항목만 (프레임)', async run(app) {
    await app.main.click('[data-menu="draw"]');
    await app.waitFrame('menu', `document.querySelectorAll('.menu-item').length > 5`);
    const info = await app.frame('menu', `({ lefts: new Set([...document.querySelectorAll('.menu-item')].map((i) => Math.round(i.getBoundingClientRect().left))).size, icons: [...document.querySelectorAll('.menu-item')].every((i) => i.querySelector('.menu-icon svg')), head: document.querySelector('.popup-menu').dataset.title, noHeader: !document.querySelector('.menu-head') })`);
    assert.equal(info.lefts, 1);
    assert.ok(info.icons);
    assert.equal(info.head, '그리기');
    assert.ok(info.noHeader, 'only the items, no header');
    await app.main.eval(`document.querySelector('.web-popup-shield').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1`);
    await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
  } },
  { group: '그리기', name: '마우스로 선과 원 그리기, 실행 취소', async run(app) {
    await fresh(app);
    await app.main.click('[data-tool="line"]');
    for (const [x, y] of [[0, 0], [60, 0]]) { const p = await at(app, x, y); await app.main.realClick(p.x, p.y); }
    await app.main.key('Escape');
    await app.main.click('[data-tool="circle"]');
    for (const [x, y] of [[0, 40], [20, 40]]) { const p = await at(app, x, y); await app.main.realClick(p.x, p.y); }
    await app.main.key('Escape');
    assert.deepEqual(await m(app, 'k.actions.activeDrawing().entities.map((e) => e.type)'), ['line', 'circle']);
    await app.main.click('#toolbar [data-command="undo"]');
    assert.equal(await m(app, 'k.actions.activeDrawing().entities.length'), 1);
  } },
  { group: '파일', name: '끌어다 놓기: .mcad 열기, .dxf 가져오기, 이미지 배경, 글 → 문자', async run(app) {
    await fresh(app);
    const tabs = await m(app, 'k.state.docs.length');
    await drop(app, [{ name: 'web.mcad', text: JSON.stringify({ format: 'mycad', version: 1, drawing: { title: '웹 도면', entities: [{ type: 'circle', cx: 0, cy: 0, r: 4 }] } }) }]);
    assert.equal(await m(app, 'k.state.docs.length'), tabs + 1);
    assert.equal(await m(app, 'k.actions.activeDrawing().title'), '웹 도면');
    await drop(app, [{ name: 'part.dxf', text: ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '5', '21', '5', '0', 'ENDSEC', '0', 'EOF'].join('\n') }]);
    assert.equal(await m(app, 'k.actions.activeDoc().format'), 'dxf');
    await drop(app, [{ name: 'bg.png', base64: iconB64, type: 'image/png' }]);
    await app.main.waitFor(`document.querySelector('.canvas-image').classList.contains('has-image')`);
    await drop(app, [], null, '웹에서 끌어온 글');
    assert.equal(await m(app, 'k.actions.activeDrawing().entities.at(-1).text'), '웹에서 끌어온 글');
    await m(app, 'k.actions.removeBackground().then(() => 1)');
  } },
  { group: '편집', name: '클립보드 복사/붙여넣기 (Ctrl+C / Ctrl+V)', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 5 })), k.actions.select([k.actions.activeDrawing().entities[0].id]), 1)`);
    await app.main.click('#cad-canvas');
    await app.main.key('c', 2);
    await sleep(300);
    assert.match(await m(app, 'k.state.clipboard'), /^MyCAD-Clipboard/);
    await app.main.key('v', 2);
    await sleep(300);
    assert.equal(await m(app, 'k.actions.activeDrawing().entities.length'), 2);
  } },
  { group: '팝업', name: '설정 · 정보 · 부품 · 배열 · STL · 인쇄 프레임: 스크롤 없음, 한 줄 정렬', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.part', (d) => k.drawingModule.addEntity(d, 'part', { kind: 'flange', x: 0, y: 0 })), k.actions.select([k.actions.activeDrawing().entities[0].id]), 1)`);
    const check = async (kind, opener) => {
      await app.main.eval(`(${opener}, 1)`);
      await app.waitFrame(kind);
      await sleep(200);
      const result = await app.frame(kind, `({
        scroll: [...document.querySelectorAll('*')].filter((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1 && e.tagName !== 'SELECT' && e.tagName !== 'TEXTAREA').length,
        edges: (() => { const g = new Map(); for (const c of document.querySelectorAll('.row > .row-control')) { const f = c.firstElementChild; if (!f || !c.getBoundingClientRect().width) continue; const key = c.closest('.part-fields, .array-fields, .stl-fields, .print-options, .error-view, .color-grid, .settings-page, .popup-body'); if (!g.has(key)) g.set(key, new Set()); g.get(key).add(Math.round(f.getBoundingClientRect().left)); } return [...g.values()].map((s) => s.size); })(),
      })`);
      assert.equal(result.scroll, 0, `${kind}: no scroll`);
      assert.ok(result.edges.every((n) => n === 1), `${kind}: aligned ${JSON.stringify(result.edges)}`);
      await closeFrames(app);
    };
    await check('settings', `window.__mycad.run('settings')`);
    await check('about', `window.__mycad.run('about')`);
    await check('part', `window.__mycad.actions.openPartDialog({ kind: 'gear' })`);
    await check('array', `window.__mycad.run('array')`);
    await check('stl', `window.__mycad.run('exportStl')`);
    await check('print', `window.__mycad.run('print')`);
    await check('solid', `window.__mycad.actions.openSolidDialog({ kind: 'cone' })`);
    await check('coverage', `window.__mycad.run('freecadCoverage')`);
  } },
  { group: '3D 솔리드', name: '솔리드 넣기 · 불리언 · 3D 보기 (WebGL) · FreeCAD .FCStd/.step 끌어다 놓기', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; const b = a.insertSolid('box', { length: 20, width: 20, height: 20 }, {}); const c = a.insertSolid('sphere', { radius: 12 }, { x: 20, y: 20, z: 20 }); a.select([b.id, c.id]); a.booleanSelection('common'); return 1; })()`);
    const solid = await m(app, `k.actions.activeDrawing().entities[0]`);
    assert.equal(solid.kind, 'boolean');
    await m(app, `k.actions.toggle3d(true).then(() => 1)`);
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).parts3d.length, 1);
    await m(app, `(k.actions.toggle3d(false), 1)`);
    const dir = path.join(root, 'samples', 'freecad');
    const docs = await m(app, 'k.state.docs.length');
    await drop(app, ['freecad-assembly.FCStd', 'freecad-pulley.step'].map((name) => ({ name, base64: fs.readFileSync(path.join(dir, name)).toString('base64') })));
    assert.equal(await m(app, 'k.state.docs.length'), docs + 2, 'two new tabs');
    const kinds = await m(app, `k.state.docs.at(-2).drawing.entities.filter((e) => e.type === 'solid').map((e) => e.kind)`);
    assert.ok(kinds.includes('boolean') && kinds.includes('revolution'), JSON.stringify(kinds));
    assert.ok(await m(app, `k.state.docs.at(-1).drawing.entities.some((e) => e.type === 'solid')`), 'the STEP pulley');
  } },
  { group: '인쇄', name: '인쇄 미리보기 프레임: 축척 바꾸면 쪽수, 바로 인쇄', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 600, height: 300 })), 1)`);
    await app.main.eval(`(window.__mycad.run('print'), 1)`);
    await app.waitFrame('print', `window.__mycadPopup.printLayout().pages.length === 1`);
    await app.frame('print', `(() => { const s = document.querySelector('[data-print="scale"]'); s.value = '1:1'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.ok(await app.frame('print', `window.__mycadPopup.printLayout().pages.length`) > 1);
    await app.frame('print', `(window.__mycadPrintHook = () => { window.__printed = true; }, document.querySelector('[data-action="print"]').click(), 1)`);
    await sleep(200);
    assert.equal(await app.frame('print', 'window.__printed'), true);
    await app.frame('print', `(() => { const s = document.querySelector('[data-print="scale"]'); s.value = 'fit'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await closeFrames(app);
  } },
  { group: '3D', name: '3D 보기 (WebGL): 솔리드와 좌표축 눈금, 조명 끄기/켜기', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 40, height: 20 })), 1)`);
    await app.main.click('#toolbar [data-command="view3d"]');
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    const info = await m(app, 'k.actions.view3d().inspect()');
    assert.equal(info.triangles, 12, 'a box');
    assert.ok(info.tickLabels >= 9);
    await app.main.click('[data-view3d="light"]');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).light.visible, false);
    await app.main.click('[data-view3d="light"]');
    await app.main.click('[data-view3d="close"]');
  } },
  { group: '언어', name: '언어 전환: 한국어 ↔ English', async run(app) {
    await app.main.click('#toolbar [data-command="language"]');
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="draw"]').textContent.trim()`), 'Draw');
    await app.main.click('#toolbar [data-command="language"]');
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="draw"]').textContent.trim()`), '그리기');
  } },
  { group: '페이지', name: '저장 안 한 도면이 있으면 떠나기 전에 물어봄', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 5 })), 1)`);
    app.dialogs.length = 0;
    await app.main.click('#cad-canvas');
    await app.reload();
    assert.ok(app.dialogs.includes('beforeunload'), JSON.stringify(app.dialogs));
  } },
];

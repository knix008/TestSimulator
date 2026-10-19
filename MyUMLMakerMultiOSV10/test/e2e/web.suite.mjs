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
  { group: '페이지', name: '처음 열면 튜토리얼 안내 (프레임 팝업) → 나중에', async run(app) {
    await app.waitFrame('welcome', `document.querySelector('.popup-head h2 svg')`);
    assert.match(await app.frame('welcome', `document.querySelector('.popup').innerText`), /튜토리얼/);
    await app.frame('welcome', `(document.querySelector('[data-value="later"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-welcome')`);
  } },
  { group: '시작 페이지', name: '템플릿 전부·예제·튜토리얼, 템플릿을 누르면 새 프로젝트', async run(app) {
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const info = await app.main.eval(`({ templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('[data-start="tutorial"]')), sample: Boolean(document.querySelector('[data-start="builtin-sample"], [data-start="open-sample"]')), panelsHidden: getComputedStyle(document.querySelector('#left-panel')).display === 'none' })`);
    assert.equal(info.templates, await W(app, 'w.domain.TEMPLATES.length'));
    assert.ok(info.tutorial && info.sample && info.panelsHidden, JSON.stringify(info));
    await app.main.click('[data-start="template"][data-value="sequence"]');
    await sleep(500);
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLSequenceDiagram');
    assert.ok(await W(app, 'api.diagram().ownedViews.length >= 4'));
    await noError(app, 'template');
  } },
  { group: '창', name: '도구 상자·모델 탐색기·편집기·프로젝트 이름과 다이어그램 탭', async run(app) {
    await freshSample(app);
    const info = await app.main.eval(`({
      tools: document.querySelectorAll('#left-panel .tool-item[data-tool]').length,
      tree: document.querySelectorAll('#explorer .tree-row').length,
      editorTabs: document.querySelectorAll('#editor-tabs .editor-tab').length,
      diagramTab: document.querySelector('#tabs .tab[data-diagram-tab].active')?.textContent.trim(),
      diagramTabs: document.querySelectorAll('#tabs .tab[data-diagram-tab]').length,
      project: document.querySelector('#tabs .tab-project .tab-name')?.textContent,
      views: document.querySelectorAll('.canvas-svg [data-view]').length,
    })`);
    assert.ok(info.tools > 20 && info.tree > 3 && info.editorTabs === 4 && info.views > 10, JSON.stringify(info));
    assert.ok(info.diagramTab, 'the open diagram has a tab');
    assert.equal(info.diagramTabs, await W(app, 'M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).length'), 'a tab per diagram');
    assert.ok(info.project, 'the project name before the diagram tabs');
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
  { group: '도움말', name: '튜토리얼의 모든 단계가 오류 없이 대상 요소를 그림', async run(app) {
    await closeFrames(app);
    await W(app, `(a.startTutorial(), 1)`);
    const count = await W(app, 'w.domain.tutorialSteps()');
    const missing = [];
    for (let i = 0; i < count; i += 1) {
      await app.main.waitFor(`window.__myumlmaker.tutorial()?.state().index === ${i} && !window.__myumlmaker.tutorial().state().busy`, { timeout: 20000 });
      const step = await W(app, 'w.tutorial().state().id');
      if (!await app.main.eval(`Boolean(document.querySelector('.tour-outline'))`)) missing.push(step);
      if (i < count - 1) await app.main.eval(`(document.querySelector('[data-tour="next"]').click(), 1)`);
    }
    await W(app, `(w.tutorial().stop(), 1)`);
    await sleep(500);
    assert.deepEqual(missing, [], 'every step outlines its target');
    await noError(app, 'tutorial');
  } },
];

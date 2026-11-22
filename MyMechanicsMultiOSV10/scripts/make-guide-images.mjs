// npm run guide:images — the screenshots of the user's guide and the tutorial (doc/images/<ko|en>/*.png).
//   node scripts/make-guide-images.mjs [--lang ko|en] [--only name,name] [--keep]
// Drives the web build in headless Edge through scripts/smoke-web.mjs (its own Vite on a free port — never the
// dev server on 5494): each picture is a scene built through window.__mymechanics, red numbered call-outs drawn
// into the page with a temporary overlay, and a shot of the window or of a part of it (smoke-web's "clip").
// The shots are then shrunk to at most 1400 px wide and saved as palette PNGs. Then run `npm run build:docs`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { installHelpers } from './guide-helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args[i + 1]; };
const languages = opt('--lang', 'ko,en').split(',');
const only = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const MAX_WIDTH = 1400;
// --until name: stop after that scene (to look at one part of the run).
const until = opt('--until', '');


// ───────────────────────── the scenes

/**
 * Each scene: [name, async (g) => clip | null, options]. The function sets up the app, draws call-outs and
 * returns the area to keep (null = the whole window). Scenes run in order (the tutorial part is built across
 * several of them); `group` names scenes that need the ones before them.
 */
const scenes = [];
const scene = (name, fn, options = {}) => scenes.push({ name, fn, ...options });
const mouse = (name, build) => scenes.push({ name, mouse: build });

// 1 · window layout
scene('window-layout', async (g) => {
  await g.sample('flange'); await g.fit();
  const { T } = g;
  g.mark('#menubar', 1, T('메뉴 막대', 'Menu bar'), { at: 'tr', dx: -170, pad: 0 });
  g.mark('#toolbar', 2, T('도구 모음', 'Toolbar'), { at: 'tr', dx: -170, pad: -1 });
  g.mark('#tabs', 3, T('문서 탭 · 보기 방향', 'Document tabs · views'), { at: 'tr', dx: -260, pad: -1 });
  g.mark('#palette-host', 4, 'CommandManager', { at: 'br', pad: -1 });
  g.mark('#left-panel', 5, T('FeatureManager 트리', 'FeatureManager tree'), { at: 'bl', pad: -1, dy: -40 });
  g.mark('#view-host', 6, T('그래픽 영역', 'Graphics area'), { at: 'tr', dy: 26, pad: -1 });
  g.mark('#right-panel', 7, T('작업 창', 'Task pane'), { at: 'bl', pad: -1, dy: -40 });
  g.mark('#bottom-panel', 8, T('아래 패널 (오류 · 메시지 · 질량)', 'Bottom panel (errors · messages · mass)'), { at: 'bl', pad: -1, dy: -8, dx: 6 });
  g.mark('#statusbar', 9, T('상태 표시줄', 'Status bar'), { at: 'above', dx: 620, pad: 0 });
  return null;
});

// 2 · start page
scene('start-page', async (g) => {
  await g.reset();
  g.m.actions.showStartPage(true); await g.settle(1200);
  const cards = [...document.querySelectorAll('.start-card')];
  const hero = document.querySelector('.start-hero');
  if (hero) g.mark(hero, 1, g.T('프로그램 정보 (고정) · 설명서 · 튜토리얼', 'Program info (fixed) · guide · tutorial'), { at: 'br' });
  cards.filter((card) => !card.contains(hero) && !hero?.contains(card)).forEach((card, i) => g.mark(card, i + 2, card.querySelector('h2, h3, .start-card-title, header')?.textContent.trim().split('\n')[0].replace(/\s*\d+$/, '').slice(0, 30) || null, { at: 'tr', pad: 1 }));
  return null;
});

// 3 · the first part, step by step (also the tutorial's lessons 1–3 and 8)
scene('part-sketch-plane', async (g) => {
  await g.newPart(); await g.cm('features');
  await g.m.run('sketch'); await g.settle(500);
  g.mark(g.union('[data-pm^="sketchOn:"]'), 1, g.T('스케치할 평면을 고릅니다', 'Pick the plane to sketch on'), { at: 'below', pad: 4 });
  const top = g.treeRow(g.T('윗면', 'Top'));
  if (top) g.mark(top, 2, g.T('또는 트리에서', 'or in the tree'), { at: 'right', dx: -100 });
  return null;
});
scene('part-sketch-rect-prep', async (g) => {
  document.querySelector('[data-pm="sketchOn:top"]').click(); await g.settle(700);
  await g.m.run('sk:centerRect'); await g.settle(200);
  const o = g.toPage([0, 0, 0]); window.__pt = [o.x, o.y];
  return undefined;
}, { noShot: true });
mouse('part-sketch-rect-mouse', () => [
  { type: 'mousePressed', x: 'window.__pt[0]', y: 'window.__pt[1]', button: 'left', buttons: 1 },
  { type: 'mouseReleased', x: 'window.__pt[0]', y: 'window.__pt[1]', button: 'left' },
  { type: 'mouseMoved', x: 'window.__pt[0] + 150', y: 'window.__pt[1] - 90', delay: 30 },
  { type: 'mousePressed', x: 'window.__pt[0] + 150', y: 'window.__pt[1] - 90', button: 'left', buttons: 1 },
  { type: 'mouseReleased', x: 'window.__pt[0] + 150', y: 'window.__pt[1] - 90', button: 'left' },
  { type: 'mouseMoved', x: 'window.__pt[0] + 260', y: 'window.__pt[1] - 160', delay: 30 },
]);
scene('part-sketch-rect', async (g) => {
  await g.settle(300);
  const btn = g.cmd('sk:centerRect');
  if (btn) g.mark(btn, 1, g.T('중심 사각형', 'Center Rectangle'), { at: 'below', pad: 3 });
  const o = g.toPage([0, 0, 0]);
  g.mark({ x: o.x - 14, y: o.y - 14, w: 28, h: 28 }, 2, g.T('원점에서 시작', 'Start at the origin'), { at: 'below' });
  g.mark({ x: o.x + 136, y: o.y - 104, w: 28, h: 28 }, 3, g.T('모서리 클릭', 'Click the corner'), { at: 'right' });
  return null;
});
// The pointer leaves the graphics area (no hover highlight, no tooltips over windows opened later).
mouse('park', () => [{ type: 'mouseMoved', x: 1000, y: 3, delay: 30 }]);
scene('part-sketch-dims', async (g) => {
  const { m } = g;
  const ed = m.state.editing.editor;
  m.actions.updateSettings({ editDimOnCreate: false }, { quiet: true });
  const lines = ed.sketch.entities.filter((e) => e.type === 'line' && !e.construction);
  const horizontal = lines.find((l) => { const a = ed.sketch.entities.find((e) => e.id === l.p1); const b = ed.sketch.entities.find((e) => e.id === l.p2); return Math.abs(a.y - b.y) < 1e-6; });
  const vertical = lines.find((l) => { const a = ed.sketch.entities.find((e) => e.id === l.p1); const b = ed.sketch.entities.find((e) => e.id === l.p2); return Math.abs(a.x - b.x) < 1e-6; });
  ed.selection = [horizontal.id]; await ed.createDimension();
  ed.selection = [vertical.id]; await ed.createDimension();
  const dims = ed.sketch.constraints.filter((c) => c.type === 'distance');
  const dh = dims.find((d) => d.a === horizontal.id) ?? dims[0]; const dv = dims.find((d) => d.a === vertical.id) ?? dims[1];
  dh.value = 80; dv.value = 50; ed.solve(); ed.selection = []; ed.render();
  m.actions.updateSettings({ editDimOnCreate: true }, { quiet: true });
  await g.settle(600);
  const labels = [...document.querySelectorAll('.vp-label.dim-label')];
  labels.forEach((l, i) => g.mark(l, i + 1, null, { pad: 4 }));
  const status = [...document.querySelectorAll('#statusbar .status-item')].find((s) => /정의|defined/i.test(s.textContent));
  g.mark(status ?? '#statusbar', 3, g.T('완전 정의 (검은 선)', 'Fully defined (black lines)'), { at: 'above', dx: -120 });
  const cmd = g.cmd('sk:dimension');
  if (cmd) g.mark(cmd, null, g.T('지능형 치수 (D)', 'Smart Dimension (D)'), { at: 'below', pad: 3 });
  return null;
});
scene('part-extrude', async (g) => {
  const { m } = g;
  await m.run('exitSketch'); await g.settle(300);
  await g.cm('features');
  await m.run('extrude'); m.actions.pmFieldChanged('depth', '20', 'length');
  await g.view('iso'); await g.fit(); await g.settle(600);
  g.mark('.pm-head', 1, g.T('✔ 확인 · ✖ 취소', '✔ OK · ✖ Cancel'), { at: 'right', dx: -200 });
  const depth = document.querySelector('#left-panel [data-pm-field="depth"], #left-panel input[data-key="depth"]')?.closest('.pm-field') ?? document.querySelector('#left-panel .pm-field');
  g.mark(depth, 2, g.T('깊이 20', 'Depth 20'), { at: 'right', dx: -110 });
  g.mark({ x: g.rectOf('#view-host').x + 240, y: g.rectOf('#view-host').y + 90, w: 480, h: 360 }, 3, g.T('노란 미리보기', 'Preview'), { at: 'tr' });
  return null;
});
scene('part-fillet', async (g) => {
  const { m } = g;
  m.actions.acceptEditing(); await g.settle(600);
  await m.run('fillet'); await g.settle(300);
  g.pickEdges((ed) => { const d = ed.tangentAt(0.5); return Math.abs(d.z) > 0.9 * Math.hypot(d.x, d.y, d.z); });
  m.actions.pmFieldChanged('radius', '5', 'length'); await g.settle(800);
  g.mark(document.querySelector('#left-panel .pm-pick'), 1, g.T('고른 모서리 (뒤쪽은 보기를 돌려서)', 'Picked edges (turn the view for the back one)'), { at: 'below' });
  const rad = [...document.querySelectorAll('#left-panel .pm-field')].find((f) => f.querySelector('input'));
  if (rad) g.mark(rad, 2, g.T('반지름 5', 'Radius 5'), { at: 'right', dx: -120 });
  g.mark({ x: g.rectOf('#view-host').x + 240, y: g.rectOf('#view-host').y + 90, w: 480, h: 360 }, 3, g.T('세로 모서리를 클릭', 'Click the vertical edges'), { at: 'tr' });
  return null;
});
scene('part-hole', async (g) => {
  const { m } = g;
  m.actions.acceptEditing(); await g.settle(600);
  await m.run('hole'); await g.settle(300);
  g.clickAt([15, 15, 20]);
  m.actions.pmSet('kind', 'counterbore'); await g.settle(900);
  const kinds = document.querySelector('#left-panel [data-pm-set="kind"]')?.parentElement;
  if (kinds) g.mark(kinds, 1, g.T('카운터보어', 'Counterbore'), { at: 'below' });
  const p = g.toPage([15, 15, 20]);
  g.mark({ x: p.x - 40, y: p.y - 30, w: 80, h: 60 }, 2, g.T('윗면을 클릭한 위치', 'Where you clicked the top face'), { at: 'right' });
  return null;
});
scene('part-pattern', async (g) => {
  const { m } = g;
  m.actions.acceptEditing(); await g.settle(600);
  const hole = g.featureOf('hole');
  m.actions.select([{ kind: 'feat', id: hole.id }]);
  await m.run('circularPattern'); await g.settle(200);
  m.actions.pmSet('axisKind', 'z'); m.actions.pmFieldChanged('count', '4', 'number'); await g.settle(1200);
  g.mark(document.querySelector('#left-panel .pm-pick'), 1, g.T('패턴할 피처: 구멍', 'Features to pattern: the hole'), { at: 'below' });
  const axis = document.querySelector('#left-panel [data-pm-set="axisKind"]')?.parentElement;
  if (axis) g.mark(axis, 2, g.T('축 Z', 'Axis Z'), { at: 'right', dx: -80 });
  return null;
});
scene('part-done', async (g) => {
  const { m } = g;
  m.actions.acceptEditing(); await g.settle(800); await g.fit();
  m.actions.select([]); await g.settle(300);
  g.mark('#left-panel .tree', 1, g.T('만든 순서의 피처', 'Features in the order made'), { at: 'br' });
  return g.clip(['#left-panel', '#view-host'], 0);
});
// 8 (tutorial) · a drawing of the part, then section and detail views
scene('tut-drawing-views', async (g) => {
  const { m } = g;
  await m.actions.newDrawing(); await g.settle(1500);
  const views = [...document.querySelectorAll('.drawing-paper svg .view')];
  views.forEach((v, i) => g.mark(v, i + 1, null, { pad: 6 }));
  g.mark('#right-panel', 5, g.T('시트 · 척도 · 뷰', 'Sheet · scale · views'), { at: 'bl', pad: -1 });
  return null;
});
scene('tut-drawing-section', async (g) => {
  const { m } = g;
  const front = document.querySelector('.drawing-paper svg .view');
  if (front?.dataset?.view) m.actions.select([{ kind: 'view', id: front.dataset.view }]);
  await m.run('sectionView'); await g.settle(800);
  await m.run('detailView'); await g.settle(1200);
  const svg = document.querySelector('.drawing-paper svg');
  g.mark(svg.querySelector('.view-section .view-box'), 1, g.T('단면도 A-A', 'Section A-A'), { pad: 4, at: 'above' });
  g.mark(svg.querySelector('.view-detail .view-box'), 2, g.T('상세도 B', 'Detail B'), { pad: 4, at: 'above' });
  return g.clip(['.drawing-paper']);
});

// 4 · sketch relations
scene('sketch-relations', async (g) => {
  const { m } = g;
  await g.newPart();
  await m.run('sketch'); document.querySelector('[data-pm="sketchOn:front"]').click(); await g.settle(600); await g.cm('sketch');
  const ed = m.state.editing.editor;
  const add = (ents) => { ed.sketch.entities.push(...ents); };
  add([{ id: 'a', type: 'point', x: -40, y: 0 }, { id: 'b', type: 'point', x: 40, y: 0 }, { id: 'c', type: 'point', x: 40, y: 30 }, { id: 'd', type: 'point', x: -10, y: 45 },
    { id: 'l1', type: 'line', p1: 'a', p2: 'b' }, { id: 'l2', type: 'line', p1: 'b', p2: 'c' }, { id: 'l3', type: 'line', p1: 'c', p2: 'd' }, { id: 'l4', type: 'line', p1: 'd', p2: 'a' },
    { id: 'cc', type: 'point', x: 5, y: 18 }, { id: 'c1', type: 'circle', c: 'cc', r: 8 }]);
  ed.sketch.constraints.push({ id: 'h1', type: 'horizontal', a: 'l1' }, { id: 'v1', type: 'vertical', a: 'l2' });
  ed.commit?.('op.sketch'); ed.solve();
  ed.selection = ['l3']; ed.render(); m.actions.select?.([]);
  // The PropertyManager follows the sketch selection on the next render.
  ed.onChange?.(); await g.settle(200);
  document.querySelector('#view-host')?.dispatchEvent(new Event('pointerup'));
  await g.settle(500);
  g.mark('#palette-host', 1, g.T('스케치 탭: 그리기·편집 도구', 'Sketch tab: drawing and editing tools'), { at: 'br', pad: -1 });
  g.mark('#left-panel .left-pm-body', 2, g.T('구속 조건 부가', 'Add Relations'), { at: 'bl', pad: -1 });
  return null;
});

// 5 · FeatureManager rollback, sweep, loft
scene('tree-rollback', async (g) => {
  const { m } = g;
  await g.sample('flange'); await g.fit();
  m.actions.rollbackTo(4); await g.settle(900);
  g.mark('#left-panel [data-rollback-bar]', 1, g.T('롤백 바 (끌기)', 'Rollback bar (drag)'), { at: 'below', pad: 3 });
  const rolled = g.union('#left-panel .tree-row.rolled');
  if (rolled) g.mark(rolled, 2, g.T('잠시 빠진 피처', 'Rolled-back features'), { at: 'right', dx: -170, pad: 1 });
  return g.clip(['#left-panel', '#view-host'], 0);
});
scene('feature-sweep', async (g) => {
  const { m } = g;
  m.actions.rollbackTo(null);
  await g.sample('advDuctBend'); await g.fit();
  const f = g.featureOf('sweep');
  if (f) { m.actions.editFeature(f.id); await g.settle(1200); }
  const picks = [...document.querySelectorAll('#left-panel .pm-pick')];
  if (picks[0]) g.mark(picks[0], 1, g.T('윤곽 (닫힌 스케치)', 'Profile (closed sketch)'), { at: 'below' });
  if (picks[1]) g.mark(picks[1], 2, g.T('경로', 'Path'), { at: 'below' });
  return null;
});
scene('feature-loft', async (g) => {
  const { m } = g;
  await g.sample('advTurbineBlade'); await g.fit();
  const f = g.featureOf('loft');
  if (f) { m.actions.editFeature(f.id); await g.settle(1500); }
  const pick = document.querySelector('#left-panel .pm-pick');
  if (pick) g.mark(pick, 1, g.T('단면을 이을 순서대로', 'Profiles in the order to join'), { at: 'below' });
  return null;
});

// 6 · surfaces, sheet metal, weldments, mold tools
scene('surfaces', async (g) => {
  await g.sample('advCarBody'); await g.view('iso'); await g.fit();
  g.mark('#left-panel .tree', 1, g.T('곡면 로프트 → 자르기 → 붙이기 → 두껍게', 'Surface loft → trim → knit → thicken'), { at: 'br' });
  return null;
});
scene('sheetmetal', async (g) => {
  await g.sample('advSheetEnclosure'); await g.view('iso'); await g.fit(); await g.cm('sheetMetal');
  g.mark('#left-panel .tree', 1, g.T('베이스 플랜지 · 조그 · 굽힘 · 플랜지 · 헴', 'Base flange · jog · bend · flanges · hem'), { at: 'br' });
  return null;
});
scene('flat-pattern', async (g) => {
  const { m } = g;
  await g.cm('sheetMetal');
  await m.run('flatten'); await g.view('top'); await g.fit(); await g.settle(600);
  const cmd = g.cmd('flatten');
  if (cmd) g.mark(cmd, 1, g.T('펼치기 (다시 누르면 접힘)', 'Flatten (press again to fold)'), { at: 'right', pad: 3 });
  return null;
});
scene('weldment', async (g) => {
  const { m } = g;
  try { await m.run('flatten'); } catch { /* off */ }
  await g.sample('advMachineStand'); await g.view('iso'); await g.fit();
  await g.cm('weldments');
  g.mark(g.cmd('cutList'), 2, null, { pad: 3 });
  m.run('cutList'); await g.settle(1500);
  const popup = document.querySelector('.web-popup:not([hidden])');
  if (popup) g.mark(popup, 1, g.T('절단 목록: 부재별 길이 · 합계', 'Cut list: length of each member · total'), { at: 'below' });
  return null;
});
scene('mold-draft-analysis', async (g) => {
  const { m } = g;
  await g.sample('advMoldedCover'); await g.view('iso'); await g.fit(); await g.cm('mold');
  await m.run('draftAnalysis'); await g.settle(1200);
  g.mark(g.cmd('draftAnalysis'), 1, g.T('구배 분석', 'Draft analysis'), { at: 'below', pad: 3 });
  return g.clip(['#left-panel', '#view-host'], 0);
});
scene('mold-parting', async (g) => {
  const { m } = g;
  await m.run('draftAnalysis'); await g.settle(300);
  const pl = g.featureOf('partingLine');
  if (pl) { m.actions.rollbackTo(m.active().features.indexOf(pl) + 1); await g.settle(800); await g.fit(); m.actions.editFeature(pl.id); await g.settle(1200); }
  const dirs = document.querySelector('#left-panel [data-pm-set]')?.parentElement;
  if (dirs) g.mark(dirs, 1, g.T('빼기 방향', 'Pull direction'), { at: 'below' });
  return null;
});
scene('mold-core-cavity', async (g) => {
  const { m } = g;
  m.actions.cancelEditing({ quiet: true }); m.actions.rollbackTo(null); await g.settle(1200); await g.fit();
  const row = g.featureRow(g.featureOf('toolingSplit'));
  if (row) g.mark(row, 1, g.T('코어/캐비티 분할', 'Core/cavity split'), { at: 'right', dx: -170 });
  return g.clip(['#left-panel', '#view-host'], 0);
});

// 7 · equations and configurations
scene('equations', async (g) => {
  const { m } = g;
  await g.sample('advParamBracket'); await g.view('iso'); await g.fit(); await g.cm('evaluate');
  await m.run('equations'); await g.settle(800);
  g.mark('#left-panel', 1, g.T('전역 변수와 수식', 'Global variables and equations'), { at: 'br', pad: -1 });
  return null;
});
scene('configurations', async (g) => {
  const { m } = g;
  m.actions.cancelEditing({ quiet: true });
  await m.run('configurations'); await g.settle(400);
  m.actions.pmSet('activeConfig', 'cfg-heavy'); await g.settle(1500); await g.fit();
  g.mark('#left-panel', 1, g.T('컨피규레이션 3개 · 고하중 사용 중', 'Three configurations · Heavy duty active'), { at: 'br', pad: -1 });
  return null;
});

// 8 · simulation
scene('sim-setup', async (g) => {
  const { m } = g;
  const { e, fix, load } = await g.cantilever();
  window.__sim = { fix, load };
  e.fixtures = [{ index: fix.i, faceId: fix.f.hashCode, type: 'PLANE' }];
  e.loads = [{ index: load.i, faceId: load.f.hashCode, type: 'PLANE' }];
  e.magnitude = 200; e.dir = '-y'; e.resolution = 60;
  m.viewport.setSelection([...e.fixtures, ...e.loads].map((x) => ({ kind: 'face', bodyKey: 'body', index: x.index })));
  m.actions.pmSet('dir', '-y'); await g.settle(800);
  const picks = [...document.querySelectorAll('#left-panel .pm-pick')];
  if (picks[0]) g.mark(picks[0], 1, g.T('고정 면', 'Fixed face'), { at: 'below' });
  if (picks[1]) g.mark(picks[1], 2, g.T('하중 면 · 200 N, −Y', 'Load face · 200 N, −Y'), { at: 'below' });
  const run = document.querySelector('#left-panel [data-pm="runSim"]');
  if (run) g.mark(run, 3, g.T('해석 실행', 'Run'), { at: 'right' });
  return null;
});
scene('sim-static', async (g) => {
  const { m } = g;
  await m.actions.pmCommand('runSim'); await g.settle(1500);
  m.viewport.setSelection([]); await g.settle(300); await g.pmEnd();
  const res = document.querySelector('#left-panel .pm-results');
  if (res) g.mark(res.closest('.pm-group') ?? res, 1, g.T('최대 응력 · 변위 · 안전율', 'Max stress · displacement · factor of safety'), { at: 'above' });
  const legend = document.querySelector('#left-panel .sim-legend');
  if (legend) g.mark(legend, 2, g.T('von Mises 응력 (MPa)', 'von Mises stress (MPa)'), { at: 'below' });
  return null;
});
scene('sim-thermal', async (g) => {
  const { m } = g;
  const e = m.state.editing; const { fix, load } = window.__sim;
  m.actions.pmSet('study', 'thermal'); await g.settle(300);
  e.fixtures = [{ index: fix.i, faceId: fix.f.hashCode, type: 'PLANE' }];
  e.loads = [{ index: load.i, faceId: load.f.hashCode, type: 'PLANE' }];
  e.temperature = 120; e.heatKind = 'convection'; e.resolution = 50;
  await m.actions.pmCommand('runSim'); await g.settle(1500); await g.pmEnd();
  const legend = document.querySelector('#left-panel .sim-legend');
  if (legend) g.mark(legend, 1, g.T('온도 (°C)', 'Temperature (°C)'), { at: 'below' });
  return null;
});
scene('sim-modal', async (g) => {
  const { m } = g;
  const e = m.state.editing; const { fix } = window.__sim;
  m.actions.pmSet('study', 'modal'); await g.settle(300);
  e.fixtures = [{ index: fix.i, faceId: fix.f.hashCode, type: 'PLANE' }];
  e.modes = 4; e.resolution = 40;
  await m.actions.pmCommand('runSim'); await g.settle(1200);
  m.actions.pmSet('modeIndex', '1'); await g.settle(1000); await g.pmEnd();
  const modes = document.querySelector('#left-panel [data-pm-set="modeIndex"]')?.parentElement;
  if (modes) g.mark(modes, 1, g.T('고유 진동수 · 모드 선택', 'Natural frequencies · pick a mode'), { at: 'below' });
  return null;
});
scene('mass-props', async (g) => {
  const { m } = g;
  await g.sample('flange'); await g.fit();
  await g.cm('evaluate');
  g.mark(g.cmd('massProps'), null, null, { pad: 3 });
  m.run('massProps'); await g.settle(1500);
  const popup = document.querySelector('.web-popup:not([hidden])');
  if (popup) g.mark(popup, 1, g.T('질량 · 부피 · 무게 중심 · 외곽 크기', 'Mass · volume · centre of mass · size'), { at: 'below' });
  g.mark('#right-panel .right-props', 2, g.T('재질 · 질량', 'Material · mass'), { at: 'bl', pad: -1 });
  return null;
});

// 9 · lights, rulers, grid, scale bar
scene('lights', async (g) => {
  const { m } = g;
  await m.popups.closeAll(); await g.settle(300);
  await m.run('lights'); await g.settle(800);
  g.mark(g.cmd('lights'), null, null, { pad: 3 });
  g.mark('#left-panel', 1, g.T('주변광 · 카메라 조명 · 추가 조명', 'Ambient · camera light · added lights'), { at: 'br', pad: -1 });
  return null;
});
scene('rulers-grid', async (g) => {
  const { m } = g;
  m.actions.cancelEditing({ quiet: true }); await g.cm('features'); await g.fit(); await g.settle(400);
  const v = g.rectOf('#view-host');
  g.mark({ x: v.x + 22, y: v.y, w: v.w - 24, h: 20 }, 1, g.T('눈금자', 'Rulers'), { at: 'below', dx: 220 });
  g.mark({ x: v.x, y: v.y + 22, w: 20, h: v.h - 24 }, null, null);
  const bar = m.viewport.scaleBarRect;
  if (bar) g.mark({ x: v.x + bar.x, y: v.y + bar.y, w: bar.w, h: bar.h }, 2, g.T('축척 막대 (끌어서 이동)', 'Scale bar (drag to move)'), { at: 'above', dx: -120 });
  g.mark({ x: v.x + 40, y: v.y + 60, w: 220, h: 160 }, 3, g.T('격자 (5칸마다 진한 선)', 'Grid (bold every 5 lines)'), { at: 'tl' });
  g.mark({ x: v.x + 22, y: v.y + v.h - 110, w: 90, h: 90 }, 4, g.T('축 표시', 'Axes'), { at: 'right' });
  const toggles = g.union('#toolbar .tool-group .active');
  if (toggles) g.mark(toggles, 5, g.T('눈금자 · 격자 켜기/끄기', 'Rulers · grid on/off'), { at: 'below', pad: 3 });
  return null;
});

// 10 · assemblies
scene('assembly-mate', async (g) => {
  const { m } = g;
  await g.sample('asmGearReducer'); await g.view('iso'); await g.fit(); await g.cm('assembly');
  const asm = m.active();
  const mate = asm.mates.find((x) => x.type === 'concentric') ?? asm.mates[0];
  await m.run('mate'); await g.settle(300);
  const e = m.state.editing;
  e.mate = JSON.parse(JSON.stringify(mate)); e.pick = null; e.isNew = false;
  m.actions.pmSet('type', mate.type); await g.settle(1200);
  const picks = [...document.querySelectorAll('#left-panel .pm-pick')];
  if (picks[0]) g.mark(picks[0], 1, g.T('두 부품의 면', 'Faces of two components'), { at: 'below' });
  const types = document.querySelector('#left-panel [data-pm-set="type"]')?.parentElement;
  if (types) g.mark(types, 2, g.T('메이트 종류', 'Mate type'), { at: 'below' });
  return null;
});
scene('assembly-tree', async (g) => {
  const { m } = g;
  m.actions.cancelEditing({ quiet: true }); await g.settle(600);
  const mates = g.treeRow(g.T('메이트', 'Mates'));
  if (mates) g.mark(mates, 1, g.T('메이트 폴더', 'Mates folder'), { at: 'right', dx: -150 });
  const comps = g.union('#left-panel .tree-row.tree-component, #left-panel .tree-row[data-comp]');
  if (comps) g.mark(comps, 2, g.T('(f) 고정 · (-) 움직일 수 있음', '(f) fixed · (-) can still move'), { at: 'br' });
  return g.clip(['#left-panel', '#view-host'], 0);
});
scene('assembly-explode', async (g) => {
  const { m } = g;
  await g.sample('asmRobot'); await g.view('iso');
  await m.run('explode'); await g.settle(1500); await g.fit(); await g.settle(500);
  const cmd = g.cmd('explode');
  if (cmd) g.mark(cmd, 1, g.T('분해도', 'Exploded view'), { at: 'below', pad: 3 });
  return null;
});
scene('assembly-motion', async (g) => {
  const { m } = g;
  await m.run('explode'); await g.settle(800); await g.fit();
  await m.run('motion'); await g.settle(500);
  const slider = document.querySelector('[data-motion-time]');
  if (slider) { slider.value = String(Number(slider.max) * 0.45); slider.dispatchEvent(new Event('input', { bubbles: true })); }
  await g.settle(1500);
  if (slider) g.mark(slider.closest('.pm-group') ?? slider, 1, g.T('시간 막대 · 재생', 'Time slider · play'), { at: 'below' });
  const motors = document.querySelector('#left-panel .pm-pick, #left-panel .pm-relations');
  if (motors) g.mark(motors, 2, g.T('모터 (J4 · J6)', 'Motors (J4 · J6)'), { at: 'below' });
  return null;
});
scene('tut-asm-new', async (g) => {
  const { m } = g;
  await g.reset(); await m.actions.newDocument('assembly'); await g.settle(1200);
  g.mark('#left-panel', 1, g.T('넣을 부품 고르기', 'Pick the parts to insert'), { at: 'br', pad: -1 });
  return null;
});
scene('tut-asm-mate', async (g) => {
  const { m } = g;
  await g.sample('shaftAssembly'); await g.view('iso'); await g.fit();
  const asm = m.active();
  const mate = asm.mates.find((x) => x.type === 'concentric') ?? asm.mates[0];
  await m.run('mate'); await g.settle(300);
  const e = m.state.editing;
  e.mate = JSON.parse(JSON.stringify(mate)); e.pick = null; e.isNew = false;
  m.actions.pmSet('type', mate.type); await g.settle(1200);
  const picks = [...document.querySelectorAll('#left-panel .pm-pick')];
  if (picks[0]) g.mark(picks[0], 1, g.T('원통면 두 개', 'Two cylindrical faces'), { at: 'below' });
  const types = document.querySelector('#left-panel [data-pm-set="type"]')?.parentElement;
  if (types) g.mark(types, 2, g.T('동심', 'Concentric'), { at: 'below' });
  return null;
});
scene('tut-motion', async (g) => {
  const { m } = g;
  await g.sample('asmGearReducer'); await g.view('iso'); await g.fit();
  await m.run('motion'); await g.settle(500);
  const slider = document.querySelector('[data-motion-time]');
  if (slider) { slider.value = String(Number(slider.max) * 0.5); slider.dispatchEvent(new Event('input', { bubbles: true })); }
  await g.settle(1200);
  if (slider) g.mark(slider.closest('.pm-group') ?? slider, 1, g.T('시간 막대 · 재생', 'Time slider · play'), { at: 'below' });
  const motor = document.querySelector('#left-panel .pm-pick, #left-panel .pm-relations');
  if (motor) g.mark(motor, 2, g.T('입력축 회전 모터', 'Rotary motor on the input shaft'), { at: 'below' });
  return null;
});

// 11 · drawings
scene('drawing-section-detail', async (g) => {
  await g.sample('asmShaftDrawing'); await g.settle(1500);
  const svg = document.querySelector('.drawing-paper svg');
  const sec = svg?.querySelector('.view-section .view-box'); const det = svg?.querySelector('.view-detail .view-box');
  if (sec) g.mark(sec, 1, g.T('단면도', 'Section view'), { pad: 4, at: 'left' });
  if (det) g.mark(det, 2, g.T('상세도', 'Detail view'), { pad: 4, at: 'right' });
  const gdt = svg?.querySelector('.annotation.ann-gdt');
  if (gdt) g.mark(gdt, 3, g.T('기하 공차', 'GD&T'), { pad: 4, at: 'below' });
  return null;
});
scene('drawing-bom', async (g) => {
  await g.sample('asmRobotDrawing'); await g.settle(1800);
  const bom = document.querySelector('.drawing-paper svg .bom');
  if (bom) g.mark(bom, 1, g.T('부품표 (BOM)', 'Bill of materials'), { pad: 4, at: 'above' });
  const balloon = document.querySelector('.drawing-paper svg .annotation.ann-balloon');
  if (balloon) g.mark(balloon, 2, g.T('풍선', 'Balloons'), { pad: 4, at: 'right' });
  return g.clip(['.drawing-paper']);
});

// 12 · files, settings, shortcuts
scene('file-menu', async (g) => {
  await g.sample('flange'); await g.fit();
  document.querySelectorAll('#menubar .menubar-item')[1]?.click(); await g.settle(1200);
  return null;
});
scene('settings', async (g) => {
  const { m } = g;
  try { await m.popups.hideMenu(); } catch { /* closed */ }
  m.popups.open('settings', { tab: 'cad' }); await g.settle(1800);
  return null;
});
scene('shortcuts', async (g) => {
  const { m } = g;
  await m.popups.closeAll(); await g.settle(300);
  m.popups.open('settings', { tab: 'shortcuts' }); await g.settle(1800);
  return null;
});

// 16 · tools: schematic, design checker, task scheduler, macros
scene('tools-schematic', async (g) => {
  const { m } = g;
  await m.popups.closeAll(); await g.settle(300);
  await g.sample('flange'); await g.settle(500);
  m.run('schematic'); await g.settle(600);
  const S = m.schematic;
  const at = (kind, x, y, extra) => { const id = S.placeSymbol(kind, x, y); if (extra) Object.assign(S.schematic().symbols.find((s) => s.id === id), extra); return id; };
  const v = at('supply', 50, 50); const f = at('fuse', 80, 60); const s = at('pushbutton', 115, 60); const k = at('coil', 150, 80); const gnd = at('ground', 150, 115);
  const v2 = at('supply', 190, 50); const c = at('contact', 205, 70); const l = at('lamp', 205, 100); const gnd2 = at('ground', 205, 130);
  S.addWire({ sym: v, pin: '+' }, { sym: f, pin: '1' }); S.addWire({ sym: f, pin: '2' }, { sym: s, pin: '13' }); S.addWire({ sym: s, pin: '14' }, { sym: k, pin: 'A1' }); S.addWire({ sym: k, pin: 'A2' }, { sym: gnd, pin: 'PE' });
  S.addWire({ sym: v2, pin: '+' }, { sym: c, pin: '13' }); S.addWire({ sym: c, pin: '14' }, { sym: l, pin: 'X1' }); S.addWire({ sym: l, pin: 'X2' }, { sym: gnd2, pin: 'PE' });
  S.zoomAt(1.8, 130, 90); await g.settle(500);
  return null;
});
scene('tools-designcheck', async (g) => {
  const { m } = g;
  m.run('schematic'); await g.settle(300);
  m.actions.updateSettings({ designStandard: null }, { quiet: true });
  m.run('designCheck'); await g.settle(500);
  document.querySelector('[data-pm="dc.run"]')?.click(); await g.settle(800);
  const list = document.querySelector('.dc-findings');
  if (list) g.mark(list, 1, g.T('항목을 누르면 문서와 항목으로 이동', 'Click a finding to go to it'), { at: 'right' });
  return null;
});
scene('tools-tasks', async (g) => {
  const { m } = g;
  m.run('designCheck'); await g.settle(300);
  m.actions.updateSettings({ tasks: [] }, { quiet: true });
  m.run('taskScheduler'); await g.settle(300);
  const T = m.tasks;
  const a = T.addTask('export'); T.addTask('designCheck'); T.addTask('properties');
  m.actions.updateSettings({ tasks: T.tasks().map((x) => (x.id === a ? { ...x, source: { ...x.source, paths: ['D:/Projects/pump.mymech', 'D:/Projects/valve.mymech'] }, options: { ...x.options, formats: ['step', 'stl'] }, schedule: { ...x.schedule, mode: 'daily', time: '22:00' } } : x)) }, { quiet: true });
  T.select(a); await g.settle(500);
  return null;
});
scene('tools-macro', async (g) => {
  const { m } = g;
  m.run('taskScheduler'); await g.settle(300);
  m.actions.updateSettings({ tasks: [] }, { quiet: true });
  m.macro.setText(['// MyMechanics macro', '// ' + g.T('부품마다 이름과 피처 수를 기록하고 필렛을 키웁니다', 'log every part, then enlarge the fillet'), '', 'for (const p of mm.parts()) {', '  mm.log(`${p.name}: ${p.features.length}`);', '}', 'const fillet = mm.parts()[0].features.find((f) => f.type === "fillet");', 'if (fillet) await mm.setParam(fillet.name, "radius", 3);', 'mm.log(mm.massProperties()[0]);', ''].join('\n'));
  m.run('macroEditor'); await g.settle(1500);
  await m.macro.runMacro(); await g.settle(800);
  await m.actions.undo(); await g.settle(300);
  return null;
});

// The tutorial's sweep and sheet metal lessons (built step by step)
scene('tut-sweep-sketches', async (g) => {
  const { m } = g;
  await m.popups.closeAll(); await g.settle(300);
  await g.newPart();
  await g.cm('features');
  g.sketch({ kind: 'std', name: 'top' }, [{ id: 'pc', type: 'point', x: 0, y: 0 }, { id: 'c1', type: 'circle', c: 'pc', r: 8 }, { id: 'c2', type: 'circle', c: 'pc', r: 6 }], g.T('윤곽', 'Profile'));
  g.sketch({ kind: 'std', name: 'front' }, [{ id: 'q1', type: 'point', x: 0, y: 0 }, { id: 'q2', type: 'point', x: 0, y: 60 }, { id: 'q3', type: 'point', x: 50, y: 100 }, { id: 'q4', type: 'point', x: 110, y: 100 }, { id: 'm1', type: 'line', p1: 'q1', p2: 'q2' }, { id: 'm2', type: 'line', p1: 'q2', p2: 'q3' }, { id: 'm3', type: 'line', p1: 'q3', p2: 'q4' }], g.T('경로', 'Path'));
  await g.settle(800); await g.view('iso'); await g.fit();
  const rows = [g.treeRow(g.T('윤곽', 'Profile')), g.treeRow(g.T('경로', 'Path'))];
  rows.forEach((r, i) => r && g.mark(r, i + 1, i ? g.T('정면의 열린 선', 'Open lines on Front') : g.T('윗면의 두 원 (관)', 'Two circles on Top (a tube)'), { at: 'right', dx: -190 }));
  return null;
});
scene('tut-sweep', async (g) => {
  const { m } = g;
  await m.run('sweep'); await g.settle(1500);
  const picks = [...document.querySelectorAll('#left-panel .pm-pick')];
  if (picks[0]) g.mark(picks[0], 1, g.T('윤곽', 'Profile'), { at: 'below' });
  if (picks[1]) g.mark(picks[1], 2, g.T('경로', 'Path'), { at: 'below' });
  return null;
});
scene('tut-sweep-done', async (g) => {
  const { m } = g;
  m.actions.acceptEditing(); await g.settle(1200); await g.fit(); m.actions.select([]); await g.settle(300);
  return g.clip(['#left-panel', '#view-host'], 0);
});
scene('tut-sm-base', async (g) => {
  const { m } = g;
  await g.newPart();
  g.sketch({ kind: 'std', name: 'top' }, g.rect(0, 0, 120, 70), g.T('판', 'Plate'));
  await g.settle(500);
  await g.cm('sheetMetal');
  await m.run('baseFlange'); await g.view('iso'); await g.fit(); await g.settle(1000);
  g.mark('#left-panel', 1, g.T('두께 · 굽힘 반지름 · K 계수', 'Thickness · bend radius · K-factor'), { at: 'br', pad: -1 });
  return null;
});
scene('tut-sm-edge', async (g) => {
  const { m } = g;
  m.actions.acceptEditing(); await g.settle(800);
  const entry = m.state.partEntry;
  const i = entry.edgeList.findIndex((ed) => ed.geomType === 'LINE' && ed.startPoint.x > 119.9 && ed.endPoint.x > 119.9 && ed.startPoint.y > 1 && ed.endPoint.y > 1);
  m.actions.select([{ kind: 'edge', bodyKey: 'body', index: i, key: `edge:body:${i}` }]);
  await m.run('edgeFlange'); m.actions.pmFieldChanged('length', '35', 'length'); await g.settle(1200);
  const pick = document.querySelector('#left-panel .pm-pick');
  if (pick) g.mark(pick, 1, g.T('판 윗면의 직선 모서리', 'A straight top edge of the sheet'), { at: 'below' });
  return null;
});
scene('tut-sm-flat', async (g) => {
  const { m } = g;
  m.actions.acceptEditing(); await g.settle(800);
  await m.run('flatten'); await g.view('top'); await g.fit(); await g.settle(800);
  g.mark('#view-host', 1, g.T('전개도 (굽힘 여유 포함)', 'Flat pattern (bend allowance included)'), { at: 'tl', pad: -1, dy: 26 });
  return null;
});
scene('tut-drawing-bom', async (g) => {
  const { m } = g;
  await m.run('flatten');
  await g.sample('shaftAssembly'); await g.settle(500);
  await m.actions.newDrawing(); await g.settle(1500);
  await m.run('bom'); await g.settle(1200);
  const bom = document.querySelector('.drawing-paper svg .bom');
  if (bom) g.mark(bom, 1, g.T('부품표 (BOM)', 'Bill of materials'), { pad: 4, at: 'above' });
  return g.clip(['.drawing-paper']);
});

// ───────────────────────── run

if (until && scenes.some((s) => s.name === until)) scenes.splice(scenes.findIndex((s) => s.name === until) + 1);

function stepsFor(lang) {
  const steps = [
    { name: 'kernel', eval: 'window.__mymechanics.actions.ensureKernel().then(() => \'ready\')', expect: '^ready$' },
    { name: 'helpers', eval: `(${installHelpers})(${JSON.stringify(lang)})`, expect: '^helpers$' },
  ];
  if (lang === 'en') steps.push({ name: 'English', eval: '(async () => { await window.__mymechanics.run(\'language\'); await new Promise((r) => setTimeout(r, 400)); return document.querySelector(\'[data-menu="insert"]\')?.textContent.trim() ?? document.documentElement.lang; })()', expect: 'Insert|en' });
  for (const s of scenes) {
    if (s.mouse) { steps.push({ mouse: s.mouse() }); continue; }
    steps.push({ name: `${lang}/${s.name}`, eval: `/* ${s.name} */ (async () => { const g = window.__g; g.clear(); const clip = await (${s.fn})(g); window.__clip = clip ?? null; return 'ok'; })()`, expect: '^ok$', wait: 250 });
    if (!s.noShot && (!only || only.has(s.name))) steps.push({ shot: s.name, clip: 'window.__clip' });
    if (!s.noShot) steps.push({ eval: 'window.__g.clear() ?? undefined' });
  }
  return steps;
}

const outRoot = path.join(root, 'doc', 'images');
let failed = false;
for (const lang of languages) {
  const raw = path.join(tmpdir(), `mymechanics-guide-${lang}-${process.pid}`);
  fs.mkdirSync(raw, { recursive: true });
  const stepsFile = path.join(raw, 'steps.json');
  fs.writeFileSync(stepsFile, JSON.stringify(stepsFor(lang), null, 1));
  console.log(`── ${lang}: ${scenes.filter((s) => !s.mouse && !s.noShot).length} pictures`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'smoke-web.mjs'), '--out', raw, '--steps', stepsFile, '--width', '1600', '--height', '960'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const log = `${r.stdout}${r.stderr}`;
  fs.writeFileSync(path.join(raw, 'smoke.log'), log);
  // Problems, each once, with the scene they came after.
  let last = '';
  const seen = new Set();
  for (const line of log.split(/\r?\n/)) {
    if (/^✔ /.test(line)) last = line.slice(2).replace(/ \[\d+ ms\]$/, '');
    if (!/✘|^\s+! (?!warning)/.test(line)) continue;
    failed = true;
    const key = `${last} ${line}`;
    if (!seen.has(key)) { seen.add(key); console.log(`${line.slice(0, 300)}   (after ${last || 'start'})`); }
  }
  if (!fs.readdirSync(raw).some((f) => f.endsWith('.png'))) { failed = true; console.log(`smoke-web stopped (exit ${r.status}) before any picture:\n${log.split(/\r?\n/).slice(-15).join('\n')}`); }
  const dir = path.join(outRoot, lang);
  fs.mkdirSync(dir, { recursive: true });
  for (const s of scenes) {
    if (s.mouse || s.noShot || (only && !only.has(s.name))) continue;
    const src = path.join(raw, `${s.name}.png`);
    if (!fs.existsSync(src)) { console.log(`✘ ${lang}/${s.name}: no picture`); failed = true; continue; }
    const image = sharp(src);
    const meta = await image.metadata();
    const out = path.join(dir, `${s.name}.png`);
    await image.resize({ width: Math.min(meta.width, MAX_WIDTH), withoutEnlargement: true }).png({ palette: true, quality: 92, effort: 8, compressionLevel: 9 }).toFile(out);
    const { size } = fs.statSync(out);
    console.log(`📷 doc/images/${lang}/${s.name}.png ${Math.min(meta.width, MAX_WIDTH)}×${Math.round(meta.height * Math.min(1, MAX_WIDTH / meta.width))} ${Math.round(size / 1024)} KB`);
  }
  if (!args.includes('--keep')) fs.rmSync(raw, { recursive: true, force: true });
  else console.log(`  raw shots and steps: ${raw}`);
}
console.log(failed ? 'Some scenes reported problems (see above).' : 'Done. Now run: npm run build:docs');
process.exitCode = failed ? 1 : 0;

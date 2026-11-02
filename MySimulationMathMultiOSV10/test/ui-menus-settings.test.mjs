// Context menus in one column, the settings controls on one width, and 모델로 변환 (a script or
// its selection → the 수식으로 모델 만들기 dialog) from the editor's context menu and ribbon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { columnsOf, menuSize, ROW_H } from '../src/lib/menuColumns.js';
import { t, setLanguage } from '../src/lib/i18n.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const items = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, label: `Item ${i}` }));

test('a menu may keep one column however long it is', () => {
  assert.equal(columnsOf(items).length, 2, 'drop-downs: two columns past 6 items');
  assert.equal(columnsOf(items, { columns: 1 }).length, 1);
  assert.equal(columnsOf(items, { columns: 1 })[0].length, 12);
  const one = menuSize(items, 260, { columns: 1 });
  assert.equal(one.width, 260);
  assert.equal(one.columns, 1);
  assert.equal(one.height, 12 * ROW_H + 10);
  assert.equal(menuSize(items, 260).columns, 2);
});

test('context menus (opened at a point) are one column, in the page and in the popup window', () => {
  const menu = read('../src/lib/menu.js');
  assert.match(menu, /const columns = at && at\.bottom != null \? 2 : 1;/);
  assert.match(menu, /menuSize\(list, width, \{ columns \}\)/);
  assert.match(menu, /items: list, columns \}/);
  assert.match(menu, /current = \{ anchor, items, onPick, width, columns \};/);
  assert.match(read('../src/views/PopupWindow.jsx'), /columnsOf\(items, \{ columns \}\)/);
  assert.match(read('../src/views/PopupWindow.jsx'), /columns=\{payload\.columns \|\| 2\}/);
  assert.match(read('../src/components/MenuHost.jsx'), /\{ columns: menu\.columns \|\| 2 \}/);
  const tabs = read('../src/components/DocTabs.jsx');
  assert.match(tabs, /menuSize\(items, 240, \{ columns: 1 \}\)/);
  assert.match(tabs, /items, columns: 1 \}/);
});

test('settings: drop-downs and switches share one width, steppers another', () => {
  const css = read('../src/styles.css');
  assert.match(css, /\.st-field \{ --st-ctl-w: 360px; \}/);
  assert.match(css, /\.st-field \.iselect \{ width: var\(--st-ctl-w\) !important;/);
  assert.match(css, /\.st-field \.toggle \{ width: var\(--st-ctl-w\);/);
  assert.match(css, /\.st-field \.st-inline \.toggle \{ width: auto; \}/);
  assert.match(css, /\.st-field \.stepper \.step-value \{ width: 94px !important; \}/);
});

test('모델로 변환: editor context menu and ribbon open the equations dialog with the script', () => {
  const cm = read('../src/lib/contextMenus.js');
  assert.match(cm, /\{ id: 'toModel', label: t\(text \? 'cm_to_model_sel' : 'cm_to_model'\), icon: 'model', disabled: !extras\.toModel \}/);
  assert.match(cm, /else if \(id === 'toModel'\) extras\.toModel\(text \|\| view\.state\.doc\.toString\(\)\);/);
  const app = read('../src/App.jsx');
  assert.match(app, /const toModel = \(text\) => \{ loadSim\(\); setDialog\(\{ kind: 'toModel', text: String\(text \|\| ''\) \}\); \};/);
  assert.match(app, /toModel\(ed\.selection\(\) \|\| ed\.getText\(\)\)/);
  assert.match(app, /\{ id: 'toModel', icon: 'model', label: t\('rb_to_model'\)/);
  assert.match(app, /<EquationDialogGuard lang=\{getLanguage\(\)\} engine=\{engine\} running=\{false\} initialText=\{dialog\.text\}/);
  assert.match(read('../src/panes/Guarded.jsx'), /useModule\(loadSim, 'EquationDialog'\)/);
  assert.match(read('../src/sim/index.js'), /export \{ EquationDialog \} from '\.\/EquationDialog\.jsx';/);
  const dlg = read('../src/sim/EquationDialog.jsx');
  assert.match(dlg, /initialText != null && String\(initialText\)\.trim\(\) \? String\(initialText\) : EQ_EXAMPLES\[0\]\.text/);
  assert.match(dlg, /\{onInsert && \(/, 'no diagram to add to from a script');
  for (const lang of ['ko', 'en']) {
    setLanguage(lang);
    for (const k of ['cm_to_model', 'cm_to_model_sel', 'rb_to_model', 'rb_to_model_tip']) assert.notEqual(t(k), k, `${lang}.${k}`);
  }
  assert.ok(!/matl[a]b|simul[i]nk/i.test(read('../src/lib/i18n.js')), 'name rule');
});

test('bottom panel tabs: 명령 창, 문제점, then 도움말 on the far right', () => {
  const app = read('../src/App.jsx');
  const at = app.indexOf('const bottomTabs = [');
  const block = app.slice(at, app.indexOf('];', at));
  const ids = [...block.matchAll(/\{ id: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['cmd', 'problems', 'help']);
});

test('스크립트로: the model editor toolbar and canvas menu open the model as M code in a script tab', async () => {
  const ed = read('../src/sim/ModelEditor.jsx');
  assert.match(ed, /import \{ modelToCode \} from '\.\.\/\.\.\/core\/sim\/codegen\.js';/);
  assert.match(ed, /const toScript = \(\) => \{ if \(onOpenScript\) onOpenScript\(modelToCode\(modelRef\.current, nameRef\.current, \{ script: true \}\)\); \};/);
  assert.match(ed, /\{onOpenScript && <TB icon="script" label=\{L\('toScript'\)\} title=\{L\('toScript_tip'\)\} onClick=\{toScript\} \/>\}/);
  assert.match(ed, /\{ icon: 'script', label: L\('toScript_menu'\), run: toScript \}/);
  assert.match(read('../src/App.jsx'), /onOpenScript=\{\(code\) => newScript\(code\)\}/);
  assert.match(read('../src/sim/icons.jsx'), /\n {2}script: /);
  const { tr } = await import('../src/sim/i18n.js');
  for (const lang of ['ko', 'en']) for (const k of ['toScript', 'toScript_tip', 'toScript_menu']) assert.notEqual(tr(lang, k), k, `${lang}.${k}`);
});

test('the model as a script runs on its own: builds the model (workspace values too), again when loaded, and opens it', async () => {
  const { equationModel } = await import('../core/sim/eqmodel.js');
  const { modelToCode } = await import('../core/sim/codegen.js');
  const { createSession } = await import('../core/session.js');
  const { createMemoryFs } = await import('../core/fs-memory.js');
  const { model } = equationModel("w = 2\nx'' = -w^2*x\nx(0) = 1", { name: 'osc', stopTime: String(Math.PI / 2) });
  const code = modelToCode(model, 'osc', { script: true });
  assert.match(code, /^try\n {2}new_system\(mdl\);\ncatch\n/m);
  assert.match(code, /^w = 2;$/m, 'the model workspace value');
  assert.match(code, /\nopen_system\(mdl\);\n$/);
  assert.doesNotMatch(modelToCode(model, 'osc'), /new_system|open_system/, 'the code view keeps its own form');
  const posts = [];
  const s = createSession({ fs: createMemoryFs(), print: () => {}, host: { post: (m) => posts.push(m), request: () => null } });
  const run = (c) => { const r = s.evaluate(c); assert.ok(r.ok, r.error && r.error.message); };
  run(code);
  assert.ok(posts.some((p) => p.type === 'sim.openEditor' && p.name === 'osc'), 'opened');
  run("o = sim('osc', 'SolverType', 'Fixed-step', 'Solver', 'ode4', 'FixedStep', '0.001'); y = o.yout(end);");
  const y = s.getVariable('y').re[0];
  assert.ok(Math.abs(y - Math.cos(Math.PI)) < 1e-4, `x(π/2) = cos(π) = -1, got ${y}`);
  run(code);   // already loaded: emptied and built again
  run("n = numel(find_system('osc', 'SearchDepth', 1, 'Type', 'block'));");
  assert.equal(s.getVariable('n').re[0], model.root.blocks.length, 'no doubled blocks');
});

test('no documents: the bottom panel keeps its height; the empty area asks for a script or a model', () => {
  const app = read('../src/App.jsx');
  assert.match(app, /<div className="cmd-slot" style=\{layout\.cmd\.on \? \{ height: L\.cmdH \} : \{ display: 'none' \}\}>/);
  assert.doesNotMatch(app, /cmd-slot \$\{hasDocs \? '' : 'fill'\}/, 'it no longer fills the column');
  assert.match(app, /\{layout\.cmd\.on && \(\r?\n\s*<Splitter axis="y"/, 'resizable with or without documents');
  const at = app.indexOf('data-empty="docs"');
  assert.ok(at > 0);
  const block = app.slice(at, app.indexOf('</span>', at));
  for (const act of ['newScript', 'newModel', 'open', 'start']) assert.ok(block.includes(`data-act="${act}"`), act);
  assert.match(block, /\{!layout\.cmd\.on && <button[^>]*data-act="cmd"/, 'Command Window button only when it is closed');
  assert.doesNotMatch(read('../src/app.css'), /\.cmd-slot\.fill/);
  for (const lang of ['ko', 'en']) { setLanguage(lang); assert.notEqual(t('pn_empty_docs'), 'pn_empty_docs'); }
});

test('run buttons follow the state: model toolbar and 시뮬레이션 ribbon share simButtons; scripts follow busy / debug', async () => {
  const { simButtons } = await import('../src/sim/logic.js');
  const on = (st) => Object.entries(simButtons(st)).filter(([, v]) => v).map(([k]) => k).sort().join(',');
  assert.equal(on(null), '', 'no model: all off');
  for (const st of ['idle', 'stopped', 'done', 'error']) assert.equal(on(st), 'run,step', st);
  assert.equal(on('compiling'), 'stop');
  assert.equal(on('running'), 'pause,stop');
  assert.equal(on('paused'), 'pause,paused,run,step,stop');
  const app = read('../src/App.jsx');
  assert.match(app, /const simBtn = simButtons\(isModel && simApi \? \(simApi\.status && simApi\.status\.state\) \|\| 'idle' : null\);/);
  for (const [id, k] of [['sim:run', 'run'], ['sim:pause', 'pause'], ['sim:step', 'step'], ['sim:stopRun', 'stop']]) {
    assert.match(app, new RegExp(`\{ id: '${id}'[^\n]*disabled: !simBtn\.${k},`), id);
  }
  const ed = read('../src/sim/ModelEditor.jsx');
  for (const k of ['run', 'pause', 'step', 'stop']) assert.match(ed, new RegExp(`disabled=\{!btn\.${k}\}`), k);
  // scripts: Run / Step run off while busy, the debugger's steps only while paused, Stop while busy or debugging
  assert.match(app, /\{ id: 'run', icon: 'play', label: t\('rb_run'\), keys: 'F5', primary: true, disabled: !isEditor \|\| busy,/);
  assert.match(app, /\{ id: 'continue', icon: 'continue', label: t\('rb_continue'\), keys: 'F5', disabled: !debug,/);
  assert.match(app, /\{ id: 'stopDebug', icon: 'stop', label: t\('rb_stop'\), disabled: !debug && !busy,/);
  for (const lang of ['ko', 'en']) { setLanguage(lang); assert.notEqual(t('sim_continue'), 'sim_continue'); }
});

test('the model toolbar time sits on the buttons\' centre line', () => {
  const css = read('../src/sim/sim.css');
  assert.match(css, /\.sim-time \{ position: relative; display: inline-flex; align-items: center; height: 28px;/);
  assert.match(css, /\.sim-progress \{ position: absolute;/);
  assert.match(css, /\.sim-tb \{ display: inline-flex; align-items: center; gap: 5px; height: 28px;/);
});

test('the ribbon follows the model state without a render loop (re-render only when a state changed)', async () => {
  const { publishSimEditor, withdrawSimEditor, simEditorStates } = await import('../src/sim/editorApi.js');
  publishSimEditor('d1', { status: { state: 'running' } });
  publishSimEditor('d2', {});
  assert.deepEqual(simEditorStates(), ['d1:running', 'd2:idle']);
  withdrawSimEditor('d1'); withdrawSimEditor('d2');
  const app = read('../src/App.jsx');
  assert.match(app, /const now = \[\.\.\.simEditorStates\(\)\]\.join\('\|'\);\r?\n\s*setSimStates\(\(prev\) => \(prev === now \? prev : now\)\);/);
  assert.doesNotMatch(app, /setSimTick/, 'a publish alone must not re-render the app');
});

test('no lazy import of modules the app imports anyway (vite reporter warnings)', () => {
  assert.doesNotMatch(read('../src/components/Tutorial.jsx'), /import\('\.\.\/lib\/popups'\)/);
  assert.match(read('../src/components/GuideWindow.jsx'), /import\.meta\.glob\('\.\.\/print\/index\.js', \{ eager: true \}\)/);
});

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

test('the app answers the engine: sound and recording (audioHost), web, panes, openvar, exit', () => {
  const app = read('../src/App.jsx');
  assert.match(app, /installAudioHost\(engine\),/);
  assert.match(app, /engine\.onRequest\('web\.open', \(m\) => \{ if \(m && m\.url\) openExternal\(m\.url\); return \{ ok: true \}; \}\)/);
  assert.match(app, /engine\.on\('event:showPane'/);
  assert.match(app, /engine\.on\('event:openVariable'/);
  assert.match(app, /engine\.on\('event:exit'/);
  assert.doesNotMatch(app, /function playAudio/, 'the old player (it read fields the engine does not send) is gone');
  const host = read('../src/lib/audioHost.js');
  for (const t of ['audio.play', 'audio.stop', 'audio.pause', 'audio.resume', 'audio.beep', 'audio.record.pause', 'audio.record.resume']) assert.ok(host.includes(`engine.on('${t}'`), t);
  for (const t of ['audio.playBlocking', 'audio.devices', 'audio.record.start', 'audio.record.data', 'audio.record.stop', 'audio.recordBlocking']) assert.ok(host.includes(`engine.onRequest('${t}'`), t);
  // the fields the engine posts (core/lib/io/audio.js) are the ones the host reads
  const eng = read('../core/lib/io/audio.js');
  assert.match(eng, /type: 'audio\.play', id: [^,]+, sampleRate: [^,]+, numChannels: [^,]+, frames[^,]*, channels/);
  assert.match(host, /Number\(msg\.sampleRate\)/);
  assert.match(host, /msg\.channels/);
});

test('start page: the model examples come after the samples (new layouts, and saved version-2 layouts once)', async () => {
  assert.match(read('../src/views/StartPage.jsx'), /CARD_IDS = \['hero', 'templates', 'recent', 'side', 'help', 'samples', 'models'\]/);
  const { cardsOf, layoutValue } = await import('../src/lib/startLayout.js');
  const ids = ['hero', 'samples', 'models'];
  const span = { hero: 3, samples: 3, models: 3 };
  const fresh = cardsOf(null, ids, span, { hero: 4, samples: 6, models: 6 });
  assert.ok(fresh.samples.row < fresh.models.row, 'new layout: samples first');
  // a saved layout from before: models above samples → moved below once
  const old = { version: 2, cards: { hero: { col: 0, row: 0, w: 3, h: 4, fit: true }, models: { col: 0, row: 4, w: 3, h: 6, fit: true }, samples: { col: 0, row: 10, w: 3, h: 6, fit: true } } };
  const moved = cardsOf(old, ids, span, { hero: 4, samples: 6, models: 6 });
  assert.ok(moved.samples.row < moved.models.row, 'version 2: models moved below the samples');
  assert.equal(moved.samples.row, 4, 'the samples float up into the free place');
  const saved = layoutValue(moved);
  assert.equal(saved.version, 3);
  // version 3: the user's own order stays (models above samples is kept)
  const mine = { version: 3, cards: old.cards };
  const kept = cardsOf(mine, ids, span, { hero: 4, samples: 6, models: 6 });
  assert.ok(kept.models.row < kept.samples.row, 'a version-3 layout is the user\'s choice');
});

test('a graphical script converts to a script: canvas right-click menu, toolbar and Editor ribbon', () => {
  const fe = read('../src/flow/FlowEditor.jsx');
  assert.match(fe, /onContextMenu=\{onMenu\}/);
  assert.match(fe, /\{ id: 'toScript', label: t\('fl_to_script'\), icon: 'script', disabled: !hasCode \}/);
  assert.match(fe, /if \(pick === 'toScript'\) actions\.openAsScript\(gen\.code\);/);
  for (const k of ['run', 'export', 'undo', 'redo', 'all', 'remove', 'fit']) assert.ok(fe.includes(`pick === '${k}'`), k);
  assert.match(fe, /<Tb icon="script" label=\{t\('fl_to_script'\)\}/);
  const app = read('../src/App.jsx');
  assert.match(app, /\{ id: 'flowToScript', icon: 'script', label: t\('fl_to_script'\), tip: t\('rb_flow_to_script_tip'\), disabled: !isFlow, run: \(\) => \{ const fe = editors\.current\.get\(active\); if \(fe && fe\.code\) newScript\(fe\.code\(\)\); \} \}/);
  assert.match(app, /openAsScript: \(code\) => newScript\(code\)/);
  for (const lang of ['ko', 'en']) { setLanguage(lang); for (const k of ['fl_to_script', 'rb_flow_to_script_tip']) assert.notEqual(t(k), k, `${lang}.${k}`); }
});

test('the graphical editor has a 코드 view toggle: a read-only code pane with a remembered width', () => {
  const fe = read('../src/flow/FlowEditor.jsx');
  assert.match(fe, /<Tb icon="code" label=\{t\('fl_code_view'\)\} title=\{t\('fl_code_view_tip'\)\} on=\{panes\.code\} onClick=\{\(\) => togglePane\('code'\)\} \/>/);
  assert.match(fe, /<Splitter axis="x" dir=\{-1\}/);
  assert.match(fe, /savePanes\(\(p\) => \(\{ \.\.\.p, codeW: w \}\)\)/, 'the dragged width is kept with the panes');
  assert.match(fe, /<FlowCodePane width=/);
  const pane = read('../src/flow/FlowCodePane.jsx');
  assert.match(pane, /EditorState\.readOnly\.of\(true\)/);
  assert.match(pane, /data-act="toScript"/);
  for (const lang of ['ko', 'en']) { setLanguage(lang); for (const k of ['fl_code_view', 'fl_code_view_tip', 'fl_code_close', 'sp_t_flow', 'sp_t_flow_d']) assert.notEqual(t(k), k, `${lang}.${k}`); }
});

test('the start page and the empty editor area make a new graphical script', () => {
  const sp = read('../src/views/StartPage.jsx');
  assert.match(sp, /\['newFlow', 'flow', 'sp_t_flow', 'sp_t_flow_d'\]/);
  assert.match(sp, /onAction\('newFlow'\)/);
  const app = read('../src/App.jsx');
  assert.match(app, /newModel,\r?\n\s+newFlow,/);
  assert.match(app, /data-act="newFlow" onClick=\{\(\) => newFlow\(\)\}/);
});

test('the bottom panel keeps the height its splitter set, for every tab, with or without documents', () => {
  const app = read('../src/App.jsx');
  assert.match(app, /onCommit=\{\(v\) => \{ setLive\(\(\{ cmdH, \.\.\.x \}\) => x\); setLayout\(\{ cmdH: v \}\); \}\}/, 'the drag size is dropped, not set to undefined');
  assert.doesNotMatch(app, /cmdH: undefined/);
  assert.match(app, /if \(!\(L\.cmdH > 0\)\) L\.cmdH = DEFAULT_CMD_H;/);
  // one slot for all three tabs, sized by the splitter
  assert.match(app, /<div className="cmd-slot" style=\{layout\.cmd\.on \? \{ height: L\.cmdH \} : \{ display: 'none' \}\}>\{commandWindow\}<\/div>/);
  const L = { ...{ cmdH: 300 }, ...(({ cmdH, ...x }) => x)({ cmdH: 340 }) };
  assert.equal(L.cmdH, 300, 'after a drag ends the saved height is used');
});

test('start page help and function search show their answer in the Command Window', () => {
  const app = read('../src/App.jsx');
  assert.match(app, /helpCmd: \(\) => \{ setStartOn\(false\); showPane\('cmd'\); runCode\('help'\); \}/);
  assert.match(app, /if \(key\) \{ setStartOn\(false\); showPane\('cmd'\); runCode\(`lookfor\('\$\{key\}'\)`\); \}/);
  assert.ok(app.includes(String.raw`replace(/[^\p{L}\p{N}_ ]/gu, '')`), 'Korean keywords are kept');
});

test('the title bar icons share one hue (settings is not grey any more)', async () => {
  const chrome = read('../src/components/Chrome.jsx');
  assert.match(chrome, /\|uncomment\|settings\)\$\/, 'cyan'\]/);
  assert.doesNotMatch(chrome, /\[\/\^\(settings\|wrench/);
});

test('the graphical editor has a 변수 block whose name is edited on the block', () => {
  const fe = read('../src/flow/FlowEditor.jsx');
  assert.match(fe, /\{ type: 'var', icon: 'variable', label: t\('fl_var'\), tip: t\('fl_var_tip'\) \}/);
  assert.match(fe, /n\.type === 'var' \? 1 : 0/);
  assert.match(fe, /\{n\.type === 'var' && \(/);
  for (const lang of ['ko', 'en']) { setLanguage(lang); assert.notEqual(t('fl_var_tip'), 'fl_var_tip'); }
});

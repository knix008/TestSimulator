// npm run capture:guide — the user's guide pictures (public/doc/images/<name>-<ko|en>.png) from the real app:
// the web build in headless Edge with a web core (scripts/smoke-web.mjs), once per language. The autonomous
// dev loop runs here first in Node (the web core may not run commands) and the page shows that run.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCore } from '../core/app.js';
import { buildTemplate } from '../core/templates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'doc', 'images');
fs.mkdirSync(out, { recursive: true });
const runFile = path.join(root, 'test-results', 'guide-run.json');
fs.mkdirSync(path.dirname(runFile), { recursive: true });

// one real run of the dev loop per language (phases and texts follow the language)
for (const lang of ['ko', 'en']) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myagents-guide-'));
  const core = createCore({ mode: 'test', dataDir: null, mockDelay: 1, samples: false });
  core.settings.update({ workDir: work, allowShell: true });
  const doc = core.agents.create(buildTemplate('autodev-loop', lang));
  const run = await core.engine.wait(core.engine.start(doc.id, { kind: 'manual' }).id);
  fs.writeFileSync(runFile.replace('.json', `-${lang}.json`), JSON.stringify({ doc, run }));
  await core.close();
  fs.rmSync(work, { recursive: true, force: true });
}

const closeAll = "await A.popups.closeAll(); for (const el of document.querySelectorAll('.web-popup, .web-popup-shield')) el.remove(); A.popups.frames.clear(); document.querySelector('.tour')?.remove();";
const frame = (kind) => `document.querySelector('.web-popup-${kind} iframe')?.contentDocument`;

function steps(lang) {
  const shot = (name) => `${name}-${lang}`;
  return [
    { until: "window.__myagents && window.__myagents.state.core.status === 'ready'", wait: 400 },
    { eval: `(async () => { const A = window.__myagents; A.actions.updateSettings({ language: '${lang}', showWelcome: false, runDonePopup: true, bottomHeight: 300, startArrange: 'vertical', startLayout: null }); A.actions.showStartPage(true); return 1; })()`, wait: 1500, shot: shot('start') },
    // the dev loop with its run: canvas, progress, code
    { eval: `(async () => { const A = window.__myagents; ${closeAll} const { doc, run } = await (await fetch('/test-results/guide-run-${lang}.json')).json(); await A.actions.openNew(doc); A.run('fit'); A.editor.state.shown = run; A.editor.state.canvas?.setSelection([doc.nodes[8].id]); A.actions.showBottomTab('run'); return 1; })()`, until: "document.querySelectorAll('.canvas-host .node').length > 20", wait: 1200, shot: shot('editor') },
    { eval: "(window.__myagents.actions.showBottomTab('progress'), 1)", until: "document.querySelector('.pg-phases')", wait: 600, shot: shot('progress') },
    { eval: "(() => { window.__myagents.actions.showBottomTab('code'); return 1; })()", until: "document.querySelector('.code-body')", wait: 300 },
    { eval: "(() => { document.querySelector('[data-code-file$=\"src/todo.mjs\"]')?.click(); return 1; })()", wait: 600, shot: shot('code') },
    // input and output: Read → Save as PDF, the Save node selected
    { eval: `(async () => { const A = window.__myagents; ${closeAll} await A.actions.openNew({ name: '${lang === 'ko' ? '보고서 PDF 만들기' : 'Make a PDF report'}', nodes: [
        { id: 't', type: 'trigger.manual', name: '${lang === 'ko' ? '시작' : 'Start'}', x: 80, y: 160, config: {} },
        { id: 'r', type: 'io.read', name: '${lang === 'ko' ? '엑셀 읽기' : 'Read Excel'}', x: 380, y: 160, config: { source: 'file', path: 'inbox/sales.xlsx', format: 'auto' } },
        { id: 's', type: 'ai.summarize', name: '${lang === 'ko' ? '요약' : 'Summarize'}', x: 680, y: 160, config: { input: '{{ input.text }}' } },
        { id: 'w', type: 'io.write', name: '${lang === 'ko' ? 'PDF로 저장' : 'Save as PDF'}', x: 980, y: 160, config: { value: '{{ input.text }}', format: 'pdf', target: 'file', path: 'output/report' } },
      ], edges: [{ id: 'a', from: 't', fromPort: 'out', to: 'r' }, { id: 'b', from: 'r', fromPort: 'out', to: 's' }, { id: 'c', from: 's', fromPort: 'out', to: 'w' }] });
      A.run('fit'); A.editor.state.canvas.setSelection(['w']); A.actions.showRightTab('node'); return 1; })()`, until: "document.querySelector('#inspector-host [data-field=\"path\"]')", wait: 800, shot: shot('io') },
    // a run and its result window
    { eval: `(async () => { const A = window.__myagents; ${closeAll} await A.actions.fromTemplate('log-analyzer'); A.run('fit'); A.actions.showBottomTab('run'); A.run('runAgent'); return 1; })()`, until: `${frame('rundone')}?.querySelector('.rundone')`, wait: 900, shot: shot('result') },
    // print
    { eval: `(async () => { const A = window.__myagents; ${closeAll} A.run('print'); return 1; })()`, until: `${frame('print')}?.querySelector('#print-preview .pp-page')`, wait: 1200, shot: shot('print') },
    // models & keys, the settings keys tab
    { eval: `(async () => { const A = window.__myagents; ${closeAll} A.actions.setView('models'); return 1; })()`, until: "document.querySelector('.model-card')", wait: 1500, shot: shot('models') },
    { eval: `(async () => { const A = window.__myagents; ${closeAll} A.actions.setView('editor'); A.run('settings'); return 1; })()`, until: `${frame('settings')}?.querySelector('[data-action="tab"][data-value="keys"]')`, wait: 300 },
    { eval: `(() => { ${frame('settings')}.querySelector('[data-action="tab"][data-value="keys"]').click(); return 1; })()`, until: `${frame('settings')}?.querySelector('.key-list')`, wait: 600, shot: shot('keys') },
    // the tutorial
    { eval: `(async () => { const A = window.__myagents; ${closeAll} A.actions.runTutorial(); return 1; })()`, until: "window.__myagentsTour && document.querySelector('.tour-card .tour-text')", wait: 300 },
    { eval: '(async () => { const T = window.__myagentsTour; for (let i = 0; i < 4; i += 1) await T.next(); return T.index; })()', until: "document.querySelector('.tour')?.dataset.step === 'canvas'", wait: 900, shot: shot('tutorial') },
    { eval: `(async () => { const A = window.__myagents; ${closeAll} A.actions.updateSettings({ language: 'ko' }); return 1; })()`, wait: 300 },
  ];
}

for (const lang of ['ko', 'en']) {
  const file = path.join(os.tmpdir(), `myagents-guide-steps-${lang}.json`);
  fs.writeFileSync(file, JSON.stringify(steps(lang)));
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'smoke-web.mjs'), '--out', out, '--steps', file, '--core', '--width', '1400', '--height', '860'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`[capture-guide] ${lang} failed (exit ${r.status})`); process.exit(1); }
}
const made = fs.readdirSync(out).filter((f) => f.endsWith('.png'));
console.log(`[capture-guide] ${made.length} pictures in public/doc/images`);

// The autonomous development loop: requirement → get the existing code → analyse → implement (code + unit
// tests) → unit tests → integration tests → GUI tests (a real headless browser) → report; when anything fails,
// analyse the failures, fix and test again (up to N rounds). Every node carries a phase, so the Progress tab
// shows how far the loop is, and the Code tab shows every file as it is written.
//
// With the offline test model the "model" steps fall back to a worked example: the first implementation has a
// deliberate bug (remaining() counts the finished items), so the loop really goes round once before it passes.
import { builder, L } from './template-builder.js';

const json = (v) => JSON.stringify(v, null, 2);
const files = (pairs) => pairs.map(([path, content]) => ({ path, content }));

// ───────── the existing project (written when no repository is given)
const STORE_V0 = String.raw`// Todo store: add and list.
export function createStore() {
  const items = [];
  return {
    add(text) {
      const t = String(text).trim();
      if (!t) throw new Error('empty todo');
      const item = { id: items.length + 1, text: t, done: false };
      items.push(item);
      return item;
    },
    list() { return items.slice(); },
  };
}
`;
const RENDER_V0 = String.raw`// HTML of the list.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function renderApp(store) {
  return '<ul id="list">' + store.list().map((i) => '<li data-id="' + i.id + '">' + esc(i.text) + '</li>').join('') + '</ul>';
}
`;
const UNIT_V0 = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/todo.mjs';

test('add puts a todo in the list', () => {
  const s = createStore();
  s.add('milk');
  assert.equal(s.list().length, 1);
  assert.throws(() => s.add('  '));
});
`;
const INDEX = String.raw`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Todos</title>
<style>body{font:15px system-ui;margin:24px} li.done{text-decoration:line-through;color:#888} #remaining{color:#555}</style></head>
<body>
  <h1>Todos</h1>
  <form id="add"><input id="text" placeholder="What needs doing?"><button>Add</button></form>
  <div id="app"></div>
  <script type="module">
    import { createStore } from './src/todo.mjs';
    import { renderApp } from './src/render.mjs';
    const store = createStore();
    const app = document.getElementById('app');
    const draw = () => { app.innerHTML = renderApp(store); };
    document.getElementById('add').addEventListener('submit', (e) => { e.preventDefault(); const t = document.getElementById('text'); store.add(t.value); t.value = ''; draw(); });
    app.addEventListener('change', (e) => { const id = Number(e.target.closest('li')?.dataset.id); if (store.toggle) { store.toggle(id); draw(); } });
    draw();
    // GUI self test (?selftest): uses the page like a person would and writes the results into the page.
    if (location.search.includes('selftest')) {
      const results = [];
      const check = (name, ok) => results.push({ name, ok: Boolean(ok) });
      const type = (text) => { document.getElementById('text').value = text; document.getElementById('add').requestSubmit(); };
      try {
        type('milk'); type('bread'); type('eggs');
        check('three items shown', app.querySelectorAll('li').length === 3);
        const box = app.querySelector('li input[type=checkbox]');
        check('each item has a checkbox', Boolean(box));
        if (box) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
        check('a ticked item is struck through', app.querySelectorAll('li.done').length === 1);
        check('the remaining count reads "2 left"', (document.getElementById('remaining') || {}).textContent === '2 left');
      } catch (err) { check('no error: ' + err.message, false); }
      const pre = document.createElement('pre');
      pre.id = 'selftest';
      pre.textContent = JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
      document.body.append(pre);
    }
  </script>
</body>
</html>
`;
const GUI_TEST = String.raw`// GUI test: serves this folder, opens index.html?selftest in a headless browser (Edge or Chrome) and reads
// the results the page writes. Prints a node:test style summary; exit 1 when a check failed.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const root = process.cwd();
const candidates = [process.env.MYAGENTS_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'].filter(Boolean);
const browser = candidates.find((b) => fs.existsSync(b));
if (!browser) { console.log('# GUI test skipped: no Edge or Chrome found\n# pass 0\n# fail 0\n# skipped 1'); process.exit(0); }
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
server.listen(0, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html?selftest=1';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-test-'));
  execFile(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile, '--virtual-time-budget=4000', '--dump-dom', url], { timeout: 90000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
    const m = /<pre id="selftest">([\s\S]*?)<\/pre>/.exec(out || '');
    if (!m) { console.log('not ok - the page wrote no self-test results' + (err ? ' (' + err.message + ')' : '') + '\n# pass 0\n# fail 1'); process.exit(1); }
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    for (const c of r.results) console.log((c.ok ? 'ok - ' : 'not ok - ') + c.name);
    console.log('# pass ' + r.passed + '\n# fail ' + r.failed);
    process.exit(r.failed ? 1 : 0);
  });
});
`;

// ───────── the implementation (the worked example; v1 has the deliberate bug)
const STORE_V1 = (buggy) => String.raw`// Todo store: add, list, toggle done, count what is left.
export function createStore() {
  const items = [];
  return {
    add(text) {
      const t = String(text).trim();
      if (!t) throw new Error('empty todo');
      const item = { id: items.length + 1, text: t, done: false };
      items.push(item);
      return item;
    },
    list() { return items.slice(); },
    toggle(id) {
      const item = items.find((i) => i.id === id);
      if (!item) throw new Error('no todo ' + id);
      item.done = !item.done;
      return item;
    },
    remaining() { return items.filter((i) => ` + (buggy ? 'i.done' : '!i.done') + String.raw`).length; },
  };
}
`;
const RENDER_V1 = String.raw`// HTML of the list: a checkbox per item, done items struck through, and how many are left.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function renderApp(store) {
  const rows = store.list().map((i) => '<li data-id="' + i.id + '"' + (i.done ? ' class="done"' : '') + '><label><input type="checkbox"' + (i.done ? ' checked' : '') + '> ' + esc(i.text) + '</label></li>').join('');
  return '<ul id="list">' + rows + '</ul><p id="remaining">' + store.remaining() + ' left</p>';
}
`;
const UNIT_V1 = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/todo.mjs';

test('add puts a todo in the list', () => {
  const s = createStore();
  s.add('milk');
  assert.equal(s.list().length, 1);
  assert.throws(() => s.add('  '));
});

test('toggle marks a todo done and back', () => {
  const s = createStore();
  const a = s.add('milk');
  assert.equal(s.toggle(a.id).done, true);
  assert.equal(s.toggle(a.id).done, false);
  assert.throws(() => s.toggle(99));
});

test('remaining counts the todos not done', () => {
  const s = createStore();
  const a = s.add('a'); s.add('b'); s.add('c');
  s.toggle(a.id);
  assert.equal(s.remaining(), 2);
});
`;
const INTEGRATION = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/todo.mjs';
import { renderApp } from '../../src/render.mjs';

test('store and view together: done items are struck through and counted', () => {
  const s = createStore();
  const a = s.add('milk'); s.add('bread'); s.add('<b>eggs</b>');
  s.toggle(a.id);
  const html = renderApp(s);
  assert.equal((html.match(/class="done"/g) || []).length, 1);
  assert.match(html, /<p id="remaining">2 left<\/p>/);
  assert.match(html, /&lt;b&gt;eggs&lt;\/b&gt;/, 'text is escaped');
});
`;

const STARTER = files([['src/todo.mjs', STORE_V0], ['src/render.mjs', RENDER_V0], ['index.html', INDEX], ['test/unit/todo.test.mjs', UNIT_V0]]);
const IMPLEMENTATION = (buggy) => files([['src/todo.mjs', STORE_V1(buggy)], ['src/render.mjs', RENDER_V1], ['test/unit/todo.test.mjs', UNIT_V1], ['test/integration/app.test.mjs', INTEGRATION], ['gui-test.mjs', GUI_TEST]]);

/** Code node: the model's files when usable, else the worked example. */
const choose = (fallback, note) => String.raw`// ` + note + String.raw`
const fallback = ` + JSON.stringify(fallback) + String.raw`;
const given = input && input.data && Array.isArray(input.data.files) ? input.data.files : [];
const usable = given.length > 0 && given.every((f) => f && typeof f.path === 'string' && typeof f.content === 'string');
return { files: usable ? given : fallback, source: usable ? 'model' : 'example', changed: (usable ? given : fallback).map((f) => f.path) };`;

export const AUTODEV_TEMPLATE = {
  id: 'autodev-loop', group: 'pipeline', icon: 'robot',
  title: L('자율 개발 루프 (구현·테스트 반복)', 'Autonomous dev loop (implement & test until green)'),
  desc: L('요구사항 → 코드 가져오기 → 분석 → 구현·단위 테스트 → 통합 테스트 → GUI 테스트 → 보고, 실패하면 고쳐서 다시', 'Requirement → get code → analyse → implement & unit tests → integration → GUI tests → report; fix and repeat on failure'),
  build(lang) {
    const b = builder(lang);
    const ph = (ko, en) => ({ phase: lang === 'ko' ? ko : en });
    const P = {
      req: ph('1 요구사항', '1 Requirement'), get: ph('2 코드 가져오기', '2 Get code'), plan: ph('3 분석', '3 Analysis'), impl: ph('4 구현', '4 Implement'),
      unit: ph('5 단위 테스트', '5 Unit tests'), integ: ph('6 통합 테스트', '6 Integration tests'), gui: ph('7 GUI 테스트', '7 GUI tests'), report: ph('8 보고', '8 Report'),
    };
    const t = b.node('trigger.manual', L('요구사항', 'Requirement'), { sample: json({ project: 'todo-app', repo: '', maxRounds: 4, requirement: lang === 'ko' ? '할 일 목록 앱에 완료 표시(체크박스, 완료 항목 취소선)와 남은 개수 표시("N left")를 추가하세요. 단위·통합·GUI 테스트를 포함하세요.' : 'Add a done checkbox (finished items struck through) and a remaining count ("N left") to the todo app. Include unit, integration and GUI tests.' }) }, P.req);
    const dir = b.node('logic.set', L('작업 폴더', 'Work folder'), { values: [{ key: 'dir', value: 'autodev/{{ trigger.project }}' }] }, P.req);
    const reset = b.node('logic.counter', L('회차 초기화', 'Reset rounds'), { name: 'round', op: 'reset' }, P.req);
    const seed = b.node('logic.code', L('저장소 준비', 'Prepare repository'), { code: String.raw`// Without a repository path, the example project is written to the work folder as "the existing code".
const starter = ` + JSON.stringify(STARTER) + String.raw`;
return { files: trigger.repo ? [] : starter };` }, P.get);
    const seedLoop = b.node('logic.loop', L('시작 코드 쓰기', 'Write starter'), { items: '{{ input.files }}', max: 100 }, P.get);
    const seedWrite = b.node('tool.file', L('파일 쓰기', 'Write file'), { op: 'write', path: '{{ vars.dir }}/{{ item.path }}', content: '{{ item.content }}' }, P.get);
    const read = b.node('tool.project', L('기존 코드 읽기', 'Read existing code'), { path: '{{ trigger.repo || vars.dir }}' }, P.get);
    const analyse = b.node('ai.llm', L('요구사항 분석', 'Analyse requirement'), { system: L('시니어 개발자로서 요구사항을 기존 코드에 맞춰 작업 목록과 수용 기준으로 나누세요.', 'As a senior developer, break the requirement into tasks and acceptance criteria that fit the existing code.'), prompt: 'Requirement: {{ trigger.requirement }}\n\nExisting files: {{ input.tree | join:", " }}\n\n{{ input.files | json | truncate:12000 }}', json: true, schema: '{\n  "summary": "...",\n  "tasks": ["..."],\n  "acceptance": ["..."]\n}' }, P.plan);
    const implement = b.node('ai.llm', L('구현·테스트 작성', 'Implement & write tests'), { system: L('기존 코드를 고쳐 요구사항을 구현하세요. 바뀐 파일 전체와 단위 테스트(test/unit/*.test.mjs), 통합 테스트(test/integration/*.test.mjs)를 돌려주세요. ES 모듈, node:test.', 'Implement the requirement in the existing code. Return every changed file in full plus unit tests (test/unit/*.test.mjs) and integration tests (test/integration/*.test.mjs). ES modules, node:test.'), prompt: 'Requirement: {{ trigger.requirement }}\nPlan: {{ input.data | json }}\n\nExisting code:\n{{ nodes.' + read + '.output.files | json | truncate:16000 }}', json: true, schema: '{\n  "files": [{ "path": "src/….mjs", "content": "…" }]\n}', maxTokens: 32000 }, P.impl);
    const pick = b.node('logic.code', L('변경 파일 확정', 'Settle changes'), { code: choose(IMPLEMENTATION(true), 'The files the model wrote, or the worked example (its first version has a deliberate bug, so the fix loop shows).') }, P.impl);
    const writeLoop = b.node('logic.loop', L('코드 쓰기', 'Write code'), { items: '{{ input.files }}', max: 100 }, P.impl);
    const write = b.node('tool.file', L('파일 쓰기', 'Write file'), { op: 'write', path: '{{ vars.dir }}/{{ item.path }}', content: '{{ item.content }}' }, P.impl);
    const round = b.node('logic.counter', L('회차', 'Round'), { name: 'round', op: 'increment' }, P.impl);
    const unit = b.node('tool.test', L('단위 테스트', 'Unit tests'), { command: '"{{ env.node }}" --test \"test/unit/*.test.mjs\"', cwd: '{{ vars.dir }}', kind: 'unit' }, P.unit);
    const integ = b.node('tool.test', L('통합 테스트', 'Integration tests'), { command: '"{{ env.node }}" --test \"test/integration/*.test.mjs\"', cwd: '{{ vars.dir }}', kind: 'integration' }, P.integ);
    const gui = b.node('tool.test', L('GUI 테스트', 'GUI tests'), { command: '"{{ env.node }}" gui-test.mjs', cwd: '{{ vars.dir }}', kind: 'gui' }, P.gui);
    const verdict = b.node('logic.code', L('결과 종합', 'Results'), { code: `// The three test runs of this round together.
const runs = [nodes['${unit}'], nodes['${integ}'], nodes['${gui}']].map((n) => (n && n.output) || {});
const failed = runs.reduce((n, r) => n + (r.failed || 0), 0);
return { round: vars.round, passed: runs.reduce((n, r) => n + (r.passed || 0), 0), failed, skipped: runs.reduce((n, r) => n + (r.skipped || 0), 0), green: failed === 0,
  table: runs.map((r) => '| ' + r.kind + ' | ' + (r.passed || 0) + ' | ' + (r.failed || 0) + ' | ' + (r.skipped || 0) + ' |').join('\\n'),
  failures: runs.flatMap((r) => (r.failures || []).map((f) => r.kind + ': ' + f)).slice(0, 40) };` }, P.report);
    const green = b.node('logic.if', L('모두 통과?', 'All green?'), { conditions: [{ left: '{{ input.green }}', op: 'isTrue', right: '' }] }, P.report);
    const again = b.node('logic.if', L('다시 할까?', 'Another round?'), { conditions: [{ left: '{{ vars.round }}', op: 'lt', right: '{{ trigger.maxRounds || 4 }}' }] }, P.report);
    const fix = b.node('ai.llm', L('실패 분석·수정', 'Analyse failures & fix'), { system: L('테스트 실패의 원인을 찾아 고친 파일 전체를 돌려주세요. 테스트가 요구사항과 맞으면 테스트는 바꾸지 마세요.', 'Find why the tests fail and return the fixed files in full. Keep the tests when they match the requirement.'), prompt: 'Round {{ input.round }} failures:\n{{ input.failures | join:"\\n" }}\n\nCode:\n{{ nodes.' + pick + '.output.files | json | truncate:16000 }}', json: true, schema: '{\n  "cause": "...",\n  "files": [{ "path": "...", "content": "..." }]\n}', maxTokens: 32000 }, P.impl);
    const refix = b.node('logic.code', L('수정 확정', 'Settle fix'), { code: choose(IMPLEMENTATION(false), 'The fixed files from the model, or the corrected example.') }, P.impl);
    const report = b.node('logic.template', L('보고서', 'Report'), { template: L(
      '# {{ trigger.project }} 자동 개발 보고\n\n## 요구사항\n{{ trigger.requirement }}\n\n## 분석\n{{ nodes.' + analyse + '.output.data.summary || nodes.' + analyse + '.output.text }}\n\n## 결과 ({{ input.round }}회차에 모두 통과)\n| 종류 | 통과 | 실패 | 건너뜀 |\n| --- | --- | --- | --- |\n{{ input.table }}\n\n## 바뀐 파일\n{{ nodes.' + refix + '.output.changed || nodes.' + pick + '.output.changed | join:", " }}',
      '# {{ trigger.project }} — autonomous development report\n\n## Requirement\n{{ trigger.requirement }}\n\n## Analysis\n{{ nodes.' + analyse + '.output.data.summary || nodes.' + analyse + '.output.text }}\n\n## Result (all green in round {{ input.round }})\n| kind | passed | failed | skipped |\n| --- | --- | --- | --- |\n{{ input.table }}\n\n## Changed files\n{{ nodes.' + refix + '.output.changed || nodes.' + pick + '.output.changed | join:", " }}') }, P.report);
    const save = b.node('tool.file', L('보고서 저장', 'Save report'), { op: 'write', path: '{{ vars.dir }}/REPORT.md', content: '{{ input.text }}' }, P.report);
    const notify = b.node('human.notify', L('완료 알림', 'Notify'), { message: L('{{ trigger.project }}: 모든 테스트 통과 → {{ input.file }}', '{{ trigger.project }}: all tests green → {{ input.file }}'), level: 'success' }, P.report);
    const done = b.node('out.respond', L('완료', 'Done'), { value: `{{ nodes.${report}.output.text }}` }, P.report);
    const gaveUp = b.node('out.respond', L('중단 보고', 'Gave up'), { value: L('{{ vars.round }}회 시도 후에도 실패:\n{{ input.failures | join:"\\n" }}', 'Still failing after {{ vars.round }} rounds:\n{{ input.failures | join:"\\n" }}') }, P.report);

    b.chain(t, dir, reset, seed, seedLoop);
    b.link(seedLoop, seedWrite, 'item').link(seedLoop, read, 'done');
    b.chain(read, analyse, implement, pick, writeLoop);
    b.link(writeLoop, write, 'item').link(writeLoop, round, 'done');
    b.link(round, unit);
    b.link(unit, integ, 'passed').link(unit, integ, 'failed');
    b.link(integ, gui, 'passed').link(integ, gui, 'failed');
    b.link(gui, verdict, 'passed').link(gui, verdict, 'failed');
    b.link(verdict, green);
    b.link(green, report, 'true').link(green, again, 'false');
    b.link(again, fix, 'true').link(again, gaveUp, 'false');
    b.chain(fix, refix);
    b.link(refix, writeLoop);
    b.chain(report, save, notify, done);
    return b.done({ name: L('자율 개발 루프', 'Autonomous dev loop'), description: L('진행률·코드 탭에서 회차별 진행과 코드를 봅니다. 결과: 작업 폴더/autodev/<project>/', 'Watch rounds in the Progress and Code tabs. Output: work folder/autodev/<project>/'), icon: 'robot' });
  },
};

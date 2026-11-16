// End-to-end templates: one whole piece of work per business area, from the input to the finished result
// (requirements → code → tests → build, bug report → fix → regression test, …). Each runs completely with the
// offline test model: where a real model would write code or data, a code node falls back to a worked example,
// so the run still writes real files, runs real tests and builds. Nodes are named in expressions by id (n1 …).
import { builder, L } from './template-builder.js';

const SAMPLE_KB = 'sample-kb';
const json = (value) => JSON.stringify(value, null, 2);

// ───────────────────────── sample projects (written by the pipelines when no real model writes them)

const TEXTUTIL_SRC = String.raw`// Text utilities: slugify, capitalize, wordCount.
export function slugify(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '');
}

export function capitalize(text) {
  const s = String(text);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}
`;
const TEXTUTIL_TEST = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, capitalize, wordCount } from '../src/textutil.mjs';

test('slugify makes URL-safe names', () => {
  assert.equal(slugify('Hello World!'), 'hello-world');
  assert.equal(slugify('  Many   spaces  '), 'many-spaces');
  assert.equal(slugify('Café Menu'), 'cafe-menu');
});

test('capitalize upper-cases the first letter', () => {
  assert.equal(capitalize('agent'), 'Agent');
  assert.equal(capitalize(''), '');
});

test('wordCount counts words, not spaces', () => {
  assert.equal(wordCount('one two  three'), 3);
  assert.equal(wordCount('   '), 0);
});
`;
const PRICE_BUGGY = String.raw`// Price with a discount rate in percent.
export function discounted(price, rate) {
  return price - rate;
}
`;
const PRICE_FIXED = String.raw`// Price with a discount rate in percent (0-100), rounded to whole units.
export function discounted(price, rate) {
  if (rate < 0 || rate > 100) throw new RangeError('rate must be 0-100');
  return Math.round(price * (1 - rate / 100));
}
`;
const PRICE_TEST = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import { discounted } from '../src/price.mjs';

test('a 10 % discount takes 10 % off (bug report #42)', () => {
  assert.equal(discounted(10000, 10), 9000);
});

test('no discount keeps the price', () => {
  assert.equal(discounted(5000, 0), 5000);
});
`;
const BUILD_SCRIPT = String.raw`// Build: syntax-check every source file, copy it to dist/ and write build-info.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const files = fs.readdirSync('src').filter((f) => /\.(m?js|cjs)$/.test(f));
fs.mkdirSync('dist', { recursive: true });
const out = [];
for (const f of files) {
  execFileSync(process.execPath, ['--check', path.join('src', f)]);
  const data = fs.readFileSync(path.join('src', f));
  fs.writeFileSync(path.join('dist', f), data);
  out.push({ file: f, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex').slice(0, 16) });
}
fs.writeFileSync(path.join('dist', 'build-info.json'), JSON.stringify({ builtAt: new Date().toISOString(), node: process.version, files: out }, null, 2));
console.log('built ' + out.length + ' file(s) into dist/');
`;

const filesOf = (pairs) => pairs.map(([p, content]) => ({ path: p, content }));

/** Code-node body: the model's { files } when it gave usable ones, else `fallback` (or the files of `earlier`). */
const pickFiles = (fallback, earlier = null) => String.raw`// The files the model wrote (input.data.files), or the worked example when there are none
// (the offline test model writes no code).
const fallback = ` + JSON.stringify(fallback) + String.raw`;
const given = input && input.data && Array.isArray(input.data.files) ? input.data.files : [];
const usable = given.length > 0 && given.every((f) => f && typeof f.path === 'string' && typeof f.content === 'string');
` + (earlier ? `const earlier = nodes['${earlier}'] && nodes['${earlier}'].output && nodes['${earlier}'].output.files;\n` : '') + String.raw`return { files: usable ? given : ` + (earlier ? 'fallback' : 'fallback') + String.raw`, source: usable ? 'model' : 'example' };`;

/** Loop over input.files writing each under vars.dir. Returns { loop, write }. */
function writeFiles(b, name) {
  const loop = b.node('logic.loop', name, { items: '{{ input.files }}', max: 50 });
  const write = b.node('tool.file', L('파일 쓰기', 'Write file'), { op: 'write', path: '{{ vars.dir }}/{{ item.path }}', content: '{{ item.content }}' });
  b.link(loop, write, 'item');
  return { loop, write };
}

const shell = (b, name, command) => b.node('tool.shell', name, { command, cwd: '{{ vars.dir }}', onError: 'continue', timeout: 120 });

export const PIPELINE_TEMPLATES = [
  // ───────── software development: requirements → design & code → tests (with fix-and-retry) → approval → build → report
  { id: 'sw-pipeline', group: 'pipeline', icon: 'code', title: L('소프트웨어 개발 전체 과정', 'Software development, end to end'), desc: L('요구사항 분석 → 설계·코딩 → 테스트(실패 시 수정·재시도) → 승인 → 빌드 → 보고서', 'Requirements → design & code → tests (fix & retry) → approval → build → report'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('개발 요청', 'Request'), { sample: json({ project: 'textutil', language: 'JavaScript (ES modules, node:test)', requirement: lang === 'ko' ? '문자열 유틸리티 모듈이 필요합니다. URL용 슬러그 만들기(slugify), 첫 글자 대문자(capitalize), 단어 수 세기(wordCount). 단위 테스트를 함께 작성하세요.' : 'We need a text utility module: slugify for URLs, capitalize the first letter, count words. Write unit tests too.' }) });
      const dir = b.node('logic.set', L('작업 폴더', 'Work folder'), { values: [{ key: 'dir', value: 'pipeline/{{ trigger.project }}' }] });
      const analysis = b.node('ai.llm', L('요구사항 분석', 'Requirements analysis'), { system: L('당신은 시니어 분석가입니다. 요구사항을 기능 목록, 수용 기준, 위험으로 정리하세요.', 'You are a senior analyst. Turn the request into features, acceptance criteria and risks.'), prompt: '{{ trigger.requirement }}', json: true, schema: '{\n  "summary": "...",\n  "features": ["..."],\n  "acceptance": ["..."],\n  "risks": ["..."]\n}' });
      const code = b.node('ai.llm', L('설계·코드 작성', 'Design & code'), { system: L('당신은 시니어 개발자입니다. 분석 결과를 구현하는 소스와 node:test 단위 테스트를 작성하세요. 소스는 src/, 테스트는 test/*.test.mjs, ES 모듈.', 'You are a senior developer. Implement the analysis with sources in src/ and node:test unit tests in test/*.test.mjs, as ES modules.'), prompt: 'Language: {{ trigger.language }}\nRequirement: {{ trigger.requirement }}\nAnalysis: {{ nodes.n3.output.data | json }}', json: true, schema: '{\n  "files": [{ "path": "src/….mjs", "content": "…" }, { "path": "test/….test.mjs", "content": "…" }]\n}', maxTokens: 16000 });
      const pick = b.node('logic.code', L('파일 준비', 'Prepare files'), { code: pickFiles(filesOf([['src/textutil.mjs', TEXTUTIL_SRC], ['test/textutil.test.mjs', TEXTUTIL_TEST]])) });
      const w = writeFiles(b, L('소스·테스트 쓰기', 'Write sources & tests'));
      const test = shell(b, L('테스트 실행', 'Run tests'), '"{{ env.node }}" --test');
      const countId = b.nextId();
      const count = b.node('logic.code', L('시도 횟수', 'Attempts'), { code: `// Counts the test runs and keeps the test output for the next steps.\nconst before = nodes['${countId}'] && nodes['${countId}'].output ? nodes['${countId}'].output.attempt : 0;\nreturn { attempt: before + 1, code: input.code, output: String(input.stdout || '') + String(input.stderr || '') };` });
      const passed = b.node('logic.if', L('테스트 통과?', 'Tests passed?'), { conditions: [{ left: '{{ input.code }}', op: 'equals', right: '0' }] });
      const retry = b.node('logic.if', L('다시 시도?', 'Try again?'), { conditions: [{ left: '{{ input.attempt }}', op: 'lt', right: '3' }] });
      const fix = b.node('ai.llm', L('실패 분석·수정', 'Analyse & fix'), { system: L('테스트 실패 원인을 찾아 고친 파일 전체를 돌려주세요.', 'Find why the tests fail and return the corrected files in full.'), prompt: 'Attempt {{ input.attempt }} failed:\n{{ input.output | truncate:4000 }}\n\nFiles:\n{{ nodes.n5.output.files | json | truncate:12000 }}', json: true, schema: '{\n  "cause": "...",\n  "files": [{ "path": "...", "content": "..." }]\n}', maxTokens: 16000 });
      const refix = b.node('logic.code', L('수정 파일 준비', 'Prepare fixed files'), { code: pickFiles(filesOf([['src/textutil.mjs', TEXTUTIL_SRC], ['test/textutil.test.mjs', TEXTUTIL_TEST]])) });
      const approve = b.node('human.approval', L('빌드 승인 (코드 리뷰)', 'Approve build (code review)'), { message: L('테스트 통과 ({{ input.attempt }}번째 시도).\n\n분석: {{ nodes.n3.output.data.summary || nodes.n3.output.text }}\n\n빌드할까요?', 'Tests passed (attempt {{ input.attempt }}).\n\nAnalysis: {{ nodes.n3.output.data.summary || nodes.n3.output.text }}\n\nBuild it?') });
      const script = b.node('tool.file', L('빌드 스크립트', 'Build script'), { op: 'write', path: '{{ vars.dir }}/build.mjs', content: BUILD_SCRIPT });
      const build = shell(b, L('빌드', 'Build'), '"{{ env.node }}" build.mjs');
      const fence = '```';
      const report = b.node('logic.template', L('개발 보고서', 'Report'), { template: L(
        `# {{ trigger.project }} 개발 보고\n\n## 요구사항 분석\n{{ nodes.n3.output.data.summary || nodes.n3.output.text }}\n\n- 기능: {{ nodes.n3.output.data.features | join:", " | default:"-" }}\n- 수용 기준: {{ nodes.n3.output.data.acceptance | join:", " | default:"-" }}\n\n## 코드\n{{ nodes.n5.output.files | pluck:"path" | join:", " }} ({{ nodes.n5.output.source }})\n\n## 테스트 ({{ nodes.${count}.output.attempt }}회)\n${fence}\n{{ nodes.${test}.output.stdout | truncate:1500 }}\n${fence}\n\n## 빌드\n{{ nodes.${build}.output.stdout }}`,
        `# {{ trigger.project }} — development report\n\n## Requirements\n{{ nodes.n3.output.data.summary || nodes.n3.output.text }}\n\n- Features: {{ nodes.n3.output.data.features | join:", " | default:"-" }}\n- Acceptance: {{ nodes.n3.output.data.acceptance | join:", " | default:"-" }}\n\n## Code\n{{ nodes.n5.output.files | pluck:"path" | join:", " }} ({{ nodes.n5.output.source }})\n\n## Tests ({{ nodes.${count}.output.attempt }} run(s))\n${fence}\n{{ nodes.${test}.output.stdout | truncate:1500 }}\n${fence}\n\n## Build\n{{ nodes.${build}.output.stdout }}`) });
      const save = b.node('tool.file', L('보고서 저장', 'Save report'), { op: 'write', path: '{{ vars.dir }}/REPORT.md', content: '{{ input.text }}' });
      const done = b.node('out.respond', L('완료', 'Done'), { value: `{{ nodes.${report}.output.text }}` });
      const cancelled = b.node('out.respond', L('빌드 보류', 'Build held'), { value: L('빌드하지 않았습니다: {{ input.comment }}', 'Not built: {{ input.comment }}') });
      const failed = b.node('out.respond', L('실패 보고', 'Failure report'), { value: L('테스트가 {{ input.attempt }}번 실패했습니다.\n{{ input.output | truncate:2000 }}', 'Tests failed {{ input.attempt }} times.\n{{ input.output | truncate:2000 }}') });
      b.chain(t, dir, analysis, code, pick, w.loop);
      b.link(w.loop, test, 'done').chain(test, count, passed);
      b.link(passed, approve, 'true').link(passed, retry, 'false');
      b.link(retry, fix, 'true').link(retry, failed, 'false');
      b.chain(fix, refix);
      b.link(refix, w.loop);
      b.link(approve, script, 'approved').link(approve, cancelled, 'rejected');
      b.chain(script, build, report, save, done);
      return b.done({ name: L('소프트웨어 개발 파이프라인', 'Software development pipeline'), description: L('결과물: 작업 폴더/pipeline/<project>/ (src, test, dist, REPORT.md)', 'Output: work folder/pipeline/<project>/ (src, test, dist, REPORT.md)'), icon: 'code' });
    } },

  // ───────── bug fix: report → extract → reproduce with a regression test → fix → regression test → commit message
  { id: 'bugfix-pipeline', group: 'pipeline', icon: 'bug', title: L('버그 수정 전체 과정', 'Bug fix, end to end'), desc: L('버그 리포트 → 정보 추출 → 재현 테스트 → 원인 분석·수정 → 회귀 테스트 → 커밋 메시지', 'Bug report → extract → reproduce with a test → fix → regression test → commit message'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('버그 리포트', 'Bug report'), { sample: json({ project: 'pricing', title: lang === 'ko' ? '할인 계산 오류 (#42)' : 'Discount is wrong (#42)', body: lang === 'ko' ? '할인율 10을 넣으면 10% 대신 10원만 깎입니다. 10000원 → 9990원 (기대: 9000원). 컴포넌트: price.mjs' : 'A 10 % discount takes 10 off instead of 10 %. 10000 → 9990 (expected 9000). Component: price.mjs' }) });
      const dir = b.node('logic.set', L('작업 폴더', 'Work folder'), { values: [{ key: 'dir', value: 'pipeline/{{ trigger.project }}' }] });
      const facts = b.node('ai.extract', L('정보 추출', 'Extract facts'), { input: '{{ trigger.title }}\n{{ trigger.body }}', fields: [{ key: 'component', value: 'file or module' }, { key: 'expected', value: 'expected result' }, { key: 'actual', value: 'actual result' }] });
      const repro = b.node('logic.code', L('현재 코드 + 재현 테스트', 'Current code + regression test'), { code: String.raw`// The code as it is now and a regression test that reproduces the report.
// (In a real project: read the repository with the File or Command node instead.)
return { files: ` + JSON.stringify(filesOf([['src/price.mjs', PRICE_BUGGY], ['test/price.test.mjs', PRICE_TEST]])) + String.raw` };` });
      const w1 = writeFiles(b, L('파일 쓰기', 'Write files'));
      const test1 = shell(b, L('재현 테스트', 'Reproduce'), '"{{ env.node }}" --test');
      const reproduced = b.node('logic.if', L('재현됨?', 'Reproduced?'), { conditions: [{ left: '{{ input.code }}', op: 'notEquals', right: '0' }] });
      const fix = b.node('ai.llm', L('원인 분석·수정', 'Root cause & fix'), { system: L('버그의 원인을 찾고 고친 파일 전체를 돌려주세요. 테스트는 바꾸지 마세요.', 'Find the cause and return the corrected files in full. Do not change the tests.'), prompt: 'Report: {{ trigger.body }}\nFacts: {{ nodes.n3.output | json }}\nFailing test output:\n{{ input.stdout | truncate:4000 }}\nFiles:\n{{ nodes.n4.output.files | json }}', json: true, schema: '{\n  "cause": "...",\n  "files": [{ "path": "src/price.mjs", "content": "..." }]\n}' });
      const patch = b.node('logic.code', L('패치 준비', 'Prepare patch'), { code: pickFiles(filesOf([['src/price.mjs', PRICE_FIXED]])) });
      const w2 = writeFiles(b, L('패치 쓰기', 'Write patch'));
      const test2 = shell(b, L('회귀 테스트', 'Regression test'), '"{{ env.node }}" --test');
      const passed = b.node('logic.if', L('통과?', 'Passed?'), { conditions: [{ left: '{{ input.code }}', op: 'equals', right: '0' }] });
      const commit = b.node('ai.llm', L('커밋 메시지', 'Commit message'), { system: L('Conventional Commits 형식의 영어 커밋 메시지 한 개.', 'One Conventional Commits message in English.'), prompt: 'fix for: {{ trigger.title }}\ncause: {{ nodes.n8.output.data.cause || "see diff" }}' });
      const report = b.node('logic.template', L('수정 보고', 'Fix report'), { template: L('## {{ trigger.title }}\n- 재현: 실패 확인\n- 원인: {{ nodes.n8.output.data.cause || "price - rate 를 퍼센트로 계산하지 않음" }}\n- 회귀 테스트: 통과\n- 커밋: {{ input.text }}', '## {{ trigger.title }}\n- Reproduced: yes\n- Cause: {{ nodes.n8.output.data.cause || "price - rate did not apply a percentage" }}\n- Regression test: passed\n- Commit: {{ input.text }}') });
      const ok = b.node('out.respond', L('수정 완료', 'Fixed'), { value: '{{ input.text }}' });
      const warn = b.node('human.notify', L('수동 확인 필요', 'Needs a person'), { message: L('패치 후에도 테스트 실패: {{ input.stdout | truncate:300 }}', 'Tests still fail after the patch: {{ input.stdout | truncate:300 }}'), level: 'warning' });
      const notRepro = b.node('out.respond', L('재현 안 됨', 'Not reproduced'), { value: L('테스트로 재현되지 않았습니다. 정보를 더 받아야 합니다.', 'The test did not reproduce it; more information is needed.') });
      b.chain(t, dir, facts, repro, w1.loop);
      b.link(w1.loop, test1, 'done').chain(test1, reproduced);
      b.link(reproduced, fix, 'true').link(reproduced, notRepro, 'false');
      b.chain(fix, patch, w2.loop);
      b.link(w2.loop, test2, 'done').chain(test2, passed);
      b.link(passed, commit, 'true').link(passed, warn, 'false');
      b.chain(commit, report, ok);
      return b.done({ name: L('버그 수정 파이프라인', 'Bug fix pipeline'), description: L('재현 → 수정 → 회귀 테스트를 실제로 실행합니다', 'Really runs reproduce → fix → regression test'), icon: 'bug' });
    } },

  // ───────── code review gate: static checks + AI review → verdict → change request or merge approval
  { id: 'review-pipeline', group: 'pipeline', icon: 'branch', title: L('코드 리뷰 · 머지 관문', 'Code review & merge gate'), desc: L('변경 내용 → 정적 검사 → AI 리뷰 → 판정 → 변경 요청 또는 머지 승인', 'Diff → static checks → AI review → verdict → change request or merge approval'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('변경 내용 (diff)', 'Change (diff)'), { sample: json({ title: 'Add login rate limit', diff: '+ const password = "admin123";\n+ console.log("login", user);\n+ // TODO: remove debug\n+ if (attempts > 5) return lock(user);\n- return true;' }) });
      const lint = b.node('logic.code', L('정적 검사', 'Static checks'), { code: String.raw`// Simple checks on the added lines of a unified diff.
const lines = String(input.diff || '').split(/\r?\n/);
const added = lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1));
const rules = [
  [/console\.log|debugger/, 'warning', 'debug output left in'],
  [/TODO|FIXME/, 'info', 'unfinished work'],
  [/password\s*=\s*["']|api[_-]?key\s*=\s*["']|secret\s*=\s*["']/i, 'error', 'hard-coded secret'],
];
const findings = [];
added.forEach((line, i) => {
  for (const [re, level, message] of rules) if (re.test(line)) findings.push({ line: i + 1, level, message, code: line.trim() });
  if (line.length > 120) findings.push({ line: i + 1, level: 'info', message: 'line longer than 120', code: line.slice(0, 60) });
});
return { added: added.length, removed: lines.filter((l) => l.startsWith('-')).length, findings };` });
      const review = b.node('ai.llm', L('AI 리뷰', 'AI review'), { system: L('시니어 리뷰어로서 변경을 검토하고 문제를 심각도(high/medium/low)와 함께 나열하세요.', 'Review the change as a senior reviewer; list issues with severity high/medium/low.'), prompt: '{{ trigger.title }}\n\n{{ trigger.diff }}\n\nStatic findings: {{ input.findings | json }}', json: true, schema: '{\n  "summary": "...",\n  "issues": [{ "severity": "high", "message": "..." }]\n}' });
      const verdict = b.node('logic.code', L('판정', 'Verdict'), { code: String.raw`const lint = nodes.n2.output.findings || [];
const ai = (input.data && input.data.issues) || [];
const blocker = lint.some((f) => f.level === 'error') || ai.some((i) => String(i.severity).toLowerCase() === 'high');
return { verdict: blocker ? 'blocker' : 'ok', lint, ai, summary: (input.data && input.data.summary) || input.text };` });
      const sw = b.node('logic.switch', L('판정에 따라', 'By verdict'), { value: '{{ input.verdict }}', cases: ['blocker', 'ok'] });
      const request = b.node('logic.template', L('변경 요청', 'Change request'), { template: L('변경 요청 — {{ trigger.title }}\n{{ input.lint | pluck:"message" | join:"\\n- " }}\n{{ input.summary }}', 'Changes requested — {{ trigger.title }}\n{{ input.lint | pluck:"message" | join:"\\n- " }}\n{{ input.summary }}') });
      const notify = b.node('human.notify', L('작성자에게 알림', 'Notify author'), { message: '{{ input.text }}', level: 'warning' });
      const r1 = b.node('out.respond', L('반려', 'Rejected'), { value: '{{ input.message }}' });
      const approve = b.node('human.approval', L('머지 승인', 'Approve merge'), { message: L('문제 없음: {{ input.summary }}\n머지할까요?', 'No blockers: {{ input.summary }}\nMerge?') });
      const msg = b.node('ai.llm', L('머지 커밋 메시지', 'Merge message'), { prompt: 'Squash-merge message for: {{ trigger.title }}', system: 'One Conventional Commits line.' });
      const r2 = b.node('out.respond', L('머지됨', 'Merged'), { value: '{{ input.text }}' });
      const r3 = b.node('out.respond', L('보류', 'Held'), { value: '{{ input.comment }}' });
      b.chain(t, lint, review, verdict, sw);
      b.link(sw, request, 'blocker').link(sw, request, 'default').link(sw, approve, 'ok');
      b.chain(request, notify, r1);
      b.link(approve, msg, 'approved').link(approve, r3, 'rejected');
      b.chain(msg, r2);
      return b.done({ name: L('코드 리뷰 관문', 'Code review gate'), description: '', icon: 'branch' });
    } },

  // ───────── release: notes → CHANGELOG → package → approval → announce
  { id: 'release-pipeline', group: 'pipeline', icon: 'deploy', title: L('릴리스 전체 과정', 'Release, end to end'), desc: L('변경 목록 → 릴리스 노트 → CHANGELOG → 패키징 → 배포 승인 → 공지', 'Changes → release notes → CHANGELOG → package → approval → announce'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('릴리스 정보', 'Release'), { sample: json({ project: 'textutil', version: '1.4.0', changes: ['feat: wordCount ignores punctuation', 'fix: slugify keeps Korean letters', 'docs: README examples'] }) });
      const dir = b.node('logic.set', L('작업 폴더', 'Work folder'), { values: [{ key: 'dir', value: 'pipeline/{{ trigger.project }}' }] });
      const notes = b.node('ai.llm', L('릴리스 노트', 'Release notes'), { system: L('사용자가 읽을 릴리스 노트를 쓰세요.', 'Write user-facing release notes.'), prompt: 'v{{ trigger.version }}\n{{ trigger.changes | join:"\\n" }}', json: true, schema: '{\n  "summary": "...",\n  "highlights": ["..."]\n}' });
      const entry = b.node('logic.code', L('CHANGELOG 항목', 'CHANGELOG entry'), { code: String.raw`const groups = { feat: 'Features', fix: 'Fixes', docs: 'Docs' };
const lines = (trigger.changes || []).map((c) => { const m = /^(\w+):\s*(.*)$/.exec(c); return { kind: groups[m ? m[1] : ''] || 'Other', text: m ? m[2] : c }; });
const kinds = [...new Set(lines.map((l) => l.kind))];
const body = kinds.map((k) => '### ' + k + '\n' + lines.filter((l) => l.kind === k).map((l) => '- ' + l.text).join('\n')).join('\n\n');
const date = new Date().toISOString().slice(0, 10);
return { text: '## ' + trigger.version + ' (' + date + ')\n' + ((input.data && input.data.summary) || '') + '\n\n' + body + '\n' };` });
      const log = b.node('tool.file', L('CHANGELOG 추가', 'Append CHANGELOG'), { op: 'append', path: '{{ vars.dir }}/CHANGELOG.md', content: '{{ input.text }}' });
      const ver = b.node('tool.file', L('버전 파일', 'Version file'), { op: 'write', path: '{{ vars.dir }}/version.json', content: '{ "version": "{{ trigger.version }}" }' });
      const pack = shell(b, L('패키징', 'Package'), `"{{ env.node }}" -e "const fs=require('fs');const v=JSON.parse(fs.readFileSync('version.json','utf8')).version;fs.mkdirSync('release',{recursive:true});fs.copyFileSync('CHANGELOG.md','release/CHANGELOG-'+v+'.md');console.log('packaged '+v)"`);
      const approve = b.node('human.approval', L('배포 승인', 'Approve release'), { message: 'v{{ trigger.version }}\n{{ nodes.n4.output.text }}' });
      const announce = b.node('human.notify', L('공지', 'Announce'), { message: L('v{{ trigger.version }} 배포됨', 'v{{ trigger.version }} released'), level: 'success' });
      const r1 = b.node('out.respond', L('배포 완료', 'Released'), { value: '{{ nodes.n4.output.text }}' });
      const r2 = b.node('out.respond', L('배포 보류', 'Held'), { value: '{{ input.comment }}' });
      b.chain(t, dir, notes, entry, log, ver, pack, approve);
      b.link(approve, announce, 'approved').link(approve, r2, 'rejected').chain(announce, r1);
      return b.done({ name: L('릴리스 파이프라인', 'Release pipeline'), description: '', icon: 'deploy' });
    } },

  // ───────── data analysis: CSV → statistics (code) → AI insight → report file
  { id: 'data-pipeline', group: 'pipeline', icon: 'table', title: L('데이터 분석 보고서', 'Data analysis report'), desc: L('CSV → 집계(코드) → AI 해석 → 표가 든 보고서 파일', 'CSV → statistics (code) → AI insight → report file with tables'),
    build(lang) {
      const b = builder(lang);
      const csv = ['date,region,product,sales', '2026-09-03,Seoul,A,1200', '2026-09-10,Busan,B,800', '2026-09-17,Seoul,B,950', '2026-10-02,Daegu,A,400', '2026-10-09,Seoul,A,1500', '2026-10-21,Busan,A,700', '2026-11-04,Seoul,B,1100', '2026-11-12,Daegu,B,650'].join('\n');
      const t = b.node('trigger.manual', L('데이터', 'Data'), { sample: json({ title: lang === 'ko' ? '지역별 매출' : 'Sales by region', csv }) });
      const stats = b.node('logic.code', L('집계', 'Statistics'), { code: String.raw`// Parse the CSV and sum the last numeric column by the second column and by month.
const rows = String(input.csv || '').trim().split(/\r?\n/).map((l) => l.split(','));
const head = rows.shift() || [];
const value = head.length - 1;
const by = (key) => { const m = {}; for (const r of rows) m[key(r)] = (m[key(r)] || 0) + Number(r[value] || 0); return m; };
const byRegion = by((r) => r[1]);
const byMonth = by((r) => String(r[0]).slice(0, 7));
const total = rows.reduce((n, r) => n + Number(r[value] || 0), 0);
const best = Object.entries(byRegion).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
const table = (m) => '| key | value |\n| --- | --- |\n' + Object.entries(m).map(([k, v]) => '| ' + k + ' | ' + v + ' |').join('\n');
return { rows: rows.length, total, average: rows.length ? Math.round(total / rows.length) : 0, best: best[0], byRegion, byMonth, regionTable: table(byRegion), monthTable: table(byMonth) };` });
      const check = b.node('logic.if', L('데이터 있음?', 'Any rows?'), { conditions: [{ left: '{{ input.rows }}', op: 'gt', right: '0' }] });
      const insight = b.node('ai.llm', L('AI 해석', 'Insight'), { system: L('데이터 분석가로서 추세, 이상치, 다음 행동을 세 줄씩 쓰세요.', 'As a data analyst, write trends, outliers and next actions.'), prompt: '{{ trigger.title }}\n{{ input | json }}' });
      const report = b.node('logic.template', L('보고서', 'Report'), { template: L('# {{ trigger.title }}\n\n- 행: {{ nodes.n2.output.rows }} · 합계: {{ nodes.n2.output.total }} · 평균: {{ nodes.n2.output.average }} · 1위: {{ nodes.n2.output.best }}\n\n## 지역별\n{{ nodes.n2.output.regionTable }}\n\n## 월별\n{{ nodes.n2.output.monthTable }}\n\n## 해석\n{{ input.text }}', '# {{ trigger.title }}\n\n- Rows: {{ nodes.n2.output.rows }} · total: {{ nodes.n2.output.total }} · average: {{ nodes.n2.output.average }} · best: {{ nodes.n2.output.best }}\n\n## By region\n{{ nodes.n2.output.regionTable }}\n\n## By month\n{{ nodes.n2.output.monthTable }}\n\n## Insight\n{{ input.text }}') });
      const save = b.node('tool.file', L('보고서 저장', 'Save report'), { op: 'write', path: 'analysis/{{ run.id }}.md', content: '{{ input.text }}' });
      const out = b.node('out.respond', L('결과', 'Result'), { value: '{{ nodes.n5.output.text }}' });
      const empty = b.node('out.respond', L('데이터 없음', 'No data'), { value: L('분석할 행이 없습니다', 'No rows to analyse') });
      b.chain(t, stats, check);
      b.link(check, insight, 'true').link(check, empty, 'false');
      b.chain(insight, report, save, out);
      return b.done({ name: L('데이터 분석 보고서', 'Data analysis report'), description: '', icon: 'table' });
    } },

  // ───────── IT operations: alert → severity → diagnosis agent → approved remediation → postmortem
  { id: 'incident-pipeline', group: 'pipeline', icon: 'activity', title: L('장애 대응 전체 과정', 'Incident response, end to end'), desc: L('경보 → 심각도 분류 → 진단 에이전트 → 조치 승인 → 조치 실행 → 사후 보고서', 'Alert → severity → diagnosis agent → approved remediation → postmortem'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('경보 (웹훅으로 바꿀 수 있음)', 'Alert (or a webhook)'), { sample: json({ service: 'payment-api', message: lang === 'ko' ? '장애: 5xx 오류율 35% (10분 지속), 응답 지연 4.2초' : 'Outage: 5xx error rate 35% for 10 minutes, latency 4.2 s', errorRate: 35 }) });
      const sev = b.node('ai.classify', L('심각도', 'Severity'), { input: '{{ trigger.message }}', categories: ['critical', 'warning', 'info'], instructions: L('서비스 중단·높은 오류율은 critical, 지연은 warning', 'Outage or high error rate = critical, slowness = warning') });
      const diag = b.node('ai.agent', L('진단 에이전트', 'Diagnosis agent'), { system: L('당신은 SRE입니다. 런북: 1) 최근 배포 확인 2) 오류율·지연 계산 3) 재시작 또는 롤백 제안. 계산은 calculator, 시각은 datetime 도구를 쓰세요.', 'You are an SRE. Runbook: 1) check the latest deploy 2) compute error rate and latency 3) propose restart or rollback. Use calculator and datetime.'), prompt: '{{ trigger.service }}: {{ trigger.message }} (error rate {{ trigger.errorRate }} %)', tools: ['calculator', 'datetime', 'javascript'], memory: false, maxSteps: 6 });
      const approve = b.node('human.approval', L('조치 승인', 'Approve remediation'), { message: L('{{ trigger.service }} 진단:\n{{ input.text }}\n\n서비스를 재시작할까요?', '{{ trigger.service }} diagnosis:\n{{ input.text }}\n\nRestart the service?') });
      const act = b.node('tool.shell', L('조치 실행', 'Remediate'), { command: `"{{ env.node }}" -e "console.log('restart requested for {{ trigger.service }} at ' + new Date().toISOString())"`, onError: 'continue' });
      const pm = b.node('logic.template', L('사후 보고서', 'Postmortem'), { template: L('# 장애 보고: {{ trigger.service }}\n- 경보: {{ trigger.message }}\n- 심각도: {{ nodes.n2.output.category }}\n- 진단: {{ nodes.n3.output.text }}\n- 조치: {{ nodes.n5.output.stdout || "승인되지 않음" }}\n- 시각: {{ env.now }}', '# Incident: {{ trigger.service }}\n- Alert: {{ trigger.message }}\n- Severity: {{ nodes.n2.output.category }}\n- Diagnosis: {{ nodes.n3.output.text }}\n- Action: {{ nodes.n5.output.stdout || "not approved" }}\n- Time: {{ env.now }}') });
      const save = b.node('tool.file', L('보고서 저장', 'Save postmortem'), { op: 'write', path: 'incidents/{{ run.id }}.md', content: '{{ input.text }}' });
      const page = b.node('human.notify', L('담당자 호출', 'Page on-call'), { message: '{{ trigger.service }}: {{ nodes.n2.output.category }}', level: 'warning' });
      const out = b.node('out.respond', L('결과', 'Result'), { value: '{{ nodes.n6.output.text }}' });
      const watch = b.node('human.notify', L('관찰 계속', 'Keep watching'), { message: '{{ trigger.service }}: {{ trigger.message }}', level: 'info' });
      b.chain(t, sev);
      b.link(sev, diag, 'critical').link(sev, watch, 'warning').link(sev, watch, 'info').link(sev, watch, 'other');
      b.chain(diag, approve);
      b.link(approve, act, 'approved').link(approve, pm, 'rejected');
      b.chain(act, pm, save, page, out);
      return b.done({ name: L('장애 대응', 'Incident response'), description: '', icon: 'activity' });
    } },

  // ───────── customer service: question (RAG) · complaint (refund approval) · order (lookup)
  { id: 'support-pipeline', group: 'pipeline', icon: 'chat', title: L('고객 지원 전체 과정', 'Customer service, end to end'), desc: L('문의 분류 → 질문은 지식 검색 답변 · 불만은 환불 승인 · 주문은 조회', 'Classify → questions answered from docs · complaints to refund approval · orders looked up'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.chat', L('고객 메시지', 'Customer message'), { greeting: L('무엇을 도와드릴까요? (예: 배송은 얼마나 걸려요? / 주문 A-1002 어디쯤인가요? / 고장 나서 환불 원해요)', 'How can I help? (e.g. how long is shipping? / where is order A-1002? / it broke, I want a refund)') });
      const kind = b.node('ai.classify', L('문의 분류', 'Classify'), { input: '{{ trigger.message }}', categories: ['question', 'complaint', 'order'] });
      const search = b.node('kb.search', L('지식 검색', 'Search docs'), { kbs: [SAMPLE_KB], query: '{{ trigger.message }}', topK: 3 });
      const answer = b.node('ai.llm', L('답변 작성', 'Answer'), { system: L('자료만 근거로 친절하게 답하세요.', 'Answer kindly from the passages only.'), prompt: '{{ input.context }}\n\nQ: {{ trigger.message }}' });
      const r1 = b.node('out.respond', L('답변', 'Reply'), { value: '{{ input.text }}' });
      const facts = b.node('ai.extract', L('불만 정보', 'Complaint facts'), { input: '{{ trigger.message }}', fields: [{ key: 'order', value: 'order number like A-1001' }, { key: 'issue', value: 'what went wrong' }] });
      const refund = b.node('human.approval', L('환불 승인', 'Approve refund'), { message: L('환불 요청: {{ trigger.message }}', 'Refund request: {{ trigger.message }}') });
      const yes = b.node('logic.template', L('환불 안내', 'Refund notice'), { template: L('불편을 드려 죄송합니다. 환불을 승인했고 3~5일 안에 처리됩니다.', 'Sorry for the trouble. Your refund is approved and arrives in 3–5 days.') });
      const no = b.node('logic.template', L('상담원 연결', 'Hand-off'), { template: L('담당 상담원이 곧 연락드리겠습니다.', 'An agent will contact you shortly.') });
      const r2 = b.node('out.respond', L('불만 답장', 'Complaint reply'), { value: '{{ input.text }}' });
      const lookup = b.node('logic.code', L('주문 조회', 'Order lookup'), { code: String.raw`// A stand-in for your order database (replace with an HTTP request node).
const orders = { 'A-1001': 'delivered', 'A-1002': 'shipped — arriving tomorrow', 'A-1003': 'preparing' };
const id = (String(trigger.message).match(/[A-Z]-\d{4}/) || [])[0];
return { id: id || '', status: id ? (orders[id] || 'not found') : 'no order number' };` });
      const status = b.node('logic.template', L('주문 상태', 'Order status'), { template: L('주문 {{ input.id }}: {{ input.status }}', 'Order {{ input.id }}: {{ input.status }}') });
      const r3 = b.node('out.respond', L('주문 답장', 'Order reply'), { value: '{{ input.text }}' });
      b.chain(t, kind);
      b.link(kind, search, 'question').link(kind, search, 'other').link(kind, facts, 'complaint').link(kind, lookup, 'order');
      b.chain(search, answer, r1);
      b.chain(facts, refund);
      b.link(refund, yes, 'approved').link(refund, no, 'rejected').link(yes, r2).link(no, r2);
      b.chain(lookup, status, r3);
      return b.done({ name: L('고객 지원 파이프라인', 'Customer service pipeline'), description: '', icon: 'chat' });
    } },

  // ───────── hiring: resume → extract → score → interview questions & approval → letter → record
  { id: 'hiring-pipeline', group: 'pipeline', icon: 'user', title: L('채용 심사 전체 과정', 'Hiring, end to end'), desc: L('이력서 → 정보 추출 → 평가 점수 → 면접 질문 → 승인 → 안내 메일 → 후보자 기록', 'Resume → extract → score → interview questions → approval → letter → record'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('지원서', 'Application'), { sample: json({ position: lang === 'ko' ? '백엔드 개발자' : 'Backend developer', resume: 'Name: Kim Minji\nEmail: minji@example.com\nYears: 5\nSkills: Node.js, SQL, AWS, testing, Docker\nProjects: payment API, monitoring' }) });
      const facts = b.node('ai.extract', L('정보 추출', 'Extract'), { input: '{{ trigger.resume }}', fields: [{ key: 'name', value: 'full name' }, { key: 'email', value: 'email' }, { key: 'years', value: 'years of experience' }, { key: 'skills', value: 'skills' }] });
      const evalNode = b.node('ai.llm', L('역량 평가', 'Assessment'), { system: L('채용 담당자로서 직무 적합도를 0~100으로 평가하세요.', 'As a recruiter, score the fit from 0 to 100.'), prompt: '{{ trigger.position }}\n{{ trigger.resume }}', json: true, schema: '{\n  "score": 0,\n  "strengths": ["..."],\n  "concerns": ["..."]\n}' });
      const score = b.node('logic.code', L('점수 정리', 'Score'), { code: String.raw`// The model's score, or a keyword score when there is none.
const wanted = ['node', 'sql', 'aws', 'test', 'docker', 'api'];
const text = String(trigger.resume).toLowerCase();
const keyword = Math.min(100, 30 + wanted.filter((w) => text.includes(w)).length * 12);
const model = Number(input.data && input.data.score);
const facts = nodes.n2.output;
return { score: model > 0 ? model : keyword, name: facts.name || 'Candidate', email: facts.email || '' };` });
      const pass = b.node('logic.if', L('70점 이상?', 'Score ≥ 70?'), { conditions: [{ left: '{{ input.score }}', op: 'gte', right: '70' }] });
      const qs = b.node('ai.llm', L('면접 질문', 'Interview questions'), { system: L('직무에 맞는 면접 질문 5개.', 'Five interview questions for the role.'), prompt: '{{ trigger.position }}\n{{ trigger.resume }}' });
      const approve = b.node('human.approval', L('면접 제안 승인', 'Approve invitation'), { message: '{{ nodes.n4.output.name }} — {{ nodes.n4.output.score }}\n\n{{ input.text }}' });
      const invite = b.node('logic.template', L('면접 안내', 'Invitation'), { template: L('{{ nodes.n4.output.name }}님, {{ trigger.position }} 면접에 모시고자 합니다. 가능한 일정을 알려 주세요.', 'Dear {{ nodes.n4.output.name }}, we would like to invite you to interview for {{ trigger.position }}. Please share times that suit you.') });
      const hold = b.node('logic.template', L('보류 안내', 'On hold'), { template: L('{{ nodes.n4.output.name }}: 보류 ({{ input.comment }})', '{{ nodes.n4.output.name }}: on hold ({{ input.comment }})') });
      const reject = b.node('logic.template', L('불합격 안내', 'Rejection'), { template: L('{{ nodes.n4.output.name }}님, 지원해 주셔서 감사합니다. 이번에는 함께하지 못하게 되었습니다.', 'Dear {{ nodes.n4.output.name }}, thank you for applying. We will not move forward this time.') });
      const record = b.node('tool.file', L('후보자 기록', 'Record'), { op: 'append', path: 'hiring/candidates.md', content: '- {{ env.now }} · {{ nodes.n4.output.name }} · {{ nodes.n4.output.score }} · {{ input.text | truncate:80 }}' });
      const out = b.node('out.respond', L('결과', 'Result'), { value: '{{ nodes.n4.output.name }} ({{ nodes.n4.output.score }}) → {{ input.path }}' });
      b.chain(t, facts, evalNode, score, pass);
      b.link(pass, qs, 'true').link(pass, reject, 'false');
      b.chain(qs, approve);
      b.link(approve, invite, 'approved').link(approve, hold, 'rejected');
      for (const x of [invite, hold, reject]) b.link(x, record);
      b.chain(record, out);
      return b.done({ name: L('채용 심사', 'Hiring'), description: '', icon: 'user' });
    } },

  // ───────── content: outline → write each section (loop) → assemble → edit → approval → publish file
  { id: 'content-pipeline', group: 'pipeline', icon: 'notes', title: L('콘텐츠 제작 전체 과정', 'Content production, end to end'), desc: L('주제 → 개요 → 섹션별 작성(반복) → 합치기 → 편집 검토 → 게시 승인 → 파일', 'Topic → outline → write each section (loop) → assemble → edit → approval → file'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('주제', 'Topic'), { sample: json({ topic: lang === 'ko' ? '사내 업무 자동화 시작하기' : 'Getting started with office automation', audience: lang === 'ko' ? '팀장' : 'team leads' }) });
      const outline = b.node('ai.llm', L('개요', 'Outline'), { prompt: '{{ trigger.topic }} for {{ trigger.audience }}', json: true, schema: '{\n  "title": "...",\n  "sections": ["..."]\n}' });
      const plan = b.node('logic.code', L('개요 확정', 'Fix outline'), { code: String.raw`const d = input.data || {};
const sections = Array.isArray(d.sections) && d.sections.length ? d.sections : ['Why it matters', 'What to automate first', 'How to start', 'Checklist'];
return { title: d.title || trigger.topic, sections };` });
      const loop = b.node('logic.loop', L('섹션마다', 'Each section'), { items: '{{ input.sections }}' });
      const write = b.node('ai.llm', L('섹션 작성', 'Write section'), { system: L('읽기 쉬운 문단 두 개로 쓰세요.', 'Write two readable paragraphs.'), prompt: '{{ trigger.topic }} — {{ item }} ({{ trigger.audience }})' });
      const join = b.node('logic.code', L('원고 합치기', 'Assemble'), { code: String.raw`const plan = nodes.n3.output;
const parts = (input.items || []).map((s, i) => '## ' + plan.sections[i] + '\n\n' + (s && s.text ? s.text : ''));
return { text: '# ' + plan.title + '\n\n' + parts.join('\n\n') };` });
      const edit = b.node('ai.llm', L('편집 검토', 'Edit'), { system: L('맞춤법과 톤을 다듬은 원고만 돌려주세요.', 'Return the text with spelling and tone polished.'), prompt: '{{ input.text }}' });
      const approve = b.node('human.approval', L('게시 승인', 'Approve publishing'), { message: '{{ nodes.n6.output.text | truncate:600 }}' });
      const save = b.node('tool.file', L('게시 파일', 'Publish file'), { op: 'write', path: 'content/{{ run.id }}.md', content: '{{ nodes.n6.output.text }}' });
      const r1 = b.node('out.respond', L('게시됨', 'Published'), { value: '{{ input.path }}' });
      const r2 = b.node('out.respond', L('수정 요청', 'Revise'), { value: '{{ input.comment }}' });
      b.chain(t, outline, plan, loop);
      b.link(loop, write, 'item').link(loop, join, 'done');
      b.chain(join, edit, approve);
      b.link(approve, save, 'approved').link(approve, r2, 'rejected').chain(save, r1);
      return b.done({ name: L('콘텐츠 제작', 'Content production'), description: '', icon: 'notes' });
    } },

  // ───────── expenses: each item classified (loop) → totals and limits (code) → approval when over → report
  { id: 'expense-pipeline', group: 'pipeline', icon: 'receipt', title: L('경비 정산 전체 과정', 'Expense claims, end to end'), desc: L('항목마다 분류(반복) → 합계·한도 검사 → 초과 시 승인 → 정산서 파일', 'Classify each item (loop) → totals & limits → approval when over → claim file'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('경비 내역', 'Expenses'), { sample: json({ employee: 'kim', items: lang === 'ko' ? [{ desc: '고객 미팅 점심', amount: 48000 }, { desc: 'KTX 서울-부산', amount: 59800 }, { desc: '프린터 토너', amount: 32000 }, { desc: '야근 저녁 식대', amount: 18000 }] : [{ desc: 'client lunch', amount: 48000 }, { desc: 'train Seoul-Busan', amount: 59800 }, { desc: 'printer toner', amount: 32000 }, { desc: 'late dinner', amount: 18000 }] }) });
      const loop = b.node('logic.loop', L('항목마다', 'Each item'), { items: '{{ trigger.items }}' });
      const cls = b.node('ai.classify', L('분류', 'Classify'), { input: '{{ item.desc }}', categories: ['meal', 'travel', 'supplies'] });
      const row = b.node('logic.code', L('항목 정리', 'Item'), { code: String.raw`return { desc: item.desc, amount: Number(item.amount) || 0, category: input.category };` });
      const sum = b.node('logic.code', L('합계·한도', 'Totals & limits'), { code: String.raw`const limits = { meal: 30000, travel: 100000, supplies: 50000, other: 20000 };
const items = input.items || [];
const byCategory = {};
for (const i of items) byCategory[i.category] = (byCategory[i.category] || 0) + i.amount;
const over = items.filter((i) => i.amount > (limits[i.category] || limits.other));
const total = items.reduce((n, i) => n + i.amount, 0);
const lines = items.map((i) => '| ' + i.desc + ' | ' + i.category + ' | ' + i.amount + (over.includes(i) ? ' ⚠' : '') + ' |').join('\n');
return { total, byCategory, over, needsApproval: over.length > 0, table: '| item | category | amount |\n| --- | --- | --- |\n' + lines };` });
      const need = b.node('logic.if', L('한도 초과?', 'Over limit?'), { conditions: [{ left: '{{ input.needsApproval }}', op: 'isTrue', right: '' }] });
      const approve = b.node('human.approval', L('초과 승인', 'Approve excess'), { message: '{{ input.over | pluck:"desc" | join:", " }} ({{ input.total }})' });
      const report = b.node('logic.template', L('정산서', 'Claim'), { template: L('# 경비 정산 — {{ trigger.employee }}\n\n{{ nodes.n5.output.table }}\n\n합계: {{ nodes.n5.output.total }}\n상태: 승인', '# Expense claim — {{ trigger.employee }}\n\n{{ nodes.n5.output.table }}\n\nTotal: {{ nodes.n5.output.total }}\nStatus: approved') });
      const rejected = b.node('logic.template', L('반려', 'Rejected'), { template: L('반려: {{ input.comment }}', 'Rejected: {{ input.comment }}') });
      const save = b.node('tool.file', L('정산서 저장', 'Save claim'), { op: 'write', path: 'expenses/{{ trigger.employee }}-{{ run.id }}.md', content: '{{ input.text }}' });
      const out = b.node('out.respond', L('결과', 'Result'), { value: '{{ nodes.n5.output.total }} → {{ input.path }}' });
      b.chain(t, loop);
      b.link(loop, cls, 'item');
      for (const p of ['meal', 'travel', 'supplies', 'other']) b.link(cls, row, p);
      b.link(loop, sum, 'done').chain(sum, need);
      b.link(need, approve, 'true').link(need, report, 'false');
      b.link(approve, report, 'approved').link(approve, rejected, 'rejected');
      b.link(report, save).link(rejected, save).chain(save, out);
      return b.done({ name: L('경비 정산', 'Expense claims'), description: '', icon: 'receipt' });
    } },

  // ───────── contracts: extract → risks (AI + keywords) → level → legal approval for high → report
  { id: 'contract-pipeline', group: 'pipeline', icon: 'approve', title: L('계약서 검토 전체 과정', 'Contract review, end to end'), desc: L('조건 추출 → 위험 조항 분석 → 위험도 판정 → 높으면 법무 승인 → 검토서 파일', 'Extract terms → risky clauses → risk level → legal approval if high → review file'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('계약서', 'Contract'), { sample: json({ title: lang === 'ko' ? '유지보수 계약' : 'Maintenance agreement', text: lang === 'ko' ? '갑: ACME 주식회사, 을: 베타솔루션. 계약 금액 1억 2천만 원. 기간 2026-01-01 ~ 2026-12-31, 자동 갱신. 중도 해지 시 위약금 30%. 을은 손해배상 책임을 무제한으로 진다.' : 'Party A: ACME Corp, Party B: Beta Solutions. Amount 120,000,000 KRW. Term 2026-01-01 to 2026-12-31 with auto-renewal. Early termination penalty 30 %. Party B has unlimited liability for damages.' }) });
      const terms = b.node('ai.extract', L('조건 추출', 'Extract terms'), { input: '{{ trigger.text }}', fields: [{ key: 'parties', value: 'parties' }, { key: 'amount', value: 'contract amount' }, { key: 'term', value: 'start and end dates' }] });
      const risks = b.node('ai.llm', L('위험 조항', 'Risky clauses'), { system: L('계약 검토자로서 위험 조항과 수정 제안을 쓰세요.', 'As a contract reviewer, list risky clauses with suggested changes.'), prompt: '{{ trigger.text }}', json: true, schema: '{\n  "risks": [{ "clause": "...", "level": "high", "suggestion": "..." }]\n}' });
      const level = b.node('logic.code', L('위험도', 'Risk level'), { code: String.raw`const words = [[/위약금|penalty/i, 3, 'termination penalty'], [/무제한|unlimited/i, 4, 'unlimited liability'], [/자동\s*갱신|auto-?renew/i, 2, 'auto-renewal'], [/독점|exclusive/i, 2, 'exclusivity']];
const text = String(trigger.text);
const found = words.filter(([re]) => re.test(text)).map(([, w, name]) => ({ name, weight: w }));
const fromModel = ((input.data && input.data.risks) || []).map((r) => ({ name: r.clause, weight: r.level === 'high' ? 3 : r.level === 'medium' ? 2 : 1, suggestion: r.suggestion }));
const all = [...found, ...fromModel];
const score = all.reduce((n, r) => n + r.weight, 0);
return { level: score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low', score, risks: all };` });
      const sw = b.node('logic.switch', L('위험도에 따라', 'By risk'), { value: '{{ input.level }}', cases: ['high', 'medium', 'low'] });
      const legal = b.node('human.approval', L('법무 검토', 'Legal review'), { message: '{{ trigger.title }}: {{ input.risks | pluck:"name" | join:", " }}' });
      const report = b.node('logic.template', L('검토서', 'Review'), { template: L('# 계약 검토: {{ trigger.title }}\n- 당사자: {{ nodes.n2.output.parties }}\n- 금액: {{ nodes.n2.output.amount }}\n- 기간: {{ nodes.n2.output.term }}\n- 위험도: {{ nodes.n4.output.level }} ({{ nodes.n4.output.score }})\n- 위험 조항: {{ nodes.n4.output.risks | pluck:"name" | join:", " }}\n- 법무 의견: {{ input.comment || "-" }}', '# Contract review: {{ trigger.title }}\n- Parties: {{ nodes.n2.output.parties }}\n- Amount: {{ nodes.n2.output.amount }}\n- Term: {{ nodes.n2.output.term }}\n- Risk: {{ nodes.n4.output.level }} ({{ nodes.n4.output.score }})\n- Clauses: {{ nodes.n4.output.risks | pluck:"name" | join:", " }}\n- Legal: {{ input.comment || "-" }}') });
      const save = b.node('tool.file', L('검토서 저장', 'Save review'), { op: 'write', path: 'contracts/{{ run.id }}.md', content: '{{ input.text }}' });
      const out = b.node('out.respond', L('결과', 'Result'), { value: '{{ nodes.n4.output.level }} → {{ input.path }}' });
      b.chain(t, terms, risks, level, sw);
      b.link(sw, legal, 'high').link(sw, report, 'medium').link(sw, report, 'low').link(sw, report, 'default');
      b.link(legal, report, 'approved').link(legal, report, 'rejected');
      b.chain(report, save, out);
      return b.done({ name: L('계약서 검토', 'Contract review'), description: '', icon: 'approve' });
    } },

  // ───────── sales: webhook lead → extract → score → hot / warm / cold handling
  { id: 'sales-pipeline', group: 'pipeline', icon: 'webhook', title: L('영업 리드 처리 전체 과정', 'Sales leads, end to end'), desc: L('웹훅 리드 → 정보 추출 → 점수 → 뜨거운 리드는 메일·알림, 따뜻한 리드는 육성, 차가운 리드는 자동 회신', 'Webhook lead → extract → score → hot: email & alert, warm: nurture, cold: auto reply'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.webhook', L('리드 웹훅', 'Lead webhook'));
      const facts = b.node('ai.extract', L('리드 정보', 'Lead facts'), { input: '{{ trigger.body | json }}', fields: [{ key: 'name', value: 'name' }, { key: 'company', value: 'company' }, { key: 'email', value: 'email' }, { key: 'budget', value: 'budget number' }] });
      const scoreAi = b.node('ai.llm', L('리드 평가', 'Assess'), { prompt: '{{ trigger.body | json }}', json: true, schema: '{\n  "score": 0,\n  "reason": "..."\n}' });
      const tier = b.node('logic.code', L('등급', 'Tier'), { code: String.raw`const body = JSON.stringify(trigger.body || {}).toLowerCase();
let score = Number(input.data && input.data.score) || 0;
if (!score) { score = 20; if (Number(nodes.n2.output.budget) > 10000000) score += 40; if (/urgent|이번\s*달|asap|도입/.test(body)) score += 25; if (nodes.n2.output.company) score += 10; }
return { score, tier: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold', name: nodes.n2.output.name || 'there' };` });
      const sw = b.node('logic.switch', L('등급에 따라', 'By tier'), { value: '{{ input.tier }}', cases: ['hot', 'warm', 'cold'] });
      const mail = b.node('ai.llm', L('첫 연락 메일', 'First email'), { system: L('영업 담당자로서 짧은 첫 연락 메일을 쓰세요.', 'Write a short first-contact email as a sales rep.'), prompt: '{{ trigger.body | json }}' });
      const alert = b.node('human.notify', L('영업팀 알림', 'Alert sales'), { message: L('뜨거운 리드: {{ nodes.n4.output.name }} ({{ nodes.n4.output.score }})', 'Hot lead: {{ nodes.n4.output.name }} ({{ nodes.n4.output.score }})'), level: 'success' });
      const nurture = b.node('logic.template', L('육성 메일 순서', 'Nurture sequence'), { template: L('1일차: 소개 자료\n7일차: 고객 사례\n14일차: 데모 제안', 'Day 1: overview\nDay 7: case study\nDay 14: demo offer') });
      const auto = b.node('logic.template', L('자동 회신', 'Auto reply'), { template: L('관심 가져 주셔서 감사합니다, {{ nodes.n4.output.name }}님. 자료를 보내 드립니다.', 'Thanks for your interest, {{ nodes.n4.output.name }}. Here is our overview.') });
      const out = b.node('out.respond', L('응답', 'Response'), { value: '{ "tier": "{{ nodes.n4.output.tier }}", "score": {{ nodes.n4.output.score }} }' });
      b.chain(t, facts, scoreAi, tier, sw);
      b.link(sw, mail, 'hot').link(sw, nurture, 'warm').link(sw, auto, 'cold').link(sw, auto, 'default');
      b.chain(mail, alert, out);
      b.link(nurture, out).link(auto, out);
      return b.done({ name: L('영업 리드 처리', 'Sales leads'), description: L('POST {name, company, email, budget, message} 로 시험', 'Test with POST {name, company, email, budget, message}'), icon: 'webhook' });
    } },

  // ───────── weekly report: schedule → gather notes → summary → report file → notify
  { id: 'weekly-pipeline', group: 'pipeline', icon: 'calendarClock', title: L('주간 업무 보고 전체 과정', 'Weekly report, end to end'), desc: L('매주 월요일 → 메모 폴더 수집 → 요약 → 보고서 파일 → 알림', 'Every Monday → gather notes → summary → report file → notify'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.schedule', L('매주 월요일 9시', 'Mondays 9:00'), { mode: 'weekly', weekday: '1', time: '09:00' });
      const list = b.node('tool.file', L('메모 폴더', 'Notes folder'), { op: 'list', path: 'notes', onError: 'continue' });
      const gather = b.node('logic.code', L('이번 주 자료', 'This week'), { code: String.raw`const files = (input.entries || []).filter((e) => !e.dir).map((e) => e.name);
const items = files.length ? files : ['Released v1.4.0', 'Fixed discount bug #42', 'Reviewed 6 pull requests', 'Customer meeting with ACME'];
return { items, source: files.length ? 'notes folder' : 'example' };` });
      const day = b.node('tool.datetime', L('날짜', 'Date'));
      const sum = b.node('ai.llm', L('요약', 'Summary'), { system: L('팀장에게 보낼 주간 보고를 짧게 쓰세요: 한 일, 다음 주 할 일, 위험.', 'Write a short weekly report: done, next week, risks.'), prompt: '{{ nodes.n3.output.items | join:"\\n" }}' });
      const report = b.node('logic.template', L('보고서', 'Report'), { template: L('# 주간 보고 {{ nodes.n4.output.date }}\n\n{{ input.text }}\n\n자료: {{ nodes.n3.output.items | join:", " }}', '# Weekly report {{ nodes.n4.output.date }}\n\n{{ input.text }}\n\nSources: {{ nodes.n3.output.items | join:", " }}') });
      const save = b.node('tool.file', L('보고서 저장', 'Save'), { op: 'write', path: 'reports/weekly-{{ nodes.n4.output.date }}.md', content: '{{ input.text }}' });
      const notify = b.node('human.notify', L('알림', 'Notify'), { message: L('주간 보고: {{ input.path }}', 'Weekly report: {{ input.path }}'), level: 'success' });
      b.chain(t, list, gather, day, sum, report, save, notify);
      return b.done({ name: L('주간 업무 보고', 'Weekly report'), description: L('배포하면 매주 실행', 'Runs weekly when deployed'), icon: 'calendarClock' });
    } },

  // ───────── localisation: split → translate each paragraph (loop) → join → QA → file
  { id: 'localize-pipeline', group: 'pipeline', icon: 'globe', title: L('문서 번역·현지화 전체 과정', 'Document localisation, end to end'), desc: L('문단 나누기 → 문단마다 번역(반복) → 합치기 → 품질 검토 → 파일', 'Split → translate each paragraph (loop) → join → QA → file'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('원문', 'Source'), { sample: json({ to: lang === 'ko' ? 'English' : 'Korean', text: lang === 'ko' ? '제품 소개\n\nMyAgents는 업무 자동화 도구입니다.\n\n노드를 연결해 에이전트를 만듭니다.' : 'Product overview\n\nMyAgents automates office work.\n\nConnect nodes to build agents.' }) });
      const split = b.node('logic.code', L('문단 나누기', 'Split'), { code: String.raw`return { items: String(input.text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) };` });
      const loop = b.node('logic.loop', L('문단마다', 'Each paragraph'), { items: '{{ input.items }}' });
      const tr = b.node('ai.llm', L('번역', 'Translate'), { system: L('번역가입니다. 번역문만 답하세요.', 'You are a translator. Reply with the translation only.'), prompt: 'Translate into {{ trigger.to }}:\n\n{{ item }}' });
      const join = b.node('logic.code', L('합치기', 'Join'), { code: String.raw`return { text: (input.items || []).map((x) => (x && x.text) || '').join('\n\n') };` });
      const qa = b.node('ai.llm', L('품질 검토', 'QA review'), { system: L('용어 일관성과 누락을 점검해 목록으로 알려 주세요.', 'Check terminology consistency and omissions; list findings.'), prompt: 'Source:\n{{ trigger.text }}\n\nTranslation:\n{{ input.text }}' });
      const save = b.node('tool.file', L('번역본 저장', 'Save translation'), { op: 'write', path: 'translations/{{ run.id }}.md', content: '{{ nodes.n5.output.text }}' });
      const out = b.node('out.respond', L('결과', 'Result'), { value: '{{ nodes.n5.output.text }}' });
      b.chain(t, split, loop);
      b.link(loop, tr, 'item').link(loop, join, 'done');
      b.chain(join, qa, save, out);
      return b.done({ name: L('문서 번역·현지화', 'Document localisation'), description: '', icon: 'globe' });
    } },
];

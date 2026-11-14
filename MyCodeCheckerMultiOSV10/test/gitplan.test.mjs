// Git connection on a project: full analysis of the configured folders,
// analysis of only the files git reports as changed, what the run includes,
// and a schedule derived from the project's period.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const gitplan = require('../core/gitplan.js');
const { analyzePath, walk } = require('../core/analyze.js');
const scm = require('../core/platform/scm.js');
const { createApi } = require('../core/api.js');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const quiet = [...gitplan.ISSUE_ENGINES, ...gitplan.DEFECT_ENGINES, 'sca', 'arch'];
const light = (plan) => {
  const o = gitplan.analysisOptions(plan);
  return { ...o, skipEngines: [...new Set([...(o.skipEngines || []), ...quiet])] };
};
const names = (root, options) => walk(root, options).map((f) => path.relative(root, f).replace(/\\/g, '/')).sort();

function hasGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Tester', '-c', 'user.email=tester@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
}

test('normalize fills defaults and only a real period becomes a schedule', () => {
  const plain = gitplan.normalize(null);
  assert.equal(plain.scope, 'full');
  assert.equal(plain.period, 'off');
  assert.equal(plain.fetch, false);
  assert.equal(plain.content.issues, true);
  assert.equal(plain.content.defects, true);
  const changed = gitplan.normalize({ scope: 'changed', url: ' https://git.example/app.git ', period: 'daily', content: { duplication: false } });
  assert.equal(changed.url, 'https://git.example/app.git');
  assert.equal(changed.cron, '0 2 * * *');
  assert.equal(changed.content.duplication, false);
  assert.equal(changed.content.issues, true);
  assert.equal(gitplan.cronOf(gitplan.normalize({ period: 'custom', cron: 'not cron' })), null);
  assert.equal(gitplan.cronOf(gitplan.normalize({ period: 'custom', cron: '@weekly' })), '@weekly');
  assert.equal(gitplan.scheduleFor({ id: 'p1', name: 'App', path: '/src' }, plain), null);
  const slot = gitplan.scheduleFor({ id: 'p1', name: 'App', path: '/src', mainBranch: 'main' }, changed);
  assert.equal(slot.id, 'gitplan:p1');
  assert.equal(slot.cron, '0 2 * * *');
  assert.equal(slot.fromGitPlan, true);
  const off = gitplan.analysisOptions(gitplan.normalize({ content: { issues: false, defects: false, duplication: false, coverage: false } }));
  assert.equal(off.skipRules, true);
  assert.equal(off.skipDuplication, true);
  assert.equal(off.skipCoverage, true);
  assert.equal(off.skipDefects, true);
  assert.ok(off.skipEngines.includes('taint'));
  assert.ok(off.skipEngines.includes('sem-js'));
});

test('changed files drop deletions; a saved run stays on the project and manual schedules stay on the list', () => {
  assert.equal(gitplan.onlyFiles(gitplan.normalize({ scope: 'full' }), { files: { 'a.js': { status: 'M' } } }), null);
  assert.deepEqual(gitplan.onlyFiles(gitplan.normalize({ scope: 'changed' }), {
    files: { 'a.js': { status: 'M' }, 'gone.js': { status: 'D' }, 'new.js': { status: 'A' } },
  }), ['a.js', 'new.js']);
  const ws = {
    schedules: [{ id: 'night', kind: 'scan', cron: '@daily' }],
    projects: [{ id: 'p1', name: 'App', path: '/src', git: { period: 'hourly', scope: 'full' } }],
  };
  const list = gitplan.schedulesOf(ws);
  assert.equal(list.length, 2);
  assert.equal(list[1].id, 'gitplan:p1');
  list[1].lastStatus = 'SUCCESS';
  list[1].nextRun = '2099-01-01T00:00:00.000Z';
  list[0].name = 'kept';
  gitplan.applyScheduleSave(ws, list);
  assert.equal(ws.schedules.length, 1);
  assert.equal(ws.schedules[0].name, 'kept');
  assert.equal(ws.projects[0].gitRun.lastStatus, 'SUCCESS');
  assert.equal(gitplan.schedulesOf(ws)[1].nextRun, '2099-01-01T00:00:00.000Z');
});

test('the walk keeps configured folders and can limit itself to a file list', () => {
  const dir = tmp('mcc-git-walk-');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'gen'));
  fs.writeFileSync(path.join(dir, 'src', 'keep.js'), 'const keep = 1;\n');
  fs.writeFileSync(path.join(dir, 'src', 'old.js'), 'const old = 1;\n');
  fs.writeFileSync(path.join(dir, 'gen', 'out.js'), 'const out = 1;\n');
  assert.deepEqual(names(dir, { excludeDirs: ['gen'] }), ['src/keep.js', 'src/old.js']);
  assert.deepEqual(names(dir, { excludeDirs: ['gen'], onlyFiles: ['src/keep.js', 'gen/out.js'] }), ['src/keep.js']);
  assert.deepEqual(names(dir, { onlyFiles: [] }), []);
});

test('analysis content can leave out issues, duplication and coverage', () => {
  const dir = tmp('mcc-git-content-');
  const body = `${Array.from({ length: 10 }, (_, i) => `const line${i} = ${i};`).join('\n')}\neval(input);\n`;
  fs.writeFileSync(path.join(dir, 'a.js'), body);
  fs.writeFileSync(path.join(dir, 'b.js'), body);
  const off = gitplan.normalize({ content: { issues: false, duplication: false, coverage: false, defects: false } });
  const quietOff = analyzePath(dir, light(off));
  assert.equal(quietOff.issues.length, 0);
  assert.equal(quietOff.measures.duplicated_lines, 0);
  assert.equal(quietOff.coverage, null);
  const on = analyzePath(dir, light(gitplan.normalize({})));
  assert.ok(on.issues.some((i) => i.file === 'a.js'));
  assert.ok(on.measures.duplicated_lines > 0);
});

test('a project analyzes every configured folder, or only what git changed, and a period runs it', async () => {
  if (!hasGit()) return;
  const dir = tmp('mcc-git-repo-');
  git(dir, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'gen'));
  fs.writeFileSync(path.join(dir, 'src', 'keep.js'), 'const keep = 1;\n');
  fs.writeFileSync(path.join(dir, 'src', 'old.js'), 'const old = 1;\n');
  fs.writeFileSync(path.join(dir, 'gen', 'out.js'), 'const out = 1;\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  fs.writeFileSync(path.join(dir, 'src', 'keep.js'), 'const keep = 2;\n');
  fs.writeFileSync(path.join(dir, 'gen', 'out.js'), 'const out = 2;\n');

  const content = { issues: false, duplication: false, coverage: false, defects: false };
  const api = createApi({ configDir: tmp('mcc-git-cfg-') });
  const made = await api.call('project.create', {
    name: 'Git App', source: dir, scan: false,
    settings: { excludeDirs: ['gen'], git: { scope: 'changed', ref: 'HEAD', period: 'daily', content } },
  });
  const saved = JSON.parse(fs.readFileSync(made.file, 'utf8'));
  assert.equal(saved.settings.git.scope, 'changed');
  assert.deepEqual(saved.settings.excludeDirs, ['gen']);

  const changed = await api.call('project.scan', { path: dir, projectId: made.project.id });
  assert.equal(changed.analysis.git.scope, 'changed');
  assert.deepEqual(changed.analysis.files.map((f) => f.path).sort(), ['src/keep.js']);

  const ws = api.store.load();
  const project = ws.projects.find((p) => p.id === made.project.id);
  project.git = { ...project.git, scope: 'full' };
  api.store.save(ws);
  const full = await api.call('project.scan', { path: dir, projectId: made.project.id });
  assert.equal(full.analysis.git.scope, 'full');
  assert.deepEqual(full.analysis.files.map((f) => f.path).sort(), ['src/keep.js', 'src/old.js']);

  const again = api.store.load();
  again.projects.find((p) => p.id === made.project.id).gitRun = { nextRun: new Date(Date.now() - 60000).toISOString() };
  api.store.save(again);
  const ran = await api.scheduler.tick();
  assert.equal(ran.length, 1);
  assert.equal(ran[0].status, 'SUCCESS');
  assert.equal((await api.scheduler.tick()).length, 0, 'the same period does not run twice');
  assert.equal(api.store.load().projects.find((p) => p.id === made.project.id).gitRun.lastStatus, 'SUCCESS');
});

test('fetch uses the configured remote, and a changed analysis outside git reports no files', async () => {
  if (!hasGit()) return;
  const remote = tmp('mcc-git-remote-');
  git(remote, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(remote, 'a.js'), 'const a = 1;\n');
  git(remote, 'add', '.');
  git(remote, 'commit', '-q', '-m', 'one');
  const dir = tmp('mcc-git-clone-');
  git(dir, 'clone', '-q', remote, '.');
  fs.writeFileSync(path.join(remote, 'b.js'), 'const b = 1;\n');
  git(remote, 'add', '.');
  git(remote, 'commit', '-q', '-m', 'two');
  const tip = git(remote, 'rev-parse', 'HEAD').trim();
  const fetched = await gitplan.resolveScan(dir, { git: { url: remote, branch: 'main', fetch: true, scope: 'full' } }, scm);
  assert.equal(fetched.meta.fetched, true);
  assert.equal(git(dir, 'rev-parse', 'FETCH_HEAD').trim(), tip);

  const plain = tmp('mcc-git-plain-');
  fs.writeFileSync(path.join(plain, 'a.js'), 'const a = 1;\n');
  const missed = await gitplan.resolveScan(plain, { mainBranch: 'main', git: { scope: 'changed', fetch: true } }, scm);
  assert.deepEqual(missed.options.onlyFiles, []);
  assert.equal(missed.meta.fetched, false);
  assert.ok(missed.warnings.some((w) => w.engine === 'git'));
});

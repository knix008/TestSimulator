import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const compat = require('../core/compat/index.js');
const compliance = require('../core/platform/compliance.js');
const reports = require('../core/platform/reports.js');
const scm = require('../core/platform/scm.js');
const pr = require('../core/platform/pullrequest.js');
const webhooks = require('../core/platform/webhooks.js');
const users = require('../core/platform/users.js');
const external = require('../core/platform/external.js');
const history = require('../core/platform/history.js');
const measures = require('../core/platform/measures.js');
const platform = require('../core/platform/index.js');
const { analyzeSources, listRules } = require('../core/analyze.js');

// ---------------------------------------------------------------------------
// Fixtures

function realAnalysis() {
  return analyzeSources([
    { path: 'src/a.c', lang: 'c', text: '#include <stdio.h>\nvoid f(char*s){char b[8]; strcpy(b,s); gets(b); system(s);}\nint g(int*p){if(p==NULL){*p=1;} return 0;}\n' },
    { path: 'web/x.js', lang: 'js', text: 'eval(location.hash);\nconst password="hunter22";\n' },
  ], {});
}

const MISRA_CATALOG = [
  { key: 'misra-c:1.3', type: 'BUG', severity: 'CRITICAL', tags: ['misra-c2012'], standards: { misraC2012: 'Rule 1.3' }, misraCategory: 'Required', decidable: false, name: { en: 'No undefined behaviour', ko: '정의되지 않은 동작 금지' } },
  { key: 'misra-c:9.1', type: 'BUG', severity: 'CRITICAL', tags: ['misra-c2012', 'cwe-457'], standards: { misraC2012: 'Rule 9.1', cwe: ['CWE-457'] }, misraCategory: 'Mandatory', decidable: false, name: { en: 'Read before set', ko: '초기화 전 읽기' } },
  { key: 'misra-c:10.1', type: 'CODE_SMELL', severity: 'MAJOR', tags: ['misra-c2012'], standards: { misraC2012: 'Rule 10.1' }, misraCategory: 'Required', decidable: true, name: { en: 'Operand type', ko: '피연산자 형식' } },
  { key: 'misra-c:15.5', type: 'CODE_SMELL', severity: 'MINOR', tags: ['misra-c2012'], standards: { misraC2012: 'Rule 15.5' }, misraCategory: 'Advisory', decidable: true, name: { en: 'Single exit', ko: '단일 출구' } },
  { key: 'misra-c:2.5', type: 'CODE_SMELL', severity: 'MINOR', tags: ['misra-c2012'], standards: { misraC2012: 'Rule 2.5' }, misraCategory: 'Advisory', decidable: true, name: { en: 'Unused macro', ko: '안 쓰는 매크로' } },
  { key: 'c:strcpy', type: 'VULNERABILITY', severity: 'CRITICAL', tags: ['cwe-120'], cwe: 'CWE-120', cert: 'CERT STR31-C', standards: { certC: 'STR31-C', cwe: ['CWE-120'] }, name: { en: 'strcpy', ko: 'strcpy' } },
];

function issue(over) {
  return { key: `k${Math.random().toString(36).slice(2, 10)}`, rule: 'misra-c:10.1', type: 'CODE_SMELL', severity: 'MAJOR', file: 'src/a.c', line: 3, status: 'OPEN', resolution: null, message: { en: 'm', ko: 'm' }, debtMin: 10, tags: [], isNew: true, ...over };
}

// ---------------------------------------------------------------------------
// compliance.js

test('CWE Top 25 lists hold 25 distinct CWEs in the published order', () => {
  for (const list of [compliance.CWE_TOP25_2023, compliance.CWE_TOP25_2024]) {
    assert.equal(list.length, 25);
    assert.equal(new Set(list).size, 25);
  }
  assert.equal(compliance.CWE_TOP25_2023[0], 787);
  assert.equal(compliance.CWE_TOP25_2024[0], 79);
  assert.ok(compliance.CWE_TOP25_2024.includes(200) && !compliance.CWE_TOP25_2023.includes(200));
});

test('OWASP, PCI, STIG, SANS reports map real analysis issues by CWE', () => {
  const a = realAnalysis();
  const catalog = listRules();
  const o21 = compliance.categoryReport(a.issues, catalog, 'owasp2021');
  assert.equal(o21.categories.length, 10);
  const a03 = o21.categories.find((c) => c.id === 'A03');
  assert.ok(a03.vulnerabilities >= 2, 'command injection and eval are A03');
  // Critical injection gives D; a blocker from the wider rule set gives E.
  assert.match(a03.rating, /^[DE]$/);
  assert.ok(o21.categories.find((c) => c.id === 'A07').vulnerabilities >= 1, 'hard-coded password is A07');
  const o17 = compliance.categoryReport(a.issues, catalog, 'owasp2017', { lang: 'ko' });
  assert.equal(o17.categories.find((c) => c.id === 'A1').title, '인젝션');
  const pci = compliance.categoryReport(a.issues, catalog, 'pciDss321');
  assert.ok(pci.categories.find((c) => c.id === '6.5.2').total >= 1, 'strcpy is a buffer overflow');
  const pci4 = compliance.categoryReport(a.issues, catalog, 'pciDss40');
  assert.ok(pci4.categories.find((c) => c.id === '6.2.4.1').total >= 1);
  const stig = compliance.categoryReport(a.issues, catalog, 'stigAsdV5R3');
  assert.equal(stig.categories.find((c) => c.id === 'V-222612').cat, 'CAT I');
  assert.ok(stig.categories.find((c) => c.id === 'V-222642').total >= 1);
  const sans = compliance.categoryReport(a.issues, catalog, 'sansTop25');
  assert.ok(sans.categories.find((c) => c.id === 'risky-resource').total >= 1);
  assert.throws(() => compliance.categoryReport([], [], 'nope'));
});

test('direct standards on a rule win over CWE mapping, and closed issues are left out', () => {
  const catalog = [{ key: 'x:1', type: 'VULNERABILITY', severity: 'MAJOR', tags: ['cwe-89'], standards: { owasp2021: ['A10'] } }];
  const r = compliance.categoryReport([issue({ rule: 'x:1', type: 'VULNERABILITY' }), issue({ rule: 'x:1', type: 'VULNERABILITY', status: 'RESOLVED', resolution: 'FIXED' })], catalog, 'owasp2021');
  assert.equal(r.categories.find((c) => c.id === 'A10').vulnerabilities, 1);
  assert.equal(r.categories.find((c) => c.id === 'A03').vulnerabilities, 0);
});

test('CWE Top 25 report ranks categories and counts per year', () => {
  const a = realAnalysis();
  const r24 = compliance.cweTop25Report(a.issues, listRules(), 2024);
  assert.equal(r24.categories[0].id, 'CWE-79');
  assert.ok(r24.categories.find((c) => c.id === 'CWE-78').total >= 1);
  assert.ok(r24.categories.find((c) => c.id === 'CWE-476').total >= 1);
  const r23 = compliance.cweTop25Report(a.issues, listRules(), '2023');
  assert.equal(r23.categories[0].id, 'CWE-787');
  assert.equal(r23.title, 'CWE Top 25 2023');
});

test('ASVS levels include lower-level requirements and fail on mapped issues', () => {
  const a = realAnalysis();
  const l1 = compliance.asvsReport(a.issues, listRules(), 1);
  const l3 = compliance.asvsReport(a.issues, listRules(), 3);
  assert.ok(l3.requirements.length > l1.requirements.length);
  assert.ok(l1.requirements.every((r) => r.level === 1));
  assert.equal(l1.requirements.find((r) => r.id === 'V5.3.8').status, 'FAILED');
  assert.equal(l1.compliant, false);
  assert.equal(l3.requirements.find((r) => r.id === 'V5.4.1').status, 'FAILED', 'strcpy and NULL deref are memory safety');
  const clean = compliance.asvsReport([], [], 2);
  assert.equal(clean.compliant, true);
  assert.equal(compliance.report([], [], 'asvs4:2').level, 2);
});

test('CERT C summary groups by rule and section', () => {
  const issues = [issue({ rule: 'c:strcpy', type: 'VULNERABILITY' }), issue({ rule: 'c:strcpy', type: 'VULNERABILITY', line: 9 })];
  const r = compliance.certReport(issues, MISRA_CATALOG, 'certC');
  assert.equal(r.rules[0].id, 'STR31-C');
  assert.equal(r.rules[0].total, 2);
  assert.equal(r.sections[0].section, 'STR');
  assert.ok(r.checkedRules.includes('STR31-C'));
  assert.equal(compliance.certReport(issues, MISRA_CATALOG, 'certCpp').violatedRules, 0);
});

test('securityReports runs every standard and report() dispatches by id', () => {
  const all = compliance.securityReports(realAnalysis().issues, listRules());
  for (const id of ['owasp2017', 'owasp2021', 'pciDss321', 'pciDss40', 'stigAsdV5R3', 'sansTop25', 'cweTop25_2023', 'cweTop25_2024', 'asvs4', 'certC', 'certCpp']) assert.ok(all[id], id);
  assert.ok(compliance.standardIds().includes('misraCpp2023'));
  assert.equal(compliance.report([], MISRA_CATALOG, 'misraC2012').standard, 'misraC2012');
  assert.throws(() => compliance.report([], [], 'unknown'));
});

test('MISRA recategorization follows MISRA Compliance:2020 limits', () => {
  assert.equal(compliance.canRecategorize('Mandatory', 'Required'), false);
  assert.equal(compliance.canRecategorize('Required', 'Advisory'), false);
  assert.equal(compliance.canRecategorize('Required', 'Disapplied'), false);
  assert.equal(compliance.canRecategorize('Required', 'Mandatory'), true);
  assert.equal(compliance.canRecategorize('Advisory', 'Disapplied'), true);
  assert.equal(compliance.canRecategorize('Advisory', 'Required'), true);
  assert.equal(compliance.normGuideline('10.1'), 'Rule 10.1');
  assert.equal(compliance.normGuideline('dir 4.1'), 'Dir 4.1');
});

test('MISRA compliance: statuses, deviations, permits, GCS/GEP and verdict', () => {
  const issues = [
    issue({ rule: 'misra-c:10.1', file: 'src/legacy/old.c', line: 5 }),
    issue({ rule: 'misra-c:10.1', file: 'src/legacy/old.c', line: 7 }),
    issue({ rule: 'misra-c:15.5', file: 'src/a.c' }),
    issue({ rule: 'misra-c:9.1', file: 'src/b.c', type: 'BUG' }),
    issue({ rule: 'misra-c:2.5', file: 'src/a.c' }),
  ];
  const plan = {
    standard: 'misraC2012',
    recategorization: { 'Rule 2.5': 'Disapplied', 'Rule 10.1': 'Advisory', 'Rule 15.5': 'Required' },
    permits: [{ id: 'P1', rules: ['Rule 10.1'], description: 'Legacy arithmetic' }],
    deviations: [
      { id: 'D1', rule: '10.1', scope: 'src/legacy/**', justification: 'Vendor code', approver: 'QA lead', date: '2026-01-10', permit: 'P1' },
      { id: 'D2', rule: 'Rule 9.1', scope: '**', justification: 'x', approver: 'y', date: '2026-01-10' },
      { id: 'D3', rule: 'Rule 15.5', scope: '**', justification: '', approver: '', date: 'bad' },
    ],
    manualReview: ['Rule 1.3'],
  };
  const r = compliance.misraCompliance(issues, MISRA_CATALOG, plan);
  const g = Object.fromEntries(r.guidelines.map((x) => [x.guideline, x]));
  assert.equal(g['Rule 10.1'].effectiveCategory, 'Required', 'Required cannot be downgraded to Advisory');
  assert.equal(r.grp.find((x) => x.guideline === 'Rule 10.1').applied, false);
  assert.equal(g['Rule 10.1'].status, 'Deviations');
  assert.equal(g['Rule 10.1'].deviations, 2);
  assert.equal(g['Rule 2.5'].status, 'Disapplied');
  assert.equal(g['Rule 15.5'].effectiveCategory, 'Required');
  assert.equal(g['Rule 15.5'].status, 'Violations', 'an invalid deviation does not cover');
  assert.equal(g['Rule 9.1'].status, 'Violations', 'Mandatory cannot be deviated');
  assert.ok(r.deviations.find((d) => d.id === 'D2').problems.includes('mandatory-not-deviable'));
  assert.deepEqual(r.deviations.find((d) => d.id === 'D3').problems.sort(), ['missing-approver', 'missing-date', 'missing-justification']);
  assert.equal(g['Rule 1.3'].status, 'Compliant');
  assert.equal(g['Rule 1.3'].enforcement, 'Tool + manual review');
  assert.equal(r.compliant, false);
  assert.equal(r.verdict, 'Not compliant');
  assert.ok(r.gcs.length === r.gep.length && r.gcs.length === 5);
  assert.equal(r.gep.find((x) => x.guideline === 'Rule 1.3').decidable, false);

  const ok = compliance.misraCompliance([issue({ rule: 'misra-c:15.5' })], MISRA_CATALOG, { standard: 'misraC2012' });
  assert.equal(ok.compliant, true, 'advisory violations do not break compliance');
  assert.equal(ok.advisoryViolations, 1);

  const unchecked = compliance.misraCompliance([], MISRA_CATALOG, { standard: 'misraC2012', guidelines: [{ id: 'Rule 21.3', category: 'Required' }], inactive: [] });
  assert.equal(unchecked.guidelines.find((x) => x.guideline === 'Rule 21.3').status, 'Not checked');
  assert.equal(unchecked.compliant, false);
  assert.equal(compliance.validateDeviation({ rule: 'Rule 10.1', justification: 'j', approver: 'a', date: '2026-01-01', expires: '2026-02-01' }, 'Required', [], Date.parse('2026-03-01')).problems[0], 'expired');
  assert.equal(compliance.defaultMisraPlan('misraCpp2023').standard, 'misraCpp2023');
});

// ---------------------------------------------------------------------------
// reports.js

test('reports render self-contained bilingual HTML and CSV for every kind', () => {
  const a = realAnalysis();
  a.defectAnalysis.snapshot = 2;
  const catalog = [...listRules(), ...MISRA_CATALOG];
  const sca = { dependencies: [{ name: 'lodash', version: '4.17.20', license: 'MIT' }], vulnerabilities: [{ id: 'CVE-2021-23337', package: 'lodash', severity: 'HIGH' }], licenses: [] };
  const hist = [
    { at: '2026-01-01T00:00:00Z', measures: { bugs: 3, vulnerabilities: 4, code_smells: 1, ncloc: 100 }, defectAnalysis: { snapshot: 1, outstanding: 6, outstandingHigh: 2 } },
    { at: '2026-02-01T00:00:00Z', measures: { bugs: 1, vulnerabilities: 4, code_smells: 0, ncloc: 100 }, defectAnalysis: { snapshot: 2, outstanding: 5, outstandingHigh: 1 } },
  ];
  for (const kind of reports.REPORT_KINDS) {
    for (const lang of ['en', 'ko']) {
      const out = reports.build(kind, a, { lang, catalog, sca, history: hist, standard: 'cweTop25_2024', plan: { standard: 'misraC2012' }, ruleSet: 'security', project: 'demo<x>' });
      assert.ok(out.html.startsWith('<!doctype html>'), kind);
      assert.ok(out.html.includes(`lang="${lang}"`));
      assert.ok(out.html.includes('@page'), 'print ready');
      assert.ok(!/<script/i.test(out.html), 'no scripts');
      assert.ok(!out.html.includes('demo<x>'), 'project name escaped');
      assert.ok(out.csv.startsWith('\ufeff"'), `${kind} csv has BOM`);
      assert.ok(out.fileName.length > 0);
    }
  }
  const exec = reports.executiveReport(a, { lang: 'ko', catalog, sca });
  assert.ok(exec.includes('품질 게이트') && exec.includes('CVE-2021-23337') && exec.includes('<svg') === false);
  assert.ok(reports.executiveReport(a, { history: hist }).includes('<svg'));
  assert.throws(() => reports.build('nope', a));
});

test('security, integrity, CWE-weighted and rule-set reports carry the numbers', () => {
  const a = realAnalysis();
  const catalog = listRules();
  assert.ok(reports.securityReport(a, catalog, 'owasp2021').includes('A03'));
  assert.ok(reports.securityReport(a, catalog, 'asvs4:1', { lang: 'en' }).includes('V5.3.8'));
  assert.ok(reports.securityReport(a, MISRA_CATALOG, 'certC').includes('Rules checked'));
  const csv = reports.securityCsv(a, catalog, 'owasp2021');
  assert.equal(csv.trim().split('\r\n').length, 11);
  const integ = reports.integrityCsv(a);
  assert.ok(/"total","density_per_kloc"/.test(integ));
  const html = reports.integrityReport(a, { lang: 'en', targetDensity: 1000 });
  assert.ok(html.includes('Defect density'));
  assert.equal(reports.cweWeight(79), 25);
  assert.equal(reports.cweWeight(306), 1);
  assert.equal(reports.cweWeight(99999), 0.5);
  assert.ok(reports.defectSecurityCsv(a, catalog).includes('CWE-78'));
  const members = reports.ruleSetMembers(MISRA_CATALOG, 'misraC2012');
  assert.equal(members.length, 5);
  assert.equal(reports.ruleSetMembers(MISRA_CATALOG, { rules: ['c:strcpy'] }).length, 1);
  const sp = reports.weaknessCsv({ issues: [issue({ rule: 'misra-c:10.1' })] }, MISRA_CATALOG, 'misraC2012');
  assert.ok(sp.includes('"misra-c:10.1","Operand type","Rule 10.1","MAJOR","true","1"'));
  const misraHtml = reports.misraReport({ issues: [] }, MISRA_CATALOG, { standard: 'misraC2012' }, { lang: 'ko' });
  assert.ok(misraHtml.includes('지침 준수 요약'));
  assert.equal(reports.sbomSection(null), '');
  assert.ok(reports.sbomCsv({ dependencies: [{ name: 'a', version: '1' }], vulnerabilities: [{ id: 'CVE-1', package: 'a' }] }).includes('CVE-1'));
});

test('CSV cells are quoted and formula-safe', () => {
  const out = reports.weaknessCsv({ issues: [] }, [{ key: '=cmd', name: { en: 'x"y' }, severity: 'MAJOR' }], 'all');
  assert.ok(out.includes(`"'=cmd"`));
  assert.ok(out.includes('"x""y"'));
});

// ---------------------------------------------------------------------------
// scm.js

function hasGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Tester', '-c', 'user.email=tester@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

test('scm functions return graceful empty results without git or outside a repository', async () => {
  const bogus = { git: 'git-binary-that-does-not-exist-mcc' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-nogit-'));
  try {
    assert.equal((await scm.gitAvailable(bogus)).available, false);
    for (const o of [bogus, {}]) {
      const repo = await scm.detectRepo(dir, o);
      assert.equal(repo.ok, false);
      assert.equal(repo.root, null);
      assert.equal(await scm.currentBranch(dir, o), null);
      assert.deepEqual(await scm.listBranches(dir, o), []);
      assert.equal(await scm.mergeBase(dir, 'main', 'HEAD', o), null);
      assert.deepEqual(await scm.changedLines(dir, 'HEAD', o), { ok: false, base: null, files: {} });
      assert.deepEqual(await scm.blame(dir, 'a.c', o), []);
      assert.deepEqual(await scm.blameFiles(dir, ['a.c'], o), {});
      assert.deepEqual(await scm.listTags(dir, o), []);
      assert.deepEqual(await scm.log(dir, o), []);
    }
    assert.equal(await scm.mergeBase(dir, null), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scm reads branches, changed lines, blame and tags from a real repository', async () => {
  if (!hasGit()) {
    // No git here: the graceful path is the supported behaviour and is asserted.
    assert.equal((await scm.gitAvailable()).available, false);
    assert.deepEqual(await scm.listBranches(os.tmpdir()), []);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-git-'));
  try {
    git(dir, 'init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.c'), ['int a;', 'int b;', 'int c;', 'int d;', 'int e;', ''].join('\n'));
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'first');
    git(dir, 'tag', '-a', 'v1.0', '-m', 'release 1.0');
    git(dir, 'checkout', '-q', '-b', 'feature');
    fs.writeFileSync(path.join(dir, 'src', 'a.c'), ['int a;', 'int B;', 'int c;', 'int d;', 'int e;', 'int f;', ''].join('\n'));
    fs.writeFileSync(path.join(dir, 'src', 'new.c'), 'int n;\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'second');
    fs.writeFileSync(path.join(dir, 'untracked.c'), 'int u;\n');

    const repo = await scm.detectRepo(dir);
    assert.equal(repo.ok, true);
    assert.equal(path.basename(repo.root), path.basename(dir));
    assert.equal(repo.branch, 'feature');
    assert.equal(repo.dirty, true);
    assert.match(repo.head, /^[0-9a-f]{40}$/);
    assert.equal(await scm.currentBranch(dir), 'feature');
    const branches = await scm.listBranches(dir);
    assert.deepEqual(branches.map((b) => b.name).sort(), ['feature', 'main']);
    assert.equal(branches.find((b) => b.current).name, 'feature');
    const base = await scm.mergeBase(dir, 'main');
    assert.match(base, /^[0-9a-f]{40}$/);

    const changed = await scm.changedLines(dir, null, { target: 'main' });
    assert.equal(changed.ok, true);
    assert.equal(changed.base, base);
    assert.equal(changed.files['src/a.c'].status, 'M');
    assert.deepEqual(changed.files['src/a.c'].ranges, [[2, 2], [6, 6]]);
    assert.equal(changed.files['src/new.c'].isNew, true);
    assert.equal(changed.files['untracked.c'].untracked, true);
    assert.equal(scm.isChangedLine(changed, 'src/a.c', 2), true);
    assert.equal(scm.isChangedLine(changed, 'src/a.c', 3), false);
    assert.equal(scm.isChangedLine(changed, 'src/new.c', 1), true);
    const committedOnly = await scm.changedLines(dir, 'main', { workingTree: false });
    assert.equal(committedOnly.files['untracked.c'], undefined);

    const blame = await scm.blame(dir, 'src/a.c');
    assert.equal(blame.length, 6);
    assert.equal(blame[1].author, 'Tester');
    assert.equal(blame[1].email, 'tester@example.com');
    assert.equal(blame[1].summary, 'second');
    assert.equal(blame[0].summary, 'first');
    assert.ok(blame[0].date);
    const byFile = await scm.blameFiles(dir, ['src/a.c', 'src/new.c', 'missing.c']);
    assert.deepEqual(Object.keys(byFile).sort(), ['src/a.c', 'src/new.c']);
    const assigned = scm.assignAuthors([{ file: 'src/a.c', line: 2, assignee: '' }, { file: 'nope.c', line: 1 }], byFile, { emailToLogin: { 'tester@example.com': 'tester' } });
    assert.equal(assigned[0].assignee, 'tester');
    assert.equal(assigned[0].authorName, 'Tester');
    assert.equal(assigned[1].assignee, undefined);
    const since = scm.linesSinceDate(byFile, '2000-01-01');
    assert.deepEqual(since.files['src/a.c'].ranges, [[1, 6]]);
    assert.deepEqual(scm.linesSinceDate(byFile, '2999-01-01').files, {});

    const tags = await scm.listTags(dir);
    assert.equal(tags[0].name, 'v1.0');
    assert.match(tags[0].commit, /^[0-9a-f]{40}$/);
    const sinceVersion = await scm.changedSinceVersion(dir, 'v1.0', { includeUntracked: false });
    assert.deepEqual(sinceVersion.files['src/a.c'].ranges, [[2, 2], [6, 6]]);
    const logs = await scm.log(dir, { from: 'main' });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].subject, 'second');
    assert.deepEqual((await scm.changedLines(dir, 'no-such-ref')).files, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unified diff and blame parsers handle edge cases', () => {
  const diff = ['diff --git a/x.c b/x.c', '--- a/x.c', '+++ b/x.c', '@@ -1,0 +2,3 @@', '@@ -9 +12 @@', '@@ -20,2 +22,0 @@', '--- a/gone.c', '+++ /dev/null', '@@ -1 +0,0 @@'].join('\n');
  assert.deepEqual(scm.parseUnifiedZero(diff), { 'x.c': [[2, 4], [12, 12]] });
  assert.deepEqual(scm.parseNameStatus('M\ta.c\nR100\told.c\tnew.c\n'), [{ status: 'M', file: 'a.c' }, { status: 'R', from: 'old.c', file: 'new.c' }]);
  const blame = `${scm.NULL_SHA} 1 1 1\nauthor Not Committed Yet\nauthor-mail <not.committed.yet>\nauthor-time 1700000000\nsummary Version of a.c from a.c\n\tint x;\n`;
  const parsed = scm.parseBlame(blame);
  assert.equal(parsed[0].committed, false);
  assert.equal(parsed[0].email, 'not.committed.yet');
});

// ---------------------------------------------------------------------------
// pullrequest.js

test('PR analysis keeps issues on changed lines and gates new code', () => {
  const analysis = {
    issues: [
      issue({ key: 'i1', file: 'src/a.c', line: 2, type: 'BUG', severity: 'CRITICAL', rule: 'c:x' }),
      issue({ key: 'i2', file: 'src/a.c', line: 3, type: 'BUG', severity: 'CRITICAL', rule: 'c:x' }),
      issue({ key: 'i3', file: 'src/new.c', line: 1, type: 'CODE_SMELL', severity: 'MINOR', rule: 'c:y', debtMin: 5 }),
      issue({ key: 'i4', file: 'src/gone.c', line: 1, type: 'BUG', rule: 'c:x' }),
    ],
    files: [{ path: 'src/a.c', ncloc: 6 }, { path: 'src/new.c', ncloc: 10 }],
    duplications: [{ lines: 3, instances: [{ path: 'src/new.c', start: 1, end: 3 }, { path: 'src/old.c', start: 1, end: 3 }] }],
  };
  const changed = { base: 'abc', files: { 'src/a.c': { status: 'M', isNew: false, ranges: [[2, 2]] }, 'src/new.c': { status: 'A', isNew: true, ranges: [] }, 'src/gone.c': { status: 'D', isNew: false, ranges: [] } } };
  const lcov = measures.parseLcovFull('SF:src/a.c\nDA:2,0\nBRDA:2,0,0,1\nBRDA:2,0,1,0\nend_of_record\nSF:src/new.c\nDA:1,1\nend_of_record\n');
  const res = pr.analyzePullRequest(analysis, changed, { coverage: lcov, key: '42', branch: 'feature' });
  assert.deepEqual(res.issues.map((i) => i.key), ['i1', 'i3']);
  assert.equal(res.measures.new_bugs, 1);
  assert.equal(res.measures.new_code_smells, 1);
  assert.equal(res.changedLines, 11);
  assert.equal(res.measures.new_lines_to_cover, 2);
  assert.equal(res.measures.new_uncovered_conditions, 1);
  assert.equal(res.measures.new_duplicated_lines, 3);
  assert.equal(res.qualityGate.status, 'ERROR');
  assert.ok(res.qualityGate.conditions.some((c) => c.metric === 'new_bugs' && c.status === 'ERROR'));
  const clean = pr.analyzePullRequest({ issues: [], files: [] }, { files: {} });
  assert.equal(clean.qualityGate.status, 'OK');

  const md = pr.summaryMarkdown(res, { lang: 'en', url: 'http://x/pr/42' });
  assert.ok(md.startsWith('## ❌ Quality Gate failed'));
  assert.ok(md.includes('`src/a.c:2`'));
  assert.ok(pr.summaryMarkdown(clean, { lang: 'ko' }).includes('통과'));
});

test('decoration payloads for GitHub, GitLab, Azure DevOps and Bitbucket', () => {
  const many = Array.from({ length: 120 }, (_, n) => issue({ key: `k${n}`, line: n + 1, severity: n % 2 ? 'CRITICAL' : 'MINOR', type: n % 3 ? 'BUG' : 'CODE_SMELL', file: 'src\\a.c' }));
  const res = pr.analyzePullRequest({ issues: many, files: [{ path: 'src/a.c', ncloc: 120 }] }, { files: { 'src/a.c': { status: 'A', isNew: true, ranges: [] } } });
  const gh = pr.githubCheckRun(res, { headSha: 'deadbeef' });
  assert.equal(gh.length, 3);
  assert.equal(gh[0].output.annotations.length, 50);
  assert.equal(gh[0].conclusion, 'failure');
  assert.equal(gh[0].head_sha, 'deadbeef');
  assert.equal(gh[0].output.annotations[1].annotation_level, 'failure');
  assert.equal(gh[0].output.annotations[0].annotation_level, 'notice');
  assert.equal(gh[0].output.annotations[0].path, 'src/a.c');
  const gl = pr.gitlabCodeQuality(res);
  assert.equal(gl.length, 120);
  assert.deepEqual(Object.keys(gl[0]).sort(), ['categories', 'check_name', 'description', 'fingerprint', 'location', 'severity', 'type']);
  assert.equal(gl[1].severity, 'critical');
  assert.equal(new Set(gl.map((x) => x.fingerprint)).size, 120);
  const az = pr.azureDevOps(res, { maxThreads: 10 });
  assert.equal(az.threads.length, 10);
  assert.equal(az.threads[0].threadContext.filePath, '/src/a.c');
  assert.equal(az.status.state, 'failed');
  const bb = pr.bitbucketCodeInsights(res);
  assert.equal(bb.report.result, 'FAILED');
  assert.equal(bb.annotations.length, 2);
  assert.equal(bb.annotations[0].length, 100);
  assert.equal(bb.annotations[0][1].severity, 'HIGH');
  const all = pr.decorations(res, { headSha: 'x' });
  assert.deepEqual(Object.keys(all), ['github', 'gitlab', 'azure', 'bitbucket']);
  const okRun = pr.githubCheckRun(pr.analyzePullRequest({ issues: [] }, { files: {} }), { headSha: 'y' });
  assert.equal(okRun.length, 1);
  assert.equal(okRun[0].conclusion, 'success');
});

// ---------------------------------------------------------------------------
// webhooks.js

test('webhook definitions, payload shape and HMAC signature', () => {
  assert.throws(() => webhooks.defineWebhook({ url: 'ftp://x' }));
  assert.throws(() => webhooks.defineWebhook({ url: 'not a url' }));
  assert.throws(() => webhooks.defineWebhook({ url: 'http://x', events: ['nope'] }));
  const hook = webhooks.defineWebhook({ url: 'https://ci.example.com/hook', secret: 's3cret', events: ['analysis-done', 'gate-changed'] });
  assert.equal(webhooks.publicWebhook(hook).hasSecret, true);
  assert.equal(webhooks.publicWebhook(hook).secret, undefined);
  const a = realAnalysis();
  const payload = webhooks.buildPayload({ project: { key: 'demo', name: 'Demo', mainBranch: 'main' }, analysis: a, branch: 'main', serverUrl: 'http://localhost:5210/', taskId: 't1' });
  assert.equal(payload.project.key, 'demo');
  assert.equal(payload.branch.isMain, true);
  assert.equal(payload.branch.type, 'BRANCH');
  assert.equal(payload.qualityGate.status, a.qualityGate.status);
  assert.ok(payload.qualityGate.conditions.every((c) => typeof c.errorThreshold === 'string' && /THAN|EQUALS/.test(c.operator)));
  assert.equal(payload.serverUrl, 'http://localhost:5210');
  const prPayload = webhooks.buildPayload({ project: { key: 'demo' }, analysis: a, pullRequest: { key: '7' } });
  assert.equal(prPayload.branch.type, 'PULL_REQUEST');
  const body = JSON.stringify(payload);
  const sig = webhooks.sign(body, 's3cret');
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(webhooks.verifySignature(body, 's3cret', sig), true);
  assert.equal(webhooks.verifySignature(body, 'wrong', sig), false);
  assert.equal(webhooks.verifySignature(body, 's3cret', 'zz'), false);
  assert.deepEqual(webhooks.eventsFor({ previousGate: 'OK', gate: 'ERROR' }), ['analysis-done', 'gate-changed']);
  assert.deepEqual(webhooks.eventsFor({ previousGate: null, gate: 'ERROR' }), ['analysis-done']);
  const gateOnly = webhooks.defineWebhook({ url: 'http://x', events: ['gate-changed'], projectId: 'p1' });
  assert.equal(webhooks.selectWebhooks([hook, gateOnly], 'p2', ['analysis-done']).length, 1);
  assert.equal(webhooks.selectWebhooks([hook, gateOnly], 'p1', ['analysis-done', 'gate-changed']).length, 2);
});

test('webhook delivery signs, logs and never throws', async () => {
  const hook = webhooks.defineWebhook({ url: 'http://127.0.0.1:9/hook', secret: 'k' });
  const payload = { hello: 'world' };
  let seen;
  const ok = await webhooks.deliver(hook, payload, { fetch: async (url, init) => { seen = { url, init }; return { status: 204, text: async () => '' }; } });
  assert.equal(ok.success, true);
  assert.equal(ok.httpStatus, 204);
  assert.equal(seen.init.headers[webhooks.SIGNATURE_HEADER], webhooks.sign(JSON.stringify(payload), 'k'));
  const bad = await webhooks.deliver(hook, payload, { fetch: async () => ({ status: 500, text: async () => 'boom' }) });
  assert.equal(bad.success, false);
  assert.equal(bad.error, 'HTTP 500');
  assert.equal(bad.response, 'boom');
  const thrown = await webhooks.deliver(hook, payload, { fetch: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(thrown.error, 'ECONNREFUSED');
  const slow = await webhooks.deliver(hook, payload, { timeoutMs: 30, fetch: (u, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }) });
  assert.match(slow.error, /Timed out|aborted/);
  assert.equal((await webhooks.deliver(null, payload)).error, 'No webhook URL');
  assert.equal((await webhooks.deliver(hook, payload, { fetch: 'nope' })).error, 'fetch is not available');
  let log = [];
  for (let n = 0; n < 5; n++) log = webhooks.appendDelivery(log, { ...ok, id: `d${n}` }, 3);
  assert.equal(log.length, 3);
  assert.equal(log[0].id, 'd4');
});

// ---------------------------------------------------------------------------
// users.js

test('security is off by default and authorize allows everything', () => {
  const ws = {};
  const sec = users.ensureSecurity(ws);
  assert.equal(sec.enabled, false);
  assert.equal(sec.users[0].login, 'admin');
  assert.equal(users.authorize(ws, null, 'admin'), true);
  assert.equal(users.authorize(ws, 'nobody', 'scan', 'p1'), true);
  assert.throws(() => users.setEnabled(ws, true), /password/);
});

test('users, groups, permissions, templates and password hashing', () => {
  const ws = {};
  users.ensureSecurity(ws);
  users.setPassword(ws, 'admin', 'admin-password-1');
  assert.ok(ws.security.users[0].password.startsWith('scrypt$'));
  assert.equal(users.authenticate(ws, 'admin', 'admin-password-1').login, 'admin');
  assert.equal(users.authenticate(ws, 'admin', 'wrong'), null);
  assert.equal(users.publicUser(ws.security.users[0]).password, undefined);
  users.setEnabled(ws, true);
  const dev = users.createUser(ws, { login: 'dev', name: 'Developer', email: 'dev@example.com', password: 'developer-pw' });
  assert.deepEqual(dev.groups, ['users']);
  assert.throws(() => users.createUser(ws, { login: 'dev' }));
  assert.throws(() => users.createUser(ws, { login: 'bad login!' }));
  assert.throws(() => users.setPassword(ws, 'dev', 'short'));
  assert.equal(users.authorize(ws, 'admin', 'gateadmin'), true);
  assert.equal(users.authorize(ws, 'dev', 'gateadmin'), false);
  assert.equal(users.authorize(ws, 'dev', 'scan'), true, 'users group can scan');
  // Default template: Anyone can browse, admins administer.
  assert.equal(users.authorize(ws, 'dev', 'browse', 'p1'), true);
  assert.equal(users.authorize(ws, null, 'see-source', 'p1'), true);
  assert.equal(users.authorize(ws, 'dev', 'issueadmin', 'p1'), false);
  assert.equal(users.authorize(ws, 'ghost', 'browse', 'p1'), false);
  users.createGroup(ws, { name: 'qa' });
  users.addMember(ws, 'qa', 'dev');
  users.grantProject(ws, 'p1', 'issue-admin', { group: 'qa' });
  assert.equal(users.authorize(ws, 'dev', 'issueadmin', 'p1'), true);
  assert.equal(users.authorize(ws, 'dev', 'browse', 'p1'), false, 'explicit project permissions replace the template');
  users.grantProject(ws, 'p1', 'admin', { user: 'dev' });
  assert.equal(users.authorize(ws, 'dev', 'securityhotspotadmin', 'p1'), true, 'project admin implies all');
  users.revokeProject(ws, 'p1', 'admin', { user: 'dev' });
  users.removeMember(ws, 'qa', 'dev');
  assert.equal(users.authorize(ws, 'dev', 'issueadmin', 'p1'), false);
  users.grantGlobal(ws, 'profile-admin', { user: 'dev' });
  assert.ok(users.permissionsOf(ws, 'dev').global.includes('profileadmin'));
  users.revokeGlobal(ws, 'profileadmin', { user: 'dev' });
  assert.ok(!users.permissionsOf(ws, 'dev').global.includes('profileadmin'));
  assert.throws(() => users.grantGlobal(ws, 'fly', { user: 'dev' }));
  const tpl = users.createTemplate(ws, { name: 'Secret', projectKeyPattern: '^secret-', permissions: { browse: { groups: ['administrators'] } } });
  assert.equal(users.templateFor(ws, 'secret-app').id, tpl.id);
  assert.equal(users.templateFor(ws, 'public').id, 'default-template');
  users.applyTemplate(ws, tpl.id, 'p2');
  assert.equal(users.authorize(ws, 'dev', 'browse', 'p2'), false);
  users.setDefaultTemplate(ws, tpl.id);
  assert.equal(users.authorize(ws, 'dev', 'browse', 'p3'), false);
  assert.throws(() => users.createTemplate(ws, { name: 'x', projectKeyPattern: '(' }));
  assert.throws(() => users.deactivateUser(ws, 'admin'), /last administrator/);
  users.deactivateUser(ws, 'dev');
  assert.equal(users.authorize(ws, 'dev', 'scan'), false);
  assert.equal(users.authenticate(ws, 'dev', 'developer-pw'), null);
  assert.throws(() => users.deleteGroup(ws, 'users'));
  users.deleteGroup(ws, 'qa');
  assert.ok(!ws.security.groups.some((g) => g.name === 'qa'));
  assert.equal(users.publicSecurity(ws).users.every((u) => u.password === undefined), true);
});

test('tokens are hashed at rest and scoped by type', () => {
  const ws = {};
  users.ensureSecurity(ws);
  users.setPassword(ws, 'admin', 'admin-password-1');
  users.createUser(ws, { login: 'ci', password: 'ci-password-1' });
  users.setEnabled(ws, true);
  const { token, record } = users.generateToken(ws, { login: 'ci', name: 'build', type: 'PROJECT_ANALYSIS', projectId: 'p1' });
  assert.ok(token.startsWith('mcp_'));
  assert.equal(record.hash, undefined);
  assert.ok(!JSON.stringify(ws).includes(token), 'plain token is not stored');
  assert.equal(users.verifyToken(ws, token).login, 'ci');
  assert.equal(users.authorizeToken(ws, token, 'scan', 'p1'), true);
  assert.equal(users.authorizeToken(ws, token, 'scan', 'p2'), false);
  assert.equal(users.authorizeToken(ws, token, 'browse', 'p1'), false);
  assert.equal(users.verifyToken(ws, 'mcp_wrong'), null);
  const user = users.generateToken(ws, { login: 'ci', name: 'mine' });
  assert.ok(user.token.startsWith('mcu_'));
  assert.equal(users.authorizeToken(ws, user.token, 'browse', 'p1'), true);
  const exp = users.generateToken(ws, { login: 'ci', name: 'old', expiresAt: '2000-01-01T00:00:00Z' });
  assert.equal(users.verifyToken(ws, exp.token), null);
  assert.throws(() => users.generateToken(ws, { login: 'ci', name: 'mine' }));
  assert.throws(() => users.generateToken(ws, { login: 'ci', name: 'p', type: 'PROJECT_ANALYSIS' }));
  assert.equal(users.listTokens(ws, 'ci').length, 3);
  assert.equal(users.revokeToken(ws, 'ci', 'build'), true);
  assert.equal(users.verifyToken(ws, token), null);
  assert.equal(users.verifyPassword('x', 'garbage'), false);
});

// ---------------------------------------------------------------------------
// external.js

const SARIF = {
  version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  runs: [{
    tool: { driver: { name: 'CodeQL', rules: [{ id: 'js/xss', shortDescription: { text: 'XSS' }, properties: { tags: ['security', 'external/cwe/cwe-079'], 'security-severity': '7.8' } }, { id: 'js/unused', defaultConfiguration: { level: 'note' }, messageStrings: { m: { text: 'Unused {0}' } } }] } },
    originalUriBaseIds: { SRC: { uri: 'file:///C:/work/proj/' } },
    results: [
      { ruleId: 'js/xss', ruleIndex: 0, message: { text: 'Reflected XSS' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'web/x.js', uriBaseId: 'SRC' }, region: { startLine: 4, startColumn: 2, endLine: 4, endColumn: 9 } } }], codeFlows: [{ threadFlows: [{ locations: [{ location: { message: { text: 'source' }, physicalLocation: { artifactLocation: { uri: 'web/x.js' }, region: { startLine: 1 } } } }] }] }] },
      { ruleId: 'js/unused', message: { id: 'm', arguments: ['foo'] }, locations: [{ physicalLocation: { artifactLocation: { uri: 'web/y.js' }, region: { startLine: 2 } } }] },
      { ruleId: 'js/none', message: { text: 'no location' } },
    ],
  }],
};

test('SARIF import maps security, CWE, flows, message strings and base URIs', () => {
  const out = external.importExternal(JSON.stringify(SARIF), { root: 'C:/work/proj' });
  assert.equal(out.format, 'sarif');
  assert.equal(out.engine, 'codeql');
  assert.equal(out.findings.length, 2);
  assert.equal(out.warnings.length, 1);
  const [xss, unused] = out.findings;
  assert.equal(xss.rule, 'external_codeql:js/xss');
  assert.equal(xss.externalRule, 'js/xss');
  assert.equal(xss.file, 'web/x.js');
  assert.equal(xss.type, 'VULNERABILITY');
  assert.equal(xss.severity, 'CRITICAL');
  assert.equal(xss.cwe, 'CWE-79');
  assert.equal(xss.column, 2);
  assert.equal(xss.events.length, 1);
  assert.equal(unused.message.en, 'Unused foo');
  assert.equal(unused.severity, 'MINOR');
  assert.equal(unused.type, 'CODE_SMELL');
  assert.equal(out.rules.length, 2);
  const issues = external.toIssues(out.findings);
  assert.equal(issues[0].status, 'OPEN');
  assert.ok(issues[0].tags.includes('cwe-79'));
  assert.match(issues[0].key, /^[0-9a-f]{16}$/);
});

test('generic, Defect Analysis v7/v8 and cppcheck reports import', () => {
  const ref = external.importExternal({
    rules: [{ id: 'r1', name: 'Rule one', engineId: 'mylint', impacts: [{ softwareQuality: 'SECURITY', severity: 'HIGH' }] }],
    issues: [{ ruleId: 'r1', effortMinutes: 15, primaryLocation: { message: 'Bad', filePath: 'src/a.c', textRange: { startLine: 3, startColumn: 0, endColumn: 4 } }, secondaryLocations: [{ message: 'here', filePath: 'src/b.c', textRange: { startLine: 1 } }] }],
  });
  assert.equal(ref.format, 'generic-issues');
  assert.equal(ref.findings[0].rule, 'external_mylint:r1');
  assert.equal(ref.findings[0].type, 'VULNERABILITY');
  assert.equal(ref.findings[0].severity, 'CRITICAL');
  assert.equal(ref.findings[0].column, 1);
  assert.equal(ref.findings[0].debtMin, 15);
  assert.equal(ref.rules[0].name.en, 'Rule one');
  const old = external.parseGenericIssues({ issues: [{ engineId: 'e', ruleId: 'x', type: 'BUG', severity: 'MINOR', primaryLocation: { message: 'm', filePath: 'a.c' } }] });
  assert.equal(old.findings[0].severity, 'MINOR');

  for (const v of [7, 8]) {
    const cov = external.importExternal(JSON.stringify({
      type: compat.DEFECT_JSON_TYPE, formatVersion: v,
      issues: [{
        mergeKey: 'mk1', checkerName: 'NULL_RETURNS', strippedMainEventFilePathname: 'src/a.c', mainEventLineNumber: 12, functionDisplayName: 'f',
        events: [{ eventDescription: 'returned null', eventTag: 'returned_null', filePathname: '/w/src/a.c', lineNumber: 10, main: false }, { eventDescription: 'Dereferencing p', eventTag: 'dereference', filePathname: '/w/src/a.c', lineNumber: 12, main: true }],
        checkerProperties: { category: 'Null pointer dereferences', impact: 'High', cweCategory: '476', issueKind: 'QUALITY' },
      }],
    }), { root: '/w' });
    assert.equal(cov.format, 'defect-json');
    const f = cov.findings[0];
    assert.equal(f.rule, 'external_defect:NULL_RETURNS');
    assert.equal(f.severity, 'CRITICAL');
    assert.equal(f.type, 'BUG');
    assert.equal(f.cwe, 'CWE-476');
    assert.equal(f.message.en, 'Dereferencing p');
    assert.equal(f.events[0].file, 'src/a.c');
    assert.equal(f.mergeKey, 'mk1');
    assert.equal(f.function, 'f');
  }

  const cpp = external.importExternal(`<?xml version="1.0"?><results version="2"><cppcheck version="2.13"/><errors>
<error id="nullPointer" severity="error" msg="Null pointer dereference: p" verbose="Null pointer dereference: p &amp; more" cwe="476"><location file="C:\\w\\src\\a.c" line="5" column="3" info="deref"/><location file="C:\\w\\src\\a.c" line="4" info="assign"/></error>
<error id="missingIncludeSystem" severity="information" msg="x"/>
<error id="unusedFunction" severity="style" msg="unused" cwe="561"><location file="src/b.c" line="9"/></error>
</errors></results>`, { root: 'C:\\w' });
  assert.equal(cpp.format, 'cppcheck');
  assert.equal(cpp.findings.length, 2);
  assert.equal(cpp.findings[0].file, 'src/a.c');
  assert.equal(cpp.findings[0].message.en, 'Null pointer dereference: p & more');
  assert.equal(cpp.findings[0].events.length, 2);
  assert.equal(cpp.findings[1].type, 'CODE_SMELL');
});

test('clang-tidy, ESLint, Pylint, Checkstyle, SpotBugs and PMD reports import', () => {
  const tidy = external.importExternal([
    '/w/src/a.c:10:5: warning: Call to function strcpy is insecure [clang-analyzer-security.insecureAPI.strcpy]',
    '/w/src/a.c:8:1: note: declared here',
    '/w/src/b.c:3:1: warning: function is too long [readability-function-size]',
    '/w/src/c.c:1:1: error: unknown type name [clang-diagnostic-error]',
  ].join('\n'), { root: '/w' });
  assert.equal(tidy.format, 'clang-tidy');
  assert.equal(tidy.findings.length, 3);
  assert.equal(tidy.findings[0].type, 'VULNERABILITY');
  assert.equal(tidy.findings[0].events.length, 1);
  assert.equal(tidy.findings[1].type, 'CODE_SMELL');
  assert.equal(tidy.findings[2].type, 'BUG');

  const eslint = external.importExternal(JSON.stringify([{ filePath: '/w/web/x.js', messages: [{ ruleId: 'no-eval', severity: 2, message: 'eval can be harmful.', line: 1, column: 1 }, { ruleId: 'no-unused-vars', severity: 1, message: 'x unused', line: 2, column: 7 }] }]), { root: '/w' });
  assert.equal(eslint.format, 'eslint');
  assert.equal(eslint.findings[0].type, 'VULNERABILITY');
  assert.equal(eslint.findings[1].severity, 'MINOR');
  assert.equal(eslint.findings[0].file, 'web/x.js');

  const pylint = external.importExternal(JSON.stringify([{ type: 'error', module: 'm', obj: 'f', line: 3, column: 0, path: 'pkg/m.py', symbol: 'undefined-variable', message: "Undefined variable 'x'", 'message-id': 'E0602' }]));
  assert.equal(pylint.format, 'pylint');
  assert.equal(pylint.findings[0].rule, 'external_pylint:E0602');
  assert.equal(pylint.findings[0].severity, 'CRITICAL');
  assert.equal(pylint.findings[0].function, 'f');

  const cs = external.importExternal('<?xml version="1.0"?><checkstyle version="10"><file name="src/A.java"><error line="3" column="5" severity="warning" message="Line is longer than 100" source="com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck"/></file></checkstyle>');
  assert.equal(cs.format, 'checkstyle');
  assert.equal(cs.findings[0].rule, 'external_checkstyle:LineLength');

  const sb = external.importExternal(`<BugCollection version="4.8"><Project><SrcDir>/w/src/main/java</SrcDir></Project>
<BugInstance type="SQL_INJECTION_JDBC" priority="1" rank="3" category="SECURITY" cweid="89"><ShortMessage>SQLi</ShortMessage><LongMessage>SQL injection in A.q()</LongMessage><Class classname="com.x.A"><SourceLine classname="com.x.A" sourcepath="com/x/A.java"/></Class><SourceLine classname="com.x.A" start="10" end="11" sourcepath="com/x/A.java" primary="true"/></BugInstance>
<BugInstance type="NP_NULL_ON_SOME_PATH" rank="12" category="CORRECTNESS"><SourceLine classname="com.x.B" start="4" end="4"/></BugInstance></BugCollection>`, { root: '/w' });
  assert.equal(sb.format, 'spotbugs');
  assert.equal(sb.findings[0].file, 'src/main/java/com/x/A.java');
  assert.equal(sb.findings[0].type, 'VULNERABILITY');
  assert.equal(sb.findings[0].severity, 'BLOCKER');
  assert.equal(sb.findings[0].line, 10);
  assert.equal(sb.findings[0].cwe, 'CWE-89');
  assert.equal(sb.findings[1].file, 'src/main/java/com/x/B.java');
  assert.equal(sb.findings[1].type, 'BUG');

  const pmd = external.importExternal('<?xml version="1.0"?><pmd version="7.0"><file name="src/A.java"><violation beginline="5" endline="6" begincolumn="1" endcolumn="2" rule="EmptyCatchBlock" ruleset="Error Prone" priority="3">Avoid empty catch blocks</violation></file></pmd>');
  assert.equal(pmd.format, 'pmd');
  assert.equal(pmd.findings[0].type, 'BUG');
  assert.equal(pmd.findings[0].severity, 'MAJOR');
  assert.equal(pmd.findings[0].message.en, 'Avoid empty catch blocks');
});

test('gosec, Bandit and Semgrep reports import, unknown formats are rejected', () => {
  const gosec = external.importExternal(JSON.stringify({ Issues: [{ severity: 'HIGH', confidence: 'HIGH', cwe: { id: '89' }, rule_id: 'G201', details: 'SQL string formatting', file: '/w/db.go', line: '12-14', column: '3' }], Stats: {} }), { root: '/w' });
  assert.equal(gosec.format, 'gosec');
  assert.equal(gosec.findings[0].line, 12);
  assert.equal(gosec.findings[0].endLine, 14);
  assert.equal(gosec.findings[0].cwe, 'CWE-89');
  const bandit = external.importExternal(JSON.stringify({ results: [{ filename: 'app.py', issue_severity: 'HIGH', issue_confidence: 'HIGH', issue_text: 'shell=True', line_number: 4, test_id: 'B602', test_name: 'subprocess_popen_with_shell_equals_true', issue_cwe: { id: 78 }, col_offset: 0, line_range: [4, 5] }, { filename: 'app.py', issue_severity: 'LOW', issue_confidence: 'MEDIUM', issue_text: 'assert used', line_number: 9, test_id: 'B101' }], metrics: {} }));
  assert.equal(bandit.format, 'bandit');
  assert.equal(bandit.findings[0].severity, 'CRITICAL');
  assert.equal(bandit.findings[0].endLine, 5);
  assert.equal(bandit.findings[1].type, 'SECURITY_HOTSPOT');
  const semgrep = external.importExternal(JSON.stringify({ results: [{ check_id: 'python.lang.security.audit.eval', path: 'a.py', start: { line: 2, col: 1 }, end: { line: 2, col: 10 }, extra: { message: 'eval', severity: 'ERROR', metadata: { cwe: ['CWE-95: Eval Injection'] } } }], errors: [] }));
  assert.equal(semgrep.format, 'semgrep');
  assert.equal(semgrep.findings[0].cwe, 'CWE-95');
  assert.equal(semgrep.findings[0].type, 'VULNERABILITY');
  assert.equal(external.detectFormat('hello'), null);
  assert.equal(external.detectFormat('{"a":1}'), null);
  assert.equal(external.detectFormat('<foo/>'), null);
  assert.equal(external.detectFormat('{}', 'x.sarif'), 'sarif');
  assert.throws(() => external.importExternal('nothing here'));
  assert.equal(Object.keys(external.PARSERS).length, 13);
});

test('JUnit and generic test reports give test metrics', () => {
  const junit = external.importTests(`<?xml version="1.0"?><testsuites><testsuite name="s1" tests="4">
<testcase name="a" classname="A" time="0.5"/><testcase name="b" classname="A" time="0.25"><failure message="expected 1"/></testcase>
<testcase name="c" classname="A" time="0"><skipped/></testcase><testcase name="d" classname="A" time="1"><error message="NPE">trace</error></testcase>
</testsuite><testsuite name="s2"><testcase name="e" time="0.25"/></testsuite></testsuites>`);
  assert.equal(junit.format, 'junit');
  assert.deepEqual(junit.totals, { tests: 5, failures: 1, errors: 1, skipped: 1, duration: 2000 });
  assert.equal(junit.suites.length, 2);
  assert.equal(junit.tests[1].message, 'expected 1');
  const m = measures.testMetrics(junit);
  assert.equal(m.tests, 5);
  assert.equal(m.test_failures, 1);
  assert.equal(m.test_errors, 1);
  assert.equal(m.skipped_tests, 1);
  assert.equal(m.test_execution_time, 2000);
  assert.equal(m.test_success_density, 50);
  const ref = external.importTests('<testExecutions version="1"><file path="test/a.js"><testCase name="t1" duration="5"/><testCase name="t2" duration="7"><failure message="no"/></testCase></file><file path="test/b.js"><testCase name="t3" duration="1"><skipped message="later"/></testCase></file></testExecutions>');
  assert.equal(ref.format, 'generic-tests');
  assert.deepEqual(ref.totals, { tests: 3, failures: 1, errors: 0, skipped: 1, duration: 13 });
  assert.equal(ref.files[0].path, 'test/a.js');
  assert.equal(measures.testMetrics({ tests: 2, failures: 0, errors: 0, skipped: 2, duration: 1 }).test_success_density, null);
  assert.throws(() => external.importTests('<foo/>'));
});

// ---------------------------------------------------------------------------
// history.js

test('snapshot comparison finds new, fixed, outstanding, triaged and reopened CIDs', () => {
  const before = [
    { cid: '1', checker: 'A', file: 'a.c', classification: 'Unclassified', action: 'Undecided' },
    { cid: '2', checker: 'B', file: 'a.c', classification: 'Unclassified' },
    { cid: '3', checker: 'C', file: 'b.c', classification: 'False Positive' },
    { cid: '4', checker: 'D', file: 'b.c', classification: 'Unclassified' },
  ];
  const after = [
    { cid: '1', checker: 'A', file: 'a.c', classification: 'Bug', action: 'Fix Required', owner: 'kim' },
    { cid: '3', checker: 'C', file: 'b.c', classification: 'Pending' },
    { cid: '4', checker: 'D', file: 'b.c', classification: 'Intentional' },
    { cid: '5', checker: 'E', file: 'c.c' },
  ];
  const r = history.compareSnapshots(before, after);
  assert.deepEqual(r.newlyDetected.map((i) => i.cid), ['5']);
  assert.deepEqual(r.fixed.map((i) => i.cid), ['2']);
  assert.equal(r.fixed[0].defectStatus, 'Fixed');
  assert.deepEqual(r.outstanding.map((i) => i.cid), ['1', '3']);
  assert.deepEqual(r.triaged.map((i) => i.cid).sort(), ['1', '3', '4']);
  assert.deepEqual(r.triaged.find((i) => i.cid === '1').changes.classification, ['Unclassified', 'Bug']);
  assert.deepEqual(r.newlyDismissed.map((i) => i.cid), ['4']);
  assert.deepEqual(r.reopened.map((i) => i.cid), ['3']);
  assert.equal(r.counts.newlyDetected, 1);
});

test('defect lifecycle tracks first detection, fixes, reintroduction and triage', () => {
  const snaps = [
    { snapshot: 1, at: '2026-01-01T00:00:00Z', issues: [{ cid: 'a', checker: 'X', file: 'a.c' }, { cid: 'b', checker: 'Y', file: 'a.c' }] },
    { snapshot: 2, at: '2026-01-05T00:00:00Z', issues: [{ cid: 'a', checker: 'X', file: 'a.c', changelog: [{ at: '2026-01-04T00:00:00Z', patch: { classification: 'Bug' } }] }] },
    { snapshot: 3, at: '2026-01-11T00:00:00Z', issues: [{ cid: 'b', checker: 'Y', file: 'a.c' }, { cid: 'c', checker: 'Z', file: 'b.c', classification: 'False Positive' }] },
  ];
  const lc = history.defectLifecycle(snaps);
  const a = lc.get('a');
  assert.equal(a.firstDetected.snapshot, 1);
  assert.equal(a.lastDetected.snapshot, 2);
  assert.equal(a.fixedIn.snapshot, 3);
  assert.equal(a.status, 'Fixed');
  assert.equal(a.lastTriaged, '2026-01-04T00:00:00Z');
  const b = lc.get('b');
  assert.equal(b.reintroduced, 1);
  assert.equal(b.fixedIn, null);
  assert.equal(b.status, 'Outstanding');
  assert.equal(lc.get('c').status, 'Dismissed');
  assert.equal(history.meanTimeToFix(lc), 10);
});

test('activity events, trend series and issue age', () => {
  const hist = [
    { at: '2026-01-01T00:00:00Z', gate: 'OK', version: '1.0', measures: { bugs: 2, coverage: 50 }, profiles: [{ language: 'c', name: 'Checker way' }], defectAnalysis: { policy: 'OK', outstanding: 3 } },
    { at: '2026-01-02T00:00:00Z', gate: 'ERROR', version: '1.0', measures: { bugs: 5 }, failedConditions: [{ metric: 'new_bugs' }], profiles: [{ language: 'c', name: 'Strict' }, { language: 'js', name: 'Checker way' }], defectAnalysis: { policy: 'ERROR', outstanding: 4 } },
    { at: '2026-01-03T00:00:00Z', gate: 'ERROR', version: '1.1', measures: { bugs: 1, coverage: 70 }, profiles: [{ language: 'c', name: 'Strict', rulesHash: 'x' }, { language: 'js', name: 'Checker way' }], events: ['Manual note'] },
  ];
  const ev = history.activityEvents(hist);
  assert.equal(ev[0].at, '2026-01-03T00:00:00Z');
  const cats = ev.map((e) => e.category);
  assert.ok(cats.includes('QUALITY_GATE') && cats.includes('VERSION') && cats.includes('QUALITY_PROFILE') && cats.includes('DEFECT_POLICY') && cats.includes('OTHER'));
  const gate = ev.find((e) => e.category === 'QUALITY_GATE');
  assert.equal(gate.name.en, 'Failed (was Passed)');
  assert.equal(gate.description.en, 'new_bugs');
  assert.equal(history.activityEvents(hist, { category: 'VERSION' }).length, 2);
  assert.ok(ev.some((e) => e.name.en === "Use 'Strict' instead of 'Checker way' (c)"));
  const series = history.trendSeries(hist, ['bugs', 'coverage', 'defectAnalysis.outstanding']);
  assert.deepEqual(series.bugs.map((p) => p.value), [2, 5, 1]);
  assert.deepEqual(series.coverage.map((p) => p.value), [50, null, 70]);
  assert.deepEqual(series['defectAnalysis.outstanding'].map((p) => p.value), [3, 4, null]);
  assert.equal(history.seriesDelta(series.coverage), 20);
  assert.equal(history.seriesDelta([]), null);

  const now = Date.parse('2026-06-01T00:00:00Z');
  const stamped = history.stampCreationDates([{ key: 'old', creationDate: '2025-01-01T00:00:00Z' }], [{ key: 'old', type: 'BUG' }, { key: 'new', type: 'CODE_SMELL' }], '2026-05-31T12:00:00Z');
  assert.equal(stamped[0].creationDate, '2025-01-01T00:00:00Z');
  const age = history.issueAge([...stamped, { key: 'x', type: 'BUG' }, { key: 'y', status: 'RESOLVED', resolution: 'FIXED', creationDate: '2020-01-01' }], now);
  assert.equal(age.count, 2);
  assert.equal(age.unknown, 1);
  assert.equal(age.buckets.find((b) => b.id === 'lt1d').count, 1);
  assert.equal(age.buckets.find((b) => b.id === 'lt1y').count, 0);
  assert.equal(age.buckets.find((b) => b.id === 'ge1y').count, 1);
  assert.equal(age.oldest.key, 'old');
  assert.equal(age.byType.BUG.count, 1);
  assert.equal(history.issueAge([]).averageDays, null);
});

// ---------------------------------------------------------------------------
// measures.js

test('remediation efforts, effort to A, lcov branches and new-code coverage', () => {
  const issues = [
    issue({ type: 'BUG', debtMin: 10, isNew: true }), issue({ type: 'BUG', debtMin: 5, isNew: false }),
    issue({ type: 'VULNERABILITY', debtMin: 30 }), issue({ type: 'CODE_SMELL', debtMin: 200 }), issue({ type: 'CODE_SMELL', debtMin: 99, status: 'RESOLVED', resolution: 'FIXED' }),
  ];
  const e = measures.remediationEfforts(issues);
  assert.equal(e.reliability_remediation_effort, 15);
  assert.equal(e.new_reliability_remediation_effort, 10);
  assert.equal(e.security_remediation_effort, 30);
  assert.equal(e.sqale_index, 200);
  assert.equal(measures.effortToReachMaintainabilityA(200, 100), 50);
  assert.equal(measures.effortToReachMaintainabilityA(100, 100), 0);
  const lcov = measures.parseLcovFull('SF:/w/src/a.c\nDA:1,1\nDA:2,0\nDA:3,4\nBRDA:3,0,0,1\nBRDA:3,0,1,-\nBRDA:3,1,0,0\nBRDA:3,1,1,2\nend_of_record\n', { root: '/w' });
  assert.ok(lcov.files['src/a.c']);
  const c = measures.coverageMeasures(lcov);
  assert.equal(c.lines_to_cover, 3);
  assert.equal(c.uncovered_lines, 1);
  assert.equal(c.conditions_to_cover, 4);
  assert.equal(c.uncovered_conditions, 2);
  assert.equal(c.branch_coverage, 50);
  assert.equal(c.line_coverage, 66.7);
  assert.equal(c.coverage, 57.1);
  const n = measures.newCodeCoverage(lcov, { 'src/a.c': { status: 'M', isNew: false, ranges: [[3, 3]] } });
  assert.equal(n.new_lines_to_cover, 1);
  assert.equal(n.new_conditions_to_cover, 4);
  assert.equal(n.new_uncovered_conditions, 2);
  assert.equal(measures.coverageMeasures({ files: {} }).coverage, null);
});

test('software quality impacts and MQR ratings', () => {
  assert.deepEqual(measures.impactsOf({ type: 'BUG', severity: 'CRITICAL' }), [{ softwareQuality: 'RELIABILITY', severity: 'HIGH' }]);
  assert.deepEqual(measures.impactsOf({ type: 'VULNERABILITY', severity: 'BLOCKER' }), [{ softwareQuality: 'SECURITY', severity: 'BLOCKER' }]);
  assert.deepEqual(measures.impactsOf({ type: 'CODE_SMELL', severity: 'INFO' }), [{ softwareQuality: 'MAINTAINABILITY', severity: 'INFO' }]);
  assert.deepEqual(measures.impactsOf({ type: 'SECURITY_HOTSPOT', severity: 'MAJOR' }), []);
  assert.deepEqual(measures.legacyFromImpact({ softwareQuality: 'SECURITY', severity: 'LOW' }), { type: 'VULNERABILITY', severity: 'MINOR' });
  const sq = measures.softwareQualities([issue({ type: 'BUG', severity: 'MAJOR' }), issue({ type: 'VULNERABILITY', severity: 'BLOCKER' }), issue({ type: 'CODE_SMELL', severity: 'INFO', debtMin: 900 })], { ncloc: 100 });
  assert.equal(sq.RELIABILITY.rating, 'C');
  assert.equal(sq.SECURITY.rating, 'E');
  assert.equal(sq.MAINTAINABILITY.rating, 'D');
  assert.equal(sq.MAINTAINABILITY.debtRatio, 30);
  assert.equal(measures.softwareQualities([issue({ type: 'CODE_SMELL', severity: 'INFO' })]).MAINTAINABILITY.rating, 'A');
});

test('component tree aggregates files into directories; language distribution', () => {
  const a = {
    files: [
      { path: 'src/core/a.c', language: 'c', ncloc: 100, lines: 120, complexity: 10, coverage: 50 },
      { path: 'src/core/b.c', language: 'c', ncloc: 50, lines: 60, complexity: 5, coverage: null },
      { path: 'src/web/x.js', language: 'js', ncloc: 50, lines: 55, complexity: 3 },
      { path: 'main.c', language: 'c', ncloc: 10, lines: 10, complexity: 1 },
    ],
    issues: [issue({ file: 'src/core/a.c', type: 'BUG' }), issue({ file: 'src/web/x.js', type: 'CODE_SMELL', debtMin: 7 }), issue({ file: 'src/web/x.js', type: 'SECURITY_HOTSPOT', status: 'TO_REVIEW' })],
    measures: { ncloc: 210, sqale_index: 7 },
  };
  const tree = measures.componentTree(a);
  assert.equal(tree.measures.files, 4);
  assert.equal(tree.measures.ncloc, 210);
  assert.equal(tree.children[0].name, 'src');
  assert.equal(tree.children[1].name, 'main.c');
  const core = measures.findComponent(tree, 'src/core');
  assert.equal(core.qualifier, 'DIR');
  assert.equal(core.measures.ncloc, 150);
  assert.equal(core.measures.bugs, 1);
  assert.equal(core.measures.coverage, 50);
  const web = measures.findComponent(tree, 'src/web');
  assert.equal(web.measures.code_smells, 1);
  assert.equal(web.measures.security_hotspots, 1);
  assert.equal(web.measures.sqale_index, 7);
  assert.equal(measures.findComponent(tree, 'src/web/x.js').qualifier, 'FIL');
  assert.equal(measures.findComponent(tree, 'nope'), null);
  const lcovTree = measures.componentTree(a, { coverage: measures.parseLcovFull('SF:src/web/x.js\nDA:1,1\nDA:2,1\nend_of_record\n') });
  assert.equal(measures.findComponent(lcovTree, 'src/web').measures.coverage, 100);
  const dist = measures.languageDistribution(a);
  assert.deepEqual(dist.map((d) => d.language), ['c', 'js']);
  assert.equal(dist[0].ncloc, 160);
  assert.equal(dist[0].percent, 76.2);
  assert.equal(measures.languageDistributionString(a), 'c=160;js=50');
  const extra = measures.extraMeasures(a, { tests: { tests: 4, failures: 1 }, coverage: measures.parseLcovFull('SF:main.c\nDA:1,1\nend_of_record\n'), changed: { 'main.c': { status: 'A', isNew: true, ranges: [] } } });
  assert.equal(extra.effort_to_reach_maintainability_rating_a, 0);
  assert.equal(extra.tests, 4);
  assert.equal(extra.new_lines_to_cover, 1);
  assert.equal(extra.software_quality_reliability_rating, 'C');
  assert.equal(extra.ncloc_language_distribution, 'c=160;js=50');
});

test('index exposes every platform module', () => {
  for (const k of ['compliance', 'reports', 'scm', 'pullrequest', 'webhooks', 'users', 'external', 'history', 'measures', 'util']) assert.ok(platform[k], k);
});

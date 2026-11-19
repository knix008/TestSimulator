import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import { exampleWorkspace } from '../../src/domain/examples.js';
import { PAGE_TEMPLATES, templateBody } from '../../src/domain/page-templates.js';
import { runQuery } from '../../src/domain/query.js';
import {
  addExecTests, addStep, attachDefect, ensureQualityTypes, execProgress, formatPatch, importQualityRows, ISSUE_FORMATS, latestResults, moveStep,
  parseReqIF, parseRequirementCsv, parseTestCaseCsv, recordResult, removeStep, requirementsCsv, setExecVersion, setRequirementField, testCasesCsv,
  toReqIF, traceCsv, traceGaps, traceMarkdown, traceMatrix, traceOf, updateStep,
} from '../../src/domain/requirements.js';
import { sampleWorkspace } from '../../src/domain/sample.js';
import { addLink, createIssue, newProject, updateIssue } from '../../src/domain/store.js';
import { setProjectMethod } from '../../src/domain/teams.js';
import { setLanguage } from '../../src/i18n.js';
import { renderModal } from '../../src/ui/chrome.js';
import { renderView } from '../../src/ui/pages.js';

const NOW = Date.parse('2026-11-19T09:00:00Z');
const device = (lang = 'en') => {
  const ws = exampleWorkspace('device', NOW, lang);
  return { ws, project: ws.projects[0] };
};
const key = (project, summary) => project.issues.find((issue) => issue.summary === summary);
const ops = (ws, project) => ({
  create: (partial) => createIssue(ws, project.id, partial, 'u1'),
  update: (issue, patch) => updateIssue(ws, project.id, issue.id, patch, 'u1'),
  link: (fromId, type, toId) => addLink(ws, project.id, fromId, type, toId, 'u1'),
});

describe('Requirements traceability', () => {
  test('the traceability example has a specification tree, tests, runs and defects', () => {
    const { project } = device();
    assert.ok(project.methods.includes('requirements') && project.methods.includes('testing'));
    for (const type of ['requirement', 'testcase', 'testexec']) assert.ok(project.issueTypes.some((item) => item.id === type), type);
    const { rows, totals } = traceMatrix(project);
    assert.equal(totals.total, 9);
    assert.deepEqual(rows.slice(0, 3).map((row) => row.number), ['1', '1.1', '1.2']);
    assert.equal(rows[1].depth, 1);
    assert.ok(totals.failed >= 2 && totals.suspect === 1 && totals.passed >= 3);
  });

  test('coverage follows the latest result of every verifying test', () => {
    const { project } = device();
    const venting = key(project, 'Over-pressure venting');
    const trace = traceOf(project, venting);
    assert.equal(trace.coverage, 'failed');
    assert.equal(trace.implementation, 'open');
    assert.equal(trace.openDefects.length, 1);
    assert.equal(traceOf(project, key(project, 'Measurement accuracy')).coverage, 'passed');
    assert.equal(traceOf(project, key(project, 'Reading memory')).coverage, 'other', 'inspection without tests');
    assert.equal(traceOf(project, key(project, 'Safety')).coverage, 'failed', 'a parent rolls up its children');
    assert.equal(traceOf(project, key(project, 'Blood-pressure measurement')).coverage, 'passed');
  });

  test('a requirement changed after its last pass is suspect', () => {
    const { project } = device();
    const limit = key(project, 'Measurement time limit');
    assert.equal(traceOf(project, limit).suspect, true);
    const accuracy = key(project, 'Measurement accuracy');
    assert.equal(traceOf(project, accuracy).suspect, false);
    setRequirementField(null, project, accuracy, 'criteria', 'Now 100 subjects', '');
    assert.equal(traceOf(project, accuracy).suspect, true);
  });

  test('gaps list untested requirements, orphan tests and tests never run', () => {
    const { ws, project } = device();
    const orphan = createIssue(ws, project.id, { typeId: 'testcase', summary: 'Orphan test' }, 'u1');
    const gaps = traceGaps(project);
    assert.ok(gaps.orphanTests.includes(orphan));
    assert.ok(gaps.neverRun.includes(orphan));
    assert.ok(gaps.untestedRequirements.every((req) => req.typeId === 'requirement'));
  });

  test('WQL reads coverage, last result, suspect, category, verification and level', () => {
    const { ws, project } = device();
    const keys = (query) => runQuery(ws, project, query).issues.map((issue) => issue.summary).sort();
    assert.deepEqual(keys('coverage = failed AND verification = test').includes('Over-pressure venting'), true);
    assert.deepEqual(keys('result = fail'), ['App transfer test', 'Blocked-cuff over-pressure test']);
    assert.deepEqual(keys('suspect = true'), ['Measurement time limit']);
    assert.ok(keys('category = safety').includes('Safety'));
    assert.deepEqual(keys('type = requirement AND verification = inspection'), ['Labelling', 'Reading memory']);
    assert.ok(keys('level = integration').includes('App transfer test'));
  });

  test('turning the method on gives an existing project the three issue types', () => {
    const ws = sampleWorkspace(NOW);
    const sup = ws.projects.find((project) => project.key === 'SUP');
    assert.ok(!sup.issueTypes.some((type) => type.id === 'requirement'));
    setProjectMethod(ws, sup.id, 'requirements', true, 'u1');
    assert.ok(sup.issueTypes.some((type) => type.id === 'requirement'));
    const other = newProject(ws, { name: 'Plain', key: 'PLN', type: 'business', leadId: 'u1' }, 'u1');
    assert.ok(!other.issueTypes.some((type) => type.id === 'testcase'));
    ensureQualityTypes(other, true);
    assert.ok(other.issueTypes.some((type) => type.id === 'testcase'));
  });
});

describe('Test management', () => {
  test('a test case keeps its steps in order', () => {
    const { project } = device();
    const test = key(project, 'Blocked-cuff over-pressure test');
    assert.equal(test.test.steps.length, 2);
    const step = addStep(null, project, test, { action: 'Release the cuff', expected: 'Pressure falls' }, '');
    updateStep(null, project, test, step.id, { data: 'by hand' }, '');
    moveStep(null, project, test, step.id, -1, '');
    assert.deepEqual(test.test.steps.map((item) => item.action), ['Start a reading', 'Release the cuff', 'Watch the pressure logger']);
    assert.equal(test.test.steps[1].data, 'by hand');
    removeStep(null, project, test, step.id, '');
    assert.equal(test.test.steps.length, 2);
    assert.ok(test.history.some((entry) => entry.field === 'test'));
  });

  test('a test run records results, notes, the version and found defects', () => {
    const { ws, project } = device();
    const exec = createIssue(ws, project.id, { ...formatPatch('exec-regression', 'en'), summary: 'RC3' }, 'u1');
    const tests = project.issues.filter((issue) => issue.typeId === 'testcase');
    assert.equal(addExecTests(ws, project, exec, tests.map((item) => item.key), 'u1').length, tests.length);
    assert.equal(addExecTests(ws, project, exec, [tests[0].key], 'u1').length, 0, 'no duplicates');
    assert.throws(() => addExecTests(ws, project, exec, ['NOPE-1'], 'u1'), /not-found/);
    setExecVersion(ws, project, exec, project.versions[0].id, 'u1');
    const venting = key(project, 'Blocked-cuff over-pressure test');
    const run = recordResult(ws, project, exec, venting.id, { result: 'pass', note: 'Fixed in B4' }, 'u1');
    assert.equal(run.result, 'pass');
    assert.ok(run.at && run.by === 'u1');
    assert.equal(latestResults(project).get(venting.id).result, 'pass');
    assert.equal(traceOf(project, key(project, 'Over-pressure venting')).coverage, 'passed');
    const ble = key(project, 'App transfer test');
    recordResult(ws, project, exec, ble.id, { result: 'fail' }, 'u1');
    const bug = createIssue(ws, project.id, { ...formatPatch('bug-from-test', 'en'), summary: 'Reconnect duplicates again' }, 'u1');
    attachDefect(project, exec, ble.id, bug);
    assert.ok(exec.exec.runs.find((item) => item.testId === ble.id).defectIds.includes(bug.id));
    assert.ok(ble.links.some((link) => link.type === 'found' && link.otherId === bug.id));
    const progress = execProgress(exec);
    assert.equal(progress.total, tests.length);
    assert.equal(progress.pass, 1);
    assert.equal(progress.fail, 1);
  });

  test('viewers cannot record results', () => {
    const { ws, project } = device();
    project.members.push({ userId: 'viewer', role: 'viewer' });
    ws.users.push({ id: 'viewer', name: 'Viewer', active: true });
    const exec = project.issues.find((issue) => issue.typeId === 'testexec');
    assert.throws(() => recordResult(ws, project, exec, exec.exec.runs[0].testId, { result: 'pass' }, 'viewer'), /permission/);
  });
});

describe('Formats and files', () => {
  test('every issue format fills a known type and a description in both languages', () => {
    for (const format of ISSUE_FORMATS) {
      for (const lang of ['ko', 'en']) {
        const patch = formatPatch(format.id, lang);
        assert.ok(['requirement', 'testcase', 'testexec', 'bug'].includes(patch.typeId), format.id);
        assert.ok(patch.description.length > 10, format.id);
      }
    }
    assert.equal(formatPatch('test-manual', 'en').test.steps.length, 1);
    assert.equal(formatPatch('req-security', 'ko').req.category, 'security');
  });

  test('requirement CSV and ReqIF survive a round trip with their hierarchy', () => {
    const { project } = device();
    const csvRows = parseRequirementCsv(requirementsCsv(project));
    assert.equal(csvRows.length, 9);
    assert.equal(csvRows.find((row) => row.externalId === 'SYS-2.1').parentRef, 'SYS-2');
    const xml = toReqIF(project, '2026-11-19T09:00:00Z');
    assert.match(xml, /<REQ-IF xmlns="http:\/\/www\.omg\.org\/spec\/ReqIF\/20110401\/reqif\.xsd"/);
    const back = parseReqIF(xml);
    assert.equal(back.length, 9);
    const venting = back.find((row) => row.externalId === 'SYS-2.1');
    assert.equal(venting.summary, 'Over-pressure venting');
    assert.equal(venting.parentRef, 'SYS-2');
    assert.equal(venting.req.category, 'safety');
    assert.equal(venting.req.criteria, 'All 10 blocked-cuff runs pass');
  });

  test('ReqIF from another tool: XHTML text, enumerations and nested hierarchy', () => {
    const xml = `<?xml version="1.0"?><REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd"><CORE-CONTENT><REQ-IF-CONTENT>
      <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t"><SPEC-ATTRIBUTES>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="a1" LONG-NAME="ReqIF.ForeignID"/>
        <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="a2" LONG-NAME="ReqIF.Text"/>
        <ATTRIBUTE-DEFINITION-ENUMERATION IDENTIFIER="a3" LONG-NAME="Category"/>
      </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
      <DATATYPES><DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="e"><SPECIFIED-VALUES><ENUM-VALUE IDENTIFIER="ev1" LONG-NAME="Safety"/></SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION></DATATYPES>
      <SPEC-OBJECTS>
        <SPEC-OBJECT IDENTIFIER="o1"><VALUES><ATTRIBUTE-VALUE-STRING THE-VALUE="R-1"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>a1</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>
          <ATTRIBUTE-VALUE-XHTML><DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>a2</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION><THE-VALUE><xhtml:div>The pump shall stop &amp; alarm.</xhtml:div></THE-VALUE></ATTRIBUTE-VALUE-XHTML></VALUES></SPEC-OBJECT>
        <SPEC-OBJECT IDENTIFIER="o2"><VALUES><ATTRIBUTE-VALUE-STRING THE-VALUE="R-1.1"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>a1</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>
          <ATTRIBUTE-VALUE-ENUMERATION><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>a3</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION><VALUES><ENUM-VALUE-REF>ev1</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION></VALUES></SPEC-OBJECT>
      </SPEC-OBJECTS>
      <SPECIFICATIONS><SPECIFICATION IDENTIFIER="s"><CHILDREN><SPEC-HIERARCHY IDENTIFIER="h1"><OBJECT><SPEC-OBJECT-REF>o1</SPEC-OBJECT-REF></OBJECT><CHILDREN>
        <SPEC-HIERARCHY IDENTIFIER="h2"><OBJECT><SPEC-OBJECT-REF>o2</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY></CHILDREN></SPEC-HIERARCHY></CHILDREN></SPECIFICATION></SPECIFICATIONS>
    </REQ-IF-CONTENT></CORE-CONTENT></REQ-IF>`;
    const rows = parseReqIF(xml);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].summary, 'The pump shall stop & alarm.');
    assert.equal(rows[1].parentRef, 'R-1');
    assert.equal(rows[1].req.category, 'safety');
    assert.throws(() => parseReqIF('<html></html>'), /file-invalid/);
  });

  test('test case CSV keeps steps and links; importing twice updates instead of copying', () => {
    const source = device();
    const csv = testCasesCsv(source.project);
    const parsed = parseTestCaseCsv(csv);
    assert.equal(parsed.length, 6);
    assert.equal(parsed.find((row) => row.externalId === 'TC-03').test.steps.length, 2);

    const ws = sampleWorkspace(NOW);
    const target = newProject(ws, { name: 'Import', key: 'IMP', type: 'software', leadId: 'u1' }, 'u1');
    ensureQualityTypes(target, true);
    const first = importQualityRows(target, parseRequirementCsv(requirementsCsv(source.project)), 'requirements', ops(ws, target));
    assert.deepEqual([first.added, first.changed], [9, 0]);
    assert.equal(first.linked, 4, 'refines links rebuilt from Parent');
    const tests = importQualityRows(target, parsed, 'tests', ops(ws, target));
    assert.equal(tests.added, 6);
    assert.equal(tests.linked, 6, 'verifies links found by external ID');
    const again = importQualityRows(target, parseRequirementCsv(requirementsCsv(source.project)), 'requirements', ops(ws, target));
    assert.deepEqual([again.added, again.changed, again.linked], [0, 9, 0]);
    assert.equal(target.issues.filter((issue) => issue.typeId === 'requirement').length, 9);
    assert.equal(traceMatrix(target).totals.coveredPct, 100);
  });

  test('the traceability matrix exports as CSV and Markdown', () => {
    const { project } = device();
    const csv = traceCsv(project, 'en');
    assert.match(csv, /^﻿No\.,Requirement,Summary/);
    assert.match(csv, /Over-pressure venting,Safety,Test,BPMF-3,TC-03|Over-pressure venting,Safety,Test,BPMF-3,BPMF-/);
    const md = traceMarkdown(project, 'ko');
    assert.match(md, /^# 요구 사항 추적 매트릭스/);
    assert.match(md, /재검증/);
  });

  test('the sample files are current and import cleanly', () => {
    for (const lang of ['ko', 'en']) {
      const { project } = device(lang);
      const read = (name) => fs.readFileSync(new URL(`../../samples/${name}`, import.meta.url), 'utf8');
      assert.equal(read(`requirements.${lang}.csv`), requirementsCsv(project), `requirements.${lang}.csv — run npm run samples`);
      assert.equal(read(`testcases.${lang}.csv`), testCasesCsv(project), `testcases.${lang}.csv — run npm run samples`);
      assert.equal(parseReqIF(read(`requirements.${lang}.reqif`)).length, 9);
      assert.equal(parseTestCaseCsv(read(`testcases.${lang}.csv`)).length, 6);
    }
  });

  test('the requirements & testing page templates exist in both languages', () => {
    const quality = PAGE_TEMPLATES.filter((item) => item.group === 'quality');
    assert.deepEqual(quality.map((item) => item.id), ['srs', 'trace-matrix', 'test-plan', 'test-case-spec', 'test-report']);
    for (const item of quality) {
      assert.match(templateBody(item, 'ko'), /\|/);
      assert.match(templateBody(item, 'en'), /\|/);
    }
  });
});

describe('Requirements screens', () => {
  const ctx = (view, issueId = null) => {
    setLanguage('en');
    const { ws, project } = device();
    ws.activeProjectId = project.id;
    return {
      ws, project, user: ws.users[0], desktop: false, version: '1.0.0', now: NOW,
      ui: { view, issueId, issueTab: 'details', preview: false, selected: [], modal: null, screenFind: {} },
      settings: { language: 'en', fontSize: 13, recent: [], customTheme: null, theme: 'light' },
    };
  };

  test('requirements, traceability, test cases and test runs render', () => {
    assert.match(renderView(ctx('requirements')), /Over-pressure venting[\s\S]*Failed/);
    const grid = ctx('trace');
    grid.ui.traceMode = 'grid';
    assert.match(renderView(grid), /q-cell q-fail/);
    assert.match(renderView(ctx('trace')), /Tests without a requirement/);
    assert.match(renderView(ctx('tests')), /Blocked-cuff over-pressure test[\s\S]*Fail/);
    assert.match(renderView(ctx('executions')), /Firmware 1\.0 RC2 regression run/);
  });

  test('the issue editor shows the structured part of each kind', () => {
    const base = ctx('issue');
    const find = (summary) => base.project.issues.find((issue) => issue.summary === summary).id;
    const req = ctx('issue', find('Over-pressure venting'));
    req.project = base.project; req.ws = base.ws;
    assert.match(renderView(req), /data-req="criteria"[\s\S]*data-action="req-new-test"/);
    const test = ctx('issue');
    test.ws = base.ws; test.project = base.project; test.ui.issueId = find('Blocked-cuff over-pressure test');
    assert.match(renderView(test), /data-step-field="expected"[\s\S]*data-action="add-step"/);
    const exec = ctx('issue');
    exec.ws = base.ws; exec.project = base.project; exec.ui.issueId = find('Firmware 1.0 RC2 regression run');
    assert.match(renderView(exec), /data-action="run-result"[\s\S]*data-action="exec-defect"/);
  });

  test('the new-issue dialog offers the formats and the import dialog its sample', () => {
    const c = ctx('requirements');
    c.ui.modal = { kind: 'issue', typeId: 'requirement', formatId: 'req-functional', description: 'The system shall' };
    const html = renderModal(c);
    assert.match(html, /data-issue-format/);
    assert.match(html, /value="req-functional" selected/);
    assert.match(html, /The system shall/);
    c.ui.modal = { kind: 'quality-import', target: 'tests' };
    assert.match(renderModal(c), /data-action="quality-import-sample"/);
  });
});

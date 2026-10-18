// Requirements management and traceability: EA-style requirement attributes
// with automatic, unique ids; the requirements list and its CSV; the
// relationship matrix (rows × columns × relationship kinds) and creating /
// deleting a relationship from a cell (one undo step); coverage rules in
// validation; the requirements table in the generated documentation; and
// requirement shapes that show id and status.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import { ProjectDocument } from '../../src/domain/document.js';
import { fieldsOf, REQUIREMENT_STATUSES } from '../../src/domain/meta.js';
import { toolById } from '../../src/domain/toolbox.js';
import { htmlDocs, markdownDocs } from '../../src/domain/docs.js';
import { RULES, validate } from '../../src/domain/validate.js';
import { renderDiagramSvg } from '../../src/render/notation.js';
import {
  coverage, csvText, elementTypesIn, matrix, matrixCsv, matrixTsv, nextRequirementId, RELATION_TYPES, relationTypesIn, relationsBetween, requirementRows,
  requirementsCsv, scopesIn, toggleRelation,
} from '../../src/domain/trace.js';

/** A project with three requirements, two blocks and a test case. */
function shop() {
  const project = M.createProject({ name: 'Shop', language: 'en', diagram: null, author: 'Kim' });
  const model = project.ownedElements[0];
  const reqs = M.addElement(project, model._id, 'UMLPackage', { name: 'Reqs' });
  const design = M.addElement(project, model._id, 'UMLPackage', { name: 'Design' });
  const r1 = M.addElement(project, reqs._id, 'SysMLRequirement', { name: 'Fast', text: 'Answer in 1 s', status: 'approved', priority: 'high' });
  const r2 = M.addElement(project, reqs._id, 'SysMLRequirement', { name: 'Safe', status: 'approved' });
  const r3 = M.addElement(project, reqs._id, 'SysMLRequirement', { name: 'Cheap, "really"' });
  const cache = M.addElement(project, design._id, 'SysMLBlock', { name: 'Cache' });
  const vault = M.addElement(project, design._id, 'SysMLBlock', { name: 'Vault' });
  const loadTest = M.addElement(project, design._id, 'UMLUseCase', { name: 'Load test' });
  const rel = (type, from, to) => M.insertElement(M.relationshipOwner(project, type, from._id), Object.assign(M.createElement(type), { source: M.ref(from), target: M.ref(to) }));
  rel('SysMLSatisfy', cache, r1);
  rel('SysMLVerify', loadTest, r1);
  rel('SysMLSatisfy', vault, r2);
  rel('SysMLDeriveReqt', r3, r1);
  return { project, model, reqs, design, r1, r2, r3, cache, vault, loadTest };
}

test('requirement fields: EA attributes with defaults, auto ids that never repeat', () => {
  const keys = fieldsOf('SysMLRequirement').map((f) => f.key);
  for (const key of ['id', 'text', 'kind', 'status', 'priority', 'difficulty', 'stability', 'risk', 'verifyMethod', 'version', 'author', 'phase']) assert.ok(keys.includes(key), key);
  const { project, r1, r2, r3 } = shop();
  assert.deepEqual([r1.id, r2.id, r3.id], ['REQ-001', 'REQ-002', 'REQ-003']);
  assert.equal(r3.kind, 'functional');
  assert.equal(r3.status, 'proposed');
  assert.equal(r3.priority, 'medium');
  assert.equal(r3.difficulty, 'medium');
  assert.equal(r3.stability, 'medium');
  assert.equal(r3.risk, '');
  assert.equal(r3.verifyMethod, '');
  assert.equal(r3.author, 'Kim', 'the project author');
  // A given id is kept; the next one continues after the highest.
  const own = M.addElement(project, project.ownedElements[0]._id, 'SysMLRequirement', { id: 'REQ-010' });
  assert.equal(own.id, 'REQ-010');
  assert.equal(nextRequirementId(project), 'REQ-011');
  // Narrow numbers stay narrow (REQ-1, REQ-2 → REQ-3), other ids are ignored.
  const p2 = M.createProject({ diagram: null });
  M.addElement(p2, p2.ownedElements[0]._id, 'SysMLRequirement', { id: 'REQ-1' });
  M.addElement(p2, p2.ownedElements[0]._id, 'SysMLRequirement', { id: 'REQ-2.1' });
  M.addElement(p2, p2.ownedElements[0]._id, 'SysMLRequirement', { id: 'SEC-9' });
  assert.equal(nextRequirementId(p2), 'REQ-2');
  // Many in a row: all different.
  const ids = new Set(Array.from({ length: 30 }, () => M.addElement(p2, p2.ownedElements[0]._id, 'SysMLRequirement').id));
  assert.equal(ids.size, 30);
  assert.ok(!ids.has('REQ-1') && !ids.has('REQ-2.1'));
  // From the toolbox on a requirement diagram too.
  const diagram = M.addDiagram(p2, p2.ownedElements[0]._id, 'SysMLRequirementDiagram');
  const { element } = E.createNode(p2, diagram, toolById('SysMLRequirement') ?? { type: 'SysMLRequirement' }, { x: 10, y: 10, w: 0, h: 0 });
  assert.match(element.id, /^REQ-\d+$/);
  assert.ok(!ids.has(element.id));
});

test('find matches requirement ids and text', () => {
  const { project, r1 } = shop();
  assert.deepEqual(M.findElements(project, 'REQ-001').map((e) => e._id), [r1._id]);
  assert.deepEqual(M.findElements(project, 'in 1 s').map((e) => e._id), [r1._id]);
});

test('requirements list: attributes and trace counts, sorted by id', () => {
  const { project, r1, r2, r3 } = shop();
  const rows = requirementRows(project);
  assert.deepEqual(rows.map((r) => r.id), [r1._id, r2._id, r3._id]);
  const [a, b, c] = rows;
  assert.equal(a.reqId, 'REQ-001');
  assert.equal(a.status, 'approved');
  assert.equal(a.priority, 'high');
  assert.equal(a.satisfiedBy, 1);
  assert.equal(a.verifiedBy, 1);
  assert.equal(b.verifiedBy, 0);
  assert.equal(c.derivedFrom, 1);
  assert.equal(a.path, 'Model::Reqs::Fast');
  const cov = coverage(project);
  assert.deepEqual(cov.get(r1._id).derived, [r3._id]);
});

test('CSV: header, quoted fields, translated values', () => {
  assert.equal(csvText([['a', 'b,c'], ['say "hi"', 'x\ny']]), 'a,"b,c"\r\n"say ""hi""","x\ny"\r\n');
  const { project } = shop();
  const text = requirementsCsv(requirementRows(project), { language: 'en', label: (v) => v.toUpperCase() });
  const lines = text.trimEnd().split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^ID,Name,Kind,Status,Priority,/);
  assert.match(lines[1], /^REQ-001,Fast,FUNCTIONAL,APPROVED,HIGH,MEDIUM,MEDIUM,,,,Kim,,1,1,0,0,Answer in 1 s,Model::Reqs::Fast$/);
  assert.ok(lines[3].startsWith('REQ-003,"Cheap, ""really""",'));
  assert.match(requirementsCsv([], { language: 'ko' }), /^ID,이름,종류,상태/);
});

test('matrix: rows × columns with arrows, counts and empty rows', () => {
  const { project, reqs, design, r1, r2, r3, cache, vault, loadTest } = shop();
  const m = matrix(project, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLBlock'], relationTypes: ['SysMLSatisfy'] });
  assert.deepEqual(m.rows.map((r) => r.label), ['REQ-001 Fast', 'REQ-002 Safe', 'REQ-003 Cheap, "really"']);
  assert.deepEqual(m.cols.map((c) => c.name), ['Cache', 'Vault']);
  // Satisfy goes block → requirement: from the row's side it points in.
  assert.deepEqual(m.cells[`${r1._id}|${cache._id}`].map((c) => [c.type, c.dir, c.arrow]), [['SysMLSatisfy', 'in', '←']]);
  assert.equal(m.cells[`${r1._id}|${vault._id}`], undefined);
  assert.deepEqual(m.rows.map((r) => r.count), [1, 1, 0]);
  assert.deepEqual(m.cols.map((c) => c.count), [1, 1]);
  assert.deepEqual(m.emptyRows, [r3._id]);
  assert.equal(m.total, 2);
  // Swapped: the block is the row and the source.
  const back = matrix(project, { sourceTypes: ['SysMLBlock'], targetTypes: ['SysMLRequirement'], relationTypes: ['SysMLSatisfy'] });
  assert.equal(back.cells[`${cache._id}|${r1._id}`][0].dir, 'out');
  // Every relationship kind; any target type; scopes.
  const all = matrix(project, { sourceTypes: ['SysMLRequirement'], targetScope: design._id });
  assert.deepEqual(all.cols.map((c) => c.id).sort(), [cache._id, vault._id, loadTest._id].sort());
  assert.equal(all.cells[`${r1._id}|${loadTest._id}`][0].type, 'SysMLVerify');
  const self = matrix(project, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLRequirement'], sourceScope: reqs._id, targetScope: reqs._id });
  assert.equal(self.cells[`${r3._id}|${r1._id}`][0].dir, 'out', 'r3 derives from r1');
  assert.equal(self.cells[`${r1._id}|${r3._id}`][0].dir, 'in');
  assert.ok(!self.rows.some((r) => r.id === reqs._id), 'the scope itself is not listed');
  // Associations have no direction.
  const assoc = M.insertElement(design, M.createElement('UMLAssociation', { end1: { reference: M.ref(cache) }, end2: { reference: M.ref(vault) } }));
  const blocks = matrix(project, { sourceTypes: ['SysMLBlock'], targetTypes: ['SysMLBlock'], relationTypes: ['UMLAssociation'] });
  assert.equal(blocks.cells[`${cache._id}|${vault._id}`][0].arrow, '↔');
  assert.equal(blocks.cells[`${vault._id}|${cache._id}`][0].id, assoc._id);
  // Choosers.
  assert.ok(RELATION_TYPES.includes('SysMLSatisfy') && RELATION_TYPES.includes('UMLGeneralization') && RELATION_TYPES.includes('UMLInclude') && RELATION_TYPES.includes('UMLAssociation'));
  assert.ok(!RELATION_TYPES.includes('UMLMessage'));
  assert.equal(relationTypesIn(project).find((x) => x.type === 'SysMLSatisfy').count, 2);
  assert.equal(elementTypesIn(project)[0].type, 'SysMLRequirement');
  assert.deepEqual(scopesIn(project).map((s) => s.path), ['Model', 'Model::Reqs', 'Model::Design']);
  void r2;
});

test('matrix CSV and copy text', () => {
  const { project, r1 } = shop();
  const m = matrix(project, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLBlock'] });
  const lines = matrixCsv(m, { language: 'en' }).trimEnd().split('\r\n');
  assert.equal(lines[0], ',Cache,Vault,Total');
  assert.equal(lines[1], 'REQ-001 Fast,← Satisfy,,1');
  assert.equal(lines[3], '"REQ-003 Cheap, ""really""",,,0');
  assert.equal(lines[4], 'Total,1,1,2');
  const tsv = matrixTsv(m).split('\n');
  assert.equal(tsv[1], 'REQ-001 Fast\t←\t');
  assert.ok(r1);
});

test('a cell click creates the relationship, a second click deletes it; one undo step each', () => {
  const { project, r3, cache } = shop();
  const doc = new ProjectDocument(project);
  const toggle = () => doc.apply('trace', (p) => toggleRelation(p, { sourceId: cache._id, targetId: r3._id, type: 'SysMLSatisfy' }));
  const created = toggle();
  assert.equal(created.action, 'created');
  const live = doc.project;
  assert.equal(relationsBetween(live, cache._id, r3._id, 'SysMLSatisfy').length, 1);
  const rel = relationsBetween(live, cache._id, r3._id, 'SysMLSatisfy')[0];
  assert.equal(M.ownerOf(live, rel._id)?._id, cache._id, 'kept in the source block (StarUML)');
  let m = matrix(live, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLBlock'], relationTypes: ['SysMLSatisfy'] });
  assert.deepEqual(m.emptyRows, []);
  const removed = toggle();
  assert.equal(removed.action, 'removed');
  assert.equal(relationsBetween(doc.project, cache._id, r3._id, 'SysMLSatisfy').length, 0);
  doc.undo();
  assert.equal(relationsBetween(doc.project, cache._id, r3._id, 'SysMLSatisfy').length, 1, 'undo brings it back');
  doc.undo();
  assert.equal(relationsBetween(doc.project, cache._id, r3._id, 'SysMLSatisfy').length, 0);
  m = matrix(doc.project, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLBlock'], relationTypes: ['SysMLSatisfy'] });
  assert.deepEqual(m.emptyRows, [r3._id]);
  // Unknown ends or a non-relationship type change nothing.
  assert.equal(toggleRelation(doc.project, { sourceId: 'nope', targetId: r3._id, type: 'SysMLSatisfy' }).action, 'none');
  assert.equal(toggleRelation(doc.project, { sourceId: cache._id, targetId: r3._id, type: 'UMLClass' }).action, 'none');
});

test('validation: approved requirements must be satisfied and verified, ids unique', () => {
  for (const id of ['requirement-not-satisfied', 'requirement-not-verified', 'requirement-id-duplicate']) {
    const rule = RULES.find((r) => r.id === id);
    assert.ok(rule && rule.severity === 'warning' && rule.ko && rule.en, id);
  }
  const { project, r1, r2, r3 } = shop();
  const of = (rule) => validate(project).filter((p) => p.rule === rule).map((p) => p.id);
  assert.deepEqual(of('requirement-not-satisfied'), []);
  assert.deepEqual(of('requirement-not-verified'), [r2._id], 'r1 is verified, r3 only proposed');
  r3.status = 'implemented';
  assert.deepEqual(of('requirement-not-satisfied'), [r3._id]);
  r3.status = 'rejected';
  assert.deepEqual(of('requirement-not-satisfied'), []);
  // A composite requirement is covered by its parts.
  const part = M.addElement(project, r2._id, 'SysMLRequirement', { name: 'Part', status: 'proposed' });
  assert.equal(M.ownerOf(project, part._id)._id, r2._id);
  assert.deepEqual(of('requirement-not-verified'), []);
  r3.id = r1.id;
  const dup = validate(project).filter((p) => p.rule === 'requirement-id-duplicate');
  assert.deepEqual(dup.map((p) => p.id), [r3._id]);
  assert.match(dup[0].message.en, /Requirement 'Cheap, "really"': Requirement id is used more than once \(REQ-001 = Fast\)/);
  assert.ok(dup[0].message.ko.includes('요구사항 ID가 중복됩니다'));
});

test('documentation has a requirements table (HTML and Markdown)', () => {
  const { project } = shop();
  const html = htmlDocs(project, { language: 'en' });
  const section = /<section id="requirements" class="requirements">[\s\S]*?<\/section>/.exec(html)?.[0];
  assert.ok(section, 'requirements section');
  assert.match(section, /<h2>Requirements<\/h2>/);
  assert.match(section, /<th>ID<\/th><th>Name<\/th><th>Kind<\/th><th>Status<\/th><th>Priority<\/th>/);
  assert.match(section, /<td>REQ-001<\/td><td><a href="#e-[^"]+">Fast<\/a><\/td><td>Functional<\/td><td>Approved<\/td><td>High<\/td>/);
  assert.match(section, /Cheap, &quot;really&quot;/);
  const ko = htmlDocs(project, { language: 'ko' });
  assert.match(ko, /<h2>요구사항<\/h2>/);
  assert.match(ko, /<td>REQ-001<\/td><td><a [^>]+>Fast<\/a><\/td><td>기능<\/td><td>승인<\/td><td>높음<\/td>/);
  const md = markdownDocs(project, { language: 'en' });
  assert.match(md, /## Requirements\n\n\| ID \| Name \| Kind \| Status \| Priority \| Risk \| Verification \| Satisfied by \| Verified by \| Text \|/);
  assert.match(md, /\| REQ-001 \| \[Fast\]\(#e-[^)]+\) \| Functional \| Approved \| High \|  \|  \| 1 \| 1 \| Answer in 1 s \|/);
  // The requirement's own section lists the new attributes.
  assert.match(html, /<td>Status<\/td><td>approved<\/td>/);
  // No requirements, no table.
  assert.doesNotMatch(htmlDocs(M.createProject({ diagram: null }), { language: 'en' }), /id="requirements"/);
});

test('a requirement shape shows id, text and status without broken numbers', () => {
  const { project, r1, r3 } = shop();
  r1.risk = 'high';
  r1.verifyMethod = 'test';
  const diagram = M.addDiagram(project, project.ownedElements[0]._id, 'SysMLRequirementDiagram');
  M.showElement(project, diagram, r1._id, { x: 20, y: 20 });
  M.showElement(project, diagram, r3._id, { x: 320, y: 20 });
  delete r3.status;
  delete r3.priority;
  const errors = [];
  const { svg } = renderDiagramSvg(project, diagram, { onError: (error) => errors.push(error.message) });
  assert.deepEqual(errors, []);
  assert.ok(!/NaN|undefined/.test(svg), 'no NaN or undefined');
  assert.ok(svg.includes('Id = &quot;REQ-001&quot;') || svg.includes('Id = "REQ-001"'), 'id');
  assert.match(svg, /Status = approved, Priority = high/);
  assert.match(svg, /Risk = high, Verify = test/);
  assert.match(svg, /«requirement»/);
  assert.ok(REQUIREMENT_STATUSES.includes('approved'));
});

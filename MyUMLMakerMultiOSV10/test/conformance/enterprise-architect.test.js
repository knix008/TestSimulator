// Enterprise Architect conformance: an explicit checklist of the Sparx Systems
// Enterprise Architect features this program implements, one test each (the
// test name says which EA feature), exercising the real functions: the UML 2.5
// diagram set, SysML, BPMN, ArchiMate 3, data modelling, project management
// views, network diagrams; requirements management with the relationship
// matrix; validation; baselines with model compare and restore; document
// generation (templates, Word, PDF, HTML); XMI 2.x interchange (EA flavour with
// diagram geometry, and files from MagicDraw and Papyrus); code engineering
// (generation and reverse per language, DDL dialects); database storage (the
// domain side); model search.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as M from '../../src/domain/model.js';
import { DIAGRAM_TYPES, fieldsOf, typeDef } from '../../src/domain/meta.js';
import { toolboxFor } from '../../src/domain/toolbox.js';
import { buildSample } from '../../src/domain/templates.js';
import { createRenderContext, layoutDiagram, nodeBox, renderDiagramSvg } from '../../src/render/notation.js';
import { ARCHIMATE_ELEMENTS, ARCHIMATE_LAYERS, ARCHIMATE_RELATIONS, archimateInfo, archimateKindOf, LAYER_OF } from '../../src/domain/archimate.js';
import { addWorkdays, closedTest, parseDate, schedule } from '../../src/domain/planning.js';
import { coverage, matrix, matrixCsv, nextRequirementId, relationsBetween, requirementRows, requirementsCsv, toggleRelation } from '../../src/domain/trace.js';
import { RULES, validate } from '../../src/domain/validate.js';
import { addBaseline, baselineAsProject, baselineRoot, compareWithBaseline, createBaseline, listBaselines, removeBaseline, restoreElement } from '../../src/domain/baseline.js';
import { compareModels, diffTree } from '../../src/domain/diff.js';
import { buildReport, REPORT_FORMATS, REPORT_TEMPLATE_IDS } from '../../src/domain/report.js';
import { reportHtml } from '../../src/domain/docs.js';
import { reportDocx, unzipStored } from '../../src/export/docx.js';
import { reportPdfPages } from '../../src/export/report-pdf.js';
import { exportXmi, importXmi, readXmi } from '../../src/domain/interop/xmi.js';
import { CODE_LANGUAGES, generateCode, SQL_DIALECTS } from '../../src/domain/codegen/index.js';
import { REVERSE_LANGUAGES, reverseEngineer } from '../../src/domain/reverse/index.js';
import { normalizeProject, parseProject, serialize } from '../../src/domain/format.js';
import { ProjectDocument } from '../../src/domain/document.js';
import { DB_KINDS, dbConfig, dbDescribe, dbProblems, normalizeSettings } from '../../src/domain/settings.js';
import { canvas, marks, texts } from './canvas.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = () => parseProject(fs.readFileSync(path.join(root, 'samples', 'online-shop.en.myuml'), 'utf8')).project;
const toolsOf = (type) => toolboxFor(type).flatMap(([, , , tools]) => tools);
const named = (project, type, name) => M.elementsWhere(project, (e) => e._type === type && e.name === name)[0];
const renderClean = (project, diagram) => {
  const errors = [];
  const { svg } = renderDiagramSvg(project, diagram, { language: 'en', onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
  assert.deepEqual(errors, [], `${diagram.name}: render errors`);
  assert.ok(!/NaN|undefined/.test(svg), `${diagram.name}: no broken numbers`);
  return svg;
};

// ───────────────────────── modelling languages

test('EA UML 2.5: all 14 UML diagram kinds are available, each with a toolbox and a finished sample', () => {
  const UML = ['UMLClassDiagram', 'UMLObjectDiagram', 'UMLPackageDiagram', 'UMLCompositeStructureDiagram', 'UMLComponentDiagram', 'UMLDeploymentDiagram', 'UMLProfileDiagram',
    'UMLUseCaseDiagram', 'UMLActivityDiagram', 'UMLStatechartDiagram', 'UMLSequenceDiagram', 'UMLCommunicationDiagram', 'UMLTimingDiagram', 'UMLInteractionOverviewDiagram'];
  const project = buildSample('en');
  for (const type of UML) {
    assert.ok(DIAGRAM_TYPES[type], type);
    assert.ok(toolsOf(type).filter((t) => t.kind === 'node').length >= 3, `${type}: element tools`);
    const d = M.allDiagrams(project).find((x) => x._type === type);
    assert.ok(d, `${type}: sample`);
    renderClean(project, d);
  }
});

test('EA SysML 1.x: requirement, block definition, internal block and parametric diagrams with blocks, parts, ports, constraint blocks and requirement relationships', () => {
  const types = { SysMLRequirementDiagram: ['SysMLRequirement', 'SysMLSatisfy', 'SysMLVerify', 'SysMLDeriveReqt', 'SysMLRefine', 'SysMLTrace', 'SysMLCopy'], SysMLBlockDefinitionDiagram: ['SysMLBlock', 'SysMLValueType', 'SysMLConstraintBlock', 'SysMLInterfaceBlock'], SysMLInternalBlockDiagram: ['SysMLPart', 'SysMLPort', 'SysMLConnector', 'SysMLItemFlow'], SysMLParametricDiagram: ['SysMLConstraintProperty', 'SysMLConstraintParameter'] };
  for (const [diagram, wanted] of Object.entries(types)) {
    const have = new Set(toolsOf(diagram).map((t) => t.type));
    assert.deepEqual(wanted.filter((t) => !have.has(t)), [], diagram);
  }
  const c = canvas('SysMLBlockDefinitionDiagram');
  const car = c.node('SysMLBlock', 0, 0, { name: 'Car' });
  c.add(car, 'SysMLPart', { name: 'engine', type: 'Engine' });
  c.add(car, 'SysMLValue', { name: 'mass', type: 'kg' });
  c.add(car, 'SysMLPort', { name: 'fuel', type: 'FuelIn' });
  const t = texts(c.render().of(car));
  for (const x of ['«block»', 'parts', 'values', 'ports', '+mass: kg']) assert.ok(t.includes(x), x);
});

test('EA BPMN 2.0: pools, lanes, every task kind, start / intermediate / boundary / end events with triggers, the five gateways, data objects and the four flows', () => {
  const tools = toolsOf('BPMNDiagram');
  const ids = new Set(tools.map((t) => t.id));
  for (const id of ['BPMNParticipant', 'BPMNLane', 'task:user', 'task:service', 'task:script', 'task:manual', 'task:send', 'task:receive', 'task:businessRule', 'BPMNSubProcess', 'BPMNCallActivity',
    'BPMNStartEvent:message', 'BPMNStartEvent:timer', 'BPMNIntermediateEvent:signal', 'BPMNBoundaryEvent', 'BPMNEndEvent:error', 'BPMNEndEvent:terminate',
    'BPMNExclusiveGateway', 'BPMNParallelGateway', 'BPMNInclusiveGateway', 'BPMNEventBasedGateway', 'BPMNComplexGateway', 'BPMNDataObject', 'BPMNDataStore', 'BPMNSequenceFlow', 'BPMNMessageFlow', 'BPMNAssociation', 'BPMNDataAssociation']) assert.ok(ids.has(id), id);
  const c = canvas('BPMNDiagram');
  const start = c.node('BPMNStartEvent:timer', 0, 0, { name: 'Every day' });
  const task = c.node('task:service', 120, 0, { name: 'Bill' });
  const end = c.node('BPMNEndEvent:error', 320, 0, { name: 'Failed' });
  c.edge('BPMNSequenceFlow', start, task);
  c.edge('BPMNSequenceFlow', task, end);
  const plain = c.node('BPMNStartEvent', 0, 200, { name: 'Every day' });
  const r = c.render();
  assert.ok(r.of(start).length > r.of(plain).length, 'a timer start event draws its clock symbol');
  assert.equal(start.element.eventKind, 'timer');
  assert.equal(end.element.eventKind, 'error');
  assert.equal(task.element.taskKind, 'service');
});

test('EA ArchiMate 3.1: every element of the business, application, technology, physical, motivation, strategy and implementation layers draws in its layer colour', () => {
  const layers = ARCHIMATE_LAYERS.map(([id]) => id);
  assert.deepEqual(layers, ['business', 'application', 'technology', 'physical', 'motivation', 'strategy', 'implementation', 'other']);
  const c = canvas('ArchiMateDiagram');
  const kinds = new Set(toolsOf('ArchiMateDiagram').filter((t) => t.type === 'ArchiMateElement').map((t) => t.attrs.kind));
  assert.deepEqual(ARCHIMATE_ELEMENTS.map(([k]) => k).filter((k) => !kinds.has(k)), [], 'a tool for every element');
  for (const [layer] of ARCHIMATE_LAYERS) assert.ok(ARCHIMATE_ELEMENTS.some(([k]) => k.startsWith(`${layer}-`)), `${layer} has elements`);
  const drawn = [];
  ARCHIMATE_ELEMENTS.forEach(([kind], i) => drawn.push(c.node(`archimate:${kind}`, (i % 8) * 200, Math.floor(i / 8) * 120, { name: kind })));
  const r = c.render();
  for (const item of drawn) {
    const info = archimateInfo(item.element.kind);
    assert.ok(r.of(item).toLowerCase().includes(info.fill.toLowerCase()), `${info.kind}: ${info.layer} colour ${info.fill}`);
  }
  // PlantUML / library names are understood.
  assert.equal(archimateKindOf('Business_Actor'), 'business-actor');
  assert.equal(archimateKindOf('Technology_SystemSoftware'), 'technology-system-software');
  assert.equal(archimateKindOf('goal'), 'motivation-goal');
});

test('EA ArchiMate 3.1: the eleven relationships with their notation (composition, aggregation, assignment, realization, serving, access, influence, triggering, flow, specialization, association) and junctions', () => {
  assert.deepEqual(ARCHIMATE_RELATIONS.map(([type]) => type.replace('ArchiMate', '')), ['Composition', 'Aggregation', 'Assignment', 'Realization', 'Serving', 'Access', 'Influence', 'Triggering', 'Flow', 'Specialization', 'Association']);
  const c = canvas('ArchiMateDiagram');
  const actor = c.node('archimate:business-actor', 0, 0, { name: 'Clerk' });
  const process = c.node('archimate:business-process', 400, 0, { name: 'Handle' });
  const expect = {
    ArchiMateComposition: { mark: ['composite'] }, ArchiMateAggregation: { mark: ['shared'] }, ArchiMateAssignment: { mark: ['filled', 'dot'] },
    ArchiMateRealization: { mark: ['triangle'], dash: '2 3' }, ArchiMateServing: { mark: ['open'] }, ArchiMateAccess: { mark: ['open'], dash: '2 3' },
    ArchiMateInfluence: { mark: ['open'], dash: '6 4' }, ArchiMateTriggering: { mark: ['filled'] }, ArchiMateFlow: { mark: ['filled'], dash: '6 4' },
    ArchiMateSpecialization: { mark: ['triangle'] }, ArchiMateAssociation: { mark: [] },
  };
  const lines = Object.keys(expect).map((type) => [type, c.edge(type, actor, process)]);
  const r = c.render();
  for (const [type, line] of lines) {
    const svg = r.of(line);
    assert.deepEqual(marks(svg), expect[type].mark, `${type}: end marks`);
    assert.equal(/stroke-dasharray="([^"]+)"/.exec(svg)?.[1] ?? '', expect[type].dash ?? '', `${type}: line`);
  }
  const and = c.node('ArchiMateJunction', 200, 200);
  const or = c.node('junction:or', 300, 200);
  assert.deepEqual([and.element.junctionType ?? 'and', or.element.junctionType], ['and', 'or']);
});

test('EA data modelling: ER diagram with entities, columns (PK / FK / NOT NULL / UNIQUE) and identifying / non-identifying relationships; DDL for every database', () => {
  const c = canvas('ERDDiagram');
  const customer = c.node('ERDEntity', 0, 0, { name: 'customer' });
  c.add(customer, 'ERDColumn', { name: 'email', type: 'VARCHAR', length: '200', unique: true, nullable: false });
  const orders = c.node('ERDEntity', 300, 0, { name: 'orders' });
  c.add(orders, 'ERDColumn', { name: 'customer_id', type: 'INTEGER', foreignKey: true, referenceTo: M.ref(customer.element.columns[0]) });
  c.edge('erd:1:0..*', customer, orders);
  c.render();
  assert.deepEqual(SQL_DIALECTS.map((d) => d.id), ['mysql', 'postgres', 'sqlite', 'sqlserver', 'oracle']);
  for (const { id } of SQL_DIALECTS) {
    const ddl = generateCode(c.project, null, 'sql', { dialect: id })[0].content;
    assert.match(ddl, /CREATE TABLE/i, id);
    assert.match(ddl, /UNIQUE/i, `${id}: unique`);
    assert.match(ddl, /REFERENCES/i, `${id}: foreign key`);
  }
});

test('EA project management: Gantt chart with working days, closed days, dependencies, milestones and completion', () => {
  const closed = closedTest('saturday,sunday', '2026-11-11');
  assert.equal(addWorkdays(parseDate('2026-11-09'), 3, closed), parseDate('2026-11-13'), 'Mon + 3 working days skipping a holiday ends Thu → next day');
  const plan = schedule([{ id: 'design', start: '2026-11-02', duration: 5 }, { id: 'build', duration: 10 }, { id: 'done', milestone: true }], [['design', 'build'], ['build', 'done']], { isClosed: closed });
  assert.equal(plan.at.get('build').start, parseDate('2026-11-09'), 'build starts after design (next Monday)');
  assert.equal(plan.at.get('done').start, plan.at.get('build').end);
  const c = canvas('GanttDiagram');
  const cal = c.node('GanttCalendar', 0, 0, { name: 'Plan', start: '2026-11-02', days: 40 }, { w: 900, h: 300 });
  const design = c.node('GanttTask', 10, 40, { name: 'Design', start: '2026-11-02', duration: 5, completion: 100 });
  const build = c.node('GanttTask', 10, 80, { name: 'Build', duration: 10, completion: 40, resources: 'Kim' });
  const done = c.node('GanttMilestone', 10, 120, { name: 'Release' });
  c.edge('GanttDependency', design, build);
  c.edge('GanttDependency', build, done);
  const r = c.render();
  const at = (x) => nodeBox(r.ctx, x.view);
  assert.ok(at(build).x >= at(design).x + at(design).w - 1, 'the dependent bar starts where the first ends');
  assert.ok(at(done).x >= at(build).x + at(build).w - 12, 'the milestone sits at the end');
  assert.ok(texts(r.svg).some((t) => /Build/.test(t)));
  void cal;
});

test('EA project management: work breakdown structure (WBS) tree and a timeline of events and periods', () => {
  const w = canvas('WBSDiagram');
  const top = w.node('WBSNode', 0, 0, { name: 'Shop', code: '1' });
  const build = w.node('WBSNode', 0, 120, { name: 'Build', code: '1.1' });
  const test1 = w.node('WBSNode', 200, 120, { name: 'Test', code: '1.2' });
  w.edge('wbsBranch', top, build);
  w.edge('wbsBranch', top, test1);
  assert.deepEqual(top.element.ownedElements.map((e) => e.name), ['Build', 'Test'], 'sub-items belong to their parent');
  w.render();
  const t = canvas('TimelineDiagram');
  const axis = t.node('TLTimeline', 0, 0, { name: 'Year', start: '2026-01-01', end: '2026-12-31' }, { w: 1200, h: 200 });
  const kick = t.node('TLEvent', 10, 40, { name: 'Kick-off', date: '2026-02-01' });
  const beta = t.node('TLEvent', 10, 80, { name: 'Beta', date: '2026-08-01' });
  t.node('TLPeriod', 10, 120, { name: 'Development', start: '2026-03-01', end: '2026-07-31' });
  const r = t.render();
  assert.ok(nodeBox(r.ctx, beta.view).x > nodeBox(r.ctx, kick.view).x, 'events are placed by date');
  void axis;
});

test('EA network diagram: networks with addresses, devices of each kind and connections with an address', () => {
  const c = canvas('NetworkDiagram');
  const lan = c.node('NWNetwork', 0, 0, { name: 'dmz', address: '10.0.0.0/24' });
  const web = c.node('NWNode', 40, 120, { name: 'web01' });
  const db = c.node('nwnode:database', 300, 120, { name: 'db01' });
  const link = c.edge('NWConnection', lan, web, { address: '10.0.0.11' });
  c.edge('NWConnection', lan, db, { address: '10.0.0.50' });
  assert.equal(db.element.device, 'database');
  const r = c.render();
  assert.ok(texts(r.of(lan)).some((t) => t.includes('10.0.0.0/24')));
  assert.ok(texts(r.of(link)).includes('10.0.0.11'));
});

// ───────────────────────── requirements management

/** Requirements, design blocks and a test case (the project of the requirement tests). */
function requirementsProject() {
  const project = M.createProject({ name: 'Car', language: 'en', diagram: null, author: 'Lee' });
  const model = project.ownedElements[0];
  const reqs = M.addElement(project, model._id, 'UMLPackage', { name: 'Requirements' });
  const design = M.addElement(project, model._id, 'UMLPackage', { name: 'Design' });
  const range = M.addElement(project, reqs._id, 'SysMLRequirement', { name: 'Range', text: 'Drive 500 km', status: 'approved', priority: 'high' });
  const charge = M.addElement(project, reqs._id, 'SysMLRequirement', { name: 'Charge', text: '80 % in 30 min', status: 'approved' });
  const quiet = M.addElement(project, reqs._id, 'SysMLRequirement', { name: 'Quiet' });
  const battery = M.addElement(project, design._id, 'SysMLBlock', { name: 'Battery' });
  const charger = M.addElement(project, design._id, 'SysMLBlock', { name: 'Charger' });
  const roadTest = M.addElement(project, design._id, 'UMLUseCase', { name: 'Road test' });
  const rel = (type, from, to) => M.insertElement(M.relationshipOwner(project, type, from._id), Object.assign(M.createElement(type), { source: M.ref(from), target: M.ref(to) }));
  rel('SysMLSatisfy', battery, range);
  rel('SysMLVerify', roadTest, range);
  rel('SysMLSatisfy', charger, charge);
  return { project, reqs, design, range, charge, quiet, battery, charger, roadTest };
}

test('EA requirements: requirement attributes (status, priority, difficulty, stability, risk, verification, version, author, phase) with defaults and automatic unique ids', () => {
  const keys = fieldsOf('SysMLRequirement').map((f) => f.key);
  for (const key of ['id', 'text', 'kind', 'status', 'priority', 'difficulty', 'stability', 'risk', 'verifyMethod', 'version', 'author', 'phase']) assert.ok(keys.includes(key), key);
  const { project, range, charge, quiet } = requirementsProject();
  assert.deepEqual([range.id, charge.id, quiet.id], ['REQ-001', 'REQ-002', 'REQ-003']);
  assert.deepEqual([quiet.status, quiet.priority, quiet.difficulty, quiet.stability, quiet.author], ['proposed', 'medium', 'medium', 'medium', 'Lee']);
  assert.equal(nextRequirementId(project), 'REQ-004');
  const c = canvas('SysMLRequirementDiagram');
  const drawn = c.node('SysMLRequirement', 0, 0, { name: 'Safe' });
  assert.match(drawn.element.id, /^REQ-\d{3}$/, 'drawn from the toolbox: numbered too');
});

test('EA requirements: the requirements list with trace counts and its CSV export', () => {
  const { project, range } = requirementsProject();
  const rows = requirementRows(project);
  assert.deepEqual(rows.map((r) => r.reqId), ['REQ-001', 'REQ-002', 'REQ-003']);
  const first = rows.find((r) => r.id === range._id);
  assert.deepEqual([first.satisfiedBy, first.verifiedBy, first.path], [1, 1, 'Model::Requirements::Range']);
  const csv = requirementsCsv(rows, { language: 'en' }).trimEnd().split('\r\n');
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^ID,Name,Kind,Status,Priority/);
  assert.match(csv[1], /^REQ-001,Range,/);
  assert.deepEqual([coverage(project).get(range._id).satisfiedBy.length, coverage(project).get(range._id).verifiedBy.length], [1, 1]);
});

test('EA relationship matrix: rows × columns of chosen types and relationship kinds, a cell creates and a second click deletes the relationship (each one undo step), CSV', () => {
  const { project, quiet, battery, charge } = requirementsProject();
  const doc = new ProjectDocument(project);
  const m = matrix(doc.project, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLBlock'], relationTypes: ['SysMLSatisfy'] });
  assert.deepEqual(m.cols.map((x) => x.name), ['Battery', 'Charger']);
  assert.deepEqual(m.emptyRows, [quiet._id]);
  const click = () => doc.apply('trace', (p) => toggleRelation(p, { sourceId: battery._id, targetId: quiet._id, type: 'SysMLSatisfy' }));
  assert.equal(click().action, 'created');
  assert.equal(relationsBetween(doc.project, battery._id, quiet._id, 'SysMLSatisfy').length, 1);
  assert.deepEqual(matrix(doc.project, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLBlock'], relationTypes: ['SysMLSatisfy'] }).emptyRows, []);
  assert.equal(click().action, 'removed');
  assert.equal(relationsBetween(doc.project, battery._id, quiet._id, 'SysMLSatisfy').length, 0);
  doc.undo();
  assert.equal(relationsBetween(doc.project, battery._id, quiet._id, 'SysMLSatisfy').length, 1, 'undo the delete');
  doc.undo();
  assert.equal(relationsBetween(doc.project, battery._id, quiet._id, 'SysMLSatisfy').length, 0, 'undo the create');
  const lines = matrixCsv(matrix(doc.project, { sourceTypes: ['SysMLRequirement'], targetTypes: ['SysMLBlock'] }), { language: 'en' }).trimEnd().split('\r\n');
  assert.equal(lines[0], ',Battery,Charger,Total');
  assert.match(lines[1], /^REQ-001 Range,← Satisfy,,1$/);
  void charge;
});

test('EA model validation: requirement coverage (approved but not satisfied / not verified, duplicate ids) next to the UML well-formedness rules', () => {
  const { project, charge, quiet, range } = requirementsProject();
  const of = (rule) => validate(project).filter((p) => p.rule === rule).map((p) => p.id);
  assert.deepEqual(of('requirement-not-verified'), [charge._id], 'approved and satisfied but never verified');
  quiet.status = 'approved';
  assert.ok(of('requirement-not-satisfied').includes(quiet._id));
  quiet.id = range.id;
  assert.deepEqual(of('requirement-id-duplicate'), [quiet._id]);
  assert.ok(RULES.length >= 25, `${RULES.length} rules`);
});

// ───────────────────────── baselines, compare, restore

test('EA baselines: create, list, keep in the project file, open as a project and delete', () => {
  const project = sample();
  const b = addBaseline(project, createBaseline(project, { name: 'Release 1', note: 'reviewed', date: new Date('2026-10-01T00:00:00Z') }));
  assert.deepEqual(listBaselines(project).map((x) => [x.name, x.note, x.date]), [['Release 1', 'reviewed', '2026-10-01T00:00:00.000Z']]);
  const reloaded = parseProject(serialize(project)).project;
  assert.equal(listBaselines(reloaded).length, 1, 'saved in the .myuml file');
  assert.equal(baselineAsProject(b)._type, 'Project');
  assert.equal(removeBaseline(project, b._id), true);
  assert.deepEqual(listBaselines(project), []);
});

test('EA compare with baseline: added, removed and changed elements, features, relationships and diagrams as a tree with filters', () => {
  const before = sample();
  const after = sample();
  const customer = named(after, 'UMLClass', 'Customer');
  customer.name = 'Client';
  const added = M.insertElement(customer, M.createElement('UMLAttribute', { name: 'points', type: 'int' }));
  const victim = M.elementsWhere(after, (e) => e._type === 'UMLClass' && e !== customer && M.relationshipsOf(after, e._id).length)[0];
  M.removeElements(after, [victim._id]);
  const diff = compareModels(before, after, { language: 'en' });
  const item = (id) => diff.items.find((x) => x.id === id);
  assert.equal(item(customer._id).status, 'changed');
  assert.ok(item(customer._id).changes.some((x) => x.field === 'name' && x.before === 'Customer' && x.after === 'Client'));
  assert.equal(item(added._id).status, 'added');
  assert.equal(item(victim._id).status, 'removed');
  assert.ok(diff.items.some((x) => x.category === 'relationship' && x.status === 'removed'), 'its relationships');
  assert.ok(diff.items.some((x) => x.category === 'diagram' && x.status === 'changed'), 'diagrams that showed it');
  const rows = diffTree(diff, { statuses: ['added'] }).filter((r) => r.status);
  assert.deepEqual(rows.map((r) => r.id), [added._id]);
});

test('EA restore from baseline: a changed element gets its old values back and a deleted one returns to its owner', () => {
  const project = sample();
  const b = addBaseline(project, createBaseline(project, { name: 'B' }));
  const customer = named(project, 'UMLClass', 'Customer');
  const victim = M.elementsWhere(project, (e) => e._type === 'UMLClass' && e !== customer && (e.attributes ?? []).length)[0];
  customer.name = 'Client';
  M.removeElements(project, [victim._id]);
  assert.ok(compareWithBaseline(project, b).items.length >= 2);
  restoreElement(project, baselineRoot(b), customer._id);
  restoreElement(project, baselineRoot(b), victim._id);
  assert.equal(M.findById(project, customer._id).name, 'Customer');
  assert.ok(M.findById(project, victim._id), 'back in the model');
  assert.ok(!compareWithBaseline(project, b).items.some((x) => x.id === customer._id || x.id === victim._id));
});

// ───────────────────────── documents

test('EA document generation: built-in templates (full model, requirements, design, use case, data dictionary) with switchable sections', () => {
  assert.deepEqual(REPORT_TEMPLATE_IDS, ['full', 'requirements', 'design', 'usecase', 'data']);
  assert.deepEqual(REPORT_FORMATS, ['docx', 'pdf', 'html']);
  const project = sample();
  for (const template of REPORT_TEMPLATE_IDS) {
    const report = buildReport(project, { template, language: 'en' });
    assert.ok(report.blocks.some((b) => b.kind === 'heading' && b.level === 2), `${template}: has element sections`);
    assert.equal(report.blocks[0].kind, 'cover', `${template}: cover page`);
  }
  const bare = buildReport(project, { template: 'full', language: 'en', sections: { cover: false, toc: false, diagrams: false } });
  assert.ok(!bare.blocks.some((b) => ['cover', 'toc', 'image'].includes(b.kind)), 'sections switched off');
  const req = buildReport(project, { template: 'requirements', language: 'en' });
  const table = req.blocks[req.blocks.findIndex((b) => b.kind === 'heading' && b.text === 'Requirements') + 1];
  assert.deepEqual(table.head.slice(0, 2), ['ID', 'Name']);
});

test('EA document generation (Word .docx): a valid OOXML package with styles, numbering, a TOC field, tables and embedded diagram pictures', () => {
  const report = buildReport(sample(), { template: 'design', language: 'en', author: 'Lee' });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const files = unzipStored(reportDocx(report, { image: () => ({ png, width: 600, height: 300 }) }));
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/numbering.xml', 'word/settings.xml', 'docProps/core.xml', 'word/media/image1.png']) assert.ok(files.has(name), name);
  const doc = new TextDecoder().decode(files.get('word/document.xml'));
  assert.match(doc, /TOC \\o "1-2"/);
  assert.match(doc, /<w:tbl>/);
  assert.match(doc, /<a:blip r:embed="rIdImg1"\/>/);
  assert.match(new TextDecoder().decode(files.get('docProps/core.xml')), /<dc:creator>Lee<\/dc:creator>/);
});

test('EA document generation (PDF and HTML): A4 sheets with contents and page numbers; one HTML page with a linked table of contents', () => {
  const report = buildReport(sample(), { template: 'full', language: 'en' });
  const pages = reportPdfPages(report, { diagramSvg: () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"></svg>', width: 400, height: 200 }) });
  assert.ok(pages.length > 3);
  assert.match(pages[1].svg, />Contents</);
  assert.match(pages.at(-1).svg, new RegExp(`>${pages.length} / ${pages.length}<`));
  const html = reportHtml(report, { renderDiagram: () => '<svg></svg>' });
  assert.match(html, /<nav class="toc">/);
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  assert.ok([...html.matchAll(/href="#([^"]+)"/g)].every((m) => ids.has(m[1])), 'every contents link has a target');
});

// ───────────────────────── XMI

test('EA XMI 2.x export (EA flavour): UML model, profiles with applied stereotypes and the EA diagram extension with geometry', () => {
  const xmi = exportXmi(buildSample('en'));
  assert.match(xmi, /<xmi:XMI xmlns:xmi="http:\/\/www.omg.org\/spec\/XMI\/20131001" xmlns:uml="http:\/\/www.omg.org\/spec\/UML\/20161101"/);
  assert.match(xmi, /<xmi:Extension extender="Enterprise Architect" extenderID="6.5">/);
  assert.match(xmi, /<diagrams>/);
  assert.match(xmi, /geometry="Left=\d+;Top=\d+;Right=\d+;Bottom=\d+;"/);
  assert.match(xmi, /xmi:type="uml:Class"/);
  assert.match(xmi, /<ShopProfile:Controller /, 'stereotype application');
  assert.doesNotMatch(exportXmi(buildSample('en'), { flavor: 'plain' }), /Enterprise Architect/, 'plain (model only) flavour');
});

test('EA XMI 2.x import: an EA export comes back with the same classes, relationships and diagram positions', () => {
  const original = buildSample('en');
  const { project, warnings } = readXmi(exportXmi(original));
  normalizeProject(project);
  assert.deepEqual(warnings, []);
  const count = (p, type) => M.elementsWhere(p, (e) => e._type === type).length;
  for (const type of ['UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLGeneralization', 'UMLUseCase', 'UMLState', 'UMLLifeline']) assert.equal(count(project, type), count(original, type), type);
  // Associations between UML classes (SysML, ERD and the other notations are not UML and stay out of XMI).
  const classAssociations = (p) => M.elementsWhere(p, (e) => e._type === 'UMLAssociation' && [e.end1, e.end2].every((end) => M.findById(p, end?.reference)?._type === 'UMLClass')).length;
  assert.equal(classAssociations(project), classAssociations(original), 'class associations');
  const d0 = M.allDiagrams(original).find((d) => d._type === 'UMLClassDiagram');
  const d1 = M.allDiagrams(project).find((d) => d._type === d0._type && d.name === d0.name);
  const at = (d, p) => d.ownedViews.filter((v) => !M.isEdgeView(v) && v.model && M.findById(p, v.model)?._type === 'UMLClass').map((v) => `${M.findById(p, v.model).name}@${v.left},${v.top}`).sort();
  assert.deepEqual(at(d1, project), at(d0, original), 'class positions');
});

test('EA XMI 2.x import from MagicDraw (UML DI shapes) and Papyrus (no diagrams: laid-out class diagrams)', () => {
  const magic = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.5" xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001" xmlns:umldi="http://www.omg.org/spec/UML/20131001/UMLDI" xmlns:dc="http://www.omg.org/spec/UML/20131001/UMLDC">
  <uml:Model xmi:id="m" name="Shop">
    <packagedElement xmi:type="uml:Class" xmi:id="cart" name="Cart">
      <ownedAttribute xmi:type="uml:Property" xmi:id="items" name="items" type="item" association="a1" aggregation="composite"/>
    </packagedElement>
    <packagedElement xmi:type="uml:Class" xmi:id="item" name="Item"/>
    <packagedElement xmi:type="uml:Association" xmi:id="a1" memberEnd="items cartEnd">
      <ownedEnd xmi:type="uml:Property" xmi:id="cartEnd" type="cart" association="a1"/>
    </packagedElement>
  </uml:Model>
  <umldi:UMLClassDiagram xmi:id="d1" name="Overview">
    <ownedElement xmi:type="umldi:UMLShape" xmi:id="s1"><modelElement xmi:idref="cart"/><bounds x="20" y="30" width="150" height="80"/></ownedElement>
    <ownedElement xmi:type="umldi:UMLShape" xmi:id="s2"><modelElement xmi:idref="item"/><bounds x="300" y="30" width="120" height="60"/></ownedElement>
    <ownedElement xmi:type="umldi:UMLEdge" xmi:id="e1" source="s1" target="s2"><modelElement xmi:idref="a1"/></ownedElement>
  </umldi:UMLClassDiagram>
</xmi:XMI>`;
  const md = readXmi(magic).project;
  normalizeProject(md);
  const d = M.allDiagrams(md)[0];
  assert.equal(d.name, 'Overview');
  assert.deepEqual(d.ownedViews.filter((v) => !M.isEdgeView(v)).map((v) => [M.findById(md, v.model).name, v.left, v.top]), [['Cart', 20, 30], ['Item', 300, 30]]);
  assert.equal(d.ownedViews.filter(M.isEdgeView).length, 1);
  assert.equal(M.elementsWhere(md, (e) => e._type === 'UMLAssociation')[0].end1.aggregation, 'composite');
  const papyrus = `<?xml version="1.0" encoding="UTF-8"?>
<uml:Model xmi:version="20131001" xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.eclipse.org/uml2/5.0.0/UML" xmi:id="_m" name="Zoo">
  <packagedElement xmi:type="uml:Class" xmi:id="_a" name="Animal" isAbstract="true"/>
  <packagedElement xmi:type="uml:Class" xmi:id="_d" name="Dog"><generalization xmi:id="_g" general="_a"/></packagedElement>
</uml:Model>`;
  const pp = importXmi(papyrus);
  const diagrams = M.allDiagrams(pp);
  assert.equal(diagrams.length, 1, 'a class diagram is made');
  const [animal, dog] = ['Animal', 'Dog'].map((n) => diagrams[0].ownedViews.find((v) => M.findById(pp, v.model)?.name === n));
  assert.ok(animal.top < dog.top, 'laid out: the general class above');
});

// ───────────────────────── code engineering

test('EA code engineering: generation for Java, C#, C++, Python, TypeScript, Kotlin, PHP and SQL DDL', () => {
  assert.deepEqual(CODE_LANGUAGES.map((l) => l.id), ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php', 'sql']);
  const project = buildSample('en');
  for (const { id } of CODE_LANGUAGES) {
    const files = generateCode(project, null, id);
    assert.ok(files.length > 0 && files.every((f) => f.path && typeof f.content === 'string' && f.content.length > 0), id);
  }
});

for (const language of ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php']) {
  test(`EA code engineering: reverse engineering of ${language} source into classes, attributes, operations and relationships (round trip of the sample)`, () => {
    const project = buildSample('en');
    const files = generateCode(project, null, language).map((f) => ({ name: f.path, content: f.content }));
    const { elements, warnings } = reverseEngineer(files, language);
    assert.deepEqual(warnings.filter((w) => w.code === 'reverse.parseError'), [], 'parses');
    const back = M.createProject({ diagram: null });
    for (const e of elements) M.insertElement(back.ownedElements[0], e);
    const generated = new Set(files.map((f) => path.basename(f.name).replace(/\.\w+$/, '')));
    const classes = M.elementsWhere(back, (e) => ['UMLClass', 'UMLInterface', 'UMLEnumeration'].includes(e._type)).map((e) => e.name);
    assert.deepEqual([...generated].filter((n) => !classes.includes(n)), [], 'every generated type is read back');
    assert.ok(M.elementsWhere(back, (e) => e._type === 'UMLGeneralization').length > 0, 'generalizations');
    assert.ok(M.elementsWhere(back, (e) => e._type === 'UMLOperation').length > 0, 'operations');
  });
}

test('EA code engineering: reverse engineering of SQL DDL into an ER model', () => {
  assert.ok(REVERSE_LANGUAGES.some((l) => l.id === 'sql'));
  const project = buildSample('en');
  const ddl = generateCode(project, null, 'sql', { dialect: 'postgres' });
  const { elements } = reverseEngineer(ddl.map((f) => ({ name: f.path, content: f.content })), 'sql');
  const back = M.createProject({ diagram: null });
  for (const e of elements) M.insertElement(back, e);
  const before = M.elementsWhere(project, (e) => e._type === 'ERDEntity').map((e) => e.name).sort();
  assert.deepEqual(M.elementsWhere(back, (e) => e._type === 'ERDEntity').map((e) => e.name).sort(), before);
  assert.ok(M.elementsWhere(back, (e) => e._type === 'ERDRelationship').length > 0, 'foreign keys');
});

test('EA code engineering: reverse engineering of Kotlin source', () => {
  const kotlin = REVERSE_LANGUAGES.find((l) => l.id === 'kotlin');
  assert.ok(kotlin);
  assert.deepEqual(kotlin.exts, ['kt', 'kts']);
  const src = 'package shop\n\ninterface Priced { fun price(): Double }\n\nopen class Item(val name: String) : Priced {\n    override fun price(): Double = 1.0\n    companion object { const val MAX = 3 }\n}\n\nclass Book(name: String, var pages: Int = 0) : Item(name)\n';
  const { elements, warnings } = reverseEngineer([{ name: 'shop/Item.kt', content: src }], 'kotlin');
  assert.deepEqual(warnings, []);
  const back = M.createProject({ diagram: null });
  for (const e of elements) M.insertElement(back.ownedElements[0], e);
  const named = (n) => M.elementsWhere(back, (e) => e.name === n && ['UMLClass', 'UMLInterface'].includes(e._type))[0];
  assert.equal(named('Priced')._type, 'UMLInterface');
  assert.deepEqual(named('Item').attributes.map((a) => [a.name, a.isStatic]), [['name', false], ['MAX', true]]);
  assert.equal(M.elementsWhere(back, (e) => e._type === 'UMLGeneralization').length, 1, 'Book → Item');
  assert.equal(M.elementsWhere(back, (e) => e._type === 'UMLInterfaceRealization').length, 1, 'Item → Priced');
});

test('EA code engineering: reverse engineering of PHP source', () => {
  const php = REVERSE_LANGUAGES.find((l) => l.id === 'php');
  assert.ok(php);
  assert.deepEqual(php.exts, ['php']);
  const src = '<?php\nnamespace Shop;\n\ninterface Priced { public function price(): float; }\n\nclass Item implements Priced\n{\n    const MAX = 3;\n    public function __construct(protected string $name) {}\n    public function price(): float { return 1.0; }\n}\n\nfinal class Book extends Item\n{\n    /** @var Item[] */\n    private array $related = [];\n}\n';
  const { elements, warnings } = reverseEngineer([{ name: 'Shop/Item.php', content: src }], 'php');
  assert.deepEqual(warnings, []);
  const back = M.createProject({ diagram: null });
  for (const e of elements) M.insertElement(back.ownedElements[0], e);
  const named = (n) => M.elementsWhere(back, (e) => e.name === n && ['UMLClass', 'UMLInterface'].includes(e._type))[0];
  assert.equal(named('Priced')._type, 'UMLInterface');
  assert.deepEqual(named('Item').attributes.map((a) => [a.name, a.isStatic, a.visibility]), [['MAX', true, 'public'], ['name', false, 'protected']]);
  assert.equal(M.elementsWhere(back, (e) => e._type === 'UMLGeneralization').length, 1, 'Book → Item');
  assert.equal(M.elementsWhere(back, (e) => e._type === 'UMLInterfaceRealization').length, 1, 'Item → Priced');
  assert.equal(M.elementsWhere(back, (e) => e._type === 'UMLAssociation' && e.end2.name === 'related' && e.end2.multiplicity === '*').length, 1, '@var Item[]');
});

// ───────────────────────── repository, search

test('EA DBMS repository (domain side): SQLite / MariaDB / MySQL / PostgreSQL settings, connection checks, and the project text that is stored and read back', () => {
  assert.deepEqual(DB_KINDS, ['none', 'sqlite', 'mariadb', 'mysql', 'postgres']);
  const server = normalizeSettings({ dbKind: 'postgres', dbHost: 'db.local', dbName: 'models', dbUser: 'ea' });
  assert.deepEqual(dbProblems(server), []);
  assert.deepEqual(dbConfig(server, 'pw'), { kind: 'postgres', host: 'db.local', port: 5432, database: 'models', user: 'ea', password: 'pw', file: null });
  assert.equal(dbDescribe(server), 'PostgreSQL · ea@db.local:5432/models');
  assert.deepEqual(dbProblems(normalizeSettings({ dbKind: 'sqlite' })), ['db.needFile']);
  assert.ok(dbProblems(normalizeSettings({ dbKind: 'mysql', dbName: 'bad name' })).includes('db.badName'));
  // What goes into the database is the project file text: everything comes back, baselines included.
  const project = sample();
  addBaseline(project, createBaseline(project, { name: 'B' }));
  const back = parseProject(serialize(project)).project;
  assert.equal(M.allDiagrams(back).length, M.allDiagrams(project).length);
  assert.equal(M.elementsWhere(back, () => true).length, M.elementsWhere(project, () => true).length);
  assert.equal(listBaselines(back).length, 1);
});

test('EA model search: by name, documentation, type, requirement id / text, whole word and match case', () => {
  const { project, range, battery } = requirementsProject();
  battery.documentation = 'Stores energy for the drive';
  assert.deepEqual(M.findElements(project, 'REQ-001').map((e) => e._id), [range._id]);
  assert.deepEqual(M.findElements(project, '500 km').map((e) => e._id), [range._id], 'requirement text');
  assert.ok(M.findElements(project, 'energy').includes(battery), 'documentation');
  assert.ok(!M.findElements(project, 'energy', { documentation: false }).includes(battery));
  assert.ok(M.findElements(project, 'battery').includes(battery));
  assert.ok(!M.findElements(project, 'battery', { matchCase: true }).includes(battery), 'match case');
  assert.ok(!M.findElements(project, 'Batt', { whole: true }).includes(battery), 'whole word');
  assert.deepEqual(M.findElements(project, 'a', { types: ['SysMLBlock'] }).map((e) => e._type).filter((t) => t !== 'SysMLBlock'), [], 'restricted to a type');
  assert.ok(typeDef('SysMLRequirement'));
});

test('EA HTML report: the whole model as one web page with diagrams, element pages and working links', () => {
  const report = buildReport(sample(), { template: 'full', language: 'ko' });
  const html = reportHtml(report, { renderDiagram: (d) => `<svg data-d="${d._id}"></svg>` });
  assert.match(html, /^<!doctype html>/);
  assert.ok((html.match(/<svg data-d=/g) ?? []).length >= 5, 'diagram pictures');
  assert.match(html, /목차|Contents/);
});

test('EA layer colours match the ArchiMate 3.1 specification palette', () => {
  assert.equal(LAYER_OF.business.fill, '#ffffb5');
  assert.equal(LAYER_OF.application.fill, '#b5ffff');
  assert.equal(LAYER_OF.technology.fill, '#c9e7b7');
  assert.equal(LAYER_OF.motivation.fill, '#ccccff');
  assert.equal(LAYER_OF.strategy.fill, '#f5deaa');
  assert.equal(LAYER_OF.implementation.fill, '#ffe0e0');
  const plan = buildSample('en');
  const am = M.allDiagrams(plan).find((d) => d._type === 'ArchiMateDiagram');
  layoutDiagram(createRenderContext({ project: plan, diagram: am }));
  renderClean(plan, am);
});

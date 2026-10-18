// Model validation: every rule fires on a project built to break it, a clean
// project passes, and each problem carries its rule, severity, element id and
// a Korean and English message.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { importMdj } from '../../src/domain/interop/staruml.js';
import { importMermaid } from '../../src/domain/interop/mermaid.js';
import { RULES, summarize, validMultiplicity, validate } from '../../src/domain/validate.js';
import * as M from '../../src/domain/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A project whose model breaks every rule once (or more). */
function broken() {
  const project = M.createProject({ diagram: null });
  const model = project.ownedElements[0];
  const add = (owner, type, attrs = {}) => M.insertElement(owner, M.createElement(type, attrs, { siblings: M.siblingsIn(owner, type) }));
  const nameless = add(model, 'UMLClass', { name: '' });
  add(model, 'UMLClass', { name: 'Twin' });
  add(model, 'UMLClass', { name: 'Twin' });
  const a = add(model, 'UMLClass', { name: 'A' });
  const b = add(model, 'UMLClass', { name: 'B' });
  add(a, 'UMLGeneralization', { source: M.ref(a), target: M.ref(b) });
  add(b, 'UMLGeneralization', { source: M.ref(b), target: M.ref(a) });
  const iface = add(model, 'UMLInterface', { name: 'IFace' });
  add(iface, 'UMLAttribute', { name: 'x', type: 'int' });
  add(iface, 'UMLAttribute', { name: 'K', type: 'int', isStatic: true });
  add(a, 'UMLGeneralization', { source: M.ref(a), target: M.ref(iface) });
  const concrete = add(model, 'UMLClass', { name: 'Concrete' });
  add(concrete, 'UMLOperation', { name: 'run', isAbstract: true });
  add(concrete, 'UMLInterfaceRealization', { source: M.ref(concrete), target: M.ref(b) });
  add(model, 'UMLAssociation', { end1: { reference: M.ref(a) }, end2: { multiplicity: '1..' } });
  add(model, 'UMLDependency', { source: M.ref(a), target: { $ref: 'GONE' } });
  add(a, 'UMLAttribute', { name: 'bad', multiplicity: '3..1' });
  add(a, 'UMLAttribute', { name: 'worse', multiplicity: 'many' });
  add(model, 'UMLEnumeration', { name: 'Empty' });
  // Interaction.
  const collab = add(model, 'UMLCollaboration', { name: 'C' });
  const interaction = add(collab, 'UMLInteraction', { name: 'I' });
  const lifeline = add(interaction, 'UMLLifeline', { name: 'l' });
  add(interaction, 'UMLMessage', { name: 'new', source: M.ref(lifeline), target: M.ref(lifeline), messageSort: 'createMessage' });
  // State machines.
  const sm = add(model, 'UMLStateMachine', { name: 'SM' });
  const s1 = add(sm, 'UMLState', { name: 'S1' });
  const fin = add(sm, 'UMLFinalState', {});
  add(sm, 'UMLTransition', { source: M.ref(fin), target: M.ref(s1) });
  const sm2 = add(model, 'UMLStateMachine', { name: 'SM2' });
  add(sm2, 'UMLPseudostate', { kind: 'initial' });
  add(sm2, 'UMLPseudostate', { kind: 'initial' });
  // Activity.
  const activity = add(model, 'UMLActivity', { name: 'Act' });
  const decision = add(activity, 'UMLDecisionNode', {});
  const action = add(activity, 'UMLAction', { name: 'Do' });
  add(activity, 'UMLControlFlow', { source: M.ref(decision), target: M.ref(action) });
  // ERD.
  const data = M.insertElement(project, M.createElement('ERDDataModel', { name: 'Data' }));
  const entity = add(data, 'ERDEntity', { name: 'T' });
  add(entity, 'ERDColumn', { name: 'other_id', foreignKey: true });
  // Requirements: approved but neither satisfied nor verified, and one id twice.
  add(model, 'SysMLRequirement', { name: 'Fast', id: 'REQ-1', status: 'approved' });
  add(model, 'SysMLRequirement', { name: 'Safe', id: 'REQ-1' });
  // Diagram without views, and a view pointing nowhere.
  M.addDiagram(project, model._id, 'UMLClassDiagram', { name: 'Empty' });
  const d = M.addDiagram(project, model._id, 'UMLClassDiagram', { name: 'Ghost' });
  M.addView(d, M.createNodeView('UMLClassView', 'NOWHERE', { x: 0, y: 0 }));
  return { project, ids: { nameless, iface, concrete, lifeline, fin, entity, decision } };
}

test('rules: ids are unique, severities known, messages bilingual', () => {
  assert.ok(RULES.length >= 21);
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  for (const rule of RULES) {
    assert.ok(['error', 'warning'].includes(rule.severity), rule.id);
    assert.ok(rule.ko && rule.en, rule.id);
  }
});

test('multiplicity syntax', () => {
  for (const ok of ['', '1', '0..1', '*', '0..*', '2..5', '10']) assert.ok(validMultiplicity(ok), ok);
  for (const bad of ['1..', '..2', 'many', '3..1', '-1', '1..2..3']) assert.equal(validMultiplicity(bad), false, bad);
});

test('every rule fires on a project built to break it', () => {
  const { project, ids } = broken();
  const problems = validate(project);
  const fired = new Set(problems.map((p) => p.rule));
  for (const rule of RULES) assert.ok(fired.has(rule.id), `rule ${rule.id} did not fire`);
  const of = (rule) => problems.filter((p) => p.rule === rule);
  assert.ok(of('name-missing').some((p) => p.id === ids.nameless._id));
  assert.equal(of('name-duplicate').length, 1);
  assert.equal(of('generalization-cycle').length, 1, 'one report per cycle');
  assert.match(of('generalization-cycle')[0].message.en, /A → B → A|B → A → B/);
  assert.equal(of('interface-attribute-not-static').length, 1, 'static attribute is fine');
  assert.equal(of('multiplicity-invalid').length, 3);
  assert.ok(of('final-state-outgoing').some((p) => p.id === ids.fin._id));
  assert.ok(of('decision-few-outgoing').some((p) => p.id === ids.decision._id));
  assert.equal(of('region-no-initial').length, 1);
  assert.equal(of('region-multiple-initial').length, 1);
  assert.ok(of('broken-ref').some((p) => p.message.en.includes('GONE')));
  assert.ok(of('broken-ref').some((p) => p.message.en.includes('NOWHERE')));
  for (const p of problems) {
    assert.equal(p.severity, RULES.find((r) => r.id === p.rule).severity);
    assert.ok(p.message.ko && p.message.en);
    assert.ok(p.id === null || typeof p.id === 'string');
  }
  const counts = summarize(problems);
  assert.equal(counts.error + counts.warning, problems.length);
  assert.ok(counts.error > 0 && counts.warning > 0);
});

test('clean projects have no errors', () => {
  const sample = importMdj(fs.readFileSync(path.join(root, 'samples', 'staruml-sample.mdj'), 'utf8'));
  assert.deepEqual(validate(sample), []);
  for (const source of [
    'classDiagram\n Animal <|-- Duck\n class Duck {\n +swim() void\n }',
    'sequenceDiagram\n A->>B: hi\n B-->>A: ok',
    'flowchart TD\n a[x] --> b{y}\n b -->|1| c[z]\n b -->|2| a',
    'stateDiagram-v2\n [*] --> A\n A --> [*]',
    'erDiagram\n A ||--o{ B : has\n A {\n int id PK\n }\n B {\n int id PK\n int a_id FK\n }',
  ]) {
    const result = importMermaid(source);
    const project = M.createProject({ diagram: null });
    M.insertElement(M.canContain(project.ownedElements[0], result.owner._type) ? project.ownedElements[0] : project, result.owner);
    const errors = validate(project).filter((p) => p.severity === 'error');
    assert.deepEqual(errors, [], source);
  }
});

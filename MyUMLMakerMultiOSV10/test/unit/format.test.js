// The .myuml / .mumlt file format and the open project document: saving and
// reading back, StarUML projects, refusals, repairs of damaged files, undo and
// redo, dirty tracking, working diagrams, and the file-name helpers; plus the
// templates and the sample project.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Fm from '../../src/domain/format.js';
import * as M from '../../src/domain/model.js';
import { ProjectDocument } from '../../src/domain/document.js';
import { buildSample, buildTemplate, SAMPLE_FILES, TEMPLATES } from '../../src/domain/templates.js';
import { validate } from '../../src/domain/validate.js';
import { DIAGRAM_TYPES } from '../../src/domain/meta.js';

const failsWith = (fn, code) => assert.throws(fn, (error) => error instanceof Fm.FormatError && error.code === code, code);

test('serialize / parseProject round trip keeps the project', () => {
  const project = buildSample('ko');
  const text = Fm.serialize(project);
  const data = JSON.parse(text);
  assert.deepEqual([data.format, data.version, data.kind], ['myumlmaker', 1, 'project']);
  const { project: back, template, starUml } = Fm.parseProject(text);
  assert.deepEqual([template, starUml], [false, false]);
  assert.deepEqual(back, JSON.parse(JSON.stringify(project)));
  assert.equal(Fm.parseProject(Fm.serialize(project, { template: true })).template, true);
});

test('a bare StarUML project is read as a project', () => {
  const project = M.createProject({ name: 'Star' });
  const { project: back, starUml } = Fm.parseProject(JSON.stringify(project));
  assert.equal(starUml, true);
  assert.equal(back.name, 'Star');
});

test('what is not a project is refused', () => {
  failsWith(() => Fm.parseProject('{nope'), 'format.notJson');
  failsWith(() => Fm.parseProject('{"format":"other"}'), 'format.notProject');
  failsWith(() => Fm.parseProject(JSON.stringify({ format: 'myumlmaker', version: 99, project: { _type: 'Project' } })), 'format.newer');
  failsWith(() => Fm.parseProject(JSON.stringify({ format: 'myumlmaker', version: 1, project: { _type: 'Model' } })), 'format.notProject');
});

test('damaged projects are repaired', () => {
  const project = M.createProject({ name: 'R' });
  const model = project.ownedElements[0];
  const a = M.addElement(project, model._id, 'UMLClass');
  const b = M.addElement(project, model._id, 'UMLClass');
  b._id = a._id; // duplicate id
  const diagram = M.allDiagrams(project)[0];
  diagram.ownedViews.push({ _type: 'UMLClassView', _id: 'v1', model: { $ref: 'missing' }, left: 'x', top: 0, width: 0, height: 0 });
  const v2 = M.showElement(project, diagram, a._id, { x: 0, y: 0 });
  diagram.ownedViews.push({ _type: 'UMLAssociationView', _id: 'e1', tail: { $ref: v2._id }, head: { $ref: 'gone' }, points: [{ x: 1, y: 'b' }] });
  const assoc = { _type: 'UMLAssociation', _id: 'as1', name: '' };
  model.ownedElements.push(assoc, null, 'junk');
  const { project: fixed } = Fm.parseProject(JSON.stringify(project));
  const ids = new Set();
  M.walk(fixed, (e) => { assert.ok(!ids.has(e._id), `unique id ${e._id}`); ids.add(e._id); }, { views: true });
  const d = M.allDiagrams(fixed)[0];
  assert.equal(d.ownedViews.length, 1, 'views of missing elements and dangling lines are dropped');
  const as = M.findById(fixed, 'as1');
  assert.ok(as.end1 && as.end2, 'association ends are added');
  assert.equal(fixed.ownedElements[0].ownedElements.filter((x) => x === null || typeof x !== 'object').length, 0);
});

test('the project document: undo, redo, dirty, working diagrams', () => {
  const project = buildTemplate('classModel', { language: 'en' });
  const doc = new ProjectDocument(project, { name: 'x' });
  assert.equal(doc.dirty, false);
  assert.ok(doc.diagram, 'the default diagram is open');
  const id = doc.apply('rename', (p) => { p.name = 'Renamed'; return p._id; });
  assert.equal(id, project._id);
  assert.equal(doc.dirty, true);
  assert.equal(doc.history.undoLabel, 'rename');
  doc.apply('nothing', () => {});
  assert.equal(doc.history.undoStack.length, 1, 'no change, no undo step');
  assert.equal(doc.undo(), 'rename');
  assert.equal(doc.project.name, 'New Project');
  assert.equal(doc.dirty, false);
  doc.redo();
  assert.equal(doc.project.name, 'Renamed');
  const second = doc.apply('add', (p) => M.addDiagram(p, p.ownedElements[0]._id, 'UMLUseCaseDiagram'));
  doc.openDiagram(second._id);
  assert.deepEqual(doc.view.open.length, 2);
  assert.equal(doc.diagram._id, second._id);
  doc.closeDiagram(second._id);
  assert.equal(doc.view.open.length, 1);
  doc.markSaved('C:/p.myuml');
  assert.equal(doc.dirty, false);
  assert.ok(doc.text().includes('"format": "myumlmaker"'));
  assert.ok(doc.index.get(doc.project._id), 'the index finds elements');
});

test('every template builds, validates and survives a round trip', () => {
  for (const [id, type] of TEMPLATES) {
    for (const language of ['ko', 'en']) {
      const project = buildTemplate(id, { language });
      const diagrams = M.allDiagrams(project);
      assert.equal(diagrams[0]._type, type, id);
      if (id !== 'blank') {
        assert.ok(diagrams[0].ownedViews.length > 1, `${id} has content`);
        assert.deepEqual(validate(project).filter((x) => x.severity === 'error'), [], `${id} ${language} is valid`);
      }
      assert.deepEqual(Fm.parseProject(Fm.serialize(project)).project, JSON.parse(JSON.stringify(project)));
    }
  }
});

test('the sample project covers many kinds of diagrams and is valid', () => {
  for (const language of ['ko', 'en']) {
    const project = buildSample(language);
    const kinds = new Set(M.allDiagrams(project).map((d) => d._type));
    // One finished diagram of every kind the program draws.
    assert.deepEqual([...kinds].sort(), Object.keys(DIAGRAM_TYPES).sort(), 'a diagram of every kind');
    assert.deepEqual(validate(project), [], 'no problems');
  }
  assert.ok(SAMPLE_FILES.length >= 2);
});

test('file name helpers', () => {
  assert.equal(Fm.baseName('C:\\a\\b\\shop.myuml'), 'shop.myuml');
  assert.equal(Fm.directoryOf('C:/a/b/shop.myuml'), 'C:/a/b');
  assert.equal(Fm.withExtension('C:/a/shop.mdj', 'myuml'), 'C:/a/shop.myuml');
  assert.ok(Fm.isOpenableFileName('x.myuml') && Fm.isOpenableFileName('x.MDJ') && !Fm.isOpenableFileName('x.mfj'));
  assert.ok(Fm.isFragmentFileName('a.mfj') && Fm.isSourceFileName('A.java') && Fm.isTextModelFileName('d.puml'));
  assert.ok(Fm.isTemplateFileName('t.mumlt'));
});

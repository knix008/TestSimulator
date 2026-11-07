// The 40 sample projects of the start page: complete in both languages, valid, every
// diagram drawn cleanly and readably (no overlapping nodes, no line through an unrelated
// node), every kind of diagram covered, and they survive saving, StarUML export, generating
// documents; the installed files in samples/ match them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as M from '../../src/domain/model.js';
import { DIAGRAM_TYPES } from '../../src/domain/meta.js';
import { buildSampleProject, SAMPLE_GROUPS, SAMPLE_PROJECTS, sampleFileName } from '../../src/domain/samples/index.js';
import { parseProject, serialize } from '../../src/domain/format.js';
import { validate } from '../../src/domain/validate.js';
import { exportMdj, importMdj } from '../../src/domain/interop/staruml.js';
import { createRenderContext, layoutDiagram, renderDiagramSvg } from '../../src/render/notation.js';
import { hasIcon } from '../../src/icons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANGUAGES = ['ko', 'en'];
const built = new Map();
const build = (sample, language) => {
  const key = `${sample.id}.${language}`;
  if (!built.has(key)) built.set(key, sample.build(language));
  return built.get(key);
};
const eachProject = (run) => { for (const sample of SAMPLE_PROJECTS) for (const language of LANGUAGES) run(sample, language, build(sample, language)); };
const viewsOf = (diagram) => diagram.ownedViews ?? [];
const isEdge = (view) => Boolean(view.tail && view.head);

test('there are 40 samples in eight groups of five, with ids, icons and texts in both languages', () => {
  assert.equal(SAMPLE_PROJECTS.length, 40);
  assert.equal(SAMPLE_GROUPS.length, 8);
  assert.equal(new Set(SAMPLE_PROJECTS.map((s) => s.id)).size, 40, 'ids are unique');
  for (const group of SAMPLE_GROUPS) {
    assert.ok(group.ko && group.en && hasIcon(group.icon), `group ${group.id}`);
    assert.equal(SAMPLE_PROJECTS.filter((s) => s.group === group.id).length, 5, `five samples in ${group.id}`);
  }
  for (const sample of SAMPLE_PROJECTS) {
    assert.ok(hasIcon(sample.icon), `${sample.id}: icon ${sample.icon}`);
    assert.match(sample.id, /^[a-z][a-z0-9-]+$/, 'an id usable in a file name');
    for (const language of LANGUAGES) {
      const [title, description] = sample[language];
      assert.ok(title && description, `${sample.id}: title and description (${language})`);
      assert.ok(!`${title}${description}`.includes('|'), `${sample.id}: split text (${language})`);
    }
    assert.notEqual(sample.ko[0], sample.en[0], `${sample.id}: title is translated`);
    assert.match(sample.ko[0], /[가-힣]/, `${sample.id}: Korean title`);
    assert.doesNotMatch(sample.en[0], /[가-힣]/, `${sample.id}: English title`);
  }
  assert.equal(new Set(SAMPLE_PROJECTS.map((s) => s.ko[0])).size, 40, 'Korean titles differ');
  assert.equal(new Set(SAMPLE_PROJECTS.map((s) => s.en[0])).size, 40, 'English titles differ');
});

test('buildSampleProject builds by id, and gives nothing for an unknown id', () => {
  assert.equal(buildSampleProject('nope', 'ko'), null);
  assert.equal(buildSampleProject('library', 'en').name, 'Library Management');
  assert.equal(buildSampleProject('library', 'ko').name, '도서관 관리');
});

test('every project has its name, a description and at least two diagrams with drawings', () => {
  eachProject((sample, language, project) => {
    assert.equal(project.name, sample[language][0], `${sample.id}: project name is the tile's title`);
    assert.ok(project.documentation, `${sample.id}: description`);
    const diagrams = M.allDiagrams(project);
    assert.ok(diagrams.length >= 2, `${sample.id}: ${diagrams.length} diagrams`);
    for (const diagram of diagrams) {
      assert.ok(diagram.name, `${sample.id}: diagram has a name`);
      assert.ok(viewsOf(diagram).length >= 2, `${sample.id}/${diagram.name}: has content`);
    }
    assert.equal(new Set(diagrams.map((d) => d.name)).size, diagrams.length, `${sample.id}: diagram names differ`);
  });
});

test('no raw two-language text is left in a project, and the languages really differ', () => {
  const texts = (value, out = []) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((item) => texts(item, out));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) if (key !== 'pattern' && key !== 'expression') texts(item, out);
    return out;
  };
  eachProject((sample, language, project) => {
    for (const text of texts(project)) assert.ok(!/[가-힣][^|]*\|[A-Za-z]/.test(text), `${sample.id} (${language}): untranslated "${text}"`);
    if (language === 'en') assert.deepEqual(texts(project).filter((text) => /[가-힣]/.test(text)), [], `${sample.id}: Korean text in the English project`);
  });
});

test('every kind of diagram appears, also without the Online Shop', () => {
  const kinds = new Set(SAMPLE_PROJECTS.filter((s) => s.id !== 'online-shop').flatMap((s) => M.allDiagrams(build(s, 'ko')).map((d) => d._type)));
  assert.deepEqual(Object.keys(DIAGRAM_TYPES).filter((type) => !kinds.has(type)), []);
});

test('every sample passes validation with no problems', () => {
  eachProject((sample, language, project) => assert.deepEqual(validate(project).map((p) => p.message?.en ?? p.rule), [], `${sample.id} (${language})`));
});

test('every diagram renders without errors or broken numbers', () => {
  eachProject((sample, language, project) => {
    for (const diagram of M.allDiagrams(project)) {
      const errors = [];
      const { svg, width, height } = renderDiagramSvg(project, diagram, { language, onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
      assert.deepEqual(errors, [], `${sample.id}/${diagram.name}`);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${sample.id}/${diagram.name}: broken values in the drawing`);
      assert.ok(width > 100 && height > 60 && width < 3000 && height < 3000, `${sample.id}/${diagram.name}: ${width}×${height}`);
    }
  });
});

// Shapes that are meant to overlap others: bands, ports on their owners, frames.
const OVERLAP_OK = /Lifeline|Fragment|Port|ConstraintParameter|Lane|Stage|Release|Partition|Timeline|Frame/;
const NOT_OBSTACLES = /Lifeline|Fragment|Stage|Lane|Release|Partition|Frame|Participant|Subject|Boundary|Group|Network|Calendar|Timeline/;

test('no node partly covers another, and no node leaves the drawing to the left or above', () => {
  eachProject((sample, language, project) => {
    if (sample.id === 'online-shop') return; // drawn by hand, checked by its own tests
    for (const diagram of M.allDiagrams(project)) {
      const ctx = createRenderContext({ project, diagram, language });
      layoutDiagram(ctx);
      const views = viewsOf(diagram).filter((v) => !isEdge(v) && ctx.boxes.get(v._id));
      for (let i = 0; i < views.length; i += 1) {
        const a = ctx.boxes.get(views[i]._id);
        assert.ok(a.x >= -1 && a.y >= -1, `${sample.id}/${diagram.name}: ${views[i]._type} at ${a.x},${a.y}`);
        for (let j = i + 1; j < views.length; j += 1) {
          if (OVERLAP_OK.test(views[i]._type) || OVERLAP_OK.test(views[j]._type)) continue;
          const b = ctx.boxes.get(views[j]._id);
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          const nested = (a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h) || (b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h);
          assert.ok(!overlap || nested, `${sample.id}/${diagram.name}: ${views[i]._type} and ${views[j]._type} overlap (${language})`);
        }
      }
    }
  });
});

test('no line runs through a node it does not belong to', () => {
  eachProject((sample, language, project) => {
    for (const diagram of M.allDiagrams(project)) {
      if (diagram._type === 'GanttDiagram') continue; // dependencies step down through the rows by design
      const ctx = createRenderContext({ project, diagram, language });
      layoutDiagram(ctx);
      const nodes = viewsOf(diagram).filter((v) => !isEdge(v) && ctx.boxes.get(v._id) && !NOT_OBSTACLES.test(v._type));
      for (const edge of viewsOf(diagram).filter(isEdge)) {
        const route = ctx.routes.get(edge._id)?.points ?? [];
        const ends = [ctx.boxes.get(M.refId(edge.tail)), ctx.boxes.get(M.refId(edge.head))];
        for (const node of nodes) {
          if (node._id === M.refId(edge.tail) || node._id === M.refId(edge.head)) continue;
          const b = ctx.boxes.get(node._id);
          if (ends.some((q) => q && b.x <= q.x && b.y <= q.y && b.x + b.w >= q.x + q.w && b.y + b.h >= q.y + q.h)) continue;
          for (let i = 0; i + 1 < route.length; i += 1) {
            for (let t = 0; t <= 1; t += 0.02) {
              const x = route[i].x + (route[i + 1].x - route[i].x) * t;
              const y = route[i].y + (route[i + 1].y - route[i].y) * t;
              if (x > b.x + 2 && x < b.x + b.w - 2 && y > b.y + 2 && y < b.y + b.h - 2) assert.fail(`${sample.id}/${diagram.name} (${language}): a line runs through ${M.findById(project, M.refId(node.model))?.name ?? node._type}`);
            }
          }
        }
      }
    }
  });
});

test('every sample survives saving and opening again', () => {
  eachProject((sample, language, project) => {
    const { project: again } = parseProject(serialize(project));
    assert.deepEqual(again, JSON.parse(JSON.stringify(project)), `${sample.id} (${language})`);
  });
});

test('every sample survives a StarUML export and import', () => {
  for (const sample of SAMPLE_PROJECTS) {
    const project = build(sample, 'en');
    const imported = importMdj(exportMdj(project)).project ?? importMdj(exportMdj(project));
    assert.deepEqual(M.allDiagrams(imported).map((d) => d.name), M.allDiagrams(project).map((d) => d.name), sample.id);
  }
});

test('the files in samples/ exist and hold the same diagrams', () => {
  for (const sample of SAMPLE_PROJECTS) {
    for (const language of LANGUAGES) {
      const file = path.join(root, 'samples', sampleFileName(sample.id, language));
      assert.ok(fs.existsSync(file), `npm run samples has not written ${file}`);
      const { project } = parseProject(fs.readFileSync(file, 'utf8'));
      assert.equal(project.name, sample[language][0], file);
      assert.deepEqual(M.allDiagrams(project).map((d) => d.name), M.allDiagrams(build(sample, language)).map((d) => d.name), `${file} is out of date: npm run samples`);
      assert.deepEqual(validate(project), [], file);
    }
  }
});

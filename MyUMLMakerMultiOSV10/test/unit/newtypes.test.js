// The PlantUML / Enterprise Architect diagram kinds: Gantt chart, WBS, timeline,
// ArchiMate, network, JSON, YAML, EBNF and regex. Every tool of each toolbox
// draws, every relationship connects, the drawings render without errors or
// broken numbers, the sample project has a finished diagram of each, the
// parsers behind the data views work, and PlantUML text of each kind (plus
// Salt wireframes) comes in and goes back out.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import { DIAGRAM_TYPES, TYPES } from '../../src/domain/meta.js';
import { DIAGRAM_TABS, toolboxFor } from '../../src/domain/toolbox.js';
import { buildSample } from '../../src/domain/templates.js';
import { createRenderContext, layoutDiagram, nodeBox, renderDiagramSvg } from '../../src/render/notation.js';
import { exportMdj, importMdj } from '../../src/domain/interop/staruml.js';
import { exportPlantUmlMore, importPlantUmlMore } from '../../src/domain/interop/plantuml-more.js';
import { dataRows, parseEbnf, parseRegex, parseYaml, splitEbnfRules, toYaml } from '../../src/domain/datatext.js';
import { addWorkdays, closedTest, parseDate, schedule } from '../../src/domain/planning.js';
import { ARCHIMATE_KINDS, archimateKindOf, archimateMacro } from '../../src/domain/archimate.js';
import { parseProject, serialize } from '../../src/domain/format.js';
import { validate } from '../../src/domain/validate.js';
import { hasIcon } from '../../src/icons.js';
import { PLANTUML_MORE_EXAMPLES } from '../../src/domain/interop/plantuml-examples.js';

const NEW_TYPES = ['GanttDiagram', 'WBSDiagram', 'TimelineDiagram', 'ArchiMateDiagram', 'NetworkDiagram', 'JSONDiagram', 'YAMLDiagram', 'EBNFDiagram', 'RegexDiagram'];
const toolsOf = (type) => toolboxFor(type).flatMap(([, , , tools]) => tools);
const fresh = (type) => {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  return { project, diagram: M.addDiagram(project, project.ownedElements[0]._id, type, { language: 'en' }) };
};
const renderClean = (project, diagram, label) => {
  const errors = [];
  const { svg } = renderDiagramSvg(project, diagram, { onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
  assert.deepEqual(errors, [], `${label}: render errors`);
  assert.ok(!/NaN|undefined|Infinity/.test(svg), `${label}: no broken numbers or text in the drawing`);
  return svg;
};

/** Draws every node tool (twice), then every relationship tool between the first pair that accepts it. */
function drawEverything(type) {
  const { project, diagram } = fresh(type);
  const boxes = new Map();
  const failed = [];
  const nodes = [];
  let i = 0;
  for (const tool of toolsOf(type).filter((t) => t.kind !== 'edge').flatMap((t) => [t, t])) {
    const box = { x: (i % 6) * 320, y: Math.floor(i / 6) * 260, w: 0, h: 0 }; i += 1;
    const result = E.createNode(project, diagram, tool, box, { language: 'en', boxes });
    if (!result?.view) { if (!failed.includes(tool.en)) failed.push(tool.en); continue; }
    boxes.set(result.view._id, { ...box, w: tool.size?.w || 160, h: tool.size?.h || 90 });
    nodes.push(result.view);
  }
  const edgesFailed = [];
  for (const tool of toolsOf(type).filter((t) => t.kind === 'edge')) {
    let done = false;
    for (const a of nodes) {
      for (const b of nodes) {
        if (done || a === b || !E.canConnect(project, diagram, tool, a, b, M.buildIndex(project))) continue;
        if (E.createEdge(project, diagram, tool, a, b, { language: 'en' })?.view) done = true;
      }
      if (done) break;
    }
    if (!done) edgesFailed.push(tool.en);
  }
  return { project, diagram, failed, edgesFailed };
}

test('the new diagram kinds exist, with names, icons, a toolbox and a tab', () => {
  const inTabs = DIAGRAM_TABS.flatMap(([, , , types]) => types);
  for (const type of NEW_TYPES) {
    const def = DIAGRAM_TYPES[type];
    assert.ok(def && def.ko && def.en && hasIcon(def.icon), `${type}: names and icon`);
    assert.equal(inTabs.filter((t) => t === type).length, 1, `${type}: in one tab group`);
    assert.ok(toolsOf(type).some((t) => t.kind === 'node') && toolsOf(type).some((t) => t.kind === 'edge'), `${type}: elements and relationships`);
    for (const tool of toolsOf(type)) assert.ok(hasIcon(tool.icon), `${type}: icon ${tool.icon} of ${tool.en}`);
  }
  for (const [type, def] of Object.entries(TYPES)) if (/^(PM|Gantt|WBS|TL|ArchiMate|NW|DS|EBNF|Regex)/.test(type)) assert.ok(hasIcon(def.icon), `${type}: icon ${def.icon}`);
  // ArchiMate: every element of every layer has a tool, and all eleven relationships.
  const archimate = toolsOf('ArchiMateDiagram');
  for (const kind of ARCHIMATE_KINDS) assert.ok(archimate.some((t) => t.attrs?.kind === kind), `ArchiMate tool for ${kind}`);
  for (const name of ['Composition', 'Aggregation', 'Assignment', 'Realization', 'Serving', 'Access', 'Influence', 'Triggering', 'Flow', 'Specialization', 'Association']) assert.ok(archimate.some((t) => t.kind === 'edge' && t.en === name), `ArchiMate ${name}`);
  assert.ok(archimate.some((t) => t.type === 'ArchiMateGrouping') && archimate.some((t) => t.type === 'ArchiMateJunction'), 'grouping and junction');
});

for (const type of NEW_TYPES) {
  test(`${type}: every tool draws, every relationship connects, and the diagram renders`, () => {
    const { project, diagram, failed, edgesFailed } = drawEverything(type);
    assert.deepEqual(failed, [], `${type}: element tools that drew nothing`);
    assert.deepEqual(edgesFailed, [], `${type}: relationship tools that connected nothing`);
    renderClean(project, diagram, type);
    // Saved and opened again, and through StarUML's .mdj, the diagram is the same.
    const again = parseProject(serialize(project)).project;
    const back = M.allDiagrams(again).find((d) => d._type === type);
    assert.equal(back.ownedViews.length, diagram.ownedViews.length, `${type}: .myuml round trip`);
    const star = M.allDiagrams(importMdj(exportMdj(project))).find((d) => d._type === type);
    assert.equal(star.ownedViews.length, diagram.ownedViews.length, `${type}: .mdj round trip`);
    renderClean(importMdj(exportMdj(project)), star, `${type} (.mdj)`);
  });
}

test('the sample project has a finished diagram of each new kind', () => {
  for (const language of ['ko', 'en']) {
    const project = buildSample(language);
    for (const type of NEW_TYPES) {
      const diagrams = M.allDiagrams(project).filter((d) => d._type === type);
      assert.ok(diagrams.length, `${language}: ${type} sample`);
      for (const d of diagrams) {
        assert.ok(d.ownedViews.filter((v) => v.model).length >= 3, `${language}: ${d.name} has elements`);
        assert.ok(d.ownedViews.some((v) => M.isEdgeView(v)), `${language}: ${d.name} has relationships`);
        renderClean(project, d, `${language}: ${d.name}`);
        for (const theme of ['dark', 'blueprint', 'pastel']) assert.ok(!/NaN|undefined|Infinity/.test(renderDiagramSvg(project, d, { theme, language }).svg), `${language}: ${d.name} in the ${theme} theme`);
      }
    }
    const problems = validate(project).filter((p) => p.severity === 'error' && /^(gantt|data)-/.test(p.rule));
    assert.deepEqual(problems, [], `${language}: the new samples validate`);
  }
});

test('Gantt chart: working days, closed days, dependencies and bars on the calendar', () => {
  const closed = closedTest('saturday,sunday', '2026-03-04');
  const monday = parseDate('2026-03-02');
  assert.equal(addWorkdays(monday, 5, closed), parseDate('2026-03-10'), 'a holiday and a weekend are skipped');
  const plan = schedule([{ id: 'a', start: '2026-03-02', duration: 3 }, { id: 'b', duration: 2 }, { id: 'm', milestone: true }], [['a', 'b'], ['b', 'm']], { isClosed: closed });
  assert.equal(plan.at.get('b').start, parseDate('2026-03-06'), 'b starts when a ends (after the holiday)');
  assert.equal(plan.at.get('m').start, plan.at.get('b').end, 'the milestone is at b\'s end');
  const project = buildSample('en');
  const gantt = M.allDiagrams(project).find((d) => d._type === 'GanttDiagram');
  const ctx = layoutDiagram(createRenderContext({ project, diagram: gantt, language: 'en' }));
  const index = M.buildIndex(project);
  const deps = gantt.ownedViews.filter((v) => index.get(v.model)?._type === 'GanttDependency');
  assert.ok(deps.length >= 3, 'dependencies');
  for (const dep of deps) {
    const tail = nodeBox(ctx, gantt.ownedViews.find((v) => v._id === dep.tail.$ref));
    const head = nodeBox(ctx, gantt.ownedViews.find((v) => v._id === dep.head.$ref));
    assert.ok(head.x >= tail.x + tail.w - 9, 'a successor starts after its predecessor ends');
  }
});

test('JSON, YAML, EBNF and regular expressions are parsed', () => {
  const yaml = parseYaml('order:\n  id: 1001\n  paid: true\n  items:\n    - sku: BK-1\n      qty: 2\n    - sku: CF-9\n      qty: 1\n  note: "fast, please"\n  tags: [gift, express]\n# comment\nempty:\n');
  assert.ok(yaml.ok, yaml.error);
  assert.deepEqual(yaml.value, { order: { id: 1001, paid: true, items: [{ sku: 'BK-1', qty: 2 }, { sku: 'CF-9', qty: 1 }], note: 'fast, please', tags: ['gift', 'express'] }, empty: null });
  assert.deepEqual(parseYaml(toYaml(yaml.value)).value, yaml.value, 'YAML written and read back');
  assert.ok(dataRows(yaml.value).some((r) => r.key === 'sku' && r.value === 'BK-1' && r.depth === 3));
  const rules = splitEbnfRules('(* order id *) order id = "ORD-", digit, { digit } ;\ndigit = "0" | "1" | "2" ;');
  assert.deepEqual(rules.map((r) => r.name), ['order id', 'digit']);
  assert.deepEqual(parseEbnf(rules[0].expression), { t: 'seq', items: [{ t: 'term', text: 'ORD-' }, { t: 'nonterm', text: 'digit' }, { t: 'opt', item: { t: 'rep', item: { t: 'nonterm', text: 'digit' }, min: 1 } }] });
  assert.equal(parseEbnf('[ "-" ], ( "a" | "b" )').t, 'seq');
  assert.throws(() => parseEbnf('"a", ( "b"'), /expected \)/);
  const regex = parseRegex('^[A-Z]{2}-\\d{4}(?:-(x|y))?$');
  assert.equal(regex.t, 'seq');
  assert.deepEqual(regex.items[0], { t: 'special', text: 'start' });
  assert.equal(regex.items[1].t, 'rep');
  assert.equal(regex.items[1].label, '2 times');
  assert.throws(() => parseRegex('(ab'), /expected \)/);
  assert.equal(archimateKindOf('Business_Actor'), 'business-actor');
  assert.equal(archimateKindOf('technology-system-software'), 'technology-system-software');
  assert.equal(archimateKindOf('Implementation_WorkPackage'), 'implementation-work-package');
  assert.equal(archimateMacro('technology-system-software'), 'Technology_SystemSoftware');
});

// ───────────────────────── PlantUML

const PLANT = PLANTUML_MORE_EXAMPLES;
const KINDS = { gantt: 'GanttDiagram', wbs: 'WBSDiagram', chronology: 'TimelineDiagram', archimate: 'ArchiMateDiagram', nwdiag: 'NetworkDiagram', json: 'JSONDiagram', yaml: 'YAMLDiagram', ebnf: 'EBNFDiagram', regex: 'RegexDiagram', salt: 'WFWireframeDiagram' };

/** Puts an imported { owner, diagram } into a new project. */
function adopt(result) {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  M.insertElement(project, result.owner);
  assert.ok(M.canContain(project, result.owner._type), `${result.owner._type} may live in a project`);
  return project;
}
const modelsOf = (project, diagram) => { const index = M.buildIndex(project); return diagram.ownedViews.map((v) => index.get(v.model)).filter(Boolean); };

for (const [kind, text] of Object.entries(PLANT)) {
  test(`PlantUML ${kind}: imports, renders, exports and imports again`, () => {
    const result = importPlantUmlMore(text, { language: 'en' });
    assert.ok(result?.owner && result.diagram, `${kind}: imported`);
    assert.equal(result.diagram._type, KINDS[kind]);
    const project = adopt(result);
    const models = modelsOf(project, result.diagram);
    // A JSON, YAML or regex block is one document; the others are whole diagrams.
    assert.ok(models.length >= (['json', 'yaml', 'regex'].includes(kind) ? 1 : 3), `${kind}: elements (${models.length})`);
    renderClean(project, result.diagram, kind);
    const out = exportPlantUmlMore(project, result.diagram);
    assert.equal(typeof out, 'string', `${kind}: exported`);
    const again = importPlantUmlMore(out, { language: 'en' });
    assert.ok(again?.diagram, `${kind}: the export imports`);
    const project2 = adopt(again);
    const count = (list) => { const byType = {}; for (const m of list) byType[m._type] = (byType[m._type] ?? 0) + 1; return byType; };
    assert.deepEqual(count(modelsOf(project2, again.diagram)), count(models), `${kind}: the same elements after a round trip`);
  });
}

test('PlantUML details survive: Gantt dates, completion and resources; ArchiMate kinds and relationships; network addresses', () => {
  const gantt = importPlantUmlMore(PLANT.gantt, { language: 'en' });
  const tasks = M.elementsWhere(adopt(gantt), (e) => e._type === 'GanttTask');
  const backend = tasks.find((t) => t.name === 'Build backend');
  assert.equal(backend.duration, 10);
  assert.equal(backend.completion, 40);
  assert.match(backend.resources, /Alice/);
  assert.match(backend.resources, /Bob:50%/);
  const cal = M.elementsWhere(adopt(importPlantUmlMore(PLANT.gantt)), (e) => e._type === 'GanttCalendar')[0];
  assert.equal(cal.start, '2026-09-01');
  assert.match(cal.closedDays, /saturday/);
  assert.match(cal.closedDates, /2026-09-10/);
  const am = adopt(importPlantUmlMore(PLANT.archimate));
  const kinds = M.elementsWhere(am, (e) => e._type === 'ArchiMateElement').map((e) => e.kind);
  for (const kind of ['business-actor', 'business-process', 'business-service', 'application-component', 'technology-node', 'motivation-goal', 'business-role']) assert.ok(kinds.includes(kind), kind);
  for (const type of ['ArchiMateServing', 'ArchiMateRealization', 'ArchiMateAssignment', 'ArchiMateInfluence', 'ArchiMateTriggering']) assert.ok(M.elementsWhere(am, (e) => e._type === type).length, type);
  assert.equal(M.elementsWhere(am, (e) => e._type === 'ArchiMateGrouping').length, 1);
  const nw = adopt(importPlantUmlMore(PLANT.nwdiag));
  assert.deepEqual(M.elementsWhere(nw, (e) => e._type === 'NWNetwork').map((e) => [e.name, e.address]), [['dmz', '210.10.0.0/24'], ['internal', '172.16.0.0/24']]);
  assert.ok(M.elementsWhere(nw, (e) => e._type === 'NWConnection' && e.address === '172.16.0.50').length);
  assert.equal(M.elementsWhere(nw, (e) => e._type === 'NWNode' && e.name === 'db01')[0].device, 'database');
  assert.equal(importPlantUmlMore('@startuml\nclass A\n@enduml'), null, 'other PlantUML is left to plantuml.js');
  const salt = adopt(importPlantUmlMore(PLANT.salt));
  const widgets = M.elementsWhere(salt, (e) => /^WF/.test(e._type)).map((e) => e._type);
  for (const type of ['WFText', 'WFInput', 'WFCheckbox', 'WFDropdown', 'WFRadio', 'WFButton']) assert.ok(widgets.includes(type), `salt: ${type}`);
});

test('the sample diagrams of the new kinds export to PlantUML and come back', () => {
  const project = buildSample('en');
  for (const type of NEW_TYPES) {
    const diagram = M.allDiagrams(project).find((d) => d._type === type);
    const text = exportPlantUmlMore(project, diagram);
    assert.equal(typeof text, 'string', `${type}: exported`);
    const back = importPlantUmlMore(text, { language: 'en' });
    assert.equal(back?.diagram?._type, type, `${type}: imported again`);
    const p2 = adopt(back);
    renderClean(p2, back.diagram, `${type} (PlantUML round trip)`);
    const before = modelsOf(project, diagram).filter((m) => !TYPES[m._type]?.edge).length;
    const after = modelsOf(p2, back.diagram).filter((m) => !TYPES[m._type]?.edge).length;
    assert.ok(after >= before - 1, `${type}: elements kept (${before} → ${after})`);
  }
  const wireframe = M.allDiagrams(project).find((d) => d._type === 'WFWireframeDiagram');
  const salt = exportPlantUmlMore(project, wireframe);
  assert.match(salt, /^@startsalt/);
  assert.ok(importPlantUmlMore(salt).diagram.ownedViews.length >= 10, 'the checkout screen as Salt');
});

// StarUML conformance: every diagram type StarUML offers exists here with the
// elements and relationships of its toolbox, every tool of every toolbox creates
// an element (or an annotation) that renders, every relationship tool connects
// two of that diagram's elements, the StarUML features (quick edit, code
// generation and reverse engineering, .mdj / fragments / Mermaid / PlantUML
// interchange, HTML and Markdown documents, validation, layout, formatting,
// exports, printing, …) are present, and the sample project has a finished
// diagram of every type. Then each StarUML diagram is drawn as a user draws it
// (toolbox → createNode / createEdge) with its characteristic notation and the
// SVG is checked for it (names, «stereotypes», multiplicities, guards, end
// marks, dashed lines), followed by one test per StarUML feature: quick edit,
// Model Explorer operations, format options, automatic layout, fragments,
// code generation and reverse engineering per language, documents, validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import { DIAGRAM_TYPES, TYPES, VIEW_ONLY } from '../../src/domain/meta.js';
import { DIAGRAM_TABS, DIAGRAM_TYPE_IDS, toolboxFor } from '../../src/domain/toolbox.js';
import { buildSample } from '../../src/domain/templates.js';
import { renderDiagramSvg } from '../../src/render/notation.js';
import { CODE_LANGUAGES, generateCode, SQL_DIALECTS } from '../../src/domain/codegen/index.js';
import { REVERSE_LANGUAGES, reverseEngineer } from '../../src/domain/reverse/index.js';
import { exportFragment, exportMdj, importFragment, importMdj } from '../../src/domain/interop/staruml.js';
import { exportMermaid, importMermaid } from '../../src/domain/interop/mermaid.js';
import { exportPlantUml, importPlantUml } from '../../src/domain/interop/plantuml.js';
import { htmlDocs, markdownDocs } from '../../src/domain/docs.js';
import { RULES, validate } from '../../src/domain/validate.js';
import { layoutDiagram, LAYOUT_DIRECTIONS } from '../../src/domain/layout.js';
import { attributeText, operationText, parseAttribute, parseNameWithStereotype, parseOperation, splitTop } from '../../src/domain/labels.js';
import { canvas, hasTexts, marks, texts } from './canvas.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** StarUML's diagram types and the tools of each toolbox (English names as StarUML shows them). */
const STARUML = {
  UMLClassDiagram: ['Package', 'Class', 'Interface', 'Signal', 'Data Type', 'Primitive Type', 'Enumeration', 'Association', 'Directed Association', 'Aggregation', 'Composition', 'Dependency', 'Generalization', 'Interface Realization', 'Realization', 'Template Binding', 'Containment', 'Association Class Link'],
  UMLPackageDiagram: ['Package', 'Model', 'Subsystem', 'Profile', 'Dependency', 'Import', 'Merge', 'Containment', 'Generalization'],
  UMLObjectDiagram: ['Object', 'Class', 'Package', 'Link', 'Dependency'],
  UMLCompositeStructureDiagram: ['Class', 'Part', 'Port', 'Collaboration', 'Collaboration Use', 'Interface', 'Connector', 'Dependency', 'Realization', 'Usage'],
  UMLComponentDiagram: ['Component', 'Interface', 'Port', 'Artifact', 'Class', 'Package', 'Dependency', 'Provided Interface', 'Component Realization', 'Assembly Connector', 'Delegation Connector', 'Generalization', 'Manifestation'],
  UMLDeploymentDiagram: ['Node', 'Device', 'Execution Environment', 'Node Instance', 'Artifact', 'Artifact Instance', 'Component', 'Component Instance', 'Communication Path', 'Deployment', 'Manifestation', 'Dependency', 'Generalization'],
  UMLProfileDiagram: ['Profile', 'Stereotype', 'Metaclass', 'Enumeration', 'Data Type', 'Extension', 'Generalization', 'Dependency'],
  UMLUseCaseDiagram: ['Actor', 'Use Case', 'Subject', 'Package', 'Association', 'Directed Association', 'Generalization', 'Include', 'Extend', 'Dependency'],
  UMLSequenceDiagram: ['Lifeline', 'Actor Lifeline', 'Synch Message', 'Asynch Message', 'Reply Message', 'Create Message', 'Delete Message', 'Signal', 'Lost/Found Endpoint', 'Gate',
    ...['alt', 'opt', 'loop', 'par', 'break', 'critical', 'neg', 'strict', 'seq', 'ignore', 'consider', 'assert'].map((op) => `Combined Fragment (${op})`), 'Interaction Use', 'State Invariant', 'Continuation', 'Duration Constraint', 'Time Constraint'],
  UMLCommunicationDiagram: ['Lifeline', 'Actor Lifeline', 'Connector', 'Message (on a connector)'],
  UMLTimingDiagram: ['Timing Lifeline', 'Time Tick', 'Duration Constraint', 'Time Constraint', 'Message'],
  UMLInteractionOverviewDiagram: ['Initial Node', 'Activity Final', 'Decision', 'Merge', 'Fork', 'Join', 'Interaction Use', 'Interaction Frame', 'Control Flow'],
  UMLInformationFlowDiagram: ['Class', 'Information Item', 'Actor', 'Component', 'Information Flow', 'Dependency', 'Association'],
  UMLStatechartDiagram: ['State', 'Composite State', 'Submachine State', 'Final State', 'Initial State', 'Choice', 'Junction', 'Fork', 'Join', 'Shallow History', 'Deep History', 'Entry Point', 'Exit Point', 'Terminate', 'Transition'],
  UMLActivityDiagram: ['Action', 'Call Behavior', 'Call Operation', 'Send Signal', 'Accept Event', 'Time Event', 'Object Node', 'Central Buffer', 'Data Store', 'Input Pin', 'Output Pin', 'Initial Node', 'Activity Final', 'Flow Final', 'Fork', 'Join', 'Decision', 'Merge',
    'Vertical Partition', 'Horizontal Partition', 'Structured Node', 'Expansion Region', 'Interruptible Region', 'Control Flow', 'Object Flow', 'Exception Handler'],
  ERDDiagram: ['Entity', 'One to Many', 'One to One', 'One to Zero or One', 'Many to Many'],
  FCFlowchartDiagram: ['Process', 'Terminator', 'Decision', 'Delay', 'Predefined Process', 'Alternate Process', 'Data', 'Document', 'Multi-Document', 'Preparation', 'Display', 'Manual Input', 'Manual Operation', 'Card', 'Punched Tape', 'Connector', 'Off-Page Connector', 'Or', 'Summing Junction', 'Collate', 'Sort', 'Merge', 'Extract', 'Stored Data', 'Database', 'Direct Access Storage', 'Internal Storage', 'Flow'],
  DFDDiagram: ['External Entity', 'Process', 'Data Store', 'Data Flow'],
  SysMLRequirementDiagram: ['Requirement', 'Block', 'Use Case', 'Package', 'Derive', 'Satisfy', 'Verify', 'Refine', 'Trace', 'Copy', 'Containment'],
  SysMLBlockDefinitionDiagram: ['Block', 'Interface Block', 'Value Type', 'Constraint Block', 'Enumeration', 'Actor', 'Package', 'Association', 'Directed Association', 'Aggregation', 'Composition', 'Generalization', 'Dependency'],
  SysMLInternalBlockDiagram: ['Part Property', 'Port', 'Connector', 'Item Flow'],
  SysMLParametricDiagram: ['Constraint Property', 'Constraint Parameter', 'Part Property', 'Connector'],
  BPMNDiagram: ['Pool', 'Lane', 'Task', 'User Task', 'Service Task', 'Script Task', 'Manual Task', 'Send Task', 'Receive Task', 'Business Rule Task', 'Sub-Process', 'Call Activity', 'Start Event', 'Intermediate Event', 'Boundary Event', 'End Event',
    'Exclusive Gateway', 'Parallel Gateway', 'Inclusive Gateway', 'Event-Based Gateway', 'Complex Gateway', 'Data Object', 'Data Store', 'Text Annotation', 'Group', 'Sequence Flow', 'Message Flow', 'Association', 'Data Association'],
  C4Diagram: ['Person', 'Software System', 'Container', 'Component', 'Boundary', 'Deployment Node', 'Relationship'],
  MMMindmapDiagram: ['Mind Map Node', 'Branch'],
  WFWireframeDiagram: ['Desktop Frame', 'Web Frame', 'Mobile Frame', 'Panel', 'Button', 'Text', 'Link', 'Input', 'Text Area', 'Checkbox', 'Radio', 'Switch', 'Dropdown', 'Slider', 'Tabs', 'Image', 'Avatar', 'List', 'Table'],
  AWSDiagram: ['AWS Cloud', 'Region', 'Availability Zone', 'VPC', 'Public subnet', 'Private subnet', 'Security group', 'EC2', 'Lambda', 'S3', 'RDS', 'DynamoDB', 'CloudFront', 'Route 53', 'API Gateway', 'Elastic Load Balancing', 'IAM', 'SQS', 'SNS', 'CloudWatch', 'User', 'Connection'],
  AzureDiagram: ['Subscription', 'Resource group', 'Region', 'Virtual network', 'Subnet', 'Virtual Machines', 'App Service', 'Functions', 'AKS', 'Blob Storage', 'SQL Database', 'Cosmos DB', 'Load Balancer', 'Application Gateway', 'Key Vault', 'Service Bus', 'Monitor', 'User', 'Connection'],
  GCPDiagram: ['Project', 'Region', 'Zone', 'VPC network', 'Subnet', 'Compute Engine', 'Cloud Run', 'Cloud Functions', 'GKE', 'Cloud Storage', 'Cloud SQL', 'Spanner', 'Firestore', 'BigQuery', 'Pub/Sub', 'Cloud Load Balancing', 'IAM', 'Cloud Monitoring', 'User', 'Connection'],
};
/** Annotation tools StarUML has on every diagram. */
const ANNOTATIONS = ['Note', 'Note Link', 'Text', 'Constraint', 'Frame', 'Rectangle', 'Rounded Rectangle', 'Ellipse', 'Hyperlink', 'Image', 'Free Line'];

const toolsOf = (type) => toolboxFor(type).flatMap(([, , , tools]) => tools);
const fresh = (type) => {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  return { project, diagram: M.addDiagram(project, project.ownedElements[0]._id, type, { language: 'en' }) };
};

test('every StarUML diagram type exists, has its own toolbox and its own tab', () => {
  // StarUML's kinds are all here (the program has more: Gantt, WBS, ArchiMate … see newtypes.test.js).
  assert.deepEqual(Object.keys(STARUML).filter((type) => !DIAGRAM_TYPE_IDS.includes(type)), [], 'StarUML diagram types missing');
  const inTabs = DIAGRAM_TABS.flatMap(([, , , types]) => types);
  assert.deepEqual([...inTabs].sort(), [...DIAGRAM_TYPE_IDS].sort(), 'each diagram type is in exactly one tab group');
  for (const type of DIAGRAM_TYPE_IDS) assert.ok(DIAGRAM_TYPES[type].ko && DIAGRAM_TYPES[type].en && DIAGRAM_TYPES[type].icon, `${type}: names and icon`);
});

for (const [type, expected] of Object.entries(STARUML)) {
  test(`${type}: the toolbox has every StarUML tool and the annotations`, () => {
    const names = new Set(toolsOf(type).map((tool) => tool.en));
    const missing = [...expected, ...ANNOTATIONS].filter((name) => !names.has(name));
    assert.deepEqual(missing, [], `${type}: missing tools`);
  });
}

/**
 * Draws every node tool of a diagram type (in a free spot, or inside a host when the
 * element has to live in another one: a pin in an action, a port in a class, a lane in a pool …),
 * then every relationship tool between two drawn elements that accept it.
 */
function drawEverything(type) {
  const { project, diagram } = fresh(type);
  const boxes = new Map();
  const created = [];
  const failed = [];
  // Every element tool twice, so each relationship finds two of a kind (two lifelines for a message, …).
  const nodeTools = toolsOf(type).filter((tool) => tool.kind !== 'edge').flatMap((tool) => [tool, tool]);
  let i = 0;
  const place = (tool, box) => {
    const result = E.createNode(project, diagram, tool, box, { language: 'en', boxes });
    if (!result?.view) return null;
    const size = { w: box.w || tool.size?.w || 160, h: box.h || tool.size?.h || 90 };
    boxes.set(result.view._id, { x: box.x, y: box.y, ...size });
    return result;
  };
  for (const tool of nodeTools) {
    const x = (i % 6) * 320; const y = Math.floor(i / 6) * 260; i += 1;
    let result = place(tool, { x, y, w: 0, h: 0 });
    if (!result) {
      // Needs a host: try each container drawn so far (the point is inside it).
      for (const host of created) {
        const b = boxes.get(host.view._id);
        result = place(tool, { x: b.x + 10, y: b.y + 30, w: 0, h: 0 });
        if (result) break;
      }
    }
    if (result) created.push({ tool, ...result }); else if (!failed.includes(tool.en)) failed.push(tool.en);
  }
  // Relationships: the first pair of drawn views (in order) the relationship accepts.
  const edgesFailed = [];
  let edges = 0;
  const nodes = created.filter((c) => !M.isEdgeView(c.view));
  for (const tool of toolsOf(type).filter((t) => t.kind === 'edge')) {
    let done = false;
    const candidates = [...nodes.map((c) => c.view), ...diagram.ownedViews.filter((v) => M.isEdgeView(v))];
    for (const a of candidates) {
      for (const b of candidates) {
        if (done || a === b) continue;
        if (!E.canConnect(project, diagram, tool, a, b, M.buildIndex(project))) continue;
        const result = E.createEdge(project, diagram, tool, a, b, { language: 'en', y: null });
        if (result?.view) { done = true; edges += 1; }
      }
      if (done) break;
    }
    if (!done && !tool.onConnector) edgesFailed.push(tool.en);
  }
  return { project, diagram, created, failed, edges, edgesFailed };
}

for (const type of Object.keys(STARUML)) {
  test(`${type}: every tool draws, every relationship connects, and the diagram renders`, () => {
    const { project, diagram, failed, edgesFailed } = drawEverything(type);
    assert.deepEqual(failed, [], `${type}: element tools that drew nothing`);
    assert.deepEqual(edgesFailed, [], `${type}: relationship tools that connected nothing`);
    const errors = [];
    const { svg } = renderDiagramSvg(project, diagram, { onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
    assert.deepEqual(errors, [], `${type}: render errors`);
    assert.ok(!/NaN|undefined/.test(svg), `${type}: no broken numbers or text in the drawing`);
  });
}

test('the sample project has a finished diagram of every type, and each renders cleanly', () => {
  for (const language of ['ko', 'en']) {
    const project = buildSample(language);
    const diagrams = M.allDiagrams(project);
    const byType = new Map();
    for (const d of diagrams) byType.set(d._type, [...(byType.get(d._type) ?? []), d]);
    const missing = DIAGRAM_TYPE_IDS.filter((type) => !byType.has(type));
    assert.deepEqual(missing, [], `${language}: diagram types without a sample`);
    for (const d of diagrams) {
      assert.ok(d.name && !/Diagram\d*$|다이어그램\d*$/.test(d.name), `${language}: ${d._type} has a real name ("${d.name}")`);
      const elements = d.ownedViews.filter((v) => v.model);
      assert.ok(elements.length >= 3, `${language}: ${d.name} is a finished diagram (${elements.length} model views)`);
      if (!['MMMindmapDiagram', 'WFWireframeDiagram'].includes(d._type) && !/Timing/.test(d._type)) {
        assert.ok(d.ownedViews.some((v) => M.isEdgeView(v)), `${language}: ${d.name} has relationships`);
      }
      const errors = [];
      const { svg } = renderDiagramSvg(project, d, { onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
      assert.deepEqual(errors, [], `${language}: ${d.name} renders`);
      assert.ok(!/NaN|undefined/.test(svg), `${language}: ${d.name} has no broken numbers or text`);
    }
  }
});

test('StarUML features: commands of the menus', () => {
  const source = read('src/app.js');
  const commands = new Set([...source.matchAll(/^ {2}([a-zA-Z]+): \{ icon:/gm)].map((m) => m[1]));
  const FEATURES = {
    'project files': ['new', 'newFromTemplate', 'open', 'save', 'saveAs', 'saveTemplate', 'recent', 'closeTab', 'exit'],
    'StarUML interchange': ['importStarUml', 'exportStarUml', 'importFragment', 'exportFragment'],
    'text models': ['importText', 'exportMermaid', 'exportPlantUml'],
    'exports': ['exportImage', 'exportSvg', 'exportPdf', 'exportAllImages', 'exportHtml', 'exportMarkdown', 'print'],
    'editing': ['undo', 'redo', 'cut', 'copy', 'paste', 'duplicate', 'delete', 'deleteFromModel', 'selectAll', 'selectInExplorer', 'selectInDiagram', 'find', 'editName'],
    'model': ['addDiagram', 'addElement', 'moveUp', 'moveDown', 'showRelations', 'unusedElements', 'validate', 'statistics'],
    'tools': ['generateCode', 'reverse', 'generateDdl'],
    'format': ['fillColor', 'lineColor', 'fontColor', 'bold', 'italic', 'fontUp', 'fontDown', 'clearBends', 'autoResize', 'fitContent', 'shadow', 'suppressAttributes', 'suppressOperations', 'showVisibility', 'showNamespace', 'showSignature'],
    'arrange': ['bringFront', 'sendBack', 'bringForward', 'sendBackward', 'alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom', 'distributeH', 'distributeV', 'sameWidth', 'sameHeight', 'sameSize', 'layoutMenu'],
    'view': ['zoomIn', 'zoomOut', 'zoomReset', 'fitPage', 'zoomSelection', 'grid', 'rulers', 'snapGrid', 'minimap', 'presentation', 'nextDiagram', 'prevDiagram', 'theme', 'language'],
    'help': ['tutorial', 'userGuide', 'shortcuts', 'settings', 'about'],
  };
  for (const [feature, ids] of Object.entries(FEATURES)) {
    const missing = ids.filter((id) => !commands.has(id));
    assert.deepEqual(missing, [], `${feature}: missing commands`);
  }
});

test('StarUML features: code generation and reverse engineering languages', () => {
  const generators = CODE_LANGUAGES.map((l) => l.id);
  for (const id of ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php', 'sql']) assert.ok(generators.includes(id), `code generation: ${id}`);
  const readers = REVERSE_LANGUAGES.map((l) => l.id);
  for (const id of ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php', 'sql']) assert.ok(readers.includes(id), `reverse engineering: ${id}`);
  const project = buildSample('en');
  for (const { id } of CODE_LANGUAGES) {
    const files = generateCode(project, null, id);
    assert.ok(files.length > 0, `${id}: the sample generates files`);
  }
});

test('StarUML features: .mdj, fragments, Mermaid, PlantUML, HTML and Markdown documents', () => {
  const project = buildSample('en');
  const diagrams = M.allDiagrams(project);
  // StarUML project round trip keeps every diagram and its views.
  const back = importMdj(exportMdj(project));
  assert.deepEqual(M.allDiagrams(back).map((d) => [d._type, d.ownedViews.length]), diagrams.map((d) => [d._type, d.ownedViews.length]), '.mdj round trip');
  // A model fragment of a package comes back with its elements.
  const pkg = M.elementsWhere(project, (e) => e._type === 'UMLPackage')[0];
  const fragment = importFragment(exportFragment(pkg));
  assert.equal(fragment.name, pkg.name, 'fragment round trip');
  // Mermaid and PlantUML: class and sequence diagrams go out and come back in.
  for (const type of ['UMLClassDiagram', 'UMLSequenceDiagram']) {
    const d = diagrams.find((x) => x._type === type);
    const mermaid = exportMermaid(project, d);
    assert.ok(importMermaid(typeof mermaid === 'string' ? mermaid : mermaid.text, { language: 'en' }), `${type}: Mermaid round trip`);
    const plant = exportPlantUml(project, d);
    assert.ok(importPlantUml(typeof plant === 'string' ? plant : plant.text, { language: 'en' }), `${type}: PlantUML round trip`);
  }
  // Documents name every diagram.
  const html = htmlDocs(project, { language: 'en' });
  const markdown = markdownDocs(project, { language: 'en' });
  const htmlText = typeof html === 'string' ? html : JSON.stringify(html);
  const mdText = typeof markdown === 'string' ? markdown : JSON.stringify(markdown);
  for (const d of diagrams) {
    assert.ok(htmlText.includes(d.name), `HTML document has ${d.name}`);
    assert.ok(mdText.includes(d.name), `Markdown document has ${d.name}`);
  }
});

test('StarUML features: validation rules, automatic layout, formatting options', () => {
  assert.ok(RULES.length >= 20, `validation rules (${RULES.length})`);
  assert.ok(Array.isArray(validate(buildSample('en'))), 'the sample validates');
  // Automatic layout moves a pile of classes apart.
  const { project, diagram } = fresh('UMLClassDiagram');
  const boxes = new Map();
  const ids = [];
  for (let k = 0; k < 4; k++) {
    const { view } = E.createNode(project, diagram, toolsOf('UMLClassDiagram').find((t) => t.en === 'Class'), { x: 0, y: 0, w: 0, h: 0 }, { language: 'en' });
    boxes.set(view._id, { x: 0, y: 0, w: 120, h: 80 }); ids.push(view._id);
  }
  const moved = layoutDiagram(diagram, boxes, M.buildIndex(project));
  const places = new Set([...(moved instanceof Map ? moved.values() : Object.values(moved ?? {}))].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  assert.ok(places.size >= 2 || new Set(diagram.ownedViews.map((v) => `${v.left},${v.top}`)).size >= 2, 'layout spreads the classes');
  // StarUML view options exist on views (format menu): stereotype display, suppress, show visibility …
  const source = read('src/app.js');
  for (const key of ['stereotypeDisplay', 'suppressAttributes', 'suppressOperations', 'suppressReceptions', 'suppressLiterals', 'showVisibility', 'showNamespace', 'showOperationSignature', 'showProperty', 'showType', 'showMultiplicity', 'wordWrap', 'autoResize', 'lineStyle', 'showShadow']) {
    assert.ok(source.includes(`'${key}'`), `format option ${key}`);
  }
});

test('one project at a time, saved as .myuml with its own file icon', () => {
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  const project = conf.bundle.fileAssociations.find((a) => a.ext.includes('myuml'));
  assert.ok(project, '.myuml is registered');
  assert.equal(project.name, 'MyUMLMaker.Project');
  assert.ok(fs.existsSync(path.join(root, 'src-tauri', 'icons', 'project.ico')), 'project file icon');
  assert.match(read('src-tauri/windows/hooks.nsh'), /MyUMLMaker\.Project\\DefaultIcon" "" "\$INSTDIR\\project\.ico"/, 'the installer gives .myuml its own icon');
  assert.match(read('src/domain/format.js'), /PROJECT_EXTENSION = 'myuml'/);
  // Opening or creating a project asks to save the changes of the current one first.
  const source = read('src/app.js');
  for (const fn of ['openPath', 'openContent', 'openDatabaseProject']) {
    const body = source.slice(source.indexOf(`function ${fn}(`), source.indexOf('\n}\n', source.indexOf(`function ${fn}(`)));
    assert.match(body, /confirmReplace\(\)/, `${fn} asks before replacing the project`);
  }
  assert.match(source, /new: \{[^}]*run: \(\) => newProjectAsk\(\)/, 'New asks before replacing the project');
});

// ───────────────────────── every StarUML diagram, drawn with its notation

/** SVG of one drawn thing has the texts and the end marks (see canvas.js marks()). */
const look = (r, thing, { text = [], mark = null, dash = undefined } = {}) => {
  const svg = r.of(thing);
  hasTexts(svg, text, `${(thing.element ?? thing.view ?? thing)._type}:`);
  if (mark) assert.deepEqual(marks(svg).filter((m) => !['circle', 'dot'].includes(m) || mark.some((x) => x === 'circle' || x === 'dot')), mark, `${(thing.element ?? thing)._type}: end marks`);
  if (dash !== undefined) assert.equal(/stroke-dasharray="([^"]+)"/.exec(svg)?.[1] ?? '', dash, `${(thing.element ?? thing)._type}: line pattern`);
  return svg;
};
const ownerOf = (c, thing) => M.ownerOf(c.project, (thing.element ?? thing)._id);
const ancestorsOf = (c, thing) => M.ancestors(c.project, (thing.element ?? thing)._id, c.index());

test('Class diagram: abstract class, interface, enumeration, stereotypes, members, generalization, realization, composition with multiplicities, aggregation, navigability, dependency', () => {
  const c = canvas('UMLClassDiagram');
  const shape = c.node('UMLClass', 0, 0, { name: 'Shape', isAbstract: true });
  c.add(shape, 'UMLAttribute', { name: 'id', type: 'int', visibility: 'private', isID: true });
  c.add(shape, 'UMLAttribute', { name: 'count', type: 'int', isStatic: true, defaultValue: '0' });
  const area = c.add(shape, 'UMLOperation', { name: 'area', visibility: 'public', isAbstract: true });
  c.add(area, 'UMLParameter', { type: 'double', direction: 'return' });
  const circle = c.node('UMLClass', 0, 300, { name: 'Circle', stereotype: 'entity' });
  const drawable = c.node('UMLInterface', 300, 0, { name: 'Drawable' });
  const color = c.node('UMLEnumeration', 600, 0, { name: 'Color' });
  c.add(color, 'UMLEnumerationLiteral', { name: 'RED' });
  c.add(color, 'UMLEnumerationLiteral', { name: 'GREEN' });
  const board = c.node('UMLClass', 300, 300, { name: 'Canvas' });
  const signal = c.node('UMLSignal', 600, 300, { name: 'Redraw' });
  const gen = c.edge('UMLGeneralization', circle, shape);
  const real = c.edge('UMLInterfaceRealization', shape, drawable);
  const comp = c.edge('composition', board, circle, { end1: { multiplicity: '1' }, end2: { multiplicity: '0..*', name: 'shapes', visibility: 'private' } });
  const agg = c.edge('aggregation', board, shape);
  const nav = c.edge('directedAssociation', board, color);
  const dep = c.edge('UMLDependency', circle, color, { name: 'uses' });
  const r = c.render();
  const shapeSvg = look(r, shape, { text: ['Shape', '-id: int {id}', 'count: int = 0', '+area(): double'] });
  assert.match(shapeSvg, /font-style="italic"[^>]*>Shape</, 'an abstract class name is italic');
  assert.match(shapeSvg, /font-style="italic"[^>]*>\+area\(\): double</, 'an abstract operation is italic');
  assert.match(shapeSvg, /text-decoration="underline"[^>]*>[^<]*count: int = 0</, 'a static attribute is underlined');
  look(r, circle, { text: ['«entity»', 'Circle'] });
  look(r, drawable, { text: ['«interface»', 'Drawable'] });
  look(r, color, { text: ['«enumeration»', 'Color', 'RED', 'GREEN'] });
  look(r, signal, { text: ['«signal»', 'Redraw'] });
  look(r, gen, { mark: ['triangle'], dash: '' });
  look(r, real, { mark: ['triangle'], dash: '6 4' });
  look(r, comp, { text: ['1', '-shapes', '0..*'], mark: ['composite'] });
  look(r, agg, { mark: ['shared'] });
  look(r, nav, { mark: ['open'], dash: '' });
  look(r, dep, { text: ['uses'], mark: ['open'], dash: '6 4' });
  assert.equal(comp.element.end1.aggregation, 'composite', 'the diamond is at the whole');
});

test('Package diagram: nested packages, «subsystem», model, «import» / «merge» dependencies and containment', () => {
  const c = canvas('UMLPackageDiagram');
  const app = c.node('UMLPackage', 0, 0, { name: 'app' }, { w: 400, h: 300 });
  const ui = c.node('UMLPackage', 20, 60, { name: 'ui' });
  const domain = c.node('UMLPackage', 500, 0, { name: 'domain' });
  const billing = c.node('UMLSubsystem', 500, 300, { name: 'Billing' });
  const analysis = c.node('UMLModel', 800, 0, { name: 'Analysis' });
  const imp = c.edge('import', ui, domain);
  const merge = c.edge('merge', domain, analysis);
  const cont = c.edge('UMLContainment', app, billing);
  assert.equal(ownerOf(c, ui), app.element, 'a package drawn inside another is owned by it');
  const r = c.render();
  look(r, app, { text: ['app'] });
  look(r, billing, { text: ['«subsystem»', 'Billing'] });
  look(r, analysis, { text: ['Analysis'] });
  look(r, imp, { text: ['«import»'], mark: ['open'], dash: '6 4' });
  look(r, merge, { text: ['«merge»'], mark: ['open'], dash: '6 4' });
  assert.match(r.of(cont), /<circle[^>]*r="6"/, 'containment: a circled plus at the owner');
});

test('Object diagram: instance specifications "name : Classifier" underlined, slots and links', () => {
  const c = canvas('UMLObjectDiagram');
  const order = c.node('UMLClass', 0, 0, { name: 'Order' });
  const o1 = c.node('UMLObject', 300, 0, { name: 'o1', classifier: M.ref(order.element) });
  c.add(o1, 'UMLSlot', { name: 'total', value: '42' });
  const kim = c.node('UMLObject', 600, 0, { name: 'kim' });
  const link = c.edge('UMLLink', kim, o1, { name: 'places' });
  const r = c.render();
  const svg = look(r, o1, { text: ['o1 : Order', 'total = 42'] });
  assert.match(svg, /text-decoration="underline"[^>]*>o1 : Order</, 'an object name is underlined');
  look(r, link, { text: ['places'] });
});

test('Composite structure diagram: parts with type and multiplicity inside their class, a port on its border, connectors, collaboration and collaboration use', () => {
  const c = canvas('UMLCompositeStructureDiagram');
  const car = c.node('UMLClass', 0, 0, { name: 'Car' }, { w: 400, h: 240 });
  const engine = c.node('UMLPart', 20, 60, { name: 'engine', type: 'Engine', multiplicity: '1' });
  const wheels = c.node('UMLPart', 220, 60, { name: 'wheels', type: 'Wheel', multiplicity: '4' });
  const port = c.node('UMLPort', 0, 100, { name: 'power', type: 'Power' });
  const axle = c.edge('UMLConnector', engine, wheels, { name: 'axle' });
  const observer = c.node('UMLCollaboration', 600, 0, { name: 'Observer' });
  const use = c.node('UMLCollaborationUse', 600, 220, { name: 'obs', type: M.ref(observer.element) });
  assert.equal(ownerOf(c, engine), car.element, 'a part belongs to its class');
  assert.ok(car.element.parts.includes(engine.element) && car.element.ports.includes(port.element));
  const r = c.render();
  look(r, engine, { text: ['engine : Engine [1]'] });
  look(r, wheels, { text: ['wheels : Wheel [4]'] });
  look(r, port, { text: ['power'] });
  look(r, axle, { text: ['axle'], mark: [] });
  look(r, observer, { text: ['Observer'], dash: '6 4' });
  look(r, use, { text: ['obs'], dash: '6 4' });
});

test('Component diagram: components with a port, provided interface (lollipop), required interface («use»), assembly connector, artifact «manifest»', () => {
  const c = canvas('UMLComponentDiagram');
  const ordering = c.node('UMLComponent', 0, 0, { name: 'Ordering' }, { w: 200, h: 120 });
  const payment = c.node('UMLComponent', 400, 0, { name: 'Payment' }, { w: 200, h: 120 });
  const port = c.node('UMLPort', 190, 40, { name: 'pay' });
  const api = c.node('interfaceIcon', 400, 250, { name: 'IPayment' });
  const jar = c.node('UMLArtifact', 0, 300, { name: 'ordering.jar' });
  const provided = c.edge('UMLInterfaceRealization', payment, api);
  const required = c.edge('UMLUsage', ordering, api);
  const assembly = c.edge('UMLConnector', port, payment);
  const delegation = c.edge('delegation', ordering, port);
  const manifest = c.edge('UMLManifestation', jar, ordering);
  assert.equal(ownerOf(c, port), ordering.element, 'the port is on the component');
  const r = c.render();
  look(r, ordering, { text: ['Ordering'] });
  const lollipop = look(r, api, { text: ['IPayment'] });
  assert.match(lollipop, /<circle[^>]*r="13"/, 'an interface shown as an icon is a lollipop');
  look(r, provided, { mark: ['triangle'], dash: '6 4' });
  look(r, required, { text: ['«use»'], mark: ['open'], dash: '6 4' });
  look(r, assembly, { mark: [] });
  look(r, delegation, { mark: ['open'] });
  look(r, manifest, { text: ['«manifest»'], mark: ['open'], dash: '6 4' });
});

test('Deployment diagram: node with an execution environment inside, «device», artifact «deploy», communication path, node instance underlined', () => {
  const c = canvas('UMLDeploymentDiagram');
  const server = c.node('UMLNode', 0, 0, { name: 'AppServer' }, { w: 300, h: 200 });
  const jvm = c.node('UMLExecutionEnvironment', 20, 60, { name: 'JVM' });
  const phone = c.node('UMLDevice', 500, 0, { name: 'Phone' });
  const war = c.node('UMLArtifact', 500, 300, { name: 'shop.war' });
  const db1 = c.node('UMLNodeInstance', 800, 0, { name: 'db1' });
  const https = c.edge('UMLCommunicationPath', server, phone, { name: 'HTTPS' });
  const deploy = c.edge('UMLDeployment', war, server);
  assert.equal(ownerOf(c, jvm), server.element, 'nested in its node');
  const r = c.render();
  const svg = look(r, server, { text: ['AppServer'] });
  assert.ok((svg.match(/<path/g) ?? []).length >= 1, 'a 3D box');
  look(r, jvm, { text: ['«executionEnvironment»', 'JVM'] });
  look(r, phone, { text: ['«device»', 'Phone'] });
  look(r, war, { text: ['shop.war'] });
  assert.match(r.of(db1), /text-decoration="underline"/, 'an instance is underlined');
  look(r, https, { text: ['HTTPS'], mark: [] });
  look(r, deploy, { text: ['«deploy»'], mark: ['open'], dash: '6 4' });
});

test('Profile diagram: profile with a stereotype extending a metaclass (filled triangle), stereotype used on a class', () => {
  const c = canvas('UMLProfileDiagram');
  const web = c.node('UMLProfile', 0, 0, { name: 'Web' }, { w: 500, h: 300 });
  const controller = c.node('UMLStereotype', 20, 60, { name: 'Controller' });
  const metaclass = c.node('UMLMetaClass', 300, 60, { name: 'Class' });
  const ext = c.edge('UMLExtension', controller, metaclass, { isRequired: true });
  assert.equal(ownerOf(c, controller), web.element);
  const r = c.render();
  look(r, web, { text: ['«profile»', 'Web'] });
  look(r, controller, { text: ['«stereotype»', 'Controller'] });
  look(r, metaclass, { text: ['«metaclass»', 'Class'] });
  look(r, ext, { mark: ['filled'], dash: '' });
  // A class using the stereotype shows it by name (a reference, not text).
  const user = canvas('UMLClassDiagram');
  user.project.ownedElements.push(web.element);
  M.linkParents(user.project);
  const cls = user.node('UMLClass', 0, 0, { name: 'OrderController', stereotype: M.ref(controller.element) });
  look(user.render(), cls, { text: ['«Controller»', 'OrderController'] });
});

test('Use case diagram: actors, use cases with an extension point inside a subject, association, generalization, «include», «extend» with condition', () => {
  const c = canvas('UMLUseCaseDiagram');
  const shop = c.node('UMLUseCaseSubject', 200, 0, { name: 'Shop' }, { w: 300, h: 420 });
  const buyer = c.node('UMLActor', 0, 60, { name: 'Buyer' });
  const vip = c.node('UMLActor', 0, 260, { name: 'VIP' });
  const order = c.node('UMLUseCase', 250, 60, { name: 'Place Order' });
  const pay = c.node('UMLUseCase', 250, 200, { name: 'Pay' });
  const coupon = c.node('UMLUseCase', 250, 330, { name: 'Use Coupon' });
  c.add(order, 'UMLExtensionPoint', { name: 'discount' });
  const assoc = c.edge('UMLAssociation', buyer, order);
  const gen = c.edge('UMLGeneralization', vip, buyer);
  const inc = c.edge('UMLInclude', order, pay);
  const ext = c.edge('UMLExtend', coupon, order, { condition: 'has coupon' });
  const r = c.render();
  look(r, shop, { text: ['Shop'] });
  const actor = look(r, buyer, { text: ['Buyer'] });
  assert.match(actor, /<circle/, 'stick figure head');
  const uc = look(r, order, { text: ['Place Order', 'extension points', 'discount'] });
  assert.match(uc, /<ellipse/, 'a use case is an ellipse');
  look(r, assoc, { mark: [] });
  look(r, gen, { mark: ['triangle'] });
  look(r, inc, { text: ['«include»'], mark: ['open'], dash: '6 4' });
  look(r, ext, { text: ['«extend»', '[has coupon]'], mark: ['open'], dash: '6 4' });
});

test('Sequence diagram: actor and lifelines, sync / async / reply / create / delete messages with numbers, alt with guards and else, loop, activations, a destroyed lifeline', () => {
  const c = canvas('UMLSequenceDiagram');
  const user = c.node('actorLifeline', 0, 0, { name: 'user' });
  const ui = c.node('UMLLifeline', 200, 0, { name: 'ui' });
  const svc = c.node('UMLLifeline', 400, 0, { name: 'svc' });
  const tmp = c.node('UMLLifeline', 600, 0, { name: 'tmp' });
  const login = c.edge('message:synchCall', user, ui, { name: 'login', arguments: 'id' }, { y: 100 });
  const audit = c.edge('message:asynchCall', ui, svc, { name: 'audit' }, { y: 140 });
  const create = c.edge('message:createMessage', ui, tmp, {}, { y: 180 });
  const ok = c.edge('message:reply', ui, user, { name: 'ok' }, { y: 220 });
  const destroy = c.edge('message:deleteMessage', ui, tmp, {}, { y: 260 });
  const alt = c.node('fragment:alt', -20, 90, {}, { w: 700, h: 220 });
  alt.element.operands[0].guard = 'valid';
  const loop = c.node('fragment:loop', -20, 330, {}, { w: 300, h: 80 });
  loop.element.operands[0].guard = 'retry < 3';
  const interaction = ownerOf(c, ui);
  assert.equal(interaction._type, 'UMLInteraction');
  assert.ok(interaction.messages.length === 5 && interaction.fragments.length === 2, 'messages and fragments belong to the interaction');
  assert.equal(M.findById(c.project, user.element.represent)?.type ? 'typed' : 'untyped', 'typed', 'the actor lifeline represents a role typed by an actor');
  const r = c.render();
  look(r, user, { text: ['user'] });
  assert.match(r.of(user), /<circle/, 'actor lifeline: stick figure');
  look(r, ui, { text: ['ui'], dash: '6 4' });
  look(r, login, { text: ['1 : login(id)'], mark: ['filled'], dash: '' });
  look(r, audit, { text: ['2 : audit'], mark: ['open'], dash: '' });
  look(r, create, { text: ['3 : create'], mark: ['open'], dash: '6 4' });
  look(r, ok, { text: ['4 : ok'], mark: ['open'], dash: '6 4' });
  look(r, destroy, { text: ['5 : destroy'], mark: ['filled'] });
  look(r, alt, { text: ['alt', '[valid]', '[else]'], dash: '6 4' });
  look(r, loop, { text: ['loop', '[retry < 3]'] });
  const seq = r.ctx.sequence;
  assert.ok(seq.lifelines.get(ui.view._id).activations.length >= 1, 'activation bars');
  assert.equal(seq.lifelines.get(tmp.view._id).destroyed, true, 'the deleted lifeline ends in an X');
  assert.ok(seq.lifelines.get(tmp.view._id).headTop > 100, 'the created lifeline starts at its create message');
});

test('Communication diagram: lifelines on a connector with numbered messages in both directions', () => {
  const c = canvas('UMLCommunicationDiagram');
  const cart = c.node('UMLLifeline', 0, 0, { name: 'cart' });
  const stock = c.node('UMLLifeline', 300, 0, { name: 'stock' });
  const link = c.edge('UMLConnector', cart, stock);
  const reserve = E.addCommunicationMessage(c.project, link.element, { forward: true, language: 'en' });
  reserve.name = 'reserve';
  const reserved = E.addCommunicationMessage(c.project, link.element, { forward: false, sort: 'reply', language: 'en' });
  reserved.name = 'reserved';
  assert.deepEqual([M.refId(reserve.source), M.refId(reserved.source)], [cart.element._id, stock.element._id]);
  const r = c.render();
  look(r, cart, { text: ['cart'] });
  look(r, link, { text: ['1 : reserve', '2 : reserved'], mark: ['filled', 'open'] });
});

test('Timing diagram: lifelines with states and time segments, a time tick, a duration constraint and a message', () => {
  const c = canvas('UMLTimingDiagram');
  const door = c.node('UMLTimingLifeline', 0, 0, { name: 'door', states: 'Closed,Open' });
  c.add(door, 'UMLTimeSegment', { state: 'Closed', duration: 10 });
  c.add(door, 'UMLTimeSegment', { state: 'Open', duration: 5 });
  const alarm = c.node('UMLTimingLifeline', 0, 200, { name: 'alarm', states: 'Off,On' });
  c.add(alarm, 'UMLTimeSegment', { state: 'Off', duration: 12 });
  const tick = c.node('UMLTimeTick', 150, 150, { name: '10' });
  const limit = c.node('UMLDurationConstraint', 300, 150, { specification: 'd..3d' });
  const trigger = c.edge('message:synchCall', door, alarm, { name: 'trigger' }, { y: 100 });
  const r = c.render();
  const wave = look(r, door, { text: ['door', 'Closed', 'Open'] });
  assert.ok((wave.match(/<path|<polyline/g) ?? []).length >= 1, 'a state waveform');
  look(r, alarm, { text: ['alarm', 'Off', 'On'] });
  assert.ok(r.of(tick).length > 0, 'time tick drawn');
  look(r, limit, { text: ['{d..3d}'] });
  look(r, trigger, { text: ['trigger'], mark: ['filled'] });
});

test('Interaction overview diagram: initial node, interaction uses ("ref"), decision with guards, an inline interaction frame, final node', () => {
  const c = canvas('UMLInteractionOverviewDiagram');
  const start = c.node('UMLInitialNode', 0, 0);
  const login = c.node('UMLInteractionUse', 0, 100, { name: 'Login' });
  const decide = c.node('UMLDecisionNode', 0, 220);
  const frame = c.node('interactionFrame', 250, 200, { text: 'sd Checkout' });
  const end = c.node('UMLActivityFinalNode', 0, 400);
  c.edge('UMLControlFlow', start, login);
  c.edge('UMLControlFlow', login, decide);
  const cancel = c.edge('UMLControlFlow', decide, end, { guard: 'cancel' });
  const r = c.render();
  look(r, login, { text: ['ref', 'Login'] });
  assert.match(r.of(decide), /<path[^>]*d="M[^"]*Z"/, 'a decision diamond');
  look(r, frame, { text: ['sd Checkout'] });
  assert.deepEqual(marks(r.of(end)), ['circle', 'dot'], 'final node: a bull\'s eye');
  look(r, cancel, { text: ['[cancel]'], mark: ['open'] });
});

test('Information flow diagram: an information item conveyed on a «flow» between an actor and a component', () => {
  const c = canvas('UMLInformationFlowDiagram');
  const customer = c.node('UMLActor', 0, 0, { name: 'Customer' });
  const invoice = c.node('UMLInformationItem', 300, 220, { name: 'Invoice' });
  const billing = c.node('UMLComponent', 300, 0, { name: 'Billing' });
  const flow = c.edge('UMLInformationFlow', billing, customer, { conveyed: 'Invoice' });
  const r = c.render();
  look(r, invoice, { text: ['«information»', 'Invoice'] });
  look(r, billing, { text: ['Billing'] });
  look(r, flow, { text: ['«flow»', 'Invoice'], mark: ['filled'], dash: '6 4' });
});

test('Statechart diagram: initial state, state with entry / do activities, composite state with a sub-state, shallow and deep history, choice, final state, terminate, transitions "trigger [guard] / effect"', () => {
  const c = canvas('UMLStatechartDiagram');
  const init = c.node('pseudo:initial', 0, 0);
  const idle = c.node('UMLState', 0, 100, { name: 'Idle', entryActivity: 'reset()' });
  const active = c.node('compositeState', 300, 0, { name: 'Active' }, { w: 420, h: 320 });
  const running = c.node('UMLState', 320, 60, { name: 'Running', doActivity: 'spin()' });
  const hist = c.node('pseudo:shallowHistory', 600, 60);
  const deep = c.node('pseudo:deepHistory', 600, 180);
  const choice = c.node('pseudo:choice', 0, 320);
  const done = c.node('UMLFinalState', 0, 460);
  const term = c.node('pseudo:terminate', 200, 460);
  const t1 = c.edge('UMLTransition', init, idle);
  const t2 = c.edge('UMLTransition', idle, active, { triggers: 'start', guard: 'ready', effect: 'log()' });
  const t3 = c.edge('UMLTransition', active, choice, { triggers: 'stop' });
  const t4 = c.edge('UMLTransition', choice, done, { guard: 'done' });
  c.edge('UMLTransition', choice, term, { guard: 'error' });
  // Sub-states live in the region of their composite state.
  for (const inner of [running, hist, deep]) assert.ok(ancestorsOf(c, inner).includes(active.element), `${inner.element.kind ?? inner.element.name} is inside Active`);
  assert.equal(ownerOf(c, running)._type, 'UMLRegion');
  assert.equal(M.ownerOf(c.project, ownerOf(c, running)._id), active.element);
  assert.ok(!ancestorsOf(c, idle).includes(active.element));
  const r = c.render();
  assert.deepEqual(marks(r.of(init)), ['dot'], 'initial: a filled dot');
  look(r, idle, { text: ['Idle', 'entry / reset()'] });
  look(r, active, { text: ['Active'] });
  look(r, running, { text: ['Running', 'do / spin()'] });
  look(r, hist, { text: ['H'] });
  look(r, deep, { text: ['H*'] });
  assert.match(r.of(choice), /<path[^>]*d="M[^"]*Z"/, 'choice: a diamond');
  assert.deepEqual(marks(r.of(done)), ['circle', 'dot'], 'final state: a bull\'s eye');
  assert.ok(/<path/.test(r.of(term)), 'terminate: a cross');
  look(r, t1, { mark: ['open'] });
  look(r, t2, { text: ['start [ready] / log()'], mark: ['open'] });
  look(r, t3, { text: ['stop'] });
  look(r, t4, { text: ['[done]'] });
});

test('Activity diagram: partitions (swimlanes) holding actions, an output pin, fork / join bars, decision with guards, object node, send signal / accept event / time event actions, activity and flow final', () => {
  const c = canvas('UMLActivityDiagram');
  const customer = c.node('UMLActivityPartition', 0, 0, { name: 'Customer' }, { w: 250, h: 620 });
  const shop = c.node('UMLActivityPartition', 250, 0, { name: 'Shop' }, { w: 300, h: 620 });
  const start = c.node('UMLInitialNode', 100, 40);
  const order = c.node('UMLAction', 60, 100, { name: 'Order' });
  const pin = c.node('UMLOutputPin', 70, 110, { name: 'order', type: 'Order' });
  const fork = c.node('UMLForkNode', 270, 200);
  const pack = c.node('UMLAction', 260, 260, { name: 'Pack' });
  const bill = c.node('action:sendSignal', 400, 260, { name: 'Send Bill' });
  const join = c.node('UMLJoinNode', 270, 380);
  const decide = c.node('UMLDecisionNode', 300, 430);
  const end = c.node('UMLActivityFinalNode', 300, 560);
  const flowEnd = c.node('UMLFlowFinalNode', 460, 560);
  const invoice = c.node('UMLObjectNode', 640, 100, { name: 'Invoice' });
  const paid = c.node('action:acceptSignal', 640, 300, { name: 'Paid' });
  const wait = c.node('action:acceptTimeEvent', 640, 420, { name: 'after 1 day' });
  c.edge('UMLControlFlow', start, order);
  const objectFlow = c.edge('UMLObjectFlow', pin, fork);
  c.edge('UMLControlFlow', fork, pack); c.edge('UMLControlFlow', fork, bill);
  c.edge('UMLControlFlow', pack, join); c.edge('UMLControlFlow', bill, join);
  c.edge('UMLControlFlow', join, decide);
  const yes = c.edge('UMLControlFlow', decide, end, { guard: 'paid' });
  c.edge('UMLControlFlow', decide, flowEnd, { guard: 'else' });
  assert.equal(ownerOf(c, order)._type, 'UMLActivity', 'actions in a partition belong to the activity');
  assert.deepEqual(order.element.outputs, [pin.element], 'the pin is an output of its action');
  assert.equal(bill.element.kind, 'sendSignal');
  const r = c.render();
  look(r, customer, { text: ['Customer'] });
  look(r, shop, { text: ['Shop'] });
  assert.deepEqual(marks(r.of(start)), ['dot']);
  look(r, order, { text: ['Order'] });
  look(r, pin, { text: ['order'] });
  for (const bar of [fork, join]) assert.match(r.of(bar), /<rect[^>]*height="6"/, 'fork / join: a thick bar');
  look(r, bill, { text: ['Send Bill'] });
  assert.match(r.of(bill), /<path[^>]*d="M[^"]*Z"/, 'send signal: a pentagon');
  look(r, paid, { text: ['Paid'] });
  look(r, wait, { text: ['after 1 day'] });
  look(r, invoice, { text: ['Invoice'] });
  assert.deepEqual(marks(r.of(end)), ['circle', 'dot']);
  assert.match(r.of(flowEnd), /<circle[^>]*>.*<path/s, 'flow final: a circle with a cross');
  look(r, objectFlow, { mark: ['open'] });
  look(r, yes, { text: ['[paid]'], mark: ['open'] });
});

test('ERD: entities with PK / FK columns and types, identifying 1:N (crow\'s foot), many-to-many and non-identifying (dashed) relationships', () => {
  const c = canvas('ERDDiagram');
  const customer = c.node('ERDEntity', 0, 0, { name: 'customer' });
  c.add(customer, 'ERDColumn', { name: 'email', type: 'VARCHAR', length: '120', unique: true });
  const orders = c.node('ERDEntity', 400, 0, { name: 'orders' });
  c.add(orders, 'ERDColumn', { name: 'customer_id', type: 'INTEGER', foreignKey: true, referenceTo: M.ref(customer.element.columns[0]) });
  const tag = c.node('ERDEntity', 400, 300, { name: 'tag' });
  const places = c.edge('erd:1:0..*', customer, orders, { name: 'places' });
  const many = c.edge('erd:0..*:0..*', orders, tag);
  const loose = c.edge('erd:1:0..*:n', customer, tag);
  const r = c.render();
  look(r, customer, { text: ['customer', 'PK', 'id', 'INTEGER', 'email', 'VARCHAR(120)'] });
  look(r, orders, { text: ['orders', 'FK', 'customer_id'] });
  const crow = look(r, places, { text: ['places'], dash: '' });
  assert.equal((crow.match(/<circle/g) ?? []).length, 1, '1 : 0..* — one "zero" circle');
  assert.equal((r.of(many).match(/<circle/g) ?? []).length, 2, '0..* : 0..* — a circle at each end');
  assert.equal(/stroke-dasharray="([^"]+)"/.exec(r.of(loose))?.[1], '6 4', 'non-identifying: dashed');
});

test('Flowchart: terminator, data (I/O), decision, process, document, database symbols and labelled flows with filled arrows', () => {
  const c = canvas('FCFlowchartDiagram');
  const start = c.node('FCTerminator', 0, 0, { name: 'Start' });
  const read = c.node('FCData', 0, 120, { name: 'Read n' });
  const test = c.node('FCDecision', 0, 240, { name: 'n > 0?' });
  const add = c.node('FCProcess', 240, 240, { name: 'sum += n' });
  const ledger = c.node('FCDatabase', 480, 240, { name: 'Ledger' });
  const report = c.node('FCDocument', 480, 0, { name: 'Report' });
  c.edge('FCFlow', start, read); c.edge('FCFlow', read, test);
  const yes = c.edge('FCFlow', test, add, { name: 'yes' });
  c.edge('FCFlow', add, ledger); c.edge('FCFlow', add, report);
  const r = c.render();
  for (const [node, name] of [[start, 'Start'], [read, 'Read n'], [test, 'n > 0?'], [add, 'sum += n'], [ledger, 'Ledger'], [report, 'Report']]) look(r, node, { text: [name] });
  assert.notEqual(r.of(start).replace(/>[^<]*</g, '><'), r.of(add).replace(/>[^<]*</g, '><'), 'terminator and process have different outlines');
  look(r, yes, { text: ['yes'], mark: ['filled'] });
});

test('Data flow diagram: external entity, numbered process, numbered data store and named data flows', () => {
  const c = canvas('DFDDiagram');
  const ext = c.node('DFDExternalEntity', 0, 0, { name: 'Customer' });
  const proc = c.node('DFDProcess', 300, 0, { name: 'Take Order', id: '1.0' });
  const store = c.node('DFDDataStore', 300, 220, { name: 'Orders', id: 'D1' });
  const order = c.edge('DFDDataFlow', ext, proc, { name: 'order' });
  const record = c.edge('DFDDataFlow', proc, store, { name: 'record' });
  const r = c.render();
  look(r, ext, { text: ['Customer'] });
  look(r, proc, { text: ['1.0', 'Take Order'] });
  look(r, store, { text: ['D1', 'Orders'] });
  look(r, order, { text: ['order'], mark: ['filled'] });
  look(r, record, { text: ['record'], mark: ['filled'] });
});

test('SysML requirement diagram: requirements with id and text, «satisfy», «verify», «deriveReqt» and containment', () => {
  const c = canvas('SysMLRequirementDiagram');
  const range = c.node('SysMLRequirement', 0, 0, { name: 'Range', text: 'Drive 500 km' });
  const battery = c.node('SysMLRequirement', 320, 0, { name: 'Battery' });
  const pack = c.node('SysMLBlock', 0, 320, { name: 'Pack' });
  const rangeTest = c.node('UMLUseCase', 320, 320, { name: 'Range Test' });
  const satisfy = c.edge('SysMLSatisfy', pack, range);
  const verify = c.edge('SysMLVerify', rangeTest, range);
  const derive = c.edge('SysMLDeriveReqt', battery, range);
  const part = c.edge('UMLContainment', range, battery);
  const r = c.render();
  look(r, range, { text: ['«requirement»', 'Range', 'Id = "REQ-001"', 'Text = "Drive 500 km"'] });
  look(r, battery, { text: ['Id = "REQ-002"'] });
  look(r, pack, { text: ['«block»', 'Pack'] });
  look(r, satisfy, { text: ['«satisfy»'], mark: ['open'], dash: '6 4' });
  look(r, verify, { text: ['«verify»'], mark: ['open'], dash: '6 4' });
  look(r, derive, { text: ['«deriveReqt»'], mark: ['open'], dash: '6 4' });
  assert.match(r.of(part), /<circle[^>]*r="6"/, 'containment');
});

test('SysML block definition diagram: blocks with parts and values compartments, value type, constraint block {f = m * a}, interface block, composition', () => {
  const c = canvas('SysMLBlockDefinitionDiagram');
  const car = c.node('SysMLBlock', 0, 0, { name: 'Car' });
  const engine = c.node('SysMLBlock', 320, 0, { name: 'Engine' });
  c.add(car, 'SysMLPart', { name: 'engine', type: M.ref(engine.element) });
  c.add(car, 'SysMLValue', { name: 'mass', type: 'kg' });
  const kg = c.node('SysMLValueType', 640, 0, { name: 'kg', unit: 'kilogram' });
  const newton = c.node('SysMLConstraintBlock', 640, 300, { name: 'Newton', constraint: 'f = m * a' });
  const port = c.node('SysMLInterfaceBlock', 320, 300, { name: 'FuelPort' });
  const comp = c.edge('composition', car, engine, { end2: { multiplicity: '1' } });
  const r = c.render();
  const svg = look(r, car, { text: ['«block»', 'Car', 'parts', '+engine: Engine', 'values', '+mass: kg'] });
  const order = texts(svg);
  assert.ok(order.indexOf('values') > order.indexOf('+engine: Engine') && order.indexOf('+mass: kg') > order.indexOf('values'), 'value properties are listed under "values"');
  look(r, kg, { text: ['«valueType»', 'kg'] });
  look(r, newton, { text: ['«constraint»', 'Newton', 'constraints', '{f = m * a}'] });
  look(r, port, { text: ['«interfaceBlock»', 'FuelPort'] });
  look(r, comp, { text: ['1'], mark: ['composite'] });
});

test('SysML internal block diagram: parts and a port inside the block frame, connector and item flow', () => {
  const c = canvas('SysMLInternalBlockDiagram');
  const car = c.node('SysMLBlock', 0, 0, { name: 'Car' }, { w: 520, h: 300 });
  const engine = c.node('SysMLPart', 20, 60, { name: 'engine', type: 'Engine' });
  const wheels = c.node('SysMLPart', 300, 60, { name: 'wheels', type: 'Wheel', multiplicity: '4' });
  const fuel = c.node('SysMLPort', 0, 150, { name: 'fuel', type: 'FuelPort' });
  const conn = c.edge('SysMLConnector', engine, wheels);
  const flow = c.edge('SysMLItemFlow', engine, wheels, { itemProperty: 'torque' });
  assert.equal(ownerOf(c, engine), car.element);
  assert.equal(ownerOf(c, fuel), car.element);
  const r = c.render();
  look(r, engine, { text: ['engine : Engine'] });
  look(r, wheels, { text: ['wheels : Wheel [4]'] });
  look(r, fuel, { text: ['fuel'] });
  look(r, conn, { mark: [] });
  look(r, flow, { mark: ['filled'] });
});

test('SysML parametric diagram: constraint property and parameters bound to value parts by connectors', () => {
  const c = canvas('SysMLParametricDiagram');
  const dynamics = c.node('SysMLConstraintBlock', 0, 0, { name: 'Dynamics', constraint: 'f = m * a' }, { w: 520, h: 300 });
  const newton = c.node('SysMLConstraintProperty', 160, 60, { name: 'newton', type: M.ref(dynamics.element) });
  const f = c.node('SysMLConstraintParameter', 20, 60, { name: 'f' });
  const mass = c.node('SysMLPart', 340, 60, { name: 'mass' });
  const bind = c.edge('SysMLConnector', f, mass);
  assert.equal(ownerOf(c, f), dynamics.element, 'the parameter belongs to the constraint block');
  const r = c.render();
  look(r, dynamics, { text: ['«constraint»', 'Dynamics', 'parameters', 'f'] });
  look(r, newton, { text: ['newton'] });
  look(r, f, { text: ['f'] });
  look(r, mass, { text: ['mass'] });
  look(r, bind, { mark: [] });
});

test('BPMN diagram: pools and a lane, message start event, user task, exclusive and parallel gateways, sub-process, data object, sequence / default / message flows and data association', () => {
  const c = canvas('BPMNDiagram');
  const shop = c.node('BPMNParticipant', 0, 0, { name: 'Shop' }, { w: 800, h: 300 });
  const sales = c.node('BPMNLane', 32, 0, { name: 'Sales' }, { w: 768, h: 150 });
  const received = c.node('BPMNStartEvent:message', 60, 50, { name: 'Order received' });
  const check = c.node('task:user', 160, 40, { name: 'Check order' });
  const okGate = c.node('BPMNExclusiveGateway', 320, 50, { name: 'ok?' });
  const both = c.node('BPMNParallelGateway', 420, 50);
  const ship = c.node('BPMNSubProcess', 500, 160, { name: 'Ship' }, { w: 200, h: 120 });
  const done = c.node('BPMNEndEvent', 700, 50, { name: 'Done' });
  const invoice = c.node('BPMNDataObject', 160, 400, { name: 'Invoice' });
  const customer = c.node('BPMNParticipant', 0, 500, { name: 'Customer' }, { w: 800, h: 150 });
  const seq = c.edge('BPMNSequenceFlow', received, check);
  const dflt = c.edge('BPMNSequenceFlow', okGate, done, { conditionExpression: 'valid', isDefault: true });
  const msg = c.edge('BPMNMessageFlow', customer, received);
  const data = c.edge('BPMNDataAssociation', check, invoice);
  assert.equal(check.element.taskKind, 'user');
  const r = c.render();
  look(r, shop, { text: ['Shop'] });
  look(r, sales, { text: ['Sales'] });
  look(r, received, { text: ['Order received'] });
  assert.ok((r.of(received).match(/<path|<rect|<polygon/g) ?? []).length >= 1, 'a message start event has an envelope');
  look(r, check, { text: ['Check order'] });
  look(r, okGate, { text: ['ok?'] });
  assert.notEqual(r.of(okGate).replace(/<text[\s\S]*<\/text>/, ''), r.of(both), 'X and + gateways differ');
  look(r, ship, { text: ['Ship'] });
  look(r, done, { text: ['Done'] });
  look(r, invoice, { text: ['Invoice'] });
  look(r, seq, { mark: ['filled'], dash: '' });
  const d = look(r, dflt, { text: ['[valid]'], mark: ['filled'] });
  assert.match(d, /<path d="M[^"]*" stroke=/, 'a default flow has a slash');
  look(r, msg, { mark: ['triangle', 'circle'], dash: '6 4' });
  look(r, data, { mark: ['open'], dash: '2 3' });
});

test('C4 diagram: person, system boundary with containers and a database, external system, relationship with technology', () => {
  const c = canvas('C4Diagram');
  const person = c.node('C4Person', 0, 0, { name: 'Customer', description: 'Buys things' });
  const boundary = c.node('C4Boundary', 300, 0, { name: 'Shop' }, { w: 520, h: 300 });
  const web = c.node('C4Container', 320, 60, { name: 'Web App', technology: 'React' });
  const db = c.node('C4ContainerDatabase', 580, 60, { name: 'DB', technology: 'PostgreSQL' });
  const payments = c.node('externalSystem', 0, 400, { name: 'Payments' });
  const uses = c.edge('C4Relationship', person, web, { name: 'Uses', technology: 'HTTPS' });
  assert.ok(ancestorsOf(c, web).includes(boundary.element) || ownerOf(c, web)._type === 'C4Model', 'containers are drawn inside the boundary');
  const r = c.render();
  look(r, person, { text: ['Customer', '[Person]', 'Buys things'] });
  look(r, boundary, { text: ['Shop', '[System]'], dash: '8 4' });
  look(r, web, { text: ['Web App', '[Container: React]'] });
  look(r, db, { text: ['DB', '[Container: PostgreSQL]'] });
  look(r, payments, { text: ['Payments', '[External Software System]'] });
  look(r, uses, { text: ['Uses', '[HTTPS]'], mark: ['open'], dash: '6 4' });
});

test('Mind map: a central topic with branches; a branch makes the child node part of its parent', () => {
  const c = canvas('MMMindmapDiagram');
  const trip = c.node('MMNode', 0, 0, { name: 'Trip' });
  const packing = c.node('MMNode', 300, -120, { name: 'Packing' });
  const tickets = c.node('MMNode', 300, 120, { name: 'Tickets' });
  const branch = c.edge('branch', trip, packing);
  c.edge('branch', trip, tickets);
  assert.equal(ownerOf(c, packing), trip.element);
  assert.equal(ownerOf(c, tickets), trip.element);
  const r = c.render();
  look(r, trip, { text: ['Trip'] });
  look(r, packing, { text: ['Packing'] });
  look(r, branch, { mark: [], dash: '' });
});

test('Wireframe: a web frame with an input, a checked check box, a button and a drop-down', () => {
  const c = canvas('WFWireframeDiagram');
  const frame = c.node('WFWebFrame', 0, 0, { name: 'Login' }, { w: 400, h: 320 });
  const email = c.node('WFInput', 20, 60, { name: 'Email' });
  const remember = c.node('WFCheckbox', 20, 120, { name: 'Remember me', checked: true });
  const signIn = c.node('WFButton', 20, 180, { name: 'Sign in' });
  const lang = c.node('WFDropdown', 200, 60, { name: 'Language', items: 'English,Korean' });
  assert.equal(ownerOf(c, signIn), ownerOf(c, frame), 'widgets live in the wireframe model');
  const r = c.render();
  look(r, frame, { text: ['Login'] });
  look(r, email, { text: ['Email'] });
  const box = look(r, remember, { text: ['Remember me'] });
  const unchecked = canvas('WFWireframeDiagram');
  const off = unchecked.node('WFCheckbox', 0, 0, { name: 'Remember me', checked: false });
  assert.notEqual(box, unchecked.render().of(off), 'a checked box draws a check mark');
  look(r, signIn, { text: ['Sign in'] });
  look(r, lang, { text: ['Language'] });
});

for (const [type, group, services, connected] of [
  ['AWSDiagram', 'group:vpc', ['service:EC2', 'service:RDS'], ['EC2', 'RDS']],
  ['AzureDiagram', 'group:resourceGroup', ['service:App Service', 'service:SQL Database'], ['App Service', 'SQL Database']],
  ['GCPDiagram', 'group:project', ['service:Cloud Run', 'service:Cloud SQL'], ['Cloud Run', 'Cloud SQL']],
]) {
  test(`${type.replace('Diagram', '')} architecture diagram: a ${group.slice(6)} group holding two services joined by a connection`, () => {
    const c = canvas(type);
    const g = c.node(group, 0, 0, {}, { w: 600, h: 300 });
    const a = c.node(services[0], 40, 80);
    const b = c.node(services[1], 320, 80);
    const conn = c.edge('CloudConnection', a, b, { name: 'SQL' });
    assert.deepEqual([a.element.service, b.element.service], connected);
    assert.equal(a.element.provider, type.replace('Diagram', '').toLowerCase());
    const r = c.render();
    look(r, g, { text: [g.element.name] });
    look(r, a, { text: [connected[0]] });
    look(r, b, { text: [connected[1]] });
    look(r, conn, { text: ['SQL'], mark: ['filled'] });
  });
}

// ───────────────────────── StarUML features

test('quick edit: "+name: Type [0..*] = 1 {readOnly}" and "+op(in a: int): bool {query}" and "«stereo» Name" are read back into fields', () => {
  assert.deepEqual(parseAttribute('+ items: Item [0..*] = [] {readOnly, ordered}'), { name: 'items', visibility: 'public', type: 'Item', multiplicity: '0..*', defaultValue: '[]', isReadOnly: true, isOrdered: true });
  assert.deepEqual(parseAttribute('/total: Money'), { name: 'total', isDerived: true, type: 'Money' });
  assert.deepEqual(parseAttribute('~ id {id}'), { name: 'id', visibility: 'package', isID: true });
  assert.equal(parseAttribute(''), null);
  const op = parseOperation('# find(in id: long, out log: List<String>, inout n: int = 0): Order {query}');
  assert.equal(op.name, 'find');
  assert.equal(op.visibility, 'protected');
  assert.equal(op.isQuery, true);
  assert.deepEqual(op.parameters.map((p) => [p.direction, p.name, p.type, p.defaultValue ?? '']), [['in', 'id', 'long', ''], ['out', 'log', 'List<String>', ''], ['inout', 'n', 'int', '0'], ['return', '', 'Order', '']]);
  assert.equal(parseOperation('- run() {abstract}').isAbstract, true);
  assert.deepEqual(splitTop('a: Map<K, V>, b: int'), ['a: Map<K, V>', 'b: int']);
  assert.deepEqual(parseNameWithStereotype('«entity» Order'), { name: 'Order', stereotype: 'entity' });
  assert.deepEqual(parseNameWithStereotype('Form <<boundary>>'), { name: 'Form', stereotype: 'boundary' });
  assert.deepEqual(parseNameWithStereotype('Plain'), { name: 'Plain' });
  // What is parsed shows the same way again (the text StarUML puts in the quick-edit box).
  const index = M.buildIndex(M.createProject());
  assert.equal(attributeText(parseAttribute('-count: int [1] = 0 {readOnly}'), index), '-count: int[1] = 0 {readOnly}');
  assert.equal(operationText({ ...op, visibility: 'protected' }, index), '#find(id: long, out log: List<String>, inout n: int = 0): Order {query}');
});

test('Model Explorer: move into a package, reorder siblings, delete from the model (views everywhere and dangling relationships go) vs delete from the diagram (the model stays)', () => {
  const c = canvas('UMLClassDiagram');
  const model = c.project.ownedElements[0];
  const pkg = M.addElement(c.project, model._id, 'UMLPackage', { name: 'domain' });
  const a = c.node('UMLClass', 0, 0, { name: 'A' });
  const b = c.node('UMLClass', 300, 0, { name: 'B' });
  const gen = c.edge('UMLGeneralization', a, b);
  const second = M.addDiagram(c.project, model._id, 'UMLClassDiagram', { language: 'en', name: 'Other' });
  M.showElement(c.project, second, b.element._id, { x: 0, y: 0 });
  // Move (drag in the explorer): allowed into a package, refused into a class's own child or a non-namespace.
  assert.equal(M.moveElement(c.project, a.element._id, pkg._id), true);
  assert.equal(M.ownerOf(c.project, a.element._id), pkg);
  assert.equal(M.moveElement(c.project, pkg._id, pkg._id), false, 'not into itself');
  const attr = c.add(b, 'UMLAttribute', { name: 'x' });
  assert.equal(M.moveElement(c.project, pkg._id, attr._id), false, 'not into an attribute');
  // Reorder (Move Up / Move Down).
  const y = c.add(b, 'UMLAttribute', { name: 'y' });
  assert.equal(M.reorderElement(c.project, y._id, -1), true);
  assert.deepEqual(b.element.attributes.map((x) => x.name), ['y', 'x']);
  assert.equal(M.reorderElement(c.project, y._id, -1), false, 'already first');
  // Delete from the diagram only: the class stays in the model and on the other diagram.
  M.removeViews(c.diagram, [b.view._id]);
  assert.ok(M.findById(c.project, b.element._id), 'still in the model');
  assert.ok(!c.diagram.ownedViews.some((v) => v._id === gen.view._id), 'its lines go with the view');
  assert.ok(M.findById(c.project, gen.element._id), 'the generalization stays in the model');
  // Delete from the model: gone from every diagram, and the generalization that needs it goes too.
  M.removeElements(c.project, [b.element._id]);
  assert.equal(M.findById(c.project, b.element._id), null);
  assert.equal(M.findById(c.project, gen.element._id), null, 'dependent relationship removed');
  assert.deepEqual(second.ownedViews, [], 'views on other diagrams removed');
  // Copy / paste gives new ids and keeps links inside the copy.
  const { items } = M.cloneWithNewIds([pkg]);
  assert.notEqual(items[0]._id, pkg._id);
  assert.notEqual(items[0].ownedElements[0]._id, a.element._id);
});

test('Format options change the drawing: suppress attributes / operations, stereotype display label · decoration · icon · none, show visibility, operation signature, word wrap, line styles', () => {
  const c = canvas('UMLClassDiagram');
  const order = c.node('UMLClass', 0, 0, { name: 'OrderService', stereotype: 'control' });
  c.add(order, 'UMLAttribute', { name: 'count', type: 'int', visibility: 'private' });
  const op = c.add(order, 'UMLOperation', { name: 'total', visibility: 'public' });
  c.add(op, 'UMLParameter', { name: 'tax', type: 'double' });
  c.add(op, 'UMLParameter', { type: 'Money', direction: 'return' });
  const iface = c.node('UMLInterface', 400, 0, { name: 'Billing' });
  const other = c.node('UMLClass', 0, 300, { name: 'Long Name Of A Very Important Class' });
  const line = c.edge('UMLDependency', order, other);
  const t = () => texts(c.render().of(order));
  assert.ok(t().includes('-count: int') && t().includes('+total(tax: double): Money'));
  order.view.suppressAttributes = true;
  assert.ok(!t().includes('-count: int'), 'suppress attributes');
  order.view.suppressOperations = true;
  assert.ok(!t().some((x) => x.includes('total')), 'suppress operations');
  order.view.suppressAttributes = false; order.view.suppressOperations = false;
  order.view.showVisibility = false;
  assert.ok(t().includes('count: int') && t().includes('total(tax: double): Money'), 'visibility hidden');
  order.view.showVisibility = true;
  order.view.showOperationSignature = false;
  assert.ok(t().includes('+total()'), 'signature hidden');
  order.view.showOperationSignature = true;
  // Stereotype display.
  assert.ok(t().includes('«control»'), 'label');
  order.view.stereotypeDisplay = 'none';
  assert.ok(!t().includes('«control»'), 'none hides the stereotype');
  order.view.stereotypeDisplay = 'label';
  iface.view.stereotypeDisplay = 'decoration';
  const decorated = c.render().of(iface);
  assert.ok(texts(decorated).includes('«interface»') && /<circle/.test(decorated), 'decoration: the label and a small icon');
  iface.view.stereotypeDisplay = 'icon';
  const icon = c.render().of(iface);
  assert.ok(!texts(icon).includes('«interface»') && /<circle/.test(icon) && texts(icon).includes('Billing'), 'icon: the lollipop with the name below');
  // Robustness stereotypes shown as icons (StarUML: «boundary», «control», «entity»).
  order.view.stereotypeDisplay = 'icon';
  const controlIcon = c.render().of(order);
  assert.ok(!texts(controlIcon).includes('«control»') && texts(controlIcon).includes('OrderService') && /<circle/.test(controlIcon), 'a «control» class as its icon');
  order.view.stereotypeDisplay = 'label';
  // Word wrap: a narrow view breaks the name into lines.
  other.view.width = 120; other.view.autoResize = false;
  const one = texts(c.render().of(other)).filter((x) => /Long|Name|Class/.test(x)).length;
  other.view.wordWrap = true;
  const many = texts(c.render().of(other)).filter((x) => /Long|Name|Class|Important/.test(x)).length;
  assert.ok(one === 1 && many > 1, `word wrap (${one} → ${many} lines)`);
  // Line styles.
  line.view.points = [{ x: 200, y: 200 }];
  const path = (style) => { line.view.lineStyle = style; return /<path d="([^"]+)" fill="none" stroke="[^t]/.exec(c.render().of(line))[1]; };
  const rect = path('rectilinear');
  const pairs = [...rect.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(pairs.every((p, i) => !i || p[0] === pairs[i - 1][0] || p[1] === pairs[i - 1][1]), 'rectilinear: right angles');
  assert.ok(!/[CQ]/.test(path('oblique')), 'oblique: straight segments');
  assert.match(path('curve'), /C/, 'curve: a Bézier curve');
  assert.match(path('roundRect'), /Q/, 'rounded corners');
});

test('automatic layout: a layered layout in four directions keeps superclasses above and separates every node', () => {
  for (const direction of LAYOUT_DIRECTIONS) {
    const c = canvas('UMLClassDiagram');
    const base = c.node('UMLClass', 0, 0, { name: 'Base' });
    const kids = [1, 2, 3].map((i) => c.node('UMLClass', 0, 0, { name: `Kid${i}` }));
    for (const kid of kids) c.edge('UMLGeneralization', kid, base);
    const boxes = new Map(c.diagram.ownedViews.filter((v) => !M.isEdgeView(v)).map((v) => [v._id, c.boxes.get(v._id)]));
    assert.ok(layoutDiagram(c.diagram, boxes, c.index(), { direction }) > 0, `${direction}: views moved`);
    const at = (x) => ({ x: x.view.left, y: x.view.top });
    if (direction === 'TB') assert.ok(kids.every((k) => at(k).y > at(base).y));
    if (direction === 'BT') assert.ok(kids.every((k) => at(k).y < at(base).y));
    if (direction === 'LR') assert.ok(kids.every((k) => at(k).x > at(base).x));
    if (direction === 'RL') assert.ok(kids.every((k) => at(k).x < at(base).x));
    assert.equal(new Set([base, ...kids].map((x) => `${at(x).x},${at(x).y}`)).size, 4, `${direction}: no two nodes on one spot`);
  }
});

test('model fragments (.mfj): a package with classes, a relationship and a diagram goes out and comes back in with new ids and its references intact', () => {
  const c = canvas('UMLClassDiagram');
  const model = c.project.ownedElements[0];
  const pkg = M.addElement(c.project, model._id, 'UMLPackage', { name: 'billing' });
  const invoice = M.addElement(c.project, pkg._id, 'UMLClass', { name: 'Invoice' });
  const line = M.addElement(c.project, pkg._id, 'UMLClass', { name: 'Line' });
  M.addElement(c.project, invoice._id, 'UMLAttribute', { name: 'lines', type: M.ref(line), multiplicity: '1..*' });
  M.addElement(c.project, pkg._id, 'UMLAssociation', { end1: { reference: M.ref(invoice), aggregation: 'composite' }, end2: { reference: M.ref(line), multiplicity: '1..*' } });
  const d = M.addDiagram(c.project, pkg._id, 'UMLClassDiagram', { language: 'en', name: 'Billing' });
  M.showElement(c.project, d, invoice._id, { x: 0, y: 0 });
  M.showElement(c.project, d, line._id, { x: 300, y: 0 });
  M.addMissingEdgeViews(c.project, d);
  const text = exportFragment(pkg);
  const data = JSON.parse(text);
  assert.equal(data._type, 'UMLPackage');
  assert.equal(data._parent, undefined, 'a fragment has no owner');
  const back = importFragment(text);
  M.insertElement(model, back);
  const index = M.buildIndex(c.project);
  const [inv2, line2] = ['Invoice', 'Line'].map((n) => back.ownedElements.find((e) => e.name === n));
  assert.notEqual(inv2._id, invoice._id, 'new ids');
  assert.equal(index.get(M.refId(inv2.attributes[0].type)), line2, 'an attribute type points into the copy');
  const assoc = back.ownedElements.find((e) => e._type === 'UMLAssociation');
  assert.equal(index.get(M.refId(assoc.end2.reference)), line2);
  const d2 = back.ownedElements.find((e) => e._type === 'UMLClassDiagram');
  assert.equal(d2.ownedViews.length, 3, 'the diagram and its views come along');
  assert.ok(d2.ownedViews.every((v) => !v.model || index.get(M.refId(v.model))), 'views point at the copies');
  assert.throws(() => importFragment(exportMdj(c.project)), /notFragment/, 'a whole project is not a fragment');
});

/** A model for code generation: geo { Drawable, abstract Shape implements Drawable, Circle extends Shape, Canvas ◆→ shapes 0..* }. */
function geometry() {
  const project = M.createProject({ diagram: null });
  const model = project.ownedElements[0];
  const pkg = M.addElement(project, model._id, 'UMLPackage', { name: 'geo' });
  const drawable = M.addElement(project, pkg._id, 'UMLInterface', { name: 'Drawable' });
  M.addElement(project, drawable._id, 'UMLOperation', { name: 'draw' });
  const shape = M.addElement(project, pkg._id, 'UMLClass', { name: 'Shape', isAbstract: true });
  M.addElement(project, shape._id, 'UMLAttribute', { name: 'name', type: 'String', visibility: 'protected' });
  const area = M.addElement(project, shape._id, 'UMLOperation', { name: 'area', isAbstract: true });
  M.addElement(project, area._id, 'UMLParameter', { type: 'double', direction: 'return' });
  const circle = M.addElement(project, pkg._id, 'UMLClass', { name: 'Circle' });
  M.addElement(project, circle._id, 'UMLAttribute', { name: 'radius', type: 'double', visibility: 'private' });
  const board = M.addElement(project, pkg._id, 'UMLClass', { name: 'Canvas' });
  M.addElement(project, pkg._id, 'UMLGeneralization', { source: M.ref(circle), target: M.ref(shape) });
  M.addElement(project, pkg._id, 'UMLInterfaceRealization', { source: M.ref(shape), target: M.ref(drawable) });
  M.addElement(project, pkg._id, 'UMLAssociation', { end1: { reference: M.ref(board), aggregation: 'composite' }, end2: { reference: M.ref(shape), name: 'shapes', multiplicity: '0..*', navigable: 'navigable' } });
  return { project, pkg };
}

const GENERATED = {
  java: { files: ['geo/Drawable.java', 'geo/Shape.java', 'geo/Circle.java', 'geo/Canvas.java'], shape: /public abstract class Shape implements Drawable \{/, circle: /public class Circle extends Shape \{/, canvas: /List<Shape> shapes;/, abstract: /public abstract double area\(\);/ },
  csharp: { files: ['geo/Drawable.cs', 'geo/Shape.cs', 'geo/Circle.cs', 'geo/Canvas.cs'], shape: /public abstract class Shape : Drawable/, circle: /public class Circle : Shape/, canvas: /List<Shape> shapes;/, abstract: /public abstract double area\(\);/ },
  cpp: { files: ['geo/Drawable.h', 'geo/Shape.h', 'geo/Shape.cpp', 'geo/Circle.h', 'geo/Circle.cpp', 'geo/Canvas.h', 'geo/Canvas.cpp'], shape: /class Shape : public Drawable \{/, circle: /class Circle : public Shape \{/, canvas: /std::vector<Shape\*> shapes;/, abstract: /virtual double area\(\) = 0;/ },
  python: { files: ['geo/Drawable.py', 'geo/Shape.py', 'geo/Circle.py', 'geo/Canvas.py'], shape: /class Shape\(Drawable, ABC\):/, circle: /class Circle\(Shape\):/, canvas: /self\.shapes: list\[Shape\] = \[\]/, abstract: /@abstractmethod\s+def area\(self\) -> float:/ },
  typescript: { files: ['geo/Drawable.ts', 'geo/Shape.ts', 'geo/Circle.ts', 'geo/Canvas.ts'], shape: /export abstract class Shape implements Drawable \{/, circle: /export class Circle extends Shape \{/, canvas: /public shapes: Shape\[\];/, abstract: /public abstract area\(\): number;/ },
  kotlin: { files: ['geo/Drawable.kt', 'geo/Shape.kt', 'geo/Circle.kt', 'geo/Canvas.kt'], shape: /abstract class Shape : Drawable \{/, circle: /class Circle : Shape\(\) \{/, canvas: /var shapes: List<Shape> = listOf\(\)/, abstract: /abstract fun area\(\): Double/ },
  php: { files: ['geo/Drawable.php', 'geo/Shape.php', 'geo/Circle.php', 'geo/Canvas.php'], shape: /abstract class Shape implements Drawable/, circle: /class Circle extends Shape/, canvas: /public array \$shapes = \[\];/, abstract: /abstract public function area\(\): float;/ },
};

for (const [language, expected] of Object.entries(GENERATED)) {
  test(`code generation (${language}): inheritance, interface realization, abstract operation and a 0..* association as a collection`, () => {
    const { project, pkg } = geometry();
    const files = generateCode(project, pkg._id, language);
    assert.deepEqual(files.map((f) => f.path), expected.files);
    const of = (name) => files.find((f) => f.path.startsWith(`geo/${name}.`) && !/\.cpp$/.test(f.path)).content;
    assert.match(of('Shape'), expected.shape);
    assert.match(of('Shape'), expected.abstract);
    assert.match(of('Circle'), expected.circle);
    assert.match(of('Canvas'), expected.canvas);
  });
}

test('code generation (SQL DDL): an ER model becomes CREATE TABLE statements with keys in each dialect', () => {
  const c = canvas('ERDDiagram');
  const customer = c.node('ERDEntity', 0, 0, { name: 'customer' });
  const orders = c.node('ERDEntity', 300, 0, { name: 'orders' });
  c.add(orders, 'ERDColumn', { name: 'customer_id', type: 'INTEGER', foreignKey: true, referenceTo: M.ref(customer.element.columns[0]) });
  for (const dialect of SQL_DIALECTS.map((d) => d.id)) {
    const [file] = generateCode(c.project, null, 'sql', { dialect });
    assert.match(file.content, /CREATE TABLE [`"[]?customer[`"\]]?/i, `${dialect}: customer table`);
    assert.match(file.content, /PRIMARY KEY/i, `${dialect}: primary key`);
    assert.match(file.content, /FOREIGN KEY|REFERENCES/i, `${dialect}: foreign key`);
    assert.ok(file.content.indexOf('customer') < file.content.indexOf('orders'), `${dialect}: referenced table first`);
  }
});

for (const language of ['java', 'csharp', 'cpp', 'python', 'typescript', 'kotlin', 'php']) {
  test(`reverse engineering (${language}): generated sources read back as the same classes, generalization, realization and association`, () => {
    const { project, pkg } = geometry();
    const files = generateCode(project, pkg._id, language).map((f) => ({ name: f.path, content: f.content }));
    const { elements, warnings } = reverseEngineer(files, language);
    assert.deepEqual(warnings.filter((w) => w.code === 'reverse.parseError'), []);
    const back = M.createProject({ diagram: null });
    for (const e of elements) M.insertElement(back.ownedElements[0], e);
    const index = M.buildIndex(back);
    const all = M.elementsWhere(back, () => true);
    const named = (n) => all.find((e) => ['UMLClass', 'UMLInterface'].includes(e._type) && e.name === n);
    assert.equal(named('Drawable')._type, 'UMLInterface');
    assert.ok(named('Shape').isAbstract, 'abstract class');
    const ends = (r) => M.relationshipEnds(r).map((id) => index.get(id)?.name).join(' → ');
    assert.ok(all.some((e) => e._type === 'UMLGeneralization' && ends(e) === 'Circle → Shape'), 'generalization');
    assert.ok(all.some((e) => e._type === 'UMLInterfaceRealization' && ends(e) === 'Shape → Drawable'), 'realization');
    const assoc = all.find((e) => e._type === 'UMLAssociation' && ends(e) === 'Canvas → Shape');
    assert.ok(assoc, 'the collection field is an association');
    assert.equal(assoc.end2.name, 'shapes');
    assert.match(assoc.end2.multiplicity, /\*/);
    assert.ok((named('Circle').attributes ?? []).some((a) => a.name === 'radius' && a.visibility === 'private'), 'attribute');
  });
}

test('reverse engineering (SQL DDL): tables, columns, keys and foreign keys become an ER model', () => {
  const sql = 'CREATE TABLE customer (\n  id INTEGER NOT NULL PRIMARY KEY,\n  email VARCHAR(120) UNIQUE\n);\nCREATE TABLE orders (\n  id INTEGER PRIMARY KEY,\n  customer_id INTEGER NOT NULL REFERENCES customer(id)\n);\n';
  const { elements } = reverseEngineer([{ name: 'shop.sql', content: sql }], 'sql');
  const project = M.createProject({ diagram: null });
  for (const e of elements) M.insertElement(project, e);
  const entities = M.elementsWhere(project, (e) => e._type === 'ERDEntity');
  assert.deepEqual(entities.map((e) => e.name).sort(), ['customer', 'orders']);
  const customer = entities.find((e) => e.name === 'customer');
  assert.deepEqual(customer.columns.map((col) => [col.name, col.type, Boolean(col.primaryKey)]), [['id', 'INTEGER', true], ['email', 'VARCHAR', false]]);
  assert.equal(customer.columns[1].length, '120');
  assert.ok(M.elementsWhere(project, (e) => e._type === 'ERDRelationship').length === 1, 'the foreign key is a relationship');
});

test('HTML and Markdown documents: every diagram as a picture, elements with their members, cross references and navigation', () => {
  const project = buildSample('en');
  const html = htmlDocs(project, { language: 'en', renderDiagram: (d) => `<svg data-diagram="${d._id}"></svg>` });
  assert.match(html, /^<!doctype html>/i);
  for (const d of M.allDiagrams(project)) assert.ok(html.includes(`data-diagram="${d._id}"`), `picture of ${d.name}`);
  const order = M.elementsWhere(project, (e) => e._type === 'UMLClass' && e.name === 'Order')[0];
  assert.ok((html.match(/ id="e-/g) ?? []).length >= M.allDiagrams(project).length, 'an anchor per element');
  assert.match(html, />Order</, 'the class has its section');
  const targets = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const broken = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => !targets.has(id));
  assert.deepEqual(broken, [], 'every link inside the page has a target');
  for (const attr of order.attributes) assert.ok(html.includes(attr.name), `attribute ${attr.name}`);
  const md = markdownDocs(project, { language: 'en', imageLink: (d) => `images/${d._id}.png` });
  assert.match(md, /^# /);
  for (const d of M.allDiagrams(project)) assert.ok(md.includes(`](images/${d._id}.png)`), `image link of ${d.name}`);
  assert.match(md, /\| Name \|/, 'member tables');
});

test('validation: every StarUML-style rule fires on a broken model and the sample project is clean of errors', () => {
  const ids = new Set(RULES.map((r) => r.id));
  for (const id of ['name-missing', 'name-duplicate', 'generalization-cycle', 'abstract-operation-in-concrete-class', 'realization-target-not-interface', 'relationship-end-missing', 'multiplicity-invalid', 'enumeration-no-literals', 'lifeline-no-represent', 'region-no-initial', 'final-state-outgoing', 'decision-few-outgoing', 'entity-no-primary-key', 'broken-ref']) assert.ok(ids.has(id), id);
  for (const rule of RULES) assert.ok(rule.ko && rule.en && ['error', 'warning', 'info'].includes(rule.severity), `${rule.id}: messages and severity`);
  const c = canvas('UMLClassDiagram');
  const model = c.project.ownedElements[0];
  const a = M.addElement(c.project, model._id, 'UMLClass', { name: 'A' });
  const b = M.addElement(c.project, model._id, 'UMLClass', { name: 'B' });
  M.addElement(c.project, a._id, 'UMLGeneralization', { source: M.ref(a), target: M.ref(b) });
  M.addElement(c.project, b._id, 'UMLGeneralization', { source: M.ref(b), target: M.ref(a) });
  M.addElement(c.project, a._id, 'UMLOperation', { name: 'run', isAbstract: true });
  M.addElement(c.project, a._id, 'UMLAttribute', { name: 'n', multiplicity: '3..1' });
  M.addElement(c.project, model._id, 'UMLEnumeration', { name: 'Empty' });
  const fired = new Set(validate(c.project).map((p) => p.rule));
  for (const id of ['generalization-cycle', 'abstract-operation-in-concrete-class', 'multiplicity-invalid', 'enumeration-no-literals']) assert.ok(fired.has(id), `${id} fires`);
  const sampleErrors = validate(buildSample('en')).filter((p) => p.severity === 'error');
  assert.deepEqual(sampleErrors.map((p) => p.rule), [], 'the sample has no errors');
});

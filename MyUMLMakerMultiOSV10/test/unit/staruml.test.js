// StarUML conformance: every diagram type StarUML offers exists here with the
// elements and relationships of its toolbox, every tool of every toolbox creates
// an element (or an annotation) that renders, every relationship tool connects
// two of that diagram's elements, the StarUML features (quick edit, code
// generation and reverse engineering, .mdj / fragments / Mermaid / PlantUML
// interchange, HTML and Markdown documents, validation, layout, formatting,
// exports, printing, …) are present, and the sample project has a finished
// diagram of every type.
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
import { CODE_LANGUAGES, generateCode } from '../../src/domain/codegen/index.js';
import { REVERSE_LANGUAGES } from '../../src/domain/reverse/index.js';
import { exportFragment, exportMdj, importFragment, importMdj } from '../../src/domain/interop/staruml.js';
import { exportMermaid, importMermaid } from '../../src/domain/interop/mermaid.js';
import { exportPlantUml, importPlantUml } from '../../src/domain/interop/plantuml.js';
import { htmlDocs, markdownDocs } from '../../src/domain/docs.js';
import { RULES, validate } from '../../src/domain/validate.js';
import { layoutDiagram } from '../../src/domain/layout.js';

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
  assert.deepEqual(new Set(DIAGRAM_TYPE_IDS), new Set(Object.keys(STARUML)), 'diagram types');
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
  for (const id of ['java', 'csharp', 'cpp', 'python', 'typescript']) assert.ok(readers.includes(id), `reverse engineering: ${id}`);
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

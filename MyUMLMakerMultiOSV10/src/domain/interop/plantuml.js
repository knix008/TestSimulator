// PlantUML text ↔ model, for every UML diagram PlantUML has.
//
// Reading (@startuml … @enduml): class, object, package, profile, use case,
// component, deployment, composite structure, information flow (the
// "description" syntax), sequence, activity (new and legacy syntax), state,
// timing and ER (IE "entity" notation); @startmindmap. The preprocessor
// handles comments, !define / !$var substitution, !if/!ifdef, and drops
// !include, skinparam, styles, legends, headers and footers (with warnings).
// The result has the same shape as importMermaid: { owner, diagram, kind,
// warnings } with the owner not yet in a project.
//
// Writing: every diagram above; communication diagrams are written as
// sequence diagrams, interaction overviews as activities (legacy syntax, so
// that any graph can be written), information flows and composite
// structures with the description syntax, profiles as class diagrams.
//
// plantuml-more.js is asked first both ways (Gantt, WBS, JSON … live there).
// Uses the shared helpers of mermaid.js. Pure (no DOM).
import { INTERACTION_OPERATORS, TYPES, typeDef } from '../meta.js';
import { addView, canContain, createEdgeView, createElement, createNodeView, insertElement, ref, refId, siblingsIn, stereotypeName } from '../model.js';
import { diagramContent, fail, idMaker, layered, lifelineIsActor, parseMember, parseTransitionLabel, transitionLabel, typeText, visibilityChar } from './mermaid.js';
import { exportPlantUmlMore, importPlantUmlMore } from './plantuml-more.js';

// ───────────────────────── shared helpers

const q = (text) => `"${String(text ?? '').replace(/"/g, "'").replace(/\r?\n/g, '\\n')}"`;
const oneLine = (text) => String(text ?? '').replace(/\r?\n/g, '\\n');
/** PlantUML text → plain text (\n escapes become newlines). */
const nl = (text) => String(text ?? '').replace(/\\n/g, '\n').trim();
const unq = (s) => String(s ?? '').trim().replace(/^"(.*)"$/s, '$1');
const RESERVED = [
  'end', 'class', 'interface', 'enum', 'abstract', 'actor', 'participant', 'state', 'note', 'as', 'package', 'node', 'component', 'usecase', 'entity', 'alt', 'else', 'loop', 'opt', 'par', 'group', 'if', 'then', 'endif',
  'object', 'map', 'port', 'portin', 'portout', 'database', 'artifact', 'rectangle', 'folder', 'frame', 'cloud', 'queue', 'stack', 'storage', 'file', 'card', 'boundary', 'control', 'collections', 'create', 'destroy', 'return',
  'activate', 'deactivate', 'start', 'stop', 'fork', 'repeat', 'while', 'partition', 'robust', 'concise', 'binary', 'clock', 'is', 'has', 'title', 'ref', 'over', 'of', 'on', 'link', 'left', 'right', 'up', 'down', 'top', 'bottom',
  'hide', 'show', 'skinparam', 'together', 'namespace', 'annotation', 'circle', 'diamond', 'metaclass', 'stereotype', 'struct', 'exception', 'protocol', 'label', 'agent', 'person', 'break', 'critical', 'also', 'highlight',
];
const wrap = (lines, title = '') => `@startuml\n${title ? `title ${String(title).replace(/\r?\n/g, ' ')}\n` : ''}${lines.join('\n')}\n@enduml\n`;
const box = (v) => ({ x: Number(v.left ?? 0), y: Number(v.top ?? 0), w: Number(v.width ?? 0), h: Number(v.height ?? 0) });
const inside = (a, b) => b.w > 0 && b.h > 0 && a.x >= b.x && a.y >= b.y && a.x + Math.max(a.w, 1) <= b.x + b.w && a.y + Math.max(a.h, 1) <= b.y + b.h;
const overlaps = (a, b) => b.w > 0 && b.h > 0 && a.x <= b.x + b.w && a.x + Math.max(a.w, 1) >= b.x && a.y <= b.y + b.h && a.y + Math.max(a.h, 1) >= b.y;
const area = (v) => box(v).w * box(v).h;
const centerX = (v) => Number(v.left ?? 0) + (Number(v.width) || 120) / 2;
const centerY = (v) => Number(v.top ?? 0) + (Number(v.height) || 40) / 2;
const stereoTag = (text) => (text ? ` <<${text}>>` : '');
const isIdent = (s) => /^[A-Za-z_À-￿][\wÀ-￿]*$/.test(String(s ?? ''));
/** `name` or `"Long name" as id` (class-like declarations). */
const named = (name, id) => (String(name ?? '') === id ? id : `${q(name)} as ${id}`);
const lowerFirst = (s) => String(s ?? '').replace(/^./, (c) => c.toLowerCase());
const adder = (language) => (owner, type, attrs = {}) => insertElement(owner, createElement(type, attrs, { language, siblings: siblingsIn(owner, type) }));

/** Children of nodes by geometry: the smallest container view that holds a view. */
function nestByGeometry(nodes, canHold) {
  const parentOf = new Map();
  for (const n of nodes) {
    const holders = nodes.filter((m) => m !== n && canHold(m) && area(m.view) > area(n.view) && inside(box(n.view), box(m.view)));
    if (holders.length) parentOf.set(n, holders.sort((a, b) => area(a.view) - area(b.view))[0]);
  }
  return parentOf;
}

/** Note views (and the elements they are linked to) as PlantUML lines. */
function noteLines(content, id) {
  const out = [];
  for (const note of content.notes) {
    if (note._type !== 'UMLNoteView') continue;
    const linked = content.edges.filter((e) => !e.element && (e.tailView === note || e.headView === note)).map((e) => (e.tailView === note ? e.headView : e.tailView)).filter((v) => v?.model);
    const targets = linked.map((v) => content.index.get(v.model)).filter(Boolean);
    if (targets.length === 1) {
      const t = targets[0];
      const tv = linked[0];
      const dx = centerX(note) - centerX(tv);
      const dy = centerY(note) - centerY(tv);
      const side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
      out.push(`note ${side} of ${id(t._id, t.name || t._type)} : ${oneLine(note.text)}`);
    } else {
      const nid = id(note._id, 'N');
      out.push(`note ${q(note.text)} as ${nid}`);
      for (const t of targets) out.push(`${nid} .. ${id(t._id, t.name || t._type)}`);
    }
  }
  return out;
}

// ───────────────────────── writing: class, object, package, profile

function memberLines(element, index) {
  const out = [];
  for (const literal of element.literals ?? []) out.push(literal.name);
  for (const a of element.attributes ?? []) {
    const type = typeText(a.type, index);
    out.push(`${a.isStatic ? '{static} ' : ''}${visibilityChar(a.visibility)}${a.name}${type ? ` : ${type}` : ''}${a.multiplicity ? ` [${a.multiplicity}]` : ''}${a.defaultValue ? ` = ${a.defaultValue}` : ''}`);
  }
  for (const o of element.operations ?? []) {
    const params = (o.parameters ?? []).filter((p) => p.direction !== 'return').map((p) => { const t = typeText(p.type, index); return t ? `${p.name} : ${t}` : p.name; }).join(', ');
    const ret = (o.parameters ?? []).find((p) => p.direction === 'return');
    const rt = ret ? typeText(ret.type, index) : '';
    out.push(`${o.isAbstract ? '{abstract} ' : o.isStatic ? '{static} ' : ''}${visibilityChar(o.visibility)}${o.name}(${params})${rt ? ` : ${rt}` : ''}`);
  }
  for (const s of element.slots ?? []) out.push(`${s.name || index.get(s.definingFeature)?.name || 'slot'} = ${s.value ?? ''}`);
  return out;
}

const endText = (e) => [e?.multiplicity, e?.name].filter(Boolean).join(' ');
const headOf = (e, side) => (e.aggregation === 'composite' ? '*' : e.aggregation === 'shared' ? 'o' : e.navigable === 'navigable' ? side : e.navigable === 'notNavigable' ? 'x' : '');

/** Relationship line between two ids (structure diagrams). */
function relationLine(element, a, b, index) {
  const type = element._type;
  const st = stereotypeName(element, index);
  const label = (...parts) => { const t = parts.filter(Boolean).join(' '); return t ? ` : ${t}` : ''; };
  const name = oneLine(element.name || '');
  const stTag = st ? `<<${st}>>` : '';
  if (type === 'UMLGeneralization') return `${b} <|-- ${a}${label(stTag, name)}`;
  if (/Realization$/.test(type)) return `${b} <|.. ${a}${label(stTag, name)}`;
  if (type === 'UMLInclude') return `${a} ..> ${b} : <<include>>`;
  if (type === 'UMLExtend') return `${a} ..> ${b} : <<extend>>`;
  if (type === 'UMLExtension') return `${a} --|> ${b} : <<extension>>`;
  if (type === 'UMLContainment') return `${a} +-- ${b}`;
  if (type === 'UMLInformationFlow') return `${a} ..> ${b} : <<flow>>${element.conveyed || name ? ` ${oneLine(element.conveyed || name)}` : ''}`;
  const keyword = typeDef(type)?.keyword;
  if (typeDef(type)?.ends === 'directed') return `${a} ..> ${b}${label(keyword ? `<<${keyword}>>` : '', stTag, name)}`;
  if (typeDef(type)?.ends === 'association') {
    const e1 = element.end1 ?? {};
    const e2 = element.end2 ?? {};
    const lm = endText(e1) ? `${q(endText(e1))} ` : '';
    const rm = endText(e2) ? ` ${q(endText(e2))}` : '';
    const delegate = type === 'UMLConnector' && element.kind === 'delegation' ? '<<delegate>>' : '';
    return `${a} ${lm}${headOf(e1, '<')}--${headOf(e2, '>')}${rm} ${b}${label(delegate, stTag, name)}`;
  }
  return `${a} -- ${b}${label(name)}`;
}

/** Edges of a structure diagram: association ends follow end1/end2, directed ones tail → head. */
function edgeLines(edges, id, index) {
  const out = [];
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head || element._type === 'UMLAssociationClassLink') continue;
    let [x, y] = [tail, head];
    if (typeDef(element._type)?.ends === 'association' && refId(element.end1?.reference) === head._id) [x, y] = [head, tail];
    out.push(relationLine(element, id(x._id, x.name), id(y._id, y.name), index));
  }
  return out;
}

/** (A, B) .. C lines for association classes. */
function associationClassLines(edges, id, index) {
  const out = [];
  for (const { element } of edges) {
    if (element?._type !== 'UMLAssociationClassLink') continue;
    const cls = index.get(element.classSide);
    const assoc = index.get(element.associationSide);
    const a = index.get(assoc?.end1?.reference);
    const b = index.get(assoc?.end2?.reference);
    if (cls && a && b) out.push(`(${id(a._id, a.name)}, ${id(b._id, b.name)}) .. ${id(cls._id, cls.name)}`);
  }
  return out;
}

const CLASS_HOLDERS = new Set(['UMLPackage', 'UMLModel', 'UMLSubsystem', 'UMLProfile']);
const MIXED_KEYWORD = { UMLActor: 'actor', UMLUseCase: 'usecase', UMLComponent: 'component', UMLNode: 'node', UMLDevice: 'node', UMLExecutionEnvironment: 'node', UMLArtifact: 'artifact', UMLUseCaseSubject: 'rectangle' };

function classDeclaration(element, index) {
  const st = stereotypeName(element, index);
  const stereos = [];
  let kw;
  switch (element._type) {
    case 'UMLInterface': kw = 'interface'; break;
    case 'UMLEnumeration': kw = 'enum'; break;
    case 'UMLStereotype': kw = 'stereotype'; break;
    case 'UMLMetaClass': kw = 'metaclass'; break;
    case 'UMLObject': case 'UMLComponentInstance': case 'UMLArtifactInstance': case 'UMLNodeInstance': kw = 'object'; break;
    case 'UMLClass': kw = st === 'annotation' ? 'annotation' : element.isAbstract ? 'abstract class' : 'class'; break;
    default:
      if (MIXED_KEYWORD[element._type]) {
        kw = MIXED_KEYWORD[element._type];
        if (kw === 'node' && typeDef(element._type)?.keyword) stereos.push(typeDef(element._type).keyword);
      } else {
        kw = element.isAbstract ? 'abstract class' : 'class';
        stereos.push(typeDef(element._type)?.keyword || lowerFirst(element._type.replace(/^(UML|SysML)/, '')));
      }
  }
  if (st && kw !== 'annotation') stereos.push(st);
  return { kw, stereos, mixed: Boolean(MIXED_KEYWORD[element._type]) };
}

function plantClass(project, diagram) {
  const content = diagramContent(project, diagram);
  const { index, nodes, edges } = content;
  const id = idMaker(RESERVED);
  const out = [];
  const parentOf = nestByGeometry(nodes, (m) => CLASS_HOLDERS.has(m.element._type));
  let mixing = false;
  const objectName = (el) => { const c = index.get(el.classifier); return c ? `${el.name ?? ''} : ${c.name}` : el.name ?? ''; };
  const emit = (holder, indent) => {
    for (const n of nodes.filter((m) => (parentOf.get(m) ?? null) === holder)) {
      const el = n.element;
      if (!el.name && el._type !== 'UMLClass' && el._type !== 'UMLObject') continue;
      if (CLASS_HOLDERS.has(el._type)) {
        const kids = nodes.some((m) => parentOf.get(m) === n);
        const st = stereotypeName(el, index);
        const extra = el._type === 'UMLProfile' ? ['profile'] : el._type === 'UMLModel' ? ['model'] : el._type === 'UMLSubsystem' ? ['subsystem'] : [];
        out.push(`${indent}package ${named(el.name, id(el._id, el.name))}${[...extra, st].filter(Boolean).map(stereoTag).join('')}${kids ? ' {' : ''}`);
        if (kids) { emit(n, `${indent}  `); out.push(`${indent}}`); }
        continue;
      }
      const { kw, stereos, mixed } = classDeclaration(el, index);
      if (mixed) mixing = true;
      const label = el._type === 'UMLObject' ? objectName(el) : el.name;
      const name = id(el._id, el.name || el._type);
      const members = mixed ? [] : memberLines(el, index);
      out.push(`${indent}${kw} ${mixed ? `${q(label)} as ${name}` : named(label, name)}${stereos.map(stereoTag).join('')}${members.length ? ' {' : ''}`);
      if (members.length) { for (const line of members) out.push(`${indent}  ${line}`); out.push(`${indent}}`); }
      // Nodes inside a class box (rare) are written after it.
      if (nodes.some((m) => parentOf.get(m) === n)) emit(n, indent);
    }
  };
  emit(null, '');
  out.push(...edgeLines(edges, id, index), ...associationClassLines(edges, id, index), ...noteLines(content, id));
  if (mixing) out.unshift('allowmixing');
  return wrap(out, diagram.name);
}

// ───────────────────────── writing: description diagrams (use case, component, deployment …)

const DESC_HOLDERS = new Set(['UMLNode', 'UMLDevice', 'UMLExecutionEnvironment', 'UMLNodeInstance', 'UMLPackage', 'UMLModel', 'UMLSubsystem', 'UMLProfile', 'UMLComponent', 'UMLComponentInstance', 'UMLUseCaseSubject', 'UMLClass', 'UMLCollaboration']);
const COMPONENT_SHAPES = new Set(['rectangle', 'card', 'hexagon', 'process', 'action', 'circle', 'label']);
const NODE_SHAPES = new Set(['cloud', 'database', 'storage', 'queue', 'stack', 'collections']);
const PACKAGE_SHAPES = new Set(['folder', 'frame', 'rectangle']);
const CLASS_SHAPES = new Set(['boundary', 'control', 'entity']);

function descDeclaration(el, index) {
  const st = stereotypeName(el, index);
  let kw = 'rectangle';
  const stereos = [];
  let label = el.name ?? '';
  let consumed = false;
  const shape = (set, fallback) => { if (set.has(st)) { kw = st; consumed = true; } else kw = fallback; };
  switch (el._type) {
    case 'UMLActor': kw = 'actor'; break;
    case 'UMLUseCase': kw = 'usecase'; break;
    case 'UMLUseCaseSubject': kw = 'rectangle'; break;
    case 'UMLComponent': case 'UMLComponentInstance': shape(COMPONENT_SHAPES, 'component'); break;
    case 'UMLInterface': kw = 'interface'; break;
    case 'UMLPort': kw = 'port'; break;
    case 'UMLNode': case 'UMLNodeInstance': shape(NODE_SHAPES, 'node'); break;
    case 'UMLDevice': kw = 'node'; stereos.push('device'); break;
    case 'UMLExecutionEnvironment': kw = 'node'; stereos.push('executionEnvironment'); break;
    case 'UMLArtifact': case 'UMLArtifactInstance': if (st === 'file') { kw = 'file'; consumed = true; } else kw = 'artifact'; break;
    case 'UMLPackage': shape(PACKAGE_SHAPES, 'package'); break;
    case 'UMLModel': kw = 'package'; stereos.push('model'); break;
    case 'UMLSubsystem': kw = 'package'; stereos.push('subsystem'); break;
    case 'UMLProfile': kw = 'package'; stereos.push('profile'); break;
    case 'UMLClass': if (CLASS_SHAPES.has(st)) { kw = st; consumed = true; } else stereos.push('class'); break;
    case 'UMLPart': { stereos.push('part'); const t = typeText(el.type, index); if (t) label = `${label} : ${t}`; break; }
    case 'UMLInformationItem': stereos.push('information'); break;
    default: stereos.push(typeDef(el._type)?.keyword || lowerFirst(el._type.replace(/^(UML|SysML)/, '')));
  }
  if (st && !consumed) stereos.push(st);
  return { kw, stereos, label };
}

function descEdge(element, a, b, index, flavor, head) {
  const type = element._type;
  const name = oneLine(element.name || '');
  const label = name ? ` : ${name}` : '';
  if (flavor === 'usecase' && type === 'UMLAssociation') return `${a} --${element.end2?.navigable === 'navigable' ? '>' : ''} ${b}${label}`;
  if (type === 'UMLInterfaceRealization' || type === 'UMLComponentRealization') return head?._type === 'UMLInterface' ? `${a} -- ${b}${label}` : `${b} <|.. ${a}${label}`;
  if (type === 'UMLUsage') return `${a} ..> ${b} : use${name ? ` ${name}` : ''}`;
  if (type === 'UMLDeployment') return `${a} ..> ${b} : <<deploy>>${name ? ` ${name}` : ''}`;
  if (type === 'UMLManifestation') return `${a} ..> ${b} : <<manifest>>${name ? ` ${name}` : ''}`;
  if (type === 'UMLCommunicationPath' || type === 'UMLConnector' || (type === 'UMLAssociation' && flavor !== 'class')) {
    const delegate = type === 'UMLConnector' && element.kind === 'delegation';
    return `${a} -- ${b}${delegate ? ` : <<delegate>>${name ? ` ${name}` : ''}` : label}`;
  }
  return relationLine(element, a, b, index);
}

function plantDescription(project, diagram, flavor) {
  const content = diagramContent(project, diagram);
  const { index, nodes, edges } = content;
  const id = idMaker(RESERVED);
  const out = flavor === 'usecase' ? ['left to right direction'] : [];
  const isPort = (n) => n.element._type === 'UMLPort' || n.element._type === 'SysMLPort';
  const placed = nodes.filter((n) => !isPort(n));
  const parentOf = nestByGeometry(placed, (m) => DESC_HOLDERS.has(m.element._type));
  const ports = nodes.filter(isPort);
  const portHolder = new Map();
  for (const p of ports) {
    const owner = index.parent(p.element._id);
    const holder = placed.find((m) => m.element === owner) ?? placed.filter((m) => DESC_HOLDERS.has(m.element._type) && overlaps(box(p.view), box(m.view))).sort((x, y) => area(x.view) - area(y.view))[0];
    portHolder.set(p, holder ?? null);
  }
  const referenced = new Set(edges.flatMap((e) => [e.tail?._id, e.head?._id]));
  const emit = (holder, indent) => {
    for (const p of ports.filter((x) => (portHolder.get(x) ?? null) === holder)) {
      const pid = id(p.element._id, p.element.name || 'port');
      if (!holder) out.push(`${indent}component ${q(p.element.name)} as ${pid} <<port>>`);
      else out.push(`${indent}port ${p.element.name === pid ? pid : `${q(p.element.name)} as ${pid}`}`);
    }
    for (const n of placed.filter((m) => (parentOf.get(m) ?? null) === holder)) {
      const el = n.element;
      const pid = id(el._id, el.name || el._type);
      const { kw, stereos, label } = descDeclaration(el, index);
      const kids = placed.some((m) => parentOf.get(m) === n) || ports.some((p) => portHolder.get(p) === n);
      const noAlias = el._type === 'UMLUseCaseSubject' && !referenced.has(el._id);
      const head = `${indent}${kw} ${q(label)}${noAlias ? '' : ` as ${pid}`}${stereos.map(stereoTag).join('')}`;
      if (kids && !['UMLInterface', 'UMLActor', 'UMLUseCase', 'UMLArtifact'].includes(el._type)) { out.push(`${head} {`); emit(n, `${indent}  `); out.push(`${indent}}`); } else { out.push(head); if (kids) emit(n, indent); }
    }
  };
  emit(null, '');
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head || element._type === 'UMLAssociationClassLink') continue;
    out.push(descEdge(element, id(tail._id, tail.name || tail._type), id(head._id, head.name || head._type), index, flavor, head));
  }
  out.push(...noteLines(content, id));
  return wrap(out, diagram.name);
}

// ───────────────────────── writing: sequence and communication

const PLANT_ARROW = { synchCall: '->', asynchCall: '->>', asynchSignal: '-\\\\', reply: '-->', createMessage: '->', deleteMessage: '->' };
const REVERSED_ARROW = { '->': '<-', '->>': '<<-', '-\\\\': '\\\\-', '-->': '<--' };
const PLANT_FRAGMENT = new Set(['alt', 'opt', 'loop', 'par', 'break', 'critical']);
const LIFELINE_KINDS = new Set(['boundary', 'control', 'entity', 'database', 'collections', 'queue']);
const messageY = (view) => (Number.isFinite(Number(view.y)) && view.y !== null && view.y !== undefined ? Number(view.y) : Array.isArray(view.points) && view.points[0] ? Number(view.points[0].y) : 0);

/** A sequence diagram as events: lifelines left to right and a tree of messages, fragments, refs, notes and dividers. */
function sequenceEvents(project, diagram) {
  const content = diagramContent(project, diagram);
  const { index, nodes, edges, notes } = content;
  const lifelines = nodes.filter((n) => n.element._type === 'UMLLifeline').sort((a, b) => Number(a.view.left) - Number(b.view.left));
  const messages = edges.filter((e) => e.element?._type === 'UMLMessage' && e.tail && e.head).map((e) => ({ kind: 'message', y: messageY(e.view), ...e }));
  const fragments = nodes.filter((n) => n.element._type === 'UMLCombinedFragment').map((n) => ({ ...n, top: Number(n.view.top), bottom: Number(n.view.top) + Number(n.view.height || 0) }));
  const points = [
    ...nodes.filter((n) => n.element._type === 'UMLInteractionUse').map((n) => ({ kind: 'ref', y: Number(n.view.top), view: n.view, element: n.element })),
    ...notes.map((v) => ({ kind: v._type === 'UMLTextView' ? 'divider' : 'note', y: Number(v.top), view: v })),
  ];
  const used = new Set();
  const block = (lo, hi) => {
    const candidates = fragments.filter((f) => !used.has(f) && f.top >= lo && f.bottom <= hi);
    const tops = candidates.filter((f) => !candidates.some((g) => g !== f && g.top <= f.top && g.bottom >= f.bottom && (g.bottom - g.top) > (f.bottom - f.top)));
    tops.forEach((f) => used.add(f));
    const within = (y) => tops.some((f) => y >= f.top && y <= f.bottom);
    const items = [
      ...messages.filter((m) => m.y >= lo && m.y < hi && !within(m.y)),
      ...points.filter((p) => p.y >= lo && p.y < hi && !within(p.y)),
      ...tops.map((f) => {
        const operands = f.element.operands?.length ? f.element.operands : [{ guard: '' }];
        const h = (f.bottom - f.top) / operands.length;
        return { kind: 'fragment', y: f.top, element: f.element, operator: f.element.interactionOperator || 'alt', operands: operands.map((o, i) => ({ guard: o.guard ?? '', items: block(f.top + i * h, f.top + (i + 1) * h) })) };
      }),
    ];
    return items.sort((a, b) => a.y - b.y);
  };
  return { index, lifelines, items: block(-Infinity, Infinity) };
}

function lifelineKeyword(element, index) {
  if (lifelineIsActor(element, index)) return { kw: 'actor', st: '' };
  const st = stereotypeName(element, index);
  if (LIFELINE_KINDS.has(st)) return { kw: st, st: '' };
  return { kw: 'participant', st };
}

function plantSequence(project, diagram) {
  const { index, lifelines, items } = sequenceEvents(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  if (diagram.showSequenceNumber) out.push('autonumber');
  const declare = (el) => { const { kw, st } = lifelineKeyword(el, index); return `${kw} ${named(el.name, id(el._id, el.name))}${stereoTag(st)}`; };
  const created = new Set();
  const walkCreated = (list) => { for (const item of list) { if (item.kind === 'message' && item.element.messageSort === 'createMessage' && item.head?._type === 'UMLLifeline') created.add(item.head._id); else if (item.kind === 'fragment') item.operands.forEach((o) => walkCreated(o.items)); } };
  walkCreated(items);
  for (const { element } of lifelines) if (!created.has(element._id)) out.push(declare(element));
  const firstX = lifelines.length ? centerX(lifelines[0].view) : 0;
  const covered = (view) => {
    const b = box(view);
    const hits = lifelines.filter((l) => { const c = centerX(l.view); return c >= b.x && c <= b.x + Math.max(b.w, 1); });
    if (hits.length) return hits;
    const mid = b.x + b.w / 2;
    return lifelines.length ? [lifelines.slice().sort((x, y) => Math.abs(centerX(x.view) - mid) - Math.abs(centerX(y.view) - mid))[0]] : [];
  };
  const lid = (l) => id(l.element._id, l.element.name);
  const emit = (list, indent) => {
    for (const item of list) {
      if (item.kind === 'message') {
        const m = item.element;
        const arrow = PLANT_ARROW[m.messageSort] ?? '->';
        const text = m.name ? ` : ${oneLine(m.name)}${m.arguments ? `(${m.arguments})` : ''}` : '';
        const isLife = (el) => el._type === 'UMLLifeline';
        const a = isLife(item.tail) ? id(item.tail._id, item.tail.name) : null;
        const b = isLife(item.head) ? id(item.head._id, item.head.name) : null;
        if (m.messageSort === 'createMessage' && b) { const { kw } = lifelineKeyword(item.head, index); out.push(`${indent}create ${kw} ${named(item.head.name, b)}`); }
        if (a && b) out.push(`${indent}${a} ${arrow} ${b}${text}`);
        else if (b) {
          const left = !item.tailView || centerX(item.tailView) <= firstX;
          if (item.tail._type === 'UMLEndpoint') out.push(`${indent}?${arrow} ${b}${text}`);
          else out.push(left ? `${indent}[${arrow} ${b}${text}` : `${indent}${b} ${REVERSED_ARROW[arrow] ?? '<-'}]${text}`);
        } else if (a) {
          const left = item.headView && centerX(item.headView) < firstX;
          if (item.head._type === 'UMLEndpoint') out.push(`${indent}${a} ${arrow}?${text}`);
          else out.push(left ? `${indent}[${REVERSED_ARROW[arrow] ?? '<-'} ${a}${text}` : `${indent}${a} ${arrow}]${text}`);
        }
        if (m.messageSort === 'deleteMessage' && b) out.push(`${indent}destroy ${b}`);
      } else if (item.kind === 'ref') {
        const over = covered(item.view);
        if (over.length) out.push(`${indent}ref over ${over.map(lid).join(', ')} : ${oneLine(item.element.name || 'ref')}`);
      } else if (item.kind === 'note') {
        const b = box(item.view);
        const over = lifelines.filter((l) => { const c = centerX(l.view); return c >= b.x && c <= b.x + Math.max(b.w, 1); });
        if (over.length) out.push(`${indent}note over ${over.map(lid).join(', ')} : ${oneLine(item.view.text)}`);
        else if (lifelines.length) {
          const near = covered(item.view)[0];
          out.push(`${indent}note ${b.x + b.w / 2 >= centerX(near.view) ? 'right' : 'left'} of ${lid(near)} : ${oneLine(item.view.text)}`);
        } else out.push(`${indent}note : ${oneLine(item.view.text)}`);
      } else if (item.kind === 'divider') {
        out.push(`${indent}== ${oneLine(item.view.text || ' ')} ==`);
      } else {
        const op = item.operator;
        item.operands.forEach((operand, i) => {
          let head;
          if (i > 0) head = 'else';
          else if (PLANT_FRAGMENT.has(op)) head = op;
          else if (op === 'seq') head = `group ${operand.guard || 'seq'}`;
          else head = `group ${op}`;
          const guard = (i === 0 && op === 'seq') || (i > 0 && operand.guard === 'else') ? '' : operand.guard ? ` ${oneLine(operand.guard)}` : '';
          out.push(`${indent}${head}${guard}`);
          emit(operand.items, `${indent}  `);
        });
        out.push(`${indent}end`);
      }
    }
  };
  emit(items, '');
  return wrap(out, diagram.name);
}

/** A communication diagram as a sequence diagram: its lifelines and its messages in order. */
function plantCommunication(project, diagram) {
  const { index, nodes } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const lifelines = nodes.filter((n) => n.element._type === 'UMLLifeline').sort((a, b) => Number(a.view.top) - Number(b.view.top) || Number(a.view.left) - Number(b.view.left));
  const shown = new Set(lifelines.map((l) => l.element._id));
  const interaction = index.parent(diagram._id);
  const out = ["' communication diagram written as a sequence diagram", 'autonumber'];
  for (const { element } of lifelines) { const { kw, st } = lifelineKeyword(element, index); out.push(`${kw} ${named(element.name, id(element._id, element.name))}${stereoTag(st)}`); }
  for (const m of interaction?.messages ?? []) {
    const a = index.get(m.source);
    const b = index.get(m.target);
    if (!a || !b || !shown.has(a._id) || !shown.has(b._id)) continue;
    out.push(`${id(a._id, a.name)} ${PLANT_ARROW[m.messageSort] ?? '->'} ${id(b._id, b.name)}${m.name ? ` : ${oneLine(m.name)}` : ''}`);
  }
  return wrap(out, diagram.name);
}

// ───────────────────────── writing: activity (legacy syntax: any graph can be written)

const ACTIVITY_STEREO = { UMLDecisionNode: 'decision', UMLMergeNode: 'merge', UMLFlowFinalNode: 'flowFinal', UMLObjectNode: 'object', UMLCentralBufferNode: 'centralBuffer', UMLDataStoreNode: 'datastore', UMLInteractionUse: 'ref', UMLStructuredActivityNode: 'structured', UMLExpansionRegion: 'expansion', UMLActivityFinalNode: 'final', UMLInitialNode: 'initial', UMLCallBehaviorAction: 'callBehavior' };

function plantActivity(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  const partitions = nodes.filter((n) => n.element._type === 'UMLActivityPartition');
  const partitionOf = new Map();
  for (const n of nodes) {
    if (n.element._type === 'UMLActivityPartition') continue;
    const holders = partitions.filter((p) => inside(box(n.view), box(p.view)) || (box(n.view).w === 0 && inside({ ...box(n.view), w: 1, h: 1 }, box(p.view))));
    if (holders.length) partitionOf.set(n.element._id, holders.sort((a, b) => area(a.view) - area(b.view))[0].element);
  }
  const firstInitial = nodes.find((n) => n.element._type === 'UMLInitialNode')?.element;
  const firstFinal = nodes.find((n) => n.element._type === 'UMLActivityFinalNode')?.element;
  const declared = new Set();
  const labelOf = (el) => el.name || (/Decision/.test(el._type) ? '?' : /Merge/.test(el._type) ? 'merge' : /Final|Initial/.test(el._type) ? '' : el._type.replace(/^UML/, ''));
  const stereoOf = (el) => {
    if (ACTIVITY_STEREO[el._type]) return ACTIVITY_STEREO[el._type];
    if (el._type === 'UMLAction' && el.kind && el.kind !== 'opaque') return el.kind;
    return stereotypeName(el, index);
  };
  const refer = (el, asSource) => {
    if (el === firstInitial && asSource) return '(*)';
    if (el === firstFinal && !asSource) return '(*)';
    if (el._type === 'UMLForkNode' || el._type === 'UMLJoinNode') { declared.add(el._id); return `===${id(el._id, el.name || 'bar')}===`; }
    if (declared.has(el._id)) return id(el._id);
    declared.add(el._id);
    const label = labelOf(el);
    return `${q(label)} as ${id(el._id, label || stereoOf(el) || 'node')}${stereoTag(stereoOf(el))}`;
  };
  let open = null;
  const partitionLine = (p) => {
    if (open === p) return;
    if (open) out.push('}');
    if (p) out.push(`partition ${q(p.name)} {`);
    open = p;
  };
  const willDeclare = (el, asSource) => !declared.has(el._id) && !(el === firstInitial && asSource) && !(el === firstFinal && !asSource) && !/Fork|Join/.test(el._type);
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head || !typeDef(element._type)?.edge) continue;
    const declaring = willDeclare(head, false) ? head : willDeclare(tail, true) ? tail : null;
    if (declaring) partitionLine(partitionOf.get(declaring._id) ?? (open && partitionOf.get(tail._id) === open ? open : null));
    const guard = element.guard ? ` [${element.guard}]` : element.name ? ` [${element.name}]` : '';
    const line = `${refer(tail, true)} -->${guard} ${refer(head, false)}`;
    out.push(open ? `  ${line}` : line);
  }
  for (const n of nodes) {
    const el = n.element;
    if (el._type === 'UMLActivityPartition' || declared.has(el._id) || el === firstInitial || el === firstFinal || /Fork|Join/.test(el._type)) continue;
    partitionLine(partitionOf.get(el._id) ?? null);
    out.push(`${open ? '  ' : ''}${refer(el, true)}`);
  }
  partitionLine(null);
  return wrap(out, diagram.name);
}

// ───────────────────────── writing: state

const STATE_STEREO = { choice: 'choice', fork: 'fork', join: 'join', junction: 'choice', entryPoint: 'entryPoint', exitPoint: 'exitPoint', deepHistory: 'history*', shallowHistory: 'history', terminate: 'terminate', initial: 'start' };

function plantState(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  const shown = new Set(nodes.map((n) => n.element._id));
  const isVertex = (el) => /^UML(State|SubmachineState|Pseudostate|FinalState)$/.test(el._type);
  // Scope of a vertex: '' at the top, else the region (of the nearest shown state) that holds it.
  const scopeOf = (el) => {
    let prev = el;
    for (let owner = index.parent(el._id); owner; owner = index.parent(owner._id)) {
      if (owner._type === 'UMLState' && shown.has(owner._id)) return prev._type === 'UMLRegion' ? prev._id : owner._id;
      if (owner._type === 'UMLStateMachine') return '';
      prev = owner;
    }
    return '';
  };
  const children = new Map();
  for (const n of nodes) {
    if (!isVertex(n.element)) continue;
    const scope = scopeOf(n.element);
    if (!children.has(scope)) children.set(scope, []);
    children.get(scope).push(n.element);
  }
  const special = new Map(); // scope → { initial, final }
  for (const [scope, list] of children) special.set(scope, { initial: list.find((e) => e._type === 'UMLPseudostate' && e.kind === 'initial'), final: list.find((e) => e._type === 'UMLFinalState') });
  const isStart = (el) => special.get(scopeOf(el))?.initial === el;
  const isEnd = (el) => special.get(scopeOf(el))?.final === el;
  const vid = (el) => id(el._id, el.name || (el._type === 'UMLPseudostate' ? el.kind : el._type === 'UMLFinalState' ? 'final' : 'state'));
  // An unnamed history pseudostate is PlantUML's [H] / [H*] of its composite state (Somp[H] from outside it).
  const isHistory = (el) => el._type === 'UMLPseudostate' && !el.name && (el.kind === 'shallowHistory' || el.kind === 'deepHistory');
  const historyRef = (el, scope) => {
    const mark = el.kind === 'deepHistory' ? '[H*]' : '[H]';
    const own = scopeOf(el);
    if (own === scope) return mark;
    const holder = index.get(own);
    const state = holder?._type === 'UMLRegion' ? index.parent(holder._id) : holder;
    return state ? `${vid(state)}${mark}` : mark;
  };
  const ref_ = (el, asSource, scope = '') => (isHistory(el) ? historyRef(el, scope) : (asSource && isStart(el)) || (!asSource && isEnd(el)) ? '[*]' : vid(el));
  const transitions = edges.filter((e) => e.element?._type === 'UMLTransition' && e.tail && e.head);
  const scoped = (scope) => transitions.filter(({ tail, head }) => {
    if (isStart(tail)) return scopeOf(tail) === scope;
    if (isEnd(head)) return scopeOf(head) === scope;
    const a = scopeOf(tail);
    return (a === scopeOf(head) ? a : '') === scope;
  });
  const regionsOf = (state) => {
    const keys = (state.regions ?? []).map((r) => r._id).filter((k) => children.has(k));
    if (children.has(state._id)) keys.unshift(state._id);
    return keys;
  };
  const emit = (scope, indent) => {
    for (const el of children.get(scope) ?? []) {
      if (isStart(el) || isEnd(el) || isHistory(el)) continue;
      const name = vid(el);
      if (el._type === 'UMLPseudostate') { out.push(`${indent}state ${name} <<${STATE_STEREO[el.kind] ?? 'choice'}>>`); continue; }
      if (el._type === 'UMLFinalState') { out.push(`${indent}state ${name} <<end>>`); continue; }
      const alias = el.name && name !== el.name ? `${q(el.name)} as ${name}` : name;
      const st = stereotypeName(el, index);
      const regions = el._type === 'UMLState' ? regionsOf(el) : [];
      if (regions.length) {
        out.push(`${indent}state ${alias}${stereoTag(st)} {`);
        regions.forEach((r, i) => { if (i) out.push(`${indent}  --`); emit(r, `${indent}  `); });
        out.push(`${indent}}`);
      } else out.push(`${indent}state ${alias}${stereoTag(st)}`);
      for (const [key, label] of [['entryActivity', 'entry'], ['doActivity', 'do'], ['exitActivity', 'exit']]) if (el[key]) out.push(`${indent}${name} : ${label} / ${oneLine(el[key])}`);
    }
    for (const { element, tail, head } of scoped(scope)) {
      const text = transitionLabel(element);
      out.push(`${indent}${ref_(tail, true, scope)} --> ${ref_(head, false, scope)}${text ? ` : ${oneLine(text)}` : ''}`);
    }
  };
  emit('', '');
  return wrap(out, diagram.name);
}

// ───────────────────────── writing: ER, timing, mind map

const IE_LEFT = { 1: '||', '0..1': '|o', '0..*': '}o', '1..*': '}|' };
const IE_RIGHT = { 1: '||', '0..1': 'o|', '0..*': 'o{', '1..*': '|{' };

function plantEr(project, diagram) {
  const { nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = ['hide circle', 'skinparam linetype ortho'];
  for (const { element } of nodes) {
    if (element._type !== 'ERDEntity') continue;
    out.push(`entity ${q(element.name)} as ${id(element._id, element.name)} {`);
    const column = (c) => `  ${c.primaryKey || !c.nullable ? '*' : ''}${c.name} : ${c.type || ''}${c.length ? `(${c.length})` : ''}${c.primaryKey ? ' <<PK>>' : ''}${c.foreignKey ? ' <<FK>>' : ''}${c.unique && !c.primaryKey ? ' <<UK>>' : ''}`;
    const keys = (element.columns ?? []).filter((c) => c.primaryKey);
    const rest = (element.columns ?? []).filter((c) => !c.primaryKey);
    out.push(...keys.map(column));
    if (keys.length && rest.length) out.push('  --');
    out.push(...rest.map(column));
    out.push('}');
  }
  for (const { element, tail, head } of edges) {
    if (element?._type !== 'ERDRelationship' || !tail || !head) continue;
    const [x, y] = refId(element.end1?.reference) === tail._id ? [element.end1, element.end2] : [element.end2, element.end1];
    out.push(`${id(tail._id, tail.name)} ${IE_LEFT[x?.cardinality] ?? '||'}${element.identifying === false ? '..' : '--'}${IE_RIGHT[y?.cardinality] ?? '||'} ${id(head._id, head.name)}${element.name ? ` : ${oneLine(element.name)}` : ''}`);
  }
  return wrap(out, diagram.name);
}

const fmtTime = (t) => String(Math.round(t * 1000) / 1000);

function plantTiming(project, diagram) {
  const { nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  const lifelines = nodes.filter((n) => n.element._type === 'UMLTimingLifeline').sort((a, b) => Number(a.view.top) - Number(b.view.top));
  const changes = [];
  let end = 0;
  for (const { element: el } of lifelines) {
    const lid = id(el._id, el.name || 'lifeline');
    const states = String(el.states || '').split(',').map((s) => s.trim()).filter(Boolean);
    const binary = states.length === 2 && states.every((s) => /^(high|low)$/i.test(s));
    // high / low in equal steps from the start is a clock (written back as one, not as hundreds of changes).
    const segs = el.timeSegments ?? [];
    const step = Number(segs[0]?.duration) || 0;
    const clock = binary && segs.length >= 4 && step > 0 && segs.every((seg, i) => String(seg.state ?? '').toLowerCase() === (i % 2 ? 'low' : 'high') && (Number(seg.duration) === step || i === segs.length - 1));
    out.push(`${clock ? 'clock' : binary ? 'binary' : 'robust'} ${q(el.name)} as ${lid}${clock ? ` with period ${fmtTime(step * 2)}` : ''}`);
    if (!binary && states.length) out.push(`${lid} has ${states.map((s) => (isIdent(s) ? s : q(s))).join(',')}`);
    let t = 0;
    for (const seg of segs) { if (!clock) changes.push({ t, lid, state: seg.state ?? '' }); t += Number(seg.duration) || 0; }
    if (!clock) end = Math.max(end, t);
  }
  const times = [...new Set(changes.map((c) => c.t))].sort((a, b) => a - b);
  if (!times.length || end > times[times.length - 1]) times.push(end);
  // x → time from the time ticks (their names are the times), else spread over the widest lifeline.
  const ticks = nodes.filter((n) => n.element._type === 'UMLTimeTick').map((n) => ({ x: Number(n.view.left) + 5, t: parseFloat(n.element.name) })).filter((k) => Number.isFinite(k.t)).sort((a, b) => a.x - b.x);
  const widest = lifelines.length ? lifelines.reduce((w, l) => (Number(l.view.width) > Number(w.view.width) ? l : w)) : null;
  const timeAt = (x) => {
    let t;
    if (ticks.length >= 2) { const [a, b] = [ticks[0], ticks[ticks.length - 1]]; t = a.t + ((x - a.x) * (b.t - a.t)) / ((b.x - a.x) || 1); } else if (widest) { const b = box(widest.view); const x0 = b.x + 150; t = ((x - x0) / Math.max(1, b.w - 160)) * end; } else t = 0;
    const near = times.slice().sort((p, r) => Math.abs(p - t) - Math.abs(r - t))[0];
    const gap = times.length > 1 ? Math.min(...times.slice(1).map((v, i) => v - times[i])) : 1;
    return near !== undefined && Math.abs(near - t) <= gap / 2 ? near : Math.round(t * 100) / 100;
  };
  const lineId = (el) => id(el._id, el.name || 'lifeline');
  const messages = edges.filter((e) => e.element?._type === 'UMLMessage' && e.tail && e.head).map((e) => ({ t: timeAt(Array.isArray(e.view.points) && e.view.points[0] ? Number(e.view.points[0].x) : centerX(e.tailView ?? {})), e }));
  const all = [...new Set([...times, ...messages.map((m) => m.t)])].sort((a, b) => a - b);
  for (const t of all) {
    out.push(`@${fmtTime(t)}`);
    for (const c of changes.filter((x) => x.t === t)) out.push(`${c.lid} is ${c.state ? (isIdent(c.state) ? c.state : q(c.state)) : '{-}'}`);
    for (const { e } of messages.filter((m) => m.t === t)) out.push(`${lineId(e.tail)} -> ${lineId(e.head)}${e.element.name ? ` : ${oneLine(e.element.name)}` : ''}`);
  }
  const first = lifelines[0] ? lineId(lifelines[0].element) : null;
  for (const n of nodes) {
    const el = n.element;
    const label = [el.name, el.specification ? `{${el.specification}}` : ''].filter(Boolean).join(' ');
    if (el._type === 'UMLDurationConstraint' && first) {
      const a = timeAt(Number(n.view.left));
      let b = timeAt(Number(n.view.left) + Number(n.view.width || 0));
      if (b <= a) b = all.find((v) => v > a) ?? a + 1;
      out.push(`${first}@${fmtTime(a)} <-> @${fmtTime(b)}${label ? ` : ${oneLine(label)}` : ''}`);
    } else if (el._type === 'UMLTimeConstraint') {
      const a = timeAt(Number(n.view.left));
      out.push(`highlight ${fmtTime(a)} to ${fmtTime(a)}${label ? ` : ${oneLine(label)}` : ''}`);
    }
  }
  return wrap(out, diagram.name);
}

function plantMindmap(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const shown = nodes.filter((n) => n.element._type === 'MMNode');
  const byId = new Map(shown.map((n) => [n.element._id, n]));
  const parent = new Map();
  for (const e of edges) if (e.view._type === 'MMEdgeView' && e.tail && e.head && byId.has(e.tail._id) && byId.has(e.head._id) && !parent.has(e.head._id)) parent.set(e.head._id, e.tail._id);
  for (const n of shown) {
    if (parent.has(n.element._id)) continue;
    for (let o = index.parent(n.element._id); o; o = index.parent(o._id)) if (byId.has(o._id)) { parent.set(n.element._id, o._id); break; }
  }
  // Break cycles.
  for (const n of shown) { const seen = new Set([n.element._id]); for (let p = parent.get(n.element._id); p; p = parent.get(p)) { if (seen.has(p)) { parent.delete(n.element._id); break; } seen.add(p); } }
  const kids = (pid) => shown.filter((n) => parent.get(n.element._id) === pid).sort((a, b) => Number(a.view.top) - Number(b.view.top));
  const roots = shown.filter((n) => !parent.has(n.element._id));
  const sideOf = (n, root) => (n.element.direction === 'left' || n.element.direction === 'right' ? n.element.direction : centerX(n.view) < centerX(root.view) ? 'left' : 'right');
  const arithmetic = roots.some((r) => kids(r.element._id).some((k) => sideOf(k, r) === 'left'));
  const out = [];
  const line = (n, depth, mark) => {
    const name = String(n.element.name ?? '');
    out.push(name.includes('\n') ? `${mark.repeat(depth)}:${name};` : `${mark.repeat(depth)} ${name}`);
  };
  const walk = (n, depth, mark) => { line(n, depth, mark); for (const k of kids(n.element._id)) walk(k, depth + 1, mark); };
  for (const r of roots) {
    line(r, 1, arithmetic ? '+' : '*');
    for (const k of kids(r.element._id)) walk(k, 2, arithmetic ? (sideOf(k, r) === 'left' ? '-' : '+') : '*');
  }
  return `@startmindmap\n${diagram.name ? `title ${String(diagram.name).replace(/\r?\n/g, ' ')}\n` : ''}${out.join('\n')}\n@endmindmap\n`;
}

/**
 * A diagram as PlantUML text. Throws 'interop.unsupportedDiagram' (detail: type).
 */
export function exportPlantUml(project, diagram) {
  const more = exportPlantUmlMore(project, diagram);
  if (typeof more === 'string') return more;
  switch (diagram?._type) {
    case 'UMLClassDiagram': case 'UMLPackageDiagram': case 'UMLObjectDiagram': case 'UMLProfileDiagram': return plantClass(project, diagram);
    case 'UMLUseCaseDiagram': return plantDescription(project, diagram, 'usecase');
    case 'UMLSequenceDiagram': return plantSequence(project, diagram);
    case 'UMLCommunicationDiagram': return plantCommunication(project, diagram);
    case 'UMLActivityDiagram': case 'UMLInteractionOverviewDiagram': return plantActivity(project, diagram);
    case 'UMLStatechartDiagram': return plantState(project, diagram);
    case 'UMLComponentDiagram': case 'UMLDeploymentDiagram': case 'UMLCompositeStructureDiagram': case 'UMLInformationFlowDiagram': return plantDescription(project, diagram, 'structure');
    case 'ERDDiagram': return plantEr(project, diagram);
    case 'UMLTimingDiagram': return plantTiming(project, diagram);
    case 'MMMindmapDiagram': return plantMindmap(project, diagram);
    default: throw fail('interop.unsupportedDiagram', diagram?._type ?? '');
  }
}

// ───────────────────────── reading: preprocessing

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const colonOutsideQuotes = (s) => { let quoted = false; for (let i = 0; i < s.length; i += 1) { if (s[i] === '"') quoted = !quoted; else if (s[i] === ':' && !quoted) return i; } return -1; };

/**
 * The first @start… block of PlantUML text, cleaned: comments removed,
 * preprocessor directives applied, styling and decorations dropped,
 * multi-line notes folded into one line ("note … : a\nb").
 * Returns { kind, lines (trimmed), raw (untrimmed), title, direction, separator, warnings }.
 */
export function preprocessPlantUml(text) {
  const warnings = [];
  const warn = (code, detail) => warnings.push({ code, detail: String(detail ?? '') });
  const source = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\/'[\s\S]*?'\//g, (m) => m.replace(/[^\n]/g, ''));
  const all = source.split('\n');
  let kind = 'uml';
  let from = 0;
  let to = all.length;
  const start = all.findIndex((l) => /^\s*@start\w+/i.test(l));
  if (start >= 0) {
    kind = /^\s*@start(\w+)/i.exec(all[start])[1].toLowerCase();
    from = start + 1;
    const stop = all.findIndex((l, i) => i > start && /^\s*@end\w*/i.test(l));
    if (stop >= 0) to = stop;
    if (all.slice(to + 1).some((l) => /^\s*@start\w+/i.test(l))) warn('plantuml.moreDiagrams', 'only the first diagram is read');
  }
  const defines = new Map();
  const vars = new Map();
  const conds = [];
  const active = () => conds.every((c) => c.on);
  const out = [];
  const raw = [];
  let title = '';
  let direction = '';
  let separator = '.';
  let skipUntil = null;
  let braces = 0;
  let collect = null;
  const substitute = (line) => {
    let s = line;
    if (vars.size && s.includes('$')) s = s.replace(/\$[A-Za-z_]\w*/g, (m) => (vars.has(m.slice(1)) ? vars.get(m.slice(1)) : m));
    for (const [name, def] of defines) {
      if (!def.body && !def.params) continue;
      if (!s.includes(name)) continue;
      if (def.params) {
        s = s.replace(new RegExp(String.raw`(?<![\w$])${escapeRe(name)}\(([^()]*)\)`, 'g'), (m, args) => {
          const values = args.split(',');
          let body = def.body;
          def.params.forEach((p, i) => { body = body.replace(new RegExp(String.raw`(?<![\w$])${escapeRe(p)}(?!\w)`, 'g'), unq(values[i] ?? '')); });
          return body;
        });
      } else s = s.replace(new RegExp(String.raw`(?<![\w$])${escapeRe(name)}(?!\w)`, 'g'), def.body);
    }
    return s;
  };
  const known = (name) => defines.has(name) || vars.has(name.replace(/^\$/, ''));
  const evalAtom = (atom) => {
    let a = atom.trim();
    if (/^\(.*\)$/.test(a)) return evalExpr(a.slice(1, -1));
    if (a.startsWith('!')) return !evalAtom(a.slice(1));
    if (/^%not\((.*)\)$/.test(a)) return !evalExpr(/^%not\((.*)\)$/.exec(a)[1]);
    let m;
    if ((m = /^%?defined\(\s*"?([$\w]+)"?\s*\)$/.exec(a))) return known(m[1]);
    if (/^(%true\(\)|true)$/i.test(a)) return true;
    if (/^(%false\(\)|false)$/i.test(a)) return false;
    if ((m = /^(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/.exec(a))) {
      const [x, y] = [unq(m[1]), unq(m[3])];
      const nums = [Number(x), Number(y)];
      const [l, r] = nums.every(Number.isFinite) && x !== '' && y !== '' ? nums : [x, y];
      return { '==': l === r, '!=': l !== r, '<=': l <= r, '>=': l >= r, '<': l < r, '>': l > r }[m[2]];
    }
    a = unq(a);
    if (/^-?\d+(\.\d+)?$/.test(a)) return Number(a) !== 0;
    if (a === '') return false;
    warn('plantuml.condition', atom);
    return true;
  };
  const evalExpr = (expr) => substitute(expr).split('||').some((part) => part.split('&&').every(evalAtom));
  const directive = (line) => {
    let m;
    if ((m = /^!(ifdef|ifndef)\s+(\S+)/i.exec(line))) { const v = known(m[2]); const on = m[1].toLowerCase() === 'ifdef' ? v : !v; conds.push({ on, taken: on }); return; }
    if ((m = /^!if\s+(.*)$/i.exec(line))) { const on = evalExpr(m[1]); conds.push({ on, taken: on }); return; }
    if ((m = /^!else\s*if\s+(.*)$/i.exec(line))) { const top = conds[conds.length - 1]; if (top) { if (top.taken) top.on = false; else { top.on = evalExpr(m[1]); top.taken = top.on; } } return; }
    if (/^!else\b/i.test(line)) { const top = conds[conds.length - 1]; if (top) { top.on = !top.taken; top.taken = true; } return; }
    if (/^!end\s*if\b/i.test(line)) { conds.pop(); return; }
    if (!active()) return;
    if ((m = /^!define\s+(\w+)(?:\(([^)]*)\))?\s*(.*)$/i.exec(line))) { defines.set(m[1], { params: m[2] !== undefined ? m[2].split(',').map((p) => p.trim()).filter(Boolean) : null, body: substitute(m[3] ?? '') }); return; }
    if ((m = /^!undef\s+(\w+)/i.exec(line))) { defines.delete(m[1]); return; }
    if ((m = /^!(?:global\s+|local\s+)?\$(\w+)\s*(\?)?=\s*(.*)$/i.exec(line))) { if (!(m[2] && vars.has(m[1]))) vars.set(m[1], unq(substitute(m[3]))); return; }
    if (/^!definelong\b/i.test(line)) { skipUntil = /^!enddefinelong\b/i; warn('plantuml.macro', line); return; }
    if (/^!(unquoted\s+)?(procedure|function)\b/i.test(line)) { skipUntil = /^!end(procedure|function)\b/i; warn('plantuml.procedure', line); return; }
    if (/^!(include\w*|import)\b/i.test(line)) { warn('plantuml.include', line); return; }
    if (/^!(theme|pragma|option|log|dump_memory|assert|startsub|endsub|return|exit)\b/i.test(line)) return;
    warn('plantuml.directive', line);
  };
  const push = (line, rawLine) => { out.push(line); raw.push(rawLine ?? line); };
  for (const original of all.slice(from, to)) {
    const line = original.trim();
    if (!line) continue;
    if (braces) { braces += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length; if (braces < 0) braces = 0; continue; }
    if (skipUntil) { if (skipUntil.test(line)) skipUntil = null; continue; }
    if (line.startsWith("'")) continue;
    if (line.startsWith('!')) { directive(line); continue; }
    if (!active()) continue;
    const text = substitute(line);
    const rawText = substitute(original.replace(/\s+$/, ''));
    if (collect) {
      if (collect.end.test(text)) {
        if (collect.kind === 'title') title = collect.lines.join(' ').trim();
        else push(`${collect.head} : ${collect.lines.join('\\n')}`);
        collect = null;
      } else collect.lines.push(text);
      continue;
    }
    let m;
    if ((m = /^title\s*:?\s*(.+)$/i.exec(text))) { title = unq(m[1]); continue; }
    if (/^title$/i.test(text)) { collect = { kind: 'title', lines: [], end: /^end\s*title$/i }; continue; }
    if (/^skinparam\b/i.test(text)) { if (text.includes('{')) braces = 1; continue; }
    if (/^<style>/i.test(text)) { if (!/<\/style>/i.test(text)) skipUntil = /<\/style>/i; continue; }
    if (/^sprite\b/i.test(text)) { if (text.includes('{')) braces = 1; continue; }
    if (/^(?:json|yaml)\s+\S.*\{\s*$/i.test(text) && kind === 'uml') { braces = 1; warn('plantuml.ignored', text); continue; }
    if (/^(?:(?:top|bottom)\s+)?(?:(?:left|right|center)\s+)?legend\b/i.test(text)) { skipUntil = /^end\s*legend$/i; continue; }
    if ((m = /^(?:(?:left|right|center)\s+)?(header|footer)\b(.*)$/i.exec(text))) { if (!m[2].trim()) skipUntil = /^end\s*(header|footer)$/i; continue; }
    if (/^caption\b/i.test(text)) continue;
    if (/^left\s+to\s+right\s+direction$/i.test(text)) { direction = 'LR'; continue; }
    if (/^top\s+to\s+bottom\s+direction$/i.test(text)) { direction = 'TB'; continue; }
    if ((m = /^set\s+(?:namespace)?separator\s+(\S+)/i.exec(text))) { separator = m[1].toLowerCase() === 'none' ? '' : m[1]; continue; }
    if (/^(hide|show|remove|restore|scale|allowmixing|allow_mixing|skin\s|newpage|mainframe|page\s|autoactivate|mode\s|manual\s+time-axis|url\s+(of|for)\s|footbox)/i.test(text)) continue;
    if (/^(?:\/\s*)?(?:floating\s+)?[rh]?note\b/i.test(text) && colonOutsideQuotes(text) < 0 && !/^(?:\/\s*)?[rh]?note\s+"/i.test(text)) { collect = { kind: 'note', head: text, lines: [], end: /^end\s*[rh]?note$/i }; continue; }
    if (/^ref\s+over\b/i.test(text) && colonOutsideQuotes(text) < 0) { collect = { kind: 'ref', head: text, lines: [], end: /^end\s*ref$/i }; continue; }
    push(text, rawText);
  }
  if (collect && collect.kind !== 'title') push(`${collect.head} : ${collect.lines.join('\\n')}`);
  return { kind, lines: out, raw, title, direction, separator, warnings };
}

// ───────────────────────── reading: tokens

const ID_RE = /^[\w$À-￿](?:[\w$À-￿]|(?:\.|::)(?=[\w$À-￿]))*/;

/** An element reference at s[i…]: "quoted", [component], (use case), :actor:, [*], [H], name. */
function readEnd(s, i = 0) {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  const c = s[i];
  if (c === undefined) return null;
  if (c === '"') { const j = s.indexOf('"', i + 1); return j < 0 ? null : { form: 'quoted', text: s.slice(i + 1, j), end: j + 1 }; }
  if (c === '[') {
    const sp = /^\[(\*|H\*?)\]/.exec(s.slice(i));
    if (sp) return { form: sp[1] === '*' ? 'star' : 'history', text: sp[1], end: i + sp[0].length };
    const j = s.indexOf(']', i + 1);
    return j < 0 ? null : { form: 'component', text: s.slice(i + 1, j).trim(), end: j + 1 };
  }
  if (c === '(') {
    if (s[i + 1] === ')') return { form: 'interface', text: '', end: i + 2 };
    const j = s.indexOf(')', i + 1);
    return j < 0 ? null : { form: s[i + 1] === '*' ? 'legacy' : 'usecase', text: s.slice(i + 1, j).trim(), end: j + 1 };
  }
  if (c === ':') { const j = s.indexOf(':', i + 1); return j < 0 || j === i + 1 ? null : { form: 'actor', text: s.slice(i + 1, j).trim(), end: j + 1 }; }
  const m = ID_RE.exec(s.slice(i));
  if (!m) return null;
  let end = i + m[0].length;
  let text = m[0];
  const h = /^\[H\*?\]/.exec(s.slice(end));
  if (h) { text += h[0]; end += h[0].length; }
  return { form: 'name', text, end };
}

const ARROW_RE = /^(<\||<<|<|\^|\*|o|#|x|\+|\}|\{|0|\(|\)|\|)?([-.=~](?:[-.=~]|\[[^\]]*\]|(?:left|right|up|down|le|ri|do|[udlr])(?=[-.=~[]))*)(\|>|>>|>|\^|\*|o|#|x|\+|\{|\}|0|\(|\)|\|)?/;

/** A structure arrow at s[i…]: heads, body (dashes/dots, directions, styles). */
function readArrow(s, i) {
  const m = ARROW_RE.exec(s.slice(i));
  if (!m) return null;
  let right = m[3] ?? '';
  let end = i + m[0].length;
  if (/^[ox]$/.test(right) && /[\w$À-￿]/.test(s[end] ?? '')) { right = ''; end -= 1; }
  const body = m[2];
  const plain = body.replace(/\[[^\]]*\]/g, '');
  return { left: m[1] ?? '', body, right, end, dashed: plain.includes('.') || /\[[^\]]*dash/i.test(body) || /\[[^\]]*dott/i.test(body), hidden: /\[[^\]]*hidden/i.test(body) };
}

/** "A "1" *-- "many" B : label" → { a, b, m1, m2, arrow, label } or null. */
function parseRelation(line) {
  const a = readEnd(line, 0);
  if (!a || a.form === 'interface') return null;
  let i = a.end;
  while (/\s/.test(line[i] ?? '')) i += 1;
  let m1 = '';
  if (line[i] === '"') { const j = line.indexOf('"', i + 1); if (j < 0) return null; m1 = line.slice(i + 1, j); i = j + 1; while (/\s/.test(line[i] ?? '')) i += 1; }
  const arrow = readArrow(line, i);
  if (!arrow) return null;
  i = arrow.end;
  while (/\s/.test(line[i] ?? '')) i += 1;
  let m2 = '';
  if (line[i] === '"') {
    const j = line.indexOf('"', i + 1);
    if (j < 0) return null;
    let k = j + 1;
    while (/\s/.test(line[k] ?? '')) k += 1;
    if (k < line.length && line[k] !== ':' && readEnd(line, k)) { m2 = line.slice(i + 1, j); i = k; }
  }
  const b = readEnd(line, i);
  if (!b || b.form === 'interface') return null;
  i = b.end;
  while (/\s/.test(line[i] ?? '')) i += 1;
  let label = '';
  if (i < line.length) {
    if (line[i] !== ':') return null;
    label = line.slice(i + 1).trim();
  }
  return { a, b, m1, m2, arrow, label };
}

const MULT_RE = /^(?:\d+|\*|n|m|many)(?:\s*\.\.\s*(?:\d+|\*|n|m|many))?$/i;
/** End text "1..* items" → { mult, role }. */
function readEndText(s) {
  const t = String(s ?? '').trim();
  if (!t) return { mult: '', role: '' };
  if (MULT_RE.test(t)) return { mult: t, role: '' };
  const parts = t.split(/\s+/);
  if (MULT_RE.test(parts[0])) return { mult: parts[0], role: parts.slice(1).join(' ') };
  if (MULT_RE.test(parts[parts.length - 1])) return { mult: parts[parts.length - 1], role: parts.slice(0, -1).join(' ') };
  return { mult: '', role: t };
}

/** "<<kw>> name >" → { keyword, name } (direction markers dropped). */
function splitLabel(label) {
  let text = String(label ?? '').trim().replace(/^[<>]\s+/, '').replace(/\s+[<>]$/, '').replace(/^[<>]$/, '');
  let keyword = '';
  const m = /^<<\s*([^>]*?)\s*>>\s*(.*)$/.exec(text) ?? /^«\s*([^»]*?)\s*»\s*(.*)$/.exec(text);
  if (m) { keyword = m[1]; text = m[2]; }
  return { keyword, name: nl(text) };
}

/**
 * A declaration after its keyword: name forms, generics, "as" alias,
 * <<stereotypes>>, #colours, extends/implements, a body brace.
 */
function parseDecl(text) {
  let s = String(text ?? '').trim();
  const first = readEnd(s, 0);
  if (!first || first.form === 'star' || first.form === 'history' || first.form === 'legacy') return null;
  const out = { name: first.text, form: first.form, alias: '', aliasQuoted: false, generic: '', stereotypes: [], brace: false, inline: null, extends: [], implements: [], rest: '', iface: false };
  s = s.slice(first.end);
  if (first.form === 'interface') {
    const n = readEnd(s, 0);
    if (!n) return null;
    Object.assign(out, { name: n.text, form: n.form === 'name' ? 'name' : 'quoted', iface: true });
    s = s.slice(n.end);
  }
  for (let guard = 0; guard < 30; guard += 1) {
    s = s.trimStart();
    if (!s) break;
    let m;
    if (s.startsWith('<<')) {
      const j = s.indexOf('>>');
      if (j < 0) break;
      const st = s.slice(2, j).replace(/\(\s*\S\s*,\s*[^)]*\)/, '').trim();
      if (st) out.stereotypes.push(st);
      s = s.slice(j + 2);
    } else if (s[0] === '<') {
      let depth = 0;
      let j = 0;
      for (; j < s.length; j += 1) { if (s[j] === '<') depth += 1; else if (s[j] === '>') { depth -= 1; if (!depth) break; } }
      out.generic = s.slice(0, j + 1);
      s = s.slice(j + 1);
    } else if ((m = /^as\s+/i.exec(s))) {
      const a = readEnd(s, m[0].length);
      if (!a) break;
      out.alias = a.text;
      out.aliasQuoted = a.form !== 'name';
      s = s.slice(a.end);
    } else if (s[0] === '#') {
      s = s.replace(/^#+(\[[^\]]*\])?[^\s{]*/, '');
    } else if ((m = /^(extends|implements)\s+(.*?)(?=\s+(?:extends|implements)\s|\s*\{|$)/i.exec(s))) {
      out[m[1].toLowerCase()].push(...m[2].split(/,(?![^<]*>)/).map((x) => x.trim().replace(/<.*>$/, '')).filter(Boolean));
      s = s.slice(m[0].length);
    } else if (s.startsWith('[[')) {
      const j = s.indexOf(']]');
      s = j < 0 ? '' : s.slice(j + 2);
    } else if (s[0] === '[') {
      const j = s.indexOf(']');
      s = j < 0 ? '' : s.slice(j + 1);
    } else if (s[0] === '{') {
      const j = s.lastIndexOf('}');
      if (j > 0) { out.inline = s.slice(1, j).trim(); s = s.slice(j + 1); } else { out.brace = true; s = s.slice(1); }
    } else { out.rest = s; break; }
  }
  return out;
}

/** { key (how it is referred to), label (what is shown) } of a declaration. */
function declNames(d) {
  if (!d.alias) return { key: d.name, label: d.name };
  if (d.aliasQuoted && d.form === 'name') return { key: d.name, label: d.alias };
  return { key: d.alias, label: d.name };
}

// ───────────────────────── reading: diagram kind

function detectUml(lines) {
  const any = (re) => lines.some((l) => re.test(l));
  if (any(/^(robust|concise|clock|binary|analog)\s/i) || (any(/^@[+:\d"\w]/) && any(/\sis\s/))) return 'timing';
  if (any(/\(\*(top|bottom)?\)/)) return 'activityLegacy';
  if (any(/^(start|stop|kill|detach)$/) || any(/^(?:#[^\s:]+)?:[^:]*(?:[;|<>/\]}]\s*(?:<<.*>>)?)?$/) || any(/^(if|while|switch)\s*\(/) || any(/^repeat\b/) || any(/^(fork|split)(\s+again)?$/) || any(/^\|[^|]+\|/) || any(/^end\s?(fork|split|merge|while|switch)$/) || any(/^endif$/)) return 'activity';
  if (any(/\(\*(top|bottom)?\)/) || any(/^===+[^=]+===+/)) return 'activityLegacy';
  if (any(/\[\*\]|\[H\*?\]/) || any(/^state\s/)) return 'state';
  if (any(/(\|o|\|\||\}o|\}\|)[-.]+(?:\[[^\]]*\]|up|down|left|right|[udlr])*[-.]*(o\||\|\||o\{|\|\{)/)) return 'er';
  const strongSeq = any(/^(participant|autonumber|activate|deactivate|return|newpage|box)\b/) || any(/^(alt|loop|opt|par|break|critical|group)\b/) || any(/^(ref\s+over|note\s+over|note\s+across)\b/i) || any(/^==[^=].*==$/) || any(/^\.\.\.(.*\.\.\.)?$/) || any(/^\|\|(\d*\|\||\|)$/) || any(/^\[[ox]?-/) || any(/-[ox]?\]\s*(:|$)/) || any(/^create\s/) || any(/^destroy\s/);
  if (strongSeq) return 'sequence';
  const classKeyword = any(/^(abstract\s+class|abstract|class|enum|annotation|protocol|struct|exception|metaclass|stereotype|dataclass|record)\s/) || (any(/^interface\s/) && any(/^interface\s.*\{\s*$/));
  const usecase = any(/^usecase\/?\s/) || any(/(^|[\s>-])\([^()*][^()]*\)(\s|$|:|-|\.|<)/) || any(/(^|\s):[^:\s][^:]*:(\s|$|-|\.|<)/);
  const objectKeyword = any(/^(object|map)\s/);
  if (classKeyword) return 'class';
  // A node with an artifact is a deployment even when a use case shape is drawn too (PlantUML's deployment element list).
  if (usecase && any(/^node\b/) && any(/^artifact\b/)) return 'deployment';
  if (usecase) return 'usecase';
  if (any(/^node\b/) || any(/<<\s*(device|execution\s*environment)\s*>>/i)) return 'deployment';
  const classArrows = any(/<\|--|--\|>|\*--|--\*|o--|--o|\.\.\|>|<\|\.\./);
  const componentHint = any(/^(component|interface|port|portin|portout|artifact|folder|frame|file|card|stack|agent|hexagon|person|process|label|circle|database|queue|rectangle)\b/) || any(/^\[[^\]*]+\]/) || any(/\s\[[^\]*]+\](\s|$)/) || any(/^\(\)\s/) || any(/<<flow>>/);
  // Packages alone are not a component diagram: "package p { A <|-- B }" is a class diagram (PlantUML's own example).
  if (!componentHint && !objectKeyword && classArrows) return 'class';
  if (componentHint || any(/^(package|namespace)\b/)) return 'component';
  if (objectKeyword) return 'object';
  if (any(/^(entity)\s.*\{\s*$/)) return 'er';
  if (classArrows) return 'class';
  if (any(/^(actor|boundary|control|entity|database|collections|queue)\s/) || any(/^\S+\s*<?-{1,2}(?:\[[^\]]*\])?-?>{0,2}\s*\S/)) return 'sequence';
  return null;
}

// ───────────────────────── reading: class, object and description diagrams

const STEREO_TYPE = (() => {
  const map = {};
  for (const [type, def] of Object.entries(TYPES)) if (def.keyword && !def.edge && !def.diagram && def.group !== 'activity' && def.group !== 'interaction') map[def.keyword.toLowerCase()] = type;
  Object.assign(map, { enum: 'UMLEnumeration', datatype: 'UMLDataType', 'execution environment': 'UMLExecutionEnvironment', part: 'UMLPart', port: 'UMLPort', subsystem: 'UMLSubsystem', model: 'UMLModel', class: 'UMLClass' });
  return map;
})();
const EDGE_KEYWORD = (() => {
  const map = {};
  for (const [type, def] of Object.entries(TYPES)) if (def.edge && def.ends === 'directed' && def.keyword) map[def.keyword.toLowerCase()] = type;
  return Object.assign(map, { extension: 'UMLExtension' });
})();
const FLEXIBLE = new Set(['class', 'abstract class', 'abstract', 'rectangle', 'component']);
const PACKAGE_ONLY = new Set(['subsystem', 'model', 'profile']);
const NODE_ONLY = new Set(['device', 'executionenvironment', 'execution environment']);

function refineType(base, kw, stereos) {
  let type = base;
  let isAbstract = false;
  const rest = [];
  for (const s of stereos) {
    const k = s.trim().toLowerCase();
    if (k === 'abstract') { isAbstract = true; continue; }
    const t = STEREO_TYPE[k];
    let ok = false;
    if (t && type === base) {
      if (PACKAGE_ONLY.has(k)) ok = base === 'UMLPackage';
      else if (NODE_ONLY.has(k)) ok = base === 'UMLNode';
      else if (['part', 'port', 'information', 'class'].includes(k)) ok = true;
      else ok = FLEXIBLE.has(kw) || base === 'UMLClass';
    }
    if (ok) type = t; else if (s.trim()) rest.push(s.trim());
  }
  return { type, isAbstract, stereotype: rest.join(', ') };
}

const CLASS_BASE = {
  'abstract class': ['UMLClass', true], abstract: ['UMLClass', true], class: ['UMLClass'], interface: ['UMLInterface'], protocol: ['UMLInterface'], enum: ['UMLEnumeration'],
  annotation: ['UMLClass', false, 'annotation'], entity: ['UMLClass', false, 'entity'], struct: ['UMLDataType'], exception: ['UMLClass', false, 'exception'], metaclass: ['UMLMetaClass'],
  stereotype: ['UMLStereotype'], dataclass: ['UMLClass', false, 'dataclass'], record: ['UMLClass', false, 'record'], circle: ['UMLInterface'], diamond: ['UMLClass', false, 'diamond'], object: ['UMLObject'], map: ['UMLObject'],
};

function descType(kw, ctx, hasBody) {
  switch (kw) {
    case 'actor': case 'actor/': return ['UMLActor', ''];
    case 'person': case 'agent': return ['UMLActor', kw];
    case 'usecase': case 'usecase/': return ['UMLUseCase', ''];
    case 'component': return ['UMLComponent', ''];
    case 'interface': return ['UMLInterface', ''];
    case 'port': case 'portin': case 'portout': return ['UMLPort', ''];
    case 'node': return ['UMLNode', ''];
    case 'artifact': return ['UMLArtifact', ''];
    case 'file': return ['UMLArtifact', 'file'];
    case 'package': case 'namespace': return ['UMLPackage', ''];
    case 'rectangle': return ctx === 'usecase' ? ['UMLUseCaseSubject', ''] : hasBody ? ['UMLPackage', 'rectangle'] : ['UMLComponent', 'rectangle'];
    case 'folder': case 'frame': return ['UMLPackage', kw];
    case 'cloud': case 'database': case 'storage': case 'queue': case 'stack': case 'collections': return ['UMLNode', kw];
    case 'boundary': case 'control': case 'entity': return ['UMLClass', kw];
    default: return ['UMLComponent', kw];
  }
}

const kwRegex = (list) => new RegExp(String.raw`^(${[...list].sort((a, b) => b.length - a.length).map((k) => escapeRe(k).replace(/ /g, '\\s+')).join('|')})(?=\s|$)\s*(.*)$`, 'i');
const CLASS_RE = kwRegex(Object.keys(CLASS_BASE));
const DESC_RE = kwRegex(['actor/', 'actor', 'agent', 'artifact', 'boundary', 'card', 'cloud', 'collections', 'component', 'control', 'database', 'entity', 'file', 'folder', 'frame', 'hexagon', 'interface', 'label', 'node', 'package', 'namespace', 'person', 'portin', 'portout', 'port', 'process', 'queue', 'rectangle', 'stack', 'storage', 'usecase/', 'usecase', 'action', 'circle']);
const CONTAINER_KW = new Set(['package', 'namespace']);

/** A class member line → parseMember result (+ multiplicity, read-only/id flags) or null. */
function readMember(text) {
  let line = String(text ?? '').trim().replace(/;$/, '');
  let forced = '';
  line = line.replace(/\{(field|method)\}\s*/gi, (m, k) => { forced = k.toLowerCase(); return ''; });
  const flags = {};
  line = line.replace(/\s*\{([\w\s,]+)\}\s*$/, (m, list) => { for (const f of list.split(',').map((x) => x.trim().toLowerCase())) { if (f === 'readonly') flags.isReadOnly = true; else if (f === 'id') flags.isID = true; else if (f === 'ordered') flags.isOrdered = true; else if (f === 'unique') flags.isUnique = true; } return ''; });
  if (!line) return null;
  let m = parseMember(line);
  if (forced === 'method' && m.kind === 'attribute') m = { kind: 'operation', name: m.name, params: [], returnType: m.type, visibility: m.visibility, isStatic: m.isStatic, isAbstract: false };
  if (forced === 'field' && m.kind === 'operation') m = { kind: 'attribute', name: line.replace(/^[-+#~]\s*/, ''), type: '', defaultValue: '', visibility: m.visibility, isStatic: m.isStatic };
  // Java style "void methods()" / "List<String> names()": the return type comes before the name.
  if (m.kind === 'operation' && !m.returnType) {
    const java = /^(.*\S)\s+([\w$]+)$/.exec(m.name ?? '');
    if (java) { m.returnType = java[1]; m.name = java[2]; }
  }
  if (m.kind === 'attribute') {
    const mm = /^(.*?)\s*\[([^\]]+)\]$/.exec(m.type ?? '');
    if (mm) { m.type = mm[1].trim(); m.multiplicity = mm[2].trim(); }
    Object.assign(m, flags);
  }
  return m.name || m.kind === 'operation' ? m : null;
}

/**
 * Class, object, use case, component and deployment text → structure IR:
 *   nodes: Map key → { key, type, name, stereotype, isAbstract, members, literals, slots, parent }
 *   relations: [{ type, from, to, name, stereotype, end1, end2, attrs }]
 *   notes: [{ text, targets: [key] }], assocClasses: [{ cls, from, to }]
 */
function parseStructure(lines, ctx, { warn, separator = '.' }) {
  const ir = { nodes: new Map(), relations: [], notes: [], assocClasses: [] };
  const aliases = new Map();
  const byName = new Map();
  const byPath = new Map();
  const noteKeys = new Map();
  const stack = [];
  const splitting = (ctx === 'class' || ctx === 'object') && Boolean(separator);
  let seq = 0;
  let lastNode = null;
  const container = () => { for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].kind === 'container') return stack[i].key; return null; };
  const pathOf = (key) => (key ? ir.nodes.get(key)?.path ?? '' : '');
  const join = (a, b) => (a ? `${a}${separator || '.'}${b}` : b);
  const make = (type, label, parent) => {
    const key = `k${seq += 1}`;
    const node = { key, type, name: label, stereotype: '', isAbstract: false, members: [], literals: [], slots: [], parent, implicit: false, path: join(pathOf(parent), label), attrs: {} };
    ir.nodes.set(key, node);
    byPath.set(node.path, key);
    if (!byName.has(label)) byName.set(label, key);
    return node;
  };
  const ensurePackages = (parts, parent) => {
    let p = parent;
    for (const part of parts) { const path = join(pathOf(p), part); p = byPath.get(path) ?? make('UMLPackage', part, p).key; }
    return p;
  };
  const defaultType = (form) => (form === 'component' ? 'UMLComponent' : form === 'usecase' ? 'UMLUseCase' : form === 'actor' ? 'UMLActor' : { class: 'UMLClass', object: 'UMLObject', usecase: 'UMLActor', component: 'UMLInterface', deployment: 'UMLNode' }[ctx]);
  const find = (name) => {
    if (aliases.has(name)) return aliases.get(name);
    if (splitting) {
      const here = pathOf(container());
      if (here && byPath.has(join(here, name))) return byPath.get(join(here, name));
      if (byPath.has(name)) return byPath.get(name);
    }
    return byName.get(name) ?? null;
  };
  const resolve = (end) => {
    const found = find(end.text);
    if (found) return ir.nodes.get(found);
    let parent = container();
    let label = end.text;
    if (splitting && end.form === 'name' && label.includes(separator)) { const parts = label.split(separator).filter(Boolean); label = parts.pop(); parent = ensurePackages(parts, null); }
    const node = make(defaultType(end.form), label, parent);
    node.implicit = true;
    aliases.set(end.text, node.key);
    return node;
  };
  const declare = (type, d) => {
    const { key: refName, label } = declNames(d);
    let parent = container();
    let display = d.form === 'name' && !d.alias ? label : nl(label);
    if (splitting && d.form === 'name' && !d.alias && label.includes(separator)) {
      const parts = label.split(separator).filter(Boolean);
      display = parts.pop();
      parent = type === 'UMLPackage' || CONTAINER_KW.has(type) ? ensurePackages(parts, parent) : ensurePackages(parts, null);
    }
    const existing = find(refName);
    let node = existing ? ir.nodes.get(existing) : null;
    if (node && splitting && !node.implicit && node.parent !== parent && d.form === 'name' && !d.alias) node = null;
    if (!node) node = make(type, display, parent);
    else {
      if (node.implicit && node.parent !== parent) { byPath.delete(node.path); node.parent = parent; node.path = join(pathOf(parent), display); byPath.set(node.path, node.key); }
      node.implicit = false;
      node.type = type;
      node.name = display;
    }
    aliases.set(refName, node.key);
    if (d.alias && !d.aliasQuoted && d.form !== 'name') aliases.set(d.name, node.key);
    return node;
  };
  const addMember = (node, text) => {
    const line = text.trim();
    if (!line || /^(--|==|\.\.|__)/.test(line)) return;
    if (node.type === 'UMLObject') {
      const m = /^(.+?)\s*(?:=>|=|:)\s*(.*)$/.exec(line);
      node.slots.push(m ? { name: m[1].trim(), value: m[2].trim() } : { name: line, value: '' });
      return;
    }
    if (node.type === 'UMLEnumeration' && !line.includes(':') && /^[\wÀ-￿]+\s*(\(.*\))?(\s*,\s*[\wÀ-￿]+\s*(\(.*\))?)*\s*[,;]?$/.test(line)) {
      for (const part of line.split(/,(?![^(]*\))/)) { const name = part.replace(/\(.*\)/, '').replace(/[;\s]/g, ''); if (name) node.literals.push(name); }
      return;
    }
    const m = readMember(line);
    if (m) node.members.push(m);
  };
  const mapRow = (node, line) => {
    let m;
    if ((m = /^(.+?)\s*\*-+>\s*(.+)$/.exec(line))) {
      node.slots.push({ name: m[1].trim(), value: '' });
      const end = readEnd(m[2].trim(), 0);
      if (end) ir.relations.push({ type: 'UMLLink', from: node.key, to: resolve(end).key, name: '', end1: {}, end2: { name: m[1].trim() } });
    } else if ((m = /^(.+?)\s*=>\s*(.*)$/.exec(line))) node.slots.push({ name: m[1].trim(), value: m[2].trim() });
    else if (line) node.slots.push({ name: line, value: '' });
  };
  const relate = (rel) => {
    const noteA = noteKeys.get(rel.a.text);
    const noteB = noteKeys.get(rel.b.text);
    if (noteA || noteB) { (noteA ?? noteB).targets.push(resolve(noteA ? rel.b : rel.a).key); return; }
    const A = resolve(rel.a);
    const B = resolve(rel.b);
    if (rel.arrow.hidden) return;
    const r = classifyRelation(ctx, rel, A, B);
    if (r) { ir.relations.push(r); ir.lastRelation = r; }
  };
  const noteText = (s) => nl(unq(s));
  for (const raw of lines) {
    const line = raw.trim();
    const top = stack[stack.length - 1];
    if (top && (top.kind === 'members' || top.kind === 'map')) {
      if (line.startsWith('}')) { stack.pop(); continue; }
      const node = ir.nodes.get(top.key);
      if (top.kind === 'map') mapRow(node, line); else addMember(node, line);
      continue;
    }
    if (line === '}') { stack.pop(); continue; }
    let m;
    if (/^note\b/i.test(line)) {
      if ((m = /^note\s+"((?:[^"]|\\")*)"\s*(?:as\s+(\w+))?/i.exec(line))) { const note = { text: noteText(m[1]), targets: [] }; ir.notes.push(note); if (m[2]) noteKeys.set(m[2], note); continue; }
      if ((m = /^note\s+as\s+(\w+)[^:]*:\s*(.*)$/i.exec(line))) { const note = { text: noteText(m[2]), targets: [] }; ir.notes.push(note); noteKeys.set(m[1], note); continue; }
      if ((m = /^note\s+(?:left|right|top|bottom)?\s*(?:of\s+(.+?)|on\s+link)?\s*(?:#\S+)?\s*:\s*(.*)$/i.exec(line))) {
        const end = m[1] ? readEnd(m[1].trim(), 0) : null;
        const target = end ? find(end.text) : /on\s+link/i.test(line) ? null : lastNode?.key;
        ir.notes.push({ text: noteText(m[2]), targets: target ? [target] : [] });
        continue;
      }
      warn(line);
      continue;
    }
    if (/^together\b.*\{$/i.test(line)) { stack.push({ kind: 'together' }); continue; }
    if ((ctx === 'class' || ctx === 'object') && (m = /^\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)\s*\.+\s*(.+)$/.exec(line))) {
      const [a, b, c] = [m[1], m[2], m[3]].map((x) => resolve(readEnd(x.trim(), 0) ?? { form: 'name', text: x.trim() }));
      ir.assocClasses.push({ cls: c.key, from: a.key, to: b.key });
      continue;
    }
    const rel = parseRelation(line);
    if (rel) { relate(rel); continue; }
    const tryDecl = (re, isClass) => {
      const mm = re.exec(line);
      if (!mm) return false;
      const kw = mm[1].toLowerCase().replace(/\s+/g, ' ');
      const d = parseDecl(mm[2]);
      if (!d) return false;
      const hasBody = d.brace || d.inline !== null;
      let base; let abstract = false; let st0 = ''; let bodyKind;
      if (isClass) { [base, abstract = false, st0 = ''] = CLASS_BASE[kw]; bodyKind = kw === 'map' ? 'map' : 'members'; } else { [base, st0] = descType(kw, ctx, hasBody); bodyKind = 'container'; }
      const refined = refineType(base, kw, [...(st0 ? [st0] : []), ...d.stereotypes]);
      const node = declare(refined.type, d);
      node.isAbstract = node.isAbstract || abstract || refined.isAbstract;
      if (refined.stereotype) node.stereotype = refined.stereotype;
      if (d.generic) node.name = `${node.name}${d.generic}`;
      for (const target of d.extends) { const t = resolve({ form: 'name', text: target }); ir.relations.push({ type: node.type === 'UMLInterface' || t.type !== 'UMLInterface' ? 'UMLGeneralization' : 'UMLInterfaceRealization', from: node.key, to: t.key, name: '' }); }
      for (const target of d.implements) { const t = resolve({ form: 'name', text: target }); if (t.implicit) t.type = 'UMLInterface'; ir.relations.push({ type: 'UMLInterfaceRealization', from: node.key, to: t.key, name: '' }); }
      if (d.inline) for (const part of d.inline.split(/;|\\n/)) if (bodyKind === 'map') mapRow(node, part.trim()); else if (bodyKind === 'members') addMember(node, part);
      if (d.brace) stack.push({ kind: bodyKind, key: node.key });
      lastNode = node;
      return true;
    };
    const order = ctx === 'class' || ctx === 'object' ? [[CLASS_RE, true], [DESC_RE, false]] : [[DESC_RE, false], [CLASS_RE, true]];
    if (order.some(([re, isClass]) => tryDecl(re, isClass))) continue;
    if (/^(\[|\(|:)/.test(line)) {
      const d = parseDecl(line);
      if (d && ['component', 'usecase', 'actor', 'interface'].includes(d.iface ? 'interface' : d.form) || d?.iface) {
        const base = d.iface ? 'UMLInterface' : { component: 'UMLComponent', usecase: 'UMLUseCase', actor: 'UMLActor' }[d.form];
        const refined = refineType(base, '', d.stereotypes);
        const node = declare(refined.type, d);
        if (refined.stereotype) node.stereotype = refined.stereotype;
        if (d.brace) stack.push({ kind: 'container', key: node.key });
        lastNode = node;
        continue;
      }
    }
    if ((m = /^(.+?)\s*:\s*(.*)$/.exec(line))) {
      const end = readEnd(m[1], 0);
      if (end && end.end === m[1].length) {
        const node = resolve(end);
        if (node.type === 'UMLObject') addMember(node, m[2]);
        else if (/^UML(Class|Interface|Enumeration|DataType|Signal|PrimitiveType|Stereotype|MetaClass)$/.test(node.type)) { if (node.type === 'UMLEnumeration' && /^[\wÀ-￿]+$/.test(m[2].trim())) node.literals.push(m[2].trim()); else addMember(node, m[2]); } else warn(line);
        continue;
      }
    }
    warn(line);
  }
  return ir;
}

/** What a structure arrow between two nodes means in a kind of diagram. */
function classifyRelation(ctx, rel, A, B) {
  const { left, right, dashed } = rel.arrow;
  const split = splitLabel(rel.label);
  const keyword = split.keyword;
  let { name } = split;
  const k = keyword.toLowerCase();
  const reversed = /^</.test(left) && left !== '<|' && !right;
  const fromTo = (rev) => (rev ? [B, A] : [A, B]);
  let kwType = EDGE_KEYWORD[k] ?? (ctx === 'usecase' ? { extends: 'UMLExtend', includes: 'UMLInclude' }[k] : null) ?? null;
  if (!kwType && !keyword && dashed) {
    const word = name.toLowerCase();
    if (ctx === 'usecase' && /^(include|includes)$/.test(word)) kwType = 'UMLInclude';
    else if (ctx === 'usecase' && /^(extend|extends)$/.test(word)) kwType = 'UMLExtend';
    else if (/^(use|uses)(\s|$)/.test(word) && ctx !== 'class' && ctx !== 'object') { kwType = 'UMLUsage'; name = name.replace(/^uses?\s*/i, ''); }
    else if (/^use(\s|$)/.test(word)) { kwType = 'UMLUsage'; name = name.replace(/^use\s*/i, ''); }
    if (kwType && kwType !== 'UMLUsage') name = '';
  }
  if (kwType) {
    const [f, t] = fromTo(reversed || left === '<|');
    return { type: kwType, from: f.key, to: t.key, name: kwType === 'UMLInclude' || kwType === 'UMLExtend' ? '' : name };
  }
  const genLeft = left === '<|' || left === '^';
  const genRight = right === '|>' || right === '^';
  if (genLeft || genRight) {
    const [child, parent] = genLeft ? [B, A] : [A, B];
    const type = !dashed ? 'UMLGeneralization' : parent.type === 'UMLInterface' ? 'UMLInterfaceRealization' : 'UMLRealization';
    return { type, from: child.key, to: parent.key, name, stereotype: keyword };
  }
  if (left === '+' || right === '+') { const [c, p] = left === '+' ? [A, B] : [B, A]; return { type: 'UMLContainment', from: c.key, to: p.key, name: '' }; }
  const t1 = readEndText(rel.m1);
  const t2 = readEndText(rel.m2);
  const end = (head, text) => ({ multiplicity: text.mult, name: text.role, aggregation: head === '*' ? 'composite' : head === 'o' ? 'shared' : 'none', navigable: /^[<>]{1,2}$/.test(head) ? 'navigable' : head === 'x' ? 'notNavigable' : 'unspecified' });
  const structural = ctx === 'component' || ctx === 'deployment';
  if (dashed) {
    const [f, t] = fromTo(reversed);
    if (structural && t.type === 'UMLInterface' && f.type !== 'UMLInterface') return { type: 'UMLUsage', from: f.key, to: t.key, name };
    return { type: 'UMLDependency', from: f.key, to: t.key, name, stereotype: keyword };
  }
  if (structural) {
    const iA = A.type === 'UMLInterface';
    const iB = B.type === 'UMLInterface';
    const socket = /[()]/.test(left + right);
    if (iA !== iB) {
      const [c, i] = iA ? [B, A] : [A, B];
      const iHead = iA ? left : right;
      if (socket || /[<>]/.test(iHead)) return { type: 'UMLUsage', from: c.key, to: i.key, name };
      return { type: 'UMLInterfaceRealization', from: c.key, to: i.key, name };
    }
    if (socket) { const [f, t] = right === '(' || left === ')' ? [A, B] : [B, A]; return { type: 'UMLUsage', from: f.key, to: t.key, name }; }
    if (k === 'delegate') return { type: 'UMLConnector', from: A.key, to: B.key, name, end1: end(left, t1), end2: end(right, t2), attrs: { kind: 'delegation' } };
    const nodeish = (n) => /^UML(Node|Device|ExecutionEnvironment|NodeInstance)$/.test(n.type);
    if (ctx === 'deployment' && nodeish(A) && nodeish(B)) return { type: 'UMLCommunicationPath', from: A.key, to: B.key, name, stereotype: keyword, end1: end(left, t1), end2: end(right, t2) };
    if (/[<>]/.test(left + right) && !/[*o]/.test(left + right)) { const [f, t] = fromTo(reversed); return { type: 'UMLDependency', from: f.key, to: t.key, name, stereotype: keyword }; }
    if (/^UML(Class|Interface|Enumeration|DataType)$/.test(A.type) && /^UML(Class|Interface|Enumeration|DataType)$/.test(B.type)) return { type: 'UMLAssociation', from: A.key, to: B.key, name, stereotype: keyword, end1: end(left, t1), end2: end(right, t2) };
    return { type: ctx === 'deployment' ? 'UMLCommunicationPath' : 'UMLConnector', from: A.key, to: B.key, name, stereotype: keyword, end1: end(left, t1), end2: end(right, t2) };
  }
  if (A.type === 'UMLObject' && B.type === 'UMLObject') return { type: 'UMLLink', from: A.key, to: B.key, name, stereotype: keyword, end1: end(left, t1), end2: end(right, t2) };
  return { type: 'UMLAssociation', from: A.key, to: B.key, name, stereotype: keyword, end1: end(left, t1), end2: end(right, t2) };
}

/** Estimated size of an element for the layout. */
function classBox(node) {
  const members = node.members.length + node.literals.length + node.slots.length;
  const longest = [...node.members.map((m) => `${m.name}${m.type ?? ''}${m.returnType ?? ''}${(m.params ?? []).map((p) => p.name + p.type).join('')}`.length + 10), ...node.slots.map((s) => s.name.length + String(s.value).length + 4), ...node.literals.map((l) => l.length)].reduce((w, n) => Math.max(w, n), String(node.name).length + 4);
  return { w: Math.min(360, Math.max(120, longest * 7.5)), h: 44 + 18 * members + 14 };
}
function nodeSize(node) {
  const len = String(node.name ?? '').length;
  switch (node.type) {
    case 'UMLActor': return { w: Math.max(70, len * 7), h: 90 };
    case 'UMLUseCase': return { w: Math.max(120, len * 7 + 40), h: 56 };
    case 'UMLComponent': return { w: Math.max(150, len * 8 + 60), h: 70 };
    case 'UMLNode': case 'UMLDevice': case 'UMLExecutionEnvironment': return { w: Math.max(160, len * 8 + 40), h: 90 };
    case 'UMLArtifact': return { w: Math.max(130, len * 7.5 + 50), h: 60 };
    case 'UMLPackage': case 'UMLProfile': case 'UMLModel': case 'UMLSubsystem': return { w: Math.max(140, len * 8 + 40), h: 90 };
    case 'UMLUseCaseSubject': return { w: 200, h: 150 };
    case 'UMLPart': case 'UMLInformationItem': return { w: Math.max(140, len * 7.5 + 30), h: 60 };
    default: return classBox(node);
  }
}
const EXPLICIT_SIZE = new Set(['UMLNode', 'UMLDevice', 'UMLExecutionEnvironment', 'UMLPackage', 'UMLProfile', 'UMLModel', 'UMLSubsystem', 'UMLUseCaseSubject']);

/**
 * Nested layered layout. items: [{ id, w, h, parent, pad?, head? }], edges: [[from, to]] between any items.
 * Containers are sized around their children. Returns Map id → { x, y, w, h } and .extent.
 */
function nestedLayout(items, edges, { direction = 'TB', gapX = 60, gapY = 60, wrap: wrapAt = 5, x0 = 40, y0 = 40, pad = 24, head = 44 } = {}) {
  const byId = new Map(items.map((i) => [i.id, { ...i, kids: [] }]));
  const roots = [];
  for (const it of byId.values()) (it.parent && byId.has(it.parent) ? byId.get(it.parent).kids : roots).push(it);
  const ancestorIn = (id, level) => { let cur = byId.get(id); const seen = new Set(); while (cur && !level.has(cur.id) && !seen.has(cur.id)) { seen.add(cur.id); cur = cur.parent ? byId.get(cur.parent) : null; } return cur && level.has(cur.id) ? cur.id : null; };
  const measure = (group, depth = 0) => {
    for (const it of group) {
      if (!it.kids.length || depth > 30) continue;
      it.inner = measure(it.kids, depth + 1);
      const p = it.pad ?? pad;
      const h = it.head ?? head;
      it.w = Math.max(it.w, it.inner.extent.w + 2 * p);
      it.h = Math.max(it.h, it.inner.extent.h + p + h);
    }
    const level = new Set(group.map((g) => g.id));
    const lifted = edges.map(([a, b]) => [ancestorIn(a, level), ancestorIn(b, level)]).filter(([a, b]) => a && b && a !== b);
    return layered(group.map((g) => ({ id: g.id, w: g.w, h: g.h })), lifted, { direction, gapX, gapY, wrap: wrapAt });
  };
  const result = new Map();
  const place = (group, placed, x, y) => {
    for (const it of group) {
      const p = placed.get(it.id);
      const b = { x: x + p.x, y: y + p.y, w: it.w, h: it.h };
      result.set(it.id, b);
      if (it.inner) place(it.kids, it.inner, b.x + (it.w - it.inner.extent.w) / 2, b.y + (it.head ?? head));
    }
  };
  const top = measure(roots);
  place(roots, top, x0, y0);
  result.extent = top.extent;
  result.depthOf = (id) => { let d = 0; for (let cur = byId.get(id); cur?.parent && byId.has(cur.parent) && d < 40; cur = byId.get(cur.parent)) d += 1; return d; };
  return result;
}

/** Notes: { text, targets: [key] } beside their first target (with note links) or under the drawing. */
function addNotes(diagram, notes, viewFor, extent) {
  let free = 0;
  for (const note of notes) {
    const targets = (note.targets ?? []).map(viewFor).filter(Boolean);
    const t = targets[0];
    const at = t ? { x: Number(t.left) + Math.max(Number(t.width) || 140, 140) + 40, y: Number(t.top) } : { x: 40 + free, y: 80 + (extent?.h ?? 0) };
    if (!t) free += 200;
    const view = addView(diagram, createNodeView('UMLNoteView', null, { x: at.x, y: at.y, w: 160, h: 50 }, { text: note.text }));
    for (const target of targets) addView(diagram, createEdgeView('UMLNoteLinkView', null, view._id, target._id));
  }
}

/** Structure IR → { owner: UMLPackage, diagram, kind }. */
function buildStructure(ir, diagramType, kind, { language = 'en', name = '', direction = '' } = {}) {
  const add = adder(language);
  const title = name || 'Imported';
  const owner = createElement('UMLPackage', { name: title });
  const elements = new Map();
  const holderOf = new Map();
  // Parents before children.
  const kidsOf = new Map();
  for (const n of ir.nodes.values()) { const p = n.parent && ir.nodes.has(n.parent) ? n.parent : null; if (!kidsOf.has(p)) kidsOf.set(p, []); kidsOf.get(p).push(n); }
  const ordered = [];
  const visit = (p, depth) => { for (const n of kidsOf.get(p) ?? []) { ordered.push(n); if (depth < 40) visit(n.key, depth + 1); } };
  visit(null, 0);
  const ancestors = (node) => { const out = []; for (let k = node.parent; k && out.length < 40; k = ir.nodes.get(k)?.parent) { const el = elements.get(k); if (el) out.push(el); } return out; };
  for (const node of ordered) {
    let type = node.type;
    let holder;
    if (type === 'UMLPort' || type === 'UMLPart') {
      holder = ancestors(node).find((el) => canContain(el, type));
      if (!holder) { type = type === 'UMLPort' ? 'UMLInterface' : 'UMLClass'; node.type = type; }
    }
    if (!holder) holder = ancestors(node).find((el) => typeDef(el._type)?.namespace && canContain(el, type)) ?? owner;
    if (!canContain(holder, type)) holder = owner;
    const attrs = { name: node.name };
    if (node.stereotype) attrs.stereotype = node.stereotype;
    if (node.isAbstract) attrs.isAbstract = true;
    if (type === 'UMLPart' || type === 'UMLPort') { const m = /^(.*?)\s*:\s*(.+)$/.exec(node.name); if (m) { attrs.name = m[1]; attrs.type = m[2]; } }
    Object.assign(attrs, node.attrs);
    const el = add(holder, type, attrs);
    for (const literal of node.literals) add(el, 'UMLEnumerationLiteral', { name: literal });
    for (const m of node.members) {
      if (type === 'UMLEnumeration' && m.kind === 'attribute' && !m.type) { add(el, 'UMLEnumerationLiteral', { name: m.name }); continue; }
      if (m.kind === 'attribute') {
        if (!canContain(el, 'UMLAttribute')) continue;
        add(el, 'UMLAttribute', { name: m.name, type: m.type, visibility: m.visibility, isStatic: m.isStatic, defaultValue: m.defaultValue ?? '', ...(m.multiplicity ? { multiplicity: m.multiplicity } : {}), ...(m.isReadOnly ? { isReadOnly: true } : {}), ...(m.isID ? { isID: true } : {}) });
      } else {
        if (!canContain(el, 'UMLOperation')) continue;
        const op = add(el, 'UMLOperation', { name: m.name, visibility: m.visibility, isStatic: m.isStatic, isAbstract: m.isAbstract });
        for (const p of m.params) add(op, 'UMLParameter', { name: p.name, type: p.type, direction: 'in' });
        if (m.returnType) add(op, 'UMLParameter', { name: '', type: m.returnType, direction: 'return' });
      }
    }
    for (const s of node.slots) if (canContain(el, 'UMLSlot')) add(el, 'UMLSlot', { name: s.name, value: s.value });
    elements.set(node.key, el);
    holderOf.set(el, holder);
  }
  const home = (el) => (typeDef(el._type)?.namespace ? el : holderOf.get(el) ?? owner);
  const relations = [];
  for (const r of ir.relations) {
    const a = elements.get(r.from);
    const b = elements.get(r.to);
    if (!a || !b) continue;
    const attrs = typeDef(r.type)?.ends === 'association'
      ? { name: r.name ?? '', end1: { reference: ref(a), multiplicity: r.end1?.multiplicity ?? '', aggregation: r.end1?.aggregation ?? 'none', navigable: r.end1?.navigable ?? 'unspecified', ...(r.end1?.name ? { name: r.end1.name } : {}) }, end2: { reference: ref(b), multiplicity: r.end2?.multiplicity ?? '', aggregation: r.end2?.aggregation ?? 'none', navigable: r.end2?.navigable ?? 'unspecified', ...(r.end2?.name ? { name: r.end2.name } : {}) } }
      : { name: r.name ?? '', source: ref(a), target: ref(b) };
    if (r.stereotype) attrs.stereotype = r.stereotype;
    if (r.type === 'UMLInformationFlow' && r.name) attrs.conveyed = r.name;
    Object.assign(attrs, r.attrs ?? {});
    relations.push({ el: insertElement(home(a), createElement(r.type, attrs, { language })), r });
  }
  const links = [];
  for (const ac of ir.assocClasses) {
    const cls = elements.get(ac.cls);
    const a = elements.get(ac.from);
    const b = elements.get(ac.to);
    if (!cls || !a || !b) continue;
    let assoc = relations.find(({ el }) => el._type === 'UMLAssociation' && [refId(el.end1?.reference), refId(el.end2?.reference)].sort().join() === [a._id, b._id].sort().join())?.el;
    if (!assoc) { assoc = insertElement(home(a), createElement('UMLAssociation', { name: '', end1: { reference: ref(a) }, end2: { reference: ref(b) } }, { language })); relations.push({ el: assoc, r: { from: ac.from, to: ac.to } }); }
    links.push({ link: insertElement(home(cls), createElement('UMLAssociationClassLink', { classSide: ref(cls), associationSide: ref(assoc) }, { language })), cls, assoc });
  }
  const diagram = insertElement(owner, createElement(diagramType, { name: title, ownedViews: [] }, { language }));
  // Layout: ports sit on their owner's border, everything else is nested by ownership.
  const nodes = ordered.filter((n) => elements.has(n.key));
  const portNodes = nodes.filter((n) => elements.get(n.key)._type === 'UMLPort');
  const laid = nodes.filter((n) => elements.get(n.key)._type !== 'UMLPort');
  const keyOf = new Map(nodes.map((n) => [elements.get(n.key)._id, n.key]));
  const edgeKeys = relations.map(({ el, r }) => (/Generalization|Realization/.test(el._type) ? [r.to, r.from] : [r.from, r.to]));
  const boxes = nestedLayout(laid.map((n) => ({ id: n.key, ...nodeSize(n), parent: n.parent && laid.some((x) => x.key === n.parent) ? n.parent : null })), edgeKeys, { direction: direction || (kind === 'usecase' ? 'LR' : 'TB'), gapX: 70, gapY: 80, wrap: 5 });
  const hasKids = new Set(laid.map((n) => n.parent).filter(Boolean));
  const viewOf = new Map();
  const icon = ['component', 'deployment', 'composite', 'infoflow'].includes(kind);
  for (const n of laid.slice().sort((a, b) => boxes.depthOf(a.key) - boxes.depthOf(b.key))) {
    const el = elements.get(n.key);
    const b = boxes.get(n.key);
    const explicit = hasKids.has(n.key) || EXPLICIT_SIZE.has(el._type);
    viewOf.set(n.key, addView(diagram, createNodeView(`${el._type}View`, el._id, { x: b.x, y: b.y, w: explicit ? b.w : 0, h: explicit ? b.h : 0 }, icon && el._type === 'UMLInterface' ? { stereotypeDisplay: 'icon' } : {})));
  }
  const portsOf = new Map();
  for (const n of portNodes) { const holder = keyOf.get(holderOf.get(elements.get(n.key))?._id); if (!portsOf.has(holder)) portsOf.set(holder, []); portsOf.get(holder).push(n); }
  for (const [holder, list] of portsOf) {
    const b = boxes.get(holder) ?? { x: 20, y: 20, w: 0, h: 200 };
    list.forEach((n, i) => {
      const el = elements.get(n.key);
      const y = b.y + ((i + 1) * Math.max(b.h, 60)) / (list.length + 1) - 10;
      viewOf.set(n.key, addView(diagram, createNodeView('UMLPortView', el._id, { x: (i % 2 ? b.x + b.w : b.x) - 10, y, w: 20, h: 20 })));
    });
  }
  const edgeViewOf = new Map();
  for (const { el, r } of relations) {
    const [s, t] = typeDef(el._type)?.ends === 'association' ? [keyOf.get(refId(el.end1.reference)), keyOf.get(refId(el.end2.reference))] : [r.from, r.to];
    const vs = viewOf.get(s);
    const vt = viewOf.get(t);
    if (vs && vt) edgeViewOf.set(el._id, addView(diagram, createEdgeView(`${el._type}View`, el._id, vs._id, vt._id)));
  }
  for (const { link, cls, assoc } of links) {
    const cv = viewOf.get(keyOf.get(cls._id));
    const av = edgeViewOf.get(assoc._id);
    if (cv && av) addView(diagram, createEdgeView('UMLAssociationClassLinkView', link._id, cv._id, av._id));
  }
  addNotes(diagram, ir.notes, (key) => viewOf.get(key), boxes.extent);
  return { owner, diagram, kind };
}

/** Which diagram a structure IR is (class context). */
function classDiagramType(ir) {
  const types = [...ir.nodes.values()].map((n) => n.type);
  if (types.some((t) => t === 'UMLStereotype' || t === 'UMLMetaClass' || t === 'UMLProfile') || ir.relations.some((r) => r.type === 'UMLExtension')) return ['UMLProfileDiagram', 'profile'];
  const classifiers = types.filter((t) => !/^UML(Object|Package|Model|Subsystem)$/.test(t));
  if (types.includes('UMLObject') && !classifiers.length) return ['UMLObjectDiagram', 'object'];
  const packages = new Set([...ir.nodes.values()].filter((n) => /^UML(Package|Model|Subsystem)$/.test(n.type)).map((n) => n.key));
  if (packages.size && ((ir.relations.length && ir.relations.every((r) => packages.has(r.from) && packages.has(r.to))) || !classifiers.length)) return ['UMLPackageDiagram', 'package'];
  return ['UMLClassDiagram', 'class'];
}

// ───────────────────────── reading: sequence

const SEQ_P = String.raw`(?:"[^"]+"|[\w$.À-￿@]+)`;
const SEQ_MSG = new RegExp(String.raw`^(${SEQ_P})?\s*(\[|\?)?((?<=^|\s|\[|\?)[xo])?(<<|<|\/\/|\\\\|\/|\\)?(-{1,2}(?:\[[^\]]*\])?-?|-\[[^\]]*\]-)(>>|>|\/\/|\\\\|\/|\\)?([xo](?=[\s\]?:]|$))?(\]|\?)?\s*(${SEQ_P})?\s*((?:\+\+|--|\*\*|!!)*)\s*(?:#\S+\s*)?(?::\s*(.*))?$`);

function parseSequence(lines, warn) {
  const ir = { participants: [], items: [], autonumber: false };
  const known = new Map();
  const participant = (raw, label = '', kind = '') => {
    const key = unq(raw).replace(/\s*(\+\+|--|\*\*|!!)$/, '');
    if (!known.has(key)) { const p = { id: key, label: nl(unq(label)) || key, kind: '' }; known.set(key, p); ir.participants.push(p); } else if (label) known.get(key).label = nl(unq(label));
    if (kind) known.get(key).kind = kind;
    return known.get(key);
  };
  const stack = [{ items: ir.items }];
  const target = () => stack[stack.length - 1].items;
  const created = new Set();
  const destroyed = new Set();
  const calls = [];
  let last = null;
  for (const line of lines) {
    let m;
    if ((m = /^(?:\/\s*)?[rh]?note\s+(left|right|over|across)(?:\s+of)?\s*([^:#]*?)\s*(?:#\S+\s*)?:\s*(.*)$/i.exec(line))) {
      const side = m[1].toLowerCase();
      let over = m[2].split(',').map((s) => s.trim()).filter(Boolean).map((s) => participant(s).id);
      if (side === 'across') over = ir.participants.map((p) => p.id);
      if (!over.length && last) over = [side === 'left' ? last.from ?? last.to : last.to ?? last.from].filter(Boolean);
      target().push({ kind: 'note', over, text: nl(m[3]), side: side === 'left' ? 'left' : side === 'right' ? 'right' : 'over' });
      continue;
    }
    if ((m = /^ref\s+over\s+([^:]+?)\s*:\s*(.*)$/i.exec(line))) { target().push({ kind: 'ref', over: m[1].split(',').map((s) => participant(s.trim()).id), text: nl(m[2]) }); continue; }
    if ((m = /^==\s*(.*?)\s*==$/.exec(line))) { target().push({ kind: 'divider', text: m[1] }); continue; }
    if (/^\.\.\.(.*\.\.\.)?$/.test(line) || /^\|\|(\d*\|\||\|)$/.test(line)) { target().push({ kind: 'space' }); continue; }
    if (/^autonumber\b/i.test(line)) { ir.autonumber = !/^autonumber\s+stop/i.test(line) || ir.autonumber; continue; }
    if (/^(activate|deactivate|box|end\s+box|newpage|hide|show|skinparam)\b/i.test(line)) continue;
    // (Not "Participant -> Actor : hi": participants may be named like the keywords.)
    if ((m = /^(create\s+)?(participant|actor|boundary|control|entity|database|collections|queue)\s+(?![-<.]*[-.]{1,2}[>\\/ox]*\s)(.+)$/i.exec(line))) {
      const d = parseDecl(m[3]);
      if (!d) { warn(line); continue; }
      const kind = m[2].toLowerCase();
      const { key, label } = declNames(d);
      const p = participant(key, label === key ? '' : label, kind);
      if (d.stereotypes.length && !p.stereotype) p.stereotype = d.stereotypes[0];
      if (m[1]) created.add(p.id);
      continue;
    }
    if ((m = /^create\s+(.+)$/i.exec(line))) { created.add(participant(m[1]).id); continue; }
    if ((m = /^destroy\s+(.+)$/i.exec(line))) {
      // "A -> B : bye" + "destroy B": that message destroys B. After an answer from B ("B --> A" + "destroy B")
      // B is destroyed by the one it talked to. Before any message to B: the next message to B destroys it.
      const id = participant(m[1]).id;
      if (last?.kind === 'message' && last.to === id && !['createMessage', 'reply'].includes(last.sort)) last.sort = 'deleteMessage';
      else if (last?.kind === 'message' && last.from === id && last.to && last.to !== id) target().push((last = { kind: 'message', from: last.to, to: id, sort: 'deleteMessage', text: '' }));
      else destroyed.add(id);
      continue;
    }
    if ((m = /^(alt|opt|loop|par|par2|break|critical|group)\b\s*(.*)$/i.exec(line))) {
      let operator = m[1].toLowerCase().replace('par2', 'par');
      let guard = m[2].trim();
      if (operator === 'group') {
        const g = /^(\S+)\s*(.*)$/.exec(guard);
        if (g && INTERACTION_OPERATORS.includes(g[1]) && !PLANT_FRAGMENT.has(g[1])) { operator = g[1]; guard = g[2]; } else operator = 'seq';
        guard = guard.replace(/^\[(.*)\]$/, '$1').replace(/\s+\[[^\]]*\]$/, '');
      }
      const fragment = { kind: 'fragment', operator, operands: [{ guard, items: [] }] };
      target().push(fragment);
      stack.push({ fragment, items: fragment.operands[0].items });
      continue;
    }
    if ((m = /^else\b\s*(.*)$/i.exec(line))) {
      const top = stack[stack.length - 1];
      if (top.fragment) { const operand = { guard: m[1].trim(), items: [] }; top.fragment.operands.push(operand); top.items = operand.items; }
      continue;
    }
    if (/^end$/i.test(line)) { if (stack.length > 1) stack.pop(); continue; }
    if ((m = /^return\b\s*(.*)$/i.exec(line))) {
      const call = calls.pop();
      if (call) target().push((last = { kind: 'message', from: call.to, to: call.from, sort: 'reply', text: m[1].trim() }));
      continue;
    }
    if ((m = SEQ_MSG.exec(line))) {
      const [, left, lBracket, lDeco, lHead, body, rHead, rDeco, rBracket, right, suffix, text] = m;
      if ((!left && !lBracket) || (!right && !rBracket)) { warn(line); continue; }
      const reversed = Boolean(lHead) && !rHead;
      const dotted = body.replace(/\[[^\]]*\]/g, '').length >= 2;
      const head = reversed ? lHead : rHead;
      const headDeco = reversed ? lDeco : rDeco;
      const async = head === '>>' || head === '<<';
      const signal = /[\\/]/.test(head ?? '') || headDeco === 'x';
      const gate = (bracket, deco) => (bracket ? { gate: bracket === '?' || deco === 'o' || deco === 'x' ? 'endpoint' : 'gate' } : null);
      let fromEnd = left ? participant(left).id : { ...gate(lBracket, lDeco), side: 'left' };
      let toEnd = right ? participant(right).id : { ...gate(rBracket, rDeco), side: 'right' };
      if (reversed) [fromEnd, toEnd] = [toEnd, fromEnd];
      let sort = dotted ? 'reply' : signal ? 'asynchSignal' : async ? 'asynchCall' : 'synchCall';
      const to = typeof toEnd === 'string' ? toEnd : null;
      if (to && (/\*\*/.test(suffix) || created.has(to))) { sort = 'createMessage'; created.delete(to); } else if (to && (/!!/.test(suffix) || destroyed.has(to))) { sort = 'deleteMessage'; destroyed.delete(to); }
      const item = { kind: 'message', sort, text: (text ?? '').trim() };
      if (typeof fromEnd === 'string') item.from = fromEnd; else item.fromGate = fromEnd;
      if (typeof toEnd === 'string') item.to = toEnd; else item.toGate = toEnd;
      target().push(item);
      last = item;
      if (sort === 'synchCall' && item.from && item.to) calls.push({ from: item.from, to: item.to });
      continue;
    }
    warn(line);
  }
  return ir;
}

/** Sequence IR → { owner: UMLCollaboration, diagram, kind: 'sequence' }. */
function buildSequence(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const title = name || 'Interaction';
  const owner = createElement('UMLCollaboration', { name: title });
  const interaction = add(owner, 'UMLInteraction', { name: title });
  const diagram = insertElement(interaction, createElement('UMLSequenceDiagram', { name: title, ownedViews: [], showSequenceNumber: Boolean(ir.autonumber), messageSignature: 'nameAndType', showActivation: true }, { language }));
  const lifelines = new Map();
  for (const p of ir.participants) {
    let type = '';
    if (p.kind === 'actor') type = ref(add(owner, 'UMLActor', { name: p.label || p.id }));
    const attribute = add(owner, 'UMLAttribute', { name: p.label || p.id, type });
    const stereotype = LIFELINE_KINDS.has(p.kind) ? p.kind : p.stereotype ?? '';
    lifelines.set(p.id, add(interaction, 'UMLLifeline', { name: p.label || p.id, represent: ref(attribute), ...(stereotype ? { stereotype } : {}) }));
  }
  const LEFT = 60;
  const TOP = 40;
  const STEP = 180;
  const WIDTH = 120;
  const column = new Map(ir.participants.map((p, i) => [p.id, LEFT + i * STEP]));
  const rightEdge = LEFT + Math.max(0, ir.participants.length - 1) * STEP + WIDTH;
  const heightOf = (item) => (item.kind === 'message' ? (item.from && item.from === item.to ? 60 : 40) : item.kind === 'note' ? 60 : item.kind === 'ref' ? 80 : item.kind === 'divider' ? 40 : item.kind === 'space' ? 30 : fragmentHeight(item) + 20);
  const measure = (items) => items.reduce((h, item) => h + heightOf(item), 0);
  const operandHeight = (f) => Math.max(...f.operands.map((o) => 30 + measure(o.items) + 10), 60);
  const fragmentHeight = (f) => operandHeight(f) * Math.max(1, f.operands.length);
  const touched = (items, set = new Set()) => {
    for (const item of items) {
      if (item.kind === 'message') { if (item.from) set.add(item.from); if (item.to) set.add(item.to); } else if (item.kind === 'fragment') item.operands.forEach((o) => touched(o.items, set)); else if (item.over) item.over.forEach((id) => set.add(id));
    }
    return set;
  };
  const views = new Map();
  for (const p of ir.participants) views.set(p.id, addView(diagram, createNodeView('UMLLifelineView', lifelines.get(p.id)._id, { x: column.get(p.id), y: TOP, w: WIDTH, h: 0 })));
  const behind = [];
  const nodesFirst = [];
  const pending = [];
  const span = (over) => { const xs = over.map((id) => column.get(id)).filter((x) => x !== undefined); return xs.length ? { x: Math.min(...xs), w: Math.max(...xs) - Math.min(...xs) + WIDTH } : { x: LEFT, w: WIDTH }; };
  const gateView = (g, y, other) => {
    const el = add(interaction, g.gate === 'endpoint' ? 'UMLEndpoint' : 'UMLGate', {});
    const otherX = column.get(other) ?? LEFT;
    const x = g.side === 'left' ? (g.gate === 'endpoint' ? otherX - 60 : LEFT - 50) : (g.gate === 'endpoint' ? otherX + WIDTH + 50 : rightEdge + 40);
    const view = createNodeView(g.gate === 'endpoint' ? 'UMLEndpointView' : 'UMLGateView', el._id, { x, y: y - 7, w: 14, h: 14 });
    nodesFirst.push(view);
    return { el, view };
  };
  const place = (items, y, depth) => {
    for (const item of items) {
      if (item.kind === 'message') {
        const self = item.from && item.from === item.to;
        y += self ? 30 : 20;
        const from = item.from ? { el: lifelines.get(item.from), view: views.get(item.from) } : gateView(item.fromGate, y, item.to);
        const to = item.to ? { el: lifelines.get(item.to), view: views.get(item.to) } : gateView(item.toGate, y, item.from);
        const message = add(interaction, 'UMLMessage', { name: item.text ?? '', source: ref(from.el), target: ref(to.el), messageSort: item.sort || 'synchCall' });
        pending.push(createEdgeView('UMLMessageView', message._id, from.view._id, to.view._id, { y }));
        y += self ? 30 : 20;
      } else if (item.kind === 'note') {
        const s = span(item.over);
        const x = item.side === 'right' ? s.x + WIDTH / 2 + 20 : item.side === 'left' ? s.x - 120 : s.x + 10;
        pending.push(createNodeView('UMLNoteView', null, { x, y: y + 10, w: Math.max(140, item.side === 'over' ? s.w - 20 : 140), h: 40 }, { text: item.text }));
        y += 60;
      } else if (item.kind === 'ref') {
        const s = span(item.over);
        const use = add(interaction, 'UMLInteractionUse', { name: item.text });
        pending.push(createNodeView('UMLInteractionUseView', use._id, { x: s.x - 10, y: y + 10, w: s.w + 20, h: 60 }));
        y += 80;
      } else if (item.kind === 'divider') {
        pending.push(createNodeView('UMLTextView', null, { x: LEFT, y: y + 10, w: rightEdge - LEFT, h: 24 }, { text: item.text }));
        y += 40;
      } else if (item.kind === 'space') {
        y += 30;
      } else {
        const fragment = add(interaction, 'UMLCombinedFragment', { name: '', interactionOperator: item.operator });
        const covered = [...touched([item])].map((id) => column.get(id)).filter((x) => x !== undefined);
        const minX = covered.length ? Math.min(...covered) : LEFT;
        const maxX = covered.length ? Math.max(...covered) + WIDTH : LEFT + WIDTH;
        const top = y + 10;
        const opH = operandHeight(item);
        const inset = depth * 8;
        behind.push(createNodeView('UMLCombinedFragmentView', fragment._id, { x: minX - 20 + inset, y: top, w: maxX - minX + 40 - 2 * inset, h: opH * Math.max(1, item.operands.length) }));
        item.operands.forEach((operand, i) => {
          add(fragment, 'UMLInteractionOperand', { name: '', guard: operand.guard ?? '' });
          place(operand.items, top + i * opH + 30, depth + 1);
        });
        y = top + fragmentHeight(item) + 10;
      }
    }
    return y;
  };
  const bottom = place(ir.items, TOP + 60, 0);
  for (const view of views.values()) view.height = Math.max(200, bottom + 40 - TOP);
  for (const view of [...behind, ...nodesFirst, ...pending]) addView(diagram, view);
  return { owner, diagram, kind: 'sequence' };
}

// ───────────────────────── reading: activity (new syntax and legacy)

const ACTION_END = /^(?:#[^\s:]+)?:([\s\S]*)([;|<>/\]}])\s*(?:<<\s*([^>]*?)\s*>>)?\s*$/;

function parseActivity(lines, warn) {
  const ir = { nodes: [], edges: [], partitions: [], notes: [] };
  let seq = 0;
  let lane = null;
  let frontier = [];
  let pending = '';
  let lastNode = null;
  const stack = [];
  const lanes = [];
  const node = (type, name = '', attrs = {}) => { const n = { key: `a${seq += 1}`, type, name, partition: lane, attrs }; ir.nodes.push(n); return n; };
  const edge = (from, to, guard = '') => ir.edges.push({ from: from.key, to: to.key, guard });
  const attach = (n) => { for (const f of frontier) edge(f.node, n, f.guard || pending); pending = ''; frontier = [{ node: n, guard: '' }]; lastNode = n; return n; };
  const merge = (ends, type = 'UMLMergeNode') => {
    if (ends.length <= 1) { frontier = ends; return; }
    const m = node(type);
    for (const e of ends) edge(e.node, m, e.guard);
    frontier = [{ node: m, guard: '' }];
  };
  const loop = () => { for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].kind === 'while' || stack[i].kind === 'repeat') return stack[i]; return null; };
  const setLane = (name) => { if (!ir.partitions.includes(name)) ir.partitions.push(name); lane = name; };
  let buffer = null;
  for (const raw of lines) {
    let line = raw;
    if (buffer !== null) { buffer += `\n${line}`; if (!ACTION_END.test(buffer)) continue; line = buffer; buffer = null; }
    let m;
    if (/^(?:#[^\s:]+)?:/.test(line) && !ACTION_END.test(line)) { buffer = line; continue; }
    if ((m = ACTION_END.exec(line))) {
      const text = m[1].trim();
      const end = m[2];
      const st = (m[3] ?? '').toLowerCase();
      let type = 'UMLAction';
      const attrs = {};
      if (end === ']' || st === 'object' || st === 'input' || st === 'output') type = 'UMLObjectNode';
      else if (st === 'datastore' || st === 'save' || st === 'load') type = 'UMLDataStoreNode';
      else if (end === '<') attrs.kind = 'acceptSignal';
      else if (end === '>') attrs.kind = 'sendSignal';
      else if (st === 'procedure' || st === 'ref' || st === 'callbehavior') attrs.kind = 'callBehavior';
      else if (st && type === 'UMLAction' && st !== 'task' && st !== 'continuous') attrs.stereotype = m[3];
      const top = stack[stack.length - 1];
      if (top?.kind === 'repeat' && top.awaitingBackward) { top.backward = { text, type, attrs }; top.awaitingBackward = false; continue; }
      attach(node(type, text, attrs));
      continue;
    }
    if (/^start$/i.test(line)) { attach(node('UMLInitialNode')); continue; }
    if (/^stop$/i.test(line)) { attach(node('UMLActivityFinalNode')); frontier = []; continue; }
    if (/^(end|kill)$/i.test(line)) { attach(node('UMLFlowFinalNode')); frontier = []; continue; }
    if (/^detach$/i.test(line)) { frontier = []; continue; }
    if ((m = /^-(?:\[[^\]]*\])?-?>\s*(.*?);?$/.exec(line))) { pending = m[1].trim(); continue; }
    if ((m = /^if\s*\((.*)\)\s*(?:(?:is|equals)\s*\(([^)]*)\)\s*)?then\s*(?:\(([^)]*)\))?\s*$/i.exec(line)) || (m = /^if\s*\((.*)\)\s*$/i.exec(line))) {
      const d = attach(node('UMLDecisionNode', m[1].trim()));
      stack.push({ kind: 'if', current: d, ends: [], elseSeen: false });
      frontier = [{ node: d, guard: (m[3] ?? m[2] ?? '').trim() }];
      continue;
    }
    if ((m = /^else\s?if\s*\((.*?)\)\s*(?:(?:is|equals)\s*\(([^)]*)\)\s*)?(?:then\s*)?(?:\(([^)]*)\))?\s*$/i.exec(line))) {
      const top = stack[stack.length - 1];
      if (top?.kind !== 'if') { warn(line); continue; }
      top.ends.push(...frontier);
      frontier = [{ node: top.current, guard: '' }];
      const d = attach(node('UMLDecisionNode', m[1].trim()));
      top.current = d;
      frontier = [{ node: d, guard: (m[3] ?? m[2] ?? '').trim() }];
      continue;
    }
    if ((m = /^else\b\s*(?:\(([^)]*)\))?\s*$/i.exec(line))) {
      const top = stack[stack.length - 1];
      if (top?.kind !== 'if') { warn(line); continue; }
      top.ends.push(...frontier);
      frontier = [{ node: top.current, guard: (m[1] ?? '').trim() }];
      top.elseSeen = true;
      continue;
    }
    if (/^end\s?if$/i.test(line)) {
      const top = stack.pop();
      if (top?.kind !== 'if') { warn(line); continue; }
      if (!top.elseSeen) top.ends.push({ node: top.current, guard: '' });
      merge([...top.ends, ...frontier]);
      continue;
    }
    if ((m = /^switch\s*\((.*)\)\s*$/i.exec(line))) { const d = attach(node('UMLDecisionNode', m[1].trim())); stack.push({ kind: 'switch', current: d, ends: [], started: false }); frontier = []; continue; }
    if ((m = /^case\s*\((.*)\)\s*$/i.exec(line))) {
      const top = stack[stack.length - 1];
      if (top?.kind !== 'switch') { warn(line); continue; }
      if (top.started) top.ends.push(...frontier);
      frontier = [{ node: top.current, guard: m[1].trim() }];
      top.started = true;
      continue;
    }
    if (/^end\s?switch$/i.test(line)) { const top = stack.pop(); if (top?.kind !== 'switch') { warn(line); continue; } merge([...top.ends, ...frontier]); continue; }
    if ((m = /^while\s*\((.*?)\)\s*(?:is\s*\(([^)]*)\))?\s*$/i.exec(line))) {
      const d = attach(node('UMLDecisionNode', m[1].trim()));
      stack.push({ kind: 'while', current: d, breaks: [] });
      frontier = [{ node: d, guard: (m[2] ?? '').trim() }];
      continue;
    }
    if ((m = /^end\s?while\s*(?:\(([^)]*)\))?\s*$/i.exec(line))) {
      const top = stack.pop();
      if (top?.kind !== 'while') { warn(line); continue; }
      for (const f of frontier) edge(f.node, top.current, f.guard || pending);
      pending = '';
      frontier = [{ node: top.current, guard: (m[1] ?? '').trim() }, ...top.breaks];
      continue;
    }
    if ((m = /^repeat\s*$/i.exec(line)) || (m = /^repeat\s*(:.*;)\s*$/i.exec(line))) {
      const start = attach(node('UMLMergeNode'));
      stack.push({ kind: 'repeat', start, breaks: [], backward: null });
      if (m[1]) attach(node('UMLAction', m[1].slice(1, -1).trim()));
      continue;
    }
    if (/^backward\s*:/i.test(line)) {
      const top = loop();
      const bm = /^backward\s*:(.*?)[;|<>/\]}]?\s*$/i.exec(line);
      if (top?.kind === 'repeat' && bm) top.backward = { text: bm[1].trim(), type: 'UMLAction', attrs: {} }; else warn(line);
      continue;
    }
    if ((m = /^repeat\s?while\s*(?:\((.*?)\))?\s*(?:is\s*\(([^)]*)\))?\s*(?:not\s*\(([^)]*)\))?\s*$/i.exec(line))) {
      const top = stack.pop();
      if (top?.kind !== 'repeat') { warn(line); continue; }
      const d = attach(node('UMLDecisionNode', (m[1] ?? '').trim()));
      if (top.backward) { const b = node(top.backward.type, top.backward.text, top.backward.attrs); edge(d, b, (m[2] ?? '').trim()); edge(b, top.start); } else edge(d, top.start, (m[2] ?? '').trim());
      frontier = [{ node: d, guard: (m[3] ?? '').trim() }, ...top.breaks];
      continue;
    }
    if (/^break$/i.test(line)) { const top = loop(); if (top) { top.breaks.push(...frontier); frontier = []; } else warn(line); continue; }
    if (/^fork$/i.test(line)) { const bar = attach(node('UMLForkNode')); stack.push({ kind: 'fork', bar, ends: [] }); continue; }
    if (/^fork\s+again$/i.test(line)) { const top = stack[stack.length - 1]; if (top?.kind !== 'fork') { warn(line); continue; } top.ends.push(...frontier); frontier = [{ node: top.bar, guard: '' }]; continue; }
    if ((m = /^end\s?(fork|merge)\b.*$/i.exec(line))) {
      const top = stack.pop();
      if (top?.kind !== 'fork') { warn(line); continue; }
      const ends = [...top.ends, ...frontier];
      if (ends.length) { const j = node(m[1].toLowerCase() === 'merge' ? 'UMLMergeNode' : 'UMLJoinNode'); for (const e of ends) edge(e.node, j, e.guard); frontier = [{ node: j, guard: '' }]; }
      continue;
    }
    if (/^split$/i.test(line)) { stack.push({ kind: 'split', origin: frontier.slice(), ends: [] }); continue; }
    if (/^split\s+again$/i.test(line)) { const top = stack[stack.length - 1]; if (top?.kind !== 'split') { warn(line); continue; } top.ends.push(...frontier); frontier = top.origin.slice(); continue; }
    if (/^end\s?split$/i.test(line)) { const top = stack.pop(); if (top?.kind !== 'split') { warn(line); continue; } frontier = [...top.ends, ...frontier]; continue; }
    if ((m = /^(?:partition|group|package|rectangle|card)\s+(.+?)\s*(\{)?\s*$/i.exec(line))) {
      const label = unq(m[1].replace(/\s*(#\S+|<<[^>]*>>)\s*/g, ' ').trim());
      lanes.push(lane);
      if (/^group/i.test(line) && !m[2]) { stack.push({ kind: 'group' }); continue; }
      setLane(label);
      if (!m[2]) stack.push({ kind: 'partition' });
      continue;
    }
    if (/^end\s?(partition|group)$/i.test(line) || line === '}') { const top = stack[stack.length - 1]; if (top?.kind === 'partition' || top?.kind === 'group') stack.pop(); lane = lanes.length ? lanes.pop() : null; continue; }
    if ((m = /^\|(?:#[^|]*\|)?([^|]+)\|(.*)$/.exec(line))) { setLane(unq((m[2].trim() || m[1]).trim())); continue; }
    if ((m = /^(?:floating\s+)?note\s+(?:left|right|top|bottom)?[^:]*:\s*(.*)$/i.exec(line))) { ir.notes.push({ text: nl(m[1]), targets: lastNode ? [lastNode.key] : [] }); continue; }
    if (/^\([^)]*\)$/.test(line) || /^(label|goto)\s/i.test(line)) { warn(line, 'plantuml.unsupported'); continue; }
    warn(line);
  }
  return ir;
}

const LEGACY_NODE = String.raw`(?:\(\*(?:top|bottom)?\)|===+\s*[^=]*?\s*===+|"(?:[^"]|\\")*"(?:\s+as\s+[\w.À-￿]+)?|[\w.À-￿]+)(?:\s*<<[^>]*>>)?`;
const LEGACY_LINK = new RegExp(String.raw`^(${LEGACY_NODE})?\s*(-+(?:\[[^\]]*\]|up|down|left|right|[udlr])*-*>|\.+(?:\[[^\]]*\]|up|down|left|right|[udlr])*\.*>)\s*(?:\[([^\]]*)\])?\s*(${LEGACY_NODE})\s*$`);
const LEGACY_STEREO = { decision: 'UMLDecisionNode', merge: 'UMLMergeNode', flowfinal: 'UMLFlowFinalNode', object: 'UMLObjectNode', centralbuffer: 'UMLCentralBufferNode', datastore: 'UMLDataStoreNode', final: 'UMLActivityFinalNode', initial: 'UMLInitialNode', structured: 'UMLStructuredActivityNode', expansion: 'UMLExpansionRegion', ref: 'UMLInteractionUse' };

function parseLegacyActivity(lines, warn) {
  const ir = { nodes: [], edges: [], partitions: [], notes: [] };
  const byKey = new Map();
  let seq = 0;
  let lane = null;
  const lanes = [];
  let last = [];
  const ifs = [];
  const make = (key, type, name, attrs = {}) => { if (byKey.has(key)) return byKey.get(key); const n = { key: `l${seq += 1}`, type, name, partition: lane, attrs }; ir.nodes.push(n); byKey.set(key, n); return n; };
  const token = (text, asSource) => {
    let t = text.trim();
    let st = '';
    const sm = /\s*<<\s*([^>]*?)\s*>>$/.exec(t);
    if (sm) { st = sm[1]; t = t.slice(0, sm.index).trim(); }
    if (/^\(\*(top|bottom)?\)$/.test(t)) return asSource ? make('(*)start', 'UMLInitialNode', '') : make('(*)end', 'UMLActivityFinalNode', '');
    let m;
    if ((m = /^===+\s*([^=]*?)\s*===+$/.exec(t))) return make(`bar:${m[1]}`, 'UMLForkNode', '');
    let label;
    let key;
    if ((m = /^"((?:[^"]|\\")*)"(?:\s+as\s+([\w.À-￿]+))?$/.exec(t))) { label = nl(m[1]); key = m[2] ?? `text:${m[1]}`; } else { key = t; label = t; }
    if (byKey.has(key)) return byKey.get(key);
    const type = LEGACY_STEREO[st.toLowerCase()] ?? 'UMLAction';
    const attrs = {};
    if (type === 'UMLAction' && st) { if (st === 'ref') attrs.kind = 'callBehavior'; else if (['callBehavior', 'callOperation', 'sendSignal', 'acceptSignal', 'acceptTimeEvent', 'createObject', 'destroyObject', 'structured'].includes(st)) attrs.kind = st; else attrs.stereotype = st; }
    const name = (type === 'UMLDecisionNode' && label === '?') || (type === 'UMLMergeNode' && label === 'merge') ? '' : label;
    return make(key, type, name, attrs);
  };
  for (const line of lines) {
    let m;
    if ((m = /^partition\s+(.+?)\s*(\{)?\s*$/i.exec(line))) { lanes.push(lane); lane = unq(m[1].replace(/\s*#\S+/, '')); if (!ir.partitions.includes(lane)) ir.partitions.push(lane); continue; }
    if (line === '}' || /^end\s?partition$/i.test(line)) { lane = lanes.length ? lanes.pop() : null; continue; }
    if ((m = /^(?:(.*?)\s*-+(?:\[[^\]]*\]|up|down|left|right|[udlr])*-*>\s*(?:\[([^\]]*)\])?\s*)?if\s+(.*?)\s+then$/i.exec(line))) {
      const sources = m[1] ? [token(m[1], true)] : last;
      const d = make(`if:${seq}`, 'UMLDecisionNode', unq(m[3]));
      for (const l of sources) ir.edges.push({ from: l.key, to: d.key, guard: (m[2] ?? '').trim() });
      ifs.push({ decision: d, ends: [] });
      last = [d];
      continue;
    }
    if (/^else$/i.test(line)) { const top = ifs[ifs.length - 1]; if (top) { top.ends.push(...last); last = [top.decision]; } continue; }
    if (/^end\s?if$/i.test(line)) { const top = ifs.pop(); if (top) last = [...top.ends, ...last]; continue; }
    if ((m = /^note\s+(?:left|right|top|bottom)?[^:]*:\s*(.*)$/i.exec(line))) { ir.notes.push({ text: nl(m[1]), targets: last[0] ? [last[0].key] : [] }); continue; }
    if ((m = LEGACY_LINK.exec(line))) {
      const sources = m[1] ? [token(m[1], true)] : last;
      const target = token(m[4], false);
      for (const s of sources) ir.edges.push({ from: s.key, to: target.key, guard: (m[3] ?? '').trim() });
      last = [target];
      continue;
    }
    if (new RegExp(String.raw`^${LEGACY_NODE}$`).test(line)) { last = [token(line, true)]; continue; }
    warn(line);
  }
  // A bar with several incoming flows is a join.
  for (const n of ir.nodes) if (n.type === 'UMLForkNode' && ir.edges.filter((e) => e.to === n.key).length > 1) n.type = 'UMLJoinNode';
  return ir;
}

const ACTIVITY_SIZE = { UMLInitialNode: { w: 30, h: 30 }, UMLActivityFinalNode: { w: 30, h: 30 }, UMLFlowFinalNode: { w: 30, h: 30 }, UMLDecisionNode: { w: 40, h: 40 }, UMLMergeNode: { w: 40, h: 40 }, UMLForkNode: { w: 80, h: 6 }, UMLJoinNode: { w: 80, h: 6 }, UMLInteractionUse: { w: 220, h: 60 } };
const ACTIVITY_EXPLICIT = new Set(['UMLForkNode', 'UMLJoinNode', 'UMLInteractionUse']);

/** Activity IR → { owner: UMLActivity, diagram, kind: 'activity' }. */
function buildActivity(ir, { language = 'en', name = '', direction = '' } = {}) {
  const add = adder(language);
  const title = name || 'Activity';
  const owner = createElement('UMLActivity', { name: title });
  const overview = ir.nodes.some((n) => n.type === 'UMLInteractionUse');
  const diagram = insertElement(owner, createElement(overview ? 'UMLInteractionOverviewDiagram' : 'UMLActivityDiagram', { name: title, ownedViews: [] }, { language }));
  const elements = new Map();
  for (const n of ir.nodes) elements.set(n.key, add(owner, n.type, { name: n.name ?? '', ...n.attrs }));
  const partitions = ir.partitions.map((p) => add(owner, 'UMLActivityPartition', { name: p }));
  const objecty = (el) => /ObjectNode|DataStoreNode|CentralBufferNode/.test(el._type);
  const flows = ir.edges.filter((e) => elements.has(e.from) && elements.has(e.to)).map((e) => {
    const a = elements.get(e.from);
    const b = elements.get(e.to);
    return add(owner, objecty(a) || objecty(b) ? 'UMLObjectFlow' : 'UMLControlFlow', { source: ref(a), target: ref(b), guard: e.guard ?? '' });
  });
  const sizeOf = (n) => ACTIVITY_SIZE[n.type] ?? { w: Math.min(260, Math.max(120, Math.max(...String(n.name ?? '').split('\n').map((s) => s.length)) * 7.5 + 30)), h: 40 + 16 * (String(n.name ?? '').split('\n').length - 1) };
  const placed = layered(ir.nodes.map((n) => ({ id: n.key, ...sizeOf(n) })), ir.edges.map((e) => [e.from, e.to]), { direction: direction === 'LR' && !partitions.length ? 'LR' : 'TB', gapX: 50, gapY: 50, wrap: 6 });
  const boxes = new Map();
  if (partitions.length) {
    // Lanes: columns in partition order; nodes keep their rows and are packed inside their lane.
    const laneOf = (n) => (n.partition ? ir.partitions.indexOf(n.partition) + 1 : 0);
    const rows = new Map();
    for (const n of ir.nodes) { const y = placed.get(n.key).y; const key = `${y}|${laneOf(n)}`; if (!rows.has(key)) rows.set(key, []); rows.get(key).push(n); }
    const laneWidth = new Array(ir.partitions.length + 1).fill(0);
    for (const [key, list] of rows) { const lane = Number(key.split('|')[1]); list.sort((a, b) => placed.get(a.key).x - placed.get(b.key).x); laneWidth[lane] = Math.max(laneWidth[lane], list.reduce((w, n) => w + sizeOf(n).w, 0) + 40 * (list.length - 1) + 60); }
    for (let i = 1; i < laneWidth.length; i += 1) laneWidth[i] = Math.max(laneWidth[i], 200);
    const laneX = [];
    let x = 40;
    for (let i = 0; i < laneWidth.length; i += 1) { laneX.push(x); x += laneWidth[i]; }
    for (const [key, list] of rows) {
      const lane = Number(key.split('|')[1]);
      const total = list.reduce((w, n) => w + sizeOf(n).w, 0) + 40 * (list.length - 1);
      let cx = laneX[lane] + (laneWidth[lane] - total) / 2;
      for (const n of list) { const s = sizeOf(n); boxes.set(n.key, { x: cx, y: 90 + placed.get(n.key).y, ...s }); cx += s.w + 40; }
    }
    const height = (placed.extent?.h ?? 0) + 110;
    partitions.forEach((p, i) => addView(diagram, createNodeView('UMLActivityPartitionView', p._id, { x: laneX[i + 1], y: 40, w: laneWidth[i + 1], h: height })));
  } else for (const n of ir.nodes) { const p = placed.get(n.key); boxes.set(n.key, { x: 40 + p.x, y: 40 + p.y, ...sizeOf(n) }); }
  const viewOf = new Map();
  for (const n of ir.nodes) {
    const el = elements.get(n.key);
    const b = boxes.get(n.key);
    const explicit = ACTIVITY_EXPLICIT.has(n.type);
    viewOf.set(n.key, addView(diagram, createNodeView(`${el._type}View`, el._id, { x: b.x, y: b.y, w: explicit ? b.w : 0, h: explicit ? b.h : 0 })));
  }
  for (const f of flows) {
    const a = viewOf.get([...elements].find(([, el]) => el._id === refId(f.source))?.[0]);
    const b = viewOf.get([...elements].find(([, el]) => el._id === refId(f.target))?.[0]);
    if (a && b) addView(diagram, createEdgeView(`${f._type}View`, f._id, a._id, b._id));
  }
  addNotes(diagram, ir.notes, (key) => viewOf.get(key), placed.extent);
  return { owner, diagram, kind: 'activity' };
}

// ───────────────────────── reading: state

const STATE_KIND = { choice: 'choice', fork: 'fork', join: 'join', end: 'final', start: 'initial', entrypoint: 'entryPoint', exitpoint: 'exitPoint', inputpin: 'entryPoint', outputpin: 'exitPoint', expansioninput: 'entryPoint', expansionoutput: 'exitPoint', history: 'shallowHistory', 'history*': 'deepHistory', terminate: 'terminate', junction: 'junction' };

function parseState(lines, warn) {
  const ir = { vertices: new Map(), scopes: new Map(), transitions: [], notes: [] };
  const scope = (state, region) => { const key = `${state ?? ''}|${region}`; if (!ir.scopes.has(key)) ir.scopes.set(key, { key, state, region }); return key; };
  const stack = [{ state: null, region: 0 }];
  const here = () => stack[stack.length - 1];
  const current = () => scope(here().state, here().region);
  scope(null, 0);
  const aliases = new Map();
  const vertex = (key, init) => { if (!ir.vertices.has(key)) ir.vertices.set(key, { key, type: 'UMLState', kind: '', name: key, scope: current(), entry: '', do: '', exit: '', doc: [], stereotype: '', implicit: true, ...init }); return ir.vertices.get(key); };
  const history = (kind, inScope) => vertex(`[${kind}]@${inScope}`, { type: 'UMLPseudostate', kind: kind === 'H*' ? 'deepHistory' : 'shallowHistory', name: '', scope: inScope, implicit: false });
  const lookup = (end) => {
    if (end.form === 'history') return history(end.text, current());
    let nm = end.text;
    const h = /^(.*)\[(H\*?)\]$/.exec(nm);
    let hist = null;
    if (h) { nm = h[1]; hist = h[2]; }
    const key = aliases.get(nm) ?? nm;
    const v = ir.vertices.get(key) ?? vertex(key, { name: nm });
    return hist ? history(hist, scope(v.key, 0)) : v;
  };
  const star = (asSource) => vertex(`[*]${asSource ? 'start' : 'end'}@${current()}`, { type: asSource ? 'UMLPseudostate' : 'UMLFinalState', kind: asSource ? 'initial' : '', name: '', implicit: false });
  const describe = (v, text) => {
    let m;
    if ((m = /^entry\s*\/\s*(.*)$/i.exec(text))) v.entry = m[1].trim();
    else if ((m = /^do\s*\/\s*(.*)$/i.exec(text))) v.do = m[1].trim();
    else if ((m = /^exit\s*\/\s*(.*)$/i.exec(text))) v.exit = m[1].trim();
    else v.doc.push(nl(text));
  };
  const noteKeys = new Map();
  for (const line of lines) {
    let m;
    if (line === '}') { if (stack.length > 1) stack.pop(); continue; }
    if (line === '--' || line === '||') { here().region += 1; scope(here().state, here().region); continue; }
    if (/^note\b/i.test(line)) {
      if ((m = /^note\s+"((?:[^"]|\\")*)"\s*(?:as\s+(\w+))?/i.exec(line))) { const n = { text: nl(m[1]), targets: [] }; ir.notes.push(n); if (m[2]) noteKeys.set(m[2], n); continue; }
      if ((m = /^note\s+as\s+(\w+)[^:]*:\s*(.*)$/i.exec(line))) { const n = { text: nl(m[2]), targets: [] }; ir.notes.push(n); noteKeys.set(m[1], n); continue; }
      if ((m = /^note\s+(?:left|right|top|bottom)?\s*(?:of\s+(.+?)|on\s+link)?\s*(?:#\S+)?\s*:\s*(.*)$/i.exec(line))) {
        const end = m[1] ? readEnd(m[1].trim(), 0) : null;
        ir.notes.push({ text: nl(m[2]), targets: end ? [lookup(end).key] : [] });
        continue;
      }
      warn(line);
      continue;
    }
    if ((m = /^state\s+(.+)$/i.exec(line))) {
      let s = m[1].trim();
      let desc = null;
      const colon = colonOutsideQuotes(s);
      if (colon >= 0) { desc = s.slice(colon + 1).trim(); s = s.slice(0, colon).trim(); }
      const open = /\{\s*$/.test(s);
      if (open) s = s.replace(/\{\s*$/, '').trim();
      const d = parseDecl(s);
      if (!d) { warn(line); continue; }
      const { key, label } = declNames(d);
      const existingKey = aliases.get(key) ?? key;
      let v = ir.vertices.get(existingKey);
      if (v && v.implicit) v.scope = current();
      if (!v) v = vertex(existingKey, {});
      v.implicit = false;
      v.name = label;
      aliases.set(key, v.key);
      if (label !== key) aliases.set(label, v.key);
      for (const st of d.stereotypes) {
        const kind = STATE_KIND[st.toLowerCase()];
        if (kind === 'final') v.type = 'UMLFinalState';
        else if (kind) { v.type = 'UMLPseudostate'; v.kind = kind; } else if (st.toLowerCase() !== 'sdlreceive') v.stereotype = st;
      }
      if (desc) describe(v, desc);
      if (open) { stack.push({ state: v.key, region: 0 }); scope(v.key, 0); }
      continue;
    }
    const rel = parseRelation(line);
    if (rel) {
      const reversed = /^</.test(rel.arrow.left) && !rel.arrow.right;
      const [x, y] = reversed ? [rel.b, rel.a] : [rel.a, rel.b];
      if (noteKeys.has(x.text) || noteKeys.has(y.text)) { const n = noteKeys.get(x.text) ?? noteKeys.get(y.text); n.targets.push(lookup(noteKeys.has(x.text) ? y : x).key); continue; }
      const from = x.form === 'star' ? star(true) : lookup(x);
      const to = y.form === 'star' ? star(false) : lookup(y);
      ir.transitions.push({ from: from.key, to: to.key, label: rel.label, scope: current() });
      continue;
    }
    if ((m = /^(.+?)\s*:\s*(.*)$/.exec(line))) {
      const end = readEnd(m[1], 0);
      if (end && end.end === m[1].length) { describe(lookup(end), m[2]); continue; }
    }
    const end = readEnd(line, 0);
    if (end && end.end === line.length && end.form === 'name') { lookup(end).implicit = false; continue; }
    warn(line);
  }
  return ir;
}

const PSEUDO_SIZE = { initial: { w: 20, h: 20 }, choice: { w: 26, h: 26 }, junction: { w: 14, h: 14 }, fork: { w: 80, h: 6 }, join: { w: 80, h: 6 }, deepHistory: { w: 26, h: 26 }, shallowHistory: { w: 26, h: 26 }, entryPoint: { w: 20, h: 20 }, exitPoint: { w: 20, h: 20 }, terminate: { w: 20, h: 20 } };

/** State IR → { owner: UMLStateMachine, diagram, kind: 'state' }. */
function buildState(ir, { language = 'en', name = '', direction = '' } = {}) {
  const title = name || 'StateMachine';
  const owner = createElement('UMLStateMachine', { name: title });
  const diagram = insertElement(owner, createElement('UMLStatechartDiagram', { name: title, ownedViews: [] }, { language }));
  const regionOf = (container, index) => {
    container.regions ??= [];
    while (container.regions.length <= index) insertElement(container, createElement('UMLRegion', { name: '' }, { language }));
    return container.regions[index];
  };
  const elements = new Map();
  const visiting = new Set();
  const create = (v) => {
    if (elements.has(v.key)) return elements.get(v.key);
    if (visiting.has(v.key)) return null;
    visiting.add(v.key);
    const sc = ir.scopes.get(v.scope) ?? { state: null, region: 0 };
    const holder = sc.state && ir.vertices.has(sc.state) && sc.state !== v.key ? create(ir.vertices.get(sc.state)) ?? owner : owner;
    const region = regionOf(holder, sc.region);
    const attrs = v.type === 'UMLState'
      ? { name: v.name, ...(v.entry ? { entryActivity: v.entry } : {}), ...(v.do ? { doActivity: v.do } : {}), ...(v.exit ? { exitActivity: v.exit } : {}), ...(v.doc.length ? { documentation: v.doc.join('\n') } : {}), ...(v.stereotype ? { stereotype: v.stereotype } : {}) }
      : v.type === 'UMLPseudostate' ? { kind: v.kind, name: v.name } : { name: v.name };
    const el = insertElement(region, createElement(v.type, attrs, { language, siblings: region.vertices ?? [] }));
    elements.set(v.key, el);
    return el;
  };
  for (const v of ir.vertices.values()) create(v);
  const transitions = [];
  for (const t of ir.transitions) {
    const a = elements.get(t.from);
    const b = elements.get(t.to);
    if (!a || !b) continue;
    const sc = ir.scopes.get(t.scope) ?? { state: null, region: 0 };
    const holder = sc.state ? elements.get(sc.state) ?? owner : owner;
    const region = regionOf(holder, sc.region);
    transitions.push({ el: insertElement(region, createElement('UMLTransition', { name: '', source: ref(a), target: ref(b), ...parseTransitionLabel(nl(t.label)) }, { language })), t });
  }
  // Layout: composite states hold their regions; a state with several regions holds one invisible box per region.
  const regionCount = new Map();
  for (const sc of ir.scopes.values()) regionCount.set(sc.state ?? '', Math.max(regionCount.get(sc.state ?? '') ?? 0, sc.region + 1));
  const items = [];
  for (const sc of ir.scopes.values()) if ((regionCount.get(sc.state ?? '') ?? 1) > 1 && [...ir.vertices.values()].some((v) => v.scope === sc.key)) items.push({ id: `scope:${sc.key}`, w: 40, h: 40, parent: sc.state ?? null, pad: 12, head: 8, virtual: true });
  const parentOf = (v) => { const sc = ir.scopes.get(v.scope); if (!sc) return null; if ((regionCount.get(sc.state ?? '') ?? 1) > 1) return `scope:${sc.key}`; return sc.state ?? null; };
  const sizeOf = (v) => (v.type === 'UMLPseudostate' ? PSEUDO_SIZE[v.kind] ?? { w: 20, h: 20 } : v.type === 'UMLFinalState' ? { w: 24, h: 24 } : { w: Math.max(110, String(v.name).length * 8 + 40), h: 44 + 16 * [v.entry, v.do, v.exit].filter(Boolean).length });
  for (const v of ir.vertices.values()) items.push({ id: v.key, ...sizeOf(v), parent: parentOf(v) });
  const boxes = nestedLayout(items, ir.transitions.map((t) => [t.from, t.to]), { direction: direction || 'TB', gapX: 60, gapY: 60, wrap: 5, pad: 20, head: 44 });
  const composite = new Set(items.map((i) => i.parent).filter(Boolean));
  const viewOf = new Map();
  for (const v of [...ir.vertices.values()].sort((a, b) => boxes.depthOf(a.key) - boxes.depthOf(b.key))) {
    const el = elements.get(v.key);
    const b = boxes.get(v.key);
    if (!el || !b) continue;
    const explicit = composite.has(v.key) || v.type !== 'UMLState';
    viewOf.set(v.key, addView(diagram, createNodeView(`${el._type}View`, el._id, { x: b.x, y: b.y, w: explicit ? b.w : 0, h: explicit ? b.h : 0 })));
  }
  for (const { el, t } of transitions) {
    const a = viewOf.get(t.from);
    const b = viewOf.get(t.to);
    if (a && b) addView(diagram, createEdgeView('UMLTransitionView', el._id, a._id, b._id));
  }
  addNotes(diagram, ir.notes, (key) => viewOf.get(key), boxes.extent);
  return { owner, diagram, kind: 'state' };
}

// ───────────────────────── reading: ER (IE notation)

const IE_CARD = { '|o': '0..1', 'o|': '0..1', '||': '1', '}o': '0..*', 'o{': '0..*', '}|': '1..*', '|{': '1..*' };
const ER_LINK = /^("[^"]+"|[\w.À-￿]+)\s*(\|o|\|\||\}o|\}\||o\||\|\{|o\{)?([-.](?:[-.]|\[[^\]]*\]|(?:up|down|left|right|[udlr])(?=[-.]))*)(o\||\|\||o\{|\|\{|\|o|\}o|\}\|)?\s*("[^"]+"|[\w.À-￿]+)\s*(?::\s*(.*))?$/;

function parseEr(lines, warn) {
  const ir = { entities: new Map(), relations: [] };
  const aliases = new Map();
  const entity = (raw) => { const key = aliases.get(unq(raw)) ?? unq(raw); if (!ir.entities.has(key)) ir.entities.set(key, { key, name: unq(raw), columns: [], separator: false, stereotype: '' }); return ir.entities.get(key); };
  let open = null;
  for (const line of lines) {
    let m;
    if (open) {
      if (line.startsWith('}')) {
        if (open.separator && !open.columns.some((c) => c.explicitPk)) for (const c of open.columns) if (c.above) c.primaryKey = true;
        open = null;
        continue;
      }
      if (/^(--|==|\.\.|__)/.test(line)) { open.separator = true; continue; }
      let text = line;
      const markers = [];
      text = text.replace(/<<\s*([^>]*?)\s*>>/g, (x, k) => { markers.push(k.toLowerCase()); return ''; }).replace(/\{\s*(PK|FK|UK|unique)\s*\}/gi, (x, k) => { markers.push(k.toLowerCase()); return ''; }).trim();
      const mandatory = text.startsWith('*');
      text = text.replace(/^\*\s*/, '').replace(/^[-+#~]\s*/, '');
      const cm = /^(.+?)\s*(?::\s*(.*))?$/.exec(text);
      if (!cm || !cm[1]) continue;
      let type = (cm[2] ?? '').trim();
      let length = '';
      const lm = /^(.*?)\s*\(\s*([^)]*)\s*\)$/.exec(type);
      if (lm) { type = lm[1]; length = lm[2]; }
      const pk = markers.some((k) => k === 'pk' || k === 'primary key' || k === 'id');
      open.columns.push({ name: cm[1].trim(), type, length, primaryKey: pk, explicitPk: pk, foreignKey: markers.some((k) => k === 'fk' || k === 'foreign key'), unique: markers.some((k) => k === 'uk' || k === 'unique'), nullable: !mandatory, above: !open.separator });
      continue;
    }
    if ((m = /^entity\s+(.+)$/i.exec(line))) {
      const d = parseDecl(m[1]);
      if (!d) { warn(line); continue; }
      const { key, label } = declNames(d);
      const e = entity(key);
      e.name = label;
      if (d.alias) aliases.set(d.alias, e.key);
      if (d.stereotypes.length) e.stereotype = d.stereotypes.join(', ');
      if (d.brace) open = e;
      continue;
    }
    if ((m = ER_LINK.exec(line))) {
      ir.relations.push({ from: entity(m[1]).key, to: entity(m[5]).key, fromCard: IE_CARD[m[2]] ?? '1', toCard: IE_CARD[m[4]] ?? '1', identifying: !m[3].replace(/\[[^\]]*\]/g, '').includes('.'), name: nl(unq(m[6] ?? '')) });
      continue;
    }
    warn(line);
  }
  return ir;
}

function buildEr(ir, { language = 'en', name = '', direction = '' } = {}) {
  const add = adder(language);
  const title = name || 'Data Model';
  const owner = createElement('ERDDataModel', { name: title });
  const entities = new Map();
  for (const e of ir.entities.values()) {
    const entity = add(owner, 'ERDEntity', { name: e.name, ...(e.stereotype ? { stereotype: e.stereotype } : {}) });
    for (const c of e.columns) add(entity, 'ERDColumn', { name: c.name, type: c.type, length: c.length, primaryKey: c.primaryKey, foreignKey: c.foreignKey, unique: c.unique, nullable: c.nullable });
    entities.set(e.key, entity);
  }
  const relations = ir.relations.map((r) => add(owner, 'ERDRelationship', { name: r.name, identifying: r.identifying, end1: { reference: ref(entities.get(r.from)), cardinality: r.fromCard }, end2: { reference: ref(entities.get(r.to)), cardinality: r.toCard } }));
  for (const entity of entities.values()) {
    const related = relations.flatMap((r) => { const [x, y] = [refId(r.end1.reference), refId(r.end2.reference)]; return x === entity._id ? [y] : y === entity._id ? [x] : []; }).map((id) => [...entities.values()].find((e) => e._id === id)).filter(Boolean);
    for (const column of entity.columns ?? []) {
      if (!column.foreignKey || column.referenceTo) continue;
      const candidates = related.flatMap((e) => (e.columns ?? []).filter((c) => c.primaryKey).map((c) => ({ e, c })));
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const hit = candidates.find(({ e, c }) => norm(column.name) === norm(c.name) || norm(column.name) === norm(`${e.name}${c.name}`)) ?? (candidates.length === 1 ? candidates[0] : null);
      if (hit) column.referenceTo = ref(hit.c);
    }
  }
  const diagram = insertElement(owner, createElement('ERDDiagram', { name: title, ownedViews: [] }, { language }));
  const nodes = [...entities.values()].map((e) => ({ id: e._id, w: Math.max(140, String(e.name).length * 8 + 40, ...(e.columns ?? []).map((c) => (c.name.length + String(c.type).length) * 7 + 60)), h: 40 + 20 * (e.columns?.length ?? 0) }));
  const placed = layered(nodes, relations.map((r) => [refId(r.end1.reference), refId(r.end2.reference)]), { direction: direction || 'TB', gapX: 90, gapY: 90, wrap: 4 });
  const viewOf = new Map();
  for (const e of entities.values()) { const p = placed.get(e._id); viewOf.set(e._id, addView(diagram, createNodeView('ERDEntityView', e._id, { x: 40 + p.x, y: 40 + p.y, w: 0, h: 0 }))); }
  for (const r of relations) addView(diagram, createEdgeView('ERDRelationshipView', r._id, viewOf.get(refId(r.end1.reference))._id, viewOf.get(refId(r.end2.reference))._id));
  return { owner, diagram, kind: 'er' };
}

// ───────────────────────── reading: timing

function parseTiming(lines, warn) {
  const ir = { lifelines: [], changes: [], messages: [], constraints: [], highlights: [], notes: [], times: new Set() };
  const byId = new Map();
  const anchors = new Map();
  let now = 0;
  let focus = null;
  const timeOf = (text, base = now) => {
    const t = String(text ?? '').trim();
    let m;
    if ((m = /^([+-])\s*(\d+(?:\.\d+)?)$/.exec(t))) return base + (m[1] === '-' ? -1 : 1) * Number(m[2]);
    if ((m = /^:(\w+)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/.exec(t))) return (anchors.get(m[1]) ?? 0) + (m[2] ? (m[2] === '-' ? -1 : 1) * Number(m[3]) : 0);
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return null;
  };
  for (const line of lines) {
    let m;
    if ((m = /^(robust|concise|clock|binary|analog|rectangle)\s+(?!(?:is|has)\s|-)(.+)$/i.exec(line))) {
      const d = parseDecl(m[2]);
      if (!d) { warn(line); continue; }
      const { key, label } = declNames(d);
      const kind = m[1].toLowerCase();
      const l = { id: key, name: label, kind, states: [], labels: new Map() };
      if (kind === 'clock') { const pm = /period\s+(\d+(?:\.\d+)?)(?:\s+pulse\s+(\d+(?:\.\d+)?))?(?:\s+offset\s+(\d+(?:\.\d+)?))?/i.exec(d.rest); l.period = pm ? Number(pm[1]) : 10; l.pulse = pm?.[2] ? Number(pm[2]) : l.period / 2; l.offset = pm?.[3] ? Number(pm[3]) : 0; l.states = ['high', 'low']; }
      if (kind === 'binary') l.states = ['high', 'low'];
      ir.lifelines.push(l);
      byId.set(key, l);
      continue;
    }
    if ((m = /^(\S+)\s+has\s+(.+)$/i.exec(line)) && byId.has(m[1])) {
      const l = byId.get(m[1]);
      for (const part of m[2].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        const pm = /^\s*("[^"]*"|[^\s,]+)(?:\s+as\s+(\S+))?\s*$/.exec(part);
        if (!pm) continue;
        const label = unq(pm[1]);
        if (!l.states.includes(label)) l.states.push(label);
        if (pm[2]) l.labels.set(pm[2], label);
      }
      continue;
    }
    if ((m = /^@\s*(.+?)(?:\s+as\s+:(\w+))?$/.exec(line))) {
      const v = m[1].trim();
      if (byId.has(v)) { focus = byId.get(v); continue; }
      const t = timeOf(v);
      if (t === null) { warn(line); continue; }
      now = t;
      focus = null;
      ir.times.add(now);
      if (m[2]) anchors.set(m[2], now);
      continue;
    }
    if (focus && (m = /^([+-]?\s*\d+(?:\.\d+)?|:\w+(?:\s*[+-]\s*\d+(?:\.\d+)?)?)\s+is\s+(.+?)\s*(?::.*)?$/.exec(line))) {
      const t = /^[+-]/.test(m[1]) ? timeOf(m[1], now) : timeOf(m[1]);
      if (t === null) { warn(line); continue; }
      now = t;
      ir.times.add(t);
      ir.changes.push({ id: focus.id, time: t, state: m[2] });
      continue;
    }
    if ((m = /^(\S+?)(?:@(\S+))?\s+is\s+(.+?)\s*(?::.*)?$/.exec(line)) && byId.has(m[1])) {
      const t = m[2] ? timeOf(m[2]) : now;
      if (t === null) { warn(line); continue; }
      ir.times.add(t);
      ir.changes.push({ id: m[1], time: t, state: m[3] });
      continue;
    }
    if ((m = /^(\w+)?@(\S+)\s*<->\s*@(\S+)\s*(?::\s*(.*))?$/.exec(line))) {
      const a = timeOf(m[2]);
      const b = timeOf(m[3]);
      if (a === null || b === null) { warn(line); continue; }
      ir.constraints.push({ id: m[1] ?? null, from: a, to: b, text: (m[4] ?? '').trim() });
      continue;
    }
    if ((m = /^(\w+)(?:@(\S+))?\s*-+>\s*(\w+)(?:@(\S+))?\s*(?::\s*(.*))?$/.exec(line)) && byId.has(m[1]) && byId.has(m[3])) {
      const a = m[2] ? timeOf(m[2]) : now;
      const b = m[4] ? timeOf(m[4]) : a;
      ir.messages.push({ from: m[1], to: m[3], at: a ?? now, toAt: b ?? a ?? now, text: (m[5] ?? '').trim() });
      continue;
    }
    if ((m = /^highlight\s+(\S+)\s+to\s+(\S+)(?:\s+#\S+)?\s*(?::\s*(.*))?$/i.exec(line))) {
      const a = timeOf(m[1]);
      const b = timeOf(m[2]);
      if (a === null || b === null) { warn(line); continue; }
      ir.highlights.push({ from: a, to: b, text: (m[3] ?? '').trim() });
      continue;
    }
    if ((m = /^note\s+(?:top|bottom)\s+of\s+(\w+)\s*:\s*(.*)$/i.exec(line))) { ir.notes.push({ id: m[1], text: nl(m[2]) }); continue; }
    if (/^(scale|hide|mode|manual|use)\b/i.test(line)) continue;
    warn(line);
  }
  return ir;
}

/** "label {spec}" → { name, specification }. */
const splitConstraint = (text) => { const m = /^(.*?)\s*\{(.*)\}\s*$/.exec(String(text ?? '')); return m ? { name: m[1].trim(), specification: m[2].trim() } : { name: '', specification: String(text ?? '').trim() }; };

function buildTiming(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const title = name || 'Timing';
  const owner = createElement('UMLCollaboration', { name: title });
  const interaction = add(owner, 'UMLInteraction', { name: title });
  const diagram = insertElement(interaction, createElement('UMLTimingDiagram', { name: title, ownedViews: [] }, { language }));
  const times = [...new Set([...ir.times, ...ir.changes.map((c) => c.time), ...ir.messages.map((m) => m.at), ...ir.constraints.flatMap((c) => [c.from, c.to]), ...ir.highlights.flatMap((h) => [h.from, h.to])])].sort((a, b) => a - b);
  const start = times.length ? Math.min(0, times[0]) : 0;
  const gaps = times.slice(1).map((t, i) => t - times[i]).filter((g) => g > 0);
  const step = gaps.length ? Math.min(...gaps) : 10;
  let end = times.length ? times[times.length - 1] : 10;
  const lastChange = Math.max(start, ...ir.changes.map((c) => c.time));
  if (lastChange >= end) end = lastChange + step;
  if (end <= start) end = start + 10;
  const lifelines = new Map();
  const W = 760;
  const measure = (l) => Math.min(120, Math.max(60, String(l.name).length * 8 + 16)) + Math.max(40, ...l.states.map((s) => s.length * 7 + 12));
  for (const l of ir.lifelines) {
    const changes = ir.changes.filter((c) => c.id === l.id).sort((a, b) => a.time - b.time);
    for (const c of changes) { c.state = l.labels.get(c.state.trim()) ?? unq(c.state).replace(/^\{-?\}$/, '').replace(/^\{(.*)\}$/, '$1'); if (c.state && !l.states.includes(c.state)) l.states.push(c.state); }
    if (l.kind === 'clock') {
      changes.length = 0;
      for (let t = start + l.offset; t < end && changes.length < 400; t += l.period) { changes.push({ time: t, state: 'high' }); if (t + l.pulse < end) changes.push({ time: t + l.pulse, state: 'low' }); }
    }
    const segments = [];
    if (changes.length && changes[0].time > start) segments.push({ state: l.states[0] ?? '', duration: changes[0].time - start });
    changes.forEach((c, i) => { const next = i + 1 < changes.length ? changes[i + 1].time : end; if (next > c.time) segments.push({ state: c.state, duration: next - c.time }); });
    const attribute = add(owner, 'UMLAttribute', { name: l.name, type: '' });
    const lifeline = add(interaction, 'UMLTimingLifeline', { name: l.name, represent: ref(attribute), states: (l.states.length ? l.states : ['Idle', 'Busy']).join(',') });
    for (const s of segments) add(lifeline, 'UMLTimeSegment', { state: s.state, duration: Math.round(s.duration * 1000) / 1000 });
    lifelines.set(l.id, { l, el: lifeline });
  }
  // Views: lifelines stacked, their time axes lined up (x0 … x0 + span), ticks under them.
  const widest = Math.max(180, ...ir.lifelines.map(measure));
  const x0 = 40 + widest + 6;
  const span = W - widest - 12;
  const at = (t) => Math.round(x0 + (span * (t - start)) / ((end - start) || 1));
  let y = 70;
  const viewOf = new Map();
  for (const { l, el } of lifelines.values()) {
    const shift = widest - measure(l);
    const h = Math.max(110, 40 * Math.max(2, l.states.length) + 20);
    viewOf.set(l.id, addView(diagram, createNodeView('UMLTimingLifelineView', el._id, { x: 40 + shift, y, w: W - shift, h })));
    y += h + 50;
  }
  for (const t of times.length ? [...new Set([...times, end])] : []) {
    const tick = add(interaction, 'UMLTimeTick', { name: fmtTime(t) });
    addView(diagram, createNodeView('UMLTimeTickView', tick._id, { x: at(t) - 5, y, w: 0, h: 0 }));
  }
  const stateY = (id, time) => { const v = viewOf.get(id); return v ? Number(v.top) + Number(v.height) / 2 : y; };
  for (const m of ir.messages) {
    const a = lifelines.get(m.from);
    const b = lifelines.get(m.to);
    if (!a || !b) continue;
    const message = add(interaction, 'UMLMessage', { name: m.text, source: ref(a.el), target: ref(b.el), messageSort: 'synchCall' });
    addView(diagram, createEdgeView('UMLMessageView', message._id, viewOf.get(m.from)._id, viewOf.get(m.to)._id, { points: [{ x: at(m.at), y: stateY(m.from, m.at) }, { x: at(m.toAt), y: stateY(m.to, m.toAt) }], lineStyle: 'oblique' }));
  }
  for (const c of ir.constraints) {
    const el = add(interaction, 'UMLDurationConstraint', splitConstraint(c.text));
    addView(diagram, createNodeView('UMLDurationConstraintView', el._id, { x: at(c.from) + 20, y: 14, w: 0, h: 0 }));
  }
  for (const h of ir.highlights) {
    const el = add(interaction, h.from === h.to ? 'UMLTimeConstraint' : 'UMLDurationConstraint', splitConstraint(h.text));
    addView(diagram, createNodeView(`${el._type}View`, el._id, { x: at(h.from) + 10, y: 14, w: 0, h: 0 }));
  }
  for (const n of ir.notes) {
    const v = viewOf.get(n.id);
    addView(diagram, createNodeView('UMLNoteView', null, { x: v ? Number(v.left) + Number(v.width) + 20 : 40, y: v ? Number(v.top) : y + 40, w: 160, h: 50 }, { text: n.text }));
  }
  return { owner, diagram, kind: 'timing' };
}

// ───────────────────────── reading: mind map

function parseMindmap(raw, warn) {
  const ir = { roots: [] };
  const stack = [];
  let side = 'auto';
  let buffer = null;
  const addNode = (depth, name, dir) => {
    const node = { name, children: [], direction: dir };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (!stack.length || depth === 1) { ir.roots.push(node); stack.length = 0; } else stack[stack.length - 1].node.children.push(node);
    stack.push({ depth, node });
  };
  for (const original of raw) {
    const line = original.trim();
    if (buffer) {
      buffer.lines.push(original.replace(/;\s*$/, ''));
      if (/;\s*$/.test(line)) { addNode(buffer.depth, buffer.lines.join('\n').trim(), buffer.dir); buffer = null; }
      continue;
    }
    if (/^left\s+side$/i.test(line)) { side = 'left'; continue; }
    if (/^right\s+side$/i.test(line)) { side = 'right'; continue; }
    let m;
    if ((m = /^([*+-]+)(?:\[[^\]]*\])?(_)?\s*(.*)$/.exec(line)) && /^(\*+|\++|-+)$/.test(m[1]) && (m[3] || m[2] !== undefined) && !/^\s+\*/.test(original)) {
      const depth = m[1].length;
      const dir = m[1][0] === '-' ? 'left' : m[1][0] === '+' ? 'right' : depth > 1 ? side : 'auto';
      let text = m[3].trim();
      if (text.startsWith(':')) {
        if (/;\s*$/.test(text)) text = text.slice(1).replace(/;\s*$/, '');
        else { buffer = { depth, dir, lines: [text.slice(1)] }; continue; }
      }
      addNode(depth, text.replace(/<<[^>]*>>\s*$/, '').trim(), dir);
      continue;
    }
    if ((m = /^(\s*)[*-]\s+(.*)$/.exec(original))) {
      addNode(Math.floor(m[1].replace(/\t/g, '  ').length / 2) + 1, m[2].trim(), side);
      continue;
    }
    warn(line);
  }
  return ir;
}

function buildMindmap(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const title = name || 'Mind Map';
  const owner = createElement('MMMindmap', { name: title });
  const diagram = insertElement(owner, createElement('MMMindmapDiagram', { name: title, ownedViews: [] }, { language }));
  const ROW = 50;
  const COL = 210;
  const leaves = (n) => (n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1);
  let top = 40;
  for (const root of ir.roots) {
    const right = root.children.filter((c) => c.direction !== 'left');
    const left = root.children.filter((c) => c.direction === 'left');
    const height = Math.max(leaves({ children: right }), leaves({ children: left }), 1) * ROW;
    const leftDepth = (n) => (n.children.length ? 1 + Math.max(...n.children.map(leftDepth)) : 0);
    const rootX = 40 + (left.length ? Math.max(...left.map(leftDepth)) + 1 : 0) * COL;
    const rootEl = add(owner, 'MMNode', { name: root.name });
    const rootView = addView(diagram, createNodeView('MMNodeView', rootEl._id, { x: rootX, y: top + height / 2 - 15, w: 0, h: 0 }));
    const place = (n, parentEl, parentView, depth, y0, dir) => {
      const el = add(parentEl, 'MMNode', { name: n.name, ...(depth === 1 && n.direction !== 'auto' ? { direction: dir } : {}) });
      const h = leaves(n) * ROW;
      const view = addView(diagram, createNodeView('MMNodeView', el._id, { x: rootX + (dir === 'left' ? -1 : 1) * depth * COL, y: y0 + h / 2 - 15, w: 0, h: 0 }));
      addView(diagram, createEdgeView('MMEdgeView', null, parentView._id, view._id));
      let y = y0;
      for (const c of n.children) { place(c, el, view, depth + 1, y, dir); y += leaves(c) * ROW; }
    };
    for (const [list, dir] of [[right, 'right'], [left, 'left']]) {
      let y = top + (height - leaves({ children: list }) * ROW) / 2;
      for (const c of list) { place(c, rootEl, rootView, 1, y, dir); y += leaves(c) * ROW; }
    }
    top += height + 60;
  }
  return { owner, diagram, kind: 'mindmap' };
}

// ───────────────────────── reading: entry point

/**
 * Reads PlantUML text. Returns { owner, diagram, kind, warnings } like importMermaid
 * (owner not in a project yet; warnings: [{ code, detail }] for lines that were skipped).
 * kind: class | object | package | profile | usecase | component | deployment | composite |
 * infoflow | sequence | activity | state | er | timing | mindmap (or what plantuml-more.js says).
 * Throws 'interop.empty' for empty text, 'interop.unsupportedPlantUml' (detail: the
 * first line or @start… marker) when the diagram kind is not known.
 */
export function importPlantUml(text, { language = 'en', name = '' } = {}) {
  const pre = preprocessPlantUml(text);
  const more = importPlantUmlMore(text, { language, name, block: { kind: pre.kind, lines: pre.lines, raw: pre.raw, title: pre.title } });
  if (more) return { warnings: [], ...more };
  if (pre.kind !== 'uml' && pre.kind !== 'mindmap') throw fail('interop.unsupportedPlantUml', `@start${pre.kind}`);
  if (!pre.lines.length) throw fail('interop.empty', '');
  const warnings = [...pre.warnings];
  const warn = (detail, code = 'plantuml.ignored') => warnings.push({ code, detail: String(detail) });
  const opts = { language, name: pre.title || name, direction: pre.direction };
  let result;
  if (pre.kind === 'mindmap') result = buildMindmap(parseMindmap(pre.raw, warn), opts);
  else {
    const kind = detectUml(pre.lines);
    const structure = (ctx) => parseStructure(pre.lines, ctx, { warn, separator: pre.separator });
    switch (kind) {
      case 'timing': result = buildTiming(parseTiming(pre.lines, warn), opts); break;
      case 'activity': result = buildActivity(parseActivity(pre.lines, warn), opts); break;
      case 'activityLegacy': result = buildActivity(parseLegacyActivity(pre.lines, warn), opts); break;
      case 'state': result = buildState(parseState(pre.lines, warn), opts); break;
      case 'er': result = buildEr(parseEr(pre.lines, warn), opts); break;
      case 'sequence': result = buildSequence(parseSequence(pre.lines, warn), opts); break;
      case 'class': case 'object': {
        const ir = structure(kind);
        const [type, k] = kind === 'object' ? ['UMLObjectDiagram', 'object'] : classDiagramType(ir);
        result = buildStructure(ir, type, k, opts);
        break;
      }
      case 'usecase': result = buildStructure(structure('usecase'), 'UMLUseCaseDiagram', 'usecase', opts); break;
      case 'component': case 'deployment': {
        const ir = structure(kind);
        const types = [...ir.nodes.values()].map((n) => n.type);
        let [type, k] = kind === 'deployment' ? ['UMLDeploymentDiagram', 'deployment'] : ['UMLComponentDiagram', 'component'];
        if (types.includes('UMLPart')) [type, k] = ['UMLCompositeStructureDiagram', 'composite'];
        else if (ir.relations.some((r) => r.type === 'UMLInformationFlow')) [type, k] = ['UMLInformationFlowDiagram', 'infoflow'];
        result = buildStructure(ir, type, k, opts);
        break;
      }
      default: throw fail('interop.unsupportedPlantUml', pre.lines[0]);
    }
  }
  result.warnings = warnings;
  return result;
}

// PlantUML text ↔ model. Writing covers class, use case, sequence, activity,
// state, component, deployment and ER diagrams (@startuml … @enduml; activity
// in the classic arrow syntax, ER in the IE "entity" notation). Reading covers
// class and sequence diagrams and returns the same shape as importMermaid:
// { owner, diagram, kind } with the owner not yet in a project.
// Uses the intermediate forms, layout and diagram readers of mermaid.js.
// Pure (no DOM).
import { typeDef } from '../meta.js';
import { refId } from '../model.js';
import {
  buildClassModel, buildSequenceModel, cleanLines, diagramContent, fail, idMaker, lifelineIsActor, parseMember,
  sequenceTree, stateScopes, transitionLabel, typeText, visibilityChar,
} from './mermaid.js';

const q = (text) => `"${String(text ?? '').replace(/"/g, "'").replace(/\r?\n/g, '\\n')}"`;
const RESERVED = ['end', 'class', 'interface', 'enum', 'abstract', 'actor', 'participant', 'state', 'note', 'as', 'package', 'node', 'component', 'usecase', 'entity', 'alt', 'else', 'loop', 'opt', 'par', 'group', 'if', 'then', 'endif'];
const wrap = (lines, title) => `@startuml\n${title ? `title ${title}\n` : ''}${lines.join('\n')}\n@enduml\n`;
const box = (v) => ({ x: Number(v.left ?? 0), y: Number(v.top ?? 0), w: Number(v.width ?? 0), h: Number(v.height ?? 0) });
const inside = (a, b) => b.w > 0 && b.h > 0 && a.x >= b.x && a.y >= b.y && a.x + Math.max(a.w, 1) <= b.x + b.w && a.y + Math.max(a.h, 1) <= b.y + b.h;
const stereo = (element) => (typeof element.stereotype === 'string' && element.stereotype ? ` <<${element.stereotype}>>` : '');

// ───────────────────────── writing

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
  return out;
}

/** Relationship line between two ids (generic for structure diagrams). */
function relationLine(element, a, b) {
  const label = element.name ? ` : ${element.name}` : '';
  const type = element._type;
  if (type === 'UMLGeneralization') return `${b} <|-- ${a}${label}`;
  if (/Realization$/.test(type)) return `${b} <|.. ${a}${label}`;
  if (type === 'UMLInclude') return `${a} ..> ${b} : <<include>>`;
  if (type === 'UMLExtend') return `${a} ..> ${b} : <<extend>>`;
  const keyword = typeDef(type)?.keyword;
  if (typeDef(type)?.ends === 'directed') return `${a} ..> ${b}${label || (keyword ? ` : <<${keyword}>>` : '')}`;
  if (typeDef(type)?.ends === 'association') {
    const e1 = element.end1 ?? {};
    const e2 = element.end2 ?? {};
    const lh = e1.aggregation === 'composite' ? '*' : e1.aggregation === 'shared' ? 'o' : e1.navigable === 'navigable' ? '<' : '';
    const rh = e2.aggregation === 'composite' ? '*' : e2.aggregation === 'shared' ? 'o' : e2.navigable === 'navigable' ? '>' : '';
    const lm = e1.multiplicity ? `${q(e1.multiplicity)} ` : '';
    const rm = e2.multiplicity ? ` ${q(e2.multiplicity)}` : '';
    return `${a} ${lm}${lh}--${rh}${rm} ${b}${label}`;
  }
  return `${a} -- ${b}${label}`;
}

/** Edges of a structure diagram: association ends follow end1/end2, directed ones tail → head. */
function edgeLines(edges, id) {
  const out = [];
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head) continue;
    let [x, y] = [tail, head];
    if (typeDef(element._type)?.ends === 'association' && refId(element.end1?.reference) === head._id) [x, y] = [head, tail];
    out.push(relationLine(element, id(x._id, x.name), id(y._id, y.name)));
  }
  return out;
}

function classKeyword(element) {
  switch (element._type) {
    case 'UMLInterface': return 'interface';
    case 'UMLEnumeration': return 'enum';
    case 'UMLPackage': case 'UMLModel': case 'UMLSubsystem': return 'package';
    case 'UMLObject': return 'object';
    case 'UMLActor': return 'actor';
    case 'UMLUseCase': return 'usecase';
    case 'UMLComponent': return 'component';
    case 'UMLNode': return 'node';
    case 'UMLArtifact': return 'artifact';
    default: return element.isAbstract ? 'abstract class' : 'class';
  }
}

function plantClass(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  for (const { element } of nodes) {
    if (!element.name && element._type !== 'UMLClass') continue;
    const name = id(element._id, element.name);
    const keyword = classKeyword(element);
    const alias = name !== element.name ? `${q(element.name)} as ${name}` : name;
    if (keyword === 'package' || keyword === 'actor' || keyword === 'usecase' || keyword === 'node' || keyword === 'artifact' || keyword === 'component') { out.push(`${keyword} ${alias}${stereo(element)}`); continue; }
    const extra = !['UMLClass', 'UMLInterface', 'UMLEnumeration'].includes(element._type) && typeDef(element._type)?.keyword ? ` <<${typeDef(element._type).keyword}>>` : '';
    const members = memberLines(element, index);
    out.push(`${keyword} ${alias}${stereo(element)}${extra}${members.length ? ' {' : ''}`);
    if (members.length) { for (const line of members) out.push(`  ${line}`); out.push('}'); }
  }
  out.push(...edgeLines(edges, id));
  return wrap(out);
}

function plantUseCase(project, diagram) {
  const { nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = ['left to right direction'];
  const subjects = nodes.filter((n) => n.element._type === 'UMLUseCaseSubject');
  const owner = new Map();
  for (const s of subjects) for (const n of nodes) if (n !== s && inside(box(n.view), box(s.view))) owner.set(n, s);
  const line = (n) => {
    const kind = n.element._type === 'UMLActor' ? 'actor' : n.element._type === 'UMLUseCase' ? 'usecase' : n.element._type === 'UMLPackage' ? 'package' : 'rectangle';
    return `${kind} ${q(n.element.name)} as ${id(n.element._id, n.element.name)}${stereo(n.element)}`;
  };
  for (const n of nodes) if (n.element._type !== 'UMLUseCaseSubject' && !owner.has(n)) out.push(line(n));
  for (const s of subjects) {
    out.push(`rectangle ${q(s.element.name)} {`);
    for (const n of nodes) if (owner.get(n) === s) out.push(`  ${line(n)}`);
    out.push('}');
  }
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head) continue;
    const a = id(tail._id, tail.name);
    const b = id(head._id, head.name);
    if (element._type === 'UMLAssociation') out.push(`${a} --${element.end2?.navigable === 'navigable' ? '>' : ''} ${b}${element.name ? ` : ${element.name}` : ''}`);
    else out.push(relationLine(element, a, b));
  }
  return wrap(out);
}

const PLANT_ARROW = { synchCall: '->', asynchCall: '->>', asynchSignal: '->>', reply: '-->', createMessage: '->', deleteMessage: '->' };
const PLANT_FRAGMENT = new Set(['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group']);

function plantSequence(project, diagram) {
  const { index, lifelines, items } = sequenceTree(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  if (diagram.showSequenceNumber) out.push('autonumber');
  const created = new Set();
  const walkCreated = (list) => { for (const item of list) { if (item.kind === 'message' && item.element.messageSort === 'createMessage' && item.head) created.add(item.head._id); else if (item.kind === 'fragment') item.operands.forEach((o) => walkCreated(o.items)); } };
  walkCreated(items);
  for (const { element } of lifelines) {
    if (created.has(element._id)) continue;
    const name = id(element._id, element.name);
    out.push(`${lifelineIsActor(element, index) ? 'actor' : 'participant'} ${name !== element.name ? `${q(element.name)} as ${name}` : name}`);
  }
  const emit = (list, indent) => {
    for (const item of list) {
      if (item.kind === 'message') {
        if (!item.tail || !item.head) continue;
        const m = item.element;
        const to = id(item.head._id, item.head.name);
        if (m.messageSort === 'createMessage') out.push(`${indent}create ${lifelineIsActor(item.head, index) ? 'actor' : 'participant'} ${to !== item.head.name ? `${q(item.head.name)} as ${to}` : to}`);
        out.push(`${indent}${id(item.tail._id, item.tail.name)} ${PLANT_ARROW[m.messageSort] ?? '->'} ${to}${m.name ? ` : ${m.name}${m.arguments ? `(${m.arguments})` : ''}` : ''}`);
        if (m.messageSort === 'deleteMessage') out.push(`${indent}destroy ${to}`);
      } else {
        const op = PLANT_FRAGMENT.has(item.operator) ? item.operator : 'group';
        item.operands.forEach((operand, i) => {
          out.push(`${indent}${i === 0 ? (op === 'group' ? `group ${item.operator}` : op) : 'else'}${operand.guard ? ` ${operand.guard}` : ''}`);
          emit(operand.items, `${indent}  `);
        });
        out.push(`${indent}end`);
      }
    }
  };
  emit(items, '');
  return wrap(out);
}

function plantActivity(project, diagram) {
  const { nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  const name = (el, asSource) => {
    if (el._type === 'UMLInitialNode') return '(*)';
    if (el._type === 'UMLActivityFinalNode' || el._type === 'UMLFlowFinalNode') return asSource ? q(el.name || 'end') : '(*)';
    if (el._type === 'UMLForkNode' || el._type === 'UMLJoinNode') return `===${id(el._id, el.name || 'bar')}===`;
    const label = el.name || (/Decision/.test(el._type) ? '?' : /Merge/.test(el._type) ? 'merge' : el._type.replace(/^UML/, ''));
    return `${q(label)} as ${id(el._id, label)}`;
  };
  const declared = new Set();
  const refer = (el, asSource) => {
    const full = name(el, asSource);
    if (!full.includes(' as ')) return full;
    if (declared.has(el._id)) return id(el._id);
    declared.add(el._id);
    return full;
  };
  const partitions = nodes.filter((n) => n.element._type === 'UMLActivityPartition');
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head) continue;
    const guard = element.guard ? ` [${element.guard}]` : element.name ? ` [${element.name}]` : '';
    out.push(`${refer(tail, true)} -->${guard} ${refer(head, false)}`);
  }
  for (const n of nodes) {
    if (n.element._type === 'UMLActivityPartition' || declared.has(n.element._id) || /Initial|Final|Fork|Join/.test(n.element._type)) continue;
    out.push(`${refer(n.element, true)}`);
  }
  for (const p of partitions) out.unshift(`' partition: ${p.element.name}`);
  return wrap(out);
}

function plantState(project, diagram) {
  const { children, scopeOf, transitions } = stateScopes(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  const ref_ = (el, asSource) => ((el._type === 'UMLPseudostate' && el.kind === 'initial' && asSource) || (el._type === 'UMLFinalState' && !asSource) ? '[*]' : id(el._id, el.name || el._type));
  const scoped = (scope) => transitions.filter(({ tail, head }) => {
    const special = tail._type === 'UMLPseudostate' && tail.kind === 'initial' ? tail : head._type === 'UMLFinalState' ? head : null;
    if (special) return scopeOf(special) === scope;
    const a = scopeOf(tail);
    return (a === scopeOf(head) ? a : '') === scope;
  });
  const STEREO = { choice: 'choice', fork: 'fork', join: 'join', junction: 'choice', entryPoint: 'entryPoint', exitPoint: 'exitPoint', deepHistory: 'history*', shallowHistory: 'history' };
  const emit = (scope, indent) => {
    for (const el of children.get(scope) ?? []) {
      if ((el._type === 'UMLPseudostate' && el.kind === 'initial') || el._type === 'UMLFinalState') continue;
      const name = id(el._id, el.name || el._type);
      if (el._type === 'UMLPseudostate') { out.push(`${indent}state ${name} <<${STEREO[el.kind] ?? 'choice'}>>`); continue; }
      const alias = el.name && name !== el.name ? `${q(el.name)} as ${name}` : name;
      if (children.get(el._id)?.length) {
        out.push(`${indent}state ${alias} {`);
        emit(el._id, `${indent}  `);
        out.push(`${indent}}`);
      } else out.push(`${indent}state ${alias}`);
      for (const [key, label] of [['entryActivity', 'entry'], ['doActivity', 'do'], ['exitActivity', 'exit']]) if (el[key]) out.push(`${indent}${name} : ${label} / ${el[key]}`);
    }
    for (const { element, tail, head } of scoped(scope)) {
      const text = transitionLabel(element);
      out.push(`${indent}${ref_(tail, true)} --> ${ref_(head, false)}${text ? ` : ${text}` : ''}`);
    }
  };
  emit('', '');
  return wrap(out);
}

const DEPLOY_KEYWORD = { UMLNode: 'node', UMLDevice: 'node', UMLExecutionEnvironment: 'node', UMLNodeInstance: 'node', UMLArtifact: 'artifact', UMLArtifactInstance: 'artifact', UMLComponent: 'component', UMLComponentInstance: 'component', UMLInterface: 'interface', UMLPackage: 'package', UMLActor: 'actor', UMLClass: 'class', UMLSubsystem: 'package' };

/** Component and deployment diagrams: boxes nested by geometry, then the lines. */
function plantStructure(project, diagram) {
  const { nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(RESERVED);
  const out = [];
  const containerTypes = new Set(['UMLNode', 'UMLDevice', 'UMLExecutionEnvironment', 'UMLNodeInstance', 'UMLPackage', 'UMLSubsystem', 'UMLComponent']);
  const parentOf = new Map();
  for (const n of nodes) {
    const holders = nodes.filter((m) => m !== n && containerTypes.has(m.element._type) && inside(box(n.view), box(m.view)));
    if (holders.length) parentOf.set(n, holders.sort((a, b) => box(a.view).w * box(a.view).h - box(b.view).w * box(b.view).h)[0]);
  }
  const emit = (holder, indent) => {
    for (const n of nodes.filter((m) => (parentOf.get(m) ?? null) === holder)) {
      const el = n.element;
      const keyword = DEPLOY_KEYWORD[el._type] ?? 'rectangle';
      const kw = typeDef(el._type)?.keyword && keyword === 'node' ? ` <<${typeDef(el._type).keyword}>>` : '';
      const head = `${indent}${keyword} ${q(el.name)} as ${id(el._id, el.name)}${stereo(el)}${kw}`;
      const kids = nodes.some((m) => parentOf.get(m) === n);
      if (kids && keyword !== 'interface' && keyword !== 'actor' && keyword !== 'class') { out.push(`${head} {`); emit(n, `${indent}  `); out.push(`${indent}}`); } else out.push(head);
    }
  };
  emit(null, '');
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head) continue;
    const a = id(tail._id, tail.name);
    const b = id(head._id, head.name);
    const label = element.name ? ` : ${element.name}` : '';
    const type = element._type;
    if (type === 'UMLInterfaceRealization' || type === 'UMLComponentRealization') out.push(`${a} -- ${b}${label}`);
    else if (type === 'UMLUsage') out.push(`${a} ..> ${b} : use`);
    else if (type === 'UMLDeployment') out.push(`${a} ..> ${b} : <<deploy>>`);
    else if (type === 'UMLManifestation') out.push(`${a} ..> ${b} : <<manifest>>`);
    else if (type === 'UMLCommunicationPath' || type === 'UMLConnector' || type === 'UMLAssociation') out.push(`${a} -- ${b}${label}`);
    else out.push(relationLine(element, a, b));
  }
  return wrap(out);
}

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
    out.push(`${id(tail._id, tail.name)} ${IE_LEFT[x?.cardinality] ?? '||'}${element.identifying === false ? '..' : '--'}${IE_RIGHT[y?.cardinality] ?? '||'} ${id(head._id, head.name)}${element.name ? ` : ${element.name}` : ''}`);
  }
  return wrap(out);
}

/**
 * A diagram as PlantUML text. Throws 'interop.unsupportedDiagram' (detail: type).
 */
export function exportPlantUml(project, diagram) {
  switch (diagram?._type) {
    case 'UMLClassDiagram': case 'UMLPackageDiagram': case 'UMLObjectDiagram': case 'UMLProfileDiagram': return plantClass(project, diagram);
    case 'UMLUseCaseDiagram': return plantUseCase(project, diagram);
    case 'UMLSequenceDiagram': return plantSequence(project, diagram);
    case 'UMLActivityDiagram': return plantActivity(project, diagram);
    case 'UMLStatechartDiagram': return plantState(project, diagram);
    case 'UMLComponentDiagram': case 'UMLDeploymentDiagram': return plantStructure(project, diagram);
    case 'ERDDiagram': return plantEr(project, diagram);
    default: throw fail('interop.unsupportedDiagram', diagram?._type ?? '');
  }
}

// ───────────────────────── reading

/** Removes direction hints and styles from an arrow: -up->, -[#red]->, -left-|> … */
const normalizeArrow = (arrow) => arrow.replace(/\[[^\]]*\]/g, '').replace(/(up|down|left|right|u|d|l|r)(?=[-.])/g, '');
const P_NAME = String.raw`(?:"[^"]+"|[\w$.À-￿]+)`;
const P_REL = new RegExp(String.raw`^(${P_NAME})\s*(?:"([^"]*)")?\s*((?:<\||\*|o|<|\+|#)?[-.](?:\[[^\]]*\]|up|down|left|right|[udlr])*[-.]*(?:\|>|\*|o(?=[\s"])|>|\+|#)?)(?=[\s"]|$)\s*(?:"([^"]*)")?\s*(${P_NAME})\s*(?::\s*(.*))?$`);
const unq = (s) => String(s ?? '').trim().replace(/^"(.*)"$/, '$1');

function parsePlantClass(lines) {
  const ir = { classes: new Map(), relations: [], notes: [], title: '' };
  const aliases = new Map();
  const packages = [];
  const cls = (raw, label = '') => {
    const key = unq(raw);
    const id = aliases.get(key) ?? key;
    if (!ir.classes.has(id)) ir.classes.set(id, { id, label: label || '', kind: 'class', isAbstract: false, stereotype: '', namespace: packages.join('.'), members: [], literals: [] });
    return ir.classes.get(id);
  };
  let open = null;
  const stack = [];
  for (const line of lines) {
    let m;
    if (open) {
      if (line === '}') { open = null; continue; }
      if (/^(--|==|\.\.|__)/.test(line)) continue;
      if (open.kind === 'enum' && /^[\wÀ-￿]+[,;]?$/.test(line)) { open.literals.push(line.replace(/[,;]$/, '')); continue; }
      const member = parseMember(line);
      if (member.name || member.kind === 'operation') open.members.push(member);
      continue;
    }
    if ((m = /^title\s+(.*)$/.exec(line))) { ir.title = m[1].trim(); continue; }
    if (/^(skinparam|hide|show|left to right|top to bottom|!|scale|set |allowmixing|namespaceSeparator)/.test(line)) continue;
    if ((m = new RegExp(String.raw`^(?:package|namespace)\s+(${P_NAME})(?:\s+as\s+\S+)?(?:\s+<<[^>]*>>)?\s*\{$`).exec(line))) { packages.push(unq(m[1])); stack.push('package'); continue; }
    if ((m = new RegExp(String.raw`^(abstract\s+class|abstract|class|interface|enum|annotation|entity|protocol|struct|exception|metaclass|stereotype|dataclass|record)\s+(${P_NAME})(?:\s+as\s+(${P_NAME}))?(\s*<[^>]+>)?\s*(<<[^>]*>>)?\s*(?:#[\w#]+)?\s*(?:(?:extends|implements)\s+[\w, .]+)?\s*(\{)?\s*(\})?$`).exec(line))) {
      const [, kw, first, second, generic, st, brace, close] = m;
      let label = unq(first);
      let key = second ? unq(second) : label;
      if (first.startsWith('"') && second) { aliases.set(key, key); } else if (second && !first.startsWith('"')) { label = unq(second); key = unq(first); aliases.set(label, key); }
      const c = cls(key, label !== key ? label : '');
      if (generic) c.label = `${label}${generic.trim()}`;
      if (/interface|protocol/.test(kw)) c.kind = 'interface';
      else if (kw === 'enum') c.kind = 'enum';
      else if (/abstract/.test(kw)) c.isAbstract = true;
      else if (kw !== 'class') c.stereotype = kw;
      if (st) {
        const s = st.slice(2, -2).trim();
        if (/^interface$/i.test(s)) c.kind = 'interface'; else if (/^abstract$/i.test(s)) c.isAbstract = true; else if (/^enum(eration)?$/i.test(s)) c.kind = 'enum'; else c.stereotype = s;
      }
      if (brace && !close) open = c;
      continue;
    }
    if (line === '}') { if (stack.pop() === 'package') packages.pop(); continue; }
    if ((m = P_REL.exec(line))) {
      const [, left, leftCard, rawArrow, rightCard, right, rawLabel] = m;
      const arrow = normalizeArrow(rawArrow);
      const am = /^(<\||\*|o|<|\+|#)?([-.]+)(\|>|\*|o|>|\+|#)?$/.exec(arrow);
      if (!am) continue;
      const [, lh, link, rh] = am;
      const a = cls(left).id;
      const b = cls(right).id;
      const dashed = link.includes('.');
      const name = (rawLabel ?? '').replace(/\s*[<>]$/, '').replace(/^\s*[<>]\s*/, '').trim();
      if (lh === '<|') ir.relations.push({ kind: dashed ? 'realization' : 'generalization', from: b, to: a, name });
      else if (rh === '|>') ir.relations.push({ kind: dashed ? 'realization' : 'generalization', from: a, to: b, name });
      else if (dashed) ir.relations.push(lh === '<' ? { kind: 'dependency', from: b, to: a, name } : { kind: 'dependency', from: a, to: b, name });
      else {
        const end = (head, card) => ({ multiplicity: card ?? '', aggregation: head === '*' ? 'composite' : head === 'o' ? 'shared' : 'none', navigable: head === '<' || head === '>' });
        ir.relations.push({ kind: 'association', from: a, to: b, name, fromEnd: end(lh, leftCard), toEnd: end(rh, rightCard) });
      }
      continue;
    }
    if ((m = new RegExp(String.raw`^(${P_NAME})\s*:\s*(.+)$`).exec(line))) {
      const member = parseMember(m[2]);
      if (member.name || member.kind === 'operation') cls(m[1]).members.push(member);
    }
  }
  return ir;
}

const P_ARROW = /^(.+?)\s*([xo]?(?:<<|<|\\\\|\/\/)-{1,2}(?:\[[^\]]*\])?-?(?:>>|>)?|-{1,2}(?:\[[^\]]*\])?-?(?:>>|>|\\\\|\/\/|\\|\/)[xo]?)\s*(.+?)\s*(?::\s*(.*))?$/;

function parsePlantSequence(lines) {
  const ir = { participants: [], items: [], title: '' };
  const known = new Map();
  const participant = (raw, label = '', actor = false) => {
    let key = unq(raw).replace(/\s*(\+\+|--|\*\*|!!)$/, '');
    if (!known.has(key)) { const p = { id: key, label: unq(label) || key, actor }; known.set(key, p); ir.participants.push(p); } else if (label) known.get(key).label = unq(label);
    if (actor) known.get(key).actor = true;
    return known.get(key);
  };
  const stack = [{ items: ir.items }];
  const target = () => stack[stack.length - 1].items;
  const created = new Set();
  const destroyed = new Set();
  const calls = [];
  let inNote = false;
  for (const line of lines) {
    let m;
    if (inNote) { if (/^end\s*(note|rnote|hnote|ref)$/i.test(line)) inNote = false; continue; }
    if (/^[rh]?note\b/i.test(line) || /^ref\s+over\b/i.test(line)) {
      if (!line.includes(':')) { inNote = true; continue; }
      const nm = /^[rh]?note\s+(left of|right of|over|left|right)\s*([^:]*):\s*(.*)$/i.exec(line);
      if (nm) target().push({ kind: 'note', over: nm[2].split(',').map((s) => s.trim()).filter(Boolean).map((s) => participant(s).id), text: nm[3], side: /left/i.test(nm[1]) ? 'left' : /right/i.test(nm[1]) ? 'right' : 'over' });
      continue;
    }
    if ((m = /^title\s+(.*)$/.exec(line))) { ir.title = m[1].trim(); continue; }
    if (/^(skinparam|hide|show|autonumber|activate|deactivate|!|scale|==|\.\.\.|\|\|\||newpage|box|end box|autoactivate|mainframe)/i.test(line)) continue;
    if ((m = /^(create\s+)?(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+?)(?:\s+as\s+(\S+))?(?:\s+<<.*>>)?(?:\s+#\w+)?(?:\s+order\s+\d+)?$/.exec(line))) {
      const [, create, kind, first, second] = m;
      const p = second ? (first.startsWith('"') ? participant(second, first, kind === 'actor') : participant(first, second, kind === 'actor')) : participant(first, '', kind === 'actor');
      if (create) created.add(p.id);
      continue;
    }
    if ((m = /^create\s+(.+)$/.exec(line))) { created.add(participant(m[1]).id); continue; }
    if ((m = /^destroy\s+(.+)$/.exec(line))) { destroyed.add(participant(m[1]).id); continue; }
    if ((m = /^(alt|opt|loop|par|break|critical|group)\b\s*(.*)$/.exec(line))) {
      const fragment = { kind: 'fragment', operator: m[1] === 'group' ? 'seq' : m[1], operands: [{ guard: m[2].trim(), items: [] }] };
      target().push(fragment);
      stack.push({ fragment, items: fragment.operands[0].items });
      continue;
    }
    if ((m = /^else\b\s*(.*)$/.exec(line))) {
      const top = stack[stack.length - 1];
      if (top.fragment) { const operand = { guard: m[1].trim(), items: [] }; top.fragment.operands.push(operand); top.items = operand.items; }
      continue;
    }
    if (line === 'end') { if (stack.length > 1) stack.pop(); continue; }
    if ((m = /^return\b\s*(.*)$/.exec(line))) {
      const call = calls.pop();
      if (call) target().push({ kind: 'message', from: call.to, to: call.from, sort: 'reply', text: m[1].trim() });
      continue;
    }
    if ((m = P_ARROW.exec(line))) {
      let [, left, arrow, right, text] = m;
      if (/^[[\]]$/.test(left.trim()) || /^[[\]]$/.test(right.trim())) continue;
      const reversed = arrow.trimStart().startsWith('<') || /^[xo]</.test(arrow);
      const plain = arrow.replace(/\[[^\]]*\]/g, '');
      const dotted = plain.includes('--');
      const async = />>|\\\\|\/\//.test(plain) || /<</.test(plain);
      const lost = /^x|x$/.test(plain);
      let from = participant(left).id;
      let to = participant(right).id;
      if (reversed) [from, to] = [to, from];
      let sort = dotted ? 'reply' : lost ? 'asynchSignal' : async ? 'asynchCall' : 'synchCall';
      if (/\*\*\s*$/.test(right) || created.has(to)) { sort = 'createMessage'; created.delete(to); } else if (/!!\s*$/.test(right) || destroyed.has(to)) { sort = 'deleteMessage'; destroyed.delete(to); }
      target().push({ kind: 'message', from, to, sort, text: (text ?? '').trim() });
      if (sort === 'synchCall') calls.push({ from, to });
    }
  }
  return ir;
}

/**
 * Reads PlantUML text (class or sequence diagram). Returns { owner, diagram, kind }
 * like importMermaid. Throws 'interop.unsupportedPlantUml' when neither kind is found,
 * 'interop.empty' for empty text.
 */
export function importPlantUml(text, { language = 'en', name = '' } = {}) {
  let lines = cleanLines(text, /^'/);
  // Block comments /' … '/ and the @start/@end markers.
  const joined = lines.join('\n').replace(/\/'[\s\S]*?'\//g, '');
  lines = joined.split('\n').map((l) => l.trim()).filter((l) => l && !/^@(start|end)\w*/.test(l));
  if (!lines.length) throw fail('interop.empty', '');
  const classy = lines.some((l) => /^(abstract\s+class|abstract|class|interface|enum)\s+\S/.test(l)) || lines.some((l) => /<\|--|--\|>|\*--|--\*|o--|--o|\.\.\|>|<\|\.\./.test(l));
  const sequency = lines.some((l) => /^(participant|actor|boundary|control|entity|database|collections|queue)\s/.test(l)) || lines.some((l) => /^\S+\s*-+>>?\s*\S+\s*:/.test(l));
  if (classy && !(sequency && !lines.some((l) => /^(abstract\s+class|class|interface|enum)\s/.test(l)))) return buildClassModel(parsePlantClass(lines), { language, name });
  if (sequency) return buildSequenceModel(parsePlantSequence(lines), { language, name });
  throw fail('interop.unsupportedPlantUml', lines[0]);
}

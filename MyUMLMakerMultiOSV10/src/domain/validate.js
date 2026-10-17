// Model validation (StarUML's Model › Validate): a list of rules and a check
// that walks the project and reports every element that breaks one. Each
// problem names the rule, its severity, the element id and a bilingual
// message. Pure (no DOM).
import { UNNAMED, typeDef, typeLabel } from './meta.js';
import { allDiagrams, buildIndex, relationshipEnds, refId, walk } from './model.js';

/** The rules: id, severity, bilingual description. */
export const RULES = [
  { id: 'name-missing', severity: 'error', ko: '이름이 없습니다', en: 'Name is missing' },
  { id: 'name-duplicate', severity: 'error', ko: '같은 네임스페이스에 같은 이름이 있습니다', en: 'Duplicate name in the same namespace' },
  { id: 'generalization-cycle', severity: 'error', ko: '일반화가 순환합니다', en: 'Generalization cycle' },
  { id: 'generalization-incompatible', severity: 'error', ko: '서로 다른 종류 사이의 일반화입니다', en: 'Generalization between incompatible types' },
  { id: 'interface-attribute-not-static', severity: 'warning', ko: '인터페이스 속성은 static 또는 읽기 전용이어야 합니다', en: 'Interface attribute should be static or read-only' },
  { id: 'abstract-operation-in-concrete-class', severity: 'error', ko: '추상 클래스가 아닌 클래스에 추상 오퍼레이션이 있습니다', en: 'Abstract operation in a non-abstract class' },
  { id: 'realization-target-not-interface', severity: 'error', ko: '실체화 대상이 인터페이스가 아닙니다', en: 'Realization target is not an interface' },
  { id: 'association-end-no-reference', severity: 'error', ko: '연관 끝이 아무것도 가리키지 않습니다', en: 'Association end has no reference' },
  { id: 'relationship-end-missing', severity: 'error', ko: '관계의 끝 요소가 없습니다', en: 'Relationship end refers to a missing element' },
  { id: 'multiplicity-invalid', severity: 'error', ko: '다중성 형식이 잘못되었습니다 (n, n..m, *, n..*)', en: 'Invalid multiplicity (n, n..m, *, n..*)' },
  { id: 'enumeration-no-literals', severity: 'warning', ko: '열거형에 리터럴이 없습니다', en: 'Enumeration has no literals' },
  { id: 'lifeline-no-represent', severity: 'warning', ko: '라이프라인이 나타내는 요소가 없습니다', en: 'Lifeline does not represent anything' },
  { id: 'create-message-self', severity: 'error', ko: '자기 자신에게 생성 메시지를 보냅니다', en: 'Create message to the same lifeline' },
  { id: 'region-no-initial', severity: 'warning', ko: '영역에 시작 의사 상태가 없습니다', en: 'Region has no initial pseudostate' },
  { id: 'region-multiple-initial', severity: 'error', ko: '영역에 시작 의사 상태가 여러 개입니다', en: 'Region has more than one initial pseudostate' },
  { id: 'final-state-outgoing', severity: 'error', ko: '종료 상태에서 나가는 전이가 있습니다', en: 'Final state has an outgoing transition' },
  { id: 'decision-few-outgoing', severity: 'warning', ko: '결정 노드에서 나가는 흐름이 2개 미만입니다', en: 'Decision node has fewer than 2 outgoing flows' },
  { id: 'entity-no-primary-key', severity: 'warning', ko: '엔터티에 기본 키가 없습니다', en: 'Entity has no primary key' },
  { id: 'foreign-key-no-reference', severity: 'warning', ko: '외래 키 열이 참조하는 열이 없습니다', en: 'Foreign key column has no referenced column' },
  { id: 'diagram-empty', severity: 'warning', ko: '빈 다이어그램입니다', en: 'Diagram is empty' },
  { id: 'broken-ref', severity: 'error', ko: '없는 요소를 가리키는 참조가 있습니다', en: 'Reference to a missing element' },
];
const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]));

/** Types that may stay unnamed (relationships, ends, parameters, pseudostates …). */
const NAME_OPTIONAL = new Set(['Project', 'UMLParameter', 'UMLAssociationEnd', 'ERDRelationshipEnd', 'UMLRegion', 'UMLTag', 'UMLSlot', 'UMLLifeline', 'UMLInteractionOperand', 'UMLConstraint', 'UMLTimeSegment', 'UMLTimeTick']);
const needsName = (type) => {
  const def = typeDef(type);
  return Boolean(def) && !def.noName && !def.edge && !def.nameOutside && !def.textInside && !NAME_OPTIONAL.has(type) && !UNNAMED.has(type) && def.group !== 'wireframe';
};

/** Generalization between these types is fine (same family). */
const FAMILIES = [
  ['UMLDataType', 'UMLPrimitiveType', 'UMLEnumeration'],
  ['UMLNode', 'UMLDevice', 'UMLExecutionEnvironment'],
  ['UMLComponent', 'UMLSubsystem'],
  ['UMLClass', 'UMLSignal', 'UMLStereotype'],
  ['SysMLBlock', 'SysMLInterfaceBlock', 'SysMLConstraintBlock'],
];
const compatible = (a, b) => a === b || FAMILIES.some((f) => f.includes(a) && f.includes(b));

const MULTIPLICITY = /^(\d+|\*|\d+\.\.(\d+|\*))$/;
/** n, n..m (n ≤ m), *, n..* (empty is allowed: not set). */
export function validMultiplicity(text) {
  const value = String(text ?? '').trim();
  if (!value) return true;
  if (!MULTIPLICITY.test(value)) return false;
  const [lo, hi] = value.split('..');
  return hi === undefined || hi === '*' || Number(lo) <= Number(hi);
}

/** Every problem of the project: [{ rule, severity, id, message: { ko, en } }]. */
export function validate(project) {
  const index = buildIndex(project);
  const out = [];
  const label = (element) => (element?.name ? `'${element.name}'` : '');
  const report = (ruleId, element, extra = { ko: '', en: '' }) => {
    const rule = RULE[ruleId];
    const what = (lang) => `${typeLabel(element?._type, lang)}${label(element) ? ` ${label(element)}` : ''}`;
    out.push({
      rule: ruleId, severity: rule.severity, id: element?._id ?? null,
      message: { ko: `${what('ko')}: ${rule.ko}${extra.ko ? ` (${extra.ko})` : ''}`, en: `${what('en')}: ${rule.en}${extra.en ? ` (${extra.en})` : ''}` },
    });
  };
  const exists = (value) => Boolean(index.get(value));

  const generalizations = [];
  const outgoing = new Map();
  walk(project, (element, parent) => {
    const type = element._type;
    const def = typeDef(type);
    if (!def) return;
    // Names.
    if (needsName(type) && !String(element.name ?? '').trim()) report('name-missing', element);
    // Duplicate names among siblings of the same kind.
    for (const key of ['ownedElements', 'attributes', 'operations', 'literals', 'columns', 'participants', 'vertices']) {
      const list = element[key];
      if (!Array.isArray(list)) continue;
      const seen = new Map();
      for (const child of list) {
        const cd = typeDef(child._type);
        if (!child.name || !cd || cd.edge || cd.diagram) continue;
        // Operations may be overloaded: same name + same parameter types only.
        const signature = child._type === 'UMLOperation' ? `${child.name}(${(child.parameters ?? []).filter((p) => p.direction !== 'return').map((p) => (typeof p.type === 'string' ? p.type : refId(p.type))).join(',')})` : child.name;
        const kind = key === 'ownedElements' ? 'element' : key;
        const k = `${kind}\u0000${signature}`;
        if (seen.has(k)) report('name-duplicate', child, { ko: element.name ?? '', en: element.name ?? '' }); else seen.set(k, child);
      }
    }
    // Relationship ends.
    if (def.edge) {
      if (def.ends === 'association') {
        for (const key of ['end1', 'end2']) {
          const end = element[key];
          if (!end || !refId(end.reference)) report('association-end-no-reference', element, { ko: key, en: key });
          else if (!exists(end.reference)) report('relationship-end-missing', element, { ko: key, en: key });
        }
      } else {
        const [a, b] = relationshipEnds(element);
        if (!a || !b || !exists(a) || !exists(b)) report('relationship-end-missing', element, { ko: !a || !exists(a) ? 'source' : 'target', en: !a || !exists(a) ? 'source' : 'target' });
      }
      const [a, b] = relationshipEnds(element);
      if (a) { if (!outgoing.has(a)) outgoing.set(a, []); outgoing.get(a).push(element); }
      const source = index.get(a);
      const target = index.get(b);
      if (type === 'UMLGeneralization' && source && target) {
        generalizations.push([source._id, target._id, element]);
        if (!compatible(source._type, target._type)) report('generalization-incompatible', element, { ko: `${typeLabel(source._type, 'ko')} → ${typeLabel(target._type, 'ko')}`, en: `${typeLabel(source._type, 'en')} → ${typeLabel(target._type, 'en')}` });
      }
      if (target && ((type === 'UMLInterfaceRealization' && target._type !== 'UMLInterface') || (type === 'UMLRealization' && ['UMLClass', 'UMLDataType', 'UMLEnumeration', 'UMLPrimitiveType'].includes(target._type)))) {
        report('realization-target-not-interface', element, { ko: target.name ?? '', en: target.name ?? '' });
      }
      if (type === 'UMLMessage' && element.messageSort === 'createMessage' && a && a === b) report('create-message-self', element);
      if (type === 'UMLTransition' && source?._type === 'UMLFinalState') report('final-state-outgoing', source);
    }
    // Multiplicities (association ends are walked as elements too).
    if (typeof element.multiplicity === 'string' && !validMultiplicity(element.multiplicity)) report('multiplicity-invalid', element, { ko: element.multiplicity, en: element.multiplicity });
    // Classifiers.
    if (type === 'UMLInterface') for (const a of element.attributes ?? []) if (!a.isStatic && !a.isReadOnly) report('interface-attribute-not-static', a, { ko: element.name ?? '', en: element.name ?? '' });
    if (type === 'UMLClass' && !element.isAbstract) for (const o of element.operations ?? []) if (o.isAbstract) report('abstract-operation-in-concrete-class', o, { ko: element.name ?? '', en: element.name ?? '' });
    if (type === 'UMLEnumeration' && !(element.literals ?? []).length) report('enumeration-no-literals', element);
    // Interactions.
    if (type === 'UMLLifeline' && !refId(element.represent)) report('lifeline-no-represent', element);
    // State machines.
    if (type === 'UMLRegion') {
      const vertices = element.vertices ?? [];
      const initials = vertices.filter((v) => v._type === 'UMLPseudostate' && (v.kind ?? 'initial') === 'initial');
      if (vertices.length && !initials.length) report('region-no-initial', element, { ko: parent?.name ?? '', en: parent?.name ?? '' });
      if (initials.length > 1) report('region-multiple-initial', element, { ko: String(initials.length), en: String(initials.length) });
    }
    // ERD.
    if (type === 'ERDEntity' && !(element.columns ?? []).some((c) => c.primaryKey)) report('entity-no-primary-key', element);
    if (type === 'ERDColumn' && element.foreignKey && !refId(element.referenceTo)) report('foreign-key-no-reference', element);
  });

  // Decision nodes: outgoing flows.
  walk(project, (element) => {
    if (element._type !== 'UMLDecisionNode' && element._type !== 'FCDecision') return;
    const flows = (outgoing.get(element._id) ?? []).filter((r) => /Flow$/.test(r._type));
    if (flows.length < 2) report('decision-few-outgoing', element, { ko: String(flows.length), en: String(flows.length) });
  });

  // Generalization cycles: one report per cycle (on the first generalization found in it).
  const parents = new Map();
  for (const [s, t, g] of generalizations) { if (!parents.has(s)) parents.set(s, []); parents.get(s).push([t, g]); }
  const state = new Map();
  const reported = new Set();
  const stack = [];
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const [next, g] of parents.get(id) ?? []) {
      if (state.get(next) === 1) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          const names = [...cycle, next].map((x) => index.get(x)?.name ?? '?').join(' → ');
          report('generalization-cycle', g, { ko: names, en: names });
        }
      } else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of parents.keys()) if (!state.has(id)) visit(id);

  // Diagrams without views.
  for (const diagram of allDiagrams(project)) if (!(diagram.ownedViews ?? []).length) report('diagram-empty', diagram);

  // Broken references anywhere (model and views, sub views included).
  const ids = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    if (value._id) ids.add(value._id);
    for (const [key, child] of Object.entries(value)) if (key !== '_parent' && child && typeof child === 'object') collect(child);
  };
  collect(project);
  const check = (value, holder, path) => {
    if (Array.isArray(value)) { value.forEach((item, i) => check(item, holder, `${path}[${i}]`)); return; }
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string' && Object.keys(value).length === 1) {
      if (!ids.has(value.$ref)) report('broken-ref', holder, { ko: `${path} → ${value.$ref}`, en: `${path} → ${value.$ref}` });
      return;
    }
    const owner = value._id ? value : holder;
    for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') check(child, owner, value._id ? key : `${path}.${key}`);
  };
  check(project, project, '');
  return out;
}

/** Counts by severity: { error, warning }. */
export function summarize(problems) {
  return problems.reduce((acc, p) => { acc[p.severity] = (acc[p.severity] ?? 0) + 1; return acc; }, { error: 0, warning: 0 });
}

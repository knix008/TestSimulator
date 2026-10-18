// Model validation (StarUML's Model › Validate): a list of rules and a check
// that walks the project and reports every element that breaks one. Each
// problem names the rule, its severity, the element id and a bilingual
// message. Pure (no DOM).
import { UNNAMED, typeDef, typeLabel } from './meta.js';
import { buildIndex, isDiagram, relationshipEnds, refId, walk } from './model.js';
import { coverageProblems } from './trace.js';
import { parseDate } from './planning.js';
import { parseData, railroadOf } from './datatext.js';

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
  { id: 'gantt-date-invalid', severity: 'error', ko: '날짜 형식이 잘못되었습니다 (YYYY-MM-DD)', en: 'Invalid date (YYYY-MM-DD)' },
  { id: 'gantt-duration-invalid', severity: 'warning', ko: '작업 기간이 하루보다 짧고 끝 날짜도 없습니다', en: 'Task lasts less than a day and has no end date' },
  { id: 'gantt-period-reversed', severity: 'error', ko: '끝 날짜가 시작 날짜보다 앞섭니다', en: 'End date is before the start date' },
  { id: 'data-syntax-error', severity: 'error', ko: '내용에 문법 오류가 있습니다', en: 'Syntax error in the text' },
  { id: 'requirement-not-satisfied', severity: 'warning', ko: '승인된 요구사항을 충족하는 요소가 없습니다', en: 'Approved requirement is not satisfied by any element' },
  { id: 'requirement-not-verified', severity: 'warning', ko: '승인된 요구사항을 검증하는 요소가 없습니다', en: 'Approved requirement is not verified by any element' },
  { id: 'requirement-id-duplicate', severity: 'warning', ko: '요구사항 ID가 중복됩니다', en: 'Requirement id is used more than once' },
  { id: 'column-name-duplicate', severity: 'error', ko: '엔터티에 같은 이름의 열이 있습니다', en: 'Duplicate column name in the entity' },
  { id: 'column-type-missing', severity: 'warning', ko: '열에 데이터 타입이 없습니다', en: 'Column has no data type' },
  { id: 'entity-no-columns', severity: 'warning', ko: '엔터티에 열이 없습니다', en: 'Entity has no columns' },
  { id: 'foreign-key-type-mismatch', severity: 'warning', ko: '외래 키의 타입이 참조하는 열의 타입과 다릅니다', en: 'Foreign key type differs from the referenced column' },
  { id: 'relationship-no-foreign-key', severity: 'warning', ko: '관계로 이어진 엔터티 사이에 외래 키 열이 없습니다', en: 'No foreign key column links the related entities' },
  { id: 'entity-name-duplicate', severity: 'error', ko: '데이터 모델에 같은 이름의 엔터티가 있습니다', en: 'Duplicate entity name in the data model' },
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

/** Same-meaning SQL type names (an INTEGER key referenced by an INT column is fine). */
const SQL_SYNONYMS = {
  INT: 'INTEGER', INT4: 'INTEGER', SERIAL: 'INTEGER', SERIAL4: 'INTEGER', MEDIUMINT: 'INTEGER',
  INT8: 'BIGINT', BIGSERIAL: 'BIGINT', SERIAL8: 'BIGINT', INT2: 'SMALLINT', SMALLSERIAL: 'SMALLINT',
  BOOL: 'BOOLEAN', NUMERIC: 'DECIMAL', DEC: 'DECIMAL', 'CHARACTER VARYING': 'VARCHAR', 'VARCHAR2': 'VARCHAR', NVARCHAR: 'VARCHAR', NVARCHAR2: 'VARCHAR',
  CHARACTER: 'CHAR', NCHAR: 'CHAR', 'DOUBLE PRECISION': 'DOUBLE', FLOAT8: 'DOUBLE', FLOAT4: 'REAL', DATETIME: 'TIMESTAMP',
};
/** A column type without its length and in one spelling: "varchar(20)" → "VARCHAR". */
export function sqlTypeKey(type) {
  const base = String(type ?? '').trim().toUpperCase().replace(/\(.*$/, '').replace(/\s+/g, ' ').trim();
  return SQL_SYNONYMS[base] ?? base;
}

/** Every problem of the project: [{ rule, severity, id, message: { ko, en }, detail: { ko, en } }].
 * `index`: the project's current index when the caller keeps one (the background check), else built here. */
export function validate(project, { index = buildIndex(project) } = {}) {
  const out = [];
  const label = (element) => (element?.name ? `'${element.name}'` : '');
  const report = (ruleId, element, extra = { ko: '', en: '' }) => {
    const rule = RULE[ruleId];
    const what = (lang) => `${typeLabel(element?._type, lang)}${label(element) ? ` ${label(element)}` : ''}`;
    out.push({
      rule: ruleId, severity: rule.severity, id: element?._id ?? null,
      message: { ko: `${what('ko')}: ${rule.ko}${extra.ko ? ` (${extra.ko})` : ''}`, en: `${what('en')}: ${rule.en}${extra.en ? ` (${extra.en})` : ''}` },
      // The same without the element in front (the Problems panel shows the element in its own column).
      detail: { ko: `${rule.ko}${extra.ko ? ` (${extra.ko})` : ''}`, en: `${rule.en}${extra.en ? ` (${extra.en})` : ''}` },
    });
  };
  const exists = (value) => Boolean(index.get(value));

  const generalizations = [];
  const outgoing = new Map();
  // ERD: column → its entity, foreign key columns with a reference, relationships, duplicate entities reported.
  const columnOwner = new Map();
  const foreignKeys = [];
  const erdRelationships = [];
  const entityDuplicates = new Set();
  // Collected on the one walk (a large model is walked as few times as possible).
  const decisions = [];
  const diagrams = [];
  let requirements = false;
  walk(project, (element, parent) => {
    const type = element._type;
    if (type === 'UMLDecisionNode' || type === 'FCDecision') decisions.push(element);
    else if (type === 'SysMLRequirement') requirements = true;
    if (isDiagram(element)) diagrams.push(element);
    const def = typeDef(type);
    if (!def) return;
    // Names.
    if (needsName(type) && !String(element.name ?? '').trim()) report('name-missing', element);
    // Duplicate names among siblings of the same kind.
    // (Columns and entities have their own ERD rules below.)
    for (const key of ['ownedElements', 'attributes', 'operations', 'literals', 'participants', 'vertices']) {
      const list = element[key];
      if (!Array.isArray(list)) continue;
      const seen = new Map();
      for (const child of list) {
        const cd = typeDef(child._type);
        if (!child.name || !cd || cd.edge || cd.diagram || child._type === 'ERDEntity') continue;
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
      if (target && ((type === 'UMLInterfaceRealization' && !['UMLInterface', 'SysMLInterfaceBlock'].includes(target._type)) || (type === 'UMLRealization' && ['UMLClass', 'UMLDataType', 'UMLEnumeration', 'UMLPrimitiveType'].includes(target._type)))) {
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
    if (type === 'ERDEntity') {
      const columns = element.columns ?? [];
      if (!columns.length) report('entity-no-columns', element);
      else if (!columns.some((c) => c.primaryKey)) report('entity-no-primary-key', element);
      const seen = new Set();
      for (const column of columns) {
        columnOwner.set(column._id, element);
        const key = String(column.name ?? '').trim().toLowerCase();
        if (!key) continue;
        if (seen.has(key)) report('column-name-duplicate', column, { ko: element.name ?? '', en: element.name ?? '' }); else seen.add(key);
      }
    }
    if (type === 'ERDDataModel') {
      // Table names are unique in the whole data model (sub-packages included), case-insensitive like SQL.
      const seen = new Set();
      walk(element, (child) => {
        if (child._type !== 'ERDEntity') return;
        const key = String(child.name ?? '').trim().toLowerCase();
        if (!key) return;
        if (!seen.has(key)) { seen.add(key); return; }
        if (entityDuplicates.has(child._id)) return; // a data model inside another one: reported once
        entityDuplicates.add(child._id);
        report('entity-name-duplicate', child, { ko: element.name ?? '', en: element.name ?? '' });
      });
    }
    if (type === 'ERDColumn') {
      if (!String(element.type ?? '').trim()) report('column-type-missing', element, { ko: parent?.name ?? '', en: parent?.name ?? '' });
      if (element.foreignKey && !refId(element.referenceTo)) report('foreign-key-no-reference', element);
      if (element.foreignKey && refId(element.referenceTo)) foreignKeys.push(element);
    }
    if (type === 'ERDRelationship') erdRelationships.push(element);
    // Gantt charts and timelines: dates, durations, periods.
    for (const field of def.fields ?? []) {
      if (field.date && String(element[field.key] ?? '').trim() && parseDate(element[field.key]) === null) report('gantt-date-invalid', element, { ko: `${field.key} = ${element[field.key]}`, en: `${field.key} = ${element[field.key]}` });
    }
    if (type === 'GanttTask' && !(Number(element.duration) >= 1) && !parseDate(element.end)) report('gantt-duration-invalid', element);
    if ((type === 'GanttTask' || type === 'TLPeriod') && parseDate(element.start) !== null && parseDate(element.end) !== null && parseDate(element.end) < parseDate(element.start)) report('gantt-period-reversed', element, { ko: `${element.start} → ${element.end}`, en: `${element.start} → ${element.end}` });
    // Data views: JSON / YAML documents, EBNF rules and regular expressions must parse.
    if (type === 'DSDocument') { const parsed = parseData(element.format, element.text ?? ''); if (!parsed.ok) report('data-syntax-error', element, { ko: parsed.error, en: parsed.error }); }
    if (type === 'EBNFRule' || type === 'RegexPattern') { const parsed = railroadOf(type === 'RegexPattern' ? 'regex' : 'ebnf', type === 'RegexPattern' ? element.pattern : element.expression); if (!parsed.ok) report('data-syntax-error', element, { ko: parsed.error, en: parsed.error }); }
  });

  // ERD: a foreign key has the type of the column it references.
  for (const column of foreignKeys) {
    const target = index.get(refId(column.referenceTo));
    if (!target || target._type !== 'ERDColumn') continue;
    const a = sqlTypeKey(column.type);
    const b = sqlTypeKey(target.type);
    if (a && b && a !== b) {
      const where = `${columnOwner.get(target._id)?.name ?? ''}.${target.name ?? ''}`;
      report('foreign-key-type-mismatch', column, { ko: `${column.type} ≠ ${target.type} (${where})`, en: `${column.type} ≠ ${target.type} (${where})` });
    }
  }
  // ERD: entities joined by a relationship have a foreign key column between them (either direction).
  const linked = new Set();
  for (const column of foreignKeys) {
    const from = columnOwner.get(column._id);
    const to = columnOwner.get(refId(column.referenceTo));
    if (from && to) { linked.add(`${from._id}\u0000${to._id}`); linked.add(`${to._id}\u0000${from._id}`); }
  }
  for (const relationship of erdRelationships) {
    const a = index.get(refId(relationship.end1?.reference));
    const b = index.get(refId(relationship.end2?.reference));
    if (a?._type !== 'ERDEntity' || b?._type !== 'ERDEntity') continue;
    if (!linked.has(`${a._id}\u0000${b._id}`)) report('relationship-no-foreign-key', relationship, { ko: `${a.name ?? ''} — ${b.name ?? ''}`, en: `${a.name ?? ''} — ${b.name ?? ''}` });
  }

  // Decision nodes: outgoing flows.
  for (const element of decisions) {
    const flows = (outgoing.get(element._id) ?? []).filter((r) => /Flow$/.test(r._type));
    if (flows.length < 2) report('decision-few-outgoing', element, { ko: String(flows.length), en: String(flows.length) });
  }

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

  // Requirement coverage (approved, implemented and verified leaf requirements) and duplicate ids.
  for (const p of requirements ? coverageProblems(project) : []) {
    const element = index.get(p.id);
    const extra = p.rule === 'requirement-id-duplicate' ? { ko: `${p.reqId} = ${index.get(p.other)?.name ?? ''}`, en: `${p.reqId} = ${index.get(p.other)?.name ?? ''}` } : { ko: element?.id ?? '', en: element?.id ?? '' };
    report(p.rule, element, extra);
  }

  // Diagrams without views.
  for (const diagram of diagrams) if (!(diagram.ownedViews ?? []).length) report('diagram-empty', diagram);

  // Broken references anywhere (model and views, sub views included).
  const ids = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    if (value._id) ids.add(value._id);
    for (const [key, child] of Object.entries(value)) if (key !== '_parent' && child && typeof child === 'object') collect(child);
  };
  // The index knows almost every id; the whole tree is only searched when it does not.
  let collected = false;
  const known = (id) => index.byId?.has(id) || ((collected || (collect(project), collected = true)) && ids.has(id));
  const check = (value, holder, path) => {
    if (Array.isArray(value)) { value.forEach((item, i) => check(item, holder, `${path}[${i}]`)); return; }
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string' && Object.keys(value).length === 1) {
      if (!known(value.$ref)) report('broken-ref', holder, { ko: `${path} → ${value.$ref}`, en: `${path} → ${value.$ref}` });
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

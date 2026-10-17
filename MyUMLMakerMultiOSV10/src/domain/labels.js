// The text of model elements as UML shows it: "+ name: Type [0..*] = 1",
// "+ op(in a: int): bool {query}", "«stereotype»", "{abstract}", message
// signatures "1 : getName(id): String", transition labels "evt [guard] / do",
// and the reverse — reading "+name: Type = 1" typed in place (StarUML's quick
// edit) back into fields. Pure.
import { stereotypeName, refId } from './model.js';
import { typeDef } from './meta.js';

export const VISIBILITY_SYMBOL = { public: '+', protected: '#', private: '-', package: '~' };
const SYMBOL_VISIBILITY = { '+': 'public', '#': 'protected', '-': 'private', '~': 'package' };

/** Name of a type field: a string, or the name of the referenced classifier. */
export function typeName(value, index) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return index?.get(refId(value))?.name ?? '';
}

const multiplicityText = (m) => (m ? `[${m}]` : '');

/** Attribute (or port, part, slot-like) line. */
export function attributeText(attr, index, { visibility = true, type = true, multiplicity = true, property = true } = {}) {
  let text = '';
  if (visibility && attr.visibility) text += `${VISIBILITY_SYMBOL[attr.visibility] ?? ''}`;
  if (attr.isDerived) text += '/';
  text += attr.name ?? '';
  const t = typeName(attr.type, index);
  if (type && t) text += `: ${t}`;
  if (multiplicity && attr.multiplicity) text += multiplicityText(attr.multiplicity);
  if (attr.defaultValue !== undefined && attr.defaultValue !== '') text += ` = ${attr.defaultValue}`;
  if (property) {
    const props = [];
    if (attr.isReadOnly) props.push('readOnly');
    if (attr.isOrdered) props.push('ordered');
    if (attr.isUnique) props.push('unique');
    if (attr.isID) props.push('id');
    if (props.length) text += ` {${props.join(', ')}}`;
  }
  return text;
}

export const parameterList = (op) => (op.parameters ?? []).filter((p) => p.direction !== 'return');
export const returnParameter = (op) => (op.parameters ?? []).find((p) => p.direction === 'return') ?? null;

/** Operation line. */
export function operationText(op, index, { visibility = true, signature = true, property = true } = {}) {
  let text = '';
  if (visibility && op.visibility) text += VISIBILITY_SYMBOL[op.visibility] ?? '';
  text += op.name ?? '';
  if (signature) {
    const params = parameterList(op).map((p) => {
      const dir = p.direction && p.direction !== 'in' ? `${p.direction} ` : '';
      const t = typeName(p.type, index);
      return `${dir}${p.name ?? ''}${t ? `: ${t}` : ''}${p.multiplicity ? multiplicityText(p.multiplicity) : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`;
    });
    text += `(${params.join(', ')})`;
    const ret = returnParameter(op);
    const t = ret ? typeName(ret.type, index) : '';
    if (t) text += `: ${t}${ret.multiplicity ? multiplicityText(ret.multiplicity) : ''}`;
  } else text += '()';
  if (property) {
    const props = [];
    if (op.isQuery) props.push('query');
    if (op.concurrency && op.concurrency !== 'sequential') props.push(op.concurrency);
    if (props.length) text += ` {${props.join(', ')}}`;
  }
  return text;
}

export function literalText(lit) { return lit.name ?? ''; }
export function receptionText(r, index) { return `${VISIBILITY_SYMBOL[r.visibility] ?? ''}«signal» ${r.name ?? typeName(r.signal, index)}`; }
export function slotText(slot, index) {
  const feature = index?.get(refId(slot.definingFeature));
  return `${slot.name || feature?.name || ''} = ${slot.value ?? ''}`;
}
export function columnText(col, index) {
  const keys = [col.primaryKey ? 'PK' : '', col.foreignKey ? 'FK' : ''].filter(Boolean).join(',');
  const type = `${col.type ?? ''}${col.length ? `(${col.length})` : ''}`;
  return { keys, name: col.name ?? '', type, nullable: col.nullable, unique: col.unique, ref: col.referenceTo ? index?.get(refId(col.referenceTo))?.name ?? '' : '' };
}

/** «stereotype» (or «keyword» of the type: «interface», «enumeration» …). */
export function stereotypeText(element, index, { keyword = true } = {}) {
  const parts = [];
  const def = typeDef(element._type);
  if (keyword && def?.keyword) parts.push(def.keyword);
  const st = stereotypeName(element, index);
  if (st) parts.push(...st.split(',').map((s) => s.trim()).filter(Boolean));
  return parts.length ? `«${parts.join(', ')}»` : '';
}

/** {abstract}, {leaf} … below a classifier name. */
export function propertyText(element) {
  const props = [];
  if (element.isAbstract && typeDef(element._type)?.shape === 'classifier') { /* italics show it */ }
  if (element.isLeaf) props.push('leaf');
  if (element.isFinalSpecialization) props.push('final');
  if (element.isActive) props.push('active');
  for (const tag of element.tags ?? []) if (tag.kind !== 'hidden' && tag.name) props.push(tag.value !== '' && tag.value !== undefined ? `${tag.name}=${tag.value}` : tag.name);
  return props.length ? `{${props.join(', ')}}` : '';
}

/** Lifeline header "name: Type" ("name[selector]: Type"). */
export function lifelineText(lifeline, index) {
  const represent = index?.get(refId(lifeline.represent));
  const type = represent ? typeName(represent.type, index) || (represent._type !== 'UMLAttribute' ? represent.name : '') : '';
  const name = `${lifeline.name ?? ''}${lifeline.selector ? `[${lifeline.selector}]` : ''}`;
  if (type && type === name) return name;
  return type ? `${name}: ${type}` : name;
}

/** Message label: "1 : result = name(args)". signature: none | nameOnly | typeOnly | nameAndType. */
export function messageText(message, index, { number = null, signature = 'nameAndType' } = {}) {
  const op = index?.get(refId(message.signature));
  let body = message.name ?? '';
  if (op) {
    body = signature === 'none' ? op.name : signature === 'nameOnly' ? `${op.name}(${parameterList(op).map((p) => p.name).join(', ')})`
      : signature === 'typeOnly' ? `${op.name}(${parameterList(op).map((p) => typeName(p.type, index)).join(', ')})` : operationText(op, index, { visibility: false, property: false });
  }
  if (message.arguments && !op) body += `(${message.arguments})`;
  if (message.assignmentTarget) body = `${message.assignmentTarget} = ${body}`;
  if (message.guard) body = `[${message.guard}] ${body}`;
  return number !== null && number !== undefined ? `${number} : ${body}` : body;
}

/** Transition label "trigger [guard] / effect". */
export function transitionText(tr) {
  let text = tr.name ?? '';
  if (tr.triggers) text += (text ? ' ' : '') + tr.triggers;
  if (tr.guard) text += ` [${tr.guard}]`;
  if (tr.effect) text += ` / ${tr.effect}`;
  return text.trim();
}

/** Flow label "[guard]" plus name. */
export function flowText(flow) {
  const parts = [];
  if (flow.name) parts.push(flow.name);
  if (flow.guard) parts.push(`[${flow.guard}]`);
  if (flow.conditionExpression) parts.push(`[${flow.conditionExpression}]`);
  if (flow.weight) parts.push(`{weight=${flow.weight}}`);
  return parts.join(' ');
}

// ───────────────────────── quick edit (typing a member in place)

const TYPE_RE = /^\s*([+\-#~])?\s*(\/)?\s*([^:=[({]*?)\s*(?::\s*([^=[{]+?))?\s*(?:\[([^\]]*)\])?\s*(?:=\s*([^{]*?))?\s*(?:\{([^}]*)\})?\s*$/;

/** "+ name: Type [0..*] = 1 {readOnly}" → attribute fields. */
export function parseAttribute(text) {
  const m = TYPE_RE.exec(String(text ?? ''));
  if (!m || !m[3]) return null;
  const props = (m[7] ?? '').split(',').map((s) => s.trim());
  const out = { name: m[3].trim() };
  if (m[1]) out.visibility = SYMBOL_VISIBILITY[m[1]];
  if (m[2]) out.isDerived = true;
  if (m[4] !== undefined) out.type = m[4].trim();
  if (m[5] !== undefined) out.multiplicity = m[5].trim();
  if (m[6] !== undefined) out.defaultValue = m[6].trim();
  if (props.includes('readOnly')) out.isReadOnly = true;
  if (props.includes('ordered')) out.isOrdered = true;
  if (props.includes('unique')) out.isUnique = true;
  if (props.includes('id')) out.isID = true;
  return out;
}

/** "+ op(a: int, out b: String): bool {query}" → operation fields with parameters. */
export function parseOperation(text) {
  const m = /^\s*([+\-#~])?\s*([^(:\s]+)\s*(?:\(([^)]*)\))?\s*(?::\s*([^{]+?))?\s*(?:\{([^}]*)\})?\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const out = { name: m[2], parameters: [] };
  if (m[1]) out.visibility = SYMBOL_VISIBILITY[m[1]];
  for (const part of splitTop(m[3] ?? '')) {
    const p = /^\s*(in|out|inout)?\s*([^:=\s]+)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+?))?\s*$/.exec(part);
    if (!p) continue;
    out.parameters.push({ name: p[2], type: (p[3] ?? '').trim(), direction: p[1] ?? 'in', defaultValue: (p[4] ?? '').trim() });
  }
  if (m[4]) out.parameters.push({ name: '', type: m[4].trim(), direction: 'return' });
  const props = (m[5] ?? '').split(',').map((s) => s.trim());
  if (props.includes('query')) out.isQuery = true;
  if (props.includes('abstract')) out.isAbstract = true;
  return out;
}

/** Splits "a: Map<K, V>, b" at top-level commas. */
export function splitTop(text) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of String(text)) {
    if ('<([{'.includes(ch)) depth += 1;
    if ('>)]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { if (current.trim()) out.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** "Name «stereo»" or "«stereo» Name" typed as a name: splits the stereotype off. */
export function parseNameWithStereotype(text) {
  const m = /«([^»]*)»|<<([^>]*)>>/.exec(String(text ?? ''));
  if (!m) return { name: String(text ?? '').trim() };
  return { name: String(text).replace(m[0], '').trim(), stereotype: (m[1] ?? m[2]).trim() };
}

/** Valid multiplicity: "1", "0..1", "*", "1..*", "2..5", "" (unset). */
export const isMultiplicity = (text) => !text || /^\s*(\d+|\*)(\s*\.\.\s*(\d+|\*))?\s*$/.test(text);
export const MULTIPLICITIES = ['', '0..1', '1', '0..*', '1..*', '*'];

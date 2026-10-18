// The Editors panel under the Model Explorer: Properties (every field of the
// selected element from meta.js — names, visibility, types, multiplicities,
// references to other elements, association ends — plus its members:
// attributes, operations, parameters, literals, columns, operands …), Style
// (colours, font, line style and display options of the selected views),
// Documentation, and Tags & Constraints. Edits are sent to the app through
// data-* attributes (one undo step each).
import { CLASSIFIER_TYPES, fieldsOf, TYPE_TARGETS, typeDef, typeLabel, VISIBILITIES } from '../domain/meta.js';
import { displayName, elementsWhere, isDiagram, isEdgeView, isRelationship, projectStereotypes, qualifiedName, refId, relationshipEnds } from '../domain/model.js';
import { MULTIPLICITIES, operationText, attributeText } from '../domain/labels.js';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { backgroundControlsHtml } from './diagram-background.js';

export const PRIMITIVES = ['int', 'long', 'short', 'byte', 'float', 'double', 'boolean', 'char', 'String', 'void', 'Integer', 'Real', 'Boolean', 'UnlimitedNatural', 'Date', 'DateTime', 'List', 'Map', 'Set', 'Object'];
export const SQL_TYPES = ['INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'BOOLEAN', 'CHAR', 'VARCHAR', 'TEXT', 'DATE', 'TIME', 'TIMESTAMP', 'DATETIME', 'BLOB', 'UUID', 'JSON'];
const STANDARD_STEREOTYPES = ['entity', 'control', 'boundary', 'service', 'utility', 'auxiliary', 'focus', 'type', 'implementationClass', 'metaclass', 'create', 'destroy', 'import', 'access', 'merge', 'use', 'call', 'send', 'instantiate', 'trace', 'refine', 'derive', 'file', 'library', 'executable', 'document', 'script', 'source', 'table', 'view'];

/** Which elements a reference field may point at. */
const REF_TYPES = {
  classifier: CLASSIFIER_TYPES, reference: [...CLASSIFIER_TYPES, 'ERDEntity'], represent: ['UMLAttribute', 'UMLPart', 'UMLPort', 'SysMLPart'], signature: ['UMLOperation', 'UMLReception', 'UMLSignal'],
  refersTo: ['UMLInteraction'], submachine: ['UMLStateMachine'], signal: ['UMLSignal'], referenceTo: ['ERDColumn'], target: ['UMLOperation', 'UMLActivity', 'UMLStateMachine', 'UMLInteraction', 'UMLSignal'],
  processRef: ['BPMNProcess'], calledElement: ['BPMNProcess', 'UMLActivity'], represents: [...CLASSIFIER_TYPES, 'UMLAttribute'], definingFeature: ['UMLAttribute'], connector: ['UMLConnector'],
  attachedToRef: ['BPMNTask', 'BPMNSubProcess', 'BPMNCallActivity'], association: ['UMLAssociation'], type: [...TYPE_TARGETS, 'UMLCollaboration', 'SysMLConstraintBlock'], covered: ['UMLLifeline'], classSide: CLASSIFIER_TYPES,
};

/** Elements a reference field of `element` may point at. */
export function refCandidates(project, key, element) {
  const types = REF_TYPES[key] ?? null;
  return elementsWhere(project, (e) => e !== element && (types ? types.includes(e._type) : Boolean(e.name)) && !isDiagram(e));
}

const fieldLabel = (t, key) => { const text = t(`field.${key}`); return text === `field.${key}` ? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()) : text; };
const row = (label, control, { tall = false, title = label } = {}) => `<div class="prop-row ${tall ? 'tall' : ''}" title="${escapeHtml(title)}"><span class="prop-label"><span>${escapeHtml(label)}</span></span><span class="prop-control">${control}</span></div>`;
const section = (app, id, glyph, title, body, actions = '') => {
  const open = !app.state.collapsedEditors.has(id);
  return `<section class="prop-section ${open ? '' : 'collapsed'}" data-section="${id}"><header><button class="section-toggle" data-editor-toggle="${id}" aria-expanded="${open}">${icon(open ? 'caretDown' : 'caretRight', 'icon tiny')}${icon(glyph)}<span>${escapeHtml(title)}</span></button>${actions}</header>${open ? `<div class="props">${body}</div>` : ''}</section>`;
};

/** One field control. `target` is the element whose field it is. */
function fieldControl(app, project, element, field) {
  const t = app.t;
  const label = fieldLabel(t, field.key);
  const value = element[field.key];
  const attrs = `data-field="${field.key}" data-target="${element._id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"`;
  const index = app.tab().index;
  switch (field.type) {
    case 'bool': return `<label class="switch-wrap"><input type="checkbox" ${attrs} ${value ? 'checked' : ''} /><span class="switch" aria-hidden="true"></span></label>`;
    case 'enum': return `<select ${attrs}>${field.options.map((o) => `<option value="${escapeHtml(o)}" ${String(value ?? field.def ?? '') === o ? 'selected' : ''}>${escapeHtml(o === '' ? '—' : t(`enum.${o}`) === `enum.${o}` ? o : t(`enum.${o}`))}</option>`).join('')}</select>`;
    // The source text of a data view (JSON/YAML document, EBNF rule, regular expression) gets room and a fixed-width font.
    case 'text': return ['DSDocument', 'EBNFRule', 'RegexPattern'].includes(element._type) && field.key !== 'documentation'
      ? `<textarea ${attrs} rows="${element._type === 'DSDocument' ? 12 : 4}" spellcheck="false" wrap="off" style="font-family: Consolas, 'D2Coding', monospace; white-space: pre">${escapeHtml(value ?? '')}</textarea>`
      : `<textarea ${attrs} rows="3" spellcheck="false">${escapeHtml(value ?? '')}</textarea>`;
    case 'multiplicity': return `<input type="text" list="dl-multiplicity" ${attrs} value="${escapeHtml(value ?? '')}" spellcheck="false" />`;
    case 'stereotype': {
      const text = typeof value === 'object' && value ? index.get(refId(value))?.name ?? '' : value ?? '';
      return `<input type="text" list="dl-stereotypes" ${attrs} value="${escapeHtml(text)}" spellcheck="false" />`;
    }
    case 'type': {
      const text = value && typeof value === 'object' ? index.get(refId(value))?.name ?? '' : value ?? '';
      const linked = value && typeof value === 'object';
      return `<span class="type-field"><input type="text" list="${element._type === 'ERDColumn' ? 'dl-sqltypes' : 'dl-types'}" ${attrs} value="${escapeHtml(text)}" spellcheck="false" class="${linked ? 'linked' : ''}" />${linked ? `<button class="icon-button" data-goto="${refId(value)}" title="${escapeHtml(t('props.goTo'))}">${icon('goTo')}</button>` : ''}</span>`;
    }
    case 'ref': {
      if (field.key === 'source' || field.key === 'target') {
        if (isRelationship(element) || element._type === 'UMLMessage') {
          const [a, b] = relationshipEnds(element);
          const id = field.key === 'source' ? a : b;
          const other = index.get(id);
          return other ? `<button class="link-button" data-goto="${id}" title="${escapeHtml(qualifiedName(project, id, index))}">${icon(typeDef(other._type)?.icon ?? 'umlClass')}<span>${escapeHtml(displayName(other, app.language()))}</span></button>` : '—';
        }
      }
      const current = refId(value);
      const list = refCandidates(project, field.key, element).slice(0, 2000);
      return `<span class="type-field"><select ${attrs}><option value="">—</option>${list.map((e) => `<option value="${e._id}" ${e._id === current ? 'selected' : ''}>${escapeHtml(`${displayName(e, app.language())}  (${qualifiedName(project, e._id, index)})`)}</option>`).join('')}</select>${current ? `<button class="icon-button" data-goto="${current}" title="${escapeHtml(t('props.goTo'))}">${icon('goTo')}</button>` : ''}</span>`;
    }
    case 'refs': {
      const list = (Array.isArray(value) ? value : []).map((r) => index.get(refId(r))).filter(Boolean);
      return list.length ? list.map((e) => `<button class="link-button" data-goto="${e._id}">${escapeHtml(displayName(e, app.language()))}</button>`).join(' ') : '—';
    }
    case 'int': return `<input type="number" ${attrs} value="${escapeHtml(value ?? 0)}" />`;
    default: return field.date
      ? `<input type="text" ${attrs} value="${escapeHtml(value ?? '')}" placeholder="YYYY-MM-DD" pattern="\\d{4}-\\d{2}-\\d{2}" spellcheck="false" />`
      : `<input type="text" ${attrs} value="${escapeHtml(value ?? '')}" spellcheck="false" />`;
  }
}

/** Members (attributes, operations …) of an element as an editable list. */
const MEMBER_LISTS = [
  ['attributes', 'UMLAttribute', 'umlAttribute'], ['operations', 'UMLOperation', 'umlOperation'], ['receptions', 'UMLReception', 'umlReception'], ['literals', 'UMLEnumerationLiteral', 'umlLiteral'],
  ['parameters', 'UMLParameter', 'umlParameter'], ['templateParameters', 'UMLTemplateParameter', 'umlTemplateParam'], ['extensionPoints', 'UMLExtensionPoint', 'umlExtensionPoint'], ['slots', 'UMLSlot', 'umlSlot'],
  ['ports', 'UMLPort', 'umlPort'], ['parts', 'UMLPart', 'umlPart'], ['columns', 'ERDColumn', 'erdColumn'], ['operands', 'UMLInteractionOperand', 'umlOperand'], ['timeSegments', 'UMLTimeSegment', 'umlTimeSegment'],
  ['inputs', 'UMLInputPin', 'umlPin'], ['outputs', 'UMLOutputPin', 'umlPin'], ['regions', 'UMLRegion', 'umlRegion'],
];
function membersFor(element) {
  if (isDiagram(element)) return [];
  const def = typeDef(element._type);
  const keys = new Set(def?.compartments ?? []);
  if (element._type === 'UMLOperation') keys.add('parameters');
  if (['UMLClass', 'UMLInterface', 'UMLDataType'].includes(element._type)) keys.add('templateParameters');
  if (element._type === 'UMLCombinedFragment') keys.add('operands');
  if (element._type === 'UMLState' || element._type === 'UMLStateMachine') keys.add('regions');
  if (element._type === 'UMLAction') { keys.add('inputs'); keys.add('outputs'); }
  if (element._type === 'SysMLBlock') { keys.delete('references'); keys.delete('values'); }
  return MEMBER_LISTS.filter(([key, type]) => keys.has(key) && type !== 'SysMLReference');
}

function memberText(app, member) {
  const index = app.tab().index;
  if (member._type === 'UMLAttribute' || member._type === 'UMLPort' || member._type === 'UMLPart') return attributeText(member, index);
  if (member._type === 'UMLOperation') return operationText(member, index);
  if (member._type === 'ERDColumn') return `${member.primaryKey ? 'PK ' : ''}${member.foreignKey ? 'FK ' : ''}${member.name}: ${member.type}${member.length ? `(${member.length})` : ''}`;
  if (member._type === 'UMLParameter') return `${member.direction !== 'in' ? `${member.direction} ` : ''}${member.name}${member.type ? `: ${typeof member.type === 'string' ? member.type : index.get(refId(member.type))?.name ?? ''}` : ''}`;
  if (member._type === 'UMLInteractionOperand') return member.guard ? `[${member.guard}]` : member.name || '[ ]';
  if (member._type === 'UMLTimeSegment') return `${member.state || '?'} × ${member.duration ?? 0}`;
  return member.name ?? '';
}

function membersSection(app, element) {
  const t = app.t;
  let body = '';
  for (const [key, type, glyph] of membersFor(element)) {
    const list = element[key] ?? [];
    body += `<div class="member-list"><div class="member-head">${icon(glyph)}<span>${escapeHtml(t(`members.${key}`))}</span><span class="count">${list.length}</span>
      <button class="icon-button" data-member-add="${key}:${type}" data-owner="${element._id}" title="${escapeHtml(t('members.add', { what: typeLabel(type, app.language()) }))}">${icon('plus')}</button></div>
      ${list.map((m, i) => `<div class="member-row" data-member="${m._id}"><button class="member-name" data-goto="${m._id}" title="${escapeHtml(t('members.select'))}">${escapeHtml(memberText(app, m))}</button>
        <button class="icon-button" data-member-move="${m._id}:-1" ${i === 0 ? 'disabled' : ''} title="${escapeHtml(t('members.up'))}">${icon('arrowUp')}</button>
        <button class="icon-button" data-member-move="${m._id}:1" ${i === list.length - 1 ? 'disabled' : ''} title="${escapeHtml(t('members.down'))}">${icon('arrowDown')}</button>
        <button class="icon-button danger" data-member-delete="${m._id}" title="${escapeHtml(t('members.delete'))}">${icon('trash')}</button></div>`).join('')}</div>`;
  }
  return body;
}

export function propertiesHtml(app, element) {
  const t = app.t;
  const project = app.tab().project;
  const lang = app.language();
  let out = '';
  const def = typeDef(element._type);
  const title = element._type === 'Project' ? t('explorer.project') : typeLabel(element._type, lang);
  const qname = element._type === 'Project' ? '' : qualifiedName(project, element._id, app.tab().index);
  const fields = element._type === 'Project' ? [{ key: 'name', type: 'string' }, ...fieldsOf('Project').filter((f) => f.key !== 'name' && f.key !== 'stereotype')] : fieldsOf(element._type).filter((f) => f.key !== 'documentation' && !f.background);
  out += section(app, 'general', def?.icon ?? 'umlProject', title, `${qname ? row(t('props.qualifiedName'), `<span class="prop-value" title="${escapeHtml(qname)}">${escapeHtml(qname)}</span>`) : ''}${fields.map((f) => row(fieldLabel(t, f.key), fieldControl(app, project, element, f), { tall: f.type === 'text' })).join('')}`);
  for (const key of ['end1', 'end2']) {
    const end = element[key];
    if (!end || typeof end !== 'object') continue;
    const endFields = fieldsOf(end._type).filter((f) => f.key !== 'documentation' && f.key !== 'stereotype');
    out += section(app, key, 'umlAssociationEnd', t(`props.${key}`), endFields.map((f) => row(fieldLabel(t, f.key), fieldControl(app, project, end, f))).join(''));
  }
  const members = membersSection(app, element);
  if (members) out += section(app, 'members', 'umlAttribute', t('props.members'), members);
  if (element._type !== 'Project' && !def?.feature && !isDiagram(element)) {
    const views = app.viewsOfElement(element._id);
    out += section(app, 'usage', 'dgClass', t('props.usage'), views.length ? views.map(({ diagram }) => `<button class="link-button" data-open-diagram="${diagram._id}" data-reveal="${element._id}">${icon(typeDef(diagram._type)?.icon ?? 'dgClass')}<span>${escapeHtml(diagram.name)}</span></button>`).join('') : `<p class="panel-hint">${escapeHtml(t('props.noViews'))}</p>`);
  }
  return out;
}

export function diagramPropertiesHtml(app, diagram) {
  const t = app.t;
  const def = typeDef(diagram._type);
  const project = app.tab().project;
  void project;
  let body = '';
  const check = (key, on) => row(fieldLabel(t, key), `<label class="switch-wrap"><input type="checkbox" data-field="${key}" data-target="${diagram._id}" ${on ? 'checked' : ''} /><span class="switch" aria-hidden="true"></span></label>`);
  if (diagram._type === 'UMLSequenceDiagram' || diagram._type === 'UMLCommunicationDiagram') {
    body += check('showSequenceNumber', diagram.showSequenceNumber !== false);
    body += row(fieldLabel(t, 'messageSignature'), `<select data-field="messageSignature" data-target="${diagram._id}">${['none', 'nameOnly', 'typeOnly', 'nameAndType'].map((o) => `<option value="${o}" ${(diagram.messageSignature ?? 'nameAndType') === o ? 'selected' : ''}>${escapeHtml(t(`enum.${o}`))}</option>`).join('')}</select>`);
    if (diagram._type === 'UMLSequenceDiagram') body += check('showActivation', diagram.showActivation !== false);
  }
  const stats = (diagram.ownedViews ?? []).length;
  body += row(t('props.viewCount'), `<span class="prop-value">${stats}</span>`);
  void def;
  // The diagram's own background (one undo step per change; the popup has the same controls and a preview).
  const background = backgroundControlsHtml(diagram, { t, theme: app.settings().diagramTheme, row: (label, control, cls = '') => row(label, control, { tall: cls === 'tall' }) });
  const open = `<button class="icon-button" data-command="diagramBackground" title="${escapeHtml(t('action.diagramBackground'))}" aria-label="${escapeHtml(t('action.diagramBackground'))}">${icon('diagramBackground')}</button>`;
  return section(app, 'diagramOptions', 'gear', t('props.diagramOptions'), body)
    + section(app, 'diagramBackground', 'diagramBackground', t('bg.group'), `<div class="bg-controls" data-bg-target="${diagram._id}">${background}</div>`, open);
}

// ───────────────────────── style

const STYLE_FLAGS = {
  node: ['showShadow', 'autoResize', 'wordWrap', 'locked'],
  classifier: ['suppressAttributes', 'suppressOperations', 'suppressReceptions', 'suppressLiterals', 'showVisibility', 'showNamespace', 'showOperationSignature', 'showProperty', 'showType', 'showMultiplicity'],
  edge: ['showVisibility', 'showMultiplicity', 'showNonNavigable', 'locked'],
};
const STYLE_DEFAULT_ON = new Set(['showShadow', 'showVisibility', 'showOperationSignature', 'showProperty', 'showType', 'showMultiplicity']);
const FONT_SIZES = [0, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];

export function styleHtml(app, views) {
  const t = app.t;
  if (!views.length) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('style.none'))}</span></p>`;
  const first = views[0];
  const edges = views.every(isEdgeView);
  const nodes = views.every((v) => !isEdgeView(v));
  const same = (key) => views.every((v) => v[key] === first[key]);
  const color = (key) => `<span class="color-input"><button class="swatch big" data-style-color="${key}" style="--swatch:${escapeHtml(first[key] || 'transparent')}" title="${escapeHtml(t(`style.${key}`))}"></button><code>${escapeHtml(same(key) ? first[key] || t('style.default') : '…')}</code>${first[key] ? `<button class="icon-button" data-style-clear="${key}" title="${escapeHtml(t('style.reset'))}">${icon('close')}</button>` : ''}</span>`;
  const check = (key) => {
    const on = views.every((v) => (v[key] === undefined ? STYLE_DEFAULT_ON.has(key) : Boolean(v[key])));
    return row(t(`style.${key}`), `<label class="switch-wrap"><input type="checkbox" data-style="${key}" ${on ? 'checked' : ''} /><span class="switch" aria-hidden="true"></span></label>`);
  };
  let body = '';
  if (!edges) body += row(t('style.fillColor'), color('fillColor'));
  body += row(t('style.lineColor'), color('lineColor'));
  body += row(t('style.fontColor'), color('fontColor'));
  body += row(t('style.fontFace'), `<input type="text" list="dl-fonts" data-style="fontFace" value="${escapeHtml(same('fontFace') ? first.fontFace ?? '' : '')}" placeholder="${escapeHtml(t('style.default'))}" />`);
  body += row(t('style.fontSize'), `<select data-style="fontSize">${FONT_SIZES.map((s) => `<option value="${s}" ${(Number(first.fontSize) || 0) === s ? 'selected' : ''}>${s ? `${s} px` : escapeHtml(t('style.default'))}</option>`).join('')}</select>`);
  body += row(t('style.fontStyle'), `<span class="segmented small"><button class="segment ${views.every((v) => v.bold) ? 'active' : ''}" data-style-toggle="bold" title="${escapeHtml(t('action.bold'))}">${icon('bold')}</button><button class="segment ${views.every((v) => v.italic) ? 'active' : ''}" data-style-toggle="italic" title="${escapeHtml(t('action.italic'))}">${icon('italic')}</button></span>`);
  body += row(t('style.lineWidth'), `<select data-style="lineWidth">${[1, 1.5, 2, 3, 4].map((w) => `<option value="${w}" ${(Number(first.lineWidth) || 1) === w ? 'selected' : ''}>${w} px</option>`).join('')}</select>`);
  if (edges) body += row(t('style.lineStyle'), `<span class="segmented small">${['', 'rectilinear', 'oblique', 'roundRect', 'curve'].map((s) => `<button class="segment ${(first.lineStyle ?? '') === s && same('lineStyle') ? 'active' : ''}" data-style-set="lineStyle:${s}" title="${escapeHtml(t(`lineStyle.${s || 'default'}`))}">${icon(`line${s ? s[0].toUpperCase() + s.slice(1) : 'Default'}`)}</button>`).join('')}</span>`);
  if (nodes) {
    body += row(t('style.stereotypeDisplay'), `<select data-style="stereotypeDisplay">${['label', 'decoration', 'icon', 'none'].map((s) => `<option value="${s}" ${(first.stereotypeDisplay ?? 'label') === s ? 'selected' : ''}>${escapeHtml(t(`stereotypeDisplay.${s}`))}</option>`).join('')}</select>`);
    for (const key of STYLE_FLAGS.node) body += check(key);
    if (views.some((v) => typeDef(String(v._type).replace(/View$/, ''))?.compartments)) for (const key of STYLE_FLAGS.classifier) body += check(key);
  } else if (edges) for (const key of STYLE_FLAGS.edge) body += check(key);
  body += `<div class="prop-actions"><button class="button" data-style-action="reset">${icon('clearFormat')}<span>${escapeHtml(t('style.resetAll'))}</span></button><button class="button" data-style-action="fit">${icon('autoSize')}<span>${escapeHtml(t('style.fit'))}</span></button></div>`;
  return section(app, 'style', 'formatShape', t('style.title', { count: views.length }), body);
}

// ───────────────────────── documentation, tags and constraints

export function documentationHtml(app, element) {
  const t = app.t;
  if (!element) return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('doc.none'))}</span></p>`;
  return `<div class="doc-editor"><div class="doc-title">${icon(typeDef(element._type)?.icon ?? 'umlProject')}<span>${escapeHtml(displayName(element, app.language()))}</span></div>
    <textarea data-field="documentation" data-target="${element._id}" spellcheck="false" placeholder="${escapeHtml(t('doc.placeholder'))}">${escapeHtml(element.documentation ?? '')}</textarea>
    <p class="panel-hint">${escapeHtml(t('doc.hint'))}</p></div>`;
}

export function tagsHtml(app, element) {
  const t = app.t;
  if (!element || element._type === 'Project') return `<p class="panel-hint">${icon('info')}<span>${escapeHtml(t('tags.none'))}</span></p>`;
  const tags = element.tags ?? [];
  const rules = element.ownedRules ?? [];
  const tagRows = tags.map((tag) => `<div class="tag-row"><input type="text" data-tag-field="${tag._id}:name" value="${escapeHtml(tag.name)}" placeholder="${escapeHtml(t('tags.name'))}" />
    <select data-tag-field="${tag._id}:kind">${['string', 'boolean', 'number', 'reference', 'hidden'].map((k) => `<option value="${k}" ${tag.kind === k ? 'selected' : ''}>${escapeHtml(t(`tagKind.${k}`))}</option>`).join('')}</select>
    <input type="text" data-tag-field="${tag._id}:value" value="${escapeHtml(tag.value ?? '')}" placeholder="${escapeHtml(t('tags.value'))}" />
    <button class="icon-button danger" data-tag-delete="${tag._id}" title="${escapeHtml(t('tags.delete'))}">${icon('trash')}</button></div>`).join('');
  const ruleRows = rules.map((rule) => `<div class="tag-row"><input type="text" data-field="name" data-target="${rule._id}" value="${escapeHtml(rule.name ?? '')}" placeholder="${escapeHtml(t('tags.name'))}" />
    <input type="text" class="wide" data-field="specification" data-target="${rule._id}" value="${escapeHtml(rule.specification ?? '')}" placeholder="${escapeHtml(t('tags.specification'))}" />
    <button class="icon-button danger" data-member-delete="${rule._id}" title="${escapeHtml(t('tags.delete'))}">${icon('trash')}</button></div>`).join('');
  return section(app, 'tags', 'tag', t('tags.title'), `${tagRows || `<p class="panel-hint">${escapeHtml(t('tags.empty'))}</p>`}<button class="button" data-tag-add="${element._id}">${icon('plus')}<span>${escapeHtml(t('tags.add'))}</span></button>`)
    + section(app, 'constraints', 'umlConstraint', t('tags.constraints'), `${ruleRows || `<p class="panel-hint">${escapeHtml(t('tags.noConstraints'))}</p>`}<button class="button" data-member-add="ownedRules:UMLConstraint" data-owner="${element._id}">${icon('plus')}<span>${escapeHtml(t('tags.addConstraint'))}</span></button>`);
}

/** <datalist>s shared by the editors. */
export function datalistsHtml(app) {
  const tab = app.tab();
  const classifiers = tab ? elementsWhere(tab.project, (e) => TYPE_TARGETS.includes(e._type)).map((e) => e.name).filter(Boolean) : [];
  const stereotypes = tab ? projectStereotypes(tab.project).map((e) => e.name) : [];
  const list = (id, values) => `<datalist id="${id}">${[...new Set(values)].map((v) => `<option value="${escapeHtml(v)}"></option>`).join('')}</datalist>`;
  return list('dl-types', [...classifiers, ...PRIMITIVES]) + list('dl-sqltypes', SQL_TYPES) + list('dl-multiplicity', MULTIPLICITIES.filter(Boolean)) + list('dl-stereotypes', [...stereotypes, ...STANDARD_STEREOTYPES]) + list('dl-fonts', app.state.fonts ?? []) + list('dl-visibility', VISIBILITIES);
}

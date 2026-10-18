// StarUML compatibility: .mdj projects and .mfj model fragments, both ways.
// The model part of a .mdj file is our model (same type and field names), so
// it is kept as it is. Views differ: StarUML nests compartments and labels in
// `subViews`, writes points as "x:y;x:y", line styles and fonts as numbers and
// strings, and has its own view types for sequence/communication diagrams.
// Reading flattens that into our views (diagram.ownedViews, see model.js);
// writing builds the StarUML shape back with the minimal sub views StarUML
// needs to draw a view. Pure (no DOM).
import { TYPES, VIEW_ONLY } from '../meta.js';
import { buildIndex, cloneWithNewIds, newId, ref, refId, removeDeadViews } from '../model.js';

const fail = (code, detail) => Object.assign(new Error(code), { code, detail });
const clone = (value) => JSON.parse(JSON.stringify(value));
const isObj = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);

// ───────────────────────── tables

/** StarUML lineStyle numbers ↔ ours. */
export const LINE_STYLES = ['rectilinear', 'oblique', 'roundRect', 'curve'];

/** StarUML view types whose name is not "<model type>View" (null: dropped). */
export const VIEW_TYPE_MAP = {
  UMLSeqLifelineView: 'UMLLifelineView',
  UMLCommLifelineView: 'UMLLifelineView',
  UMLSeqMessageView: 'UMLMessageView',
  UMLCommMessageView: 'UMLMessageView',
  UMLUseCaseSubjectView: 'UMLUseCaseSubjectView',
  UMLFrameView: 'UMLFrameView',
  UMLCustomFrameView: 'UMLFrameView',
  UMLInteractionOperandView: null,
  UMLLinePartView: null,
  UMLActivationView: null,
  UMLContainmentView: null,
};

/** Sub views (labels, compartments) never become views of their own. */
const SUB_VIEW = /(^LabelView$|^EdgeLabelView$|^NodeLabelView$|CompartmentView$|^UMLAttributeView$|^UMLOperationView$|^UMLReceptionView$|^UMLEnumerationLiteralView$|^UMLTemplateParameterView$|^UMLExtensionPointView$|^UMLSlotView$|^ERDColumnView$|^UMLRegionView$)/;

/** StarUML internals that are not copied onto our views. */
const SKIP_FIELDS = new Set([
  '_type', '_id', '_parent', 'model', 'font', 'lineStyle', 'points', 'subViews', 'containedViews', 'containerView', 'tail', 'head', 'hostEdge',
  'visible', 'enabled', 'selectable', 'movable', 'sizable', 'parentStyle', 'containerChangeable', 'containerExtending', 'horizontalAlignment',
  'verticalAlignment', 'edgePosition', 'distance', 'alpha', 'minWidth', 'minHeight', 'underline', 'mainRoundRect',
]);

/** StarUML's default colours and font mean "use the theme" here. */
const DEFAULT_COLOR = { fillColor: '#ffffff', lineColor: '#000000', fontColor: '#000000' };
const DEFAULT_FONT = { face: 'Arial', size: 13 };

// ───────────────────────── small converters

/** "Arial;13;1" → { fontFace, fontSize, bold, italic } (StarUML defaults → empty). */
export function parseFont(font) {
  if (!font || typeof font !== 'string') return {};
  const [face = '', size = '', style = '0'] = font.split(';');
  const bits = num(style, 0);
  return {
    fontFace: face === DEFAULT_FONT.face ? '' : face,
    fontSize: num(size, 0) === DEFAULT_FONT.size ? 0 : num(size, 0),
    bold: Boolean(bits & 1),
    italic: Boolean(bits & 2),
  };
}

/** Our font fields → "Arial;13;0". */
export function fontString(view = {}) {
  return `${view.fontFace || DEFAULT_FONT.face};${view.fontSize || DEFAULT_FONT.size};${(view.bold ? 1 : 0) | (view.italic ? 2 : 0)}`;
}

/** "x:y;x:y" (or an array) → [{x,y}]. */
export function parsePoints(points) {
  if (Array.isArray(points)) return points.map((p) => ({ x: num(p?.x), y: num(p?.y) }));
  if (typeof points !== 'string' || !points.trim()) return [];
  return points.split(';').map((pair) => pair.split(':')).filter((p) => p.length >= 2).map(([x, y]) => ({ x: num(x), y: num(y) }));
}

export const pointsString = (points) => points.map((p) => `${Math.round(p.x)}:${Math.round(p.y)}`).join(';');

function lineStyleName(value) {
  if (typeof value === 'string') return LINE_STYLES.includes(value) ? value : /^\d$/.test(value) ? LINE_STYLES[Number(value)] ?? '' : '';
  return Number.isInteger(value) ? LINE_STYLES[value] ?? '' : '';
}
const lineStyleNumber = (name) => (LINE_STYLES.includes(name) ? LINE_STYLES.indexOf(name) : 1);

/** Every object with an _id anywhere below root (views and sub views included). */
function deepIndex(root) {
  const map = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isObj(value)) return;
    if (value._id) map.set(value._id, value);
    for (const [key, child] of Object.entries(value)) if (key !== '_parent' && child && typeof child === 'object') visit(child);
  };
  visit(root);
  return map;
}

/** Diagrams (elements with ownedViews) below root, without entering views. */
function diagramsIn(root) {
  const out = [];
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isObj(value) || !value._type) return;
    if (Array.isArray(value.ownedViews)) out.push(value);
    for (const [key, child] of Object.entries(value)) if (key !== '_parent' && key !== 'ownedViews' && child && typeof child === 'object') visit(child);
  };
  visit(root);
  return out;
}

/** Gives every model element an _id and a _parent pointing at its owner. */
function prepareModel(element, parent) {
  if (!element._id) element._id = newId();
  if (parent) element._parent = ref(parent); else delete element._parent;
  if (element._type === 'UMLAssociationEnd' && typeof element.navigable === 'boolean') element.navigable = element.navigable ? 'navigable' : 'unspecified';
  for (const [key, value] of Object.entries(element)) {
    if (key === '_parent' || key === 'ownedViews') continue;
    if (Array.isArray(value)) { for (const item of value) if (isObj(item) && item._type) prepareModel(item, element); } else if (isObj(value) && value._type) prepareModel(value, element);
  }
  return element;
}

// ───────────────────────── reading views

const LABEL_TEXT = (view, key) => {
  const label = (view.subViews ?? []).flatMap((s) => [s, ...(s.subViews ?? [])]).find((s) => s._id === refId(view[key]));
  return label?.text ?? '';
};

/** One StarUML top-level view → our view (tail/head not yet resolved), or null. */
function readView(view, diagram, all) {
  if (!isObj(view) || !view._type || view.visible === false || SUB_VIEW.test(view._type)) return null;
  const model = view.model ? all.get(refId(view.model)) ?? null : null;
  let type = Object.hasOwn(VIEW_TYPE_MAP, view._type) ? VIEW_TYPE_MAP[view._type] : undefined;
  // StarUML's containment lines have no model element; ours (a UMLContainment) are kept.
  if (type === null && view._type === 'UMLContainmentView' && model?._type === 'UMLContainment') type = view._type;
  if (type === null) return null;
  if (!type) {
    if (VIEW_ONLY[view._type]) type = view._type;
    else if (model?._type) type = `${model._type}View`;
    else return null;
  }
  const viewOnly = Boolean(VIEW_ONLY[type]);
  if (!viewOnly && (!model?._type || model._type === 'Project')) return null;
  const out = { _type: type, _id: view._id || newId(), _parent: ref(diagram) };
  if (!viewOnly) out.model = ref(model);
  for (const [key, value] of Object.entries(view)) {
    if (SKIP_FIELDS.has(key) || value === null || typeof value === 'object') continue;
    out[key] = value;
  }
  for (const [key, def] of Object.entries(DEFAULT_COLOR)) if (typeof out[key] === 'string' && out[key].toLowerCase() === def) out[key] = '';
  Object.assign(out, parseFont(view.font));
  const edge = Boolean(view.tail || view.head || view.hostEdge || VIEW_ONLY[type]?.edge || (model && TYPES[model._type]?.edge));
  if (edge) {
    const points = parsePoints(view.points);
    out.points = points.slice(1, -1);
    out.lineStyle = lineStyleName(view.lineStyle);
    out.tail = view.tail ? { $ref: refId(view.tail) } : null;
    out.head = view.head ? { $ref: refId(view.head) } : null;
    if (view.hostEdge) out.hostEdge = { $ref: refId(view.hostEdge) };
    if (type === 'UMLMessageView') {
      out.points = [];
      if (points.length) out.y = Math.round(points.reduce((sum, p) => sum + p.y, 0) / points.length);
    }
    delete out.left; delete out.top; delete out.width; delete out.height;
  } else {
    out.left = num(view.left); out.top = num(view.top); out.width = num(view.width); out.height = num(view.height);
    if (type === 'UMLFrameView') out.text = LABEL_TEXT(view, 'nameLabel') || model?.name || view.name || '';
  }
  if (view.lineStyle !== undefined && !edge) out.lineStyle = lineStyleName(view.lineStyle);
  return out;
}

/** A StarUML diagram's views → our flat ownedViews. */
function readViews(diagram, all) {
  const tops = [];
  const pushTop = (view) => {
    if (!isObj(view) || !view._type) return;
    tops.push(view);
    for (const child of view.containedViews ?? []) if (isObj(child) && child._type) pushTop(child);
  };
  (Array.isArray(diagram.ownedViews) ? diagram.ownedViews : []).forEach(pushTop);
  // Sub view id → the top-level view that holds it (messages end on a lifeline's line part).
  const topOf = new Map();
  const mark = (view, top) => {
    if (!isObj(view)) return;
    if (view._id) topOf.set(view._id, top._id);
    for (const sub of view.subViews ?? []) mark(sub, top);
  };
  for (const top of tops) mark(top, top);
  const out = [];
  for (const view of tops) { const read = readView(view, diagram, all); if (read) out.push(read); }
  const resolve = (value) => { const id = refId(value); return id ? topOf.get(id) ?? id : null; };
  for (const view of out) {
    if (view.hostEdge && !view.tail && !view.head) {
      // Communication message: drawn along a connector; becomes an edge between the connector's ends.
      const host = tops.find((t) => t._id === resolve(view.hostEdge));
      if (host) { view.tail = ref(resolve(host.tail)); view.head = ref(resolve(host.head)); }
      delete view.hostEdge;
    }
    if ('tail' in view || 'head' in view) {
      view.tail = ref(resolve(view.tail)) ?? { $ref: '' };
      view.head = ref(resolve(view.head)) ?? { $ref: '' };
    }
    if (view.hostEdge) view.hostEdge = ref(resolve(view.hostEdge));
  }
  const holder = { ownedViews: out };
  removeDeadViews(holder);
  return holder.ownedViews;
}

/**
 * Reads a StarUML .mdj project. Returns our project (model kept, views flattened).
 * Throws 'interop.notMdj' (detail: reason) when the text is not a StarUML project.
 */
export function importMdj(text) {
  let data;
  try { data = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : clone(text); } catch (error) { throw fail('interop.notMdj', error.message); }
  if (!isObj(data) || data._type !== 'Project') throw fail('interop.notMdj', `root _type is ${isObj(data) ? data._type : typeof data}`);
  if (!Array.isArray(data.ownedElements)) data.ownedElements = [];
  data.name ??= 'Untitled';
  prepareModel(data, null);
  const all = deepIndex(data);
  for (const diagram of diagramsIn(data)) diagram.ownedViews = readViews(diagram, all);
  return data;
}

// ───────────────────────── writing views

const CLASSIFIER_SHAPES = new Set(['classifier', 'component', 'artifact', 'actor', 'usecase', 'node3d', 'subsystem', 'collaboration']);
const ASSOCIATION_LIKE = new Set(['UMLAssociation', 'UMLLink', 'UMLConnector', 'UMLCommunicationPath', 'SysMLConnector']);

/** Size of a view for StarUML when ours is 0 (auto): a rough measure from the model. */
export function estimateSize(view, model) {
  const name = String(model?.name ?? view.text ?? '');
  const shape = model ? TYPES[model._type]?.shape : VIEW_ONLY[view._type]?.shape;
  const text = Math.max(60, name.length * 7 + 30);
  if (/pseudostate|initial|finalState|flowFinal/.test(shape ?? '')) return { w: 20, h: 20 };
  if (shape === 'bar') return { w: 80, h: 8 };
  if (shape === 'diamond') return { w: 30, h: 30 };
  if (shape === 'lifeline') return { w: Math.max(100, text), h: 300 };
  if (shape === 'actor') return { w: Math.max(40, text), h: 80 };
  if (shape === 'usecase') return { w: Math.max(120, text + 20), h: 50 };
  if (shape === 'classifier' || shape === 'entity') {
    const members = [...(model?.attributes ?? []), ...(model?.operations ?? []), ...(model?.literals ?? []), ...(model?.columns ?? [])];
    const widest = members.reduce((w, m) => Math.max(w, String(m.name ?? '').length * 7 + 80), text);
    return { w: Math.min(400, widest), h: 40 + 18 * members.length + 16 };
  }
  if (view._type === 'UMLNoteView' || view._type === 'UMLTextView') return { w: Math.max(100, Math.min(300, name.length * 7)), h: 50 };
  return { w: Math.max(100, text), h: 50 };
}

function boxOf(view, model) {
  const size = estimateSize(view, model);
  return { x: num(view.left), y: num(view.top), w: num(view.width) || size.w, h: num(view.height) || size.h };
}

/** Where the segment from the centre of b towards p leaves the box b. */
function boxExit(b, p) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity);
  return { x: cx + dx * Math.min(1, t), y: cy + dy * Math.min(1, t) };
}

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** A sub view (label or compartment) of a StarUML view. */
function sub(parent, type, extra = {}) {
  const view = { _type: type, _id: newId(), _parent: ref(parent._id), ...(parent.model ? { model: { ...parent.model } } : {}), visible: true, font: parent.font, left: 0, top: 0, width: 0, height: 0, ...extra };
  parent.subViews.push(view);
  return view;
}
const label = (parent, key, text = '', extra = {}) => { parent[key] = ref(sub(parent, 'LabelView', { horizontalAlignment: 2, text, ...extra })); };
const edgeLabel = (parent, key, position, extra = {}) => {
  parent[key] = ref(sub(parent, 'EdgeLabelView', { hostEdge: ref(parent._id), edgePosition: position, alpha: Math.PI / 2, distance: 15, ...extra }));
};

function nameCompartment(view, model) {
  const compartment = sub(view, 'UMLNameCompartmentView', { subViews: [] });
  label(compartment, 'stereotypeLabel', '', { visible: false });
  label(compartment, 'nameLabel', model?.name ?? '', { font: view.font.replace(/;(\d+)$/, (m, b) => `;${Number(b) | 1}`) });
  label(compartment, 'namespaceLabel', '', { visible: false });
  label(compartment, 'propertyLabel', '', { visible: false });
  view.nameCompartment = ref(compartment);
}

/** Adds the sub views StarUML expects on a node view. */
function nodeSubViews(view, model, diagram) {
  const shape = model ? TYPES[model._type]?.shape : null;
  const compartment = (key, type) => { view[key] = ref(sub(view, type, { subViews: [] })); };
  if (view._type === 'UMLFrameView') { label(view, 'nameLabel', diagram.name ?? ''); label(view, 'frameTypeLabel', ''); return; }
  if (!model) return;
  if (model._type === 'ERDEntity') { label(view, 'nameLabel', model.name ?? ''); compartment('columnCompartment', 'ERDColumnCompartmentView'); return; }
  if (/^FC/.test(model._type) || /^DFD/.test(model._type)) { label(view, 'nameLabel', model.name ?? ''); return; }
  nameCompartment(view, model);
  if (view._type === 'UMLSeqLifelineView') { view.linePart = ref(sub(view, 'UMLLinePartView')); return; }
  if (/^UML/.test(model._type) && CLASSIFIER_SHAPES.has(shape)) {
    if (model._type === 'UMLEnumeration') compartment('literalCompartment', 'UMLEnumerationLiteralCompartmentView');
    compartment('attributeCompartment', 'UMLAttributeCompartmentView');
    compartment('operationCompartment', 'UMLOperationCompartmentView');
    compartment('receptionCompartment', 'UMLReceptionCompartmentView');
    compartment('templateParameterCompartment', 'UMLTemplateParameterCompartmentView');
    if (model._type === 'UMLUseCase') compartment('extensionPointCompartment', 'UMLExtensionPointCompartmentView');
  }
  if (model._type === 'UMLState') compartment('decompositionCompartment', 'UMLDecompositionCompartmentView');
  if (model._type === 'UMLCombinedFragment') {
    label(view, 'frameTypeLabel', model.interactionOperator ?? 'alt');
    const operands = sub(view, 'UMLInteractionOperandCompartmentView', { subViews: [] });
    view.operandCompartment = ref(operands);
    for (const operand of model.operands ?? []) {
      const operandView = sub(operands, 'UMLInteractionOperandView', { model: ref(operand), subViews: [] });
      label(operandView, 'guardLabel', operand.guard ? `[${operand.guard}]` : '');
    }
  }
}

/** Adds the sub views StarUML expects on an edge view. */
function edgeSubViews(view, model) {
  if (!model) return;
  if (model._type === 'ERDRelationship') { edgeLabel(view, 'nameLabel', 1); edgeLabel(view, 'tailNameLabel', 0); edgeLabel(view, 'headNameLabel', 2); return; }
  edgeLabel(view, 'nameLabel', 1);
  edgeLabel(view, 'stereotypeLabel', 1, { alpha: Math.PI / 2, distance: 30 });
  edgeLabel(view, 'propertyLabel', 1, { alpha: -Math.PI / 2, distance: 15 });
  if (ASSOCIATION_LIKE.has(model._type)) {
    for (const [side, position] of [['tail', 0], ['head', 2]]) {
      edgeLabel(view, `${side}RoleNameLabel`, position, { alpha: Math.PI / 6, distance: 30 });
      edgeLabel(view, `${side}PropertyLabel`, position, { alpha: Math.PI / 4, distance: 40 });
      edgeLabel(view, `${side}MultiplicityLabel`, position, { alpha: -Math.PI / 6, distance: 25 });
      view[`${side}QualifiersCompartment`] = ref(sub(view, 'UMLQualifierCompartmentView', { subViews: [] }));
    }
  }
  if (view._type === 'UMLSeqMessageView') view.activation = ref(sub(view, 'UMLActivationView', { height: 30, width: 14 }));
}

const STYLE_FLAGS = ['showShadow', 'autoResize', 'stereotypeDisplay', 'suppressAttributes', 'suppressOperations', 'suppressReceptions', 'suppressLiterals', 'suppressColumns',
  'showVisibility', 'showNamespace', 'showOperationSignature', 'showProperty', 'showMultiplicity', 'showType', 'wordWrap', 'text', 'url'];

function styleOf(view) {
  const out = { font: fontString(view) };
  for (const [key, def] of Object.entries(DEFAULT_COLOR)) out[key] = view[key] || def;
  for (const key of STYLE_FLAGS) if (view[key] !== undefined && view[key] !== null) out[key] = view[key];
  return out;
}

/** Our flat views of a diagram → StarUML views. */
function writeViews(diagram, index) {
  const kind = diagram._type === 'UMLCommunicationDiagram' ? 'comm' : diagram._type === 'UMLSequenceDiagram' ? 'seq' : '';
  const views = Array.isArray(diagram.ownedViews) ? diagram.ownedViews : [];
  const written = new Map();
  const boxes = new Map();
  const isEdge = (v) => Boolean(v.tail || v.head);
  for (const view of views) {
    if (isEdge(view)) continue;
    const model = view.model ? index.get(view.model) : null;
    if (!model && !VIEW_ONLY[view._type]) continue;
    let type = view._type;
    if (type === 'UMLLifelineView') type = kind === 'comm' ? 'UMLCommLifelineView' : 'UMLSeqLifelineView';
    const box = boxOf(view, model);
    boxes.set(view._id, box);
    const star = { _type: type, _id: view._id, _parent: ref(diagram), ...(model ? { model: ref(model) } : {}), subViews: [], visible: true, ...styleOf(view), left: Math.round(box.x), top: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) };
    if (type === 'UMLFrameView') star.model = ref(diagram);
    if (view.lineStyle) star.lineStyle = lineStyleNumber(view.lineStyle);
    nodeSubViews(star, model, diagram);
    written.set(view._id, star);
  }
  // Edges (edges to edges need their target first: repeat until nothing more can be written).
  for (let progress = true; progress;) {
    progress = false;
    for (const view of views) {
      if (!isEdge(view) || written.has(view._id)) continue;
      const tail = written.get(refId(view.tail));
      const head = written.get(refId(view.head));
      if (!tail || !head) continue;
      const model = view.model ? index.get(view.model) : null;
      if (!model && !VIEW_ONLY[view._type]) { written.set(view._id, null); continue; }
      let type = view._type;
      let tailRef = ref(tail._id);
      let headRef = ref(head._id);
      const tailBox = boxes.get(tail._id);
      const headBox = boxes.get(head._id);
      let points;
      if (type === 'UMLMessageView') {
        if (kind === 'comm') { written.set(view._id, null); continue; }
        type = 'UMLSeqMessageView';
        if (tail.linePart) tailRef = { ...tail.linePart };
        if (head.linePart) headRef = { ...head.linePart };
        const y = num(view.y, (tailBox?.y ?? 0) + 80);
        const tx = tailBox ? tailBox.x + tailBox.w / 2 : 0;
        const hx = headBox ? headBox.x + headBox.w / 2 : 0;
        points = tail === head ? [{ x: tx, y }, { x: tx + 30, y }, { x: tx + 30, y: y + 20 }, { x: tx, y: y + 20 }] : [{ x: tx, y }, { x: hx, y }];
      } else {
        const bends = (view.points ?? []).map((p) => ({ x: num(p.x), y: num(p.y) }));
        const a = tailBox ?? { x: 0, y: 0, w: 0, h: 0 };
        const b = headBox ?? a;
        const first = bends[0] ?? center(b);
        const last = bends[bends.length - 1] ?? center(a);
        points = [tailBox ? boxExit(a, first) : first, ...bends, headBox ? boxExit(b, last) : last];
      }
      const star = { _type: type, _id: view._id, _parent: ref(diagram), ...(model ? { model: ref(model) } : {}), subViews: [], visible: true, ...styleOf(view), head: headRef, tail: tailRef, lineStyle: lineStyleNumber(view.lineStyle), points: pointsString(points) };
      edgeSubViews(star, model);
      written.set(view._id, star);
      progress = true;
    }
  }
  // Keep the z-order.
  return views.map((v) => written.get(v._id)).filter(Boolean);
}

/** Removes $refs that point at nothing (a _parent or field is dropped, arrays filtered). */
function pruneRefs(root, ids = deepIndex(root)) {
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i -= 1) {
        const item = value[i];
        if (isObj(item) && item.$ref !== undefined && Object.keys(item).length === 1 && !ids.has(item.$ref)) value.splice(i, 1); else visit(item);
      }
      return;
    }
    if (!isObj(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (isObj(child) && child.$ref !== undefined && Object.keys(child).length === 1) { if (!ids.has(child.$ref)) delete value[key]; } else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(root);
  return root;
}

/** Turns every diagram below root into StarUML views (root is a copy). */
function writeDiagrams(root, { pruneModel = true } = {}) {
  const index = buildIndex(root);
  const diagrams = diagramsIn(root);
  for (const diagram of diagrams) diagram.ownedViews = writeViews(diagram, index);
  if (pruneModel) return pruneRefs(root);
  // A fragment may point at elements outside it (types …): only views are cleaned.
  const ids = deepIndex(root);
  for (const diagram of diagrams) pruneRefs(diagram.ownedViews, ids);
  return root;
}

/** Our project → .mdj text StarUML can open. */
export function exportMdj(project) {
  if (!isObj(project) || project._type !== 'Project') throw fail('interop.notProject', isObj(project) ? project._type : typeof project);
  const copy = clone(project);
  delete copy._parent;
  delete copy.baselines; // MyUMLMaker baselines stay in the .myuml file
  return JSON.stringify(writeDiagrams(copy), null, '\t');
}

// ───────────────────────── fragments (.mfj)

/**
 * Reads a StarUML model fragment (one element and what it owns). Returns the
 * element with new ids (references inside the fragment remapped) and no
 * _parent: put it in place with insertElement(owner, element).
 * Throws 'interop.notFragment'.
 */
export function importFragment(text) {
  let data;
  try { data = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : clone(text); } catch (error) { throw fail('interop.notFragment', error.message); }
  if (!isObj(data) || typeof data._type !== 'string') throw fail('interop.notFragment', 'no _type');
  if (data._type === 'Project') throw fail('interop.notFragment', 'a project, not a fragment');
  prepareModel(data, null);
  const all = deepIndex(data);
  for (const diagram of diagramsIn(data)) diagram.ownedViews = readViews(diagram, all);
  const element = cloneWithNewIds([data]).items[0];
  delete element._parent;
  return element;
}

/** One element (and what it owns) → .mfj text. */
export function exportFragment(element) {
  if (!isObj(element) || !element._type) throw fail('interop.notElement', typeof element);
  const copy = clone(element);
  delete copy._parent;
  return JSON.stringify(writeDiagrams(copy, { pruneModel: false }), null, '\t');
}

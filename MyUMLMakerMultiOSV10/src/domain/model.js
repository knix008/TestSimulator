// The project model and every edit on it. A project is a tree of elements
// (StarUML's .mdj layout):
//   { _type: 'Project', _id, name, ownedElements: [ { _type: 'UMLModel', _id, _parent: { $ref }, name, ownedElements: [ … ] } ] }
// Children sit in typed collections (attributes, operations, literals,
// participants, messages, regions, vertices, nodes, edges, columns …, see
// meta.js). Other references are { $ref: id }. Diagrams are elements too;
// their views (ownedViews) refer to model elements by `model: { $ref }`, so one
// element can be shown on many diagrams (model ≠ view). Deleting an element
// removes its views everywhere and the relationships that need it.
//
// The functions change the project in place; the app runs each edit through
// ProjectDocument.apply() so that it is one undo step. Pure (no DOM).
import { CHILD_COLLECTIONS, collectionFor, fieldsOf, isDiagramType, TYPES, typeDef, typeLabel, UNNAMED, VIEW_ONLY, viewTypeOf } from './meta.js';

export const FORMAT = 'myumlmaker';
export const VERSION = 1;

let counter = 0;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** A new element id (StarUML style: base64-like, 24 characters). */
export function newId() {
  counter = (counter + 1) % 262144;
  const stamp = Date.now() * 262144 + counter;
  let text = '';
  let value = stamp;
  for (let i = 0; i < 9; i += 1) { text = ALPHABET[value % 64] + text; value = Math.floor(value / 64); }
  for (let i = 0; i < 15; i += 1) text += ALPHABET[Math.floor(Math.random() * 64)];
  return `AAAAAA${text}`.slice(0, 24);
}

export const ref = (target) => (target ? { $ref: typeof target === 'string' ? target : target._id } : null);
export const refId = (value) => (value && typeof value === 'object' ? value.$ref ?? null : typeof value === 'string' ? value : null);
const clone = (value) => JSON.parse(JSON.stringify(value));

// ───────────────────────── walking and lookup

/** Collections of an element that hold child elements, in order. */
export function childLists(element) {
  const out = [];
  for (const key of CHILD_COLLECTIONS) if (Array.isArray(element?.[key])) out.push([key, element[key]]);
  return out;
}

/** Direct children (association ends included). */
export function childrenOf(element, { views = false, ends = true } = {}) {
  const out = [];
  for (const [key, list] of childLists(element)) if (views || key !== 'ownedViews') out.push(...list);
  if (ends) for (const key of ['end1', 'end2']) if (element[key] && typeof element[key] === 'object' && element[key]._type) out.push(element[key]);
  return out;
}

/** Calls fn(element, parent) for every element below (and including) root. Views too when views=true. */
export function walk(root, fn, { views = false, parent = null } = {}) {
  if (!root) return;
  if (fn(root, parent) === false) return;
  for (const child of childrenOf(root, { views })) walk(child, fn, { views, parent: root });
}

/** id → element (and views), id → parent. Rebuilt by ProjectDocument after each change. */
export function buildIndex(project) {
  const byId = new Map();
  const parentOf = new Map();
  walk(project, (element, parent) => {
    if (element._id) {
      byId.set(element._id, element);
      if (parent) parentOf.set(element._id, parent);
    }
  }, { views: true });
  return { byId, parentOf, get: (id) => byId.get(refId(id)) ?? null, parent: (id) => parentOf.get(refId(id)) ?? null };
}

export const findById = (project, id) => {
  const want = refId(id);
  let found = null;
  walk(project, (element) => { if (element._id === want) { found = element; return false; } return !found; }, { views: true });
  return found;
};

/** The element's owner, or null. */
export function ownerOf(project, id, index = null) {
  if (index) return index.parent(id);
  const want = refId(id);
  let found = null;
  walk(project, (element, parent) => { if (element._id === want) { found = parent; return false; } return !found; }, { views: true });
  return found;
}

/** Owners from the project down to (not including) the element. */
export function ancestors(project, id, index = buildIndex(project)) {
  const out = [];
  let owner = index.parent(id);
  while (owner) { out.unshift(owner); owner = index.parent(owner._id); }
  return out;
}

/** "Model::Package::Class". */
export function qualifiedName(project, id, index = buildIndex(project)) {
  const element = index.get(id);
  if (!element) return '';
  const path = ancestors(project, id, index).filter((e) => e._type !== 'Project' && e.name).map((e) => e.name);
  return [...path, element.name ?? ''].join('::');
}

export const isDiagram = (element) => Boolean(element && isDiagramType(element._type));
export const isView = (element) => Boolean(element && /View$/.test(element._type ?? ''));
export const isEdgeView = (view) => Boolean(view && (view.tail || view.head));
export const isRelationship = (element) => Boolean(element && TYPES[element._type]?.edge);

/** Every diagram of the project, in tree order. */
export function allDiagrams(project) {
  const out = [];
  walk(project, (element) => { if (isDiagram(element)) out.push(element); });
  return out;
}

/** All elements of a type (or matching a test). */
export function elementsWhere(project, test) {
  const out = [];
  walk(project, (element) => { if (!isView(element) && element._type !== 'Project' && test(element)) out.push(element); });
  return out;
}

/** Display name of an element (a relationship without a name: "(Generalization)"). */
export function displayName(element, language = 'ko') {
  if (!element) return '';
  if (element.name) return element.name;
  return `(${typeLabel(element._type, language)})`;
}

// ───────────────────────── creating

/** Default values for a type's fields. */
function defaults(type) {
  const out = {};
  for (const field of fieldsOf(type)) {
    if (field.key === 'name' || field.key === 'documentation' || field.key === 'stereotype' || field.background) continue;
    if (field.def !== undefined) out[field.key] = field.def;
    else if (field.type === 'bool') out[field.key] = false;
    else if (field.type === 'enum') out[field.key] = field.options[0];
    else if (field.type === 'ref' || field.type === 'refs') { /* unset */ } else out[field.key] = '';
  }
  return out;
}

/** Base name for a new element: "Class", "Package", "Attribute" … */
export function baseNameFor(type, language = 'en') {
  const def = typeDef(type);
  if (!def) return 'Element';
  if (def.noName) return '';
  const label = language === 'ko' ? def.ko : def.en;
  return language === 'ko' ? label.replace(/\s|\(.*\)/g, '') : label.replace(/\s|\(.*\)|-/g, '');
}

/** The first "Base<n>" not yet used among siblings. */
export function uniqueName(siblings, base) {
  if (!base) return '';
  const used = new Set(siblings.map((s) => s.name));
  for (let n = 1; ; n += 1) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

/** A new element (not yet in the tree). */
export function createElement(type, attrs = {}, { language = 'en', siblings = [] } = {}) {
  const def = typeDef(type);
  const element = { _type: type, _id: newId(), name: '', ...defaults(type), ...clone(attrs) };
  if (attrs.name === undefined && def && !def.noName && !def.edge && !UNNAMED.has(type)) element.name = uniqueName(siblings, baseNameFor(type, language));
  if (def?.ends === 'association') {
    const endType = type === 'ERDRelationship' ? 'ERDRelationshipEnd' : 'UMLAssociationEnd';
    for (const key of ['end1', 'end2']) {
      element[key] = { _type: endType, _id: newId(), name: '', ...defaults(endType), ...(attrs[key] ?? {}) };
    }
  }
  if (isDiagram(element)) element.ownedViews ??= [];
  return element;
}

/** Links an element's (and its children's) _parent references. */
export function linkParents(element, parent = null) {
  if (parent) element._parent = ref(parent);
  for (const child of childrenOf(element, { views: true })) linkParents(child, element);
  return element;
}

/** Puts an element into an owner (right collection, parent links). Returns it. */
export function insertElement(owner, element, index = null) {
  let target = owner;
  let key = collectionFor(owner._type, element._type);
  // States and transitions live in a region: use (or make) the owner's first region.
  if (key === 'regions' && element._type !== 'UMLRegion') {
    owner.regions ??= [];
    if (!owner.regions.length) owner.regions.push(linkParents({ _type: 'UMLRegion', _id: newId(), name: '', vertices: [], transitions: [] }, owner));
    target = owner.regions[0];
    key = collectionFor('UMLRegion', element._type);
  }
  target[key] ??= [];
  const list = target[key];
  if (index === null || index < 0 || index > list.length) list.push(element);
  else list.splice(index, 0, element);
  linkParents(element, target);
  return element;
}

/** Siblings an element would get in an owner (for unique names). */
export function siblingsIn(owner, type) {
  const key = collectionFor(owner._type, type);
  if (key === 'regions') return owner.regions?.[0]?.[collectionFor('UMLRegion', type)] ?? [];
  return owner[key] ?? [];
}

/** Creates an element of `type` inside the element `ownerId`. */
export function addElement(project, ownerId, type, attrs = {}, { language = 'en', index = null } = {}) {
  const owner = findById(project, ownerId) ?? project;
  const element = createElement(type, attrs, { language, siblings: siblingsIn(owner, type) });
  numberRequirement(project, element);
  return insertElement(owner, element, index);
}

// ───────────────────────── requirement ids

/**
 * The next free requirement id: one more than the highest "REQ-<n>" in the
 * project, as wide as the widest such number (REQ-001 in a new project).
 */
export function nextRequirementId(project, prefix = 'REQ-') {
  let max = 0;
  let width = 3;
  let found = false;
  const used = new Set();
  walk(project, (e) => {
    if (e._type !== 'SysMLRequirement' || !e.id) return;
    const id = String(e.id).trim();
    used.add(id);
    if (!id.startsWith(prefix)) return;
    const digits = id.slice(prefix.length);
    if (!/^\d+$/.test(digits)) return;
    if (!found) { width = digits.length; found = true; } else width = Math.max(width, digits.length);
    max = Math.max(max, Number(digits));
  });
  for (let n = max + 1; ; n += 1) {
    const id = `${prefix}${String(n).padStart(width, '0')}`;
    if (!used.has(id)) return id;
  }
}

/** Gives a new requirement an id (when it has none) and the project's author. */
export function numberRequirement(project, element) {
  if (element?._type !== 'SysMLRequirement') return element;
  if (!String(element.id ?? '').trim()) element.id = nextRequirementId(project);
  if (!element.author && project?.author) element.author = project.author;
  return element;
}

/** A new project: one model with a class diagram (or the given diagram type). */
export function createProject({ name = 'Untitled', language = 'en', diagram = 'UMLClassDiagram', author = '' } = {}) {
  const project = { _type: 'Project', _id: newId(), name, author, company: '', copyright: '', version: '1.0', documentation: '', ownedElements: [] };
  const model = insertElement(project, createElement('UMLModel', { name: language === 'ko' ? '모델' : 'Model' }));
  if (diagram) addDiagram(project, model._id, diagram, { language, name: language === 'ko' ? '기본' : 'Main', defaultDiagram: true });
  return project;
}

/**
 * A new diagram under `ownerId`. A diagram that needs a behaviour owner
 * (sequence → interaction, statechart → state machine, activity, ER → data
 * model …) makes that owner first when the given one is not of that kind.
 */
export function addDiagram(project, ownerId, type, { language = 'en', name = null, defaultDiagram = false } = {}) {
  let owner = findById(project, ownerId) ?? project.ownedElements[0] ?? project;
  const needed = typeDef(type)?.owner;
  if (needed && owner._type !== needed) {
    if (needed === 'UMLInteraction') {
      if (owner._type !== 'UMLCollaboration') owner = addElement(project, owner._id, 'UMLCollaboration', {}, { language });
      owner = addElement(project, owner._id, 'UMLInteraction', {}, { language });
    } else owner = addElement(project, owner._id, needed, {}, { language });
  }
  const label = typeDef(type);
  const base = language === 'ko' ? label.ko.replace(/\s/g, '') : label.en.replace(/\s/g, '');
  const diagram = createElement(type, { name: name ?? uniqueName(siblingsIn(owner, type), base), defaultDiagram, ownedViews: [] }, { language });
  if (type === 'UMLSequenceDiagram') Object.assign(diagram, { showSequenceNumber: true, messageSignature: 'nameAndType', showActivation: true });
  return insertElement(owner, diagram);
}

// ───────────────────────── removing

/** Everything that points at `ids` (by $ref) and must go with them. */
function dependents(project, ids) {
  const out = new Set();
  const index = buildIndex(project);
  const gone = (value) => ids.has(refId(value));
  walk(project, (element) => {
    if (isView(element) || ids.has(element._id)) return;
    const def = typeDef(element._type);
    if (def?.ends === 'directed' && (gone(element.source) || gone(element.target))) out.add(element._id);
    if (def?.ends === 'association' && (gone(element.end1?.reference) || gone(element.end2?.reference))) out.add(element._id);
    if (def?.ends === 'link' && (gone(element.classSide) || gone(element.associationSide))) out.add(element._id);
  });
  // Children of removed elements are removed with them (no extra work), keep only top-level ones.
  return [...out].filter((id) => index.get(id));
}

/** Removes elements from the model (with their views everywhere and dependent relationships). */
export function removeElements(project, idList) {
  const ids = new Set(idList.map(refId).filter(Boolean));
  if (!ids.size) return 0;
  // Grow the set: relationships that lose an end, repeatedly (a relationship to a relationship).
  for (let more = dependents(project, ids); more.length; more = dependents(project, ids)) more.forEach((id) => ids.add(id));
  // Every id below a removed element is gone too (for views and references).
  const all = new Set();
  const index = buildIndex(project);
  for (const id of ids) { const element = index.get(id); if (element) walk(element, (e) => { if (e._id) all.add(e._id); }, { views: true }); }
  let removed = 0;
  const prune = (element) => {
    for (const [, list] of childLists(element)) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (ids.has(list[i]._id)) { list.splice(i, 1); removed += 1; } else prune(list[i]);
      }
    }
  };
  prune(project);
  // Views of removed elements, then edge views left without an end.
  for (const diagram of allDiagrams(project)) removeDeadViews(diagram, all);
  // References to removed elements become empty.
  walk(project, (element) => {
    for (const [key, value] of Object.entries(element)) {
      if (key === '_parent' || key === 'model' || key === 'tail' || key === 'head') continue;
      if (value && typeof value === 'object' && value.$ref && all.has(value.$ref)) delete element[key];
      if (Array.isArray(value) && value.some((v) => v?.$ref && all.has(v.$ref))) element[key] = value.filter((v) => !(v?.$ref && all.has(v.$ref)));
    }
  });
  return removed;
}

/** Drops views whose model is in `gone`, and edge views whose ends are gone. */
export function removeDeadViews(diagram, gone = new Set()) {
  const views = diagram.ownedViews ?? [];
  let changed = true;
  let count = 0;
  while (changed) {
    changed = false;
    const ids = new Set(views.map((v) => v._id));
    for (let i = views.length - 1; i >= 0; i -= 1) {
      const view = views[i];
      const dead = (view.model && gone.has(refId(view.model)))
        || (view.tail && !ids.has(refId(view.tail)))
        || (view.head && !ids.has(refId(view.head)))
        || (view.hostView && !ids.has(refId(view.hostView)));
      if (dead) { views.splice(i, 1); changed = true; count += 1; }
    }
  }
  return count;
}

// ───────────────────────── moving

/** Is `ancestorId` the element `id` itself or one of its owners? */
export function isWithin(project, id, ancestorId, index = buildIndex(project)) {
  for (let element = index.get(id); element; element = index.parent(element._id)) if (element._id === refId(ancestorId)) return true;
  return false;
}

/** Can an element of `type` be put in `owner`? (Model Explorer drag and drop.) */
export function canContain(owner, type) {
  if (!owner) return false;
  const def = typeDef(type);
  const ownerDef = typeDef(owner._type);
  const key = collectionFor(owner._type, type);
  if (owner._type === 'Project') return type === 'UMLModel' || type === 'UMLProfile' || /DataModel|Flowchart|DataFlowModel|BPMNProcess|C4Model|MMMindmap|WFWireframe|CloudModel|PMPlan|ArchiMateModel|NWModel|DSSpecification|UXModel/.test(type) || type === 'UMLPackage';
  if (def?.feature || key !== 'ownedElements') {
    if (key === 'attributes' || key === 'operations') return ['UMLClass', 'UMLInterface', 'UMLDataType', 'UMLPrimitiveType', 'UMLEnumeration', 'UMLSignal', 'UMLComponent', 'UMLActor', 'UMLArtifact', 'UMLUseCase', 'UMLStereotype', 'UMLCollaboration', 'UMLNode', 'UMLSubsystem', 'SysMLBlock', 'SysMLInterfaceBlock', 'SysMLValueType', 'SysMLConstraintBlock', 'UMLInformationItem', 'UMLDevice', 'UMLExecutionEnvironment'].includes(owner._type);
    if (key === 'literals') return owner._type === 'UMLEnumeration';
    if (key === 'parameters') return owner._type === 'UMLOperation' || owner._type === 'SysMLConstraintBlock';
    if (key === 'columns') return owner._type === 'ERDEntity';
    if (key === 'participants' || key === 'messages' || key === 'fragments') return owner._type === 'UMLInteraction';
    if (key === 'operands') return owner._type === 'UMLCombinedFragment';
    if (key === 'regions') return ['UMLStateMachine', 'UMLState', 'UMLRegion'].includes(owner._type);
    if (key === 'nodes' || key === 'edges' || key === 'groups') return owner._type === 'UMLActivity' || owner._type === 'UMLActivityPartition' || owner._type === 'UMLStructuredActivityNode' || owner._type === 'UMLExpansionRegion';
    if (key === 'slots') return /Object|Instance/.test(owner._type);
    if (key === 'ports' || key === 'parts') return /Class|Component|Block|Collaboration|Node/.test(owner._type);
    if (key === 'extensionPoints') return owner._type === 'UMLUseCase';
    if (key === 'inputs' || key === 'outputs') return owner._type === 'UMLAction';
    if (key === 'timeSegments') return owner._type === 'UMLTimingLifeline';
    if (key === 'receptions') return /Class|Interface/.test(owner._type);
    if (key === 'templateParameters') return /Class|Interface|Operation/.test(owner._type);
    if (key === 'ownedRules' || key === 'tags') return true;
    return false;
  }
  return Boolean(ownerDef?.namespace) || isDiagramType(type) || def?.edge;
}

/** Moves an element under another owner (Model Explorer drag and drop). */
export function moveElement(project, id, newOwnerId, index = null) {
  const idx = buildIndex(project);
  const element = idx.get(id);
  const owner = idx.get(newOwnerId);
  if (!element || !owner || isWithin(project, newOwnerId, id, idx) || !canContain(owner, element._type)) return false;
  const old = idx.parent(id);
  for (const [, list] of childLists(old)) {
    const at = list.indexOf(element);
    if (at >= 0) { list.splice(at, 1); break; }
  }
  insertElement(owner, element, index);
  return true;
}

/** Moves an element up or down among its siblings. */
export function reorderElement(project, id, direction) {
  const idx = buildIndex(project);
  const element = idx.get(id);
  const owner = idx.parent(id);
  if (!element || !owner) return false;
  for (const [, list] of childLists(owner)) {
    const at = list.indexOf(element);
    if (at < 0) continue;
    const to = at + direction;
    if (to < 0 || to >= list.length) return false;
    list.splice(at, 1);
    list.splice(to, 0, element);
    return true;
  }
  return false;
}

// ───────────────────────── relationships

/** Ends of a relationship element as element ids [from, to]. */
export function relationshipEnds(element) {
  const def = typeDef(element?._type);
  if (!def?.edge) return [null, null];
  if (def.ends === 'association') return [refId(element.end1?.reference), refId(element.end2?.reference)];
  if (def.ends === 'link') return [refId(element.classSide), refId(element.associationSide)];
  return [refId(element.source), refId(element.target)];
}

/** Sets the ends of a relationship element. */
export function setRelationshipEnds(element, fromId, toId) {
  const def = typeDef(element._type);
  if (def.ends === 'association') { element.end1.reference = ref(fromId); element.end2.reference = ref(toId); } else if (def.ends === 'link') { element.classSide = ref(fromId); element.associationSide = ref(toId); } else { element.source = ref(fromId); element.target = ref(toId); }
}

/** Relationships that touch an element. */
export function relationshipsOf(project, id) {
  const want = refId(id);
  return elementsWhere(project, (e) => isRelationship(e) && relationshipEnds(e).includes(want));
}

/**
 * Where a new relationship between two elements is kept: StarUML keeps it in
 * the source element when that is a namespace, else in the source's owner.
 */
export function relationshipOwner(project, type, fromId, index = buildIndex(project)) {
  const from = index.get(fromId);
  if (!from) return project.ownedElements[0];
  if (type === 'UMLMessage' || type === 'UMLTransition' || /Flow$|ExceptionHandler/.test(type)) {
    // Messages in the interaction, transitions in the region, flows in the activity.
    let owner = index.parent(from._id);
    const want = type === 'UMLMessage' ? 'UMLInteraction' : type === 'UMLTransition' ? 'UMLRegion' : 'UMLActivity';
    while (owner && owner._type !== want && owner._type !== 'Project') owner = index.parent(owner._id);
    if (owner && owner._type === want) return owner;
  }
  if (typeDef(from._type)?.namespace && canContain(from, type)) return from;
  let owner = index.parent(from._id);
  while (owner && !canContain(owner, type)) owner = index.parent(owner._id);
  return owner ?? project.ownedElements[0];
}

// ───────────────────────── views

export const viewsOf = (diagram) => diagram?.ownedViews ?? [];
export const findView = (diagram, id) => viewsOf(diagram).find((v) => v._id === refId(id)) ?? null;
/** Views of an element on a diagram. */
export const viewsOfModel = (diagram, modelId) => viewsOf(diagram).filter((v) => refId(v.model) === refId(modelId));

/** Every (diagram, view) showing an element. */
export function viewsEverywhere(project, modelId) {
  const out = [];
  for (const diagram of allDiagrams(project)) for (const view of viewsOfModel(diagram, modelId)) out.push({ diagram, view });
  return out;
}

/** Style defaults of a new view. */
export const VIEW_STYLE_DEFAULTS = {
  fillColor: '', lineColor: '', fontColor: '', fontFace: '', fontSize: 0, bold: false, italic: false,
  showShadow: true, autoResize: true, stereotypeDisplay: 'label',
  suppressAttributes: false, suppressOperations: false, suppressReceptions: true, suppressLiterals: false, suppressColumns: false,
  showVisibility: true, showNamespace: false, showOperationSignature: true, showProperty: true, showMultiplicity: true, showType: true,
  wordWrap: false, lineStyle: '',
};

/** A new node view of an element (or an annotation view when modelId is null). */
export function createNodeView(viewType, modelId, box, extra = {}) {
  return {
    _type: viewType, _id: newId(), ...(modelId ? { model: ref(modelId) } : {}),
    left: Math.round(box.x), top: Math.round(box.y), width: Math.round(box.w ?? 0), height: Math.round(box.h ?? 0), ...extra,
  };
}

/** A new edge view between two views. */
export function createEdgeView(viewType, modelId, tailId, headId, extra = {}) {
  return { _type: viewType, _id: newId(), ...(modelId ? { model: ref(modelId) } : {}), tail: ref(tailId), head: ref(headId), points: [], lineStyle: '', ...extra };
}

/** Adds a view to a diagram (on top). */
export function addView(diagram, view, { back = false } = {}) {
  diagram.ownedViews ??= [];
  if (back) diagram.ownedViews.unshift(view); else diagram.ownedViews.push(view);
  view._parent = ref(diagram);
  return view;
}

/** Removes views from a diagram only (the model stays). Edge views left without an end go too. */
export function removeViews(diagram, ids) {
  const set = new Set(ids.map(refId));
  diagram.ownedViews = viewsOf(diagram).filter((v) => !set.has(v._id));
  return removeDeadViews(diagram) + set.size;
}

/** Shows an element on a diagram (StarUML: drag from the Model Explorer). Returns the view. */
export function showElement(project, diagram, modelId, at, size = {}) {
  const element = findById(project, modelId);
  if (!element) return null;
  const view = createNodeView(viewTypeOf(element._type), element._id, { x: at.x, y: at.y, w: size.w ?? 0, h: size.h ?? 0 });
  return addView(diagram, view);
}

/** Edge views for relationships between elements that are on the diagram but whose line is not. */
export function addMissingEdgeViews(project, diagram) {
  const added = [];
  const shown = new Map();
  for (const view of viewsOf(diagram)) if (view.model && !isEdgeView(view)) { const id = refId(view.model); if (!shown.has(id)) shown.set(id, view); }
  const drawn = new Set(viewsOf(diagram).filter(isEdgeView).map((v) => refId(v.model)).filter(Boolean));
  walk(project, (element) => {
    if (!isRelationship(element) || drawn.has(element._id) || element._type === 'UMLMessage') return;
    const [a, b] = relationshipEnds(element);
    if (shown.has(a) && shown.has(b)) added.push(addView(diagram, createEdgeView(viewTypeOf(element._type), element._id, shown.get(a)._id, shown.get(b)._id)));
  });
  return added;
}

/** Elements that have no view on any diagram (Model › Unused elements). */
export function elementsWithoutViews(project) {
  const shown = new Set();
  for (const diagram of allDiagrams(project)) for (const view of viewsOf(diagram)) if (view.model) shown.add(refId(view.model));
  return elementsWhere(project, (e) => !isDiagram(e) && !typeDef(e._type)?.feature && !['UMLRegion', 'UMLAssociationEnd', 'ERDRelationshipEnd', 'UMLInteractionOperand', 'UMLTag', 'UMLInteraction', 'UMLStateMachine', 'UMLActivity', 'UMLCollaboration'].includes(e._type) && typeDef(e._type)?.group !== 'package' && !shown.has(e._id));
}

// ───────────────────────── tags, stereotypes, constraints

export function setTag(element, name, value, kind = 'string') {
  element.tags ??= [];
  const tag = element.tags.find((t) => t.name === name);
  if (tag) { tag.value = value; tag.kind = kind; return tag; }
  const created = { _type: 'UMLTag', _id: newId(), _parent: ref(element), name, kind, value };
  element.tags.push(created);
  return created;
}

/** The stereotype text of an element (a string, or the name of a referenced UMLStereotype). */
export function stereotypeName(element, index = null) {
  const value = element?.stereotype;
  if (!value) return '';
  if (typeof value === 'string') return value;
  return index?.get(value)?.name ?? '';
}

/** Every stereotype defined in the project's profiles. */
export function projectStereotypes(project) {
  return elementsWhere(project, (e) => e._type === 'UMLStereotype');
}

// ───────────────────────── copy and paste

/** Deep copy of elements with new ids; references between them are remapped. */
export function cloneWithNewIds(items) {
  const map = new Map();
  const copy = clone(items);
  const assign = (element) => {
    if (element && typeof element === 'object') {
      if (element._id) { const id = newId(); map.set(element._id, id); element._id = id; }
      for (const value of Object.values(element)) if (value && typeof value === 'object') assign(value);
    }
  };
  copy.forEach(assign);
  const remap = (element) => {
    if (Array.isArray(element)) { element.forEach(remap); return; }
    if (!element || typeof element !== 'object') return;
    if (element.$ref && map.has(element.$ref)) element.$ref = map.get(element.$ref);
    for (const [key, value] of Object.entries(element)) if (key !== '$ref' && value && typeof value === 'object') remap(value);
  };
  remap(copy);
  return { items: copy, map };
}

// ───────────────────────── find

/** Elements whose name, documentation or type matches a text. */
export function findElements(project, query, { matchCase = false, whole = false, documentation = true, types = null, language = 'ko' } = {}) {
  const text = String(query ?? '').trim();
  if (!text) return [];
  const norm = (s) => (matchCase ? String(s ?? '') : String(s ?? '').toLowerCase());
  const want = norm(text);
  const hit = (s) => { const v = norm(s); return whole ? v === want || new RegExp(`\\b${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(v) : v.includes(want); };
  return elementsWhere(project, (e) => (!types || types.includes(e._type)) && (hit(e.name) || (documentation && hit(e.documentation)) || hit(typeLabel(e._type, language)) || (e.type && typeof e.type === 'string' && hit(e.type))
    || (e._type === 'SysMLRequirement' && (hit(e.id) || hit(e.text)))));
}

// ───────────────────────── statistics

export function statistics(project) {
  const byType = {};
  let elements = 0;
  let views = 0;
  walk(project, (element) => {
    if (isView(element)) { views += 1; return; }
    if (element._type === 'Project') return;
    elements += 1;
    byType[element._type] = (byType[element._type] ?? 0) + 1;
  }, { views: true });
  return { elements, views, diagrams: allDiagrams(project).length, byType };
}

export { VIEW_ONLY };

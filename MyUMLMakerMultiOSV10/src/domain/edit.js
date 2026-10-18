// Edits on diagrams that touch both the model and the views: creating an
// element with its view from a toolbox tool (in the right owner — the
// namespace a view is dropped into, the interaction of a sequence diagram,
// the region of a state machine, the activity …), drawing a relationship
// between two views, showing existing elements, quick-adding related classes
// (StarUML's "Add Subclass / Superclass / Associated Class …"), moving views,
// arranging them (align, distribute, same size), and reparenting an element
// when its view is dropped into a package. Pure (no DOM).
import {
  addElement, addView, buildIndex, canContain, createEdgeView, createElement, createNodeView, findView, insertElement, isEdgeView, isWithin, moveElement, numberRequirement, ref, refId,
  relationshipOwner, setRelationshipEnds, siblingsIn, uniqueName, viewsOf,
} from './model.js';
import { collectionFor, typeDef, viewTypeOf, VIEW_ONLY } from './meta.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const inside = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** The model owner of a diagram (the namespace or behaviour it lives in). */
export function diagramOwner(project, diagram, index = buildIndex(project)) {
  return index.parent(diagram._id) ?? project.ownedElements[0] ?? project;
}

/** The interaction of a sequence/communication/timing diagram. */
function interactionOf(project, diagram, index) {
  let owner = diagramOwner(project, diagram, index);
  if (owner._type === 'UMLInteraction') return owner;
  // A diagram somewhere else: make an interaction for it under its owner.
  if (owner._type !== 'UMLCollaboration') owner = addElement(project, owner._id, 'UMLCollaboration');
  return addElement(project, owner._id, 'UMLInteraction');
}

/**
 * Where a new element of `type` goes when created on `diagram` at point `p`.
 * boxes: view id → box (from the renderer). Returns the owner element.
 */
export function ownerForNew(project, diagram, type, p, boxes, index = buildIndex(project)) {
  const def = typeDef(type);
  const diagramType = diagram._type;
  if (['UMLLifeline', 'UMLTimingLifeline', 'UMLCombinedFragment', 'UMLInteractionUse', 'UMLStateInvariant', 'UMLContinuation', 'UMLEndpoint', 'UMLGate', 'UMLDurationConstraint', 'UMLTimeConstraint', 'UMLTimeTick'].includes(type)
    && /Sequence|Communication|Timing/.test(diagramType)) return interactionOf(project, diagram, index);
  // The innermost view under the point whose element can hold the new one.
  const candidates = viewsOf(diagram).filter((v) => !isEdgeView(v) && v.model && boxes.get(v._id) && inside(boxes.get(v._id), p));
  candidates.sort((a, b) => boxes.get(a._id).w * boxes.get(a._id).h - boxes.get(b._id).w * boxes.get(b._id).h);
  for (const view of candidates) {
    const element = index.get(refId(view.model));
    if (!element) continue;
    if (def?.feature || ['UMLPort', 'UMLPart', 'SysMLPart', 'SysMLPort', 'UMLInputPin', 'UMLOutputPin', 'SysMLConstraintProperty', 'SysMLConstraintParameter'].includes(type)) {
      if (canContain(element, type)) return element;
      continue;
    }
    if (element._type === 'UMLState' && /UMLState|UMLPseudostate|UMLFinalState|UMLSubmachineState/.test(type)) return element;
    if (element._type === 'UMLActivityPartition' || element._type === 'UMLStructuredActivityNode' || element._type === 'UMLExpansionRegion') {
      if (/^UML(Action|InitialNode|ActivityFinalNode|FlowFinalNode|ForkNode|JoinNode|DecisionNode|MergeNode|ObjectNode|CentralBufferNode|DataStoreNode)$/.test(type)) return diagramOwner(project, diagram, index);
    }
    if ((element._type === 'MMNode' && type === 'MMNode') || (element._type === 'WBSNode' && type === 'WBSNode')) return element;
    if (typeDef(element._type)?.namespace && canContain(element, type) && !['UMLInteraction', 'UMLStateMachine', 'UMLActivity'].includes(element._type)) return element;
  }
  const owner = diagramOwner(project, diagram, index);
  if (/^UML(State|SubmachineState|Pseudostate|FinalState)$/.test(type) && owner._type !== 'UMLStateMachine') return addElement(project, owner._id, 'UMLStateMachine');
  if (canContain(owner, type)) return owner;
  // Features dropped on empty canvas: put them in a class-less place is not possible — the caller gets null.
  if (def?.feature) return null;
  let up = owner;
  while (up && !canContain(up, type)) up = index.parent(up._id);
  return up ?? project.ownedElements[0];
}

/**
 * Creates the element of a node tool with its view at `box` (x, y, w, h; w/h 0 = fit).
 * Returns { element, view } (element null for annotations).
 */
export function createNode(project, diagram, tool, box, { language = 'en', boxes = new Map() } = {}) {
  const index = buildIndex(project);
  const viewExtra = clone(tool.view ?? {});
  if (VIEW_ONLY[tool.type]) {
    const view = addView(diagram, createNodeView(tool.type, null, box, { text: VIEW_ONLY[tool.type].ko && tool.type === 'UMLNoteView' ? '' : '', ...viewExtra }), { back: Boolean(VIEW_ONLY[tool.type].container) });
    return { element: null, view };
  }
  const point = { x: box.x + 2, y: box.y + 2 };
  const owner = ownerForNew(project, diagram, tool.type, point, boxes, index);
  if (!owner) return { element: null, view: null };
  const attrs = clone(tool.attrs ?? {});
  const actor = attrs.actor;
  delete attrs.actor;
  if (tool.type === 'UMLState' && tool.id === 'compositeState') attrs.regions = [];
  const element = createElement(tool.type, attrs, { language, siblings: siblingsIn(owner, tool.type) });
  numberRequirement(project, element);
  insertElement(owner, element);
  if (tool.type === 'UMLState' && tool.id === 'compositeState') insertElement(element, createElement('UMLRegion', {}, { language }));
  // A lifeline represents a property of the collaboration (typed by an actor for an actor lifeline).
  if ((tool.type === 'UMLLifeline' || tool.type === 'UMLTimingLifeline') && owner._type === 'UMLInteraction') {
    const collaboration = index.parent(owner._id) ?? owner;
    let type = '';
    if (actor) {
      const model = project.ownedElements[0];
      const existing = (model.ownedElements ?? []).find((e) => e._type === 'UMLActor' && e.name && e.name === element.name);
      type = ref(existing ?? addElement(project, model._id, 'UMLActor', { name: element.name }, { language }));
    }
    const role = insertElement(collaboration._type === 'UMLCollaboration' ? collaboration : owner, createElement('UMLAttribute', { name: element.name, type }, { language }));
    element.represent = ref(role);
  }
  if (tool.type === 'UMLCombinedFragment') {
    insertElement(element, createElement('UMLInteractionOperand', { guard: element.interactionOperator === 'alt' ? '' : '' }, { language }));
    if (element.interactionOperator === 'alt' || element.interactionOperator === 'par') insertElement(element, createElement('UMLInteractionOperand', { guard: element.interactionOperator === 'alt' ? 'else' : '' }, { language }));
  }
  if (tool.type === 'ERDEntity' && !(element.columns ?? []).length) {
    insertElement(element, createElement('ERDColumn', { name: 'id', type: 'INTEGER', primaryKey: true }, { language }));
  }
  const size = tool.size ?? {};
  const vbox = { x: box.x, y: box.y, w: box.w || size.w || 0, h: box.h || size.h || 0 };
  const extra = { ...viewExtra };
  if (tool.type === 'UMLForkNode' || tool.type === 'UMLJoinNode' || (tool.type === 'UMLPseudostate' && (attrs.kind === 'fork' || attrs.kind === 'join'))) Object.assign(vbox, { w: vbox.w || 80, h: vbox.h || 6 });
  const view = addView(diagram, createNodeView(viewTypeOf(tool.type), element._id, vbox, extra), { back: Boolean(typeDef(tool.type)?.container) && !['UMLState', 'UMLNodeInstance'].includes(tool.type) });
  return { element, view };
}

/** Can an edge tool connect these two views? (Messages need lifelines/endpoints, a self-loop needs a node.) */
export function canConnect(project, diagram, tool, tailView, headView, index = buildIndex(project)) {
  if (!tailView || !headView) return false;
  if (tool.type === 'UMLNoteLinkView') return tailView._type === 'UMLNoteView' || headView._type === 'UMLNoteView' || tailView._type === 'UMLConstraintView' || headView._type === 'UMLConstraintView';
  if (tool.type === 'FreelineEdgeView' || tool.type === 'MMEdgeView' || tool.type === 'WBSEdgeView') return true;
  const tail = index.get(refId(tailView.model));
  const head = index.get(refId(headView.model));
  if (tool.type === 'UMLAssociationClassLink') return Boolean(head || tail) && (isEdgeView(tailView) || isEdgeView(headView));
  if (!tail || !head) return false;
  if (tool.type === 'UMLMessage') return ['UMLLifeline', 'UMLEndpoint', 'UMLGate', 'UMLTimingLifeline'].includes(tail._type) && ['UMLLifeline', 'UMLEndpoint', 'UMLGate', 'UMLTimingLifeline'].includes(head._type);
  if (isEdgeView(tailView) || isEdgeView(headView)) return false;
  return true;
}

/**
 * Creates the relationship of an edge tool between two views (plus its line).
 * For messages, `y` is where the line goes. Returns { element, view }.
 */
export function createEdge(project, diagram, tool, tailView, headView, { language = 'en', y = null } = {}) {
  const index = buildIndex(project);
  if (VIEW_ONLY[tool.type]) {
    const view = addView(diagram, createEdgeView(tool.type, null, tailView._id, headView._id));
    // A mind-map branch (or a WBS sub-item line) makes the head node a child of the tail node.
    if (tool.type === 'MMEdgeView' || tool.type === 'WBSEdgeView') {
      const kind = tool.type === 'MMEdgeView' ? 'MMNode' : 'WBSNode';
      const parent = index.get(refId(tailView.model));
      const child = index.get(refId(headView.model));
      if (parent?._type === kind && child?._type === kind && !isWithin(project, parent._id, child._id, index)) moveElement(project, child._id, parent._id);
    }
    return { element: null, view };
  }
  const tail = index.get(refId(tailView.model));
  const head = index.get(refId(headView.model));
  const attrs = clone(tool.attrs ?? {});
  let element;
  if (tool.type === 'UMLAssociationClassLink') {
    const classView = isEdgeView(tailView) ? headView : tailView;
    const assocView = isEdgeView(tailView) ? tailView : headView;
    const owner = index.parent(refId(classView.model)) ?? project.ownedElements[0];
    element = createElement('UMLAssociationClassLink', { classSide: ref(refId(classView.model)), associationSide: ref(refId(assocView.model)) }, { language });
    insertElement(owner, element);
    return { element, view: addView(diagram, createEdgeView('UMLAssociationClassLinkView', element._id, classView._id, assocView._id)) };
  }
  const owner = tool.type === 'UMLMessage' ? interactionOf(project, diagram, index) : relationshipOwner(project, tool.type, tail._id, index);
  const end = (key) => ({ ...(attrs[key] ?? {}) });
  element = createElement(tool.type, { ...attrs, ...(attrs.end1 ? { end1: end('end1') } : {}), ...(attrs.end2 ? { end2: end('end2') } : {}) }, { language, siblings: siblingsIn(owner, tool.type) });
  setRelationshipEnds(element, tail._id, head._id);
  if (tool.type === 'UMLMessage') {
    element.name = uniqueName(owner.messages ?? [], language === 'ko' ? '메시지' : 'Message');
    if (element.messageSort === 'createMessage') element.name = 'create';
    if (element.messageSort === 'deleteMessage') element.name = 'destroy';
    if (element.messageSort === 'reply') element.name = '';
  }
  insertElement(owner, element);
  // A sequence message always has a height: where it was drawn, else below the last message.
  const lastY = Math.max(80, ...diagram.ownedViews.filter((v) => v._type === 'UMLMessageView' && Number.isFinite(v.y)).map((v) => v.y));
  const extra = tool.type === 'UMLMessage' && diagram._type === 'UMLSequenceDiagram' ? { y: Math.round(y ?? lastY + 40) } : tool.type === 'UMLMessage' && y !== null ? { y: Math.round(y) } : {};
  const view = addView(diagram, createEdgeView(viewTypeOf(tool.type), element._id, tailView._id, headView._id, extra));
  return { element, view };
}

/** A message on a communication-diagram connector (forward = from the connector's tail lifeline). */
export function addCommunicationMessage(project, connector, { forward = true, sort = 'synchCall', language = 'en' } = {}) {
  const index = buildIndex(project);
  const interaction = index.parent(connector._id);
  const [a, b] = [refId(connector.end1?.reference), refId(connector.end2?.reference)];
  const message = createElement('UMLMessage', { messageSort: sort, connector: ref(connector), name: uniqueName(interaction.messages ?? [], language === 'ko' ? '메시지' : 'Message') }, { language });
  setRelationshipEnds(message, forward ? a : b, forward ? b : a);
  return insertElement(interaction, message);
}

// ───────────────────────── showing existing elements

/** Shows an element from the Model Explorer on a diagram (a lifeline for a classifier on a sequence diagram). */
export function dropElement(project, diagram, elementId, at, { language = 'en' } = {}) {
  const index = buildIndex(project);
  const element = index.get(elementId);
  if (!element) return null;
  const def = typeDef(element._type);
  if (/Sequence|Communication/.test(diagram._type) && ['UMLClass', 'UMLInterface', 'UMLActor', 'UMLComponent', 'UMLAttribute', 'UMLPart', 'UMLNode'].includes(element._type)) {
    const interaction = interactionOf(project, diagram, index);
    const collaboration = index.parent(interaction._id);
    let role = element;
    if (element._type !== 'UMLAttribute' && element._type !== 'UMLPart') role = insertElement(collaboration?._type === 'UMLCollaboration' ? collaboration : interaction, createElement('UMLAttribute', { name: '', type: ref(element) }, { language }));
    const lifeline = insertElement(interaction, createElement('UMLLifeline', { name: role.name || '', represent: ref(role) }, { language }));
    return addView(diagram, createNodeView('UMLLifelineView', lifeline._id, { x: at.x, y: at.y, w: 0, h: 0 }));
  }
  if (def?.edge) {
    // A relationship: shown when both ends are on the diagram.
    const [a, b] = [element.source ?? element.end1?.reference, element.target ?? element.end2?.reference].map(refId);
    const va = viewsOf(diagram).find((v) => refId(v.model) === a && !isEdgeView(v));
    const vb = viewsOf(diagram).find((v) => refId(v.model) === b && !isEdgeView(v));
    if (!va || !vb) return null;
    return addView(diagram, createEdgeView(viewTypeOf(element._type), element._id, va._id, vb._id));
  }
  if (/Diagram$/.test(element._type) || def?.feature) return null;
  return addView(diagram, createNodeView(viewTypeOf(element._type), element._id, { x: at.x, y: at.y, w: 0, h: 0 }));
}

/** StarUML's "Add Subclass / Superclass / Associated Class / Interface …" next to a classifier view. */
export const RELATED = {
  subclass: { rel: 'UMLGeneralization', type: 'UMLClass', from: 'new', dx: 0, dy: 160 },
  superclass: { rel: 'UMLGeneralization', type: 'UMLClass', from: 'this', dx: 0, dy: -160 },
  associated: { rel: 'UMLAssociation', type: 'UMLClass', from: 'this', dx: 240, dy: 0 },
  directed: { rel: 'UMLAssociation', type: 'UMLClass', from: 'this', dx: 240, dy: 0, attrs: { end2: { navigable: 'navigable' } } },
  aggregated: { rel: 'UMLAssociation', type: 'UMLClass', from: 'this', dx: 240, dy: 0, attrs: { end1: { aggregation: 'shared' } } },
  composited: { rel: 'UMLAssociation', type: 'UMLClass', from: 'this', dx: 240, dy: 0, attrs: { end1: { aggregation: 'composite' } } },
  dependent: { rel: 'UMLDependency', type: 'UMLClass', from: 'this', dx: 240, dy: 0 },
  realizedInterface: { rel: 'UMLInterfaceRealization', type: 'UMLInterface', from: 'this', dx: -240, dy: 0 },
  realizingClass: { rel: 'UMLInterfaceRealization', type: 'UMLClass', from: 'new', dx: 0, dy: 160 },
  includedUseCase: { rel: 'UMLInclude', type: 'UMLUseCase', from: 'this', dx: 240, dy: 0 },
  extendingUseCase: { rel: 'UMLExtend', type: 'UMLUseCase', from: 'new', dx: 240, dy: 100 },
  associatedUseCase: { rel: 'UMLAssociation', type: 'UMLUseCase', from: 'this', dx: 220, dy: 0 },
  associatedActor: { rel: 'UMLAssociation', type: 'UMLActor', from: 'new', dx: -220, dy: 0 },
  nextState: { rel: 'UMLTransition', type: 'UMLState', from: 'this', dx: 200, dy: 0 },
  nextAction: { rel: 'UMLControlFlow', type: 'UMLAction', from: 'this', dx: 0, dy: 110 },
  childNode: { rel: 'MMEdgeView', type: 'MMNode', from: 'this', dx: 200, dy: 0 },
  referencedEntity: { rel: 'ERDRelationship', type: 'ERDEntity', from: 'this', dx: 260, dy: 0, attrs: { end1: { cardinality: '1' }, end2: { cardinality: '0..*' } } },
  nextStep: { rel: 'FCFlow', type: 'FCProcess', from: 'this', dx: 0, dy: 110 },
  subItem: { rel: 'WBSEdgeView', type: 'WBSNode', from: 'this', dx: 30, dy: 80 },
  nextTask: { rel: 'GanttDependency', type: 'GanttTask', from: 'this', dx: 0, dy: 30 },
};

/** Which RELATED entries make sense for an element. */
export function relatedFor(element) {
  switch (element?._type) {
    case 'UMLClass': return ['subclass', 'superclass', 'associated', 'directed', 'aggregated', 'composited', 'dependent', 'realizedInterface'];
    case 'UMLInterface': return ['realizingClass', 'superclass', 'subclass', 'dependent'];
    case 'UMLUseCase': return ['includedUseCase', 'extendingUseCase', 'associatedActor'];
    case 'UMLActor': return ['associatedUseCase', 'subclass', 'superclass'];
    case 'UMLState': return ['nextState'];
    case 'UMLAction': return ['nextAction'];
    case 'MMNode': return ['childNode'];
    case 'WBSNode': return ['subItem'];
    case 'GanttTask': return ['nextTask'];
    case 'ERDEntity': return ['referencedEntity'];
    case 'FCProcess': case 'FCDecision': case 'FCTerminator': case 'FCData': return ['nextStep'];
    default: return [];
  }
}

/** Adds a related element next to a view and links them. Returns { element, view }. */
export function addRelated(project, diagram, viewId, kind, { language = 'en', boxes = new Map() } = {}) {
  const spec = RELATED[kind];
  const view = findView(diagram, viewId);
  if (!spec || !view) return null;
  const box = boxes.get(view._id) ?? { x: view.left, y: view.top, w: view.width || 120, h: view.height || 60 };
  const index = buildIndex(project);
  const current = index.get(refId(view.model));
  const owner = spec.type === 'MMNode' || spec.type === 'WBSNode' ? current : (index.parent(current._id) ?? project.ownedElements[0]);
  let type = spec.type;
  if (kind === 'subclass' || kind === 'superclass') type = current._type;
  const element = insertElement(owner, createElement(type, {}, { language, siblings: siblingsIn(owner, type) }));
  if (type === 'ERDEntity') insertElement(element, createElement('ERDColumn', { name: 'id', type: 'INTEGER', primaryKey: true }, { language }));
  const newView = addView(diagram, createNodeView(viewTypeOf(type), element._id, { x: box.x + spec.dx, y: box.y + spec.dy, w: 0, h: 0 }));
  const [tailView, headView] = spec.from === 'this' ? [view, newView] : [newView, view];
  createEdge(project, diagram, { type: spec.rel, attrs: spec.attrs ?? {} }, tailView, headView, { language });
  return { element, view: newView };
}

// ───────────────────────── moving and arranging views

/** Moves views by (dx, dy): node boxes, message heights, bend points of lines between moved nodes. */
export function moveViews(diagram, ids, dx, dy) {
  const set = new Set(ids);
  for (const view of viewsOf(diagram)) {
    if (!set.has(view._id)) continue;
    if (isEdgeView(view)) {
      if (view.y !== undefined) view.y = Math.round(view.y + dy);
      view.points = (view.points ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else { view.left = Math.round((view.left ?? 0) + dx); view.top = Math.round((view.top ?? 0) + dy); }
  }
  // Lines whose both ends moved keep their shape.
  for (const view of viewsOf(diagram)) {
    if (!isEdgeView(view) || set.has(view._id)) continue;
    if (set.has(refId(view.tail)) && set.has(refId(view.head))) view.points = (view.points ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
}

/** Aligns node views (boxes from the renderer). how: left|center|right|top|middle|bottom. */
export function alignViews(diagram, ids, how, boxes) {
  const views = ids.map((id) => findView(diagram, id)).filter((v) => v && !isEdgeView(v));
  if (views.length < 2) return 0;
  const bs = views.map((v) => boxes.get(v._id));
  const minX = Math.min(...bs.map((b) => b.x)); const maxX = Math.max(...bs.map((b) => b.x + b.w));
  const minY = Math.min(...bs.map((b) => b.y)); const maxY = Math.max(...bs.map((b) => b.y + b.h));
  views.forEach((v, i) => {
    const b = bs[i];
    if (how === 'left') v.left = minX; else if (how === 'right') v.left = maxX - b.w; else if (how === 'center') v.left = Math.round((minX + maxX) / 2 - b.w / 2);
    else if (how === 'top') v.top = minY; else if (how === 'bottom') v.top = maxY - b.h; else if (how === 'middle') v.top = Math.round((minY + maxY) / 2 - b.h / 2);
  });
  return views.length;
}

/** Spaces node views evenly. axis: h|v. */
export function distributeViews(diagram, ids, axis, boxes) {
  const views = ids.map((id) => findView(diagram, id)).filter((v) => v && !isEdgeView(v));
  if (views.length < 3) return 0;
  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = views.map((v) => ({ v, b: boxes.get(v._id) })).sort((a, b) => a.b[key] - b.b[key]);
  const first = sorted[0].b; const last = sorted.at(-1).b;
  const total = sorted.reduce((s, x) => s + x.b[size], 0);
  const gap = (last[key] + last[size] - first[key] - total) / (sorted.length - 1);
  let pos = first[key];
  for (const { v, b } of sorted) { if (axis === 'h') v.left = Math.round(pos); else v.top = Math.round(pos); pos += b[size] + gap; }
  return views.length;
}

/** Gives node views the size of the first one. which: width|height|both. */
export function sameSizeViews(diagram, ids, which, boxes) {
  const views = ids.map((id) => findView(diagram, id)).filter((v) => v && !isEdgeView(v));
  if (views.length < 2) return 0;
  const b0 = boxes.get(views[0]._id);
  for (const v of views.slice(1)) { if (which !== 'height') v.width = Math.round(b0.w); if (which !== 'width') v.height = Math.round(b0.h); v.autoResize = false; }
  return views.length;
}

/** Brings views to the front / back of the z-order. */
export function reorderViews(diagram, ids, how) {
  const set = new Set(ids);
  const list = diagram.ownedViews;
  const picked = list.filter((v) => set.has(v._id));
  const rest = list.filter((v) => !set.has(v._id));
  if (how === 'front') diagram.ownedViews = [...rest, ...picked];
  else if (how === 'back') diagram.ownedViews = [...picked, ...rest];
  else {
    const step = how === 'forward' ? 1 : -1;
    const order = [...list];
    const indices = order.map((v, i) => (set.has(v._id) ? i : -1)).filter((i) => i >= 0);
    if (step > 0) indices.reverse();
    for (const i of indices) { const j = i + step; if (j < 0 || j >= order.length || set.has(order[j]._id)) continue; [order[i], order[j]] = [order[j], order[i]]; }
    diagram.ownedViews = order;
  }
}

/**
 * After a view is moved: when it now sits inside a package-like view, its
 * element moves into that namespace (StarUML does this). Returns true when moved.
 */
export function reparentByContainment(project, diagram, viewId, boxes) {
  const view = findView(diagram, viewId);
  if (!view?.model) return false;
  const index = buildIndex(project);
  const element = index.get(refId(view.model));
  if (!element || typeDef(element._type)?.edge || typeDef(element._type)?.feature) return false;
  const b = boxes.get(view._id);
  if (!b) return false;
  const containers = viewsOf(diagram).filter((v) => v !== view && v.model && !isEdgeView(v) && boxes.get(v._id)).filter((v) => {
    const c = boxes.get(v._id);
    return b.x >= c.x && b.y >= c.y && b.x + b.w <= c.x + c.w && b.y + b.h <= c.y + c.h;
  });
  containers.sort((x, y) => boxes.get(x._id).w * boxes.get(x._id).h - boxes.get(y._id).w * boxes.get(y._id).h);
  const target = containers.map((v) => index.get(refId(v.model))).find((e) => e && ['UMLPackage', 'UMLModel', 'UMLSubsystem', 'UMLProfile', 'UMLComponent', 'UMLNode', 'C4SoftwareSystem'].includes(e._type) && canContain(e, element._type));
  const currentOwner = index.parent(element._id);
  if (target && target !== currentOwner && !isWithin(project, target._id, element._id, index)) return moveElement(project, element._id, target._id);
  // Dragged out of a package view on a diagram that shows the package: back to the diagram's owner.
  if (!target && currentOwner && ['UMLPackage', 'UMLSubsystem'].includes(currentOwner._type) && viewsOf(diagram).some((v) => refId(v.model) === currentOwner._id)) {
    const owner = diagramOwner(project, diagram, index);
    if (owner && owner !== currentOwner && canContain(owner, element._type)) return moveElement(project, element._id, owner._id);
  }
  return false;
}

/** Collection key a feature would use in its owner (for the Properties panel "add" buttons). */
export const featureCollection = (ownerType, featureType) => collectionFor(ownerType, featureType);

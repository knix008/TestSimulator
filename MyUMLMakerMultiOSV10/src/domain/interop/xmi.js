// XMI 2.x interchange (OMG UML 2.5 XMI) with Sparx Enterprise Architect,
// MagicDraw / Cameo, Papyrus and StarUML's XMI extension.
//
// Writing (exportXmi): the UML part of the project as XMI 2.5.1 — packages,
// classifiers with their attributes / operations / parameters / literals,
// relationships (generalization, interface realization, associations with
// their ends, dependencies of every kind, include / extend, profile
// extensions), state machines, activities, interactions, instances, comments
// and documentation, stereotype applications. flavor 'ea' (the default) adds
// Enterprise Architect's xmi:Extension with the diagrams (element geometry
// "Left=..;Top=..;Right=..;Bottom=..;") so EA shows them as drawn; flavor
// 'plain' writes the model only. Non-UML notations (ERD, BPMN, C4 …) are left out.
//
// Reading (readXmi / importXmi): EA 2.1 / 2.5 exports (diagrams from its
// extension, EAStub, EA tagged values and notes), MagicDraw and Papyrus (UML DI
// or GMF notation shapes when present). Without any diagram information a
// class diagram is made per package and laid out. What is not understood is
// skipped with a warning; reading never throws.
//
// Pure (no DOM).
import { fieldsOf, isDiagramType, TYPES, typeDef, viewDef, viewTypeOf } from '../meta.js';
import { addMissingEdgeViews, buildIndex, createElement, insertElement, linkParents, newId, ref, refId, relationshipEnds, walk } from '../model.js';
import { layoutDiagram } from '../layout.js';
import { estimateSize } from './staruml.js';
import { childrenNamed, descendants, firstChild, localName, parseXml, prefixOf, writeXml, x } from './xml.js';

export const XMI_NS = 'http://www.omg.org/spec/XMI/20131001';
export const UML_NS = 'http://www.omg.org/spec/UML/20161101';
const PRIMITIVES_HREF = `${UML_NS}/PrimitiveTypes.xmi`;
const UML_PRIMITIVES = new Set(['String', 'Integer', 'Boolean', 'Real', 'UnlimitedNatural']);
const CUSTOM_PROFILE_NS = 'http://www.sparxsystems.com/profiles/thecustomprofile/1.0';
const TYPES_PACKAGE = 'MUMLTYPES';
const NCNAME = /^[A-Za-z_][\w.-]*$/;

// ───────────────────────── type tables

const PACKAGES = { UMLModel: 'Model', UMLPackage: 'Package', UMLProfile: 'Profile' };
const CLASSIFIERS = {
  UMLClass: 'Class', UMLInterface: 'Interface', UMLDataType: 'DataType', UMLPrimitiveType: 'PrimitiveType', UMLEnumeration: 'Enumeration', UMLSignal: 'Signal',
  UMLStereotype: 'Stereotype', UMLMetaClass: 'Class', UMLComponent: 'Component', UMLSubsystem: 'Component', UMLArtifact: 'Artifact', UMLNode: 'Node', UMLDevice: 'Device',
  UMLExecutionEnvironment: 'ExecutionEnvironment', UMLActor: 'Actor', UMLUseCase: 'UseCase', UMLUseCaseSubject: 'Component', UMLCollaboration: 'Collaboration', UMLInformationItem: 'InformationItem',
};
const INSTANCES = { UMLObject: 'InstanceSpecification', UMLComponentInstance: 'InstanceSpecification', UMLArtifactInstance: 'InstanceSpecification', UMLNodeInstance: 'InstanceSpecification' };
const BEHAVIORS = { UMLStateMachine: 'StateMachine', UMLActivity: 'Activity', UMLInteraction: 'Interaction' };
/** Relationships written as packaged elements with client / supplier. */
const DIRECTED = {
  UMLDependency: 'Dependency', UMLUsage: 'Usage', UMLRealization: 'Realization', UMLAbstraction: 'Abstraction', UMLComponentRealization: 'ComponentRealization',
  UMLDeployment: 'Deployment', UMLManifestation: 'Manifestation', UMLInformationFlow: 'InformationFlow',
};
const ASSOCIATIONS = { UMLAssociation: 'Association', UMLLink: 'Association', UMLCommunicationPath: 'CommunicationPath' };
/** Relationships owned by (and written inside) their source. */
const SOURCE_OWNED = { UMLGeneralization: 'Generalization', UMLInterfaceRealization: 'InterfaceRealization', UMLInclude: 'Include', UMLExtend: 'Extend' };
const ACTIVITY_NODES = {
  UMLInitialNode: 'InitialNode', UMLActivityFinalNode: 'ActivityFinalNode', UMLFlowFinalNode: 'FlowFinalNode', UMLForkNode: 'ForkNode', UMLJoinNode: 'JoinNode',
  UMLDecisionNode: 'DecisionNode', UMLMergeNode: 'MergeNode', UMLObjectNode: 'CentralBufferNode', UMLCentralBufferNode: 'CentralBufferNode', UMLDataStoreNode: 'DataStoreNode',
  UMLExpansionRegion: 'ExpansionRegion', UMLStructuredActivityNode: 'StructuredActivityNode',
};
const ACTION_KINDS = {
  opaque: 'OpaqueAction', callBehavior: 'CallBehaviorAction', callOperation: 'CallOperationAction', sendSignal: 'SendSignalAction', acceptSignal: 'AcceptEventAction',
  acceptTimeEvent: 'AcceptEventAction', createObject: 'CreateObjectAction', destroyObject: 'DestroyObjectAction', structured: 'OpaqueAction',
};
const ACTION_FROM = Object.fromEntries(Object.entries(ACTION_KINDS).filter(([k]) => k !== 'acceptTimeEvent' && k !== 'structured').map(([k, v]) => [v, k]));
/** Everything else the writer understands (parts of behaviours, features). */
const OTHER = {
  UMLAttribute: 'Property', UMLPart: 'Property', UMLPort: 'Port', UMLOperation: 'Operation', UMLParameter: 'Parameter', UMLEnumerationLiteral: 'EnumerationLiteral',
  UMLReception: 'Reception', UMLExtensionPoint: 'ExtensionPoint', UMLSlot: 'Slot', UMLConstraint: 'Constraint', UMLAssociationEnd: 'Property', UMLConnector: 'Connector', UMLExtension: 'Extension',
  UMLRegion: 'Region', UMLState: 'State', UMLSubmachineState: 'State', UMLPseudostate: 'Pseudostate', UMLFinalState: 'FinalState', UMLTransition: 'Transition',
  UMLLifeline: 'Lifeline', UMLTimingLifeline: 'Lifeline', UMLMessage: 'Message', UMLCombinedFragment: 'CombinedFragment', UMLInteractionOperand: 'InteractionOperand',
  UMLInteractionUse: 'InteractionUse', UMLStateInvariant: 'StateInvariant', UMLDurationConstraint: 'DurationConstraint', UMLTimeConstraint: 'TimeConstraint',
  UMLAction: 'OpaqueAction', UMLInputPin: 'InputPin', UMLOutputPin: 'OutputPin', UMLActivityPartition: 'ActivityPartition', UMLInterruptibleActivityRegion: 'InterruptibleActivityRegion',
  UMLControlFlow: 'ControlFlow', UMLObjectFlow: 'ObjectFlow',
};
const TO_XMI = { ...PACKAGES, ...CLASSIFIERS, ...INSTANCES, ...BEHAVIORS, ...DIRECTED, ...ASSOCIATIONS, ...SOURCE_OWNED, ...ACTIVITY_NODES, ...OTHER };

/** xmi:type → our type when nothing says otherwise. */
const FROM_XMI = {
  Model: 'UMLModel', Package: 'UMLPackage', Profile: 'UMLProfile', Class: 'UMLClass', Interface: 'UMLInterface', DataType: 'UMLDataType', PrimitiveType: 'UMLPrimitiveType',
  Enumeration: 'UMLEnumeration', Signal: 'UMLSignal', Stereotype: 'UMLStereotype', Component: 'UMLComponent', Artifact: 'UMLArtifact', Node: 'UMLNode', Device: 'UMLDevice',
  ExecutionEnvironment: 'UMLExecutionEnvironment', Actor: 'UMLActor', UseCase: 'UMLUseCase', Collaboration: 'UMLCollaboration', InformationItem: 'UMLInformationItem',
  InstanceSpecification: 'UMLObject', StateMachine: 'UMLStateMachine', ProtocolStateMachine: 'UMLStateMachine', Activity: 'UMLActivity', Interaction: 'UMLInteraction',
  AssociationClass: 'UMLClass', Dependency: 'UMLDependency', Usage: 'UMLUsage', Realization: 'UMLRealization', Abstraction: 'UMLAbstraction', Substitution: 'UMLRealization',
  ComponentRealization: 'UMLComponentRealization', Deployment: 'UMLDeployment', Manifestation: 'UMLManifestation', InformationFlow: 'UMLInformationFlow',
  Association: 'UMLAssociation', CommunicationPath: 'UMLCommunicationPath', Extension: 'UMLExtension', Generalization: 'UMLGeneralization',
  InterfaceRealization: 'UMLInterfaceRealization', Include: 'UMLInclude', Extend: 'UMLExtend', Connector: 'UMLConnector',
  Property: 'UMLAttribute', Port: 'UMLPort', Operation: 'UMLOperation', Parameter: 'UMLParameter', EnumerationLiteral: 'UMLEnumerationLiteral', Reception: 'UMLReception',
  ExtensionPoint: 'UMLExtensionPoint', Slot: 'UMLSlot', Constraint: 'UMLConstraint', Region: 'UMLRegion', State: 'UMLState', Pseudostate: 'UMLPseudostate',
  FinalState: 'UMLFinalState', Transition: 'UMLTransition', Lifeline: 'UMLLifeline', Message: 'UMLMessage', CombinedFragment: 'UMLCombinedFragment',
  InteractionOperand: 'UMLInteractionOperand', InteractionUse: 'UMLInteractionUse', StateInvariant: 'UMLStateInvariant', DurationConstraint: 'UMLDurationConstraint',
  TimeConstraint: 'UMLTimeConstraint', InputPin: 'UMLInputPin', ValuePin: 'UMLInputPin', ActionInputPin: 'UMLInputPin', OutputPin: 'UMLOutputPin',
  ActivityPartition: 'UMLActivityPartition', InterruptibleActivityRegion: 'UMLInterruptibleActivityRegion', ControlFlow: 'UMLControlFlow', ObjectFlow: 'UMLObjectFlow',
  InitialNode: 'UMLInitialNode', ActivityFinalNode: 'UMLActivityFinalNode', FlowFinalNode: 'UMLFlowFinalNode', ForkNode: 'UMLForkNode', JoinNode: 'UMLJoinNode',
  DecisionNode: 'UMLDecisionNode', MergeNode: 'UMLMergeNode', CentralBufferNode: 'UMLCentralBufferNode', DataStoreNode: 'UMLDataStoreNode', ExpansionRegion: 'UMLExpansionRegion',
  StructuredActivityNode: 'UMLStructuredActivityNode', LoopNode: 'UMLStructuredActivityNode', ConditionalNode: 'UMLStructuredActivityNode', SequenceNode: 'UMLStructuredActivityNode',
  ActivityParameterNode: 'UMLObjectNode', ...Object.fromEntries(Object.keys(ACTION_FROM).map((k) => [k, 'UMLAction'])),
};

/** Our diagram types ↔ Enterprise Architect's diagram types. */
const EA_DIAGRAM = {
  UMLClassDiagram: 'Logical', UMLPackageDiagram: 'Package', UMLObjectDiagram: 'Object', UMLCompositeStructureDiagram: 'CompositeStructure', UMLComponentDiagram: 'Component',
  UMLDeploymentDiagram: 'Deployment', UMLProfileDiagram: 'Logical', UMLUseCaseDiagram: 'Use Case', UMLSequenceDiagram: 'Sequence', UMLCommunicationDiagram: 'Collaboration',
  UMLTimingDiagram: 'Timing', UMLInteractionOverviewDiagram: 'InteractionOverview', UMLInformationFlowDiagram: 'Logical', UMLStatechartDiagram: 'Statechart', UMLActivityDiagram: 'Activity',
};
const EA_DIAGRAM_FROM = {
  logical: 'UMLClassDiagram', class: 'UMLClassDiagram', analysis: 'UMLClassDiagram', custom: 'UMLClassDiagram', package: 'UMLPackageDiagram', object: 'UMLObjectDiagram',
  compositestructure: 'UMLCompositeStructureDiagram', component: 'UMLComponentDiagram', deployment: 'UMLDeploymentDiagram', usecase: 'UMLUseCaseDiagram',
  sequence: 'UMLSequenceDiagram', collaboration: 'UMLCommunicationDiagram', communication: 'UMLCommunicationDiagram', timing: 'UMLTimingDiagram',
  interactionoverview: 'UMLInteractionOverviewDiagram', statechart: 'UMLStatechartDiagram', state: 'UMLStatechartDiagram', statemachine: 'UMLStatechartDiagram', activity: 'UMLActivityDiagram',
  profile: 'UMLProfileDiagram', informationflow: 'UMLInformationFlowDiagram',
};
/** EA connector types (its `ea_type`). */
const EA_CONNECTOR = {
  UMLAssociation: 'Association', UMLLink: 'Association', UMLCommunicationPath: 'CommunicationPath', UMLGeneralization: 'Generalization', UMLInterfaceRealization: 'Realisation',
  UMLRealization: 'Realisation', UMLComponentRealization: 'Realisation', UMLDependency: 'Dependency', UMLUsage: 'Usage', UMLAbstraction: 'Abstraction', UMLDeployment: 'Deployment',
  UMLManifestation: 'Manifest', UMLInformationFlow: 'InformationFlow', UMLExtension: 'Extension', UMLInclude: 'UseCase', UMLExtend: 'UseCase', UMLConnector: 'Connector',
  UMLTransition: 'StateFlow', UMLControlFlow: 'ControlFlow', UMLObjectFlow: 'ObjectFlow', UMLMessage: 'Sequence',
};

/** Our fields kept in the MyUMLMaker marker. */
const MARKER_FIELDS = { UMLTimingLifeline: ['states'], UMLObjectNode: ['inState', 'upperBound', 'ordering'], UMLCentralBufferNode: [], UMLDataStoreNode: [] };

const isPackage = (el) => Boolean(el && PACKAGES[el._type]);
const isUmlDiagram = (el) => isDiagramType(el?._type) && Boolean(EA_DIAGRAM[el._type]);
const xmiTypeOf = (el, inActivity = false) => {
  if (el._type === 'UMLAction') return ACTION_KINDS[el.kind] ?? 'OpaqueAction';
  if (el._type === 'UMLInteractionUse' && inActivity) return 'CallBehaviorAction';
  return TO_XMI[el._type] ?? null;
};

// ───────────────────────── ids

/** A 128-bit hash of a string (cyrb128) as 32 hex digits. */
function hash128(text) {
  let h1 = 1779033703; let h2 = 3144134277; let h3 = 1013904242; let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('').toUpperCase();
}
const guid = (hex) => `${hex.slice(0, 8)}_${hex.slice(8, 12)}_${hex.slice(12, 16)}_${hex.slice(16, 20)}_${hex.slice(20, 32)}`;
const duidOf = (id) => hash128(`duid:${id}`).slice(0, 8);

// ───────────────────────── multiplicity and values

/** "0..*" → { lower: '0', upper: '*' } (null when it is not a multiplicity). */
export function parseMultiplicity(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (s === '*' || s === 'n') return { lower: '0', upper: '*' };
  let m = /^(\d+)$/.exec(s);
  if (m) return { lower: m[1], upper: m[1] };
  m = /^(\d+)\s*\.\.\s*(\d+|\*|n)$/.exec(s);
  if (m) return { lower: m[1], upper: m[2] === 'n' ? '*' : m[2] };
  return null;
}

/** lower and upper (strings, possibly missing) → our multiplicity text. */
export function multiplicityText(lower, upper) {
  if (lower === undefined && upper === undefined) return '';
  let up = upper === undefined ? undefined : String(upper).trim();
  if (up === '-1' || up === 'n') up = '*';
  let lo = lower === undefined ? undefined : String(lower).trim();
  if (lo === undefined || lo === '') lo = up === '*' ? '0' : up ?? '1';
  if (up === undefined || up === '') up = lo;
  if (!/^\d+$/.test(lo) || !(/^\d+$/.test(up) || up === '*')) return '';
  return lo === up ? lo : `${lo}..${up}`;
}

// ───────────────────────── writing

const text = (name, value) => ({ name, attrs: {}, children: [], text: String(value ?? '') });
const bool = (value) => (value ? 'true' : undefined);

/**
 * Our project → XMI 2.5.1 text. flavor: 'ea' (Enterprise Architect's diagram
 * extension included; the default) or 'plain' (model only).
 */
export function exportXmi(project, { flavor = 'ea' } = {}) {
  if (!project || project._type !== 'Project') throw Object.assign(new Error('interop.notProject'), { code: 'interop.notProject' });
  const ea = flavor !== 'plain';
  const index = buildIndex(project);
  const idMap = new Map();
  const used = new Set();
  const id = (ourId, kind = 'EAID') => {
    const key = `${kind}:${ourId}`;
    if (idMap.has(key)) return idMap.get(key);
    let value;
    if (/^EA(ID|PK)_[0-9A-Fa-f_]+$/.test(ourId) || (!ea && NCNAME.test(ourId) && !ourId.includes('#'))) value = ourId;
    else for (let salt = ''; !value || used.has(value); salt += '#') value = `${kind}_${guid(hash128(`${ourId}${salt}`))}`;
    used.add(value);
    idMap.set(key, value);
    return value;
  };
  const xid = (el) => id(el._id, isPackage(el) ? 'EAPK' : 'EAID');

  // What is written: UML elements whose owners are written too; relationships whose ends are.
  const exported = new Set();
  const visit = (el, inActivity) => {
    for (const child of [...(el.ownedElements ?? []), ...Object.entries(el).filter(([k, v]) => Array.isArray(v) && k !== 'ownedElements' && k !== 'ownedViews' && k !== 'tags').flatMap(([, v]) => v)]) {
      if (!child || typeof child !== 'object' || !child._type || isDiagramType(child._type)) continue;
      if (!xmiTypeOf(child, inActivity) || child._type === 'UMLAssociationEnd') continue;
      exported.add(child._id);
      visit(child, child._type === 'UMLActivity' || (inActivity && /Partition|Structured|Expansion|Interruptible/.test(child._type)));
    }
  };
  visit(project, false);
  for (let changed = true; changed;) {
    changed = false;
    for (const elId of [...exported]) {
      const el = index.get(elId);
      if (!typeDef(el._type)?.edge) continue;
      const ends = relationshipEnds(el);
      if (ends.some((e) => !exported.has(e))) { exported.delete(elId); changed = true; }
    }
  }
  const has = (value) => exported.has(refId(value));

  // Classifiers by name (string types that name a classifier of the project become references).
  const byName = new Map();
  for (const elId of exported) {
    const el = index.get(elId);
    if ((CLASSIFIERS[el._type] || el._type === 'UMLStateMachine') && el.name) byName.set(el.name, byName.has(el.name) ? null : el);
  }
  // Relationships written inside their source.
  const bySource = new Map();
  const inSource = new Set();
  // Profile extensions: a base_<Metaclass> attribute on the stereotype.
  const bases = new Map();
  for (const elId of exported) {
    const el = index.get(elId);
    if (SOURCE_OWNED[el._type]) {
      // Written inside a classifier source; from anything else (a port …) as a packaged element.
      const [s] = relationshipEnds(el);
      const source = index.get(s);
      if (!(CLASSIFIERS[source?._type] || INSTANCES[source?._type] || BEHAVIORS[source?._type])) continue;
      if (!bySource.has(s)) bySource.set(s, []);
      bySource.get(s).push(el);
      inSource.add(el._id);
    }
    if (el._type === 'UMLExtension') {
      const [st, meta] = relationshipEnds(el);
      if (!bases.has(st)) bases.set(st, []);
      bases.get(st).push({ ext: el, meta: index.get(meta) });
    }
  }
  const stubs = new Map();
  const localTypes = new Map();
  const stereotypeApps = [];
  const profilesUsed = new Set();
  const customNs = new Set();

  const typeNode = (value, tag = 'type') => {
    if (value && typeof value === 'object') {
      const target = index.get(value);
      if (target && exported.has(target._id)) return x(tag, { 'xmi:idref': xid(target) });
      value = target?.name ?? '';
    }
    const name = String(value ?? '').trim();
    if (!name) return null;
    if (UML_PRIMITIVES.has(name)) return x(tag, { href: `${PRIMITIVES_HREF}#${name}` });
    const named = byName.get(name);
    if (named) return x(tag, { 'xmi:idref': xid(named) });
    if (ea) {
      if (NCNAME.test(name)) return x(tag, { 'xmi:idref': `EAnone_${name}` });
      if (!stubs.has(name)) stubs.set(name, id(`stub:${name}`));
      return x(tag, { 'xmi:idref': stubs.get(name) });
    }
    if (!localTypes.has(name)) localTypes.set(name, id(`type:${name}`));
    return x(tag, { 'xmi:idref': localTypes.get(name) });
  };
  const multiplicity = (el, value = el.multiplicity) => {
    const m = parseMultiplicity(value);
    if (!m) return [];
    return [
      x('lowerValue', { 'xmi:type': 'uml:LiteralInteger', 'xmi:id': id(`${el._id}#lower`), value: m.lower }),
      x('upperValue', { 'xmi:type': 'uml:LiteralUnlimitedNatural', 'xmi:id': id(`${el._id}#upper`), value: m.upper }),
    ];
  };
  const valueNode = (tag, owner, value, suffix = '#value') => {
    const s = String(value ?? '');
    if (!s) return null;
    const literal = /^-?\d+$/.test(s) ? 'LiteralInteger' : s === 'true' || s === 'false' ? 'LiteralBoolean' : 'LiteralString';
    return x(tag, { 'xmi:type': `uml:${literal}`, 'xmi:id': id(`${owner._id}${suffix}`), value: s });
  };
  const opaque = (tag, owner, body, suffix, xmiType = 'OpaqueExpression') => (body ? x(tag, { 'xmi:type': `uml:${xmiType}`, 'xmi:id': id(`${owner._id}${suffix}`) }, text('body', body)) : null);
  const constraint = (tag, owner, body, suffix) => (body ? x(tag, { 'xmi:type': 'uml:Constraint', 'xmi:id': id(`${owner._id}${suffix}`) }, opaque('specification', owner, body, `${suffix}.spec`)) : null);
  const doc = (el) => (el.documentation ? x('ownedComment', { 'xmi:type': 'uml:Comment', 'xmi:id': id(`${el._id}#doc`), body: el.documentation }, x('annotatedElement', { 'xmi:idref': xid(el) })) : null);
  const marker = (el, xmiType) => {
    const back = xmiType === 'CallBehaviorAction' && el._type === 'UMLAction' ? 'UMLAction' : FROM_XMI[xmiType];
    const kindLost = el._type === 'UMLAction' && (el.kind === 'acceptTimeEvent' || el.kind === 'structured');
    // Fields UML has no place for (timing states, object node state …) ride along.
    const extra = Object.fromEntries((MARKER_FIELDS[el._type] ?? []).filter((k) => el[k] !== undefined && el[k] !== '').map((k) => [k, String(el[k])]));
    if (back === el._type && !kindLost && !Object.keys(extra).length) return null;
    return x('xmi:Extension', { extender: 'MyUMLMaker' }, x('modelType', { value: el._type, kind: kindLost ? el.kind : undefined, ...extra }));
  };
  const head = (el, xmiType, extra = {}) => ({
    'xmi:type': `uml:${xmiType}`, 'xmi:id': xid(el), name: el.name || undefined,
    visibility: fieldsOf(el._type).some((f) => f.key === 'visibility') && el.visibility ? el.visibility : undefined, ...extra,
  });
  const stereotypeOf = (el, xmiType) => {
    if (!el.stereotype) return;
    const target = typeof el.stereotype === 'object' ? index.get(el.stereotype) : null;
    if (target?._type === 'UMLStereotype') {
      const profile = index.parent(target._id);
      if (profile && isPackage(profile) && exported.has(profile._id)) {
        const prefix = NCNAME.test(profile.name ?? '') ? profile.name : `Profile_${duidOf(profile._id)}`;
        profilesUsed.add(profile._id);
        stereotypeApps.push({ prefix, profile, name: NCNAME.test(target.name ?? '') ? target.name : `Stereotype_${duidOf(target._id)}`, base: `base_${xmiType}`, el });
        return;
      }
    }
    const name = String(target?.name ?? el.stereotype ?? '').trim();
    if (name && NCNAME.test(name)) { customNs.add('thecustomprofile'); stereotypeApps.push({ prefix: 'thecustomprofile', name, base: `base_${xmiType}`, el }); }
  };

  /** An element (null when it is not written). out: the packaged elements of the nearest package (hoisted relationships go there). */
  const write = (el, tag, out, inActivity = false) => {
    if (!exported.has(el._id)) return null;
    const xmiType = xmiTypeOf(el, inActivity);
    if (!xmiType) return null;
    stereotypeOf(el, xmiType);
    if (PACKAGES[el._type]) return writePackage(el, tag);
    if (DIRECTED[el._type] || SOURCE_OWNED[el._type]) return writeDirected(el, tag);
    if (ASSOCIATIONS[el._type]) return writeAssociation(el, tag);
    if (el._type === 'UMLExtension') return writeExtension(el, tag);
    if (el._type === 'UMLConnector') return writeConnector(el);
    if (CLASSIFIERS[el._type] || INSTANCES[el._type] || BEHAVIORS[el._type]) return writeClassifier(el, tag, out);
    return null;
  };
  const ownedFrom = (el, out, inActivity = false) => {
    const children = [];
    for (const child of el.ownedElements ?? []) {
      if (!exported.has(child._id) || inSource.has(child._id)) continue;
      const def = typeDef(child._type);
      if (def?.edge && child._type !== 'UMLConnector') { const node = write(child, 'packagedElement', out); if (node) out.push(node); continue; }
      let tag = 'packagedElement';
      if (!PACKAGES[el._type] && el._type !== 'UMLComponent' && el._type !== 'UMLSubsystem' && el._type !== 'UMLUseCaseSubject') {
        if (BEHAVIORS[child._type]) tag = 'ownedBehavior';
        else if (child._type === 'UMLUseCase') tag = 'ownedUseCase';
        else if (/^UML(Node|Device|ExecutionEnvironment)$/.test(child._type) && /^UML(Node|Device|ExecutionEnvironment)$/.test(el._type)) tag = 'nestedNode';
        else if (child._type === 'UMLConnector') tag = 'ownedConnector';
        else tag = 'nestedClassifier';
      } else if (child._type === 'UMLConnector') tag = 'ownedConnector';
      const node = write(child, tag, out, inActivity);
      if (node) children.push(node);
    }
    return children;
  };
  const rules = (el) => (el.ownedRules ?? []).filter((r) => exported.has(r._id)).map((r) => x('ownedRule', { ...head(r, 'Constraint'), constrainedElement: (r.constrainedElements ?? []).filter(has).map((c) => xid(index.get(c))).join(' ') || undefined }, doc(r), opaque('specification', r, r.specification, '#spec')));

  const writePackage = (el, tag) => {
    const out = [];
    const children = ownedFrom(el, out);
    return x(tag, head(el, PACKAGES[el._type]), doc(el), notesOf(el), rules(el), children, out);
  };

  const property = (el, tag = 'ownedAttribute') => {
    const xmiType = TO_XMI[el._type] ?? 'Property';
    stereotypeOf(el, xmiType);
    const aggregation = el.aggregation && el.aggregation !== 'none' ? el.aggregation : undefined;
    return x(tag, head(el, xmiType, {
      isStatic: bool(el.isStatic), isReadOnly: bool(el.isReadOnly), isDerived: bool(el.isDerived), isOrdered: bool(el.isOrdered), isUnique: bool(el.isUnique), isID: bool(el.isID), aggregation,
      isService: el._type === 'UMLPort' && el.isService === false ? 'false' : undefined, isBehavior: bool(el.isBehavior), isConjugated: bool(el.isConjugated),
    }), doc(el), typeNode(el.type), multiplicity(el), valueNode('defaultValue', el, el.defaultValue), marker(el, xmiType));
  };
  const parameter = (el) => x('ownedParameter', head(el, 'Parameter', { direction: el.direction && el.direction !== 'in' ? el.direction : undefined }), doc(el), typeNode(el.type), multiplicity(el), valueNode('defaultValue', el, el.defaultValue));
  const operation = (el) => {
    stereotypeOf(el, 'Operation');
    return x('ownedOperation', head(el, 'Operation', {
    isStatic: bool(el.isStatic), isAbstract: bool(el.isAbstract), isQuery: bool(el.isQuery), isLeaf: bool(el.isLeaf), concurrency: el.concurrency && el.concurrency !== 'sequential' ? el.concurrency : undefined,
    }), doc(el), (el.parameters ?? []).filter((p) => exported.has(p._id)).map(parameter));
  };

  const writeClassifier = (el, tag, out) => {
    const xmiType = xmiTypeOf(el);
    const extra = {
      isAbstract: bool(el.isAbstract), isLeaf: bool(el.isLeaf), isFinalSpecialization: bool(el.isFinalSpecialization), isActive: bool(el.isActive),
      isIndirectlyInstantiated: el._type === 'UMLComponent' && el.isIndirectlyInstantiated === false ? 'false' : undefined, fileName: el._type === 'UMLArtifact' ? el.fileName || undefined : undefined,
      isReentrant: el._type === 'UMLStateMachine' && el.isReentrant === false ? 'false' : undefined, isReadOnly: el._type === 'UMLActivity' ? bool(el.isReadOnly) : undefined,
      isSingleExecution: el._type === 'UMLActivity' ? bool(el.isSingleExecution) : undefined,
      classifier: INSTANCES[el._type] && has(el.classifier) ? xid(index.get(el.classifier)) : undefined,
    };
    const children = [doc(el), marker(el, xmiType), rules(el)];
    for (const rel of bySource.get(el._id) ?? []) children.push(writeSourceOwned(rel));
    for (const base of bases.get(el._id) ?? []) {
      children.push(x('ownedAttribute', { 'xmi:type': 'uml:Property', 'xmi:id': id(`${base.ext._id}#base`), name: `base_${NCNAME.test(base.meta?.name ?? '') ? base.meta.name : 'Element'}`, association: xid(base.ext) }, x('type', { 'xmi:idref': xid(base.meta) })));
    }
    for (const a of [...(el.attributes ?? []), ...(el.parts ?? []), ...(el.ports ?? [])]) if (exported.has(a._id)) children.push(property(a));
    for (const o of el.operations ?? []) if (exported.has(o._id)) children.push(operation(o));
    for (const l of el.literals ?? []) if (exported.has(l._id)) children.push(x('ownedLiteral', head(l, 'EnumerationLiteral'), doc(l)));
    for (const r of el.receptions ?? []) if (exported.has(r._id)) children.push(x('ownedReception', head(r, 'Reception', { signal: has(r.signal) ? xid(index.get(r.signal)) : undefined }), doc(r)));
    for (const p of el.extensionPoints ?? []) if (exported.has(p._id)) children.push(x('extensionPoint', head(p, 'ExtensionPoint'), doc(p)));
    for (const s of el.slots ?? []) {
      if (!exported.has(s._id)) continue;
      children.push(x('slot', { 'xmi:type': 'uml:Slot', 'xmi:id': xid(s), definingFeature: has(s.definingFeature) ? xid(index.get(s.definingFeature)) : undefined }, valueNode('value', s, s.value)));
    }
    if (el._type === 'UMLStateMachine') for (const r of el.regions ?? []) children.push(region(r));
    if (el._type === 'UMLActivity') children.push(activityContent(el));
    if (el._type === 'UMLInteraction') children.push(interactionContent(el));
    children.push(ownedFrom(el, out, el._type === 'UMLActivity'));
    return x(tag, head(el, xmiType, extra), children);
  };

  const writeSourceOwned = (el) => {
    const [, t] = relationshipEnds(el);
    const target = xid(index.get(t));
    const h = { 'xmi:type': `uml:${SOURCE_OWNED[el._type]}`, 'xmi:id': xid(el), name: el.name || undefined };
    if (el._type === 'UMLGeneralization') return x('generalization', { ...h, general: target }, doc(el));
    if (el._type === 'UMLInterfaceRealization') {
      const [s] = relationshipEnds(el);
      return x('interfaceRealization', { ...h, client: xid(index.get(s)), supplier: target, contract: target, implementingClassifier: xid(index.get(s)) }, doc(el));
    }
    if (el._type === 'UMLInclude') return x('include', { ...h, addition: target }, doc(el));
    return x('extend', { ...h, extendedCase: target }, doc(el), constraint('condition', el, el.condition, '#condition'));
  };

  const writeDirected = (el, tag) => {
    const [s, t] = relationshipEnds(el);
    const xmiType = DIRECTED[el._type] ?? SOURCE_OWNED[el._type];
    const attrs = head(el, xmiType);
    if (el._type === 'UMLInformationFlow') {
      attrs.informationSource = xid(index.get(s));
      attrs.informationTarget = xid(index.get(t));
      const conveyed = String(el.conveyed ?? '').split(/\s*,\s*/).map((n) => byName.get(n) ?? [...exported].map((i) => index.get(i)).find((e) => e.name === n && e._type === 'UMLInformationItem')).filter(Boolean);
      if (conveyed.length) attrs.conveyed = conveyed.map(xid).join(' ');
    } else {
      attrs.client = xid(index.get(s));
      attrs.supplier = xid(index.get(t));
    }
    return x(tag, attrs, doc(el), el._type === 'UMLAbstraction' ? opaque('mapping', el, el.mapping, '#mapping') : null);
  };

  const writeAssociation = (el, tag) => {
    const ends = [el.end1, el.end2];
    const endIds = ends.map((e) => id(e._id));
    const navigable = ends.map((e, i) => (e.navigable === 'navigable' ? endIds[i] : null)).filter(Boolean);
    const xmiType = ASSOCIATIONS[el._type];
    const endNode = (e, i) => {
      const other = ends[1 - i];
      return x('ownedEnd', {
        'xmi:type': 'uml:Property', 'xmi:id': endIds[i], name: e.name || undefined, visibility: e.visibility && e.visibility !== 'public' ? e.visibility : undefined, association: xid(el),
        // UML puts the aggregation on the end typed by the part; ours sits at the whole's end.
        aggregation: other.aggregation && other.aggregation !== 'none' ? other.aggregation : undefined,
        isOrdered: bool(e.isOrdered), isReadOnly: bool(e.isReadOnly), isDerived: bool(e.isDerived), isUnique: bool(e.isUnique),
      }, doc(e), x('type', { 'xmi:idref': xid(index.get(e.reference)) }), multiplicity(e));
    };
    return x(tag, head(el, xmiType, { memberEnd: endIds.join(' '), navigableOwnedEnd: navigable.join(' ') || undefined, isDerived: bool(el.isDerived) }), doc(el), marker(el, xmiType), ends.map(endNode));
  };

  const writeExtension = (el, tag) => {
    const [st] = relationshipEnds(el);
    const endId = id(`${el._id}#end`);
    return x(tag, head(el, 'Extension', { memberEnd: `${endId} ${id(`${el._id}#base`)}` }), doc(el),
      x('ownedEnd', { 'xmi:type': 'uml:ExtensionEnd', 'xmi:id': endId, name: `extension_${index.get(st)?.name ?? ''}`, aggregation: 'composite', association: xid(el) },
        x('type', { 'xmi:idref': xid(index.get(st)) }), el.isRequired ? x('lowerValue', { 'xmi:type': 'uml:LiteralInteger', 'xmi:id': id(`${el._id}#lower`), value: '1' }) : null));
  };

  const writeConnector = (el) => x('ownedConnector', head(el, 'Connector', { kind: el.kind === 'delegation' ? 'delegation' : undefined, type: has(el.type) ? xid(index.get(el.type)) : undefined }), doc(el),
    [el.end1, el.end2].map((e) => x('end', { 'xmi:type': 'uml:ConnectorEnd', 'xmi:id': id(e._id), role: has(e.reference) ? xid(index.get(e.reference)) : undefined }, multiplicity(e))));

  // State machines
  const behaviorNode = (tag, owner, name, suffix) => (name ? x(tag, { 'xmi:type': 'uml:OpaqueBehavior', 'xmi:id': id(`${owner._id}${suffix}`), name }, text('body', name)) : null);
  const region = (r) => x('region', { 'xmi:type': 'uml:Region', 'xmi:id': xid(r), name: r.name || undefined }, doc(r),
    (r.vertices ?? []).filter((v) => exported.has(v._id)).map(vertex), (r.transitions ?? []).filter((t) => exported.has(t._id)).map(transition));
  const vertex = (v) => {
    const xmiType = TO_XMI[v._type];
    return x('subvertex', head(v, xmiType, { kind: v._type === 'UMLPseudostate' ? v.kind || 'initial' : undefined, submachine: has(v.submachine) ? xid(index.get(v.submachine)) : undefined }),
      doc(v), marker(v, xmiType), behaviorNode('entry', v, v.entryActivity, '#entry'), behaviorNode('doActivity', v, v.doActivity, '#do'), behaviorNode('exit', v, v.exitActivity, '#exit'),
      (v.regions ?? []).filter((r) => exported.has(r._id)).map(region));
  };
  const transition = (t) => {
    const guardId = t.guard ? id(`${t._id}#guard`) : undefined;
    return x('transition', head(t, 'Transition', { kind: t.kind && t.kind !== 'external' ? t.kind : undefined, source: xid(index.get(t.source)), target: xid(index.get(t.target)), guard: guardId }),
      doc(t), t.guard ? constraint('ownedRule', t, t.guard, '#guard') : null,
      String(t.triggers ?? '').split(/\s*,\s*/).filter(Boolean).map((name, i) => x('trigger', { 'xmi:type': 'uml:Trigger', 'xmi:id': id(`${t._id}#trigger${i}`), name })),
      behaviorNode('effect', t, t.effect, '#effect'));
  };

  // Activities
  const activityContent = (act) => {
    const out = [];
    const node = (n) => {
      if (!exported.has(n._id)) return null;
      const xmiType = xmiTypeOf(n, true);
      const pins = (list, kind) => (list ?? []).filter((p) => exported.has(p._id)).map((p) => x(xmiType === 'OpaqueAction' ? `${kind}Value` : kind === 'input' ? 'argument' : 'result', head(p, TO_XMI[p._type]), doc(p), typeNode(p.type), multiplicity(p)));
      const extra = {};
      if (n._type === 'UMLAction') {
        if (xmiType === 'CallBehaviorAction' && has(n.target)) extra.behavior = xid(index.get(n.target));
        if (xmiType === 'CallOperationAction' && has(n.target)) extra.operation = xid(index.get(n.target));
        if (xmiType === 'SendSignalAction' && has(n.target)) extra.signal = xid(index.get(n.target));
        extra.isLocallyReentrant = bool(n.isLocallyReentrant);
      }
      if (n._type === 'UMLInteractionUse' && has(n.refersTo)) extra.behavior = xid(index.get(n.refersTo));
      if (n._type === 'UMLExpansionRegion') extra.mode = n.mode || undefined;
      return x('node', head(n, xmiType, extra), doc(n), marker(n, xmiType), /ObjectNode|BufferNode|DataStore/.test(n._type) ? typeNode(n.type) : null, n._type === 'UMLAction' && xmiType === 'OpaqueAction' && n.body ? text('body', n.body) : null,
        pins(n.inputs, 'input'), pins(n.outputs, 'output'), (n.nodes ?? []).map(node));
    };
    for (const n of act.nodes ?? []) out.push(node(n));
    const edge = (e) => (exported.has(e._id) ? x('edge', head(e, TO_XMI[e._type], { source: xid(index.get(e.source)), target: xid(index.get(e.target)) }), doc(e),
      valueNode('guard', e, e.guard, '#guard'), valueNode('weight', e, e.weight, '#weight')) : null);
    for (const e of act.edges ?? []) out.push(edge(e));
    const group = (g) => (exported.has(g._id) ? x(g._type === 'UMLActivityPartition' && index.parent(g._id)?._type === 'UMLActivityPartition' ? 'subpartition' : 'group',
      head(g, TO_XMI[g._type], { represents: has(g.represents) ? xid(index.get(g.represents)) : undefined }), doc(g), (g.groups ?? []).map(group)) : null);
    for (const g of act.groups ?? []) out.push(group(g));
    return out;
  };

  // Interactions
  const interactionContent = (inter) => {
    const out = [];
    for (const l of inter.participants ?? []) {
      if (!exported.has(l._id)) continue;
      out.push(x('lifeline', head(l, 'Lifeline', { represents: has(l.represent) ? xid(index.get(l.represent)) : undefined }), doc(l), marker(l, 'Lifeline')));
    }
    const messages = (inter.messages ?? []).filter((m) => exported.has(m._id));
    for (const m of messages) {
      out.push(x('fragment', { 'xmi:type': 'uml:MessageOccurrenceSpecification', 'xmi:id': id(`${m._id}#send`), covered: xid(index.get(m.source)), message: xid(m) }));
      out.push(x('fragment', { 'xmi:type': 'uml:MessageOccurrenceSpecification', 'xmi:id': id(`${m._id}#receive`), covered: xid(index.get(m.target)), message: xid(m) }));
    }
    for (const f of inter.fragments ?? []) {
      if (!exported.has(f._id)) continue;
      if (f._type === 'UMLCombinedFragment') {
        out.push(x('fragment', head(f, 'CombinedFragment', { interactionOperator: f.interactionOperator || 'alt' }), doc(f), (f.operands ?? []).filter((o) => exported.has(o._id)).map((o) => x('operand', head(o, 'InteractionOperand'), doc(o),
          o.guard ? x('guard', { 'xmi:type': 'uml:InteractionConstraint', 'xmi:id': id(`${o._id}#guard`) }, opaque('specification', o, o.guard, '#guard.spec')) : null))));
      } else if (f._type === 'UMLInteractionUse') out.push(x('fragment', head(f, 'InteractionUse', { refersTo: has(f.refersTo) ? xid(index.get(f.refersTo)) : undefined }), doc(f)));
      else if (f._type === 'UMLStateInvariant') out.push(x('fragment', head(f, 'StateInvariant', { covered: has(f.covered) ? xid(index.get(f.covered)) : undefined }), doc(f), constraint('invariant', f, f.invariant, '#invariant')));
      else if (f._type === 'UMLDurationConstraint' || f._type === 'UMLTimeConstraint') out.push(x('ownedRule', head(f, TO_XMI[f._type]), doc(f), opaque('specification', f, f.specification, '#spec')));
    }
    for (const m of messages) {
      out.push(x('message', head(m, 'Message', { messageSort: m.messageSort || 'synchCall', sendEvent: id(`${m._id}#send`), receiveEvent: id(`${m._id}#receive`), signature: has(m.signature) ? xid(index.get(m.signature)) : undefined, connector: has(m.connector) ? xid(index.get(m.connector)) : undefined }),
        doc(m), m.arguments ? x('argument', { 'xmi:type': 'uml:LiteralString', 'xmi:id': id(`${m._id}#args`), value: m.arguments }) : null));
    }
    return out;
  };

  // Notes on the diagrams (EA only): comments owned by the diagram's package.
  const notes = new Map();
  const diagrams = [];
  const packageOf = (el) => { let p = el; while (p && p._type !== 'Project' && !(isPackage(p) && exported.has(p._id))) p = index.parent(p._id); return p ?? project; };
  if (ea) {
    walk(project, (el) => {
      if (!isUmlDiagram(el)) return;
      const owner = index.parent(el._id);
      if (!owner || (owner._type !== 'Project' && !exported.has(owner._id))) return;
      diagrams.push(el);
      for (const view of el.ownedViews ?? []) {
        if (view._type !== 'UMLNoteView') continue;
        const pkg = packageOf(owner);
        const linked = (el.ownedViews ?? []).filter((v) => v._type === 'UMLNoteLinkView' && (refId(v.tail) === view._id || refId(v.head) === view._id))
          .map((v) => el.ownedViews.find((o) => o._id === (refId(v.tail) === view._id ? refId(v.head) : refId(v.tail)))).filter((v) => v?.model && has(v.model));
        if (!notes.has(pkg._id)) notes.set(pkg._id, []);
        notes.get(pkg._id).push(x('ownedComment', { 'xmi:type': 'uml:Comment', 'xmi:id': id(view._id), body: view.text ?? '' }, linked.map((v) => x('annotatedElement', { 'xmi:idref': xid(index.get(v.model)) }))));
      }
    });
  }
  function notesOf(el) { return notes.get(el._id) ?? []; }

  // The model.
  const rootOut = [];
  const top = [];
  for (const el of project.ownedElements ?? []) {
    if (!exported.has(el._id)) continue;
    const node = write(el, 'packagedElement', rootOut);
    if (node) top.push(node);
  }
  if (localTypes.size) {
    top.push(x('packagedElement', { 'xmi:type': 'uml:Package', 'xmi:id': TYPES_PACKAGE, name: 'Types' },
      [...localTypes].map(([name, typeId]) => x('packagedElement', { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': typeId, name }))));
  }
  const profileApps = [...profilesUsed].map((pid) => x('profileApplication', { 'xmi:type': 'uml:ProfileApplication', 'xmi:id': id(`${pid}#application`) }, x('appliedProfile', { 'xmi:idref': xid(index.get(pid)) })));
  const rootId = id(project._id, 'EAPK');
  const rootDoc = project.documentation ? x('ownedComment', { 'xmi:type': 'uml:Comment', 'xmi:id': id(`${project._id}#doc`), body: project.documentation }, x('annotatedElement', { 'xmi:idref': rootId })) : null;
  const model = x('uml:Model', { 'xmi:type': 'uml:Model', 'xmi:id': rootId, name: project.name || 'Model', visibility: 'public' }, rootDoc, notesOf(project), profileApps, top, rootOut);

  const namespaces = { 'xmlns:xmi': XMI_NS, 'xmlns:uml': UML_NS };
  const prefixes = new Map();
  for (const app of stereotypeApps) {
    if (app.prefix === 'thecustomprofile') namespaces['xmlns:thecustomprofile'] = CUSTOM_PROFILE_NS;
    else if (!prefixes.has(app.prefix)) { prefixes.set(app.prefix, app.profile); namespaces[`xmlns:${app.prefix}`] = `http://www.myumlmaker.org/profiles/${encodeURIComponent(app.profile.name || app.prefix)}/1.0`; }
  }
  const apps = stereotypeApps.map((app) => x(`${app.prefix}:${app.name}`, { 'xmi:id': id(`${app.el._id}#stereotype`), [app.base]: xid(app.el) }));
  const children = [x('xmi:Documentation', { exporter: 'MyUMLMaker', exporterVersion: '1.0' }), model, ...apps];
  if (ea) {
    for (const [name, stubId] of stubs) children.push(x('EAStub', { 'xmi:id': stubId, name, UMLType: 'Class' }));
    children.push(eaExtension());
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${writeXml(x('xmi:XMI', namespaces, children))}\n`;

  // ── Enterprise Architect's extension: elements (notes, stereotypes, tags), connectors, diagrams.
  function eaExtension() {
    const elements = [];
    const connectors = [];
    for (const elId of exported) {
      const el = index.get(elId);
      const def = typeDef(el._type);
      if (def?.edge) {
        const [s, t] = relationshipEnds(el);
        const end = (side, endId) => { const e = index.get(endId); return x(side, { 'xmi:idref': xid(e) }, x('model', { type: xmiTypeOf(e) ?? 'Class', name: e.name || undefined })); };
        connectors.push(x('connector', { 'xmi:idref': xid(el) }, end('source', s), end('target', t),
          x('properties', { ea_type: EA_CONNECTOR[el._type] ?? 'Dependency', direction: ASSOCIATIONS[el._type] ? (el.end2?.navigable === 'navigable' ? 'Source -> Destination' : 'Unspecified') : 'Source -> Destination', stereotype: el._type === 'UMLInclude' ? 'include' : el._type === 'UMLExtend' ? 'extend' : undefined }),
          el.documentation ? x('documentation', { value: el.documentation }) : null));
        continue;
      }
      if (def?.feature || !(def?.shape || def?.namespace)) continue;
      const tags = (el.tags ?? []).filter((tg) => tg.name).map((tg) => x('tag', { 'xmi:id': id(tg._id), name: tg.name, value: tg.value ?? '', modelElement: xid(el) }));
      const stereo = el.stereotype ? (typeof el.stereotype === 'object' ? index.get(el.stereotype)?.name : el.stereotype) : '';
      const pkg = packageOf(index.parent(el._id));
      elements.push(x('element', { 'xmi:idref': xid(el), 'xmi:type': `uml:${xmiTypeOf(el) ?? 'Class'}`, name: el.name || undefined, scope: el.visibility || 'public' },
        x('model', { package: pkg._type === 'Project' ? id(project._id, 'EAPK') : xid(pkg), ea_eleType: isPackage(el) ? 'package' : 'element' }),
        x('properties', { documentation: el.documentation || undefined, isSpecification: 'false', sType: xmiTypeOf(el) ?? 'Class', stereotype: stereo || undefined, isAbstract: bool(el.isAbstract) }),
        tags.length ? x('tags', {}, tags) : null));
    }
    const diagramNodes = diagrams.map((d, n) => {
      const owner = index.parent(d._id);
      const pkg = packageOf(owner);
      const pkgId = pkg._type === 'Project' ? id(project._id, 'EAPK') : xid(pkg);
      const views = d.ownedViews ?? [];
      const boxes = new Map();
      const items = [];
      let seq = 0;
      for (const v of views) {
        if (v.tail || v.head) continue;
        const model = v.model ? index.get(v.model) : null;
        if (v._type === 'UMLNoteView') { /* a comment of the package */ } else if (!model || !exported.has(model._id)) continue;
        const size = estimateSize(v, model);
        const box = { x: Math.round(Number(v.left) || 0), y: Math.round(Number(v.top) || 0), w: Math.round(Number(v.width) || size.w), h: Math.round(Number(v.height) || size.h) };
        boxes.set(v._id, box);
        seq += 1;
        items.push(x('element', { geometry: `Left=${box.x};Top=${box.y};Right=${box.x + box.w};Bottom=${box.y + box.h};`, subject: v._type === 'UMLNoteView' ? id(v._id) : xid(model), seqno: String(seq), style: `DUID=${duidOf(v._id)};` }));
      }
      for (const v of views) {
        if (!(v.tail || v.head) || !boxes.has(refId(v.tail)) || !boxes.has(refId(v.head))) continue;
        let subject;
        if (v._type === 'UMLNoteLinkView') {
          subject = id(`${v._id}#notelink`);
          const [a, b] = [refId(v.tail), refId(v.head)].map((vid) => views.find((o) => o._id === vid));
          const endRef = (o) => (o._type === 'UMLNoteView' ? id(o._id) : o.model ? xid(index.get(o.model)) : null);
          if (!endRef(a) || !endRef(b)) continue;
          connectors.push(x('connector', { 'xmi:idref': subject }, x('source', { 'xmi:idref': endRef(a) }), x('target', { 'xmi:idref': endRef(b) }), x('properties', { ea_type: 'NoteLink', direction: 'Unspecified' })));
        } else {
          const model = v.model ? index.get(v.model) : null;
          if (!model || !exported.has(model._id)) continue;
          subject = xid(model);
        }
        const path = (v.points ?? []).length ? `Path=${v.points.map((p) => `${Math.round(p.x)}:${Math.round(p.y)}`).join('$')}$;` : '';
        const y = v._type === 'UMLMessageView' && v.y !== undefined ? `PtStartY=-${Math.round(v.y)};PtEndY=-${Math.round(v.y)};` : '';
        seq += 1;
        items.push(x('element', { geometry: `SX=0;SY=0;EX=0;EY=0;${y}${path}`, subject, seqno: String(seq), style: `Mode=3;EOID=${duidOf(refId(v.head))};SOID=${duidOf(refId(v.tail))};Color=-1;LWidth=0;Hidden=0;` }));
      }
      return x('diagram', { 'xmi:id': id(d._id) },
        x('model', { package: pkgId, localID: String(n + 1), owner: owner && owner._type !== 'Project' ? xid(owner) : pkgId }),
        x('properties', { name: d.name || '', type: EA_DIAGRAM[d._type], documentation: d.documentation || undefined, myumlmakerType: d._type }),
        x('project', { author: project.author || undefined, version: project.version || '1.0' }),
        x('style1', { value: 'ShowPrivate=1;ShowProtected=1;ShowPublic=1;HideRelationships=0;Locked=0;Border=1;HighlightForeign=1;PackageContents=1;' }),
        x('elements', {}, items));
    });
    for (const list of notes.values()) {
      for (const note of list) {
        elements.push(x('element', { 'xmi:idref': note.attrs['xmi:id'], 'xmi:type': 'uml:Note', scope: 'public' }, x('properties', { documentation: note.attrs.body, sType: 'Note' })));
      }
    }
    return x('xmi:Extension', { extender: 'Enterprise Architect', extenderID: '6.5' }, x('elements', {}, elements), x('connectors', {}, connectors), x('diagrams', {}, diagramNodes));
  }
}

// ───────────────────────── reading

const UML_PREFIXES = new Set(['uml', 'UML']);
const KNOWN_PREFIXES = new Set(['xmi', 'xsi', 'uml', 'UML', 'umldi', 'dc', 'di', 'dg', 'notation', 'ecore', 'xmlns']);
/** Child tags that carry values or references (read by their owner) or that have no counterpart here. */
const QUIET = new Set([
  'lowerValue', 'upperValue', 'defaultValue', 'type', 'specification', 'guard', 'trigger', 'effect', 'memberEnd', 'client', 'supplier', 'general', 'annotatedElement', 'body', 'language',
  'packageImport', 'elementImport', 'profileApplication', 'templateBinding', 'ownedTemplateSignature', 'templateParameter', 'eAnnotations', 'Extension', 'classifierBehavior', 'covered',
  'redefinedProperty', 'subsettedProperty', 'redefinedOperation', 'redefinedClassifier', 'raisedException', 'method', 'precondition', 'postcondition', 'bodyCondition', 'interfaceRealization',
  'navigableOwnedEnd', 'event', 'value', 'argument', 'result', 'entry', 'doActivity', 'exit', 'incoming', 'outgoing', 'inPartition', 'inInterruptibleRegion', 'node', 'edge',
  'ownedEnd', 'end', 'role', 'contract', 'implementingClassifier', 'addition', 'extendedCase', 'extensionLocation', 'condition', 'deploymentTarget', 'deployedArtifact', 'utilizedElement',
  'mapping', 'realizingClassifier', 'abstraction', 'conveyed', 'informationSource', 'informationTarget', 'realization', 'nestedArtifact', 'manifestation', 'ownedParameterSet',
  'interruptibleRegion', 'redefinedElement', 'redefinedNode', 'redefinedEdge', 'weight', 'selection', 'transformation', 'decisionInput', 'joinSpec', 'upperBound', 'inState',
  'ownedStereotype', 'icon', 'metaclassReference', 'metamodelReference', 'useCase', 'subject', 'powertypeExtent', 'substitution', 'ownedRule', 'invariant', 'operand', 'lifeline',
  'message', 'fragment', 'region', 'subvertex', 'transition', 'group', 'subpartition', 'ownedComment', 'slot', 'connectionPoint', 'deferrableTrigger', 'stateInvariant', 'generalOrdering',
  'formalGate', 'cfragmentGate', 'actualGate', 'returnValue', 'returnValueRecipient', 'represents', 'selector', 'decomposedAs', 'coveredBy', 'instance', 'definingFeature',
]);

/** Reads XMI text. Returns { project, warnings } (warnings: short English texts). Never throws. */
export function readXmi(source) {
  const warnings = [];
  const warn = (message) => { if (warnings.length < 300 && !warnings.includes(message)) warnings.push(message); };
  const project = { _type: 'Project', _id: newId(), name: 'Imported', author: '', company: '', copyright: '', version: '1.0', documentation: '', ownedElements: [] };
  let parsed;
  try { parsed = parseXml(source); } catch (error) { parsed = { root: null, warnings: [String(error?.message ?? error)] }; }
  for (const w of parsed.warnings) warn(`XML: ${w}`);
  try {
    readInto(project, parsed.root, warn);
  } catch (error) {
    warn(`Reading stopped: ${error?.message ?? error}`);
  }
  if (!project.ownedElements.some((e) => e._type === 'UMLModel' || e._type === 'UMLPackage' || e._type === 'UMLProfile')) {
    project.ownedElements.unshift({ _type: 'UMLModel', _id: newId(), name: 'Model', visibility: 'public', ownedElements: [] });
  }
  linkParents(project);
  return { project, warnings };
}

/** XMI text → our project (warnings are on project.warnings, not saved). */
export function importXmi(source) {
  const { project, warnings } = readXmi(source);
  Object.defineProperty(project, 'warnings', { value: warnings, enumerable: false, configurable: true, writable: true });
  return project;
}

/** True when the text looks like XMI (or a UML model written as XML). */
export const looksLikeXmi = (source) => /<(xmi:XMI|XMI\b|uml:Model|uml:Package|uml:Profile)/.test(String(source ?? '').slice(0, 4000));

function readInto(project, root, warn) {
  if (!root) { warn('No XMI content found'); return; }
  if (localName(root.name) === 'XMI' && firstChild(root, 'XMI.content')) { warn('XMI 1.x (UML 1.x) files are not supported; export XMI 2.1 or later'); return; }
  // Prefixes bound to a UML namespace.
  const umlPrefixes = new Set(UML_PREFIXES);
  for (const node of [root, ...root.children]) {
    for (const [key, value] of Object.entries(node.attrs)) {
      if (key.startsWith('xmlns:') && /UML/i.test(value) && !/UMLDI|\/DI\b|\/DD\b|notation|Profile|SysML|DC$/i.test(value)) umlPrefixes.add(key.slice(6));
    }
  }
  const isUmlTag = (name) => umlPrefixes.has(prefixOf(name));
  const xtype = (node) => {
    const t = node.attrs['xmi:type'];
    if (t) return localName(t);
    return isUmlTag(node.name) ? localName(node.name) : '';
  };
  const xid = (node) => node.attrs['xmi:id'] ?? node.attrs['xmi.id'] ?? node.attrs.id ?? null;
  const hrefId = (href) => { const at = String(href ?? '').lastIndexOf('#'); return at < 0 ? '' : String(href).slice(at + 1); };
  /** Ids in an attribute (space separated) and in child elements of that name. */
  const idrefs = (node, key) => {
    const out = String(node.attrs[key] ?? '').split(/\s+/).filter(Boolean);
    for (const child of childrenNamed(node, key)) {
      const value = child.attrs['xmi:idref'] ?? child.attrs['xmi:id'] ?? (child.attrs.href ? `#href:${child.attrs.href}` : null);
      if (value) out.push(value);
    }
    return out;
  };
  const idref = (node, key) => idrefs(node, key)[0] ?? null;
  const bodyOf = (node) => {
    if (!node) return '';
    if (node.attrs.body !== undefined) return node.attrs.body;
    const bodies = childrenNamed(node, 'body').map((b) => b.text.trim()).filter(Boolean);
    if (bodies.length) return bodies.join('\n');
    if (node.attrs.value !== undefined) return node.attrs.value;
    const spec = firstChild(node, 'specification');
    if (spec) return bodyOf(spec);
    return node.attrs.name ?? '';
  };

  const els = new Map();
  const props = new Map();
  const comments = new Map();
  const stubs = new Map();
  const covered = new Map();
  const pending = [];
  const rootIds = new Set();
  const label = (node) => `${node.attrs['xmi:type'] ?? node.name}${node.attrs.name ? ` "${node.attrs.name}"` : ''}`;

  let defaultModel = null;
  let rootName = '';
  const defaultOwner = () => {
    if (!defaultModel) { defaultModel = make('UMLModel', null, { name: rootName || 'Model' }); insertElement(project, defaultModel); }
    return defaultModel;
  };
  const resolve = (id) => {
    if (!id) return null;
    if (rootIds.has(id)) return defaultOwner();
    return els.get(id) ?? null;
  };

  function make(type, node, extra = {}) {
    const el = createElement(type, { name: node?.attrs.name ?? '', ...extra });
    const id = node ? xid(node) : null;
    if (id && !els.has(id)) el._id = id;
    else if (id) warn(`Duplicate id ${id}`);
    if (node) {
      for (const field of fieldsOf(type)) {
        const value = node.attrs[field.key];
        if (value === undefined) continue;
        if (field.type === 'bool') el[field.key] = value === 'true' || value === '1';
        else if (field.type === 'enum' && field.options.includes(value)) el[field.key] = value;
      }
      if (type === 'UMLArtifact' && node.attrs.fileName) el.fileName = node.attrs.fileName;
      els.set(el._id, el);
      // MyUMLMaker's own type marker.
      for (const ext of childrenNamed(node, 'Extension')) {
        const mt = firstChild(ext, 'modelType');
        if (mt?.attrs.kind && el._type === 'UMLAction') el.kind = mt.attrs.kind;
        for (const key of MARKER_FIELDS[type] ?? []) if (mt?.attrs[key] !== undefined) el[key] = mt.attrs[key];
      }
    }
    return el;
  }
  const markerType = (node) => {
    for (const ext of childrenNamed(node, 'Extension')) {
      if (ext.attrs.extender !== 'MyUMLMaker') continue;
      const value = firstChild(ext, 'modelType')?.attrs.value;
      if (value && TYPES[value]) return value;
    }
    return null;
  };
  const add = (owner, el) => insertElement(owner, el);

  // Types: a reference to a classifier of the file, or a type name.
  const typeOf = (node) => {
    const attr = node.attrs.type;
    const child = firstChild(node, 'type');
    const raw = attr ?? child?.attrs['xmi:idref'] ?? (child?.attrs.href ? `#href:${child.attrs.href}` : null);
    if (!raw && child && child.attrs.name) return { name: child.attrs.name };
    return raw ? { raw } : null;
  };
  const typeValue = (t) => {
    if (!t) return '';
    if (t.name) return t.name;
    const raw = t.raw;
    if (raw.startsWith('#href:')) {
      const frag = hrefId(raw.slice(6));
      const target = els.get(frag);
      if (target && !typeDef(target._type)?.feature) return ref(target);
      return /^[A-Za-z][\w ]*$/.test(frag) && !/^_|\d{6,}/.test(frag) ? frag : '';
    }
    const target = els.get(raw);
    if (target && !typeDef(target._type)?.feature && !typeDef(target._type)?.edge) return ref(target);
    if (stubs.has(raw)) return stubs.get(raw);
    const m = /^EA[A-Za-z#+]*_(.+)$/.exec(raw);
    if (m && !/^ID_|^PK_/.test(raw.slice(2))) return m[1];
    if (/^EA(ID|PK)_/.test(raw)) warn(`Type ${raw} is not in the file`);
    return '';
  };
  const setType = (el, node) => { const t = typeOf(node); if (t) pending.push(() => { el.type = typeValue(t); }); };
  const readMultiplicity = (node, end = false) => {
    const lo = firstChild(node, 'lowerValue');
    const up = firstChild(node, 'upperValue');
    if (!lo && !up && node.attrs.lower === undefined && node.attrs.upper === undefined) return '';
    const value = (n, fallback) => (n ? n.attrs.value ?? (localName(n.attrs['xmi:type'] ?? '') === 'LiteralUnlimitedNatural' ? fallback : '0') : undefined);
    const text = multiplicityText(value(lo, '0') ?? node.attrs.lower, value(up, '0') ?? node.attrs.upper);
    return !end && text === '1' ? '' : text;
  };
  const readValue = (node) => {
    if (!node) return '';
    const kind = localName(node.attrs['xmi:type'] ?? '');
    if (kind === 'LiteralNull') return '';
    if (node.attrs.value !== undefined) return node.attrs.value;
    if (kind === 'InstanceValue') { const inst = idref(node, 'instance'); return { instance: inst }; }
    const body = childrenNamed(node, 'body').map((b) => b.text.trim()).join('\n') || node.attrs.body || '';
    if (body) return body;
    if (kind === 'LiteralBoolean') return 'false';
    if (kind === 'LiteralInteger' || kind === 'LiteralReal') return '0';
    return node.attrs.name ?? '';
  };
  const setValue = (el, key, node) => {
    const v = readValue(node);
    if (v && typeof v === 'object') pending.push(() => { el[key] = resolve(v.instance)?.name ?? ''; });
    else if (v !== '') el[key] = v;
  };

  // Comments: documentation of their owner, or notes shown on a diagram.
  const readComment = (node, owner) => {
    const id = xid(node) ?? newId();
    comments.set(id, { body: bodyOf(node), annotated: idrefs(node, 'annotatedElement'), owner, used: false });
  };
  const appendDoc = (el, body) => {
    if (!el || !body) return;
    const current = String(el.documentation ?? '');
    if (current.includes(body)) return;
    el.documentation = current ? `${current}\n${body}` : body;
  };

  // ── elements
  const buildElement = (node, owner) => {
    const t = xtype(node);
    if (xid(node) === TYPES_PACKAGE || (xid(node) ?? '').startsWith(`${TYPES_PACKAGE}`)) {
      for (const child of descendants(node)) if (xid(child)) stubs.set(xid(child), child.attrs.name ?? '');
      return null;
    }
    let type = markerType(node) ?? FROM_XMI[t];
    if (!type) { if (t) warn(`Skipped ${label(node)}`); return null; }
    if (DIRECTED[type] || SOURCE_OWNED[type] || type === 'UMLExtension' || ASSOCIATIONS[type]) { buildRelationship(node, owner, type); return null; }
    if (t === 'AssociationClass') { warn(`Association class ${node.attrs.name ?? ''} read as a class and an association`); buildRelationship(node, owner, 'UMLAssociation', newId()); }
    if (owner._type === 'Project' && !PACKAGES[type]) owner = defaultOwner();
    if (owner._type === 'Project' && type === 'UMLPackage') type = 'UMLModel';
    const def = typeDef(type);
    if (!def) return null;
    // Activity nodes or other parts met as packaged elements: kept in the right owner when possible.
    if (FROM_XMI[t] && (OTHER[type] || ACTIVITY_NODES[type]) && !CLASSIFIERS[type]) { warn(`Skipped ${label(node)} outside its owner`); return null; }
    const el = make(type, node);
    if (INSTANCES[type]) { const cls = idref(node, 'classifier'); if (cls) pending.push(() => { const c = resolve(cls); if (c) el.classifier = ref(c); }); }
    add(owner, el);
    readChildren(node, el);
    return el;
  };

  const readChildren = (node, el) => {
    for (const child of node.children) {
      const tag = localName(child.name);
      const t = xtype(child);
      switch (tag) {
        case 'packagedElement': case 'nestedClassifier': case 'ownedBehavior': case 'ownedUseCase': case 'nestedNode': case 'ownedMember': case 'nestedPackage': case 'ownedType':
          buildElement(child, el); break;
        case 'ownedAttribute': buildProperty(child, el); break;
        case 'ownedOperation': buildOperation(child, el); break;
        case 'ownedLiteral': { const l = make('UMLEnumerationLiteral', child); add(el, l); readOwnedComments(child, l); break; }
        case 'ownedReception': { const r = make('UMLReception', child); add(el, r); const sig = idref(child, 'signal'); if (sig) pending.push(() => { const s = resolve(sig); if (s) r.signal = ref(s); }); break; }
        case 'extensionPoint': add(el, make('UMLExtensionPoint', child)); break;
        case 'generalization': sourceOwned(child, el, 'UMLGeneralization', 'general'); break;
        case 'interfaceRealization': sourceOwned(child, el, 'UMLInterfaceRealization', child.attrs.contract || firstChild(child, 'contract') ? 'contract' : 'supplier'); break;
        case 'include': sourceOwned(child, el, 'UMLInclude', 'addition'); break;
        case 'extend': sourceOwned(child, el, 'UMLExtend', 'extendedCase'); break;
        case 'deployment': case 'manifestation': case 'realization': case 'substitution': buildRelationship(child, el, markerType(child) ?? FROM_XMI[t] ?? (tag === 'deployment' ? 'UMLDeployment' : tag === 'manifestation' ? 'UMLManifestation' : 'UMLRealization')); break;
        case 'ownedComment': readComment(child, el); break;
        case 'ownedRule': buildRule(child, el); break;
        case 'ownedConnector': buildConnector(child, el); break;
        case 'slot': buildSlot(child, el); break;
        case 'region': buildRegion(child, el); break;
        case 'node': case 'ownedNode': if (/Activity|Structured|Expansion|Loop|Conditional|Sequence/.test(el._type)) buildActivityNode(child, el); break;
        case 'edge': if (el._type === 'UMLActivity') buildFlow(child, el); break;
        case 'group': case 'ownedGroup': case 'subpartition': buildGroup(child, el); break;
        case 'lifeline': buildLifeline(child, el); break;
        case 'fragment': buildFragment(child, el); break;
        case 'message': buildMessage(child, el); break;
        default:
          if (!QUIET.has(tag) && child.attrs['xmi:type']) warn(`Skipped ${tag} ${label(child)}`);
      }
    }
  };
  const readOwnedComments = (node, el) => { for (const c of childrenNamed(node, 'ownedComment')) readComment(c, el); };

  const buildProperty = (node, owner) => {
    const id = xid(node);
    if (id) props.set(id, { node, owner });
    if (node.attrs.association || firstChild(node, 'association')) return null;
    const t = xtype(node);
    const type = markerType(node) ?? (t === 'Port' ? 'UMLPort' : 'UMLAttribute');
    const el = make(type, node);
    setType(el, node);
    el.multiplicity = readMultiplicity(node, type !== 'UMLAttribute');
    setValue(el, 'defaultValue', firstChild(node, 'defaultValue'));
    if (type === 'UMLPort' && node.attrs.isService === 'false') el.isService = false;
    add(owner, el);
    readOwnedComments(node, el);
    return el;
  };
  const buildOperation = (node, owner) => {
    const el = make('UMLOperation', node);
    add(owner, el);
    for (const p of childrenNamed(node, 'ownedParameter')) {
      const param = make('UMLParameter', p);
      setType(param, p);
      param.multiplicity = readMultiplicity(p);
      setValue(param, 'defaultValue', firstChild(p, 'defaultValue'));
      add(el, param);
      readOwnedComments(p, param);
    }
    // UML 1 style return type on the operation.
    if (!childrenNamed(node, 'ownedParameter').some((p) => p.attrs.direction === 'return') && (node.attrs.type || firstChild(node, 'type'))) {
      const param = make('UMLParameter', null, { name: '', direction: 'return' });
      setType(param, node);
      add(el, param);
    }
    const raised = idrefs(node, 'raisedException');
    if (raised.length) pending.push(() => { el.raisedExceptions = raised.map((r) => { const v = typeValue({ raw: r }); return typeof v === 'object' ? resolve(v.$ref)?.name : v; }).filter(Boolean).join(', '); });
    readOwnedComments(node, el);
    return el;
  };
  const buildRule = (node, owner) => {
    const t = xtype(node);
    const type = t === 'DurationConstraint' ? 'UMLDurationConstraint' : t === 'TimeConstraint' ? 'UMLTimeConstraint' : 'UMLConstraint';
    if (type !== 'UMLConstraint' && owner._type !== 'UMLInteraction') return;
    const el = make(type, node);
    el.specification = bodyOf(firstChild(node, 'specification'));
    const constrained = idrefs(node, 'constrainedElement');
    if (type === 'UMLConstraint' && constrained.length) pending.push(() => { el.constrainedElements = constrained.map(resolve).filter(Boolean).map(ref); });
    add(owner, el);
  };
  const buildSlot = (node, owner) => {
    const el = make('UMLSlot', node);
    const feature = idref(node, 'definingFeature');
    if (feature) pending.push(() => { const f = resolve(feature); if (f) el.definingFeature = ref(f); });
    setValue(el, 'value', firstChild(node, 'value'));
    add(owner, el);
  };
  const buildConnector = (node, owner) => {
    const ends = childrenNamed(node, 'end');
    pending.push(() => {
      const roles = ends.map((e) => resolve(idref(e, 'role')));
      if (roles.length < 2 || !roles[0] || !roles[1]) { warn(`Skipped connector ${node.attrs.name ?? xid(node) ?? ''}: an end is missing`); return; }
      const el = make('UMLConnector', node, { end1: { reference: ref(roles[0]), multiplicity: readMultiplicity(ends[0], true) }, end2: { reference: ref(roles[1]), multiplicity: readMultiplicity(ends[1], true) } });
      if (ends[0] && xid(ends[0])) el.end1._id = xid(ends[0]);
      if (ends[1] && xid(ends[1])) el.end2._id = xid(ends[1]);
      const type = resolve(node.attrs.type);
      if (type) el.type = ref(type);
      add(owner, el);
      readOwnedComments(node, el);
    });
  };

  // Relationships: made once every element exists.
  const sourceOwned = (node, owner, type, key) => {
    pending.push(() => {
      const target = resolve(idref(node, key));
      if (!target) { warn(`Skipped ${label(node)}: its target is not in the file`); return; }
      const el = make(type, node, { source: ref(owner), target: ref(target) });
      if (type === 'UMLExtend') { const c = firstChild(node, 'condition'); if (c) el.condition = bodyOf(c); }
      add(owner, el);
      readOwnedComments(node, el);
    });
  };
  const buildRelationship = (node, owner, type, forcedId = null) => {
    if (owner._type === 'Project') owner = defaultOwner();
    pending.push(() => {
      if (ASSOCIATIONS[type]) return buildAssociation(node, owner, type, forcedId);
      if (type === 'UMLExtension') return buildExtension(node, owner);
      let s; let t;
      if (type === 'UMLInformationFlow') { s = idref(node, 'informationSource'); t = idref(node, 'informationTarget'); }
      if (!s) s = idref(node, 'client');
      if (!t) t = idref(node, 'supplier');
      if (type === 'UMLManifestation') t = idref(node, 'utilizedElement') ?? t;
      const parentIsSource = !s && (localName(node.name) === 'deployment' || localName(node.name) === 'manifestation' || localName(node.name) === 'realization');
      let source = parentIsSource ? owner : resolve(s);
      let target = resolve(t);
      if (localName(node.name) === 'deployment' && !s) { source = resolve(idref(node, 'deployedArtifact')); target = owner; }
      if (localName(node.name) === 'realization' && !s) { source = resolve(idref(node, 'realizingClassifier')); target = owner; }
      if (!source || !target) { warn(`Skipped ${label(node)}: an end is not in the file`); return; }
      const el = make(type, node, { source: ref(source), target: ref(target) });
      if (type === 'UMLInformationFlow') { const conveyed = idrefs(node, 'conveyed').map(resolve).filter(Boolean).map((c) => c.name); if (conveyed.length) el.conveyed = conveyed.join(', '); }
      if (type === 'UMLAbstraction') { const m = firstChild(node, 'mapping'); if (m) el.mapping = bodyOf(m); }
      add(owner, el);
      readOwnedComments(node, el);
    });
  };
  const buildAssociation = (node, owner, type, forcedId) => {
    let ends = idrefs(node, 'memberEnd');
    const owned = childrenNamed(node, 'ownedEnd');
    for (const e of owned) if (xid(e)) props.set(xid(e), { node: e, owner: null });
    if (ends.length < 2) ends = owned.map(xid).filter(Boolean);
    const navigable = new Set(idrefs(node, 'navigableOwnedEnd'));
    const infos = ends.slice(0, 2).map((endId) => {
      const p = props.get(endId);
      if (!p) return null;
      const target = typeValue(typeOf(p.node) ?? { raw: '' });
      const element = target && typeof target === 'object' ? resolve(target.$ref) : null;
      return { id: endId, node: p.node, element, navigable: Boolean(p.owner) || navigable.has(endId) || p.node.attrs.isNavigable === 'true' };
    });
    if (infos.length < 2 || !infos[0]?.element || !infos[1]?.element) { warn(`Skipped ${label(node)}: an end is not in the file`); return; }
    const bothNavigable = infos[0].navigable && infos[1].navigable;
    // UML's member ends have no order. Ours do (end1 is where the line starts): EA's connector
    // source when there is one, else the end one can navigate to goes last.
    const source = eaSource.get(xid(node));
    if (source ? source === infos[1].element._id && source !== infos[0].element._id : infos[0].navigable && !infos[1].navigable) infos.reverse();
    const end = (info, other) => ({
      _id: info.id, name: info.node.attrs.name ?? '', reference: ref(info.element), multiplicity: readMultiplicity(info.node, true),
      navigable: info.navigable && !bothNavigable ? 'navigable' : 'unspecified',
      aggregation: ['shared', 'composite'].includes(other.node.attrs.aggregation) ? other.node.attrs.aggregation : 'none',
      visibility: ['public', 'protected', 'private', 'package'].includes(info.node.attrs.visibility) ? info.node.attrs.visibility : 'public',
      isOrdered: info.node.attrs.isOrdered === 'true', isReadOnly: info.node.attrs.isReadOnly === 'true', isDerived: info.node.attrs.isDerived === 'true', isUnique: info.node.attrs.isUnique === 'true',
    });
    let finalType = type;
    if (type === 'UMLAssociation' && INSTANCES[infos[0].element._type] && INSTANCES[infos[1].element._type]) finalType = 'UMLLink';
    const e1 = end(infos[0], infos[1]);
    const e2 = end(infos[1], infos[0]);
    const el = make(finalType, forcedId ? { ...node, attrs: { ...node.attrs, 'xmi:id': forcedId } } : node, { end1: e1, end2: e2 });
    el.end1._id = e1._id; el.end2._id = e2._id;
    add(owner, el);
    readOwnedComments(node, el);
  };
  const buildExtension = (node, owner) => {
    const ownedEnd = childrenNamed(node, 'ownedEnd')[0];
    const ends = idrefs(node, 'memberEnd');
    const stereoType = ownedEnd ? typeValue(typeOf(ownedEnd)) : '';
    const stereotype = stereoType && typeof stereoType === 'object' ? resolve(stereoType.$ref) : null;
    const baseId = ends.find((e) => e !== xid(ownedEnd ?? { attrs: {} }));
    const base = baseId ? props.get(baseId) : null;
    let meta = null;
    if (base) {
      const t = typeOf(base.node);
      const v = typeValue(t);
      if (v && typeof v === 'object') meta = resolve(v.$ref);
      else {
        const name = v || String(base.node.attrs.name ?? '').replace(/^base_/, '');
        const profile = stereotype ? (function findProfile() { let p = null; walk(project, (e) => { if (!p && e._type === 'UMLProfile' && (e.ownedElements ?? []).includes(stereotype)) p = e; }); return p; }()) : null;
        const holder = profile ?? owner;
        meta = (holder.ownedElements ?? []).find((e) => e._type === 'UMLMetaClass' && e.name === name) ?? null;
        if (!meta && name) { meta = make('UMLMetaClass', null, { name }); add(holder, meta); }
      }
    }
    if (!stereotype || !meta) { warn(`Skipped ${label(node)}: its stereotype or metaclass is missing`); return; }
    const el = make('UMLExtension', node, { source: ref(stereotype), target: ref(meta), isRequired: ownedEnd ? readMultiplicity(ownedEnd, true).startsWith('1') : false });
    add(owner, el);
  };

  // State machines
  const buildRegion = (node, owner) => {
    const r = make('UMLRegion', node);
    add(owner, r);
    for (const v of childrenNamed(node, 'subvertex')) buildVertex(v, r);
    for (const t of childrenNamed(node, 'transition')) buildTransition(t, r);
    readOwnedComments(node, r);
  };
  const buildVertex = (node, region) => {
    const t = xtype(node);
    let type = markerType(node) ?? { State: 'UMLState', Pseudostate: 'UMLPseudostate', FinalState: 'UMLFinalState' }[t];
    if (!type) { warn(`Skipped ${label(node)}`); return; }
    if (type === 'UMLState' && (node.attrs.submachine || firstChild(node, 'submachine'))) type = 'UMLSubmachineState';
    const el = make(type, node);
    if (type === 'UMLPseudostate' && !node.attrs.kind) el.kind = 'initial';
    for (const [tag, key] of [['entry', 'entryActivity'], ['doActivity', 'doActivity'], ['exit', 'exitActivity']]) { const b = firstChild(node, tag); if (b) el[key] = bodyOf(b); }
    const sub = idref(node, 'submachine');
    if (sub) pending.push(() => { const s = resolve(sub); if (s) el.submachine = ref(s); });
    add(region, el);
    for (const r of childrenNamed(node, 'region')) buildRegion(r, el);
    readOwnedComments(node, el);
  };
  const buildTransition = (node, region) => {
    pending.push(() => {
      const source = resolve(idref(node, 'source'));
      const target = resolve(idref(node, 'target'));
      if (!source || !target) { warn(`Skipped ${label(node)}: an end is missing`); return; }
      const el = make('UMLTransition', node, { source: ref(source), target: ref(target) });
      const guardId = node.attrs.guard;
      const guardNode = guardId ? node.children.find((c) => xid(c) === guardId) : firstChild(node, 'guard') ?? firstChild(node, 'ownedRule');
      if (guardNode) el.guard = bodyOf(guardNode);
      const triggers = childrenNamed(node, 'trigger').map((tr) => tr.attrs.name || resolve(idref(tr, 'event'))?.name || '').filter(Boolean);
      if (triggers.length) el.triggers = triggers.join(', ');
      const effect = firstChild(node, 'effect');
      if (effect) el.effect = effect.attrs.name || bodyOf(effect);
      add(region, el);
      readOwnedComments(node, el);
    });
  };

  // Activities
  const buildActivityNode = (node, owner) => {
    const t = xtype(node);
    const marked = markerType(node);
    let type = marked ?? (ACTION_FROM[t] || /Action$/.test(t) ? 'UMLAction' : FROM_XMI[t]);
    if (!type || !(ACTIVITY_NODES[type] || type === 'UMLAction' || type === 'UMLInteractionUse')) { warn(`Skipped ${label(node)}`); return; }
    const el = make(type, node);
    if (type === 'UMLAction' && !marked) el.kind = ACTION_FROM[t] ?? (t === 'AcceptCallAction' ? 'acceptSignal' : 'opaque');
    else if (type === 'UMLAction' && el.kind === undefined) el.kind = ACTION_FROM[t] ?? 'opaque';
    if (type === 'UMLAction') {
      const body = childrenNamed(node, 'body').map((b) => b.text.trim()).filter(Boolean).join('\n') || node.attrs.body || '';
      if (body) el.body = body;
      const target = node.attrs.behavior ?? node.attrs.operation ?? node.attrs.signal ?? idref(node, 'behavior') ?? idref(node, 'operation') ?? idref(node, 'signal');
      if (target) pending.push(() => { const r = resolve(target); if (r) el.target = ref(r); });
    }
    if (type === 'UMLInteractionUse') { const b = node.attrs.behavior ?? idref(node, 'behavior'); if (b) pending.push(() => { const r = resolve(b); if (r) el.refersTo = ref(r); }); }
    if (/ObjectNode|BufferNode|DataStore/.test(type)) setType(el, node);
    add(owner, el);
    for (const child of node.children) {
      const ct = xtype(child);
      const pin = FROM_XMI[ct] === 'UMLInputPin' || FROM_XMI[ct] === 'UMLOutputPin' ? FROM_XMI[ct] : null;
      if (pin && type === 'UMLAction') { const p = make(pin, child); setType(p, child); p.multiplicity = readMultiplicity(child); add(el, p); }
      else if (localName(child.name) === 'node') buildActivityNode(child, el);
    }
    readOwnedComments(node, el);
  };
  const buildFlow = (node, activity) => {
    const t = xtype(node);
    const type = { ControlFlow: 'UMLControlFlow', ObjectFlow: 'UMLObjectFlow' }[t];
    if (!type) { warn(`Skipped ${label(node)}`); return; }
    pending.push(() => {
      const source = resolve(idref(node, 'source'));
      const target = resolve(idref(node, 'target'));
      if (!source || !target) { warn(`Skipped ${label(node)}: an end is missing`); return; }
      const el = make(type, node, { source: ref(source), target: ref(target) });
      const guard = firstChild(node, 'guard');
      if (guard) { const g = readValue(guard); if (typeof g === 'string' && g !== 'true') el.guard = g; }
      const weight = firstChild(node, 'weight');
      if (weight) { const w = readValue(weight); if (typeof w === 'string' && w !== '1') el.weight = w; }
      add(activity, el);
      readOwnedComments(node, el);
    });
  };
  const buildGroup = (node, owner) => {
    const t = xtype(node);
    const type = { ActivityPartition: 'UMLActivityPartition', InterruptibleActivityRegion: 'UMLInterruptibleActivityRegion' }[t];
    if (!type) { warn(`Skipped ${label(node)}`); return; }
    const el = make(type, node);
    const represents = idref(node, 'represents');
    if (represents) pending.push(() => { const r = resolve(represents); if (r) el.represents = ref(r); });
    add(owner, el);
    for (const sub of childrenNamed(node, 'subpartition')) buildGroup(sub, el);
  };

  // Interactions
  const buildLifeline = (node, interaction) => {
    const el = make(markerType(node) === 'UMLTimingLifeline' ? 'UMLTimingLifeline' : 'UMLLifeline', node);
    const represents = idref(node, 'represents');
    if (represents) pending.push(() => { const r = resolve(represents); if (r) el.represent = ref(r); });
    add(interaction, el);
    readOwnedComments(node, el);
  };
  const buildFragment = (node, interaction) => {
    const t = xtype(node);
    const id = xid(node);
    const cov = idrefs(node, 'covered');
    if (/OccurrenceSpecification$|^ExecutionSpecification$|ExecutionSpecification$/.test(t)) { if (id && cov[0]) covered.set(id, cov[0]); return; }
    if (t === 'CombinedFragment') {
      const el = make('UMLCombinedFragment', node);
      add(interaction, el);
      for (const operand of childrenNamed(node, 'operand')) {
        const o = make('UMLInteractionOperand', operand);
        const guard = firstChild(operand, 'guard');
        if (guard) o.guard = bodyOf(guard);
        add(el, o);
        for (const f of childrenNamed(operand, 'fragment')) buildFragment(f, interaction);
      }
      readOwnedComments(node, el);
      return;
    }
    if (t === 'InteractionUse') {
      const el = make('UMLInteractionUse', node);
      const r = idref(node, 'refersTo');
      if (r) pending.push(() => { const target = resolve(r); if (target) el.refersTo = ref(target); });
      add(interaction, el);
      return;
    }
    if (t === 'StateInvariant') {
      const el = make('UMLStateInvariant', node);
      el.invariant = bodyOf(firstChild(node, 'invariant'));
      if (cov[0]) pending.push(() => { const l = resolve(cov[0]); if (l) el.covered = ref(l); });
      add(interaction, el);
      return;
    }
    if (t === 'Continuation') { add(interaction, make('UMLContinuation', node)); return; }
    if (t && t !== 'Gate') warn(`Skipped ${label(node)}`);
  };
  const buildMessage = (node, interaction) => {
    pending.push(() => {
      const send = node.attrs.sendEvent ?? idref(node, 'sendEvent');
      const receive = node.attrs.receiveEvent ?? idref(node, 'receiveEvent');
      const source = resolve(covered.get(send));
      const target = resolve(covered.get(receive));
      if (!source || !target) { warn(`Skipped message ${node.attrs.name ?? ''}: it has no sending or receiving lifeline`); return; }
      const el = make('UMLMessage', node, { source: ref(source), target: ref(target) });
      const connectorId = node.attrs.connector ?? idref(node, 'connector');
      // Connectors are made by pending work too: looked up once they exist.
      if (connectorId) pending.push(() => { const c = resolve(connectorId); if (c) el.connector = ref(c); });
      const sig = node.attrs.signature ?? idref(node, 'signature');
      if (sig) { const s = resolve(sig); if (s) el.signature = ref(s); }
      const args = childrenNamed(node, 'argument').map((a) => { const v = readValue(a); return typeof v === 'string' ? v : ''; }).filter(Boolean);
      if (args.length) el.arguments = args.join(', ');
      add(interaction, el);
      readOwnedComments(node, el);
    });
  };

  // ── the top of the file
  const top = localName(root.name) === 'XMI' ? root.children : [root];
  const roots = [];
  const extensions = [];
  const stereotypeApps = [];
  const diNodes = [];
  for (const node of top) {
    const tag = localName(node.name);
    const prefix = prefixOf(node.name);
    const t = xtype(node);
    if (isUmlTag(node.name) || (t && FROM_XMI[t] && !prefix)) { roots.push(node); continue; }
    if (tag === 'Extension') { extensions.push(node); continue; }
    if (tag === 'Documentation') continue;
    if (tag === 'EAStub') { if (xid(node)) stubs.set(xid(node), node.attrs.name ?? ''); continue; }
    if (prefix === 'umldi' || prefix === 'notation' || /^umldi:|^notation:/.test(node.attrs['xmi:type'] ?? '')) { diNodes.push(node); continue; }
    if (prefix && !KNOWN_PREFIXES.has(prefix) && Object.keys(node.attrs).some((k) => k.startsWith('base_'))) { stereotypeApps.push(node); continue; }
    if (prefix && !KNOWN_PREFIXES.has(prefix)) { stereotypeApps.push(node); continue; }
    warn(`Skipped ${label(node)}`);
  }
  if (!roots.length) { warn('The file has no UML model'); }
  const modelRoots = roots.filter((r) => ['Model', 'Package', 'Profile'].includes(xtype(r)));
  if (modelRoots.length === 1 && xtype(modelRoots[0]) === 'Model' && roots.length === 1) {
    const r = modelRoots[0];
    project.name = r.attrs.name || 'Imported';
    rootName = r.attrs.name || 'Model';
    if (xid(r)) rootIds.add(xid(r));
    for (const c of childrenNamed(r, 'ownedComment')) {
      const annotated = idrefs(c, 'annotatedElement');
      if (!project.documentation && (!annotated.length || annotated.includes(xid(r)))) project.documentation = bodyOf(c);
      else readComment(c, defaultOwner());
    }
    // Only packages at the top: they become the project's models. Anything else there: all of it goes into one model.
    const packaged = r.children.filter((c) => ['packagedElement', 'ownedMember', 'nestedPackage', 'ownedType'].includes(localName(c.name)));
    const flat = packaged.some((c) => { const ct = xtype(c); return ct && !['Model', 'Package', 'Profile'].includes(ct) && xid(c) !== TYPES_PACKAGE; });
    for (const child of r.children) {
      const tag = localName(child.name);
      if (tag === 'ownedComment' || tag === 'profileApplication' || tag === 'packageImport' || tag === 'Extension') continue;
      if (packaged.includes(child)) buildElement(child, flat ? defaultOwner() : project);
      else if (tag === 'ownedRule') buildRule(child, defaultOwner());
      else if (!QUIET.has(tag) && child.attrs['xmi:type']) warn(`Skipped ${tag} ${label(child)}`);
    }
  } else {
    project.name = roots[0]?.attrs.name || 'Imported';
    rootName = project.name;
    for (const r of roots) buildElement(r, project);
  }
  // Line directions from EA's connectors (source → target).
  const eaSource = new Map();
  for (const ext of extensions) {
    if (!/Enterprise Architect/i.test(ext.attrs.extender ?? '')) continue;
    for (const c of childrenNamed(firstChild(ext, 'connectors'), 'connector')) { const src = firstChild(c, 'source')?.attrs['xmi:idref']; if (c.attrs['xmi:idref'] && src) eaSource.set(c.attrs['xmi:idref'], src); }
  }
  // Pending work may add more pending work (associations of association classes …).
  for (let i = 0; i < pending.length; i += 1) {
    try { pending[i](); } catch (error) { warn(`Could not read an element: ${error?.message ?? error}`); }
  }

  // ── stereotype applications
  const stereotypesByName = new Map();
  walk(project, (e) => { if (e._type === 'UMLStereotype' && e.name) stereotypesByName.set(e.name, stereotypesByName.has(e.name) ? null : e); });
  const profileByPrefix = new Map();
  walk(project, (e) => { if (e._type === 'UMLProfile' && e.name) profileByPrefix.set(e.name, e); });
  for (const app of stereotypeApps) {
    const prefix = prefixOf(app.name);
    const name = localName(app.name);
    const bases = Object.entries(app.attrs).filter(([k]) => k.startsWith('base_'));
    if (!bases.length) { warn(`Skipped ${app.name}`); continue; }
    const profile = profileByPrefix.get(prefix);
    const stereo = (profile?.ownedElements ?? []).find((e) => e._type === 'UMLStereotype' && e.name === name) ?? stereotypesByName.get(name) ?? null;
    for (const [, value] of bases) {
      for (const target of String(value).split(/\s+/).map(resolve).filter(Boolean)) {
        if (!target.stereotype) target.stereotype = stereo ? ref(stereo) : name;
        for (const [key, tagValue] of Object.entries(app.attrs)) {
          if (key.startsWith('base_') || key.startsWith('xmi:') || key.startsWith('xmlns')) continue;
          add(target, { _type: 'UMLTag', _id: newId(), name: key, kind: 'string', value: tagValue });
        }
      }
    }
  }

  // ── Enterprise Architect's extension
  const eaNotes = new Map();
  const noteLinks = new Map();
  const messageY = new Map();
  const eaDiagrams = [];
  for (const ext of extensions) {
    if (!/Enterprise Architect/i.test(ext.attrs.extender ?? '')) continue;
    for (const e of childrenNamed(firstChild(ext, 'elements'), 'element')) {
      const target = resolve(e.attrs['xmi:idref']);
      const properties = firstChild(e, 'properties');
      const docText = properties?.attrs.documentation ?? '';
      const type = localName(e.attrs['xmi:type'] ?? '');
      if (!target) {
        if (/^(Note|Text|Comment)$/.test(type) && e.attrs['xmi:idref']) eaNotes.set(e.attrs['xmi:idref'], docText || e.attrs.name || '');
        continue;
      }
      if (docText && !target.documentation) target.documentation = docText;
      const stereo = properties?.attrs.stereotype;
      if (stereo && !target.stereotype) { const s = stereotypesByName.get(stereo); target.stereotype = s ? ref(s) : stereo; }
      for (const tg of childrenNamed(firstChild(e, 'tags'), 'tag')) {
        if (!tg.attrs.name || (target.tags ?? []).some((t) => t.name === tg.attrs.name)) continue;
        add(target, { _type: 'UMLTag', _id: newId(), name: tg.attrs.name, kind: 'string', value: String(tg.attrs.value ?? '').replace(/#NOTES#[\s\S]*$/, '') });
      }
    }
    for (const c of childrenNamed(firstChild(ext, 'connectors'), 'connector')) {
      const type = firstChild(c, 'properties')?.attrs.ea_type;
      const id = c.attrs['xmi:idref'];
      if (type === 'NoteLink') noteLinks.set(id, [firstChild(c, 'source')?.attrs['xmi:idref'], firstChild(c, 'target')?.attrs['xmi:idref']]);
      const points = firstChild(c, 'extendedProperties')?.attrs.sequence_points;
      if (points) { const g = parseGeometry(points); if (g.PtStartY !== undefined) messageY.set(id, Math.abs(Number(g.PtStartY))); }
      const docNode = firstChild(c, 'documentation');
      const rel = resolve(id);
      if (rel && docNode?.attrs.value && !rel.documentation) rel.documentation = docNode.attrs.value;
    }
    eaDiagrams.push(...childrenNamed(firstChild(ext, 'diagrams'), 'diagram'));
  }

  // ── diagrams
  let index = buildIndex(project);
  const parentOf = (el) => index.parent(el._id);
  let made = 0;
  const noteText = (id) => (comments.has(id) ? comments.get(id).body : eaNotes.has(id) ? eaNotes.get(id) : null);
  /** spec: { name, type, owner, documentation, nodes: [{ key, subject, box }], edges: [{ subject, tailKey, headKey, points, y }] } */
  const makeDiagram = (spec) => {
    let type = isDiagramType(spec.type) ? spec.type : 'UMLClassDiagram';
    let owner = spec.owner ?? defaultOwner();
    const needed = typeDef(type)?.owner;
    if (needed && owner._type !== needed) {
      let found = null;
      for (const n of spec.nodes) {
        let p = resolve(n.subject);
        while (p && !found) { if (p._type === needed) found = p; p = parentOf(p); }
        if (found) break;
      }
      if (found) owner = found;
      else {
        let pkg = owner;
        while (pkg && !typeDef(pkg._type)?.namespace) pkg = parentOf(pkg);
        const holder = make(needed, null, { name: spec.name || needed.replace(/^UML/, '') });
        add(pkg && pkg._type !== 'Project' ? pkg : defaultOwner(), holder);
        index = buildIndex(project);
        owner = holder;
      }
    }
    if (owner._type === 'Project') owner = defaultOwner();
    const diagram = { _type: type, _id: newId(), name: spec.name || typeDef(type)?.en || 'Diagram', defaultDiagram: made === 0, ownedViews: [] };
    if (spec.documentation) diagram.documentation = spec.documentation;
    add(owner, diagram);
    made += 1;
    const byKey = new Map();
    const byModel = new Map();
    const nodes = [];
    let skipped = 0;
    for (const n of spec.nodes) {
      const box = { left: Math.round(n.box.x), top: Math.round(n.box.y), width: Math.max(0, Math.round(n.box.w)), height: Math.max(0, Math.round(n.box.h)) };
      const el = resolve(n.subject);
      let view = null;
      const note = el ? null : noteText(n.subject);
      if (note !== null) {
        view = { _type: 'UMLNoteView', _id: newId(), text: note, ...box };
        if (comments.has(n.subject)) comments.get(n.subject).used = true;
        byModel.set(n.subject, [...(byModel.get(n.subject) ?? []), view]);
      } else if (el && (el !== owner || !BEHAVIORS[el._type])) {
        const def = typeDef(el._type);
        if (def?.feature) continue; // compartment rows (attributes, operations …)
        if (!def || def.edge || isDiagramType(el._type) || (!def.shape && !def.namespace)) { skipped += 1; continue; }
        view = { _type: viewTypeOf(el._type), _id: newId(), model: ref(el), ...box };
        byModel.set(el._id, [...(byModel.get(el._id) ?? []), view]);
      } else { if (!el) skipped += 1; continue; }
      view._parent = ref(diagram);
      if (n.key) byKey.set(n.key, view);
      nodes.push(view);
    }
    if (skipped) warn(`Diagram "${diagram.name}": ${skipped} shape(s) without a model element were skipped`);
    // Containers behind what they hold.
    const container = (v) => Boolean(viewDef(v._type).container || typeDef(viewDef(v._type)?.type)?.namespace && /package|subsystem|subject|frame|node3d|component/.test(viewDef(v._type).shape ?? ''));
    nodes.sort((a, b) => (container(b) - container(a)) || (container(a) && container(b) ? b.width * b.height - a.width * a.height : 0));
    diagram.ownedViews.push(...nodes);
    const firstOf = (id, not = null) => (byModel.get(id) ?? []).find((v) => v !== not) ?? (byModel.get(id) ?? [])[0] ?? null;
    const linked = new Set();
    for (const e of spec.edges) {
      const el = resolve(e.subject);
      const keyed = [byKey.get(e.tailKey), byKey.get(e.headKey)].filter(Boolean);
      let tail; let head; let type2; let model = null;
      if (el && typeDef(el._type)?.edge) {
        const [a, b] = relationshipEnds(el);
        tail = keyed.find((v) => refId(v.model) === a) ?? firstOf(a);
        head = keyed.find((v) => refId(v.model) === b && v !== tail) ?? keyed.find((v) => refId(v.model) === b) ?? firstOf(b, a === b ? null : tail);
        type2 = viewTypeOf(el._type);
        model = el;
      } else if (noteLinks.has(e.subject)) {
        const [a, b] = noteLinks.get(e.subject);
        tail = keyed.find((v) => byModel.get(a)?.includes(v)) ?? firstOf(a);
        head = keyed.find((v) => byModel.get(b)?.includes(v)) ?? firstOf(b);
        type2 = 'UMLNoteLinkView';
        if (tail?._type === 'UMLNoteView') linked.add(tail._id);
        if (head?._type === 'UMLNoteView') linked.add(head._id);
      } else continue;
      if (!tail || !head) continue;
      const view = { _type: type2, _id: newId(), _parent: ref(diagram), ...(model ? { model: ref(model) } : {}), tail: ref(tail), head: ref(head), points: type2 === 'UMLMessageView' ? [] : (e.points ?? []), lineStyle: '' };
      if (type2 === 'UMLMessageView') view.y = e.y ?? messageY.get(e.subject);
      diagram.ownedViews.push(view);
    }
    // Notes linked through their annotated elements.
    for (const view of nodes) {
      if (view._type !== 'UMLNoteView' || linked.has(view._id)) continue;
      const key = [...byModel].find(([, list]) => list.includes(view))?.[0];
      for (const target of comments.get(key)?.annotated ?? []) {
        const other = firstOf(target);
        if (other) diagram.ownedViews.push({ _type: 'UMLNoteLinkView', _id: newId(), _parent: ref(diagram), tail: ref(view), head: ref(other), points: [], lineStyle: '' });
      }
    }
    // Messages without a position: one below the other in their order.
    if (type === 'UMLSequenceDiagram') {
      const lifelines = nodes.filter((v) => v._type === 'UMLLifelineView');
      const top0 = lifelines.length ? Math.min(...lifelines.map((v) => v.top)) : 40;
      const order = new Map((owner.messages ?? []).map((m, i) => [m._id, i]));
      const messages = diagram.ownedViews.filter((v) => v._type === 'UMLMessageView');
      if (messages.some((m) => !Number.isFinite(m.y))) {
        messages.sort((a, b) => (order.get(refId(a.model)) ?? 0) - (order.get(refId(b.model)) ?? 0)).forEach((m, i) => { m.y = top0 + 80 + i * 40; });
      }
      for (const l of lifelines) if (!l.height) l.height = Math.max(200, (messages.length + 2) * 40 + 80);
    }
    return diagram;
  };

  for (const d of eaDiagrams) {
    const props2 = firstChild(d, 'properties')?.attrs ?? {};
    const model = firstChild(d, 'model')?.attrs ?? {};
    const type = isDiagramType(props2.myumlmakerType) ? props2.myumlmakerType : EA_DIAGRAM_FROM[String(props2.type ?? '').toLowerCase().replace(/\s+/g, '')] ?? 'UMLClassDiagram';
    const ownerEl = resolve(model.owner) ?? resolve(model.package) ?? defaultOwner();
    const nodes = [];
    const edges = [];
    for (const e of childrenNamed(firstChild(d, 'elements'), 'element')) {
      const g = parseGeometry(e.attrs.geometry);
      const style = parseGeometry(e.attrs.style);
      const subject = e.attrs.subject;
      if (g.Left !== undefined || g.Top !== undefined) {
        const left = Number(g.Left) || 0; const right = Number(g.Right) || left;
        const topY = Math.abs(Number(g.Top) || 0); const bottom = Math.abs(Number(g.Bottom) || topY);
        nodes.push({ key: style.DUID ?? null, subject, box: { x: left, y: Math.min(topY, bottom), w: Math.abs(right - left), h: Math.abs(bottom - topY) } });
      } else {
        const points = String(g.Path ?? '').split('$').map((p) => p.split(':')).filter((p) => p.length === 2 && p[0] !== '').map(([px, py]) => ({ x: Math.abs(Number(px)) || 0, y: Math.abs(Number(py)) || 0 }));
        edges.push({ subject, tailKey: style.SOID, headKey: style.EOID, points, y: g.PtStartY !== undefined ? Math.abs(Number(g.PtStartY)) : undefined });
      }
    }
    try { makeDiagram({ name: props2.name, type, owner: ownerEl, documentation: props2.documentation, nodes, edges }); } catch (error) { warn(`Diagram "${props2.name ?? ''}" could not be read: ${error?.message ?? error}`); }
  }

  // UML DI (MagicDraw, Cameo …) and GMF notation (Papyrus).
  const diagramNodes = [...diNodes];
  for (const node of descendants(root)) {
    const t = node.attrs['xmi:type'] ?? '';
    if (diNodes.includes(node)) continue;
    if ((/^umldi:UML\w*Diagram$/.test(t) || /^umldi:UML\w*Diagram$/.test(node.name) || t === 'notation:Diagram' || node.name === 'notation:Diagram') && !diagramNodes.some((d) => d === node)) diagramNodes.push(node);
  }
  for (const d of diagramNodes) {
    try {
      if (/notation/.test(d.name) || /notation/.test(d.attrs['xmi:type'] ?? '')) readNotation(d); else readUmlDi(d);
    } catch (error) { warn(`Diagram "${d.attrs.name ?? ''}" could not be read: ${error?.message ?? error}`); }
  }
  function diType(name) {
    const n = String(name ?? '').toLowerCase();
    if (/sequence/.test(n)) return 'UMLSequenceDiagram';
    if (/communication/.test(n)) return 'UMLCommunicationDiagram';
    if (/timing/.test(n)) return 'UMLTimingDiagram';
    if (/overview/.test(n)) return 'UMLInteractionOverviewDiagram';
    if (/state/.test(n)) return 'UMLStatechartDiagram';
    if (/activity/.test(n)) return 'UMLActivityDiagram';
    if (/usecase|use_case|use case/.test(n)) return 'UMLUseCaseDiagram';
    if (/composite/.test(n)) return 'UMLCompositeStructureDiagram';
    if (/component/.test(n)) return 'UMLComponentDiagram';
    if (/deployment/.test(n)) return 'UMLDeploymentDiagram';
    if (/profile/.test(n)) return 'UMLProfileDiagram';
    if (/object/.test(n)) return 'UMLObjectDiagram';
    if (/package/.test(n)) return 'UMLPackageDiagram';
    return 'UMLClassDiagram';
  }
  function ownerFor(d, contextId) {
    const context = resolve(contextId);
    if (context && (typeDef(context._type)?.namespace)) return context;
    let p = d.parent;
    while (p) { const el = resolve(xid(p)); if (el && typeDef(el._type)?.namespace) return el; p = p.parent; }
    return null;
  }
  function readUmlDi(d) {
    const nodes = [];
    const edges = [];
    const meOf = (n) => n.attrs.modelElement?.split(/\s+/)[0] ?? idref(n, 'modelElement');
    const visit = (n, shown) => {
      for (const child of n.children) {
        const t = localName(child.attrs['xmi:type'] ?? child.name);
        if (t === 'UMLShape' || t === 'Shape') {
          const me = meOf(child);
          const b = firstChild(child, 'bounds')?.attrs ?? {};
          const nextShown = new Set(shown);
          if (me && !shown.has(me) && (resolve(me) || noteText(me) !== null)) {
            nodes.push({ key: xid(child), subject: me, box: { x: Number(b.x) || 0, y: Number(b.y) || 0, w: Number(b.width) || 0, h: Number(b.height) || 0 } });
            nextShown.add(me);
          }
          visit(child, nextShown);
        } else if (t === 'UMLEdge' || t === 'Edge') {
          const points = childrenNamed(child, 'waypoint').map((w) => ({ x: Number(w.attrs.x) || 0, y: Number(w.attrs.y) || 0 }));
          edges.push({ subject: meOf(child), tailKey: child.attrs.source ?? idref(child, 'source'), headKey: child.attrs.target ?? idref(child, 'target'), points: points.slice(1, -1) });
          visit(child, shown);
        } else visit(child, shown);
      }
    };
    visit(d, new Set());
    const type = diType(localName(d.attrs['xmi:type'] ?? d.name));
    makeDiagram({ name: d.attrs.name, type, owner: ownerFor(d, meOf(d)), nodes, edges });
  }
  function readNotation(d) {
    const nodes = [];
    const edges = [];
    const elementOf = (n) => { const e = n.attrs.element ?? firstChild(n, 'element')?.attrs.href ?? firstChild(n, 'element')?.attrs['xmi:idref']; return e ? (e.includes('#') ? hrefId(e) : e) : null; };
    const visit = (n, dx, dy) => {
      for (const child of childrenNamed(n, 'children')) {
        const b = firstChild(child, 'layoutConstraint')?.attrs ?? {};
        const bx = (Number(b.x) || 0) + dx; const by = (Number(b.y) || 0) + dy;
        const me = elementOf(child);
        if (me && (resolve(me) || noteText(me) !== null) && /Shape|Node/.test(child.attrs['xmi:type'] ?? '')) {
          nodes.push({ key: xid(child), subject: me, box: { x: bx, y: by, w: Math.max(0, Number(b.width) || 0), h: Math.max(0, Number(b.height) || 0) } });
        }
        visit(child, bx, by);
      }
    };
    visit(d, 0, 0);
    for (const e of childrenNamed(d, 'edges')) edges.push({ subject: elementOf(e), tailKey: e.attrs.source, headKey: e.attrs.target, points: [] });
    makeDiagram({ name: d.attrs.name, type: diType(d.attrs.type), owner: ownerFor(d, elementOf(d)), nodes, edges });
  }

  // ── comments that were not notes become documentation
  for (const [, c] of comments) {
    if (c.used || !c.body) continue;
    const targets = c.annotated.map(resolve).filter(Boolean);
    if (!targets.length || targets.includes(c.owner)) appendDoc(c.owner, c.body);
    else appendDoc(targets[0], c.body);
  }
  if (project.documentation && defaultModel && defaultModel.documentation === project.documentation) defaultModel.documentation = '';

  // ── no diagram information at all: a class diagram per package, laid out
  if (!made && !eaDiagrams.length && !diagramNodes.length) autoDiagrams(project, warn);
}

/** "Left=1;Top=2;" → { Left: '1', Top: '2' }. */
export function parseGeometry(textValue) {
  const out = {};
  for (const part of String(textValue ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

const AUTO_TYPES = new Set(['UMLClass', 'UMLInterface', 'UMLDataType', 'UMLPrimitiveType', 'UMLEnumeration', 'UMLSignal', 'UMLComponent', 'UMLStereotype', 'UMLMetaClass', 'UMLActor', 'UMLUseCase', 'UMLArtifact', 'UMLNode', 'UMLInformationItem']);

/** A class diagram for every package (model, profile) that holds classifiers, laid out in layers. */
function autoDiagrams(project, warn) {
  const packages = [];
  walk(project, (el) => { if (PACKAGES[el._type] && (el.ownedElements ?? []).some((c) => AUTO_TYPES.has(c._type))) packages.push(el); });
  let first = true;
  for (const pkg of packages) {
    const diagram = { _type: 'UMLClassDiagram', _id: newId(), name: pkg.name || 'Classes', defaultDiagram: first, ownedViews: [] };
    first = false;
    insertElement(pkg, diagram);
    const members = (pkg.ownedElements ?? []).filter((c) => AUTO_TYPES.has(c._type));
    const boxes = new Map();
    const columns = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    members.forEach((el, i) => {
      const view = { _type: viewTypeOf(el._type), _id: newId(), _parent: ref(diagram), model: ref(el), left: 40 + (i % columns) * 260, top: 40 + Math.floor(i / columns) * 220, width: 0, height: 0 };
      const size = estimateSize(view, el);
      boxes.set(view._id, { x: view.left, y: view.top, w: size.w, h: size.h });
      diagram.ownedViews.push(view);
    });
    addMissingEdgeViews(project, diagram);
    try { layoutDiagram(diagram, boxes, buildIndex(project), { origin: { x: 40, y: 40 }, nodeSep: 60, rankSep: 90 }); } catch (error) { warn(`Layout of "${diagram.name}" failed: ${error?.message ?? error}`); }
  }
  if (packages.length) warn(`The file has no diagrams: ${packages.length} class diagram(s) were made and laid out`);
}

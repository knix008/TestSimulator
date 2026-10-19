// The metamodel: every element type the program knows (UML 2 and the other
// notations StarUML has: ERD, flowchart, data flow, SysML, BPMN, C4, mind map,
// wireframe, cloud architecture), the fields each type has (they drive the
// Properties panel), where a child of each type is kept in its owner
// (StarUML's collections: attributes, operations, literals, participants,
// messages, regions, vertices, nodes, edges …) and how a view of it is drawn
// (`shape`, used by render/notation.js). Field names and type names follow
// StarUML's .mdj format so that its files open without translation.
//
// Pure data (no DOM). Labels are bilingual here so that a new type is one entry.
import { ARCHIMATE_KINDS, ARCHIMATE_RELATIONS } from './archimate.js';

// ───────────────────────── fields

const F = (key, type, extra = {}) => ({ key, type, ...extra });
export const VISIBILITIES = ['public', 'protected', 'private', 'package'];
export const AGGREGATIONS = ['none', 'shared', 'composite'];
export const NAVIGABILITY = ['unspecified', 'navigable', 'notNavigable'];
export const DIRECTIONS = ['in', 'inout', 'out', 'return'];
export const MESSAGE_SORTS = ['synchCall', 'asynchCall', 'asynchSignal', 'createMessage', 'deleteMessage', 'reply'];
export const INTERACTION_OPERATORS = ['alt', 'opt', 'par', 'loop', 'critical', 'neg', 'assert', 'strict', 'seq', 'ignore', 'consider', 'break'];
export const PSEUDOSTATE_KINDS = ['initial', 'deepHistory', 'shallowHistory', 'join', 'fork', 'junction', 'choice', 'entryPoint', 'exitPoint', 'terminate'];
export const CONCURRENCY = ['sequential', 'guarded', 'concurrent'];
export const ERD_CARDINALITY = ['1', '0..1', '1..*', '0..*'];
export const TRANSITION_KINDS = ['external', 'internal', 'local'];
export const BPMN_TASK_KINDS = ['task', 'user', 'service', 'script', 'manual', 'send', 'receive', 'businessRule'];
export const BPMN_EVENT_KINDS = ['none', 'message', 'timer', 'error', 'escalation', 'cancel', 'compensation', 'conditional', 'link', 'signal', 'terminate', 'multiple'];
export const ACTION_KINDS = ['opaque', 'callBehavior', 'callOperation', 'sendSignal', 'acceptSignal', 'acceptTimeEvent', 'createObject', 'destroyObject', 'structured'];

const NAMED = [F('name', 'string'), F('stereotype', 'stereotype')];
const DOC = [F('documentation', 'text')];
const VIS = [F('visibility', 'enum', { options: VISIBILITIES, def: 'public' })];
const CLASSIFIER = [...VIS, F('isAbstract', 'bool'), F('isFinalSpecialization', 'bool'), F('isLeaf', 'bool')];
const ATTRIBUTE = [...VIS, F('type', 'type'), F('multiplicity', 'multiplicity'), F('defaultValue', 'string'), F('isStatic', 'bool'), F('isDerived', 'bool'), F('isReadOnly', 'bool'), F('isOrdered', 'bool'), F('isUnique', 'bool'), F('isID', 'bool'), F('aggregation', 'enum', { options: AGGREGATIONS, def: 'none' })];
const OPERATION = [...VIS, F('isStatic', 'bool'), F('isAbstract', 'bool'), F('isQuery', 'bool'), F('isLeaf', 'bool'), F('concurrency', 'enum', { options: CONCURRENCY, def: 'sequential' }), F('raisedExceptions', 'string'), F('specification', 'text')];
const DIRECTED = [F('source', 'ref'), F('target', 'ref')];
const BOX = [F('text', 'text')];

// ───────────────────────── types

/** _type → definition. */
export const TYPES = {};
/**
 * Defines a type.
 *   group     where it is listed (and which Model › Add menu shows it)
 *   shape     how a view of it is drawn (render/notation.js)
 *   edge      a relationship: its views are lines between two views
 *   ends      'directed' (source/target) | 'association' (end1/end2) | 'endpoints' (head/tail of a view only)
 *   fields    Properties panel rows (after name/stereotype)
 *   owners    types it may be created in (Model Explorer); default: any namespace
 *   auto      fields set when it is created
 */
function T(type, ko, en, def = {}) {
  TYPES[type] = { type, ko, en, ...def, fields: [...(def.noName ? [] : NAMED), ...(def.fields ?? []), ...(def.noDoc ? [] : DOC)] };
  return TYPES[type];
}

// Project and namespaces
T('Project', '프로젝트', 'Project', { group: 'root', icon: 'umlProject', fields: [F('author', 'string'), F('company', 'string'), F('copyright', 'string'), F('version', 'string')] });
T('UMLModel', '모델', 'Model', { group: 'package', icon: 'umlModel', shape: 'package', namespace: true, fields: VIS });
T('UMLPackage', '패키지', 'Package', { group: 'package', icon: 'umlPackage', shape: 'package', namespace: true, fields: VIS });
T('UMLSubsystem', '서브시스템', 'Subsystem', { group: 'package', icon: 'umlSubsystem', shape: 'subsystem', namespace: true, fields: CLASSIFIER });
T('UMLProfile', '프로파일', 'Profile', { group: 'package', icon: 'umlProfile', shape: 'package', namespace: true, keyword: 'profile', fields: VIS });

// Classifiers
T('UMLClass', '클래스', 'Class', { group: 'classifier', icon: 'umlClass', shape: 'classifier', namespace: true, fields: [...CLASSIFIER, F('isActive', 'bool')], compartments: ['attributes', 'operations', 'receptions'] });
T('UMLInterface', '인터페이스', 'Interface', { group: 'classifier', icon: 'umlInterface', shape: 'classifier', keyword: 'interface', namespace: true, fields: CLASSIFIER, compartments: ['attributes', 'operations', 'receptions'], iconForm: 'lollipop' });
T('UMLDataType', '데이터 타입', 'Data Type', { group: 'classifier', icon: 'umlDataType', shape: 'classifier', keyword: 'dataType', fields: CLASSIFIER, compartments: ['attributes', 'operations'] });
T('UMLPrimitiveType', '기본 타입', 'Primitive Type', { group: 'classifier', icon: 'umlPrimitive', shape: 'classifier', keyword: 'primitive', fields: CLASSIFIER, compartments: ['attributes', 'operations'] });
T('UMLEnumeration', '열거형', 'Enumeration', { group: 'classifier', icon: 'umlEnum', shape: 'classifier', keyword: 'enumeration', fields: CLASSIFIER, compartments: ['literals', 'attributes', 'operations'] });
T('UMLSignal', '시그널', 'Signal', { group: 'classifier', icon: 'umlSignal', shape: 'classifier', keyword: 'signal', fields: CLASSIFIER, compartments: ['attributes', 'operations'] });
T('UMLStereotype', '스테레오타입', 'Stereotype', { group: 'classifier', icon: 'umlStereotype', shape: 'classifier', keyword: 'stereotype', fields: CLASSIFIER, compartments: ['attributes', 'operations'], owners: ['UMLProfile', 'UMLPackage', 'UMLModel'] });
T('UMLMetaClass', '메타클래스', 'Metaclass', { group: 'classifier', icon: 'umlMetaClass', shape: 'classifier', keyword: 'metaclass', fields: VIS, compartments: [] });
T('UMLComponent', '컴포넌트', 'Component', { group: 'classifier', icon: 'umlComponent', shape: 'component', namespace: true, fields: [...CLASSIFIER, F('isIndirectlyInstantiated', 'bool', { def: true })], compartments: ['attributes', 'operations'] });
T('UMLArtifact', '아티팩트', 'Artifact', { group: 'classifier', icon: 'umlArtifact', shape: 'artifact', fields: [...CLASSIFIER, F('fileName', 'string')], compartments: ['attributes', 'operations'] });
T('UMLNode', '노드', 'Node', { group: 'classifier', icon: 'umlNode', shape: 'node3d', namespace: true, fields: CLASSIFIER, compartments: [] });
T('UMLDevice', '장치', 'Device', { group: 'classifier', icon: 'umlNode', shape: 'node3d', keyword: 'device', namespace: true, fields: CLASSIFIER, compartments: [] });
T('UMLExecutionEnvironment', '실행 환경', 'Execution Environment', { group: 'classifier', icon: 'umlNode', shape: 'node3d', keyword: 'executionEnvironment', namespace: true, fields: CLASSIFIER, compartments: [] });
T('UMLActor', '액터', 'Actor', { group: 'classifier', icon: 'umlActor', shape: 'actor', fields: CLASSIFIER, compartments: ['attributes', 'operations'] });
T('UMLUseCase', '유스케이스', 'Use Case', { group: 'classifier', icon: 'umlUseCase', shape: 'usecase', fields: CLASSIFIER, compartments: ['extensionPoints'] });
T('UMLUseCaseSubject', '시스템 경계', 'Subject', { group: 'classifier', icon: 'umlSubject', shape: 'subject', container: true, fields: [] });
T('UMLCollaboration', '콜라보레이션', 'Collaboration', { group: 'behavior', icon: 'umlCollaboration', shape: 'collaboration', namespace: true, fields: CLASSIFIER, compartments: ['attributes'] });
T('UMLCollaborationUse', '콜라보레이션 사용', 'Collaboration Use', { group: 'instance', icon: 'umlCollaborationUse', shape: 'collaboration', fields: [F('type', 'ref')] });
T('UMLInformationItem', '정보 항목', 'Information Item', { group: 'classifier', icon: 'umlInfoItem', shape: 'classifier', keyword: 'information', fields: VIS, compartments: [] });
T('UMLAssociationClassLink', '연관 클래스 링크', 'Association Class Link', { group: 'relationship', icon: 'umlAssociationClass', edge: true, ends: 'link', fields: [F('classSide', 'ref'), F('associationSide', 'ref')], noName: true, line: 'dash' });

// Features
T('UMLAttribute', '속성', 'Attribute', { group: 'feature', icon: 'umlAttribute', feature: true, fields: ATTRIBUTE, shape: 'part' });
T('UMLOperation', '오퍼레이션', 'Operation', { group: 'feature', icon: 'umlOperation', feature: true, fields: OPERATION, namespace: true });
T('UMLParameter', '매개변수', 'Parameter', { group: 'feature', icon: 'umlParameter', feature: true, fields: [F('type', 'type'), F('multiplicity', 'multiplicity'), F('defaultValue', 'string'), F('direction', 'enum', { options: DIRECTIONS, def: 'in' })] });
T('UMLReception', '리셉션', 'Reception', { group: 'feature', icon: 'umlReception', feature: true, fields: [...VIS, F('signal', 'ref')] });
T('UMLEnumerationLiteral', '리터럴', 'Literal', { group: 'feature', icon: 'umlLiteral', feature: true, fields: [] });
T('UMLTemplateParameter', '템플릿 매개변수', 'Template Parameter', { group: 'feature', icon: 'umlTemplateParam', feature: true, fields: [F('parameterType', 'string'), F('defaultValue', 'string')] });
T('UMLExtensionPoint', '확장점', 'Extension Point', { group: 'feature', icon: 'umlExtensionPoint', feature: true, fields: [F('location', 'string')] });
T('UMLPort', '포트', 'Port', { group: 'feature', icon: 'umlPort', shape: 'port', fields: [...ATTRIBUTE, F('isBehavior', 'bool'), F('isService', 'bool', { def: true }), F('isConjugated', 'bool')] });
T('UMLSlot', '슬롯', 'Slot', { group: 'feature', icon: 'umlSlot', feature: true, fields: [F('definingFeature', 'ref'), F('value', 'string')] });
T('UMLConstraint', '제약', 'Constraint', { group: 'annotation', icon: 'umlConstraint', shape: 'constraint', fields: [F('specification', 'text'), F('constrainedElements', 'refs')] });
T('UMLTag', '태그', 'Tag', { group: 'feature', icon: 'tag', fields: [F('kind', 'enum', { options: ['string', 'boolean', 'number', 'reference', 'hidden'], def: 'string' }), F('value', 'string')], noDoc: true });

// Instances
T('UMLObject', '객체', 'Object', { group: 'instance', icon: 'umlObject', shape: 'object', fields: [F('classifier', 'ref'), F('isMultiInstance', 'bool')], compartments: ['slots'] });
T('UMLComponentInstance', '컴포넌트 인스턴스', 'Component Instance', { group: 'instance', icon: 'umlComponent', shape: 'component', underline: true, fields: [F('classifier', 'ref')], compartments: ['slots'] });
T('UMLArtifactInstance', '아티팩트 인스턴스', 'Artifact Instance', { group: 'instance', icon: 'umlArtifact', shape: 'artifact', underline: true, fields: [F('classifier', 'ref')], compartments: ['slots'] });
T('UMLNodeInstance', '노드 인스턴스', 'Node Instance', { group: 'instance', icon: 'umlNode', shape: 'node3d', underline: true, namespace: true, fields: [F('classifier', 'ref')], compartments: ['slots'] });
T('UMLPart', '파트', 'Part', { group: 'instance', icon: 'umlPart', shape: 'part', fields: ATTRIBUTE });

// Relationships (structure)
T('UMLAssociation', '연관', 'Association', { group: 'relationship', icon: 'umlAssociation', edge: true, ends: 'association', fields: [...VIS, F('isDerived', 'bool')] });
T('UMLAssociationEnd', '연관 끝', 'Association End', { group: 'feature', icon: 'umlAssociationEnd', fields: [F('reference', 'ref'), ...VIS, F('navigable', 'enum', { options: NAVIGABILITY, def: 'unspecified' }), F('aggregation', 'enum', { options: AGGREGATIONS, def: 'none' }), F('multiplicity', 'multiplicity'), F('qualifiers', 'string'), F('isDerived', 'bool'), F('isReadOnly', 'bool'), F('isOrdered', 'bool'), F('isUnique', 'bool')] });
T('UMLGeneralization', '일반화', 'Generalization', { group: 'relationship', icon: 'umlGeneralization', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'triangle' });
T('UMLDependency', '의존', 'Dependency', { group: 'relationship', icon: 'umlDependency', edge: true, ends: 'directed', fields: [...DIRECTED, ...VIS], arrow: 'open', line: 'dash' });
T('UMLAbstraction', '추상화', 'Abstraction', { group: 'relationship', icon: 'umlDependency', edge: true, ends: 'directed', fields: [...DIRECTED, F('mapping', 'string')], arrow: 'open', line: 'dash', keyword: 'abstraction' });
T('UMLUsage', '사용', 'Usage', { group: 'relationship', icon: 'umlDependency', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dash', keyword: 'use' });
T('UMLRealization', '실체화', 'Realization', { group: 'relationship', icon: 'umlRealization', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'triangle', line: 'dash' });
T('UMLInterfaceRealization', '인터페이스 실체화', 'Interface Realization', { group: 'relationship', icon: 'umlRealization', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'triangle', line: 'dash' });
T('UMLComponentRealization', '컴포넌트 실체화', 'Component Realization', { group: 'relationship', icon: 'umlRealization', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'triangle', line: 'dash' });
T('UMLTemplateBinding', '템플릿 바인딩', 'Template Binding', { group: 'relationship', icon: 'umlDependency', edge: true, ends: 'directed', fields: [...DIRECTED, F('arguments', 'string')], arrow: 'open', line: 'dash', keyword: 'bind' });
T('UMLContainment', '포함', 'Containment', { group: 'relationship', icon: 'umlContainment', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'containment', noName: true });
T('UMLInformationFlow', '정보 흐름', 'Information Flow', { group: 'relationship', icon: 'umlInfoFlow', edge: true, ends: 'directed', fields: [...DIRECTED, F('conveyed', 'string')], arrow: 'filled', line: 'dash', keyword: 'flow' });
T('UMLExtension', '확장', 'Extension', { group: 'relationship', icon: 'umlExtension', edge: true, ends: 'directed', fields: [...DIRECTED, F('isRequired', 'bool')], arrow: 'filledTriangle' });
T('UMLLink', '링크', 'Link', { group: 'relationship', icon: 'umlLink', edge: true, ends: 'association', fields: [F('association', 'ref')] });
T('UMLConnector', '커넥터', 'Connector', { group: 'relationship', icon: 'umlConnector', edge: true, ends: 'association', fields: [F('type', 'ref'), F('kind', 'enum', { options: ['assembly', 'delegation'], def: 'assembly' })] });
T('UMLDeployment', '배치', 'Deployment', { group: 'relationship', icon: 'umlDependency', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dash', keyword: 'deploy' });
T('UMLManifestation', '구현', 'Manifestation', { group: 'relationship', icon: 'umlDependency', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dash', keyword: 'manifest' });
T('UMLCommunicationPath', '통신 경로', 'Communication Path', { group: 'relationship', icon: 'umlAssociation', edge: true, ends: 'association', fields: [] });
T('UMLInclude', '포함 관계', 'Include', { group: 'relationship', icon: 'umlInclude', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dash', keyword: 'include', noName: true });
T('UMLExtend', '확장 관계', 'Extend', { group: 'relationship', icon: 'umlExtend', edge: true, ends: 'directed', fields: [...DIRECTED, F('condition', 'string'), F('extensionLocations', 'string')], arrow: 'open', line: 'dash', keyword: 'extend', noName: true });

// Interactions (sequence, communication, timing, interaction overview)
T('UMLInteraction', '인터랙션', 'Interaction', { group: 'behavior', icon: 'umlInteraction', shape: 'frame', namespace: true, fields: [] });
T('UMLLifeline', '라이프라인', 'Lifeline', { group: 'interaction', icon: 'umlLifeline', shape: 'lifeline', fields: [F('represent', 'ref'), F('selector', 'string'), F('isMultiInstance', 'bool')] });
T('UMLMessage', '메시지', 'Message', { group: 'interaction', icon: 'umlMessage', edge: true, ends: 'directed', fields: [...DIRECTED, F('messageSort', 'enum', { options: MESSAGE_SORTS, def: 'synchCall' }), F('signature', 'ref'), F('arguments', 'string'), F('assignmentTarget', 'string'), F('guard', 'string'), F('connector', 'ref')] });
T('UMLCombinedFragment', '결합 프래그먼트', 'Combined Fragment', { group: 'interaction', icon: 'umlFragment', shape: 'fragment', container: true, fields: [F('interactionOperator', 'enum', { options: INTERACTION_OPERATORS, def: 'alt' })] });
T('UMLInteractionOperand', '피연산자', 'Operand', { group: 'interaction', icon: 'umlOperand', fields: [F('guard', 'string')] });
T('UMLInteractionUse', '인터랙션 사용', 'Interaction Use', { group: 'interaction', icon: 'umlInteractionUse', shape: 'interactionUse', fields: [F('refersTo', 'ref'), F('arguments', 'string'), F('returnValue', 'string')] });
T('UMLStateInvariant', '상태 불변', 'State Invariant', { group: 'interaction', icon: 'umlStateInvariant', shape: 'stateInvariant', fields: [F('covered', 'ref'), F('invariant', 'string')] });
T('UMLContinuation', '연속', 'Continuation', { group: 'interaction', icon: 'umlContinuation', shape: 'continuation', fields: [F('setting', 'bool', { def: true })] });
T('UMLEndpoint', '끝점', 'Endpoint', { group: 'interaction', icon: 'umlEndpoint', shape: 'endpoint', fields: [] });
T('UMLGate', '게이트', 'Gate', { group: 'interaction', icon: 'umlGate', shape: 'gate', fields: [] });
T('UMLDurationConstraint', '기간 제약', 'Duration Constraint', { group: 'interaction', icon: 'umlDuration', shape: 'constraint', fields: [F('specification', 'string')] });
T('UMLTimeConstraint', '시간 제약', 'Time Constraint', { group: 'interaction', icon: 'umlTime', shape: 'constraint', fields: [F('specification', 'string')] });
// Timing diagram
T('UMLTimingLifeline', '타이밍 라이프라인', 'Timing Lifeline', { group: 'interaction', icon: 'umlTiming', shape: 'timingLifeline', fields: [F('represent', 'ref'), F('states', 'string', { def: 'Idle,Busy' })], compartments: ['timeSegments'] });
T('UMLTimeSegment', '시간 구간', 'Time Segment', { group: 'interaction', icon: 'umlTimeSegment', feature: true, fields: [F('state', 'string'), F('duration', 'int', { def: 10 })] });
T('UMLTimeTick', '시간 눈금', 'Time Tick', { group: 'interaction', icon: 'umlTime', shape: 'timeTick', fields: [] });

// State machines
T('UMLStateMachine', '상태 머신', 'State Machine', { group: 'behavior', icon: 'umlStateMachine', shape: 'frame', namespace: true, fields: [F('isReentrant', 'bool', { def: true })] });
T('UMLRegion', '영역', 'Region', { group: 'state', icon: 'umlRegion', fields: [] });
T('UMLState', '상태', 'State', { group: 'state', icon: 'umlState', shape: 'state', container: true, fields: [F('submachine', 'ref'), F('entryActivity', 'string'), F('doActivity', 'string'), F('exitActivity', 'string')] });
T('UMLSubmachineState', '서브머신 상태', 'Submachine State', { group: 'state', icon: 'umlState', shape: 'state', fields: [F('submachine', 'ref')], submachine: true });
T('UMLPseudostate', '의사 상태', 'Pseudostate', { group: 'state', icon: 'umlPseudostate', shape: 'pseudostate', fields: [F('kind', 'enum', { options: PSEUDOSTATE_KINDS, def: 'initial' })], nameOutside: true });
T('UMLFinalState', '종료 상태', 'Final State', { group: 'state', icon: 'umlFinal', shape: 'finalState', fields: [], nameOutside: true });
T('UMLTransition', '전이', 'Transition', { group: 'state', icon: 'umlTransition', edge: true, ends: 'directed', fields: [...DIRECTED, F('kind', 'enum', { options: TRANSITION_KINDS, def: 'external' }), F('triggers', 'string'), F('guard', 'string'), F('effect', 'string')], arrow: 'open' });

// Activities
T('UMLActivity', '액티비티', 'Activity', { group: 'behavior', icon: 'umlActivity', shape: 'frame', namespace: true, fields: [F('isReadOnly', 'bool'), F('isSingleExecution', 'bool')] });
T('UMLAction', '액션', 'Action', { group: 'activity', icon: 'umlAction', shape: 'action', fields: [F('kind', 'enum', { options: ACTION_KINDS, def: 'opaque' }), F('target', 'ref'), F('isLocallyReentrant', 'bool'), F('isSynchronous', 'bool', { def: true }), F('body', 'text')], compartments: ['inputs', 'outputs'] });
T('UMLInitialNode', '시작 노드', 'Initial Node', { group: 'activity', icon: 'umlInitial', shape: 'initial', fields: [], nameOutside: true });
T('UMLActivityFinalNode', '액티비티 종료', 'Activity Final', { group: 'activity', icon: 'umlFinal', shape: 'finalState', fields: [], nameOutside: true });
T('UMLFlowFinalNode', '흐름 종료', 'Flow Final', { group: 'activity', icon: 'umlFlowFinal', shape: 'flowFinal', fields: [], nameOutside: true });
T('UMLForkNode', '분기 막대', 'Fork', { group: 'activity', icon: 'umlFork', shape: 'bar', fields: [], nameOutside: true });
T('UMLJoinNode', '합류 막대', 'Join', { group: 'activity', icon: 'umlJoin', shape: 'bar', fields: [F('joinSpec', 'string')], nameOutside: true });
T('UMLDecisionNode', '결정', 'Decision', { group: 'activity', icon: 'umlDecision', shape: 'diamond', fields: [F('decisionInput', 'string')], nameOutside: true });
T('UMLMergeNode', '병합', 'Merge', { group: 'activity', icon: 'umlMerge', shape: 'diamond', fields: [], nameOutside: true });
T('UMLObjectNode', '오브젝트 노드', 'Object Node', { group: 'activity', icon: 'umlObjectNode', shape: 'objectNode', fields: [F('type', 'type'), F('upperBound', 'string'), F('ordering', 'enum', { options: ['unordered', 'ordered', 'LIFO', 'FIFO'], def: 'FIFO' }), F('inState', 'string')] });
T('UMLCentralBufferNode', '중앙 버퍼', 'Central Buffer', { group: 'activity', icon: 'umlObjectNode', shape: 'objectNode', keyword: 'centralBuffer', fields: [F('type', 'type')] });
T('UMLDataStoreNode', '데이터 저장소', 'Data Store', { group: 'activity', icon: 'umlObjectNode', shape: 'objectNode', keyword: 'datastore', fields: [F('type', 'type')] });
T('UMLInputPin', '입력 핀', 'Input Pin', { group: 'activity', icon: 'umlPin', shape: 'pin', feature: true, fields: [F('type', 'type'), F('multiplicity', 'multiplicity')], nameOutside: true });
T('UMLOutputPin', '출력 핀', 'Output Pin', { group: 'activity', icon: 'umlPin', shape: 'pin', feature: true, fields: [F('type', 'type'), F('multiplicity', 'multiplicity')], nameOutside: true });
T('UMLExpansionRegion', '확장 영역', 'Expansion Region', { group: 'activity', icon: 'umlRegion', shape: 'expansion', container: true, fields: [F('mode', 'enum', { options: ['parallel', 'iterative', 'stream'], def: 'iterative' })] });
T('UMLStructuredActivityNode', '구조적 노드', 'Structured Node', { group: 'activity', icon: 'umlAction', shape: 'structured', container: true, fields: [] });
T('UMLInterruptibleActivityRegion', '중단 가능 영역', 'Interruptible Region', { group: 'activity', icon: 'umlRegion', shape: 'interruptible', container: true, fields: [] });
T('UMLActivityPartition', '파티션(수영 레인)', 'Partition (Swimlane)', { group: 'activity', icon: 'umlSwimlane', shape: 'swimlane', container: true, fields: [F('represents', 'ref'), F('isVertical', 'bool', { def: true })] });
T('UMLControlFlow', '제어 흐름', 'Control Flow', { group: 'activity', icon: 'umlControlFlow', edge: true, ends: 'directed', fields: [...DIRECTED, F('guard', 'string'), F('weight', 'string')], arrow: 'open' });
T('UMLObjectFlow', '오브젝트 흐름', 'Object Flow', { group: 'activity', icon: 'umlObjectFlow', edge: true, ends: 'directed', fields: [...DIRECTED, F('guard', 'string'), F('weight', 'string'), F('transformation', 'string'), F('selection', 'string')], arrow: 'open' });
T('UMLExceptionHandler', '예외 처리기', 'Exception Handler', { group: 'activity', icon: 'umlException', edge: true, ends: 'directed', fields: [...DIRECTED, F('exceptionTypes', 'string')], arrow: 'open', line: 'zigzag' });

// Annotations (views without a model element are listed in VIEW_ONLY below)

// ERD
T('ERDDataModel', '데이터 모델', 'Data Model', { group: 'package', icon: 'erdModel', shape: 'package', namespace: true, fields: [] });
T('ERDEntity', '엔터티', 'Entity', { group: 'erd', icon: 'erdEntity', shape: 'entity', fields: [F('isWeak', 'bool')], compartments: ['columns'] });
T('ERDColumn', '열', 'Column', { group: 'feature', icon: 'erdColumn', feature: true, fields: [F('type', 'string', { def: 'VARCHAR' }), F('length', 'string'), F('primaryKey', 'bool'), F('foreignKey', 'bool'), F('referenceTo', 'ref'), F('nullable', 'bool'), F('unique', 'bool'), F('defaultValue', 'string')] });
T('ERDRelationship', '관계', 'Relationship', { group: 'erd', icon: 'erdRelationship', edge: true, ends: 'association', fields: [F('identifying', 'bool', { def: true })] });
T('ERDRelationshipEnd', '관계 끝', 'Relationship End', { group: 'feature', icon: 'erdRelationship', fields: [F('reference', 'ref'), F('cardinality', 'enum', { options: ERD_CARDINALITY, def: '1' })] });

// Flowchart
T('FCFlowchart', '순서도', 'Flowchart', { group: 'package', icon: 'fcFlowchart', namespace: true, fields: [] });
const FC = [
  ['FCProcess', '처리', 'Process', 'fcProcess'], ['FCTerminator', '시작/끝', 'Terminator', 'fcTerminator'], ['FCDecision', '판단', 'Decision', 'fcDecision'],
  ['FCDelay', '지연', 'Delay', 'fcDelay'], ['FCPredefinedProcess', '미리 정의된 처리', 'Predefined Process', 'fcPredefined'], ['FCAlternateProcess', '대체 처리', 'Alternate Process', 'fcAlternate'],
  ['FCData', '데이터', 'Data', 'fcData'], ['FCDocument', '문서', 'Document', 'fcDocument'], ['FCMultiDocument', '여러 문서', 'Multi-Document', 'fcMultiDocument'],
  ['FCPreparation', '준비', 'Preparation', 'fcPreparation'], ['FCDisplay', '표시', 'Display', 'fcDisplay'], ['FCManualInput', '수동 입력', 'Manual Input', 'fcManualInput'],
  ['FCManualOperation', '수동 작업', 'Manual Operation', 'fcManualOperation'], ['FCCard', '카드', 'Card', 'fcCard'], ['FCPunchedTape', '천공 테이프', 'Punched Tape', 'fcPunchedTape'],
  ['FCConnector', '연결자', 'Connector', 'fcConnector'], ['FCOffPageConnector', '페이지 연결자', 'Off-Page Connector', 'fcOffPage'], ['FCOr', '논리합', 'Or', 'fcOr'],
  ['FCSummingJunction', '합산 접합', 'Summing Junction', 'fcSumming'], ['FCCollate', '대조', 'Collate', 'fcCollate'], ['FCSort', '정렬', 'Sort', 'fcSort'],
  ['FCMerge', '병합', 'Merge', 'fcMerge'], ['FCExtract', '추출', 'Extract', 'fcExtract'], ['FCStoredData', '저장 데이터', 'Stored Data', 'fcStoredData'],
  ['FCDatabase', '데이터베이스', 'Database', 'fcDatabase'], ['FCDirectAccessStorage', '직접 접근 저장소', 'Direct Access Storage', 'fcDirectAccess'], ['FCInternalStorage', '내부 저장소', 'Internal Storage', 'fcInternalStorage'],
];
for (const [type, ko, en, shape] of FC) T(type, ko, en, { group: 'flowchart', icon: 'fcProcess', shape, fields: [], textInside: true });
T('FCFlow', '흐름', 'Flow', { group: 'flowchart', icon: 'umlControlFlow', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'filled' });

// Data flow
T('DFDDataFlowModel', '데이터 흐름 모델', 'Data Flow Model', { group: 'package', icon: 'dfdModel', namespace: true, fields: [] });
T('DFDExternalEntity', '외부 엔터티', 'External Entity', { group: 'dfd', icon: 'dfdExternal', shape: 'dfdExternal', fields: [] });
T('DFDProcess', '프로세스', 'Process', { group: 'dfd', icon: 'dfdProcess', shape: 'dfdProcess', fields: [F('id', 'string')] });
T('DFDDataStore', '데이터 저장소', 'Data Store', { group: 'dfd', icon: 'dfdStore', shape: 'dfdStore', fields: [F('id', 'string')] });
T('DFDDataFlow', '데이터 흐름', 'Data Flow', { group: 'dfd', icon: 'umlControlFlow', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'filled' });

// SysML
/** Requirement attributes (Enterprise Architect style). */
export const REQUIREMENT_KINDS = ['functional', 'nonFunctional', 'performance', 'interface', 'usability', 'reliability', 'security', 'designConstraint', 'physical', 'business', 'user'];
export const REQUIREMENT_STATUSES = ['proposed', 'approved', 'implemented', 'verified', 'rejected', 'deferred'];
export const REQUIREMENT_PRIORITIES = ['high', 'medium', 'low'];
export const REQUIREMENT_LEVELS = ['low', 'medium', 'high'];
export const VERIFY_METHODS = ['analysis', 'demonstration', 'inspection', 'test'];
T('SysMLRequirement', '요구사항', 'Requirement', {
  group: 'sysml', icon: 'sysmlRequirement', shape: 'requirement', keyword: 'requirement',
  fields: [F('id', 'string'), F('text', 'text'), F('kind', 'enum', { options: REQUIREMENT_KINDS, def: 'functional' }), F('status', 'enum', { options: REQUIREMENT_STATUSES, def: 'proposed' }),
    F('priority', 'enum', { options: REQUIREMENT_PRIORITIES, def: 'medium' }), F('difficulty', 'enum', { options: REQUIREMENT_LEVELS, def: 'medium' }), F('stability', 'enum', { options: REQUIREMENT_LEVELS, def: 'medium' }),
    F('risk', 'enum', { options: ['', ...REQUIREMENT_LEVELS] }), F('verifyMethod', 'enum', { options: ['', ...VERIFY_METHODS] }), F('version', 'string'), F('author', 'string'), F('phase', 'string')],
});
T('SysMLBlock', '블록', 'Block', { group: 'sysml', icon: 'sysmlBlock', shape: 'classifier', keyword: 'block', namespace: true, fields: CLASSIFIER, compartments: ['parts', 'references', 'values', 'attributes', 'operations', 'ports'] });
T('SysMLInterfaceBlock', '인터페이스 블록', 'Interface Block', { group: 'sysml', icon: 'sysmlBlock', shape: 'classifier', keyword: 'interfaceBlock', fields: CLASSIFIER, compartments: ['attributes', 'operations', 'ports'] });
T('SysMLValueType', '값 타입', 'Value Type', { group: 'sysml', icon: 'umlDataType', shape: 'classifier', keyword: 'valueType', fields: [...CLASSIFIER, F('unit', 'string'), F('quantityKind', 'string')], compartments: ['attributes'] });
T('SysMLConstraintBlock', '제약 블록', 'Constraint Block', { group: 'sysml', icon: 'sysmlConstraint', shape: 'classifier', keyword: 'constraint', fields: [...CLASSIFIER, F('constraint', 'string')], compartments: ['constraints', 'parameters'] });
T('SysMLPart', '파트 속성', 'Part Property', { group: 'sysml', icon: 'umlPart', shape: 'part', fields: ATTRIBUTE });
T('SysMLReference', '참조 속성', 'Reference Property', { group: 'sysml', icon: 'umlAttribute', feature: true, fields: ATTRIBUTE });
T('SysMLValue', '값 속성', 'Value Property', { group: 'sysml', icon: 'umlAttribute', feature: true, fields: ATTRIBUTE });
T('SysMLPort', '포트', 'Port', { group: 'sysml', icon: 'umlPort', shape: 'port', fields: [...ATTRIBUTE, F('isConjugated', 'bool')] });
T('SysMLFlowProperty', '흐름 속성', 'Flow Property', { group: 'sysml', icon: 'umlAttribute', feature: true, fields: [...ATTRIBUTE, F('direction', 'enum', { options: ['in', 'out', 'inout'], def: 'inout' })] });
T('SysMLConstraintProperty', '제약 속성', 'Constraint Property', { group: 'sysml', icon: 'sysmlConstraint', shape: 'constraintProperty', fields: [F('type', 'ref')] });
T('SysMLConstraintParameter', '제약 매개변수', 'Constraint Parameter', { group: 'sysml', icon: 'umlParameter', shape: 'port', fields: [F('type', 'type')] });
T('SysMLConnector', '연결자', 'Connector', { group: 'sysml', icon: 'umlConnector', edge: true, ends: 'association', fields: [F('type', 'ref')] });
T('SysMLItemFlow', '아이템 흐름', 'Item Flow', { group: 'sysml', icon: 'umlInfoFlow', edge: true, ends: 'directed', fields: [...DIRECTED, F('itemProperty', 'string')], arrow: 'filled' });
for (const [type, ko, en, kw] of [['SysMLCopy', '복사', 'Copy', 'copy'], ['SysMLDeriveReqt', '파생', 'Derive', 'deriveReqt'], ['SysMLVerify', '검증', 'Verify', 'verify'], ['SysMLRefine', '정제', 'Refine', 'refine'], ['SysMLSatisfy', '충족', 'Satisfy', 'satisfy'], ['SysMLTrace', '추적', 'Trace', 'trace']]) {
  T(type, ko, en, { group: 'sysml', icon: 'umlDependency', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dash', keyword: kw, noName: true });
}

// BPMN
T('BPMNProcess', 'BPMN 프로세스', 'BPMN Process', { group: 'package', icon: 'bpmnProcess', namespace: true, fields: [F('isExecutable', 'bool')] });
T('BPMNParticipant', '풀', 'Pool', { group: 'bpmn', icon: 'bpmnPool', shape: 'pool', container: true, fields: [F('processRef', 'ref')] });
T('BPMNLane', '레인', 'Lane', { group: 'bpmn', icon: 'bpmnLane', shape: 'lane', container: true, fields: [] });
T('BPMNTask', '태스크', 'Task', { group: 'bpmn', icon: 'bpmnTask', shape: 'bpmnTask', fields: [F('taskKind', 'enum', { options: BPMN_TASK_KINDS, def: 'task' }), F('loop', 'enum', { options: ['none', 'standard', 'parallel', 'sequential'], def: 'none' }), F('isForCompensation', 'bool')] });
T('BPMNSubProcess', '하위 프로세스', 'Sub-Process', { group: 'bpmn', icon: 'bpmnSubProcess', shape: 'bpmnSubProcess', container: true, fields: [F('triggeredByEvent', 'bool'), F('collapsed', 'bool'), F('loop', 'enum', { options: ['none', 'standard', 'parallel', 'sequential'], def: 'none' })] });
T('BPMNCallActivity', '호출 활동', 'Call Activity', { group: 'bpmn', icon: 'bpmnTask', shape: 'bpmnCall', fields: [F('calledElement', 'ref')] });
T('BPMNStartEvent', '시작 이벤트', 'Start Event', { group: 'bpmn', icon: 'bpmnStart', shape: 'bpmnEvent', fields: [F('eventKind', 'enum', { options: BPMN_EVENT_KINDS, def: 'none' }), F('isInterrupting', 'bool', { def: true })], nameOutside: true, event: 'start' });
T('BPMNIntermediateEvent', '중간 이벤트', 'Intermediate Event', { group: 'bpmn', icon: 'bpmnIntermediate', shape: 'bpmnEvent', fields: [F('eventKind', 'enum', { options: BPMN_EVENT_KINDS, def: 'none' }), F('isThrowing', 'bool')], nameOutside: true, event: 'intermediate' });
T('BPMNBoundaryEvent', '경계 이벤트', 'Boundary Event', { group: 'bpmn', icon: 'bpmnIntermediate', shape: 'bpmnEvent', fields: [F('eventKind', 'enum', { options: BPMN_EVENT_KINDS, def: 'timer' }), F('attachedToRef', 'ref'), F('cancelActivity', 'bool', { def: true })], nameOutside: true, event: 'boundary' });
T('BPMNEndEvent', '종료 이벤트', 'End Event', { group: 'bpmn', icon: 'bpmnEnd', shape: 'bpmnEvent', fields: [F('eventKind', 'enum', { options: BPMN_EVENT_KINDS, def: 'none' })], nameOutside: true, event: 'end' });
for (const [type, ko, en, mark] of [['BPMNExclusiveGateway', '배타 게이트웨이', 'Exclusive Gateway', 'x'], ['BPMNParallelGateway', '병렬 게이트웨이', 'Parallel Gateway', '+'], ['BPMNInclusiveGateway', '포괄 게이트웨이', 'Inclusive Gateway', 'o'], ['BPMNEventBasedGateway', '이벤트 기반 게이트웨이', 'Event-Based Gateway', 'e'], ['BPMNComplexGateway', '복합 게이트웨이', 'Complex Gateway', '*']]) {
  T(type, ko, en, { group: 'bpmn', icon: 'bpmnGateway', shape: 'bpmnGateway', mark, fields: [], nameOutside: true });
}
T('BPMNDataObject', '데이터 객체', 'Data Object', { group: 'bpmn', icon: 'bpmnData', shape: 'bpmnData', fields: [F('isCollection', 'bool'), F('state', 'string')], nameOutside: true });
T('BPMNDataStore', '데이터 저장소', 'Data Store', { group: 'bpmn', icon: 'fcDatabase', shape: 'bpmnStore', fields: [], nameOutside: true });
T('BPMNTextAnnotation', '텍스트 주석', 'Text Annotation', { group: 'bpmn', icon: 'note', shape: 'bpmnAnnotation', fields: BOX, noName: true });
T('BPMNGroup', '그룹', 'Group', { group: 'bpmn', icon: 'bpmnGroup', shape: 'bpmnGroup', container: true, fields: [] });
T('BPMNSequenceFlow', '시퀀스 흐름', 'Sequence Flow', { group: 'bpmn', icon: 'umlControlFlow', edge: true, ends: 'directed', fields: [...DIRECTED, F('conditionExpression', 'string'), F('isDefault', 'bool')], arrow: 'filled' });
T('BPMNMessageFlow', '메시지 흐름', 'Message Flow', { group: 'bpmn', icon: 'umlMessage', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'openTriangle', line: 'dash', tailMark: 'circle' });
T('BPMNAssociation', '연관', 'Association', { group: 'bpmn', icon: 'umlAssociation', edge: true, ends: 'directed', fields: [...DIRECTED, F('associationDirection', 'enum', { options: ['none', 'one', 'both'], def: 'none' })], line: 'dot', noName: true });
T('BPMNDataAssociation', '데이터 연관', 'Data Association', { group: 'bpmn', icon: 'umlAssociation', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dot', noName: true });

// C4
T('C4Model', 'C4 모델', 'C4 Model', { group: 'package', icon: 'c4Model', namespace: true, fields: [] });
T('C4Person', '사람', 'Person', { group: 'c4', icon: 'c4Person', shape: 'c4Person', fields: [F('description', 'text'), F('external', 'bool')] });
T('C4SoftwareSystem', '소프트웨어 시스템', 'Software System', { group: 'c4', icon: 'c4System', shape: 'c4Box', fields: [F('description', 'text'), F('external', 'bool')] });
T('C4Container', '컨테이너', 'Container', { group: 'c4', icon: 'c4Container', shape: 'c4Box', fields: [F('technology', 'string'), F('description', 'text'), F('external', 'bool')] });
T('C4ContainerDatabase', '컨테이너(DB)', 'Container (Database)', { group: 'c4', icon: 'fcDatabase', shape: 'c4Database', fields: [F('technology', 'string'), F('description', 'text'), F('external', 'bool')] });
T('C4Component', '컴포넌트', 'Component', { group: 'c4', icon: 'c4Component', shape: 'c4Box', fields: [F('technology', 'string'), F('description', 'text'), F('external', 'bool')] });
T('C4DeploymentNode', '배치 노드', 'Deployment Node', { group: 'c4', icon: 'umlNode', shape: 'c4Boundary', container: true, fields: [F('technology', 'string')] });
T('C4Boundary', '경계', 'Boundary', { group: 'c4', icon: 'umlSubject', shape: 'c4Boundary', container: true, fields: [F('boundaryKind', 'enum', { options: ['system', 'container', 'enterprise'], def: 'system' })] });
T('C4Relationship', '관계', 'Relationship', { group: 'c4', icon: 'umlDependency', edge: true, ends: 'directed', fields: [...DIRECTED, F('technology', 'string')], arrow: 'open', line: 'dash' });

// Mind map
const MM_DATE = (key) => F(key, 'string', { date: true });
T('MMMindmap', '마인드맵', 'Mind Map', { group: 'package', icon: 'mmMap', namespace: true, fields: [] });
T('MMNode', '마인드맵 노드', 'Mind Map Node', { group: 'mindmap', icon: 'mmNode', shape: 'mmNode', namespace: true, fields: [F('direction', 'enum', { options: ['auto', 'left', 'right'], def: 'auto' }), F('shape', 'enum', { options: ['auto', 'rounded', 'rectangle', 'capsule', 'ellipse', 'diamond', 'hexagonal', 'cloudy', 'underlined', 'plain'], def: 'auto' }),
  // MindManager's topic markers and task information (mindmap.js MIND_MARKERS has the same markers).
  F('marker', 'enum', { options: ['', 'flag', 'star', 'check', 'question', 'warning', 'idea', 'heart', 'smile'], def: '' }), F('priority', 'enum', { options: ['', 'p1', 'p2', 'p3', 'p4', 'p5'], def: '' }),
  F('progress', 'enum', { options: ['', 'pct0', 'pct25', 'pct50', 'pct75', 'pct100'], def: '' }), MM_DATE('startDate'), MM_DATE('dueDate'), F('resource', 'string'), F('collapsed', 'bool')] });
T('MMEdge', '가지', 'Branch', { group: 'mindmap', icon: 'umlAssociation', edge: true, ends: 'directed', fields: DIRECTED, noName: true, curved: true });

// Wireframe
T('WFWireframe', '와이어프레임', 'Wireframe', { group: 'package', icon: 'wfModel', namespace: true, fields: [] });
const WF = [
  ['WFDesktopFrame', '데스크톱 창', 'Desktop Frame', 'wfFrame', true], ['WFWebFrame', '웹 페이지', 'Web Frame', 'wfFrame', true], ['WFMobileFrame', '모바일 화면', 'Mobile Frame', 'wfMobile', true],
  ['WFPanel', '패널', 'Panel', 'wfPanel', true], ['WFButton', '버튼', 'Button', 'wfButton'], ['WFText', '텍스트', 'Text', 'wfText'], ['WFLink', '링크', 'Link', 'wfLink'],
  ['WFInput', '입력란', 'Input', 'wfInput'], ['WFTextArea', '여러 줄 입력', 'Text Area', 'wfTextArea'], ['WFCheckbox', '체크 상자', 'Checkbox', 'wfCheckbox'], ['WFRadio', '라디오 단추', 'Radio', 'wfRadio'],
  ['WFSwitch', '스위치', 'Switch', 'wfSwitch'], ['WFDropdown', '드롭다운', 'Dropdown', 'wfDropdown'], ['WFSlider', '슬라이더', 'Slider', 'wfSlider'], ['WFTabList', '탭', 'Tabs', 'wfTabs'],
  ['WFImage', '그림', 'Image', 'wfImage'], ['WFAvatar', '아바타', 'Avatar', 'wfAvatar'], ['WFList', '목록', 'List', 'wfList'], ['WFTable', '표', 'Table', 'wfTable'], ['WFDivider', '구분선', 'Divider', 'wfDivider'],
  ['WFProgress', '진행 막대', 'Progress', 'wfProgress'], ['WFIcon', '아이콘', 'Icon', 'wfIcon'],
];
for (const [type, ko, en, shape, container] of WF) T(type, ko, en, { group: 'wireframe', icon: 'wfModel', shape, container: Boolean(container), fields: [F('checked', 'bool'), F('disabled', 'bool'), F('items', 'string')] });

// Cloud architecture (AWS, Azure, GCP): groups and services drawn as tiles
T('CloudModel', '클라우드 모델', 'Cloud Model', { group: 'package', icon: 'cloudModel', namespace: true, fields: [] });
T('CloudGroup', '클라우드 그룹', 'Cloud Group', { group: 'cloud', icon: 'cloudGroup', shape: 'cloudGroup', container: true, fields: [F('provider', 'enum', { options: ['aws', 'azure', 'gcp'], def: 'aws' }), F('groupKind', 'string', { def: 'cloud' })] });
T('CloudService', '클라우드 서비스', 'Cloud Service', { group: 'cloud', icon: 'cloudService', shape: 'cloudService', fields: [F('provider', 'enum', { options: ['aws', 'azure', 'gcp'], def: 'aws' }), F('service', 'string', { def: 'EC2' })], nameOutside: true });
T('CloudConnection', '연결', 'Connection', { group: 'cloud', icon: 'umlDependency', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'filled' });

// Project planning: Gantt chart, work breakdown structure, timeline (PlantUML @startgantt, @startwbs, @startchronology)
const DATE = (key) => F(key, 'string', { date: true });
T('PMPlan', '프로젝트 계획', 'Project Plan', { group: 'package', icon: 'pmPlan', namespace: true, fields: [DATE('start')] });
T('GanttCalendar', '달력', 'Calendar', { group: 'gantt', icon: 'ganttCalendar', shape: 'ganttCalendar', container: true, fields: [DATE('start'), F('days', 'int', { def: 0 }), F('dayWidth', 'int', { def: 22 }), F('closedDays', 'string', { def: 'saturday,sunday' }), F('closedDates', 'string')] });
T('GanttTask', '작업', 'Task', { group: 'gantt', icon: 'ganttTask', shape: 'ganttTask', fields: [DATE('start'), DATE('end'), F('duration', 'int', { def: 5 }), F('completion', 'int', { def: 0 }), F('resources', 'string')] });
T('GanttMilestone', '마일스톤', 'Milestone', { group: 'gantt', icon: 'ganttMilestone', shape: 'ganttMilestone', fields: [DATE('date')] });
T('GanttSeparator', '구분선', 'Separator', { group: 'gantt', icon: 'ganttSeparator', shape: 'ganttSeparator', fields: [] });
T('GanttDependency', '선후 관계', 'Dependency', { group: 'gantt', icon: 'ganttDependency', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'filled', noName: true });
T('WBSNode', '작업 항목', 'Work Item', { group: 'wbs', icon: 'wbsNode', shape: 'wbsNode', namespace: true, fields: [F('code', 'string'), F('side', 'enum', { options: ['auto', 'left', 'right'], def: 'auto' })] });
T('TLTimeline', '시간 축', 'Time Axis', { group: 'timeline', icon: 'tlTimeline', shape: 'tlTimeline', container: true, fields: [DATE('start'), DATE('end'), F('dayWidth', 'int', { def: 3 })] });
T('TLEvent', '사건', 'Event', { group: 'timeline', icon: 'tlEvent', shape: 'tlEvent', fields: [DATE('date')] });
T('TLPeriod', '기간', 'Period', { group: 'timeline', icon: 'tlPeriod', shape: 'tlPeriod', fields: [DATE('start'), DATE('end')] });
T('TLLink', '연결', 'Link', { group: 'timeline', icon: 'tlLink', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dash' });

// ArchiMate 3 (layers, elements and relationships: archimate.js)
T('ArchiMateModel', 'ArchiMate 모델', 'ArchiMate Model', { group: 'package', icon: 'archimateModel', namespace: true, fields: [] });
T('ArchiMateElement', 'ArchiMate 요소', 'ArchiMate Element', { group: 'archimate', icon: 'amActor', shape: 'archimate', fields: [F('kind', 'enum', { options: ARCHIMATE_KINDS, def: 'business-actor' })] });
T('ArchiMateGrouping', '그룹화', 'Grouping', { group: 'archimate', icon: 'amGrouping', shape: 'amGrouping', container: true, fields: [] });
T('ArchiMateJunction', '접합', 'Junction', { group: 'archimate', icon: 'amJunction', shape: 'amJunction', fields: [F('junctionType', 'enum', { options: ['and', 'or'], def: 'and' })], nameOutside: true });
const AM_LOOK = {
  ArchiMateComposition: { tailMark: 'composite' }, ArchiMateAggregation: { tailMark: 'shared' }, ArchiMateAssignment: { tailMark: 'dot', arrow: 'filled' },
  ArchiMateRealization: { arrow: 'triangle', line: 'dot' }, ArchiMateServing: { arrow: 'open' }, ArchiMateAccess: { arrow: 'open', line: 'dot' },
  ArchiMateInfluence: { arrow: 'open', line: 'dash' }, ArchiMateTriggering: { arrow: 'filled' }, ArchiMateFlow: { arrow: 'filled', line: 'dash' },
  ArchiMateSpecialization: { arrow: 'triangle' }, ArchiMateAssociation: {},
};
const AM_FIELDS = { ArchiMateAccess: [F('accessType', 'enum', { options: ['write', 'read', 'access', 'readwrite'], def: 'write' })], ArchiMateInfluence: [F('strength', 'string')], ArchiMateAssociation: [F('isDirected', 'bool')] };
for (const [type, ko, en] of ARCHIMATE_RELATIONS) T(type, ko, en, { group: 'archimate', icon: `am${en}`, edge: true, ends: 'directed', fields: [...DIRECTED, ...(AM_FIELDS[type] ?? [])], ...AM_LOOK[type] });

// Network diagram (PlantUML @startnwdiag)
export const NW_DEVICES = ['server', 'database', 'router', 'switch', 'firewall', 'pc', 'laptop', 'mobile', 'storage', 'cloud', 'printer', 'queue'];
T('NWModel', '네트워크 모델', 'Network Model', { group: 'package', icon: 'nwModel', namespace: true, fields: [] });
T('NWNetwork', '네트워크', 'Network', { group: 'network', icon: 'nwNetwork', shape: 'nwNetwork', fields: [F('address', 'string'), F('description', 'string')] });
T('NWNode', '네트워크 노드', 'Network Node', { group: 'network', icon: 'nwServer', shape: 'nwNode', fields: [F('device', 'enum', { options: NW_DEVICES, def: 'server' }), F('description', 'string')] });
T('NWGroup', '노드 그룹', 'Node Group', { group: 'network', icon: 'nwGroup', shape: 'nwGroup', container: true, fields: [F('description', 'string')] });
T('NWConnection', '네트워크 연결', 'Network Connection', { group: 'network', icon: 'nwConnection', edge: true, ends: 'directed', fields: [...DIRECTED, F('address', 'string')], noName: true });

// Data views: JSON and YAML documents, EBNF grammars, regular expressions (@startjson, @startyaml, @startebnf, @startregex)
T('DSSpecification', '데이터 명세', 'Data Specification', { group: 'package', icon: 'dsSpec', namespace: true, fields: [] });
T('DSDocument', '데이터 문서', 'Data Document', { group: 'data', icon: 'dsDocument', shape: 'dsDocument', fields: [F('format', 'enum', { options: ['json', 'yaml'], def: 'json' }), F('text', 'text')] });
T('EBNFRule', 'EBNF 규칙', 'EBNF Rule', { group: 'data', icon: 'ebnfRule', shape: 'ebnfRule', fields: [F('expression', 'text')] });
T('RegexPattern', '정규식', 'Regular Expression', { group: 'data', icon: 'regexPattern', shape: 'regexPattern', fields: [F('pattern', 'text')] });
T('DSReference', '참조', 'Reference', { group: 'data', icon: 'dsReference', edge: true, ends: 'directed', fields: DIRECTED, arrow: 'open', line: 'dash' });

// Diagrams
// The diagram's own background (render/notation.js backgroundSvg): '' = the diagram colour scheme's,
// 'color' = a colour, 'image' = a picture over the colour, 'pattern' = a pattern over the colour. Every
// layer has its own opacity (0–100 %). `background: true` fields are edited in the diagram options'
// background group (not as Properties rows), get no value on a new diagram, and stay out of documents.
export const DIAGRAM_BG_KINDS = ['', 'color', 'image', 'pattern'];
export const DIAGRAM_BG_FITS = ['fill', 'fit', 'tile', 'center', 'stretch'];
export const DIAGRAM_BG_PATTERNS = ['dots', 'grid', 'lines-h', 'lines-v', 'diagonal', 'diagonal-cross', 'checker', 'crosshatch', 'waves', 'hexagon'];
export const BACKGROUND_FIELDS = [
  F('backgroundKind', 'enum', { options: DIAGRAM_BG_KINDS, def: '', background: true }),
  F('backgroundColor', 'string', { background: true }),
  F('backgroundColorOpacity', 'int', { def: 100, min: 0, max: 100, background: true }),
  F('backgroundImage', 'string', { background: true }),
  F('backgroundImageWidth', 'int', { background: true }),
  F('backgroundImageHeight', 'int', { background: true }),
  F('backgroundFit', 'enum', { options: DIAGRAM_BG_FITS, def: 'fill', background: true }),
  F('backgroundOpacity', 'int', { def: 100, min: 0, max: 100, background: true }),
  F('backgroundPattern', 'enum', { options: DIAGRAM_BG_PATTERNS, def: 'dots', background: true }),
  F('backgroundPatternColor', 'string', { background: true }),
  F('backgroundPatternOpacity', 'int', { def: 100, min: 0, max: 100, background: true }),
  F('backgroundPatternScale', 'int', { def: 100, min: 50, max: 300, background: true }),
];
const D_FIELDS = [F('defaultDiagram', 'bool'), ...BACKGROUND_FIELDS];
export const DIAGRAM_TYPES = {};
function Dg(type, ko, en, family, icon, extra = {}) {
  T(type, ko, en, { group: 'diagram', icon, diagram: true, family, fields: D_FIELDS, ...extra });
  DIAGRAM_TYPES[type] = TYPES[type];
}
Dg('UMLClassDiagram', '클래스 다이어그램', 'Class Diagram', 'uml', 'dgClass');
Dg('UMLPackageDiagram', '패키지 다이어그램', 'Package Diagram', 'uml', 'dgPackage');
Dg('UMLObjectDiagram', '객체 다이어그램', 'Object Diagram', 'uml', 'dgObject');
Dg('UMLCompositeStructureDiagram', '복합 구조 다이어그램', 'Composite Structure Diagram', 'uml', 'dgComposite');
Dg('UMLComponentDiagram', '컴포넌트 다이어그램', 'Component Diagram', 'uml', 'dgComponent');
Dg('UMLDeploymentDiagram', '배치 다이어그램', 'Deployment Diagram', 'uml', 'dgDeployment');
Dg('UMLProfileDiagram', '프로파일 다이어그램', 'Profile Diagram', 'uml', 'dgProfile');
Dg('UMLUseCaseDiagram', '유스케이스 다이어그램', 'Use Case Diagram', 'uml', 'dgUseCase');
Dg('UMLSequenceDiagram', '시퀀스 다이어그램', 'Sequence Diagram', 'uml', 'dgSequence', { owner: 'UMLInteraction', showSequenceNumber: true });
Dg('UMLCommunicationDiagram', '커뮤니케이션 다이어그램', 'Communication Diagram', 'uml', 'dgCommunication', { owner: 'UMLInteraction' });
Dg('UMLTimingDiagram', '타이밍 다이어그램', 'Timing Diagram', 'uml', 'dgTiming', { owner: 'UMLInteraction' });
Dg('UMLInteractionOverviewDiagram', '인터랙션 개요 다이어그램', 'Interaction Overview Diagram', 'uml', 'dgOverview', { owner: 'UMLActivity' });
Dg('UMLInformationFlowDiagram', '정보 흐름 다이어그램', 'Information Flow Diagram', 'uml', 'dgInfoFlow');
Dg('UMLStatechartDiagram', '상태 머신 다이어그램', 'Statechart Diagram', 'uml', 'dgState', { owner: 'UMLStateMachine' });
Dg('UMLActivityDiagram', '액티비티 다이어그램', 'Activity Diagram', 'uml', 'dgActivity', { owner: 'UMLActivity' });
Dg('ERDDiagram', 'ER 다이어그램', 'ER Diagram', 'erd', 'dgErd', { owner: 'ERDDataModel' });
Dg('FCFlowchartDiagram', '순서도 다이어그램', 'Flowchart Diagram', 'flowchart', 'dgFlowchart', { owner: 'FCFlowchart' });
Dg('DFDDiagram', '데이터 흐름 다이어그램', 'Data Flow Diagram', 'dfd', 'dgDfd', { owner: 'DFDDataFlowModel' });
Dg('SysMLRequirementDiagram', 'SysML 요구사항 다이어그램', 'SysML Requirement Diagram', 'sysml', 'dgRequirement');
Dg('SysMLBlockDefinitionDiagram', 'SysML 블록 정의 다이어그램', 'SysML Block Definition Diagram', 'sysml', 'dgBlock');
Dg('SysMLInternalBlockDiagram', 'SysML 내부 블록 다이어그램', 'SysML Internal Block Diagram', 'sysml', 'dgIbd');
Dg('SysMLParametricDiagram', 'SysML 매개변수 다이어그램', 'SysML Parametric Diagram', 'sysml', 'dgParametric');
Dg('BPMNDiagram', 'BPMN 다이어그램', 'BPMN Diagram', 'bpmn', 'dgBpmn', { owner: 'BPMNProcess' });
Dg('C4Diagram', 'C4 다이어그램', 'C4 Diagram', 'c4', 'dgC4', { owner: 'C4Model' });
Dg('MMMindmapDiagram', '마인드맵 다이어그램', 'Mind Map Diagram', 'mindmap', 'dgMindmap', { owner: 'MMMindmap', fields: [...D_FIELDS, F('mindLayout', 'enum', { options: ['map', 'right', 'left', 'down', 'free'], def: 'map' })] });
Dg('WFWireframeDiagram', '와이어프레임 다이어그램', 'Wireframe Diagram', 'wireframe', 'dgWireframe', { owner: 'WFWireframe' });
Dg('AWSDiagram', 'AWS 다이어그램', 'AWS Diagram', 'cloud', 'dgAws', { owner: 'CloudModel', provider: 'aws' });
Dg('AzureDiagram', 'Azure 다이어그램', 'Azure Diagram', 'cloud', 'dgAzure', { owner: 'CloudModel', provider: 'azure' });
Dg('GCPDiagram', 'GCP 다이어그램', 'GCP Diagram', 'cloud', 'dgGcp', { owner: 'CloudModel', provider: 'gcp' });
Dg('GanttDiagram', '간트 차트', 'Gantt Chart', 'project', 'dgGantt', { owner: 'PMPlan' });
Dg('WBSDiagram', 'WBS 다이어그램', 'WBS Diagram', 'project', 'dgWbs', { owner: 'PMPlan' });
Dg('TimelineDiagram', '타임라인 다이어그램', 'Timeline Diagram', 'project', 'dgTimeline', { owner: 'PMPlan' });
Dg('ArchiMateDiagram', 'ArchiMate 다이어그램', 'ArchiMate Diagram', 'archimate', 'dgArchimate', { owner: 'ArchiMateModel' });
Dg('NetworkDiagram', '네트워크 다이어그램', 'Network Diagram', 'network', 'dgNetwork', { owner: 'NWModel' });
Dg('JSONDiagram', 'JSON 다이어그램', 'JSON Diagram', 'data', 'dgJson', { owner: 'DSSpecification', dataFormat: 'json' });
Dg('YAMLDiagram', 'YAML 다이어그램', 'YAML Diagram', 'data', 'dgYaml', { owner: 'DSSpecification', dataFormat: 'yaml' });
Dg('EBNFDiagram', 'EBNF 다이어그램', 'EBNF Diagram', 'data', 'dgEbnf', { owner: 'DSSpecification' });
Dg('RegexDiagram', '정규식 다이어그램', 'Regex Diagram', 'data', 'dgRegex', { owner: 'DSSpecification' });

/** Types whose new elements get no name (pseudostates, bars, fragments …). */
export const UNNAMED = new Set(['UMLSlot', 'UMLCombinedFragment', 'UMLInteractionOperand','UMLRegion', 'UMLPseudostate', 'UMLFinalState', 'UMLInitialNode', 'UMLActivityFinalNode', 'UMLFlowFinalNode', 'UMLForkNode', 'UMLJoinNode', 'UMLDecisionNode', 'UMLMergeNode', 'UMLEndpoint', 'UMLGate', 'UMLTimeTick', 'BPMNExclusiveGateway', 'BPMNParallelGateway', 'BPMNInclusiveGateway', 'BPMNEventBasedGateway', 'BPMNComplexGateway', 'BPMNStartEvent', 'BPMNEndEvent', 'BPMNIntermediateEvent', 'BPMNBoundaryEvent', 'FCOr', 'FCSummingJunction', 'FCCollate', 'FCSort', 'FCMerge', 'FCExtract', 'UMLInputPin', 'UMLOutputPin', 'ArchiMateJunction']);

export const DIAGRAM_FAMILIES = [
  ['uml', 'UML', 'UML'], ['erd', 'ERD', 'ERD'], ['flowchart', '순서도', 'Flowchart'], ['dfd', '데이터 흐름', 'Data Flow'],
  ['sysml', 'SysML', 'SysML'], ['bpmn', 'BPMN', 'BPMN'], ['c4', 'C4', 'C4'], ['mindmap', '마인드맵', 'Mind Map'], ['wireframe', '와이어프레임', 'Wireframe'], ['cloud', '클라우드', 'Cloud'],
  ['project', '프로젝트 관리', 'Project Management'], ['archimate', 'ArchiMate', 'ArchiMate'], ['network', '네트워크', 'Network'], ['data', '데이터', 'Data'],
];

/** Views that have no model element (annotations). */
export const VIEW_ONLY = {
  UMLNoteView: { ko: '메모', en: 'Note', shape: 'note', icon: 'note' },
  UMLNoteLinkView: { ko: '메모 연결', en: 'Note Link', edge: true, icon: 'noteLink', line: 'dash' },
  UMLTextView: { ko: '텍스트', en: 'Text', shape: 'text', icon: 'textTool' },
  UMLFrameView: { ko: '프레임', en: 'Frame', shape: 'diagramFrame', icon: 'umlFrame', container: true },
  RectangleView: { ko: '사각형', en: 'Rectangle', shape: 'rect', icon: 'rectTool' },
  RoundRectView: { ko: '둥근 사각형', en: 'Rounded Rectangle', shape: 'roundRect', icon: 'roundRect' },
  EllipseView: { ko: '타원', en: 'Ellipse', shape: 'ellipse', icon: 'ellipseTool' },
  HyperlinkView: { ko: '하이퍼링크', en: 'Hyperlink', shape: 'hyperlink', icon: 'hyperlink' },
  ImageView: { ko: '그림', en: 'Image', shape: 'image', icon: 'picture' },
  FreelineEdgeView: { ko: '자유선', en: 'Free Line', edge: true, icon: 'lineTool' },
  MMEdgeView: { ko: '가지', en: 'Branch', edge: true, icon: 'umlAssociation' },
  WBSEdgeView: { ko: '하위 작업', en: 'Sub-item', edge: true, icon: 'wbsBranch' },
};

// ───────────────────────── where children live

/** Child type → collection in the owner (StarUML's field names). */
const COLLECTION_RULES = [
  [['UMLAttribute', 'SysMLReference', 'SysMLValue', 'SysMLFlowProperty'], 'attributes'],
  [['UMLOperation'], 'operations'],
  [['UMLReception'], 'receptions'],
  [['UMLEnumerationLiteral'], 'literals'],
  [['UMLParameter', 'SysMLConstraintParameter'], 'parameters'],
  [['UMLTemplateParameter'], 'templateParameters'],
  [['UMLExtensionPoint'], 'extensionPoints'],
  [['UMLSlot'], 'slots'],
  [['UMLPort', 'SysMLPort'], 'ports'],
  [['UMLPart', 'SysMLPart'], 'parts'],
  [['UMLLifeline', 'UMLTimingLifeline'], 'participants'],
  [['UMLMessage'], 'messages'],
  [['UMLCombinedFragment', 'UMLStateInvariant', 'UMLContinuation', 'UMLInteractionUse', 'UMLDurationConstraint', 'UMLTimeConstraint', 'UMLEndpoint', 'UMLGate', 'UMLTimeTick'], 'fragments'],
  [['UMLInteractionOperand'], 'operands'],
  [['UMLTimeSegment'], 'timeSegments'],
  [['UMLRegion'], 'regions'],
  [['UMLState', 'UMLSubmachineState', 'UMLPseudostate', 'UMLFinalState'], 'vertices'],
  [['UMLTransition'], 'transitions'],
  [['UMLInputPin'], 'inputs'],
  [['UMLOutputPin'], 'outputs'],
  [['UMLAction', 'UMLInitialNode', 'UMLActivityFinalNode', 'UMLFlowFinalNode', 'UMLForkNode', 'UMLJoinNode', 'UMLDecisionNode', 'UMLMergeNode', 'UMLObjectNode', 'UMLCentralBufferNode', 'UMLDataStoreNode', 'UMLExpansionRegion', 'UMLStructuredActivityNode'], 'nodes'],
  [['UMLControlFlow', 'UMLObjectFlow', 'UMLExceptionHandler'], 'edges'],
  [['UMLActivityPartition', 'UMLInterruptibleActivityRegion'], 'groups'],
  [['ERDColumn'], 'columns'],
  [['UMLConstraint'], 'ownedRules'],
  [['UMLTag'], 'tags'],
  [['UMLTimeSegment'], 'timeSegments'],
];
const COLLECTION_OF = new Map(COLLECTION_RULES.flatMap(([types, key]) => types.map((type) => [type, key])));
/** Every collection that holds child elements (for walking the model). */
export const CHILD_COLLECTIONS = ['ownedElements', ...new Set(COLLECTION_RULES.map(([, key]) => key)), 'ownedViews'];

/** Where an element of `childType` goes inside an element of `ownerType`. */
export function collectionFor(ownerType, childType) {
  const key = COLLECTION_OF.get(childType);
  if (key === 'vertices' || key === 'transitions') return ownerType === 'UMLRegion' ? key : 'regions';
  // An interaction use on an interaction overview diagram is a node of its activity.
  if (childType === 'UMLInteractionUse' && ownerType === 'UMLActivity') return 'nodes';
  if (key) return key;
  return 'ownedElements';
}

// ───────────────────────── helpers

export const typeDef = (type) => TYPES[type] ?? null;
export const isDiagramType = (type) => Boolean(DIAGRAM_TYPES[type]);
export const isEdgeType = (type) => Boolean(TYPES[type]?.edge);
export const isNamespaceType = (type) => Boolean(TYPES[type]?.namespace) || type === 'Project';
export const typeLabel = (type, language = 'ko') => {
  const def = TYPES[type] ?? VIEW_ONLY[type];
  if (def) return language === 'ko' ? def.ko : def.en;
  return String(type ?? '').replace(/^(UML|ERD|FC|DFD|SysML|BPMN|C4|MM|WF|Cloud)/, '').replace(/View$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
};
/** Field definitions for the Properties panel. */
export const fieldsOf = (type) => TYPES[type]?.fields ?? [];
/** View type for a model element type (StarUML convention: UMLClass → UMLClassView). */
export const viewTypeOf = (type) => `${type}View`;
/** Model type of a view type ('' for annotation views). */
export const modelTypeOfView = (viewType) => (VIEW_ONLY[viewType] ? '' : String(viewType ?? '').replace(/View$/, ''));
/** Drawing descriptor of a view type. */
export function viewDef(viewType) {
  if (VIEW_ONLY[viewType]) return { ...VIEW_ONLY[viewType], viewOnly: true };
  const model = TYPES[modelTypeOfView(viewType)];
  return model ? { ...model, viewOnly: false } : { shape: 'rect', ko: viewType, en: viewType, viewOnly: true };
}

/** Classifier-like types that a typed field may point at. */
export const TYPE_TARGETS = ['UMLClass', 'UMLInterface', 'UMLDataType', 'UMLPrimitiveType', 'UMLEnumeration', 'UMLSignal', 'UMLComponent', 'UMLActor', 'SysMLBlock', 'SysMLValueType', 'SysMLInterfaceBlock'];
export const CLASSIFIER_TYPES = [...TYPE_TARGETS, 'UMLUseCase', 'UMLArtifact', 'UMLNode', 'UMLDevice', 'UMLExecutionEnvironment', 'UMLCollaboration', 'UMLStereotype', 'UMLSubsystem', 'SysMLConstraintBlock', 'UMLInformationItem', 'UMLMetaClass'];

// The toolbox: for each diagram type, groups of tools (StarUML's palette).
// A tool creates a model element with a view (node), a relationship with a
// line between two views (edge), or an annotation view (note, text, shapes).
//   { id, type, kind: 'node' | 'edge', icon, ko, en, attrs (model fields), view (view fields), size }
// Pure data plus helpers.
import { DIAGRAM_TYPES, NW_DEVICES, TYPES, VIEW_ONLY } from './meta.js';
import { GROUP_KINDS, SERVICES } from './cloud.js';
import { ARCHIMATE_ELEMENTS, ARCHIMATE_LAYERS, ARCHIMATE_RELATIONS } from './archimate.js';
import { archimateIcon, deviceIcon } from '../render/glyphs.js';

const label = (type) => TYPES[type] ?? VIEW_ONLY[type];
/** A node tool for a model type (or annotation view type). */
const N = (type, extra = {}) => ({ id: extra.id ?? type, type, kind: 'node', icon: extra.icon ?? label(type)?.icon ?? 'rectTool', ko: extra.ko ?? label(type)?.ko, en: extra.en ?? label(type)?.en, attrs: extra.attrs ?? {}, view: extra.view ?? {}, size: extra.size ?? null });
/** An edge tool. */
const E = (type, extra = {}) => ({ ...N(type, extra), kind: 'edge' });

const ANNOTATIONS = ['annotations', '주석', 'Annotations', [
  N('UMLNoteView'), E('UMLNoteLinkView'), N('UMLTextView'), N('UMLConstraint', { size: { w: 0, h: 0 } }), N('UMLFrameView', { size: { w: 400, h: 300 } }),
  N('RectangleView'), N('RoundRectView'), N('EllipseView'), N('HyperlinkView', { view: { text: 'https://', url: 'https://' } }), N('ImageView'), E('FreelineEdgeView'),
]];

const ASSOC = [
  E('UMLAssociation'),
  E('UMLAssociation', { id: 'directedAssociation', ko: '방향 연관', en: 'Directed Association', icon: 'umlDirectedAssociation', attrs: { end2: { navigable: 'navigable' } } }),
  E('UMLAssociation', { id: 'aggregation', ko: '집합', en: 'Aggregation', icon: 'umlAggregation', attrs: { end1: { aggregation: 'shared' } } }),
  E('UMLAssociation', { id: 'composition', ko: '합성', en: 'Composition', icon: 'umlComposition', attrs: { end1: { aggregation: 'composite' } } }),
];

const fragment = (op) => N('UMLCombinedFragment', { id: `fragment:${op}`, ko: `결합 프래그먼트 (${op})`, en: `Combined Fragment (${op})`, attrs: { interactionOperator: op }, size: { w: 260, h: 140 } });
const pseudo = (kind, ko, en, icon) => N('UMLPseudostate', { id: `pseudo:${kind}`, ko, en, icon, attrs: { kind } });
const msg = (sort, ko, en, icon) => E('UMLMessage', { id: `message:${sort}`, ko, en, icon, attrs: { messageSort: sort } });
const action = (kind, ko, en, icon) => N('UMLAction', { id: `action:${kind}`, ko, en, icon, attrs: { kind } });
const task = (kind, ko, en) => N('BPMNTask', { id: `task:${kind}`, ko, en, attrs: { taskKind: kind } });
const bpmnEvent = (type, kind, ko, en, attrs = {}) => N(type, { id: `${type}:${kind}`, ko, en, attrs: { eventKind: kind, ...attrs } });
const erd = (c1, c2, ko, en, extra = {}) => E('ERDRelationship', { id: `erd:${c1}:${c2}${extra.identifying === false ? ':n' : ''}`, ko, en, icon: 'erdRelationship', attrs: { identifying: extra.identifying ?? true, end1: { cardinality: c1 }, end2: { cardinality: c2 } } });

/** diagram type → [[groupId, ko, en, tools]] */
export const TOOLBOX = {
  UMLClassDiagram: [
    ['classes', '클래스', 'Classes', [N('UMLPackage'), N('UMLClass'), N('UMLInterface'), N('UMLSignal'), N('UMLDataType'), N('UMLPrimitiveType'), N('UMLEnumeration')]],
    ['relations', '관계', 'Relationships', [...ASSOC, E('UMLDependency'), E('UMLGeneralization'), E('UMLInterfaceRealization'), E('UMLRealization'), E('UMLTemplateBinding'), E('UMLContainment'), E('UMLAssociationClassLink')]],
    ANNOTATIONS,
  ],
  UMLPackageDiagram: [
    ['packages', '패키지', 'Packages', [N('UMLPackage'), N('UMLModel'), N('UMLSubsystem'), N('UMLProfile')]],
    ['relations', '관계', 'Relationships', [E('UMLDependency'), E('UMLDependency', { id: 'import', ko: '가져오기', en: 'Import', attrs: { stereotype: 'import' } }), E('UMLDependency', { id: 'merge', ko: '병합', en: 'Merge', attrs: { stereotype: 'merge' } }), E('UMLContainment'), E('UMLGeneralization')]],
    ANNOTATIONS,
  ],
  UMLObjectDiagram: [
    ['objects', '객체', 'Objects', [N('UMLObject'), N('UMLClass'), N('UMLPackage')]],
    ['relations', '관계', 'Relationships', [E('UMLLink'), E('UMLDependency')]],
    ANNOTATIONS,
  ],
  UMLCompositeStructureDiagram: [
    ['structure', '구조', 'Structure', [N('UMLClass', { size: { w: 280, h: 180 } }), N('UMLPart'), N('UMLPort'), N('UMLCollaboration'), N('UMLCollaborationUse'), N('UMLInterface')]],
    ['relations', '관계', 'Relationships', [E('UMLConnector'), E('UMLDependency'), E('UMLRealization'), E('UMLUsage')]],
    ANNOTATIONS,
  ],
  UMLComponentDiagram: [
    ['components', '컴포넌트', 'Components', [N('UMLComponent'), N('UMLInterface'), N('UMLInterface', { id: 'interfaceIcon', ko: '인터페이스 (아이콘)', en: 'Interface (Icon)', icon: 'umlLollipop', view: { stereotypeDisplay: 'icon' } }), N('UMLPort'), N('UMLArtifact'), N('UMLClass'), N('UMLPackage')]],
    ['relations', '관계', 'Relationships', [E('UMLDependency'), E('UMLUsage', { ko: '필요 인터페이스 (사용)', en: 'Required Interface (Usage)' }), E('UMLInterfaceRealization', { ko: '제공 인터페이스', en: 'Provided Interface' }), E('UMLComponentRealization'), E('UMLConnector', { ko: '조립 커넥터', en: 'Assembly Connector' }), E('UMLConnector', { id: 'delegation', ko: '위임 커넥터', en: 'Delegation Connector', attrs: { kind: 'delegation' } }), E('UMLGeneralization'), E('UMLManifestation')]],
    ANNOTATIONS,
  ],
  UMLDeploymentDiagram: [
    ['nodes', '노드', 'Nodes', [N('UMLNode', { size: { w: 200, h: 120 } }), N('UMLDevice'), N('UMLExecutionEnvironment'), N('UMLNodeInstance'), N('UMLArtifact'), N('UMLArtifactInstance'), N('UMLComponent'), N('UMLComponentInstance')]],
    ['relations', '관계', 'Relationships', [E('UMLCommunicationPath'), E('UMLDeployment'), E('UMLManifestation'), E('UMLDependency'), E('UMLGeneralization')]],
    ANNOTATIONS,
  ],
  UMLProfileDiagram: [
    ['profile', '프로파일', 'Profile', [N('UMLProfile'), N('UMLStereotype'), N('UMLMetaClass'), N('UMLEnumeration'), N('UMLDataType')]],
    ['relations', '관계', 'Relationships', [E('UMLExtension'), E('UMLGeneralization'), E('UMLDependency')]],
    ANNOTATIONS,
  ],
  UMLUseCaseDiagram: [
    ['usecases', '유스케이스', 'Use Cases', [N('UMLActor'), N('UMLUseCase'), N('UMLUseCaseSubject', { size: { w: 260, h: 320 } }), N('UMLPackage')]],
    ['relations', '관계', 'Relationships', [E('UMLAssociation'), ASSOC[1], E('UMLGeneralization'), E('UMLInclude'), E('UMLExtend'), E('UMLDependency')]],
    ANNOTATIONS,
  ],
  UMLSequenceDiagram: [
    ['lifelines', '라이프라인', 'Lifelines', [N('UMLLifeline'), N('UMLLifeline', { id: 'actorLifeline', ko: '액터 라이프라인', en: 'Actor Lifeline', icon: 'umlActor', attrs: { actor: true } })]],
    ['messages', '메시지', 'Messages', [msg('synchCall', '동기 메시지', 'Synch Message', 'umlMessage'), msg('asynchCall', '비동기 메시지', 'Asynch Message', 'umlAsyncMessage'), msg('reply', '응답 메시지', 'Reply Message', 'umlReply'), msg('createMessage', '생성 메시지', 'Create Message', 'umlCreate'), msg('deleteMessage', '삭제 메시지', 'Delete Message', 'umlDelete'), msg('asynchSignal', '시그널', 'Signal', 'umlAsyncMessage'), N('UMLEndpoint', { ko: '분실/발견 끝점', en: 'Lost/Found Endpoint' }), N('UMLGate')]],
    ['fragments', '프래그먼트', 'Fragments', [fragment('alt'), fragment('opt'), fragment('loop'), fragment('par'), fragment('break'), fragment('critical'), fragment('neg'), fragment('strict'), fragment('seq'), fragment('ignore'), fragment('consider'), fragment('assert'), N('UMLInteractionUse', { size: { w: 220, h: 60 } }), N('UMLStateInvariant'), N('UMLContinuation'), N('UMLDurationConstraint'), N('UMLTimeConstraint')]],
    ANNOTATIONS,
  ],
  UMLCommunicationDiagram: [
    ['lifelines', '라이프라인', 'Lifelines', [N('UMLLifeline'), N('UMLLifeline', { id: 'actorLifeline', ko: '액터 라이프라인', en: 'Actor Lifeline', icon: 'umlActor', attrs: { actor: true } })]],
    ['relations', '연결', 'Links', [E('UMLConnector'), E('UMLMessage', { id: 'commMessage', ko: '메시지 (커넥터에)', en: 'Message (on a connector)', icon: 'umlMessage', attrs: { messageSort: 'synchCall' }, onConnector: true })]],
    ANNOTATIONS,
  ],
  UMLTimingDiagram: [
    ['timing', '타이밍', 'Timing', [N('UMLTimingLifeline', { size: { w: 520, h: 120 } }), N('UMLTimeTick'), N('UMLDurationConstraint'), N('UMLTimeConstraint')]],
    ['relations', '관계', 'Relationships', [msg('synchCall', '메시지', 'Message', 'umlMessage')]],
    ANNOTATIONS,
  ],
  UMLInteractionOverviewDiagram: [
    ['nodes', '노드', 'Nodes', [N('UMLInitialNode'), N('UMLActivityFinalNode'), N('UMLDecisionNode'), N('UMLMergeNode'), N('UMLForkNode'), N('UMLJoinNode'), N('UMLInteractionUse', { size: { w: 220, h: 60 } }), N('UMLFrameView', { id: 'interactionFrame', ko: '인터랙션 프레임', en: 'Interaction Frame', size: { w: 300, h: 200 } })]],
    ['relations', '관계', 'Relationships', [E('UMLControlFlow')]],
    ANNOTATIONS,
  ],
  UMLInformationFlowDiagram: [
    ['items', '항목', 'Items', [N('UMLClass'), N('UMLInformationItem'), N('UMLActor'), N('UMLComponent')]],
    ['relations', '관계', 'Relationships', [E('UMLInformationFlow'), E('UMLDependency'), E('UMLAssociation')]],
    ANNOTATIONS,
  ],
  UMLStatechartDiagram: [
    ['states', '상태', 'States', [N('UMLState'), N('UMLState', { id: 'compositeState', ko: '복합 상태', en: 'Composite State', icon: 'umlCompositeState', size: { w: 260, h: 180 } }), N('UMLSubmachineState'), N('UMLFinalState'),
      pseudo('initial', '시작 상태', 'Initial State', 'umlInitial'), pseudo('choice', '선택', 'Choice', 'umlDecision'), pseudo('junction', '접합', 'Junction', 'umlJunction'), pseudo('fork', '분기', 'Fork', 'umlFork'), pseudo('join', '합류', 'Join', 'umlJoin'),
      pseudo('shallowHistory', '얕은 이력', 'Shallow History', 'umlHistory'), pseudo('deepHistory', '깊은 이력', 'Deep History', 'umlDeepHistory'), pseudo('entryPoint', '진입점', 'Entry Point', 'umlEntryPoint'), pseudo('exitPoint', '탈출점', 'Exit Point', 'umlExitPoint'), pseudo('terminate', '종료', 'Terminate', 'umlTerminate')]],
    ['relations', '관계', 'Relationships', [E('UMLTransition')]],
    ANNOTATIONS,
  ],
  UMLActivityDiagram: [
    ['actions', '액션', 'Actions', [N('UMLAction'), action('callBehavior', '행위 호출', 'Call Behavior', 'umlCallBehavior'), action('callOperation', '오퍼레이션 호출', 'Call Operation', 'umlCallBehavior'), action('sendSignal', '시그널 보내기', 'Send Signal', 'umlSendSignal'), action('acceptSignal', '이벤트 받기', 'Accept Event', 'umlAcceptSignal'), action('acceptTimeEvent', '시간 이벤트', 'Time Event', 'umlTimeEvent'),
      N('UMLObjectNode'), N('UMLCentralBufferNode'), N('UMLDataStoreNode'), N('UMLInputPin'), N('UMLOutputPin')]],
    ['control', '제어', 'Control', [N('UMLInitialNode'), N('UMLActivityFinalNode'), N('UMLFlowFinalNode'), N('UMLForkNode'), N('UMLJoinNode'), N('UMLDecisionNode'), N('UMLMergeNode')]],
    ['groups', '그룹', 'Groups', [N('UMLActivityPartition', { ko: '수직 파티션', en: 'Vertical Partition', size: { w: 220, h: 420 } }), N('UMLActivityPartition', { id: 'partitionH', ko: '수평 파티션', en: 'Horizontal Partition', attrs: { isVertical: false }, size: { w: 600, h: 160 } }), N('UMLStructuredActivityNode', { size: { w: 260, h: 160 } }), N('UMLExpansionRegion', { size: { w: 260, h: 160 } }), N('UMLInterruptibleActivityRegion', { size: { w: 260, h: 160 } })]],
    ['relations', '관계', 'Relationships', [E('UMLControlFlow'), E('UMLObjectFlow'), E('UMLExceptionHandler')]],
    ANNOTATIONS,
  ],
  ERDDiagram: [
    ['entities', '엔터티', 'Entities', [N('ERDEntity', { attrs: { columns: [] } })]],
    ['relations', '관계', 'Relationships', [erd('1', '0..*', '일대다 (1:N)', 'One to Many'), erd('1', '1', '일대일 (1:1)', 'One to One'), erd('1', '0..1', '일대영또는일 (1:0..1)', 'One to Zero or One'), erd('0..*', '0..*', '다대다 (N:M)', 'Many to Many'), erd('1', '0..*', '비식별 일대다', 'Non-identifying One to Many', { identifying: false })]],
    ANNOTATIONS,
  ],
  FCFlowchartDiagram: [
    ['symbols', '기호', 'Symbols', Object.keys(TYPES).filter((type) => TYPES[type].group === 'flowchart' && !TYPES[type].edge).map((type) => N(type))],
    ['relations', '흐름', 'Flows', [E('FCFlow')]],
    ANNOTATIONS,
  ],
  DFDDiagram: [
    ['symbols', '기호', 'Symbols', [N('DFDExternalEntity'), N('DFDProcess'), N('DFDDataStore')]],
    ['relations', '흐름', 'Flows', [E('DFDDataFlow')]],
    ANNOTATIONS,
  ],
  SysMLRequirementDiagram: [
    ['requirements', '요구사항', 'Requirements', [N('SysMLRequirement'), N('SysMLBlock'), N('UMLUseCase'), N('UMLPackage')]],
    ['relations', '관계', 'Relationships', [E('SysMLDeriveReqt'), E('SysMLSatisfy'), E('SysMLVerify'), E('SysMLRefine'), E('SysMLTrace'), E('SysMLCopy'), E('UMLContainment')]],
    ANNOTATIONS,
  ],
  SysMLBlockDefinitionDiagram: [
    ['blocks', '블록', 'Blocks', [N('SysMLBlock'), N('SysMLInterfaceBlock'), N('SysMLValueType'), N('SysMLConstraintBlock'), N('UMLEnumeration'), N('UMLActor'), N('UMLPackage')]],
    ['relations', '관계', 'Relationships', [...ASSOC, E('UMLGeneralization'), E('UMLDependency'), E('UMLInterfaceRealization')]],
    ANNOTATIONS,
  ],
  SysMLInternalBlockDiagram: [
    ['parts', '파트', 'Parts', [N('SysMLBlock', { size: { w: 420, h: 280 } }), N('SysMLPart'), N('SysMLPort'), N('UMLActor')]],
    ['relations', '관계', 'Relationships', [E('SysMLConnector'), E('SysMLItemFlow'), E('UMLDependency')]],
    ANNOTATIONS,
  ],
  SysMLParametricDiagram: [
    ['parametric', '매개변수', 'Parametric', [N('SysMLConstraintBlock', { size: { w: 420, h: 280 } }), N('SysMLConstraintProperty'), N('SysMLConstraintParameter'), N('SysMLPart')]],
    ['relations', '관계', 'Relationships', [E('SysMLConnector')]],
    ANNOTATIONS,
  ],
  BPMNDiagram: [
    ['swimlanes', '수영 레인', 'Swimlanes', [N('BPMNParticipant', { size: { w: 700, h: 240 } }), N('BPMNLane', { size: { w: 668, h: 120 } })]],
    ['activities', '활동', 'Activities', [N('BPMNTask'), task('user', '사용자 태스크', 'User Task'), task('service', '서비스 태스크', 'Service Task'), task('script', '스크립트 태스크', 'Script Task'), task('manual', '수동 태스크', 'Manual Task'), task('send', '보내기 태스크', 'Send Task'), task('receive', '받기 태스크', 'Receive Task'), task('businessRule', '비즈니스 규칙', 'Business Rule Task'), N('BPMNSubProcess', { size: { w: 260, h: 150 } }), N('BPMNCallActivity')]],
    ['events', '이벤트', 'Events', [N('BPMNStartEvent'), bpmnEvent('BPMNStartEvent', 'message', '메시지 시작', 'Message Start'), bpmnEvent('BPMNStartEvent', 'timer', '타이머 시작', 'Timer Start'), N('BPMNIntermediateEvent'), bpmnEvent('BPMNIntermediateEvent', 'message', '메시지 받기', 'Message Catch'), bpmnEvent('BPMNIntermediateEvent', 'timer', '타이머', 'Timer'), bpmnEvent('BPMNIntermediateEvent', 'signal', '시그널', 'Signal'), N('BPMNBoundaryEvent'), N('BPMNEndEvent'), bpmnEvent('BPMNEndEvent', 'message', '메시지 종료', 'Message End'), bpmnEvent('BPMNEndEvent', 'error', '오류 종료', 'Error End'), bpmnEvent('BPMNEndEvent', 'terminate', '강제 종료', 'Terminate End')]],
    ['gateways', '게이트웨이', 'Gateways', [N('BPMNExclusiveGateway'), N('BPMNParallelGateway'), N('BPMNInclusiveGateway'), N('BPMNEventBasedGateway'), N('BPMNComplexGateway')]],
    ['data', '데이터', 'Data', [N('BPMNDataObject'), N('BPMNDataStore'), N('BPMNTextAnnotation', { attrs: { text: '' } }), N('BPMNGroup', { size: { w: 240, h: 160 } })]],
    ['flows', '흐름', 'Flows', [E('BPMNSequenceFlow'), E('BPMNMessageFlow'), E('BPMNAssociation'), E('BPMNDataAssociation')]],
    ANNOTATIONS,
  ],
  C4Diagram: [
    ['elements', '요소', 'Elements', [N('C4Person'), N('C4Person', { id: 'externalPerson', ko: '외부 사람', en: 'External Person', attrs: { external: true } }), N('C4SoftwareSystem'), N('C4SoftwareSystem', { id: 'externalSystem', ko: '외부 시스템', en: 'External System', attrs: { external: true } }), N('C4Container'), N('C4ContainerDatabase'), N('C4Component')]],
    ['groups', '경계', 'Boundaries', [N('C4Boundary', { size: { w: 420, h: 300 } }), N('C4DeploymentNode', { size: { w: 420, h: 300 } })]],
    ['relations', '관계', 'Relationships', [E('C4Relationship')]],
    ANNOTATIONS,
  ],
  MMMindmapDiagram: [
    ['mindmap', '마인드맵', 'Mind Map', [N('MMNode')]],
    ['relations', '가지', 'Branches', [E('MMEdgeView', { id: 'branch', ko: '가지', en: 'Branch' })]],
    ANNOTATIONS,
  ],
  WFWireframeDiagram: [
    ['frames', '프레임', 'Frames', ['WFDesktopFrame', 'WFWebFrame', 'WFMobileFrame', 'WFPanel'].map((type) => N(type))],
    ['widgets', '위젯', 'Widgets', Object.keys(TYPES).filter((type) => TYPES[type].group === 'wireframe' && !['WFDesktopFrame', 'WFWebFrame', 'WFMobileFrame', 'WFPanel'].includes(type)).map((type) => N(type))],
    ANNOTATIONS,
  ],
};

for (const [diagram, provider] of [['AWSDiagram', 'aws'], ['AzureDiagram', 'azure'], ['GCPDiagram', 'gcp']]) {
  const groups = GROUP_KINDS[provider].map(([kind, name]) => N('CloudGroup', { id: `group:${kind}`, ko: name, en: name, icon: 'cloudGroup', attrs: { provider, groupKind: kind, name }, size: { w: 420, h: 260 } }));
  const byCategory = {};
  for (const [service, , category] of SERVICES[provider]) (byCategory[category] ??= []).push(N('CloudService', { id: `service:${service}`, ko: service, en: service, icon: 'cloudService', attrs: { provider, service, name: service } }));
  TOOLBOX[diagram] = [
    ['groups', '그룹', 'Groups', groups],
    ...Object.entries(byCategory).map(([category, tools]) => [category, category, category.replace(/^./, (c) => c.toUpperCase()), tools]),
    ['relations', '연결', 'Connections', [E('CloudConnection')]],
    ANNOTATIONS,
  ];
}

// Project planning, ArchiMate, network and data diagrams (the PlantUML / Enterprise Architect kinds).
Object.assign(TOOLBOX, {
  GanttDiagram: [
    ['gantt', '간트', 'Gantt', [N('GanttCalendar'), N('GanttTask'), N('GanttMilestone'), N('GanttSeparator')]],
    ['relations', '관계', 'Relationships', [E('GanttDependency')]],
    ANNOTATIONS,
  ],
  WBSDiagram: [
    ['wbs', 'WBS', 'WBS', [N('WBSNode')]],
    ['relations', '가지', 'Branches', [E('WBSEdgeView', { id: 'wbsBranch' })]],
    ANNOTATIONS,
  ],
  TimelineDiagram: [
    ['timeline', '타임라인', 'Timeline', [N('TLTimeline'), N('TLEvent'), N('TLPeriod')]],
    ['relations', '관계', 'Relationships', [E('TLLink')]],
    ANNOTATIONS,
  ],
  ArchiMateDiagram: [
    ...ARCHIMATE_LAYERS.filter(([layer]) => layer !== 'other').map(([layer, ko, en]) => [layer, ko, en, ARCHIMATE_ELEMENTS.filter(([kind]) => kind.startsWith(`${layer}-`)).map(([kind, eko, een]) => N('ArchiMateElement', { id: `archimate:${kind}`, ko: eko, en: een, icon: archimateIcon(kind.slice(layer.length + 1)), attrs: { kind } }))]),
    ['other', '기타', 'Other', [N('ArchiMateElement', { id: 'archimate:other-location', ko: '위치', en: 'Location', icon: 'amLocation', attrs: { kind: 'other-location' } }), N('ArchiMateGrouping', { size: { w: 360, h: 240 } }),
      N('ArchiMateJunction', { ko: '접합 (그리고)', en: 'Junction (And)' }), N('ArchiMateJunction', { id: 'junction:or', ko: '접합 (또는)', en: 'Junction (Or)', icon: 'amJunctionOr', attrs: { junctionType: 'or' } })]],
    ['relations', '관계', 'Relationships', ARCHIMATE_RELATIONS.map(([type]) => E(type))],
    ANNOTATIONS,
  ],
  NetworkDiagram: [
    ['network', '네트워크', 'Network', [N('NWNetwork', { size: { w: 560, h: 0 } }), ...NW_DEVICES.map((device, i) => N('NWNode', { id: i ? `nwnode:${device}` : 'NWNode', ko: i ? `노드 (${device})` : undefined, en: i ? `Node (${device})` : undefined, icon: deviceIcon(device), attrs: { device } })), N('NWGroup', { size: { w: 300, h: 160 } })]],
    ['relations', '연결', 'Connections', [E('NWConnection')]],
    ANNOTATIONS,
  ],
  JSONDiagram: [
    ['data', '데이터', 'Data', [N('DSDocument', { id: 'jsonDocument', ko: 'JSON 문서', en: 'JSON Document', icon: 'dsJson', attrs: { format: 'json', text: '{\n  "id": 1,\n  "name": "value",\n  "tags": ["a", "b"]\n}' } })]],
    ['relations', '관계', 'Relationships', [E('DSReference')]],
    ANNOTATIONS,
  ],
  YAMLDiagram: [
    ['data', '데이터', 'Data', [N('DSDocument', { id: 'yamlDocument', ko: 'YAML 문서', en: 'YAML Document', icon: 'dsYaml', attrs: { format: 'yaml', text: 'id: 1\nname: value\ntags:\n  - a\n  - b' } })]],
    ['relations', '관계', 'Relationships', [E('DSReference')]],
    ANNOTATIONS,
  ],
  EBNFDiagram: [
    ['grammar', '문법', 'Grammar', [N('EBNFRule', { attrs: { expression: 'letter, { letter | digit }' } })]],
    ['relations', '관계', 'Relationships', [E('DSReference')]],
    ANNOTATIONS,
  ],
  RegexDiagram: [
    ['regex', '정규식', 'Regex', [N('RegexPattern', { attrs: { pattern: '[A-Z]{2}-\\d{4}' } })]],
    ['relations', '관계', 'Relationships', [E('DSReference')]],
    ANNOTATIONS,
  ],
});

/** Toolbox groups of a diagram type. */
export const toolboxFor = (diagramType) => TOOLBOX[diagramType] ?? TOOLBOX.UMLClassDiagram;
/** A tool by id within a diagram type. */
export function toolById(diagramType, id) {
  for (const [, , , tools] of toolboxFor(diagramType)) { const tool = tools.find((x) => x.id === id); if (tool) return tool; }
  return null;
}
/** Every diagram type has a toolbox. */
export const DIAGRAM_TYPE_IDS = Object.keys(DIAGRAM_TYPES);

/** The diagram-type tabs above the canvas: [id, ko, en, diagram types]. Every diagram type is in exactly one group. */
export const DIAGRAM_TABS = [
  ['umlStructure', 'UML 구조', 'UML Structure', ['UMLClassDiagram', 'UMLPackageDiagram', 'UMLObjectDiagram', 'UMLCompositeStructureDiagram', 'UMLComponentDiagram', 'UMLDeploymentDiagram', 'UMLProfileDiagram']],
  ['umlBehavior', 'UML 행위', 'UML Behavior', ['UMLUseCaseDiagram', 'UMLActivityDiagram', 'UMLStatechartDiagram', 'UMLSequenceDiagram', 'UMLCommunicationDiagram', 'UMLTimingDiagram', 'UMLInteractionOverviewDiagram', 'UMLInformationFlowDiagram']],
  ['erd', 'ER', 'ER', ['ERDDiagram']],
  ['flowchart', '순서도', 'Flowchart', ['FCFlowchartDiagram']],
  ['dfd', '데이터 흐름', 'Data Flow', ['DFDDiagram']],
  ['sysml', 'SysML', 'SysML', ['SysMLRequirementDiagram', 'SysMLBlockDefinitionDiagram', 'SysMLInternalBlockDiagram', 'SysMLParametricDiagram']],
  ['bpmn', 'BPMN', 'BPMN', ['BPMNDiagram']],
  ['c4', 'C4', 'C4', ['C4Diagram']],
  ['mindmap', '마인드맵', 'Mind Map', ['MMMindmapDiagram']],
  ['wireframe', '와이어프레임', 'Wireframe', ['WFWireframeDiagram']],
  ['cloud', '클라우드', 'Cloud', ['AWSDiagram', 'AzureDiagram', 'GCPDiagram', 'NetworkDiagram']],
  ['project', '프로젝트', 'Project', ['GanttDiagram', 'WBSDiagram', 'TimelineDiagram']],
  ['archimate', 'ArchiMate', 'ArchiMate', ['ArchiMateDiagram']],
  ['data', '데이터', 'Data', ['JSONDiagram', 'YAMLDiagram', 'EBNFDiagram', 'RegexDiagram']],
];
/** The tab group of a diagram type. */
export const diagramTabOf = (type) => DIAGRAM_TABS.find(([, , , types]) => types.includes(type))?.[0] ?? 'umlStructure';

import type { DiagramKind, RelationshipKind, UmlElementKind } from '../uml/diagramRegistry.js';

export type Locale = 'en' | 'ko';

export interface AppMessages {
  eyebrow: string;
  projectActions: string;
  newProject: string;
  openProject: string;
  addDiagram: string;
  diagramType: string;
  chooseDiagram: string;
  pointer: string;
  save: string;
  light: string;
  dark: string;
  english: string;
  korean: string;
  about: string;
  aboutDescription: string;
  copyright: string;
  authorCredit: string;
  close: string;
  contextMenu: string;
  select: string;
  deleteSelected: string;
  diagramTypes: string;
  openDiagrams: string;
  palette: string;
  connectors: string;
  modelTree: string;
  properties: string;
  diagram: string;
  papyrusNotation: string;
  name: string;
  umlType: string;
  emptySelection: string;
  connectSource: string;
  connectTarget: string;
  nodes: string;
  edges: string;
  source: string;
  target: string;
  sourceMultiplicity: string;
  targetMultiplicity: string;
  relationship: string;
  lineStyle: string;
  straight: string;
  orthogonal: string;
  curve: string;
  ownedElements: string;
  addElement: string;
  elementType: string;
  elementOwner: string;
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
  canvasSuffix: string;
  statusBar: string;
  statusMode: string;
  statusSelection: string;
  noSelection: string;
}

export const messages: Record<Locale, AppMessages> = {
  en: {
    eyebrow: 'Papyrus-compatible UML 2.5.1',
    projectActions: 'Project actions',
    newProject: 'New project',
    openProject: 'Open project',
    addDiagram: 'Add diagram',
    diagramType: 'Diagram type',
    chooseDiagram: 'Choose diagram to add',
    pointer: 'Pointer',
    save: 'Save project',
    light: 'Light',
    dark: 'Dark',
    english: 'English',
    korean: 'Korean',
    about: 'About',
    aboutDescription: 'Standalone JavaScript/TypeScript UML 2.5.1 editor compatible with Papyrus-oriented project workflows.',
    copyright: 'Copyright (c) 2026 SHKWON. All rights reserved.',
    authorCredit: 'SHKWON(knix008@naver.com)',
    close: 'Close',
    contextMenu: 'Context menu',
    select: 'Select',
    deleteSelected: 'Delete selected',
    diagramTypes: 'UML diagram types',
    openDiagrams: 'Open diagrams',
    palette: 'Palette',
    connectors: 'Connectors',
    modelTree: 'Model Tree',
    properties: 'Properties',
    diagram: 'Diagram',
    papyrusNotation: 'Papyrus notation',
    name: 'Name',
    umlType: 'UML type',
    emptySelection: 'Select a node to edit UML 2.5.1 properties.',
    connectSource: 'Select the source shape.',
    connectTarget: 'Select the target shape.',
    nodes: 'Shapes',
    edges: 'Relationships',
    source: 'Source',
    target: 'Target',
    sourceMultiplicity: 'Source multiplicity',
    targetMultiplicity: 'Target multiplicity',
    relationship: 'Relationship',
    lineStyle: 'Line style',
    straight: 'Straight',
    orthogonal: 'Orthogonal',
    curve: 'Curve',
    ownedElements: 'Owned elements',
    addElement: 'Add element',
    elementType: 'Element type',
    elementOwner: 'Owner node',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    canvasSuffix: 'canvas',
    statusBar: 'Status bar',
    statusMode: 'Mode',
    statusSelection: 'Selection',
    noSelection: 'None'
  },
  ko: {
    eyebrow: 'Papyrus 호환 UML 2.5.1',
    projectActions: '프로젝트 작업',
    newProject: '새 프로젝트',
    openProject: '프로젝트 열기',
    addDiagram: '다이어그램 추가',
    diagramType: '다이어그램 종류',
    chooseDiagram: '추가할 다이어그램 선택',
    pointer: '선택',
    save: '프로젝트 저장',
    light: '라이트',
    dark: '다크',
    english: '영어',
    korean: '한국어',
    about: '정보',
    aboutDescription: 'Papyrus 호환 프로젝트 흐름을 고려한 독립 실행형 JavaScript/TypeScript UML 2.5.1 편집기입니다.',
    copyright: 'Copyright (c) 2026 SHKWON. All rights reserved.',
    authorCredit: 'SHKWON(knix008@naver.com)',
    close: '닫기',
    contextMenu: '컨텍스트 메뉴',
    select: '선택',
    deleteSelected: '선택 항목 삭제',
    diagramTypes: 'UML 다이어그램 종류',
    openDiagrams: '열린 다이어그램',
    palette: '팔레트',
    connectors: '연결',
    modelTree: '모델 트리',
    properties: '속성',
    diagram: '다이어그램',
    papyrusNotation: 'Papyrus notation',
    name: '이름',
    umlType: 'UML 타입',
    emptySelection: 'UML 2.5.1 속성을 편집하려면 노드를 선택하세요.',
    connectSource: '시작 도형을 선택하세요.',
    connectTarget: '대상 도형을 선택하세요.',
    nodes: '도형',
    edges: '관계',
    source: '시작',
    target: '대상',
    sourceMultiplicity: '시작 multiplicity',
    targetMultiplicity: '대상 multiplicity',
    relationship: '관계',
    lineStyle: '선 형태',
    straight: '직선',
    orthogonal: '직각',
    curve: '곡선',
    ownedElements: '소유 element',
    addElement: 'element 추가',
    elementType: 'element 종류',
    elementOwner: '소유 노드',
    zoomIn: '확대',
    zoomOut: '축소',
    resetZoom: '배율 초기화',
    canvasSuffix: '캔버스',
    statusBar: '상태바',
    statusMode: '모드',
    statusSelection: '선택',
    noSelection: '없음'
  }
};

export const diagramLabels: Record<Locale, Record<DiagramKind, string>> = {
  en: {
    class: 'Class Diagram',
    profile: 'Profile Diagram',
    package: 'Package Diagram',
    object: 'Object Diagram',
    compositeStructure: 'Composite Structure',
    component: 'Component Diagram',
    deployment: 'Deployment Diagram',
    useCase: 'Use Case Diagram',
    sequence: 'Sequence Diagram',
    communication: 'Communication Diagram',
    activity: 'Activity Diagram',
    stateMachine: 'State Machine',
    timing: 'Timing Diagram'
  },
  ko: {
    class: '클래스 다이어그램',
    profile: '프로파일 다이어그램',
    package: '패키지 다이어그램',
    object: '객체 다이어그램',
    compositeStructure: '복합 구조',
    component: '컴포넌트 다이어그램',
    deployment: '배치 다이어그램',
    useCase: '유스케이스 다이어그램',
    sequence: '시퀀스 다이어그램',
    communication: '커뮤니케이션 다이어그램',
    activity: '액티비티 다이어그램',
    stateMachine: '상태 머신',
    timing: '타이밍 다이어그램'
  }
};

export const diagramScopes: Record<Locale, Record<DiagramKind, string>> = {
  en: {
    class: 'Classes, packages, classifiers, attributes, operations, associations, generalizations',
    profile: 'Profiles, stereotypes, metaclass extensions, tagged values',
    package: 'Packages, package imports, dependencies, model organization',
    object: 'Instance specifications, slots, links',
    compositeStructure: 'Structured classifiers, parts, ports, connectors',
    component: 'Components, provided/required interfaces, dependencies, artifacts',
    deployment: 'Nodes, devices, execution environments, artifacts, deployments',
    useCase: 'Actors, use cases, subjects, include, extend, associations',
    sequence: 'Interactions, lifelines, messages, executions, combined fragments',
    communication: 'Interactions, lifelines, connectors, numbered messages',
    activity: 'Activities, actions, control nodes, object flows, control flows',
    stateMachine: 'State machines, regions, states, pseudostates, transitions',
    timing: 'Lifelines, states over time, time observations, duration constraints'
  },
  ko: {
    class: '클래스, 패키지, 분류자, 속성, 오퍼레이션, 연관, 일반화',
    profile: '프로파일, 스테레오타입, 메타클래스 확장, 태그 값',
    package: '패키지, 패키지 import, 의존성, 모델 구조화',
    object: '인스턴스 명세, 슬롯, 링크',
    compositeStructure: '구조화 분류자, 파트, 포트, 커넥터',
    component: '컴포넌트, 제공/요구 인터페이스, 의존성, 아티팩트',
    deployment: '노드, 디바이스, 실행 환경, 아티팩트, 배치',
    useCase: '액터, 유스케이스, 주체, include, extend, 연관',
    sequence: '인터랙션, 라이프라인, 메시지, 실행, 결합 fragment',
    communication: '인터랙션, 라이프라인, 커넥터, 번호가 붙은 메시지',
    activity: '액티비티, 액션, 제어 노드, 객체 흐름, 제어 흐름',
    stateMachine: '상태 머신, region, 상태, pseudostate, transition',
    timing: '라이프라인, 시간에 따른 상태, time observation, duration constraint'
  }
};

export const toolLabels: Record<Locale, Partial<Record<UmlElementKind, string>>> = {
  en: {},
  ko: {
    package: '패키지',
    class: '클래스',
    interface: '인터페이스',
    dataType: '데이터 타입',
    enumeration: '열거형',
    profile: '프로파일',
    stereotype: '스테레오타입',
    instanceSpecification: '객체',
    component: '컴포넌트',
    artifact: '아티팩트',
    node: '노드',
    device: '디바이스',
    executionEnvironment: '실행 환경',
    actor: '액터',
    useCase: '유스케이스',
    lifeline: '라이프라인',
    message: '메시지',
    action: '액션',
    decisionNode: '분기',
    initialNode: '시작',
    finalNode: '종료',
    state: '상태',
    pseudostate: '초기 상태',
    timeObservation: '시간 관찰'
  }
};

export const connectorLabels: Record<Locale, Partial<Record<RelationshipKind, string>>> = {
  en: {},
  ko: {
    association: '연관',
    generalization: '일반화',
    dependency: '의존성',
    packageImport: '패키지 import',
    realization: '실현',
    include: 'include',
    extend: 'extend',
    connector: '커넥터',
    deployment: '배치',
    message: '메시지',
    controlFlow: '제어 흐름',
    objectFlow: '객체 흐름',
    transition: '전이'
  }
};

export const notationHints: Record<Locale, Record<DiagramKind, string>> = {
  en: {
    class: 'Papyrus stores classes as UML packagedElement entries and views as notation nodes/edges.',
    profile: 'Profile diagrams persist profile and stereotype elements in UML XMI with extension relations.',
    package: 'Package diagrams share UML package elements with class diagrams but use package-focused notation views.',
    object: 'Object diagrams use UML InstanceSpecification elements and notation links.',
    compositeStructure: 'Composite structure diagrams combine classifier-owned properties with connector notation.',
    component: 'Papyrus persists components as UML Component elements and interface usages as relationships.',
    deployment: 'Deployment diagrams map UML Node and Artifact elements to nested notation views.',
    useCase: 'Use case diagrams combine UML Actor and UseCase elements with association/include/extend edges.',
    sequence: 'Sequence diagrams persist UML Interaction content and lifeline/message notation separately.',
    communication: 'Communication diagrams share Interaction elements with sequence diagrams but use graph-style notation.',
    activity: 'Activity diagrams update UML Activity nodes and notation edges together.',
    stateMachine: 'State machine diagrams persist UML StateMachine/Region contents and transition notation.',
    timing: 'Timing diagrams are Interaction-based diagrams with timeline notation and time observations.'
  },
  ko: {
    class: 'Papyrus는 클래스를 UML packagedElement로 저장하고 화면 요소는 notation node/edge로 저장합니다.',
    profile: '프로파일 다이어그램은 profile과 stereotype 요소를 UML XMI와 extension 관계로 저장합니다.',
    package: '패키지 다이어그램은 클래스 다이어그램과 UML package 요소를 공유하되 package 중심 notation view를 사용합니다.',
    object: '객체 다이어그램은 UML InstanceSpecification 요소와 notation link를 사용합니다.',
    compositeStructure: '복합 구조 다이어그램은 classifier 소유 property와 connector notation을 함께 다룹니다.',
    component: 'Papyrus는 component를 UML Component 요소로 저장하고 인터페이스 사용 관계를 relationship으로 저장합니다.',
    deployment: '배치 다이어그램은 UML Node와 Artifact 요소를 중첩 notation view에 매핑합니다.',
    useCase: '유스케이스 다이어그램은 Actor와 UseCase 요소를 association/include/extend edge와 함께 저장합니다.',
    sequence: '시퀀스 다이어그램은 UML Interaction 내용과 lifeline/message notation을 분리해 저장합니다.',
    communication: '커뮤니케이션 다이어그램은 시퀀스 다이어그램과 Interaction 요소를 공유하되 graph 형태 notation을 사용합니다.',
    activity: '액티비티 다이어그램은 UML Activity node와 notation edge를 함께 갱신합니다.',
    stateMachine: '상태 머신 다이어그램은 UML StateMachine/Region 내용과 transition notation을 저장합니다.',
    timing: '타이밍 다이어그램은 Interaction 기반 다이어그램이며 timeline notation과 time observation을 사용합니다.'
  }
};
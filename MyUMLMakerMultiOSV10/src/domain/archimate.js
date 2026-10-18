// ArchiMate 3: the elements of each layer (business, application, technology,
// physical, motivation, strategy, implementation & migration, other), their
// colours and shapes, and the relationships. An element is an
// ArchiMateElement whose `kind` is "<layer>-<name>" (business-actor,
// application-component, technology-node …), the names PlantUML's archimate
// sprites use. Pure data plus lookups.

/** layer id, ko, en, fill colour, PlantUML colour keyword */
export const ARCHIMATE_LAYERS = [
  ['business', '비즈니스', 'Business', '#ffffb5', 'Business'],
  ['application', '애플리케이션', 'Application', '#b5ffff', 'Application'],
  ['technology', '기술', 'Technology', '#c9e7b7', 'Technology'],
  ['physical', '물리', 'Physical', '#c9e7b7', 'Physical'],
  ['motivation', '동기', 'Motivation', '#ccccff', 'Motivation'],
  ['strategy', '전략', 'Strategy', '#f5deaa', 'Strategy'],
  ['implementation', '구현과 이전', 'Implementation & Migration', '#ffe0e0', 'Implementation'],
  ['other', '기타', 'Other', '#fbb875', 'Location'],
];
export const LAYER_OF = Object.fromEntries(ARCHIMATE_LAYERS.map(([id, ko, en, fill, keyword]) => [id, { id, ko, en, fill, keyword }]));

/** kind, ko, en, form: 'structure' (square corners) | 'behavior' (rounded) | 'motivation' (cut corners) */
export const ARCHIMATE_ELEMENTS = [
  ['business-actor', '비즈니스 액터', 'Business Actor', 'structure'],
  ['business-role', '비즈니스 역할', 'Business Role', 'structure'],
  ['business-collaboration', '비즈니스 협업', 'Business Collaboration', 'structure'],
  ['business-interface', '비즈니스 인터페이스', 'Business Interface', 'structure'],
  ['business-process', '비즈니스 프로세스', 'Business Process', 'behavior'],
  ['business-function', '비즈니스 기능', 'Business Function', 'behavior'],
  ['business-interaction', '비즈니스 상호작용', 'Business Interaction', 'behavior'],
  ['business-event', '비즈니스 이벤트', 'Business Event', 'behavior'],
  ['business-service', '비즈니스 서비스', 'Business Service', 'behavior'],
  ['business-object', '비즈니스 객체', 'Business Object', 'structure'],
  ['business-contract', '계약', 'Contract', 'structure'],
  ['business-representation', '표현', 'Representation', 'structure'],
  ['business-product', '제품', 'Product', 'structure'],
  ['application-component', '애플리케이션 컴포넌트', 'Application Component', 'structure'],
  ['application-collaboration', '애플리케이션 협업', 'Application Collaboration', 'structure'],
  ['application-interface', '애플리케이션 인터페이스', 'Application Interface', 'structure'],
  ['application-function', '애플리케이션 기능', 'Application Function', 'behavior'],
  ['application-interaction', '애플리케이션 상호작용', 'Application Interaction', 'behavior'],
  ['application-process', '애플리케이션 프로세스', 'Application Process', 'behavior'],
  ['application-event', '애플리케이션 이벤트', 'Application Event', 'behavior'],
  ['application-service', '애플리케이션 서비스', 'Application Service', 'behavior'],
  ['application-data-object', '데이터 객체', 'Data Object', 'structure'],
  ['technology-node', '노드', 'Node', 'structure'],
  ['technology-device', '장치', 'Device', 'structure'],
  ['technology-system-software', '시스템 소프트웨어', 'System Software', 'structure'],
  ['technology-collaboration', '기술 협업', 'Technology Collaboration', 'structure'],
  ['technology-interface', '기술 인터페이스', 'Technology Interface', 'structure'],
  ['technology-path', '경로', 'Path', 'structure'],
  ['technology-communication-network', '통신 네트워크', 'Communication Network', 'structure'],
  ['technology-function', '기술 기능', 'Technology Function', 'behavior'],
  ['technology-process', '기술 프로세스', 'Technology Process', 'behavior'],
  ['technology-interaction', '기술 상호작용', 'Technology Interaction', 'behavior'],
  ['technology-event', '기술 이벤트', 'Technology Event', 'behavior'],
  ['technology-service', '기술 서비스', 'Technology Service', 'behavior'],
  ['technology-artifact', '아티팩트', 'Artifact', 'structure'],
  ['physical-equipment', '장비', 'Equipment', 'structure'],
  ['physical-facility', '시설', 'Facility', 'structure'],
  ['physical-distribution-network', '배송 네트워크', 'Distribution Network', 'structure'],
  ['physical-material', '자재', 'Material', 'structure'],
  ['motivation-stakeholder', '이해관계자', 'Stakeholder', 'motivation'],
  ['motivation-driver', '동인', 'Driver', 'motivation'],
  ['motivation-assessment', '평가', 'Assessment', 'motivation'],
  ['motivation-goal', '목표', 'Goal', 'motivation'],
  ['motivation-outcome', '성과', 'Outcome', 'motivation'],
  ['motivation-principle', '원칙', 'Principle', 'motivation'],
  ['motivation-requirement', '요구사항', 'Requirement', 'motivation'],
  ['motivation-constraint', '제약', 'Constraint', 'motivation'],
  ['motivation-meaning', '의미', 'Meaning', 'motivation'],
  ['motivation-value', '가치', 'Value', 'motivation'],
  ['strategy-resource', '자원', 'Resource', 'structure'],
  ['strategy-capability', '역량', 'Capability', 'behavior'],
  ['strategy-value-stream', '가치 흐름', 'Value Stream', 'behavior'],
  ['strategy-course-of-action', '행동 방침', 'Course of Action', 'behavior'],
  ['implementation-work-package', '작업 패키지', 'Work Package', 'behavior'],
  ['implementation-deliverable', '산출물', 'Deliverable', 'structure'],
  ['implementation-event', '구현 이벤트', 'Implementation Event', 'behavior'],
  ['implementation-plateau', '안정 단계', 'Plateau', 'structure'],
  ['implementation-gap', '차이', 'Gap', 'structure'],
  ['other-location', '위치', 'Location', 'structure'],
];
export const ARCHIMATE_KINDS = ARCHIMATE_ELEMENTS.map(([kind]) => kind);

/** { kind, layer, name, ko, en, form, fill } of a kind (unknown → business actor). */
export function archimateInfo(kind) {
  const row = ARCHIMATE_ELEMENTS.find(([k]) => k === kind) ?? ARCHIMATE_ELEMENTS[0];
  const layer = row[0].split('-')[0];
  const name = row[0].slice(layer.length + 1);
  const fill = row[0] === 'implementation-plateau' || row[0] === 'implementation-gap' ? '#e0ffe0' : LAYER_OF[layer].fill;
  return { kind: row[0], layer, name, ko: row[1], en: row[2], form: row[3], fill };
}

const squash = (text) => String(text ?? '').toLowerCase().replace(/[^a-z]/g, '');
const BY_SQUASHED = new Map(ARCHIMATE_KINDS.flatMap((kind) => {
  const name = kind.slice(kind.indexOf('-') + 1);
  return [[squash(kind), kind], [squash(`${kind.split('-')[0]}${name}`), kind]];
}));
// Other spellings PlantUML and the archimate library use.
for (const [alias, kind] of [['businessworkpackage', 'implementation-work-package'], ['implementationworkpackage', 'implementation-work-package'], ['workpackage', 'implementation-work-package'],
  ['applicationdataobject', 'application-data-object'], ['dataobject', 'application-data-object'], ['technologysystemsoftware', 'technology-system-software'], ['location', 'other-location'],
  ['otherlocation', 'other-location'], ['contract', 'business-contract'], ['representation', 'business-representation'], ['product', 'business-product'], ['technologyartifact', 'technology-artifact'],
  ['artifact', 'technology-artifact'], ['technologynetwork', 'technology-communication-network'], ['technologycommunicationnetwork', 'technology-communication-network'], ['communicationnetwork', 'technology-communication-network'],
  ['physicaldistributionnetwork', 'physical-distribution-network'], ['implementationdeliverable', 'implementation-deliverable'], ['implementationplateau', 'implementation-plateau'], ['implementationgap', 'implementation-gap']]) BY_SQUASHED.set(alias, kind);

/** The kind of a PlantUML sprite or macro name (business-actor, Business_Actor, <<application-component>> …), or null. */
export function archimateKindOf(text) {
  const key = squash(text);
  if (BY_SQUASHED.has(key)) return BY_SQUASHED.get(key);
  // "motivation-goal" written as "goal" (no layer) → the first kind with that name.
  const bare = ARCHIMATE_KINDS.find((kind) => squash(kind.slice(kind.indexOf('-') + 1)) === key);
  return bare ?? null;
}

/** PlantUML archimate library macro of a kind: Business_Actor, Technology_SystemSoftware … */
export function archimateMacro(kind) {
  const info = archimateInfo(kind);
  const layer = info.layer === 'other' ? 'Other' : info.layer[0].toUpperCase() + info.layer.slice(1);
  return `${layer}_${info.name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}`;
}

/** Relationship type, ko, en, PlantUML Rel_ name */
export const ARCHIMATE_RELATIONS = [
  ['ArchiMateComposition', '합성', 'Composition', 'Composition'],
  ['ArchiMateAggregation', '집합', 'Aggregation', 'Aggregation'],
  ['ArchiMateAssignment', '할당', 'Assignment', 'Assignment'],
  ['ArchiMateRealization', '실현', 'Realization', 'Realization'],
  ['ArchiMateServing', '서비스 제공', 'Serving', 'Serving'],
  ['ArchiMateAccess', '접근', 'Access', 'Access'],
  ['ArchiMateInfluence', '영향', 'Influence', 'Influence'],
  ['ArchiMateTriggering', '촉발', 'Triggering', 'Triggering'],
  ['ArchiMateFlow', '흐름', 'Flow', 'Flow'],
  ['ArchiMateSpecialization', '특수화', 'Specialization', 'Specialization'],
  ['ArchiMateAssociation', '연관', 'Association', 'Association'],
];

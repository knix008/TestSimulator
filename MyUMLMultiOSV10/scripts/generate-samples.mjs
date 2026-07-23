/**
 * Generates one .umlprj sample project per supported diagram kind.
 * Run: node --experimental-strip-types scripts/generate-samples.mjs
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { createInterfacePairBetweenComponents, updateInterfacePairRoute } from '../src/uml/componentInterface.ts';

mkdirSync('samples', { recursive: true });

// Remove previous generated samples so numbering stays clean.
for (const file of readdirSync('samples')) {
  if (file.endsWith('.umlprj')) {
    unlinkSync(`samples/${file}`);
  }
}

function project(name, documents, activeDocumentId) {
  return {
    format: 'my-uml-multi-os-project',
    version: 1,
    projectName: name,
    documents,
    activeDocumentId
  };
}

function write(fileName, data) {
  writeFileSync(`samples/${fileName}`, `${JSON.stringify(data, null, 2)}\n`.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote', fileName);
}

function edge(id, kind, sourceId, targetId, extras = {}) {
  return {
    id,
    kind,
    name: extras.name ?? '',
    umlType: extras.umlType ?? `uml:${kind[0].toUpperCase()}${kind.slice(1)}`,
    sourceId,
    targetId,
    directed: extras.directed ?? true,
    route: extras.route ?? 'straight',
    sourceAnchor: extras.sourceAnchor,
    targetAnchor: extras.targetAnchor,
    sourceMultiplicity: extras.sourceMultiplicity,
    targetMultiplicity: extras.targetMultiplicity,
    sequenceY: extras.sequenceY,
    sequenceNumber: extras.sequenceNumber,
    offset: extras.offset
  };
}

function node(id, kind, name, umlType, x, y, width, height, ownedElements = [], extras = {}) {
  return { id, kind, name, umlType, ownedElements, x, y, width, height, ...extras };
}

// ---------------------------------------------------------------------------
// 01 Class
// ---------------------------------------------------------------------------
const classDoc = {
  id: 'diagram-class',
  kind: 'class',
  name: 'Class Diagram',
  nodes: [
    // Background frame (painted under edges so lines stay visible)
    node('pkg-domain', 'package', 'orders', 'uml:Package', 40, 40, 780, 500),
    // Top row — horizontal associations stay clear
    node('class-customer', 'class', 'Customer', 'uml:Class', 70, 100, 170, 130, [
      { id: 'a1', kind: 'attribute', name: '-id: String', umlType: 'uml:Property' },
      { id: 'a2', kind: 'attribute', name: '-email: String', umlType: 'uml:Property' },
      { id: 'o1', kind: 'operation', name: '+placeOrder(): Order', umlType: 'uml:Operation' }
    ]),
    node('class-order', 'class', 'Order', 'uml:Class', 310, 100, 170, 130, [
      { id: 'a3', kind: 'attribute', name: '-id: String', umlType: 'uml:Property' },
      { id: 'a4', kind: 'attribute', name: '-total: Money', umlType: 'uml:Property' },
      { id: 'o2', kind: 'operation', name: '+confirm(): void', umlType: 'uml:Operation' }
    ]),
    node('class-item', 'class', 'OrderItem', 'uml:Class', 560, 100, 170, 120, [
      { id: 'a5', kind: 'attribute', name: '-quantity: Integer', umlType: 'uml:Property' },
      { id: 'a8', kind: 'attribute', name: '-unitPrice: Money', umlType: 'uml:Property' }
    ]),
    // Middle — subclass directly under Order; status under OrderItem
    node('class-online-order', 'class', 'OnlineOrder', 'uml:Class', 310, 280, 170, 70),
    node('enum-status', 'enumeration', 'OrderStatus', 'uml:Enumeration', 560, 270, 160, 120, [
      { id: 'l1', kind: 'literal', name: 'New', umlType: 'uml:EnumerationLiteral' },
      { id: 'l2', kind: 'literal', name: 'Paid', umlType: 'uml:EnumerationLiteral' },
      { id: 'l3', kind: 'literal', name: 'Shipped', umlType: 'uml:EnumerationLiteral' }
    ]),
    // Bottom — payment column on the left so Order↔Payment does not cross OnlineOrder
    node('iface-payable', 'interface', 'Payable', 'uml:Interface', 70, 280, 170, 90, [
      { id: 'o3', kind: 'operation', name: '+pay(amount: Money): Boolean', umlType: 'uml:Operation' }
    ]),
    node('class-payment', 'class', 'Payment', 'uml:Class', 70, 400, 170, 110, [
      { id: 'a6', kind: 'attribute', name: '-amount: Money', umlType: 'uml:Property' },
      { id: 'o4', kind: 'operation', name: '+capture(): Boolean', umlType: 'uml:Operation' }
    ]),
    node('dt-money', 'dataType', 'Money', 'uml:DataType', 310, 420, 170, 80, [
      { id: 'a7', kind: 'attribute', name: 'amount: Decimal', umlType: 'uml:Property' }
    ])
  ],
  edges: [
    edge('e1', 'association', 'class-customer', 'class-order', {
      name: 'places', umlType: 'uml:Association', directed: false, route: 'straight',
      sourceAnchor: 'right', targetAnchor: 'left', sourceMultiplicity: '1', targetMultiplicity: '0..*'
    }),
    edge('e2', 'association', 'class-order', 'class-item', {
      name: 'contains', umlType: 'uml:Association', directed: false, route: 'straight',
      sourceAnchor: 'right', targetAnchor: 'left', sourceMultiplicity: '1', targetMultiplicity: '1..*'
    }),
    edge('e3', 'generalization', 'class-online-order', 'class-order', {
      umlType: 'uml:Generalization', route: 'straight',
      sourceAnchor: 'top', targetAnchor: 'bottom'
    }),
    edge('e4', 'association', 'class-order', 'class-payment', {
      name: 'paidBy', umlType: 'uml:Association', directed: false, route: 'orthogonal',
      sourceAnchor: 'left', targetAnchor: 'top', sourceMultiplicity: '1', targetMultiplicity: '0..1'
    }),
    edge('e5', 'realization', 'class-payment', 'iface-payable', {
      umlType: 'uml:InterfaceRealization', route: 'straight',
      sourceAnchor: 'top', targetAnchor: 'bottom'
    }),
    edge('e6', 'dependency', 'class-item', 'enum-status', {
      umlType: 'uml:Dependency', route: 'straight',
      sourceAnchor: 'bottom', targetAnchor: 'top'
    }),
    edge('e7', 'dependency', 'class-payment', 'dt-money', {
      umlType: 'uml:Dependency', route: 'straight',
      sourceAnchor: 'right', targetAnchor: 'left'
    })
  ]
};

write('01-class.umlprj', project('Sample — Class Diagram', [classDoc], classDoc.id));

// ---------------------------------------------------------------------------
// 02 Profile
// ---------------------------------------------------------------------------
const profileDoc = {
  id: 'diagram-profile',
  kind: 'profile',
  name: 'Profile Diagram',
  nodes: [
    node('profile-biz', 'profile', 'BusinessProfile', 'uml:Profile', 48, 48, 200, 100),
    node('stereo-entity', 'stereotype', 'Entity', 'uml:Stereotype', 320, 48, 160, 90),
    node('stereo-service', 'stereotype', 'Service', 'uml:Stereotype', 320, 180, 160, 90),
    node('meta-class', 'class', 'Class', 'uml:Class', 560, 48, 148, 100),
    node('meta-component', 'class', 'Component', 'uml:Class', 560, 180, 148, 100)
  ],
  edges: [
    edge('p1', 'extension', 'stereo-entity', 'meta-class', {
      umlType: 'uml:Extension', sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('p2', 'extension', 'stereo-service', 'meta-component', {
      umlType: 'uml:Extension', sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('p3', 'generalization', 'stereo-service', 'stereo-entity', {
      umlType: 'uml:Generalization', route: 'orthogonal', sourceAnchor: 'top', targetAnchor: 'bottom'
    })
  ]
};
write('02-profile.umlprj', project('Sample — Profile Diagram', [profileDoc], profileDoc.id));

// ---------------------------------------------------------------------------
// 03 Package
// ---------------------------------------------------------------------------
const packageDoc = {
  id: 'diagram-package',
  kind: 'package',
  name: 'Package Diagram',
  nodes: [
    node('pkg-app', 'package', 'application', 'uml:Package', 55, 42, 245, 166),
    node('pkg-domain', 'package', 'domain', 'uml:Package', 490, 20, 292, 207),
    node('pkg-infra', 'package', 'infrastructure', 'uml:Package', 260, 424, 200, 120),
    node('class-facade', 'class', 'AppFacade', 'uml:Class', 98, 84, 148, 100),
    node('iface-repo', 'interface', 'OrderRepository', 'uml:Interface', 563, 79, 160, 100)
  ],
  edges: [
    edge('k1', 'dependency', 'pkg-app', 'pkg-domain', {
      name: 'Dependency1', umlType: 'uml:Dependency', sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('k2', 'dependency', 'pkg-infra', 'pkg-domain', {
      name: 'Dependency2', umlType: 'uml:Dependency', route: 'orthogonal', sourceAnchor: 'top', targetAnchor: 'bottom'
    }),
    edge('k3', 'packageImport', 'pkg-app', 'pkg-infra', {
      name: 'PackageImport3', umlType: 'uml:PackageImport', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'left'
    })
  ]
};
write('03-package.umlprj', project('Sample — Package Diagram', [packageDoc], packageDoc.id));

// ---------------------------------------------------------------------------
// 04 Object
// ---------------------------------------------------------------------------
const objectDoc = {
  id: 'diagram-object',
  kind: 'object',
  name: 'Object Diagram',
  nodes: [
    node('cls-order', 'class', 'Order', 'uml:Class', 48, 40, 140, 80),
    node('obj-o1', 'instanceSpecification', 'o1:Order', 'uml:InstanceSpecification', 80, 180, 160, 100, [
      { id: 's1', kind: 'slot', name: 'id = "A-100"', umlType: 'uml:Slot' },
      { id: 's2', kind: 'slot', name: 'total = 42.00', umlType: 'uml:Slot' }
    ]),
    node('obj-c1', 'instanceSpecification', 'c1:Customer', 'uml:InstanceSpecification', 320, 180, 180, 100, [
      { id: 's3', kind: 'slot', name: 'email = "a@b.com"', umlType: 'uml:Slot' }
    ]),
    node('obj-i1', 'instanceSpecification', 'i1:OrderItem', 'uml:InstanceSpecification', 560, 180, 160, 100, [
      { id: 's4', kind: 'slot', name: 'quantity = 2', umlType: 'uml:Slot' }
    ])
  ],
  edges: [
    edge('l1', 'link', 'obj-c1', 'obj-o1', {
      name: 'places', umlType: 'uml:InstanceSpecification', directed: false,
      sourceAnchor: 'left', targetAnchor: 'right'
    }),
    edge('l2', 'link', 'obj-o1', 'obj-i1', {
      name: 'contains', umlType: 'uml:InstanceSpecification', directed: false,
      sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('l3', 'dependency', 'obj-o1', 'cls-order', {
      umlType: 'uml:Dependency', route: 'orthogonal', sourceAnchor: 'top', targetAnchor: 'bottom'
    })
  ]
};
write('04-object.umlprj', project('Sample — Object Diagram', [objectDoc], objectDoc.id));

// ---------------------------------------------------------------------------
// 05 Composite Structure
// ---------------------------------------------------------------------------
const compositeDoc = {
  id: 'diagram-composite',
  kind: 'compositeStructure',
  name: 'Composite Structure',
  nodes: [
    node('sc-car', 'class', 'Car', 'uml:Class', 80, 60, 420, 260, [
      { id: 'part-engine', kind: 'part', name: 'engine:Engine', umlType: 'uml:Property' },
      { id: 'part-wheel', kind: 'part', name: 'wheels:Wheel[4]', umlType: 'uml:Property' }
    ]),
    node('pt-engine', 'interface', 'Engine', 'uml:Interface', 560, 80, 160, 100, [
      { id: 'op-start', kind: 'operation', name: '+start(): void', umlType: 'uml:Operation' }
    ]),
    node('pt-wheel', 'interface', 'Wheel', 'uml:Interface', 560, 220, 160, 100, [
      { id: 'op-spin', kind: 'operation', name: '+spin(): void', umlType: 'uml:Operation' }
    ])
  ],
  edges: [
    edge('c1', 'connector', 'sc-car', 'pt-engine', {
      name: 'enginePort', umlType: 'uml:Connector', directed: false,
      sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('c2', 'connector', 'sc-car', 'pt-wheel', {
      name: 'wheelPort', umlType: 'uml:Connector', directed: false, route: 'orthogonal',
      sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('c3', 'dependency', 'pt-wheel', 'pt-engine', {
      umlType: 'uml:Dependency', route: 'orthogonal', sourceAnchor: 'top', targetAnchor: 'bottom'
    })
  ]
};
write('05-composite-structure.umlprj', project('Sample — Composite Structure', [compositeDoc], compositeDoc.id));

// ---------------------------------------------------------------------------
// 06 Component (ports + 연결)
// ---------------------------------------------------------------------------
const componentNode = (id, x, y, name) => node(id, 'component', name, 'uml:Component', x, y, 180, 110);
const portNode = (id, parentComponentId, x, y, name) =>
  node(id, 'port', name, 'uml:Port', x, y, 26, 26, [], { parentComponentId });

let componentDoc = {
  id: 'diagram-component',
  kind: 'component',
  name: 'Component Diagram',
  nodes: [
    componentNode('order-service', 48, 72, 'OrderService'),
    componentNode('payment-gateway', 440, 72, 'PaymentGateway'),
    componentNode('inventory', 48, 280, 'Inventory'),
    componentNode('shipping', 440, 280, 'Shipping'),
    portNode('port-order', 'order-service', 215, 114, 'orders'),
    portNode('port-pay', 'payment-gateway', 427, 114, 'pay'),
    portNode('port-inv', 'inventory', 215, 322, 'stock'),
    portNode('port-ship', 'shipping', 427, 322, 'ship'),
    node('art-war', 'artifact', 'shop.war', 'uml:Artifact', 260, 420, 160, 80)
  ],
  edges: []
};

componentDoc = createInterfacePairBetweenComponents(componentDoc, 'port-order', 'port-pay');
componentDoc = createInterfacePairBetweenComponents(componentDoc, 'order-service', 'inventory');
componentDoc = createInterfacePairBetweenComponents(componentDoc, 'port-inv', 'port-ship');

const rename = {
  ProvidedInterface1: 'PaymentAPI',
  RequiredInterface1: 'PaymentClient',
  ProvidedInterface2: 'StockAPI',
  RequiredInterface2: 'StockClient',
  ProvidedInterface3: 'ShipAPI',
  RequiredInterface3: 'ShipClient'
};
componentDoc = {
  ...componentDoc,
  nodes: componentDoc.nodes.map((n) => (rename[n.name] ? { ...n, name: rename[n.name] } : n)),
  edges: [
    edge('dep1', 'dependency', 'order-service', 'shipping', {
      name: 'uses', umlType: 'uml:Dependency', route: 'orthogonal',
      sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('dep2', 'dependency', 'order-service', 'art-war', {
      umlType: 'uml:Dependency', route: 'orthogonal',
      sourceAnchor: 'bottom', targetAnchor: 'top'
    })
  ]
};

const paymentPair = componentDoc.nodes.find((n) => n.name === 'PaymentAPI');
if (paymentPair) {
  componentDoc = updateInterfacePairRoute(componentDoc, paymentPair.id, 'orthogonal');
}

const idMap = new Map();
let pi = 1;
let ri = 1;
for (const n of componentDoc.nodes) {
  if (n.kind === 'providedInterface' && n.id.startsWith('providedInterface-')) {
    idMap.set(n.id, `provided-${pi++}`);
  }
  if (n.kind === 'requiredInterface' && n.id.startsWith('requiredInterface-')) {
    idMap.set(n.id, `required-${ri++}`);
  }
}
componentDoc = {
  ...componentDoc,
  nodes: componentDoc.nodes.map((n) => ({
    ...n,
    id: idMap.get(n.id) ?? n.id,
    interfacePartnerId: n.interfacePartnerId ? (idMap.get(n.interfacePartnerId) ?? n.interfacePartnerId) : undefined
  }))
};

write('06-component.umlprj', project('Sample — Component Diagram', [componentDoc], componentDoc.id));

// ---------------------------------------------------------------------------
// 07 Deployment
// ---------------------------------------------------------------------------
const deploymentDoc = {
  id: 'diagram-deployment',
  kind: 'deployment',
  name: 'Deployment Diagram',
  nodes: [
    node('dev-server', 'device', 'AppServer', 'uml:Device', 60, 60, 220, 160),
    node('node-db', 'node', 'DBHost', 'uml:Node', 360, 60, 200, 140),
    node('ee-jvm', 'executionEnvironment', 'JVM', 'uml:ExecutionEnvironment', 80, 260, 200, 120),
    node('art-app', 'artifact', 'shop.ear', 'uml:Artifact', 360, 260, 160, 90),
    node('art-schema', 'artifact', 'schema.sql', 'uml:Artifact', 560, 80, 150, 80)
  ],
  edges: [
    edge('d1', 'deployment', 'art-app', 'ee-jvm', {
      umlType: 'uml:Deployment', sourceAnchor: 'left', targetAnchor: 'right'
    }),
    edge('d2', 'deployment', 'art-schema', 'node-db', {
      umlType: 'uml:Deployment', sourceAnchor: 'left', targetAnchor: 'right'
    }),
    edge('d3', 'dependency', 'ee-jvm', 'dev-server', {
      umlType: 'uml:Dependency', route: 'orthogonal', sourceAnchor: 'top', targetAnchor: 'bottom'
    }),
    edge('d4', 'dependency', 'ee-jvm', 'node-db', {
      umlType: 'uml:Dependency', route: 'orthogonal', sourceAnchor: 'right', targetAnchor: 'bottom'
    })
  ]
};
write('07-deployment.umlprj', project('Sample — Deployment Diagram', [deploymentDoc], deploymentDoc.id));

// ---------------------------------------------------------------------------
// 08 Use Case
// ---------------------------------------------------------------------------
const useCaseDoc = {
  id: 'diagram-usecase',
  kind: 'useCase',
  name: 'Use Case Diagram',
  nodes: [
    node('actor-customer', 'actor', 'Customer', 'uml:Actor', 40, 120, 88, 132),
    node('subject-shop', 'subject', 'Online Shop', 'uml:Class', 200, 40, 420, 320),
    node('uc-browse', 'useCase', 'Browse Catalog', 'uml:UseCase', 260, 80, 140, 60),
    node('uc-checkout', 'useCase', 'Checkout', 'uml:UseCase', 260, 180, 140, 60),
    node('uc-pay', 'useCase', 'Pay Order', 'uml:UseCase', 420, 180, 140, 60),
    node('uc-notify', 'useCase', 'Send Receipt', 'uml:UseCase', 340, 270, 150, 60),
    node('actor-payment', 'actor', 'Payment System', 'uml:Actor', 680, 160, 88, 132)
  ],
  edges: [
    edge('u1', 'association', 'actor-customer', 'uc-browse', {
      umlType: 'uml:Association', directed: false, sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('u2', 'association', 'actor-customer', 'uc-checkout', {
      umlType: 'uml:Association', directed: false, sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('u3', 'include', 'uc-checkout', 'uc-pay', {
      name: 'include', umlType: 'uml:Include', sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('u4', 'extend', 'uc-notify', 'uc-checkout', {
      name: 'extend', umlType: 'uml:Extend', route: 'orthogonal',
      sourceAnchor: 'top', targetAnchor: 'bottom'
    }),
    edge('u5', 'association', 'uc-pay', 'actor-payment', {
      umlType: 'uml:Association', directed: false, sourceAnchor: 'right', targetAnchor: 'left'
    })
  ]
};
write('08-use-case.umlprj', project('Sample — Use Case Diagram', [useCaseDoc], useCaseDoc.id));

// ---------------------------------------------------------------------------
// 09 Sequence
// ---------------------------------------------------------------------------
const sequenceDoc = {
  id: 'diagram-sequence',
  kind: 'sequence',
  name: 'Sequence Diagram',
  nodes: [
    node('life-customer', 'lifeline', 'customer', 'uml:Lifeline', 80, 40, 120, 420),
    node('life-order', 'lifeline', 'orderService', 'uml:Lifeline', 280, 40, 120, 420),
    node('life-payment', 'lifeline', 'paymentGateway', 'uml:Lifeline', 480, 40, 140, 420),
    node('frag-alt', 'combinedFragment', 'alt', 'uml:CombinedFragment', 209, 221, 476, 158, [], {
      operandSeparatorY: 75
    })
  ],
  edges: [
    edge('m1', 'message', 'life-customer', 'life-order', {
      name: 'checkout()', umlType: 'uml:Message', sequenceY: 110
    }),
    edge('m2', 'message', 'life-order', 'life-order', {
      name: 'reserveStock()', umlType: 'uml:Message', sequenceY: 160
    }),
    edge('m3', 'asyncMessage', 'life-order', 'life-payment', {
      name: 'authorize()', umlType: 'uml:Message', sequenceY: 244
    }),
    edge('m4', 'replyMessage', 'life-payment', 'life-order', {
      name: 'authorized', umlType: 'uml:Message', sequenceY: 312
    }),
    edge('m5', 'replyMessage', 'life-order', 'life-customer', {
      name: 'confirmed', umlType: 'uml:Message', sequenceY: 360
    })
  ]
};
write('09-sequence.umlprj', project('Sample — Sequence Diagram', [sequenceDoc], sequenceDoc.id));

// ---------------------------------------------------------------------------
// 10 Communication
// ---------------------------------------------------------------------------
const communicationDoc = {
  id: 'diagram-communication',
  kind: 'communication',
  name: 'Communication Diagram',
  nodes: [
    node('actor-user', 'actor', 'Customer', 'uml:Actor', 40, 120, 88, 132),
    node('part-order', 'lifeline', 'orderService', 'uml:Lifeline', 220, 140, 140, 44),
    node('part-pay', 'lifeline', 'paymentGateway', 'uml:Lifeline', 440, 140, 150, 44),
    node('part-inv', 'lifeline', 'inventory', 'uml:Lifeline', 320, 300, 140, 44)
  ],
  edges: [
    edge('cl1', 'link', 'actor-user', 'part-order', {
      umlType: 'uml:InstanceSpecification', directed: false,
      sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('cl2', 'link', 'part-order', 'part-pay', {
      umlType: 'uml:InstanceSpecification', directed: false,
      sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('cl3', 'link', 'part-order', 'part-inv', {
      umlType: 'uml:InstanceSpecification', directed: false, route: 'orthogonal',
      sourceAnchor: 'bottom', targetAnchor: 'top'
    }),
    edge('cm1', 'message', 'actor-user', 'part-order', {
      name: 'checkout', umlType: 'uml:Message', sequenceNumber: '1', offset: -12
    }),
    edge('cm2', 'message', 'part-order', 'part-inv', {
      name: 'reserve', umlType: 'uml:Message', sequenceNumber: '1.1', offset: 10
    }),
    edge('cm3', 'asyncMessage', 'part-order', 'part-pay', {
      name: 'authorize', umlType: 'uml:Message', sequenceNumber: '1.2', offset: -8
    }),
    edge('cm4', 'replyMessage', 'part-pay', 'part-order', {
      name: 'ok', umlType: 'uml:Message', sequenceNumber: '1.3', offset: 14
    })
  ]
};
write('10-communication.umlprj', project('Sample — Communication Diagram', [communicationDoc], communicationDoc.id));

// ---------------------------------------------------------------------------
// 11 Activity
// ---------------------------------------------------------------------------
const activityDoc = {
  id: 'diagram-activity',
  kind: 'activity',
  name: 'Activity Diagram',
  nodes: [
    node('act-init', 'initialNode', 'Initial', 'uml:InitialNode', 365, 36, 54, 54),
    node('act-capture', 'action', 'Capture Order', 'uml:OpaqueAction', 317, 122, 150, 62),
    node('act-order', 'objectNode', 'Order Request', 'uml:CentralBufferNode', 88, 126, 150, 54),
    node('act-check', 'action', 'Check Availability', 'uml:OpaqueAction', 317, 222, 150, 62),
    node('act-decision', 'decisionNode', 'Stock Available?', 'uml:DecisionNode', 351, 326, 82, 82),
    node('act-notify', 'action', 'Notify Customer', 'uml:OpaqueAction', 92, 431, 156, 62),
    node('act-flow-final', 'flowFinalNode', 'FlowFinal', 'uml:FlowFinalNode', 143, 540, 54, 54),
    node('act-reserve', 'action', 'Reserve Items', 'uml:OpaqueAction', 317, 456, 150, 62),
    node('act-fork', 'forkNode', 'Fork', 'uml:ForkNode', 344, 566, 96, 16),
    node('act-pick', 'action', 'Pick Items', 'uml:OpaqueAction', 198, 636, 150, 62),
    node('act-charge', 'action', 'Charge Payment', 'uml:OpaqueAction', 438, 636, 150, 62),
    node('act-join', 'joinNode', 'Join', 'uml:JoinNode', 344, 756, 96, 16),
    node('act-pack', 'action', 'Pack Shipment', 'uml:OpaqueAction', 317, 826, 150, 62),
    node('act-merge', 'mergeNode', 'Merge', 'uml:MergeNode', 351, 928, 82, 82),
    node('act-dispatch', 'action', 'Dispatch Order', 'uml:OpaqueAction', 317, 1042, 150, 62),
    node('act-final', 'finalNode', 'Final', 'uml:ActivityFinalNode', 365, 1148, 54, 54)
  ],
  edges: [
    edge('af1', 'controlFlow', 'act-init', 'act-capture', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af2', 'objectFlow', 'act-order', 'act-capture', { umlType: 'uml:ObjectFlow', route: 'orthogonal', sourceAnchor: 'right', targetAnchor: 'left' }),
    edge('af3', 'controlFlow', 'act-capture', 'act-check', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af4', 'controlFlow', 'act-check', 'act-decision', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af5', 'controlFlow', 'act-decision', 'act-notify', { name: '[not available]', umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'left', targetAnchor: 'top', labelOffset: { x: -22, y: -10 } }),
    edge('af6', 'controlFlow', 'act-notify', 'act-flow-final', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af7', 'controlFlow', 'act-decision', 'act-reserve', { name: '[available]', umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top', labelOffset: { x: 44, y: 0 } }),
    edge('af8', 'controlFlow', 'act-reserve', 'act-fork', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af9', 'controlFlow', 'act-fork', 'act-pick', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'left', targetAnchor: 'top' }),
    edge('af10', 'controlFlow', 'act-fork', 'act-charge', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'right', targetAnchor: 'top' }),
    edge('af11', 'controlFlow', 'act-pick', 'act-join', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'left' }),
    edge('af12', 'controlFlow', 'act-charge', 'act-join', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'right' }),
    edge('af13', 'controlFlow', 'act-join', 'act-pack', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af14', 'controlFlow', 'act-pack', 'act-merge', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af15', 'controlFlow', 'act-merge', 'act-dispatch', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('af16', 'controlFlow', 'act-dispatch', 'act-final', { umlType: 'uml:ControlFlow', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' })
  ]
};
write('11-activity.umlprj', project('Sample — Activity Diagram', [activityDoc], activityDoc.id));

// ---------------------------------------------------------------------------
// 12 State Machine
// ---------------------------------------------------------------------------
const stateDoc = {
  id: 'diagram-state',
  kind: 'stateMachine',
  name: 'State Machine',
  nodes: [
    node('st-init', 'pseudostate', 'Initial', 'uml:Pseudostate', 60, 120, 54, 54),
    node('st-new', 'state', 'New', 'uml:State', 180, 100, 140, 90, [
      { id: 'en1', kind: 'entry', name: 'entry / assignId', umlType: 'uml:Behavior' }
    ]),
    node('st-paid', 'state', 'Paid', 'uml:State', 380, 100, 140, 90, [
      { id: 'en2', kind: 'entry', name: 'entry / capture', umlType: 'uml:Behavior' }
    ]),
    node('st-shipped', 'state', 'Shipped', 'uml:State', 580, 100, 140, 90),
    node('st-cancelled', 'state', 'Cancelled', 'uml:State', 380, 260, 140, 90, [
      { id: 'ex1', kind: 'exit', name: 'exit / notify', umlType: 'uml:Behavior' }
    ]),
    node('st-final', 'finalState', 'Final', 'uml:FinalState', 760, 110, 54, 54)
  ],
  edges: [
    edge('t1', 'transition', 'st-init', 'st-new', { name: '', umlType: 'uml:Transition', sourceAnchor: 'right', targetAnchor: 'left' }),
    edge('t2', 'transition', 'st-new', 'st-paid', { name: 'pay', umlType: 'uml:Transition', sourceAnchor: 'right', targetAnchor: 'left' }),
    edge('t3', 'transition', 'st-paid', 'st-shipped', { name: 'ship', umlType: 'uml:Transition', sourceAnchor: 'right', targetAnchor: 'left' }),
    edge('t4', 'transition', 'st-shipped', 'st-final', { name: 'close', umlType: 'uml:Transition', sourceAnchor: 'right', targetAnchor: 'left' }),
    edge('t5', 'transition', 'st-new', 'st-cancelled', { name: 'cancel', umlType: 'uml:Transition', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('t6', 'transition', 'st-paid', 'st-cancelled', { name: 'refund', umlType: 'uml:Transition', route: 'orthogonal', sourceAnchor: 'bottom', targetAnchor: 'top' }),
    edge('t7', 'transition', 'st-cancelled', 'st-final', { name: '', umlType: 'uml:Transition', route: 'orthogonal', sourceAnchor: 'right', targetAnchor: 'bottom' })
  ]
};
write('12-state-machine.umlprj', project('Sample — State Machine', [stateDoc], stateDoc.id));

// ---------------------------------------------------------------------------
// 13 Timing
// ---------------------------------------------------------------------------
const timingDoc = {
  id: 'diagram-timing',
  kind: 'timing',
  name: 'Timing Diagram',
  nodes: [
    node('tl-order', 'lifeline', 'order', 'uml:Lifeline', 60, 60, 520, 80),
    node('tl-payment', 'lifeline', 'payment', 'uml:Lifeline', 60, 180, 520, 80),
    node('inv-new', 'stateInvariant', 'New', 'uml:StateInvariant', 120, 70, 100, 48),
    node('inv-paid', 'stateInvariant', 'Paid', 'uml:StateInvariant', 280, 70, 100, 48),
    node('inv-shipped', 'stateInvariant', 'Shipped', 'uml:StateInvariant', 440, 70, 110, 48),
    node('inv-auth', 'stateInvariant', 'Authorizing', 'uml:StateInvariant', 200, 190, 120, 48),
    node('inv-ok', 'stateInvariant', 'Authorized', 'uml:StateInvariant', 380, 190, 120, 48),
    node('obs-t1', 'timeObservation', 't1', 'uml:TimeObservation', 260, 300, 80, 40),
    node('obs-t2', 'timeObservation', 't2', 'uml:TimeObservation', 420, 300, 80, 40)
  ],
  edges: [
    edge('tm1', 'message', 'tl-order', 'tl-payment', {
      name: 'authorize', umlType: 'uml:Message', sourceAnchor: 'bottom', targetAnchor: 'top'
    }),
    edge('tm2', 'message', 'tl-payment', 'tl-order', {
      name: 'ok', umlType: 'uml:Message', route: 'orthogonal',
      sourceAnchor: 'top', targetAnchor: 'bottom'
    }),
    edge('tm3', 'durationConstraint', 'obs-t1', 'obs-t2', {
      name: '{d < 2s}', umlType: 'uml:DurationConstraint', directed: false,
      sourceAnchor: 'right', targetAnchor: 'left'
    })
  ]
};
write('13-timing.umlprj', project('Sample — Timing Diagram', [timingDoc], timingDoc.id));

// ---------------------------------------------------------------------------
// 14 All Diagrams
// ---------------------------------------------------------------------------
const allDiagramsTimingDoc = {
  id: 'diagram-timing',
  kind: 'timing',
  name: 'Timing Diagram',
  nodes: [
    node('all-tl-user', 'lifeline', 'user', 'uml:Lifeline', 80, 44, 124, 360),
    node('all-tl-order', 'lifeline', 'order', 'uml:Lifeline', 310, 44, 124, 360),
    node('all-tl-payment', 'lifeline', 'payment', 'uml:Lifeline', 540, 44, 124, 360),
    node('all-inv-user-idle', 'stateInvariant', 'Idle', 'uml:StateInvariant', 76, 105, 132, 48),
    node('all-inv-user-waiting', 'stateInvariant', 'Waiting', 'uml:StateInvariant', 76, 255, 132, 48),
    node('all-inv-order-new', 'stateInvariant', 'New', 'uml:StateInvariant', 306, 120, 132, 48),
    node('all-inv-order-paid', 'stateInvariant', 'Paid', 'uml:StateInvariant', 306, 270, 132, 48),
    node('all-inv-payment-ready', 'stateInvariant', 'Ready', 'uml:StateInvariant', 536, 145, 132, 48),
    node('all-inv-payment-authorized', 'stateInvariant', 'Authorized', 'uml:StateInvariant', 536, 285, 132, 48),
    node('all-obs-request', 'timeObservation', 'tRequest', 'uml:TimeObservation', 205, 170, 92, 40),
    node('all-obs-authorized', 'timeObservation', 'tAuthorized', 'uml:TimeObservation', 445, 330, 104, 40)
  ],
  edges: [
    edge('all-tm1', 'message', 'all-inv-user-idle', 'all-inv-order-new', {
      name: 'checkout', umlType: 'uml:Message', sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('all-tm2', 'message', 'all-inv-order-new', 'all-inv-payment-ready', {
      name: 'authorize', umlType: 'uml:Message', sourceAnchor: 'right', targetAnchor: 'left'
    }),
    edge('all-tm3', 'message', 'all-inv-payment-authorized', 'all-inv-order-paid', {
      name: 'approved', umlType: 'uml:Message', sourceAnchor: 'left', targetAnchor: 'right'
    }),
    edge('all-tm4', 'message', 'all-inv-order-paid', 'all-inv-user-waiting', {
      name: 'confirmed', umlType: 'uml:Message', sourceAnchor: 'left', targetAnchor: 'right'
    }),
    edge('all-td1', 'durationConstraint', 'all-obs-request', 'all-obs-authorized', {
      name: '{authorization < 3s}', umlType: 'uml:DurationConstraint', directed: false,
      route: 'orthogonal', sourceAnchor: 'right', targetAnchor: 'left'
    })
  ]
};

const allDiagramDocs = [
  classDoc,
  profileDoc,
  packageDoc,
  objectDoc,
  compositeDoc,
  componentDoc,
  deploymentDoc,
  useCaseDoc,
  sequenceDoc,
  communicationDoc,
  activityDoc,
  stateDoc,
  allDiagramsTimingDoc
].map((doc) => structuredClone(doc));

write('14-all-diagrams.umlprj', project('Sample — All Diagram Types', allDiagramDocs, classDoc.id));

console.log('done —', 14, 'diagram samples');

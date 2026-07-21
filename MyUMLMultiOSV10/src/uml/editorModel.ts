import { getDiagramDefinition, type ConnectorTool, type DiagramKind, type PaletteTool, type RelationshipKind, type UmlElementKind } from './diagramRegistry.js';
import { isInteractionMessageKind } from './umlNotation.js';

export interface UmlNode {
  id: string;
  kind: UmlElementKind;
  name: string;
  umlType: string;
  ownedElements: UmlOwnedElement[];
  x: number;
  y: number;
  width: number;
  height: number;
  parentComponentId?: string;
  /** Component-diagram interface: port this interface is attached to, if any. */
  parentPortId?: string;
  /** Component-diagram interface: which face the stem is glued to. */
  attachmentSide?: EdgeAnchor;
  /** Component-diagram interface: stem centerline offset along that face from the component origin. */
  edgeOffset?: number;
}

export type UmlOwnedElementKind = 'attribute' | 'operation' | 'literal' | 'slot' | 'port' | 'part' | 'region' | 'entry' | 'exit';

export interface UmlOwnedElement {
  id: string;
  kind: UmlOwnedElementKind;
  name: string;
  umlType: string;
}

export interface UmlEdge {
  id: string;
  kind: RelationshipKind;
  name: string;
  umlType: string;
  sourceId: string;
  targetId: string;
  directed: boolean;
  route: EdgeRoute;
  sourceAnchor?: EdgeAnchor;
  targetAnchor?: EdgeAnchor;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  sequenceY?: number;
  /** Manual perpendicular offset for communication diagram links/messages. */
  offset?: number;
  /** Manual label offset from the computed edge label position. */
  labelOffset?: { x: number; y: number };
  /** Decimal sequence expression for communication diagram messages (e.g. "1", "1.1"). */
  sequenceNumber?: string;
}

export type EdgeRoute = 'straight' | 'orthogonal' | 'curve';
export type EdgeAnchor = 'left' | 'right' | 'top' | 'bottom';

export interface UmlDiagramDocument {
  id: string;
  kind: DiagramKind;
  name: string;
  nodes: UmlNode[];
  edges: UmlEdge[];
}

export function createDiagramDocument(kind: DiagramKind): UmlDiagramDocument {
  const definition = getDiagramDefinition(kind);

  return {
    id: createId('diagram'),
    kind,
    name: definition.label,
    nodes: [],
    edges: []
  };
}

export function addPaletteNode(document: UmlDiagramDocument, tool: PaletteTool, x: number, y: number): UmlDiagramDocument {
  const nodeCount = document.nodes.filter((node) => node.kind === tool.kind).length + 1;
  const nodeSize = tool.kind === 'lifeline' && document.kind === 'communication'
    ? { width: 124, height: 44 }
    : defaultNodeSize(tool.kind);
  const nextNode: UmlNode = {
    id: createId(tool.kind),
    kind: tool.kind,
    name: `${tool.defaultName}${nodeCount}`,
    umlType: tool.umlType,
    ownedElements: [],
    x,
    y,
    width: nodeSize.width,
    height: nodeSize.height
  };

  return {
    ...document,
    nodes: [...document.nodes, nextNode]
  };
}

export function renameNode(document: UmlDiagramDocument, nodeId: string, name: string): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, name } : node))
  };
}

export function moveNode(document: UmlDiagramDocument, nodeId: string, x: number, y: number): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
  };
}

export function addOwnedElement(document: UmlDiagramDocument, nodeId: string, kind: UmlOwnedElementKind): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      const existingElements = node.ownedElements ?? [];
      const elementCount = existingElements.filter((element) => element.kind === kind).length + 1;
      const nextElement: UmlOwnedElement = {
        id: createId(kind),
        kind,
        name: `${defaultOwnedElementName(kind)}${elementCount}`,
        umlType: defaultOwnedElementType(kind)
      };
      const nextOwnedElements = [...existingElements, nextElement];

      return {
        ...node,
        ownedElements: nextOwnedElements,
        height: heightForOwnedElements(node.kind, nextOwnedElements.length)
      };
    })
  };
}

export function renameOwnedElement(document: UmlDiagramDocument, nodeId: string, elementId: string, name: string): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            ownedElements: (node.ownedElements ?? []).map((element) => (element.id === elementId ? { ...element, name } : element))
          }
        : node
    )
  };
}

export function updateOwnedElementKind(document: UmlDiagramDocument, nodeId: string, elementId: string, kind: UmlOwnedElementKind): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            ownedElements: (node.ownedElements ?? []).map((element) =>
              element.id === elementId
                ? {
                    ...element,
                    kind,
                    umlType: defaultOwnedElementType(kind)
                  }
                : element
            )
          }
        : node
    )
  };
}

export function connectNodes(document: UmlDiagramDocument, tool: ConnectorTool, sourceId: string, targetId: string, options: { sequenceY?: number } = {}): UmlDiagramDocument {
  if (sourceId === targetId && !isInteractionMessageKind(tool.kind)) {
    return document;
  }

  const source = document.nodes.find((node) => node.id === sourceId);
  const target = document.nodes.find((node) => node.id === targetId);

  if (!source || !target) {
    return document;
  }

  let workingDocument = document;

  // UML communication: messages travel along links — ensure an undirected link exists.
  if (document.kind === 'communication' && isInteractionMessageKind(tool.kind) && sourceId !== targetId) {
    const hasLink = document.edges.some((edge) =>
      edge.kind === 'connector'
      && ((edge.sourceId === sourceId && edge.targetId === targetId) || (edge.sourceId === targetId && edge.targetId === sourceId))
    );

    if (!hasLink) {
      const linkCount = document.edges.filter((edge) => edge.kind === 'connector').length + 1;
      const linkEdge: UmlEdge = {
        id: createId('connector'),
        kind: 'connector',
        name: `Link${linkCount}`,
        umlType: 'uml:Connector',
        sourceId,
        targetId,
        directed: false,
        route: 'straight'
      };
      workingDocument = { ...document, edges: [...document.edges, linkEdge] };
    }
  }

  const edgeCount = workingDocument.edges.filter((edge) => edge.kind === tool.kind).length + 1;
  const skipMultiplicity = document.kind === 'communication' && tool.kind === 'connector';
  const nextEdge: UmlEdge = {
    id: createId(tool.kind),
    kind: tool.kind,
    name: `${tool.defaultName}${edgeCount}`,
    umlType: tool.umlType,
    sourceId,
    targetId,
    directed: tool.directed,
    route: 'straight',
    sourceMultiplicity: skipMultiplicity ? undefined : defaultMultiplicity(tool.kind),
    targetMultiplicity: skipMultiplicity ? undefined : defaultMultiplicity(tool.kind),
    sequenceY: options.sequenceY,
    sequenceNumber: document.kind === 'communication' && isInteractionMessageKind(tool.kind)
      ? allocateCommunicationSequenceNumber(workingDocument)
      : undefined
  };

  return {
    ...workingDocument,
    edges: [...workingDocument.edges, nextEdge]
  };
}

export function renameEdgeSequenceNumber(document: UmlDiagramDocument, edgeId: string, sequenceNumber: string): UmlDiagramDocument {
  return {
    ...document,
    edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, sequenceNumber } : edge))
  };
}

export function allocateCommunicationSequenceNumber(document: UmlDiagramDocument): string {
  let maxTopLevel = 0;

  for (const edge of document.edges) {
    if (!isInteractionMessageKind(edge.kind) || !edge.sequenceNumber) {
      continue;
    }

    const top = Number.parseInt(edge.sequenceNumber.split('.')[0] ?? '', 10);
    if (Number.isFinite(top)) {
      maxTopLevel = Math.max(maxTopLevel, top);
    }
  }

  return String(maxTopLevel + 1);
}

export function renameEdge(document: UmlDiagramDocument, edgeId: string, name: string): UmlDiagramDocument {
  return {
    ...document,
    edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, name } : edge))
  };
}

export function updateEdgeRoute(document: UmlDiagramDocument, edgeId: string, route: EdgeRoute): UmlDiagramDocument {
  return {
    ...document,
    edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, route } : edge))
  };
}

export function updateEdgeAnchor(document: UmlDiagramDocument, edgeId: string, endpoint: 'source' | 'target', anchor: EdgeAnchor | undefined): UmlDiagramDocument {
  return {
    ...document,
    edges: document.edges.map((edge) =>
      edge.id === edgeId
        ? {
            ...edge,
            sourceAnchor: endpoint === 'source' ? anchor : edge.sourceAnchor,
            targetAnchor: endpoint === 'target' ? anchor : edge.targetAnchor
          }
        : edge
    )
  };
}

export function updateEdgeMultiplicity(document: UmlDiagramDocument, edgeId: string, endpoint: 'source' | 'target', multiplicity: string): UmlDiagramDocument {
  return {
    ...document,
    edges: document.edges.map((edge) =>
      edge.id === edgeId
        ? {
            ...edge,
            sourceMultiplicity: endpoint === 'source' ? multiplicity : edge.sourceMultiplicity,
            targetMultiplicity: endpoint === 'target' ? multiplicity : edge.targetMultiplicity
          }
        : edge
    )
  };
}

export function updateEdgeRelationship(document: UmlDiagramDocument, edgeId: string, tool: ConnectorTool): UmlDiagramDocument {
  return {
    ...document,
    edges: document.edges.map((edge) => {
      if (edge.id !== edgeId) {
        return edge;
      }

      const becomingMessage = isInteractionMessageKind(tool.kind);
      const wasMessage = isInteractionMessageKind(edge.kind);
      const sequenceNumber = document.kind === 'communication' && becomingMessage
        ? (wasMessage ? edge.sequenceNumber : allocateCommunicationSequenceNumber(document))
        : becomingMessage
          ? edge.sequenceNumber
          : undefined;

      return {
        ...edge,
        kind: tool.kind,
        name: renameGeneratedRelationship(edge.name, tool.defaultName),
        umlType: tool.umlType,
        directed: tool.directed,
        sequenceNumber,
        sourceMultiplicity: document.kind === 'communication' && tool.kind === 'connector' ? undefined : edge.sourceMultiplicity ?? defaultMultiplicity(tool.kind),
        targetMultiplicity: document.kind === 'communication' && tool.kind === 'connector' ? undefined : edge.targetMultiplicity ?? defaultMultiplicity(tool.kind)
      };
    })
  };
}

function defaultNodeSize(kind: UmlElementKind): { width: number; height: number } {
  switch (kind) {
    case 'class':
    case 'interface':
    case 'dataType':
    case 'enumeration':
      return { width: 148, height: 176 };
    case 'actor':
      return { width: 88, height: 132 };
    case 'useCase':
      return { width: 136, height: 68 };
    case 'port':
      return { width: 26, height: 26 };
    case 'providedInterface':
    case 'requiredInterface':
      return { width: 56, height: 32 };
    case 'subject':
      return { width: 420, height: 280 };
    case 'lifeline':
      return { width: 124, height: 260 };
    case 'combinedFragment':
      return { width: 360, height: 220 };
    case 'message':
      return { width: 132, height: 34 };
    case 'initialNode':
    case 'finalNode':
    case 'flowFinalNode':
    case 'pseudostate':
      return { width: 54, height: 54 };
    case 'decisionNode':
    case 'mergeNode':
      return { width: 82, height: 82 };
    case 'forkNode':
    case 'joinNode':
      return { width: 96, height: 16 };
    case 'action':
      return { width: 142, height: 62 };
    case 'objectNode':
      return { width: 132, height: 54 };
    default:
      return { width: 148, height: 78 };
  }
}

function heightForOwnedElements(kind: UmlElementKind, ownedElementCount: number): number {
  const defaultHeight = defaultNodeSize(kind).height;
  const minimumCompartmentHeight = 176;

  if (ownedElementCount === 0) {
    return defaultHeight;
  }

  return Math.max(defaultHeight, minimumCompartmentHeight + ownedElementCount * 18);
}

function defaultOwnedElementName(kind: UmlOwnedElementKind): string {
  switch (kind) {
    case 'attribute':
      return 'attribute';
    case 'operation':
      return 'operation';
    case 'literal':
      return 'literal';
    case 'slot':
      return 'slot';
    case 'port':
      return 'port';
    case 'part':
      return 'part';
    case 'region':
      return 'region';
    case 'entry':
      return 'entry';
    case 'exit':
      return 'exit';
  }
}

function defaultOwnedElementType(kind: UmlOwnedElementKind): string {
  switch (kind) {
    case 'attribute':
      return 'uml:Property';
    case 'operation':
      return 'uml:Operation';
    case 'literal':
      return 'uml:EnumerationLiteral';
    case 'slot':
      return 'uml:Slot';
    case 'port':
      return 'uml:Port';
    case 'part':
      return 'uml:Property';
    case 'region':
      return 'uml:Region';
    case 'entry':
    case 'exit':
      return 'uml:Behavior';
  }
}

function defaultMultiplicity(kind: RelationshipKind): string | undefined {
  switch (kind) {
    case 'association':
    case 'connector':
    case 'deployment':
      return '1';
    default:
      return undefined;
  }
}

function renameGeneratedRelationship(currentName: string, nextDefaultName: string): string {
  const match = currentName.match(/^(Association|Generalization|Dependency|Realization|PackageImport|Include|Extend|Connector|AssemblyConnector|DelegationConnector|Deployment|Message|AsyncMessage|ReplyMessage|ControlFlow|ObjectFlow|Transition|Link|Extension|TimeMessage|DurationConstraint|message|asyncMessage|reply)(\d*)$/i);

  if (!match) {
    return currentName;
  }

  return `${nextDefaultName}${match[2] ?? ''}`;
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
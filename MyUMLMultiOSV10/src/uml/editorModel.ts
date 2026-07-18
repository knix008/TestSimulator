import { getDiagramDefinition, type ConnectorTool, type DiagramKind, type PaletteTool, type RelationshipKind, type UmlElementKind } from './diagramRegistry.js';

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
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export type EdgeRoute = 'straight' | 'orthogonal' | 'curve';

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
  const nextNode: UmlNode = {
    id: createId(tool.kind),
    kind: tool.kind,
    name: `${tool.defaultName}${nodeCount}`,
    umlType: tool.umlType,
    ownedElements: [],
    x,
    y,
    width: defaultNodeSize(tool.kind).width,
    height: defaultNodeSize(tool.kind).height
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

export function connectNodes(document: UmlDiagramDocument, tool: ConnectorTool, sourceId: string, targetId: string): UmlDiagramDocument {
  if (sourceId === targetId) {
    return document;
  }

  const source = document.nodes.find((node) => node.id === sourceId);
  const target = document.nodes.find((node) => node.id === targetId);

  if (!source || !target) {
    return document;
  }

  const edgeCount = document.edges.filter((edge) => edge.kind === tool.kind).length + 1;
  const nextEdge: UmlEdge = {
    id: createId(tool.kind),
    kind: tool.kind,
    name: `${tool.defaultName}${edgeCount}`,
    umlType: tool.umlType,
    sourceId,
    targetId,
    directed: tool.directed,
    route: 'straight',
    sourceMultiplicity: defaultMultiplicity(tool.kind),
    targetMultiplicity: defaultMultiplicity(tool.kind)
  };

  return {
    ...document,
    edges: [...document.edges, nextEdge]
  };
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
    edges: document.edges.map((edge) =>
      edge.id === edgeId
        ? {
            ...edge,
            kind: tool.kind,
            name: renameGeneratedRelationship(edge.name, tool.defaultName),
            umlType: tool.umlType,
            directed: tool.directed
          }
        : edge
    )
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
      return { width: 88, height: 112 };
    case 'useCase':
      return { width: 136, height: 68 };
    case 'lifeline':
      return { width: 124, height: 260 };
    case 'message':
      return { width: 132, height: 34 };
    case 'initialNode':
    case 'finalNode':
    case 'pseudostate':
      return { width: 54, height: 54 };
    case 'decisionNode':
      return { width: 82, height: 82 };
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
  const match = currentName.match(/^(Association|Generalization|Dependency|Realization|PackageImport|Include|Extend|Connector|Deployment|Message|ControlFlow|ObjectFlow|Transition|Link|Extension|TimeMessage|DurationConstraint)(\d*)$/);

  if (!match) {
    return currentName;
  }

  return `${nextDefaultName}${match[2] ?? ''}`;
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
import { getDiagramDefinition } from './diagramRegistry.js';
import { isInteractionMessageKind } from './umlNotation.js';
export function createDiagramDocument(kind) {
    const definition = getDiagramDefinition(kind);
    return {
        id: createId('diagram'),
        kind,
        name: definition.label,
        nodes: [],
        edges: []
    };
}
export function addPaletteNode(document, tool, x, y) {
    const nodeCount = document.nodes.filter((node) => node.kind === tool.kind).length + 1;
    const nodeSize = tool.kind === 'lifeline' && document.kind === 'communication'
        ? { width: 124, height: 44 }
        : defaultNodeSize(tool.kind);
    const nextNode = {
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
export function renameNode(document, nodeId, name) {
    return {
        ...document,
        nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, name } : node))
    };
}
export function moveNode(document, nodeId, x, y) {
    return {
        ...document,
        nodes: document.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node))
    };
}
export function addOwnedElement(document, nodeId, kind) {
    return {
        ...document,
        nodes: document.nodes.map((node) => {
            if (node.id !== nodeId) {
                return node;
            }
            const existingElements = node.ownedElements ?? [];
            const elementCount = existingElements.filter((element) => element.kind === kind).length + 1;
            const nextElement = {
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
export function renameOwnedElement(document, nodeId, elementId, name) {
    return {
        ...document,
        nodes: document.nodes.map((node) => node.id === nodeId
            ? {
                ...node,
                ownedElements: (node.ownedElements ?? []).map((element) => (element.id === elementId ? { ...element, name } : element))
            }
            : node)
    };
}
export function updateOwnedElementKind(document, nodeId, elementId, kind) {
    return {
        ...document,
        nodes: document.nodes.map((node) => node.id === nodeId
            ? {
                ...node,
                ownedElements: (node.ownedElements ?? []).map((element) => element.id === elementId
                    ? {
                        ...element,
                        kind,
                        umlType: defaultOwnedElementType(kind)
                    }
                    : element)
            }
            : node)
    };
}
export function connectNodes(document, tool, sourceId, targetId, options = {}) {
    if (tool.kind === 'interfacePair') {
        return document;
    }
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
        const hasLink = document.edges.some((edge) => isCommunicationLinkKind(edge.kind)
            && ((edge.sourceId === sourceId && edge.targetId === targetId) || (edge.sourceId === targetId && edge.targetId === sourceId)));
        if (!hasLink) {
            const linkCount = document.edges.filter((edge) => isCommunicationLinkKind(edge.kind)).length + 1;
            const linkEdge = {
                id: createId('link'),
                kind: 'link',
                name: `Link${linkCount}`,
                umlType: 'uml:InstanceSpecification',
                sourceId,
                targetId,
                directed: false,
                route: 'straight'
            };
            workingDocument = { ...document, edges: [...document.edges, linkEdge] };
        }
    }
    const edgeCount = workingDocument.edges.filter((edge) => edge.kind === tool.kind).length + 1;
    const nextEdge = {
        id: createId(tool.kind),
        kind: tool.kind,
        name: `${tool.defaultName}${edgeCount}`,
        umlType: tool.umlType,
        sourceId,
        targetId,
        directed: tool.directed,
        route: tool.kind === 'assemblyConnector' ? 'orthogonal' : 'straight',
        sourceMultiplicity: defaultMultiplicity(tool.kind),
        targetMultiplicity: defaultMultiplicity(tool.kind),
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
export function renameEdgeSequenceNumber(document, edgeId, sequenceNumber) {
    return {
        ...document,
        edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, sequenceNumber } : edge))
    };
}
export function allocateCommunicationSequenceNumber(document) {
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
export function renameEdge(document, edgeId, name) {
    return {
        ...document,
        edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, name } : edge))
    };
}
export function updateEdgeRoute(document, edgeId, route) {
    return {
        ...document,
        edges: document.edges.map((edge) => {
            if (edge.id !== edgeId) {
                return edge;
            }
            // Anchors / elbow offsets only apply to orthogonal routing.
            if (route !== 'orthogonal') {
                return {
                    ...edge,
                    route,
                    sourceAnchor: undefined,
                    targetAnchor: undefined,
                    orthogonalElbow: undefined
                };
            }
            return { ...edge, route };
        })
    };
}
export function updateEdgeOrthogonalElbow(document, edgeId, elbow) {
    return {
        ...document,
        edges: document.edges.map((edge) => (edge.id === edgeId ? { ...edge, orthogonalElbow: { dx: elbow.dx, dy: elbow.dy } } : edge))
    };
}
export function updateEdgeAnchor(document, edgeId, endpoint, anchor, offset) {
    const anchorOffset = typeof offset === 'number' && Number.isFinite(offset) ? Math.max(0, Math.min(1, offset)) : undefined;
    return {
        ...document,
        edges: document.edges.map((edge) => edge.id === edgeId
            ? {
                ...edge,
                sourceAnchor: endpoint === 'source' ? anchor : edge.sourceAnchor,
                targetAnchor: endpoint === 'target' ? anchor : edge.targetAnchor,
                sourceAnchorOffset: endpoint === 'source' ? anchorOffset : edge.sourceAnchorOffset,
                targetAnchorOffset: endpoint === 'target' ? anchorOffset : edge.targetAnchorOffset
            }
            : edge)
    };
}
export function updateEdgeEndpoint(document, edgeId, endpoint, nodeId) {
    if (!document.nodes.some((node) => node.id === nodeId)) {
        return document;
    }
    return {
        ...document,
        edges: document.edges.map((edge) => {
            if (edge.id !== edgeId) {
                return edge;
            }
            const nextSourceId = endpoint === 'source' ? nodeId : edge.sourceId;
            const nextTargetId = endpoint === 'target' ? nodeId : edge.targetId;
            if (nextSourceId === nextTargetId && !isInteractionMessageKind(edge.kind)) {
                return edge;
            }
            return {
                ...edge,
                sourceId: nextSourceId,
                targetId: nextTargetId
            };
        })
    };
}
export function updateEdgeMultiplicity(document, edgeId, endpoint, multiplicity) {
    return {
        ...document,
        edges: document.edges.map((edge) => edge.id === edgeId
            ? {
                ...edge,
                sourceMultiplicity: endpoint === 'source' ? multiplicity : edge.sourceMultiplicity,
                targetMultiplicity: endpoint === 'target' ? multiplicity : edge.targetMultiplicity
            }
            : edge)
    };
}
export function updateEdgeRelationship(document, edgeId, tool) {
    if (tool.kind === 'interfacePair') {
        return document;
    }
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
            const multiplicity = defaultMultiplicity(tool.kind);
            return {
                ...edge,
                kind: tool.kind,
                name: renameGeneratedRelationship(edge.name, tool.defaultName),
                umlType: tool.umlType,
                directed: tool.directed,
                // Endpoints must never change when only the relationship kind/style is edited.
                sourceId: edge.sourceId,
                targetId: edge.targetId,
                sequenceNumber,
                sourceMultiplicity: multiplicity === undefined ? undefined : edge.sourceMultiplicity ?? multiplicity,
                targetMultiplicity: multiplicity === undefined ? undefined : edge.targetMultiplicity ?? multiplicity
            };
        })
    };
}
function defaultNodeSize(kind) {
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
        case 'finalState':
        case 'pseudostate':
            return { width: 54, height: 54 };
        case 'stateInvariant':
            return { width: 132, height: 48 };
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
function heightForOwnedElements(kind, ownedElementCount) {
    const defaultHeight = defaultNodeSize(kind).height;
    const minimumCompartmentHeight = 176;
    if (ownedElementCount === 0) {
        return defaultHeight;
    }
    return Math.max(defaultHeight, minimumCompartmentHeight + ownedElementCount * 18);
}
function defaultOwnedElementName(kind) {
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
function defaultOwnedElementType(kind) {
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
function defaultMultiplicity(kind) {
    switch (kind) {
        case 'association':
        case 'connector':
            return '1';
        default:
            return undefined;
    }
}
function isCommunicationLinkKind(kind) {
    // Prefer `link`; accept legacy `connector` on older communication projects.
    return kind === 'link' || kind === 'connector';
}
function renameGeneratedRelationship(currentName, nextDefaultName) {
    const match = currentName.match(/^(Association|Generalization|Dependency|Extension|Realization|PackageImport|Include|Extend|Connector|Link|AssemblyConnector|DelegationConnector|Deployment|Message|AsyncMessage|ReplyMessage|ControlFlow|ObjectFlow|Transition|TimeMessage|DurationConstraint|message|asyncMessage|reply)(\d*)$/i);
    if (!match) {
        return currentName;
    }
    return `${nextDefaultName}${match[2] ?? ''}`;
}
function createId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

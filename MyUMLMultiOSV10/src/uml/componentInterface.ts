import type { EdgeAnchor, UmlDiagramDocument, UmlNode } from './editorModel.js';

export const INTERFACE_MIN_STEM = 36;
export const INTERFACE_CROSS = 24;
export const INTERFACE_MAX_STEM = 480;
export const INTERFACE_GLYPH_RADIUS = 6;
export const INTERFACE_DEFAULT_STEM = 56;
/** Snap a dragged interface onto a port when within this distance of the port center. */
export const INTERFACE_PORT_SNAP_DISTANCE = 32;

export type Point2 = { x: number; y: number };

export function isInterfaceKind(kind: string | undefined): boolean {
  return kind === 'providedInterface' || kind === 'requiredInterface';
}

export type InterfaceNode = UmlNode & { kind: 'providedInterface' | 'requiredInterface' };

export function isInterfaceNode(node: UmlNode | undefined): node is InterfaceNode {
  return Boolean(node && isInterfaceKind(node.kind));
}

export function interfaceAttachmentSide(node: UmlNode): EdgeAnchor {
  return node.attachmentSide ?? 'right';
}

export function interfaceStemLength(node: UmlNode): number {
  const side = interfaceAttachmentSide(node);
  const raw = side === 'left' || side === 'right' ? node.width : node.height;
  return clamp(raw, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
}

/** Along-edge distance from the component origin to the stem centerline. */
export function interfaceEdgeOffset(node: UmlNode, component: UmlNode): number {
  if (typeof node.edgeOffset === 'number' && Number.isFinite(node.edgeOffset)) {
    return clampEdgeOffset(node.edgeOffset, component, interfaceAttachmentSide(node));
  }

  const side = interfaceAttachmentSide(node);
  if (side === 'left' || side === 'right') {
    return clampEdgeOffset(node.y + node.height / 2 - component.y, component, side);
  }

  return clampEdgeOffset(node.x + node.width / 2 - component.x, component, side);
}

/**
 * Derive x/y/width/height from attachmentSide + stem length + edgeOffset.
 * The inner edge always stays glued to the component face.
 */
export function layoutInterfaceOnComponent(node: UmlNode, component: UmlNode, options: {
  side?: EdgeAnchor;
  stemLength?: number;
  edgeOffset?: number;
} = {}): UmlNode {
  const side = options.side ?? interfaceAttachmentSide(node);
  const stemLength = clamp(options.stemLength ?? interfaceStemLength(node), INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
  const edgeOffset = clampEdgeOffset(
    options.edgeOffset ?? interfaceEdgeOffset(node, component),
    component,
    side
  );

  if (side === 'right') {
    return {
      ...node,
      parentComponentId: component.id,
      attachmentSide: side,
      edgeOffset,
      x: Math.round(component.x + component.width),
      y: Math.round(component.y + edgeOffset - INTERFACE_CROSS / 2),
      width: Math.round(stemLength),
      height: INTERFACE_CROSS
    };
  }

  if (side === 'left') {
    return {
      ...node,
      parentComponentId: component.id,
      attachmentSide: side,
      edgeOffset,
      x: Math.round(component.x - stemLength),
      y: Math.round(component.y + edgeOffset - INTERFACE_CROSS / 2),
      width: Math.round(stemLength),
      height: INTERFACE_CROSS
    };
  }

  if (side === 'bottom') {
    return {
      ...node,
      parentComponentId: component.id,
      attachmentSide: side,
      edgeOffset,
      x: Math.round(component.x + edgeOffset - INTERFACE_CROSS / 2),
      y: Math.round(component.y + component.height),
      width: INTERFACE_CROSS,
      height: Math.round(stemLength)
    };
  }

  return {
    ...node,
    parentComponentId: component.id,
    attachmentSide: side,
    edgeOffset,
    x: Math.round(component.x + edgeOffset - INTERFACE_CROSS / 2),
    y: Math.round(component.y - stemLength),
    width: INTERFACE_CROSS,
    height: Math.round(stemLength)
  };
}

/**
 * Pick the nearest component face for a canvas point and the along-edge offset.
 */
export function sideAndOffsetFromPoint(component: UmlNode, point: Point2): { side: EdgeAnchor; edgeOffset: number } {
  const left = component.x;
  const right = component.x + component.width;
  const top = component.y;
  const bottom = component.y + component.height;
  const clampedX = clamp(point.x, left, right);
  const clampedY = clamp(point.y, top, bottom);

  const candidates: { side: EdgeAnchor; dist: number; edgeOffset: number }[] = [
    { side: 'left', dist: Math.hypot(point.x - left, point.y - clampedY), edgeOffset: clampedY - top },
    { side: 'right', dist: Math.hypot(point.x - right, point.y - clampedY), edgeOffset: clampedY - top },
    { side: 'top', dist: Math.hypot(point.x - clampedX, point.y - top), edgeOffset: clampedX - left },
    { side: 'bottom', dist: Math.hypot(point.x - clampedX, point.y - bottom), edgeOffset: clampedX - left }
  ];

  const best = candidates.sort((a, b) => a.dist - b.dist)[0];
  return { side: best.side, edgeOffset: best.edgeOffset };
}

/** Stem length from a face out to the pointer (falls back when pointer is inside / too close). */
export function stemLengthFromPointer(
  component: UmlNode,
  side: EdgeAnchor,
  pointer: Point2,
  fallbackStem: number
): number {
  let outward = fallbackStem;
  if (side === 'right') {
    outward = pointer.x - (component.x + component.width);
  } else if (side === 'left') {
    outward = component.x - pointer.x;
  } else if (side === 'bottom') {
    outward = pointer.y - (component.y + component.height);
  } else {
    outward = component.y - pointer.y;
  }

  if (outward < INTERFACE_MIN_STEM * 0.35) {
    return clamp(fallbackStem, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
  }

  return clamp(outward, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
}

/** Infer side from geometry only (ignores stored attachmentSide). */
export function inferInterfaceSideFromGeometry(node: UmlNode, component: UmlNode): EdgeAnchor {
  const midX = node.x + node.width / 2;
  const midY = node.y + node.height / 2;
  const candidates: { side: EdgeAnchor; dist: number }[] = [
    { side: 'left', dist: Math.abs(node.x + node.width - component.x) + Math.abs(midY - clamp(midY, component.y, component.y + component.height)) * 0.01 },
    { side: 'right', dist: Math.abs(node.x - (component.x + component.width)) + Math.abs(midY - clamp(midY, component.y, component.y + component.height)) * 0.01 },
    { side: 'top', dist: Math.abs(node.y + node.height - component.y) + Math.abs(midX - clamp(midX, component.x, component.x + component.width)) * 0.01 },
    { side: 'bottom', dist: Math.abs(node.y - (component.y + component.height)) + Math.abs(midX - clamp(midX, component.x, component.x + component.width)) * 0.01 }
  ];

  return candidates.sort((left, right) => left.dist - right.dist)[0].side;
}

/** Infer side from the attachment (inner) mid-point, never from AABB center. */
export function inferInterfaceSideFromAttachment(node: UmlNode, component: UmlNode): EdgeAnchor {
  return inferInterfaceSideFromGeometry(node, component);
}

export function attachInterfaceToComponent(node: UmlNode, component: UmlNode, preferredSide?: EdgeAnchor): UmlNode {
  const side = preferredSide ?? inferInterfaceSideFromGeometry(node, component);
  const stemLength = side === 'left' || side === 'right'
    ? clamp(node.width || INTERFACE_DEFAULT_STEM, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM)
    : clamp(node.height || INTERFACE_DEFAULT_STEM, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
  const edgeOffset = typeof node.edgeOffset === 'number' && Number.isFinite(node.edgeOffset) && preferredSide
    ? node.edgeOffset
    : (side === 'left' || side === 'right'
      ? node.y + (node.height || INTERFACE_CROSS) / 2 - component.y
      : node.x + (node.width || INTERFACE_CROSS) / 2 - component.x);

  return layoutInterfaceOnComponent(node, component, { side, stemLength, edgeOffset });
}

export function createInterfaceOnComponent(
  node: UmlNode,
  component: UmlNode,
  side: EdgeAnchor = 'right',
  edgeOffset = 48
): UmlNode {
  return layoutInterfaceOnComponent(node, component, {
    side,
    stemLength: INTERFACE_DEFAULT_STEM,
    edgeOffset
  });
}

/**
 * Drag update: pointer chooses any of the four faces; stem stays glued to that face.
 */
export function dragInterfaceOnComponent(
  node: UmlNode,
  component: UmlNode,
  pointer: { x: number; y: number },
  dragStart: {
    pointerX: number;
    pointerY: number;
    stemLength: number;
    edgeOffset: number;
    side: EdgeAnchor;
  }
): UmlNode {
  const { side, edgeOffset } = sideAndOffsetFromPoint(component, pointer);
  const stemLength = stemLengthFromPointer(component, side, pointer, dragStart.stemLength);

  return layoutInterfaceOnComponent(node, component, {
    side,
    stemLength,
    edgeOffset
  });
}

/** Place an interface on a port: stem starts at the port's outer surface, not its center. */
export function layoutInterfaceOnPort(
  node: UmlNode,
  component: UmlNode,
  port: UmlNode,
  options: { stemLength?: number } = {}
): UmlNode {
  const { side, edgeOffset } = sideAndOffsetFromPoint(component, {
    x: port.x + port.width / 2,
    y: port.y + port.height / 2
  });
  const stemLength = clamp(options.stemLength ?? interfaceStemLength(node), INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
  const portCenterX = port.x + port.width / 2;
  const portCenterY = port.y + port.height / 2;

  if (side === 'right') {
    const attachX = Math.round(port.x + port.width);
    return {
      ...node,
      parentComponentId: component.id,
      parentPortId: port.id,
      attachmentSide: side,
      edgeOffset,
      x: attachX,
      y: Math.round(portCenterY - INTERFACE_CROSS / 2),
      width: Math.round(stemLength),
      height: INTERFACE_CROSS
    };
  }

  if (side === 'left') {
    const attachX = Math.round(port.x);
    return {
      ...node,
      parentComponentId: component.id,
      parentPortId: port.id,
      attachmentSide: side,
      edgeOffset,
      x: attachX - Math.round(stemLength),
      y: Math.round(portCenterY - INTERFACE_CROSS / 2),
      width: Math.round(stemLength),
      height: INTERFACE_CROSS
    };
  }

  if (side === 'bottom') {
    const attachY = Math.round(port.y + port.height);
    return {
      ...node,
      parentComponentId: component.id,
      parentPortId: port.id,
      attachmentSide: side,
      edgeOffset,
      x: Math.round(portCenterX - INTERFACE_CROSS / 2),
      y: attachY,
      width: INTERFACE_CROSS,
      height: Math.round(stemLength)
    };
  }

  const attachY = Math.round(port.y);
  return {
    ...node,
    parentComponentId: component.id,
    parentPortId: port.id,
    attachmentSide: side,
    edgeOffset,
    x: Math.round(portCenterX - INTERFACE_CROSS / 2),
    y: attachY - Math.round(stemLength),
    width: INTERFACE_CROSS,
    height: Math.round(stemLength)
  };
}

/** Place an interface on the same face as a port, glued to the port outer surface. */
export function attachInterfaceToPort(node: UmlNode, component: UmlNode, port: UmlNode): UmlNode {
  return layoutInterfaceOnPort(node, component, port, { stemLength: interfaceStemLength(node) });
}

export function findNearestPortOnComponent(
  nodes: readonly UmlNode[],
  component: UmlNode,
  point: Point2,
  maxDistance = INTERFACE_PORT_SNAP_DISTANCE
): UmlNode | undefined {
  let best: { port: UmlNode; distance: number } | undefined;

  for (const candidate of nodes) {
    if (candidate.kind !== 'port') {
      continue;
    }
    if (candidate.parentComponentId && candidate.parentComponentId !== component.id) {
      continue;
    }
    if (!candidate.parentComponentId) {
      const owner = findComponentForInterface(nodes as UmlNode[], candidate);
      if (!owner || owner.id !== component.id) {
        continue;
      }
    }

    const center = { x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 };
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (distance > maxDistance) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { port: candidate, distance };
    }
  }

  return best?.port;
}

/** Attachment point of an interface on the component face (inner stem mid). */
export function interfaceAttachmentPoint(node: UmlNode, component: UmlNode): Point2 {
  const side = interfaceAttachmentSide(node);
  const edgeOffset = interfaceEdgeOffset(node, component);

  if (side === 'right') {
    return { x: component.x + component.width, y: component.y + edgeOffset };
  }
  if (side === 'left') {
    return { x: component.x, y: component.y + edgeOffset };
  }
  if (side === 'bottom') {
    return { x: component.x + edgeOffset, y: component.y + component.height };
  }
  return { x: component.x + edgeOffset, y: component.y };
}

/**
 * After free drag, snap to a nearby port on the same component when close enough.
 * Otherwise clear parentPortId.
 */
export function resolveInterfacePortAttachment(
  node: UmlNode,
  component: UmlNode,
  nodes: readonly UmlNode[],
  pointer?: Point2
): UmlNode {
  const probes: Point2[] = [interfaceAttachmentPoint(node, component)];
  if (pointer) {
    probes.push(pointer);
  }

  let nearest: UmlNode | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const probe of probes) {
    const port = findNearestPortOnComponent(nodes, component, probe);
    if (!port) {
      continue;
    }
    const center = { x: port.x + port.width / 2, y: port.y + port.height / 2 };
    const distance = Math.hypot(probe.x - center.x, probe.y - center.y);
    if (distance < nearestDistance) {
      nearest = port;
      nearestDistance = distance;
    }
  }

  if (nearest) {
    return attachInterfaceToPort(node, component, nearest);
  }

  return { ...node, parentPortId: undefined };
}

export function resizeInterfaceStem(
  node: UmlNode,
  component: UmlNode,
  nextWidth: number,
  nextHeight: number
): UmlNode {
  const side = interfaceAttachmentSide(node);
  const stemLength = side === 'left' || side === 'right' ? nextWidth : nextHeight;
  return layoutInterfaceOnComponent(node, component, {
    side,
    stemLength,
    edgeOffset: interfaceEdgeOffset(node, component)
  });
}

export function reflowInterfaceAfterComponentChange(
  node: UmlNode,
  startComponent: UmlNode,
  nextComponent: UmlNode
): UmlNode {
  const side = interfaceAttachmentSide(node);
  const stemLength = interfaceStemLength(node);
  const startOffset = interfaceEdgeOffset(node, startComponent);
  const relative = side === 'left' || side === 'right'
    ? (startComponent.height > 0 ? startOffset / startComponent.height : 0.5)
    : (startComponent.width > 0 ? startOffset / startComponent.width : 0.5);
  const edgeOffset = side === 'left' || side === 'right'
    ? relative * nextComponent.height
    : relative * nextComponent.width;

  return layoutInterfaceOnComponent(node, nextComponent, { side, stemLength, edgeOffset });
}

export function interfaceGlyphCenter(node: UmlNode): Point2 {
  const side = interfaceAttachmentSide(node);
  const r = INTERFACE_GLYPH_RADIUS;
  switch (side) {
    case 'right':
      return { x: node.x + node.width - r - 4, y: node.y + node.height / 2 };
    case 'left':
      return { x: node.x + r + 4, y: node.y + node.height / 2 };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height - r - 4 };
    default:
      return { x: node.x + node.width / 2, y: node.y + r + 4 };
  }
}

/** Provided ↔ required on two different components. */
export function isAssemblyPair(left: UmlNode, right: UmlNode): boolean {
  if (!isInterfaceNode(left) || !isInterfaceNode(right) || left.kind === right.kind) {
    return false;
  }
  const leftParent = left.parentComponentId;
  const rightParent = right.parentComponentId;
  return Boolean(leftParent && rightParent && leftParent !== rightParent);
}

export function findComponentForInterface(nodes: UmlNode[], node: UmlNode): UmlNode | undefined {
  if (node.parentComponentId) {
    return nodes.find((candidate) => candidate.id === node.parentComponentId && candidate.kind === 'component');
  }

  return nearestComponent(nodes, node);
}

export function nearestComponent(nodes: UmlNode[], node: UmlNode): UmlNode | undefined {
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  let nearest: { node: UmlNode; distance: number } | undefined;

  for (const candidate of nodes) {
    if (candidate.kind !== 'component' || candidate.id === node.id) {
      continue;
    }

    const dx = Math.max(candidate.x - center.x, 0, center.x - (candidate.x + candidate.width));
    const dy = Math.max(candidate.y - center.y, 0, center.y - (candidate.y + candidate.height));
    const distance = Math.hypot(dx, dy);

    if (distance > 200) {
      continue;
    }

    if (!nearest || distance < nearest.distance) {
      nearest = { node: candidate, distance };
    }
  }

  return nearest?.node;
}

export function replaceNode(document: UmlDiagramDocument, nextNode: UmlNode): UmlDiagramDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === nextNode.id ? nextNode : node))
  };
}

function clampEdgeOffset(offset: number, component: UmlNode, side: EdgeAnchor): number {
  const margin = 8 + INTERFACE_CROSS / 2;
  if (side === 'left' || side === 'right') {
    return clamp(offset, margin, Math.max(margin, component.height - margin));
  }

  return clamp(offset, margin, Math.max(margin, component.width - margin));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const INTERFACE_MIN_STEM = 36;
export const INTERFACE_CROSS = 24;
export const INTERFACE_MAX_STEM = 480;
export const INTERFACE_GLYPH_RADIUS = 6;
/** Socket arc radius (slightly larger than the ball for a clear cup shape). */
export const INTERFACE_SOCKET_RADIUS = 10;
/**
 * Distance between ball and socket centers along a paired connection.
 * Keeps the sequence readable: stem → ball → socket → stem (or reverse).
 */
export const INTERFACE_PAIR_CENTER_SEPARATION = INTERFACE_GLYPH_RADIUS + INTERFACE_SOCKET_RADIUS * 0.35;
export const INTERFACE_DEFAULT_STEM = 56;
/** Snap a dragged interface onto a port when within this distance of the port center. */
export const INTERFACE_PORT_SNAP_DISTANCE = 32;
export function isInterfaceKind(kind) {
    return kind === 'providedInterface' || kind === 'requiredInterface';
}
export function isInterfaceNode(node) {
    return Boolean(node && isInterfaceKind(node.kind));
}
export function interfaceAttachmentSide(node) {
    return node.attachmentSide ?? 'right';
}
export function interfaceStemLength(node) {
    const side = interfaceAttachmentSide(node);
    const raw = side === 'left' || side === 'right' ? node.width : node.height;
    return clamp(raw, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
}
/** Along-edge distance from the component origin to the stem centerline. */
export function interfaceEdgeOffset(node, component) {
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
export function layoutInterfaceOnComponent(node, component, options = {}) {
    const side = options.side ?? interfaceAttachmentSide(node);
    const stemLength = clamp(options.stemLength ?? interfaceStemLength(node), INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
    const edgeOffset = clampEdgeOffset(options.edgeOffset ?? interfaceEdgeOffset(node, component), component, side);
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
export function sideAndOffsetFromPoint(component, point) {
    const left = component.x;
    const right = component.x + component.width;
    const top = component.y;
    const bottom = component.y + component.height;
    const clampedX = clamp(point.x, left, right);
    const clampedY = clamp(point.y, top, bottom);
    const candidates = [
        { side: 'left', dist: Math.hypot(point.x - left, point.y - clampedY), edgeOffset: clampedY - top },
        { side: 'right', dist: Math.hypot(point.x - right, point.y - clampedY), edgeOffset: clampedY - top },
        { side: 'top', dist: Math.hypot(point.x - clampedX, point.y - top), edgeOffset: clampedX - left },
        { side: 'bottom', dist: Math.hypot(point.x - clampedX, point.y - bottom), edgeOffset: clampedX - left }
    ];
    const best = candidates.sort((a, b) => a.dist - b.dist)[0];
    return { side: best.side, edgeOffset: best.edgeOffset };
}
/** Signed distance from a component face outward to the pointer. */
export function outwardDistanceFromFace(component, side, pointer) {
    if (side === 'right') {
        return pointer.x - (component.x + component.width);
    }
    if (side === 'left') {
        return component.x - pointer.x;
    }
    if (side === 'bottom') {
        return pointer.y - (component.y + component.height);
    }
    return component.y - pointer.y;
}
/** Stem length from a face out to the pointer (falls back when pointer is inside / too close). */
export function stemLengthFromPointer(component, side, pointer, fallbackStem) {
    const outward = outwardDistanceFromFace(component, side, pointer);
    if (outward < INTERFACE_MIN_STEM * 0.35) {
        return clamp(fallbackStem, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
    }
    return clamp(outward, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
}
/** Infer side from geometry only (ignores stored attachmentSide). */
export function inferInterfaceSideFromGeometry(node, component) {
    const midX = node.x + node.width / 2;
    const midY = node.y + node.height / 2;
    const candidates = [
        { side: 'left', dist: Math.abs(node.x + node.width - component.x) + Math.abs(midY - clamp(midY, component.y, component.y + component.height)) * 0.01 },
        { side: 'right', dist: Math.abs(node.x - (component.x + component.width)) + Math.abs(midY - clamp(midY, component.y, component.y + component.height)) * 0.01 },
        { side: 'top', dist: Math.abs(node.y + node.height - component.y) + Math.abs(midX - clamp(midX, component.x, component.x + component.width)) * 0.01 },
        { side: 'bottom', dist: Math.abs(node.y - (component.y + component.height)) + Math.abs(midX - clamp(midX, component.x, component.x + component.width)) * 0.01 }
    ];
    return candidates.sort((left, right) => left.dist - right.dist)[0].side;
}
/** Infer side from the attachment (inner) mid-point, never from AABB center. */
export function inferInterfaceSideFromAttachment(node, component) {
    return inferInterfaceSideFromGeometry(node, component);
}
export function attachInterfaceToComponent(node, component, preferredSide) {
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
export function createInterfaceOnComponent(node, component, side = 'right', edgeOffset = 48) {
    return layoutInterfaceOnComponent(node, component, {
        side,
        stemLength: INTERFACE_DEFAULT_STEM,
        edgeOffset
    });
}
/**
 * Drag update: while the pointer stays outside the start face, keep that face so the
 * stem can be lengthened toward a partner PI/RI. Near/inside the component, allow face changes.
 */
export function dragInterfaceOnComponent(node, component, pointer, dragStart) {
    const startSide = dragStart.side;
    const outward = outwardDistanceFromFace(component, startSide, pointer);
    if (outward >= INTERFACE_MIN_STEM * 0.25) {
        const edgeOffset = startSide === 'left' || startSide === 'right'
            ? clampEdgeOffset(pointer.y - component.y, component, startSide)
            : clampEdgeOffset(pointer.x - component.x, component, startSide);
        return layoutInterfaceOnComponent(node, component, {
            side: startSide,
            stemLength: clamp(outward, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM),
            edgeOffset
        });
    }
    const { side, edgeOffset } = sideAndOffsetFromPoint(component, pointer);
    const stemLength = stemLengthFromPointer(component, side, pointer, dragStart.stemLength);
    return layoutInterfaceOnComponent(node, component, {
        side,
        stemLength,
        edgeOffset
    });
}
/** Place an interface on a port: stem starts at the port's outer surface, not its center. */
export function layoutInterfaceOnPort(node, component, port, options = {}) {
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
export function attachInterfaceToPort(node, component, port) {
    return layoutInterfaceOnPort(node, component, port, { stemLength: interfaceStemLength(node) });
}
export function findNearestPortOnComponent(nodes, component, point, maxDistance = INTERFACE_PORT_SNAP_DISTANCE) {
    let best;
    for (const candidate of nodes) {
        if (candidate.kind !== 'port') {
            continue;
        }
        if (candidate.parentComponentId && candidate.parentComponentId !== component.id) {
            continue;
        }
        if (!candidate.parentComponentId) {
            const owner = findComponentForInterface(nodes, candidate);
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
export function interfaceAttachmentPoint(node, component) {
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
export function resolveInterfacePortAttachment(node, component, nodes, pointer) {
    const probes = [interfaceAttachmentPoint(node, component)];
    if (pointer) {
        probes.push(pointer);
    }
    let nearest;
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
export function resizeInterfaceStem(node, component, nextWidth, nextHeight) {
    const side = interfaceAttachmentSide(node);
    const stemLength = side === 'left' || side === 'right' ? nextWidth : nextHeight;
    return layoutInterfaceOnComponent(node, component, {
        side,
        stemLength,
        edgeOffset: interfaceEdgeOffset(node, component)
    });
}
/** Resize stem length from a canvas pointer while keeping face and edge offset fixed. */
export function resizeInterfaceStemByPointer(node, component, pointer, port) {
    const side = interfaceAttachmentSide(node);
    const fallback = interfaceStemLength(node);
    const stemLength = port
        ? stemLengthFromPort(port, side, pointer, fallback)
        : stemLengthFromPointer(component, side, pointer, fallback);
    if (port) {
        return layoutInterfaceOnPort(node, component, port, { stemLength });
    }
    return layoutInterfaceOnComponent(node, component, {
        side,
        stemLength,
        edgeOffset: interfaceEdgeOffset(node, component)
    });
}
function stemLengthFromPort(port, side, pointer, fallbackStem) {
    let outward = fallbackStem;
    if (side === 'right') {
        outward = pointer.x - (port.x + port.width);
    }
    else if (side === 'left') {
        outward = port.x - pointer.x;
    }
    else if (side === 'bottom') {
        outward = pointer.y - (port.y + port.height);
    }
    else {
        outward = port.y - pointer.y;
    }
    if (outward < INTERFACE_MIN_STEM * 0.35) {
        return clamp(fallbackStem, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
    }
    return clamp(outward, INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
}
/** Place the stem resize handle at the ball/socket end (not the component attachment). */
export function interfaceStemResizeHandlePosition(node) {
    const glyph = interfaceGlyphCenter(node);
    return { x: glyph.x - 8, y: glyph.y - 8 };
}
export function reflowInterfaceAfterComponentChange(node, startComponent, nextComponent) {
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
/**
 * Sequential ball + socket layout along provided → required.
 * Order on that axis is always ball then socket (line→O→)→line from the provided side).
 */
export function pairedAssemblyLayout(joint, providedAttach, requiredAttach) {
    let dx = requiredAttach.x - providedAttach.x;
    let dy = requiredAttach.y - providedAttach.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 1) {
        dx = joint.x - providedAttach.x;
        dy = joint.y - providedAttach.y;
        dist = Math.hypot(dx, dy) || 1;
    }
    const ux = dx / dist;
    const uy = dy / dist;
    const half = INTERFACE_PAIR_CENTER_SEPARATION / 2;
    return {
        axis: { x: ux, y: uy },
        ball: { x: joint.x - ux * half, y: joint.y - uy * half },
        socket: { x: joint.x + ux * half, y: joint.y + uy * half }
    };
}
export function interfaceGlyphCenter(node) {
    if (isPairedInterface(node)) {
        return { x: node.jointX, y: node.jointY };
    }
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
export function isPairedInterface(node) {
    return isInterfaceNode(node)
        && typeof node.interfacePartnerId === 'string'
        && typeof node.stemAttachX === 'number'
        && typeof node.stemAttachY === 'number'
        && typeof node.jointX === 'number'
        && typeof node.jointY === 'number';
}
/** Nearest point on a component rectangle boundary to a world point. */
export function nearestPointOnRect(rect, point) {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    const clampedX = clamp(point.x, left, right);
    const clampedY = clamp(point.y, top, bottom);
    const inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
    if (!inside) {
        return { x: clampedX, y: clampedY };
    }
    const toLeft = point.x - left;
    const toRight = right - point.x;
    const toTop = point.y - top;
    const toBottom = bottom - point.y;
    const nearest = Math.min(toLeft, toRight, toTop, toBottom);
    if (nearest === toLeft) {
        return { x: left, y: point.y };
    }
    if (nearest === toRight) {
        return { x: right, y: point.y };
    }
    if (nearest === toTop) {
        return { x: point.x, y: top };
    }
    return { x: point.x, y: bottom };
}
function pairedStemControlPoint(attach, tip) {
    const midX = (attach.x + tip.x) / 2;
    const midY = (attach.y + tip.y) / 2;
    const dx = tip.x - attach.x;
    const dy = tip.y - attach.y;
    const length = Math.hypot(dx, dy) || 1;
    const offset = Math.min(80, Math.max(24, length * 0.35));
    return {
        x: midX - (dy / length) * offset,
        y: midY + (dx / length) * offset
    };
}
/** SVG path for one side of a paired interface (attach → tip before glyph). */
export function pairedStemPathData(attach, tip, route = 'straight') {
    if (route === 'curve') {
        const control = pairedStemControlPoint(attach, tip);
        return `M ${attach.x} ${attach.y} Q ${control.x} ${control.y} ${tip.x} ${tip.y}`;
    }
    if (route === 'orthogonal') {
        if (Math.abs(attach.x - tip.x) < 1 || Math.abs(attach.y - tip.y) < 1) {
            return `M ${attach.x} ${attach.y} L ${tip.x} ${tip.y}`;
        }
        if (Math.abs(tip.x - attach.x) >= Math.abs(tip.y - attach.y)) {
            return `M ${attach.x} ${attach.y} L ${tip.x} ${attach.y} L ${tip.x} ${tip.y}`;
        }
        return `M ${attach.x} ${attach.y} L ${attach.x} ${tip.y} L ${tip.x} ${tip.y}`;
    }
    return `M ${attach.x} ${attach.y} L ${tip.x} ${tip.y}`;
}
function pairedStemBounds(attach, joint, route = 'straight') {
    const pad = INTERFACE_SOCKET_RADIUS + 8;
    const points = [attach, joint];
    if (route === 'curve') {
        points.push(pairedStemControlPoint(attach, joint));
    }
    else if (route === 'orthogonal' && Math.abs(attach.x - joint.x) >= 1 && Math.abs(attach.y - joint.y) >= 1) {
        if (Math.abs(joint.x - attach.x) >= Math.abs(joint.y - attach.y)) {
            points.push({ x: joint.x, y: attach.y });
        }
        else {
            points.push({ x: attach.x, y: joint.y });
        }
    }
    const minX = Math.min(...points.map((point) => point.x)) - pad;
    const minY = Math.min(...points.map((point) => point.y)) - pad;
    const maxX = Math.max(...points.map((point) => point.x)) + pad;
    const maxY = Math.max(...points.map((point) => point.y)) + pad;
    return {
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.max(INTERFACE_CROSS, Math.round(maxX - minX)),
        height: Math.max(INTERFACE_CROSS, Math.round(maxY - minY))
    };
}
function normalizePairRoute(route) {
    return route === 'orthogonal' || route === 'curve' ? route : 'straight';
}
/**
 * Free-angle stem from a component (or port surface) to a shared ball/socket joint.
 * When `port` is set, the stem starts on the port box and `parentPortId` is stored.
 */
export function layoutPairedInterface(node, component, joint, partnerId, route, port) {
    const pairRoute = normalizePairRoute(route ?? node.pairRoute);
    const host = port ?? component;
    let attach = nearestPointOnRect(host, joint);
    let nextJoint = { x: joint.x, y: joint.y };
    const dx = nextJoint.x - attach.x;
    const dy = nextJoint.y - attach.y;
    const dist = Math.hypot(dx, dy);
    if (dist < INTERFACE_MIN_STEM) {
        const center = { x: host.x + host.width / 2, y: host.y + host.height / 2 };
        const fromCenterX = nextJoint.x - center.x;
        const fromCenterY = nextJoint.y - center.y;
        const length = Math.hypot(fromCenterX, fromCenterY) || 1;
        nextJoint = {
            x: attach.x + (fromCenterX / length) * INTERFACE_MIN_STEM,
            y: attach.y + (fromCenterY / length) * INTERFACE_MIN_STEM
        };
        attach = nearestPointOnRect(host, nextJoint);
    }
    else if (dist > INTERFACE_MAX_STEM) {
        const scale = INTERFACE_MAX_STEM / dist;
        nextJoint = {
            x: attach.x + dx * scale,
            y: attach.y + dy * scale
        };
    }
    const bounds = pairedStemBounds(attach, nextJoint, pairRoute);
    return {
        ...node,
        parentComponentId: component.id,
        parentPortId: port?.id,
        interfacePartnerId: partnerId,
        stemAttachX: Math.round(attach.x),
        stemAttachY: Math.round(attach.y),
        jointX: Math.round(nextJoint.x),
        jointY: Math.round(nextJoint.y),
        pairRoute,
        interfaceElbow: undefined,
        attachmentSide: undefined,
        edgeOffset: undefined,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
    };
}
/** Resolve a component or port endpoint for the "연결" gesture. */
export function resolveInterfacePairEndpoint(document, nodeId) {
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        return undefined;
    }
    if (node.kind === 'component') {
        return {
            component: node,
            center: { x: node.x + node.width / 2, y: node.y + node.height / 2 }
        };
    }
    if (node.kind === 'port') {
        const component = (node.parentComponentId
            ? document.nodes.find((candidate) => candidate.id === node.parentComponentId && candidate.kind === 'component')
            : undefined) ?? findComponentForInterface(document.nodes, node);
        if (!component) {
            return undefined;
        }
        return {
            component,
            port: node,
            center: { x: node.x + node.width / 2, y: node.y + node.height / 2 }
        };
    }
    return undefined;
}
function pointInNodeBounds(node, point, pad) {
    return point.x >= node.x - pad
        && point.x <= node.x + node.width + pad
        && point.y >= node.y - pad
        && point.y <= node.y + node.height + pad;
}
/**
 * Pick a "연결" drop target at a canvas point.
 * Ports win over components; dropping on a component near a port snaps to that port.
 */
export function pickInterfacePairEndpointAtPoint(document, point, excludeNodeId) {
    const ports = document.nodes.filter((node) => node.kind === 'port'
        && node.id !== excludeNodeId
        && pointInNodeBounds(node, point, 18));
    if (ports.length > 0) {
        // Prefer the top-most (last drawn) port under the pointer.
        return ports[ports.length - 1].id;
    }
    const components = document.nodes.filter((node) => node.kind === 'component'
        && node.id !== excludeNodeId
        && pointInNodeBounds(node, point, 8));
    if (components.length === 0) {
        return undefined;
    }
    const component = components[components.length - 1];
    const nearPort = findNearestPortOnComponent(document.nodes, component, point, INTERFACE_PORT_SNAP_DISTANCE + 8);
    return nearPort?.id ?? component.id;
}
/**
 * If the nominal target is a component but the pointer is on/near a port, use that port.
 * Keeps port→port drops reliable when the larger component would otherwise win.
 */
export function refineInterfacePairTargetId(document, targetId, point) {
    const target = document.nodes.find((node) => node.id === targetId);
    if (!target) {
        return targetId;
    }
    if (target.kind === 'port') {
        return targetId;
    }
    if (target.kind !== 'component' || !point) {
        return targetId;
    }
    const nearPort = findNearestPortOnComponent(document.nodes, target, point, INTERFACE_PORT_SNAP_DISTANCE + 8);
    return nearPort?.id ?? targetId;
}
function portForPairedNode(document, node) {
    if (!node.parentPortId) {
        return undefined;
    }
    return document.nodes.find((candidate) => candidate.id === node.parentPortId && candidate.kind === 'port');
}
/** Update straight / orthogonal / curve style for both sides of a paired connection. */
export function updateInterfacePairRoute(document, nodeId, route) {
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isPairedInterface(node)) {
        return document;
    }
    const partner = document.nodes.find((candidate) => candidate.id === node.interfacePartnerId);
    const component = findComponentForInterface(document.nodes, node);
    if (!partner || !isInterfaceNode(partner) || !component) {
        return document;
    }
    const partnerComponent = findComponentForInterface(document.nodes, partner);
    if (!partnerComponent) {
        return document;
    }
    const joint = { x: node.jointX, y: node.jointY };
    const nextNode = layoutPairedInterface(node, component, joint, partner.id, route, portForPairedNode(document, node));
    const nextPartner = layoutPairedInterface(partner, partnerComponent, joint, node.id, route, portForPairedNode(document, partner));
    return {
        ...document,
        nodes: document.nodes.map((candidate) => {
            if (candidate.id === nextNode.id) {
                return nextNode;
            }
            if (candidate.id === nextPartner.id) {
                return nextPartner;
            }
            return candidate;
        })
    };
}
/** Keep the shared joint; refresh the attach point after a component move. */
export function reflowPairedInterface(node, component, port) {
    if (!isPairedInterface(node)) {
        return port ? attachInterfaceToPort(node, component, port) : attachInterfaceToComponent(node, component);
    }
    return layoutPairedInterface(node, component, { x: node.jointX, y: node.jointY }, node.interfacePartnerId, node.pairRoute, port);
}
/** Move the shared ball/socket joint; both paired interfaces stay stuck together. */
export function dragPairedInterfaceJoint(document, nodeId, joint) {
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isPairedInterface(node)) {
        return document;
    }
    const partner = document.nodes.find((candidate) => candidate.id === node.interfacePartnerId);
    const component = findComponentForInterface(document.nodes, node);
    if (!partner || !isInterfaceNode(partner) || !component) {
        return document;
    }
    const partnerComponent = findComponentForInterface(document.nodes, partner);
    if (!partnerComponent) {
        return document;
    }
    const nextNode = layoutPairedInterface(node, component, joint, partner.id, undefined, portForPairedNode(document, node));
    const nextPartner = layoutPairedInterface(partner, partnerComponent, {
        x: nextNode.jointX ?? joint.x,
        y: nextNode.jointY ?? joint.y
    }, node.id, undefined, portForPairedNode(document, partner));
    return {
        ...document,
        nodes: document.nodes.map((candidate) => {
            if (candidate.id === nextNode.id) {
                return nextNode;
            }
            if (candidate.id === nextPartner.id) {
                return nextPartner;
            }
            return candidate;
        })
    };
}
/** Provided ↔ required on two different components. */
export function isAssemblyPair(left, right, nodes = []) {
    if (!isInterfaceNode(left) || !isInterfaceNode(right) || left.kind === right.kind) {
        return false;
    }
    const leftParent = left.parentComponentId ?? nearestComponent(nodes, left)?.id;
    const rightParent = right.parentComponentId ?? nearestComponent(nodes, right)?.id;
    return Boolean(leftParent && rightParent && leftParent !== rightParent);
}
/**
 * Facing sides and shared edge offset so a provided/required pair can meet between two components.
 */
export function facingSidesBetweenComponents(source, target) {
    const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    if (horizontal) {
        const sourceSide = dx >= 0 ? 'right' : 'left';
        const targetSide = dx >= 0 ? 'left' : 'right';
        const midY = (sourceCenter.y + targetCenter.y) / 2;
        const sourceFaceX = sourceSide === 'right' ? source.x + source.width : source.x;
        const targetFaceX = targetSide === 'left' ? target.x : target.x + target.width;
        const gap = Math.abs(targetFaceX - sourceFaceX);
        const stemEach = clamp(Math.floor((gap - INTERFACE_GLYPH_RADIUS * 2 - 4) / 2), INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
        return {
            sourceSide,
            targetSide,
            sourceOffset: clampEdgeOffset(midY - source.y, source, sourceSide),
            targetOffset: clampEdgeOffset(midY - target.y, target, targetSide),
            sourceStem: stemEach,
            targetStem: stemEach
        };
    }
    const sourceSide = dy >= 0 ? 'bottom' : 'top';
    const targetSide = dy >= 0 ? 'top' : 'bottom';
    const midX = (sourceCenter.x + targetCenter.x) / 2;
    const sourceFaceY = sourceSide === 'bottom' ? source.y + source.height : source.y;
    const targetFaceY = targetSide === 'top' ? target.y : target.y + target.height;
    const gap = Math.abs(targetFaceY - sourceFaceY);
    const stemEach = clamp(Math.floor((gap - INTERFACE_GLYPH_RADIUS * 2 - 4) / 2), INTERFACE_MIN_STEM, INTERFACE_MAX_STEM);
    return {
        sourceSide,
        targetSide,
        sourceOffset: clampEdgeOffset(midX - source.x, source, sourceSide),
        targetOffset: clampEdgeOffset(midX - target.x, target, targetSide),
        sourceStem: stemEach,
        targetStem: stemEach
    };
}
/**
 * One-gesture "연결": create provided + required as one joined connector (shared joint).
 * Endpoints may be components or ports. Direction source → target is ball → socket.
 */
export function createInterfacePairBetweenComponents(document, sourceId, targetId) {
    const source = resolveInterfacePairEndpoint(document, sourceId);
    const target = resolveInterfacePairEndpoint(document, targetId);
    if (!source || !target || sourceId === targetId) {
        return document;
    }
    // Component↔component must be distinct; component↔own-port is ambiguous.
    if (!source.port && !target.port && source.component.id === target.component.id) {
        return document;
    }
    if (!source.port && target.port && source.component.id === target.component.id) {
        return document;
    }
    if (source.port && !target.port && source.component.id === target.component.id) {
        return document;
    }
    const providedCount = document.nodes.filter((node) => node.kind === 'providedInterface').length + 1;
    const requiredCount = document.nodes.filter((node) => node.kind === 'requiredInterface').length + 1;
    const providedId = `providedInterface-${Math.random().toString(36).slice(2, 10)}`;
    const requiredId = `requiredInterface-${Math.random().toString(36).slice(2, 10)}`;
    const joint = {
        x: (source.center.x + target.center.x) / 2,
        y: (source.center.y + target.center.y) / 2
    };
    // Source of the gesture owns the ball; target owns the socket (order follows connect direction).
    const providedSeed = {
        id: providedId,
        kind: 'providedInterface',
        name: `ProvidedInterface${providedCount}`,
        umlType: 'uml:Interface',
        ownedElements: [],
        x: source.center.x,
        y: source.center.y,
        width: INTERFACE_DEFAULT_STEM,
        height: INTERFACE_CROSS
    };
    const requiredSeed = {
        id: requiredId,
        kind: 'requiredInterface',
        name: `RequiredInterface${requiredCount}`,
        umlType: 'uml:Interface',
        ownedElements: [],
        x: target.center.x,
        y: target.center.y,
        width: INTERFACE_DEFAULT_STEM,
        height: INTERFACE_CROSS
    };
    const provided = layoutPairedInterface(providedSeed, source.component, joint, requiredId, undefined, source.port);
    const required = layoutPairedInterface(requiredSeed, target.component, {
        x: provided.jointX ?? joint.x,
        y: provided.jointY ?? joint.y
    }, providedId, undefined, target.port);
    return {
        ...document,
        nodes: [...document.nodes, provided, required]
    };
}
/** Flip ball ↔ socket between the two ends of a paired connection. */
export function swapPairedInterfaceRoles(document, nodeId) {
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isPairedInterface(node)) {
        return document;
    }
    const partner = document.nodes.find((candidate) => candidate.id === node.interfacePartnerId);
    if (!partner || !isPairedInterface(partner)) {
        return document;
    }
    const component = findComponentForInterface(document.nodes, node);
    const partnerComponent = findComponentForInterface(document.nodes, partner);
    if (!component || !partnerComponent) {
        return document;
    }
    const joint = { x: node.jointX, y: node.jointY };
    const route = node.pairRoute ?? partner.pairRoute ?? 'straight';
    const swappedNode = {
        ...node,
        kind: node.kind === 'providedInterface' ? 'requiredInterface' : 'providedInterface',
        name: node.kind === 'providedInterface'
            ? node.name.replace(/^ProvidedInterface/i, 'RequiredInterface')
            : node.name.replace(/^RequiredInterface/i, 'ProvidedInterface')
    };
    const swappedPartner = {
        ...partner,
        kind: partner.kind === 'providedInterface' ? 'requiredInterface' : 'providedInterface',
        name: partner.kind === 'providedInterface'
            ? partner.name.replace(/^ProvidedInterface/i, 'RequiredInterface')
            : partner.name.replace(/^RequiredInterface/i, 'ProvidedInterface')
    };
    const nextNode = layoutPairedInterface(swappedNode, component, joint, partner.id, route, portForPairedNode(document, node));
    const nextPartner = layoutPairedInterface(swappedPartner, partnerComponent, joint, node.id, route, portForPairedNode(document, partner));
    return {
        ...document,
        nodes: document.nodes.map((candidate) => {
            if (candidate.id === nextNode.id) {
                return nextNode;
            }
            if (candidate.id === nextPartner.id) {
                return nextPartner;
            }
            return candidate;
        })
    };
}
/**
 * Assembly connector polyline with corners at the ball and socket (glyphs are bend points).
 * When glyphs are offset on both axes, uses an orthogonal jog; elbow shifts the middle corridor.
 */
export function assemblyConnectorPolyline(source, target, elbow) {
    if (!isInterfaceNode(source) || !isInterfaceNode(target) || source.kind === target.kind) {
        return undefined;
    }
    const from = interfaceGlyphCenter(source);
    const to = interfaceGlyphCenter(target);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.hypot(dx, dy) < 1) {
        return [from, to];
    }
    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
        return [from, to];
    }
    // Bend at the ball, then at the socket: leave provided along its facing, arrive into required.
    const sourceSide = interfaceAttachmentSide(source);
    const leaveHorizontal = sourceSide === 'left' || sourceSide === 'right';
    const midShiftX = elbow?.dx ?? 0;
    const midShiftY = elbow?.dy ?? 0;
    if (leaveHorizontal) {
        const bendX = from.x + dx / 2 + midShiftX;
        return [
            from,
            { x: bendX, y: from.y },
            { x: bendX, y: to.y },
            to
        ];
    }
    const bendY = from.y + dy / 2 + midShiftY;
    return [
        from,
        { x: from.x, y: bendY },
        { x: to.x, y: bendY },
        to
    ];
}
export function findComponentForInterface(nodes, node) {
    if (node.parentComponentId) {
        return nodes.find((candidate) => candidate.id === node.parentComponentId && candidate.kind === 'component');
    }
    return nearestComponent(nodes, node);
}
export function nearestComponent(nodes, node) {
    const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    let nearest;
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
export function replaceNode(document, nextNode) {
    return {
        ...document,
        nodes: document.nodes.map((node) => (node.id === nextNode.id ? nextNode : node))
    };
}
function clampEdgeOffset(offset, component, side) {
    const margin = 8 + INTERFACE_CROSS / 2;
    if (side === 'left' || side === 'right') {
        return clamp(offset, margin, Math.max(margin, component.height - margin));
    }
    return clamp(offset, margin, Math.max(margin, component.width - margin));
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

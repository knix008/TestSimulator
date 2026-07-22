import type React from 'react';
import type { EdgeAnchor, UmlNode } from '../../uml/editorModel.js';
import {
  assemblyConnectorPolyline,
  INTERFACE_GLYPH_RADIUS,
  INTERFACE_SOCKET_RADIUS,
  interfaceAttachmentSide,
  interfaceGlyphCenter,
  isInterfaceNode,
  isPairedInterface,
  pairedAssemblyLayout,
  pairedStemPathData
} from '../../uml/componentInterface.js';

type PointerHandlers = {
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGGElement>) => void;
  onClick: (event: React.MouseEvent<SVGGElement>) => void;
  onContextMenu: (event: React.MouseEvent<SVGGElement>) => void;
};

type InterfaceNodeRenderOptions = {
  node: UmlNode;
  className: string;
  side?: EdgeAnchor;
  /** Opposite end of a paired "연결" (used to orient ball/socket). */
  partnerNode?: UmlNode;
  pointerHandlers: PointerHandlers;
  onResizeStart: (event: React.PointerEvent<SVGGElement>) => void;
  withResizeHandle: (
    content: React.ReactNode,
    node: UmlNode,
    nodeHeight: number,
    onResizeStart: (event: React.PointerEvent<SVGGElement>) => void
  ) => React.ReactNode;
};

/** Stem tip stops just before the glyph so the ball/socket stays clean. */
function stemEndBeforeGlyph(attach: { x: number; y: number }, joint: { x: number; y: number }, gap: number) {
  const dx = joint.x - attach.x;
  const dy = joint.y - attach.y;
  const dist = Math.hypot(dx, dy) || 1;
  const shrink = Math.min(gap, Math.max(0, dist - 1));
  return {
    x: joint.x - (dx / dist) * shrink,
    y: joint.y - (dy / dist) * shrink
  };
}

/**
 * Socket semicircle at the joint.
 * `openToward` = provided/ball side; the cup sits on the required side (O) or (O by direction).
 */
function socketArcAtJoint(
  joint: { x: number; y: number },
  openToward: { x: number; y: number },
  radius: number
): string {
  const dx = openToward.x - joint.x;
  const dy = openToward.y - joint.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // Perpendicular; arc bulges opposite the opening (toward the required stem).
  const px = -uy;
  const py = ux;
  const start = { x: joint.x + px * radius, y: joint.y + py * radius };
  const end = { x: joint.x - px * radius, y: joint.y - py * radius };
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

/** Orthogonal elbow leaving the glyph (bend point is the ball / socket). */
function glyphElbowPath(cx: number, cy: number, elbow: { dx: number; dy: number } | undefined): string | undefined {
  if (!elbow || (Math.abs(elbow.dx) < 0.5 && Math.abs(elbow.dy) < 0.5)) {
    return undefined;
  }

  const endX = cx + elbow.dx;
  const endY = cy + elbow.dy;
  if (Math.abs(elbow.dx) >= 0.5 && Math.abs(elbow.dy) >= 0.5) {
    return `M ${cx} ${cy} L ${endX} ${cy} L ${endX} ${endY}`;
  }

  return `M ${cx} ${cy} L ${endX} ${endY}`;
}

/**
 * Ball then socket along provided→required (drawn once on the provided side).
 * Reads as stem → O → ) → stem; swapping roles yields stem → ( → O → stem from the other end.
 */
function pairedAssemblyGlyph(
  joint: { x: number; y: number },
  providedAttach: { x: number; y: number },
  requiredAttach: { x: number; y: number }
): React.ReactNode {
  const ballR = INTERFACE_GLYPH_RADIUS;
  const socketR = INTERFACE_SOCKET_RADIUS;
  const { ball, socket } = pairedAssemblyLayout(joint, providedAttach, requiredAttach);
  // Socket opens toward the ball so the sequence is circle then cup.
  const arc = socketArcAtJoint(socket, ball, socketR);
  return (
    <g className="paired-assembly-glyph">
      <circle className="provided-interface-ball" cx={ball.x} cy={ball.y} r={ballR} />
      <path className="required-interface-socket" d={arc} />
    </g>
  );
}

/** Provided interface (lollipop): stem + ball; paired draws ball+socket together. */
export function renderProvidedInterfaceNode({
  node,
  className,
  side: sideOption,
  partnerNode,
  pointerHandlers,
  onResizeStart,
  withResizeHandle
}: InterfaceNodeRenderOptions): React.ReactNode | undefined {
  if (node.kind !== 'providedInterface') {
    return undefined;
  }

  const r = INTERFACE_GLYPH_RADIUS;

  if (isPairedInterface(node)) {
    const attach = { x: node.stemAttachX, y: node.stemAttachY };
    const joint = { x: node.jointX, y: node.jointY };
    const requiredAttach = partnerNode && isPairedInterface(partnerNode)
      ? { x: partnerNode.stemAttachX, y: partnerNode.stemAttachY }
      : { x: joint.x * 2 - attach.x, y: joint.y * 2 - attach.y };
    const { ball } = pairedAssemblyLayout(joint, attach, requiredAttach);
    // Stem stops at the ball rim on the component side: …line → O → )…
    const tip = stemEndBeforeGlyph(attach, ball, INTERFACE_GLYPH_RADIUS);
    const stemPath = pairedStemPathData(attach, tip, node.pairRoute ?? 'straight');
    return withResizeHandle((
      <g className={`${className} provided-interface paired-interface`} {...pointerHandlers}>
        <rect className="node-hit-area" x={node.x - 8} y={node.y - 8} width={node.width + 16} height={node.height + 16} rx="6" />
        <path className="interface-stem" d={stemPath} />
        {pairedAssemblyGlyph(joint, attach, requiredAttach)}
      </g>
    ), node, node.height, onResizeStart);
  }

  const side = sideOption ?? interfaceAttachmentSide(node);
  const cx = node.width / 2;
  const cy = node.height / 2;

  let line: { x1: number; y1: number; x2: number; y2: number };
  let circle: { cx: number; cy: number };

  if (side === 'right') {
    const ex = node.width - r - 4;
    line = { x1: 0, y1: cy, x2: ex - r, y2: cy };
    circle = { cx: ex, cy };
  } else if (side === 'left') {
    const ex = r + 4;
    line = { x1: node.width, y1: cy, x2: ex + r, y2: cy };
    circle = { cx: ex, cy };
  } else if (side === 'bottom') {
    const ey = node.height - r - 4;
    line = { x1: cx, y1: 0, x2: cx, y2: ey - r };
    circle = { cx, cy: ey };
  } else {
    const ey = r + 4;
    line = { x1: cx, y1: node.height, x2: cx, y2: ey + r };
    circle = { cx, cy: ey };
  }

  const elbowPath = glyphElbowPath(circle.cx, circle.cy, node.interfaceElbow);

  return withResizeHandle((
    <g className={`${className} provided-interface`} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
      <rect className="node-hit-area" x="-8" y="-8" width={node.width + 16} height={node.height + 16} rx="6" />
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      <circle className="provided-interface-ball" cx={circle.cx} cy={circle.cy} r={r} />
      {elbowPath ? <path className="interface-elbow" d={elbowPath} /> : null}
    </g>
  ), node, node.height, onResizeStart);
}

/** Required interface (socket): stem + arc; paired draws stem only (glyph is on provided). */
export function renderRequiredInterfaceNode({
  node,
  className,
  side: sideOption,
  partnerNode,
  pointerHandlers,
  onResizeStart,
  withResizeHandle
}: InterfaceNodeRenderOptions): React.ReactNode | undefined {
  if (node.kind !== 'requiredInterface') {
    return undefined;
  }

  const r = INTERFACE_GLYPH_RADIUS;

  if (isPairedInterface(node)) {
    const attach = { x: node.stemAttachX, y: node.stemAttachY };
    const joint = { x: node.jointX, y: node.jointY };
    const providedAttach = partnerNode && isPairedInterface(partnerNode)
      ? { x: partnerNode.stemAttachX, y: partnerNode.stemAttachY }
      : { x: joint.x * 2 - attach.x, y: joint.y * 2 - attach.y };
    const { socket } = pairedAssemblyLayout(joint, providedAttach, attach);
    // Stem stops at the socket rim on the component side: …O → ) → line…
    const tip = stemEndBeforeGlyph(attach, socket, INTERFACE_SOCKET_RADIUS);
    const stemPath = pairedStemPathData(attach, tip, node.pairRoute ?? 'straight');
    return withResizeHandle((
      <g className={`${className} required-interface paired-interface`} {...pointerHandlers}>
        <rect className="node-hit-area" x={node.x - 8} y={node.y - 8} width={node.width + 16} height={node.height + 16} rx="6" />
        <path className="interface-stem" d={stemPath} />
      </g>
    ), node, node.height, onResizeStart);
  }

  const side = sideOption ?? interfaceAttachmentSide(node);
  const cx = node.width / 2;
  const cy = node.height / 2;

  let line: { x1: number; y1: number; x2: number; y2: number };
  let arc: string;

  if (side === 'right') {
    const sx = node.width - r - 4;
    line = { x1: 0, y1: cy, x2: sx - r, y2: cy };
    arc = `M ${sx} ${cy - r} A ${r} ${r} 0 0 0 ${sx} ${cy + r}`;
  } else if (side === 'left') {
    const sx = r + 4;
    line = { x1: node.width, y1: cy, x2: sx + r, y2: cy };
    arc = `M ${sx} ${cy - r} A ${r} ${r} 0 0 1 ${sx} ${cy + r}`;
  } else if (side === 'bottom') {
    const sy = node.height - r - 4;
    line = { x1: cx, y1: 0, x2: cx, y2: sy - r };
    arc = `M ${cx - r} ${sy} A ${r} ${r} 0 0 1 ${cx + r} ${sy}`;
  } else {
    const sy = r + 4;
    line = { x1: cx, y1: node.height, x2: cx, y2: sy + r };
    arc = `M ${cx - r} ${sy} A ${r} ${r} 0 0 0 ${cx + r} ${sy}`;
  }

  const elbowPath = glyphElbowPath(
    side === 'left' || side === 'right' ? (side === 'right' ? node.width - r - 4 : r + 4) : cx,
    side === 'top' || side === 'bottom' ? (side === 'bottom' ? node.height - r - 4 : r + 4) : cy,
    node.interfaceElbow
  );

  return withResizeHandle((
    <g className={`${className} required-interface`} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
      <rect className="node-hit-area" x="-8" y="-8" width={node.width + 16} height={node.height + 16} rx="6" />
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      <path className="required-interface-socket" d={arc} />
      {elbowPath ? <path className="interface-elbow" d={elbowPath} /> : null}
    </g>
  ), node, node.height, onResizeStart);
}

export type AssemblyEndpoints = {
  source: { x: number; y: number };
  target: { x: number; y: number };
  /** When glyphs nearly touch, hide the link line so PI/RI shapes stay clean. */
  showLink: boolean;
  /** Orthogonal polyline with bend corners at ball and socket. */
  points: Array<{ x: number; y: number }>;
};

/**
 * Assembly connector endpoints between a provided and a required interface.
 * Does not alter either interface shape — only describes the separate link.
 */
export function assemblyConnectorEndpoints(
  source: UmlNode,
  target: UmlNode,
  elbow?: { dx: number; dy: number }
): AssemblyEndpoints | undefined {
  if (!isInterfaceNode(source) || !isInterfaceNode(target) || source.kind === target.kind) {
    return undefined;
  }

  // Paired interfaces already share a joint — no separate assembly segment.
  if (isPairedInterface(source) && isPairedInterface(target) && source.interfacePartnerId === target.id) {
    const joint = interfaceGlyphCenter(source);
    return { source: joint, target: joint, showLink: false, points: [joint, joint] };
  }

  const points = assemblyConnectorPolyline(source, target, elbow);
  if (!points || points.length < 2) {
    return undefined;
  }

  const from = points[0];
  const to = points[points.length - 1];
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const r = INTERFACE_GLYPH_RADIUS;

  if (dist <= r * 2 + 4) {
    return { source: from, target: to, showLink: false, points };
  }

  return {
    source: from,
    target: to,
    showLink: true,
    points
  };
}

export function assemblyConnectorPathData(
  source: UmlNode,
  target: UmlNode,
  elbow?: { dx: number; dy: number }
): string | undefined {
  const assembly = assemblyConnectorEndpoints(source, target, elbow);
  if (!assembly || !assembly.showLink) {
    return undefined;
  }

  const [start, ...rest] = assembly.points;
  return `M ${start.x} ${start.y}${rest.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

export { interfaceGlyphCenter };

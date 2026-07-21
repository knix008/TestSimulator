import type React from 'react';
import type { EdgeAnchor, UmlNode } from '../../uml/editorModel.js';
import { INTERFACE_GLYPH_RADIUS, interfaceAttachmentSide, interfaceGlyphCenter, isInterfaceNode } from '../../uml/componentInterface.js';

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
  pointerHandlers: PointerHandlers;
  onResizeStart: (event: React.PointerEvent<SVGGElement>) => void;
  withResizeHandle: (
    content: React.ReactNode,
    node: UmlNode,
    nodeHeight: number,
    onResizeStart: (event: React.PointerEvent<SVGGElement>) => void
  ) => React.ReactNode;
};

/** Provided interface (lollipop): stem + ball only. Independent of required / assembly. */
export function renderProvidedInterfaceNode({
  node,
  className,
  side: sideOption,
  pointerHandlers,
  onResizeStart,
  withResizeHandle
}: InterfaceNodeRenderOptions): React.ReactNode | undefined {
  if (node.kind !== 'providedInterface') {
    return undefined;
  }

  const side = sideOption ?? interfaceAttachmentSide(node);
  const cx = node.width / 2;
  const cy = node.height / 2;
  const r = INTERFACE_GLYPH_RADIUS;

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

  return withResizeHandle((
    <g className={`${className} provided-interface`} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
      <rect className="node-hit-area" x="-8" y="-8" width={node.width + 16} height={node.height + 16} rx="6" />
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      <circle cx={circle.cx} cy={circle.cy} r={r} />
    </g>
  ), node, node.height, onResizeStart);
}

/** Required interface (socket): stem + arc only. Independent of provided / assembly. */
export function renderRequiredInterfaceNode({
  node,
  className,
  side: sideOption,
  pointerHandlers,
  onResizeStart,
  withResizeHandle
}: InterfaceNodeRenderOptions): React.ReactNode | undefined {
  if (node.kind !== 'requiredInterface') {
    return undefined;
  }

  const side = sideOption ?? interfaceAttachmentSide(node);
  const cx = node.width / 2;
  const cy = node.height / 2;
  const r = INTERFACE_GLYPH_RADIUS;

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

  return withResizeHandle((
    <g className={`${className} required-interface`} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
      <rect className="node-hit-area" x="-8" y="-8" width={node.width + 16} height={node.height + 16} rx="6" />
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      <path className="required-interface-socket" d={arc} />
    </g>
  ), node, node.height, onResizeStart);
}

export type AssemblyEndpoints = {
  source: { x: number; y: number };
  target: { x: number; y: number };
  /** When glyphs nearly touch, hide the link line so PI/RI shapes stay clean. */
  showLink: boolean;
};

/**
 * Assembly connector endpoints between a provided and a required interface.
 * Does not alter either interface shape — only describes the separate link.
 */
export function assemblyConnectorEndpoints(source: UmlNode, target: UmlNode): AssemblyEndpoints | undefined {
  if (!isInterfaceNode(source) || !isInterfaceNode(target) || source.kind === target.kind) {
    return undefined;
  }

  const from = interfaceGlyphCenter(source);
  const to = interfaceGlyphCenter(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const r = INTERFACE_GLYPH_RADIUS;

  if (dist < 1) {
    return { source: from, target: to, showLink: false };
  }

  // Stop the link at the ball / socket rim so it does not cut through glyphs.
  const shrink = Math.min(r + 1, dist / 2 - 0.5);
  if (shrink <= 0 || dist <= r * 2 + 4) {
    return { source: from, target: to, showLink: false };
  }

  const ux = dx / dist;
  const uy = dy / dist;

  return {
    source: { x: from.x + ux * shrink, y: from.y + uy * shrink },
    target: { x: to.x - ux * shrink, y: to.y - uy * shrink },
    showLink: true
  };
}

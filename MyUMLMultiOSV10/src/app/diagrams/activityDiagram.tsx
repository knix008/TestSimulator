import type React from 'react';
import type { UmlNode } from '../../uml/editorModel.js';

interface ActivityNodeRenderOptions {
  node: UmlNode;
  className: string;
  title: string;
  pointerHandlers: {
    onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
    onPointerMove: (event: React.PointerEvent<SVGElement>) => void;
    onPointerUp: (event: React.PointerEvent<SVGGElement>) => void;
    onClick: (event: React.MouseEvent<SVGGElement>) => void;
    onContextMenu: (event: React.MouseEvent<SVGGElement>) => void;
  };
}

export function renderActivityDiagramNode({ node, className, title, pointerHandlers }: ActivityNodeRenderOptions): React.ReactNode | undefined {
  if (node.kind === 'initialNode') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx={node.width / 2} cy={node.height / 2} r={Math.min(node.width, node.height) / 2 - 8} className="filled" />
      </g>
    );
  }

  if (node.kind === 'finalNode') {
    const radius = Math.min(node.width, node.height) / 2 - 8;

    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx={node.width / 2} cy={node.height / 2} r={radius} />
        <circle cx={node.width / 2} cy={node.height / 2} r={Math.max(5, radius - 8)} className="filled" />
      </g>
    );
  }

  if (node.kind === 'flowFinalNode') {
    const radius = Math.min(node.width, node.height) / 2 - 8;
    const centerX = node.width / 2;
    const centerY = node.height / 2;
    const mark = radius * 0.58;

    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <circle cx={centerX} cy={centerY} r={radius} />
        <path className="activity-flow-final" d={`M ${centerX - mark} ${centerY - mark} L ${centerX + mark} ${centerY + mark} M ${centerX + mark} ${centerY - mark} L ${centerX - mark} ${centerY + mark}`} />
      </g>
    );
  }

  if (node.kind === 'action') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height={node.height} rx="16" />
        <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">{title}</text>
      </g>
    );
  }

  if (node.kind === 'objectNode') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect width={node.width} height={node.height} rx="2" />
        <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">{title}</text>
      </g>
    );
  }

  if (node.kind === 'decisionNode' || node.kind === 'mergeNode') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <path d={`M ${node.width / 2} 2 L ${node.width - 2} ${node.height / 2} L ${node.width / 2} ${node.height - 2} L 2 ${node.height / 2} Z`} />
      </g>
    );
  }

  if (node.kind === 'forkNode' || node.kind === 'joinNode') {
    const width = Math.max(node.width, node.height);
    const height = Math.min(node.width, node.height);
    const x = (node.width - width) / 2;
    const y = (node.height - height) / 2;

    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="activity-bar-node" x={x} y={y} width={width} height={height} rx="2" />
      </g>
    );
  }

  return undefined;
}
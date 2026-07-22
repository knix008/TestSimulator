import type React from 'react';
import type { UmlNode } from '../../uml/editorModel.js';

interface UseCaseNodeRenderOptions {
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
  onResizeStart: (event: React.PointerEvent<SVGGElement>) => void;
}

export function renderUseCaseDiagramNode({ node, className, title, pointerHandlers, onResizeStart }: UseCaseNodeRenderOptions): React.ReactNode | undefined {
  if (node.kind === 'useCase') {
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <ellipse cx={node.width / 2} cy={node.height / 2} rx={node.width / 2} ry={node.height / 2} />
        <text x={node.width / 2} y={node.height / 2 + 5} textAnchor="middle">{title}</text>
      </g>
    );
  }

  if (node.kind === 'actor') {
    const scaleX = node.width / 88;
    const scaleY = node.height / 132;

    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        {/* Full-box hit target so actors are easy to select and connect */}
        <rect className="node-hit-area" x="0" y="0" width={node.width} height={node.height} rx="4" />
        <g className="actor-figure" transform={`scale(${scaleX} ${scaleY})`}>
          <circle cx="44" cy="18" r="13" />
          <path d="M44 31 V68 M18 44 H70 M44 68 L22 104 M44 68 L66 104" />
        </g>
        <text x={node.width / 2} y={node.height - 4} textAnchor="middle">{title}</text>
      </g>
    );
  }

  if (node.kind === 'subject') {
    const titleWidth = Math.min(node.width - 8, Math.max(72, title.length * 8 + 24));
    return (
      <g className={className} transform={`translate(${node.x} ${node.y})`} {...pointerHandlers}>
        <rect className="group-frame-hit" width={node.width} height={node.height} rx="2" />
        <rect className="subject-boundary" width={node.width} height={node.height} rx="2" />
        <rect className="group-title-hit" x="4" y="4" width={titleWidth} height="28" rx="2" />
        <text className="group-title" x="12" y="24" textAnchor="start">{title}</text>
        <g className="resize-handle" transform={`translate(${node.width - 16} ${node.height - 16})`} onPointerDown={onResizeStart}>
          <rect width="16" height="16" rx="2" />
          <path d="M5 12 L12 5 M9 12 L12 9" />
        </g>
      </g>
    );
  }

  return undefined;
}

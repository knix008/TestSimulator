import type { DependencyType } from '../utils/dependencyLineRenderer';
import {
  buildOrthogonalPath,
  pointsToPath,
  type BarAnchors,
} from '../utils/dependencyLineRenderer';

const PREVIEW_WIDTH = 72;
const PREVIEW_HEIGHT = 20;
const PREVIEW_BAR_COLOR = 'rgba(148, 163, 184, 0.85)';
const PREVIEW_LINE_COLOR = '#cbd5e1';

interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getPreviewLayout(type: DependencyType): {
  pred: PreviewRect;
  succ: PreviewRect;
  from: BarAnchors;
  to: BarAnchors;
} {
  const barH = 4;
  const padX = 2;
  const innerW = PREVIEW_WIDTH - padX * 2;
  const topY = PREVIEW_HEIGHT / 4 - barH / 2;
  const bottomY = (PREVIEW_HEIGHT * 3) / 4 - barH / 2;

  let pred: PreviewRect = { x: padX, y: topY, w: (innerW * 2) / 5, h: barH };
  let succ: PreviewRect = {
    x: padX + (innerW * 2) / 5,
    y: bottomY,
    w: (innerW * 2) / 5,
    h: barH,
  };

  if (type === 'SS' || type === 'SF') {
    pred = { x: padX + innerW / 4, y: topY, w: (innerW * 2) / 5, h: barH };
  }
  if (type === 'FF' || type === 'SF') {
    succ = { x: padX + innerW / 3, y: bottomY, w: (innerW * 3) / 5, h: barH };
  } else if (type === 'SS') {
    succ = { x: padX, y: bottomY, w: (innerW * 2) / 5, h: barH };
  }

  const fromY = pred.y + pred.h / 2;
  const toY = succ.y + succ.h / 2;

  const from: BarAnchors = {
    left: { x: pred.x, y: fromY },
    right: { x: pred.x + pred.w, y: fromY },
    center: { x: pred.x + pred.w / 2, y: fromY },
  };
  const to: BarAnchors = {
    left: { x: succ.x, y: toY },
    right: { x: succ.x + succ.w, y: toY },
    center: { x: succ.x + succ.w / 2, y: toY },
  };

  return { pred, succ, from, to };
}

function arrowHeadPoints(fromX: number, fromY: number, toX: number, toY: number, size: number): string {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const a1 = angle + Math.PI * 0.75;
  const a2 = angle - Math.PI * 0.75;
  const x1 = toX + size * Math.cos(a1);
  const y1 = toY + size * Math.sin(a1);
  const x2 = toX + size * Math.cos(a2);
  const y2 = toY + size * Math.sin(a2);
  return `${x1},${y1} ${toX},${toY} ${x2},${y2}`;
}

interface DependencyTypePreviewProps {
  type: DependencyType;
  className?: string;
}

export function DependencyTypePreview({ type, className }: DependencyTypePreviewProps) {
  const { pred, succ, from, to } = getPreviewLayout(type);
  const points = buildOrthogonalPath(type, from, to, { fs: 3, other: 4 });
  const pathData = pointsToPath(points);
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];

  return (
    <svg
      className={className}
      viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      aria-hidden="true"
    >
      <rect x={pred.x} y={pred.y} width={pred.w} height={pred.h} fill={PREVIEW_BAR_COLOR} rx="0.5" />
      <rect x={succ.x} y={succ.y} width={succ.w} height={succ.h} fill={PREVIEW_BAR_COLOR} rx="0.5" />
      {pathData ? (
        <>
          <path
            d={pathData}
            fill="none"
            stroke={PREVIEW_LINE_COLOR}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {tip && prev ? (
            <polygon
              points={arrowHeadPoints(prev.x, prev.y, tip.x, tip.y, 3.5)}
              fill={PREVIEW_LINE_COLOR}
            />
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

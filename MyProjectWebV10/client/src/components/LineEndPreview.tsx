import type { GanttViewSettings } from '../types/project';

const PREVIEW_WIDTH = 72;
const PREVIEW_HEIGHT = 20;
const PREVIEW_LINE_COLOR = '#cbd5e1';
const PAD = 6;

type LineEndStyle = GanttViewSettings['startLineEnd'];

interface LineEndPreviewProps {
  style: LineEndStyle;
  atStart: boolean;
  className?: string;
}

function lineAngle(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toY - fromY, toX - fromX);
}

function arrowHeadPoints(fromX: number, fromY: number, toX: number, toY: number, size: number): string {
  const angle = lineAngle(fromX, fromY, toX, toY);
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  const x1 = toX + size * Math.cos(a1);
  const y1 = toY + size * Math.sin(a1);
  const x2 = toX + size * Math.cos(a2);
  const y2 = toY + size * Math.sin(a2);
  return `${x1},${y1} ${toX},${toY} ${x2},${y2}`;
}

function LineEndDecoration({
  style,
  fromX,
  fromY,
  toX,
  toY,
}: {
  style: Exclude<LineEndStyle, 'None'>;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}) {
  const size = 7;

  if (style === 'Dot') {
    return <circle cx={toX} cy={toY} r={size / 2.5} fill={PREVIEW_LINE_COLOR} />;
  }

  if (style === 'Square') {
    const angle = lineAngle(fromX, fromY, toX, toY);
    const half = size / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const points = [
      { x: toX, y: toY },
      { x: toX - half * cos + half * sin, y: toY - half * sin - half * cos },
      { x: toX - size * cos, y: toY - size * sin },
      { x: toX - half * cos - half * sin, y: toY - half * sin + half * cos },
    ];
    return (
      <polygon
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        fill={PREVIEW_LINE_COLOR}
      />
    );
  }

  if (style === 'OpenArrow') {
    const points = arrowHeadPoints(fromX, fromY, toX, toY, size);
    const [p1, tip, p2] = points.split(' ');
    return (
      <polyline
        points={`${p1} ${tip} ${p2}`}
        fill="none"
        stroke={PREVIEW_LINE_COLOR}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  return (
    <polygon points={arrowHeadPoints(fromX, fromY, toX, toY, size)} fill={PREVIEW_LINE_COLOR} />
  );
}

export function LineEndPreview({ style, atStart, className }: LineEndPreviewProps) {
  const y = PREVIEW_HEIGHT / 2;
  const lineStartX = PAD;
  const lineEndX = PREVIEW_WIDTH - PAD;

  const decorationFrom = atStart
    ? { x: lineStartX + 8, y }
    : { x: lineEndX - 8, y };
  const decorationTo = atStart ? { x: lineStartX, y } : { x: lineEndX, y };

  return (
    <svg
      className={className}
      viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      aria-hidden="true"
    >
      <line
        x1={lineStartX}
        y1={y}
        x2={lineEndX}
        y2={y}
        stroke={PREVIEW_LINE_COLOR}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {style !== 'None' ? (
        <LineEndDecoration
          style={style}
          fromX={decorationFrom.x}
          fromY={decorationFrom.y}
          toX={decorationTo.x}
          toY={decorationTo.y}
        />
      ) : null}
    </svg>
  );
}

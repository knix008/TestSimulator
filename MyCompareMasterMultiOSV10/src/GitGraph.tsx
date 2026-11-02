/**
 * One row of the history graph, drawn.
 *
 * `core/gitGraph.ts` has already worked out which lane each commit sits in and
 * which lines cross each row; this only turns that into strokes. Each row is its
 * own little SVG of exactly the row's height, so the graph scrolls with the list
 * and needs no measuring — a single tall SVG behind a virtualised list would have
 * to be kept in step with it, and would drift.
 *
 * A line that changes lane is drawn as a curve rather than a dog-leg, which is what
 * makes a merge read as two lines coming together instead of two lines meeting a
 * corner.
 */
import type { GraphRow } from "../core/gitGraph.js";

/** Horizontal distance between lanes, and the row's height. */
const LANE = 14;
const HEIGHT = 24;
const RADIUS = 3.5;

/** Lane colours, so neighbouring branches are told apart at a glance. */
const COLORS = [
  "var(--accent)",
  "var(--added-accent)",
  "var(--modified-accent)",
  "var(--conflict-accent)",
  "var(--removed-accent)",
  "var(--resolved-accent)",
];

export function GitGraph({ row, lanes }: { row: GraphRow; lanes: number }) {
  const width = Math.max(1, lanes) * LANE;
  const x = (lane: number) => lane * LANE + LANE / 2;
  const colorOf = (lane: number) => COLORS[lane % COLORS.length];

  return (
    <svg
      className="git-graph"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      {row.edges.map((edge, index) => {
        const from = x(edge.from);
        const to = x(edge.to);
        if (from === to) {
          return (
            <line
              key={index}
              x1={from}
              y1={0}
              x2={from}
              y2={HEIGHT}
              stroke={colorOf(edge.from)}
              strokeWidth={1.6}
            />
          );
        }
        // A merge: out of the commit's lane at the top, into its parent's at the
        // bottom, curving through the middle of the row.
        return (
          <path
            key={index}
            d={`M${from} ${HEIGHT / 2} C ${from} ${HEIGHT * 0.8}, ${to} ${HEIGHT * 0.2}, ${to} ${HEIGHT}`}
            stroke={colorOf(edge.to)}
            strokeWidth={1.6}
            fill="none"
          />
        );
      })}

      {/* The commit itself. A merge is drawn hollow, so the shape of the history
          can be read without following every line. */}
      <circle
        cx={x(row.lane)}
        cy={HEIGHT / 2}
        r={RADIUS}
        fill={row.merge ? "var(--panel)" : colorOf(row.lane)}
        stroke={colorOf(row.lane)}
        strokeWidth={row.merge ? 2 : 1}
      />
    </svg>
  );
}

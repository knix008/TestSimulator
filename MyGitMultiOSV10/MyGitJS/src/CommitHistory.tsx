import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { CommitInfo } from "./api";
import { buildFlat, buildGraph, type GraphRow } from "./graph";

const PALETTE = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"];
const ROW = 24;
const HEAD = 28;
const LANE = 16;
const OVERSCAN = 8;
const COLUMN_MAX = 960;
const COLUMN_WIDTH = { message: 240, sha: 84, author: 140, date: 104 };
const COLUMN_MIN = { message: 80, sha: 56, author: 64, date: 80 };

type HistoryColumn = keyof typeof COLUMN_WIDTH;

function xOf(lane: number): number {
  return 12 + lane * LANE + LANE / 2;
}

const CommitHistoryView = memo(function CommitHistoryView(props: {
  commits: CommitInfo[];
  flat: boolean;
  selected: string | null;
  query: string;
  labels: { graph: string; message: string; sha: string; author: string; date: string };
  onSelect: (sha: string) => void;
  onContext?: (event: ReactMouseEvent, commit: CommitInfo) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(480);
  const [widths, setWidths] = useState(COLUMN_WIDTH);
  const filtered = useMemo(() => {
    const q = props.query.trim().toLowerCase();
    if (!q) return props.commits;
    return props.commits.filter((commit) => commit.subject.toLowerCase().includes(q)
      || commit.authorName.toLowerCase().includes(q)
      || commit.sha.toLowerCase().startsWith(q));
  }, [props.commits, props.query]);
  const graph = useMemo(() => {
    const rows = props.flat ? buildFlat(filtered) : buildGraph(filtered);
    return new Map(rows.map((row) => [row.sha, row]));
  }, [filtered, props.flat]);
  const maxLane = Math.max(0, ...[...graph.values()].map((row) => Math.max(row.lane, ...row.passThrough, ...row.forks, ...row.merges)));
  const graphWidth = Math.max(56, 20 + (maxLane + 1) * LANE);
  const columns = `${graphWidth}px ${widths.message}px ${widths.sha}px ${widths.author}px ${widths.date}px`;
  const tableWidth = graphWidth + widths.message + widths.sha + widths.author + widths.date;
  const start = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const end = Math.min(filtered.length, Math.ceil((scrollTop + Math.max(0, viewport - HEAD)) / ROW) + OVERSCAN);
  const visible = filtered.slice(start, end);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setViewport(node.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = 0;
    setScrollTop(0);
  }, [props.query]);

  useLayoutEffect(() => {
    if (fitted.current) return;
    const node = scroller.current;
    if (!node || node.clientWidth < 200) return;
    const available = node.clientWidth - graphWidth - widths.sha - widths.author - widths.date;
    fitted.current = true;
    if (available <= COLUMN_MIN.message) return;
    setWidths((current) => ({ ...current, message: Math.round(Math.min(COLUMN_MAX, available)) }));
  }, [graphWidth, widths.author, widths.date, widths.sha]);

  const resize = (event: ReactMouseEvent, column: HistoryColumn) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[column];
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent) => {
      const next = Math.min(COLUMN_MAX, Math.max(COLUMN_MIN[column], Math.round(startWidth + ev.clientX - startX)));
      setWidths((current) => current[column] === next ? current : { ...current, [column]: next });
    };
    const up = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="history">
      <div className="scroll" ref={scroller} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div style={{ width: `max(100%, ${tableWidth}px)` }}>
        <div className="commit-head" style={{ gridTemplateColumns: columns }}>
          <span>{props.labels.graph}</span>
          <ColumnHeading label={props.labels.message} onResize={(event) => resize(event, "message")} />
          <ColumnHeading label={props.labels.sha} onResize={(event) => resize(event, "sha")} />
          <ColumnHeading label={props.labels.author} onResize={(event) => resize(event, "author")} />
          <ColumnHeading label={props.labels.date} onResize={(event) => resize(event, "date")} />
        </div>
        <div style={{ height: filtered.length * ROW, position: "relative" }}>
          {visible.map((commit, index) => {
            const row = graph.get(commit.sha)!;
            const offset = start + index;
            return (
              <div
                key={commit.sha}
                className={props.selected === commit.sha ? "commit-row selected" : offset % 2 === 1 ? "commit-row alt" : "commit-row"}
                style={{ gridTemplateColumns: columns, position: "absolute", top: offset * ROW, left: 0, right: 0 }}
                onClick={() => props.onSelect(commit.sha)}
                onContextMenu={(event) => props.onContext?.(event, commit)}
              >
                <Graph row={row} width={graphWidth} />
                <span title={commit.subject}>
                  {commit.refs.length > 0 && (
                    <span className="refs">
                      {commit.refs.slice(0, 3).map((ref) => <em className="ref" key={ref}>{ref.replace("HEAD -> ", "")}</em>)}
                    </span>
                  )}
                  {commit.subject}
                </span>
                <span className="meta">{commit.sha.slice(0, 7)}</span>
                <span className="meta" title={commit.authorEmail}>{commit.authorName}</span>
                <span className="meta">{commit.date.slice(0, 10)}</span>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => prev.commits === next.commits && prev.flat === next.flat && prev.selected === next.selected && prev.query === next.query
  && prev.labels.graph === next.labels.graph && prev.labels.message === next.labels.message && prev.labels.sha === next.labels.sha
  && prev.labels.author === next.labels.author && prev.labels.date === next.labels.date);

function ColumnHeading(props: { label: string; onResize: (event: ReactMouseEvent) => void }) {
  return (
    <span className="commit-col">
      {props.label}
      <i className="col-grip" role="separator" aria-orientation="vertical" aria-label={props.label} onMouseDown={props.onResize} />
    </span>
  );
}

export function CommitHistory(props: {
  commits: CommitInfo[];
  flat: boolean;
  selected: string | null;
  query: string;
  labels: { graph: string; message: string; sha: string; author: string; date: string };
  onSelect: (sha: string) => void;
  onContext?: (event: ReactMouseEvent, commit: CommitInfo) => void;
}) {
  const contextRef = useRef(props.onContext);
  const selectRef = useRef(props.onSelect);
  contextRef.current = props.onContext;
  selectRef.current = props.onSelect;
  const onContext = useCallback((event: ReactMouseEvent, commit: CommitInfo) => contextRef.current?.(event, commit), []);
  const onSelect = useCallback((sha: string) => selectRef.current(sha), []);
  return <CommitHistoryView {...props} onContext={onContext} onSelect={onSelect} />;
}

function Graph({ row, width }: { row: GraphRow; width: number }) {
  const mid = ROW / 2;
  const color = (lane: number) => PALETTE[lane % PALETTE.length];
  return (
    <svg width={width} height={ROW} aria-hidden="true">
      <line x1={xOf(row.lane)} y1={0} x2={xOf(row.lane)} y2={mid} stroke={color(row.lane)} strokeWidth={1.8} />
      {row.continuesDown && <line x1={xOf(row.lane)} y1={mid} x2={xOf(row.lane)} y2={ROW} stroke={color(row.lane)} strokeWidth={1.8} />}
      {row.passThrough.map((lane) => <line key={`p${lane}`} x1={xOf(lane)} y1={0} x2={xOf(lane)} y2={ROW} stroke={color(lane)} strokeWidth={1.6} />)}
      {row.forks.map((lane) => <line key={`f${lane}`} x1={xOf(row.lane)} y1={mid} x2={xOf(lane)} y2={ROW} stroke={color(lane)} strokeWidth={1.6} />)}
      {row.merges.map((lane) => <line key={`m${lane}`} x1={xOf(lane)} y1={0} x2={xOf(row.lane)} y2={mid} stroke={color(lane)} strokeWidth={1.6} />)}
      <circle cx={xOf(row.lane)} cy={mid} r={4} fill={color(row.lane)} />
    </svg>
  );
}

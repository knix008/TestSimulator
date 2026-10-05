import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CharSpan, DiffLineKind } from "../core/lineDiff";
import type { HexRow } from "../core/binary";
import { api, type SessionSummary, type TextRow } from "./api";
import { OverviewBar } from "./OverviewBar";
import type { Settings } from "./api";
import { versionText, type Translate } from "./i18n";

export type DiffPanesHandle = {
  /** Walks to the previous (-1) or next (+1) run of differences. */
  goToDiff: (delta: number) => void;
  scrollToRow: (row: number) => void;
  copySide: (side: "left" | "right") => Promise<string>;
};

type Props = {
  summary: SessionSummary;
  settings: Settings;
  t: Translate;
  onError: (error: unknown) => void;
};

/** Rows fetched per request. */
const WINDOW = 400;
/** Word wrap needs every row's text up front, so it is limited to this many rows. */
const WRAP_ROW_LIMIT = 20_000;
const OVERSCAN = 12;

export const DiffPanes = forwardRef<DiffPanesHandle, Props>(function DiffPanes(
  { summary, settings, t, onError },
  ref,
) {
  const binary = summary.mode === "binary";
  const wrapAllowed = !binary && settings.wordWrap && summary.rowCount <= WRAP_ROW_LIMIT;

  const rows = useRowCache(summary, wrapAllowed, onError);
  const rowHeight = Math.max(15, Math.round(settings.paneFontSize * 1.55));
  const charWidth = useCharWidth(settings.paneFontSize);

  const leftScroll = useRef<HTMLDivElement | null>(null);
  const rightScroll = useRef<HTMLDivElement | null>(null);
  const syncing = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ height: 400, width: 600 });
  const blockRef = useRef(-1);

  // Wrapped rows can only be laid out once every line is known, so the panes stay
  // unwrapped (and virtualized by a uniform row height) until the document is loaded.
  const wrapReady = wrapAllowed && rows.complete;
  const columns = Math.max(20, Math.floor((viewport.width - 12) / charWidth));
  const layout = useMemo(
    () => buildLayout(summary.rowCount, rowHeight, wrapReady ? { rows, columns } : null),
    [summary.rowCount, rowHeight, wrapReady, rows, columns],
  );

  const firstVisible = findRow(layout, scrollTop);
  const lastVisible = findRow(layout, scrollTop + viewport.height);
  const from = Math.max(0, firstVisible - OVERSCAN);
  const to = Math.min(summary.rowCount, lastVisible + OVERSCAN + 1);

  useEffect(() => {
    rows.ensure(from, to);
  }, [rows, from, to]);

  useEffect(() => {
    blockRef.current = -1;
    setScrollTop(0);
    if (leftScroll.current) leftScroll.current.scrollTop = 0;
    if (rightScroll.current) rightScroll.current.scrollTop = 0;
  }, [summary.id]);

  useLayoutEffect(() => {
    const element = leftScroll.current;
    if (!element) return;
    const measure = () => setViewport({ height: element.clientHeight, width: element.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scrollTo = useCallback((offset: number) => {
    const target = Math.max(0, offset);
    for (const element of [leftScroll.current, rightScroll.current]) {
      if (element) element.scrollTop = target;
    }
    setScrollTop(target);
  }, []);

  const scrollToRow = useCallback((row: number) => {
    const clamped = Math.min(Math.max(row, 0), Math.max(0, summary.rowCount - 1));
    scrollTo(Math.max(0, offsetOf(layout, clamped) - Math.floor(viewport.height / 3)));
  }, [layout, scrollTo, summary.rowCount, viewport.height]);

  useImperativeHandle(ref, () => ({
    goToDiff: (delta: number) => {
      const blocks = summary.blocks;
      if (blocks.length === 0) return;
      const current = firstVisible + 1;
      let index: number;
      if (delta > 0) {
        index = blocks.findIndex((row) => row > current);
        if (index < 0) index = 0;
      } else {
        const previous = [...blocks].reverse().find((row) => row < firstVisible);
        index = previous === undefined ? blocks.length - 1 : blocks.indexOf(previous);
      }
      blockRef.current = index;
      scrollToRow(blocks[index]);
    },
    scrollToRow,
    copySide: async (side) => {
      const response = await api.sideText(side, from, Math.min(to - from, 2000));
      return response.text;
    },
  }), [summary.blocks, firstVisible, scrollToRow, from, to]);

  const handleScroll = (which: "left" | "right") => (event: React.UIEvent<HTMLDivElement>) => {
    if (syncing.current) {
      syncing.current = false;
      return;
    }
    const source = event.currentTarget;
    const other = which === "left" ? rightScroll.current : leftScroll.current;
    if (other && other.scrollTop !== source.scrollTop) {
      syncing.current = true;
      other.scrollTop = source.scrollTop;
    }
    setScrollTop(source.scrollTop);
  };

  const visible: number[] = [];
  for (let index = from; index < to; index++) visible.push(index);

  const contentWidth = wrapReady ? 0 : Math.max(viewport.width, Math.ceil(rows.widest * charWidth) + 24);
  const paneProps = {
    rows,
    visible,
    layout,
    rowHeight,
    settings,
    wrap: wrapReady,
    binary,
    contentWidth,
    scrollTop,
    summary,
  };

  return (
    <div className="diff-panes" data-wrap={wrapReady ? "on" : "off"}>
      <Pane
        {...paneProps}
        side="left"
        info={summary.left}
        version={versionText(summary.left.version, settings.language)}
        header={settings.leftHeaderColor}
        scrollRef={leftScroll}
        onScroll={handleScroll("left")}
        onJump={scrollTo}
        viewportHeight={viewport.height}
        t={t}
      />
      <Pane
        {...paneProps}
        side="right"
        info={summary.right}
        version={versionText(summary.right.version, settings.language)}
        header={settings.rightHeaderColor}
        scrollRef={rightScroll}
        onScroll={handleScroll("right")}
        onJump={scrollTo}
        viewportHeight={viewport.height}
        t={t}
      />
    </div>
  );
});

type PaneProps = {
  side: "left" | "right";
  info: SessionSummary["left"];
  /** Localized version badge shown in the pane title. */
  version: string;
  header: string;
  rows: RowCache;
  visible: number[];
  layout: Layout;
  rowHeight: number;
  settings: Settings;
  wrap: boolean;
  binary: boolean;
  contentWidth: number;
  scrollTop: number;
  viewportHeight: number;
  summary: SessionSummary;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  onJump: (offset: number) => void;
  t: Translate;
};

function Pane(props: PaneProps) {
  const { side, rows, visible, layout, rowHeight, settings, wrap, binary, contentWidth, scrollTop, summary } = props;
  const gutterWidth = binary ? 0 : Math.max(44, String(Math.max(summary.left.lines, summary.right.lines)).length * 9 + 22);

  return (
    <section className="pane">
      <header
        className="pane-header"
        style={{ background: props.header, color: headerText(props.header) }}
        title={`${props.info.label}${props.info.version ? `\n${props.info.version}` : ""}`}
      >
        <span className="pane-side">{side === "left" ? props.t("paneLeft") : props.t("paneRight")}</span>
        <span className="pane-label">{baseName(props.info.label)}</span>
        {props.info.version && <span className="pane-version">{props.version}</span>}
        <span className="pane-lines">{props.info.lines.toLocaleString()} {props.t("statusRows")}</span>
      </header>
      <div className="pane-body">
        {!binary && (
          <div className="pane-gutter" style={{ width: gutterWidth, fontSize: settings.paneFontSize }}>
            {visible.map((index) => {
              const row = rows.get(index);
              const number = row && !isHex(row) ? (side === "left" ? row.leftNo : row.rightNo) : null;
              return (
                <div
                  key={index}
                  className="gutter-row"
                  style={{ top: offsetOf(layout, index) - scrollTop, height: heightOf(layout, index) }}
                >
                  {number ?? ""}
                </div>
              );
            })}
          </div>
        )}
        <div className="pane-scroll" ref={props.scrollRef} onScroll={props.onScroll}>
          <div
            className="pane-canvas"
            style={{
              height: layout.total,
              width: contentWidth || undefined,
              fontSize: settings.paneFontSize,
              lineHeight: `${rowHeight}px`,
            }}
          >
            {visible.map((index) => {
              const row = rows.get(index);
              const top = offsetOf(layout, index);
              const height = heightOf(layout, index);
              if (!row) {
                return <div key={index} className="diff-row is-pending" style={{ top, height }} />;
              }
              return isHex(row)
                ? <HexRowView key={index} row={row} side={side} top={top} height={height} />
                : <TextRowView
                    key={index}
                    row={row}
                    side={side}
                    top={top}
                    height={height}
                    wrap={wrap}
                    highlight={settings.wordHighlight}
                  />;
            })}
          </div>
        </div>
        <OverviewBar
          summary={summary}
          scrollTop={scrollTop}
          total={layout.total}
          viewportHeight={props.viewportHeight}
          onJump={props.onJump}
        />
      </div>
    </section>
  );
}

function TextRowView(props: {
  row: TextRow;
  side: "left" | "right";
  top: number;
  height: number;
  wrap: boolean;
  highlight: boolean;
}) {
  const { row, side, wrap, highlight } = props;
  const text = side === "left" ? row.left : row.right;
  const spans = side === "left" ? row.leftSpans : row.rightSpans;
  const blank = text === null;
  return (
    <div
      className={`diff-row kind-${blank ? "blank" : row.kind}${wrap ? " is-wrap" : ""}${row.index % 2 ? " is-odd" : ""}`}
      style={{ top: props.top, height: props.height }}
      data-row={row.index}
    >
      {blank ? "" : highlight && spans && spans.length > 0 ? highlighted(text, spans, row.kind) : text || " "}
    </div>
  );
}

function highlighted(text: string, spans: CharSpan[], kind: DiffLineKind) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, position) => {
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    parts.push(
      <mark key={position} className={`word-${kind}`}>
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function HexRowView(props: { row: HexRow; side: "left" | "right"; top: number; height: number }) {
  const { row, side } = props;
  const data = side === "left" ? row.left : row.right;
  return (
    <div className={`diff-row hex kind-${row.kind}`} style={{ top: props.top, height: props.height }}>
      <span className="hex-offset">{row.offset.toString(16).toUpperCase().padStart(8, "0")}</span>
      <span className="hex-bytes">
        {data.bytes.map((byte, index) => (
          <span
            key={index}
            className={`hex-byte${(row.mask >> index) & 1 ? " is-diff" : ""}${index === 7 ? " has-gap" : ""}`}
          >
            {byte === null ? ".." : byte.toString(16).toUpperCase().padStart(2, "0")}
          </span>
        ))}
      </span>
      <span className="hex-ascii">
        {[...data.ascii].map((character, index) => (
          <span key={index} className={(row.mask >> index) & 1 ? "is-diff" : undefined}>
            {character}
          </span>
        ))}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * row windows
 * ------------------------------------------------------------------ */

type Row = TextRow | HexRow;

export type RowCache = {
  get: (index: number) => Row | undefined;
  ensure: (from: number, to: number) => void;
  /** All rows are loaded — word wrap can measure every line. */
  complete: boolean;
  /** Widest line seen so far, in monospace columns, for the horizontal scroll width. */
  widest: number;
  version: number;
};

function useRowCache(summary: SessionSummary, wrap: boolean, onError: (error: unknown) => void): RowCache {
  const store = useRef(new Map<number, Row>());
  const requested = useRef(new Set<number>());
  const sessionRef = useRef(summary.id);
  const widest = useRef(80);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(0);

  if (sessionRef.current !== summary.id) {
    sessionRef.current = summary.id;
    store.current = new Map();
    requested.current = new Set();
    widest.current = summary.mode === "binary" ? 78 : 80;
  }

  const fetchWindow = useCallback((windowIndex: number) => {
    if (requested.current.has(windowIndex)) return;
    requested.current.add(windowIndex);
    const id = summary.id;
    api.rows(windowIndex * WINDOW, WINDOW)
      .then((response) => {
        if (sessionRef.current !== id) return;
        for (const row of response.rows as Row[]) {
          if (isHex(row)) {
            store.current.set(row.offset / 16, row);
          } else {
            store.current.set(row.index, row);
            widest.current = Math.max(
              widest.current,
              displayWidth(row.left ?? ""),
              displayWidth(row.right ?? ""),
            );
          }
        }
        setLoaded((count) => count + response.rows.length);
        setVersion((value) => value + 1);
      })
      .catch((error) => {
        requested.current.delete(windowIndex);
        onError(error);
      });
  }, [summary.id, onError]);

  const ensure = useCallback((from: number, to: number) => {
    const first = Math.floor(Math.max(0, from) / WINDOW);
    const last = Math.floor(Math.max(0, to - 1) / WINDOW);
    for (let index = first; index <= last; index++) fetchWindow(index);
  }, [fetchWindow]);

  // Word wrap needs the whole document to lay rows out, so pull it in the background.
  useEffect(() => {
    if (!wrap) return;
    const windows = Math.ceil(summary.rowCount / WINDOW);
    for (let index = 0; index < windows; index++) fetchWindow(index);
  }, [wrap, summary.rowCount, fetchWindow]);

  const get = useCallback((index: number) => store.current.get(index), [version]);

  return useMemo(
    () => ({ get, ensure, complete: loaded >= summary.rowCount, widest: widest.current, version }),
    [get, ensure, loaded, summary.rowCount, version],
  );
}

function isHex(row: Row): row is HexRow {
  return typeof (row as HexRow).mask === "number";
}

/* ------------------------------------------------------------------ *
 * layout
 * ------------------------------------------------------------------ */

/**
 * Row geometry. Without word wrap every row is `rowHeight` tall, which keeps a
 * million-row file free of per-row bookkeeping; wrapped rows get a measured offset table.
 */
type Layout =
  | { uniform: true; rowHeight: number; rowCount: number; total: number }
  | { uniform: false; offsets: Float64Array; heights: Int32Array; total: number };

function buildLayout(
  rowCount: number,
  rowHeight: number,
  wrap: { rows: RowCache; columns: number } | null,
): Layout {
  if (!wrap) {
    return { uniform: true, rowHeight, rowCount, total: Math.max(rowCount * rowHeight, rowHeight) };
  }

  const offsets = new Float64Array(rowCount + 1);
  const heights = new Int32Array(rowCount);
  let offset = 0;
  for (let index = 0; index < rowCount; index++) {
    const row = wrap.rows.get(index);
    let lines = 1;
    if (row && !isHex(row)) {
      const left = Math.ceil(displayWidth(row.left ?? "") / wrap.columns) || 1;
      const right = Math.ceil(displayWidth(row.right ?? "") / wrap.columns) || 1;
      lines = Math.max(1, left, right);
    }
    const height = lines * rowHeight;
    heights[index] = height;
    offsets[index] = offset;
    offset += height;
  }
  offsets[rowCount] = offset;
  return { uniform: false, offsets, heights, total: Math.max(offset, rowHeight) };
}

function offsetOf(layout: Layout, index: number): number {
  return layout.uniform ? index * layout.rowHeight : layout.offsets[index] ?? 0;
}

function heightOf(layout: Layout, index: number): number {
  return layout.uniform ? layout.rowHeight : layout.heights[index] ?? layout.total;
}

function findRow(layout: Layout, offset: number): number {
  if (layout.uniform) {
    return Math.min(Math.max(Math.floor(offset / layout.rowHeight), 0), Math.max(0, layout.rowCount - 1));
  }
  const { offsets } = layout;
  const count = offsets.length - 1;
  if (count <= 0) return 0;
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (offsets[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Monospace column count, counting CJK and other wide glyphs as two columns. */
function displayWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    width += isWide(code) ? 2 : code === 9 ? 4 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f)
    || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe30 && code <= 0xfe6f)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6)
    || (code >= 0x1f300 && code <= 0x1f9ff)
  );
}

export const PANE_FONT = '"Cascadia Mono", "Consolas", "D2Coding", "DejaVu Sans Mono", "Menlo", monospace';

function useCharWidth(fontSize: number): number {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return fontSize * 0.6;
    context.font = `${fontSize}px ${PANE_FONT}`;
    const width = context.measureText("0".repeat(40)).width / 40;
    return width > 0 ? width : fontSize * 0.6;
  }, [fontSize]);
}

function baseName(label: string): string {
  const parts = label.split(/[\\/]/);
  return parts[parts.length - 1] || label;
}

function headerText(background: string): string {
  const value = /^#([0-9a-fA-F]{6})$/.test(background) ? background.slice(1) : "ffffff";
  const channels = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
  const [r, g, b] = channels.map((channel) => Math.round(channel / 3));
  return `rgb(${r}, ${g}, ${b})`;
}

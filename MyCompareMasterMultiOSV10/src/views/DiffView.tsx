/**
 * The two-way comparison.
 *
 * The two sides read as two separate documents: each has its own frame, its own line
 * numbers and its own scrollbar, with a gutter between them carrying the markers and
 * the arrows that copy a change across. They share one scroller, which is what keeps
 * them level without chasing scroll events.
 *
 * Rows are fetched in windows as the view moves, so a 200k-line pair costs a few
 * hundred rows of JSON per screen instead of the whole document.
 *
 * Three things make it a working tool rather than a viewer:
 *
 *   - **Differences only** hides the unchanged stretches, keeping a few lines of
 *     context, which is how a long file with three edits becomes readable.
 *   - **Apply to the other side** copies a whole difference block across and writes
 *     the file, which is the merge half of a two-way compare.
 *   - **Double-click to edit** replaces one line in place and writes it out.
 *
 * With word wrap on the rows stop being a fixed height, so the view loads the document
 * in one go up to a cap and lets the browser lay it out.
 *
 * Without word wrap a long line runs past its pane. Both texts then move sideways
 * together — one offset, a CSS variable on the rows, driven by a horizontal scrollbar
 * under each pane and by Shift+wheel — while the line numbers and the divider stay put.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BYTES_PER_ROW } from "../../core/binary.js";
import { api, type HexRow, type TextRow } from "../api.js";
import { DiffScrollBar } from "../DiffScrollBar.js";
import * as host from "../host.js";
import { paneHeaderStyle } from "../../core/themes.js";
import { FindBar } from "../FindBar.js";
import { Icon } from "../icons.js";
import { PathBar } from "../PathBar.js";
import type { Token } from "../../core/grammar.js";
import { useApp, type CompareTab } from "../state.js";
import { viewState } from "../viewCache.js";

/** Extra rows fetched above and below the viewport, so scrolling does not flicker. */
const OVERSCAN = 40;
const WRAP_LIMIT = 20_000;
/** Unchanged lines kept either side of a difference in "differences only". */
const CONTEXT = 3;
/** Ceiling on one fetch; a sparse "differences only" window could otherwise span a lot. */
const MAX_FETCH = 4000;
/** Measured to find the width of one column of the pane font. */
const CHAR_PROBE = "0".repeat(100);

export function DiffView({ tab }: { tab: CompareTab }) {
  const app = useApp();
  const { settings, t } = app;

  /*
   * A pane title bar's colours. The swatch a user picks is blended into the theme,
   * so the bar follows light and dark instead of staying a pastel in both.
   */
  const tint = (pane: "base" | "local" | "remote" | "result") =>
    paneHeaderStyle(settings.headerColors[pane], settings.theme, settings.customTheme);

  const summary = tab.summary;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const charProbeRef = useRef<HTMLSpanElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const leftBarRef = useRef<HTMLDivElement>(null);
  const rightBarRef = useRef<HTMLDivElement>(null);

  /*
   * What this tab last showed. Switching tabs unmounts the view; coming back to the
   * same comparison (the same summary — Refresh, an edit or a change on disk makes a
   * new one) puts the rows, the scroll position and the marks back from here instead
   * of asking the server for them again.
   */
  const kept = viewState(tab.id, "diff", () => ({
    summary: null as CompareTab["summary"] | null,
    fetched: "",
    window: { start: 0, count: 120 },
    text: new Map<number, TextRow>(),
    hex: { start: 0, rows: [] as HexRow[] },
    scrollTop: 0,
    scrollX: 0,
    bookmarks: [] as number[],
  }));
  const same = kept.summary === summary;
  const [window_, setWindow] = useState(same ? kept.window : { start: 0, count: 120 });
  const [text, setText] = useState<Map<number, TextRow>>(same ? kept.text : new Map());
  const [hex, setHex] = useState<{ start: number; rows: HexRow[] }>(same ? kept.hex : { start: 0, rows: [] });
  kept.window = window_;
  const [rowHeight, setRowHeight] = useState(20);
  const [editing, setEditingState] = useState<Editing | null>(null);
  // Read by the input's own handlers, which may run after a newer edit has started.
  const editingRef = useRef<Editing | null>(null);
  const setEditing = useCallback((next: Editing | null) => {
    editingRef.current = next;
    setEditingState(next);
  }, []);

  /*
   * Which panes take typing. The server says (a text file on disk, not opened by git
   * difftool); the arrows that copy a block across need the side they write to.
   */
  const editable = summary.editable ?? { left: false, right: false };
  const wrap = settings.wordWrap && summary.mode === "text" && summary.rowCount <= WRAP_LIMIT;

  /* ---------------------------------------- which rows are on screen */

  /**
   * The real row index behind each visible position, or null when every row is shown.
   * "Differences only" is a filter over this list, so the virtual list keeps working
   * unchanged — it just counts visible positions instead of file rows.
   */
  const visible = useMemo(() => {
    if (!settings.differencesOnly) return null;
    const kinds = summary.kinds;
    const keep = new Set<number>();
    for (let index = 0; index < kinds.length; index++) {
      if (kinds[index] === "s") continue;
      for (let near = index - CONTEXT; near <= index + CONTEXT; near++) {
        if (near >= 0 && near < kinds.length) keep.add(near);
      }
    }
    return [...keep].sort((a, b) => a - b);
  }, [settings.differencesOnly, summary.kinds]);

  const rowCount = visible ? visible.length : summary.rowCount;
  const realIndex = useCallback((position: number) => (visible ? visible[position] : position), [visible]);

  /* --------------------------------------------- measured row height */

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const measured = probe.getBoundingClientRect().height;
    if (measured > 4 && Math.abs(measured - rowHeight) > 0.5) setRowHeight(measured);
  }, [settings.font.size, settings.font.family, settings.zoom, rowHeight]);

  /* ------------------------------------------- sideways scrolling */

  const sideways = summary.mode === "text" && !wrap;

  /*
   * How wide the longest line is. The server counts its columns over the whole file,
   * which a column width turns into pixels; the lines on screen are also measured,
   * because a proportional font makes the column count only an estimate.
   */
  const [lineWidth, setLineWidth] = useState(0);
  const measuredWidth = useRef({ summary, width: 0 });
  useLayoutEffect(() => {
    if (!sideways) return;
    if (measuredWidth.current.summary !== summary) measuredWidth.current = { summary, width: 0 };
    const lines = rowsRef.current?.querySelectorAll<HTMLElement>(".cell-line") ?? [];
    let widest = measuredWidth.current.width;
    for (const line of lines) widest = Math.max(widest, line.offsetWidth);
    measuredWidth.current.width = widest;
    const column = (charProbeRef.current?.getBoundingClientRect().width ?? 0) / CHAR_PROBE.length;
    const width = Math.ceil(Math.max(widest, summary.widestLine * column));
    if (Math.abs(width - lineWidth) > 1) setLineWidth(width);
  });

  /** Moves both texts to `x` pixels in, and both scrollbars with them. */
  const applyScrollX = useCallback((x: number) => {
    kept.scrollX = x;
    rowsRef.current?.style.setProperty("--scroll-x", `${x}px`);
    for (const bar of [leftBarRef.current, rightBarRef.current]) {
      if (bar && bar.scrollLeft !== x) bar.scrollLeft = x;
    }
  }, [kept]);

  const scrollSideways = useCallback((delta: number) => {
    const bar = leftBarRef.current;
    if (!bar) return;
    bar.scrollLeft += delta; // the bar clamps it to the longest line
    applyScrollX(bar.scrollLeft);
  }, [applyScrollX]);

  // Put back where this tab was (or keep where it is) once the bars know their range;
  // with word wrap or a hex dump there is nothing to move.
  useLayoutEffect(() => {
    const bar = leftBarRef.current;
    if (!sideways || !bar) {
      rowsRef.current?.style.setProperty("--scroll-x", "0px");
      return;
    }
    bar.scrollLeft = kept.scrollX;
    applyScrollX(bar.scrollLeft);
  }, [applyScrollX, kept, lineWidth, sideways]);

  /** The sideways part of a wheel turn: a touchpad's own, or Shift with a mouse wheel. */
  const wheelSideways = (event: React.WheelEvent) => {
    if (!sideways) return 0;
    if (event.shiftKey && event.deltaX === 0) return event.deltaY;
    return Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
  };

  /* ------------------------------------------------ window tracking */

  const recompute = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || wrap) return;
    const first = Math.floor(scroller.scrollTop / rowHeight);
    const onScreen = Math.ceil(scroller.clientHeight / rowHeight);
    const start = Math.max(0, first - OVERSCAN);
    const count = onScreen + OVERSCAN * 2;
    setWindow((current) => (current.start === start && current.count === count ? current : { start, count }));
  }, [rowHeight, wrap]);

  // Back on a tab: where it was scrolled to, before the window is worked out from it.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && kept.summary === summary) scroller.scrollTop = kept.scrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  useEffect(() => {
    if (wrap) {
      setWindow({ start: 0, count: Math.min(rowCount, WRAP_LIMIT) });
      return;
    }
    recompute();
  }, [recompute, rowCount, summary.id, wrap]);

  useEffect(() => {
    let cancelled = false;
    let retry = 0;
    const positions: number[] = [];
    for (let position = window_.start; position < Math.min(window_.start + window_.count, rowCount); position++) {
      positions.push(realIndex(position));
    }
    if (positions.length === 0) {
      setText(new Map());
      setHex({ start: 0, rows: [] });
      return;
    }
    // One request spanning the window: contiguous in the normal case, and capped
    // when "differences only" has spread it across a large part of the file.
    const from = positions[0];
    const span = Math.min(positions[positions.length - 1] - from + 1, MAX_FETCH);
    // Already on screen: the same rows of the same comparison, kept from last time.
    const request = `${from}:${span}:${settings.wordHighlight}:${settings.syntaxHighlight}`;
    if (kept.summary === summary && kept.fetched === request) return undefined;

    const load = () => {
      api.rows(summary.id, from, span, settings.wordHighlight, settings.syntaxHighlight)
        .then((data) => {
          if (cancelled) return;
          if (data.mode === "text") {
            const map = new Map<number, TextRow>();
            data.rows.forEach((row, offset) => map.set(data.start + offset, row));
            setText(map);
            kept.text = map;
          } else {
            const rows = { start: data.start, rows: data.rows };
            setHex(rows);
            kept.hex = rows;
          }
          kept.summary = summary;
          kept.fetched = request;
        })
        .catch((error) => {
          if (cancelled) return;
          // A window of rows is a background read, not something the user asked for:
          // a hiccup belongs in the status bar with a retry, not in a modal dialog.
          app.setStatus(error instanceof Error ? error.message : String(error));
          if (retry < 3) {
            retry += 1;
            window.setTimeout(load, 400 * retry);
          }
        });
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [app, kept, realIndex, rowCount, settings.syntaxHighlight, settings.wordHighlight, summary, window_]);

  /* ------------------------------------ keeping the cursor in view */

  const scrollToRow = useCallback((row: number, centre: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const position = visible ? visible.indexOf(row) : row;
    if (position < 0) return;
    const target = position * rowHeight;
    scroller.scrollTop = centre
      ? Math.max(0, target - scroller.clientHeight / 2)
      : Math.max(0, target - scroller.clientHeight / 3);
  }, [rowHeight, visible]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || wrap) return;
    const position = visible ? visible.indexOf(tab.cursor) : tab.cursor;
    if (position < 0) return;
    const target = position * rowHeight;
    const top = scroller.scrollTop;
    if (target < top || target > top + scroller.clientHeight - rowHeight * 2) {
      scroller.scrollTop = Math.max(0, target - scroller.clientHeight / 3);
    }
  }, [rowHeight, tab.cursor, visible, wrap]);

  /* ------------------------------------------------------- actions */

  /*
   * The rows the search found, as a set for the renderer to test against. They come
   * from the server, which has the whole file — the window of rows loaded here is
   * never enough to search.
   */
  const [matchRows, setMatchRows] = useState<number[]>([]);
  const setMatches = useCallback((rows: number[]) => setMatchRows(rows), []);
  const matches = useMemo(() => new Set(matchRows), [matchRows]);

  /** Bookmarks are the user's own marks, so they live with the tab, not the file. */
  const [bookmarks, setBookmarks] = useState<number[]>(kept.bookmarks);
  const nextBookmarkRef = useRef<() => void>(() => {});
  const markedId = useRef(summary.id);
  useEffect(() => {
    if (markedId.current === summary.id) return;
    markedId.current = summary.id;
    setBookmarks([]);
  }, [summary.id]);
  kept.bookmarks = bookmarks;

  const toggleBookmark = useCallback((row: number) => {
    setBookmarks((current) => (current.includes(row)
      ? current.filter((item) => item !== row)
      : [...current, row].sort((a, b) => a - b)));
  }, []);

  /*
   * Ctrl+F2 marks the row the cursor is on, F2 goes to the next mark — the pair of
   * keys every editor uses for this, so nobody has to learn ours.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "F2") return;
      event.preventDefault();
      if (event.ctrlKey) toggleBookmark(tab.cursor);
      else nextBookmarkRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab.cursor, toggleBookmark]);

  const nextBookmark = useCallback(() => {
    if (bookmarks.length === 0) return;
    const after = bookmarks.find((row) => row > tab.cursor);
    const target = after ?? bookmarks[0];
    app.setCursor(target);
    scrollToRow(target, true);
  }, [app, bookmarks, scrollToRow, tab.cursor]);
  nextBookmarkRef.current = nextBookmark;

  const copySide = useCallback(async (side: "left" | "right" | "both") => {
    const value = await api.compareText(summary.id, side, 0, Math.min(summary.rowCount, 200_000));
    await host.copyText(value);
    app.setStatus((t) => t("dlg.copied"));
  }, [app, summary.id, summary.rowCount, t]);

  /** The whole run of differing rows around `row` — what "apply" acts on. */
  const blockAround = useCallback((row: number) => {
    const kinds = summary.kinds;
    if (kinds[row] === "s") return [row];
    let from = row;
    let to = row;
    while (from > 0 && kinds[from - 1] !== "s") from -= 1;
    while (to < kinds.length - 1 && kinds[to + 1] !== "s") to += 1;
    const rows: number[] = [];
    for (let index = from; index <= to; index++) rows.push(index);
    return rows;
  }, [summary.kinds]);

  const apply = useCallback((row: number, target: "left" | "right") => {
    void app.takeRows(tab, target, blockAround(row));
  }, [app, blockAround, tab]);

  /** Starts editing one cell, with the caret at `caret`. */
  const beginEdit = useCallback((row: number, side: "left" | "right", caret: number) => {
    const value = text.get(row)?.[side] ?? null;
    if (!editable[side] || text.get(row) === undefined) return;
    setEditing({ row, side, value: value ?? "", original: value, caret: Math.min(caret, (value ?? "").length) });
    app.setCursor(row);
  }, [app, editable, text, setEditing]);

  /**
   * Saves the cell being edited, if it changed; only that row is compared again. A
   * blank cell left empty stays blank — typing into it is what inserts a line.
   */
  const commitEdit = useCallback((value?: string | null) => {
    const current = editingRef.current;
    if (!current) return;
    setEditing(null);
    let next = value === undefined ? current.value : value;
    if (current.original === null && next === "") next = null;
    if (next === current.original) return;
    void app.editCompareRow(tab, current.side, current.row, next, current.original);
  }, [app, setEditing, tab]);

  /** Saves, then carries on in the line `step` rows away on the same side. */
  const moveEdit = useCallback((step: number, caret: number, value?: string | null) => {
    const current = editingRef.current;
    if (!current) return;
    commitEdit(value);
    const position = (visible ? visible.indexOf(current.row) : current.row) + step;
    if (position < 0 || position >= rowCount) return;
    beginEdit(realIndex(position), current.side, caret);
  }, [beginEdit, commitEdit, realIndex, rowCount, visible]);

  const onEditKey = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
    } else if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      moveEdit(1, event.key === "Enter" ? 0 : caret);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveEdit(-1, caret);
    } else if (event.key === "Backspace" && input.value === "" && editingRef.current?.original !== null) {
      // Backspace in an empty line removes the line, as in any editor.
      event.preventDefault();
      moveEdit(-1, Number.MAX_SAFE_INTEGER, null);
    }
  }, [moveEdit, setEditing]);

  const totalHeight = wrap ? undefined : rowCount * rowHeight;
  const firstVisible = wrap ? 0 : window_.start;
  const lastVisible = wrap ? rowCount : Math.min(window_.start + window_.count, rowCount);
  const offset = wrap ? 0 : firstVisible * rowHeight;

  const positions: number[] = [];
  for (let position = firstVisible; position < lastVisible; position++) positions.push(position);

  // What the two scrollbars draw their thumb from, in real row numbers.
  const onScreen = Math.max(1, Math.round((scrollerRef.current?.clientHeight ?? 400) / rowHeight));
  const viewport = {
    start: realIndex(Math.min(window_.start + OVERSCAN, Math.max(0, rowCount - 1))) || 0,
    count: onScreen,
  };

  return (
    <div className="diff-view" data-tour="diff-view">
      <div className="pane-headers two-up">
        <PathBar
          side="left"
          kind="file"
          value={summary.left.path ?? summary.left.label}
          tint={tint("local")}
          onApply={(next) => void app.setCompareSide(tab, "left", next)}
        >
          <button type="button" className="icon-button" title={t("tip.copy")} data-command="copy.left"
            onClick={() => void copySide("left")}>
            <Icon name="copy" size={14} />
          </button>
        </PathBar>
        <PathBar
          side="right"
          kind="file"
          value={summary.right.path ?? summary.right.label}
          tint={tint("remote")}
          onApply={(next) => void app.setCompareSide(tab, "right", next)}
        >
          <button type="button" className="icon-button" title={t("tip.copy")} data-command="copy.right"
            onClick={() => void copySide("right")}>
            <Icon name="copy" size={14} />
          </button>
        </PathBar>
      </div>

      <FindBar
        compareId={summary.id}
        rowCount={summary.rowCount}
        editable={editable.left || editable.right}
        bookmarks={bookmarks}
        onMatches={setMatches}
        onGo={(row) => {
          app.setCursor(row);
          scrollToRow(row, true);
        }}
        onToggleBookmark={() => toggleBookmark(tab.cursor)}
        onNextBookmark={nextBookmark}
        onReplaced={() => void app.reloadActive()}
      />

      {/*
        * The wheel scrolls the comparison from anywhere inside it. Without this a
        * wheel over the difference scrollbars, the divider or the padding does
        * nothing, because the only scrollable box is the pane between them — and
        * those strips are exactly where the pointer ends up while reading.
        */}
      <div
        className="diff-body"
        onWheel={(event) => {
          if (event.ctrlKey) return; // Ctrl+Wheel is the zoom
          const target = event.target as Element;
          const sideStep = wheelSideways(event);
          if (sideStep !== 0) {
            // A horizontal scrollbar moves itself; the event then only has to sync.
            if (!target.closest(".diff-hbar")) scrollSideways(sideStep);
            return;
          }
          const scroller = scrollerRef.current;
          if (!scroller || scroller.contains(target)) return;
          scroller.scrollTop += event.deltaY;
        }}
      >
        <DiffScrollBar
          kinds={summary.kinds}
          cursor={tab.cursor}
          side="left"
          viewport={viewport}
          onSeek={(row, options) => {
            app.setCursor(row);
            scrollToRow(row, options?.centre ?? false);
          }}
        />

        <div className="diff-center">
        <div className="diff-scroller" ref={scrollerRef}
          onScroll={(event) => {
            kept.scrollTop = event.currentTarget.scrollTop;
            recompute();
          }}
          data-testid="diff-scroller">
          <div
            className={`diff-spacer${summary.mode === "binary" ? " hex" : ""}`}
            style={{ height: totalHeight }}
          >
            <div className="diff-rows" ref={rowsRef} style={{ transform: wrap ? undefined : `translateY(${offset}px)` }}>
              {summary.mode === "text"
                ? positions.map((position) => {
                  const index = realIndex(position);
                  const row = text.get(index);
                  if (!row) return <div className="diff-row pending" key={position} style={{ height: rowHeight }} />;
                  return (
                    <TextLine
                      key={position}
                      row={row}
                      index={index}
                      wrap={wrap}
                      highlight={settings.wordHighlight}
                      found={matches.has(index)}
                      bookmarked={bookmarks.includes(index)}
                      current={index === tab.cursor}
                      editable={editable}
                      editing={editing?.row === index ? editing : null}
                      onClick={() => app.setCursor(index)}
                      onApply={apply}
                      onEdit={(side, caret) => beginEdit(index, side, caret)}
                      onEditChange={(value) => {
                        const current = editingRef.current;
                        if (current) setEditing({ ...current, value });
                      }}
                      onEditKey={onEditKey}
                      onEditBlur={(side) => {
                        // Only the cell still being edited: a move has already saved this one.
                        const current = editingRef.current;
                        if (current && current.row === index && current.side === side) commitEdit();
                      }}
                      labels={{ toLeft: t("line.blockToLeft"), toRight: t("line.blockToRight"), edit: t("line.edit") }}
                    />
                  );
                })
                : positions.map((position) => {
                  const index = realIndex(position);
                  const row = hex.rows[index - hex.start];
                  if (!row) return <div className="diff-row pending" key={position} style={{ height: rowHeight }} />;
                  return (
                    <HexLine
                      key={position}
                      row={row}
                      current={index === tab.cursor}
                      onClick={() => app.setCursor(index)}
                    />
                  );
                })}
            </div>
          </div>
        </div>

        {/* One horizontal scrollbar under each text, laid out on the rows' own grid so
            it spans exactly the text column. Either one moves both texts. */}
        {sideways && (
          <div className="diff-hbars" data-testid="diff-hbars">
            {(["left", "divider", "right"] as const).map((side) => (side === "divider" ? <span key={side} /> : (
              <span key={side} className={`diff-hbar-half side-${side}`}>
                <span />
                <div
                  className="diff-hbar"
                  ref={side === "left" ? leftBarRef : rightBarRef}
                  data-testid={`diff-hbar-${side}`}
                  onScroll={(event) => applyScrollX(event.currentTarget.scrollLeft)}
                >
                  {/* The line plus the text cell's padding on both sides. */}
                  <div style={{ width: lineWidth + 16 }} />
                </div>
              </span>
            )))}
          </div>
        )}
        </div>

        <DiffScrollBar
          kinds={summary.kinds}
          cursor={tab.cursor}
          side="right"
          viewport={viewport}
          onSeek={(row, options) => {
            app.setCursor(row);
            scrollToRow(row, options?.centre ?? false);
          }}
        />
      </div>

      {/* An off-screen copy of one row: the only reliable way to know how tall a row
          is for the current font, which is what the virtual list is measured in. */}
      <div className="row-probe" ref={probeRef} aria-hidden="true">
        <span className="cell-text">0</span>
        <span className="char-probe" ref={charProbeRef}>{CHAR_PROBE}</span>
      </div>
    </div>
  );
}

function TextLine({
  row,
  index,
  wrap,
  highlight,
  found,
  bookmarked,
  current,
  editable,
  editing,
  onClick,
  onApply,
  onEdit,
  onEditChange,
  onEditKey,
  onEditBlur,
  labels,
}: {
  row: TextRow;
  index: number;
  wrap: boolean;
  highlight: boolean;
  found: boolean;
  bookmarked: boolean;
  current: boolean;
  editable: { left: boolean; right: boolean };
  editing: Editing | null;
  onClick: () => void;
  onApply: (row: number, target: "left" | "right") => void;
  onEdit: (side: "left" | "right", caret: number) => void;
  onEditChange: (value: string) => void;
  onEditKey: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onEditBlur: (side: "left" | "right") => void;
  labels: { toLeft: string; toRight: string; edit: string };
}) {
  const zebra = index % 2 === 1 ? " zebra" : "";
  const differs = row.kind !== "same";

  const half = (side: "left" | "right") => {
    const value = row[side];
    const spans = side === "left" ? row.leftSpans : row.rightSpans;
    return (
      <span className={`diff-half side-${side}`}>
        <span className="cell-gutter">{side === "left" ? row.leftNo ?? "" : row.rightNo ?? ""}</span>
        {editing && editing.side === side ? (
          <input
            className="cell-edit"
            data-edit={side}
            spellCheck={false}
            ref={(input) => {
              // Focused once, with the caret where the click landed.
              if (!input || input.dataset.ready) return;
              input.dataset.ready = "1";
              input.focus();
              input.setSelectionRange(editing.caret, editing.caret);
            }}
            value={editing.value}
            onChange={(event) => onEditChange(event.target.value)}
            onBlur={() => onEditBlur(side)}
            onKeyDown={onEditKey}
          />
        ) : (
          <span
            className={`cell-text ${side}${value === null ? " blank" : ""}${editable[side] ? " editable" : ""}`}
            title={editable[side] ? labels.edit : undefined}
            onClick={(event) => {
              if (editable[side]) onEdit(side, caretAt(event.currentTarget, event.clientX, event.clientY));
            }}
          >
            {value !== null && (
              <span className="cell-line">
                {cellContent(
                  value,
                  highlight ? spans : undefined,
                  side === "left" ? "removed" : "added",
                  side === "left" ? row.leftTokens : row.rightTokens,
                )}
              </span>
            )}
          </span>
        )}
      </span>
    );
  };

  return (
    <div
      className={`diff-row kind-${row.kind}${zebra}${current ? " current" : ""}${found ? " found" : ""}${bookmarked ? " bookmarked" : ""}${wrap ? " wrap" : ""}`}
      data-row={index}
      onMouseDown={onClick}
    >
      {half("left")}
      <span className="cell-divider">
        {differs && (editable.left || editable.right) ? (
          <>
            <button
              type="button"
              className="apply-button to-right"
              disabled={!editable.right}
              title={labels.toRight}
              aria-label={labels.toRight}
              data-apply="right"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onApply(index, "right")}
            >
              <Icon name="next" size={11} />
            </button>
            <button
              type="button"
              className="apply-button to-left"
              disabled={!editable.left}
              title={labels.toLeft}
              aria-label={labels.toLeft}
              data-apply="left"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onApply(index, "left")}
            >
              <Icon name="prev" size={11} />
            </button>
          </>
        ) : (
          <span className="cell-marker">{MARKER[row.kind]}</span>
        )}
      </span>
      {half("right")}
    </div>
  );
}

const MARKER: Record<string, string> = { same: "", added: "+", removed: "−", modified: "≠" };

/** The cell being edited: `original` is what it held (null for a blank cell). */
type Editing = { row: number; side: "left" | "right"; value: string; original: string | null; caret: number };

/** Where in a cell's text a click landed, as a character offset. */
function caretAt(cell: HTMLElement, x: number, y: number): number {
  const line = cell.querySelector(".cell-line");
  if (!line) return 0;
  const length = line.textContent?.length ?? 0;
  const point = document.caretRangeFromPoint?.(x, y);
  if (!point || !line.contains(point.startContainer)) {
    // Beside the text: before it in the padding, or past its end.
    return x < line.getBoundingClientRect().left ? 0 : length;
  }
  const before = document.createRange();
  before.setStart(line, 0);
  before.setEnd(point.startContainer, point.startOffset);
  return before.toString().length;
}

/**
 * A line's text, coloured two ways at once.
 *
 * Word highlighting says *what changed*; syntax highlighting says *what it is*. Both
 * can be on, and they overlap, so the line is split at every boundary either one
 * cares about and each piece is given the classes that apply to it. Splitting once
 * at the union of the boundaries is what keeps the two from fighting over the same
 * characters.
 */
function cellContent(
  value: string | null,
  words: { start: number; end: number }[] | undefined,
  wordKind: string,
  tokens: Token[] | undefined,
): React.ReactNode {
  if (value === null) return null;
  const hasWords = Boolean(words?.length);
  const hasTokens = Boolean(tokens?.length);
  if (!hasWords && !hasTokens) return value;
  if (hasWords && !hasTokens) return marks(value, words as { start: number; end: number }[], wordKind);

  const bounds = new Set<number>([0, value.length]);
  for (const token of tokens ?? []) {
    bounds.add(Math.min(token.start, value.length));
    bounds.add(Math.min(token.end, value.length));
  }
  for (const word of words ?? []) {
    bounds.add(Math.min(word.start, value.length));
    bounds.add(Math.min(word.end, value.length));
  }

  const edges = [...bounds].sort((a, b) => a - b);
  const parts: React.ReactNode[] = [];
  for (let index = 0; index < edges.length - 1; index++) {
    const from = edges[index];
    const to = edges[index + 1];
    if (to <= from) continue;
    const token = tokens?.find((item) => item.start <= from && item.end >= to);
    const changed = words?.some((item) => item.start <= from && item.end >= to);
    const text = value.slice(from, to);

    if (changed) {
      parts.push(
        <mark key={from} className={`word ${wordKind}${token ? ` tok-${token.kind}` : ""}`}>{text}</mark>,
      );
    } else if (token) {
      parts.push(<span key={from} className={`tok-${token.kind}`}>{text}</span>);
    } else {
      parts.push(text);
    }
  }
  return parts;
}

function marks(value: string, ranges: { start: number; end: number }[], kind: string) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(value.slice(cursor, range.start));
    parts.push(
      <mark key={index} className={`word ${kind}`}>
        {value.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function HexLine({ row, current, onClick }: { row: HexRow; current: boolean; onClick: () => void }) {
  const offset = row.offset.toString(16).toUpperCase().padStart(8, "0");
  return (
    <div className={`diff-row hex kind-${row.kind}${current ? " current" : ""}`} onMouseDown={onClick}>
      <span className="diff-half side-left">
        <span className="cell-gutter">{offset}</span>
        <span className="cell-text left">{hexCells(row, "left")}</span>
      </span>
      <span className="cell-divider"><span className="cell-marker">{row.mask ? "≠" : ""}</span></span>
      <span className="diff-half side-right">
        <span className="cell-gutter">{offset}</span>
        <span className="cell-text right">{hexCells(row, "right")}</span>
      </span>
    </div>
  );
}

function hexCells(row: HexRow, side: "left" | "right") {
  const data = row[side];
  const cells: React.ReactNode[] = [];
  for (let index = 0; index < BYTES_PER_ROW; index++) {
    const byte = data.bytes[index];
    const differs = (row.mask & (1 << index)) !== 0;
    cells.push(
      <span key={index} className={differs ? "hex-byte diff" : "hex-byte"}>
        {byte === null ? "  " : byte.toString(16).toUpperCase().padStart(2, "0")}
      </span>,
    );
  }
  cells.push(<span key="ascii" className="hex-ascii">{data.ascii}</span>);
  return cells;
}

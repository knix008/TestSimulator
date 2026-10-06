/**
 * The 3-way merge view.
 *
 * Four panes — Base, Local, Remote and the editable Result — laid out line for line by
 * `mergeDocument.layout()`, so a conflict's three sides stay opposite each other and
 * the result stays opposite all of them. One scroller holds all four, which is what
 * makes the scrolling synchronous.
 *
 * Resolution is per hunk, from the header buttons, the toolbar, the conflict list in
 * the left panel, the context menu or the keyboard; every one of those goes through
 * the same store action and is therefore undoable. A result line can also be edited in place by
 * double-clicking it, which marks that hunk as hand-edited.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  conflictRowStarts,
  conflicts,
  layout,
  type MergePaneKind,
  type MergeRow,
} from "../../core/mergeDocument.js";
import * as host from "../host.js";
import { Icon } from "../icons.js";
import { useApp, type MergeTab } from "../state.js";

export function MergeView({ tab }: {
  tab: MergeTab;
}) {
  const app = useApp();
  const { t, settings } = app;
  const rows = useMemo(() => layout(tab.document), [tab.document]);
  const starts = useMemo(() => conflictRowStarts(rows.result), [rows.result]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ row: number; value: string } | null>(null);

  const hasBase = conflicts(tab.document).some((hunk) => hunk.hasBase) || tab.info.basePath !== null;
  const panes: MergePaneKind[] = hasBase ? ["base", "local", "remote"] : ["local", "remote"];

  /* Scroll the selected conflict into view whenever it changes. */
  useEffect(() => {
    const scroller = scrollerRef.current;
    const start = starts[tab.selectedConflict];
    if (!scroller || start === undefined) return;
    const element = scroller.querySelector<HTMLElement>(`[data-row="${start}"]`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [starts, tab.selectedConflict]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const row = rows.result[editing.row];
    setEditing(null);
    if (!row) return;
    if (row.conflict === null) {
      // The index within the clean region, which is what `withCleanLine` expects.
      let offset = 0;
      for (let index = editing.row - 1; index >= 0; index--) {
        if (rows.result[index].region !== row.region) break;
        offset += 1;
      }
      app.editLine(row.region, offset, editing.value, null);
    } else {
      let offset = 0;
      for (let index = editing.row - 1; index >= 0; index--) {
        if (rows.result[index].conflict !== row.conflict) break;
        offset += 1;
      }
      app.editLine(row.region, offset, editing.value, row.conflict);
    }
  }, [app, editing, rows.result]);

  const copyResult = useCallback(async () => {
    const text = rows.result.map((row) => row.text ?? "").join("\n");
    await host.copyText(text);
    app.setStatus((t) => t("dlg.copied"));
  }, [app, rows.result, t]);

  const headerFor = (pane: MergePaneKind) => {
    const label = pane === "base" ? t("pane.base")
      : pane === "local" ? t("pane.local")
        : pane === "remote" ? t("pane.remote") : t("pane.result");
    const command = pane === "base" ? "merge.takeBase"
      : pane === "local" ? "merge.takeLocal"
        : pane === "remote" ? "merge.takeRemote" : null;
    return (
      <div className="pane-header" style={{ background: settings.headerColors[pane] }} key={pane}>
        <Icon name={pane === "result" ? "merge" : pane} size={15} />
        <span className="pane-path">{label}</span>
        {command ? (
          <button
            type="button"
            className="icon-button"
            data-command={command}
            title={t(pane === "base" ? "cmd.merge.takeBase" : pane === "local" ? "tip.takeLocal" : "tip.takeRemote")}
            onClick={() => app.resolveConflict(pane === "base" ? "base" : pane === "local" ? "local" : "remote")}
          >
            <Icon name="check" size={14} />
          </button>
        ) : (
          <>
            <button type="button" className="icon-button" data-command="merge.takeBoth" title={t("tip.takeBoth")}
              onClick={() => app.resolveConflict("both")}>
              <Icon name="both" size={14} />
            </button>
            <button type="button" className="icon-button" data-command="copy.result" title={t("tip.copy")}
              onClick={copyResult}>
              <Icon name="copy" size={14} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="merge-view" data-panes={panes.length}>
      <div className="pane-headers merge-headers">
        {panes.map(headerFor)}
      </div>

      <div className="merge-scroller" ref={scrollerRef} data-testid="merge-scroller">
        <div className="merge-grid" style={{ gridTemplateColumns: `repeat(${panes.length}, minmax(0, 1fr))` }}>
          {panes.map((pane) => (
            <Pane
              key={pane}
              pane={pane}
              rows={rows[pane]}
              selected={tab.selectedConflict}
              onSelect={(index) => app.selectConflict(index)}
            />
          ))}
        </div>
      </div>

      <div className="pane-headers result-header">
        {headerFor("result")}
      </div>

      <div className="result-scroller" data-testid="result-scroller">
        {rows.result.map((row, index) => (
          <div
            key={index}
            data-row={index}
            className={`merge-row ${rowClass(row)}${row.conflict === tab.selectedConflict ? " selected" : ""}`}
            onMouseDown={() => {
              if (row.conflict !== null) app.selectConflict(row.conflict);
            }}
            onDoubleClick={() => {
              if (row.text !== null) setEditing({ row: index, value: row.text });
            }}
          >
            <span className="cell-gutter">{row.lineNo ?? ""}</span>
            {editing?.row === index ? (
              <input
                className="cell-edit"
                autoFocus
                value={editing.value}
                onChange={(event) => setEditing({ row: index, value: event.target.value })}
                onBlur={commitEdit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitEdit();
                  if (event.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <span className="cell-text">{row.text}</span>
            )}
          </div>
        ))}
        {rows.result.length === 0 ? <div className="pane-empty-row">{t("pane.empty")}</div> : null}
      </div>
    </div>
  );
}

function Pane({
  pane,
  rows,
  selected,
  onSelect,
}: {
  pane: MergePaneKind;
  rows: MergeRow[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const app = useApp();
  return (
    <div className={`merge-pane pane-${pane}`}>
      {rows.map((row, index) => (
        <div
          key={index}
          className={`merge-row ${rowClass(row)}${row.conflict === selected ? " selected" : ""}`}
          data-pane={pane}
          data-row={index}
          onMouseDown={() => {
            if (row.conflict !== null) onSelect(row.conflict);
          }}
        >
          <span className="cell-gutter">{row.lineNo ?? ""}</span>
          <span className={`cell-text${row.text === null ? " blank" : ""}`}>{row.text}</span>
        </div>
      ))}
      {rows.length === 0 ? <div className="pane-empty-row">{app.t("pane.noBase")}</div> : null}
    </div>
  );
}

function rowClass(row: MergeRow): string {
  if (row.kind === "pad") return "kind-pad";
  if (row.kind === "conflict") return "kind-conflict";
  if (row.kind === "resolved") return "kind-resolved";
  return "kind-clean";
}

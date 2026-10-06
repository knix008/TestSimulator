/**
 * The left panel: the conflicts of a merge, opened out.
 *
 * It exists only on a merge tab — every other kind of tab gives the whole window to
 * its comparison — and it is not a list of links. Each conflict is shown *open*: the
 * candidate texts side by side under their own heading, each one a button that
 * resolves the hunk that way. So a short conflict can be read and settled here
 * without touching the panes at all, and the panes stay for the ones that need their
 * full context.
 *
 * The selected conflict is the one the panes are scrolled to, and clicking anywhere
 * in an entry selects it, so this panel and the panes always agree.
 */
import { useEffect, useRef } from "react";
import {
  conflictCount,
  conflicts,
  resolvedCount,
  type ConflictHunk,
  type ConflictResolution,
} from "../core/mergeDocument.js";
import { Icon } from "./icons.js";
import { useApp, type MergeTab } from "./state.js";

/** How many lines of a side are previewed before it is cut short. */
const PREVIEW_LINES = 4;

export function LeftPanel({ tab }: { tab: MergeTab }) {
  const app = useApp();
  const { t, settings } = app;
  const list = conflicts(tab.document);
  const total = conflictCount(tab.document);
  const resolved = resolvedCount(tab.document);

  return (
    <aside className="panel panel-left" style={{ width: settings.leftPanelWidth }}>
      <header className="panel-title">
        <Icon name="conflict" size={15} />
        <span>{t("merge.conflicts")}</span>
        <span className="count">{resolved} / {total}</span>
        <button
          type="button"
          className="icon-button"
          data-command="panel.collapse"
          title={t("panel.collapse")}
          onClick={() => void app.updateSettings({ showLeftPanel: false })}
        >
          <Icon name="prev" size={14} />
        </button>
      </header>

      <div className="panel-scroll">
        {list.length === 0 ? (
          <p className="panel-empty">{t("merge.noConflicts")}</p>
        ) : (
          list.map((hunk, index) => (
            <ConflictCard
              key={index}
              hunk={hunk}
              index={index}
              selected={index === tab.selectedConflict}
              onSelect={() => app.selectConflict(index)}
              onResolve={(resolution) => {
                app.selectConflict(index);
                app.resolveConflict(resolution);
              }}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function ConflictCard({
  hunk,
  index,
  selected,
  onSelect,
  onResolve,
}: {
  hunk: ConflictHunk;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onResolve: (resolution: ConflictResolution) => void;
}) {
  const app = useApp();
  const { t } = app;
  const ref = useRef<HTMLElement>(null);

  // Keep the selected card in view when the selection moves from the panes or the
  // keyboard, not from a click in here.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const sides: { key: ConflictResolution; label: string; lines: string[] }[] = [
    ...(hunk.hasBase ? [{ key: "base" as const, label: t("pane.base"), lines: hunk.baseLines }] : []),
    { key: "local", label: t("pane.local"), lines: hunk.localLines },
    { key: "remote", label: t("pane.remote"), lines: hunk.remoteLines },
  ];

  return (
    <section
      ref={ref}
      className={[
        "conflict-card",
        hunk.resolution === "unresolved" ? "unresolved" : "resolved",
        selected ? "selected" : "",
      ].filter(Boolean).join(" ")}
      data-conflict={index}
      onMouseDown={onSelect}
    >
      <header className="conflict-card-head">
        <Icon name={hunk.resolution === "unresolved" ? "conflict" : "check"} size={13} />
        <span className="conflict-name">#{index + 1}</span>
        <span className="conflict-state">{resolutionLabel(hunk.resolution, t)}</span>
      </header>

      {sides.map((side) => (
        <button
          key={side.key}
          type="button"
          className={`conflict-side${hunk.resolution === side.key ? " chosen" : ""}`}
          data-resolve={`${index}:${side.key}`}
          title={`${side.label} — ${t("merge.useThis")}`}
          onClick={() => onResolve(side.key)}
        >
          <span className="conflict-side-head">
            <Icon name={side.key} size={12} />
            <span>{side.label}</span>
            <span className="conflict-side-count">{t("misc.lines", side.lines.length)}</span>
          </span>
          <span className="conflict-side-text">{preview(side.lines)}</span>
        </button>
      ))}

      <div className="conflict-card-actions">
        <button
          type="button"
          className="chip"
          data-resolve={`${index}:both`}
          title={t("cmd.merge.takeBoth")}
          onClick={() => onResolve("both")}
        >
          <Icon name="both" size={12} />
          <span>{t("cmd.merge.takeBoth")}</span>
        </button>
        <button
          type="button"
          className="chip"
          data-resolve={`${index}:unresolved`}
          title={t("cmd.merge.unresolve")}
          disabled={hunk.resolution === "unresolved"}
          onClick={() => onResolve("unresolved")}
        >
          <Icon name="undo" size={12} />
          <span>{t("cmd.merge.unresolve")}</span>
        </button>
      </div>
    </section>
  );
}

/** The first few lines, with a marker for whatever was left out. */
function preview(lines: string[]): string {
  if (lines.length === 0) return "";
  const head = lines.slice(0, PREVIEW_LINES).join("\n");
  return lines.length > PREVIEW_LINES ? `${head}\n…` : head;
}

function resolutionLabel(resolution: string, t: ReturnType<typeof useApp>["t"]): string {
  switch (resolution) {
    case "base": return t("cmd.merge.takeBase");
    case "local": return t("cmd.merge.takeLocal");
    case "remote": return t("cmd.merge.takeRemote");
    case "both": return t("cmd.merge.takeBoth");
    case "edited": return t("status.modifiedFlag");
    default: return t("status.unresolved");
  }
}

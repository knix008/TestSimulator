/**
 * The directory comparison: two trees, side by side.
 *
 * Both sides render the *same* row list — built once by `core/dirTree.ts` — so a file
 * that exists on only one side still occupies a row on the other, and the two trees
 * stay level with each other. One scroller holds both, which is what makes their
 * scrolling synchronous rather than something to keep in step by hand.
 *
 * Each side's root folder is set from the path bar at the top of its own pane, and
 * double-clicking a file opens that pair as a line-by-line comparison in a new tab.
 */
import { useEffect, useMemo, useState } from "react";
import {
  allFolders,
  buildTree,
  flatRows,
  flatten,
  foldersWithDifferences,
  type TreeNode,
} from "../../core/dirTree.js";
import { SYNC_MODES, type SyncMode } from "../../core/sync.js";
import { formatBytes } from "../../core/text.js";
import type { FileCompareStatus } from "../../core/dirCompare.js";
import { paneHeaderStyle } from "../../core/themes.js";
import { fileIcon } from "../fileIcons.js";
import { Icon } from "../icons.js";
import { PathBar } from "../PathBar.js";
import { useApp, type DirectoryTab } from "../state.js";

const STATUS_ICON: Record<FileCompareStatus, string> = {
  same: "equal",
  different: "modified",
  leftOnly: "leftOnly",
  rightOnly: "rightOnly",
  renamed: "sync",
};

export function DirectoryView({ tab }: {
  tab: DirectoryTab;
}) {
  const app = useApp();
  const { t, settings } = app;

  /*
   * A pane title bar's colours. The swatch a user picks is blended into the theme,
   * so the bar follows light and dark instead of staying a pastel in both.
   */
  const tint = (pane: "base" | "local" | "remote" | "result") =>
    paneHeaderStyle(settings.headerColors[pane], settings.theme, settings.customTheme);

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(tab.result.entries), [tab.result.entries]);

  // A fresh comparison opens on the folders that actually contain changes, which is
  // what a user is looking for; a tree collapsed to its roots tells them nothing.
  useEffect(() => {
    setExpanded(new Set(foldersWithDifferences(tree)));
  }, [tree]);

  /*
   * Two shapes for the same comparison: a tree to browse, or one flat list of every
   * file with its whole path. The flat list is what you want when the question is
   * "what differs" rather than "what is in this folder".
   */
  const rows = useMemo(
    () => (settings.flatView
      ? flatRows(tab.result.entries, tab.filters, query)
      : flatten(tree, expanded, tab.filters, query)),
    [expanded, query, settings.flatView, tab.filters, tab.result.entries, tree],
  );

  // Every operation acts on the selected entry; a folder takes its contents with it.
  const selection = tab.selected ? [tab.selected] : [];

  const toggle = (rel: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });
  };

  const open = (node: TreeNode) => {
    if (node.directory) {
      toggle(node.rel);
      return;
    }
    void app.openDirectoryEntry(tab, node.rel);
  };

  return (
    <div className="directory-view">
      <div className="tree-headers">
        <PathBar
          side="left"
          kind="directory"
          value={tab.result.left}
          tint={tint("local")}
          onApply={(next) => void app.setDirectoryRoot(tab, "left", next)}
        />
        <PathBar
          side="right"
          kind="directory"
          value={tab.result.right}
          tint={tint("remote")}
          onApply={(next) => void app.setDirectoryRoot(tab, "right", next)}
        />
      </div>

      <div className="tree-toolbar">
        <button
          type="button"
          className="chip icon-only"
          data-command="tree.expandAll"
          title={t("tree.expandAll")}
          aria-label={t("tree.expandAll")}
          onClick={() => setExpanded(new Set(allFolders(tree)))}
        >
          <Icon name="down" size={14} />
        </button>
        <button
          type="button"
          className="chip icon-only"
          data-command="tree.collapseAll"
          title={t("tree.collapseAll")}
          aria-label={t("tree.collapseAll")}
          onClick={() => setExpanded(new Set())}
        >
          <Icon name="up" size={14} />
        </button>
        <button
          type="button"
          className={`chip icon-only${settings.flatView ? " checked" : ""}`}
          data-command="tree.flat"
          title={settings.flatView ? t("tree.treeView") : t("tree.flat")}
          aria-label={t("tree.flat")}
          aria-pressed={settings.flatView}
          onClick={() => void app.updateSettings({ flatView: !settings.flatView })}
        >
          <Icon name={settings.flatView ? "grid" : "list"} size={14} />
        </button>
        <button
          type="button"
          className="chip icon-only"
          data-command="tree.expandChanged"
          title={t("tree.expandChanged")}
          aria-label={t("tree.expandChanged")}
          onClick={() => setExpanded(new Set(foldersWithDifferences(tree)))}
        >
          <Icon name="modified" size={14} />
        </button>

        <span className="tree-divider" />

        {/* Copy, move, rename and delete are on the main toolbar: they belong to
            the selection rather than to this view, and keeping them here cost the
            row more width than it had. */}
        <Filters tab={tab} />

        <span className="tree-spacer" />

        <span className="pane-find">
          <Icon name="find" size={14} />
          <input
            className="find-input"
            type="search"
            value={query}
            placeholder={t("cmd.edit.find")}
            aria-label={t("cmd.edit.find")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>
      </div>

      {tab.sync ? <SyncBar tab={tab} /> : null}

      <div className="tree-scroller" data-testid="directory-tree">
        <div className="tree-grid">
          {rows.map(({ node, depth, expandable, expanded: isExpanded, rails, last }) => (
            <div
              key={node.rel}
              className={`tree-pair status-${node.status}${tab.selected === node.rel ? " selected" : ""}`}
              data-entry={node.rel}
              onMouseDown={() => app.setDirectorySelection(node.rel)}
              onDoubleClick={() => open(node)}
            >
              <TreeCell
                side="left"
                node={node}
                depth={depth}
                rails={rails}
                last={last}
                expandable={expandable}
                expanded={isExpanded}
                present={node.left !== null}
                size={node.left?.size ?? null}
                modified={node.left?.modified ?? null}
                onToggle={() => toggle(node.rel)}
              />
              <TreeCell
                side="right"
                node={node}
                depth={depth}
                rails={rails}
                last={last}
                expandable={expandable}
                expanded={isExpanded}
                present={node.right !== null}
                size={node.right?.size ?? null}
                modified={node.right?.modified ?? null}
                onToggle={() => toggle(node.rel)}
              />
            </div>
          ))}
          {rows.length === 0 ? <div className="pane-empty-row">{t("pane.empty")}</div> : null}
        </div>
      </div>

      {tab.result.truncated ? <div className="diff-banner warn">{t("misc.directoryTruncated")}</div> : null}
    </div>
  );
}

/**
 * The four kinds of row, each a switch with its count.
 *
 * This is what a directory comparison amounts to — how many files match, differ, or
 * exist on one side only — so it belongs above the trees it describes rather than in
 * a panel off to the side.
 */
function Filters({ tab }: { tab: DirectoryTab }) {
  const app = useApp();
  const { t } = app;
  const rows: { key: keyof DirectoryTab["filters"]; label: string; icon: string; count: number }[] = [
    { key: "same", label: t("filter.same"), icon: "equal", count: tab.result.same },
    { key: "different", label: t("filter.different"), icon: "modified", count: tab.result.different },
    { key: "leftOnly", label: t("filter.leftOnly"), icon: "leftOnly", count: tab.result.leftOnly },
    { key: "rightOnly", label: t("filter.rightOnly"), icon: "rightOnly", count: tab.result.rightOnly },
    { key: "renamed", label: t("filter.renamed"), icon: "sync", count: tab.result.renamed ?? 0 },
  ];

  /*
   * Icon and count, with the name in the tooltip. The names made the row long
   * enough to need a second one, and a toolbar whose height depends on what is
   * open makes the trees below it jump about every time a comparison is re-run.
   */
  return (
    <>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className={`chip filter-chip${tab.filters[row.key] ? " checked" : ""}`}
          data-filter={row.key}
          title={`${row.label} — ${row.count}`}
          aria-label={`${row.label} — ${row.count}`}
          aria-pressed={tab.filters[row.key]}
          onClick={() => app.setDirectoryFilters({ ...tab.filters, [row.key]: !tab.filters[row.key] })}
        >
          <Icon name={row.icon} size={13} />
          <span className="count">{row.count}</span>
        </button>
      ))}
    </>
  );
}

/**
 * The file masks, where a folder comparison can reach them.
 *
 * They were only in the settings dialog, which is the wrong place for something you
 * change while looking at the result. Applying one re-runs the comparison, so the
 * change is committed on Enter or on leaving the box rather than per keystroke.
 */
function MaskBox() {
  const app = useApp();
  const { t, settings } = app;
  const [draft, setDraft] = useState(settings.includeMasks.join(";"));

  useEffect(() => setDraft(settings.includeMasks.join(";")), [settings.includeMasks]);

  const apply = async () => {
    const masks = draft.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
    if (masks.join(";") === settings.includeMasks.join(";")) return;
    await app.updateSettings({ includeMasks: masks });
    await app.reloadActive();
  };

  return (
    <span className="mask-box" title={t("filter.masksHint")}>
      <Icon name="filter" size={13} />
      <input
        className="find-input"
        data-field="includeMasks"
        value={draft}
        spellCheck={false}
        placeholder={t("filter.masks")}
        aria-label={t("filter.masks")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void apply()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void apply();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(settings.includeMasks.join(";"));
          }
        }}
      />
    </span>
  );
}

/**
 * The synchronisation bar, on a folder-sync session only.
 *
 * Preview is not optional decoration: the plan it produces is the thing that runs,
 * so what is on screen and what happens cannot drift apart. Until there is a plan
 * the Run button has nothing to do and says so.
 */
function SyncBar({ tab }: { tab: DirectoryTab }) {
  const app = useApp();
  const { t } = app;
  const sync = tab.sync;
  if (!sync) return null;

  const plan = sync.plan;
  const copies = plan ? plan.actions.filter((action) => action.operation.startsWith("copy")).length : 0;
  const deletions = plan ? plan.actions.length - copies : 0;

  return (
    <div className="sync-bar">
      <span className="sync-bar-title">
        <Icon name="sync" size={13} />
        {t("sync.title")}
      </span>

      <select
        className="select"
        data-field="syncMode"
        value={sync.mode}
        aria-label={t("sync.mode")}
        onChange={(event) => void app.planDirectorySync(tab, { mode: event.target.value as SyncMode })}
      >
        {SYNC_MODES.map((mode) => (
          <option key={mode} value={mode}>{t(`sync.mode.${mode}` as never)}</option>
        ))}
      </select>

      <button
        type="button"
        className={`chip${sync.allowDaylightShift ? " checked" : ""}`}
        data-command="sync.dst"
        title={t("sync.dst")}
        onClick={() => void app.planDirectorySync(tab, { allowDaylightShift: !sync.allowDaylightShift })}
      >
        <Icon name="clock" size={13} />
        <span>{t("sync.dst")}</span>
      </button>

      <button
        type="button"
        className="chip"
        data-command="sync.preview"
        title={t("sync.preview")}
        onClick={() => void app.planDirectorySync(tab, {})}
      >
        <Icon name="find" size={13} />
        <span>{t("sync.preview")}</span>
      </button>

      <span className="tree-spacer" />

      {plan ? (
        <span className="sync-counts">
          <span className="count-added">{t("sync.copies")} {copies}</span>
          <span className="count-removed">{t("sync.deletions")} {deletions}</span>
        </span>
      ) : (
        <span className="tree-hint">{t("sync.notPlanned")}</span>
      )}

      <button
        type="button"
        className="chip danger"
        data-command="sync.run"
        title={plan && plan.actions.length > 0 ? t("sync.run") : t("sync.nothing")}
        disabled={!plan || plan.actions.length === 0}
        onClick={() => void app.runDirectorySync(tab)}
      >
        <Icon name="sync" size={13} />
        <span>{t("sync.run")}</span>
      </button>
    </div>
  );
}


function TreeCell({
  side,
  node,
  depth,
  rails,
  last,
  expandable,
  expanded,
  present,
  size,
  modified,
  onToggle,
}: {
  side: "left" | "right";
  node: TreeNode;
  depth: number;
  rails: boolean[];
  last: boolean;
  expandable: boolean;
  expanded: boolean;
  present: boolean;
  size: number | null;
  modified: number | null;
  onToggle: () => void;
}) {
  if (!present) {
    // The row still exists on this side so the two trees stay level.
    return <div className={`tree-cell missing side-${side}`} aria-hidden="true" />;
  }

  return (
    <div className={`tree-cell side-${side}`}>
      <span className="tree-name" title={node.rel}>
        {/*
          * The indent is drawn rather than padded: one slot per level, the earlier
          * ones carrying their branch's line and the last one the elbow into this
          * row. A tree whose levels are only spaced apart leaves the eye to guess
          * which folder a deep file belongs to.
          */}
        {depth > 0 ? (
          <span className="tree-indent" aria-hidden="true">
            {rails.map((rail, level) => (
              <span key={level} className={rail ? "tree-rail on" : "tree-rail"} />
            ))}
            <span className={last ? "tree-rail elbow last" : "tree-rail elbow"} />
          </span>
        ) : null}
        {expandable ? (
          <button
            type="button"
            className="tree-twisty"
            tabIndex={-1}
            aria-label={node.name}
            onMouseDown={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <Icon name={expanded ? "down" : "next"} size={13} />
          </button>
        ) : (
          <span className="tree-twisty placeholder" />
        )}
        {/*
          * Kind and state, in that order and never in one glyph: the icon says what
          * the file is, the marker beside it says how the two sides differ, and the
          * marker's slot is held open on identical rows so the names stay in line.
          */}
        <Icon name={fileIcon(node.name, node.directory)} size={14} className="tree-kind" />
        <span className={`tree-mark status-${node.status}`}>
          {node.status === "same" ? null : <Icon name={STATUS_ICON[node.status]} size={12} />}
        </span>
        <span className="tree-label">{node.name}</span>
      </span>
      <span className="tree-size">{node.directory ? "" : formatBytes(size)}</span>
      <span className="tree-date">{stamp(modified)}</span>
    </div>
  );
}

function stamp(value: number | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

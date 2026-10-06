/**
 * The git view: a repository's changes, and the history behind them.
 *
 * Working tree, staged and untracked entries are listed together with their status;
 * picking one opens the right pair of blobs as a normal comparison, so everything the
 * two-way view can do — word highlighting, printing, copying — works on a commit as
 * well as on two files. A conflicted file opens as a 3-way merge instead, built from
 * the three stages git still has in the index.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraph } from "../../core/gitGraph.js";
import { paneHeaderStyle } from "../../core/themes.js";
import { api, type CommitInfo, type GitChange } from "../api.js";
import { GitGraph } from "../GitGraph.js";
import { Icon } from "../icons.js";
import { useApp, type GitTab } from "../state.js";

const SCOPE_ICON: Record<string, string> = {
  staged: "stage",
  unstaged: "modified",
  untracked: "plus",
  conflicted: "conflict",
  commit: "commit",
  range: "branch",
};

export function GitView({ tab }: {
  tab: GitTab;
}) {
  const app = useApp();
  const { t } = app;
  const [commits, setCommits] = useState<CommitInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.gitLog(120)
      .then((list) => {
        if (!cancelled) setCommits(list);
      })
      .catch(() => setCommits([]));
    return () => {
      cancelled = true;
    };
  }, [tab.repository.path, tab.view]);

  const isConflicted = (change: GitChange) =>
    change.scope === "conflicted" || tab.conflicted.includes(change.path);

  // Lanes and edges for the whole history, worked out once: every row reads its
  // own line out of it, and the layout never depends on what is scrolled into view.
  const graph = useMemo(() => buildGraph(commits), [commits]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  return (
    <div className="git-view">
      {/* One column, full width: a repository has one root, and the two-column
          grid the comparisons use left this header filling only half the row. */}
      <div className="pane-headers one-up">
        <div
          className="pane-header"
          style={paneHeaderStyle(
            app.settings.headerColors.local,
            app.settings.theme,
            app.settings.customTheme,
          )}
        >
          <Icon name="repository" size={15} />
          <span className="pane-path" title={tab.repository.path}>{tab.repository.path}</span>
          <span className="pane-tag">
            <Icon name="branch" size={13} />
            {tab.repository.branch ?? tab.repository.head ?? "-"}
          </span>
        </div>
      </div>

      <div
        className="git-body"
        style={{ gridTemplateColumns: `${app.settings.gitSplit}fr 5px ${1 - app.settings.gitSplit}fr` }}
        ref={bodyRef}
      >
        {/* History on the left, and the changes of whatever is selected in it
            on the right: the list on the right is what the row on the left
            contains, so it reads left to right like everything else here. */}
        <section className="git-history">
          <h3>
            <Icon name="clock" size={14} />
            History
            <span className="count">{commits.length}</span>
          </h3>
          <div className="git-list" role="listbox">
            {commits.map((commit, index) => (
              <button
                key={commit.sha}
                type="button"
                role="option"
                aria-selected={tab.view.mode === "commit" && tab.view.sha === commit.sha}
                className={`git-row commit${tab.view.mode === "commit" && tab.view.sha === commit.sha ? " selected" : ""}`}
                data-commit={commit.shortSha}
                data-lane={graph.rows[index]?.lane}
                data-merge={graph.rows[index]?.merge ? "1" : undefined}
                onClick={() => app.setGitView({ mode: "commit", sha: commit.sha })}
              >
                {/* The graph in place of the commit icon: it says everything the
                    icon did and the shape of the history besides. */}
                {graph.rows[index]
                  ? <GitGraph row={graph.rows[index]} lanes={graph.lanes} />
                  : <Icon name="commit" size={14} />}
                <span className="git-sha">{commit.shortSha}</span>
                <span className="git-subject" title={`${commit.author} — ${commit.date}`}>{commit.subject}</span>
                {commit.refs.length > 0 ? (
                  <span className="git-refs">
                    {commit.refs.slice(0, 2).map((ref) => (
                      <span className="git-ref" key={ref} title={ref}>{ref}</span>
                    ))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="git-actions">
            <button
              type="button"
              className={`panel-button${tab.view.mode === "work" ? " checked" : ""}`}
              onClick={() => app.setGitView({ mode: "work" })}
            >
              <Icon name="modified" size={15} />
              <span>{t("label.changes")}</span>
            </button>
          </div>
        </section>

        {/* Drag to give either list more of the row. The ratio is kept, not a
            width, so resizing the window keeps the proportions. */}
        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("tip.splitter")}
          title={t("tip.splitter")}
          data-splitter="git"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = true;
          }}
          onPointerMove={(event) => {
            if (!dragging.current || !bodyRef.current) return;
            const box = bodyRef.current.getBoundingClientRect();
            const share = (event.clientX - box.left) / box.width;
            void app.updateSettings({ gitSplit: Math.min(0.8, Math.max(0.2, share)) });
          }}
          onPointerUp={(event) => {
            dragging.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onDoubleClick={() => void app.updateSettings({ gitSplit: 0.5 })}
        />

        <section className="git-changes">
          <h3>
            <Icon name="list" size={14} />
            {t("label.changes")}
            <span className="count">{tab.changes.length}</span>
            <button
              type="button"
              className="icon-button"
              data-command="view.refresh"
              title={t("tip.refresh")}
              onClick={() => app.reloadActive()}
            >
              <Icon name="refresh" size={14} />
            </button>
          </h3>
          <div className="git-list" role="listbox">
            {tab.changes.map((change, index) => (
              <button
                key={`${change.scope}:${change.path}:${index}`}
                type="button"
                role="option"
                aria-selected={tab.selected?.path === change.path && tab.selected?.scope === change.scope}
                className={`git-row scope-${change.scope}${isConflicted(change) ? " conflicted" : ""}${tab.selected === change ? " selected" : ""}`}
                data-change={change.path}
                onClick={() => app.setGitSelection(change)}
                onDoubleClick={() => {
                  if (isConflicted(change)) void app.openRepositoryConflict(tab, change.path);
                  else void app.openGitChange(tab, change);
                }}
              >
                <Icon name={SCOPE_ICON[change.scope] ?? "file"} size={14} />
                <span className="git-path" title={change.path}>{change.path}</span>
                <span className="git-status">{change.status}</span>
                {change.added !== null ? <span className="git-add">+{change.added}</span> : null}
                {change.deleted !== null ? <span className="git-del">-{change.deleted}</span> : null}
              </button>
            ))}
            {tab.changes.length === 0 ? <div className="pane-empty-row">{t("status.same")}</div> : null}
          </div>
          <div className="git-actions">
            <button
              type="button"
              className="panel-button"
              disabled={!tab.selected}
              title={t("cmd.file.compareFiles")}
              onClick={() => {
                if (tab.selected) void app.openGitChange(tab, tab.selected);
              }}
            >
              <Icon name="compareFiles" size={15} />
              <span>{t("tab.files")}</span>
            </button>
            <button
              type="button"
              className="panel-button"
              disabled={!tab.selected || !isConflicted(tab.selected)}
              title={t("cmd.file.openConflict")}
              onClick={() => {
                if (tab.selected) void app.openRepositoryConflict(tab, tab.selected.path);
              }}
            >
              <Icon name="merge" size={15} />
              <span>{t("tab.merge")}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type CommitInfo,
  type DiffToolRegistration,
  type GitChange,
  type GitView,
  type RepoInfo,
  type SessionSummary,
  type Settings,
} from "./api";
import { Icon } from "./icons";
import { SplitPane } from "./SplitPane";
import { statusText, type Translate } from "./i18n";

type Props = {
  t: Translate;
  language: Settings["language"];
  settings: Settings;
  gitAvailable: boolean;
  initialRepo: RepoInfo | null;
  recent: string[];
  onRepoChange: (repo: RepoInfo | null) => void;
  onSession: (summary: SessionSummary) => void;
  onError: (error: unknown) => void;
  pickDirectory: (title: string) => Promise<string | null>;
  copyText: (value: string) => void;
  children: React.ReactNode;
};

const COMMIT_PAGE = 100;

/**
 * The Git tab: what changed in the repository (working tree, a commit, or between two
 * revisions) on the left, and the selected change rendered in the diff panes on the right.
 */
export function GitPanel(props: Props) {
  const { t, language, settings, onSession, onError, onRepoChange } = props;
  const [repo, setRepo] = useState<RepoInfo | null>(props.initialRepo);
  const [view, setView] = useState<GitView>({ mode: "work" });
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [commit, setCommit] = useState<CommitInfo | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [commitLimit, setCommitLimit] = useState(COMMIT_PAGE);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState({ from: "HEAD~1", to: "HEAD" });
  const [difftool, setDifftool] = useState<DiffToolRegistration | null>(null);
  const [showDifftool, setShowDifftool] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const viewRef = useRef(view);
  viewRef.current = view;

  const loadChanges = useCallback(async (next: GitView, quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const result = await api.changes(next);
      setRepo(result.repo);
      onRepoChange(result.repo);
      setChanges(result.changes);
      setCommit(result.commit);
    } catch (error) {
      if (!quiet) onError(error);
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [onError, onRepoChange]);

  const openRepository = useCallback(async (target: string) => {
    if (!target) return;
    setBusy(true);
    try {
      const result = await api.openRepository(target);
      setRepo(result.repo);
      onRepoChange(result.repo);
      setView({ mode: "work" });
      setChanges(result.changes.changes);
      setCommit(null);
      setSelected("");
      setPathDraft("");
      setCommits(await api.log(COMMIT_PAGE).then((response) => response.commits).catch(() => []));
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onError, onRepoChange]);

  useEffect(() => {
    if (!props.initialRepo) return;
    void loadChanges({ mode: "work" });
    api.log(COMMIT_PAGE).then((response) => setCommits(response.commits)).catch(() => undefined);
  }, [props.initialRepo, loadChanges]);

  useEffect(() => {
    if (!repo) return;
    api.log(commitLimit).then((response) => setCommits(response.commits)).catch(() => undefined);
  }, [repo?.path, commitLimit]);

  useEffect(() => {
    if (!repo || !settings.autoRefresh) return;
    const timer = window.setInterval(() => {
      if (viewRef.current.mode === "work") void loadChanges(viewRef.current, true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [repo?.path, settings.autoRefresh, loadChanges]);

  useEffect(() => {
    if (!showDifftool || difftool) return;
    api.diffTool().then(setDifftool).catch(onError);
  }, [showDifftool, difftool, onError]);

  const selectChange = useCallback(async (change: GitChange, next: GitView) => {
    setSelected(changeKey(change));
    try {
      const result = await api.openChange(next, change);
      onSession(result.session);
    } catch (error) {
      onError(error);
    }
  }, [onSession, onError]);

  const groups = useMemo(() => groupChanges(changes, view), [changes, view]);

  const browse = async () => {
    const picked = await props.pickDirectory(t("gitRepository"));
    if (picked) await openRepository(picked);
  };

  return (
    <SplitPane direction="row" className="git-layout" initial={0.26} min={0.16} max={0.6} storageKey="git-main">
      <aside className="git-sidebar">
        <div className="repo-bar">
          <button type="button" className="btn primary" onClick={browse} title={t("gitOpenRepo")}>
            <Icon name="repo" /> {t("gitOpenRepo")}
          </button>
          <div className="repo-path-row">
            <input
              className="input"
              placeholder={t("gitRepository")}
              value={pathDraft || repo?.path || ""}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void openRepository(pathDraft || repo?.path || "");
              }}
            />
            <button
              type="button"
              className="btn icon"
              title={t("gitRefresh")}
              onClick={() => (pathDraft ? void openRepository(pathDraft) : void loadChanges(view))}
            >
              <Icon name="refresh" />
            </button>
          </div>
          {props.recent.length > 0 && (
            <select
              className="input"
              value=""
              onChange={(event) => {
                if (event.target.value) void openRepository(event.target.value);
              }}
            >
              <option value="">{t("gitRecent")}</option>
              {props.recent.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          )}
          {repo && (
            <div className="repo-meta">
              <span className="badge branch">
                <Icon name="branch" /> {repo.branch ?? t("gitDetached")}
              </span>
              {repo.head && <span className="badge">{repo.head}</span>}
              {repo.ahead > 0 && <span className="badge ahead">↑{repo.ahead}</span>}
              {repo.behind > 0 && <span className="badge behind">↓{repo.behind}</span>}
            </div>
          )}
        </div>

        {!props.gitAvailable && <p className="notice warn">{t("gitNotInstalled")}</p>}
        {!repo && props.gitAvailable && <p className="notice">{t("gitNoRepo")}</p>}

        {repo && (
          <>
            <div className="view-tabs">
              {([
                ["work", t("gitViewWork")],
                ["commit", t("gitViewCommits")],
                ["range", t("gitViewRange")],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`view-tab${view.mode === mode ? " is-active" : ""}`}
                  onClick={() => {
                    const next: GitView = mode === "work"
                      ? { mode: "work" }
                      : mode === "commit"
                        ? { mode: "commit", sha: commits[0]?.sha ?? "HEAD" }
                        : { mode: "range", from: range.from, to: range.to };
                    setView(next);
                    void loadChanges(next);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {view.mode === "commit" && (
              <div className="commit-list">
                {commits.map((item) => (
                  <button
                    key={item.sha}
                    type="button"
                    className={`commit-item${view.mode === "commit" && view.sha === item.sha ? " is-active" : ""}`}
                    onClick={() => {
                      const next: GitView = { mode: "commit", sha: item.sha };
                      setView(next);
                      void loadChanges(next);
                    }}
                    title={`${item.sha}\n${item.author} <${item.email}>\n${item.date}`}
                  >
                    <span className="commit-sha">{item.shortSha}</span>
                    <span className="commit-subject">{item.subject}</span>
                    <span className="commit-meta">{item.author} · {formatDate(item.date)}</span>
                  </button>
                ))}
                {commits.length >= commitLimit && (
                  <button type="button" className="btn ghost wide" onClick={() => setCommitLimit(commitLimit + COMMIT_PAGE)}>
                    {t("gitLoadMore")}
                  </button>
                )}
              </div>
            )}

            {view.mode === "range" && (
              <div className="range-form">
                <label>
                  {t("gitFrom")}
                  <input
                    className="input"
                    value={range.from}
                    onChange={(event) => setRange({ ...range, from: event.target.value })}
                  />
                </label>
                <label>
                  {t("gitTo")}
                  <input
                    className="input"
                    value={range.to}
                    onChange={(event) => setRange({ ...range, to: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const next: GitView = { mode: "range", from: range.from.trim() || "HEAD", to: range.to.trim() };
                    setView(next);
                    void loadChanges(next);
                  }}
                >
                  {t("gitCompare")}
                </button>
              </div>
            )}

            <div className="change-list">
              {busy && changes.length === 0 && <p className="notice">{t("statusLoading")}</p>}
              {!busy && changes.length === 0 && <p className="notice">{t("gitNoChanges")}</p>}
              {groups.map((group) => (
                <section key={group.title} className="change-group">
                  <h3>
                    {t(group.title)} <span className="count">{group.items.length}</span>
                  </h3>
                  {group.items.map((change) => {
                    const key = changeKey(change);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`change-item${selected === key ? " is-active" : ""} scope-${change.scope}`}
                        onClick={() => void selectChange(change, view)}
                        title={change.oldPath ? `${change.oldPath} → ${change.path}` : change.path}
                      >
                        <span className={`status-dot ${change.status.replace(/\s+/g, "-").toLowerCase()}`} />
                        <span className="change-path">{change.path}</span>
                        <span className="change-status">{statusText(change.status, language)}</span>
                        {(change.added !== null || change.deleted !== null) && (
                          <span className="change-stat">
                            {change.added !== null && <em className="plus">+{change.added}</em>}
                            {change.deleted !== null && <em className="minus">-{change.deleted}</em>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>

            {view.mode === "commit" && commit && (
              <div className="commit-detail" title={commit.sha}>
                <strong>{commit.subject}</strong>
                <span>{commit.author} · {formatDate(commit.date)}</span>
              </div>
            )}
          </>
        )}

        <div className="difftool-box">
          <button type="button" className="btn ghost wide" onClick={() => setShowDifftool(!showDifftool)}>
            <Icon name="plug" /> {t("gitDiffToolTitle")}
          </button>
          {showDifftool && (
            <div className="difftool-body">
              <p>{t("gitDiffToolBody")}</p>
              <code>{difftool?.command ?? props.settings.settingsPath}</code>
              <div className="difftool-actions">
                <span className={`badge ${difftool?.registered ? "ok" : ""}`}>
                  {difftool?.registered ? t("gitDiffToolRegistered") : t("gitDiffToolNotRegistered")}
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => api.setDiffTool(!difftool?.registered).then(setDifftool).catch(onError)}
                >
                  {difftool?.registered ? t("gitDiffToolUnregister") : t("gitDiffToolRegister")}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => props.copyText((difftool?.lines ?? []).join("\n"))}
                >
                  {t("gitDiffToolCopy")}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="git-diff">{props.children}</div>
    </SplitPane>
  );
}

type Group = { title: Parameters<Translate>[0]; items: GitChange[] };

function groupChanges(changes: GitChange[], view: GitView): Group[] {
  if (view.mode === "commit") return [{ title: "gitCommitFiles", items: changes }];
  if (view.mode === "range") return [{ title: "gitRangeFiles", items: changes }];
  const groups: Group[] = [
    { title: "gitConflicted", items: changes.filter((item) => item.scope === "conflicted") },
    { title: "gitStaged", items: changes.filter((item) => item.scope === "staged") },
    { title: "gitUnstaged", items: changes.filter((item) => item.scope === "unstaged") },
    { title: "gitUntracked", items: changes.filter((item) => item.scope === "untracked") },
  ];
  return groups.filter((group) => group.items.length > 0);
}

function changeKey(change: GitChange): string {
  return `${change.scope}:${change.path}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

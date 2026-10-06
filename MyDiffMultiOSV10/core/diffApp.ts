import fs from "node:fs";
import path from "node:path";
import { compareDirectories, type DirectoryCompareResult } from "./dirCompare.js";
import { ApiError } from "./errors.js";
import {
  blob,
  commitChanges,
  commitInfo,
  diffToolStatus,
  firstParent,
  log,
  openRepository,
  rangeChanges,
  registerDiffTool,
  repoInfo,
  runGit,
  unifiedDiff,
  unregisterDiffTool,
  workingChanges,
  type CommitInfo,
  type DiffToolRegistration,
  type GitChange,
  type RepoInfo,
} from "./git.js";
import { SettingsStore, type AppSettings } from "./settings.js";
import { DiffSession, type SessionOrigin, type SessionSummary, type SideSource } from "./session.js";

/** Which set of git changes the Git tab is showing. */
export type GitView =
  | { mode: "work" }
  | { mode: "commit"; sha: string }
  | { mode: "range"; from: string; to: string };

export type GitChangeList = {
  repo: RepoInfo;
  view: GitView;
  changes: GitChange[];
  /** Commit being shown, for the header line of the commit view. */
  commit: CommitInfo | null;
};

/** A comparison the app can (re)load — kept so Reload can repeat it. */
export type DiffRequest =
  | { kind: "files"; left: string; right: string }
  | { kind: "git"; view: GitView; change: GitChange };

const MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * All of MyDiff's state that does not belong to the UI: settings, the loaded comparison,
 * the open repository and the directory compare result. The HTTP server is a thin shell
 * over this class so the Electron and web builds behave identically.
 */
export class DiffApp {
  readonly settings = new SettingsStore();

  private session: DiffSession | null = null;
  private request: DiffRequest | null = null;
  private repo: RepoInfo | null = null;
  private view: GitView = { mode: "work" };
  private directory: DirectoryCompareResult | null = null;
  private pending: { left: string; right: string } | null = null;
  private launcherPath: string;

  constructor(options: { launcher?: string } = {}) {
    this.launcherPath = options.launcher || defaultLauncher();
  }

  /** A left/right pair handed over on the command line (git difftool). */
  setPending(pair: { left: string; right: string } | null): void {
    this.pending = pair;
  }

  takePending(): { left: string; right: string } | null {
    const pair = this.pending;
    this.pending = null;
    return pair;
  }

  get launcher(): string {
    return this.launcherPath;
  }

  summary(): SessionSummary | null {
    return this.session?.summary() ?? null;
  }

  currentSession(): DiffSession {
    if (!this.session) throw new ApiError("No comparison is loaded.", "NO_SESSION", 400);
    return this.session;
  }

  currentRequest(): DiffRequest | null {
    return this.request;
  }

  repository(): RepoInfo | null {
    return this.repo;
  }

  gitView(): GitView {
    return this.view;
  }

  directoryResult(): DirectoryCompareResult | null {
    return this.directory;
  }

  /* ---------------- file comparison ---------------- */

  async openFiles(left: string, right: string): Promise<SessionSummary> {
    const leftPath = left ? path.resolve(left) : "";
    const rightPath = right ? path.resolve(right) : "";
    const leftExists = Boolean(leftPath) && isFile(leftPath);
    const rightExists = Boolean(rightPath) && isFile(rightPath);
    if (!leftExists && !rightExists) {
      throw new ApiError(`File not found: ${leftPath || rightPath}`, "NO_FILE", 400);
    }

    const leftSide: SideSource = leftExists
      ? { label: leftPath, version: fileVersion(leftPath), path: leftPath, data: readFile(leftPath) }
      : { label: leftPath || "(none)", version: "none", path: leftPath || null, missing: true, data: EMPTY };
    const rightSide: SideSource = rightExists
      ? { label: rightPath, version: fileVersion(rightPath), path: rightPath, data: readFile(rightPath) }
      : { label: rightPath || "(none)", version: "none", path: rightPath || null, missing: true, data: EMPTY };

    this.session = new DiffSession(leftSide, rightSide, {
      kind: "files",
      detail: `${leftPath || "(none)"} ↔ ${rightPath || "(none)"}`,
    });
    this.request = { kind: "files", left: leftPath, right: rightPath };
    if (leftExists && rightExists) this.settings.rememberFiles({ left: leftPath, right: rightPath });
    return this.session.summary();
  }

  /** Repeats the current comparison against what is on disk / in git now. */
  async reload(): Promise<SessionSummary> {
    const request = this.request;
    if (!request) throw new ApiError("No comparison is loaded.", "NO_SESSION", 400);
    if (request.kind === "files") return this.openFiles(request.left, request.right);
    return this.openChange(request.view, request.change);
  }

  /* ---------------- directory comparison ---------------- */

  compareDirectories(left: string, right: string, excludes?: string[]): DirectoryCompareResult {
    const result = compareDirectories(left, right, excludes ?? this.settings.get().excludes);
    this.directory = result;
    this.settings.rememberDirectories({ left: result.left, right: result.right });
    return result;
  }

  /** Opens one directory-compare entry in the file panes. */
  async openDirectoryEntry(rel: string): Promise<SessionSummary> {
    if (!this.directory) throw new ApiError("Compare two folders first.", "NO_DIR_RESULT", 400);
    const entry = this.directory.entries.find((item) => item.rel === rel);
    if (!entry) throw new ApiError(`Unknown entry: ${rel}`, "NO_ENTRY", 400);
    const left = entry.leftSize === null ? "" : path.join(this.directory.left, rel);
    const right = entry.rightSize === null ? "" : path.join(this.directory.right, rel);
    return this.openFiles(left, right);
  }

  /* ---------------- git ---------------- */

  async openRepo(target: string): Promise<RepoInfo> {
    const info = await openRepository(target);
    this.repo = info;
    this.view = { mode: "work" };
    this.settings.rememberRepository(info.path);
    return info;
  }

  async refreshRepo(): Promise<RepoInfo | null> {
    if (!this.repo) return null;
    this.repo = await repoInfo(this.repo.path);
    return this.repo;
  }

  requireRepo(): RepoInfo {
    if (!this.repo) throw new ApiError("Open a git repository first.", "NO_REPO", 400);
    return this.repo;
  }

  async listChanges(view: GitView = this.view): Promise<GitChangeList> {
    const repo = this.requireRepo();
    this.view = view;
    if (view.mode === "commit") {
      return {
        repo,
        view,
        changes: await commitChanges(repo.path, view.sha),
        commit: await commitInfo(repo.path, view.sha),
      };
    }
    if (view.mode === "range") {
      return { repo, view, changes: await rangeChanges(repo.path, view.from, view.to), commit: null };
    }
    return { repo, view, changes: await workingChanges(repo.path), commit: null };
  }

  async history(max: number, filePath = ""): Promise<CommitInfo[]> {
    const repo = this.requireRepo();
    return log(repo.path, max, filePath);
  }

  /** Loads the left/right blobs for one git change into the panes. */
  async openChange(view: GitView, change: GitChange): Promise<SessionSummary> {
    const repo = this.requireRepo();
    const sides = await this.sidesForChange(repo.path, view, change);
    this.session = new DiffSession(sides.left, sides.right, sides.origin);
    this.request = { kind: "git", view, change };
    this.view = view;
    return this.session.summary();
  }

  async unifiedDiffText(): Promise<string> {
    const request = this.request;
    if (!request || request.kind !== "git") return "";
    const repo = this.requireRepo();
    const commit = request.view.mode === "commit" ? { sha: request.view.sha } : undefined;
    return unifiedDiff(repo.path, request.change, commit);
  }

  private async sidesForChange(
    repo: string,
    view: GitView,
    change: GitChange,
  ): Promise<{ left: SideSource; right: SideSource; origin: SessionOrigin }> {
    const oldPath = change.oldPath || change.path;

    if (view.mode === "commit") {
      const parent = await firstParent(repo, view.sha);
      const left = await this.side(repo, parent, oldPath, change.status === "Added");
      const right = await this.side(repo, view.sha, change.path, change.status === "Deleted");
      return { left, right, origin: origin(change, `${left.version} → ${right.version}`) };
    }

    if (view.mode === "range") {
      const left = await this.side(repo, view.from, oldPath, change.status === "Added");
      const right = await this.side(repo, view.to, change.path, change.status === "Deleted");
      return { left, right, origin: origin(change, `${left.version} → ${right.version}`) };
    }

    if (change.scope === "untracked") {
      const right = await this.side(repo, "", change.path, false);
      return {
        left: { label: change.path, version: "none", missing: true, data: EMPTY },
        right,
        origin: origin(change, `untracked → ${right.version}`),
      };
    }

    if (change.scope === "conflicted") {
      return {
        left: await this.side(repo, ":2", change.path, false),
        right: await this.side(repo, ":3", change.path, false),
        origin: origin(change, "ours → theirs"),
      };
    }

    if (change.scope === "staged") {
      return {
        left: await this.side(repo, "HEAD", oldPath, change.status === "Added"),
        right: await this.side(repo, ":", change.path, change.status === "Deleted"),
        origin: origin(change, "HEAD → index"),
      };
    }

    return {
      left: await this.side(repo, ":", oldPath, change.status === "Untracked"),
      right: await this.side(repo, "", change.path, change.status === "Deleted"),
      origin: origin(change, "index → working tree"),
    };
  }

  /** One side of a git comparison, with the version badge the pane title shows. */
  private async side(
    repo: string,
    revision: string,
    filePath: string,
    expectMissing: boolean,
  ): Promise<SideSource & { version: string }> {
    const result = await blob(repo, revision, filePath);
    const missing = result.missing || expectMissing;
    const version = await versionLabel(repo, revision);
    return {
      label: filePath,
      version: missing ? `${version} · none` : version,
      path: revision === "" ? path.join(repo, filePath) : null,
      revision: revision === "" ? null : revision,
      missing,
      data: missing ? EMPTY : result.data,
    };
  }

  /* ---------------- difftool ---------------- */

  diffTool(): Promise<DiffToolRegistration> {
    return diffToolStatus(this.launcherPath);
  }

  registerAsDiffTool(): Promise<DiffToolRegistration> {
    return registerDiffTool(this.launcherPath);
  }

  unregisterAsDiffTool(): Promise<DiffToolRegistration> {
    return unregisterDiffTool(this.launcherPath);
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    return this.settings.update(patch);
  }
}

const EMPTY = new Uint8Array(0);

function origin(change: GitChange, detail: string): SessionOrigin {
  return { kind: "git", detail, file: change.path };
}

function shortName(revision: string): string {
  return /^[0-9a-f]{40}$/i.test(revision) ? revision.slice(0, 7) : revision;
}

/**
 * The version badge for one side: `working tree`, `index`, `ours`/`theirs`, a short commit
 * sha, or a ref name with the sha it currently points at.
 */
async function versionLabel(repo: string, revision: string): Promise<string> {
  if (revision === "") return "working tree";
  if (revision === ":" || revision === ":0") return "index";
  if (revision === ":2") return "ours";
  if (revision === ":3") return "theirs";
  if (revision === EMPTY_TREE_ID) return "empty";
  const short = shortName(revision);
  if (short !== revision) return short;
  const resolved = await runGit(repo, ["rev-parse", "--short", revision]);
  const sha = resolved.code === 0 ? resolved.stdout.trim() : "";
  return sha && sha !== revision ? `${revision} · ${sha}` : revision;
}

const EMPTY_TREE_ID = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

/** A plain file has no revision, so its "version" is the timestamp on disk. */
function fileVersion(target: string): string {
  try {
    const stat = fs.statSync(target);
    return new Date(stat.mtimeMs).toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return "file";
  }
}

function readFile(target: string): Uint8Array {
  const stat = fs.statSync(target);
  if (stat.size > MAX_FILE_BYTES) {
    throw new ApiError(`File is too large to compare: ${target}`, "TOO_LARGE", 400);
  }
  return fs.readFileSync(target);
}

/**
 * The command a `git difftool` entry should launch. In a packaged build this is the MyDiff
 * executable itself; in a dev run it is whatever started the process, so the Git tab shows
 * the command and lets the user copy or correct it.
 */
export function defaultLauncher(): string {
  return process.env.MYDIFF_LAUNCHER || process.execPath;
}

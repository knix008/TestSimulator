/**
 * The application service behind the HTTP API.
 *
 * Everything that touches the file system, git or the settings file lives here, so the
 * Electron build and the standalone web server share one implementation and the React
 * layer stays a view. Sessions are kept by id: the renderer opens one, then pulls rows
 * for whatever is on screen.
 */
import fs from "node:fs";
import path from "node:path";
import { DOC_EXTENSION } from "./appInfo.js";
import { CompareSession, type CompareSide, type SearchOptions } from "./compareSession.js";
import { containsConflictMarkers, parse as parseConflicts } from "./conflictMarkers.js";
import {
  compareDirectories,
  type CompareDirectoriesOptions,
  type DirectoryCompareResult,
} from "./dirCompare.js";
import { ApiError } from "./errors.js";
import { parseRemotePath, RemoteSession } from "./remote.js";
import { compareWithRemote } from "./remoteCompare.js";
import type { FormatId } from "./formats.js";
import { joinArchivePath, readZipEntry, splitArchivePath } from "./zip.js";
import { groupByOperation, planSync, type SyncMode, type SyncOptions, type SyncPlan } from "./sync.js";
import { applyOperation, renameEntry, type FileOperation, type OperationResult } from "./fileOps.js";
import * as git from "./git.js";
import type { CompareOptions } from "./lineDiff.js";
import { buildResultText, type MergeDocument } from "./mergeDocument.js";
import type { RecentKind } from "./settings.js";
import { SettingsStore } from "./settingsStore.js";
import { detectNewline, readBytes, splitBody, stripBom } from "./textFile.js";
import { merge as threeWayMerge } from "./threeWay.js";

export type PendingRequest =
  | { kind: "diff"; left: string; right: string }
  | { kind: "merge"; base: string; local: string; remote: string; merged: string }
  | { kind: "conflict"; file: string }
  | { kind: "session"; file: string }
  | { kind: "repository"; path: string };

export type MergeSessionInfo = {
  id: string;
  /** Where Save writes. For `git mergetool` this is `$MERGED`. */
  mergedPath: string;
  basePath: string | null;
  localPath: string | null;
  remotePath: string | null;
  /** Set when the merge came from a conflicted file inside a repository. */
  repository: string | null;
  repositoryFile: string | null;
  source: "three-way" | "conflict-file" | "git";
  document: MergeDocument;
};

export type DirectorySessionInfo = {
  id: string;
  result: DirectoryCompareResult;
};

export type GitView =
  | { mode: "work" }
  | { mode: "commit"; sha: string }
  | { mode: "range"; from: string; to: string };

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${(counter += 1)}`;

export class DiffMergeApp {
  readonly settings = new SettingsStore();
  /** Path of the executable a user would register with git; shown in Settings. */
  readonly launcher: string;

  private readonly compares = new Map<string, CompareSession>();
  private readonly merges = new Map<string, MergeSessionInfo>();
  /** Live server connections, one per remote comparison. */
  private readonly remotes = new Map<string, RemoteSession>();
  private readonly directories = new Map<string, DirectorySessionInfo>();
  private repo: git.RepoInfo | null = null;
  private pending: PendingRequest | null = null;

  constructor(options: { launcher?: string } = {}) {
    this.launcher = options.launcher || process.execPath;
  }

  setPending(request: PendingRequest | null): void {
    this.pending = request;
  }

  takePending(): PendingRequest | null {
    const value = this.pending;
    this.pending = null;
    return value;
  }

  private compareOptions(): CompareOptions {
    const settings = this.settings.get();
    return {
      ignoreWhitespace: settings.ignoreWhitespace,
      ignoreCase: settings.ignoreCase,
      ignoreComments: settings.ignoreComments,
      ignoreQuoteStyle: settings.ignoreQuoteStyle,
      ignoreNumberFormat: settings.ignoreNumberFormat,
    };
  }

  /* ---------------------------------------------------------- files */

  openFiles(leftPath: string, rightPath: string, forceHex = false, format?: FormatId): CompareSession {
    const left = fileSide(leftPath);
    const right = fileSide(rightPath);
    const options = { ...this.compareOptions(), forceHex, format };
    const session = new CompareSession(nextId("cmp"), left, right, options);
    this.compares.set(session.id, session);
    this.remember("files", [left.path as string, right.path as string]);
    return session;
  }

  compare(id: string): CompareSession {
    const session = this.compares.get(id);
    if (!session) throw new ApiError("That comparison is no longer open.", "NO_SESSION", 404);
    return session;
  }

  /** Re-reads both sides from disk, keeping the same session id. */
  reloadCompare(id: string): CompareSession {
    const previous = this.compare(id);
    const left = previous.left.path ? fileSide(previous.left.path) : previous.left;
    const right = previous.right.path ? fileSide(previous.right.path) : previous.right;
    const session = new CompareSession(id, left, right, this.compareOptions());
    this.compares.set(id, session);
    return session;
  }

  closeCompare(id: string): void {
    this.compares.delete(id);
  }

  /* ---------------------------------------------------- directories */

  openDirectories(leftRoot: string, rightRoot: string, excludes?: readonly string[]): DirectorySessionInfo {
    const result = compareDirectories(leftRoot, rightRoot, this.directoryOptions(excludes));
    const info: DirectorySessionInfo = { id: nextId("dir"), result };
    this.directories.set(info.id, info);
    this.remember("directories", [result.left, result.right]);
    return info;
  }

  directory(id: string): DirectorySessionInfo {
    const info = this.directories.get(id);
    if (!info) throw new ApiError("That directory comparison is no longer open.", "NO_SESSION", 404);
    return info;
  }

  /** Folder exclusions and file masks, as the settings currently have them. */
  private directoryOptions(excludes?: readonly string[]): CompareDirectoriesOptions {
    const settings = this.settings.get();
    return {
      excludes: excludes ?? settings.excludes,
      includeMasks: settings.includeMasks,
      excludeMasks: settings.excludeMasks,
      detectRenames: settings.detectRenames,
      archives: settings.archives,
    };
  }

  reloadDirectory(id: string): DirectorySessionInfo {
    const previous = this.directory(id);
    const result = compareDirectories(previous.result.left, previous.result.right, this.directoryOptions());
    const info: DirectorySessionInfo = { id, result };
    this.directories.set(id, info);
    return info;
  }

  /**
   * A folder here against a folder on a server.
   *
   * The session is kept open with the comparison: the walk, anything opened from
   * it and anything copied all go through the one connection, and reconnecting per
   * file would dominate the time.
   */
  async openRemoteDirectories(
    localRoot: string,
    remoteUrl: string,
    password: string,
  ): Promise<DirectorySessionInfo> {
    const session = new RemoteSession(parseRemotePath(remoteUrl), password);
    try {
      const settings = this.settings.get();
      const result = await compareWithRemote(localRoot, session, {
        excludes: settings.excludes,
        includeMasks: settings.includeMasks,
        excludeMasks: settings.excludeMasks,
      });
      const info: DirectorySessionInfo = { id: nextId("dir"), result };
      this.directories.set(info.id, info);
      this.remotes.set(info.id, session);
      this.remember("directories", [result.left, result.right]);
      return info;
    } catch (error) {
      session.close();
      throw error;
    }
  }

  /** Renames one entry on one side, and re-reads the comparison. */
  renameDirectoryEntry(id: string, side: "left" | "right", rel: string, nextRel: string): {
    directory: DirectorySessionInfo;
  } {
    const info = this.directory(id);
    renameEntry(side === "left" ? info.result.left : info.result.right, rel, nextRel);
    return { directory: this.reloadDirectory(id) };
  }

  /**
   * What a synchronisation would do, without doing any of it.
   *
   * The plan is computed from the comparison already in hand, so previewing costs
   * nothing and the preview cannot disagree with the run that follows it.
   */
  planSync(id: string, mode: SyncMode, options?: SyncOptions): SyncPlan {
    return planSync(this.directory(id).result.entries, mode, options);
  }

  /**
   * Runs a plan, copies before deletions, and re-reads the folders afterwards.
   *
   * It takes the plan rather than the mode: what runs is then exactly what was
   * shown, even if a file changed on disk between the preview and the confirmation.
   */
  applySync(id: string, plan: SyncPlan): { results: OperationResult[]; directory: DirectorySessionInfo } {
    const info = this.directory(id);
    const results = groupByOperation(plan).map(({ operation, relatives }) =>
      applyOperation(operation, info.result.left, info.result.right, relatives));
    return { results, directory: this.reloadDirectory(id) };
  }

  /** Opens one entry of a directory comparison as a file comparison. */
  openDirectoryEntry(id: string, rel: string): CompareSession {
    const info = this.directory(id);
    const entry = info.result.entries.find((item) => item.rel === rel);
    if (!entry) throw new ApiError(`No such entry: ${rel}`, "NO_FILE", 400);
    const left = entry.status === "rightOnly"
      ? emptySide(path.join(info.result.left, rel), true)
      : fileSide(path.join(info.result.left, rel));
    const right = entry.status === "leftOnly"
      ? emptySide(path.join(info.result.right, rel), true)
      : fileSide(path.join(info.result.right, rel));
    const session = new CompareSession(nextId("cmp"), left, right, this.compareOptions());
    this.compares.set(session.id, session);
    return session;
  }

  /**
   * Copies or deletes entries between the two sides of a directory comparison, then
   * re-walks the trees so the view reflects what is now on disk.
   */
  applyDirectoryOperation(id: string, operation: FileOperation, relatives: readonly string[]): {
    result: OperationResult;
    directory: DirectorySessionInfo;
  } {
    const info = this.directory(id);
    const result = applyOperation(operation, info.result.left, info.result.right, relatives);
    return { result, directory: this.reloadDirectory(id) };
  }

  /* --------------------------------------------------- side editing */

  /** Writes one side of a file comparison back to disk and recomputes the diff. */
  private writeSide(id: string, side: "left" | "right", lines: string[]): CompareSession {
    const session = this.compare(id);
    const target = side === "left" ? session.left.path : session.right.path;
    if (!target) {
      throw new ApiError("That side is not a file on disk, so it cannot be edited.", "READ_ONLY", 400);
    }
    const newline = session.newlineOf(side);
    try {
      fs.writeFileSync(target, lines.join(newline) + (lines.length > 0 ? newline : ""), "utf8");
    } catch (error) {
      throw new ApiError(`Could not write ${target}`, "WRITE", 500, String(error));
    }
    return this.reloadCompare(id);
  }

  /** The "copy these rows to the other side" of a two-way comparison. */
  takeRows(id: string, target: "left" | "right", rows: readonly number[]): CompareSession {
    return this.writeSide(id, target, this.compare(id).takeRows(target, rows));
  }

  /** Every row matching a search, over the whole file. */
  search(id: string, needle: string, options: SearchOptions): number[] {
    return this.compare(id).search(needle, options);
  }

  /** Replaces every match on one side and writes it out. */
  replaceAll(
    id: string,
    side: "left" | "right",
    needle: string,
    replacement: string,
    options: SearchOptions,
  ): { session: CompareSession; replaced: number } {
    const outcome = this.compare(id).replaceAll(side, needle, replacement, options);
    if (outcome.replaced === 0) return { session: this.compare(id), replaced: 0 };
    return { session: this.writeSide(id, side, outcome.lines), replaced: outcome.replaced };
  }

  /** Replaces one line of one side — the in-place edit of a compared file. */
  editRow(id: string, side: "left" | "right", row: number, text: string): CompareSession {
    return this.writeSide(id, side, this.compare(id).replaceRow(side, row, text));
  }

  /* --------------------------------------------------------- merges */

  openThreeWay(basePath: string, localPath: string, remotePath: string, mergedPath: string): MergeSessionInfo {
    const base = readLines(basePath);
    const local = readLines(localPath);
    const remote = readLines(remotePath);
    const document = threeWayMerge(base.lines, local.lines, remote.lines, {
      ...this.compareOptions(),
      newline: local.newline,
      trailingNewline: local.trailingNewline,
    });
    const info: MergeSessionInfo = {
      id: nextId("mrg"),
      mergedPath: path.resolve(mergedPath || localPath),
      basePath: path.resolve(basePath),
      localPath: path.resolve(localPath),
      remotePath: path.resolve(remotePath),
      repository: null,
      repositoryFile: null,
      source: "three-way",
      document,
    };
    this.merges.set(info.id, info);
    this.remember("merge", [info.basePath as string, info.localPath as string, info.remotePath as string, info.mergedPath]);
    return info;
  }

  openConflictFile(target: string): MergeSessionInfo {
    const file = readLines(target);
    if (!containsConflictMarkers(file.lines)) {
      throw new ApiError(
        `No conflict markers were found in ${path.basename(target)}.`,
        "NO_CONFLICTS",
        400,
        `Looked for <<<<<<< in ${target}`,
      );
    }
    const document = parseConflicts(file.lines, { newline: file.newline, trailingNewline: file.trailingNewline });
    const info: MergeSessionInfo = {
      id: nextId("mrg"),
      mergedPath: path.resolve(target),
      basePath: null,
      localPath: null,
      remotePath: null,
      repository: null,
      repositoryFile: null,
      source: "conflict-file",
      document,
    };
    this.merges.set(info.id, info);
    this.remember("conflict", [info.mergedPath]);
    return info;
  }

  /**
   * Opens a file git currently reports as conflicted.
   *
   * The index still holds all three stages, so this produces a real 3-way merge with a
   * base — better than parsing the markers out of the work-tree copy, which loses the
   * ancestor unless `merge.conflictStyle` is `diff3`.
   */
  async openRepositoryConflict(repoPath: string, filePath: string): Promise<MergeSessionInfo> {
    const repo = path.resolve(repoPath);
    const stages = await git.conflictStages(repo, filePath);
    const absolute = path.join(repo, filePath);

    const hasStages = !stages.local.missing || !stages.remote.missing;
    const document = hasStages
      ? threeWayMerge(
        linesOf(stages.base.data),
        linesOf(stages.local.data),
        linesOf(stages.remote.data),
        { ...this.compareOptions(), ...newlineOf(stages.local.data) },
      )
      : parseConflicts(readLines(absolute).lines, newlineOf(readBytes(absolute)));

    const info: MergeSessionInfo = {
      id: nextId("mrg"),
      mergedPath: absolute,
      basePath: null,
      localPath: null,
      remotePath: null,
      repository: repo,
      repositoryFile: filePath,
      source: "git",
      document,
    };
    this.merges.set(info.id, info);
    this.remember("conflict", [absolute]);
    return info;
  }

  mergeSession(id: string): MergeSessionInfo {
    const info = this.merges.get(id);
    if (!info) throw new ApiError("That merge is no longer open.", "NO_SESSION", 404);
    return info;
  }

  /** The renderer owns the resolution state, so it sends the document back to save. */
  async saveMerge(id: string, document: MergeDocument, target?: string): Promise<{ path: string; staged: boolean }> {
    const info = this.mergeSession(id);
    const destination = path.resolve(target || info.mergedPath);
    try {
      fs.writeFileSync(destination, buildResultText(document), "utf8");
    } catch (error) {
      throw new ApiError(`Could not write ${destination}`, "WRITE", 500, String(error));
    }
    this.merges.set(id, { ...info, document, mergedPath: destination });

    let staged = false;
    if (info.repository && info.repositoryFile && destination === info.mergedPath) {
      await git.stageResolved(info.repository, info.repositoryFile).then(() => {
        staged = true;
      }).catch(() => {
        staged = false;
      });
    }
    return { path: destination, staged };
  }

  /* ------------------------------------------------------------ git */

  async openRepository(target: string): Promise<git.RepoInfo> {
    this.repo = await git.openRepository(target);
    this.remember("repository", [this.repo.path]);
    return this.repo;
  }

  repository(): git.RepoInfo | null {
    return this.repo;
  }

  private requireRepo(): git.RepoInfo {
    if (!this.repo) throw new ApiError("No git repository is open.", "NO_REPO", 400);
    return this.repo;
  }

  async refreshRepository(): Promise<git.RepoInfo> {
    const current = this.requireRepo();
    this.repo = await git.repoInfo(current.path);
    return this.repo;
  }

  async changes(view: GitView): Promise<{ changes: git.GitChange[]; commit: git.CommitInfo | null }> {
    const repo = this.requireRepo();
    if (view.mode === "commit") {
      return { changes: await git.commitChanges(repo.path, view.sha), commit: await git.commitInfo(repo.path, view.sha) };
    }
    if (view.mode === "range") {
      return { changes: await git.rangeChanges(repo.path, view.from, view.to), commit: null };
    }
    return { changes: await git.workingChanges(repo.path), commit: null };
  }

  history(max: number, filePath = ""): Promise<git.CommitInfo[]> {
    return git.log(this.requireRepo().path, max, filePath);
  }

  conflictedFiles(): Promise<string[]> {
    return git.conflictedFiles(this.requireRepo().path);
  }

  /** Opens one git change as a two-way comparison of the right pair of blobs. */
  async openChange(view: GitView, change: git.GitChange): Promise<CompareSession> {
    const repo = this.requireRepo();
    const oldPath = change.oldPath || change.path;

    let leftRevision = "HEAD";
    let rightRevision = "";
    if (view.mode === "commit") {
      leftRevision = await git.firstParent(repo.path, view.sha);
      rightRevision = view.sha;
    } else if (view.mode === "range") {
      leftRevision = view.from;
      rightRevision = view.to || "";
    } else if (change.scope === "staged") {
      leftRevision = "HEAD";
      rightRevision = ":";
    } else if (change.scope === "untracked") {
      leftRevision = "";
      rightRevision = "";
    } else {
      leftRevision = ":";
      rightRevision = "";
    }

    const left = change.scope === "untracked" || change.code.startsWith("A")
      ? emptySide(`${label(leftRevision)}:${oldPath}`, true)
      : await blobSide(repo.path, leftRevision, oldPath);
    const right = change.code.startsWith("D")
      ? emptySide(`${label(rightRevision)}:${change.path}`, true)
      : await blobSide(repo.path, rightRevision, change.path);

    const session = new CompareSession(nextId("cmp"), left, right, this.compareOptions());
    this.compares.set(session.id, session);
    return session;
  }

  unifiedDiff(view: GitView, change: git.GitChange): Promise<string> {
    const repo = this.requireRepo();
    return git.unifiedDiff(repo.path, change, view.mode === "commit" ? { sha: view.sha } : undefined);
  }

  toolStatus(): Promise<{ diff: git.ToolRegistration; merge: git.ToolRegistration }> {
    return git.toolStatus(this.launcher);
  }

  /* ---------------------------------------------- session documents */

  /** Writes the `.dmrg` document: what is open, not the file contents. */
  saveSessionDocument(target: string, payload: unknown): string {
    const destination = path.resolve(
      target.toLowerCase().endsWith(`.${DOC_EXTENSION}`) ? target : `${target}.${DOC_EXTENSION}`,
    );
    const body = {
      format: "mydiffmerge-session",
      version: 1,
      savedAt: new Date().toISOString(),
      payload,
    };
    try {
      fs.writeFileSync(destination, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    } catch (error) {
      throw new ApiError(`Could not write ${destination}`, "WRITE", 500, String(error));
    }
    this.remember("session", [destination]);
    return destination;
  }

  loadSessionDocument(target: string): { path: string; payload: unknown } {
    let raw: string;
    try {
      raw = fs.readFileSync(target, "utf8");
    } catch {
      throw new ApiError(`File not found: ${target}`, "NO_FILE", 400);
    }
    let body: { format?: string; payload?: unknown };
    try {
      body = JSON.parse(stripBom(raw));
    } catch (error) {
      throw new ApiError(`${path.basename(target)} is not a valid session file.`, "BAD_SESSION", 400, String(error));
    }
    if (body.format !== "mydiffmerge-session") {
      throw new ApiError(`${path.basename(target)} is not a My Diff & Merge session.`, "BAD_SESSION", 400);
    }
    this.remember("session", [path.resolve(target)]);
    return { path: path.resolve(target), payload: body.payload ?? null };
  }

  /* --------------------------------------------------------- recent */

  private remember(kind: RecentKind, paths: string[]): void {
    this.settings.addRecent({ kind, paths });
  }
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function fileSide(target: string): CompareSide {
  // A path with a `!` in it names a file inside an archive. It is read from there
  // and otherwise behaves exactly like a file on disk — read-only, because writing
  // back into an archive is a different job from comparing one.
  const inside = splitArchivePath(target || "");
  if (inside) {
    const archive = path.resolve(inside.archive);
    const data = readZipEntry(archive, inside.entry);
    return {
      label: joinArchivePath(archive, inside.entry),
      path: null,
      data,
      size: data.length,
      modified: null,
      missing: false,
    };
  }

  const resolved = path.resolve(target || "");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new ApiError(`File not found: ${resolved}`, "NO_FILE", 400);
  }
  if (stat.isDirectory()) throw new ApiError(`That is a folder, not a file: ${resolved}`, "IS_DIR", 400);
  return {
    label: resolved,
    path: resolved,
    data: readBytes(resolved),
    size: stat.size,
    modified: stat.mtimeMs,
    missing: false,
  };
}

function emptySide(label: string, missing: boolean): CompareSide {
  return { label, path: null, data: new Uint8Array(0), size: 0, modified: null, missing };
}

async function blobSide(repo: string, revision: string, filePath: string): Promise<CompareSide> {
  const blob = await git.blob(repo, revision, filePath);
  return {
    label: `${label(revision)}:${filePath}`,
    path: revision === "" ? path.join(repo, filePath) : null,
    data: blob.data,
    size: blob.data.length,
    modified: null,
    missing: blob.missing,
  };
}

function label(revision: string): string {
  if (revision === "") return "Working tree";
  if (revision === ":") return "Index";
  return revision.slice(0, 12);
}

function readLines(target: string): { lines: string[]; newline: "\n" | "\r\n"; trailingNewline: boolean } {
  const resolved = path.resolve(target || "");
  let text: string;
  try {
    text = stripBom(fs.readFileSync(resolved, "utf8"));
  } catch {
    throw new ApiError(`File not found: ${resolved}`, "NO_FILE", 400);
  }
  const body = splitBody(text);
  return { lines: body.lines, newline: detectNewline(text), trailingNewline: body.trailingNewline };
}

function linesOf(data: Uint8Array): string[] {
  return splitBody(stripBom(new TextDecoder("utf-8", { fatal: false }).decode(data))).lines;
}

function newlineOf(data: Uint8Array): { newline: "\n" | "\r\n"; trailingNewline: boolean } {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
  const body = splitBody(text);
  return { newline: detectNewline(text), trailingNewline: body.trailingNewline };
}

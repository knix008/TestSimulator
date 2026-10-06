/**
 * The renderer's view of the API.
 *
 * Every call goes through `request`, which turns a non-2xx response into an
 * `ApiFailure` carrying the server's copyable detail block — that is what the error
 * dialog shows, and why a failure never reaches the UI as a bare string.
 */
import type { DirectoryCompareResult } from "../core/dirCompare.js";
import type { FormatId } from "../core/formats.js";
import type { SyncMode, SyncPlan } from "../core/sync.js";

/** The search switches, shared by the find bar and both endpoints. */
export type SearchFlags = {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  side?: "left" | "right" | "both";
};
import type { CompareSummary, TextRow } from "../core/compareSession.js";
import type { HexRow } from "../core/binary.js";
import type { CommitInfo, GitChange, RepoInfo, ToolRegistration } from "../core/git.js";
import type { MergeDocument } from "../core/mergeDocument.js";
import type { AppSettings } from "../core/settings.js";
import type { MergeSessionInfo, PendingRequest } from "../core/app.js";
import type { FontFamily } from "../core/fonts.js";
import type { FileOperation, OperationResult } from "../core/fileOps.js";
import type { BrowseResult } from "../core/fsBrowse.js";

export type { CompareSummary, TextRow, HexRow, DirectoryCompareResult, MergeDocument, MergeSessionInfo };
export type { CommitInfo, GitChange, RepoInfo, ToolRegistration, AppSettings, PendingRequest, FontFamily };
export type { FileOperation, OperationResult };

export class ApiFailure extends Error {
  readonly code: string;
  readonly detail: string;
  readonly status: number;

  constructor(message: string, code: string, detail: string, status: number) {
    super(message);
    this.name = "ApiFailure";
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiFailure(
      "The application server is not responding.",
      "OFFLINE",
      `${method} ${url}\n${String(error)}`,
      0,
    );
  }
  if (!response.ok) {
    let payload: { error?: string; code?: string; detail?: string } = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    throw new ApiFailure(
      payload.error || `${response.status} ${response.statusText}`,
      payload.code || "ERROR",
      payload.detail || `${method} ${url}`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const get = <T>(url: string) => request<T>("GET", url);
const post = <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {});
const put = <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {});
const remove = <T>(url: string) => request<T>("DELETE", url);

export type Bootstrap = {
  app: { name: string; title: string; version: string; author: string; documentExtension: string };
  settings: AppSettings & { settingsPath: string };
  pending: PendingRequest | null;
  git: boolean;
  launcher: string;
  platform: string;
  node: string;
};

export const api = {
  bootstrap: () => get<Bootstrap>("/api/bootstrap"),

  compareFiles: (left: string, right: string, forceHex = false, format?: FormatId) =>
    post<{ compare: CompareSummary }>("/api/compare/files", { left, right, forceHex, format })
      .then((r) => r.compare),
  compareRemote: (local: string, remote: string, password: string) =>
    post<{ directory: { id: string; result: DirectoryCompareResult } }>(
      "/api/compare/remote", { local, remote, password },
    ).then((r) => r.directory),
  renameDirectoryEntry: (id: string, side: "left" | "right", rel: string, name: string) =>
    post<{ directory: { id: string; result: DirectoryCompareResult } }>(
      `/api/directory/${id}/rename`, { side, rel, name },
    ),
  syncPlan: (id: string, mode: SyncMode, options: { allowDaylightShift: boolean }) =>
    post<{ plan: SyncPlan }>(`/api/directory/${id}/sync/plan`, { mode, ...options }).then((r) => r.plan),
  syncApply: (id: string, plan: SyncPlan) =>
    post<{ results: { done: string[]; failed: { rel: string; reason: string }[] }[]; directory: { id: string; result: DirectoryCompareResult } }>(
      `/api/directory/${id}/sync/apply`, { plan }),
  searchCompare: (id: string, query: string, options: SearchFlags) =>
    get<{ rows: number[] }>(
      `/api/compare/${id}/search?q=${encodeURIComponent(query)}`
      + `&case=${options.caseSensitive ? 1 : 0}&word=${options.wholeWord ? 1 : 0}`
      + `&regex=${options.regex ? 1 : 0}&side=${options.side ?? "both"}`,
    ).then((r) => r.rows),
  replaceAll: (id: string, side: "left" | "right", find: string, replace: string, options: SearchFlags) =>
    post<{ compare: CompareSummary; replaced: number }>(
      `/api/compare/${id}/replace`, { side, find, replace, ...options },
    ),
  reloadCompare: (id: string) =>
    post<{ compare: CompareSummary }>(`/api/compare/${id}/reload`).then((r) => r.compare),
  rows: (id: string, start: number, count: number, words: boolean, syntax = false) =>
    get<{ mode: "text"; start: number; rows: TextRow[] } | { mode: "binary"; start: number; rows: HexRow[] }>(
      `/api/compare/${id}/rows?start=${start}&count=${count}&words=${words ? 1 : 0}&syntax=${syntax ? 1 : 0}`,
    ),
  compareText: (id: string, side: "left" | "right" | "both", start: number, count: number) =>
    get<{ text: string }>(`/api/compare/${id}/text?side=${side}&start=${start}&count=${count}`).then((r) => r.text),
  closeCompare: (id: string) => remove<{ ok: boolean }>(`/api/compare/${id}`),

  compareDirectories: (left: string, right: string, excludes?: string[]) =>
    post<{ directory: { id: string; result: DirectoryCompareResult } }>("/api/compare/directories", {
      left,
      right,
      excludes,
    }).then((r) => r.directory),
  reloadDirectory: (id: string) =>
    post<{ directory: { id: string; result: DirectoryCompareResult } }>(`/api/directory/${id}/reload`)
      .then((r) => r.directory),
  openDirectoryEntry: (id: string, rel: string) =>
    post<{ compare: CompareSummary }>(`/api/directory/${id}/open`, { rel }).then((r) => r.compare),
  directoryOperate: (id: string, operation: FileOperation, relatives: string[]) =>
    post<{ result: OperationResult; directory: { id: string; result: DirectoryCompareResult } }>(
      `/api/directory/${id}/operate`,
      { operation, relatives },
    ),

  takeRows: (id: string, target: "left" | "right", rows: number[]) =>
    post<{ compare: CompareSummary }>(`/api/compare/${id}/take`, { target, rows }).then((r) => r.compare),
  editRow: (id: string, side: "left" | "right", row: number, text: string) =>
    post<{ compare: CompareSummary }>(`/api/compare/${id}/edit`, { side, row, text }).then((r) => r.compare),

  openThreeWay: (base: string, local: string, remote: string, merged: string) =>
    post<{ merge: MergeSessionInfo }>("/api/merge/three-way", { base, local, remote, merged }).then((r) => r.merge),
  openConflictFile: (path: string) =>
    post<{ merge: MergeSessionInfo }>("/api/merge/conflict-file", { path }).then((r) => r.merge),
  openRepositoryConflict: (repository: string, file: string) =>
    post<{ merge: MergeSessionInfo }>("/api/merge/repository-conflict", { repository, file }).then((r) => r.merge),
  saveMerge: (id: string, document: MergeDocument, path?: string) =>
    post<{ path: string; staged: boolean }>(`/api/merge/${id}/save`, { document, path }),

  openRepository: (path: string) =>
    post<{ repository: RepoInfo; changes: GitChange[]; conflicted: string[] }>("/api/git/open", { path }),
  gitChanges: (view: GitViewSpec) =>
    get<{ repository: RepoInfo; changes: GitChange[]; commit: CommitInfo | null; conflicted: string[] }>(
      `/api/git/changes?${viewQuery(view)}`,
    ),
  gitLog: (max = 200, file = "") =>
    get<{ commits: CommitInfo[] }>(`/api/git/log?max=${max}&file=${encodeURIComponent(file)}`).then((r) => r.commits),
  openChange: (view: GitViewSpec, change: GitChange) =>
    post<{ compare: CompareSummary }>("/api/git/open-change", { view, change }).then((r) => r.compare),
  unifiedDiff: (view: GitViewSpec, change: GitChange) =>
    post<{ text: string }>("/api/git/unified", { view, change }).then((r) => r.text),
  gitTools: () => get<{ diff: ToolRegistration; merge: ToolRegistration }>("/api/git/tools"),
  setGitTool: (tool: "diff" | "merge", register: boolean) =>
    post<{ diff: ToolRegistration; merge: ToolRegistration }>("/api/git/tools", { tool, register }),

  saveSession: (path: string, payload: unknown) =>
    post<{ path: string }>("/api/session/save", { path, payload }).then((r) => r.path),
  loadSession: (path: string) => post<{ path: string; payload: unknown }>("/api/session/load", { path }),

  browse: (path: string) => get<BrowseResult>(`/api/fs?path=${encodeURIComponent(path)}`),
  drives: () => get<{ drives: { label: string; path: string }[]; home: string; separator: string }>("/api/drives"),
  fonts: (refresh = false) => get<{ fonts: FontFamily[] }>(`/api/fonts?refresh=${refresh ? 1 : 0}`).then((r) => r.fonts),
  imageUrl: (path: string) => `/api/image?path=${encodeURIComponent(path)}&v=${Date.now()}`,

  settings: () => get<AppSettings & { settingsPath: string }>("/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) => put<AppSettings & { settingsPath: string }>("/api/settings", patch),
  resetSettings: () => post<AppSettings & { settingsPath: string }>("/api/settings/reset"),
  removeRecent: (key: string) => post<AppSettings & { settingsPath: string }>("/api/settings/recent/remove", { key }),
  clearRecent: () => post<AppSettings & { settingsPath: string }>("/api/settings/recent/clear"),
};

export type GitViewSpec =
  | { mode: "work" }
  | { mode: "commit"; sha: string }
  | { mode: "range"; from: string; to: string };

function viewQuery(view: GitViewSpec): string {
  if (view.mode === "commit") return `mode=commit&sha=${encodeURIComponent(view.sha)}`;
  if (view.mode === "range") return `mode=range&from=${encodeURIComponent(view.from)}&to=${encodeURIComponent(view.to)}`;
  return "mode=work";
}

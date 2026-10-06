import type { DirectoryCompareResult } from "../core/dirCompare";
import type { GitView } from "../core/diffApp";
import type { CommitInfo, DiffToolRegistration, GitChange, RepoInfo } from "../core/git";
import type { AppSettings } from "../core/settings";
import type { SessionSummary, TextRow } from "../core/session";
import type { HexRow } from "../core/binary";
import type { BrowseResult } from "../core/fsBrowse";

export type { CommitInfo, DiffToolRegistration, DirectoryCompareResult, GitChange, GitView, HexRow, RepoInfo, SessionSummary, TextRow };

export type Settings = AppSettings & { settingsPath: string };

export type Bootstrap = {
  settings: Settings;
  session: SessionSummary | null;
  repo: RepoInfo | null;
  directory: DirectoryCompareResult | null;
  git: boolean;
  launcher: string;
  platform: string;
  message: string;
};

export type GitChangeList = {
  repo: RepoInfo;
  view: GitView;
  changes: GitChange[];
  commit: CommitInfo | null;
};

export class ApiError extends Error {
  readonly code: string;
  readonly detail: string;

  constructor(message: string, code = "ERROR", detail = "") {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail || message;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : String(error),
      "NETWORK",
      `${(init?.method ?? "GET").toUpperCase()} ${url}\n${String(error)}`,
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = data as { error?: string; code?: string; detail?: string };
    const message = body.error || response.statusText || "Request failed";
    const detail = [
      `${(init?.method ?? "GET").toUpperCase()} ${url}`,
      `HTTP ${response.status}${body.code ? ` ${body.code}` : ""}`,
      body.detail && body.detail !== message ? body.detail : message,
    ].join("\n");
    throw new ApiError(message, body.code, detail);
  }
  return data as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const api = {
  bootstrap: () => request<Bootstrap>("/api/bootstrap"),

  openFiles: (left: string, right: string) =>
    request<{ session: SessionSummary }>("/api/files/open", post({ left, right })),
  reload: () => request<{ session: SessionSummary }>("/api/reload", { method: "POST" }),
  rows: (start: number, count: number) =>
    request<{ mode: "text" | "binary"; start: number; rows: TextRow[] | HexRow[] }>(
      `/api/session/rows${query({ start, count })}`),
  sideText: (side: "left" | "right", start: number, count: number) =>
    request<{ text: string }>(`/api/session/text${query({ side, start, count })}`),

  compareDirectories: (left: string, right: string, excludes?: string[]) =>
    request<{ directory: DirectoryCompareResult }>("/api/dir/compare", post({ left, right, excludes })),
  openDirectoryEntry: (rel: string) =>
    request<{ session: SessionSummary }>("/api/dir/open", post({ rel })),

  openRepository: (path: string) =>
    request<{ repo: RepoInfo; changes: GitChangeList }>("/api/git/open", post({ path })),
  changes: (view: GitView) =>
    request<GitChangeList>(`/api/git/changes${query(viewParams(view))}`),
  log: (max: number, file = "") => request<{ commits: CommitInfo[] }>(`/api/git/log${query({ max, file })}`),
  openChange: (view: GitView, change: GitChange) =>
    request<{ session: SessionSummary }>("/api/git/open-change", post({ view, change })),
  unified: () => request<{ text: string }>("/api/git/unified"),
  diffTool: () => request<DiffToolRegistration>("/api/git/difftool"),
  setDiffTool: (register: boolean) => request<DiffToolRegistration>("/api/git/difftool", post({ register })),

  listDir: (path: string) => request<BrowseResult>(`/api/fs${query({ path })}`),
  drives: () => request<{ drives: { label: string; path: string }[]; home: string }>("/api/drives"),

  settings: () => request<Settings>("/api/settings"),
  saveSettings: (patch: Partial<AppSettings>) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  resetSettings: () => request<Settings>("/api/settings/reset", { method: "POST" }),
};

function viewParams(view: GitView): Record<string, string> {
  if (view.mode === "commit") return { mode: "commit", sha: view.sha };
  if (view.mode === "range") return { mode: "range", from: view.from, to: view.to };
  return { mode: "work" };
}

export class ApiError extends Error {
  code?: string;
  detail?: string;
  constructor(message: string, code?: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail;
  }
}

export type Settings = {
  language: "ko" | "en";
  theme: string;
  recentRepositoryPaths: string[];
  recentCloneUrls: string[];
  commitCategories: string[];
  externalDiffToolPath: string;
  externalDiffToolArguments: string;
  externalMergeToolPath: string;
  externalMergeToolArguments: string;
  gitUsername: string;
  hasCredentials: boolean;
  reuseCredentials: boolean;
  terminalShell: string;
  settingsPath: string;
};

export type RepoInfo = {
  path: string;
  bare: boolean;
  remoteView: boolean;
  remoteUrl: string | null;
  branch: string | null;
  head: string | null;
  detached: boolean;
};

export type WorkState = {
  staged: number;
  modified: number;
  deleted: number;
  untracked: number;
  conflicted: number;
  unpushed: number;
  ahead: number;
  behind: number;
  upstream: string | null;
};

export type FileEntry = {
  name: string;
  path: string;
  directory: boolean;
  badge: string;
  color: string;
  staged: string | null;
  workTree: string | null;
  unpushed: boolean;
};

export type CommitInfo = {
  sha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  subject: string;
  refs: string[];
};

export type ChangedFile = { status: string; path: string; oldPath?: string };

export type CommitDetail = {
  sha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  files: ChangedFile[];
};

export type TreeResponse = {
  local: { name: string; sha: string; current: boolean }[];
  remotes: { remote: string; items: { name: string; sha: string }[] }[];
  tags: { name: string; sha: string }[];
  writable: boolean;
};

export type ReleaseInfo = { tag: string; name: string; body: string; publishedAt: string; url: string };

export type Summary = {
  path: string;
  branch: string | null;
  remoteUrl: string | null;
  remoteView: boolean;
  commitCount: number;
  contributors: { name: string; commits: number }[];
  recent: { sha: string; date: string; author: string; subject: string }[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = data as { error?: string; code?: string; detail?: string };
    const message = body.error || response.statusText || "Request failed";
    const detail = [
      `${(init?.method ?? "GET").toUpperCase()} ${url}`,
      `HTTP ${response.status}${body.code ? ` ${body.code}` : ""}`,
      message,
      body.detail && body.detail !== message ? body.detail : "",
    ].filter(Boolean).join("\n");
    throw new ApiError(message, body.code, detail);
  }
  return data as T;
}

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  bootstrap: () => request<{ settings: Settings; repo: RepoInfo | null; git: boolean }>("/api/bootstrap"),
  tick: () => request<{ generation: number; progress: string | null; repo: RepoInfo | null; work: WorkState | null }>("/api/tick"),
  cancel: () => request<{ ok: boolean }>("/api/cancel", { method: "POST" }),
  open: (path: string) => request<{ repo: RepoInfo }>("/api/open", json({ path })),
  clone: (url: string, destination: string, creds?: { username?: string; password?: string }) =>
    request<{ repo: RepoInfo }>("/api/clone", json({ url, destination, ...creds })),
  browse: (url: string, creds?: { username?: string; password?: string }) =>
    request<{ repo: RepoInfo }>("/api/browse", json({ url, ...creds })),
  tree: () => request<TreeResponse>("/api/tree"),
  releases: () => request<{ releases: ReleaseInfo[] }>("/api/releases"),
  files: (path = "") => request<{ entries: FileEntry[] }>(`/api/files?path=${encodeURIComponent(path)}`),
  drives: () => request<{ drives: { label: string; path: string }[] }>("/api/drives"),
  listDir: (path: string) => request<{ path: string; entries: { name: string; path: string; directory: boolean }[] }>(`/api/fs?path=${encodeURIComponent(path)}`),
  log: (path = "", max = 300) => request<{ commits: CommitInfo[]; flat: boolean }>(`/api/log?path=${encodeURIComponent(path)}&max=${max}`),
  commit: (sha: string) => request<CommitDetail>(`/api/commit?sha=${encodeURIComponent(sha)}`),
  diff: (sha: string, file: string) => request<{ text: string }>(`/api/diff?sha=${encodeURIComponent(sha)}&file=${encodeURIComponent(file)}`),
  checkout: (name: string) => request<{ message: string }>("/api/checkout", json({ name })),
  addPreview: (paths: string[]) => request<{ paths: string[] }>("/api/add/preview", json({ paths })),
  add: (paths: string[]) => request<{ message: string }>("/api/add", json({ paths })),
  unstage: (paths: string[]) => request<{ message: string }>("/api/unstage", json({ paths })),
  discard: (paths: string[]) => request<{ message: string }>("/api/discard", json({ paths })),
  commitMessage: (message: string) => request<{ message: string }>("/api/commit", json({ message })),
  fetch: (creds?: { username?: string; password?: string }) => request<{ message: string }>("/api/fetch", json(creds ?? {})),
  pull: (creds?: { username?: string; password?: string }) => request<{ message: string }>("/api/pull", json(creds ?? {})),
  push: (creds?: { username?: string; password?: string }) => request<{ message: string }>("/api/push", json(creds ?? {})),
  stash: () => request<{ message: string }>("/api/stash", { method: "POST" }),
  stashPop: () => request<{ message: string }>("/api/stash/pop", { method: "POST" }),
  gitStatus: () => request<{ text: string }>("/api/git-status"),
  newFile: (path: string) => request("/api/new-file", json({ path })),
  newFolder: (path: string) => request("/api/new-folder", json({ path })),
  deletePath: (path: string) => request("/api/delete", json({ path })),
  gitignore: (path: string, remove: boolean) => request("/api/gitignore", json({ path, remove })),
  openPath: (path: string) => request("/api/open-path", json({ path })),
  externalDiff: (sha: string, file: string, launch = true) => request("/api/external-diff", json({ sha, file, launch })),
  diffSides: (sha: string, file: string) => request<{ path: string; left: string; right: string; leftVersion: string; rightVersion: string }>("/api/diff-sides", json({ sha, file })),
  mergeSources: (file: string) => request<{ path: string; base: string; local: string; remote: string; current: string }>("/api/merge-sources", json({ file })),
  saveMerge: (file: string, content: string) => request("/api/merge-save", json({ file, content })),
  externalMerge: (file: string) => request("/api/external-merge", json({ file })),
  exportCommit: (sha: string, destination: string) => request<{ count: number }>("/api/export-commit", json({ sha, destination })),
  summary: () => request<Summary>("/api/summary"),
  saveSettings: (patch: Partial<Settings> & { commitCategories?: string[] }) =>
    request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  resetSettings: () => request<Settings>("/api/settings/reset", { method: "POST" }),
  saveCredentials: (username: string, password: string, reuse: boolean) =>
    request<Settings>("/api/credentials", json({ username, password, reuse })),
  deleteRecentUrl: (url: string) => request<Settings>("/api/recent-urls/delete", json({ url })),
  deleteRecentRepo: (path: string) => request<Settings>("/api/recent-repos/delete", json({ path })),
  clearRecentRepos: () => request<Settings>("/api/recent-repos/clear", { method: "POST" }),
  shells: () => request<{ shells: { id: string; label: string; command: string }[]; selected: string }>("/api/shells"),
  diffTools: () => request<{ tools: { id: string; label: string; args: string; mergeArgs: string }[] }>("/api/diff-tools"),
};

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./errors.js";

/** The empty tree, used as the left side of a root commit. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const BASE_ARGS = ["-c", "core.quotepath=false", "-c", "color.ui=false"];

export type GitResult = { code: number; stdout: string; stderr: string };

export type RepoInfo = {
  path: string;
  branch: string | null;
  head: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
};

export type ChangeScope = "staged" | "unstaged" | "untracked" | "conflicted" | "commit" | "range";

export type GitChange = {
  /** Repository-relative path, forward slashes. */
  path: string;
  /** Previous path for renames and copies. */
  oldPath: string | null;
  scope: ChangeScope;
  /** Raw git code: porcelain XY, or a name-status letter. */
  code: string;
  /** `Modified`, `Added`, `Deleted`, `Renamed`, `Type Changed`, `Untracked`, `Conflicted`. */
  status: string;
  added: number | null;
  deleted: number | null;
};

export type CommitInfo = {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  refs: string[];
};

export function gitAvailable(): Promise<boolean> {
  return runGit(undefined, ["--version"]).then((result) => result.code === 0);
}

export function runGit(cwd: string | undefined, args: string[], limit = 64_000_000): Promise<GitResult> {
  return collect(cwd, args, limit).then((result) => ({
    code: result.code,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr,
  }));
}

/** Same as {@link runGit} but keeps stdout as bytes, for blobs that may be binary. */
export function runGitBuffer(cwd: string | undefined, args: string[], limit = 64_000_000): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return collect(cwd, args, limit);
}

function collect(cwd: string | undefined, args: string[], limit: number): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("git", [...BASE_ARGS, ...args], {
        cwd,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
      });
    } catch (error) {
      resolve({ code: 1, stdout: Buffer.alloc(0), stderr: error instanceof Error ? error.message : String(error) });
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = "";
    let killed = false;
    child.stdout?.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > limit && !killed) {
        killed = true;
        child.kill();
      }
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout: Buffer.concat(chunks), stderr: stderr || error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: Buffer.concat(chunks), stderr });
    });
  });
}

async function git(repo: string, args: string[]): Promise<string> {
  const result = await runGit(repo, args);
  if (result.code !== 0) {
    throw new ApiError(firstLine(result.stderr) || `git ${args[0]} failed`, "GIT", 400, `git ${args.join(" ")}\n${result.stderr}`);
  }
  return result.stdout;
}

/** Resolves any path inside a work tree to its repository root. */
export async function openRepository(target: string): Promise<RepoInfo> {
  const resolved = path.resolve(target || "");
  if (!fs.existsSync(resolved)) throw new ApiError(`Folder not found: ${resolved}`, "NO_DIR", 400);
  const dir = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);

  const top = await runGit(dir, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0 || !top.stdout.trim()) {
    throw new ApiError(`Not a git repository: ${dir}`, "NO_REPO", 400, top.stderr);
  }
  return repoInfo(path.resolve(top.stdout.trim()));
}

export async function repoInfo(repo: string): Promise<RepoInfo> {
  const branchResult = await runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchResult.code === 0 ? branchResult.stdout.trim() : "";
  const headResult = await runGit(repo, ["rev-parse", "--short", "HEAD"]);
  const upstreamResult = await runGit(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : "";

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = await runGit(repo, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
    if (counts.code === 0) {
      const [behindText, aheadText] = counts.stdout.trim().split(/\s+/);
      behind = Number(behindText) || 0;
      ahead = Number(aheadText) || 0;
    }
  }

  return {
    path: repo,
    branch: branch && branch !== "HEAD" ? branch : null,
    head: headResult.code === 0 ? headResult.stdout.trim() || null : null,
    detached: branch === "HEAD",
    upstream: upstream || null,
    ahead,
    behind,
  };
}

/** Working-tree changes: staged, unstaged, untracked and conflicted entries. */
export async function workingChanges(repo: string): Promise<GitChange[]> {
  const porcelain = await git(repo, ["status", "--porcelain=v1", "-uall", "-z"]);
  const stagedStats = await numstat(repo, ["diff", "--numstat", "-z", "-M", "--cached"]);
  const unstagedStats = await numstat(repo, ["diff", "--numstat", "-z", "-M"]);
  const changes: GitChange[] = [];

  for (const record of parsePorcelain(porcelain)) {
    const { x, y, filePath, oldPath } = record;
    if (x === "?" && y === "?") {
      changes.push(entry(filePath, null, "untracked", "??", "Untracked", null, null));
      continue;
    }
    if (x === "!" && y === "!") continue;
    if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
      changes.push(entry(filePath, oldPath, "conflicted", `${x}${y}`, "Conflicted", null, null));
      continue;
    }
    if (x !== " ") {
      const stat = stagedStats.get(filePath);
      changes.push(entry(filePath, oldPath, "staged", x, statusLabel(x), stat?.added ?? null, stat?.deleted ?? null));
    }
    if (y !== " ") {
      const stat = unstagedStats.get(filePath);
      changes.push(entry(filePath, oldPath, "unstaged", y, statusLabel(y), stat?.added ?? null, stat?.deleted ?? null));
    }
  }
  return changes;
}

/** Files touched by one commit, compared against its first parent. */
export async function commitChanges(repo: string, sha: string): Promise<GitChange[]> {
  const base = await firstParent(repo, sha);
  const nameStatus = await git(repo, ["diff", "--name-status", "-z", "-M", base, sha]);
  const stats = await numstat(repo, ["diff", "--numstat", "-z", "-M", base, sha]);
  return parseNameStatus(nameStatus).map((record) =>
    entry(
      record.filePath,
      record.oldPath,
      "commit",
      record.code,
      statusLabel(record.code[0]),
      stats.get(record.filePath)?.added ?? null,
      stats.get(record.filePath)?.deleted ?? null,
    ));
}

/** Files that differ between two revisions (`to` empty means the working tree). */
export async function rangeChanges(repo: string, from: string, to: string): Promise<GitChange[]> {
  const args = to ? [from, to] : [from];
  const nameStatus = await git(repo, ["diff", "--name-status", "-z", "-M", ...args]);
  const stats = await numstat(repo, ["diff", "--numstat", "-z", "-M", ...args]);
  return parseNameStatus(nameStatus).map((record) =>
    entry(
      record.filePath,
      record.oldPath,
      "range",
      record.code,
      statusLabel(record.code[0]),
      stats.get(record.filePath)?.added ?? null,
      stats.get(record.filePath)?.deleted ?? null,
    ));
}

export async function log(repo: string, max: number, filePath = "", revision = ""): Promise<CommitInfo[]> {
  const separator = "";
  const format = ["%H", "%h", "%P", "%an", "%ae", "%aI", "%s", "%D"].join(separator);
  const args = ["log", `--max-count=${Math.max(1, Math.min(max, 2000))}`, `--format=${format}`];
  if (revision) args.push(revision);
  if (filePath) args.push("--", filePath);
  const output = await git(repo, args);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, parents, author, email, date, subject, refs] = line.split(separator);
      return {
        sha,
        shortSha,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        author,
        email,
        date,
        subject: subject ?? "",
        refs: (refs ?? "").split(", ").map((item) => item.trim()).filter(Boolean),
      };
    });
}

export async function commitInfo(repo: string, sha: string): Promise<CommitInfo | null> {
  if (!sha) return null;
  const commits = await log(repo, 1, "", sha).catch(() => []);
  return commits[0] ?? null;
}

export async function firstParent(repo: string, sha: string): Promise<string> {
  const result = await runGit(repo, ["rev-parse", `${sha}^`]);
  return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : EMPTY_TREE;
}

export async function revisionExists(repo: string, revision: string): Promise<boolean> {
  const result = await runGit(repo, ["rev-parse", "--verify", "--quiet", revision]);
  return result.code === 0;
}

/**
 * Bytes of one side of a comparison.
 * `revision` of `""` reads the working tree, `":"` reads the index, anything else is a
 * git revision resolved with `git show <revision>:<path>`.
 */
export async function blob(repo: string, revision: string, filePath: string): Promise<{ data: Uint8Array; missing: boolean }> {
  if (revision === "") {
    const absolute = path.join(repo, filePath);
    try {
      return { data: fs.readFileSync(absolute), missing: false };
    } catch {
      return { data: Buffer.alloc(0), missing: true };
    }
  }
  const spec = revision === ":" ? `:${filePath}` : `${revision}:${filePath}`;
  const result = await runGitBuffer(repo, ["show", spec]);
  if (result.code !== 0) return { data: Buffer.alloc(0), missing: true };
  return { data: result.stdout, missing: false };
}

/** Unified diff text for one change, shown next to the side-by-side panes. */
export async function unifiedDiff(repo: string, change: GitChange, commit?: { sha: string }): Promise<string> {
  const target = change.oldPath ? [change.oldPath, change.path] : [change.path];
  if (change.scope === "staged") {
    return runGit(repo, ["diff", "--cached", "-M", "--", ...target]).then((result) => result.stdout);
  }
  if (change.scope === "commit" && commit) {
    const base = await firstParent(repo, commit.sha);
    return runGit(repo, ["diff", "-M", base, commit.sha, "--", ...target]).then((result) => result.stdout);
  }
  if (change.scope === "untracked") {
    return runGit(repo, ["diff", "--no-index", "-M", "--", nullDevice(), path.join(repo, change.path)])
      .then((result) => result.stdout);
  }
  return runGit(repo, ["diff", "-M", "--", ...target]).then((result) => result.stdout);
}

function nullDevice(): string {
  return process.platform === "win32" ? "NUL" : "/dev/null";
}

export function statusLabel(code: string): string {
  switch (code) {
    case "M": return "Modified";
    case "A": return "Added";
    case "D": return "Deleted";
    case "R": return "Renamed";
    case "C": return "Copied";
    case "T": return "Type Changed";
    case "U": return "Conflicted";
    case "?": return "Untracked";
    default: return "Modified";
  }
}

function entry(
  filePath: string,
  oldPath: string | null,
  scope: ChangeScope,
  code: string,
  status: string,
  added: number | null,
  deleted: number | null,
): GitChange {
  return { path: filePath, oldPath, scope, code, status, added, deleted };
}

type PorcelainRecord = { x: string; y: string; filePath: string; oldPath: string | null };

export function parsePorcelain(output: string): PorcelainRecord[] {
  const tokens = output.split("\0");
  const records: PorcelainRecord[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const x = token[0];
    const y = token[1];
    const filePath = token.slice(3);
    let oldPath: string | null = null;
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      oldPath = tokens[index + 1] ?? null;
      index += 1;
    }
    records.push({ x, y, filePath, oldPath });
  }
  return records;
}

type NameStatusRecord = { code: string; filePath: string; oldPath: string | null };

export function parseNameStatus(output: string): NameStatusRecord[] {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const records: NameStatusRecord[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const code = tokens[index];
    if (!/^[A-Z]/.test(code)) continue;
    if (code[0] === "R" || code[0] === "C") {
      records.push({ code, filePath: tokens[index + 2] ?? "", oldPath: tokens[index + 1] ?? null });
      index += 2;
    } else {
      records.push({ code, filePath: tokens[index + 1] ?? "", oldPath: null });
      index += 1;
    }
  }
  return records;
}

export function parseNumstat(output: string): Map<string, { added: number | null; deleted: number | null }> {
  const stats = new Map<string, { added: number | null; deleted: number | null }>();
  const tokens = output.split("\0");
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;
    const parts = token.split("\t");
    if (parts.length < 3) continue;
    const added = parts[0] === "-" ? null : Number(parts[0]);
    const deleted = parts[1] === "-" ? null : Number(parts[1]);
    if (parts[2] === "") {
      // Rename: the old and new paths follow as separate NUL-terminated tokens.
      const newPath = tokens[index + 2] ?? "";
      if (newPath) stats.set(newPath, { added, deleted });
      index += 2;
    } else {
      stats.set(parts[2], { added, deleted });
    }
  }
  return stats;
}

async function numstat(repo: string, args: string[]): Promise<Map<string, { added: number | null; deleted: number | null }>> {
  const result = await runGit(repo, args);
  return result.code === 0 ? parseNumstat(result.stdout) : new Map();
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}

/* ------------------------------------------------------------------ *
 * difftool registration
 * ------------------------------------------------------------------ */

export type DiffToolRegistration = {
  /** Launcher MyDiff registers itself as. */
  command: string;
  /** The `git config` lines a user can run by hand. */
  lines: string[];
  registered: boolean;
  /** Value currently stored in the global git config, if any. */
  current: string | null;
};

export const DIFFTOOL_NAME = "mydiff";

export function diffToolCommand(launcher: string): string {
  return `"${launcher}" "$LOCAL" "$REMOTE"`;
}

export function diffToolConfigLines(launcher: string): string[] {
  return [
    `git config --global difftool.${DIFFTOOL_NAME}.cmd '${diffToolCommand(launcher)}'`,
    `git config --global diff.tool ${DIFFTOOL_NAME}`,
    `git config --global difftool.prompt false`,
  ];
}

export async function diffToolStatus(launcher: string): Promise<DiffToolRegistration> {
  const result = await runGit(undefined, ["config", "--global", "--get", `difftool.${DIFFTOOL_NAME}.cmd`]);
  const current = result.code === 0 ? result.stdout.trim() : "";
  return {
    command: diffToolCommand(launcher),
    lines: diffToolConfigLines(launcher),
    registered: current.length > 0,
    current: current || null,
  };
}

export async function registerDiffTool(launcher: string): Promise<DiffToolRegistration> {
  const steps: string[][] = [
    ["config", "--global", `difftool.${DIFFTOOL_NAME}.cmd`, diffToolCommand(launcher)],
    ["config", "--global", "diff.tool", DIFFTOOL_NAME],
    ["config", "--global", "difftool.prompt", "false"],
  ];
  for (const args of steps) {
    const result = await runGit(undefined, args);
    if (result.code !== 0) {
      throw new ApiError(firstLine(result.stderr) || "git config failed", "GIT", 400, result.stderr);
    }
  }
  return diffToolStatus(launcher);
}

export async function unregisterDiffTool(launcher: string): Promise<DiffToolRegistration> {
  await runGit(undefined, ["config", "--global", "--unset-all", `difftool.${DIFFTOOL_NAME}.cmd`]);
  const tool = await runGit(undefined, ["config", "--global", "--get", "diff.tool"]);
  if (tool.code === 0 && tool.stdout.trim() === DIFFTOOL_NAME) {
    await runGit(undefined, ["config", "--global", "--unset-all", "diff.tool"]);
  }
  return diffToolStatus(launcher);
}

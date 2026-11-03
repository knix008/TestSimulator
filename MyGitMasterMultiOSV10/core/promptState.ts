/**
 * What a terminal prompt is drawn from: the folder, its git status, the user, the
 * shell, the last exit code. Ported from MyTerminalMultiOSV10 (src/main/prompt.js);
 * the engine itself — segments, templates, presets, ANSI — is core/promptCore.js.
 *
 * Git status never blocks a prompt: a cached value is returned (refreshed in the
 * background when it is old), and a folder seen for the first time draws without
 * git while its status is fetched.
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyGitMode, renderPromptAnsi } from "./promptCore.js";

export type GitPromptStatus =
  | { repo: false; pending?: boolean }
  | {
    repo: true;
    branch: string;
    upstream: string;
    ahead: number;
    behind: number;
    staged: number;
    changed: number;
    untracked: number;
    conflicts: number;
    stashes: number;
  };

export type PromptContext = {
  cwd?: string;
  user?: string;
  host?: string;
  shell?: string;
  rc?: number;
  ms?: number;
  ssh?: boolean;
  gitMode?: string;
};

export type PromptTheme = { accent: string; fg: string; bg: string };

const GIT_CACHE_MS = 1500;
const GIT_ARGS = ["--no-optional-locks", "status", "--porcelain=v2", "--branch", "--show-stash", "--ignore-submodules=dirty"];
const gitCache = new Map<string, { at: number; status: GitPromptStatus }>();
const gitInflight = new Map<string, Promise<GitPromptStatus>>();
const gitListeners = new Set<(dir: string, status: GitPromptStatus) => void>();

/** Refreshes one folder's git status in the background (one git process per folder at a time). */
export function refreshGitStatus(dir: string): Promise<GitPromptStatus> {
  const running = gitInflight.get(dir);
  if (running) return running;
  const promise = new Promise<GitPromptStatus>((resolve) => {
    if (!fs.existsSync(dir)) return resolve({ repo: false });
    execFile("git", GIT_ARGS, { cwd: dir, encoding: "utf8", timeout: 5000, windowsHide: true, maxBuffer: 8 << 20 }, (error, out) => {
      if (error) return resolve({ repo: false });
      const status = parseGitStatus(out);
      if (status.branch !== "(detached)") return resolve(status);
      execFile("git", ["rev-parse", "--short", "HEAD"], { cwd: dir, encoding: "utf8", timeout: 1500, windowsHide: true }, (shaError, sha) => {
        if (!shaError) status.branch = `@${String(sha).trim()}`;
        resolve(status);
      });
    });
  })
    .then((status) => {
      gitCache.set(dir, { at: Date.now(), status });
      for (const listener of gitListeners) {
        try {
          listener(dir, status);
        } catch {
          /* a listener's problem is its own */
        }
      }
      return status;
    })
    .finally(() => {
      if (gitInflight.get(dir) === promise) gitInflight.delete(dir);
    });
  gitInflight.set(dir, promise);
  return promise;
}

/** Subscribes to background git status results; returns the unsubscribe function. */
export function onGitStatus(listener: (dir: string, status: GitPromptStatus) => void): () => void {
  gitListeners.add(listener);
  return () => gitListeners.delete(listener);
}

/** The cached status of a folder (never blocks); a miss answers `{ repo: false, pending: true }`. */
export function gitStatus(cwd: string): GitPromptStatus {
  const dir = path.resolve(cwd || process.cwd());
  const cached = gitCache.get(dir);
  if (cached) {
    if (Date.now() - cached.at >= GIT_CACHE_MS) void refreshGitStatus(dir);
    return cached.status;
  }
  void refreshGitStatus(dir);
  return { repo: false, pending: true };
}

/** Blocking variant, for tests and one-off use. */
export function gitStatusSync(cwd: string): GitPromptStatus {
  const dir = path.resolve(cwd || process.cwd());
  let status: GitPromptStatus = { repo: false };
  try {
    if (!fs.existsSync(dir)) throw new Error("missing");
    const parsed = parseGitStatus(execFileSync("git", GIT_ARGS, {
      cwd: dir, encoding: "utf8", timeout: 1500, windowsHide: true, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8 << 20,
    }));
    if (parsed.branch === "(detached)") {
      try {
        const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: dir, encoding: "utf8", timeout: 700, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        parsed.branch = `@${sha.trim()}`;
      } catch {
        /* keep (detached) */
      }
    }
    status = parsed;
  } catch {
    status = { repo: false };
  }
  gitCache.set(dir, { at: Date.now(), status });
  return status;
}

/** Parses `git status --porcelain=v2 --branch --show-stash`. */
export function parseGitStatus(out: string): Extract<GitPromptStatus, { repo: true }> {
  const status = { repo: true as const, branch: "", upstream: "", ahead: 0, behind: 0, staged: 0, changed: 0, untracked: 0, conflicts: 0, stashes: 0 };
  for (const line of String(out || "").split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) status.branch = line.slice(14).trim();
    else if (line.startsWith("# branch.upstream ")) status.upstream = line.slice(18).trim();
    else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        status.ahead = Number(match[1]);
        status.behind = Number(match[2]);
      }
    } else if (line.startsWith("# stash ")) status.stashes = Number(line.slice(8)) || 0;
    else if (line[0] === "1" || line[0] === "2") {
      const xy = line.slice(2, 4);
      if (xy[0] !== ".") status.staged++;
      if (xy[1] !== ".") status.changed++;
    } else if (line[0] === "u") status.conflicts++;
    else if (line[0] === "?") status.untracked++;
  }
  return status;
}

function isRoot(): boolean {
  try {
    return process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0;
  } catch {
    return false;
  }
}

/** The state a prompt is rendered against (see promptCore renderPrompt). */
export function promptState(context: PromptContext = {}): Record<string, unknown> {
  const cwd = context.cwd || process.cwd();
  let user = context.user;
  if (!user) {
    try {
      user = os.userInfo().username;
    } catch {
      user = "user";
    }
  }
  const state = {
    cwd,
    home: os.homedir(),
    git: gitStatus(cwd),
    user,
    host: context.host || os.hostname(),
    shell: context.shell || "shell",
    platform: process.platform,
    rc: Number(context.rc) || 0,
    ms: Number(context.ms) || 0,
    now: new Date(),
    root: isRoot(),
    ssh: Boolean(context.ssh),
  };
  return applyGitMode(state, context.gitMode);
}

/** A prompt config rendered to ANSI text for the terminal. */
export function renderTerminalPrompt(config: unknown, context: PromptContext, theme: PromptTheme): string {
  return renderPromptAnsi(config, promptState(context), theme);
}

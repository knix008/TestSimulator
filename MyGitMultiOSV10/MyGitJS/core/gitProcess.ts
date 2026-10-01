import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type GitResult = { code: number; stdout: string; stderr: string };

const INDEX_LOCK = /Unable to create '([^']*index\.lock)'/;
const STALE_LOCK_MS = 15_000;

export function releaseStaleIndexLock(output: string): boolean {
  if (!/another git process|file exists/i.test(output)) return false;
  const match = output.match(INDEX_LOCK);
  if (!match) return false;
  try {
    fs.rmSync(match[1]);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

export function clearStaleIndexLock(repo: string | undefined | null, maxAgeMs = STALE_LOCK_MS): boolean {
  if (!repo) return false;
  const lock = path.join(repo, ".git", "index.lock");
  try {
    const stat = fs.statSync(lock);
    if (Date.now() - stat.mtimeMs < maxAgeMs) return false;
    fs.rmSync(lock);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

export function removeIndexLock(repo: string | undefined | null): void {
  if (!repo) return;
  try {
    fs.rmSync(path.join(repo, ".git", "index.lock"));
  } catch {
    /* already gone, or still held by a live git process */
  }
}

export function runGit(cwd: string | undefined, args: string[], limit = 32_000_000): Promise<GitResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn("git", args, {
        cwd,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (error) {
      resolve({ code: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) });
      return;
    }

    let stdout = "";
    let stderr = "";
    let killed = false;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > limit && !killed) {
        killed = true;
        child.kill();
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: stderr || error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function startGit(cwd: string | undefined, args: string[]): ChildProcess {
  return spawn("git", args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

export function gitAvailable(): Promise<boolean> {
  return runGit(undefined, ["--version"]).then((result) => result.code === 0);
}

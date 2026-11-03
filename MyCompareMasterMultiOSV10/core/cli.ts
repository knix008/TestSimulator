/**
 * Command line parsing, shared by the Electron shell and the standalone server.
 *
 * The shapes git uses are the ones that matter:
 *
 *   mycomparemaster                                        nothing open
 *   mycomparemaster A B                                    compare two files or two folders
 *   mycomparemaster --diff A B                             git difftool  ($LOCAL $REMOTE)
 *
 * A comparison git asks for — `--diff`, or two files with git's diff environment
 * set — is read-only.
 *   mycomparemaster --merge BASE LOCAL REMOTE MERGED       git mergetool ($BASE ...)
 *   mycomparemaster BASE LOCAL REMOTE MERGED               the same, positionally
 *   mycomparemaster conflicted.txt                         a file with <<<<<<< markers
 *   mycomparemaster session.dmrg                           a saved session
 *   mycomparemaster /path/to/repo                          a git repository
 */
import fs from "node:fs";
import path from "node:path";
import { DOC_EXTENSION } from "./appInfo.js";
import type { PendingRequest } from "./app.js";

/**
 * `git difftool` runs the tool through `git diff`, which sets these for every external
 * diff. They are how a git run is told apart from two files opened by hand: the
 * registered command stays positional (core/git.ts), because the launcher may be
 * `node`, which would take a `--diff` for itself.
 */
const GIT_DIFF_ENV = ["GIT_DIFF_PATH_TOTAL", "GIT_DIFF_PATH_COUNTER"];

export function parseArguments(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): PendingRequest | null {
  const flags = new Set(argv.filter((item) => item.startsWith("--")).map((item) => item.toLowerCase()));
  const files = argv.filter((item) => item && !item.startsWith("-") && item !== ".");

  if (flags.has("--merge") && files.length >= 4) {
    return { kind: "merge", base: files[0], local: files[1], remote: files[2], merged: files[3] };
  }
  // A comparison git asked for is a read-only look at two versions.
  if (flags.has("--diff") && files.length >= 2) {
    return { kind: "diff", left: files[0], right: files[1], readOnly: true };
  }
  if (files.length === 2 && GIT_DIFF_ENV.some((name) => env[name])) {
    return { kind: "diff", left: files[0], right: files[1], readOnly: true };
  }
  if (flags.has("--conflict") && files.length >= 1) {
    return { kind: "conflict", file: files[0] };
  }

  if (files.length >= 4) {
    return { kind: "merge", base: files[0], local: files[1], remote: files[2], merged: files[3] };
  }
  if (files.length >= 2) {
    return { kind: "diff", left: files[0], right: files[1] };
  }
  if (files.length === 1) return single(files[0]);
  return null;
}

function single(target: string): PendingRequest | null {
  if (target.toLowerCase().endsWith(`.${DOC_EXTENSION}`)) return { kind: "session", file: target };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return null;
  }
  if (stat.isDirectory()) {
    return fs.existsSync(path.join(target, ".git")) ? { kind: "repository", path: target } : null;
  }
  return { kind: "conflict", file: target };
}

/** True when the run came from `git mergetool`, which reads the exit code. */
export function isMergeToolRun(argv: readonly string[]): boolean {
  const request = parseArguments(argv);
  return request?.kind === "merge";
}

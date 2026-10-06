/**
 * Command line parsing, shared by the Electron shell and the standalone server.
 *
 * The shapes git uses are the ones that matter:
 *
 *   mydiffmerge                                        nothing open
 *   mydiffmerge A B                                    compare two files or two folders
 *   mydiffmerge --diff A B                             git difftool  ($LOCAL $REMOTE)
 *   mydiffmerge --merge BASE LOCAL REMOTE MERGED       git mergetool ($BASE ...)
 *   mydiffmerge BASE LOCAL REMOTE MERGED               the same, positionally
 *   mydiffmerge conflicted.txt                         a file with <<<<<<< markers
 *   mydiffmerge session.dmrg                           a saved session
 *   mydiffmerge /path/to/repo                          a git repository
 */
import fs from "node:fs";
import path from "node:path";
import { DOC_EXTENSION } from "./appInfo.js";
import type { PendingRequest } from "./app.js";

export function parseArguments(argv: readonly string[]): PendingRequest | null {
  const flags = new Set(argv.filter((item) => item.startsWith("--")).map((item) => item.toLowerCase()));
  const files = argv.filter((item) => item && !item.startsWith("-") && item !== ".");

  if (flags.has("--merge") && files.length >= 4) {
    return { kind: "merge", base: files[0], local: files[1], remote: files[2], merged: files[3] };
  }
  if (flags.has("--diff") && files.length >= 2) {
    return { kind: "diff", left: files[0], right: files[1] };
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

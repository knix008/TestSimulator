import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiError } from "./errors.js";

export type BrowseEntry = {
  name: string;
  path: string;
  directory: boolean;
  size: number | null;
  modified: number | null;
};

export type BrowseResult = {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
};

/** Directory listing for the in-app file picker used by the web build. */
export function listDirectory(target: string): BrowseResult {
  const resolved = path.resolve(target || os.homedir());
  let items: fs.Dirent[];
  try {
    items = fs.readdirSync(resolved, { withFileTypes: true });
  } catch (error) {
    throw new ApiError(`Cannot read folder: ${resolved}`, "NO_DIR", 400, String(error));
  }

  const entries: BrowseEntry[] = [];
  for (const item of items) {
    if (item.name.startsWith(".") && item.name !== ".git") continue;
    const full = path.join(resolved, item.name);
    let size: number | null = null;
    let modified: number | null = null;
    try {
      const stat = fs.statSync(full);
      size = stat.isFile() ? stat.size : null;
      modified = stat.mtimeMs;
    } catch {
      /* unreadable entries are still listed */
    }
    entries.push({ name: item.name, path: full, directory: item.isDirectory(), size, modified });
  }

  entries.sort((left, right) => {
    if (left.directory !== right.directory) return left.directory ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "accent" });
  });

  const parent = path.dirname(resolved);
  return { path: resolved, parent: parent === resolved ? null : parent, entries };
}

export function systemDrives(): { label: string; path: string }[] {
  if (process.platform !== "win32") {
    return [
      { label: "/", path: "/" },
      { label: os.homedir(), path: os.homedir() },
    ];
  }
  const drives: { label: string; path: string }[] = [];
  for (let code = 65; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      fs.accessSync(root);
      drives.push({ label: root, path: root });
    } catch {
      /* drive letter not mounted */
    }
  }
  return drives;
}

export function homeDirectory(): string {
  return os.homedir();
}

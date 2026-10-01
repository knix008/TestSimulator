import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiError } from "./errors.js";

export type DriveInfo = { label: string; path: string };
export type DirEntry = { name: string; path: string; directory: boolean };

export function systemDrives(): Promise<DriveInfo[]> {
  if (process.platform === "win32") return windowsDrives();
  return Promise.resolve(unixDrives());
}

export function listDirectory(target: string): { path: string; entries: DirEntry[] } {
  const resolved = path.resolve(target);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new ApiError("Folder not found.", "MISSING", 404);
  }
  if (!stat.isDirectory()) throw new ApiError("Not a folder.", "NOT_A_DIR");
  const entries: DirEntry[] = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const full = path.join(resolved, entry.name);
    entries.push({ name: entry.name, path: full, directory: entry.isDirectory() });
  }
  entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { path: resolved, entries };
}

function windowsDrives(): Promise<DriveInfo[]> {
  return new Promise((resolve) => {
    execFile("cmd.exe", ["/c", "fsutil", "fsinfo", "drives"], { windowsHide: true, timeout: 4000 }, (error, stdout) => {
      const found = String(stdout ?? "").match(/[A-Z]:\\/g) ?? [];
      if (!error && found.length > 0) {
        resolve(found.map((root) => ({ label: root.slice(0, 2), path: root })));
        return;
      }
      const fallback: DriveInfo[] = [];
      for (let code = 67; code <= 90; code += 1) {
        const root = `${String.fromCharCode(code)}:\\`;
        try {
          if (fs.existsSync(root)) fallback.push({ label: root.slice(0, 2), path: root });
        } catch {
          /* skip drives that cannot be queried */
        }
      }
      resolve(fallback);
    });
  });
}

function unixDrives(): DriveInfo[] {
  const drives: DriveInfo[] = [{ label: "/", path: "/" }];
  const seen = new Set<string>(["/"]);
  const user = os.userInfo().username;
  const roots = process.platform === "darwin"
    ? ["/Volumes"]
    : ["/mnt", "/media", `/media/${user}`, `/run/media/${user}`];
  for (const root of roots) {
    let names: string[] = [];
    try {
      if (!fs.existsSync(root)) continue;
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const full = path.join(root, name);
      try {
        if (!fs.statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      const key = path.resolve(full);
      if (seen.has(key)) continue;
      seen.add(key);
      drives.push({ label: name, path: full });
    }
  }
  return drives;
}

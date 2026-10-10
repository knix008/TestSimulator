import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function unpackedDir(output) {
  return path.join(output, "win-unpacked");
}

/** electron-builder must empty win-unpacked before it copies a new app. A locked asar blocks that. */
function canReplace(output) {
  const unpacked = unpackedDir(output);
  if (!fs.existsSync(unpacked)) return true;
  try {
    fs.rmSync(unpacked, { recursive: true, force: true });
    return true;
  } catch (error) {
    const code = error && error.code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES" || code === "ENOTEMPTY") return false;
    throw error;
  }
}

function pickOutput() {
  const candidates = [path.join(root, "dist"), path.join(root, "release")];
  for (const output of candidates) {
    if (canReplace(output)) return output;
    console.warn(`${unpackedDir(output)} is in use by another process. Building elsewhere.`);
  }
  return path.join(root, "release", `win-${Date.now()}`);
}

const output = pickOutput();
const outputArg = output.replace(/\\/g, "/");
const builder = path.join(root, "node_modules", "electron-builder", "cli.js");
const build = spawnSync(process.execPath, [builder, "--win", "nsis", `--config.directories.output=${outputArg}`], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const copy = spawnSync(process.execPath, [path.join(root, "scripts", "copy-installer.js"), output], {
  cwd: root,
  stdio: "inherit",
});
process.exit(copy.status ?? 1);

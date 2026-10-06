/**
 * Runs electron-builder, and gets past the one failure that is not our fault.
 *
 * electron-builder downloads Electron, extracts it into `release/win-unpacked.tmp`
 * and renames that into place. On Windows the rename fails with EPERM whenever
 * anything still holds a handle inside the freshly written tree — a virus scanner
 * reading what was just unpacked is enough, and on some machines it is enough
 * every time. The build has nothing to retry: the files are correct, the rename
 * is not permitted.
 *
 * So on that specific failure it runs again pointing at `node_modules/electron`,
 * which is the same Electron, already extracted, and which skips the download and
 * the rename entirely. That fallback is only valid for the architecture installed
 * there, so it is limited to this machine's — which is what somebody building
 * locally wanted anyway.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "electron-builder", "cli.js");
const localDist = path.join(root, "node_modules", "electron", "dist");

/** The marker that says this was the extract-and-rename problem, not a real one. */
const EPERM = /EPERM[\s\S]*rename[\s\S]*unpacked\.tmp/i;

function run(args) {
  return new Promise((resolve) => {
    // The folder name has an `&` in it, so everything is invoked by path rather
    // than through a shell that would take it as a command separator.
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, shell: false });
    let output = "";
    const capture = (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
  });
}

/** Removes the half-finished tree a failed extraction leaves behind. */
function cleanStage() {
  for (const name of ["win-unpacked.tmp", "win-unpacked"]) {
    fs.rmSync(path.join(root, "release", name), { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
let result = await run(args);

/**
 * The fallback's scope.
 *
 * The local Electron is one architecture, so the retry has to narrow to it — and
 * to one target, the installer. Left as a bare `--win`, electron-builder would
 * still try the portable build and the two-architecture installer, and would
 * embed an arm64 archive it does not have, producing a file that fails its own
 * size check.
 */
const INSTALLER_TARGET = { "--win": "nsis", "--mac": "dmg", "--linux": "AppImage" };

function narrow(original) {
  const out = [];
  for (const arg of original) {
    out.push(arg);
    const target = INSTALLER_TARGET[arg];
    // Only when the platform flag was given on its own; an explicit target stands.
    if (target && !original.includes(target)) out.push(target);
  }
  return out;
}

if (result.code !== 0 && EPERM.test(result.output) && fs.existsSync(localDist)) {
  const arch = os.arch() === "arm64" ? "--arm64" : "--x64";
  console.log(
    "\npackage  the unpack step could not be renamed into place (a lock, not a bad build)."
    + `\npackage  retrying with the Electron already in node_modules: installer, ${arch.slice(2)} only.\n`,
  );
  cleanStage();
  result = await run([
    ...narrow(args),
    arch,
    `-c.electronDist=${path.relative(root, localDist)}`,
  ]);
}

process.exit(result.code);

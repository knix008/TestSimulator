// Removes what builds and tests leave behind:
//   npm run clean        the intermediate output: web build, engine and test builds, reports
//   npm run clean:all    that, and the finished things too: the Rust build (src-tauri/target,
//                        the slowest to redo) and the installers copied to the project root
//   add -- --dry-run     to either: only lists what would go
// Never touched: the sources, the committed engines (public/engine), the samples, the LVGL
// sources in third_party (fetched once for the engines) and the tutorial video.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What a clean removes, relative to the project root; `final` ones only with clean:all. */
export const CLEAN_TARGETS = [
  { path: "dist", what: "web build (vite)" },
  { path: "build", what: "engine builds, native test builds" },
  { path: "test-results", what: "test reports and screenshots" },
  { path: "src-tauri/gen", what: "Tauri generated schemas" },
  { path: "src-tauri/target", what: "Rust builds (app, e2e)", final: true },
];
/** Installers copied to the root by build:win (scripts/copy-installer.mjs). */
const INSTALLER = /^My LVGL Studio_.*\.(exe|msi|dmg|AppImage|deb)$/;

const sizeOf = (target) => {
  let total = 0;
  const visit = (item) => {
    let stat;
    try {
      stat = fs.lstatSync(item);
    } catch {
      return;
    }
    if (stat.isDirectory()) for (const name of fs.readdirSync(item)) visit(path.join(item, name));
    else total += stat.size;
  };
  visit(target);
  return total;
};

/**
 * Cleans `root`: { removed: [{ path, what, bytes }], kept: [{ path, reason }] }. Without `all`
 * the finished things stay (reason "final"). A file in use (the app still running) is kept and
 * said so; the rest goes on.
 */
export function clean(root = here, { all = false, dryRun = false } = {}) {
  const removed = [];
  const kept = [];
  const targets = [...CLEAN_TARGETS];
  for (const name of fs.readdirSync(root)) if (INSTALLER.test(name)) targets.push({ path: name, what: "installer copy", final: true });
  for (const target of targets) {
    const full = path.join(root, target.path);
    if (!fs.existsSync(full)) continue;
    if (target.final && !all) {
      kept.push({ path: target.path, reason: "final" });
      continue;
    }
    const bytes = sizeOf(full);
    if (dryRun) {
      removed.push({ ...target, bytes });
      continue;
    }
    try {
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      removed.push({ ...target, bytes });
    } catch (error) {
      const left = fs.existsSync(full) ? sizeOf(full) : 0;
      removed.push({ ...target, bytes: bytes - left });
      kept.push({ path: target.path, reason: ["EBUSY", "EPERM", "EACCES"].includes(error.code) ? "in use: close the app (npm start) and clean again" : error.message });
    }
  }
  return { removed, kept };
}

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const { removed, kept } = clean(here, { all, dryRun });
  const color = process.stdout.isTTY ? (code, text) => `\x1b[${code}m${text}\x1b[0m` : (_, text) => text;
  const width = Math.max(10, ...removed.map((item) => item.path.length), ...kept.map((item) => item.path.length));
  console.log(color("1;36", dryRun ? "Would remove:" : "Removed:"));
  if (!removed.length) console.log(color("90", "  nothing to clean"));
  for (const item of removed) console.log(`  ${color("32", "✔")} ${item.path.padEnd(width)}  ${megabytes(item.bytes).padStart(10)}  ${color("90", item.what)}`);
  for (const item of kept) {
    const final = item.reason === "final";
    console.log(`  ${color(final ? "90" : "33", final ? "-" : "!")} ${item.path.padEnd(width)}  ${color("90", final ? "kept (npm run clean:all removes it too)" : item.reason)}`);
  }
  const total = removed.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`${color("1", "Total")} ${megabytes(total)}${dryRun ? " (dry run)" : ""}`);
  process.exitCode = kept.some((item) => item.reason !== "final") ? 1 : 0;
}

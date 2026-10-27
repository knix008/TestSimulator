#!/usr/bin/env node
// MyVideoPlayer test suite.
//
//   node test/run.mjs                 everything
//   node test/run.mjs --only rust,ui  some groups (project, rust, renderer, desktop, youtube)
//   node test/run.mjs --offline       skip the YouTube network tests
//   node test/run.mjs --keep          keep the temporary folder (fixtures, app data, downloads)
//
// The desktop tests build and start the debug app with its own data folder and DevTools
// port; they never touch the user's settings or another running MyVideoPlayer.

import fs from "node:fs";
import { Runner, c, assert } from "./lib/harness.mjs";
import { EXE, TAURI, launchApp, makeFixtures, makeTempDir, run, stopApp } from "./lib/env.mjs";
import project from "./suites/project.mjs";
import rust from "./suites/rust.mjs";
import renderer from "./suites/renderer.mjs";
import desktop from "./suites/desktop.mjs";
import youtube, { NAMES as YOUTUBE_NAMES } from "./suites/youtube.mjs";

const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? new Set(args[i + 1].split(",").map((s) => s.trim().toLowerCase())) : null;
})();
const want = (group) => !only || only.has(group);
const offline = args.includes("--offline");
const keep = args.includes("--keep");

const r = new Runner();
const started = performance.now();
console.log("");
console.log(`  ${c.bold(c.cyan("MyVideoPlayer"))} ${c.bold("test suite")}  ${c.gray(`node ${process.version} · ${process.platform}/${process.arch}`)}`);

const tmp = makeTempDir();
let app = null;
try {
  if (want("project")) {
    r.header("Project checks");
    await project(r);
  }
  if (want("rust")) {
    r.header("Rust unit tests");
    await rust(r);
  }
  if (want("renderer")) {
    r.header("Renderer modules");
    await renderer(r);
  }
  if (want("desktop") || want("youtube")) {
    r.header("Desktop app");
    let fx = null;
    await r.test("Setup", "Debug app builds (cargo build)", () => {
      const out = run("cargo", ["build"], { cwd: TAURI });
      assert(out.status === 0, out.stderr.split("\n").filter((l) => /^error/.test(l)).join("\n") || "cargo build failed");
      assert(fs.existsSync(EXE), `missing ${EXE}`);
    }, { timeout: 900_000 });
    await r.test("Setup", "Fixtures are generated with FFmpeg", () => {
      fx = makeFixtures(tmp);
    }, { timeout: 120_000 });
    await r.test("Setup", "App starts in an isolated profile", async () => {
      app = await launchApp(tmp);
    }, { timeout: 60_000 });
    if (app && fx) {
      if (want("desktop")) await desktop(r, { app, fx });
      if (want("youtube")) {
        r.header("YouTube (network)");
        await youtube(r, { app, fx, offline });
      }
    } else {
      r.skipAll("YouTube", YOUTUBE_NAMES, "the app did not start");
    }
  }
} finally {
  stopApp(app);
  if (!keep) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      /* files still locked: leave the temp folder */
    }
  } else {
    console.log(c.gray(`\n  Kept temporary folder: ${tmp}`));
  }
}

const ok = r.summary(performance.now() - started);
process.exit(ok ? 0 : 1);

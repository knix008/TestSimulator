// Paths, helper programs, test fixtures, and launching the debug app in an isolated profile.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Page } from "./cdp.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TAURI = path.join(ROOT, "src-tauri");
export const IS_WIN = process.platform === "win32";
export const EXE = path.join(TAURI, "target", "debug", IS_WIN ? "MyVideoPlayer.exe" : "MyVideoPlayer");
export const FFMPEG = path.join(ROOT, "vendor", "ffmpeg", IS_WIN ? "ffmpeg.exe" : "ffmpeg");
export const DENO = path.join(ROOT, "vendor", "deno", IS_WIN ? "deno.exe" : "deno");
export const YT_DLP = path.join(ROOT, "vendor", "yt-dlp", IS_WIN ? "yt-dlp.exe" : "yt-dlp");

/** Forward slashes: safe to embed in page code on every OS. */
export const slash = (p) => p.replace(/\\/g, "/");

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  return r;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `fn` until it returns a truthy value. */
export async function waitFor(fn, { timeout = 10_000, interval = 150, what = "condition" } = {}) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ""}`);
    await sleep(interval);
  }
}

export function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mvp-test-"));
}

function ffmpeg(args) {
  const r = run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

const SRT = (lines) =>
  lines.map(([a, b, text], i) => `${i + 1}\n00:00:0${a},000 --> 00:00:0${b},000\n${text}\n`).join("\n");

/** Generates the media and subtitle files the desktop tests use. */
export function makeFixtures(dir) {
  const f = (name) => path.join(dir, name);
  const media = path.join(dir, "media");
  fs.mkdirSync(media, { recursive: true });
  const m = (name) => path.join(media, name);
  // 6 s H.264/AAC clip with a test pattern and a tone.
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", m("clip.mp4"),
  ]);
  fs.copyFileSync(m("clip.mp4"), m("tracks.mp4"));
  fs.copyFileSync(m("clip.mp4"), m("plain.mp4"));
  fs.copyFileSync(m("clip.mp4"), m("sami.mp4"));
  // Language tracks + the default copy, as a YouTube download leaves them.
  fs.writeFileSync(m("tracks.en.srt"), SRT([[0, 3, "Hello from the test"], [3, 6, "Second line"]]));
  fs.writeFileSync(m("tracks.ko.srt"), SRT([[0, 3, "테스트 자막입니다"], [3, 6, "두 번째 줄"]]));
  fs.writeFileSync(m("tracks.de.srt"), SRT([[0, 3, "Hallo vom Test"], [3, 6, "Zweite Zeile"]]));
  fs.copyFileSync(m("tracks.en.srt"), m("tracks.srt"));
  fs.writeFileSync(m("plain.srt"), SRT([[0, 6, "Plain subtitle file"]]));
  fs.writeFileSync(
    m("sami.smi"),
    "<SAMI><BODY><SYNC Start=0><P Class=KRCC>SMI line one<SYNC Start=3000><P Class=KRCC>SMI line two</BODY></SAMI>",
  );
  // Raw H.264 for the test RTSP camera (key frame every second, SPS/PPS repeated).
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=8",
    "-c:v", "libx264", "-profile:v", "baseline", "-pix_fmt", "yuv420p", "-x264-params", "keyint=25:repeat-headers=1",
    "-bsf:v", "h264_mp4toannexb", "-f", "h264", m("cam.h264"),
  ]);
  // Audio only.
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=660:duration=4", "-c:a", "aac", m("tone.m4a")]);
  // Codecs WebView2 cannot play → compatibility conversion.
  ffmpeg([
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=3",
    "-f", "lavfi", "-i", "sine=frequency=330:duration=3",
    "-c:v", "mpeg4", "-c:a", "libmp3lame", "-shortest", m("legacy.avi"),
  ]);
  // Served over plain HTTP for the "remote link" tests.
  fs.mkdirSync(f("www"), { recursive: true });
  fs.copyFileSync(m("clip.mp4"), path.join(dir, "www", "sample-video.mp4"));
  return { dir, media, m };
}

/** Starts the debug build with its own data folder, DevTools port and save folder. */
export async function launchApp(dir) {
  const port = await freePort();
  const configDir = path.join(dir, "config");
  const saveDir = path.join(dir, "saves");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(saveDir, { recursive: true });
  const child = spawn(EXE, [], {
    cwd: dir,
    windowsHide: false,
    stdio: "ignore",
    env: {
      ...process.env,
      MYVIDEOPLAYER_CONFIG_DIR: configDir,
      MYVIDEOPLAYER_TEST_SAVE_DIR: saveDir,
      // Only the bundled Deno: proves YouTube works on a PC without Node.js.
      MYVIDEOPLAYER_JS_RUNTIME: "deno",
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  const app = { child, port, configDir, saveDir, exited: false };
  child.on("exit", () => {
    app.exited = true;
  });
  app.main = await Page.connect(port, "index.html", { timeout: 30_000 });
  await waitFor(
    () =>
      app.main.run(
        () => document.readyState === "complete" && document.body.classList.contains("is-electron") && Boolean(window.desktopAPI),
      ),
    { timeout: 20_000, what: "player page ready" },
  );
  // The page binds its own listeners at the end of init(); give it a moment.
  await sleep(800);
  return app;
}

/** Ends exactly the process the tests started (never other MyVideoPlayer copies). */
export function stopApp(app) {
  if (!app) return;
  try {
    app.main?.close();
  } catch {
    /* ignore */
  }
  if (!app.exited && app.child.pid) {
    if (IS_WIN) run("taskkill", ["/pid", String(app.child.pid), "/t", "/f"]);
    else app.child.kill("SIGKILL");
  }
}

export async function connectPage(app, match, timeout = 10_000) {
  return Page.connect(app.port, match, { timeout });
}

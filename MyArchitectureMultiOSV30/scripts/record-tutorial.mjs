// Records the interactive tutorial (watch mode, every lesson, normal speed) as
// an MP4 video: launches the desktop app, starts Help → Interactive tutorial →
// Play and captures the window with the DevTools screencast, which ffmpeg
// encodes at a constant 25 frames per second.
//
//   npm run record:tutorial                 → MyArchitecture-Tutorial.mp4 (Korean)
//   node scripts/record-tutorial.mjs --lang en [--out file.mp4] [--speed 1.5] [--lessons 1-3]
//
// Needs ffmpeg on the PATH (or FFMPEG=path\to\ffmpeg.exe).

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { launch, sleep, root } from "../test/smoke/driver.mjs";

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const lang = arg("lang", "ko");
const out = path.resolve(root, arg("out", lang === "ko" ? "MyArchitecture-Tutorial.mp4" : `MyArchitecture-Tutorial-${lang}.mp4`));
const speed = +arg("speed", "1") || 1;
const [from, to] = (arg("lessons", "") || "").split("-").map((v) => (v ? +v - 1 : null));
const FPS = 25;
const W = 1600, H = 900; // video size; the window is a little larger (the toolbar's minimum width)

const ffmpeg = process.env.FFMPEG || "ffmpeg";
if (spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("ffmpeg was not found. Install it (e.g. choco install ffmpeg) or set FFMPEG.");
  process.exit(1);
}

// Keep rendering while other windows cover the app (no frames otherwise).
const a = await launch({ width: 1700, height: 956, args: ["--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
const app = (expr) => a.ev(`const app = window.myarchApp; ${expr}`);
let enc = null;
try {
  await sleep(1500);
  await app(`for (let i = 0; i < 4; i++) { const x = document.querySelector(".modal-head .icon-btn"); if (!x) break; x.click(); } app.settings.onboarded = true; app.setSetting("lang", ${JSON.stringify(lang)}); app.store.dirty = false; return 1`);
  await sleep(800);

  // ffmpeg reads JPEG frames from stdin; scale/pad keeps a fixed 1600×900 frame.
  fs.mkdirSync(path.dirname(out), { recursive: true });
  enc = spawn(ffmpeg, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const encDone = new Promise((res) => enc.on("close", res));

  // Latest screencast frame, written FPS times a second (the screencast only
  // sends a frame when something changes).
  let frame = null;
  a.on("Page.screencastFrame", (p) => {
    frame = Buffer.from(p.data, "base64");
    a.send("Page.screencastFrameAck", { sessionId: p.sessionId });
  });
  await a.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 });
  let frames = 0;
  const t0 = Date.now();
  const timer = setInterval(() => {
    if (!frame) return;
    // Catch up if the timer fell behind, so video time equals real time.
    const due = Math.floor(((Date.now() - t0) / 1000) * FPS);
    while (frames < due) { enc.stdin.write(frame); frames++; }
  }, 1000 / FPS);

  // Help → Interactive tutorial, watch mode, Play.
  await sleep(1500);
  const rep = await app(`
    const t = await app.openTutorial({ skipConfirm: true, lesson: ${from ?? 0}, mode: "watch" });
    t.speed = ${speed};
    ${to != null ? `const last = ${to}; const adv = t.advance.bind(t); t.advance = () => (t.li >= last && t.si >= t.lesson.steps.length - 1) ? false : adv();` : ""}
    await t.play();
    return { li: t.li, si: t.si, steps: t.lesson.steps.length, lessons: t.lessons.length, error: t.lastError || null };`);
  await sleep(2500); // linger on the "all lessons finished" panel
  clearInterval(timer);
  await a.send("Page.stopScreencast");
  enc.stdin.end();
  await encDone;
  enc = null;

  const finished = rep.error == null && (to != null || (rep.li === rep.lessons - 1 && rep.si >= rep.steps));
  const secs = Math.round(frames / FPS);
  console.log(`${finished ? "Recorded" : "Stopped early while recording"} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} (${frames} frames) → ${out}`);
  if (!finished) { console.error(`stopped at lesson ${rep.li + 1}, step ${rep.si + 1}: ${rep.error}`); process.exitCode = 1; }
  if (a.errors.length) { console.error("renderer errors:\n" + a.errors.join("\n")); process.exitCode = 1; }
} finally {
  if (enc) { try { enc.stdin.end(); } catch { /* closed */ } }
  await a.close();
}

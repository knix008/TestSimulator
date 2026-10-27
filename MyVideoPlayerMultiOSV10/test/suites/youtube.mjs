// YouTube over the real network. Skipped when YouTube cannot be reached (or with --offline).

import fs from "node:fs";
import path from "node:path";
import { assert, assertEqual, skip } from "../lib/harness.mjs";
import { sleep, slash, waitFor } from "../lib/env.mjs";

const SHORT = "https://www.youtube.com/watch?v=jNQXAC9IVRw"; // "Me at the zoo", 19 s, de + en subtitles
const LONG = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"; // Big Buck Bunny (Blender), 10 min
const EMBED_BLOCKED = "https://youtu.be/_1rs8M3QTao?si=cAEMC6EYWtDF6Xdk"; // embedding disabled by its owner

export const NAMES = [
  "Link parsing accepts every YouTube URL shape",
  "Video info comes from yt-dlp",
  "Download saves the video and its subtitles",
  "Default subtitle language becomes name.srt",
  "Saved video plays with its subtitle languages",
  "Stop (keep partial) saves a playable part of the video",
  "Cancel deletes the partial download",
  "In-app streaming uses the subtitle settings",
  "Embedding-disabled video plays from a downloaded copy",
];

async function online() {
  try {
    const res = await fetch("https://www.youtube.com/generate_204", { signal: AbortSignal.timeout(5000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export default async function youtube(r, ctx) {
  const C = "YouTube";
  if (ctx.offline || !(await online())) {
    r.skipAll(C, NAMES, ctx.offline ? "--offline" : "YouTube is not reachable");
    return;
  }
  const { app } = ctx;
  const main = app.main;
  const api = (method, ...args) => main.run((m, a) => window.desktopAPI[m](...a), method, args);
  const saved = (name) => path.join(app.saveDir, name);
  let video = null;

  await r.test(C, NAMES[0], async () => {
    for (const url of [SHORT, "https://youtu.be/jNQXAC9IVRw?si=x", "https://www.youtube.com/shorts/jNQXAC9IVRw"]) {
      assertEqual(await api("parseYouTube", url), { id: "jNQXAC9IVRw", url: SHORT }, url);
    }
    assertEqual(await api("parseYouTube", "https://example.com/watch?v=x"), null);
  });

  await r.test(C, NAMES[1], async () => {
    const res = await api("getYouTubeInfo", SHORT);
    assert(res.ok, res.error);
    assertEqual([res.info.id, res.info.title], ["jNQXAC9IVRw", "Me at the zoo"]);
  }, { timeout: 90_000 });

  await r.test(C, NAMES[2], async () => {
    const res = await api("downloadYouTube", { url: SHORT, title: "Me at the zoo", subtitleLang: "en" });
    assert(res.ok, res.error);
    assert(res.size > 100_000 && fs.existsSync(res.path), `size ${res.size}`);
    assert(res.subtitles >= 2, `${res.subtitles} subtitle tracks`);
    for (const f of ["Me at the zoo.en.srt", "Me at the zoo.de.srt"]) assert(fs.existsSync(saved(f)), `missing ${f}`);
    video = res.path;
  }, { timeout: 180_000 });

  await r.test(C, NAMES[3], async () => {
    if (!video) skip("download failed");
    const plain = fs.readFileSync(saved("Me at the zoo.srt"));
    assert(plain.equals(fs.readFileSync(saved("Me at the zoo.en.srt"))), "name.srt is not the English track");
  });

  await r.test(C, NAMES[4], async () => {
    if (!video) skip("download failed");
    await main.run(async (p) => {
      await window.__TAURI__.event.emitTo("main", "app:openMediaPaths", [p]);
    }, slash(video));
    await waitFor(() => main.run(() => document.querySelector("video").readyState >= 3), { what: "video ready" });
    const opts = await waitFor(
      async () => {
        const o = await main.run(() => [...document.getElementById("subtitleTrackSelect").options].map((x) => x.textContent));
        return o.length >= 2 ? o : null;
      },
      { what: "subtitle picker" },
    );
    assert(opts.some((o) => /English|영어/.test(o)) && opts.some((o) => /German|독일/.test(o)), opts.join(", "));
  });

  await r.test(C, NAMES[5], async () => {
    const job = main.run(
      (url) => {
        window.__ytPct = 0;
        window.desktopAPI.onYouTubeDownloadProgress((p) => {
          if (typeof p?.percent === "number") window.__ytPct = Math.max(window.__ytPct, p.percent);
        });
        return window.desktopAPI.downloadYouTube({ url, title: "bbb-partial", subtitleLang: "en" });
      },
      LONG,
    );
    await waitFor(() => main.run(() => window.__ytPct >= 3), { timeout: 90_000, interval: 300, what: "3 % downloaded" });
    const stop = await api("stopYouTubeDownload", { discard: false });
    assert(stop.ok && stop.keepPartial, JSON.stringify(stop));
    const res = await job;
    assert(res.ok && res.partial && res.stopped, JSON.stringify(res));
    assert(res.size > 1_000_000, `size ${res.size}`);
    const opened = await api("openMediaPath", slash(res.path));
    assert(opened.ok, opened.error);
  }, { timeout: 180_000 });

  await r.test(C, NAMES[6], async () => {
    const job = api("downloadYouTube", { url: LONG, title: "bbb-cancel" });
    await sleep(6000);
    await api("cancelYouTubeDownload", { discard: true });
    const res = await job;
    assert(res.cancelled, JSON.stringify(res));
    await waitFor(() => !fs.readdirSync(app.saveDir).some((f) => f.startsWith("bbb-cancel")), { timeout: 8000, what: "partial files deleted" });
  }, { timeout: 120_000 });

  await r.test(C, NAMES[7], async () => {
    await main.run((url) => {
      const ev = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true });
      ev.clipboardData.setData("text", url);
      document.body.dispatchEvent(ev);
    }, SHORT);
    const src = await waitFor(() => main.run(() => document.querySelector("iframe[src*='youtube']")?.src || ""), {
      timeout: 30_000,
      what: "YouTube player",
    });
    assert(src.includes("cc_load_policy=1") && src.includes("cc_lang_pref="), src);
  }, { timeout: 45_000 });

  // The owner of this video disabled embedding (iframe error 150); reported by the user.
  await r.test(C, NAMES[8], async () => {
    await main.run((url) => {
      const ev = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true });
      ev.clipboardData.setData("text", url);
      document.body.dispatchEvent(ev);
    }, EMBED_BLOCKED);
    const v = await waitFor(
      () =>
        main.run(() => {
          if (document.querySelector("#errorModal[open], dialog.error-dialog[open]")) throw new Error("error dialog shown");
          const v = document.querySelector("video");
          return v.currentSrc.includes("/__media/") && v.readyState >= 3 && v.currentTime > 0.3 ? { d: v.duration } : null;
        }),
      { timeout: 150_000, interval: 500, what: "downloaded copy playing" },
    );
    assert(v.d > 60, `duration ${v.d}`);
    assertEqual(await main.run(() => document.getElementById("statusFormat").textContent), "YouTube");
  }, { timeout: 180_000 });
}

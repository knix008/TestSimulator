// The real desktop app (debug build), launched with its own data folder and driven over CDP.

import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { assert, assertEqual, skip } from "../lib/harness.mjs";
import { listTargets } from "../lib/cdp.mjs";
import { startRtspServer } from "../lib/rtsp-server.mjs";
import { FFMPEG, ROOT, connectPage, run, sleep, slash, waitFor } from "../lib/env.mjs";

const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

/** Page helpers bound to the player page. */
function helpers(main) {
  const api = (method, ...args) => main.run((m, a) => window.desktopAPI[m](...a), method, args);
  const vp = (channel, ...args) =>
    main.run((ch, a) => window.__TAURI_INTERNALS__.invoke("vp", { channel: ch, args: a }), channel, args);
  const openPath = (p) =>
    main.run(async (p) => {
      await window.__TAURI__.event.emitTo("main", "app:openMediaPaths", [p]);
      return true;
    }, slash(p));
  const video = () =>
    main.run(() => {
      const v = document.querySelector("video");
      return { rs: v.readyState, paused: v.paused, t: v.currentTime, d: v.duration, src: v.currentSrc, err: v.error?.code || 0, rate: v.playbackRate };
    });
  const status = (id) => main.run((id) => document.getElementById(id)?.textContent?.trim() || "", id);
  const overlay = () => main.run(() => document.getElementById("subtitleOverlay")?.innerText?.trim() || "");
  const seek = (t) =>
    main.run((t) => {
      document.querySelector("video").currentTime = t;
      return true;
    }, t);
  /** Opens a file the way "Open with" does and waits until it is playing. */
  const play = async (p) => {
    await openPath(p);
    const name = path.basename(p);
    await waitFor(async () => (await status("statusFile")).includes(name), { timeout: 10_000, what: `${name} in the status bar` });
    return waitFor(
      async () => {
        const v = await video();
        if (v.err) throw new Error(`media error ${v.err}`);
        return v.rs >= 3 && v.t > 0.15 && v.src.includes("/__media/") ? v : null;
      },
      { timeout: 15_000, what: `${name} playing` },
    );
  };
  const settingsSave = (changes) =>
    main.run(async (changes) => {
      document.getElementById("btnSettings").click();
      await new Promise((r) => setTimeout(r, 250));
      for (const [id, value] of Object.entries(changes)) {
        const el = document.getElementById(id);
        if (el.type === "checkbox") el.checked = Boolean(value);
        else el.value = String(value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.getElementById("btnSaveSettings").click();
      await new Promise((r) => setTimeout(r, 350));
      return JSON.parse(window.desktopAPI.persistGetItem("myvideoplayer.settings.v1") || "{}");
    }, changes);
  return { api, vp, openPath, video, status, overlay, seek, play, settingsSave };
}

function rawHttp(port, requestPath) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1", () => {
      sock.write(`GET ${requestPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let data = "";
    sock.on("data", (d) => (data += d.toString("latin1")));
    sock.on("end", () => resolve(data.split("\r\n")[0]));
    sock.on("error", reject);
  });
}

export default async function desktop(r, ctx) {
  const { app, fx } = ctx;
  const main = app.main;
  const h = helpers(main);
  const { api, vp, play, video, status, overlay, seek, settingsSave } = h;

  // ── App ───────────────────────────────────────────────────────
  let C = "App";
  await r.test(C, "Player page is served from the local 127.0.0.1 server", async () => {
    const loc = await main.run(() => ({ host: location.hostname, path: location.pathname, title: document.title }));
    assertEqual([loc.host, loc.path, loc.title], ["127.0.0.1", "/index.html", "MyVideoPlayer"]);
  });

  await r.test(C, "Bridge exposes the desktop API (isTauri, isElectron)", async () => {
    const a = await main.run(() => ({ tauri: window.desktopAPI.isTauri, desktop: window.desktopAPI.isElectron, n: Object.keys(window.desktopAPI).length }));
    assert(a.tauri && a.desktop && a.n > 60, JSON.stringify(a));
  });

  await r.test(C, "App info reports name, version and platform", async () => {
    const info = await api("getAppInfo");
    assertEqual([info.name, info.version, info.isTauri], ["MyVideoPlayer", PKG_VERSION, true]);
    assert(["win32", "darwin", "linux"].includes(info.platform), info.platform);
  });

  await r.test(C, "Status bar shows the platform after start-up", async () => {
    assert((await status("statusPlatform")).includes("/"), await status("statusPlatform"));
  });

  await r.test(C, "Settings write through to persist.json", async () => {
    await api("persistSetItem", "test.key", "value-1");
    const file = path.join(app.configDir, "persist.json");
    await waitFor(() => fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8"))["test.key"] === "value-1", { what: "persist.json updated" });
    await api("persistRemoveItem", "test.key");
    await waitFor(() => !("test.key" in JSON.parse(fs.readFileSync(file, "utf8"))), { what: "key removed" });
  });

  await r.test(C, "Pages read settings synchronously at start (snapshot)", async () => {
    const snap = await main.run(() => {
      const x = new XMLHttpRequest();
      x.open("GET", window.__VP__.persistPath, false);
      x.send();
      return { status: x.status, keys: Object.keys(JSON.parse(x.responseText)) };
    });
    assertEqual(snap.status, 200);
    assert(snap.keys.includes("myvideoplayer.settings.v1"), snap.keys.join(","));
  });

  await r.test(C, "Unknown command channel is rejected", async () => {
    let msg = "";
    try {
      await vp("no:such");
    } catch (e) {
      msg = e.message;
    }
    assert(msg.includes("unknown channel"), msg || "no error");
  });

  // ── Server ────────────────────────────────────────────────────
  C = "Server";
  const port = Number(await main.run(() => location.port));
  const opened = await api("openMediaPath", slash(fx.m("clip.mp4")));

  await r.test(C, "Local file URL is served with HTTP Range (206)", async () => {
    const res = await main.run(async (url) => {
      const r = await fetch(url, { headers: { Range: "bytes=0-99" } });
      return { status: r.status, len: (await r.arrayBuffer()).byteLength, range: r.headers.get("content-range"), type: r.headers.get("content-type") };
    }, opened.url);
    assertEqual([res.status, res.len, res.type], [206, 100, "video/mp4"]);
    assert(/^bytes 0-99\/\d+$/.test(res.range), res.range);
  });

  await r.test(C, "Out-of-range request answers 416", async () => {
    const st = await main.run(async (url) => (await fetch(url, { headers: { Range: "bytes=999999999-" } })).status, opened.url);
    assertEqual(st, 416);
  });

  await r.test(C, "Media without the session key is refused (403)", async () => {
    const bad = opened.url.replace(/__media\/[^/]+\//, "__media/wrong-key/");
    assertEqual(await main.run(async (u) => (await fetch(u)).status, bad), 403);
  });

  await r.test(C, "Path traversal outside the pages is refused (403)", async () => {
    const line = await rawHttp(port, "/..%2f..%2fCargo.toml");
    assert(line.includes("403"), line);
  });

  await r.test(C, "Unknown page answers 404", async () => {
    assertEqual(await main.run(async () => (await fetch("/no-such-page.html")).status), 404);
  });

  // ── Playback ──────────────────────────────────────────────────
  C = "Playback";
  await r.test(C, "Opening a file (\"Open with\" path) plays it", async () => {
    const v = await play(fx.m("clip.mp4"));
    assert(Math.abs(v.d - 6) < 0.5, `duration ${v.d}`);
  });

  await r.test(C, "Seeking jumps to the requested time", async () => {
    await seek(4);
    await waitFor(async () => {
      const v = await video();
      return v.t >= 4 && v.rs >= 2;
    }, { what: "seek to 4 s" });
  });

  await r.test(C, "Play / pause button toggles playback", async () => {
    await seek(1);
    await main.run(() => document.getElementById("btnPlay").click());
    await waitFor(async () => (await video()).paused, { what: "paused" });
    await main.run(() => document.getElementById("btnPlay").click());
    await waitFor(async () => !(await video()).paused, { what: "playing again" });
  });

  await r.test(C, "Stop button stops playback", async () => {
    await main.run(() => document.getElementById("btnStop").click());
    await waitFor(async () => {
      const v = await video();
      return v.paused && v.t < 0.5;
    }, { what: "stopped at the start" });
  });

  await r.test(C, "Speed selector changes the playback rate", async () => {
    await main.run(() => {
      const s = document.getElementById("rateSelect");
      s.value = "1.5";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(async () => (await video()).rate === 1.5, { what: "rate 1.5" });
    await main.run(() => {
      const s = document.getElementById("rateSelect");
      s.value = "1";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  await r.test(C, "Audio-only file plays", async () => {
    const v = await play(fx.m("tone.m4a"));
    assert(Math.abs(v.d - 4) < 0.5, `duration ${v.d}`);
  });

  await r.test(C, "Missing file is reported, not opened", async () => {
    const res = await api("openMediaPath", "C:/definitely/missing/file.mp4");
    assertEqual(res.ok, false);
    assert(res.error, "no error text");
  });

  await r.test(C, "Last open folder is remembered", async () => {
    const dir = await api("persistGetItem", "dialog.lastOpenDir");
    assertEqual(path.resolve(dir), path.resolve(fx.media));
  });

  await r.test(C, "Recent list records played files", async () => {
    const raw = await api("persistGetItem", "myvideoplayer.recent.v1");
    const names = JSON.parse(raw || "[]").map((x) => x.name);
    assert(names.includes("clip.mp4") && names.includes("tone.m4a"), names.join(", "));
  });

  // ── Subtitles ─────────────────────────────────────────────────
  C = "Subtitles";
  const showsText = (text) => waitFor(async () => (await overlay()).includes(text), { timeout: 6000, what: `subtitle "${text}"` });

  await r.test(C, "Same-name .srt loads automatically", async () => {
    await play(fx.m("plain.mp4"));
    await seek(1);
    await showsText("Plain subtitle file");
    assert((await status("statusSubtitle")).includes("plain.srt"), await status("statusSubtitle"));
  });

  await r.test(C, "Same-name .smi loads automatically", async () => {
    await play(fx.m("sami.mp4"));
    await seek(0.5);
    await showsText("SMI line one");
  });

  await r.test(C, "Language tracks are listed, the default copy hidden", async () => {
    const tracks = await api("listSubtitles", slash(fx.m("tracks.mp4")));
    assertEqual(tracks.map((t) => t.lang), ["de", "en", "ko"]);
  });

  await r.test(C, "Control-bar picker shows languages, app language first", async () => {
    await play(fx.m("tracks.mp4"));
    const ui = await main.run(() => {
      const s = document.getElementById("subtitleTrackSelect");
      return {
        shown: getComputedStyle(document.getElementById("subtitleTrackGroup")).display !== "none",
        count: s.options.length,
        selected: s.selectedOptions[0]?.textContent,
        lang: document.documentElement.lang,
      };
    });
    assert(ui.shown && ui.count === 3, JSON.stringify(ui));
    await seek(1);
    await showsText(ui.lang === "ko" ? "테스트 자막입니다" : "Hello from the test");
  });

  await r.test(C, "Choosing another language switches the subtitles", async () => {
    await main.run(() => {
      const s = document.getElementById("subtitleTrackSelect");
      s.value = String([...s.options].findIndex((o) => /German|독일/.test(o.textContent)));
      s.dispatchEvent(new Event("change"));
    });
    await seek(1);
    await showsText("Hallo vom Test");
    assert((await status("statusSubtitle")).includes("tracks.de.srt"), await status("statusSubtitle"));
  });

  await r.test(C, "Default subtitle language setting is applied and saved", async () => {
    const saved = await settingsSave({ settingSubtitleLang: "en" });
    assertEqual(saved.subtitleLang, "en");
    await seek(1);
    await showsText("Hello from the test");
    await play(fx.m("clip.mp4"));
    await play(fx.m("tracks.mp4"));
    await seek(1);
    await showsText("Hello from the test");
  });

  await r.test(C, "\"Show subtitles\" off hides them, on shows them again", async () => {
    await settingsSave({ settingShowSubtitles: false });
    await seek(1.2);
    await waitFor(async () => (await overlay()) === "", { what: "overlay empty" });
    await settingsSave({ settingShowSubtitles: true, settingSubtitleLang: "auto" });
    await seek(1);
    await waitFor(async () => (await overlay()) !== "", { what: "overlay back" });
  });

  await r.test(C, "Picker is hidden for files without subtitles", async () => {
    await play(fx.m("clip.mp4"));
    const display = await main.run(() => getComputedStyle(document.getElementById("subtitleTrackGroup")).display);
    assertEqual(display, "none");
  });

  // ── Windows (spectrum / play list) ────────────────────────────
  C = "Windows";
  const countPages = async (name) => (await listTargets(app.port)).filter((t) => t.url.includes(name)).length;
  let spectrum = null;

  await r.test(C, "Spectrum window opens once for concurrent requests", async () => {
    await main.run(() => Promise.all([1, 2, 3].map(() => window.desktopAPI.openSpectrumWindow({ opacity: 70 }))));
    spectrum = await connectPage(app, "spectrum.html");
    await sleep(500);
    assertEqual(await countPages("spectrum.html"), 1);
  });

  await r.test(C, "Spectrum window gets its opacity from the open request", async () => {
    if (!spectrum) skip("spectrum window missing");
    await waitFor(async () => (await spectrum.run(() => window.desktopAPI.getWindowOpacity())) === 0.7, { what: "opacity 0.7" });
  });

  await r.test(C, "Messages relay player → spectrum window", async () => {
    if (!spectrum) skip("spectrum window missing");
    await spectrum.run(() => {
      window.__got = [];
      window.desktopAPI.onSpectrumMessage((m) => window.__got.push(m?.type));
    });
    await sleep(300);
    await api("sendSpectrumMessage", { type: "test-ping" });
    await waitFor(() => spectrum.run(() => window.__got.includes("test-ping")), { what: "ping received" });
  });

  await r.test(C, "Messages relay spectrum window → player", async () => {
    if (!spectrum) skip("spectrum window missing");
    await main.run(() => {
      window.__host = [];
      window.desktopAPI.onSpectrumWindowEvent((m) => window.__host.push(m?.type));
    });
    await sleep(300);
    await spectrum.run(() => window.desktopAPI.sendSpectrumHostMessage({ type: "test-pong" }));
    await waitFor(() => main.run(() => window.__host.includes("test-pong")), { what: "pong received" });
  });

  await r.test(C, "Closing the spectrum window notifies the player", async () => {
    if (!spectrum) skip("spectrum window missing");
    spectrum.close();
    await api("closeSpectrumWindow");
    await waitFor(() => main.run(() => window.__host.includes("closed")), { what: "closed event" });
    await waitFor(async () => (await countPages("spectrum.html")) === 0, { what: "window gone" });
  });

  let history = null;
  await r.test(C, "Play-list window opens and lists recent plays", async () => {
    await api("openHistoryWindow", { opacity: 90 });
    history = await connectPage(app, "history.html");
    await waitFor(async () => (await history.run(() => document.querySelectorAll(".history-item, li").length)) > 0, { what: "items listed" });
    assertEqual(await history.run(() => window.desktopAPI.getWindowOpacity()), 0.9);
  });

  // ── Window ────────────────────────────────────────────────────
  C = "Window";
  await r.test(C, "Bounds can be read and set", async () => {
    await api("setBounds", { x: 120, y: 90, width: 1100, height: 700 });
    await sleep(300);
    const b = await api("getBounds");
    assert(Math.abs(b.width - 1100) <= 2 && Math.abs(b.height - 700) <= 2 && Math.abs(b.x - 120) <= 2, JSON.stringify(b));
  });

  await r.test(C, "Minimum size is enforced", async () => {
    await api("setMinimumSize", 800, 420);
    await api("setBounds", { x: 120, y: 90, width: 400, height: 200 });
    await sleep(300);
    const b = await api("getBounds");
    assert(b.width >= 798 && b.height >= 418, JSON.stringify(b));
    await api("setBounds", { x: 120, y: 90, width: 1280, height: 800 });
  });

  await r.test(C, "Opacity is applied and clamped to 20–100 %", async () => {
    assertEqual(await api("setWindowOpacity", 0.1), 0.2);
    assertEqual(await api("setWindowOpacity", 0.65), 0.65);
    assertEqual(await api("getWindowOpacity"), 0.65);
    assertEqual(await api("setWindowOpacity", 1), 1);
  });

  await r.test(C, "Maximize toggles and reports the window state", async () => {
    await main.run(() => {
      window.__states = [];
      window.desktopAPI.onWindowState((s) => window.__states.push(s));
    });
    await sleep(200);
    assertEqual(await api("maximizeToggle"), true);
    await waitFor(() => api("isMaximized"), { what: "maximized" });
    await waitFor(() => main.run(() => window.__states.some((s) => s.maximized === true)), { what: "state event" });
    assertEqual(await api("maximizeToggle"), false);
    await waitFor(async () => !(await api("isMaximized")), { what: "restored" });
  });

  await r.test(C, "Video full screen takes the whole window full screen", async () => {
    await vp("window:setFullscreen", true);
    await waitFor(() => main.run(() => window.__states.some((s) => s.fullscreen === true)), { what: "fullscreen on" });
    await vp("window:setFullscreen", false);
    await waitFor(() => main.run(() => window.__states.some((s) => s.fullscreen === false)), { what: "fullscreen off" });
  });

  await r.test(C, "Toolbar drag keeps the window under the cursor", async () => {
    const before = await api("getBounds");
    await main.run(() => {
      window.desktopAPI.beginWindowDrag();
      window.desktopAPI.updateWindowDrag(0, 0);
      window.desktopAPI.endWindowDrag();
    });
    await sleep(400);
    const after = await api("getBounds");
    assert(Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  });

  await r.test(C, "Minimize takes all windows down, restore brings all back", async () => {
    if (!history) skip("play-list window missing");
    const minimized = (page) => page.run(() => window.__TAURI_INTERNALS__.invoke("vp", { channel: "window:isMinimized", args: [] }));
    try {
      await api("minimize");
      await waitFor(() => minimized(main), { what: "player minimized" });
      await waitFor(() => minimized(history), { what: "play list minimized" });
      // Bringing back one window (here: re-opening the play list) restores the whole group.
      await api("openHistoryWindow", {});
      await waitFor(async () => !(await minimized(main)), { what: "player restored" });
    } finally {
      await vp("window:setFullscreen", false);
      history.close();
      await api("closeHistoryWindow");
      if (await minimized(main)) await api("maximizeToggle").then(() => api("maximizeToggle"));
    }
  });

  // ── Compat ────────────────────────────────────────────────────
  C = "Compat";
  let converted = null;
  await r.test(C, "Soft conversion rebuilds a legacy AVI as MP4", async () => {
    await main.run(() => {
      window.__compat = [];
      window.desktopAPI.onMediaCompatProgress((p) => window.__compat.push(p.phase));
    });
    const res = await api("makeMediaCompatible", slash(fx.m("legacy.avi")), { mode: "soft" });
    assert(res.ok, res.error);
    assert(res.path.endsWith(".mp4") && fs.existsSync(res.path), res.path);
    converted = res;
  }, { timeout: 120_000 });

  await r.test(C, "Conversion reports progress phases", async () => {
    const phases = await main.run(() => window.__compat);
    assert(phases.includes("transcode"), phases.join(","));
  });

  await r.test(C, "Second request uses the conversion cache", async () => {
    const res = await api("makeMediaCompatible", slash(fx.m("legacy.avi")), { mode: "soft" });
    assert(res.ok && res.cached, JSON.stringify({ ok: res.ok, cached: res.cached }));
  });

  await r.test(C, "Full conversion produces H.264 that plays", async () => {
    const res = await api("makeMediaCompatible", slash(fx.m("legacy.avi")), { mode: "full" });
    assert(res.ok && res.mode === "full", res.error || res.mode);
    const probe = run(FFMPEG, ["-hide_banner", "-i", res.path]).stderr;
    assert(/Video: h264/.test(probe), "not H.264");
    await play(res.path);
  }, { timeout: 120_000 });

  // ── Remote links ──────────────────────────────────────────────
  C = "Remote";
  const www = path.join(fx.dir, "www");
  const server = http.createServer((req, res) => {
    const file = path.join(www, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(www) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const remoteUrl = `http://127.0.0.1:${server.address().port}/sample-video.mp4`;

  try {
    await r.test(C, "Link detection: sites yes, YouTube and RTSP no", async () => {
      assertEqual(
        await Promise.all([
          api("isSupportedRemoteUrl", "https://www.tiktok.com/@a/video/1"),
          api("isSupportedRemoteUrl", "https://www.instagram.com/reel/abc"),
          api("isSupportedRemoteUrl", "https://youtu.be/jNQXAC9IVRw"),
          api("isSupportedRemoteUrl", "rtsp://cam/1"),
        ]),
        [true, true, false, false],
      );
    });

    await r.test(C, "Link info comes from yt-dlp", async () => {
      const res = await api("getRemoteVideoInfo", remoteUrl);
      assert(res.ok, res.error);
      assertEqual(res.info.title, "sample-video");
    }, { timeout: 60_000 });

    await r.test(C, "Opening a link downloads and plays it", async () => {
      const res = await api("openRemoteVideo", { url: remoteUrl });
      assert(res.ok, res.error);
      assert(fs.existsSync(res.path), res.path);
      await play(res.path);
    }, { timeout: 90_000 });

    await r.test(C, "Opening the same link again reuses the file", async () => {
      const res = await api("openRemoteVideo", { url: remoteUrl + "?utm_source=test" });
      assert(res.ok && res.reused, JSON.stringify({ ok: res.ok, reused: res.reused }));
    });

    await r.test(C, "Saving the link copies the already-downloaded file", async () => {
      const res = await api("downloadRemoteVideo", { url: remoteUrl });
      assert(res.ok && res.reused, res.error || "not reused");
      assert(path.dirname(res.path) === app.saveDir || path.resolve(path.dirname(res.path)) === path.resolve(app.saveDir), res.path);
      assert(fs.statSync(res.path).size > 10_000, "file too small");
    });

    await r.test(C, "Cancelling with nothing running is harmless", async () => {
      assertEqual((await api("cancelRemoteDownload", { discard: true })).ok, false);
    });
  } finally {
    server.close();
  }

  // ── RTSP ──────────────────────────────────────────────────────
  C = "RTSP";
  await r.test(C, "RTSP link detection", async () => {
    assertEqual(
      await Promise.all([api("isRtspUrl", "rtsp://cam/1"), api("isRtspUrl", "RTSPS://cam"), api("isRtspUrl", "https://cam")]),
      [true, true, false],
    );
  });

  await r.test(C, "Live preview plays through the local bridge", async () => {
    const cam = await startRtspServer(fx.m("cam.h264"));
    try {
      const res = await api("openRtsp", cam.url);
      assert(res.ok && res.playUrl.includes("/__rtsp/"), JSON.stringify(res));
      assert((await api("getActiveRtsp"))?.url === cam.url, "not active");
      await main.run((u) => {
        const v = document.createElement("video");
        v.id = "testRtsp";
        v.muted = true;
        v.src = u;
        document.body.appendChild(v);
        v.play().catch(() => {});
        return true;
      }, res.playUrl);
      await waitFor(() => main.run(() => {
        const v = document.getElementById("testRtsp");
        return v.readyState >= 2 && v.currentTime > 0.3;
      }), { timeout: 20_000, what: "RTSP video frames" });
    } finally {
      await main.run(() => document.getElementById("testRtsp")?.remove());
      await api("stopRtsp");
      cam.stop();
    }
    assertEqual(await api("getActiveRtsp"), null);
  }, { timeout: 40_000 });

  await r.test(C, "Recording saves a playable MP4", async () => {
    const cam = await startRtspServer(fx.m("cam.h264"));
    try {
      await main.run(() => {
        window.__rec = [];
        window.desktopAPI.onRtspRecordProgress((p) => window.__rec.push(p.phase));
      });
      const start = await api("startRtspRecord", { url: cam.url });
      assert(start.ok, start.error);
      await waitFor(async () => ((await api("getRtspRecording"))?.elapsedMs || 0) > 2500, { timeout: 15_000, what: "2.5 s recorded" });
      const done = await api("stopRtspRecord", {});
      assert(done.ok && done.size > 20_000, JSON.stringify(done));
      const phases = await main.run(() => window.__rec);
      assert(phases.includes("started") && phases.includes("recording") && phases.includes("done"), phases.join(","));
      const v = await play(done.path);
      assert(v.d >= 1, `duration ${v.d}`);
    } finally {
      cam.stop();
    }
  }, { timeout: 60_000 });

  await r.test(C, "Cancelled recording leaves no file", async () => {
    const cam = await startRtspServer(fx.m("cam.h264"));
    try {
      const start = await api("startRtspRecord", { url: cam.url });
      assert(start.ok, start.error);
      await sleep(2000);
      const res = await api("stopRtspRecord", { discard: true });
      assert(res.cancelled, JSON.stringify(res));
      await waitFor(() => !fs.existsSync(start.path), { what: "file deleted" });
    } finally {
      cam.stop();
    }
  }, { timeout: 40_000 });

  // ── UI ────────────────────────────────────────────────────────
  C = "UI";
  const buttonColors = () =>
    main.run(() =>
      Object.fromEntries(
        ["btnPrev", "btnPlay", "btnStop", "btnNext", "btnMute", "btnRateDown", "rateSelect", "btnRateUp"].map((id) => {
          const s = getComputedStyle(document.getElementById(id));
          return [id, { bg: s.backgroundColor, border: s.borderTopColor, fg: s.color }];
        }),
      ),
    );
  const clear = "rgba(0, 0, 0, 0)";

  await r.test(C, "Dark theme: white outline buttons, Stop filled red", async () => {
    await settingsSave({ settingTheme: "dark" });
    const b = await buttonColors();
    for (const [id, s] of Object.entries(b)) {
      if (id === "btnStop") continue;
      assertEqual([s.bg, s.border, s.fg], [clear, "rgb(255, 255, 255)", "rgb(255, 255, 255)"], id);
    }
    assertEqual(b.btnStop.bg, "rgb(232, 93, 93)", "stop");
  });

  await r.test(C, "Light theme: outlines use the theme text colour", async () => {
    await settingsSave({ settingTheme: "light" });
    const [b, text] = await Promise.all([buttonColors(), main.run(() => getComputedStyle(document.body).color)]);
    assertEqual([b.btnPlay.bg, b.btnPlay.border], [clear, text]);
    assertEqual(b.btnStop.bg, "rgb(232, 93, 93)", "stop");
    await settingsSave({ settingTheme: "dark" });
  });

  await r.test(C, "Language button switches the interface language", async () => {
    const before = await main.run(() => document.documentElement.lang);
    await main.run(() => document.getElementById("btnLocale").click());
    await waitFor(async () => (await main.run(() => document.documentElement.lang)) !== before, { what: "language switched" });
    const label = await main.run(() => document.querySelector("[data-i18n=subtitleLang]").textContent);
    assert(label === "Default subtitle language" || label === "기본 자막 언어", label);
    await main.run(() => document.getElementById("btnLocale").click());
    await waitFor(async () => (await main.run(() => document.documentElement.lang)) === before, { what: "language restored" });
  });

  await r.test(C, "Settings list the default subtitle languages", async () => {
    const opts = await main.run(() => [...document.getElementById("settingSubtitleLang").options].map((o) => o.value));
    assertEqual(opts.slice(0, 3), ["auto", "ko", "en"]);
    assert(opts.length >= 10, String(opts.length));
  });

  await r.test(C, "Compact mode shrinks the window and restores it", async () => {
    const before = await api("getBounds");
    await main.run(() => document.getElementById("btnCompact").click());
    await waitFor(() => main.run(() => document.getElementById("app").classList.contains("is-compact")), { what: "compact on" });
    await sleep(400);
    const small = await api("getBounds");
    assert(small.width < before.width, `${small.width} !< ${before.width}`);
    await main.run(() => document.getElementById("btnCompact").click());
    await waitFor(() => main.run(() => !document.getElementById("app").classList.contains("is-compact")), { what: "compact off" });
  });

  await r.test(C, "About dialog shows the app version", async () => {
    const text = await main.run(async () => {
      document.getElementById("btnAbout").click();
      await new Promise((r) => setTimeout(r, 300));
      const t = document.getElementById("aboutVersion").textContent;
      document.getElementById("aboutModal").close();
      return t;
    });
    assert(text.includes(PKG_VERSION), text);
  });
}

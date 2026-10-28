// The renderer's pure modules, imported straight into Node.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { assert, assertEqual } from "../lib/harness.mjs";
import { ROOT } from "../lib/env.mjs";

// persist.js / recent.js fall back to localStorage outside the desktop app.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const load = (name) => import(pathToFileURL(path.join(ROOT, "src", "js", name)).href);

export default async function renderer(r) {
  const C = "Renderer";
  const subs = await load("subtitles.js");
  const settings = await load("settings.js");
  const recent = await load("recent.js");
  const themes = await load("themes.js");
  const i18n = await load("i18n.js");
  const yt = await load("youtube-player.js");

  await r.test(C, "SRT parser reads cues, times and tags", () => {
    const cues = subs.parseSRT("1\n00:00:01,500 --> 00:00:03,000\n<i>Hi</i> there\n\n2\n00:01:00,000 --> 00:01:02,250\nLine A\nLine B\n");
    assertEqual(cues.length, 2);
    assertEqual([cues[0].start, cues[0].end, cues[0].text], [1.5, 3, "Hi there"]);
    assertEqual([cues[1].start, cues[1].text], [60, "Line A\nLine B"]);
  });

  await r.test(C, "VTT parser skips the header", () => {
    const cues = subs.parseVTT("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n");
    assertEqual(cues.map((c) => c.text), ["Hello"]);
  });

  await r.test(C, "SMI parser reads SYNC blocks", () => {
    const cues = subs.parseSMI("<SAMI><BODY><SYNC Start=1000><P>One<SYNC Start=2500><P>Two&nbsp;!</BODY></SAMI>");
    assertEqual(cues.map((c) => [c.start, c.text]), [[1, "One"], [2.5, "Two !"]]);
  });

  await r.test(C, "parseSubtitle detects the format (and drops a BOM)", () => {
    assertEqual(subs.parseSubtitle("\uFEFFWEBVTT\n\n00:00:00.000 --> 00:00:01.000\nV\n", "").length, 1);
    assertEqual(subs.parseSubtitle("<SAMI><BODY><SYNC Start=0><P>S</BODY></SAMI>", ".txt")[0].text, "S");
    assertEqual(subs.parseSubtitle("1\n00:00:00,000 --> 00:00:01,000\nR\n", ".srt")[0].text, "R");
  });

  await r.test(C, "YouTube id extraction accepts every link shape", () => {
    const id = "jNQXAC9IVRw";
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?feature=share&v=${id}`,
      `https://youtu.be/${id}?si=x`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      id,
    ]) {
      assertEqual(yt.extractYouTubeId(url), id, url);
    }
    assert(!yt.isYouTubeUrl("https://www.tiktok.com/@a/video/1"), "TikTok taken as YouTube");
  });

  await r.test(C, "Settings defaults include subtitle options", () => {
    assertEqual(settings.DEFAULT_SETTINGS.showSubtitles, true);
    assertEqual(settings.DEFAULT_SETTINGS.subtitleLang, "auto");
  });

  await r.test(C, "Settings normalise fit mode and rotation", () => {
    assertEqual(settings.normalizeVideoFit("cover"), "cover");
    assertEqual(settings.normalizeVideoFit("bogus"), "contain");
    assertEqual(settings.normalizeVideoRotation(-90), 270);
    assertEqual(settings.normalizeVideoRotation(45), 0);
  });

  await r.test(C, "Settings save and load round trip", () => {
    settings.saveSettings({ ...settings.DEFAULT_SETTINGS, subtitleLang: "ja", subSize: 33 });
    const loaded = settings.loadSettings();
    assertEqual([loaded.subtitleLang, loaded.subSize], ["ja", 33]);
  });

  await r.test(C, "Recent list de-duplicates and keeps the newest first", () => {
    recent.clearRecent();
    recent.addRecent({ type: "file", name: "a.mp4", path: "C:/a.mp4" });
    recent.addRecent({ type: "youtube", name: "yt", url: "https://youtu.be/jNQXAC9IVRw" });
    recent.addRecent({ type: "file", name: "a.mp4", path: "C:/a.mp4" });
    const list = recent.loadRecent();
    assertEqual(list.map((x) => x.id), ["file:C:/a.mp4", "youtube:https://youtu.be/jNQXAC9IVRw"]);
  });

  await r.test(C, "Recent list is capped and skips unusable entries", () => {
    recent.clearRecent();
    for (let i = 0; i < recent.RECENT_LIMIT + 5; i++) recent.addRecent({ type: "file", name: `${i}`, path: `C:/${i}.mp4` });
    recent.addRecent({ type: "file", name: "blob-only" });
    const list = recent.loadRecent();
    assertEqual(list.length, recent.RECENT_LIMIT);
    assertEqual(list[0].name, String(recent.RECENT_LIMIT + 4));
  });

  await r.test(C, "Every built-in theme defines the colours the controls use", () => {
    const need = ["--bg-primary", "--bg-primary-hover", "--text", "--text-inverse", "--bg-stage", "--border"];
    for (const t of themes.BUILTIN_THEMES) {
      for (const v of need) assert(t.vars[v], `${t.id} lacks ${v}`);
      assert(t.scheme === "light" || t.scheme === "dark", `${t.id} scheme`);
    }
    assert(themes.BUILTIN_THEMES.length >= 20, "fewer than 20 built-in themes");
  });

  await r.test(C, "i18n switches language and fills placeholders", () => {
    i18n.setLocale("ko");
    assertEqual(i18n.t("subtitleLang"), "기본 자막 언어");
    i18n.setLocale("en");
    assertEqual(i18n.t("subtitleLang"), "Default subtitle language");
    assertEqual(i18n.t("progressBytes", { n: 12 }), "12 MB");
    assertEqual(i18n.t("noSuchKey"), "noSuchKey");
  });
}

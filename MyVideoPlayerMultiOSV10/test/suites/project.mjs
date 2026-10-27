// Project / packaging checks that need no running app.

import fs from "node:fs";
import path from "node:path";
import { assert, assertEqual } from "../lib/harness.mjs";
import { FFMPEG, ROOT, TAURI, YT_DLP, run } from "../lib/env.mjs";

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

/** Both locale dictionaries from src/js/i18n.js. */
export function loadDictionaries() {
  const src = read("src", "js", "i18n.js");
  const start = src.indexOf("const dictionaries = {");
  const end = src.indexOf("\n};", start);
  return new Function(`${src.slice(start, end + 3)}; return dictionaries;`)();
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export default async function project(r) {
  const C = "Project";
  const pkg = JSON.parse(read("package.json"));
  const conf = JSON.parse(read("src-tauri", "tauri.conf.json"));

  await r.test(C, "Versions match in package.json, Cargo.toml, tauri.conf", () => {
    const cargo = read("src-tauri", "Cargo.toml").match(/^version = "([^"]+)"/m)?.[1];
    assertEqual([cargo, conf.version], [pkg.version, pkg.version]);
  });

  await r.test(C, "Bundle icons and license file exist", () => {
    for (const icon of conf.bundle.icon) assert(fs.existsSync(path.join(TAURI, icon)), `missing ${icon}`);
    assert(fs.existsSync(path.join(TAURI, conf.bundle.licenseFile)), "missing license file");
  });

  await r.test(C, "Bundled yt-dlp is present and runs", () => {
    assert(fs.existsSync(YT_DLP), `missing ${YT_DLP} — run npm run ensure:tools`);
    const v = run(YT_DLP, ["--version"]);
    assert(v.status === 0 && /^\d{4}\.\d+\.\d+/.test(v.stdout.trim()), `yt-dlp --version: ${v.stderr || v.stdout}`);
  });

  await r.test(C, "Bundled FFmpeg is present and runs", () => {
    assert(fs.existsSync(FFMPEG), `missing ${FFMPEG} — run npm run ensure:tools`);
    const v = run(FFMPEG, ["-version"]);
    assert(v.status === 0 && v.stdout.startsWith("ffmpeg version"), "ffmpeg -version failed");
  });

  await r.test(C, "Bundle resources point at the vendored tools", () => {
    const res = conf.bundle.resources;
    assertEqual(res["../vendor/yt-dlp/"], "yt-dlp/");
    assertEqual(res["../vendor/ffmpeg/"], "ffmpeg/");
  });

  await r.test(C, "File associations cover every playable extension", () => {
    const exts = conf.bundle.fileAssociations.flatMap((a) => a.ext);
    for (const e of ["mp4", "mkv", "webm", "mov", "avi", "mp3", "m4a", "flac", "wav", "ogg"]) {
      assert(exts.includes(e), `missing .${e}`);
    }
  });

  await r.test(C, "Capability allows the localhost pages and the vp command", () => {
    const cap = JSON.parse(read("src-tauri", "capabilities", "default.json"));
    assert(cap.remote.urls.includes("http://127.0.0.1:*"), "remote origin missing");
    assert(cap.permissions.includes("allow-vp"), "allow-vp missing");
    assertEqual(cap.windows, ["main", "spectrum", "history"]);
    assert(read("src-tauri", "build.rs").includes('commands(&["vp"])'), "build.rs does not register vp");
  });

  await r.test(C, "Page CSPs allow Tauri IPC", () => {
    for (const page of ["index.html", "spectrum.html", "history.html"]) {
      const csp = read("src", page).match(/Content-Security-Policy"?\s*content="([^"]+)"/)?.[1] || "";
      const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src")) || "";
      assert(connect.includes("ipc:") && connect.includes("http://ipc.localhost"), `${page}: ${connect}`);
    }
  });

  await r.test(C, "NSIS hooks define the macros Tauri calls", () => {
    const hooks = read("src-tauri", "windows", "hooks.nsh");
    for (const m of ["NSIS_HOOK_PREINSTALL", "NSIS_HOOK_POSTINSTALL", "NSIS_HOOK_POSTUNINSTALL"]) {
      assert(hooks.includes(`!macro ${m}`), `missing ${m}`);
    }
    // Template variables must not appear inside Functions (declared later in the template).
    const fns = hooks.split("Function ").slice(1).map((s) => s.split("FunctionEnd")[0]);
    assert(!fns.some((f) => /\$(UpdateMode|DeleteAppDataCheckboxState)/.test(f)), "template variable used in a Function");
  });

  await r.test(C, "Bridge implements every desktopAPI call the pages make", () => {
    const bridge = read("src-tauri", "src", "bridge.js");
    const used = new Set();
    for (const file of walk(path.join(ROOT, "src", "js"))) {
      for (const m of fs.readFileSync(file, "utf8").matchAll(/desktopAPI\??\.([a-zA-Z]+)/g)) used.add(m[1]);
    }
    const missing = [...used].filter((name) => !new RegExp(`\\b${name}:`).test(bridge));
    assertEqual(missing, [], "missing in bridge.js");
  });

  await r.test(C, "Every bridge channel has a handler in lib.rs", () => {
    const bridge = read("src-tauri", "src", "bridge.js");
    const lib = read("src-tauri", "src", "lib.rs");
    const channels = new Set([...bridge.matchAll(/(?:invoke|send)\("([a-z]+:[a-zA-Z]+)"/g)].map((m) => m[1]));
    const missing = [...channels].filter((ch) => !lib.includes(`"${ch}"`));
    assertEqual(missing, [], "unhandled channels");
  });

  await r.test(C, "English and Korean dictionaries have the same keys", () => {
    const d = loadDictionaries();
    const en = Object.keys(d.en);
    const ko = Object.keys(d.ko);
    assertEqual(en.filter((k) => !(k in d.ko)), [], "missing in ko");
    assertEqual(ko.filter((k) => !(k in d.en)), [], "missing in en");
  });

  await r.test(C, "Every data-i18n key in the pages exists", () => {
    const d = loadDictionaries();
    const missing = [];
    for (const page of ["index.html", "spectrum.html", "history.html"]) {
      for (const m of read("src", page).matchAll(/data-i18n(?:-tooltip|-aria|-html)?="([^"]+)"/g)) {
        if (!(m[1] in d.en)) missing.push(`${page}:${m[1]}`);
      }
    }
    assertEqual(missing, []);
  });

  await r.test(C, "No Electron code is left in the app", () => {
    assert(!fs.existsSync(path.join(ROOT, "electron")), "electron/ still exists");
    assert(!pkg.dependencies?.electron && !pkg.devDependencies?.electron, "electron dependency");
    const hits = walk(path.join(ROOT, "src")).filter((f) => /require\(["']electron["']\)/.test(fs.readFileSync(f, "utf8")));
    assertEqual(hits, []);
  });

  await r.test(C, "Generated themes.css matches gen-themes-css.js header", () => {
    const css = read("src", "styles", "themes.css");
    const gen = read("scripts", "gen-themes-css.js");
    const header = css.split("\n").slice(0, 2).join("\n").trim();
    assert(gen.includes(header.split("\n")[1].trim()), "themes.css header differs from the generator");
  });
}

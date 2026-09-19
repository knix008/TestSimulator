"use strict";

/**
 * Download a platform yt-dlp binary into vendor/yt-dlp for reliable YouTube saves.
 * Re-downloads when missing, too small, or older than MIN_VERSION.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const VENDOR = path.join(ROOT, "vendor", "yt-dlp");
/** Refresh when bundled binary is older than this (YYYY.MM.DD). */
const MIN_VERSION = "2026.08.01";

function binaryName() {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function downloadUrl() {
  const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
  if (process.platform === "win32") return `${base}/yt-dlp.exe`;
  if (process.platform === "darwin") return `${base}/yt-dlp_macos`;
  return `${base}/yt-dlp`;
}

function parseYtDlpVersion(text) {
  const m = String(text || "").match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}.${String(m[2]).padStart(2, "0")}.${String(m[3]).padStart(2, "0")}`;
}

function versionAtLeast(current, minimum) {
  const a = parseYtDlpVersion(current);
  const b = parseYtDlpVersion(minimum);
  if (!a || !b) return false;
  return a >= b;
}

function readLocalVersion(dest) {
  try {
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 500000) return null;
    const result = spawnSync(dest, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    });
    if (result.status !== 0) return null;
    return parseYtDlpVersion(result.stdout || result.stderr || "");
  } catch {
    return null;
  }
}

function fetchToFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(
      url,
      { headers: { "User-Agent": "MyVideoPlayer-yt-dlp-bootstrap" } },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          fetchToFile(res.headers.location, dest, redirectsLeft - 1).then(
            resolve,
            reject,
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} downloading yt-dlp`));
          return;
        }
        const tmp = `${dest}.download`;
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on("finish", () => {
          out.close(() => {
            try {
              fs.renameSync(tmp, dest);
              if (process.platform !== "win32") {
                fs.chmodSync(dest, 0o755);
              }
              resolve(dest);
            } catch (err) {
              reject(err);
            }
          });
        });
        out.on("error", reject);
      },
    );
    req.on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(VENDOR, { recursive: true });
  const dest = path.join(VENDOR, binaryName());
  const force = ["1", "true", "yes"].includes(
    String(process.env.MYVIDEOPLAYER_UPDATE_YTDLP || "").toLowerCase(),
  );
  const localVersion = readLocalVersion(dest);
  if (!force && localVersion && versionAtLeast(localVersion, MIN_VERSION)) {
    return;
  }

  const url = downloadUrl();
  console.log(
    `[ensure-yt-dlp] downloading ${url}` +
      (localVersion ? ` (have ${localVersion}, need >= ${MIN_VERSION})` : ""),
  );
  await fetchToFile(url, dest);
  const next = readLocalVersion(dest) || "unknown";
  console.log(`[ensure-yt-dlp] saved ${dest} (${next})`);
}

main().catch((err) => {
  console.warn(`[ensure-yt-dlp] skipped: ${err.message || err}`);
  // Do not fail install/build — built-in youtubei.js remains as fallback.
  process.exit(0);
});

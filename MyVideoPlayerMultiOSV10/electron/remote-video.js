"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { sanitizeFilename } = require("./youtube");
const { resolveFfmpegPath } = require("./media-compat");

let activeDownload = null;

class RemoteDownloadCancelledError extends Error {
  constructor() {
    super("Download cancelled");
    this.name = "RemoteDownloadCancelledError";
    this.cancelled = true;
  }
}

function isHttpUrl(input) {
  const text = String(input || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function detectRemoteService(input) {
  const text = String(input || "").trim();
  if (/instagram\.com/i.test(text)) return "instagram";
  if (/tiktok\.com/i.test(text) || /vt\.tiktok\.com/i.test(text))
    return "tiktok";
  return "remote";
}

function serviceLabel(service) {
  if (service === "instagram") return "Instagram";
  if (service === "tiktok") return "TikTok";
  return "Remote";
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
}

function runCommand(
  command,
  args,
  { onStdout, onStderr, trackDownload = false } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
    });
    if (trackDownload && activeDownload) {
      activeDownload.child = child;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onStdout?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (trackDownload && activeDownload) activeDownload.child = undefined;
      if (activeDownload?.cancelled) {
        reject(new RemoteDownloadCancelledError());
        return;
      }
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `${command} exited with ${code}`,
          ),
        );
    });
  });
}

function ytDlpBinaryName() {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function ytDlpCandidatePaths() {
  const name = ytDlpBinaryName();
  const list = [];
  try {
    if (app?.isPackaged) {
      list.push(path.join(process.resourcesPath, "yt-dlp", name));
    } else if (typeof app?.getAppPath === "function") {
      list.push(path.join(app.getAppPath(), "vendor", "yt-dlp", name));
    }
  } catch {
    /* ignore */
  }
  list.push(path.join(__dirname, "..", "vendor", "yt-dlp", name));
  list.push(name);
  if (name === "yt-dlp.exe") list.push("yt-dlp");
  return list;
}

async function findYtDlp() {
  for (const cmd of ytDlpCandidatePaths()) {
    try {
      if (path.isAbsolute(cmd) && !fs.existsSync(cmd)) continue;
      await runCommand(cmd, ["--version"]);
      return cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

function remoteTempDir() {
  const dir = path.join(app.getPath("temp"), "my-video-player-remote");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTempOutputPath(input, title = "") {
  const service = detectRemoteService(input);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = sanitizeFilename(title || `${serviceLabel(service)}-${stamp}`);
  return path.join(remoteTempDir(), `${base}-${Date.now()}.mp4`);
}

function resolveOutputPath(outputPath) {
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0)
    return outputPath;
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  try {
    const found = fs
      .readdirSync(dir)
      .filter(
        (f) => f === path.basename(outputPath) || f.startsWith(`${base}.`),
      )
      .map((f) => {
        const full = path.join(dir, f);
        try {
          return { full, size: fs.statSync(full).size };
        } catch {
          return { full, size: 0 };
        }
      })
      .filter((x) => x.size > 0)
      .sort((a, b) => b.size - a.size)[0];
    if (found) return found.full;
  } catch {
    /* ignore */
  }
  return outputPath;
}

function relatedDownloadFiles(outputPath) {
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (
        f === path.basename(outputPath) ||
        f.startsWith(`${base}.`) ||
        f.startsWith(`${base}.f`)
      ) {
        const full = path.join(dir, f);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) out.push(full);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function deleteRelatedDownloadFiles(outputPath) {
  for (const filePath of relatedDownloadFiles(outputPath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }
}

async function getRemoteVideoInfo(input) {
  const url = String(input || "").trim();
  if (!isHttpUrl(url)) throw new Error("유효한 HTTP(S) 링크가 아닙니다.");
  const bin = await findYtDlp();
  if (!bin) throw new Error("yt-dlp is not available");
  const { stdout } = await runCommand(bin, [
    url,
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
  ]);
  const info = JSON.parse(stdout);
  return {
    id: info.id || "",
    url,
    title: info.title || info.id || url,
    duration: info.duration || 0,
    uploader: info.uploader || info.channel || "",
    thumbnail: info.thumbnail || "",
    ext: info.ext || "mp4",
    service: detectRemoteService(url),
    serviceLabel: serviceLabel(detectRemoteService(url)),
  };
}

async function downloadRemoteVideo(input, outputPath, onProgress) {
  const url = String(input || "").trim();
  if (!isHttpUrl(url)) throw new Error("유효한 HTTP(S) 링크가 아닙니다.");

  const bin = await findYtDlp();
  if (!bin) throw new Error("yt-dlp is not available");

  activeDownload = { cancelled: false, outputPath };
  const outTemplate = outputPath.replace(/\.mp4$/i, "") + ".%(ext)s";
  const ffmpegPath = resolveFfmpegPath();
  let peakPercent = 0;
  const emitProgress = (text) => {
    const lines = String(text || "").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/(\d+(?:\.\d+)?)%/);
      if (match) {
        const pct = Number(match[1]);
        if (Number.isFinite(pct)) {
          peakPercent = Math.max(peakPercent, pct);
          onProgress?.({ percent: peakPercent, message: trimmed });
          continue;
        }
      }
      onProgress?.({
        percent: peakPercent > 0 ? peakPercent : null,
        message: trimmed,
      });
    }
  };

  try {
    await runCommand(bin, [
      url,
      "--dump-single-json",
      "--no-playlist",
      "--no-warnings",
    ]).catch(() => null);

    await runCommand(
      bin,
      [
        url,
        "--no-playlist",
        "--no-warnings",
        "--continue",
        "--retries",
        "8",
        "--fragment-retries",
        "8",
        "--file-access-retries",
        "3",
        "--ffmpeg-location",
        ffmpegPath,
        "-o",
        outTemplate,
        "-f",
        "bestvideo+bestaudio/best",
        "--merge-output-format",
        "mp4",
        "--newline",
        "--progress",
      ],
      {
        onStdout: emitProgress,
        onStderr: emitProgress,
        trackDownload: true,
      },
    );

    const saved = resolveOutputPath(outputPath);
    if (!fs.existsSync(saved) || fs.statSync(saved).size < 1024) {
      throw new Error("Download finished without a usable file");
    }
    return {
      ok: true,
      path: saved,
      name: path.basename(saved),
      size: fs.statSync(saved).size,
      service: detectRemoteService(url),
    };
  } catch (err) {
    if (err?.cancelled || err instanceof RemoteDownloadCancelledError) {
      throw err;
    }
    throw err;
  } finally {
    activeDownload = null;
  }
}

function stopRemoteDownload({ discard = true } = {}) {
  if (!activeDownload) return { ok: false };
  activeDownload.cancelled = true;
  killChild(activeDownload.child);
  if (discard && activeDownload.outputPath) {
    deleteRelatedDownloadFiles(activeDownload.outputPath);
  }
  return { ok: true };
}

module.exports = {
  RemoteDownloadCancelledError,
  isHttpUrl,
  detectRemoteService,
  serviceLabel,
  getRemoteVideoInfo,
  downloadRemoteVideo,
  stopRemoteDownload,
  makeTempOutputPath,
};

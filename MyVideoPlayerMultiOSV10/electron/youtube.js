const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const YT_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/** Clients that often still expose progressive (muxed) MP4 streams. */
const DOWNLOAD_CLIENTS = ['ANDROID', 'MWEB', 'WEB'];

const DOWNLOAD_OPTION_SETS = [
  { type: 'video+audio', quality: 'best', format: 'mp4' },
  { type: 'video+audio', quality: 'bestefficiency', format: 'mp4' },
  { type: 'video+audio', quality: 'best', format: 'any' },
  { type: 'video+audio', quality: '360p', format: 'mp4' },
  { type: 'video+audio', quality: 'bestefficiency', format: 'any' }
];

function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(YT_URL_RE);
  return m ? m[1] : null;
}

function normalizeWatchUrl(input) {
  const id = extractVideoId(input);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function sanitizeFilename(name) {
  return String(name || 'youtube-video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'youtube-video';
}

/** @type {null | {
 *   cancelled: boolean,
 *   keepPartial: boolean,
 *   child?: import('child_process').ChildProcess,
 *   nodeStream?: import('stream').Readable,
 *   writeStream?: import('fs').WriteStream,
 *   outputPath?: string
 * }} */
let activeDownload = null;

class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelledError';
    this.cancelled = true;
  }
}

function isDownloadCancelled() {
  return Boolean(activeDownload?.cancelled);
}

function throwIfCancelled() {
  if (isDownloadCancelled()) throw new DownloadCancelledError();
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore'
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
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
          if (st.isFile() && st.size > 0) out.push({ path: full, size: st.size });
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  out.sort((a, b) => b.size - a.size);
  return out;
}

function deleteRelatedDownloadFiles(outputPath) {
  for (const item of relatedDownloadFiles(outputPath)) {
    try {
      fs.unlinkSync(item.path);
    } catch {
      /* ignore */
    }
  }
}

function remuxToPlayableMp4(inputPath, preferredOutputPath) {
  const { resolveFfmpegPath } = require('./media-compat');
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size < 1024) {
        resolve({ ok: false, path: preferredOutputPath || inputPath });
        return;
      }
    } catch {
      resolve({ ok: false, path: preferredOutputPath || inputPath });
      return;
    }

    const outputPath = preferredOutputPath || inputPath;
    const tmpPath =
      outputPath === inputPath ? `${outputPath}.playable.mp4` : `${outputPath}.tmp.mp4`;
    const ffmpeg = resolveFfmpegPath();
    const child = spawn(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-err_detect',
        'ignore_err',
        '-i',
        inputPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        tmpPath
      ],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
    );

    child.on('close', (code) => {
      try {
        if (code === 0 && fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0) {
          if (fs.existsSync(outputPath) && outputPath !== tmpPath) {
            try {
              fs.unlinkSync(outputPath);
            } catch {
              /* ignore */
            }
          }
          fs.renameSync(tmpPath, outputPath);
          if (inputPath !== outputPath && fs.existsSync(inputPath)) {
            try {
              fs.unlinkSync(inputPath);
            } catch {
              /* ignore */
            }
          }
          resolve({ ok: true, path: outputPath });
          return;
        }
      } catch {
        /* keep original */
      }
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      // Fall back to raw partial if remux fails.
      if (inputPath !== outputPath) {
        try {
          fs.copyFileSync(inputPath, outputPath);
          resolve({
            ok: fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0,
            path: outputPath
          });
          return;
        } catch {
          /* ignore */
        }
      }
      resolve({
        ok: fs.existsSync(inputPath) && fs.statSync(inputPath).size > 0,
        path: inputPath
      });
    });

    child.on('error', () => {
      resolve({
        ok: fs.existsSync(inputPath) && fs.statSync(inputPath).size > 0,
        path: inputPath
      });
    });
  });
}

async function finalizeStoppedDownload(outputPath) {
  await new Promise((r) => setTimeout(r, 350));
  const candidates = relatedDownloadFiles(outputPath).filter((c) => c.size >= 1024);
  if (!candidates.length) return { ok: false, path: outputPath };

  const best = candidates[0];
  const remuxed = await remuxToPlayableMp4(best.path, outputPath);
  if (!remuxed.ok) return { ok: false, path: outputPath };

  // Clean leftover fragment/part files after a successful finalize.
  for (const item of relatedDownloadFiles(outputPath)) {
    if (item.path === remuxed.path) continue;
    try {
      fs.unlinkSync(item.path);
    } catch {
      /* ignore */
    }
  }

  let size = 0;
  try {
    size = fs.statSync(remuxed.path).size;
  } catch {
    size = 0;
  }
  return {
    ok: size > 0,
    path: remuxed.path,
    size,
    name: path.basename(remuxed.path)
  };
}

/**
 * Stop an in-flight YouTube download.
 * - discard:true  → cancel and delete partial files (legacy cancel)
 * - discard:false → keep content so far, finalize to a playable file ("멈춤")
 */
function stopYouTubeDownload(options = {}) {
  const discard = Boolean(options.discard);
  if (!activeDownload) return { ok: false };
  activeDownload.cancelled = true;
  activeDownload.keepPartial = !discard;
  killChild(activeDownload.child);

  if (discard) {
    try {
      activeDownload.nodeStream?.destroy?.(new DownloadCancelledError());
    } catch {
      /* ignore */
    }
    try {
      activeDownload.writeStream?.destroy?.();
    } catch {
      /* ignore */
    }
    if (activeDownload.outputPath) deleteRelatedDownloadFiles(activeDownload.outputPath);
  } else {
    try {
      activeDownload.nodeStream?.destroy?.();
    } catch {
      /* ignore */
    }
    try {
      if (activeDownload.writeStream && !activeDownload.writeStream.destroyed) {
        activeDownload.writeStream.end();
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: true, keepPartial: !discard };
}

/** @deprecated Prefer stopYouTubeDownload({ discard: true|false }) */
function cancelYouTubeDownload(options = {}) {
  // Default discard when called with no args (legacy cancel).
  if (options == null || (typeof options === 'object' && !('discard' in options))) {
    return stopYouTubeDownload({ discard: true });
  }
  return stopYouTubeDownload(options);
}

function runCommand(command, args, { onStdout, onStderr, trackDownload = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false
    });
    if (trackDownload && activeDownload) {
      activeDownload.child = child;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onStdout?.(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (trackDownload && activeDownload) activeDownload.child = undefined;
      if (trackDownload && isDownloadCancelled()) {
        reject(new DownloadCancelledError());
        return;
      }
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });
  });
}

function ytDlpBinaryName() {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function ytDlpCandidatePaths() {
  const name = ytDlpBinaryName();
  const list = [];
  try {
    const { app } = require('electron');
    if (app?.isPackaged) {
      list.push(path.join(process.resourcesPath, 'yt-dlp', name));
    } else if (typeof app?.getAppPath === 'function') {
      list.push(path.join(app.getAppPath(), 'vendor', 'yt-dlp', name));
    }
  } catch {
    /* non-electron / early boot */
  }
  list.push(path.join(__dirname, '..', 'vendor', 'yt-dlp', name));
  list.push(name);
  if (name === 'yt-dlp.exe') list.push('yt-dlp');
  return list;
}

async function findYtDlp() {
  for (const cmd of ytDlpCandidatePaths()) {
    try {
      if (path.isAbsolute(cmd) && !fs.existsSync(cmd)) continue;
      await runCommand(cmd, ['--version']);
      return cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function getInfoWithYtDlp(bin, url) {
  const { stdout } = await runCommand(bin, [
    url,
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--skip-download'
  ]);
  const info = JSON.parse(stdout);
  return {
    id: info.id,
    title: info.title || info.id,
    duration: info.duration || 0,
    uploader: info.uploader || info.channel || '',
    thumbnail: info.thumbnail || '',
    ext: 'mp4'
  };
}

function resolveYtDlpOutput(outputPath) {
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) return outputPath;
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  try {
    const found = fs
      .readdirSync(dir)
      .filter((f) => f === path.basename(outputPath) || f.startsWith(`${base}.`))
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

async function runYtDlpDownload(bin, url, outputPath, onProgress, {
  extraArgs = [],
  format =
    'bestvideo[height<=720]+bestaudio/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio',
  allowContinue = true
} = {}) {
  const outTemplate = outputPath.replace(/\.mp4$/i, '') + '.%(ext)s';
  const { resolveFfmpegPath } = require('./media-compat');
  const ffmpegPath = resolveFfmpegPath();
  // Legacy muxed itag 18 is frequently truncated by YouTube ("0 bytes read, … more expected").
  // Always request separate DASH video+audio — never progressive `18` / `b`.
  const args = [
    url,
    '--no-playlist',
    '--no-warnings',
    ...(allowContinue ? ['--continue'] : ['--no-continue', '--no-part']),
    '--retries',
    '8',
    '--fragment-retries',
    '8',
    '--file-access-retries',
    '3',
    '--ffmpeg-location',
    ffmpegPath,
    '-f',
    format,
    '--merge-output-format',
    'mp4',
    '--print',
    'before_dl:Downloading format %(format_id)s (%(resolution)s)',
    '-o',
    outTemplate,
    '--newline',
    '--progress',
    ...extraArgs
  ];

  // Track the highest percent so UI does not appear to "reset" on yt-dlp retries.
  let peakPercent = 0;
  let refusedFormat18 = false;
  const emitProgress = (text) => {
    throwIfCancelled();
    const lines = String(text || '').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/Downloading format /i.test(trimmed)) {
        onProgress?.({ percent: peakPercent > 0 ? peakPercent : null, message: trimmed });
        continue;
      }
      // Abort if a bad filter ever selects legacy progressive itag 18.
      if (/\bformat\(s\):\s*18\b/i.test(trimmed) || /\bDownloading 1 format\(s\): 18\b/i.test(trimmed)) {
        refusedFormat18 = true;
        if (activeDownload?.child) killChild(activeDownload.child);
        continue;
      }
      const m = trimmed.match(/(\d+(?:\.\d+)?)%/);
      if (m) {
        const pct = Number(m[1]);
        if (Number.isFinite(pct)) {
          peakPercent = Math.max(peakPercent, pct);
          onProgress?.({ percent: peakPercent, message: trimmed });
          continue;
        }
      }
      onProgress?.({ percent: peakPercent > 0 ? peakPercent : null, message: trimmed });
    }
  };

  try {
    await runCommand(bin, args, {
      trackDownload: true,
      onStdout: emitProgress,
      onStderr: emitProgress
    });
  } catch (err) {
    if (refusedFormat18) {
      throw new Error(
        'Refusing broken YouTube progressive format 18. Please retry (adaptive DASH is required).'
      );
    }
    throw err;
  }
  if (refusedFormat18) {
    throw new Error(
      'Refusing broken YouTube progressive format 18. Please retry (adaptive DASH is required).'
    );
  }
  throwIfCancelled();

  const saved = resolveYtDlpOutput(outputPath);
  if (!fs.existsSync(saved) || fs.statSync(saved).size < 1024) {
    throw new Error('yt-dlp finished without a usable file');
  }
  // Guard against truncated progressive leftovers.
  if (fs.statSync(saved).size < 512 * 1024) {
    throw new Error('Downloaded file is too small — YouTube stream was likely truncated. Please retry.');
  }
  return saved;
}

function isTransientYtDlpError(err) {
  const msg = String(err?.message || err || '');
  return /403|Forbidden|0 bytes read|timed out|Temporary failure|Unable to download/i.test(msg);
}

/**
 * Try several DASH format/client strategies. YouTube often returns intermittent 403
 * for a specific signed CDN URL; switching format/client and dropping .part files fixes it.
 */
async function downloadWithYtDlp(bin, url, outputPath, onProgress, options = {}) {
  const cookieFile =
    options.cookiesPath && fs.existsSync(options.cookiesPath) ? options.cookiesPath : null;
  const cookieArgs = cookieFile ? ['--cookies', cookieFile] : [];

  const attempts = [
    {
      label: '720p',
      format: 'bestvideo[height<=720]+bestaudio/bestvideo+bestaudio',
      extra: [...cookieArgs]
    },
    {
      label: '1080p',
      format:
        'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio',
      extra: [...cookieArgs]
    },
    {
      label: 'android_vr',
      format: 'bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio',
      extra: [
        ...cookieArgs,
        '--extractor-args',
        'youtube:player_client=android_vr,web,mweb'
      ]
    },
    {
      label: '720p-fresh',
      format: 'bestvideo[height<=720]+bestaudio/bestvideo+bestaudio',
      extra: [],
      fresh: true
    }
  ];

  let lastError = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    throwIfCancelled();
    if (i > 0 || attempt.fresh) {
      // Drop partials so yt-dlp requests fresh CDN URLs after 403 / truncate.
      try {
        deleteRelatedDownloadFiles(outputPath);
      } catch {
        /* ignore */
      }
    }
    onProgress?.({
      percent: null,
      message: `Downloading (${attempt.label})…`
    });
    try {
      return await runYtDlpDownload(bin, url, outputPath, onProgress, {
        extraArgs: attempt.extra,
        format: attempt.format,
        allowContinue: i === 0 && !attempt.fresh
      });
    } catch (err) {
      if (err?.cancelled || err instanceof DownloadCancelledError) throw err;
      lastError = err;
      onProgress?.({
        percent: null,
        message: isTransientYtDlpError(err)
          ? `CDN blocked (${attempt.label}), trying next…`
          : `Download failed (${attempt.label}), trying next…`
      });
    }
  }

  const detail = lastError?.message || String(lastError || 'unknown error');
  throw new Error(`YouTube download failed for this link.\n${detail}`);
}

let innertubePromise = null;

function installYoutubeJsEvaluator(Platform) {
  if (!Platform?.shim) return;
  // youtubei.js v17 ships a stub evaluator; decipher needs a real JS runtime.
  // Prefer env-based export call; fall back to Player-appended process()/return script.
  Platform.shim.eval = async (data, env = {}) => {
    const output = String(data?.output || '');
    const properties = [];
    if (env?.n) properties.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
    if (env?.sig) properties.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
    if (properties.length && !/return process\(/.test(output)) {
      const code = `${output}\nreturn { ${properties.join(', ')} };`;
      return new Function(code)();
    }
    return new Function(output)();
  };
}

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = (async () => {
      const { Innertube, UniversalCache, Platform } = await import('youtubei.js');
      installYoutubeJsEvaluator(Platform);
      return Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
      });
    })();
  }
  return innertubePromise;
}

async function getInfoWithInnertube(url) {
  const id = extractVideoId(url);
  if (!id) throw new Error('Invalid YouTube URL');
  const yt = await getInnertube();

  let info = null;
  let lastError = null;
  for (const client of DOWNLOAD_CLIENTS) {
    try {
      info = await yt.getBasicInfo(id, { client });
      if (info?.basic_info?.title || info?.streaming_data) break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!info) {
    try {
      info = await yt.getBasicInfo(id);
    } catch (err) {
      throw lastError || err;
    }
  }

  return {
    id,
    title: info.basic_info?.title || id,
    duration: info.basic_info?.duration || 0,
    uploader: info.basic_info?.author || '',
    thumbnail: info.basic_info?.thumbnail?.[0]?.url || '',
    ext: 'mp4'
  };
}

function hasMuxedMp4(info) {
  const formats = [
    ...(info.streaming_data?.formats || []),
    ...(info.streaming_data?.adaptive_formats || [])
  ];
  return formats.some(
    (f) => f.has_audio && f.has_video && String(f.mime_type || '').includes('mp4')
  );
}

async function downloadStreamToFile(stream, outputPath, onProgress) {
  throwIfCancelled();
  const nodeStream = Readable.fromWeb(stream);
  const writeStream = fs.createWriteStream(outputPath);
  if (activeDownload) {
    activeDownload.nodeStream = nodeStream;
    activeDownload.writeStream = writeStream;
    activeDownload.outputPath = outputPath;
  }
  let downloaded = 0;
  nodeStream.on('data', (chunk) => {
    if (isDownloadCancelled()) {
      nodeStream.destroy(new DownloadCancelledError());
      // Keep write stream open when stopping-to-save so bytes already buffered can flush.
      if (!activeDownload?.keepPartial) writeStream.destroy();
      return;
    }
    downloaded += chunk.length;
    onProgress?.({
      percent: null,
      bytes: downloaded,
      message: `Downloaded ${Math.round((downloaded / 1024 / 1024) * 10) / 10} MB`
    });
  });
  try {
    await pipeline(nodeStream, writeStream);
  } catch (err) {
    if (isDownloadCancelled() || err?.cancelled || err instanceof DownloadCancelledError) {
      throw err instanceof DownloadCancelledError ? err : new DownloadCancelledError();
    }
    throw err;
  } finally {
    if (activeDownload) {
      activeDownload.nodeStream = undefined;
      activeDownload.writeStream = undefined;
    }
  }
  throwIfCancelled();
  return outputPath;
}

/**
 * Many videos no longer expose muxed MP4 on the default WEB client.
 * ANDROID / MWEB still often provide progressive itag 18 (360p mp4).
 */
async function downloadWithInnertube(url, outputPath, onProgress) {
  const id = extractVideoId(url);
  if (!id) throw new Error('Invalid YouTube URL');
  const yt = await getInnertube();

  const errors = [];

  for (const client of DOWNLOAD_CLIENTS) {
    let info;
    try {
      info = await yt.getBasicInfo(id, { client });
    } catch (err) {
      errors.push(`${client}: ${err.message || err}`);
      continue;
    }

    if (!info.streaming_data) {
      errors.push(`${client}: no streaming data`);
      continue;
    }

    // Prefer option sets that match available streams.
    const optionSets = hasMuxedMp4(info)
      ? DOWNLOAD_OPTION_SETS
      : DOWNLOAD_OPTION_SETS.filter((o) => o.format === 'any').concat(DOWNLOAD_OPTION_SETS);

    for (const opts of optionSets) {
      try {
        onProgress?.({
          percent: null,
          message: `Downloading (${client}, ${opts.quality}/${opts.format})…`
        });
        const stream = await info.download({ ...opts, client });
        await downloadStreamToFile(stream, outputPath, onProgress);
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          return outputPath;
        }
        errors.push(`${client}/${opts.quality}: empty file`);
      } catch (err) {
        if (err?.cancelled || err instanceof DownloadCancelledError || isDownloadCancelled()) {
          throw err instanceof DownloadCancelledError ? err : new DownloadCancelledError();
        }
        errors.push(`${client}/${opts.quality}/${opts.format}: ${err.message || err}`);
      }
    }
  }

  // Last resort: default client with loose options
  try {
    onProgress?.({ percent: null, message: 'Retrying with default client…' });
    const stream = await yt.download(id, {
      type: 'video+audio',
      quality: 'bestefficiency',
      format: 'any'
    });
    await downloadStreamToFile(stream, outputPath, onProgress);
    return outputPath;
  } catch (err) {
    if (err?.cancelled || err instanceof DownloadCancelledError || isDownloadCancelled()) {
      throw err instanceof DownloadCancelledError ? err : new DownloadCancelledError();
    }
    errors.push(`default: ${err.message || err}`);
  }

  throw new Error(
    'Could not download this YouTube video.\n'
      + 'Tip: sign in to YouTube in Chrome or Edge, then try Save again '
      + '(browser cookies are used automatically when needed).\n\n'
      + errors.slice(0, 8).join('\n')
  );
}

async function getYouTubeInfo(input) {
  const url = normalizeWatchUrl(input);
  if (!url) throw new Error('유효한 YouTube 링크가 아닙니다.');

  const bin = await findYtDlp();
  if (bin) {
    try {
      return { ...await getInfoWithYtDlp(bin, url), url, engine: 'yt-dlp' };
    } catch {
      /* fallback */
    }
  }
  return { ...await getInfoWithInnertube(url), url, engine: 'youtubei.js' };
}

async function downloadYouTube(input, outputPath, onProgress, options = {}) {
  const url = normalizeWatchUrl(input);
  if (!url) throw new Error('유효한 YouTube 링크가 아닙니다.');

  activeDownload = { cancelled: false, keepPartial: false, outputPath };
  let engine = 'youtubei.js';
  try {
    const bin = await findYtDlp();
    if (bin) {
      try {
        throwIfCancelled();
        engine = 'yt-dlp';
        const saved = await downloadWithYtDlp(bin, url, outputPath, onProgress, options);
        throwIfCancelled();
        return { path: saved, engine };
      } catch (err) {
        if (err?.cancelled || err instanceof DownloadCancelledError) throw err;
        // Built-in youtubei.js rarely succeeds when yt-dlp DASH strategies already failed.
        if (options.skipInnertubeFallback !== false) throw err;
        onProgress?.({ percent: null, message: `yt-dlp failed, trying built-in… (${err.message})` });
      }
    } else if (options.skipInnertubeFallback !== false) {
      throw new Error('yt-dlp is not available');
    }

    throwIfCancelled();
    engine = 'youtubei.js';
    const saved = await downloadWithInnertube(url, outputPath, onProgress);
    throwIfCancelled();
    return { path: saved, engine };
  } catch (err) {
    if (err?.cancelled || err instanceof DownloadCancelledError) {
      const keepPartial = Boolean(activeDownload?.keepPartial);
      if (keepPartial) {
        onProgress?.({ percent: null, message: 'Finalizing saved portion…' });
        const finalized = await finalizeStoppedDownload(outputPath);
        if (finalized.ok) {
          return {
            path: finalized.path,
            engine,
            stopped: true,
            partial: true,
            size: finalized.size,
            name: finalized.name
          };
        }
      }
      throw err;
    }
    throw err;
  } finally {
    activeDownload = null;
  }
}

module.exports = {
  extractVideoId,
  normalizeWatchUrl,
  sanitizeFilename,
  getYouTubeInfo,
  downloadYouTube,
  stopYouTubeDownload,
  cancelYouTubeDownload,
  DownloadCancelledError
};

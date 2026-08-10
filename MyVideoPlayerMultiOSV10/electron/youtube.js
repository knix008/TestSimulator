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

function runCommand(command, args, { onStdout, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false
    });
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
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });
  });
}

async function findYtDlp() {
  const candidates = process.platform === 'win32'
    ? ['yt-dlp.exe', 'yt-dlp']
    : ['yt-dlp'];
  for (const cmd of candidates) {
    try {
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
    '--skip-download',
    '--extractor-args',
    'youtube:player_client=android,mweb,web'
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

async function downloadWithYtDlp(bin, url, outputPath, onProgress) {
  const outTemplate = outputPath.replace(/\.mp4$/i, '') + '.%(ext)s';
  const args = [
    url,
    '--no-playlist',
    '--no-warnings',
    '--extractor-args',
    'youtube:player_client=android,mweb,web',
    '-f',
    'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
    '--merge-output-format',
    'mp4',
    '-o',
    outTemplate,
    '--newline',
    '--progress'
  ];

  await runCommand(bin, args, {
    onStdout: (text) => {
      const m = text.match(/(\d+(?:\.\d+)?)%/);
      if (m) onProgress?.({ percent: Number(m[1]), message: text.trim() });
    },
    onStderr: (text) => {
      const m = text.match(/(\d+(?:\.\d+)?)%/);
      if (m) onProgress?.({ percent: Number(m[1]), message: text.trim() });
    }
  });

  if (fs.existsSync(outputPath)) return outputPath;
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  const found = fs.readdirSync(dir).find((f) => f.startsWith(base + '.'));
  if (found) return path.join(dir, found);
  return outputPath;
}

let innertubePromise = null;

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = (async () => {
      const { Innertube, UniversalCache } = await import('youtubei.js');
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
  const nodeStream = Readable.fromWeb(stream);
  let downloaded = 0;
  nodeStream.on('data', (chunk) => {
    downloaded += chunk.length;
    onProgress?.({
      percent: null,
      bytes: downloaded,
      message: `Downloaded ${Math.round((downloaded / 1024 / 1024) * 10) / 10} MB`
    });
  });
  await pipeline(nodeStream, fs.createWriteStream(outputPath));
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
    errors.push(`default: ${err.message || err}`);
  }

  throw new Error(
    'No matching formats found. This video may only offer separate audio/video streams. '
      + 'Install yt-dlp (https://github.com/yt-dlp/yt-dlp) for better download support.\n\n'
      + errors.slice(0, 6).join('\n')
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

async function downloadYouTube(input, outputPath, onProgress) {
  const url = normalizeWatchUrl(input);
  if (!url) throw new Error('유효한 YouTube 링크가 아닙니다.');

  const bin = await findYtDlp();
  if (bin) {
    try {
      const saved = await downloadWithYtDlp(bin, url, outputPath, onProgress);
      return { path: saved, engine: 'yt-dlp' };
    } catch (err) {
      onProgress?.({ percent: null, message: `yt-dlp failed, trying built-in… (${err.message})` });
    }
  }

  const saved = await downloadWithInnertube(url, outputPath, onProgress);
  return { path: saved, engine: 'youtubei.js' };
}

module.exports = {
  extractVideoId,
  normalizeWatchUrl,
  sanitizeFilename,
  getYouTubeInfo,
  downloadYouTube
};

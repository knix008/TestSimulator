'use strict';
/**
 * Shared YouTube / HTTP / RTSP media helpers for the web server (and optionally Electron).
 * Exposes JSON API helpers + HTTP request handling under /api/media/*
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { URL } = require('url');

const YT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
/** Android client UA — matches playable googlevideo URLs from youtubei (VideoPlayer: YoutubeExplode). */
const YT_ANDROID_UA =
  'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip';

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function findFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(cmd, ['ffmpeg'], { encoding: 'utf8' });
    if (r.status === 0) {
      const line = String(r.stdout || '').trim().split(/\r?\n/).find(Boolean);
      if (line && fs.existsSync(line)) return line;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * YouTube resolve via youtubei.js ANDROID client.
 * Mirrors VideoPlayerV10 (YoutubeExplode): muxed highest → video-only highest.
 *
 * Electron 26 embeds Node 18, which cannot parse youtubei.js import attributes
 * (`import x from '…' with { type: 'json' }` → Unexpected token 'with').
 * In that environment we spawn system `node` to run youtube-resolve.mjs.
 */
let _innertubePromise = null;

function isElectronRuntime() {
  return !!process.versions?.electron;
}

function resolveSystemNodeBinary() {
  if (!isElectronRuntime()) return process.execPath;
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const r = spawnSync(cmd, ['node'], { encoding: 'utf8' });
    if (r.status === 0) {
      const line = String(r.stdout || '').trim().split(/\r?\n/).find(Boolean);
      if (line && fs.existsSync(line.trim())) return line.trim();
    }
  } catch { /* ignore */ }
  return 'node';
}

function runYoutubeResolveCli(urlOrId) {
  const cli = path.join(__dirname, 'youtube-resolve.mjs');
  const nodeBin = resolveSystemNodeBinary();
  return new Promise((resolve) => {
    const child = spawn(nodeBin, [cli, String(urlOrId || '')], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => {
      resolve({ ok: false, error: `YouTube resolve worker failed: ${e.message}` });
    });
    child.on('close', () => {
      const raw = stdout.trim();
      if (!raw) {
        resolve({
          ok: false,
          error: stderr.trim() || 'YouTube resolve worker returned empty output',
        });
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({
          ok: false,
          error: stderr.trim() || `Invalid worker JSON: ${raw.slice(0, 200)}`,
        });
      }
    });
  });
}

async function getInnertube() {
  if (isElectronRuntime()) {
    throw new Error('youtubei.js in-process load is disabled under Electron Node 18');
  }
  if (!_innertubePromise) {
    _innertubePromise = (async () => {
      try {
        // youtubei.js is ESM-only — use dynamic import from this CJS module
        const { Innertube, UniversalCache, ClientType } = await import('youtubei.js');
        return await Innertube.create({
          cache: new UniversalCache(false),
          client_type: ClientType.ANDROID,
        });
      } catch (e) {
        console.error('[media-stream] youtubei.js load error:', e.message);
        _innertubePromise = null;
        throw e;
      }
    })();
  }
  return _innertubePromise;
}

function isYouTubeUrl(input) {
  try {
    const uri = new URL(String(input || '').trim());
    const host = uri.hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be');
  } catch {
    return false;
  }
}

function youtubeVideoId(url) {
  try {
    const u = new URL(String(url || '').trim());
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function qualityRank(fmt) {
  const label = parseInt(String(fmt.quality_label || fmt.quality || ''), 10);
  if (Number.isFinite(label)) return label;
  return Number(fmt.bitrate) || 0;
}

/** Same selection order as VideoPlayerV10 TryResolveYouTubeStreamUrlAsync */
function pickYoutubeStream(info) {
  const formats = info?.streaming_data?.formats || [];
  const adaptive = info?.streaming_data?.adaptive_formats || [];
  const muxed = formats
    .filter((f) => f?.url && f.has_video && f.has_audio)
    .sort((a, b) => qualityRank(b) - qualityRank(a));
  if (muxed[0]) return { format: muxed[0], kind: 'muxed' };
  const videoOnly = adaptive
    .filter((f) => f?.url && f.has_video && !f.has_audio)
    .sort((a, b) => qualityRank(b) - qualityRank(a));
  if (videoOnly[0]) return { format: videoOnly[0], kind: 'video' };
  const any = [...formats, ...adaptive].find((f) => f?.url);
  return any ? { format: any, kind: 'any' } : null;
}

function createMediaStreamService({ tmpRoot } = {}) {
  const ffmpegPath = findFfmpeg();
  const streamMap = new Map();
  const rtspSessions = new Map();
  let seq = 0;
  const baseTmp = tmpRoot || path.join(os.tmpdir(), 'av-editor-streams');
  let youtubeReady = true;

  try { fs.mkdirSync(baseTmp, { recursive: true }); } catch { /* ignore */ }

  function nextId(prefix = 's') {
    seq += 1;
    return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
  }

  function capabilities() {
    return {
      youtube: youtubeReady,
      httpProxy: true,
      rtsp: !!ffmpegPath,
      ffmpegPath: ffmpegPath || null,
      resolver: 'youtubei.js (ANDROID) / VideoPlayerV10-style muxed-first',
    };
  }

  function embedResult(url, meta = {}) {
    const videoId = youtubeVideoId(url) || meta.videoId || null;
    if (!videoId) {
      return { ok: false, error: 'Could not resolve YouTube video id for embed fallback' };
    }
    return {
      ok: true,
      playback: 'embed',
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`,
      title: meta.title || url,
      duration: meta.duration || 0,
    };
  }

  async function resolveYoutubeInfo(url) {
    if (!isYouTubeUrl(url)) return { ok: false, error: 'Not a valid YouTube URL' };
    const videoId = youtubeVideoId(url);
    if (!videoId) return { ok: false, error: 'Not a valid YouTube URL' };

    // Electron (Node 18): out-of-process modern Node + youtubei.js
    if (isElectronRuntime()) {
      const cli = await runYoutubeResolveCli(url);
      if (!cli?.ok) return { ok: false, error: cli?.error || 'YouTube resolve failed' };
      return {
        ok: true,
        videoId: cli.videoId || videoId,
        title: cli.title || url,
        duration: Math.round(Number(cli.duration) || 0),
        author: cli.author || '',
        thumbnailUrl: cli.thumbnailUrl
          || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        hasMuxed: !!cli.hasMuxed,
        info: null,
        picked: cli.picked || null,
      };
    }

    try {
      const yt = await getInnertube();
      const info = await yt.getBasicInfo(videoId, 'ANDROID');
      const basic = info.basic_info || {};
      const picked = pickYoutubeStream(info);
      const thumbs = basic.thumbnail || basic.thumbnails || [];
      const thumbList = Array.isArray(thumbs) ? thumbs : (thumbs ? [thumbs] : []);
      const thumbnailUrl = thumbList.slice(-1)[0]?.url
        || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      return {
        ok: true,
        videoId,
        title: basic.title || url,
        duration: Math.round(Number(basic.duration) || 0),
        author: basic.author || basic.channel?.name || '',
        thumbnailUrl,
        hasMuxed: picked?.kind === 'muxed',
        info,
        picked,
      };
    } catch (e) {
      // Fallback if host Node also cannot parse youtubei (e.g. old Node)
      if (/Unexpected token ['"]with['"]/i.test(String(e?.message || e))) {
        console.warn('[media-stream] in-process youtubei failed; using CLI worker');
        const cli = await runYoutubeResolveCli(url);
        if (!cli?.ok) return { ok: false, error: cli?.error || e.message };
        return {
          ok: true,
          videoId: cli.videoId || videoId,
          title: cli.title || url,
          duration: Math.round(Number(cli.duration) || 0),
          author: cli.author || '',
          thumbnailUrl: cli.thumbnailUrl
            || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          hasMuxed: !!cli.hasMuxed,
          info: null,
          picked: cli.picked || null,
        };
      }
      throw e;
    }
  }

  async function youtubeGetInfo(url) {
    try {
      const resolved = await resolveYoutubeInfo(url);
      if (!resolved.ok) return resolved;
      return {
        ok: true,
        title: resolved.title,
        duration: resolved.duration,
        author: resolved.author,
        thumbnailUrl: resolved.thumbnailUrl,
        hasMuxed: resolved.hasMuxed,
      };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  function probeMediaUrl(targetUrl, userAgent = YT_ANDROID_UA) {
    return new Promise((resolve) => {
      let tUrl;
      try { tUrl = new URL(targetUrl); } catch { resolve(false); return; }
      const req = https.request({
        hostname: tUrl.hostname,
        port: 443,
        path: tUrl.pathname + tUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Range: 'bytes=0-2047',
        },
      }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(10000, () => {
        try { req.destroy(); } catch { /* ignore */ }
        resolve(false);
      });
      req.end();
    });
  }

  async function youtubePrepareStream(url) {
    try {
      const resolved = await resolveYoutubeInfo(url);
      if (!resolved.ok) return resolved;
      const meta = {
        videoId: resolved.videoId,
        title: resolved.title,
        duration: resolved.duration,
      };

      const picked = resolved.picked;
      if (!picked?.format?.url) {
        return embedResult(url, meta);
      }

      const formatUrl = picked.format.url;
      const playable = await probeMediaUrl(formatUrl, YT_ANDROID_UA);
      if (!playable) {
        console.warn('[media-stream] YouTube CDN URL not playable; using embed fallback');
        return embedResult(url, meta);
      }

      const mime = picked.format.mime_type || 'video/mp4';
      const id = nextId('yt');
      streamMap.set(id, {
        type: 'youtube',
        formatUrl,
        contentType: mime.split(';')[0] || 'video/mp4',
        userAgent: YT_ANDROID_UA,
        createdAt: Date.now(),
      });
      console.info('[media-stream] yt-prepare', picked.kind, picked.format.itag, picked.format.quality_label || '');
      return {
        ok: true,
        playback: 'proxy',
        streamPath: `/api/media/stream/${id}`,
        formatUrl,
        title: resolved.title,
        duration: resolved.duration,
        videoId: resolved.videoId,
      };
    } catch (e) {
      const embed = embedResult(url, null);
      if (embed.ok) return embed;
      return { ok: false, error: e.message || String(e) };
    }
  }

  function prepareHttpStream(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: 'Only http(s) URLs can be proxied' };
      }
      const id = nextId('http');
      streamMap.set(id, { type: 'http', url, createdAt: Date.now() });
      return { ok: true, streamPath: `/api/media/stream/${id}` };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  function cleanupRtsp(id) {
    const session = rtspSessions.get(id);
    if (!session) return;
    try { session.proc?.kill('SIGKILL'); } catch { /* ignore */ }
    try {
      if (session.dir && fs.existsSync(session.dir)) {
        fs.rmSync(session.dir, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
    rtspSessions.delete(id);
  }

  function waitForFile(filePath, timeoutMs = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
            resolve(true);
            return;
          }
        } catch { /* ignore */ }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Timed out waiting for RTSP HLS playlist'));
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  async function prepareRtspStream(url) {
    if (!ffmpegPath) {
      return {
        ok: false,
        error: 'FFmpeg not found. Install FFmpeg and ensure it is on PATH, or set FFMPEG_PATH.',
      };
    }
    try {
      const u = new URL(url);
      if (u.protocol !== 'rtsp:' && u.protocol !== 'rtsps:') {
        return { ok: false, error: 'Not a valid RTSP URL' };
      }
    } catch {
      return { ok: false, error: 'Not a valid RTSP URL' };
    }

    const id = nextId('rtsp');
    const dir = path.join(baseTmp, id);
    fs.mkdirSync(dir, { recursive: true });
    const playlist = path.join(dir, 'index.m3u8');

    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-rtsp_transport', 'tcp',
      '-i', url,
      '-an', // audio optional — many cameras fail AAC encode; video-only is more reliable
      '-c:v', 'copy',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_allow_cache', '0',
      playlist,
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    proc.on('exit', (code) => {
      if (rtspSessions.has(id)) {
        console.warn(`[media-stream] RTSP ${id} ffmpeg exited ${code}`, stderr.slice(0, 300));
      }
    });

    rtspSessions.set(id, { dir, proc, url, createdAt: Date.now() });

    try {
      await waitForFile(playlist, 20000);
    } catch (e) {
      cleanupRtsp(id);
      const detail = stderr.trim() || e.message;
      return { ok: false, error: `RTSP convert failed: ${detail}` };
    }

    // Idle cleanup after 30 minutes
    setTimeout(() => cleanupRtsp(id), 30 * 60 * 1000);

    return {
      ok: true,
      streamPath: `/api/media/rtsp/${id}/index.m3u8`,
      hls: true,
      title: url,
    };
  }

  function proxyYoutubeUrl(targetUrl, req, res, redirects = 0, userAgent = YT_ANDROID_UA) {
    if (redirects > 5) {
      res.writeHead(502);
      res.end('Too many redirects');
      return;
    }
    let tUrl;
    try { tUrl = new URL(targetUrl); } catch {
      res.writeHead(502);
      res.end('Bad URL');
      return;
    }

    // Android googlevideo URLs: omit Referer/Origin (WEB Referer often → 403)
    const reqHeaders = {
      'User-Agent': userAgent || YT_ANDROID_UA,
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      Connection: 'keep-alive',
    };
    if (req.headers.range) reqHeaders.Range = req.headers.range;

    const pReq = https.request({
      hostname: tUrl.hostname,
      port: 443,
      path: tUrl.pathname + tUrl.search,
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: reqHeaders,
    }, (pRes) => {
      if (pRes.statusCode >= 300 && pRes.statusCode < 400 && pRes.headers.location) {
        pRes.resume();
        proxyYoutubeUrl(pRes.headers.location, req, res, redirects + 1, userAgent);
        return;
      }
      const outHeaders = {
        'Content-Type': pRes.headers['content-type'] || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      };
      if (pRes.headers['content-length']) outHeaders['Content-Length'] = pRes.headers['content-length'];
      if (pRes.headers['content-range']) outHeaders['Content-Range'] = pRes.headers['content-range'];
      res.writeHead(pRes.statusCode, outHeaders);
      if (req.method === 'HEAD') {
        res.end();
        pRes.resume();
        return;
      }
      pRes.pipe(res, { end: true });
      pRes.on('error', () => { if (!res.writableEnded) res.end(); });
    });

    pReq.on('error', (e) => {
      console.error('[media-stream yt]', e.message);
      if (!res.headersSent) res.writeHead(502);
      if (!res.writableEnded) res.end();
    });
    res.on('close', () => pReq.destroy());
    pReq.end();
  }

  function proxyHttpUrl(entry, req, res) {
    let tUrl;
    try { tUrl = new URL(entry.url); } catch {
      res.writeHead(502);
      res.end('Bad URL');
      return;
    }
    const isS = tUrl.protocol === 'https:';
    const lib = isS ? https : http;
    const reqHeaders = {
      'User-Agent': YT_UA,
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      Connection: 'close',
    };
    if (req.headers.range) reqHeaders.Range = req.headers.range;

    const pReq = lib.request({
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      hostname: tUrl.hostname,
      port: parseInt(tUrl.port, 10) || (isS ? 443 : 80),
      path: tUrl.pathname + tUrl.search,
      headers: reqHeaders,
    }, (pRes) => {
      const outHeaders = {
        'Content-Type': pRes.headers['content-type'] || entry.contentType || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      };
      if (pRes.headers['content-length']) outHeaders['Content-Length'] = pRes.headers['content-length'];
      if (pRes.headers['content-range']) outHeaders['Content-Range'] = pRes.headers['content-range'];
      res.writeHead(pRes.statusCode, outHeaders);
      if (req.method === 'HEAD') {
        res.end();
        pRes.resume();
        return;
      }
      pRes.pipe(res, { end: true });
      pRes.on('error', () => { if (!res.writableEnded) res.end(); });
    });

    pReq.on('error', (e) => {
      console.error('[media-stream http]', e.message);
      if (!res.headersSent) res.writeHead(502);
      if (!res.writableEnded) res.end();
    });
    res.on('close', () => pReq.destroy());
    pReq.end();
  }

  function serveStream(id, req, res) {
    const entry = streamMap.get(id);
    if (!entry) {
      res.writeHead(404);
      res.end('Unknown stream');
      return;
    }
    if (entry.type === 'youtube') {
      proxyYoutubeUrl(entry.formatUrl, req, res, 0, entry.userAgent || YT_ANDROID_UA);
    } else {
      proxyHttpUrl(entry, req, res);
    }
  }

  function safeRtspFile(sessionDir, rel) {
    const parts = String(rel || '').split(/[/\\]+/).filter((p) => p && p !== '.' && p !== '..');
    if (!parts.length) return null;
    const file = path.resolve(path.join(sessionDir, ...parts));
    const root = path.resolve(sessionDir);
    const relTo = path.relative(root, file);
    if (!relTo || relTo.startsWith('..') || path.isAbsolute(relTo)) return null;
    return file;
  }

  function serveRtspFile(id, rel, req, res) {
    const session = rtspSessions.get(id);
    if (!session) {
      res.writeHead(404);
      res.end('Unknown RTSP session');
      return;
    }
    const file = safeRtspFile(session.dir, rel || 'index.m3u8');
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('Segment not ready');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = ext === '.m3u8'
      ? 'application/vnd.apple.mpegurl'
      : ext === '.ts'
        ? 'video/mp2t'
        : 'application/octet-stream';
    const buf = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  async function youtubeDownloadToResponse(url, res) {
    try {
      const resolved = await resolveYoutubeInfo(url);
      if (!resolved.ok) {
        sendJson(res, 400, resolved);
        return;
      }
      const picked = resolved.picked;
      if (!picked?.format?.url) {
        sendJson(res, 400, { ok: false, error: 'No downloadable stream found' });
        return;
      }
      const title = (resolved.title || 'youtube')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'youtube';
      const mime = picked.format.mime_type || 'video/mp4';
      const ext = mime.includes('webm') ? 'webm' : 'mp4';
      const filename = `${title}.${ext}`;
      const formatUrl = picked.format.url;

      res.writeHead(200, {
        'Content-Type': mime.split(';')[0] || `video/${ext}`,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'X-AV-Filename': encodeURIComponent(filename),
      });

      const tUrl = new URL(formatUrl);
      const pReq = https.request({
        hostname: tUrl.hostname,
        port: 443,
        path: tUrl.pathname + tUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': YT_ANDROID_UA,
          Accept: '*/*',
          'Accept-Encoding': 'identity',
        },
      }, (pRes) => {
        if (pRes.statusCode >= 300 && pRes.statusCode < 400 && pRes.headers.location) {
          pRes.resume();
          // follow one redirect via recursive re-queue is rare; pipe error instead
          sendJson(res, 502, { ok: false, error: 'Unexpected redirect during download' });
          return;
        }
        if (pRes.statusCode >= 400) {
          pRes.resume();
          if (!res.writableEnded) res.end();
          return;
        }
        pRes.pipe(res, { end: true });
        pRes.on('error', () => { if (!res.writableEnded) res.end(); });
      });
      pReq.on('error', (e) => {
        console.error('[media-stream download]', e.message);
        if (!res.headersSent) sendJson(res, 502, { ok: false, error: e.message });
        else if (!res.writableEnded) res.end();
      });
      res.on('close', () => pReq.destroy());
      pReq.end();
    } catch (e) {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: e.message || String(e) });
      else if (!res.writableEnded) res.end();
    }
  }

  /**
   * @returns {boolean} true if the request was handled
   */
  async function handleRequest(req, res, hostForUrl = '127.0.0.1', port = 4173) {
    const incoming = new URL(req.url || '/', `http://${hostForUrl}:${port}`);
    const pathname = incoming.pathname;

    if (!pathname.startsWith('/api/media')) return false;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
      });
      res.end();
      return true;
    }

    if (pathname === '/api/media/capabilities' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, ...capabilities() });
      return true;
    }

    if (pathname === '/api/media/youtube/info' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, await youtubeGetInfo(body.url || ''));
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message || String(e) });
      }
      return true;
    }

    if (pathname === '/api/media/youtube/prepare' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, await youtubePrepareStream(body.url || ''));
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message || String(e) });
      }
      return true;
    }

    if (pathname === '/api/media/http/prepare' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, prepareHttpStream(body.url || ''));
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message || String(e) });
      }
      return true;
    }

    if (pathname === '/api/media/rtsp/prepare' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, await prepareRtspStream(body.url || ''));
      } catch (e) {
        sendJson(res, 400, { ok: false, error: e.message || String(e) });
      }
      return true;
    }

    if (pathname === '/api/media/youtube/download' && (req.method === 'GET' || req.method === 'POST')) {
      let url = incoming.searchParams.get('url') || '';
      if (!url && req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          url = body.url || '';
        } catch { /* ignore */ }
      }
      await youtubeDownloadToResponse(url, res);
      return true;
    }

    const streamMatch = pathname.match(/^\/api\/media\/stream\/([^/]+)$/);
    if (streamMatch && (req.method === 'GET' || req.method === 'HEAD')) {
      serveStream(decodeURIComponent(streamMatch[1]), req, res);
      return true;
    }

    const rtspMatch = pathname.match(/^\/api\/media\/rtsp\/([^/]+)\/(.+)$/);
    if (rtspMatch && (req.method === 'GET' || req.method === 'HEAD')) {
      serveRtspFile(decodeURIComponent(rtspMatch[1]), decodeURIComponent(rtspMatch[2]), req, res);
      return true;
    }

    sendJson(res, 404, { ok: false, error: 'Unknown media API route' });
    return true;
  }

  return {
    capabilities,
    youtubeGetInfo,
    youtubePrepareStream,
    prepareHttpStream,
    prepareRtspStream,
    handleRequest,
    cleanupRtsp,
    get ffmpegPath() { return ffmpegPath; },
  };
}

module.exports = { createMediaStreamService, findFfmpeg, isYouTubeUrl, youtubeVideoId };
